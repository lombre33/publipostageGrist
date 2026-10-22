#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi l'EN-TÊTE et le PIED de page, à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine,
// en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget ».
// Ce que dev-tests/scenarios-undo-model.js ne peut pas voir depuis la page : où est le focus après un VRAI « Terminer » (la pastille d'édition disparaît avec son bouton : le focus retombe sur le corps de la page, hors de
// l'éditeur) et ce que la feuille montre dans la marge. La touche doit agir là aussi (js/shortcuts.js, `anywhere`) et l'en-tête s'effacer de la feuille.
//   1) un clic dans la bande « + Ajouter un en-tête », du texte tapé au clavier, « Terminer » : Ctrl + Z efface l'en-tête de la feuille (la bande redevient une invitation) et rend un en-tête « désactivé », Ctrl + Y le rend ;
//   2) le même parcours au pied de page ; Ctrl + Z défait le pied et laisse l'en-tête ;
//   3) l'ordre des gestes : du texte dans le corps, l'en-tête, du texte dans le corps ; trois Ctrl + Z défont le second texte, l'en-tête, le premier texte ; trois Ctrl + Y les rendent ;
//   4) les boutons Annuler et Rétablir de la barre font de même qu'au clavier ;
//   5) pendant la séance, Ctrl + Z reste à la zone : il défait la frappe de la zone, la zone reste ouverte, le corps n'est pas touché ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoModelMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-model-mouse.mjs
import { open, stopServer, sleep, click } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_MODEL_MOUSE_PORT || 9143);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const FIRST = 'Premier paragraphe du contrat.';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

// L'en-tête et le pied tels que le modèle les garde et tels que la feuille les montre (la bande est « remplie » quand elle porte du texte), le texte du corps, le mode d'écriture, le focus.
const snap = page => page.evaluate(() => {
  const d = Editor.getHeaderFooterData();
  const strip = html => String(html || '').replace(/<[^>]*>/g, '');
  const zone = pos => { const el = document.querySelector('#editor-container .v2-page-edge-' + pos); return el ? { filled: el.classList.contains('v2-hf-zone-filled'), text: el.textContent.trim() } : null; };
  const editing = Editor.isEditingHeaderFooter();
  return {
    header: strip(d.header.default), footer: strip(d.footer.default), enabled: d.enabled, editing,
    top: zone('top'), bottom: zone('bottom'),
    text: editing ? null : EditorCore.getEditor().getText(),
    focusInEditor: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.ProseMirror')),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
  };
});
const center = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

