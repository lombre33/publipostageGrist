// Le moteur de la lecture de PDF (extension « lecture-pdf », consigne GFS 040) : ouvre le PDF que GFS donne et rend un document dont l'écran tire ses pages. Aucun élément de page ici : tout ce qui se dessine est
// dans extensions/lecture-pdf/pdf-view.js, tout ce qui touche au modèle ouvert et au coin d'état dans js/pdf-reading.js.
//  - pdf.js n'est PAS dans ce dépôt, ni dans la liste de bibliothèques ou l'import map du widget, ni sur un CDN : GFS le porte (bibliothèque « pdfjs », pdfjs-dist, forme « module », UN fichier qui contient aussi son
//    moteur) et en donne la source (js/extensions.js `loadModuleLibrary`, chargée avec l'extension) ; il se range dans globalThis.GfsPaquets.pdfjs.modules['pdfjs-dist/build/pdf.min.mjs'] (`getDocument`, `TextLayer`).
//    Jamais d'`import()` : l'empreinte ne se pose pas sur un import dynamique.
//  - Réglages de GFS, mesurés chez lui : `isEvalSupported: false` (aucune politique de sécurité d'app n'accepte `unsafe-eval`) et `verbosity: 0` (sans quoi pdf.js écrit « Setting up fake worker. » à chaque
//    document). Le moteur tourne dans la page : un cadre sans `allow-same-origin` ne crée aucun `Worker`, pdf.js prend son « faux Worker » que le fichier de GFS pose lui-même - on ne règle donc jamais
//    `GlobalWorkerOptions.workerSrc` et on ne charge rien de plus. Les pages se lisent une à une, à la demande (`getPage(n)`), jamais le document d'un coup. Fermer un document, c'est `loadingTask.destroy()` :
//    le `PDFDocumentProxy` de pdf.js 6 n'a plus de `destroy()`.
//  - Limites connues de GFS : les polices standard, les CMap et le décodeur JPEG 2000 ne sont pas dans le fichier (un PDF qui en dépend s'affiche avec des polices de repli, ou sans l'image) ; un PDF scanné n'a pas
//    de couche de texte. pdf.js 6 attend d'un navigateur les méthodes `getOrInsertComputed` de Map et de WeakMap : sans elles, il échoue à la première page - on le dit avant (`oldBrowser`) au lieu d'un
//    écran blanc.
//    PdfEngine.open(file, { askPassword(again) -> Promise<string | null> }) -> Promise<{ ok: true, doc } | { ok: false, reason }>
//      reason : 'empty' (aucun octet), 'notPdf' (pas d'en-tête %PDF-), 'unreadable' (pdf.js le refuse, ou sa première page ne se lit pas), 'password' (un mot de passe demandé : la personne annule,
//      ou ne trouve pas le bon), 'engine' (GFS ne donne pas pdf.js, ou ce qu'il donne n'en est pas), 'oldBrowser'.
//      doc : { name, pageCount, getPage(n) -> Promise<page de pdf.js>, pdfjs (les exports de pdf.js : TextLayer...), destroy() -> Promise<void> }.
const PdfEngine = (function () {
  const LIBRARY = 'pdfjs';
  const MODULE = 'pdfjs-dist/build/pdf.min.mjs';
  // La spécification laisse jusqu'à 1024 octets avant l'en-tête.
  const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];   // %PDF-
  const HEADER_WINDOW = 1024;

  const fail = reason => ({ ok: false, reason });

  function hasPdfHeader(bytes) {
    const last = Math.min(bytes.length, HEADER_WINDOW) - HEADER.length;
    for (let start = 0; start <= last; start++) {
      let same = true;
      for (let k = 0; k < HEADER.length && same; k++) same = bytes[start + k] === HEADER[k];
      if (same) return true;
    }
    return false;
  }

  // Les exports de pdf.js que GFS a posés, ou null.
  function library() {
    const spaces = Extensions.moduleNamespaces(LIBRARY);
    const pdfjs = spaces && spaces[MODULE];
    return pdfjs && typeof pdfjs.getDocument === 'function' && typeof pdfjs.TextLayer === 'function' ? pdfjs : null;
  }

  const modernEnough = () => typeof Map.prototype.getOrInsertComputed === 'function' && typeof WeakMap.prototype.getOrInsertComputed === 'function';

  async function open(file, options) {
    if (!file || typeof file.arrayBuffer !== 'function') return fail('unreadable');
    if (!file.size) return fail('empty');
    let bytes;
    try { bytes = new Uint8Array(await file.arrayBuffer()); } catch (e) { return fail('unreadable'); }
    if (!bytes.length) return fail('empty');
    if (!hasPdfHeader(bytes)) return fail('notPdf');
    const pdfjs = library();
    if (!pdfjs) return fail('engine');
    if (!modernEnough()) return fail('oldBrowser');
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 });
    let refused = false;   // la personne a annulé la demande du mot de passe
    task.onPassword = (update, reason) => {
      const again = !!pdfjs.PasswordResponses && reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD;
      Promise.resolve(options && options.askPassword ? options.askPassword(again) : null).then((password) => {
        if (typeof password === 'string') update(password);
        else { refused = true; task.destroy().catch(() => {}); }
      }, () => { refused = true; task.destroy().catch(() => {}); });
    };
    let pdf;
    try { pdf = await task.promise; }
    catch (e) {
      task.destroy().catch(() => {});
      return fail(refused || (e && e.name === 'PasswordException') ? 'password' : 'unreadable');
    }
    // La première page doit se lire : une réponse « ouvert » ne se donne pas pour un document dont l'écran ne pourra rien montrer.
    try { await pdf.getPage(1); }
    catch (e) { task.destroy().catch(() => {}); return fail('unreadable'); }
    let destroyed = null;
    return {
      ok: true,
      doc: {
        name: String(file.name || ''),
        pageCount: pdf.numPages,
        pdfjs,
        getPage: n => pdf.getPage(n),
        destroy() { if (!destroyed) destroyed = task.destroy().catch(() => {}); return destroyed; },
      },
    };
  }

  return { open, hasPdfHeader };
})();
