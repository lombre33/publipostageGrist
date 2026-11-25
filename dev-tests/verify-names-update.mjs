#!/usr/bin/env node
// La fenêtre de mise à jour des noms (consigne 104 de Grist Factory Suite, kit 0.29.1 ; js/names-update.js, js/schema-columns.js) à la vraie souris et au vrai clavier, 700x400, le vrai module du kit (sa fenêtre
// comprise, `kit/js/names-update/window.js`, servie par l'import map de la page), le faux Grist de dev-tests/grist-stub.js qui rejoue RenameTable, RenameColumn et ModifyColumn comme le vrai (mode « migrate » :
// document d'avant, deux modèles, un commentaire, une règle de liaison, les libellés d'avant) et, hébergée, le GFS simulé de dev-tests/gfs-stub.js (`contexte.role`).
// « Fait quand » de la consigne : la fenêtre vue sur un document aux noms d'avant dans GFS et hors GFS, une personne qui n'est pas propriétaire (aucune fenêtre), une table de Sync+ gardée. Ce que ça vérifie :
//  1) dans GFS, propriétaire (`role.proprietaire` vrai), en français, 700x400 : la fenêtre s'ouvre AVANT toute lecture d'une table du widget, au-dessus de tout (le bouton est le premier élément sous la souris), tient
//     dans le panneau, nomme l'app et dit que les données ne changent pas ; rien n'est écrit tant que la personne n'a pas cliqué ; Échap et un clic sur le voile ne la ferment pas ; le vrai clic sur « Mettre à jour »
//     envoie UN lot (aucune lecture des tables du widget sous leur nom d'avant), puis « Terminé » et « Continuer » ; le démarrage de l'app attendait la fenêtre (le « chargement long » est suspendu pendant ce temps, repris
//     après) ; ensuite les trois tables sont en anglais, plus aucun nom d'avant, les libellés sont les identifiants, les modèles sont lus sous leurs noms anglais avec leurs numéros de ligne, un enregistrement écrit
//     sous les noms anglais et ne recrée rien ; aucun jeton capable d'écrire n'est demandé (la preuve est celle de GFS) ;
//  2) hors GFS, propriétaire (la preuve : `GET /webhooks` avec un jeton d'écriture, 200), en anglais, thème sombre du système : la fenêtre parle anglais, le jeton est demandé une fois, jeté, jamais écrit dans la console ;
//     le texte et le bouton se lisent à 4,5:1 ; un document déjà repris, ouvert de nouveau, n'ouvre plus rien ;
//  3) hors GFS, PAS propriétaire (403) : aucune fenêtre, rien d'écrit, le document est lu et écrit sous ses noms d'avant, rien dans la console ;
//  4) dans GFS, PAS propriétaire (`role.proprietaire` faux) et « GFS ne sait pas » (nul) : même chose, sans jeton d'écriture demandé, sans appel au serveur ;
//  5) une table de Sync+ (colonne `id_sync`, au clavier : Entrée, Entrée) : la fenêtre dit qu'elle garde son nom, la table des modèles garde son nom ET ses colonnes, les autres tables passent à l'anglais, les modèles se
//     lisent et s'écrivent sous leurs noms d'avant, aucune table anglaise des modèles n'est créée à côté ;
//  6) Grist refuse le lot : « Rien n'a changé », « Réessayer » relance et réussit ; ou « Continuer sans mettre à jour » rend la main, le document garde ses noms et se lit toujours, rien n'est recréé ;
//  7) un document déjà aux noms anglais : aucune fenêtre, le module du kit n'est même pas demandé au serveur, aucune preuve, aucun jeton ;
//  8) aucune erreur de page ni de console (les avertissements attendus d'un module de kit absent ne sont pas joués ici : ils ont leur essai unitaire, dev-tests/unit-schema-columns.mjs).
// Lancé par run-headless.mjs (groupe Node « namesUpdateMouse », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-names-update.mjs
// NAMES_UPDATE_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit. NAMES_UPDATE_PORT : le port du petit serveur (8897 par défaut).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, contrastOf } from './gfs-page.mjs';

