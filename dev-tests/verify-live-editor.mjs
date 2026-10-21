#!/usr/bin/env node
// L'écriture en direct dans le texte d'un modèle (extension « édition » de Grist Factory Suite : js/live-entry.js, extensions/edition/), dans un vrai navigateur, avec des pages du widget qui
// partagent UNE table du direct (dev-tests/live-test-kit.mjs : un faux Grist par page, la table Publipostage_Direct commune côté Node, un GFS simulé qui donne le fichier assemblé
// `edition-live` sous la forme de la consigne 012 de GFS : <script type="module">, empreinte, CORS). Trois personnes : Alice (A) et Bob (B) écrivent, Carole (C) ne rejoint pas.
//   1) démarrer seul (rien à demander), rejoindre (la question, ou refuser), la barre des personnes, la ligne du menu ;
//   2) deux personnes tapent : même texte des deux côtés, le curseur de l'autre est dessiné ;
//   3) Annuler et Rétablir par personne : chacun ne défait que ses frappes, au clavier comme par le bouton ;
//   4) ce que le direct ferme : le suivi des modifications, l'en-tête et le pied, les tableaux liés, la restauration d'une version, la Recherche - grisés avec leur raison, jamais retirés ;
//   5) l'enregistrement : UNE personne enregistre le modèle pour tout le monde, l'autre n'écrit qu'un réglage qui lui est propre, la date de l'une est adoptée par l'autre, la personne qui
//      enregistre passe à l'autre quand sa page se cache, une personne hors du direct qui enregistre est un conflit (le bandeau), « Recharger » sort du direct ;
//   6) partir : changer de modèle, la barre, la dernière personne qui part vide la table ;
//   7) les marques d'une puce (gras) voyagent, le texte qui ressemble à une adresse n'est pas lié par personne ;
//   8) les 25 modèles de la galerie sortent identiques de l'aller-retour par Yjs ;
//   9) gardes : chaque nœud en ligne du schéma porte l'attribut des marques, la palette des curseurs et le nom écrit dessus se lisent, ni erreur de page, ni message de la console, ni boîte native.
// Lancé par run-headless.mjs (groupe Node "liveEditor", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-live-editor.mjs (le fichier assemblé : bash dev-tests/offline-deps.sh)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startKit, ROOT, liveFileExists, liveDebug, editorText, editorHtml, until, dialogShown, dialogGone, dialogInfo, pressDialogButton, startLive, stopLive, converge, typeAt } from './live-test-kit.mjs';

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

// Les modèles de la galerie (les mêmes fichiers que celle du widget).
function readGallery() {
  const list = [];
  for (const base of ['templates-gallery', 'templates-gallery-dev']) {
    const manifestPath = join(ROOT, base, 'catalogue.json');
    if (!existsSync(manifestPath)) continue;
    for (const entry of JSON.parse(readFileSync(manifestPath, 'utf8'))) {
      const file = entry.html && join(ROOT, base, entry.html);
      if (file && existsSync(file)) list.push({ nom: entry.name || entry.id, contenu: readFileSync(file, 'utf8') });
    }
  }
  return list;
}
const gallery = readGallery();

const CHIP = '<span class="var-badge" data-table="PpDepart" data-column="Nom" data-key="Nom">#Nom</span>';
const templates = [
  { id: 1, nom: 'Rapport', contenu: '<p>Bonjour</p><p>Seconde ligne</p>', def: true, type: 'document' },
  { id: 2, nom: 'Note', contenu: '<p>Une note</p>', def: false, type: 'document' },
  { id: 3, nom: 'Adresse', contenu: '<p>Voir exemple.fr/verifier/ pour la suite.</p>', def: false, type: 'document' },
  { id: 4, nom: 'Courriel', contenu: '<p>Salut</p>', def: false, type: 'email' },
  { id: 5, nom: 'Puce', contenu: `<p>Cher ${CHIP}, bonjour.</p>`, def: false, type: 'document' },
  { id: 6, nom: 'Ensemble', contenu: '{"slots":[]}', def: false, type: 'macro' },
];

