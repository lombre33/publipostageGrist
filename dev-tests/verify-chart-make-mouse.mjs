#!/usr/bin/env node
// « Créer un graphique… » (lots 1, 2 et 6 du module de graphiques ; extensions/graphique/chart-make.js, chart-make-ui.js, chart-make.css ; js/chart-entry.js, js/main-toolbar.js, index.html) : le panneau de 700x400, à la VRAIE
// souris (page.mouse) et au VRAI clavier (frappe, flèches, Tab, Entrée, Échap, Ctrl+Z), hébergé par GFS (simulé par dev-tests/gfs-stub.js), les extensions « graphique » et « diapositives » actives, en français
// clair puis en anglais sombre. Ce que dev-tests/scenarios-chart-make.js ne peut pas voir depuis la page :
//  - le survol de l'Image ouvre son menu : la ligne « Créer un graphique… » y est, entière dans le panneau et au premier plan, sous « Image depuis une variable… » ; le menu « Lien et blocs de contenu »
//    garde les siennes (neuf, plus « Vidéo… » depuis la demande du 07/11 : la dixième défile, le volet est réglé comme celui des titres) ; la ligne « Créer un graphique… » reste dans le menu de l'Image ;
//  - un clic sur la ligne ouvre la fenêtre : elle tient dans 700x400 sans défiler, les dix formes tiennent sur deux rangées, le focus est dans le champ de la table, « Insérer » est grisé ;
//    tous les textes (titre, libellés, formes choisie et non choisie, notes, ligne grisée, « Annuler ») ont un contraste d'au moins 4,5:1 ;
//  - une forme se choisit au clic (celle d'avant se décoche, « Empilées » et « Horizontales » ne restent que pour les barres) et aux flèches du clavier ;
//  - la liste des tables s'ouvre AU-DESSUS de la fenêtre et dans le panneau, se filtre à la frappe et se valide par Entrée ; l'aperçu montre le vrai graphique dans la feuille blanche ; une colonne cochée et
//    « toute la table » changent l'image ;
//  - Tab ne sort pas de la fenêtre, Échap la ferme sans toucher au texte ;
//  - « Insérer » pose le graphique dessiné dans le cadre (le modèle ne garde que sa définition) ; un clic le sélectionne, la ligne devient « Modifier le graphique… » et rouvre la fenêtre sur ses réglages ;
//    valider une autre forme le redessine, un Ctrl+Z rend l'ancienne ; la Lecture montre la même image dans le panneau ;
//  - l'ASPECT (lot 2) : les deux onglets de l'en-tête (clic, flèches, Début, Fin) ; la fenêtre garde la même hauteur et ne défile pas dans ses trois vues (Données, Aspect, choix d'une couleur) ; le titre tapé, les jeux de
//    couleurs, la liste des séries ; le choix d'une couleur à la place des onglets (palette, clavier, « Couleur de la palette », « Personnalisé… », la rangée « Couleurs du thème ») ; le type d'une série, « Afficher les
//    valeurs » ; valider garde tout dans le nœud, UN Ctrl+Z rend l'ancienne définition ;
//  - l'ENTONNOIR, la CASCADE et la JAUGE (lot 6) : un clic les choisit (« Empilées » et « Horizontales » partent), la cascade propose « Afficher le total » (coché d'office, un clic le décoche et l'aperçu change), la jauge un champ
//    « Maximum » où l'on tape au vrai clavier (l'aperçu change, effacé il revient, Entrée valide) ; la fenêtre garde sa hauteur et ne défile pas ; valider garde le maximum, le titre et le jeu de couleurs déjà réglés,
//    UN Ctrl+Z rend l'ancienne définition, la fenêtre rouverte relit la forme et le maximum ;
//  - aucune boîte native du navigateur, aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « chartMakeMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-make-mouse.mjs
// CHART_MAKE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';
import { click, hoverRow, clickHoverRow } from './load-lib.mjs';

const SHOTS = process.env.CHART_MAKE_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-chart-make-mouse', port: Number(process.env.CHART_MAKE_MOUSE_PORT || 9181) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const SEED = seedModels({});
const WIDTH = 700;
const HEIGHT = 400;

const TEXTS = {
  fr: {
    row: 'Créer un graphique…', rowEdit: 'Modifier le graphique…', pageRow: 'Graphique de la page…', title: 'Créer un graphique', titleEdit: 'Modifier le graphique', insert: 'Insérer', confirm: 'Valider',
    kinds: ['Barres', 'Courbe', 'Aire', 'Nuage', 'Secteurs', 'Anneau', 'Radar', 'Entonnoir', 'Cascade', 'Jauge'], total: 'Afficher le total', max: 'Maximum', gaugeNote: 'Une jauge par ligne, les douze premières.',
    steps: 'Hausse, baisse et total prennent les trois premières couleurs du jeu choisi.', sameTable: 'Indisponible sur la table de la page.', imageLabel: 'Ajouter une image',
    tabs: ['Données', 'Aspect'], slices: 'Chaque secteur prend une couleur du jeu choisi.', series: ['Barres', 'Courbe'], palettes: ['Standard', 'Bleus', 'Chaudes', 'Froides', 'Gris'], back: 'Retour', auto: 'Couleur de la palette', custom: 'Personnalisé…',
    colorTitle: name => `Couleur de « ${name} »`, themeRow: 'Couleurs du thème', showValues: 'Afficher les valeurs', noMix: 'Des barres horizontales ne se mêlent pas à une courbe.',
  },
  en: {
    row: 'Create a chart…', rowEdit: 'Edit chart…', pageRow: 'Chart from the page…', title: 'Create a chart', titleEdit: 'Edit the chart', insert: 'Insert', confirm: 'Confirm',
    kinds: ['Bars', 'Line', 'Area', 'Scatter', 'Pie', 'Donut', 'Radar', 'Funnel', 'Waterfall', 'Gauge'], total: 'Show total', max: 'Maximum', gaugeNote: 'One gauge per row, the first twelve.',
    steps: 'Increase, decrease and total take the first three colors of the chosen set.', sameTable: 'Unavailable on the page’s table.', imageLabel: 'Add an image',
    tabs: ['Data', 'Appearance'], slices: 'Each slice takes a color from the chosen set.', series: ['Bars', 'Line'], palettes: ['Standard', 'Blues', 'Warm', 'Cool', 'Grays'], back: 'Back', auto: 'Palette color', custom: 'Custom…',
    colorTitle: name => `Color of “${name}”`, themeRow: 'Theme colors', showValues: 'Show values', noMix: 'Horizontal bars do not mix with a line.',
  },
};

// ---- Les gestes -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const WIN = '#pp-chartmake-modal';
const BOX = `${WIN} .pp-modal-box`;
const BODY = `${WIN} .pp-modal-body`;
const OK = `${WIN} .var-modal-primary`;
const CANCEL = `${WIN} .var-modal-actions button:not(.var-modal-primary)`;
const PAPER = `${WIN} .pp-chart-paper`;
const PREVIEW = `${WIN} .pp-chart-image`;
const MESSAGE = `${WIN} .pp-chart-message`;
const CAPTION = `${WIN} .pp-chart-caption`;
const KIND = kind => `${WIN} input[name="pp-chartmake-kind"][value="${kind}"]`;
const ROWS_RADIO = value => `${WIN} input[name="pp-chartmake-rows"][value="${value}"]`;
const TABLE_TRIGGER = `${WIN} .pp-chartmake-field:nth-child(1) .ss-trigger`;
const FRAME = '.tiptap .editor-image-chart-placeholder';
const KINDS = ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar', 'funnel', 'waterfall', 'gauge'];
const TOTAL = `${WIN} input[name="pp-chartmake-total"]`;
const MAX_INPUT = `${WIN} input[name="pp-chartmake-max"]`;
const TAB = name => `${WIN} #pp-chartmake-tab-${name}`;
const TITLE_INPUT = `${WIN} #pp-chartmake-title-input`;
const PALETTE_RADIO = id => `${WIN} input[name="pp-chartmake-palette"][value="${id}"]`;
const SERIE = column => `${WIN} .pp-chartmake-swatch[data-column="${column}"]`;
const TYPE = column => `${WIN} .pp-chartmake-serie-type[data-column="${column}"]`;
const LABELS = `${WIN} input[name="pp-chartmake-labels"]`;
const GRID_SWATCH = color => `${WIN} .pp-chartmake-colors .cp-grid .cp-swatch[data-color="${color}"]`;

