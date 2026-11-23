#!/usr/bin/env node
// Tests purs (sans navigateur) de js/table-doubles.js : un document qui porte une table du widget sous son ancien nom ET sous son nom anglais (le cas du document d'Antoine, 20/11 :
// « Publipostage_PreferencesModeles » lue par GFS, « Publipostage_TemplatePreferences » lue par le widget). Faux document : GenericDoc, ci-dessous (tables, colonnes typées, métadonnées de Grist,
// AddRecord / UpdateRecord / AddVisibleColumn / RemoveTable ; une colonne inconnue refuse l'action comme Grist).
// Lancer : node dev-tests/unit-table-doubles.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

class GenericDoc {
  constructor() { this.tables = new Map(); this.journal = []; this.removed = []; }
  addTable(name, columns, rows = []) {
    // columns : { colId: type } ; rows : [{ colId: valeur }] (les colonnes d'une ligne qui n'en dit pas une se lisent vides)
    // Les numéros de ligne sont ceux de CHAQUE table (comme dans Grist) : le modèle 1 de l'ancienne n'est pas le 1 de la table en service.
    const table = { columns: Object.assign({}, columns), rows: [], nextId: 1 };
    table.rows = rows.map(row => Object.assign({ id: table.nextId++ }, row));
    this.tables.set(name, table);
    return this;
  }
  rowsOf(name) { return this.tables.get(name).rows; }
  async listTables() { return Array.from(this.tables.keys()); }
  async getAccessToken() { return { baseUrl: 'https://grist.exemple.fr/api/docs/DOC1' }; }
  async fetchTable(name) {
    if (name === '_grist_Tables') {
      const names = Array.from(this.tables.keys());
      return { id: names.map((_, i) => i + 1), tableId: names };
    }
    if (name === '_grist_Tables_column') {
      const names = Array.from(this.tables.keys());
      const out = { id: [], parentId: [], colId: [], type: [] };
      names.forEach((table, t) => Object.entries(this.tables.get(table).columns).forEach(([colId, type]) => {
        out.id.push(out.id.length + 1); out.parentId.push(t + 1); out.colId.push(colId); out.type.push(type);
      }));
      return out;
    }
    const table = this.tables.get(name);
    if (!table) throw new Error('Table inconnue ' + name);
    const data = { id: table.rows.map(row => row.id) };
    Object.keys(table.columns).forEach(col => { data[col] = table.rows.map(row => (row[col] === undefined ? (table.columns[col] === 'Bool' ? false : (table.columns[col] === 'Text' ? '' : 0)) : row[col])); });
    return data;
  }
  async applyUserActions(actions) {
    const retValues = [];
    for (const action of actions) {
      const [verb, name] = action;
      this.journal.push(verb + ':' + name);
      const table = this.tables.get(name);
      if (!table) throw new Error('Table inconnue ' + name);
      if (verb === 'AddRecord') {
        Object.keys(action[3]).forEach(col => { if (!(col in table.columns)) throw new Error('KeyError : colonne inconnue ' + name + '.' + col); });
        const row = Object.assign({ id: table.nextId++ }, action[3]);
        table.rows.push(row);
        retValues.push(row.id);
      } else if (verb === 'UpdateRecord') {
        Object.keys(action[3]).forEach(col => { if (!(col in table.columns)) throw new Error('KeyError : colonne inconnue ' + name + '.' + col); });
        Object.assign(table.rows.find(row => row.id === action[2]), action[3]);
        retValues.push(null);
      } else if (verb === 'AddVisibleColumn') {
        table.columns[action[2]] = action[3].type;
        retValues.push({ colId: action[2] });
      } else if (verb === 'RemoveTable') {
        this.tables.delete(name);
        this.removed.push(name);
        retValues.push(null);
      } else throw new Error('GenericDoc : action non supportée ' + verb);
    }
    return { retValues };
  }
}

const PREF_EN = { User: 'Text', TemplateId: 'Int', Pinned: 'Bool', Folder: 'Text', Collapsed: 'Bool', ExportType: 'Text', PdfQuality: 'Text', ExportLines: 'Text' };
const PREF_FR = { Utilisateur: 'Text', ModeleId: 'Int', Epingle: 'Bool', Dossier: 'Text', Replie: 'Bool', TypeExport: 'Text', QualitePdf: 'Text', LignesExport: 'Text' };
const TPL_EN = { Name: 'Text', Content: 'Text', PdfFileName: 'Text', ModifiedAt: 'DateTime', Token: 'Text', TemplateType: 'Text', IsDefault: 'Bool' };
const TPL_FR = { Nom: 'Text', Contenu: 'Text', NomFichierPDF: 'Text', DateModif: 'DateTime', Jeton: 'Text', TypeModele: 'Text', EstParDefaut: 'Bool' };
const COM_EN = { TemplateId: 'Int', Author: 'Text', Text: 'Text', CreatedAt: 'DateTime' };
const COM_FR = { ModeleId: 'Int', Auteur: 'Text', Texte: 'Text', CreeLe: 'DateTime' };
const ME = 'antoine@exemple.fr';

