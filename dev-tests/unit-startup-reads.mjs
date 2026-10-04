#!/usr/bin/env node
// Tests purs (sans navigateur) de ce que le widget lit dans le document Grist pendant son ouverture : js/templates.js (Templates.loadAll) et js/grist-api.js
// (GristAPI.init, GristAPI.refreshSchema) - cf. dev-tests/unit-harness.mjs pour le contexte général. Mesure d'ouverture du 2026-10-02 (Antoine : « délais trop
// longs à l'ouverture, diviser par 3 ») : sur un document type, le premier modèle ne s'affichait qu'après 18 appels Grist EN SÉRIE, dont sept lectures complètes
// de la table des modèles (une par migration de colonne) et une lecture complète de chaque table du document (seulement pour en lister les colonnes), refaite
// à l'affichage du modèle. Ici, sur un faux document qui compte ses lectures :
//  - Templates.loadAll lit la table des modèles UNE fois quand toutes ses colonnes sont là, et n'ajoute que les colonnes qui manquent ;
//  - GristAPI.init ne lit aucune table du document (colonnes tirées des métadonnées, provisoires) et ne fait que deux rangées d'appels ;
//  - GristAPI.refreshSchema rend les colonnes exactes (clés de fetchTable), une passe à la fois, et se contente d'une passe récente quand on le lui dit (rappel de js/main.js après l'ouverture) ;
//  - index.html lance Grist et la lecture des modèles avant les derniers scripts, js/main.js reprend ces promesses.
// Lancer : node dev-tests/unit-startup-reads.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Faux document : des tables à colonnes ordonnées, les métadonnées que Grist en tire (_grist_Tables, _grist_Tables_column, avec manualSort et parentPos), un journal
// des appels. `depth` d'un appel = 1 + la plus grande profondeur des appels TERMINÉS quand il part : deux appels lancés ensemble ont la même profondeur, un appel
// lancé à la réponse d'un autre en a une de plus - la longueur de la chaîne d'aller-retour que l'ouverture attend.
class StartupDoc {
  constructor({ latencyMs = 0 } = {}) {
    this.latencyMs = latencyMs;
    this.tables = {};
    this.nextId = 1;
    this.completedDepth = 0;
    this.resetLog();
    this.actions = [];
  }

  resetLog() {
    this.log = [];
    this.maxDepth = 0;
    this.completedDepth = 0;
  }

  // cols : { colId: type } dans l'ordre de création ; `pos` (facultatif) : { colId: parentPos } pour une position différente de l'ordre de création.
  addTable(id, cols, rows = [], pos = {}) {
    const names = ['manualSort'].concat(Object.keys(cols));
    this.tables[id] = { names, types: Object.assign({ manualSort: 'ManualSortPos' }, cols), pos: Object.assign({ manualSort: 0 }, pos), rows: [], metaHidden: [] };
    rows.forEach((row) => this.addRow(id, row));
  }

  addRow(id, row) {
    const t = this.tables[id];
    const full = Object.assign({ id: this.nextId++, manualSort: this.nextId }, row);
    t.rows.push(full);
    return full.id;
  }

  readsOf(table) { return this.log.filter((c) => c.name === 'fetchTable' && c.arg === table).length; }
  userTableReads(userTables) { return this.log.filter((c) => c.name === 'fetchTable' && userTables.includes(c.arg)).length; }

  async _call(name, arg, run) {
    const depth = this.completedDepth + 1;
    this.maxDepth = Math.max(this.maxDepth, depth);
    this.log.push({ name, arg, depth });
    const result = run(); // le serveur lit (ou écrit) à la demande : un changement fait pendant le trajet de la réponse n'y est pas
    if (this.latencyMs) await sleep(this.latencyMs);
    this.completedDepth = Math.max(this.completedDepth, depth);
    return result;
  }

  listTables() {
    return this._call('listTables', '', () => Object.keys(this.tables));
  }

