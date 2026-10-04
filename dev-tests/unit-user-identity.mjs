#!/usr/bin/env node
// Tests purs (sans navigateur) de la lecture de la personne connectée : js/grist-api.js (GristAPI.getCurrentUserEmail et GristAPI.getCurrentUserName, la table interne
// Publipostage_UserProbe et ses formules déclenchées user.Email / user.Name) - cf. dev-tests/unit-harness.mjs pour le contexte général. Demande d'Antoine du 04/10 : une
// puce « Nom de l'utilisateur » sur le modèle de celle de l'email. Ici, sur un faux document qui compte ses actions et qui rejoue ce que fait Grist (formule déclenchée à la
// création d'une ligne, AddColumn sur un id pris qui renomme, AddTable sur un id pris qui renomme) :
//  - le nom se lit de la ligne-sonde de l'email, dans une colonne Name ajoutée une seule fois à la première demande de nom (table-sonde d'avant la puce, ou née sans elle) ;
//  - l'email SEUL ne change jamais le schéma du document : aucune colonne ajoutée tant qu'aucune puce Nom n'est lue ;
//  - plusieurs puces d'un même rendu (Email et Nom ensemble) ne font qu'une lecture : une seule table-sonde même sur un document qui n'en avait pas, une seule colonne Name ;
//  - un nom que Grist ne donne pas ('' : compte sans nom, formule en erreur) est une réponse gardée ; une lecture qui échoue (lecteur Grist, colonne refusée) ne l'est pas et
//    n'abîme pas l'email.
// Lancer : node dev-tests/unit-user-identity.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE = 'Publipostage_UserProbe';

// Faux document : les tables et leurs colonnes (avec la formule déclenchée de chacune), un journal des actions. `user` : ce que valent user.Email et user.Name pour la personne
// qui écrit. `probe` : 'absente' (aucune table-sonde), 'ancienne' (Email seul, comme tout document ouvert avant la puce Nom) ou 'complete' (Email et Name).
class ProbeDoc {
  constructor({ probe = 'ancienne', user = { email: 'ada@exemple.fr', name: 'Ada Lovelace' }, latencyMs = 0 } = {}) {
    this.user = user;
    this.latencyMs = latencyMs;
    this.nextId = 1;
    this.journal = []; // [type, tableId, ...] des actions appliquées, dans l'ordre
    this.tables = { Missions: { cols: { Titre: null }, rows: [] } }; // colId -> formule déclenchée (null : colonne de données)
    if (probe === 'ancienne') this.tables[PROBE] = { cols: { Email: 'user.Email' }, rows: [] };
    if (probe === 'complete') this.tables[PROBE] = { cols: { Email: 'user.Email', Name: 'user.Name' }, rows: [] };
    this.denyAddRecord = false; // un lecteur Grist : l'écriture est refusée
    this.denyAddColumn = false; // une personne sans le droit de modifier la structure
  }

  count(type, table) { return this.journal.filter((a) => a[0] === type && (!table || a[1] === table)).length; }
  probeTables() { return Object.keys(this.tables).filter((t) => t.indexOf(PROBE) === 0); }
  probeColumns() { return this.tables[PROBE] ? Object.keys(this.tables[PROBE].cols) : null; }
  probeRows() { return this.tables[PROBE] ? this.tables[PROBE].rows.length : null; }

  async _latency() { if (this.latencyMs) await sleep(this.latencyMs); }

  async listTables() { await this._latency(); return Object.keys(this.tables); }

  async fetchTable(tableId) {
    await this._latency();
    const t = this.tables[tableId];
    if (!t) throw new Error('Invalid table ' + tableId);
    const out = { id: t.rows.map((r) => r.id), manualSort: t.rows.map((r) => r.id) };
    Object.keys(t.cols).forEach((c) => { out[c] = t.rows.map((r) => (r[c] === undefined ? null : r[c])); });
    return out;
  }

