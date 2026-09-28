// Suite "templateOrganize" - js/template-organize-modal.js ("Organiser mes modèles", créer des dossiers
// et y ranger des modèles). Complète dev-tests/scenarios-template-tree.js plutôt que de la dupliquer :
// ici seulement ce que ce nouveau module ajoute (entrée dans le panneau, recherche, "Déplacer vers…",
// synchronisation bidirectionnelle avec l'arbre de la barre). js/template-organizer.js et
// js/template-preferences.js, réutilisés tels quels par cette modale, gardent leurs propres suites
// (dev-tests/unit-template-organizer.mjs, dev-tests/unit-template-preferences.mjs).
(function () {
  const cases = [];
  const TABLE = 'Publipostage_PreferencesModeles';
  const stub = () => window.__gristStub;

  function trigger() { return document.querySelector('.tts-trigger'); }
  function popup() { return document.querySelector('.tts-popup'); }
  function popupOpen() { return !!popup() && popup().classList.contains('is-open'); }
  function organizeRow() { return popup() && popup().querySelector('.tts-row-organize'); }
  function modal() { return document.getElementById('template-organize-modal'); }
  function modalOpen() { return !!modal() && getComputedStyle(modal()).display !== 'none'; }
  function list() { return document.getElementById('template-organize-list'); }
  function rowFor(id) { return list() && list().querySelector('.tts-row-leaf[data-template-id="' + id + '"]'); }
  // Les lignes de cette liste ne portent pas data-template-id sur l'élément lui-même dans template-organize-modal
  // (contrairement à l'arbre) : on retrouve une ligne par le texte de son libellé, plus robuste au changement
  // d'implémentation interne (pas de dataset dédié posé par makeLeafRow ici).
  function rowByName(nom) {
    return Array.from(list().querySelectorAll('.tts-row-leaf')).find((r) => r.querySelector('.tts-row-label').textContent === nom) || null;
  }

  async function clickEl(h, el) {
    if (!el) throw new Error('Élément introuvable pour un clic simulé');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await h.sleep(30);
  }

  async function openTreePopup(h) {
    if (!popupOpen()) await clickEl(h, trigger());
  }

  // Même patron que dev-tests/scenarios-template-tree.js:createTemplate - toujours par le vrai flux UI.
  async function createTemplate(h, nom) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(50);
    Editor.setHTML('<p>Contenu de ' + nom + '</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(400);
    return Templates.getCurrentId();
  }

  function withPrompt(returnValue, fn) {
    const orig = window.prompt;
    window.prompt = () => returnValue;
    return Promise.resolve(fn()).finally(() => { window.prompt = orig; });
  }

  cases.push({
    id: 'organize_row_is_last_in_tree_and_opens_modal',
    description: 'La dernière ligne du panneau ("Organiser mes modèles…") ouvre la modale et referme le panneau de l’arbre',
    run: async (h) => {
      await createTemplate(h, 'Organiser - Pour ouverture');
      await openTreePopup(h);
      const rows = Array.from(popup().querySelectorAll('.tts-row'));
      const isLast = rows[rows.length - 1] === organizeRow();
      await clickEl(h, organizeRow());
      const pass = isLast && modalOpen() && !popupOpen();
      return { pass, notes: JSON.stringify({ isLast, modalOpen: modalOpen(), popupOpen: popupOpen() }) };
    },
  });

  cases.push({
    id: 'organize_lists_templates_with_pin_and_move_buttons',
    description: 'La modale liste les modèles avec un bouton épingle et un bouton "Déplacer vers…" sur chaque ligne',
    run: async (h) => {
      const id = await createTemplate(h, 'Organiser - Ligne complète');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const row = rowByName('Organiser - Ligne complète');
      const pass = !!row && !!row.querySelector('.tts-pin-btn') && !!row.querySelector('.tom-move-btn');
      TemplateOrganizeModal.close();
      return { pass, notes: JSON.stringify({ found: !!row, hasPin: !!(row && row.querySelector('.tts-pin-btn')), hasMove: !!(row && row.querySelector('.tom-move-btn')) }) };
    },
  });

  cases.push({
    id: 'organize_move_writes_folder_and_nests_template_under_it',
    description: 'Cliquer "Déplacer vers…" avec un chemin tapé écrit Dossier dans Publipostage_PreferencesModeles et range le modèle dans l’arborescence affichée',
    run: async (h) => {
      const id = await createTemplate(h, 'Organiser - À ranger');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt('Factures/Clients A', async () => {
        await clickEl(h, rowByName('Organiser - À ranger').querySelector('.tom-move-btn'));
      });
      const row = stub().state.rows[TABLE];
      const idx = row.ModeleId.map(String).lastIndexOf(String(id));
      const wroteFolder = idx !== -1 && row.Dossier[idx] === 'Factures/Clients A';
      const folderNames = Array.from(list().querySelectorAll('.tts-row-folder .tts-row-label')).map((l) => l.textContent);
      const nestedUnderBoth = folderNames.includes('Factures') && folderNames.includes('Clients A');
      // Rangé DEUX niveaux (Factures > Clients A > modèle), pas seulement listé à plat quelque part -
      // --tts-depth est posé par makeLeafRow/makeFolderRow (même convention que js/template-tree-select.js).
      const leaf = rowByName('Organiser - À ranger');
      const depth = leaf && leaf.style.getPropertyValue('--tts-depth');
      TemplateOrganizeModal.close();
      const pass = wroteFolder && nestedUnderBoth && depth === '2';
      return { pass, notes: JSON.stringify({ wroteFolder, folderNames, depth }) };
    },
  });

  cases.push({
    id: 'organize_move_cancelled_writes_nothing',
    description: 'Annuler la fenêtre "Déplacer vers…" (Annuler, pas champ vidé) n’écrit aucune ligne Grist',
    run: async (h) => {
      const id = await createTemplate(h, 'Organiser - Annulé');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const before = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      await withPrompt(null, async () => {
        await clickEl(h, rowByName('Organiser - Annulé').querySelector('.tom-move-btn'));
      });
      const after = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      TemplateOrganizeModal.close();
      const pass = after === before;
      return { pass, notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'organize_pin_toggle_syncs_back_to_toolbar_tree',
    description: 'Épingler depuis la modale fait apparaître le modèle dans la section Épinglés du panneau de l’arbre, sans le rouvrir manuellement',
    run: async (h) => {
      const id = await createTemplate(h, 'Organiser - Épinglé depuis la modale');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await clickEl(h, rowByName('Organiser - Épinglé depuis la modale').querySelector('.tts-pin-btn'));
      TemplateOrganizeModal.close();
      await openTreePopup(h);
      const pinnedSection = Array.from(popup().querySelectorAll('.tts-section-label')).find((s) => s.textContent.includes('Épinglés'));
      const nowInPinned = !!(pinnedSection && pinnedSection.nextElementSibling && pinnedSection.nextElementSibling.dataset.templateId === String(id));
      const pass = nowInPinned;
      return { pass, notes: JSON.stringify({ nowInPinned }) };
    },
  });

  cases.push({
    id: 'organize_search_filters_and_shows_no_match_message',
    description: 'La recherche filtre par nom et affiche un message dédié quand rien ne correspond',
    run: async (h) => {
      await createTemplate(h, 'Organiser - Alpha');
      await createTemplate(h, 'Organiser - Bravo');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const searchInput = document.getElementById('template-organize-search');
      searchInput.value = 'Alpha';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(30);
      const onlyAlpha = !!rowByName('Organiser - Alpha') && !rowByName('Organiser - Bravo');
      searchInput.value = 'Zzz-aucun-modele-ne-correspond';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(30);
      const emptyMessage = list().querySelector('.tom-empty');
      TemplateOrganizeModal.close();
      const pass = onlyAlpha && !!emptyMessage;
      return { pass, notes: JSON.stringify({ onlyAlpha, hasEmptyMessage: !!emptyMessage }) };
    },
  });

  cases.push({
    id: 'organize_escape_closes_modal_via_shared_accessibility_wiring',
    description: 'Échap referme la modale - confirme que son id a bien été ajouté à wireModalAccessibility (js/main.js), pas seulement dessiné',
    run: async (h) => {
      TemplateOrganizeModal.open();
      await h.sleep(30);
      modal().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await h.sleep(30);
      const pass = !modalOpen();
      return { pass, notes: JSON.stringify({ modalOpen: modalOpen() }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateOrganize = cases;
})();