const t = await start({ name: 'verify-names-update', port: Number(process.env.NAMES_UPDATE_PORT || 8897) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SHOTS = process.env.NAMES_UPDATE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shoot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };

const LEGACY_TABLES = ['Publipostage_Modeles', 'Publipostage_Commentaires', 'Publipostage_LiensTables', 'Publipostage_PreferencesModeles', 'Publipostage_Abreviations', 'Publipostage_FormatsPage'];
const LEGACY_COLUMNS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'EstParDefaut', 'TypeModele', 'Jeton', 'ModeleId', 'Auteur', 'Texte', 'CreeLe', 'TableCible', 'ColonneCible', 'ColonneSource'];
const OWNER = { proprietaire: true, responsableDe: [] };
const NOT_OWNER = { proprietaire: false, responsableDe: [] };
const UNKNOWN = { proprietaire: null, responsableDe: [] };

// Le document d'avant, semé dans le faux Grist avant que le widget ne lise quoi que ce soit : deux modèles (les numéros de ligne 1 et 2), un commentaire, une règle de liaison, et les libellés que l'ancien code posait.
// `sync` : la table des modèles porte la colonne `id_sync` d'un partage Sync+. `refuse` : Grist refuse les N premiers lots de renommage (comme un éditeur sans droit de structure, ou un autre onglet qui change les noms).
const seedFor = ({ sync = false, refuse = 0 } = {}) => `
  const seed = (table, rows) => {
    const columnar = stub.state.rows[table];
    rows.forEach(row => Object.keys(row).forEach(k => { if (!(k in columnar)) columnar[k] = columnar.id.map(() => null); }));
    rows.forEach(row => { columnar.id.push(row.id); Object.keys(columnar).forEach(k => { if (k !== 'id') columnar[k].push(k in row ? row[k] : null); }); });
    stub.state.nextRowId[table] = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  };
  seed('Publipostage_Modeles', [
    { id: 1, Nom: 'Facture', Contenu: '<p>Bonjour {{Nom}}</p>', Jeton: 'tok-facture', Margins: '20,20,20,20'${sync ? ", id_sync: 'a1'" : ''} },
    { id: 2, Nom: 'Devis', Contenu: '<p>Devis</p>', Jeton: 'tok-devis'${sync ? ", id_sync: 'a2'" : ''} },
  ]);
  seed('Publipostage_Commentaires', [{ id: 1, ModeleId: 1, CommentId: 'c1', Auteur: 'Alice', Texte: 'à relire', CreeLe: 1 }]);
  seed('Publipostage_LiensTables', [{ id: 1, TableCible: 'Factures', Mode: 'column', ColonneCible: 'Client', ColonneSource: 'Nom' }]);
  stub.setColumnLabels('Publipostage_Modeles', { DateModif: 'Dernière modification', HeaderFooter: 'En-tête / pied de page', Margins: 'Marges de page', EstParDefaut: 'Modèle par défaut' });
  ${refuse ? `
  let refusals = ${refuse};
  const docApi = window.grist.docApi;
  const apply = docApi.applyUserActions.bind(docApi);
  docApi.applyUserActions = async function (actions) {
    if (refusals > 0 && actions.some(action => action[0] === 'RenameTable')) { refusals--; throw new Error('Blocked by full structure access rules'); }
    return apply.apply(null, arguments);
  };` : ''}
`;
// Avant les scripts de la page : le mode des noms du widget, ce que le « chargement long » (FirstContact) a reçu (pause, reprise) et le moment où le démarrage est fini (FirstContact.ready).
const initFor = mode => `
  window.__schemaNames = ${JSON.stringify(mode)};
  window.__started = false;
  window.__fc = [];
  document.addEventListener('DOMContentLoaded', () => {
    ['pause', 'resume', 'ready'].forEach(name => {
      const original = FirstContact[name].bind(FirstContact);
      FirstContact[name] = (...args) => { window.__fc.push(name); if (name === 'ready') window.__started = true; return original(...args); };
    });
  });`;

const WINDOW = '#nu-modal';
const PRIMARY = '#nu-modal .pp-modal-primary';
const SECONDARY = '#nu-modal .pp-modal-actions button:not(.pp-modal-primary)';

