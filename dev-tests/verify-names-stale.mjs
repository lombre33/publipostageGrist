#!/usr/bin/env node
// Les noms des tables changent dans un AUTRE onglet (une autre personne, une restauration) pendant que cette page est ouverte : le widget le dit à la vraie souris, 700x400 (consigne 104 f de GFS ; guide des apps 1.1,
// point 15 : « une écriture qui répond table introuvable : relis les noms et recommence une fois, sinon dis Rechargez la page, sans rien écrire de plus »). Le faux Grist de dev-tests/grist-stub.js est « strict » comme le
// vrai moteur (`state.strictTables` : une écriture dans une table qui n'existe pas lève « KeyError », avant que rien ne soit écrit ; une lecture dit « Table not found »), rejoue RenameTable et RenameColumn comme le vrai,
// et peut refuser les écritures d'une table (`state.failWritesTo`) ; le document est celui d'avant (noms français, deux modèles) et le widget n'y renomme rien (mode « legacy » : c'est « un autre onglet » qui le fait).
//  1) l'autre onglet renomme les tables et les colonnes du widget ; l'enregistrement qui suit (Templates.save, le geste de la personne) relit les noms et réussit : le modèle est dans la table aux noms d'aujourd'hui, aucune
//     table d'avant ne renaît, aucune fenêtre, rien dans la console qui cite un jeton ; une écriture seule (sans lecture avant) échoue d'abord sous les anciens noms, relit les noms, recommence UNE fois et réussit : deux
//     lots reçus par Grist, un seul écrit ;
//  2) une colonne supprimée à la main (aucun nom n'a changé) : l'erreur de Grist reste la sienne, aucune fenêtre, aucune relance ;
//  3) la relance échoue aussi (le moteur la refuse) : la fenêtre « Rechargez la page » s'ouvre au-dessus de tout, tient dans le panneau, porte « Recharger la page » (premier élément sous la souris, focus dessus) et « Fermer » ;
//     l'écriture rend l'erreur NAMES_CHANGED_ELSEWHERE ; une écriture de plus n'atteint pas Grist ; « Fermer » (vrai clic) laisse la page telle quelle et la fenêtre ne revient pas ; Échap aussi ; le texte se lit à 4,5:1 ;
//  4) « Recharger la page » (vrai clic) recharge la page : elle repart du document et démarre ;
//  5) en anglais, thème sombre : mêmes textes, en anglais.
// Lancé par run-headless.mjs (groupe Node « namesStaleMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-names-stale.mjs
// NAMES_STALE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit. NAMES_STALE_PORT : le port du petit serveur (8898 par défaut).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-names-stale', port: Number(process.env.NAMES_STALE_PORT || 8898) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SHOTS = process.env.NAMES_STALE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shoot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

// Le document d'avant, semé dans le faux Grist avant que le widget ne lise quoi que ce soit : deux modèles (les numéros de ligne 1 et 2), les libellés d'avant. Le mode « legacy » : le widget lit et écrit les noms que le document porte.
const SEED = `
  const seed = (table, rows) => {
    const columnar = stub.state.rows[table];
    rows.forEach(row => Object.keys(row).forEach(k => { if (!(k in columnar)) columnar[k] = columnar.id.map(() => null); }));
    rows.forEach(row => { columnar.id.push(row.id); Object.keys(columnar).forEach(k => { if (k !== 'id') columnar[k].push(k in row ? row[k] : null); }); });
    stub.state.nextRowId[table] = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  };
  seed('Publipostage_Modeles', [
    { id: 1, Nom: 'Facture', Contenu: '<p>Bonjour {{Nom}}</p>', Jeton: 'tok-facture', Margins: '20,20,20,20' },
    { id: 2, Nom: 'Devis', Contenu: '<p>Devis</p>', Jeton: 'tok-devis' },
  ]);
`;
const INIT = `window.__schemaNames = 'legacy';`;

