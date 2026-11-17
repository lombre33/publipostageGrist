// Lire une police WOFF chez un CDN et la rendre à pdfMake (extension « polices », qu'active GFS seul) : ce que partagent la police Marianne (marianne.js) et les polices libres (libres.js).
//  - Le fichier lu est comparé à son empreinte SHA-384 AVANT toute autre chose : un fichier changé ou remplacé est refusé, rien n'entre dans pdfMake.
//  - Les fichiers sont des WOFF (tables compressées). pdfMake embarque un sous-ensemble du fichier (le PDF reste léger), et le repli de police par caractère (js/pdf-glyph-fallback.js) lit la
//    table `cmap` d'un fichier TrueType : le WOFF est donc rendu en TrueType ici (chaque table décompressée, rangée dans l'ordre), sans rien changer à ses glyphes.
//    PolicesWoff.fetchVerified(url, hash, fetcher) -> Promise<{ ok: true, base64 } | { ok: false, reason }>   base64 : le fichier TrueType.
//      reason : 'engine' (le navigateur ne sait pas calculer l'empreinte), 'network' (le fichier ne vient pas), 'integrity' (l'empreinte ne correspond pas), 'format' (ce n'est pas un WOFF lisible, ou
//      le navigateur ne sait pas le décompresser).
const PolicesWoff = (function () {
  // La table de signature numérique n'a plus de sens une fois le fichier réécrit : elle n'est pas reprise.
  const DROPPED = new Set(['DSIG']);

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

  async function fetchVerified(url, expected, fetcher) {
    let bytes;
    try {
      const response = await fetcher(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) return fail('network');
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) { return fail('network'); }
    let digest;
    try { digest = await digestOf(bytes); } catch (e) { return fail('engine'); }
    if (digest !== expected) return fail('integrity');
    try { return { ok: true, base64: base64Of(await woffToSfnt(bytes)) }; } catch (e) { return fail('format'); }
  }

  return { woffToSfnt, fetchVerified };
})();
