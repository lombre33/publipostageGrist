// L'ENREGISTREUR des imports Word et PowerPoint (dev-tests/verify-ooxml-import-golden.mjs le pose par `run-headless.mjs --preseed`, puis lit `window.__collected` par `--collect`).
// Chaque appel de `DocxImport.fromBuffer` et de `PptxImport.fromBuffer` d'un groupe d'essais range, SANS changer ce que le groupe voit, ce que l'import a rendu : { clé de ce qu'il a lu -> sortie }.
//  - La CLÉ est l'empreinte du CONTENU du paquet (chaque partie défaite, rangée par nom, hors `docProps/` : l'horodatage du zip et la date de création changent à chaque écriture, pas le contenu) et des réglages d'appel qui ne sont pas des fonctions.
//  - La SORTIE est le JSON de ce que l'import rend (ou le `code` de son refus), où les images en base64 sont réduites à leur type : un encodeur de navigateur plus récent n'écrit pas les mêmes octets.
// L'enregistrement se fait APRÈS l'import, en tâche de fond : il ne compte ni dans la durée de l'appel ni dans l'ordre de ce que le cas attend. `__collectedReady` dit quand tout est rangé.
(function () {
  const pending = [];
  window.__collected = {};
  window.__collectedReady = { then: (ok, no) => Promise.all(pending).then(ok, no) };
  const hex = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const encoder = new TextEncoder();
  // Le DÉTAIL du compte rendu d'un import PowerPoint (`places`, `objects`, `labels`, `moreObjects`, `moreLabels` d'une ligne { key, n } : où et quoi, 11/11) n'entre pas dans le hachage : la référence fige ce que l'import ÉCRIT
  // (le HTML, la page, les comptes du rapport), pas les mots que le compte rendu met sur ce qu'il n'a pas repris ; ces mots ont leurs essais (groupe pptxImport, `pptx_import_report_detail_*`).
  const DETAIL_KEYS = /^(places|objects|labels|moreObjects|moreLabels)$/;
  const normalize = (value) => JSON.stringify(value, function (key, v) {
    if (DETAIL_KEYS.test(key) && this && typeof this.key === 'string' && 'n' in this) return undefined;
    return v instanceof Map ? { map: Array.from(v) } : v instanceof Set ? { set: Array.from(v) } : v instanceof ArrayBuffer ? { bytes: v.byteLength } : v;
  })
    .replace(/data:(image\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/=]+/g, 'data:$1;base64,#')
    .replace(/\b(fn|cm|en)-[a-z0-9]{8,}\b/g, '$1-#');
  async function keyOf(kind, buffer, options) {
    const parts = [];
    try {
      const zip = await JSZip.loadAsync(buffer);
      // docProps/ (la date de création du paquet) change à chaque écriture : hors de la clé.
      const names = Object.keys(zip.files).filter(name => !zip.files[name].dir && !/^docProps\//.test(name)).sort();
      for (const name of names) parts.push(name + ':' + (await hex(await zip.file(name).async('uint8array'))).slice(0, 12));
    } catch (e) {
      parts.push('raw:' + (await hex(buffer)).slice(0, 12));
    }
    const extra = options ? JSON.stringify(options, (k, v) => (typeof v === 'function' ? undefined : v)) : '';
    return { key: kind + '-' + (await hex(encoder.encode(parts.join('\n') + '\n' + extra))).slice(0, 24), parts };
  }
  function wrap(kind, engine) {
    if (!engine || engine.fromBuffer.__recorded) return;
    const original = engine.fromBuffer;
    engine.fromBuffer = async function (buffer, options) {
      let output;
      let failure = null;
      try {
        output = await original.apply(this, arguments);
        return output;
      } catch (e) {
        failure = e;
        throw e;
      } finally {
        const bytes = buffer instanceof ArrayBuffer ? buffer.slice(0) : buffer;
        pending.push((async () => {
          try {
            const { key, parts } = await keyOf(kind, bytes, options);
            window.__collected[key] = { kind, parts, out: failure ? 'ERREUR ' + (failure.code || failure.name || '?') + ' | ' + failure.message : normalize(output) };
          } catch (e) {
            window.__collected['erreur-' + pending.length] = { kind, out: 'ENREGISTREUR : ' + e };
          }
        })());
      }
    };
    engine.fromBuffer.__recorded = true;
  }
  // Les deux moteurs sont des `const` de scripts classiques chargés plus tard (moteurs paresseux) : on les guette.
  const timer = setInterval(() => {
    if (typeof DocxImport !== 'undefined') wrap('docx', DocxImport);
    if (typeof PptxImport !== 'undefined') wrap('pptx', PptxImport);
  }, 2);
  window.addEventListener('pagehide', () => clearInterval(timer));
})();