const kit = await startKit({ port: Number(process.env.LIVE_EDITOR_PORT || 8941) });
const table = kit.newTable();
const A = await kit.openPage({ table, templates, identity: { name: 'Alice', email: 'alice@example.com' } });
const B = await kit.openPage({ table, templates, identity: { name: 'Bob', email: 'bob@example.com' } });
const C = await kit.openPage({ table, templates, identity: { name: 'Carole', email: 'carole@example.com' } });
const named = { A: A.page, B: B.page, C: C.page };
const consoleProblems = [];
for (const [name, page] of Object.entries(named)) {
  page.on('console', (message) => { if (/^(error|warning)$/.test(message.type())) consoleProblems.push(`${name} ${message.type()} : ${message.text().slice(0, 240)}`); });
}

// ---- Les gestes -------------------------------------------------------------------------------------------------------------------------------

const flags = page => page.evaluate(() => ({
  live: LiveEntry.state(), scribe: LiveEntry.isScribe(), unsaved: LiveEntry.hasUnsavedEdits(),
  banner: document.getElementById('autosave-conflict-banner').style.display !== 'none', status: document.getElementById('status-msg').textContent,
}));
const model = (page, id = 1) => page.evaluate((wanted) => {
  const m = window.__gristStub.state.rows.Publipostage_Modeles; const at = m.id.indexOf(wanted);
  return at < 0 ? null : { contenu: m.Contenu[at], dateModif: m.DateModif[at], nom: m.Nom[at] };
}, id);
async function openTemplate(page, id) {
  await page.evaluate((wanted) => { const select = document.getElementById('template-select'); select.value = String(wanted); select.dispatchEvent(new Event('change')); }, id);
  // Des frappes qui attendent d'être enregistrées font poser la question « Enregistrer / Abandonner / Annuler » (js/main.js:askBeforeLeaving) : ce sont celles d'un essai, on abandonne.
  if (await page.waitForFunction(dialogShown, null, { timeout: 1500 }).then(() => true, () => false)) await pressDialogButton(page, 'Ne pas enregistrer');
  await until(page, wanted => Templates.getCurrentId() != null && String(Templates.getCurrentId()) === String(wanted), id);
  await page.waitForTimeout(400);
}
const hide = (page, hidden) => page.evaluate((flag) => {
  if (flag) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); else delete document.visibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const barOf = page => page.evaluate(() => {
  const bar = document.getElementById('live-bar');
  if (!bar) return null;
  return { state: bar.dataset.state, text: bar.querySelector('.live-bar-text').textContent, chips: Array.from(bar.querySelectorAll('.live-chip-name')).map(c => c.textContent), after: bar.previousElementSibling && bar.previousElementSibling.id };
});
const rowKinds = () => table.rows.map(row => row.Kind).sort().join('');

// ---- 1) Démarrer, rejoindre, la barre ---------------------------------------------------------------------------------------------------------

console.log('\n== 1) Démarrer, rejoindre, la barre ==');
const before = await A.page.evaluate(() => ({ row: document.getElementById('v2-btn-live').getAttribute('aria-disabled'), label: document.getElementById('v2-btn-live-label').textContent, bar: !!document.getElementById('live-bar'), on: document.body.classList.contains('pp-live-on') }));
check('avant : la ligne « Écriture en direct » est utilisable, pas de barre, rien d\'allumé', before.row === 'false' && before.label === 'Écriture en direct' && !before.bar && !before.on, before);
const first = await startLive(A.page);
check('Alice démarre seule : le direct est allumé sans aucune question', first.started === true && (await flags(A.page)).live === 'live' && !(await A.page.evaluate(dialogShown)), await flags(A.page));
const barA1 = await barOf(A.page);
check('la barre des personnes est sous la barre d\'outils, « personne d\'autre pour l\'instant », une seule pastille (« Vous »)', !!barA1 && barA1.state === 'alone' && /personne d.autre/.test(barA1.text) && barA1.chips.length === 1 && barA1.chips[0] === 'Vous' && barA1.after === 'linked-return-bar', barA1);
const rowA1 = await A.page.evaluate(() => ({ active: document.getElementById('v2-btn-live').classList.contains('is-active'), pressed: document.getElementById('v2-btn-live').getAttribute('aria-pressed'), label: document.getElementById('v2-btn-live-label').textContent, body: document.body.classList.contains('pp-live-on'), collab: document.getElementById('v2-btn-collab').classList.contains('is-active') }));
check('la ligne du menu s\'enfonce et se lit « Arrêter l\'écriture en direct », le bouton « Édition collaborative » s\'allume', rowA1.active && rowA1.pressed === 'true' && rowA1.label === 'Arrêter l’écriture en direct' && rowA1.body && rowA1.collab, rowA1);
check('la table du direct est créée : un instantané, une présence et le repère d\'enregistrement (le modèle ouvert est enregistré)', ['dps'].includes(rowKinds()), rowKinds());
// Le vrai listTables() rend TOUTES les tables du document, la table du direct comprise (grist-core, WidgetFrame.ts) : le banc la liste de même dès qu'elle existe. Sans son entrée dans INTERNAL_TABLES
// (js/grist-api.js), elle serait offerte comme une table de la personne (sélecteurs de table, #Variable Publipostage_Direct.Doc…).
const offered = await A.page.evaluate(async () => {
  await GristAPI.refreshSchema();
  return { tables: GristAPI.getTables().slice(), variables: GristAPI.getAllVariables().filter(v => v.table === 'Publipostage_Direct').map(v => v.key) };
});
check('la table du direct (Publipostage_Direct), que Grist liste comme toute table du document, n\'est jamais offerte comme table de la personne : ni parmi les tables des sélecteurs, ni en #Variable', !offered.tables.includes('Publipostage_Direct') && offered.variables.length === 0, offered);
check('le texte de l\'éditeur est resté celui du modèle et rien n\'est « à enregistrer »', (await editorText(A.page)) === 'BonjourSeconde ligne' && !(await flags(A.page)).unsaved);

const refused = await startLive(C.page, { ask: true, answer: 'Annuler' });
check('Carole est interrogée avant de rejoindre (le texte affiché serait remplacé) et refuse : rien ne change pour elle', refused.started === false && !!refused.asked && /Rejoindre l.écriture en direct/.test(refused.asked.title) && /déjà ouvert/.test(refused.asked.text) && (await flags(C.page)).live === 'off' && !(await barOf(C.page)), refused);
check('son refus n\'écrit rien dans la table (ni présence, ni texte)', rowKinds() === 'dps', rowKinds());

const joined = await startLive(B.page, { ask: true, answer: 'Rejoindre' });
check('Bob rejoint après la question', joined.started === true && (await flags(B.page)).live === 'live' && /Rejoindre/.test(joined.asked.buttons.join(' ')), joined);
await until(A.page, () => document.querySelectorAll('#live-bar .live-chip').length === 2);
await until(B.page, () => document.querySelectorAll('#live-bar .live-chip').length === 2);
const barA2 = await barOf(A.page), barB2 = await barOf(B.page);
check('la barre dit « 1 autre personne » des deux côtés, avec le nom de l\'autre', barA2.state === 'together' && /1 autre personne/.test(barA2.text) && barA2.chips.includes('Bob') && barB2.state === 'together' && barB2.chips.includes('Alice'), { barA2, barB2 });
check('le texte de Bob est celui du groupe', (await converge([A.page, B.page])) !== null);
const youChip = await B.page.evaluate(() => { const chip = document.querySelector('#live-bar .live-chip'); return { text: chip.textContent, aria: chip.getAttribute('aria-label') }; });
check('la première pastille est « Vous », lue « Vous : Bob » par un lecteur d\'écran', youChip.text === 'Vous' && youChip.aria === 'Vous : Bob', youChip);

// ---- 2) Taper à deux ---------------------------------------------------------------------------------------------------------------------------

console.log('\n== 2) Taper à deux, les curseurs ==');
await typeAt(A.page, 'end', ' Alice-1');
const afterA = await converge([A.page, B.page]);
check('ce qu\'Alice tape arrive chez Bob : même HTML des deux côtés', afterA !== null && (await editorText(B.page)).includes('Alice-1'), afterA);
await typeAt(B.page, 'start', 'Bob-1 ');
const afterB = await converge([A.page, B.page]);
check('ce que Bob tape arrive chez Alice, au début, sans écraser l\'autre frappe', afterB !== null && (await editorText(A.page)).startsWith('Bob-1 ') && (await editorText(A.page)).includes('Alice-1'), afterB);
await until(A.page, () => !!document.querySelector('.ProseMirror .pp-live-caret'));
const caret = await A.page.evaluate(() => {
  const el = document.querySelector('.ProseMirror .pp-live-caret'); const label = el.querySelector('.pp-live-caret-label');
  const style = getComputedStyle(el);
  return { name: label.textContent, color: el.style.getPropertyValue('--pp-live-color'), border: style.borderLeftWidth, labelBg: getComputedStyle(label).backgroundColor };
});
check('Alice voit le curseur de Bob : un trait de sa couleur et son nom au-dessus', caret.name === 'Bob' && /^#[0-9a-f]{6}$/i.test(caret.color) && parseFloat(caret.border) > 0.5 && caret.labelBg !== 'rgba(0, 0, 0, 0)', caret);
check('le curseur d\'Alice n\'est pas dessiné chez Alice', !(await A.page.evaluate(() => Array.from(document.querySelectorAll('.pp-live-caret-label')).some(l => l.textContent === 'Alice'))));
const timing = await liveDebug(A.page);
check('le moteur a lu la table et reçu les frappes de l\'autre (sa synthèse le dit)', timing.summary.reads > 0 && timing.summary.n > 0 && timing.peers.length === 1 && timing.peers[0].name === 'Bob', timing.summary);

// ---- 3) Annuler et Rétablir par personne -------------------------------------------------------------------------------------------------------

console.log('\n== 3) Annuler et Rétablir, chacun les siens ==');
await typeAt(A.page, 'end', ' AA');
await converge([A.page, B.page]);
await typeAt(B.page, 'end', ' BB');
await converge([A.page, B.page]);
await A.page.evaluate(() => EditorCore.getEditor().commands.focus());
await A.page.keyboard.press('Control+z');
const undone = await converge([A.page, B.page]);
const textUndone = await editorText(A.page);
check('Ctrl+Z chez Alice défait SA frappe (« AA ») et garde celle de Bob (« BB »), des deux côtés', undone !== null && !textUndone.includes(' AA') && textUndone.includes(' BB'), textUndone);
await B.page.evaluate(() => document.getElementById('v2-btn-undo').click());
const bobUndone = await converge([A.page, B.page]);
const textBobUndone = await editorText(A.page);
check('le bouton Annuler de la barre chez Bob défait SA frappe seule (« BB »), « Bob-1 » et « Alice-1 » restent', bobUndone !== null && !textBobUndone.includes(' BB') && textBobUndone.includes('Bob-1 ') && textBobUndone.includes('Alice-1'), textBobUndone);
await A.page.evaluate(() => EditorCore.getEditor().commands.focus());
await A.page.keyboard.press('Control+y');
await converge([A.page, B.page]);
check('Ctrl+Y chez Alice rétablit « AA », pas « BB »', (await editorText(B.page)).includes(' AA') && !(await editorText(B.page)).includes(' BB'), await editorText(B.page));
check('hors direct, Annuler et Rétablir restent à l\'éditeur (LiveEntry.undo rend faux sur la page de Carole)', (await C.page.evaluate(() => LiveEntry.undo() === false && LiveEntry.redo() === false)));

// ---- 4) Ce que le direct ferme -----------------------------------------------------------------------------------------------------------------

console.log('\n== 4) Ce que le direct ferme ==');
const closedRows = await A.page.evaluate(() => ['v2-btn-track-changes', 'v2-btn-accept-all', 'v2-btn-reject-all'].map(id => { const e = document.getElementById(id); return { id, aria: e.getAttribute('aria-disabled'), explains: e.hasAttribute('data-explains'), shown: !!e.offsetParent || getComputedStyle(e).display !== 'none', title: e.title }; }));
check('le suivi des modifications et ses deux lignes sont grisés avec leur raison, jamais retirés', closedRows.every(r => r.aria === 'true' && r.explains && r.shown && /fermé pendant l.écriture en direct/.test(r.title)), closedRows);
await A.page.evaluate(() => document.getElementById('v2-btn-track-changes').click());
await A.page.waitForFunction(dialogShown, null, { timeout: 5000 });
const trackNotice = await A.page.evaluate(dialogInfo);
check('un clic sur « Suivi des modifications » l\'explique dans une fenêtre simple, le suivi reste éteint', /Pendant l.écriture en direct/.test(trackNotice.title) && /suivi des modifications est fermé/.test(trackNotice.text) && !(await A.page.evaluate(() => Editor.isTrackChangesOn())), trackNotice);
await pressDialogButton(A.page, 'Fermer');
await A.page.waitForFunction(dialogGone, null, { timeout: 5000 });
const hfZones = await A.page.evaluate(() => {
  const zone = document.querySelector('.v2-hf-zone');
  const rect = zone.getBoundingClientRect();
  return { count: document.querySelectorAll('.v2-hf-zone').length, opacity: getComputedStyle(zone).opacity, height: rect.height };
});
check('l\'en-tête et le pied de page sont estompés mais là, de la même taille', hfZones.count === 2 && Number(hfZones.opacity) < 1 && hfZones.height > 5, hfZones);
await A.page.evaluate(() => document.querySelector('.v2-hf-zone').click());
await A.page.waitForFunction(dialogShown, null, { timeout: 5000 });
const hfNotice = await A.page.evaluate(dialogInfo);
check('un clic sur l\'en-tête l\'explique et ne l\'ouvre pas', /En-tête et le pied|en-tête et le pied/i.test(hfNotice.text) && !(await A.page.evaluate(() => !!HeaderFooterPreview.getHfMode())), hfNotice);
await pressDialogButton(A.page, 'Fermer');
await A.page.waitForFunction(dialogGone, null, { timeout: 5000 });
const stories = await A.page.evaluate(() => HeaderFooterPreview.listStories().map(s => s.id));
check('la Recherche ne parcourt que le corps du texte (l\'en-tête et le pied ne s\'ouvrent pas)', stories.length === 1 && stories[0] === 'main', stories);
const linked = await A.page.evaluate(() => ({ place: LinkedTable.placeBlock(EditorCore.getEditor()), lock: LinkedTable.lockReason() }));
check('un tableau lié à une Grille ne se pose pas et est verrouillé, avec les raisons de l\'écriture en direct', linked.place === 'linkedTable.rowLive' && linked.lock === 'linkedTable.lockedLive', linked);
await A.page.evaluate(() => document.getElementById('v2-btn-history').click());
await A.page.waitForFunction(() => typeof VersionsHistory !== 'undefined', null, { timeout: 10000 });
await A.page.waitForTimeout(500);
await A.page.keyboard.press('Escape');
await A.page.waitForTimeout(300);
const restore = await A.page.evaluate(async () => {
  let opened = null; VersionsHistory.open = (options) => { opened = options; };
  document.getElementById('v2-btn-history').click();
  await new Promise(done => setTimeout(done, 400));
  try { await opened.restore({}, 'x'); return 'accepté'; } catch (e) { return { key: e.versionsKey, message: e.message }; }
});
check('restaurer une version est refusé pendant le direct, avec sa raison', restore && restore.key === 'versions.restoreLive' && /Arrêtez l.écriture en direct/.test(restore.message), restore);
const kinds = await C.page.evaluate(async () => {
  const out = {};
  for (const [name, id] of [['courriel', 4], ['macro', 6], ['document', 1]]) {
    const select = document.getElementById('template-select'); select.value = String(id); select.dispatchEvent(new Event('change'));
    await new Promise(done => setTimeout(done, 1200));
    const row = document.getElementById('v2-btn-live');
    out[name] = { current: Templates.getCurrentId(), reason: LiveEntry.reason(), aria: row.getAttribute('aria-disabled'), title: row.title };
  }
  return out;
});
check('sur un modèle email ou un macro-modèle la ligne est grisée avec sa raison (seul le texte d\'un document s\'écrit en direct), puis redevient utilisable sur un document',
  ['courriel', 'macro'].every(k => /seul le texte d.un document/.test(kinds[k].reason) && kinds[k].aria === 'true' && kinds[k].title === kinds[k].reason) && kinds['document'].aria === 'false' && kinds['document'].reason === '' && kinds['document'].current === 1, kinds);

// ---- 5) L'enregistrement -----------------------------------------------------------------------------------------------------------------------

console.log('\n== 5) L\'enregistrement : une personne écrit pour tout le monde ==');
const fa = await flags(A.page), fb = await flags(B.page);
check('exactement une des deux pages est la personne qui enregistre', fa.scribe !== fb.scribe, { fa, fb });
const S = fa.scribe ? A : B, O = fa.scribe ? B : A;
const sName = fa.scribe ? 'Alice' : 'Bob', oName = fa.scribe ? 'Bob' : 'Alice';
await converge([A.page, B.page]);
// Le texte tapé plus haut est enregistré par elle, et par elle seule.
await until(S.page, () => !LiveEntry.hasUnsavedEdits(), null, 20000);
const saved1 = await model(S.page);
check(`l'enregistrement automatique de ${sName} (la personne qui enregistre) met le texte du groupe dans le modèle`, saved1 && saved1.contenu.includes('Alice-1') && saved1.contenu.includes('Bob-1'), saved1);
await until(O.page, () => !LiveEntry.hasUnsavedEdits(), null, 20000);
const fo = await flags(O.page);
check(`${oName} (l'autre) adopte l'enregistrement : plus rien « à enregistrer », « Enregistré à… », aucun bandeau de conflit`, !fo.unsaved && !fo.banner && /Enregistré à/.test(fo.status), fo);

await O.page.evaluate(() => { const input = document.getElementById('template-name'); input.value = 'Rapport renommé'; input.dispatchEvent(new Event('input', { bubbles: true })); });
let renamed = null;
for (let i = 0; i < 40 && !renamed; i++) { const m = await model(O.page); if (m && m.nom === 'Rapport renommé') renamed = m; else await O.page.waitForTimeout(500); }
check(`${oName}, qui n'enregistre pas le texte, enregistre le réglage qui lui est propre (le nom du modèle)`, !!renamed, renamed);
await until(S.page, () => !LiveEntry.hasUnsavedEdits() && !document.getElementById('autosave-conflict-banner').offsetParent, null, 15000);
check(`${sName} adopte cette date : aucun bandeau de conflit`, !(await flags(S.page)).banner);
check('les deux pages montrent encore le même texte', (await converge([A.page, B.page])) !== null);

await hide(S.page, true);
await until(O.page, () => LiveEntry.isScribe(), null, 10000);
check(`${sName} cache sa page : ${oName} devient la personne qui enregistre`, (await flags(O.page)).scribe && !(await flags(S.page)).scribe);
await typeAt(O.page, 'end', ' Relais-1');
let relayed = null;
for (let i = 0; i < 40 && !relayed; i++) { const m = await model(O.page); if (m && m.contenu.includes('Relais-1')) relayed = m; else await O.page.waitForTimeout(500); }
check(`${oName} enregistre le texte à sa place (« Relais-1 » est dans le modèle)`, !!relayed, relayed);
await until(S.page, () => !LiveEntry.hasUnsavedEdits(), null, 20000);
check(`${sName}, page cachée, adopte la date : rien « à enregistrer », aucun bandeau`, !(await flags(S.page)).unsaved && !(await flags(S.page)).banner);
await hide(S.page, false);
await until(S.page, () => LiveEntry.isScribe(), null, 10000);
await until(O.page, () => !LiveEntry.isScribe(), null, 10000);
check(`${sName} remet sa page au premier plan : elle redevient la personne qui enregistre`, (await flags(S.page)).scribe && !(await flags(O.page)).scribe);

// Carole n'est pas dans le direct : son enregistrement manuel écrit un modèle que le groupe ne connaît pas = un conflit, dit à la personne qui enregistre.
await C.page.evaluate(() => { const select = document.getElementById('template-select'); select.value = '1'; select.dispatchEvent(new Event('change')); });
await C.page.waitForTimeout(1000);
await typeAt(C.page, 'end', ' Carole-1');
await C.page.evaluate(() => document.getElementById('btn-save').click());
await until(S.page, () => document.getElementById('autosave-conflict-banner').style.display !== 'none', null, 20000);
check('une personne hors du direct enregistre le modèle : la personne qui enregistre voit le bandeau « modifié ailleurs »', (await flags(S.page)).banner);
await S.page.evaluate(() => document.getElementById('autosave-conflict-reload').click());
await until(S.page, () => LiveEntry.state() === 'off', null, 10000);
const reloaded = await flags(S.page);
check('« Recharger la dernière version » prend le texte de Carole et sort du direct (la barre disparaît), rien d\'autre n\'est perdu pour l\'autre page', reloaded.live === 'off' && !reloaded.banner && (await editorText(S.page)).includes('Carole-1') && !(await barOf(S.page)) && (await flags(O.page)).live === 'live', { reloaded, text: await editorText(S.page) });

// ---- 6) Partir ---------------------------------------------------------------------------------------------------------------------------------

console.log('\n== 6) Partir ==');
const aloneBar = await (async () => { for (let i = 0; i < 40; i++) { const bar = await barOf(O.page); if (bar && bar.state === 'alone') return bar; await O.page.waitForTimeout(250); } return await barOf(O.page); })();
check(`${sName} sort : la barre de ${oName} repasse à « personne d'autre pour l'instant »`, aloneBar && aloneBar.state === 'alone', aloneBar);
const textBeforeSwitch = await editorText(O.page);
await openTemplate(S.page, 2);
check(`${sName} ouvre un autre modèle : le direct est éteint, le modèle ouvert est celui qu'elle a choisi, la page de ${oName} n'a pas bougé`, (await editorText(S.page)) === 'Une note' && (await flags(S.page)).live === 'off' && (await editorText(O.page)) === textBeforeSwitch && (await flags(O.page)).live === 'live', { s: await editorText(S.page), o: await editorText(O.page) });
await openTemplate(S.page, 1);
const rejoin = await startLive(S.page, { ask: true, answer: 'Rejoindre' });
check(`${sName} revient sur le modèle et rejoint : le texte de ${oName} remplace celui qu'elle avait`, rejoin.started === true && (await converge([A.page, B.page])) !== null && (await editorText(S.page)) === textBeforeSwitch, { text: await editorText(S.page) });
await O.page.evaluate(() => document.querySelector('#live-bar .live-bar-stop').click());
await until(O.page, () => LiveEntry.state() === 'off', null, 10000);
check(`le bouton « Arrêter » de la barre éteint le direct de ${oName} : barre ôtée, texte gardé à l'écran, et ${sName} reste en direct`, !(await barOf(O.page)) && (await editorText(O.page)) === textBeforeSwitch && (await flags(S.page)).live === 'live', { text: await editorText(O.page) });
const histHeld = await O.page.evaluate(() => { const ed = EditorCore.getEditor(); return { history: ed.state.plugins.some(p => p.key === 'history$'), sync: ed.state.plugins.some(p => /y-sync/.test(String(p.key))) }; });
check('l\'éditeur a retrouvé son historique et ne porte plus la synchronisation', histHeld.history && !histHeld.sync, histHeld);
await S.page.evaluate(() => LiveEntry.stop());
await until(S.page, () => LiveEntry.state() === 'off', null, 10000);
let emptied = false;
for (let i = 0; i < 30 && !emptied; i++) { emptied = table.rows.length === 0; if (!emptied) await S.page.waitForTimeout(300); }
check('la dernière personne qui part vide la table du direct', emptied, rowKinds());

// ---- 7) Les marques d'une puce, le texte qui ressemble à une adresse ---------------------------------------------------------------------------

console.log('\n== 7) Les marques des puces, le lien automatique ==');
await openTemplate(A.page, 5); await openTemplate(B.page, 5);
await startLive(A.page);
await startLive(B.page, { ask: true, answer: 'Rejoindre' });
await converge([A.page, B.page]);
const chipOf = page => page.evaluate(() => { let out = null; EditorCore.getEditor().state.doc.descendants((n, pos) => { if (!out && n.type.name === 'varBadge') out = { pos, marks: n.marks.map(m => m.type.name), attr: n.attrs.ppMarks }; }); return out; });
check('les deux pages ont la puce de variable, sans marque au départ', !!(await chipOf(A.page)) && (await chipOf(A.page)).marks.length === 0 && (await chipOf(B.page)).marks.length === 0);
await A.page.evaluate(() => { const ed = EditorCore.getEditor(); let target = null; ed.state.doc.descendants((n, pos) => { if (target === null && n.type.name === 'varBadge') target = pos; }); ed.chain().focus().setNodeSelection(target).toggleBold().run(); });
await until(B.page, () => { let bold = false; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'varBadge' && n.marks.some(m => m.type.name === 'bold')) bold = true; }); return bold; }, null, 10000);
const boldB = await chipOf(B.page);
check('le gras mis sur la puce par Alice arrive chez Bob : la marque est sur la puce (elle voyage dans l\'attribut des marques)', boldB.marks.includes('bold') && /bold/.test(boldB.attr || ''), boldB);
check('le HTML enregistrable des deux pages reste identique, sans attribut de transport', (await converge([A.page, B.page])) !== null && !/ppMarks|data-pp-marks/i.test(await editorHtml(B.page)));
await A.page.evaluate(() => LiveEntry.undo());
await until(B.page, () => { let bold = false; EditorCore.getEditor().state.doc.descendants((n) => { if (n.type.name === 'varBadge' && n.marks.some(m => m.type.name === 'bold')) bold = true; }); return !bold; }, null, 10000);
check('Annuler chez Alice retire le gras chez Bob aussi', (await chipOf(B.page)).marks.length === 0 && (await chipOf(A.page)).marks.length === 0);
await stopLive(B.page); await stopLive(A.page);

