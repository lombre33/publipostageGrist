// « À la frappe » (choix du 21/10 pour l'import lié : deux présentations ouvertes se suivent pendant la frappe, par l'extension « édition » de Grist Factory Suite). Les diapositives liées
// (js/slide-links.js) se mettent à jour à l'enregistrement et à la lecture ; ce fichier ajoute, quand GFS dit l'extension « édition » active, les versions qui passent d'une page à l'autre
// pendant la frappe, par la table du direct (Publipostage_Direct, celle de l'écriture en direct : Grist garde la donnée, sous ses droits). Sans l'extension, rien ne part ni ne se lit ici.
//  - LES LIGNES : une par page et par CANAL, modifiée sur place (BulkAddOrUpdateRecord) : Doc = « slides:N », N le numéro de la présentation source dont il s'agit ; Kind = « l » ;
//    Client = la page ; Seq monte à chaque envoi ; T = l'heure de l'envoi ou de la dernière présence ; Data = { v, model, slides: [{ id, hash, from, html }], media }. Le salon d'un
//    document, lui, a pour Doc son numéro seul : l'écriture en direct ne lit jamais ces lignes, et ce fichier ne lit qu'elles.
//  - LA PRÉSENCE : une page qui montre une présentation à diapositives partagées pose sa ligne (vide) sur chacun de ses canaux, et redit sa présence toutes les PRESENCE_MS ; elle
//    n'envoie rien sur un canal où aucune autre présentation n'est là depuis PEER_MS (personne à suivre : rien n'entre dans l'historique du document pour rien). La table est créée
//    à la première présence quand elle manque (le document porte déjà les tables du widget : rien n'est demandé).
//  - L'ENVOI : une frappe dans une diapositive partagée (liée vers sa source, ou source elle-même) part SEND_MS après, au plus SEND_MAX_MS après la première frappe d'une rafale. La ligne
//    porte la dernière version de chaque diapositive que la page a changée sur ce canal. Les images de plus de MEDIA_MIN signes y sont un renvoi (« pp-media:empreinte ») ; seules celles que
//    l'enregistrement du canal ne porte pas encore y sont jointes (`media`). Ce que la synchro a posé (une version arrivée) ne repart pas. Une présentation qui arrive reçoit ce que la page
//    a changé depuis l'ouverture.
//  - LA LECTURE : la table relue toutes les FAST_MS quand une autre page y a écrit depuis ACTIVE_MS, toutes les PEER_READ_MS quand une autre présentation est là, toutes les SLOW_MS
//    sinon, jamais quand la page est cachée ni quand GFS dit l'app inactive ; les lignes déjà là à la première lecture d'un canal ne s'appliquent pas (leur contenu est enregistré, ou
//    le sera à la frappe suivante). Une version dont une image manque attend l'enregistrement.
//  - LE MÉNAGE : en quittant la page (ou la présentation), ses lignes partent ; une ligne qu'aucune page n'a touchée depuis STALE_MS part au passage d'une autre.
const SlideLinksLive = (function () {
  const TABLE = 'Publipostage_Direct';
  // Les colonnes de la table du direct, celles de LiveSync.COLUMNS (extensions/edition/live-sync.js, qui ne se charge qu'avec l'écriture en direct) : la table créée ici est la même.
  const COLUMNS = [
    { id: 'Doc', type: 'Text' },
    { id: 'Client', type: 'Text' },
    { id: 'Kind', type: 'Text' },
    { id: 'Seq', type: 'Int' },
    { id: 'Data', type: 'Text' },
    { id: 'T', type: 'Numeric' },
  ];
  const KIND = 'l';
  const PREFIX = 'slides:';
  const EXTENSION = 'edition';
  const FAST_MS = 250;
  const PEER_READ_MS = 1000;
  const SLOW_MS = 2000;
  const ACTIVE_MS = 10000;
  const SEND_MS = 250;
  const SEND_MAX_MS = 1000;
  const RETRY_MS = 2000;
  const PRESENCE_MS = 5 * 60 * 1000;
  const PEER_MS = 15 * 60 * 1000;
  const STALE_MS = 60 * 60 * 1000;
  const SWEEP_MS = 60000;
  const MEDIA_MIN = 1024;
  const MAX_DATA = 512 * 1024;
  const DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i;
  const INACTIVE = 'GFS_INACTIF';   // GFS dit que l'app n'est plus l'app active : plus rien ne se lit jusqu'au prochain geste
  const isInactive = err => !!err && (err.code === INACTIVE || String(err.message || err).indexOf(INACTIVE) !== -1);
  const me = Array.from(crypto.getRandomValues(new Uint32Array(2)), word => word.toString(36)).join('');

  let current = null;          // la présentation que la page suit (son numéro)
  let watched = null;          // l'éditeur dont les transactions sont écoutées
  const seen = new Map();      // 'Doc|Client' -> le dernier Seq lu
  const models = new Map();    // 'Doc|Client' -> { at, model } : la présentation que montre la page de cette ligne, lue à son dernier Seq
  const baselined = new Set(); // les canaux déjà lus une fois
  let peers = new Map();       // canal -> les autres pages (Client) qui y sont, sous une autre présentation
  let sent = new Map();        // 'canal:diapositive' -> l'empreinte que les autres pages ont de cette page (envoyée, ou arrivée ici)
  const published = new Set(); // les diapositives que cette page a changées et publiées : sa ligne porte leur dernière version
  let agreed = new Map();      // 'canal:diapositive' d'une diapositive source d'ici -> l'empreinte sur laquelle ses frappes partent
  const mine = new Map();      // Doc -> { id, t } : la ligne de cette page et l'heure qu'elle porte
  const announced = new Map(); // Doc -> l'heure de la présence posée, pas encore relue
  let seq = 0;
  let activeAt = -Infinity;
  let readTimer = null;
  let sendTimer = null;
  let firstPendingAt = 0;
  let sending = null;
  let again = false;
  let tableReady = false;
  let inactive = false;
  let sweptAt = 0;

  const editorNow = () => { const editor = EditorCore.getEditor(); return editor && !editor.isDestroyed ? editor : null; };
  const selfId = () => { const id = Number(Templates.getCurrentId()); return Number.isInteger(id) && id > 0 ? id : null; };
  const enabled = () => Extensions.isActive(EXTENSION) && SlidesEntry.presentationShown();
  // Un compte Lecteur suit, sans rien écrire.
  const canWrite = () => !GristAPI.isDocumentReadOnly();
  const text = value => (value == null ? '' : String(value));
  const channelOf = doc => (doc.startsWith(PREFIX) ? Number(doc.slice(PREFIX.length)) : NaN);
  const emptyData = self => JSON.stringify({ v: 1, model: self, slides: [], media: {} });

  // ---- Les images ------------------------------------------------------------------------------------------------------------------------------------

  const tokenOf = data => 'pp-media:' + SlideLinks.hashOf(data);
  const DATA_SRC = /src="(data:[^"]+)"/g;
  // Les images de plus de MEDIA_MIN signes du texte enregistré d'un modèle : renvoi -> donnée. Gardées tant que le texte ne change pas.
  const mediaByModel = new Map();   // numéro du modèle -> { contenu, map }
  function mediaOfModel(id) {
    const model = Templates.byId(id);
    const contenu = model ? String(model.contenu || '') : '';
    const kept = mediaByModel.get(String(id));
    if (kept && kept.contenu === contenu) return kept.map;
    const map = new Map();
    for (const match of contenu.matchAll(DATA_SRC)) if (match[1].length >= MEDIA_MIN) map.set(tokenOf(match[1]), match[1]);
    mediaByModel.set(String(id), { contenu, map });
    return map;
  }
  // Celles du texte de l'éditeur, par image (une image ne change pas : la frappe ailleurs ne coûte rien).
  const mediaOfNode = new WeakMap();
  function mediaOfDoc(doc) {
    const map = new Map();
    doc.descendants((node) => {
      if (node.type.name !== 'editorImage') return true;
      const src = text(node.attrs.src);
      if (src.length < MEDIA_MIN || !src.startsWith('data:')) return false;
      let token = mediaOfNode.get(node);
      if (!token) { token = tokenOf(src); mediaOfNode.set(node, token); }
      map.set(token, src);
      return false;
    });
    return map;
  }
  // Le HTML d'une diapositive à envoyer sur le canal `channel` : ses grandes images en renvois, et celles que l'enregistrement du canal ne porte pas encore, jointes.
  function packMedia(html, channel, media) {
    const known = mediaOfModel(channel);
    return html.replace(DATA_SRC, (all, data) => {
      if (data.length < MEDIA_MIN) return all;
      const token = tokenOf(data);
      if (!known.has(token)) media[token] = data;
      return 'src="' + token + '"';
    });
  }
  // Le HTML reçu, ses renvois remplacés par les images : jointes au message, déjà dans le texte de l'éditeur, ou dans l'enregistrement du canal ou de cette présentation ; null quand
  // une image manque (la version attend l'enregistrement).
  function unpackMedia(html, media, editor, channel) {
    if (html.indexOf('pp-media:') === -1) return html;
    let local = null;
    let missing = false;
    const out = html.replace(/src="(pp-media:[a-z0-9]+)"/g, (all, token) => {
      let data = media && typeof media[token] === 'string' && DATA_URI.test(media[token]) ? media[token] : null;
      if (!data) {
        if (!local) local = [mediaOfDoc(editor.state.doc), mediaOfModel(channel), mediaOfModel(current)];
        data = local.map(map => map.get(token)).find(Boolean) || null;
      }
      if (!data) { missing = true; return all; }
      return 'src="' + data + '"';
    });
    return missing ? null : out;
  }

  // ---- La présentation suivie ------------------------------------------------------------------------------------------------------------------------

  // Une autre présentation à l'écran (ou la première) : ce que ses diapositives partagées montrent est ce que les autres en ont (son texte enregistré), rien n'est encore lu.
  function follow(self, editor) {
    current = self;
    seen.clear();
    models.clear();
    baselined.clear();
    published.clear();
    peers = new Map();
    sent = SlideLinks.liveHashes(editor.state.doc);
    agreed = new Map(sent);
  }
  // Les transactions de l'éditeur : une frappe dans une diapositive partagée part ; ce que la synchro a posé est ce que les autres ont déjà.
  function onTransaction({ transaction: tr }) {
    if (!tr.docChanged || current == null || current !== selfId()) return;
    if (tr.getMeta('preventUpdate') || SlideLinks.isSyncTransaction(tr) || LiveEntry.isRemote(tr)) {
      const before = SlideLinks.liveHashes(tr.before);
      SlideLinks.liveHashes(tr.doc).forEach((hash, key) => {
        if (before.get(key) === hash) return;
        sent.set(key, hash);
        agreed.set(key, hash);
        published.delete(key);
      });
      return;
    }
    if (enabled() && peers.size) scheduleSend();
  }
  function watch(editor) {
    if (watched === editor) return;
    if (watched && !watched.isDestroyed) watched.off('transaction', onTransaction);
    watched = editor;
    if (editor) editor.on('transaction', onTransaction);
  }

  // ---- L'envoi ---------------------------------------------------------------------------------------------------------------------------------------

  function scheduleSend() {
    const now = Date.now();
    if (!firstPendingAt) firstPendingAt = now;
    clearTimeout(sendTimer);
    sendTimer = setTimeout(send, Math.max(0, Math.min(SEND_MS, firstPendingAt + SEND_MAX_MS - now)));
  }
  // Un lot à la table du direct, après l'avoir créée ou réparée au besoin.
  async function write(actions) {
    if (!tableReady) await prepareTable();
    await grist.docApi.applyUserActions(actions);
  }
  async function send() {
    sendTimer = null;
    firstPendingAt = 0;
    if (sending) { again = true; return; }
    const editor = editorNow();
    const self = selfId();
    if (!editor || !self || self !== current || !enabled() || !canWrite()) return;
    const entries = SlideLinks.liveOut(editor).filter(entry => peers.has(entry.channel));
    const changed = entries.filter(entry => entry.force || sent.get(entry.key) !== entry.hash);
    if (!changed.length) return;
    changed.forEach(entry => published.add(entry.key));
    const rows = [];
    new Set(changed.map(entry => entry.channel)).forEach((channel) => {
      const media = {};
      const slides = entries.filter(entry => entry.channel === channel && published.has(entry.key)).map(entry => ({
        id: entry.id, hash: entry.hash, from: entry.side === 'source' ? (entry.from || agreed.get(entry.key) || '') : entry.from, html: packMedia(entry.html, channel, media),
      }));
      let data = JSON.stringify({ v: 1, model: self, slides, media });
      if (data.length > MAX_DATA) data = JSON.stringify({ v: 1, model: self, slides, media: {} });
      if (data.length <= MAX_DATA) rows.push({ channel, data });
    });
    if (!rows.length) return;
    seq += 1;
    const at = Date.now();
    sending = write(rows.map(({ channel, data }) => ['BulkAddOrUpdateRecord', TABLE, { Doc: [PREFIX + channel], Client: [me], Kind: [KIND] }, { Seq: [seq], Data: [data], T: [at] }, {}]));
    try {
      await sending;
      changed.forEach(entry => sent.set(entry.key, entry.hash));
      rows.forEach(({ channel }) => { const row = mine.get(PREFIX + channel); if (row) row.t = at; });
      activeAt = Date.now();
    } catch (e) {
      // Grist a refusé (table abîmée, droits, GFS qui dit l'app inactive) : la frappe suivante, ou l'essai d'après, renvoie tout.
      tableReady = false;
      if (isInactive(e)) inactive = true;
      else setTimeout(() => { if (enabled() && peers.size) scheduleSend(); }, RETRY_MS);
    } finally {
      sending = null;
    }
    if (again) { again = false; scheduleSend(); }
  }
  // La table du direct, créée quand elle manque, et ses colonnes qui manquent ajoutées (une table abîmée : Grist annulerait tout le lot qui écrit dans une colonne absente).
  async function prepareTable() {
    if (!(await GristAPI.ensureTable(TABLE, COLUMNS))) {
      const table = await grist.docApi.fetchTable(TABLE);
      const missing = COLUMNS.filter(column => !(column.id in table));
      if (missing.length) await grist.docApi.applyUserActions(missing.map(column => ['AddColumn', TABLE, column.id, { type: column.type, isFormula: false }]));
    }
    tableReady = true;
  }
  // La présence de cette page sur ses canaux : une ligne vide où elle n'en a pas, l'heure redite où la sienne vieillit ; ses lignes des canaux qu'elle a quittés partent.
  function present(channels) {
    if (!canWrite()) return;
    const now = Date.now();
    const actions = [];
    const gone = [];
    mine.forEach((row, doc) => { if (!channels.has(channelOf(doc))) gone.push(doc); });
    if (gone.length) {
      // À part : une ligne déjà enlevée ferait refuser tout le lot.
      grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE, gone.map(doc => mine.get(doc).id)]]).catch(() => {});
      gone.forEach(doc => mine.delete(doc));
    }
    const fresh = [];
    channels.forEach((channel) => {
      const doc = PREFIX + channel;
      const row = mine.get(doc);
      if (row) {
        // Par clé, sans recréer une ligne qu'une autre page aurait enlevée entre-temps.
        if (now - row.t > PRESENCE_MS) { actions.push(['BulkAddOrUpdateRecord', TABLE, { Doc: [doc], Client: [me], Kind: [KIND] }, { T: [now] }, { add: false }]); row.t = now; }
        return;
      }
      if (now - (announced.get(doc) || 0) < RETRY_MS * 5) return;
      announced.set(doc, now);
      fresh.push(doc);
    });
    if (fresh.length) {
      seq += 1;
      // Sans toucher à une ligne de cette page déjà là (ce qu'elle a publié).
      fresh.forEach(doc => actions.push(['BulkAddOrUpdateRecord', TABLE, { Doc: [doc], Client: [me], Kind: [KIND] }, { Seq: [seq], Data: [emptyData(current)], T: [now] }, { update: false }]));
    }
    if (!actions.length) return;
    write(actions).catch((e) => {
      tableReady = false;
      fresh.forEach(doc => announced.delete(doc));
      if (isInactive(e)) inactive = true;
    });
  }

  // ---- La lecture ------------------------------------------------------------------------------------------------------------------------------------

  function schedule(wait) {
    clearTimeout(readTimer);
    readTimer = setTimeout(read, wait);
  }
  async function read() {
    readTimer = null;
    if (inactive) return;
    const editor = editorNow();
    const self = selfId();
    watch(editor);
    if (!enabled()) leave();
    if (!editor || !self || !enabled() || document.visibilityState === 'hidden') { schedule(SLOW_MS); return; }
    if (current !== self) follow(self, editor);
    const channels = SlideLinks.liveChannels(editor);
    if (!channels.size) { present(channels); schedule(SLOW_MS); return; }
    let table = null;
    try { table = await grist.docApi.fetchTable(TABLE); } catch (e) {
      if (isInactive(e)) { inactive = true; return; }
      // La table manque : la présence de cette page la crée.
      tableReady = false;
    }
    if (table && !COLUMNS.every(column => Array.isArray(table[column.id]))) { tableReady = false; table = null; }
    if (table) tableReady = true;
    if (current === selfId()) {
      if (table) take(table, channels, editorNow());
      present(channels);
      if (SlideLinks.wantsRepublish() && peers.size) scheduleSend();
    }
    schedule(Date.now() - activeAt < ACTIVE_MS ? FAST_MS : (peers.size ? PEER_READ_MS : SLOW_MS));
  }
  // La présentation que montre la page d'une ligne (lue une fois par Seq).
  function modelOf(key, at, data) {
    const kept = models.get(key);
    if (kept && kept.at === at) return kept.model;
    let model = NaN;
    try { model = Number(JSON.parse(data).model); } catch (e) { model = NaN; }
    models.set(key, { at, model });
    return model;
  }
  // Les lignes des canaux de cette page, écrites par une autre depuis la lecture d'avant : chacune donne ses versions au socle des liens (une version qui attend son tour se relit à la
  // lecture suivante). Les lignes de cette page sont notées (présence, ménage) ; les autres pages présentes aussi.
  function take(table, channels, editor) {
    if (!editor) return;
    const now = Date.now();
    const stale = [];
    const fresh = [];
    const here = new Map();
    let arrived = false;
    mine.clear();
    for (let i = 0; i < table.id.length; i++) {
      if (text(table.Kind[i]) !== KIND) continue;
      const doc = text(table.Doc[i]);
      const t = Number(table.T[i]) || 0;
      if (now - t > STALE_MS) { stale.push(table.id[i]); continue; }
      const channel = channelOf(doc);
      if (!channels.has(channel)) continue;
      const client = text(table.Client[i]);
      if (client === me) { mine.set(doc, { id: table.id[i], t }); announced.delete(doc); continue; }
      const key = doc + '|' + client;
      const at = Number(table.Seq[i]) || 0;
      const data = text(table.Data[i]);
      const model = modelOf(key, at, data);
      if (model !== current && now - t < PEER_MS) {
        if (!here.has(channel)) here.set(channel, new Set());
        here.get(channel).add(client);
        if (!(peers.get(channel) || new Set()).has(client)) arrived = true;
      }
      if (!baselined.has(channel)) { seen.set(key, at); continue; }
      if (seen.has(key) && seen.get(key) >= at) continue;
      fresh.push({ key, at, channel, client, model, data });
    }
    channels.forEach(channel => baselined.add(channel));
    peers = here;
    // Une présentation qui arrive : ce que cette page a changé depuis l'ouverture lui part.
    if (arrived) scheduleSend();
    fresh.forEach((row) => {
      activeAt = now;
      let message = null;
      try { message = JSON.parse(row.data); } catch (e) { message = null; }
      const entries = [];
      // Une autre page de cette même présentation : l'écriture en direct s'en occupe, quand elle est lancée.
      if (message && Array.isArray(message.slides) && row.model !== current) {
        message.slides.forEach((slide) => {
          if (!slide || typeof slide.id !== 'string' || typeof slide.html !== 'string') return;
          const html = unpackMedia(slide.html, message.media, editor, row.channel);
          if (html != null) entries.push({ id: slide.id, html, from: text(slide.from) });
        });
      }
      if (!entries.length || SlideLinks.liveIn(editor, row.channel, row.client, entries, row.model)) seen.set(row.key, row.at);
    });
    if (stale.length && now - sweptAt > SWEEP_MS) {
      sweptAt = now;
      // Chacune à part : une ligne qu'une autre page vient d'enlever ferait refuser tout le lot.
      stale.forEach(id => grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE, [id]]]).catch(() => {}));
    }
  }

  // Cette page ne montre plus de présentation à diapositives partagées (ou l'extension s'arrête) : ses lignes partent, au mieux.
  function leave() {
    if (!mine.size || typeof grist === 'undefined') return;
    grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE, Array.from(mine.values(), row => row.id)]]).catch(() => {});
    mine.clear();
    peers = new Map();
  }
  // En quittant la page : ses lignes partent (au mieux ; celles qui restent partent au ménage d'une autre).
  window.addEventListener('pagehide', leave);
  // De retour à l'écran, ou un geste après que GFS a dit l'app inactive : la lecture reprend tout de suite.
  const resume = () => { if (!inactive) return; inactive = false; schedule(0); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; inactive = false; schedule(0); });
  window.addEventListener('focus', resume);
  document.addEventListener('pointerdown', resume, true);
  document.addEventListener('keydown', resume, true);

  schedule(SLOW_MS);
  return { TABLE, KIND, PREFIX };
})();
