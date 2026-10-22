#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi la PAGE du modèle (format, sens, marges, filigrane), à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de
// 700x400 d'Antoine, en français clair puis en anglais sombre - sa demande du 22/10 : « le ctrl+Z ne prend pas en compte le changement de format. Il doit prendre en compte 100% des actions faites dans le widget ».
// Ce que dev-tests/scenarios-undo-page.js ne peut pas voir depuis la page : où est le focus après un VRAI geste. Un clic de menu laisse le focus sur le bouton Page, la fermeture d'une fenêtre sur le corps de la page - pas dans
// l'éditeur, où TipTap écoute Ctrl + Z. La touche doit agir là aussi (js/shortcuts.js, `anywhere`).
//   1) le format : le survol du bouton Page ouvre le menu, un vrai clic sur « A5 » change la page ; Ctrl + Z (focus sur le bouton) rend l'A4, la feuille et le bouton Page le disent ; Ctrl + Y, Ctrl + Maj + Z et les boutons Annuler /
//      Rétablir de la barre font de même, dans les deux sens ;
//   2) le sens : « Paysage » du menu, Ctrl + Z rend le portrait, Ctrl + Y le paysage ;
//   3) l'ordre des gestes : du texte tapé au clavier, le format changé au menu, d'autre texte tapé ; trois Ctrl + Z défont dans l'ordre le second texte, le format, le premier texte, trois Ctrl + Y les rendent ;
//   4) les marges de la fenêtre Réglages : un vrai clic sur « Étroites » puis la fenêtre fermée, Ctrl + Z rend les marges d'avant (Ctrl + Y les étroites) ; une marge tapée au clavier (deux chiffres) n'est qu'UN pas ;
//   5) le filigrane : la ligne « Filigrane… » du menu, un texte saisi et validé, Ctrl + Z le retire, Ctrl + Y le rend ;
//   6) dans un champ de saisie (le champ d'une marge de Réglages) Ctrl + Z reste au champ : il défait la frappe, et la page ne bouge que par ce que le champ dit ; aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoPageMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-page-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_PAGE_MOUSE_PORT || 9141);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const FIRST = 'Premier paragraphe du contrat.';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const FORMAT = id => `#v2-page-flyout [data-page-format="${id}"]`;
const ORIENTATION = id => `#v2-page-flyout [data-page-orientation="${id}"]`;
const WATERMARK_ROW = '#v2-btn-watermark';

// La page telle que la personne la voit : le format et le sens du modèle, la largeur de la feuille, ce que dit le bouton Page, les marges, le filigrane, le texte du premier paragraphe.
const snap = page => page.evaluate(() => {
  const m = PageLayout.getMarginsMm();
  const wm = PageLayout.getWatermark();
  const button = document.getElementById('btn-page-orientation');
  return {
    format: PageLayout.getFormat(), orientation: PageLayout.getOrientation(),
    sheet: getComputedStyle(document.documentElement).getPropertyValue('--pp-page-width').trim(),
    label: button.getAttribute('aria-label'), data: button.dataset.orientation,
    margins: [m.top, m.right, m.bottom, m.left].map(v => Math.round(v * 10) / 10),
    watermark: wm ? wm.text : null,
    text: EditorCore.getEditor().getText(),
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
  };
});
const focusIn = page => page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest && !!a.closest('.ProseMirror'); });

// Une touche au vrai clavier, puis le temps que l'historique rende la page (mise en page, enregistrement automatique prévenu).
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(350);
}
const focusName = page => page.evaluate(() => (document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null));

