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
//  - whereIs : l'endroit réel, avec le libellé que la personne voit.
// Lancer : node dev-tests/unit-schema-columns.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Faux document : des tables (colonnes et lignes), les métadonnées que Grist en tire, un journal des actions et des lectures.
class Doc {
  constructor(tables = {}) {
    this.tables = {};
    Object.keys(tables).forEach((name) => { this.tables[name] = { cols: tables[name].slice(), rows: [] }; });
    this.journal = [];
    this.reads = [];
    this.nextId = 1;
  }

  async listTables() { this.reads.push('listTables'); return Object.keys(this.tables); }

  async fetchTable(name) {
    this.reads.push(name);
    const names = Object.keys(this.tables);
    if (name === '_grist_Tables') return { id: names.map((_, i) => i + 1), tableId: names.slice() };
    if (name === '_grist_Tables_column') {
      const out = { id: [], parentId: [], colId: [] };
      names.forEach((tableName, t) => this.tables[tableName].cols.forEach((col) => { out.id.push(out.id.length + 1); out.parentId.push(t + 1); out.colId.push(col); }));
      return out;
    }
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
      else if (action[0] === 'AddVisibleColumn' || action[0] === 'AddColumn') { if (!table.cols.includes(action[2])) table.cols.push(action[2]); retValues.push({ colId: action[2] }); }
      else if (action[0] === 'AddRecord') { const row = Object.assign({ id: this.nextId++ }, action[3]); table.rows.push(row); retValues.push(row.id); }
      else if (action[0] === 'UpdateRecord') { const row = table.rows.find((r) => r.id === action[2]); if (row) Object.assign(row, action[3]); retValues.push(null); }
      else retValues.push(null);
    }
    return { retValues };
  }

  last() { return this.journal[this.journal.length - 1]; }
  writes() { return this.journal.slice(); }
}

const LEGACY_COLS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'HeaderFooter', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'PJ', 'SuiviModifications', 'Jeton', 'ModifiePar', 'MotDePassePdf'];
const ENGLISH_COLS = ['Name', 'Content', 'PdfFileName', 'ModifiedAt', 'HeaderFooter', 'Margins', 'IsDefault', 'TemplateType', 'To', 'Cc', 'Bcc', 'Subject', 'Attachments', 'TrackedChanges', 'Token', 'ModifiedBy', 'PdfPassword'];

function fresh(doc, { englishOnDisk = false } = {}) {
  const globals = { grist: { docApi: doc } };
  const ctx = createContext(globals);
  loadScript(ctx, 'js/schema-columns.js');
  evalIn(ctx, `SchemaColumns.setEnglishOnDisk(${englishOnDisk})`);
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
    const doc = new Doc({ Missions: ['Nom', 'Contenu'], Publipostage_Commentaires: ['ModeleId', 'Texte'] });
    doc.tables.Missions.rows.push({ id: 1, Nom: 'M1', Contenu: 'c' });
    const { api } = fresh(doc);
    const mission = await api.fetchTable('Missions');
    check('une table de la personne garde ses colonnes, même celles qui s\'appellent Nom ou Contenu', same(Object.keys(mission), ['id', 'Nom', 'Contenu']) && same(mission.Nom, ['M1']), Object.keys(mission));
    await api.applyUserActions([['UpdateRecord', 'Missions', 1, { Nom: 'M2' }], ['AddRecord', 'Publipostage_Commentaires', null, { ModeleId: 4, Texte: 't' }], ['RemoveRecord', 'Missions', 1]]);
    check('ses écritures, les tables du widget pas encore reprises et les autres actions : inchangées', same(doc.writes(), [['UpdateRecord', 'Missions', 1, { Nom: 'M2' }], ['AddRecord', 'Publipostage_Commentaires', null, { ModeleId: 4, Texte: 't' }], ['RemoveRecord', 'Missions', 1]]), doc.writes());
    check('la liste des tables garde les noms des autres tables', same(await api.listTables(), ['Missions', 'Publipostage_Commentaires']), await api.listTables());
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

  await section('la liste est complète et sans doublon', async () => {
    const { schema } = fresh(new Doc());
    const tables = schema.TABLES;
    const ids = tables.flatMap((t) => t.columns.map((c) => c[0]));
    const legacies = tables.flatMap((t) => t.columns.map((c) => c[1]));
    check('un nom anglais par colonne, jamais deux fois le même', new Set(ids).size === ids.length, ids);
    check('un nom d\'avant par colonne, jamais deux fois le même', new Set(legacies).size === legacies.length, legacies);
    check('la table des modèles porte ses 17 colonnes', tables[0].columns.length === 17 && same(ids.slice(0, 17), ENGLISH_COLS) && same(legacies.slice(0, 17), LEGACY_COLS), tables[0].columns.length);
    check('aucun nom anglais ne porte un accent ni une lettre française', ids.every((id) => /^[A-Za-z]+$/.test(id)), ids);
  });
}

await main();
summarizeAndExit();