// Ouvre le widget sans attendre qu'il soit prêt : la fenêtre bloque le démarrage. `webhooks` : ce que Grist répond à la preuve de propriété hors GFS ('owner' : 200, 'refused' : 403).
async function open({ hosted = false, role, webhooks = 'owner', lang = 'fr', colorScheme = 'light', mode = 'migrate', sync = false, refuse = 0, seed = true, ready = false } = {}) {
  const consoleLines = [];
  const webhookCalls = [];
  const opened = await t.openPage({
    hosted, stub: hosted ? { role } : null, lang, colorScheme, ready,
    seed: seed ? seedFor({ sync, refuse }) : '', init: initFor(mode),
    before: async page => {
      page.on('console', message => consoleLines.push(message.type() + ' : ' + message.text()));
      await page.route('**/webhooks*', route => {
        webhookCalls.push(route.request().url());
        if (webhooks === 'owner') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ webhooks: [] }) });
        return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'No owner access' }) });
      });
    },
  });
  return Object.assign(opened, { consoleLines, webhookCalls });
}

const windowText = page => page.evaluate(() => { const el = document.getElementById('nu-modal'); return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null; });
const boxOf = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, selector);
const buttonLabels = page => page.evaluate(() => Array.from(document.querySelectorAll('#nu-modal .pp-modal-actions button')).filter(b => !b.hidden && b.offsetParent !== null).map(b => (b.textContent || '').trim()));
const waitForWindow = page => page.waitForSelector(PRIMARY, { state: 'visible', timeout: 60000 }).then(() => sleep(350));
const waitForWindowGone = page => page.waitForSelector(WINDOW, { state: 'detached', timeout: 30000 });
const started = page => page.waitForFunction(() => window.__started === true, null, { timeout: 90000 });
async function mouseClick(page, selector) {
  const box = await boxOf(page, selector);
  if (!box) throw new Error('introuvable : ' + selector);
  await page.mouse.move(box.x - 20, box.y - 10);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.mouse.click(box.x, box.y);
}
// Le document que le faux Grist garde maintenant : les tables du widget, les actions de renommage reçues, les modèles (nom, ligne), les libellés qui diffèrent de l'identifiant, les lectures par table.
const docState = page => page.evaluate(() => {
  const stub = window.__gristStub;
  const rows = stub.state.rows;
  const widget = Object.keys(rows).filter(name => /^Publipostage_/.test(name) && name !== 'Publipostage_UserProbe');
  const modelsTable = rows.Publipostage_Templates ? 'Publipostage_Templates' : 'Publipostage_Modeles';
  const nameColumn = modelsTable === 'Publipostage_Templates' ? 'Name' : 'Nom';
  const models = rows[modelsTable] ? rows[modelsTable].id.map((id, i) => ({ id, name: rows[modelsTable][nameColumn][i] })) : [];
  const columns = {};
  widget.forEach(table => { columns[table] = Object.keys(rows[table]).filter(key => key !== 'id'); });
  const log = stub.getActionLog();
  const meta = rows._grist_Tables_column;
  const tables = rows._grist_Tables;
  const labelsDiffering = [];
  if (meta && tables) meta.id.forEach((_, i) => {
    const table = tables.tableId[tables.id.indexOf(meta.parentId[i])];
    if (/^Publipostage_/.test(table) && meta.label[i] !== meta.colId[i]) labelsDiffering.push(table + '.' + meta.colId[i]);
  });
  return {
    widget, columns, models, modelsTable, labelsDiffering,
    renames: log.filter(action => ['RenameTable', 'RenameColumn', 'ModifyColumn'].includes(action[0])).length,
    tableRenames: log.filter(action => action[0] === 'RenameTable').map(action => action[1] + ' > ' + action[2]),
    reads: stub.state.callOrder.filter(call => /^fetchTable Publipostage_/.test(call)),
    writeTokens: stub.state.tokenCalls.filter(call => !call.readOnly).length,
    started: window.__started, fc: window.__fc.slice(),
  };
});
const legacyLeft = state => state.widget.filter(table => LEGACY_TABLES.includes(table)).concat([].concat(...state.widget.map(table => state.columns[table].filter(column => LEGACY_COLUMNS.includes(column)).map(column => table + '.' + column))));
const READS_OLD = /^fetchTable Publipostage_(Modeles|Commentaires|LiensTables|PreferencesModeles|Abreviations|FormatsPage)$/;
const noSecret = lines => lines.every(line => !/stub-write-token|auth=/.test(line));

async function scenario(label, work) {
  console.log('\n# ' + label);
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, String(e && e.stack || e).slice(0, 600)); }
}

