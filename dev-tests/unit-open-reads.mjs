#!/usr/bin/env node
// Tests purs (sans navigateur) de js/open-reads.js : les lectures que l'ouverture du widget ne refait pas (consigne 094 de GFS, 24/11 : 25 appels à Grist à l'ouverture, 14 différents, `_grist_Tables` quatre fois,
// `listTables` quatre fois, `_grist_Tables_column` trois fois). Sur un faux `docApi` qui compte ses appels :
//  - pendant l'ouverture, `listTables()`, `fetchTable` de `_grist_Tables`, `_grist_Tables_column` et `_grist_DocInfo` et le jeton de LECTURE n'envoient qu'UN appel à Grist, que les appels soient simultanés ou se suivent ;
//    `listTables` rend à chacun sa copie ; une table de la personne, `_grist_Pages`, le jeton qui peut écrire et tout appel qui porte un argument de plus partent toujours seuls ;
//  - une lecture qui échoue n'est pas gardée ; une écriture de STRUCTURE (table ou colonne ajoutée, renommée ou retirée, ligne des métadonnées, forme inconnue) vide ce qui est en commun avant de partir et à son retour (une lecture faite
//    pendant l'écriture n'est jamais servie après elle) ; l'ajout, le changement et le retrait de LIGNES d'une table de la personne n'y touchent pas ;
//  - le premier geste VRAI de la personne (un geste fabriqué par un script ne compte pas), le délai ou `end()` ferment l'ouverture : plus rien n'est mis en commun, les écouteurs sont retirés, aucun minuteur ne reste ;
//  - les appels gardent leur `this`, leurs arguments, leur résultat, leur rejet et leur exception ; un `docApi` n'est jamais enveloppé deux fois ; un `docApi` incomplet n'est pas touché.
// Lancer : node dev-tests/unit-open-reads.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Un faux `docApi` : chaque appel est noté (`log`), répond après un tour de boucle (de quoi faire se chevaucher les appels), et peut échouer à la demande (`failNext`).
function makeDocApi() {
  const log = [];
  const api = {
    failNext: null,
    delayMs: 0,
    async listTables(...args) { log.push(['listTables', ...args]); await this.settle(); this.check(this); return ['Publipostage_Modeles', 'PpDepart']; },
    async fetchTable(name, ...rest) {
      log.push(['fetchTable', name, ...rest]);
      await this.settle();
      this.check(this);
      if (this.failNext === name) { this.failNext = null; throw new Error('lecture refusée : ' + name); }
      return { id: [1, 2], who: [name, name] };
    },
    async applyUserActions(actions, ...rest) { log.push(['applyUserActions', JSON.stringify(actions), ...rest]); await this.settle(); return { retValues: [7] }; },
    async getAccessToken(...args) { log.push(['getAccessToken', JSON.stringify(args)]); await this.settle(); return { token: 'jeton' + log.length, baseUrl: 'https://grist.exemple/o/docs/api/docs/abc123', ttlMsecs: 120000 }; },
    async settle() { if (this.delayMs) await sleep(this.delayMs); else await tick(); },
    check() { /* remplacé par les essais qui vérifient `this` */ },
  };
  return { api, log, count: (name, arg) => log.filter((entry) => entry[0] === name && (arg === undefined || entry[1] === arg)).length };
}

// Un faux `document` : les écouteurs posés et retirés, de quoi jouer un geste.
function makeDocument() {
  const listeners = new Map();
  const removed = [];
  return {
    listeners, removed,
    addEventListener(type, fn, capture) { listeners.set(type, { fn, capture }); },
    removeEventListener(type, fn, capture) { if (listeners.get(type) && listeners.get(type).fn === fn) { listeners.delete(type); removed.push([type, capture]); } },
    fire(type, event) { const entry = listeners.get(type); if (entry) entry.fn(Object.assign({ type }, event)); },
  };
}

