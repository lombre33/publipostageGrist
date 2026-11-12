// La police Marianne pour le PDF (extension « polices », qu'active GFS seul ; retour du 11/11 d'un agent de l'État dont le PDF retombait sur Roboto).
//  - Marianne est la police de l'État. Ses fichiers sont ceux du Système de Design de l'État (DSFR), dont la licence les écarte de la Licence ouverte et en réserve l'usage à l'administration :
//    ils ne sont PAS dans ce dépôt. Ils ne sont lus qu'au moment où la personne, devant la fenêtre « Polices du document » (js/pdf-font-plan.js), déclare avoir le droit de s'en servir, puis
//    posés dans pdfMake le temps de la session (rien n'est écrit sur le disque ni dans le document).
//  - Les quatre fichiers viennent de jsDelivr, à la version du DSFR figée ci-dessous, et chacun est vérifié contre son empreinte SHA-384 avant d'entrer dans le PDF : un fichier changé ou
//    remplacé est refusé.
//  - Les fichiers sont des WOFF (tables compressées). pdfMake embarque un sous-ensemble du fichier (le PDF reste léger), et le repli de police par caractère (js/pdf-glyph-fallback.js) lit la
//    table `cmap` d'un fichier TrueType : le WOFF est donc rendu en TrueType ici (chaque table décompressée, rangée dans l'ordre), sans rien changer à ses glyphes.
//    PolicesMarianne.load(pdfMake, { fetcher, hashes }) -> Promise<{ ok: true } | { ok: false, reason }>
//      reason : 'engine' (pdfMake absent), 'network' (un fichier ne vient pas), 'integrity' (l'empreinte ne correspond pas), 'format' (ce n'est pas un WOFF lisible, ou le navigateur ne sait pas
//      le décompresser).
//    `fetcher` et `hashes` ne servent qu'aux essais (un faux serveur, des empreintes à eux).
const PolicesMarianne = (function () {
  const VERSION = '1.15.4';
  const BASE = 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@' + VERSION + '/dist/fonts/';
  // Les quatre graisses : le nom du fichier du DSFR, le nom du fichier dans pdfMake.vfs et l'empreinte du fichier du DSFR.
  const FILES = {
    normal: { remote: 'Marianne-Regular.woff', local: 'Marianne-Regular.ttf', hash: 'sha384-Og8ZzVUmcxkNZKylqcVL75lV9vz/+IgoxKdrld7MkPso5Xsbngoj1tOvNkv/UFoP' },
    bold: { remote: 'Marianne-Bold.woff', local: 'Marianne-Bold.ttf', hash: 'sha384-C8L6VH2P+nkZhrPvhvn1w064oVJtj+d9k+DW2SImVr4rosN38nojN3F7EHU9V4j2' },
    italics: { remote: 'Marianne-Regular_Italic.woff', local: 'Marianne-Italic.ttf', hash: 'sha384-ro+BYQZ88j4QD41+ipvE4nMuiE2Xh8GkryLVkwI6tY+Ujl35tei8NIlglae36/Po' },
    bolditalics: { remote: 'Marianne-Bold_Italic.woff', local: 'Marianne-BoldItalic.ttf', hash: 'sha384-BBURN9VuEUGex63jY7s4Kbl9aVZyJyKSiIIG8/poHiKN2J3vrpgFVtjydijmM/Nu' },
  };
  const FAMILY = 'Marianne';
  // La table de signature numérique n'a plus de sens une fois le fichier réécrit : elle n'est pas reprise.
  const DROPPED = new Set(['DSIG']);

  let ready = false;
  let loading = null;

  const fail = reason => ({ ok: false, reason });
  const tagOf = (view, at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

  function base64Of(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }

  // Les octets d'une table zlib (celle d'un WOFF) décompressés par le navigateur.
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream absent');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Un WOFF 1.0 rendu en fichier TrueType (sfnt) : l'en-tête, le répertoire des tables (rangé par nom, comme le veut le format) puis chaque table décompressée, alignée sur 4 octets.
  async function woffToSfnt(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 44 || tagOf(view, 0) !== 'wOFF') throw new Error('pas un WOFF');
    const flavor = view.getUint32(4);
    const count = view.getUint16(12);
    const tables = [];
    for (let i = 0; i < count; i++) {
      const at = 44 + i * 20;
      const tag = tagOf(view, at);
      if (DROPPED.has(tag)) continue;
      const offset = view.getUint32(at + 4);
      const packed = view.getUint32(at + 8);
      const length = view.getUint32(at + 12);
      if (offset + packed > bytes.length) throw new Error('table hors du fichier');
      const raw = bytes.subarray(offset, offset + packed);
      const body = packed < length ? await inflate(raw) : raw;
      if (body.length !== length) throw new Error('table de taille inattendue : ' + tag);
      tables.push({ tag, body, checksum: view.getUint32(at + 16) });
    }
    tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    const n = tables.length;
    let power = 1;
    let log = 0;
    while (power * 2 <= n) { power *= 2; log++; }
    const directoryEnd = 12 + n * 16;
    let total = directoryEnd;
    tables.forEach((t) => { t.at = total; total += (t.body.length + 3) & ~3; });
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, flavor);
    dv.setUint16(4, n);
    dv.setUint16(6, power * 16);
    dv.setUint16(8, log);
    dv.setUint16(10, n * 16 - power * 16);
    tables.forEach((t, i) => {
      const at = 12 + i * 16;
      for (let k = 0; k < 4; k++) out[at + k] = t.tag.charCodeAt(k);
      dv.setUint32(at + 4, t.checksum);
      dv.setUint32(at + 8, t.at);
      dv.setUint32(at + 12, t.body.length);
      out.set(t.body, t.at);
    });
    return out;
  }

  async function digestOf(bytes) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes));
    return 'sha384-' + btoa(String.fromCharCode.apply(null, hash));
  }

  async function fetchOne(style, fetcher, hashes) {
    const file = FILES[style];
    let bytes;
    try {
      const response = await fetcher(BASE + file.remote, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) return fail('network');
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) { return fail('network'); }
    let digest;
    try { digest = await digestOf(bytes); } catch (e) { return fail('engine'); }
    if (digest !== (hashes && hashes[style] ? hashes[style] : file.hash)) return fail('integrity');
    try { return { ok: true, base64: base64Of(await woffToSfnt(bytes)) }; } catch (e) { return fail('format'); }
  }

  function load(pdfMake, options) {
    if (ready) return Promise.resolve({ ok: true });
    if (!pdfMake || !pdfMake.vfs) return Promise.resolve(fail('engine'));
    if (!loading) {
      const { fetcher, hashes } = options || {};
      const get = fetcher || ((url, init) => fetch(url, init));
      loading = Promise.all(Object.keys(FILES).map(style => fetchOne(style, get, hashes))).then((results) => {
        const bad = results.find(result => !result.ok);
        if (bad) return bad;
        const fonts = {};
        Object.keys(FILES).forEach((style, i) => {
          pdfMake.vfs[FILES[style].local] = results[i].base64;
          fonts[style] = FILES[style].local;
        });
        if (!pdfMake.fonts) pdfMake.fonts = {};
        pdfMake.fonts[FAMILY] = fonts;
        ready = true;
        return { ok: true };
      }).then((result) => { loading = null; return result; }, (e) => { loading = null; throw e; });
    }
    return loading;
  }

  // `forget` ne sert qu'aux essais : repartir d'une session où rien n'a été chargé.
  return { FAMILY, VERSION, FILES, load, isReady: () => ready, woffToSfnt, forget() { ready = false; loading = null; } };
})();
