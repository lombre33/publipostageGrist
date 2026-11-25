#!/usr/bin/env node
// Tests purs (sans navigateur) du traducteur des noms de tables et de colonnes - js/schema-columns.js (SchemaColumns.docApi, actualTable, whereIs), cf. dev-tests/unit-harness.mjs
// pour le contexte général. Le code du widget parle anglais (Publipostage_Templates, Name, Content, Token...) ; le document peut porter les noms d'avant (Publipostage_Modeles,
// Nom, Contenu, Jeton...), les noms anglais, ou un mélange (un renommage coupé en route, une colonne ajoutée depuis) : le traducteur lit et écrit sous les noms que le
// document a, sans jamais en créer un second jeu. Chaque cas ci-dessous échoue sur l'ancien code (aucun traducteur : le code écrivait les noms français en dur).
//  - un document d'avant : lu et écrit sous les anciens noms, la liste des tables rendue sous le nom anglais ;
//  - un document passé à l'anglais : lu et écrit tel quel ;
//  - un document mêlé : colonne par colonne ;
//  - un document qui porte les DEUX noms : celui que l'interrupteur préfère (englishOnDisk), pour la table comme pour la colonne ;
//  - un document sans la table : la création suit l'interrupteur (noms d'avant et libellés d'avant, ou noms anglais sans libellé), une colonne ajoutée puis écrite dans la foulée ;
//  - une écriture qui arrive avant toute lecture (les colonnes viennent des métadonnées de Grist, jamais d'une lecture de la table entière) ;
//  - ce qui n'est pas dans la liste passe tel quel (tables de la personne, métadonnées de Grist, autres tables du widget pas encore reprises) ;
//  - whereIs : l'endroit réel, avec le libellé que la personne voit ;
//  - la reprise d'un document d'avant (migrate, SchemaColumns.planRenames) PAR LA FENÊTRE COMMUNE du kit (consigne 104 de GFS ; js/names-update.js) : un seul lot (RenameTable, RenameColumn, libellés) rejoué en entier ou pas
//    du tout, les données et les lignes intactes, jamais sans la fenêtre (pas propriétaire, pas de preuve, compte Lecteur, refus de la personne : rien d'envoyé), une table de Sync+ gardée, le module du kit chargé seulement
//    quand le document porte un nom d'avant, rien de renommé quand le nom anglais est pris (à la casse près) ou quand le document porte les deux, ni quand le lot est refusé (le document garde ses noms, lus tels quels) ; deux
//    fenêtres qui reprennent en même temps ; un document déjà repris n'est plus touché. Le noyau du kit (kit/js/names-update/run.js : prepare et execute) est le VRAI ; seule la fenêtre (window.js) est remplacée par un clic
//    automatique, elle a son essai à la souris (dev-tests/verify-names-update.mjs).
//  - la preuve de propriété de la fenêtre (NamesUpdateBridge.proveOwner) : celle de GFS (`role`), seule celle de `GET /webhooks` avec un jeton d'écriture jeté après, et tout ce qui ne prouve rien.
// Lancer : node dev-tests/unit-schema-columns.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Le noyau de la fenêtre des noms, celui du kit (sous-module `kit`), sans sa fenêtre : prepare (qu'y a-t-il à faire, et cette personne peut-elle le faire ?) et execute (relire, UN lot, relire, vérifier). Sans le
// sous-module (un clone sans `git submodule update --init kit`), les sections de la fenêtre échouent EN LE DISANT, comme les contrôles du kit de verify-code-hygiene.mjs.
const KIT_RUN = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'js', 'names-update', 'run.js');
let kitCore = null;
try { kitCore = await import(pathToFileURL(KIT_RUN).href); } catch (e) { kitCore = null; }

// Le module du kit comme js/names-update.js le charge (`{ NamesUpdate, kitI18n }`), avec le vrai noyau et une « fenêtre » qui se valide toute seule (ou qui est refusée, `decline`). `spy` garde ce que la fenêtre aurait montré.
function fakeKit(spy, { decline = false } = {}) {
  return {
    NamesUpdate: {
      async run({ port, plan, appName }) {
        const prepared = await kitCore.prepare({ port, plan });
        const outcome = { state: prepared.state, held: prepared.held, reason: prepared.reason || null, taken: prepared.taken || [], missing: prepared.missing || [], result: null };
        if (prepared.state !== 'ready') return outcome;
        spy.windows.push({ appName, summary: prepared.summary, held: prepared.held });
        spy.ports.push(port);
        spy.order.push('fenêtre');
        if (spy.gate) await spy.gate;   // la personne n'a pas encore cliqué
        if (decline) return { ...outcome, state: 'skipped' };
        const result = await kitCore.execute({ port, plan });
        return { ...outcome, state: ['done', 'already', 'blocked'].includes(result.state) ? result.state : 'skipped', result };
      },
    },
    kitI18n: { setLanguage: (language) => { spy.languages.push(language); spy.order.push('langue:' + language); } },
  };
}

// Ce que la page donne au pont de la fenêtre : la page entière est là, la langue de l'app, le « chargement long » (FirstContact), et la preuve de propriété - celle de GFS (`hosted`, { owner }) ou, seule, le jeton d'écriture et
// `GET /webhooks` (`owner` : true -> 200 et la liste, false -> 403, null -> 500, 'html' -> 200 sans liste, 'reseau' -> le réseau échoue).
function bridgeGlobals(spy, { owner, hosted, readOnly }) {
  const globals = {
    document: spy.document || { readyState: 'complete' },
    I18n: { getLang: () => 'en' },
    FirstContact: { pause: () => { spy.pauses++; spy.order.push('pause'); }, resume: () => { spy.resumes++; spy.order.push('resume'); } },
    setTimeout, clearTimeout, AbortController,   // ce que la page a et que le contexte d'essai n'a pas : le pont pose un compte à rebours à la preuve
  };
  if (hosted) {
    globals.GfsLink = { hosted: true, ready: hosted.ready || Promise.resolve(), role: () => ({ owner: hosted.owner }) };
    globals.GristAPI = { isDocumentReadOnly: () => !!readOnly };
    return globals;
  }
  globals.GristAPI = {
    isDocumentReadOnly: () => !!readOnly,
    getWriteAccess: async () => {
      spy.accessAsked++;
      if (owner === 'jeton') throw new Error('Grist refuse un jeton capable d\'écrire');
      return { token: spy.token || 'wtok', baseUrl: 'https://grist.test/api/docs/d1', expiresAt: Date.now() + 100000 };
    },
  };
  globals.fetch = async (url) => {
    spy.urls.push(url);
    if (owner === 'reseau') throw new TypeError('Failed to fetch ' + url);
    if (owner === true) return { ok: true, status: 200, json: async () => ({ webhooks: [] }) };
    if (owner === 'html') return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    if (owner === false) return { ok: false, status: 403, json: async () => ({ error: 'No owner access' }) };
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return globals;
}

// Faux document : des tables (colonnes et lignes), les métadonnées que Grist en tire, un journal des actions et des lectures.
class Doc {
  constructor(tables = {}) {
    this.tables = {};
    Object.keys(tables).forEach((name) => { this.tables[name] = { cols: tables[name].slice(), rows: [] }; });
    // Les libellés que Grist garde par colonne quand ils diffèrent de l'identifiant d'origine : { table: { colonne: libellé } } ; absent, le libellé est l'identifiant.
    this.labels = {};
    this.journal = [];
    this.bundles = [];
    this.reads = [];
    this.nextId = 1;
    this.failBundles = 0; // les prochains lots refusés en entier (un autre widget a renommé entre-temps, ou Grist refuse)
    this.failQueue = []; // un message par essai d'écriture à venir : un texte le fait échouer avec lui, `null` le laisse passer (rien : il passe)
    this.attempts = []; // chaque essai d'écriture reçu, réussi ou non (les lots réussis sont dans `bundles`)
    this.strict = false; // vrai : une écriture dans une table ou une colonne qui n'existe pas échoue (« KeyError '...' », comme le moteur de Grist) au lieu d'être passée sous silence
  }

  labelOf(table, col) { return (this.labels[table] && this.labels[table][col]) !== undefined ? this.labels[table][col] : col; }
  setLabels(table, labels) { this.labels[table] = Object.assign({}, this.labels[table], labels); }

  async listTables() { this.reads.push('listTables'); return Object.keys(this.tables); }

  async fetchTable(name) {
    this.reads.push(name);
    const names = Object.keys(this.tables);
    if (name === '_grist_Tables') return { id: names.map((_, i) => i + 1), tableId: names.slice() };
    if (name === '_grist_Tables_column') {
      const out = { id: [], parentId: [], colId: [], label: [] };
      names.forEach((tableName, t) => this.tables[tableName].cols.forEach((col) => { out.id.push(out.id.length + 1); out.parentId.push(t + 1); out.colId.push(col); out.label.push(this.labelOf(tableName, col)); }));
      return out;
    }
    const table = this.tables[name];
    if (!table) throw new Error('Invalid table ' + name);
    const out = { id: table.rows.map((row) => row.id) };
    table.cols.forEach((col) => { out[col] = table.rows.map((row) => row[col]); });
    return out;
  }

  // Un lot est appliqué en entier ou pas du tout, comme Grist : l'état d'avant est rendu quand une action échoue.
  async applyUserActions(actions) {
    const before = JSON.stringify({ tables: this.tables, labels: this.labels });
    const journaled = this.journal.length;
    this.attempts.push(JSON.stringify(actions));
    try {
      if (this.failQueue.length) { const next = this.failQueue.shift(); if (next) throw new Error(next); }
      if (this.failBundles > 0) { this.failBundles--; throw new Error('refusé'); }
      const result = this.applyAll(actions);
      this.bundles.push(actions);
      return result;
    } catch (e) {
      const saved = JSON.parse(before);
      this.tables = saved.tables;
      this.labels = saved.labels;
      this.journal.length = journaled;
      throw e;
    }
  }

  applyAll(actions) {
    const retValues = [];
    for (const action of actions) {
      this.journal.push(action);
      const table = this.tables[action[1]];
      if (this.strict && ['AddRecord', 'UpdateRecord', 'BulkAddRecord', 'BulkUpdateRecord', 'RemoveRecord', 'BulkRemoveRecord'].includes(action[0])) {
        if (!table) throw new Error('[Sandbox] KeyError \'' + action[1] + '\'');
        const unknown = Object.keys(action[3] && typeof action[3] === 'object' ? action[3] : {}).find((col) => !table.cols.includes(col));
        if (unknown) throw new Error('[Sandbox] KeyError \'' + unknown + '\'');
      }
      if (action[0] === 'AddTable') { this.tables[action[1]] = { cols: action[2].map((c) => c.id), rows: [] }; retValues.push(null); }
      else if (action[0] === 'RenameTable') {
        if (!table) throw new Error('Table inconnue ' + action[1]);
        const taken = new Set(Object.keys(this.tables).map((name) => name.toLowerCase()));
        let target = action[2];
        for (let n = 2; taken.has(target.toLowerCase()); n++) target = action[2] + n; // Grist numérote un nom pris, il ne le refuse pas
        const moved = {};
        Object.keys(this.tables).forEach((name) => { moved[name === action[1] ? target : name] = this.tables[name]; });
        this.tables = moved;
        if (this.labels[action[1]]) { this.labels[target] = this.labels[action[1]]; delete this.labels[action[1]]; }
        retValues.push(null);
      } else if (action[0] === 'RenameColumn') {
        if (!table || !table.cols.includes(action[2])) throw new Error('Colonne inconnue ' + action[1] + '.' + action[2]);
        if (table.cols.some((c) => c.toLowerCase() === action[3].toLowerCase())) throw new Error('Nom pris ' + action[3]);
        this.setLabels(action[1], { [action[3]]: this.labelOf(action[1], action[2]) }); // le libellé ne suit PAS le renommage (mesuré dans grist-static 0.1.6)
        if (this.labels[action[1]]) delete this.labels[action[1]][action[2]];
        table.cols = table.cols.map((c) => (c === action[2] ? action[3] : c));
        table.rows.forEach((row) => { if (action[2] in row) { row[action[3]] = row[action[2]]; delete row[action[2]]; } });
        retValues.push(null);
      } else if (action[0] === 'ModifyColumn') {
        if (!table || !table.cols.includes(action[2])) throw new Error('Colonne inconnue ' + action[1] + '.' + action[2]);
        if (action[3] && action[3].label !== undefined) this.setLabels(action[1], { [action[2]]: action[3].label });
        retValues.push(null);
      }
      else if (action[0] === 'AddVisibleColumn' || action[0] === 'AddColumn') { if (!table.cols.includes(action[2])) table.cols.push(action[2]); if (action[3] && action[3].label) this.setLabels(action[1], { [action[2]]: action[3].label }); retValues.push({ colId: action[2] }); }
      else if (action[0] === 'AddRecord') { const row = Object.assign({ id: this.nextId++ }, action[3]); table.rows.push(row); retValues.push(row.id); }
      else if (action[0] === 'UpdateRecord') { const row = table.rows.find((r) => r.id === action[2]); if (row) Object.assign(row, action[3]); retValues.push(null); }
      else retValues.push(null);
    }
    return { retValues };
  }

  last() { return this.journal[this.journal.length - 1]; }
  writes() { return this.journal.slice(); }
}

const LEGACY_COLS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'HeaderFooter', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'PJ', 'SuiviModifications', 'Jeton', 'ModifiePar', 'MotDePassePdf', 'EmailLie'];
const ENGLISH_COLS = ['Name', 'Content', 'PdfFileName', 'ModifiedAt', 'HeaderFooter', 'Margins', 'IsDefault', 'TemplateType', 'To', 'Cc', 'Bcc', 'Subject', 'Attachments', 'TrackedChanges', 'Token', 'ModifiedBy', 'PdfPassword', 'LinkedEmail'];

