// Faux grist.docApi minimal pour tester en Node (sans navigateur) un module qui passe par
// listTables/applyUserActions/fetchTable - cf. dev-tests/unit-harness.mjs pour le contexte général.
// Ne couvre QUE les trois actions utilisées par js/template-preferences.js (AddTable/AddRecord/
// UpdateRecord) - un module qui a besoin d'autre chose doit étendre cette classe, pas la détourner.
export class FakeDocApi {
  constructor(initialTables = []) {
    this.tables = new Set(initialTables);
    this.rows = {};
    initialTables.forEach((t) => { this.rows[t] = []; });
    this.nextId = 1;
    this.addTableCalls = 0;
  }

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
    const retValues = [];
    for (const action of actions) {
      const [type, table] = action;
      if (type === 'AddTable') {
        this.tables.add(table);
        this.rows[table] = this.rows[table] || [];
        this.addTableCalls++;
        retValues.push(null);
      } else if (type === 'AddRecord') {
        const columns = action[3];
        const id = this.nextId++;
        this.rows[table].push(Object.assign({ id }, columns));
        retValues.push(id);
      } else if (type === 'UpdateRecord') {
        const rowId = action[2];
        const patch = action[3];
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
    const rows = this.rows[table] || [];
    const data = { id: [], Utilisateur: [], ModeleId: [], Epingle: [], Dossier: [] };
    rows.forEach((r) => {
      data.id.push(r.id);
      data.Utilisateur.push(r.Utilisateur);
      data.ModeleId.push(r.ModeleId);
      data.Epingle.push(r.Epingle);
      data.Dossier.push(r.Dossier);
    });
    return data;
  }
}
