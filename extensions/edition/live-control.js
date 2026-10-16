// Le chef d'orchestre de l'écriture en direct : il assemble le canal (live-channel.js), le moteur (live-sync.js) et l'éditeur (live-editor.js), allume et éteint le direct, tient la barre
// des personnes et dit au reste du widget ce qu'il doit savoir pendant que le texte est partagé (js/live-entry.js, le seul point d'entrée du socle). Rien ici ne s'exécute avant le premier clic
// sur « Écriture en direct » : l'extension (et le fichier de Grist Factory Suite, Yjs compris) ne se charge qu'alors, et seulement si GFS dit l'extension active.
//
// Le déroulé d'un démarrage : les modules de la bibliothèque, la table du direct (créée au besoin), le nom et la couleur de la personne, le salon du modèle (le fonder avec le texte de
// l'éditeur, ou le rejoindre après un accord), puis le moteur démarre et l'éditeur s'accroche au texte du salon. Un modèle de plus à la fois : changer de modèle ferme le direct
// (releaseEditor, avant que l'éditeur ne change de texte).
//
// L'ENREGISTREMENT : le salon partage le TEXTE ; le modèle enregistré dans Grist reste celui de js/main.js. Pour ne pas l'écrire à plusieurs en même temps (et se croire en conflit les uns avec les
// autres), UNE personne l'écrit pour tout le monde : celle dont le numéro de client est le plus bas parmi les pages visibles (isScribe). Elle annonce ce qu'elle a écrit (publishSaved : la date
// de Grist et l'état du texte) ; les autres adoptent cette date et, si leur texte en est au même état, se tiennent pour enregistrées (onSaved).
const LiveControl = (function () {
  const FIELD = 'prosemirror';           // le fragment du document Yjs qui porte le texte
  const LIBRARY = 'edition-live';        // la bibliothèque de GFS (js/extensions.js)
  const BAR_ID = 'live-bar';
  const MAX_CHIPS = 4;                   // les personnes montrées dans la barre, avec soi ; « +N » pour les autres
  const FOCUS_POKE_MS = 1000;            // une relecture reprise au plus une fois par seconde par les gestes de la personne
  // Les couleurs des curseurs : sombres, pour se voir sur la feuille blanche (non-texte, au moins 3:1) ; le nom écrit dessus est noir ou blanc, selon ce qui se lit le mieux (LiveEditor.readableOn), et se lit
  // à 4,5:1 au moins (verify-live-editor.mjs le calcule pour chacune : une couleur à mi-luminance, ni assez claire pour le noir ni assez sombre pour le blanc, n'a pas sa place ici).
  const PALETTE = ['#c2255c', '#1971c2', '#267a38', '#c4440b', '#7048e8', '#0b7285', '#a61e4d', '#5f3dc4', '#9c36b5', '#a8590b'];

  let current = null;                    // la session au premier plan : { doc, phase, session, channel, binding, bar, ... }
  let settingUp = false;                 // le texte de l'éditeur est en train de s'accrocher à celui du salon : ce n'est pas une frappe
  const savedListeners = new Set();

  const state = () => (current ? current.phase : 'off');
  const alive = live => current === live && !live.cancelled;
  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  // L'identité
  // La couleur de la personne : la même d'une fois à l'autre (elle vient de son adresse), changée seulement si une personne déjà là porte la même.
  function hashOf(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return hash;
  }
  function pickColor(seed, taken) {
    const start = hashOf(String(seed)) % PALETTE.length;
    for (let step = 0; step < PALETTE.length; step++) {
      const color = PALETTE[(start + step) % PALETTE.length];
      if (!taken || !taken.has(color)) return color;
    }
    return PALETTE[start];
  }
  // Le nom montré aux autres : le nom du compte Grist, à défaut le début de l'adresse, à défaut un nom anonyme. Lire le nom peut ajouter une colonne à la table d'identification ; sans droit pour
  // cela, l'adresse suffit.
  async function readUser(clientId) {
    const known = GristAPI.peekCurrentUser();
    let name = known.name;
    let email = known.email;
    if (!name) { try { name = await GristAPI.getCurrentUserName(); } catch (e) { name = ''; } }
    if (!email) { try { email = await GristAPI.getCurrentUserEmail(); } catch (e) { email = ''; } }
    const shown = LiveSync.cleanName(name) || LiveSync.cleanName(String(email || '').split('@')[0]) || I18n.t('live.anonymous', { n: clientId % 90 + 10 });
    return { name: shown, seed: email || name || String(clientId) };
  }

  // Les modules de la bibliothèque de GFS, et ceux de ProseMirror que l'éditeur partage avec elle.
  async function readModules() {
    const given = Extensions.moduleNamespaces(LIBRARY);
    const names = { Y: 'yjs', protocol: 'y-protocols/awareness', yt: '@tiptap/y-tiptap' };
    const missing = Object.keys(names).filter(key => !given || !given[names[key]]).map(key => names[key]);
    if (missing.length) throw new Error(I18n.t('live.failed.modules', { names: missing.join(', ') }));
    const PM = await import('prosemirror-state');
    return { Y: given[names.Y], protocol: given[names.protocol], yt: given[names.yt], PM };
  }

  // La barre des personnes
  function buildBar(live) {
    const bar = Dom.el('div', 'live-bar');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', I18n.t('live.bar.aria'));
    const dot = Dom.el('span', 'live-bar-dot');
    dot.setAttribute('aria-hidden', 'true');
    const text = Dom.el('span', 'live-bar-text');
    text.setAttribute('role', 'status');
    const people = Dom.el('span', 'live-bar-people');
    people.setAttribute('role', 'list');
    people.setAttribute('aria-label', I18n.t('live.bar.peopleAria'));
    const stopButton = Dom.button('macro-return-btn live-bar-stop', I18n.t('live.bar.stop'));
    stopButton.setAttribute('aria-label', I18n.t('live.bar.stopAria'));
    stopButton.addEventListener('click', () => {
      if (current !== live) return;
      teardown(live);
      // La barre part avec le bouton qui avait le focus : le curseur retourne au texte, comme après un geste du menu.
      const editor = EditorCore.getEditor();
      if (editor) editor.commands.focus();
    });
    bar.append(dot, text, people, stopButton);
    const anchor = document.getElementById('linked-return-bar');
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', bar);
    else document.body.insertBefore(bar, document.body.firstChild);
    live.bar = { root: bar, text, people, signature: '', status: '' };
    refreshBar(live);
  }
  function chipOf(name, color, you) {
    const chip = Dom.el('span', 'live-chip');
    chip.setAttribute('role', 'listitem');
    chip.style.setProperty('--pp-live-color', color);
    chip.title = name;
    const dot = Dom.el('span', 'live-chip-dot');
    dot.setAttribute('aria-hidden', 'true');
    chip.append(dot, Dom.el('span', 'live-chip-name', you ? I18n.t('live.bar.you') : name));
    if (you) chip.setAttribute('aria-label', I18n.t('live.bar.youAria', { name }));
    return chip;
  }
  function barStatus(live, peers) {
    if (live.phase === 'stopping') return { key: 'stopping', text: I18n.t('live.bar.stopping') };
    if (live.phase === 'starting') return { key: 'connecting', text: I18n.t('live.bar.connecting') };
    if (live.paused) return { key: 'paused', text: I18n.t('live.bar.paused') };
    if (live.trouble) return { key: 'trouble', text: I18n.t('live.bar.trouble') };
    return peers.length ? { key: 'together', text: I18n.t('live.bar.together', { n: peers.length }) } : { key: 'alone', text: I18n.t('live.bar.alone') };
  }
  function refreshBar(live) {
    const bar = live.bar;
    if (!bar || !live.session) return;
    const peers = live.session.peers();
    const status = barStatus(live, peers);
    if (bar.status !== status.text) {
      bar.status = status.text;
      bar.text.textContent = status.text;
      bar.root.dataset.state = status.key;
    }
    const signature = [live.user.name, live.user.color].concat(peers.map(peer => peer.clientId + ':' + peer.name + ':' + peer.color)).join('|');
    if (signature === bar.signature) return;
    bar.signature = signature;
    const chips = [chipOf(live.user.name, live.user.color, true)];
    peers.slice(0, MAX_CHIPS - 1).forEach(peer => chips.push(chipOf(peer.name, peer.color, false)));
    if (peers.length > MAX_CHIPS - 1) {
      const more = Dom.el('span', 'live-chip live-chip-more', '+' + (peers.length - (MAX_CHIPS - 1)));
      more.setAttribute('role', 'listitem');
      more.title = peers.slice(MAX_CHIPS - 1).map(peer => peer.name).join(', ');
      chips.push(more);
    }
    bar.people.replaceChildren(...chips);
  }
  function removeBar(live) {
    if (live.bar && live.bar.root.parentNode) live.bar.root.remove();
    live.bar = null;
  }

  // Les événements du moteur
  function onEvent(live, type, detail) {
    if (type === 'rows') {
      live.paused = false;
      live.trouble = false;
      if (live.binding && live.binding.projectionError()) problem(live, live.binding.projectionError());
      refreshBar(live);
    } else if (type === 'write') {
      live.trouble = false;
      refreshBar(live);
    } else if (type === 'error') {
      if (LiveChannel.isInactive(detail)) live.paused = true; else live.trouble = true;
      refreshBar(live);
    } else if (type === 'saved') {
      const modified = typeof detail.modified === 'string' && /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(detail.modified) ? Number(detail.modified) : detail.modified;
      const atState = live.session.isAtState(detail.stateVector);
      if (atState) live.atSavedState = true;
      savedListeners.forEach((fn) => { try { fn({ modified, atState }); } catch (e) { console.warn('[LiveControl] abonné à l’enregistrement en échec', e); } });
    } else if (type === 'replaced') {
      lostRoom(live, detail && detail.reason);
    }
  }
  // Le salon a disparu ou a été refondé pendant que cette page dormait : le texte d'ici n'est plus celui du salon, republier le dupliquerait. Le direct s'arrête, le texte reste tel quel à l'écran.
  async function lostRoom(live, reason) {
    if (!alive(live)) return;
    await teardown(live, { fromRun: live.phase === 'starting' });
    await Dialogs.notice({ title: I18n.t('live.lost.title'), message: I18n.t(reason === 'gone' ? 'live.lost.gone' : 'live.lost.refounded'), closeLabel: I18n.t('common.close') });
  }
  // Le texte du salon ne se lit plus dans le schéma de l'éditeur (un élément d'une version plus récente du widget, par exemple) : tant que cela dure, l'éditeur refuse toute frappe.
  async function problem(live, error) {
    if (!alive(live) || live.problemShown) return;
    live.problemShown = true;
    console.warn('[LiveControl] texte du salon illisible', error);
    await teardown(live, { fromRun: live.phase === 'starting' });
    await Dialogs.notice({ title: I18n.t('live.failed.title'), message: I18n.t('live.failed.projection'), closeLabel: I18n.t('common.close') });
  }

  // Le démarrage
  async function confirmJoin() {
    const unsaved = LiveEntry.hasUnsavedEdits();
    return Dialogs.confirm({
      title: I18n.t('live.join.title'),
      message: I18n.t('live.join.message') + (unsaved ? ' ' + I18n.t('live.join.unsaved') : ''),
      confirmLabel: I18n.t('live.join.confirm'),
      danger: unsaved,
    });
  }

  function listenTo(live, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    live.offs.push(() => target.removeEventListener(type, handler, options));
  }
  // Ce que la page dit d'elle-même : visible ou non (la personne qui enregistre est choisie parmi les pages visibles), qu'elle part, que la personne revient.
  function wirePage(live) {
    const setVisible = () => {
      live.session.awareness.setLocalStateField('visible', visible());
      if (visible()) live.channel.poke(); else live.session.flushNow().catch(() => {});
    };
    listenTo(live, document, 'visibilitychange', setVisible);
    let lastPoke = 0;
    const poke = () => {
      const now = Date.now();
      if (now - lastPoke < FOCUS_POKE_MS) return;
      lastPoke = now;
      live.channel.poke();
    };
    listenTo(live, window, 'focus', poke);
    listenTo(live, document, 'pointerdown', poke, true);
    listenTo(live, document, 'keydown', poke, true);
    listenTo(live, window, 'pagehide', () => { if (live.phase === 'live') live.session.leave(); });
    const onAwareness = () => refreshBar(live);
    live.session.awareness.on('change', onAwareness);
    live.offs.push(() => { try { live.session.awareness.off('change', onAwareness); } catch (e) { /* la session est déjà détruite */ } });
    setVisible();
  }

  async function start() {
    if (current) return false;
    const editor = EditorCore.getEditor();
    const doc = Templates.getCurrentId();
    if (!editor || doc == null) return false;
    const live = { doc: String(doc), phase: 'starting', cancelled: false, paused: false, trouble: false, problemShown: false, atSavedState: false, offs: [], session: null, channel: null, binding: null, bar: null, user: null, running: null };
    current = live;
    LiveEntry.changed();
    live.running = run(live, editor);
    try {
      return await live.running;
    } catch (e) {
      console.warn('[LiveControl] démarrage en échec', e);
      const wasAlive = alive(live);
      await teardown(live, { fromRun: true });
      if (wasAlive && !GristAPI.isTablesDeclined(e)) {
        await Dialogs.notice({ title: I18n.t('live.failed.title'), message: I18n.t('live.failed.start', { reason: String((e && e.message) || e) }), closeLabel: I18n.t('common.close') });
      }
      return false;
    }
  }

  async function run(live, editor) {
    const modules = await readModules();
    if (!alive(live)) return abandon(live);
    // La table du direct : créée au premier besoin (la personne a déjà accepté les tables du widget, GristAPI.ensureTable ne le redemande pas), ses colonnes complétées si on l'a abîmée.
    await GristAPI.ensureTable(LiveChannel.TABLE_NAME, LiveSync.COLUMNS);
    if (!alive(live)) return abandon(live);
    live.channel = LiveChannel.create({
      grist: window.grist,
      tableId: LiveChannel.TABLE_NAME,
      sectionTable: () => GristAPI.getCurrentTableId() || '',
      isVisible: visible,
      hasPeers: () => !!live.session && live.session.hasPeers(),
      onError: (err) => { live.trouble = true; console.warn('[LiveControl] lecture de la table du direct en échec', err); refreshBar(live); },
      onInactive: () => { live.paused = true; refreshBar(live); },
    });
    await live.channel.prepare();
    if (!alive(live)) return abandon(live);
    // L'éditeur doit montrer le texte principal du modèle, sans suivi des modifications (ses marques ne se rejoignent pas à plusieurs, js/live-entry.js).
    Editor.exitHeaderFooterModeIfActive();
    Editor.setTrackChanges(false);
    live.session = LiveSync.createSession({
      Y: modules.Y, protocol: modules.protocol, channel: live.channel, doc: live.doc, field: FIELD, onEvent: (type, detail) => onEvent(live, type, detail),
    });
    const person = await readUser(live.session.ydoc.clientID);
    if (!alive(live)) return abandon(live);
    live.user = { name: person.name, color: pickColor(person.seed) };
    live.session.setUser(live.user);
    live.binding = LiveEditor.create({ editor, yt: modules.yt, PM: modules.PM, session: live.session, onProblem: error => problem(live, error) });
    const role = await live.session.open({ fill: draft => live.binding.fill(draft), confirmJoin });
    if (role === null || !alive(live)) return abandon(live);
    live.role = role;
    live.channel.connect(rows => live.session.receive(rows));
    // Ce qui s'écrit à l'écran pour s'accrocher au salon n'est pas une frappe (settingUp : js/main.js ne s'en sert pas pour « à enregistrer »). Le moteur démarre AVANT l'accroche : ce que la
    // bibliothèque réécrit en s'accrochant part, avec le reste.
    settingUp = true;
    try {
      live.session.start();
      live.binding.attach();
    } finally {
      settingUp = false;
    }
    if (live.binding.projectionError()) { await problem(live, live.binding.projectionError()); return false; }
    if (!alive(live)) return abandon(live);
    // Le colorier autrement quand une personne déjà là a la même couleur (c'est après le démarrage du moteur que la présence des autres est connue).
    const taken = new Set(live.session.peers().map(peer => peer.color));
    if (taken.has(live.user.color)) {
      live.user = { name: live.user.name, color: pickColor(person.seed, taken) };
      live.session.setUser(live.user);
    }
    live.phase = 'live';
    wirePage(live);
    buildBar(live);
    Editor.refreshPaginationPreview();
    // Fonder le salon avec un texte déjà enregistré (rien de tapé depuis) : l'enregistrement connu le dit tout de suite, pour que ceux qui rejoignent ne se croient pas « à enregistrer ».
    if (role === 'founder' && !LiveEntry.hasUnsavedEdits() && LiveEntry.savedDate() != null) live.session.publishSaved(live.session.saveToken(), LiveEntry.savedDate());
    // Rejoindre un salon dont le texte n'est pas celui d'un enregistrement connu (un texte tapé et pas encore enregistré, un salon laissé par une page fermée) : ce texte est « à enregistrer ».
    if (role === 'joiner' && !live.atSavedState) LiveEntry.markUnsaved();
    LiveEntry.changed();
    return true;
  }

  // L'arrêt
  // Rend l'éditeur à lui-même, tout de suite : plugins retirés, historique de ProseMirror remis, barre ôtée.
  function releaseUi(live) {
    live.offs.splice(0).forEach((off) => { try { off(); } catch (e) { console.warn('[LiveControl] écouteur non retiré', e); } });
    if (live.binding) { try { live.binding.detach(); } catch (e) { console.warn('[LiveControl] éditeur non rendu', e); } }
    removeBar(live);
  }
  // Défait une session, quelle que soit son avancée : l'éditeur est rendu avant toute attente ; ensuite on écrit ce qui n'est pas parti, on dit aux autres qu'on s'en va, et la dernière personne vide
  // le salon (le moteur le fait : un salon fondé ou rejoint qui n'a pas encore démarré démarre puis s'arrête, pour le quitter par le même chemin). Une session qui se défait pendant son démarrage
  // attend la fin de celui-ci (`fromRun` : l'appel vient du démarrage lui-même, qui ne s'attend pas).
  function teardown(live, { fromRun = false } = {}) {
    if (live.tearing) return live.tearing;
    live.cancelled = true;
    if (current === live) current = null;
    releaseUi(live);
    const starting = live.phase === 'starting';
    live.phase = 'stopping';
    LiveEntry.changed();
    live.tearing = (async () => {
      try {
        if (starting && !fromRun && live.running) await live.running.catch(() => {});
        if (live.channel) live.channel.disconnect();
        const session = live.session;
        if (session) {
          if (session.opened && !session.replaced) session.start();
          await session.stop().catch(e => console.warn('[LiveControl] arrêt du direct en échec', e));
          session.dispose();
        }
      } catch (e) {
        console.warn('[LiveControl] arrêt du direct en échec', e);
      } finally {
        live.phase = 'off';
        LiveEntry.changed();
        Editor.refreshPaginationPreview();
      }
    })();
    return live.tearing;
  }
  // Un démarrage qui n'aboutit pas (refusé, annulé, changé de modèle en route) : ce qui est déjà posé est défait. Rend faux, comme le démarrage.
  async function abandon(live) {
    await teardown(live, { fromRun: true });
    return false;
  }
  // « Arrêter » : la barre et la ligne du menu.
  function stop() { return current ? teardown(current) : Promise.resolve(); }
  // Changer de modèle : l'éditeur est rendu avant que le texte change ; l'écriture d'adieu finit seule.
  function releaseEditor() {
    if (current) teardown(current).catch(e => console.warn('[LiveControl] arrêt du direct en échec', e));
  }

  // Ce que le reste du widget demande
  // Annuler et Rétablir : par personne, par l'historique de Yjs (celui de ProseMirror est retiré tant que le direct dure).
  const undo = () => (current && current.phase === 'live' ? current.binding.undo() : false);
  const redo = () => (current && current.phase === 'live' ? current.binding.redo() : false);

  // La personne qui enregistre le modèle pour tout le monde : le numéro de client le plus bas parmi les pages visibles (à défaut, parmi toutes).
  function isScribe() {
    if (!current || current.phase !== 'live') return false;
    const awareness = current.session.awareness;
    const me = current.session.ydoc.clientID;
    let bestVisible = visible() ? me : null;
    let bestAny = me;
    awareness.getStates().forEach((remote, clientId) => {
      if (clientId === me || !remote || !remote.user) return;
      if (clientId < bestAny) bestAny = clientId;
      if (remote.visible !== false && (bestVisible === null || clientId < bestVisible)) bestVisible = clientId;
    });
    return (bestVisible === null ? bestAny : bestVisible) === me;
  }
  const saveToken = () => (current && current.phase === 'live' ? current.session.saveToken() : null);
  function publishSaved(token, modified) {
    if (current && current.phase === 'live' && token) current.session.publishSaved(token, modified);
  }
  function onSaved(fn) { savedListeners.add(fn); return () => savedListeners.delete(fn); }
  const hasPeers = () => !!current && current.phase === 'live' && current.session.hasPeers();
  const isSettingUp = () => settingUp;

  // Pour les essais : ce que la session au premier plan sait.
  function debug() {
    if (!current) return null;
    return {
      phase: current.phase, doc: current.doc, role: current.role, user: current.user, scribe: isScribe(), peers: current.session ? current.session.peers() : [],
      summary: current.session ? current.session.summary() : null, paused: current.paused, trouble: current.trouble, clientId: current.session ? current.session.ydoc.clientID : null,
    };
  }

  LiveEntry.register({ state, start, stop, releaseEditor, undo, redo, isScribe, saveToken, publishSaved, onSaved, hasPeers, isSettingUp, debug });

  return { PALETTE, state, start, stop, releaseEditor, undo, redo, isScribe, saveToken, publishSaved, onSaved, hasPeers, isSettingUp, pickColor, debug };
})();
