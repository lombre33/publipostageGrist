// Quitter le modèle ouvert : la question « Enregistrer / Abandonner / Annuler » quand une modification attend (askBeforeLeaving), l'enregistrement qui précède le départ vers GFS
// (saveBeforeGfsLeaves, leaveForGfs). Sorti de js/main.js (refactorisation du 10/11, découpe 8) : l'état qu'il partage avec l'enregistrement est l'objet `persist` de main.js (découpe 7), donné par
// `api` avec ce qu'il tire de js/main-save.js et de js/main-autosave.js. Les corps sont ceux de main.js.
const MainLeave = (function () {
  function create(api) {
    const {
      AUTOSAVE_TICK_WATCHDOG_MS, getCurrentTypeModele, isAutosaveEnabled, isReadOnly, onSave, persist, refocusEditorIfLost, saveIsRunning, templateNameInput,
      whenAutosaveTickDone, whenSaveFinished,
    } = api;

    // Quitter le modèle courant avec des modifications en attente
    // Changer de modèle, créer un document, un email ou une grille, ou en créer un depuis la galerie remplace le contenu de l'éditeur : ce qui
    // attendait d'être enregistré (autosaveDirty : enregistrement automatique coupé, ou allumé mais dans les 2,5 s d'avant le prochain passage)
    // disparaîtrait sans rien demander. Une fenêtre Enregistrer / Abandonner / Annuler est donc posée, que l'enregistrement automatique soit allumé ou
    // non.
    // Pas de question quand rien n'attend, ni en lecture seule (rien ne s'enregistre pour cette personne), ni pour un macro-modèle (il s'édite dans sa
    // fenêtre). Les appelants gardent leur chemin synchrone quand il n'y a rien à demander : `if (hasEditsToConfirmBeforeLeaving() && !(await
    // askBeforeLeaving())) return;`.
    function hasEditsToConfirmBeforeLeaving() {
      return persist.autosaveDirty && !isReadOnly() && getCurrentTypeModele() !== 'macro';
    }

    // true : on peut continuer (« Abandonner », ou « Enregistrer » réussi) ; false : la personne reste (« Annuler », Échap, enregistrement refusé : le
    // message d'erreur est alors dans le coin d'état). Sans nom il n'y a pas d'« Enregistrer » : un nouveau modèle jamais enregistré ne peut pas l'être
    // tant qu'il n'en a pas.
    async function askBeforeLeaving() {
      const name = templateNameInput ? templateNameInput.value.trim() : '';
      const choices = [{ value: 'discard', label: I18n.t('dialog.unsaved.discard') }];
      if (name) choices.push({ value: 'save', label: I18n.t('common.save'), primary: true });
      persist.leavePromptCount++; // plusieurs demandes peuvent se chevaucher (un deuxième clic pendant l'attente ci-dessous) : le drapeau ne retombe qu'avec la dernière
      persist.leavePromptOpen = true; // plus aucun passage de l'enregistrement automatique ne part
      let choice;
      try {
        // Un passage déjà parti finit d'écrire pendant la question, que le drapeau ci-dessus n'arrête pas (il n'est regardé qu'au départ d'un passage) : « Abandonner » ne laisserait rien à
        // abandonner. Il est donc attendu d'abord ; s'il a tout enregistré, il n'y a plus rien à demander.
        if (persist.autosaveTickPending) {
          await whenAutosaveTickDone(LEAVE_PROMPT_TICK_WAIT_MS);
          if (!hasEditsToConfirmBeforeLeaving()) return true;
        }
        choice = await Dialogs.choose({
          title: I18n.t('dialog.unsaved.title'),
          message: name ? I18n.t('dialog.unsaved.message', { name }) : I18n.t('dialog.unsaved.messageNoName'),
          choices,
        });
      } finally { if (--persist.leavePromptCount === 0) persist.leavePromptOpen = false; }
      if (choice === 'discard') return true;
      if (choice === 'save') {
        await onSave();
        return !persist.autosaveDirty;
      }
      // Annuler : la personne reprend où elle en était.
      refocusEditorIfLost();
      return false;
    }

    // GFS laisse la place à une autre app ou au fichier d'une autre app (appel `fermer { raison }`, consigne GFS 047), ou donne à l'app un autre de ses fichiers (appel `ouvrir`) : ce qui attend d'être enregistré l'est AVANT de partir,
    // sans question quand l'enregistrement automatique est allumé - la personne a dit, en l'allumant, qu'elle veut que l'app enregistre (« j'enregistre et je pars »). La question « Enregistrer / Abandonner / Annuler »
    // (askBeforeLeaving) ne reste que pour ce que l'app ne peut pas décider seule : l'enregistrement automatique coupé, un modèle sans nom (il ne peut pas être enregistré), un modèle changé ailleurs (l'enregistrer serait
    // trancher à la place de la personne : seul son « Enregistrer » le fait) et une écriture qui échoue. Les sorties de l'app elle-même (changer de modèle dans la liste, « Nouveau »...) gardent leur question, enregistrement
    // automatique allumé ou non : ce choix est le leur. Rien n'est dit « fini » pendant qu'une écriture court : le passage de l'enregistrement automatique en route, un enregistrement fait à la main et une restauration de version
    // finissent d'abord, et aucun nouveau passage ne part pendant ce temps (leavePromptOpen, comme pendant la question).
    // Contrairement à la question de départ (LEAVE_PROMPT_TICK_WAIT_MS : la personne attend une fenêtre), l'attente va jusqu'au garde-fou d'un passage : GFS a sa propre fenêtre « ne répond pas » au bout de 10 secondes, et un
    // Grist lent (la première écriture d'un document crée des tables) ne doit pas faire écrire deux fois en même temps.
    async function saveBeforeGfsLeaves() {
      persist.leavePromptCount++;
      persist.leavePromptOpen = true;
      try {
        const giveUpAt = Date.now() + AUTOSAVE_TICK_WATCHDOG_MS;
        await whenAutosaveTickDone();
        while (persist.restoringVersion && Date.now() < giveUpAt) await new Promise(resolve => setTimeout(resolve, 40));
        while (saveIsRunning() || persist.saveWaiting) await (persist.saveWaiting || whenSaveFinished());
        if (!hasEditsToConfirmBeforeLeaving()) return;
        const named = !!(templateNameInput && templateNameInput.value.trim());
        if (isAutosaveEnabled() && named && !persist.autosaveConflictActive && !persist.restoringVersion) await onSave();
      } finally { if (--persist.leavePromptCount === 0) persist.leavePromptOpen = false; }
    }

    // L'appel `fermer` de GFS (js/gfs-open.js) : vrai, l'app peut laisser la place - rien n'attendait, tout est enregistré, ou la personne a répondu « Abandonner » ; faux, la personne reste (« Annuler », Échap, un enregistrement
    // refusé : tout reste en place). GFS ne détruit le cadre qu'après le vrai.
    async function leaveForGfs() {
      await saveBeforeGfsLeaves();
      return !hasEditsToConfirmBeforeLeaving() || askBeforeLeaving();
    }

    // Le temps que la question « Enregistrer / Abandonner / Annuler » laisse à un passage déjà parti pour finir d'écrire (askBeforeLeaving) : un passage normal dure bien moins, Grist lent quelques secondes.
    const LEAVE_PROMPT_TICK_WAIT_MS = 8000;

    return { askBeforeLeaving, hasEditsToConfirmBeforeLeaving, leaveForGfs, saveBeforeGfsLeaves };
  }

  return { create };
})();
