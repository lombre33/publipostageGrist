#!/usr/bin/env node
// Tests purs (sans navigateur) de la notice du document : la colonne `Notice` de la table des modèles et son écriture, js/templates.js (Templates.saveNotice, le champ `notice` des
// modèles lus, loadAll, settleWritten, snapshotRow / restoreRow) - cf. dev-tests/unit-harness.mjs. Demande d'Antoine du 23/11 : « sur fichier PP (doc, grille ou slide)
// pouvoir ajouter une page d'explication sur le fonctionnement du modèle, une sorte de commentaire qui explique comment se servir du modèle ». La notice vit dans sa PROPRE
// colonne, jamais dans `Content` : c'est ce qui garantit qu'aucun export (PDF, Word, Excel, e-mail, diaporama) ne peut la lire. Ici, sur un faux document qui journalise ses
// écritures, les attendus de la personne qui s'en sert :
//  1) lire ne crée rien : un document sans colonne `Notice` s'ouvre sans une écriture, et ses modèles ont une notice vide ;
//  2) la première notice écrite crée la colonne (une fois) puis n'écrit QUE cette colonne de cette ligne : ni le texte, ni le nom, ni la date de modification (aucun
//     conflit avec l'enregistrement automatique) ;
//  3) la notice écrite vaut tout de suite pour la lecture (cache), et une relecture partie avant l'écriture ne la défait pas ;
//  4) un enregistrement du texte (autosave) qui suit une notice écrite ne l'efface jamais, dans aucun des deux ordres ;
//  5) une notice d'une autre personne apparaît à la relecture suivante ; une notice vidée se lit vide ;
//  6) un modèle d'un type que ce widget ne sait pas ouvrir refuse l'écriture de sa notice (rien n'est écrit) ;
//  7) une écriture qui échoue (droit d'écriture absent) lève, et le cache garde la dernière notice confirmée ;
//  8) supprimer puis rétablir un modèle (snapshotRow / restoreRow) lui rend sa notice ;
//  9) un document aux noms d'avant reçoit la colonne sous le nom `Notice` (js/schema-columns.js la traduit en elle-même : le même id et le même libellé).
// Lancer : node dev-tests/unit-template-notice.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MODELES = {
  Nom: 'Text', Contenu: 'Text', NomFichierPDF: 'Text', DateModif: 'DateTime', HeaderFooter: 'Text', EstParDefaut: 'Bool', Margins: 'Text',
  TypeModele: 'Text', Destinataires: 'Text', Cc: 'Text', Cci: 'Text', Objet: 'Text', PJ: 'Text', SuiviModifications: 'Text', ModifiePar: 'Text',
};

class Doc {
  constructor({ withNotice = false } = {}) {
    this.cols = Object.keys(MODELES).concat(withNotice ? ['Notice'] : []);
    this.rows = [];
    this.nextId = 1;
    this.actions = [];
    this.fetchDelay = 0;
    this.failWrites = null; // (action) => Error | null
  }

  addRow(row) { const full = Object.assign({ id: this.nextId++ }, row); this.rows.push(full); return full.id; }
  row(id) { return this.rows.find((r) => r.id === id); }
  listTables() { return Promise.resolve(['Publipostage_Modeles']); }

  async fetchTable(table) {
    if (table !== 'Publipostage_Modeles') throw new Error('Invalid table ' + table);
    const out = { id: this.rows.map((r) => r.id) };
    this.cols.forEach((c) => { out[c] = this.rows.map((r) => (r[c] === undefined ? null : r[c])); });
    const snapshot = JSON.stringify(out); // le serveur lit à la demande : un changement fait pendant le trajet de la réponse n'y est pas
    if (this.fetchDelay) await sleep(this.fetchDelay);
    return JSON.parse(snapshot);
  }

  async applyUserActions(actions) {
    const retValues = [];
    for (const action of actions) {
      const failure = this.failWrites && this.failWrites(action);
      if (failure) throw failure;
      this.actions.push(action);
      const [type, , a2, a3] = action;
      if (type === 'AddTable') throw new Error('AddTable : le test n\'attend aucune table de plus');
      if (type === 'AddVisibleColumn') {
        if (this.cols.includes(a2)) throw new Error('colonne déjà présente ' + a2);
        this.cols.push(a2);
        retValues.push({ colId: a2 });
      } else if (type === 'AddRecord') {
        const unknown = Object.keys(a3).filter((c) => !this.cols.includes(c));
        if (unknown.length) throw new Error('AddRecord sur une colonne inconnue : ' + unknown.join(','));
        retValues.push(this.addRow(a3));
      } else if (type === 'UpdateRecord') {
        const unknown = Object.keys(a3).filter((c) => !this.cols.includes(c));
        if (unknown.length) throw new Error('UpdateRecord sur une colonne inconnue : ' + unknown.join(','));
        Object.assign(this.row(a2), a3);
        retValues.push(null);
      } else if (type === 'RemoveRecord') {
        this.rows = this.rows.filter((r) => r.id !== a2);
        retValues.push(null);
      } else {
        throw new Error('Doc : action non supportée ' + type);
      }
    }
    return { retValues };
  }

