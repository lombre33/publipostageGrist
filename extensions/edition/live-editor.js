// L'éditeur de l'écriture en direct : branche, À CHAUD, la synchronisation de Yjs sur l'éditeur TipTap du widget, et la débranche. Le texte du modèle reste celui de l'éditeur (ProseMirror) ;
// le document Yjs (extensions/edition/live-sync.js) en est le miroir partagé : ce que l'on tape y passe, ce que les autres tapent en revient. Six plugins ProseMirror, posés d'un coup :
//  - ySyncPlugin : lie le fragment de Yjs au texte de l'éditeur (la bibliothèque de GFS : @tiptap/y-tiptap) ;
//  - yUndoPlugin : Annuler et Rétablir PAR PERSONNE (chacun ne défait que ses frappes, jamais celles des autres) - il REMPLACE l'historique de ProseMirror, retiré tant que l'écriture dure
//    (deux historiques sur le même texte se défont l'un l'autre) et remis à la fin, vide ;
//  - yCursorPlugin : le curseur, la sélection et le nom des autres, dessinés sur le texte (nom et couleur nettoyés avant d'arriver à l'écran) ;
//  - les OBJETS que les autres ont choisis (un cadre, une forme, une ligne d'une présentation : une sélection de nœud, sans texte où poser un curseur) : leur contour de la couleur de la
//    personne et son nom au coin. Sans lui, le curseur de la bibliothèque se poserait ENTRE deux blocs et décalerait le texte d'une ligne ; il est tu pour ces personnes-là (`showsCaret`) ;
//  - une touche : Ctrl/⌘+Z, Ctrl/⌘+Y et Ctrl/⌘+Maj+Z passent par Yjs - sans elle l'historique retiré laisserait le navigateur défaire le texte tout seul, hors de ProseMirror ;
//  - les marques des nœuds en ligne qui ne sont pas du texte (une bulle de variable en gras, une image dans un lien) : Yjs ne garde les marques que sur les passages de texte ; elles voyagent donc
//    dans l'attribut `ppMarks` de ces nœuds (js/editor-nodes.js:createInlineMarksCarrier), que ce plugin tient d'accord avec elles - de la marque vers l'attribut pour ce qui se tape ici, de
//    l'attribut vers la marque pour ce qui arrive d'une autre personne.
// Ce fichier ne sait rien de Grist ni de la table : il reçoit l'éditeur, la session du moteur (LiveSync) et les modules de la bibliothèque.
const LiveEditor = (function () {
  const KEYS_PLUGIN = 'pp-live-keys';
  const MARKS_PLUGIN = 'pp-live-atom-marks';
  const MARKS_ATTR = 'ppMarks';      // EditorNodes.INLINE_MARKS_ATTR (lu ici sans dépendre de l'éditeur : ce fichier ne connaît que ce que create() reçoit)
  const OBJECTS_PLUGIN = 'pp-live-objects';
  const OBJECT_FIELD = 'object';     // le champ de la présence d'une personne qui a choisi un objet : { type, pos } - le nom du nœud et sa position RELATIVE dans le texte partagé (elle suit le texte quand les autres écrivent)
  const OBJECT_NODES = ['freeFrame', 'freeLine'];   // js/free-frame.js : un cadre ou une forme, une ligne

  // Le noir ou le blanc, selon lequel se lit le mieux sur `hex` (contraste calculé comme WCAG) : le nom d'une personne reste lisible sur sa couleur, quelle qu'elle soit.
  function readableOn(hex) {
    const channel = i => parseInt(hex.slice(i, i + 2), 16) / 255;
    const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const luminance = 0.2126 * lin(channel(1)) + 0.7152 * lin(channel(3)) + 0.0722 * lin(channel(5));
    return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
  }
  // Le curseur d'une autre personne : un trait de sa couleur et son nom au-dessus. Le nom est du texte (jamais du HTML) ; la couleur passe par LiveSync.cleanColor.
  function cursorBuilder(user) {
    const color = LiveSync.cleanColor(user && user.color);
    const caret = document.createElement('span');
    caret.className = 'pp-live-caret';
    caret.style.setProperty('--pp-live-color', color);
    caret.style.setProperty('--pp-live-ink', readableOn(color));
    const label = document.createElement('div');
    label.className = 'pp-live-caret-label';
    label.textContent = LiveSync.cleanName(user && user.name) || '?';
    // Les deux « joints de mots » gardent le trait de la césure de ligne, comme celui de la bibliothèque.
    caret.append('⁠', label, '⁠');
    return caret;
  }
  function selectionBuilder(user) {
    return { class: 'pp-live-selection', style: '--pp-live-color: ' + LiveSync.cleanColor(user && user.color) };
  }
  // Le curseur d'une personne qui a choisi un objet n'est pas dessiné : la bibliothèque le poserait entre deux blocs, ce qui décalerait le texte d'une ligne. L'objet a son contour (objectsPlugin).
  const showsCaret = (own, other, state) => own !== other && !(state && state[OBJECT_FIELD]);
  // Un texte pour la propriété `content` de la feuille de style (le nom d'une personne : du texte, jamais du code).
  const cssString = text => '"' + String(text).replace(/[\\"]/g, '\\$&') + '"';

  // Les marques d'un nœud en ligne qui n'est pas du texte (et dont le type a l'attribut `ppMarks`), en JSON ; null sans marque.
  const carriesMarks = node => node.isInline && !node.isText && MARKS_ATTR in node.type.attrs;
  const marksJson = node => (node.marks.length ? JSON.stringify(node.marks.map(mark => mark.toJSON())) : null);
  // Les marques que dit un attribut ; une marque que ce schéma ne connaît pas (écrite par une version plus récente du widget) est laissée de côté.
  function marksOf(schema, json) {
    let list;
    try { list = JSON.parse(json); } catch (e) { return []; }
    if (!Array.isArray(list)) return [];
    const marks = [];
    list.forEach((item) => { try { marks.push(schema.markFromJSON(item)); } catch (e) { /* marque inconnue */ } });
    return marks.sort((a, b) => a.type.rank - b.type.rank);
  }

  // La position la plus proche de `pos` (en avant d'abord) où l'on écrit - dans du texte - dans chacun des textes donnés ; null quand il n'y en a aucune.
  function writableNear(docs, pos) {
    const size = Math.min.apply(null, docs.map(doc => doc.content.size));
    const start = Math.min(Math.max(pos, 0), size);
    const writable = at => at >= 0 && at <= size && docs.every(doc => doc.resolve(at).parent.inlineContent);
    for (let gap = 0; gap <= size; gap++) {
      for (const at of gap === 0 ? [start] : [start + gap, start - gap]) if (writable(at)) return at;
    }
    return null;
  }

  // Branche l'éditeur. `options` : editor (le TipTap du widget), yt (@tiptap/y-tiptap), PM ({ Plugin, PluginKey } de prosemirror-state, { Decoration, DecorationSet } de prosemirror-view : les copies de l'éditeur du widget), session (le moteur), onProblem(error) (le texte
  // partagé ne se lit plus dans le schéma de l'éditeur : la synchronisation s'arrête). Rend { attach, detach, undo, redo, projectionError, isAttached, fill, track, stopCapturing, beforeCapture }.
  function create(options) {
    const { editor, yt, PM, session } = options;
    let attached = false;
    let ours = [];            // les plugins posés
    let history = null;       // { plugin, index } : l'historique de ProseMirror retiré
    let manager = null;

    // Le texte de l'éditeur avec l'attribut des marques à jour sur chaque nœud en ligne qui n'est pas du texte (sans toucher à l'éditeur).
    function documentWithMarks() {
      const state = editor.state;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (!carriesMarks(node)) return;
        const json = marksJson(node);
        if (json === node.attrs[MARKS_ATTR]) return;
        // Les tailles ne changent pas : les positions lues sur le document d'origine restent celles du document qui se construit.
        try { tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { [MARKS_ATTR]: json })); } catch (e) { /* ce nœud-là garde ses marques sur place, sans attribut */ }
      });
      return tr.doc;
    }
    // Écrit le texte de l'éditeur dans le document de passage `draft` (celui qui fonde le salon) : la conversion de la bibliothèque, sans toucher à l'éditeur.
    function fill(draft) { yt.prosemirrorToYXmlFragment(documentWithMarks(), draft.getXmlFragment(session.field)); }

    function syncState() { return yt.ySyncPluginKey.getState(editor.state); }
    // Pourquoi le texte partagé ne se lit pas dans l'éditeur (null : il se lit). Tant qu'elle existe, la bibliothèque refuse toute frappe.
    function projectionError() {
      const state = attached ? syncState() : null;
      return state && state.binding ? state.binding.projectionError : null;
    }

    function undo() { return attached ? !!yt.undo(editor.state) : false; }
    function redo() { return attached ? !!yt.redo(editor.state) : false; }

    // Range dans l'historique de cette personne les gestes d'une autre table de Yjs (la page du modèle, extensions/edition/live-page.js) : ceux qu'elle écrit avec l'origine `origin` se défont et se
    // refont avec ses frappes, par le même Ctrl+Z - jamais ceux des autres. À appeler une fois l'éditeur accroché (attach). Rend vrai quand c'est fait.
    function track(ytype, origin) {
      if (!attached || !manager) return false;
      manager.addToScope(ytype);
      manager.addTrackedOrigin(origin);
      return true;
    }
    // Le prochain geste ne se range pas avec le précédent (Yjs groupe ce qui arrive à moins d'une demi-seconde l'un de l'autre).
    function stopCapturing() { if (attached && manager) manager.stopCapturing(); }
    // Appelle `fn(transaction)` juste avant que l'historique de cette personne range une écriture - du texte, un Annuler, ou un geste d'une table suivie (track) -, c'est-à-dire à l'instant où Yjs décide de la
    // grouper avec la précédente ou d'en faire un pas à elle : l'occasion de la séparer (stopCapturing). Rien n'est appelé pour ce que l'historique ne range pas (ce qui vient des autres, les écritures sans
    // changement que la bibliothèque fait à chaque mouvement du curseur). Rend de quoi retirer l'appel.
    function beforeCapture(fn) {
      if (!attached || !manager || typeof manager.captureTransaction !== 'function') return () => {};
      const target = manager;
      const original = target.captureTransaction;
      const ranges = transaction => target.scope.some(type => transaction.changedParentTypes.has(type) || type === target.doc)
        && (target.trackedOrigins.has(transaction.origin) || (!!transaction.origin && target.trackedOrigins.has(transaction.origin.constructor)));
      target.captureTransaction = (transaction) => {
        const kept = original.call(target, transaction);
        if (kept && ranges(transaction)) fn(transaction);
        return kept;
      };
      return () => { if (target.captureTransaction !== original) target.captureTransaction = original; };
    }

    function keysPlugin() {
      return new PM.Plugin({
        key: new PM.PluginKey(KEYS_PLUGIN),
        props: {
          handleKeyDown(view, event) {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
            const key = String(event.key).toLowerCase();
            if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return true; }
            if (key === 'y' && !event.shiftKey) { event.preventDefault(); redo(); return true; }
            return false;
          },
        },
      });
    }

    // Une transaction venue de Yjs (une autre personne, le rendu du salon à l'accroche, un Annuler) : la marque du plugin de synchronisation.
    function isRemote(transaction) {
      const meta = transaction.getMeta(yt.ySyncPluginKey);
      return !!(meta && meta.isChangeOrigin);
    }
    function marksPlugin() {
      return new PM.Plugin({
        key: new PM.PluginKey(MARKS_PLUGIN),
        // Ce qui vient de Yjs n'est pas une frappe : le lien automatique de TipTap (qui lie tout texte qui ressemble à une adresse dès que le document change) ne doit pas lier ce que personne n'a lié.
        // Posé ici, avant que les plugins ne voient la transaction : filterTransaction passe en premier.
        filterTransaction(transaction) {
          if (isRemote(transaction)) transaction.setMeta('preventAutolink', true);
          return true;
        },
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some(transaction => transaction.docChanged)) return null;
          const remote = transactions.some(isRemote);
          const tr = newState.tr;
          newState.doc.descendants((node, pos) => {
            if (!carriesMarks(node)) return;
            const json = marksJson(node);
            const stored = node.attrs[MARKS_ATTR];
            if (json === stored) return;
            try {
              if (remote) tr.setNodeMarkup(pos, undefined, node.attrs, stored ? marksOf(newState.schema, stored) : []);
              else tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { [MARKS_ATTR]: json }), node.marks);
            } catch (e) { /* des marques que ce nœud n'accepte pas ici : il reste comme il est */ }
          });
          if (!tr.docChanged) return null;
          // Ce qui revient de Yjs n'est pas une frappe d'ici : ni historique de plus, ni écho vers les autres.
          if (remote) tr.setMeta(yt.ySyncPluginKey, { isChangeOrigin: true }).setMeta('addToHistory', false).setMeta('preventAutolink', true);
          return tr;
        },
      });
    }

    // Les objets choisis par les AUTRES (leur présence porte `object`) : chacun reçoit la classe `pp-live-object` et, en propriétés de la feuille de style, la couleur de la personne et son nom
    // (live.css dessine le contour et le nom au coin). Plusieurs personnes sur le même objet : leurs noms l'un après l'autre, la couleur de la première. L'objet que la personne choisit ICI part
    // dans sa présence. Un objet qui a disparu, ou qui n'est plus de la sorte annoncée, ne se dessine pas.
    function objectsPlugin() {
      const key = new PM.PluginKey(OBJECTS_PLUGIN);
      const { Decoration, DecorationSet } = PM;
      const awareness = session.awareness;
      const own = session.ydoc.clientID;

      // L'objet que dit la présence `remote` : { pos, node }, ou null.
      function resolve(state, sync, remote) {
        const given = remote && remote[OBJECT_FIELD];
        if (!given || OBJECT_NODES.indexOf(given.type) === -1 || !given.pos || typeof given.pos !== 'object') return null;
        try {
          const pos = yt.relativePositionToAbsolutePosition(sync.doc, sync.type, session.Y.createRelativePositionFromJSON(given.pos), sync.binding.mapping);
          const node = pos == null || pos < 0 || pos > state.doc.content.size ? null : state.doc.nodeAt(pos);
          return node && node.type.name === given.type ? { pos, node } : null;
        } catch (e) { return null; }
      }
      function build(state) {
        const sync = yt.ySyncPluginKey.getState(state);
        if (!sync || !sync.doc || !sync.binding || sync.snapshot != null || sync.prevSnapshot != null || sync.binding.mapping.size === 0) return DecorationSet.empty;
        const chosen = new Map();     // position -> { node, color, names }
        awareness.getStates().forEach((remote, clientId) => {
          if (clientId === own) return;
          const found = resolve(state, sync, remote);
          if (!found) return;
          const user = remote.user || {};
          const name = LiveSync.cleanName(user.name) || '?';
          const entry = chosen.get(found.pos);
          if (entry) entry.names.push(name);
          else chosen.set(found.pos, { node: found.node, color: LiveSync.cleanColor(user.color), names: [name] });
        });
        const decorations = [];
        chosen.forEach((entry, pos) => {
          const style = '--pp-live-color: ' + entry.color + '; --pp-live-ink: ' + readableOn(entry.color) + '; --pp-live-name: ' + cssString(entry.names.join(', '));
          decorations.push(Decoration.node(pos, pos + entry.node.nodeSize, { class: 'pp-live-object', style }));
        });
        return DecorationSet.create(state.doc, decorations);
      }
      // Ce que les autres ont choisi, en une ligne : la page ne se redessine que lorsqu'elle change.
      function signature() {
        const parts = [];
        awareness.getStates().forEach((remote, clientId) => {
          if (clientId !== own && remote && remote[OBJECT_FIELD]) parts.push(clientId + ':' + JSON.stringify(remote[OBJECT_FIELD]) + ':' + JSON.stringify(remote.user || null));
        });
        return parts.join('|');
      }
      // L'objet choisi ICI, dans la présence de la personne : il suit la sélection de nœud d'un cadre ou d'une ligne, rien d'autre.
      function publish(view) {
        const sync = yt.ySyncPluginKey.getState(view.state);
        if (!sync || !sync.binding || sync.binding.projectionError !== null) return;
        const selected = view.state.selection.node;
        const mine = (awareness.getLocalState() || {})[OBJECT_FIELD];
        if (!selected || OBJECT_NODES.indexOf(selected.type.name) === -1) {
          if (mine != null) awareness.setLocalStateField(OBJECT_FIELD, null);
          return;
        }
        try {
          const pos = yt.absolutePositionToRelativePosition(view.state.selection.from, sync.type, sync.binding.mapping);
          if (!mine || mine.type !== selected.type.name || JSON.stringify(mine.pos) !== JSON.stringify(pos)) awareness.setLocalStateField(OBJECT_FIELD, { type: selected.type.name, pos });
        } catch (e) { /* une position que la bibliothèque ne sait pas dire : l'objet reste sans contour chez les autres */ }
      }

      return new PM.Plugin({
        key,
        state: {
          init: (_config, state) => build(state),
          apply(transaction, set, _old, state) {
            const meta = transaction.getMeta(key);
            if (isRemote(transaction) || (meta && meta.awarenessUpdated)) return build(state);
            return transaction.docChanged ? set.map(transaction.mapping, transaction.doc) : set;
          },
        },
        props: { decorations: state => key.getState(state) },
        view(view) {
          let seen = signature();
          const onChange = () => {
            const now = signature();
            if (now === seen || view.isDestroyed) return;
            seen = now;
            view.dispatch(view.state.tr.setMeta(key, { awarenessUpdated: true }));
          };
          awareness.on('change', onChange);
          return {
            update: publish,
            destroy() { awareness.off('change', onChange); awareness.setLocalStateField(OBJECT_FIELD, null); },
          };
        },
      });
    }

    function reconfigure(plugins) {
      editor.view.updateState(editor.state.reconfigure({ plugins }));
    }

    // En dessinant le texte du salon, la bibliothèque remet le curseur au MÊME numéro de position que dans le texte d'avant. Quand cet endroit n'est pas dans du texte du salon (un cadre de plus en
    // tête, une liste, une diapositive de plus), le curseur reste là où rien ne s'écrit : ProseMirror s'en plaint dans la console et les autres voient un curseur entre deux blocs. On le pose donc
    // d'abord à l'endroit le plus proche qui est dans du texte dans les DEUX textes (celui de l'éditeur et celui du salon, lu sans toucher à Yjs).
    function settleCursor(fragment) {
      try {
        const shared = yt.initProseMirrorDoc(fragment, editor.schema).doc;
        const selection = editor.state.selection;
        const docs = [editor.state.doc, shared];
        const from = writableNear(docs, selection.from);
        const to = selection.to === selection.from ? from : writableNear(docs, selection.to);
        if (from === null || to === null) return;
        const inText = selection.$from.parent.inlineContent && selection.$to.parent.inlineContent;
        if (inText && from === selection.from && to === selection.to) return;
        editor.commands.setTextSelection({ from, to });
      } catch (e) { /* le texte du salon ne se lit pas dans le schéma : attach() le signale */ }
    }

    // Pose les plugins. Le fragment de Yjs doit déjà porter le texte du salon (le moteur l'a rempli en fondant ou en rejoignant) : en s'accrochant, la bibliothèque dessine ce texte dans
    // l'éditeur, qui devient celui du salon.
    function attach() {
      if (attached) return;
      const plugins = editor.state.plugins;
      const at = plugins.findIndex(plugin => plugin.key === 'history$');
      history = at === -1 ? null : { plugin: plugins[at], index: at };
      const fragment = session.ydoc.getXmlFragment(session.field);
      settleCursor(fragment);
      ours = [
        yt.ySyncPlugin(fragment),
        yt.yUndoPlugin(),
        yt.yCursorPlugin(session.awareness, { awarenessStateFilter: showsCaret, cursorBuilder, selectionBuilder }),
        objectsPlugin(),
        keysPlugin(),
        marksPlugin(),
      ];
      reconfigure(plugins.filter(plugin => plugin !== (history && history.plugin)).concat(ours));
      attached = true;
      // Ce qui a servi à s'accrocher n'est pas une frappe : rien à défaire.
      manager = yt.yUndoPluginKey.getState(editor.state).undoManager;
      manager.clear();
      const problem = projectionError();
      if (problem && options.onProblem) options.onProblem(problem);
      // Le texte du salon n'a pas pu se lire d'avance (projectionError) ou n'a aucun endroit en commun avec le nôtre : le curseur, s'il est là où rien ne s'écrit, va à l'endroit le plus proche où l'on écrit.
      try {
        const selection = editor.state.selection;
        if (!selection.$from.parent.inlineContent || !selection.$to.parent.inlineContent) {
          const from = writableNear([editor.state.doc], selection.from);
          const to = selection.to === selection.from ? from : writableNear([editor.state.doc], selection.to);
          if (from !== null && to !== null) editor.commands.setTextSelection({ from, to });
        }
      } catch (e) { /* le curseur reste où la bibliothèque l'a mis */ }
    }

    // Retire les plugins et rend l'historique de ProseMirror, VIDE : le texte reste tel qu'il est à l'écran.
    function detach() {
      if (!attached) return;
      attached = false;
      const kept = editor.state.plugins.filter(plugin => ours.indexOf(plugin) === -1);
      if (history) kept.splice(Math.min(history.index, kept.length), 0, history.plugin);
      try { reconfigure(kept); } catch (e) { console.warn('[LiveEditor] plugins non retirés', e); }
      ours = [];
      history = null;
      manager = null;
    }

    return { attach, detach, undo, redo, fill, track, stopCapturing, beforeCapture, projectionError, isAttached: () => attached };
  }

  return { create, cursorBuilder, selectionBuilder, readableOn, showsCaret };
})();
