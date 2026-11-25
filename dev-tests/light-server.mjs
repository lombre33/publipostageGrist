// UN FAUX SERVEUR DE LECTURE LÉGÈRE (consigne 103 de GFS) : ce que Grist répond à `GET …/sql?q=…` et à `GET …/tables/<table>/records?filter=…`, avec un vrai moteur SQL (node:sqlite, comme le SQLite de Grist : mêmes
// `length(CAST(x AS BLOB))`, `instr`, `iif`) sur les tables d'un faux document. js/grist-api.js (lightQuery, lightRecords) l'appelle comme il appelle Grist ; les essais le branchent soit sur `fetch` d'un contexte
// Node (dev-tests/unit-templates-light.mjs), soit sur une route de Playwright (`http://grist.test/**`, cf. dev-tests/verify-templates-light-open.mjs). Il ne garde rien : chaque demande relit les tables du faux document
// (un essai qui y écrit entre deux demandes est vu à la suivante, comme un autre acteur qui écrit dans Grist).
//   createLightServer(readTables, { token })  -> { handle(url), log, state }
//     readTables() -> { tableId: { types: { colId: type }, rows: [{ id, colId: valeur, ... }] } } (ou une promesse de cela : l'état du faux Grist d'une page se lit dans la page)
//     handle(url)  -> { status, body, noCors } (body : le texte JSON de la réponse ; `noCors` vrai : la réponse n'a PAS d'en-tête CORS, comme celle du pare-feu de la DINUM : le navigateur dit « réseau » et le code d'état ne se lit pas)
//     log          -> toutes les demandes reçues : { kind: 'sql' | 'records', sql | table + ids, status, at }
//     state        -> { refuse: code HTTP rendu à TOUTES les demandes (403 : règles d'accès), refuseSql, refuseRecords, failWeights: les requêtes qui pèsent (length(CAST…)) sont interrompues comme le fait Grist au-delà d'une seconde,
//                      delayMs: temps de réponse, delayRecordsMs: temps de réponse des seules lectures par numéros (REST), en plus, auth: le jeton attendu }
//   firewallRefuses(texte)                    -> vrai quand un pare-feu comme celui de la DINUM refuserait cette demande (`state.firewall`, vrai par défaut : le faux serveur la refuse, en 403 sans en-tête CORS ; `state.refuseSql = 'firewall'`
//                                                refuse tout SQL de cette façon)
//   tablesFromStartupDoc(doc)                 -> readTables d'un StartupDoc (dev-tests/unit-startup-reads.mjs)
//   tablesFromStubState({ rows, columns })    -> readTables d'une copie de stub.state (dev-tests/grist-stub.js : tables en colonnes)
import { DatabaseSync } from 'node:sqlite';

