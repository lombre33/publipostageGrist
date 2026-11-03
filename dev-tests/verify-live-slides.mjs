#!/usr/bin/env node
// L'écriture en direct d'une PRÉSENTATION (Slides+ : js/live-entry.js, js/slides-entry.js, extensions/edition/ ; demande d'Antoine du 03/11, « il faut que l'écriture en direct soit possible sur
// Slides+ »), dans un vrai navigateur à 700x400, avec des pages du widget qui partagent UNE table du direct (dev-tests/live-test-kit.mjs, GFS simulé avec les extensions « édition » et
// « diapositives »). Trois personnes : Alice (A) et Bob (B) écrivent, Carole (C) les rejoint pour choisir le même objet que Bob.
//   1) la ligne « Écriture en direct » : utilisable pour une présentation, toujours grisée (avec sa raison, qui nomme le document ET la présentation) pour un modèle e-mail et un macro-modèle ;
//   2) démarrer, rejoindre : le même texte des deux côtés, les cadres, les repères de diapositive ;
//   3) écrire à deux : du texte de diapositive, du texte de cadre, un cadre posé, déplacé, un fond, une transition, des notes, une diapositive de plus par la bande ;
//   4) l'enregistrement : la personne qui enregistre met la présentation du groupe (cadres, texte des cadres, fond, transition, diapositive de plus) dans le modèle, l'autre l'adopte ;
//   5) Annuler et Rétablir par personne : le glissé d'un cadre à la vraie souris est UN Ctrl+Z, une transition de diapositive aussi, les frappes et la transition de l'autre ne sont jamais défaites ;
//   6) l'objet que l'autre a choisi : un anneau de sa couleur et son nom au coin, vus sur une VRAIE capture ; le texte ne bouge pas (le curseur de la bibliothèque, posé entre deux blocs,
//      le décalait d'une ligne) ; plusieurs personnes sur le même objet ; l'objet suit le texte quand l'autre écrit ; le contour part avec le choix, avec la personne, avec le direct ;
//      les miniatures de la bande n'en portent pas ;
//   7) gardes : ni erreur de page, ni message de la console.
// Lancé par run-headless.mjs (groupe Node "liveSlides", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-slides.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { startKit, liveFileExists, liveDebug, editorText, until, dialogShown, pressDialogButton, startLive, stopLive, converge, typeAt } from './live-test-kit.mjs';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const finish = () => { console.log(`\n${total - failures}/${total} passés`); process.exit(failures ? 1 : 0); };

if (!liveFileExists) {
  check('le fichier assemblé « edition-live » du miroir hors-ligne est là (bash dev-tests/offline-deps.sh)', false);
  finish();
}

// Une présentation de trois diapositives : deux cadres libres sur la première, de la liste sur la deuxième.
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const FRAME = (x, y, w, h, html) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" style="--ff-x:${x}pt;--ff-y:${y}pt;--ff-w:${w}pt;--ff-h:${h}pt"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html}</div></div></div>`;
const DECK = `${FRAME(60, 80, 400, 60, '<p>Cadre un</p>')}${FRAME(60, 200, 400, 60, '<p>Cadre deux</p>')}<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<h2>Trois</h2><p>Troisième texte</p>`;
const templates = [
  { id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p><p>Seconde ligne</p>', def: true, type: 'document' },
  { id: 2, nom: 'Présentation', contenu: DECK, def: false, type: 'presentation' },
  { id: 4, nom: 'Courriel', contenu: '<p>Salut</p>', def: false, type: 'email' },
  { id: 6, nom: 'Ensemble', contenu: '{"slots":[]}', def: false, type: 'macro' },
];

const kit = await startKit({ port: Number(process.env.LIVE_SLIDES_PORT || 8943) });
const table = kit.newTable();
const extensions = ['edition', 'diapositives'];
const A = await kit.openPage({ table, templates, extensions, identity: { name: 'Alice', email: 'alice@example.com' } });
const B = await kit.openPage({ table, templates, extensions, identity: { name: 'Bob', email: 'bob@example.com' } });
// Carole porte un nom qui voudrait sortir de la feuille de style (guillemet, point-virgule) : il doit rester du texte.
const HOSTILE = 'Carole" ;outline:9px solid red;--x:"';
const C = await kit.openPage({ table, templates, extensions, identity: { name: HOSTILE, email: 'carole@example.com' } });
const named = { A: A.page, B: B.page, C: C.page };
const consoleProblems = [];
let step = 'départ';
const section = (title) => { step = title.split(')')[0]; console.log('\n== ' + title + ' =='); };
for (const [name, page] of Object.entries(named)) {
  page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) consoleProblems.push(`${name} ${message.type()} [${step}] : ${message.text().slice(0, 240)}`); });
}

