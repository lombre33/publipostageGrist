#!/usr/bin/env node
// Tests purs (sans navigateur) de l'accord pour créer les tables du widget - js/grist-api.js (addTableIfMissing, setTableConsent, isTablesDeclined),
// cf. dev-tests/unit-harness.mjs pour le contexte général. Choix d'Antoine du 05/10 (carte « Faut-il demander avant de créer les tables du widget au
// premier lancement ? ») : « demander une fois, mais si la personne refuse, lui redemander à chaque action de sa part sur le widget ». La question et le
// compteur de gestes (clics, touches) viennent de js/table-consent.js ; ici ils sont remplacés par des faux que le test pilote.
//  - un document sans table du widget : la première création pose la question, les créations simultanées (quatre au premier lancement) attendent la même
//    réponse, « oui » vaut pour la session et pour les tables créées plus tard ;
//  - un document qui porte déjà une table du widget ne pose aucune question ;
//  - un refus ne crée rien et lève une erreur reconnaissable (isTablesDeclined), sans journal d'erreur ;
//  - après un refus : sans geste de la personne la création est refusée sans nouvelle question, après un geste la question est reposée ;
//  - une table créée par une autre fenêtre pendant la question n'est pas créée une seconde fois ;
//  - une question qui échoue ne crée rien ; sans question branchée (un module essayé seul), tout se crée comme avant ;
//  - ce que les modules en tirent : la liste des modèles reste vide sans erreur (Templates.loadAll), les règles de liaison et l'identité ne lisent rien
//    sans bruit (GristAPI.init, getCurrentUserEmail), les préférences de rangement et les commentaires s'arrêtent sans erreur.
// Lancer : node dev-tests/unit-table-consent.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Faux document : des tables (colonnes et lignes), les métadonnées que Grist en tire, un journal des actions. `onList` : appelé à chaque listTables.
class Doc {
  constructor(tables = []) {
    this.tables = {};
    tables.forEach((name) => { this.tables[name] = { cols: [], rows: [] }; });
    this.journal = [];
    this.nextId = 1;
  }

  async listTables() { return Object.keys(this.tables); }

  async fetchTable(name) {
    const names = Object.keys(this.tables);
    if (name === '_grist_Tables') return { id: names.map((_, i) => i + 1), tableId: names.slice() };
    if (name === '_grist_Tables_column') return { id: [], parentId: [], colId: [], type: [], widgetOptions: [], displayCol: [], visibleCol: [], parentPos: [] };
    const table = this.tables[name];
    if (!table) throw new Error('Invalid table ' + name);
    const out = { id: table.rows.map((row) => row.id) };
    table.cols.forEach((col) => { out[col] = table.rows.map((row) => row[col]); });
    return out;
  }

  async applyUserActions(actions) {
    const retValues = [];
    for (const action of actions) {
      this.journal.push(action);
      const table = this.tables[action[1]];
      if (action[0] === 'AddTable') { this.tables[action[1]] = { cols: action[2].map((c) => c.id), rows: [] }; retValues.push(null); }
      else if (action[0] === 'AddVisibleColumn') { if (!table.cols.includes(action[2])) table.cols.push(action[2]); retValues.push({ colId: action[2] }); }
      else if (action[0] === 'AddRecord') { const row = Object.assign({ id: this.nextId++ }, action[3]); table.rows.push(row); retValues.push(row.id); }
      else retValues.push(null);
    }
    return { retValues };
  }

  added() { return this.journal.filter((a) => a[0] === 'AddTable').map((a) => a[1]); }
}

// La question et le compteur de gestes d'un test : `answers` est la file des réponses (true / false / une erreur à lever), chaque question attend `release()`
// quand `manual` est vrai (pour que le test agisse pendant qu'elle est ouverte).
function makeHooks({ answers = [], manual = false } = {}) {
  const hooks = { asked: 0, gestures: 0, release: null };
  hooks.hooks = {
    gesture: () => hooks.gestures,
    ask: async () => {
      hooks.asked++;
      const answer = answers.length ? answers.shift() : true;
      if (manual) await new Promise((resolve) => { hooks.release = resolve; });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return hooks;
}

function fresh(doc, { hooks = null, scripts = [] } = {}) {
  const log = { warnings: [], errors: [], pages: [] };
  const grist = { ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; }, docApi: doc };
  const globals = {
    grist,
    console: { log() {}, warn: (...a) => log.warnings.push(a.join(' ')), error: (...a) => log.errors.push(a.join(' ')) },
    setTimeout,
    PageTree: { afterTableCreated: (name) => log.pages.push(name) },
    __hooks: hooks ? hooks.hooks : null,
  };
  const ctx = createContext(globals);
  loadScript(ctx, 'js/grist-api.js');
  scripts.forEach((path) => loadScript(ctx, path));
  if (hooks) evalIn(ctx, 'GristAPI.setTableConsent(__hooks)');
  return { run: (expr) => evalIn(ctx, expr), log, ctx };
}

async function section(label, work) {
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, e && e.stack); }
}