const quote = name => '"' + String(name).replace(/"/g, '""') + '"';
const HIDDEN = column => column === 'manualSort' || /^gristHelper_/.test(column);

// Ce que le pare-feu devant le Grist de la DINUM (Incapsula) refuse : en 403, sans en-tête CORS, toute demande dont l'adresse ou le corps contient `case when`, `or 1=1` ou `drop table` (faits vérifiés 136 de GFS) ; relevé chez le
// porteur le 25/11 (faits vérifiés 173 et 174), un `substr(…) <> …` et des sous-requêtes côte à côte. On refuse ici plus large que lui, chaque mot seul (`case`, `when`, `union`, `drop`…), `;`, `--`, `<>`, `substr(` et toute
// sous-requête entre parenthèses : une lecture légère qui passe ce faux pare-feu ne risque rien de ce que l'on sait du vrai.
export const FIREWALL = /\bcase\b|\bwhen\b|\bunion\b|\bdrop\b|\binsert\b|\bdelete\b|\bupdate\b|;|--|<>|\bsubstr\w*\s*\(|\(\s*select\b|\b1\s*=\s*1\b/i;
const decoded = (text) => { try { return decodeURIComponent(String(text)); } catch (e) { return String(text); } };
export const firewallRefuses = text => FIREWALL.test(decoded(text));
const FIREWALL_PAGE = '<html><head><META NAME="robots" CONTENT="noindex,nofollow"></head><body>Request unsuccessful. Incapsula incident ID: 0-0</body></html>';

// Ce que Grist range dans SQLite pour une valeur de ce type : un texte vide plutôt que NULL, 0/1 pour un booléen, des secondes pour une date, du JSON pour une liste.
function stored(type, value) {
  const kind = String(type || 'Text');
  if (value === undefined || value === null) return kind === 'Text' || kind === 'Any' ? '' : (kind === 'Bool' ? 0 : (/^(Int|Numeric|Id|Ref|ManualSortPos)/.test(kind) ? 0 : null));
  if (kind === 'Bool') return value ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}
// Ce que l'interface REST rend : un booléen pour une colonne Bool, le reste tel quel.
function served(type, value) {
  if (String(type || 'Text') === 'Bool') return !!value;
  return value;
}

function buildDatabase(tables) {
  const db = new DatabaseSync(':memory:');
  Object.keys(tables).forEach((tableId) => {
    const { types, rows } = tables[tableId];
    const columns = Object.keys(types);
    db.exec('CREATE TABLE ' + quote(tableId) + ' (id INTEGER PRIMARY KEY' + columns.map(column => ', ' + quote(column)).join('') + ')');
    const insert = db.prepare('INSERT INTO ' + quote(tableId) + ' (id' + columns.map(column => ', ' + quote(column)).join('') + ') VALUES (?' + columns.map(() => ', ?').join('') + ')');
    rows.forEach((row) => { insert.run(row.id, ...columns.map(column => stored(types[column], row[column]))); });
  });
  return db;
}

export function createLightServer(readTables, options = {}) {
  const log = [];
  const state = { refuse: null, refuseSql: null, refuseRecords: null, failWeights: false, firewall: true, delayMs: 0, delayRecordsMs: 0, auth: options.token || 'stub-token' };
  const reply = (status, body, noCors) => Object.assign({ status, body: typeof body === 'string' ? body : JSON.stringify(body) }, noCors ? { noCors: true } : {});

  async function handle(rawUrl) {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/^.*\/api\/docs\/[^/]+/, '');
    if (state.delayMs) await new Promise(resolve => setTimeout(resolve, state.delayMs));
    const entry = { at: Date.now(), path, status: 200 };
    log.push(entry);
    const answer = (status, body, noCors) => { entry.status = status; return reply(status, body, noCors); };
    // Le pare-feu est devant Grist : il juge l'adresse avant le jeton et avant le SQL.
    if (state.firewall && firewallRefuses(rawUrl)) {
      entry.kind = path === '/sql' ? 'sql' : 'firewall';
      entry.firewall = true;
      if (path === '/sql') entry.sql = url.searchParams.get('q') || '';
      return answer(403, FIREWALL_PAGE, true);
    }
    if (url.searchParams.get('auth') !== state.auth) { entry.kind = 'auth'; return answer(401, { error: 'jeton refusé' }); }
    const tables = await readTables();
    if (path === '/sql') {
      entry.kind = 'sql';
      const sql = url.searchParams.get('q') || '';
      entry.sql = sql;
      if (state.refuseSql === 'firewall') return answer(403, FIREWALL_PAGE, true);
      if (state.refuse || state.refuseSql) return answer(state.refuse || state.refuseSql, { error: 'accès refusé' });
      if (state.failWeights && /CAST\(/.test(sql)) return answer(500, { error: 'interrupted' });
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) return answer(400, { error: 'seules les lectures sont permises' });
      try {
        const db = buildDatabase(tables);
        const records = db.prepare(sql).all().map(row => ({ fields: Object.assign({}, row) }));
        db.close();
        return answer(200, { statement: sql, records });
      } catch (error) {
        return answer(400, { error: String(error && error.message || error) });
      }
    }
    const records = path.match(/^\/tables\/([^/]+)\/records$/);
    if (records) {
      entry.kind = 'records';
      if (state.delayRecordsMs) await new Promise(resolve => setTimeout(resolve, state.delayRecordsMs));
      entry.table = decodeURIComponent(records[1]);
      const filter = url.searchParams.has('filter') ? JSON.parse(url.searchParams.get('filter')) : {};
      entry.ids = Array.isArray(filter.id) ? filter.id.slice() : null;
      if (state.refuse || state.refuseRecords) return answer(state.refuse || state.refuseRecords, { error: 'accès refusé' });
      const table = tables[entry.table];
      if (!table) return answer(404, { error: 'table inconnue' });
      const found = table.rows.filter(row => Object.keys(filter).every(key => (key === 'id' ? filter.id : filter[key]).some(wanted => (key === 'id' ? row.id : row[key]) === wanted)));
      return answer(200, {
        records: found.map(row => ({
          id: row.id,
          // Une case que le faux Grist laisse vide (null : la ligne a été posée sans cette colonne) reste vide : un essai qui rend une ligne (Annuler d'une suppression) la compare telle que le faux Grist la tient.
          fields: Object.keys(table.types).filter(column => !HIDDEN(column)).reduce((fields, column) => { fields[column] = row[column] === undefined || row[column] === null ? null : served(table.types[column], stored(table.types[column], row[column])); return fields; }, {}),
        })),
      });
    }
    entry.kind = 'other';
    return answer(404, { error: 'adresse inconnue' });
  }
  return { handle, log, state };
}

export function tablesFromStartupDoc(doc) {
  const out = {};
  Object.keys(doc.tables).forEach((tableId) => {
    const table = doc.tables[tableId];
    out[tableId] = { types: Object.assign({}, table.types), rows: table.rows.map(row => Object.assign({}, row)) };
  });
  return out;
}

// `rows` (state.rows) : { tableId: { id: [...], colId: [...] } } ; `columns` (state.columns) : { tableId: { colId: type } } quand le faux Grist la connaît, sinon le type se déduit des valeurs.
export function tablesFromStubState({ rows, columns }) {
  const out = {};
  Object.keys(rows || {}).forEach((tableId) => {
    const data = rows[tableId];
    if (!data || !Array.isArray(data.id)) return;
    const names = Object.keys(data).filter(column => column !== 'id' && Array.isArray(data[column]));
    const types = {};
    names.forEach((column) => {
      const declared = columns && columns[tableId] && columns[tableId][column];
      const sample = data[column].find(value => value !== null && value !== undefined);
      types[column] = declared || (typeof sample === 'boolean' ? 'Bool' : (typeof sample === 'number' ? 'Numeric' : 'Text'));
    });
    out[tableId] = { types, rows: data.id.map((id, at) => names.reduce((row, column) => { row[column] = data[column][at]; return row; }, { id })) };
  });
  return out;
}
