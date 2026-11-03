// Les VUES de diapositive (demande du 02/11, « Lien, puis aperçu animé d'affilée », troisième niveau, seconde partie) : un cadre libre (js/free-frame.js : `view`, `data-ff-view`) qui montre, EN PETIT ET EN
// DIRECT, une autre diapositive du modèle - un sommaire en miniatures, un bouton qui est l'image de ce qu'il ouvre. Son lien (`data-ff-link`, `#slide-3`, js/frame-link.js) est posé avec lui : un clic au
// diaporama ou à la Lecture mène à la diapositive montrée, avec l'animation que la personne a choisie pour ce lien (js/link-dialog.js : « Animation au clic »).
// Le cadre garde dans le modèle un TEXTE DE REPLI : le titre de la diapositive, dans un cadre blanc à fin trait gris. C'est ce que le PDF, le Word, le HTML et le PowerPoint montrent (un cadre avec son
// titre, cliquable dans le PowerPoint : le lien de l'objet) ; l'éditeur, la Lecture, l'impression et le diaporama peignent la vue par-dessus (`.pp-ff-view`, css/free-frame.css), sans rien écrire de plus dans le
// modèle : la vue n'est jamais enregistrée, elle se refait de la diapositive montrée.
//  - L'ÉDITEUR : la vue de nœud du cadre (js/free-frame.js) pose un calque (`host`) et le déclare (`track`) ; `redraw` le remplit d'une copie de la diapositive montrée, celle que la bande fait pour ses
//    miniatures (extensions/diapositives/slide-strip.js : `pageCopy`), réduite à la boîte du cadre. Elle se refait un instant après chaque changement du texte (`schedule`, appelée par l'extension de
//    js/free-frame.js) et quand un graphique finit de se peindre ; une diapositive que ses blocs n'ont pas changée n'est pas recopiée. Sans la bande (l'extension « diapositives » éteinte) ou quand la
//    diapositive montrée n'existe plus (son repère a disparu), le calque se cache et le texte de repli se lit à sa place. Un clic sur le calque choisit le cadre, un glisser le déplace.
//  - LA LECTURE, L'IMPRESSION ET LE DIAPORAMA : `fill(wrapper)`, appelée une fois le HTML résolu (js/reader-mode.js : resolveReaderBody, avant la mise en page), pose le calque de chaque cadre à vue et le remplit
//    d'une copie des blocs de la diapositive montrée, prise dans ce même HTML (ses variables sont déjà résolues). Le diaporama joue donc ce que la Lecture montre ; la fenêtre à part reçoit la copie faite.
//  - UNE VUE NE MONTRE JAMAIS DE VUE : la copie ne garde ni le calque, ni l'attribut `data-ff-view` des cadres qu'elle porte (leur texte de repli se lit à la place) ; une vue de sa propre diapositive est une
//    vue sans boucle.
//  - LE MENU « OBJETS » : « Vue… » (js/objects-menu.js, à côté de « Cadre de texte » et « Tableau ») ouvre la liste avec recherche des diapositives (`openPicker`, comme celle des tableaux liés) ; la choisie reçoit son repère avec la
//    vue (un seul Ctrl+Z, comme un lien : SlideProps.CLAIM_META) et la vue se pose, sélectionnée, au centre de la diapositive du curseur, à la forme de la page (js/free-frame.js : `insertView`).
// Un fichier du socle : il ne sait de l'extension « diapositives » que ce que la bande lui offre (`SlideStrip.pageCopy`), lu quand il sert.
const SlideView = (function () {
  const el = Dom.el;
  const HOST = 'pp-ff-view';           // le calque d'une vue, dans la boîte du cadre
  const PAGE = 'pp-ff-view-page';      // la copie de la diapositive, à la taille de la page, réduite par le calque
  const HAS = 'pp-ff-has-view';        // le cadre dont le calque est rempli : son texte de repli se cache (le CSS)
  const REDRAW_MS = 250;               // le temps de repos du texte avant que les vues se refassent
  const PX_PER_PT = 96 / 72;

  // La page, en pixels de mise en page : sa largeur (celle de la feuille) et sa hauteur.
  const geometry = () => ({ width: PageLayout.getSheetWidthPx(), height: PageLayout.getPageSizePx().height });

  // Le réglage d'un calque d'après les mesures `a` du cadre (en points, dans le trait qui le borde) : la page entière, réduite pour tenir dans la boîte, centrée, jamais déformée. Le CSS lit ces variables.
  function fit(host, a, g) {
    const inner = 2 * FreeFrame.lineWidthOf(a);
    const boxW = Math.max(1, (a.w - inner) * PX_PER_PT);
    const boxH = Math.max(1, (a.h - inner) * PX_PER_PT);
    const scale = Math.min(boxW / g.width, boxH / g.height);
    const set = (name, value) => host.style.setProperty(name, value);
    set('--ffv-w', g.width + 'px');
    set('--ffv-h', g.height + 'px');
    set('--ffv-scale', String(Math.round(scale * 10000) / 10000));
    set('--ffv-dx', Math.round((boxW - g.width * scale) / 2 * 100) / 100 + 'px');
    set('--ffv-dy', Math.round((boxH - g.height * scale) / 2 * 100) / 100 + 'px');
  }

  // Ce qui ne doit pas passer dans une copie : l'identifiant (deux éléments n'ont pas le même), ce qui ne sert qu'à écrire (poignées, interface des cadres, texte indicatif, sélection), et les VUES
  // qu'elle porte (le calque et l'attribut : le texte de repli de la diapositive montrée se lit à la place).
  function tidy(root) {
    root.querySelectorAll('.' + HOST + ', .pp-ff-ui, .editor-image-handle, .editor-image-move-handle, .column-resize-handle, .ProseMirror-gapcursor').forEach(node => node.remove());
    [root].concat(Array.from(root.querySelectorAll('*'))).forEach((node) => {
      node.removeAttribute('id');
      node.removeAttribute('data-placeholder');
      node.removeAttribute('data-ff-view');
      Array.from(node.classList).filter(name => name === HAS || /selected/i.test(name) || name === 'is-editor-empty' || name === 'has-focus' || name === 'pp-ff-active').forEach(name => node.classList.remove(name));
    });
  }

  // Le calque d'une vue : un conteneur vide, rempli plus tard. Sa copie est inerte (ni clic, ni focus, ni lecteur d'écran : le cadre dit déjà ce qu'il montre par son nom).
  function host() {
    const node = el('div', HOST);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function mount(node, page, a, g) {
    page.inert = true;
    node.replaceChildren(page);
    fit(node, a, g);
    node.hidden = false;
  }

  // Ce texte a-t-il une vue de diapositive ? Le diaporama, qui n'a pas besoin du repère des diapositives sans elle, ne le demande qu'alors (extensions/diapositives/slide-show.js).
  const shows = html => typeof html === 'string' && html.indexOf('data-ff-view=') !== -1;

  // ---- La Lecture, l'impression et le diaporama ------------------------------------------------------------------------------------------------------------------------------------
  const isBreak = node => node.nodeType === 1 && node.classList.contains('page-break-marker') && node.hasAttribute('data-slide-break');
  // Les blocs de la diapositive dont le repère est `id`, dans `wrapper` (le texte résolu, à plat : les diapositives y sont séparées par les sauts de diapositive), ou null.
  function blocksOf(wrapper, id) {
    const kids = Array.from(wrapper.children);
    const mark = kids.findIndex(node => node.getAttribute('data-anchor') === id);
    if (mark < 0) return null;
    let from = mark;
    let to = mark;
    while (from > 0 && !isBreak(kids[from - 1])) from--;
    while (to < kids.length - 1 && !isBreak(kids[to + 1])) to++;
    return kids.slice(from, to + 1);
  }
  // Pose la vue de chaque cadre à vue de `wrapper` (le `.reader-content` résolu de la Lecture, de l'impression et du diaporama, avant sa mise en page) : le calque, rempli d'une copie des blocs de la
  // diapositive montrée. Rend le nombre de vues posées. Toutes les copies se font avant qu'aucune se pose : une vue ne recopie jamais la vue d'une autre.
  function fill(wrapper) {
    const frames = Array.from(wrapper.querySelectorAll('.pp-free-frame[data-ff-view]'));
    if (!frames.length) return 0;
    const g = geometry();
    const made = [];
    frames.forEach((frame) => {
      const blocks = blocksOf(wrapper, frame.getAttribute('data-ff-view'));
      const box = frame.querySelector(':scope > .pp-free-frame-box');
      if (!blocks || !box) return;
      const page = el('div', PAGE + ' reader-content');
      blocks.forEach(block => page.appendChild(block.cloneNode(true)));
      tidy(page);
      made.push({ frame, box, page, a: FreeFrame.measuresOf(frame) });
    });
    made.forEach(({ frame, box, page, a }) => {
      const node = host();
      mount(node, page, a, g);
      box.insertBefore(node, box.firstChild);
      frame.classList.add(HAS);
    });
    return made.length;
  }

  // ---- L'éditeur -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const live = new Map();    // calque -> { frame, id, a, seen } : les vues de l'éditeur, une par vue de nœud
  let timer = null;
  const strip = () => (typeof SlideStrip !== 'undefined' && typeof SlideStrip.pageCopy === 'function' ? SlideStrip : null);

  // Déclare (ou met à jour) la vue du cadre `frame` : son calque `node`, la diapositive montrée `a.view` et les mesures du cadre.
  function track(node, frame, a) {
    const entry = live.get(node);
    if (entry && entry.id === a.view && entry.a.w === a.w && entry.a.h === a.h && FreeFrame.lineWidthOf(entry.a) === FreeFrame.lineWidthOf(a)) { entry.a = a; return; }
    live.set(node, { frame, id: a.view, a, seen: null });
    schedule(0);
  }
  function untrack(node) { live.delete(node); }
  // Les vues se refont après `ms` (le temps de repos du texte par défaut) ; la bande, elle, ne refait que ce qui a changé.
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(redraw, ms == null ? REDRAW_MS : ms);
  }
  function redraw() {
    timer = null;
    const source = strip();
    const g = geometry();
    let changed = false;
    live.forEach((entry, node) => {
      const copy = source ? source.pageCopy(entry.id, entry.seen) : null;
      if (copy && copy.same) { fit(node, entry.a, g); return; }
      entry.seen = copy ? { nodes: copy.nodes, key: copy.key } : null;
      if (!copy) {
        if (!node.hidden) changed = true;
        node.hidden = true;
        node.replaceChildren();
        entry.frame.classList.remove(HAS);
        return;
      }
      copy.page.classList.add(PAGE);
      tidy(copy.page);
      mount(node, copy.page, entry.a, g);
      entry.frame.classList.add(HAS);
      changed = true;
    });
    // Les miniatures de la bande copient le calque tel qu'il est : celles des diapositives qui portent une vue se refont avec lui.
    if (changed && source && source.redrawViews) source.redrawViews();
  }

  // ---- Poser une vue : « Vue… » du menu « Objets » ---------------------------------------------------------------------------------------------------------------------
  let open = null;   // { host, search } tant que la liste est ouverte

  function closePicker(instance) {
    if (!open || (instance && instance !== open)) return;
    const { host: node, search } = open;
    open = null;
    try { search.destroy(); } catch (e) { /* déjà défait */ }
    node.remove();
  }
  // Le rectangle de la ligne du menu ; le menu se referme dès que la souris le quitte (la ligne passe en display:none, rectangle nul) : celui du bouton du menu sert alors.
  function anchorRect(anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    const group = anchorEl.closest('.v2-hover-group');
    const button = group && group.querySelector(':scope > button');
    return (button || document.body).getBoundingClientRect();
  }
  // Le texte alternatif d'une vue (son nom pour un lecteur d'écran et pour PowerPoint) : la diapositive montrée, par son rang et son titre.
  const altOf = (slide) => I18n.t(slide.title ? 'slideView.alt' : 'slideView.altBare', { n: slide.index + 1, title: slide.title });

  // Pose la vue de la diapositive de rang `index` sur la diapositive du curseur : son repère (celui qu'elle a, ou un neuf posé avec la vue), un texte de repli (son titre), le lien vers elle. Faux hors d'une
  // présentation modifiable ou quand cette diapositive n'existe plus.
  function insert(ed, index) {
    const slide = Anchors.targets(ed).slides[index];
    if (!slide) return false;
    const id = slide.id || Anchors.slideIdFor(ed, slide.index);
    const claim = slide.id ? null : { index: slide.index, id };
    return FreeFrame.insertView(ed, FreeFrame.slideStartOf(ed.state.doc, ed.state.selection.from), { id, title: slide.title, alt: altOf(slide), claim });
  }

  // La liste avec recherche des diapositives (js/search-select.js), ouverte à côté de la ligne du menu : « 1. Accueil », « 2. Les chiffres »... Faux si elle est indisponible (rien ne s'ouvre).
  function openPicker(ed, anchorEl) {
    if (!ed || !ed.isEditable) return false;
    const slides = Anchors.targets(ed).slides;
    let node = null;
    let instance = null;
    try {
      closePicker();
      node = document.createElement('div');
      node.id = 'v2-slide-view-search';
      const select = document.createElement('select');
      slides.forEach((slide) => {
        const option = document.createElement('option');
        option.value = String(slide.index);
        option.textContent = slide.text;
        option.dataset.name = slide.text;
        select.appendChild(option);
      });
      node.appendChild(select);
      document.body.appendChild(node);
      select.selectedIndex = -1;   // rien de choisi au départ : même la première ligne déclenche `change`
      const search = SearchSelect.attach(select, {
        popup: true,
        anchor: () => anchorRect(anchorEl),
        searchPlaceholder: () => I18n.t('slideView.search'),
        emptyText: () => I18n.t(slides.length ? 'slideView.noMatch' : 'slideView.none'),
        onClose: (refocus) => { if (refocus) ed.commands.focus(); setTimeout(() => closePicker(instance), 0); },
      });
      instance = { host: node, search };
      open = instance;
      select.addEventListener('change', () => {
        if (insert(ed, parseInt(select.value, 10))) setTimeout(FreeFrame.syncToolbar, 0);
      });
      search.open();
      return true;
    } catch (e) {
      if (instance) closePicker(instance); else if (node) node.remove();
      return false;
    }
  }

  return { HOST, PAGE, HAS, host, fit, tidy, shows, fill, blocksOf, track, untrack, schedule, redraw, insert, openPicker };
})();