// --- 1) dans GFS, propriétaire, français, souris -------------------------------------------------------------------------------------------------------------------------------------
await scenario('dans GFS, propriétaire, en français, à la souris', async () => {
  const { page, consoleLines } = await open({ hosted: true, role: OWNER });
  await waitForWindow(page);
  const text = await windowText(page);
  check('la fenêtre s\'ouvre, nomme l\'app et dit que les données ne changent pas', /Mise à jour des noms de vos tables/.test(text) && /Publipostage\+ range désormais ses données sous des noms anglais/.test(text) && /Vos données ne changent pas/.test(text), text);
  check('elle annonce trois tables et le bouton « Mettre à jour », sans autre bouton (on ne la saute pas avant d\'avoir essayé)', /3 tables/.test(text) && same(await buttonLabels(page), ['Mettre à jour']), await buttonLabels(page));
  const box = await boxOf(page, PRIMARY);
  check('le bouton tient dans le panneau de 700x400', box && box.left >= 0 && box.right <= 700 && box.top >= 0 && box.bottom <= 400 && box.height >= 24, box);
  check('la fenêtre est au-dessus de tout : sous la souris, au bouton, c\'est le bouton', await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!el && !!el.closest('#nu-modal .pp-modal-primary'); }, box));
  check('la fenêtre n\'a pas de défilement horizontal', await page.evaluate(() => { const b = document.querySelector('#nu-modal .nu-box'); return !!b && b.scrollWidth <= b.clientWidth + 1; }));
  await shoot(page, 'fenetre-gfs-fr-attente');
  let state = await docState(page);
  check('avant le clic : rien n\'est écrit, aucune table du widget n\'a été lue, le démarrage attend (le « chargement long » est suspendu)', state.renames === 0 && state.reads.length === 0 && state.started === false && same(state.fc, ['pause']), state);
  check('avant le clic : aucun jeton capable d\'écrire demandé (la preuve est celle de GFS)', state.writeTokens === 0, state.writeTokens);
  await page.keyboard.press('Escape');
  await sleep(250);
  check('Échap ne ferme pas la fenêtre', (await windowText(page)) !== null);
  await page.mouse.click(8, 8);
  await sleep(250);
  check('un clic sur le voile non plus', (await windowText(page)) !== null);
  state = await docState(page);
  check('et rien n\'a été écrit pour autant', state.renames === 0, state.renames);

  await mouseClick(page, PRIMARY);
  await page.waitForSelector('#nu-modal .nu-ok', { state: 'visible', timeout: 30000 });
  await sleep(300);
  const done = await windowText(page);
  check('le résultat est dit : « Terminé : 3 tables mises à jour »', /Terminé : 3 tables mises à jour/.test(done), done);
  check('sans nombre de lignes : l\'app ne donne pas `rowCount` au kit (compter lirait tout le contenu des modèles, consigne 104 e), la fenêtre dit seulement que les données n\'ont pas été touchées', /Vos données n’ont pas été touchées/.test(done) && !/lignes? vérifiées?/.test(done), done);
  check('le bouton devient « Continuer », seul', same(await buttonLabels(page), ['Continuer']), await buttonLabels(page));
  await shoot(page, 'fenetre-gfs-fr-fait');
  state = await docState(page);
  check('le démarrage attend encore la personne (pas prêt, pas de reprise du « chargement long »)', state.started === false && same(state.fc, ['pause']), state.fc);
  check('les trois tables sont renommées par UN lot (3 RenameTable), plus aucun nom d\'avant, aucune lecture d\'une table sous son nom d\'avant', same(state.tableRenames.sort(), ['Publipostage_Commentaires > Publipostage_Comments', 'Publipostage_LiensTables > Publipostage_TableLinks', 'Publipostage_Modeles > Publipostage_Templates']) && legacyLeft(state).length === 0 && state.reads.filter(call => READS_OLD.test(call)).length === 0, { renames: state.tableRenames, legacy: legacyLeft(state), reads: state.reads });
  check('chaque libellé est l\'identifiant de sa colonne (Grist ne le suit pas au renommage : le lot le pose)', state.labelsDiffering.length === 0, state.labelsDiffering);

  await mouseClick(page, PRIMARY);
  await waitForWindowGone(page);
  await started(page);
  state = await docState(page);
  check('« Continuer » : la fenêtre part, le démarrage reprend (reprise du « chargement long », puis prêt)', state.started === true && same(state.fc.slice(0, 2), ['pause', 'resume']) && state.fc.includes('ready'), state.fc);
  check('les deux modèles sont là, mêmes numéros de ligne, sous les noms anglais', same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]) && state.modelsTable === 'Publipostage_Templates', state.models);
  const loaded = await page.evaluate(() => Templates.loadAll().then(list => list.map(model => model.nom).sort()));
  check('le widget les lit : Devis, Facture', same(loaded, ['Devis', 'Facture']), loaded);
  const content = await page.evaluate(() => { const rows = window.__gristStub.state.rows.Publipostage_Templates; return { content: rows.Content[0], modelToken: rows.Token[0], comment: window.__gristStub.state.rows.Publipostage_Comments.Text[0], link: window.__gristStub.state.rows.Publipostage_TableLinks.TargetColumn[0] }; });
  check('le contenu, le jeton, le commentaire et la règle de liaison sont intacts', same(content, { content: '<p>Bonjour {{Nom}}</p>', modelToken: 'tok-facture', comment: 'à relire', link: 'Client' }), content);
  await page.evaluate(() => Templates.save(null, 'Contrat', '<p>Contrat</p>', '', null, PageLayout.getMarginsMm(), 'document', null));
  state = await docState(page);
  check('un enregistrement écrit sous les noms anglais et ne recrée rien d\'avant', state.models.some(model => model.name === 'Contrat') && legacyLeft(state).length === 0 && state.labelsDiffering.length === 0, { models: state.models, legacy: legacyLeft(state) });
  check('aucun jeton capable d\'écrire n\'a été demandé de toute l\'ouverture (GFS prouve, l\'app ne touche à rien)', state.writeTokens === 0, state.writeTokens);
  check('rien dans la console qui ressemble à un jeton ou à une adresse à jeton', noSecret(consoleLines), consoleLines.filter(line => !noSecret([line])));
  await page.context().close();
});

