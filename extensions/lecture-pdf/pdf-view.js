// L'écran de la lecture de PDF (extension « lecture-pdf », consigne GFS 040) : les pages du PDF l'une sous l'autre dans le conteneur de la Lecture (#reader-container), sur le même fond que ses feuilles, avec le même
// zoom (la variable `--pp-fit-zoom` de js/page-zoom.js : la pastille, Ctrl + molette et « Ajuster » valent donc pour un PDF) et la même sortie en Lecture épurée. Le moteur (extensions/lecture-pdf/pdf-engine.js) donne
// le document ; ce fichier le dessine et ne sait rien du modèle ouvert ni du coin d'état (js/pdf-reading.js).
//  - Les feuilles existent toutes tout de suite, à la taille de la première page (le défilement a sa hauteur vraie d'emblée) ; une page ne se DESSINE que lorsqu'elle approche de l'écran (IntersectionObserver sur
//    le conteneur) et sa taille réelle remplace alors celle de la première. Au plus KEEP_RENDERED pages restent dessinées : les plus éloignées du regard redeviennent des feuilles blanches (un PDF de centaines de
//    pages ne tient pas en mémoire sinon). Une page se lit à la demande (`getPage(n)`), une à la fois, jamais le document d'un coup.
//  - Chaque page est un canvas (à la résolution de l'écran, deux fois au plus) et sa couche de texte de pdf.js (`TextLayer`), transparente, qui rend le texte sélectionnable à la souris et copiable ; la couche reçoit
//    `--total-scale-factor`, l'échelle de la page. Un PDF scanné n'a pas de couche de texte : rien ne se sélectionne.
//  - La largeur de la plus large page se dit sur le conteneur (`data-pp-widest-sheet`, comme les sections d'un macro-modèle aux sens mêlés) : « Ajuster » et l'ajustement d'origine la prennent pour largeur de feuille.
//  - Les COMMENTAIRES (consigne GFS 045) : la couche de texte est aussi l'endroit des marques et de la sélection. Chaque page dessinée garde le texte que pdf.js en rend (`getTextContent`, mis en forme par pdf-anchor.js) et les
//    morceaux de sa couche de texte (`TextLayer.textDivs`, dans le même ordre) : une sélection à la souris se lit en positions dans le texte de la page, jamais en pixels, et une marque (`setMarks`) enveloppe le passage dans ces
//    mêmes morceaux, si bien qu'elle suit le zoom, le défilement et la Lecture épurée avec la page et se repose à chaque fois qu'une page se redessine. Un fil ne couvre qu'une page : une sélection qui déborde est coupée à la fin de la page où elle commence.
//    PdfView.mount(container, doc, { page(n, total) -> texte, failed -> texte }) -> Promise<void>    PdfView.unmount()    PdfView.pagesShown() -> [numéros des pages dessinées]
//    PdfView.selection() -> { page, debut, fin, citation, avant, apres, clipped, rect } | null    PdfView.clearSelection()    PdfView.setMarks([{ id, page, debut, fin, resolved }])    PdfView.markElement(id)    PdfView.onMarkClick(fn(id, élément))
//    PdfView.hasText() -> true | false | null (null : on ne sait pas encore)    PdfView.onTextKnown(fn(bool)) (s'ajoute aux écouteurs déjà posés)    PdfView.pageText(n) -> Promise<{ text, ... } | null> (dessinée ou non)
const PdfView = (function () {
  const el = Dom.el;
  const CLASS = 'pp-pdf-reading';
  const WIDEST = 'data-pp-widest-sheet';
  const PT_TO_CSS = 96 / 72;          // un point PDF vaut 1/72 de pouce, un pixel CSS 1/96
  const KEEP_RENDERED = 8;
  const ROOT_MARGIN = '900px 0px';    // une page se dessine un peu avant d'entrer à l'écran

  let view = null;                    // { container, doc, text, root, pages[], observer, visible:Set<number>, widest, dead, marks[], retained, hasText, texts }
  // Les marques voulues : celles que le module des commentaires a données, gardées d'un PDF posé à l'autre (elles se posent à chaque `mount`, quel que soit l'ordre où le PDF et ses fils arrivent).
  let wantedMarks = [];

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
    page.source = null; page.divs = null; page.divIndex = null;
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
      const textLayer = new owner.doc.pdfjs.TextLayer({ textContentSource: content, container: layer, viewport });
      await textLayer.render();
      if (stale()) return;
      // Le texte de la page et ses morceaux, dans le même ordre (le rang d'un morceau de `textDivs` est celui de pdf-anchor.js:pageText) : de quoi lire une sélection et poser une marque sans toucher au DOM d'un autre.
      page.source = PdfAnchor.pageText(content.items);
      page.divs = textLayer.textDivs;
      page.divIndex = new Map(page.divs.map((div, rank) => [div, rank]));
      page.state = 'done';
      page.frame.dataset.rendered = 'true';
      applyMarks(owner, page);
      noteText(owner);
    } catch (e) {
      if (stale() || (e && e.name === 'RenderingCancelledException')) { if (!owner.dead && page.state === 'busy') unrender(page); return; }
      console.warn('[PdfView] page ' + page.n + ' non dessinée', e);
      unrender(page);
      page.state = 'failed';
      page.note = el('p', 'pp-pdf-failed', owner.text.failed());
      page.frame.appendChild(page.note);
      noteText(owner);
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

  // ==============================================================================================================================================================================================
  // Les commentaires (consigne GFS 045) : le PDF a-t-il du texte, les marques posées sur la couche de texte, la sélection lue en positions dans le texte de la page.

  const MARK = 'pp-pdf-mark';
  const handlers = { markClick: null, textKnown: [] };   // posés par le module des commentaires, ils survivent au changement de PDF (le clic sur une marque n'a qu'un gestionnaire ; qui veut savoir si le PDF a du texte s'ajoute à ceux qui le savent déjà)

  // Le PDF « a du texte » dès qu'une page dessinée en a. Il n'en a pas quand les pages qui se dessinent à l'arrivée sont toutes dessinées et sans texte (un scan) : tant que l'une d'elles se dessine encore, on ne sait pas
  // (`null`), pour ne pas griser « Commenter » un instant devant une première page blanche suivie de pages de texte. Une page de texte qui arrive plus tard le rend vrai.
  function noteText(owner) {
    if (owner.dead || owner.hasText === true) return;
    const drawn = owner.pages.filter(page => page.state === 'done');
    const pending = [...owner.visible].some((n) => { const page = owner.pages[n - 1]; return page && page.state !== 'done' && page.state !== 'failed'; });
    const next = drawn.some(page => page.source && page.source.length > 0) ? true : (drawn.length && !pending ? false : null);
    if (next === null || next === owner.hasText) return;
    owner.hasText = next;
    handlers.textKnown.slice().forEach((listener) => { try { listener(next); } catch (e) { /* un écouteur qui échoue n'empêche pas les autres */ } });
  }

  // Les marques d'une page : retirées (le texte retrouve ses morceaux d'origine), puis posées pour chaque passage de la page, le plus long d'abord pour que les plus courts se logent dedans.
  function clearMarks(page) {
    if (!page.layer) return;
    const marks = page.layer.querySelectorAll('.' + MARK);
    if (!marks.length) return;
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    page.layer.normalize();
  }

  // Enveloppe les signes [from, to) du morceau `div` : un texte coupé en autant d'enveloppes qu'il y a de morceaux de texte dans la portée (une marque posée avant a déjà coupé le texte).
  function wrapRange(div, from, to, mark) {
    if (!(to > from)) return;
    const pieces = [];
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    let at = 0;
    for (let node = walker.nextNode(); node && at < to; node = walker.nextNode()) {
      const length = node.nodeValue.length;
      if (at + length > from) pieces.push({ node, from: Math.max(0, from - at), to: Math.min(length, to - at) });
      at += length;
    }
    pieces.forEach((piece) => {
      let inner = piece.node;
      if (piece.from > 0) inner = inner.splitText(piece.from);
      if (piece.to - piece.from < inner.nodeValue.length) inner.splitText(piece.to - piece.from);
      const wrap = document.createElement('span');
      wrap.className = MARK + (mark.resolved ? ' ' + MARK + '-resolved' : '');
      wrap.setAttribute('data-comment-id', mark.id);
      wrap.setAttribute('data-resolved', mark.resolved ? 'true' : 'false');
      inner.parentNode.insertBefore(wrap, inner);
      wrap.appendChild(inner);
    });
  }

  function applyMarks(owner, page) {
    if (owner.dead || !page.layer || !page.source) return;
    clearMarks(page);
    const source = page.source;
    owner.marks.filter(mark => mark.page === page.n).sort((a, b) => (a.debut - b.debut) || (b.fin - a.fin)).forEach((mark) => {
      const debut = Math.max(0, Math.floor(Number(mark.debut)));
      const fin = Math.min(source.length, Math.floor(Number(mark.fin)));
      if (!(fin > debut)) return;
      const first = source.item(debut);
      const last = source.item(fin - 1);
      for (let rank = first; rank <= last; rank++) {
        const div = page.divs[rank];
        if (!div || !div.isConnected) continue;
        wrapRange(div, rank === first ? source.offset(debut) : 0, rank === last ? source.offset(fin - 1) + 1 : div.textContent.length, mark);
      }
    });
  }

  // Le texte de la page `n` (pdf-anchor.js:pageText), dessinée ou non : { text } pour une page qui ne l'est pas, lu à la demande (`getPage(n).getTextContent()`, une page à la fois, jamais le document d'un coup) et gardé sans
  // les tableaux de provenance, qui ne servent qu'aux pages dessinées. null quand la page n'existe pas ou ne se lit pas (une lecture manquée n'est pas gardée : elle se retente).
  function pageText(n) {
    const owner = view;
    const page = owner ? owner.pages[Number(n) - 1] : null;
    if (!page) return Promise.resolve(null);
    if (page.source) return Promise.resolve(page.source);
    let known = owner.texts.get(page.n);
    if (!known) {
      known = owner.doc.getPage(page.n).then(proxy => proxy.getTextContent()).then(content => ({ text: PdfAnchor.pageText(content.items).text }))
        .catch(() => null).then((found) => { if (!found) owner.texts.delete(page.n); return found; });
      owner.texts.set(page.n, known);
    }
    return known;
  }

  function setMarks(marks) {
    wantedMarks = (Array.isArray(marks) ? marks : []).map(mark => ({ id: String(mark.id), page: Number(mark.page), debut: Number(mark.debut), fin: Number(mark.fin), resolved: mark.resolved === true }));
    if (!view) return;
    view.marks = wantedMarks;
    view.pages.forEach(page => applyMarks(view, page));
  }

  const markElement = id => (view ? Array.from(view.root.querySelectorAll('.' + MARK)).find(mark => mark.getAttribute('data-comment-id') === String(id)) || null : null);

  // Un bord de sélection (nœud, décalage) lu comme une place dans le texte d'une page : { page, pos } ou null. Dans un morceau, c'est la place du signe (pdf-anchor.js:pointOf) ; entre deux morceaux (dans la couche, une zone
  // balisée), celle du morceau qui suit ; hors de toute couche (la sélection d'un Ctrl + A part de la racine), le début de la première page dessinée après le bord, ou la fin de la dernière avant lui.
  function boundary(owner, node, offset, edge) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    const frame = element && element.closest ? element.closest('.pp-pdf-page') : null;
    const page = frame ? owner.pages[Number(frame.dataset.page) - 1] : null;
    const at = document.createRange();
    at.setStart(node, offset);
    at.collapse(true);
    if (page && page.layer && page.source && page.layer.contains(node)) {
      let span = element;
      while (span && span !== page.layer && !page.divIndex.has(span)) span = span.parentElement;
      if (span && page.divIndex.has(span)) {
        const upTo = document.createRange();
        upTo.setStart(span, 0);
        upTo.setEnd(node, offset);
        return { page, pos: PdfAnchor.pointOf(page.source, page.divIndex.get(span), upTo.toString().length) };
      }
      for (let rank = 0; rank < page.divs.length; rank++) {
        const div = page.divs[rank];
        if (div.isConnected && at.comparePoint(div, 0) >= 0) return { page, pos: PdfAnchor.pointOf(page.source, rank, 0) };
      }
      return { page, pos: page.source.length };
    }
    let before = null;
    for (const candidate of owner.pages) {
      if (!candidate.layer || !candidate.source) continue;
      if (at.comparePoint(candidate.layer, 0) >= 0) return edge === 'start' ? { page: candidate, pos: 0 } : (before ? { page: before, pos: before.source.length } : null);
      before = candidate;
    }
    return edge === 'end' && before ? { page: before, pos: before.source.length } : null;
  }

  // La sélection de la personne dans le PDF, ou la dernière qu'elle y a faite (le clic sur « Commenter » peut la lui faire perdre) : rendue comme une ancre (pdf-anchor.js:anchorFromRange) de la page où elle commence, coupée à la
  // fin de cette page quand elle déborde (`clipped`), avec le rectangle de la sélection pour placer la fenêtre tant que la marque n'est pas posée. null : rien de sélectionné, ou rien de lisible.
  function selection() {
    const owner = view;
    if (!owner) return null;
    let range = null;
    const live = window.getSelection();
    if (live && live.rangeCount && !live.isCollapsed && owner.root.contains(live.getRangeAt(0).commonAncestorContainer)) range = live.getRangeAt(0);
    else if (owner.retained && owner.retained.startContainer.isConnected && owner.retained.endContainer.isConnected && owner.root.contains(owner.retained.commonAncestorContainer)) range = owner.retained;
    if (!range) return null;
    const start = boundary(owner, range.startContainer, range.startOffset, 'start');
    if (!start) return null;
    const end = boundary(owner, range.endContainer, range.endOffset, 'end');
    const clipped = !!end && end.page !== start.page;
    const anchor = PdfAnchor.anchorFromRange(start.page.n, start.page.source, start.pos, end && end.page === start.page ? end.pos : start.page.source.length);
    if (!anchor) return null;
    return Object.assign(anchor, { clipped, rect: range.getBoundingClientRect() });
  }

  // Oublie la sélection - celle du navigateur et celle qu'on gardait pour le clic sur « Commenter » - : le fil vient de naître, sa marque prend la place de la sélection.
  function clearSelection() {
    if (!view) return;
    view.retained = null;
    const selected = window.getSelection();
    if (selected && selected.rangeCount && view.root.contains(selected.getRangeAt(0).commonAncestorContainer)) selected.removeAllRanges();
  }

  function wireComments(owner) {
    owner.onSelectionChange = () => {
      const selected = window.getSelection();
      if (!selected || !selected.rangeCount || selected.isCollapsed) return;
      const range = selected.getRangeAt(0);
      if (owner.root.contains(range.commonAncestorContainer)) owner.retained = range.cloneRange();
    };
    document.addEventListener('selectionchange', owner.onSelectionChange);
    // Un clic dans le PDF sans rien de sélectionné oublie la dernière sélection ; un clic sur « Commenter », hors du PDF, la garde.
    owner.root.addEventListener('mouseup', () => {
      const selected = window.getSelection();
      if (!selected || selected.isCollapsed) owner.retained = null;
    });
    // `click` plutôt que `mousedown` : une sélection qui commence sur un passage déjà commenté ne doit pas ouvrir son fil.
    owner.root.addEventListener('click', (event) => {
      const mark = event.target && event.target.closest ? event.target.closest('.' + MARK) : null;
      if (!mark || !owner.root.contains(mark) || !handlers.markClick) return;
      const selected = window.getSelection();
      if (selected && !selected.isCollapsed) return;
      handlers.markClick(mark.getAttribute('data-comment-id'), mark);
    });
  }

  function unmount() {
    if (!view) return;
    const owner = view;
    view = null;
    owner.dead = true;
    if (owner.observer) owner.observer.disconnect();
    if (owner.onSelectionChange) document.removeEventListener('selectionchange', owner.onSelectionChange);
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
    const owner = { container, doc, text, root, pages: [], observer: null, visible: new Set(), widest: 0, dead: false, onWidest, marks: wantedMarks, retained: null, hasText: null, texts: new Map() };
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
    wireComments(owner);
    container.replaceChildren(root);
    container.classList.add(CLASS);
    container.scrollTop = 0;
    updateWidest(size);
    observe(owner);
  }

  const pagesShown = () => (view ? view.pages.filter(page => page.state === 'done').map(page => page.n) : []);
  const isMounted = () => view !== null;
  const hasText = () => (view ? view.hasText : null);
  function onMarkClick(fn) { handlers.markClick = typeof fn === 'function' ? fn : null; }
  function onTextKnown(fn) { if (typeof fn === 'function') handlers.textKnown.push(fn); }

  return { mount, unmount, pagesShown, isMounted, selection, clearSelection, setMarks, markElement, onMarkClick, hasText, onTextKnown, pageText };
})();
