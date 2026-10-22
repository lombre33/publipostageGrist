// Ce qui n'est pas du texte dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, boutons de la barre).
//
// L'historique de l'éditeur (prosemirror-history) ne garde que ce qui change le document. La page - format, sens, marges, filigrane, couleurs du modèle - vit dans PageLayout (le brouillon de la colonne Margins), hors du document :
// Ctrl + Z la laissait telle quelle et défaisait le dernier mot tapé avant elle. Ce module l'y range. Un geste de la page laisse dans l'historique un repère : un pas qui ne change pas le document et garde la page d'avant et celle d'après
// (HistoryStep). Annuler applique l'inverse du pas, qui échange les deux pages ; Rétablir, l'inverse de l'inverse. Un observateur de transactions (createExtension) rend alors à la page celle que le pas porte, d'où que vienne l'ordre
// (clavier, bouton de la barre, menu Édition du navigateur). Les repères sont rangés dans l'ordre des gestes, entre les frappes, et suivent les règles de l'historique : un geste neuf efface ce qui se rétablissait, la profondeur est
// celle du texte (100 événements).
//
// Un domaine est un état hors du texte : `read()` en prend une copie, `write(next, prev)` rend à l'état `next` ce que le geste a changé (`prev` : l'état d'avant ce retour, pour ne toucher que ce que le geste a touché). Un seul pour
// l'instant, « page ». Un geste se pose ainsi : `HistoryMarkers.track('page', () => ...)`, ou `begin()` puis `commit()` quand il s'étire (les chiffres d'une marge tapés au clavier). Le repère n'est posé que si l'état a changé.
//
// Limites : l'écriture en direct (js/live-entry.js) a son propre Annuler, qui ne connaît pas les repères ; l'en-tête et le pied de page ont chacun l'historique de leur texte (js/header-footer-preview.js), un repère posé pendant qu'on
// en écrit un se défait dans cette zone.
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
        console.warn('[HistoryMarkers] la page ne se laisse pas rendre', error);
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

  // Le début d'un geste : l'état d'avant, pris tout de suite. `commit()` pose le repère à la fin.
  function begin(domain) {
    const editor = editorOf();
    const gesture = {
      before: domains[domain].read(),
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

  function isReady() { return !!stepClass; }

  return { createExtension, begin, track, reset, isReady };
})();
