#!/usr/bin/env node
// Tests purs (sans navigateur) de l'historique des versions d'un modèle : js/versions-store.js (le magasin) et ce que js/templates.js en fait à chaque enregistrement
// (Templates.save, Templates.restoreVersion, Templates.remove) - cf. dev-tests/unit-harness.mjs pour le contexte général. Étude : historique-des-modifications-2026-10-13,
// voie 3 : « une table dédiée, chargée seulement quand on accède à l'historique ». Ici, sur un faux document dont les lots sont atomiques comme ceux de Grist (un lot refusé ne
// laisse rien), qui journalise chaque appel et chaque lecture, et une horloge que le test avance à volonté (les règles de 5 et de 10 minutes se jouent sans attendre) :
//  1) ce que la table coûte : jamais lue à l'enregistrement, créée au moment de la première version gardée seulement, et la version part dans le MÊME lot que le modèle ;
//  2) quand une version est gardée : le premier enregistrement de la session, une autre personne, un état de 5 minutes, 10 minutes depuis la dernière copie - et jamais pour un
//     état identique, jamais deux fois le même état ;
//  3) qui a écrit : « Nom <adresse> », l'adresse seule, ou rien quand la personne n'est pas identifiée ; l'état d'une autre personne est relu quand le cache a plus de 3 s ;
//  4) ce que garde une version : l'état remplacé (pas le nouveau), avec son jeton, sa date et son auteur, lisible après coup ;
//  5) restaurer : le nom d'aujourd'hui est gardé, l'état remplacé est gardé d'office (genre « restauration »), un autre type de modèle est refusé ;
//  6) une copie qui échoue n'empêche jamais d'enregistrer : lot rejoué sans elle, copies suspendues dix minutes ; l'erreur d'origine remonte quand le lot échoue aussi sans ;
//     un compte sans droit de structure enregistre sans la colonne « Modifié par », sans la redemander à chaque fois ;
//  7) l'ouverture de l'historique : LA lecture de la table, plafonds (30 par modèle, 3 millions de caractères, jamais une version nommée ni la plus récente d'un modèle),
//     versions des modèles supprimés retirées après un délai de grâce, table absente ou modèle sans jeton = historique vide sans rien créer, ménage de fond tous les 400 ajouts ;
//  8) supprimer un modèle ne lit rien, et un numéro de ligne redonné par Grist ne reprend pas les règles de l'ancien modèle ;
//  9) le format : JSON canonique, gzip + base64 (« gz1: »), repli « raw1: » sans compression, version illisible refusée ;
// 10) js/templates.js seul (page d'essai sans le magasin) enregistre comme avant ;
// 11) les textes de la fonction (js/i18n.js) : chacun existe en français et en anglais avec les mêmes {trous}, tout texte demandé par le code existe, aucun n'est orphelin
//     (la langue ne change qu'au rechargement de la page : un texte absent d'une des deux langues se verrait pour de bon) ;
// 12) le chargement des modules de l'historique (la fenêtre, la comparaison) : une balise inerte chacun, chargé au premier besoin seulement et une seule fois, un module déjà là n'est pas
//     rechargé, une balise absente ou un chargement qui échoue refuse sans rien garder (le geste suivant réessaie).
// Lancer : node dev-tests/unit-versions.mjs
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = 'Publipostage_Modeles';
const VERSIONS = 'Publipostage_Versions';
const PROBE = 'Publipostage_UserProbe';
const START = Date.UTC(2026, 9, 14, 9, 0, 0);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const json = (value) => JSON.stringify(value);
const sameList = (a, b) => json(a) === json(b);

const MODEL_COLUMNS = {
  Nom: 'Text', Contenu: 'Text', NomFichierPDF: 'Text', DateModif: 'DateTime', HeaderFooter: 'Text', EstParDefaut: 'Bool', Margins: 'Text',
  TypeModele: 'Text', Destinataires: 'Text', Cc: 'Text', Cci: 'Text', Objet: 'Text', SuiviModifications: 'Text', ModifiePar: 'Text',
};
const VERSION_COLUMNS = ['Jeton', 'Date', 'Auteur', 'Nom', 'Genre', 'Donnees'];

// Faux document : des tables en colonnes typées, un journal des lots appliqués, un registre de TOUS les appels (réussis ou refusés) et des lectures. Un lot est atomique, comme dans
// Grist : une action qui échoue défait celles d'avant (le faux stub de la page, lui, applique action par action).
class Doc {
  constructor({ models = MODEL_COLUMNS, user = null } = {}) {
    this.tables = {};
    this.nextId = {};
    this.journal = [];   // les actions APPLIQUÉES, dans l'ordre
    this.calls = [];     // chaque applyUserActions : { actions, ok, error }
    this.reads = [];     // chaque fetchTable : le nom de la table
    this.user = user;    // { email, name } : user.Email / user.Name de la personne qui écrit
    this.denyTables = new Set();
    this.denyStructure = false;
    this.failReads = new Set();
    this.addTable(MODELS, models);
  }

  addTable(id, columns) { this.tables[id] = { cols: Object.assign({}, columns), rows: [] }; this.nextId[id] = 1; }
  addRow(table, fields) {
    const row = Object.assign({ id: this.nextId[table]++ }, fields);
    Object.keys(this.tables[table].cols).forEach((c) => { if (row[c] === undefined) row[c] = null; });
    this.tables[table].rows.push(row);
    return row.id;
  }
  rows(table) { return this.tables[table] ? this.tables[table].rows : []; }
  row(table, id) { return this.rows(table).find((r) => r.id === id) || null; }
  touching(table) { return this.calls.filter((c) => c.actions.some((a) => a[1] === table)); }
  readsOf(table) { return this.reads.filter((r) => r === table).length; }
  versionAdds() { return this.journal.filter((a) => a[0] === 'AddRecord' && a[1] === VERSIONS).length; }

  stored(type, value) { return type === 'DateTime' && typeof value === 'string' ? Math.floor(Date.parse(value) / 1000) : value; }

  async listTables() { return Object.keys(this.tables); }

  async fetchTable(tableId) {
    this.reads.push(tableId);
    if (this.failReads.has(tableId)) throw new Error('Table illisible : ' + tableId);
    const table = this.tables[tableId];
    if (!table) throw new Error('Invalid table ' + tableId);
    const out = { id: table.rows.map((r) => r.id) };
    Object.keys(table.cols).forEach((c) => { out[c] = table.rows.map((r) => (r[c] === undefined ? null : r[c])); });
    return JSON.parse(JSON.stringify(out));
  }

