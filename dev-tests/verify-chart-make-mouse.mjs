#!/usr/bin/env node
// « Créer un graphique… » (lot 1 du module de graphiques ; extensions/graphique/chart-make.js, chart-make-ui.js, chart-make.css ; js/chart-entry.js, js/main-toolbar.js, index.html) : le panneau de 700x400, à la VRAIE
// souris (page.mouse) et au VRAI clavier (frappe, flèches, Tab, Entrée, Échap, Ctrl+Z), hébergé par GFS (simulé par dev-tests/gfs-stub.js), les extensions « graphique » et « diapositives » actives, en français
// clair puis en anglais sombre. Ce que dev-tests/scenarios-chart-make.js ne peut pas voir depuis la page :
//  - le survol de l'Image ouvre son menu : la ligne « Créer un graphique… » y est, entière dans le panneau et au premier plan, sous « Image depuis une variable… » ; le menu « Lien et blocs de contenu »
//    garde ses neuf lignes, la dernière entière dans le panneau (une dixième n'y tiendrait pas : c'est pourquoi la ligne est dans le menu de l'Image) ;
//  - un clic sur la ligne ouvre la fenêtre : elle tient dans 700x400 sans défiler, les sept formes tiennent sur une rangée, le focus est dans le champ de la table, « Insérer » est grisé ;
//    tous les textes (titre, libellés, formes choisie et non choisie, notes, ligne grisée, « Annuler ») ont un contraste d'au moins 4,5:1 ;
//  - une forme se choisit au clic (celle d'avant se décoche, « Empilées » et « Horizontales » ne restent que pour les barres) et aux flèches du clavier ;
//  - la liste des tables s'ouvre AU-DESSUS de la fenêtre et dans le panneau, se filtre à la frappe et se valide par Entrée ; l'aperçu montre le vrai graphique dans la feuille blanche ; une colonne cochée et
//    « toute la table » changent l'image ;
//  - Tab ne sort pas de la fenêtre, Échap la ferme sans toucher au texte ;
//  - « Insérer » pose le graphique dessiné dans le cadre (le modèle ne garde que sa définition) ; un clic le sélectionne, la ligne devient « Modifier le graphique… » et rouvre la fenêtre sur ses réglages ;
//    valider une autre forme le redessine, un Ctrl+Z rend l'ancienne ; la Lecture montre la même image dans le panneau ;
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
    kinds: ['Barres', 'Courbe', 'Aire', 'Nuage', 'Secteurs', 'Anneau', 'Radar'], sameTable: 'Indisponible sur la table de la page.', imageLabel: 'Ajouter une image',
  },
  en: {
    row: 'Create a chart…', rowEdit: 'Edit chart…', pageRow: 'Chart from the page…', title: 'Create a chart', titleEdit: 'Edit the chart', insert: 'Insert', confirm: 'Confirm',
    kinds: ['Bars', 'Line', 'Area', 'Scatter', 'Pie', 'Donut', 'Radar'], sameTable: 'Unavailable on the page’s table.', imageLabel: 'Add an image',
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
const KINDS = ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar'];

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

  // 1) Le menu de l'Image : la ligne est dedans, entière dans le panneau et au premier plan ; le menu des blocs garde ses neuf lignes.
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
  await hoverRow(page, '#v2-btn-link', '#v2-btn-slide-text');
  const blocks = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row'));
    const last = rows[rows.length - 1].getBoundingClientRect();
    return { ids: rows.map(r => r.id), lastBottom: last.bottom, chart: (document.getElementById('v2-btn-chart') || {}).textContent.trim() };
  });
  check(`${T}, menu des blocs : il garde ses neuf lignes (celle du graphique de la page comprise), la dernière entière dans le panneau`,
    blocks.ids.length === 9 && !blocks.ids.includes('v2-btn-chart-make') && blocks.chart === X.pageRow && blocks.lastBottom <= HEIGHT + 0.5 && blocks.ids[8] === 'v2-btn-slide-text', blocks);
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
  check(`${T}, fenêtre : les sept formes tiennent sur une seule rangée, dans l'ordre`, pills.map(p => p.t).join() === X.kinds.join() && new Set(pills.map(p => p.top)).size === 1 && pills[6].right <= box.r, pills);
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
  const pieSrc = frameAfter ? frameAfter.src : '';
  await page.keyboard.press('Control+z');
  await sleep(500);
  const undone = await madeNodes(page);
  check(`${T}, modification : un seul Ctrl+Z rend l'ancienne définition`, undone.length === 1 && undone[0].spec.kind === 'area' && undone[0].spec.values.join() === 'Montant,Cout', undone.map(n => n.spec));
  await page.keyboard.press('Control+y');
  await sleep(500);
  const redone = await madeNodes(page);
  check(`${T}, modification : Ctrl+Y la rend`, redone.length === 1 && redone[0].spec.kind === 'pie', redone.map(n => n.spec));

  // 9) La Lecture : la même image, dans le panneau.
  await waitDrawn(page, '');
  const editorSrc = (await frameInfo(page))[0].src;
  await click(page, '#btn-mode-read');
  await sleep(3000);
  const read = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img')).map((img) => { const r = img.getBoundingClientRect(); return { src: img.getAttribute('src') || '', l: r.left, r: r.right, w: r.width, h: r.height, natural: [img.naturalWidth, img.naturalHeight] }; }));
  check(`${T}, Lecture : le graphique est une seule image PNG de 1 440 x 900, entière dans le panneau, la même que celle de l'éditeur`, read.length === 1 && read[0].src === editorSrc && read[0].natural[0] === 1440 && read[0].natural[1] === 900 && read[0].l >= -0.5 && read[0].r <= WIDTH + 0.5 && read[0].w > 100 && pieSrc === editorSrc, { count: read.length, same: read[0] && read[0].src === editorSrc, rect: read[0] && [Math.round(read[0].l), Math.round(read[0].r), Math.round(read[0].w)] });
  await snap(page, `${T}-8-lecture`);
  await click(page, '#btn-mode-edit');
  await sleep(1200);

  check(`${T}, aucune boîte native du navigateur ni erreur de page pendant tout le parcours`, dialogs.length === 0 && errors.length === 0, { dialogs, errors });
  await page.close();
}

await runPass('fr', 'light');
await runPass('en', 'dark');
await t.finish();
