#!/usr/bin/env node
// Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les COPIES de modèle - « Enregistrer sous… » et un modèle de la galerie -, à la vraie souris et au vrai clavier (page.mouse, page.keyboard ; Node/Playwright), dans le panneau
// de 700x400 d'Antoine, en français clair puis en anglais sombre - suite de sa demande du 22/10 (« Il doit prendre en compte 100% des actions faites dans le widget ») et de la carte « Ctrl + Z doit-il retirer la copie que tu viens de
// créer ? » (option « Oui, avec une question », go général du 02/11). Ce que dev-tests/scenarios-undo-library.js ne peut pas voir depuis la page : la vraie question « Retirer … ? » (sa taille dans le panneau, le focus sur « Annuler »,
// les vrais clics sur ses boutons), la vraie liste, la vraie galerie, le vrai menu « Enregistrer » au survol.
//   1) « Enregistrer sous… » (survol du bouton Enregistrer, clic sur la ligne, nom proposé accepté) : la copie naît et s'ouvre ; du texte tapé dedans se défait SANS question (UN Ctrl + Z), le Ctrl + Z suivant pose la question « Retirer … ? »
//      dans le panneau, le focus sur « Annuler » ; « Annuler » garde la copie (le coin d'état le dit, rien n'est écrit) ; Échap aussi ;
//   2) « Retirer » (vrai clic) : la copie quitte la table et la liste, l'écran rouvre le modèle copié, tel qu'il était ; UN Ctrl + Y rend la copie (même numéro de ligne) et la rouvre ;
//   3) un modèle de la galerie (« Utiliser ce modèle ») : même question, « Retirer » rouvre le modèle quitté, Ctrl + Y le rend et le rouvre ;
//   4) « Utiliser avec une nouvelle table de données » : la question ajoute que les tables créées avec le modèle restent, tient dans le panneau, et la table existe encore après « Retirer » ;
//   5) aucune erreur de page.
// Lancé par run-headless.mjs (groupe Node « undoCopiesMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-undo-copies-mouse.mjs
import { open, stopServer, sleep, click, clickHoverRow, pickTemplate } from './load-lib.mjs';

const PORT = Number(process.env.UNDO_COPIES_MOUSE_PORT || 9164);
const SPEC = { models: { count: 2, paragraphs: 2 } };
const TABLE = 'Publipostage_Modeles';

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name);
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
const realErrors = w => w.errors.filter(e => !/Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));

