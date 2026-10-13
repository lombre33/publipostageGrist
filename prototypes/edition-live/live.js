// Moteur de l'édition live : un document Yjs (le texte) et son « awareness » (nom, couleur, curseur) échangés par les
// lignes d'UNE table, celle de Grist ou une table locale de démonstration. Ni serveur ni socket à nous.
//
// Une ligne de la table, six colonnes (COLUMNS) :
//  - Kind « u » : une mise à jour Yjs en base64. Ajoutée, jamais modifiée. Clé de la ligne : « Client#Seq » (jamais
//    le numéro de ligne, que Grist peut rendre après une suppression).
//  - Kind « p » : la présence d'un client. UNE ligne par client, modifiée sur place (BulkAddOrUpdateRecord).
//  - T : l'heure de la première frappe du paquet (« u ») ou du dernier renouvellement (« p »), pour mesurer le délai.
// Une mise à jour reçue deux fois ou dans le désordre ne change rien (propriété de Yjs) : le moteur n'a donc aucun
// accusé de réception, seulement « ce que je n'ai pas encore vu ».

import * as Y from 'yjs';
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';

export const COLUMNS = [
  { id: 'Doc', type: 'Text' },
  { id: 'Client', type: 'Text' },
  { id: 'Kind', type: 'Text' },
  { id: 'Seq', type: 'Int' },
  { id: 'Data', type: 'Text' },
  { id: 'T', type: 'Numeric' },
];

const REMOTE = { origin: 'table' };   // origine des changements venus de la table : ils ne repartent jamais
const PRESENCE_MAX_AGE = 28000;       // une présence plus vieille est ignorée (y-protocols la renouvelle toutes les 15 s)
const PRESENCE_MIN_GAP = 400;         // au plus une écriture de curseur toutes les 0,4 s
const PRESENCE_ROW_TTL = 120000;      // une ligne de présence de plus de 2 min est supprimée à la compaction
const RING = 50;                      // nombre de mesures gardées

// Un document qui commence par UN paragraphe vide, le même chez tout le monde (client 1, horloge 0) : sans lui, deux clients qui
// tapent en même temps dans un document vide créent chacun leur premier paragraphe et le texte finit sur deux lignes.
export function seedDocument(ydoc, field = 'default') {
  const seed = new Y.Doc();
  seed.clientID = 1;
  seed.getXmlFragment(field).insert(0, [new Y.XmlElement('paragraph')]);
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seed), REMOTE);
  seed.destroy();
}