await openTemplate(A.page, 3); await openTemplate(B.page, 3);
const htmlBefore = await editorHtml(A.page);
await startLive(A.page);
await startLive(B.page, { ask: true, answer: 'Rejoindre' });
await converge([A.page, B.page]);
const linkedA = (await editorHtml(A.page)).includes('<a '), linkedB = (await editorHtml(B.page)).includes('<a ');
check('un texte qui ressemble à une adresse (« exemple.fr/verifier/ ») n\'est lié par personne à l\'arrivée dans le groupe', !htmlBefore.includes('<a ') && !linkedA && !linkedB, { htmlBefore, linkedA, linkedB });
await typeAt(A.page, 'end', ' Fin.');
await converge([A.page, B.page]);
check('ni quand quelqu\'un tape plus loin dans le même paragraphe', !(await editorHtml(B.page)).includes('<a ') && !(await editorHtml(A.page)).includes('<a '));
await stopLive(B.page); await stopLive(A.page);

// ---- 8) La galerie : aller-retour par Yjs ------------------------------------------------------------------------------------------------------

console.log('\n== 8) Les modèles de la galerie, aller-retour par Yjs ==');
await openTemplate(A.page, 1);
const strip = (node) => { if (!node || typeof node !== 'object') return node; if (Array.isArray(node)) return node.map(strip); const out = {}; for (const key of Object.keys(node)) { if (key !== 'ppMarks') out[key] = strip(node[key]); } return out; };
const differing = [];
for (const entry of gallery) {
  const result = await A.page.evaluate(async (html) => {
    Editor.setHTML(html);
    const before = JSON.stringify(EditorCore.getEditor().state.doc.toJSON());
    await LiveEntry.toggle();
    const after = JSON.stringify(EditorCore.getEditor().state.doc.toJSON());
    await LiveEntry.stop();
    return { before, after };
  }, entry.contenu);
  if (JSON.stringify(strip(JSON.parse(result.before))) !== JSON.stringify(strip(JSON.parse(result.after)))) differing.push(entry.nom);
}
check(`les ${gallery.length} modèles de la galerie ressortent identiques de l'aller-retour (hors attribut de transport)`, gallery.length >= 20 && differing.length === 0, differing);