async function openApp(lang, colorScheme) {
  const opened = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { page } = opened;
  // Le document de Grist est celui de scenarios-chart-block.js : une seule description des données, chargée dans la page.
  await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'scenarios-chart-block.js') });
  await page.evaluate(async () => { await GfsLink.ready; await Extensions.loadAll(); await window.__chartFixture.seed({ resetEditor: async () => {} }); });
  await sleep(300);
  return opened;
}
const textOf = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, selector);
const boxOf = (page, selector) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, selector);
const inPanel = box => !!box && box.l >= -0.5 && box.t >= -0.5 && box.r <= WIDTH + 0.5 && box.b <= HEIGHT + 0.5;
const isChecked = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.checked; }, selector);
const isDisabled = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.disabled; }, selector);
const isShown = (page, selector) => page.evaluate(sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; }, selector);
const winOpen = page => page.evaluate(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; });
const state = page => page.evaluate(() => { const p = document.querySelector('#pp-chartmake-modal .pp-chart-paper'); return p ? p.dataset.state : ''; });
async function settle(page) {
  await sleep(260);
  await page.waitForFunction(() => { const p = document.querySelector('#pp-chartmake-modal .pp-chart-paper'); return !!p && p.dataset.state && p.dataset.state !== 'loading'; }, null, { timeout: 25000 });
  await sleep(120);
}
const previewSrc = page => page.evaluate(() => document.querySelector('#pp-chartmake-modal .pp-chart-image').getAttribute('src') || '');
// Un clic réel au centre du libellé d'une case ou d'une option (la case seule est trop petite pour une souris).
async function clickLabelOf(page, inputSelector) {
  const c = await page.evaluate((sel) => { const i = document.querySelector(sel); const l = i && i.closest('label'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 }; }, inputSelector);
  if (!c) throw new Error('introuvable : ' + inputSelector);
  await page.mouse.move(c.x - 15, c.y); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(50);
  await page.mouse.click(c.x, c.y);
  await sleep(120);
}
// Rapport de contraste WCAG du texte d'un élément sur son fond réel (les fonds transparents des ancêtres sont composés jusqu'au premier opaque).
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const layers = [];
  for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const c of layers.reverse()) base = mix(c, base);
  let fg = parse(getComputedStyle(el).color);
  if (fg.a < 1) fg = mix(fg, base);
  const a = lum(fg), b = lum(base);
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, selector);
const snap = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
// Les graphiques créés du modèle, tels qu'écrits : définition, lignes, nom, présence d'une image.
const madeNodes = page => page.evaluate(() => Array.from(new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelectorAll('img[data-chart-spec]')).map(i => ({
  spec: JSON.parse(i.getAttribute('data-chart-spec')), scope: i.getAttribute('data-chart-scope'), name: i.getAttribute('data-chart-name'), src: i.hasAttribute('src'), width: i.style.width, height: i.style.height,
})));
const frameInfo = page => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).filter(w => !w.closest('.pp-slide-list')).map((w) => {
  const r = w.getBoundingClientRect();
  return { drawn: w.classList.contains('editor-image-chart-drawn'), src: w.querySelector('img').getAttribute('src') || '', w: r.width, h: r.height };
}), FRAME);
const waitDrawn = (page, previous) => page.waitForFunction(({ sel, previous }) => {
  const frames = Array.from(document.querySelectorAll(sel)).filter(w => !w.closest('.pp-slide-list'));
  if (frames.length !== 1) return false;
  const src = frames[0].querySelector('img').getAttribute('src') || '';
  return frames[0].classList.contains('editor-image-chart-drawn') && src.startsWith('data:image/png') && src !== previous;
}, { sel: FRAME, previous: previous || '' }, { timeout: 25000 }).then(() => true, () => false);
const sheetZoom = page => page.evaluate(() => { const sheet = document.querySelector('.tiptap').closest('.v2-page-sheet'); const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN; return z > 0 ? z : 1; });

