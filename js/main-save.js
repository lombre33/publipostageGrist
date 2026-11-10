// L'enregistrement du modèle par la personne : le bouton Enregistrer et son menu, Enregistrer sous, l'historique des versions (nommer, restaurer), la suppression et la copie d'un modèle.
// Sorti de js/main.js (refactorisation du 10/11, découpe 8) : l'état qu'il partage avec l'enregistrement automatique et la sortie d'un modèle est l'objet `persist` de main.js (découpe 7), donné par
// `api` avec ce qu'il tire de js/main-autosave.js ; le type du modèle est lu par une fonction, le nom du titre par un lecteur et un écriveur. Les corps sont ceux de main.js.
const MainSave = (function () {
  function create(api) {
    const {
      AUTOSAVE_ENABLED_STORAGE, followLinkedModels, forgetLinkedOriginUnless, forgetMacroOriginUnless, getCurrentTypeModele, hideConflictBanner,
      isAutosaveEnabled, isReadOnly, linkedSendFor, loadTemplateIntoEditor, macroSettingsOnScreen, noteKnownState, noteSaved, onMacroSaved, persist,
      refreshTemplateList, saveScreenAs, setAutosaveEnabled, setStatus, settleTemplateName, showTemplateList, startBlankDocument, syncDefaultTemplateButton,
      syncSaveButtonLook, templateNameInput, templateSelect, updateSaveStatus, whenAutosaveTickDone,
    } = api;

    // Un seul enregistrement manuel à la fois. Avec Grist lent, un deuxième clic sur Enregistrer (ou Ctrl+S) pendant la première écriture partait
    // aussitôt : l'identifiant d'un modèle tout neuf n'arrive qu'à la fin de l'écriture, et les deux gestes créaient chacun une ligne sous le même nom.
    // Le deuxième attend la fin du premier (liste relue comprise), puis enregistre ce que l'écran montre alors, dans la même ligne ; plusieurs gestes
    // pendant la même écriture n'en font qu'un, qui lit l'état au moment où il part. Un enregistrement qui ne revient jamais (connexion perdue) ne
    // bloque pas le bouton au-delà de SAVE_WATCHDOG_MS, comme les écritures de js/templates.js.
    const SAVE_WATCHDOG_MS = 60000;
    const saveIsRunning = () => persist.saveRunning !== null && Date.now() - persist.saveStartedAt < SAVE_WATCHDOG_MS;
    // Rend la main quand l'enregistrement en cours est fini, ou passé SAVE_WATCHDOG_MS.
    function whenSaveFinished() {
      return new Promise(resolve => {
        const timer = setTimeout(resolve, Math.max(0, SAVE_WATCHDOG_MS - (Date.now() - persist.saveStartedAt)));
        persist.saveRunning.finally(() => clearTimeout(timer)).then(resolve, resolve);
      });
    }
    function onSave() {
      if (getCurrentTypeModele() === 'macro') return runSave(); // le bouton n'y fait qu'ouvrir la fenêtre du macro-modèle : rien à écrire
      if (!saveIsRunning()) {
        persist.saveStartedAt = Date.now();
        const run = persist.saveRunning = runSave().finally(() => { if (persist.saveRunning === run) persist.saveRunning = null; });
        return run;
      }
      if (!persist.saveWaiting) persist.saveWaiting = whenSaveFinished().then(() => { persist.saveWaiting = null; return onSave(); });
      return persist.saveWaiting;
    }

    // Un macro-modèle s'édite uniquement dans sa fenêtre (MacroEditor) : Editor.getHTML() est toujours vide pour ce type et, par le chemin normal,
    // écraserait sa composition par un contenu vide. « Enregistrer » rouvre donc la fenêtre au lieu d'enregistrer.
    async function runSave() {
      if (isReadOnly()) return; // Ctrl+S compris (wireSaveShortcut) : le bouton, lui, est déjà grisé
      if (getCurrentTypeModele() === 'macro') {
        MacroEditor.openModal(Templates.byId(Templates.getCurrentId()));
        return;
      }
      Editor.exitHeaderFooterModeIfActive();
      const id = Templates.getCurrentId();
      const typedName = templateNameInput ? templateNameInput.value.trim() : '';
      const nom = settleTemplateName(); // nom déjà pris : « nom (2) »... (la saisie du crayon, une copie, un modèle de la galerie passent tous par ici)
      if (!nom) { setStatus(I18n.t('status.templateNameRequired'), true); return; }
      let savedId, dateModif, send = null, synced = null;
      const epoch = persist.autosaveEpoch;
      try {
        const suiviModifications = await Editor.getSuiviModificationsForSave();
        // Cette attente (l'identification de la personne : une écriture et une lecture de Grist quand elle n'est pas encore connue, des secondes quand
        // Grist est lent) a pu laisser choisir un autre modèle : l'éditeur montre alors celui-là, et l'écrire sous l'identifiant de ce modèle-ci le
        // remplacerait. Le choisir en répondant « Abandonner » renonce à cet enregistrement.
        if (epoch !== persist.autosaveEpoch) return;
        // Un tableau lié est à envoyer à son modèle : les modèles sont relus d'abord (un passage de l'enregistrement automatique vient de le faire, pas un Enregistrer à la main, surtout quand le passage est coupé),
        // sans quoi un modèle changé ailleurs depuis serait écrasé sans que personne ne le voie. Une relecture qui échoue renonce à l'envoi, pas à l'enregistrement du document.
        let modelsFresh = true;
        if (LinkedTable.hasPending(EditorCore.getEditor()) || SlideLinks.hasPending(EditorCore.getEditor())) {
          modelsFresh = await LinkedTable.refreshModels();
          if (epoch !== persist.autosaveEpoch) return;
          // Les modèles sont frais : les tableaux suivent les leurs comme à un passage de l'enregistrement automatique (un modèle changé ailleurs en même temps que le tableau : l'écart se dit, rien ne part).
          if (modelsFresh) synced = followLinkedModels();
        }
        const editVersion = persist.autosaveEditVersion;
        send = modelsFresh ? linkedSendFor(false) : null;
        const token = LiveEntry.saveToken(); // l'état du texte juste avant qu'il soit lu (écriture en direct)
        ({ id: savedId, dateModif } = await saveScreenAs(id, nom, suiviModifications, send ? send.html : undefined, send ? send.writes : null));
        LiveEntry.published(token, dateModif);
        // La date écrite est notée tout de suite, avant la relecture de la liste plus bas (une lecture de Grist de plus, des secondes quand il est
        // lent) : un passage de l'enregistrement automatique entre les deux verrait cette date sans la connaître et conclurait « modifié ailleurs »
        // (cf. autosaveTick). Un modèle chargé pendant l'écriture (autosaveEpoch) garde son propre état. Un enregistrement manuel tranche tout conflit
        // en cours en faveur de cette version : pas besoin de recharger.
        if (epoch === persist.autosaveEpoch) {
          persist.autosaveLastKnownDateModif = dateModif;
          persist.autosaveRefusedEpoch = -1; // Grist vient d'écrire : l'arrêt de l'enregistrement automatique après un refus est levé
          noteSaved(editVersion);
          hideConflictBanner();
          if (send) send.commit(); // Grist a écrit le document et les modèles ensemble : les tableaux partis prennent leur base
          noteKnownState(savedId);
        }
      } catch (e) {
        // La personne a refusé de créer les tables du widget : rien n'est enregistré, et le coin d'état le dit (ni échec ni journal d'erreur : elle a
        // répondu elle-même, et Enregistrer lui reposera la question).
        if (GristAPI.isTablesDeclined(e)) { setStatus(I18n.t('status.saveDeclined'), true); return; }
        // Grist refuse d'écrire dans ce modèle (règle d'accès, par exemple un fichier que GFS partage en lecture, consigne 060) : le coin le dit, et l'enregistrement automatique n'essaie plus pour ce modèle (autosaveRefusedEpoch).
        if (GristAPI.isAccessRefusal(e)) {
          console.warn('[main] enregistrement manuel : Grist refuse l’écriture (règle d’accès)', e);
          if (epoch === persist.autosaveEpoch) { persist.autosaveRefusedEpoch = epoch; setStatus(I18n.t('status.saveRefused'), true); }
          return;
        }
        // Un échec ici (par exemple une colonne Grist manquante) doit se voir : sans ce traitement, la fonction s'interromprait sans message, la liste
        // et le coin d'état ne seraient pas mis à jour, et rien ne dirait que « Enregistrer » n'a rien enregistré.
        console.error('[main] échec de l’enregistrement manuel', e);
        setStatus(I18n.t('status.saveError'), true);
        return;
      }
      if (epoch === persist.autosaveEpoch) { Templates.setCurrentId(savedId); ExportChoices.adopt(savedId); LiveEntry.changed(); } // un modèle neuf enregistré peut s'écrire en direct
      await refreshTemplateList();
      // L'écriture et la relecture de la liste durent des secondes quand Grist est lent : un autre modèle a pu être choisi entre-temps (autosaveEpoch).
      // L'écran, la liste et le modèle courant sont alors les siens : ce geste ne les remet pas sur le modèle qu'il vient d'écrire (l'enregistrement
      // automatique y écrirait ensuite ce que l'écran montre), il ne fait que rafraîchir la liste.
      const sameTemplate = epoch === persist.autosaveEpoch;
      const shownId = sameTemplate ? savedId : Templates.getCurrentId();
      templateSelect.value = shownId == null ? '' : shownId;
      syncDefaultTemplateButton();
      // Premier enregistrement d'un modèle tout neuf : Comments n'a encore reçu aucun identifiant de modèle (loadForTemplate n'est appelé que par
      // loadTemplateIntoEditor, qui ne repasse pas par ici). Sans cet appel, « Commenter la sélection » répondrait « Enregistrez d'abord le modèle » à
      // quelqu'un qui vient de l'enregistrer, jusqu'à un changement de modèle. Seulement quand l'identifiant change : un nouvel enregistrement du même
      // modèle n'a rien à recharger, et loadForTemplate referme le panneau ouvert.
      if (sameTemplate && String(id) !== String(savedId)) {
        // Les fils d'un Word importé entrent dans la table avec le numéro du modèle, puis ils sont relus avec lui.
        // Un refus (faux) n'est pas relu : loadForTemplate effacerait les fils qui attendent encore, la personne en est avertie par Comments.
        Comments.adoptStaged(savedId).then(adopted => (adopted === false ? null : Comments.loadForTemplate(savedId))).catch(e => console.error('[main] chargement des commentaires impossible après création du modèle', e));
        forgetMacroOriginUnless(null); // une copie n'est pas un modèle du macro-modèle d'où l'on venait : le bandeau n'a plus de sens
        forgetLinkedOriginUnless(null); // ni le modèle que le tableau du document désigne : le retour n'a plus de sens non plus
      } else if (sameTemplate && Comments.hasStaged()) {
        // Les fils d'un Word importé attendaient encore (écriture refusée au premier enregistrement) : cet enregistrement les réessaie.
        Comments.adoptStaged(savedId).then(adopted => (adopted === true ? Comments.loadForTemplate(savedId) : null)).catch(e => console.error('[main] nouvel essai des commentaires du Word importé impossible', e));
      }
      updateSaveStatus();
      if (sameTemplate) LinkedTable.tell(synced, send);
      // à la place de « Enregistré à… » : le nom a changé, c'est ce qu'il faut lire
      if (sameTemplate && nom !== typedName) setStatus(I18n.t('status.nameExists', { name: nom }));
    }

    // La copie est proposée sous le premier nom libre (« Contrat (2) » pour « Contrat ») : Entrée suffit, la saisie est sélectionnée pour la remplacer
    // d'une frappe.
    async function onSaveAs() {
      if (isReadOnly()) return;
      const currentName = templateNameInput ? templateNameInput.value.trim() : '';
      const asked = await Dialogs.prompt({ title: I18n.t('toolbar.saveAs'), label: I18n.t('prompt.newTemplateName'), value: Templates.uniqueName(currentName), confirmLabel: I18n.t('common.save') });
      if (!asked) return;
      const nom = asked.trim();
      if (!nom) return;
      // Le modèle qu'on copie : la copie, une fois faite, entre dans l'historique d'Annuler / Rétablir (copiedTemplateAction). Un document pas encore enregistré n'a pas de modèle d'origine : son « Enregistrer sous… » est son
      // premier enregistrement, que « Enregistrer » ne range pas non plus.
      const from = Templates.getCurrentId();
      // Un macro-modèle se copie par sa composition (mêmes emplacements, nouvel identifiant) : passer par onSave rouvrirait sa fenêtre au lieu de
      // dupliquer.
      if (getCurrentTypeModele() === 'macro') {
        const tpl = Templates.byId(Templates.getCurrentId());
        const macroSlots = tpl && tpl.macroSlots ? tpl.macroSlots : { slots: [] };
        try {
          const kept = macroSettingsOnScreen();
          const copyName = Templates.uniqueName(nom);
          const { id: newId } = await Templates.save(null, copyName, JSON.stringify(macroSlots), kept.nomFichierPDF, kept.headerFooter, kept.marginsMm, 'macro', null);
          await onMacroSaved(newId, copyName !== nom ? copyName : null);
          if (from != null) ActionHistory.add(copiedTemplateAction(newId, from, false));
        } catch (e) {
          console.error('[main] échec de la copie du macro-modèle', e);
          setStatus(I18n.t('status.saveError'), true);
        }
        return;
      }
      // Une copie est un autre modèle : l'écriture en direct, qui est celle du texte de celui-ci, s'arrête d'abord (js/live-entry.js).
      await LiveEntry.stop();
      // Un enregistrement encore en cours (Grist lent) rendrait, à sa fin, son identifiant au modèle courant (cf. runSave) : la copie, qui part d'un
      // modèle sans identifiant, attend qu'il soit fini, celui d'un deuxième clic compris.
      const epoch = persist.autosaveEpoch;
      while (saveIsRunning() || persist.saveWaiting) await (persist.saveWaiting || whenSaveFinished());
      if (epoch !== persist.autosaveEpoch) return; // un autre modèle a été choisi pendant l'attente : la copie n'a plus d'objet
      if (templateNameInput) templateNameInput.value = nom;
      Templates.setCurrentId(null);
      ExportChoices.detach();
      if (from == null) await onSave();
      else await saveAsNewTemplate(from, false);
    }

    // Enregistre l'écran comme un modèle NEUF - une copie (« Enregistrer sous… »), un modèle de la galerie - puis range l'action dans l'historique d'Annuler / Rétablir. `from` : le modèle que l'écran montrait avant (null : aucun) ;
    // `withTables` : la galerie a créé des tables avec lui. Rien n'est rangé quand l'enregistrement n'a créé aucun modèle (nom manquant, refus, erreur : le coin d'état le dit) ni quand un autre modèle a été choisi pendant qu'il
    // durait (l'identifiant courant est alors le sien).
    async function saveAsNewTemplate(from, withTables) {
      const epoch = persist.autosaveEpoch;
      await onSave();
      if (epoch !== persist.autosaveEpoch) return;
      const id = Templates.getCurrentId();
      if (id != null && Templates.byId(id)) ActionHistory.add(copiedTemplateAction(id, from, !!withTables));
    }

    // Historique des versions (js/versions-store.js garde les versions à chaque enregistrement ; la fenêtre, js/versions-history.js, ne se charge qu'ici, au premier clic). Le modèle ouvert
    // doit déjà être enregistré : un modèle neuf n'a pas de version.
    async function openVersionHistory() {
      if (isReadOnly()) return;
      const id = Templates.getCurrentId();
      const tpl = Templates.byId(id);
      if (!id || !tpl) { setStatus(I18n.t('status.versionsNeedSavedTemplate'), true); return; }
      try {
        await VersionsStore.loadWindow();
        VersionsHistory.open({ id, name: tpl.nom, restore: (snapshot, when) => restoreVersionOnScreen(id, snapshot, when), nameVersion: (target, label) => nameVersionOnScreen(id, target, label) });
      } catch (e) {
        console.error('[main] fenêtre de l’historique des versions impossible', e);
        setStatus(I18n.t('status.versionsUnavailable'), true);
      }
    }

    // Une erreur que la fenêtre de l'historique dit sous son titre (la clé du texte).
    function versionError(key) { return Object.assign(new Error(I18n.t(key)), { versionsKey: key }); }

    // Donne (ou retire, avec '') un nom à une version de l'historique ; refusé en lecture seule, comme une restauration. `target` : { rowId } (une version gardée) ou { state, at, author } (l'état enregistré que
    // « Version actuelle » montre : il est gardé sous ce nom, et la ligne ajoutée est rendue : { rowId }).
    async function nameVersionOnScreen(id, target, label) {
      if (isReadOnly()) throw versionError('versions.nameError');
      try {
        if (target.rowId != null) { await VersionsStore.renameVersion(target.rowId, label); return {}; }
        return await VersionsStore.keepNamed({ modelRowId: id, state: target.state, at: target.at, author: target.author, name: label, tokenFor: () => Templates.ensureToken(id) });
      } catch (e) {
        if (e && e.versionsKey) throw e;
        throw versionError('versions.nameError');
      }
    }

    // Remet dans le modèle ouvert l'état d'une de ses versions. Ce que l'écran montre et n'est pas encore enregistré part d'abord, comme un Enregistrer (il devient l'état que la restauration
    // remplace) ; l'état remplacé est gardé dans une version (Templates.restoreVersion), puis l'éditeur repart de l'état restauré, comme après « Recharger » du bandeau de conflit.
    async function restoreVersionOnScreen(id, snapshot, when) {
      if (isReadOnly()) throw versionError('versions.restoreError');
      // Une version remplacerait le texte que les autres personnes écrivent en ce moment : l'écriture en direct s'arrête d'abord, de la main de la personne.
      if (LiveEntry.isLive()) throw versionError('versions.restoreLive');
      persist.restoringVersion = true;
      try {
        await whenAutosaveTickDone();
        while (saveIsRunning() || persist.saveWaiting) await (persist.saveWaiting || whenSaveFinished());
        if (String(Templates.getCurrentId()) !== String(id)) throw versionError('versions.restoreError');
        // Un macro-modèle n'a rien dans l'éditeur : son Enregistrer rouvre sa fenêtre.
        if (persist.autosaveDirty && getCurrentTypeModele() !== 'macro') {
          await onSave();
          if (persist.autosaveDirty) throw versionError('versions.restoreNeedsSave');
        }
        await Templates.whenIdle();
        await Templates.restoreVersion(id, snapshot);
        await refreshTemplateList();
        const restored = Templates.byId(id);
        if (restored) {
          loadTemplateIntoEditor(restored);
          templateSelect.value = id;
          syncDefaultTemplateButton();
        }
        setStatus(I18n.t('status.versionRestored', { when }));
      } catch (e) {
        if (e && e.versionsKey) throw e;
        throw versionError('versions.restoreError');
      } finally {
        persist.restoringVersion = false;
      }
    }

    // Le modèle dont `kept` est la ligne (Templates.snapshotRow, lue avant la suppression) vient d'être supprimé : l'action de l'historique d'Annuler / Rétablir (js/action-history.js). Défaire rend la ligne à la table sous son
    // numéro et son jeton (Templates.restoreRow : ses commentaires, son rangement, ses versions et les tableaux qui le placent le retrouvent) et, si l'écran montre encore le document vierge que la suppression a laissé, rouvre le
    // modèle ; sinon il revient dans la liste et l'écran n'est pas touché. Rétablir le supprime de nouveau, tel qu'il est alors (le modèle rouvert, lui, retrouve un Rétablir quand rien d'autre ne se rétablissait). Un modèle
    // déjà revenu, ou parti sans nous, n'est pas touché une seconde fois.
    function deletedTemplateAction(kept) {
      let row = kept;
      let rowId = kept.id;
      // L'écran est resté le document vierge que la suppression a laissé : rien n'y a été tapé, ou ce qui l'a été est défait (texte vide, aucun réglage de page touché). Sinon la personne perdrait ce qu'elle a devant elle.
      const screenLeftBlank = () => !persist.autosaveDirty || (!persist.autosaveSettingsDirty && EditorCore.getEditor().isEmpty);
      async function restore() {
        if (isReadOnly()) throw new Error('lecture seule');
        const back = await Templates.restoreRow(row);
        if (back.present) throw ActionHistory.conflict(I18n.t('history.templateBack'));
        rowId = back.id;
        await showTemplateList();
        if (Templates.getCurrentId() == null && screenLeftBlank() && Templates.openableById(rowId)) {
          // Charger le modèle vide l'historique, et Ctrl + Y n'aurait plus rien à rétablir : quand le repère de cette suppression est tout ce qui se rétablissait, l'historique d'avant est remis (HistoryMarkers.keep) et Ctrl + Y supprime de nouveau.
          const history = HistoryMarkers.keep();
          templateSelect.value = String(rowId);
          loadTemplateIntoEditor(Templates.byId(rowId));
          if (HistoryMarkers.redoDepth(history) === 1) HistoryMarkers.resume(history);
        }
        return I18n.t(back.renamed ? 'status.templateRestoredAs' : 'status.templateRestored', { name: back.nom });
      }
      async function remove() {
        if (isReadOnly()) throw new Error('lecture seule');
        const now = await Templates.snapshotRow(rowId);
        if (!now) throw ActionHistory.conflict(I18n.t('history.templateGone'));
        await Templates.remove(rowId);
        row = now;
        await showTemplateList();
        if (Templates.isCurrent(rowId)) startBlankDocument();
        return I18n.t('status.templateDeleted');
      }
      return { undo: restore, redo: remove };
    }

    async function onDelete() {
      if (isReadOnly()) return;
      const id = Templates.getCurrentId();
      if (!id) { setStatus(I18n.t('status.noTemplateSelected'), true); return; }
      // Un modèle Grille posé comme tableau lié dans d'autres modèles : la question le dit, ces tableaux gardent leurs cases et perdent leur lien (js/linked-table.js:usedBy).
      const used = LinkedTable.usedBy(id).length;
      const message = used ? I18n.t('linkedTable.deleteUsed', { n: used }) : '';
      if (!(await Dialogs.confirm({ title: I18n.t('confirm.deleteTemplate'), message, confirmLabel: I18n.t('common.delete'), danger: true }))) return;
      // La ligne telle que Grist la garde, lue avant de la supprimer : Annuler la rend. Une lecture qui échoue ne retient pas la suppression, que la personne a confirmée : seul Annuler n'en saura rien.
      let kept = null;
      try { kept = await Templates.snapshotRow(id); } catch (e) { console.warn('[main] ligne du modèle non gardée pour Annuler', e); }
      try {
        await Templates.remove(id);
      } catch (e) {
        // Grist refuse la suppression (règle d'accès : la personne lit ce modèle sans pouvoir le supprimer, par exemple un fichier que GFS lui partage en lecture, consigne 060) ou ne répond pas : le modèle reste, à l'écran et dans
        // la liste, et le coin d'état le dit. Sans ce rattrapage la question était fermée et rien ne se passait, sans un mot.
        const refused = GristAPI.isAccessRefusal(e);
        if (refused) console.warn('[main] suppression du modèle : Grist refuse (règle d’accès)', e); else console.error('[main] suppression du modèle impossible', e);
        setStatus(I18n.t(refused ? 'status.deleteRefused' : 'status.deleteError'), true);
        return;
      }
      await refreshTemplateList();
      startBlankDocument();
      setStatus(I18n.t('status.templateDeleted'));
      if (kept) ActionHistory.add(deletedTemplateAction(kept));
    }

    // Le modèle `id` vient d'être créé comme copie de ce que l'écran montrait - « Enregistrer sous… » (`from` : le modèle qu'on copiait) ou un modèle de la galerie (`from` : celui qu'on quittait, null si l'écran n'en avait pas) :
    // l'action de l'historique d'Annuler / Rétablir (js/action-history.js). Défaire RETIRE la copie, après une question (« Retirer … ? ») : elle a pu être travaillée depuis, et un Ctrl + Z de trop ne doit pas la perdre en silence ;
    // « Annuler » à la question la garde. Si l'écran la montrait encore, `from` se rouvre tel que la table le garde (un document vierge quand il n'existe plus ou qu'il n'y en avait pas). Rétablir rend la ligne sous son numéro et son
    // jeton (Templates.restoreRow, comme une suppression défaite) et, si l'écran est resté tel que Annuler l'a laissé, la rouvre. Les tables qu'un modèle de la galerie a créées avec lui (`withTables`) ne sont jamais touchées : un autre
    // modèle peut déjà s'en servir.
    function copiedTemplateAction(id, from, withTables) {
      let row = null; // la ligne telle que Grist la gardait quand la copie a été retirée
      let rowId = id;
      let reopened = false; // la copie était à l'écran quand elle a été retirée : l'écran a changé avec elle
      // L'écran est resté ce que Annuler a laissé : le modèle d'où venait la copie sans rien de tapé depuis, ou le document vierge.
      const screenLeftAsUndone = () => (Templates.getCurrentId() == null
        ? (!persist.autosaveDirty || (!persist.autosaveSettingsDirty && EditorCore.getEditor().isEmpty))
        : Templates.isCurrent(from) && !persist.autosaveDirty);
      async function remove(entryId) {
        if (isReadOnly()) throw new Error('lecture seule');
        const named = Templates.byId(rowId);
        if (!named) throw ActionHistory.conflict(I18n.t('history.templateGone'));
        // Pas d'écriture automatique ni de texte qui en remplace un autre tant que la question est posée et que l'écran change (comme la question de départ, askBeforeLeaving).
        persist.leavePromptCount++;
        persist.leavePromptOpen = true;
        try {
          const sure = await Dialogs.confirm({ title: I18n.t('history.removeCopyTitle', { name: named.nom }), message: I18n.t(withTables ? 'history.removeCopyTables' : 'history.removeCopyMessage'), confirmLabel: I18n.t('history.removeCopyConfirm'), danger: true });
          if (!sure) throw ActionHistory.conflict(I18n.t('history.copyKept', { name: named.nom }));
          // Un passage de l'enregistrement automatique, ou un enregistrement, encore en route finit d'écrire la copie avant qu'elle parte.
          await whenAutosaveTickDone();
          while (saveIsRunning() || persist.saveWaiting) await (persist.saveWaiting || whenSaveFinished());
          const now = await Templates.snapshotRow(rowId);
          if (!now) throw ActionHistory.conflict(I18n.t('history.templateGone'));
          const shown = Templates.isCurrent(rowId);
          await Templates.remove(rowId);
          row = now;
          reopened = shown;
          await showTemplateList();
          if (shown) {
            const back = from == null ? undefined : Templates.openableById(from);
            if (back) {
              templateSelect.value = String(back.id);
              loadTemplateIntoEditor(back);
              syncDefaultTemplateButton();
            } else {
              startBlankDocument();
            }
            // Charger un modèle vide l'historique, et Ctrl + Y n'aurait plus rien à rétablir : le repère de cette copie, défaite, est reposé dans l'historique neuf. L'historique d'avant ne se remet pas (HistoryMarkers.resume) :
            // il garde les positions du texte de la copie, qui ne sont pas celles du modèle rouvert.
            HistoryMarkers.recordUndoneAction(entryId);
          }
          return I18n.t('status.templateRemoved', { name: String(now.values.Nom || named.nom) });
        } finally {
          if (--persist.leavePromptCount === 0) persist.leavePromptOpen = false;
        }
      }
      async function bringBack() {
        if (isReadOnly()) throw new Error('lecture seule');
        const back = await Templates.restoreRow(row);
        if (back.present) throw ActionHistory.conflict(I18n.t('history.templateBack'));
        rowId = back.id;
        await showTemplateList();
        const open = reopened && screenLeftAsUndone() && Templates.openableById(rowId);
        reopened = false;
        if (open) {
          templateSelect.value = String(rowId);
          loadTemplateIntoEditor(Templates.byId(rowId));
        }
        return I18n.t(back.renamed ? 'status.templateRestoredAs' : 'status.templateRestored', { name: back.nom });
      }
      return { undo: remove, redo: bringBack };
    }

    // Menu « Enregistrer » : le bouton garde son geste (un clic, un enregistrement) et son survol ouvre « Enregistrer sous… » (une copie), « Historique des
    // versions… » (openVersionHistory) et la case « Enregistrement automatique » (cochée par défaut). Même mécanisme que les autres boutons à menu (.v2-hover-group, css/editor-v2.css).
    // - Le bouton ne prend pas le focus à la souris, comme tout bouton à menu au survol (délégation de js/editor-core.js) : sinon son menu
    //   (:focus-within) resterait affiché une fois la souris partie, et le curseur quitterait le texte. Un champ de saisie qui l'avait (renommage…) le
    //   perd au clic, avant onSave : le nom validé est bien celui qui s'enregistre. Les lignes du menu, des <span tabindex="0">, sont traitées de même.
    // - Entrée et Espace agissent sur les lignes, qui restent ainsi atteignables au clavier ; le menu reste ouvert tant que le focus est dedans. Au
    //   clavier, « Enregistrer sous… » met d'abord le focus sur le bouton : la fenêtre qu'elle ouvre le lui rend à sa fermeture, ce qu'une ligne de
    //   menu refermée ne pourrait pas recevoir.
    // - La boucle setInterval de l'enregistrement automatique tourne toujours une fois démarrée ; seul autosaveTick teste isAutosaveEnabled. Décocher
    //   la case fait donc sauter les passages sans rien arrêter ni recréer (une lecture du réglage toutes les 2,5 s).
    function wireSaveMenu() {
      const saveBtn = document.getElementById('btn-save');
      const saveAsRow = document.getElementById('v2-btn-save-as');
      const historyRow = document.getElementById('v2-btn-history');
      const autosaveRow = document.getElementById('v2-btn-autosave');
      if (!saveBtn) return;
      const holdFocus = (event) => event.preventDefault();
      const blurTextField = () => {
        const active = document.activeElement;
        if (EditorCore.isFormFieldFocus(active)) active.blur();
      };
      saveBtn.addEventListener('click', onSave);
      // La coche du menu et l'aspect du bouton disent le même état.
      const syncAutosaveRow = () => {
        if (autosaveRow) autosaveRow.setAttribute('aria-checked', isAutosaveEnabled() ? 'true' : 'false');
        syncSaveButtonLook();
      };
      const toggleAutosave = () => {
        const enabled = !isAutosaveEnabled();
        setAutosaveEnabled(enabled);
        syncAutosaveRow();
        setStatus(I18n.t(enabled ? 'status.autosaveEnabled' : 'status.autosaveDisabled'));
        // Coupé avec des modifications déjà en attente : l'indicateur « Modifications non enregistrées » passe devant le message du geste, qui n'aurait
        // été lu qu'un instant.
        if (!enabled && persist.autosaveDirty) updateSaveStatus();
        // Réactiver ne remet rien à zéro : effacer autosaveDirty ferait perdre ce qui a été tapé pendant la coupure et passer sous silence un
        // changement fait ailleurs. Rien n'est à resynchroniser : onSave et le chargement d'un modèle tiennent autosaveLastKnownDateModif à jour même
        // éteint ; le prochain passage enregistre ce qui est en attente, ou ouvre le bandeau de conflit si le modèle a changé ailleurs.
      };
      const wireRow = (row, action) => {
        if (!row) return;
        row.addEventListener('mousedown', holdFocus);
        row.addEventListener('click', () => { blurTextField(); action(false); });
        row.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          action(true);
        });
      };
      wireRow(saveAsRow, (viaKeyboard) => { if (viaKeyboard) saveBtn.focus(); onSaveAs(); });
      wireRow(historyRow, (viaKeyboard) => { if (viaKeyboard) saveBtn.focus(); openVersionHistory(); });
      wireRow(autosaveRow, toggleAutosave);
      syncAutosaveRow();
      // Le choix est par navigateur : un autre onglet (ou un autre widget du même document) qui le change se voit ici aussi, sans rechargement.
      // L'évènement ne part que dans les autres pages ; `key` vaut null quand tout le stockage est vidé.
      window.addEventListener('storage', (event) => {
        if (event.key !== null && event.key !== AUTOSAVE_ENABLED_STORAGE) return;
        syncAutosaveRow();
        if (persist.autosaveDirty) updateSaveStatus();
      });
    }

    return { SAVE_WATCHDOG_MS, onDelete, onSave, saveAsNewTemplate, saveIsRunning, whenSaveFinished, wireSaveMenu };
  }

  return { create };
})();
