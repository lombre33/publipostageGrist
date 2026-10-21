#!/usr/bin/env node
// Tests purs (sans navigateur) de la ligne « réglages du document » de la table des modèles : js/templates.js (Templates.getDocumentSettings,
// Templates.updateDocumentSettings, Templates.loadAll) - cf. dev-tests/unit-harness.mjs pour le contexte général. Demande d'Antoine du 08/10 : « une ligne
// couleur du document », puis « plutôt qu'une table dédiée, une table plus macro déjà présente, j'aimerais limiter le nombre de tables créées ». Les couleurs
// du document (js/color-store.js) vivent donc dans une ligne réservée de Publipostage_Modeles (TypeModele = 'reglages', leur JSON dans Contenu). Ici, sur un faux
// document qui journalise ses écritures, les attendus de la personne qui s'en sert :
//  1) aucune table n'est créée, et rien n'est écrit tant qu'on ne change pas un réglage (lire ne crée jamais la ligne) ;
//  2) la ligne n'est jamais un modèle : ni dans la liste, ni dans les noms pris, ni dans la lecture par identifiant - un vrai modèle qui porte le même nom reste un
//     modèle ;
//  3) un changement vaut tout de suite pour les lecteurs, l'écriture suit : une seule ligne créée même sous plusieurs changements de suite, mise à jour ensuite,
//     le dernier état gagne ; les autres clés des réglages sont gardées ;
//  4) une autre personne qui écrit apparaît à la lecture suivante, mais une lecture partie avant une écriture de ce widget ne la défait pas ;
//  5) une écriture qui échoue (droit d'écriture absent, Grist injoignable) rend faux et laisse les lecteurs sur le dernier état confirmé, avec un avertissement ;
//  6) une ligne écrite à la main (JSON illisible, tableau, plusieurs lignes) ne casse rien : première ligne, objet seulement ;
//  7) un document créé avant la colonne TypeModele la reçoit avant la première écriture (jamais un AddRecord sur une colonne inconnue, qui annulerait le lot) ;
//  9) le mot de passe commun des PDF protégés (demande du 12/10, « un mot de passe stocké dans grist pour l'ensemble des pdf ») : une colonne de plus de la même ligne
//     réservée, créée à la première écriture seulement, jamais dans un cache du widget, écrite sans doubler la ligne des réglages dans aucun des deux ordres ;
// 10) un document de la bêta, créé avant la colonne « Modifié par » (historique des versions, 14/10) : l'ouverture l'ajoute - sa seule écriture - et un document à jour n'écrit plus rien
//     (c'est le cas de tous les autres : le faux document porte la colonne).
// Lancer : node dev-tests/unit-document-settings.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const MODELES = {
  Nom: 'Text', Contenu: 'Text', NomFichierPDF: 'Text', DateModif: 'DateTime', HeaderFooter: 'Text', EstParDefaut: 'Bool', Margins: 'Text',
  TypeModele: 'Text', Destinataires: 'Text', Cc: 'Text', Cci: 'Text', Objet: 'Text', SuiviModifications: 'Text', ModifiePar: 'Text',
};

// Faux document : la table des modèles seule (les autres ne servent à rien ici), un journal des actions, des pannes et des lenteurs à la demande.
class Doc {
  constructor({ without = [] } = {}) {
    this.cols = Object.keys(MODELES).filter((c) => !without.includes(c));
    this.rows = [];
    this.nextId = 1;
    this.actions = [];
    this.fetchDelay = 0;
    this.writeDelay = 0;
    this.failWrites = null; // (action) => Error | null
    this.failFetch = false; // la table est illisible
    this.hidden = [];       // des colonnes que les règles d'accès cachent à cette personne : fetchTable ne les rend pas, mais elles existent
  }

  addRow(row) { const full = Object.assign({ id: this.nextId++ }, row); this.rows.push(full); return full.id; }
  settingsRows() { return this.rows.filter((r) => r.TypeModele === 'reglages'); }

  listTables() { return Promise.resolve(['Publipostage_Modeles']); }