// Ouvre le widget prêt, le faux Grist devient « strict » (comme le vrai moteur) et la page reçoit une marque que seul un rechargement efface.
async function open({ lang = 'fr', colorScheme = 'light' } = {}) {
  const consoleLines = [];
  const opened = await t.openPage({
    hosted: false, lang, colorScheme, ready: true, seed: SEED, init: INIT,
    before: async page => { page.on('console', message => consoleLines.push(message.type() + ' : ' + message.text())); },
  });
  await opened.page.evaluate(() => { window.__survivor = 'avant le rechargement'; window.__gristStub.setStrictTables(true); });
  return Object.assign(opened, { consoleLines });
}

// Le code que « l'autre onglet » joue dans la page : les tables et les colonnes du widget passent à l'anglais, en UN lot, comme la fenêtre de mise à jour des noms (js/names-update.js) le fait pour le propriétaire. Une écriture
// qui passe par `grist.docApi` (et non par le traducteur du widget) ne dit rien à la page : l'ouverture, qui avait mis en commun la liste des tables, est finie à la main (OpenReads.end).
const RENAME_ELSEWHERE = `async () => {
  const stub = window.__gristStub;
  const actions = [];
  SchemaColumns.TABLES.forEach(table => {
    const columns = stub.state.rows[table.legacyId];
    if (!columns) return;
    if (table.legacyId !== table.id) actions.push(['RenameTable', table.legacyId, table.id]);
    table.pairs.forEach(pair => { if (pair.legacy !== pair.id && pair.legacy in columns) actions.push(['RenameColumn', table.id, pair.legacy, pair.id]); });
  });
  await window.grist.docApi.applyUserActions(actions);
  if (typeof OpenReads !== 'undefined' && OpenReads && OpenReads.end) OpenReads.end();
  return actions.length;
}`;
const renameElsewhere = page => page.evaluate(`(${RENAME_ELSEWHERE})()`);
// Un enregistrement du widget, le geste de la personne : { ok } ou { code, message } quand il échoue.
const saveTemplate = (page, name) => page.evaluate(async (wanted) => {
  try { await Templates.save(null, wanted, '<p>' + wanted + '</p>', '', null, PageLayout.getMarginsMm(), 'document', null); return { ok: true }; }
  catch (e) { return { ok: false, code: e && e.code, message: String((e && e.message) || e) }; }
}, name);
// Une écriture seule dans la table des modèles par le traducteur du widget, SANS lecture avant (aucune relecture des noms avant l'envoi) ; `renameFirst` : l'autre onglet renomme juste avant, dans la même tâche (aucun minuteur de la page ne passe entre les deux).
const writeModel = (page, { renameFirst = false, name = 'Facture bis', column = 'Name' } = {}) => page.evaluate(async ({ rename, wanted, field }) => {
  const renamed = rename ? await (0, eval)('(' + rename + ')')() : 0;
  try { await SchemaColumns.docApi.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { [field]: wanted }]]); return { ok: true, renamed }; }
  catch (e) { return { ok: false, renamed, code: e && e.code, message: String((e && e.message) || e) }; }
}, { rename: renameFirst ? RENAME_ELSEWHERE : '', wanted: name, field: column });
const docState = page => page.evaluate(() => {
  const stub = window.__gristStub;
  const names = table => (stub.state.rows[table] && (stub.state.rows[table].Name || stub.state.rows[table].Nom)) || [];
  return {
    tables: Object.keys(stub.state.rows).filter(name => /^Publipostage_/.test(name)),
    templates: names('Publipostage_Templates'),
    legacyTemplates: names('Publipostage_Modeles'),
    attempts: stub.state.writeAttempts,
    written: stub.getActionLog().length,
    stale: typeof SchemaColumns.isStale === 'function' ? SchemaColumns.isStale() : false,
  };
});

