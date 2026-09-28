// Suite "templateOrganize" - js/template-organize-modal.js ("Organiser mes modèles", créer des dossiers
// et y ranger des modèles). Complète dev-tests/scenarios-template-tree.js plutôt que de la dupliquer :
// ici seulement ce que ce nouveau module ajoute (bouton toolbar dédié, recherche, "Déplacer vers…",
// glisser-déposer, boutons "+", synchronisation bidirectionnelle avec l'arbre de la barre).
// js/template-organizer.js et js/template-preferences.js, réutilisés tels quels par cette modale, gardent
// leurs propres suites (dev-tests/unit-template-organizer.mjs, dev-tests/unit-template-preferences.mjs).
(function () {
  const cases = [];
  const TABLE = 'Publipostage_PreferencesModeles';
  const stub = () => window.__gristStub;

  function trigger() { return document.querySelector('.tts-trigger'); }
  function popup() { return document.querySelector('.tts-popup'); }
  function popupOpen() { return !!popup() && popup().classList.contains('is-open'); }
  function modal() { return document.getElementById('template-organize-modal'); }
  function modalOpen() { return !!modal() && getComputedStyle(modal()).display !== 'none'; }
  function list() { return document.getElementById('template-organize-list'); }
  function rowFor(id) { return list() && list().querySelector('.tts-row-leaf[data-template-id="' + id + '"]'); }
  function rowByName(nom) {
    return Array.from(list().querySelectorAll('.tts-row-leaf')).find((r) => r.querySelector('.tts-row-label').textContent === nom) || null;
  }
  // Trouve un dossier RÉEL ou "en attente" (tom-pending-folder porte aussi .tts-row-folder) par son
  // libellé - le texte affiché est le nom du dossier pour un vrai noeud, le chemin complet pour un
  // pending (cf. js/template-organize-modal.js:makePendingFolderRow).
  function folderRowByLabel(texte) {
    return Array.from(list().querySelectorAll('.tts-row-folder')).find((r) => r.querySelector('.tts-row-label').textContent === texte) || null;
  }

  async function clickEl(h, el) {
    if (!el) throw new Error('Élément introuvable pour un clic simulé');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await h.sleep(30);
  }

  // Glisser-déposer HTML5 réel (pas juste dispatchEvent d'un clic) : un DataTransfer explicite, réutilisé
  // entre dragstart/dragover/drop exactement comme le ferait un vrai geste souris - dispatchEvent ne le
  // fait pas tout seul. Chromium réel (Playwright, cf. dev-tests/run-headless.mjs) supporte DataTransfer/
  // DragEvent en page, contrairement à un DOM simulé.
  async function simulateDragDrop(h, sourceEl, targetEl) {
    if (!sourceEl) throw new Error('Source de glisser-déposer introuvable');
    if (!targetEl) throw new Error('Cible de glisser-déposer introuvable');
    const dataTransfer = new DataTransfer();
    sourceEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    sourceEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
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
    id: 'organize_toolbar_button_opens_modal',
    description: '#btn-organize-templates (icône seule, à côté de "nouveau modèle") ouvre la modale - déplacé hors du panneau de l’arbre le 2026-09-28 (retour d’Antoine : "mettre ailleurs que tout en bas")',
    run: async (h) => {
      const btn = document.getElementById('btn-organize-templates');
      const hasIcon = !!(btn && btn.querySelector('.tts-icon.tts-icon-organize'));
      await clickEl(h, btn);
      const pass = hasIcon && modalOpen();
      TemplateOrganizeModal.close();
      return { pass, notes: JSON.stringify({ hasIcon, modalOpen: modalOpen() }) };
    },
  });

  cases.push({
    id: 'organize_toolbar_button_has_no_phantom_before_square',
    description: 'Régression connue (2026-09-19/28) : #btn-organize-templates porte son icône via un <span class="tts-icon"> enfant, pas via ::before - sans neutralisation explicite, le carré plein générique de #toolbar-top button::before s’affiche en plus',
    run: () => {
      const before = getComputedStyle(document.getElementById('btn-organize-templates'), '::before');
      const pass = before.content === 'none';
      return { pass, notes: JSON.stringify({ content: before.content }) };
    },
  });

  cases.push({
    id: 'organize_tree_no_longer_has_organize_row',
    description: 'Le panneau de l’arbre ne contient plus de ligne "Organiser mes modèles" (déplacée, pas dupliquée)',
    run: async (h) => {
      await openTreePopup(h);
      const pass = !popup().querySelector('.tts-row-organize');
      return { pass, notes: JSON.stringify({ pass }) };
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

  // --- Glisser-déposer et boutons "+" (28/09, second retour d'Antoine après le premier essai) --------
  cases.push({
    id: 'organize_dragdrop_moves_template_into_existing_folder',
    description: 'Glisser un modèle sur une ligne dossier écrit son Dossier dans Publipostage_PreferencesModeles et l’imbrique visuellement, sans passer par "Déplacer vers…"',
    run: async (h) => {
      await createTemplate(h, 'Glisser - Dossier créateur');
      const secondId = await createTemplate(h, 'Glisser - Modèle déplacé');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt('Glisser/Cible', async () => {
        await clickEl(h, rowByName('Glisser - Dossier créateur').querySelector('.tom-move-btn'));
      });
      const source = rowFor(secondId);
      const target = folderRowByLabel('Cible');
      await simulateDragDrop(h, source, target);
      const rows = stub().state.rows[TABLE];
      const idx = rows.ModeleId.map(String).lastIndexOf(String(secondId));
      const wroteFolder = idx !== -1 && rows.Dossier[idx] === 'Glisser/Cible';
      const moved = rowFor(secondId);
      const depth = moved && moved.style.getPropertyValue('--tts-depth');
      TemplateOrganizeModal.close();
      const pass = wroteFolder && depth === '2';
      return { pass, notes: JSON.stringify({ wroteFolder, depth }) };
    },
  });

  cases.push({
    id: 'organize_new_root_folder_button_shows_pending_row_without_writing',
    description: 'Le "+ Nouveau dossier" en haut de la liste nomme un dossier candidat à la racine, affiché à part, sans écrire en base tant qu’aucun modèle n’y est rangé',
    run: async (h) => {
      await createTemplate(h, 'Racine - Pas encore rangé');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const before = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      await withPrompt('Nouveau dossier racine', async () => {
        await clickEl(h, document.getElementById('template-organize-new-folder'));
      });
      const after = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      const pending = folderRowByLabel('Nouveau dossier racine');
      const isPending = !!(pending && pending.classList.contains('tom-pending-folder'));
      TemplateOrganizeModal.close();
      const pass = isPending && after === before;
      return { pass, notes: JSON.stringify({ isPending, before, after }) };
    },
  });

  cases.push({
    id: 'organize_new_root_folder_cancelled_shows_no_pending_row',
    description: 'Annuler le prompt du "+" (Annuler, pas nom vide) ne crée aucun dossier candidat ni écriture',
    run: async (h) => {
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt(null, async () => {
        await clickEl(h, document.getElementById('template-organize-new-folder'));
      });
      const pass = !document.querySelector('.tom-pending-folder');
      TemplateOrganizeModal.close();
      return { pass, notes: JSON.stringify({ pass }) };
    },
  });

  cases.push({
    id: 'organize_place_here_button_writes_pending_folder_from_leaf_row',
    description: 'Le bouton de repli "Ranger ici", visible pendant qu’un dossier est en attente, écrit Dossier pour le modèle cliqué - sans glisser-déposer (repli clavier/tactile)',
    run: async (h) => {
      const id = await createTemplate(h, 'Repli - Ranger ici');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt('Repli/Nouveau', async () => {
        await clickEl(h, document.getElementById('template-organize-new-folder'));
      });
      const placeBtn = rowByName('Repli - Ranger ici').querySelector('.tom-place-here-btn');
      await clickEl(h, placeBtn);
      const rows = stub().state.rows[TABLE];
      const idx = rows.ModeleId.map(String).lastIndexOf(String(id));
      const wroteFolder = idx !== -1 && rows.Dossier[idx] === 'Repli/Nouveau';
      const stillPending = !!document.querySelector('.tom-pending-folder');
      const nowReal = !!folderRowByLabel('Nouveau');
      TemplateOrganizeModal.close();
      const pass = wroteFolder && !stillPending && nowReal;
      return { pass, notes: JSON.stringify({ wroteFolder, stillPending, nowReal }) };
    },
  });

  cases.push({
    id: 'organize_subfolder_plus_button_prefixes_parent_path',
    description: 'Le "+" à droite d’un dossier réel préfixe automatiquement le chemin du parent - l’utilisateur ne tape que le nom du sous-dossier',
    run: async (h) => {
      await createTemplate(h, 'Sous-dossier - Parent créateur');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt('Parent', async () => {
        await clickEl(h, rowByName('Sous-dossier - Parent créateur').querySelector('.tom-move-btn'));
      });
      const parentRow = folderRowByLabel('Parent');
      await withPrompt('Enfant', async () => {
        await clickEl(h, parentRow.querySelector('.tom-add-subfolder-btn'));
      });
      const pending = folderRowByLabel('Parent/Enfant');
      const isPending = !!(pending && pending.classList.contains('tom-pending-folder'));
      TemplateOrganizeModal.close();
      const pass = isPending;
      return { pass, notes: JSON.stringify({ isPending }) };
    },
  });

  cases.push({
    id: 'organize_closing_modal_discards_pending_folder_without_writing',
    description: 'Fermer la modale abandonne silencieusement un dossier "en attente" jamais rangé - rien ne réapparaît à la réouverture, aucune écriture Grist',
    run: async (h) => {
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const before = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      await withPrompt('Abandonné', async () => {
        await clickEl(h, document.getElementById('template-organize-new-folder'));
      });
      TemplateOrganizeModal.close();
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const after = stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE);
      const pass = !document.querySelector('.tom-pending-folder') && after === before;
      TemplateOrganizeModal.close();
      return { pass, notes: JSON.stringify({ pass, before, after }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateOrganize = cases;
})();