  fetchTable(table) {
    return this._call('fetchTable', table, () => {
      if (table === '_grist_Tables') {
        const ids = Object.keys(this.tables);
        return { id: ids.map((_, i) => i + 1), tableId: ids.slice(), primaryViewId: ids.map(() => 0) };
      }
      if (table === '_grist_Tables_column') {
        const out = { id: [], parentId: [], colId: [], type: [], widgetOptions: [], displayCol: [], visibleCol: [], parentPos: [] };
        let rowId = 1;
        Object.keys(this.tables).forEach((id, tIdx) => {
          const t = this.tables[id];
          t.names.forEach((colId, i) => {
            if (t.metaHidden.includes(colId)) return; // une colonne de la table que les métadonnées ne montrent pas (accès restreint)
            out.id.push(rowId++); out.parentId.push(tIdx + 1); out.colId.push(colId); out.type.push(t.types[colId]);
            out.widgetOptions.push(''); out.displayCol.push(0); out.visibleCol.push(0);
            out.parentPos.push(t.pos[colId] !== undefined ? t.pos[colId] : i + 1);
          });
        });
        return out;
      }
      const t = this.tables[table];
      if (!t) throw new Error('Invalid table ' + table);
      const out = { id: t.rows.map((r) => r.id) };
      t.names.forEach((colId) => { out[colId] = t.rows.map((r) => (r[colId] === undefined ? null : r[colId])); });
      return out;
    });
  }

  applyUserActions(actions) {
    return this._call('applyUserActions', actions.map((a) => a[0] + ':' + a[1] + (a[0] === 'AddVisibleColumn' ? ':' + a[2] : '')).join(','), () => {
      const retValues = [];
      for (const action of actions) {
        this.actions.push(action);
        const [type, table] = action;
        if (type === 'AddTable') {
          const cols = {};
          action[2].forEach((c) => { cols[c.id] = c.type; });
          this.addTable(table, cols);
          retValues.push(null);
        } else if (type === 'AddVisibleColumn') {
          const t = this.tables[table];
          if (t.names.includes(action[2])) throw new Error('colonne déjà présente ' + table + '.' + action[2] + ' (un vrai Grist la renommerait)');
          t.names.push(action[2]);
          t.types[action[2]] = action[3].type;
          retValues.push({ colId: action[2] });
        } else if (type === 'AddRecord') {
          retValues.push(this.addRow(table, action[3]));
        } else if (type === 'UpdateRecord') {
          Object.assign(this.tables[table].rows.find((r) => r.id === action[2]), action[3]);
          retValues.push(null);
        } else if (type === 'RemoveRecord') {
          this.tables[table].rows = this.tables[table].rows.filter((r) => r.id !== action[2]);
          retValues.push(null);
        } else {
          throw new Error('StartupDoc : action non supportée ' + type);
        }
      }
      return { retValues };
    });
  }
}

const MODELES_FULL = {
  Nom: 'Text', Contenu: 'Text', NomFichierPDF: 'Text', DateModif: 'DateTime', HeaderFooter: 'Text', EstParDefaut: 'Bool', Margins: 'Text',
  TypeModele: 'Text', Destinataires: 'Text', Cc: 'Text', Cci: 'Text', Objet: 'Text', SuiviModifications: 'Text',
};
const USER_TABLES = ['Missions', 'Personnes'];

// Un document « type » : deux tables à lire seulement pour leurs colonnes, la table des modèles (complète ou amputée de `without`), celle des liens.
function makeDoc({ latencyMs = 0, without = [], modeles = true, rows = 2 } = {}) {
  const doc = new StartupDoc({ latencyMs });
  // Missions : l'ordre de création (Reference, Titre, Personne) n'est PAS l'ordre des positions (Personne en premier) - le piège de l'ordre des colonnes.
  doc.addTable('Missions', { Reference: 'Text', Titre: 'Text', Personne: 'Ref:Personnes' }, [{ Reference: 'M1', Titre: 'Mission 1', Personne: 1 }], { Reference: 2, Titre: 3, Personne: 1 });
  doc.addTable('Personnes', { Nom: 'Text', Email: 'Text' }, [{ Nom: 'Ada', Email: 'ada@exemple.fr' }]);
  if (modeles) {
    const cols = Object.assign({}, MODELES_FULL);
    without.forEach((c) => { delete cols[c]; });
    doc.addTable('Publipostage_Modeles', cols);
    for (let i = 1; i <= rows; i++) doc.addRow('Publipostage_Modeles', { Nom: 'Modèle ' + i, Contenu: '<p>Texte ' + i + '</p>', EstParDefaut: i === 1 });
  }
  doc.addTable('Publipostage_LiensTables', { TableCible: 'Text', Mode: 'Text', ColonneCible: 'Text', ColonneSource: 'Text' },
    [{ TableCible: 'Personnes', Mode: 'match', ColonneCible: 'id', ColonneSource: 'Personne' }]);
  doc.resetLog();
  return doc;
}

