#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir défont « Tout accepter » et « Tout refuser » D'UN SEUL pas, même avec plus de 200 modifications en attente, à la VRAIE souris et au vrai clavier
// (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions
// faites dans le widget ». Ce que dev-tests/scenarios-undo-suggestions.js ne peut pas voir depuis la page : la ligne du menu « Édition collaborative » atteinte et cliquée à la souris, les ajouts PEINTS
// (les <ins> de l'éditeur) et les deux lignes « Tout accepter » / « Tout refuser » dégrisées ou regrisées comme la personne les voit.
//   1) 450 ajouts en attente (trois tranches de 200, 200 et 50) : un vrai clic sur « Tout accepter » les accepte tous, les deux lignes se regrisent ;
//   2) UN Ctrl + Z au vrai clavier rend les 450 ajouts à l'écran, les deux lignes se dégrisent ; UN Ctrl + Y les accepte de nouveau ;
//   3) un vrai clic sur « Tout refuser » les refuse tous (le texte d'origine) ; le bouton Annuler de la barre, au vrai clic, les rend tous ; Rétablir les refuse de nouveau ;
//   4) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoSuggestionsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-suggestions-mouse.mjs
import { open, stopServer, sleep, click, hoverRow } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_SUGGESTIONS_MOUSE_PORT || 9148);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const COUNT = 450;
const ADDS = Array.from({ length: COUNT }, (_, i) => '<p>L' + i + '<ins data-id="' + (i + 1) + '">+</ins></p>').join('');

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// Ce que la personne voit : les ajouts peints, les deux lignes du menu (grisées ou non), le focus.
const snap = page => page.evaluate(() => ({
  painted: document.querySelectorAll('.tiptap ins').length,
  paragraphs: document.querySelectorAll('.tiptap p').length,
  firstText: (document.querySelector('.tiptap p') || {}).textContent,
  acceptOff: document.getElementById('v2-btn-accept-all').disabled,
  rejectOff: document.getElementById('v2-btn-reject-all').disabled,
  focusInEditor: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')),
}));
// Un vrai clic sur une ligne du menu « Édition collaborative » : le survol du bouton l'ouvre, la souris descend à la ligne (qui doit être atteinte, rien ne la recouvre).
async function clickRow(page, rowSel) {
  const row = await hoverRow(page, '#v2-btn-collab', rowSel);
  const reach = await page.evaluate(sel => { const e = document.querySelector(sel); const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && e.contains(hit) && r.bottom <= innerHeight; }, rowSel);
  if (!reach) throw new Error('la ligne du menu ne se laisse pas atteindre à la souris : ' + rowSel);
  await page.mouse.click(row.x, row.y);
  await sleep(900);
  await page.mouse.move(350, 300);
  await sleep(300);
}
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(800);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await page.evaluate(html => { Editor.setHTML(html); }, ADDS);
    await sleep(800);
    await click(page, '.tiptap p');
    await sleep(300);
    let now = await snap(page);
    console.log(`\n[${tag}] Tout accepter`);
    check(`${tag} : au départ, ${COUNT} ajouts peints, les deux lignes dégrisées`, now.painted === COUNT && !now.acceptOff && !now.rejectOff, now);

    await clickRow(page, '#v2-btn-accept-all');
    now = await snap(page);
    check(`${tag} : un vrai clic sur « Tout accepter » les accepte tous (plus aucun ajout peint)`, now.painted === 0 && now.paragraphs === COUNT && now.firstText === 'L0+', now);
    check(`${tag} : les deux lignes se regrisent`, now.acceptOff && now.rejectOff, now);

    await click(page, '.tiptap p');
    await sleep(200);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Z rend les ${COUNT} ajouts à l'écran`, now.painted === COUNT, now);
    check(`${tag} : les deux lignes se dégrisent`, !now.acceptOff && !now.rejectOff, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Y les accepte de nouveau`, now.painted === 0 && now.acceptOff, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : un nouveau Ctrl + Z les rend, et il n'y a rien derrière`, now.painted === COUNT && !(await page.evaluate(() => EditorCore.getEditor().can().undo())), now);

    console.log(`\n[${tag}] Tout refuser`);
    await clickRow(page, '#v2-btn-reject-all');
    now = await snap(page);
    check(`${tag} : un vrai clic sur « Tout refuser » les refuse tous`, now.painted === 0 && now.paragraphs === COUNT && now.firstText === 'L0' && now.acceptOff && now.rejectOff, now);
    await click(page, '#v2-btn-undo');
    await sleep(800);
    now = await snap(page);
    check(`${tag} : le bouton Annuler de la barre rend les ${COUNT} ajouts, d'un seul clic`, now.painted === COUNT && !now.acceptOff, now);
    await click(page, '#v2-btn-redo');
    await sleep(800);
    now = await snap(page);
    check(`${tag} : le bouton Rétablir les refuse de nouveau`, now.painted === 0 && now.firstText === 'L0', now);

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