// --- 2) hors GFS, propriétaire (preuve REST), anglais, sombre ---------------------------------------------------------------------------------------------------------------------------
await scenario('hors GFS, propriétaire (GET /webhooks), en anglais, thème sombre du système', async () => {
  const { page, consoleLines, webhookCalls } = await open({ hosted: false, webhooks: 'owner', lang: 'en', colorScheme: 'dark' });
  await waitForWindow(page);
  const text = await windowText(page);
  check('la fenêtre parle anglais, nomme l\'app', /Updating the names of your tables/.test(text) && /Publipostage\+ now stores its data under English names/.test(text) && /Your data does not change/.test(text), text);
  check('un seul bouton : « Update »', same(await buttonLabels(page), ['Update']), await buttonLabels(page));
  check('la preuve est partie une fois, vers /webhooks du document, avec un jeton', webhookCalls.length === 1 && /\/api\/docs\/[^/]+\/webhooks\?auth=stub-write-token\d*$/.test(webhookCalls[0]), webhookCalls);
  check('un seul jeton capable d\'écrire demandé', (await docState(page)).writeTokens === 1, (await docState(page)).writeTokens);
  check('la console ne cite ni le jeton ni l\'adresse à jeton', noSecret(consoleLines), consoleLines);
  const contrastText = await contrastOf(page, '#nu-modal .nu-text');
  const contrastButton = await contrastOf(page, PRIMARY);
  const contrastLink = await contrastOf(page, '#nu-modal summary');
  check('le texte se lit à 4,5:1 au moins, en sombre', contrastText >= 4.5, contrastText);
  check('le bouton principal se lit à 4,5:1 au moins, en sombre', contrastButton >= 4.5, contrastButton);
  check('le titre qu\'on ouvre (« See the names that change ») se lit à 4,5:1 au moins, en sombre', contrastLink >= 4.5, contrastLink);
  await shoot(page, 'fenetre-seule-en-sombre-attente');
  await mouseClick(page, '#nu-modal summary');
  await sleep(300);
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('#nu-modal .nu-pairs li')).map(li => (li.textContent || '').replace(/\s+/g, ' ').trim()));
  check('le titre ouvert montre les noms qui changent, une paire par table', names.length === 3 && names.some(line => /Publipostage_Modeles\s*becomes\s*Publipostage_Templates/.test(line)), names);
  await shoot(page, 'fenetre-seule-en-sombre-liste');
  await mouseClick(page, PRIMARY);
  await page.waitForSelector('#nu-modal .nu-ok', { state: 'visible', timeout: 30000 });
  await sleep(300);
  const done = await windowText(page);
  check('le résultat est dit en anglais, « Continue »', /Done: 3 tables updated/.test(done) && same(await buttonLabels(page), ['Continue']), done);
  check('le résultat vert se lit à 4,5:1 au moins, en sombre', (await contrastOf(page, '#nu-modal .nu-ok')) >= 4.5, await contrastOf(page, '#nu-modal .nu-ok'));
  await shoot(page, 'fenetre-seule-en-sombre-fait');
  await mouseClick(page, PRIMARY);
  await waitForWindowGone(page);
  await started(page);
  const state = await docState(page);
  check('le document est repris, rien d\'avant ne reste, les deux modèles sont là', legacyLeft(state).length === 0 && same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]), { legacy: legacyLeft(state), models: state.models });
  check('le jeton a servi une fois puis a été jeté : aucune autre demande d\'écriture, aucune autre preuve', state.writeTokens === 1 && webhookCalls.length === 1, { tokens: state.writeTokens, proofs: webhookCalls.length });
  check('toujours rien dans la console qui cite le jeton', noSecret(consoleLines), consoleLines.filter(line => !noSecret([line])));
  await page.context().close();
});