// Un contexte par scénario : GristAPI et Templates gardent un état module-niveau (schéma, lectures en cours, migrations déjà faites) qui ne doit pas fuiter d'un
// scénario à l'autre, exactement comme un rechargement de page.
function fresh(doc, { scripts = ['js/grist-api.js', 'js/templates.js'] } = {}) {
  const clock = { now: 1700000000000 };
  class FakeDate extends Date { static now() { return clock.now; } }
  const timers = [];
  const warnings = [];
  const ctx = createContext({
    grist: {
      docApi: doc,
      ready() {}, onRecord() {}, onOptions() {},
      async getOptions() { return null; },
    },
    console: { log() {}, warn(...a) { warnings.push(a.join(' ')); }, error(...a) { warnings.push(a.join(' ')); } },
    Date: FakeDate,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  });
  scripts.forEach((s) => loadScript(ctx, s));
  return { ctx, clock, timers, warnings, run: (expr) => evalIn(ctx, expr) };
}

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  // === Templates.loadAll ===

  // 1. Toutes les colonnes sont là : UNE lecture de la table des modèles (avant : une par migration, sept en tout), aucune colonne ajoutée, aucun listTables.
  {
    const doc = makeDoc();
    const { run } = fresh(doc);
    const templates = await run('Templates.loadAll()');
    check('loadAll : la table des modèles est lue UNE fois (avant : sept)', doc.readsOf('Publipostage_Modeles') === 1, doc.readsOf('Publipostage_Modeles'));
    check('loadAll : aucune colonne ajoutée quand elles sont toutes là', doc.actions.length === 0, doc.actions.map((a) => a[0] + a[2]));
    check('loadAll : les modèles sont rendus', templates.length === 2 && templates[0].nom === 'Modèle 1' && templates[1].contenu === '<p>Texte 2</p>', templates.map((t) => t.nom));
    check('loadAll : le modèle par défaut est reconnu', await run('Templates.getDefaultId()') === templates[0].id);
    check('loadAll : chaque ligne porte son type et son suivi', templates[0].typeModele === 'document' && templates[0].suiviModifications && typeof templates[0].suiviModifications === 'object');
  }

  // 2. Un passage de l'enregistrement automatique (loadAll toutes les ~2,5 s) : une lecture, comme avant - pas une de plus.
  {
    const doc = makeDoc();
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    doc.resetLog();
    await run('Templates.loadAll()');
    check('loadAll au tick suivant : une seule lecture', doc.readsOf('Publipostage_Modeles') === 1 && doc.log.length === 1, doc.log.map((c) => c.name + ':' + c.arg));
    doc.addRow('Publipostage_Modeles', { Nom: 'Ajouté ailleurs', Contenu: '' });
    const templates = await run('Templates.loadAll()');
    check('loadAll au tick suivant : une ligne ajoutée par quelqu\'un d\'autre apparaît', templates.length === 3 && templates[2].nom === 'Ajouté ailleurs');
  }

  // 3. Deux colonnes manquent (la migration des modèles email et celle du suivi) : exactement celles-là sont ajoutées, une fois chacune, et les modèles sont rendus
  // APRÈS la migration (relus) - jamais une table lue avant que la colonne n'existe.
  {
    const doc = makeDoc({ without: ['Objet', 'SuiviModifications'] });
    const { run } = fresh(doc);
    const templates = await run('Templates.loadAll()');
    const added = doc.actions.filter((a) => a[0] === 'AddVisibleColumn').map((a) => a[2]);
    check('migration : seule la colonne manquante est ajoutée, une fois', sameList(added.slice().sort(), ['Objet', 'SuiviModifications']), added);
    check('migration : les modèles sont rendus et la table a ses colonnes', templates.length === 2 && doc.tables.Publipostage_Modeles.names.includes('SuiviModifications'));
    doc.resetLog();
    await run('Templates.loadAll()');
    check('migration : le passage suivant ne relit qu\'une fois et n\'ajoute plus rien', doc.readsOf('Publipostage_Modeles') === 1 && doc.actions.length === added.length);
  }

  // 4. Document créé avant le widget : la table des modèles n'existe pas - créée une fois, puis chaque colonne manquante une fois.
  {
    const doc = makeDoc({ modeles: false });
    const { run } = fresh(doc);
    const templates = await run('Templates.loadAll()');
    const tables = doc.actions.filter((a) => a[0] === 'AddTable' && a[1] === 'Publipostage_Modeles');
    const added = doc.actions.filter((a) => a[0] === 'AddVisibleColumn').map((a) => a[2]).sort();
    check('table absente : créée une seule fois', tables.length === 1);
    check('table absente : chaque colonne de migration ajoutée une fois', sameList(added, ['Cc', 'Cci', 'Destinataires', 'EstParDefaut', 'HeaderFooter', 'Margins', 'Objet', 'SuiviModifications', 'TypeModele']), added);
    check('table absente : aucun modèle', Array.isArray(templates) && templates.length === 0);
  }

  // 5. Deux loadAll qui se chevauchent sur un document à migrer (un tick d'enregistrement automatique pendant l'ouverture, cf. ensureOnce) : une seule colonne ajoutée.
  {
    const doc = makeDoc({ without: ['Margins'], latencyMs: 15 });
    const { run } = fresh(doc);
    await Promise.all([run('Templates.loadAll()'), run('Templates.loadAll()')]);
    const added = doc.actions.filter((a) => a[0] === 'AddVisibleColumn').map((a) => a[2]);
    check('deux loadAll en même temps : la colonne n\'est ajoutée qu\'UNE fois', sameList(added, ['Margins']), added);
  }

  // === GristAPI.init : schéma rapide ===

  // 6. Aucune table du document n'est lue pendant init() : les noms viennent de listTables, les colonnes et les types des métadonnées.
  {
    const doc = makeDoc({ latencyMs: 10 });
    const { run, timers } = fresh(doc);
    await run('GristAPI.init()');
    check('init : aucune table du document n\'est lue (avant : toutes)', doc.userTableReads(USER_TABLES.concat('Publipostage_Modeles')) === 0, doc.log.map((c) => c.name + ':' + c.arg));
    check('init : deux rangées d\'appels au plus (avant : cinq à la suite)', doc.maxDepth <= 2, doc.maxDepth);
    check('init : les tables du document, sans les tables du widget', sameList(await run('GristAPI.getTables()'), USER_TABLES), await run('GristAPI.getTables()'));
    // Colonnes provisoires : l'ordre des positions (Personne, Reference, Titre), sans manualSort.
    check('init : colonnes provisoires dans l\'ordre des positions, sans manualSort', sameList(await run('GristAPI.getColumns("Missions")'), ['Personne', 'Reference', 'Titre']), await run('GristAPI.getColumns("Missions")'));
    check('init : les types sont connus', await run('GristAPI.getColumnType("Missions", "Personne")') === 'Ref:Personnes');
    check('init : la règle de liaison est lue', (await run('GristAPI.getLinkRule("Personnes")')) && (await run('GristAPI.getLinkRule("Personnes")')).mode === 'match');
    check('init : aucune minuterie, aucune lecture ne part seule derrière l\'ouverture (la passe complète est demandée par l\'affichage du modèle)', timers.length === 0, timers.map((t) => t.ms));
  }

  // 7. La passe complète rend les colonnes EXACTES : les clés que Grist rend à fetchTable (une colonne que les métadonnées ne montrent pas y est ; manualSort jamais).
  {
    const doc = makeDoc();
    const { run } = fresh(doc);
    await run('GristAPI.init()');
    doc.tables.Missions.names.push('Extra'); doc.tables.Missions.types.Extra = 'Text'; // dans les données, pas dans les métadonnées
    doc.tables.Missions.metaHidden.push('Extra');
    doc.resetLog();
    await run('GristAPI.refreshSchema()');
    check('refreshSchema : chaque table du document est lue une fois', doc.readsOf('Missions') === 1 && doc.readsOf('Personnes') === 1, doc.log.map((c) => c.arg));
    check('refreshSchema : colonnes exactes (clés de fetchTable, sans manualSort), dans leur ordre', sameList(await run('GristAPI.getColumns("Missions")'), ['Reference', 'Titre', 'Personne', 'Extra']), await run('GristAPI.getColumns("Missions")'));
    check('refreshSchema : les types sont toujours connus', await run('GristAPI.getColumnType("Missions", "Personne")') === 'Ref:Personnes');
  }

  // 8. Une passe à la fois : trois demandes dans le même instant font DEUX passes (celle qui part, puis une pour les deux autres), pas trois.
  {
    const doc = makeDoc({ latencyMs: 10 });
    const { run } = fresh(doc);
    await run('GristAPI.init()');
    doc.resetLog();
    await run('Promise.all([GristAPI.refreshSchema(), GristAPI.refreshSchema(), GristAPI.refreshSchema()])');
    check('trois refreshSchema ensemble : deux passes de lecture (avant : trois)', doc.readsOf('Missions') === 2, doc.readsOf('Missions'));
  }

  // 9. Une demande qui arrive PENDANT une passe voit ce que la personne vient de changer : la passe en cours a pu lire avant, elle attend la suivante.
  {
    const doc = makeDoc({ latencyMs: 20 });
    const { run } = fresh(doc);
    await run('GristAPI.init()');
    const first = run('GristAPI.refreshSchema()');
    await sleep(25); // la première passe a lu listTables, ses lectures de tables sont en route
    doc.tables.Missions.names.push('Tardive'); doc.tables.Missions.types.Tardive = 'Text'; // colonne ajoutée dans Grist pendant la passe
    await run('GristAPI.refreshSchema()');
    await first;
    check('refreshSchema pendant une passe : la colonne ajoutée entre-temps est vue', (await run('GristAPI.getColumns("Missions")')).includes('Tardive'), await run('GristAPI.getColumns("Missions")'));
  }

  // 10. maxAgeMs : une passe complète lue il y a moins que ça suffit (pas de nouvelle lecture) ; au-delà, on relit. Editor.setHTML le demande à chaque modèle (une passe d'il y a moins d'une minute suffit tant qu'aucune bulle n'est rouge, groupe schemaAtDisplay).
  {
    const doc = makeDoc();
    const { run, clock } = fresh(doc);
    await run('GristAPI.init()');
    await run('GristAPI.refreshSchema()');
    doc.resetLog();
    clock.now += 1000;
    await run('GristAPI.refreshSchema({ maxAgeMs: 3000 })');
    check('maxAgeMs : une passe d\'il y a 1 s suffit pour 3 s, rien n\'est relu', doc.log.length === 0, doc.log.map((c) => c.name + ':' + c.arg));
    clock.now += 5000;
    await run('GristAPI.refreshSchema({ maxAgeMs: 3000 })');
    check('maxAgeMs : une passe de plus de 3 s est refaite', doc.readsOf('Missions') === 1, doc.readsOf('Missions'));
    doc.resetLog();
    await run('GristAPI.refreshSchema()');
    check('sans maxAgeMs : toujours une relecture (les appelants qui viennent de changer le document)', doc.readsOf('Missions') === 1, doc.readsOf('Missions'));
  }

  // 11. La passe rapide d'init() ne compte PAS comme une passe récente : le rappel de js/main.js (maxAgeMs d'une minute, quelques secondes après l'ouverture) lance bien la passe
  // complète si l'affichage d'un modèle ne l'a pas déjà fait - et ne refait rien si elle a eu lieu.
  {
    const doc = makeDoc();
    const { run } = fresh(doc);
    await run('GristAPI.init()');
    doc.resetLog();
    await run('GristAPI.refreshSchema({ maxAgeMs: 60000 })');
    check('après init : refreshSchema({ maxAgeMs }) lance la passe complète', doc.readsOf('Missions') === 1 && doc.readsOf('Personnes') === 1, doc.log.map((c) => c.arg));
    doc.resetLog();
    await run('GristAPI.refreshSchema({ maxAgeMs: 60000 })');
    check('le rappel de l\'ouverture ne refait rien quand la passe complète vient d\'avoir lieu', doc.log.length === 0, doc.log.map((c) => c.arg));
  }

  // 11 bis. Un affichage de modèle qui tombe PENDANT la passe rapide (init() pas fini) n'en reprend pas les colonnes provisoires : il attend la passe complète qui la suit.
  {
    const doc = makeDoc({ latencyMs: 20 });
    const { run } = fresh(doc);
    const initDone = run('GristAPI.init()');
    await sleep(8);
    await run('GristAPI.refreshSchema({ maxAgeMs: 3000 })');
    await initDone;
    check('refreshSchema({ maxAgeMs }) pendant la passe rapide : les colonnes rendues sont les exactes', sameList(await run('GristAPI.getColumns("Missions")'), ['Reference', 'Titre', 'Personne']), await run('GristAPI.getColumns("Missions")'));
    check('refreshSchema({ maxAgeMs }) pendant la passe rapide : la passe complète a eu lieu', doc.readsOf('Missions') === 1, doc.readsOf('Missions'));
  }

  // 12. Un document dont les métadonnées ne se lisent pas : init() ne casse pas, la passe complète donne les colonnes.
  {
    const doc = makeDoc();
    const realFetch = doc.fetchTable.bind(doc);
    let broken = true;
    doc.fetchTable = (table) => (broken && table.startsWith('_grist_') ? Promise.reject(new Error('métadonnées illisibles (test)')) : realFetch(table));
    const { run } = fresh(doc);
    await run('GristAPI.init()');
    check('init sans métadonnées : les tables sont connues, les colonnes vides en attendant', sameList(await run('GristAPI.getTables()'), USER_TABLES) && sameList(await run('GristAPI.getColumns("Missions")'), []));
    broken = false;
    await run('GristAPI.refreshSchema()');
    check('init sans métadonnées : la passe complète rend les colonnes', sameList(await run('GristAPI.getColumns("Missions")'), ['Reference', 'Titre', 'Personne']), await run('GristAPI.getColumns("Missions")'));
  }

  // === Câblage : index.html lance Grist et les modèles avant les derniers scripts, js/main.js reprend ces promesses ===
  {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const main = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
    const editor = readFileSync(join(ROOT, 'js/editor.js'), 'utf8');
    const early = (html.match(/<script>[\s\S]*?<\/script>/g) || []).find((block) => block.includes('window.__earlyStart = '));
    const earlyAt = early ? html.indexOf(early) : -1;
    const templatesAt = html.indexOf('<script src="js/templates.js');
    const readerAt = html.indexOf('<script src="js/reader-mode.js');
    const mainAt = html.indexOf('<script src="js/main.js');
    check('index.html : le démarrage anticipé vient après js/templates.js et avant les autres scripts', templatesAt !== -1 && earlyAt > templatesAt && earlyAt < readerAt && readerAt < mainAt, [templatesAt, earlyAt, readerAt, mainAt]);
    check('index.html : le démarrage anticipé lance GristAPI.init() et Templates.loadAll()', !!early && /GristAPI\.init\(\)/.test(early) && /Templates\.loadAll\(\)/.test(early));
    check('js/main.js : reprend les promesses du démarrage anticipé, ou les lance lui-même', /window\.__earlyStart/.test(main) && /early\.grist \|\| GristAPI\.init\(\)/.test(main) && /early\.templates \|\| Templates\.loadAll\(\)/.test(main));
    check('js/main.js : l\'éditeur se charge en même temps que Grist (pas après)', main.indexOf('const editorReady = Editor.init()') !== -1 && main.indexOf('const editorReady = Editor.init()') < main.indexOf('await gristInit'));
    check('js/editor.js : setHTML demande la lecture complète des tables (le schéma d\'init() n\'est que provisoire), toujours quand une bulle est rouge, sinon si la dernière a plus d\'une minute', /const looksBroken = !!editor\.view\.dom\.querySelector\('\.var-badge-broken, \.calc-badge-broken'\);\s*GristAPI\.refreshSchema\(looksBroken \? undefined : \{ maxAgeMs: SCHEMA_MAX_AGE_MS \}\)\.then\(refreshVariableBadgeValidity\)/.test(editor) && /const SCHEMA_MAX_AGE_MS = 60000;/.test(editor));
    const readyAt = main.indexOf("setStatus(I18n.t(isReadOnly() ? 'status.readyReadOnly' : 'status.ready'))");
    // Le rappel vit dans checkAfterOpen, que le démarrage appelle une fois « prêt » affiché.
    const afterOpenAt = main.indexOf('function checkAfterOpen()');
    check('js/main.js : après « prêt », la lecture complète est rappelée si rien ne l\'a faite (maxAgeMs)', readyAt !== -1 && afterOpenAt !== -1 && main.indexOf('checkAfterOpen();', readyAt) !== -1 && /setTimeout\(\(\) => \{ GristAPI\.refreshSchema\(\{ maxAgeMs: 60000 \}\)/.test(main.slice(afterOpenAt)));
  }

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