async function openMargins(page) {
  await click(page, '#v2-btn-settings');
  await sleep(500);
  await click(page, '.settings-tab[data-settings-tab="pageMargins"]');
  await sleep(400);
}
async function closeSettings(page) {
  await click(page, '#settings-close');
  await sleep(400);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    // Un premier paragraphe tapé au clavier : le modèle neuf n'a rien d'autre, et ce texte est le plus ancien pas de l'historique.
    await click(page, '.tiptap p');
    await page.keyboard.type(FIRST);
    await sleep(700);
    const start = await snap(page);

    console.log(`\n[${tag}] Le format`);
    check(`${tag} : le modèle s'ouvre en A4 portrait, le menu Page est là`, start.format === 'A4' && start.orientation === 'portrait', start);
    // Un clic à côté de l'éditeur (le coin d'état) : le focus retombe sur le corps de la page, comme après une fenêtre fermée.
    await click(page, '#status-msg');
    await sleep(200);
    check(`${tag} : le focus est sur le corps de la page, hors de l'éditeur`, (await focusName(page)) === 'BODY', await focusName(page));
    await clickHoverRow(page, '#btn-page-orientation', FORMAT('A5'));
    await sleep(500);
    const a5 = await snap(page);
    check(`${tag} : un clic sur « A5 » change la page (modèle, feuille, bouton Page)`, a5.format === 'A5' && a5.sheet !== start.sheet && /A5/.test(a5.label), a5);
    check(`${tag} : après le menu, le focus est toujours hors de l'éditeur (c'est le cas à couvrir)`, !(await focusIn(page)), a5.focus);
    await key(page, 'Control+z');
    let now = await snap(page);
    check(`${tag} : Ctrl + Z rend l'A4 (modèle, feuille, bouton Page)`, now.format === 'A4' && now.sheet === start.sheet && /A4/.test(now.label) && !/A5/.test(now.label), now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend l'A5`, now.format === 'A5' && now.sheet === a5.sheet && /A5/.test(now.label), now);
    await key(page, 'Control+z');
    await page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
    check(`${tag} : le focus sur le corps de la page (hors de l'éditeur)`, (await focusName(page)) === 'BODY', await focusName(page));
    await key(page, 'Control+Shift+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Maj + Z, focus sur le corps, rend l'A5`, now.format === 'A5' && now.sheet === a5.sheet, now);
    await click(page, '#v2-btn-undo');
    await sleep(350);
    now = await snap(page);
    check(`${tag} : le bouton Annuler de la barre rend l'A4`, now.format === 'A4' && now.sheet === start.sheet, now);
    await click(page, '#v2-btn-redo');
    await sleep(350);
    now = await snap(page);
    check(`${tag} : le bouton Rétablir de la barre rend l'A5`, now.format === 'A5' && now.sheet === a5.sheet, now);
    await click(page, '#v2-btn-undo');
    await sleep(350);

    console.log(`\n[${tag}] Le sens`);
    await clickHoverRow(page, '#btn-page-orientation', ORIENTATION('landscape'));
    await sleep(500);
    const landscape = await snap(page);
    check(`${tag} : un clic sur « Paysage » tourne la page`, landscape.orientation === 'landscape' && landscape.data === 'landscape' && landscape.sheet !== start.sheet, landscape);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z rend le portrait (le bouton Page le dit)`, now.orientation === 'portrait' && now.data === 'portrait' && now.sheet === start.sheet, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend le paysage`, now.orientation === 'landscape' && now.sheet === landscape.sheet, now);
    await key(page, 'Control+z');

    console.log(`\n[${tag}] L'ordre des gestes, texte et page mêlés`);
    await click(page, '.tiptap p');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Alpha');
    await sleep(700);
    await clickHoverRow(page, '#btn-page-orientation', FORMAT('A5'));
    await sleep(500);
    await click(page, '.tiptap p');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Beta');
    await sleep(500);
    const mixed = await snap(page);
    check(`${tag} : le texte (Alpha, Beta) et l'A5 sont posés`, mixed.format === 'A5' && /Alpha/.test(mixed.text) && /Beta/.test(mixed.text), mixed);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 1er Ctrl + Z défait « Beta » et laisse l'A5`, now.format === 'A5' && /Alpha/.test(now.text) && !/Beta/.test(now.text), now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 2e Ctrl + Z rend l'A4 et laisse « Alpha »`, now.format === 'A4' && /Alpha/.test(now.text) && !/Beta/.test(now.text), now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 3e Ctrl + Z défait « Alpha »`, now.format === 'A4' && !/Alpha/.test(now.text) && now.text.indexOf(FIRST) !== -1, now);
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : deux Ctrl + Y rendent « Alpha » puis l'A5`, now.format === 'A5' && /Alpha/.test(now.text) && !/Beta/.test(now.text), now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : le 3e Ctrl + Y rend « Beta »`, now.format === 'A5' && /Beta/.test(now.text), now);
    for (let at = 0; at < 3; at++) await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : trois Ctrl + Z de plus ramènent le modèle du départ`, now.format === 'A4' && now.text.indexOf('Alpha') === -1 && now.sheet === start.sheet, now);

    console.log(`\n[${tag}] Les marges de la fenêtre Réglages`);
    const marginsBefore = (await snap(page)).margins;
    await openMargins(page);
    await click(page, '#settings-margin-preset-narrow');
    await sleep(400);
    await closeSettings(page);
    now = await snap(page);
    check(`${tag} : « Étroites » pose 12,7 mm partout`, same(now.margins, [12.7, 12.7, 12.7, 12.7]), now.margins);
    check(`${tag} : la fenêtre fermée, le focus n'est pas dans l'éditeur`, !(await focusIn(page)), await focusName(page));
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z rend les marges d'avant`, same(now.margins, marginsBefore), { now: now.margins, marginsBefore });
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend les marges étroites`, same(now.margins, [12.7, 12.7, 12.7, 12.7]), now.margins);
    // Une marge tapée au clavier : deux chiffres, UN pas.
    await openMargins(page);
    await click(page, '#settings-margin-top');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('31');
    await page.keyboard.press('Tab');
    await sleep(300);
    await closeSettings(page);
    now = await snap(page);
    check(`${tag} : la marge haute tapée (31) est posée`, now.margins[0] === 31, now.margins);
    const afterTyped = now.margins;
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : UN Ctrl + Z rend la marge d'avant (pas un chiffre à la fois)`, same(now.margins, [12.7, 12.7, 12.7, 12.7]), now.margins);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend la marge tapée`, same(now.margins, afterTyped), now.margins);
    await key(page, 'Control+z');
    await key(page, 'Control+z');

    console.log(`\n[${tag}] Le filigrane`);
    await clickHoverRow(page, '#btn-page-orientation', WATERMARK_ROW);
    await sleep(500);
    await page.keyboard.type('BROUILLON');
    await sleep(200);
    await page.evaluate(() => { const buttons = document.querySelectorAll('#pp-watermark-modal .var-modal-actions button'); const ok = Array.from(buttons).filter(b => !b.hidden).pop(); ok.scrollIntoView({ block: 'nearest' }); });
    await click(page, '#pp-watermark-modal .var-modal-actions button:last-child');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : le filigrane saisi et validé est posé`, now.watermark === 'BROUILLON', now.watermark);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z retire le filigrane`, now.watermark === null, now.watermark);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y le rend`, now.watermark === 'BROUILLON', now.watermark);

    console.log(`\n[${tag}] Dans un champ de saisie`);
    await openMargins(page);
    await click(page, '#settings-margin-left');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('18');
    await sleep(300);
    const typedField = await page.evaluate(() => ({ field: document.getElementById('settings-margin-left').value, left: PageLayout.getMarginsMm().left }));
    check(`${tag} : la marge gauche tapée dans son champ est posée`, Number(typedField.field) === 18 && Math.round(typedField.left) === 18, typedField);
    await page.keyboard.press('Control+z');
    await sleep(350);
    const afterField = await page.evaluate(() => ({ field: document.getElementById('settings-margin-left').value, inField: document.activeElement && document.activeElement.id, wm: (PageLayout.getWatermark() || {}).text || null }));
    check(`${tag} : Ctrl + Z reste au champ (la frappe se défait, le filigrane n'est pas touché, le focus reste au champ)`, afterField.inField === 'settings-margin-left' && afterField.field !== '18' && afterField.wm === 'BROUILLON', afterField);
    await closeSettings(page);

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
