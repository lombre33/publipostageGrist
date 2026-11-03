// Le thème d'une présentation : les couleurs et les polices que toutes ses diapositives prennent d'un seul endroit (demande du 02/11, fil « Ajouter un thème de présentation » ; c'est le préalable d'une
// galerie vraiment belle). Ce fichier est le SOCLE du thème : les données, leur lecture, la façon dont l'éditeur et chaque sortie les montrent, le changement de thème qui recolore le texte. Il ne dépend
// d'aucune extension : une présentation themée s'ouvre, s'exporte et se lit sans le code de l'extension « diapositives », dont seule la fenêtre « Thème… » (extensions/diapositives/slide-theme-ui.js) fait partie.
//
// LES DONNÉES. Le thème est gardé avec la page du modèle, dans le JSON de la colonne Margins (PageLayout, clé `theme`, comme le filigrane) : { v: 1, name?, colors: { text, title, bg, accent1 à accent6 },
// fonts: { title, body } }. Les couleurs sont des #rrggbb en minuscules ; les polices sont les six du menu de police de la barre (FONTS : celles que le PDF, le Word et le PowerPoint savent écrire), sous leur
// nom. Une présentation SANS thème (la clé est absente) est celle d'avant : rien n'est ajouté nulle part, ni à l'écran ni dans un fichier. Un thème lu d'un JSON abîmé ou d'une version plus récente
// retombe sur la valeur d'origine de chaque réglage, jamais sur une erreur (normalize).
//
// L'ÉDITEUR ET LES SORTIES montrent le thème sans rien écrire dans le texte :
//  - à l'écran, `refresh` pose les couleurs et les polices en variables CSS sur :root et la classe `pp-themed` sur <html> ; css/slide-theme.css en tire la police et la couleur du texte et des titres, et le fond de la
//    feuille de l'éditeur et des miniatures. Ce sont des valeurs PAR DÉFAUT : une police ou une couleur choisie sur un mot (une marque du texte), le style d'un niveau de titre (js/heading-styles.js), la couleur d'une
//    forme ou le fond propre d'une diapositive (js/slide-props.js) l'emportent, comme avant ;
//  - dans la Lecture, l'impression, le diaporama et tous les exports, `forOutput` pose les mêmes valeurs en `style` sur les paragraphes et les titres du HTML que SlidesEntry.outputHtml donne (PDF, Word, HTML et
//    PowerPoint les lisent déjà sur n'importe quel élément). Rien n'y remplace un réglage que le bloc porte déjà ou que le style de son niveau de titre porte. Le FOND du thème y est un fond de diapositive posé
//    à chacune qui n'a pas le sien (`paperOf`, option `background` de SlideProps.forOutput : le même cadre de fond sous le texte que pour un fond choisi une à une), sauf pour le blanc ;
//  - le PowerPoint reçoit en plus les couleurs et les polices du thème dans le thème du fichier (js/pptx-export.js) : son fond est celui du masque (`lt1`, peint par `bg1`), sans cadre de fond.
//
// LE CHANGEMENT DE THÈME recolore ce que la personne avait choisi dans les couleurs de l'ancien thème : `remap` remplace, dans une transaction, chaque couleur de texte, de surlignage, de puce, de forme, de case
// de tableau, de bordure et de fond de diapositive qui est celle d'un réglage de l'ancien thème (ou sa nuance plus claire ou plus foncée) par celle du nouveau. Une couleur qui n'est dans aucun thème, composée à la main,
// ne bouge pas ; une police choisie sur un mot non plus.
const SlideTheme = (function () {
  const VERSION = 1;
  const NAME_MAX = 40;
  // Les réglages de couleur, dans l'ordre où la rangée « Couleurs du thème » des menus de couleur les montre : le fond, le texte, les titres, six accents.
  const COLOR_SLOTS = ['bg', 'text', 'title', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const ACCENT_SLOTS = COLOR_SLOTS.filter(slot => slot.indexOf('accent') === 0);
  // Les polices : celles du menu de police de la barre (js/main-toolbar.js, FONT_FAMILY_PRESETS), avec la pile CSS que l'éditeur leur donne. Le nom est ce que la marque de texte et les exports lisent.
  const FONTS = [
    { name: 'Roboto', css: "'Roboto', Helvetica, Arial, sans-serif" },
    { name: 'Arial', css: 'Arial, Helvetica, sans-serif' },
    { name: 'Times New Roman', css: "'Times New Roman', Times, serif" },
    { name: 'Georgia', css: 'Georgia, serif' },
    { name: 'Courier New', css: "'Courier New', Courier, monospace" },
    { name: 'Calibri', css: "Calibri, Carlito, 'Segoe UI', sans-serif" },
  ];
  // Les valeurs d'origine de chaque réglage : la couleur du texte de l'éditeur, les six accents du thème que le PowerPoint exporté a toujours porté, la police de l'éditeur.
  const DEFAULT_COLORS = Object.freeze({ bg: '#ffffff', text: '#1b2430', title: '#1b2430', accent1: '#2f6fed', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47' });
  const DEFAULT_FONTS = Object.freeze({ title: 'Roboto', body: 'Roboto' });
  const HEX = /^#[0-9a-f]{6}$/i;
  // La nuance claire et la nuance foncée d'un accent : le fond et le trait d'une forme neuve (comme le bleu clair et le bleu foncé des formes de PowerPoint).
  const LIGHT = 0.8;
  const DARK = 0.25;
  // Les variables CSS que `refresh` pose sur :root, et la classe qui allume les règles de css/slide-theme.css.
  const CLASS = 'pp-themed';
  const VARS = ['--pp-theme-text', '--pp-theme-title', '--pp-theme-bg', '--pp-theme-font-title', '--pp-theme-font-body'].concat(ACCENT_SLOTS.map(slot => '--pp-theme-' + slot));

  // Le DÉCOR commun des diapositives (carte « Quel décor le thème pose-t-il... », option « Décor réglé dans le thème », 02/11) : un bandeau de couleur sur un bord, un logo dans un coin, le numéro de la diapositive et un
  // texte de pied. `theme.decor` est facultatif et borné ; absent, la présentation n'a rien de plus. Le bandeau prend la couleur d'un RÉGLAGE du thème (son nom, pas un #rrggbb) : changer les couleurs du thème
  // change celle du bandeau, sans recolorer rien dans le texte.
  const BAND_EDGES = ['left', 'top', 'bottom'];
  const BAND_SIZES = { thin: 6, medium: 14, thick: 28 };       // l'épaisseur du bandeau, en points sur une page de PAGE_BASE_PT de haut
  const BAND_COLORS = ['title', 'text'].concat(ACCENT_SLOTS);
  const CORNERS = ['tl', 'tr', 'bl', 'br'];
  const LOGO_HEIGHTS = { small: 22, medium: 32, large: 48 };   // la hauteur du logo (points sur une page de PAGE_BASE_PT de haut) : un petit et un moyen tiennent dans la marge du haut d'une diapositive (14 mm)
  const LOGO_MAX_WIDTH = 220;                                  // sa largeur au plus, au même compte : un logo très large en reste plus bas
  const FOOT_SPOTS = ['bl', 'bc', 'br'];
  const FOOTER_MAX = 60;
  const LOGO_SRC = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;      // jamais d'image vectorielle : elle peut porter un script
  const LOGO_SRC_MAX = 72000;                                  // le poids de l'adresse de données du logo (≈ 54 Ko d'image) : le thème se range avec la page de chaque modèle
  let lastLogoSrc = null;                                      // la dernière adresse qui a passé LOGO_SRC : le décor se relit à chaque frappe, une fois par diapositive, et l'expression coûte plus d'une milliseconde sur 54 Ko ; la même adresse a toujours la même réponse
  const LOGO_PX_MAX = 4096;
  const PAGE_BASE_PT = 540;                                    // la hauteur de la page de référence, 190,5 mm : les mesures du décor y sont dites, puis mises à l'échelle de la hauteur de la page
  const pick = (value, list, fallback) => (list.indexOf(value) !== -1 ? value : fallback);

  const fontOf = value => FONTS.find(font => font.name.toLowerCase() === String(value == null ? '' : value).trim().toLowerCase()) || null;
  const fontCss = name => (fontOf(name) || fontOf(DEFAULT_FONTS.body)).css;

  // Le décor lu de n'importe quelle valeur : le décor borné (les clés dans le même ordre : bandeau, logo, numéro, pied, « pas sur la première »), ou null quand il n'a rien à montrer.
  function normalizeDecor(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = {};
    const band = raw.band;
    if (band && typeof band === 'object' && BAND_EDGES.indexOf(band.edge) !== -1) out.band = { edge: band.edge, size: pick(band.size, Object.keys(BAND_SIZES), 'medium'), color: pick(band.color, BAND_COLORS, 'accent1') };
    const logo = raw.logo;
    if (logo && typeof logo === 'object' && typeof logo.src === 'string' && logo.src.length <= LOGO_SRC_MAX && (logo.src === lastLogoSrc || LOGO_SRC.test(logo.src))) {
      lastLogoSrc = logo.src;
      const w = Math.round(Number(logo.w));
      const h = Math.round(Number(logo.h));
      if (w >= 1 && h >= 1 && w <= LOGO_PX_MAX && h <= LOGO_PX_MAX) out.logo = { src: logo.src, w, h, pos: pick(logo.pos, CORNERS, 'tr'), size: pick(logo.size, Object.keys(LOGO_HEIGHTS), 'medium') };
    }
    if (raw.number && typeof raw.number === 'object') out.number = { pos: pick(raw.number.pos, FOOT_SPOTS, 'br') };
    const text = raw.footer && typeof raw.footer === 'object' && typeof raw.footer.text === 'string' ? raw.footer.text.replace(/\s+/g, ' ').trim().slice(0, FOOTER_MAX).trim() : '';
    if (text) out.footer = { text, pos: pick(raw.footer.pos, FOOT_SPOTS, 'bl') };
    if (raw.skipFirst === true && (out.number || out.footer)) out.skipFirst = true;
    return Object.keys(out).length ? out : null;
  }

  // Un thème lu de n'importe quelle valeur (objet, ou texte JSON) : le thème borné, ou null quand ce n'en est pas un (une valeur qui n'est pas un objet qui porte des couleurs). Chaque réglage inconnu ou abîmé
  // prend sa valeur d'origine ; les clés sont toujours dans le même ordre (le JSON d'un thème sert à comparer deux thèmes).
  function normalize(value) {
    let data = value;
    if (typeof value === 'string') {
      try { data = JSON.parse(value); } catch (e) { return null; }
    }
    if (!data || typeof data !== 'object' || !data.colors || typeof data.colors !== 'object') return null;
    const colors = {};
    COLOR_SLOTS.forEach((slot) => { colors[slot] = HEX.test(data.colors[slot]) ? data.colors[slot].toLowerCase() : DEFAULT_COLORS[slot]; });
    const given = data.fonts && typeof data.fonts === 'object' ? data.fonts : {};
    const fonts = { title: (fontOf(given.title) || fontOf(DEFAULT_FONTS.title)).name, body: (fontOf(given.body) || fontOf(DEFAULT_FONTS.body)).name };
    const name = typeof data.name === 'string' ? data.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim() : '';
    const theme = name ? { v: VERSION, name, colors, fonts } : { v: VERSION, colors, fonts };
    const decor = normalizeDecor(data.decor);
    if (decor) theme.decor = decor;
    return theme;
  }
  const equals = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  // Le nom d'un thème pour l'interface : celui que le modèle lui a gardé, « Personnalisé » à défaut, « Sans thème » pour aucun.
  function displayName(theme) {
    const t = normalize(theme);
    return t ? (t.name || I18n.t('slides.theme.custom')) : I18n.t('slides.theme.none');
  }
  // Le thème d'origine (celui d'une présentation sans thème) : ses réglages sont les valeurs d'origine ci-dessus.
  const original = () => normalize({ colors: DEFAULT_COLORS, fonts: DEFAULT_FONTS });

  // --- Les nuances ---

  function toHsl(hex) {
    const { r, g, b } = ColorMath.toRgb(hex);
    const red = r / 255, green = g / 255, blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const light = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    let sat = 0;
    if (delta) {
      sat = delta / (1 - Math.abs(2 * light - 1));
      if (max === red) hue = ((green - blue) / delta) % 6;
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return { h: hue, s: sat, l: light };
  }
  function fromHsl({ h, s, l }) {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const sector = (((h % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((sector % 2) - 1));
    const m = l - chroma / 2;
    const [r, g, b] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(sector) % 6];
    return ColorMath.toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
  }
  // La couleur éclaircie de `amount` (0 à 1) vers le blanc, ou assombrie vers le noir : la clarté, en teinte-saturation-clarté, comme les nuances « plus clair 80 % » et « plus foncé 25 % » d'Office.
  const lighten = (hex, amount) => { const hsl = toHsl(hex); return fromHsl({ h: hsl.h, s: hsl.s, l: hsl.l * (1 - amount) + amount }); };
  const darken = (hex, amount) => { const hsl = toHsl(hex); return fromHsl({ h: hsl.h, s: hsl.s, l: hsl.l * (1 - amount) }); };

  // L'aspect d'une forme et d'une ligne neuves quand la présentation a un thème : le fond clair et le trait foncé du premier accent. null sans thème : la forme garde l'aspect d'avant (js/free-frame.js).
  function shapeLook(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? { fill: lighten(t.colors.accent1, LIGHT), line: darken(t.colors.accent1, DARK), lw: 1.5 } : null;
  }
  function lineLook(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? { line: darken(t.colors.accent1, DARK), lw: 3 } : null;
  }

  // --- L'éditeur ---

  const currentTheme = () => (typeof PageLayout !== 'undefined' ? PageLayout.getTheme() : null);

  // Les variables CSS d'un thème : { '--pp-theme-text': '#1b2430', … }.
  function cssVars(theme) {
    const t = normalize(theme);
    if (!t) return {};
    const vars = { '--pp-theme-text': t.colors.text, '--pp-theme-title': t.colors.title, '--pp-theme-bg': t.colors.bg, '--pp-theme-font-title': fontCss(t.fonts.title), '--pp-theme-font-body': fontCss(t.fonts.body) };
    ACCENT_SLOTS.forEach((slot) => { vars['--pp-theme-' + slot] = t.colors[slot]; });
    return vars;
  }
  // Pose (ou retire) le thème du brouillon de la page sur l'écran : appelée par PageLayout à chaque changement de page. Sans thème, ni variable ni classe : l'éditeur est celui d'avant.
  function refresh() {
    const root = document.documentElement;
    const vars = cssVars(currentTheme());
    VARS.forEach((name) => { if (vars[name]) root.style.setProperty(name, vars[name]); else root.style.removeProperty(name); });
    root.classList.toggle(CLASS, !!Object.keys(vars).length);
  }

  // La police et la couleur que le texte du curseur a PAR DÉFAUT dans une présentation themée (celles des titres dans un titre, celles du texte ailleurs) : ce que la barre d'outils montre quand aucune marque ne les change. null
  // sans thème, et en écriture d'en-tête ou de pied (css/slide-theme.css : l'écran n'y a pas le thème).
  function defaultsAt(state) {
    const t = normalize(currentTheme());
    if (!t || !document.documentElement.classList.contains(CLASS) || (typeof HeaderFooterPreview !== 'undefined' && HeaderFooterPreview.getHfMode())) return null;
    const heading = state.selection.$from.parent.type.name === 'heading';
    return { fontFamily: heading ? t.fonts.title : t.fonts.body, color: heading ? t.colors.title : t.colors.text };
  }

  // --- Les sorties ---

  // Les styles des niveaux de titre que porte le HTML (js/heading-styles.js), ceux du modèle et à défaut ceux du document : leur police et leur couleur l'emportent sur celles du thème.
  // `root` est un fragment de gabarit : `:scope` n'y désigne rien, le nœud de configuration se cherche parmi ses enfants.
  function levelStylesOf(root) {
    if (typeof HeadingStyles === 'undefined') return {};
    const config = Array.from(root.children).find(el => el.classList.contains('heading-numbering-config'));
    return HeadingStyles.effective(config ? HeadingStyles.normalize(config.getAttribute(HeadingStyles.ATTR)) : null) || {};
  }
  // Le HTML d'une présentation (celui de SlidesEntry.outputHtml) avec la police et la couleur du thème sur chaque paragraphe et chaque titre qui n'en a pas : le texte de l'éditeur, d'une liste, d'une case ou d'un cadre
  // est toujours un paragraphe ou un titre. Un bloc de code, une légende et un bloc qui porte déjà une police ou une couleur n'y sont pas touchés ; sans thème, le HTML revient tel quel.
  function forOutput(html, theme) {
    const t = normalize(theme);
    if (!html || !t) return html;
    const host = Dom.inertTemplate(html);
    applyTo(host.content, t);
    return host.innerHTML;
  }
  // La même chose sur un arbre déjà lu (un fragment de gabarit ou un `body`), que js/slides-entry.js:outputHtml enchaîne avec les autres étapes sans le sérialiser ni le relire ; `theme` est un thème
  // (il se normalise ici). Vrai quand il y a un thème à appliquer.
  function forOutputIn(root, theme) {
    const t = normalize(theme);
    if (!t) return false;
    applyTo(root, t);
    return true;
  }
  function applyTo(root, t) {
    const levels = levelStylesOf(root);
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6').forEach((block) => {
      if (block.closest('pre') || block.hasAttribute('data-caption')) return;
      const heading = /^H[1-6]$/.test(block.tagName);
      const own = (heading && levels[block.tagName.slice(1)]) || {};
      if (!block.style.fontFamily && !own.fontFamily) block.style.fontFamily = heading ? t.fonts.title : t.fonts.body;
      if (!block.style.color && !own.color) block.style.color = heading ? t.colors.title : t.colors.text;
    });
  }
  // Le fond que les SORTIES peignent sous les diapositives qui n'ont pas le leur (SlideProps.forOutput, option `background`) : le fond du thème, ou '' tant que c'est le blanc du papier - il n'y a rien à peindre,
  // et les sorties d'une présentation au fond blanc sont exactement celles d'avant. À l'écran, c'est css/slide-theme.css qui peint le même fond (la feuille de l'éditeur, les miniatures).
  function paperOf(theme) {
    const t = normalize(theme);
    return t && t.colors.bg !== DEFAULT_COLORS.bg ? t.colors.bg : '';
  }

  // --- Le décor ---

  // Le mélange de deux couleurs : `from` pour 0, `to` pour 1.
  function mix(from, to, amount) {
    const a = ColorMath.toRgb(from);
    const b = ColorMath.toRgb(to);
    return ColorMath.toHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
  }
  // La couleur du numéro et du texte de pied : celle du texte, un peu éclaircie vers le fond, tant qu'elle se lit (4,5:1, WCAG) ; à défaut, celle du texte.
  function mutedText(t) {
    const soft = mix(t.colors.text, t.colors.bg, 0.25);
    return ColorMath.contrast(soft, t.colors.bg) >= 4.5 ? soft : t.colors.text;
  }
  const DECOR_TEXT_PT = 10;           // la taille du numéro et du texte de pied (points sur une page de PAGE_BASE_PT de haut)
  const DECOR_EDGE_PT = 24;           // la marge de côté du décor, du logo, du numéro et du pied
  const DECOR_TOP_PT = 8;             // la marge du logo en haut
  const DECOR_ROW_PT = 18;            // la hauteur de la ligne du numéro et du pied
  const DECOR_FOOT_PT = 14;           // sa marge en bas
  const DECOR_GAP_PT = 8;             // l'écart entre un logo du bas et cette ligne
  // L'emplacement d'un texte de pied : sa part de la largeur utile (de la marge de gauche à celle de droite), et son alignement.
  const FOOT_SLOTS = { bl: { at: 0, share: 0.45, align: 'left' }, bc: { at: 0.275, share: 0.45, align: 'center' }, br: { at: 0.55, share: 0.45, align: 'right' } };

  // Le décor de la diapositive n° `index + 1` (index à partir de 0) en objets simples, dans le repère de la page (points, coin haut gauche), dans l'ordre où ils se peignent ; c'est de là que viennent l'éditeur
  // (le calque de la page), les sorties (des cadres libres derrière le texte), les miniatures et le masque du PowerPoint. `page` : { width, height } en points. Les mesures sont dites pour une page de 540 points
  // de haut et suivent sa hauteur (un autre rapport garde les mêmes proportions). Un objet est :
  //  - { kind: 'rect', x, y, w, h, color } : le bandeau ;
  //  - { kind: 'image', x, y, w, h, src } : le logo, à son rapport, de la hauteur de sa taille (sa largeur ne dépasse pas LOGO_MAX_WIDTH) ;
  //  - { kind: 'text', x, y, w, h, align, size, color, font, text, runs } : le numéro et le texte de pied d'un même emplacement (« texte · 3 »), `runs` : [{ text, field? }] où field vaut 'slidenum' pour le
  //    numéro (le masque du PowerPoint en fait un champ qui se met à jour).
  // Sans décor, ou sans page, il n'y a rien.
  function decorItems(theme, page, index) {
    const t = normalize(theme);
    const decor = t && t.decor;
    if (!decor || !page || !(page.width > 0) || !(page.height > 0)) return [];
    const k = page.height / PAGE_BASE_PT;
    const cut = value => Math.round(value * 100) / 100;
    const items = [];
    const inset = { left: 0, top: 0, bottom: 0 };
    if (decor.band) {
      const size = BAND_SIZES[decor.band.size] * k;
      inset[decor.band.edge] = size;
      const box = decor.band.edge === 'left' ? { x: 0, y: 0, w: size, h: page.height }
        : { x: 0, y: decor.band.edge === 'top' ? 0 : page.height - size, w: page.width, h: size };
      items.push({ kind: 'rect', x: cut(box.x), y: cut(box.y), w: cut(box.w), h: cut(box.h), color: t.colors[decor.band.color] });
    }
    // Les textes du bas : le numéro et le pied qui tombent au même emplacement ne font qu'un texte.
    const shown = !(decor.skipFirst && index === 0);
    const spots = {};
    const put = (pos, run) => { (spots[pos] = spots[pos] || []).push(run); };
    if (shown && decor.footer) put(decor.footer.pos, { text: decor.footer.text });
    if (shown && decor.number) put(decor.number.pos, { text: String(index + 1), field: 'slidenum' });
    const hasText = Object.keys(spots).length > 0;
    const row = DECOR_ROW_PT * k;
    const textY = page.height - inset.bottom - DECOR_FOOT_PT * k - row;
    if (decor.logo) {
      const fit = Math.min(LOGO_HEIGHTS[decor.logo.size] * k / decor.logo.h, LOGO_MAX_WIDTH * k / decor.logo.w);
      const w = decor.logo.w * fit;
      const h = decor.logo.h * fit;
      const edge = DECOR_EDGE_PT * k;
      const x = decor.logo.pos.charAt(1) === 'l' ? inset.left + edge : page.width - edge - w;
      // En haut, sous un bandeau du haut ; en bas, au-dessus de la ligne du numéro et du pied quand il y en a une (ils ne se recouvrent jamais), sinon au ras de la marge, au-dessus d'un bandeau du bas.
      const floor = hasText ? textY - DECOR_GAP_PT * k : page.height - inset.bottom - DECOR_FOOT_PT * k;
      const y = decor.logo.pos.charAt(0) === 't' ? inset.top + DECOR_TOP_PT * k : floor - h;
      items.push({ kind: 'image', x: cut(x), y: cut(y), w: cut(w), h: cut(h), src: decor.logo.src });
    }
    const left = inset.left + DECOR_EDGE_PT * k;
    const usable = page.width - DECOR_EDGE_PT * k - left;
    const color = mutedText(t);
    ['bl', 'bc', 'br'].forEach((pos) => {
      const runs = spots[pos];
      if (!runs) return;
      const slot = FOOT_SLOTS[pos];
      const joined = [];
      runs.forEach((run, at) => { if (at) joined.push({ text: '  ·  ' }); joined.push(run); });
      items.push({
        kind: 'text', x: cut(left + usable * slot.at), y: cut(textY), w: cut(usable * slot.share), h: cut(row), align: slot.align, size: cut(DECOR_TEXT_PT * k), color, font: t.fonts.body,
        text: joined.map(run => run.text).join(''), runs: joined,
      });
    });
    return items;
  }

  const FRAME_PAD_X_PT = 7.2;         // les marges de texte d'un cadre (css/free-frame.css) : un cadre du décor est élargi d'elles pour que son texte ou son image tombe là où decorItems le dit
  const FRAME_PAD_Y_PT = 3.6;
  const escapeText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Un objet du décor (decorItems) en cadre libre derrière le texte, tel que les sorties le lisent (FreeFrame.decorHtml). Le bandeau est un cadre plein sans texte ; le logo une image réglée par sa largeur ; le numéro
  // et le pied un paragraphe aligné, à la taille, à la couleur et à la police dites (style en ligne : le bloc n'a pas de police ou de couleur à prendre du thème).
  function frameOf(item) {
    if (item.kind === 'rect') return FreeFrame.decorHtml({ x: item.x, y: item.y, w: item.w, h: item.h, fill: item.color }, '');
    const box = { x: item.x - FRAME_PAD_X_PT, y: item.y - FRAME_PAD_Y_PT, w: item.w + 2 * FRAME_PAD_X_PT, h: item.h + 2 * FRAME_PAD_Y_PT };
    if (item.kind === 'image') {
      const width = Math.round(item.w * 96 / 72 * 100) / 100;
      return FreeFrame.decorHtml(box, '<p><img class="editor-image" src="' + item.src + '" alt="" style="width: ' + width + 'px"></p>');
    }
    const style = 'font-size: ' + item.size + 'pt; color: ' + item.color + '; font-family: ' + item.font;
    return FreeFrame.decorHtml(box, '<p style="text-align: ' + item.align + '"><span style="' + style + '">' + escapeText(item.text) + '</span></p>');
  }
  // Ce que SlideProps.forOutput (option `decor`) pose derrière chaque diapositive : une fonction qui donne le HTML des cadres du décor de la diapositive de ce rang (à partir de 0), ou null quand le thème n'a pas de décor
  // ou que la page est inconnue : les sorties sont alors celles d'avant. `page` : { width, height } en points, celle de CETTE présentation (la page du modèle ouvert quand elle n'est pas dite).
  function decorHtmlFor(theme, page) {
    const t = normalize(theme);
    if (!t || !t.decor) return null;
    const size = page || (typeof PageLayout !== 'undefined' ? PageLayout.getPageSizePt() : null);
    return rank => decorItems(t, size, rank).map(frameOf).join('');
  }

  const TEXT_LINE = '1.49';           // l'interligne d'un paragraphe de la Lecture et du diaporama : le texte du décor de l'éditeur tombe à la même hauteur que le leur
  // Le décor d'une diapositive en éléments de l'écran (l'éditeur, les miniatures, l'aperçu de la fenêtre « Thème… ») : une enveloppe sans hauteur qui porte une boîte de la taille de la page (celle que le CSS pose au coin de
  // la page, css/slide-theme.css), où chaque objet de decorItems est posé à sa place, `unit` pixels par point. Ni clic ni sélection n'y passent.
  function decorElement(items, unit) {
    const wrap = document.createElement('div');
    wrap.className = 'pp-slide-decor';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.contentEditable = 'false';
    const box = document.createElement('div');
    box.className = 'pp-slide-decor-page';
    const px = value => (Math.round(value * unit * 100) / 100) + 'px';
    items.forEach((item) => {
      let el;
      if (item.kind === 'rect') {
        el = document.createElement('i');
        el.className = 'pp-slide-decor-band';
        el.style.background = item.color;
      } else if (item.kind === 'image') {
        el = document.createElement('img');
        el.className = 'pp-slide-decor-logo';
        el.alt = '';
        el.draggable = false;
        el.src = item.src;
      } else {
        el = document.createElement('span');
        el.className = 'pp-slide-decor-text';
        el.textContent = item.text;
        el.style.fontSize = px(item.size);
        el.style.lineHeight = TEXT_LINE;
        el.style.color = item.color;
        el.style.fontFamily = fontCss(item.font);
        el.style.textAlign = item.align;
      }
      el.style.left = px(item.x);
      el.style.top = px(item.y);
      el.style.width = px(item.w);
      el.style.height = px(item.h);
      box.append(el);
    });
    wrap.append(box);
    return wrap;
  }

  // Le thème de la page pour le décor, normalisé une fois tant que c'est le même objet (PageLayout.getTheme rend celui de la page jusqu'à ce qu'il change) : { normalized, hash }, `hash` vide quand il n'a pas de décor.
  const hashOf = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  let kept = { raw: null, normalized: null, hash: '' };
  function decorState() {
    const raw = currentTheme();
    if (raw !== kept.raw) {
      const normalized = normalize(raw);
      kept = { raw, normalized, hash: normalized && normalized.decor ? hashOf(JSON.stringify([normalized.decor, normalized.colors, normalized.fonts.body])) : '' };
    }
    return kept;
  }
  const pageKey = page => Math.round(page.width * 10) + 'x' + Math.round(page.height * 10);
  // Le décor de la diapositive de ce rang (à partir de 0) pour l'écran de la présentation ouverte, avec la page du modèle : son élément (decorElement, en pixels de mise en page), ou null sans décor ; et sa CLÉ, qui change
  // avec le décor, les couleurs, la police, la page et le rang, '' sans décor (la miniature d'une diapositive se refait quand sa clé change).
  function decorKey(rank) {
    const state = decorState();
    return state.hash ? state.hash + ':' + pageKey(PageLayout.getPageSizePt()) + ':' + rank : '';
  }
  function decorElementFor(rank) {
    const state = decorState();
    if (!state.hash) return null;
    const items = decorItems(state.normalized, PageLayout.getPageSizePt(), rank);
    return items.length ? decorElement(items, PageLayer.PT_TO_PX) : null;
  }

  // L'ÉDITEUR : le décor de chaque diapositive est une décoration (un élément que ProseMirror pose entre les blocs, jamais dans le texte : ni enregistré, ni annulable, ni sélectionnable) posée au début de la diapositive,
  // juste après son repère s'il en a un (le fond propre de la diapositive est donc dessous), et avant ses cadres libres (qui sont dessus) : l'ordre de peinture est celui des sorties. Elle n'existe que dans une présentation
  // dont le thème a un décor et que l'écran montre comme des pages (css/slide-theme.css) ; un document ou une présentation sans décor n'a aucun élément de plus. Le thème, la page ou le texte qui changent la refont ; la
  // transaction vide qui la relit porte DECOR_META (la bande des diapositives refait alors ses miniatures).
  const DECOR_META = 'slideThemeDecor';
  function createExtension(Extension, deps) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = deps;
    const key = new PluginKey(DECOR_META);
    return Extension.create({
      name: 'slideThemeDecor',
      addProseMirrorPlugins() {
        let built = { doc: null, hash: '', set: null };
        return [new Plugin({
          key,
          props: {
            decorations(state) {
              const now = decorState();
              if (!now.hash || typeof SlidesEntry === 'undefined' || !SlidesEntry.presentationShown() || HeaderFooterPreview.getHfMode()) return null;
              const page = PageLayout.getPageSizePt();
              const hash = now.hash + ':' + pageKey(page);
              if (built.doc === state.doc && built.hash === hash) return built.set;
              const widgets = SlideProps.slidesOf(state.doc).map((slide, rank) => {
                const first = slide.markers[0];
                const pos = first && first.pos === slide.start ? first.pos + first.node.nodeSize : slide.start;
                const items = decorItems(now.normalized, page, rank);
                return Decoration.widget(pos, () => decorElement(items, PageLayer.PT_TO_PX), { side: -1, key: 'decor:' + hash + ':' + rank, ignoreSelection: true });
              });
              built = { doc: state.doc, hash, set: DecorationSet.create(state.doc, widgets) };
              return built.set;
            },
          },
          view(editorView) {
            // Un changement de thème ou de page ne passe pas par une transaction : l'éditeur relit ses décorations à la première qui vient, celle-ci est vide et ne se range pas dans l'historique.
            const redraw = () => { if (!editorView.isDestroyed) editorView.dispatch(editorView.state.tr.setMeta('addToHistory', false).setMeta(DECOR_META, true)); };
            document.addEventListener('pp:themeChanged', redraw);
            document.addEventListener('pp:marginsChanged', redraw);
            return { destroy() { document.removeEventListener('pp:themeChanged', redraw); document.removeEventListener('pp:marginsChanged', redraw); } };
          },
        })];
      },
    });
  }

  // --- Les menus de couleur ---

  // Les couleurs du thème pour la rangée « Couleurs du thème » : [{ slot, color }] dans l'ordre de COLOR_SLOTS ; vide sans thème.
  function paletteOf(theme) {
    const t = normalize(theme === undefined ? currentTheme() : theme);
    return t ? COLOR_SLOTS.map(slot => ({ slot, color: t.colors[slot] })) : [];
  }

  // --- Le changement de thème ---

  // Les nœuds et les marques où une couleur se garde, par le nom de leur type : les attributs qui portent un #rrggbb (ou, pour une bordure, un texte qui en contient un).
  const NODE_COLOR_ATTRS = {
    listItem: ['bulletColor'], tableHeader: ['backgroundColor', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'], tableCell: ['backgroundColor', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'],
    callout: ['color'], freeFrame: ['fill', 'line'], freeLine: ['fill', 'line'], slideProps: ['bg'],
  };
  const MARK_COLOR_ATTRS = { textStyle: ['color', 'backgroundColor'] };

  // La table des couleurs que le passage de `from` à `to` remplace : { ancienne: nouvelle } pour chaque réglage qui change, avec ses deux nuances (celles d'une forme neuve). Quand deux réglages de l'ancien thème
  // ont la même couleur (le texte et les titres), la première des deux dans `order` l'emporte : le texte d'un titre y prend d'abord celle des titres.
  function colorTable(from, to, order) {
    const a = normalize(from) || original();
    const b = normalize(to) || original();
    const table = new Map();
    const add = (before, after) => { if (before !== after && !table.has(before)) table.set(before, after); };
    order.forEach((slot) => {
      add(a.colors[slot], b.colors[slot]);
      if (slot.indexOf('accent') === 0) {
        add(lighten(a.colors[slot], LIGHT), lighten(b.colors[slot], LIGHT));
        add(darken(a.colors[slot], DARK), darken(b.colors[slot], DARK));
      }
    });
    return table;
  }
  // Une couleur de la table peut se garder sous deux formes : « #rrggbb » (le sélecteur de couleur) ou « rgb(r, g, b) » (ce que le navigateur relit d'un style en ligne quand le document est rechargé). Une
  // couleur avec opacité (« rgba(…) ») n'est jamais une couleur du thème : elle ne bouge pas.
  const COLOR_TOKEN = /#[0-9a-f]{6}\b|rgb\(\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*[, ]\s*\d{1,3}\s*\)/gi;
  const lookup = (found, table) => table.get(ColorMath.parseCss(found)) || found;
  // Une valeur de couleur remplacée d'après la table : un #rrggbb, un rgb(r, g, b), ou un texte qui en contient (« 1px solid #cccccc »). La même valeur quand rien ne change ; la valeur remplacée est un #rrggbb.
  function remapValue(value, table) {
    if (typeof value !== 'string' || !value) return value;
    return value.replace(COLOR_TOKEN, found => lookup(found, table));
  }

  // Dans la transaction `tr`, remplace les couleurs de l'ancien thème `from` par celles du nouveau `to` (null : l'aspect d'origine). Aucune position ne bouge : `tr` peut recevoir d'autres pas autour. Rend le nombre
  // de réglages changés.
  function remap(tr, from, to) {
    const slots = COLOR_SLOTS.slice();
    const body = colorTable(from, to, ['text', 'title'].concat(slots.filter(slot => slot !== 'text' && slot !== 'title')));
    const head = colorTable(from, to, ['title', 'text'].concat(slots.filter(slot => slot !== 'text' && slot !== 'title')));
    if (!body.size && !head.size) return 0;
    const schema = tr.doc.type.schema;
    let changes = 0;
    tr.doc.descendants((node, pos, parent) => {
      const table = parent && parent.type.name === 'heading' ? head : body;
      const attrNames = NODE_COLOR_ATTRS[node.type.name];
      if (attrNames) {
        let attrs = null;
        attrNames.forEach((name) => {
          const next = remapValue(node.attrs[name], body);
          if (next !== node.attrs[name]) { attrs = attrs || Object.assign({}, node.attrs); attrs[name] = next; }
        });
        if (attrs) { tr.setNodeMarkup(pos, undefined, attrs, node.marks); changes += 1; }
      }
      if (!node.isInline) return true;
      node.marks.forEach((mark) => {
        const names = MARK_COLOR_ATTRS[mark.type.name];
        if (!names) return;
        let attrs = null;
        names.forEach((name) => {
          const next = remapValue(mark.attrs[name], table);
          if (next !== mark.attrs[name]) { attrs = attrs || Object.assign({}, mark.attrs); attrs[name] = next; }
        });
        if (!attrs) return;
        tr.removeMark(pos, pos + node.nodeSize, mark);
        tr.addMark(pos, pos + node.nodeSize, schema.marks[mark.type.name].create(attrs));
        changes += 1;
      });
      return true;
    });
    return changes;
  }

  return {
    VERSION, NAME_MAX, COLOR_SLOTS, ACCENT_SLOTS, FONTS, DEFAULT_COLORS, DEFAULT_FONTS, CLASS, VARS,
    BAND_EDGES, BAND_SIZES, BAND_COLORS, CORNERS, LOGO_HEIGHTS, LOGO_MAX_WIDTH, FOOT_SPOTS, FOOTER_MAX, LOGO_SRC_MAX, PAGE_BASE_PT,
    normalize, normalizeDecor, equals, displayName, original, fontOf, fontCss, lighten, darken, shapeLook, lineLook, cssVars, refresh, defaultsAt, forOutput, forOutputIn, paperOf, paletteOf, remap, colorTable, DECOR_META, decorItems, decorHtmlFor, decorElement, decorElementFor, decorKey, createExtension, mutedText,
  };
})();
