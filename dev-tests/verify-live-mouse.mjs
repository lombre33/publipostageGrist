#!/usr/bin/env node
// L'écriture en direct à la vraie souris et au vrai clavier, à la taille du panneau Grist (~700x400), en clair puis en sombre : ce que dev-tests/verify-live-editor.mjs prouve dans la page (le texte, les
// curseurs, l'enregistrement), ce script-ci le prouve avec ce que la personne touche. Le GFS simulé donne le fichier assemblé « edition-live » (dev-tests/live-test-kit.mjs).
//   1) le survol de « Édition collaborative » ouvre le menu : quatre lignes (suivi, tout accepter, tout refuser, écriture en direct), toutes au premier plan, tout dans le panneau, texte lisible ;
//   2) un vrai clic sur « Écriture en direct » l'allume sans question : la barre des personnes sous la barre d'outils, une pastille « Vous », la ligne devient « Arrêter l'écriture en direct », le bouton s'allume ;
//   3) une seconde personne la rejoint : la question « Rejoindre ? » tient dans le panneau, un clic sur « Rejoindre », la barre dit « 1 autre personne » des deux côtés ;
//   4) elles écrivent au clavier : le texte arrive chez l'autre, avec le curseur de l'autre (son trait et son nom) lisible (4,5:1) et visible sur la page (3:1) ;
//   5) le menu reste au-dessus de la barre ; la ligne du suivi des modifications est grisée avec sa raison et son clic l'explique (le suivi reste éteint) ;
//   6) le bouton « Arrêter » de la barre éteint le direct de la personne (l'autre le voit partir), la ligne du menu l'éteint aussi ;
//   7) au clavier : Tab arrive sur le bouton, puis sur « Suivi des modifications », puis sur « Écriture en direct » (les deux lignes grisées d'office sont sautées) ; Entrée l'allume ;
//   8) en anglais : la ligne, la barre et la pastille se lisent en anglais ;
//   9) le widget seul : la ligne est grisée avec sa raison et son clic ouvre la fenêtre « passez par GFS », qu'un clic referme.
// Lancé par run-headless.mjs (groupe Node "liveMouse", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-mouse.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startKit, WIDTH, HEIGHT, liveFileExists, editorText, dialogShown, dialogGone, dialogInfo, converge } from './live-test-kit.mjs';

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

const SHOTS = process.env.LIVE_MOUSE_SHOTS || mkdtempSync(join(tmpdir(), 'live-mouse-'));
mkdirSync(SHOTS, { recursive: true });
const kit = await startKit({ port: Number(process.env.LIVE_MOUSE_PORT || 8947) });
const templates = [{ id: 1, nom: 'Rapport', contenu: '<p>Bonjour monde</p>', def: true, type: 'document' }];
const ROWS = ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all', 'v2-btn-live'];
const people = { Alice: { name: 'Alice', email: 'alice@example.com' }, Bob: { name: 'Bob', email: 'bob@example.com' }, Carole: { name: 'Carole', email: 'carole@example.com' } };

// ---- La souris et le clavier de la personne (mêmes gestes que dev-tests/verify-collab-menu-mouse.mjs) ------------------------------------------------------------------------------------