const BOX = '#pp-dialog-modal .pp-dialog-box';
const dialogShown = page => page.evaluate(() => { const el = document.getElementById('pp-dialog-modal'); return !!el && getComputedStyle(el).display !== 'none'; });
const dialogText = page => page.evaluate(() => ({
  title: (document.getElementById('pp-dialog-title') || {}).textContent,
  message: (document.getElementById('pp-dialog-message') || {}).textContent,
  buttons: Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(b => !b.hidden && b.offsetParent !== null).map(b => (b.textContent || '').trim()),
}));
const buttonBox = (page, label) => page.evaluate(wanted => {
  const button = Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).find(b => !b.hidden && b.offsetParent !== null && (b.textContent || '').trim() === wanted);
  if (!button) return null;
  const r = button.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, under: !!top && (top === button || button.contains(top)) };
}, label);
async function mouseClickButton(page, label) {
  const box = await buttonBox(page, label);
  if (!box) throw new Error('bouton introuvable : ' + label);
  await page.mouse.move(box.x - 20, box.y - 10);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.mouse.click(box.x, box.y);
}
const noSecret = lines => lines.every(line => !/stub-write-token|auth=/.test(line));
const survivor = page => page.evaluate(() => window.__survivor || null);
const REFUSAL = "[Sandbox] KeyError 'Publipostage_Templates'";
const refuseTemplates = page => page.evaluate(message => { window.__gristStub.state.failWritesTo = { Publipostage_Templates: message }; }, REFUSAL);

async function scenario(label, work) {
  console.log('\n# ' + label);
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, String(e && e.stack || e).slice(0, 600)); }
}

// --- 1) l'autre onglet renomme, la page se remet d'elle-même ---------------------------------------------------------------------------------------------------------------------------
await scenario('un renommage venu d\'ailleurs : la page relit les noms et recommence une fois', async () => {
  const { page, consoleLines } = await open();
  const before = await docState(page);
  check('départ : le document porte les noms d\'avant, la page les a lus', before.tables.includes('Publipostage_Modeles') && !before.tables.includes('Publipostage_Templates') && same(before.legacyTemplates, ['Facture', 'Devis']), before.tables);
  const renamed = await renameElsewhere(page);
  const mid = await docState(page);
  check('l\'autre onglet a renommé le document (la table des modèles, ses colonnes), les deux modèles y sont', renamed > 5 && same(mid.templates, ['Facture', 'Devis']) && !mid.tables.includes('Publipostage_Modeles'), { renamed, tables: mid.tables });
  const result = await saveTemplate(page, 'Contrat');
  const after = await docState(page);
  check('l\'enregistrement réussit', result.ok === true, result);
  check('le modèle est dans la table aux noms d\'aujourd\'hui, avec les deux autres', same(after.templates, ['Facture', 'Devis', 'Contrat']), after.templates);
  check('aucune table d\'avant ne renaît', !after.tables.includes('Publipostage_Modeles'), after.tables);
  check('aucune fenêtre, la page n\'est pas « périmée »', (await dialogShown(page)) === false && after.stale === false);
  check('l\'enregistrement d\'après n\'a plus rien à relire et réussit', (await saveTemplate(page, 'Avenant')).ok === true && (await docState(page)).templates.includes('Avenant'));
  check('rien dans la console ne cite un jeton', noSecret(consoleLines), consoleLines.filter(line => !noSecret([line])));
  await page.context().close();

  // Une écriture seule : aucune lecture avant, la page envoie sous les noms qu'elle avait lus.
  const alone = await open();
  const attempts = (await docState(alone.page)).attempts;
  const written = await writeModel(alone.page, { renameFirst: true, name: 'Facture bis' });
  const state = await docState(alone.page);
  check('une écriture seule, sans lecture avant : réussie après relecture des noms', written.ok === true && written.renamed > 5, written);
  check('la table des modèles a reçu la nouvelle valeur, aucune table d\'avant ne renaît', state.templates[0] === 'Facture bis' && !state.tables.includes('Publipostage_Modeles'), state);
  check('Grist a reçu trois lots : le renommage d\'ailleurs, l\'écriture refusée sous les anciens noms, la relance sous les nouveaux', state.attempts - attempts === 3, state.attempts - attempts);
  check('aucune fenêtre, la page n\'est pas « périmée »', (await dialogShown(alone.page)) === false && state.stale === false);
  await alone.page.context().close();
});