// Un contexte neuf par essai : `OpenReads` est unique par contexte (comme par page). Aucun `grist` : rien ne s'installe tout seul.
function fresh(options = {}) {
  const doc = options.noDocument ? undefined : makeDocument();
  const context = createContext(Object.assign({ setTimeout, clearTimeout }, doc ? { document: doc } : {}));
  loadScript(context, 'js/open-reads.js');
  const { api, log, count } = makeDocApi();
  const openReads = evalIn(context, 'OpenReads');
  return { api, log, count, doc, openReads, install: (extra) => openReads.install(api, Object.assign({ openMs: 60000 }, extra)) };
}

// 1. L'ouverture met les lectures en commun.
{
  const { api, count, install, openReads } = fresh();
  check('un docApi complet s\'enveloppe', install() === true);
  const four = await Promise.all([api.listTables(), api.listTables(), api.listTables(), api.listTables()]);
  check('listTables : quatre appels simultanés, un seul envoyé à Grist', count('listTables') === 1, count('listTables'));
  check('listTables : chacun reçoit la liste', four.every((names) => names.length === 2 && names[0] === 'Publipostage_Modeles'));
  four[0].push('modifiée');
  check('listTables : chacun a SA copie (changer l\'une ne change pas les autres)', four[1].length === 2 && four[2].length === 2);
  const later = await api.listTables();
  check('listTables : un appel qui vient après la réponse est servi sans rien envoyer', count('listTables') === 1 && later.length === 2, count('listTables'));

  const three = await Promise.all([api.fetchTable('_grist_Tables'), api.fetchTable('_grist_Tables'), api.fetchTable('_grist_Tables')]);
  check('fetchTable _grist_Tables : trois appels, un seul envoyé', count('fetchTable', '_grist_Tables') === 1, count('fetchTable', '_grist_Tables'));
  check('fetchTable _grist_Tables : la même réponse pour tous', three[0] === three[1] && three[1] === three[2] && three[0].who[0] === '_grist_Tables');
  await api.fetchTable('_grist_Tables');
  check('fetchTable _grist_Tables : un appel de plus, après la réponse, n\'envoie rien', count('fetchTable', '_grist_Tables') === 1);
  await Promise.all([api.fetchTable('_grist_Tables_column'), api.fetchTable('_grist_Tables_column'), api.fetchTable('_grist_DocInfo'), api.fetchTable('_grist_DocInfo')]);
  check('_grist_Tables_column et _grist_DocInfo : chacune une seule fois', count('fetchTable', '_grist_Tables_column') === 1 && count('fetchTable', '_grist_DocInfo') === 1);

  const tokens = await Promise.all([api.getAccessToken({ readOnly: true }), api.getAccessToken({ readOnly: true })]);
  check('le jeton de lecture : deux demandes, une seule envoyée, le même jeton', count('getAccessToken') === 1 && tokens[0] === tokens[1], count('getAccessToken'));

  const state = openReads.state();
  check('state() compte ce qui est parti et ce qui a été servi', state.open === true && state.sent === 5 && state.served === 10, JSON.stringify(state));
}

// 2. Ce qui part toujours seul.
{
  const { api, log, count, install } = fresh();
  install();
  await Promise.all([api.fetchTable('Publipostage_Modeles'), api.fetchTable('Publipostage_Modeles'), api.fetchTable('_grist_Pages'), api.fetchTable('_grist_Pages')]);
  check('une table de la personne et _grist_Pages : chaque appel part', count('fetchTable', 'Publipostage_Modeles') === 2 && count('fetchTable', '_grist_Pages') === 2);
  await Promise.all([api.fetchTable('_grist_Tables', { colonnes: 1 }), api.fetchTable('_grist_Tables', { colonnes: 1 })]);
  check('fetchTable avec un argument de plus : chaque appel part, argument transmis', count('fetchTable', '_grist_Tables') === 2 && log.filter((entry) => entry[0] === 'fetchTable' && entry[1] === '_grist_Tables' && entry[2] && entry[2].colonnes === 1).length === 2);
  await Promise.all([api.listTables('x'), api.listTables('x')]);
  check('listTables avec un argument : chaque appel part, argument transmis', count('listTables') === 2 && log.filter((entry) => entry[0] === 'listTables' && entry[1] === 'x').length === 2);
  await Promise.all([api.getAccessToken({ readOnly: false }), api.getAccessToken({ readOnly: false }), api.getAccessToken(), api.getAccessToken({ readOnly: true, extra: 1 }), api.getAccessToken({ readOnly: true, extra: 1 })]);
  check('le jeton qui peut écrire, sans option ou avec une option de plus : chaque demande part, jamais gardé', count('getAccessToken') === 5, count('getAccessToken'));
}