  async applyUserActions(actions) {
    await this._latency();
    const retValues = [];
    for (const action of actions) {
      const [type, tableId] = action;
      this.journal.push(action);
      if (type === 'AddTable') {
        // Comme Grist : un id déjà pris est renommé (Publipostage_UserProbe2) - le signe d'une table créée deux fois.
        let id = tableId; let n = 2;
        while (this.tables[id]) id = tableId + n++;
        const cols = {};
        action[2].forEach((c) => { cols[c.id] = c.formula || null; });
        this.tables[id] = { cols, rows: [] };
        retValues.push({ tableId: id });
      } else if (type === 'AddColumn') {
        if (this.denyAddColumn) throw new Error('[Sandbox] acces refuse : modification de la structure');
        const t = this.tables[tableId];
        // Comme Grist (useractions.py:doAddColumn) : un id déjà pris est renommé (Name2), jamais refusé.
        let id = action[2]; let n = 2;
        while (id in t.cols) id = action[2] + n++;
        t.cols[id] = action[3].formula || null;
        retValues.push({ colRef: this.nextId++, colId: id });
      } else if (type === 'AddRecord') {
        if (this.denyAddRecord) throw new Error('[Sandbox] acces refuse : ecriture');
        const t = this.tables[tableId];
        const row = { id: this.nextId++ };
        // Formules déclenchées : calculées à la création de la ligne, pour les seules colonnes qui existent à cet instant.
        Object.keys(t.cols).forEach((c) => {
          if (t.cols[c] === 'user.Email') row[c] = this.user.email;
          if (t.cols[c] === 'user.Name') row[c] = this.user.name;
        });
        t.rows.push(row);
        retValues.push(row.id);
      } else if (type === 'RemoveRecord') {
        const t = this.tables[tableId];
        t.rows = t.rows.filter((r) => r.id !== action[2]);
        retValues.push(null);
      } else {
        throw new Error('ProbeDoc : action non supportée ' + type);
      }
    }
    return { retValues };
  }
}

// Un contexte par scénario : GristAPI garde un état module-niveau (caches de l'email et du nom, lectures en cours) qui ne doit pas fuiter d'un scénario à l'autre, exactement
// comme un rechargement de page.
function fresh(doc) {
  const ctx = createContext({
    grist: { docApi: doc, ready() {}, onRecord() {}, onOptions() {}, async getOptions() { return null; } },
    console: { log() {}, warn() {}, error() {} },
  });
  loadScript(ctx, 'js/grist-api.js');
  return { run: (expr) => evalIn(ctx, expr) };
}

// Une écriture que le widget n'attend pas (le retrait de la ligne-sonde) se termine en arrière-plan : laisser la main avant de compter.
const flush = () => sleep(15);
const names = (list) => JSON.stringify(list);
// Une exception dans un scénario (l'API qu'on teste n'existe pas sur l'ancien code) est un échec nommé, pas la fin du script : les scénarios suivants tournent quand même.
async function section(label, work) {
  try { await work(); } catch (e) { check(label + ' : aucune exception', false, e && e.message); }
}

