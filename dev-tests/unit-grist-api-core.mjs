#!/usr/bin/env node
// Tests purs (sans navigateur) du cœur de js/grist-api.js - cf. dev-tests/unit-harness.mjs pour le contexte général :
//  - ensureTable et createWriteQueue, que les modules du widget (modèles, commentaires, préférences, abréviations, formats de page) prennent au lieu de leurs copies ;
//  - init : les deux souscriptions onRecord (« shown » en repli, « normal » dès qu'elle a livré), les options, le lien « Sélectionner par » et le niveau d'accès ;
//  - detectTableId : mappings, grist.getTable(), puis les clés de la ligne courante ;
//  - refreshColumnTypes : types, choix, colonnes d'aide d'affichage et colonnes montrées des Références, tirés des métadonnées.
// Lancer : node dev-tests/unit-grist-api-core.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = () => sleep(5);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Faux document : des tables (colonnes ordonnées, lignes), des métadonnées que le test peut remplacer, un journal des actions. `failAddTable` : le prochain AddTable échoue.
class Doc {
  constructor({ tables = {}, meta = null } = {}) {
    this.tables = {};
    Object.keys(tables).forEach((id) => { this.tables[id] = { cols: tables[id], rows: [] }; });
    this.meta = meta;
    this.journal = [];
    this.listCalls = 0;
    this.failAddTable = false;
    this.failMeta = false;
  }

  async listTables() { this.listCalls++; return Object.keys(this.tables); }

  async fetchTable(name) {
    if (name === '_grist_Tables' || name === '_grist_Tables_column') {
      if (this.failMeta) throw new Error('métadonnées illisibles (test)');
      return this.meta ? this.meta[name === '_grist_Tables' ? 'tables' : 'columns'] : this.defaultMeta(name);
    }
    const t = this.tables[name];
    if (!t) throw new Error('Invalid table ' + name);
    const out = { id: t.rows.map((r) => r.id) };
    Object.keys(t.cols).forEach((c) => { out[c] = t.rows.map((r) => r[c]); });
    return out;
  }

  // Métadonnées tirées des tables du faux document, dans l'ordre de leur création.
  defaultMeta(name) {
    const ids = Object.keys(this.tables);
    if (name === '_grist_Tables') return { id: ids.map((_, i) => i + 1), tableId: ids.slice() };
    const out = { id: [], parentId: [], colId: [], type: [], widgetOptions: [], displayCol: [], visibleCol: [], parentPos: [] };
    let rowId = 1;
    ids.forEach((id, tIdx) => {
      Object.keys(this.tables[id].cols).forEach((colId, i) => {
        out.id.push(rowId++); out.parentId.push(tIdx + 1); out.colId.push(colId); out.type.push(this.tables[id].cols[colId]);
        out.widgetOptions.push(''); out.displayCol.push(0); out.visibleCol.push(0); out.parentPos.push(i + 1);
      });
    });
    return out;
  }

  async applyUserActions(actions) {
    const retValues = [];
    for (const action of actions) {
      this.journal.push(action);
      if (action[0] === 'AddTable') {
        if (this.failAddTable) { this.failAddTable = false; throw new Error('AddTable refusé (test)'); }
        const cols = {};
        action[2].forEach((c) => { cols[c.id] = c.type; });
        this.tables[action[1]] = { cols, rows: [] };
        retValues.push(null);
      } else {
        throw new Error('Doc : action non supportée ' + action[0]);
      }
    }
    return { retValues };
  }

  actions(type) { return this.journal.filter((a) => a[0] === type); }
}

// Un contexte par scénario : GristAPI garde un état module-niveau (schéma, enregistrement, ligne courante) qui ne doit pas fuiter d'un scénario à l'autre,
// exactement comme un rechargement de page. `grist` est un faux qui garde ce que le widget lui a demandé.
function fresh(doc, { gristExtra = {}, withPageTree = true } = {}) {
  const log = { ready: [], records: [], optionsCallbacks: [], warnings: [], errors: [], pages: [] };
  const grist = Object.assign({
    ready: (options) => log.ready.push(options),
    onRecord: (cb, options) => log.records.push({ cb, options }),
    onOptions: (cb) => log.optionsCallbacks.push(cb),
    async getOptions() { return null; },
    docApi: doc,
  }, gristExtra);
  const globals = {
    grist,
    console: { log() {}, warn: (...a) => log.warnings.push(a.join(' ')), error: (...a) => log.errors.push(a.join(' ')) },
    setTimeout,
  };
  if (withPageTree) globals.PageTree = { afterTableCreated: (name) => log.pages.push(name) };
  const ctx = createContext(globals);
  loadScript(ctx, 'js/grist-api.js');
  return { run: (expr) => evalIn(ctx, expr), log, ctx };
}

