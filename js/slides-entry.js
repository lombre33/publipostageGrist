// Les présentations vues du socle du widget. Une présentation est un modèle du même éditeur que les documents, de type « presentation » (colonne TypeModele), dont la page est une diapositive
// 16:9 (PageLayout.SLIDE_FORMAT, en paysage) : une diapositive est ce qu'il y a entre deux sauts de page. Les présentations sont l'extension « diapositives », que Grist Factory Suite (GFS)
// active ou non (js/extensions.js, js/gfs-link.js) ; elle n'exige aucune bibliothèque, et son code (extensions/diapositives/) est la bande des diapositives.
// Ce fichier est le SEUL point d'entrée par lequel le reste du widget (js/main.js, js/main-toolbar.js) l'atteint :
//  - le TYPE : déclaré à js/templates.js avec le nom de l'extension. Extension active, une présentation s'ouvre comme un autre modèle (liste, modèle de la vue, règle de ligne, ouverture
//    demandée par GFS) ; éteinte ou absente, elle reste dans les listes, grisée avec sa raison, jamais ouverte, jamais perdue : son contenu suit les renommages de colonnes et un modèle déjà
//    ouvert s'enregistre toujours sous son type. Une présentation n'est jamais le ★ du document (Templates.canBeDocumentDefault) ;
//  - le GRISÉ, sans l'extension : la ligne « Nouvelle présentation » du menu « + » est grisée avec sa raison, jamais cachée, et son clic explique (hébergé par GFS : ouvre sa fenêtre
//    d'installation, seul : une fenêtre simple dit qu'il faut passer par GFS - Extensions.explain) ;
//  - la PAGE : celle d'une diapositive, pour une présentation vierge et pour une présentation qui n'a pas de format à elle (colonne Margins vide) ;
//  - l'ACTIVATION : « Nouvelle présentation » charge d'abord le code de l'extension (Extensions.ensure), et seulement si GFS dit l'extension active ; un modèle de présentation
//    de la galerie de même (ensureFor), ses boutons grisés avec leur raison sans l'extension (unavailableReason) ;
//  - la BANDE DES DIAPOSITIVES (extensions/diapositives/slide-strip.js) : à gauche du document tant qu'une présentation est à l'écran en Édition. Son code se charge au premier besoin, et
//    seulement si GFS dit l'extension active ; un échec (réseau coupé) laisse la présentation s'écrire sans bande et se retente au prochain changement d'écran. GFS éteint l'extension
//    pendant qu'une présentation est ouverte : la bande reste, ses gestes grisés avec leur raison, et leur clic explique ;
//  - la PAGE DE CHAQUE DIAPOSITIVE, même vide, la dernière comprise (carte du 19/10, « Tout de suite ») : un saut de page qui termine une présentation ouvre sa page, comme une
//    diapositive vide au milieu, alors qu'il n'en ouvre pas à la fin d'un document (carte du 14/10, « Cacher dans l'éditeur »). À l'écran, la pagination le demande ici
//    (showsEveryPage) ; la Lecture et les exports le lisent dans le HTML de la présentation (outputHtml). Son PDF ne demande jamais « Exporter quand même ? » pour une page
//    blanche (carte du 19/10, « Ne plus avertir ») : js/main.js le dit à js/pdf-export.js (showsEveryPage), un document gardant la question ;
//  - le TEXTE NEUF d'une diapositive, à 20 pt et ses titres plus grands (demande du 21/10) : createTextExtension, câblée par js/editor.js, et textMarks pour les mises en page
//    d'« Ajouter » ;
//  - LA DIAPOSITIVE OÙ L'ON EST d'un mode à l'autre (demande du 11/11, « quand on passe en mode lecture, aller à la diapo où l'on était et pas au début ») : `shownSlide` dit celle que l'éditeur montre (le curseur s'il est à
//    l'écran, sinon le milieu de la zone qui défile) pour que la Lecture s'ouvre dessus, `showSlide(index)` y ramène l'éditeur au retour de la Lecture ; js/main.js:switchMode les appelle (js/main-slides.js). Sans la bande : -1 / faux, la Lecture s'ouvre en haut comme avant ;
//  - UNE DIAPOSITIVE EN TEXTE DE DOCUMENT (demande du 22/10) : la ligne « Diapositive d'une présentation… » du menu « Lien et blocs de contenu » ouvre le volet de l'extension (openTextImport ;
//    grisée avec sa raison sans elle, son clic explique), et une diapositive copiée de la bande, collée dans un document, y devient du texte du document (pastedInDocument,
//    js/slide-text.js : la conversion est du socle, elle n'attend pas le code de l'extension).
const SlidesEntry = (function () {
  const ID = 'diapositives';
  const TYPE = 'presentation';
  const FEATURE_KEY = 'slides.function';
  const TEXT_FEATURE_KEY = 'slides.text.function';
  const THEME_FEATURE_KEY = 'slides.theme.function';
  const RETRY_AFTER_FAILURE_MS = 30000;
  const SLIDE_BREAK_ATTR = 'data-slide-break';

  let hooks = { startNew: () => {}, relayout: () => {}, status: () => {} };
  // Posé par js/main.js : ce que l'écran montre ({ type, editing }) ; `editing` est vrai quand l'éditeur est visible en Édition et modifiable.
  let context = () => ({ type: 'document', editing: false });
  let strip = null;            // la bande, que l'extension pose une fois chargée (register)
  let textImport = null;       // le volet « une diapositive en texte », posé de même (registerTextImport)
  let themeWindow = null;      // la fenêtre « Thème… », posée de même (registerTheme)
  let loadStarted = false;
  let failedAt = 0;

  const isAvailable = () => Extensions.isActive(ID);
  const isPresentation = typeModele => typeModele === TYPE;
  // Pourquoi « Nouvelle présentation » est grisée, dans la langue de l'interface ; '' quand l'extension est active.
  const reason = () => (isAvailable() ? '' : I18n.t('template.unavailable.extension', { name: Extensions.nameOf(ID) }));

  // Posé par js/main.js : `startNew(type)` ouvre un modèle vierge de ce type, avec la question « Enregistrer / Abandonner / Annuler » quand des modifications attendent ; `relayout()` refait
  // l'ajustement de la page et sa pagination quand la bande prend ou rend sa place à gauche du document ; `status(message, isError)` écrit dans le coin d'état (« Diapositive 3 copiée. »).
  function setHooks(next) { hooks = Object.assign(hooks, next); }
  function setContext(fn) { context = fn; }

  // Le geste de la ligne « Nouvelle présentation » : sans l'extension, il explique ; avec elle, le code de l'extension se charge (un échec le dit, le clic suivant réessaie), puis une
  // présentation vierge s'ouvre.
  async function startNew() {
    if (!(await ensureFor(TYPE))) return;
    return (await hooks.startNew(TYPE)) === true; // vrai : la présentation vierge est à l'écran (GFS le demande par « Nouveau », js/gfs-open.js)
  }
  // Avant d'ouvrir un modèle de type `typeModele` qui n'existe pas encore (« Nouvelle présentation », un modèle de la galerie, js/template-gallery-modal.js) : vrai pour tout
  // autre type. Pour une présentation, sans l'extension, le geste explique et rend faux ; avec elle, son code se charge d'abord (un échec le dit et rend faux, le clic suivant
  // réessaie).
  async function ensureFor(typeModele, featureKey = FEATURE_KEY) {
    if (!isPresentation(typeModele)) return true;
    if (!isAvailable()) { await Extensions.explain(ID, featureKey); return false; }
    try { await Extensions.ensure(ID); return true; }
    catch (e) {
      console.warn('[SlidesEntry] extension indisponible', e);
      await Extensions.tellLoadFailed(ID);
      return false;
    }
  }
  // Pourquoi un geste qui ouvrirait un modèle de type `typeModele` est grisé (la galerie, pour un modèle de présentation) ; '' quand il ne l'est pas.
  const unavailableReason = typeModele => (isPresentation(typeModele) ? reason() : '');

  // La page d'un modèle de ce type (js/main.js la pose avant son texte, ou le temps de lire celle d'un autre modèle à exporter) : `stored`, celle que sa ligne porte (colonne Margins), ou null pour un modèle vierge. Une présentation qui n'a pas de
  // format à elle (vierge, ou Margins vide) prend la diapositive 16:9 (33,87 x 19,05 cm, le format « grand écran » de PowerPoint) en paysage, avec ses marges ; un format choisi au menu de la page
  // est gardé. Tout autre type garde la sienne (null : la page par défaut).
  function pageFor(typeModele, stored) {
    if (!isPresentation(typeModele) || (stored && stored.format)) return stored || null;
    return Object.assign({}, stored, { orientation: PageLayout.LANDSCAPE, format: PageLayout.SLIDE_FORMAT });
  }

  // La page, en points ({ width, height }), d'une présentation dont la ligne porte `stored` (sa colonne Margins ; null : un modèle vierge) : celle que le décor du thème mesure pour un modèle qui n'est pas celui de l'écran
  // (un lot, un macro-modèle). Null pour un modèle qui n'est pas une présentation.
  function pageSizeOf(typeModele, stored) {
    if (!isPresentation(typeModele)) return null;
    const own = pageFor(typeModele, stored);
    return PageLayout.pageSizePtFor(own.orientation, own.format);
  }

  // La bande des diapositives
  // Montrée quand une présentation est à l'écran en Édition, que son code est là (fichiers et feuille de style arrivés) ; cachée sinon. Rappelée par js/main.js à chaque changement de ce
  // que l'écran montre (modèle, mode, droits) et par GFS quand il allume ou éteint une extension.
  function sync() {
    const shown = context();
    refreshPlaceholder();
    if (textImport) textImport.syncScreen(shown);
    if (!(isPresentation(shown.type) && shown.editing)) { if (strip) strip.hide(); return; }
    prepareTyping();
    if (strip && Extensions.isLoaded(ID)) { strip.show({ off: !isAvailable() }); return; }
    if (isAvailable()) startLoad();
  }
  // Le texte d'attente de l'éditeur vide (js/editor.js : « première diapositive » ou « modèle ») dépend du type du modèle, que js/main.js ne pose qu'APRÈS avoir chargé le texte : à chaque changement de type
  // l'éditeur recalcule ses décorations, par une transaction qui ne change rien (ni le texte, ni l'historique : le modèle n'est pas « modifié »).
  let placeholderFor = null;
  function refreshPlaceholder() {
    const shown = presentationShown();
    if (shown === placeholderFor) return;
    placeholderFor = shown;
    const editor = EditorCore.getEditor();
    if (editor && editor.view && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false));
  }
  function startLoad() {
    if (loadStarted || Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return;
    loadStarted = true;
    Extensions.ensure(ID).then(sync, (e) => { failedAt = Date.now(); console.warn('[SlidesEntry] extension indisponible', e); }).then(() => { loadStarted = false; });
  }
  // La page de chaque diapositive
  // Vrai pour une présentation (`typeModele`, par défaut celle que montre l'éditeur) : chacune de ses pages est une diapositive, voulue même vide. Sa pagination ouvre la page
  // d'un saut de page qui termine le texte (js/header-footer-preview.js:trailingBlankStart), et son PDF ne signale aucune page blanche (js/main.js le passe à js/pdf-export.js).
  const showsEveryPage = (typeModele = context().type) => isPresentation(typeModele);
  // Une présentation est-elle le modèle que montre l'éditeur ? Les diapositives liées ne se synchronisent et ne se gardent que là (js/slide-links.js).
  const presentationShown = () => isPresentation(context().type);
  // Le repère d'une couture entre deux pages, dans l'éditeur et dans la Lecture (js/header-footer-preview.js, js/reader-mode.js) : « Diapositive 3 » dans une présentation, « Page 3 » ailleurs.
  const seamLabel = n => (presentationShown() ? I18n.t('slides.seam', { n }) : 'Page ' + n);
  // Le HTML d'un modèle de type `typeModele` tel que la Lecture et les exports le reçoivent (js/main.js : celui de l'écran, celui d'un autre modèle d'un lot). Celui d'une présentation
  // marque ses sauts de page `data-slide-break` : ReaderMode.trimTrailingBlankBlocks ne retire jamais un tel saut, ni la première ligne de la page qu'il ouvre. Un texte qui finit sur un
  // saut de page reçoit cette ligne, sans quoi la page ne s'ouvrirait pas (le PDF ouvre une page avec le bloc qui suit le saut). Le modèle enregistré n'est jamais touché.
  // `keepProps` (l'export PowerPoint, js/pptx-export.js) : le repère de chaque diapositive reste, avec sa transition, son fond et ses notes, que le fichier écrit lui-même. `anchors` (la Lecture) : une diapositive
  // que vise un lien y laisse un bloc vide qui porte son adresse (SlideProps.forOutput). `theme` : le thème de CETTE présentation (sa clé `theme` de la page, PageLayout.getTheme pour celle de l'écran, celle de
  // sa ligne pour un autre modèle d'un lot ou d'un macro-modèle) : ses polices et ses couleurs sont écrites en style sur le texte et les titres (SlideTheme.forOutput), son fond est celui de chaque diapositive qui n'a pas le sien (SlideTheme.paperOf) et son décor
  // (bandeau, logo, numéro, pied : SlideTheme.decorHtmlFor) des cadres derrière le texte de chaque diapositive ; sans thème, rien n'est ajouté. `page` : la page de CETTE présentation en points ({ width, height }), pour le décor ; `stored` : à défaut, la colonne Margins de sa ligne (un autre modèle d'un lot ou d'un macro-modèle : sa page
  // n'est pas celle de l'écran) ; sans l'un ni l'autre, la page du modèle ouvert.
  function outputHtml(typeModele, html, options) {
    // Un texte de présentation qui n'a pas changé rend la même sortie : la Lecture la demande à chaque rendu (autre ligne choisie, retour de l'Édition sans rien avoir écrit, page réajustée) et un macro-modèle à chaque
    // ligne d'un lot, pour chacun de ses modèles, or elle relit et réécrit le texte entier cinq à six fois (0,12 à 0,16 s sur « Présentation commerciale »). Les dernières sorties sont gardées avec tout ce qu'elles ont lu
    // pour se faire : le texte, les options, la page du modèle ouvert et les styles de titres du document, seuls états lus en route. Une diapositive liée prend celle de sa source (un autre modèle) : ce texte-là n'est jamais gardé.
    if (!isPresentation(typeModele) || !html || html.length < OUTPUT_CACHE_MIN_CHARS || html.indexOf('data-link-slide') !== -1) return computeOutputHtml(typeModele, html, options);
    const key = outputKey(typeModele, options);
    const styles = typeof HeadingStyles !== 'undefined' ? HeadingStyles.documentStyles() : null;
    const hit = outputCache.findIndex(entry => entry.key === key && entry.styles === styles && entry.html === html);
    if (hit !== -1) {
      const [entry] = outputCache.splice(hit, 1);
      outputCache.push(entry);
      return entry.out;
    }
    const out = computeOutputHtml(typeModele, html, options);
    outputCache.push({ key, styles, html, out });
    if (outputCache.length > OUTPUT_CACHE_MAX) outputCache.shift();
    return out;
  }
  const OUTPUT_CACHE_MAX = 3;
  const OUTPUT_CACHE_MIN_CHARS = 20000;
  const outputCache = [];
  function outputKey(typeModele, options) {
    const { keepProps = false, anchors = false, theme = null, page = null, stored } = options || {};
    // La page du modèle ouvert se lit toujours en route : le cadre du fond de chaque diapositive est de sa taille (FreeFrame.backgroundHtml), et le décor quand aucune autre page n'est dite (SlideTheme.decorHtmlFor).
    const own = typeof PageLayout !== 'undefined' ? PageLayout.getPageSizePt() : null;
    return JSON.stringify([typeModele, keepProps, anchors, theme, page, stored === undefined ? null : stored, stored === undefined, own]);
  }
  function computeOutputHtml(typeModele, html, { keepProps = false, anchors = false, theme = null, page = null, stored } = {}) {
    // Un document ne montre jamais le repère de ses copies en texte (js/slide-copies.js), et une copie dont la diapositive a changé la reprend.
    if (html && !isPresentation(typeModele)) return SlideCopies.forOutput(html);
    if (!isPresentation(typeModele) || !html) return html;
    // Le repère d'une diapositive liée n'en sort jamais, et une diapositive que seule sa source a changée prend celle de la source (js/slide-links.js:forOutput).
    html = SlideLinks.forOutput(html);
    // Ni celui de la transition d'une diapositive (js/slide-props.js) : le diaporama la lit dans le texte de l'éditeur. Son fond, lui, y devient le cadre qui le peint, et celui du thème (SlideTheme.paperOf) le
    // cadre de chaque diapositive qui n'a pas le sien. L'export PowerPoint (`keepProps`) n'en écrit pas : le fond du thème est celui de son masque (js/pptx-export.js).
    // Le HTML est lu UNE fois, et les étapes qui suivent (objets masqués, thème, sauts de diapositive) se font sur le même arbre : chacune, avec un texte pour entrée et pour sortie, le relisait et le
    // sérialisait (cinq lectures, quatre écritures, de 0,12 à 0,16 s dans « Présentation commerciale »). Le texte qui sort est le même, au caractère près (dev-tests/verify-output-html.mjs).
    if (!keepProps) {
      const tree = SlideProps.forOutputTree(html, { anchors, background: SlideTheme.paperOf(theme), decor: SlideTheme.decorHtmlFor(theme, page || (stored !== undefined ? pageSizeOf(typeModele, stored) : null)) });
      if (tree) {
        // Ni les objets masqués (js/free-frame.js : `data-ff-hidden`).
        FreeFrame.withoutHiddenIn(tree);
        // Le thème de la présentation : sa police et sa couleur sur le texte et les titres, la même chose qu'à l'écran (css/slide-theme.css).
        if (theme) SlideTheme.forOutputIn(tree, theme);
        markSlideBreaks(tree);
        resolveSlideNumbers(tree);
        return tree.innerHTML;
      }
    }
    // Ni les objets masqués (js/free-frame.js : `data-ff-hidden`) ; l'export PowerPoint les écrit masqués.
    if (!keepProps) html = FreeFrame.withoutHidden(html);
    // Le thème de la présentation : sa police et sa couleur sur le texte et les titres, la même chose qu'à l'écran (css/slide-theme.css).
    if (theme) html = SlideTheme.forOutput(html, theme);
    const host = Dom.inertTemplate(html);
    // L'export PowerPoint (`keepProps`) écrit le numéro en vrai champ de numéro de diapositive (js/pptx-export.js) : la pastille lui reste.
    const marked = markSlideBreaks(host.content);
    const numbered = !keepProps && resolveSlideNumbers(host.content);
    return marked || numbered ? host.innerHTML : html;
  }
  // Marque les sauts de page de premier niveau de `root` (un arbre lu : un fragment ou un `body`) comme sauts de diapositive, et ouvre la dernière diapositive sur une ligne ; vrai quand il y en a.
  function markSlideBreaks(root) {
    const blocks = Array.from(root.children);
    const breaks = blocks.filter(block => block.classList.contains('page-break-marker'));
    if (!breaks.length) return false;
    breaks.forEach(block => block.setAttribute(SLIDE_BREAK_ATTR, ''));
    // Le cadre du fond de la dernière diapositive ne compte pas, ni ceux de son décor : ils se dessinent sans texte à eux, la page doit encore s'ouvrir sur une ligne.
    const written = blocks.filter(block => !block.hasAttribute('data-ff-bg') && !block.hasAttribute(FreeFrame.DECOR_ATTR));
    if (written[written.length - 1].classList.contains('page-break-marker')) root.appendChild(document.createElement('p'));
    return true;
  }

  // LE NUMÉRO DE DIAPOSITIVE (11/11, « un # vert à la place des numéros de slides, pas résolu en mode Lecture ni quand on lance le diapo ») : la pastille de numéro de page d'un texte de présentation (celle que le champ de numéro
  // d'un PowerPoint importé y pose, ou celle que la personne y insère) est un espace réservé, que l'éditeur laisse à « # » comme dans un en-tête ; la Lecture, le diaporama, l'impression et les exports (PDF, Word, HTML) la
  // lisent ici, dans le texte de sortie, et en écrivent le numéro de la diapositive où elle est posée : 1 plus les sauts de page de premier niveau qui la précèdent (comme FreeFrame.slideStartOf), dans le format de la pastille
  // (« 3 », « Page 3 », « 3/12 » : PageLayout.pageNumberText, le total est le nombre de diapositives). La pastille reste (même classe : le HTML et le Markdown, où un numéro ne coule pas avec le texte, la retirent toujours) ;
  // `data-slide-number` dit qu'elle est résolue : la Lecture la montre alors comme du texte de la diapositive, sans pastille verte (css/editor-v2.css), le PDF et le Word en écrivent le texte, non un champ de page (une
  // diapositive plus haute que sa page en prend plusieurs). Vrai quand une pastille a été résolue.
  const SLIDE_NUMBER_ATTR = 'data-slide-number';
  function resolveSlideNumbers(root) {
    if (!root.querySelector('.page-number-badge')) return false;
    const blocks = Array.from(root.children);
    const isBreak = block => block.classList.contains('page-break-marker');
    const total = blocks.filter(isBreak).length + 1;
    let rank = 1;
    blocks.forEach((block) => {
      if (isBreak(block)) { rank += 1; return; }
      const badges = block.classList.contains('page-number-badge') ? [block] : Array.from(block.querySelectorAll('.page-number-badge'));
      badges.forEach((badge) => {
        badge.textContent = PageLayout.pageNumberText(badge.getAttribute('data-format') || 'n', rank, total);
        badge.setAttribute(SLIDE_NUMBER_ATTR, String(rank));
      });
    });
    return true;
  }

  // Le texte neuf d'une diapositive
  // Ce qui s'écrit de neuf dans une présentation prend la taille d'une diapositive (demande du 21/10) : 20 pt pour un paragraphe, d'une liste, d'une case ou d'une colonne comprise
  // (TEXT_SIZE), et des titres plus grands que lui (HEADING_SIZES, carte du 21/10 « Grossir » : Titre 1 à 44 pt, Titre 2 à 36 pt, Titre 3 à 28 pt) ; une légende garde la sienne, un bloc
  // de code n'a pas de taille. La taille se pose en marque, comme une taille choisie au menu : l'éditeur, la Lecture, le diaporama et chaque export la montrent sans rien savoir des
  // présentations, et le texte déjà écrit garde la sienne (aucune diapositive faite ne déborde). Trois gestes la posent :
  //  - le curseur dans un bloc sans texte (vide, ou qui ne porte qu'une image) la prépare pour la frappe, dans les marques en attente de ProseMirror : le menu des tailles la montre,
  //    la frappe la prend, Entrée la garde. Une taille choisie là, ou celle du texte voisin, reste ;
  //  - un texte brut collé là prend ces marques en attente, comme la frappe (ProseMirror ne colle un texte brut qu'avec les marques du texte voisin) ;
  //  - un bloc qui change de type (paragraphe, titre de chaque niveau) : son texte à la taille par défaut de l'ancien type, ou sans taille, prend celle du nouveau ; une autre taille
  //    choisie reste.
  // Ni une transaction venue d'une autre personne (écriture en direct : elle a déjà fait ce travail chez elle), ni l'annulation ou le rétablissement, qui rejouent ce qui a été fait.
  const TEXT_SIZE = '20pt';
  const HEADING_SIZES = { 1: '44pt', 2: '36pt', 3: '28pt', 4: '24pt', 5: '22pt', 6: '21pt' };
  function sizeFor(typeName, attrs) {
    if (typeName === 'paragraph') return attrs && attrs.caption ? null : TEXT_SIZE;
    return typeName === 'heading' ? HEADING_SIZES[attrs && attrs.level] || null : null;
  }
  const sizeOf = node => (node && node.isTextblock ? sizeFor(node.type.name, node.attrs) : null);
  function fontSizeIn(marks) {
    const style = (marks || []).find(mark => mark.type.name === 'textStyle');
    return (style && style.attrs.fontSize) || null;
  }
  // `marks` avec la taille `size` dans leur style de texte (null la retire ; un style qui n'a plus rien est retiré).
  function withSize(marks, schema, size) {
    const type = schema.marks.textStyle;
    const style = marks.find(mark => mark.type === type);
    const attrs = Object.assign({}, style ? style.attrs : {}, { fontSize: size });
    const rest = style ? style.removeFromSet(marks) : marks;
    return Object.values(attrs).some(value => value != null) ? type.create(attrs).addToSet(rest) : rest;
  }
  const hasText = node => { let found = false; node.forEach((child) => { if (child.isText) found = true; }); return found; };
  // Les marques en attente que demande le curseur de `state`, ou null quand il n'y a rien à préparer.
  function pendingMarks(state) {
    const { selection } = state;
    if (!selection.empty) return null;
    const { $from } = selection;
    const size = sizeOf($from.parent);
    if (!size || hasText($from.parent)) return null;
    const marks = state.storedMarks || $from.marks();
    return fontSizeIn(marks) ? null : withSize(marks, state.schema, size);
  }
  // La transaction qui donne au texte des blocs dont `trs` a changé le type la taille du nouveau type, ou null. Un changement de type est le pas de ProseMirror qui remplace un bloc
  // de texte par un autre autour du même contenu (setBlockType : titre, paragraphe, au menu, au clavier ou par « # » en début de ligne).
  function retypedSizes(trs, state) {
    let tr = null;
    const textStyle = state.schema.marks.textStyle;
    trs.forEach((t, index) => t.steps.forEach((step, i) => {
      const slice = step.slice;
      if (!step.structure || step.insert !== 1 || !slice || slice.openStart || slice.openEnd || slice.content.childCount !== 1 || !slice.content.firstChild.isTextblock) return;
      const before = t.docs[i].nodeAt(step.from);
      let pos = t.mapping.slice(i + 1).map(step.from, 1);
      for (let k = index + 1; k < trs.length; k++) pos = trs[k].mapping.map(pos, 1);
      const after = state.doc.nodeAt(pos);
      const from = sizeOf(before);
      const to = sizeOf(after);
      if (!before || !after || !after.isTextblock || from === to) return;
      after.forEach((child, offset) => {
        const size = child.isText ? fontSizeIn(child.marks) : 'skip';
        if (size !== null && size !== from) return;
        const start = pos + 1 + offset;
        const style = withSize(child.marks, state.schema, to).find(mark => mark.type === textStyle);
        tr = tr || state.tr;
        tr.removeMark(start, start + child.nodeSize, textStyle);
        if (style) tr.addMark(start, start + child.nodeSize, style);
      });
    }));
    return tr;
  }
  // Un texte brut collé là où des marques attendent la frappe les prend ; `slice` reste tel quel sinon.
  function pastedPlain(slice, view, plain) {
    const stored = view.state.storedMarks;
    if (!plain || !stored || !fontSizeIn(stored) || !presentationShown()) return slice;
    const Fragment = slice.content.constructor;
    const mark = fragment => {
      const nodes = [];
      fragment.forEach(node => nodes.push(node.isText ? (node.marks.length ? node : node.mark(stored)) : (node.isLeaf ? node : node.copy(mark(node.content)))));
      return Fragment.fromArray(nodes);
    };
    return new slice.constructor(mark(slice.content), slice.openStart, slice.openEnd);
  }
  function createTextExtension(Extension, { Plugin, PluginKey }) {
    return Extension.create({
      name: 'slideText',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('slideText'),
          appendTransaction(trs, oldState, state) {
            if (!presentationShown() || trs.some(t => t.getMeta('history$') || LiveEntry.isRemote(t))) return null;
            // Les marques que pose retypedSizes ne touchent que du texte : un bloc sans texte, où le curseur prépare la frappe, n'en change pas.
            const tr = trs.some(t => t.docChanged) ? retypedSizes(trs, state) : null;
            const marks = pendingMarks(state);
            return marks ? (tr || state.tr).setStoredMarks(marks) : tr;
          },
          props: { transformPasted: pastedPlain },
        })];
      },
    });
  }
  // Les marques du texte d'un bloc de type `typeName` (et ses attributs, le niveau d'un titre) qu'une mise en page d'« Ajouter » écrit : [] quand ce type n'a pas de taille de diapositive.
  const textMarks = (schema, typeName, attrs) => { const size = sizeFor(typeName, attrs); return size ? [schema.marks.textStyle.create({ fontSize: size })] : []; };
  // Prépare la frappe quand une présentation vient de s'afficher en Édition : aucune transaction n'a encore demandé les marques en attente.
  function prepareTyping() {
    const editor = EditorCore.getEditor();
    if (!editor || editor.isDestroyed) return;
    const marks = pendingMarks(editor.state);
    if (marks) editor.view.dispatch(editor.state.tr.setStoredMarks(marks));
  }

  // Posé par l'extension à son chargement (extensions/diapositives/slide-strip.js) : { show({ off }), hide(), shownSlide(), showSlide(index) }. Elle ne se montre qu'une fois tous ses fichiers arrivés (sync).
  function register(next) { strip = next; }
  // La diapositive où l'on est dans l'éditeur (celle du curseur quand il est à l'écran, sinon celle du milieu de la zone qui défile), pour que la Lecture s'ouvre sur elle ; -1 sans bande montrée (extension
  // absente ou pas encore chargée, éditeur masqué) : la Lecture s'ouvre alors en haut.
  const shownSlide = () => (strip && typeof strip.shownSlide === 'function' ? strip.shownSlide() : -1);
  // Mène l'éditeur à la diapositive `index` qu'on lisait (le retour de la Lecture) ; faux quand la bande n'est pas là pour le faire.
  const showSlide = index => !!(strip && typeof strip.showSlide === 'function' && strip.showSlide(index));

  // Une diapositive en texte de document
  // Posé par l'extension à son chargement (extensions/diapositives/slide-import.js) : { open(byKeyboard), close(), isOpen(), syncScreen(shown), keepsFormat() } ; le volet des diapositives
  // d'une présentation, ouvert depuis un document.
  function registerTextImport(next) { textImport = next; }
  // La ligne « Diapositive d'une présentation… » du menu : sans l'extension, elle explique ; avec elle, le code se charge d'abord (un échec le dit, le clic suivant réessaie), puis le volet
  // s'ouvre. `byKeyboard` : le clavier va dans le volet. Vrai quand le volet est ouvert. Rien ne se passe hors de l'Édition d'un document (la Lecture, un modèle en lecture seule, une
  // présentation, un e-mail) : la ligne y est grisée, et un clic qui l'atteindrait quand même n'ouvre rien.
  async function openTextImport(byKeyboard) {
    const shown = context();
    if (shown.type !== 'document' || !shown.editing) return false;
    if (!(await ensureFor(TYPE, TEXT_FEATURE_KEY)) || !textImport) return false;
    textImport.open(byKeyboard);
    return true;
  }
  // Le HTML collé dans un document (js/editor.js : transformPastedHTML) : une diapositive copiée de la bande y devient du texte du document, à la taille du document (ou celle de la diapositive,
  // quand la case « Garder la mise en forme d'origine » du volet ouvert est cochée) ; la ligne d'état dit ce qui n'est pas entré. Tout autre HTML, une présentation et l'extension éteinte
  // gardent le collage tel quel.
  function pastedInDocument(html) {
    if (!html || !isAvailable() || isPresentation(context().type)) return html;
    const result = SlideText.pasted(html, { keepFormat: !!(textImport && textImport.keepsFormat()) });
    if (!result) return html;
    const said = I18n.t(result.slides > 1 ? 'slides.text.pastedMany' : 'slides.text.pasted', { n: result.slides });
    const dropped = SlideText.report(result.dropped);
    // Le coin d'état et le curseur se règlent une fois le collage posé : l'éditeur remet le coin à zéro à chaque changement du texte (js/main.js : updateSaveStatus), et la sélection ne se place
    // qu'avec le collage.
    queueMicrotask(() => {
      hooks.status(dropped ? said + ' ' + dropped : said, false);
      const editor = EditorCore.getEditor();
      if (editor && !editor.isDestroyed) SlideText.leaveBlockAtEnd(editor.view);
    });
    return result.html;
  }
  // Le thème de la présentation
  // Posé par l'extension à son chargement (extensions/diapositives/slide-theme-ui.js) : { open(onClose), close(), isOpen() } ; la fenêtre « Thème… ». Le thème lui-même est du socle (js/slide-theme.js).
  function registerTheme(next) { themeWindow = next; }
  // La ligne « Thème… » du menu Page (js/orientation-toggle.js) : sans l'extension, elle explique ; avec elle, le code se charge d'abord (un échec le dit, le clic suivant réessaie), puis la fenêtre s'ouvre ; le clavier
  // revient ensuite dans l'éditeur. Rien ne se passe hors de l'Édition d'une présentation : la ligne y est grisée, et un clic qui l'atteindrait quand même n'ouvre rien. Vrai quand la fenêtre est ouverte.
  async function openTheme() {
    const shown = context();
    if (!isPresentation(shown.type) || !shown.editing) return false;
    if (!(await ensureFor(TYPE, THEME_FEATURE_KEY)) || !themeWindow) return false;
    themeWindow.open(() => { const editor = EditorCore.getEditor(); if (editor && !editor.isDestroyed) editor.view.focus(); });
    return true;
  }
  // Un geste grisé de la bande, l'extension éteinte : hébergé par GFS, sa fenêtre d'installation ; seul, la fenêtre qui dit qu'il faut passer par GFS.
  const explainOff = () => Extensions.explain(ID, FEATURE_KEY);
  const relayout = () => hooks.relayout();
  const status = (message, isError) => hooks.status(message, isError);

  Templates.declareExtensionType(TYPE, Extensions.nameOf(ID), isAvailable);
  Extensions.onChange(sync);

  return {
    ID, TYPE, FEATURE_KEY, SLIDE_BREAK_ATTR, setHooks, setContext, isAvailable, isPresentation, reason, startNew, ensureFor, unavailableReason, pageFor, pageSizeOf, onChange: Extensions.onChange,
    changed: sync, register, explainOff, relayout, status, showsEveryPage, presentationShown, seamLabel, outputHtml, TEXT_SIZE, HEADING_SIZES, createTextExtension, textMarks,
    registerTextImport, openTextImport, pastedInDocument, registerTheme, openTheme, shownSlide, showSlide,
  };
})();