// ---- Un passage : une langue, un thème ------------------------------------------------------------------------------------------------------------------------------------------------------
async function runPass(lang, scheme) {
  const T = `[${lang} ${scheme}]`;
  const X = TEXTS[lang];
  const { page } = await openApp(lang, scheme);
  const dialogs = [];
  const errors = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  page.on('pageerror', e => errors.push(e.message));
  // Le curseur dans le texte du modèle.
  await click(page, '.tiptap p');
  await page.keyboard.press('End');
  await sleep(150);
  const before = await page.evaluate(() => Editor.getHTML());

  // 1) Le menu de l'Image : la ligne est dedans, entière dans le panneau et au premier plan ; le menu des blocs garde ses lignes.
  await hoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
  const menu = await page.evaluate(() => {
    const row = document.getElementById('v2-btn-chart-make');
    const r = row.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const flyout = document.getElementById('v2-image-flyout');
    const f = flyout.getBoundingClientRect();
    return {
      label: row.textContent.trim(), rect: { l: r.left, t: r.top, r: r.right, b: r.bottom }, flyout: { l: f.left, t: f.top, r: f.right, b: f.bottom }, onTop: !!top && !!top.closest('#v2-btn-chart-make'),
      title: flyout.querySelector('.v2-hover-flyout-label').textContent.trim(), rows: Array.from(flyout.children).map(c => c.id || c.className.split(' ')[0]), greyed: row.classList.contains('v2-hover-row-disabled'),
    };
  });
  check(`${T}, menu de l'Image : « ${X.row} » est sous « Image depuis une variable… », entière dans le panneau, au premier plan, active`,
    menu.label === X.row && menu.title === X.imageLabel && menu.rows.join() === 'v2-hover-flyout-label,v2-btn-image-from-variable,v2-btn-chart-make' && inPanel({ l: menu.rect.l, t: menu.rect.t, r: menu.rect.r, b: menu.rect.b }) && inPanel({ l: menu.flyout.l, t: menu.flyout.t, r: menu.flyout.r, b: menu.flyout.b }) && menu.onTop && !menu.greyed, menu);
  await snap(page, `${T}-1-menu-image`);
  await page.mouse.move(WIDTH - 30, HEIGHT - 30, { steps: 3 });
  await sleep(300);
  await hoverRow(page, '#v2-btn-link', '#v2-btn-video');
  const blocks = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row'));
    const last = document.getElementById('v2-btn-video').getBoundingClientRect();
    const flyout = document.getElementById('v2-blocks-flyout');
    return { ids: rows.map(r => r.id), lastBottom: last.bottom, flyoutBottom: flyout.getBoundingClientRect().bottom, scrolls: flyout.scrollHeight > flyout.clientHeight, chart: (document.getElementById('v2-btn-chart') || {}).textContent.trim() };
  });
  check(`${T}, menu des blocs : il garde ses lignes (celle du graphique de la page comprise) plus « Vidéo… », entière dans le panneau, le volet défilant pour la dernière`,
    blocks.ids.length === 10 && !blocks.ids.includes('v2-btn-chart-make') && blocks.chart === X.pageRow && blocks.lastBottom <= HEIGHT + 0.5 && blocks.flyoutBottom <= HEIGHT + 0.5 && blocks.scrolls && blocks.ids[8] === 'v2-btn-video' && blocks.ids[9] === 'v2-btn-slide-text', blocks);
  await page.mouse.move(WIDTH - 30, HEIGHT - 30, { steps: 3 });
  await sleep(300);

  // 2) La fenêtre : ouverte par un clic sur la ligne, entière dans le panneau, sans défiler.
  await clickHoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
  await page.waitForFunction(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 15000 });
  await settle(page);
  const box = await boxOf(page, BOX);
  const scroll = await page.evaluate(sel => { const b = document.querySelector(sel); return { sh: b.scrollHeight, ch: b.clientHeight }; }, BODY);
  const pills = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-kind span')).map((s) => { const r = s.getBoundingClientRect(); return { t: s.textContent.trim(), top: Math.round(r.top), right: Math.round(r.right) }; }));
  const focus = await page.evaluate(() => { const a = document.activeElement; return a ? { id: a.id || '', cls: String(a.className || '').split(' ')[0], inModal: !!a.closest('#pp-chartmake-modal'), inTable: !!a.closest('.pp-chartmake-field:nth-child(1)'), editor: !!a.closest('.tiptap') } : null; });
  const first = { title: await textOf(page, '#pp-chartmake-title'), ok: await isDisabled(page, OK), okText: await textOf(page, OK), state: await state(page), table: await page.evaluate(() => document.getElementById('pp-chartmake-table').value) };
  check(`${T}, fenêtre : « ${X.title} » entière dans le panneau, sans défiler (titre, formes, champs, colonnes, aperçu, lignes, boutons)`, inPanel(box) && scroll.sh <= scroll.ch + 1 && first.title === X.title, { box, scroll, title: first.title });
  check(`${T}, fenêtre : les dix formes tiennent sur deux rangées, dans l'ordre, chacune entière dans la fenêtre`, pills.map(p => p.t).join() === X.kinds.join() && new Set(pills.map(p => p.top)).size === 2 && pills.every(p => p.right <= box.r), pills);
  check(`${T}, fenêtre : le focus est dans le champ de la table (ni dans l'éditeur ni sur « Annuler »), « ${X.insert} » est grisé, la table du document est choisie d'office`, focus && focus.inModal && focus.inTable && !focus.editor && first.ok && first.okText === X.insert && first.table === 'GfClients' && first.state === 'empty', { focus, first });
  const colors = {
    title: await contrastOf(page, '#pp-chartmake-title'), legend: await contrastOf(page, `${WIN} .pp-chartmake-kinds legend`), label: await contrastOf(page, `${WIN} .pp-chartmake-field .pp-dialog-label`),
    kindOff: await contrastOf(page, `${WIN} .pp-chartmake-kind input:not(:checked) + span`), kindOn: await contrastOf(page, `${WIN} .pp-chartmake-kind input:checked + span`), note: await contrastOf(page, `${WIN} .pp-chartmake-values .pp-chart-note`),
    message: await contrastOf(page, MESSAGE), rowsLegend: await contrastOf(page, `${WIN} .pp-chartmake-rows legend`), optionOn: await contrastOf(page, `${WIN} .pp-chart-option:not(.is-off) .pp-chart-option-name`),
    optionOff: await contrastOf(page, `${WIN} .pp-chart-option.is-off .pp-chart-option-name`), rowsNote: await contrastOf(page, `${WIN} .pp-chartmake-rows + .pp-chart-note`), setting: await contrastOf(page, `${WIN} .pp-chartmake-option span`),
    cancel: await contrastOf(page, CANCEL), trigger: await contrastOf(page, TABLE_TRIGGER),
  };
  check(`${T}, fenêtre : tous les textes ont un contraste d'au moins 4,5:1 (titre, libellés, formes choisie et non choisie, notes, ligne grisée, réglages, « Annuler », champ)`, Object.values(colors).every(v => v !== null && v >= 4.5), colors);
  const sameNote = await textOf(page, `${WIN} .pp-chartmake-rows + .pp-chart-note`);
  const linkedOff = await isDisabled(page, ROWS_RADIO('linked'));
  check(`${T}, lignes : la table du document ne trace que « toute la table » : « liées » est grisée et la note le dit`, linkedOff && sameNote === X.sameTable && await isChecked(page, ROWS_RADIO('all')), { sameNote, linkedOff });
  const paperLook = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).backgroundColor, PAPER);
  check(`${T}, aperçu : une feuille blanche, même en sombre (un graphique s'imprime sur du blanc)`, paperLook === 'rgb(255, 255, 255)', paperLook);
  await snap(page, `${T}-2-fenetre`);

  // 3) Les formes : au clic, puis aux flèches du clavier.
  await click(page, KIND('line'));
  await sleep(150);
  const line = { line: await isChecked(page, KIND('line')), bar: await isChecked(page, KIND('bar')), stack: await isShown(page, `${WIN} input[name="pp-chartmake-stack"]`), horizontal: await isShown(page, `${WIN} input[name="pp-chartmake-horizontal"]`) };
  await click(page, KIND('bar'));
  await sleep(150);
  const bars = { bar: await isChecked(page, KIND('bar')), line: await isChecked(page, KIND('line')), stack: await isShown(page, `${WIN} input[name="pp-chartmake-stack"]`), horizontal: await isShown(page, `${WIN} input[name="pp-chartmake-horizontal"]`) };
  check(`${T}, formes : un clic choisit « ${X.kinds[1]} » (« Empilées » et « Horizontales » partent), un autre rend « ${X.kinds[0]} » (elles reviennent) ; une seule est choisie à la fois`, line.line && !line.bar && !line.stack && !line.horizontal && bars.bar && !bars.line && bars.stack && bars.horizontal, { line, bars });
  await page.keyboard.press('ArrowRight');
  await sleep(150);
  const right = await isChecked(page, KIND('line'));
  await page.keyboard.press('ArrowLeft');
  await sleep(150);
  const left = await isChecked(page, KIND('bar'));
  check(`${T}, formes : les flèches du clavier passent d'une forme à l'autre`, right && left, { right, left });

  // 4) La liste des tables : au-dessus de la fenêtre et dans le panneau, filtrée à la frappe, validée par Entrée.
  await click(page, TABLE_TRIGGER);
  await sleep(300);
  const list = await page.evaluate(() => {
    const panel = document.querySelector('#pp-chartmake-modal .pp-chartmake-field:nth-child(1) .ss-panel');
    if (!panel) return { found: false };
    const r = panel.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
    return { found: true, shown: r.height > 0, l: r.left, t: r.top, r: r.right, b: r.bottom, onTop: !!top && !!top.closest('.ss-panel'), names: Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent.trim()) };
  });
  check(`${T}, liste des tables : un clic sur le champ l'ouvre DANS le panneau et AU-DESSUS de la fenêtre, avec les tables de Grist`, list.found && list.shown && inPanel({ l: list.l, t: list.t, r: list.r, b: list.b }) && list.onTop && list.names.indexOf('GfVentes') !== -1 && list.names.indexOf('GfClients') !== -1, list);
  await snap(page, `${T}-3-liste`);
  await page.keyboard.type('vent', { delay: 15 });
  await sleep(300);
  const found = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-field:nth-child(1) .ss-option .ss-name')).map(n => n.textContent.trim()));
  await page.keyboard.press('Enter');
  await settle(page);
  const chosen = await page.evaluate(() => ({ table: document.getElementById('pp-chartmake-table').value, label: document.getElementById('pp-chartmake-label').value, values: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-value input')).map(i => [i.value, i.checked]) }));
  const chosenState = { state: await state(page), ok: await isDisabled(page, OK), linked: await isChecked(page, ROWS_RADIO('linked')), caption: (await isShown(page, CAPTION)) ? await textOf(page, CAPTION) : '', src: await previewSrc(page) };
  check(`${T}, liste des tables : taper « vent » ne laisse que « GfVentes », Entrée le choisit (étiquettes : ${chosen.label}, valeur : ${chosen.values.filter(v => v[1]).map(v => v[0]).join(', ')}), « ${X.insert} » s'allume, les lignes liées sont cochées`,
    found.length === 1 && found[0] === 'GfVentes' && chosen.table === 'GfVentes' && chosen.label === 'Client' && chosen.values.length === 2 && chosen.values[0].join() === 'Montant,true' && chosen.values[1].join() === 'Cout,false'
      && chosenState.state === 'chart' && !chosenState.ok && chosenState.linked && chosenState.caption.length > 3 && chosenState.src.startsWith('data:image/png;base64,'), { found, chosen, chosenState: Object.assign({}, chosenState, { src: chosenState.src.length }) });
  const image = await page.evaluate((sel) => { const i = document.querySelector(sel); const r = i.getBoundingClientRect(); const p = document.querySelector('#pp-chartmake-modal .pp-chart-paper').getBoundingClientRect(); return { natural: [i.naturalWidth, i.naturalHeight], inPaper: r.left >= p.left - 0.5 && r.right <= p.right + 0.5 && r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5, w: r.width, h: r.height }; }, PREVIEW);
  check(`${T}, aperçu : le vrai graphique (une image PNG de 1 440 x 900) tient dans la feuille blanche`, image.natural[0] === 1440 && image.natural[1] === 900 && image.inPaper && image.w > 100, image);
  await snap(page, `${T}-4-apercu`);

  // 5) Une colonne de plus et « toute la table » changent l'image.
  const linkedSrc = chosenState.src;
  await clickLabelOf(page, `${WIN} .pp-chartmake-value input[value="Cout"]`);
  await settle(page);
  const twoSrc = await previewSrc(page);
  const twoChecked = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-value input')).filter(i => i.checked).map(i => i.value));
  await clickLabelOf(page, ROWS_RADIO('all'));
  await settle(page);
  const allSrc = await previewSrc(page);
  const all = { linked: await isChecked(page, ROWS_RADIO('linked')), all: await isChecked(page, ROWS_RADIO('all')), caption: await isShown(page, CAPTION) };
  check(`${T}, colonnes et lignes : cocher « Cout » trace deux séries (une autre image), « ${lang === 'fr' ? 'Toute la table' : 'Whole table'} » trace tout le tableau (encore une autre, sans légende de ligne)`,
    twoChecked.join() === 'Montant,Cout' && twoSrc.startsWith('data:image/png') && twoSrc !== linkedSrc && all.all && !all.linked && !all.caption && allSrc.startsWith('data:image/png') && allSrc !== twoSrc, { twoChecked, all });
  await snap(page, `${T}-5-deux-colonnes`);

  // 6) Tab ne sort pas de la fenêtre ; Échap la ferme sans toucher au texte.
  const tabbed = [];
  for (let i = 0; i < 30; i += 1) { await page.keyboard.press('Tab'); tabbed.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#pp-chartmake-modal'))); }
  for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Shift+Tab'); tabbed.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#pp-chartmake-modal'))); }
  check(`${T}, clavier : Tab et Maj+Tab restent dans la fenêtre (42 appuis)`, tabbed.every(Boolean), { out: tabbed.filter(v => !v).length });
  await page.keyboard.press('Escape');
  await sleep(300);
  const afterEscape = await page.evaluate(() => ({ html: Editor.getHTML(), inEditor: !!document.activeElement && !!document.activeElement.closest('.tiptap') }));
  check(`${T}, clavier : Échap ferme la fenêtre, le texte n'a pas bougé et le clavier revient dans l'éditeur`, !(await winOpen(page)) && afterEscape.html === before && afterEscape.inEditor, { open: await winOpen(page), same: afterEscape.html === before, inEditor: afterEscape.inEditor });

  // 7) Insérer : le graphique est dessiné dans le cadre, le modèle ne garde que sa définition.
  await clickHoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
  await page.waitForFunction(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 15000 });
  await settle(page);
  await click(page, TABLE_TRIGGER);
  await sleep(250);
  await page.keyboard.type('ventes', { delay: 15 });
  await sleep(250);
  await page.keyboard.press('Enter');
  await settle(page);
  await clickLabelOf(page, `${WIN} .pp-chartmake-value input[value="Cout"]`);
  await settle(page);
  await click(page, KIND('area'));
  await sleep(200);
  await settle(page);
  await click(page, OK);
  const drawnFirst = await waitDrawn(page);
  const zoom = await sheetZoom(page);
  const frames = await frameInfo(page);
  const nodes = await madeNodes(page);
  const modelHtml = await page.evaluate(() => Editor.getHTML());
  check(`${T}, insertion : « ${X.insert} » ferme la fenêtre et le graphique est dessiné dans le cadre (480 x 300, proportions gardées) ; le modèle ne garde que sa définition, jamais l'image`,
    !(await winOpen(page)) && drawnFirst && frames.length === 1 && frames[0].src.startsWith('data:image/png;base64,') && Math.abs(frames[0].w / frames[0].h - 1.6) < 0.03 && Math.abs(frames[0].w - 480 * zoom) < 2
      && nodes.length === 1 && nodes[0].spec.kind === 'area' && nodes[0].spec.table === 'GfVentes' && nodes[0].spec.values.join() === 'Montant,Cout' && nodes[0].scope === 'linked' && nodes[0].width === '480px' && nodes[0].height === '300px' && !nodes[0].src && !modelHtml.includes('data:image/png'),
    { drawnFirst, frames: frames.map(f => [Math.round(f.w), Math.round(f.h)]), zoom, nodes: nodes.map(n => [n.spec, n.scope, n.name]) });
  await snap(page, `${T}-6-insere`);

  // 8) Un clic sur le graphique le sélectionne : la ligne devient « Modifier le graphique… » et rouvre la fenêtre sur ses réglages.
  const frameSrcBefore = frames[0] ? frames[0].src : '';
  await click(page, FRAME);
  await sleep(300);
  await hoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
  const editRow = await page.evaluate(() => ({ label: document.getElementById('v2-btn-chart-make').textContent.trim(), aria: document.getElementById('v2-btn-chart-make').getAttribute('aria-label'), page: document.getElementById('v2-btn-chart').textContent.trim() }));
  check(`${T}, modification : un clic sur le graphique le sélectionne et la ligne du menu devient « ${X.rowEdit} » (celle du graphique de la page garde son nom)`, editRow.label === X.rowEdit && editRow.page === X.pageRow, editRow);
  await page.mouse.click(...(await page.evaluate(() => { const r = document.getElementById('v2-btn-chart-make').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
  await page.waitForFunction(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 15000 });
  await settle(page);
  const edit = await page.evaluate(() => ({
    title: document.getElementById('pp-chartmake-title').textContent.trim(), ok: document.querySelector('#pp-chartmake-modal .var-modal-primary').textContent.trim(),
    kind: (document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-kind"]:checked') || {}).value, table: document.getElementById('pp-chartmake-table').value, label: document.getElementById('pp-chartmake-label').value,
    values: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-value input')).filter(i => i.checked).map(i => i.value), linked: (document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-rows"][value="linked"]') || {}).checked,
  }));
  check(`${T}, modification : la fenêtre s'ouvre sur « ${X.titleEdit} » avec les réglages du graphique (forme, table, étiquettes, colonnes, lignes) et « ${X.confirm} »`, edit.title === X.titleEdit && edit.ok === X.confirm && edit.kind === 'area' && edit.table === 'GfVentes' && edit.label === 'Client' && edit.values.join() === 'Montant,Cout' && edit.linked, edit);
  await snap(page, `${T}-7-modifier`);
  await click(page, KIND('pie'));
  await sleep(200);
  await settle(page);
  await click(page, OK);
  const drawnPie = await waitDrawn(page, frameSrcBefore);
  const afterEdit = await madeNodes(page);
  const frameAfter = (await frameInfo(page))[0];
  check(`${T}, modification : valider « ${X.kinds[4]} » change la définition et redessine le graphique (même taille, même place, un seul graphique)`, drawnPie && afterEdit.length === 1 && afterEdit[0].spec.kind === 'pie' && afterEdit[0].spec.values.join() === 'Montant' && afterEdit[0].width === '480px' && frameAfter.src !== frameSrcBefore, { drawnPie, afterEdit: afterEdit.map(n => n.spec), changed: frameAfter && frameAfter.src !== frameSrcBefore });
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undone = await madeNodes(page);
  check(`${T}, modification : un seul Ctrl+Z rend l'ancienne définition`, undone.length === 1 && undone[0].spec.kind === 'area' && undone[0].spec.values.join() === 'Montant,Cout', undone.map(n => n.spec));
  await page.keyboard.press('Control+y');
  await sleep(500);
  const redone = await madeNodes(page);
  check(`${T}, modification : Ctrl+Y la rend`, redone.length === 1 && redone[0].spec.kind === 'pie', redone.map(n => n.spec));

  // 9) L'aspect (lot 2) : les onglets, le titre, les jeux de couleurs, les séries (leur couleur, leur type), les valeurs affichées, à la vraie souris et au vrai clavier, dans le panneau de 700x400.
  // La page est remontée en haut : le graphique sélectionné (255 px de haut, dans 250 px de page visible) a sa barre flottante juste au-dessus de lui ; plus bas elle recouvrirait le bouton de l'Image.
  await page.evaluate(() => { let n = document.querySelector('.tiptap'); while (n && n !== document.documentElement) { if (n.scrollHeight > n.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)) { n.scrollTop = 0; break; } n = n.parentElement; } });
  await sleep(300);
  await click(page, FRAME);
  await sleep(300);
  await hoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
  await page.mouse.click(...(await page.evaluate(() => { const r = document.getElementById('v2-btn-chart-make').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
  await page.waitForFunction(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 15000 });
  await settle(page);
  const heights = {};
  const geometry = async (name) => {
    const b = await boxOf(page, BOX);
    const sc = await page.evaluate(sel => { const e = document.querySelector(sel); return { sh: e.scrollHeight, ch: e.clientHeight }; }, BODY);
    heights[name] = Math.round(b.h);
    return inPanel(b) && sc.sh <= sc.ch + 1;
  };
  const tabs0 = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal [role="tab"]')).map(b => ({ id: b.id, text: b.textContent.trim(), selected: b.getAttribute('aria-selected'), stop: b.tabIndex, inHeader: !!b.closest('.pp-modal-header') })));
  const dataFits = await geometry('data-pie');
  check(`${T}, onglets : « ${X.tabs[0]} » et « ${X.tabs[1]} » sont deux vrais onglets dans l'en-tête, à droite du titre, « ${X.tabs[0]} » choisi ; la fenêtre tient dans le panneau sans défiler`,
    tabs0.length === 2 && tabs0[0].text === X.tabs[0] && tabs0[1].text === X.tabs[1] && tabs0[0].selected === 'true' && tabs0[1].selected === 'false' && tabs0[0].stop === 0 && tabs0[1].stop === -1 && tabs0.every(b => b.inHeader) && dataFits, { tabs0, dataFits });
  await click(page, TAB('aspect'));
  await sleep(250);
  const pieAspect = await page.evaluate(() => {
    const shown = sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
    return { aspect: shown('#pp-chartmake-panel-aspect'), data: shown('#pp-chartmake-panel-data'), series: shown('#pp-chartmake-modal .pp-chartmake-series'), note: (document.querySelector('#pp-chartmake-panel-aspect > .pp-chart-note') || {}).textContent, palettes: shown('#pp-chartmake-modal .pp-chartmake-palettes'), labels: shown('#pp-chartmake-modal input[name="pp-chartmake-labels"]'), selected: document.getElementById('pp-chartmake-tab-aspect').getAttribute('aria-selected') };
  });
  const pieFits = await geometry('aspect-pie');
  check(`${T}, onglet « ${X.tabs[1]} » : un clic l'ouvre (« ${X.tabs[0]} » se cache), secteurs : pas de séries, la note des parts à leur place, les jeux de couleurs et les valeurs affichées restent ; entier dans le panneau, sans défiler, à la même hauteur que « ${X.tabs[0]} »`,
    pieAspect.aspect && !pieAspect.data && !pieAspect.series && pieAspect.note === X.slices && pieAspect.palettes && pieAspect.labels && pieAspect.selected === 'true' && pieFits && Math.abs(heights['aspect-pie'] - heights['data-pie']) <= 1, { pieAspect, pieFits, heights });
  await snap(page, `${T}-9-aspect-secteurs`);

  // Les flèches, Début et Fin passent d'un onglet à l'autre (le choix suit le focus).
  const focusedTab = () => page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, selected: Array.from(document.querySelectorAll('#pp-chartmake-modal [role="tab"]')).filter(b => b.getAttribute('aria-selected') === 'true').map(b => b.id) }));
  const keysTried = [];
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) { await page.keyboard.press(key); await sleep(120); keysTried.push(Object.assign({ key }, await focusedTab())); }
  check(`${T}, onglets : au clavier, ← → Début Fin changent d'onglet et le focus le suit`,
    keysTried[0].id === 'pp-chartmake-tab-data' && keysTried[0].selected.join() === 'pp-chartmake-tab-data' && keysTried[1].id === 'pp-chartmake-tab-aspect' && keysTried[2].id === 'pp-chartmake-tab-data' && keysTried[3].id === 'pp-chartmake-tab-aspect' && keysTried[3].selected.join() === 'pp-chartmake-tab-aspect', keysTried);

  // Barres, deux colonnes : les séries, leur couleur et leur type.
  await click(page, TAB('data'));
  await sleep(200);
  await click(page, KIND('bar'));
  await sleep(150);
  await clickLabelOf(page, `${WIN} .pp-chartmake-value input[value="Cout"]`);
  await settle(page);
  const barSrc = await previewSrc(page);
  await click(page, TAB('aspect'));
  await sleep(250);
  const rowsOf = () => page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-serie')).map((line) => {
    const swatch = line.querySelector('.pp-chartmake-swatch');
    const type = line.querySelector('.pp-chartmake-serie-type');
    const r = swatch.getBoundingClientRect();
    return { column: swatch.dataset.column, color: swatch.style.getPropertyValue('--swatch').trim(), name: line.querySelector('.pp-chartmake-serie-name').textContent, type: type ? type.value : null, off: type ? type.disabled : null, label: swatch.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
  }));
  const STANDARD = ['#2b78ae', '#fe945b', '#3a936e', '#d34141', '#8563cc'];
  const barRows = await rowsOf();
  const barFits = await geometry('aspect-bars');
  check(`${T}, séries : une ligne par colonne tracée (la pastille de sa couleur, son nom, son type « ${X.series[0]} »), les couleurs du jeu standard ; la pastille a 20 px et un nom qui dit la couleur ; entier dans le panneau`,
    barRows.length === 2 && barRows[0].column === 'Montant' && barRows[0].color === STANDARD[0] && barRows[1].column === 'Cout' && barRows[1].color === STANDARD[1] && barRows.every(r => r.type === 'bar' && !r.off && r.w === 20 && r.h === 20 && r.label.includes(r.color.toUpperCase()) && r.label.includes(r.name)) && barFits && Math.abs(heights['aspect-bars'] - heights['data-pie']) <= 1, { barRows, heights });
  await snap(page, `${T}-10-aspect-barres`);

  // Le titre : tapé au clavier ; l'aperçu change.
  await click(page, TITLE_INPUT);
  await page.keyboard.type('Ventes & coûts', { delay: 12 });
  await settle(page);
  const titledSrc = await previewSrc(page);
  const typed = await page.evaluate(sel => document.querySelector(sel).value, TITLE_INPUT);
  check(`${T}, titre : taper « Ventes & coûts » au clavier change l'aperçu (le titre est dans l'image)`, typed === 'Ventes & coûts' && titledSrc.startsWith('data:image/png') && titledSrc !== barSrc, { typed, changed: titledSrc !== barSrc });

  // Le jeu de couleurs : un clic sur « Chaudes », puis les flèches (deux boutons radio du même groupe).
  await clickLabelOf(page, PALETTE_RADIO('warm'));
  await settle(page);
  const warmRows = await rowsOf();
  const warmSrc = await previewSrc(page);
  const WARM = ['#a32a1f', '#e8742c'];
  await page.focus(PALETTE_RADIO('warm'));
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  const afterArrow = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal input[name="pp-chartmake-palette"]')).filter(i => i.checked).map(i => i.value));
  await page.keyboard.press('ArrowLeft');
  await sleep(200);
  await settle(page);
  const backWarm = await page.evaluate(() => Array.from(document.querySelectorAll('#pp-chartmake-modal input[name="pp-chartmake-palette"]')).filter(i => i.checked).map(i => i.value));
  check(`${T}, jeux de couleurs : un clic sur « ${X.palettes[2]} » donne leurs couleurs aux séries et à l'aperçu ; la flèche → passe au jeu suivant, ← revient`,
    warmRows[0].color === WARM[0] && warmRows[1].color === WARM[1] && warmSrc !== titledSrc && afterArrow.join() === 'cool' && backWarm.join() === 'warm', { warmRows: warmRows.map(r => r.color), afterArrow, backWarm });

  // La couleur d'une série : la pastille ouvre le choix à la place des onglets.
  await click(page, SERIE('Montant'));
  await sleep(300);
  const picking = await page.evaluate(() => {
    const shown = sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
    const colors = document.querySelector('#pp-chartmake-modal .pp-chartmake-colors').getBoundingClientRect();
    const box = document.querySelector('#pp-chartmake-modal .pp-modal-box').getBoundingClientRect();
    const tabs = document.getElementById('pp-chartmake-tab-aspect').parentElement;
    const grid = Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-grid .cp-swatch')).map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, color: b.dataset.color }; });
    const a = document.activeElement;
    return { colors: shown('#pp-chartmake-modal .pp-chartmake-colors'), aspect: shown('#pp-chartmake-panel-aspect'), data: shown('#pp-chartmake-panel-data'), tabs: getComputedStyle(tabs).visibility, count: grid.length, grid, inBox: colors.left >= box.left && colors.right <= box.right && colors.bottom <= box.bottom,
      title: (document.querySelector('#pp-chartmake-modal .pp-chartmake-colors-title') || {}).textContent, back: (document.querySelector('#pp-chartmake-modal .pp-chartmake-back') || {}).textContent.trim(), auto: (document.querySelector('#pp-chartmake-modal .pp-chartmake-tool:not(.cp-custom)') || {}).textContent, autoOn: (document.querySelector('#pp-chartmake-modal .pp-chartmake-tool:not(.cp-custom)') || {}).getAttribute('aria-pressed'),
      custom: (document.querySelector('#pp-chartmake-modal .pp-chartmake-tool.cp-custom') || {}).textContent, focus: a ? { inColors: !!a.closest('.pp-chartmake-colors'), swatch: a.classList.contains('cp-swatch') ? a.dataset.color : '' } : null };
  });
  const pickFits = await geometry('colors');
  check(`${T}, couleur d'une série : un clic sur la pastille de « Montant » ouvre le choix à la place des onglets (invisibles, à leur place) : « ${X.back} », « Couleur de « Montant » », la palette de 50 pastilles entière dans la fenêtre, « ${X.auto} » (choisi) et « ${X.custom} » ; le clavier y est ; la fenêtre garde sa hauteur`,
    picking.colors && !picking.aspect && !picking.data && picking.tabs === 'hidden' && picking.count === 50 && picking.grid.every(g => g.l >= 0 && g.r <= WIDTH && g.t >= 0 && g.b <= HEIGHT) && picking.inBox && picking.title === X.colorTitle('Montant') && picking.back === `‹${X.back}` && picking.auto === X.auto && picking.autoOn === 'true' && picking.custom === X.custom
      && picking.focus && picking.focus.inColors && picking.focus.swatch === '#000000' && pickFits && Math.abs(heights.colors - heights['data-pie']) <= 1, { picking: Object.assign({}, picking, { grid: undefined }), heights });
  await snap(page, `${T}-11-couleur`);
  const colorContrast = { back: await contrastOf(page, `${WIN} .pp-chartmake-back`), title: await contrastOf(page, `${WIN} .pp-chartmake-colors-title`), tool: await contrastOf(page, `${WIN} .pp-chartmake-tool.cp-custom`), toolOn: await contrastOf(page, `${WIN} .pp-chartmake-tool:not(.cp-custom)`) };
  check(`${T}, couleur d'une série : le retour, le titre et les deux boutons ont un contraste d'au moins 4,5:1`, Object.values(colorContrast).every(v => v !== null && v >= 4.5), colorContrast);

  // Au clavier : les flèches parcourent la palette (haut et bas d'une rangée à l'autre), Début et Fin vont aux bouts ; Tab reste dans la fenêtre ; Entrée choisit.
  const focusedSwatch = () => page.evaluate(() => { const a = document.activeElement; return a && a.classList.contains('cp-swatch') ? a.dataset.color : ''; });
  const walk = [];
  for (const key of ['End', 'ArrowUp', 'Home', 'ArrowDown', 'ArrowDown', 'ArrowRight']) { await page.keyboard.press(key); await sleep(60); walk.push(await focusedSwatch()); }
  check(`${T}, couleur d'une série : Fin → dernière pastille, ↑ → celle du dessus, Début → la première, ↓ → celle de la rangée d'en dessous, ↓ encore, → → la voisine`,
    walk.join() === ['#ffd1e6', '#f9a8d4', '#000000', '#b91c1c', '#ef4444', '#f97316'].join(), { walk });
  const beforeEnter = await previewSrc(page);
  await page.keyboard.press('Enter');
  await sleep(300);
  await settle(page);
  const enterRows = await rowsOf();
  const enterFocus = await page.evaluate(() => { const a = document.activeElement; return { onSwatch: !!a && a.classList.contains('pp-chartmake-swatch') ? a.dataset.column : '', colorsShown: !!document.querySelector('#pp-chartmake-modal .pp-chartmake-colors') && !document.querySelector('#pp-chartmake-modal .pp-chartmake-colors').hidden }; });
  check(`${T}, couleur d'une série : Entrée sur une pastille la choisit (« Montant » prend ${walk[5] || '?'}), le choix se referme, l'aperçu change et le focus revient sur la pastille de la série`,
    enterRows[0].color === walk[5] && enterRows[1].color === WARM[1] && !enterFocus.colorsShown && enterFocus.onSwatch === 'Montant' && (await previewSrc(page)) !== beforeEnter, { enterRows: enterRows.map(r => r.color), enterFocus, picked: walk[5] });

  // À la souris : une pastille de la palette ; « Couleur de la palette » rend celle du jeu ; Échap referme le choix sans fermer la fenêtre.
  await click(page, SERIE('Cout'));
  await sleep(250);
  const tabbedColors = [];
  for (let i = 0; i < 14; i += 1) { await page.keyboard.press('Tab'); tabbedColors.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#pp-chartmake-modal'))); }
  for (let i = 0; i < 14; i += 1) { await page.keyboard.press('Shift+Tab'); tabbedColors.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#pp-chartmake-modal'))); }
  check(`${T}, couleur d'une série : Tab et Maj+Tab restent dans la fenêtre (28 appuis, le choix des couleurs ouvert)`, tabbedColors.every(Boolean), { out: tabbedColors.filter(v => !v).length });
  await click(page, GRID_SWATCH('#0369a1'));
  await sleep(250);
  await settle(page);
  const mouseRows = await rowsOf();
  await click(page, SERIE('Cout'));
  await sleep(250);
  const marked = await page.evaluate(() => ({ active: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-swatch.is-active')).map(b => b.dataset.color), auto: document.querySelector('#pp-chartmake-modal .pp-chartmake-tool:not(.cp-custom)').getAttribute('aria-pressed'), stop: document.activeElement && document.activeElement.dataset.color }));
  await page.keyboard.press('Escape');
  await sleep(250);
  const escaped = await page.evaluate(() => ({ open: document.getElementById('pp-chartmake-modal').style.display !== 'none', colors: !document.querySelector('#pp-chartmake-modal .pp-chartmake-colors').hidden, onSwatch: document.activeElement && document.activeElement.classList.contains('pp-chartmake-swatch') ? document.activeElement.dataset.column : '' }));
  await click(page, SERIE('Cout'));
  await sleep(250);
  await click(page, `${WIN} .pp-chartmake-tool:not(.cp-custom)`);
  await sleep(250);
  await settle(page);
  const autoRows = await rowsOf();
  check(`${T}, couleur d'une série : un clic sur une pastille de la palette la choisit (« Cout » prend #0369a1) ; rouvert, le choix est marqué et « ${X.auto} » ne l'est plus ; Échap referme le choix SANS fermer la fenêtre (le focus revient à la pastille) ; « ${X.auto} » rend la couleur du jeu`,
    mouseRows[1].color === '#0369a1' && marked.active.join() === '#0369a1' && marked.auto === 'false' && marked.stop === '#0369a1' && escaped.open && !escaped.colors && escaped.onSwatch === 'Cout' && autoRows[1].color === WARM[1] && autoRows[0].color === walk[5], { mouseRows: mouseRows.map(r => r.color), marked, escaped, autoRows: autoRows.map(r => r.color) });

  // « Personnalisé… » : la fenêtre de couleur s'ouvre par-dessus, un code tapé la choisit, Échap la ferme seule.
  await click(page, SERIE('Cout'));
  await sleep(250);
  await click(page, `${WIN} .pp-chartmake-tool.cp-custom`);
  await page.waitForFunction(() => { const m = document.getElementById('pp-color-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 8000 });
  await sleep(300);
  const dialog = await page.evaluate(() => {
    const m = document.getElementById('pp-color-modal');
    const box = m.querySelector('.pp-modal-box').getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + 20);
    const hex = document.getElementById('pp-color-hex');
    return { onTop: !!top && !!top.closest('#pp-color-modal'), inPanel: box.left >= 0 && box.top >= 0 && box.right <= 700 && box.bottom <= 400, focus: document.activeElement === hex, hex: hex.value.toLowerCase() };
  });
  await page.keyboard.press('Escape');
  await sleep(300);
  const afterDialogEscape = await page.evaluate(() => ({ dialog: document.getElementById('pp-color-modal').style.display !== 'none', mine: document.getElementById('pp-chartmake-modal').style.display !== 'none', colors: !document.querySelector('#pp-chartmake-modal .pp-chartmake-colors').hidden, onCustom: !!document.activeElement && document.activeElement.classList.contains('cp-custom') }));
  await click(page, `${WIN} .pp-chartmake-tool.cp-custom`);
  await page.waitForFunction(() => { const m = document.getElementById('pp-color-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 8000 });
  await sleep(300);
  await page.keyboard.type('#12ab34', { delay: 15 });
  await sleep(200);
  await click(page, '#pp-color-modal .var-modal-primary');
  await sleep(400);
  await settle(page);
  const customRows = await rowsOf();
  const afterApply = await page.evaluate(() => ({ dialog: document.getElementById('pp-color-modal').style.display !== 'none', colors: !document.querySelector('#pp-chartmake-modal .pp-chartmake-colors').hidden, onSwatch: document.activeElement && document.activeElement.classList.contains('pp-chartmake-swatch') ? document.activeElement.dataset.column : '' }));
  await click(page, SERIE('Cout'));
  await sleep(250);
  const savedRow = await page.evaluate(() => ({ saved: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-rows .cp-swatch')).map(b => b.dataset.color), active: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-swatch.is-active')).map(b => b.dataset.color) }));
  await snap(page, `${T}-12-couleur-gardee`);
  await page.keyboard.press('Escape');
  await sleep(250);
  check(`${T}, couleur d'une série : « ${X.custom} » ouvre la fenêtre de couleur par-dessus, dans le panneau, le code est sélectionné (${dialog.hex}) ; Échap la ferme seule (le choix reste, le focus revient au bouton) ; un code tapé et « Appliquer » donnent à « Cout » #12ab34, retour sur la liste des séries ; la couleur gardée est dans les couleurs du modèle, marquée`,
    dialog.onTop && dialog.inPanel && dialog.focus && !afterDialogEscape.dialog && afterDialogEscape.mine && afterDialogEscape.colors && afterDialogEscape.onCustom
      && customRows[1].color === '#12ab34' && !afterApply.dialog && !afterApply.colors && afterApply.onSwatch === 'Cout' && savedRow.saved.indexOf('#12ab34') !== -1 && savedRow.active.join() === '#12ab34', { dialog, afterDialogEscape, customRows: customRows.map(r => r.color), afterApply, savedRow });

  // Le thème de la présentation : sa rangée de couleurs est en tête du choix, comme dans tous les menus de couleur (neuf pastilles, sans croix, chacune avec le nom de son réglage) ; le choix reste dans la fenêtre,
  // à la même hauteur et sans défiler, même avec les couleurs gardées à côté ; un clic sur un accent le choisit.
  await page.evaluate(() => PageLayout.setTheme({ name: 'Océan', colors: { bg: '#ffffff', text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, fonts: { title: 'Georgia', body: 'Calibri' } }));
  await sleep(150);
  await click(page, SERIE('Cout'));
  await sleep(300);
  const themed = await page.evaluate(() => {
    const box = document.querySelector('#pp-chartmake-modal .pp-modal-box').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-row'));
    const first = rows[0];
    const swatches = first ? Array.from(first.querySelectorAll('.cp-swatch')) : [];
    const inside = swatches.length > 0 && swatches.every((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom; });
    const all = rows.every(row => Array.from(row.querySelectorAll('.cp-swatch')).every((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom; }));
    return { rows: rows.length, label: first && first.getAttribute('aria-label'), count: swatches.length, forgets: first ? first.querySelectorAll('.cp-forget').length : -1, inside, all, titles: swatches.map(b => b.title).slice(0, 4) };
  });
  const themedFits = await geometry('colors-theme');
  await snap(page, `${T}-12b-couleur-theme`);
  await click(page, `${WIN} .pp-chartmake-colors .cp-row .cp-swatch[data-color="#00a3a3"]`);
  await sleep(250);
  await settle(page);
  const themeRows = await rowsOf();
  await page.evaluate(() => PageLayout.setTheme(null));
  check(`${T}, couleur d'une série : avec un thème, la rangée « ${X.themeRow} » est en tête (9 pastilles sans croix, chacune avec le nom de son réglage), entière dans la fenêtre à la même hauteur et sans défiler, avec les couleurs gardées à côté ; un clic sur un accent le choisit (« Cout » prend #00a3a3)`,
    themed.rows >= 2 && themed.label === X.themeRow && themed.count === 9 && themed.forgets === 0 && themed.inside && themed.all && themed.titles.length === 4 && themed.titles[3].indexOf('1D70B8') !== -1 && themedFits && Math.abs(heights['colors-theme'] - heights['data-pie']) <= 1
      && themeRows[1].color === '#00a3a3' && themeRows[0].color === walk[5], { themed, heights, rows: themeRows.map(r => r.color) });

  // Le type d'une série (au clavier : une liste native ne se pilote pas à la souris), « Afficher les valeurs » (un clic).
  const labelsSrcBefore = await previewSrc(page);
  await page.focus(TYPE('Cout'));
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  await settle(page);
  const typed2 = await rowsOf();
  const mixedSrc = await previewSrc(page);
  await clickLabelOf(page, LABELS);
  await settle(page);
  const labelsOn = await isChecked(page, LABELS);
  const labelsSrc = await previewSrc(page);
  check(`${T}, séries : la flèche ↓ sur le type de « Cout » le met en « ${X.series[1]} » (barres et courbe mêlées : l'aperçu change) ; un clic sur « ${X.showValues} » l'écrit dans l'aperçu`,
    typed2[0].type === 'bar' && typed2[1].type === 'line' && mixedSrc !== labelsSrcBefore && labelsOn && labelsSrc !== mixedSrc, { types: typed2.map(r => r.type), changed: [mixedSrc !== labelsSrcBefore, labelsSrc !== mixedSrc], labelsOn });
  const aspectContrast = {
    tabOn: await contrastOf(page, TAB('aspect')), tabOff: await contrastOf(page, TAB('data')), label: await contrastOf(page, `${WIN} #pp-chartmake-panel-aspect .pp-dialog-label`), input: await contrastOf(page, TITLE_INPUT),
    pillOff: await contrastOf(page, `${WIN} .pp-chartmake-palette input:not(:checked) + span`), pillOn: await contrastOf(page, `${WIN} .pp-chartmake-palette input:checked + span`), name: await contrastOf(page, `${WIN} .pp-chartmake-serie-name`),
    select: await contrastOf(page, `${WIN} .pp-chartmake-serie-type`), values: await contrastOf(page, `${WIN} .pp-chartmake-labels span`),
  };
  check(`${T}, onglet « ${X.tabs[1]} » : tous les textes ont un contraste d'au moins 4,5:1 (onglets choisi et non choisi, libellés, titre, jeux de couleurs, noms et types des séries, valeurs affichées)`, Object.values(aspectContrast).every(v => v !== null && v >= 4.5), aspectContrast);
  await snap(page, `${T}-13-aspect-mixte`);

  // Des barres horizontales ne se mêlent pas à une courbe : le type se grise, la note le dit, la couleur reste choisissable.
  await click(page, TAB('data'));
  await sleep(200);
  await clickLabelOf(page, `${WIN} input[name="pp-chartmake-horizontal"]`);
  await sleep(200);
  await click(page, TAB('aspect'));
  await sleep(250);
  const flat = await page.evaluate(() => ({ rows: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-serie-type')).map(s => [s.value, s.disabled]), note: (document.querySelector('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note') || {}).textContent, noteShown: !!document.querySelector('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note') && !document.querySelector('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note').hidden }));
  const flatNote = await contrastOf(page, `${WIN} .pp-chartmake-series .pp-chart-note`);
  const flatFits = await geometry('aspect-flat');
  await click(page, TAB('data'));
  await sleep(200);
  await clickLabelOf(page, `${WIN} input[name="pp-chartmake-horizontal"]`);
  await sleep(200);
  await click(page, TAB('aspect'));
  await sleep(250);
  const upright = await rowsOf();
  check(`${T}, séries : des barres horizontales grisent le type des séries et la note dit « ${X.noMix} » (contraste ${flatNote}) ; décochées, la courbe de « Cout » revient`,
    flat.rows.every(r => r[0] === 'bar' && r[1]) && flat.note === X.noMix && flat.noteShown && flatNote >= 4.5 && flatFits && upright[1].type === 'line' && !upright[1].off, { flat, flatNote, upright: upright.map(r => [r.type, r.off]) });

  // « Valider » par Entrée dans le titre : la fenêtre se ferme et le graphique garde tout l'aspect ; un seul Ctrl+Z rend l'ancienne définition.
  const specBefore = (await madeNodes(page))[0].spec;
  const srcBefore = (await frameInfo(page))[0].src;
  await click(page, TITLE_INPUT);
  await page.keyboard.press('Enter');
  await sleep(400);
  const drawnAspect = await waitDrawn(page, srcBefore);
  const nodesAspect = await madeNodes(page);
  const frameAspect = (await frameInfo(page))[0];
  check(`${T}, aspect : Entrée dans le titre valide la fenêtre ; le graphique garde le titre, le jeu « ${X.palettes[2]} », les couleurs choisies (« Cout » : l'accent du thème), les valeurs affichées et le type de « Cout » (le nom du graphique est son titre) et se redessine`,
    !(await winOpen(page)) && drawnAspect && nodesAspect.length === 1 && nodesAspect[0].spec.kind === 'bar' && nodesAspect[0].spec.title === 'Ventes & coûts' && nodesAspect[0].spec.palette === 'warm' && nodesAspect[0].spec.colors.Montant === walk[5] && nodesAspect[0].spec.colors.Cout === '#00a3a3'
      && nodesAspect[0].spec.labels === true && nodesAspect[0].spec.mix.Cout === 'line' && nodesAspect[0].name === 'Ventes & coûts' && frameAspect.src !== srcBefore && nodesAspect[0].width === '480px' && !nodesAspect[0].src, { drawnAspect, spec: nodesAspect[0] && nodesAspect[0].spec, name: nodesAspect[0] && nodesAspect[0].name });
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undoneAspect = await madeNodes(page);
  check(`${T}, aspect : un seul Ctrl+Z rend l'ancienne définition (sans titre ni couleurs)`, undoneAspect.length === 1 && JSON.stringify(undoneAspect[0].spec) === JSON.stringify(specBefore) && !undoneAspect[0].spec.title, undoneAspect.map(n => n.spec));
  await page.keyboard.press('Control+y');
  await sleep(500);
  await waitDrawn(page, '');

  // 10) La Lecture : la même image, dans le panneau (celle du graphique avec son aspect : titre, couleurs, valeurs, courbe mêlée aux barres).
  await waitDrawn(page, '');
  const editorSrc = (await frameInfo(page))[0].src;
  await click(page, '#btn-mode-read');
  await sleep(3000);
  const read = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img')).map((img) => { const r = img.getBoundingClientRect(); return { src: img.getAttribute('src') || '', l: r.left, r: r.right, w: r.width, h: r.height, natural: [img.naturalWidth, img.naturalHeight] }; }));
  check(`${T}, Lecture : le graphique est une seule image PNG de 1 440 x 900, entière dans le panneau, la même que celle de l'éditeur`, read.length === 1 && read[0].src === editorSrc && read[0].natural[0] === 1440 && read[0].natural[1] === 900 && read[0].l >= -0.5 && read[0].r <= WIDTH + 0.5 && read[0].w > 100, { count: read.length, same: read[0] && read[0].src === editorSrc, rect: read[0] && [Math.round(read[0].l), Math.round(read[0].r), Math.round(read[0].w)] });
  await snap(page, `${T}-8-lecture`);
  await click(page, '#btn-mode-edit');
  await sleep(1200);

  // 11) Entonnoir, cascade, jauge (lot 6) : les trois dernières formes, à la vraie souris et au vrai clavier, dans le panneau de 700x400, sur le graphique déjà réglé (titre, jeu « Chaudes », valeurs affichées).
  await waitDrawn(page, '');
  const before6Spec = (await madeNodes(page))[0].spec;
  const before6Src = (await frameInfo(page))[0].src;
  // La page est remontée en haut à chaque fois : un Ctrl+Z ou un Ctrl+Y fait défiler jusqu'au graphique, dont la barre flottante recouvrirait alors le bouton de l'Image.
  const openEdit = async () => {
    await page.evaluate(() => { let n = document.querySelector('.tiptap'); while (n && n !== document.documentElement) { if (n.scrollHeight > n.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)) { n.scrollTop = 0; break; } n = n.parentElement; } });
    await sleep(300);
    await click(page, FRAME);
    await sleep(300);
    await hoverRow(page, '#v2-btn-image', '#v2-btn-chart-make');
    await page.mouse.click(...(await page.evaluate(() => { const r = document.getElementById('v2-btn-chart-make').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
    await page.waitForFunction(() => { const m = document.getElementById('pp-chartmake-modal'); return !!m && m.style.display !== 'none'; }, null, { timeout: 15000 });
    await settle(page);
  };
  const settings = () => page.evaluate(() => {
    const shown = sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
    const note = document.querySelector('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note');
    const max = document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-max"]');
    const total = document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-total"]');
    return {
      kind: (document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-kind"]:checked') || {}).value,
      stack: shown('#pp-chartmake-modal input[name="pp-chartmake-stack"]'), horizontal: shown('#pp-chartmake-modal input[name="pp-chartmake-horizontal"]'), total: shown('#pp-chartmake-modal input[name="pp-chartmake-total"]'), totalOn: total.checked, totalText: total.closest('label').textContent.trim(),
      max: shown('#pp-chartmake-modal input[name="pp-chartmake-max"]'), maxValue: max.value, placeholder: max.placeholder, maxText: max.closest('label').textContent.trim(), options: shown('#pp-chartmake-modal .pp-chartmake-options'),
      legend: document.querySelector('#pp-chartmake-modal .pp-chartmake-values legend').textContent.trim(), oneLegend: I18n.t('chart.make.values.one'), note: note && !note.hidden ? note.textContent.trim() : '', maxNote: shown('#pp-chartmake-max-note') ? document.getElementById('pp-chartmake-max-note').textContent.trim() : '',
      values: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-value input')).filter(i => i.checked).map(i => i.value),
    };
  });
  await openEdit();
  const sameHeight = name => Math.abs(heights[name] - heights['data-pie']) <= 1;
  await click(page, KIND('funnel'));
  await sleep(200);
  await settle(page);
  const funnel = await settings();
  const funnelSrc = await previewSrc(page);
  const funnelFits = await geometry('data-funnel');
  check(`${T}, entonnoir : un clic choisit « ${X.kinds[7]} » (ni « Empilées » ni « Horizontales », ni total, ni maximum : la rangée des réglages se cache), une seule valeur reste cochée, l'aperçu change, la fenêtre garde sa hauteur sans défiler`,
    funnel.kind === 'funnel' && !funnel.stack && !funnel.horizontal && !funnel.total && !funnel.max && !funnel.options && funnel.legend === funnel.oneLegend && funnel.values.join() === 'Montant'
      && await state(page) === 'chart' && funnelSrc.startsWith('data:image/png') && funnelSrc !== before6Src && funnelFits && sameHeight('data-funnel'), { funnel, fits: funnelFits, heights });
  await snap(page, `${T}-14-entonnoir`);
  await click(page, KIND('waterfall'));
  await sleep(200);
  await settle(page);
  const fall = await settings();
  const fallSrc = await previewSrc(page);
  const fallFits = await geometry('data-waterfall');
  const fallColors = { label: await contrastOf(page, `${WIN} .pp-chartmake-options > .pp-chartmake-option:nth-child(3) span`), note: await contrastOf(page, `${WIN} .pp-chartmake-values .pp-chart-note`) };
  check(`${T}, cascade : un clic choisit « ${X.kinds[8]} », « ${X.total} » apparaît coché d'office (ni « Empilées » ni « Horizontales », ni maximum), l'aperçu change, la fenêtre garde sa hauteur sans défiler, le texte a un contraste d'au moins 4,5:1`,
    fall.kind === 'waterfall' && fall.total && fall.totalOn && fall.totalText === X.total && !fall.stack && !fall.horizontal && !fall.max && fall.options && fall.legend === fall.oneLegend && fall.values.join() === 'Montant'
      && fallSrc.startsWith('data:image/png') && fallSrc !== funnelSrc && fallFits && sameHeight('data-waterfall') && fallColors.label >= 4.5, { fall, fits: fallFits, fallColors, heights });
  await snap(page, `${T}-15-cascade`);
  // La cascade sans total : un clic réel sur la case redessine l'aperçu sans le dernier palier.
  await clickLabelOf(page, TOTAL);
  await settle(page);
  const noTotal = { on: await isChecked(page, TOTAL), src: await previewSrc(page) };
  await clickLabelOf(page, TOTAL);
  await settle(page);
  const backTotal = { on: await isChecked(page, TOTAL), src: await previewSrc(page) };
  check(`${T}, cascade : un clic sur « ${X.total} » le décoche (l'aperçu change), un autre le rend (la même image qu'avant)`, !noTotal.on && noTotal.src !== fallSrc && backTotal.on && backTotal.src === fallSrc, { noTotal: noTotal.on, changed: noTotal.src !== fallSrc, back: backTotal.on, same: backTotal.src === fallSrc });
  await click(page, TAB('aspect'));
  await sleep(250);
  const fallAspect = await page.evaluate(() => {
    const shown = sel => { const e = document.querySelector(sel); return !!e && !e.hidden && e.getClientRects().length > 0; };
    return { series: shown('#pp-chartmake-modal .pp-chartmake-series'), note: (document.querySelector('#pp-chartmake-panel-aspect > .pp-chart-note') || {}).textContent, palettes: shown('#pp-chartmake-modal .pp-chartmake-palettes') };
  });
  const fallAspectFits = await geometry('aspect-waterfall');
  const fallNote = await contrastOf(page, '#pp-chartmake-panel-aspect > .pp-chart-note');
  check(`${T}, cascade, onglet « ${X.tabs[1]} » : pas de séries, la note dit « ${X.steps} » (contraste ${fallNote}), les jeux de couleurs restent ; entier dans le panneau, sans défiler, à la même hauteur`,
    !fallAspect.series && fallAspect.note === X.steps && fallAspect.palettes && fallNote >= 4.5 && fallAspectFits && sameHeight('aspect-waterfall'), { fallAspect, fallAspectFits, fallNote, heights });
  await click(page, TAB('data'));
  await sleep(200);
  await click(page, KIND('gauge'));
  await sleep(200);
  await settle(page);
  const gauge = await settings();
  const gaugeSrc = await previewSrc(page);
  const gaugeFits = await geometry('data-gauge');
  const gaugeColors = { label: await contrastOf(page, `${WIN} .pp-chartmake-max span`), input: await contrastOf(page, `${WIN} .pp-chartmake-max-input`), note: await contrastOf(page, `${WIN} #pp-chartmake-max-note`) };
  check(`${T}, jauge : un clic choisit « ${X.kinds[9]} », le champ « ${X.max} » apparaît vide avec 100 en filigrane (ni total, ni « Empilées »), la note dit « ${X.gaugeNote} » sur la même rangée, l'aperçu change, la fenêtre garde sa hauteur sans défiler, textes à 4,5:1 au moins`,
    gauge.kind === 'gauge' && gauge.max && gauge.maxValue === '' && gauge.placeholder === '100' && gauge.maxText === X.max && !gauge.total && !gauge.stack && !gauge.horizontal && gauge.maxNote === X.gaugeNote && gauge.note === '' && fall.maxNote === '' && funnel.maxNote === '' && gauge.values.join() === 'Montant'
      && gaugeSrc.startsWith('data:image/png') && gaugeSrc !== fallSrc && gaugeFits && sameHeight('data-gauge') && Object.values(gaugeColors).every(v => v !== null && v >= 4.5), { gauge, fits: gaugeFits, gaugeColors, heights });
  await snap(page, `${T}-16-jauge`);
  // Le maximum se tape au vrai clavier : l'aperçu change, effacé il revient à celui d'avant, retapé il redonne le même.
  await click(page, MAX_INPUT);
  await page.keyboard.type('250', { delay: 40 });
  await settle(page);
  const typedMax = { value: await page.evaluate(sel => document.querySelector(sel).value, MAX_INPUT), src: await previewSrc(page) };
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await settle(page);
  const clearedMax = { value: await page.evaluate(sel => document.querySelector(sel).value, MAX_INPUT), src: await previewSrc(page) };
  await page.keyboard.type('250', { delay: 40 });
  await settle(page);
  const retypedMax = await previewSrc(page);
  check(`${T}, jauge : taper 250 dans « ${X.max} » redessine l'aperçu, l'effacer rend celui de 100, le retaper redonne celui de 250`,
    typedMax.value === '250' && typedMax.src !== gaugeSrc && clearedMax.value === '' && clearedMax.src === gaugeSrc && retypedMax === typedMax.src, { typedMax: typedMax.value, changed: typedMax.src !== gaugeSrc, clearedMax: clearedMax.value, back: clearedMax.src === gaugeSrc, same: retypedMax === typedMax.src });
  // Entrée dans le maximum valide la fenêtre : le graphique garde la jauge, son maximum, le titre et le jeu déjà réglés, et se redessine.
  await page.keyboard.press('Enter');
  await sleep(400);
  const drawnGauge = await waitDrawn(page, before6Src);
  const gaugeNodes = await madeNodes(page);
  const gaugeFrame = (await frameInfo(page))[0];
  const gaugeSpec = gaugeNodes[0] && gaugeNodes[0].spec;
  check(`${T}, jauge : Entrée dans « ${X.max} » valide la fenêtre ; le graphique est une jauge au maximum 250 (une seule valeur, ni total ni mélange), garde le titre, le jeu « ${X.palettes[2]} » et les valeurs affichées, et se redessine`,
    !(await winOpen(page)) && drawnGauge && gaugeNodes.length === 1 && gaugeSpec.kind === 'gauge' && gaugeSpec.max === 250 && gaugeSpec.values.join() === 'Montant' && gaugeSpec.total === undefined && gaugeSpec.mix === undefined && gaugeSpec.stack === undefined
      && gaugeSpec.title === 'Ventes & coûts' && gaugeSpec.palette === 'warm' && gaugeSpec.labels === true && gaugeNodes[0].name === 'Ventes & coûts' && gaugeNodes[0].width === '480px' && !gaugeNodes[0].src && gaugeFrame.src !== before6Src,
    { drawnGauge, spec: gaugeSpec, name: gaugeNodes[0] && gaugeNodes[0].name });
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undoneGauge = await madeNodes(page);
  check(`${T}, jauge : un seul Ctrl+Z rend la définition d'avant (les barres, sans maximum)`, undoneGauge.length === 1 && JSON.stringify(undoneGauge[0].spec) === JSON.stringify(before6Spec) && undoneGauge[0].spec.max === undefined, undoneGauge.map(n => n.spec));
  await page.keyboard.press('Control+y');
  await sleep(500);
  await waitDrawn(page, '');
  // La fenêtre rouverte relit la forme et le maximum ; Échap la ferme sans toucher au graphique.
  await openEdit();
  const reopened = await settings();
  const specKept = JSON.stringify((await madeNodes(page))[0].spec);
  await page.keyboard.press('Escape');
  await sleep(300);
  check(`${T}, jauge : la fenêtre rouverte relit « ${X.kinds[9]} » et son maximum (250) ; Échap la ferme sans toucher au graphique`,
    reopened.kind === 'gauge' && reopened.max && reopened.maxValue === '250' && reopened.values.join() === 'Montant' && !(await winOpen(page)) && JSON.stringify((await madeNodes(page))[0].spec) === specKept, { reopened, closed: !(await winOpen(page)) });

  check(`${T}, aucune boîte native du navigateur ni erreur de page pendant tout le parcours`, dialogs.length === 0 && errors.length === 0, { dialogs, errors });
  await page.close();
}

await runPass('fr', 'light');
await runPass('en', 'dark');
await t.finish();