const TWO_TABLES = { Missions: { Reference: 'Text', Titre: 'Text', Personne: 'Ref:Personnes' }, Personnes: { Nom: 'Text', Email: 'Text' } };
const LINKS = { Publipostage_LiensTables: { TableCible: 'Text', Mode: 'Text', ColonneCible: 'Text', ColonneSource: 'Text' } };
const fullDoc = () => new Doc({ tables: Object.assign({}, TWO_TABLES, LINKS) });

async function section(label, work) {
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, e && e.message); }
}

async function main() {
  // === ensureTable ===
  await section('ensureTable', async () => {
    const doc = new Doc();
    const { run, log } = fresh(doc);
    const columns = [{ id: 'Nom', type: 'Text' }, { id: 'Largeur', type: 'Numeric' }];
    const created = await run(`GristAPI.ensureTable('Publipostage_Test', ${JSON.stringify(columns)})`);
    check('table absente : créée avec les colonnes demandées', created === true && same(doc.actions('AddTable'), [['AddTable', 'Publipostage_Test', columns]]), JSON.stringify(doc.journal));
    check('table absente : sa page est rangée, une fois', same(log.pages, ['Publipostage_Test']), JSON.stringify(log.pages));
    const again = await run(`GristAPI.ensureTable('Publipostage_Test', ${JSON.stringify(columns)})`);
    check('table présente : rien n\'est recréé', again === false && doc.actions('AddTable').length === 1 && log.pages.length === 1);
    check('la liste des tables est relue à neuf à chaque appel', doc.listCalls === 2, doc.listCalls);
  });

  await section('ensureTable créée ailleurs', async () => {
    const doc = new Doc();
    const { run } = fresh(doc);
    await run(`GristAPI.ensureTable('Publipostage_Test', [])`);
    doc.tables.Publipostage_Autre = { cols: {}, rows: [] }; // une autre fenêtre crée sa table entre-temps
    await run(`GristAPI.ensureTable('Publipostage_Autre', [])`);
    check('table créée par une autre fenêtre depuis la dernière lecture : jamais doublée', doc.actions('AddTable').length === 1, JSON.stringify(doc.journal));
  });

  await section('ensureTable refusée', async () => {
    const doc = new Doc();
    doc.failAddTable = true;
    const { run, log } = fresh(doc);
    let message = null;
    try { await run(`GristAPI.ensureTable('Publipostage_Test', [])`); } catch (e) { message = e.message; }
    check('AddTable refusé : l\'erreur remonte à l\'appelant', message === 'AddTable refusé (test)', message);
    check('AddTable refusé : aucune page rangée', log.pages.length === 0);
    check('AddTable refusé : l\'appel suivant retente', (await run(`GristAPI.ensureTable('Publipostage_Test', [])`)) === true && doc.actions('AddTable').length === 2);
  });

  await section('ensureTable sans PageTree', async () => {
    const doc = new Doc();
    const { run } = fresh(doc, { withPageTree: false });
    check('sans js/page-tree.js : la table est créée quand même', (await run(`GristAPI.ensureTable('Publipostage_Test', [])`)) === true);
  });

  await section('table des liens', async () => {
    const doc = new Doc({ tables: TWO_TABLES });
    const { run, log } = fresh(doc);
    await run('GristAPI.init()');
    const added = doc.actions('AddTable');
    check('init : la table des liens est créée, une fois, avec ses quatre colonnes',
      added.length === 1 && added[0][1] === 'Publipostage_LiensTables' && same(added[0][2].map((c) => c.id), ['TableCible', 'Mode', 'ColonneCible', 'ColonneSource']), JSON.stringify(added));
    check('init : sa page est rangée', same(log.pages, ['Publipostage_LiensTables']), JSON.stringify(log.pages));
    await run('GristAPI.refreshSchema()');
    check('une relecture du schéma ne recrée pas la table des liens, qui reste cachée de la liste des tables', doc.actions('AddTable').length === 1 && same(await run('GristAPI.getTables()'), ['Missions', 'Personnes']), JSON.stringify(await run('GristAPI.getTables()')));
  });

  await section('table des liens refusée', async () => {
    const doc = new Doc({ tables: TWO_TABLES });
    doc.failAddTable = true;
    const { run, log } = fresh(doc);
    await run('GristAPI.init()');
    check('AddTable refusé : init se termine quand même, l\'erreur est consignée', log.errors.some((m) => m.includes('Erreur création table de liaison')), JSON.stringify(log.errors));
    check('AddTable refusé : aucune page rangée', log.pages.length === 0);
  });

  // === createWriteQueue ===
  await section('createWriteQueue', async () => {
    const { run } = fresh(new Doc());
    const events = await run(`(async () => {
      const queue = GristAPI.createWriteQueue();
      const events = [];
      const job = (name, ms) => async () => { events.push('début ' + name); await new Promise(r => setTimeout(r, ms)); events.push('fin ' + name); return name; };
      const results = await Promise.all([queue.enqueue(job('A', 20)), queue.enqueue(job('B', 0)), queue.enqueue(job('C', 5))]);
      return { events, results };
    })()`);
    check('les tâches passent l\'une après l\'autre, dans l\'ordre', same(events.events, ['début A', 'fin A', 'début B', 'fin B', 'début C', 'fin C']) && same(events.results, ['A', 'B', 'C']), JSON.stringify(events));

    const failure = await run(`(async () => {
      const queue = GristAPI.createWriteQueue();
      const first = queue.enqueue(async () => { throw new Error('échec A'); });
      const second = queue.enqueue(async () => 'B');
      let message = null;
      try { await first; } catch (e) { message = e.message; }
      return { message, second: await second };
    })()`);
    check('l\'échec d\'une tâche remonte à son appelant seulement : la suivante s\'exécute', failure.message === 'échec A' && failure.second === 'B', JSON.stringify(failure));

    const reset = await run(`(async () => {
      const queue = GristAPI.createWriteQueue();
      queue.enqueue(() => new Promise(() => {})); // une tâche qui ne finit jamais
      queue.reset();
      return Promise.race([queue.enqueue(async () => 'repartie'), new Promise(r => setTimeout(() => r('bloquée'), 50))]);
    })()`);
    check('reset repart d\'une file vide : la tâche suivante n\'attend pas celle d\'avant', reset === 'repartie', reset);

    const separate = await run(`(async () => {
      const a = GristAPI.createWriteQueue(), b = GristAPI.createWriteQueue();
      a.enqueue(() => new Promise(() => {}));
      return Promise.race([b.enqueue(async () => 'libre'), new Promise(r => setTimeout(() => r('bloquée'), 50))]);
    })()`);
    check('deux files sont indépendantes', separate === 'libre', separate);
  });

  // === init : souscriptions, options, lien, accès ===
  await section('init', async () => {
    const { run, log } = fresh(fullDoc());
    await run('GristAPI.init()');
    check('init : Grist est prêt avec l\'accès complet', same(log.ready, [{ requiredAccess: 'full' }]), JSON.stringify(log.ready));
    check('init : deux souscriptions onRecord, « shown » puis « normal »', same(log.records.map((r) => r.options), [{ includeColumns: 'shown' }, { includeColumns: 'normal' }]), JSON.stringify(log.records.map((r) => r.options)));
    check('init : une souscription aux options', log.optionsCallbacks.length === 1);

    const [shown, normal] = log.records.map((r) => r.cb);
    const seen = [];
    run('GristAPI.onRecord').call(null, (record, tableId, mappings) => seen.push({ record, tableId, mappings }));
    shown({ id: 1, A: 'a' }, null);
    await flush();
    check('le repli « shown » donne la ligne tant que « normal » n\'a rien livré', same(await run('GristAPI.getCurrentRecord()'), { id: 1, A: 'a' }));
    normal({ id: 2, A: 'a', B: 'b' }, { tableId: ' Missions ' });
    await flush();
    check('« normal » prend la main : ligne enrichie, table donnée par mappings (sans espaces)', same(await run('GristAPI.getCurrentRecord()'), { id: 2, A: 'a', B: 'b' }) && (await run('GristAPI.getCurrentTableId()')) === 'Missions');
    shown({ id: 3 }, null);
    check('« shown » est ignoré une fois que « normal » a livré', same(await run('GristAPI.getCurrentRecord()'), { id: 2, A: 'a', B: 'b' }));
    check('les abonnés reçoivent (ligne, table, mappings) à chaque ligne livrée', seen.length === 2 && seen[1].tableId === 'Missions' && same(seen[1].mappings, { tableId: ' Missions ' }), JSON.stringify(seen.map((s) => s.tableId)));
  });

  await section('init : abonné qui lève', async () => {
    const { run, log } = fresh(fullDoc());
    await run('GristAPI.init()');
    await run('(() => { GristAPI.onRecord(() => { throw new Error("abonné 1"); }); GristAPI.onRecord((r) => globalThis.__seen = r); })()');
    log.records[1].cb({ id: 5 }, null);
    await flush();
    check('un abonné onRecord qui lève n\'empêche pas le suivant, l\'erreur est consignée', (await run('globalThis.__seen')).id === 5 && log.errors.some((m) => m.includes('erreur callback onRecord')), JSON.stringify(log.errors));
  });

  await section('options', async () => {
    const { run, log } = fresh(fullDoc());
    await run('GristAPI.init()');
    const options = log.optionsCallbacks[0];
    await run(`(() => {
      globalThis.__events = [];
      GristAPI.onLinkStateChange(v => __events.push('lien:' + v));
      GristAPI.onAccessLevelChange(v => __events.push('accès:' + v));
      GristAPI.onWidgetOptionsChange(v => __events.push('options:' + JSON.stringify(v)));
    })()`);
    check('avant tout : lien inconnu, accès inconnu, options vides', (await run('GristAPI.getLinkState()')) === 'unknown' && (await run('GristAPI.getAccessLevel()')) === null && (await run('GristAPI.getWidgetOptions()')) === null);
    options({ k: 1 }, { accessLevel: 'full', linking: { asTarget: 'Cursor:Same-Table' } });
    check('premières options : états posés avant tout rappel', (await run('GristAPI.getLinkState()')) === 'linked' && (await run('GristAPI.getAccessLevel()')) === 'full' && same(await run('GristAPI.getWidgetOptions()'), { k: 1 }));
    check('premières options : les trois abonnés sont prévenus', same(await run('__events'), ['lien:linked', 'accès:full', 'options:{"k":1}']), JSON.stringify(await run('__events')));
    options({ k: 2 }, { accessLevel: 'full', linking: { asTarget: 'Cursor:Same-Table' } });
    check('mêmes états : seuls les abonnés des options sont prévenus', same((await run('__events')).slice(3), ['options:{"k":2}']), JSON.stringify((await run('__events')).slice(3)));
    options(null, { accessLevel: 'none', linking: { asTarget: null } });
    check('lien vidé et accès retiré : états et abonnés suivent', (await run('GristAPI.getLinkState()')) === 'unlinked' && (await run('GristAPI.getAccessLevel()')) === 'none' && same((await run('__events')).slice(4), ['lien:unlinked', 'accès:none', 'options:null']), JSON.stringify((await run('__events')).slice(4)));
    options({}, {});
    check('options sans réglages : lien inconnu, accès inconnu', (await run('GristAPI.getLinkState()')) === 'unknown' && (await run('GristAPI.getAccessLevel()')) === null);
    options({}, { linking: { asTarget: '' } });
    check('type de lien vide : lien inconnu', (await run('GristAPI.getLinkState()')) === 'unknown');
  });

  await section('options : abonné qui lève', async () => {
    const { run, log } = fresh(fullDoc());
    await run('GristAPI.init()');
    await run(`(() => {
      globalThis.__got = [];
      GristAPI.onLinkStateChange(() => { throw new Error('abonné du lien'); });
      GristAPI.onAccessLevelChange(v => __got.push('accès:' + v));
      GristAPI.onWidgetOptionsChange(() => __got.push('options'));
    })()`);
    log.optionsCallbacks[0]({ a: 1 }, { accessLevel: 'full', linking: { asTarget: 'Cursor:Same-Table' } });
    check('un abonné du lien qui lève n\'empêche ni l\'accès ni les options', same(await run('__got'), ['accès:full', 'options']) && log.errors.some((m) => m.includes('erreur callback onLinkStateChange')), JSON.stringify({ got: await run('__got'), errors: log.errors }));
  });

  await section('accès limité', async () => {
    const { run, log } = fresh(fullDoc());
    await run('GristAPI.init()');
    log.optionsCallbacks[0]({}, { accessLevel: 'read table' });
    log.optionsCallbacks[0]({}, { accessLevel: 'none' });
    const warnings = log.warnings.filter((m) => m.includes('pas "full"'));
    check('accès autre que « full » : un seul avertissement, qui dit le niveau accordé', warnings.length === 1 && warnings[0].includes('"read table"'), JSON.stringify(warnings));
    const full = fresh(fullDoc());
    await full.run('GristAPI.init()');
    full.log.optionsCallbacks[0]({}, { accessLevel: 'full' });
    check('accès « full » : aucun avertissement', !full.log.warnings.some((m) => m.includes('pas "full"')));
  });

  await section('options de départ', async () => {
    const { run } = fresh(fullDoc(), { gristExtra: { getOptions: async () => ({ graine: true }) } });
    await run('GristAPI.init()');
    check('init lit les options du widget au départ', same(await run('GristAPI.getWidgetOptions()'), { graine: true }));
    const failing = fresh(fullDoc(), { gristExtra: { getOptions: async () => { throw new Error('indisponible'); } } });
    await failing.run('GristAPI.init()');
    check('getOptions qui échoue : init se termine, avertissement consigné', (await failing.run('GristAPI.getWidgetOptions()')) === null && failing.log.warnings.some((m) => m.includes('getOptions indisponible')), JSON.stringify(failing.log.warnings));
  });

  await section('init sans onOptions', async () => {
    const { run, log } = fresh(fullDoc(), { gristExtra: { onOptions() { throw new Error('absent'); } } });
    await run('GristAPI.init()');
    check('onOptions indisponible : init se termine, avertissement consigné', log.warnings.some((m) => m.includes('onOptions non disponible')), JSON.stringify(log.warnings));
  });

  await section('ready qui échoue', async () => {
    const { run, log } = fresh(fullDoc(), { gristExtra: { ready() { throw new Error('ready impossible'); } } });
    let message = null;
    try { await run('GristAPI.init()'); } catch (e) { message = e.message; }
    check('grist.ready qui lève : init relève l\'erreur et ne s\'abonne à rien', message === 'ready impossible' && log.records.length === 0 && log.optionsCallbacks.length === 0, message);
  });

  await section('schéma à l\'ouverture', async () => {
    const { run } = fresh(fullDoc());
    await run('GristAPI.init()');
    check('init : tables du document sans les tables du widget, colonnes tirées des métadonnées', same(await run('GristAPI.getTables()'), ['Missions', 'Personnes']) && same(await run('GristAPI.getColumns("Missions")'), ['Reference', 'Titre', 'Personne']));
    check('init : la règle de liaison manquante donne null', (await run('GristAPI.getLinkRule("Personnes")')) === null);
  });

  // === detectTableId ===
  await section('detectTableId', async () => {
    const detect = async (mappings, gristExtra, setup) => {
      const env = fresh(fullDoc(), { gristExtra });
      if (setup) await setup(env);
      const id = await env.run(`GristAPI.detectTableId(${JSON.stringify(mappings)}, 'test')`);
      return { id, warnings: env.log.warnings };
    };
    check('mappings.tableId : rendu sans espaces', (await detect({ tableId: '  Missions ' })).id === 'Missions');
    check('mappings.tableId vide : on passe à grist.getTable()', (await detect({ tableId: '' }, { getTable: async () => ({ getTableId: async () => 'Personnes' }) })).id === 'Personnes');
    check('mappings absent : on passe à grist.getTable()', (await detect(null, { getTable: async () => ({ getTableId: async () => 'Personnes' }) })).id === 'Personnes');
    check('getTable : propriété tableId quand getTableId() ne dit rien', (await detect(null, { getTable: async () => ({ getTableId: async () => '', tableId: 'Missions' }) })).id === 'Missions');
    check('getTable : propriété tableId sans getTableId', (await detect(null, { getTable: async () => ({ tableId: 'Missions' }) })).id === 'Missions');
    check('getTable : repli sur id, tableRef puis name (rendus en texte)', (await detect(null, { getTable: async () => ({ id: 7 }) })).id === '7' && (await detect(null, { getTable: async () => ({ tableRef: 'R' }) })).id === 'R' && (await detect(null, { getTable: async () => ({ name: 'N' }) })).id === 'N');
    const failing = await detect(null, { getTable: async () => { throw new Error('getTable impossible'); } });
    check('getTable qui échoue : avertissement, puis aucune source', failing.id === null && failing.warnings.some((m) => m.includes('échec grist.getTable')) && failing.warnings.some((m) => m.includes('aucune source de tableId')), JSON.stringify(failing));
    const none = await detect(null, { getTable: async () => ({}) });
    check('getTable sans rien d\'utile et pas de ligne : aucune source', none.id === null && none.warnings.some((m) => m.includes('aucune source de tableId')));

    const fromRecord = async (record) => {
      const env = fresh(fullDoc());
      await env.run('GristAPI.init()');
      env.log.records[1].cb(record, null);
      await flush();
      return env.run('GristAPI.getCurrentTableId()');
    };
    check('ligne courante : la table dont une colonne est une clé de la ligne', (await fromRecord({ id: 1, Nom: 'Ada' })) === 'Personnes' && (await fromRecord({ id: 1, Titre: 'M' })) === 'Missions');
    check('ligne courante sans clé connue : aucune table', (await fromRecord({ id: 1, Inconnue: 'x' })) === null);
  });

  // === refreshColumnTypes ===
  await section('refreshColumnTypes', async () => {
    const cols = [
      // [id, table, colId, type, widgetOptions, displayCol, visibleCol]
      [1, 1, 'Titre', 'Text', '', 0, 0],
      [2, 1, 'Statut', 'Choice', '{"choices":["Ouvert","Fermé"]}', 0, 0],
      [3, 1, 'Tags', 'ChoiceList', '{"choices":["a","b"],"autre":1}', 0, 0],
      [4, 1, 'Casse', 'Choice', '{pas du json', 0, 0],
      [5, 1, 'SansChoix', 'Choice', '{"widget":"TextBox"}', 0, 0],
      [6, 1, 'Personne', 'Ref:Personnes', '', 7, 10],
      [7, 1, 'gristHelper_Display', 'Any', '', 0, 0],
      [8, 1, 'Equipe', 'RefList:Personnes', '', 9, 11],
      [9, 1, 'gristHelper_Display2', 'Any', '', 0, 0],
      [10, 2, 'Nom', 'Text', '', 0, 0],
      [11, 2, 'Naissance', 'Date', '', 0, 0],
      [12, 2, 'Chef', 'Ref:Personnes', '', 0, 0],
      [13, 2, 'Soi', 'Ref:Personnes', '', 13, 10],
      [14, 99, 'Orpheline', 'Text', '', 0, 0],
      [15, 2, 'Age', 'Numeric', '', 0, 0],
      [16, 1, 'Responsable', 'Ref:Personnes', '', 0, 15],
    ];
    const column = (i) => cols.map((c) => c[i]);
    const meta = {
      tables: { id: [1, 2], tableId: ['Missions', 'Personnes'] },
      columns: { id: column(0), parentId: column(1), colId: column(2), type: column(3), widgetOptions: column(4), displayCol: column(5), visibleCol: column(6), parentPos: cols.map((_, i) => i + 1) },
    };
    const doc = new Doc({ tables: TWO_TABLES, meta });
    const { run, log } = fresh(doc);
    await run('GristAPI.refreshColumnTypes()');
    check('types : chaque colonne a le sien, la colonne d\'une table inconnue est écartée', (await run('GristAPI.getColumnType("Missions", "Statut")')) === 'Choice' && (await run('GristAPI.getColumnType("Missions", "Personne")')) === 'Ref:Personnes'
      && (await run('GristAPI.getColumnType("Personnes", "Nom")')) === 'Text' && (await run('GristAPI.getColumnType("Missions", "Orpheline")')) === null && (await run('GristAPI.getColumnType("Missions", "Absente")')) === null);
    check('types : un chemin « Référence.Colonne » a le type de sa dernière colonne', (await run('GristAPI.getColumnType("Missions", "Personne.Nom")')) === 'Text');
    check('choix : tableau « choices » de widgetOptions (Choice et ChoiceList)', same(await run('GristAPI.getColumnChoices("Missions", "Statut")'), ['Ouvert', 'Fermé']) && same(await run('GristAPI.getColumnChoices("Missions", "Tags")'), ['a', 'b']));
    check('choix : widgetOptions mal formé, sans « choices » ou vide : aucun choix, sans échec', (await run('GristAPI.getColumnChoices("Missions", "Casse")')) === null && (await run('GristAPI.getColumnChoices("Missions", "SansChoix")')) === null && (await run('GristAPI.getColumnChoices("Missions", "Titre")')) === null
      && !log.warnings.some((m) => m.includes('refreshColumnTypes')));
    check('colonne d\'aide : celle que Grist calcule pour la Référence et la liste de références', (await run('GristAPI.getDisplayColumn("Missions", "Personne")')) === 'gristHelper_Display' && (await run('GristAPI.getDisplayColumn("Missions", "Equipe")')) === 'gristHelper_Display2');
    check('colonne d\'aide : aucune quand la colonne s\'affiche elle-même (0 ou elle-même)', (await run('GristAPI.getDisplayColumn("Personnes", "Chef")')) === null && (await run('GristAPI.getDisplayColumn("Personnes", "Soi")')) === null && (await run('GristAPI.getDisplayColumn("Missions", "Titre")')) === null);
    check('colonne montrée : celle de la table liée, texte ou nombre (Référence, puis Référence vers un nombre)', same(await run('GristAPI.getReferenceColumn("Missions", "Personne")'), { table: 'Personnes', column: 'Nom' })
      && same(await run('GristAPI.getReferenceColumn("Missions", "Responsable")'), { table: 'Personnes', column: 'Age' }) && same(await run('GristAPI.getReferenceColumn("Personnes", "Soi")'), { table: 'Personnes', column: 'Nom' }));
    check('colonne montrée : aucune pour une date, pour l\'id de la ligne (0), ni pour une colonne ordinaire', (await run('GristAPI.getReferenceColumn("Missions", "Equipe")')) === null && (await run('GristAPI.getReferenceColumn("Personnes", "Chef")')) === null && (await run('GristAPI.getReferenceColumn("Missions", "Titre")')) === null);

    doc.failMeta = true;
    await run('GristAPI.refreshColumnTypes()');
    check('métadonnées illisibles : avertissement, et les types connus restent', log.warnings.some((m) => m.includes('refreshColumnTypes: échec')) && (await run('GristAPI.getColumnType("Missions", "Statut")')) === 'Choice');
  });

  await section('métadonnées d\'un document sans displayCol ni visibleCol', async () => {
    const meta = {
      tables: { id: [1], tableId: ['Missions'] },
      columns: { id: [1, 2], parentId: [1, 1], colId: ['Titre', 'Personne'], type: ['Text', 'Ref:Personnes'], parentPos: [1, 2] },
    };
    const { run } = fresh(new Doc({ tables: TWO_TABLES, meta }));
    await run('GristAPI.refreshColumnTypes()');
    check('colonnes absentes des métadonnées (ancien Grist) : types lus, aucune aide ni colonne montrée, aucun choix', (await run('GristAPI.getColumnType("Missions", "Personne")')) === 'Ref:Personnes'
      && (await run('GristAPI.getDisplayColumn("Missions", "Personne")')) === null && (await run('GristAPI.getReferenceColumn("Missions", "Personne")')) === null && (await run('GristAPI.getColumnChoices("Missions", "Titre")')) === null);
  });

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