async function main() {
  // 1. Document d'avant la puce Nom (table-sonde avec l'email seul) : la première demande de nom ajoute la colonne Name, une fois, puis lit le nom.
  await section('scénario 1', async () => {
    const doc = new ProbeDoc({ probe: 'ancienne' });
    const { run } = fresh(doc);
    const name = await run('GristAPI.getCurrentUserName()');
    await flush();
    check('table-sonde ancienne : le nom de la personne est lu', name === 'Ada Lovelace', name);
    check('table-sonde ancienne : UNE colonne Name ajoutée, avec sa formule déclenchée', doc.count('AddColumn', PROBE) === 1 && names(doc.probeColumns()) === names(['Email', 'Name'])
      && doc.journal.find((a) => a[0] === 'AddColumn')[3].formula === 'user.Name' && doc.journal.find((a) => a[0] === 'AddColumn')[3].recalcWhen === 0, names(doc.probeColumns()));
    check('table-sonde ancienne : aucune table-sonde de plus', names(doc.probeTables()) === names([PROBE]), names(doc.probeTables()));
    check('table-sonde ancienne : aucune ligne ne reste dans la sonde', doc.probeRows() === 0, doc.probeRows());
    const actionsBefore = doc.journal.length;
    check('table-sonde ancienne : une seconde demande de nom est gardée (aucune action)', await run('GristAPI.getCurrentUserName()') === 'Ada Lovelace' && doc.journal.length === actionsBefore);
    // La ligne qui a donné le nom a aussi donné l'email : la puce Email d'après n'a rien à relire.
    check('table-sonde ancienne : l\'email vient de la même ligne, sans nouvelle lecture', await run('GristAPI.getCurrentUserEmail()') === 'ada@exemple.fr' && doc.journal.length === actionsBefore, doc.journal.length - actionsBefore);
  });

  // 2. L'email SEUL ne change jamais le schéma : aucune colonne ajoutée tant qu'aucune puce Nom n'est lue (un document qui n'utilise pas la puce n'est pas touché).
  await section('scénario 2', async () => {
    const doc = new ProbeDoc({ probe: 'ancienne' });
    const { run } = fresh(doc);
    const email = await run('GristAPI.getCurrentUserEmail()');
    await flush();
    check('email seul : l\'adresse est lue', email === 'ada@exemple.fr', email);
    check('email seul : aucune colonne ajoutée à la sonde', doc.count('AddColumn') === 0 && names(doc.probeColumns()) === names(['Email']), names(doc.probeColumns()));
    check('email seul : une seule ligne ajoutée puis retirée', doc.count('AddRecord', PROBE) === 1 && doc.count('RemoveRecord', PROBE) === 1 && doc.probeRows() === 0);
    check('email seul : une seconde demande est gardée', await run('GristAPI.getCurrentUserEmail()') === 'ada@exemple.fr' && doc.count('AddRecord', PROBE) === 1);
  });

  // 3. Table-sonde qui a déjà sa colonne Name : la lecture de l'email voit passer le nom, la puce Nom qui suit n'écrit rien et ne touche pas à la structure.
  await section('scénario 3', async () => {
    const doc = new ProbeDoc({ probe: 'complete' });
    const { run } = fresh(doc);
    await run('GristAPI.getCurrentUserEmail()');
    const before = doc.journal.length;
    const name = await run('GristAPI.getCurrentUserName()');
    check('table-sonde complète : le nom est celui de la ligne de l\'email, sans rien écrire de plus', name === 'Ada Lovelace' && doc.journal.length === before, doc.journal.length - before);
    check('table-sonde complète : aucune colonne ajoutée', doc.count('AddColumn') === 0);
    // Nom demandé en premier : une lecture, aucune migration.
    const second = new ProbeDoc({ probe: 'complete' });
    const again = fresh(second);
    await again.run('GristAPI.getCurrentUserName()');
    await flush();
    check('table-sonde complète : le nom lu en premier tient en une ligne ajoutée, sans AddColumn', second.count('AddRecord', PROBE) === 1 && second.count('AddColumn') === 0, second.count('AddRecord', PROBE));
  });

  // 4. Plusieurs puces d'un même rendu (la Lecture résout ses puces ensemble) : Email et Nom, plusieurs fois chacune, ne font qu'une lecture.
  await section('scénario 4', async () => {
    const doc = new ProbeDoc({ probe: 'ancienne', latencyMs: 5 });
    const { run } = fresh(doc);
    const got = await run('Promise.all([GristAPI.getCurrentUserName(), GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserName(), GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserName()])');
    await flush();
    check('cinq puces ensemble : chacune a sa valeur', names(got) === names(['Ada Lovelace', 'ada@exemple.fr', 'Ada Lovelace', 'ada@exemple.fr', 'Ada Lovelace']), names(got));
    check('cinq puces ensemble : une seule colonne Name (jamais « Name2 »)', doc.count('AddColumn') === 1 && names(doc.probeColumns()) === names(['Email', 'Name']), names(doc.probeColumns()));
    // Une lecture partagée avant la colonne, une après : deux lignes en tout, pas cinq.
    check('cinq puces ensemble : deux lignes de sonde en tout (une avant la colonne, une après), toutes retirées', doc.count('AddRecord', PROBE) === 2 && doc.probeRows() === 0, doc.count('AddRecord', PROBE));
  });

  // 5. Un document SANS table-sonde, plusieurs puces Email d'un même rendu : une seule table (avant, chaque puce créait la sienne : Publipostage_UserProbe2, 3, 4…).
  await section('scénario 5', async () => {
    const doc = new ProbeDoc({ probe: 'absente', latencyMs: 5 });
    const { run } = fresh(doc);
    const got = await run('Promise.all([GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserEmail()])');
    await flush();
    check('sans table-sonde, quatre puces Email ensemble : toutes lisent l\'adresse', got.every((e) => e === 'ada@exemple.fr'), names(got));
    check('sans table-sonde, quatre puces Email ensemble : UNE seule table-sonde créée', doc.count('AddTable') === 1 && names(doc.probeTables()) === names([PROBE]), names(doc.probeTables()));
  });

  // 6. Un document SANS table-sonde, Email et Nom ensemble : une table, une colonne Name, les deux valeurs.
  await section('scénario 6', async () => {
    const doc = new ProbeDoc({ probe: 'absente', latencyMs: 5 });
    const { run } = fresh(doc);
    const got = await run('Promise.all([GristAPI.getCurrentUserEmail(), GristAPI.getCurrentUserName(), GristAPI.getCurrentUserName(), GristAPI.getCurrentUserEmail()])');
    await flush();
    check('sans table-sonde, Email et Nom ensemble : les deux valeurs', names(got) === names(['ada@exemple.fr', 'Ada Lovelace', 'Ada Lovelace', 'ada@exemple.fr']), names(got));
    check('sans table-sonde, Email et Nom ensemble : une table-sonde (Email, Name), jamais de doublon', doc.count('AddTable') === 1 && names(doc.probeTables()) === names([PROBE]) && names(doc.probeColumns()) === names(['Email', 'Name']),
      names(doc.probeTables()) + names(doc.probeColumns()));
  });

  // 7. Un nom que Grist ne donne pas : '' (un compte sans nom : user.Name vaut None ; une formule en erreur ; des espaces seuls) - une réponse gardée, l'email n'en souffre pas.
  await section('scénario 7', async () => {
    for (const [label, given] of [['None', null], ['vide', ''], ['espaces', '   '], ['erreur de formule', ['E', 'AttributeError', 'x']], ['nombre', 7]]) {
      const doc = new ProbeDoc({ probe: 'complete', user: { email: 'ada@exemple.fr', name: given } });
      const { run } = fresh(doc);
      const name = await run('GristAPI.getCurrentUserName()');
      await flush();
      const after = doc.journal.length;
      check('nom ' + label + ' : rendu comme \'\' (la puce écrira « [Nom indisponible] »)', name === '', JSON.stringify(name));
      check('nom ' + label + ' : réponse gardée pour la session (aucune relecture)', await run('GristAPI.getCurrentUserName()') === '' && doc.journal.length === after);
      check('nom ' + label + ' : l\'email se lit toujours', await run('GristAPI.getCurrentUserEmail()') === 'ada@exemple.fr');
    }
  });

  // 8. Le nom est rendu tel que Grist le donne, seuls les espaces autour partent.
  await section('scénario 8', async () => {
    const doc = new ProbeDoc({ probe: 'complete', user: { email: 'jean@exemple.fr', name: '  Jean-Éric de La Fontaine ' } });
    const { run } = fresh(doc);
    check('nom : accents, tirets et particules gardés, espaces autour retirés', await run('GristAPI.getCurrentUserName()') === 'Jean-Éric de La Fontaine');
  });

  // 9. Une personne qui ne peut pas modifier la structure : le nom échoue (pas gardé), l'email, lui, continue de se lire - tant que la sonde existe.
  await section('scénario 9', async () => {
    const doc = new ProbeDoc({ probe: 'ancienne' });
    doc.denyAddColumn = true;
    const { run } = fresh(doc);
    let failed = false;
    try { await run('GristAPI.getCurrentUserName()'); } catch (e) { failed = true; }
    await flush();
    check('structure refusée : le nom ne se lit pas (la puce écrira « [Nom indisponible] »)', failed);
    check('structure refusée : l\'email se lit toujours', await run('GristAPI.getCurrentUserEmail()') === 'ada@exemple.fr');
    check('structure refusée : aucune ligne ne reste dans la sonde', doc.probeRows() === 0, doc.probeRows());
    doc.denyAddColumn = false;
    check('structure refusée : l\'échec n\'est pas gardé, le droit rendu le nom se lit', await run('GristAPI.getCurrentUserName()') === 'Ada Lovelace');
  });

  // 10. Un lecteur Grist (écriture refusée) : ni l'email ni le nom, aucune colonne tentée ; rien n'est gardé, l'écriture permise tout se lit.
  await section('scénario 10', async () => {
    const doc = new ProbeDoc({ probe: 'ancienne' });
    doc.denyAddRecord = true;
    const { run } = fresh(doc);
    const fails = async (expr) => { try { await run(expr); return false; } catch (e) { return true; } };
    check('lecteur : le nom ne se lit pas', await fails('GristAPI.getCurrentUserName()'));
    check('lecteur : l\'email ne se lit pas', await fails('GristAPI.getCurrentUserEmail()'));
    check('lecteur : aucune colonne n\'a été tentée', doc.count('AddColumn') === 0);
    doc.denyAddRecord = false;
    check('lecteur devenu éditeur : le nom puis l\'email se lisent', await run('GristAPI.getCurrentUserName()') === 'Ada Lovelace' && await run('GristAPI.getCurrentUserEmail()') === 'ada@exemple.fr');
  });

  summarizeAndExit();
}

main().catch((e) => { console.error(e); process.exit(1); });