// --- 3) hors GFS, pas propriétaire -----------------------------------------------------------------------------------------------------------------------------------------------------
await scenario('hors GFS, pas propriétaire (403) : aucune fenêtre, le document garde ses noms', async () => {
  const { page, consoleLines, webhookCalls } = await open({ hosted: false, webhooks: 'refused', ready: true });
  const state = await docState(page);
  check('aucune fenêtre n\'est ouverte', (await windowText(page)) === null);
  check('la preuve a été demandée une fois et Grist a dit non', webhookCalls.length === 1 && state.writeTokens === 1, { proofs: webhookCalls.length, tokens: state.writeTokens });
  check('rien n\'est renommé ni écrit : les tables et les colonnes d\'avant sont là, aucune table anglaise', state.renames === 0 && state.tableRenames.length === 0 && LEGACY_TABLES.slice(0, 3).every(table => state.widget.includes(table)) && !state.widget.includes('Publipostage_Templates'), state);
  check('le widget est prêt et lit les deux modèles sous leurs noms d\'avant', state.started === true && same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]), state.models);
  const loaded = await page.evaluate(() => Templates.loadAll().then(list => list.map(model => model.nom).sort()));
  check('le widget les lit : Devis, Facture', same(loaded, ['Devis', 'Facture']), loaded);
  await page.evaluate(() => Templates.save(null, 'Contrat', '<p>Contrat</p>', '', null, PageLayout.getMarginsMm(), 'document', null));
  const after = await docState(page);
  check('un enregistrement écrit dans la table d\'avant, sans rien créer en anglais', after.models.some(model => model.name === 'Contrat') && after.modelsTable === 'Publipostage_Modeles' && !after.widget.includes('Publipostage_Templates') && after.renames === 0, { models: after.models, widget: after.widget });
  check('la pause du « chargement long » n\'a pas été posée (aucune fenêtre n\'a attendu la personne)', !state.fc.includes('pause'), state.fc);
  check('rien dans la console ne cite le jeton, aucun avertissement de mise à jour', noSecret(consoleLines) && !consoleLines.some(line => /NamesUpdate|mise à jour des noms/i.test(line)), consoleLines);
  await page.context().close();
});

