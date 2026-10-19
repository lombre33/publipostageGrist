// Le moteur de l'écriture en direct : un document Yjs (le texte du modèle) et son « awareness » (nom, couleur, curseur de chacun) échangés par les lignes d'UNE table du document, la
// table du direct (Publipostage_Direct). Ni serveur ni socket à nous : Grist garde la donnée, sous ses droits. Ce fichier ne sait rien de l'éditeur ni de Grist : la table lui arrive par un
// canal (extensions/edition/live-channel.js : read, write) et Yjs par la bibliothèque que GFS apporte (le fichier « edition-live » ; ici ses deux espaces de noms, `Y` et `protocol`).
// Une ligne de la table, six colonnes (COLUMNS). Le « salon » d'un modèle est l'ensemble de ses lignes (colonne Doc = le numéro du modèle) :
//  - Kind « s » : l'instantané du salon, l'état complet du document. UNE ligne par salon ; sa colonne T (l'heure où le salon a été fondé) est la « lignée » : un salon refondé a une autre
//    lignée, ce qui permet à une personne revenue d'un long sommeil de ne pas republier un état périmé par-dessus. Elle est posée par la personne qui fonde le salon (revendication
//    atomique : une seule gagne) puis reprise telle quelle, avec la même lignée, par chaque compaction.
//  - Kind « u » : une mise à jour Yjs en base64 (un paquet de frappes). Ajoutée, jamais modifiée. Clé de la ligne : « Client#Seq » (jamais le numéro de ligne, que Grist peut rendre après
//    une suppression).
//  - Kind « p » : la présence d'une personne (nom, couleur, curseur). UNE ligne par personne, modifiée sur place (BulkAddOrUpdateRecord).
//  - Kind « d » : « enregistré » : UNE ligne par salon, la date que le modèle a reçue dans Grist au dernier enregistrement et l'état du document à cet instant (de quoi dire aux autres que
//    ce qu'ils voient est enregistré).
//  - T : l'heure de la première frappe du paquet (« u »), du dernier renouvellement (« p »), de la fondation (« s ») ou de l'enregistrement (« d »).
// Une mise à jour reçue deux fois ou dans le désordre ne change rien (propriété de Yjs) : le moteur n'a donc aucun accusé de réception, seulement « ce que je n'ai pas encore vu ».
// La présence se juge sur ce que Yjs observe (une personne dont la ligne ne change plus depuis 30 s est partie), jamais sur l'heure écrite dans la ligne : deux horloges peuvent différer.
const LiveSync = (function () {
  const COLUMNS = [
    { id: 'Doc', type: 'Text' },
    { id: 'Client', type: 'Text' },
    { id: 'Kind', type: 'Text' },
    { id: 'Seq', type: 'Int' },
    { id: 'Data', type: 'Text' },
    { id: 'T', type: 'Numeric' },
  ];

  const REMOTE = { origin: 'table' };   // origine des changements venus de la table : ils ne repartent jamais
  const PRESENCE_MIN_GAP = 400;         // au plus une écriture de curseur toutes les 0,4 s
  const PRESENCE_ROW_TTL = 120000;      // une ligne de présence de plus de 2 min est supprimée à la compaction
  // Un salon dont plus rien n'a bougé depuis ce temps est tenu pour abandonné (un onglet fermé sans prévenir) : le suivant le refonde. Large exprès : une page cachée ralentit ses minuteries
  // à une par minute, et deux horloges peuvent différer de quelques minutes ; refonder un salon vivant ferait perdre l'état à tout le monde.
  const ABANDONED_MS = 600000;
  const OPEN_ATTEMPTS = 4;
  const RING = 50;                      // nombre de mesures gardées
  const NAME_MAX = 60;

  function toB64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }
  function fromB64(text) {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  const keep = (ring, value) => { ring.push(value); if (ring.length > RING) ring.shift(); };
  const median = values => { if (!values.length) return 0; const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
  const wait = (ms, timers) => new Promise(resolve => timers.setTimeout(resolve, ms));
  const rowKey = row => row.Client + '#' + row.Seq;
  // Ce que le nom et la couleur d'une autre personne doivent être avant d'arriver à l'écran : elle les a écrits, rien ne les garantit.
  const cleanName = value => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NAME_MAX);
  const cleanColor = value => (/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#6b6b6b');

  class Session {
    // options : Y, protocol (les espaces de noms « yjs » et « y-protocols/awareness »), channel ({ read, write }), doc (le numéro du modèle), field (le fragment du document), flushMs,
    // compactAt, now, timers ({ setTimeout, clearTimeout }), random, onEvent(type, detail).
    constructor(options) {
      const { Y, protocol, channel, doc } = options;
      this.Y = Y;
      this.protocol = protocol;
      this.channel = channel;
      this.doc = String(doc);
      this.field = options.field || 'default';
      this.flushMs = options.flushMs || 150;
      this.compactAt = options.compactAt || 60;
      this.now = options.now || (() => Date.now());
      this.timers = options.timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };
      this.random = options.random || Math.random;
      this.onEvent = options.onEvent || (() => {});
      this.ydoc = new Y.Doc();
      this.awareness = new protocol.Awareness(this.ydoc);
      this.me = String(this.ydoc.clientID);
      this.active = false;          // le direct est allumé : ce qui se tape part, ce qui arrive s'applique
      this.opened = false;
      this.role = '';
      this.lineage = 0;             // la lignée du salon rejoint (colonne T de son instantané)
      this.replaced = false;        // le salon a disparu ou a été refondé : plus rien ne part
      this.synced = false;          // la première liste de lignes de ce direct est prise en compte
      this.startedAt = 0;
      this.pending = [];            // mises à jour locales pas encore écrites
      this.pendingSince = 0;
      this.seq = 0;
      this.pseq = 0;
      this.presenceDirty = false;
      this.presenceAt = 0;
      this.applied = new Set();     // clés « Client#Seq » des lignes « s » et « u » déjà prises en compte
      this.rowIds = new Map();      // clé -> numéro de ligne : ce que la compaction peut supprimer (« u » et l'instantané)
      this.presenceRows = new Map();// numéro de ligne -> T, pour nettoyer les présences abandonnées
      this.presenceClients = new Set();
      this.seenSaved = '';
      this.lastRows = [];           // dernière liste complète reçue
      this.inFlight = false;
      this.timer = null;
      this.compacting = false;
      this.compactTimer = null;
      this.checkTimer = null;
      this.needsCheck = false;
      this.failures = 0;
      this.stats = { received: [], writes: [], reads: 0, rows: 0, bytes: 0 };
      this._onDocUpdate = (update, origin) => {
        if (origin === REMOTE || !this.active) return;
        this._queue(update);
      };
      this._onAwareness = ({ added, updated, removed }, origin) => {
        if (origin === REMOTE) return;
        if (![...added, ...updated, ...removed].includes(this.ydoc.clientID)) return;
        this.presenceDirty = true;
        this._schedule();
      };
      this.ydoc.on('update', this._onDocUpdate);
      this.awareness.on('update', this._onAwareness);
    }

    // Les lignes du salon de ce modèle.
    _mine(rows) { return rows.filter(row => row.Doc === this.doc); }

    // Nom et couleur de cette personne, montrés aux autres.
    setUser(user) { this.awareness.setLocalStateField('user', { name: cleanName(user && user.name) || '?', color: cleanColor(user && user.color) }); }

    // Trouve le salon du modèle, ou le fonde. `fill(doc)` écrit le texte de l'éditeur dans le document de passage `doc` qu'on lui donne : il n'est appelé que pour fonder, jamais pour
    // rejoindre. `confirmJoin()` est appelé (et attendu) quand un salon vivant existe : faux, et rien n'est rejoint (`open` rend null). `joinOnly` : rejoindre seulement - sans salon
    // vivant rien n'est fondé et `open` rend null (l'entrée automatique de js/live-entry.js : la personne n'a rien demandé, elle ne fonde pas un salon à la place d'une autre).
    // Rend 'founder', 'joiner' ou null.
    async open({ fill, confirmJoin, joinOnly = false }) {
      const { Y } = this;
      let rows = await this.channel.read();
      for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt++) {
        const mine = this._mine(rows);
        const snapshot = mine.find(row => row.Kind === 's');
        const now = this.now();
        const lastSign = mine.reduce((latest, row) => (row.Kind === 'p' || row.Kind === 'u' ? Math.max(latest, row.T) : latest), snapshot ? snapshot.T : 0);
        if (snapshot && now - lastSign <= ABANDONED_MS) {
          if (confirmJoin && !(await confirmJoin())) return null;
          this._adopt(rows);
          return this._finishOpen('joiner');
        }
        if (joinOnly) return null;
        // Pas de salon, ou un salon abandonné : on le fonde. L'instantané est REVENDIQUÉ (créé seulement si aucun n'existe) : si deux personnes fondent ensemble, Grist n'en garde qu'un, et
        // l'autre rejoint celui-là. Les lignes de l'ancien salon partent dans le même lot, avant la revendication.
        // Le document de passage a son propre numéro de client : s'il prenait le nôtre, Yjs croirait qu'une autre personne l'utilise en l'appliquant, et nous en donnerait un autre.
        const draft = new Y.Doc();
        fill(draft);
        const state = Y.encodeStateAsUpdate(draft);
        const lineage = now;
        const mySeq = ++this.seq;
        try {
          await this.channel.write({
            removes: mine.map(row => row.id),
            claims: [{ require: { Doc: this.doc, Kind: 's' }, fields: { Client: this.me, Seq: mySeq, Data: toB64(state), T: lineage } }],
          });
        } catch (err) {
          // Quelqu'un a nettoyé les mêmes lignes avant nous : Grist refuse tout le lot. On relit et on recommence.
          draft.destroy();
          rows = await this.channel.read();
          await wait(this.random() * 150, this.timers);
          continue;
        }
        rows = await this.channel.read();
        const winner = this._mine(rows).find(row => row.Kind === 's');
        if (!winner) { draft.destroy(); continue; }
        if (winner.Client === this.me && winner.Seq === mySeq) {
          Y.applyUpdate(this.ydoc, state, REMOTE);
          this.applied.add(rowKey(winner));
          this.lineage = winner.T;
          draft.destroy();
          this._noteRows(rows);
          return this._finishOpen('founder');
        }
        draft.destroy();
        this._adopt(rows);
        return this._finishOpen('joiner');
      }
      throw new Error('salon introuvable');
    }

    // Rejoint le salon : l'instantané et les mises à jour qu'il porte sont appliqués au document (encore vide).
    _adopt(rows) {
      const snapshot = this._mine(rows).find(row => row.Kind === 's');
      this.lineage = snapshot.T;
      this._applyRows(rows);
      this._noteRows(rows);
    }

    _finishOpen(role) {
      this.opened = true;
      this.role = role;
      return role;
    }

    _noteRows(rows) {
      this.lastRows = rows;
      const mine = this._mine(rows);
      this.stats.rows = mine.length;
      this.stats.bytes = mine.reduce((total, row) => total + row.Data.length, 0);
      const ids = new Map();
      mine.forEach(row => { if (row.Kind === 'u' || row.Kind === 's') ids.set(rowKey(row), row.id); });
      this.rowIds = ids;
      const presence = new Map();
      mine.forEach(row => { if (row.Kind === 'p') presence.set(row.id, row.T); });
      this.presenceRows = presence;
    }

    // Allume le direct : ce qui se tape part, ce que la table porte s'applique.
    start() {
      if (this.active || !this.opened) return;
      this.active = true;
      this.synced = false;
      this.startedAt = this.now();
      this.presenceDirty = true;
      this._integrate(this.lastRows);
      this._schedule(0);
    }

    // Éteint le direct : écrit ce qui reste, dit aux autres qu'on part ; la dernière personne à partir vide le salon.
    async stop() {
      if (!this.active) return;
      await this.flushNow();
      this.active = false;
      this.timers.clearTimeout(this.timer);
      this.timer = null;
      this.awareness.setLocalState(null);
      try { await this.channel.write({ upserts: [this._presenceUpsert()] }); } catch (err) { this._emit('error', err); }
      // Reste-t-il quelqu'un ? Une lecture neuve : une personne arrivée il y a un instant n'est pas encore dans ce qu'on sait.
      try {
        const rows = await this.channel.read();
        this._noteRows(rows);
        this._applyPresence(this._mine(rows));
        if (!this.peers().length) await this.channel.write({ removes: this._mine(rows).map(row => row.id) });
      } catch (err) { /* un autre a déjà vidé le salon, ou y revient : rien à faire */ }
    }

    // Fermeture de la page : on dit qu'on part sans attendre la réponse (au pire les autres l'oublient après 30 s).
    leave() {
      if (!this.active) return;
      this.awareness.setLocalState(null);
      const adds = this.pending.length ? [this._row('u', ++this.seq, this.Y.mergeUpdates(this.pending), this.pendingSince)] : [];
      this.channel.write({ adds, upserts: [this._presenceUpsert()] }).catch(() => {});
      this.pending = [];
    }

    dispose() {
      this.active = false;
      this.timers.clearTimeout(this.timer);
      this.timers.clearTimeout(this.compactTimer);
      this.timers.clearTimeout(this.checkTimer);
      this.timer = null;
      this.compactTimer = null;
      this.checkTimer = null;
      this.ydoc.off('update', this._onDocUpdate);
      this.awareness.off('update', this._onAwareness);
      this.awareness.destroy();
      this.ydoc.destroy();
    }

    async flushNow() {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
      await this._flush();
    }

    // La liste COMPLÈTE des lignes de la table, telle que le canal la donne à chaque lecture.
    receive(rows) {
      this.stats.reads++;
      if (this.active) this._integrate(rows);
      else this._noteRows(rows);
    }

    // Les autres personnes du direct : [{ clientId, name, color }]. Un nom et une couleur arrivés d'ailleurs sont nettoyés ici (jamais d'HTML, une couleur hexadécimale ou un gris).
    peers() {
      const others = [];
      this.awareness.getStates().forEach((state, clientId) => {
        if (clientId === this.ydoc.clientID || !state || !state.user) return;
        others.push({ clientId, name: cleanName(state.user.name) || '?', color: cleanColor(state.user.color) });
      });
      return others;
    }
    hasPeers() { return this.peers().length > 0; }

    summary() {
      const received = this.stats.received;
      const writes = this.stats.writes;
      return {
        n: received.length,
        last: received.length ? Math.round(received[received.length - 1]) : 0,
        med: Math.round(median(received)),
        max: received.length ? Math.round(Math.max(...received)) : 0,
        writeMed: Math.round(median(writes)),
        rows: this.stats.rows,
        bytes: this.stats.bytes,
        reads: this.stats.reads,
      };
    }

    // Le modèle vient d'être enregistré : la date que Grist lui a donnée, et l'état du document à l'instant où son texte a été lu (`saveToken`, pris avant de lire le texte).
    saveToken() { return this.Y.encodeStateVector(this.ydoc); }
    async publishSaved(stateVector, modified) {
      if (!this.active || this.replaced) return;
      const data = JSON.stringify({ modified: String(modified), sv: toB64(stateVector) });
      this.seenSaved = data;
      try { await this.channel.write({ upserts: [{ require: { Doc: this.doc, Kind: 'd' }, fields: { Client: this.me, Seq: 0, Data: data, T: this.now() } }] }); }
      catch (err) { this._emit('error', err); }
    }
    // Le document est-il, à cet instant, dans l'état d'un enregistrement ? (`encoded` : l'état de l'enregistrement, en base64)
    isAtState(encoded) {
      let theirs;
      try { theirs = this.Y.decodeStateVector(fromB64(encoded)); } catch (err) { return false; }
      const mine = this.Y.decodeStateVector(this.Y.encodeStateVector(this.ydoc));
      if (mine.size !== theirs.size) return false;
      for (const [client, clock] of mine) if (theirs.get(client) !== clock) return false;
      return true;
    }

    _emit(type, detail) {
      try { this.onEvent(type, detail); } catch (err) { /* l'affichage ne doit jamais couper la synchronisation */ }
    }

    _row(kind, seq, bytes, t) {
      return { Doc: this.doc, Client: this.me, Kind: kind, Seq: seq, Data: toB64(bytes), T: t };
    }

    _presenceUpsert() {
      return {
        require: { Doc: this.doc, Client: this.me, Kind: 'p' },
        fields: { Seq: ++this.pseq, Data: toB64(this.protocol.encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])), T: this.now() },
      };
    }

    _queue(update) {
      if (!this.pending.length) this.pendingSince = this.now();
      this.pending.push(update);
      this._schedule();
    }

    _schedule(delay = this.flushMs) {
      if (!this.active || this.timer || this.inFlight) return;
      this.timer = this.timers.setTimeout(() => { this.timer = null; this._flush(); }, delay);
    }

    // Une seule écriture à la fois : pendant qu'elle part, les frappes suivantes s'accumulent et partent ensemble.
    async _flush() {
      if (this.inFlight || this.replaced) return;
      if (!this.active && !this.pending.length) return;
      const now = this.now();
      const adds = [];
      const upserts = [];
      let sent = null;
      let presence = false;
      if (this.pending.length) {
        sent = { updates: this.pending, since: this.pendingSince };
        this.pending = [];
        adds.push(this._row('u', ++this.seq, sent.updates.length === 1 ? sent.updates[0] : this.Y.mergeUpdates(sent.updates), sent.since));
      }
      if (this.presenceDirty && this.active) {
        if (adds.length || now - this.presenceAt >= PRESENCE_MIN_GAP) {
          upserts.push(this._presenceUpsert());
          this.presenceDirty = false;
          this.presenceAt = now;
          presence = true;
        } else {
          this._schedule(PRESENCE_MIN_GAP - (now - this.presenceAt));
        }
      }
      if (!adds.length && !upserts.length) return;
      this.inFlight = true;
      const started = this.now();
      try {
        await this.channel.write({ adds, upserts });
        keep(this.stats.writes, this.now() - started);
        this.failures = 0;
        this._emit('write');
      } catch (err) {
        this.failures++;
        if (sent) { this.pending = sent.updates.concat(this.pending); this.pendingSince = sent.since; }
        if (presence) this.presenceDirty = true;
        this._emit('error', err);
      } finally {
        this.inFlight = false;
        if (this.pending.length || this.presenceDirty) this._schedule(this.failures ? Math.min(1000 * 2 ** (this.failures - 1), 8000) : this.flushMs);
      }
    }

    // Applique au document les lignes « s » et « u » pas encore prises en compte (l'instantané d'abord).
    _applyRows(rows) {
      const { Y } = this;
      const now = this.now();
      const content = this._mine(rows).filter(row => row.Kind === 's' || row.Kind === 'u').sort((a, b) => (a.Kind === b.Kind ? a.id - b.id : (a.Kind === 's' ? -1 : 1)));
      for (const row of content) {
        const key = rowKey(row);
        if (this.applied.has(key)) continue;
        if (row.Client !== this.me) {
          try { Y.applyUpdate(this.ydoc, fromB64(row.Data), REMOTE); } catch (err) { this._emit('error', err); continue; }
          if (row.Kind === 'u' && this.synced && row.T >= this.startedAt) keep(this.stats.received, now - row.T);
        }
        this.applied.add(key);
      }
    }

    // La présence des autres : chaque ligne « p » est appliquée telle quelle (Yjs ignore ce qu'il a déjà vu et oublie de lui-même une personne dont la ligne ne change plus depuis 30 s) ; une
    // personne dont la ligne a disparu de la table s'en va tout de suite.
    _applyPresence(mine) {
      const present = new Set();
      for (const row of mine) {
        if (row.Kind !== 'p' || row.Client === this.me || !row.Data) continue;
        present.add(Number(row.Client));
        try { this.protocol.applyAwarenessUpdate(this.awareness, fromB64(row.Data), REMOTE); } catch (err) { this._emit('error', err); }
      }
      const gone = [];
      this.presenceClients.forEach((clientId) => { if (!present.has(clientId) && this.awareness.getStates().has(clientId)) gone.push(clientId); });
      if (gone.length) this.protocol.removeAwarenessStates(this.awareness, gone, REMOTE);
      this.presenceClients = present;
    }

    _integrate(rows) {
      const mine = this._mine(rows);
      const snapshot = mine.find(row => row.Kind === 's');
      // Le salon a disparu ou a été refondé (une autre lignée) pendant que nous dormions : republier notre état par-dessus dupliquerait le texte. Le direct s'arrête ici.
      if (!snapshot || snapshot.T !== this.lineage) {
        if (!this.replaced) { this.replaced = true; this.active = false; this._emit('replaced', { reason: snapshot ? 'refounded' : 'gone' }); }
        return;
      }
      const hadKeys = new Set(this.rowIds.keys());
      this._applyRows(rows);
      this._noteRows(rows);
      const vanished = [...hadKeys].some(key => !this.rowIds.has(key));
      this._applyPresence(mine);
      const saved = mine.find(row => row.Kind === 'd');
      if (saved && saved.Client !== this.me && saved.Data !== this.seenSaved) {
        this.seenSaved = saved.Data;
        try {
          const data = JSON.parse(saved.Data);
          if (data && typeof data.modified === 'string' && typeof data.sv === 'string') this._emit('saved', { modified: data.modified.slice(0, 64), stateVector: data.sv });
        } catch (err) { /* un marqueur illisible n'est pas une panne */ }
      }
      if (!this.synced) {
        this.synced = true;
        this._emit('synced');
      }
      if (vanished || this.needsCheck) { this.needsCheck = false; this._scheduleCheck(); }
      this._maybeCompact();
      this._emit('rows');
    }

    // Des lignes ont disparu : la compaction d'un autre (son instantané les remplace) ou une main dans la table (suppression, « Annuler » de Grist). Dans le second cas la table a perdu
    // des frappes que nous avons : on republie ce qui lui manque. Les autres clients font le même contrôle après un délai au hasard et trouvent déjà la ligne de celui qui a été le premier.
    _scheduleCheck() {
      if (this.checkTimer) return;
      this.checkTimer = this.timers.setTimeout(() => { this.checkTimer = null; this._check(); }, 300 + this.random() * 1200);
    }

    async _check() {
      if (!this.active || this.replaced) return;
      if (this.pending.length || this.inFlight) { this.needsCheck = true; return; }
      const { Y } = this;
      const table = new Y.Doc();
      this._mine(this.lastRows).filter(row => row.Kind === 's' || row.Kind === 'u').forEach((row) => {
        try { Y.applyUpdate(table, fromB64(row.Data)); } catch (err) { /* ligne illisible : ignorée */ }
      });
      const missing = Y.encodeStateAsUpdate(this.ydoc, Y.encodeStateVector(table));
      table.destroy();
      if (missing.length <= 2) return;
      try {
        await this.channel.write({ adds: [this._row('u', ++this.seq, missing, 0)] });
        this._emit('log', 'la table avait perdu des lignes : ce qui manquait est republié');
      } catch (err) {
        this._emit('log', 'republication : ' + (err && err.message));
      }
    }

    // Remplace l'instantané et toutes les lignes « u » que nous avons déjà prises en compte par UN nouvel instantané (même lignée) : l'état complet du document.
    async compact() {
      if (!this.active || this.compacting || this.replaced) return false;
      this.compacting = true;
      try {
        const removes = [...this.rowIds.values()];
        const now = this.now();
        for (const [id, t] of this.presenceRows) if (now - t > PRESENCE_ROW_TTL) removes.push(id);
        if (removes.length < 2) return false;
        const snapshot = this._row('s', ++this.seq, this.Y.encodeStateAsUpdate(this.ydoc), this.lineage);
        await this.channel.write({ adds: [snapshot], removes });
        this._emit('compacted', { removed: removes.length });
        return true;
      } catch (err) {
        // deux clients qui compactent ensemble : la seconde écriture trouve des lignes déjà supprimées et Grist refuse tout le lot
        this._emit('log', 'compaction : ' + (err && err.message));
        return false;
      } finally {
        this.compacting = false;
      }
    }

    _maybeCompact() {
      if (this.compactTimer || this.compacting || this.rowIds.size < this.compactAt) return;
      this.compactTimer = this.timers.setTimeout(() => {
        this.compactTimer = null;
        if (this.active && this.rowIds.size >= this.compactAt) this.compact();
      }, 400 + this.random() * 1600);   // le hasard évite que tous les clients compactent ensemble
    }
  }

  function createSession(options) { return new Session(options); }

  return { COLUMNS, REMOTE, ABANDONED_MS, createSession, toB64, fromB64, median, cleanName, cleanColor };
})();