// ---- Les gestes -------------------------------------------------------------------------------------------------------------------------------

async function openTemplate(page, id) {
  await page.evaluate((wanted) => { const select = document.getElementById('template-select'); select.value = String(wanted); select.dispatchEvent(new Event('change')); }, id);
  if (await page.waitForFunction(dialogShown, null, { timeout: 1500 }).then(() => true, () => false)) await pressDialogButton(page, 'Ne pas enregistrer');
  await until(page, wanted => Templates.getCurrentId() != null && String(Templates.getCurrentId()) === String(wanted), id, 60000);
  await page.waitForTimeout(600);
}
const model = (page, id = 2) => page.evaluate((wanted) => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles; const at = m.id.indexOf(wanted);
  return at < 0 ? null : { contenu: m.Contenu[at], dateModif: m.DateModif[at], nom: m.Nom[at] };
}, id);
// La ligne « Écriture en direct » du menu : { disabled, title }.
const liveRow = page => page.evaluate(() => { const row = document.getElementById('v2-btn-live'); return { disabled: row.getAttribute('aria-disabled'), title: row.title || '', reason: LiveEntry.reason() }; });
// Les cadres de l'éditeur, dans l'ordre : sa position, la fin de son texte, son texte.
const frames = page => page.evaluate(() => {
  const out = [];
  EditorCore.getEditor().state.doc.descendants((node, pos) => {
    if (node.type.name === 'freeFrame') out.push({ pos, end: pos + node.nodeSize - 2, text: node.textContent, x: node.attrs.x, y: node.attrs.y });
    return node.type.name !== 'freeFrame';
  });
  return out;
});
const countOf = (page, name) => page.evaluate((type) => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === type) n++; return true; }); return n; }, name);
const slideProps = page => page.evaluate(() => { const out = []; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps') out.push(JSON.stringify(node.attrs)); return true; }); return out; });
// Met le curseur à la fin du texte du cadre n° `index` et y tape `text` au vrai clavier.
async function typeInFrame(page, index, text) {
  await page.evaluate(({ at }) => {
    const out = [];
    const ed = EditorCore.getEditor();
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'freeFrame') out.push(pos + node.nodeSize - 2); return node.type.name !== 'freeFrame'; });
    ed.commands.focus();
    ed.commands.setTextSelection(out[at]);
  }, { at: index });
  await page.keyboard.type(text, { delay: 15 });
}
// Les positions que les pages montrent, dans le DOM de l'éditeur (pas dans les miniatures de la bande).
const framePositions = page => page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .tiptap > .pp-free-frame')).map(f => [f.getAttribute('data-ff-x'), f.getAttribute('data-ff-y')].join(',')));
// Ce que la page montre d'une présence d'un objet choisi par un autre : les cadres cernés, leurs noms (propriété de la feuille de style), les curseurs de texte dessinés.
const shown = page => page.evaluate(() => ({
  objects: Array.from(document.querySelectorAll('#editor-container .tiptap .pp-live-object')).map(el => ({ text: el.textContent.slice(0, 14), name: el.style.getPropertyValue('--pp-live-name'), color: el.style.getPropertyValue('--pp-live-color'), ink: el.style.getPropertyValue('--pp-live-ink') })),
  carets: document.querySelectorAll('#editor-container .tiptap .pp-live-caret').length,
}));
const objectsCount = page => page.evaluate(() => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length);
// Le haut de la première ligne de la feuille : il bouge quand un curseur se pose entre deux blocs.
const titleTop = page => page.evaluate(() => { const h = document.querySelector('#editor-container .tiptap h1'); return h ? Math.round(h.getBoundingClientRect().top * 10) / 10 : null; });
// La zone de l'écran d'un cadre (sa boîte) : pour la vraie souris et pour les captures.
const boxOf = (page, index) => page.evaluate((at) => {
  const box = document.querySelectorAll('#editor-container .tiptap > .pp-free-frame > .pp-free-frame-box')[at];
  box.scrollIntoView({ block: 'center' });
  const r = box.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}, index);
