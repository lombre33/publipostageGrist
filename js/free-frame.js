// Les cadres de texte libres d'une présentation (demande du 21/10 à 18:35, cartes « Où cliquer ? » : le bouton « Objets », d'abord sous les miniatures et depuis le 22/10 dans la barre d'outils du haut, et « Quand le texte déborde ? » : le cadre
// grandit). Un cadre est un morceau de texte posé n'importe où sur une diapositive, qu'on déplace et qu'on redimensionne à la souris, dans le MÊME éditeur que le reste (les bulles, les
// listes, les commentaires, la recherche y marchent comme ailleurs) : le socle garde ici le nœud, ses gestes, sa barre et ce qui le range ; le bouton qui en pose un est dans
// js/objects-menu.js, qui n'appelle que `insert`.
//  - Le NŒUD (`freeFrame`, un bloc qui contient des paragraphes, titres, listes, citations, ou un tableau : celui d'un PowerPoint importé, lot 10e) s'écrit <div class="pp-free-frame" data-ff-x data-ff-y data-ff-w data-ff-h><div class="pp-free-frame-box">
//    <div class="pp-free-frame-content">...</div></div></div>. Les quatre mesures sont en POINTS depuis le coin haut gauche de la PAGE (le point de PowerPoint : 12 700 unités, donc l'import et
//    l'export PowerPoint les prennent tels quels ; pdfmake place aussi depuis le coin de la page) : x, y, largeur, hauteur MINIMALE. La hauteur est celle que la personne a réglée : la boîte
//    grandit avec son texte et redescend à elle quand on l'efface, jamais en dessous de ce que le texte demande (`h` n'est jamais réécrit par la frappe).
//  - L'ANCRE : l'élément enregistré est de hauteur nulle (css/free-frame.css), la boîte y flotte (position absolue). L'éditeur, la Lecture, le diaporama et la bande ne lui comptent donc aucune
//    place, et rien du texte de la diapositive ne bouge quand on pose un cadre. Pour que l'ancre soit au coin du texte de SA diapositive, tous les cadres d'une diapositive sont rangés tout au
//    début d'elle, derrière le saut de page qui l'ouvre (ou au début du texte) : leur ordre est leur empilement, le dernier est au premier plan.
//  - Ce RANGEMENT (tidyTransaction, appendTransaction) est le garde-fou d'une présentation : un cadre collé au milieu d'un texte, dans une colonne ou un encadré, remonte au début de sa diapositive ; un
//    collage qui porte des cadres et du texte met les cadres au début et le texte à l'endroit du curseur ; un cadre déjà bien rangé n'est jamais touché, et rien ne se range au chargement d'un
//    modèle (ouvrir n'écrit rien). Hors d'une présentation, un cadre collé devient du texte ordinaire (ses blocs, sans la boîte).
//  - Les GESTES : un clic dans le cadre y pose le curseur ; son contour (le bord, 8 px) se saisit pour le déplacer ; huit poignées le redimensionnent (la hauteur ne descend jamais sous celle du
//    texte : dépassée vers le haut, le cadre s'ajuste à son texte et suit désormais lui) ; un geste est UN pas d'historique. Cadre sélectionné : les flèches le déplacent d'un point (Maj : dix),
//    Entrée y pose le curseur, Suppr l'efface ; dans le texte, Échap sélectionne le cadre. Sa barre flottante (cadre sélectionné seulement) : premier plan, arrière-plan, dupliquer, supprimer.
//  - La LIMITE : un cadre reste atteignable (au moins 24 points de lui restent sur la page).
//  - Les FORMES (demande du 21/10 à 18:35 : « ajout de forme ») sont des cadres : le même nœud porte en plus sa sorte (`shape` : un rectangle, un rectangle arrondi, une ellipse, un triangle, un
//    losange, une flèche à droite, à gauche, en haut ou en bas, une étoile, un chevron, un pentagone, un hexagone, un parallélogramme, une croix, une bulle - js/shape-geometry.js, les noms des
//    formes de PowerPoint), son fond (`fill`), la couleur de son trait (`line`) et son épaisseur
//    (`lw`, en points). Une forme s'écrit, se déplace, se redimensionne et s'empile comme un cadre de texte, et son texte est centré ; un cadre de texte peut lui aussi avoir un fond et un trait.
//    Toute forme prédéfinie de PowerPoint est une sorte (chantier 4, choix du 23/10 : quarante-huit de plus au menu, les autres par l'import ; js/shape-presets.js les calcule), avec ses RÉGLAGES
//    (`adj` : `data-ff-adj`, les poignées jaunes de PowerPoint - « adj1 25000 adj2 -8333 » -, écrits seulement quand ils ne sont pas ceux d'origine) et, rarement, sa GÉOMÉTRIE retenue (`geo` :
//    `data-ff-geo`, « x y w h » : la boîte de la forme dans le cadre, que l'import écrit quand le cadre seul ne la redonne pas ; ShapeGeometry.presetBox l'oublie dès qu'elle ne le remplit plus).
//    Le dessin est du CSS (css/free-frame.css) : le nœud écrit, avec ses mesures, les variables que ce CSS lit (`--ff-fill`, `--ff-clip`...), si bien que l'éditeur, la Lecture, le diaporama, les
//    miniatures et l'impression montrent la même forme sans script ; le PDF (canvas de pdfmake) et le Word (forme DrawingML) la dessinent d'après les mêmes contours.
//  - Les LIGNES (demande du 22/10 : « traits, flèches ») sont un nœud à part, `freeLine`, sans texte : une feuille que `isFrame` compte avec les cadres, donc rangée, empilée, déplacée aux flèches
//    du clavier, dupliquée, collée et supprimée comme eux, avec la même barre (moins le fond, plus les extrémités) ; deux BOUTS à la place des huit poignées (`start` et `end`, qu'on glisse :
//    Maj garde l'angle par pas de 15 degrés) et une bande à saisir qui suit le trait (un clic à côté ne la prend pas : le texte dessous reste atteignable). Sa boîte (x, y, w, h) est celle de
//    ses DEUX bouts, `flip` dit où est le début, `head` et `tail` les pointes (js/shape-geometry.js : `lineOutline`) et `headW`, `headLen`, `tailW`, `tailLen` leur largeur et leur longueur. Elle s'écrit comme un cadre
//    (`data-ff-shape="line"`, `data-ff-flip`, `data-ff-head`, `data-ff-tail`, `data-ff-head-w`, `data-ff-head-len`, `data-ff-tail-w`, `data-ff-tail-len`, `data-ff-line`, `data-ff-lw`) : la Lecture, le diaporama, l'impression et les miniatures la dessinent par le CSS, le PDF et le Word d'après les mêmes mesures.
//  - Le STYLE du trait (demande du 22/10, import PowerPoint sans perte) : le trait d'un cadre, d'une forme ou d'une ligne est plein ou en tirets (`dash` : `data-ff-dash`, un des dix tirets
//    prédéfinis de PowerPoint - `sysDot`, `dot`, `sysDash`, `dash`, `lgDash`, `sysDashDot`, `dashDot`, `lgDashDot`, `sysDashDotDot`, `lgDashDotDot` - ou une liste de couples « trait:vide » en largeurs de
//    trait), ses bouts sont plats, ronds ou carrés (`cap` : `data-ff-cap`) et le trait est simple ou composé (`cmpd` : `data-ff-cmpd`, `dbl`, `thinThick`, `thickThin` ou `tri` : des bandes parallèles
//    dont l'ensemble fait l'épaisseur du trait). Écrits seulement quand ils ne sont pas vides (un modèle d'avant ne change pas). Un trait plein, simple et à bouts plats reste dessiné par la bordure CSS
//    ou l'anneau d'avant ; un trait en tirets, composé (ou une ligne à bouts arrondis) l'est par une IMAGE SVG que le nœud écrit (`--ff-art`, `--ff-art-nine` : js/shape-geometry.js, `strokeArt` et
//    `lineArt`) et que la feuille de style peint : la Lecture, le diaporama, l'impression et les miniatures la montrent donc sans script. Le fond d'une forme à trait en tirets ou composé s'arrête au milieu de ce trait.
//  - La ROTATION (4e fonction de la parité PowerPoint, après le fond, les formes, les traits et les notes) : un cadre ou une forme pivote autour du centre de sa boîte de `rot` degrés dans le sens des
//    aiguilles d'une montre (`data-ff-rot`, `--ff-rot` ; les degrés de PowerPoint, dont le `rot` vaut 60 000 unités par degré), dans [0, 360[ ; une ligne ne pivote pas (ses deux bouts disent son angle).
//    On la saisit par une poignée ronde au bout d'une tige au-dessus de la boîte (Maj : par pas de 15°, Échap abandonne ; l'angle se lit près de la souris), ou au clavier par Alt + ← → (15°, Maj : un
//    degré), UN pas d'historique chaque fois. Un cadre pivoté se redimensionne dans SES axes (le côté ou le coin d'en face ne bouge pas sur la page), se déplace, se duplique et se range comme un cadre
//    droit ; ses mesures (x, y, w, h) sont celles de sa boîte DROITE, si bien que tourner ne la déplace pas. Il est rogné à la page par son ancre. Le PDF le dessine en SVG (formes, puces et texte
//    tournés, le texte lu dans l'éditeur mot à mot), le Word par `a:xfrm rot`.
//  - La COUCHE (demande du 22/10 : « Au choix de chaque cadre ») : un cadre, une forme ou une ligne est DEVANT le texte de sa diapositive (comme jusque-là) ou, réglé « Derrière le texte » (`layer`,
//    `data-ff-layer="behind"` : jamais écrit pour un cadre devant), peint SOUS lui. Le CSS (css/free-frame.css) le fait pour l'éditeur, la Lecture, le diaporama, l'impression et les miniatures ; le PDF
//    (devant, il est peint après le texte de sa page), le Word (`behindDoc`) et le PowerPoint (l'ordre des formes) le suivent. Le texte de la diapositive couvre toute la largeur de sa colonne et recevrait
//    tous les clics tombés sur le cadre : comme pour une image derrière le texte, l'éditeur les laisse passer au cadre là où le pointeur n'est sur aucune lettre (`reachesBehind`).
//  - Le LIEN (demande du 02/11, « Lien, puis aperçu animé d'affilée », second niveau) : un cadre, une forme ou une ligne mène quelque part au clic (`link` : `data-ff-link`, une adresse, un signet du document ou une
//    action du diaporama - js/frame-link.js ; jamais écrit sans lien). Le bouton « Lien… » de sa barre flottante ouvre la fenêtre « Lien… » du texte (js/link-dialog.js) ; le diaporama et la Lecture suivent le lien.
// Les écritures de ce module (geste, rangement, empilement) ne sont pas des modifications à suivre (TrackChanges.skipTracking) et ne rejouent pas le rangement (OWN_META).
const FreeFrame = (function () {
  const el = Dom.el;
  const NODE = 'freeFrame';
  const LINE_NODE = 'freeLine';
  const CLASS = 'pp-free-frame';
  const BOX = 'pp-free-frame-box';
  const CONTENT = 'pp-free-frame-content';
  const ACTIVE = 'pp-ff-active';
  const SELECTED = 'pp-ff-selected';
  const EMPTY = 'pp-ff-empty';
  const UI = 'pp-ff-ui';
  // La couche derrière le texte, et la marque que l'éditeur pose sur le parent de son texte tant que les clics y passent au cadre sous le pointeur (css/free-frame.css).
  const LAYER_BEHIND = 'behind';
  const REACHING = 'pp-ff-reaching';
  // La classe des blocs de premier niveau qui ne sont pas des cadres (le texte de la diapositive) : la règle de `pp-ff-reaching` (css/free-frame.css) les vise par elle.
  const FLOW = 'pp-ff-flow';
  const OWN_META = 'ppFreeFrame';
  const BODY = '(paragraph | heading | bulletList | orderedList | taskList | blockquote | table)+';
  const PT_PER_PX = 0.75;
  const DEFAULTS = { x: 288, y: 234, w: 384, h: 72 };
  // L'aspect d'un cadre : sa sorte ('' : un cadre de texte), son fond et la couleur de son trait (#rrggbb ou '' : aucun), l'épaisseur du trait en points (0 : aucun), la TRANSPARENCE du fond
  // et celle du trait en pour cent (0 : opaque, 100 : invisible ; celle d'un fond ou d'un trait absent vaut 0), le tiret du trait ('' : plein), son bout ('' : plat, 'round', 'square') et son
  // type composé ('' : simple, 'dbl', 'thinThick', 'thickThin', 'tri'). Une ligne a de plus, à chaque bout, sa pointe (`head` au début, `tail` à la fin : '' aucune, ou 'triangle', 'arrow', 'stealth', 'diamond', 'oval')
  // et la largeur et la longueur de celle-ci (`headW`, `headLen`, `tailW`, `tailLen` : '' moyenne, 'sm' petite, 'lg' grande).
  const LOOK = { shape: '', fill: '', line: '', lw: 0, flip: '', head: '', tail: '', headW: '', headLen: '', tailW: '', tailLen: '', rot: 0, layer: '', fillTr: 0, lineTr: 0, dash: '', cap: '', cmpd: '', adj: '', geo: '', anim: '', cols: 0, colGap: 0, vert: '', alt: '', decorative: '', link: '', linkTrans: '', view: '', video: '', hidden: '', group: '' };
  // L'aspect d'une forme neuve : un fond clair, un trait plus foncé de la même teinte (le texte noir y reste lisible).
  const SHAPE_LOOK = { fill: '#d9e2f3', line: '#2f5597', lw: 1.5 };
  // L'aspect d'une ligne neuve : le trait de PowerPoint des formes, un peu plus épais (sa pointe en grandit avec lui : trois fois l'épaisseur). Une ligne a toujours une couleur et une épaisseur.
  const LINE_LOOK = { line: '#2f5597', lw: 3 };
  // Une forme et une ligne neuves d'une présentation qui a un thème (js/slide-theme.js) prennent l'aspect de son premier accent : le fond clair et le trait foncé, au lieu du bleu ci-dessus. Sans thème, celui d'avant.
  const shapeLook = () => (typeof SlideTheme !== 'undefined' && SlideTheme.shapeLook()) || SHAPE_LOOK;
  const lineLook = () => (typeof SlideTheme !== 'undefined' && SlideTheme.lineLook()) || LINE_LOOK;
  const LINE_MIN_PT = 0.25;
  const LINE_MIN_LENGTH_PT = 1;
  const SNAP_STEP = Math.PI / 12;
  // La rotation : Maj à la souris et Alt + ← → au clavier la font par pas de 15 degrés, Alt + Maj + ← → d'un degré (les touches de PowerPoint).
  const ROTATE_STEP_DEG = 15;
  const ROTATE_FINE_DEG = 1;
  const ROTATE_MIN_RADIUS_PX = 4;
  // Ce que la poignée de rotation (css/free-frame.css) prend au-dessus de la boîte, en pixels de mise en page : la barre du cadre se pose au-dessus d'elle, jamais dessus.
  const ROTATE_ROOM_PX = 34;
  const BAR_GAP_PX = 8;
  const LIMITS = { pos: 4000, minW: 24, maxW: 4000, minH: 12, maxH: 4000 };
  // Le plus petit côté d'un cadre du DÉCOR (data-ff-decor) : un bandeau fin est plus mince qu'un cadre de texte ne peut l'être.
  const DECOR_MIN_PT = 1;
  const STAY_ON_PAGE_PT = 24;
  // Les marges d'un cadre de texte (css/free-frame.css), celles par défaut de PowerPoint : un tableau posé dans un cadre les garde autour de lui.
  const FRAME_PAD_X_PT = 7.2;
  const FRAME_PAD_Y_PT = 3.6;
  const OVERFLOW_SLACK_PT = 0.5;
  const NUDGE_PT = 1;
  const NUDGE_BIG_PT = 10;
  const CASCADE_PT = 12;
  // Les attributs du nœud et leur écriture dans le HTML enregistré.
  // Ce qui marque, dans le HTML des sorties, le cadre qui peint le fond d'une diapositive (js/slide-props.js:forOutput).
  const BACKGROUND_ATTR = 'data-ff-bg';
  // Ce qui marque, dans le HTML des sorties, un cadre du DÉCOR commun d'une présentation (js/slide-theme.js:decorItems : le bandeau, le logo, le numéro et le texte de pied) : le cadre est un cadre derrière le texte, sans
  // rôle pour un lecteur d'écran, et l'éditeur ne le relit jamais (parseHTML), comme le fond d'une diapositive.
  const DECOR_ATTR = 'data-ff-decor';
  const DOM_ATTRS = { x: 'data-ff-x', y: 'data-ff-y', w: 'data-ff-w', h: 'data-ff-h', shape: 'data-ff-shape', fill: 'data-ff-fill', line: 'data-ff-line', lw: 'data-ff-lw', flip: 'data-ff-flip', head: 'data-ff-head', tail: 'data-ff-tail', headW: 'data-ff-head-w', headLen: 'data-ff-head-len', tailW: 'data-ff-tail-w', tailLen: 'data-ff-tail-len', rot: 'data-ff-rot', layer: 'data-ff-layer', fillTr: 'data-ff-fill-tr', lineTr: 'data-ff-line-tr', dash: 'data-ff-dash', cap: 'data-ff-cap', cmpd: 'data-ff-cmpd', adj: 'data-ff-adj', geo: 'data-ff-geo', anim: 'data-ff-anim', cols: 'data-ff-cols', colGap: 'data-ff-col-gap', vert: 'data-ff-vert', alt: 'data-ff-alt', decorative: 'data-ff-decorative', link: 'data-ff-link', linkTrans: 'data-ff-link-trans', view: 'data-ff-view', video: 'data-ff-video', hidden: 'data-ff-hidden', group: 'data-ff-group' };
  // Les variables CSS du dessin d'un cadre (css/free-frame.css) : écrites seulement pour un cadre qui a un aspect, retirées sinon.
  const LOOK_VARS = ['--ff-fill', '--ff-fill-op', '--ff-fill-inset', '--ff-fill-radius', '--ff-line', '--ff-line-op', '--ff-edge', '--ff-radius', '--ff-clip', '--ff-ring', '--ff-ring-bg', '--ff-pt', '--ff-pr', '--ff-pb', '--ff-pl', '--ff-bleed', '--ff-grab', '--ff-art', '--ff-art-nine', '--ff-fill-art', '--ff-slice', '--ff-sx', '--ff-sy', '--ff-ex', '--ff-ey', '--ff-rot', '--ff-cols', '--ff-col-gap'];
  const EDGES = ['n', 'e', 's', 'w'];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  // Le curseur d'une poignée d'un cadre pivoté : celui de la direction où elle pointe à l'écran (le côté de la poignée tourne avec le cadre), le plus proche de ceux que le navigateur sait faire.
  const HANDLE_ANGLES = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  const cursorFor = (side, rot) => RESIZE_CURSORS[Math.round((((HANDLE_ANGLES[side] + rot) % 180) + 180) % 180 / 45) % 4];

  let libs = null;      // { NodeSelection, TextSelection } de ProseMirror (js/editor.js)
  let toolbar = null;   // la barre flottante du cadre sélectionné (wireToolbar)
  let syncBar = null;   // ce qui la montre ou la cache selon la sélection (wireToolbar : `check`)
  function configure(deps) { libs = deps; }

  // Les mesures
  const toNumber = (value, fallback) => {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const tidy = value => Math.round(value * 100) / 100;
  // Une couleur lisible (#rrggbb en minuscules), ou '' : aucune.
  const colorOf = (raw) => {
    const hex = typeof raw === 'string' ? ColorMath.parseCss(raw) : null;
    return hex ? hex.toLowerCase() : '';
  };
  // Un angle de rotation, en degrés dans le sens des aiguilles d'une montre (le `rot` de PowerPoint, sans ses 60 000 unités par degré), ramené dans [0, 360[ au centième : -90 vaut 270, 360
  // vaut 0. Une valeur absente ou illisible vaut 0.
  const turnOf = (raw) => {
    const turn = tidy(((toNumber(raw, 0) % 360) + 360) % 360);
    return turn >= 360 ? 0 : turn;
  };
  // Le nombre de colonnes de texte d'un cadre : un entier de 2 à COLUMNS_MAX ; 0 (une seule colonne) pour une valeur absente, illisible ou de moins de deux. L'écart entre elles, en points : au centième, de 0 à GAP_MAX_PT, COLUMN_GAP_PT quand il n'est pas dit.
  const COLUMNS_MAX = 16;
  const COLUMN_GAP_PT = 18;
  const COLUMN_GAP_MAX_PT = 200;
  // L'orientation du texte (`vert` de PowerPoint) : '' (horizontal), 'vert' (tourné de 90° dans le sens des aiguilles d'une montre : il se lit de haut en bas, ses lignes se suivent de droite à gauche) ou
  // 'vert270' (de 270° : de bas en haut, ses lignes de gauche à droite). Toute autre valeur est horizontale.
  const VERTICALS = ['vert', 'vert270'];
  const verticalOf = raw => (VERTICALS.indexOf(String(raw || '').trim()) >= 0 ? String(raw).trim() : '');
  const columnsOf = (raw) => { const n = Math.round(toNumber(raw, 0)); return n >= 2 ? Math.min(n, COLUMNS_MAX) : 0; };
  // L'adresse du repère d'une diapositive (`slide-3` : la même forme que SlideProps, anchorId) : celle de la diapositive qu'une vue montre.
  const viewOf = raw => (typeof raw === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw) ? raw : '');
  // L'identifiant du groupe où l'objet est rangé (js/frame-multi.js) : des lettres et des chiffres, '' quand il n'est dans aucun. Il ne vaut que parmi les objets d'une même diapositive.
  const groupOf = raw => (typeof raw === 'string' && /^[a-z0-9]{3,16}$/.test(raw) ? raw : '');
  const columnGapOf = raw => tidy(clamp(toNumber(raw, COLUMN_GAP_PT), 0, COLUMN_GAP_MAX_PT));
  // Une transparence, en pour cent entier de 0 (opaque) à 100 (invisible) ; une valeur absente ou illisible vaut 0.
  const transparencyOf = raw => clamp(Math.round(toNumber(raw, 0)), 0, 100);
  // Les attributs d'un cadre, bornés : une valeur absente ou illisible (HTML écrit à la main, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur.
  // Une ligne (sorte `line`) a ses deux bouts pour boîte : sa largeur ou sa hauteur peut être nulle, jamais les deux (au moins un point de long) ; elle a toujours une couleur et une épaisseur,
  // pas de fond ; son sens et ses pointes sont lus (ShapeGeometry.flipOf, endOf). Ces trois réglages n'existent que pour elle. Une ligne ne pivote pas (ses deux bouts disent son angle) : sa
  // rotation vaut 0 ; celle d'un cadre ou d'une forme est lue par turnOf.
  function normalized(raw) {
    const a = raw || {};
    const shape = ShapeGeometry.kindOf(a.shape);
    const line = shape === ShapeGeometry.LINE;
    const fill = line ? '' : colorOf(a.fill);
    const stroke = line ? colorOf(a.line) || LINE_LOOK.line : colorOf(a.line);
    const adj = !line && shape && typeof ShapePresets === 'object' ? ShapePresets.adjText(shape, a.adj) : '';
    const decorative = AltText.isDecorative(a.decorative) || a.decorative === '1' || a.decorative === 1;
    const out = {
      x: tidy(clamp(toNumber(a.x, DEFAULTS.x), -LIMITS.pos, LIMITS.pos)),
      y: tidy(clamp(toNumber(a.y, DEFAULTS.y), -LIMITS.pos, LIMITS.pos)),
      w: tidy(clamp(toNumber(a.w, DEFAULTS.w), line ? 0 : (a.decor ? DECOR_MIN_PT : LIMITS.minW), LIMITS.maxW)),
      h: tidy(clamp(toNumber(a.h, DEFAULTS.h), line ? 0 : (a.decor ? DECOR_MIN_PT : LIMITS.minH), LIMITS.maxH)),
      shape,
      fill,
      line: stroke,
      lw: tidy(line ? clamp(toNumber(a.lw, LINE_LOOK.lw), LINE_MIN_PT, ShapeGeometry.MAX_LINE_PT) : clamp(toNumber(a.lw, LOOK.lw), 0, ShapeGeometry.MAX_LINE_PT)),
      flip: line ? ShapeGeometry.flipOf(a.flip) : '',
      head: line ? ShapeGeometry.endOf(a.head) : '',
      tail: line ? ShapeGeometry.endOf(a.tail) : '',
      headW: '',
      headLen: '',
      tailW: '',
      tailLen: '',
      rot: line ? 0 : turnOf(a.rot),
      layer: a.layer === LAYER_BEHIND ? LAYER_BEHIND : '',
      fillTr: fill ? transparencyOf(a.fillTr) : 0,
      lineTr: stroke ? transparencyOf(a.lineTr) : 0,
      dash: stroke ? ShapeGeometry.dashOf(a.dash) : '',
      cap: stroke ? ShapeGeometry.capOf(a.cap) : '',
      cmpd: stroke ? ShapeGeometry.cmpdOf(a.cmpd) : '',
      // Les réglages d'une forme (les poignées jaunes de PowerPoint : js/shape-presets.js), seulement ceux que sa sorte connaît et qui ne sont pas ceux d'origine, et sa géométrie retenue.
      adj,
      geo: !line && shape && ShapeGeometry.drawnByPresets(shape, adj) ? ShapeGeometry.geoText(a.geo) : '',
      // Son animation au diaporama (js/frame-anim.js) : le texte du réglage, '' quand il n'en a pas.
      anim: FrameAnim.text(a.anim),
      // Ses colonnes de texte (demande du 24/10, « Import PowerPoint sans perte », chantier 9 : `numCol`, `spcCol`) : 2 à 16, 0 pour une seule ; l'écart entre elles en points (18 sans autre mot). Une ligne n'a pas de texte.
      cols: line ? 0 : columnsOf(a.cols),
      colGap: 0,
      vert: line ? '' : verticalOf(a.vert),
      // Son texte alternatif (demande du 24/10, « Import PowerPoint sans perte », chantier 10 : `descr` de l'objet) : ce que lit un lecteur d'écran à la place du nom de la sorte (js/alt-text.js : une ligne de
      // 500 signes au plus, '' quand il n'y en a pas). « Objet décoratif » (demande du 06/11) : rien à lire - un filet, un fond, un motif - ; il n'a alors pas de texte.
      alt: decorative ? '' : AltText.clean(a.alt),
      decorative: decorative ? '1' : '',
      // Son lien (js/frame-link.js) : une adresse, un signet du document ou une action du diaporama ; '' quand il n'en a pas (ou que ce qu'il dit n'est rien de cela). Une ligne n'en a pas : sa boîte ne prend aucun clic.
      link: line ? '' : FrameLink.text(a.link),
      // Son animation au clic (js/frame-link.js:transText) : ce que joue le diaporama en suivant le lien, ni plus ni moins que sur un lien qui mène à une diapositive ; '' : l'effet de la diapositive visée.
      linkTrans: line || !FrameLink.canAnimate(a.link) ? '' : FrameLink.transText(a.linkTrans),
      // La diapositive qu'il montre en petit et en direct (js/slide-view.js) : l'adresse de son repère (`slide-3`) ; '' quand il n'en montre pas. Une ligne n'en montre pas.
      view: line ? '' : viewOf(a.view),
      // La vidéo qu'il porte (js/video-frame.js) : `youtube:<identifiant>` ou `vimeo:<identifiant>`, avec `@<secondes>` pour un départ plus loin ; '' quand il n'en porte pas. Une ligne n'en porte pas.
      video: line ? '' : VideoFrame.valueOf(a.video),
      // Son masquage (demande du 24/10, chantier 10 : `hidden` de l'objet, le volet Sélection de PowerPoint) : « 1 » quand l'objet est masqué ; atténué dans l'éditeur, absent de la Lecture, du diaporama et des exports.
      hidden: a.hidden === '1' || a.hidden === 1 || a.hidden === true ? '1' : '',
      // Son groupe (demande du 03/11, « Idem + guides + groupes ») : les objets du même groupe se choisissent, se déplacent et s'alignent ensemble ; rien n'en part dans les exports.
      group: groupOf(a.group),
    };
    if (out.cols) out.colGap = columnGapOf(a.colGap);
    if (line && Math.hypot(out.w, out.h) < LINE_MIN_LENGTH_PT) out.w = LINE_MIN_LENGTH_PT;
    // La largeur et la longueur d'une pointe n'existent qu'avec la pointe.
    if (out.head) { out.headW = ShapeGeometry.endSizeOf(a.headW); out.headLen = ShapeGeometry.endSizeOf(a.headLen); }
    if (out.tail) { out.tailW = ShapeGeometry.endSizeOf(a.tailW); out.tailLen = ShapeGeometry.endSizeOf(a.tailLen); }
    return out;
  }
  // Le trait d'un cadre, en points : il compte quand il a une couleur ET une épaisseur (la boîte le plafonne au quart de son petit côté en le dessinant ; une ligne n'a pas de plafond de boîte).
  const lineWidthOf = a => (a.line ? ShapeGeometry.lineWidthFor(a.w, a.h, a.lw, a.shape) : 0);
  const isPlain = a => !a.shape && !a.fill && !lineWidthOf(a);
  const isLineAttrs = a => a.shape === ShapeGeometry.LINE;
  // Les attributs d'un élément enregistré. `shape` : la sorte que le nœud impose (celle d'une ligne), quand le HTML ne la dit pas.
  function attrsOfEl(dom, shape) {
    const raw = {};
    Object.keys(DOM_ATTRS).forEach((key) => { raw[key] = dom.getAttribute(DOM_ATTRS[key]); });
    if (shape) raw.shape = shape;
    if (dom.hasAttribute(DECOR_ATTR)) raw.decor = true;
    return normalized(raw);
  }
  // Ce que le CSS lit pour dessiner l'aspect du cadre `a` : ses marges de texte (la sorte et le trait les règlent), son fond, son trait (la bordure d'une boîte rectangulaire ou arrondie, un
  // anneau découpé dans un polygone). Rien pour un cadre de texte nu : son CSS est celui d'avant.
  // L'opacité (de 0 à 1) d'un calque dont la transparence est de `tr` pour cent.
  const opacityOf = tr => String(Math.round(100 - tr) / 100);
  function lookVars(a) {
    if (isLineAttrs(a)) return lineVars(a);
    if (isPlain(a)) return {};
    const edge = lineWidthOf(a);
    if (ShapeGeometry.drawnByPresets(a.shape, a.adj)) return presetVars(a, edge);
    // Un trait en tirets ou composé se dessine par une image (ShapeGeometry.strokeArt), pas par la bordure ou l'anneau du trait plein et simple.
    const art = edge && (a.dash || a.cmpd) ? ShapeGeometry.strokeArt(a.shape, a.w, a.h, { lw: edge, color: a.line, dash: a.dash, cap: a.cap, cmpd: a.cmpd }) : null;
    // Un trait translucide, en tirets ou composé, ne couvre pas le fond qu'il borde : le fond s'arrête au milieu de lui (ShapeGeometry.look), comme dans PowerPoint, le PDF et le Word.
    const look = ShapeGeometry.look(a.shape, a.w, a.h, edge, a.fill && edge && (a.lineTr || art) ? edge / 2 : 0, !!art);
    const pad = ShapeGeometry.textInsets(a.shape, a.w, a.h, edge);
    const vars = { '--ff-pt': pad[0] + 'pt', '--ff-pr': pad[1] + 'pt', '--ff-pb': pad[2] + 'pt', '--ff-pl': pad[3] + 'pt' };
    if (a.fill) vars['--ff-fill'] = a.fill;
    if (a.fill && a.fillTr) vars['--ff-fill-op'] = opacityOf(a.fillTr);
    if (look.fillInset) { vars['--ff-fill-inset'] = look.fillInset + 'pt'; vars['--ff-fill-radius'] = look.fillRadius; }
    if (art) {
      // Un rectangle, un rectangle arrondi ou un cadre de texte peint l'image en bordure image à neuf cases (la boîte grandit avec son texte, l'épaisseur du trait ne bouge pas), les autres formes l'étirent.
      vars[art.slice ? '--ff-art-nine' : '--ff-art'] = art.url;
      if (art.slice) { vars['--ff-slice'] = art.slice; vars['--ff-edge'] = art.edge + 'pt'; }
    } else if (edge) vars['--ff-line'] = a.line;
    if (edge && a.lineTr) vars['--ff-line-op'] = opacityOf(a.lineTr);
    if (look.edge) vars['--ff-edge'] = look.edge + 'pt';
    if (look.radius !== '0') vars['--ff-radius'] = look.radius;
    if (look.clip !== 'none') vars['--ff-clip'] = look.clip;
    if (look.ring !== 'none') { vars['--ff-ring'] = look.ring; vars['--ff-ring-bg'] = a.line; }
    return vars;
  }
  // Ce que le CSS lit pour dessiner une forme de la norme (le cylindre, le cœur, les flèches courbes... ; ou l'une des seize à réglages : ShapeGeometry.presetArt) : ses marges de texte, l'image de
  // son fond (`--ff-fill-art`, peinte par le calque du fond) et celle de son trait (`--ff-art`, par le calque du trait), chacune avec son opacité.
  function presetVars(a, edge) {
    const pad = ShapeGeometry.textInsets(a.shape, a.w, a.h, edge, { adj: a.adj, cap: a.cap, geo: a.geo });
    const art = ShapeGeometry.presetArt(a.shape, a.w, a.h, { fill: a.fill, line: edge ? a.line : '', lw: edge, dash: a.dash, cap: a.cap, cmpd: a.cmpd, adj: a.adj, geo: a.geo });
    const vars = { '--ff-pt': pad[0] + 'pt', '--ff-pr': pad[1] + 'pt', '--ff-pb': pad[2] + 'pt', '--ff-pl': pad[3] + 'pt' };
    if (art.fill) {
      vars['--ff-fill-art'] = art.fill;
      if (a.fillTr) vars['--ff-fill-op'] = opacityOf(a.fillTr);
    }
    if (art.line) {
      vars['--ff-art'] = art.line;
      if (a.lineTr) vars['--ff-line-op'] = opacityOf(a.lineTr);
    }
    return vars;
  }
  // Le dessin d'une forme (son fond et son trait en image) n'est gardé par le nettoyage du HTML (la Lecture, le diaporama, la sortie) que s'il tient dans l'adresse qu'il accepte (HtmlSanitize.isSafeArt :
  // 30 000 caractères) : sinon la forme disparaîtrait. Un trait composé ou en tirets redessine le contour une fois par bande ou par tiret, et celui d'une forme libre très détaillée n'y tient plus.
  const ART_VARS = ['--ff-art', '--ff-art-nine', '--ff-fill-art'];
  function artFits(raw) {
    const vars = lookVars(normalized(raw));
    return ART_VARS.every(name => !vars[name] || HtmlSanitize.isSafeArt(vars[name]));
  }
  // Un réglage de l'aspect `changes` sur `current` est refusé quand il ferait sortir le dessin de la forme de ce que la Lecture garde (alors que la forme y tient avant) ; un dessin déjà trop gros
  // (un fichier plus ancien) peut encore changer de couleur ou de trait.
  const lookRefused = (current, changes) => artFits(current) && !artFits(Object.assign({}, current, changes));
  // Ce que le CSS lit pour dessiner une ligne : son encre (la couleur du trait, découpée dans le calque de fond par le polygone de la ligne), le tour que sa boîte prend autour de celle de ses deux
  // bouts (l'encre en sort), la bande qu'on saisit et la place des deux bouts (en points depuis le coin de la boîte agrandie).
  function lineVars(a) {
    const options = { flip: a.flip, lw: lineWidthOf(a), head: a.head, tail: a.tail, headW: a.headW, headLen: a.headLen, tailW: a.tailW, tailLen: a.tailLen };
    const look = ShapeGeometry.lineLook(a.w, a.h, options);
    // Une ligne en tirets, en pointillés, à bouts arrondis, composée ou à pointe autre que le triangle est une image (ShapeGeometry.lineArt) peinte par le calque du trait ; sinon l'encre est le calque de fond
    // découpé par le polygone.
    const art = ShapeGeometry.lineArt(a.w, a.h, Object.assign({ color: a.line, dash: a.dash, cap: a.cap, cmpd: a.cmpd }, options));
    const vars = { '--ff-bleed': look.bleed + 'pt', '--ff-sx': look.start[0] + 'pt', '--ff-sy': look.start[1] + 'pt', '--ff-ex': look.end[0] + 'pt', '--ff-ey': look.end[1] + 'pt' };
    if (art) {
      vars['--ff-art'] = art.url;
      if (a.lineTr) vars['--ff-line-op'] = opacityOf(a.lineTr);
    } else {
      vars['--ff-fill'] = a.line;
      if (a.lineTr) vars['--ff-fill-op'] = opacityOf(a.lineTr);
      if (look.clip !== 'none') vars['--ff-clip'] = look.clip;
    }
    if (look.grab !== 'none') vars['--ff-grab'] = look.grab;
    return vars;
  }
  // La rotation : `--ff-rot`, que le CSS lit (css/free-frame.css) ; rien pour un cadre droit.
  const turnVars = a => (a.rot ? { '--ff-rot': a.rot + 'deg' } : {});
  // Les colonnes de texte : `--ff-cols` et `--ff-col-gap`, que le CSS lit (css/free-frame.css) ; rien pour un cadre à une colonne.
  const columnVars = a => (a.cols ? { '--ff-cols': String(a.cols), '--ff-col-gap': a.colGap + 'pt' } : {});
  const varsOf = a => Object.assign({ '--ff-x': a.x + 'pt', '--ff-y': a.y + 'pt', '--ff-w': a.w + 'pt', '--ff-h': a.h + 'pt' }, lookVars(a), turnVars(a), columnVars(a));
  const styleOf = (a) => { const vars = varsOf(a); return Object.keys(vars).map(name => name + ':' + vars[name]).join(';'); };
  // Les attributs data-ff-* d'un cadre : ses mesures toujours, son aspect seulement quand il en a un (un cadre de texte nu s'écrit comme avant).
  function dataAttrsOf(a) {
    const out = {};
    ['x', 'y', 'w', 'h'].forEach((key) => { out[DOM_ATTRS[key]] = String(a[key]); });
    if (a.shape) out[DOM_ATTRS.shape] = a.shape;
    if (a.fill) out[DOM_ATTRS.fill] = a.fill;
    if (a.line) out[DOM_ATTRS.line] = a.line;
    if (a.lw) out[DOM_ATTRS.lw] = String(a.lw);
    if (a.flip) out[DOM_ATTRS.flip] = a.flip;
    // Chaque bout écrit sa pointe puis sa largeur et sa longueur (quand elles ne sont pas la moyenne).
    ['head', 'headW', 'headLen', 'tail', 'tailW', 'tailLen'].forEach((key) => { if (a[key]) out[DOM_ATTRS[key]] = a[key]; });
    if (a.rot) out[DOM_ATTRS.rot] = String(a.rot);
    if (a.layer) out[DOM_ATTRS.layer] = a.layer;
    if (a.fillTr) out[DOM_ATTRS.fillTr] = String(a.fillTr);
    if (a.lineTr) out[DOM_ATTRS.lineTr] = String(a.lineTr);
    if (a.dash) out[DOM_ATTRS.dash] = a.dash;
    if (a.cap) out[DOM_ATTRS.cap] = a.cap;
    if (a.cmpd) out[DOM_ATTRS.cmpd] = a.cmpd;
    if (a.adj) out[DOM_ATTRS.adj] = a.adj;
    if (a.geo) out[DOM_ATTRS.geo] = a.geo;
    if (a.anim) out[DOM_ATTRS.anim] = a.anim;
    if (a.cols) out[DOM_ATTRS.cols] = String(a.cols);
    if (a.cols && a.colGap !== COLUMN_GAP_PT) out[DOM_ATTRS.colGap] = String(a.colGap);
    if (a.vert) out[DOM_ATTRS.vert] = a.vert;
    if (a.alt) out[DOM_ATTRS.alt] = a.alt;
    if (a.decorative) out[DOM_ATTRS.decorative] = '1';
    if (a.link) out[DOM_ATTRS.link] = a.link;
    if (a.linkTrans) out[DOM_ATTRS.linkTrans] = a.linkTrans;
    if (a.view) out[DOM_ATTRS.view] = a.view;
    if (a.video) out[DOM_ATTRS.video] = a.video;
    if (a.hidden) out[DOM_ATTRS.hidden] = '1';
    if (a.group) out[DOM_ATTRS.group] = a.group;
    return out;
  }
  function domAttrs(a) {
    // Son texte alternatif est son nom pour un lecteur d'écran dans le HTML écrit aussi (la Lecture ne passe pas par la vue de l'éditeur qui le pose).
    // Un objet décoratif n'a pas de nom à lire : `presentation` (le texte qu'il porte reste lu).
    return Object.assign({ class: CLASS, role: a.decorative ? 'presentation' : 'group', style: styleOf(a) }, a.alt ? { 'aria-label': a.alt } : {}, dataAttrsOf(a));
  }
  // Le fond d'une diapositive, tel que les sorties le lisent (js/slide-props.js:forOutput) : un cadre de la page entière, à son coin, plein de `color` (#rrggbb), sans trait ni texte. Le CSS
  // le peint SOUS le texte et à la taille de la page (css/free-frame.css), le PDF et le Word le posent derrière lui à la taille de la leur ; l'éditeur ne le relit jamais (parseHTML).
  function backgroundHtml(color) {
    const page = pageSize();
    const a = normalized({ x: 0, y: 0, w: page.width, h: page.height, fill: color });
    const attrs = Object.assign({ class: CLASS, role: 'presentation', 'aria-hidden': 'true', style: styleOf(a), [BACKGROUND_ATTR]: '' }, dataAttrsOf(a));
    const text = Object.keys(attrs).map(name => ' ' + name + '="' + attrs[name] + '"').join('');
    return '<div' + text + '><div class="' + BOX + '"><div class="' + CONTENT + '"></div></div></div>';
  }
  // Le HTML d'un cadre ou d'une ligne tel que l'éditeur l'écrit (domAttrs), pour ce qui compose le texte d'une présentation d'un coup : l'import PowerPoint (js/pptx-import.js). `raw` : les
  // attributs, bornés par `normalized` (une ligne s'écrit par sa sorte `line`) ; `inner` : le balisage du contenu (paragraphes, titres, listes), déjà sûr, et vide pour une ligne.
  function html(raw, inner) {
    const attrs = domAttrs(normalized(raw));
    const text = Object.keys(attrs).map(name => ' ' + name + '="' + String(attrs[name]).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"').join('');
    return '<div' + text + '><div class="' + BOX + '"><div class="' + CONTENT + '">' + (inner || '') + '</div></div></div>';
  }
  // Le HTML d'un cadre du décor commun d'une présentation, tel que les sorties le lisent (js/slide-props.js:forOutput) : comme `html`, derrière le texte, mais sans rôle (le logo, le numéro et le bandeau ne sont
  // pas du contenu pour un lecteur d'écran) et marqué `data-ff-decor` : la Lecture, le PDF, le Word le posent comme n'importe quel cadre derrière le texte, un fichier HTML qui coule comme une page web et la lecture
  // simple de la diapositive (js/slide-text.js) le laissent de côté, comme le fond.
  function decorHtml(raw, inner) {
    const a = normalized(Object.assign({}, raw, { layer: LAYER_BEHIND, decor: true }));
    const attrs = Object.assign({ class: CLASS, role: 'presentation', 'aria-hidden': 'true', style: styleOf(a), [DECOR_ATTR]: '' }, dataAttrsOf(a));
    const text = Object.keys(attrs).map(name => ' ' + name + '="' + String(attrs[name]).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '"').join('');
    return '<div' + text + '><div class="' + BOX + '"><div class="' + CONTENT + '">' + (inner || '') + '</div></div></div>';
  }
  // Le HTML d'une présentation sans ses objets masqués : ce que la Lecture, le diaporama, l'impression et les exports reçoivent (js/slides-entry.js:outputHtml) ; l'export PowerPoint garde les
  // siens (il les écrit masqués). Le modèle enregistré n'est jamais touché.
  function withoutHidden(source) {
    const text = String(source == null ? '' : source);
    if (text.indexOf(DOM_ATTRS.hidden) === -1) return text;
    const body = HtmlSanitize.parseInert(text);
    return withoutHiddenIn(body) ? body.innerHTML : text;
  }
  // La même chose sur un arbre déjà lu (js/slides-entry.js:outputHtml l'enchaîne avec les autres étapes sans le relire) ; vrai quand un objet masqué est parti.
  function withoutHiddenIn(root) {
    const found = root.querySelectorAll('.' + CLASS + '[' + DOM_ATTRS.hidden + ']');
    if (!found.length) return false;
    found.forEach((el) => { el.remove(); });
    return true;
  }
  // La page en points (celle du modèle ouvert) : ce qui borne un cadre et le centre d'un cadre neuf.
  function pageSize() {
    const size = PageLayout.getPageSizePt();
    return { width: size.width, height: size.height };
  }
  // Un cadre reste atteignable : au moins STAY_ON_PAGE_PT de lui sur la page, de chaque côté.
  function keepReachable(a, page) {
    return Object.assign({}, a, {
      x: tidy(clamp(a.x, STAY_ON_PAGE_PT - a.w, page.width - STAY_ON_PAGE_PT)),
      y: tidy(clamp(a.y, STAY_ON_PAGE_PT - a.h, page.height - STAY_ON_PAGE_PT)),
    });
  }

  // Un cadre dépasse de sa diapositive quand le rectangle qui enveloppe sa boîte, tournée et à la hauteur que son texte lui donne, sort de la page : le CSS le rogne alors à son bord, dans
  // l'éditeur comme dans toutes les sorties. `dom` est l'élément du cadre (celui que `measuresOf` lit) ; sa hauteur montrée est celle de la boîte dessinée (`offsetHeight`, en pixels de
  // mise en page : ni le zoom de la feuille ni la rotation n'y comptent), jamais moins que la hauteur réglée. Une ligne n'a que ses deux bouts pour boîte ; le fond d'une diapositive
  // (`data-ff-bg`, des sorties seulement) est la page même. L'écart d'un demi-point ne compte pas (l'arrondi des mesures). Une boîte sans fond ni trait ne se voit pas : seul son contenu (le texte,
  // une image) sort de la page ou n'en sort pas, ses marges ne comptent pas (une image au ras de la page, d'un fond ou d'un import PowerPoint, n'est pas un cadre qui dépasse). Un cadre DERRIÈRE le texte
  // qui n'a pas de texte à lui (un bandeau, une forme, une image : un décor) est rogné à la page par construction, rien n'y est perdu : il n'est jamais signalé.
  function measuredOverflow(dom) {
    if (dom.hasAttribute(BACKGROUND_ATTR) || dom.hasAttribute(DECOR_ATTR)) return false;
    const a = attrsOfEl(dom);
    const box = dom.querySelector(':scope > .' + BOX);
    if (a.layer === LAYER_BEHIND) {
      const body = box && box.querySelector(':scope > .' + CONTENT);
      if (!body || !body.textContent.trim()) return false;
    }
    const shown = isLineAttrs(a) || !box ? a.h : Math.max(a.h, box.offsetHeight * PT_PER_PX);
    const content = box && !isLineAttrs(a) && !a.fill && !(a.line && a.lw) ? box.querySelector(':scope > .' + CONTENT) : null;
    const style = content ? getComputedStyle(content) : null;
    const padX = style ? Math.min(parseFloat(style.paddingLeft) || 0, parseFloat(style.paddingRight) || 0) * PT_PER_PX : 0;
    const padY = style ? Math.min(parseFloat(style.paddingTop) || 0, parseFloat(style.paddingBottom) || 0) * PT_PER_PX : 0;
    const wide = Math.max(a.w - 2 * padX, 0);
    const high = Math.max(shown - 2 * padY, 0);
    const turn = a.rot * Math.PI / 180;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const halfW = (wide * cos + high * sin) / 2;
    const halfH = (wide * sin + high * cos) / 2;
    const centerX = a.x + a.w / 2;
    const centerY = a.y + shown / 2;
    const page = pageSize();
    return centerX - halfW < -OVERFLOW_SLACK_PT || centerY - halfH < -OVERFLOW_SLACK_PT || centerX + halfW > page.width + OVERFLOW_SLACK_PT || centerY + halfH > page.height + OVERFLOW_SLACK_PT;
  }
  // La réponse de `overflowsPage` pour chaque cadre vivant, et de quoi elle dépend : la hauteur montrée de sa boîte et la page. La bande des diapositives la demande à chaque frappe pour tous
  // les cadres du texte (494 sur une présentation chargée) : relire leurs réglages et leur style à chaque fois coûtait ~8 ms par lettre. Ni les réglages ni le texte d'un cadre ne changent sans que
  // `paint` repasse dessus (nœud mis à jour, geste) : il oublie alors la réponse (null). Un élément que `paint` n'a jamais peint (un test, une copie) n'est pas gardé (undefined).
  const overflowKept = new WeakMap();
  function overflowsPage(dom) {
    const kept = overflowKept.get(dom);
    const page = pageSize();
    if (kept && kept.box.offsetHeight === kept.height && kept.width === page.width && kept.pageHeight === page.height) return kept.out;
    const out = measuredOverflow(dom);
    const box = kept === undefined ? null : dom.querySelector(':scope > .' + BOX);
    if (box) overflowKept.set(dom, { box, height: box.offsetHeight, width: page.width, pageHeight: page.height, out });
    return out;
  }

  // Le geste, en pure fonction : `kind` est 'move' ou les côtés tenus par la poignée (n, e, s, w, ne, nw, se, sw) ; `dx` et `dy` le déplacement de la souris en points ; `shown` la hauteur
  // montrée au départ (la plus grande de `h` et du texte) ; `natural` la hauteur que demande le texte à la largeur d'arrivée. Rend les mesures à poser PENDANT le geste : `h` est la hauteur
  // demandée (la boîte montre la plus grande de `h` et du texte), `y` suit la hauteur montrée quand c'est le bord du haut qui bouge. Un cadre pivoté (`start.rot`) se redimensionne dans SES axes
  // (turnedGesture) ; le déplacer ne dépend pas de son angle.
  function flatGesture(kind, start, dx, dy, shown, natural) {
    let { x, y, w, h } = start;
    if (kind.indexOf('e') >= 0) w = Math.max(LIMITS.minW, start.w + dx);
    if (kind.indexOf('w') >= 0) { w = Math.max(LIMITS.minW, start.w - dx); x = start.x + start.w - w; }
    if (kind.indexOf('s') >= 0) h = Math.max(LIMITS.minH, shown + dy);
    if (kind.indexOf('n') >= 0) {
      h = Math.max(LIMITS.minH, shown - dy);
      y = start.y + shown - Math.max(h, natural);
    }
    return { x, y, w, h };
  }
  function gesture(kind, start, dx, dy, shown, natural, page) {
    const { w, h } = start;
    if (kind === 'move') return keepReachable({ x: start.x + dx, y: start.y + dy, w, h }, page);
    if (start.rot) return turnedGesture(kind, start, dx, dy, shown, natural, page);
    return keepReachable(flatGesture(kind, start, dx, dy, shown, natural), page);
  }
  // Le geste d'un cadre PIVOTÉ : la souris parcourt la page, la poignée tient un côté du cadre dans SES axes. Le déplacement est d'abord ramené dans les axes du cadre (« à plat »), le cadre est
  // redimensionné comme s'il était droit, puis reposé de sorte que le côté ou le coin que le geste à plat laisse en place (celui d'en face de la poignée) ne bouge pas sur la page : la rotation se
  // fait autour du centre, qui se déplace donc de la moitié de ce que la taille a changé, dans l'angle du cadre. `natural` doit être la hauteur du texte à la largeur d'arrivée (elle donne la
  // hauteur montrée, donc le centre) ; avec 0, seule la largeur est juste.
  function turnedGesture(kind, start, dx, dy, shown, natural, page) {
    const angle = start.rot * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const flat = flatGesture(kind, { x: 0, y: 0, w: start.w, h: start.h }, dx * cos + dy * sin, dy * cos - dx * sin, shown, natural);
    const height = Math.max(flat.h, natural);
    const moveX = flat.x + flat.w / 2 - start.w / 2;
    const moveY = flat.y + height / 2 - shown / 2;
    const centerX = start.x + start.w / 2 + moveX * cos - moveY * sin;
    const centerY = start.y + shown / 2 + moveX * sin + moveY * cos;
    return keepReachable({ x: tidy(centerX - flat.w / 2), y: tidy(centerY - height / 2), w: flat.w, h: flat.h }, page);
  }
  // Le geste de la poignée de rotation, en pure fonction : l'angle (en degrés) d'un cadre qui était à `startRot` quand la souris était en `from`, la souris étant maintenant en `to` ; `center` est le
  // centre du cadre, autour duquel il tourne. Le cadre tourne d'autant que la souris tourne autour de lui (la poignée ne saute pas sous la souris). `snap` (Maj) tient l'angle sur un pas de 15 degrés.
  function rotationAt(startRot, center, from, to, snap) {
    const before = Math.atan2(from.y - center.y, from.x - center.x);
    const now = Math.atan2(to.y - center.y, to.x - center.x);
    const turn = startRot + (now - before) * 180 / Math.PI;
    return turnOf(snap ? Math.round(turn / ROTATE_STEP_DEG) * ROTATE_STEP_DEG : turn);
  }
  // Le geste d'une LIGNE, en pure fonction : `kind` est 'move' (la ligne entière) ou 'start' / 'end' (le bout qu'on tient) ; `dx` et `dy` le déplacement de la souris en points ; `snap` (Maj)
  // garde l'angle de la ligne par pas de 15 degrés autour du bout qu'on ne tient pas. Rend les mesures de la boîte de ses deux bouts (`x`, `y`, `w`, `h`) et son sens (`flip`) : tenir un bout
  // et le passer de l'autre côté de l'autre le retourne, la ligne n'est jamais « à l'envers ».
  function lineGesture(kind, start, dx, dy, page, snap) {
    if (kind === 'move') return keepReachable({ x: start.x + dx, y: start.y + dy, w: start.w, h: start.h, flip: start.flip }, page);
    const ends = ShapeGeometry.lineEnds(start.w, start.h, start.flip);
    const begin = [start.x + ends.start[0], start.y + ends.start[1]];
    const finish = [start.x + ends.end[0], start.y + ends.end[1]];
    const held = kind === 'start' ? begin : finish;
    const fixed = kind === 'start' ? finish : begin;
    let moved = [held[0] + dx, held[1] + dy];
    if (snap) {
      const angle = Math.round(Math.atan2(moved[1] - fixed[1], moved[0] - fixed[0]) / SNAP_STEP) * SNAP_STEP;
      const length = Math.hypot(moved[0] - fixed[0], moved[1] - fixed[1]);
      moved = [fixed[0] + Math.cos(angle) * length, fixed[1] + Math.sin(angle) * length];
    }
    const from = kind === 'start' ? moved : fixed;
    const to = kind === 'start' ? fixed : moved;
    const w = tidy(Math.abs(to[0] - from[0]));
    const h = tidy(Math.abs(to[1] - from[1]));
    return keepReachable({
      x: tidy(Math.min(from[0], to[0])), y: tidy(Math.min(from[1], to[1])), w: Math.hypot(w, h) < LINE_MIN_LENGTH_PT ? LINE_MIN_LENGTH_PT : w, h,
      flip: (from[0] > to[0] ? 'h' : '') + (from[1] > to[1] ? 'v' : ''),
    }, page);
  }
  // La hauteur à ENREGISTRER à la fin d'un geste : ce que la personne a demandé, sauf quand le texte la dépasse ou l'égale - le cadre s'ajuste alors à son texte (la hauteur minimale).
  function storedHeight(requested, natural) {
    return requested <= natural + 0.5 ? LIMITS.minH : requested;
  }

  // Le document
  function inPresentation() {
    return SlidesEntry.presentationShown() && !HeaderFooterPreview.getHfMode();
  }
  const isLineNode = node => !!node && node.type.name === LINE_NODE;
  const isFrame = node => !!node && (node.type.name === NODE || node.type.name === LINE_NODE);
  // Le repère de transition de la diapositive (js/slide-props.js) ouvre le début de sa diapositive, devant les cadres : il n'est pas un cadre, et n'en dérange aucun.
  const isProps = node => !!node && node.type.name === 'slideProps';
  // Le début de la diapositive qui contient `pos` : derrière le dernier saut de page de premier niveau qui le précède, ou le début du texte.
  function slideStartOf(doc, pos) {
    let start = 0;
    doc.forEach((node, offset) => {
      if (node.type.name === 'pageBreak' && offset < pos) start = offset + node.nodeSize;
    });
    return start;
  }
  // Les cadres du début d'une diapositive : de son début jusque derrière le dernier cadre de la suite (l'endroit où poser un cadre neuf, au premier plan). `framesFrom` : où commencent les
  // cadres, derrière le repère de transition de la diapositive quand elle en a un (l'endroit où poser un cadre à l'arrière-plan).
  function headRange(doc, slideStart) {
    let at = slideStart;
    let framesFrom = slideStart;
    while (at < doc.content.size) {
      const node = doc.nodeAt(at);
      if (!isFrame(node) && !isProps(node)) break;
      at += node.nodeSize;
      if (isProps(node) && framesFrom === at - node.nodeSize) framesFrom = at;
    }
    return { from: slideStart, framesFrom, to: at };
  }
  // Le cadre autour d'une position, ou null : { pos, node }.
  function frameAround($pos) {
    for (let depth = $pos.depth; depth >= 1; depth--) {
      const node = $pos.node(depth);
      if (isFrame(node)) return { pos: $pos.before(depth), node };
    }
    return null;
  }
  const selectedFrame = selection => (selection && selection.node && isFrame(selection.node) ? { pos: selection.from, node: selection.node } : null);
  const currentFrame = state => selectedFrame(state.selection) || frameAround(state.selection.$from);
  // Le curseur au début du texte de la diapositive `slide` ({ start, end }) SANS entrer dans un de ses cadres : la bande y va quand on clique une miniature. Null sans endroit où écrire.
  function flowSelection(doc, slide) {
    const from = headRange(doc, slide.start).to;
    if (from > slide.end) return null;
    const found = libs.TextSelection.findFrom(doc.resolve(from), 1, true);
    return found && found.from <= slide.end ? found : null;
  }

  // Les cadres mal rangés d'un texte : ceux qui ne sont pas dans la suite du début de leur diapositive (au milieu d'un texte, dans une colonne, un encadré, une cellule...).
  // Rend [{ pos, node, slot }] dans l'ordre du texte, `slot` étant la position, dans le texte d'ici, où ranger le cadre (derrière les cadres déjà en tête de sa diapositive).
  function misplaced(doc) {
    const found = [];
    let slideStart = 0;
    let inHead = true;
    doc.forEach((node, offset) => {
      if (node.type.name === 'pageBreak') { slideStart = offset + node.nodeSize; inHead = true; return; }
      if (isProps(node)) return;
      if (isFrame(node)) {
        if (!inHead) found.push({ pos: offset, node, slot: headRange(doc, slideStart).to });
        return;
      }
      inHead = false;
      node.descendants((child, childOffset) => {
        if (isFrame(child)) found.push({ pos: offset + 1 + childOffset, node: child, slot: headRange(doc, slideStart).to });
        return !isFrame(child);
      });
    });
    return found;
  }
  // Le rangement : une transaction qui retire les cadres mal rangés et les remet, dans leur ordre, derrière ceux du début de leur diapositive ; null quand tout est rangé.
  function tidyTransaction(state) {
    const wrong = misplaced(state.doc);
    if (!wrong.length) return null;
    const tr = state.tr;
    const bySlot = new Map();
    wrong.forEach((entry) => {
      if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, []);
      bySlot.get(entry.slot).push(entry.node);
    });
    wrong.slice().reverse().forEach(entry => tr.delete(entry.pos, entry.pos + entry.node.nodeSize));
    Array.from(bySlot.keys()).sort((a, b) => b - a).forEach(slot => tr.insert(tr.mapping.map(slot, -1), bySlot.get(slot)));
    return TrackChanges.skipTracking(tr.setMeta(OWN_META, true));
  }

  // Un collage
  // Les cadres du premier niveau d'un collage qui sont COMPLETS : un texte copié dans un cadre arrive enveloppé du cadre, ouvert des deux côtés (son contenu seulement est copié), et se colle
  // comme du texte.
  function closedFrameIndexes(slice) {
    const last = slice.content.childCount - 1;
    const found = [];
    slice.content.forEach((node, offset, index) => {
      if (isFrame(node) && !((index === 0 && slice.openStart > 0) || (index === last && slice.openEnd > 0))) found.push(index);
    });
    return found;
  }
  // Le contenu `fragment` sans ses cadres (`unwrap` : leurs blocs prennent leur place ; sinon ils sont retirés), jusque dans les conteneurs ; un conteneur que cela laisse invalide est retiré.
  function withoutFrames(fragment, unwrap) {
    const out = [];
    fragment.forEach((node) => {
      if (isFrame(node)) { if (unwrap) withoutFrames(node.content, true).forEach(child => out.push(child)); return; }
      if (node.isLeaf || node.isTextblock) { out.push(node); return; }
      const content = withoutFrames(node.content, unwrap);
      if (content.eq(node.content)) { out.push(node); return; }
      if (node.type.validContent(content)) out.push(node.copy(content));
    });
    return fragment.constructor.fromArray(out);
  }
  const hasFrame = fragment => { let found = false; fragment.descendants((node) => { if (isFrame(node)) found = true; return !found; }); return found; };
  // Le premier endroit libre pour un cadre de mesures `a` : un cadre déjà posé aux mêmes mesures (`taken`, complétée du cadre posé) le fait glisser de CASCADE_PT, comme la copie d'un objet de
  // tout éditeur de diapositives.
  function freeSpot(a, taken, page) {
    let spot = a;
    for (let k = 0; k < 20 && taken.some(t => Math.abs(t.x - spot.x) < 0.5 && Math.abs(t.y - spot.y) < 0.5); k++) {
      spot = keepReachable(Object.assign({}, spot, { x: spot.x + CASCADE_PT, y: spot.y + CASCADE_PT }), page);
    }
    taken.push(spot);
    return spot;
  }
  // Les mesures des cadres déjà posés au début de la diapositive qui commence à `slideStart`.
  function takenIn(doc, slideStart) {
    const head = headRange(doc, slideStart);
    const taken = [];
    doc.nodesBetween(head.from, head.to, (node) => { if (isFrame(node)) taken.push(normalized(node.attrs)); return false; });
    return taken;
  }
  function handlePaste(view, event, slice) {
    if (!libs || !hasFrame(slice.content)) return false;
    const { state } = view;
    const SliceClass = slice.constructor;
    if (!inPresentation()) {
      view.dispatch(state.tr.replaceSelection(new SliceClass(withoutFrames(slice.content, true), 0, 0)).scrollIntoView());
      return true;
    }
    const closed = closedFrameIndexes(slice);
    if (!closed.length) return false;
    const frames = [];
    const rest = [];
    slice.content.forEach((node, offset, index) => { (closed.indexOf(index) >= 0 ? frames : rest).push(node); });
    const slideStart = slideStartOf(state.doc, state.selection.from);
    const at = headRange(state.doc, slideStart).to;
    const taken = takenIn(state.doc, slideStart);
    const page = pageSize();
    const pasted = frames.map(node => node.type.create(Object.assign({}, node.attrs, freeSpot(normalized(node.attrs), taken, page)), node.content, node.marks));
    const tr = state.tr.insert(at, pasted);
    if (rest.length) {
      const openStart = closed.indexOf(0) >= 0 ? 0 : slice.openStart;
      const openEnd = closed.indexOf(slice.content.childCount - 1) >= 0 ? 0 : slice.openEnd;
      tr.replaceSelection(new SliceClass(slice.content.constructor.fromArray(rest), openStart, openEnd));
    } else {
      tr.setSelection(libs.NodeSelection.create(tr.doc, at + pasted.slice(0, -1).reduce((sum, node) => sum + node.nodeSize, 0)));
    }
    view.dispatch(tr.scrollIntoView());
    return true;
  }

  // Les commandes
  function select(ed, pos) {
    ed.view.dispatch(ed.state.tr.setSelection(libs.NodeSelection.create(ed.state.doc, pos)));
  }
  const own = tr => TrackChanges.skipTracking(tr.setMeta(OWN_META, true));
  // Pose un cadre neuf au centre de la diapositive qui commence à `slideStart`, au premier plan. `options.shape` : la sorte d'une forme (rien : un cadre de texte). Un cadre de texte reçoit le
  // curseur ; une forme est sélectionnée - sa barre propose tout de suite le fond et le trait - et son texte, centré, s'écrit en y entrant (Entrée, ou un clic). Faux hors d'une présentation
  // modifiable.
  function insert(ed, slideStart, options) {
    if (!libs || !ed || !ed.isEditable || !inPresentation()) return false;
    const { state } = ed;
    const page = pageSize();
    if (options && options.shape === ShapeGeometry.LINE) return insertLine(ed, slideStart, options);
    const kind = ShapeGeometry.kindOf(options && options.shape);
    const size = kind ? ShapeGeometry.defaults(kind) : { w: DEFAULTS.w, h: DEFAULTS.h };
    const w = Math.min(size.w, Math.max(LIMITS.minW, page.width - 2 * STAY_ON_PAGE_PT));
    const h = Math.min(size.h, Math.max(LIMITS.minH, page.height - 2 * STAY_ON_PAGE_PT));
    const at = headRange(state.doc, slideStart).to;
    const wanted = Object.assign({ x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, shape: kind }, kind ? shapeLook() : {});
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const type = state.schema.nodes[NODE];
    const node = kind ? type.create(attrs, state.schema.nodes.paragraph.create({ textAlign: 'center' })) : type.createAndFill(attrs);
    const tr = own(state.tr.insert(at, node));
    tr.setSelection(kind ? libs.NodeSelection.create(tr.doc, at) : libs.TextSelection.near(tr.doc.resolve(at + 1), 1)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Pose un tableau dans un cadre neuf, au centre de la diapositive qui commence à `slideStart` (demande du 02/11 : « Tableau » du menu Objets, comme sur un document). `options.table` : le tableau à poser
  // (la copie d'un modèle Grille, que js/linked-table.js lie) ; sans lui, un tableau de deux lignes et deux colonnes, vide, comme le bouton « Tableau » de la barre. Le cadre prend la largeur du tableau
  // posé (la somme des largeurs de colonnes de sa première ligne, ou celle d'un cadre de texte), rognée à la page ; sa hauteur est un minimum, le cadre grandit avec ses lignes. Le curseur va dans la
  // première case, la barre du tableau s'ouvre. `options.meta` : des marques de la transaction (le lien d'un tableau lié). Faux hors d'une présentation modifiable.
  const TABLE_ROW_PT = 21;
  function insertTable(ed, slideStart, options) {
    if (!libs || !ed || !ed.isEditable || !inPresentation()) return false;
    const { state } = ed;
    const { schema } = state;
    const page = pageSize();
    const given = options && options.table;
    const table = given || schema.nodes.table.create(null, [0, 1].map(() => schema.nodes.tableRow.create(null, [0, 1].map(() => schema.nodes.tableCell.createAndFill()))));
    let columnsPx = 0;
    const first = table.firstChild;
    if (given && first) {
      first.forEach((cell) => { columnsPx += cell.attrs.colwidth ? cell.attrs.colwidth.reduce((sum, px) => sum + px, 0) : 0; });
    }
    const natural = columnsPx ? columnsPx * 0.75 + 2 * FRAME_PAD_X_PT : DEFAULTS.w;
    const w = Math.min(natural, Math.max(LIMITS.minW, page.width - 2 * STAY_ON_PAGE_PT));
    const h = Math.min(table.childCount * TABLE_ROW_PT + 2 * FRAME_PAD_Y_PT, Math.max(LIMITS.minH, page.height - 2 * STAY_ON_PAGE_PT));
    const at = headRange(state.doc, slideStart).to;
    const wanted = { x: (page.width - w) / 2, y: (page.height - h) / 2, w, h };
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const tr = own(state.tr.insert(at, schema.nodes[NODE].create(attrs, table)));
    const meta = (options && options.meta) || {};
    Object.keys(meta).forEach((name) => { tr.setMeta(name, meta[name]); });
    tr.setSelection(libs.TextSelection.near(tr.doc.resolve(at + 3), 1)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Pose la VUE d'une diapositive (js/slide-view.js, « Vue… » du menu « Objets ») : un cadre à la forme de la page, large de 40 % d'elle, au centre de la diapositive qui commence à `slideStart`,
  // au premier plan, qui montre en direct la diapositive d'adresse `options.id` et y mène au clic (son lien, `#id`). Son texte de repli est le titre de cette diapositive (`options.title`), son fond blanc,
  // son trait gris et fin : ce que le PDF, le Word, le HTML et le PowerPoint montrent à la place de la vue. `options.claim` : le repère que la diapositive montrée reçoit avec la vue (SlideProps.CLAIM_META),
  // défait avec elle d'un seul Ctrl+Z. Le cadre est SÉLECTIONNÉ (sa barre propose le lien et son animation). Faux hors d'une présentation modifiable.
  const VIEW_WIDTH_RATIO = 0.4;
  const VIEW_LOOK = { fill: '#ffffff', line: '#bfbfbf', lw: 0.75 };
  function insertView(ed, slideStart, options) {
    if (!libs || !ed || !ed.isEditable || !inPresentation() || !options || !viewOf(options.id)) return false;
    const { state } = ed;
    const { schema } = state;
    const page = pageSize();
    const w = Math.min(tidy(page.width * VIEW_WIDTH_RATIO), Math.max(LIMITS.minW, page.width - 2 * STAY_ON_PAGE_PT));
    const h = Math.min(tidy(w * page.height / page.width), Math.max(LIMITS.minH, page.height - 2 * STAY_ON_PAGE_PT));
    const at = headRange(state.doc, slideStart).to;
    const wanted = Object.assign({ x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, view: options.id, link: '#' + options.id, alt: options.alt || '' }, VIEW_LOOK);
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const title = String(options.title || '');
    const node = schema.nodes[NODE].create(attrs, schema.nodes.paragraph.create({ textAlign: 'center' }, title ? schema.text(title) : null));
    const tr = own(state.tr.insert(at, node));
    if (options.claim) tr.setMeta(SlideProps.CLAIM_META, options.claim);
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Pose une VIDÉO (js/video-frame.js, « Vidéo… » du menu « Objets ») : un cadre au format 16/9, large de 60 % de la page, au centre de la diapositive qui commence à `slideStart`, au premier plan, qui porte la vidéo
  // `options.video` (`youtube:…` ou `vimeo:…`) et mène à son adresse sur le site (`link`) : ce que le PDF, le Word, le HTML, l'e-mail et le PowerPoint montrent à la place du lecteur. Son texte est le titre
  // `options.title` (modifiable comme tout texte de cadre), son nom pour un lecteur d'écran `options.alt`. Le cadre est SÉLECTIONNÉ. Faux hors d'une présentation modifiable ou pour une vidéo qui n'en est pas une.
  const VIDEO_WIDTH_RATIO = 0.6;
  const VIDEO_LOOK = { fill: '#f1f3f6', line: '#bfbfbf', lw: 0.75 };
  function insertVideo(ed, slideStart, options) {
    const value = options ? VideoFrame.valueOf(options.video) : '';
    if (!libs || !ed || !ed.isEditable || !inPresentation() || !value) return false;
    const { state } = ed;
    const { schema } = state;
    const page = pageSize();
    const w = Math.min(tidy(page.width * VIDEO_WIDTH_RATIO), Math.max(LIMITS.minW, page.width - 2 * STAY_ON_PAGE_PT));
    const h = Math.min(tidy(w * 9 / 16), Math.max(LIMITS.minH, page.height - 2 * STAY_ON_PAGE_PT));
    const at = headRange(state.doc, slideStart).to;
    const wanted = Object.assign({ x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, video: value, link: VideoFrame.watchUrl(value), alt: options.alt || '' }, VIDEO_LOOK);
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const title = String(options.title || '');
    const node = schema.nodes[NODE].create(attrs, schema.nodes.paragraph.create({ textAlign: 'center' }, title ? schema.text(title) : null));
    const tr = own(state.tr.insert(at, node));
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Pose une ligne neuve (`options.head` et `options.tail` : ses pointes) : horizontale, au milieu de la diapositive, au premier plan, SÉLECTIONNÉE (ses deux bouts se saisissent, sa barre propose le
  // trait et les extrémités). Une ligne n'a pas de texte à recevoir.
  function insertLine(ed, slideStart, options) {
    const { state } = ed;
    const page = pageSize();
    const w = Math.min(ShapeGeometry.defaults(ShapeGeometry.LINE).w, Math.max(LINE_MIN_LENGTH_PT, page.width - 2 * STAY_ON_PAGE_PT));
    const look = lineLook();
    const wanted = { x: (page.width - w) / 2, y: page.height / 2, w, h: 0, shape: ShapeGeometry.LINE, line: look.line, lw: look.lw, head: options.head, tail: options.tail };
    const attrs = freeSpot(normalized(wanted), takenIn(state.doc, slideStart), page);
    const at = headRange(state.doc, slideStart).to;
    const tr = own(state.tr.insert(at, state.schema.nodes[LINE_NODE].create(attrs)));
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    ed.view.focus();
    return true;
  }
  // Les mesures d'un cadre, écrites : UN pas d'historique, la sélection (le cadre) gardée. Rend vrai quand quelque chose a changé.
  // `extend(tr)` : ce que l'appelant ajoute à la même transaction (le signet qu'un lien neuf demande, js/link-dialog.js), défait avec elle d'un seul Annuler.
  function patch(ed, pos, changes, reselect, extend) {
    const node = ed.state.doc.nodeAt(pos);
    if (!isFrame(node)) return false;
    const next = normalized(Object.assign({}, node.attrs, changes));
    if (Object.keys(next).every(key => next[key] === node.attrs[key])) return false;
    const tr = own(ed.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, next)));
    if (reselect) tr.setSelection(libs.NodeSelection.create(tr.doc, pos));
    if (extend) extend(tr);
    ed.view.dispatch(tr);
    return true;
  }
  function nudge(ed, found, dx, dy) {
    const a = normalized(found.node.attrs);
    const moved = keepReachable({ x: a.x + dx, y: a.y + dy, w: a.w, h: a.h }, pageSize());
    return patch(ed, found.pos, { x: moved.x, y: moved.y }, true);
  }
  // Pivote le cadre de `delta` degrés (UN pas d'historique) et le dit dans la ligne d'état, pour qui n'a pas la souris. Faux quand rien ne change (une ligne ne pivote pas).
  function turnBy(ed, found, delta) {
    const a = normalized(found.node.attrs);
    if (isLineAttrs(a)) return false;
    const rot = turnOf(a.rot + delta);
    if (!patch(ed, found.pos, { rot }, true)) return false;
    SlidesEntry.status(I18n.t('frame.rotated', { n: numberText(rot) }));
    return true;
  }
  // L'empilement : le cadre passe au premier plan (`front`) ou à l'arrière-plan (`back`) des cadres de sa diapositive.
  function reorder(ed, found, where) {
    const { state } = ed;
    const head = headRange(state.doc, slideStartOf(state.doc, found.pos));
    const size = found.node.nodeSize;
    if ((where === 'front' && found.pos + size === head.to) || (where === 'back' && found.pos === head.framesFrom)) return false;
    const tr = own(state.tr.delete(found.pos, found.pos + size));
    const to = tr.mapping.map(where === 'front' ? head.to : head.framesFrom, where === 'front' ? -1 : 1);
    tr.insert(to, found.node);
    tr.setSelection(libs.NodeSelection.create(tr.doc, to)).scrollIntoView();
    ed.view.dispatch(tr);
    return true;
  }
  function duplicate(ed, found) {
    const { state } = ed;
    const slideStart = slideStartOf(state.doc, found.pos);
    const at = headRange(state.doc, slideStart).to;
    const page = pageSize();
    const a = normalized(found.node.attrs);
    const spot = freeSpot(keepReachable(Object.assign({}, a, { x: a.x + CASCADE_PT, y: a.y + CASCADE_PT }), page), takenIn(state.doc, slideStart), page);
    const copy = found.node.type.create(Object.assign({}, found.node.attrs, spot, { group: '' }), found.node.content, found.node.marks);
    const tr = own(state.tr.insert(at, copy));
    tr.setSelection(libs.NodeSelection.create(tr.doc, at)).scrollIntoView();
    ed.view.dispatch(tr);
    return true;
  }
  function remove(ed, found) {
    ed.view.dispatch(own(ed.state.tr.delete(found.pos, found.pos + found.node.nodeSize)).scrollIntoView());
    ed.view.focus();
    return true;
  }

  // La vue
  // Mesure ce que rend `measure()` pendant que la boîte `box` est DROITE : le rectangle d'une boîte pivotée est celui de sa rotation, or ce que les exports lisent du DOM (la hauteur que le texte lui
  // donne, la place de son texte) est celui de la boîte droite, dont ils posent ensuite la rotation eux-mêmes.
  function straight(box, measure) {
    const saved = box.style.transform;
    box.style.transform = 'none';
    try { return measure(); } finally { box.style.transform = saved; }
  }
  // Comme `straight`, et un texte tourné (`vert`, `vert270`) est mesuré mis À PLAT : la boîte reçoit pour largeur sa hauteur et pour hauteur sa largeur, ses marges tournent avec elle (la marge du haut du
  // cadre devient celle de gauche, ou de droite, de la boîte à plat) et le texte s'y écrit en lignes horizontales. Le dessin d'un export le tourne ensuite d'un quart de tour (+90 ou -90 degrés) autour du
  // centre du cadre : `measure()` y lit les mots à leur place, comme pour un cadre pivoté.
  function horizontal(box, measure) {
    const undo = flatten(box);
    try { return straight(box, measure); } finally { undo(); }
  }
  // La mise à plat de `horizontal`, pour un export qui garde le cadre à plat plus longtemps : rend la fonction qui le remet comme avant (rien à faire pour un cadre dont le texte n'est pas tourné).
  function flatten(box) {
    const frame = box.parentElement;
    const vert = frame ? verticalOf(frame.getAttribute(DOM_ATTRS.vert)) : '';
    if (!vert) return () => {};
    const content = box.querySelector('.' + CONTENT);
    const pad = content ? getComputedStyle(content) : null;
    const read = side => (pad ? parseFloat(pad['padding' + side]) || 0 : 0) + 'px';
    const own = { top: read('Top'), right: read('Right'), bottom: read('Bottom'), left: read('Left') };
    const turned = vert === 'vert' ? { top: own.right, right: own.bottom, bottom: own.left, left: own.top } : { top: own.left, right: own.top, bottom: own.right, left: own.bottom };
    const names = ['--ff-w', '--ff-h', '--ff-pt', '--ff-pr', '--ff-pb', '--ff-pl'];
    const saved = names.map(name => frame.style.getPropertyValue(name));
    const width = frame.style.getPropertyValue('--ff-w');
    const height = frame.style.getPropertyValue('--ff-h');
    frame.removeAttribute(DOM_ATTRS.vert);
    frame.style.setProperty('--ff-w', height);
    frame.style.setProperty('--ff-h', width);
    frame.style.setProperty('--ff-pt', turned.top);
    frame.style.setProperty('--ff-pr', turned.right);
    frame.style.setProperty('--ff-pb', turned.bottom);
    frame.style.setProperty('--ff-pl', turned.left);
    return () => {
      frame.setAttribute(DOM_ATTRS.vert, vert);
      names.forEach((name, k) => { if (saved[k]) frame.style.setProperty(name, saved[k]); else frame.style.removeProperty(name); });
    };
  }
  // La hauteur que demande le texte du cadre à sa largeur d'aujourd'hui, en points : la boîte sans hauteur minimale.
  // La boîte est mesurée DROITE : le rectangle d'une boîte pivotée est celui qui enveloppe sa rotation, pas sa hauteur.
  function naturalHeight(box, zoom) {
    const savedHeight = box.style.minHeight;
    const savedTurn = box.style.transform;
    box.style.minHeight = '0';
    box.style.transform = 'none';
    const height = box.getBoundingClientRect().height / zoom * PT_PER_PX;
    box.style.minHeight = savedHeight;
    box.style.transform = savedTurn;
    return height;
  }
  function paint(dom, a) {
    overflowKept.set(dom, null);
    const vars = varsOf(a);
    Object.keys(vars).forEach((name) => { dom.style.setProperty(name, vars[name]); });
    LOOK_VARS.forEach((name) => { if (!(name in vars)) dom.style.removeProperty(name); });
    const data = dataAttrsOf(a);
    Object.keys(DOM_ATTRS).forEach((key) => {
      const name = DOM_ATTRS[key];
      if (name in data) dom.setAttribute(name, data[name]); else dom.removeAttribute(name);
    });
  }
  // L'interface d'un cadre : la couche `.pp-ff-ui` et ses quatre bords, qu'on saisit toujours. Les huit poignées, la rotation et la marque de lien (`addHandles`) ne se construisent qu'au premier
  // besoin (cadre choisi, actif ou lié : css/free-frame.css ne les montre que dans ces trois cas) : dans une présentation de 494 cadres, c'étaient 5 700 éléments de l'éditeur, presque tous cachés,
  // à construire à l'ouverture, à garder en mémoire et à recalculer à chaque passe de style.
  function buildUi() {
    const ui = el('div', UI);
    ui.contentEditable = 'false';
    ui.setAttribute('aria-hidden', 'true');
    EDGES.forEach((side) => {
      const edge = el('div', 'pp-ff-edge pp-ff-edge-' + side);
      edge.dataset.ffKind = 'move';
      edge.title = I18n.t('frame.moveTip');
      ui.appendChild(edge);
    });
    return ui;
  }
  // Les huit poignées, la rotation et la marque de lien, après les bords de `ui` ; rend les huit poignées.
  function addHandles(ui) {
    const handles = HANDLES.map((side) => {
      const handle = el('div', 'pp-ff-handle pp-ff-handle-' + side);
      handle.dataset.ffKind = side;
      ui.appendChild(handle);
      return handle;
    });
    // La poignée de rotation, au-dessus du cadre, au bout d'une tige.
    const rotate = el('div', 'pp-ff-rotate');
    rotate.dataset.ffKind = 'rotate';
    rotate.title = I18n.t('frame.rotateTip');
    Dom.setMarkup(rotate, Icons.svg('rotate'));
    ui.appendChild(rotate);
    // La marque d'un objet à lien (js/frame-link.js) : une petite chaîne dans son coin ; le CSS ne la montre que pour un cadre qui a `data-ff-link`.
    const badge = el('div', 'pp-ff-link-badge');
    Dom.setMarkup(badge, Icons.svg('link'));
    ui.appendChild(badge);
    return handles;
  }
  // Une décoration de nœud du cadre dit-elle qu'il est actif ou choisi (au curseur, ou dans une sélection multiple) ? Alors ses poignées doivent exister.
  const showsHandles = decorations => !!decorations && decorations.some((d) => { const c = d.type && d.type.attrs && d.type.attrs.class; return !!c && (c.indexOf(ACTIVE) >= 0 || c.indexOf(SELECTED) >= 0); });
  function liveFrame(ed, getPos) {
    const pos = getPos();
    const node = typeof pos === 'number' ? ed.state.doc.nodeAt(pos) : null;
    return isFrame(node) ? { pos, node } : null;
  }
  // Un geste à la souris : déplacer (le bord) ou redimensionner (une poignée). La souris parle en pixels écran, les mesures en points de la page : la feuille est réduite à ~0,85 dans un
  // panneau de ~700 px (EditorCore.layoutZoom). La boîte suit en direct ; UN pas d'historique à la fin ; Échap l'abandonne.
  function startGesture(event, kind, ctx) {
    if (kind === 'rotate') { startRotation(event, ctx); return; }
    const { ed, getPos, dom, box } = ctx;
    if (event.button !== 0 || !ed.isEditable) return;
    const live = liveFrame(ed, getPos);
    if (!live) return;
    event.preventDefault();
    event.stopPropagation();
    // Maj + clic sur un bord : le cadre entre dans la sélection (ou en sort) au lieu d'être déplacé (js/frame-multi.js) ; glisser l'un des cadres choisis les déplace tous.
    if (event.shiftKey && kind === 'move' && FrameMulti.toggle(ed, live.pos)) { ed.view.focus(); return; }
    const group = kind === 'move' ? FrameMulti.groupFor(ed, live.pos) : [];
    if (!group.length) select(ed, live.pos);
    ed.view.focus();
    const zoom = EditorCore.layoutZoom(dom);
    const page = pageSize();
    const start = normalized(live.node.attrs);
    const isLine = isLineAttrs(start);
    const shown = isLine ? start.h : Math.max(start.h, naturalHeight(box, zoom));
    let current = start;
    let moved = false;
    // Le geste ne règle que les mesures ; l'aspect (la sorte, le fond, le trait) suit les mesures à chaque pas : le contour d'une forme se redessine à sa taille du moment.
    const show = measures => paint(dom, Object.assign({}, start, measures));
    // Les autres cadres choisis suivent du même écart (chacun reste atteignable).
    const followers = group.map(member => ({ member, current: member.start }));
    // Les repères (js/frame-multi.js) : en déplaçant, l'ensemble s'accroche aux bords et aux centres des autres objets et de la diapositive, des traits le disent ; Alt les suspend.
    const snapper = kind === 'move' ? FrameMulti.snapper(ed, { pos: live.pos, members: group.map(g => g.pos), box, start, shown, zoom }) : null;
    const showGroup = (now) => {
      followers.forEach((f) => {
        const moved = keepReachable({ x: f.member.start.x + (now.x - start.x), y: f.member.start.y + (now.y - start.y), w: f.member.start.w, h: f.member.start.h }, page);
        f.current = Object.assign({}, f.member.start, { x: moved.x, y: moved.y });
        if (f.member.dom) paint(f.member.dom, f.current);
      });
    };
    function onMove(e) {
      if (!moved) { moved = true; if (toolbar) { toolbar.hide(); } FrameMulti.hideBar(); }
      const dx = (e.clientX - event.clientX) / zoom * PT_PER_PX;
      const dy = (e.clientY - event.clientY) / zoom * PT_PER_PX;
      if (isLine) { current = lineGesture(kind, start, dx, dy, page, e.shiftKey); if (snapper) current = snapper.snap(current, e.altKey); show(current); showGroup(current); return; }
      // La largeur change ce que demande le texte : posée d'abord, elle donne la hauteur du texte qui règle le bord du haut (et, pour un cadre pivoté, le centre autour duquel il tourne).
      current = gesture(kind, start, dx, dy, shown, 0, page);
      if (snapper) current = snapper.snap(current, e.altKey);
      show(current);
      showGroup(current);
      if (kind !== 'move' && (kind.indexOf('n') >= 0 || start.rot)) { current = gesture(kind, start, dx, dy, shown, naturalHeight(box, zoom), page); show(current); }
    }
    function stop() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey, true);
      if (snapper) snapper.end();
    }
    function onUp() {
      stop();
      const now = liveFrame(ed, getPos);
      if (!now || !moved) return;
      // Seul un bord du haut ou du bas change la hauteur demandée : déplacer le cadre ou le prendre par un côté ne la réécrit jamais.
      const vertical = !isLine && (kind.indexOf('n') >= 0 || kind.indexOf('s') >= 0);
      const final = vertical ? Object.assign({}, current, { h: storedHeight(current.h, naturalHeight(box, zoom)) }) : current;
      if (followers.length) {
        const moves = [{ pos: now.pos, x: final.x, y: final.y }].concat(followers.map(f => ({ pos: f.member.pos, x: f.current.x, y: f.current.y })));
        if (!FrameMulti.commitMoves(ed, moves)) { paint(dom, normalized(now.node.attrs)); followers.forEach(f => f.member.dom && paint(f.member.dom, f.member.start)); }
        return;
      }
      if (!patch(ed, now.pos, final, true)) paint(dom, normalized(now.node.attrs));
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      const now = liveFrame(ed, getPos);
      if (now) paint(dom, normalized(now.node.attrs));
      followers.forEach(f => f.member.dom && paint(f.member.dom, f.member.start));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey, true);
  }
  // Pivoter à la souris (la poignée au-dessus du cadre) : le cadre tourne autour de son centre d'autant que la souris tourne autour de lui, Maj tient l'angle sur un pas de 15 degrés, Échap abandonne,
  // UN pas d'historique à la fin. L'angle du moment se lit près de la souris pendant le geste (une pastille hors de la feuille, donc toujours droite). Une ligne ne pivote pas.
  function startRotation(event, ctx) {
    const { ed, getPos, dom, box } = ctx;
    if (event.button !== 0 || !ed.isEditable) return;
    const live = liveFrame(ed, getPos);
    if (!live || isLineNode(live.node)) return;
    event.preventDefault();
    event.stopPropagation();
    select(ed, live.pos);
    ed.view.focus();
    const start = normalized(live.node.attrs);
    // Le centre du rectangle qui enveloppe la boîte est celui de la boîte, quel que soit son angle : le pivot ne bouge pas pendant le geste.
    const rect = box.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const from = { x: event.clientX, y: event.clientY };
    const badge = el('div', 'pp-ff-angle');
    badge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(badge);
    let current = start.rot;
    let moved = false;
    const show = rot => paint(dom, Object.assign({}, start, { rot }));
    function onMove(e) {
      if (!moved) { moved = true; if (toolbar) toolbar.hide(); }
      badge.style.left = e.clientX + 16 + 'px';
      badge.style.top = e.clientY - 30 + 'px';
      // Tout près du centre, l'angle de la souris saute d'un pas à l'autre : le cadre garde le dernier.
      if (Math.hypot(e.clientX - center.x, e.clientY - center.y) >= ROTATE_MIN_RADIUS_PX) {
        current = rotationAt(start.rot, center, from, { x: e.clientX, y: e.clientY }, e.shiftKey);
        show(current);
      }
      badge.textContent = numberText(current) + '°';
    }
    function stop() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey, true);
      badge.remove();
    }
    function onUp() {
      stop();
      const now = liveFrame(ed, getPos);
      if (!now || !moved) return;
      if (!patch(ed, now.pos, { rot: current }, true)) paint(dom, normalized(now.node.attrs));
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      const now = liveFrame(ed, getPos);
      if (now) paint(dom, normalized(now.node.attrs));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey, true);
  }
  const isEmptyFrame = node => node.childCount === 1 && node.firstChild.type.name === 'paragraph' && node.firstChild.childCount === 0;
  // Les cadres « derrière le texte » vivants de l'éditeur (un par vue de nœud) : le survol les passe en revue sans chercher dans le document.
  const behindFrames = new Set();
  const remember = (dom, a) => { if (a.layer) behindFrames.add(dom); else behindFrames.delete(dom); };
  function nodeView({ node: initial, editor: ed, getPos, decorations }) {
    let node = initial;
    const dom = el('div', CLASS);
    const box = el('div', BOX);
    const ui = buildUi();
    // Les poignées : construites au premier besoin (`ensureHandles`), jamais retirées ensuite.
    let handles = [];
    const turnHandles = (a) => { handles.forEach((handle) => { handle.style.cursor = a.rot ? cursorFor(handle.dataset.ffKind, a.rot) : ''; }); };
    const ensureHandles = () => {
      if (handles.length) return;
      handles = addHandles(ui);
      turnHandles(normalized(node.attrs));
    };
    // (`update` les construit pour un cadre actif ou choisi, `refresh` pour un cadre lié, `selectNode` pour un choix par la souris ou le clavier, la création pour un cadre né avec le curseur dedans.)
    const content = el('div', CONTENT);
    box.append(ui, content);
    dom.appendChild(box);
    dom.setAttribute('role', 'group');
    // La vue d'une diapositive (js/slide-view.js) : un calque sous l'interface, que le cadre pose quand il a `view` et retire sinon ; un clic dessus choisit le cadre, un glisser le déplace (comme son bord).
    let viewHost = null;
    const syncView = (a) => {
      if (!a.view) {
        if (viewHost) { SlideView.untrack(viewHost); viewHost.remove(); viewHost = null; dom.classList.remove(SlideView.HAS); }
        return;
      }
      if (!viewHost) {
        viewHost = SlideView.host();
        box.insertBefore(viewHost, ui);
        viewHost.addEventListener('mousedown', (event) => startGesture(event, 'move', { ed, getPos, dom, box }));
      }
      SlideView.track(viewHost, dom, a);
    };
    // La vidéo (js/video-frame.js) : un calque sous l'interface, que le cadre pose quand il porte `video` et retire sinon. Le disque ▶ lit la vidéo (le lecteur de GFS, ou le site de la vidéo dans un nouvel onglet) ;
    // ailleurs sur le calque, un clic choisit le cadre et un glisser le déplace (comme son bord).
    let videoHost = null;
    let videoShown = '';
    const syncVideo = (a) => {
      if (!a.video) {
        if (videoHost) { VideoFrame.stop(dom); videoHost.remove(); videoHost = null; videoShown = ''; }
        return;
      }
      if (videoHost && videoShown === a.video) return;
      if (videoHost) videoHost.remove();
      videoShown = a.video;
      videoHost = VideoFrame.host(a.video);
      box.insertBefore(videoHost, ui);
      const play = videoHost.querySelector('.' + VideoFrame.PLAY);
      if (play) play.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); VideoFrame.activate(dom); });
      videoHost.addEventListener('mousedown', (event) => { if (!(event.target.closest && event.target.closest('.' + VideoFrame.PLAY))) startGesture(event, 'move', { ed, getPos, dom, box }); });
    };
    // Le nom du cadre dit sa sorte : « Ellipse », « Étoile »... ; « Cadre de texte » sinon.
    const refresh = () => {
      const a = normalized(node.attrs);
      paint(dom, a);
      remember(dom, a);
      syncView(a);
      syncVideo(a);
      if (a.link) ensureHandles();
      turnHandles(a);
      dom.setAttribute('aria-label', a.alt || I18n.t(a.shape ? 'shape.' + (ShapePresets.isCustom(a.shape) ? 'cust' : a.shape) : 'frame.label'));
      dom.classList.toggle(EMPTY, isEmptyFrame(node));
    };
    refresh();
    if (showsHandles(decorations)) ensureHandles();
    ui.addEventListener('mousedown', (event) => {
      const target = event.target.closest && event.target.closest('[data-ff-kind]');
      if (target) startGesture(event, target.dataset.ffKind, { ed, getPos, dom, box });
    });
    return {
      dom,
      contentDOM: content,
      update(updated, outerDecorations) {
        if (updated.type !== node.type) return false;
        node = updated;
        refresh();
        if (showsHandles(outerDecorations)) ensureHandles();
        return true;
      },
      selectNode() { dom.classList.add(SELECTED); ensureHandles(); },
      deselectNode() { dom.classList.remove(SELECTED); },
      destroy() { behindFrames.delete(dom); if (viewHost) SlideView.untrack(viewHost); if (videoHost) VideoFrame.stop(dom); },
      // Les bords et les poignées sont à eux : ni sélection, ni glisser de l'éditeur sur leur clic. Rien de ce qui n'est pas le texte du cadre n'est une modification du document. Le calque d'une vue aussi.
      stopEvent: event => ui.contains(event.target) || (!!viewHost && viewHost.contains(event.target)) || (!!videoHost && videoHost.contains(event.target)),
      ignoreMutation: mutation => mutation.type !== 'selection' && !content.contains(mutation.target),
    };
  }

  // L'interface d'une ligne : la bande qu'on saisit pour la déplacer (elle suit le trait : son découpage est `--ff-grab`) et ses deux bouts, `start` et `end`, qu'on glisse.
  function buildLineUi() {
    const ui = el('div', UI);
    ui.contentEditable = 'false';
    ui.setAttribute('aria-hidden', 'true');
    const grab = el('div', 'pp-ff-line-grab');
    grab.dataset.ffKind = 'move';
    grab.title = I18n.t('frame.moveTip');
    ui.appendChild(grab);
    [['start', 'frame.lineStartTip'], ['end', 'frame.lineEndTip']].forEach(([side, key]) => {
      const handle = el('div', 'pp-ff-line-handle pp-ff-line-handle-' + side);
      handle.dataset.ffKind = side;
      handle.title = I18n.t(key);
      ui.appendChild(handle);
    });
    return ui;
  }
  // Le nom d'une ligne dit ses pointes : « Ligne », « Ligne avec flèche », « Ligne avec deux flèches ».
  const lineNameKey = a => (a.head && a.tail ? 'shape.lineArrowDouble' : a.head || a.tail ? 'shape.lineArrow' : 'shape.line');
  function lineView({ node: initial, editor: ed, getPos }) {
    let node = initial;
    const dom = el('div', CLASS);
    const box = el('div', BOX);
    const ui = buildLineUi();
    box.append(ui, el('div', CONTENT));
    dom.appendChild(box);
    dom.setAttribute('role', 'group');
    const refresh = () => {
      const a = normalized(node.attrs);
      paint(dom, a);
      remember(dom, a);
      dom.setAttribute('aria-label', a.alt || I18n.t(lineNameKey(a)));
    };
    refresh();
    ui.addEventListener('mousedown', (event) => {
      const target = event.target.closest && event.target.closest('[data-ff-kind]');
      if (target) startGesture(event, target.dataset.ffKind, { ed, getPos, dom, box });
    });
    return {
      dom,
      update(updated) {
        if (updated.type !== node.type) return false;
        node = updated;
        refresh();
        return true;
      },
      selectNode() { dom.classList.add(SELECTED); },
      deselectNode() { dom.classList.remove(SELECTED); },
      destroy() { behindFrames.delete(dom); },
      // Rien d'une ligne n'est du texte : ni les clics de son interface, ni ce que le geste écrit dans son DOM ne regardent l'éditeur.
      stopEvent: event => ui.contains(event.target),
      ignoreMutation: () => true,
    };
  }

  // Le nœud et son extension
  // Les attributs d'un nœud : les mesures et l'aspect d'un cadre, avec leurs valeurs par défaut (`overrides`, celles de la ligne) ; une valeur du HTML enregistré est bornée (normalized) et la sorte que
  // le nœud impose (`overrides.shape`) remplace celle que le HTML ne dirait pas.
  function attributeSpecs(overrides) {
    const out = {};
    Object.keys(DEFAULTS).concat(Object.keys(LOOK)).forEach((key) => {
      const fallback = key in overrides ? overrides[key] : (key in DEFAULTS ? DEFAULTS[key] : LOOK[key]);
      out[key] = { default: fallback, parseHTML: dom => attrsOfEl(dom, overrides.shape)[key], renderHTML: () => ({}) };
    });
    return out;
  }
  // La ligne : une feuille (`atom`), sans texte, qui s'enregistre comme un cadre (la boîte et son contenu, vide) pour que tout ce qui lit le HTML des cadres - la Lecture, le diaporama, l'impression, les
  // miniatures, le PDF, le Word - la trouve sous la même forme. Elle passe avant le cadre au collage (priorité), qui prendrait sinon son HTML pour un cadre de texte.
  function createLineNode(Node) {
    return Node.create({
      name: LINE_NODE,
      group: 'block',
      atom: true,
      selectable: true,
      draggable: false,
      addAttributes() { return attributeSpecs({ shape: ShapeGeometry.LINE, line: LINE_LOOK.line, lw: LINE_LOOK.lw }); },
      parseHTML() { return [{ tag: 'div.' + CLASS + '[' + DOM_ATTRS.shape + '="' + ShapeGeometry.LINE + '"]', priority: 1050 }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs)), ['div', { class: BOX }, ['div', { class: CONTENT }]]]; },
      addNodeView() { return lineView; },
    });
  }
  function createNode(Node) {
    return Node.create({
      name: NODE,
      group: 'block',
      content: BODY,
      defining: true,
      isolating: true,
      addAttributes() { return attributeSpecs({}); },
      // Le fond d'une diapositive que les sorties écrivent comme un cadre (backgroundHtml) n'est pas un cadre de la personne : collé de la Lecture, il n'entre pas.
      parseHTML() { return [{ tag: 'div.' + CLASS + '[' + BACKGROUND_ATTR + ']', priority: 1100, ignore: true }, { tag: 'div.' + CLASS + '[' + DECOR_ATTR + ']', priority: 1100, ignore: true }, { tag: 'div.' + CLASS, priority: 1000, contentElement: '.' + CONTENT }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs)), ['div', { class: BOX }, ['div', { class: CONTENT }, 0]]]; },
      addNodeView() { return nodeView; },
    });
  }
  // Les touches du cadre sélectionné : les flèches le déplacent, Entrée y pose le curseur, Ctrl+D le duplique (choix du 02/11, comme PowerPoint : seulement l'objet SÉLECTIONNÉ, jamais en
  // écrivant dans son texte) ; Échap, dans son texte, le sélectionne.
  function handleKeyDown(view, event) {
    const ed = EditorCore.getEditor();
    if (!libs || !ed || !inPresentation()) return false;
    const { state } = view;
    if (FrameMulti.onKeyDown(view, event)) return true;   // plusieurs cadres choisis (js/frame-multi.js)
    const selected = selectedFrame(state.selection);
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'd' || event.key === 'D')) {
      if (!selected || !ed.isEditable) return false;
      event.preventDefault();   // sans cela le navigateur propose d'ajouter la page aux marque-pages
      duplicate(ed, selected);
      return true;
    }
    if (event.ctrlKey || event.metaKey) return false;
    // Alt + ← → pivotent le cadre sélectionné de 15 degrés, avec Maj d'un degré (comme dans PowerPoint) ; une ligne ne pivote pas.
    if (event.altKey) {
      if (!selected || isLineNode(selected.node) || !ed.isEditable || !/^Arrow(Left|Right)$/.test(event.key)) return false;
      event.preventDefault();
      const step = event.shiftKey ? ROTATE_FINE_DEG : ROTATE_STEP_DEG;
      turnBy(ed, selected, event.key === 'ArrowLeft' ? -step : step);
      return true;
    }
    if (selected && /^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      const step = event.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
      event.preventDefault();
      nudge(ed, selected, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      return true;
    }
    if (selected && event.key === 'Enter') {
      event.preventDefault();
      if (isLineNode(selected.node)) return true;   // une ligne n'a pas de texte où poser le curseur
      view.dispatch(state.tr.setSelection(libs.TextSelection.near(state.doc.resolve(selected.pos + 1), 1)).scrollIntoView());
      return true;
    }
    if (!selected && !event.shiftKey && event.key === 'Escape') {
      const around = frameAround(state.selection.$from);
      if (!around) return false;
      event.preventDefault();
      select(ed, around.pos);
      return true;
    }
    return false;
  }
  // Un cadre « derrière le texte » : les clics qui lui reviennent. Le texte de la diapositive est peint SUR lui et couvre toute la largeur de sa colonne, y compris là où il n'y a pas une lettre : sans
  // remède, aucun clic n'atteindrait le cadre (ni son texte, ni ses bords). Le survol décide, comme pour une image derrière le texte (js/editor-nodes.js:createBehindImageClickThroughExtension) : le
  // pointeur est sur un tel cadre, devant lequel il n'y a ni une lettre ni un objet du texte, et le texte de la diapositive laisse passer les clics (`pp-ff-reaching` sur le parent de l'éditeur,
  // css/free-frame.css) ; sur une lettre, le clic va au texte. Les bords et les poignées du cadre choisi (sélectionné, ou avec le curseur dans son texte) gardent les leurs même sous une lettre :
  // c'est ce qu'on saisit pour le déplacer. Un mouvement précède toujours un clic : l'état est prêt quand le bouton s'enfonce ; bouton enfoncé, il reste celui où le geste a commencé.
  const TEXT_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, pre';
  // Le pointeur est-il sur une ligne de ce bloc de texte ? La ligne compte en entier en hauteur (interligne compris), à un pixel près de chaque côté en largeur.
  function onTextLine(block, x, y) {
    const lineHeight = parseFloat(getComputedStyle(block).lineHeight);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.nodeValue.trim() || text.parentElement.closest('.editor-image-view')) continue;
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        const half = lineHeight > rect.height ? lineHeight / 2 : rect.height / 2;
        const middle = (rect.top + rect.bottom) / 2;
        if (x >= rect.left - 1 && x <= rect.right + 1 && y >= middle - half && y <= middle + half) return true;
      }
    }
    return false;
  }
  // Les clics en (x, y) reviennent-ils au cadre derrière le texte qui s'y trouve ? `elementsFromPoint` rend tout ce qui est sous le pointeur, du dessus au dessous, le texte de la diapositive
  // (avec ses descendants) AVANT le cadre qu'il recouvre : l'état doit donc être retiré avant (reachBehind).
  function reachesBehind(view, x, y) {
    let over = null;
    let owner = null;
    let ownerHit = null;
    for (const hit of document.elementsFromPoint(x, y)) {
      if (hit === view.dom || !view.dom.contains(hit)) return false;
      const frame = hit.closest('.' + CLASS);
      if (frame) { owner = frame; ownerHit = hit; break; }
      if (!over) over = hit;
    }
    if (!owner || !behindFrames.has(owner)) return false;
    if (ownerHit.closest('[data-ff-kind]') && (owner.classList.contains(SELECTED) || owner.classList.contains(ACTIVE))) return true;
    if (!over) return true;
    if (over.closest('.editor-image-view')) return false;
    const block = over.closest(TEXT_BLOCKS);
    return !(block && onTextLine(block, x, y));
  }
  function reachBehind(view, event) {
    if (event.buttons || !behindFrames.size) return false;
    const host = view.dom.parentElement;
    if (!host) return false;
    host.classList.remove(REACHING);
    if (reachesBehind(view, event.clientX, event.clientY)) host.classList.add(REACHING);
    return false;
  }
  // Un clic dans le texte d'un cadre quand un objet est sélectionné (un cadre pris par Échap ou par son bord) : une sélection d'objet n'est pas « visible », et ProseMirror remplace alors le
  // curseur que le navigateur pose par `posAtCoords`, qui donne ici la position qui SUIT le cadre (sa boîte est sans hauteur dans le flux) : le curseur partait dans le texte d'en dessous. On
  // pose donc le curseur du navigateur nous-mêmes, au point cliqué, avant que ProseMirror ne regarde la sélection : elle est alors un texte, que le navigateur place seul. Faux toujours :
  // le clic suit son chemin.
  function enterFrameText(view, event) {
    if (!libs || !view.state.selection.node || event.button !== 0 || event.shiftKey) return false;
    const target = event.target;
    if (!target || !target.closest || !target.closest('.' + CONTENT) || target.closest('[data-ff-kind]')) return false;
    let caret = null;
    if (document.caretPositionFromPoint) {
      const hit = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (hit) caret = { node: hit.offsetNode, offset: hit.offset };
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) caret = { node: range.startContainer, offset: range.startOffset };
    }
    if (!caret || !view.dom.contains(caret.node)) return false;
    let pos = null;
    try { pos = view.posAtDOM(caret.node, caret.offset); } catch (e) { return false; }
    const $pos = view.state.doc.resolve(pos);
    if (!$pos.parent.inlineContent) return false;
    view.dispatch(view.state.tr.setSelection(libs.TextSelection.create(view.state.doc, pos)));
    return false;
  }
  function createExtension(Extension, deps) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = deps;
    return Extension.create({
      name: 'freeFrameBehaviour',
      addProseMirrorPlugins() {
        // Les vues de diapositive (js/slide-view.js) se refont un instant après chaque changement du texte, et quand un graphique finit de se peindre : ce qu'elles montrent est ce que le texte dit.
        const views = new Plugin({
          key: new PluginKey('freeFrameViews'),
          view(editorView) {
            const onPainted = () => SlideView.schedule();
            const painted = typeof ChartEntry !== 'undefined' ? ChartEntry.PAINTED_EVENT : '';
            if (painted) editorView.dom.addEventListener(painted, onPainted);
            return {
              update(view, previous) { if (view.state.doc !== previous.doc) SlideView.schedule(); },
              destroy() { if (painted) editorView.dom.removeEventListener(painted, onPainted); },
            };
          },
        });

        // Le texte de la diapositive laisse passer les clics quand le pointeur est sur un cadre derrière lui (`pp-ff-reaching`) : la règle de css/free-frame.css vise les blocs de premier niveau qui ne sont pas des
        // cadres par la classe FLOW, posée ici (une décoration : ni écrite dans le texte, ni annulable) sur chacun d'eux tant que le texte a un cadre derrière le texte, le seul cas où `reachBehind` allume la marque
        // (elle ne regarde pas `inPresentation`, ni cette décoration : un cadre derrière dans le DOM suffit aux deux). Sans cadre derrière le texte, aucune classe n'est posée et rien ne se calcule de plus que la
        // recherche d'un tel cadre, faite une fois par texte (jamais pour un simple changement de sélection) et qui ne descend pas dans les blocs de texte.
        let flowOf = { doc: null, set: null };
        const hasBehindFrame = (doc) => {
          let found = false;
          doc.descendants((node) => {
            if (found) return false;
            if (isFrame(node) && node.attrs.layer === LAYER_BEHIND) { found = true; return false; }
            return !node.isTextblock;
          });
          return found;
        };
        const flow = new Plugin({
          key: new PluginKey('freeFrameFlow'),
          props: {
            decorations(state) {
              if (flowOf.doc !== state.doc) {
                const marks = [];
                if (hasBehindFrame(state.doc)) state.doc.forEach((child, offset) => { if (!isFrame(child)) marks.push(Decoration.node(offset, offset + child.nodeSize, { class: FLOW })); });
                flowOf = { doc: state.doc, set: marks.length ? DecorationSet.create(state.doc, marks) : null };
              }
              return flowOf.set;
            },
          },
        });

        return [views, flow, FrameMulti.createPlugin(deps), new Plugin({
          key: new PluginKey('freeFrame'),
          props: {
            // Le curseur dans un cadre : son contour se dessine (le cadre sélectionné a le sien, par selectNode).
            decorations(state) {
              if (!inPresentation() || state.selection.node) return null;
              const found = frameAround(state.selection.$from);
              return found ? DecorationSet.create(state.doc, [Decoration.node(found.pos, found.pos + found.node.nodeSize, { class: ACTIVE })]) : null;
            },
            handlePaste,
            handleKeyDown,
            handleDOMEvents: {
              mousemove: reachBehind,
              mousedown: (view, event) => FrameMulti.onMouseDown(view, event) || enterFrameText(view, event),
              mouseleave: (view) => { if (view.dom.parentElement) view.dom.parentElement.classList.remove(REACHING); return false; },
            },
          },
          // Le rangement : seulement après un geste de la personne (pas au chargement d'un modèle, ni en défaisant, ni pour ce qui vient d'une autre personne, ni après le rangement lui-même),
          // seulement dans une présentation.
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some(tr => tr.docChanged)) return null;
            if (transactions.some(tr => tr.getMeta(OWN_META) || tr.getMeta('preventUpdate') || tr.getMeta('history$') || LiveEntry.isRemote(tr))) return null;
            return inPresentation() ? tidyTransaction(newState) : null;
          },
        })];
      },
    });
  }

  const numberText = n => String(n).replace('.', I18n.getLang() === 'fr' ? ',' : '.');
  // La barre flottante du cadre sélectionné (js/free-frame-toolbar.js) : js/free-frame.js lui donne ce qu'elle lit du module, elle rend la barre et ce qui la montre ou la cache.
  function wireToolbar(ed) {
    const wired = FrameToolbar.wire(ed, {
      BAR_GAP_PX, BOX, COLUMN_GAP_PT, LAYER_BEHIND, ROTATE_ROOM_PX, SHAPE_LOOK, clamp, duplicate, inPresentation, isLineAttrs, lookRefused, normalized, numberText,
      paint, patch, remove, reorder, selectedFrame, toNumber,
    });
    toolbar = wired.panel;
    syncBar = wired.sync;
  }
  // Remontre la barre du cadre sélectionné, ou la cache : pour une forme posée par une ligne de menu, dont l'appui (mousedown) referme les barres flottantes JUSTE après avoir posé la forme
  // (js/editor-core.js) ; le menu l'appelle une fois cet appui passé.
  const syncToolbar = () => { if (syncBar) syncBar(); };

  FrameMulti.bind({
    ptPerPx: PT_PER_PX, libs: () => libs, selectedFrame, isFrame, isLineAttrs, normalized, naturalHeight, pageSize, own, headRange, slideStartOf, keepReachable, select, frameAround, inPresentation, BOX, CLASS,
    rotateRoomPx: () => ROTATE_ROOM_PX,
  });

  return {
    NODE, LINE_NODE, CLASS, BOX, CONTENT, BACKGROUND_ATTR, DECOR_ATTR, LAYER_BEHIND, DEFAULTS, LOOK, SHAPE_LOOK, LINE_LOOK, LIMITS, STAY_ON_PAGE_PT, CASCADE_PT, lineWidthOf, backgroundHtml, html, decorHtml, artFits, lookRefused,
    configure, createNode, createLineNode, createExtension, wireToolbar, normalized, withoutHidden, withoutHiddenIn, measuresOf: attrsOfEl, straight, horizontal, flatten, gesture, lineGesture, rotationAt, turnOf, storedHeight, keepReachable, overflowsPage, misplaced, tidyTransaction, headRange, slideStartOf, flowSelection,
    insert, insertTable, insertView, insertVideo, patch, nudge, turnBy, reorder, duplicate, remove, select, currentFrame, frameAround, syncToolbar,
  };
})();