export function toB64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function fromB64(text) {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const keep = (ring, value) => { ring.push(value); if (ring.length > RING) ring.shift(); };
export const median = values => { if (!values.length) return 0; const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export class LiveSync {
  constructor({ ydoc, awareness, channel, doc = 'demo', flushMs = 150, compactAt = 60, onEvent = () => {} }) {
    Object.assign(this, { ydoc, awareness, channel, doc, flushMs, compactAt, onEvent });
    this.me = String(ydoc.clientID);
    this.active = false;
    this.synced = false;            // la première liste de lignes de ce direct est prise en compte
    this.hasReceived = false;
    this.offlineDirty = false;      // des changements locaux ont été faits direct éteint
    this.startedAt = 0;
    this.pending = [];              // mises à jour locales pas encore écrites
    this.pendingSince = 0;
    this.seq = 0;
    this.pseq = 0;
    this.presenceDirty = false;
    this.presenceAt = 0;
    this.applied = new Set();       // clés « Client#Seq » des lignes « u » déjà prises en compte
    this.rowIds = new Map();        // clé -> numéro de ligne : ce que la compaction peut supprimer
    this.presenceRows = new Map();  // numéro de ligne -> T, pour nettoyer les présences abandonnées
    this.lastRows = [];             // dernière liste complète reçue (servira à la réactivation)
    this.savedState = null;
    this.inFlight = false;
    this.timer = null;
    this.compacting = false;
    this.compactTimer = null;
    this.checkTimer = null;
    this.needsCheck = false;
    this.failures = 0;
    this.stats = { received: [], writes: [], notifications: 0, rows: 0, bytes: 0 };
    this._onDocUpdate = (update, origin) => {
      if (origin === REMOTE) return;
      if (!this.active) { this.offlineDirty = true; return; }
      this._queue(update);
    };
    this._onAwareness = ({ added, updated, removed }, origin) => {
      if (origin === REMOTE) return;
      if (![...added, ...updated, ...removed].includes(this.ydoc.clientID)) return;
      this.presenceDirty = true;
      this._schedule();
    };
    seedDocument(ydoc);
    ydoc.on('update', this._onDocUpdate);
    awareness.on('update', this._onAwareness);
  }

  // Allume le direct : prend en compte les lignes déjà reçues, puis envoie ce que la table n'a pas encore.
  start() {
    if (this.active) return;
    this.active = true;
    this.synced = false;
    this.startedAt = Date.now();
    if (this.savedState) { this.awareness.setLocalState(this.savedState); this.savedState = null; }
    this.presenceDirty = true;
    if (this.hasReceived) this._integrate(this.lastRows);
    this._schedule(0);
  }

  // Éteint le direct : écrit ce qui reste, dit aux autres qu'on part, puis plus rien ne part ni n'arrive.
  async stop() {
    if (!this.active) return;
    await this.flushNow();
    this.active = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.savedState = this.awareness.getLocalState();
    this.awareness.setLocalState(null);
    try { await this.channel.write({ upserts: [this._presenceUpsert()] }); } catch (err) { this._emit('error', err); }
  }

  // Fermeture de l'onglet : on dit qu'on part sans attendre la réponse (au pire les autres l'oublient après 30 s).
  leave() {
    if (!this.active) return;
    this.awareness.setLocalState(null);
    this.channel.write({ adds: this.pending.length ? [this._row('u', ++this.seq, Y.mergeUpdates(this.pending), this.pendingSince)] : [], upserts: [this._presenceUpsert()] }).catch(() => {});
    this.pending = [];
  }

  dispose() {
    clearTimeout(this.timer);
    clearTimeout(this.compactTimer);
    clearTimeout(this.checkTimer);
    this.ydoc.off('update', this._onDocUpdate);
    this.awareness.off('update', this._onAwareness);
  }

  async flushNow() {
    clearTimeout(this.timer);
    this.timer = null;
    await this._flush();
  }

  // La liste COMPLÈTE des lignes de la table, telle que Grist la donne à chaque changement.
  receive(rows) {
    this.lastRows = rows;
    this.hasReceived = true;
    const s = this.stats;
    s.notifications++;
    s.rows = rows.length;
    s.bytes = rows.reduce((n, r) => n + r.Data.length, 0);
    if (this.active) this._integrate(rows);
    else this._emit('rows');
  }

  summary() {
    const r = this.stats.received;
    const w = this.stats.writes;
    return {
      n: r.length,
      last: r.length ? Math.round(r[r.length - 1]) : 0,
      med: Math.round(median(r)),
      max: r.length ? Math.round(Math.max(...r)) : 0,
      writeLast: w.length ? Math.round(w[w.length - 1]) : 0,
      writeMed: Math.round(median(w)),
      rows: this.stats.rows,
      bytes: this.stats.bytes,
      notifications: this.stats.notifications,
    };
  }

  // Remplace toutes les lignes « u » que nous avons déjà prises en compte par UNE ligne : l'état complet du document.
  async compact() {
    if (!this.active || this.compacting) return false;
    this.compacting = true;
    try {
      const removes = [...this.rowIds.values()];
      const now = Date.now();
      for (const [id, t] of this.presenceRows) if (now - t > PRESENCE_ROW_TTL) removes.push(id);
      if (removes.length < 2) return false;
      const snapshot = this._row('u', ++this.seq, Y.encodeStateAsUpdate(this.ydoc), 0);   // T = 0 : pas une mesure de délai
      await this.channel.write({ adds: [snapshot], removes });
      this._emit('compacted', { removed: removes.length });
      return true;
    } catch (err) {
      // deux clients qui compactent ensemble : la seconde écriture trouve des lignes déjà supprimées et Grist refuse tout le lot
      this._emit('log', 'compaction : ' + (err && err.message));
      if (this.channel.refresh) await this.channel.refresh().catch(() => {});
      return false;
    } finally {
      this.compacting = false;
    }
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
      fields: { Seq: ++this.pseq, Data: toB64(encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])), T: Date.now() },
    };
  }

  _queue(update) {
    if (!this.pending.length) this.pendingSince = Date.now();
    this.pending.push(update);
    this._schedule();
  }

  _schedule(delay = this.flushMs) {
    if (!this.active || this.timer || this.inFlight) return;
    this.timer = setTimeout(() => { this.timer = null; this._flush(); }, delay);
  }

  // Une seule écriture à la fois : pendant qu'elle part, les frappes suivantes s'accumulent et partent ensemble.
  async _flush() {
    if (!this.active || this.inFlight) return;
    const now = Date.now();
    const adds = [];
    const upserts = [];
    let sent = null;
    let presence = false;
    if (this.pending.length) {
      sent = { updates: this.pending, since: this.pendingSince };
      this.pending = [];
      adds.push(this._row('u', ++this.seq, sent.updates.length === 1 ? sent.updates[0] : Y.mergeUpdates(sent.updates), sent.since));
    }
    if (this.presenceDirty) {
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
    const started = performance.now();
    try {
      await this.channel.write({ adds, upserts });
      keep(this.stats.writes, performance.now() - started);
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

  _integrate(rows) {
    const now = Date.now();
    const mine = rows.filter(r => r.Doc === this.doc);
    const updates = mine.filter(r => r.Kind === 'u').sort((a, b) => a.id - b.id);
    const present = new Map();
    for (const r of updates) {
      const key = r.Client + '#' + r.Seq;
      if (!this.applied.has(key)) {
        if (r.Client !== this.me) {
          try { Y.applyUpdate(this.ydoc, fromB64(r.Data), REMOTE); } catch (err) { this._emit('error', err); continue; }
          if (this.synced && r.T >= this.startedAt) keep(this.stats.received, now - r.T);
        }
        this.applied.add(key);
      }
      present.set(key, r.id);
    }
    const vanished = [...this.rowIds.keys()].some(key => !present.has(key));
    this.rowIds = present;   // une ligne supprimée par la compaction d'un autre n'est plus à supprimer
    const presenceRows = new Map();
    for (const r of mine) {
      if (r.Kind !== 'p') continue;
      presenceRows.set(r.id, r.T);
      if (r.Client === this.me || !r.Data || now - r.T > PRESENCE_MAX_AGE) continue;
      try { applyAwarenessUpdate(this.awareness, fromB64(r.Data), REMOTE); } catch (err) { this._emit('error', err); }
    }
    this.presenceRows = presenceRows;
    if (!this.synced) {
      this.synced = true;
      this._pushOfflineDiff(updates);
      this._emit('synced');
    }
    if (vanished || this.needsCheck) { this.needsCheck = false; this._scheduleCheck(); }
    this._maybeCompact();
    this._emit('rows');
  }

  // Des lignes ont disparu : la compaction d'un autre (son état complet les remplace) ou une main dans la table (suppression,
  // « Annuler » de Grist). Dans le second cas la table a perdu des frappes que nous avons : on republie notre état complet.
  // Les autres clients font le même contrôle après un délai au hasard et trouvent déjà la ligne de celui qui a été le premier.
  _scheduleCheck() {
    if (this.checkTimer) return;
    this.checkTimer = setTimeout(() => { this.checkTimer = null; this._check(); }, 300 + Math.random() * 1200);
  }

  async _check() {
    if (!this.active || !this.hasReceived) return;
    if (this.pending.length || this.inFlight) { this.needsCheck = true; return; }
    const table = new Y.Doc();
    seedDocument(table);
    for (const r of this.lastRows) {
      if (r.Doc !== this.doc || r.Kind !== 'u') continue;
      try { Y.applyUpdate(table, fromB64(r.Data)); } catch (err) { /* ligne illisible : ignorée */ }
    }
    const same = Y.equalSnapshots(Y.snapshot(this.ydoc), Y.snapshot(table));
    table.destroy();
    if (same) return;
    try {
      await this.channel.write({ adds: [this._row('u', ++this.seq, Y.encodeStateAsUpdate(this.ydoc), 0)] });
      this._emit('log', 'la table avait perdu des lignes : état complet republié');
    } catch (err) {
      this._emit('log', 'republication : ' + (err && err.message));
    }
  }

  // Direct rallumé : ce qui a été écrit pendant qu'il était éteint part en UNE ligne (le seul écart avec la table).
  _pushOfflineDiff(updates) {
    if (!this.offlineDirty) return;
    this.offlineDirty = false;
    const table = new Y.Doc();
    seedDocument(table);
    for (const r of updates) { try { Y.applyUpdate(table, fromB64(r.Data)); } catch (err) { /* ligne illisible : ignorée */ } }
    const diff = Y.encodeStateAsUpdate(this.ydoc, Y.encodeStateVector(table));
    table.destroy();
    if (diff.length > 2) this._queue(diff);
  }

  _maybeCompact() {
    if (this.compactTimer || this.compacting || this.rowIds.size < this.compactAt) return;
    this.compactTimer = setTimeout(() => {
      this.compactTimer = null;
      if (this.active && this.rowIds.size >= this.compactAt) this.compact();
    }, 400 + Math.random() * 1600);   // le hasard évite que tous les clients compactent ensemble
  }
}
