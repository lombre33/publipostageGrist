#!/usr/bin/env node
// La PAGE du modèle dans l'écriture en direct (extensions/edition/live-page.js, js/page-layout.js ; carte d'Antoine du 03/11 « thème, décor et format de page partagés en direct »), dans un vrai navigateur
// à 700x400, avec des pages du widget qui partagent UNE table du direct (dev-tests/live-test-kit.mjs, GFS simulé avec les extensions « édition » et « diapositives »). Trois personnes : Alice (A) et
// Bob (B) écrivent, Carole (C) arrive après les gestes. Tous les gestes de la page sont faits à la VRAIE souris (le menu Page, la fenêtre Thème…, les Réglages), sauf le décor, que la fenêtre
// du thème range dans la même clé du thème : il passe par le geste que cette fenêtre fait.
//   1) une présentation : Alice choisit le rapport 4:3 au menu Page, Bob a la même page (format, taille, coche du menu) ; Bob applique un thème qui recolore un texte, Alice a le même thème et le même texte ;
//   2) Annuler et Rétablir par personne : le geste de la page se range avec les frappes, dans l'ordre ; chacun ne défait que le sien ; un thème qui recolore le texte se défait d'UN Ctrl+Z ;
//   3) le décor du thème (un bandeau, un pied) arrive chez l'autre et se défait ;
//   4) l'arrivée tardive : Carole prend la page du groupe, pas celle de son modèle enregistré ;
//   5) l'enregistrement : la page changée par la personne qui n'enregistre pas n'est plus perdue (la personne qui enregistre écrit celle du groupe, sans que personne ne tape, et elle seule écrit) ; une page
//      reçue n'est pas un réglage de celle qui la reçoit (elle n'enregistre rien à la place de l'autre) ; les autres adoptent l'enregistrement (aucun bandeau, y compris pour Carole, arrivée en retard) ;
//      rien ne repart en écho ;
//   6) un document : sens, format et marges (préréglage des Réglages, chiffres tapés) partagés, Ctrl+Z par personne ;
//   7) gardes : ni erreur de page, ni message de la console.
// Lancé par run-headless.mjs (groupe Node "livePage", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-page.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { startKit, liveFileExists, editorText, until, dialogShown, pressDialogButton, startLive, stopLive, converge, typeAt } from './live-test-kit.mjs';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const finish = () => { console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!liveFileExists) {
  check('le fichier assemblé « edition-live » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  finish();
}

const WIDTH = 700, HEIGHT = 400;
// Une présentation de deux diapositives dont un texte porte la couleur du texte d'une présentation sans thème (#1b2430) : un thème la recolore.
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const DECK = `<h1>Titre un</h1><p><span style="color: #1b2430">Texte teinté</span></p>${BR}<h2>Deux</h2><p>Second texte</p>`;
const templates = [
  { id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p><p>Seconde ligne</p>', def: true, type: 'document' },
  { id: 2, nom: 'Présentation', contenu: DECK, def: false, type: 'presentation' },
];
const RATIO_16_9 = '190.5x338.7', RATIO_4_3 = '190.5x254', RATIO_1_1 = '190.5x190.5';

const kit = await startKit({ port: Number(process.env.LIVE_PAGE_PORT || 8988) });
const table = kit.newTable();
const extensions = ['edition', 'diapositives'];
const A = await kit.openPage({ table, templates, extensions, identity: { name: 'Alice', email: 'alice@example.com' } });
const B = await kit.openPage({ table, templates, extensions, identity: { name: 'Bob', email: 'bob@example.com' } });
const C = await kit.openPage({ table, templates, extensions, identity: { name: 'Carole', email: 'carole@example.com' } });
const named = { A: A.page, B: B.page, C: C.page };
const consoleProblems = [];
let step = 'départ';
const section = (title) => { step = title.split(')')[0]; console.log('\n== ' + title + ' =='); };
for (const [name, page] of Object.entries(named)) {
  page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) consoleProblems.push(`${name} ${message.type()} [${step}] : ${message.text().slice(0, 240)}`); });
}

// ---- Les gestes (vraie souris) ---------------------------------------------------------------------------------------------------------------

const boxOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
// Un vrai clic : la souris vient de la gauche sur l'élément, s'y arrête un instant, appuie.
async function realClick(page, selector, wait = 300) {
  const c = await boxOf(page, selector);
  if (!c || !c.width) throw new Error('introuvable ou masqué : ' + selector);
  await page.mouse.move(c.x - 12, c.y, { steps: 2 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(80);
  await page.mouse.click(c.x, c.y);
  await sleep(wait);
  return c;
}
// La souris se gare dans la feuille, à gauche des menus de la barre : un menu ouvert dont la souris ne sort pas ne se remet pas à jour.
const away = async (page) => { await page.mouse.move(300, HEIGHT - 70, { steps: 4 }); await sleep(250); };
// Le menu Page s'ouvre au survol de son bouton.
async function openPageMenu(page) {
  const btn = await boxOf(page, '#btn-page-orientation');
  await page.mouse.move(btn.x - 14, btn.y - 6, { steps: 2 });
  await page.mouse.move(btn.x, btn.y, { steps: 4 });
  await sleep(350);
  return btn;
}
async function pageMenuClick(page, selector) {
  await openPageMenu(page);
  const c = await boxOf(page, selector);
  if (!c || !c.width) throw new Error('ligne du menu Page introuvable ou masquée : ' + selector);
  // La souris arrive près de la ligne d'un seul saut : un long trajet à travers la barre refermerait le menu au survol avant d'y arriver.
  await page.mouse.move(c.x - 10, c.y);
  await page.mouse.move(c.x, c.y, { steps: 2 });
  await sleep(120);
  await page.mouse.click(c.x, c.y);
  await sleep(500);
  await away(page);
}
// Le thème : la ligne « Thème… » du menu Page, une ligne de la fenêtre, « Appliquer ».
async function applyTheme(page, id) {
  await pageMenuClick(page, '#v2-btn-slide-theme');
  await page.waitForFunction(() => { const o = document.getElementById('pp-slide-theme'); return !!o && getComputedStyle(o).display !== 'none'; }, null, { timeout: 8000 });
  await realClick(page, `#pp-slide-theme .pp-slide-theme-row[data-value="${id}"]`, 200);
  await realClick(page, '#pp-slide-theme .pp-modal-actions .var-modal-primary', 500);
  await away(page);
}
async function pressUndo(page) { await page.evaluate(() => EditorCore.getEditor().view.focus()); await page.keyboard.press('Control+z'); await sleep(350); }
async function pressRedo(page) { await page.evaluate(() => EditorCore.getEditor().view.focus()); await page.keyboard.press('Control+y'); await sleep(350); }

// ---- Ce qu'on lit ------------------------------------------------------------------------------------------------------------------------------

const pageOf = page => page.evaluate(() => PageLayout.snapshot());
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const formatOf = page => page.evaluate(() => PageLayout.getFormat());
const themeOf = page => page.evaluate(() => PageLayout.getTheme());
// Les couleurs de texte de l'éditeur, avec le début de chaque morceau.
const textColors = page => page.evaluate(() => {
  const out = [];
  const hex = (css) => { const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(css.trim()); return m ? '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('') : css.toLowerCase(); };
  EditorCore.getEditor().state.doc.descendants((node) => { if (node.isText) node.marks.forEach((m) => { if (m.type.name === 'textStyle' && m.attrs.color) out.push(hex(m.attrs.color) + ':' + node.text.slice(0, 12)); }); return true; });
  return out;
});
const decorOf = page => page.evaluate(() => ({ pages: document.querySelectorAll('#editor-container .tiptap .pp-slide-decor').length, texts: Array.from(document.querySelectorAll('#editor-container .tiptap .pp-slide-decor-text')).map(e => e.textContent) }));
const model = (page, id = 2) => page.evaluate((wanted) => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles; const at = m.id.indexOf(wanted);
  return at < 0 ? null : { contenu: m.Contenu[at], dateModif: m.DateModif[at], margins: m.Margins[at] };
}, id);
const savedPage = async (page, id) => { const m = await model(page, id); try { return m && m.margins ? JSON.parse(m.margins) : null; } catch (e) { return null; } };
const flagsOf = page => page.evaluate(() => ({ scribe: LiveEntry.isScribe(), unsaved: LiveEntry.hasUnsavedEdits(), banner: document.getElementById('autosave-conflict-banner').style.display !== 'none', known: LiveEntry.savedDate() }));
// Le nombre d'enregistrements du modèle faits par CETTE page (le socle prévient l'écriture en direct de chacun : LiveEntry.published).
const countSaves = page => page.evaluate(() => {
  if (!window.__saveCount) {
    window.__saveCount = { n: 0 };
    const original = LiveEntry.published;
    LiveEntry.published = (token, modified) => { window.__saveCount.n++; return original(token, modified); };
  }
  return window.__saveCount.n;
});
async function openTemplate(page, id) {
  await page.evaluate((wanted) => { const select = document.getElementById('template-select'); select.value = String(wanted); select.dispatchEvent(new Event('change')); }, id);
  if (await page.waitForFunction(dialogShown, null, { timeout: 1500 }).then(() => true, () => false)) await pressDialogButton(page, 'Ne pas enregistrer');
  await until(page, wanted => Templates.getCurrentId() != null && String(Templates.getCurrentId()) === String(wanted), id, 60000);
  await page.waitForTimeout(700);
}
// Attend qu'une condition, évaluée dans chaque page, soit vraie (la page change en moins d'une seconde quand les deux se parlent). Une attente qui échoue ne coupe pas l'essai : la vérification qui suit dit ce qu'on voit.
const allUntil = (pages, fn, arg, timeout = 20000) => Promise.all(pages.map(p => until(p, fn, arg, timeout))).then(() => true, () => false);

// ---- 1) Le rapport de la diapositive et le thème -------------------------------------------------------------------------------------------

section('1) Une présentation : le rapport de la diapositive et le thème');
await openTemplate(A.page, 2); await openTemplate(B.page, 2); await openTemplate(C.page, 2);
const started = await startLive(A.page);
check('Alice démarre l\'écriture en direct de la présentation', started.started === true);
const joined = await startLive(B.page, { ask: true, answer: 'Rejoindre' });
check('Bob la rejoint', joined.started === true);
await converge([A.page, B.page]);
const base = await pageOf(A.page);
check('au départ les deux pages ont la même page : 16:9, sans thème', sameJson(base, await pageOf(B.page)) && base.format === RATIO_16_9 && !base.theme, [base, await pageOf(B.page)]);

await pageMenuClick(A.page, `#v2-page-ratios [data-page-ratio="${RATIO_4_3}"]`);
await allUntil([B.page], fmt => PageLayout.getFormat() === fmt, RATIO_4_3);
const sizeA = await A.page.evaluate(() => PageLayout.getPageSizeMm());
const sizeB = await B.page.evaluate(() => PageLayout.getPageSizeMm());
check('le rapport 4:3 choisi par Alice au menu Page est celui de la page de Bob (même format, même taille de diapositive)', await formatOf(A.page) === RATIO_4_3 && await formatOf(B.page) === RATIO_4_3 && sameJson(sizeA, sizeB), { sizeA, sizeB });
check('la page entière est la même des deux côtés (marges, sens, format)', sameJson(await pageOf(A.page), await pageOf(B.page)), [await pageOf(A.page), await pageOf(B.page)]);
await openPageMenu(B.page);
const ratioChecked = await B.page.evaluate(() => Array.from(document.querySelectorAll('#v2-page-ratios [data-page-ratio]')).filter(e => e.getAttribute('aria-checked') === 'true').map(e => e.getAttribute('data-page-ratio')));
await away(B.page);
check('le menu Page de Bob coche le rapport 4:3', sameJson(ratioChecked, [RATIO_4_3]), ratioChecked);

const colorsBefore = await textColors(A.page);
check('au départ le texte teinté porte la couleur du texte sans thème (#1b2430)', colorsBefore.some(c => c.startsWith('#1b2430:Texte teint')), colorsBefore);
await applyTheme(B.page, 'ocean');
await allUntil([A.page, B.page], () => !!PageLayout.getTheme() && PageLayout.getTheme().colors.title === '#0b3c5d');
await converge([A.page, B.page]);
check('le thème « Océan » appliqué par Bob à la fenêtre est celui de la page d\'Alice', sameJson(await themeOf(A.page), await themeOf(B.page)) && (await themeOf(A.page)).colors.title === '#0b3c5d', [await themeOf(A.page), await themeOf(B.page)]);
const colorsA = await textColors(A.page), colorsB = await textColors(B.page);
check('le texte teinté est recoloré (#1e2a35) des deux côtés : le thème et la recoloration sont un seul geste', colorsA.some(c => c.startsWith('#1e2a35:Texte teint')) && sameJson(colorsA, colorsB), { colorsA, colorsB });
check('le rapport 4:3 d\'Alice est resté (le thème de Bob n\'a pas touché au format)', await formatOf(A.page) === RATIO_4_3 && await formatOf(B.page) === RATIO_4_3);

// ---- 2) Annuler et Rétablir par personne -------------------------------------------------------------------------------------------------

section('2) Annuler et Rétablir par personne');
await pressUndo(A.page);
await allUntil([A.page, B.page], fmt => PageLayout.getFormat() === fmt, RATIO_16_9);
check('Ctrl+Z d\'Alice défait SON geste (le rapport 4:3, il redevient 16:9), chez les deux', await formatOf(A.page) === RATIO_16_9 && await formatOf(B.page) === RATIO_16_9);
check('... et le thème de Bob reste, avec son texte recoloré', !!(await themeOf(A.page)) && (await textColors(A.page)).some(c => c.startsWith('#1e2a35:Texte teint')), [await themeOf(A.page), await textColors(A.page)]);
await pressUndo(B.page);
await allUntil([A.page, B.page], () => !PageLayout.getTheme());
await converge([A.page, B.page]);
const afterBobUndo = await textColors(B.page);
check('UN Ctrl+Z de Bob défait son thème ET la recoloration du texte (un seul geste), chez les deux', !(await themeOf(A.page)) && !(await themeOf(B.page)) && afterBobUndo.some(c => c.startsWith('#1b2430:Texte teint')) && sameJson(afterBobUndo, await textColors(A.page)), { afterBobUndo, onA: await textColors(A.page) });
check('... et le rapport reste celui qu\'Alice a défait (16:9)', await formatOf(A.page) === RATIO_16_9 && await formatOf(B.page) === RATIO_16_9);

await pressRedo(B.page);
await allUntil([A.page, B.page], () => !!PageLayout.getTheme());
await converge([A.page, B.page]);
check('Ctrl+Y de Bob refait le thème et la recoloration d\'un coup, chez les deux', !!(await themeOf(A.page)) && (await textColors(A.page)).some(c => c.startsWith('#1e2a35:Texte teint')) && sameJson(await textColors(A.page), await textColors(B.page)), [await themeOf(A.page), await textColors(A.page)]);
await pressRedo(A.page);
await allUntil([A.page, B.page], fmt => PageLayout.getFormat() === fmt, RATIO_4_3);
check('Ctrl+Y d\'Alice refait son rapport 4:3, chez les deux, sans toucher au thème', await formatOf(B.page) === RATIO_4_3 && !!(await themeOf(B.page)));

// Les frappes et la page s'enchaînent dans l'ordre des gestes : mot, rapport, mot ; trois Ctrl+Z les défont à l'envers.
await typeAt(A.page, 'end', ' mot1');
await sleep(900);
await pageMenuClick(A.page, `#v2-page-ratios [data-page-ratio="${RATIO_1_1}"]`);
await sleep(300);
await typeAt(A.page, 'end', ' mot2');
await converge([A.page, B.page]);
check('mot, rapport 1:1, mot : chez Bob aussi', (await editorText(B.page)).includes('mot1 mot2') && await formatOf(B.page) === RATIO_1_1);
await pressUndo(A.page);
await converge([A.page, B.page]);
check('Ctrl+Z n° 1 défait le dernier mot seulement (le rapport reste 1:1)', !(await editorText(A.page)).includes('mot2') && (await editorText(A.page)).includes('mot1') && await formatOf(A.page) === RATIO_1_1, [await editorText(A.page), await formatOf(A.page)]);
await pressUndo(A.page);
await allUntil([A.page, B.page], fmt => PageLayout.getFormat() === fmt, RATIO_4_3);
await converge([A.page, B.page]);
check('Ctrl+Z n° 2 défait le rapport (4:3 revient), pas le premier mot', await formatOf(B.page) === RATIO_4_3 && (await editorText(B.page)).includes('mot1'), [await formatOf(B.page), await editorText(B.page)]);
await pressUndo(A.page);
await converge([A.page, B.page]);
check('Ctrl+Z n° 3 défait le premier mot', !(await editorText(B.page)).includes('mot1') && await formatOf(B.page) === RATIO_4_3);

// ---- 3) Le décor du thème ----------------------------------------------------------------------------------------------------------------------

section('3) Le décor du thème');
// Le geste de la fenêtre « Thème… » (extensions/diapositives/slide-theme-ui.js : commit), avec un décor dans le thème : un bandeau et un texte de pied.
await A.page.evaluate(() => {
  const theme = PageLayout.getTheme();
  const gesture = HistoryMarkers.begin('page');
  PageLayout.setTheme(Object.assign({}, theme, { decor: { band: { edge: SlideTheme.BAND_EDGES[0], size: 'medium', color: 'accent1' }, footer: { text: 'Hélianthe SAS', pos: 'bl' } } }));
  gesture.commit();
  Editor.refreshLayout();
  document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
});
await allUntil([B.page], () => { const t = PageLayout.getTheme(); return !!t && !!t.decor; });
await sleep(500);
const decorA = await decorOf(A.page), decorB = await decorOf(B.page);
check('le décor posé par Alice (un bandeau, un pied de page) est dessiné chez elle et chez Bob, sur chacune des deux diapositives', decorA.pages === 2 && sameJson(decorA, decorB) && decorB.texts.length === 2 && decorB.texts.every(t => t === 'Hélianthe SAS'), { decorA, decorB });
await pressUndo(A.page);
await allUntil([A.page, B.page], () => { const t = PageLayout.getTheme(); return !!t && !t.decor; });
await sleep(400);
check('Ctrl+Z d\'Alice retire le décor chez les deux (plus aucun élément de décor), le thème de Bob reste', (await decorOf(A.page)).pages === 0 && (await decorOf(B.page)).pages === 0 && !!(await themeOf(B.page)) && !!(await themeOf(A.page)), [await decorOf(B.page), await themeOf(B.page)]);
await pressRedo(A.page);
await allUntil([A.page, B.page], () => { const t = PageLayout.getTheme(); return !!t && !!t.decor; });
await sleep(400);
check('Ctrl+Y d\'Alice le rend, chez les deux', (await decorOf(A.page)).pages === 2 && (await decorOf(B.page)).pages === 2);

// ---- 4) L'arrivée tardive ----------------------------------------------------------------------------------------------------------------------

section('4) L\'arrivée tardive');
const roomPage = await pageOf(A.page);
const caroleBefore = await pageOf(C.page);
check('avant d\'arriver, Carole a la page de son modèle enregistré (16:9, sans thème)', caroleBefore.format === RATIO_16_9 && !caroleBefore.theme, caroleBefore);
const carole = await startLive(C.page, { ask: true, answer: 'Rejoindre' });
check('Carole rejoint le direct', carole.started === true);
await converge([A.page, B.page, C.page]);
await sleep(500);
check('sa page est celle du groupe : même format, même thème, même décor, mêmes marges', sameJson(await pageOf(C.page), roomPage) && roomPage.format === RATIO_4_3 && !!roomPage.theme && !!roomPage.theme.decor, [await pageOf(C.page), roomPage]);
const decorC = await decorOf(C.page);
check('le décor est dessiné chez elle, et le texte est recoloré comme chez les autres', decorC.pages === 2 && sameJson(await textColors(C.page), await textColors(A.page)) && (await textColors(C.page)).some(c => c.startsWith('#1e2a35:Texte teint')), { decorC, colors: await textColors(C.page) });

// ---- 5) L'enregistrement -----------------------------------------------------------------------------------------------------------------------

section('5) L\'enregistrement');
const people = { A, B, C };
const flags = {};
for (const [name, who] of Object.entries(people)) flags[name] = await flagsOf(who.page);
const scribes = Object.keys(flags).filter(name => flags[name].scribe);
check('exactement une des trois pages est la personne qui enregistre', scribes.length === 1, flags);
const S = people[scribes[0]];
const others = Object.keys(people).filter(name => name !== scribes[0]).map(name => people[name]);
const O = others[0];
const all = [A.page, B.page, C.page];
await allUntil(all, () => !LiveEntry.hasUnsavedEdits(), null, 30000).catch(() => {});

// a) Une page changée par quelqu'un qui n'enregistre pas n'est plus perdue (l'enregistrement de l'autre remettait la sienne) : c'est la personne qui enregistre qui l'écrit, sans que personne ne tape rien.
const savesNow = async () => { const counts = {}; for (const [name, who] of Object.entries(people)) counts[name] = await countSaves(who.page); return counts; };
const beforeA = await savesNow();
await pageMenuClick(O.page, '#v2-page-ratios [data-page-ratio="190.5x304.8"]');
await allUntil(all, fmt => PageLayout.getFormat() === fmt, '190.5x304.8');
let pageOnly = null;
for (let i = 0; i < 40 && !pageOnly; i++) { const margins = await savedPage(S.page, 2); if (margins && margins.format === '190.5x304.8') pageOnly = margins; else await sleep(500); }
await sleep(3500);
const afterA = await savesNow();
check('le rapport 16:10 choisi par la personne qui n\'enregistre pas est écrit dans le modèle par la personne qui enregistre, sans que personne ne tape (et elle seule a écrit)', !!pageOnly && afterA[scribes[0]] - beforeA[scribes[0]] >= 1 && Object.keys(people).filter(n => n !== scribes[0]).every(n => afterA[n] === beforeA[n]), { pageOnly: !!pageOnly, beforeA, afterA });
await typeAt(S.page, 'end', ' sauve');
let saved = null;
for (let i = 0; i < 40 && !saved; i++) {
  const m = await model(S.page);
  const margins = m && m.margins ? JSON.parse(m.margins) : null;
  if (m && m.contenu.includes('sauve') && margins && margins.format === '190.5x304.8') saved = { m, margins }; else await sleep(500);
}
check('la personne qui enregistre écrit le texte ET la page du groupe : le rapport 16:10 choisi par l\'autre, le thème, son décor', !!saved && !!saved.margins.theme && !!saved.margins.theme.decor && saved.margins.theme.colors.title === '#0b3c5d', saved && saved.margins);

// b) Une page reçue n'est pas un réglage de celui qui la reçoit : il n'enregistre rien à la place de l'autre.
await allUntil(all, () => !LiveEntry.hasUnsavedEdits(), null, 30000);
const before = {};
for (const [name, who] of Object.entries(people)) before[name] = await countSaves(who.page);
await pageMenuClick(S.page, `#v2-page-ratios [data-page-ratio="${RATIO_4_3}"]`);
await allUntil(all, fmt => PageLayout.getFormat() === fmt, RATIO_4_3);
let savedAgain = null;
for (let i = 0; i < 40 && !savedAgain; i++) { const margins = await savedPage(S.page, 2); if (margins && margins.format === RATIO_4_3) savedAgain = margins; else await sleep(500); }
await sleep(3500);
const after = {};
for (const [name, who] of Object.entries(people)) after[name] = await countSaves(who.page);
const savesOf = (name) => after[name] - before[name];
check('la page 4:3 changée par la personne qui enregistre est écrite dans le modèle', !!savedAgain && savedAgain.format === RATIO_4_3, savedAgain);
check('elle l\'a enregistrée, et les deux autres, qui ont seulement reçu la page, n\'ont rien enregistré à sa place', savesOf(scribes[0]) >= 1 && Object.keys(people).filter(n => n !== scribes[0]).every(n => savesOf(n) === 0), { before, after });
await allUntil(all, () => !LiveEntry.hasUnsavedEdits(), null, 30000);
check('les autres adoptent cet enregistrement (rien « à enregistrer », pas de bandeau de conflit)', (await Promise.all(all.map(flagsOf))).every(f => !f.unsaved && !f.banner), await Promise.all(all.map(flagsOf)));

// c) Rien ne repart en écho : la table du direct ne reçoit plus rien quand plus personne ne fait rien.
const rowsAt = page => page.evaluate(() => LiveControl.debug().summary.rows);
const rows1 = await rowsAt(A.page);
await sleep(3500);
const rows2 = await rowsAt(A.page);
check('au repos, aucune mise à jour de plus dans la table du direct (pas d\'écho de la page)', rows1 === rows2, [rows1, rows2]);

// ---- 6) Un document ----------------------------------------------------------------------------------------------------------------------------

section('6) Un document : sens, format, marges');
for (const who of [A, B, C]) await stopLive(who.page);
await openTemplate(A.page, 1); await openTemplate(B.page, 1);
check('Alice démarre l\'écriture en direct du document', (await startLive(A.page)).started === true);
check('Bob la rejoint', (await startLive(B.page, { ask: true, answer: 'Rejoindre' })).started === true);
await converge([A.page, B.page]);
const docBase = await pageOf(A.page);
check('au départ : A4 en portrait, les mêmes marges des deux côtés', sameJson(docBase, await pageOf(B.page)) && !docBase.orientation.startsWith('l'), [docBase, await pageOf(B.page)]);

await pageMenuClick(A.page, '#v2-page-flyout [data-page-orientation="landscape"]');
await allUntil([B.page], () => PageLayout.isLandscape());
check('le sens « Paysage » choisi par Alice au menu Page est celui de Bob (même taille de page)', sameJson(await A.page.evaluate(() => PageLayout.getPageSizeMm()), await B.page.evaluate(() => PageLayout.getPageSizeMm())) && await B.page.evaluate(() => PageLayout.isLandscape()));
const a5 = await A.page.evaluate(() => PageLayout.getFormats().find(f => /^a5$/i.test(f.id)).id);
await pageMenuClick(A.page, `#v2-page-flyout [data-page-format="${a5}"]`);
await allUntil([B.page], fmt => PageLayout.getFormat() === fmt, a5);
check('le format A5 choisi par Alice est celui de Bob', await formatOf(B.page) === a5 && sameJson(await pageOf(A.page), await pageOf(B.page)), [await pageOf(A.page), await pageOf(B.page)]);

const openMargins = async (page) => { await realClick(page, '#v2-btn-settings', 500); await realClick(page, '.settings-tab[data-settings-tab="pageMargins"]', 400); };
const closeSettings = async (page) => { await realClick(page, '#settings-close', 300); await away(page); };
const marginsOf = page => page.evaluate(() => { const m = PageLayout.getMarginsMm(); return [m.top, m.right, m.bottom, m.left].map(v => Math.round(v * 100) / 100); });
const marginsBefore = await marginsOf(A.page);
await openMargins(A.page);
await realClick(A.page, '#settings-margin-preset-narrow', 400);
await allUntil([B.page], () => Math.abs(PageLayout.getMarginsMm().left - 12.7) < 0.1);
check('le préréglage « Étroites » choisi dans les Réglages d\'Alice donne les mêmes marges à Bob', sameJson(await marginsOf(A.page), await marginsOf(B.page)) && (await marginsOf(B.page)).every(v => Math.abs(v - 12.7) < 0.1), [await marginsOf(A.page), await marginsOf(B.page)]);
await realClick(A.page, '#settings-margin-left', 200);
await A.page.keyboard.press('Control+A');
await A.page.keyboard.type('18', { delay: 60 });
await allUntil([B.page], () => Math.abs(PageLayout.getMarginsMm().left - 18) < 0.1);
check('des chiffres tapés dans le champ « Gauche » arrivent chez Bob : 18 mm', Math.abs((await marginsOf(B.page))[3] - 18) < 0.1, await marginsOf(B.page));
await closeSettings(A.page);
await pressUndo(A.page);
await allUntil([A.page, B.page], () => Math.abs(PageLayout.getMarginsMm().left - 12.7) < 0.1);
check('UN Ctrl+Z défait les deux chiffres d\'un coup (la marge de gauche redevient celle du préréglage), chez les deux', Math.abs((await marginsOf(A.page))[3] - 12.7) < 0.1 && Math.abs((await marginsOf(B.page))[3] - 12.7) < 0.1, [await marginsOf(A.page), await marginsOf(B.page)]);
await pressUndo(A.page);
await allUntil([A.page, B.page], (before) => Math.abs(PageLayout.getMarginsMm().left - before) < 0.1, marginsBefore[3]);
check('le Ctrl+Z suivant défait le préréglage : les marges d\'avant, chez les deux', sameJson(await marginsOf(A.page), marginsBefore) && sameJson(await marginsOf(B.page), marginsBefore), [await marginsOf(A.page), await marginsOf(B.page), marginsBefore]);

// ---- 7) Les gardes -----------------------------------------------------------------------------------------------------------------------------

section('7) Gardes');
check('aucune erreur de page', kit.pageErrors.length === 0, kit.pageErrors.slice(0, 4));
check('aucun message d\'erreur ou d\'avertissement de la console', consoleProblems.length === 0, consoleProblems.slice(0, 6));

await kit.close();
finish();