// --- 4) dans GFS, pas propriétaire, et GFS ne sait pas -----------------------------------------------------------------------------------------------------------------------------
for (const [label, role] of [['pas propriétaire (faux)', NOT_OWNER], ['GFS ne sait pas encore (nul)', UNKNOWN]]) {
  await scenario('dans GFS, ' + label + ' : aucune fenêtre, le document garde ses noms', async () => {
    const { page, consoleLines } = await open({ hosted: true, role, ready: true });
    const state = await docState(page);
    check(label + ' : aucune fenêtre', (await windowText(page)) === null);
    check(label + ' : rien n\'est renommé, les noms d\'avant se lisent et le widget est prêt', state.renames === 0 && !state.widget.includes('Publipostage_Templates') && state.started === true && same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]), state);
    check(label + ' : aucun jeton capable d\'écrire demandé (GFS prouve, ou ne prouve pas ; l\'app ne va pas voir ailleurs dans GFS)', state.writeTokens === 0, state.writeTokens);
    check(label + ' : aucune pause, rien dans la console', !state.fc.includes('pause') && noSecret(consoleLines) && !consoleLines.some(line => /NamesUpdate/.test(line)), { fc: state.fc, consoleLines });
    await page.context().close();
  });
}

// --- 5) table de Sync+ gardée, au clavier ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario('une table de Sync+ garde son nom, au clavier (Entrée, Entrée)', async () => {
  const { page, consoleLines } = await open({ hosted: true, role: OWNER, sync: true });
  await waitForWindow(page);
  const text = await windowText(page);
  check('la fenêtre dit qu\'une table garde son ancien nom parce qu\'un partage Sync+ s\'en sert, et nomme la table', /Une table garde son ancien nom/.test(text) && /Sync\+/.test(text) && /Publipostage_Modeles/.test(text), text);
  check('elle annonce deux tables à renommer (la table des modèles reste)', /2 tables/.test(text) && !/3 tables/.test(text), text);
  check('le focus est sur le bouton « Mettre à jour » (la personne au clavier valide sans souris)', await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#nu-modal .pp-modal-primary'); }));
  await shoot(page, 'fenetre-sync-fr');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#nu-modal .nu-ok', { state: 'visible', timeout: 30000 });
  await sleep(300);
  check('Entrée a lancé la mise à jour : « Terminé : 2 tables mises à jour »', /Terminé : 2 tables mises à jour/.test(await windowText(page)), await windowText(page));
  check('le focus est revenu sur « Continuer »', await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#nu-modal .pp-modal-primary'); }));
  await page.keyboard.press('Enter');
  await waitForWindowGone(page);
  await started(page);
  const state = await docState(page);
  check('la table des modèles garde son nom ET toutes ses colonnes d\'avant, `id_sync` comprise', state.widget.includes('Publipostage_Modeles') && !state.widget.includes('Publipostage_Templates') && state.columns.Publipostage_Modeles.includes('Nom') && state.columns.Publipostage_Modeles.includes('Contenu') && state.columns.Publipostage_Modeles.includes('id_sync'), state.columns.Publipostage_Modeles);
  check('les deux autres tables sont en anglais', state.widget.includes('Publipostage_Comments') && state.widget.includes('Publipostage_TableLinks') && !state.widget.includes('Publipostage_Commentaires') && !state.widget.includes('Publipostage_LiensTables'), state.widget);
  check('le widget lit les modèles sous leurs noms d\'anglais depuis la table qui garde le nom d\'avant', same(await page.evaluate(() => Templates.loadAll().then(list => list.map(model => model.nom).sort())), ['Devis', 'Facture']));
  await page.evaluate(() => Templates.save(null, 'Contrat', '<p>Contrat</p>', '', null, PageLayout.getMarginsMm(), 'document', null));
  const after = await docState(page);
  check('un enregistrement va dans la table d\'avant, aucune table des modèles n\'est créée en anglais à côté', after.models.some(model => model.name === 'Contrat') && after.modelsTable === 'Publipostage_Modeles' && !after.widget.includes('Publipostage_Templates'), { models: after.models, widget: after.widget });
  check('rien dans la console qui cite un jeton', noSecret(consoleLines), consoleLines);
  await page.context().close();
});