// 3. Une lecture qui échoue n'est pas gardée.
{
  const { api, count, install, openReads } = fresh();
  install();
  api.failNext = '_grist_Tables';
  const results = await Promise.allSettled([api.fetchTable('_grist_Tables'), api.fetchTable('_grist_Tables')]);
  check('lecture refusée : les appels simultanés reçoivent le même refus', results.every((r) => r.status === 'rejected' && /refusée/.test(r.reason.message)) && count('fetchTable', '_grist_Tables') === 1);
  await tick();
  const again = await api.fetchTable('_grist_Tables');
  check('lecture refusée : l\'appel suivant repart et réussit', count('fetchTable', '_grist_Tables') === 2 && again.who[0] === '_grist_Tables');
  check('lecture refusée : state() ne compte pas le refus comme servi', openReads.state().served === 1, JSON.stringify(openReads.state()));
}

// 4. Les écritures de structure vident ce qui est en commun ; les écritures de lignes non.
async function readThenWrite(actions) {
  const { api, count, install } = fresh();
  install();
  await api.fetchTable('_grist_Tables');
  await api.listTables();
  await api.applyUserActions(actions);
  await api.fetchTable('_grist_Tables');
  await api.listTables();
  return { tables: count('fetchTable', '_grist_Tables'), lists: count('listTables') };
}
{
  const structure = {
    'AddTable': [['AddTable', 'Nouvelle', [{ id: 'A', type: 'Text' }]]],
    'AddColumn': [['AddColumn', 'Publipostage_Modeles', 'Plus', { type: 'Text' }]],
    'AddVisibleColumn': [['AddVisibleColumn', 'Publipostage_Modeles', 'Plus', { type: 'Text' }]],
    'RenameColumn': [['RenameColumn', 'Publipostage_Modeles', 'Nom', 'Titre']],
    'RemoveColumn': [['RemoveColumn', 'Publipostage_Modeles', 'Nom']],
    'ModifyColumn': [['ModifyColumn', 'Publipostage_Modeles', 'Nom', { type: 'Choice' }]],
    'RenameTable': [['RenameTable', 'Publipostage_Modeles', 'Documents']],
    'RemoveTable': [['RemoveTable', 'Publipostage_Modeles']],
    'une ligne des métadonnées': [['UpdateRecord', '_grist_Tables_column', 4, { label: 'Autre' }]],
    'un mélange où une action change la structure': [['AddRecord', 'Publipostage_Modeles', null, {}], ['AddColumn', 'Publipostage_Modeles', 'Plus', {}]],
    'une forme inconnue': [['Inconnue']],
  };
  for (const [label, actions] of Object.entries(structure)) {
    const { tables, lists } = await readThenWrite(actions);
    check('écriture de structure (' + label + ') : les lectures suivantes repartent', tables === 2 && lists === 2, tables + ' / ' + lists);
  }
  for (const verb of ['AddRecord', 'BulkAddRecord', 'UpdateRecord', 'BulkUpdateRecord', 'RemoveRecord', 'BulkRemoveRecord']) {
    const { tables, lists } = await readThenWrite([[verb, 'Publipostage_Modeles', 1, {}]]);
    check('écriture de lignes (' + verb + ') d\'une table de la personne : rien n\'est vidé', tables === 1 && lists === 1, tables + ' / ' + lists);
  }
  const probe = await readThenWrite([['AddRecord', 'Publipostage_UserProbe', null, {}], ['RemoveRecord', 'Publipostage_UserProbe', 3]]);
  check('la sonde (une ligne ajoutée puis retirée) ne vide rien', probe.tables === 1 && probe.lists === 1);
  const notArray = await readThenWrite(undefined);
  check('des actions qui ne sont pas une liste : par prudence, tout est vidé', notArray.tables === 2 && notArray.lists === 2);
}

