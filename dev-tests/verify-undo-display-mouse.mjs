#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi la numérotation des titres que la page AFFICHE - les titres numérotés à l'écran, le panneau « Titre » -, à la VRAIE souris et au vrai clavier
// (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans
// le widget ». Ce que dev-tests/scenarios-undo-display.js ne peut pas voir depuis la page : ce que la feuille PEINT (le compteur CSS devant le titre) après un vrai appui sur le bouton « 1) » du panneau, et le bouton
// allumé du panneau rouvert au survol.
//   1) le panneau « Titre » ouvert au survol, un vrai clic sur « 1) » : les titres sont numérotés à l'écran, le bouton « 1) » est allumé ;
//   2) Ctrl + Z au vrai clavier : les titres perdent leur numéro à l'écran, le panneau rouvert allume « Aucune » ; Ctrl + Y les numérote de nouveau ;
//   3) les boutons Annuler et Rétablir de la barre font de même ;
//   4) deux réglages à la suite sont deux pas : Ctrl + Z rend le premier, un second le texte sans numéro ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoDisplayMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-display-mouse.mjs
import { open, stopServer, sleep, click, hoverRow } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_DISPLAY_MOUSE_PORT || 9147);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const SEG = style => `#v2-numbering-seg [data-num="${style}"]`;

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Ce que la personne voit : le compteur peint devant le premier titre (« none » sans numérotation), le style du document, le bouton allumé du panneau.
const snap = page => page.evaluate(() => {
  const h1 = document.querySelector('.tiptap h1');
  const counter = getComputedStyle(h1, '::before').content;
  return {
    painted: counter !== 'none' && counter !== 'normal' && /counter/.test(counter),
    node: Editor.getHeadingNumberingStyle(),
    root: document.querySelector('.tiptap').dataset.headingStyle || 'none',
    lit: Array.from(document.querySelectorAll('#v2-numbering-seg [data-num]')).filter(b => b.classList.contains('active')).map(b => b.dataset.num),
    focusInEditor: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')),
  };
});
// Le panneau « Titre » ouvert au vrai survol de son bouton ; à 700x400 la rangée de numérotation est sous le pli du panneau, la molette la fait venir, puis un vrai clic sur le bouton voulu.
async function openPanel(page) {
  const row = await hoverRow(page, '#v2-heading-chip', '#v2-heading-flyout .v2-hover-row[data-level="p"]');
  await page.mouse.wheel(0, 600);
  await sleep(300);
  return row;
}
async function choose(page, style) {
  await openPanel(page);
  const seg = await page.evaluate(sel => {
    const b = document.querySelector(sel);
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, reachable: !!hit && !!hit.closest('#v2-numbering-seg') && y < innerHeight };
  }, SEG(style));
  if (!seg.reachable) throw new Error('le bouton de numérotation ne se laisse pas atteindre à la souris : ' + JSON.stringify(seg));
  await page.mouse.move(seg.x, seg.y, { steps: 5 });
  await sleep(200);
  await page.mouse.click(seg.x, seg.y);
  await sleep(300);
}
// Le panneau rouvert au survol : quel bouton est allumé, tel que la personne le voit.
async function litAfterHover(page) {
  await page.mouse.move(350, 300);
  await sleep(300);
  await openPanel(page);
  const lit = await page.evaluate(() => Array.from(document.querySelectorAll('#v2-numbering-seg [data-num]')).filter(b => b.classList.contains('active')).map(b => b.dataset.num));
  await page.mouse.move(350, 300);
  await sleep(300);
  return lit;
}
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(450);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await page.evaluate(() => { Editor.setHTML('<h1>Introduction</h1><p>Texte du début.</p><h2>Contexte</h2><p>Suite.</p>'); });
    await sleep(500);
    await click(page, '.tiptap p');
    await sleep(300);
    let now = await snap(page);
    console.log(`\n[${tag}] Le panneau « Titre »`);
    check(`${tag} : au départ les titres ne sont pas numérotés à l'écran`, !now.painted && now.node === 'none' && now.root === 'none', now);

    await choose(page, 'numeric');
    now = await snap(page);
    check(`${tag} : un vrai clic sur « 1) » numérote les titres à l'écran`, now.painted && now.node === 'numeric' && now.root === 'numeric', now);
    check(`${tag} : le bouton « 1) » est allumé`, now.lit.join() === 'numeric', now.lit);
    check(`${tag} : le focus est revenu dans le texte`, now.focusInEditor, now);

    console.log(`\n[${tag}] Le clavier`);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z retire la numérotation à l'écran`, !now.painted && now.node === 'none' && now.root === 'none', now);
    check(`${tag} : le panneau rouvert allume « Aucune »`, (await litAfterHover(page)).join() === 'none');
    await click(page, '.tiptap p');
    await sleep(200);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y la numérote de nouveau à l'écran`, now.painted && now.node === 'numeric' && now.root === 'numeric', now);
    check(`${tag} : le panneau rouvert allume « 1) »`, (await litAfterHover(page)).join() === 'numeric');

    console.log(`\n[${tag}] Les boutons de la barre`);
    await click(page, '#v2-btn-undo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : le bouton Annuler retire la numérotation à l'écran`, !now.painted && now.node === 'none' && now.root === 'none', now);
    await click(page, '#v2-btn-redo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : le bouton Rétablir la rend à l'écran`, now.painted && now.node === 'numeric' && now.root === 'numeric', now);

    console.log(`\n[${tag}] Deux réglages, deux pas`);
    await sleep(600);
    await choose(page, 'roman');
    now = await snap(page);
    check(`${tag} : « I) » remplace « 1) » à l'écran`, now.painted && now.node === 'roman' && now.root === 'roman', now);
    await click(page, '.tiptap p');
    await sleep(200);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z rend « 1) » (le panneau et l'écran)`, now.painted && now.node === 'numeric' && now.root === 'numeric' && (await litAfterHover(page)).join() === 'numeric', now);
    await click(page, '.tiptap p');
    await sleep(200);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : un second Ctrl + Z rend le texte sans numéro`, !now.painted && now.node === 'none' && now.root === 'none', now);

    const errors = realErrors(w);
    check(`${tag} : aucune erreur de page`, errors.length === 0, errors.slice(0, 3));
  } finally { await w.close(); }
}

try {
  await pass('fr', 'light', 'fr clair');
  await pass('en', 'dark', 'en sombre');
} catch (e) { failures++; console.log('ERREUR', e && e.stack || e); }
finally { await stopServer(); }
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
