// La police Marianne pour le PDF (extension « polices », qu'active GFS seul ; retour du 11/11 d'un agent de l'État dont le PDF retombait sur Roboto).
//  - Marianne est la police de l'État. Ses fichiers sont ceux du Système de Design de l'État (DSFR), dont la licence les écarte de la Licence ouverte et en réserve l'usage à l'administration :
//    ils ne sont PAS dans ce dépôt. Ils ne sont lus qu'au moment où la personne, devant la fenêtre « Polices du document » (js/pdf-font-plan.js), déclare avoir le droit de s'en servir, puis
//    posés dans pdfMake le temps de la session (rien n'est écrit sur le disque ni dans le document).
//  - Les quatre fichiers viennent de jsDelivr, à la version du DSFR figée ci-dessous, et chacun est vérifié contre son empreinte SHA-384 avant d'entrer dans le PDF : un fichier changé ou
//    remplacé est refusé.
//  - Les fichiers sont des WOFF, lus, vérifiés et rendus en TrueType par extensions/polices/woff.js (PolicesWoff), avec le repli de glyphes en vue.
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
  let ready = false;
  let loading = null;

  const fetchOne = (style, fetcher, hashes) => PolicesWoff.fetchVerified(BASE + FILES[style].remote, hashes && hashes[style] ? hashes[style] : FILES[style].hash, fetcher);

  function load(pdfMake, options) {
    if (ready) return Promise.resolve({ ok: true });
    if (!pdfMake || !pdfMake.vfs) return Promise.resolve({ ok: false, reason: 'engine' });
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
  return { FAMILY, VERSION, FILES, load, isReady: () => ready, woffToSfnt: bytes => PolicesWoff.woffToSfnt(bytes), forget() { ready = false; loading = null; } };
})();
