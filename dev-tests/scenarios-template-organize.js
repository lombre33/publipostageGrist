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

  // Réponse toute faite à la saisie du widget (Dialogs.prompt) le temps de `fn` : `null` = saisie annulée. Le vrai clic dans la fenêtre : dialogsMouse.
  function withPrompt(returnValue, fn) {
    const dialogs = TestHelpers.stubDialogs({ prompt: returnValue });
    return Promise.resolve(fn()).finally(() => dialogs.restore());
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

  // Retour d'Antoine (2026-09-29) : dossiers et modèles doivent se distinguer par autre chose que l'icône. Même mesure du rendu que dans scenarios-template-tree.js, sur la liste
  // de la modale (mêmes classes), plus la cible de glisser-déposer qui doit se détacher de la bande d'un dossier.
  cases.push({
    id: 'organize_folder_rows_are_bold_on_a_band_and_drop_target_stands_out',
    description: 'Dans la modale, un dossier est en gras sur une bande de fond, un modèle en graisse normale sans fond, et la cible de glisser-déposer se détache de la bande d’un dossier ordinaire',
    run: async (h) => {
      const id = await createTemplate(h, 'Organiser - Modèle rangé gras');
      await TemplatePreferences.setFolder(id, 'Organiser - Dossier gras');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const folder = folderRowByLabel('Organiser - Dossier gras');
      const leaf = rowFor(id);
      const weight = (row) => Number(getComputedStyle(row.querySelector('.tts-row-label')).fontWeight);
      const bg = (row) => getComputedStyle(row).backgroundColor;
      const bandBg = bg(folder);
      folder.classList.add('tom-drop-target');
      const dropBg = bg(folder);
      folder.classList.remove('tom-drop-target');
      const guide = getComputedStyle(folder.nextElementSibling, '::before');
      const pass = weight(folder) >= 700 && weight(leaf) <= 600 && bandBg !== 'rgba(0, 0, 0, 0)' && bandBg !== bg(leaf) && dropBg !== bandBg
        && folder.nextElementSibling.classList.contains('tts-group') && guide.width === '1px' && guide.left === '13px';
      const notes = JSON.stringify({ weights: [weight(folder), weight(leaf)], bandBg, leafBg: bg(leaf), dropBg, guideLeft: guide.left, guideWidth: guide.width });
      await TemplatePreferences.setFolder(id, '');
      TemplateOrganizeModal.close();
      return { pass, notes };
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
    id: 'organize_pin_button_tooltip_says_what_the_click_does',
    description: 'Dans la modale aussi, l’info-bulle du bouton épingle passe de « Épingler… » à « Retirer des épinglés » une fois le modèle épinglé',
    run: async (h) => {
      await createTemplate(h, 'Organiser - Info-bulle épingle');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const before = rowByName('Organiser - Info-bulle épingle').querySelector('.tts-pin-btn').title;
      await clickEl(h, rowByName('Organiser - Info-bulle épingle').querySelector('.tts-pin-btn'));
      const afterPin = rowByName('Organiser - Info-bulle épingle').querySelector('.tts-pin-btn').title;
      TemplateOrganizeModal.close();
      const pass = before === I18n.t('templateTree.pin.tip') && afterPin === I18n.t('templateTree.unpin.tip') && before !== afterPin && before.length > 0;
      return { pass, notes: JSON.stringify({ before, afterPin }) };
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

  // --- Dossier déplié / replié par défaut dans la liste déroulante (29/09, demande d'Antoine) : interrupteur .tom-folder-default-btn par ligne
  // dossier, réglage PAR UTILISATEUR (js/template-preferences.js, ligne d'état ModeleId 0 + colonne Replie). La lecture côté liste déroulante a ses
  // propres cas dans dev-tests/scenarios-template-tree.js. ---
  function defaultBtn(label) { const r = folderRowByLabel(label); return r && r.querySelector('.tom-folder-default-btn'); }
  function stateRows(dossier) {
    const t = stub().state.rows[TABLE];
    return t.id.map((id, i) => ({ id, u: t.Utilisateur[i], m: t.ModeleId[i], d: t.Dossier[i], r: t.Replie ? t.Replie[i] : undefined }))
      .filter((r) => r.m === 0 && (dossier === undefined || r.d === dossier));
  }
  const writes = () => stub().countActions('AddRecord', TABLE) + stub().countActions('UpdateRecord', TABLE) + stub().countActions('AddVisibleColumn', TABLE);
  async function fileInto(h, nom, dossier) {
    const id = await createTemplate(h, nom);
    await TemplatePreferences.setFolder(id, dossier);
    return id;
  }
  async function tidy(paths, ids) {
    TemplateOrganizeModal.close();
    for (const path of paths) await TemplatePreferences.setFolderCollapsed(path, false);
    for (const id of ids) { await TemplatePreferences.setFolder(id, ''); await TemplatePreferences.setPinned(id, false); }
  }
  function treeFolder(path) { return popup() && popup().querySelector('.tts-row-folder[data-folder-path="' + path + '"]'); }
  async function closeTree(h) { if (popupOpen()) { popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await h.sleep(30); } }

  cases.push({
    id: 'organize_folder_default_toggle_persists_per_folder_and_tree_follows',
    description: 'Le clic sur l’interrupteur d’un dossier le règle « replié par défaut » (une ligne d’état écrite, mise à jour sur place au second clic), sans replier la ligne de la modale, et la liste déroulante l’ouvre replié puis déplié',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Modèle 1', 'Interrupteur-D1');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const first = defaultBtn('Interrupteur-D1');
      const initial = { exists: !!first, pressed: first && first.getAttribute('aria-pressed'), tip: first && first.title, rows: stateRows('Interrupteur-D1').length };
      await clickEl(h, first);
      await h.sleep(60);
      const on = defaultBtn('Interrupteur-D1');
      const collapsedState = { pressed: on.getAttribute('aria-pressed'), cls: on.classList.contains('is-collapsed'), tip: on.title, rows: stateRows('Interrupteur-D1'), modalRowExpanded: folderRowByLabel('Interrupteur-D1').getAttribute('aria-expanded'), modalOpen: modalOpen() };
      TemplateOrganizeModal.close();
      await openTreePopup(h);
      const treeCollapsed = { expanded: treeFolder('Interrupteur-D1').getAttribute('aria-expanded'), groupDisplay: getComputedStyle(treeFolder('Interrupteur-D1').nextElementSibling).display };
      await closeTree(h);
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await clickEl(h, defaultBtn('Interrupteur-D1'));
      await h.sleep(60);
      const off = defaultBtn('Interrupteur-D1');
      const expandedState = { pressed: off.getAttribute('aria-pressed'), rows: stateRows('Interrupteur-D1') };
      TemplateOrganizeModal.close();
      await openTreePopup(h);
      const treeExpanded = treeFolder('Interrupteur-D1').getAttribute('aria-expanded');
      await closeTree(h);
      await tidy(['Interrupteur-D1'], [id]);
      const pass = initial.exists && initial.pressed === 'false' && /déplié/.test(initial.tip) && initial.rows === 0
        && collapsedState.pressed === 'true' && collapsedState.cls && /replié/.test(collapsedState.tip)
        && collapsedState.rows.length === 1 && collapsedState.rows[0].r === true && collapsedState.rows[0].u === ''
        && collapsedState.modalRowExpanded === 'true' && collapsedState.modalOpen
        && treeCollapsed.expanded === 'false' && treeCollapsed.groupDisplay === 'none'
        && expandedState.pressed === 'false' && expandedState.rows.length === 1 && expandedState.rows[0].r === false
        && treeExpanded === 'true';
      return { pass, notes: JSON.stringify({ initial, collapsedState, treeCollapsed, expandedState, treeExpanded }) };
    },
  });

  cases.push({
    id: 'organize_folder_default_toggle_keeps_focus_and_list_scroll_and_escape_still_closes',
    description: 'Après un clic sur l’interrupteur (la liste est redessinée), le focus reste sur lui, la liste garde son défilement et Échap ferme encore la modale - à 700x400 le bouton « Fermer » est hors de la fenêtre',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Focus', 'Interrupteur-Focus');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      list().style.maxHeight = '70px';
      const btn = defaultBtn('Interrupteur-Focus');
      btn.focus(); // amène le bouton dans la fenêtre de 70 px : c'est CE défilement-là qui doit survivre au redessin
      const scrollBefore = list().scrollTop;
      await clickEl(h, btn);
      await h.sleep(60);
      const active = document.activeElement;
      const result = {
        scrollBefore, scrollAfter: list().scrollTop,
        focusKey: active && active.dataset.focusKey, focusInModal: modal().contains(active),
      };
      active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(30);
      result.closedByEscape = !modalOpen();
      list().style.maxHeight = '';
      await tidy(['Interrupteur-Focus'], [id]);
      const pass = scrollBefore > 0 && result.scrollAfter === scrollBefore && result.focusKey === 'folder-default:Interrupteur-Focus' && result.focusInModal && result.closedByEscape;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'organize_pending_folder_default_is_written_only_when_the_folder_becomes_real',
    description: 'L’interrupteur d’un dossier « en attente » ne fait aucune écriture Grist ; l’état « replié » est écrit quand un modèle y est rangé (« Ranger ici »), et un dossier laissé déplié n’écrit aucune ligne d’état',
    run: async (h) => {
      const idA = await createTemplate(h, 'Interrupteur - Attente A');
      const idB = await createTemplate(h, 'Interrupteur - Attente B');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await withPrompt('Attente-Repliee', async () => { await clickEl(h, document.getElementById('template-organize-new-folder')); });
      const pendingBtn = list().querySelector('.tom-pending-folder .tom-folder-default-btn');
      const w0 = writes();
      await clickEl(h, pendingBtn);
      await h.sleep(40);
      const pendingPressed = list().querySelector('.tom-pending-folder .tom-folder-default-btn').getAttribute('aria-pressed');
      const noWriteWhilePending = writes() === w0;
      await clickEl(h, rowByName('Interrupteur - Attente A').querySelector('.tom-place-here-btn'));
      await h.sleep(120);
      const real = defaultBtn('Attente-Repliee');
      const collapsedRows = stateRows('Attente-Repliee');
      // second dossier : interrupteur non touché -> aucune ligne d'état
      await withPrompt('Attente-Depliee', async () => { await clickEl(h, document.getElementById('template-organize-new-folder')); });
      await clickEl(h, rowByName('Interrupteur - Attente B').querySelector('.tom-place-here-btn'));
      await h.sleep(120);
      const expandedRows = stateRows('Attente-Depliee');
      TemplateOrganizeModal.close();
      await openTreePopup(h);
      const tree = { collapsed: treeFolder('Attente-Repliee').getAttribute('aria-expanded'), expanded: treeFolder('Attente-Depliee').getAttribute('aria-expanded') };
      await closeTree(h);
      await tidy(['Attente-Repliee'], [idA, idB]);
      const pass = pendingPressed === 'true' && noWriteWhilePending
        && !!real && real.getAttribute('aria-pressed') === 'true' && collapsedRows.length === 1 && collapsedRows[0].r === true
        && expandedRows.length === 0 && tree.collapsed === 'false' && tree.expanded === 'true';
      return { pass, notes: JSON.stringify({ pendingPressed, noWriteWhilePending, collapsedRows, expandedRows, tree }) };
    },
  });

  cases.push({
    id: 'organize_folder_default_toggle_adds_missing_column_once_before_writing',
    description: 'Document créé avant cette fonction (colonne Replie absente) : le premier clic ajoute la colonne UNE fois, AVANT d’écrire la ligne d’état (sinon Grist annule tout) ; les clics suivants ne la rajoutent pas',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Migration', 'Interrupteur-Migration');
      stub().dropColumn(TABLE, 'Replie');
      await TemplatePreferences.loadForCurrentUser(); // relit le schéma : la colonne manque
      const addColumnBefore = stub().countActions('AddVisibleColumn', TABLE);
      const logStart = stub().getActionLog().length;
      TemplateOrganizeModal.open();
      await h.sleep(30);
      await clickEl(h, defaultBtn('Interrupteur-Migration'));
      await h.sleep(200);
      const log = stub().getActionLog().slice(logStart).filter((a) => a[1] === TABLE);
      const idxColumn = log.findIndex((a) => a[0] === 'AddVisibleColumn' && a[2] === 'Replie');
      const idxRecord = log.findIndex((a) => a[0] === 'AddRecord' && a[3] && a[3].ModeleId === 0);
      await clickEl(h, defaultBtn('Interrupteur-Migration'));
      await h.sleep(200);
      const columnAddsTotal = stub().countActions('AddVisibleColumn', TABLE) - addColumnBefore;
      const columnPresent = 'Replie' in stub().state.rows[TABLE];
      const rows = stateRows('Interrupteur-Migration');
      await tidy(['Interrupteur-Migration'], [id]);
      const pass = idxColumn !== -1 && idxRecord !== -1 && idxColumn < idxRecord && columnAddsTotal === 1 && columnPresent && rows.length === 1;
      return { pass, notes: JSON.stringify({ idxColumn, idxRecord, columnAddsTotal, columnPresent, rows }) };
    },
  });

  cases.push({
    id: 'organize_folder_default_rapid_clicks_write_one_row_and_end_on_the_last_state',
    description: 'Trois clics rapides sur le même interrupteur (avant la réponse de Grist) n’écrivent qu’UNE ligne d’état pour ce dossier et finissent sur le dernier état',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Rafale', 'Interrupteur-Rafale');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      for (let i = 0; i < 3; i++) defaultBtn('Interrupteur-Rafale').click(); // bouton redessiné entre deux clics, comme un vrai double-clic
      await h.sleep(300);
      const rows = stateRows('Interrupteur-Rafale');
      const pressed = defaultBtn('Interrupteur-Rafale').getAttribute('aria-pressed');
      const cached = TemplatePreferences.isFolderCollapsed('Interrupteur-Rafale');
      await tidy(['Interrupteur-Rafale'], [id]);
      const pass = rows.length === 1 && rows[0].r === true && pressed === 'true' && cached === true;
      return { pass, notes: JSON.stringify({ rows, pressed, cached }) };
    },
  });

  cases.push({
    id: 'organize_folder_default_toggle_reverts_when_grist_refuses_the_write',
    description: 'Si Grist refuse l’écriture, l’interrupteur revient à l’état confirmé (pas d’état affiché qui ne serait jamais enregistré) et aucune ligne n’est créée',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Refus', 'Interrupteur-Refus');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const api = grist.docApi, original = api.applyUserActions;
      const quiet = console.error; console.error = () => {};
      api.applyUserActions = async (actions) => {
        if (actions.some((a) => a[1] === TABLE && a[3] && a[3].ModeleId === 0)) throw new Error('refus simulé');
        return original.call(api, actions);
      };
      let result;
      try {
        await clickEl(h, defaultBtn('Interrupteur-Refus'));
        await h.sleep(150);
        result = { pressed: defaultBtn('Interrupteur-Refus').getAttribute('aria-pressed'), cached: TemplatePreferences.isFolderCollapsed('Interrupteur-Refus'), rows: stateRows('Interrupteur-Refus').length };
      } finally {
        api.applyUserActions = original;
        console.error = quiet;
      }
      await tidy(['Interrupteur-Refus'], [id]);
      const pass = result.pressed === 'false' && result.cached === false && result.rows === 0;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'organize_folder_default_toggle_glyphs_differ_by_state_and_from_pin_and_caret_and_are_not_squeezed',
    description: 'Une icône = une fonction : les deux états de l’interrupteur ont chacun un tracé propre, différent de la punaise et du caret ; glyphe rendu à 16 px, sans le padding natif du <button> qui l’écraserait',
    run: async (h) => {
      const id = await fileInto(h, 'Interrupteur - Tracés', 'Interrupteur-Traces');
      TemplateOrganizeModal.open();
      await h.sleep(30);
      const maskOf = (el, pseudo) => { const cs = getComputedStyle(el, pseudo); return cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage; };
      const btnA = defaultBtn('Interrupteur-Traces');
      const expandedMask = maskOf(btnA, '::before');
      const size = { w: getComputedStyle(btnA, '::before').width, h: getComputedStyle(btnA, '::before').height, padding: getComputedStyle(btnA).paddingLeft };
      await clickEl(h, btnA);
      await h.sleep(60);
      const collapsedMask = maskOf(defaultBtn('Interrupteur-Traces'), '::before');
      const pinMask = maskOf(rowByName('Interrupteur - Tracés').querySelector('.tts-pin-btn'), '::before');
      const caretMask = maskOf(folderRowByLabel('Interrupteur-Traces').querySelector('.tts-folder-caret'), null);
      const masks = [expandedMask, collapsedMask, pinMask, caretMask];
      const allDefined = masks.every((m) => !!m && m !== 'none');
      const allDistinct = new Set(masks).size === masks.length;
      await tidy(['Interrupteur-Traces'], [id]);
      const pass = allDefined && allDistinct && size.w === '16px' && size.h === '16px' && size.padding === '0px';
      return { pass, notes: JSON.stringify({ allDefined, allDistinct, size }) };
    },
  });

  // --- Fenêtre basse (29/09, Antoine : « la fenêtre se cale sur l'écran ») : à 700x400 la fenêtre faisait 568 px de haut et débordait de 84 px en haut (titre
  // coupé) et en bas (« Fermer » hors de l'écran). Le harnais tourne à 1400x1000 : on ramène l'overlay (position: fixed) à 300 px de haut, ce qui est exactement
  // ce que fait un panneau bas pour la fenêtre, et on mesure la géométrie réelle (getBoundingClientRect, elementFromPoint), pas un attribut CSS. ---
  cases.push({
    id: 'organize_modal_fits_a_short_window_title_and_close_reachable_and_new_folder_row_in_view',
    description: 'Dans une fenêtre basse (overlay de 300 px), la fenêtre « Organiser mes modèles » tient entièrement (titre et « Fermer » atteignables au clic), seule la liste défile, et un dossier tout juste créé est ramené en vue',
    run: async (h) => {
      const ids = [await fileInto(h, 'Fenêtre basse - Modèle 1', 'Fenetre-Basse'), await fileInto(h, 'Fenêtre basse - Modèle 2', 'Fenetre-Basse')];
      const overlay = modal();
      overlay.style.bottom = 'auto';
      overlay.style.height = '300px';
      const restore = () => { overlay.style.bottom = ''; overlay.style.height = ''; };
      try {
        TemplateOrganizeModal.open();
        await h.sleep(40);
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
        const content = box(overlay.querySelector('.template-organize-modal-content'));
        const title = box(overlay.querySelector('h3'));
        const closeBtn = document.getElementById('template-organize-close');
        const cr = closeBtn.getBoundingClientRect();
        const closeHit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) === closeBtn;
        const listEl = list();
        const listState = { client: listEl.clientHeight, scroll: listEl.scrollHeight };
        await withPrompt('Fenetre-Basse-Nouveau', async () => { await clickEl(h, document.getElementById('template-organize-new-folder')); });
        const pending = list().querySelector('.tom-pending-folder');
        const pr = pending && pending.getBoundingClientRect(), lr = list().getBoundingClientRect();
        const pendingInView = !!pr && pr.top >= lr.top - 1 && pr.bottom <= lr.bottom + 1;
        await clickEl(h, closeBtn);
        const closed = !modalOpen();
        const result = { content, title, closeHit, listState, pendingInView, closed };
        await tidy([], ids);
        const pass = content.top >= 0 && content.bottom <= 300 && title.top >= 0 && closeHit
          && listState.client >= 72 && listState.scroll > listState.client && pendingInView && closed;
        return { pass, notes: JSON.stringify(result) };
      } finally {
        restore();
        TemplateOrganizeModal.close();
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateOrganize = cases;
})();
