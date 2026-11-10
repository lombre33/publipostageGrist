// Les droits par personne (js/access-rights.js) côté main.js : le verrou d'interface (classe pp-access-locked : on grise, jamais on ne masque ni ne retire), les grisés de la barre de mise en forme, des
// exports, des marges et de la lecture d'un PDF, les commentaires, la réponse de Grist quand l'accès change, la Lecture épurée d'un compte en lecture seule et la fenêtre des nouveautés. Sorti de
// js/main.js (refactorisation du 10/11, découpe 10) : le mode y est lu par une fonction, `newsMayOpen` (que l'init de main.js lit aussi) par un lecteur et un écriveur ; le reste lui est donné par `api`.
// Les corps sont ceux de main.js.
const MainAccess = (function () {
  function create(api) {
    const { getCurrentMode, getNewsMayOpen, isAccessGuideShown, setNewsMayOpen, setStatus, switchMode, syncEditorVisibilityForMode, updateSaveStatus } = api;

    // Droits par personne (js/access-rights.js)
    // Verrou d'interface seulement : grise (classe pp-access-locked, jamais masqué ni retiré), et les gardes des fonctions d'action (onSave,
    // switchMode, withExportLock, autosaveTick...) couvrent les raccourcis clavier et les appels directs. Seules les règles d'accès de Grist protègent
    // les données.
    const ACCESS_LOCK_CLASS = 'pp-access-locked';
    // Tout ce qui modifie le modèle ou écrit dans Grist, en plus de la barre de mise en forme entière (#v2-toolbar, sauf Commenter qui suit son propre
    // droit).
    const READ_ONLY_LOCKED_IDS = ['v2-new-template-group', 'btn-organize-templates', 'v2-save-group', 'btn-delete', 'btn-link-rules',
      'btn-mode-edit', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'];
    // Le droit d'export couvre PDF (une ligne, ZIP, PDF unique), Word, Excel et la création d'email : #v2-quality-group (le type d'export) et
    // #v2-export-pdf-group (le bouton Exporter et ses lignes, Word et Excel compris) sont grisés ensemble.
    const EXPORT_LOCKED_IDS = ['v2-quality-group', 'v2-export-pdf-group', 'btn-create-email'];
    // Les quatre champs des marges, et avec eux les quatre préréglages et la chaîne qui lie les marges (js/settings.js) : tout ce qui change une marge est grisé.
    // Annuler et Rétablir, que la lecture d'un PDF garde actifs (applyFormattingBarLock).
    const PDF_HISTORY_IDS = ['v2-btn-undo', 'v2-btn-redo'];
    const READ_ONLY_DISABLED_INPUTS = ['settings-margin-top', 'settings-margin-right', 'settings-margin-bottom', 'settings-margin-left',
      'settings-margin-preset-none', 'settings-margin-preset-narrow', 'settings-margin-preset-classic', 'settings-margin-preset-wide', 'settings-margins-link'];
    // Réglage présent au démarrage : les droits sont attendus avant le premier affichage, au plus ce délai (Grist qui tarde à répondre) - au-delà le
    // widget démarre verrouillé (AccessRights.get() tant que le calcul n'a pas abouti) et se déverrouille seul à la réponse.
    const ACCESS_STARTUP_WAIT_MS = 5000;
    // Délai après l'ouverture au bout duquel les colonnes exactes des tables sont relues si rien ne l'a fait (l'affichage du premier modèle les demande
    // déjà, Editor.setHTML).
    const EXACT_SCHEMA_CHECK_MS = 2500;

    function isReadOnly() { return AccessRights.get().readOnly; }

    // `reason` : la clé de la phrase qui dit pourquoi (js/i18n.js, « lock.* »), l'info-bulle du contrôle et ce que son clic écrit dans le coin d'état (js/lock-reasons.js, cause « access »).
    function setAccessLocked(el, locked, reason) {
      if (!el) return;
      el.classList.toggle(ACCESS_LOCK_CLASS, locked);
      if (locked) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
      LockReasons.set(el, 'access', locked && reason ? I18n.t(reason) : '');
    }

    // Pendant la lecture d'un PDF (js/pdf-reading.js, consigne GFS 040), ce qui ne s'applique pas à lui reste là, GRISÉ avec sa raison - dans l'info-bulle du survol (`title`, comme setExplained de js/main-toolbar.js :
    // l'info-bulle de l'app, qu'un grisé estomperait avec le bouton, est cachée en CSS) et, au clic, dans le coin d'état -, jamais caché : l'édition, ce qui change ou range un modèle (enregistrer, renommer, supprimer, la
    // page), l'export et les commentaires. « Nouveau » et l'arbre des modèles restent actifs : ouvrir un modèle ferme le PDF (loadTemplateIntoEditor). Un compte en lecture seule garde en plus son propre grisé
    // (ACCESS_LOCK_CLASS), qui ne s'efface pas avec celui-ci. Les règles de la feuille de style : extensions/lecture-pdf/pdf-view.css.
    const PDF_LOCK_CLASS = 'pp-pdf-locked';
    const PDF_LOCKS = [
      { reason: 'edit', ids: ['btn-mode-edit'] },
      { reason: 'template', ids: ['v2-save-group', 'btn-delete', 'btn-link-rules', 'btn-rename-template', 'btn-set-default-template', 'v2-pdf-filename-cluster', 'v2-page-group'] },
      { reason: 'export', ids: EXPORT_LOCKED_IDS },
      { reason: 'comment', ids: ['v2-btn-comment'] },
    ];
    function applyPdfLocks() {
      const on = PdfReading.isActive();
      const reasons = on ? PdfReading.reasons() : null;
      PDF_LOCKS.forEach(({ reason, ids }) => ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const wasOn = el.classList.contains(PDF_LOCK_CLASS);
        // Sans raison, pas de grisé : « Commenter » se dégrise pour un PDF qui a du texte (js/pdf-reading.js:reasons).
        const locked = on && !!reasons[reason];
        el.classList.toggle(PDF_LOCK_CLASS, locked);
        // La raison est l'info-bulle du contrôle et ce que son clic écrit dans le coin d'état : js/lock-reasons.js (cause « pdf »), qui rend aussi au dégrisé le `title` d'avant.
        LockReasons.set(el, 'pdf', locked ? reasons[reason] : '');
        if (locked) {
          el.setAttribute('aria-disabled', 'true');
          el.setAttribute('data-pp-pdf-reason', reasons[reason]);
        } else if (wasOn) {
          el.removeAttribute('data-pp-pdf-reason');
          if (!el.classList.contains(ACCESS_LOCK_CLASS)) el.removeAttribute('aria-disabled');
        }
      }));
    }

    // Barre de mise en forme et d'insertion (#v2-toolbar) : grisée en lecture seule, dès que la Lecture est affichée, choisie ou imposée, et tant que la
    // carte de l'accès remplace l'éditeur. L'éditeur y est masqué mais ses commandes restent actives : un clic sur Tableau, Sommaire ou Citation
    // modifierait le modèle caché, que l'enregistrement automatique écrirait sans rien montrer. Commenter suit son propre droit, jamais le mode : dans la
    // Lecture il agit sur le texte sélectionné dans la Lecture (applyCommentsPermissions). Modes, aperçu A4, réglages, arbre des modèles et exports ne
    // font pas partie de #v2-toolbar et restent actifs. Rappelée par applyAccessRights (droits), switchMode (mode) et onWidgetAccessChange (accès).
    function applyFormattingBarLock() {
      const formattingBar = document.getElementById('v2-toolbar');
      if (!formattingBar) return;
      const locked = isReadOnly() || getCurrentMode() === 'read' || isAccessGuideShown();
      // Pourquoi, dans l'ordre : un document en lecture seule, le mode lecture, la carte de l'accès. Les séparateurs se grisent avec la barre mais ne disent rien : on ne les clique pas.
      const reason = isReadOnly() ? 'lock.readOnly' : getCurrentMode() === 'read' ? 'lock.readMode' : 'lock.accessGuide';
      // Un PDF à l'écran se commente (extensions/lecture-pdf/pdf-comments.js) et ses commentaires se défont par l'historique de l'éditeur caché (js/action-history.js) : Annuler et Rétablir suivent alors le droit de commenter,
      // comme Commenter (et disent la même raison), au lieu du grisé de la Lecture.
      const followComments = PdfReading.isActive() && !isAccessGuideShown();
      Array.from(formattingBar.children).forEach((child) => {
        if (child.id === 'v2-btn-comment') return;
        const follows = followComments && PDF_HISTORY_IDS.indexOf(child.id) !== -1;
        setAccessLocked(child, follows ? !AccessRights.get().canComment : locked, child.classList.contains('v2-sep') ? '' : (follows ? 'lock.noComment' : reason));
      });
    }

    // Commentaires : la Lecture les montre et en accepte de nouveaux (js/comments.js:readerMode) dès qu'elle est affichée, choisie ou imposée par la
    // lecture seule, pour toute personne qui a le droit de commenter. Sans cela, Commenter dans une Lecture choisie poserait sa marque sur la sélection
    // de l'éditeur masqué, enregistrée sans rien montrer. En Édition, Commenter agit sur l'éditeur. Rappelée par applyAccessRights (droits) et
    // switchMode (mode, avant le dessin de la Lecture : renderReader lit cet état).
    function applyCommentsPermissions() {
      const rights = AccessRights.get();
      Comments.setPermissions({ canComment: rights.canComment, readerMode: rights.canComment && (rights.readOnly || getCurrentMode() === 'read') });
    }

    function applyAccessRights() {
      const rights = AccessRights.get();
      READ_ONLY_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), rights.readOnly, 'lock.readOnly'));
      applyFormattingBarLock();
      setAccessLocked(document.getElementById('v2-btn-comment'), !rights.canComment, 'lock.noComment');
      EXPORT_LOCKED_IDS.forEach(id => setAccessLocked(document.getElementById(id), !rights.canExport, 'lock.noExport'));
      // Les marges de Réglages : grisées en lecture seule, avec leur raison en info-bulle (cause « state » : un champ `disabled` ne reçoit pas le clic).
      READ_ONLY_DISABLED_INPUTS.forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.disabled = rights.readOnly;
        LockReasons.set(input, 'state', rights.readOnly ? I18n.t('lock.readOnly') : '');
      });
      applyCommentsPermissions();
      applyPdfLocks();
      updateSaveStatus();
      LiveEntry.changed(); // un document en lecture seule ne s'écrit pas en direct : la ligne du menu suit les droits (js/live-entry.js)
      SlidesEntry.changed(); // ni ses diapositives (js/slides-entry.js)
    }

    // Grist rend les options du widget quand son accès change (GristAPI.onAccessLevelChange) : la carte de l'accès arrive ou s'en va tout de suite, et la
    // barre de mise en forme se grise ou se dégrise avec elle. Grist reconstruit en fait le cadre du widget à chaque changement d'accès (WidgetFrame.ts) :
    // la page repart alors de zéro, ce rappel couvre seulement la réponse qui arrive après le premier affichage.
    function onWidgetAccessChange() {
      syncEditorVisibilityForMode();
      applyFormattingBarLock();
    }

    // Droits changés en cours de session (case cochée dans la table, réglage modifié) : switchMode force lui-même le mode Lecture en lecture seule ;
    // sinon un mode Lecture déjà affiché est redessiné, commentaires montrés ou non.
    function onAccessRightsChange() {
      applyAccessRights();
      if (isReadOnly() || getCurrentMode() === 'read') switchMode(getCurrentMode());
      openCleanReadingForReadOnly();
      openNewsForEditors();
    }

    // Case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (Réglages > Accès) : voir CleanReading.openForReadOnly, qui décide une seule
    // fois par session. Appelée à la fin d'init() puis à chaque changement de droits : tant que la table des droits n'a pas donné de réponse (pending,
    // Grist lent ; error, table illisible), rien n'est décidé - une personne qui a tous les droits démarre verrouillée par précaution et ne doit jamais
    // être mise en Lecture épurée sur cette foi.
    function openCleanReadingForReadOnly() {
      const config = AccessRights.getConfig();
      CleanReading.openForReadOnly({ state: AccessRights.getStatus().state, readOnly: AccessRights.get().readOnly, enabled: !!(config && config.cleanReading) });
    }

    function openNewsForEditors() {
      if (!getNewsMayOpen()) return;
      WhatsNew.openOnFirstConnection(() => ({
        answered: CleanReading.isAnswered(AccessRights.getStatus().state),
        readOnly: isReadOnly(),
        usable: !CleanReading.isActive() && !ReaderGuide.editorLacksAccess(),
      })).catch(e => console.warn('[main] fenêtre des nouveautés non ouverte', e));
    }

    // Un clic (souris, clavier, ou .click() d'un autre module) sur une commande grisée par applyAccessRights ou applyFormattingBarLock est arrêté en
    // capture, avant tout gestionnaire. Et sur tout contrôle grisé qui dit pourquoi (js/lock-reasons.js : les droits, la lecture d'un PDF, le type du modèle,
    // une grille...) : le clic ne fait rien et le coin d'état en dit la raison, comme l'info-bulle du survol. Les deux gardes se complètent : le premier
    // arrête aussi ce qui n'a pas de raison.
    function wireAccessLockGuard() {
      document.addEventListener('click', event => {
        const target = event.target;
        if (!target || !target.closest || !target.closest('.' + ACCESS_LOCK_CLASS)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const reason = LockReasons.reasonOf(target.closest('.' + ACCESS_LOCK_CLASS));
        if (reason) setStatus(reason);
      }, true);
      LockReasons.wire(setStatus);
    }

    return {
      ACCESS_STARTUP_WAIT_MS, EXACT_SCHEMA_CHECK_MS, applyAccessRights, applyCommentsPermissions, applyFormattingBarLock, applyPdfLocks, isReadOnly,
      onAccessRightsChange, onWidgetAccessChange, openCleanReadingForReadOnly, openNewsForEditors, wireAccessLockGuard,
    };
  }

  return { create };
})();