// `migrate: true` : le widget tel qu'il est servi (la reprise allumée) avec le pont de la fenêtre (js/names-update.js), le vrai noyau du kit et une fenêtre qui se valide ; `owner`, `hosted`, `readOnly`, `decline` : ce que la
// personne est et répond. Rend aussi `spy` : les chargements du kit, les fenêtres ouvertes, la langue, les pauses du « chargement long », les adresses demandées au serveur.
function fresh(doc, { englishOnDisk = false, migrate = false, owner = true, hosted = null, readOnly = false, decline = false, gate = null, token = null, document = null, kitLoader = null, globals = {} } = {}) {
  // Un journal muet : le traducteur avertit (console.warn) quand un lot de renommage est refusé, ce que plusieurs cas jouent exprès.
  const quiet = { warn() {}, log() {}, error() {} };
  const spy = { loads: 0, windows: [], ports: [], languages: [], pauses: 0, resumes: 0, accessAsked: 0, urls: [], order: [], warnings: [], gate, token, document };
  const logs = { warn: (...args) => spy.warnings.push(args), log() {}, error: (...args) => spy.warnings.push(args) };
  const base = { grist: { docApi: doc }, console: migrate ? logs : quiet };
  if (migrate) Object.assign(base, bridgeGlobals(spy, { owner, hosted, readOnly }));
  const ctx = createContext(Object.assign(base, globals));
  loadScript(ctx, 'js/schema-columns.js');
  if (migrate) {
    loadScript(ctx, 'js/names-update.js');
    evalIn(ctx, 'NamesUpdateBridge').useKitForTests(() => { spy.loads++; return kitLoader ? kitLoader() : Promise.resolve(fakeKit(spy, { decline })); });
  }
  evalIn(ctx, `SchemaColumns.setEnglishOnDisk(${englishOnDisk || migrate})`);
  evalIn(ctx, `SchemaColumns.setRenameDocuments(${migrate})`);
  return { api: evalIn(ctx, 'SchemaColumns.docApi'), schema: evalIn(ctx, 'SchemaColumns'), bridge: migrate ? evalIn(ctx, 'NamesUpdateBridge') : null, spy, run: (expr) => evalIn(ctx, expr) };
}

async function section(label, work) {
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, e && e.stack); }
}

