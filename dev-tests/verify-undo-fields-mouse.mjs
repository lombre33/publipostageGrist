#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les champs hors du texte - l'Objet, À, Cc, Cci de l'email et le nom du fichier PDF -, à la VRAIE souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright),
// dans le panneau de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget ». Ce que dev-tests/scenarios-undo-fields.js ne
// peut pas voir depuis la page : où est le focus après un VRAI clic dans le corps ou sur un bouton, et ce que la touche fait dans le champ.
//   1) l'Objet écrit au clavier, un clic dans le corps : Ctrl + Z rend l'Objet à vide et laisse le corps, Ctrl + Y le rend ; le même Ctrl + Z, le focus sur le coin d'état (hors de l'éditeur) ;
//   2) les boutons de la barre font de même ; un clic sur le bouton Annuler, le focus encore dans le champ, défait le champ ;
//   3) l'ordre des gestes : du texte dans le corps, l'Objet, le destinataire, du texte dans le corps ; Ctrl + Z / Ctrl + Y dans l'ordre ;
//   4) le passage d'un champ à l'autre à la souris : deux séances, deux pas ;
//   5) le nom du fichier PDF (le crayon, Entrée qui valide) et la Cci (le bouton « + Cci ») se replient et se déplient avec leur valeur ;
//   6) dans le champ, Ctrl + Z défait la frappe du champ, pas le modèle ;
//   7) l'enregistrement automatique écrit la valeur défaite ;
//   8) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoFieldsMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-fields-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_FIELDS_MOUSE_PORT || 9146);
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };
const SUBJECT = '#v2-email-subject', TO = '#v2-email-to', CC = '#v2-email-cc', CCI = '#v2-email-cci', FILE = '#pdf-filename-template';
const BODY = '.tiptap p';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Les champs tels que le modèle les garde, ce que la feuille montre d'eux (repliés ou non), le texte du corps, le focus.
const snap = page => page.evaluate(() => {
  const el = id => document.getElementById(id);
  const active = document.activeElement;
  return {
    subject: el('v2-email-subject').value, to: el('v2-email-to').value, cc: el('v2-email-cc').value, cci: el('v2-email-cci').value, file: el('pdf-filename-template').value,
    cciHidden: el('v2-email-cci').hidden, fileHidden: el('pdf-filename-template').hidden, cciToggleOn: el('v2-btn-toggle-cci').classList.contains('is-active'),
    body: EditorCore.getEditor().getText(),
    focus: active ? (active.closest && active.closest('.pp-field-editor') ? active.closest('.pp-field-editor').id : (active.closest && active.closest('.ProseMirror') ? 'editor' : active.id || active.tagName)) : null,
    undoLocked: el('v2-btn-undo').classList.contains('v2-hf-locked'),
  };
});
// Du texte tapé au vrai clavier dans un champ : un clic le met au focus, le curseur à la fin.
async function typeInField(page, sel, text) {
  await click(page, sel);
  await sleep(150);
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await sleep(250);
}
// Un clic dans le corps : le focus quitte le champ (la séance du champ se ferme).
async function clickBody(page) {
  await click(page, BODY);
  await sleep(300);
}
async function typeInBody(page, text) {
  await click(page, BODY);
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
  await sleep(300);
}
// Une touche au vrai clavier, puis le temps que l'historique rende le modèle (valeurs, brouillon prévenu).
async function key(page, combo) {
  await page.keyboard.press(combo);
  await sleep(450);
}
// Le coin d'état : un clic y met le focus hors de l'éditeur (le corps de la page), le cas de la touche « partout ».
async function focusOutsideEditor(page) {
  await click(page, '#status-msg');
  await sleep(250);
}

