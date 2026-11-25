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
//  - la reprise d'un document d'avant (migrate, SchemaColumns.planRenames) : un seul lot (RenameTable, RenameColumn, libellés) rejoué en entier ou pas du tout, les données et les lignes intactes, rien de
//    renommé pour un compte Lecteur, quand le nom anglais est pris (à la casse près) ou quand le document porte les deux, ni quand le lot est refusé (le document garde ses noms, lus tels quels) ; deux fenêtres
//    qui reprennent en même temps ; un document déjà repris n'est plus touché.
// Lancer : node dev-tests/unit-schema-columns.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    try {
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

function fresh(doc, { englishOnDisk = false, migrate = false, globals = {} } = {}) {
  // Un journal muet : le traducteur avertit (console.warn) quand un lot de renommage est refusé, ce que plusieurs cas jouent exprès.
  const quiet = { warn() {}, log() {}, error() {} };
  const ctx = createContext(Object.assign({ grist: { docApi: doc }, console: quiet }, globals));
  loadScript(ctx, 'js/schema-columns.js');
  evalIn(ctx, `SchemaColumns.setEnglishOnDisk(${englishOnDisk || migrate})`);
  evalIn(ctx, `SchemaColumns.setRenameDocuments(${migrate})`);
  return { api: evalIn(ctx, 'SchemaColumns.docApi'), schema: evalIn(ctx, 'SchemaColumns'), run: (expr) => evalIn(ctx, expr) };
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

  // --- La reprise d'un document d'avant ---------------------------------------------------------------------------------------------------------------------------------------
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

  await section('la reprise : un document d\'avant est renommé en un seul lot, sans rien perdre', async () => {
    const doc = legacyDoc();
    const { api, schema } = fresh(doc, { migrate: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('la première lecture reprend le document : un seul lot', doc.bundles.length === 1, doc.bundles.length);
    check('les sept tables portent leur nom anglais (la table des versions garde le sien) et plus rien d\'avant', schema.TABLES.every((t) => t.id in doc.tables && (t.legacyId === t.id || !(t.legacyId in doc.tables))), Object.keys(doc.tables));
    check('chaque colonne de la liste porte son nom anglais, aucune colonne d\'avant ne reste', schema.TABLES.every((t) => same(doc.tables[t.id].cols, t.columns.map((c) => c[0]))), schema.TABLES.map((t) => doc.tables[t.id].cols.join(',')));
    check('l\'identifiant de chaque colonne est son libellé (le libellé ne suit pas le renommage dans Grist : le lot le pose)', labelsAreIds(doc, schema), JSON.stringify(doc.labels));
    check('les lignes sont intactes, sous les noms anglais', same(read.Name, ['Facture', 'Devis']) && same(read.Content, ['<p>a</p>', '<p>b</p>']) && same(read.id, [1, 2]) && same(read.Token, ['tok1', 'tok2']), JSON.stringify(read));
    check('les commentaires et les versions aussi', same(doc.tables.Publipostage_Comments.rows, [{ id: 1, TemplateId: 1, Text: 'à revoir' }]) && same(doc.tables.Publipostage_Versions.rows, [{ id: 1, Token: 'tok1', Name: 'v1', Data: '{}' }]), JSON.stringify(doc.tables.Publipostage_Comments.rows));
    check('la table de la personne n\'est pas touchée', same(doc.tables.Missions, { cols: ['Nom'], rows: [{ id: 1, Nom: 'Paris' }] }), JSON.stringify(doc.tables.Missions));
    const result = schema.lastMigration();
    check('la reprise dit ce qu\'elle a fait : six tables, des colonnes, des libellés, rien d\'échoué', result && result.tables === 6 && result.columns > 30 && result.labels > 40 && result.failed === false && result.skipped.length === 0, JSON.stringify(result));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>c</p>', ModifiedAt: 'x' }]]);
    check('l\'écriture suivante va sous les noms anglais, sans recréer de table d\'avant', same(doc.last(), ['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>c</p>', ModifiedAt: 'x' }]) && !('Publipostage_Modeles' in doc.tables), doc.last());
    const again = await api.listTables();
    check('la liste des tables rend les noms anglais, une fois chacun', same(again, ['Publipostage_Templates', 'Publipostage_Comments', 'Publipostage_Versions', 'Publipostage_TemplatePreferences', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_TableLinks', 'Missions']), again);
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

  await section('la reprise : un document déjà repris n\'est plus touché', async () => {
    const doc = legacyDoc();
    await fresh(doc, { migrate: true }).api.listTables();
    const before = doc.bundles.length;
    const renamedBefore = renameActions(doc).length;
    const next = fresh(doc, { migrate: true });
    await next.api.fetchTable('Publipostage_Templates');
    check('une seconde ouverture ne renomme rien et n\'écrit rien', doc.bundles.length === before && renameActions(doc).length === renamedBefore && renamedBefore > 0, doc.bundles.length);
    check('et la reprise n\'a rien à dire', next.schema.lastMigration() === null, JSON.stringify(next.schema.lastMigration()));
  });

  await section('la reprise : un document neuf (aucune table du widget) n\'est ni lu ni écrit', async () => {
    const doc = new Doc({ Missions: ['Nom'] });
    const { api } = fresh(doc, { migrate: true });
    await api.listTables();
    check('aucune écriture, aucune lecture des métadonnées', doc.bundles.length === 0 && !doc.reads.includes('_grist_Tables') && !doc.reads.includes('_grist_Tables_column'), doc.reads);
  });

  await section('la reprise : un compte Lecteur ne renomme rien, le document se lit sous ses noms d\'avant', async () => {
    const doc = legacyDoc();
    const { api } = fresh(doc, { migrate: true, globals: { GristAPI: { isDocumentReadOnly: () => true } } });
    const read = await api.fetchTable('Publipostage_Templates');
    check('aucune écriture', doc.bundles.length === 0 && 'Publipostage_Modeles' in doc.tables, doc.bundles.length);
    check('la lecture rend quand même les noms anglais', same(read.Name, ['Facture', 'Devis']) && same(read.Token, ['tok1', 'tok2']), Object.keys(read));
  });

  await section('la reprise : hébergé par GFS, le widget ne renomme rien et ne se plaint pas', async () => {
    const doc = legacyDoc();
    doc.failBundles = 1; // si le lot partait quand même, il serait refusé (le courtier de GFS refuse RenameColumn) : il ne doit pas partir
    const warnings = [];
    const { api, schema } = fresh(doc, { migrate: true, globals: { GfsLink: { hosted: true }, console: { warn: (...args) => warnings.push(args), log() {}, error() {} } } });
    const read = await api.fetchTable('Publipostage_Templates');
    check('aucune écriture, aucun lot tenté, aucun avertissement', doc.bundles.length === 0 && doc.failBundles === 1 && warnings.length === 0 && 'Publipostage_Modeles' in doc.tables, JSON.stringify(warnings));
    check('la reprise n\'a rien à dire, le document se lit sous ses noms d\'avant', schema.lastMigration() === null && same(read.Name, ['Facture', 'Devis']), JSON.stringify(schema.lastMigration()));
    doc.failBundles = 0;
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>y</p>' }]]);
    check('et l\'écriture suit les noms du document', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>y</p>' }]), doc.last());
  });

  await section('la reprise : éteinte, le document garde ses noms', async () => {
    const doc = legacyDoc();
    const { api } = fresh(doc, { englishOnDisk: true });
    await api.fetchTable('Publipostage_Templates');
    check('renameDocuments éteint : aucune écriture', doc.bundles.length === 0 && 'Publipostage_Modeles' in doc.tables, doc.bundles.length);
  });

  // Consigne 105 de GFS (25/11) : « plus de renommage en silence ». Le widget tel qu'il est servi n'a AUCUN mode d'essai (`__schemaNames` absent) : un document aux noms d'avant, widget ouvert, ne reçoit
  // aucune action de renommage, ni à la lecture ni à l'écriture, et il se lit et s'écrit sous ses noms ; une table neuve naît pourtant en anglais (englishOnDisk allumé). Échoue sur l'ancien code (renameDocuments
  // allumé quand le mode est absent : un lot RenameTable / RenameColumn partait à la première lecture).
  await section('105 : le widget tel qu\'il est servi ne renomme rien en silence', async () => {
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
    const { api, schema } = fresh(doc, { migrate: true });
    const read = await api.fetchTable('Publipostage_Templates');
    check('rien n\'a changé dans le document (tout ou rien)', 'Publipostage_Modeles' in doc.tables && doc.tables.Publipostage_Modeles.cols.includes('Nom') && doc.bundles.length === 0, Object.keys(doc.tables));
    check('la reprise dit qu\'elle a échoué', schema.lastMigration() && schema.lastMigration().failed === true, JSON.stringify(schema.lastMigration()));
    check('la lecture et l\'écriture suivantes passent sous les noms d\'avant, sans nouvelle tentative', same(read.Name, ['Facture', 'Devis']), JSON.stringify(read));
    await api.applyUserActions([['UpdateRecord', 'Publipostage_Templates', 1, { Content: '<p>z</p>' }]]);
    check('l\'écriture arrive sous les noms du document', same(doc.last(), ['UpdateRecord', 'Publipostage_Modeles', 1, { Contenu: '<p>z</p>' }]) && doc.bundles.length === 1, doc.last());
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