// Un clic de vraie souris dans la bande de la zone (haut ou bas de la feuille) : les espaceurs ne prennent pas la souris, le clic tombe sur la feuille et js/header-footer-preview.js:zoneUnderPointer le rend à la zone.
async function clickZone(page, pos) {
  const sel = '#editor-container .v2-page-edge-' + pos;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(300);
  const c = await center(page, sel);
  await page.mouse.move(c.x, c.y);
  await sleep(100);
  await page.mouse.click(c.x, c.y);
  await sleep(400);
  return page.evaluate(() => Editor.isEditingHeaderFooter());
}
// « Terminer » de la pastille d'édition, à la vraie souris.
async function clickDone(page) {
  const c = await center(page, '#v2-hf-btn-done');
  await page.mouse.move(c.x, c.y);
  await sleep(100);
  await page.mouse.click(c.x, c.y);
  await sleep(400);
  return page.evaluate(() => !Editor.isEditingHeaderFooter() && !document.getElementById('v2-hf-pill'));
}
// Du texte tapé au vrai clavier dans le texte que l'éditeur contient (la zone ouverte).
async function typeIn(page, text) {
  await click(page, '#editor-container .tiptap p');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await sleep(250);
}
// Une touche au vrai clavier, puis le temps que l'historique rende le modèle (mise en page, enregistrement automatique prévenu).
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(450);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await click(page, '.tiptap p');
    await page.keyboard.type(FIRST);
    await sleep(700);
    let now = await snap(page);
    console.log(`\n[${tag}] L'en-tête`);
    check(`${tag} : le modèle s'ouvre sans en-tête ni pied, les bandes sont des invitations`, now.header === '' && now.footer === '' && !now.enabled && now.top && !now.top.filled && now.bottom && !now.bottom.filled, now);
    check(`${tag} : un clic dans la bande du haut ouvre l'écriture de l'en-tête`, await clickZone(page, 'top'));
    await typeIn(page, 'Entête client');
    check(`${tag} : « Terminer » à la souris referme la zone`, await clickDone(page));
    now = await snap(page);
    check(`${tag} : l'en-tête est écrit, la feuille le montre, le corps est intact`, now.header === 'Entête client' && now.enabled && now.top.filled && /Entête client/.test(now.top.text) && now.text.indexOf(FIRST) !== -1, now);
    check(`${tag} : après « Terminer », le focus est hors de l'éditeur (le cas à couvrir)`, !now.focusInEditor, now.focus);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z efface l'en-tête de la feuille (la bande redevient une invitation)`, now.header === '' && !now.enabled && !now.top.filled && !/Entête client/.test(now.top.text), now);
    check(`${tag} : Ctrl + Z n'a pas touché au texte du corps ni rouvert la zone`, now.text.indexOf(FIRST) !== -1 && !now.editing, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend l'en-tête sur la feuille`, now.header === 'Entête client' && now.enabled && now.top.filled && /Entête client/.test(now.top.text) && !now.editing, now);

    console.log(`\n[${tag}] Le pied`);
    check(`${tag} : un clic dans la bande du bas ouvre l'écriture du pied`, await clickZone(page, 'bottom'));
    await typeIn(page, 'Pied de page');
    check(`${tag} : « Terminer » referme le pied`, await clickDone(page));
    now = await snap(page);
    check(`${tag} : le pied est écrit, l'en-tête reste`, now.footer === 'Pied de page' && now.header === 'Entête client' && now.bottom.filled, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z défait le pied et laisse l'en-tête`, now.footer === '' && !now.bottom.filled && now.header === 'Entête client' && now.top.filled, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend le pied`, now.footer === 'Pied de page' && now.bottom.filled, now);
    await key(page, 'Control+z');
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : deux Ctrl + Z de plus ramènent un modèle sans en-tête ni pied`, now.header === '' && now.footer === '' && !now.enabled && !now.top.filled && !now.bottom.filled && now.text.indexOf(FIRST) !== -1, now);

    console.log(`\n[${tag}] L'ordre des gestes, texte et en-tête mêlés`);
    await typeIn(page, ' Alpha');
    await sleep(500);
    check(`${tag} : une zone ouverte`, await clickZone(page, 'top'));
    await typeIn(page, 'Tête');
    await clickDone(page);
    await typeIn(page, ' Beta');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : « Alpha », l'en-tête et « Beta » sont posés`, /Alpha/.test(now.text) && /Beta/.test(now.text) && now.header === 'Tête', now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 1er Ctrl + Z défait « Beta » et laisse l'en-tête`, /Alpha/.test(now.text) && !/Beta/.test(now.text) && now.header === 'Tête', now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 2e Ctrl + Z défait l'en-tête et laisse « Alpha »`, /Alpha/.test(now.text) && now.header === '' && !now.top.filled, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 3e Ctrl + Z défait « Alpha »`, !/Alpha/.test(now.text) && now.text.indexOf(FIRST) !== -1 && now.header === '', now);
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : deux Ctrl + Y rendent « Alpha » puis l'en-tête`, /Alpha/.test(now.text) && !/Beta/.test(now.text) && now.header === 'Tête' && now.top.filled, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : le 3e Ctrl + Y rend « Beta »`, /Beta/.test(now.text) && now.header === 'Tête', now);

    console.log(`\n[${tag}] Les boutons de la barre`);
    await click(page, '#v2-btn-undo');
    await sleep(400);
    await click(page, '#v2-btn-undo');
    await sleep(450);
    now = await snap(page);
    check(`${tag} : deux clics sur Annuler défont « Beta » puis l'en-tête`, !/Beta/.test(now.text) && now.header === '' && !now.top.filled, now);
    await click(page, '#v2-btn-redo');
    await sleep(450);
    now = await snap(page);
    check(`${tag} : un clic sur Rétablir rend l'en-tête sur la feuille`, now.header === 'Tête' && now.top.filled, now);
    await key(page, 'Control+z');

    console.log(`\n[${tag}] Pendant la séance`);
    check(`${tag} : une zone ouverte pour la séance`, await clickZone(page, 'top'));
    await typeIn(page, 'Brouillon');
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z défait la frappe de la zone et la laisse ouverte`, now.editing, now);
    check(`${tag} : le brouillon de la zone n'a plus son texte`, await page.evaluate(() => !/Brouillon/.test(EditorCore.getEditor().getText())), await page.evaluate(() => EditorCore.getEditor().getText()));
    await clickDone(page);
    now = await snap(page);
    check(`${tag} : « Terminer » : le corps est intact`, now.text.indexOf(FIRST) !== -1 && !now.editing, now);

    check(`${tag} : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } finally {
    await w.close();
  }
}

try {
  await pass('fr', 'light', 'français, clair');
  await pass('en', 'dark', 'anglais, sombre');
} catch (e) {
  check('le script va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
} finally {
  await stopServer();
}
console.log('\n' + (total - failures) + '/' + total + ' passés');
process.exit(failures ? 1 : 0);