  async applyUserActions(actions) {
    const entry = { actions: JSON.parse(JSON.stringify(actions)), ok: false, error: null };
    this.calls.push(entry);
    const snapshot = JSON.stringify({ tables: this.tables, nextId: this.nextId });
    try {
      const retValues = [];
      for (const action of actions) {
        const [type, tableId] = action;
        if (this.denyTables.has(tableId)) throw new Error('Blocked by access rules : ' + tableId + ' (appel n° ' + this.calls.length + ')'); // le numéro distingue l'erreur d'un essai de celle du suivant
        if (this.denyStructure && ['AddTable', 'AddColumn', 'AddVisibleColumn', 'RemoveTable'].includes(type)) throw new Error('Blocked by access rules : structure du document');
        retValues.push(this.apply(action));
      }
      entry.ok = true;
      this.journal.push(...actions.map((a) => JSON.parse(JSON.stringify(a))));
      return { retValues };
    } catch (error) {
      const restored = JSON.parse(snapshot);
      this.tables = restored.tables;
      this.nextId = restored.nextId;
      entry.error = error.message;
      throw error;
    }
  }

  apply(action) {
    const [type, tableId] = action;
    if (type === 'AddTable') {
      let id = tableId;
      let n = 2;
      while (this.tables[id]) id = tableId + n++; // Grist renomme un identifiant déjà pris : le signe d'une table créée deux fois
      const columns = {};
      action[2].forEach((c) => { columns[c.id] = c.type; });
      this.addTable(id, columns);
      return { table_id: id, columns: action[2].map((c) => c.id), views: [] };
    }
    const table = this.tables[tableId];
    if (!table) throw new Error('Invalid table ' + tableId);
    if (type === 'AddVisibleColumn' || type === 'AddColumn') {
      let id = action[2];
      let n = 2;
      while (id in table.cols) id = action[2] + n++;
      table.cols[id] = (action[3] && action[3].type) || 'Text';
      table.rows.forEach((r) => { r[id] = null; });
      return { colId: id };
    }
    if (type === 'AddRecord') {
      const fields = action[3] || {};
      const unknown = Object.keys(fields).find((c) => !(c in table.cols));
      if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
      const row = { id: this.nextId[tableId]++ };
      Object.keys(table.cols).forEach((c) => { row[c] = null; });
      Object.keys(fields).forEach((c) => { row[c] = this.stored(table.cols[c], fields[c]); });
      if (tableId === PROBE && this.user) {
        if ('Email' in table.cols) row.Email = this.user.email;
        if ('Name' in table.cols) row.Name = this.user.name;
      }
      table.rows.push(row);
      return row.id;
    }
    if (type === 'UpdateRecord') {
      const row = table.rows.find((r) => r.id === action[2]);
      if (!row) throw new Error('Invalid row id ' + action[2]);
      const fields = action[3] || {};
      const unknown = Object.keys(fields).find((c) => !(c in table.cols));
      if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
      Object.keys(fields).forEach((c) => { row[c] = this.stored(table.cols[c], fields[c]); });
      return null;
    }
    if (type === 'RemoveRecord' || type === 'BulkRemoveRecord') {
      const ids = Array.isArray(action[2]) ? action[2] : [action[2]];
      table.rows = table.rows.filter((r) => !ids.includes(r.id));
      return null;
    }
    throw new Error('Doc : action non supportée ' + type);
  }
}

// Un contexte par scénario : les modules gardent un état (schéma, jeton, copies de la session) qui ne doit pas fuiter d'un scénario à l'autre, comme un rechargement de page.
// L'horloge du contexte (Date.now et new Date()) est celle du test ; les minuteries sont notées, jamais lancées toutes seules.
function fresh(doc, { compression = true, versions = true } = {}) {
  const warnings = [];
  const timers = [];
  const globals = {
    grist: { docApi: doc, ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; } },
    console: { log() {}, warn(...a) { warnings.push(a.map(String).join(' ')); }, error(...a) { warnings.push(a.map(String).join(' ')); } },
    Blob, Response, btoa, atob, crypto: globalThis.crypto,
    HtmlSanitize: { clean: (html) => String(html) }, // le filtre du HTML des en-têtes (js/html-sanitize.js) : ici sans effet, seuls les états comptent
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  };
  if (compression) { globals.CompressionStream = CompressionStream; globals.DecompressionStream = DecompressionStream; }
  const ctx = createContext(globals);
  evalIn(ctx, `globalThis.__clock = { now: ${START} };
    (function () {
      const Real = Date;
      class Fake extends Real {
        constructor(...args) { if (args.length === 0) super(globalThis.__clock.now); else super(...args); }
        static now() { return globalThis.__clock.now; }
      }
      globalThis.Date = Fake;
    })();`);
  ['js/grist-api.js', 'js/templates.js'].concat(versions ? ['js/versions-store.js'] : []).forEach((s) => loadScript(ctx, s));
  const run = (expr) => evalIn(ctx, expr);
  const t = {
    ctx, doc, warnings, timers, run,
    advance: (ms) => { run(`__clock.now += ${ms}`); },
    now: () => run('__clock.now'),
    unpack: (text) => run(`VersionsStore.unpack(${json(text)})`),
    // La personne devant l'écran : son adresse (et son nom) sont lus par la table-sonde, comme dans le widget.
    async identify(user) {
      doc.user = user;
      await run('GristAPI.getCurrentUserEmail()');
      if (user.name !== undefined) await run('GristAPI.getCurrentUserName()');
    },
    async create(nom, html, extra = {}) {
      const saved = await run(`Templates.save(null, ${json(nom)}, ${json(html)}, '', null, null, ${json(extra.type || 'document')}, ${json(extra.email || null)}, ${json(extra.track || {})})`);
      await run('Templates.loadAll()');
      return saved.id;
    },
    save(id, html, extra = {}) {
      const nom = extra.nom || run(`Templates.byId(${id}).nom`);
      return run(`Templates.save(${id}, ${json(nom)}, ${json(html)}, '', null, null, ${json(extra.type || 'document')}, ${json(extra.email || null)}, ${json(extra.track || {})})`);
    },
    // Les contenus gardés par les versions du document, dans l'ordre où elles ont été ajoutées.
    async contents() {
      return Promise.all(doc.rows(VERSIONS).map(async (r) => (await t.unpack(r.Donnees)).contenu));
    },
  };
  return t;
}

// Un document où deux modèles portent un jeton (pour l'ouverture de l'historique et les plafonds).
function documentWithTokens() {
  const doc = new Doc({ models: Object.assign({ Jeton: 'Text' }, MODEL_COLUMNS) });
  const a = doc.addRow(MODELS, { Nom: 'Contrat A', Contenu: '<p>a</p>', TypeModele: 'document', Jeton: 'tokA', DateModif: START / 1000, ModifiePar: 'Ada <ada@exemple.fr>' });
  const b = doc.addRow(MODELS, { Nom: 'Contrat B', Contenu: '<p>b</p>', TypeModele: 'document', Jeton: 'tokB', DateModif: START / 1000 });
  const c = doc.addRow(MODELS, { Nom: 'Sans jeton', Contenu: '<p>c</p>', TypeModele: 'document' });
  doc.addTable(VERSIONS, Object.fromEntries(VERSION_COLUMNS.map((c2) => [c2, c2 === 'Date' ? 'DateTime' : 'Text'])));
  return { doc, a, b, c };
}
const versionRow = (token, minutesAgo, extra = {}) => Object.assign({ Jeton: token, Date: (START - minutesAgo * MIN) / 1000, Auteur: 'Ada <ada@exemple.fr>', Nom: '', Genre: '', Donnees: 'raw1:{"v":1,"contenu":"<p>x</p>"}' }, extra);

