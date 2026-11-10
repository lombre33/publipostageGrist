// Le lecteur : la Lecture d'une ligne (renderReader : le modèle résolu avec les valeurs de la ligne sélectionnée) et l'enregistrement des ancres des commentaires qu'elle a posés (saveReaderCommentAnchors).
// Sorti de js/main.js (refactorisation du 10/11, découpe 11) : le type du modèle, la ligne et la table y sont lus par des fonctions, la table aussi écrite par un écriveur ; ce qu'il prend à l'autosave lui est
// donné par des appels différés ; le reste par `api`. Les corps sont ceux de main.js.
const MainReader = (function () {
  function create(api) {
    const {
      changedElsewhere, currentDocumentHtml, getCurrentTableId, getCurrentTypeModele, getLatestRecord, noteKnownState, noteSaved, persist, readRemoteTemplate,
      readerContainer, saveScreenAs, setCurrentTableId, showConflictBanner, templateNameInput, updateSaveStatus,
    } = api;

    async function renderReader(record, recordTableId) {
      // Un PDF à l'écran (js/pdf-reading.js) : la Lecture montre le PDF, que la ligne de la table change ou non ; il se pose une fois, et seul un modèle qui s'ouvre le remplace.
      if (PdfReading.isActive()) { await PdfReading.render(readerContainer); return; }
      if (typeof record === 'undefined') record = getLatestRecord() || GristAPI.getCurrentRecord();
      let tableId = recordTableId || GristAPI.getCurrentTableId() || getCurrentTableId();
      // Sans ligne sélectionnée, ReaderMode.render() affiche tout de même son état vide : un simple `return` laisserait #reader-container vide, un
      // écran blanc sans explication. onCreateEmail (mode email) appelle aussi renderReader() alors que currentMode reste 'edit', pour lire le corps
      // résolu sans changer de mode : #reader-container reste display:none tant que currentMode !== 'read' (cf. switchMode).
      if (!record) { await ReaderMode.render(await currentDocumentHtml(tableId, null, { anchors: true }), tableId, null, Editor.getHeaderFooterData()); return; }
      if (!tableId) {
        const ctx = await GristAPI.detectCurrentContext();
        if (ctx && ctx.tableId) { setCurrentTableId(ctx.tableId); tableId = ctx.tableId; }
      }
      readerContainer.classList.toggle('pp-reader-comments', readerCommentsActive());
      // Le HTML est donné par une fonction : l'assemblage d'un macro-modèle (ses règles de slot) relit des tables, ce qui doit se faire dans les
      // lectures partagées de ce rendu.
      const html = async () => (readerCommentsActive() ? SlidesEntry.outputHtml(getCurrentTypeModele(), await Comments.buildReaderHtml(), { anchors: true, theme: PageLayout.getTheme() }) : currentDocumentHtml(tableId, record, { anchors: true }));
      await ReaderMode.render(html, tableId, record, Editor.getHeaderFooterData());
    }

    // Mode Lecture affiché (imposé par la lecture seule ou choisi) avec droit de commenter (js/comments.js:readerMode, applyCommentsPermissions) : il
    // montre les commentaires et en accepte de nouveaux, sur un HTML qui porte les positions du document. Jamais pour un macro-modèle : son contenu
    // vient d'autres modèles, pas de l'éditeur.
    function readerCommentsActive() { return Comments.isReaderMode() && getCurrentTypeModele() !== 'macro'; }

    // Commentaire posé, résolu ou supprimé depuis le mode Lecture : l'auto-save n'écrit rien en lecture seule (et n'a peut-être pas encore tourné quand
    // le mode Lecture est choisi), le modèle (sa marque de commentaire) est donc enregistré ici - et seulement s'il n'a pas changé ailleurs depuis son
    // chargement, sinon la marque écraserait ce changement (même contrôle de DateModif que autosaveTick). false = rien d'enregistré, js/comments.js
    // annule alors son changement de marque.
    async function saveReaderCommentAnchors() {
      const id = Templates.getCurrentId();
      if (!id || getCurrentTypeModele() === 'macro' || persist.autosaveConflictActive) return false;
      const nom = templateNameInput ? templateNameInput.value.trim() : '';
      if (!nom) return false;
      const epoch = persist.autosaveEpoch;
      let remote;
      try {
        remote = await readRemoteTemplate(id, epoch);
        // Une écriture de ce widget (un passage de l'enregistrement automatique) a croisé la lecture : on attend qu'elle finisse et on relit, plutôt
        // que d'annuler le commentaire de la personne.
        if (!remote) { await Templates.whenIdle(); remote = await readRemoteTemplate(id, epoch); }
      }
      catch (e) { console.error('[main] commentaire en lecture : vérification de conflit impossible', e); return false; }
      if (!remote || !remote.remoteTpl) return false;
      const remoteTpl = remote.remoteTpl;
      if (changedElsewhere(remoteTpl)) { showConflictBanner(remoteTpl); return false; }
      try {
        const suiviModifications = await Editor.getSuiviModificationsForSave();
        const editVersion = persist.autosaveEditVersion;
        const token = LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
        const { dateModif } = await saveScreenAs(id, nom, suiviModifications);
        LiveEntry.published(token, dateModif);
        if (epoch === persist.autosaveEpoch) {
          persist.autosaveLastKnownDateModif = dateModif;
          noteSaved(editVersion);
          noteKnownState(id);
          updateSaveStatus();
        }
        // Cache des modèles relu (Templates.save ne le touche pas) : revenir plus tard sur ce modèle doit montrer la marque qui vient d'être posée.
        Templates.loadAll().catch(e => console.error('[main] relecture des modèles impossible', e));
        return true;
      } catch (e) {
        console.error('[main] commentaire en lecture : échec d’enregistrement du modèle', e);
        return false;
      }
    }

    return { renderReader, saveReaderCommentAnchors };
  }

  return { create };
})();