// 5. Une lecture faite PENDANT une écriture de structure n'est jamais servie après elle.
{
  const { api, count, install } = fresh();
  install();
  api.delayMs = 15;
  const writing = api.applyUserActions([['AddColumn', 'Publipostage_Modeles', 'Plus', {}]]);
  const during = await Promise.all([api.fetchTable('_grist_Tables_column'), api.fetchTable('_grist_Tables_column')]);
  check('pendant l\'écriture, les lectures simultanées se partagent', count('fetchTable', '_grist_Tables_column') === 1 && during[0] === during[1]);
  await writing;
  await tick();
  await api.fetchTable('_grist_Tables_column');
  check('après l\'écriture, la lecture repart (ce qui a été lu pendant elle n\'est plus servi)', count('fetchTable', '_grist_Tables_column') === 2, count('fetchTable', '_grist_Tables_column'));
}

// 6. L'écriture garde son résultat, son rejet et son exception.
{
  const { api, install } = fresh();
  install();
  const done = await api.applyUserActions([['AddRecord', 'T', null, {}]]);
  check('une écriture rend ce que Grist rend', done && done.retValues && done.retValues[0] === 7);

  // L'écriture qui échoue est celle d'origine, posée AVANT l'enveloppe.
  const second = fresh();
  second.api.applyUserActions = async () => { throw new Error('écriture refusée'); };
  second.install();
  await second.api.fetchTable('_grist_Tables');
  let message = '';
  try { await second.api.applyUserActions([['AddTable', 'X', []]]); } catch (error) { message = error.message; }
  check('une écriture refusée rejette avec le même refus', message === 'écriture refusée', message);
  await tick();
  await second.api.fetchTable('_grist_Tables');
  check('une écriture de structure refusée vide quand même ce qui était en commun', second.count('fetchTable', '_grist_Tables') === 2);

  const thrower = fresh();
  thrower.api.applyUserActions = () => { throw new Error('exception synchrone'); };
  thrower.install();
  await thrower.api.fetchTable('_grist_Tables');
  let thrown = '';
  try { thrower.api.applyUserActions([['AddTable', 'X', []]]); } catch (error) { thrown = error.message; }
  check('une exception synchrone de l\'écriture est relancée telle quelle', thrown === 'exception synchrone', thrown);
  await thrower.api.fetchTable('_grist_Tables');
  check('et vide ce qui était en commun', thrower.count('fetchTable', '_grist_Tables') === 2);
}

