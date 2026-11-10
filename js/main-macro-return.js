// Ouvrir un modèle depuis le résumé d'un macro-modèle ou depuis le lien d'un tableau lié, et y revenir : les bandeaux « Revenir au macro-modèle » et « Revenir au document », l'origine gardée (macroOrigin,
// linkedOrigin) et oubliée dès qu'un autre modèle se charge. Sorti de js/main.js (refactorisation du 10/11, découpe 9) : les deux origines sont à lui ; le mode et le type du modèle y sont lus par des
// fonctions ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainMacroReturn = (function () {
  function create(api) {
    const {
      askBeforeLeaving, getCurrentMode, getCurrentTypeModele, hasEditsToConfirmBeforeLeaving, isReadOnly, linkedReturnBar, loadTemplateIntoEditor,
      macroReturnBar, onTemplateSelectChange, persist, refreshTemplateList, setStatus, templateSelect,
    } = api;

    // Le macro-modèle d'où le modèle à l'écran a été ouvert par le stylo de son résumé, et ce modèle : { macroId, templateId }, null sinon (cf.
    // openTemplateFromMacro).
    let macroOrigin = null;
    // Le document d'où le modèle Grille à l'écran a été ouvert par « Ouvrir le modèle » (menu du lien d'un tableau lié, js/linked-table.js), et ce qu'il faut pour y revenir : { templateId,
    // modelId, place (la case du curseur dans le tableau), macroOrigin (celui du document, rendu au retour) }, null sinon (cf. openLinkedModel).
    let linkedOrigin = null;

    // Ouvrir un modèle d'un macro-modèle, et y revenir
    // Le stylo d'une ligne du résumé d'un macro-modèle (js/macro-editor.js:showSummary) ouvre ce modèle dans l'éditeur comme un choix de la liste ;
    // tant qu'il est à l'écran, le bandeau « Revenir au macro-modèle » (#macro-return-bar) ramène au macro-modèle d'origine. macroOrigin = { macroId,
    // templateId } est remis à null dès qu'un autre modèle se charge (liste, « + », galerie, suppression : forgetMacroOriginUnless, en tête de
    // loadTemplateIntoEditor), jamais quand le même est rechargé (conflit d'enregistrement automatique).

    // Un bandeau « Revenir à… » (macro-modèle ou document) : montré tant que le modèle d'origine existe, avec son nom dans la phrase. Le nom d'un modèle long est coupé par « … » : la phrase se lit en
    // entier au survol.
    function showReturnBar(bar, textId, textKey, origin) {
      bar.hidden = !origin;
      const text = document.getElementById(textId);
      if (!text) return;
      text.textContent = origin ? I18n.t(textKey, { name: origin.nom }) : '';
      text.title = text.textContent;
    }

    function syncMacroReturnBar() {
      if (!macroReturnBar) return;
      showReturnBar(macroReturnBar, 'macro-return-text', 'macro.return.text', macroOrigin && Templates.byId(macroOrigin.macroId));
    }

    function forgetMacroOriginUnless(tpl) {
      if (!macroOrigin || (tpl && Templates.isCurrent(tpl.id))) return;
      macroOrigin = null;
      syncMacroReturnBar();
    }

    // Un macro-modèle n'a rien à enregistrer avant d'être quitté (il s'édite dans sa fenêtre) : pas de question ici, contrairement au retour
    // (returnToMacro). La liste et le cache des modèles sont relus d'abord : un modèle créé ailleurs depuis le dernier passage n'a pas encore sa ligne
    // dans le <select> (le choisir y laisserait « Nouveau modèle »), et le texte lu est celui de Grist.
    async function openTemplateFromMacro(templateId) {
      if (isReadOnly() || getCurrentTypeModele() !== 'macro') return;
      const macroId = Templates.getCurrentId();
      if (macroId == null) return;
      await refreshTemplateList();
      const tpl = Templates.byId(templateId);
      // Un autre modèle s'est chargé pendant la relecture (deux clics de suite) : celui-là gagne. Modèle disparu : le macro-modèle reste, la liste le
      // montre de nouveau.
      if (!Templates.isCurrent(macroId)) return;
      if (!tpl || tpl.typeModele === 'macro' || !Templates.isOpenableType(tpl.typeModele)) { templateSelect.value = macroId; return; }
      templateSelect.value = tpl.id;
      loadTemplateIntoEditor(tpl);
      macroOrigin = { macroId, templateId: tpl.id };
      syncMacroReturnBar();
    }

    // Même chemin qu'un choix du macro-modèle dans la liste : la question « Modifications non enregistrées » est posée si le modèle ouvert en a, et
    // « Annuler » reste sur lui (le bandeau aussi). Le cache des modèles est relu d'abord : Templates.save ne touche pas à Contenu, et ce qui vient
    // d'être modifié ici doit se lire dans le macro-modèle (Lecture, PDF, Word) sans attendre le prochain passage de l'enregistrement automatique.
    async function returnToMacro() {
      const origin = macroOrigin;
      if (!origin) return;
      try { await Templates.loadAll(); } catch (e) { console.error('[main] relecture des modèles impossible', e); }
      // Macro-modèle supprimé depuis (par quelqu'un d'autre) : le modèle reste à l'écran, le bandeau s'efface (choisir une valeur absente de la liste
      // ouvrirait un modèle vide).
      if (!Templates.byId(origin.macroId)) { syncMacroReturnBar(); return; }
      templateSelect.value = origin.macroId;
      await onTemplateSelectChange();
      if (getCurrentTypeModele() !== 'macro' || !Templates.isCurrent(origin.macroId)) return;
      // Le stylo du modèle qu'on vient de quitter reprend le focus : le bouton « Revenir » a disparu avec le bandeau.
      const pencil = document.querySelector('.macro-summary-edit[data-template-id="' + CSS.escape(String(origin.templateId)) + '"]');
      if (pencil) pencil.focus();
    }

    function wireMacroReturn() {
      const button = document.getElementById('btn-macro-return');
      if (button) button.addEventListener('click', returnToMacro);
    }

    function syncLinkedReturnBar() {
      if (!linkedReturnBar) return;
      showReturnBar(linkedReturnBar, 'linked-return-text', 'linkedTable.return.text', linkedOrigin && Templates.byId(linkedOrigin.templateId));
    }

    function forgetLinkedOriginUnless(tpl) {
      if (!linkedOrigin || (tpl && Templates.isCurrent(tpl.id))) return;
      linkedOrigin = null;
      syncLinkedReturnBar();
    }

    // Le même chemin qu'un choix du modèle dans la liste : la question « Modifications non enregistrées » est posée au document qui en a (« Annuler » le garde à l'écran, tel quel). La
    // liste et le cache des modèles sont relus d'abord, comme pour un modèle d'un macro-modèle : un modèle créé ailleurs depuis le dernier passage n'a pas encore sa ligne dans le <select>.
    // Un document jamais enregistré, abandonné à la question, n'a plus où revenir : pas de bandeau.
    async function openLinkedModel({ id, name, place }) {
      if (hasEditsToConfirmBeforeLeaving() && !(await askBeforeLeaving())) return;
      const templateId = Templates.getCurrentId();
      const macro = macroOrigin;
      const epoch = persist.autosaveEpoch;
      try { await refreshTemplateList(); } catch (e) { console.warn('[main] relecture des modèles impossible', e); }
      // Un autre modèle s'est chargé pendant la relecture (un choix dans la liste) : celui-là gagne.
      if (epoch !== persist.autosaveEpoch) return;
      const model = Templates.byId(id);
      if (!model || model.typeModele !== GridEditor.TYPE) { setStatus(I18n.t('linkedTable.gone', { name }), true); return; }
      templateSelect.value = model.id;
      loadTemplateIntoEditor(model);
      linkedOrigin = templateId == null ? null : { templateId, modelId: model.id, place, macroOrigin: macro };
      syncLinkedReturnBar();
    }

    // Même chemin que la liste aussi pour le retour : la question « Modifications non enregistrées » est posée si le modèle en a (« Annuler » le garde, et le bandeau aussi). Le cache des
    // modèles est relu d'abord : ce que le modèle vient de recevoir est ce que le document lit. Le document revient avec son bandeau de macro-modèle s'il en avait un, le curseur dans la
    // case du tableau qu'on avait quittée. Le document suit son modèle à son ouverture (followLinkedModels) : un tableau qui diffère encore du modèle - modifié ici, ou des deux côtés - le dit sur la ligne d'état.
    async function returnFromLinkedModel() {
      const origin = linkedOrigin;
      if (!origin) return;
      try { await Templates.loadAll(); } catch (e) { console.error('[main] relecture des modèles impossible', e); }
      // Document supprimé depuis (par quelqu'un d'autre) : le modèle reste à l'écran, le bandeau s'efface.
      if (!Templates.byId(origin.templateId)) { syncLinkedReturnBar(); return; }
      templateSelect.value = origin.templateId;
      await onTemplateSelectChange();
      if (!Templates.isCurrent(origin.templateId)) return;
      if (origin.macroOrigin && Templates.byId(origin.macroOrigin.macroId)) { macroOrigin = origin.macroOrigin; syncMacroReturnBar(); }
      if (getCurrentMode() !== 'edit') return;
      const shown = LinkedTable.reveal(EditorCore.getEditor(), origin.modelId, origin.place);
      if (shown && shown.differs) setStatus(I18n.t('linkedTable.differs', { name: shown.name }));
    }

    function wireLinkedReturn() {
      const button = document.getElementById('btn-linked-return');
      if (button) button.addEventListener('click', returnFromLinkedModel);
    }

    return { forgetLinkedOriginUnless, forgetMacroOriginUnless, openLinkedModel, openTemplateFromMacro, wireLinkedReturn, wireMacroReturn };
  }

  return { create };
})();
