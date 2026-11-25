// Le faux document des essais de lecture (dev-tests/unit-startup-reads.mjs, dev-tests/unit-templates-light.mjs) : des tables à colonnes ordonnées, les métadonnées que Grist en tire, un journal des appels.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Faux document : des tables à colonnes ordonnées, les métadonnées que Grist en tire (_grist_Tables, _grist_Tables_column, avec manualSort et parentPos), un journal
// des appels. `depth` d'un appel = 1 + la plus grande profondeur des appels TERMINÉS quand il part : deux appels lancés ensemble ont la même profondeur, un appel
// lancé à la réponse d'un autre en a une de plus - la longueur de la chaîne d'aller-retour que l'ouverture attend.
export class StartupDoc {
  constructor({ latencyMs = 0 } = {}) {
    this.latencyMs = latencyMs;
    this.tables = {};
    this.nextId = 1;
    this.completedDepth = 0;
    this.resetLog();
    this.actions = [];
  }

  resetLog() {
    this.log = [];
    this.maxDepth = 0;
    this.completedDepth = 0;
  }

  // cols : { colId: type } dans l'ordre de création ; `pos` (facultatif) : { colId: parentPos } pour une position différente de l'ordre de création.
  addTable(id, cols, rows = [], pos = {}) {
    const names = ['manualSort'].concat(Object.keys(cols));
    this.tables[id] = { names, types: Object.assign({ manualSort: 'ManualSortPos' }, cols), pos: Object.assign({ manualSort: 0 }, pos), rows: [], metaHidden: [] };
    rows.forEach((row) => this.addRow(id, row));
  }

  addRow(id, row) {
    const t = this.tables[id];
    const full = Object.assign({ id: this.nextId++, manualSort: this.nextId }, row);
    t.rows.push(full);
    return full.id;
  }

  readsOf(table) { return this.log.filter((c) => c.name === 'fetchTable' && c.arg === table).length; }
  userTableReads(userTables) { return this.log.filter((c) => c.name === 'fetchTable' && userTables.includes(c.arg)).length; }

  async _call(name, arg, run) {
    const depth = this.completedDepth + 1;
    this.maxDepth = Math.max(this.maxDepth, depth);
    this.log.push({ name, arg, depth });
    const result = run(); // le serveur lit (ou écrit) à la demande : un changement fait pendant le trajet de la réponse n'y est pas
    if (this.latencyMs) await sleep(this.latencyMs);
    this.completedDepth = Math.max(this.completedDepth, depth);
    return result;
  }

  listTables() {
    return this._call('listTables', '', () => Object.keys(this.tables));
  }

  fetchTable(table) {
    return this._call('fetchTable', table, () => {
      if (table === '_grist_Tables') {
        const ids = Object.keys(this.tables);
        return { id: ids.map((_, i) => i + 1), tableId: ids.slice(), primaryViewId: ids.map(() => 0) };
      }
      if (table === '_grist_Tables_column') {
        const out = { id: [], parentId: [], colId: [], type: [], widgetOptions: [], displayCol: [], visibleCol: [], parentPos: [] };
        let rowId = 1;
        Object.keys(this.tables).forEach((id, tIdx) => {
          const t = this.tables[id];
          t.names.forEach((colId, i) => {
            if (t.metaHidden.includes(colId)) return; // une colonne de la table que les métadonnées ne montrent pas (accès restreint)
            out.id.push(rowId++); out.parentId.push(tIdx + 1); out.colId.push(colId); out.type.push(t.types[colId]);
            out.widgetOptions.push(''); out.displayCol.push(0); out.visibleCol.push(0);
            out.parentPos.push(t.pos[colId] !== undefined ? t.pos[colId] : i + 1);
          });
        });
        return out;
      }
      const t = this.tables[table];
      if (!t) throw new Error('Invalid table ' + table);
      const out = { id: t.rows.map((r) => r.id) };
      t.names.forEach((colId) => { out[colId] = t.rows.map((r) => (r[colId] === undefined ? null : r[colId])); });
      return out;
    });
  }

  applyUserActions(actions) {
    return this._call('applyUserActions', actions.map((a) => a[0] + ':' + a[1] + (a[0] === 'AddVisibleColumn' ? ':' + a[2] : '')).join(','), () => {
      const retValues = [];
      for (const action of actions) {
        this.actions.push(action);
        const [type, table] = action;
        if (type === 'AddTable') {
          const cols = {};
          action[2].forEach((c) => { cols[c.id] = c.type; });
          this.addTable(table, cols);
          retValues.push(null);
        } else if (type === 'AddVisibleColumn') {
          const t = this.tables[table];
          if (t.names.includes(action[2])) throw new Error('colonne déjà présente ' + table + '.' + action[2] + ' (un vrai Grist la renommerait)');
          t.names.push(action[2]);
          t.types[action[2]] = action[3].type;
          retValues.push({ colId: action[2] });
        } else if (type === 'AddRecord') {
          retValues.push(this.addRow(table, action[3]));
        } else if (type === 'UpdateRecord') {
          Object.assign(this.tables[table].rows.find((r) => r.id === action[2]), action[3]);
          retValues.push(null);
        } else if (type === 'RemoveRecord') {
          this.tables[table].rows = this.tables[table].rows.filter((r) => r.id !== action[2]);
          retValues.push(null);
        } else {
          throw new Error('StartupDoc : action non supportée ' + type);
        }
      }
      return { retValues };
    });
  }
}
