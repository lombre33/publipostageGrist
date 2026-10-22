// Ce qui n'est pas du texte dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, boutons de la barre).
//
// L'historique de l'éditeur (prosemirror-history) ne garde que ce qui change le document. La page - format, sens, marges, filigrane, couleurs du modèle - vit dans PageLayout (le brouillon de la colonne Margins), hors du document :
// Ctrl + Z la laissait telle quelle et défaisait le dernier mot tapé avant elle. Ce module l'y range. Un geste de la page laisse dans l'historique un repère : un pas qui ne change pas le document et garde la page d'avant et celle d'après
// (HistoryStep). Annuler applique l'inverse du pas, qui échange les deux pages ; Rétablir, l'inverse de l'inverse. Un observateur de transactions (createExtension) rend alors à la page celle que le pas porte, d'où que vienne l'ordre
// (clavier, bouton de la barre, menu Édition du navigateur). Les repères sont rangés dans l'ordre des gestes, entre les frappes, et suivent les règles de l'historique : un geste neuf efface ce qui se rétablissait, la profondeur est
// celle du texte (100 événements).
//
// Un domaine est un état hors du texte : `read()` en prend une copie, `write(next, prev)` rend à l'état `next` ce que le geste a changé (`prev` : l'état d'avant ce retour, pour ne toucher que ce que le geste a touché). Trois
// pour l'instant, « page », « headerFooter » (une séance d'écriture dans l'en-tête ou le pied) et « macro » (la composition d'un macro-modèle). Un geste se pose ainsi : `HistoryMarkers.track('page', () => ...)`, ou `begin()` puis `commit()` quand il s'étire (les chiffres
// d'une marge tapés au clavier, une séance d'en-tête). Le repère n'est posé que si l'état a changé.
//
// Limites : l'écriture en direct (js/live-entry.js) a son propre Annuler, qui ne connaît pas les repères ; pendant qu'on écrit un en-tête ou un pied, Ctrl + Z défait la frappe de la zone (chaque zone a l'historique de son
// texte, js/header-footer-preview.js) et la séance entière se défait d'un bloc une fois « Terminer » cliqué.
const HistoryMarkers = (function () {
  const STEP_ID = 'ppHistoryMarker';
  // La transaction qui pose un repère : l'observateur ne la rejoue pas, la page est déjà dans l'état qu'elle décrit.
  const RECORD_META = 'ppHistoryMarkerRecorded';

  // Charger un modèle vide l'historique (Editor.setHTML) et change de génération avec lui : un repère d'un modèle d'avant ne rend jamais sa page à celui d'après, même s'il avait échappé au vidage.
  let generation = 0;
  let stepClass = null;
  let undoDepth = () => 0;
  // Vrai le temps qu'un Annuler ou un Rétablir rend sa page : les gestes qu'il provoque (une mise en page qui se refait) ne posent pas de repère.
  let restoring = false;

  const domains = {
    page: {
      read: () => PageLayout.snapshot(),
      write(next, prev) {
        if (!PageLayout.restore(next, prev)) return;
        Editor.refreshLayout();
        // Comme le menu Page et l'onglet Marges : sans cet événement le modèle n'était pas marqué modifié, et l'enregistrement automatique ne rendait pas la page défaite.
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      },
    },
    // Une séance d'écriture dans l'en-tête ou le pied (js/header-footer-preview.js : de la première zone ouverte à « Terminer ») : le texte des zones et les cases de leur pastille, plus la page - un geste de la page fait
    // pendant la séance est rangé dans l'historique de la zone, introuvable depuis le document ; la séance le rend avec le reste.
    headerFooter: {
      read: () => ({ zones: HeaderFooterPreview.snapshot(), page: PageLayout.snapshot() }),
      write(next, prev) {
        const zones = HeaderFooterPreview.restore(next.zones, prev.zones);
        const page = PageLayout.restore(next.page, prev.page);
        if (!zones && !page) return;
        Editor.refreshLayout();
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      },
    },
    // La composition du macro-modèle dont le résumé est à l'écran (js/macro-editor.js) : l'œil d'un modèle du résumé et l'« Enregistrer » de sa fenêtre de composition, qui l'écrivent dans sa ligne. Annuler et Rétablir l'y
    // réécrivent de même.
    macro: {
      read: () => MacroEditor.snapshot(),
      write(next) { MacroEditor.restore(next); },
    },
  };

  const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function editorOf() {
    const editor = EditorCore.getEditor();
    return editor && !editor.isDestroyed ? editor : null;
  }

  // Le pas d'un repère. Construit à la création de l'éditeur : la classe Step vient de prosemirror-transform, chargé par import() comme le reste de ProseMirror.
  function defineStep({ Step, StepResult, StepMap }) {
    class HistoryStep extends Step {
      constructor(domain, before, after, born) {
        super();
        this.domain = domain;
        this.before = before;
        this.after = after;
        this.generation = born;
      }
      // Le document ne change pas, et aucune position avec lui : le pas se range dans l'historique sans toucher à ce que les autres pas visent.
      apply(doc) { return StepResult.ok(doc); }
      getMap() { return StepMap.empty; }
      map() { return this; }
      // L'inverse échange les deux pages : c'est lui que l'historique garde, et que Annuler applique.
      invert() { return new HistoryStep(this.domain, this.after, this.before, this.generation); }
      toJSON() { return { stepType: STEP_ID, domain: this.domain, before: this.before, after: this.after, generation: this.generation }; }
      static fromJSON(schema, json) { return new HistoryStep(json.domain, json.before, json.after, json.generation); }
    }
    Step.jsonID(STEP_ID, HistoryStep);
    return HistoryStep;
  }

  // Annuler et Rétablir rendent leurs pas dans une transaction : chaque repère qu'elle porte rend sa page au domaine, dans l'ordre.
  function replay(tr) {
    if (!stepClass || !tr.steps.length || tr.getMeta(RECORD_META)) return;
    tr.steps.forEach(step => {
      if (!(step instanceof stepClass) || step.generation !== generation) return;
      const domain = domains[step.domain];
      if (!domain) return;
      restoring = true;
      try {
        domain.write(step.after, step.before);
      } catch (error) {
        console.warn('[HistoryMarkers] le repère « ' + step.domain + ' » ne se laisse pas rendre', error);
      } finally {
        restoring = false;
      }
    });
  }

  function createExtension(Extension, libs) {
    if (!stepClass) stepClass = defineStep(libs);
    if (libs.undoDepth) undoDepth = libs.undoDepth;
    return Extension.create({
      name: 'historyMarkers',
      onTransaction({ transaction, appendedTransactions }) {
        replay(transaction);
        (appendedTransactions || []).forEach(replay);
      },
    });
  }

  // Pose le repère d'un geste fini, si l'état a changé. Un geste qui a aussi écrit dans le texte (les sauts de page d'une page tournée) a ouvert un événement de l'historique : son repère s'y range, un seul Ctrl + Z défait
  // les deux (`alone` : pas de rangement, pour un geste qui n'a rien écrit dans le texte - les chiffres d'une marge). Rend vrai si un repère a été posé.
  function conclude(domain, gesture, options) {
    if (gesture.done) return false;
    gesture.done = true;
    const editor = editorOf();
    if (!editor || !stepClass || restoring || gesture.generation !== generation) return false;
    const after = domains[domain].read();
    if (sameState(gesture.before, after)) return false;
    const { state } = editor;
    // Un pas efface les marques en attente (le gras choisi sans texte sélectionné) : elles sont remises.
    const tr = state.tr.step(new stepClass(domain, gesture.before, after, generation));
    tr.setMeta(RECORD_META, true).setMeta('preventUpdate', true);
    if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
    if (!(options && options.alone) && undoDepth(state) !== gesture.depth) tr.setMeta('appendedTransaction', state.tr);
    // Le repère n'est pas une modification de la personne : le suivi des modifications ne le compte pas.
    TrackChanges.skipTracking(tr);
    editor.view.dispatch(tr);
    return true;
  }

  // Le début d'un geste : l'état d'avant, pris tout de suite. `commit()` pose le repère à la fin. `before` : l'état pris plus tôt, quand le geste a rechargé le modèle entre-temps (l'« Enregistrer » de la fenêtre d'un
  // macro-modèle le recharge, ce qui change de génération) : le geste commence alors après le rechargement, avec l'état d'avant celui-ci.
  function begin(domain, before) {
    const editor = editorOf();
    const gesture = {
      before: before === undefined ? domains[domain].read() : before,
      depth: editor ? undoDepth(editor.state) : 0,
      generation,
      done: false,
      commit(options) { return conclude(domain, gesture, options); },
    };
    return gesture;
  }

  // Un geste d'un seul temps : `change` le fait, son repère est posé ensuite. Rend ce que rend `change`.
  function track(domain, change) {
    const gesture = begin(domain);
    try {
      return change();
    } finally {
      gesture.commit();
    }
  }

  // Un nouveau modèle, un nouvel historique (Editor.setHTML).
  function reset() { generation += 1; }

  // L'historique de l'éditeur mis de côté pour être rendu après un rechargement qui ne change rien à son texte : la fenêtre de composition d'un macro-modèle enregistre, puis js/main.js recharge ce même macro-modèle (Editor.setHTML vide
  // l'historique), alors que son éditeur reste vide et que les repères de sa page et de ses yeux disent toujours vrai. `keep()` le prend, `resume(kept)` le remet.
  const historyPlugin = () => { const editor = editorOf(); return (editor && editor.state.plugins.find(plugin => plugin.key === 'history$')) || null; };
  function keep() {
    const editor = editorOf();
    const plugin = historyPlugin();
    return editor && plugin ? { history: plugin.getState(editor.state), generation } : null;
  }
  function resume(kept) {
    const editor = editorOf();
    const plugin = historyPlugin();
    if (!kept || !editor || !plugin) return;
    // La même transaction que prosemirror-history envoie à la fin d'un Annuler : elle remplace l'état du plugin, sans toucher au document.
    editor.view.dispatch(editor.state.tr.setMeta(plugin, { redo: false, historyState: kept.history }).setMeta('addToHistory', false).setMeta('preventUpdate', true));
    generation = kept.generation;
  }

  function isReady() { return !!stepClass; }

  return { createExtension, begin, track, reset, keep, resume, isReady };
})();
