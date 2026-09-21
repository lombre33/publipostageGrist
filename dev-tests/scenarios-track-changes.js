// Suite "trackChanges" - suivi des modifications façon Word/Google Docs, intégration réelle de js/track-changes.js dans js/editor.js/js/main.js/
// js/templates.js (planning/feature-track-changes.md). Le moteur lui-même (extensions ProseMirror, transformToSuggestionTransaction, bug de perf O(N²)
// mitigé par chunking...) a déjà 27 scénarios verts dans le prototype isolé (prototypes/test-suivi-modifications.mjs) - cette suite-ci vérifie seulement
// les POINTS D'INTÉGRATION dans l'app réelle : le vrai bouton de la barre, le vrai <ins>/<del> rendu à l'écran (pas seulement dans le HTML), le vrai
// aller-retour par la table Grist (SuiviModifications, même UpdateRecord que Contenu), et l'exclusion des macro-modèles. Une suppression/insertion de
// BLOC ENTIER (pas seulement de texte inline) n'est volontairement pas reproduite ici : ce cas (et le contournement `runGuardedLibCommand` du bug de la
// librairie sur le dernier nœud du document) est déjà couvert par le prototype, qui teste le moteur en isolation.
//
// Comme scenarios-comments.js, deux moitiés à vérifier à chaque scénario qui touche à la persistance : l'ANCRAGE (marques <ins>/<del>/<span data-type=
// "modification">) vit DANS le document (Editor.getHTML()), et l'AUTEUR/L'HORODATAGE vivent dans la colonne Grist SuiviModifications - un id present
// dans l'un mais pas l'autre serait exactement le genre d'incohérence que ces tests doivent attraper.
//
// Le mode suivi est un bouton GLOBAL (isSuggestChangesEnabled sur le plugin ProseMirror), jamais remis à zéro par TestHelpers.resetEditor() ni par un
// changement de modèle (Editor.setHTML -> loadTrackedDocument ne touche jamais l'état du plugin) - chaque scénario qui l'active le désactive donc
// explicitement à la fin (disableTrackChangesIfOn), pour ne jamais laisser le mode suivi fuiter sur le scénario suivant.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;

  const toggleBtn = () => document.getElementById('v2-btn-track-changes');
  const acceptBtn = () => document.getElementById('v2-btn-accept-all');
  const rejectBtn = () => document.getElementById('v2-btn-reject-all');

  async function enableTrackChanges(h) {
    if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
  }
  async function disableTrackChangesIfOn(h) {
    if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
  }

  // Sélectionne exactement la sous-chaîne `text` (première occurrence) dans `container`, via le premier nœud texte qui la contient - sélectionner un
  // ÉLÉMENT entier (cf. TestHelpers.selectAllInElement) ne suffit pas ici : on veut marquer UNE portion précise, pas tout le paragraphe.
  function selectSubstring(container, text) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(text);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    return false;
  }

  // Construit un document avec UNE insertion (texte tapé en fin de paragraphe) ET UNE suppression (portion du texte existant) en attente, pour les
  // scénarios "tout accepter"/"tout refuser" qui doivent distinguer les deux traitements.
  async function markInsertionAndDeletion(h) {
    Editor.setHTML('<p>Garder ceci, retirer cela, fin.</p>');
    await h.focusAtEnd();
    await h.typeText(' Ajout suivi.');
    if (!selectSubstring(document.querySelector('.tiptap p'), 'retirer cela')) {
      throw new Error('texte à supprimer introuvable - scénario mal construit');
    }
    await h.sleep(30);
    document.execCommand('delete');
    await h.sleep(60);
  }

  cases.push({
    id: 'trackchanges_toggle_button_reflects_state_and_render',
    description: 'Le bouton "Suivi des modifications" bascule Editor.isTrackChangesOn() ET son propre rendu (classe .is-active + fond réellement changé), pas juste un état interne',
    run: async (h) => {
      await h.resetEditor();
      await disableTrackChangesIfOn(h);
      const bgOff = getComputedStyle(toggleBtn()).backgroundColor;
      await h.clickButton('v2-btn-track-changes');
      const onNow = Editor.isTrackChangesOn();
      const activeNow = toggleBtn().classList.contains('is-active');
      const bgOn = getComputedStyle(toggleBtn()).backgroundColor;
      await h.clickButton('v2-btn-track-changes');
      const offAgain = !Editor.isTrackChangesOn();
      const inactiveAgain = !toggleBtn().classList.contains('is-active');
      return {
        pass: onNow && activeNow && bgOn !== bgOff && offAgain && inactiveAgain,
        notes: 'on=' + onNow + ' active=' + activeNow + ' bgOff=' + bgOff + ' bgOn=' + bgOn + ' offAgain=' + offAgain + ' inactiveAgain=' + inactiveAgain,
      };
    },
  });

  cases.push({
    id: 'trackchanges_typing_marks_insertion_rendered',
    description: 'Suivi actif : taper du texte l\'entoure d\'une marque <ins> dans le HTML, réellement rendue (fond visible) dans l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Texte existant.</p>');
      await h.focusAtEnd();
      await h.typeText(' Ajout suivi.');
      const html = Editor.getHTML();
      const insEl = document.querySelector('.tiptap ins[data-id]');
      const hasIns = html.indexOf('<ins') !== -1 && html.indexOf('Ajout suivi.') !== -1;
      const rendered = !!insEl && getComputedStyle(insEl).backgroundColor !== 'rgba(0, 0, 0, 0)';
      const pending = Editor.hasPendingTrackedChanges();
      await disableTrackChangesIfOn(h);
      return {
        pass: hasIns && rendered && pending,
        notes: 'html contient <ins>=' + hasIns + ', fond visible=' + rendered + ', pending=' + pending,
      };
    },
  });

  cases.push({
    id: 'trackchanges_deleting_marks_deletion_rendered',
    description: 'Suivi actif : supprimer du texte le garde dans le document sous <del> (jamais retiré tout de suite), rendu réellement barré à l\'écran',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Phrase à supprimer entièrement.</p>');
      await h.selectAllInElement(document.querySelector('.tiptap p'));
      document.execCommand('delete');
      await h.sleep(60);
      const html = Editor.getHTML();
      const delEl = document.querySelector('.tiptap del[data-id]');
      const textStillThere = html.indexOf('supprimer entièrement') !== -1;
      const struck = !!delEl && getComputedStyle(delEl).textDecorationLine.indexOf('line-through') !== -1;
      const pending = Editor.hasPendingTrackedChanges();
      await disableTrackChangesIfOn(h);
      return {
        pass: textStillThere && struck && pending,
        notes: 'texte conservé=' + textStillThere + ', <del> rendu barré=' + struck + ', pending=' + pending,
      };
    },
  });

  cases.push({
    id: 'trackchanges_accept_reject_buttons_disabled_until_pending',
    description: '"Tout accepter"/"Tout refuser" restent visibles mais grisés (jamais masqués, règle d\'Antoine) sans suggestion en attente, et se réactivent dès qu\'une suggestion existe',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Rien à traiter.</p>');
      await h.sleep(60);
      const bothPresent = !!acceptBtn() && !!rejectBtn();
      const disabledClean = acceptBtn().disabled && rejectBtn().disabled;
      const opacityClean = getComputedStyle(acceptBtn()).opacity;
      await h.focusAtEnd();
      await h.typeText(' ajout.');
      const enabledAfter = !acceptBtn().disabled && !rejectBtn().disabled;
      const opacityAfter = getComputedStyle(acceptBtn()).opacity;
      await disableTrackChangesIfOn(h);
      return {
        pass: bothPresent && disabledClean && enabledAfter && Number(opacityClean) < Number(opacityAfter),
        notes: 'présents=' + bothPresent + ' disabledClean=' + disabledClean + ' opacityClean=' + opacityClean + ' enabledAfter=' + enabledAfter + ' opacityAfter=' + opacityAfter,
      };
    },
  });

  cases.push({
    id: 'trackchanges_accept_all_keeps_insertion_removes_deletion',
    description: '"Tout accepter" (bouton réel, commande découpée en tranches) garde le texte inséré et retire vraiment le texte supprimé, sans toucher au reste',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      await markInsertionAndDeletion(h);
      await h.clickButton('v2-btn-accept-all');
      await h.sleep(150);
      const html = Editor.getHTML();
      const noMarksLeft = !Editor.hasPendingTrackedChanges() && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
      const insertionKept = html.indexOf('Ajout suivi.') !== -1;
      const deletionGone = html.indexOf('retirer cela') === -1;
      const otherTextIntact = html.indexOf('Garder ceci') !== -1 && html.indexOf('fin.') !== -1;
      await disableTrackChangesIfOn(h);
      return {
        pass: noMarksLeft && insertionKept && deletionGone && otherTextIntact,
        notes: 'html final=' + html,
      };
    },
  });

  cases.push({
    id: 'trackchanges_reject_all_removes_insertion_restores_deletion',
    description: '"Tout refuser" retire le texte inséré et restaure le texte supprimé, sans marque restante',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      await markInsertionAndDeletion(h);
      await h.clickButton('v2-btn-reject-all');
      await h.sleep(150);
      const html = Editor.getHTML();
      const noMarksLeft = !Editor.hasPendingTrackedChanges() && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
      const insertionGone = html.indexOf('Ajout suivi.') === -1;
      const deletionRestored = html.indexOf('retirer cela') !== -1;
      await disableTrackChangesIfOn(h);
      return {
        pass: noMarksLeft && insertionGone && deletionRestored,
        notes: 'html final=' + html,
      };
    },
  });

  cases.push({
    id: 'trackchanges_survives_save_and_reload',
    description: "Un Enregistrer réel écrit auteur/horodatage dans SuiviModifications (MÊME UpdateRecord que Contenu), et un rechargement par le vrai sélecteur redonne la marque en attente",
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Modèle avec suivi.</p>');
      await h.focusAtEnd();
      await h.typeText(' Suggestion en attente.');
      document.getElementById('template-name').value = 'Suivi persistance';
      await h.clickButton('btn-save');
      await h.sleep(500);
      const id = Templates.getCurrentId();
      const row = stub().getRow(TABLE, id);
      let suivi = {};
      try { suivi = JSON.parse(row.SuiviModifications || '{}'); } catch (e) { /* laissé vide, jugé plus bas */ }
      const ids = Object.keys(suivi);
      // author=null : GristAPI.getCurrentUserEmail() échoue dans ce harnais (formule user.Email non évaluée par le stub, cf. dev-tests/grist-stub.js) -
      // Editor.getSuiviModificationsForSave() retombe alors sur l'auteur anonyme (null), même convention documentée dans js/editor.js.
      const entryOk = ids.length === 1 && suivi[ids[0]] && suivi[ids[0]].author === null && typeof suivi[ids[0]].createdAt === 'string';

      await disableTrackChangesIfOn(h);
      await h.resetEditor();
      Editor.setHTML('<p>Vidé entre-temps.</p>');
      const select = document.getElementById('template-select');
      select.value = String(id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(600);
      const htmlBack = Editor.getHTML();
      const markBack = htmlBack.indexOf('Suggestion en attente') !== -1 && htmlBack.indexOf('<ins') !== -1;
      return {
        pass: entryOk && markBack,
        notes: 'SuiviModifications=' + row.SuiviModifications + ', markBack=' + markBack,
      };
    },
  });

  cases.push({
    id: 'trackchanges_macro_template_excluded_from_suivi',
    description: "Un macro-modèle (TypeModele='macro') n'a jamais de suiviModifications exploitable (null, jamais un objet) et verrouille les 3 boutons de suivi dans la barre - son JSON de composition ne passe jamais par l'éditeur suivi",
    run: async (h) => {
      await h.resetEditor();
      await disableTrackChangesIfOn(h);
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      const nameInput = document.getElementById('macro-editor-name');
      if (!nameInput) return { pass: false, notes: 'modale macro introuvable après clic sur "Nouveau macro-modèle"' };
      nameInput.value = 'Macro test suivi';
      document.getElementById('macro-editor-save').click();
      await h.sleep(300);
      const id = Templates.getCurrentId();
      const cached = Templates.getCached().find(t => String(t.id) === String(id));
      const suiviNull = !!cached && cached.suiviModifications === null;
      const html = Editor.getHTML();
      const editorUntouched = html.indexOf('slots') === -1 && html.indexOf('macroSlots') === -1;
      const locked = toggleBtn().classList.contains('v2-hf-locked')
        && acceptBtn().classList.contains('v2-hf-locked')
        && rejectBtn().classList.contains('v2-hf-locked');
      return {
        pass: suiviNull && editorUntouched && locked,
        notes: 'suiviModifications=' + JSON.stringify(cached && cached.suiviModifications) + ', editorUntouched=' + editorUntouched + ', verrouillé=' + locked,
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.trackChanges = cases;
})();