  async fetchTable(table) {
    if (table !== 'Publipostage_Modeles') throw new Error('Invalid table ' + table);
    if (this.failFetch) throw new Error('Table illisible');
    const out = { id: this.rows.map((r) => r.id) };
    this.cols.filter((c) => !this.hidden.includes(c)).forEach((c) => { out[c] = this.rows.map((r) => (r[c] === undefined ? null : r[c])); });
    const snapshot = JSON.stringify(out); // le serveur lit à la demande : un changement fait pendant le trajet de la réponse n'y est pas
    if (this.fetchDelay) await sleep(this.fetchDelay);
    return JSON.parse(snapshot);
  }

  async applyUserActions(actions) {
    const retValues = [];
    if (this.writeDelay) await sleep(this.writeDelay);
    for (const action of actions) {
      const failure = this.failWrites && this.failWrites(action);
      if (failure) throw failure;
      this.actions.push(action);
      const [type, table] = action;
      if (type === 'AddTable') throw new Error('AddTable ' + table + ' : le test n\'attend aucune table de plus');
      if (type === 'AddVisibleColumn') {
        if (this.cols.includes(action[2])) throw new Error('colonne déjà présente ' + action[2]);
        this.cols.push(action[2]);
        retValues.push({ colId: action[2] });
      } else if (type === 'AddRecord') {
        const unknown = Object.keys(action[3]).filter((c) => !this.cols.includes(c));
        if (unknown.length) throw new Error('AddRecord sur une colonne inconnue : ' + unknown.join(',')); // un vrai Grist annule tout le lot
        retValues.push(this.addRow(action[3]));
      } else if (type === 'UpdateRecord') {
        const unknown = Object.keys(action[3]).filter((c) => !this.cols.includes(c));
        if (unknown.length) throw new Error('UpdateRecord sur une colonne inconnue : ' + unknown.join(',')); // idem : un vrai Grist annule tout le lot
        Object.assign(this.rows.find((r) => r.id === action[2]), action[3]);
        retValues.push(null);
      } else {
        throw new Error('Doc : action non supportée ' + type);
      }
    }
    return { retValues };
  }

  count(type) { return this.actions.filter((a) => a[0] === type).length; }
}

function fresh(doc) {
  const warnings = [];
  const ctx = createContext({
    grist: { docApi: doc, ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; } },
    console: { log() {}, warn(...a) { warnings.push(a.join(' ')); }, error(...a) { warnings.push(a.join(' ')); } },
  });
  ['js/grist-api.js', 'js/templates.js'].forEach((s) => loadScript(ctx, s));
  return { ctx, warnings, run: (expr) => evalIn(ctx, expr) };
}

function documentWith(rows = []) {
  const doc = new Doc();
  rows.forEach((r) => doc.addRow(r));
  return doc;
}