// --- 2) aucun nom n'a changé : l'erreur de Grist reste la sienne -------------------------------------------------------------------------------------------------------------------------
await scenario('une colonne supprimée à la main (aucun nom n\'a changé) : l\'erreur de Grist reste la sienne, sans relance ni fenêtre', async () => {
  const { page } = await open();
  await page.evaluate(() => window.__gristStub.dropColumn('Publipostage_Modeles', 'Jeton'));
  const attempts = (await docState(page)).attempts;
  const result = await page.evaluate(async () => {
    try { await SchemaColumns.docApi.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Token: 'x' }]]); return { ok: true }; }
    catch (e) { return { ok: false, code: e && e.code, message: String((e && e.message) || e) }; }
  });
  await sleep(300);
  const state = await docState(page);
  check('l\'écriture échoue avec l\'erreur de Grist (« colonne inconnue »), pas avec « Rechargez la page »', result.ok === false && result.code !== 'NAMES_CHANGED_ELSEWHERE' && /inconnue/.test(result.message), result);
  check('aucune relance : Grist n\'a reçu qu\'UN lot', state.attempts - attempts === 1, state.attempts - attempts);
  check('aucune fenêtre, la page n\'est pas « périmée »', (await dialogShown(page)) === false && state.stale === false);
  await page.context().close();
});

// --- 3) la relance échoue aussi : « Rechargez la page » ---------------------------------------------------------------------------------------------------------------------------------
await scenario('la relance échoue aussi : la fenêtre « Rechargez la page », « Fermer » et Échap', async () => {
  const { page } = await open();
  await renameElsewhere(page);
  await refuseTemplates(page);
  const attempts = (await docState(page)).attempts;
  const result = await writeModel(page, { name: 'Facture bis' });
  check('l\'écriture rend l\'erreur NAMES_CHANGED_ELSEWHERE, « rechargez la page »', result.ok === false && result.code === 'NAMES_CHANGED_ELSEWHERE' && /rechargez la page/i.test(result.message), result);
  await page.waitForSelector(BOX, { state: 'visible', timeout: 10000 });
  await sleep(300);
  const text = await dialogText(page);
  check('la fenêtre dit « Rechargez la page » et pourquoi', text.title === 'Rechargez la page' && /noms des tables de ce document ont changé/.test(text.message) && /rien de plus n’est écrit/.test(text.message) && /copiez-les/.test(text.message), text);
  check('deux boutons : « Fermer » et « Recharger la page »', same(text.buttons, ['Fermer', 'Recharger la page']), text.buttons);
  const box = await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, BOX);
  check('la fenêtre tient dans le panneau 700x400', box.left >= 0 && box.top >= 0 && box.right <= 700 && box.bottom <= 400, box);
  const reload = await buttonBox(page, 'Recharger la page');
  const close = await buttonBox(page, 'Fermer');
  check('« Recharger la page » et « Fermer » sont au-dessus de tout (le premier élément sous la souris) et dans le panneau', !!reload && reload.under === true && !!close && close.under === true && reload.right <= 700 && reload.bottom <= 400, { reload, close });
  check('le focus est sur « Recharger la page »', (await page.evaluate(() => (document.activeElement && document.activeElement.textContent || '').trim())) === 'Recharger la page');
  const contrast = await contrastOf(page, '#pp-dialog-message');
  check('le texte se lit à 4,5:1 (clair)', contrast >= 4.5, contrast);
  await shoot(page, 'stale-fr-light');
  const state = await docState(page);
  check('la page est « périmée » : elle n\'écrit plus', state.stale === true);
  check('Grist a reçu DEUX lots de cette écriture : sous les anciens noms, puis sous les nouveaux', state.attempts - attempts === 2, state.attempts - attempts);
  const again = await saveTemplate(page, 'Avenant');
  const stateAgain = await docState(page);
  check('une écriture de plus est refusée sans toucher à Grist (aucun lot de plus reçu)', again.ok === false && again.code === 'NAMES_CHANGED_ELSEWHERE' && stateAgain.attempts === state.attempts, { again, attempts: stateAgain.attempts - state.attempts });
  check('rien n\'a été écrit dans la table des modèles', same(stateAgain.templates, ['Facture', 'Devis']), stateAgain.templates);
  await mouseClickButton(page, 'Fermer');
  await sleep(300);
  check('« Fermer » (vrai clic) ferme la fenêtre, la page reste telle quelle (aucun rechargement)', (await dialogShown(page)) === false && (await survivor(page)) === 'avant le rechargement');
  await saveTemplate(page, 'Encore');
  await sleep(300);
  check('une autre tentative ne rouvre pas la fenêtre (une seule par page)', (await dialogShown(page)) === false);
  await page.context().close();

  // Échap ferme la fenêtre aussi, sans recharger.
  const second = await open();
  await renameElsewhere(second.page);
  await refuseTemplates(second.page);
  await writeModel(second.page, { name: 'Facture bis' });
  await second.page.waitForSelector(BOX, { state: 'visible', timeout: 10000 });
  await sleep(300);
  await second.page.keyboard.press('Escape');
  await sleep(300);
  check('Échap ferme la fenêtre sans recharger la page', (await dialogShown(second.page)) === false && (await survivor(second.page)) === 'avant le rechargement');
  await second.page.context().close();
});

