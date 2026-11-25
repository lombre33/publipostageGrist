// Les bibliothèques natives de l'app, rangées par fonction, et d'où chacune se charge : la copie figée que GFS en garde, quand la personne l'a choisie pour la fonction (consigne 065, contrats de GFS 2.6 point 14
// et 5.2 point 12), sinon le CDN que la politique de sécurité de index.html nomme déjà. Une bibliothèque « native » est une de celles de la liste unique de l'app (package.json) que son code charge lui-même au
// premier usage : les exports PDF, Word et Excel, l'archive ZIP, l'assemblage de PDF, l'import Markdown et le QR code. Celles des extensions (Plotly, ECharts, PDF.js…) sont à GFS (js/extensions.js) et l'éditeur
// a sa copie dans le dépôt (vendor/editeur) : rien de tout cela ne passe ici.
//
// La règle, fonction par fonction, tout ou rien :
//  - GfsLink.native(id) rend la copie figée de GFS ({ version, src, integrite, forme }) ou null : seule, avec un GFS d'avant, ou quand la personne a laissé la fonction au CDN (le défaut) ;
//  - si CHAQUE bibliothèque de la fonction a une copie dont la `version` est celle de la liste de l'app, chacune se charge par sa copie (<script src integrity crossorigin="anonymous">, l'empreinte telle que GFS la donne) ;
//  - sinon TOUT se charge par le CDN écrit plus bas. GFS ne donne jamais l'adresse d'un CDN : la politique de sécurité de la page ne change pas, et la copie de GFS passe par `'self'` ;
//  - une copie qui ne se charge pas (réseau, fausse empreinte, origine refusée) retombe sur le CDN, et la personne le lit dans le coin d'état : l'événement `pp:nativeFallback`, que js/main.js dit ; jamais en silence ;
//  - l'autre sens (consigne 108) : une bibliothèque qui se charge par le CDN, et dont GFS garde une copie de la MÊME version (GfsLink.secours), se charge par cette copie quand le CDN échoue ou ne répond pas en 3 secondes
//    (le chargeur du kit, dans ExportCommon.loadScriptOnce) : jamais un deuxième CDN, et rien à dire à la personne (la fonction marche) ;
//  - un choix qui change en cours de route (l'événement `extensions` de GFS) ne touche pas ce qui est déjà chargé : il vaut au prochain chargement de la fonction, sans recharger l'app.
// Le script lui-même est posé par ExportCommon.loadScriptOnce, la seule porte des scripts (origine permise, empreinte vérifiée par le navigateur). Pour monter une version : package.json puis `node kit/outils/bibliotheques.mjs`
// (le catalogue, la politique et l'empreinte écrite ici), puis la version et l'adresse écrites ici, et le dire à GFS dans « Changements qui touchent GFS » de GFS-ETAT.md : dev-tests/verify-code-hygiene.mjs compare ce tableau
// à la liste et au catalogue.
const NativeLibs = (function () {
  // Les sept fonctions que le porteur a choisies le 18/11 (consigne 076) : ce que le code charge ensemble, au même geste, tout ou rien ; chaque bibliothèque n'est que dans une. Les identifiants sont ceux du manifeste de GFS ;
  // les noms que la personne lit sont dans js/i18n-texts-export.js (`native.function.<id>`).
  const FUNCTIONS = {
    'pdf': ['pdfmake', 'pdfmake-polices'],
    'pdf-assemblage': ['pdf-lib'],
    'zip': ['jszip'],
    'word': ['docx', 'docx-charts'],
    'excel': ['exceljs'],
    'markdown': ['marked'],
    'qr': ['qrcode-generator'],
  };

  // Chaque bibliothèque : la version de la liste (package.json), le fichier de son CDN et l'empreinte (SRI sha384) que l'outil du kit reporte depuis le catalogue ; recalculée, au besoin, par
  // `curl -s <adresse> | openssl dgst -sha384 -binary | openssl base64 -A`. Une copie de GFS ne se charge que si sa version est exactement celle-ci.
  const LIBRARIES = {
    'pdfmake': { version: '0.2.7', cdn: { src: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/pdfmake.min.js', integrity: 'sha384-VFQrHzqBh5qiJIU0uGU5CIW3+OWpdGGJM9LBnGbuIH2mkICcFZ7lPd/AAtI7SNf7' } },
    'pdfmake-polices': { version: '0.2.7', cdn: { src: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/vfs_fonts.js', integrity: 'sha384-go03OGrgP7enVgJF/9UK2k6D5xW+f7Vq1WHLp75VqnMN5uu+CZDXu7uGjjzZReI5' } },
    'pdf-lib': { version: '1.17.1', cdn: { src: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI' } },
    'jszip': { version: '3.10.1', cdn: { src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG' } },
    'docx': { version: '9.15.1', cdn: { src: 'https://cdn.jsdelivr.net/npm/docx@9.15.1/dist/index.iife.js', integrity: 'sha384-ud8085E8t6iW4uUom5nN5cpzTZ4OdsNKB/AKWfOsI62tzsoV2X7r7/o4KWESO8rq' } },
    'docx-charts': { version: '9.15.1', cdn: { src: 'https://cdn.jsdelivr.net/npm/docx@9.15.1/dist/charts.iife.js', integrity: 'sha384-PFbg0J+cwbPG1He8zpFvlw/uXmHMA3ea3Gyyw9aS2IIjX0zKpD7YeprlCNVCMs1Y' } },
    'exceljs': { version: '4.4.0', cdn: { src: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', integrity: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz' } },
    'marked': { version: '15.0.12', cdn: { src: 'https://cdn.jsdelivr.net/npm/marked@15.0.12/marked.min.js', integrity: 'sha384-948ahk4ZmxYVYOc+rxN1H2gM1EJ2Duhp7uHtZ4WSLkV4Vtx5MUqnV+l7u9B+jFv+' } },
    'qrcode-generator': { version: '1.4.4', cdn: { src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', integrity: 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k' } },
  };

  const FUNCTION_OF = {};
  Object.keys(FUNCTIONS).forEach(fn => FUNCTIONS[fn].forEach((id) => { FUNCTION_OF[id] = fn; }));

  const functionOf = id => (Object.prototype.hasOwnProperty.call(FUNCTION_OF, id) ? FUNCTION_OF[id] : null);
  const functions = () => Object.keys(FUNCTIONS);
  const librariesOf = fn => (Object.prototype.hasOwnProperty.call(FUNCTIONS, fn) ? FUNCTIONS[fn].slice() : []);
  const versionOf = id => (Object.prototype.hasOwnProperty.call(LIBRARIES, id) ? LIBRARIES[id].version : null);
  const cdnOf = id => (Object.prototype.hasOwnProperty.call(LIBRARIES, id) ? { src: LIBRARIES[id].cdn.src, integrity: LIBRARIES[id].cdn.integrity } : null);

  const copyOf = id => (typeof GfsLink !== 'undefined' && GfsLink && typeof GfsLink.native === 'function' ? GfsLink.native(id) : null);
  // L'autre sens (consigne 108 de GFS) : la bibliothèque est au CDN, et GFS en garde une copie de la MÊME version, qu'il donne comme secours (GfsLink.secours, `null` : un GFS d'avant, l'app seule, une autre version : elle ne vaut
  // pas celle de la liste) et de forme `script` (ces neuf fichiers sont des scripts classiques : une copie « module » ne vaut pas non plus, comme pour la copie figée). ExportCommon.loadScriptOnce l'essaie après le CDN quand
  // il échoue ou ne répond pas en 3 secondes ; la personne n'a rien choisi, rien n'est dit.
  const spareOf = (id) => {
    const spare = typeof GfsLink !== 'undefined' && GfsLink && typeof GfsLink.secours === 'function' ? GfsLink.secours(id, versionOf(id)) : null;
    return spare && spare.forme === 'script' ? spare : null;
  };

  // Ce que la personne a choisi pour la fonction `fn`, lu maintenant, et ce que l'app en fait :
  //  - { source: 'cdn', say: null }     aucune bibliothèque de la fonction n'a de copie : le CDN, le défaut (ou une app seule, ou un GFS d'avant) ;
  //  - { source: 'copie', copies }      chacune a une copie de la version de la liste, de forme `script` : `copies` (id -> { src, integrite }) ;
  //  - { source: 'cdn', say: 'ecart' }  la personne a choisi la copie, mais l'une manque, ou n'est pas à la version de la liste (une copie en retard chez GFS) : le CDN, pour toutes, et la phrase.
  function decide(fn) {
    const ids = librariesOf(fn);
    const given = ids.map(id => [id, copyOf(id)]);
    if (!given.length || given.every(([, copy]) => !copy)) return { source: 'cdn', say: null };
    const whole = given.every(([id, copy]) => copy && copy.version === versionOf(id) && copy.forme === 'script');
    if (!whole) return { source: 'cdn', say: 'ecart' };
    return { source: 'copie', say: null, copies: new Map(given.map(([id, copy]) => [id, { src: copy.src, integrite: copy.integrite }])) };
  }

  // Dit à la page (js/main.js l'écrit dans le coin d'état) que la copie de GFS n'a pas servi : `reason` est `ecart` ou `echec`, `library` la bibliothèque dont la copie n'a pas chargé (`echec`).
  function announce(fn, reason, library) {
    if (typeof document === 'undefined' || !document || typeof document.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
    document.dispatchEvent(new CustomEvent('pp:nativeFallback', { detail: { fonction: fn, raison: reason, bibliotheque: library || null } }));
  }

  // Charge les bibliothèques `ids`, dans l'ordre, d'UNE même fonction : la décision se prend une fois, à l'appel, et vaut pour toutes (un choix qui change entre deux fichiers n'en mélange pas). Résolu quand toutes sont là ;
  // rejeté avec l'erreur du CDN quand même lui ne les donne pas (le chargeur appelant la dit comme avant). L'appelant garde sa promesse : une bibliothèque ne se charge qu'une fois par page, et un nouveau choix vaut
  // au chargement suivant. Une copie en échec fait charger le reste de cet appel par le CDN (le réseau de GFS ne répond pas : inutile de le reprendre fichier par fichier).
  async function load(...ids) {
    const fn = ids.length ? functionOf(ids[0]) : null;
    if (!fn || ids.some(id => functionOf(id) !== fn)) throw new Error('Bibliothèque native inconnue, ou de fonctions différentes : ' + ids.join(', '));
    let decision = decide(fn);
    if (decision.say) announce(fn, decision.say, null);
    let failed = null;   // l'adresse de la copie choisie qui vient d'échouer : le secours du CDN ne la reprend pas (le même fichier, la même réponse)
    for (const id of ids) {
      const copy = decision.source === 'copie' ? decision.copies.get(id) : null;
      if (copy) {
        try {
          await ExportCommon.loadScriptOnce({ src: copy.src, integrity: copy.integrite });
          continue;
        } catch (e) {
          decision = { source: 'cdn', say: 'echec' };
          failed = copy.src;
          announce(fn, 'echec', id);
        }
      }
      const spare = spareOf(id);
      await ExportCommon.loadScriptOnce(cdnOf(id), spare && spare.src !== failed ? spare : null);
    }
  }

  return { load, decide, functions, librariesOf, functionOf, versionOf, cdnOf };
})();