const ensure = (name) => `GristAPI.ensureTable('${name}', [{ id: 'Nom', type: 'Text' }])`;
// Le résultat d'une création : 'ok', 'créée' / 'déjà là', ou 'refusée' quand l'erreur est celle du refus de la personne, 'erreur' pour toute autre.
async function attempt(run, name) {
  try { return (await run(ensure(name))) ? 'créée' : 'déjà là'; }
  catch (e) { return run('GristAPI.isTablesDeclined').call(null, e) ? 'refusée' : 'erreur : ' + (e && e.message); }
}

async function main() {
  await section('un document sans table du widget : la question est posée une fois', async () => {
    const doc = new Doc(['Missions']);
    const q = makeHooks();
    const { run, log } = fresh(doc, { hooks: q });
    check('la table du widget est créée après un « oui »', (await attempt(run, 'Publipostage_Modeles')) === 'créée' && same(doc.added(), ['Publipostage_Modeles']), doc.added());
    check('une seule question', q.asked === 1, q.asked);
    check('sa page est rangée', same(log.pages, ['Publipostage_Modeles']), log.pages);
    check('une autre table du widget, plus tard : créée sans nouvelle question (« oui » vaut pour la session)', (await attempt(run, 'Publipostage_Commentaires')) === 'créée' && q.asked === 1, q.asked);
    check('aucune erreur écrite', log.errors.length === 0, log.errors);
  });

  await section('les quatre créations du premier lancement attendent la même réponse', async () => {
    const doc = new Doc();
    const q = makeHooks({ manual: true });
    const { run } = fresh(doc, { hooks: q });
    const four = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_PreferencesModeles'].map((n) => attempt(run, n));
    await sleep(10);
    check('une seule question pour quatre créations, rien de créé en attendant', q.asked === 1 && doc.added().length === 0, { asked: q.asked, added: doc.added() });
    q.release();
    const results = await Promise.all(four);
    check('après le « oui », les quatre sont créées', results.every((r) => r === 'créée') && doc.added().length === 4, { results, added: doc.added() });
    check('toujours une seule question', q.asked === 1, q.asked);
  });

  await section('un document qui porte déjà une table du widget', async () => {
    const doc = new Doc(['Publipostage_Modeles']);
    const q = makeHooks({ answers: [false] });
    const { run } = fresh(doc, { hooks: q });
    check('une table du widget manquante se crée sans question', (await attempt(run, 'Publipostage_FormatsPage')) === 'créée' && q.asked === 0, q.asked);
    const other = new Doc(['Publipostage_Commentaires']);
    const q2 = makeHooks({ answers: [false] });
    const second = fresh(other, { hooks: q2 });
    check('n\'importe laquelle des sept compte', (await attempt(second.run, 'Publipostage_Modeles')) === 'créée' && q2.asked === 0, q2.asked);
  });

  await section('un refus', async () => {
    const doc = new Doc(['Missions']);
    const q = makeHooks({ answers: [false] });
    const { run, log } = fresh(doc, { hooks: q });
    const result = await attempt(run, 'Publipostage_Modeles');
    check('rien n\'est créé et l\'erreur est celle du refus', result === 'refusée' && doc.added().length === 0 && log.pages.length === 0, { result, added: doc.added() });
    check('aucune erreur écrite', log.errors.length === 0 && log.warnings.length === 0, { errors: log.errors, warnings: log.warnings });
    check('sans geste depuis le refus : refusée sans nouvelle question, quelle que soit la table', (await attempt(run, 'Publipostage_LiensTables')) === 'refusée' && (await attempt(run, 'Publipostage_Modeles')) === 'refusée' && q.asked === 1, q.asked);
  });

  await section('après un refus, un geste repose la question', async () => {
    const doc = new Doc();
    const q = makeHooks({ answers: [false, true] });
    const { run } = fresh(doc, { hooks: q });
    await attempt(run, 'Publipostage_Modeles');
    q.gestures++; // un clic de la personne
    check('un geste, puis une création : la question est reposée et le « oui » crée la table', (await attempt(run, 'Publipostage_Modeles')) === 'créée' && q.asked === 2 && same(doc.added(), ['Publipostage_Modeles']), { asked: q.asked, added: doc.added() });
    q.gestures += 5;
    check('« oui » gardé : plus de question, même après d\'autres gestes', (await attempt(run, 'Publipostage_Commentaires')) === 'créée' && q.asked === 2, q.asked);
  });

  await section('un refus de plus, puis le silence', async () => {
    const doc = new Doc();
    const q = makeHooks({ answers: [false, false, true] });
    const { run } = fresh(doc, { hooks: q });
    await attempt(run, 'Publipostage_Modeles');
    q.gestures++;
    check('deuxième refus : refusée', (await attempt(run, 'Publipostage_Modeles')) === 'refusée' && q.asked === 2, q.asked);
    check('encore refusée sans nouvelle question tant que la personne ne fait rien', (await attempt(run, 'Publipostage_LiensTables')) === 'refusée' && q.asked === 2, q.asked);
    q.gestures++;
    check('un nouveau geste : troisième question, « oui »', (await attempt(run, 'Publipostage_Modeles')) === 'créée' && q.asked === 3, q.asked);
  });

  await section('les gestes faits pendant la question comptent avant le refus', async () => {
    const doc = new Doc();
    const q = makeHooks({ answers: [false], manual: true });
    const { run } = fresh(doc, { hooks: q });
    const first = attempt(run, 'Publipostage_Modeles');
    await sleep(5);
    q.gestures += 3; // Tab dans la fenêtre, puis le clic sur « Ne pas créer »
    q.release();
    await first;
    check('un autre besoin juste après la réponse (même geste) : pas de nouvelle question', (await attempt(run, 'Publipostage_UserProbe')) === 'refusée' && q.asked === 1, q.asked);
  });

  await section('une table créée ailleurs pendant la question', async () => {
    const doc = new Doc();
    const q = makeHooks({ manual: true });
    const { run, log } = fresh(doc, { hooks: q });
    const pending = attempt(run, 'Publipostage_Modeles');
    await sleep(5);
    doc.tables.Publipostage_Modeles = { cols: [], rows: [] }; // une autre fenêtre du document a répondu « oui » avant
    q.release();
    check('après le « oui », la table n\'est pas créée une seconde fois', (await pending) === 'déjà là' && doc.added().length === 0 && log.pages.length === 0, { added: doc.added(), pages: log.pages });
  });

  await section('une question qui échoue', async () => {
    const doc = new Doc();
    const q = makeHooks({ answers: [new Error('fenêtre indisponible')] });
    const { run, log } = fresh(doc, { hooks: q });
    check('rien n\'est créé (jamais d\'accord supposé) et l\'échec se voit', (await attempt(run, 'Publipostage_Modeles')) === 'refusée' && doc.added().length === 0 && log.errors.length === 1, { added: doc.added(), errors: log.errors });
  });

  await section('sans question branchée', async () => {
    const doc = new Doc();
    const { run } = fresh(doc);
    check('un module essayé seul crée sa table comme avant', (await attempt(run, 'Publipostage_Modeles')) === 'créée' && same(doc.added(), ['Publipostage_Modeles']), doc.added());
  });

  await section('une table déjà là', async () => {
    const doc = new Doc(['Publipostage_Modeles']);
    const q = makeHooks();
    const { run } = fresh(doc, { hooks: q });
    check('rien à créer, rien à demander', (await attempt(run, 'Publipostage_Modeles')) === 'déjà là' && q.asked === 0, q.asked);
  });

  // === ce que les modules du widget en font ===
  await section('démarrage : règles de liaison et identité sans table', async () => {
    const doc = new Doc(['Missions']);
    const q = makeHooks({ answers: [false] });
    const { run, log } = fresh(doc, { hooks: q });
    await run('GristAPI.init()');
    check('init() : les règles de liaison ne créent rien et ne lisent rien, sans erreur ni avertissement de lecture', doc.added().length === 0 && log.errors.length === 0 && !log.warnings.some((w) => /loadLinkRules/.test(w)), { added: doc.added(), errors: log.errors, warnings: log.warnings });
    check('init() : une seule question', q.asked === 1, q.asked);
    check('aucune règle de liaison', run('GristAPI.getAllLinkRules().length') === 0, '');
    let declined = null;
    try { await run('GristAPI.getCurrentUserEmail()'); } catch (e) { declined = run('GristAPI.isTablesDeclined')(e); }
    check('l\'identité de la personne : refusée sans bruit (sans geste, aucune question)', declined === true && q.asked === 1 && log.errors.length === 0, { declined, asked: q.asked, errors: log.errors });
    q.gestures++;
    q.hooks.ask = async () => { q.asked++; return false; };
    try { await run('GristAPI.getCurrentUserEmail()'); } catch (e) { declined = run('GristAPI.isTablesDeclined')(e); }
    check('après un geste, l\'identité repose la question', q.asked === 2 && declined === true, q.asked);
    let saved = null;
    q.gestures++;
    try { await run("GristAPI.saveLinkRule('Missions', { mode: 'singleton' })"); } catch (e) { saved = run('GristAPI.isTablesDeclined')(e); }
    check('enregistrer une règle de liaison : refusée par la même erreur, aucune écriture', saved === true && doc.journal.length === 0, { saved, journal: doc.journal });
  });

  await section('Templates : liste vide sans erreur, Enregistrer le dit', async () => {
    const doc = new Doc(['Missions']);
    const q = makeHooks({ answers: [false, false] });
    const { run, log } = fresh(doc, { hooks: q, scripts: ['js/templates.js'] });
    // js/templates.js lit HtmlSanitize au moment d'analyser une ligne : aucune ligne ici.
    const list = await run('Templates.loadAll()');
    check('loadAll() : liste vide, rien créé, aucune erreur', Array.isArray(list) && list.length === 0 && doc.added().length === 0 && log.errors.length === 0, { list, added: doc.added(), errors: log.errors });
    check('loadAll() : une seule question', q.asked === 1, q.asked);
    await run('Templates.loadAll()');
    check('loadAll() une seconde fois (enregistrement automatique, relecture) : aucune nouvelle question', q.asked === 1, q.asked);
    q.gestures++;
    let declined = null;
    try { await run("Templates.save(null, 'Contrat', '<p>x</p>', '', null, null)"); } catch (e) { declined = run('GristAPI.isTablesDeclined')(e); }
    check('save() après un geste : la question est reposée, le refus arrête l\'enregistrement sans écrire ni journaliser', declined === true && q.asked === 2 && doc.journal.length === 0 && log.errors.length === 0, { declined, asked: q.asked, journal: doc.journal, errors: log.errors });
    q.hooks.ask = async () => { q.asked++; return true; };
    q.gestures++;
    let saved = null;
    try { saved = await run("Templates.save(null, 'Contrat', '<p>x</p>', '', null, null)"); } catch (e) { saved = 'erreur : ' + e.message; }
    check('save() après un « oui » : la table est créée et la ligne écrite', same(doc.added(), ['Publipostage_Modeles']) && doc.journal.some((a) => a[0] === 'AddRecord'), { saved, journal: doc.journal.map((a) => a[0] + ' ' + a[1]) });
    check('un « oui » : plus aucune question ensuite', q.asked === 3, q.asked);
  });

  await section('Préférences de rangement sans table', async () => {
    const doc = new Doc(['Missions']);
    const q = makeHooks({ answers: [false] });
    const { run, log } = fresh(doc, { hooks: q, scripts: ['js/template-preferences.js'] });
    const cache = await run('TemplatePreferences.loadForCurrentUser()');
    check('préférences : lecture vide, sans création ni erreur', same(cache, {}) && doc.added().length === 0 && log.errors.length === 0, { added: doc.added(), errors: log.errors });
    q.gestures++;
    q.hooks.ask = async () => { q.asked++; return false; };
    let declined = null;
    try { await run('TemplatePreferences.setPinned(3, true)'); } catch (e) { declined = run('GristAPI.isTablesDeclined')(e); }
    check('épingler : la même erreur de refus, rien d\'écrit', declined === true && doc.journal.length === 0 && log.errors.length === 0, { declined, journal: doc.journal, errors: log.errors });
  });
}

await main();
summarizeAndExit();