// 7. La fin de l'ouverture.
{
  const { api, count, doc, install, openReads } = fresh();
  install();
  check('l\'ouverture écoute le doigt, la souris et le clavier (phase de capture)', ['pointerdown', 'keydown', 'touchstart'].every((type) => doc.listeners.has(type) && doc.listeners.get(type).capture === true), Array.from(doc.listeners.keys()).join());
  await api.fetchTable('_grist_Tables');
  doc.fire('pointerdown', { isTrusted: false });
  await api.fetchTable('_grist_Tables');
  check('un geste fabriqué par un script ne ferme pas l\'ouverture', openReads.state().open === true && count('fetchTable', '_grist_Tables') === 1);
  doc.fire('pointerdown', { isTrusted: true });
  check('le premier geste vrai ferme l\'ouverture', openReads.state().open === false);
  check('les écouteurs sont retirés', doc.listeners.size === 0 && doc.removed.length === 3, doc.removed.length);
  await api.fetchTable('_grist_Tables');
  await api.fetchTable('_grist_Tables');
  await api.listTables();
  await api.listTables();
  check('après le geste, chaque lecture part de nouveau', count('fetchTable', '_grist_Tables') === 3 && count('listTables') === 2, count('fetchTable', '_grist_Tables') + ' / ' + count('listTables'));
  await Promise.all([api.getAccessToken({ readOnly: true }), api.getAccessToken({ readOnly: true })]);
  check('après le geste, le jeton de lecture n\'est plus partagé', count('getAccessToken') === 2);
}
{
  const { api, count, doc, install, openReads } = fresh();
  install({ openMs: 40 });
  await api.listTables();
  await sleep(120);
  check('au bout du délai, l\'ouverture se ferme d\'elle-même', openReads.state().open === false && doc.listeners.size === 0);
  await api.listTables();
  check('et les lectures repartent', count('listTables') === 2);
}
{
  const { api, count, doc, install, openReads } = fresh();
  install();
  await api.listTables();
  openReads.end();
  check('end() ferme l\'ouverture et retire les écouteurs', openReads.state().open === false && doc.listeners.size === 0);
  await api.listTables();
  check('après end(), les lectures repartent', count('listTables') === 2);
  openReads.end();
  check('end() deux fois ne casse rien', openReads.state().open === false);
  check('un docApi déjà enveloppé ne l\'est pas une seconde fois', openReads.install(api) === false);
}

// 8. Les appels gardent leur `this` et leurs arguments ; un docApi incomplet n'est pas touché ; pas de document, pas d'écouteur.
{
  const { api, install, openReads } = fresh({ noDocument: true });
  let seen = [];
  api.check = (self) => { seen.push(self === api); };
  check('sans document (une page d\'essai), l\'enveloppe se pose', install() === true);
  await api.listTables();
  await api.fetchTable('_grist_Tables');
  await api.fetchTable('Autre');
  check('chaque appel garde son `this`', seen.length === 3 && seen.every(Boolean), seen.join());
  openReads.end();
}
{
  const { openReads } = fresh();
  const partial = { listTables() { return Promise.resolve([]); }, fetchTable() { return Promise.resolve({}); } };
  const before = partial.listTables;
  check('un docApi sans applyUserActions n\'est pas enveloppé', openReads.install(partial) === false && partial.listTables === before && openReads.state().open === false);
  check('et un docApi absent non plus', openReads.install(null) === false && openReads.install(undefined) === false);
  const noToken = fresh();
  delete noToken.api.getAccessToken;
  check('un docApi sans getAccessToken s\'enveloppe pour le reste', noToken.install() === true && noToken.api.getAccessToken === undefined);
  noToken.openReads.end();
}
{
  // Sans docApi au chargement (hors de Grist), le fichier ne fait rien et ne casse rien.
  const context = createContext({ setTimeout, clearTimeout });
  loadScript(context, 'js/open-reads.js');
  check('hors de Grist, OpenReads se charge sans rien enveloppé', evalIn(context, 'OpenReads.state().open') === false);
}
{
  // Avec `grist.docApi` au chargement, l'enveloppe se pose toute seule (la page réelle).
  const { api, log } = makeDocApi();
  const doc = makeDocument();
  const context = createContext({ setTimeout, clearTimeout, document: doc, grist: { docApi: api } });
  loadScript(context, 'js/open-reads.js');
  check('avec grist.docApi au chargement, l\'enveloppe se pose d\'elle-même', evalIn(context, 'OpenReads.state().open') === true);
  await Promise.all([api.listTables(), api.listTables()]);
  check('et elle met la lecture en commun', log.filter((entry) => entry[0] === 'listTables').length === 1);
  evalIn(context, 'OpenReads.end()');
}

summarizeAndExit();