// --- 4) « Recharger la page » recharge ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario('« Recharger la page » (vrai clic) recharge la page', async () => {
  const { page } = await open();
  await renameElsewhere(page);
  await refuseTemplates(page);
  await writeModel(page, { name: 'Facture bis' });
  await page.waitForSelector(BOX, { state: 'visible', timeout: 10000 });
  await sleep(300);
  const navigated = page.waitForEvent('load', { timeout: 30000 });
  await mouseClickButton(page, 'Recharger la page');
  await navigated;
  await page.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 60000 });
  await page.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready|ouvert|opened|non enregistré|not saved/i.test(el.textContent || ''); }, null, { timeout: 90000 });
  check('la page a été rechargée : la marque posée avant n\'y est plus', (await survivor(page)) === null);
  const state = await docState(page);
  check('elle repart du document (les deux modèles), n\'est plus « périmée » et la fenêtre n\'y est plus', same(state.legacyTemplates, ['Facture', 'Devis']) && state.stale === false && (await dialogShown(page)) === false, state);
  await page.context().close();
});

// --- 5) en anglais, thème sombre -------------------------------------------------------------------------------------------------------------------------------------------------
await scenario('en anglais, thème sombre du système : mêmes textes, en anglais', async () => {
  const { page } = await open({ lang: 'en', colorScheme: 'dark' });
  await renameElsewhere(page);
  await refuseTemplates(page);
  const result = await writeModel(page, { name: 'Invoice bis' });
  check('l\'erreur parle anglais : « reload the page »', result.ok === false && result.code === 'NAMES_CHANGED_ELSEWHERE' && /reload the page/i.test(result.message), result);
  await page.waitForSelector(BOX, { state: 'visible', timeout: 10000 });
  await sleep(300);
  const text = await dialogText(page);
  check('la fenêtre : « Reload the page », le message anglais, « Close » et « Reload the page »', text.title === 'Reload the page' && /table names of this document have changed/.test(text.message) && /nothing more is written from here/.test(text.message) && same(text.buttons, ['Close', 'Reload the page']), text);
  const contrastText = await contrastOf(page, '#pp-dialog-message');
  const contrastButton = await contrastOf(page, '#pp-dialog-modal .var-modal-primary');
  check('le texte et le bouton se lisent à 4,5:1 (sombre)', contrastText >= 4.5 && contrastButton >= 4.5, { contrastText, contrastButton });
  await shoot(page, 'stale-en-dark');
  await page.context().close();
});

await t.finish();