// Une VRAIE capture de `clip`, décodée dans la page : les pixels proches de `rgb` (à `tol` près par canal), au total et rangée par rangée.
async function colorStats(page, clip, rgb, tol = 14) {
  const x = Math.max(0, Math.floor(clip.x)), y = Math.max(0, Math.floor(clip.y));
  const width = Math.max(1, Math.min(700 - x, Math.ceil(clip.width))), height = Math.max(1, Math.min(400 - y, Math.ceil(clip.height)));
  const png = await page.screenshot({ clip: { x, y, width, height } });
  return page.evaluate(async ({ b64, target, tolerance }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let count = 0; const rows = new Array(c.height).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - target[0]) <= tolerance && Math.abs(d[i + 1] - target[1]) <= tolerance && Math.abs(d[i + 2] - target[2]) <= tolerance) { count++; rows[Math.floor(i / 4 / c.width)]++; }
    }
    return { count, rows };
  }, { b64: png.toString('base64'), target: rgb, tolerance: tol });
}
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// ---- 1) La ligne du menu ----------------------------------------------------------------------------------------------------------------------

section('1) La ligne « Écriture en direct »');
await openTemplate(A.page, 1);
const forDocument = await liveRow(A.page);
check('un document : la ligne est utilisable (comme avant)', forDocument.disabled === 'false' && forDocument.reason === '', forDocument);
await openTemplate(A.page, 4);
const forEmail = await liveRow(A.page);
check('un modèle e-mail : la ligne reste grisée, avec sa raison, qui nomme le document ET la présentation', forEmail.disabled === 'true' && /seul le texte d.un document ou d.une présentation/.test(forEmail.reason) && forEmail.title === forEmail.reason, forEmail);
check('la raison ne dit plus qu\'une présentation est exclue (« ni une présentation »)', !/ni une présentation/.test(forEmail.reason), forEmail.reason);
await openTemplate(A.page, 6);
const forMacro = await liveRow(A.page);
check('un macro-modèle : grisé, avec la même raison', forMacro.disabled === 'true' && /un document ou d.une présentation/.test(forMacro.reason), forMacro);
await openTemplate(A.page, 2);
const forDeck = await liveRow(A.page);
check('une présentation : la ligne est utilisable, sans raison', forDeck.disabled === 'false' && forDeck.reason === '', forDeck);

// ---- 2) Démarrer, rejoindre -------------------------------------------------------------------------------------------------------------------

section('2) Démarrer et rejoindre une présentation');
await openTemplate(B.page, 2); await openTemplate(C.page, 2);
const first = await startLive(A.page);
check('Alice démarre l\'écriture en direct de la présentation, sans question', first.started === true && (await A.page.evaluate(() => LiveEntry.state())) === 'live', first);
const joined = await startLive(B.page, { ask: true, answer: 'Rejoindre' });
check('Bob la rejoint (la question « Rejoindre ? » vient, il répond Rejoindre)', joined.started === true && !!joined.asked, joined);
const sameStart = await converge([A.page, B.page]);
check('les deux pages montrent la même présentation, cadres compris', sameStart !== null && sameStart.includes('Cadre un') && sameStart.includes('Cadre deux') && (await frames(B.page)).length === 2, sameStart && sameStart.slice(0, 200));
await until(A.page, () => document.querySelectorAll('#live-bar .live-chip').length >= 2, null, 20000);
check('la barre des personnes dit les deux personnes', (await A.page.evaluate(() => document.getElementById('live-bar').textContent)).includes('Bob'), await A.page.evaluate(() => document.getElementById('live-bar').textContent));

// ---- 3) Écrire à deux --------------------------------------------------------------------------------------------------------------------------

section('3) Écrire à deux');
await typeInFrame(A.page, 0, ' Alice-1');
await typeInFrame(B.page, 1, ' Bob-1');
await typeAt(B.page, 'end', ' Fin-Bob');
const typed = await converge([A.page, B.page]);
check('le texte tapé dans deux cadres et dans le texte de la dernière diapositive est le même des deux côtés', typed !== null && typed.includes('Cadre un Alice-1') && typed.includes('Cadre deux Bob-1') && typed.includes('Fin-Bob'), typed && typed.slice(0, 300));

