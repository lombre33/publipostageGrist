#!/usr/bin/env node
// Les PERSONNES du direct dans la bande des diapositives (extensions/diapositives/slide-strip.js, extensions/edition/live-editor.js : la `place` de la présence ; carte d'Antoine du 03/11 « Oui, un repère de
// sa couleur » : sous la miniature de la diapositive où quelqu'un écrit, une pastille de sa couleur, son nom au survol), dans un vrai navigateur à 700x400, avec des pages du widget qui partagent UNE table du
// direct (dev-tests/live-test-kit.mjs, GFS simulé avec les extensions « édition » et « diapositives »). Trois personnes : Alice (A), Bob (B) et Carole (C), dont le nom voudrait sortir de la feuille de
// style. Les clics dans le texte et sur la bande sont à la VRAIE souris.
//   1) le départ : hors du direct, aucune pastille ; en direct, chacun voit les autres (jamais lui-même) sous la miniature de la diapositive où ils sont, de leur couleur, leur nom en info-bulle ;
//   2) elles suivent : un clic de Bob dans le texte de la diapositive 2, un clic de Carole dans celui de la 3 ; plusieurs sur la même diapositive (dans l'ordre de leur numéro), leurs noms dans le nom de la miniature ;
//   3) sans le clavier dans l'éditeur : Bob clique à côté (son curseur de texte n'est plus publié) - la pastille reste, c'est sa raison d'être ;
//   4) elles suivent le texte : une diapositive ajoutée avant les décale d'un rang chez tous ; la sélection d'Alice sur la diapositive qu'elle vient d'ajouter se voit chez Bob ;
//   5) la bande ne bouge pas : la hauteur des rangées est celle d'avant le direct, les pastilles sont sur le bord bas de la miniature, sous sa largeur, et se voient sur une VRAIE capture ; un clic dessus va à la miniature ;
//   6) plus de quatre sur la même diapositive : quatre pastilles et un « +N » dont l'info-bulle donne les autres noms ;
//   7) les départs : celui qui arrête n'est plus montré aux autres et ne voit plus personne ; plus de pastille nulle part quand le direct est éteint ;
//   8) gardes : ni erreur de page, ni message de la console.
// Lancé par run-headless.mjs (groupe Node "liveStrip", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-strip.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { startKit, liveFileExists, liveDebug, until, dialogShown, pressDialogButton, startLive, stopLive, converge } from './live-test-kit.mjs';

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
// Une présentation de trois diapositives, chacune avec un titre et un texte.
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const DECK = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><p>Second texte</p>${BR}<h2>Trois</h2><p>Troisième texte</p>`;
const templates = [
  { id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p>', def: true, type: 'document' },
  { id: 2, nom: 'Présentation', contenu: DECK, def: false, type: 'presentation' },
];

const kit = await startKit({ port: Number(process.env.LIVE_STRIP_PORT || 9190) });
const table = kit.newTable();
const extensions = ['edition', 'diapositives'];
// Carole porte un nom qui voudrait sortir de la feuille de style (guillemet, point-virgule) : il doit rester du texte.
const HOSTILE = 'Carole" ;outline:9px solid red;--x:"';
const A = await kit.openPage({ table, templates, extensions, identity: { name: 'Alice', email: 'alice@example.com' } });
const B = await kit.openPage({ table, templates, extensions, identity: { name: 'Bob', email: 'bob@example.com' } });
const C = await kit.openPage({ table, templates, extensions, identity: { name: HOSTILE, email: 'carole@example.com' } });
const named = { A: A.page, B: B.page, C: C.page };
const consoleProblems = [];
let step = 'départ';
const section = (title) => { step = title.split(')')[0]; console.log('\n== ' + title + ' =='); };
for (const [name, page] of Object.entries(named)) {
  page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) consoleProblems.push(`${name} ${message.type()} [${step}] : ${message.text().slice(0, 240)}`); });
}

// ---- Les gestes (vraie souris) ---------------------------------------------------------------------------------------------------------------

async function openTemplate(page, id) {
  await page.evaluate((wanted) => { const select = document.getElementById('template-select'); select.value = String(wanted); select.dispatchEvent(new Event('change')); }, id);
  if (await page.waitForFunction(dialogShown, null, { timeout: 1500 }).then(() => true, () => false)) await pressDialogButton(page, 'Ne pas enregistrer');
  await until(page, wanted => Templates.getCurrentId() != null && String(Templates.getCurrentId()) === String(wanted), id, 60000);
  await page.waitForTimeout(700);
}
// Un vrai clic : la souris vient de la gauche, s'arrête un instant sur le point, appuie.
async function mouseClick(page, x, y, wait = 450) {
  await page.mouse.move(x + 30, y, { steps: 3 });
  await page.mouse.move(x, y, { steps: 2 });
  await sleep(60);
  await page.mouse.click(x, y);
  await sleep(wait);
}
// La diapositive où est la sélection de `page` (celle que l'éditeur dit : jamais la pastille).
const selectedSlide = page => page.evaluate(() => { const view = EditorCore.getEditor().view; const head = view.state.selection.head; const slides = SlideStrip.slidesOf(view.state.doc); const at = slides.findIndex(slide => head <= slide.end); return at < 0 ? slides.length - 1 : at; });
// Un clic dans le texte de la diapositive `index` (une lettre vers la fin de son dernier paragraphe) : la feuille défile d'abord jusqu'à elle, d'un coup (un défilement animé ferait arriver la
// souris ailleurs que là où le texte était mesuré), puis la lettre est mesurée de nouveau. Le texte n'est pas cherché par ses mots : le curseur d'une autre personne le coupe en deux.
async function clickSlide(page, index) {
  await page.evaluate((i) => {
    const view = EditorCore.getEditor().view;
    const slide = SlideStrip.slidesOf(view.state.doc)[i];
    const node = view.domAtPos(slide.end - 3).node;
    (node.nodeType === 1 ? node : node.parentElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  }, index);
  await sleep(250);
  const at = await page.evaluate((i) => {
    const view = EditorCore.getEditor().view;
    const slide = SlideStrip.slidesOf(view.state.doc)[i];
    const c = view.coordsAtPos(slide.end - 3);
    const x = c.left + 1, y = (c.top + c.bottom) / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, inEditor: !!(hit && hit.closest('#editor-container .tiptap')) };
  }, index);
  if (!at.inEditor) throw new Error('le texte de la diapositive ' + (index + 1) + ' est masqué : ' + JSON.stringify(at));
  await mouseClick(page, at.x, at.y);
  const landed = await selectedSlide(page);
  if (landed !== index) throw new Error('le clic dans la diapositive ' + (index + 1) + ' a posé la sélection dans la ' + (landed + 1));
}
// Un clic sur le texte de la barre du direct (rien n'y répond) : le clavier quitte l'éditeur, rien d'autre ne se passe. (À 700 x 400 la bande n'a pas d'espace libre sous ses miniatures.)
async function clickOutsideEditor(page) {
  const at = await page.evaluate(() => { const r = document.querySelector('#live-bar .live-bar-text').getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, width: r.width }; });
  if (!(at.width > 0)) throw new Error('la barre du direct est introuvable : ' + JSON.stringify(at));
  await mouseClick(page, at.x, at.y);
}

// ---- Ce qu'on lit ------------------------------------------------------------------------------------------------------------------------------

// La bande de `page`, rangée par rangée : sa hauteur, le nom de la miniature et ses pastilles (info-bulle, couleur, texte, style, place par rapport à la miniature).
const strip = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-list .pp-slide-row')).map((row) => {
  const thumb = row.querySelector('.pp-slide-thumb').getBoundingClientRect();
  return {
    height: row.offsetHeight,
    label: row.querySelector('.pp-slide-item').getAttribute('aria-label'),
    marks: Array.from(row.querySelectorAll('.pp-slide-person')).map((mark) => {
      const r = mark.getBoundingClientRect();
      return {
        title: mark.title, color: mark.style.getPropertyValue('--pp-live-color'), text: mark.textContent, style: mark.getAttribute('style'), more: mark.classList.contains('pp-slide-person-more'),
        left: r.left - thumb.left, right: r.right - thumb.right, top: r.top - thumb.bottom, bottom: r.bottom - thumb.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
      };
    }),
  };
}));
// Qui est sous quelle miniature : les noms (hors « +N »), triés.
const who = async page => (await strip(page)).map(row => row.marks.filter(m => !m.more).map(m => m.title).sort());
const WAIT_MS = Number(process.env.LIVE_STRIP_WAIT || 20000);   // la durée d'attente d'une pastille ; réduite pour rejouer l'essai sur l'ancien code, où rien n'arrive
async function expectWho(page, expected, label, timeout = WAIT_MS) {
  const want = JSON.stringify(expected);
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    last = await who(page);
    if (JSON.stringify(last) === want) break;
    await sleep(250);
  }
  check(label, JSON.stringify(last) === want, { wanted: expected, got: last });
  return last;
}
const colorOf = page => page.evaluate(() => LiveControl.debug().user.color);
const nameOf = page => page.evaluate(() => LiveControl.debug().user.name);
const allMarks = page => page.evaluate(() => document.querySelectorAll('.pp-slide-person').length);
// Les pixels d'une VRAIE capture de `clip` proches de `hex` (à `tol` près par canal).
async function pixelsNear(page, clip, hex, tol = 16) {
  const x = Math.max(0, Math.floor(clip.x)), y = Math.max(0, Math.floor(clip.y));
  const png = await page.screenshot({ clip: { x, y, width: Math.max(1, Math.min(WIDTH - x, Math.ceil(clip.width))), height: Math.max(1, Math.min(HEIGHT - y, Math.ceil(clip.height))) } });
  return page.evaluate(async ({ b64, target, tolerance }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const want = [1, 3, 5].map(i => parseInt(target.slice(i, i + 2), 16));
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - want[0]) <= tolerance && Math.abs(data[i + 1] - want[1]) <= tolerance && Math.abs(data[i + 2] - want[2]) <= tolerance) count++;
    return count;
  }, { b64: png.toString('base64'), target: hex, tolerance: tol });
}

// ---- 1) Le départ ------------------------------------------------------------------------------------------------------------------------------

section('1) Le départ');
for (const page of [A.page, B.page, C.page]) await openTemplate(page, 2);
const before = await strip(A.page);
check('la bande montre trois miniatures et aucune pastille tant que le direct est éteint', before.length === 3 && before.every(row => row.marks.length === 0), before.map(row => row.marks.length));
const baseHeights = before.map(row => row.height);
check('toutes les rangées ont la même hauteur avant le direct', new Set(baseHeights).size === 1 && baseHeights[0] > 40, baseHeights);

await startLive(A.page);
await startLive(B.page, { ask: true, answer: 'Rejoindre' });
await startLive(C.page, { ask: true, answer: 'Rejoindre' });
await converge([A.page, B.page, C.page]);
const NAME = { A: await nameOf(A.page), B: await nameOf(B.page), C: await nameOf(C.page) };
const COLOR = { A: await colorOf(A.page), B: await colorOf(B.page), C: await colorOf(C.page) };
check('Alice, Bob et Carole ont chacune une couleur, toutes différentes', new Set(Object.values(COLOR)).size === 3 && Object.values(COLOR).every(c => /^#[0-9a-f]{6}$/i.test(c)), COLOR);
const everyone = n => [NAME.A, NAME.B, NAME.C].filter(name => name !== n).sort();
// En arrivant, la sélection de chacun est où le texte l'a laissée : chacun clique dans le texte de la diapositive 1, pour partir d'un état connu.
for (const page of [A.page, B.page, C.page]) await clickSlide(page, 0);
await expectWho(A.page, [everyone(NAME.A), [], []], 'Alice voit Bob et Carole sous la miniature 1, où chacun a cliqué - et pas elle-même');
await expectWho(B.page, [everyone(NAME.B), [], []], 'Bob voit Alice et Carole sous la miniature 1');

// ---- 2) Elles suivent --------------------------------------------------------------------------------------------------------------------------

section('2) Elles suivent');
await clickSlide(B.page, 1);
await expectWho(A.page, [[NAME.C], [NAME.B], []], 'Bob clique dans le texte de la diapositive 2 : Alice voit sa pastille sous la miniature 2');
await expectWho(C.page, [[NAME.A], [NAME.B], []], 'Carole voit Bob sous la miniature 2 et Alice sous la 1');
await clickSlide(C.page, 2);
await expectWho(A.page, [[], [NAME.B], [NAME.C]], 'Carole clique dans le texte de la diapositive 3 : Alice voit sa pastille sous la miniature 3');
let rows = await strip(A.page);
const bobMark = rows[1].marks[0] || {}, caroleMark = rows[2].marks[0] || {};
check('la pastille de Bob est de sa couleur et son info-bulle est son nom', bobMark.color === COLOR.B && bobMark.title === NAME.B, { bobMark: { color: bobMark.color, title: bobMark.title }, color: COLOR.B });
check('celle de Carole aussi, et son nom - qui voulait sortir de la feuille de style - reste du texte (le style ne porte que la couleur)', caroleMark.color === COLOR.C && caroleMark.title === NAME.C && /^--pp-live-color: #[0-9a-f]{6};?$/i.test(caroleMark.style), { color: caroleMark.color, title: caroleMark.title, style: caroleMark.style });
check('le nom de la miniature dit qui est là : « Bob est ici » sous la 2, « Carole… est ici » sous la 3, rien sous la 1', /Diapositive 2 sur 3 · .*Bob est ici/.test(rows[1].label) && rows[2].label.includes(NAME.C + ' est ici') && !/ici/.test(rows[0].label), rows.map(row => row.label));
await clickSlide(C.page, 1);
await expectWho(A.page, [[], [NAME.B, NAME.C].sort(), []], 'Carole rejoint Bob sur la diapositive 2 : Alice voit leurs deux pastilles sous la miniature 2');
rows = await strip(A.page);
const order = rows[1].marks.map(m => m.title);
check('le nom de la miniature 2 les dit ensemble, au pluriel', rows[1].label.includes(' sont ici') && order.every(name => rows[1].label.includes(name)), rows[1].label);
const clientOrder = (await liveDebug(A.page)).peers.sort((a, b) => a.clientId - b.clientId).map(peer => peer.name).filter(name => order.includes(name));
check('les pastilles d\'une même miniature sont rangées dans l\'ordre du numéro de client (elles ne changent pas de rang quand les autres bougent)', JSON.stringify(order) === JSON.stringify(clientOrder), { order, clientOrder });
const seenByBob = await who(B.page);
check('Bob ne voit pas sa propre pastille, mais celles d\'Alice (miniature 1) et de Carole (miniature 2)', JSON.stringify(seenByBob) === JSON.stringify([[NAME.A], [NAME.C], []]), seenByBob);

// ---- 3) Sans le clavier dans l'éditeur ---------------------------------------------------------------------------------------------------------

section('3) Sans le clavier dans l\'éditeur');
await clickSlide(B.page, 1);
await clickOutsideEditor(B.page);
const focusOutside = await B.page.evaluate(() => !document.querySelector('#editor-container .tiptap').contains(document.activeElement));
check('un clic à côté, sur la barre du direct, fait quitter le clavier à l\'éditeur de Bob', focusOutside);
await until(A.page, (name) => { const f = LiveControl.debug().fields.find(item => item.name === name); return !!f && !f.cursor; }, NAME.B, WAIT_MS).catch(() => {});
const fields = (await liveDebug(A.page)).fields || [];
const bobFields = fields.find(f => f.name === NAME.B);
check('Alice ne reçoit plus de curseur de texte de Bob (il n\'est publié que tant que le clavier est dans l\'éditeur) mais sa place', !!bobFields && bobFields.cursor === false && bobFields.place === true, bobFields);
await sleep(1500);
await expectWho(A.page, [[], [NAME.B, NAME.C].sort(), []], 'la pastille de Bob reste sous la miniature 2 : il n\'a pas quitté sa diapositive');

// ---- 4) Elles suivent le texte -----------------------------------------------------------------------------------------------------------------

section('4) Elles suivent le texte');
await A.page.evaluate(() => { const list = document.querySelector('.pp-slide-list'); list.scrollTop = 0; const first = list.querySelector('.pp-slide-item'); first.click(); first.focus(); });
await A.page.click('.pp-slide-add');
await A.page.waitForTimeout(250);
await A.page.evaluate(() => { const items = Array.from(document.querySelectorAll('[role=menuitem]')).filter(e => e.offsetParent); items[0].click(); });
await until(B.page, () => document.querySelectorAll('.pp-slide-list .pp-slide-row').length === 4, null, 20000);
await converge([A.page, B.page, C.page]);
const alicesSlide = await A.page.evaluate(() => SlideStrip.current());
check('la diapositive ajoutée par Alice est la 2e et elle y est', alicesSlide === 1, alicesSlide);
await expectWho(A.page, [[], [], [NAME.B, NAME.C].sort(), []], 'une diapositive de plus avant elles : Bob et Carole sont sous la miniature 3, chez Alice');
await expectWho(B.page, [[], [NAME.A], [NAME.C], []], 'chez Bob : Alice sous la miniature 2 (celle qu\'elle vient d\'ajouter), Carole sous la 3');
await expectWho(C.page, [[], [NAME.A], [NAME.B], []], 'chez Carole : Alice sous la miniature 2, Bob sous la 3');

// ---- 5) La bande ne bouge pas ------------------------------------------------------------------------------------------------------------------

section('5) La bande ne bouge pas');
// La rangée de la 3e miniature, avec ses deux pastilles, est amenée à l'écran (la bande défile) : la capture de plus bas doit la voir.
await A.page.evaluate(() => { document.querySelectorAll('.pp-slide-list .pp-slide-row')[2].scrollIntoView({ block: 'center', behavior: 'instant' }); });
await sleep(250);
rows = await strip(A.page);
check('la hauteur de chaque rangée est celle d\'avant le direct (les pastilles ne la changent pas)', rows.every(row => row.height === baseHeights[0]), rows.map(row => row.height));
const marks = rows.flatMap(row => row.marks);
check('chaque pastille est sur le bord bas de sa miniature (à cheval, sous elle) et dans sa largeur', marks.length > 0 && marks.every(m => m.left >= 0 && m.right <= 0 && m.bottom > 0 && m.bottom <= 10 && m.top >= -9 && m.top < 4), marks.map(m => ({ left: m.left, right: m.right, top: m.top, bottom: m.bottom })));
const third = rows[2].marks;
const sideBySide = third.length >= 2 && Math.abs(third[0].y - third[1].y) < 1 && third[1].x - third[0].x >= third[0].w;
check('deux pastilles d\'une même miniature sont côte à côte, sans se recouvrir', sideBySide, third.slice(0, 2));
const dot = third[0];
const bare = await A.page.evaluate(() => {
  const list = document.querySelector('.pp-slide-list').getBoundingClientRect();
  const found = Array.from(document.querySelectorAll('.pp-slide-list .pp-slide-row')).find((row) => { const t = row.querySelector('.pp-slide-thumb').getBoundingClientRect(); return !row.querySelector('.pp-slide-person') && t.top >= list.top && t.bottom <= list.bottom - 8; });
  return found ? found.querySelector('.pp-slide-thumb').getBoundingClientRect().bottom : null;
});
if (dot && bare !== null) {
  const withMark = await pixelsNear(A.page, { x: dot.x - 7, y: dot.y - 7, width: 14, height: 14 }, dot.color);
  const without = await pixelsNear(A.page, { x: dot.x - 7, y: bare - 7, width: 14, height: 14 }, dot.color);
  check('la pastille se voit sur une VRAIE capture (des pixels de sa couleur), et pas au même endroit sous une miniature sans personne', withMark >= 20 && without === 0, { withMark, without });
} else check('la pastille se voit sur une VRAIE capture, et pas au même endroit sous une miniature sans personne', false, { dot: !!dot, bare });
// Un clic sur la pastille va à la miniature, comme un clic sur la miniature.
if (dot) await mouseClick(A.page, dot.x, dot.y);
const afterDotClick = await A.page.evaluate(() => SlideStrip.current());
check('un clic sur une pastille mène à la diapositive de sa miniature (ici la 3e)', !!dot && afterDotClick === 2, { dot: !!dot, afterDotClick });

// ---- 6) Plus de quatre sur la même diapositive -------------------------------------------------------------------------------------------------

section('6) Plus de quatre sur la même diapositive');
await A.page.evaluate(() => {
  window.__realPlaces = LiveEntry.places;
  const slide = SlideStrip.slidesOf(EditorCore.getEditor().state.doc)[1];
  LiveEntry.places = () => [1, 2, 3, 4, 5, 6].map(n => ({ clientId: n, name: 'P' + n, color: '#1971c2', pos: slide.start + 1 }));
  LiveEntry.changed();
});
await sleep(300);
rows = await strip(A.page);
const six = rows[1].marks;
const plus = six[4] || {};
check('six personnes sur la même diapositive : quatre pastilles et un « +2 » qui donne les deux autres noms', six.length === 5 && six.slice(0, 4).every(m => !m.more) && plus.more === true && plus.text === '+2' && plus.title === 'P5, P6', six.map(m => [m.title, m.text]));
check('le nom de la miniature les dit tous', rows[1].label.includes('P1, P2, P3, P4, P5, P6 sont ici'), rows[1].label);
check('le « +2 » tient dans la largeur de la miniature', plus.more === true && plus.right <= 0 && plus.left >= 0, plus);
await A.page.evaluate(() => { LiveEntry.places = window.__realPlaces; LiveEntry.changed(); });
await sleep(300);
await expectWho(A.page, [[], [], [NAME.B, NAME.C].sort(), []], 'les vraies personnes reviennent, et les six fausses s\'effacent');

// ---- 7) Les départs ----------------------------------------------------------------------------------------------------------------------------

section('7) Les départs');
await stopLive(B.page);
check('Bob arrête : plus aucune pastille chez lui', (await allMarks(B.page)) === 0, await who(B.page));
await expectWho(A.page, [[], [], [NAME.C], []], 'Alice ne voit plus Bob, seulement Carole');
await expectWho(C.page, [[], [], [NAME.A], []], 'Carole ne voit plus qu\'Alice, sous la miniature 3 : elle y est allée en cliquant la pastille de Bob (§5)');
await stopLive(C.page);
await expectWho(A.page, [[], [], [], []], 'Alice seule : aucune pastille');
await stopLive(A.page);
check('le direct éteint, aucune pastille nulle part', (await allMarks(A.page)) + (await allMarks(B.page)) + (await allMarks(C.page)) === 0);
const lastRows = await strip(A.page);
check('et la bande a retrouvé ses noms d\'avant (rien sur « ici »)', lastRows.every(row => !/ici/.test(row.label)) && lastRows.every(row => row.height === baseHeights[0]), lastRows.map(row => row.label));

// ---- 8) Les gardes -----------------------------------------------------------------------------------------------------------------------------

section('8) Gardes');
check('aucune erreur de page', kit.pageErrors.length === 0, kit.pageErrors.slice(0, 4));
check('aucun message d\'erreur ou d\'avertissement de la console', consoleProblems.length === 0, consoleProblems.slice(0, 6));

await kit.close();
finish();
