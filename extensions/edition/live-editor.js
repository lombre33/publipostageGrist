// L'éditeur de l'écriture en direct : branche, À CHAUD, la synchronisation de Yjs sur l'éditeur TipTap du widget, et la débranche. Le texte du modèle reste celui de l'éditeur (ProseMirror) ;
// le document Yjs (extensions/edition/live-sync.js) en est le miroir partagé : ce que l'on tape y passe, ce que les autres tapent en revient. Cinq plugins ProseMirror, posés d'un coup :
//  - ySyncPlugin : lie le fragment de Yjs au texte de l'éditeur (la bibliothèque de GFS : @tiptap/y-tiptap) ;
//  - yUndoPlugin : Annuler et Rétablir PAR PERSONNE (chacun ne défait que ses frappes, jamais celles des autres) - il REMPLACE l'historique de ProseMirror, retiré tant que l'écriture dure
//    (deux historiques sur le même texte se défont l'un l'autre) et remis à la fin, vide ;
//  - yCursorPlugin : le curseur, la sélection et le nom des autres, dessinés sur le texte (nom et couleur nettoyés avant d'arriver à l'écran) ;
//  - une touche : Ctrl/⌘+Z, Ctrl/⌘+Y et Ctrl/⌘+Maj+Z passent par Yjs - sans elle l'historique retiré laisserait le navigateur défaire le texte tout seul, hors de ProseMirror ;
//  - les marques des nœuds en ligne qui ne sont pas du texte (une bulle de variable en gras, une image dans un lien) : Yjs ne garde les marques que sur les passages de texte ; elles voyagent donc
//    dans l'attribut `ppMarks` de ces nœuds (js/editor-nodes.js:createInlineMarksCarrier), que ce plugin tient d'accord avec elles - de la marque vers l'attribut pour ce qui se tape ici, de
//    l'attribut vers la marque pour ce qui arrive d'une autre personne.
// Ce fichier ne sait rien de Grist ni de la table : il reçoit l'éditeur, la session du moteur (LiveSync) et les modules de la bibliothèque.
const LiveEditor = (function () {
  const KEYS_PLUGIN = 'pp-live-keys';
  const MARKS_PLUGIN = 'pp-live-atom-marks';
  const MARKS_ATTR = 'ppMarks';      // EditorNodes.INLINE_MARKS_ATTR (lu ici sans dépendre de l'éditeur : ce fichier ne connaît que ce que create() reçoit)

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

  // Branche l'éditeur. `options` : editor (le TipTap du widget), yt (@tiptap/y-tiptap), PM ({ Plugin, PluginKey } de prosemirror-state), session (le moteur), onProblem(error) (le texte
  // partagé ne se lit plus dans le schéma de l'éditeur : la synchronisation s'arrête). Rend { attach, detach, undo, redo, projectionError, isAttached, fill }.
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

    function reconfigure(plugins) {
      editor.view.updateState(editor.state.reconfigure({ plugins }));
    }

    // Pose les plugins. Le fragment de Yjs doit déjà porter le texte du salon (le moteur l'a rempli en fondant ou en rejoignant) : en s'accrochant, la bibliothèque dessine ce texte dans
    // l'éditeur, qui devient celui du salon.
    function attach() {
      if (attached) return;
      const plugins = editor.state.plugins;
      const at = plugins.findIndex(plugin => plugin.key === 'history$');
      history = at === -1 ? null : { plugin: plugins[at], index: at };
      const selection = editor.state.selection;
      const fragment = session.ydoc.getXmlFragment(session.field);
      ours = [
        yt.ySyncPlugin(fragment),
        yt.yUndoPlugin(),
        yt.yCursorPlugin(session.awareness, { cursorBuilder, selectionBuilder }),
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
      // Le curseur reste où il était, quand l'endroit existe encore dans le texte du salon.
      try {
        const size = editor.state.doc.content.size;
        if (selection && selection.from <= size && selection.to <= size) editor.commands.setTextSelection({ from: selection.from, to: selection.to });
      } catch (e) { /* le texte du salon n'a pas cet endroit : le curseur reste où la bibliothèque l'a mis */ }
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

    return { attach, detach, undo, redo, fill, projectionError, isAttached: () => attached };
  }

  return { create, cursorBuilder, selectionBuilder, readableOn };
})();
