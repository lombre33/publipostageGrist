// Fenêtre des nouveautés : ce que la version change, en images (demande du 21/10 : une fenêtre qui décrit les nouveautés, avec de vraies captures, claire, impactante, qui donne envie).
// Deux fenêtres sur la base commune (js/modal-base.js), faites du même moule (`createPager` : le titre, l'écran affiché, les points, « Fermer », « Précédent », « Suivant ») :
//  - le carrousel : un écran par nouveauté (un bandeau de capture réelle, un titre, deux lignes), puis deux écrans « avant → après » pour les modèles venus de la bêta ;
//  - « Exporter, en détail » : cinq écrans de captures annotées (le type d'export, les trois qualités de PDF, les lignes à exporter, plusieurs pages sur une feuille, le PDF protégé),
//    ouverts par « Voir en détail » sur le dernier écran du carrousel, au-dessus de lui.
// Réglages > Crédits > « Voir les nouveautés » l'ouvre (`open`), quand on veut. Elle s'ouvre aussi toute seule, UNE fois par personne : à la première ouverture après une version qui a des nouveautés (`openOnFirstConnection`,
// appelée par js/main.js à la fin du démarrage puis à chaque changement de droits), pour qui écrit seulement - ni lecture seule, ni Lecture épurée, ni carte de l'accès, ni `?dev`, ni sous une autre fenêtre. La personne la ferme (« Fermer », Échap, le
// dernier écran) et elle ne revient plus avant la prochaine version qui en a : la dernière version fermée est la clé `pp_news_seen` de PersonStore (js/person-store.js : chez GFS l'espace que GFS garde pour l'app, donc pour
// ce navigateur ; seule, le navigateur). Ouvrir par Réglages > Crédits et fermer compte aussi. Les images sont dans img/news/<version>/ (captures du vrai widget prises avec le faux Grist
// de dev-tests/, claires dans les deux thèmes), une par langue ; les textes sont dans js/i18n.js (clés `news.*`) et se lisent sans les images. Quand les images changent, IMAGE_VERSION monte.
const WhatsNew = (function () {
  const el = Dom.el;

  const VERSION = '1.0';                  // la version dont la fenêtre dit les nouveautés
  const SEEN_KEY = 'pp_news_seen';        // ce que PersonStore garde de la personne : la dernière version dont elle a fermé la fenêtre (« 1.0 »)
  const IMAGE_DIR = 'img/news/1.0/';
  const IMAGE_VERSION = '1';              // le `?v=` des images : une capture refaite le fait monter, sinon le navigateur garde l'ancienne
  const CHANGELOG = 'https://github.com/grist-factory/Publipostage-Plus/blob/main/CHANGELOG.md';
  const NBSP = ' ';

  // Les écrans du carrousel, dans l'ordre. `image` : le bandeau (IMAGE_DIR/<image>-<langue>.webp) ; `gfs` : la nouveauté n'existe que par Grist Factory Suite (l'étiquette le dit).
  // Un écran « avant → après » (`rows`) donne, pour chaque ligne, les clés de ses textes : `from` (avant), `to` (après), `note` (la suite de « après ») ou `detail` (un bouton qui ouvre
  // « Exporter, en détail ») ; `from` et `to` de l'écran règlent la part de largeur de ses deux colonnes de texte.
  const SLIDES = [
    { image: 'loop', name: 'news.loop.name', text: 'news.loop.text', alt: 'news.loop.alt' },
    { image: 'versions', name: 'news.versions.name', text: 'news.versions.text', alt: 'news.versions.alt' },
    { image: 'gallery', name: 'news.gallery.name', text: 'news.gallery.text', alt: 'news.gallery.alt' },
    { image: 'bookmarks', name: 'news.bookmarks.name', text: 'news.bookmarks.text', alt: 'news.bookmarks.alt' },
    { image: 'live', gfs: true, name: 'news.live.name', text: 'news.live.text', alt: 'news.live.alt' },
    { image: 'slides', gfs: true, name: 'news.slides.name', text: 'news.slides.text', alt: 'news.slides.alt' },
    { image: 'chart', gfs: true, name: 'news.chart.name', text: 'news.chart.text', alt: 'news.chart.alt' },
    {
      name: 'news.beta.name', lead: 'news.beta.lead', from: '1fr', to: '1.3fr', rows: [
        { from: 'news.beta.email.from', to: 'news.beta.email.to', note: 'news.beta.email.note' },
        { from: 'news.beta.rule.from', to: 'news.beta.rule.to', note: 'news.beta.rule.note' },
        { from: 'news.beta.paragraph.from', to: 'news.beta.paragraph.to', note: 'news.beta.paragraph.note' },
        { from: 'news.beta.toc.from', to: 'news.beta.toc.to', note: 'news.beta.toc.note' },
      ],
    },
    {
      name: 'news.habits.name', from: '0.95fr', to: '1.35fr', rows: [
        { from: 'news.habits.quality.from', to: 'news.habits.quality.to', detail: 'news.habits.quality.link' },
        { from: 'news.habits.track.from', to: 'news.habits.track.to' },
        { from: 'news.habits.enter.from', to: 'news.habits.enter.to', note: 'news.habits.enter.note' },
        { from: 'news.habits.blank.from', to: 'news.habits.blank.to' },
      ], more: { text: 'news.habits.more', link: 'news.habits.changelog' },
    },
  ];

  // Les captures de « Exporter, en détail » : leur taille en pixels CSS (la moitié de celle du fichier : prises en échelle 2) et, pour celles qui en portent, les repères où poser une pastille
  // (le centre de la pastille, en pixels CSS de la capture à sa taille d'origine). Seul le menu Exporter change de largeur avec la langue (il s'élargit avec ses libellés).
  const SHOTS = {
    types: { w: 178, h: 239, at: { xlsx: [159, 120] } },
    'quality-native': { w: 178, h: 110 },
    'quality-browser': { w: 178, h: 110 },
    'quality-light': { w: 178, h: 110 },
    buttons: { w: 139, h: 42, at: { typeBtn: [15, 10], exportBtn: [78, 10] } },
    exporter: {
      fr: { w: 229, h: 200, at: { checked: [18.8, 120.5], exportBtn: [130, 10] } },
      en: { w: 189.5, h: 200, at: { checked: [18.8, 120.5], exportBtn: [77.5, 10] } },
    },
    'sheets-preview': { w: 120, h: 118 },
    'dialog-sheets': { w: 620, h: 372 },
    'dialog-protected': { w: 480, h: 376 },
  };

  const lang = () => I18n.getLang();
  const t = key => I18n.t(key);
  const sizeOf = name => SHOTS[name][lang()] || SHOTS[name];
  const clamp = (i, count) => Math.min(Math.max(i, 0), count - 1);
  // L'espace avant les deux-points : insécable en français, aucun en anglais.
  const colonGap = () => (lang() === 'en' ? '' : NBSP);

  // Une fenêtre à écrans : `names` (une clé de texte par écran, lue par les points), `draw(index)` rend le contenu de l'écran, `preload(index)` annonce l'écran qui vient (facultatif).
  // Les points forment une liste d'onglets à un seul arrêt de Tab (celui de l'écran affiché) ; les flèches, Début et Fin passent de l'un à l'autre. Au dernier écran « Fermer » devient le bouton
  // principal, à la place de « Suivant ». `onClose` (facultatif) : rappelé quand la fenêtre se ferme. Rend `open(start)`, `isOpen()` et la fenêtre.
  function createPager({ id, titleId, title, names, draw, preload, onClose }) {
    const win = ModalBase.create({ id, titleId, size: 'md', boxClass: 'pp-news-box', actionsClass: 'var-modal-actions' });
    win.title.textContent = title;
    // Toutes les sorties (« Fermer », Échap, le code) passent par `win.hide` : `onClose` est rappelé une fois par fermeture.
    if (onClose) {
      const hide = win.hide;
      win.hide = () => { const was = win.isOpen(); hide(); if (was) onClose(); };
    }
    let index = 0;
    let placedLast = null;   // l'ordre des boutons posé : celui du dernier écran, ou des autres
    const pane = el('div');
    pane.id = id + '-pane';
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-live', 'polite');
    win.body.append(pane);

    const tabs = el('div', 'pp-news-dots');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-labelledby', titleId);
    const dots = names.map((name, i) => {
      const dot = Dom.button('pp-news-dot');
      dot.id = id + '-tab-' + i;
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-controls', pane.id);
      dot.setAttribute('aria-label', I18n.t('news.dotLabel', { n: i + 1, total: names.length, name: t(name) }));
      dot.addEventListener('click', () => go(i));
      tabs.append(dot);
      return dot;
    });
    const close = Dom.button(null, t('common.close'));
    const prev = Dom.button(null, t('news.prev'));
    const next = Dom.button('var-modal-primary', t('news.next'));
    const spacer = el('span', 'var-modal-spacer');
    win.actions.append(tabs, spacer, close, prev, next);
    close.addEventListener('click', () => win.hide());
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    tabs.addEventListener('keydown', (event) => {
      const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: names.length - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      go(to);
      dots[index].focus();
    });

    function go(i) {
      index = clamp(i, names.length);
      const focused = document.activeElement;
      pane.replaceChildren(draw(index));
      pane.setAttribute('aria-labelledby', dots[index].id);
      dots.forEach((dot, n) => { dot.setAttribute('aria-selected', String(n === index)); dot.tabIndex = n === index ? 0 : -1; });
      const last = index === names.length - 1;
      prev.hidden = index === 0;
      next.hidden = last;
      close.classList.toggle('var-modal-primary', last);
      // L'ordre du DOM suit l'ordre à l'écran (Tab) : « Fermer, Précédent, Suivant », puis « Précédent, Fermer » au dernier écran. Remettre un bouton dans la fenêtre lui fait perdre le focus.
      if (last !== placedLast) {
        placedLast = last;
        win.actions.append(tabs, spacer, ...(last ? [prev, close] : [close, prev, next]));
      }
      // Le focus reste sur le bouton qui l'avait ; un bouton qui disparaît (« Précédent » au premier écran, « Suivant » au dernier) le passe au bouton principal.
      if (win.box.contains(focused)) {
        const target = focused.hidden ? (last ? close : next) : focused;
        if (document.activeElement !== target) target.focus();
      }
      if (preload) preload(index + 1);
    }

    return {
      win,
      isOpen: () => win.isOpen(),
      open(start) {
        go(start || 0);
        win.show(next.hidden ? close : next);
      },
    };
  }

  // Un texte où **le gras** s'écrit entre doubles astérisques : posé dans des nœuds, jamais en HTML.
  function rich(node, text) {
    text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith('**')) node.append(el('b', null, part.slice(2, -2)));
      else node.append(part);
    });
    return node;
  }

  // ---- Le carrousel ----

  let carousel = null;
  const heroUrl = slide => IMAGE_DIR + slide.image + '-' + lang() + '.webp?v=' + IMAGE_VERSION;

  function drawFeature(slide) {
    const box = el('div', 'pp-news-slide');
    const figure = el('figure', 'pp-news-hero');
    const img = el('img');
    img.src = heroUrl(slide);
    img.alt = t(slide.alt);
    img.width = 1200;
    img.height = 400;
    // Une image qui ne vient pas (réseau coupé) laisse le titre et le texte, qui se lisent sans elle.
    img.addEventListener('error', () => { figure.hidden = true; });
    figure.append(img);
    const name = el('h4', 'pp-news-name', t(slide.name));
    if (slide.gfs) name.append(el('span', 'pp-news-badge', t('news.gfs')));
    box.append(figure, name, el('p', 'pp-news-text', t(slide.text)));
    return box;
  }

  function drawBeforeAfter(slide) {
    const box = el('div', 'pp-news-slide pp-news-list');
    box.style.setProperty('--pp-news-from', slide.from);
    box.style.setProperty('--pp-news-to', slide.to);
    box.append(el('h4', 'pp-news-name', t(slide.name)));
    if (slide.lead) box.append(el('p', 'pp-news-lead', t(slide.lead)));
    const rows = el('ul', 'pp-news-rows');
    slide.rows.forEach((row) => {
      const to = el('span', 'pp-news-row-to', t(row.to));
      if (row.detail) {
        const detail = Dom.button('pp-news-link', t(row.detail));
        detail.addEventListener('click', () => openExport());
        to.append(' ', el('span', null, '· '), detail);
      } else if (row.note) {
        to.append(' ', el('span', null, t(row.note)));
      }
      const item = el('li', 'pp-news-row');
      item.append(el('span', 'pp-news-row-from', t(row.from)), el('span', 'pp-news-row-arrow', '→'), to);
      rows.append(item);
    });
    box.append(rows);
    if (slide.more) {
      const link = el('a', null, t(slide.more.link));
      link.href = CHANGELOG;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const more = el('p', 'pp-news-text');
      more.append(t(slide.more.text) + ' ', link);
      box.append(more);
    }
    return box;
  }

  function ensureCarousel() {
    if (carousel) return carousel;
    carousel = createPager({
      id: 'pp-news-modal', titleId: 'pp-news-title', title: I18n.t('news.title', { version: VERSION }),
      names: SLIDES.map(slide => slide.name),
      draw: index => (SLIDES[index].rows ? drawBeforeAfter(SLIDES[index]) : drawFeature(SLIDES[index])),
      // L'écran qui vient est demandé d'avance : il s'affiche d'un coup au clic sur « Suivant ».
      preload(index) { const slide = SLIDES[index]; if (slide && slide.image) new Image().src = heroUrl(slide); },
      onClose: noteSeen,
    });
    return carousel;
  }

  // ---- « Exporter, en détail » ----

  let detail = null;

  // Une capture dans son cadre. `scale` la réduit (les pastilles suivent) ; `badges` : [numéro, repère], le repère étant un nom de SHOTS[...].at ou [x, y] en pixels de la capture à sa taille
  // d'origine ; `cut` : « top » ou « bottom », le bord qui se fond quand la capture n'est qu'un morceau de menu ; `menu` : un menu ouvert, sans cadre.
  function shot(name, { scale = 1, badges = [], cut = '', menu = false, alt = '' } = {}) {
    const size = sizeOf(name);
    const w = Math.round(size.w * scale);
    const h = Math.round(size.h * scale);
    const figure = el('figure', 'pp-news-exp-shot' + (menu ? ' pp-news-exp-menu' : '') + (cut ? ' pp-news-exp-cut-' + cut : ''));
    figure.style.width = w + 'px';
    figure.style.height = h + 'px';
    const img = el('img');
    img.src = IMAGE_DIR + 'export/' + name + '-' + lang() + '.webp?v=' + IMAGE_VERSION;
    img.width = w;
    img.height = h;
    img.alt = alt;
    figure.append(img);
    badges.forEach(([n, at]) => {
      const [x, y] = typeof at === 'string' ? size.at[at] : at;
      const badge = el('span', 'pp-news-exp-badge', String(n));
      badge.setAttribute('aria-hidden', 'true');
      badge.style.left = x * scale + 'px';
      badge.style.top = y * scale + 'px';
      figure.append(badge);
    });
    return figure;
  }

  // La légende numérotée : [numéro, clé du mot en gras (ou null), clé du texte]. Un texte qui commence par « : » suit le mot en gras sans espace ordinaire.
  function legend(items) {
    const list = el('ul', 'pp-news-exp-legend');
    items.forEach(([n, nameKey, textKey]) => {
      const item = el('li');
      item.append(el('span', 'pp-news-exp-badge', String(n)));
      const body = el('span');
      const text = t(textKey);
      if (nameKey) body.append(el('b', null, t(nameKey)), /^:/.test(text) ? colonGap() : ' ');
      item.append(rich(body, text));
      list.append(item);
    });
    return list;
  }

  const exportSlide = title => {
    const box = el('div', 'pp-news-exp-slide');
    box.append(el('h4', 'pp-news-name', t(title)));
    return box;
  };

  function drawTypes() {
    const box = exportSlide('news.export.types.name');
    const cols = el('div', 'pp-news-exp-cols');
    cols.style.gridTemplateColumns = sizeOf('types').w + 'px minmax(0, 1fr)';
    cols.style.gap = '20px';
    const buttons = shot('buttons', { scale: 1.4, badges: [[1, 'typeBtn'], [2, 'exportBtn']], alt: t('news.export.types.altButtons') });
    buttons.style.marginBottom = '12px';
    const side = el('div');
    side.append(buttons, legend([
      [1, 'news.export.types.typeButton', 'news.export.types.typeButtonText'],
      [2, 'news.export.types.exportButton', 'news.export.types.exportButtonText'],
      [3, null, 'news.export.types.greyed'],
    ]), el('p', 'pp-news-exp-foot', t('news.export.types.foot')));
    cols.append(shot('types', { menu: true, cut: 'bottom', badges: [[3, 'xlsx']], alt: t('news.export.types.altMenu') }), side);
    box.append(cols);
    return box;
  }

  function drawQualities() {
    const box = exportSlide('news.export.qualities.name');
    const cols = el('div', 'pp-news-exp-cols pp-news-exp-three');
    [
      ['quality-native', 'news.export.qualities.altNative', 'news.export.qualities.native', 'news.export.qualities.nativeText'],
      ['quality-browser', 'news.export.qualities.altBrowser', 'news.export.qualities.browser', 'news.export.qualities.browserText'],
      ['quality-light', 'news.export.qualities.altLight', 'news.export.qualities.light', 'news.export.qualities.lightText'],
    ].forEach(([name, alt, title, text]) => {
      const caption = el('p', 'pp-news-exp-cap');
      caption.append(el('b', null, t(title)), t(text));
      const col = el('div');
      col.append(shot(name, { menu: true, cut: 'top', alt: t(alt) }), caption);
      cols.append(col);
    });
    box.append(cols, el('p', 'pp-news-exp-foot', t('news.export.qualities.foot')));
    return box;
  }

  function drawLines() {
    const box = exportSlide('news.export.lines.name');
    const cols = el('div', 'pp-news-exp-cols');
    cols.style.gridTemplateColumns = (sizeOf('exporter').w + 2) + 'px minmax(0, 1fr)';
    const options = el('div', 'pp-news-exp-options');
    [
      ['news.export.lines.one', 'news.export.lines.oneText'],
      ['news.export.lines.zip', 'news.export.lines.zipText'],
      ['news.export.lines.merged', 'news.export.lines.mergedText'],
      ['news.export.lines.sheets', 'news.export.lines.sheetsText'],
    ].forEach(([title, text]) => {
      const row = el('span');
      row.append(el('b', null, t(title)), colonGap() + ': ' + t(text));
      options.append(row);
    });
    const side = el('div');
    side.append(legend([
      [1, null, 'news.export.lines.tick'],
      [2, 'news.export.lines.exportButton', 'news.export.lines.exportButtonText'],
    ]), options, el('p', 'pp-news-exp-foot', t('news.export.lines.foot')));
    cols.append(shot('exporter', { badges: [[1, 'checked'], [2, 'exportBtn']], alt: t('news.export.lines.alt') }), side);
    box.append(cols);
    return box;
  }

  function drawSheets() {
    const box = exportSlide('news.export.sheets.name');
    const cols = el('div', 'pp-news-exp-cols');
    const scale = 0.52;
    cols.style.gridTemplateColumns = Math.round(sizeOf('dialog-sheets').w * scale + 2) + 'px minmax(0, 1fr)';
    const preview = shot('sheets-preview', { scale: 1.45, alt: t('news.export.sheets.altPreview') });
    preview.style.margin = '0 auto';
    const side = el('div');
    side.style.textAlign = 'center';
    side.append(preview);
    const text = el('p', 'pp-news-exp-foot', t('news.export.sheets.text'));
    text.style.textAlign = 'left';
    text.style.marginTop = '8px';
    cols.append(shot('dialog-sheets', { scale, alt: t('news.export.sheets.altDialog') }), side);
    box.append(cols, text);
    return box;
  }

  function drawProtected() {
    const box = exportSlide('news.export.protected.name');
    const cols = el('div', 'pp-news-exp-cols');
    const scale = 0.62;
    cols.style.gridTemplateColumns = Math.round(sizeOf('dialog-protected').w * scale + 2) + 'px minmax(0, 1fr)';
    const side = el('div');
    side.append(legend([
      [1, 'news.export.protected.password', 'news.export.protected.passwordText'],
      [2, 'news.export.protected.permissions', 'news.export.protected.permissionsText'],
      [3, 'news.export.protected.encrypted', 'news.export.protected.encryptedText'],
    ]), el('p', 'pp-news-exp-foot', t('news.export.protected.foot')));
    cols.append(shot('dialog-protected', { scale, badges: [[1, [446, 85]], [2, [462, 242]], [3, [152, 27]]], alt: t('news.export.protected.alt') }), side);
    box.append(cols);
    return box;
  }

  // Les cinq écrans, dans l'ordre : le nom (la clé que lisent les points) et ce qui les dessine.
  const EXPORT_SLIDES = [
    { name: 'news.export.types.name', draw: drawTypes },
    { name: 'news.export.qualities.name', draw: drawQualities },
    { name: 'news.export.lines.name', draw: drawLines },
    { name: 'news.export.sheets.name', draw: drawSheets },
    { name: 'news.export.protected.name', draw: drawProtected },
  ];

  function ensureDetail() {
    if (detail) return detail;
    detail = createPager({
      id: 'pp-export-news-modal', titleId: 'pp-export-news-title', title: t('news.export.title'),
      names: EXPORT_SLIDES.map(slide => slide.name),
      draw: index => EXPORT_SLIDES[index].draw(),
    });
    return detail;
  }

  // ---- Ce que le reste du widget appelle ----

  // Ouvre le carrousel sur l'écran `start` (le premier par défaut).
  function open(start) { ensureCarousel().open(start); }
  // Ouvre « Exporter, en détail » sur l'écran `start`, par-dessus le carrousel s'il est ouvert.
  function openExport(start) { ensureDetail().open(start); }
  // Vrai tant qu'une des deux fenêtres est ouverte.
  function isOpen() { return !!((carousel && carousel.isOpen()) || (detail && detail.isOpen())); }

  // ---- L'ouverture toute seule, une fois par personne ----

  // « 1.0 » -> [1, 0], « 1.2.3 » -> [1, 2, 3] ; null quand le texte n'est pas une version.
  const versionOf = text => (typeof text === 'string' && /^\d{1,4}(?:\.\d{1,4}){0,2}$/.test(text) ? text.split('.').map(Number) : null);

  // La dernière version fermée par la personne (`seen` : le texte gardé, null quand rien n'est gardé) est-elle plus ancienne que celle de la fenêtre ? Un texte qui n'est pas une version ne compte pas : la
  // fenêtre s'ouvre. Une version plus récente que la nôtre (un document ouvert avec une app plus neuve) la laisse fermée.
  function isUnseen(seen, version = VERSION) {
    const kept = versionOf(seen);
    if (!kept) return true;
    const shown = versionOf(version);
    for (let i = 0; i < Math.max(kept.length, shown.length); i += 1) {
      const a = kept[i] || 0;
      const b = shown[i] || 0;
      if (a !== b) return a < b;
    }
    return false;
  }

  // La personne ferme le carrousel : elle l'a vu, il ne revient plus tout seul avant la prochaine version qui en a. Jamais une version plus ancienne que celle déjà gardée.
  function noteSeen() {
    if (isUnseen(PersonStore.get(SEEN_KEY))) PersonStore.set(SEEN_KEY, VERSION);
  }

  const windowOpen = () => Array.from(document.querySelectorAll('.pp-modal')).some(m => m.isConnected && getComputedStyle(m).display !== 'none');
  const devMode = () => { try { return new URLSearchParams(window.location.search).has('dev'); } catch (e) { return false; } };

  // Faut-il l'ouvrir toute seule ? `state` : seen (le texte gardé, ou null), answered (les droits de la personne sont confirmés : ni attente, ni table des droits illisible - elle démarre verrouillée par
  // précaution et ne doit pas être prise pour une personne en lecture seule sur cette foi), readOnly, usable (le widget est devant la personne : ni la Lecture épurée, ni la carte de l'accès qui demande
  // l'accès complet), windowOpen (une autre fenêtre est ouverte) et dev (`?dev` dans l'adresse : le widget se développe, il n'y a personne à accueillir).
  function wouldOpenAlone(state) {
    return !!state && !state.dev && !!state.answered && !state.readOnly && !!state.usable && !state.windowOpen && isUnseen(state.seen);
  }

  let offered = false;   // elle s'est déjà ouverte toute seule dans cette séance : une fois suffit, même si la mémoire n'a pas pu le retenir
  // Appelée à la fin du démarrage puis à chaque changement de droits (js/main.js : `access()` rend { answered, readOnly, usable } à l'instant où on le demande) : ne fait rien tant qu'une condition manque,
  // et rien de plus une fois ouverte. Rend vrai quand elle s'ouvre.
  async function openOnFirstConnection(access) {
    if (offered) return false;
    await PersonStore.ready;      // chez GFS, ce que la personne a gardé n'est lu qu'à l'arrivée du contexte
    if (offered) return false;    // un autre appel est passé pendant l'attente
    const seen = PersonStore.get(SEEN_KEY);
    if (!wouldOpenAlone(Object.assign({ seen, windowOpen: windowOpen(), dev: devMode() }, access()))) return false;
    // Une mémoire qui ne retient rien (navigation privée, stockage tiers bloqué, GFS sans espace pour l'app) la rouvrirait à chaque chargement : elle doit d'abord retenir (« 0 » : aucune version vue), sinon la fenêtre
    // ne s'ouvre pas toute seule - « Voir les nouveautés » de Réglages > Crédits reste là.
    if (!PersonStore.set(SEEN_KEY, seen === null ? '0' : seen)) return false;
    offered = true;
    open();
    return true;
  }

  return { VERSION, SEEN_KEY, SLIDE_COUNT: SLIDES.length, EXPORT_SLIDE_COUNT: EXPORT_SLIDES.length, open, openExport, isOpen, isUnseen, wouldOpenAlone, openOnFirstConnection };
})();
