// La bande des diapositives d'une présentation, à gauche du document (extension « diapositives » de Grist Factory Suite ; le socle ne l'atteint que par js/slides-entry.js, qui la montre
// tant qu'une présentation est à l'écran en Édition). Une diapositive est ce qu'il y a entre deux sauts de page (nœuds `pageBreak` de premier niveau) : la bande en montre une miniature
// par diapositive, dans l'ordre, celle du curseur cochée.
//  - ALLER à une diapositive : un clic sur sa miniature pose le curseur au début de son texte et fait défiler le document jusqu'au haut de sa page. Au clavier (la bande est une liste, Tab
//    y entre) : ↑ et ↓, Début et Fin vont d'une diapositive à l'autre sans quitter la bande ; Entrée et Échap rendent le clavier au document.
//  - Ses GESTES : « Ajouter une diapositive après », « Dupliquer », « Monter », « Descendre », « Supprimer », dans son menu (le bouton « ⋯ » de la miniature, un clic droit, Maj+F10 ou la
//    touche Menu) ; « Ajouter », au bas de la bande (le premier des deux boutons carrés d'une icône, sur une ligne : « Ajouter » et « Importer », dont le nom est l'info-bulle ; « Objets » est dans la barre d'outils du haut, js/objects-menu.js), ajoute une diapositive après celle du curseur ; au clavier, Ctrl+↑ et Ctrl+↓ la déplacent, Suppr l'efface, Ctrl+Z et Ctrl+Y
//    défont et refont. Chaque geste est UNE transaction de l'éditeur : un seul Ctrl+Z le défait, et le modèle se marque modifié comme après une frappe. Une présentation garde au moins
//    une diapositive. La barre d'outils n'a que le bouton « Objets » de plus (js/objects-menu.js, demande du 22/10).
//  - CHOISIR PLUSIEURS diapositives (ce que fait tout éditeur de diapositives) : Ctrl+clic (Cmd+clic) ajoute une miniature au choix ou l'en retire, Maj+clic choisit de la dernière
//    miniature cliquée jusqu'à celle-ci ; au clavier, Maj+↑ et Maj+↓ étendent le choix, Ctrl+A choisit tout, Échap le défait. « Dupliquer », « Monter », « Descendre », « Supprimer »
//    (menu, Ctrl+↑, Ctrl+↓, Suppr), Ctrl+C et le glisser s'appliquent alors à toutes, dans leur ordre, en une transaction (un seul Ctrl+Z). Un clic simple, une frappe ou un Ctrl+Z
//    ramènent le choix à la seule diapositive du curseur.
//  - COPIER et COLLER une diapositive (Ctrl+C, Ctrl+V, demande du 21/10), d'une présentation à l'autre et d'un onglet du navigateur à l'autre : Ctrl+C copie celle de la miniature qui a
//    le clavier, ou, dans le texte, celle du curseur quand rien n'y est sélectionné ; Ctrl+V colle après celle de la miniature ce que porte le presse-papiers, et dans le texte, seule une
//    diapositive copiée se colle ainsi, après celle du curseur (le reste se colle au curseur, comme toujours). Le coin d'état dit la copie ; un seul Ctrl+Z défait le collage. Les images
//    en calque de la diapositive collée se posent sur ses pages, au même endroit que sur celle qui a été copiée. Légers sur une diapositive chargée : la copie ne lit que ses blocs, et le
//    collage ne repagine l'éditeur qu'une fois. L'extension éteinte, Ctrl+C et Ctrl+V sur une miniature expliquent pourquoi (SlidesEntry.explainOff), et le texte copie et colle comme
//    toujours.
//  - IMPORTER une diapositive d'une autre présentation du document (demande du 21/10, carte « Volet ») : « Importer », à droite d'« Ajouter », ouvre et ferme le volet de droite
//    (extensions/diapositives/slide-import.js), dont chaque miniature se copie après la diapositive du curseur, par le même collage qu'un Ctrl+V (importAfterCurrent) ; avec « Garder
//    liée », la copie reste liée à sa source (js/slide-links.js).
//  - Une diapositive LIÉE porte une pastille sous son numéro (le sens du lien, un cadenas quand une autre présentation l'envoie ici, la source disparue, deux versions qui diffèrent),
//    que le nom de sa miniature dit aussi ; son menu ⋯ a les lignes du lien : à quoi elle est liée, « Dans les deux sens », « Suit la source », « Envoie à la source », « Comparer les
//    deux versions » quand elles diffèrent, « Détacher » (slide-links-ui.js). Les images en calque d'une diapositive qui vient de prendre celle d'une autre présentation se posent sur
//    ses pages (settleLinked).
//  - Les MINIATURES : des copies du rendu de l'éditeur (ses blocs de premier niveau, les images en calque replacées sur leur page), à la taille de la page puis réduites à la largeur de
//    la miniature : le texte s'y coupe aux mêmes endroits. L'en-tête, le pied et les images répétées sur toutes les pages n'y sont pas. Elles se refont après une pause de la frappe, et
//    seulement pour les diapositives qui ont changé. LÉGÈRES sur une présentation chargée (70 diapositives d'images, de graphiques et de tableaux, demande du 21/10) : seules celles que
//    la bande montre, et un peu au-delà, sont copiées (les autres le sont quand la bande défile jusqu'à elles) ; une diapositive qui ne fait que changer de place (monter, descendre,
//    supprimer celle d'avant) garde sa miniature, sans la recopier.
//  - Les IMAGES EN CALQUE (« Devant le texte », « Derrière le texte » : formes, photos posées sur la page) suivent leur diapositive : quand elle change de page (monter, descendre,
//    ajouter, dupliquer ou supprimer une diapositive avant elle, une diapositive d'avant qui se met à dépasser ou cesse de dépasser, un saut de page posé ou effacé dans le texte), elles
//    avancent ou reculent d'autant de pages, dans l'éditeur, la Lecture, le PDF et le Word ; un Ctrl+Z défait le geste et ce qu'il a fait avancer. Dans un document, une image en
//    calque reste sur sa page. Une image répétée sur toutes les pages reste où elle est.
//  - La TRANSITION d'une diapositive (demande du 21/10 à 18:35) : la ligne « Transition… » de son menu ⋯ ouvre la fenêtre de réglage (slide-transitions-ui.js) pour elle ou pour tout le choix ; une
//    pastille sous son numéro dit qu'elle en a une (js/slide-props.js la garde dans le texte de la diapositive, si bien que la déplacer, la dupliquer ou la copier l'emporte avec elle).
//  - Le FOND d'une diapositive (demande du 21/10 à 18:35) : la ligne « Fond… » du même menu ouvre sa fenêtre (slide-background-ui.js) ; la miniature le montre (elle copie le rendu de l'éditeur, où
//    le repère de la diapositive, js/slide-props.js, dessine le fond), sans pastille de plus.
//  - Les NOTES de l'intervenant d'une diapositive (demande du 21/10 à 18:35, la parité avec PowerPoint) : la ligne « Notes… » du même menu ouvre leur fenêtre (slide-notes-ui.js), pour une diapositive à
//    la fois (grisée quand plusieurs miniatures sont choisies) ; une pastille sous la transition dit qu'elle en a, et son info-bulle (comme le nom de la miniature) en donne le début. Les notes
//    vivent dans le repère de la diapositive (js/slide-props.js) et ne sortent que dans l'export PowerPoint (le volet « Notes » de la diapositive).
//  - Le MASQUAGE d'une diapositive (chantier 8 de l'import PowerPoint) : la ligne « Masquer » (« Afficher » quand tout le choix l'est déjà) du même menu ; le diaporama saute la diapositive, la
//    Lecture, le PDF et le Word la gardent. Sa miniature est atténuée et porte une pastille (l'œil barré), dite par l'info-bulle et par le nom de la miniature. Le passage seul à la suivante
//    se règle dans la fenêtre « Transition… » ; sa pastille est celle de la transition.
//  - Une diapositive dont le contenu DÉPASSE de sa page continue sur une page de plus, comme un document (carte du 19/10, « Continuer ») : sa miniature porte un point rouge, et la liste
//    le dit. Lu sur la pagination de l'éditeur (HeaderFooterPreview.pageBreaks) : une coupure qui n'est pas un saut de page tombe dans cette diapositive.
//  - GFS éteint l'extension pendant que la présentation est ouverte : la bande reste et ses miniatures mènent toujours à leur diapositive ; ses gestes sont grisés avec leur raison, et
//    leur clic explique (SlidesEntry.explainOff).
//  - Pendant l'écriture d'un en-tête ou d'un pied de page, l'éditeur porte leur texte, pas celui des diapositives : la bande ne bouge pas, et un geste referme d'abord l'en-tête.
//  - La barre de GFS (consigne GFS 025) recouvre le cadre au bord que la personne a choisi, centrée sur lui : à gauche (le bord par défaut) elle tombe sur la bande. Ce qu'elle en mord
//    (GfsBar.bite), la bande le cède : elle s'élargit de cette profondeur, une gouttière à gauche que la barre occupe, et la page lui laisse la même place (`--pp-slide-strip-bar`) ; aux
//    autres bords, dans un cadre étroit, elle perd la hauteur mordue. Les miniatures et « Ajouter » ne bougent pas et la barre n'en recouvre aucune.
// Styles : extensions/diapositives/slide-strip.css (dont la place que la bande prend à gauche du document, `body.pp-slide-strip-on`).
const SlideStrip = (function () {
  const el = Dom.el;
  const THUMB_WIDTH_PX = 80;       // la largeur d'une miniature ; sa hauteur suit la page
  const REDRAW_DELAY_MS = 200;     // les miniatures se refont après une pause de la frappe, pas à chaque lettre
  const DRAW_AHEAD_PX = 300;       // au-delà de ce que la bande montre, la hauteur de miniatures déjà copiées, au-dessus et au-dessous
  const IMAGE_SETTLE_MS = 1500;    // après un collage, l'attente au plus des images qui se chargent avant de repaginer (comme la Lecture, js/reader-mode.js:settleImages)
  const DRAG_START_PX = 5;         // bouton enfoncé sur une miniature, la souris qui bouge de plus la glisse ; de moins, c'est un clic
  const DRAG_EDGE_PX = 24;         // une miniature glissée près du haut ou du bas de la bande la fait défiler, d'autant plus vite que la souris en est près
  const DRAG_SCROLL_PX = 14;       // ce défilement, au plus, à chaque image
  const PT_TO_PX = PageLayout.MM_TO_PX / PageLayout.MM_TO_PT;
  // Les lignes du menu d'une diapositive, dans l'ordre ; null : un filet.
  const MENU = ['addAfter', 'duplicate', null, 'moveUp', 'moveDown', null, 'transition', 'background', 'notes', 'hide', null, 'delete'];
  const NOTES_EXCERPT = 60;        // le début des notes que dit la pastille de la miniature, en caractères
  // Puis, sous un filet, les lignes du lien d'une diapositive liée (slide-links-ui.js), montrées pour elle seule ; les trois premières sont les sens du lien (js/slide-links.js:MODES).
  const LINK_MENU = ['linkBoth', 'linkPull', 'linkPush', 'linkCompare', 'linkDetach'];
  const LINK_MODES = { linkBoth: 'both', linkPull: 'pull', linkPush: 'push' };
  // Les mises en page que propose « Ajouter » (carte du 21/10, « Menu de mises en page ») : du texte déjà posé, à remplacer, dans la langue de l'interface (layoutNodes).
  const LAYOUTS = ['blank', 'title', 'titleContent', 'twoColumns', 'section'];
  // L'enveloppe du HTML d'une diapositive copiée (slideForClipboard), qui porte la première page de cette diapositive (vide quand la pagination ne la dit pas) ; un Ctrl+V la cherche
  // au début du presse-papiers (SLIDE_HEAD_CHARS), où le navigateur la laisse, sans lire le reste (les images d'une diapositive chargée y pèsent des mégaoctets).
  const SLIDE_MARK = 'data-pp-slide';
  const SLIDE_HEAD = /<div\b[^>]*\sdata-pp-slide(?:="(\d*)")?(?=[\s/>])/i;
  const SLIDE_HEAD_CHARS = 4096;

  let strip = null;                // la bande (<aside>), créée au premier affichage
  let list = null;                 // la liste des miniatures
  let actionsRow = null;           // la rangée des deux boutons du bas : « Ajouter » et « Importer » (l'ancre de leurs menus)
  let addButton = null;
  let importButton = null;         // « Importer », qui ouvre et ferme le volet d'import (SlideImport)
  let menu = null;                // le menu d'une diapositive : { panel, index, open, pointer }
  let layoutMenu = null;           // le menu des mises en page de « Ajouter » : { panel, open, pointer }
  let drag = null;                 // la miniature glissée (onDragStart), de l'appui au relâchement
  let dragJustEnded = false;       // le clic qui suit un glisser ne va pas à la miniature lâchée
  let editor = null;               // l'éditeur suivi tant que la bande est montrée
  let shown = false;
  let off = false;                 // l'extension est éteinte : les gestes sont grisés
  let slides = [];                 // les diapositives du texte (slidesOf)
  let readDoc = null;              // le texte d'où `slides` a été lu
  let rows = [];                   // une rangée par diapositive : { row, item, num, dot, link, linkLook, trans, transLook, notes, notesLook, thumb, page, more, nodes, sizedFor, near }
  let current = 0;                 // la diapositive du curseur
  let picked = [];                 // les diapositives choisies ensemble, dans l'ordre (Ctrl+clic, Maj+clic, Maj+↑ ↓, Ctrl+A) ; vide ou une seule : celle du curseur
  let anchor = 0;                  // d'où part un Maj+clic ou un Maj+↑ ↓ : la dernière miniature cliquée ou atteinte sans Maj
  let overflowing = new Set();     // les diapositives qui dépassent de leur page
  let framesOut = new Set();       // celles dont un cadre dépasse de la page (le CSS l'y rogne)
  let redrawTimer = null;
  let stopPaginated = null;
  let resizeObserver = null;
  let stopBar = null;              // se désabonne de la barre de GFS
  let gutter = 0;                  // ce que la barre de GFS mord de la bande, en px (la gouttière qu'elle occupe à gauche)
  let nearObserver = null;         // dit quelles rangées la bande montre, ou presque (DRAW_AHEAD_PX) : leurs miniatures seules se copient
  // Les images en calque (followLayers) : pour chacune, la première page de sa diapositive à la dernière pagination où la bande l'a vue, et si elle est posée sur la page même (`flat`,
  // pas dans une case ni une colonne, qui la placent elles-mêmes) ; la dernière pagination lue (readLayout) ; la dernière transaction qui a changé le texte.
  const anchors = new WeakMap();
  let layout = null;
  let layerTrigger = null;
  let settling = [];               // les images en calque arrivées d'une autre présentation (settleLinked), à poser sur les pages de leur diapositive à la pagination qui suit
  const LAYERS_META = 'ppSlideLayers';
  // Une transaction d'un geste de la bande : elle garde le choix de plusieurs diapositives, que toute autre (une frappe, un Ctrl+Z, un collage) ramène à celle du curseur.
  const STRIP_META = 'ppSlideStrip';

  const container = () => document.getElementById('editor-container');
  const editingHeaderFooter = () => Editor.isEditingHeaderFooter();

  // Les diapositives
  // Celles du texte `doc`, dans l'ordre : { start, end, breakBefore, breakAfter, nodes } (`start` et `end` bornent ses blocs ; `breakBefore` et `breakAfter`, la position des sauts de
  // page qui l'encadrent, null au bout du texte ; `nodes`, ses blocs { node, pos }).
  function slidesOf(doc) {
    const found = [];
    let slide = { start: 0, breakBefore: null, nodes: [] };
    doc.forEach((node, pos) => {
      if (node.type.name !== 'pageBreak') { slide.nodes.push({ node, pos }); return; }
      found.push(Object.assign(slide, { end: pos, breakAfter: pos }));
      slide = { start: pos + node.nodeSize, breakBefore: pos, nodes: [] };
    });
    found.push(Object.assign(slide, { end: doc.content.size, breakAfter: null }));
    return found;
  }
  // La diapositive de la position `pos` (un saut de page compte pour celle qu'il termine).
  function slideAt(pos) {
    const index = slides.findIndex(slide => pos <= slide.end);
    return index < 0 ? slides.length - 1 : index;
  }
  // Le curseur au début du texte de `slide` dans `doc`, ou null quand elle n'a aucun endroit où écrire (deux sauts de page de suite). Les cadres de texte libres qui ouvrent la diapositive
  // (js/free-frame.js) ne sont pas son texte : le curseur va derrière eux, et dans le premier cadre seulement quand elle n'a que des cadres.
  function selectionIn(doc, slide) {
    if (!slide) return null;
    const found = FreeFrame.flowSelection(doc, slide) || EditorCore.getTextSelectionClass().findFrom(doc.resolve(slide.start), 1, true);
    return found && found.from <= slide.end ? found : null;
  }

  // Les images en calque suivent leur diapositive
  // Une image « Devant le texte » ou « Derrière le texte » est posée sur une page : sa grille (pageIndex, pageLeftPt, pageTopPt) la place dans la Lecture, le PDF et le Word, et son
  // `top`, compté depuis le haut du texte, la dessine dans l'éditeur. Un document la laisse sur sa page quand le texte d'avant grandit ; une présentation la range dans sa diapositive :
  // quand la première page de celle-ci change, l'image change d'autant de pages.
  // Les images en calque des diapositives `list` du texte `doc`, sauf les répétées sur toutes les pages (elles sont partout) : fn(node, pos, index), `index` celui de la diapositive.
  function eachLayer(doc, list, fn) {
    list.forEach((slide, index) => {
      if (slide.end <= slide.start) return;
      doc.nodesBetween(slide.start, slide.end, (node, pos) => {
        if (node.type.name !== 'editorImage') return true;
        const a = node.attrs;
        if (a.layer && a.layer !== 'normal' && Number.isFinite(a.pageIndex) && !PageLayer.isRepeatedAttrs(a)) fn(node, pos, index);
        return false;
      });
    });
  }
  // La pagination que l'éditeur vient de poser, ou null sans elle (pas d'aperçu de la page) : la première page de chaque diapositive (`first` : une coupure après un saut de page ouvre la
  // suivante, une autre, ce qui dépasse, ajoute une page à la sienne), le haut du corps de chaque page (`tops`, HeaderFooterPreview.pageBodyTops) et le nombre de pages de chaque
  // diapositive, rangé par son premier bloc (`pagesOf`), d'où predictLayers prévoit le geste suivant.
  function readLayout() {
    const tops = HeaderFooterPreview.pageBodyTops();
    if (!tops || !tops.length) return null;
    const cuts = new Set(HeaderFooterPreview.pageBreaks().map(brk => brk.afterEl));
    const first = [0];
    let page = 0;
    Array.from(editor.view.dom.children).forEach((child) => {
      if (cuts.has(child)) page += 1;
      if (child.classList.contains('page-break-marker')) first.push(page);
    });
    if (first.length !== slides.length) return null;
    const pagesOf = new WeakMap();
    slides.forEach((slide, index) => {
      if (slide.nodes.length) pagesOf.set(slide.nodes[0].node, (index + 1 < first.length ? first[index + 1] : tops.length) - first[index]);
    });
    return { first, tops, pagesOf };
  }
  // Le haut du corps de la page `page` d'après `tops`, prolongé au-delà de la dernière page connue (les pages se suivent au même pas) ; null quand une seule page ne dit pas ce pas.
  function bodyTopOf(tops, page) {
    if (page < tops.length) return tops[page];
    if (tops.length < 2) return null;
    const last = tops.length - 1;
    return tops[last] + (page - last) * (tops[last] - tops[last - 1]);
  }
  // Les réglages d'une image en calque posée en page `page` : sa page et, posée sur la page même, son `top` relu sur sa grille (comme HeaderFooterPreview.reconcileLayerImagesWithGrid au
  // chargement) ; null quand la page visée n'a pas de place connue.
  function layerOnPage(attrs, page, flat, tops) {
    const next = Object.assign({}, attrs, { pageIndex: page });
    if (flat && Number.isFinite(attrs.pageTopPt)) {
      const top = bodyTopOf(tops, page);
      if (top == null) return null;
      next.top = Math.round(top + attrs.pageTopPt * PT_TO_PX);
    }
    return next;
  }
  // Une image en calque dont la diapositive avance de `delta` pages, dans un texte de `count` pages : ses réglages sur sa nouvelle page (layerOnPage) ; null quand sa page ne change pas.
  function shiftedLayer(attrs, delta, flat, tops, count) {
    const page = Math.max(0, Math.min(attrs.pageIndex + delta, count - 1));
    return page === attrs.pageIndex ? null : layerOnPage(attrs, page, flat, tops);
  }
  // L'image en calque de la position `pos` est-elle posée sur la page même (pas dans une case ni une colonne, qui la placent elles-mêmes) ?
  function flatAt(pos) {
    const dom = editor.view.nodeDOM(pos);
    return !!dom && dom.offsetParent === editor.view.dom;
  }
  // Avant qu'un geste de la bande ne passe : les images en calque des diapositives qu'il fait changer de page changent de page dans la même transaction (un Ctrl+Z défait tout, et
  // l'éditeur ne se repagine qu'une fois), d'après les pages que prenait chaque diapositive à la dernière pagination (une nouvelle en prend une). Après la pagination, followLayers
  // rattrape ce que la prévision a manqué.
  function predictLayers(tr) {
    if (!layout) return;
    const next = slidesOf(tr.doc);
    const first = [];
    let count = 0;
    next.forEach((slide) => { first.push(count); count += (slide.nodes.length && layout.pagesOf.get(slide.nodes[0].node)) || 1; });
    const moved = [];
    eachLayer(tr.doc, next, (node, pos, index) => {
      const seen = anchors.get(node);
      if (!seen || seen.page === first[index]) return;
      const attrs = shiftedLayer(node.attrs, first[index] - seen.page, seen.flat, layout.tops, count);
      if (attrs) moved.push({ pos, attrs, seen: { page: first[index], flat: seen.flat } });
    });
    moved.forEach((m) => {
      tr.setNodeMarkup(m.pos, undefined, m.attrs);
      anchors.set(tr.doc.nodeAt(m.pos), m.seen);
    });
  }
  // Après chaque pagination : une image en calque dont la diapositive n'a plus la même première page change d'autant de pages, dans une transaction rangée dans l'événement
  // d'historique de celle qui l'a causé (le contrat de prosemirror-history qu'emploient aussi les largeurs de colonnes, js/editor.js), hors suivi des modifications ; une transaction
  // venue d'une autre personne (écriture en direct) est suivie chez elle. Puis chaque image note la première page de sa diapositive.
  function followLayers() {
    const next = readLayout();
    layout = next;
    if (!next) return;
    const { view } = editor;
    const patches = [];
    eachLayer(editor.state.doc, slides, (node, pos, index) => {
      const seen = anchors.get(node);
      if (!seen || seen.page === next.first[index]) return;
      const attrs = shiftedLayer(node.attrs, next.first[index] - seen.page, seen.flat, next.tops, next.tops.length);
      if (attrs) patches.push({ pos, attrs, flat: seen.flat });
    });
    const remote = !!layerTrigger && LiveEntry.isRemote(layerTrigger);
    const flats = new Map();
    if (patches.length && !remote) {
      const tr = editor.state.tr;
      patches.forEach((p) => { tr.setNodeMarkup(p.pos, undefined, p.attrs); flats.set(p.pos, p.flat); });
      if (layerTrigger) tr.setMeta('appendedTransaction', layerTrigger.getMeta('appendedTransaction') || layerTrigger);
      else tr.setMeta('addToHistory', false);
      tr.setMeta(LAYERS_META, true);
      TrackChanges.skipTracking(tr);
      view.dispatch(tr);
    }
    eachLayer(editor.state.doc, slides, (node, pos, index) => {
      const seen = anchors.get(node);
      let flat = seen ? seen.flat : flats.get(pos);
      if (flat === undefined) flat = flatAt(pos);
      anchors.set(node, { page: next.first[index], flat });
    });
  }

  // La page des miniatures : celle du modèle ouvert (PageLayout), en pixels CSS, et l'échelle qui la ramène à la largeur d'une miniature. `key` change avec elle.
  function pageGeometry() {
    const width = PageLayout.getSheetWidthPx();
    const height = PageLayout.getPageSizePx().height;
    const margins = PageLayout.getMarginsPx();
    return { width, height, margins, scale: THUMB_WIDTH_PX / width, key: [width, height, margins.top, margins.right, margins.bottom, margins.left].join(' ') };
  }

  // La bande
  function build() {
    if (strip) return;
    strip = el('aside', 'pp-slide-strip');
    strip.hidden = true;
    // Ctrl+Z et Ctrl+Y sur une miniature se traitent ici (undoRedo) et gardent le clavier dans la bande : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche (`data-own-undo`).
    strip.setAttribute('data-own-undo', '');
    strip.setAttribute('aria-label', I18n.t('slides.strip.label'));
    list = el('div', 'pp-slide-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', I18n.t('slides.strip.label'));
    list.setAttribute('aria-orientation', 'vertical');
    list.setAttribute('aria-multiselectable', 'true');
    // Les boutons du bas sur UNE ligne (carte du 22/10, « Trois icônes sur une ligne » : « Objets », le troisième, est depuis dans la barre d'outils du haut, js/objects-menu.js), un carré d'une
    // icône chacun : leur nom est l'info-bulle (syncOff) et le nom accessible, et la liste des miniatures garde la place que des boutons empilés lui prenaient.
    actionsRow = el('div', 'pp-slide-actions');
    addButton = Dom.button('pp-slide-add');
    addButton.setAttribute('aria-haspopup', 'menu');
    addButton.setAttribute('aria-expanded', 'false');
    addButton.innerHTML = Icons.svg('slideAdd');
    hideIcon(addButton);
    importButton = Dom.button('pp-slide-add pp-slide-import-open');
    Dom.setMarkup(importButton, Icons.svg('slideImport'));
    importButton.setAttribute('aria-expanded', 'false');
    hideIcon(importButton);
    actionsRow.append(addButton, importButton);
    strip.append(list, actionsRow);
    document.body.appendChild(strip);
    wireList();
    wireAddButton();
    wireImportButton();
  }
  const hideIcon = button => { const svg = button.querySelector('svg'); if (svg) svg.setAttribute('aria-hidden', 'true'); };

  // Une rangée : la miniature (une option de la liste) et son bouton « ⋯ », pour la souris seulement (le clavier ouvre le même menu par Maj+F10).
  function makeRow() {
    const row = el('div', 'pp-slide-row');
    row.setAttribute('role', 'none');
    const item = el('div', 'pp-slide-item');
    item.setAttribute('role', 'option');
    item.tabIndex = -1;
    const side = el('div', 'pp-slide-side');
    side.setAttribute('aria-hidden', 'true');
    const num = el('span', 'pp-slide-num');
    const dot = el('span', 'pp-slide-overflow');
    dot.hidden = true;
    const link = el('span', 'pp-slide-link-badge');
    link.hidden = true;
    const trans = el('span', 'pp-slide-trans-badge');
    trans.hidden = true;
    const notes = el('span', 'pp-slide-notes-badge');
    notes.hidden = true;
    const hid = el('span', 'pp-slide-hidden-badge');
    hid.hidden = true;
    side.append(num, dot, link, trans, notes, hid);
    const thumb = el('div', 'pp-slide-thumb');
    thumb.setAttribute('aria-hidden', 'true');
    const page = el('div', 'pp-slide-page tiptap');
    page.inert = true;
    thumb.appendChild(page);
    item.append(side, thumb);
    const more = Dom.button('pp-slide-more');
    more.tabIndex = -1;
    more.title = I18n.t('slides.strip.more');
    more.setAttribute('aria-hidden', 'true');
    more.innerHTML = Icons.svg('more');
    hideIcon(more);
    row.append(item, more);
    list.appendChild(row);
    // Sans observateur (navigateur ancien), toutes les miniatures se copient, comme avant.
    if (nearObserver) nearObserver.observe(row);
    return { row, item, num, dot, link, linkLook: '', trans, transLook: '', notes, notesLook: '', hid, hidLook: false, thumb, page, more, nodes: null, sizedFor: '', near: !nearObserver };
  }
  function removeRow(r) {
    if (nearObserver) nearObserver.unobserve(r.row);
    r.row.remove();
  }
  const rowOf = target => rows.find(r => r.row.contains(target)) || null;
  // La rangée `r` montre-t-elle les blocs `nodes` (les mêmes objets) ?
  const shows = (r, nodes) => !!r.nodes && r.nodes.length === nodes.length && r.nodes.every((node, k) => node === nodes[k]);

  // Une rangée par diapositive, dans l'ordre. Celle qui montre déjà les blocs d'une diapositive la garde, même ailleurs dans la liste : une diapositive qui ne fait que changer de place
  // (monter, descendre, supprimer celle d'avant, en ajouter une avant) garde sa miniature. Les autres reprennent une rangée libre, à refaire, ou une nouvelle. Vrai quand une rangée a
  // été ajoutée, retirée ou déplacée.
  function matchRows() {
    const wanted = slides.map(slide => slide.nodes.map(entry => entry.node));
    const next = wanted.map(() => null);
    const free = new Set(rows);
    // À sa place d'abord (la frappe ne change qu'une diapositive), puis ailleurs ; une diapositive dupliquée a les blocs de l'original : l'une ou l'autre rangée lui va.
    wanted.forEach((nodes, i) => {
      if (rows[i] && shows(rows[i], nodes)) { next[i] = rows[i]; free.delete(rows[i]); }
    });
    const byFirst = new Map();
    free.forEach((r) => {
      if (!r.nodes || !r.nodes.length) return;
      if (!byFirst.has(r.nodes[0])) byFirst.set(r.nodes[0], []);
      byFirst.get(r.nodes[0]).push(r);
    });
    wanted.forEach((nodes, i) => {
      if (next[i] || !nodes.length) return;
      const r = (byFirst.get(nodes[0]) || []).find(candidate => free.has(candidate) && shows(candidate, nodes));
      if (r) { next[i] = r; free.delete(r); }
    });
    const spare = rows.filter(r => free.has(r));
    let changed = rows.length !== next.length;
    next.forEach((r, i) => { if (!r) next[i] = spare.shift() || makeRow(); });
    spare.forEach(removeRow);
    // Dans l'ordre des diapositives, en ne déplaçant que les rangées qui ne sont pas à leur place. Une rangée déplacée perd le clavier (le navigateur le rend à la page) : la
    // miniature qui l'avait le reprend, elle suit sa diapositive.
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    let at = list.firstElementChild;
    next.forEach((r) => {
      if (r.row === at) { at = at.nextElementSibling; return; }
      list.insertBefore(r.row, at);
      changed = true;
    });
    if (focused && focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    rows = next;
    return changed;
  }

  // Relit les diapositives quand le texte a changé et met les rangées d'accord (nombre, numéros, ce qui dépasse) ; puis la diapositive du curseur et le grisé. `thumbs` : refait aussi
  // les miniatures qui ont changé. Rien pendant l'écriture d'un en-tête : l'éditeur porte alors son texte.
  function refresh(thumbs) {
    if (!editor || editingHeaderFooter()) return;
    const doc = editor.state.doc;
    let moved = false;
    if (doc !== readDoc) {
      slides = slidesOf(doc);
      readDoc = doc;
      moved = matchRows();
      rows.forEach((r, i) => { const n = String(i + 1); if (r.num.textContent !== n) r.num.textContent = n; });
      syncLinks(true);
      syncTransitions();
      syncNotes();
      syncHidden();
      syncOverflow();
    }
    if (thumbs) drawThumbs();
    syncCurrent(moved);
    syncOff();
    // Le volet d'import dit après quelle diapositive il copie : celle du curseur.
    if (typeof SlideImport !== 'undefined') SlideImport.sync(false);
  }

  // Les miniatures
  function scheduleThumbs() {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(drawThumbs, REDRAW_DELAY_MS);
  }
  // Refait la miniature des diapositives dont les blocs ont changé (un bloc que le texte n'a pas touché reste le même objet d'une transaction à l'autre), toutes quand la page a changé ;
  // seulement celles que la bande montre, ou presque (`near`) : les autres se copient quand elle défile jusqu'à elles (onNear). Chaque rangée prend la hauteur de la page, copiée ou non.
  function drawThumbs() {
    clearTimeout(redrawTimer);
    redrawTimer = null;
    if (!editor || editingHeaderFooter()) return;
    if (editor.state.doc !== readDoc) refresh(false);
    const geometry = pageGeometry();
    const due = [];
    rows.forEach((r, i) => {
      if (r.sizedFor !== geometry.key) { sizeThumb(r, geometry); r.nodes = null; }
      const nodes = slides[i].nodes.map(entry => entry.node);
      if (r.near && !shows(r, nodes)) due.push({ r, slide: slides[i], nodes });
    });
    // Toutes les copies d'abord, puis toutes les écritures : copier lit la mise en page de l'éditeur (placeLayers), qu'une écriture dans la bande obligerait à refaire.
    const copies = due.map(({ slide }) => copiesOf(slide, geometry));
    due.forEach(({ r, nodes }, k) => { r.page.replaceChildren(...copies[k]); r.nodes = nodes; });
  }
  // Les rangées qui entrent dans la bande, ou presque, copient leur miniature quand elle n'est pas à jour (une pause de la frappe attendue les copiera aussi).
  function onNear(entries) {
    let arrived = false;
    entries.forEach((entry) => {
      const r = rows.find(candidate => candidate.row === entry.target);
      if (!r) return;
      if (entry.isIntersecting && !r.near) arrived = true;
      r.near = entry.isIntersecting;
    });
    if (arrived && shown && !redrawTimer) drawThumbs();
  }
  function sizeThumb(r, geometry) {
    r.sizedFor = geometry.key;
    r.thumb.style.height = Math.round(geometry.height * geometry.scale) + 'px';
    r.page.style.width = geometry.width + 'px';
    r.page.style.height = geometry.height + 'px';
    r.page.style.transform = 'scale(' + geometry.scale + ')';
  }
  // La miniature d'une diapositive : une copie du rendu de ses blocs dans l'éditeur, sans ce qui ne sert qu'à écrire (sélection, poignées, texte indicatif).
  function copiesOf(slide, geometry) {
    const view = editor.view;
    const copies = [];
    slide.nodes.forEach(({ node, pos }) => {
      const original = view.nodeDOM(pos);
      if (!(original instanceof HTMLElement)) return;
      const copy = original.cloneNode(true);
      tidyCopy(copy);
      placeLayers(copy, original, node, pos, geometry);
      copies.push(copy);
    });
    return copies;
  }
  function tidyCopy(copy) {
    copy.querySelectorAll('.editor-image-handle, .editor-image-move-handle, .column-resize-handle, .ProseMirror-gapcursor').forEach(node => node.remove());
    [copy, ...copy.querySelectorAll('*')].forEach((node) => {
      node.removeAttribute('id');
      node.removeAttribute('data-placeholder');
      Array.from(node.classList).filter(name => /selected/i.test(name) || name === 'is-editor-empty' || name === 'has-focus').forEach(name => node.classList.remove(name));
    });
  }
  // Une image en calque se place par son `top`, compté depuis le haut du texte entier de l'éditeur : dans la miniature, elle reprend sa place sur sa page, celle de sa grille (`pageTopPt`,
  // depuis le haut du corps de la page). Sans grille, ou posée dans un bloc qui la place lui-même (une case), elle garde son `top`.
  function placeLayers(copy, original, node, pos, geometry) {
    const originals = Array.from(original.querySelectorAll('.editor-image-layered'));
    if (!originals.length) return;
    const copied = copy.querySelectorAll('.editor-image-layered');
    const view = editor.view;
    node.descendants((child, offset) => {
      const attrs = child.attrs || {};
      if (!attrs.layer || attrs.layer === 'normal' || attrs.pageTopPt == null) return;
      const dom = view.nodeDOM(pos + 1 + offset);
      const at = originals.indexOf(dom);
      if (at < 0 || !copied[at] || dom.offsetParent !== view.dom) return;
      copied[at].style.top = (geometry.margins.top + attrs.pageTopPt * PT_TO_PX) + 'px';
    });
  }

  // Ce qui dépasse de sa page : une coupure de la pagination qui n'est pas un saut de page, et la diapositive où elle tombe (comptée par les sauts de page qui la précèdent) ; un cadre libre
  // dont la boîte sort de la page (FreeFrame.overflowsPage : l'ancre n'a aucune hauteur, la pagination ne le voit jamais). Le même point rouge, son info-bulle dit lequel des deux.
  function syncOverflow() {
    overflowing = new Set();
    framesOut = new Set();
    const slideOf = new Map();
    let index = 0;
    Array.from(editor.view.dom.children).forEach((child) => {
      if (child.classList.contains('page-break-marker')) { index += 1; return; }
      slideOf.set(child, index);
      if (child.classList.contains(FreeFrame.CLASS) && !framesOut.has(index) && FreeFrame.overflowsPage(child)) framesOut.add(index);
    });
    HeaderFooterPreview.pageBreaks().forEach((brk) => { if (slideOf.has(brk.afterEl)) overflowing.add(slideOf.get(brk.afterEl)); });
    rows.forEach((r, i) => {
      const why = overflowWhy(i);
      r.dot.hidden = !why.length;
      const tip = why.join(' · ');
      if (r.dot.title !== tip) r.dot.title = tip;
    });
    labelRows();
  }
  // Ce que dit le point rouge d'une diapositive : son texte qui passe sur une diapositive de plus, un cadre qui sort de la page (rien : pas de point).
  function overflowWhy(i) {
    const why = [];
    if (overflowing.has(i)) why.push(I18n.t('slides.strip.overflow'));
    if (framesOut.has(i)) why.push(I18n.t('slides.strip.frameOverflow'));
    return why;
  }
  // Le nom de chaque miniature : son rang, puis ce qui dépasse, son lien, sa transition et ses notes quand elle en a.
  function labelRows() {
    rows.forEach((r, i) => {
      const parts = [I18n.t('slides.strip.item', { n: i + 1, total: rows.length })];
      parts.push(...overflowWhy(i));
      if (r.linkLook) parts.push(r.link.title);
      if (r.transLook) parts.push(r.trans.title);
      if (r.notesLook) parts.push(r.notes.title);
      if (r.hidLook) parts.push(r.hid.title);
      const name = parts.join(' · ');
      if (r.item.getAttribute('aria-label') !== name) r.item.setAttribute('aria-label', name);
    });
  }
  // Les pastilles des diapositives liées (js/slide-links.js:infoList), rappelées par le module des liens quand un lien change (une synchro, un sens, « Détacher ») et par la bande à
  // chaque changement du texte (`quiet` : les noms des miniatures suivront avec syncOverflow) : le sens du lien, le cadenas d'une diapositive qu'une autre présentation envoie ici, la
  // source disparue, une couleur quand les deux versions diffèrent ; son info-bulle le dit.
  function syncLinks(quiet) {
    if (!editor || editingHeaderFooter()) return;
    const links = typeof SlideLinksUi === 'undefined' ? [] : SlideLinks.infoList(editor);
    rows.forEach((r, i) => {
      const look = links[i] ? linkLook(links[i]) : null;
      const key = look ? look.icon + '|' + look.text + '|' + look.differs : '';
      if (r.linkLook === key) return;
      r.linkLook = key;
      r.link.hidden = !look;
      if (!look) { r.link.replaceChildren(); r.link.removeAttribute('title'); return; }
      Dom.setMarkup(r.link, Icons.svg(look.icon));
      r.link.title = look.text;
      r.link.classList.toggle('pp-slide-link-differs', look.differs);
    });
    if (!quiet) labelRows();
  }
  // Les pastilles de transition (js/slide-props.js:listOf), sous le numéro : une diapositive qui a une transition porte l'icône, et son info-bulle (et le nom de la miniature) dit laquelle.
  function syncTransitions() {
    if (!editor || editingHeaderFooter() || typeof SlideTransitionsUi === 'undefined') return;
    const list = SlideProps.listOf(editor.state.doc);
    const timings = SlideProps.timingsOf(editor.state.doc);
    rows.forEach((r, i) => {
      const props = list[i] ? Object.assign({}, list[i], { advance: timings[i].advance }) : (timings[i].advance ? { advance: timings[i].advance } : null);
      const text = props ? I18n.t('slides.strip.transition', { name: SlideTransitionsUi.describe(props) }) : '';
      if (r.transLook === text) return;
      r.transLook = text;
      r.trans.hidden = !props;
      if (!props) { r.trans.replaceChildren(); r.trans.removeAttribute('title'); return; }
      Dom.setMarkup(r.trans, Icons.svg('slideTransition'));
      r.trans.title = text;
    });
  }
  // Les pastilles des diapositives masquées (js/slide-props.js:timingsOf) : la miniature est atténuée, l'œil barré dit qu'elle est sautée au diaporama.
  function syncHidden() {
    if (!editor || editingHeaderFooter()) return;
    const list = SlideProps.timingsOf(editor.state.doc);
    rows.forEach((r, i) => {
      const on = !!list[i].hidden;
      if (r.hidLook === on) return;
      r.hidLook = on;
      r.hid.hidden = !on;
      r.row.classList.toggle('pp-slide-is-hidden', on);
      if (!on) { r.hid.replaceChildren(); r.hid.removeAttribute('title'); return; }
      Dom.setMarkup(r.hid, Icons.svg('eyeOff'));
      r.hid.title = I18n.t('slides.strip.hidden');
    });
  }
  // Les pastilles de notes (js/slide-props.js:notesOf), sous celle de la transition : une diapositive qui a des notes porte l'icône, et son info-bulle (et le nom de la miniature) en dit le début.
  function syncNotes() {
    if (!editor || editingHeaderFooter()) return;
    const list = SlideProps.notesOf(editor.state.doc);
    rows.forEach((r, i) => {
      const text = list[i] || '';
      if (r.notesLook === text) return;
      r.notesLook = text;
      r.notes.hidden = !text;
      if (!text) { r.notes.replaceChildren(); r.notes.removeAttribute('title'); return; }
      Dom.setMarkup(r.notes, Icons.svg('slideNotes'));
      r.notes.title = I18n.t('slides.strip.notes', { text: excerptOf(text) });
    });
  }
  // Le début des notes, sur une ligne : les blancs réduits à une espace, coupé à NOTES_EXCERPT caractères (sans couper une paire de substitution).
  function excerptOf(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= NOTES_EXCERPT) return flat;
    const last = flat.charCodeAt(NOTES_EXCERPT - 1);
    return flat.slice(0, last >= 0xD800 && last <= 0xDBFF ? NOTES_EXCERPT - 1 : NOTES_EXCERPT).trimEnd() + '…';
  }
  function linkLook(info) {
    const differs = !!info.differs;
    if (info.kind === 'page') return info.missing ? { icon: 'unlink', text: I18n.t('slides.strip.pageMissing'), differs: false } : { icon: 'linkedPull', text: I18n.t('slides.strip.pageFollows', { name: info.name, n: info.n }), differs: false };
    if (info.kind === 'source') {
      if (!info.name) return { icon: 'link', text: I18n.t('slides.strip.linkIncoming'), differs };
      return { icon: 'slideLocked', text: I18n.t(differs ? 'slides.strip.linkIncoming' : 'slides.strip.linkLocked', { name: info.name }), differs };
    }
    if (info.missing) return { icon: 'unlink', text: I18n.t('slides.strip.linkMissing'), differs: false };
    const key = differs ? 'slides.strip.linkDiffers' : { both: 'slides.strip.linkBoth', pull: 'slides.strip.linkPull', push: 'slides.strip.linkPush' }[info.mode];
    return { icon: info.mode === 'pull' ? 'linkedPull' : info.mode === 'push' ? 'linkedPush' : 'link', text: I18n.t(key, { name: info.name }), differs };
  }
  // La diapositive du curseur : cochée, la seule que Tab atteint, gardée en vue dans la bande quand elle change ou que les rangées ont bougé (`moved`), pas à chaque frappe : lire la
  // place d'une rangée oblige le navigateur à refaire sa mise en page sur-le-champ.
  function syncCurrent(moved) {
    const before = current;
    current = slideAt(editor.state.selection.from);
    // Le curseur parti hors du choix (un clic dans le texte d'une autre diapositive) : le choix revient à la sienne.
    if (picked.length && (!picked.includes(current) || picked.some(i => i >= slides.length))) picked = [];
    const set = chosen();
    rows.forEach((r, i) => {
      r.item.setAttribute('aria-selected', set.includes(i) ? 'true' : 'false');
      r.item.tabIndex = i === current ? 0 : -1;
    });
    if (moved || current !== before) keepInView(rows[current]);
  }
  // Les diapositives sur lesquelles un geste agit : le choix de plusieurs, ou celle du curseur.
  const chosen = () => (picked.length > 1 ? picked : [current]);
  // Celles d'un geste sur la diapositive `index` : tout le choix quand elle en fait partie, elle seule sinon.
  const setFor = index => (picked.length > 1 && picked.includes(index) ? picked : [index]);
  // Le choix devient `list` (des indices, rangés et sans doublon) ; une seule : plus de choix, celle du curseur suffit.
  function pick(list) {
    picked = Array.from(new Set(list)).filter(i => i >= 0 && i < slides.length).sort((a, b) => a - b);
    if (picked.length < 2) picked = [];
  }
  const range = (from, to) => Array.from({ length: Math.abs(to - from) + 1 }, (_, k) => Math.min(from, to) + k);
  function keepInView(r) {
    if (!r) return;
    const top = r.row.offsetTop;
    const bottom = top + r.row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = Math.max(0, top - 8);
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }
  // « Ajouter » et « Importer » : grisés avec la raison quand l'extension est éteinte ; le nom d'« Ajouter » (son info-bulle et son nom accessible) dit après quelle diapositive il ajoute.
  function syncOff() {
    addButton.setAttribute('aria-disabled', off ? 'true' : 'false');
    addButton.setAttribute('aria-label', I18n.t('slides.strip.addTip', { n: current + 1 }));
    addButton.title = off ? SlidesEntry.reason() : I18n.t('slides.strip.addTip', { n: current + 1 });
    importButton.setAttribute('aria-disabled', off ? 'true' : 'false');
    importButton.setAttribute('aria-label', I18n.t('slides.import.buttonTip'));
    importButton.title = off ? SlidesEntry.reason() : I18n.t('slides.import.buttonTip');
    // « Présenter » (slide-show.js), à côté de la pastille du zoom : montré avec la bande, grisé avec elle, et son info-bulle dit la diapositive du curseur.
    if (typeof SlideShow !== 'undefined') SlideShow.sync(true, off);
  }

  // Aller à une diapositive
  // Le curseur au début du texte de la diapositive `index`, le document défilé jusqu'au haut de sa page. `focusEditor` : le clavier va au document.
  function goTo(index, focusEditor) {
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    const slide = slides[index];
    if (!slide) return;
    const { state, view } = editor;
    const selection = selectionIn(state.doc, slide);
    if (selection) view.dispatch(state.tr.setSelection(selection));
    scrollToSlide(index);
    if (focusEditor) view.focus();
  }
  // Le haut de la page où commence la diapositive `index` (celle qu'ouvre son saut de page, dans la pagination de l'éditeur) ; sans pagination, son premier bloc.
  function scrollToSlide(index) {
    const slide = slides[index];
    if (!slide) return;
    const view = editor.view;
    const marker = slide.breakBefore == null ? null : view.nodeDOM(slide.breakBefore);
    const page = marker ? HeaderFooterPreview.pageBreaks().findIndex(brk => brk.afterEl === marker) + 1 : 0;
    if ((!marker || page > 0) && HeaderFooterPreview.scrollToPage(page)) return;
    const first = slide.nodes.length ? view.nodeDOM(slide.nodes[0].pos) : marker;
    const box = container();
    if (!(first instanceof HTMLElement) || !box) return;
    const gap = parseFloat(getComputedStyle(box).paddingTop) || 0;
    box.scrollTop += first.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientTop - gap;
  }
  function focusItem(index) {
    const r = rows[index];
    if (r) r.item.focus();
  }

  // Les gestes
  // Le geste `action` sur la diapositive `index` (et tout le choix quand elle en fait partie, setFor), en UNE transaction ; le curseur va à la diapositive touchée, que le document
  // montre, et les diapositives déplacées ou dupliquées restent choisies. `byKeyboard` : le clavier reste dans la bande, sur elle ; à la souris, il va au document. `extra` : ce que le
  // geste précise (planOf).
  function act(action, index, byKeyboard, extra) {
    if (off) { SlidesEntry.explainOff(); return; }
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    // « Ajouter » ajoute après la diapositive visée, même dans un choix ; les autres gestes s'appliquent à tout le choix dont elle fait partie.
    const plan = planOf(action, action === 'addAfter' ? [index] : setFor(index), extra);
    if (!plan) return;
    const { state, view } = editor;
    const tr = state.tr;
    plan.apply(tr, state.schema);
    predictLayers(tr);
    const after = slidesOf(tr.doc);
    const target = Math.max(0, Math.min(plan.target, after.length - 1));
    const selection = (plan.selectText && firstTextIn(tr.doc, after[target])) || selectionIn(tr.doc, after[target]);
    if (selection) tr.setSelection(selection);
    tr.setMeta(STRIP_META, true);
    view.dispatch(tr);
    pick(plan.picked || []);
    anchor = target;
    // La pagination tout de suite, pas après sa minuterie : le défilement vise la page que la diapositive occupe maintenant (comme le bouton « Saut de page », js/main-toolbar.js).
    Editor.refreshPaginationPreview();
    refresh(true);
    scrollToSlide(target);
    if (byKeyboard) focusItem(target); else view.focus();
  }
  // Ce que fait le geste sur les diapositives `set` (leurs indices, rangés ; une seule le plus souvent) : { target (la diapositive à montrer ensuite), picked (celles qui restent
  // choisies), apply(tr, schema), selectText (le texte posé par une mise en page est sélectionné : on écrit par-dessus) }, ou null quand il ne s'applique pas (monter la première,
  // supprimer toutes). Sauf « addAfter », chaque geste est un nouvel ordre des diapositives (arrange). `extra` : pour « addAfter », la mise en page (LAYOUTS, « blank » sans elle),
  // ajoutée après la première de `set` ; pour « moveTo » (une miniature glissée), l'intervalle où elles se posent, 0 avant la première, slides.length après la dernière.
  function planOf(action, set, extra) {
    if (!set.length || !slides[set[set.length - 1]]) return null;
    const all = range(0, slides.length - 1);
    const inSet = i => set.includes(i);
    const moved = order => (order.every((k, i) => k === i) ? null : order);
    const at = (order, list) => list.map(k => order.indexOf(k));
    switch (action) {
      case 'addAfter': {
        const slide = slides[set[0]];
        const layout = LAYOUTS.includes(extra) ? extra : 'blank';
        return { target: set[0] + 1, selectText: layout !== 'blank', apply: (tr, schema) => tr.insert(slide.end, [schema.nodes.pageBreak.create(), ...layoutNodes(schema, layout)]) };
      }
      case 'duplicate': {
        // Les copies, dans l'ordre, après la dernière : choisies, le curseur sur la première.
        const last = set[set.length - 1];
        const order = [...range(0, last), ...set, ...all.slice(last + 1)];
        return { target: last + 1, picked: range(last + 1, last + set.length), apply: tr => arrange(tr, order) };
      }
      case 'moveUp':
      case 'moveDown': {
        // Chacune d'une place, sauf celles que bloque le bord ou une autre du choix qui y est déjà.
        const order = all.slice();
        const up = action === 'moveUp';
        for (let i = up ? 1 : order.length - 2; up ? i < order.length : i >= 0; i += up ? 1 : -1) {
          const other = i + (up ? -1 : 1);
          if (inSet(order[i]) && !inSet(order[other])) [order[i], order[other]] = [order[other], order[i]];
        }
        if (!moved(order)) return null;
        return { target: order.indexOf(set[0]), picked: at(order, set), apply: tr => arrange(tr, order) };
      }
      case 'moveTo': {
        const to = extra;
        if (!(to >= 0 && to <= slides.length)) return null;
        const order = moved([...all.slice(0, to).filter(i => !inSet(i)), ...set, ...all.slice(to).filter(i => !inSet(i))]);
        if (!order) return null;
        return { target: order.indexOf(set[0]), picked: at(order, set), apply: tr => arrange(tr, order) };
      }
      case 'delete': {
        // Une présentation garde au moins une diapositive ; le curseur va à celle qui prend la place de la première supprimée.
        const order = all.filter(i => !inSet(i));
        if (!order.length) return null;
        return { target: Math.min(set[0], order.length - 1), apply: tr => arrange(tr, order) };
      }
      default:
        return null;
    }
  }
  // Les blocs d'une diapositive de la mise en page `layout` : des titres, un paragraphe, une liste ou une zone à deux colonnes, déjà écrits (des mots à remplacer, que la Lecture et les
  // exports montrent tels quels s'ils restent). « blank » : un paragraphe vide, comme avant. Le texte de chaque bloc y est à la taille d'une diapositive (SlidesEntry.textMarks).
  function layoutNodes(schema, layout) {
    const n = schema.nodes;
    const text = (key, typeName, attrs) => schema.text(I18n.t('slides.layout.text.' + key), SlidesEntry.textMarks(schema, typeName, attrs));
    const para = (key, attrs) => n.paragraph.create(attrs || null, text(key, 'paragraph', attrs));
    const heading = (level, key, attrs) => { const all = Object.assign({ level }, attrs); return n.heading.create(all, text(key, 'heading', all)); };
    const centered = { textAlign: 'center' };
    switch (layout) {
      case 'title':
        return [heading(1, 'title', centered), para('subtitle', centered)];
      case 'titleContent':
        return [heading(2, 'heading'), n.bulletList.create(null, ['point1', 'point2'].map(key => n.listItem.create(null, para(key))))];
      case 'twoColumns':
        return [heading(2, 'heading'), n.twoColumnsZone.create(null, ['left', 'right'].map(key => n.twoColumnsColumn.create(null, para(key))))];
      case 'section':
        return [heading(1, 'sectionTitle'), para('sectionText')];
      default:
        return [n.paragraph.create()];
    }
  }
  // Le texte du premier bloc de `slide` dans `doc`, sélectionné (ce qu'une mise en page vient d'y écrire), ou null.
  function firstTextIn(doc, slide) {
    if (!slide) return null;
    let found = null;
    doc.nodesBetween(slide.start, slide.end, (node, pos) => {
      if (found) return false;
      if (!node.isTextblock) return true;
      if (node.content.size) found = EditorCore.getTextSelectionClass().create(doc, pos + 1, pos + 1 + node.content.size);
      return false;
    });
    return found;
  }
  // Range les diapositives dans l'ordre `order` (les indices d'avant ; un indice absent est supprimé, un indice répété est dupliqué), en un seul remplacement de ce qui change, entre
  // ce qui garde sa place au début et à la fin : les sauts de page qui séparaient les diapositives remplacées resservent, dans le même ordre, et chaque bloc reste le même objet
  // (sa miniature le suit, matchRows). Une diapositive supprimée part avec le saut de page qui la suit ; la dernière, avec celui qui la précède.
  function arrange(tr, order) {
    const count = slides.length;
    let head = 0;
    while (head < count && head < order.length && order[head] === head) head += 1;
    let tail = 0;
    while (tail < count - head && tail < order.length - head && order[order.length - 1 - tail] === count - 1 - tail) tail += 1;
    const from = head;
    const until = count - 1 - tail;
    const middle = order.slice(head, order.length - tail);
    const breaks = [];
    for (let k = from; k < until; k += 1) breaks.push(tr.doc.nodeAt(slides[k].breakAfter));
    const pageBreak = () => breaks.shift() || tr.doc.type.schema.nodes.pageBreak.create();
    const content = [];
    middle.forEach((k, i) => {
      if (i) content.push(pageBreak());
      slides[k].nodes.forEach(entry => content.push(entry.node));
    });
    if (from > until) {
      if (!middle.length) return;
      if (from > 0) tr.insert(slides[from - 1].end, [pageBreak(), ...content]); else tr.insert(slides[0].start, [...content, pageBreak()]);
    }
    else if (middle.length) tr.replaceWith(slides[from].start, slides[until].end, content);
    else if (slides[until].breakAfter != null) tr.delete(slides[from].start, slides[until].breakAfter + 1);
    else tr.delete(slides[from].breakBefore, slides[until].end);
  }
  // Vrai quand toutes les diapositives `indexes` sont masquées : la ligne « Masquer » devient « Afficher ».
  function allHidden(indexes) {
    const list = SlideProps.timingsOf(editor.state.doc);
    return indexes.length > 0 && indexes.every(index => list[index] && list[index].hidden);
  }
  // Pourquoi la ligne `action` du menu de la diapositive `index` (et du choix dont elle fait partie) est grisée, '' quand elle ne l'est pas.
  function unavailable(action, index) {
    if (off) return SlidesEntry.reason();
    if (action === 'notes') return setFor(index).length > 1 ? I18n.t('slides.menu.notesMany') : '';
    if (action === 'addAfter' || planOf(action, setFor(index))) return '';
    const many = setFor(index).length > 1;
    if (action === 'moveUp') return I18n.t(many ? 'slides.menu.firstMany' : 'slides.menu.first');
    if (action === 'moveDown') return I18n.t(many ? 'slides.menu.lastMany' : 'slides.menu.last');
    if (action === 'delete') return I18n.t('slides.menu.onlyOne');
    return '';
  }
  function undoRedo(which) {
    const command = editor.commands[which];
    if (typeof command !== 'function') return;
    command();
    refresh(true);
    focusItem(current);
  }

  // Copier et coller une diapositive (demande du 21/10 : « avec contrôle C et contrôle V entre deux onglets du navigateur »)
  // Le presse-papiers est celui du système, par les événements copy et paste du navigateur : d'une présentation à l'autre et d'un onglet à l'autre, sans autorisation à demander (Grist ne
  // laisse un widget lire le presse-papiers que pendant un Ctrl+V). Écoutés sur tout le document, avant l'éditeur, tant que la bande est montrée.
  // Où vise un copier ou un coller : la miniature qui a le clavier (`inStrip`), ou le texte de l'éditeur et la diapositive du curseur ; null ailleurs (un champ, une fenêtre).
  function clipboardTarget(event) {
    const r = list.contains(event.target) ? rowOf(event.target) : null;
    if (r) return { index: rows.indexOf(r), inStrip: true };
    if (editor.view.dom.contains(event.target)) return { index: current, inStrip: false };
    return null;
  }
  // Ctrl+C : dans le texte, une sélection garde le copier de toujours ; sans rien de sélectionné, la diapositive du curseur est copiée, comme sur sa miniature. L'extension éteinte, le
  // texte copie comme toujours, et la miniature explique pourquoi.
  function onCopy(event) {
    if (!shown || editingHeaderFooter() || !event.clipboardData) return;
    refresh(false);
    const at = clipboardTarget(event);
    if (!at || (!at.inStrip && (off || !editor.state.selection.empty))) return;
    if (off) { event.preventDefault(); SlidesEntry.explainOff(); return; }
    // Sur une miniature du choix, tout le choix ; dans le texte, la diapositive du curseur.
    const set = at.inStrip ? setFor(at.index) : [at.index];
    const copied = slideForClipboard(set);
    if (!copied) return;
    event.preventDefault();
    event.clipboardData.setData('text/html', copied.html);
    event.clipboardData.setData('text/plain', copied.text);
    SlidesEntry.status(set.length > 1 ? I18n.t('slides.strip.copiedMany', { n: set.length }) : I18n.t('slides.strip.copied', { n: set[0] + 1 }));
  }
  // Les diapositives `set` (leurs indices, rangés) comme l'éditeur les copierait (HTML et texte), séparées par leurs sauts de page, dans l'enveloppe qui les dit diapositives (la
  // première page de la première). Ce qui appartient à la présentation d'où elles viennent y reste : les images répétées sur toutes les pages (le fond de ses pages) et les
  // commentaires (leurs fils vivent dans sa table). Tirées d'une transaction jamais envoyée : le texte ne change pas.
  function slideForClipboard(set) {
    if (!set.length || set.some(index => !slides[index])) return null;
    const { state, view } = editor;
    const tr = state.tr;
    const repeated = [];
    set.forEach((index) => {
      const slide = slides[index];
      state.doc.nodesBetween(slide.start, slide.end, (node, pos) => { if (PageLayer.isRepeatedAttrs(node.attrs)) repeated.push({ from: pos, to: pos + node.nodeSize }); });
    });
    repeated.reverse().forEach(range => tr.delete(range.from, range.to));
    const parts = set.map((index) => {
      const slide = slides[index];
      const start = tr.mapping.map(slide.start);
      const end = tr.mapping.map(slide.end);
      if (state.schema.marks.commentMark) tr.removeMark(start, end, state.schema.marks.commentMark);
      return { start, end };
    });
    // Les classes Fragment et Slice de ProseMirror, que l'éditeur n'expose pas : celles de son texte. Une diapositive vide garde un paragraphe vide : sa place reste une diapositive
    // au collage.
    const Fragment = state.doc.content.constructor;
    const Slice = state.doc.slice(0, 0).constructor;
    let content = Fragment.empty;
    parts.forEach(({ start, end }, i) => {
      if (i) content = content.addToEnd(state.schema.nodes.pageBreak.create());
      content = content.append(end > start ? tr.doc.slice(start, end).content : Fragment.from(state.schema.nodes.paragraph.create()));
    });
    const serialized = view.serializeForClipboard(new Slice(content, 0, 0));
    const first = layout && layout.first.length === slides.length ? layout.first[set[0]] : '';
    return { html: '<div ' + SLIDE_MARK + '="' + first + '">' + serialized.dom.innerHTML + '</div>', text: serialized.text };
  }
  // Le HTML de la dernière sélection copiée ou coupée dans le texte de cette présentation (lu une fois l'éditeur passé) : collée sur une miniature, elle se colle telle quelle, avec ses tailles ;
  // une sélection venue d'ailleurs (un document, un autre onglet) devient du texte de diapositive (extensions/diapositives/page-slides.js).
  let copiedHere = '';
  function rememberCopy(event) {
    copiedHere = shown && event.clipboardData && editor && editor.view.dom.contains(event.target) ? (event.clipboardData.getData('text/html') || '') : '';
  }
  // Ctrl+V : sur une miniature, ce que porte le presse-papiers devient une diapositive de plus après elle ; dans le texte, seule une diapositive copiée se colle ainsi, après celle
  // du curseur, le reste se collant au curseur par l'éditeur. Une sélection copiée de l'éditeur d'un document devient, sur une miniature, du texte de diapositive : à ses tailles, en autant de
  // diapositives qu'il en faut (extensions/diapositives/page-slides.js). L'extension éteinte, le texte colle comme toujours, et la miniature explique pourquoi.
  function onPaste(event) {
    if (!shown || editingHeaderFooter() || !event.clipboardData) return;
    refresh(false);
    const at = clipboardTarget(event);
    if (!at || (off && !at.inStrip)) return;
    if (off) { event.preventDefault(); SlidesEntry.explainOff(); return; }
    const html = event.clipboardData.getData('text/html');
    const head = SLIDE_HEAD.exec(html.slice(0, SLIDE_HEAD_CHARS));
    if (!at.inStrip && !head) return;
    event.preventDefault();
    event.stopPropagation();
    const first = head && head[1] ? Number(head[1]) : null;
    // Une sélection de l'éditeur d'un document, collée sur une miniature : du texte de diapositive, à ses tailles (ou à celles du document, case cochée du volet « Importer »), en plusieurs diapositives quand elle est trop longue.
    const converted = !head && at.inStrip && html !== copiedHere ? PageSlides.fromEditorCopy(html, { keepFormat: typeof SlideImport !== 'undefined' && SlideImport.keepsFormat() }) : null;
    if (converted && !converted.blank) {
      if (pasteAfter(at.index, { html: converted.html, text: '', first: null }, event, 'strip', null, 'last')) SlidesEntry.status(I18n.t('slides.page.pasted', { slides: converted.slides }));
      return;
    }
    pasteAfter(at.index, { html, text: event.clipboardData.getData('text/plain'), first }, event, at.inStrip ? 'strip' : 'editor');
  }
  // Une diapositive de plus après la diapositive `index`, remplie par le collage de l'éditeur (EditorView.pasteHTML : ses nettoyages, ses images) : la diapositive vide s'ajoute,
  // comme « Ajouter », puis le collage la remplit et les images en calque se posent sur leurs pages (placePastedLayers). La diapositive vide et le collage se suivent sans pause et
  // se touchent : l'historique les range ensemble, avec les images posées, et un seul Ctrl+Z défait le tout ; la diapositive vide ouvre un pas d'annulation à elle (`closeHistory$`,
  // le meta de prosemirror-history, comme js/header-footer-preview.js), qu'un collage fait juste avant, à côté (deux imports de suite), ne prend pas. Le curseur va au début de la
  // diapositive collée, que le document montre ; `focus` : 'strip', le clavier reste dans la bande, sur elle ; 'editor', il va au document ; 'stay', il reste où il est (le volet
  // d'import). `clip` : { html, text, first } (`first` : la première page de la diapositive copiée, que dit son enveloppe, ou null) ; `event` : l'événement du Ctrl+V, ou null ;
  // `link` : le lien que la diapositive collée garde avec sa source (l'import lié, SlideLinks.tagImported, dans le même pas d'annulation), ou rien.
  // `landing` : 'last' pose le curseur sur la dernière diapositive collée (une page de document en plusieurs diapositives : la suivante viendra après elles), sinon sur la première.
  // Un presse-papiers vide ne fait rien. Vrai quand la diapositive est collée.
  function pasteAfter(index, clip, event, focus, link, landing) {
    const hasFile = !!event && Array.from(event.clipboardData.items || []).some(item => item.kind === 'file');
    if (!clip.html && !clip.text && !hasFile) return false;
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    const slide = slides[index];
    if (!slide) return false;
    const { state, view } = editor;
    const count = slides.length;
    // La première page de la diapositive collée d'après la dernière pagination (celle où commençait la diapositive qui la suivra), et le haut de chaque page ; null sans pagination.
    const target = layout && layout.first.length === count ? { page: index + 1 < count ? layout.first[index + 1] : layout.tops.length, tops: layout.tops } : null;
    const tr = state.tr.insert(slide.end, [state.schema.nodes.pageBreak.create(), state.schema.nodes.paragraph.create()]).setMeta('closeHistory$', true);
    const empty = selectionIn(tr.doc, slidesOf(tr.doc)[index + 1]);
    if (empty) tr.setSelection(empty);
    view.dispatch(tr);
    if (clip.html || !clip.text) view.pasteHTML(clip.html, event || undefined); else view.pasteText(clip.text, event || undefined);
    const added = slidesOf(view.state.doc).length - count;
    placePastedLayers(index + 1, added, clip.first, target);
    if (link) { if (link.linkPage) PageCopies.tagImported(editor, index + 1, added, link); else SlideLinks.tagImported(editor, index + 1, link); }
    const landed = landing === 'last' ? index + Math.max(1, added) : index + 1;
    const start = selectionIn(view.state.doc, slidesOf(view.state.doc)[landed]);
    if (start) view.dispatch(view.state.tr.setSelection(start));
    refresh(true);
    if (focus === 'strip') focusItem(landed); else if (focus === 'editor') view.focus();
    // La pagination une seule fois (celle que les transactions ont demandée à la minuterie n'a plus lieu), quand les images collées ont leur hauteur, qui décide des coupures de
    // page : le défilement vise alors la page de la diapositive collée. Un texte qui a changé entre-temps (une frappe) se repagine de lui-même.
    const pasted = view.state.doc;
    imagesSettled(slidesOf(pasted).slice(index + 1, index + 1 + added)).then(() => {
      if (!shown || editor.state.doc !== pasted) return;
      Editor.refreshPaginationPreview();
      scrollToSlide(index + 1);
    });
    return true;
  }
  // Le volet d'import (extensions/diapositives/slide-import.js) : la diapositive `html` d'une autre présentation, déjà sans ce qui appartient à celle-ci (images répétées, commentaires),
  // devient une diapositive de plus après celle du curseur, comme un Ctrl+V de cette diapositive copiée là-bas ; le clavier reste dans le volet. Comme un geste de la bande, il referme
  // d'abord l'en-tête ou le pied qui s'écrit. `link` : elle reste liée à sa source (« Garder liée », SlideLinks.anchorSource). Vrai quand elle est collée.
  function importAfterCurrent(html, link, landing) {
    if (!shown || off) return false;
    Editor.exitHeaderFooterModeIfActive();
    refresh(false);
    return pasteAfter(current, { html, text: '', first: null }, null, 'stay', link || null, landing);
  }
  // Les diapositives `indexes` du texte viennent de prendre celles d'une autre présentation (js/slide-links.js : la synchro, une version reçue, « Prendre l'autre ») : leurs images en
  // calque se posent sur les pages de leur diapositive, au même rang que là-bas, à la pagination qui suit, tout de suite quand la bande est montrée (placeArrived). Sans la bande (la
  // Lecture), elles gardent la page que la synchro leur a prévue, et la pagination d'après les pose.
  function settleLinked(indexes) {
    const target = EditorCore.getEditor();
    if (!target || !indexes || !indexes.length) return;
    const list = slidesOf(target.state.doc);
    eachLayer(target.state.doc, indexes.map(i => list[i]).filter(Boolean), node => settling.push(node));
    if (settling.length && shown && !editingHeaderFooter()) Editor.refreshPaginationPreview();
  }
  // Après la pagination : chaque image arrivée (settling) passe sur la page de sa diapositive, au rang qu'elle avait sur les pages de la sienne (sa page moins la première des images
  // arrivées avec elle), dans une transaction rangée avec celle qui l'a apportée (hors de l'historique pour la synchro), hors suivi des modifications.
  function placeArrived() {
    const wanted = new Set(settling);
    settling = [];
    if (!layout || !wanted.size) return;
    const { view } = editor;
    const found = new Map();
    eachLayer(view.state.doc, slides, (node, pos, index) => {
      if (!wanted.has(node)) return;
      if (!found.has(index)) found.set(index, []);
      found.get(index).push({ node, pos });
    });
    const tr = view.state.tr;
    const placed = [];
    found.forEach((images, index) => {
      const first = Math.min(...images.map(image => image.node.attrs.pageIndex));
      images.forEach(({ node, pos }) => {
        const flat = flatAt(pos);
        const attrs = layerOnPage(node.attrs, layout.first[index] + node.attrs.pageIndex - first, flat, layout.tops);
        if (!attrs) return;
        if (attrs.pageIndex !== node.attrs.pageIndex || attrs.top !== node.attrs.top) tr.setNodeMarkup(pos, undefined, attrs);
        placed.push({ pos, seen: { page: layout.first[index], flat } });
      });
    });
    if (tr.docChanged) {
      if (layerTrigger) tr.setMeta('appendedTransaction', layerTrigger.getMeta('appendedTransaction') || layerTrigger);
      else SlideLinks.markSync(tr);
      tr.setMeta(LAYERS_META, true);
      TrackChanges.skipTracking(tr);
      view.dispatch(tr);
    }
    placed.forEach(p => anchors.set(view.state.doc.nodeAt(p.pos), p.seen));
  }
  // Les images des diapositives `list` encore en chargement (une image collée n'a sa hauteur qu'une fois lue) : la promesse se tient quand toutes ont fini de charger ou d'échouer,
  // au plus IMAGE_SETTLE_MS.
  function imagesSettled(list) {
    const pending = [];
    list.forEach(slide => slide.nodes.forEach(({ pos }) => {
      const dom = editor.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) dom.querySelectorAll('img').forEach((img) => { if (!img.complete) pending.push(img); });
    }));
    if (!pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      let left = pending.length;
      const timer = setTimeout(resolve, IMAGE_SETTLE_MS);
      const one = () => { left -= 1; if (left === 0) { clearTimeout(timer); resolve(); } };
      pending.forEach((img) => { img.addEventListener('load', one, { once: true }); img.addEventListener('error', one, { once: true }); });
    });
  }
  // Après un collage, dans UNE transaction rangée dans son événement d'historique : les images en calque des diapositives d'après avancent d'autant de pages que le collage en a
  // ajouté (predictLayers : une par diapositive collée, d'après la pagination d'avant) ; celles des `count` diapositives collées à partir de `from` arrivent avec la page qu'elles
  // avaient là d'où elles viennent, et chacune passe sur les pages de sa diapositive, au même rang (sa page moins `sourceFirst`, la première page de la diapositive copiée ; sans elle,
  // la première page des images de sa diapositive). `target` ({ page, tops }) : la première page de la diapositive collée d'après la pagination d'avant le collage, où elles vont
  // tout de suite ; followLayers rattrape ce que la pagination suivante change (une diapositive collée qui dépasse), et sans `target` (null), c'est lui qui les y mène.
  function placePastedLayers(from, count, sourceFirst, target) {
    const { view } = editor;
    const doc = view.state.doc;
    const tr = view.state.tr;
    predictLayers(tr);
    const pasted = slidesOf(doc).slice(from, from + count);
    const found = pasted.map(() => []);
    eachLayer(doc, pasted, (node, pos, index) => found[index].push({ node, pos, flat: flatAt(pos) }));
    const placed = [];
    found.forEach((images, j) => {
      if (!images.length) return;
      const first = j === 0 && Number.isFinite(sourceFirst) ? sourceFirst : Math.min(...images.map(image => image.node.attrs.pageIndex));
      images.forEach((image) => {
        const attrs = target && layerOnPage(image.node.attrs, target.page + j + Math.max(0, image.node.attrs.pageIndex - first), image.flat, target.tops);
        if (attrs) { tr.setNodeMarkup(image.pos, undefined, attrs); placed.push({ pos: image.pos, seen: { page: target.page + j, flat: image.flat } }); }
        else anchors.set(image.node, { page: first, flat: image.flat });
      });
    });
    if (!tr.docChanged) return;
    if (layerTrigger) tr.setMeta('appendedTransaction', layerTrigger.getMeta('appendedTransaction') || layerTrigger);
    tr.setMeta(LAYERS_META, true);
    TrackChanges.skipTracking(tr);
    view.dispatch(tr);
    placed.forEach(p => anchors.set(view.state.doc.nodeAt(p.pos), p.seen));
  }

  // Le menu d'une diapositive
  function ensureMenu() {
    if (menu) return menu;
    const linkRows = LINK_MENU.map(action => '<button type="button" role="' + (LINK_MODES[action] ? 'menuitemradio' : 'menuitem') + '" data-action="' + action + '"></button>').join('');
    const html = MENU.map(action => (action ? '<button type="button" role="menuitem" data-action="' + action + '"></button>' : '<div class="pp-slide-menu-sep" role="separator"></div>')).join('')
      + '<div class="pp-slide-menu-sep pp-slide-menu-link-sep" role="separator" hidden></div>'
      + '<div class="pp-slide-menu-link" role="group" hidden><div class="pp-slide-menu-note" aria-hidden="true"></div>' + linkRows + '</div>';
    const panel = EditorCore.createFloatingPanel('pp-slide-menu', html, onMenuAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.querySelectorAll('[data-action]').forEach((button) => { button.textContent = I18n.t('slides.menu.' + button.dataset.action); });
    // Le geste qui choisit une ligne : à la souris, le clavier va ensuite au document ; au clavier, il reste dans la bande.
    panel.el.addEventListener('mousedown', () => { menu.pointer = true; }, true);
    panel.el.addEventListener('keydown', (event) => { menu.pointer = false; onMenuKey(event); });
    menu = { panel, index: 0, open: false, pointer: true };
    return menu;
  }
  function openMenu(index, byKeyboard) {
    const r = rows[index];
    if (!r) return;
    ensureMenu();
    closeMenu(false);
    closeLayoutMenu(false);
    // Le menu d'une miniature hors du choix : le choix revient à elle seule (ce que fait tout éditeur de diapositives au clic droit).
    if (picked.length > 1 && !picked.includes(index)) { picked = []; syncCurrent(false); }
    const many = setFor(index).length;
    Object.assign(menu, { index, open: true, pointer: !byKeyboard });
    menu.panel.el.setAttribute('aria-label', many > 1 ? I18n.t('slides.menu.labelMany', { n: many }) : I18n.t('slides.menu.label', { n: index + 1 }));
    menu.panel.el.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;
      const key = action === 'hide' ? 'slides.menu.' + (allHidden(setFor(index)) ? 'show' : 'hide') + (many > 1 ? 'Many' : '')
        : many > 1 && (action === 'duplicate' || action === 'delete') ? 'slides.menu.' + action + 'Many' : 'slides.menu.' + action;
      button.textContent = I18n.t(key, { n: many });
      const why = unavailable(action, index);
      button.setAttribute('aria-disabled', why ? 'true' : 'false');
      if (why) button.title = why; else button.removeAttribute('title');
    });
    syncLinkMenu(index, many);
    r.row.classList.add('pp-slide-menu-open');
    menu.panel.show(r.thumb, { placement: 'right-start', offset: 6 });
    if (byKeyboard) menuButtons()[0].focus();
    document.addEventListener('mousedown', onPressOutsideMenu, true);
  }
  function closeMenu(returnFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    menu.panel.hide();
    document.removeEventListener('mousedown', onPressOutsideMenu, true);
    const r = rows[menu.index];
    if (r) r.row.classList.remove('pp-slide-menu-open');
    if (returnFocus) focusItem(menu.index);
  }
  const menuButtons = () => Array.from(menu.panel.el.querySelectorAll('[data-action]')).filter(button => !button.hidden && !button.closest('[hidden]'));
  // Les lignes du lien, pour une seule diapositive liée : la note qui dit à quoi elle est liée (le nom du groupe), son sens coché (les sens ne se montrent pas quand la source n'existe
  // plus), « Comparer les deux versions » quand elles diffèrent, « Détacher » ; grisées avec leur raison (l'extension éteinte, le suivi des modifications, l'écriture en direct).
  function syncLinkMenu(index, many) {
    const info = many > 1 || typeof SlideLinksUi === 'undefined' ? null : SlideLinks.infoAt(editor, index);
    const group = menu.panel.el.querySelector('.pp-slide-menu-link');
    group.hidden = !info;
    menu.panel.el.querySelector('.pp-slide-menu-link-sep').hidden = !info;
    if (!info) return;
    const note = SlideLinksUi.noteOf(info);
    group.querySelector('.pp-slide-menu-note').textContent = note;
    group.setAttribute('aria-label', note);
    const why = off ? SlidesEntry.reason() : SlideLinksUi.blocked();
    group.querySelectorAll('[data-action]').forEach((button) => {
      const action = button.dataset.action;
      const mode = LINK_MODES[action];
      if (action === 'linkCompare') button.hidden = !info.differs;
      else if (mode) button.hidden = info.kind !== 'target' || info.missing;
      else button.hidden = info.kind === 'source' && !info.name;
      if (mode) button.setAttribute('aria-checked', info.mode === mode ? 'true' : 'false');
      button.setAttribute('aria-disabled', why ? 'true' : 'false');
      if (why) button.title = why; else button.removeAttribute('title');
    });
  }
  // Un appui hors du menu le referme ; celui d'un bouton « ⋯ » est laissé à son clic, qui ouvre ou referme.
  function onPressOutsideMenu(event) {
    if (menu.panel.el.contains(event.target) || event.target.closest('.pp-slide-more')) return;
    closeMenu(false);
  }
  function onMenuKey(event) {
    const buttons = menuButtons();
    const at = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  }
  // Une ligne choisie : grisée, elle ne fait rien (l'extension éteinte, elle explique) ; sinon le menu se ferme et le geste se fait.
  function onMenuAction(action) {
    if (!menu || !menu.open) return;
    const button = menu.panel.el.querySelector('[data-action="' + action + '"]');
    if (button && button.getAttribute('aria-disabled') === 'true') {
      if (off) { closeMenu(false); SlidesEntry.explainOff(); }
      return;
    }
    const { index, pointer } = menu;
    closeMenu(false);
    if (LINK_MENU.includes(action)) {
      if (!pointer) focusItem(index); else editor.view.focus();
      SlideLinksUi.act(action, index);
      return;
    }
    // « Masquer » / « Afficher » : un seul pas d'historique pour tout le choix.
    if (action === 'hide') {
      Editor.exitHeaderFooterModeIfActive();
      const indexes = setFor(index);
      const hide = !allHidden(indexes);
      const changed = SlideProps.applyHidden(editor, indexes, hide);
      if (!pointer) focusItem(index); else editor.view.focus();
      if (changed > 0) SlidesEntry.status(I18n.t(hide ? 'slides.hidden.set' : 'slides.hidden.cleared', { n: changed }));
      return;
    }
    // « Transition… », « Fond… » et « Notes… » : la fenêtre de réglage (slide-transitions-ui.js, slide-background-ui.js, slide-notes-ui.js), pour la diapositive visée ou tout le choix dont elle fait
    // partie (les notes, pour la seule diapositive visée) ; le clavier revient où il était.
    if (action === 'transition' || action === 'background' || action === 'notes') {
      Editor.exitHeaderFooterModeIfActive();
      refresh(false);
      const dialog = { transition: SlideTransitionsUi, background: SlideBackgroundUi, notes: SlideNotesUi }[action];
      dialog.open(action === 'notes' ? [index] : setFor(index), () => { if (!pointer) focusItem(index); else editor.view.focus(); });
      return;
    }
    act(action, index, !pointer);
  }

  // Le menu des mises en page de « Ajouter » (au-dessus de l'existant, à droite de la bande, au bas, devant la rangée des deux boutons) : une ligne par mise en page, son dessin et son nom ; le choix ajoute une diapositive après
  // celle du curseur. Au clavier, ↑ ↓ Début Fin, Entrée ou Espace ; Échap et Tab le referment et rendent le clavier à « Ajouter ».
  function ensureLayoutMenu() {
    if (layoutMenu) return layoutMenu;
    const html = LAYOUTS.map(layout => '<button type="button" role="menuitem" data-action="' + layout + '">' + Icons.svg('slideLayout' + layout.charAt(0).toUpperCase() + layout.slice(1)) + '<span></span></button>').join('');
    const panel = EditorCore.createFloatingPanel('pp-slide-layouts', html, onLayoutAction);
    panel.el.setAttribute('role', 'menu');
    panel.el.setAttribute('aria-label', I18n.t('slides.layout.label'));
    panel.el.querySelectorAll('[data-action]').forEach((button) => {
      button.querySelector('span').textContent = I18n.t('slides.layout.' + button.dataset.action);
      hideIcon(button);
    });
    panel.el.addEventListener('mousedown', () => { layoutMenu.pointer = true; }, true);
    panel.el.addEventListener('keydown', (event) => { layoutMenu.pointer = false; onLayoutMenuKey(event); });
    layoutMenu = { panel, open: false, pointer: true };
    return layoutMenu;
  }
  function openLayoutMenu(byKeyboard) {
    ensureLayoutMenu();
    closeMenu(false);
    Object.assign(layoutMenu, { open: true, pointer: !byKeyboard });
    addButton.setAttribute('aria-expanded', 'true');
    layoutMenu.panel.show(actionsRow, { placement: 'right-end', offset: 6 });
    if (byKeyboard) layoutButtons()[0].focus();
    document.addEventListener('mousedown', onPressOutsideLayoutMenu, true);
  }
  function closeLayoutMenu(returnFocus) {
    if (!layoutMenu || !layoutMenu.open) return;
    layoutMenu.open = false;
    layoutMenu.panel.hide();
    addButton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onPressOutsideLayoutMenu, true);
    if (returnFocus) addButton.focus();
  }
  const layoutButtons = () => Array.from(layoutMenu.panel.el.querySelectorAll('[data-action]'));
  // Un appui hors du menu le referme ; celui de « Ajouter » est laissé à son clic, qui ouvre ou referme.
  function onPressOutsideLayoutMenu(event) {
    if (layoutMenu.panel.el.contains(event.target) || addButton.contains(event.target)) return;
    closeLayoutMenu(false);
  }
  function onLayoutMenuKey(event) {
    const buttons = layoutButtons();
    const at = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1].focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      closeLayoutMenu(true);
    }
  }
  function onLayoutAction(layout) {
    if (!layoutMenu || !layoutMenu.open) return;
    const { pointer } = layoutMenu;
    closeLayoutMenu(false);
    act('addAfter', current, !pointer, layout);
  }

  // La souris et le clavier
  // Ctrl+clic : la diapositive `index` entre dans le choix (le curseur y va) ou en sort (le curseur va à la dernière qui reste) ; le choix commence avec celle du curseur.
  function togglePick(index) {
    refresh(false);
    const set = chosen().slice();
    const at = set.indexOf(index);
    anchor = index;
    if (at < 0) { pick([...set, index]); goTo(index, false); return; }
    if (set.length < 2) return;
    set.splice(at, 1);
    pick(set);
    goTo(index === current ? set[set.length - 1] : current, false);
  }
  function wireList() {
    // Ni focus sur la miniature ni sélection de texte : un clic sur une miniature va au document. Le geste se fait au clic, après l'appui qui referme les barres de l'éditeur
    // (js/editor-core.js) : celle du tableau où le curseur arrive s'ouvre alors normalement.
    list.addEventListener('mousedown', (event) => { if (rowOf(event.target)) event.preventDefault(); });
    list.addEventListener('click', (event) => {
      const r = rowOf(event.target);
      if (!r || dragJustEnded) return;
      const index = rows.indexOf(r);
      if (event.target.closest('.pp-slide-more')) {
        if (menu && menu.open && menu.index === index) closeMenu(false); else openMenu(index, false);
        return;
      }
      // Maj+clic et Ctrl+clic : le clavier reste dans la bande (Suppr, Ctrl+C s'appliquent au choix).
      if (event.shiftKey) { refresh(false); pick(range(Math.min(anchor, slides.length - 1), index)); goTo(index, false); focusItem(index); return; }
      if (event.ctrlKey || event.metaKey) { togglePick(index); focusItem(current); return; }
      picked = [];
      anchor = index;
      goTo(index, true);
    });
    list.addEventListener('contextmenu', (event) => {
      const r = rowOf(event.target);
      if (!r) return;
      event.preventDefault();
      openMenu(rows.indexOf(r), false);
    });
    list.addEventListener('keydown', onListKey);
    list.addEventListener('pointerdown', onDragPress);
  }

  // Glisser une miniature (ce que fait tout éditeur de diapositives) : bouton enfoncé, la souris qui bouge emporte une copie de la miniature, une ligne d'accent dit où elle se posera ;
  // lâchée, la diapositive y va, avec son saut de page, en une transaction (un Ctrl+Z la remet), comme « Monter » et « Descendre ». Échap, ou lâchée sur les côtés de la bande, rien ne
  // bouge. Près du haut ou du bas, la bande défile. À la souris et au stylet ; au doigt, la bande défile ; au clavier, Ctrl+↑ et Ctrl+↓.
  function onDragPress(event) {
    if (event.button !== 0 || event.pointerType === 'touch' || off || drag || slides.length < 2 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    const r = rowOf(event.target);
    if (!r || event.target.closest('.pp-slide-more')) return;
    const index = rows.indexOf(r);
    const box = r.thumb.getBoundingClientRect();
    // Une miniature du choix emporte tout le choix.
    const group = setFor(index).map(i => rows[i]);
    drag = {
      index, row: r, group, nodes: (slides[index] ? slides[index].nodes : []).map(entry => entry.node), doc: editor.state.doc, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, grabX: event.clientX - box.left, grabY: event.clientY - box.top,
      active: false, cancelled: false, gap: -1, line: null, ghost: null, frame: 0,
    };
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', onDragRelease, true);
    window.addEventListener('pointercancel', onDragAbort, true);
  }
  function onDragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId || drag.cancelled) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_START_PX) return;
      onDragStart();
    }
    event.preventDefault();
    moveGhost();
    placeDropLine();
    scrollWhileDragging();
  }
  // La miniature part : elle s'estompe à sa place, sa copie suit la souris (au-dessus de tout, sans prendre la souris), la liste garde la souris même hors du cadre de l'app.
  function onDragStart() {
    closeMenu(false);
    closeLayoutMenu(false);
    drag.active = true;
    drag.group.forEach(r => r.row.classList.add('pp-slide-drag-source'));
    list.classList.add('pp-slide-dragging');
    drag.line = el('div', 'pp-slide-drop');
    drag.line.hidden = true;
    list.appendChild(drag.line);
    drag.ghost = el('div', 'pp-slide-ghost');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.appendChild(drag.row.thumb.cloneNode(true));
    // Plusieurs diapositives emportées : leur nombre, sur la copie.
    if (drag.group.length > 1) drag.ghost.appendChild(el('span', 'pp-slide-ghost-count', String(drag.group.length)));
    document.body.appendChild(drag.ghost);
    try { list.setPointerCapture(drag.pointerId); } catch (error) { /* le pointeur est déjà parti : son relâchement arrive tout de même */ }
    list.addEventListener('lostpointercapture', onDragAbort);
    document.addEventListener('keydown', onDragKey, true);
  }
  const moveGhost = () => { drag.ghost.style.transform = 'translate(' + Math.round(drag.x - drag.grabX) + 'px,' + Math.round(drag.y - drag.grabY) + 'px)'; };
  // L'intervalle où la miniature se poserait sous la souris : 0 avant la première, rows.length après la dernière ; -1 sur les côtés de la bande, où la lâcher ne fait rien.
  function gapAt(x, y) {
    const box = list.getBoundingClientRect();
    if (x < box.left || x > box.right) return -1;
    const at = rows.findIndex((r) => { const rect = r.row.getBoundingClientRect(); return y < rect.top + rect.height / 2; });
    return at < 0 ? rows.length : at;
  }
  // La ligne d'accent, au milieu de l'intervalle ; cachée là où rien ne bougerait (juste avant ou juste après la diapositive emportée, ou hors de la bande).
  function placeDropLine() {
    const gap = gapAt(drag.x, drag.y);
    const set = drag.group.map(r => rows.indexOf(r)).sort((a, b) => a - b);
    drag.gap = gap;
    const still = gap < 0 || set.some(i => i < 0) || !planOf('moveTo', set, gap);
    drag.line.hidden = still;
    if (still) return;
    const before = rows[gap - 1];
    const after = rows[gap];
    const bottom = before ? before.row.offsetTop + before.row.offsetHeight : after.row.offsetTop - 6;
    const top = after ? after.row.offsetTop : bottom + 6;
    drag.line.style.top = Math.round((bottom + top) / 2 - 1) + 'px';
  }
  // Près du haut ou du bas de la bande (ou au-delà), elle défile à chaque image tant que la souris y reste, et la ligne suit.
  function scrollWhileDragging() {
    if (drag.frame) return;
    const step = () => {
      if (!drag) return;
      drag.frame = 0;
      if (!drag.active || drag.cancelled) return;
      const box = list.getBoundingClientRect();
      const top = box.top + DRAG_EDGE_PX;
      const bottom = box.bottom - DRAG_EDGE_PX;
      const past = drag.y < top ? drag.y - top : drag.y > bottom ? drag.y - bottom : 0;
      if (!past) return;
      const before = list.scrollTop;
      list.scrollTop += Math.max(-DRAG_SCROLL_PX, Math.min(DRAG_SCROLL_PX, Math.round(past / 2) || Math.sign(past)));
      if (list.scrollTop === before) return;
      placeDropLine();
      drag.frame = requestAnimationFrame(step);
    };
    drag.frame = requestAnimationFrame(step);
  }
  // Échap, pendant le glisser : la miniature revient, le relâchement qui suivra ne fera rien. Les autres touches attendent le relâchement.
  function onDragKey(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.key !== 'Escape') return;
    drag.cancelled = true;
    clearDragLook();
  }
  // Lâchée : la diapositive va à l'intervalle sous la souris. Si le texte a changé pendant le glisser (une autre personne qui écrit), elle est retrouvée par ses blocs.
  function onDragRelease(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { active, cancelled, nodes, doc, row } = drag;
    endDrag();
    if (!active) return;
    dragJustEnded = true;
    setTimeout(() => { dragJustEnded = false; }, 0);
    if (cancelled) return;
    refresh(false);
    let index = nodes.length ? slides.findIndex(slide => slide.nodes.some(entry => nodes.includes(entry.node))) : -1;
    if (index < 0 && editor.state.doc === doc) index = rows.indexOf(row);
    const gap = gapAt(event.clientX, event.clientY);
    if (index >= 0 && gap >= 0) act('moveTo', index, false, gap);
  }
  function onDragAbort() {
    if (!drag) return;
    const wasActive = drag.active;
    endDrag();
    if (!wasActive) return;
    dragJustEnded = true;
    setTimeout(() => { dragJustEnded = false; }, 0);
  }
  function clearDragLook() {
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    if (drag.line) drag.line.remove();
    if (drag.ghost) drag.ghost.remove();
    drag.line = null;
    drag.ghost = null;
    drag.group.forEach(r => r.row.classList.remove('pp-slide-drag-source'));
    list.classList.remove('pp-slide-dragging');
  }
  function endDrag() {
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragRelease, true);
    window.removeEventListener('pointercancel', onDragAbort, true);
    if (drag.active) {
      list.removeEventListener('lostpointercapture', onDragAbort);
      document.removeEventListener('keydown', onDragKey, true);
      if (list.hasPointerCapture && list.hasPointerCapture(drag.pointerId)) list.releasePointerCapture(drag.pointerId);
      clearDragLook();
    }
    drag = null;
  }
  function onListKey(event) {
    const r = rowOf(event.target);
    if (!r || event.target !== r.item) return;
    const index = rows.indexOf(r);
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if ((key === 'F10' && event.shiftKey) || key === 'ContextMenu') { event.preventDefault(); openMenu(index, true); return; }
    if (mod && /^[zy]$/i.test(key)) { event.preventDefault(); undoRedo(key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
    if (mod && (key === 'ArrowUp' || key === 'ArrowDown')) { event.preventDefault(); act(key === 'ArrowUp' ? 'moveUp' : 'moveDown', index, true); return; }
    // Ctrl+A : toutes les diapositives choisies, le curseur où il est.
    if (mod && /^a$/i.test(key) && !event.shiftKey && !event.altKey) { event.preventDefault(); pick(range(0, slides.length - 1)); syncCurrent(false); return; }
    if (mod || event.altKey) return;
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End') {
      event.preventDefault();
      const step = key === 'ArrowUp' ? -1 : 1;
      const next = key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + step));
      // Maj : le choix s'étend de la dernière miniature atteinte sans Maj jusqu'à celle-ci ; sans Maj, il revient à elle seule.
      if (event.shiftKey) pick(range(Math.min(anchor, slides.length - 1), next));
      else { picked = []; anchor = next; }
      goTo(next, false);
      focusItem(next);
    } else if (key === 'Enter') {
      event.preventDefault();
      picked = [];
      anchor = index;
      goTo(index, true);
    } else if (key === 'Escape') {
      event.preventDefault();
      // Un choix de plusieurs se défait d'abord ; ensuite, le clavier va au document.
      if (picked.length > 1) { picked = []; anchor = index; syncCurrent(false); return; }
      editor.view.focus();
    } else if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      act('delete', index, true);
    }
  }
  // « Ajouter » ouvre le menu des mises en page, ou le referme. `detail` vaut 0 pour un clic du clavier (Entrée, Espace) : le clavier va alors dans le menu.
  function wireAddButton() {
    addButton.addEventListener('mousedown', event => event.preventDefault());
    addButton.addEventListener('click', (event) => {
      if (off) { SlidesEntry.explainOff(); return; }
      if (layoutMenu && layoutMenu.open) closeLayoutMenu(false); else openLayoutMenu(event.detail === 0);
    });
  }
  // « Importer » ouvre le volet d'import, ou le referme ; au clavier, le clavier va dans le volet. Grisé, il explique.
  function wireImportButton() {
    importButton.addEventListener('mousedown', event => event.preventDefault());
    importButton.addEventListener('click', (event) => {
      if (off) { SlidesEntry.explainOff(); return; }
      if (typeof SlideImport !== 'undefined') SlideImport.toggle(importButton, event.detail === 0);
    });
  }

  // L'éditeur et la page
  function onTransaction({ transaction }) {
    if (!shown || editingHeaderFooter()) return;
    // Une transaction qui n'est pas d'un geste de la bande (une frappe, un Ctrl+Z, un collage) : le choix revient à la diapositive du curseur.
    if (transaction.docChanged && !transaction.getMeta(STRIP_META) && !transaction.getMeta(LAYERS_META)) picked = [];
    const count = slides.length;
    refresh(false);
    if (!transaction.docChanged) return;
    if (!transaction.getMeta(LAYERS_META)) layerTrigger = transaction;
    // Une diapositive de plus ou de moins (un saut de page posé ou effacé dans le texte) : tout de suite, sinon après la pause de la frappe.
    if (slides.length !== count) drawThumbs(); else scheduleThumbs();
  }
  // Après chaque pagination : ce qui dépasse, et toutes les miniatures quand la page a changé (format, sens, marges) ; les images en calque suivent leur diapositive. Sortie de
  // l'en-tête : le texte des diapositives est revenu.
  function onPaginated() {
    if (!shown || editingHeaderFooter()) return;
    if (editor.state.doc !== readDoc) refresh(true);
    else {
      const key = pageGeometry().key;
      if (rows.some(r => r.sizedFor !== key)) drawThumbs();
      syncOverflow();
    }
    followLayers();
    if (settling.length) placeArrived();
  }
  // La bande couvre la marge gauche du document, sur sa hauteur visible (sans sa barre de défilement du bas), moins ce que la barre de GFS en mord. Sa largeur de base est celle de la
  // variable CSS (`--pp-slide-strip-width`) : la barre n'y entre pas, le calcul part toujours de la bande sans elle, pour ne pas tourner en rond.
  function place() {
    const box = container();
    if (!strip || !box) return;
    const rect = box.getBoundingClientRect();
    const top = rect.top + box.clientTop;
    const width = parseFloat(getComputedStyle(document.body).getPropertyValue('--pp-slide-strip-width')) || strip.offsetWidth;
    const bite = GfsBar.bite({ left: rect.left, top, right: rect.left + width, bottom: top + box.clientHeight });
    gutter = Math.max(0, Math.ceil(bite.left));
    document.body.style.setProperty('--pp-slide-strip-bar', gutter + 'px');
    strip.style.left = rect.left + 'px';
    strip.style.top = (top + bite.top) + 'px';
    strip.style.height = Math.max(0, box.clientHeight - bite.top - bite.bottom) + 'px';
  }
  // La barre de GFS arrive, part ou change de bord : la bande se replace et, si la gouttière a changé, la page se réajuste à la largeur qui reste. Pendant le diaporama GFS masque sa barre
  // pour lui : la bande ne bouge pas (la page ne se réajusterait que pour revenir à la sortie).
  function onBar() {
    if (typeof SlideShow !== 'undefined' && SlideShow.isRunning()) return;
    const before = gutter;
    place();
    if (gutter !== before) SlidesEntry.relayout();
  }
  function observe() {
    window.addEventListener('resize', place);
    stopBar = GfsBar.onChange(onBar);
    if (typeof ResizeObserver === 'function' && container()) {
      resizeObserver = new ResizeObserver(place);
      resizeObserver.observe(container());
    }
    if (typeof IntersectionObserver === 'function') nearObserver = new IntersectionObserver(onNear, { root: list, rootMargin: DRAW_AHEAD_PX + 'px 0px' });
  }
  function unobserve() {
    window.removeEventListener('resize', place);
    if (stopBar) { stopBar(); stopBar = null; }
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    if (nearObserver) { nearObserver.disconnect(); nearObserver = null; }
  }

  // Montrée par js/slides-entry.js : une présentation est à l'écran en Édition. `off` : l'extension est éteinte, les gestes sont grisés.
  function show(options) {
    build();
    const wasOff = off;
    off = !!(options && options.off);
    // Le menu ouvert a les lignes d'avant : GFS vient d'allumer ou d'éteindre l'extension.
    if (off !== wasOff) { closeMenu(false); closeLayoutMenu(false); }
    if (!shown) {
      shown = true;
      editor = EditorCore.getEditor();
      editor.on('transaction', onTransaction);
      stopPaginated = HeaderFooterPreview.onPaginated(onPaginated);
      document.addEventListener('copy', onCopy, true);
      document.addEventListener('copy', rememberCopy);
      document.addEventListener('cut', rememberCopy);
      document.addEventListener('paste', onPaste, true);
      strip.hidden = false;
      document.body.classList.add('pp-slide-strip-on');
      place();
      observe();
      readDoc = null;
      // Le document a une marge de plus à gauche : la page se réajuste à la largeur qui reste, et sa pagination se refait.
      SlidesEntry.relayout();
    }
    refresh(true);
    // Une autre présentation à l'écran, une extension allumée ou éteinte : le volet d'import relit ses sources et son grisé.
    if (typeof SlideImport !== 'undefined') SlideImport.sync(true);
  }
  function hide() {
    if (!shown) return;
    shown = false;
    closeMenu(false);
    closeLayoutMenu(false);
    if (drag) endDrag();
    // Le volet d'import se ferme avec la bande, qui refait la page une seule fois, plus bas ; « Présenter » se cache avec elle.
    if (typeof SlideImport !== 'undefined') SlideImport.close(false, true);
    if (typeof SlideShow !== 'undefined') SlideShow.sync(false);
    clearTimeout(redrawTimer);
    redrawTimer = null;
    if (editor) editor.off('transaction', onTransaction);
    if (stopPaginated) { stopPaginated(); stopPaginated = null; }
    document.removeEventListener('copy', onCopy, true);
    document.removeEventListener('copy', rememberCopy);
    document.removeEventListener('cut', rememberCopy);
    copiedHere = '';
    document.removeEventListener('paste', onPaste, true);
    unobserve();
    strip.hidden = true;
    document.body.classList.remove('pp-slide-strip-on');
    document.body.style.removeProperty('--pp-slide-strip-bar');
    gutter = 0;
    rows.forEach(r => r.row.remove());
    rows = [];
    slides = [];
    picked = [];
    anchor = 0;
    readDoc = null;
    layout = null;
    layerTrigger = null;
    settling = [];
    SlidesEntry.relayout();
  }

  SlidesEntry.register({ show, hide });

  return { show, hide, slidesOf, importAfterCurrent, settleLinked, syncLinks: () => syncLinks(false), current: () => current, isOff: () => off, isShown: () => shown };
})();