async function main() {
  await section('un document d\'avant (noms français)', async () => {
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS, Missions: ['Nom'] });
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'Facture', Contenu: '<p>a</p>', Jeton: 'tok1' });
    const { api } = fresh(doc);
    check('la liste des tables rend le nom anglais, et laisse les tables de la personne', same(await api.listTables(), ['Publipostage_Templates', 'Missions']), await api.listTables());
    const table = await api.fetchTable('Publipostage_Templates');
    check('la lecture est faite sous le nom du document', doc.reads.includes('Publipostage_Modeles') && !doc.reads.includes('Publipostage_Templates'), doc.reads);
    check('les colonnes reviennent sous leurs noms anglais, valeurs intactes', same(table.Name, ['Facture']) && same(table.Content, ['<p>a</p>']) && same(table.Token, ['tok1']) && table.Nom === undefined && table.Jeton === undefined, Object.keys(table));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>b</p>', ModifiedAt: 'x' }]]);
    check('une écriture arrive sous la table et les colonnes du document', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>b</p>', DateModif: 'x' }]), doc.last());
    check('et la valeur est bien dans la ligne', doc.tables.Publipostage_Modeles.rows[0].Contenu === '<p>b</p>', doc.tables.Publipostage_Modeles.rows[0]);
    check('aucune table anglaise n\'est apparue', !('Publipostage_Templates' in doc.tables), Object.keys(doc.tables));
  });

  await section('un document passé à l\'anglais', async () => {
    const doc = new Doc({ Publipostage_Templates: ENGLISH_COLS });
    doc.tables.Publipostage_Templates.rows.push({ id: 1, Name: 'Facture', Token: 'tok1' });
    const { api } = fresh(doc);
    check('la liste rend le nom anglais une seule fois', same(await api.listTables(), ['Publipostage_Templates']), await api.listTables());
    const table = await api.fetchTable('Publipostage_Templates');
    check('la lecture rend les colonnes telles quelles', same(table.Name, ['Facture']) && same(table.Token, ['tok1']), Object.keys(table));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis', Token: 'tok2' }]]);
    check('l\'écriture arrive telle quelle', same(doc.last(), ['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis', Token: 'tok2' }]), doc.last());
  });

  await section('un document mêlé : une colonne d\'avant, une colonne déjà anglaise', async () => {
    const cols = LEGACY_COLS.filter((c) => c !== 'Jeton' && c !== 'Nom').concat(['Token', 'Name']);
    const doc = new Doc({ Publipostage_Modeles: cols });
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Name: 'Facture', Contenu: '<p>a</p>', Token: 'tok1' });
    const { api } = fresh(doc);
    const table = await api.fetchTable('Publipostage_Templates');
    check('chaque colonne est lue sous le nom qu\'elle a', same(table.Name, ['Facture']) && same(table.Content, ['<p>a</p>']) && same(table.Token, ['tok1']), Object.keys(table));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis', Content: '<p>b</p>', Token: 'tok2' }]]);
    check('chaque colonne est écrite sous le nom qu\'elle a', same(doc.last()[3], { Name: 'Devis', Contenu: '<p>b</p>', Token: 'tok2' }), doc.last());
  });

  await section('un document qui porte les deux noms', async () => {
    const both = new Doc({ Publipostage_Modeles: ['Nom', 'Name'], Publipostage_Templates: ['Name'] });
    const off = fresh(both, { englishOnDisk: false });
    await off.api.applyUserActions([['AddRecord', 'Publipostage_Templates', null, { Name: 'x' }]]);
    check('interrupteur éteint : l\'ancienne table et la colonne d\'avant', same(both.last(), ['AddRecord', 'Publipostage_Modeles', null, { Nom: 'x' }]), both.last());
    const bothOn = new Doc({ Publipostage_Modeles: ['Nom', 'Name'], Publipostage_Templates: ['Name'] });
    const on = fresh(bothOn, { englishOnDisk: true });
    await on.api.applyUserActions([['AddRecord', 'Publipostage_Templates', null, { Name: 'x' }]]);
    check('interrupteur allumé : la table anglaise', same(bothOn.last(), ['AddRecord', 'Publipostage_Templates', null, { Name: 'x' }]), bothOn.last());
    const colsBoth = new Doc({ Publipostage_Modeles: ['Nom', 'Name'] });
    const colsOff = fresh(colsBoth, { englishOnDisk: false });
    await colsOff.api.fetchTable('Publipostage_Templates');
    await colsOff.api.applyUserActions([['AddRecord', 'Publipostage_Templates', null, { Name: 'x' }]]);
    check('deux colonnes pour un même champ, interrupteur éteint : celle d\'avant', same(colsBoth.last()[3], { Nom: 'x' }), colsBoth.last());
    const colsOnDoc = new Doc({ Publipostage_Modeles: ['Nom', 'Name'] });
    colsOnDoc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'ancien', Name: 'nouveau' });
    const colsOn = fresh(colsOnDoc, { englishOnDisk: true });
    const read = await colsOn.api.fetchTable('Publipostage_Templates');
    check('deux colonnes pour un même champ, interrupteur allumé : la lecture rend celle en anglais', same(read.Name, ['nouveau']), read.Name);
    await colsOn.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'x' }]]);
    check('et l\'écriture va dans celle en anglais', same(colsOnDoc.last()[3], { Name: 'x' }), colsOnDoc.last());
  });

  await section('un document sans la table : la création suit l\'interrupteur', async () => {
    const offDoc = new Doc({ Missions: ['Nom'] });
    const off = fresh(offDoc, { englishOnDisk: false });
    await off.api.applyUserActions([['AddTable', 'Publipostage_Templates', [{ id: 'Name', type: 'Text' }, { id: 'Content', type: 'Text' }]]]);
    check('éteint : la table et les colonnes d\'avant, sans libellé ajouté', same(offDoc.last(), ['AddTable', 'Publipostage_Modeles', [{ id: 'Nom', type: 'Text' }, { id: 'Contenu', type: 'Text' }]]), offDoc.last());
    await off.api.applyUserActions([['AddVisibleColumn', 'Publipostage_Templates', 'Margins', { type: 'Text', isFormula: false }]]);
    check('éteint : une colonne qui n\'avait que son libellé français le reçoit, sous le même identifiant', same(offDoc.last(), ['AddVisibleColumn', 'Publipostage_Modeles', 'Margins', { type: 'Text', isFormula: false, label: 'Marges de page' }]), offDoc.last());
    await off.api.applyUserActions([['AddVisibleColumn', 'Publipostage_Templates', 'Token', { type: 'Text', isFormula: false }]]);
    check('éteint : une colonne renommée se crée sous son nom d\'avant avec son libellé d\'avant', same(offDoc.last(), ['AddVisibleColumn', 'Publipostage_Modeles', 'Jeton', { type: 'Text', isFormula: false, label: 'Identité du modèle' }]), offDoc.last());
    await off.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Token: 'abc' }]]);
    check('et l\'écriture qui suit va dans la colonne qui vient d\'être créée', same(offDoc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Jeton: 'abc' }]), offDoc.last());

    const onDoc = new Doc({ Missions: ['Nom'] });
    const on = fresh(onDoc, { englishOnDisk: true });
    await on.api.applyUserActions([['AddTable', 'Publipostage_Templates', [{ id: 'Name', type: 'Text' }, { id: 'Content', type: 'Text' }]]]);
    check('allumé : la table et les colonnes anglaises', same(onDoc.last(), ['AddTable', 'Publipostage_Templates', [{ id: 'Name', type: 'Text' }, { id: 'Content', type: 'Text' }]]), onDoc.last());
    await on.api.applyUserActions([['AddVisibleColumn', 'Publipostage_Templates', 'Token', { type: 'Text', isFormula: false }]]);
    check('allumé : une colonne se crée sous son nom anglais, SANS libellé : l\'identifiant fait le libellé', same(onDoc.last(), ['AddVisibleColumn', 'Publipostage_Templates', 'Token', { type: 'Text', isFormula: false }]), onDoc.last());
    check('la liste des tables suit', same(await on.api.listTables(), ['Missions', 'Publipostage_Templates']), await on.api.listTables());
  });

  await section('une écriture avant toute lecture de la table', async () => {
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS });
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'A', Contenu: '<p>' + 'x'.repeat(5000) + '</p>' });
    const { api } = fresh(doc);
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'B' }]]);
    check('le nom de la colonne vient des métadonnées de Grist', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Nom: 'B' }]), doc.last());
    check('la table entière n\'a jamais été lue pour ça (elle peut peser des dizaines de Mo)', !doc.reads.includes('Publipostage_Modeles'), doc.reads);
  });

  await section('une lecture sans liste des tables lue : le document ne connaît pas le premier nom', async () => {
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS });
    const { api } = fresh(doc, { englishOnDisk: true });
    const table = await api.fetchTable('Publipostage_Templates');
    check('la lecture retombe sur le nom que le document porte', Array.isArray(table.id) && 'Name' in table, Object.keys(table));
    const none = fresh(new Doc({ Missions: ['Nom'] }));
    let failed = '';
    try { await none.api.fetchTable('Publipostage_Templates'); } catch (e) { failed = e.message; }
    check('une table que le document n\'a sous aucun des deux noms : l\'erreur de Grist, rien d\'avalé', /Invalid table/.test(failed), failed);
  });

  await section('ce qui n\'est pas dans la liste passe tel quel', async () => {
    const doc = new Doc({ Missions: ['Nom', 'Contenu'], Publipostage_Direct: ['Nom', 'Texte'] });
    doc.tables.Missions.rows.push({ id: 1, Nom: 'M1', Contenu: 'c' });
    const { api } = fresh(doc);
    const mission = await api.fetchTable('Missions');
    check('une table de la personne garde ses colonnes, même celles qui s\'appellent Nom ou Contenu', same(Object.keys(mission), ['id', 'Nom', 'Contenu']) && same(mission.Nom, ['M1']), Object.keys(mission));
    await api.applyUserActions([['UpdateRecord', 'Missions', 1, { Nom: 'M2' }], ['AddRecord', 'Publipostage_Direct', null, { Nom: 4, Texte: 't' }], ['RemoveRecord', 'Missions', 1]]);
    check('ses écritures, une table du widget déjà en anglais (Publipostage_Direct) et les autres actions : inchangées', same(doc.writes(), [['UpdateRecord', 'Missions', 1, { Nom: 'M2' }], ['AddRecord', 'Publipostage_Direct', null, { Nom: 4, Texte: 't' }], ['RemoveRecord', 'Missions', 1]]), doc.writes());
    check('la liste des tables garde les noms des autres tables', same(await api.listTables(), ['Missions', 'Publipostage_Direct']), await api.listTables());
  });

  await section('les écritures groupées', async () => {
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS });
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'A' });
    const { api } = fresh(doc);
    await api.fetchTable('Publipostage_Templates');
    await api.applyUserActions([
      ['BulkUpdateRecord', 'Publipostage_Templates', [1, 2], { Content: ['a', 'b'], Subject: ['s', 't'] }],
      ['BulkAddOrUpdateRecord', 'Publipostage_Templates', { Name: ['A'] }, { Content: ['z'] }],
      ['BulkAddRecord', 'Publipostage_Templates', [null], { Bcc: ['c@x'] }],
    ]);
    check('BulkUpdateRecord : les colonnes du document', same(doc.journal[0], ['BulkUpdateRecord', 'Publipostage_Modeles', [1, 2], { Contenu: ['a', 'b'], Objet: ['s', 't'] }]), doc.journal[0]);
    check('BulkAddOrUpdateRecord : la clé et les valeurs', same(doc.journal[1], ['BulkAddOrUpdateRecord', 'Publipostage_Modeles', { Nom: ['A'] }, { Contenu: ['z'] }]), doc.journal[1]);
    check('BulkAddRecord : les colonnes du document', same(doc.journal[2], ['BulkAddRecord', 'Publipostage_Modeles', [null], { Cci: ['c@x'] }]), doc.journal[2]);
  });

  await section('whereIs : où est la colonne, dans CE document', async () => {
    const legacy = fresh(new Doc({ Publipostage_Modeles: LEGACY_COLS }));
    await legacy.api.fetchTable('Publipostage_Templates');
    check('document d\'avant : la table, la colonne et le libellé que la personne voit dans Grist', same(legacy.schema.whereIs('Publipostage_Templates', 'PdfPassword'), { table: 'Publipostage_Modeles', column: 'MotDePassePdf', label: 'Mot de passe des PDF protégés' }), legacy.schema.whereIs('Publipostage_Templates', 'PdfPassword'));
    const english = fresh(new Doc({ Publipostage_Templates: ENGLISH_COLS }));
    await english.api.fetchTable('Publipostage_Templates');
    check('document en anglais : identifiant = libellé', same(english.schema.whereIs('Publipostage_Templates', 'PdfPassword'), { table: 'Publipostage_Templates', column: 'PdfPassword', label: 'PdfPassword' }), english.schema.whereIs('Publipostage_Templates', 'PdfPassword'));
    check('une colonne qui n\'est pas dans la liste est rendue telle quelle', same(english.schema.whereIs('Missions', 'Nom'), { table: 'Missions', column: 'Nom', label: 'Nom' }), english.schema.whereIs('Missions', 'Nom'));
  });

  await section('les six autres tables du widget, dans un document d\'avant', async () => {
    const doc = new Doc({
      Publipostage_Commentaires: ['ModeleId', 'CommentId', 'Auteur', 'Texte', 'CreeLe'],
      Publipostage_Versions: ['Jeton', 'Date', 'Auteur', 'Nom', 'Genre', 'Donnees'],
      Publipostage_PreferencesModeles: ['Utilisateur', 'ModeleId', 'Epingle', 'Dossier'],
      Publipostage_Abreviations: ['Utilisateur', 'Abreviation', 'Texte'],
      Publipostage_FormatsPage: ['Nom', 'Largeur', 'Hauteur'],
      Publipostage_LiensTables: ['TableCible', 'Mode', 'ColonneCible', 'ColonneSource'],
      Publipostage_Direct: ['Nom'],
    });
    doc.tables.Publipostage_LiensTables.rows.push({ id: 1, TableCible: 'Clients', Mode: 'match', ColonneCible: 'Code', ColonneSource: 'Ref' });
    const { api } = fresh(doc);
    check('la liste rend les noms anglais ; la table des versions et les tables déjà en anglais gardent le leur', same(await api.listTables(), ['Publipostage_Comments', 'Publipostage_Versions', 'Publipostage_TemplatePreferences', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_TableLinks', 'Publipostage_Direct']), await api.listTables());
    const links = await api.fetchTable('Publipostage_TableLinks');
    check('les liens : colonnes anglaises, la colonne Mode (déjà en anglais) intacte, et pas de colonne SourceTable tant que le document n\'en a pas', same(links.TargetTable, ['Clients']) && same(links.Mode, ['match']) && same(links.TargetColumn, ['Code']) && same(links.SourceColumn, ['Ref']) && !('SourceTable' in links), Object.keys(links));
    await api.applyUserActions([['AddVisibleColumn', 'Publipostage_TableLinks', 'SourceTable', { type: 'Text', isFormula: false }]]);
    check('la colonne ajoutée aux liens garde, sous son nom d\'avant, le libellé d\'avant', same(doc.last(), ['AddVisibleColumn', 'Publipostage_LiensTables', 'TableSource', { type: 'Text', isFormula: false, label: 'Table de la page' }]), doc.last());
    await api.applyUserActions([['AddRecord', 'Publipostage_TableLinks', null, { TargetTable: 'T', Mode: 'id', TargetColumn: '', SourceColumn: '', SourceTable: 'P' }]]);
    check('l\'écriture d\'un lien arrive sous les noms du document, la colonne ajoutée à l\'instant comprise', same(doc.last(), ['AddRecord', 'Publipostage_LiensTables', null, { TableCible: 'T', Mode: 'id', ColonneCible: '', ColonneSource: '', TableSource: 'P' }]), doc.last());
    await api.applyUserActions([['AddRecord', 'Publipostage_Comments', null, { TemplateId: 3, CommentId: 'c1', Author: 'a', Text: 't', CreatedAt: 'x' }]]);
    check('un commentaire : ModeleId, Auteur, Texte, CreeLe', same(doc.last(), ['AddRecord', 'Publipostage_Commentaires', null, { ModeleId: 3, CommentId: 'c1', Auteur: 'a', Texte: 't', CreeLe: 'x' }]), doc.last());
    await api.applyUserActions([['AddColumn', 'Publipostage_Comments', 'PdfId', { type: 'Text', isFormula: false }]]);
    check('une colonne de fil de PDF ajoutée : son nom d\'avant, sans libellé en plus (l\'ancien code n\'en donnait pas)', same(doc.last(), ['AddColumn', 'Publipostage_Commentaires', 'LectureId', { type: 'Text', isFormula: false }]), doc.last());
    await api.applyUserActions([['AddVisibleColumn', 'Publipostage_TemplatePreferences', 'Collapsed', { type: 'Bool', isFormula: false }], ['AddVisibleColumn', 'Publipostage_TemplatePreferences', 'ExportType', { type: 'Text', isFormula: false }]]);
    check('les préférences : « Replie » et « TypeExport » avec les libellés d\'avant', same(doc.journal.slice(-2), [['AddVisibleColumn', 'Publipostage_PreferencesModeles', 'Replie', { type: 'Bool', isFormula: false, label: 'Dossier replié par défaut' }], ['AddVisibleColumn', 'Publipostage_PreferencesModeles', 'TypeExport', { type: 'Text', isFormula: false, label: 'Type d\'export' }]]), doc.journal.slice(-2));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Versions', 4, { Name: 'v1' }], ['AddRecord', 'Publipostage_Abbreviations', null, { User: 'u', Abbreviation: 'bj', Text: 'bonjour' }], ['AddRecord', 'Publipostage_PageFormats', null, { Name: 'N', Width: 1, Height: 2 }]]);
    check('versions, abréviations, formats de page : les colonnes d\'avant', same(doc.journal.slice(-3), [['UpdateRecord', 'Publipostage_Versions', 4, { Nom: 'v1' }], ['AddRecord', 'Publipostage_Abreviations', null, { Utilisateur: 'u', Abreviation: 'bj', Texte: 'bonjour' }], ['AddRecord', 'Publipostage_FormatsPage', null, { Nom: 'N', Largeur: 1, Hauteur: 2 }]]), doc.journal.slice(-3));
    const direct = await api.fetchTable('Publipostage_Direct');
    check('la table Publipostage_Direct (déjà en anglais) passe telle quelle', same(Object.keys(direct), ['id', 'Nom']), Object.keys(direct));
  });

  await section('les six autres tables, dans un document passé à l\'anglais, et une table créée interrupteur allumé', async () => {
    const doc = new Doc({ Publipostage_Comments: ['TemplateId', 'CommentId', 'Author'], Publipostage_Versions: ['Token', 'Date', 'Author', 'Name', 'Kind', 'Data'] });
    doc.tables.Publipostage_Versions.rows.push({ id: 1, Token: 't', Name: 'n' });
    const { api } = fresh(doc);
    check('la liste ne double pas la table des versions', same(await api.listTables(), ['Publipostage_Comments', 'Publipostage_Versions']), await api.listTables());
    const versions = await api.fetchTable('Publipostage_Versions');
    check('les versions en anglais se lisent telles quelles', same(versions.Token, ['t']) && same(versions.Name, ['n']), Object.keys(versions));
    await api.applyUserActions([['AddRecord', 'Publipostage_Comments', null, { TemplateId: 1, Author: 'a' }]]);
    check('un commentaire s\'écrit sous les colonnes anglaises', same(doc.last(), ['AddRecord', 'Publipostage_Comments', null, { TemplateId: 1, Author: 'a' }]), doc.last());
    const blank = new Doc();
    const on = fresh(blank, { englishOnDisk: true });
    await on.api.applyUserActions([['AddTable', 'Publipostage_Abbreviations', [{ id: 'User', type: 'Text' }, { id: 'Abbreviation', type: 'Text' }, { id: 'Text', type: 'Text' }]]]);
    check('interrupteur allumé : la table des abréviations naît en anglais', same(blank.last(), ['AddTable', 'Publipostage_Abbreviations', [{ id: 'User', type: 'Text' }, { id: 'Abbreviation', type: 'Text' }, { id: 'Text', type: 'Text' }]]), blank.last());
    const offDoc = new Doc();
    const off = fresh(offDoc, { englishOnDisk: false });
    await off.api.applyUserActions([['AddTable', 'Publipostage_Versions', [{ id: 'Token', type: 'Text' }, { id: 'Date', type: 'DateTime' }, { id: 'Kind', type: 'Text' }]]]);
    check('interrupteur éteint : la table des versions naît sous son nom (inchangé) et ses colonnes d\'avant', same(offDoc.last(), ['AddTable', 'Publipostage_Versions', [{ id: 'Jeton', type: 'Text' }, { id: 'Date', type: 'DateTime' }, { id: 'Genre', type: 'Text' }]]), offDoc.last());
  });

  // --- La reprise d'un document d'avant, par la fenêtre commune de mise à jour des noms (consigne 104 de GFS) -------------------------------------------------------------------
  // Un document créé par l'ancien code : les sept tables sous leurs noms français, chaque colonne sous le sien, avec le libellé que l'ancien code lui donnait (DateModif : « Dernière modification »...).
  function legacyDoc() {
    const { schema } = fresh(new Doc());
    const doc = new Doc();
    schema.TABLES.forEach((t) => {
      doc.tables[t.legacyId] = { cols: t.columns.map((c) => c[1]), rows: [] };
      t.columns.forEach((c) => { if (c[2]) doc.setLabels(t.legacyId, { [c[1]]: c[2] }); });
    });
    doc.tables.Missions = { cols: ['Nom'], rows: [{ id: 1, Nom: 'Paris' }] };
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'Facture', Contenu: '<p>a</p>', Jeton: 'tok1' }, { id: 2, Nom: 'Devis', Contenu: '<p>b</p>', Jeton: 'tok2' });
    doc.tables.Publipostage_Commentaires.rows.push({ id: 1, ModeleId: 1, Texte: 'à revoir' });
    doc.tables.Publipostage_Versions.rows.push({ id: 1, Jeton: 'tok1', Nom: 'v1', Donnees: '{}' });
    return doc;
  }
  const renameActions = (doc) => doc.writes().filter((a) => ['RenameTable', 'RenameColumn', 'ModifyColumn'].includes(a[0]));
  const labelsAreIds = (doc, schema) => schema.TABLES.every((t) => t.columns.every((c) => !doc.tables[t.id] || !doc.tables[t.id].cols.includes(c[0]) || doc.labelOf(t.id, c[0]) === c[0]));
  const stillLegacy = (doc) => Object.keys(doc.tables).filter((n) => /^Publipostage_(Modeles|Commentaires|PreferencesModeles|Abreviations|FormatsPage|LiensTables)$/.test(n));

  check('le noyau du kit (kit/js/names-update/run.js) est là : sans lui, les sections de la fenêtre ne disent rien (git submodule update --init kit)', kitCore !== null, KIT_RUN);
  if (kitCore === null) { summarizeAndExit(); return; }

  await section('la reprise : un document d\'avant est renommé par la fenêtre, en un seul lot, sans rien perdre', async () => {
    const doc = legacyDoc();
    const { api, schema, spy } = fresh(doc, { migrate: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('la fenêtre s\'ouvre une fois, au nom de l\'app, devant six tables à renommer', spy.windows.length === 1 && spy.windows[0].appName === 'Publipostage+' && spy.windows[0].summary.tables.length === 6 && spy.windows[0].held.length === 0, JSON.stringify(spy.windows));
    check('le port donné au kit lit les noms, envoie un lot et prouve la propriété, mais ne compte aucune ligne : pas de `rowCount` (compter lirait tout le contenu des modèles, 118 Mo environ 6 s dans le banc de GFS : consigne 104 e)', spy.ports.length === 1 && typeof spy.ports[0].readSchema === 'function' && typeof spy.ports[0].apply === 'function' && typeof spy.ports[0].isOwner === 'function' && spy.ports[0].rowCount === undefined, Object.keys(spy.ports[0] || {}));
    check('la première lecture reprend le document : un seul lot', doc.bundles.length === 1, doc.bundles.length);
    const batch = doc.bundles[0] || [];
    check('le lot ne porte que RenameTable, RenameColumn et ModifyColumn, sur les seules tables du widget, et ModifyColumn ne change que le libellé (ce que le courtier de GFS laisse passer avec la capacité « renommage »)', batch.length > 0
      && batch.every((a) => ['RenameTable', 'RenameColumn', 'ModifyColumn'].includes(a[0]) && /^Publipostage_/.test(a[1]) && (a[0] !== 'ModifyColumn' || same(Object.keys(a[3]), ['label']))), JSON.stringify(batch.filter((a) => !/^Publipostage_/.test(a[1]))));
    check('les sept tables portent leur nom anglais (la table des versions garde le sien) et plus rien d\'avant', schema.TABLES.every((t) => t.id in doc.tables && (t.legacyId === t.id || !(t.legacyId in doc.tables))), Object.keys(doc.tables));
    check('chaque colonne de la liste porte son nom anglais, aucune colonne d\'avant ne reste', schema.TABLES.every((t) => same(doc.tables[t.id].cols, t.columns.map((c) => c[0]))), schema.TABLES.map((t) => doc.tables[t.id].cols.join(',')));
    check('l\'identifiant de chaque colonne est son libellé (le libellé ne suit pas le renommage dans Grist : le lot le pose)', labelsAreIds(doc, schema), JSON.stringify(doc.labels));
    check('les lignes sont intactes, sous les noms anglais', same(read.Name, ['Facture', 'Devis']) && same(read.Content, ['<p>a</p>', '<p>b</p>']) && same(read.id, [1, 2]) && same(read.Token, ['tok1', 'tok2']), JSON.stringify(read));
    check('les commentaires et les versions aussi', same(doc.tables.Publipostage_Comments.rows, [{ id: 1, TemplateId: 1, Text: 'à revoir' }]) && same(doc.tables.Publipostage_Versions.rows, [{ id: 1, Token: 'tok1', Name: 'v1', Data: '{}' }]), JSON.stringify(doc.tables.Publipostage_Comments.rows));
    check('la table de la personne n\'est pas touchée', same(doc.tables.Missions, { cols: ['Nom'], rows: [{ id: 1, Nom: 'Paris' }] }), JSON.stringify(doc.tables.Missions));
    const result = schema.lastMigration();
    check('la reprise dit ce qu\'elle a fait : sept tables touchées (les versions ne changent que de colonnes), des colonnes, des libellés, rien d\'échoué ni de gardé', result && result.tables === 7 && result.columns > 30 && result.labels > 40 && result.failed === false && result.skipped.length === 0 && result.held.length === 0, JSON.stringify(result));
    check('la preuve : une seule demande de jeton, `GET /webhooks` sur l\'adresse du document, rien d\'autre', spy.accessAsked === 1 && same(spy.urls, ['https://grist.test/api/docs/d1/webhooks?auth=wtok']), JSON.stringify(spy.urls));
    check('avant la fenêtre : la langue de l\'app (le kit parle comme elle) puis la pause du « chargement long », reprise à la fin, dans cet ordre', same(spy.order, ['langue:en', 'pause', 'fenêtre', 'resume']) && spy.loads === 1, JSON.stringify(spy.order));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>c</p>', ModifiedAt: 'x' }]]);
    check('l\'écriture suivante va sous les noms anglais, sans recréer de table d\'avant', same(doc.last(), ['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>c</p>', ModifiedAt: 'x' }]) && !('Publipostage_Modeles' in doc.tables), doc.last());
    const again = await api.listTables();
    check('la liste des tables rend les noms anglais, une fois chacun', same(again, ['Publipostage_Templates', 'Publipostage_Comments', 'Publipostage_Versions', 'Publipostage_TemplatePreferences', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_TableLinks', 'Missions']), again);
    check('et la fenêtre ne s\'est pas rouverte', spy.windows.length === 1 && spy.loads === 1, spy.windows.length);
  });

  await section('la reprise : les trois colonnes qui n\'avaient que le libellé français, et les libellés d\'avant', async () => {
    const doc = legacyDoc();
    check('départ : Margins se lit « Marges de page », DateModif « Dernière modification »', doc.labelOf('Publipostage_Modeles', 'Margins') === 'Marges de page' && doc.labelOf('Publipostage_Modeles', 'DateModif') === 'Dernière modification', JSON.stringify(doc.labels));
    const { api } = fresh(doc, { migrate: true });
    await api.listTables();
    check('Margins, HeaderFooter et Cc ont gardé leur identifiant et ont pris leur identifiant pour libellé', ['Margins', 'HeaderFooter', 'Cc'].every((c) => doc.labelOf('Publipostage_Templates', c) === c), JSON.stringify(doc.labels.Publipostage_Templates));
    check('DateModif devenue ModifiedAt a pris ModifiedAt pour libellé', doc.labelOf('Publipostage_Templates', 'ModifiedAt') === 'ModifiedAt', JSON.stringify(doc.labels.Publipostage_Templates));
    check('un seul lot, et ses actions sont RenameTable, RenameColumn, ModifyColumn dans cet ordre pour chaque table', doc.bundles.length === 1 && doc.bundles[0].every((a) => ['RenameTable', 'RenameColumn', 'ModifyColumn'].includes(a[0])), doc.bundles.length);
  });

  await section('la reprise : un document déjà repris n\'est plus touché, et le module du kit n\'est même pas chargé', async () => {
    const doc = legacyDoc();
    await fresh(doc, { migrate: true }).api.listTables();
    const before = doc.bundles.length;
    const renamedBefore = renameActions(doc).length;
    const readsBefore = doc.reads.length;
    const next = fresh(doc, { migrate: true });
    await next.api.fetchTable('Publipostage_Templates');
    await next.api.listTables();
    check('une seconde ouverture ne renomme rien et n\'écrit rien', doc.bundles.length === before && renameActions(doc).length === renamedBefore && renamedBefore > 0, doc.bundles.length);
    check('et la reprise n\'a rien à dire', next.schema.lastMigration() === null, JSON.stringify(next.schema.lastMigration()));
    check('ni module du kit, ni jeton demandé, ni lecture des métadonnées (le cas de presque tous les documents ne coûte rien de plus)', next.spy.loads === 0 && next.spy.accessAsked === 0 && next.spy.windows.length === 0 && !doc.reads.slice(readsBefore).some((name) => name.startsWith('_grist_')), JSON.stringify(doc.reads.slice(readsBefore)));
  });

  await section('la reprise : un document neuf (aucune table du widget) n\'est ni lu ni écrit', async () => {
    const doc = new Doc({ Missions: ['Nom'] });
    const { api, spy } = fresh(doc, { migrate: true });
    await api.listTables();
    check('aucune écriture, aucune lecture des métadonnées, aucun module du kit', doc.bundles.length === 0 && !doc.reads.includes('_grist_Tables') && !doc.reads.includes('_grist_Tables_column') && spy.loads === 0, doc.reads);
  });

  await section('la reprise : un compte Lecteur ne renomme rien, le document se lit sous ses noms d\'avant', async () => {
    const doc = legacyDoc();
    const { api, spy } = fresh(doc, { migrate: true, readOnly: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('aucune écriture, aucune fenêtre, aucun jeton demandé, aucune pause', doc.bundles.length === 0 && 'Publipostage_Modeles' in doc.tables && spy.windows.length === 0 && spy.accessAsked === 0 && spy.pauses === 0, JSON.stringify(spy));
    check('la lecture rend quand même les noms anglais', same(read.Name, ['Facture', 'Devis']) && same(read.Token, ['tok1', 'tok2']), Object.keys(read));
  });

  await section('la reprise dans GFS : la preuve est celle de GFS (`role`), le lot passe par le courtier, aucun jeton n\'est demandé', async () => {
    const owner = legacyDoc();
    const a = fresh(owner, { migrate: true, hosted: { owner: true } });
    const read = await a.api.fetchTable('Publipostage_Templates');
    check('propriétaire (true) : la fenêtre s\'ouvre et le document est renommé en un lot', a.spy.windows.length === 1 && owner.bundles.length === 1 && stillLegacy(owner).length === 0 && same(read.Name, ['Facture', 'Devis']), JSON.stringify({ windows: a.spy.windows.length, bundles: owner.bundles.length, legacy: stillLegacy(owner) }));
    check('et l\'app n\'a demandé ni jeton ni adresse au serveur : rien d\'autre que le lot ne part', a.spy.accessAsked === 0 && a.spy.urls.length === 0, JSON.stringify(a.spy.urls));
    for (const [label, value] of [['pas propriétaire (false)', false], ['GFS ne sait pas encore (null)', null]]) {
      const doc = legacyDoc();
      const b = fresh(doc, { migrate: true, hosted: { owner: value } });
      const rows = await b.api.fetchTable('Publipostage_Templates');
      check(label + ' : ni fenêtre ni écriture, le document se lit sous ses noms d\'avant, rien dans la console', b.spy.windows.length === 0 && doc.bundles.length === 0 && doc.journal.length === 0 && same(rows.Name, ['Facture', 'Devis']) && b.spy.warnings.length === 0 && b.spy.pauses === 0, JSON.stringify(b.spy));
      await b.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>y</p>' }]]);
      check(label + ' : l\'écriture suit les noms du document, sans table d\'avant recréée', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>y</p>' }]) && !('Publipostage_Templates' in doc.tables), doc.last());
    }
  });

  await section('la reprise : éteinte, le document garde ses noms', async () => {
    const doc = legacyDoc();
    const { api } = fresh(doc, { englishOnDisk: true });
    await api.fetchTable('Publipostage_Templates');
    check('renameDocuments éteint : aucune écriture', doc.bundles.length === 0 && 'Publipostage_Modeles' in doc.tables, doc.bundles.length);
  });

  // Consigne 105 de GFS (25/11) : « plus de renommage en silence ». Le widget tel qu'il est servi n'a AUCUN mode d'essai (`__schemaNames` absent) : sans la fenêtre (le pont absent), un document aux noms d'avant ne reçoit
  // aucune action de renommage, ni à la lecture ni à l'écriture, et il se lit et s'écrit sous ses noms ; une table neuve naît pourtant en anglais (englishOnDisk allumé). Échoue sur l'ancien code (renameDocuments
  // allumé quand le mode est absent : un lot RenameTable / RenameColumn partait à la première lecture).
  await section('105 : sans la fenêtre, le widget tel qu\'il est servi ne renomme rien', async () => {
    const doc = legacyDoc();
    const warnings = [];
    const ctx = createContext({ grist: { docApi: doc }, console: { warn: (...args) => warnings.push(args), log() {}, error() {} }, __schemaNames: undefined });
    loadScript(ctx, 'js/schema-columns.js');
    const api = evalIn(ctx, 'SchemaColumns.docApi');
    const schema = evalIn(ctx, 'SchemaColumns');
    const listed = await api.listTables();
    const read = await api.fetchTable('Publipostage_Templates');
    check('un document aux noms d\'avant, ouvert : aucune action envoyée, aucun lot tenté', doc.bundles.length === 0 && doc.journal.length === 0 && warnings.length === 0, JSON.stringify({ bundles: doc.bundles.length, journal: doc.journal.length, warnings }));
    check('ses tables et ses colonnes gardent leurs noms d\'avant', 'Publipostage_Modeles' in doc.tables && !('Publipostage_Templates' in doc.tables) && same(doc.tables.Publipostage_Modeles.cols.slice(0, 2), ['Nom', 'Contenu']), Object.keys(doc.tables).join(','));
    check('il se lit pourtant sous les noms anglais du code, et la reprise n\'a rien à dire', listed.includes('Publipostage_Templates') && same(read.Name, ['Facture', 'Devis']) && schema.lastMigration() === null, JSON.stringify({ listed, name: read.Name, migration: schema.lastMigration() }));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>y</p>' }]]);
    check('et s\'écrit sous ses noms d\'avant, sans le moindre renommage', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>y</p>' }]) && doc.journal.every(action => action[0] === 'UpdateRecord'), JSON.stringify(doc.journal));
    const empty = createContext({ grist: { docApi: new Doc() }, console: { warn() {}, log() {}, error() {} }, __schemaNames: undefined });
    loadScript(empty, 'js/schema-columns.js');
    check('englishOnDisk ne change pas : sans document lu, une table neuve naît en anglais', evalIn(empty, "SchemaColumns.actualTable('Publipostage_Templates')") === 'Publipostage_Templates');
  });

  // Tout ce qui ne mène pas à la fenêtre laisse le document tel quel : pas propriétaire, pas de preuve (le serveur refuse le jeton, répond autre chose, ne répond pas), la personne qui refuse, un module du kit qui ne se charge pas.
  await section('104 : sans propriétaire prouvé ou sans accord, rien n\'est renommé et le document se lit toujours', async () => {
    const cases = [
      ['pas propriétaire (403)', { owner: false }, 0, true],
      ['le serveur répond 500', { owner: null }, 0, true],
      ['le serveur répond autre chose que la liste des webhooks (une page de connexion)', { owner: 'html' }, 0, true],
      ['le réseau échoue', { owner: 'reseau' }, 0, true],
      ['Grist refuse le jeton d\'écriture', { owner: 'jeton' }, 0, true],
      ['la personne refuse (« Continuer sans mettre à jour »)', { decline: true }, 1, false],
    ];
    for (const [label, options, windows, silent] of cases) {
      const doc = legacyDoc();
      const { api, schema, spy } = fresh(doc, Object.assign({ migrate: true }, options));
      const read = await api.fetchTable('Publipostage_Templates');
      check(label + ' : aucune action envoyée, fenêtre ' + (windows ? 'ouverte puis refusée' : 'jamais ouverte') + ', le document se lit sous ses noms d\'avant', doc.bundles.length === 0 && doc.journal.length === 0 && spy.windows.length === windows && same(read.Name, ['Facture', 'Devis']) && 'Publipostage_Modeles' in doc.tables, JSON.stringify({ bundles: doc.bundles.length, windows: spy.windows.length, urls: spy.urls }));
      check(label + ' : rien dans la console' + (silent ? '' : ' (hors celle du refus)') + ', et le jeton n\'est jamais cité', spy.warnings.length === 0 && !JSON.stringify(spy.warnings).includes('wtok'), JSON.stringify(spy.warnings));
      check(label + ' : ' + (options.decline ? 'la reprise dit que le document garde ses noms' : 'la reprise n\'a rien à dire'), options.decline ? schema.lastMigration() && schema.lastMigration().failed === true && schema.lastMigration().state === 'skipped' : schema.lastMigration() === null, JSON.stringify(schema.lastMigration()));
      check(label + ' : la pause du « chargement long » est reprise (ou n\'a jamais été posée)', spy.pauses === spy.resumes, JSON.stringify({ pauses: spy.pauses, resumes: spy.resumes }));
    }
    const doc = legacyDoc();
    const { api, schema, spy } = fresh(doc, { migrate: true, kitLoader: () => Promise.reject(new Error('404 kit/js/names-update/index.js')) });
    const read = await api.fetchTable('Publipostage_Templates');
    check('le module du kit ne se charge pas : aucune écriture, un avertissement, le document se lit sous ses noms d\'avant', doc.bundles.length === 0 && spy.warnings.length === 1 && same(read.Name, ['Facture', 'Devis']) && schema.lastMigration() === null, JSON.stringify(spy.warnings.map((w) => String(w[0]))));
  });

  await section('la reprise : le nom anglais est déjà pris, ou le document porte les deux noms', async () => {
    const taken = legacyDoc();
    taken.tables.publipostage_templates = { cols: ['x'], rows: [] }; // une table de la personne, à la casse près
    const a = fresh(taken, { migrate: true });
    await a.api.listTables();
    check('un nom pris à la casse près : la table des modèles n\'est pas renommée (Grist la numéroterait)', 'Publipostage_Modeles' in taken.tables && !Object.keys(taken.tables).some((n) => /^Publipostage_Templates\d/i.test(n)), Object.keys(taken.tables));
    check('les autres tables le sont, et la reprise nomme celle qui reste', 'Publipostage_Comments' in taken.tables && a.schema.lastMigration().skipped.includes('Publipostage_Templates'), JSON.stringify(a.schema.lastMigration()));
    const both = legacyDoc();
    both.tables.Publipostage_Templates = { cols: ['Name'], rows: [{ id: 1, Name: 'déjà là' }] }; // une fenêtre d'une version d'avant a recréé la table, ou une reprise a été coupée
    const b = fresh(both, { migrate: true });
    await b.api.listTables();
    check('deux jeux de noms pour une table : aucune des deux n\'est renommée, la reprise le dit', 'Publipostage_Modeles' in both.tables && same(both.tables.Publipostage_Templates.cols, ['Name']) && b.schema.lastMigration().skipped.includes('Publipostage_Templates'), JSON.stringify(b.schema.lastMigration()));
    const readBoth = await b.api.fetchTable('Publipostage_Templates');
    check('et le traducteur lit celle en anglais (l\'interrupteur est allumé)', same(readBoth.Name, ['déjà là']), JSON.stringify(readBoth));
    const column = legacyDoc();
    column.tables.Publipostage_Modeles.cols.push('name'); // une colonne de la personne, à la casse près de « Name »
    const c = fresh(column, { migrate: true });
    await c.api.listTables();
    check('un nom de colonne pris à la casse près : cette colonne garde son nom d\'avant, les autres sont renommées', column.tables.Publipostage_Templates.cols.includes('Nom') && column.tables.Publipostage_Templates.cols.includes('Content') && c.schema.lastMigration().skipped.includes('Publipostage_Templates.Name'), column.tables.Publipostage_Templates.cols.join(','));
    const partial = legacyDoc();
    partial.tables.Publipostage_Modeles.cols = partial.tables.Publipostage_Modeles.cols.map((c) => (c === 'Contenu' ? 'Content' : c)); // un renommage coupé en route : une colonne déjà anglaise
    const d = fresh(partial, { migrate: true });
    await d.api.listTables();
    check('un renommage à moitié fait se termine : toutes les colonnes sont anglaises', same(partial.tables.Publipostage_Templates.cols, d.schema.TABLES[0].columns.map((c) => c[0])), partial.tables.Publipostage_Templates.cols.join(','));
  });

  await section('la reprise : le lot est refusé, le document garde ses noms et se lit toujours', async () => {
    const doc = legacyDoc();
    doc.failBundles = 1;
    const { api, schema, spy } = fresh(doc, { migrate: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('la fenêtre s\'est ouverte, le lot est parti une fois, Grist l\'a refusé : rien n\'a changé dans le document (tout ou rien)', spy.windows.length === 1 && 'Publipostage_Modeles' in doc.tables && doc.tables.Publipostage_Modeles.cols.includes('Nom') && doc.bundles.length === 0 && doc.failBundles === 0, Object.keys(doc.tables));
    check('la reprise dit qu\'elle a échoué', schema.lastMigration() && schema.lastMigration().failed === true, JSON.stringify(schema.lastMigration()));
    check('la lecture et l\'écriture suivantes passent sous les noms d\'avant, sans nouvelle tentative', same(read.Name, ['Facture', 'Devis']), JSON.stringify(read));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>z</p>' }]]);
    check('l\'écriture arrive sous les noms du document', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>z</p>' }]) && doc.bundles.length === 1 && spy.windows.length === 1, doc.last());
  });

  await section('la reprise : deux fenêtres du même document reprennent en même temps', async () => {
    const doc = legacyDoc();
    const first = fresh(doc, { migrate: true });
    const second = fresh(doc, { migrate: true });
    const [a, b] = await Promise.all([first.api.fetchTable('Publipostage_Templates'), second.api.fetchTable('Publipostage_Templates')]);
    check('une seule reprise a réussi', doc.bundles.length === 1, doc.bundles.length);
    check('les deux fenêtres lisent les mêmes noms anglais et les mêmes lignes', same(a.Name, ['Facture', 'Devis']) && same(b.Name, ['Facture', 'Devis']), JSON.stringify([a.Name, b.Name]));
    await second.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 2, { Name: 'Devis 2' }]]);
    check('celle qui a perdu écrit sous les noms que le document porte maintenant', same(doc.last(), ['UpdateRecord', 'Publipostage_Templates', 2, { Name: 'Devis 2' }]), doc.last());
  });

  await section('la reprise : une table du widget créée ensuite naît en anglais, sans libellé', async () => {
    const doc = legacyDoc();
    delete doc.tables.Publipostage_Abreviations;
    const { api } = fresh(doc, { migrate: true });
    await api.listTables();
    await api.applyUserActions([['AddTable', 'Publipostage_Abbreviations', [{ id: 'User', type: 'Text' }, { id: 'Abbreviation', type: 'Text' }, { id: 'Text', type: 'Text' }]]]);
    check('la table des abréviations est créée sous son nom et ses colonnes anglais', same(doc.last(), ['AddTable', 'Publipostage_Abbreviations', [{ id: 'User', type: 'Text' }, { id: 'Abbreviation', type: 'Text' }, { id: 'Text', type: 'Text' }]]), doc.last());
  });

  // Une table que Sync+ utilise (sa colonne `id_sync`) garde son nom et ses colonnes (le kit la sort du lot : renommée, elle rendrait le lien muet, faits vérifiés de GFS 160) ; le reste est renommé, et le widget la lit et l'écrit sous son nom d'avant.
  await section('la reprise : une table de Sync+ garde son nom d\'avant, les autres passent à l\'anglais', async () => {
    const doc = legacyDoc();
    doc.tables.Publipostage_Modeles.cols.push('id_sync', 'MajLe');
    const { api, schema, spy } = fresh(doc, { migrate: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('la fenêtre dit que la table des modèles reste sous son nom (elle ne s\'ouvre pas pour elle seule)', spy.windows.length === 1 && same(spy.windows[0].held, ['Publipostage_Modeles']) && spy.windows[0].summary.tables.length === 5, JSON.stringify(spy.windows));
    check('la table des modèles garde son nom ET ses colonnes d\'avant, Sync+ continue d\'envoyer', 'Publipostage_Modeles' in doc.tables && !('Publipostage_Templates' in doc.tables) && doc.tables.Publipostage_Modeles.cols.includes('Nom') && doc.tables.Publipostage_Modeles.cols.includes('id_sync'), Object.keys(doc.tables));
    check('les cinq autres tables du widget sont renommées', ['Publipostage_Comments', 'Publipostage_TemplatePreferences', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_TableLinks'].every((n) => n in doc.tables) && !('Publipostage_Commentaires' in doc.tables), Object.keys(doc.tables));
    check('la reprise dit ce qui est gardé', schema.lastMigration() && same(schema.lastMigration().held, ['Publipostage_Modeles']) && schema.lastMigration().failed === false, JSON.stringify(schema.lastMigration()));
    check('les modèles se lisent sous les noms anglais du code, depuis la table qui garde son nom d\'avant', same(read.Name, ['Facture', 'Devis']) && same(read.id, [1, 2]), JSON.stringify(read));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>s</p>' }]]);
    check('et s\'écrivent sous ses noms d\'avant, sans table anglaise créée à côté', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>s</p>' }]) && !('Publipostage_Templates' in doc.tables), doc.last());
    const bundles = doc.bundles.length;
    const next = fresh(doc, { migrate: true });
    await next.api.fetchTable('Publipostage_Templates');
    check('à l\'ouverture suivante : le module se charge (un nom d\'avant reste), mais la fenêtre ne s\'ouvre plus, aucune pause n\'est posée et rien n\'est écrit', next.spy.loads === 1 && next.spy.windows.length === 0 && next.spy.pauses === 0 && doc.bundles.length === bundles && 'Publipostage_Modeles' in doc.tables, JSON.stringify({ spy: next.spy, bundles: doc.bundles.length - bundles }));
  });

  await section('la reprise : des libellés qui diffèrent, sans nom d\'avant, n\'ouvrent pas la fenêtre', async () => {
    const doc = legacyDoc();
    await fresh(doc, { migrate: true }).api.listTables();
    doc.setLabels('Publipostage_Templates', { Margins: 'Marges de page' }); // un libellé que la personne a changé à la main
    const bundles = doc.bundles.length;
    const next = fresh(doc, { migrate: true });
    await next.api.fetchTable('Publipostage_Templates');
    await next.api.listTables();
    check('aucun module, aucune fenêtre, aucune écriture : un libellé n\'est pas un nom', next.spy.loads === 0 && next.spy.windows.length === 0 && doc.bundles.length === bundles && doc.labelOf('Publipostage_Templates', 'Margins') === 'Marges de page', JSON.stringify(next.spy));
  });

  await section('la reprise : la première écriture, ou la première lecture de la liste, passe aussi par la fenêtre', async () => {
    const written = legacyDoc();
    const w = fresh(written, { migrate: true });
    await w.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Z' }]]);
    check('une écriture qui arrive la première : la fenêtre d\'abord, puis l\'écriture sous les noms anglais', w.spy.windows.length === 1 && written.bundles.length === 2 && same(written.last(), ['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Z' }]) && stillLegacy(written).length === 0, JSON.stringify({ windows: w.spy.windows.length, bundles: written.bundles.length, last: written.last() }));
    const listed = legacyDoc();
    const l = fresh(listed, { migrate: true });
    const names = await l.api.listTables();
    check('la liste des tables lue la première : la fenêtre d\'abord, la liste rendue est celle d\'après (relue)', l.spy.windows.length === 1 && names.includes('Publipostage_Templates') && listed.bundles.length === 1 && stillLegacy(listed).length === 0, JSON.stringify(names));
    const many = legacyDoc();
    const m = fresh(many, { migrate: true });
    const [t, c, list] = await Promise.all([m.api.fetchTable('Publipostage_Templates'), m.api.fetchTable('Publipostage_Comments'), m.api.listTables()]);
    check('plusieurs lectures à la fois : une seule fenêtre, un seul lot, tout le monde lit sous les noms anglais', m.spy.windows.length === 1 && many.bundles.length === 1 && same(t.Name, ['Facture', 'Devis']) && same(c.Text, ['à revoir']) && list.includes('Publipostage_Templates'), JSON.stringify({ windows: m.spy.windows.length, bundles: many.bundles.length }));
  });

  await section('la reprise : pendant que la fenêtre attend la personne, une écriture attend et part sous les noms d\'après', async () => {
    const doc = legacyDoc();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { api, spy } = fresh(doc, { migrate: true, gate });
    const first = api.fetchTable('Publipostage_Templates');
    await new Promise((resolve) => setTimeout(resolve, 20));
    check('la fenêtre est ouverte, rien n\'est parti', spy.windows.length === 1 && doc.bundles.length === 0 && doc.journal.length === 0, JSON.stringify({ windows: spy.windows.length, bundles: doc.bundles.length }));
    const write = api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Attend' }]]);
    const read = api.fetchTable('Publipostage_Comments');
    await new Promise((resolve) => setTimeout(resolve, 20));
    check('une écriture et une lecture arrivées entre-temps attendent : toujours rien d\'écrit', doc.bundles.length === 0 && doc.journal.length === 0, JSON.stringify(doc.journal));
    release();
    const [rows, , comments] = await Promise.all([first, write, read]);
    check('la personne clique : le lot, puis l\'écriture sous les noms anglais, et les lectures sous les mêmes', doc.bundles.length === 2 && same(doc.last(), ['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Attend' }]) && same(rows.id, [1, 2]) && same(comments.Text, ['à revoir']), JSON.stringify(doc.last()));
    check('la fenêtre ne s\'est ouverte qu\'une fois', spy.windows.length === 1, spy.windows.length);
  });

  await section('la reprise : la page n\'est pas encore entièrement chargée, la fenêtre l\'attend', async () => {
    const listeners = [];
    const document = { readyState: 'loading', addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') listeners.push(fn); } };
    const doc = legacyDoc();
    const { api, spy } = fresh(doc, { migrate: true, document });
    const pending = api.fetchTable('Publipostage_Templates');
    await new Promise((resolve) => setTimeout(resolve, 20));
    check('page en cours de chargement : aucune fenêtre, aucune langue réglée, rien d\'écrit', spy.windows.length === 0 && spy.languages.length === 0 && doc.bundles.length === 0 && listeners.length === 1, JSON.stringify(spy.order));
    listeners.forEach((fn) => fn());
    const rows = await pending;
    check('DOMContentLoaded : la langue, la pause, la fenêtre, le lot', same(spy.order, ['langue:en', 'pause', 'fenêtre', 'resume']) && doc.bundles.length === 1 && same(rows.Name, ['Facture', 'Devis']), JSON.stringify(spy.order));
  });

  // --- La preuve de propriété de la fenêtre --------------------------------------------------------------------------------------------------------------------------------------
  await section('104 : la preuve de propriété', async () => {
    const proof = async (options) => { const f = fresh(new Doc(), Object.assign({ migrate: true }, options)); return { value: await f.bridge.proveOwner(), spy: f.spy }; };
    const owner = await proof({ owner: true });
    check('seule : 200 et la liste des webhooks : propriétaire', owner.value === true, owner.value);
    check('seule : le jeton d\'écriture est demandé une fois et sert une fois, à l\'adresse du document + /webhooks, avec `auth`', owner.spy.accessAsked === 1 && same(owner.spy.urls, ['https://grist.test/api/docs/d1/webhooks?auth=wtok']), JSON.stringify(owner.spy.urls));
    const refused = await proof({ owner: false });
    check('seule : 403 : pas propriétaire (false, pas null : Grist a répondu)', refused.value === false, refused.value);
    for (const [label, value] of [['500', null], ['une page qui n\'est pas la liste des webhooks', 'html'], ['le réseau qui échoue', 'reseau'], ['un jeton que Grist refuse', 'jeton']]) {
      const result = await proof({ owner: value });
      check('seule : ' + label + ' : pas de preuve (null), et rien n\'est écrit dans la console', result.value === null && result.spy.warnings.length === 0, JSON.stringify({ value: result.value, warnings: result.spy.warnings }));
    }
    const odd = await proof({ owner: true, token: 'stub-token a b/c+d?e=f&g' });
    check('seule : le jeton est encodé dans l\'adresse (rien ne s\'y glisse)', odd.spy.urls.length === 1 && odd.spy.urls[0] === 'https://grist.test/api/docs/d1/webhooks?auth=' + encodeURIComponent('stub-token a b/c+d?e=f&g') && !odd.spy.urls[0].includes(' '), JSON.stringify(odd.spy.urls));
    for (const [label, value] of [['propriétaire', true], ['pas propriétaire', false], ['pas prouvé', null]]) {
      const hosted = await proof({ hosted: { owner: value } });
      check('dans GFS : ' + label + ' : ' + value + ', sans jeton ni adresse demandés', hosted.value === value && hosted.spy.accessAsked === 0 && hosted.spy.urls.length === 0, JSON.stringify(hosted.value));
    }
    let release;
    const ready = new Promise((resolve) => { release = resolve; });
    const f = fresh(new Doc(), { migrate: true, hosted: { owner: true, ready } });
    let settled = false;
    const waiting = f.bridge.proveOwner().then((value) => { settled = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    check('dans GFS : la preuve attend la réponse du contexte (`GfsLink.ready`) avant de lire le rôle', settled === false, settled);
    release();
    check('dans GFS : puis rend le rôle', (await waiting) === true);
    const bare = createContext({ console: { warn() {}, log() {}, error() {} } });
    loadScript(bare, 'js/names-update.js');
    check('sans GristAPI ni GfsLink (un contexte sans page) : pas de preuve', (await evalIn(bare, 'NamesUpdateBridge.proveOwner()')) === null);
    // Un serveur qui ne répond pas : la preuve s'arrête d'elle-même (8 s) au lieu d'attendre le démarrage de l'app sans fin.
    const timers = [];
    const hang = createContext({
      console: { warn() {}, log() {}, error() {} }, AbortController,
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
      GristAPI: { getWriteAccess: async () => ({ token: 't', baseUrl: 'https://grist.test/api/docs/d1', expiresAt: Date.now() + 1e5 }) },
      fetch: (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }),
    });
    loadScript(hang, 'js/names-update.js');
    const hung = evalIn(hang, 'NamesUpdateBridge.proveOwner()');
    await new Promise((resolve) => setTimeout(resolve, 20));
    check('un serveur qui ne répond pas : un compte à rebours de 8 s est posé', timers.length === 1 && timers[0].ms === 8000, JSON.stringify(timers.map((t) => t.ms)));
    timers[0].fn();
    check('et à son échéance la preuve rend null (pas de fenêtre, l\'app continue)', (await hung) === null);
  });

  // --- Consigne 104 f : un renommage venu d'ailleurs (un autre onglet, une autre personne, une restauration) ----------------------------------------------------------------------------
  // La page a lu les noms d'avant ; un autre onglet passe le document à l'anglais ; son écriture suivante vise des noms qui n'existent plus. Le faux document est « strict » comme le moteur de Grist (KeyError sur un nom absent, le lot entier refusé).
  const PREF_COLS = ['Utilisateur', 'ModeleId', 'Epingle', 'Dossier', 'Replie', 'TypeExport', 'QualitePdf', 'LignesExport'];
  const RENAME_TEMPLATES = [['RenameTable', 'Publipostage_Modeles', 'Publipostage_Templates'], ['RenameColumn', 'Publipostage_Templates', 'Nom', 'Name'], ['RenameColumn', 'Publipostage_Templates', 'Contenu', 'Content'], ['RenameColumn', 'Publipostage_Templates', 'Jeton', 'Token']];
  const RENAME_PREFS = [['RenameTable', 'Publipostage_PreferencesModeles', 'Publipostage_TemplatePreferences'], ['RenameColumn', 'Publipostage_TemplatePreferences', 'Utilisateur', 'User'], ['RenameColumn', 'Publipostage_TemplatePreferences', 'ModeleId', 'TemplateId']];
  // Une page qui a lu les noms d'avant d'un document strict (modèles, préférences, une table de la personne), avec un faux pont qui note les « Rechargez la page » et un faux moteur de refus d'accès.
  async function stalePage(extra = {}) {
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS, Publipostage_PreferencesModeles: PREF_COLS, Missions: ['Nom'] });
    doc.strict = true;
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'Facture', Contenu: '<p>a</p>', Jeton: 'tok1' });
    const announced = [];
    const globals = Object.assign({
      NamesUpdateBridge: { announceStale: () => { announced.push('annonce'); return Promise.resolve(true); } },
      GristAPI: { noteRefusal: (error) => /Blocked by/.test(String(error && error.message)) },
    }, extra);
    const page = fresh(doc, { englishOnDisk: true, globals });
    await page.api.listTables();
    await page.api.fetchTable('Publipostage_Templates');
    return Object.assign(page, { doc, announced });
  }
  const failure = async (promise) => { try { await promise; return null; } catch (e) { return e; } };

  await section('une écriture vers des noms renommés ailleurs : les noms sont relus, l\'écriture recommence une fois', async () => {
    const { api, schema, doc, announced } = await stalePage();
    await doc.applyUserActions(RENAME_TEMPLATES);
    const before = doc.attempts.length;
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>b</p>', Token: 'tok2' }]]);
    const tried = doc.attempts.slice(before).map((json) => JSON.parse(json)[0]);
    check('deux essais : l\'un sous les noms d\'avant (refusé, rien d\'écrit), l\'autre sous les noms d\'aujourd\'hui', tried.length === 2 && tried[0][1] === 'Publipostage_Modeles' && tried[1][1] === 'Publipostage_Templates', JSON.stringify(tried));
    check('le second essai porte les colonnes anglaises que le document a maintenant', same(tried[1][3], { Content: '<p>b</p>', Token: 'tok2' }), JSON.stringify(tried[1]));
    check('la ligne a reçu l\'écriture, une seule fois', doc.tables.Publipostage_Templates.rows.length === 1 && doc.tables.Publipostage_Templates.rows[0].Content === '<p>b</p>' && doc.tables.Publipostage_Templates.rows[0].Token === 'tok2', JSON.stringify(doc.tables.Publipostage_Templates));
    check('aucune table d\'avant ne renaît, aucune table anglaise n\'est créée en double', same(Object.keys(doc.tables).sort(), ['Missions', 'Publipostage_PreferencesModeles', 'Publipostage_Templates']), Object.keys(doc.tables));
    check('rien n\'est annoncé : la page est à jour', announced.length === 0 && schema.isStale() === false);
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis' }]]);
    check('et l\'écriture d\'après ne coûte plus qu\'un essai (les noms relus sont gardés)', doc.attempts.length - before === 3 && doc.tables.Publipostage_Templates.rows[0].Name === 'Devis', doc.attempts.length - before);
    const read = await api.fetchTable('Publipostage_Templates');
    check('la lecture, elle aussi, suit les noms d\'aujourd\'hui', same(read.Name, ['Devis']) && same(read.Token, ['tok2']), JSON.stringify(read));
  });

  await section('une colonne seule renommée ailleurs', async () => {
    const { api, doc, announced } = await stalePage();
    await doc.applyUserActions([['RenameTable', 'Publipostage_Modeles', 'Publipostage_Templates']]);   // la table suit déjà le nouveau nom pour cette page...
    await api.listTables();                                                                              // ... qui le sait,
    await api.fetchTable('Publipostage_Templates');                                                        // et lit les colonnes d'avant
    await doc.applyUserActions([['RenameColumn', 'Publipostage_Templates', 'Nom', 'Name']]);
    const before = doc.attempts.length;
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis' }]]);
    check('l\'écriture vers la colonne d\'avant échoue puis recommence sous le nom d\'aujourd\'hui', doc.attempts.length - before === 2 && doc.tables.Publipostage_Templates.rows[0].Name === 'Devis', doc.attempts.length - before);
    check('sans rien annoncer', announced.length === 0);
  });

  await section('un lot de plusieurs actions sur deux tables renommées : tout est relancé, rien n\'est à moitié écrit', async () => {
    const { api, doc, announced } = await stalePage();
    await doc.applyUserActions([...RENAME_TEMPLATES, ...RENAME_PREFS]);
    const before = doc.attempts.length;
    await api.applyUserActions([
      ['AddRecord', 'Publipostage_Templates', null, { Name: 'Contrat', Token: 'tok9' }],
      ['AddRecord', 'Publipostage_TemplatePreferences', null, { User: 'a@b.fr', TemplateId: 1 }],
    ]);
    check('un essai refusé en entier, un essai accepté', doc.attempts.length - before === 2, doc.attempts.length - before);
    check('chaque table a reçu sa ligne, une seule fois', doc.tables.Publipostage_Templates.rows.length === 2 && doc.tables.Publipostage_TemplatePreferences.rows.length === 1, JSON.stringify([doc.tables.Publipostage_Templates.rows.length, doc.tables.Publipostage_TemplatePreferences.rows.length]));
    check('et la page n\'a rien dit', announced.length === 0);
  });

  await section('deux écritures en même temps sur une page périmée', async () => {
    const { api, doc, announced } = await stalePage();
    await doc.applyUserActions(RENAME_TEMPLATES);
    await Promise.all([
      api.applyUserActions([['AddRecord', 'Publipostage_Templates', null, { Name: 'Un' }]]),
      api.applyUserActions([['AddRecord', 'Publipostage_Templates', null, { Name: 'Deux' }]]),
    ]);
    const names = doc.tables.Publipostage_Templates.rows.map((row) => row.Name).sort();
    check('les deux lignes sont là, une fois chacune', same(names, ['Deux', 'Facture', 'Un']), names);
    check('rien n\'est annoncé', announced.length === 0);
  });

  await section('les noms ont changé encore, ou la relance échoue aussi : « Rechargez la page », et plus rien n\'est écrit', async () => {
    const { api, schema, doc, announced } = await stalePage({ I18n: { t: (key) => 'T:' + key } });
    await doc.applyUserActions(RENAME_TEMPLATES);
    doc.failQueue = [null, '[Sandbox] KeyError \'Publipostage_Templates\''];   // le premier essai échoue de lui-même (noms d'avant), le second est refusé par le moteur
    const before = doc.attempts.length;
    const error = await failure(api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>b</p>' }]]));
    check('deux essais, pas trois', doc.attempts.length - before === 2, doc.attempts.length - before);
    check('l\'erreur porte le code NAMES_CHANGED_ELSEWHERE et le texte « Rechargez la page »', !!error && error.code === 'NAMES_CHANGED_ELSEWHERE' && error.message === 'T:names.stale.error', error && error.message);
    check('l\'erreur de Grist est gardée comme cause', !!error && !!error.cause && /KeyError/.test(error.cause.message), error && error.cause && error.cause.message);
    check('la page le dit une fois à la personne', announced.length === 1 && schema.isStale() === true, announced.length);
    const after = doc.attempts.length;
    const refused = await failure(api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>c</p>' }]]));
    check('une écriture de plus dans une table du widget est refusée SANS appeler Grist', !!refused && refused.code === 'NAMES_CHANGED_ELSEWHERE' && doc.attempts.length === after, doc.attempts.length - after);
    check('et ne le redit pas', announced.length === 1);
    const create = await failure(api.applyUserActions([['AddTable', 'Publipostage_Comments', [{ id: 'Text', type: 'Text' }]]]));
    check('ni ne crée une table que la page croit manquer', !!create && create.code === 'NAMES_CHANGED_ELSEWHERE' && doc.attempts.length === after && !('Publipostage_Comments' in doc.tables) && !('Publipostage_Commentaires' in doc.tables), doc.attempts.length - after);
    await api.applyUserActions([['AddRecord', 'Missions', null, { Nom: 'Mission 1' }]]);
    check('les tables de la personne, elles, s\'écrivent comme avant', doc.tables.Missions.rows.length === 1 && doc.attempts.length === after + 1, doc.attempts.length - after);
    schema.reset();
    check('reset (essais) rend à la page ses écritures', schema.isStale() === false);
  });

  await section('ce qui n\'est pas un renommage venu d\'ailleurs garde l\'erreur de Grist, sans relance', async () => {
    // Une colonne supprimée à la main : aucun nom n'a changé, la même écriture échouerait de la même façon.
    const mine = await stalePage();
    mine.doc.tables.Publipostage_Modeles.cols = mine.doc.tables.Publipostage_Modeles.cols.filter((col) => col !== 'Contenu');
    const before = mine.doc.attempts.length;
    const missing = await failure(mine.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>b</p>' }]]));
    check('colonne supprimée à la main : l\'erreur de Grist, un seul essai', !!missing && /KeyError 'Contenu'/.test(missing.message) && mine.doc.attempts.length - before === 1, missing && missing.message);
    check('et la page ne dit rien', mine.announced.length === 0 && mine.schema.isStale() === false);

    // Un refus d'une règle d'accès : rejoué, il serait refusé de nouveau.
    const refused = await stalePage();
    refused.doc.failQueue = ['Blocked by full structure access rules'];
    const b2 = refused.doc.attempts.length;
    const readsBefore = refused.doc.reads.length;
    const blocked = await failure(refused.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'x' }]]));
    check('un refus d\'une règle d\'accès : un seul essai, la phrase de Grist', !!blocked && /Blocked by full structure/.test(blocked.message) && refused.doc.attempts.length - b2 === 1, blocked && blocked.message);
    check('et aucune relecture des noms pour lui', refused.doc.reads.length === readsBefore && refused.announced.length === 0, JSON.stringify(refused.doc.reads.slice(readsBefore)));

    // La création d'une table ne se relance jamais : Grist numérote un nom pris, il ne le refuse pas.
    const creating = await stalePage();
    creating.doc.failQueue = ['[Sandbox] KeyError \'x\''];
    const b3 = creating.doc.attempts.length;
    const created = await failure(creating.api.applyUserActions([['AddTable', 'Publipostage_Comments', [{ id: 'Text', type: 'Text' }]]]));
    check('une création de table : un seul essai', !!created && creating.doc.attempts.length - b3 === 1, created && created.message);

    // Une table de la personne : pas la nôtre.
    const theirs = await stalePage();
    theirs.doc.failQueue = ['[Sandbox] KeyError \'Mission\''];
    const b4 = theirs.doc.attempts.length;
    const own = await failure(theirs.api.applyUserActions([['UpdateRecord', 'Missions', 1, { Mission: 'x' }]]));
    check('une table de la personne : un seul essai, l\'erreur telle quelle', !!own && /KeyError 'Mission'/.test(own.message) && theirs.doc.attempts.length - b4 === 1, own && own.message);

    // Les noms ont changé, la relance échoue pour une autre raison : l'erreur de Grist, pas « Rechargez la page ».
    const other = await stalePage();
    await other.doc.applyUserActions(RENAME_TEMPLATES);
    other.doc.failQueue = [null, 'Valeur refusée pour la colonne Content'];
    const b5 = other.doc.attempts.length;
    const refusedValue = await failure(other.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: 12 }]]));
    check('les noms ont changé mais la relance dit autre chose : cette erreur-là, sans « Rechargez la page »', !!refusedValue && refusedValue.message === 'Valeur refusée pour la colonne Content' && other.doc.attempts.length - b5 === 2 && other.announced.length === 0 && other.schema.isStale() === false, refusedValue && refusedValue.message);
    const again = await other.api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>ok</p>' }]]);
    check('et la page écrit encore ensuite', !!again && other.doc.tables.Publipostage_Templates.rows[0].Content === '<p>ok</p>');
  });

  await section('une lecture vers un nom renommé ailleurs recommence une fois sous le nom d\'aujourd\'hui', async () => {
    const { api, doc } = await stalePage();
    await doc.applyUserActions(RENAME_TEMPLATES);
    doc.reads.length = 0;
    const read = await api.fetchTable('Publipostage_Templates');
    check('la table est lue sous le nom d\'aujourd\'hui, colonnes anglaises', same(read.Name, ['Facture']) && same(read.Token, ['tok1']), JSON.stringify(read));
    check('une lecture ratée sous l\'ancien nom, une réussie sous le nouveau', doc.reads.filter((name) => name === 'Publipostage_Modeles').length === 1 && doc.reads.filter((name) => name === 'Publipostage_Templates').length === 1, doc.reads);

    // Une erreur qui parle d'autre chose (le réseau) reste la sienne : les noms ne sont pas relus.
    const net = await stalePage();
    const failing = net.doc.fetchTable.bind(net.doc);
    net.doc.fetchTable = async (name) => { if (name === 'Publipostage_Modeles') { net.doc.reads.push(name); throw new Error('Failed to fetch'); } return failing(name); };
    net.doc.reads.length = 0;
    const down = await failure(net.api.fetchTable('Publipostage_Templates'));
    check('une panne de réseau : son erreur, une seule lecture, aucune relecture des noms', !!down && down.message === 'Failed to fetch' && same(net.doc.reads, ['Publipostage_Modeles']), JSON.stringify(net.doc.reads));

    // La table n'a pas changé de nom (elle n'existe plus) : l'erreur, sans boucle.
    const gone = await stalePage();
    delete gone.doc.tables.Publipostage_Modeles;
    gone.doc.reads.length = 0;
    const lost = await failure(gone.api.fetchTable('Publipostage_Templates'));
    check('une table disparue (aucun de ses deux noms) : l\'erreur de Grist, une seule lecture de la table, pas de boucle', !!lost && /Invalid table Publipostage_Modeles/.test(lost.message) && gone.doc.reads.filter((name) => /^Publipostage_/.test(name)).length === 1, JSON.stringify([lost && lost.message, gone.doc.reads]));
  });

  await section('NamesUpdateBridge.announceStale : « Rechargez la page »', async () => {
    const make = (answer, { dialogs = true } = {}) => {
      const spy = { asked: [], reloads: 0, keys: [] };
      const globals = {
        I18n: { t: (key) => { spy.keys.push(key); return 'T:' + key; } },
        window: { location: { reload: () => { spy.reloads++; } } },
        console: { warn: (...args) => spy.keys.push('warn') },
      };
      if (dialogs) globals.Dialogs = { choose: async (options) => { spy.asked.push(options); return typeof answer === 'function' ? answer() : answer; } };
      const ctx = createContext(globals);
      loadScript(ctx, 'js/names-update.js');
      return { spy, bridge: evalIn(ctx, 'NamesUpdateBridge') };
    };
    const reload = make('reload');
    const shown = await reload.bridge.announceStale();
    check('une fenêtre simple : le titre « Rechargez la page », le message, un bouton qui recharge, « Fermer » à côté', shown === true && reload.spy.asked.length === 1 && reload.spy.asked[0].title === 'T:names.stale.title' && reload.spy.asked[0].message === 'T:names.stale.message' && same(reload.spy.asked[0].choices, [{ value: 'reload', label: 'T:names.stale.reload', primary: true }]) && reload.spy.asked[0].cancelLabel === 'T:common.close', JSON.stringify(reload.spy.asked));
    check('« Recharger la page » recharge la page', reload.spy.reloads === 1, reload.spy.reloads);
    const again = await reload.bridge.announceStale();
    check('une seule fenêtre par page : la seconde demande ne rouvre rien', again === false && reload.spy.asked.length === 1 && reload.spy.reloads === 1, JSON.stringify([again, reload.spy.asked.length]));
    const close = make(null);
    await close.bridge.announceStale();
    check('« Fermer » laisse la page telle quelle (la personne copie ce qu\'elle n\'avait pas enregistré)', close.spy.asked.length === 1 && close.spy.reloads === 0, close.spy.reloads);
    const bare = make('reload', { dialogs: false });
    check('sans fenêtre simple (page incomplète) : rien n\'est ouvert, aucune exception', (await bare.bridge.announceStale()) === false && bare.spy.reloads === 0);
    const broken = make(() => { throw new Error('boum'); });
    check('une fenêtre qui échoue ne casse rien', (await broken.bridge.announceStale()) === false && broken.spy.reloads === 0 && broken.spy.keys.includes('warn'), JSON.stringify(broken.spy.keys));
  });

  await section('SchemaColumns -> NamesUpdateBridge : l\'annonce, avec le vrai pont', async () => {
    // La page entière, vraie : le traducteur (js/schema-columns.js) et le pont (js/names-update.js), une fenêtre simple et un rechargement notés.
    const doc = new Doc({ Publipostage_Modeles: LEGACY_COLS });
    doc.strict = true;
    doc.tables.Publipostage_Modeles.rows.push({ id: 1, Nom: 'Facture', Jeton: 'tok1' });
    const spy = { asked: [], reloads: 0 };
    const globals = { I18n: { t: (key) => 'T:' + key, getLang: () => 'fr' }, window: { location: { reload: () => { spy.reloads++; } } }, Dialogs: { choose: async (options) => { spy.asked.push(options); return 'reload'; } } };
    const ctx = createContext(Object.assign({ grist: { docApi: doc }, console: { warn() {}, log() {}, error() {} } }, globals));
    loadScript(ctx, 'js/schema-columns.js');
    loadScript(ctx, 'js/names-update.js');
    evalIn(ctx, 'SchemaColumns.setEnglishOnDisk(true)');
    evalIn(ctx, 'SchemaColumns.setRenameDocuments(false)');
    const api = evalIn(ctx, 'SchemaColumns.docApi');
    await api.listTables();
    await api.fetchTable('Publipostage_Templates');
    await doc.applyUserActions(RENAME_TEMPLATES);
    doc.failQueue = [null, '[Sandbox] KeyError \'Publipostage_Templates\''];
    const error = await failure(api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Name: 'Devis' }]]));
    await new Promise((resolve) => setTimeout(resolve, 10));
    check('l\'écriture échoue avec le code NAMES_CHANGED_ELSEWHERE', !!error && error.code === 'NAMES_CHANGED_ELSEWHERE', error && error.message);
    check('la fenêtre « Rechargez la page » s\'est ouverte une fois, et le bouton a rechargé la page', spy.asked.length === 1 && spy.asked[0].title === 'T:names.stale.title' && spy.reloads === 1, JSON.stringify([spy.asked.length, spy.reloads]));
  });

  await section('planRenames : le plan seul', async () => {
    const { schema } = fresh(new Doc());
    const plan = schema.planRenames(new Set(['Publipostage_Modeles']), (t) => (t === 'Publipostage_Modeles' ? new Map([['Nom', 'Nom'], ['Margins', 'Marges de page']]) : null));
    check('un plan sans état du document : les actions de cette seule table', same(plan.actions, [['RenameTable', 'Publipostage_Modeles', 'Publipostage_Templates'], ['RenameColumn', 'Publipostage_Templates', 'Nom', 'Name'], ['ModifyColumn', 'Publipostage_Templates', 'Name', { label: 'Name' }], ['ModifyColumn', 'Publipostage_Templates', 'Margins', { label: 'Margins' }]]), JSON.stringify(plan.actions));
    const none = schema.planRenames(new Set(['Missions']), () => null);
    check('aucune table du widget : aucun plan', none.actions.length === 0 && none.tables === 0, JSON.stringify(none));
    const unknown = schema.planRenames(new Set(['Publipostage_Modeles']), () => new Map([['Nom', undefined]]));
    check('un libellé que les métadonnées ne donnent pas n\'est pas réécrit', unknown.actions.every((a) => a[0] !== 'ModifyColumn'), JSON.stringify(unknown.actions));
  });

  await section('la liste est complète et sans doublon', async () => {
    const { schema } = fresh(new Doc());
    const tables = schema.TABLES;
    const ids = tables.flatMap((t) => t.columns.map((c) => c[0]));
    const legacies = tables.flatMap((t) => t.columns.map((c) => c[1]));
    check('dans une table : un nom anglais par colonne, jamais deux fois le même', tables.every((t) => new Set(t.columns.map((c) => c[0])).size === t.columns.length), ids);
    check('dans une table : un nom d\'avant par colonne, jamais deux fois le même', tables.every((t) => new Set(t.columns.map((c) => c[1])).size === t.columns.length), legacies);
    check('les sept tables du widget qui avaient un nom français : une entrée chacune, sous des noms anglais distincts', tables.length === 7 && new Set(tables.map((t) => t.id)).size === 7, tables.map((t) => t.id));
    // La 19e colonne, « Notice » (js/template-notice.js), est née en anglais : rien d'avant à renommer, son nom d'avant est le même ; les documents d'avant (LEGACY_COLS) ne l'ont pas.
    check('la table des modèles porte ses 19 colonnes', tables[0].columns.length === 19 && same(tables[0].columns.map((c) => c[0]), [...ENGLISH_COLS, 'Notice']) && same(tables[0].columns.map((c) => c[1]), [...LEGACY_COLS, 'Notice']), tables[0].columns.length);
    check('aucun nom anglais ne porte un accent ni une lettre française', ids.every((id) => /^[A-Za-z]+$/.test(id)), ids);
  });
}

await main();
summarizeAndExit();