async function main() {
  // === 1. Ce que la table coûte ===
  {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    check('créer un modèle ne garde aucune version et ne crée pas la table', !doc.tables[VERSIONS] && doc.touching(VERSIONS).length === 0);
    check('le modèle porte son auteur : « Nom <adresse> »', doc.row(MODELS, id).ModifiePar === 'Moi Même <moi@exemple.fr>', doc.row(MODELS, id).ModifiePar);
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    const batch = doc.calls.filter((c) => c.ok && c.actions.some((a) => a[0] === 'AddRecord' && a[1] === VERSIONS));
    check('la première version gardée part dans le MÊME lot que le modèle : UpdateRecord puis AddRecord, un seul appel',
      batch.length === 1 && batch[0].actions.length === 2 && batch[0].actions[0][0] === 'UpdateRecord' && batch[0].actions[0][1] === MODELS && batch[0].actions[1][1] === VERSIONS, json(batch.map((c) => c.actions.map((a) => a[0] + ':' + a[1]))));
    const created = doc.calls.filter((c) => c.actions.some((a) => a[0] === 'AddTable' && a[1] === VERSIONS));
    check('la table des versions est créée à ce moment-là, une seule fois, avec ses six colonnes', created.length === 1 && sameList(created[0].actions[0][2].map((c) => c.id), VERSION_COLUMNS), json(created.map((c) => c.actions)));
    check('la table des versions n\'a jamais été lue : ni au chargement, ni à l\'enregistrement', doc.readsOf(VERSIONS) === 0, doc.reads.join(','));
    const row = doc.rows(VERSIONS)[0];
    const state = await t.unpack(row.Donnees);
    check('la version garde l\'état REMPLACÉ (v1), pas le nouveau', state.contenu === '<p>v1</p>' && doc.row(MODELS, id).Contenu === '<p>v2</p>', state.contenu);
    check('la version porte le jeton du modèle (créé à ce moment-là), sa date d\'origine et son auteur', row.Jeton && row.Jeton === doc.row(MODELS, id).Jeton && row.Date === START / 1000 && row.Auteur === 'Moi Même <moi@exemple.fr>' && row.Genre === '' && row.Nom === '', json(row));
    check('l\'état gardé est lu avec son format (v 1), son type et sans le nom du modèle', state.v === 1 && state.typeModele === 'document' && !('nom' in state), json(Object.keys(state)));
    t.advance(MIN);
    await t.save(id, '<p>v2</p>');
    check('enregistrer un état identique ne garde rien', doc.rows(VERSIONS).length === 1 && doc.versionAdds() === 1);
  }

  // === 2. Quand une version est gardée ===
  {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    const steps = [
      [30 * SEC, 'v2', 1, 'le premier enregistrement de la session garde l\'état remplacé (aucune copie encore)'],
      [30 * SEC, 'v3', 1, 'une minute plus tard, même personne, état de 30 s, dernière copie récente : rien'],
      [3 * MIN, 'v4', 1, 'état de 3 minutes (moins de 5), dernière copie de 3,5 minutes : rien'],
      [3 * MIN, 'v5', 1, 'état de 3 minutes, dernière copie de 6,5 minutes (moins de 10) : rien'],
      [4 * MIN, 'v6', 2, 'dix minutes et demie depuis la dernière copie : on garde, même si l\'état n\'a que 4 minutes'],
      [MIN, 'v7', 2, 'une minute plus tard : rien'],
      [6 * MIN, 'v8', 3, 'l\'état remplacé a 6 minutes (au moins 5) : on garde'],
    ];
    for (const [wait, name, expected, why] of steps) {
      t.advance(wait);
      await t.save(id, `<p>${name}</p>`);
      check(`règles de garde, ${name} : ${why}`, doc.rows(VERSIONS).length === expected, `${doc.rows(VERSIONS).length} version(s), attendu ${expected}`);
    }
    check('les versions gardées sont celles qui précédaient chaque copie : v1, v5, v7', sameList(await t.contents(), ['<p>v1</p>', '<p>v5</p>', '<p>v7</p>']), json(await t.contents()));
  }

  // 3. Une autre personne, le cache de 3 secondes, l'identité inconnue.
  {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    check('(préparation) une version déjà gardée dans la session', doc.rows(VERSIONS).length === 1);
    // Une autre personne enregistre le même modèle derrière le dos du widget, juste avant ce nouvel enregistrement.
    const elsewhere = (modifiePar, contenu) => {
      const row = doc.row(MODELS, id);
      row.Contenu = contenu;
      row.ModifiePar = modifiePar;
      row.DateModif = Math.floor(t.now() / 1000);
    };
    t.advance(10 * SEC);
    elsewhere('Autre <autre@exemple.fr>', '<p>autre</p>');
    const readsBefore = doc.readsOf(MODELS);
    await t.save(id, '<p>v3</p>');
    const rows = doc.rows(VERSIONS);
    check('l\'état d\'une AUTRE personne est gardé avant d\'être écrasé, même tout juste après une copie', rows.length === 2, rows.length);
    check('... c\'est bien son contenu (relu : le cache avait plus de 3 s) et son nom', rows.length === 2 && (await t.unpack(rows[1].Donnees)).contenu === '<p>autre</p>' && rows[1].Auteur === 'Autre <autre@exemple.fr>', rows.length === 2 ? rows[1].Auteur : '');
    check('... la table des modèles est relue pour cela (cache de plus de 3 s)', doc.readsOf(MODELS) - readsBefore === 2, doc.readsOf(MODELS) - readsBefore);
    // Un état déjà gardé en dernier (ici l'état de l'autre personne, remis tel quel par un « Annuler » de Grist ou par elle) n'est pas gardé une seconde fois.
    t.advance(10 * SEC);
    elsewhere('Troisième <troisieme@exemple.fr>', '<p>autre</p>');
    await t.save(id, '<p>v3b</p>');
    check('l\'état qui vient d\'être gardé, retrouvé tel quel, n\'est pas gardé deux fois (même d\'une autre personne)', doc.rows(VERSIONS).length === 2, doc.rows(VERSIONS).length);
    // La même personne sous une autre graphie (casse, nom différent) n'est pas une autre personne.
    t.advance(10 * SEC);
    elsewhere('MOI <MOI@exemple.fr>', '<p>moi ailleurs</p>');
    await t.save(id, '<p>v4</p>');
    check('la même adresse sous une autre graphie (casse, nom) n\'est pas une autre personne : rien de gardé', doc.rows(VERSIONS).length === 2, doc.rows(VERSIONS).length);
    // Auteur inconnu d'un côté : les règles de temps seules décident.
    t.advance(10 * SEC);
    elsewhere('', '<p>sans auteur</p>');
    await t.save(id, '<p>v5</p>');
    check('un état sans auteur connu suit les règles de temps (récent : rien)', doc.rows(VERSIONS).length === 2, doc.rows(VERSIONS).length);
    // Cache frais : moins de 3 s après une écriture de ce widget, la table n'est pas relue pour savoir ce qu'on remplace.
    t.advance(MIN);
    await t.save(id, '<p>v6</p>');
    const freshBefore = doc.readsOf(MODELS);
    t.advance(SEC);
    await t.save(id, '<p>v7</p>');
    const freshReads = doc.readsOf(MODELS) - freshBefore;
    t.advance(10 * SEC);
    const staleBefore = doc.readsOf(MODELS);
    await t.save(id, '<p>v8</p>');
    const staleReads = doc.readsOf(MODELS) - staleBefore;
    check('cache de moins de 3 s : une lecture de moins qu\'avec un cache plus ancien (celle de l\'état remplacé)', staleReads - freshReads === 1, `${freshReads} contre ${staleReads}`);
  }

  // 4. Ce que le modèle garde de son auteur.
  for (const [label, user, expected] of [
    ['nom et adresse connus : « Nom <adresse> »', { email: 'a@exemple.fr', name: 'Ada Lovelace' }, 'Ada Lovelace <a@exemple.fr>'],
    ['adresse seule (Grist ne donne aucun nom)', { email: 'b@exemple.fr', name: '' }, 'b@exemple.fr'],
    ['personne non identifiée : colonne vide', null, ''],
  ]) {
    const doc = new Doc();
    const t = fresh(doc);
    if (user) await t.identify(user);
    const id = await t.create('Contrat', '<p>v1</p>');
    t.advance(SEC);
    await t.save(id, '<p>v2</p>');
    check(`ModifiePar, ${label}`, doc.row(MODELS, id).ModifiePar === expected && doc.calls.every((c) => c.ok), json(doc.row(MODELS, id).ModifiePar));
  }

  // 5. Restaurer.
  {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>', { email: null });
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    const old = await t.unpack(doc.rows(VERSIONS)[0].Donnees);
    t.advance(20 * SEC);
    await t.save(id, '<p>v2</p>', { nom: 'Contrat renommé' });
    const restoredAt = doc.rows(VERSIONS).length;
    t.advance(20 * SEC);
    const result = await t.run(`Templates.restoreVersion(${id}, ${json(old)})`);
    const row = doc.row(MODELS, id);
    check('restaurer remet le contenu de la version dans le modèle, sous le nom d\'aujourd\'hui', row.Contenu === '<p>v1</p>' && row.Nom === 'Contrat renommé', json([row.Contenu, row.Nom]));
    check('restaurer rend { id, dateModif } comme un enregistrement', result && result.id === id && result.dateModif !== undefined, json(result));
    const copies = doc.rows(VERSIONS);
    check('l\'état remplacé est gardé d\'office (genre restauration), même si les règles de temps ne le demandaient pas', copies.length === restoredAt + 1 && copies[copies.length - 1].Genre === 'restauration', json(copies.map((c) => c.Genre)));
    check('... et c\'est bien l\'état d\'avant la restauration', copies.length > restoredAt && (await t.unpack(copies[copies.length - 1].Donnees)).contenu === '<p>v2</p>');
    check('la restauration porte l\'auteur de la personne qui restaure', row.ModifiePar === 'Moi Même <moi@exemple.fr>');
    const callsBefore = doc.calls.length;
    t.advance(SEC);
    await t.run(`Templates.restoreVersion(${id}, ${json(old)})`);
    check('restaurer l\'état qui est déjà celui du modèle ne garde rien de plus', doc.rows(VERSIONS).length === copies.length);
    const refused = await t.run(`Templates.restoreVersion(${id}, ${json(Object.assign({}, old, { typeModele: 'email' }))})`).then(() => false, (e) => e.message);
    check('une version d\'un autre type de modèle est refusée, rien n\'est écrit', typeof refused === 'string' && /autre type/.test(refused) && doc.calls.length === callsBefore + 1, refused);
    const gone = await t.run('Templates.restoreVersion(9999, ' + json(old) + ')').then(() => false, (e) => e.message);
    check('un modèle qui n\'existe plus : refusé', typeof gone === 'string' && /introuvable/.test(gone), gone);
  }

  // 6. Une copie qui échoue n'empêche jamais d'enregistrer.
  async function modelWithCopy() {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    return { doc, t, id };
  }
  {
    // 6a. La table des versions refuse l'écriture.
    const { doc, t, id } = await modelWithCopy();
    doc.denyTables.add(VERSIONS);
    t.advance(6 * MIN);
    const before = doc.calls.length;
    await t.save(id, '<p>v3</p>');
    const attempts = doc.calls.slice(before).filter((c) => c.actions.some((a) => a[1] === MODELS));
    check('6a. table des versions refusée : le modèle est enregistré', doc.row(MODELS, id).Contenu === '<p>v3</p>');
    check('6a. ... le lot est d\'abord tenté avec la copie, puis rejoué sans elle', attempts.length === 2 && !attempts[0].ok && attempts[0].actions.some((a) => a[1] === VERSIONS) && attempts[1].ok && !attempts[1].actions.some((a) => a[1] === VERSIONS), json(attempts.map((c) => [c.ok, c.actions.length])));
    check('6a. ... les copies s\'arrêtent dix minutes', t.run('VersionsStore.usable()') === false && t.warnings.some((w) => /suspendues/.test(w)));
    t.advance(MIN);
    const mark = doc.calls.length;
    await t.save(id, '<p>v4</p>');
    check('6a. ... l\'enregistrement suivant ne tente plus la copie : un seul appel', doc.calls.slice(mark).filter((c) => c.actions.some((a) => a[1] === MODELS)).length === 1 && doc.calls.slice(mark).every((c) => !c.actions.some((a) => a[1] === VERSIONS)));
    t.advance(10 * MIN);
    check('6a. ... dix minutes plus tard, les copies reprennent', t.run('VersionsStore.usable()') === true);
    doc.denyTables.delete(VERSIONS);
    const rowsBefore = doc.rows(VERSIONS).length;
    await t.save(id, '<p>v5</p>');
    check('6a. ... et gardent de nouveau l\'état remplacé quand le refus est levé', doc.rows(VERSIONS).length === rowsBefore + 1);
  }
  {
    // 6b. Pas de droit de structure : ni jeton, ni table.
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    doc.denyStructure = true;
    t.advance(30 * SEC);
    const before = doc.calls.length;
    await t.save(id, '<p>v2</p>');
    const saves = doc.calls.slice(before).filter((c) => c.actions.some((a) => a[1] === MODELS && a[0] === 'UpdateRecord' && 'Contenu' in a[3]));
    check('6b. sans droit d\'ajouter une colonne ni une table : le modèle est enregistré, en un seul appel, sans copie', doc.row(MODELS, id).Contenu === '<p>v2</p>' && saves.length === 1 && saves[0].ok && !saves[0].actions.some((a) => a[1] === VERSIONS), json(saves.map((c) => c.actions.length)));
    check('6b. ... les copies sont suspendues (pas de nouvel essai à chaque enregistrement)', t.run('VersionsStore.usable()') === false);
  }
  {
    // 6c. Jeton posé, table absente, structure refusée.
    const doc = new Doc({ models: Object.assign({ Jeton: 'Text' }, MODEL_COLUMNS) });
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    doc.row(MODELS, id).Jeton = 'jeton-pose';
    await t.run('Templates.loadAll()');
    doc.denyStructure = true;
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    check('6c. table des versions impossible à créer : le modèle est enregistré, aucune table ne naît', doc.row(MODELS, id).Contenu === '<p>v2</p>' && !doc.tables[VERSIONS] && t.run('VersionsStore.usable()') === false);
  }
  {
    // 6d. Les écritures du modèle échouent aussi : l'erreur d'origine remonte, rien ne se suspend.
    const { doc, t, id } = await modelWithCopy();
    doc.denyTables.add(MODELS);
    t.advance(6 * MIN);
    const before = doc.calls.length;
    const failure = await t.save(id, '<p>v3</p>').then(() => null, (e) => e);
    const first = doc.calls.slice(before).find((c) => !c.ok);
    check('6d. le lot échoue avec et sans la copie : l\'erreur du premier essai remonte', !!failure && !!first && failure.message === first.error, failure && failure.message);
    check('6d. ... les copies ne sont pas suspendues (la copie n\'y était pour rien)', t.run('VersionsStore.usable()') === true);
  }
  {
    // 6e. Une colonne de la table des versions supprimée à la main : le lot entier est refusé par Grist, rejoué sans la copie.
    const { doc, t, id } = await modelWithCopy();
    delete doc.tables[VERSIONS].cols.Genre;
    t.advance(6 * MIN);
    const mark = doc.journal.length;
    await t.save(id, '<p>v3</p>');
    const updates = doc.journal.slice(mark).filter((a) => a[0] === 'UpdateRecord' && a[1] === MODELS);
    check('6e. colonne des versions disparue : le modèle est enregistré une seule fois (le lot refusé n\'a rien laissé)', doc.row(MODELS, id).Contenu === '<p>v3</p>' && updates.length === 1, updates.length);
    check('6e. ... les copies sont suspendues', t.run('VersionsStore.usable()') === false);
  }
  {
    // 6f. Un état trop lourd (images collées) n'est pas gardé, sans suspendre ni créer la table.
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const heavy = '<p>' + randomBytes(1300000).toString('base64') + '</p>';
    const id = await t.create('Lourd', heavy);
    t.advance(30 * SEC);
    await t.save(id, '<p>léger</p>');
    check('6f. un état de plus de 1,5 million de caractères compressés n\'est pas gardé : modèle enregistré, table non créée, copies non suspendues', doc.row(MODELS, id).Contenu === '<p>léger</p>' && !doc.tables[VERSIONS] && t.run('VersionsStore.usable()') === true);
  }
  {
    // 6g. Un compte qui ne peut pas ajouter de colonne : la colonne « Modifié par » n'est ni écrite ni redemandée.
    const columns = Object.assign({}, MODEL_COLUMNS);
    delete columns.ModifiePar;
    const doc = new Doc({ models: columns });
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    doc.denyStructure = true;
    const loaded = await t.run('Templates.loadAll()').then(() => true, () => false);
    const attempts = () => doc.calls.filter((c) => c.actions.some((a) => a[0] === 'AddVisibleColumn' && a[2] === 'ModifiePar')).length;
    check('6g. sans droit de structure : la liste des modèles se charge quand même', loaded);
    const id = doc.addRow(MODELS, { Nom: 'Contrat', Contenu: '<p>v1</p>', TypeModele: 'document', DateModif: START / 1000 });
    await t.run('Templates.loadAll()');
    const saved = await t.save(id, '<p>v2</p>').then(() => true, (e) => e.message);
    await t.save(id, '<p>v3</p>');
    check('6g. ... l\'enregistrement marche, sans la colonne « Modifié par » (une écriture dessus annulerait le lot)', saved === true && doc.row(MODELS, id).Contenu === '<p>v3</p>' && !('ModifiePar' in doc.row(MODELS, id)), String(saved));
    check('6g. ... la colonne n\'a été demandée qu\'une fois en tout (pas à chaque chargement ni à chaque enregistrement)', attempts() === 1, attempts());
    t.advance(11 * MIN);
    doc.denyStructure = false;
    await t.run('Templates.loadAll()');
    check('6g. ... dix minutes plus tard, la colonne est demandée de nouveau (et créée quand le droit existe)', attempts() === 2 && 'ModifiePar' in doc.row(MODELS, id), attempts());
    await t.save(id, '<p>v4</p>');
    check('6g. ... et l\'auteur est écrit', doc.row(MODELS, id).ModifiePar === 'Moi Même <moi@exemple.fr>', doc.row(MODELS, id).ModifiePar);
  }

  // === 7. L'ouverture de l'historique et les plafonds ===
  {
    // Plafonds seuls (planCleanup, sans document).
    const t = fresh(new Doc());
    const entry = (rowId, token, hoursAgo, extra = {}) => Object.assign({ rowId, token, at: START - hoursAgo * HOUR, name: '', genre: '', author: '', data: '', size: 1000 }, extra);
    const plan = (entries, known) => t.run(`VersionsStore.planCleanup(${json(entries)}, ${known ? `new Set(${json(known)})` : 'null'}, ${START})`).slice().sort((a, b) => a - b);
    const autos = (token, count, first = 1) => Array.from({ length: count }, (_, i) => entry(first + i, token, i + 1));
    check('plafond par modèle : 35 versions gardées toutes seules, les 5 plus anciennes partent', sameList(plan(autos('A', 35), ['A']), [31, 32, 33, 34, 35]), json(plan(autos('A', 35), ['A'])));
    check('plafond par modèle : 30 versions, aucune ne part', plan(autos('A', 30), ['A']).length === 0);
    const named = Array.from({ length: 10 }, (_, i) => entry(100 + i, 'A', 40 + i, { name: 'Avant envoi' }));
    check('plafond par modèle : les versions nommées ne comptent pas et ne partent jamais', plan(autos('A', 30).concat(named), ['A']).length === 0);
    check('plafond par modèle : chaque modèle a le sien', plan(autos('A', 30).concat(autos('B', 30, 200)), ['A', 'B']).length === 0);
    const orphans = [entry(300, 'Z', 0.2), entry(301, 'Z', 0.05)];
    check('modèle supprimé : ses versions de plus de dix minutes partent, celles de moins de dix minutes attendent', sameList(plan(orphans, ['A']), [300]), json(plan(orphans, ['A'])));
    check('modèle supprimé : sans liste de jetons connus (ménage de fond), rien n\'est cherché', plan(orphans, null).length === 0);
    check('modèle supprimé : même une version nommée part avec lui', sameList(plan([entry(302, 'Z', 5, { name: 'Gardée' })], ['A']), [302]));
    const big = (rowId, token, hoursAgo, extra = {}) => entry(rowId, token, hoursAgo, Object.assign({ size: 400000 }, extra));
    const cap = [1, 2, 3, 4].map((i) => big(i, 'A', i)).concat([5, 6, 7, 8].map((i) => big(i, 'B', i))).concat([9, 10, 11, 12].map((i) => big(i, 'C', i)));
    check('plafond du document (3 millions de caractères) : les plus anciennes partent d\'abord, jusqu\'à passer dessous ; la plus récente de chaque modèle reste',
      sameList(plan(cap, ['A', 'B', 'C']), [7, 8, 10, 11, 12]), json(plan(cap, ['A', 'B', 'C'])));
    const allNamed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => big(i, 'A', i, { name: 'Version ' + i }));
    check('plafond du document : des versions toutes nommées restent, même au-dessus', plan(allNamed, ['A']).length === 0);
  }
  {
    // open() : la lecture de la table, à l'ouverture seulement.
    const { doc, a, b, c } = documentWithTokens();
    const t = fresh(doc);
    doc.addRow(VERSIONS, versionRow('tokA', 60, { Donnees: 'raw1:{"v":1,"contenu":"<p>A ancien</p>"}' }));
    doc.addRow(VERSIONS, versionRow('tokA', 5, { Nom: 'Avant envoi', Auteur: 'Bob <bob@exemple.fr>', Donnees: 'raw1:{"v":1,"contenu":"<p>A récent</p>"}' }));
    doc.addRow(VERSIONS, versionRow('tokA', 20, { Genre: 'restauration' }));
    doc.addRow(VERSIONS, versionRow('tokB', 1));
    doc.addRow(VERSIONS, versionRow('tokA', 1, { Donnees: '' }));
    doc.addRow(VERSIONS, versionRow('tokZ', 120));
    doc.addRow(VERSIONS, versionRow('tokZ', 2));
    const found = await t.run(`VersionsStore.open(${a})`);
    check('ouvrir : les versions du modèle seulement, la plus récente d\'abord', sameList(found.entries.map((e) => e.rowId), [2, 3, 1]) && found.token === 'tokA', json(found.entries.map((e) => e.rowId)));
    const first = found.entries[0];
    check('ouvrir : chaque version dit sa date, sa personne, son nom et son genre', first.at === START - 5 * MIN && first.author === 'Bob <bob@exemple.fr>' && first.name === 'Avant envoi' && found.entries[1].genre === 'restauration' && first.size > 0, json(first));
    check('ouvrir : la table des versions est lue UNE fois, celle des modèles une fois', doc.readsOf(VERSIONS) === 1 && doc.readsOf(MODELS) === 1, doc.reads.join(','));
    const removals = doc.journal.filter((x) => x[0] === 'BulkRemoveRecord');
    check('ouvrir : les versions d\'un modèle supprimé (plus de dix minutes) sont retirées en un seul lot, pas les récentes', removals.length === 1 && sameList(removals[0][2], [6]) && doc.rows(VERSIONS).some((r) => r.id === 7), json(removals));
    const sans = await t.run(`VersionsStore.open(${c})`);
    const readsAfter = doc.readsOf(VERSIONS);
    check('ouvrir un modèle sans jeton : historique vide, sans lire la table des versions', sans.entries.length === 0 && sans.token === '' && readsAfter === 1, readsAfter);
    const other = await t.run(`VersionsStore.open(${b})`);
    check('ouvrir un autre modèle : seulement les siennes', sameList(other.entries.map((e) => e.rowId), [4]), json(other.entries.map((e) => e.rowId)));
  }
  {
    // Table absente : un historique vide, rien n'est créé pour lire.
    const doc = new Doc({ models: Object.assign({ Jeton: 'Text' }, MODEL_COLUMNS) });
    const id = doc.addRow(MODELS, { Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document', Jeton: 'tokA' });
    const t = fresh(doc);
    const found = await t.run(`VersionsStore.open(${id})`);
    check('table des versions absente : historique vide, aucune table créée, aucune lecture', found.entries.length === 0 && !doc.tables[VERSIONS] && doc.calls.length === 0 && doc.readsOf(VERSIONS) === 0);
  }
  {
    // Document sans colonne Jeton : aucun modèle n'a d'historique.
    const doc = new Doc();
    const id = doc.addRow(MODELS, { Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const t = fresh(doc);
    const found = await t.run(`VersionsStore.open(${id})`);
    check('document sans colonne Jeton : historique vide', found.entries.length === 0 && found.token === '' && doc.calls.length === 0);
  }
  {
    // Pannes : la lecture qui échoue remonte, un ménage qui échoue ne cache pas l'historique.
    const { doc, a } = documentWithTokens();
    const t = fresh(doc);
    for (let i = 0; i < 33; i++) doc.addRow(VERSIONS, versionRow('tokA', 10 + i));
    doc.denyTables.add(VERSIONS);
    const found = await t.run(`VersionsStore.open(${a})`);
    check('ménage refusé par Grist : l\'historique s\'affiche quand même (33 versions), avec un avertissement', found.entries.length === 33 && t.warnings.some((w) => /plafonds non appliqués/.test(w)), found.entries.length);
    doc.denyTables.delete(VERSIONS);
    doc.failReads.add(VERSIONS);
    const failure = await t.run(`VersionsStore.open(${a})`).then(() => null, (e) => e.message);
    check('lecture de la table des versions impossible : l\'ouverture échoue (la fenêtre le dit)', /illisible/.test(failure || ''), failure);
    doc.failReads.delete(VERSIONS);
    doc.failReads.add(MODELS);
    const failure2 = await t.run(`VersionsStore.open(${a})`).then(() => null, (e) => e.message);
    check('lecture de la table des modèles impossible : l\'ouverture échoue aussi', /illisible/.test(failure2 || ''), failure2);
  }
  {
    // Le plafond appliqué à l'ouverture retire vraiment les plus anciennes.
    const { doc, a } = documentWithTokens();
    const t = fresh(doc);
    for (let i = 0; i < 33; i++) doc.addRow(VERSIONS, versionRow('tokA', 10 + i));
    const found = await t.run(`VersionsStore.open(${a})`);
    const removals = doc.journal.filter((x) => x[0] === 'BulkRemoveRecord');
    check('33 versions : l\'ouverture en retire 3 (les plus anciennes) en un seul lot et n\'en montre que 30', found.entries.length === 30 && removals.length === 1 && sameList(removals[0][2].slice().sort((x, y) => x - y), [31, 32, 33]) && doc.rows(VERSIONS).length === 30, json(removals));
  }
  {
    // Le ménage de fond : tous les 400 ajouts, jamais plus d'un en attente, sans chercher les modèles supprimés.
    const { doc } = documentWithTokens();
    const t = fresh(doc);
    for (let i = 0; i < 32; i++) doc.addRow(VERSIONS, versionRow('tokA', 10 + i));
    doc.addRow(VERSIONS, versionRow('tokZ', 300));
    const prepare = () => t.run('VersionsStore.prepare({ rowId: 1, stored: { contenu: "<p>x</p>", modifiePar: "", dateModif: null }, next: { contenu: "<p>y</p>" }, author: "", force: true, genre: "", tokenFor: async () => "tokA" })');
    const copy = await prepare();
    const cleanups = () => t.timers.filter((x) => x.ms === 3000 && !x.cleared);
    copy.commit(399);
    check('ménage de fond : rien n\'est prévu à l\'ajout n° 399', cleanups().length === 0);
    copy.commit(400);
    copy.commit(800);
    check('ménage de fond : prévu à l\'ajout n° 400, une seule fois même si le suivant arrive avant', cleanups().length === 1, cleanups().length);
    const readsBefore = doc.readsOf(VERSIONS);
    await cleanups()[0].fn();
    const removed = doc.journal.filter((x) => x[0] === 'BulkRemoveRecord');
    check('ménage de fond : une lecture, les plafonds appliqués (2 versions de trop), les modèles supprimés laissés à l\'ouverture', doc.readsOf(VERSIONS) - readsBefore === 1 && removed.length === 1 && sameList(removed[0][2].slice().sort((x, y) => x - y), [31, 32]) && doc.rows(VERSIONS).some((r) => r.Jeton === 'tokZ'), json(removed));
    copy.commit(1200);
    check('ménage de fond : un nouveau peut être prévu une fois le premier fait', t.timers.filter((x) => x.ms === 3000).length === 2);
  }

  // === 8. Supprimer un modèle ===
  {
    const doc = new Doc();
    const t = fresh(doc);
    await t.identify({ email: 'moi@exemple.fr', name: 'Moi Même' });
    const id = await t.create('Contrat', '<p>v1</p>');
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    const readsBefore = doc.readsOf(VERSIONS);
    await t.run(`Templates.remove(${id})`);
    check('supprimer un modèle ne lit pas la table des versions (ses versions partent à la prochaine ouverture de l\'historique)', doc.readsOf(VERSIONS) === readsBefore && doc.rows(VERSIONS).length === 1);
    // Grist peut redonner le numéro de la ligne supprimée à un modèle neuf : il ne reprend ni les versions ni les règles de l'ancien.
    doc.nextId[MODELS] = id;
    await t.run('Templates.loadAll()');
    const again = await t.create('Autre contrat', '<p>w1</p>');
    t.advance(30 * SEC);
    await t.save(again, '<p>w2</p>');
    check('le numéro de ligne redonné à un modèle neuf : le modèle neuf garde sa première version (il ne reprend pas les règles de l\'ancien)', again === id && doc.rows(VERSIONS).length === 2 && doc.rows(VERSIONS)[0].Jeton !== doc.rows(VERSIONS)[1].Jeton, json(doc.rows(VERSIONS).map((r) => r.Jeton)));
  }

  // === 9. Le format ===
  {
    const t = fresh(new Doc());
    check('stable : clés triées, indéfinis écartés', t.run('VersionsStore.stable({ b: 1, a: [{ d: undefined, c: 2 }], e: null })') === '{"a":[{"c":2}],"b":1,"e":null}');
    const snapshot = t.run(`VersionsStore.snapshotOf({ typeModele: 'email', contenu: '<p>x</p>', nomFichierPDF: 'f', headerFooter: { enabled: false }, marginsMm: { top: 10 }, destinataires: 'a@b.fr', cc: '', cci: '', objet: 'Objet', suiviModifications: {} })`);
    check('snapshotOf : tout ce que Enregistrer écrit sauf le nom, sans les champs vides', json(Object.keys(snapshot).sort()) === json(['contenu', 'destinataires', 'headerFooter', 'margins', 'nomFichierPDF', 'objet', 'typeModele', 'v']), json(Object.keys(snapshot)));
    const text = 'Été à Noël 😀 '.repeat(5000);
    const packed = await t.run(`VersionsStore.pack(${json(text)})`);
    check('pack : gzip puis base64, préfixe gz1:', packed.startsWith('gz1:') && packed.length < text.length / 3, packed.length);
    const unpacked = await t.run(`VersionsStore.unpack(${json('raw1:' + json({ v: 1, contenu: text }))})`);
    const roundtrip = await t.run(`VersionsStore.pack(${json(json({ v: 1, contenu: text }))}).then(VersionsStore.unpack)`);
    check('unpack relit ce que pack a écrit, accents et émojis compris, et le format sans compression', roundtrip.contenu === text && unpacked.contenu === text);
    const random = randomBytes(3000000).toString('base64');
    const bigPacked = await t.run(`VersionsStore.pack(${json(json({ v: 1, contenu: random }))})`);
    const bigBack = await t.run(`VersionsStore.unpack(${json(bigPacked)})`);
    check('un état de plusieurs Mo (sans nombre d\'arguments limité) fait l\'aller-retour', bigBack.contenu === random);
    check('un texte de format inconnu est refusé', await t.run('VersionsStore.unpack("zip9:abc")').then(() => false, (e) => /illisible/.test(e.message)));
    check('un texte tronqué est refusé', await t.run(`VersionsStore.unpack(${json(packed.slice(0, 40))})`).then(() => false, () => true));
    check('une cellule vide est refusée', await t.run('VersionsStore.unpack("")').then(() => false, () => true));
    const noCompression = fresh(new Doc(), { compression: false });
    const raw = await noCompression.run(`VersionsStore.pack(${json('{"v":1}')})`);
    check('sans compression dans le navigateur : repli raw1:, relu tel quel', raw === 'raw1:{"v":1}' && (await noCompression.run(`VersionsStore.unpack(${json(raw)})`)).v === 1, raw);
    check('authorLabel : nom et adresse, adresse seule, rien', t.run(`VersionsStore.authorLabel({ email: ' a@b.fr ', name: ' Ada ' })`) === 'Ada <a@b.fr>' && t.run(`VersionsStore.authorLabel({ email: 'a@b.fr', name: '' })`) === 'a@b.fr' && t.run(`VersionsStore.authorLabel({ email: '', name: 'Ada' })`) === '');
    check('parseAuthor : « Nom <adresse> », adresse seule, nom seul', json(t.run(`VersionsStore.parseAuthor('Ada Lovelace <a@b.fr>')`)) === '{"name":"Ada Lovelace","email":"a@b.fr"}' && json(t.run(`VersionsStore.parseAuthor('a@b.fr')`)) === '{"name":"","email":"a@b.fr"}' && json(t.run(`VersionsStore.parseAuthor('Ada')`)) === '{"name":"Ada","email":""}');
    check('emailOf : en minuscules, vide sans adresse', t.run(`VersionsStore.emailOf('Ada <A@B.FR>')`) === 'a@b.fr' && t.run(`VersionsStore.emailOf('Ada')`) === '');
    check('toMs : des secondes (Grist), une date ISO (envoyée), rien de lisible', t.run('VersionsStore.toMs(1790000000)') === 1790000000000 && t.run(`VersionsStore.toMs('2026-10-14T09:00:00.000Z')`) === START && t.run('VersionsStore.toMs(null)') === null && t.run('VersionsStore.toMs("n\'importe quoi")') === null && t.run('VersionsStore.toMs(NaN)') === null);
  }

  // === 10. js/templates.js seul ===
  {
    const doc = new Doc();
    const t = fresh(doc, { versions: false });
    const id = await t.create('Contrat', '<p>v1</p>');
    t.advance(30 * SEC);
    await t.save(id, '<p>v2</p>');
    check('sans le magasin (page d\'essai qui ne charge que templates.js) : enregistrer marche comme avant, sans table des versions ni auteur', doc.row(MODELS, id).Contenu === '<p>v2</p>' && !doc.tables[VERSIONS] && doc.row(MODELS, id).ModifiePar === '');
  }

  // === 11. Les textes de la fonction, en français et en anglais ===
  {
    const lines = readFileSync(join(ROOT, 'js/i18n.js'), 'utf8').split('\n').filter(line => /^\s*'(?:versions\.|status\.version|toolbar\.versionsRow')/.test(line));
    const entries = {};
    for (const line of lines) {
      const m = line.match(/^\s*'([^']+)':\s*\{\s*fr:\s*'((?:[^'\\]|\\.)*)',\s*en:\s*'((?:[^'\\]|\\.)*)'\s*\},?\s*$/);
      if (m) entries[m[1]] = { fr: m[2], en: m[3] };
    }
    const keys = Object.keys(entries);
    check('les textes de la fonction se lisent tous dans js/i18n.js (une entrée = une ligne, fr puis en)', keys.length === lines.length && keys.length >= 25, keys.length + ' lus sur ' + lines.length + ' lignes');
    // Un {trou} ou un pluriel {n|un|plusieurs} : le même dans les deux langues.
    const holes = (text) => (text.match(/\{[A-Za-z]+(?:\|[^}]*)?\}/g) || []).map(h => h.replace(/\|.*\}$/, '}')).sort();
    const lonely = keys.filter(k => !entries[k].fr.trim() || !entries[k].en.trim());
    check('chaque texte a son français ET son anglais, non vides', lonely.length === 0, lonely.join(', '));
    const gaps = keys.filter(k => json(holes(entries[k].fr)) !== json(holes(entries[k].en)));
    check('les {trous} sont les mêmes en français et en anglais', gaps.length === 0, gaps.map(k => k + ' ' + json(holes(entries[k].fr)) + ' / ' + json(holes(entries[k].en))).join(' ; '));
    // Le code qui les demande : une clé entre guillemets (I18n.t('clé'), say('clé'), une erreur qui porte sa clé) ou une clé de data-i18n.
    const files = ['index.html', ...readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => 'js/' + f)];
    const used = new Set();
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const m of source.matchAll(/['"]((?:versions\.|status\.version|toolbar\.versionsRow)[A-Za-z.]*)['"]/g)) used.add(m[1]);
    }
    const missing = [...used].filter(k => !entries[k]);
    check('tout texte que le code demande existe dans js/i18n.js', used.size >= 20 && missing.length === 0, 'demandés ' + used.size + ', absents : ' + missing.join(', '));
    const orphans = keys.filter(k => !used.has(k));
    check('aucun texte de la fonction n\'est orphelin (tous sont demandés quelque part)', orphans.length === 0, orphans.join(', '));
  }

  // === 12. Le chargement des modules de l'historique ===
  {
    const loaders = () => {
      const t = fresh(new Doc());
      t.run(`globalThis.__loads = []; globalThis.__fail = false;
        globalThis.__tags = { 'versions': 'js/versions-history.js?v=9', 'versions-compare': 'js/versions-compare.js?v=9' };
        globalThis.document = { querySelector: (selector) => { const m = /data-module="([^"]+)"/.exec(selector); const src = m && __tags[m[1]]; return src ? { getAttribute: (name) => (name === 'src' ? src : null) } : null; } };
        globalThis.ExportCommon = { loadScriptOnce: ({ src }) => { __loads.push(src); return __fail ? Promise.reject(new Error('hors ligne')) : Promise.resolve(); } };`);
      return t;
    };
    const refused = async (t, call) => { try { await t.run(call); return null; } catch (e) { return String(e && e.message || e); } };
    let t = loaders();
    await t.run('VersionsStore.loadCompare()');
    await t.run('VersionsStore.loadCompare()');
    check('la comparaison se charge au premier besoin, une seule fois, depuis l\'adresse (et la version de cache) de sa balise', json(t.run('__loads')) === json(['js/versions-compare.js?v=9']), json(t.run('__loads')));
    await t.run('VersionsStore.loadWindow()');
    await t.run('VersionsStore.loadWindow()');
    check('la fenêtre se charge à part, une seule fois, sans recharger la comparaison', json(t.run('__loads')) === json(['js/versions-compare.js?v=9', 'js/versions-history.js?v=9']), json(t.run('__loads')));
    t = loaders();
    t.run('globalThis.VersionsCompare = {}; globalThis.VersionsHistory = {};');
    await t.run('VersionsStore.loadCompare()');
    await t.run('VersionsStore.loadWindow()');
    check('un module déjà présent n\'est pas rechargé', t.run('__loads.length') === 0, json(t.run('__loads')));
    t = loaders();
    t.run('__fail = true');
    const failure = await refused(t, 'VersionsStore.loadCompare()');
    t.run('__fail = false');
    const retried = await refused(t, 'VersionsStore.loadCompare()');
    const again = await refused(t, 'VersionsStore.loadCompare()');
    check('un chargement qui échoue refuse, ne garde pas l\'échec, et le geste suivant réessaie (puis ne recharge plus)', failure === 'hors ligne' && retried === null && again === null && t.run('__loads.length') === 2, failure + ' / ' + retried + ' / ' + again + ' / ' + t.run('__loads.length'));
    t = loaders();
    t.run("delete __tags['versions-compare']");
    const missing = await refused(t, 'VersionsStore.loadCompare()');
    check('sans balise inerte, la comparaison refuse en nommant le module, sans rien charger', /versions-compare/.test(missing || '') && t.run('__loads.length') === 0, missing);
    t.run("__tags['versions-compare'] = 'js/versions-compare.js?v=9'");
    await t.run('VersionsStore.loadCompare()');
    check('la balise revenue, le geste suivant charge', t.run('__loads.length') === 1, t.run('__loads.length'));
  }

  summarizeAndExit();
}

main().catch((e) => { console.log('EXCEPTION : ' + (e && e.stack || e)); process.exit(1); });
