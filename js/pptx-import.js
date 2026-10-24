// Import PowerPoint : un fichier .pptx devient une NOUVELLE présentation (ligne « Importer un PowerPoint… » du menu « + », js/main.js ; demande du 22/10, carte « Import PowerPoint »), l'inverse de l'export
// (js/pptx-export.js) : les diapositives du fichier deviennent les diapositives du modèle, leurs objets des cadres libres, des formes et des traits (js/free-frame.js), leur fond, leurs notes et leur transition
// le repère de la diapositive (js/slide-props.js). Le moteur ne touche ni à l'éditeur ni à la page : il rend le TEXTE de la présentation (le HTML que l'éditeur écrit), la page qu'elle prend (la taille des
// diapositives du fichier, 16:9 ou 4:3 ou une autre) et le RAPPORT de ce qu'il n'a pas pu reprendre ; c'est js/main.js qui ouvre le modèle, sans nom et pas encore enregistré. Rien ne fait échouer l'import :
// un objet illisible ou d'un genre inconnu est compté dans le rapport et le reste arrive ; seul un fichier qui n'est pas une présentation, ou qui n'a aucune diapositive, est refusé (`code` de l'erreur).
//  - LE FICHIER : un paquet OPC (un zip, JSZip) de parties XML, lu comme le fait PowerPoint : les liens entre parties (`_rels`), l'ordre des diapositives (`sldIdLst`), puis pour chacune sa mise en page
//    (`slideLayout`), son masque (`slideMaster`) et le thème. Les noms XML sont lus sans leur espace de noms (les fichiers « strict » et « transitional » se lisent pareil).
//  - L'HÉRITAGE : un espace réservé (titre, texte, numéro...) qui n'a ni position ni style les prend de la mise en page, puis du masque ; le texte prend sa taille, sa police, sa couleur et ses puces, dans l'ordre
//    des styles par défaut de la présentation, du masque (titre, texte ou autre), de l'espace réservé du masque, de celui de la mise en page, de la liste de l'objet, du paragraphe, puis de la série de caractères.
//    Les couleurs du thème (accent1, tx1...) se résolvent par la correspondance de couleurs du masque (ou celle que la mise en page ou la diapositive impose) et ses retouches (clair, foncé, teinte, ombre).
//  - LES OBJETS : le texte d'un objet, une forme à fond ou à trait, un texte posé : un cadre à sa place au point près (le point de PowerPoint : 12 700 unités), tourné de son angle ; une ligne ou un connecteur :
//    une ligne (ses deux bouts, ses pointes, son épaisseur) ; une image : un cadre qui la porte (rognée, retournée, étirée ou rendue transparente comme dans le fichier) ; un groupe : ses objets, à leur place ; un fond de
//    diapositive uni (héritage compris), en dégradé (sa couleur moyenne) ou en image (une image derrière le texte) ; les notes de l'intervenant ; la transition (fondu, poussé, balayage, couvrir, découvrir, zoom ; les
//    autres effets deviennent un fondu, et le rapport le dit). Les objets du masque et de la mise en page (bandeaux, logo, cartes, textes fixes) sont recopiés DERRIÈRE le texte de chaque diapositive qui les montre.
//  - LE TEXTE : paragraphes, listes à puces et numérotées (niveaux, style de puce, numéro de départ), gras, italique, souligné, barré, exposant, indice, taille, police (la plus proche de celles de l'éditeur),
//    couleur, surlignage, liens (adresse), numéro de diapositive, alignement, interligne et espaces avant et après chaque paragraphe (« Paragraphe… », js/paragraph-format.js ; chantier 2 de « Import PowerPoint sans perte »). Un objet dont le texte est centré ou en bas dans sa boîte devient une forme (le texte d'une forme est centré dans sa boîte).
//  - Les MARGES INTÉRIEURES d'un texte posé (sans fond ni trait) sont compensées : la boîte se décale de l'écart avec celles d'un cadre (7,2 pt à droite et à gauche, 3,6 pt en haut et en bas, celles de
//    PowerPoint) pour que le texte soit au même endroit. Une forme à fond ou à trait garde sa boîte exacte, et ses marges d'origine.
//  - LA HAUTEUR DU TEXTE est MESURÉE, dans un hôte caché qui a les règles de l'éditeur, interligne et espaces du fichier compris (le 100 % de PowerPoint est la ligne simple de l'éditeur, 1,17 fois la taille ; seul un
//    interligne de 119 à 123 % est l'interligne d'origine de l'éditeur, 1,42). Un texte qui ne tient pas dans sa boîte
//    (ou dans ce qui reste de la page sous elle) est réduit, jusqu'à 60 % de sa taille ; un texte posé en bas ou au centre de sa boîte a sa boîte descendue à la hauteur de ce texte. Un tableau a son texte réduit de
//    même à la hauteur qu'il a dans le fichier.
//  - LES TABLEAUX sont ceux de l'éditeur, dans le texte de la diapositive (un cadre ne contient pas de tableau), à leur hauteur par des lignes vides ; la page n'a qu'une paire de marges, celles du tableau que le plus
//    grand nombre de tableaux partagent (un autre est rangé à cette place, le rapport le dit).
// Ce qu'il ne reprend pas (le rapport le compte, REPORT_KEYS) : les animations d'objets autres qu'une entrée ou une sortie d'apparition, de fondu, de volée, de balayage ou de zoom sur un objet entier (js/frame-anim.js, animationOf), les graphiques, les objets incorporés (Excel, Word...), les vidéos et les sons, les commentaires, les équations, les images d'un
// format que le navigateur ne lit pas (EMF, WMF, TIFF), les formes libres (remplacées par leur rectangle), les connecteurs coudés ou courbes (remplacés par un trait droit), les dégradés (leur couleur moyenne) et le
// décor d'un masque que l'éditeur ne sait pas poser (tableaux, graphiques, trop d'objets, images trop lourdes).
//  - LE RAPPORT DIT TOUT (demande du 22/10, « Import PowerPoint sans perte », chantier 1) : ce que le fichier demande et que l'éditeur ne sait pas encore faire est compté AUSSI, une fois par objet et par genre (un texte,
//    un trait, une image, un tableau) - jamais pour un objet qui n'arrive pas (il est compté pour ce qu'il est), jamais pour un réglage que le fichier laisse à sa valeur d'origine ni pour ce que l'éditeur fait lui-même.
//    Le texte : des tabulations (`tabs`), de droite à gauche
//    (`rtl`), en colonnes, vertical, l'ombre ou le contour du texte, son dégradé, un souligné épais, à tirets mêlés ou double ondulé (le double, le pointillé, le tireté et l'ondulé sont repris), une police que l'éditeur n'a pas (une fois par police),
//    une puce d'une autre couleur ou taille, d'un autre caractère ou en image. Les formes et les traits : une liste de tirets illisible, ombre, lueur, reflet, bords adoucis, relief, motif, image
//    en fond, bulle ovale, objet masqué, lien et texte alternatif. Les images : rognage en forme, niveaux de gris et autres réglages, bordure ou ombre. Un tableau : un fond en dégradé ou en motif. Une diapositive : un fond
//    en motif, un minutage. Le fichier : ses sections et son thème (couleurs et polices figées ; dit seulement avec d'autres lignes, il ne justifie pas une fenêtre à lui seul). Chaque chantier suivant retire du rapport
//    les lignes de ce qu'il sait reprendre.
const PptxImport = (function () {
  const EMU_PER_PT = 12700;
  const EMU_PER_MM = 36000;
  const PX_PER_PT = 96 / 72;
  const MAX_FILE_BYTES = 150 * 1024 * 1024;
  const MAX_UNPACKED_BYTES = 900 * 1024 * 1024;   // ce que le paquet pèse une fois défait : plus, c'est une bombe de compression
  const MAX_PART_BYTES = 40 * 1024 * 1024;         // une partie XML plus grosse est ignorée
  const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
  const MAX_IMAGES_BYTES = 80 * 1024 * 1024;       // le poids des images reprises, au total : le modèle s'écrit dans une case de Grist
  const MAX_PIXELS = 16000000;                     // une image redessinée (rognée, retournée, étirée) ne dépasse pas 16 millions de points
  const STRETCH_TOLERANCE = 0.01;                  // un écart de proportions sous 1 % n'est pas corrigé
  const MAX_SLIDES = 500;
  const MAX_OBJECTS = 20000;
  const MAX_DECOR_OBJECTS = 150;                   // le décor d'un masque ou d'une mise en page (recopié sur chaque diapositive) : au delà, il n'est pas repris
  const MAX_DECOR_IMAGE = 400 * 1024;              // une image du décor (en caractères de son adresse de données) : plus lourde, elle est réduite, puis laissée
  const MAX_DECOR_BYTES = 16 * 1024 * 1024;        // le poids de toutes les images du décor, recopiées sur chaque diapositive
  const BACKGROUND_SIDE_PX = 1600;                 // un fond en image est ramené à 1 600 points sur son grand côté
  const FIT_SLACK = 0.06;                          // un texte jusqu'à 6 % plus haut que sa boîte y reste tel quel
  const AVERAGE_SIDE_PX = 8;                      // le côté de la vignette sur laquelle se mesure la couleur moyenne d'une image
  const MIN_FIT_SCALE = 0.6;                       // un texte n'est pas réduit au delà de 60 % de sa taille
  const BLEED_PT = 6;                              // un objet qui dépasse la page de moins de 6 points est ramené à son bord
  const MAX_DEPTH = 12;                            // groupes imbriqués
  const BUILT_IN_PAGE_MM_MAX = 558.8;              // la plus grande page que l'éditeur accepte (PageLayout.CUSTOM_MAX_MM)
  const DEFAULT_SIZE_PT = 18;
  const FRAME_PAD_X_PT = 7.2;                      // les marges d'un cadre de texte (css/free-frame.css), celles par défaut de PowerPoint
  const FRAME_PAD_Y_PT = 3.6;
  const THIN_H_PT = 23;                            // un rectangle sans texte plus bas devient un trait de son épaisseur : un cadre n'est jamais plus bas qu'une ligne de texte avec ses marges (22 pt) ni plus étroit que 24 pt
  const THIN_W_PT = 24;
  const NO_WRAP_SLACK = 0.15;                      // un texte qui ne se replie pas (wrap="none") : sa boîte est élargie de 15 %, la police de l'éditeur est un peu plus large
  const NS_RELS = /relationships/;
  const EDITOR_TEXT = '1b2430';
  const SYSTEM_COLORS = { window: 'ffffff', windowText: '000000', windowFrame: '646464', highlight: '3399ff', highlightText: 'ffffff', btnFace: 'f0f0f0', btnText: '000000', grayText: '808080', menu: 'f0f0f0', menuText: '000000' };
  const PRESET_COLORS = {
    black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', magenta: 'ff00ff', gray: '808080', grey: '808080', ltGray: 'c0c0c0', ltGrey: 'c0c0c0', dkGray: '404040',
    dkGrey: '404040', silver: 'c0c0c0', maroon: '800000', purple: '800080', navy: '000080', teal: '008080', olive: '808000', lime: '00ff00', aqua: '00ffff', fuchsia: 'ff00ff', orange: 'ffa500', brown: 'a52a2a', pink: 'ffc0cb',
    gold: 'ffd700', dkRed: '8b0000', dkGreen: '006400', dkBlue: '00008b', dkCyan: '008b8b', dkMagenta: '8b008b', dkYellow: '808000', ltBlue: 'add8e6', ltGreen: '90ee90', ltYellow: 'ffffe0', ltCyan: 'e0ffff',
  };
  // Les formes prédéfinies de PowerPoint : l'éditeur les dessine toutes telles quelles, réglages compris (js/shape-geometry.js, js/shape-presets.js), sauf les traits et les connecteurs (des lignes), et
  // deux noms hors de la norme qu'on rapporte à leur voisine. Une forme inconnue devient un rectangle (le rapport le compte).
  const PRESET_KINDS = { cross: 'plus', textBox: 'rect' };
  const presetKindOf = prst => (ShapeGeometry.KINDS.indexOf(prst) >= 0 || ShapeGeometry.isPreset(prst) ? prst : PRESET_KINDS[prst] || '');
  const VERTICAL_TEXT = /^(vert|vert270|wordArtVert|eaVert|mongolianVert|wordArtVertRtl)$/;
  // Les six polices de l'éditeur : toute autre est remplacée par la plus proche (familyOf), et le rapport la compte une fois.
  const EDITOR_FONTS = new Set(['roboto', 'arial', 'times new roman', 'georgia', 'courier new', 'calibri']);
  // Les espaces de PowerPoint dits en pour cent (`spcPct`) sont ce pour cent de la hauteur d'une ligne simple, 1,2 fois la taille du texte.
  const POWERPOINT_LINE = 1.2;
  const LINE_PRESETS = new Set(['line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5']);
  const BENT_PRESETS = /^(bent|curved)Connector/;
  // Les puces que l'éditeur dessine de lui-même (css/editor-v2.css) : le rond, le rond creux et le carré plein ; toute autre est un signe choisi (js/bullet-format.js, « Puce… »).
  const BULLET_DISC = /^[•●∙·]$/;
  const BULLET_CIRCLE = /^[o○◦]$/;
  const BULLET_SQUARE = /^[§■▪◼]$/;
  // Les polices de symboles : le caractère d'une puce n'y est pas celui qui s'affiche, mais une position de la police. Les puces courantes de PowerPoint (Wingdings, Symbol) sont traduites en Unicode ; un autre caractère d'une de ces polices est
  // inconnu (la puce garde le rond et le rapport la compte).
  const SYMBOL_FONTS = /^(wingdings(\s*[23])?|webdings|symbol|zapfdingbats|monotype sorts)$/i;
  const WINGDINGS = { l: '●', n: '■', o: '□', q: '❑', v: '❖', u: '◆', '§': '▪', '¨': '◻', 'Ø': '➢', 'è': '➔', 'ü': '✓', 'û': '✗', 'Ï': '☞', '¶': '¶' };
  const SYMBOL = { '·': '•', '¨': '♦', '§': '♣', '¤': '↔', '¾': '⎯' };
  const NUMBERING = { alphaLcPeriod: 'alpha', alphaLcParenR: 'alpha', alphaLcParenBoth: 'alpha', alphaUcPeriod: 'alpha', alphaUcParenR: 'alpha', alphaUcParenBoth: 'alpha', romanLcPeriod: 'roman', romanLcParenR: 'roman', romanLcParenBoth: 'roman', romanUcPeriod: 'roman', romanUcParenR: 'roman', romanUcParenBoth: 'roman' };
  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
  const UNREADABLE_IMAGES = /^(emf|wmf|tif|tiff|wdp|jxr|hdp|pict|ico|cur|emz|wmz)$/;
  // Le sens d'une transition : l'inverse de la table de l'export (js/pptx-export.js, DIRECTIONS), du côté d'où la diapositive arrive.
  const FROM_SIDE = { l: 'r', r: 'l', d: 't', u: 'b' };
  const TRANSITIONS = { fade: 'fade', push: 'push', wipe: 'wipe', cover: 'cover', pull: 'uncover', zoom: 'zoom', split: 'split', blinds: 'blinds', circle: 'circle', diamond: 'diamond', plus: 'plus' };
  // Le choix de la division (`orient` de la ligne du milieu, `dir`) et des stores (`dir`) : la valeur de `from` qui le dit (js/slide-props.js, OPTIONS) ; un attribut absent vaut sa valeur par défaut du format.
  const SPLIT_FROM = { 'vert/out': 'r', 'vert/in': 'l', 'horz/out': 'b', 'horz/in': 't' };
  const SPEED_MS = { fast: 400, med: 700, slow: 1000 };

  // --- Petites aides ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const round2 = value => Math.round(value * 100) / 100;
  const fixed = value => String(round2(value));
  function fail(code, message, extra) { return Object.assign(new Error(message), { code }, extra || {}); }
  const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
  const escText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = text => escText(text).replace(/"/g, '&quot;');
  // Un texte de série de caractères en balisage : les espaces qui se suivent restent (insécables), une tabulation devient quatre espaces, un retour à la ligne devient <br>.
  function spaced(text) {
    return escText(text.replace(ILLEGAL, '')).replace(/\t/g, '    ').replace(/ {2,}/g, run => ' ' + ' '.repeat(run.length - 1)).replace(/\r\n?|\n|\u000b/g, '<br>');
  }
  const bool = value => value === '1' || value === 'true';

  // --- XML : les éléments se lisent par leur nom local (`a:solidFill` et `solidFill` y sont le même) ----------------------------------------------------------------------------------------
  function matches(el, names) { return Array.isArray(names) ? names.indexOf(el.localName) >= 0 : el.localName === names; }
  function kids(el, names) {
    const out = [];
    if (!el) return out;
    for (let n = el.firstElementChild; n; n = n.nextElementSibling) if (!names || matches(n, names)) out.push(n);
    return out;
  }
  function kid(el, names) {
    if (!el) return null;
    for (let n = el.firstElementChild; n; n = n.nextElementSibling) if (matches(n, names)) return n;
    return null;
  }
  const at = (el, path) => path.split('/').reduce((node, name) => (node ? kid(node, name) : null), el);
  const attr = (el, name) => (el && el.hasAttribute(name) ? el.getAttribute(name) : null);
  function numAttr(el, name, fallback) {
    const value = attr(el, name);
    const n = value === null || value === '' ? NaN : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  // Un attribut lu par son nom local, quel que soit son préfixe : la durée d'une transition de PowerPoint 2010 s'écrit `p14:dur`.
  function localAttr(el, name) {
    if (!el) return null;
    for (let i = 0; i < el.attributes.length; i++) if (el.attributes[i].localName === name) return el.attributes[i].value;
    return null;
  }
  // Un attribut de relation (`r:embed`, `r:id`, `r:link`) : l'espace de noms le dit, pas le préfixe.
  function relAttr(el, name) {
    if (!el) return null;
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i];
      if (a.localName === name && NS_RELS.test(a.namespaceURI || '')) return a.value;
    }
    return null;
  }
  function descendants(el, name) { return el ? Array.from(el.getElementsByTagNameNS('*', name)) : []; }

  // --- Le paquet ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function resolvePath(partPath, target) {
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
    const parts = target.charAt(0) === '/' ? [] : partPath.split('/').slice(0, -1);
    target.split('/').forEach((segment) => {
      if (segment === '..') parts.pop();
      else if (segment && segment !== '.') parts.push(segment);
    });
    return parts.join('/');
  }
  async function openPackage(buffer) {
    const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) throw fail('legacy', 'Fichier PowerPoint ancien ou protégé par un mot de passe.');
    if (head[0] !== 0x50 || head[1] !== 0x4B) throw fail('unreadable', 'Ce fichier n’est pas une présentation PowerPoint.');
    try {
      await ExportCommon.ensureJsZipLoaded();
    } catch (e) {
      throw fail('library', 'La bibliothèque de lecture des fichiers n’a pas pu être chargée.', { cause: e });
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’est pas une présentation PowerPoint lisible.', { cause: e });
    }
    const names = new Map();
    let unpacked = 0;
    Object.keys(zip.files).forEach((name) => {
      const entry = zip.files[name];
      if (entry.dir) return;
      names.set(name.toLowerCase(), name);
      unpacked += entry._data && Number.isFinite(entry._data.uncompressedSize) ? entry._data.uncompressedSize : 0;
    });
    if (unpacked > MAX_UNPACKED_BYTES) throw fail('tooBig', 'Cette présentation est trop volumineuse une fois défaite.', { size: unpacked, max: MAX_UNPACKED_BYTES });
    const docs = new Map();
    const relsCache = new Map();
    const fileOf = path => (path ? zip.file(names.get(String(path).toLowerCase()) || path) : null);
    const parser = new DOMParser();
    async function xml(path) {
      if (!path) return null;
      if (docs.has(path)) return docs.get(path);
      let doc = null;
      const file = fileOf(path);
      if (file) {
        try {
          const text = await file.async('string');
          if (text.length <= MAX_PART_BYTES) {
            const parsed = parser.parseFromString(text, 'application/xml');
            doc = parsed.getElementsByTagName('parsererror').length ? null : parsed;
          }
        } catch (e) {
          doc = null;
        }
      }
      docs.set(path, doc);
      return doc;
    }
    // Les relations d'une partie : par identifiant { type (le dernier mot), target (chemin dans le paquet, ou null), href (adresse extérieure), external }.
    async function rels(partPath) {
      if (relsCache.has(partPath)) return relsCache.get(partPath);
      const slash = partPath.lastIndexOf('/');
      const doc = await xml(partPath.slice(0, slash + 1) + '_rels/' + partPath.slice(slash + 1) + '.rels');
      const byId = new Map();
      const list = [];
      if (doc) {
        descendants(doc.documentElement, 'Relationship').forEach((el) => {
          const external = attr(el, 'TargetMode') === 'External';
          const targetText = attr(el, 'Target') || '';
          const entry = {
            id: attr(el, 'Id'), type: String(attr(el, 'Type') || '').split('/').pop(), external,
            target: external ? null : resolvePath(partPath, targetText), href: external ? targetText : null,
          };
          byId.set(entry.id, entry);
          list.push(entry);
        });
      }
      const result = { byId, list, ofType: type => list.filter(entry => entry.type === type) };
      relsCache.set(partPath, result);
      return result;
    }
    const base64 = async (path) => {
      const file = fileOf(path);
      return file ? file.async('base64') : null;
    };
    const sizeOf = (path) => {
      const file = fileOf(path);
      return file && file._data && Number.isFinite(file._data.uncompressedSize) ? file._data.uncompressedSize : 0;
    };
    return { xml, rels, base64, sizeOf, has: path => !!fileOf(path) };
  }

  // --- Les couleurs ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const COLOR_NODES = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'hslClr', 'scrgbClr'];
  const hexRgb = hex => (/^[0-9a-f]{6}$/i.test(hex || '') ? [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)] : null);
  const toHex = rgb => rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const toLinear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const fromLinear = c => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function rgbToHsl(rgb) {
    const r = rgb[0] / 255; const g = rgb[1] / 255; const b = rgb[2] / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToRgb(hsl) {
    const [h, s, l] = hsl;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
  }
  // Une couleur de PowerPoint : la couleur de base (RVB direct, du thème, du système, nommée, TSL), puis ses retouches dans l'ordre où le fichier les écrit. Rend { rgb: [r, v, b], alpha } ou null.
  function colorOf(el, env, phColor) {
    if (!el) return null;
    let rgb = null;
    switch (el.localName) {
      case 'srgbClr': rgb = hexRgb(attr(el, 'val')); break;
      case 'sysClr': rgb = hexRgb(attr(el, 'lastClr') || SYSTEM_COLORS[attr(el, 'val')] || '000000'); break;
      case 'prstClr': rgb = hexRgb(PRESET_COLORS[attr(el, 'val')] || '000000'); break;
      case 'hslClr': rgb = hslToRgb([numAttr(el, 'hue', 0) / 21600000, numAttr(el, 'sat', 0) / 100000, numAttr(el, 'lum', 0) / 100000]); break;
      case 'scrgbClr': rgb = [numAttr(el, 'r', 0), numAttr(el, 'g', 0), numAttr(el, 'b', 0)].map(v => fromLinear(clamp(v / 100000, 0, 1))); break;
      case 'schemeClr': {
        const name = attr(el, 'val');
        if (name === 'phClr') { if (!phColor) return null; rgb = phColor.rgb.slice(); break; }
        const scheme = env.clrMap[name] || name;
        rgb = hexRgb(env.theme.colors[scheme]);
        env.theme.used = true;
        break;
      }
      default: return null;
    }
    if (!rgb) return null;
    let alpha = phColor && el.localName === 'schemeClr' && attr(el, 'val') === 'phClr' ? phColor.alpha : 1;
    kids(el).forEach((mod) => {
      const v = numAttr(mod, 'val', 0) / 100000;
      switch (mod.localName) {
        case 'alpha': alpha = v; break;
        case 'alphaMod': alpha *= v; break;
        case 'alphaOff': alpha += v; break;
        case 'lumMod': case 'lumOff': case 'lum': case 'satMod': case 'satOff': case 'sat': {
          const hsl = rgbToHsl(rgb);
          if (mod.localName === 'lumMod') hsl[2] = clamp(hsl[2] * v, 0, 1);
          else if (mod.localName === 'lumOff') hsl[2] = clamp(hsl[2] + v, 0, 1);
          else if (mod.localName === 'lum') hsl[2] = clamp(v, 0, 1);
          else if (mod.localName === 'satMod') hsl[1] = clamp(hsl[1] * v, 0, 1);
          else if (mod.localName === 'satOff') hsl[1] = clamp(hsl[1] + v, 0, 1);
          else hsl[1] = clamp(v, 0, 1);
          rgb = hslToRgb(hsl);
          break;
        }
        case 'hueMod': case 'hueOff': case 'hue': {
          const hsl = rgbToHsl(rgb);
          const turn = numAttr(mod, 'val', 0) / 21600000;
          hsl[0] = mod.localName === 'hueMod' ? hsl[0] * (numAttr(mod, 'val', 0) / 100000) : (mod.localName === 'hueOff' ? hsl[0] + turn : turn);
          hsl[0] = ((hsl[0] % 1) + 1) % 1;
          rgb = hslToRgb(hsl);
          break;
        }
        case 'tint': rgb = rgb.map(c => fromLinear(toLinear(c) * v + (1 - v))); break;
        case 'shade': rgb = rgb.map(c => fromLinear(toLinear(c) * v)); break;
        case 'comp': { const hsl = rgbToHsl(rgb); hsl[0] = (hsl[0] + 0.5) % 1; rgb = hslToRgb(hsl); break; }
        case 'inv': rgb = rgb.map(c => 255 - c); break;
        case 'gray': { const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; rgb = [y, y, y]; break; }
        case 'red': rgb = [v * 255, rgb[1], rgb[2]]; break;
        case 'green': rgb = [rgb[0], v * 255, rgb[2]]; break;
        case 'blue': rgb = [rgb[0], rgb[1], v * 255]; break;
        case 'redMod': rgb = [rgb[0] * v, rgb[1], rgb[2]]; break;
        case 'greenMod': rgb = [rgb[0], rgb[1] * v, rgb[2]]; break;
        case 'blueMod': rgb = [rgb[0], rgb[1], rgb[2] * v]; break;
        case 'redOff': rgb = [rgb[0] + v * 255, rgb[1], rgb[2]]; break;
        case 'greenOff': rgb = [rgb[0], rgb[1] + v * 255, rgb[2]]; break;
        case 'blueOff': rgb = [rgb[0], rgb[1], rgb[2] + v * 255]; break;
        default: break;
      }
    });
    return { rgb: rgb.map(c => clamp(c, 0, 255)), alpha: clamp(alpha, 0, 1) };
  }
  const colorIn = (parent, env, phColor) => colorOf(kid(parent, COLOR_NODES), env, phColor);
  // Une couleur translucide posée sur un fond (le blanc de la page, ou la couleur de fond connue de la diapositive) : la moyenne d'un dégradé ou d'un motif, que l'éditeur ne sait pas voiler (il voile une couleur unie : inkOf).
  function flatten(color, under) {
    if (!color) return null;
    const base = under || [255, 255, 255];
    const a = color.alpha;
    return toHex(color.rgb.map((c, i) => c * a + base[i] * (1 - a)));
  }

  // La couleur d'un fond ou d'un trait telle que l'éditeur la garde : { hex, tr }. Une couleur unie conserve sa TRANSPARENCE (`a:alpha`, en pour cent de transparence : 0 opaque, 100 invisible) ; la couleur
  // moyenne d'un dégradé ou d'un motif, elle, est mêlée au fond (flatten), l'éditeur n'ayant pas de dégradé ni de motif à voiler.
  function inkOf(color, kind, under) {
    if (!color) return { hex: '', tr: 0 };
    if (kind === 'solid') return { hex: toHex(color.rgb), tr: clamp(Math.round((1 - color.alpha) * 100), 0, 100) };
    return { hex: flatten(color, under), tr: 0 };
  }

  // --- Les fonds et les traits ----------------------------------------------------------------------------------------------------------------------------------------------------------
  const FILL_NODES = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];
  // Un remplissage lu sur l'élément lui-même : { kind: 'none' } | { kind: 'solid', color } | { kind: 'grad', color } | { kind: 'blip', el } | { kind: 'patt', color } | { kind: 'group' }.
  function fillOfElement(el, env, phColor) {
    if (!el) return undefined;
    switch (el.localName) {
      case 'noFill': return { kind: 'none' };
      case 'solidFill': { const color = colorIn(el, env, phColor); return color ? { kind: 'solid', color } : { kind: 'none' }; }
      case 'gradFill': {
        const stops = kids(at(el, 'gsLst'), 'gs').map(gs => ({ pos: numAttr(gs, 'pos', 0), color: colorIn(gs, env, phColor) })).filter(stop => stop.color).sort((a, b) => a.pos - b.pos);
        if (!stops.length) return { kind: 'none' };
        // La couleur moyenne du dégradé : chaque arrêt pèse l'étendue qu'il couvre jusqu'à ses voisins.
        let total = 0;
        const sum = [0, 0, 0];
        let alpha = 0;
        stops.forEach((stop, i) => {
          const before = i === 0 ? stop.pos : (stop.pos - stops[i - 1].pos) / 2;
          const after = i === stops.length - 1 ? 100000 - stop.pos : (stops[i + 1].pos - stop.pos) / 2;
          const weight = Math.max(before + after, 1);
          total += weight;
          stop.color.rgb.forEach((c, k) => { sum[k] += c * weight; });
          alpha += stop.color.alpha * weight;
        });
        return { kind: 'grad', color: { rgb: sum.map(c => c / total), alpha: alpha / total } };
      }
      case 'blipFill': return { kind: 'blip', el };
      case 'pattFill': {
        const color = colorIn(kid(el, 'fgClr'), env, phColor) || colorIn(kid(el, 'bgClr'), env, phColor);
        return color ? { kind: 'patt', color } : { kind: 'none' };
      }
      case 'grpFill': return { kind: 'group' };
      default: return undefined;
    }
  }
  const fillIn = (parent, env, phColor) => fillOfElement(kid(parent, FILL_NODES), env, phColor);
  // Le style d'un objet (`p:style`) : ses références au thème pour le fond (fillRef), le trait (lnRef) et la police (fontRef).
  function styleFill(style, env) {
    const ref = kid(style, 'fillRef');
    if (!ref) return undefined;
    const idx = numAttr(ref, 'idx', 0);
    if (idx <= 0) return { kind: 'none' };
    const list = idx >= 1001 ? env.theme.bgFills : env.theme.fills;
    const themed = list[(idx >= 1001 ? idx - 1001 : idx - 1)];
    const phColor = colorIn(ref, env);
    return themed ? fillOfElement(themed, env, phColor) : (phColor ? { kind: 'solid', color: phColor } : undefined);
  }
  // Le trait d'un objet : { width (pt), color, head, headW, headLen, tail, tailW, tailLen, dash, cap, cmpd } ou null (aucun trait). Les pièces que l'objet ne dit pas viennent du thème par sa référence (lnRef).
  function lineOf(spPr, style, env) {
    const ln = kid(spPr, 'ln');
    const ref = kid(style, 'lnRef');
    const idx = ref ? numAttr(ref, 'idx', 0) : 0;
    const themed = idx > 0 ? env.theme.lines[idx - 1] : null;
    const phColor = ref ? colorIn(ref, env) : null;
    let fill = ln ? fillIn(ln, env, phColor) : undefined;
    if (fill === undefined && themed) fill = fillIn(themed, env, phColor);
    if (fill === undefined && ref && phColor && idx > 0) fill = { kind: 'solid', color: phColor };
    if (!fill || fill.kind === 'none' || fill.kind === 'group' || fill.kind === 'blip' || !fill.color) return null;
    let width = ln ? numAttr(ln, 'w', NaN) : NaN;
    if (!Number.isFinite(width) && themed) width = numAttr(themed, 'w', NaN);
    if (!Number.isFinite(width)) width = 9525;
    const endEl = name => (ln && kid(ln, name)) || (themed && kid(themed, name));
    // Les POINTES (`headEnd` au début, `tailEnd` à la fin), que l'éditeur dessine toutes (js/shape-geometry.js : `endOf`, `endSizeOf`) : leur forme (`type` : triangle, arrow, stealth, diamond, oval) et leur taille (`w`
    // la largeur, `len` la longueur : sm, med, lg ; la moyenne est celle qu'on ne dit pas). Une pointe sans forme n'a pas de taille.
    const end = (name) => {
      const el = endEl(name);
      const type = ShapeGeometry.endOf(attr(el, 'type'));
      return { type, wide: type ? ShapeGeometry.endSizeOf(attr(el, 'w')) : '', long: type ? ShapeGeometry.endSizeOf(attr(el, 'len')) : '' };
    };
    // Le STYLE du trait, que l'éditeur dessine (js/shape-geometry.js : `dash`, `cap`) : le tiret de PowerPoint (`prstDash`) ou sa liste (`custDash` : des `ds` d'un trait et d'un vide, en millièmes de pour cent de
    // l'épaisseur) et le bout (`cap` : `rnd`, `sq`). Une liste qu'il ne sait pas dessiner (plus de huit couples, des mesures absurdes) laisse le trait plein : le rapport le dit (`dashLost`).
    const dashEl = (ln && kid(ln, ['prstDash', 'custDash'])) || (themed && kid(themed, ['prstDash', 'custDash']));
    const unitOf = (ds, name) => {
      const raw = attr(ds, name) || '';
      const n = parseFloat(raw);
      return Number.isFinite(n) ? (raw.endsWith('%') ? n / 100 : n / 100000) : NaN;
    };
    const dashText = !dashEl ? ''
      : dashEl.localName === 'prstDash' ? ((attr(dashEl, 'val') || 'solid') === 'solid' ? '' : attr(dashEl, 'val'))
        : kids(dashEl, 'ds').map(ds => unitOf(ds, 'd') + ':' + unitOf(ds, 'sp')).join(' ');
    const dash = ShapeGeometry.dashOf(dashText);
    const head = end('headEnd');
    const tail = end('tailEnd');
    return {
      width: width / EMU_PER_PT * env.ctx.k, color: fill.color, kind: fill.kind, head: head.type, headW: head.wide, headLen: head.long, tail: tail.type, tailW: tail.wide, tailLen: tail.long,
      dash, dashLost: !!dashText && !dash, cap: ShapeGeometry.capOf((ln && attr(ln, 'cap')) || (themed && attr(themed, 'cap')) || ''),
      cmpd: ShapeGeometry.cmpdOf((ln && attr(ln, 'cmpd')) || (themed && attr(themed, 'cmpd')) || ''),
    };
  }
  // Les effets d'un objet que l'éditeur ne dessine pas : { shadow (ombre portée), glow (lueur, reflet, bords adoucis), relief (3D) }. Ceux de l'objet (`a:effectLst`, `a:sp3d`, `a:scene3d` de sa forme) l'emportent sur ceux
  // du style de thème que son `effectRef` cite.
  function effectsOf(spPr, style, env) {
    const out = { shadow: false, glow: false, relief: false };
    const ref = kid(style, 'effectRef');
    const idx = ref ? numAttr(ref, 'idx', 0) : 0;
    const themed = idx > 0 ? env.theme.effects[idx - 1] : null;
    kids(kid(spPr, 'effectLst') || (themed && kid(themed, 'effectLst'))).forEach((fx) => {
      if (/^(outerShdw|innerShdw|prstShdw)$/.test(fx.localName)) out.shadow = true;
      else if (/^(glow|reflection|softEdge)$/.test(fx.localName)) out.glow = true;
    });
    const solid = kid(spPr, 'sp3d') || (themed && kid(themed, 'sp3d'));
    const turn = kid(kid(kid(spPr, 'scene3d') || (themed && kid(themed, 'scene3d')), 'camera'), 'rot');
    out.relief = (!!solid && (!!kid(solid, ['bevelT', 'bevelB']) || numAttr(solid, 'extrusionH', 0) > 0 || numAttr(solid, 'contourW', 0) > 0))
      || (!!turn && (numAttr(turn, 'lat', 0) !== 0 || numAttr(turn, 'lon', 0) !== 0 || numAttr(turn, 'rev', 0) !== 0));
    return out;
  }
  // Compte, dans le rapport, ce qu'un objet repris n'a pas gardé : une fois par objet et par genre.
  function tally(report, losses) {
    if (losses) losses.forEach((key) => { report[key] += 1; });
  }
  // Un rapport à zéro : celui où les essais de réduction d'un texte comptent leurs liens, leurs polices... sans rien ajouter au vrai.
  function blankReport() {
    const out = {};
    REPORT_KEYS.forEach((key) => { out[key] = 0; });
    return out;
  }
  // Ce que les propriétés d'un objet (`cNvPr`) portent que l'éditeur ne garde pas : un lien (sur une image comme sur une forme), le texte alternatif d'une forme (celui d'une image est repris).
  function noteObject(node, losses, withAlt) {
    const props = kid(kid(node, ['nvSpPr', 'nvCxnSpPr', 'nvPicPr']), 'cNvPr');
    if (kid(props, 'hlinkClick')) losses.add('objectLinks');
    if (withAlt && (attr(props, 'descr') || '').trim()) losses.add('altTexts');
  }
  function noteEffects(effects, losses, withRelief) {
    if (effects.shadow) losses.add('shadows');
    if (effects.glow) losses.add('effects');
    if (withRelief && effects.relief) losses.add('relief');
  }

  // --- Le thème, le masque, la mise en page ---------------------------------------------------------------------------------------------------------------------------------------------
  function readTheme(doc) {
    const root = doc ? doc.documentElement : null;
    const elements = kid(root, 'themeElements');
    const colors = {};
    kids(at(elements, 'clrScheme')).forEach((el) => {
      const node = kid(el, ['srgbClr', 'sysClr']);
      colors[el.localName] = node ? (attr(node, 'lastClr') || (node.localName === 'srgbClr' ? attr(node, 'val') : SYSTEM_COLORS[attr(node, 'val')])) : null;
    });
    const font = name => attr(at(elements, 'fontScheme/' + name + '/latin'), 'typeface') || '';
    const fmt = at(elements, 'fmtScheme');
    // `used` : un objet a pris une couleur ou une police de ce thème (colorOf, faceOf) - le rapport dit alors que le thème est figé.
    return {
      colors, major: font('majorFont'), minor: font('minorFont'), used: false,
      fills: kids(kid(fmt, 'fillStyleLst')), lines: kids(kid(fmt, 'lnStyleLst')), effects: kids(kid(fmt, 'effectStyleLst')), bgFills: kids(kid(fmt, 'bgFillStyleLst')),
    };
  }
  const CLR_MAP_DEFAULT = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };
  function clrMapOf(el, fallback) {
    const out = Object.assign({}, fallback);
    if (el) for (let i = 0; i < el.attributes.length; i++) out[el.attributes[i].name] = el.attributes[i].value;
    return out;
  }
  // Le nom d'une police, celle du thème (`+mj-lt`, `+mn-lt`) comprise : le thème est alors marqué comme employé.
  function faceOf(name, theme) {
    let face = String(name || '').trim();
    if (face.charAt(0) === '+') {
      theme.used = true;
      face = face.indexOf('mj') === 1 ? theme.major : theme.minor;
    }
    return String(face || '').trim();
  }
  // La famille de remplacement la plus proche parmi celles de l'éditeur (Roboto par défaut, Arial, Times New Roman, Georgia, Courier New, Calibri) ; null : celle de l'éditeur.
  function familyOf(name, theme) {
    const face = faceOf(name, theme);
    const key = face.toLowerCase();
    if (!key) return null;
    if (/^(calibri|carlito)/.test(key)) return 'Calibri';
    if (/^(arial|helvetica|arimo)/.test(key)) return 'Arial';
    if (key === 'georgia' || key === 'gelasio') return 'Georgia';
    if (/^(courier|consolas|lucida console|monaco|menlo|cascadia|source code|fira (code|mono)|andale mono|cousine|monospace)/.test(key)) return 'Courier New';
    if (/^(times|tinos|cambria|garamond|palatino|book antiqua|bookman|century (schoolbook|old)|constantia|baskerville|didot|bodoni|sitka|minion|perpetua|goudy|caslon|georgia pro|serif$)/.test(key)) return 'Times New Roman';
    return null;
  }

  // --- La cascade des styles de texte ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les propriétés de paragraphe retenues d'une suite d'éléments `lvlNpPr` / `pPr` (du moins prioritaire au plus prioritaire) : l'alignement et la puce (la première de ces trois qui en dit une : aucune, un caractère, un
  // numéro), avec sa police ; puis l'interligne et les espaces avant et après (`{ pct, val }`) et les retraits (`marL`, `indent`, en EMU), que `spacingOf` met aux réglages de l'éditeur et, pour le rapport seulement
  // (l'éditeur n'en reprend rien), le sens de l'écriture, la couleur et la taille de la puce.
  function foldParagraph(list) {
    const out = { algn: 'l', bullet: null, blip: false, lnSpc: null, spcBef: null, spcAft: null, marL: 0, indent: 0, rtl: false, buClr: null, buSz: null };
    list.forEach((el) => {
      if (!el) return;
      if (el.hasAttribute('algn')) out.algn = el.getAttribute('algn');
      if (el.hasAttribute('marL')) out.marL = numAttr(el, 'marL', out.marL);
      if (el.hasAttribute('indent')) out.indent = numAttr(el, 'indent', out.indent);
      if (el.hasAttribute('rtl')) out.rtl = bool(el.getAttribute('rtl'));
      ['lnSpc', 'spcBef', 'spcAft'].forEach((name) => {
        const spacing = kid(kid(el, name), ['spcPct', 'spcPts']);
        if (spacing) out[name] = { pct: spacing.localName === 'spcPct', val: numAttr(spacing, 'val', 0) };
      });
      const bulletColor = kid(el, ['buClrTx', 'buClr']);
      if (bulletColor) out.buClr = bulletColor.localName === 'buClr' ? kid(bulletColor, COLOR_NODES) : null;
      const bulletSize = kid(el, ['buSzTx', 'buSzPct', 'buSzPts']);
      if (bulletSize) out.buSz = bulletSize.localName === 'buSzTx' ? null : { pct: bulletSize.localName === 'buSzPct', val: numAttr(bulletSize, 'val', 0) };
      const bullet = kid(el, ['buNone', 'buChar', 'buAutoNum', 'buBlip']);
      if (bullet) {
        out.blip = bullet.localName === 'buBlip';
        if (bullet.localName === 'buNone' || bullet.localName === 'buBlip') out.bullet = null;
        else if (bullet.localName === 'buChar') out.bullet = { kind: 'char', char: attr(bullet, 'char') || '•', font: out.bullet && out.bullet.font };
        else out.bullet = { kind: 'auto', type: attr(bullet, 'type') || 'arabicPeriod', start: numAttr(bullet, 'startAt', 1) };
      }
      const font = attr(kid(el, 'buFont'), 'typeface');
      if (font && out.bullet) out.bullet.font = font;
    });
    return out;
  }
  // Les propriétés de série de caractères retenues d'une suite de sources (éléments `defRPr` / `rPr`, ou { fillEl } pour la couleur de police d'un objet), du moins prioritaire au plus prioritaire.
  // `uKind` (la sorte de soulignement : double, pointillé, tireté et ondulé sont repris, le reste compté), `fx` (une ombre, une lueur ou un reflet) et `outline` (un contour) ne servent qu'au rapport : l'éditeur n'en reprend rien.
  function foldRun(sources) {
    const out = { sz: null, b: false, i: false, u: false, uKind: '', spc: 0, strike: false, cap: '', baseline: 0, fill: undefined, fx: false, outline: false, shadowEl: null, strokeEl: null, face: '', highlight: null, link: null };
    sources.forEach((src) => {
      if (!src) return;
      if (!src.localName) { if (src.fillEl) out.fill = src.fillEl; if (src.bold) out.b = true; return; }
      if (src.hasAttribute('sz')) out.sz = numAttr(src, 'sz', out.sz);
      if (src.hasAttribute('b')) out.b = bool(src.getAttribute('b'));
      if (src.hasAttribute('i')) out.i = bool(src.getAttribute('i'));
      if (src.hasAttribute('u')) { out.u = src.getAttribute('u') !== 'none'; out.uKind = src.getAttribute('u'); }
      if (src.hasAttribute('spc')) out.spc = numAttr(src, 'spc', out.spc);
      if (src.hasAttribute('strike')) out.strike = src.getAttribute('strike') !== 'noStrike';
      if (src.hasAttribute('cap')) out.cap = src.getAttribute('cap') === 'none' ? '' : src.getAttribute('cap');
      if (src.hasAttribute('baseline')) out.baseline = numAttr(src, 'baseline', 0);
      const fill = kid(src, FILL_NODES);
      if (fill) out.fill = fill;
      // L'ombre portée (`a:outerShdw` avec une couleur) et le contour plein (`a:ln` avec `a:solidFill`) sont repris ; tout autre effet (lueur, reflet, ombre intérieure ou prédéfinie, bords adoucis) et un contour en dégradé, motif ou image sont comptés.
      const effects = kid(src, 'effectLst');
      if (effects) {
        out.shadowEl = null;
        out.fx = false;
        kids(effects).forEach((fx) => { if (fx.localName === 'outerShdw' && !out.shadowEl && kid(fx, COLOR_NODES)) out.shadowEl = fx; else out.fx = true; });
      }
      const outline = kid(src, 'ln');
      if (outline) {
        const solid = kid(outline, 'solidFill');
        out.strokeEl = solid ? outline : null;
        out.outline = !solid && !!kid(outline, ['gradFill', 'pattFill', 'blipFill']);
      }
      const face = attr(kid(src, 'latin'), 'typeface');
      if (face) out.face = face;
      const highlight = kid(kid(src, 'highlight'), COLOR_NODES);
      if (highlight) out.highlight = highlight;
      const link = kid(src, 'hlinkClick');
      if (link) out.link = link;
    });
    return out;
  }

  // --- Le texte d'un objet ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  // `shape` : { env, roots (les conteneurs de styles du moins au plus prioritaire : styles par défaut, masque, espaces réservés, liste de l'objet), fontRef (la couleur de police du style de l'objet), scale (la
  // réduction de taille que PowerPoint a appliquée au texte trop long) }.
  const BADGE = '<span class="page-number-badge" contenteditable="false" data-format="n">#</span>';
  function colorHexOf(el, env) {
    if (!el) return '';
    const color = COLOR_NODES.indexOf(el.localName) >= 0 ? colorOf(el, env) : (fillOfElement(el, env) || {}).color;
    return color ? flatten(color, env.bgRgb) : '';
  }
  function linkHref(link, env, report) {
    if (!link) return '';
    const rel = env.slideRels.byId.get(relAttr(link, 'id'));
    if (!rel) return '';
    if (rel.external) {
      const href = String(rel.href || '').trim();
      return /^(https?:|mailto:|tel:)/i.test(href) ? href : '';
    }
    if (rel.type === 'slide') report.slideLinks += 1;
    return '';
  }
  // L'ombre et le contour d'une série de caractères en valeurs de « Caractère… » (js/character-format.js) : { textShadow: « 1.5pt 1.5pt 2pt #00000066 », textStroke: « 0.75pt #ff0000 » } ; vide quand la série n'en a pas.
  function textEffectsMarkup(run, shape) {
    const env = shape.env;
    const scale = shape.scale * env.ctx.k / EMU_PER_PT;
    const hexOf = rgb => '#' + rgb.map(c => ('0' + Math.round(c).toString(16)).slice(-2)).join('');
    const out = {};
    if (run.shadowEl) {
      const color = colorIn(run.shadowEl, env, null);
      if (color && color.alpha > 0) {
        const dist = numAttr(run.shadowEl, 'dist', 0) * scale;
        const dir = numAttr(run.shadowEl, 'dir', 0) / 60000 * Math.PI / 180;
        const alpha = color.alpha < 0.995 ? ('0' + Math.round(color.alpha * 255).toString(16)).slice(-2) : '';
        out.textShadow = fixed(Math.cos(dir) * dist) + 'pt ' + fixed(Math.sin(dir) * dist) + 'pt ' + fixed(numAttr(run.shadowEl, 'blurRad', 0) * scale) + 'pt ' + hexOf(color.rgb) + alpha;
      }
    }
    if (run.strokeEl) {
      const hex = colorHexOf(kid(run.strokeEl, 'solidFill'), env);
      const width = numAttr(run.strokeEl, 'w', 9525) * scale;
      if (hex && width > 0) out.textStroke = fixed(width) + 'pt #' + hex.toLowerCase();
    }
    return out;
  }
  // Une série de caractères : le texte avec les marques de l'éditeur (gras, italique, souligné, barré, exposant, indice, lien) et son style (taille, couleur, police, surlignage).
  function runMarkup(text, run, shape) {
    const env = shape.env;
    const shown = run.cap === 'all' ? text.toLocaleUpperCase() : text;
    const href = linkHref(run.link, env, shape.report || env.ctx.report);
    const style = ['font-size: ' + fixed(Math.max(1, (run.sz ? run.sz / 100 : DEFAULT_SIZE_PT) * shape.scale * env.ctx.k)) + 'pt'];
    const color = href ? '' : colorHexOf(run.fill, env);
    if (color && color !== '000000' && color !== EDITOR_TEXT) style.push('color: #' + color);
    const family = familyOf(run.face, env.theme);
    if (family) style.push('font-family: ' + family);
    const highlight = colorHexOf(run.highlight, env);
    if (highlight) style.push('background-color: #' + highlight);
    // L'espacement des caractères suit la taille du texte posé (la page et la réduction), les petites capitales sont celles de l'éditeur (« Caractère… », js/character-format.js).
    const effects = textEffectsMarkup(run, shape);
    const character = CharacterFormat.declarations(Object.assign({ letterSpacing: (run.spc / 100) * shape.scale * env.ctx.k, smallCaps: run.cap === 'small' }, effects));
    if (character) style.push(character);
    let html = '<span style="' + style.join('; ') + '">' + spaced(shown) + '</span>';
    if (run.b) html = '<strong>' + html + '</strong>';
    if (run.i) html = '<em>' + html + '</em>';
    if (run.u && !href) {
      const line = CharacterFormat.underlineOfPowerPoint(run.uKind).style;
      html = line ? '<u style="text-decoration-style: ' + line + '">' + html + '</u>' : '<u>' + html + '</u>';
    }
    if (run.strike) html = '<s>' + html + '</s>';
    if (run.baseline > 0) html = '<sup>' + html + '</sup>';
    else if (run.baseline < 0) html = '<sub>' + html + '</sub>';
    if (href) html = '<a href="' + escAttr(href) + '">' + html + '</a>';
    return html;
  }
  // Le caractère qu'une puce de caractère affiche : tel quel, ou traduit de sa police de symboles ; null quand cette police est de symboles et que le caractère n'y est pas connu.
  function bulletGlyph(bullet) {
    const font = (bullet.font || '').trim();
    if (!SYMBOL_FONTS.test(font)) return bullet.char;
    const table = /^symbol$/i.test(font) ? SYMBOL : (/^wingdings$/i.test(font) ? WINGDINGS : {});
    return table[bullet.char] || null;
  }
  function bulletOf(bullet) {
    if (!bullet) return null;
    if (bullet.kind === 'auto') return { tag: 'ol', style: NUMBERING[bullet.type] || 'decimal', start: bullet.start };
    if (/^[☐☑☒]$/.test(bullet.char)) return { tag: 'task', style: '', checked: bullet.char !== '☐' };
    const glyph = bulletGlyph(bullet);
    if (glyph === null || BULLET_DISC.test(glyph)) return { tag: 'ul', style: 'disc' };
    if (BULLET_CIRCLE.test(glyph)) return { tag: 'ul', style: 'circle' };
    if (BULLET_SQUARE.test(glyph)) return { tag: 'ul', style: 'square' };
    // Tout autre signe : un signe choisi, quand l'éditeur sait l'écrire (un seul caractère visible).
    const char = BulletFormat.normalized(glyph);
    return { tag: 'ul', style: 'disc', char: char || '' };
  }
  // --- Ce que le fichier demande d'un texte et que l'éditeur ne sait pas faire ------------------------------------------------------------------------------------------------------------------------------
  // Le rapport le compte, une fois par texte (`shape.losses`, un ensemble de genres que l'objet qui porte le texte compte quand il est repris) ; la police, elle, est comptée une fois par police.
  // Une puce que l'éditeur dessine telle que le fichier la veut : le rond, le rond creux, le carré plein, un signe choisi (« Puce… »), les cases, les numéros « 1. », « a. » et « i. ». Les autres numéros sont remplacés par le plus proche ;
  // un caractère d'une police de symboles que l'on ne sait pas traduire, ou qui n'est pas un seul caractère visible, garde le rond.
  function bulletKept(bullet) {
    if (bullet.kind === 'auto') return /^(arabicPeriod|alphaLcPeriod|romanLcPeriod)$/.test(bullet.type);
    const style = bulletOf(bullet);
    if (style.tag === 'task') return true;
    return bulletGlyph(bullet) !== null && style.char !== '';
  }
  // La couleur et la taille d'une puce quand elles ne sont pas celles du début de son texte (les réglages `bulletColor` et `bulletSize` du point, js/list-markers.js) : { color: '#ff0000', size: '21pt' }, chacun
  // à null quand la puce suit son texte. Une taille en pour cent est ce pour cent de la taille du début du texte ; l'éditeur la garde en points, à la taille du texte posé (`shape.scale`, `ctx.k`).
  function bulletLookOf(para, first, env, shape) {
    const run = first || foldRun([]);
    const plain = hex => (!hex || hex === EDITOR_TEXT ? '000000' : hex.toLowerCase());
    const out = { color: null, size: null };
    if (para.buClr) {
      const bullet = colorHexOf(para.buClr, env);
      if (bullet && plain(bullet) !== plain(colorHexOf(run.fill, env))) out.color = '#' + bullet.toLowerCase();
    }
    const size = para.buSz;
    if (size) {
      const text = run.sz || DEFAULT_SIZE_PT * 100;
      const bullet = size.pct ? text * size.val / 100000 : size.val;
      if (Math.abs(bullet - text) > (size.pct ? text * 0.03 : 100)) out.size = fixed(Math.max(1, Math.min(400, bullet / 100 * shape.scale * env.ctx.k))) + 'pt';
    }
    return out.color || out.size ? out : null;
  }
  // Une police que l'éditeur n'a pas exactement : comptée la première fois qu'un texte s'en sert.
  function noteFont(face, env, report) {
    const key = faceOf(face, env.theme).toLowerCase();
    if (!key || EDITOR_FONTS.has(key)) return;
    const seen = env.ctx.fontsSeen || (env.ctx.fontsSeen = new Set());
    if (seen.has(key)) return;
    seen.add(key);
    report.fonts += 1;
  }
  function noteRun(value, run, found, env, report) {
    if (value.indexOf('\t') >= 0) found.add('tabs');
    if (!value.replace(/\s+/g, '')) return;
    if (run.fx || run.outline) found.add('textEffects');
    if (run.fill && run.fill.localName === 'gradFill') found.add('textGradient');
    if (run.u && !CharacterFormat.underlineOfPowerPoint(run.uKind).exact) found.add('underlines');
    noteFont(run.face, env, report);
  }
  // L'interligne, les espaces et les retraits d'un paragraphe en réglages de l'éditeur (« Paragraphe… », js/paragraph-format.js) : { lineHeight, spaceBefore, spaceAfter, indentLeft, indentFirst }, null pour ce que le fichier ne dit pas
  // (ParagraphFormat.markup écarte de plus ce qui est déjà celui de l'éditeur : 1,42 de la taille, 0 pt, et ramène la première ligne à la marge du paragraphe). `size` : la plus grande taille du paragraphe, en points du fichier. Un interligne en pour cent est ce pour cent de la ligne simple de l'éditeur (le simple de
  // PowerPoint, 100 %, en est la ligne simple), moins la réduction que l'ajustement automatique a imposée au texte (`shape.lineCut`, en points de pour cent) ; un interligne exact est ce nombre de points par ligne, soit autant de
  // fois la plus grande taille de la ligne. Les espaces suivent la taille du texte posé, comme les caractères (`shape.scale`, la réduction ; `ctx.k`, la page) ; les retraits (`marL`, `indent`) suivent la page seule : la
  // réduction rapetisse les caractères, pas la marge. Un paragraphe de liste n'en a pas (`indents` faux) : l'éditeur y met ses propres niveaux. `first`, `last` : le premier et le dernier paragraphe du texte, dont
  // l'espace avant et l'espace après ne sont pas posés (on pense que PowerPoint ne s'en sert pas : à vérifier sur un vrai fichier).
  function spacingOf(para, size, shape, first, last, indents) {
    const grow = shape.scale * shape.env.ctx.k;
    const spaceOf = spacing => (!spacing ? null : (spacing.pct ? (spacing.val / 100000) * size * POWERPOINT_LINE * grow : (spacing.val / 100) * grow));
    const line = para.lnSpc && !para.lnSpc.pct
      ? (para.lnSpc.val / 100) / size
      : (((para.lnSpc ? para.lnSpc.val : 100000) / 1000) - (shape.lineCut || 0)) / 100 * ParagraphFormat.NATURAL_LINE;
    const page = shape.env.ctx.k / EMU_PER_PT;
    return {
      lineHeight: line, spaceBefore: first ? null : spaceOf(para.spcBef), spaceAfter: last ? null : spaceOf(para.spcAft),
      // Une puce en image est retirée (le rapport le dit) : le texte reste à la marge où elle le laissait, sans retrait suspendu.
      indentLeft: indents ? para.marL * page : null, indentFirst: indents && !para.blip ? para.indent * page : null,
    };
  }
  // Les paragraphes d'un corps de texte : { html (les séries de caractères), align, list ({ tag, style, start, checked, level } ou null), empty, size (pt, d'un paragraphe vide), format (son interligne et ses espaces) }.
  function paragraphsOf(txBody, shape) {
    const env = shape.env;
    const report = shape.report || env.ctx.report;
    const items = [];
    const found = new Set();
    const paragraphs = kids(txBody, 'p');
    let texted = false;
    paragraphs.forEach((p, index) => {
      const pPr = kid(p, 'pPr');
      const level = clamp(numAttr(pPr, 'lvl', 0), 0, 8);
      const levelEls = shape.roots.map(root => kid(root, 'lvl' + (level + 1) + 'pPr'));
      const para = foldParagraph(levelEls.concat([pPr]));
      const defs = levelEls.map(el => kid(el, 'defRPr'));
      if (shape.fontRef || shape.bold) defs.splice(1, 0, { fillEl: shape.fontRef, bold: shape.bold });
      let html = '';
      let text = '';
      let first = null;
      let tallest = 0;
      kids(p).forEach((node) => {
        if (node.localName === 'br') { html += '<br>'; text += '\n'; return; }
        if (node.localName !== 'r' && node.localName !== 'fld') return;
        if (node.localName === 'fld' && /^slidenum/i.test(attr(node, 'type') || '')) { html += BADGE; text += '#'; return; }
        const value = (kid(node, 't') || { textContent: '' }).textContent;
        if (!value) return;
        const run = foldRun(defs.concat([kid(node, 'rPr')]));
        html += runMarkup(value, run, shape);
        text += value;
        tallest = Math.max(tallest, run.sz ? run.sz / 100 : DEFAULT_SIZE_PT);
        if (!first && value.replace(/\s+/g, '')) first = run;
        noteRun(value, run, found, env, report);
      });
      const empty = !text.replace(/\s+/g, '');
      const list = !empty && para.bullet ? Object.assign(bulletOf(para.bullet), { level, look: bulletLookOf(para, first, env, shape) }) : null;
      const endRun = foldRun(defs.concat([kid(p, 'endParaRPr')]));
      const endSize = endRun.sz ? endRun.sz / 100 : DEFAULT_SIZE_PT;
      items.push({
        html, align: para.algn, list, empty, text, size: endSize * shape.scale * env.ctx.k,
        format: spacingOf(para, tallest || endSize, shape, index === 0, index === paragraphs.length - 1, !list),
      });
      if (!empty) {
        texted = true;
        if (para.rtl) found.add('rtl');
        if (para.blip) found.add('bulletImages');
        if (list && !bulletKept(para.bullet)) found.add('bulletChars');
      }
    });
    if (texted && shape.losses) found.forEach((key) => { shape.losses.add(key); });
    return items;
  }
  const ALIGNS = { ctr: 'center', r: 'right', just: 'justify', dist: 'justify', justLow: 'justify' };
  function paragraphTag(item, inList) {
    // L'alignement, l'interligne et les espaces avant et après : les attributs et le style que l'éditeur écrit lui-même.
    const attrs = ParagraphFormat.markup(item.format, ALIGNS[item.align]);
    if (!item.empty) return '<p' + attrs + '>' + item.html + '</p>';
    // Un paragraphe vide garde la hauteur de sa ligne : une espace insécable à la taille du paragraphe (au delà de la taille de l'éditeur).
    if (inList || item.size < 12) return '<p' + attrs + '></p>';
    return '<p' + attrs + '><span style="font-size: ' + fixed(item.size) + 'pt"> </span></p>';
  }
  // Les paragraphes en balisage : les listes sont emboîtées selon leur niveau (jamais de saut de niveau : un élément de niveau 3 sous un de niveau 1 est de niveau 2), une liste change quand sa sorte ou son style change.
  function assemble(items) {
    let out = '';
    const stack = [];
    const closeTo = (depth) => { while (stack.length > depth) out += '</li></' + (stack.pop().tag === 'ol' ? 'ol' : 'ul') + '>'; };
    items.forEach((item) => {
      if (!item.list) { closeTo(0); out += paragraphTag(item, false); return; }
      const level = Math.min(item.list.level, stack.length);
      closeTo(level + 1);
      const key = item.list.tag + ':' + item.list.style + ':' + (item.list.char || '');
      const top = stack[level];
      let open = '';
      if (top && top.key === key) {
        out += '</li>';
      } else {
        if (top) closeTo(level);
        const l = item.list;
        if (l.tag === 'ol') open = '<ol' + (l.style && l.style !== 'decimal' ? ' data-number-style="' + l.style + '"' : '') + (l.start > 1 ? ' start="' + l.start + '"' : '') + '>';
        else if (l.tag === 'task') open = '<ul data-type="taskList">';
        else open = '<ul' + (l.style !== 'disc' ? ' data-bullet-style="' + l.style + '"' : '') + BulletFormat.markup(l.char) + '>';
        out += open;
        stack[level] = { tag: l.tag, key };
        stack.length = level + 1;
      }
      out += item.list.tag === 'task' ? '<li data-type="taskItem" data-checked="' + (item.list.checked ? 'true' : 'false') + '">' : '<li' + (item.list.look ? ListMarkers.markup(item.list.look.color, item.list.look.size) : '') + '>';
      out += paragraphTag(item, true);
    });
    closeTo(0);
    return out;
  }

  // --- La géométrie : la boîte d'un objet, ses groupes -----------------------------------------------------------------------------------------------------------------------------------------------------------
  function xfrmOf(spPr) {
    const x = kid(spPr, 'xfrm');
    const off = kid(x, 'off');
    const ext = kid(x, 'ext');
    if (!x || !off || !ext) return null;
    return {
      x: numAttr(off, 'x', 0), y: numAttr(off, 'y', 0), w: numAttr(ext, 'cx', 0), h: numAttr(ext, 'cy', 0),
      rot: numAttr(x, 'rot', 0) / 60000, flipH: bool(attr(x, 'flipH')), flipV: bool(attr(x, 'flipV')),
      chOff: kid(x, 'chOff') ? { x: numAttr(kid(x, 'chOff'), 'x', 0), y: numAttr(kid(x, 'chOff'), 'y', 0) } : null,
      chExt: kid(x, 'chExt') ? { w: numAttr(kid(x, 'chExt'), 'cx', 0), h: numAttr(kid(x, 'chExt'), 'cy', 0) } : null,
    };
  }
  // La boîte d'un objet d'un groupe, dans le repère de la diapositive : `groups` va du groupe le plus proche au plus lointain, chacun avec le repère de ses enfants (chOff, chExt), sa boîte, son angle et ses retournements.
  function place(box, groups) {
    const b = Object.assign({}, box);
    groups.forEach((g) => {
      const sx = g.chExt && g.chExt.w ? g.w / g.chExt.w : 1;
      const sy = g.chExt && g.chExt.h ? g.h / g.chExt.h : 1;
      const origin = g.chOff || { x: g.x, y: g.y };
      b.x = g.x + (b.x - origin.x) * sx;
      b.y = g.y + (b.y - origin.y) * sy;
      b.w *= sx;
      b.h *= sy;
      if (g.flipH) { b.x = 2 * g.x + g.w - b.x - b.w; b.flipH = !b.flipH; b.rot = -b.rot; }
      if (g.flipV) { b.y = 2 * g.y + g.h - b.y - b.h; b.flipV = !b.flipV; b.rot = -b.rot; }
      if (g.rot) {
        const gx = g.x + g.w / 2;
        const gy = g.y + g.h / 2;
        const dx = b.x + b.w / 2 - gx;
        const dy = b.y + b.h / 2 - gy;
        const a = g.rot * Math.PI / 180;
        b.x = gx + dx * Math.cos(a) - dy * Math.sin(a) - b.w / 2;
        b.y = gy + dx * Math.sin(a) + dy * Math.cos(a) - b.h / 2;
        b.rot += g.rot;
      }
    });
    return b;
  }
  // La boîte en points sur la page de l'éditeur, l'angle ramené dans [0, 360[.
  function inPoints(box, k) {
    const turn = ((Math.round(box.rot * 100) / 100 % 360) + 360) % 360;
    return { x: box.x / EMU_PER_PT * k, y: box.y / EMU_PER_PT * k, w: box.w / EMU_PER_PT * k, h: box.h / EMU_PER_PT * k, rot: turn, flipH: box.flipH, flipV: box.flipV };
  }
  // Les deux bouts d'un trait dans une boîte (début en haut à gauche, fin en bas à droite, puis retournée et tournée comme l'objet), en points.
  function lineEnds(b) {
    const hw = b.w / 2;
    const hh = b.h / 2;
    const a = b.rot * Math.PI / 180;
    const end = (px, py) => {
      const x = b.flipH ? -px : px;
      const y = b.flipV ? -py : py;
      return [b.x + hw + x * Math.cos(a) - y * Math.sin(a), b.y + hh + x * Math.sin(a) + y * Math.cos(a)];
    };
    return [end(-hw, -hh), end(hw, hh)];
  }
  function lineHtml(start, end, look, layer) {
    const flip = (start[0] > end[0] ? 'h' : '') + (start[1] > end[1] ? 'v' : '');
    return FreeFrame.html({
      x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]), w: Math.abs(end[0] - start[0]), h: Math.abs(end[1] - start[1]),
      shape: ShapeGeometry.LINE, flip, line: '#' + look.color, lw: look.width, lineTr: look.tr || 0, dash: look.dash || '', cap: look.cap || '', cmpd: look.cmpd || '',
      head: look.head || '', headW: look.headW || '', headLen: look.headLen || '', tail: look.tail || '', tailW: look.tailW || '', tailLen: look.tailLen || '', layer: layer || '',
    }, '');
  }

  const HOST_WIDTH_PX = 4000;                      // la largeur de l'hôte caché où se mesure un texte (plus large que toute page)
  const ROBOTO_FACES = ['400 14px Roboto', 'italic 400 14px Roboto', '700 14px Roboto', 'italic 700 14px Roboto'];
  // --- Ce que l'éditeur fait du texte ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  // L'éditeur pose le texte avec un interligne de 1,42, PowerPoint avec environ 1,2 : un texte qui tenait dans sa boîte y est plus haut, et la boîte, qui grandit avec lui, peut sortir de la page. La hauteur que
  // l'éditeur donnera à un cadre est donc MESURÉE, dans un hôte caché qui a les règles de l'éditeur (la classe `tiptap`) : le même moteur de texte, les mêmes polices, la même largeur.
  function measureHost(ctx) {
    if (!ctx.host) {
      const host = document.createElement('div');
      host.className = 'tiptap';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position: fixed; left: -100000px; top: 0; width: ' + HOST_WIDTH_PX + 'px; min-height: 0; visibility: hidden; pointer-events: none; zoom: 1';
      document.body.appendChild(host);
      ctx.host = host;
    }
    return ctx.host;
  }
  // La hauteur, en points, d'un cadre qui porte ces paragraphes : celle que son texte lui donne, marges comprises. Un paragraphe vide garde sa ligne dans l'éditeur (ProseMirror y pose un retour à la ligne final) : la mesure
  // lui en donne une aussi.
  function measuredHeight(ctx, frame, items) {
    const host = measureHost(ctx);
    Dom.setMarkup(host, FreeFrame.html(Object.assign({}, frame, { h: 0, rot: 0, layer: '' }), assemble(items)).replace(/<p([^>]*)><\/p>/g, '<p$1><br></p>'));
    const box = host.querySelector('.pp-free-frame-box');
    return box ? box.getBoundingClientRect().height / PX_PER_PT : 0;
  }
  // Le texte d'un objet, réduit s'il ne tient pas dans `room` points de haut (jusqu'à 60 % de sa taille : au delà, il dépasse). Rend { items, natural (sa hauteur mesurée), scale }.
  function fitText(ctx, frame, txBody, shape, room, cap, first) {
    const limit = Math.min(room * (1 + FIT_SLACK), cap);
    const natural = measuredHeight(ctx, frame, first);
    if (natural <= limit) return { items: first, natural, scale: shape.scale };
    const trial = (scale) => {
      const items = paragraphsOf(txBody, Object.assign({}, shape, { scale, report: blankReport(), losses: null }));
      return { items, natural: measuredHeight(ctx, frame, items), scale };
    };
    let low = shape.scale * MIN_FIT_SCALE;
    let best = trial(low);
    if (best.natural > limit) return best;
    let high = shape.scale;
    for (let i = 0; i < 6; i++) {
      const mid = (low + high) / 2;
      const tried = trial(mid);
      if (tried.natural <= limit) { best = tried; low = mid; } else { high = mid; }
    }
    return best;
  }
  // Le réglage d'ajustement du texte d'une boîte (`spAutoFit` : la boîte s'adapte à son texte, `normAutofit` : le texte se réduit, `noAutofit`), de l'objet puis de sa mise en page et de son masque ; '' : aucun dit.
  function fitKindOf(bodies) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const el = kid(bodies[i], ['spAutoFit', 'normAutofit', 'noAutofit']);
      if (el) return el.localName;
    }
    return '';
  }
  // Un objet qui dépasse la page de quelques points (un bandeau qui déborde, un cadre posé au ras) est ramené à son bord : l'éditeur signale d'un point rouge la diapositive dont un cadre sort de la page. `limit` : l'écart
  // jusqu'auquel on le ramène.
  function snapToPage(frame, page, limit) {
    if (frame.rot) return;
    const left = frame.x < 0 && frame.x > -limit ? 0 : frame.x;
    const top = frame.y < 0 && frame.y > -limit ? 0 : frame.y;
    const right = frame.x + frame.w > page.w && frame.x + frame.w < page.w + limit ? page.w : frame.x + frame.w;
    const bottom = frame.y + frame.h > page.h && frame.y + frame.h < page.h + limit ? page.h : frame.y + frame.h;
    if (right - left < 1 || bottom - top < 1) return;
    frame.x = left;
    frame.y = top;
    frame.w = right - left;
    frame.h = bottom - top;
  }

  // --- Les objets d'une diapositive -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function placeholderOf(sp) {
    const ph = kid(at(sp, 'nvSpPr/nvPr'), 'ph');
    return ph ? { type: attr(ph, 'type') || 'obj', idx: attr(ph, 'idx') } : null;
  }
  const masterTypeOf = type => (/^(title|ctrTitle)$/.test(type) ? 'title' : (/^(dt|ftr|sldNum|hdr)$/.test(type) ? type : 'body'));
  function findPlaceholder(list, ph, byType) {
    const info = sp => placeholderOf(sp) || {};
    let hit = null;
    if (!byType && ph.idx !== null) hit = list.find(sp => info(sp).idx === ph.idx);
    if (!hit && !byType) hit = list.find(sp => info(sp).type === ph.type);
    if (!hit && !byType && /^(ctrTitle|title)$/.test(ph.type)) hit = list.find(sp => /^(ctrTitle|title)$/.test(info(sp).type));
    if (!hit && byType) hit = list.find(sp => masterTypeOf(info(sp).type) === masterTypeOf(ph.type));
    return hit || null;
  }
  const listStyleOf = sp => at(sp, 'txBody/lstStyle');
  // Le contexte d'un objet à texte : ses conteneurs de styles, de l'espace réservé qu'il remplit (mise en page, puis masque) à sa propre liste.
  function shapeContext(sp, env, style) {
    const ph = placeholderOf(sp);
    const layoutSp = ph ? findPlaceholder(env.layout.placeholders, ph) : null;
    const masterSp = ph ? findPlaceholder(env.master.placeholders, layoutSp ? placeholderOf(layoutSp) : ph, true) : null;
    const roots = [env.ctx.defaultText || env.master.txStyles.other];
    if (ph) {
      const kind = masterTypeOf(ph.type);
      roots.push(env.master.txStyles[kind === 'title' ? 'title' : (kind === 'body' ? 'body' : 'other')], listStyleOf(masterSp), listStyleOf(layoutSp));
    }
    roots.push(listStyleOf(sp));
    const fontRef = !ph && style ? kid(kid(style, 'fontRef'), COLOR_NODES) : null;
    return { ph, layoutSp, masterSp, roots: roots.filter(Boolean), fontRef };
  }
  const bodyAttr = (nodes, name) => {
    for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i] && nodes[i].hasAttribute(name)) return nodes[i].getAttribute(name);
    return null;
  };
  function countTree(tree, deco) {
    kids(tree).forEach((node) => {
      if (/^(sp|pic|cxnSp)$/.test(node.localName)) {
        if (!(node.localName === 'sp' && placeholderOf(node))) deco.n += 1;
      } else if (node.localName === 'grpSp') {
        countTree(node, deco);
      }
    });
  }

  // Une image de la présentation en adresse de données, ou null : son format n'est pas lisible, elle est introuvable ou trop lourde (le rapport le dit).
  async function imageData(path, env) {
    const ctx = env.ctx;
    if (!path) return null;
    if (ctx.images.has(path)) return ctx.images.get(path);
    const extension = (path.split('.').pop() || '').toLowerCase();
    let data = null;
    if (UNREADABLE_IMAGES.test(extension) || !IMAGE_TYPES[extension]) {
      ctx.report.images += 1;
    } else if (!ctx.pkg.has(path)) {
      ctx.report.images += 1;
    } else {
      const size = ctx.pkg.sizeOf(path);
      if (size > MAX_IMAGE_BYTES || ctx.imageBytes + size > MAX_IMAGES_BYTES) {
        ctx.report.images += 1;
      } else {
        ctx.imageBytes += size;
        data = 'data:' + IMAGE_TYPES[extension] + ';base64,' + await ctx.pkg.base64(path);
      }
    }
    ctx.images.set(path, data);
    return data;
  }
  // L'image rognée, retournée et amenée aux proportions de sa boîte comme le fichier le demande (un canvas), ou telle quelle quand il n'y a rien à faire. L'image de l'éditeur ne se règle que par sa largeur et garde
  // ses proportions, alors qu'une image de PowerPoint est étirée dans sa boîte : l'étirement est fait ici, sur les pixels, dans la dimension qui grandit (rien n'est perdu).
  async function cropped(data, crop, flipH, flipV, ratio) {
    if (/^data:image\/svg/.test(data)) return data;
    const same = !crop || !(crop.l || crop.t || crop.r || crop.b);
    try {
      const img = await ImageIo.load(data);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      if (!sw || !sh) return data;
      const c = same ? { l: 0, t: 0, r: 0, b: 0 } : crop;
      const sx = Math.round(sw * c.l);
      const sy = Math.round(sh * c.t);
      const cw = Math.max(1, Math.round(sw * (1 - c.l - c.r)));
      const ch = Math.max(1, Math.round(sh * (1 - c.t - c.b)));
      let outW = cw;
      let outH = ch;
      if (ratio > 0 && Math.abs(cw / ch / ratio - 1) > STRETCH_TOLERANCE) {
        if (cw / ch > ratio) outH = Math.round(cw / ratio);
        else outW = Math.round(ch * ratio);
      }
      if (same && !flipH && !flipV && outW === cw && outH === ch) return data;
      const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (outW * outH)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(outW * shrink));
      canvas.height = Math.max(1, Math.round(outH * shrink));
      const g = canvas.getContext('2d');
      g.translate(flipH ? canvas.width : 0, flipV ? canvas.height : 0);
      g.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      g.drawImage(img, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
      return /^data:image\/jpe?g/.test(data) ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
    } catch (e) {
      return data;
    }
  }
  // Un cadre qui porte une image : sa boîte est élargie des marges d'un cadre (le cadre pose l'image à l'intérieur de ses marges) pour que l'image soit à sa place. L'image est celle de l'éditeur (classe `editor-image`), réglée par sa largeur.
  function pictureFrame(box, data, alt, opacity, layer) {
    const widthPx = fixed(box.w * PX_PER_PT);
    const img = '<img class="editor-image" src="' + escAttr(data) + '" alt="' + escAttr(alt || 'Image') + '" style="width: ' + widthPx + 'px' + (opacity < 1 ? '; opacity: ' + fixed(opacity) : '') + '">';
    return FreeFrame.html({ x: box.x - FRAME_PAD_X_PT, y: box.y - FRAME_PAD_Y_PT, w: box.w + 2 * FRAME_PAD_X_PT, h: box.h + 2 * FRAME_PAD_Y_PT, rot: box.rot, layer: layer || '' }, '<p>' + img + '</p>');
  }
  // Une image trop lourde pour être recopiée sur chaque diapositive est réduite une fois pour toutes (1 600 points sur son grand côté ; en JPEG si elle l'était), ou null si elle reste trop lourde.
  async function lightened(ctx, data) {
    if (data.length <= MAX_DECOR_IMAGE || /^data:image\/svg/.test(data)) return data;
    if (!ctx.lightened) ctx.lightened = new Map();
    if (ctx.lightened.has(data)) return ctx.lightened.get(data);
    let out = null;
    try {
      const img = await ImageIo.load(data);
      const side = Math.max(img.naturalWidth, img.naturalHeight);
      if (side > 0) {
        const k = Math.min(1, BACKGROUND_SIDE_PX / side);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = canvas.getContext('2d');
        const jpeg = /^data:image\/jpe?g/.test(data);
        if (jpeg) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height); }
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        out = jpeg ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png');
      }
    } catch (e) {
      out = null;
    }
    if (out && out.length > 2 * MAX_DECOR_IMAGE) out = null;
    ctx.lightened.set(data, out);
    return out;
  }
  // Une image qui se recopie (le décor d'un masque ou d'une mise en page, un fond) : réduite si elle est lourde, et laissée, le rapport la comptant sous `key` (une fois, pas une fois par copie), quand les copies pèseraient trop.
  async function copiedImage(env, data, key) {
    const ctx = env.ctx;
    const light = await lightened(ctx, data);
    if (!light || ctx.decorBytes + light.length > MAX_DECOR_BYTES) {
      if (!ctx.skipped.has(data)) { ctx.skipped.add(data); ctx.realReport[key] += 1; }
      return null;
    }
    ctx.decorBytes += light.length;
    return light;
  }
  // Une image amenée aux proportions de la page (un fond qui remplit la diapositive sans garder les siens), une fois pour toutes les diapositives qui la montrent.
  async function stretchedTo(ctx, data, ratio) {
    const key = ratio + '|' + data;
    if (!ctx.stretched) ctx.stretched = new Map();
    if (!ctx.stretched.has(key)) ctx.stretched.set(key, await cropped(data, null, false, false, ratio));
    return ctx.stretched.get(key);
  }
  // La couleur moyenne d'une image (posée sur du blanc), ou null si elle ne se lit pas : les couleurs translucides du décor qui la recouvre se fondent dans cette couleur, comme dans le fond d'un dégradé.
  async function averageColor(ctx, data) {
    if (!ctx.averages) ctx.averages = new Map();
    if (!ctx.averages.has(data)) {
      let rgb = null;
      try {
        const img = await ImageIo.load(data);
        const canvas = document.createElement('canvas');
        canvas.width = AVERAGE_SIDE_PX;
        canvas.height = AVERAGE_SIDE_PX;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < px.length; i += 4) { sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; }
        rgb = sum.map(v => v / (px.length / 4));
      } catch (e) {
        rgb = null;
      }
      ctx.averages.set(data, rgb);
    }
    return ctx.averages.get(data);
  }
  // L'image d'un objet image, rognée, retournée et amenée aux proportions de sa boîte ; celle du décor d'un masque se prépare une fois pour toutes les diapositives.
  async function pictureData(pic, env, box) {
    const ctx = env.ctx;
    if (env.decor && ctx.prepared.has(pic)) return ctx.prepared.get(pic);
    let data = await blipData(kid(pic, 'blipFill'), env, env.slideRels);
    if (data) {
      const src = at(pic, 'blipFill/srcRect');
      const crop = src ? { l: numAttr(src, 'l', 0) / 100000, t: numAttr(src, 't', 0) / 100000, r: numAttr(src, 'r', 0) / 100000, b: numAttr(src, 'b', 0) / 100000 } : null;
      data = await cropped(data, crop, box.flipH, box.flipV, box.w / box.h);
    }
    if (env.decor) ctx.prepared.set(pic, data);
    return data;
  }
  // --- Les images : réglages, forme, bordure, ombre (chantier 5) -------------------------------------------------------------------------------------------------------------------------------
  // Ce que PowerPoint fait d'une image sans que l'éditeur ait de réglage pour le faire (niveaux de gris, luminosité et contraste, noir et blanc, recoloration en deux tons, couleur rendue transparente), sa
  // forme (rognage en ellipse, en étoile...), sa bordure, son ombre et sa lueur, est FAIT dans les points de l'image à l'import : l'image redessinée porte le résultat (en PNG quand elle devient
  // transparente), sa boîte s'agrandit de ce que la bordure, l'ombre et la lueur dépassent. Ce que l'éditeur ne sait pas faire d'une autre manière (reflet, bords adoucis, ombre intérieure, effets
  // artistiques, les autres réglages du fichier) reste compté au rapport.
  const LUMA = [0.299, 0.587, 0.114];
  const COLOR_TOLERANCE = 24;                      // l'écart par canal d'une couleur qu'un fichier rend transparente (« Définir la couleur transparente »)
  // Les réglages de `a:blip` que l'import sait faire : { steps, others } - `steps` dans l'ordre du fichier, `others` vrai quand le fichier en demande qui ne sont pas faits.
  function imageAdjustments(blip, env) {
    const steps = [];
    let others = false;
    kids(blip).forEach((effect) => {
      const name = effect.localName;
      if (/^(alphaModFix|extLst)$/.test(name)) return;
      if (name === 'grayscl') steps.push({ type: 'gray' });
      else if (name === 'biLevel') steps.push({ type: 'bilevel', thresh: numAttr(effect, 'thresh', 50000) / 100000 });
      else if (name === 'lum') {
        const bright = numAttr(effect, 'bright', 0) / 100000;
        const contrast = numAttr(effect, 'contrast', 0) / 100000;
        if (bright || contrast) steps.push({ type: 'lum', bright, contrast });
      } else if (name === 'duotone') {
        const colors = kids(effect).filter(el => COLOR_NODES.indexOf(el.localName) >= 0).map(el => colorOf(el, env));
        if (colors.length === 2 && colors.every(Boolean)) steps.push({ type: 'duotone', from: colors[0].rgb, to: colors[1].rgb });
        else others = true;
      } else if (name === 'clrChange') {
        const from = colorIn(kid(effect, 'clrFrom'), env);
        const to = colorIn(kid(effect, 'clrTo'), env);
        if (from && to) steps.push({ type: 'swap', from: from.rgb, to: to.rgb, alpha: to.alpha });
        else others = true;
      } else {
        others = true;
      }
    });
    return { steps, others };
  }
  // Les réglages appliqués aux points `px` (RVBA, 0 à 255) d'une image.
  function adjustPixels(px, steps) {
    steps.forEach((step) => {
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const luma = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
        if (step.type === 'gray') { px[i] = px[i + 1] = px[i + 2] = luma; }
        else if (step.type === 'bilevel') { px[i] = px[i + 1] = px[i + 2] = luma / 255 >= step.thresh ? 255 : 0; }
        else if (step.type === 'lum') {
          const scale = step.contrast > 0 ? 1 / (1 - Math.min(step.contrast, 0.99)) : 1 + step.contrast;
          [r, g, b].forEach((v, k) => { px[i + k] = clamp(((v / 255 - 0.5) * scale + 0.5 + step.bright) * 255, 0, 255); });
        } else if (step.type === 'duotone') {
          const t = luma / 255;
          for (let k = 0; k < 3; k++) px[i + k] = step.from[k] * (1 - t) + step.to[k] * t;
        } else if (step.type === 'swap') {
          if (Math.abs(r - step.from[0]) <= COLOR_TOLERANCE && Math.abs(g - step.from[1]) <= COLOR_TOLERANCE && Math.abs(b - step.from[2]) <= COLOR_TOLERANCE) {
            px[i] = step.to[0]; px[i + 1] = step.to[1]; px[i + 2] = step.to[2]; px[i + 3] = px[i + 3] * step.alpha;
          }
        }
      }
    });
  }
  // Le contour de la forme d'une image, en points d'un repère de `w` sur `h` : { d (données de chemin SVG, l'union des chemins pleins), w, h, rect } - `rect` : la forme est le rectangle (rien à
  // découper) ; null quand la forme n'est pas connue (le rapport le dit).
  function pictureOutline(spPr, xf, box) {
    const geom = kid(spPr, ['prstGeom', 'custGeom']);
    if (!geom) return { rect: true };
    if (geom.localName === 'prstGeom') {
      const prst = attr(geom, 'prst') || 'rect';
      if (prst === 'rect') return { rect: true };
      if (!ShapePresets.has(prst)) return null;
      const paths = ShapePresets.paths(prst, box.w, box.h, adjustsOf(geom)).filter(path => path.fill);
      return paths.length ? { w: box.w, h: box.h, paths } : null;
    }
    const def = customDefOf(geom, xf);
    if (!def) return null;
    const paths = ShapePresets.paths(def, xf.w, xf.h, '').filter(path => path.fill);
    return paths.length ? { w: xf.w, h: xf.h, paths } : null;
  }
  // L'ombre portée et la lueur d'une image (`a:effectLst`, ou celle du thème) en points : { shadow: { blur, dx, dy, rgb, alpha } | null, glow: { rad, rgb, alpha } | null, other } ; `other` : un effet
  // que l'import ne dessine pas (reflet, bords adoucis, ombre intérieure ou prédéfinie).
  function pictureEffects(spPr, style, env) {
    const out = { shadow: null, glow: null, other: false };
    const ref = kid(style, 'effectRef');
    const idx = ref ? numAttr(ref, 'idx', 0) : 0;
    const themed = idx > 0 ? env.theme.effects[idx - 1] : null;
    const pt = emu => emu / EMU_PER_PT * env.ctx.k;
    kids(kid(spPr, 'effectLst') || (themed && kid(themed, 'effectLst'))).forEach((fx) => {
      const color = colorIn(fx, env, ref ? colorIn(ref, env) : null);
      if (fx.localName === 'outerShdw' && color) {
        const dist = pt(numAttr(fx, 'dist', 0));
        const dir = numAttr(fx, 'dir', 0) / 60000 * Math.PI / 180;
        out.shadow = { blur: pt(numAttr(fx, 'blurRad', 0)), dx: Math.cos(dir) * dist, dy: Math.sin(dir) * dist, rgb: color.rgb, alpha: color.alpha };
      } else if (fx.localName === 'glow' && color) {
        out.glow = { rad: pt(numAttr(fx, 'rad', 0)), rgb: color.rgb, alpha: color.alpha };
      } else {
        out.other = true;
      }
    });
    return out;
  }
  // L'image `data` (déjà rognée, retournée et à la proportion de sa boîte `box`) de l'objet `pic`, avec ses réglages, sa forme, sa bordure, son ombre et sa lueur : { data, box, done } où `box` est la boîte
  // agrandie de ce qui dépasse et `done` les genres du rapport qui sont faits. null quand il n'y a rien à faire (l'image reste telle quelle).
  async function finishedPicture(data, pic, xf, box, env) {
    const spPr = kid(pic, 'spPr');
    const style = kid(pic, 'style');
    const adjust = imageAdjustments(at(pic, 'blipFill/blip'), env);
    const outline = pictureOutline(spPr, xf, box);
    const look = lineOf(spPr, style, env);
    const effects = pictureEffects(spPr, style, env);
    const hasShape = !!outline && !outline.rect;
    const borderPt = look ? clamp(look.width, 0.25, ShapeGeometry.MAX_LINE_PT) : 0;
    if (!adjust.steps.length && !hasShape && !look && !effects.shadow && !effects.glow) return null;
    let img;
    try { img = await ImageIo.load(data); } catch (e) { return null; }
    const natural = [img.naturalWidth || Math.round(box.w * PX_PER_PT * 2), img.naturalHeight || Math.round(box.h * PX_PER_PT * 2)];
    // Les marges : ce que la bordure (la moitié de son épaisseur), l'ombre et la lueur dépassent de la boîte, de chaque côté, en points ; symétriques quand l'image tourne (elle tourne autour de son centre).
    let margin = [0, 0, 0, 0];
    const widen = (left, top, right, bottom) => { margin = [Math.max(margin[0], left), Math.max(margin[1], top), Math.max(margin[2], right), Math.max(margin[3], bottom)]; };
    if (look) widen(borderPt / 2, borderPt / 2, borderPt / 2, borderPt / 2);
    if (effects.shadow) { const f = effects.shadow; widen(f.blur - f.dx, f.blur - f.dy, f.blur + f.dx, f.blur + f.dy); }
    if (effects.glow) widen(effects.glow.rad, effects.glow.rad, effects.glow.rad, effects.glow.rad);
    margin = margin.map(v => Math.max(0, v));
    if (box.rot) margin = [Math.max(margin[0], margin[2]), Math.max(margin[1], margin[3]), Math.max(margin[0], margin[2]), Math.max(margin[1], margin[3])];
    const grown = (wide, high) => Math.sqrt(MAX_PIXELS / (natural[0] * natural[1] * (wide / box.w) * (high / box.h)));
    // Une image trop petite pour ses marges (une bordure d'un point sur une vignette) est agrandie jusqu'à 96 points par pouce, pour que la boîte ne s'agrandisse pas de plus que la bordure ; trop grosse,
    // elle est réduite comme celle que `cropped` redessine.
    const up = margin.some(v => v > 0) ? Math.max(1, PX_PER_PT * box.w / natural[0]) : 1;
    // Une image cuite pèse en PNG (elle a des points transparents) : une photo de 3000 points de large dans une boîte de 300 points devient 8 Mo. Elle est donc réduite à deux fois la définition de son affichage
    // (192 points par pouce, de quoi imprimer à la taille de la boîte), jamais agrandie pour cela.
    const shown = 2 * PX_PER_PT * box.w / natural[0];
    const scale = Math.min(up, shown, grown(box.w + margin[0] + margin[2], box.h + margin[1] + margin[3]));
    const iw = Math.max(1, Math.round(natural[0] * scale));
    const ih = Math.max(1, Math.round(natural[1] * scale));
    const kx = iw / box.w;                         // les points de l'image par point de la boîte
    const ky = ih / box.h;
    // Les marges en points entiers de l'image, puis la boîte qu'elles font : l'image et sa boîte se recouvrent exactement.
    const px = [Math.ceil(margin[0] * kx - 0.1), Math.ceil(margin[1] * ky - 0.1), Math.ceil(margin[2] * kx - 0.1), Math.ceil(margin[3] * ky - 0.1)].map(v => Math.max(0, v));
    const wide = { x: box.x - px[0] / kx, y: box.y - px[1] / ky, w: box.w + (px[0] + px[2]) / kx, h: box.h + (px[1] + px[3]) / ky, rot: box.rot, flipH: box.flipH, flipV: box.flipV };
    const layer = document.createElement('canvas');
    layer.width = iw;
    layer.height = ih;
    const lg = layer.getContext('2d', { willReadFrequently: true });
    lg.drawImage(img, 0, 0, iw, ih);
    let transparent = /^data:image\/png|^data:image\/svg/.test(data) || !!effects.shadow || !!effects.glow;
    if (adjust.steps.length) {
      const pixels = lg.getImageData(0, 0, iw, ih);
      adjustPixels(pixels.data, adjust.steps);
      lg.putImageData(pixels, 0, 0);
      if (adjust.steps.some(step => step.type === 'swap')) transparent = true;
    }
    // La forme dans l'image : le contour (retourné comme l'image), tel qu'il découpe l'image et qu'il est tracé.
    const shapePath = () => {
      if (!outline || outline.rect) return null;
      const path = new Path2D();
      outline.paths.forEach(part => path.addPath(new Path2D(ShapePresets.pathData(part, 0, 0, iw / outline.w, ih / outline.h))));
      return path;
    };
    const flipped = (g, draw) => {
      g.save();
      g.translate(box.flipH ? iw : 0, box.flipV ? ih : 0);
      g.scale(box.flipH ? -1 : 1, box.flipV ? -1 : 1);
      draw();
      g.restore();
    };
    if (hasShape) {
      const cut = shapePath();
      lg.globalCompositeOperation = 'destination-in';
      flipped(lg, () => { lg.fill(cut); });
      lg.globalCompositeOperation = 'source-over';
      transparent = true;
    }
    const ox = px[0];
    const oy = px[1];
    const canvas = document.createElement('canvas');
    canvas.width = iw + px[0] + px[2];
    canvas.height = ih + px[1] + px[3];
    const g = canvas.getContext('2d');
    const rgba = (rgb, alpha) => 'rgba(' + rgb.map(v => Math.round(v)).join(',') + ',' + alpha + ')';
    if (effects.glow) {
      g.shadowColor = rgba(effects.glow.rgb, effects.glow.alpha);
      g.shadowBlur = effects.glow.rad * kx;
      g.drawImage(layer, ox, oy);
      g.shadowColor = 'rgba(0,0,0,0)';
      g.shadowBlur = 0;
    }
    if (effects.shadow) {
      g.shadowColor = rgba(effects.shadow.rgb, effects.shadow.alpha);
      g.shadowBlur = effects.shadow.blur * kx;
      g.shadowOffsetX = effects.shadow.dx * kx;
      g.shadowOffsetY = effects.shadow.dy * ky;
    }
    g.drawImage(layer, ox, oy);
    g.shadowColor = 'rgba(0,0,0,0)';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = 0;
    if (look) {
      const ink = inkOf(look.color, look.kind, env.bgRgb);
      g.save();
      g.translate(ox, oy);
      g.strokeStyle = '#' + (ink.hex || '000000');
      g.globalAlpha = 1 - ink.tr / 100;
      g.lineWidth = borderPt * kx;
      g.lineJoin = 'miter';
      const dashes = look.dash ? ShapeGeometry.dashArray(look.dash, borderPt, look.cap) : null;
      if (dashes) g.setLineDash(dashes.map(v => v * kx));
      flipped(g, () => {
        const path = shapePath();
        if (path) g.stroke(path); else g.strokeRect(0, 0, iw, ih);
      });
      g.restore();
      transparent = true;
    }
    const wasJpeg = /^data:image\/jpe?g/.test(data) && !transparent;
    const out = wasJpeg ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
    return { data: out, box: wide, done: { shape: hasShape, adjust: !adjust.others, frame: !effects.other } };
  }
  async function pictureObject(pic, env, groups, out) {
    const ctx = env.ctx;
    const spPr = kid(pic, 'spPr');
    const xf = xfrmOf(spPr);
    if (!xf) return;
    const nvPr = at(pic, 'nvPicPr/nvPr');
    if (env.decor && kid(nvPr, 'ph')) return;
    const blip = at(pic, 'blipFill/blip');
    if (kid(nvPr, ['videoFile', 'audioFile', 'wavAudioFile'])) ctx.report.media += 1;
    const box = inPoints(place(xf, groups), ctx.k);
    let data = await pictureData(pic, env, box);
    if (!data) { if (!env.slideRels.byId.get(relAttr(blip, 'embed'))) ctx.report.images += 1; return; }
    if (env.decor) { data = await copiedImage(env, data, 'masterObjects'); if (!data) return; }
    const alpha = numAttr(kid(blip, 'alphaModFix'), 'amt', 100000) / 100000;
    // Les réglages, la forme, la bordure et l'ombre de l'image sont faits dans ses points (finishedPicture) ; l'image d'un décor de masque reste telle quelle.
    const finished = env.decor ? null : await finishedPicture(data, pic, xf, box, env);
    out.push(pictureFrame(finished ? finished.box : box, finished ? finished.data : data, attr(at(pic, 'nvPicPr/cNvPr'), 'descr'), alpha, env.decor));
    // Ce que l'éditeur ne garde pas de l'image : ce que finishedPicture n'a pas fait (une forme inconnue, un réglage ou un effet qu'il ne dessine pas), son lien.
    const losses = new Set();
    const geometry = kid(spPr, ['prstGeom', 'custGeom']);
    if (geometry && (geometry.localName === 'custGeom' || (attr(geometry, 'prst') || 'rect') !== 'rect') && !(finished && finished.done.shape)) losses.add('imageShapes');
    if (kids(blip).some(effect => !/^(alphaModFix|extLst)$/.test(effect.localName) && !(effect.localName === 'lum' && !numAttr(effect, 'bright', 0) && !numAttr(effect, 'contrast', 0))) && !(finished && finished.done.adjust)) losses.add('imageAdjust');
    const effects = effectsOf(spPr, kid(pic, 'style'), env);
    if ((lineOf(spPr, kid(pic, 'style'), env) || effects.shadow || effects.glow) && !(finished && finished.done.frame && pictureEffects(spPr, kid(pic, 'style'), env).other === false)) losses.add('imageFrames');
    noteObject(pic, losses, false);
    tally(ctx.report, losses);
  }

  // Un connecteur coudé ou courbe (`bentConnector2` à `5`, `curvedConnector2` à `5`) repris tel que le fichier le dessine : son parcours (les droites et les courbes que la norme lui donne pour sa boîte et
  // ses poignées), avec ses pointes, devient une forme libre (js/shape-presets.js : `freeze`) dont le corps est un chemin sans fond et les pointes des polygones pleins (de la couleur du trait, sans
  // trait) ; le corps est raccourci de ce que la pointe prend. '' quand la boîte est trop mince pour qu'il y ait un parcours (c'est alors un trait droit, que l'appelant dessine) ou que le nom
  // ne tient pas.
  const ROUTE_MIN_PT = 0.5;
  function routedConnector(prst, geom, box, look, ink, env) {
    if (!(box.w >= ROUTE_MIN_PT && box.h >= ROUTE_MIN_PT) || !ShapePresets.has(prst)) return '';
    const route = ShapePresets.paths(prst, box.w, box.h, adjustsOf(geom))[0];
    if (!route || route.commands.length < 2 || route.commands[0][0] !== 'M') return '';
    const lw = clamp(look.width, 0.25, ShapeGeometry.MAX_LINE_PT);
    const commands = route.commands.map(c => c.slice());
    const last = c => [c[c.length - 2], c[c.length - 1]];
    const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const norm = v => Math.hypot(v[0], v[1]);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // La direction dont le parcours sort de son bout (`at` : le début ou la fin), et le point.
    const tangent = (atEnd) => {
      const i = atEnd ? commands.length - 1 : 1;
      const prev = atEnd ? last(commands[i - 1]) : last(commands[0]);
      const c = commands[i];
      const here = atEnd ? last(c) : prev;
      const samples = c[0] === 'C' ? (atEnd ? [[c[3], c[4]], [c[1], c[2]], prev] : [[c[1], c[2]], [c[3], c[4]], last(c)]) : [atEnd ? prev : last(c)];
      const near = samples.find(sample => norm(minus(here, sample)) > 1e-6);
      if (!near) return null;
      const v = minus(here, near);
      return { tip: here, out: [v[0] / norm(v), v[1] / norm(v)] };
    };
    // Raccourcit le parcours de `d` points à son bout : la dernière droite ou courbe (coupée en deux par la construction de de Casteljau, au point qui est à `d` du bout).
    const shorten = (atEnd, d) => {
      if (!(d > 1e-6)) return;
      const i = atEnd ? commands.length - 1 : 1;
      const c = commands[i];
      const from = atEnd ? last(commands[i - 1]) : last(commands[0]);
      const far = last(c);
      if (c[0] === 'L') {
        const v = minus(far, from);
        const length = norm(v);
        if (length <= d + 1e-6) return;
        if (atEnd) { c[1] = far[0] - v[0] / length * d; c[2] = far[1] - v[1] / length * d; } else { commands[0][1] = from[0] + v[0] / length * d; commands[0][2] = from[1] + v[1] / length * d; }
        return;
      }
      if (c[0] !== 'C' || norm(minus(far, from)) <= d + 1e-6) return;
      const p = [from, [c[1], c[2]], [c[3], c[4]], far];
      const point = (t) => {
        const a = mix(p[0], p[1], t); const b = mix(p[1], p[2], t); const e = mix(p[2], p[3], t);
        const f = mix(a, b, t); const g = mix(b, e, t);
        return { a, b, e, f, g, h: mix(f, g, t) };
      };
      // Le t où la courbe est à `d` du bout : la distance au bout décroît le long de la courbe.
      const target = atEnd ? far : from;
      let low = 0;
      let high = 1;
      for (let n = 0; n < 40; n++) {
        const t = (low + high) / 2;
        const gap = norm(minus(point(t).h, target));
        if (atEnd ? gap > d : gap < d) low = t; else high = t;
      }
      const t = (low + high) / 2;
      const cut = point(t);
      if (atEnd) { c.splice(1, 6, cut.a[0], cut.a[1], cut.f[0], cut.f[1], cut.h[0], cut.h[1]); } else {
        commands[0][1] = cut.h[0]; commands[0][2] = cut.h[1];
        c.splice(1, 6, cut.g[0], cut.g[1], cut.e[0], cut.e[1], far[0], far[1]);
      }
    };
    const heads = [];
    [['head', false], ['tail', true]].forEach(([name, atEnd]) => {
      const poly = ShapeGeometry.endPolygon(look[name], look[name + 'W'], look[name + 'Len'], lw);
      const t = poly && tangent(atEnd);
      if (!t) return;
      shorten(atEnd, poly.attach);
      heads.push(poly.points.map(([x, y]) => [t.tip[0] - t.out[0] * x - t.out[1] * y, t.tip[1] - t.out[1] * x + t.out[0] * y]));
    });
    const units = v => String(Math.round(v * 100));
    const space = ['W' + Math.round(box.w * 100), 'H' + Math.round(box.h * 100)];
    const body = ['f0'].concat(space);
    commands.forEach((c) => { body.push(c[0]); for (let i = 1; i < c.length; i++) body.push(units(c[i])); });
    const specs = [body.join(' ')].concat(heads.map((points) => ['s0'].concat(space, points.map((p, i) => [i ? 'L' : 'M', units(p[0]), units(p[1])].join(' ')), 'Z').join(' ')));
    const name = ShapePresets.freeze({ a: '', g: '', p: specs, r: '' }, box.w, box.h, { h: box.flipH, v: box.flipV });
    if (!name) return '';
    const frame = { x: box.x, y: box.y, w: box.w, h: box.h, shape: name, fill: heads.length ? '#' + ink.hex : '', line: '#' + ink.hex, lw, fillTr: heads.length ? ink.tr : 0, lineTr: ink.tr,
      dash: look.dash || '', cap: look.cap || '', cmpd: look.cmpd || '', rot: box.rot, layer: env.decor || '' };
    Object.assign(frame, frameOfShape(name, box, lw, '', frame.cap));
    return FreeFrame.html(frame, '<p></p>');
  }
  function connectorObject(node, env, groups, out) {
    const spPr = kid(node, 'spPr');
    const xf = xfrmOf(spPr);
    if (!xf) return;
    const prst = attr(kid(spPr, 'prstGeom'), 'prst') || 'line';
    const look = lineOf(spPr, kid(node, 'style'), env);
    if (!look) return;
    const box = inPoints(place(xf, groups), env.ctx.k);
    const ink = inkOf(look.color, look.kind, env.bgRgb);
    const routed = BENT_PRESETS.test(prst) ? routedConnector(prst, kid(spPr, 'prstGeom'), box, look, ink, env) : '';
    if (routed) out.push(routed);
    else {
      const [start, end] = lineEnds(box);
      out.push(lineHtml(start, end, { color: ink.hex, tr: ink.tr, width: clamp(look.width, 0.25, ShapeGeometry.MAX_LINE_PT), dash: look.dash, cap: look.cap, cmpd: look.cmpd,
        head: look.head, headW: look.headW, headLen: look.headLen, tail: look.tail, tailW: look.tailW, tailLen: look.tailLen }, env.decor));
    }
    const losses = new Set();
    if (look.dashLost) losses.add('dashes');
    noteEffects(effectsOf(spPr, kid(node, 'style'), env), losses, true);
    noteObject(node, losses, true);
    tally(env.ctx.report, losses);
  }

  // Un nombre de la boîte de texte (une marge intérieure, en points) : celui de l'objet, sinon de l'espace réservé de la mise en page, puis du masque.
  function bodyNum(nodes, name, fallback) {
    const value = bodyAttr(nodes, name);
    const n = value === null ? NaN : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  // Un objet à texte, à forme ou à trait (`p:sp`) : un cadre, une forme ou un trait. Ce qu'il demande et que l'éditeur ne sait pas faire (`losses`, des genres du rapport) est compté s'il est repris.
  async function shapeObject(sp, env, groups, out) {
    const losses = new Set();
    const before = out.length;
    await shapeBody(sp, env, groups, out, losses);
    if (out.length > before) tally(env.ctx.report, losses);
  }
  async function shapeBody(sp, env, groups, out, losses) {
    const ctx = env.ctx;
    const k = ctx.k;
    const nv = kid(sp, 'nvSpPr');
    const style = kid(sp, 'style');
    const context = shapeContext(sp, env, style);
    if (env.decor && context.ph) return;
    // Un objet masqué (volet Sélection) n'est pas repris : le rapport le dit.
    if (bool(attr(kid(nv, 'cNvPr'), 'hidden'))) { ctx.report.hiddenObjects += 1; return; }
    const spPr = kid(sp, 'spPr');
    const holders = [spPr, context.layoutSp && kid(context.layoutSp, 'spPr'), context.masterSp && kid(context.masterSp, 'spPr')].filter(Boolean);
    const xf = holders.map(xfrmOf).find(Boolean);
    if (!xf) return;
    const geom = holders.map(h => kid(h, ['prstGeom', 'custGeom'])).find(Boolean);
    const prst = attr(geom, 'prst') || (geom ? 'cust' : 'rect');
    if (LINE_PRESETS.has(prst)) { connectorObject(sp, env, groups, out); return; }
    const box = inPoints(place(xf, groups), k);

    let fill;
    holders.some((h) => { fill = fillIn(h, env); return fill !== undefined && fill.kind !== 'group'; });
    if (fill === undefined || fill.kind === 'group') fill = styleFill(style, env) || { kind: 'none' };
    const lineHolder = holders.find(h => kid(h, 'ln')) || spPr;
    const look = lineOf(lineHolder, style, env);

    const bodies = [context.masterSp, context.layoutSp, sp].map(node => at(node, 'txBody/bodyPr'));
    const fit = at(sp, 'txBody/bodyPr/normAutofit');
    const txBody = kid(sp, 'txBody');
    const shape = { env, roots: context.roots, fontRef: context.fontRef, scale: fit ? numAttr(fit, 'fontScale', 100000) / 100000 : 1, lineCut: fit ? numAttr(fit, 'lnSpcReduction', 0) / 1000 : 0, losses };
    let items = txBody ? paragraphsOf(txBody, shape) : [];
    const hasText = items.some(item => !item.empty);

    const plainRect = prst === 'cust' && custGeomIsRect(geom);
    // Une forme libre (un tracé, une forme fusionnée ou dessinée à main levée) reste elle-même : sa géométrie devient le nom de sa forme.
    const customName = prst === 'cust' && !plainRect ? customKindOf(geom, Object.assign({}, xf, { flipH: box.flipH, flipV: box.flipV })) : '';
    // Une forme dont le dessin (son fond et son trait, tels que le fichier les veut) ne passerait plus le nettoyage du HTML à la Lecture disparaîtrait : elle reste un rectangle, compté.
    const freeKind = customName && customArtFits(customName, box, look, fill) ? customName : '';
    const known = !!presetKindOf(prst) || !!freeKind;
    const kind = presetKindOf(prst) || freeKind || 'rect';
    // Les réglages de la forme (les poignées jaunes de PowerPoint : `a:avLst`), ceux qui ne sont pas d'origine.
    const adj = known && geom && geom.localName === 'prstGeom' ? ShapePresets.adjText(kind, adjustsOf(geom)) : '';
    const hasFill = fill.kind === 'solid' || fill.kind === 'grad' || fill.kind === 'patt';
    if (fill.kind === 'grad') ctx.report.gradients += 1;
    // Ce que l'éditeur ne dessine pas de cet objet (compté s'il est repris) : un fond en motif, une liste de tirets illisible, des effets, un lien ou un texte alternatif, un texte en colonnes ou vertical.
    if (fill.kind === 'patt') losses.add('patterns');
    if (look && look.dashLost) losses.add('dashes');
    noteEffects(effectsOf(holders.find(h => kid(h, ['effectLst', 'sp3d', 'scene3d'])) || spPr, style, env), losses, true);
    noteObject(sp, losses, true);
    if (hasText && VERTICAL_TEXT.test(bodyAttr(bodies, 'vert') || '')) losses.add('vertical');
    // Une forme que l'éditeur ne dessine pas devient un rectangle, compté ; une forme libre sans fond ni texte (un tracé trop détaillé ou illisible) n'est pas reprise du tout - un rectangle vide ne
    // montrerait rien -, et le rapport le dit pour ce qu'il est : un tracé libre non repris, pas un rectangle.
    if (!known && !plainRect) {
      if (prst === 'cust' && !hasFill && !hasText) { ctx.report.freeDrawings += 1; return; }
      ctx.report.shapes += 1;
    }
    if (fill.kind === 'blip') {
      let data = env.decor && ctx.prepared.has(fill.el) ? ctx.prepared.get(fill.el) : undefined;
      if (data === undefined) {
        data = await blipData(fill.el, env, env.slideRels);
        if (data) data = await cropped(data, null, false, false, box.w / box.h);
        if (env.decor) ctx.prepared.set(fill.el, data);
      }
      if (data && env.decor) data = await copiedImage(env, data, 'masterObjects');
      if (data) {
        out.push(pictureFrame(box, data, '', 1, env.decor));
        // L'image garde la boîte du rectangle ; celle d'une autre forme (une ellipse, une étoile) ou en mosaïque est posée en rectangle, étirée.
        if (kind !== 'rect' || kid(fill.el, 'tile')) losses.add('shapePictures');
        if (!hasText && !look) return;
      }
    }
    if (!hasFill && !look && !hasText) return;
    const fillInk = hasFill ? inkOf(fill.color, fill.kind, env.bgRgb) : { hex: '', tr: 0 };
    const lineInk = look ? inkOf(look.color, look.kind, env.bgRgb) : { hex: '', tr: 0 };
    const fillHex = fillInk.hex;
    const edge = look ? clamp(look.width, 0.25, ShapeGeometry.MAX_LINE_PT) : 0;
    const lineHex = lineInk.hex;

    // Un rectangle plein ou cerné, sans texte, plus mince qu'un cadre ne peut l'être (23 pt de haut, 24 pt de large) : un trait de son épaisseur (celle de son contour quand il n'a aucune épaisseur).
    if (!hasText && (hasFill || look) && (kind === 'rect' || kind === 'roundRect') && (box.h < THIN_H_PT || box.w < THIN_W_PT)) {
      const horizontal = box.w >= box.h;
      const thickness = horizontal ? box.h : box.w;
      const half = (horizontal ? box.w : box.h) / 2;
      const turn = box.rot * Math.PI / 180 + (horizontal ? 0 : Math.PI / 2);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      // Sans fond d'épaisseur, le trait est celui du contour : il en garde le tiret et le bout.
      const outlined = !((hasFill && thickness > 0) || !lineHex);
      out.push(lineHtml([cx - Math.cos(turn) * half, cy - Math.sin(turn) * half], [cx + Math.cos(turn) * half, cy + Math.sin(turn) * half],
        { color: outlined ? lineHex : fillHex, tr: outlined ? lineInk.tr : fillInk.tr, width: clamp(Math.max(thickness, edge), 0.25, ShapeGeometry.MAX_LINE_PT), dash: outlined ? look.dash : '', cap: outlined ? look.cap : '', cmpd: outlined ? look.cmpd : '', head: '', tail: '' }, env.decor));
      return;
    }

    const rectLike = kind === 'rect';
    const plain = rectLike && !fillHex && !lineHex;
    const anchor = bodyAttr(bodies, 'anchor') || 't';
    // Le texte d'une forme est centré dans sa boîte : un objet à fond ou à trait dont le texte est centré ou en bas devient une forme (un rectangle) ; un texte en haut reste un cadre de texte. Un texte posé (sans fond ni trait)
    // reste un cadre de texte : c'est sa boîte qui descend là où le texte est (plus bas), la hauteur du texte étant mesurée. Un objet sans texte est une forme (une forme vide se voit par son dessin, un cadre vide par ses tirets).
    const frame = { x: box.x, y: box.y, w: box.w, h: box.h, shape: rectLike ? (hasText && (anchor === 't' || (plain && !box.rot)) ? '' : 'rect') : kind, fill: fillHex ? '#' + fillHex : '', line: lineHex ? '#' + lineHex : '', lw: edge, fillTr: fillInk.tr, lineTr: lineInk.tr, dash: lineHex && edge > 0 ? look.dash : '', cap: lineHex && edge > 0 ? look.cap : '', cmpd: lineHex && edge > 0 ? look.cmpd : '', rot: box.rot, layer: env.decor || '' };
    Object.assign(frame, frameOfShape(frame.shape, box, lineHex && edge > 0 ? edge : 0, adj, frame.cap));
    // Les colonnes de texte (`numCol`) et l'écart entre elles (`spcCol`, 0 sans autre mot), à l'échelle du texte posé comme les marges.
    if (hasText && bodyNum(bodies, 'numCol', 1) > 1) Object.assign(frame, { cols: bodyNum(bodies, 'numCol', 1), colGap: bodyNum(bodies, 'spcCol', 0) / EMU_PER_PT * k });
    // Un texte posé (sans fond ni trait) : les marges intérieures d'origine sont compensées par la boîte.
    if (plain) {
      const left = bodyNum(bodies, 'lIns', 91440) / EMU_PER_PT * k;
      const right = bodyNum(bodies, 'rIns', 91440) / EMU_PER_PT * k;
      const top = bodyNum(bodies, 'tIns', 45720) / EMU_PER_PT * k;
      const bottom = bodyNum(bodies, 'bIns', 45720) / EMU_PER_PT * k;
      frame.x += left - FRAME_PAD_X_PT;
      frame.w += 2 * FRAME_PAD_X_PT - left - right;
      frame.y += top - FRAME_PAD_Y_PT;
      frame.h += 2 * FRAME_PAD_Y_PT - top - bottom;
      const first = items.find(item => !item.empty);
      if (bodyAttr(bodies, 'wrap') === 'none' && first && !box.rot) {
        // Un peu plus large, du côté où le texte déborde, sans sortir de la page.
        const toLeft = Math.max(0, frame.x);
        const toRight = Math.max(0, env.page.w - frame.x - frame.w);
        const share = first.align === 'ctr' ? 2 * Math.min(toLeft, toRight) : (first.align === 'r' ? toLeft : toRight);
        const grow = Math.min(frame.w * NO_WRAP_SLACK, share);
        frame.w += grow;
        if (first.align === 'ctr') frame.x -= grow / 2;
        else if (first.align === 'r') frame.x -= grow;
      }
    }
    snapToPage(frame, env.page, hasText || kind !== 'rect' ? BLEED_PT : Infinity);
    if (hasText) {
      // Le texte tient dans sa boîte (une boîte qui s'adapte à son texte, dans ce qui reste de la page sous elle), et jamais plus bas que la page ; sinon il est réduit.
      const room = fitKindOf(bodies) === 'spAutoFit' ? Math.max(frame.h, env.page.h - frame.y - 1) : frame.h;
      const fitted = fitText(ctx, frame, txBody, shape, room, frame.rot ? Infinity : Math.max(env.page.h - frame.y, 12), items);
      items = fitted.items;
      if (fitted.scale < shape.scale - 0.001) ctx.report.shrunk += 1;
      if (plain && !box.rot && fitted.natural < frame.h - 1 && anchor !== 't') {
        frame.y += anchor === 'b' ? frame.h - fitted.natural : (frame.h - fitted.natural) / 2;
        frame.h = fitted.natural;
      }
    }
    out.push(FreeFrame.html(frame, hasText ? assemble(items) : '<p></p>'));
  }
  // Les réglages d'une forme prédéfinie (`a:avLst`) : { adj: 25000, ... }, ceux écrits en « val N » (les seuls que PowerPoint écrit).
  function adjustsOf(geom) {
    const out = {};
    kids(kid(geom, 'avLst'), 'gd').forEach((gd) => {
      const value = /^val\s+(-?\d+)$/.exec(String(attr(gd, 'fmla') || '').trim());
      if (value && attr(gd, 'name')) out[attr(gd, 'name')] = Number(value[1]);
    });
    return out;
  }
  // Le cadre de l'éditeur pour une forme dont la géométrie de PowerPoint est `box` (pivotée de box.rot autour de son centre), au trait `lw` : { x, y, w, h, adj, geo }. Le trait de PowerPoint est
  // centré sur le bord de la géométrie, celui de l'éditeur est DANS la boîte : la boîte couvre ce que la forme couvre. Une forme de la norme dessinée par js/shape-presets.js (le cœur, ou l'une des
  // seize à réglages) : tout ce qui dépasse sa géométrie, le trait, les pointes de ses coins et ce qui en sort, une queue de bulle (ShapeGeometry.presetFrame, la géométrie retenue `geo` quand le
  // cadre seul ne la redonne pas) ; une autre : la demi-épaisseur du trait de chaque côté, et, pour la bulle, la queue sous le corps (BUBBLE_BODY). L'éditeur fait tourner le cadre autour de SON
  // centre : il est posé pour que la géométrie revienne à sa place (l'export fait l'inverse).
  function frameOfShape(kind, box, lw, adj, cap) {
    let inside = { x: lw / 2, y: lw / 2, w: box.w + lw, h: box.h + lw, adj: '', geo: '' };
    if (kind && ShapeGeometry.drawnByPresets(kind, adj)) {
      const f = ShapeGeometry.presetFrame(kind, box.w, box.h, { lw, adj, cap });
      inside = { x: -f.x, y: -f.y, w: f.w, h: f.h, adj, geo: f.geo };
    } else if (kind === 'wedgeRoundRectCallout') {
      inside.h /= ShapeGeometry.BUBBLE_BODY;
    }
    const turn = box.rot * Math.PI / 180;
    const dx = inside.x + box.w / 2 - inside.w / 2;
    const dy = inside.y + box.h / 2 - inside.h / 2;
    const cx = box.x + box.w / 2 - (dx * Math.cos(turn) - dy * Math.sin(turn));
    const cy = box.y + box.h / 2 - (dx * Math.sin(turn) + dy * Math.cos(turn));
    return { x: cx - inside.w / 2, y: cy - inside.h / 2, w: inside.w, h: inside.h, adj: inside.adj, geo: inside.geo };
  }
  // Une forme libre (`a:custGeom`) de la boîte `xf` (en EMU) reprise comme forme de l'éditeur : son nom de forme libre (js/shape-presets.js : `freeze`), ou '' quand elle ne tient pas dans un nom
  // (trop de points) ou n'a rien à dessiner. Ses guides sont calculés pour la boîte du fichier, ses chemins (droites, courbes, arcs, remplissages et traits de chacun) deviennent des nombres ; le
  // rectangle du texte (`a:rect`) est gardé. `flipH` et `flipV` : la forme retournée dans sa boîte, que l'éditeur ne sait pas faire d'une autre manière.
  const CUSTOM_OPS = /^(\*\/|\+-|\+\/|\?:|abs|at2|cat2|cos|max|min|mod|pin|sat2|sin|sqrt|tan|val)$/;
  const CUSTOM_TOKEN = /^[A-Za-z0-9_.-]{1,40}$/;
  const CUSTOM_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
  const CUSTOM_FILLS = { none: 'f0', lighten: 'fL', lightenLess: 'fl', darken: 'fD', darkenLess: 'fd' };
  const CUSTOM_COMMANDS = 6000;
  function customDefOf(geom, xf) {
    if (!geom || geom.localName !== 'custGeom' || !xf || !(xf.w > 0 && xf.h > 0)) return null;
    const tokens = (list) => list.every(token => CUSTOM_TOKEN.test(token));
    const adjusts = [];
    const guides = [];
    const guide = (gd, isAdjust) => {
      const name = attr(gd, 'name');
      const parts = String(attr(gd, 'fmla') || '').trim().split(/\s+/);
      if (!name || !CUSTOM_NAME.test(name) || name === '__proto__' || !CUSTOM_OPS.test(parts[0]) || parts.length > 4 || !tokens(parts.slice(1))) return false;
      if (isAdjust && parts[0] === 'val' && parts.length === 2 && /^-?\d+$/.test(parts[1])) adjusts.push(name + ' ' + parts[1]);
      else guides.push([name].concat(parts).join(' '));
      return true;
    };
    if (!kids(kid(geom, 'avLst'), 'gd').every(gd => guide(gd, true)) || !kids(kid(geom, 'gdLst'), 'gd').every(gd => guide(gd, false))) return null;
    const point = (pt) => [attr(pt, 'x'), attr(pt, 'y')];
    const specs = [];
    let commands = 0;
    for (const path of kids(kid(geom, 'pathLst'), 'path')) {
      const fill = attr(path, 'fill') || 'norm';
      const w = numAttr(path, 'w', 0) || xf.w;
      const h = numAttr(path, 'h', 0) || xf.h;
      const spec = [];
      if (CUSTOM_FILLS[fill]) spec.push(CUSTOM_FILLS[fill]);
      if (attr(path, 'stroke') === '0' || attr(path, 'stroke') === 'false') spec.push('s0');
      spec.push('W' + Math.round(w), 'H' + Math.round(h));
      for (const node of Array.from(path.children)) {
        const pts = kids(node, 'pt').map(point);
        if (node.localName === 'moveTo' && pts.length === 1) spec.push('M', ...pts[0]);
        else if (node.localName === 'lnTo' && pts.length === 1) spec.push('L', ...pts[0]);
        else if (node.localName === 'cubicBezTo' && pts.length === 3) spec.push('C', ...pts[0], ...pts[1], ...pts[2]);
        else if (node.localName === 'quadBezTo' && pts.length === 2) spec.push('Q', ...pts[0], ...pts[1]);
        else if (node.localName === 'arcTo') spec.push('A', attr(node, 'wR'), attr(node, 'hR'), attr(node, 'stAng'), attr(node, 'swAng'));
        else if (node.localName === 'close') spec.push('Z');
        else return null;
        commands += 1;
      }
      if (commands > CUSTOM_COMMANDS || !spec.every(token => typeof token === 'string' && CUSTOM_TOKEN.test(token)) || spec.indexOf('M') < 0) return null;
      specs.push(spec.join(' '));
    }
    if (!specs.length) return null;
    const rect = kid(geom, 'rect');
    const edges = rect ? ['l', 't', 'r', 'b'].map(side => attr(rect, side)) : null;
    if (edges && !(tokens(edges.filter(Boolean)) && edges.every(Boolean))) return null;
    const def = { a: adjusts.join(' '), g: guides.join('|'), p: specs, r: edges ? edges.join(' ') : '' };
    return def;
  }
  // Vrai quand le fond et le trait d'une forme libre, dessinés pour la boîte `box` avec le trait `look` (lineOf) et un fond (`fill`), sont des images que HtmlSanitize garde (isSafeArt : au plus 30 000 caractères d'adresse).
  function customArtFits(name, box, look, fill) {
    const solid = fill.kind === 'solid' || fill.kind === 'grad' || fill.kind === 'patt';
    const art = ShapeGeometry.presetArt(name, Math.max(1, box.w), Math.max(1, box.h), {
      fill: solid ? '#000000' : '', line: look ? '#000000' : '', lw: look ? clamp(look.width, 0.25, ShapeGeometry.MAX_LINE_PT) : 0, dash: look ? look.dash : '', cap: look ? look.cap : '', cmpd: look ? look.cmpd : '',
    });
    return [art.fill, art.line].every(url => !url || HtmlSanitize.isSafeArt(url));
  }
  const customKindOf = (geom, xf) => { const def = customDefOf(geom, xf); return def ? ShapePresets.freeze(def, xf.w, xf.h, { h: xf.flipH, v: xf.flipV }) : ''; };
  // Une forme libre qui n'est qu'un rectangle (quatre sommets sur les coins de sa boîte) : le rectangle.
  function custGeomIsRect(geom) {
    if (!geom || geom.localName !== 'custGeom') return false;
    const paths = descendants(geom, 'path');
    if (paths.length !== 1) return false;
    const w = numAttr(paths[0], 'w', 0);
    const h = numAttr(paths[0], 'h', 0);
    const points = descendants(paths[0], 'pt');
    if (points.length < 4 || points.length > 5 || descendants(paths[0], 'arcTo').length || descendants(paths[0], 'cubicBezTo').length || descendants(paths[0], 'quadBezTo').length) return false;
    return points.every((pt) => {
      const x = numAttr(pt, 'x', -1);
      const y = numAttr(pt, 'y', -1);
      return (x === 0 || x === w) && (y === 0 || y === h);
    });
  }
  // L'image d'un remplissage (`a:blipFill`) : son adresse de données, ou null. `rels` : les relations de la partie où le remplissage est écrit (la diapositive, la mise en page, le masque).
  async function blipData(blipFill, env, rels) {
    const rel = rels.byId.get(relAttr(kid(blipFill, 'blip'), 'embed'));
    return rel && rel.target ? imageData(rel.target, env) : null;
  }

  // --- Les tableaux ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Un tableau de PowerPoint devient un tableau de l'éditeur, dans le texte de la diapositive (un cadre ne contient pas de tableau) : ses colonnes et ses hauteurs de ligne, ses cases fusionnées, leur fond, leurs bords,
  // leur alignement vertical et leur texte. Le texte d'une diapositive commence à ses marges : le tableau y est posé par des lignes vides de la hauteur de l'écart (au point près, à celui du texte de l'éditeur près), et
  // la marge de gauche est celle du premier tableau du fichier (`margins` du résultat) ; un autre tableau, ailleurs sur la page, n'y est qu'approché.
  const LINE_HEIGHT = 1.42;
  const TABLE_MARGIN_PT = 4.5;                     // les 6 px que l'éditeur laisse au-dessus et au-dessous d'un tableau (css/editor-v2.css)
  const LINE_PT = 14.9;                            // une ligne de l'éditeur : 14 px à 1,42, la plus basse d'un paragraphe
  const TABLE_FIT_SLACK = 0.03;                    // un tableau jusqu'à 3 % plus haut que dans le fichier y reste tel quel
  const SPACER_MAX_PT = 100;
  const TABLE_SLACK_PT = 3;                        // deux tableaux à moins de 3 points l'un de l'autre (place et largeur) partagent la même place
  const TABLE_FLAGS = ['firstRow', 'lastRow', 'firstCol', 'lastCol', 'bandRow', 'bandCol'];
  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  // Le style « Moyen 2 » de PowerPoint (celui d'un tableau neuf), que les fichiers citent souvent par son identifiant sans en écrire la définition : un fichier d'une autre origine (python-pptx...) n'en a aucune.
  const MEDIUM_2 = {
    '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': 'accent1', '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}': 'accent2', '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': 'accent3',
    '{00A15C55-8517-42AA-B614-E9B94910E393}': 'accent4', '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': 'accent5', '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': 'accent6',
  };
  const NO_GRID = new Set(['{2D5ABB26-0587-4C30-8999-92F81FD0307C}']);
  function mediumStyleXml(accent) {
    const clr = (name, tint) => '<a:solidFill><a:schemeClr val="' + name + '">' + (tint ? '<a:tint val="' + tint + '"/>' : '') + '</a:schemeClr></a:solidFill>';
    const edge = (tag, width) => '<a:' + tag + '><a:ln w="' + width + '" cmpd="sng">' + clr('lt1') + '</a:ln></a:' + tag + '>';
    const text = '<a:tcTxStyle b="on"><a:fontRef idx="minor"/><a:schemeClr val="lt1"/></a:tcTxStyle>';
    const solid = '<a:fill>' + clr(accent) + '</a:fill>';
    return '<a:tblStyle xmlns:a="' + A_NS + '"><a:wholeTbl><a:tcTxStyle><a:fontRef idx="minor"/><a:schemeClr val="dk1"/></a:tcTxStyle><a:tcStyle><a:tcBdr>'
      + ['left', 'right', 'top', 'bottom', 'insideH', 'insideV'].map(tag => edge(tag, 12700)).join('') + '</a:tcBdr><a:fill>' + clr(accent, 20000) + '</a:fill></a:tcStyle></a:wholeTbl>'
      + '<a:band1H><a:tcStyle><a:tcBdr/><a:fill>' + clr(accent, 40000) + '</a:fill></a:tcStyle></a:band1H><a:band2H><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2H>'
      + '<a:band1V><a:tcStyle><a:tcBdr/><a:fill>' + clr(accent, 40000) + '</a:fill></a:tcStyle></a:band1V><a:band2V><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2V>'
      + '<a:lastCol>' + text + '<a:tcStyle><a:tcBdr/>' + solid + '</a:tcStyle></a:lastCol><a:firstCol>' + text + '<a:tcStyle><a:tcBdr/>' + solid + '</a:tcStyle></a:firstCol>'
      + '<a:lastRow>' + text + '<a:tcStyle><a:tcBdr>' + edge('top', 38100) + '</a:tcBdr>' + solid + '</a:tcStyle></a:lastRow>'
      + '<a:firstRow>' + text + '<a:tcStyle><a:tcBdr>' + edge('bottom', 38100) + '</a:tcBdr>' + solid + '</a:tcStyle></a:firstRow></a:tblStyle>';
  }
  // Le style d'un tableau : sa définition dans le fichier, sinon « Moyen 2 » ; null (aucun style : ni fond ni bord) pour « Pas de style » ou un style inconnu.
  async function tableStyleOf(id, ctx) {
    if (!id) return null;
    if (ctx.tableStyles === undefined) {
      ctx.tableStyles = new Map();
      const rel = ctx.presentationRels.ofType('tableStyles')[0];
      const doc = rel && rel.target ? await ctx.pkg.xml(rel.target) : null;
      if (doc) kids(doc.documentElement, 'tblStyle').forEach((el) => { ctx.tableStyles.set(attr(el, 'styleId'), el); });
    }
    if (ctx.tableStyles.has(id)) return ctx.tableStyles.get(id);
    if (NO_GRID.has(id) || !MEDIUM_2[id]) return null;
    if (!ctx.mediumStyles) ctx.mediumStyles = new Map();
    if (!ctx.mediumStyles.has(id)) ctx.mediumStyles.set(id, new DOMParser().parseFromString(mediumStyleXml(MEDIUM_2[id]), 'application/xml').documentElement);
    return ctx.mediumStyles.get(id);
  }
  // Les parties du style qui touchent la case (ligne r, colonne c) d'un tableau de `rows` sur `cols`, de la moins à la plus prioritaire.
  function stylePartsFor(style, flags, r, c, rows, cols) {
    const parts = ['wholeTbl'];
    const firstRow = flags.firstRow ? 1 : 0;
    if (flags.bandRow && r >= firstRow && !(flags.lastRow && r === rows - 1)) parts.push((r - firstRow) % 2 === 0 ? 'band1H' : 'band2H');
    if (flags.bandCol && c >= (flags.firstCol ? 1 : 0) && !(flags.lastCol && c === cols - 1)) parts.push((c - (flags.firstCol ? 1 : 0)) % 2 === 0 ? 'band1V' : 'band2V');
    if (flags.lastCol && c === cols - 1) parts.push('lastCol');
    if (flags.firstCol && c === 0) parts.push('firstCol');
    if (flags.lastRow && r === rows - 1) parts.push('lastRow');
    if (flags.firstRow && r === 0) parts.push('firstRow');
    return parts.map(name => kid(style, name)).filter(Boolean);
  }
  // Le trait d'un bord de case : 'none', '#rrggbb', ou null (rien de dit).
  function borderValue(lnHolder, env) {
    const ln = kid(lnHolder, 'ln') || lnHolder;
    const fill = ln ? fillIn(ln, env) : undefined;
    if (!fill) return null;
    if (fill.kind === 'none') return 'none';
    return fill.color ? '#' + flatten(fill.color, env.bgRgb) : null;
  }
  async function tableObject(node, env, groups, out) {
    const ctx = env.ctx;
    const k = ctx.k;
    const losses = new Set();
    const tbl = at(node, 'graphic/graphicData/tbl');
    const xf = xfrmOf(node);
    if (!tbl || !xf) { ctx.report.tables += 1; return; }
    const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map(el => numAttr(el, 'w', 0));
    const trs = kids(tbl, 'tr');
    if (!grid.length || !trs.length) return;
    const flags = {};
    const pr = kid(tbl, 'tblPr');
    TABLE_FLAGS.forEach((name) => { flags[name] = bool(attr(pr, name)); });
    const style = await tableStyleOf((kid(pr, 'tableStyleId') || { textContent: '' }).textContent.trim(), ctx);
    const box = inPoints(place(xf, groups), k);
    const scaleX = (grid.reduce((a, b) => a + b, 0) ? box.w / (grid.reduce((a, b) => a + b, 0) / EMU_PER_PT * k) : 1) || 1;
    const px = emu => emu / EMU_PER_PT * k * PX_PER_PT * scaleX;
    const heightSum = trs.reduce((a, tr) => a + numAttr(tr, 'h', 0), 0);
    const heights = trs.map(tr => numAttr(tr, 'h', 0) / EMU_PER_PT * k * (heightSum ? box.h / (heightSum / EMU_PER_PT * k) : 1));
    const rows = trs.length;
    const cols = grid.length;
    const rowsData = [];
    for (let r = 0; r < rows; r++) {
      const rowData = { open: '<tr data-row-height="' + Math.max(1, Math.round(heights[r] * PX_PER_PT)) + '">', cells: [] };
      rowsData.push(rowData);
      let c = 0;
      const cells = kids(trs[r], 'tc');
      for (let i = 0; i < cells.length && c < cols; i++) {
        const tc = cells[i];
        const span = clamp(numAttr(tc, 'gridSpan', 1), 1, cols - c);
        const down = Math.max(1, numAttr(tc, 'rowSpan', 1));
        const skipped = bool(attr(tc, 'hMerge')) || bool(attr(tc, 'vMerge'));
        const col = c;
        c += skipped ? 1 : span;
        if (skipped) continue;
        const parts = style ? stylePartsFor(style, flags, r, col, rows, cols) : [];
        const tcPr = kid(tc, 'tcPr');
        // Le fond : celui de la case, sinon celui du style (la partie la plus prioritaire qui en dit un).
        let fill = tcPr ? fillIn(tcPr, env) : undefined;
        if (fill === undefined) parts.forEach((part) => { const f = fillIn(at(part, 'tcStyle/fill') || at(part, 'tcStyle'), env); if (f !== undefined && f.kind !== 'group') fill = f; });
        const fillHex = fill && fill.color && fill.kind !== 'none' ? flatten(fill.color, env.bgRgb) : '';
        if (fill && (fill.kind === 'grad' || fill.kind === 'patt')) losses.add('cellFills');
        // Le texte : le gras et la couleur du style, puis ceux du texte lui-même.
        let bold = false;
        let textColor = null;
        parts.forEach((part) => {
          const tx = kid(part, 'tcTxStyle');
          if (!tx) return;
          if (attr(tx, 'b') === 'on') bold = true;
          else if (attr(tx, 'b') === 'off') bold = false;
          const color = kid(tx, COLOR_NODES);
          if (color) textColor = color;
        });
        // Les bords : ceux de la case, sinon ceux du style (le bord extérieur ou intérieur de la partie la plus prioritaire qui en dit un).
        const edges = { top: r === 0, bottom: r + down >= rows, left: col === 0, right: col + span >= cols };
        const sideTag = { top: ['top', 'insideH'], bottom: ['bottom', 'insideH'], left: ['left', 'insideV'], right: ['right', 'insideV'] };
        const explicit = { top: 'lnT', bottom: 'lnB', left: 'lnL', right: 'lnR' };
        let borderAttrs = '';
        ['top', 'right', 'bottom', 'left'].forEach((side) => {
          let value = tcPr && kid(tcPr, explicit[side]) ? borderValue(kid(tcPr, explicit[side]), env) : null;
          if (value === null && style) {
            parts.forEach((part) => {
              const holder = at(part, 'tcStyle/tcBdr/' + sideTag[side][edges[side] ? 0 : 1]);
              const v = holder ? borderValue(holder, env) : null;
              if (v !== null) value = v;
            });
            if (value === null) value = 'none';
          }
          if (value) borderAttrs += ' data-border-' + side + '="' + value + '"';
        });
        const anchor = attr(tcPr, 'anchor');
        const valign = anchor === 'ctr' ? 'middle' : (anchor === 'b' ? 'bottom' : (anchor === 't' ? 'top' : ''));
        const widths = grid.slice(col, col + span).map(w => Math.max(1, Math.round(px(w))));
        const shape = { env, roots: [ctx.defaultText || env.master.txStyles.other], fontRef: textColor, scale: 1, bold, losses };
        if (VERTICAL_TEXT.test(attr(tcPr, 'vert') || '') && kids(kid(tc, 'txBody'), 'p').some(p => paragraphText(p).trim())) losses.add('vertical');
        rowData.cells.push({
          open: '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + (down > 1 ? ' rowspan="' + down + '"' : '') + ' colwidth="' + widths.join(',') + '"'
            + (fillHex ? ' style="background-color: #' + fillHex + '"' : '') + (valign ? ' data-valign="' + valign + '"' : '') + borderAttrs + '>',
          txBody: kid(tc, 'txBody'), shape,
        });
      }
    }
    // Le tableau à la taille de texte `scale` ; `report` : où compter les liens (le premier tracé les compte, les essais de réduction ne les recomptent pas).
    const render = (scale, report) => '<table><tbody>' + rowsData.map(row => row.open + row.cells.map(cell => cell.open
      + ((cell.txBody && assemble(paragraphsOf(cell.txBody, Object.assign({}, cell.shape, { scale, report, losses: report ? null : cell.shape.losses })))) || '<p></p>') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    const columns = grid.map(w => Math.max(1, Math.round(px(w))));
    let html = render(1);
    let natural = measuredTable(ctx, html, columns);
    // Les lignes d'un tableau grandissent avec leur texte, et celui de l'éditeur (interligne 1,42) est plus haut que celui de PowerPoint : un tableau plus haut que dans le fichier a son texte réduit (jusqu'à 60 %).
    const limit = box.h * (1 + TABLE_FIT_SLACK) + 1;
    if (natural > limit) {
      const scratch = blankReport();
      const trial = (scale) => { const tried = render(scale, scratch); return { html: tried, natural: measuredTable(ctx, tried, columns), scale }; };
      let best = trial(MIN_FIT_SCALE);
      if (best.natural <= limit) {
        let low = MIN_FIT_SCALE;
        let high = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (low + high) / 2;
          const tried = trial(mid);
          if (tried.natural <= limit) { best = tried; low = mid; } else { high = mid; }
        }
      }
      html = best.html;
      natural = best.natural;
      ctx.report.shrunk += 1;
    }
    out.tables.push({ x: box.x, y: box.y, w: box.w, h: box.h, natural: Math.max(natural, 1), html });
    tally(ctx.report, losses);
  }
  // La hauteur, en points, d'un tableau tel que l'éditeur le dessinera : mesurée dans l'hôte caché, aux largeurs de colonnes du fichier et avec la hauteur minimale de chaque ligne (une ligne que son texte agrandit grandit).
  function measuredTable(ctx, html, columns) {
    const host = measureHost(ctx);
    const total = columns.reduce((a, b) => a + b, 0);
    host.style.width = total + 'px';
    const colgroup = '<colgroup>' + columns.map(w => '<col style="width: ' + w + 'px">').join('') + '</colgroup>';
    Dom.setMarkup(host, html.replace('<table><tbody>', '<table style="min-width: ' + total + 'px">' + colgroup + '<tbody>')
      .replace(/<tr data-row-height="(\d+)">/g, '<tr data-row-height="$1" style="height: $1px">').replace(/<p><\/p>/g, '<p><br></p>'));
    const table = host.querySelector('table');
    const height = table ? table.getBoundingClientRect().height / PX_PER_PT : 0;
    host.style.width = HOST_WIDTH_PX + 'px';
    return height;
  }
  // Les lignes vides qui font l'écart de `gap` points : une ligne vide de l'éditeur fait 1,42 fois la taille de son espace insécable, et jamais moins d'une ligne ; { html, height (celle que l'éditeur leur donnera) }.
  function spacerHtml(gap) {
    let html = '';
    let left = gap;
    let used = 0;
    while (left > LINE_PT / 2) {
      const height = Math.max(LINE_PT, Math.min(left, SPACER_MAX_PT));
      html += '<p><span style="font-size: ' + fixed(height / LINE_HEIGHT) + 'pt"> </span></p>';
      left -= height;
      used += height;
    }
    return { html, height: used };
  }
  // Ce que la diapositive pose dans le texte : ses tableaux, de haut en bas, avec les lignes vides qui les mettent à leur hauteur (le texte de la page commence à `topPt`). { html, bottom : le bas, dans la page, de la dernière ligne
  // que l'éditeur pose après le dernier tableau (0 sans tableau) }.
  function flowHtml(tables, topPt) {
    let html = '';
    let cursor = topPt;
    tables.forEach((table) => {
      const spacer = spacerHtml(table.y - cursor - TABLE_MARGIN_PT);
      html += spacer.html + table.html;
      cursor += spacer.height + TABLE_MARGIN_PT + table.natural + TABLE_MARGIN_PT;
    });
    return { html, bottom: tables.length ? cursor + LINE_PT : 0 };
  }
  async function graphicObject(node, env, groups, out) {
    const report = env.ctx.report;
    if (env.decor) { report.masterObjects += 1; return; }
    const data = at(node, 'graphic/graphicData');
    const uri = attr(data, 'uri') || '';
    if (/\/table$/.test(uri)) await tableObject(node, env, groups, out);
    else if (/chart/i.test(uri)) report.charts += 1;
    else if (/diagram/i.test(uri)) report.diagrams += 1;
    else if (/\/ole$/.test(uri) || kid(data, 'oleObj') || descendants(data, 'oleObj').length) report.embedded += 1;
    else report.unreadable += 1;
  }
  async function groupObject(node, env, groups, depth, out) {
    const xf = xfrmOf(kid(node, 'grpSpPr'));
    if (!xf || depth >= MAX_DEPTH) { env.ctx.report.unreadable += 1; return; }
    await walkTree(node, env, [xf].concat(groups), depth + 1, out);
  }
  // Les objets d'un arbre de formes, dans l'ordre de l'empilement (du fond au premier plan). Un objet illisible est compté et passé : le reste arrive.
  async function walkTree(tree, env, groups, depth, out) {
    const ctx = env.ctx;
    const nodes = kids(tree);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (ctx.objects >= MAX_OBJECTS) { ctx.report.unreadable += 1; return; }
      if (!env.decor && /^(sp|cxnSp|pic|grpSp|graphicFrame)$/.test(node.localName)) ctx.objects += 1;
      const from = out.length;
      try {
        switch (node.localName) {
          case 'sp': await shapeObject(node, env, groups, out); break;
          case 'cxnSp': connectorObject(node, env, groups, out); break;
          case 'pic': await pictureObject(node, env, groups, out); break;
          case 'grpSp': await groupObject(node, env, groups, depth, out); break;
          case 'graphicFrame': await graphicObject(node, env, groups, out); break;
          case 'contentPart': ctx.report.ink += 1; break;
          case 'AlternateContent': {
            // Le repli (`Fallback`) est ce que lit un logiciel qui ne connaît pas le contenu proposé en premier (équation, vidéo...) : une image la plupart du temps.
            if (descendants(kid(node, 'Choice'), 'oMath').length) ctx.report.equations += 1;
            const alternative = kid(node, 'Fallback') || kid(node, 'Choice');
            if (alternative) await walkTree(alternative, env, groups, depth, out);
            break;
          }
          default: break;
        }
      } catch (e) {
        ctx.report.unreadable += 1;
      }
      const animated = env.animations && !env.decor && /^(sp|cxnSp|pic|grpSp|graphicFrame)$/.test(node.localName)
        ? env.animations.byId.get(attr(kid(kid(node, ['nvSpPr', 'nvCxnSpPr', 'nvPicPr', 'nvGrpSpPr', 'nvGraphicFramePr']), 'cNvPr'), 'id')) : null;
      if (animated) animateFrames(out, from, animated);
    }
  }

  // --- Les animations d'objets ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Ce que l'éditeur reprend d'une animation de PowerPoint (js/frame-anim.js) : une ENTRÉE ou une SORTIE de la séquence principale - apparition (1), fondu (10), volée (2), balayage (22), zoom (23, 53) -
  // sur un objet entier, une seule par objet (la première). Le côté vient du sous-type (1 haut, 2 droite, 4 bas, 8 gauche), le départ du type du nœud (au clic, avec ou après la précédente), la durée de la plus
  // longue des durées de l'effet (sans le « 1 ms » qui montre l'objet), le délai de celui de l'effet. Tout le reste (emphase, trajectoire, effets autres, un paragraphe à la fois, un objet qui en a plusieurs,
  // une séquence déclenchée par un clic sur un objet, une cible qui n'est pas reprise) est compté au rapport.
  const ANIM_PRESETS = { 1: 'appear', 10: 'fade', 2: 'fly', 22: 'wipe', 23: 'zoom', 53: 'zoom' };
  const ANIM_STARTS = { clickEffect: 'click', withEffect: 'with', afterEffect: 'after' };
  function animationOf(effect) {
    const kind = ANIM_PRESETS[numAttr(effect, 'presetID', -1)];
    const exit = attr(effect, 'presetClass') === 'exit';
    if (!kind || (!exit && attr(effect, 'presetClass') !== 'entr')) return null;
    const targets = descendants(effect, 'spTgt');
    if (!targets.length || targets.some(target => attr(target, 'spid') !== attr(targets[0], 'spid') || kid(target, 'txEl'))) return null;
    const sub = numAttr(effect, 'presetSubtype', 0);
    const side = sub & 8 ? 'l' : (sub & 2 ? 'r' : (sub & 1 ? 't' : 'b'));
    const spans = descendants(effect, 'cTn').map(node => numAttr(node, 'dur', 0)).filter(ms => ms > 1);
    const wait = Number(attr(at(effect, 'stCondLst/cond'), 'delay'));
    const anim = FrameAnim.normalized({ effect: kind, side, exit, start: ANIM_STARTS[attr(effect, 'nodeType')], dur: spans.length ? Math.max(...spans) : FrameAnim.DURATION.def, delay: Number.isFinite(wait) ? wait : 0 });
    return anim ? { id: attr(targets[0], 'spid'), anim, used: false, slots: [] } : null;
  }
  // Les animations de la diapositive `root` : { byId (l'identifiant de l'objet -> son animation), lost (celles qu'on ne reprend pas) }.
  function timingOf(root) {
    const found = { byId: new Map(), lost: 0 };
    const timing = kid(root, 'timing');
    if (!timing) return found;
    const nodes = descendants(timing, 'cTn');
    const main = nodes.find(node => attr(node, 'nodeType') === 'mainSeq');
    let rank = 0;
    nodes.filter(node => ANIM_STARTS[attr(node, 'nodeType') || '']).forEach((effect) => {
      const one = main && main.contains(effect) ? animationOf(effect) : null;
      if (!one || found.byId.has(one.id)) { found.lost += 1; return; }
      rank += 1;
      one.rank = rank;
      found.byId.set(one.id, one);
    });
    return found;
  }
  // Pose l'animation de l'objet `id` sur les cadres que son objet vient d'ajouter à `out` (à partir de `from`) : le premier garde le départ de l'animation, les autres (un groupe, ou un objet devenu plusieurs
  // cadres) partent avec lui.
  function animateFrames(out, from, one) {
    for (let i = from; i < out.length; i++) {
      const html = out[i];
      if (typeof html !== 'string' || !html.startsWith('<div class="pp-free-frame"') || html.slice(0, html.indexOf('>')).includes(' data-ff-anim=')) continue;
      const text = FrameAnim.text(one.slots.length ? Object.assign({}, one.anim, { start: 'with' }) : one.anim);
      out[i] = html.replace('<div class="pp-free-frame"', '<div class="pp-free-frame" data-ff-anim="' + text + '"');
      one.slots.push(i);
      one.used = true;
    }
  }
  // Une fois les objets de la diapositive posés : ceux dont la cible n'a pas été reprise sont comptés ; quand l'ordre de la séquence n'est pas celui des cadres, chaque cadre dit sa place (`n`).
  function settleAnimations(out, timing, report) {
    const used = Array.from(timing.byId.values()).filter(one => one.used);
    report.animations += timing.lost + timing.byId.size - used.length;
    const placed = used.slice().sort((a, b) => a.slots[0] - b.slots[0]);
    if (placed.every((one, k) => k === 0 || placed[k - 1].rank < one.rank)) return;
    used.forEach((one) => {
      one.slots.forEach((slot) => {
        out[slot] = out[slot].replace(/ data-ff-anim="([^"]*)"/, (all, text) => ' data-ff-anim="' + FrameAnim.text(Object.assign(FrameAnim.parse(text), { order: Math.min(one.rank, FrameAnim.ORDER_MAX) })) + '"');
      });
    });
  }

  // --- Le fond, les notes, la transition d'une diapositive ----------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le fond : le premier qui en dit un, de la diapositive à la mise en page puis au masque. { rgb } (uni, ou la couleur moyenne d'un dégradé), { picture } (une image), ou {}.
  async function backgroundOf(env, holders) {
    for (let i = 0; i < holders.length; i++) {
      const bg = at(holders[i].root, 'cSld/bg');
      if (!bg) continue;
      let fill;
      const pr = kid(bg, 'bgPr');
      if (pr) {
        fill = fillIn(pr, env);
      } else {
        const ref = kid(bg, 'bgRef');
        const idx = numAttr(ref, 'idx', 0);
        const themed = idx >= 1001 ? env.theme.bgFills[idx - 1001] : (idx > 0 ? env.theme.fills[idx - 1] : null);
        const phColor = colorIn(ref, env);
        fill = themed ? fillOfElement(themed, env, phColor) : (phColor ? { kind: 'solid', color: phColor } : undefined);
      }
      if (!fill || fill.kind === 'group') continue;
      if (fill.kind === 'none') return {};
      if (fill.kind === 'blip') {
        const data = await blipData(fill.el, env, holders[i].rels);
        return data ? { picture: data } : {};
      }
      if (fill.kind === 'grad') env.ctx.report.gradients += 1;
      if (fill.kind === 'patt') env.ctx.report.slidePatterns += 1;
      return fill.color ? { rgb: fill.color.rgb.map(c => c * fill.color.alpha + 255 * (1 - fill.color.alpha)) } : {};
    }
    return {};
  }
  const paragraphText = p => kids(p).map(node => (node.localName === 'br' ? '\n' : (/^(r|fld)$/.test(node.localName) ? (kid(node, 't') || { textContent: '' }).textContent : ''))).join('');
  // Les notes de l'intervenant : le texte de l'espace réservé « corps » de la page de notes, un paragraphe par ligne.
  async function notesOf(env) {
    const rel = env.slideRels.ofType('notesSlide')[0];
    const doc = rel && rel.target ? await env.ctx.pkg.xml(rel.target) : null;
    if (!doc) return '';
    const body = kids(at(doc.documentElement, 'cSld/spTree'), 'sp').find((sp) => { const ph = placeholderOf(sp); return ph && ph.type === 'body'; });
    return body ? kids(at(body, 'txBody'), 'p').map(paragraphText).join('\n').replace(/\s+$/, '') : '';
  }
  // La transition : { transition, from, dur } d'après `p:transition` (dans le contenu de remplacement `mc:AlternateContent` quand le fichier la dit avec la durée précise de PowerPoint 2010).
  function transitionOf(root, report) {
    const all = descendants(root, 'transition').filter(el => el.parentNode === root || (el.parentNode && /^(Choice|Fallback)$/.test(el.parentNode.localName)));
    const el = all.find(node => node.parentNode.localName === 'Choice') || all[0];
    if (!el) return {};
    // Le passage seul à la suivante (`advTm`, en millisecondes) se dit avec ou sans effet.
    const timing = localAttr(el, 'advTm');
    const advance = timing === null || timing === '' ? {} : { advance: Number(timing) };
    // « advClick="0" » : la diapositive ne passe que par le temps, le clic ne la fait pas passer. Le diaporama de l'éditeur la fait aussi passer au clic : le rapport le dit.
    if (/^(0|false)$/.test(localAttr(el, 'advClick') || '')) report.advanceClick += 1;
    const effect = kids(el).find(node => !/^(sndAc|extLst)$/.test(node.localName));
    if (!effect) return advance;
    const name = effect.localName;
    // Le « cut » est un changement sans effet - ce que le diaporama fait sans transition - et ne perd rien ; son passage « par le noir » est un fondu approché.
    if (name === 'cut' && !/^(1|true)$/.test(attr(effect, 'thruBlk') || '')) return advance;
    let kind = TRANSITIONS[name];
    if (!kind) { kind = 'fade'; report.transitions += 1; }
    const written = localAttr(el, 'dur');
    const ms = written === null || written === '' ? NaN : Number(written);
    const dur = Number.isFinite(ms) ? ms : (SPEED_MS[attr(el, 'spd')] || SPEED_MS.med);
    let from = FROM_SIDE[attr(effect, 'dir')] || 'r';
    if (kind === 'split') from = SPLIT_FROM[(attr(effect, 'orient') || 'horz') + '/' + (attr(effect, 'dir') || 'out')] || 'b';
    else if (kind === 'blinds') from = attr(effect, 'dir') === 'vert' ? 'b' : 'r';
    return Object.assign({ transition: kind, from, dur }, advance);
  }

  // --- Le masque et la mise en page ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function loadMaster(path, ctx) {
    if (ctx.masters.has(path)) return ctx.masters.get(path);
    const doc = await ctx.pkg.xml(path);
    const root = doc ? doc.documentElement : null;
    const rels = await ctx.pkg.rels(path);
    const themeRel = rels.ofType('theme')[0];
    const tree = at(root, 'cSld/spTree');
    const deco = { n: 0 };
    countTree(tree, deco);
    const master = {
      path, root, rels, theme: readTheme(themeRel && themeRel.target ? await ctx.pkg.xml(themeRel.target) : null), clrMap: clrMapOf(kid(root, 'clrMap'), CLR_MAP_DEFAULT),
      txStyles: { title: at(root, 'txStyles/titleStyle'), body: at(root, 'txStyles/bodyStyle'), other: at(root, 'txStyles/otherStyle') },
      placeholders: kids(tree, 'sp').filter(placeholderOf), decorations: deco.n,
    };
    ctx.masters.set(path, master);
    return master;
  }
  async function loadLayout(path, ctx) {
    if (ctx.layouts.has(path)) return ctx.layouts.get(path);
    const doc = await ctx.pkg.xml(path);
    const root = doc ? doc.documentElement : null;
    const rels = await ctx.pkg.rels(path);
    const masterRel = rels.ofType('slideMaster')[0];
    const master = await loadMaster(masterRel && masterRel.target ? masterRel.target : '', ctx);
    const tree = at(root, 'cSld/spTree');
    const deco = { n: 0 };
    countTree(tree, deco);
    const layout = {
      path, root, rels, master, clrOverride: at(root, 'clrMapOvr/overrideClrMapping'),
      placeholders: kids(tree, 'sp').filter(placeholderOf), decorations: deco.n, showMaster: attr(root, 'showMasterSp') !== '0',
    };
    ctx.layouts.set(path, layout);
    return layout;
  }

  // Le décor d'un masque ou d'une mise en page : ses objets qui ne sont pas des espaces réservés (bandeaux, logo, cartes, textes) sont recopiés DERRIÈRE le texte de chaque diapositive qui les montre, du masque à la mise en page :
  // sans eux une diapositive perd son allure, et un texte clair sur un bandeau devient illisible. Ce que le décor a de non repris (tableaux, graphiques, trop d'objets, images trop lourdes) est compté une seule fois, pas une
  // fois par diapositive.
  async function decorFrames(holder, env, out) {
    const ctx = env.ctx;
    const tree = at(holder.root, 'cSld/spTree');
    if (!tree) return;
    const first = !ctx.counted.has(holder.path);
    ctx.counted.add(holder.path);
    if (holder.decorations > MAX_DECOR_OBJECTS) {
      if (first) ctx.report.masterObjects += holder.decorations;
      return;
    }
    const saved = ctx.report;
    const scratch = blankReport();
    ctx.report = scratch;
    try {
      await walkTree(tree, Object.assign({}, env, { slideRels: holder.rels, decor: 'behind' }), [], 0, out);
    } finally {
      ctx.report = saved;
    }
    if (first) REPORT_KEYS.forEach((key) => { saved[key] += scratch[key]; });
  }

  // --- Une diapositive -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function slideHtml(path, ctx, pageBox) {
    const doc = await ctx.pkg.xml(path);
    if (!doc) throw fail('unreadable', 'Une diapositive est illisible.');
    const root = doc.documentElement;
    const slideRels = await ctx.pkg.rels(path);
    const layoutRel = slideRels.ofType('slideLayout')[0];
    const layout = await loadLayout(layoutRel && layoutRel.target ? layoutRel.target : '', ctx);
    const master = layout.master;
    const override = at(root, 'clrMapOvr/overrideClrMapping');
    const env = {
      ctx, theme: master.theme, layout, master, slideRels, bgRgb: [255, 255, 255], page: pageBox,
      clrMap: clrMapOf(override, clrMapOf(layout.clrOverride, master.clrMap)),
    };
    env.animations = timingOf(root);
    for (const rel of slideRels.list) {
      if (rel.type === 'comments' || rel.type === 'modernComment') ctx.report.comments += descendants(rel.target ? await ctx.pkg.xml(rel.target) : null, 'cm').length;
    }

    const background = await backgroundOf(env, [{ root, rels: slideRels }, { root: layout.root, rels: layout.rels }, { root: master.root, rels: master.rels }]);
    if (background.rgb) env.bgRgb = background.rgb;
    else if (background.picture) env.bgRgb = (await averageColor(ctx, background.picture)) || env.bgRgb;
    const frames = Object.assign([], { tables: [] });
    const picture = background.picture ? await copiedImage(env, await stretchedTo(ctx, background.picture, pageBox.w / pageBox.h), 'images') : null;
    if (picture) frames.push(pictureFrame({ x: 0, y: 0, w: pageBox.w, h: pageBox.h, rot: 0 }, picture, '', 1, 'behind'));
    // Le décor du masque puis celui de la mise en page, sous le texte de la diapositive (sauf « Masquer les graphiques d'arrière-plan »).
    if (attr(root, 'showMasterSp') !== '0') {
      if (layout.showMaster) await decorFrames(master, env, frames);
      await decorFrames(layout, env, frames);
    }
    await walkTree(at(root, 'cSld/spTree'), env, [], 0, frames);
    settleAnimations(frames, env.animations, ctx.report);
    // Les tableaux sont posés dans le texte une fois les marges de la page connues (flowHtml).
    frames.tables.sort((a, b) => a.y - b.y).forEach((table) => { ctx.tables.push(table); });
    const bgHex = background.rgb ? toHex(background.rgb) : '';
    const props = Object.assign({ bg: bgHex && bgHex !== 'ffffff' ? '#' + bgHex : '', notes: await notesOf(env), hidden: attr(root, 'show') === '0' }, transitionOf(root, ctx.report));
    return { head: SlideProps.html(props) + frames.join(''), tables: frames.tables, tail: '<p></p>' };
  }

  // --- Le fichier ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Les genres du rapport, dans l'ordre où la fenêtre les dit : d'abord ce qui n'arrive pas ou arrive remplacé, puis ce que le fichier demande et que l'éditeur ne sait pas encore faire, famille par famille (le texte, les puces,
  // les formes et les traits, les images, les tableaux, les diapositives, le fichier), enfin les limites (objets du masque, diapositives en trop, objets illisibles). `theme` : voir fromBuffer.
  const REPORT_KEYS = ['animations', 'charts', 'diagrams', 'tables', 'tablesMoved', 'shrunk', 'embedded', 'media', 'ink', 'freeDrawings', 'equations', 'comments', 'images', 'shapes', 'gradients', 'transitions', 'advanceClick', 'slideLinks',
    'tabs', 'rtl', 'vertical',
    'textEffects', 'textGradient', 'underlines', 'fonts',
    'bulletChars', 'bulletImages',
    'dashes', 'shadows', 'effects', 'relief', 'patterns', 'shapePictures', 'hiddenObjects',
    'imageShapes', 'imageAdjust', 'imageFrames', 'objectLinks', 'altTexts',
    'cellFills',
    'slidePatterns', 'sections', 'theme',
    'masterObjects', 'slidesCut', 'unreadable'];
  // La page de l'éditeur pour des diapositives de `cx` sur `cy` EMU : le format libre (côté court d'abord, au dixième de millimètre, borné) et le sens ; `k` rapporte le fichier à cette page (1, sauf si la page
  // du fichier dépasse la plus grande que l'éditeur accepte).
  function pageFor(cx, cy) {
    const orientation = cx >= cy ? PageLayout.LANDSCAPE : PageLayout.PORTRAIT;
    const short = Math.min(cx, cy) / EMU_PER_MM;
    const long = Math.max(cx, cy) / EMU_PER_MM;
    // Une page plus grande que l'éditeur n'en accepte garde ses proportions : c'est son grand côté qui est ramené au plus grand, l'autre le suit (un côté borné seul en ferait un carré).
    const shrink = Math.min(1, PageLayout.CUSTOM_MAX_MM / long);
    const tenth = mm => String(Math.round(clamp(mm * shrink, PageLayout.CUSTOM_MIN_MM, PageLayout.CUSTOM_MAX_MM) * 10) / 10);
    const format = PageLayout.normalizeFormat(tenth(short) + 'x' + tenth(long));
    const mm = PageLayout.pageSizeMmFor(orientation, format);
    const pt = PageLayout.pageSizePtFor(orientation, format);
    const k = Math.min(mm.width / (orientation === PageLayout.LANDSCAPE ? long : short), mm.height / (orientation === PageLayout.LANDSCAPE ? short : long));
    return { orientation, format, k: Math.abs(k - 1) < 0.002 ? 1 : k, widthPt: pt.width, heightPt: pt.height };
  }
  const ptToMm = pt => Math.round(Math.max(0, pt) / 72 * 25.4 * 100) / 100;
  // Les marges de la page : celles de l'éditeur, sauf quand le fichier a des tableaux. Un tableau est dans le texte de sa diapositive, qui commence à la marge de gauche et finit à celle de droite (et la page n'en a qu'une paire, pour toutes les
  // diapositives) : la place que prennent les tableaux est celle que partage le plus grand nombre d'entre eux, la première à égalité ; un tableau qui n'y est pas, à quelques points près, est rangé à cette place et le rapport le dit. La marge du
  // haut est celle qui met le tableau le plus haut à sa hauteur sans ligne vide (jamais plus que celle de l'éditeur), et la marge du bas (bottomMarginMm) laisse la place du plus bas, pour qu'aucun ne passe à la page suivante. Sans tableau,
  // rien n'est dit (les marges de l'éditeur).
  function marginsFor(tables, page) {
    if (!tables.length) return { margins: {}, topPt: PageLayout.DEFAULT_MARGIN_PT, moved: 0 };
    const same = (a, b) => Math.abs(a.x - b.x) <= TABLE_SLACK_PT && Math.abs(a.w - b.w) <= TABLE_SLACK_PT;
    let place = tables[0];
    let shared = 0;
    tables.forEach((table) => {
      const count = tables.filter(other => same(table, other)).length;
      if (count > shared) { place = table; shared = count; }
    });
    const base = PageLayout.DEFAULT_MARGIN_PT;
    const room = PageLayout.MIN_CONTENT_MM / 25.4 * 72;
    const left = clamp(place.x, 0, page.widthPt - room);
    const right = clamp(page.widthPt - place.x - place.w, 0, page.widthPt - left - room);
    const wanted = Math.min.apply(null, tables.map(table => table.y)) - TABLE_MARGIN_PT;
    const topPt = wanted <= base + LINE_PT ? Math.max(0, wanted) : base;
    return { margins: { left: ptToMm(left), right: ptToMm(right), top: ptToMm(topPt) }, topPt, moved: tables.length - shared };
  }
  // La marge du bas qui laisse à la page la place de ce qui descend le plus bas (`lowest`, en points depuis le haut de la page), à 2 points près.
  function bottomMarginMm(page, lowest) {
    return ptToMm(clamp(page.heightPt - lowest - 2, 0, PageLayout.DEFAULT_MARGIN_PT));
  }
  const PAGE_BREAK = '<div class="page-break-marker"></div>';
  // Le texte d'une présentation d'après le contenu d'un fichier .pptx : { html, page: { orientation, format }, slideCount, report: [{ key, n }] }.
  async function fromBuffer(buffer) {
    if (!buffer || buffer.byteLength > MAX_FILE_BYTES) throw fail('tooBig', 'Ce fichier est trop gros pour être importé.', { size: buffer ? buffer.byteLength : 0, max: MAX_FILE_BYTES });
    const pkg = await openPackage(buffer);
    const rootRels = await pkg.xml('_rels/.rels');
    const office = rootRels ? descendants(rootRels.documentElement, 'Relationship').find(el => /officeDocument$/.test(attr(el, 'Type') || '')) : null;
    const presentationPath = (office && resolvePath('', attr(office, 'Target'))) || 'ppt/presentation.xml';
    const doc = await pkg.xml(presentationPath);
    if (!doc || doc.documentElement.localName !== 'presentation') throw fail('unreadable', 'Ce fichier n’est pas une présentation PowerPoint.');
    const presentation = doc.documentElement;
    const presentationRels = await pkg.rels(presentationPath);
    const paths = kids(kid(presentation, 'sldIdLst'), 'sldId').map(el => presentationRels.byId.get(relAttr(el, 'id'))).filter(rel => rel && rel.target && pkg.has(rel.target)).map(rel => rel.target);
    if (!paths.length) throw fail('empty', 'Cette présentation n’a aucune diapositive.');
    const size = kid(presentation, 'sldSz');
    const page = pageFor(Math.max(numAttr(size, 'cx', 12192000), 1), Math.max(numAttr(size, 'cy', 6858000), 1));
    const report = blankReport();
    // Les sections de la bande des diapositives (`p14:sectionLst`) : l'éditeur n'en a pas.
    report.sections = descendants(presentation, 'sectionLst').reduce((n, list) => n + kids(list, 'section').length, 0);
    const ctx = {
      pkg, k: page.k, report, realReport: report, images: new Map(), imageBytes: 0, decorBytes: 0, prepared: new Map(), skipped: new Set(), objects: 0, masters: new Map(), layouts: new Map(), counted: new Set(), tables: [],
      defaultText: kid(presentation, 'defaultTextStyle'), presentationRels,
    };
    if (paths.length > MAX_SLIDES) { report.slidesCut = paths.length - MAX_SLIDES; paths.length = MAX_SLIDES; }
    const slides = [];
    // Les polices de l'éditeur sont prêtes avant qu'un texte soit mesuré : Roboto ne se charge qu'au premier texte qui s'en sert, et un document vide n'en a aucun (css/roboto-fonts.css).
    if (document.fonts && document.fonts.load) {
      await Promise.all(ROBOTO_FACES.map(face => document.fonts.load(face).catch(() => null)));
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    try {
      for (let i = 0; i < paths.length; i++) {
        try {
          slides.push(await slideHtml(paths[i], ctx, { w: page.widthPt, h: page.heightPt }));
        } catch (e) {
          report.unreadable += 1;
          slides.push({ head: '', tables: [], tail: '<p></p>' });
        }
      }
    } finally {
      if (ctx.host) ctx.host.remove();
    }
    const layout = marginsFor(ctx.tables, page);
    report.tablesMoved = layout.moved;
    let lowest = 0;
    const texts = slides.map((slide) => {
      const flow = flowHtml(slide.tables, layout.topPt);
      lowest = Math.max(lowest, flow.bottom);
      return slide.head + flow.html + slide.tail;
    });
    if (lowest > 0) layout.margins.bottom = bottomMarginMm(page, lowest);
    // Le thème : ses couleurs et ses polices sont figées sur celles du fichier (l'éditeur n'a pas de thème qu'on change). Le rapport le dit avec les autres lignes, jamais seul : presque tout fichier a un thème, et
    // un fichier qui n'a que cela à dire s'ouvre sans fenêtre.
    report.theme = Array.from(ctx.masters.values()).filter(master => master.theme.used).length;
    const said = REPORT_KEYS.filter(key => report[key] > 0);
    return {
      html: texts.join(PAGE_BREAK), page: Object.assign({ orientation: page.orientation, format: page.format }, layout.margins), slideCount: slides.length,
      report: (said.length === 1 && said[0] === 'theme' ? [] : said).map(key => ({ key, n: report[key] })),
    };
  }
  async function fromFile(file) {
    if (!file || file.size > MAX_FILE_BYTES) throw fail('tooBig', 'Ce fichier est trop gros pour être importé.', { size: file ? file.size : 0, max: MAX_FILE_BYTES });
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      throw fail('unreadable', 'Ce fichier n’a pas pu être lu.', { cause: e });
    }
    return fromBuffer(buffer);
  }

  return { fromFile, fromBuffer, MAX_FILE_BYTES, MAX_SLIDES, REPORT_KEYS };
})();