// --- 6) Grist refuse le lot ------------------------------------------------------------------------------------------------------------------------------------------------------------
await scenario('Grist refuse le lot : « Réessayer » relance et réussit', async () => {
  const { page } = await open({ hosted: true, role: OWNER, refuse: 1 });
  await waitForWindow(page);
  await mouseClick(page, PRIMARY);
  await page.waitForSelector('#nu-modal .nu-alert', { state: 'visible', timeout: 30000 });
  await sleep(300);
  const refused = await windowText(page);
  check('« Rien n\'a changé dans vos données. Grist a refusé la mise à jour. »', /Rien n’a changé dans vos données/.test(refused) && /Grist a refusé la mise à jour/.test(refused), refused);
  check('deux boutons : « Réessayer » (principal) et « Continuer sans mettre à jour »', same(await buttonLabels(page), ['Continuer sans mettre à jour', 'Réessayer']) || same(await buttonLabels(page), ['Réessayer', 'Continuer sans mettre à jour']), await buttonLabels(page));
  let state = await docState(page);
  check('le document n\'a pas changé : tout ou rien', state.renames === 0 && LEGACY_TABLES.slice(0, 3).every(table => state.widget.includes(table)), state);
  await shoot(page, 'fenetre-refusee-fr');
  await mouseClick(page, PRIMARY);
  await page.waitForSelector('#nu-modal .nu-ok', { state: 'visible', timeout: 30000 });
  await sleep(300);
  check('« Réessayer » : cette fois le lot passe, « Terminé »', /Terminé : 3 tables mises à jour/.test(await windowText(page)), await windowText(page));
  await mouseClick(page, PRIMARY);
  await waitForWindowGone(page);
  await started(page);
  state = await docState(page);
  check('le document est renommé, rien d\'avant ne reste, les modèles sont là', legacyLeft(state).length === 0 && same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]), { legacy: legacyLeft(state), models: state.models });
  await page.context().close();
});

await scenario('Grist refuse le lot : « Continuer sans mettre à jour » rend la main, le document garde ses noms', async () => {
  const { page, consoleLines } = await open({ hosted: false, webhooks: 'owner', refuse: 9 });
  await waitForWindow(page);
  await mouseClick(page, PRIMARY);
  await page.waitForSelector('#nu-modal .nu-alert', { state: 'visible', timeout: 30000 });
  await sleep(300);
  await mouseClick(page, SECONDARY);
  await waitForWindowGone(page);
  await started(page);
  const state = await docState(page);
  check('la fenêtre part, le widget démarre et lit les deux modèles sous leurs noms d\'avant', state.started === true && same(state.models, [{ id: 1, name: 'Facture' }, { id: 2, name: 'Devis' }]) && state.modelsTable === 'Publipostage_Modeles', state);
  check('rien n\'est renommé, rien n\'est recréé en anglais', state.renames === 0 && !state.widget.includes('Publipostage_Templates') && legacyLeft(state).length > 0, state.widget);
  check('la pause du « chargement long » est reprise', same(state.fc.slice(0, 2), ['pause', 'resume']), state.fc);
  await page.evaluate(() => Templates.save(null, 'Contrat', '<p>Contrat</p>', '', null, PageLayout.getMarginsMm(), 'document', null));
  const after = await docState(page);
  check('un enregistrement écrit dans la table d\'avant, la fenêtre ne se rouvre pas', after.models.some(model => model.name === 'Contrat') && after.modelsTable === 'Publipostage_Modeles' && (await windowText(page)) === null, after.models);
  check('rien dans la console ne cite le jeton', noSecret(consoleLines), consoleLines.filter(line => !noSecret([line])));
  await page.context().close();
});

// --- 7) un document déjà aux noms anglais ----------------------------------------------------------------------------------------------------------------------------------------------
await scenario('un document déjà aux noms anglais : aucune fenêtre, le module du kit n\'est même pas demandé', async () => {
  const { page, requests, webhookCalls } = await open({ hosted: false, mode: 'english', seed: false, ready: true });
  const state = await docState(page);
  check('aucune fenêtre, aucune écriture de renommage', (await windowText(page)) === null && state.renames === 0, state.renames);
  check('le module de la fenêtre et sa feuille de style ne sont pas demandés au serveur (la feuille, elle, est dans la page : le module seul est paresseux)', !requests.some(url => /\/kit\/js\/names-update\//.test(url)), requests.filter(url => /names-update/.test(url)));
  check('aucune preuve de propriété, aucun jeton capable d\'écrire', webhookCalls.length === 0 && state.writeTokens === 0, { proofs: webhookCalls.length, tokens: state.writeTokens });
  check('le widget lit ses tables anglaises et est prêt', state.started === true && state.widget.includes('Publipostage_Templates') && !state.widget.includes('Publipostage_Modeles'), state.widget);
  await page.context().close();
});

await t.finish();
