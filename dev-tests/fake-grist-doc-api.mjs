// Faux grist.docApi minimal pour tester en Node (sans navigateur) un module qui passe par
// listTables/applyUserActions/fetchTable - cf. dev-tests/unit-harness.mjs pour le contexte général.
// Ne couvre QUE les actions utilisées par js/template-preferences.js (AddTable/AddRecord/UpdateRecord/AddVisibleColumn) -
// un module qui a besoin d'autre chose doit étendre cette classe, pas la détourner.
// Options : withReplie=false simule un document créé avant la colonne Replie (dossier replié par défaut) ; latencyMs simule
// l'aller-retour Grist (sans lui, deux appels concurrents ne se chevauchent jamais) ; failNext=true fait échouer le prochain AddRecord.
export class FakeDocApi {
  constructor(initialTables = [], { withReplie = true, latencyMs = 0 } = {}) {
    this.tables = new Set(initialTables);
    this.rows = {};
    initialTables.forEach((t) => { this.rows[t] = []; });
    this.nextId = 1;
    this.addTableCalls = 0;
    this.hasReplie = withReplie;
    this.latencyMs = latencyMs;
    this.failNext = false;
    this.journal = []; // [type, ...] dans l'ordre des actions appliquées
    this.addedColumns = []; // colId réellement créés par AddVisibleColumn ("Replie2" = le signe d'un double ajout, cf. dev-tests/grist-stub.js)
  }

  async _latency() { if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs)); }

  // Permet de préremplir des lignes AVANT le premier appel du module testé (ex. scénario
  // multi-utilisateurs) sans passer par applyUserActions.
  seedRows(table, rows) {
    this.tables.add(table);
    this.rows[table] = (this.rows[table] || []).concat(rows.map((r) => {
      const id = this.nextId++;
      return Object.assign({ id }, r);
    }));
  }

  async listTables() { return Array.from(this.tables); }

  async applyUserActions(actions) {
    await this._latency();
    const retValues = [];
    for (const action of actions) {
      const [type, table] = action;
      this.journal.push(type);
      if (type === 'AddTable') {
        this.tables.add(table);
        this.rows[table] = this.rows[table] || [];
        this.addTableCalls++;
        retValues.push(null);
      } else if (type === 'AddVisibleColumn') {
        const requested = action[2];
        const colId = (requested === 'Replie' && this.hasReplie) ? 'Replie2' : requested;
        if (requested === 'Replie') this.hasReplie = true;
        this.addedColumns.push(colId);
        retValues.push({ colId });
      } else if (type === 'AddRecord') {
        if (this.failNext) { this.failNext = false; throw new Error('écriture refusée (test)'); }
        const columns = action[3];
        if (columns.Replie !== undefined && !this.hasReplie) throw new Error('KeyError : colonne inconnue ' + table + '.Replie');
        const id = this.nextId++;
        this.rows[table].push(Object.assign({ id }, columns));
        retValues.push(id);
      } else if (type === 'UpdateRecord') {
        const rowId = action[2];
        const patch = action[3];
        if (patch.Replie !== undefined && !this.hasReplie) throw new Error('KeyError : colonne inconnue ' + table + '.Replie');
        const row = (this.rows[table] || []).find((r) => r.id === rowId);
        Object.assign(row, patch);
        retValues.push(null);
      } else {
        throw new Error('FakeDocApi : action non supportée ' + type);
      }
    }
    return { retValues };
  }

  async fetchTable(table) {
    await this._latency();
    const rows = this.rows[table] || [];
    const data = { id: [], Utilisateur: [], ModeleId: [], Epingle: [], Dossier: [] };
    if (this.hasReplie) data.Replie = [];
    rows.forEach((r) => {
      if (this.hasReplie) data.Replie.push(r.Replie === undefined ? false : r.Replie);
      data.id.push(r.id);
      data.Utilisateur.push(r.Utilisateur);
      data.ModeleId.push(r.ModeleId);
      data.Epingle.push(r.Epingle);
      data.Dossier.push(r.Dossier);
    });
    return data;
  }
}
