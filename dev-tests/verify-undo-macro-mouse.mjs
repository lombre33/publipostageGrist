#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi ce qu'un MACRO-MODÈLE garde hors du texte - sa page, l'œil d'un modèle du résumé, la composition de sa fenêtre -, à la VRAIE souris et au vrai clavier
// (page.mouse, page.keyboard ; Node/Playwright), dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le
// widget ». Ce que dev-tests/scenarios-undo-macro.js ne peut pas voir depuis la page : où est le focus après un VRAI clic sur un œil (le bouton, hors de l'éditeur, qui est caché) et ce que le résumé montre.
//   1) la barre : Annuler et Rétablir ne sont plus grisés devant un macro-modèle, Rechercher l'est toujours ;
//   2) l'œil : un vrai clic le ferme (barré, enfoncé), Ctrl + Z le rouvre (résumé, ligne de Grist, coin d'état), Ctrl + Y le referme, Ctrl + Maj + Z aussi ; le focus reste sur l'œil ;
//   3) les boutons de la barre font de même qu'au clavier ;
//   4) la page : le survol du bouton Page ouvre le menu, un vrai clic sur « A5 » change la page du macro-modèle ; Ctrl + Z rend l'A4 (la feuille, le bouton Page), Ctrl + Y l'A5 ;
//   5) l'ordre des gestes : un œil, le format, un autre œil ; trois Ctrl + Z, trois Ctrl + Y ;
//   6) la fenêtre de composition : « Modifier la composition » à la souris, une annexe de plus, « Enregistrer » ; Ctrl + Z rend la composition d'avant, Ctrl + Y celle d'après ; dans la fenêtre ouverte, Ctrl + Z reste au champ ;
//   7) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoMacroMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-macro-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_MACRO_MOUSE_PORT || 9144);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const FORMAT = id => `#v2-page-flyout [data-page-format="${id}"]`;

// Un macro-modèle composé comme par une personne : une page de garde (le premier modèle), puis une annexe conditionnelle ; ouvert par la liste, le résumé à l'écran.
const setupMacro = (page, nom) => page.evaluate(async name => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const byId = id => document.getElementById(id);
  const cover = await Templates.save(null, name + ' - garde', '<p>Page de garde</p>', '', null, null, 'document', null);
  const other = await Templates.save(null, name + ' - autre', '<p>Autre page</p>', '', null, null, 'document', null);
  const third = await Templates.save(null, name + ' - défaut', '<p>Page par défaut</p>', '', null, null, 'document', null);
  await Templates.loadAll();
  MacroEditor.openModal(null);
  byId('macro-editor-name').value = name;
  const select = byId('macro-editor-cover');
  select.value = String(cover.id);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  byId('macro-editor-save').click();
  await wait(800);
  const id = Templates.getCurrentId();
  const rule = (modeleId, value) => ({ column: 'Nom', operator: '=', value, modeleId });
  const slots = [{ type: 'fixed', modeleId: cover.id }, { type: 'conditional', rules: [rule(other.id, 'a'), rule(cover.id, 'b')], defaultModeleId: third.id }];
  window.__gristStub.remoteWrite('Publipostage_Modeles', id, { Contenu: JSON.stringify({ slots }) });
  await Templates.loadAll();
  const list = byId('template-select');
  list.value = String(id);
  list.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(900);
  return { id, coverId: cover.id, otherId: other.id, thirdId: third.id };
}, nom);