function freshModule(doc) {
  const ctx = createContext({ grist: { docApi: doc }, __schemaNames: 'english', URL });
  evalIn(ctx, 'var I18n = { t: (key, params) => key + (params ? JSON.stringify(params) : "") }');
  loadScript(ctx, 'js/schema-columns.js');
  loadScript(ctx, 'js/table-doubles.js');
  return { run: expr => evalIn(ctx, expr), ctx };
}
const json = value => JSON.parse(JSON.stringify(value));
const storageOf = () => { const map = new Map(); return { get: key => (map.has(key) ? map.get(key) : null), set: (key, value) => { map.set(key, String(value)); return true; }, remove: key => { map.delete(key); return true; }, map }; };
const folderOf = (rows, userCol = 'User', folderCol = 'Folder', idCol = 'TemplateId') => rows.map(row => `${row[idCol]}:${row[folderCol] || ''}`).sort();

async function main() {
  // 1. Le document d'Antoine : le rangement dans deux tables, GFS lit l'ancienne (4 lignes), le widget l'anglaise.
  {
    const doc = new GenericDoc()
      .addTable('Publipostage_TemplatePreferences', PREF_EN, [
        { User: ME, TemplateId: 0, Folder: 'InnovationS/Notifications' },
        { User: ME, TemplateId: 0, Folder: 'outils Puplipostage UB', Collapsed: true },
        { User: ME, TemplateId: 12, Folder: 'InnovationS/Notifications', Pinned: true },
        { User: ME, TemplateId: 30, Folder: '' },
      ])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [
        { Utilisateur: ME, ModeleId: 0, Dossier: 'instances/CTO' },
        { Utilisateur: ME, ModeleId: 0, Dossier: 'instances' },
        { Utilisateur: ME, ModeleId: 0, Dossier: 'InnovationS/Conventions' },
        { Utilisateur: ME, ModeleId: 30, Dossier: 'instances/CTO' },
      ]);
    const { run } = freshModule(doc);
    const pairs = json(await run('TableDoubles.detect()'));
    check('détection : la paire du rangement est vue, l\'anglaise est celle que le widget lit', pairs.length === 1 && pairs[0].table === 'Publipostage_TemplatePreferences' && pairs[0].kept === 'Publipostage_TemplatePreferences' && pairs[0].extra === 'Publipostage_PreferencesModeles', JSON.stringify(pairs));
    const before = json(await run('TableDoubles.verify(' + JSON.stringify(pairs) + ')'));
    check('avant : la passe à blanc dit ce qui reste à reprendre (4 lignes de l\'ancienne : 3 dossiers vides et le document 30 à compléter)', before[0].pending === 4 && before[0].extraRows === 4, JSON.stringify(before));
    check('avant : la passe à blanc n\'écrit rien', doc.journal.length === 0, doc.journal.join(','));
    let refused = '';
    try { await run('TableDoubles.removeExtra(' + JSON.stringify(pairs[0]) + ')'); } catch (e) { refused = e.message; }
    check('suppression refusée tant que la réunion n\'est pas faite', /pas complète/.test(refused) && doc.removed.length === 0, refused);
    const result = json(await run('TableDoubles.merge(' + JSON.stringify(pairs) + ')'));
    check('réunion : 3 dossiers repris, le document 30 complété', result[0].added === 3 && result[0].filled === 1 && result[0].pending === 0, JSON.stringify(result));
    const rows = doc.rowsOf('Publipostage_TemplatePreferences');
    check('réunion : les dossiers de l\'ancienne sont dans la table en service, ceux qu\'elle avait y sont toujours', ['0:InnovationS/Conventions', '0:InnovationS/Notifications', '0:instances', '0:instances/CTO', '0:outils Puplipostage UB'].every(entry => folderOf(rows).includes(entry)), folderOf(rows).join(' | '));
    check('réunion : le document 30, sans dossier chez le widget, prend celui que GFS lui avait donné', rows.find(row => row.TemplateId === 30).Folder === 'instances/CTO');
    check('réunion : ce que le widget avait (épingle, dossier replié, dossier du document 12) n\'est pas touché', rows.find(row => row.TemplateId === 12).Pinned === true && rows.find(row => row.TemplateId === 12).Folder === 'InnovationS/Notifications' && rows.find(row => row.Folder === 'outils Puplipostage UB').Collapsed === true);
    check('réunion : la personne et l\'état de chaque ligne reprise sont ceux de l\'ancienne', rows.filter(row => row.Folder === 'instances').every(row => row.User === ME && row.TemplateId === 0));
    check('réunion : l\'ancienne table n\'a pas bougé (4 lignes)', doc.rowsOf('Publipostage_PreferencesModeles').length === 4);
    const again = json(await run('TableDoubles.merge(' + JSON.stringify(pairs) + ')'));
    check('rejouée : rien n\'est repris deux fois', again[0].added === 0 && again[0].filled === 0 && doc.rowsOf('Publipostage_TemplatePreferences').length === 7, JSON.stringify(again));
    await run('TableDoubles.removeExtra(' + JSON.stringify(pairs[0]) + ')');
    check('suppression : seule l\'ancienne table est retirée', JSON.stringify(doc.removed) === '["Publipostage_PreferencesModeles"]' && doc.tables.has('Publipostage_TemplatePreferences'), JSON.stringify(doc.removed));
    check('après : plus de paire', json(await run('TableDoubles.detect()')).length === 0);
  }

  // 2. Les modèles aussi sont en double : leurs numéros ne sont pas les mêmes d'une table à l'autre, le rangement et les commentaires les suivent.
  {
    const doc = new GenericDoc()
      .addTable('Publipostage_Templates', TPL_EN, [
        { Name: 'Contrat', Content: '<p>A</p>', Token: 'tok-A', IsDefault: true },
        { Name: 'Facture', Content: '<p>F</p>', Token: 'tok-F' },
      ])
      .addTable('Publipostage_Modeles', TPL_FR, [
        { Nom: 'Contrat (copie)', Contenu: '<p>A</p>', Jeton: 'tok-A' },           // même modèle : reconnu par son jeton
        { Nom: 'Bail', Contenu: '<p>B</p>', Jeton: 'tok-B', EstParDefaut: true },  // absent de la table en service
        { Nom: 'Facture', Contenu: '<p>autre</p>', Jeton: 'tok-X' },               // même nom, autre modèle
        { Nom: 'Courrier', Contenu: '<p>C</p>', TypeModele: 'email' },             // sans jeton, un e-mail
      ])
      .addTable('Publipostage_TemplatePreferences', PREF_EN, [{ User: ME, TemplateId: 2, Folder: 'Compta' }])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [
        { Utilisateur: ME, ModeleId: 1, Dossier: 'Juridique' },   // le modèle 1 de l'ancienne : « Contrat », qui est le 1 de la table en service
        { Utilisateur: ME, ModeleId: 2, Dossier: 'Immobilier', Epingle: true },   // « Bail » : une ligne neuve dans la table en service
        { Utilisateur: ME, ModeleId: 99, Dossier: 'Fantôme' },    // un modèle qui n'existe pas dans l'ancienne
      ])
      .addTable('Publipostage_Comments', COM_EN, [])
      .addTable('Publipostage_Commentaires', COM_FR, [{ ModeleId: 2, Auteur: 'Zoé', Texte: 'à revoir', CreeLe: 1700000000 }]);
    const { run } = freshModule(doc);
    const pairs = json(await run('TableDoubles.detect()'));
    check('modèles en double : trois paires, les modèles d\'abord', pairs.map(pair => pair.table).join() === 'Publipostage_Templates,Publipostage_TemplatePreferences,Publipostage_Comments', pairs.map(pair => pair.table).join());
    const result = json(await run('TableDoubles.merge(' + JSON.stringify(pairs) + ')'));
    const templates = doc.rowsOf('Publipostage_Templates');
    check('modèles : le modèle de même jeton n\'est pas copié, les trois autres le sont', templates.length === 5 && result[0].added === 3 && result[0].matched === 1, JSON.stringify(result[0]));
    check('modèles : un nom déjà pris dans la table en service reçoit le suffixe', templates.some(row => row.Name === 'Facturedoubles.copySuffix'), templates.map(row => row.Name).join(' | '));
    check('modèles : le document par défaut de la table en service reste le seul', templates.filter(row => row.IsDefault).length === 1 && templates.find(row => row.Name === 'Contrat').IsDefault === true);
    check('modèles : un e-mail sans jeton garde son type', templates.find(row => row.Name === 'Courrier').TemplateType === 'email');
    const bail = templates.find(row => row.Name === 'Bail');
    const prefs = doc.rowsOf('Publipostage_TemplatePreferences');
    check('rangement : « Contrat » (1 de l\'ancienne, 1 de la table en service) reçoit son dossier', prefs.find(row => row.TemplateId === 1).Folder === 'Juridique');
    check('rangement : « Bail » est rangé sous SON numéro dans la table en service, épinglé', prefs.find(row => row.TemplateId === bail.id).Folder === 'Immobilier' && prefs.find(row => row.TemplateId === bail.id).Pinned === true, JSON.stringify(prefs));
    check('rangement : la ligne d\'un modèle absent n\'est pas reprise', !prefs.some(row => row.Folder === 'Fantôme') && result[1].dropped === 1);
    check('rangement : la ligne du widget (modèle 2, « Facture ») n\'est pas touchée', prefs.find(row => row.TemplateId === 2).Folder === 'Compta');
    const comments = doc.rowsOf('Publipostage_Comments');
    check('commentaires : le commentaire sur « Bail » cite le numéro de « Bail » dans la table en service', comments.length === 1 && comments[0].TemplateId === bail.id, JSON.stringify(comments));
    check('tout : plus rien à reprendre', json(await run('TableDoubles.verify(' + JSON.stringify(pairs) + ')')).every(item => item.pending === 0));
    // La suppression de l'ancienne table des modèles seule ferait perdre le fil des numéros : elle se fait après celles qui en citent.
    for (const pair of [...pairs].reverse()) await run('TableDoubles.removeExtra(' + JSON.stringify(pair) + ')');
    check('suppression dans l\'ordre (commentaires, rangement, puis modèles) : les trois anciennes tables partent, les trois en service restent', doc.removed.join() === 'Publipostage_Commentaires,Publipostage_PreferencesModeles,Publipostage_Modeles' && ['Publipostage_Templates', 'Publipostage_TemplatePreferences', 'Publipostage_Comments'].every(name => doc.tables.has(name)), doc.removed.join());
  }

  // 3. Une colonne que la table en service n'a pas (document d'avant les réglages d'export, d'avant le jeton) : elle est ajoutée, du même type, et la réunion se dit complète.
  {
    const noToken = { Name: 'Text', Content: 'Text' };
    const doc = new GenericDoc()
      .addTable('Publipostage_Templates', noToken, [{ Name: 'Seul', Content: '<p>S</p>' }])
      .addTable('Publipostage_Modeles', TPL_FR, [{ Nom: 'Daté', Contenu: '<p>D</p>', Jeton: 'tok-D', DateModif: 1700000000, TypeModele: 'email' }])
      .addTable('Publipostage_TemplatePreferences', { User: 'Text', TemplateId: 'Int', Pinned: 'Bool', Folder: 'Text' }, [{ User: ME, TemplateId: 1, Folder: '' }])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [{ Utilisateur: ME, ModeleId: 1, Dossier: '', TypeExport: 'pdf' }]);
    const { run } = freshModule(doc);
    const pairs = json(await run('TableDoubles.detect()'));
    const result = json(await run('TableDoubles.merge(' + JSON.stringify(pairs) + ')'));
    const added = doc.rowsOf('Publipostage_Templates').find(row => row.Name === 'Daté');
    check('colonnes absentes : le jeton, le type et la date s\'ajoutent à la table en service, avec le type de l\'ancienne', result[0].columnsAdded === 3 && doc.tables.get('Publipostage_Templates').columns.ModifiedAt === 'DateTime' && added.Token === 'tok-D' && added.TemplateType === 'email', JSON.stringify([result[0], doc.tables.get('Publipostage_Templates').columns]));
    check('colonnes absentes : le rangement sans colonnes d\'export ne reste pas « incomplet » (réglage d\'export de l\'ancienne laissé)', result[1].pending === 0 && json(await run('TableDoubles.verify(' + JSON.stringify(pairs) + ')')).every(item => item.pending === 0));
  }

  // 4. Garde-fous : ni une table de la personne, ni la table en service, ni une réunion à moitié faite.
  {
    const doc = new GenericDoc()
      .addTable('Clients', { Nom: 'Text' }, [{ Nom: 'x' }])
      .addTable('Clients2', { Nom: 'Text' }, [{ Nom: 'y' }]);
    const { run } = freshModule(doc);
    let message = '';
    try { await run('TableDoubles.removeExtra({ table: "Clients", kept: "Clients", extra: "Clients2" })'); } catch (e) { message = e.message; }
    check('garde-fou : une table qui n\'est pas dans le registre du widget n\'est jamais supprimée', /hors registre/.test(message) && doc.removed.length === 0, message);
    message = '';
    try { await run('TableDoubles.removeExtra({ table: "Publipostage_Templates", kept: "Publipostage_Templates", extra: "Publipostage_Templates" })'); } catch (e) { message = e.message; }
    check('garde-fou : la table en service n\'est jamais celle que l\'on supprime', message !== '' && doc.removed.length === 0, message);
    check('aucun document à deux tables : rien à détecter', json(await run('TableDoubles.detect()')).length === 0);
  }

  // 5. La question posée à l'ouverture : « Réunir » puis « Supprimer » ; « Plus tard » n'écrit rien ; lecture seule et modifications en cours ne demandent rien.
  {
    const build = () => new GenericDoc()
      .addTable('Publipostage_TemplatePreferences', PREF_EN, [{ User: ME, TemplateId: 0, Folder: 'A' }])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [{ Utilisateur: ME, ModeleId: 0, Dossier: 'B' }]);
    const stub = (answers) => {
      const calls = [];
      return { calls, ask: {
        choose: async options => { calls.push(['choose', options.message]); return answers.choose; },
        confirm: async options => { calls.push(['confirm', options.title, options.danger]); return answers.confirm; },
        notice: async options => { calls.push(['notice', options.title]); },
      } };
    };
    const statuses = [];
    const hooks = (dialogs, extra) => Object.assign({ ask: dialogs.ask, notify: text => statuses.push(text), isUntouched: () => true, isReadOnly: () => false }, extra || {});
    {
      const doc = build();
      const { run, ctx } = freshModule(doc);
      const dialogs = stub({ choose: 'merge', confirm: true });
      ctx.__hooks = hooks(dialogs, { onMerged: async () => { ctx.__merged = (ctx.__merged || 0) + 1; } });
      const outcome = json(await run('TableDoubles.checkAfterOpen(__hooks)'));
      check('ouverture : une question, la réunion, puis une confirmation de suppression en « danger »', outcome.action === 'removed' && dialogs.calls.map(call => call[0]).join() === 'choose,confirm' && dialogs.calls[1][2] === true, JSON.stringify(dialogs.calls));
      check('ouverture : la question nomme les deux tables et les lignes de l\'ancienne', /Publipostage_PreferencesModeles/.test(dialogs.calls[0][1]) && /Publipostage_TemplatePreferences/.test(dialogs.calls[0][1]) && /doubles\.rows\.one/.test(dialogs.calls[0][1]), dialogs.calls[0][1]);
      check('ouverture : les écrans sont relus après la réunion (onMerged)', ctx.__merged === 1);
      check('ouverture : l\'ancienne table est supprimée, celle en service reprend le dossier', doc.removed.join() === 'Publipostage_PreferencesModeles' && doc.rowsOf('Publipostage_TemplatePreferences').some(row => row.Folder === 'B'));
    }
    {
      const doc = build();
      const { run, ctx } = freshModule(doc);
      const dialogs = stub({ choose: null, confirm: true });
      ctx.__hooks = hooks(dialogs);
      const outcome = json(await run('TableDoubles.checkAfterOpen(__hooks)'));
      check('« Plus tard » : rien n\'est écrit ni supprimé, le coin d\'état le dit', outcome.action === 'later' && doc.journal.length === 0 && doc.removed.length === 0 && statuses.includes('doubles.status.pending'), JSON.stringify(outcome));
    }
    {
      const doc = build();
      const { run, ctx } = freshModule(doc);
      const dialogs = stub({ choose: 'merge', confirm: false });
      ctx.__hooks = hooks(dialogs);
      const outcome = json(await run('TableDoubles.checkAfterOpen(__hooks)'));
      check('« La garder » : la réunion reste faite, l\'ancienne table aussi', outcome.action === 'merged' && doc.removed.length === 0 && doc.rowsOf('Publipostage_TemplatePreferences').length === 2, JSON.stringify(outcome.action));
    }
    for (const [name, extra, expected] of [['lecture seule', { isReadOnly: () => true }, 'readonly'], ['modifications en cours', { isUntouched: () => false }, 'edited']]) {
      const doc = build();
      const { run, ctx } = freshModule(doc);
      const dialogs = stub({ choose: 'merge', confirm: true });
      ctx.__hooks = hooks(dialogs, extra);
      const outcome = json(await run('TableDoubles.checkAfterOpen(__hooks)'));
      check(name + ' : aucune question, rien d\'écrit', outcome.action === expected && dialogs.calls.length === 0 && doc.journal.length === 0, JSON.stringify(outcome.action));
    }
    {
      const doc = new GenericDoc().addTable('Publipostage_TemplatePreferences', PREF_EN, []);
      const { run, ctx } = freshModule(doc);
      const dialogs = stub({ choose: 'merge', confirm: true });
      ctx.__hooks = hooks(dialogs);
      const outcome = json(await run('TableDoubles.checkAfterOpen(__hooks)'));
      check('sans paire : aucune question', outcome.action === 'none' && dialogs.calls.length === 0);
    }
  }

  // 6. « La garder » est une réponse retenue (par document et par ancienne table) : tant que l'ancienne n'a rien de nouveau à donner, la question n'est pas reposée ; rien à reprendre dès la première fois :
  //    la fenêtre « Réunir » est sautée, seule la suppression se demande.
  {
    const build = () => new GenericDoc()
      .addTable('Publipostage_TemplatePreferences', PREF_EN, [{ User: ME, TemplateId: 0, Folder: 'A' }])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [{ Utilisateur: ME, ModeleId: 0, Dossier: 'B' }]);
    const stubAsk = (answers) => {
      const calls = [];
      return { calls, ask: {
        choose: async options => { calls.push('choose'); return answers.choose; },
        confirm: async options => { calls.push('confirm'); return answers.confirm; },
        notice: async options => { calls.push('notice'); },
      } };
    };
    const storage = () => { const map = new Map(); return { get: key => (map.has(key) ? map.get(key) : null), set: (key, value) => { map.set(key, String(value)); return true; }, remove: key => { map.delete(key); return true; }, map }; };
    const open = async (doc, ctx, dialogs) => {
      ctx.__hooks = { ask: dialogs.ask, notify: () => {}, isUntouched: () => true, isReadOnly: () => false };
      return json(await evalIn(ctx, 'TableDoubles.checkAfterOpen(__hooks)'));
    };
    {
      const doc = build();
      const { ctx } = freshModule(doc);
      ctx.PersonStore = storage();
      const first = stubAsk({ choose: 'merge', confirm: false });
      const outcome = await open(doc, ctx, first);
      check('« La garder » : la réponse est retenue pour ce document et cette ancienne table', outcome.action === 'merged' && ctx.PersonStore.map.size === 1 && /Publipostage_PreferencesModeles/.test(ctx.PersonStore.map.get('pp_doubles_kept')), JSON.stringify(outcome.action));
      const second = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(doc, ctx, second);
      check('rouvert après « La garder » : aucune question, rien de supprimé', again.action === 'kept' && second.calls.length === 0 && doc.removed.length === 0, JSON.stringify([again.action, second.calls]));
      doc.rowsOf('Publipostage_PreferencesModeles').push({ id: 9, Utilisateur: ME, ModeleId: 0, Dossier: 'C' });
      const third = stubAsk({ choose: 'merge', confirm: true });
      const news = await open(doc, ctx, third);
      check('une ligne arrivée depuis dans l\'ancienne table : la question revient, avec la réunion', news.action === 'removed' && third.calls.join() === 'choose,confirm' && doc.removed.join() === 'Publipostage_PreferencesModeles', JSON.stringify([news.action, third.calls]));
    }
    {
      const doc = build();
      const { ctx } = freshModule(doc);
      ctx.PersonStore = storage();
      await open(doc, ctx, stubAsk({ choose: 'merge', confirm: false }));
      const other = freshModule(build());
      other.ctx.PersonStore = ctx.PersonStore;
      other.ctx.grist.docApi.getAccessToken = async () => ({ baseUrl: 'https://grist.exemple.fr/api/docs/AUTRE' });
      const dialogs = stubAsk({ choose: 'merge', confirm: false });
      const outcome = await open(null, other.ctx, dialogs);
      check('un AUTRE document n\'hérite pas de la réponse : il est interrogé', outcome.action === 'merged' && dialogs.calls.join() === 'choose,confirm', JSON.stringify([outcome.action, dialogs.calls]));
    }
    {
      // Déjà réunie (une autre ouverture l'a fait) et ancienne table non supprimée : seule la suppression se demande.
      const doc = new GenericDoc()
        .addTable('Publipostage_TemplatePreferences', PREF_EN, [{ User: ME, TemplateId: 0, Folder: 'A' }, { User: ME, TemplateId: 0, Folder: 'B' }])
        .addTable('Publipostage_PreferencesModeles', PREF_FR, [{ Utilisateur: ME, ModeleId: 0, Dossier: 'B' }]);
      const { ctx } = freshModule(doc);
      ctx.PersonStore = storage();
      const dialogs = stubAsk({ choose: 'merge', confirm: true });
      const outcome = await open(doc, ctx, dialogs);
      check('rien à reprendre : pas de fenêtre « Réunir », seule la suppression est demandée', outcome.action === 'removed' && dialogs.calls.join() === 'confirm' && doc.removed.join() === 'Publipostage_PreferencesModeles' && doc.journal.length === 1, JSON.stringify([outcome.action, dialogs.calls, doc.journal]));
    }
  }

  // 7. La fenêtre « Supprimer l'ancienne table ? » ne revient pas à chaque ouverture (23/11 : widget intégré dans un autre document, la même question « Supprimer « Publipostage_Modeles » ? », 0 ligne reprise, à
  //    chaque chargement). Une réponse (« La garder », la suppression faite, la suppression refusée par le document) clôt la question même quand le navigateur refuse son stockage, que l'adresse du document est
  //    illisible ou que le widget est rouvert dans un autre cadre : le document la garde (réglage `doublesKept`), puis la personne, puis la page.
  {
    const build = () => new GenericDoc()
      .addTable('Publipostage_TemplatePreferences', PREF_EN, [{ User: ME, TemplateId: 0, Folder: 'A' }])
      .addTable('Publipostage_PreferencesModeles', PREF_FR, [{ Utilisateur: ME, ModeleId: 0, Dossier: 'B' }]);
    const stubAsk = (answers) => {
      const calls = [];
      return { calls, ask: {
        choose: async options => { calls.push('choose'); return answers.choose; },
        confirm: async options => { calls.push('confirm'); return answers.confirm; },
        notice: async options => { calls.push('notice'); },
      } };
    };
    // Les réglages du document, tels que Templates les rend : ce qui est écrit reste pour les chargements suivants (`bag`) ; `refuse` : le document n'accepte plus l'écriture.
    const documentSettings = () => {
      const bag = {};
      const api = { bag, refuse: false,
        getDocumentSetting: key => (bag[key] === undefined ? undefined : JSON.parse(JSON.stringify(bag[key]))),
        updateDocumentSettings: async patch => {
          if (api.refuse) return false;
          Object.keys(patch).forEach(key => { if (patch[key] == null) delete bag[key]; else bag[key] = JSON.parse(JSON.stringify(patch[key])); });
          return true;
        } };
      return api;
    };
    // Un navigateur qui refuse son stockage (cadre isolé, stockage tiers coupé) : rien ne s'y lit ni ne s'y écrit.
    const refusingStorage = () => ({ get: () => null, set: () => false, remove: () => false });
    // Un chargement du widget : un contexte neuf (la page repart de zéro) sur le même document, avec ce que le navigateur et le document ont gardé.
    const load = (doc, { person, settings, noKey }) => {
      if (noKey) doc.getAccessToken = async () => { throw new Error('getAccessToken refusé'); };
      const { ctx } = freshModule(doc);
      if (person) ctx.PersonStore = person;
      if (settings) ctx.Templates = settings;
      return ctx;
    };
    const open = async (ctx, dialogs) => {
      ctx.__hooks = { ask: dialogs.ask, notify: () => {}, isUntouched: () => true, isReadOnly: () => false };
      return json(await evalIn(ctx, 'TableDoubles.checkAfterOpen(__hooks)'));
    };

    {
      // Le cas du retour d'Antoine : le stockage du navigateur est refusé, « La garder » n'était retenu nulle part et la question revenait.
      const doc = build();
      const settings = documentSettings();
      const first = stubAsk({ choose: 'merge', confirm: false });
      const outcome = await open(load(doc, { person: refusingStorage(), settings }), first);
      check('stockage du navigateur refusé : « La garder » est retenue dans le document', outcome.action === 'merged' && JSON.stringify(settings.bag.doublesKept) === '["Publipostage_PreferencesModeles"]', JSON.stringify(settings.bag));
      const second = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(load(doc, { person: refusingStorage(), settings }), second);
      check('stockage refusé, widget rechargé : plus aucune question, rien de supprimé', again.action === 'kept' && second.calls.length === 0 && doc.removed.length === 0, JSON.stringify([again.action, second.calls]));
      const third = stubAsk({ choose: 'merge', confirm: true });
      const elsewhere = await open(load(doc, { person: storageOf(), settings }), third);
      check('une autre personne, un autre navigateur : la réponse du document vaut aussi pour elle', elsewhere.action === 'kept' && third.calls.length === 0, JSON.stringify([elsewhere.action, third.calls]));
    }
    {
      // L'adresse du document illisible (getAccessToken refuse) : la mémoire de la personne n'a pas de clé, celle du document tient.
      const doc = build();
      const settings = documentSettings();
      const person = storageOf();
      await open(load(doc, { person, settings, noKey: true }), stubAsk({ choose: 'merge', confirm: false }));
      const next = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(load(doc, { person, settings, noKey: true }), next);
      check('adresse du document illisible : « La garder » tient quand même (mémoire du document)', again.action === 'kept' && next.calls.length === 0 && person.map.size === 0, JSON.stringify([again.action, next.calls, person.map.size]));
    }
    {
      // Aucune mémoire durable (ni navigateur, ni document : réglages absents) : la page retient au moins sa propre réponse.
      const doc = build();
      const ctx = load(doc, { person: refusingStorage(), noKey: true });
      await open(ctx, stubAsk({ choose: 'merge', confirm: false }));
      const next = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(ctx, next);
      check('aucune mémoire durable : la page ne repose pas la question pendant qu\'elle vit', again.action === 'kept' && next.calls.length === 0, JSON.stringify([again.action, next.calls]));
    }
    {
      // Le document refuse d'écrire le réglage : la mémoire de la personne prend le relais.
      const doc = build();
      const settings = documentSettings();
      settings.refuse = true;
      const person = storageOf();
      await open(load(doc, { person, settings }), stubAsk({ choose: 'merge', confirm: false }));
      const next = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(load(doc, { person, settings }), next);
      check('réglage du document refusé : la mémoire de la personne garde la réponse', again.action === 'kept' && next.calls.length === 0 && Object.keys(settings.bag).length === 0, JSON.stringify([again.action, next.calls]));
    }
    {
      // Un AUTRE document n'hérite pas de la réponse du premier.
      const settings = documentSettings();
      await open(load(build(), { person: refusingStorage(), settings }), stubAsk({ choose: 'merge', confirm: false }));
      const fresh = stubAsk({ choose: 'merge', confirm: false });
      const other = await open(load(build(), { person: refusingStorage(), settings: documentSettings() }), fresh);
      check('un autre document, ses propres réglages : il est interrogé', other.action === 'merged' && fresh.calls.join() === 'choose,confirm', JSON.stringify([other.action, fresh.calls]));
    }
    {
      // Supprimée, puis recréée VIDE par une copie plus ancienne du widget à chaque ouverture : elle n'est pas proposée de nouveau.
      const doc = build();
      const settings = documentSettings();
      const first = stubAsk({ choose: 'merge', confirm: true });
      const outcome = await open(load(doc, { person: refusingStorage(), settings }), first);
      check('suppression faite : l\'ancienne table est partie et la réponse est retenue dans le document', outcome.action === 'removed' && doc.removed.join() === 'Publipostage_PreferencesModeles' && JSON.stringify(settings.bag.doublesKept) === '["Publipostage_PreferencesModeles"]', JSON.stringify([outcome.action, settings.bag]));
      doc.addTable('Publipostage_PreferencesModeles', PREF_FR, []);
      const second = stubAsk({ choose: 'merge', confirm: true });
      const back = await open(load(doc, { person: refusingStorage(), settings }), second);
      check('l\'ancienne table recréée vide par une copie plus ancienne : aucune question, elle n\'est pas supprimée d\'office', back.action === 'kept' && second.calls.length === 0 && doc.removed.length === 1, JSON.stringify([back.action, second.calls, doc.removed]));
      doc.rowsOf('Publipostage_PreferencesModeles').push({ id: 5, Utilisateur: ME, ModeleId: 0, Dossier: 'Z' });
      const third = stubAsk({ choose: 'merge', confirm: true });
      const news = await open(load(doc, { person: refusingStorage(), settings }), third);
      check('recréée AVEC une ligne à reprendre : la réunion est reproposée, puis la suppression', news.action === 'removed' && third.calls.join() === 'choose,confirm' && doc.rowsOf('Publipostage_TemplatePreferences').some(row => row.Folder === 'Z'), JSON.stringify([news.action, third.calls]));
    }
    {
      // La suppression est refusée par le document (droits) : la personne l'a lu, la question ne revient pas à chaque ouverture ; ce n'est pas une réponse pour l'équipe.
      const doc = build();
      const settings = documentSettings();
      const person = storageOf();
      doc.applyUserActionsBase = doc.applyUserActions.bind(doc);
      doc.applyUserActions = async actions => { if (actions.some(action => action[0] === 'RemoveTable')) throw new Error('Droits insuffisants'); return doc.applyUserActionsBase(actions); };
      const first = stubAsk({ choose: 'merge', confirm: true });
      const outcome = await open(load(doc, { person, settings }), first);
      check('suppression refusée par le document : la personne en est prévenue une fois', outcome.action === 'merged' && first.calls.join() === 'choose,confirm,notice' && doc.removed.length === 0, JSON.stringify([outcome.action, first.calls]));
      const second = stubAsk({ choose: 'merge', confirm: true });
      const again = await open(load(doc, { person, settings }), second);
      check('suppression refusée : rouvert, plus de fenêtre pour cette personne', again.action === 'kept' && second.calls.length === 0, JSON.stringify([again.action, second.calls]));
      check('suppression refusée : rien n\'en est écrit dans le document (une autre personne, qui a le droit, sera interrogée)', Object.keys(settings.bag).length === 0, JSON.stringify(settings.bag));
    }
    {
      // Deux paires : seule celle dont l'ancienne table a de nouvelles lignes revient avec la réunion ; l'autre, déjà tranchée, n'est pas reposée.
      const build2 = () => new GenericDoc()
        .addTable('Publipostage_PageFormats', { Name: 'Text', Width: 'Numeric', Height: 'Numeric' }, [{ Name: 'A4', Width: 210, Height: 297 }])
        .addTable('Publipostage_FormatsPage', { Nom: 'Text', Largeur: 'Numeric', Hauteur: 'Numeric' }, [{ Nom: 'A4', Largeur: 210, Hauteur: 297 }])
        .addTable('Publipostage_TableLinks', { TargetTable: 'Text', TargetColumn: 'Text', SourceColumn: 'Text', SourceTable: 'Text' }, [])
        .addTable('Publipostage_LiensTables', { TableCible: 'Text', ColonneCible: 'Text', ColonneSource: 'Text', TableSource: 'Text' }, []);
      const doc = build2();
      const settings = documentSettings();
      const first = stubAsk({ choose: 'merge', confirm: false });
      await open(load(doc, { person: refusingStorage(), settings }), first);
      check('deux paires sans rien à reprendre : la suppression de chacune est demandée une fois (« La garder » deux fois)', first.calls.join() === 'confirm,confirm' && settings.bag.doublesKept.length === 2, JSON.stringify([first.calls, settings.bag]));
      doc.rowsOf('Publipostage_LiensTables').push({ id: 3, TableCible: 'T', ColonneCible: 'c', ColonneSource: 's', TableSource: 'S' });
      const second = stubAsk({ choose: 'merge', confirm: false });
      const news = await open(load(doc, { person: refusingStorage(), settings }), second);
      check('une ligne arrivée dans UNE ancienne table : la réunion et la suppression de celle-là seulement', second.calls.join() === 'choose,confirm' && doc.rowsOf('Publipostage_TableLinks').length === 1, JSON.stringify([news.action, second.calls]));
    }
  }

  summarizeAndExit();
}

main();