async function pass(lang, theme, tag) {
  const w = await open({ spec: SPEC, port: PORT, settleMs: 1500, theme, lang });
  try {
    const { page } = w;
    await clickHoverRow(page, '#btn-new', '#v2-btn-new-email');
    await sleep(900);
    // Le nom se saisit derrière le crayon (le champ du nom est replié), Entrée le valide ; la souris quitte d'abord le menu « Nouveau », qui recouvre le haut du panneau.
    await page.mouse.move(350, 380);
    await sleep(700);
    await click(page, '#btn-rename-template');
    await sleep(250);
    await page.keyboard.type('Courriel de test');
    await page.keyboard.press('Enter');
    await sleep(300);
    await click(page, '#btn-save');
    await sleep(1200);
    const modelId = await page.evaluate(() => Templates.getCurrentId());
    await typeInBody(page, 'Corps');
    let now = await snap(page);
    const start = now;
    console.log(`\n[${tag}] L'Objet`);
    check(`${tag} : un nouvel email s'ouvre avec ses champs vides et un corps écrit`, now.subject === '' && now.to === '' && now.cc === '' && now.file === '' && /Corps/.test(now.body), now);
    check(`${tag} : Annuler n'est pas grisé`, !now.undoLocked, now);

    await typeInField(page, SUBJECT, 'Bonjour à tous');
    now = await snap(page);
    check(`${tag} : l'Objet est écrit au clavier, le champ a le focus`, now.subject === 'Bonjour à tous' && now.focus === 'v2-email-subject', now);
    await clickBody(page);
    now = await snap(page);
    check(`${tag} : un clic dans le corps quitte le champ (le focus est dans l'éditeur)`, now.focus === 'editor', now.focus);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z, le focus dans le corps, rend l'Objet à vide et laisse le corps`, now.subject === '' && /Corps/.test(now.body), now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y rend l'Objet`, now.subject === 'Bonjour à tous' && /Corps/.test(now.body), now);
    await focusOutsideEditor(page);
    now = await snap(page);
    check(`${tag} : un clic sur le coin d'état met le focus hors de l'éditeur`, now.focus !== 'editor' && now.focus !== 'v2-email-subject', now.focus);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z, le focus hors de l'éditeur, rend l'Objet à vide`, now.subject === '' && /Corps/.test(now.body), now);
    await key(page, 'Control+Shift+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Maj + Z le rend`, now.subject === 'Bonjour à tous', now);

    console.log(`\n[${tag}] Les boutons de la barre`);
    await click(page, '#v2-btn-undo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : le bouton Annuler rend l'Objet à vide`, now.subject === '', now);
    await click(page, '#v2-btn-redo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : le bouton Rétablir le rend`, now.subject === 'Bonjour à tous', now);
    // Le champ a le focus quand on clique sur le bouton Annuler : la séance se ferme au départ du champ, puis le bouton la défait.
    await typeInField(page, SUBJECT, ' !');
    await click(page, '#v2-btn-undo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : un clic sur Annuler, le champ au focus, défait la séance du champ (jamais celle d'avant en plus)`, now.subject === 'Bonjour à tous', now);
    await click(page, '#v2-btn-undo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : un second clic défait l'Objet d'avant`, now.subject === '', now);
    await click(page, '#v2-btn-redo');
    await click(page, '#v2-btn-redo');
    await sleep(500);
    now = await snap(page);
    check(`${tag} : deux clics sur Rétablir rendent l'Objet avec son ajout`, now.subject === 'Bonjour à tous !', now);

    console.log(`\n[${tag}] L'ordre des gestes, corps et champs mêlés`);
    await key(page, 'Control+z');
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : on repart d'un email aux champs vides`, now.subject === '' && now.to === '' && /Corps/.test(now.body), now);
    await typeInBody(page, ' Alpha');
    await typeInField(page, SUBJECT, 'Objet deux');
    await typeInField(page, TO, 'marie@exemple.fr');
    await typeInBody(page, ' Beta');
    now = await snap(page);
    check(`${tag} : un texte, l'Objet, le destinataire, un texte sont posés`, /Alpha Beta/.test(now.body) && now.subject === 'Objet deux' && now.to === 'marie@exemple.fr', now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 1er Ctrl + Z défait le second texte et laisse les champs`, !/Beta/.test(now.body) && /Alpha/.test(now.body) && now.subject === 'Objet deux' && now.to === 'marie@exemple.fr', now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 2e Ctrl + Z défait le destinataire`, now.to === '' && now.subject === 'Objet deux' && /Alpha/.test(now.body), now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 3e Ctrl + Z défait l'Objet`, now.subject === '' && /Alpha/.test(now.body), now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 4e Ctrl + Z défait le premier texte`, !/Alpha/.test(now.body) && /Corps/.test(now.body), now);
    for (let i = 0; i < 4; i++) await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : quatre Ctrl + Y rendent les quatre gestes`, /Alpha Beta/.test(now.body) && now.subject === 'Objet deux' && now.to === 'marie@exemple.fr', now);

    console.log(`\n[${tag}] D'un champ à l'autre`);
    await typeInField(page, CC, 'copie@exemple.fr');
    await typeInField(page, SUBJECT, ' (suite)');
    now = await snap(page);
    check(`${tag} : le passage de Cc à l'Objet à la souris est posé`, now.cc === 'copie@exemple.fr' && now.subject === 'Objet deux (suite)', now);
    await clickBody(page);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 1er Ctrl + Z défait la suite de l'Objet et laisse Cc`, now.subject === 'Objet deux' && now.cc === 'copie@exemple.fr', now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : le 2e Ctrl + Z défait Cc`, now.cc === '' && now.subject === 'Objet deux', now);

    console.log(`\n[${tag}] Le nom du PDF et la Cci`);
    await click(page, '#btn-toggle-pdf-filename');
    await sleep(250);
    await page.keyboard.type('Facture');
    await page.keyboard.press('Enter');
    await sleep(350);
    now = await snap(page);
    check(`${tag} : le crayon déplie le champ, Entrée valide le nom (le champ reste, il a une valeur)`, now.file === 'Facture' && !now.fileHidden, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z rend le nom à vide et replie le champ`, now.file === '' && now.fileHidden, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y déplie le champ avec son nom`, now.file === 'Facture' && !now.fileHidden, now);
    await click(page, '#v2-btn-toggle-cci');
    await sleep(250);
    await page.keyboard.type('cache@exemple.fr');
    await clickBody(page);
    now = await snap(page);
    check(`${tag} : le bouton « + Cci » déplie le champ, la Cci est écrite`, now.cci === 'cache@exemple.fr' && !now.cciHidden && now.cciToggleOn, now);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z rend la Cci à vide, replie le champ et éteint le bouton`, now.cci === '' && now.cciHidden && !now.cciToggleOn, now);
    await key(page, 'Control+y');
    now = await snap(page);
    check(`${tag} : Ctrl + Y déplie la Cci avec son adresse`, now.cci === 'cache@exemple.fr' && !now.cciHidden && now.cciToggleOn, now);

    console.log(`\n[${tag}] Dans le champ`);
    await typeInField(page, TO, ' ; autre@exemple.fr');
    now = await snap(page);
    check(`${tag} : l'adresse ajoutée dans À`, now.to === 'marie@exemple.fr ; autre@exemple.fr', now);
    await page.keyboard.press('Control+z');
    await sleep(300);
    now = await snap(page);
    check(`${tag} : Ctrl + Z dans le champ défait la frappe du champ et rien d'autre`, now.to === 'marie@exemple.fr' && now.subject === 'Objet deux' && now.file === 'Facture' && now.cci === 'cache@exemple.fr' && /Alpha Beta/.test(now.body) && now.focus === 'v2-email-to', now);
    await clickBody(page);
    await key(page, 'Control+z');
    now = await snap(page);
    check(`${tag} : Ctrl + Z hors du champ défait le geste d'avant (la Cci), pas la frappe défaite`, now.cci === '' && now.to === 'marie@exemple.fr', now);
    await key(page, 'Control+y');

    console.log(`\n[${tag}] L'enregistrement automatique`);
    await sleep(3600);
    let saved = await page.evaluate(id => { const r = window.__gristStub.getRow('Publipostage_Modeles', id); return { objet: r.Objet, pdf: r.NomFichierPDF, cci: r.Cci }; }, modelId);
    check(`${tag} : le modèle enregistré porte l'Objet, le nom du PDF et la Cci`, saved.objet === 'Objet deux' && saved.pdf === 'Facture' && saved.cci === 'cache@exemple.fr', saved);
    await key(page, 'Control+z');
    await sleep(3600);
    saved = await page.evaluate(id => { const r = window.__gristStub.getRow('Publipostage_Modeles', id); return { objet: r.Objet, pdf: r.NomFichierPDF, cci: r.Cci }; }, modelId);
    check(`${tag} : après Ctrl + Z, l'enregistrement automatique écrit la Cci DÉFAITE`, saved.cci === '' && saved.objet === 'Objet deux', saved);

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