// Ce que la personne voit du macro-modèle : ses yeux, la composition de sa ligne, la page, le coin d'état, le focus.
const snap = (page, ids) => page.evaluate(({ id, coverId, otherId }) => {
  const row = window.__gristStub.getRow('Publipostage_Modeles', id);
  const slots = (() => { try { return JSON.parse(row.Contenu).slots; } catch (e) { return null; } })();
  const hidden = index => (slots && slots[index] ? (slots[index].hiddenModeleIds || []).map(String) : null);
  const eye = (slot, modelId) => { const el = document.querySelector('#macro-summary-parts .macro-summary-eye[data-slot="' + slot + '"][data-template-id="' + modelId + '"]'); return el ? el.getAttribute('aria-pressed') : null; };
  const button = document.getElementById('btn-page-orientation');
  const active = document.activeElement;
  return {
    coverEye: eye(0, coverId), annexEye: eye(1, otherId), coverHidden: hidden(0), annexHidden: hidden(1), annexCount: slots ? slots.length : null,
    format: PageLayout.getFormat(), sheet: getComputedStyle(document.documentElement).getPropertyValue('--pp-page-width').trim(), label: button.getAttribute('aria-label'),
    status: document.getElementById('status-msg').textContent,
    focus: active ? (active.className && String(active.className).split(' ')[0]) || active.id || active.tagName : null,
    summaryShown: getComputedStyle(document.getElementById('macro-summary-container')).display !== 'none',
    undoLocked: document.getElementById('v2-btn-undo').classList.contains('v2-hf-locked'), redoLocked: document.getElementById('v2-btn-redo').classList.contains('v2-hf-locked'),
    findLocked: document.getElementById('v2-btn-find').classList.contains('v2-hf-locked'),
    sentence: document.getElementById('macro-summary-text').textContent,
  };
}, ids);
// Une touche au vrai clavier, puis le temps que l'historique rende le macro-modèle (résumé, écriture dans la ligne).
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(700);
}
const clickEye = async (page, slot, modelId) => {
  const sel = `#macro-summary-parts .macro-summary-eye[data-slot="${slot}"][data-template-id="${modelId}"]`;
  await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await sleep(200);
  await click(page, sel);
  await sleep(700);
};

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    const macro = await setupMacro(page, 'Contrat cadre');
    const cover = String(macro.coverId), other = String(macro.otherId);
    let now = await snap(page, macro);
    const start = now;

    console.log(`\n[${tag}] La barre`);
    check(`${tag} : le résumé du macro-modèle est à l'écran, la composition a ses deux positions`, now.summaryShown && now.annexCount === 2, now);
    check(`${tag} : Annuler et Rétablir ne sont plus grisés, Rechercher l'est toujours`, !now.undoLocked && !now.redoLocked && now.findLocked, now);

    console.log(`\n[${tag}] L'œil d'un modèle`);
    await clickEye(page, 0, macro.coverId);
    now = await snap(page, macro);
    check(`${tag} : un vrai clic ferme l'œil de la page de garde (résumé et ligne)`, now.coverEye === 'true' && same(now.coverHidden, [cover]) && now.annexHidden !== null && same(now.annexHidden, []), now);
    check(`${tag} : le focus est sur l'œil (hors de l'éditeur, qui est caché)`, /macro-summary-eye/.test(String(now.focus)), now.focus);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Z rouvre l'œil (résumé et ligne)`, now.coverEye === 'false' && same(now.coverHidden, []), now);
    check(`${tag} : le coin d'état dit que le modèle est de nouveau dans la Lecture`, lang === 'fr' ? /de nouveau dans la Lecture/.test(now.status) : /back in Read mode/.test(now.status), now.status);
    await key(page, 'Control+y');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Y referme l'œil`, now.coverEye === 'true' && same(now.coverHidden, [cover]), now);
    await key(page, 'Control+z');
    await key(page, 'Control+Shift+z');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Z puis Ctrl + Maj + Z : l'œil est refermé`, now.coverEye === 'true' && same(now.coverHidden, [cover]), now);
    await key(page, 'Control+z');

    console.log(`\n[${tag}] Les boutons de la barre`);
    await click(page, '#v2-btn-redo');
    await sleep(700);
    now = await snap(page, macro);
    check(`${tag} : le bouton Rétablir referme l'œil`, now.coverEye === 'true' && same(now.coverHidden, [cover]), now);
    await click(page, '#v2-btn-undo');
    await sleep(700);
    now = await snap(page, macro);
    check(`${tag} : le bouton Annuler rouvre l'œil`, now.coverEye === 'false' && same(now.coverHidden, []), now);

    console.log(`\n[${tag}] La page du macro-modèle`);
    await clickHoverRow(page, '#btn-page-orientation', FORMAT('A5'));
    await sleep(600);
    now = await snap(page, macro);
    const a5 = now;
    check(`${tag} : un clic sur « A5 » change la page (modèle, feuille, bouton Page)`, now.format === 'A5' && now.sheet !== start.sheet && /A5/.test(now.label), now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Z rend l'A4 (modèle, feuille, bouton Page)`, now.format === 'A4' && now.sheet === start.sheet && /A4/.test(now.label) && !/A5/.test(now.label), now);
    await key(page, 'Control+y');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Y rend l'A5`, now.format === 'A5' && now.sheet === a5.sheet && /A5/.test(now.label), now);
    await key(page, 'Control+z');

    console.log(`\n[${tag}] L'ordre des gestes`);
    await clickEye(page, 0, macro.coverId);
    await clickHoverRow(page, '#btn-page-orientation', FORMAT('A5'));
    await sleep(600);
    await clickEye(page, 1, macro.otherId);
    now = await snap(page, macro);
    check(`${tag} : un œil, le format, un autre œil sont posés`, now.coverEye === 'true' && now.format === 'A5' && now.annexEye === 'true', now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : le 1er Ctrl + Z rouvre le second œil et laisse le format`, now.annexEye === 'false' && now.format === 'A5' && now.coverEye === 'true', now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : le 2e Ctrl + Z rend l'A4 et laisse le premier œil fermé`, now.format === 'A4' && now.coverEye === 'true' && now.annexEye === 'false', now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : le 3e Ctrl + Z rouvre le premier œil`, now.coverEye === 'false' && now.format === 'A4' && same(now.coverHidden, []), now);
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    now = await snap(page, macro);
    check(`${tag} : trois Ctrl + Y rendent les trois gestes`, now.coverEye === 'true' && now.format === 'A5' && now.annexEye === 'true' && same(now.annexHidden, [other]), now);
    for (let i = 0; i < 3; i++) await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : trois Ctrl + Z de plus ramènent le macro-modèle du départ`, now.coverEye === 'false' && now.annexEye === 'false' && now.format === 'A4' && now.sheet === start.sheet, now);

    console.log(`\n[${tag}] La fenêtre de composition`);
    // Un geste de la page avant la fenêtre : « Enregistrer » recharge le macro-modèle, son historique d'avant lui est rendu.
    await clickHoverRow(page, '#btn-page-orientation', FORMAT('A5'));
    await sleep(600);
    const before = await snap(page, macro);
    check(`${tag} : le format A5 est posé avant d'ouvrir la fenêtre`, before.format === 'A5', before);
    await click(page, '#btn-edit-macro');
    await sleep(600);
    check(`${tag} : « Modifier la composition » ouvre la fenêtre`, await page.evaluate(() => getComputedStyle(document.getElementById('macro-editor-modal')).display !== 'none'));
    // La composition a déjà une annexe : le bouton « Ajouter une annexe » est sous le pli de la fenêtre de 700x400, on y fait défiler le contenu comme la molette, puis on le clique.
    await page.evaluate(() => document.getElementById('macro-editor-add-slot').scrollIntoView({ block: 'center' }));
    await sleep(300);
    check(`${tag} : le bouton « Ajouter une annexe » est sous la souris`, await page.evaluate(() => { const b = document.getElementById('macro-editor-add-slot').getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!hit && (hit.id === 'macro-editor-add-slot' || hit.closest('#macro-editor-add-slot') !== null); }));
    await click(page, '#macro-editor-add-slot');
    await sleep(300);
    // Dans la fenêtre ouverte, Ctrl + Z reste au champ (ici le nom) et ne touche pas au macro-modèle derrière elle.
    await click(page, '#macro-editor-name');
    await page.keyboard.press('End');
    await page.keyboard.type(' (v2)');
    await page.keyboard.press('Control+z');
    await sleep(300);
    now = await snap(page, macro);
    check(`${tag} : dans la fenêtre, Ctrl + Z défait la frappe du champ`, await page.evaluate(() => document.getElementById('macro-editor-name').value === 'Contrat cadre'), await page.evaluate(() => document.getElementById('macro-editor-name').value));
    check(`${tag} : et le macro-modèle derrière n'a pas bougé`, now.annexCount === 2 && now.coverEye === 'false', now);
    await click(page, '#macro-editor-save');
    await sleep(1300);
    now = await snap(page, macro);
    const saved = now;
    check(`${tag} : « Enregistrer » ajoute une annexe à la composition de la ligne`, now.annexCount === 3 && now.sentence !== before.sentence, now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : Ctrl + Z rend la composition d'avant (ligne et résumé) et laisse l'A5`, now.annexCount === 2 && now.sentence === before.sentence && now.format === 'A5', now);
    await key(page, 'Control+z');
    now = await snap(page, macro);
    check(`${tag} : un second Ctrl + Z défait le format posé avant la fenêtre (l'historique a survécu à l'enregistrement)`, now.format === 'A4' && now.sheet === start.sheet && now.annexCount === 2, now);
    await key(page, 'Control+y');
    await key(page, 'Control+y');
    now = await snap(page, macro);
    check(`${tag} : deux Ctrl + Y rendent l'A5 puis la composition d'après`, now.format === 'A5' && now.annexCount === 3 && now.sentence === saved.sentence, now);

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
