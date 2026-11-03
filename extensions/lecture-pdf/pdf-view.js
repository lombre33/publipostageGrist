// L'écran de la lecture de PDF (extension « lecture-pdf », consigne GFS 040) : les pages du PDF l'une sous l'autre dans le conteneur de la Lecture (#reader-container), sur le même fond que ses feuilles, avec le même
// zoom (la variable `--pp-fit-zoom` de js/page-zoom.js : la pastille, Ctrl + molette et « Ajuster » valent donc pour un PDF) et la même sortie en Lecture épurée. Le moteur (extensions/lecture-pdf/pdf-engine.js) donne
// le document ; ce fichier le dessine et ne sait rien du modèle ouvert ni du coin d'état (js/pdf-reading.js).
//  - Les feuilles existent toutes tout de suite, à la taille de la première page (le défilement a sa hauteur vraie d'emblée) ; une page ne se DESSINE que lorsqu'elle approche de l'écran (IntersectionObserver sur
//    le conteneur) et sa taille réelle remplace alors celle de la première. Au plus KEEP_RENDERED pages restent dessinées : les plus éloignées du regard redeviennent des feuilles blanches (un PDF de centaines de
//    pages ne tient pas en mémoire sinon). Une page se lit à la demande (`getPage(n)`), une à la fois, jamais le document d'un coup.
//  - Chaque page est un canvas (à la résolution de l'écran, deux fois au plus) et sa couche de texte de pdf.js (`TextLayer`), transparente, qui rend le texte sélectionnable à la souris et copiable ; la couche reçoit
//    `--total-scale-factor`, l'échelle de la page. Un PDF scanné n'a pas de couche de texte : rien ne se sélectionne.
//  - La largeur de la plus large page se dit sur le conteneur (`data-pp-widest-sheet`, comme les sections d'un macro-modèle aux sens mêlés) : « Ajuster » et l'ajustement d'origine la prennent pour largeur de feuille.
//    PdfView.mount(container, doc, { page(n, total) -> texte, failed -> texte }) -> Promise<void>    PdfView.unmount()    PdfView.pagesShown() -> [numéros des pages dessinées]
const PdfView = (function () {
  const el = Dom.el;
  const CLASS = 'pp-pdf-reading';
  const WIDEST = 'data-pp-widest-sheet';
  const PT_TO_CSS = 96 / 72;          // un point PDF vaut 1/72 de pouce, un pixel CSS 1/96
  const KEEP_RENDERED = 8;
  const ROOT_MARGIN = '900px 0px';    // une page se dessine un peu avant d'entrer à l'écran

  let view = null;                    // { container, doc, text, root, pages[], observer, visible:Set<number>, widest, dead }

  const cssSize = viewport => ({ width: viewport.width, height: viewport.height });
  function sizeFrame(page, size) {
    page.frame.style.width = size.width + 'px';
    page.frame.style.height = size.height + 'px';
  }

  function updateWidest(size) {
    if (!view || !(size.width > view.widest)) return;
    view.widest = size.width;
    view.container.setAttribute(WIDEST, String(Math.ceil(view.widest)));
    if (typeof view.onWidest === 'function') view.onWidest();
  }

  function unrender(page) {
    if (page.task) { try { page.task.cancel(); } catch (e) { /* déjà fini */ } page.task = null; }
    page.token++;
    if (page.canvas) { page.canvas.width = 0; page.canvas.height = 0; page.canvas.remove(); page.canvas = null; }
    if (page.layer) { page.layer.remove(); page.layer = null; }
    if (page.note) { page.note.remove(); page.note = null; }
    delete page.frame.dataset.rendered;
    page.state = 'idle';
  }

  async function render(owner, page) {
    if (page.state !== 'idle' || owner.dead) return;
    page.state = 'busy';
    const token = ++page.token;
    const stale = () => owner.dead || page.token !== token;
    try {
      const proxy = await owner.doc.getPage(page.n);
      if (stale()) return;
      const viewport = proxy.getViewport({ scale: PT_TO_CSS });
      const size = cssSize(viewport);
      sizeFrame(page, size);
      updateWidest(size);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const canvas = el('canvas', 'pp-pdf-canvas');
      canvas.width = Math.max(1, Math.floor(size.width * ratio));
      canvas.height = Math.max(1, Math.floor(size.height * ratio));
      canvas.style.width = size.width + 'px';
      canvas.style.height = size.height + 'px';
      page.canvas = canvas;
      page.frame.appendChild(canvas);
      page.task = proxy.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      await page.task.promise;
      page.task = null;
      if (stale()) return;
      const layer = el('div', 'textLayer pp-pdf-text');
      layer.style.setProperty('--total-scale-factor', String(PT_TO_CSS));
      page.layer = layer;
      page.frame.appendChild(layer);
      const content = await proxy.getTextContent();
      if (stale()) return;
      await new owner.doc.pdfjs.TextLayer({ textContentSource: content, container: layer, viewport }).render();
      if (stale()) return;
      page.state = 'done';
      page.frame.dataset.rendered = 'true';
    } catch (e) {
      if (stale() || (e && e.name === 'RenderingCancelledException')) { if (!owner.dead && page.state === 'busy') unrender(page); return; }
      console.warn('[PdfView] page ' + page.n + ' non dessinée', e);
      unrender(page);
      page.state = 'failed';
      page.note = el('p', 'pp-pdf-failed', owner.text.failed());
      page.frame.appendChild(page.note);
    }
    if (!owner.dead) trim(owner);
  }

  // Les pages dessinées au-delà de KEEP_RENDERED redeviennent des feuilles blanches, les plus éloignées de ce qui est à l'écran d'abord.
  function trim(owner) {
    const shown = owner.pages.filter(page => page.state === 'done' || page.state === 'busy');
    if (shown.length <= KEEP_RENDERED) return;
    const seen = [...owner.visible];
    const center = seen.length ? seen.reduce((sum, n) => sum + n, 0) / seen.length : 1;
    shown.sort((a, b) => Math.abs(b.n - center) - Math.abs(a.n - center));
    shown.slice(0, shown.length - KEEP_RENDERED).forEach((page) => { if (!owner.visible.has(page.n)) unrender(page); });
  }

  function observe(owner) {
    if (typeof IntersectionObserver !== 'function') { owner.pages.slice(0, KEEP_RENDERED).forEach(page => render(owner, page)); return; }
    owner.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const page = owner.pages[Number(entry.target.dataset.page) - 1];
        if (!page) return;
        if (entry.isIntersecting) { owner.visible.add(page.n); render(owner, page); } else owner.visible.delete(page.n);
      });
    }, { root: owner.container, rootMargin: ROOT_MARGIN });
    owner.pages.forEach(page => owner.observer.observe(page.frame));
  }

  function unmount() {
    if (!view) return;
    const owner = view;
    view = null;
    owner.dead = true;
    if (owner.observer) owner.observer.disconnect();
    owner.pages.forEach(unrender);
    owner.root.remove();
    owner.container.classList.remove(CLASS);
    owner.container.removeAttribute(WIDEST);
  }

  // Pose le document dans `container` (le contenu de la Lecture y est remplacé). Résolu quand la première page est mesurée : la suite se dessine à mesure que le défilement l'approche.
  // `onWidest` (facultatif) : rappelé quand une page plus large que les précédentes élargit la feuille (l'ajustement au panneau se refait).
  async function mount(container, doc, text, onWidest) {
    unmount();
    const first = await doc.getPage(1);
    const size = cssSize(first.getViewport({ scale: PT_TO_CSS }));
    const root = el('div', 'pp-pdf-pages');
    root.tabIndex = 0;
    root.setAttribute('role', 'document');
    const owner = { container, doc, text, root, pages: [], observer: null, visible: new Set(), widest: 0, dead: false, onWidest };
    for (let n = 1; n <= doc.pageCount; n++) {
      const frame = el('div', 'pp-pdf-page');
      frame.dataset.page = String(n);
      frame.setAttribute('role', 'group');
      frame.setAttribute('aria-label', text.page(n, doc.pageCount));
      const page = { n, frame, state: 'idle', canvas: null, layer: null, note: null, task: null, token: 0 };
      sizeFrame(page, size);
      root.appendChild(frame);
      owner.pages.push(page);
    }
    view = owner;
    container.replaceChildren(root);
    container.classList.add(CLASS);
    container.scrollTop = 0;
    updateWidest(size);
    observe(owner);
  }

  const pagesShown = () => (view ? view.pages.filter(page => page.state === 'done').map(page => page.n) : []);
  const isMounted = () => view !== null;

  return { mount, unmount, pagesShown, isMounted };
})();
