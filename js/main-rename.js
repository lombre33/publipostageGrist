// Le renommage du modèle ouvert : le crayon qui fait apparaître le champ du nom, sa validation (Entrée, perte du focus) ou son abandon (Échap) avec le repère d'Annuler, le nom que la liste affiche, et la reprise
// du nom qu'une autre personne ou GFS a écrit dans la table. Sorti de js/main.js (refactorisation du 10/11, découpe 9) : les variables du geste (nameBeforeEdit, nameSession) sont à lui ; le nom que le titre
// tient de la table (titleNameBase) reste à main.js, qui le prête par un lecteur et un écriveur ; le reste lui est donné par `api`. Les corps sont ceux de main.js.
const MainRename = (function () {
  function create(api) {
    const {
      getTitleNameBase, isAutosaveEnabled, markAutosaveDirty, pdfFilenameInput, resetNewOptionText, setStatus, setTitleNameBase, templateNameInput,
      templateSelect,
    } = api;

    // Le nom du modèle et son nom de fichier PDF. Ce dernier est toujours replié au chargement, même quand un nom est déjà réglé : l'interface de base
    // reste épurée, le crayon (wirePdfFilenameToggle) le déplie à la demande, et la valeur n'est jamais perdue.
    function showTemplateNames(tpl) {
      resetNewOptionText();
      if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
      setTitleNameBase(tpl && tpl.nom != null ? String(tpl.nom).trim() : null);
      if (pdfFilenameInput) {
        pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
        pdfFilenameInput.hidden = true;
      }
    }

    let nameBeforeEdit = null; // le nom du modèle quand le crayon a ouvert le champ ; null hors saisie
    let nameSession = null; // le geste de renommage que le crayon a ouvert : son repère d'Annuler se pose à la validation (HistoryMarkers, domaine « name ») ; null hors saisie

    // La liste choisit et affiche le modèle courant, le crayon fait apparaître le champ du nom à sa place : `hidden` sur le <select> réel suffit,
    // js/template-tree-select.js masque alors son déclencheur (sinon le champ s'ouvrirait à côté de la liste). Le renommage ne touche que l'affichage ;
    // il s'enregistre au prochain clic sur Enregistrer ou à l'enregistrement automatique, qui lit la saisie.
    function closeTemplateRenameEditor() {
      if (!templateNameInput || !templateSelect) return;
      templateNameInput.hidden = true;
      templateSelect.hidden = false;
      nameBeforeEdit = null;
      nameSession = null;
    }

    // Le nom que la liste montre pour le modèle ouvert, tant qu'il n'est pas enregistré (même libellé que refreshTemplateList : l'étoile du modèle par défaut reste). Un modèle neuf sans nom reprend l'invite.
    function showNameInList(name) {
      if (!name) { resetNewOptionText(); return; }
      const opt = templateSelect.options[templateSelect.selectedIndex];
      if (opt) opt.textContent = Templates.isDefault(opt.value) ? name + ' ★' : name;
    }

    // Le nom sous lequel le modèle vient d'être enregistré : celui de la galerie, ou « nom (2) » s'il existait déjà (les messages de la galerie disent
    // le nom retenu).
    function savedTemplateName(fallback) {
      const name = templateNameInput ? templateNameInput.value.trim() : '';
      return name || fallback;
    }

    // Un nom déjà pris par un autre modèle devient « nom (2) », « nom (3) »... Posé quand la saisie est validée (Entrée, clic ailleurs,
    // enregistrement), jamais à chaque lettre : le champ ne change pas sous les doigts de la personne qui tape, et l'enregistrement automatique, qui
    // n'écrit que le nom courant, n'y touche pas.
    // Un modèle enregistré dont le nom n'a pas changé reste tel quel, même avec un doublon antérieur : seul un nom nouveau est vérifié (modèle pas
    // encore enregistré, ou nom changé depuis l'ouverture du crayon). Rend le nom retenu ; s'il a changé, le champ le prend et le coin d'état le dit.
    function settleTemplateName() {
      if (!templateNameInput) return '';
      const typed = templateNameInput.value.trim();
      if (!typed) return typed;
      const id = Templates.getCurrentId();
      const stored = Templates.byId(id);
      // Pas encore enregistré (id nul : nouveau modèle, copie, galerie) : le nom est toujours vérifié.
      const previous = id == null ? null : (nameBeforeEdit != null ? nameBeforeEdit : (getTitleNameBase() !== null ? getTitleNameBase() : (stored ? stored.nom : null)));
      if (previous != null && Templates.sameName(typed, previous)) return typed;
      const unique = Templates.uniqueName(typed, id);
      if (unique !== typed) {
        templateNameInput.value = unique;
        markAutosaveDirty(); // le nom a pu être écrit tel que tapé par un passage de l'enregistrement automatique : le prochain écrit le nouveau
        // Enregistrement automatique coupé, le coin d'état garde « Modifications non enregistrées. » : ce message-là protège ce qui n'est écrit nulle
        // part, le nouveau nom se lit dans le titre.
        if (isAutosaveEnabled()) setStatus(I18n.t('status.nameExists', { name: unique }));
      }
      return unique;
    }

    // Le titre prend le nom que la table porte pour le modèle ouvert quand la personne n'a pas changé le sien et qu'un autre l'a renommé depuis (l'explorateur de GFS, consigne 029). Appelée quand le cache des modèles vient
    // d'être relu : à chaque passage de l'enregistrement automatique qui lit la table, et à chaque rafraîchissement de la liste. Jamais pendant la saisie du crayon, ni sur un nom que la personne a tapé : c'est le sien
    // qui part alors à l'enregistrement.
    function adoptTableName() {
      if (!templateNameInput || !templateSelect || getTitleNameBase() === null || nameBeforeEdit !== null) return;
      const id = Templates.getCurrentId();
      const stored = id == null ? null : Templates.byId(id);
      const name = stored && stored.nom != null ? String(stored.nom).trim() : '';
      if (!name || name === getTitleNameBase() || templateNameInput.value.trim() !== getTitleNameBase()) return;
      templateNameInput.value = name;
      setTitleNameBase(name);
      const option = templateSelect.options[templateSelect.selectedIndex];
      if (option && option.value !== '' && String(option.value) === String(id)) option.textContent = Templates.isDefault(id) ? name + ' ★' : name;
    }

    function wireTemplateRename() {
      const renameBtn = document.getElementById('btn-rename-template');
      if (!renameBtn || !templateNameInput || !templateSelect) return;
      function openEditor() {
        // Le champ reprend la largeur du nom qu'il remplace (120 px au moins) : la barre ne bouge pas, et à 700 px elle ne passe pas sur une deuxième
        // ligne.
        const shown = document.querySelector('#v2-title-cluster .tts-wrap');
        if (shown && shown.offsetWidth) templateNameInput.style.width = Math.max(120, shown.offsetWidth) + 'px';
        nameBeforeEdit = templateNameInput.value.trim();
        nameSession = HistoryMarkers.begin('name');
        templateNameInput.hidden = false;
        templateSelect.hidden = true;
        templateNameInput.focus();
        templateNameInput.select();
      }
      // Le nom d'avant l'ouverture du crayon revient dans le champ. Un passage de l'enregistrement automatique a pu écrire en route un nom tapé à moitié
      // (cf. settleTemplateName) : le suivant réécrit celui-ci.
      function restoreNameBeforeEdit() {
        templateNameInput.value = nameBeforeEdit;
        markAutosaveDirty();
      }
      function commitAndClose() {
        if (nameBeforeEdit !== null) { // seulement une saisie ouverte par le crayon, pas un blur parasite
          if (!templateNameInput.value.trim() && nameBeforeEdit) {
            // Un nom effacé n'est pas un nom : le titre garderait l'ancien au-dessus d'un champ vide, et ni l'enregistrement automatique ni Enregistrer
            // n'écrivent un modèle sans nom - plus rien ne serait gardé, sans un mot. Le champ reprend le nom d'avant et le coin d'état le dit, comme
            // pour un nom déjà pris : seulement quand l'enregistrement automatique est actif (coupé, « Modifications non enregistrées. » protège ce
            // qui n'est écrit nulle part). Un modèle neuf jamais nommé n'a rien à reprendre.
            restoreNameBeforeEdit();
            if (isAutosaveEnabled()) setStatus(I18n.t('status.nameKept', { name: nameBeforeEdit }));
          } else settleTemplateName();
        }
        // La liste montre le modèle avec le nouveau nom jusqu'à l'enregistrement.
        if (templateNameInput.value.trim()) showNameInList(templateNameInput.value.trim());
        // Le renommage fini laisse son repère dans l'historique d'Annuler (rien si le nom n'a pas changé : Échap, un nom vide repris).
        if (nameSession) nameSession.commit({ alone: true });
        closeTemplateRenameEditor();
      }
      // Annuler et Rétablir (js/history-markers.js) rendent le nom d'avant ou d'après la validation. Si le modèle a été renommé depuis (l'explorateur de GFS, « Enregistrer sous » sous un autre nom), le champ ne montre plus
      // celui que le geste avait laissé : rien n'est changé, le coin d'état le dit.
      HistoryMarkers.define('name', {
        read: () => ({ name: templateNameInput.value.trim() }),
        write(next, prev) {
          if (templateNameInput.value.trim() !== prev.name) { setStatus(I18n.t('history.nameChanged'), true); return; }
          templateNameInput.value = next.name;
          showNameInList(next.name);
          markAutosaveDirty();
        },
      });
      renameBtn.addEventListener('click', () => { templateNameInput.hidden ? openEditor() : commitAndClose(); });
      templateNameInput.addEventListener('blur', commitAndClose);
      templateNameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') templateNameInput.blur();
        // Échap abandonne la frappe : le nom d'avant revient et le champ se referme. Pas pendant une composition de texte (accent mort, saisie asiatique) :
        // Échap n'y annule que la composition.
        else if (e.key === 'Escape' && !e.isComposing && nameBeforeEdit !== null) {
          e.preventDefault();
          if (templateNameInput.value.trim() !== nameBeforeEdit) restoreNameBeforeEdit();
          templateNameInput.blur();
        }
      });
    }

    return { adoptTableName, closeTemplateRenameEditor, savedTemplateName, settleTemplateName, showTemplateNames, wireTemplateRename };
  }

  return { create };
})();
