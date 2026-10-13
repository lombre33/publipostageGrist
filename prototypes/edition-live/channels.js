// Les deux « tables » que le moteur (live.js) sait lire et écrire. Même interface :
//   connect(rappel)  rappel(lignes) reçoit la liste COMPLÈTE des lignes, une première fois puis à chaque changement
//   init()           vérifie la table ; rend { table, missing } (missing : colonnes à ajouter)
//   setup(missing)   ajoute les colonnes manquantes (Grist seulement)
//   refresh()        relit la table et appelle le rappel
//   write({ adds, upserts, removes })  ajoute des lignes, met à jour ou crée par clé, supprime par numéro de ligne
// Une ligne : { id, Doc, Client, Kind, Seq, Data, T } (voir live.js).

import { COLUMNS } from './live.js?v=1';

const IDS = COLUMNS.map(c => c.id);

function normalize(r) {
  return {
    id: r.id,
    Doc: r.Doc == null ? '' : String(r.Doc),
    Client: r.Client == null ? '' : String(r.Client),
    Kind: r.Kind == null ? '' : String(r.Kind),
    Seq: Number(r.Seq) || 0,
    Data: typeof r.Data === 'string' ? r.Data : '',
    T: Number(r.T) || 0,
  };
}

const columnsOf = (objects, ids) => Object.fromEntries(ids.map(id => [id, objects.map(o => o[id])]));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- Grist : la table à laquelle le widget est lié --------------------------------------------------------------------
// Le widget n'est prévenu que des changements de SA table (lue dans le code de Grist : TableNotifier, WidgetFrame.ts),
// et à chaque prévenance grist.onRecords relit TOUTE la table (fetchSelectedTable) : le canal se garde donc petit.
export function gristChannel(grist) {
  let tableId = null;
  let listener = () => {};
  const fetchRows = async () => (await grist.docApi.fetchSelectedTable({ includeColumns: 'normal', format: 'rows', keepEncoded: false })).map(normalize);
  return {
    kind: 'grist',
    connect(callback) {
      listener = callback;
      grist.onRecords(rows => callback(rows.map(normalize)), { includeColumns: 'normal' });
      grist.ready({ requiredAccess: 'full' });
    },
    async init() {
      const lost = new Promise((resolve, reject) => setTimeout(() => reject(new Error('no-table')), 6000));
      tableId = await Promise.race([grist.getSelectedTableId(), lost]);
      const columns = await grist.docApi.fetchSelectedTable({ includeColumns: 'normal' });
      return { table: tableId, missing: IDS.filter(id => !(id in columns)) };
    },
    async setup(missing) {
      const actions = COLUMNS.filter(c => missing.includes(c.id)).map(c => ['AddColumn', tableId, c.id, { type: c.type, isFormula: false }]);
      await grist.docApi.applyUserActions(actions);
      listener(await fetchRows());
    },
    async refresh() { listener(await fetchRows()); },
    async write({ adds = [], upserts = [], removes = [] }) {
      const actions = [];
      if (adds.length) actions.push(['BulkAddRecord', tableId, adds.map(() => null), columnsOf(adds, IDS)]);
      for (const u of upserts) {
        const names = Object.keys(u.fields);
        actions.push(['BulkAddOrUpdateRecord', tableId, columnsOf([u.require], Object.keys(u.require)), columnsOf([u.fields], names), {}]);
      }
      if (removes.length) actions.push(['BulkRemoveRecord', tableId, removes]);
      await grist.docApi.applyUserActions(actions);
    },
  };
}

// --- Démonstration locale : une table dans IndexedDB, partagée entre les onglets de ce navigateur -------------------------
// Mêmes règles que Grist : lignes numérotées, un lot d'actions réussit en entier ou pas du tout (une transaction), liste
// complète à chaque changement, suppression d'une ligne absente refusée. (Le localStorage ne convient pas : deux onglets qui
// écrivent ensemble s'écrasent.) `delay` ajoute un temps d'attente à chaque écriture et à chaque notification, pour sentir
// un réseau lent.
export function localChannel({ name = 'live-lab', delay = 0 } = {}) {
  let listener = () => {};
  let opening = null;
  const bus = typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null;
  const db = () => opening || (opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('rows', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  const finished = tx => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
  const dump = async () => {
    const tx = (await db()).transaction('rows');
    const request = tx.objectStore('rows').getAll();
    await finished(tx);
    return request.result;
  };
  const notify = async () => {
    if (delay) await wait(delay);
    listener((await dump()).map(normalize));
  };
  return {
    kind: 'local',
    dump,
    connect(callback) {
      listener = callback;
      if (bus) bus.onmessage = notify;
      setTimeout(notify, 0);
    },
    async init() { return { table: 'IndexedDB', missing: [] }; },
    async setup() {},
    async refresh() { await notify(); },
    async write({ adds = [], upserts = [], removes = [] }) {
      if (delay) await wait(delay);
      const tx = (await db()).transaction('rows', 'readwrite');
      const store = tx.objectStore('rows');
      const all = store.getAll();
      let failure = null;
      all.onsuccess = () => {
        try {
          const rows = all.result;
          for (const a of adds) store.add({ ...a });
          for (const u of upserts) {
            const row = rows.find(r => Object.entries(u.require).every(([k, v]) => r[k] === v));
            if (row) store.put({ ...row, ...u.fields }); else store.add({ ...u.require, ...u.fields });
          }
          for (const id of removes) {
            if (!rows.some(r => r.id === id)) throw new Error('non-existent record #' + id);
            store.delete(id);
          }
        } catch (err) { failure = err; tx.abort(); }
      };
      try { await finished(tx); } catch (err) { throw failure || err; }
      if (bus) bus.postMessage('changed');
      notify();
    },
  };
}
