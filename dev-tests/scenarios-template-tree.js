// Suite "templateTree" - js/template-tree-select.js (arbre "épinglés + dossiers" qui enveloppe
// #template-select, Piste B validée par Antoine, planning/feature-rangement-tri-modeles.md §7-8) et
// js/template-preferences.js (table Publipostage_PreferencesModeles, épingle/dossier par utilisateur).
//
// js/template-organizer.js (logique pure de regroupement) a déjà sa propre suite sans navigateur
// (dev-tests/unit-template-organizer.mjs) : ici on vérifie seulement ce qu'un navigateur réel apporte -
// le <select> natif réellement cliqué/enveloppé, l'accesseur `value` intercepté contre le VRAI
// js/main.js (pas un stub), le MutationObserver contre refreshTemplateList(), et l'écriture réelle dans
// la table Grist via le stub.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_PreferencesModeles';
  const stub = () => window.__gristStub;

  function realSelect() { return document.getElementById('template-select'); }
  function trigger() { return document.querySelector('.tts-trigger'); }
  function popup() { return document.querySelector('.tts-popup'); }
  function popupOpen() { return !!popup() && popup().classList.contains('is-open'); }
  function rowFor(id) { return popup() && popup().querySelector('.tts-row-leaf[data-template-id="' + id + '"]'); }

  async function clickEl(h, el) {
    if (!el) throw new Error('Élément introuvable pour un clic simulé');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await h.sleep(30);
  }

  async function openPopup(h) {
    if (!popupOpen()) await clickEl(h, trigger());
  }

  // Crée un modèle par le VRAI flux UI (flyout "Nouveau" -> type -> Enregistrer), même patron que
  // dev-tests/scenarios-comments.js:savedTemplateWithText et scenarios-macro-modeles.js - jamais une
  // insertion Grist directe, pour exercer aussi loadTemplateIntoEditor/currentTypeModele au passage.
  // Repart TOUJOURS du flyout (même pour 'document') : currentTypeModele est un état interne à
  // js/main.js qui ne se remet pas à zéro tout seul entre deux scénarios (resetEditor() ne touche que
  // l'éditeur), un scénario email/macro précédent le laisserait sinon coincé sur le mauvais type.
  async function createTemplate(h, typeModele, nom) {
    await h.resetEditor();
    if (typeModele === 'macro') {
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      const nameInput = document.getElementById('macro-editor-name');
      if (!nameInput) throw new Error('modale macro introuvable');
      nameInput.value = nom;
      document.getElementById('macro-editor-save').click();
      await h.sleep(250);
      return Templates.getCurrentId();
    }
    h.openFlyout('#v2-new-template-group');
    await h.clickButton(typeModele === 'email' ? 'v2-btn-new-email' : 'v2-btn-new-document');
    await h.sleep(50);
    Editor.setHTML('<p>Contenu de ' + nom + '</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(400);
    return Templates.getCurrentId();
  }

  // --- Structure/accessibilité : vrai dès le chargement de la page, sans modèle nécessaire. ---
  cases.push({
    id: 'tree_native_select_hidden_and_out_of_tab_order',
    description: 'Le <select> réel passe en display:none CALCULÉ (pas seulement [hidden]) et sort de l’ordre de tabulation - piège du 2026-09-19 (bandeau email resté affiché malgré [hidden])',
    run: async () => {
      const sel = realSelect();
      const display = getComputedStyle(sel).display;
      const pass = display === 'none' && sel.tabIndex === -1 && sel.getAttribute('aria-hidden') === 'true' && !!trigger();
      return { pass, notes: JSON.stringify({ display, tabIndex: sel.tabIndex, ariaHidden: sel.getAttribute('aria-hidden'), triggerPresent: !!trigger() }) };
    },
  });

  cases.push({
    id: 'tree_migration_creates_preferences_table_lazily',
    description: 'Publipostage_PreferencesModeles est créée à la volée au premier chargement (document "créé avant la fonctionnalité"), une seule fois',
    run: async () => {
      const tables = await grist.docApi.listTables();
      const addTableCalls = stub().countActions('AddTable', TABLE);
      const pass = tables.includes(TABLE) && addTableCalls === 1;
      return { pass, notes: JSON.stringify({ tables, addTableCalls }) };
    },
  });

  // --- Lister + distinguer les 3 types de modèle (document/email/macro, planning §8.1). ---
  cases.push({
    id: 'tree_lists_all_three_template_types_with_distinct_icons',
    description: 'L’arbre liste un modèle document/email/macro chacun avec son icône de type propre, sans jamais planter sur le JSON d’un macro-modèle',
    run: async (h) => {
      const docId = await createTemplate(h, 'document', 'Arbre - Document');
      const emailId = await createTemplate(h, 'email', 'Arbre - Email');
      const macroId = await createTemplate(h, 'macro', 'Arbre - Macro');
      await openPopup(h);
      const docRow = rowFor(docId), emailRow = rowFor(emailId), macroRow = rowFor(macroId);
      const pass = !!docRow && !!emailRow && !!macroRow
        && !!docRow.querySelector('.tts-icon-document') && !!emailRow.querySelector('.tts-icon-email') && !!macroRow.querySelector('.tts-icon-macro');
      return {
        pass,
        notes: JSON.stringify({
          docIcon: docRow && docRow.querySelector('.tts-icon') && docRow.querySelector('.tts-icon').className,
          emailIcon: emailRow && emailRow.querySelector('.tts-icon') && emailRow.querySelector('.tts-icon').className,
          macroIcon: macroRow && macroRow.querySelector('.tts-icon') && macroRow.querySelector('.tts-icon').className,
        }),
      };
    },
  });

  cases.push({
    id: 'tree_click_row_selects_template_through_real_change_event',
    description: 'Cliquer une ligne de l’arbre met à jour .value du <select> réel ET déclenche le VRAI flux de chargement (js/main.js:onTemplateSelectChange), pas juste l’apparence',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Cible du clic');
      await createTemplate(h, 'document', 'Arbre - Autre modèle');
      await openPopup(h);
      await clickEl(h, rowFor(id));
      const pass = realSelect().value === String(id)
        && document.getElementById('template-name').value === 'Arbre - Cible du clic'
        && !popupOpen();
      return { pass, notes: JSON.stringify({ value: realSelect().value, nameInput: document.getElementById('template-name').value, popupOpen: popupOpen() }) };
    },
  });

  cases.push({
    id: 'tree_pin_button_writes_grist_row_and_moves_to_pinned_section',
    description: 'Cliquer l’épingle d’une ligne écrit une ligne Publipostage_PreferencesModeles (Epingle=true) pour l’utilisateur courant et fait apparaître le modèle dans la section Épinglés',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - À épingler');
      await openPopup(h);
      const before = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      await clickEl(h, rowFor(id).querySelector('.tts-pin-btn'));
      const after = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      const table = stub().state.rows[TABLE];
      const idx = table.ModeleId.map(String).lastIndexOf(String(id));
      const wroteEpingle = idx !== -1 && table.Epingle[idx] === true;
      const pinnedSection = Array.from(popup().querySelectorAll('.tts-section-label')).find((s) => s.textContent.includes('Épinglés'));
      const stillOpen = popupOpen();
      const nowInPinned = pinnedSection && pinnedSection.nextElementSibling && pinnedSection.nextElementSibling.dataset.templateId === String(id);
      const pass = after > before && wroteEpingle && stillOpen && !!nowInPinned;
      return { pass, notes: JSON.stringify({ before, after, wroteEpingle, stillOpen, nowInPinned: !!nowInPinned }) };
    },
  });

  cases.push({
    id: 'tree_default_template_star_matches_toolbar_button',
    description: 'Marquer un modèle "par défaut" via le vrai bouton de la barre fait apparaître l’étoile dans son libellé de l’arbre, même convention que refreshTemplateList',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Modèle par défaut');
      await h.clickButton('btn-set-default-template');
      await h.sleep(100);
      await openPopup(h);
      const label = rowFor(id) && rowFor(id).querySelector('.tts-row-label').textContent;
      const pass = label === 'Arbre - Modèle par défaut ★';
      return { pass, notes: 'label=' + label };
    },
  });

  cases.push({
    id: 'tree_programmatic_value_write_without_change_event_still_syncs_trigger',
    description: 'Une écriture DIRECTE de .value (comme plusieurs endroits réels de js/main.js, ex. templateSelect.value = savedId) sans dispatch de change met quand même à jour le libellé du déclencheur - accesseur intercepté',
    run: async (h) => {
      const idA = await createTemplate(h, 'document', 'Arbre - Cible A');
      const idB = await createTemplate(h, 'document', 'Arbre - Cible B');
      realSelect().value = idA; // écriture nue, sans dispatchEvent - ce que ferait onNew()/onSave()/etc.
      const labelA = document.querySelector('.tts-trigger-label').textContent;
      realSelect().value = idB;
      const labelB = document.querySelector('.tts-trigger-label').textContent;
      const pass = labelA === 'Arbre - Cible A' && labelB === 'Arbre - Cible B';
      return { pass, notes: JSON.stringify({ labelA, labelB }) };
    },
  });

  cases.push({
    id: 'tree_refresh_template_list_rebuild_reflected_without_manual_refresh',
    description: 'Une reconstruction complète des <option> par refreshTemplateList() (nouveau modèle enregistré) apparaît dans l’arbre sans appel explicite - MutationObserver childList/subtree',
    run: async (h) => {
      await openPopup(h);
      const countBefore = popup().querySelectorAll('.tts-row-leaf[data-template-id]').length;
      const newId = await createTemplate(h, 'document', 'Arbre - Apparu après coup');
      await openPopup(h);
      const found = rowFor(newId);
      const countAfter = popup().querySelectorAll('.tts-row-leaf[data-template-id]').length;
      const pass = !!found && countAfter > countBefore;
      return { pass, notes: JSON.stringify({ countBefore, countAfter, found: !!found }) };
    },
  });

  cases.push({
    id: 'tree_escape_closes_popup_and_returns_focus_to_trigger',
    description: 'Échap referme le popup et rend le focus clavier au déclencheur',
    run: async (h) => {
      await createTemplate(h, 'document', 'Arbre - Pour clavier');
      await openPopup(h);
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await h.sleep(30);
      const pass = !popupOpen() && document.activeElement === trigger();
      return { pass, notes: JSON.stringify({ popupOpen: popupOpen(), activeIsTrigger: document.activeElement === trigger() }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateTree = cases;
})();