const countBefore = (await frames(A.page)).length;
await Promise.all([A.page.evaluate(() => FreeFrame.insert(EditorCore.getEditor(), 0, {})), B.page.evaluate(() => FreeFrame.insert(EditorCore.getEditor(), 0, {}))]);
await until(A.page, n => { let c = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'freeFrame') c++; return true; }); return c >= n; }, countBefore + 2, 20000);
await converge([A.page, B.page]);
check('deux cadres posés au même instant par deux personnes : les deux y sont, des deux côtés (aucun perdu, aucun en double)', (await frames(A.page)).length === countBefore + 2 && (await frames(B.page)).length === countBefore + 2, [(await frames(A.page)).length, (await frames(B.page)).length]);

const moved = await A.page.evaluate(() => { const ed = EditorCore.getEditor(); let pos = -1; ed.state.doc.descendants((node, p) => { if (node.type.name === 'freeFrame' && pos < 0) pos = p; return node.type.name !== 'freeFrame'; }); FreeFrame.patch(ed, pos, { x: 150, y: 120 }); return pos; });
await until(B.page, () => { const f = document.querySelector('#editor-container .tiptap > .pp-free-frame'); return f && f.getAttribute('data-ff-x') === '150' && f.getAttribute('data-ff-y') === '120'; }, null, 20000);
check('un cadre déplacé par Alice l\'est chez Bob', moved >= 0 && (await framePositions(B.page)).includes('150,120'));

await A.page.evaluate(() => { const ed = EditorCore.getEditor(); SlideProps.applyBackground(ed, [1], '#ffeeaa'); SlideProps.applyNotes(ed, [1], 'Notes d\'Alice'); });
await B.page.evaluate(() => { SlideProps.applyTransition(EditorCore.getEditor(), [2], { transition: 'fade', dur: 0.5 }); });
await until(A.page, () => { let n = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps') n++; return true; }); return n >= 2; }, null, 20000);
await converge([A.page, B.page]);
const propsA = await slideProps(A.page), propsB = await slideProps(B.page);
check('le fond et les notes de la diapositive 2 (Alice) et la transition de la diapositive 3 (Bob) sont chez les deux', propsA.length === 2 && JSON.stringify(propsA) === JSON.stringify(propsB) && propsA.some(p => p.includes('ffeeaa') && p.includes('Notes d')) && propsA.some(p => p.includes('fade')), { propsA, propsB });

const breaksBefore = await countOf(A.page, 'pageBreak');
await A.page.evaluate(() => { const list = document.querySelector('.pp-slide-list'); list.scrollTop = 0; const first = list.querySelector('.pp-slide-item'); first.click(); first.focus(); });
await A.page.click('.pp-slide-add');
await A.page.waitForTimeout(250);
await A.page.evaluate(() => { const items = Array.from(document.querySelectorAll('[role=menuitem]')).filter(e => e.offsetParent); items[0].click(); });
await until(B.page, n => { let c = 0; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'pageBreak') c++; return true; }); return c === n; }, breaksBefore + 1, 20000);
await converge([A.page, B.page]);
check('une diapositive ajoutée par Alice à la bande est chez Bob (un saut de page de plus, une miniature de plus)', (await countOf(B.page, 'pageBreak')) === breaksBefore + 1 && (await B.page.evaluate(() => document.querySelectorAll('.pp-slide-list .pp-slide-item').length)) === (await A.page.evaluate(() => document.querySelectorAll('.pp-slide-list .pp-slide-item').length)));

// ---- 4) L'enregistrement -----------------------------------------------------------------------------------------------------------------------