const rectOf = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!top && (top === e || e.contains(top)) };
}, sel);
async function hover(page, sel) {
  const c = await rectOf(page, sel);
  if (!c) throw new Error('introuvable : ' + sel);
  await page.mouse.move(c.x - 14, c.y - 6, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 4 });
  await page.waitForTimeout(150);
  return c;
}
// Du bouton à une ligne de son menu : tout droit sous le bouton (le menu reste ouvert tout du long), puis vers la ligne.
async function toRow(page, rowSel) {
  const btn = await hover(page, '#v2-btn-collab');
  const row = await rectOf(page, rowSel);
  await page.mouse.move(btn.x, row.y, { steps: 10 });
  await page.mouse.move(row.x, row.y, { steps: 4 });
  await page.waitForTimeout(120);
  return row;
}
async function clickRow(page, rowSel, wait = 250) {
  const row = await toRow(page, rowSel);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(wait);
  return row;
}
const away = async (page) => { await page.mouse.move(350, 392, { steps: 6 }); await page.waitForTimeout(250); };
const flyoutOpen = page => page.evaluate(() => getComputedStyle(document.getElementById('v2-collab-flyout')).display !== 'none');
// Un bouton de la fenêtre de dialogue du widget (celui dont le texte correspond), son centre et s'il reçoit le clic ; et le clic réel dessus.
const dialogButton = (page, re) => page.evaluate((source) => {
  const wanted = new RegExp(source);
  const b = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).find(x => x.offsetParent !== null && wanted.test(x.textContent));
  if (!b) return null;
  const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, onTop: !!top && (top === b || b.contains(top)) };
}, re.source);
async function clickDialogButton(page, re) {
  const c = await dialogButton(page, re);
  if (!c) throw new Error('bouton de la fenêtre introuvable : ' + re);
  await page.mouse.move(c.x - 12, c.y - 5, { steps: 2 }); await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.click(c.x, c.y);
  return c;
}
// La fenêtre de dialogue tient-elle tout entière dans le panneau, titre et boutons compris ?
const dialogFits = page => page.evaluate(({ w, h }) => {
  const box = document.querySelector('#pp-dialog-modal .pp-dialog-box');
  const r = box.getBoundingClientRect();
  const buttons = Array.from(document.querySelectorAll('#pp-dialog-modal .var-modal-actions button')).filter(b => b.offsetParent !== null).map(b => b.getBoundingClientRect());
  return { box: { l: r.left, t: r.top, r: r.right, b: r.bottom }, fits: r.left >= 0 && r.top >= 0 && r.right <= w && r.bottom <= h && buttons.length > 0 && buttons.every(b => b.left >= 0 && b.right <= w && b.bottom <= h) };
}, { w: WIDTH, h: HEIGHT });
const waitDialog = page => page.waitForFunction(dialogShown, null, { timeout: 30000 });
const waitDialogGone = page => page.waitForFunction(dialogGone, null, { timeout: 8000 });
const waitLive = (page, state = 'live') => page.waitForFunction(wanted => LiveEntry.state() === wanted, state, { timeout: 30000 });

const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };

// Ce que la barre des personnes montre : sa place, son texte, ses pastilles, les couleurs de son texte et de son bouton.
const barOf = page => page.evaluate(() => {
  const bar = document.getElementById('live-bar');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const toolbar = document.getElementById('toolbar-top').getBoundingClientRect();
  const stop = bar.querySelector('.live-bar-stop');
  const style = getComputedStyle(bar);
  return {
    l: r.left, t: r.top, r: r.right, b: r.bottom, toolbarBottom: toolbar.bottom, visible: r.height > 0 && style.display !== 'none',
    text: bar.querySelector('.live-bar-text').textContent, chips: Array.from(bar.querySelectorAll('.live-chip')).map(chip => chip.querySelector('.live-chip-name').textContent),
    bg: style.backgroundColor, ink: getComputedStyle(bar.querySelector('.live-bar-text')).color, stopInk: stop ? getComputedStyle(stop).color : null, stopBg: stop ? getComputedStyle(stop).backgroundColor : null,
    scrolls: bar.scrollWidth > bar.clientWidth + 1,
  };
});
// Le curseur d'une autre personne, tel que cette page le montre.
const caretOf = page => page.evaluate(() => {
  const caret = document.querySelector('.pp-live-caret');
  const label = caret && caret.querySelector('.pp-live-caret-label');
  if (!caret || !label) return null;
  const caretStyle = getComputedStyle(caret), labelStyle = getComputedStyle(label), r = label.getBoundingClientRect();
  // La page (le papier) derrière le curseur : le premier fond opaque en remontant.
  let node = caret, paper = null;
  while (node && !paper) { const bg = getComputedStyle(node).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) paper = bg; node = node.parentElement; }
  return { name: label.textContent, line: caretStyle.borderLeftColor, lineWidth: parseFloat(caretStyle.borderLeftWidth), ink: labelStyle.color, labelBg: labelStyle.backgroundColor, paper, l: r.left, t: r.top, r: r.right, b: r.bottom };
});

