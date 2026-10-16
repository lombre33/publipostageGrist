// Une fausse table du direct (Publipostage_Direct) qui se comporte comme celle d'un vrai Grist pour les cinq actions que l'écriture en direct utilise : BulkAddRecord,
// BulkAddOrUpdateRecord, BulkRemoveRecord, AddColumn, AddTable. Partagée par les essais Node du moteur (unit-live-sync.mjs) et par les essais à deux pages (verify-live-*.mjs, qui la
// branchent derrière `grist.docApi` de chaque page). Ce qu'elle reproduit de Grist, mesuré dans un vrai Grist le 13/10 (labo-grist-reel, grist-static 0.1.6) :
//  - un lot d'actions réussit EN ENTIER ou pas du tout (une action qui échoue annule les précédentes) ;
//  - supprimer une ligne absente refuse tout le lot ; écrire une colonne inconnue aussi ;
//  - BulkAddOrUpdateRecord cherche par `require` ; trouvée, la ligne est mise à jour (sauf `update: false` : intacte) ; absente, elle est créée (sauf `add: false`) ;
//  - le numéro d'une nouvelle ligne est le plus grand numéro existant + 1 : un numéro supprimé peut être RENDU (le pire cas, pour que les essais le rencontrent) ;
//  - fetchTable rend la table en colonnes ({ id: [...], Doc: [...] }).
// Options : latencyMs (aller-retour simulé, par `clock.setTimeout` si une fausse horloge est donnée), clock ({ now, setTimeout }), columns (les colonnes de départ).
// Observations : fetchLog (l'heure de chaque lecture), writeLog (chaque lot reçu), failNext (le prochain lot échoue avec ce message), inactive (tout appel échoue avec GFS_INACTIF).
export const LIVE_COLUMNS = ['Doc', 'Client', 'Kind', 'Seq', 'Data', 'T'];

export class LiveTable {
  constructor({ latencyMs = 0, clock = null, columns = LIVE_COLUMNS } = {}) {
    this.clock = clock;
    this.latencyMs = latencyMs;
    this.columns = columns.slice();
    this.exists = true;
    this.rows = [];
    this.fetchLog = [];
    this.writeLog = [];
    this.failNext = null;
    this.inactive = false;
    this.listeners = new Set();   // appelés après chaque lot appliqué (la prévenance de Grist pour la table d'une section)
  }

  now() { return this.clock ? this.clock.now() : Date.now(); }

  _latency() {
    if (!this.latencyMs) return Promise.resolve();
    return new Promise(resolve => (this.clock ? this.clock.setTimeout(resolve, this.latencyMs) : setTimeout(resolve, this.latencyMs)));
  }

  _guard() {
    if (this.inactive) { const err = new Error('GFS_INACTIF : appel d\'un sous-cadre qui n\'est pas l\'app active'); err.code = 'GFS_INACTIF'; throw err; }
  }

  async listTables() { this._guard(); return this.exists ? ['Publipostage_Direct'] : []; }

  // La table en colonnes, comme fetchTable.
  async fetchTable() {
    this._guard();
    this.fetchLog.push(this.now());
    await this._latency();
    return this.columnar();
  }

  columnar() {
    const out = { id: this.rows.map(row => row.id) };
    this.columns.forEach((column) => { out[column] = this.rows.map(row => (column in row ? row[column] : null)); });
    return out;
  }

  // La table en lignes (GristView.fetchSelectedTable, format 'rows') : une seule colonne `id` plus les colonnes.
  async fetchSelectedTable() {
    this._guard();
    this.fetchLog.push(this.now());
    await this._latency();
    return this.rows.map(row => Object.assign({}, row));
  }

  _nextId(rows) { return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1; }

  // Le lot, appliqué à une copie : rien ne change si une action échoue.
  async applyUserActions(actions) {
    this._guard();
    this.writeLog.push({ at: this.now(), actions: JSON.parse(JSON.stringify(actions)) });
    await this._latency();
    this._guard();
    if (this.failNext) { const message = this.failNext; this.failNext = null; throw new Error(message); }
    const rows = this.rows.map(row => Object.assign({}, row));
    const columns = this.columns.slice();
    const need = names => names.forEach((name) => { if (!columns.includes(name)) throw new Error('KeyError : colonne inconnue Publipostage_Direct.' + name); });
    const retValues = [];
    for (const action of actions) {
      const [type] = action;
      if (type === 'AddTable') { this.exists = true; retValues.push(null); continue; }
      if (type === 'AddColumn') { if (!columns.includes(action[2])) columns.push(action[2]); rows.forEach((row) => { row[action[2]] = null; }); retValues.push(null); continue; }
      if (type === 'BulkAddRecord') {
        const values = action[3] || {};
        need(Object.keys(values));
        const count = (action[2] || []).length;
        const ids = [];
        for (let i = 0; i < count; i++) {
          const row = { id: this._nextId(rows) };
          columns.forEach((column) => { row[column] = column in values ? values[column][i] : null; });
          rows.push(row);
          ids.push(row.id);
        }
        retValues.push(ids);
        continue;
      }
      if (type === 'BulkRemoveRecord') {
        for (const id of action[2] || []) {
          const at = rows.findIndex(row => row.id === id);
          if (at === -1) throw new Error('Error : la ligne ' + id + ' n\'existe pas');
          rows.splice(at, 1);
        }
        retValues.push(null);
        continue;
      }
      if (type === 'BulkAddOrUpdateRecord') {
        const require = action[2] || {};
        const values = action[3] || {};
        const options = Object.assign({ add: true, update: true, on_many: 'first', allow_empty_require: false }, action[4] || {});
        need(Object.keys(require).concat(Object.keys(values)));
        const count = (Object.values(require)[0] || []).length;
        for (let i = 0; i < count; i++) {
          const match = rows.find(row => Object.keys(require).every(column => row[column] === require[column][i]));
          if (match) {
            if (options.update) Object.keys(values).forEach((column) => { match[column] = values[column][i]; });
          } else if (options.add) {
            const row = { id: this._nextId(rows) };
            columns.forEach((column) => { row[column] = null; });
            Object.keys(require).forEach((column) => { row[column] = require[column][i]; });
            Object.keys(values).forEach((column) => { row[column] = values[column][i]; });
            rows.push(row);
          }
        }
        retValues.push(null);
        continue;
      }
      throw new Error('LiveTable : action non gérée ' + type);
    }
    this.rows = rows;
    this.columns = columns;
    this.listeners.forEach((fn) => { try { fn(); } catch (err) { /* un écouteur en échec ne défait pas le lot */ } });
    return { retValues };
  }

  // Les lignes d'un salon (colonne Doc), pour les assertions.
  of(doc, kind) { return this.rows.filter(row => row.Doc === String(doc) && (!kind || row.Kind === kind)); }
}
