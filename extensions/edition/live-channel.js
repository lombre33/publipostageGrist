// Le canal de l'écriture en direct : lire et écrire la table du direct (Publipostage_Direct) dans Grist, et la relire à un rythme réglé. C'est le seul fichier de l'écriture en direct qui parle à
// Grist ; le moteur (extensions/edition/live-sync.js) ne voit que `read` et `write`.
// Grist ne prévient un widget que des changements de la table de SA section ; la table du direct est une autre table, aucun événement ne l'annonce (contrats de GFS, 5.5). Le canal la relit donc
// par `fetchTable`, à ce rythme :
//  - toutes les 250 ms tant qu'une autre personne est présente et que la page est visible ;
//  - toutes les 2 s quand on est seul ;
//  - jamais plus vite que toutes les 100 ms (d'un début de lecture au suivant) ;
//  - plus du tout quand la page est cachée, ni quand GFS dit que l'app n'est plus l'app active (GFS_INACTIF) : `poke()` reprend (page de nouveau visible, geste de la personne).
// Quand la section est liée à la table du direct elle-même, rien n'est relu : Grist prévient par `onRecords` et le canal ne fait aucun `fetchTable`.
// Le rappel de `connect(rappel)` reçoit toujours la liste COMPLÈTE des lignes, qu'elle vienne d'une relecture ou d'une prévenance.
const LiveChannel = (function () {
  const TABLE_NAME = 'Publipostage_Direct';
  const FAST_MS = 250;
  const SLOW_MS = 2000;
  const FLOOR_MS = 100;
  const RETRY_MS = [1000, 2000, 4000, 8000];   // après une lecture en échec : de plus en plus lent, jusqu'à 8 s
  const INACTIVE = 'GFS_INACTIF';

  // Les colonnes de la table du direct, lues au moment de servir : les fichiers de l'extension arrivent dans le désordre, le moteur peut ne pas être là au chargement de celui-ci.
  const columnIds = () => LiveSync.COLUMNS.map(column => column.id);
  const text = value => (value == null ? '' : String(value));

  // Une ligne telle que le moteur la lit : { id, Doc, Client, Kind, Seq, Data, T }.
  function normalize(row) {
    return {
      id: row.id,
      Doc: text(row.Doc),
      Client: text(row.Client),
      Kind: text(row.Kind),
      Seq: Number(row.Seq) || 0,
      Data: typeof row.Data === 'string' ? row.Data : '',
      T: Number(row.T) || 0,
    };
  }

  // Le résultat colonnaire de fetchTable ({ id: [...], Doc: [...], ... }) en lignes.
  function fromColumns(table) {
    const ids = (table && table.id) || [];
    const rows = new Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
      const row = { id: ids[i] };
      for (const name of columnIds()) row[name] = table[name] ? table[name][i] : undefined;
      rows[i] = normalize(row);
    }
    return rows;
  }

  const columnsOf = (objects, names) => Object.fromEntries(names.map(name => [name, objects.map(object => object[name])]));
  const isInactive = err => !!err && (err.code === INACTIVE || String(err.message || err).indexOf(INACTIVE) !== -1);

  // options : grist (docApi.fetchTable / fetchSelectedTable / applyUserActions, onRecords), tableId, sectionTable() (la table de la section du widget, '' si inconnue), isVisible(), hasPeers()
  // (une autre personne est là : relecture rapide), timers ({ setTimeout, clearTimeout }), now(), onError(err), onInactive().
  function create(options) {
    const grist = options.grist;
    const tableId = options.tableId || TABLE_NAME;
    const timers = options.timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
    const now = options.now || (() => Date.now());
    const isVisible = options.isVisible || (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const hasPeers = options.hasPeers || (() => false);
    const sectionTable = options.sectionTable || (() => '');
    const onError = options.onError || (() => {});
    const onInactive = options.onInactive || (() => {});
    const floor = options.floorMs === undefined ? FLOOR_MS : options.floorMs;   // les essais du moteur le mettent à 0 pour ne pas attendre ; en vrai, jamais sous 100 ms

    // La table du direct est celle de la section : Grist prévient (onRecords), rien à relire.
    const pushed = () => !!tableId && sectionTable() === tableId && typeof grist.onRecords === 'function';
    const sleep = ms => new Promise(resolve => timers.setTimeout(resolve, ms));

    let listener = null;
    let connected = false;
    let timer = null;
    let reading = false;
    let paused = false;          // page cachée ou app inactive : rien ne part tant que poke() ne reprend pas
    let failures = 0;
    let lastStart = -Infinity;
    let chain = Promise.resolve();
    let subscribed = false;

    // La lecture brute : { rows, missing } (missing : les colonnes de la table du direct qui manquent dans ce que Grist rend).
    async function fetchRaw() {
      if (pushed()) {
        const rows = await grist.docApi.fetchSelectedTable({ includeColumns: 'normal', format: 'rows', keepEncoded: false });
        return { rows: rows.map(normalize), missing: rows.length ? columnIds().filter(name => !(name in rows[0])) : [] };
      }
      const table = await grist.docApi.fetchTable(tableId);
      return { rows: fromColumns(table), missing: columnIds().filter(name => !(name in table)) };
    }

    // Une lecture à la fois, et jamais deux débuts de lecture à moins de FLOOR_MS l'un de l'autre.
    function readRaw() {
      const job = chain.then(async () => {
        const gap = now() - lastStart;
        if (gap < floor) await sleep(floor - gap);
        lastStart = now();
        return fetchRaw();
      });
      chain = job.catch(() => {});
      return job;
    }
    const read = () => readRaw().then(result => result.rows);

    // Ajoute à la table du direct les colonnes qui lui manquent (une table que quelqu'un a abîmée) : on n'écrit jamais dans une colonne absente, Grist annulerait tout le lot.
    async function prepare() {
      const { missing } = await readRaw();
      if (!missing.length) return false;
      const columns = LiveSync.COLUMNS.filter(column => missing.includes(column.id));
      await grist.docApi.applyUserActions(columns.map(column => ['AddColumn', tableId, column.id, { type: column.type, isFormula: false }]));
      return true;
    }

    // Ajoute (adds), revendique (claims : crée la ligne seulement si aucune ne correspond, sans toucher à celle qui existe), met à jour ou crée par clé (upserts) et supprime par numéro de
    // ligne (removes), en UN lot : Grist l'applique en entier ou pas du tout. Les suppressions passent en premier : celles d'un ancien salon libèrent la place de la revendication.
    async function write({ adds = [], claims = [], upserts = [], removes = [] }) {
      const actions = [];
      if (removes.length) actions.push(['BulkRemoveRecord', tableId, removes]);
      if (adds.length) actions.push(['BulkAddRecord', tableId, adds.map(() => null), columnsOf(adds, columnIds())]);
      const keyed = (entry, option) => ['BulkAddOrUpdateRecord', tableId, columnsOf([entry.require], Object.keys(entry.require)), columnsOf([entry.fields], Object.keys(entry.fields)), option];
      claims.forEach(claim => actions.push(keyed(claim, { update: false })));
      upserts.forEach(upsert => actions.push(keyed(upsert, {})));
      if (!actions.length) return;
      await grist.docApi.applyUserActions(actions);
    }

    function schedule(wait) {
      if (!connected || timer || reading) return;
      timer = timers.setTimeout(tick, Math.max(0, wait));
    }

    // Le délai avant la prochaine lecture : la période (250 ms ou 2 s) compte d'un début de lecture au suivant ; après un échec, plus lent encore.
    function nextWait() {
      const period = hasPeers() ? FAST_MS : SLOW_MS;
      const backoff = failures ? RETRY_MS[Math.min(failures, RETRY_MS.length) - 1] : 0;
      return Math.max(lastStart + period - now(), backoff);
    }

    function tick() {
      timer = null;
      if (!connected) return;
      if (!isVisible()) { paused = true; return; }
      reading = true;
      read().then((rows) => {
        failures = 0;
        if (connected && listener) listener(rows);
      }, (err) => {
        if (isInactive(err)) { paused = true; onInactive(err); return; }
        failures++;
        onError(err);
      }).then(() => {
        reading = false;
        if (connected && !paused) schedule(nextWait());
      });
    }

    // Commence à relire (ou à écouter) ; `callback` reçoit la liste complète des lignes à chaque lecture.
    function connect(callback) {
      listener = callback;
      connected = true;
      paused = false;
      failures = 0;
      if (pushed()) {
        if (!subscribed) {
          subscribed = true;
          // onRecords n'a pas de désabonnement : le rappel s'efface quand le canal est déconnecté.
          grist.onRecords(rows => { if (connected && listener) listener(rows.map(normalize)); }, { includeColumns: 'normal' });
        }
        // Un changement arrivé entre la dernière lecture du moteur et l'abonnement ne serait annoncé qu'au suivant.
        read().then(rows => { if (connected && listener) listener(rows); }, err => onError(err));
        return;
      }
      schedule(0);
    }

    function disconnect() {
      connected = false;
      listener = null;
      timers.clearTimeout(timer);
      timer = null;
    }

    // Reprend la lecture après une pause (page de nouveau visible, geste de la personne) : tout de suite, sans dépasser le rythme minimal.
    function poke() {
      if (!connected || pushed()) return;
      if (!isVisible()) { paused = true; return; }
      paused = false;
      if (timer || reading) return;
      schedule(0);
    }

    return { read, prepare, write, connect, disconnect, poke, isPushed: pushed };
  }

  return { TABLE_NAME, FAST_MS, SLOW_MS, FLOOR_MS, RETRY_MS, create, normalize, fromColumns, isInactive };
})();