async function main() {
  // 1. Lire ne crée rien ; la première écriture crée une ligne, jamais une table.
  {
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const { run } = fresh(doc);
    check('avant tout : aucun réglage', sameList(run('Templates.getDocumentSettings()'), {}));
    await run('Templates.loadAll()');
    check('après la lecture des modèles : toujours aucun réglage, rien d\'écrit', sameList(run('Templates.getDocumentSettings()'), {}) && doc.actions.length === 0, doc.actions.length);
    const done = run('Templates.updateDocumentSettings({ colors: ["#1e8449", "#7c3aed"] })');
    check('le changement vaut tout de suite pour les lecteurs, avant que Grist ait répondu', sameList(run('Templates.getDocumentSettings().colors'), ['#1e8449', '#7c3aed']));
    check('la promesse rend vrai quand Grist a écrit', (await done) === true);
    check('aucune table n\'est créée (le faux document refuserait un AddTable)', doc.count('AddTable') === 0);
    const rows = doc.settingsRows();
    check('une ligne réservée est créée : TypeModele = reglages, JSON dans Contenu', rows.length === 1 && rows[0].Nom === 'Réglages du document' && sameList(JSON.parse(rows[0].Contenu), { colors: ['#1e8449', '#7c3aed'] }), JSON.stringify(rows));
    check('un seul AddRecord, rien d\'autre écrit', doc.actions.length === 1 && doc.actions[0][0] === 'AddRecord', doc.actions.map((a) => a[0]));
  }

  // 2. La ligne n'est jamais un modèle.
  {
    const doc = documentWith([
      { Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' },
      { Nom: 'Réglages du document', Contenu: '<p>un vrai modèle du même nom</p>', TypeModele: 'document' },
      { Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#ff0000'] }), TypeModele: 'reglages' },
    ]);
    const settingsId = doc.rows[2].id;
    const { run } = fresh(doc);
    const templates = await run('Templates.loadAll()');
    check('loadAll : la ligne réservée n\'est pas dans la liste des modèles', templates.length === 2 && !templates.some((t) => t.typeModele === 'reglages'), templates.map((t) => t.nom + ':' + t.typeModele));
    check('loadAll : le vrai modèle qui porte le même nom reste un modèle', templates.some((t) => t.nom === 'Réglages du document' && t.contenu === '<p>un vrai modèle du même nom</p>'));
    check('getCached et byId ne rendent pas la ligne réservée', run('Templates.getCached().length') === 2 && run(`Templates.byId(${settingsId})`) === undefined);
    check('les réglages sont lus de la ligne réservée', sameList(run('Templates.getDocumentSettings()'), { colors: ['#ff0000'] }));
    check('le vrai modèle nommé « Réglages du document » garde son nom : le suivant devient « Réglages du document (2) »', run('Templates.uniqueName("Réglages du document")') === 'Réglages du document (2)');
    const doc2 = documentWith([{ Nom: 'Réglages du document', Contenu: '{}', TypeModele: 'reglages' }]);
    const second = fresh(doc2);
    await second.run('Templates.loadAll()');
    check('sans vrai modèle de ce nom, la ligne réservée ne le prend pas', second.run('Templates.uniqueName("Réglages du document")') === 'Réglages du document' && second.run('Templates.getCached().length') === 0);
  }

  // 3. Une écriture, puis des mises à jour de la même ligne ; plusieurs changements de suite font une seule ligne ; le dernier état gagne ; les autres clés restent.
  {
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    doc.writeDelay = 15;
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    const first = run('Templates.updateDocumentSettings({ colors: ["#111111"] })');
    const second = run('Templates.updateDocumentSettings({ colors: ["#222222", "#111111"] })');
    const third = run('Templates.updateDocumentSettings({ colors: ["#333333"], autre: 3 })');
    check('trois changements de suite : les lecteurs voient le dernier tout de suite', sameList(run('Templates.getDocumentSettings()'), { colors: ['#333333'], autre: 3 }));
    const results = await Promise.all([first, second, third]);
    check('les trois promesses rendent vrai', results.every((r) => r === true), results.join());
    check('une seule ligne réservée, jamais deux', doc.settingsRows().length === 1, doc.settingsRows().length);
    check('le dernier état est celui de Grist', sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#333333'], autre: 3 }), doc.settingsRows()[0].Contenu);
    check('un seul AddRecord : les changements suivants mettent la ligne à jour ou ne font rien', doc.count('AddRecord') === 1, doc.actions.map((a) => a[0]).join());
    await run('Templates.updateDocumentSettings({ colors: ["#444444"] })');
    const row = doc.settingsRows()[0];
    check('un changement ultérieur met la même ligne à jour et garde les autres clés', doc.settingsRows().length === 1 && sameList(JSON.parse(row.Contenu), { colors: ['#444444'], autre: 3 }) && doc.count('UpdateRecord') >= 1, row.Contenu);
    await run('Templates.updateDocumentSettings({ colors: null })');
    check('retirer une clé (null) la retire du JSON, les autres restent', sameList(JSON.parse(doc.settingsRows()[0].Contenu), { autre: 3 }) && !('colors' in run('Templates.getDocumentSettings()')));
    const before = doc.actions.length;
    check('un changement qui ne change rien n\'écrit rien et rend vrai', (await run('Templates.updateDocumentSettings({ autre: 3 })')) === true && doc.actions.length === before);
    const copy = run('Templates.getDocumentSettings()');
    copy.autre = 99;
    check('getDocumentSettings rend une copie : la modifier ne change pas les réglages', run('Templates.getDocumentSettings().autre') === 3);
  }

  // 4. Une autre personne écrit ; une lecture partie avant une écriture de ce widget ne la défait pas.
  {
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }, { Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#aaaaaa'] }), TypeModele: 'reglages' }]);
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    check('lus au chargement', sameList(run('Templates.getDocumentSettings().colors'), ['#aaaaaa']));
    doc.settingsRows()[0].Contenu = JSON.stringify({ colors: ['#bbbbbb', '#aaaaaa'] }); // une autre personne
    check('rien ne change tant que la table n\'est pas relue', sameList(run('Templates.getDocumentSettings().colors'), ['#aaaaaa']));
    await run('Templates.loadAll()');
    check('à la lecture suivante, la couleur de l\'autre personne apparaît', sameList(run('Templates.getDocumentSettings().colors'), ['#bbbbbb', '#aaaaaa']));
    // Une lecture lente part, une écriture de ce widget la croise : la lecture montre l'état d'avant, elle n'est pas adoptée.
    doc.fetchDelay = 60;
    const slowRead = run('Templates.loadAll()');
    await sleep(10);
    doc.fetchDelay = 0;
    const write = run('Templates.updateDocumentSettings({ colors: ["#cccccc", "#bbbbbb", "#aaaaaa"] })');
    await Promise.all([slowRead, write]);
    check('une lecture partie avant l\'écriture ne la défait pas', sameList(run('Templates.getDocumentSettings().colors'), ['#cccccc', '#bbbbbb', '#aaaaaa']), JSON.stringify(run('Templates.getDocumentSettings()')));
    await run('Templates.loadAll()');
    check('la lecture suivante (après l\'écriture) rend l\'état écrit', sameList(run('Templates.getDocumentSettings().colors'), ['#cccccc', '#bbbbbb', '#aaaaaa']));
    // Une lecture entière pendant une écriture en vol (Grist lent) : les lecteurs gardent l'état posé.
    doc.writeDelay = 60;
    const slowWrite = run('Templates.updateDocumentSettings({ colors: ["#dddddd"] })');
    await run('Templates.loadAll()');
    check('pendant une écriture en vol, une lecture ne défait pas l\'état posé', sameList(run('Templates.getDocumentSettings().colors'), ['#dddddd']));
    await slowWrite;
    check('l\'écriture finie, l\'état est celui de Grist', sameList(JSON.parse(doc.settingsRows()[0].Contenu).colors, ['#dddddd']) && sameList(run('Templates.getDocumentSettings().colors'), ['#dddddd']));
  }

  // 5. Une écriture qui échoue.
  {
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }, { Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#aaaaaa'] }), TypeModele: 'reglages' }]);
    const { run, warnings } = fresh(doc);
    await run('Templates.loadAll()');
    doc.failWrites = () => new Error('Droit d\'écriture refusé');
    const result = await run('Templates.updateDocumentSettings({ colors: ["#bbbbbb", "#aaaaaa"] })');
    check('écriture refusée : la promesse rend faux', result === false);
    check('les lecteurs retrouvent le dernier état confirmé', sameList(run('Templates.getDocumentSettings().colors'), ['#aaaaaa']));
    check('un avertissement le dit, sans bruit de plus', warnings.length === 1 && /réglages du document non enregistrés/.test(warnings[0]), warnings.join(' | '));
    check('rien n\'est écrit dans la ligne', sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#aaaaaa'] }));
    doc.failWrites = null;
    check('une écriture suivante, Grist revenu, réussit', (await run('Templates.updateDocumentSettings({ colors: ["#cccccc"] })')) === true && sameList(JSON.parse(doc.settingsRows()[0].Contenu).colors, ['#cccccc']));
    // Première écriture refusée (la ligne n'existe pas) : aucune ligne fantôme, retour à vide.
    const empty = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const other = fresh(empty);
    await other.run('Templates.loadAll()');
    empty.failWrites = (a) => (a[0] === 'AddRecord' ? new Error('refusé') : null);
    check('première écriture refusée : faux, réglages vides, aucune ligne', (await other.run('Templates.updateDocumentSettings({ colors: ["#123456"] })')) === false && sameList(other.run('Templates.getDocumentSettings()'), {}) && empty.settingsRows().length === 0);
    empty.failWrites = null;
    check('puis réussie : la ligne est créée une fois', (await other.run('Templates.updateDocumentSettings({ colors: ["#123456"] })')) === true && empty.settingsRows().length === 1);
  }

  // 6. Une ligne écrite à la main.
  {
    for (const [label, content] of [['JSON illisible', '{pas du json'], ['un tableau', '["#ff0000"]'], ['un nombre', '42'], ['vide', ''], ['null', 'null']]) {
      const doc = documentWith([{ Nom: 'Réglages du document', Contenu: content, TypeModele: 'reglages' }]);
      const { run, warnings } = fresh(doc);
      const templates = await run('Templates.loadAll()');
      check(`contenu ${label} : aucun réglage, aucun modèle de plus, aucune erreur`, sameList(run('Templates.getDocumentSettings()'), {}) && templates.length === 0 && warnings.length === 0, warnings.join());
      check(`contenu ${label} : un changement remplace le contenu de la même ligne`, (await run('Templates.updateDocumentSettings({ colors: ["#ff0000"] })')) === true && doc.settingsRows().length === 1 && sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#ff0000'] }));
    }
    const doubled = documentWith([
      { Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#111111'] }), TypeModele: 'reglages' },
      { Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#999999'] }), TypeModele: 'reglages' },
      { Nom: 'Contrat', Contenu: '<p>a</p>' },
    ]);
    const { run } = fresh(doubled);
    const templates = await run('Templates.loadAll()');
    check('deux lignes réservées : aucune n\'est un modèle, la première fait foi', templates.length === 1 && sameList(run('Templates.getDocumentSettings().colors'), ['#111111']));
    await run('Templates.updateDocumentSettings({ colors: ["#222222"] })');
    check('une écriture ne touche que la première', sameList(JSON.parse(doubled.rows[0].Contenu).colors, ['#222222']) && sameList(JSON.parse(doubled.rows[1].Contenu).colors, ['#999999']) && doubled.count('AddRecord') === 0);
  }

  // 7. Un document créé avant la colonne TypeModele : la colonne vient avant la première écriture.
  {
    const doc = new Doc({ without: ['TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet'] });
    doc.addRow({ Nom: 'Ancien modèle', Contenu: '<p>a</p>' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()'); // la migration du mode email ajoute les colonnes
    check('loadAll ajoute TypeModele (migration du mode email) et le modèle reste un modèle document', doc.cols.includes('TypeModele') && run('Templates.getCached()[0].typeModele') === 'document');
    const bare = new Doc({ without: ['TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet'] });
    bare.addRow({ Nom: 'Ancien modèle', Contenu: '<p>a</p>' });
    const direct = fresh(bare);
    check('sans loadAll avant : la première écriture ajoute la colonne puis crée la ligne', (await direct.run('Templates.updateDocumentSettings({ colors: ["#abcdef"] })')) === true && bare.cols.includes('TypeModele') && bare.settingsRows().length === 1, direct.warnings.join());
    const order = bare.actions.map((a) => a[0] + (a[0] === 'AddVisibleColumn' ? ':' + a[2] : ''));
    check('la colonne est ajoutée avant la ligne', order.indexOf('AddVisibleColumn:TypeModele') !== -1 && order.indexOf('AddVisibleColumn:TypeModele') < order.indexOf('AddRecord'), order.join());
  }

  // 9. Le mot de passe commun des PDF protégés : une colonne de plus de la ligne réservée des réglages.
  {
    const COL = 'MotDePassePdf';
    const SECRET = 'stub-token-Sésame ÿ 42';
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const { run, warnings } = fresh(doc);
    await run('Templates.loadAll()');
    const writesBefore = doc.actions.length;
    const first = await run('Templates.readPdfPassword()');
    check('lire sans rien d\'enregistré : lu, vide, et rien n\'est créé (ni colonne, ni ligne)', first.ok === true && first.password === '' && doc.actions.length === writesBefore && !doc.cols.includes(COL) && doc.settingsRows().length === 0, JSON.stringify(first));
    check('la place du mot de passe est dite : table, colonne, libellé et ligne', sameList(run('Templates.PDF_PASSWORD_LOCATION'), { table: 'Publipostage_Modeles', column: COL, label: 'Mot de passe des PDF protégés', row: 'Réglages du document' }));

    check('écrire un mot de passe rend vrai', (await run('Templates.writePdfPassword(' + JSON.stringify(SECRET) + ')')) === true, warnings.join());
    const rows = doc.settingsRows();
    check('une seule ligne réservée, nommée comme les réglages, qui porte le mot de passe dans sa colonne', rows.length === 1 && rows[0].Nom === 'Réglages du document' && rows[0][COL] === SECRET, JSON.stringify(rows));
    const order = doc.actions.slice(writesBefore).map((a) => a[0] + (a[0] === 'AddVisibleColumn' ? ':' + a[2] : ''));
    check('la colonne est créée avant la ligne (jamais un AddRecord sur une colonne inconnue)', order.indexOf('AddVisibleColumn:' + COL) !== -1 && order.indexOf('AddVisibleColumn:' + COL) < order.indexOf('AddRecord'), order.join());
    const added = doc.actions.find((a) => a[0] === 'AddVisibleColumn' && a[2] === COL);
    check('la colonne est de type Texte, sans formule, avec son libellé', added && added[3].type === 'Text' && added[3].isFormula === false && added[3].label === 'Mot de passe des PDF protégés', JSON.stringify(added));
    check('aucune table de plus', doc.count('AddTable') === 0);
    check('relu : le même mot de passe', (await run('Templates.readPdfPassword()')).password === SECRET);

    const templates = await run('Templates.loadAll()');
    check('la ligne n\'est toujours pas un modèle, les réglages du document restent vides', templates.length === 1 && sameList(run('Templates.getDocumentSettings()'), {}));
    const leaks = JSON.stringify(run('Templates.getCached()')) + JSON.stringify(run('Templates.getDocumentSettings()'));
    check('le mot de passe n\'entre dans aucun cache du widget (liste des modèles, réglages du document)', !leaks.includes('Sésame'), leaks);

    // Les réglages du document écrits ensuite vont dans la MÊME ligne : sinon la première (celle du mot de passe) ferait foi et les couleurs seraient perdues.
    check('un réglage du document écrit après (sans relire la table) s\'écrit dans la même ligne', (await run('Templates.updateDocumentSettings({ colors: ["#1e8449"] })')) === true && doc.settingsRows().length === 1 && sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#1e8449'] }) && doc.settingsRows()[0][COL] === SECRET, JSON.stringify(doc.settingsRows()));
    check('et relus ensemble : couleurs et mot de passe', sameList((await run('Templates.loadAll().then(() => Templates.getDocumentSettings())')).colors, ['#1e8449']) && (await run('Templates.readPdfPassword()')).password === SECRET);

    // Un autre mot de passe, le même, puis aucun.
    const countAfter = () => doc.actions.length;
    const mark = countAfter();
    check('un autre mot de passe : mis à jour dans la même ligne, seule cette colonne écrite', (await run('Templates.writePdfPassword("stub-token-autre")')) === true && doc.settingsRows().length === 1 && doc.settingsRows()[0][COL] === 'stub-token-autre' && sameList(doc.actions.slice(mark).map((a) => a[0]), ['UpdateRecord']) && sameList(Object.keys(doc.actions[mark][3]), [COL]), JSON.stringify(doc.actions.slice(mark)));
    const mark2 = countAfter();
    check('le même mot de passe : rien n\'est écrit', (await run('Templates.writePdfPassword("stub-token-autre")')) === true && countAfter() === mark2);
    check('un mot de passe vide le retire', (await run('Templates.writePdfPassword("")')) === true && doc.settingsRows()[0][COL] === '' && (await run('Templates.readPdfPassword()')).password === '');
    check('une valeur qui n\'est pas du texte est écrite comme un mot de passe vide', (await run('Templates.writePdfPassword(null)')) === true && doc.settingsRows()[0][COL] === '');
  }
  {
    // L'autre ordre : le mot de passe d'abord (la ligne n'existe pas encore), puis les réglages - sans relire la table entre les deux.
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    await run('Templates.writePdfPassword("stub-token-un")');
    await run('Templates.updateDocumentSettings({ colors: ["#7c3aed"] })');
    check('mot de passe puis réglages : une seule ligne réservée, les deux y sont', doc.settingsRows().length === 1 && doc.settingsRows()[0].MotDePassePdf === 'stub-token-un' && sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#7c3aed'] }), JSON.stringify(doc.settingsRows()));
    // Réglages d'abord, mot de passe ensuite.
    const other = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const second = fresh(other);
    await second.run('Templates.loadAll()');
    await second.run('Templates.updateDocumentSettings({ colors: ["#7c3aed"] })');
    await second.run('Templates.writePdfPassword("stub-token-deux")');
    check('réglages puis mot de passe : une seule ligne réservée, les deux y sont', other.settingsRows().length === 1 && other.settingsRows()[0].MotDePassePdf === 'stub-token-deux' && sameList(JSON.parse(other.settingsRows()[0].Contenu), { colors: ['#7c3aed'] }) && other.count('AddRecord') === 1, JSON.stringify(other.settingsRows()));
  }
  {
    // La ligne réservée créée par une autre personne depuis le dernier chargement est reprise, jamais doublée.
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    doc.addRow({ Nom: 'Réglages du document', Contenu: JSON.stringify({ colors: ['#111111'] }), TypeModele: 'reglages' });
    check('une ligne réservée apparue depuis le chargement : le mot de passe y est écrit', (await run('Templates.writePdfPassword("stub-token-trois")')) === true && doc.settingsRows().length === 1 && doc.settingsRows()[0].MotDePassePdf === 'stub-token-trois' && doc.count('AddRecord') === 0);
    check('ses réglages sont intacts', sameList(JSON.parse(doc.settingsRows()[0].Contenu), { colors: ['#111111'] }));
    // Deux lignes réservées : la première fait foi, en lecture comme en écriture.
    const doubled = documentWith([
      { Nom: 'Réglages du document', Contenu: '{}', TypeModele: 'reglages' },
      { Nom: 'Réglages du document', Contenu: '{}', TypeModele: 'reglages' },
    ]);
    const twice = fresh(doubled);
    await twice.run('Templates.loadAll()');
    await twice.run('Templates.writePdfPassword("stub-token-premiere")');
    check('deux lignes réservées : seule la première porte le mot de passe, la lecture le suit', doubled.rows[0].MotDePassePdf === 'stub-token-premiere' && !doubled.rows[1].MotDePassePdf && (await twice.run('Templates.readPdfPassword()')).password === 'stub-token-premiere');
  }
  {
    // Plusieurs écritures de suite : le dernier mot de passe gagne, une seule ligne.
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    doc.writeDelay = 15;
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    const all = await Promise.all(['stub-token-a', 'stub-token-b', 'stub-token-c'].map((p) => run('Templates.writePdfPassword("' + p + '")')));
    check('trois écritures de suite : toutes vraies, une ligne, le dernier gagne', all.every((v) => v === true) && doc.settingsRows().length === 1 && doc.settingsRows()[0].MotDePassePdf === 'stub-token-c', JSON.stringify(doc.settingsRows()));
    check('une colonne créée une fois', doc.actions.filter((a) => a[0] === 'AddVisibleColumn' && a[2] === 'MotDePassePdf').length === 1);
  }
  {
    // Les refus : rien n'est écrit, la fenêtre l'apprend par un faux.
    const doc = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const { run, warnings } = fresh(doc);
    await run('Templates.loadAll()');
    doc.failWrites = (a) => (a[0] === 'AddRecord' ? new Error('Droit d\'écriture refusé') : null);
    check('écriture refusée (compte sans droit) : faux, aucune ligne, un avertissement', (await run('Templates.writePdfPassword("stub-token-refus")')) === false && doc.settingsRows().length === 0 && warnings.some((w) => /mot de passe des PDF protégés non enregistré/.test(w)), warnings.join(' | '));
    doc.failWrites = null;
    check('Grist revenu : la suivante réussit', (await run('Templates.writePdfPassword("stub-token-refus")')) === true && doc.settingsRows().length === 1);

    // Une colonne que les règles d'accès cachent : la lecture rend vide (rien à voir), l'écriture échoue sans rien casser.
    const hiddenDoc = documentWith([{ Nom: 'Réglages du document', Contenu: '{}', TypeModele: 'reglages' }]);
    hiddenDoc.cols.push('MotDePassePdf');
    hiddenDoc.rows[0].MotDePassePdf = 'stub-token-cache';
    hiddenDoc.hidden = ['MotDePassePdf'];
    const hidden = fresh(hiddenDoc);
    await hidden.run('Templates.loadAll()');
    const seen = await hidden.run('Templates.readPdfPassword()');
    check('colonne cachée par une règle d\'accès : lue sans erreur, vide', seen.ok === true && seen.password === '', JSON.stringify(seen));
    check('colonne cachée : l\'écriture est refusée (faux), le mot de passe en place n\'est pas touché', (await hidden.run('Templates.writePdfPassword("stub-token-autre")')) === false && hiddenDoc.rows[0].MotDePassePdf === 'stub-token-cache');

    // Table illisible : lire le dit (ok faux), et n'invente pas un mot de passe vide.
    const broken = documentWith([{ Nom: 'Contrat', Contenu: '<p>a</p>' }]);
    const unreadable = fresh(broken);
    broken.failFetch = true;
    const lost = await unreadable.run('Templates.readPdfPassword()');
    check('table illisible : ok faux, mot de passe vide', lost.ok === false && lost.password === '');
    check('table illisible : l\'écriture rend faux', (await unreadable.run('Templates.writePdfPassword("stub-token-x")')) === false);
  }

  // 8. Document sans table des modèles (neuf) : lire ne crée rien ; la table des modèles vient de ses propres chemins, jamais une table des réglages.
  {
    const doc = documentWith([]);
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    check('document sans modèle : aucun réglage, aucune écriture, aucun modèle', sameList(run('Templates.getDocumentSettings()'), {}) && doc.actions.length === 0 && run('Templates.getCached().length') === 0);
  }

  // 10. Un document de la bêta, créé avant la colonne « Modifié par » (historique des versions) : à sa première ouverture avec cette version, loadAll ajoute la colonne - sa seule écriture. Un document à jour
  // n'écrit rien : le faux document de tous les cas ci-dessus porte la colonne, et ils attendent « rien d'écrit » à la lecture.
  {
    const COL = 'ModifiePar';
    const doc = new Doc({ without: [COL] });
    doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>' });
    const { run, warnings } = fresh(doc);
    const templates = await run('Templates.loadAll()');
    check('document d\'avant « Modifié par » : l\'ouverture n\'écrit que l\'ajout de la colonne (AddVisibleColumn, Texte, sans formule, son libellé), rien d\'autre',
      doc.actions.length === 1 && sameList(doc.actions[0], ['AddVisibleColumn', 'Publipostage_Modeles', COL, { type: 'Text', isFormula: false, label: 'Modifié par' }]), JSON.stringify(doc.actions));
    check('le modèle reste un modèle : ni ligne ni table de plus, aucun réglage', templates.length === 1 && doc.count('AddRecord') === 0 && doc.count('AddTable') === 0 && sameList(run('Templates.getDocumentSettings()'), {}));
    const reopened = fresh(doc);
    await reopened.run('Templates.loadAll()');
    check('rouvert, la colonne est là : plus rien n\'est écrit', doc.cols.includes(COL) && doc.actions.length === 1, JSON.stringify(doc.actions));
    check('aucun avertissement ni erreur, ni à la première ouverture ni à la suivante', warnings.length === 0 && reopened.warnings.length === 0, warnings.concat(reopened.warnings).join());
  }

  summarizeAndExit();
}

main();