  count(type) { return this.actions.filter((a) => a[0] === type).length; }
  updates() { return this.actions.filter((a) => a[0] === 'UpdateRecord'); }
}

function fresh(doc, extra) {
  const warnings = [];
  const ctx = createContext(Object.assign({
    grist: { docApi: doc, ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; } },
    HtmlSanitize: { clean: (html) => html }, // l'en-tête et le pied d'un modèle passent par le filtre de js/html-sanitize.js : sans importance ici
    console: { log() {}, warn(...a) { warnings.push(a.join(' ')); }, error(...a) { warnings.push(a.join(' ')); } },
  }, extra));
  ['js/schema-columns.js', 'js/grist-api.js', 'js/templates.js'].forEach((s) => loadScript(ctx, s));
  return { ctx, warnings, run: (expr) => evalIn(ctx, expr) };
}

const NOTICE = '<h3>Mode d’emploi</h3><p>Choisissez la ligne puis exportez.</p>';

async function main() {
  // 1. Lire ne crée rien.
  {
    const doc = new Doc();
    doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const { run } = fresh(doc);
    const list = await run('Templates.loadAll()');
    check('loadAll : le modèle a une notice vide', list.length === 1 && list[0].notice === '', JSON.stringify(list.map((t) => t.notice)));
    check('lire un document sans colonne Notice n\'écrit rien : ni colonne, ni ligne', doc.actions.length === 0 && !doc.cols.includes('Notice'), doc.actions.map((a) => a[0]).join());
  }

  // 2. La première notice crée la colonne puis n'écrit qu'elle.
  {
    const doc = new Doc();
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document', DateModif: 1700000000, ModifiePar: 'Zoé' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    const before = JSON.stringify(doc.row(id));
    const out = await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`);
    check('saveNotice rend la notice écrite', out === NOTICE, out);
    check('la colonne Notice est créée, une seule fois', doc.count('AddVisibleColumn') === 1 && doc.cols.includes('Notice'), doc.actions.map((a) => a[0]).join());
    check('une seule UpdateRecord, de la ligne du modèle, avec la colonne Notice seule', doc.updates().length === 1 && doc.updates()[0][2] === id
      && JSON.stringify(Object.keys(doc.updates()[0][3])) === '["Notice"]', JSON.stringify(doc.updates()));
    const after = doc.row(id);
    const same = JSON.parse(before);
    check('le texte, le nom, la date de modification et l\'auteur de la ligne ne bougent pas', after.Contenu === same.Contenu && after.Nom === same.Nom && after.DateModif === same.DateModif && after.ModifiePar === same.ModifiePar);
    check('la notice est dans la table', after.Notice === NOTICE);
    await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE + '<p>Suite.</p>')})`);
    check('une deuxième notice ne recrée pas la colonne : une UpdateRecord de plus', doc.count('AddVisibleColumn') === 1 && doc.updates().length === 2);
    check('aucun AddTable, aucun AddRecord : la notice n\'ajoute aucune table ni aucun modèle', doc.count('AddTable') === 0 && doc.count('AddRecord') === 0);
  }

  // 3. Le cache suit l'écriture tout de suite ; une relecture partie avant ne la défait pas.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    doc.fetchDelay = 40;
    const reading = run('Templates.loadAll()');           // part avant l'écriture : sa réponse ne porte pas la notice
    await sleep(5);
    doc.fetchDelay = 0;
    await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`);
    check('juste après l\'écriture, le cache montre la notice', run(`Templates.byId(${id}).notice`) === NOTICE);
    await reading;
    check('la relecture partie avant l\'écriture ne la défait pas', run(`Templates.byId(${id}).notice`) === NOTICE, run(`Templates.byId(${id}).notice`));
    await run('Templates.loadAll()');
    check('une relecture qui suit lit la notice de Grist', run(`Templates.byId(${id}).notice`) === NOTICE);
  }

  // 4. L'enregistrement du texte ne l'efface jamais.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`);
    await run(`Templates.save(${id}, 'Contrat', '<p>texte changé</p>', '', null, null, 'document', null)`);
    check('l\'enregistrement du texte qui suit laisse la notice dans la table', doc.row(id).Notice === NOTICE && doc.row(id).Contenu === '<p>texte changé</p>', doc.row(id).Notice);
    check('et dans le cache', run(`Templates.byId(${id}).notice`) === NOTICE);
    const writes = doc.updates().filter((a) => a[2] === id && 'Notice' in a[3]);
    check('l\'enregistrement du texte n\'écrit pas la colonne Notice', writes.length === 1, writes.length);
    await run(`Templates.save(${id}, 'Contrat', '<p>texte encore changé</p>', '', null, null, 'document', null)`);
    await run(`Templates.saveNotice(${id}, ${JSON.stringify('<p>Autre.</p>')})`);
    check('l\'ordre inverse (texte, puis notice) : chacun garde le sien', doc.row(id).Notice === '<p>Autre.</p>' && doc.row(id).Contenu === '<p>texte encore changé</p>');
  }

  // 5. Une autre personne écrit ; une notice vidée se lit vide.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    check('au départ : pas de notice', run(`Templates.byId(${id}).notice`) === '');
    doc.row(id).Notice = NOTICE; // une autre personne
    await run('Templates.loadAll()');
    check('la notice d\'une autre personne apparaît à la lecture suivante', run(`Templates.byId(${id}).notice`) === NOTICE);
    await run(`Templates.saveNotice(${id}, '')`);
    check('une notice vidée se lit vide, dans la table comme dans le cache', doc.row(id).Notice === '' && run(`Templates.byId(${id}).notice`) === '');
    await run(`Templates.saveNotice(${id}, 42)`);
    check('autre chose qu\'un texte s\'écrit comme une notice vide', doc.row(id).Notice === '' && run(`Templates.byId(${id}).notice`) === '');
  }

  // 6. Un type que ce widget ne sait pas ouvrir refuse.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Étrange', Contenu: '<p>a</p>', TypeModele: 'inconnu-de-ce-widget' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    let message = '';
    try { await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`); } catch (e) { message = String(e.message || e); }
    check('un modèle d\'un type inconnu refuse l\'écriture de sa notice', message !== '' && doc.updates().length === 0 && !doc.row(id).Notice, message);
  }

  // 7. Une écriture qui échoue lève, le cache garde la dernière notice confirmée.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document', Notice: '<p>Première.</p>' });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    doc.failWrites = () => new Error('Droit d\'écriture absent');
    let message = '';
    try { await run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`); } catch (e) { message = String(e.message || e); }
    check('une écriture refusée par Grist lève', message.includes('Droit d\'écriture absent'), message);
    check('le cache garde la dernière notice confirmée', run(`Templates.byId(${id}).notice`) === '<p>Première.</p>' && doc.row(id).Notice === '<p>Première.</p>');
  }

  // 8. Supprimer puis rétablir un modèle lui rend sa notice.
  {
    const doc = new Doc({ withNotice: true });
    const id = doc.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document', Notice: NOTICE });
    const { run } = fresh(doc);
    await run('Templates.loadAll()');
    const kept = await run(`Templates.snapshotRow(${id})`);
    check('le cliché d\'un modèle porte sa notice', !!kept && kept.values.Notice === NOTICE, JSON.stringify(kept));
    doc.rows = []; // le modèle est supprimé
    await run('Templates.loadAll()');
    check('le modèle supprimé n\'est plus dans le cache', run('Templates.getCached().length') === 0);
    await run(`Templates.restoreRow(${JSON.stringify(kept)})`);
    await run('Templates.loadAll()');
    check('rétabli, le modèle retrouve sa notice dans la table et dans le cache', doc.rows.length === 1 && doc.rows[0].Notice === NOTICE && run('Templates.getCached()[0].notice') === NOTICE, JSON.stringify(doc.rows));
  }

  // 9. Le nom de la colonne ne change pas, noms d'avant ou noms du widget.
  {
    const legacy = new Doc();
    const id = legacy.addRow({ Nom: 'Contrat', Contenu: '<p>a</p>', TypeModele: 'document' });
    const l = fresh(legacy);
    await l.run('Templates.loadAll()');
    await l.run(`Templates.saveNotice(${id}, ${JSON.stringify(NOTICE)})`);
    check('document aux noms d\'avant : la colonne s\'appelle Notice', legacy.cols.includes('Notice') && legacy.row(id).Notice === NOTICE);
    check('la colonne écrite est Notice dans le journal des actions', legacy.actions.some((a) => a[0] === 'AddVisibleColumn' && a[2] === 'Notice') && legacy.updates().every((a) => 'Notice' in a[3]));
  }

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