section('4) L\'enregistrement d\'une présentation');
const flagsOf = page => page.evaluate(() => ({ scribe: LiveEntry.isScribe(), unsaved: LiveEntry.hasUnsavedEdits(), status: document.getElementById('status-msg').textContent, banner: document.getElementById('autosave-conflict-banner').style.display !== 'none' }));
const fa = await flagsOf(A.page), fb2 = await flagsOf(B.page);
check('exactement une des deux pages est la personne qui enregistre', fa.scribe !== fb2.scribe, { fa, fb2 });
const S = fa.scribe ? A : B, O = fa.scribe ? B : A;
await converge([A.page, B.page]);
await typeAt(S.page, 'end', ' Sauvé');
await converge([A.page, B.page]);
let saved = null;
for (let i = 0; i < 40 && !saved; i++) { const m = await model(S.page); if (m && m.contenu.includes('Sauvé')) saved = m; else await S.page.waitForTimeout(500); }
const count = (text, pattern) => (text.match(pattern) || []).length;
check('la personne qui enregistre met la présentation du groupe dans le modèle : le texte des cadres, les 4 cadres, le repère de fond, la transition, la diapositive de plus',
  !!saved && saved.contenu.includes('Cadre un Alice-1') && saved.contenu.includes('Cadre deux Bob-1') && count(saved.contenu, /pp-free-frame"/g) === 4 && saved.contenu.includes('ffeeaa') && saved.contenu.includes('fade') && count(saved.contenu, /page-break-marker/g) === breaksBefore + 1,
  saved ? { frames: count(saved.contenu, /pp-free-frame"/g), bg: saved.contenu.includes('ffeeaa'), fade: saved.contenu.includes('fade'), breaks: count(saved.contenu, /page-break-marker/g) } : await flagsOf(S.page));
await until(O.page, () => !LiveEntry.hasUnsavedEdits(), null, 20000);
const fo = await flagsOf(O.page);
check('l\'autre personne adopte l\'enregistrement : rien « à enregistrer », « Enregistré à… », aucun bandeau de conflit', !fo.unsaved && !fo.banner && /Enregistré à/.test(fo.status), fo);

// ---- 5) Annuler et Rétablir par personne ------------------------------------------------------------------------------------------------------

section('5) Annuler et Rétablir par personne');
const htmlBeforeMouse = await converge([A.page, B.page]);
const posBeforeMouse = await framePositions(A.page);
const box = await boxOf(A.page, 1);
const startX = box.left + box.width * 0.25, startY = box.top + 1;
await A.page.mouse.move(startX, startY); await A.page.mouse.down();
await A.page.mouse.move(startX + 30, startY + 12, { steps: 4 }); await A.page.mouse.move(startX + 60, startY + 24, { steps: 4 });
await A.page.mouse.up();
await until(B.page, before => JSON.stringify(Array.from(document.querySelectorAll('#editor-container .tiptap > .pp-free-frame')).map(f => [f.getAttribute('data-ff-x'), f.getAttribute('data-ff-y')].join(','))) !== before, JSON.stringify(posBeforeMouse), 20000);
const posAfterMouse = await framePositions(A.page);
check('le glissé d\'un cadre à la vraie souris le déplace, chez Alice comme chez Bob', JSON.stringify(posAfterMouse) !== JSON.stringify(posBeforeMouse) && JSON.stringify(await framePositions(B.page)) === JSON.stringify(posAfterMouse), { posBeforeMouse, posAfterMouse });
await typeInFrame(B.page, 0, ' Bob-2');
await converge([A.page, B.page]);
await A.page.evaluate(() => EditorCore.getEditor().view.focus());
await A.page.keyboard.press('Control+z');
await until(A.page, before => JSON.stringify(Array.from(document.querySelectorAll('#editor-container .tiptap > .pp-free-frame')).map(f => [f.getAttribute('data-ff-x'), f.getAttribute('data-ff-y')].join(','))) === before, JSON.stringify(posBeforeMouse), 15000);
await converge([A.page, B.page]);
check('UN Ctrl+Z d\'Alice remet le cadre où il était (tout le glissé), et la frappe de Bob reste', JSON.stringify(await framePositions(A.page)) === JSON.stringify(posBeforeMouse) && (await editorText(A.page)).includes('Bob-2') && (await editorText(B.page)).includes('Bob-2'), { now: await framePositions(A.page), wanted: posBeforeMouse });
await A.page.keyboard.press('Control+y');
await until(B.page, after => JSON.stringify(Array.from(document.querySelectorAll('#editor-container .tiptap > .pp-free-frame')).map(f => [f.getAttribute('data-ff-x'), f.getAttribute('data-ff-y')].join(','))) === after, JSON.stringify(posAfterMouse), 15000);
check('Ctrl+Y d\'Alice refait le glissé, chez les deux', JSON.stringify(await framePositions(A.page)) === JSON.stringify(posAfterMouse) && JSON.stringify(await framePositions(B.page)) === JSON.stringify(posAfterMouse));
await B.page.evaluate(() => EditorCore.getEditor().view.focus());
await B.page.keyboard.press('Control+z');
await until(B.page, () => !EditorCore.getEditor().state.doc.textContent.includes('Bob-2'), null, 15000);
await converge([A.page, B.page]);
check('Ctrl+Z de Bob défait SA frappe (« Bob-2 »), pas le glissé d\'Alice', !(await editorText(A.page)).includes('Bob-2') && JSON.stringify(await framePositions(A.page)) === JSON.stringify(posAfterMouse), await framePositions(A.page));

// Une transition est un repère de diapositive, un nœud du texte : l'historique par personne la couvre comme une frappe (UN Ctrl+Z), sans toucher à la transition de Bob.
const hasPush = page => page.evaluate(() => { let found = false; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps' && JSON.stringify(node.attrs).includes('push')) found = true; return true; }); return found; });
const propsBeforePush = await slideProps(A.page);
await A.page.evaluate(() => { const ed = EditorCore.getEditor(); ed.view.focus(); SlideProps.applyTransition(ed, [0], { transition: 'push', dur: 0.4 }); });
await until(B.page, () => { let found = false; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps' && JSON.stringify(node.attrs).includes('push')) found = true; return true; }); return found; }, null, 20000);
check('une transition posée par Alice arrive chez Bob', (await hasPush(A.page)) && (await hasPush(B.page)));
await A.page.evaluate(() => EditorCore.getEditor().view.focus());
await A.page.keyboard.press('Control+z');
await until(B.page, () => { let found = false; EditorCore.getEditor().state.doc.descendants((node) => { if (node.type.name === 'slideProps' && JSON.stringify(node.attrs).includes('push')) found = true; return true; }); return !found; }, null, 20000);
await converge([A.page, B.page]);
const propsAfterUndo = await slideProps(A.page);
check('UN Ctrl+Z d\'Alice défait sa transition, chez les deux, et celle de Bob (« fondu ») reste', JSON.stringify(propsAfterUndo) === JSON.stringify(propsBeforePush) && propsAfterUndo.some(p => p.includes('fade')) && JSON.stringify(await slideProps(B.page)) === JSON.stringify(propsBeforePush), { propsBeforePush, propsAfterUndo, onB: await slideProps(B.page) });

// ---- 6) L'objet que l'autre a choisi ----------------------------------------------------------------------------------------------------------

section('6) L\'objet que l\'autre a choisi');
await A.page.evaluate(() => { document.querySelector('#editor-container').scrollTop = 0; });
const bobColor = (await liveDebug(B.page)).user.color;
const aliceColor = (await liveDebug(A.page)).user.color;
const carolBefore = await C.page.evaluate(() => EditorCore.getEditor().state.selection.from);
await startLive(C.page, { ask: true, answer: 'Rejoindre' });
await converge([A.page, B.page, C.page]);
// Carole avait ouvert la présentation d'avant : son curseur était à la fin de ce texte-là, une position qui tombe ailleurs dans le texte du groupe (plus long : des cadres, une diapositive de plus).
const carolSelection = await C.page.evaluate(() => { const s = EditorCore.getEditor().state.selection; return { kind: s.constructor.name, inline: s.$from.parent.inlineContent && s.$to.parent.inlineContent, parent: s.$from.parent.type.name }; });
check('Carole rejoint avec le curseur d\'avant : il est dans du texte (pas entre deux blocs, où rien ne s\'écrit)', carolBefore > 0 && carolSelection.inline, { carolBefore, carolSelection });
const carolColor = (await liveDebug(C.page)).user.color;
// Personne n'a rien choisi : chacun a le curseur au début du texte, sa page sans le focus (un curseur n'est publié que par une page qui l'a).
for (const page of [A.page, B.page, C.page]) await page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.setTextSelection(2); ed.view.dom.blur(); });
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object, #editor-container .tiptap .pp-live-caret').length === 0, null, 20000);
await until(B.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object, #editor-container .tiptap .pp-live-caret').length === 0, null, 20000);
const topBefore = await titleTop(A.page);
check('au départ, personne n\'a choisi d\'objet : ni contour, ni curseur chez Alice', (await objectsCount(A.page)) === 0 && (await shown(A.page)).carets === 0, await shown(A.page));
const fb = await frames(B.page);
await B.page.evaluate((pos) => { FreeFrame.select(EditorCore.getEditor(), pos); EditorCore.getEditor().view.focus(); }, fb[1].pos);
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 1, null, 20000);
const withBob = await shown(A.page);
check('Bob choisit un cadre : Alice le voit cerné, avec le nom et la couleur de Bob', withBob.objects.length === 1 && withBob.objects[0].name === '"Bob"' && withBob.objects[0].color === bobColor && withBob.objects[0].text.startsWith('Cadre deux'), withBob);
check('le curseur de Bob n\'est pas dessiné entre deux blocs : aucun curseur chez Alice, et le texte ne bouge pas', withBob.carets === 0 && (await titleTop(A.page)) === topBefore, { carets: withBob.carets, before: topBefore, now: await titleTop(A.page) });
check('Bob ne voit pas son propre contour d\'« objet de l\'autre »', (await objectsCount(B.page)) === 0);

// La vraie capture : l'anneau tout autour du cadre, le nom au coin haut gauche, lisibles à l'échelle de la feuille (le panneau réduit la diapositive : ~0,44).
const boxB = await boxOf(A.page, 1);
await A.page.waitForTimeout(250);
const boxNow = await boxOf(A.page, 1);
const bobRgb = rgbOf(bobColor);
const ringBelow = await colorStats(A.page, { x: boxNow.left, y: boxNow.top + boxNow.height, width: boxNow.width, height: 4 }, bobRgb);
const ringLeft = await colorStats(A.page, { x: boxNow.left - 4, y: boxNow.top + 4, width: 4, height: Math.max(1, boxNow.height - 8) }, bobRgb);
check('sur une vraie capture, un anneau de la couleur de Bob longe le bas et le côté du cadre', ringBelow.count >= boxNow.width && ringLeft.count >= 2 * Math.max(1, boxNow.height - 12), { ringBelow: ringBelow.count, ringLeft: ringLeft.count, box: boxNow });
const tag = await colorStats(A.page, { x: boxNow.left - 6, y: boxNow.top - 30, width: 80, height: 34 }, bobRgb);
const tagRows = tag.rows.filter(n => n >= 12).length;
check('et son nom, sur une pastille de sa couleur d\'au moins 12 px de haut, au coin haut gauche', tagRows >= 12, { tagRows, rows: tag.rows });
// Au-dessus de l'anneau, dans la largeur du nom : la couleur de la pastille, et du blanc (les lettres) sans que tout soit blanc (la feuille).
const letters = await colorStats(A.page, { x: boxNow.left - 2, y: boxNow.top - 13, width: 26, height: 8 }, [255, 255, 255], 12);
const pastille = await colorStats(A.page, { x: boxNow.left - 2, y: boxNow.top - 13, width: 26, height: 8 }, bobRgb);
check('le nom est écrit en clair sur la pastille : des lettres blanches sur du vert, pas une feuille blanche', pastille.count >= 80 && letters.count >= 6 && letters.count < 150, { pastille: pastille.count, letters: letters.count });

// Le même objet pour deux personnes : leurs noms l'un après l'autre.
await C.page.evaluate((pos) => { FreeFrame.select(EditorCore.getEditor(), pos); EditorCore.getEditor().view.focus(); }, (await frames(C.page))[1].pos);
await until(A.page, () => /Carole/.test(document.querySelector('#editor-container .tiptap .pp-live-object') ? document.querySelector('#editor-container .tiptap .pp-live-object').style.getPropertyValue('--pp-live-name') : ''), null, 20000);
const both = await shown(A.page);
check('Carole choisit le même cadre : un seul contour, les deux noms ensemble', both.objects.length === 1 && /Bob/.test(both.objects[0].name) && /Carole/.test(both.objects[0].name), both);
const injected = await A.page.evaluate(() => { const el = document.querySelector('#editor-container .tiptap .pp-live-object'); const css = getComputedStyle(el); return { outline: css.outlineStyle + ' ' + css.outlineWidth, own: el.style.getPropertyValue('outline'), extra: el.style.getPropertyValue('--x'), name: el.style.getPropertyValue('--pp-live-name') }; });
check('un nom qui veut sortir de la feuille de style (guillemet, point-virgule) reste du texte : aucun contour ni propriété ajoutés à l\'objet', injected.own === '' && injected.extra === '' && /^none /.test(injected.outline) && injected.name.includes('outline:9px solid red'), injected);

// L'objet suit le texte quand l'autre écrit au-dessus.
await C.page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.focus(); ed.commands.setTextSelection(2); });
await until(A.page, () => !/Carole/.test(document.querySelector('#editor-container .tiptap .pp-live-object') ? document.querySelector('#editor-container .tiptap .pp-live-object').style.getPropertyValue('--pp-live-name') : ''), null, 20000);
check('Carole quitte le cadre pour du texte : il ne porte plus que le nom de Bob', (await shown(A.page)).objects.length === 1 && (await shown(A.page)).objects[0].name === '"Bob"', await shown(A.page));
const objectTextBefore = (await shown(A.page)).objects[0].text;
await A.page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.focus(); ed.commands.setTextSelection(2); });
await A.page.keyboard.type('Haut ', { delay: 15 });
await converge([A.page, B.page, C.page]);
await A.page.waitForTimeout(600);
const afterWrite = await shown(A.page);
check('Alice écrit dans le premier cadre : le contour reste sur le cadre que Bob a choisi', afterWrite.objects.length === 1 && afterWrite.objects[0].text.startsWith(objectTextBefore.slice(0, 8)) && afterWrite.objects[0].name === '"Bob"', afterWrite);

// Les miniatures de la bande : ni anneau, ni nom.
const thumbs = await A.page.evaluate(() => ({
  withClass: document.querySelectorAll('.pp-slide-list .pp-free-frame.pp-live-object').length,
  shadows: Array.from(document.querySelectorAll('.pp-slide-list .pp-free-frame-box')).map(box => getComputedStyle(box).boxShadow),
}));
check('les miniatures de la bande, même celles qui ont copié la classe de l\'objet choisi, ne portent pas son anneau', thumbs.shadows.length > 0 && thumbs.shadows.every(shadow => shadow === 'none'), thumbs);

// Bob passe au texte : le contour part, son curseur revient.
await B.page.evaluate(() => { const ed = EditorCore.getEditor(); ed.commands.focus(); ed.commands.setTextSelection(ed.state.doc.content.size - 3); });
await B.page.keyboard.type('Bob-3', { delay: 15 });
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 0, null, 20000);
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-caret').length >= 1, null, 20000);
check('Bob clique dans du texte : le contour part, son curseur de texte est dessiné chez Alice', (await objectsCount(A.page)) === 0 && (await shown(A.page)).carets >= 1, await shown(A.page));

// Une ligne : choisie, elle est cernée aussi (un trait en tirets, sans anneau).
await B.page.evaluate(() => { const ed = EditorCore.getEditor(); FreeFrame.insert(ed, 0, { shape: 'line' }); });
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 1, null, 20000);
const lineShown = await A.page.evaluate(() => { const el = document.querySelector('#editor-container .tiptap .pp-live-object'); return { shape: el.getAttribute('data-ff-shape'), outline: getComputedStyle(el.querySelector('.pp-free-frame-box')).outlineStyle }; });
check('Bob pose une ligne, qu\'il a ensuite choisie : Alice la voit cernée en tirets', lineShown.shape === 'line' && lineShown.outline === 'dashed', lineShown);