// ---- 9) Gardes ---------------------------------------------------------------------------------------------------------------------------------

console.log('\n== 9) Gardes ==');
const schemaGap = await A.page.evaluate(() => {
  const missing = [];
  const nodes = EditorCore.getEditor().schema.nodes;
  Object.keys(nodes).forEach((name) => { const type = nodes[name]; if (type.isInline && !type.isText && !(EditorNodes.INLINE_MARKS_ATTR in type.attrs)) missing.push(name); });
  return { missing, listed: EditorNodes.INLINE_LEAF_NODES };
});
check('tout nœud en ligne du schéma qui n\'est pas du texte porte l\'attribut des marques (un nœud de plus sans lui perdrait ses marques en direct : l\'ajouter à EditorNodes.INLINE_LEAF_NODES)', schemaGap.missing.length === 0, schemaGap);
const palette = await A.page.evaluate(() => {
  const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = hex => { const v = i => parseInt(hex.slice(i, i + 2), 16) / 255; return 0.2126 * lin(v(1)) + 0.7152 * lin(v(3)) + 0.0722 * lin(v(5)); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  return LiveControl.PALETTE.map(color => ({ color, onWhite: Math.round(ratio(color, '#ffffff') * 100) / 100, nameInk: LiveEditor.readableOn(color), nameRatio: Math.round(ratio(color, LiveEditor.readableOn(color)) * 100) / 100 }));
});
check('chaque couleur de curseur se voit sur la feuille blanche (3:1 au moins, éléments non textuels) et son nom écrit dessus se lit (4,5:1 au moins)', palette.length >= 8 && palette.every(p => p.onWhite >= 3 && p.nameRatio >= 4.5), palette.filter(p => p.onWhite < 3 || p.nameRatio < 4.5));
check('aucune erreur de page pendant tout le parcours', kit.pageErrors.length === 0, kit.pageErrors);
check('aucun avertissement ni erreur de la console, sur aucune des trois pages', consoleProblems.length === 0, consoleProblems.slice(0, 6));
check('aucune boîte native (alert, confirm, prompt) n\'a été ouverte', [A, B, C].every(p => p.natives.length === 0), [A, B, C].map(p => p.natives));

await kit.close();
finish();