const t = (page, key, params) => page.evaluate(([k, p]) => I18n.t(k, p), [key, params || {}]);
const text = page => page.evaluate(() => EditorCore.getEditor().getText());
const statusText = page => page.evaluate(() => document.getElementById('status-msg').textContent);
// Tous les textes que le coin d'état montre à partir de cet appel : un enregistrement automatique reprend la main sur le message quelques instants après la fermeture de la question, la vérification ne doit donc pas dépendre de l'instant où on lit.
const watchStatus = page => page.evaluate(() => {
  const element = document.getElementById('status-msg');
  window.__statusSeen = [element.textContent];
  if (window.__statusObserver) window.__statusObserver.disconnect();
  window.__statusObserver = new MutationObserver(() => window.__statusSeen.push(element.textContent));
  window.__statusObserver.observe(element, { childList: true, characterData: true, subtree: true });
});
const statusSeen = page => page.evaluate(() => (window.__statusSeen || []).slice());
const forget = page => page.evaluate(() => { if (typeof ActionHistory !== 'undefined') ActionHistory.reset(); });
const reserved = page => page.evaluate(() => (typeof ActionHistory === 'undefined' ? -1 : ActionHistory.count()));
// Les lignes de la table des modèles telles que le faux Grist les garde : [{ id, nom }].
const rowsOf = page => page.evaluate(table => {
  const rows = window.__gristStub.state.rows[table];
  return rows.id.map((id, i) => ({ id, nom: rows.Nom[i] }));
}, TABLE);
const nameOn = page => page.evaluate(() => ({ id: Templates.getCurrentId(), name: document.getElementById('template-name').value }));
const inList = (page, name) => page.evaluate(n => Array.from(document.querySelectorAll('#template-select option')).some(o => o.textContent.replace(/ ★$/, '') === n), name);
const hasTable = (page, id) => page.evaluate(table => window.__gristStub.state.tables.indexOf(table) !== -1, id);
async function key(page, combo, wait = 900) {
  await page.keyboard.press(combo);
  await sleep(wait);
}
// La question posée (js/dialogs.js : #pp-dialog-modal) : ce qu'elle dit, où elle est, ses boutons, et celui qui a le focus.
const dialog = page => page.evaluate(() => {
  const modal = document.getElementById('pp-dialog-modal');
  if (!modal || getComputedStyle(modal).display === 'none') return { open: false };
  const inView = r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const box = modal.querySelector('.pp-dialog-box');
  const buttons = Array.from(modal.querySelectorAll('.pp-modal-actions button')).filter(b => !b.hidden).map(b => ({ text: b.textContent, inView: inView(b.getBoundingClientRect()) }));
  const active = document.activeElement;
  return {
    open: true, title: document.getElementById('pp-dialog-title').textContent, message: document.getElementById('pp-dialog-message').textContent,
    boxInView: !!box && inView(box.getBoundingClientRect()), buttons, focus: active && modal.contains(active) ? active.textContent : null,
  };
});
// Le vrai clic sur un bouton de la question, désigné par son texte.
async function clickDialogButton(page, label, wait = 1100) {
  const pos = await page.evaluate(text => {
    const button = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(b => !b.hidden && b.textContent === text);
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, label);
  if (!pos) throw new Error('bouton introuvable dans la question : ' + label);
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await sleep(60);
  await page.mouse.click(pos.x, pos.y);
  await sleep(wait);
}
// « Enregistrer sous… » : le survol du bouton Enregistrer, le clic sur la ligne, puis le nom proposé accepté au vrai clic.
async function saveAsCopy(page) {
  await clickHoverRow(page, '#btn-save', '#v2-btn-save-as');
  await page.waitForSelector('#pp-dialog-modal .var-modal-primary', { state: 'visible', timeout: 10000 });
  await sleep(250);
  const proposed = await page.evaluate(() => document.getElementById('pp-dialog-input').value);
  await click(page, '#pp-dialog-modal .var-modal-primary');
  await sleep(1300);
  return proposed;
}
// La galerie ouverte au vrai « + » puis la première carte (ou celle de ce nom) cliquée : rend le nom de l'aperçu.
async function openGalleryPreview(page, name) {
  await clickHoverRow(page, '#btn-new', '#v2-btn-new-from-template');
  await page.waitForSelector('#tpl-gallery-grid .tpl-gallery-card', { timeout: 8000 });
  await sleep(300);
  const pos = await page.evaluate(wanted => {
    const cards = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card'));
    const card = wanted ? cards.find(c => c.querySelector('.tpl-gallery-card-name').textContent === wanted) : cards[0];
    if (!card) return null;
    card.scrollIntoView({ block: 'nearest' });
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name || null);
  if (!pos) throw new Error('carte introuvable dans la galerie : ' + (name || 'première'));
  await page.mouse.move(pos.x - 20, pos.y);
  await page.mouse.move(pos.x, pos.y, { steps: 3 });
  await sleep(60);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(() => document.getElementById('tpl-preview-tiptap').children.length > 0 || !document.getElementById('tpl-preview-captures').hidden, null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
  return page.evaluate(() => document.getElementById('tpl-preview-name').textContent.trim());
}
const galleryShown = page => page.evaluate(() => ['template-preview-modal', 'template-gallery-modal'].some(id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }));

async function phase(lang, theme) {
  const tag = `${lang}/${theme}`;
  const w = await open({ spec: SPEC, port: PORT, theme, lang });
  const { page } = w;
  console.log(`\n=== Ctrl + Z et les copies de modèle, vraie souris et vrai clavier, 700x400, ${lang === 'fr' ? 'français clair' : 'anglais sombre'} ===`);
  try {
    // --- 1) Enregistrer sous… ---
    await pickTemplate(page, 'Modèle 0001');
    await forget(page);
    const originalId = (await nameOn(page)).id;
    const originalText = await text(page);
    const rowsBefore = await rowsOf(page);
    const proposed = await saveAsCopy(page);
    const copy = await nameOn(page);
    const rowsAfter = await rowsOf(page);
    check(`${tag} 1 : « Enregistrer sous… » propose « Modèle 0001 (2) », la copie naît (une ligne de plus) et s'ouvre`, proposed === 'Modèle 0001 (2)' && rowsAfter.length === rowsBefore.length + 1 && copy.name === proposed && copy.id !== originalId && await inList(page, proposed), { proposed, copy, rowsBefore: rowsBefore.length, rowsAfter: rowsAfter.length });
    check(`${tag} 1 : la copie est une action en réserve`, (await reserved(page)) === 1, await reserved(page));

    const copyText = await text(page);
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await sleep(200);
    await page.keyboard.type(' ZZ');
    await sleep(700);
    check(`${tag} 1 : du texte est tapé dans la copie`, / ZZ$/.test(await text(page)), await text(page));
    await key(page, 'Control+z');
    check(`${tag} 1 : UN Ctrl + Z défait la frappe SANS poser la question, la copie reste`, !(await text(page)).endsWith(' ZZ') && !(await dialog(page)).open && (await rowsOf(page)).length === rowsAfter.length, { text: await text(page), dialog: await dialog(page) });
    await key(page, 'Control+z', 700);
    const question = await dialog(page);
    const expectTitle = await t(page, 'history.removeCopyTitle', { name: proposed });
    const expectMessage = await t(page, 'history.removeCopyMessage');
    check(`${tag} 1 : le Ctrl + Z suivant pose la question « Retirer … ? » avec le nom de la copie`, question.open && question.title === expectTitle && question.message === expectMessage, { question, expectTitle, expectMessage });
    check(`${tag} 1 : la question tient dans le panneau 700x400, ses deux boutons sont atteignables, le focus est sur « Annuler »`, question.open && question.boxInView && question.buttons.length === 2 && question.buttons.every(b => b.inView) && question.focus === (await t(page, 'common.cancel')), question);
    check(`${tag} 1 : tant que la question est posée, la copie est toujours là`, (await rowsOf(page)).length === rowsAfter.length && (await nameOn(page)).id === copy.id, await rowsOf(page));

    // « Annuler » à la question : rien n'est retiré.
    await watchStatus(page);
    await clickDialogButton(page, await t(page, 'common.cancel'), 900);
    const keptMessage = await t(page, 'history.copyKept', { name: proposed });
    check(`${tag} 1 : « Annuler » garde la copie ouverte et rien n'est écrit`, !(await dialog(page)).open && (await rowsOf(page)).length === rowsAfter.length && (await nameOn(page)).id === copy.id && (await text(page)) === copyText, { name: await nameOn(page), rows: await rowsOf(page) });
    check(`${tag} 1 : le coin d'état dit que la copie est gardée`, (await statusSeen(page)).includes(keptMessage), await statusSeen(page));
    // Le Ctrl + Y qui suit rend le repère de la copie à l'historique : rien ne change à l'écran.
    await key(page, 'Control+y');
    check(`${tag} 1 : Ctrl + Y après « Annuler » ne change rien`, (await rowsOf(page)).length === rowsAfter.length && (await nameOn(page)).id === copy.id && !(await dialog(page)).open, await rowsOf(page));

    // --- 2) Échap, puis « Retirer » ---
    // Un geste neuf, deux Ctrl + Z : la frappe d'abord, la copie ensuite - la question est posée de nouveau.
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await sleep(200);
    await page.keyboard.type(' YY');
    await sleep(700);
    await key(page, 'Control+z');
    await key(page, 'Control+z', 700);
    let again = await dialog(page);
    check(`${tag} 2 : après un geste neuf, la question est posée de nouveau (la frappe d'abord, la copie ensuite)`, again.open && again.title === expectTitle, again);
    await watchStatus(page);
    await page.keyboard.press('Escape');
    await sleep(900);
    check(`${tag} 2 : Échap répond comme « Annuler » : la copie est gardée, et le coin d'état le dit`, !(await dialog(page)).open && (await rowsOf(page)).length === rowsAfter.length && (await nameOn(page)).id === copy.id && (await statusSeen(page)).includes(keptMessage), { dialog: await dialog(page), name: await nameOn(page), seen: await statusSeen(page) });

    // Le Ctrl + Y rend le repère, le Ctrl + Z suivant repose la question : cette fois, « Retirer ».
    await key(page, 'Control+y');
    await key(page, 'Control+z', 700);
    again = await dialog(page);
    check(`${tag} 2 : Ctrl + Y puis Ctrl + Z reposent la question`, again.open && again.title === expectTitle, again);
    await watchStatus(page);
    await clickDialogButton(page, await t(page, 'history.removeCopyConfirm'));
    const afterRemove = await rowsOf(page);
    const afterName = await nameOn(page);
    check(`${tag} 2 : « Retirer » ôte la copie de la table et de la liste, l'écran rouvre le modèle copié tel qu'il était`, afterRemove.length === rowsBefore.length && !afterRemove.some(r => r.id === copy.id) && !(await inList(page, proposed)) && afterName.id === originalId && afterName.name === 'Modèle 0001' && (await text(page)) === originalText, { afterRemove, afterName, text: await text(page), originalText });
    check(`${tag} 2 : le coin d'état dit que la copie est retirée`, (await statusSeen(page)).includes(await t(page, 'status.templateRemoved', { name: proposed })), await statusSeen(page));
    await watchStatus(page);
    await key(page, 'Control+y');
    const afterRedo = await rowsOf(page);
    const redoName = await nameOn(page);
    check(`${tag} 2 : UN Ctrl + Y rend la copie sous le même numéro et la rouvre`, afterRedo.length === rowsAfter.length && afterRedo.some(r => r.id === copy.id && r.nom === proposed) && redoName.id === copy.id && redoName.name === proposed && await inList(page, proposed), { afterRedo, redoName });
    check(`${tag} 2 : le coin d'état dit que la copie est rétablie`, (await statusSeen(page)).includes(await t(page, 'status.templateRestored', { name: proposed })), await statusSeen(page));
    // Les boutons de la barre font comme les touches.
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await sleep(150);
    await click(page, '#v2-btn-undo');
    await sleep(700);
    const viaButton = await dialog(page);
    check(`${tag} 2 : le bouton Annuler de la barre pose la même question`, viaButton.open && viaButton.title === expectTitle, viaButton);
    await clickDialogButton(page, await t(page, 'history.removeCopyConfirm'));
    check(`${tag} 2 : « Retirer » après le bouton : la copie est partie, le modèle d'origine est rouvert`, (await rowsOf(page)).length === rowsBefore.length && (await nameOn(page)).id === originalId, await rowsOf(page));
    await click(page, '#v2-btn-redo');
    await sleep(1000);
    check(`${tag} 2 : le bouton Rétablir de la barre rend la copie`, (await rowsOf(page)).length === rowsAfter.length && (await nameOn(page)).id === copy.id, await rowsOf(page));

    // --- 3) un modèle de la galerie ---
    await pickTemplate(page, 'Modèle 0001');
    await forget(page);
    const rows3 = await rowsOf(page);
    const galleryName = await openGalleryPreview(page);
    await click(page, '#tpl-preview-use-empty');
    await sleep(1800);
    const made = await nameOn(page);
    const rows3After = await rowsOf(page);
    const madeName = made.name;
    check(`${tag} 3 : « Utiliser ce modèle » crée le modèle de la galerie (une ligne de plus), le ferme et l'ouvre`, !(await galleryShown(page)) && rows3After.length === rows3.length + 1 && made.id !== originalId && madeName.startsWith(galleryName.slice(0, 8)) && (await reserved(page)) === 1, { galleryName, made, rows3: rows3.length, rows3After: rows3After.length, reserved: await reserved(page) });
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await sleep(200);
    await key(page, 'Control+z', 700);
    const q3 = await dialog(page);
    const expect3 = await t(page, 'history.removeCopyTitle', { name: madeName });
    check(`${tag} 3 : Ctrl + Z pose la question avec le nom du modèle de la galerie, elle tient dans le panneau`, q3.open && q3.title === expect3 && q3.message === expectMessage && q3.boxInView && q3.buttons.every(b => b.inView) && q3.focus === (await t(page, 'common.cancel')), q3);
    await clickDialogButton(page, await t(page, 'history.removeCopyConfirm'));
    const after3 = await nameOn(page);
    check(`${tag} 3 : « Retirer » ôte le modèle de la galerie et rouvre celui qu'on avait quitté`, (await rowsOf(page)).length === rows3.length && after3.id === originalId && (await text(page)) === originalText && !(await inList(page, madeName)), { after3, rows: (await rowsOf(page)).length });
    await key(page, 'Control+y');
    const redo3 = await nameOn(page);
    check(`${tag} 3 : Ctrl + Y rend le modèle de la galerie sous le même numéro et l'ouvre`, (await rowsOf(page)).length === rows3.length + 1 && redo3.id === made.id && redo3.name === madeName, { redo3, made });

    // --- 4) avec une nouvelle table de données ---
    await pickTemplate(page, 'Modèle 0001');
    await forget(page);
    const tableName = 'Table_copies_souris';
    // Un modèle de la galerie qui demande une table : celui des modèles de développement (templates-gallery-dev/), ajouté au manifeste le temps de l'essai.
    await page.evaluate(async () => {
      const dev = await (await fetch('templates-gallery-dev/catalogue.json', { cache: 'no-store' })).json();
      const list = await TemplateGallery.loadManifest();
      const entry = Object.assign({}, dev.find(e => e.schema && !e.pack), { __base: 'templates-gallery-dev/' });
      list.unshift(entry);
      window.__schemaEntryName = entry.name;
    });
    const entryName = await page.evaluate(() => window.__schemaEntryName);
    const rows4 = await rowsOf(page);
    await openGalleryPreview(page, entryName);
    await click(page, '#tpl-preview-use-data');
    await page.waitForSelector('#pp-dialog-input', { state: 'visible', timeout: 10000 });
    await sleep(300);
    await page.fill('#pp-dialog-input', tableName);
    await click(page, '#pp-dialog-modal .var-modal-primary');
    await sleep(2200);
    const made4 = await nameOn(page);
    check(`${tag} 4 : la table et le modèle sont créés, le modèle est ouvert`, await hasTable(page, tableName) && !(await galleryShown(page)) && (await rowsOf(page)).length === rows4.length + 1 && made4.id !== originalId && (await reserved(page)) === 1, { made4, tables: await hasTable(page, tableName), reserved: await reserved(page) });
    await page.evaluate(() => EditorCore.getEditor().commands.focus('end'));
    await sleep(200);
    await key(page, 'Control+z', 700);
    const q4 = await dialog(page);
    const expectTables = await t(page, 'history.removeCopyTables');
    check(`${tag} 4 : la question dit que les tables créées avec le modèle restent, et tient dans le panneau`, q4.open && q4.message === expectTables && q4.boxInView && q4.buttons.every(b => b.inView) && q4.focus === (await t(page, 'common.cancel')), q4);
    await clickDialogButton(page, await t(page, 'history.removeCopyConfirm'));
    check(`${tag} 4 : « Retirer » ôte le modèle, rouvre le précédent, et la table du document existe toujours`, (await rowsOf(page)).length === rows4.length && (await nameOn(page)).id === originalId && await hasTable(page, tableName), { rows: (await rowsOf(page)).length, name: await nameOn(page), table: await hasTable(page, tableName) });
    await key(page, 'Control+y');
    check(`${tag} 4 : Ctrl + Y rend le modèle, la table n'a pas bougé`, (await rowsOf(page)).length === rows4.length + 1 && (await nameOn(page)).id === made4.id && await hasTable(page, tableName), { rows: (await rowsOf(page)).length, name: await nameOn(page) });

    check(`${tag} 5 : aucune erreur de page`, realErrors(w).length === 0, realErrors(w));
  } catch (error) {
    // Un bouton de la question introuvable (la question n'a pas été posée) : le parcours s'arrête, la vérification le dit au lieu de faire tomber tout le script.
    check(`${tag} : le parcours est allé jusqu'au bout`, false, String(error && error.message));
  } finally {
    await w.close();
  }
}

try {
  await phase('fr', 'light');
  await phase('en', 'dark');
} finally {
  await stopServer();
}
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