// Bob supprime l'objet qu'il avait choisi : le contour ne reste pas sur autre chose.
await B.page.evaluate(() => { const ed = EditorCore.getEditor(); const sel = ed.state.selection; if (sel.node) ed.view.dispatch(ed.state.tr.deleteSelection()); });
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 0, null, 20000);
check('Bob supprime l\'objet choisi : plus aucun contour chez Alice', (await objectsCount(A.page)) === 0);

// Bob s'en va : plus aucune trace de lui.
await B.page.evaluate((pos) => { FreeFrame.select(EditorCore.getEditor(), pos); }, (await frames(B.page))[0].pos);
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 1, null, 20000);
await stopLive(B.page);
await until(A.page, () => document.querySelectorAll('#editor-container .tiptap .pp-live-object').length === 0, null, 30000);
check('Bob arrête le direct : son contour disparaît chez Alice (et la présence de Bob avec lui)', (await objectsCount(A.page)) === 0);

// ---- 7) Les gardes -----------------------------------------------------------------------------------------------------------------------------

section('7) Gardes');
check('aucune couleur de personne n\'est la même chez les trois (le nom est toujours écrit en plus)', new Set([aliceColor, bobColor, carolColor]).size === 3, [aliceColor, bobColor, carolColor]);
check('aucune erreur de page', kit.pageErrors.length === 0, kit.pageErrors.slice(0, 4));
check('aucun message d\'erreur ou d\'avertissement de la console', consoleProblems.length === 0, consoleProblems.slice(0, 6));

await kit.close();
finish();