const natives = [];
const pages = [];
async function open(options) {
  const opened = await kit.openPage(Object.assign({ templates }, options));
  natives.push(opened.natives);
  pages.push(opened);
  return opened;
}

for (const dark of [false, true]) {
  const theme = dark ? 'sombre' : 'clair';
  console.log(`\n== Panneau ${WIDTH}x${HEIGHT}, ${theme} ==`);
  const table = kit.newTable();
  const alice = await open({ table, identity: people.Alice, colorScheme: dark ? 'dark' : 'light' });
  const A = alice.page;

  // 1) le menu
  const button = await hover(A, '#v2-btn-collab');
  const opened = await flyoutOpen(A);
  const flyout = await rectOf(A, '#v2-collab-flyout');
  const rows = {};
  for (const id of ROWS) rows[id] = await rectOf(A, '#' + id);
  const liveRow = await A.evaluate(() => { const row = document.getElementById('v2-btn-live'); return { label: document.getElementById('v2-btn-live-label').textContent, aria: row.getAttribute('aria-disabled'), pressed: row.getAttribute('aria-pressed'), title: row.title, color: getComputedStyle(row).color, bg: getComputedStyle(document.getElementById('v2-collab-flyout')).backgroundColor }; });
  await A.screenshot({ path: `${SHOTS}/menu-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 260 } });
  check(`${theme} : le survol de « Édition collaborative » ouvre le menu, tout entier dans le panneau`, !!button && button.onTop && opened && !!flyout && flyout.l >= 0 && flyout.r <= WIDTH && flyout.b <= HEIGHT, { opened, flyout });
  check(`${theme} : quatre lignes dans l'ordre (suivi, tout accepter, tout refuser, écriture en direct), toutes au premier plan`, ROWS.every(id => rows[id] && rows[id].onTop) && ROWS.every((id, i) => i === 0 || rows[ROWS[i - 1]].y < rows[id].y), rows);
  check(`${theme} : la ligne « Écriture en direct » est utilisable (extension active), sans raison, éteinte`, liveRow.label === 'Écriture en direct' && liveRow.aria === 'false' && liveRow.pressed === 'false' && liveRow.title === '', liveRow);
  check(`${theme} : son texte se lit sur le fond du menu (4,5:1 au moins)`, contrast(liveRow.color, liveRow.bg) >= 4.5, contrast(liveRow.color, liveRow.bg));
  await away(A);
  check(`${theme} : la souris partie, le menu se referme`, !(await flyoutOpen(A)));

  // 2) un vrai clic l'allume, sans question
  await clickRow(A, '#v2-btn-live', 0);
  await waitLive(A);
  await away(A);
  const barA = await barOf(A);
  const lit = await A.evaluate(() => ({ button: document.getElementById('v2-btn-collab').classList.contains('is-active'), row: document.getElementById('v2-btn-live').classList.contains('is-active'), label: document.getElementById('v2-btn-live-label').textContent }));
  const noQuestion = await A.evaluate(dialogGone);
  await A.screenshot({ path: `${SHOTS}/seule-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 200 } });
  check(`${theme} : un vrai clic sur « Écriture en direct » l'allume sans aucune question, le menu se referme`, noQuestion && !(await flyoutOpen(A)), { noQuestion, flyout: await flyoutOpen(A) });
  check(`${theme} : la barre des personnes est sous la barre d'outils, dans le panneau, sans défiler : « personne d'autre pour l'instant » et une pastille « Vous »`,
    !!barA && barA.visible && barA.t >= barA.toolbarBottom - 1 && barA.l >= 0 && barA.r <= WIDTH && !barA.scrolls && /personne d’autre pour l’instant/.test(barA.text) && JSON.stringify(barA.chips) === JSON.stringify(['Vous']), barA);
  check(`${theme} : le bouton « Édition collaborative » et la ligne s'allument, la ligne devient « Arrêter l'écriture en direct »`, lit.button && lit.row && lit.label === 'Arrêter l’écriture en direct', lit);
  check(`${theme} : le texte de la barre et son bouton « Arrêter » se lisent (4,5:1 au moins)`, contrast(barA.ink, barA.bg) >= 4.5 && contrast(barA.stopInk, barA.stopBg === 'rgba(0, 0, 0, 0)' ? barA.bg : barA.stopBg) >= 4.5, { text: contrast(barA.ink, barA.bg), stop: contrast(barA.stopInk, barA.stopBg === 'rgba(0, 0, 0, 0)' ? barA.bg : barA.stopBg) });

  // 3) une seconde personne rejoint
  const bob = await open({ table, identity: people.Bob, colorScheme: dark ? 'dark' : 'light' });
  const B = bob.page;
  await clickRow(B, '#v2-btn-live', 0);
  await waitDialog(B);
  const question = await B.evaluate(dialogInfo);
  const fits = await dialogFits(B);
  await B.screenshot({ path: `${SHOTS}/question-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  const confirm = await dialogButton(B, /Rejoindre/);
  check(`${theme} : la question « Rejoindre l'écriture en direct ? » tient dans le panneau, boutons compris, et son bouton reçoit le clic`, /Rejoindre l’écriture en direct/.test(question.title) && fits.fits && !!confirm && confirm.onTop && question.buttons.includes('Rejoindre') && question.buttons.includes('Annuler'), { question, fits, confirm });
  await clickDialogButton(B, /Rejoindre/);
  await waitLive(B);
  await waitDialogGone(B);
  await A.waitForFunction(() => /1 autre personne/.test((document.querySelector('.live-bar-text') || {}).textContent || ''), null, { timeout: 20000 });
  await B.waitForFunction(() => /1 autre personne/.test((document.querySelector('.live-bar-text') || {}).textContent || ''), null, { timeout: 20000 });
  const barB = await barOf(B);
  const barA2 = await barOf(A);
  check(`${theme} : un clic sur « Rejoindre » : la barre dit « 1 autre personne » des deux côtés, avec le nom de l'autre`, JSON.stringify(barB.chips) === JSON.stringify(['Vous', 'Alice']) && JSON.stringify(barA2.chips) === JSON.stringify(['Vous', 'Bob']) && /1 autre personne/.test(barA2.text), { bob: barB.chips, alice: barA2.chips });

  // 4) elles écrivent au clavier
  const paragraph = await rectOf(A, '.ProseMirror p');
  await A.mouse.click(paragraph.r - 3, paragraph.y);
  await A.keyboard.press('End');
  await A.keyboard.type(' Alice écrit', { delay: 25 });
  const sameA = await converge([A, B]);
  check(`${theme} : ce qu'Alice tape au clavier arrive chez Bob`, sameA !== null && (await editorText(B)).includes('Alice écrit'), { alice: await editorText(A), bob: await editorText(B), focus: await A.evaluate(() => document.activeElement && document.activeElement.className), paragraph });
  await B.waitForFunction(() => !!document.querySelector('.pp-live-caret-label'), null, { timeout: 10000 });
  const caret = await caretOf(B);
  await B.screenshot({ path: `${SHOTS}/curseur-${theme}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 220 } });
  check(`${theme} : Bob voit le curseur d'Alice : un trait de sa couleur et son nom au-dessus, dans le panneau`, !!caret && caret.name === 'Alice' && caret.lineWidth > 0.5 && caret.t >= 0 && caret.l >= 0 && caret.r <= WIDTH, caret);
  check(`${theme} : le nom sur le curseur se lit (4,5:1 au moins) et le trait se voit sur la page (3:1 au moins)`, !!caret && contrast(caret.ink, caret.labelBg) >= 4.5 && contrast(caret.line, caret.paper) >= 3, caret && { name: contrast(caret.ink, caret.labelBg), trait: contrast(caret.line, caret.paper) });
  const dots = await B.evaluate(() => Array.from(document.querySelectorAll('.live-chip')).map((chip) => {
    const dot = getComputedStyle(chip.querySelector('.live-chip-dot'));
    return { dot: dot.backgroundColor, ring: dot.borderTopColor, ringWidth: parseFloat(dot.borderTopWidth), chip: getComputedStyle(chip).backgroundColor, name: chip.textContent, ink: getComputedStyle(chip).color };
  }));
  const chipBg = d => (d.chip === 'rgba(0, 0, 0, 0)' ? barB.bg : d.chip);
  check(`${theme} : le nom de chaque pastille se lit sur la pastille (4,5:1 au moins)`, dots.length === 2 && dots.every(d => contrast(d.ink, chipBg(d)) >= 4.5), dots);
  // Ce qui se voit du point : sa couleur, ou son anneau quand il en a un (la couleur d'une personne ne se choisit pas pour la pastille : elle doit aussi rendre un nom blanc lisible sur son curseur).
  const dotRatio = d => Math.max(contrast(d.dot, chipBg(d)), d.ringWidth >= 1 ? contrast(d.ring, chipBg(d)) : 0);
  check(`${theme} : le point de couleur de chaque pastille se distingue de la pastille (3:1 au moins, par sa couleur ou par son anneau)`, dots.every(d => dotRatio(d) >= 3), dots.map(d => ({ name: d.name, couleur: contrast(d.dot, chipBg(d)), anneau: d.ringWidth >= 1 ? contrast(d.ring, chipBg(d)) : null })));
  await B.mouse.click(paragraph.l + 20, paragraph.y);
  await B.keyboard.press('Home');
  await B.keyboard.type('Bob a écrit. ', { delay: 25 });
  const sameB = await converge([A, B]);
  check(`${theme} : ce que Bob tape arrive chez Alice, devant, sans écraser sa frappe`, sameB !== null && (await editorText(A)).startsWith('Bob a écrit.') && (await editorText(A)).includes('Alice écrit'), await editorText(A));

  // 5) le menu est au-dessus de la barre ; le suivi des modifications est grisé avec sa raison
  await hover(A, '#v2-btn-collab');
  const above = {};
  for (const id of ROWS) above[id] = await rectOf(A, '#' + id);
  const barUnder = await barOf(A);
  // Un point du menu qui tombe dans la hauteur de la barre : c'est le menu qui le reçoit, pas la barre.
  const overBar = await A.evaluate(({ x, y }) => { const hit = document.elementFromPoint(x, y); return { inMenu: !!hit && !!hit.closest('#v2-collab-flyout'), inBar: !!hit && !!hit.closest('#live-bar') }; }, { x: above['v2-btn-live'].x, y: barUnder.t + 3 });
  check(`${theme} : la barre est là et le menu reste au-dessus d'elle : un point du menu dans la hauteur de la barre reçoit le clic, et chaque ligne aussi`, !!barUnder && ROWS.every(id => above[id] && above[id].onTop) && above['v2-btn-live'].b > barUnder.t + 3 && overBar.inMenu && !overBar.inBar, { above, bar: barUnder && { t: barUnder.t, b: barUnder.b }, overBar });
  const track = await A.evaluate(() => ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all'].map(id => { const row = document.getElementById(id); return { id, aria: row.getAttribute('aria-disabled'), disabled: row.disabled, title: row.title, grey: row.classList.contains('v2-hover-row-disabled') }; }));
  check(`${theme} : le suivi des modifications et ses deux lignes sont grisés pendant le direct, avec la même raison en info-bulle, jamais retirés`, track.every(row => (row.aria === 'true' || row.disabled) && /suivi des modifications est fermé/.test(row.title)), track);
  await clickRow(A, '#v2-btn-track-changes', 0);
  await waitDialog(A);
  const locked = await A.evaluate(dialogInfo);
  const lockedFits = await dialogFits(A);
  check(`${theme} : un clic sur « Suivi des modifications » l'explique dans une fenêtre simple qui tient dans le panneau`, locked.title === 'Pendant l’écriture en direct' && /suivi des modifications est fermé/.test(locked.text) && lockedFits.fits && locked.buttons.includes('Fermer'), { locked, lockedFits });
  await clickDialogButton(A, /Fermer/);
  await waitDialogGone(A);
  await away(A);
  check(`${theme} : « Fermer » referme la fenêtre ; le suivi reste éteint`, !(await A.evaluate(() => Editor.isTrackChangesOn())));

  // 6) arrêter : le bouton de la barre, puis la ligne du menu
  const stopButton = await rectOf(B, '.live-bar-stop');
  check(`${theme} : le bouton « Arrêter » de la barre est dans le panneau et reçoit le clic`, !!stopButton && stopButton.onTop && stopButton.r <= WIDTH && stopButton.b <= HEIGHT, stopButton);
  await B.mouse.move(stopButton.x - 10, stopButton.y - 4, { steps: 2 }); await B.mouse.move(stopButton.x, stopButton.y, { steps: 3 });
  await B.mouse.click(stopButton.x, stopButton.y);
  await waitLive(B, 'off');
  const afterStop = await B.evaluate(() => ({ bar: !!document.getElementById('live-bar'), button: document.getElementById('v2-btn-collab').classList.contains('is-active'), text: EditorCore.getEditor().state.doc.textContent }));
  check(`${theme} : « Arrêter » éteint le direct de Bob : plus de barre, le bouton s'éteint, le texte reste à l'écran`, !afterStop.bar && !afterStop.button && /Bob a écrit\./.test(afterStop.text) && /Alice écrit/.test(afterStop.text), afterStop);
  await A.waitForFunction(() => /personne d’autre pour l’instant/.test((document.querySelector('.live-bar-text') || {}).textContent || ''), null, { timeout: 20000 });
  const barAlone = await barOf(A);
  check(`${theme} : Alice voit Bob partir : sa barre repasse à « personne d'autre pour l'instant », une seule pastille « Vous »`, !!barAlone && JSON.stringify(barAlone.chips) === JSON.stringify(['Vous']), barAlone && barAlone.chips);
  const stopRow = await A.evaluate(() => document.getElementById('v2-btn-live-label').textContent);
  await clickRow(A, '#v2-btn-live', 0);
  await waitLive(A, 'off');
  await away(A);
  const afterMenuStop = await A.evaluate(() => ({ bar: !!document.getElementById('live-bar'), button: document.getElementById('v2-btn-collab').classList.contains('is-active'), label: document.getElementById('v2-btn-live-label').textContent, pressed: document.getElementById('v2-btn-live').getAttribute('aria-pressed') }));
  check(`${theme} : la ligne « ${stopRow} » du menu éteint le direct d'Alice : plus de barre, bouton éteint, la ligne redevient « Écriture en direct »`, !afterMenuStop.bar && !afterMenuStop.button && afterMenuStop.label === 'Écriture en direct' && afterMenuStop.pressed === 'false', afterMenuStop);

  // 7) le clavier (une personne seule, sa propre salle)
  const carole = await open({ table: kit.newTable(), identity: people.Carole, colorScheme: dark ? 'dark' : 'light' });
  const C = carole.page;
  await C.focus('#v2-btn-find');
  await C.keyboard.press('Tab');
  const k1 = await C.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-collab-flyout')).display }));
  await C.keyboard.press('Tab');
  const k2 = await C.evaluate(() => document.activeElement.id);
  await C.keyboard.press('Tab');
  const k3 = await C.evaluate(() => ({ active: document.activeElement.id, open: getComputedStyle(document.getElementById('v2-collab-flyout')).display }));
  check(`${theme} : au clavier, Tab arrive sur le bouton (le menu s'ouvre), puis « Suivi des modifications », puis « Écriture en direct » (les deux lignes grisées d'office sont sautées)`, k1.active === 'v2-btn-collab' && k1.open === 'flex' && k2 === 'v2-btn-track-changes' && k3.active === 'v2-btn-live' && k3.open === 'flex', { k1, k2, k3 });
  await C.keyboard.press('Enter');
  await waitLive(C);
  const k4 = await C.evaluate(() => ({ live: LiveEntry.state(), bar: !!document.getElementById('live-bar'), button: document.getElementById('v2-btn-collab').classList.contains('is-active') }));
  check(`${theme} : Entrée sur la ligne allume l'écriture en direct (barre, bouton allumé)`, k4.live === 'live' && k4.bar && k4.button, k4);
  await C.evaluate(() => LiveEntry.stop());
  await waitLive(C, 'off');
  await away(C);
}

// ---- 8) en anglais -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

console.log(`\n== Panneau ${WIDTH}x${HEIGHT}, anglais ==`);
const english = await open({ table: kit.newTable(), identity: people.Alice, lang: 'en' });
const E = english.page;
await hover(E, '#v2-btn-collab');
const enRow = await E.evaluate(() => ({ title: document.querySelector('#v2-collab-flyout .v2-hover-flyout-label').textContent.trim(), label: document.getElementById('v2-btn-live-label').textContent }));
check('en anglais : le menu s\'appelle « Collaborative editing » et la ligne « Live editing »', enRow.title === 'Collaborative editing' && enRow.label === 'Live editing', enRow);
await clickRow(E, '#v2-btn-live', 0);
await waitLive(E);
await away(E);
const enBar = await barOf(E);
const enAfter = await E.evaluate(() => document.getElementById('v2-btn-live-label').textContent);
check('en anglais : la barre dit « Live editing · nobody else yet » avec la pastille « You », et la ligne devient « Stop live editing »', !!enBar && /Live editing · nobody else yet/.test(enBar.text) && JSON.stringify(enBar.chips) === JSON.stringify(['You']) && enAfter === 'Stop live editing', { enBar: enBar && { text: enBar.text, chips: enBar.chips }, enAfter });
await E.screenshot({ path: `${SHOTS}/anglais.png`, clip: { x: 0, y: 0, width: WIDTH, height: 200 } });
await E.evaluate(() => LiveEntry.stop());
await waitLive(E, 'off');

// ---- 9) le widget seul ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

console.log(`\n== Panneau ${WIDTH}x${HEIGHT}, widget seul ==`);
const alone = await open({ hosted: false, identity: people.Alice });
const L = alone.page;
await hover(L, '#v2-btn-collab');
const aloneRow = await L.evaluate(() => { const row = document.getElementById('v2-btn-live'); return { aria: row.getAttribute('aria-disabled'), grey: row.classList.contains('v2-hover-row-disabled'), title: row.title, label: document.getElementById('v2-btn-live-label').textContent }; });
const aloneRect = await rectOf(L, '#v2-btn-live');
check('seul : la ligne « Écriture en direct » est là, grisée, avec sa raison en info-bulle, et reçoit le clic', aloneRow.aria === 'true' && aloneRow.grey && aloneRow.title === 'Demande l’extension Édition collaborative (Grist Factory Suite)' && aloneRow.label === 'Écriture en direct' && aloneRect.onTop, { aloneRow, aloneRect });
await clickRow(L, '#v2-btn-live', 0);
await waitDialog(L);
const aloneInfo = await L.evaluate(dialogInfo);
const aloneFits = await dialogFits(L);
check('seul : le clic ouvre la fenêtre « Cette fonction demande Grist Factory Suite », qui tient dans le panneau, avec « Fermer »', aloneInfo.title === 'Cette fonction demande Grist Factory Suite' && /Écriture en direct/.test(aloneInfo.text) && aloneInfo.buttons.includes('Fermer') && aloneFits.fits, { aloneInfo, aloneFits });
await clickDialogButton(L, /Fermer/);
await waitDialogGone(L);
check('seul : « Fermer » la referme, le direct ne démarre pas et rien de la barre n\'apparaît', await L.evaluate(() => LiveEntry.state() === 'off' && !document.getElementById('live-bar')));

// ---- Fin -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

check('aucune erreur de page (pageerror) pendant tout le parcours', kit.pageErrors.length === 0, kit.pageErrors);
check('aucune boîte native (alert, confirm, prompt) n\'a été ouverte', natives.every(list => list.length === 0), natives.filter(list => list.length));
await kit.close();
console.log(`\ncaptures : ${SHOTS}`);
finish();
