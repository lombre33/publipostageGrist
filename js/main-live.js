// Le suivi des modifications de l'éditeur et l'écriture en direct à plusieurs : ce que la frappe, un réglage ou un champ e-mail changent (wireEditTracking : l'état « à enregistrer »), l'adoption d'un enregistrement
// fait par la personne qui écrit en direct (adoptLiveSave), et le moment où le texte peut être remplacé (textMayBeReplaced). Sorti de js/main.js (refactorisation du 10/11, découpe 11) : le mode et le type du
// modèle y sont lus par des fonctions ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainLive = (function () {
  function create(api) {
    const {
      eachEmailInput, emailCciInput, emailCciToggle, emailPjInput, emailPjToggle, getCurrentMode, getCurrentTypeModele, hideConflictBanner, isAccessGuideShown, isExportRunning, isReadOnly,
      markAutosaveDirty, markTextDirty, onPageLayoutChanged, onWatermarkChanged, pdfFilenameInput, persist, scheduleEmailLengthGauge, templateNameInput,
      updateSaveStatus, wireCciToggle,
    } = api;

    // Tout ce qui marque le brouillon « modifié » ou rafraîchit la jauge de l'email : l'éditeur, les champs du modèle et les réglages de page.
    function wireEditTracking() {
      // 'update' et non 'transaction' : ne part que si le document a réellement changé (docChanged), jamais pour un simple déplacement du curseur ou de
      // la sélection (cf. la section Enregistrement automatique plus haut). Couvre aussi l'édition de l'en-tête et du pied (même instance d'éditeur,
      // contenu échangé par setContent).
      // Hors la synchro des tableaux liés (js/linked-table.js:syncOpen) : un tableau qui suit son modèle n'est pas une modification de la personne, et ouvrir un document n'écrit rien.
      // Le texte reçu d'une autre personne de l'écriture en direct compte, il reste à enregistrer jusqu'à ce que l'une d'elles l'ait fait ; l'accroche du texte au salon (au démarrage) non.
      EditorCore.getEditor().on('update', ({ transaction }) => { if (!LinkedTable.isSyncTransaction(transaction) && !SlideLinks.isSyncTransaction(transaction) && !LiveEntry.isSettingUp()) markTextDirty(); });
      EditorCore.getEditor().on('update', scheduleEmailLengthGauge);
      if (templateNameInput) templateNameInput.addEventListener('input', markAutosaveDirty);
      if (pdfFilenameInput) pdfFilenameInput.addEventListener('input', markAutosaveDirty);
      // Annuler ou Rétablir rend une valeur à un champ (js/field-editor.js, domaine « fields ») : le crayon du nom du PDF et les boutons « + Cci » et « + PJ » en montrent l'état, comme au chargement d'un modèle.
      if (pdfFilenameInput) pdfFilenameInput.addEventListener('fieldrestored', () => { pdfFilenameInput.hidden = !pdfFilenameInput.value.trim(); });
      [[emailCciToggle, emailCciInput], [emailPjToggle, emailPjInput]].forEach(([toggle, input]) => {
        if (!input) return;
        input.addEventListener('fieldrestored', () => {
          input.hidden = !input.value.trim();
          if (toggle) toggle.classList.toggle('is-active', !input.hidden);
        });
      });
      // Les champs sont des éditeurs de bulles (js/field-editor.js) : la liste # n'y propose que des variables et les puces qui s'écrivent en texte (date,
      // heure, email et nom de l'utilisateur) - une note de bas de page, un bloc conditionnel ou un calcul n'ont aucun sens dans un objet ou une liste
      // d'adresses.
      eachEmailInput(el => {
        el.addEventListener('input', markAutosaveDirty);
        el.addEventListener('input', scheduleEmailLengthGauge);
      });
      wireCciToggle();
      // Émis par js/settings.js à chaque saisie dans les quatre champs de marge (onglet Réglages) : changer seulement les marges ne touche pas au
      // texte, et sans cet évènement le brouillon ne serait jamais marqué « modifié ».
      // En écriture en direct, la page est celle du groupe (extensions/edition/live-page.js) : changée ici, ou reçue d'une autre personne (`detail.remote`, rien à marquer, le modèle est déjà « à enregistrer »),
      // elle n'est pas un réglage de cette personne. Le modèle est seulement « à enregistrer » et c'est la personne qui enregistre qui l'écrit, avec le texte : une personne qui n'enregistre pas ne réécrit
      // jamais la page à sa place (une page restée en retard écraserait celle du groupe).
      document.addEventListener('pp:marginsChanged', (event) => {
        if (event.detail && event.detail.remote) return;
        if (LiveEntry.isLive()) markTextDirty(); else markAutosaveDirty();
      });
      // Émis par PageLayout.setOrientation (bouton Portrait / Paysage) : la feuille change de largeur et de hauteur. Le bouton ne rafraîchit rien
      // lui-même.
      document.addEventListener('pp:pageLayoutChanged', onPageLayoutChanged);
      // Émis par PageLayout.setWatermark (fenêtre « Filigrane… ») : la couche des pages est repeinte, la page ne change pas de forme.
      document.addEventListener('pp:watermarkChanged', onWatermarkChanged);
      // Émis par MailtoExport.setMailClient (Réglages > Email) : le lien de l'email, donc sa longueur, change avec la messagerie choisie.
      document.addEventListener('pp:mailClientChanged', scheduleEmailLengthGauge);
    }

    // La date `a` d'un modèle est-elle antérieure à `b` ? (secondes de Grist, ou leur écriture ISO quand la relecture a échoué ; une date illisible n'est antérieure à rien)
    function dateModifBefore(a, b) {
      const seconds = value => (typeof value === 'number' ? value : Date.parse(value) / 1000);
      const x = seconds(a), y = seconds(b);
      return Number.isFinite(x) && Number.isFinite(y) && x < y && !Templates.sameDateModif(a, b);
    }
    // L'écriture en direct (extension « édition », js/live-entry.js) : ce que le socle lui dit du modèle ouvert, ce qu'elle peut lui demander, et l'enregistrement d'une autre personne du direct.
    // Sa date est celle que ce widget connaît maintenant (le passage suivant n'y voit pas un conflit) et, si le texte d'ici est dans l'état qu'elle a enregistré, rien n'est plus « à enregistrer ».
    function adoptLiveSave({ modified, atState }) {
      if (!LiveEntry.isLive()) return;
      // Jamais en arrière : le dernier enregistrement que le salon garde peut être plus ancien que le modèle ouvert ici (enregistré depuis, hors du direct) ; sa date ferait voir un conflit qui n'en est pas un.
      if (dateModifBefore(modified, persist.autosaveLastKnownDateModif)) return;
      persist.autosaveLastKnownDateModif = modified;
      // Une page ouverte hors du direct pendant que le groupe enregistrait montre le bandeau « modifié ailleurs » d'un enregistrement du groupe ; en rejoignant, elle prend le texte du groupe, qui est
      // celui de cet enregistrement ou d'un plus récent : le conflit est réglé. Un enregistrement fait depuis hors du direct (plus récent que celui du groupe) garde le bandeau.
      if (persist.autosaveConflictActive && persist.autosaveConflictTpl && !dateModifBefore(modified, persist.autosaveConflictTpl.dateModif)) hideConflictBanner();
      if (atState && !persist.autosaveSettingsDirty) persist.autosaveDirty = false;
      updateSaveStatus();
    }
    // Le texte affiché peut-il être remplacé par celui d'un direct déjà en cours (l'entrée automatique, js/live-entry.js) sans que la personne s'y attende ? Pas quand l'écran est à autre chose qu'à ce
    // texte : la Lecture, la carte de l'accès, une question de départ, une restauration de version, un export, un conflit à trancher, l'en-tête ou le pied en édition, un gros modèle qui se remplit encore par morceaux (js/main.js:fillOpenedPresentation).
    function textMayBeReplaced() {
      return getCurrentMode() === 'edit' && !isAccessGuideShown() && !persist.leavePromptOpen && !persist.restoringVersion && !isExportRunning() && !persist.autosaveConflictActive && !Editor.isEditingHeaderFooter() && !ImportPlacing.isFilling();
    }
    function wireLiveEditing() {
      LiveEntry.setContext(() => ({ id: Templates.getCurrentId(), type: getCurrentTypeModele(), readOnly: isReadOnly(), dirty: persist.autosaveDirty, modified: persist.autosaveLastKnownDateModif, idle: textMayBeReplaced() }));
      LiveEntry.setHooks({ markUnsaved: markTextDirty });
      LiveEntry.onSaved(adoptLiveSave);
    }

    return { wireEditTracking, wireLiveEditing };
  }

  return { create };
})();
