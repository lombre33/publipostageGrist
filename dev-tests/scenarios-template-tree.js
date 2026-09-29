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

  // Régression du 2026-09-28 (Antoine : "un carré noir est présent dans l'ui") : .tts-trigger est un <button> dans #toolbar-top, qui hérite donc du
  // ::before générique #toolbar-top button (css/style.css - content:"", 14x14, background-color:currentColor, SANS mask-image, faute de quoi il se
  // peint en carré plein) sauf s'il définit son propre ::before ou le supprime explicitement (même piège que #toolbar-top #v2-btn-toggle-cci::before).
  // .tts-trigger n'avait ni l'un ni l'autre. Vérifier le ::before RÉELLEMENT calculé, pas la présence d'une règle CSS dans le fichier source : c'est
  // exactement le type de piège (test d'attribut plutôt que de rendu) qu'Antoine a demandé d'éviter après les régressions du 2026-09-19.
  cases.push({
    id: 'tree_trigger_has_no_phantom_before_square',
    description: 'Le bouton du sélecteur (.tts-trigger) supprime bien le ::before générique #toolbar-top button (sinon : carré 14x14 plein, sans mask-image, visible avant l’icône réelle)',
    run: async () => {
      const before = getComputedStyle(trigger(), '::before');
      const pass = before.content === 'none';
      return { pass, notes: JSON.stringify({ content: before.content, display: before.display }) };
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

  // Retour d'Antoine (2026-09-29) : « le nom des dossiers et sous-dossiers doit être différencié plus fortement des documents, pas juste une icône ». On mesure le RENDU
  // (graisse, fond, trait guide du groupe), pas le texte du CSS.
  cases.push({
    id: 'tree_folder_rows_are_bold_on_a_band_unlike_template_rows',
    description: 'Un dossier et un sous-dossier ont un nom en gras sur une bande de fond, un modèle une graisse normale sans fond, et chaque groupe déplié a son trait guide calé sur le caret de son dossier',
    run: async (h) => {
      const idA = await createTemplate(h, 'document', 'Arbre - Modèle rangé');
      await createTemplate(h, 'document', 'Arbre - Modèle à la racine');
      await TemplatePreferences.setFolder(idA, 'Arbre - Dossier test/Arbre - Sous-dossier test');
      TemplateTreeSelect.refresh();
      await openPopup(h);
      const folderRow = (nom) => Array.from(popup().querySelectorAll('.tts-row-folder')).find((r) => r.querySelector('.tts-row-label').textContent === nom);
      const top = folderRow('Arbre - Dossier test');
      const sub = folderRow('Arbre - Sous-dossier test');
      const leaf = rowFor(idA);
      const weight = (row) => Number(getComputedStyle(row.querySelector('.tts-row-label')).fontWeight);
      const bg = (row) => getComputedStyle(row).backgroundColor;
      const guide = (row) => {
        const group = row.nextElementSibling;
        const cs = getComputedStyle(group, '::before');
        return { isGroup: group.classList.contains('tts-group'), width: cs.width, left: cs.left, position: cs.position, depthVar: group.style.getPropertyValue('--tts-depth') };
      };
      const g0 = guide(top), g1 = guide(sub);
      const pass = !!top && !!sub && !!leaf
        && weight(top) >= 700 && weight(sub) >= 700 && weight(leaf) <= 600
        && bg(top) !== 'rgba(0, 0, 0, 0)' && bg(sub) !== 'rgba(0, 0, 0, 0)' && bg(top) !== bg(leaf) && bg(sub) !== bg(leaf)
        && g0.isGroup && g0.position === 'absolute' && g0.width === '1px' && g0.left === '13px' && g0.depthVar === '0'
        && g1.isGroup && g1.left === '29px' && g1.depthVar === '1';
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await TemplatePreferences.setFolder(idA, '');
      TemplateTreeSelect.refresh();
      return { pass, notes: JSON.stringify({ found: [!!top, !!sub, !!leaf], weights: top && [weight(top), weight(sub), weight(leaf)], bgs: top && [bg(top), bg(sub), bg(leaf)], g0, g1 }) };
    },
  });

  // Régression constatée le 2026-09-29 en vérifiant les dossiers en thème sombre : le panneau vit dans <body>, qui ne fixe aucune couleur de texte - son texte héritait du noir du
  // navigateur sur son fond sombre.
  cases.push({
    id: 'tree_popup_text_follows_theme_text_color_in_dark_theme',
    description: 'En thème sombre, le texte du panneau des modèles prend la couleur de texte du thème (--text), pas le noir par défaut du navigateur sur fond sombre',
    run: async (h) => {
      const previous = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
      try {
        await createTemplate(h, 'document', 'Arbre - Texte thème sombre');
        await openPopup(h);
        const probe = document.createElement('div');
        probe.style.color = 'var(--text)';
        document.body.appendChild(probe);
        const themeText = getComputedStyle(probe).color;
        probe.remove();
        const leafColor = getComputedStyle(popup().querySelector('.tts-row-leaf .tts-row-label')).color;
        const popupBg = getComputedStyle(popup()).backgroundColor;
        popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const pass = leafColor === themeText && leafColor !== 'rgb(0, 0, 0)' && popupBg !== 'rgb(255, 255, 255)';
        return { pass, notes: JSON.stringify({ leafColor, themeText, popupBg }) };
      } finally {
        if (previous === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', previous);
      }
    },
  });

  // Retour d'Antoine (2026-09-29, « la même icône ») : l'épingle d'une ligne et le bouton « modèle par défaut » de la barre partageaient le même tracé d'étoile, il
  // épinglait en croyant définir le modèle qui s'ouvre au démarrage. On compare le masque RÉELLEMENT calculé des deux ::before, pas le texte du CSS.
  cases.push({
    id: 'tree_pin_icon_is_not_the_default_template_star',
    description: 'L’épingle d’une ligne de l’arbre n’a plus le même tracé que le bouton « modèle par défaut » de la barre (Antoine, 2026-09-29 : deux étoiles identiques, confusion)',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Punaise distincte');
      await openPopup(h);
      const pin = rowFor(id).querySelector('.tts-pin-btn');
      const maskOf = (el) => {
        const cs = getComputedStyle(el, '::before');
        return cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage;
      };
      const pinMask = maskOf(pin);
      const starMask = maskOf(document.getElementById('btn-set-default-template'));
      const size = getComputedStyle(pin, '::before').width;
      const pass = !!pinMask && pinMask !== 'none' && !!starMask && starMask !== 'none' && pinMask !== starMask && parseFloat(size) > 0;
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { pass, notes: JSON.stringify({ sameMask: pinMask === starMask, pinHasMask: !!pinMask && pinMask !== 'none', starHasMask: !!starMask && starMask !== 'none', size }) };
    },
  });

  // .tts-pin-btn est un <button> de 20 px : son padding natif (1px 6px) ne laissait que 8 px de large au ::before flex, quel que soit le width déclaré (12 px avant, 16 px
  // maintenant) - le glyphe (étoile puis punaise) s'affichait écrasé. Mesuré sur le rendu, pas sur le CSS.
  cases.push({
    id: 'tree_pin_glyph_renders_at_full_size_not_squeezed_by_button_padding',
    description: 'Le glyphe de l’épingle est rendu à sa taille réelle (16 px) dans son bouton de 20 px, sans que le padding natif du <button> ne l’écrase',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Glyphe épingle');
      await openPopup(h);
      const pin = rowFor(id).querySelector('.tts-pin-btn');
      const glyph = getComputedStyle(pin, '::before');
      const padding = getComputedStyle(pin).padding;
      const btnRect = pin.getBoundingClientRect();
      const pass = parseFloat(glyph.width) === 16 && parseFloat(glyph.height) === 16 && parseFloat(padding) === 0 && btnRect.width === 20 && btnRect.height === 20;
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { pass, notes: JSON.stringify({ glyphWidth: glyph.width, glyphHeight: glyph.height, padding, btn: [btnRect.width, btnRect.height] }) };
    },
  });

  cases.push({
    id: 'tree_pin_button_tooltip_says_what_the_click_does',
    description: 'L’info-bulle du bouton épingle dit ce que fait le clic dans l’état courant (« Épingler… » puis « Retirer des épinglés »), pour ne pas le confondre avec « modèle par défaut »',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Info-bulle épingle');
      await openPopup(h);
      const before = rowFor(id).querySelector('.tts-pin-btn').title;
      await clickEl(h, rowFor(id).querySelector('.tts-pin-btn'));
      const afterPin = rowFor(id).querySelector('.tts-pin-btn').title;
      await clickEl(h, rowFor(id).querySelector('.tts-pin-btn'));
      const afterUnpin = rowFor(id).querySelector('.tts-pin-btn').title;
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const pass = before === I18n.t('templateTree.pin.tip') && afterPin === I18n.t('templateTree.unpin.tip') && afterUnpin === before && before !== afterPin && before.length > 0;
      return { pass, notes: JSON.stringify({ before, afterPin, afterUnpin }) };
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

  // Document ancien (semaines d'historique) : plusieurs lignes EstParDefaut=true, dont un ancien modèle email. Un faux Grist neuf n'en a qu'une, ce qui a masqué
  // ce cas - getDefaultId() renvoyait la PREMIÈRE ligne marquée, l'email, que js/main.js ignore au démarrage : le widget s'ouvrait sur « Nouveau modèle » alors que
  // deux modèles document portaient aussi la marque.
  function setDefaultFlags(ids) {
    const rows = stub().state.rows.Publipostage_Modeles;
    rows.id.forEach((rowId, i) => { rows.EstParDefaut[i] = ids.some((id) => String(id) === String(rowId)); });
  }

  // Noms en « Arbre - » : la liste est triée par nom, et tree_internal_list_scroll_does_not_close_popup suppose que ses propres lignes finissent en bas.
  cases.push({
    id: 'default_template_ignores_flagged_email_and_macro_and_tree_star_follows',
    description: 'Plusieurs lignes EstParDefaut=true dont un modèle email en tête de table : getDefaultId() renvoie le premier modèle DOCUMENT marqué, jamais l’email, et l’arbre met l’étoile sur ce modèle seulement',
    run: async (h) => {
      const idMail = await createTemplate(h, 'email', 'Arbre - Défaut ancien email');
      const idB = await createTemplate(h, 'document', 'Arbre - Défaut Doc B');
      const idC = await createTemplate(h, 'document', 'Arbre - Défaut Doc C');
      setDefaultFlags([idMail, idB, idC]);
      await Templates.loadAll();
      const got = Templates.getDefaultId();
      TemplateTreeSelect.refresh();
      await openPopup(h);
      const label = (id) => rowFor(id) && rowFor(id).querySelector('.tts-row-label').textContent;
      const labels = { mail: label(idMail), b: label(idB), c: label(idC) };
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setDefaultFlags([]);
      await Templates.loadAll();
      const pass = String(got) === String(idB)
        && labels.mail === 'Arbre - Défaut ancien email' && labels.b === 'Arbre - Défaut Doc B ★' && labels.c === 'Arbre - Défaut Doc C';
      return { pass, notes: JSON.stringify({ got, idMail, idB, idC, labels }) };
    },
  });

  // Question de suivi : l'étoile remet à faux TOUTES les autres lignes marquées (email et macro compris, que l'arbre ne montre pas comme défaut) dans le même lot.
  cases.push({
    id: 'default_template_star_click_clears_every_other_flag_in_one_batch',
    description: 'Cliquer l’étoile sur un modèle document alors que d’autres lignes (dont un email) sont marquées EstParDefaut remet toutes les autres à faux, dans un seul applyUserActions',
    run: async (h) => {
      const idMail = await createTemplate(h, 'email', 'Arbre - Lot ancien email');
      const idB = await createTemplate(h, 'document', 'Arbre - Lot Doc B');
      const idC = await createTemplate(h, 'document', 'Arbre - Lot Doc C');
      setDefaultFlags([idMail, idB]);
      await Templates.loadAll();
      realSelect().value = idC;
      realSelect().dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(100);
      stub().clearActionLog();
      const sent = [];
      const origApply = grist.docApi.applyUserActions;
      grist.docApi.applyUserActions = function (actions) { sent.push(actions.length); return origApply.apply(this, arguments); };
      try {
        await h.clickButton('btn-set-default-template');
        await h.sleep(150);
      } finally { grist.docApi.applyUserActions = origApply; }
      const rows = stub().state.rows.Publipostage_Modeles;
      const flags = {};
      rows.id.forEach((rowId, i) => { flags[rowId] = rows.EstParDefaut[i]; });
      const onlyC = String(idC) in flags && flags[idC] === true && flags[idMail] === false && flags[idB] === false;
      const otherTrue = Object.keys(flags).filter((k) => String(k) !== String(idC) && flags[k]);
      setDefaultFlags([]);
      await Templates.loadAll();
      const pass = onlyC && otherTrue.length === 0 && sent.length === 1 && sent[0] === 3;
      return { pass, notes: JSON.stringify({ flags, otherTrue, batches: sent }) };
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

  // Régression du 2026-09-28 (Antoine : "quand on clic sur le nom du modèle ça devient un fond bleu, du
  // coup le dropdown est broken et on ne peut pas changer de modèle") - un double-clic sur le déclencheur
  // (réflexe hérité du <select> natif) ouvrait puis refermait aussitôt le panneau au 2e clic, laissant
  // seulement le fond de survol du bouton visible. Vérifie la visibilité RÉELLE du panneau après un vrai
  // double-clic (display calculé + elementFromPoint sur une ligne), pas seulement la classe is-open -
  // exigence d'Antoine après les régressions du 2026-09-19/28 (tests d'attribut qui ne prouvent rien).
  cases.push({
    id: 'tree_double_click_trigger_keeps_popup_visible',
    description: 'Un double-clic rapide sur le déclencheur (réflexe "ancien <select>") laisse le panneau réellement ouvert et cliquable, pas juste refermé avec le fond de survol du bouton',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Double-clic');
      if (popupOpen()) await clickEl(h, trigger());
      const t = trigger();
      // detail: 2 sur le 2e clic reproduit ce que le navigateur pose RÉELLEMENT sur le 2e clic d'un
      // authentique double-clic (un MouseEvent scripté sans detail explicite vaut 0, comme un simple clic
      // isolé - cf. le garde correspondant dans js/template-tree-select.js) : sans ce detail, ce scénario
      // ne testerait pas la même chose qu'un vrai double-clic souris.
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 1 }));
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 2 }));
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, detail: 2 }));
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }));
      await h.sleep(30);
      const display = getComputedStyle(popup()).display;
      const row = rowFor(id);
      let elAtRow = null;
      if (row) {
        const rect = row.getBoundingClientRect();
        elAtRow = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      const rowReachable = !!row && (elAtRow === row || row.contains(elAtRow));
      const pass = popupOpen() && display !== 'none' && rowReachable;
      return { pass, notes: JSON.stringify({ popupOpen: popupOpen(), display, rowFound: !!row, rowReachable }) };
    },
  });

  // Régression du 2026-09-28, cause réelle (Antoine : "fond bleu au clic, dropdown broken") : #v2-title-cluster
  // (css/toolbar-v2.css) a `overflow: hidden` - conçu pour l'ancien <select> natif, dont le menu s'ouvre au
  // niveau du système et n'est donc JAMAIS affecté par l'overflow d'un ancêtre. Le panneau de l'arbre, lui,
  // vivait dans ce même bloc : à l'ouverture, le focus posé sur la ligne sélectionnée faisait défiler ce
  // bloc de 28px de haut (mesuré : scrollTop passait à 38), poussant le déclencheur hors du cadre visible -
  // ne laissant apparaître que le fond bleu clair de la ligne sélectionnée. `.is-open`/`aria-expanded` valent
  // pourtant `true` tout du long, donc un test qui ne vérifie que ces attributs (comme les scénarios
  // existants ci-dessus, écrits avant que ce panneau n'existe dans un `#v2-title-cluster`) ne l'aurait
  // jamais détecté - seul un test de rendu RÉEL (rect + elementFromPoint + scrollTop de l'ancêtre) le peut.
  cases.push({
    id: 'tree_trigger_stays_visible_when_popup_opens',
    description: '#v2-title-cluster (overflow:hidden) ne doit plus jamais faire défiler/disparaître le déclencheur quand le panneau de l\'arbre s\'ouvre - le déclencheur reste dans la fenêtre et réellement cliquable',
    run: async (h) => {
      await createTemplate(h, 'document', 'Arbre - Visibilité déclencheur');
      const cluster = document.getElementById('v2-title-cluster');
      const scrollBefore = cluster.scrollTop;
      await openPopup(h);
      const t = trigger();
      const rect = t.getBoundingClientRect();
      const elAtTrigger = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const triggerReachable = elAtTrigger === t || t.contains(elAtTrigger);
      const triggerFullyInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0 && rect.height > 0;
      const scrollAfter = cluster.scrollTop;
      // Le panneau lui-même doit être réellement atteignable là où il s'affiche, pas seulement `is-open`.
      const popupRect = popup().getBoundingClientRect();
      const elAtPopup = document.elementFromPoint(popupRect.left + 10, popupRect.top + 10);
      const popupReachable = popup().contains(elAtPopup);
      const pass = triggerReachable && triggerFullyInViewport && scrollAfter === scrollBefore && popupReachable;
      return { pass, notes: JSON.stringify({ scrollBefore, scrollAfter, triggerReachable, triggerFullyInViewport, popupReachable, rect: rect.toJSON() }) };
    },
  });

  // Bug suivant signalé par Antoine (2026-09-28, après le correctif ci-dessus) : "dès que je fais la
  // moindre action la liste disparait... que ca soit une tentative de scroll ou un clic". `.tts-popup` a
  // overflow-y:auto (liste longue, cf. CSS) - un scroll de la liste elle-même ne bubble pas mais reste
  // intercepté en phase de capture par l'écouteur scroll posé sur `window` (fermeture sur scroll d'un
  // ANCÊTRE qui déplacerait le panneau). Sans garde, la moindre molette au-dessus de la liste la refermait
  // aussitôt et remettait son scrollTop à 0 - tout modèle au-delà de la hauteur visible (~360px) devenait
  // impossible à atteindre.
  cases.push({
    id: 'tree_internal_list_scroll_does_not_close_popup',
    description: 'Faire défiler la liste elle-même (molette au-dessus du panneau, overflow-y:auto) ne doit jamais la refermer - seul un scroll hors du panneau doit le faire',
    run: async (h) => {
      const ids = [];
      for (let i = 0; i < 15; i++) ids.push(await createTemplate(h, 'document', 'Arbre-scroll ' + i));
      await openPopup(h);
      const p = popup();
      const scrollable = p.scrollHeight > p.clientHeight;
      const targetScrollTop = p.scrollHeight - p.clientHeight;
      p.scrollTop = targetScrollTop;
      p.dispatchEvent(new Event('scroll', { bubbles: false }));
      await h.sleep(30);
      const stillOpenAfterInternalScroll = popupOpen();
      const scrollTopKept = p.scrollTop === targetScrollTop;
      // Une sélection tout en bas de la liste doit rester atteignable après ce scroll.
      const lastRow = rowFor(ids[ids.length - 1]);
      const lastRowRect = lastRow.getBoundingClientRect();
      const elAtLastRow = document.elementFromPoint(lastRowRect.left + 5, lastRowRect.top + 5);
      const lastRowReachable = lastRow.contains(elAtLastRow) || elAtLastRow === lastRow;
      // Un scroll qui vient d'ailleurs (page/ancêtre) doit toujours fermer le panneau - pas de régression inverse.
      document.scrollingElement.dispatchEvent(new Event('scroll', { bubbles: false }));
      await h.sleep(30);
      const closedByOuterScroll = !popupOpen();
      const pass = scrollable && stillOpenAfterInternalScroll && scrollTopKept && lastRowReachable && closedByOuterScroll;
      return { pass, notes: JSON.stringify({ scrollable, stillOpenAfterInternalScroll, scrollTopKept, lastRowReachable, closedByOuterScroll }) };
    },
  });

  // Complément mesuré par le coordinateur (2026-09-28) : Chromium garde le scrollTop de .tts-popup d'une
  // fermeture à l'autre. Sans remise à zéro à l'ouverture, rouvrir après avoir défilé montrait une liste
  // toujours scrollée à un endroit qui ne correspondait plus à la sélection courante.
  cases.push({
    id: 'tree_reopen_scrolls_selected_row_into_view_not_stale_position',
    description: 'Rouvrir le panneau après avoir choisi un modèle tout en bas de la liste doit le montrer directement visible - jamais la position de défilement de la fermeture précédente',
    run: async (h) => {
      // Zéro-paddé (00..14) : le tri est alphabétique (byName, js/template-organizer.js), donc "14" non
      // paddé trierait AVANT "2".."9" (comparaison de chaînes) et ne serait pas en bas de la liste - piège
      // relevé par le coordinateur (mesure indépendante 2026-09-28), le nom d'origine "Arbre-reouverture 14"
      // se retrouvait vers le HAUT, rendant le test vrai par accident (rien à faire défiler pour l'atteindre).
      const ids = [];
      for (let i = 0; i < 15; i++) ids.push(await createTemplate(h, 'document', 'Arbre-reouverture ' + String(i).padStart(2, '0')));
      const lastId = ids[ids.length - 1];
      await openPopup(h);
      const p = popup();
      // Défilement RÉEL vers le bas (pas juste le clic, qui ne scrolle pas tout seul) pour révéler la
      // dernière ligne, puis la sélectionner - .tts-popup garde ensuite ce scrollTop en mémoire à la
      // fermeture (Chromium, cf. js/template-tree-select.js:openPopup) : c'est CE scrollTop périmé que la
      // réouverture doit écraser, pas un scrollTop resté à 0 faute d'avoir jamais bougé.
      p.scrollTop = p.scrollHeight - p.clientHeight;
      p.dispatchEvent(new Event('scroll'));
      await h.sleep(30);
      await clickEl(h, rowFor(lastId));
      await h.sleep(200);
      await openPopup(h);
      const selectedRow = p.querySelector('.tts-row[aria-selected="true"]');
      const found = !!selectedRow;
      let visible = false;
      if (selectedRow) {
        const r = selectedRow.getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        visible = r.top >= pr.top && r.bottom <= pr.bottom;
      }
      const pass = found && visible;
      return { pass, notes: JSON.stringify({ found, visible, scrollTop: p.scrollTop }) };
    },
  });

  // --- Repli et clavier (défauts relevés le 2026-09-28, choisis par Antoine pour correction) ---------
  cases.push({
    id: 'tree_attach_failure_falls_back_to_native_select',
    description: 'Si la construction de l’arbre échoue à l’attache, le <select> natif redevient visible/utilisable plutôt que rester masqué sans remplacement',
    run: async () => {
      const sel = realSelect();
      const orig = TemplateOrganizer.buildView;
      TemplateOrganizer.buildView = () => { throw new Error('panne simulée pour le test'); };
      let threw = false;
      try {
        TemplateTreeSelect.attach(sel);
      } catch (e) {
        threw = true;
      } finally {
        TemplateOrganizer.buildView = orig;
      }
      const display = getComputedStyle(sel).display;
      const tabIndex = sel.tabIndex;
      const stillNative = display !== 'none' && tabIndex !== -1 && !sel.hasAttribute('aria-hidden') && !trigger();
      // Ré-attache pour de bon avant de rendre la main à la suite du fichier - sinon toutes les cases
      // suivantes tourneraient sans arbre du tout.
      TemplateTreeSelect.attach(sel);
      const recovered = !!trigger() && getComputedStyle(sel).display === 'none';
      const pass = threw && stillNative && recovered;
      return { pass, notes: JSON.stringify({ threw, display, tabIndex, stillNative, recovered }) };
    },
  });

  cases.push({
    id: 'tree_end_key_focuses_last_visible_row',
    description: 'La touche Fin (End) déplace le focus clavier roulant sur la dernière ligne visible du panneau',
    run: async (h) => {
      await openPopup(h);
      const rows = Array.from(popup().querySelectorAll('.tts-row'));
      const last = rows[rows.length - 1];
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      await h.sleep(30);
      const pass = document.activeElement === last;
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(30);
      return { pass, notes: JSON.stringify({ pass, lastIsOrganizeRow: last.classList.contains('tts-row-organize') }) };
    },
  });

  cases.push({
    id: 'tree_tab_closes_popup_and_returns_focus_to_trigger',
    description: 'Tab dans le panneau referme le panneau et rend le focus au déclencheur, plutôt que de laisser le panneau ouvert avec le focus parti ailleurs (le panneau vit dans document.body, hors de l’ordre naturel du DOM)',
    run: async (h) => {
      await openPopup(h);
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      await h.sleep(30);
      const pass = !popupOpen() && document.activeElement === trigger();
      return { pass, notes: JSON.stringify({ popupOpen: popupOpen(), focusIsTrigger: document.activeElement === trigger() }) };
    },
  });

  // --- Dossier déplié / replié par défaut (29/09, demande d'Antoine) : réglage PAR UTILISATEUR, écrit depuis « Organiser mes modèles »
  // (dev-tests/scenarios-template-organize.js), lu ici à chaque ouverture de la liste. Ligne d'état = une ligne de la table de préférences avec
  // ModeleId 0 et le chemin du dossier (cf. js/template-preferences.js). ---
  function folderRowByPath(path) { return popup() && popup().querySelector('.tts-row-folder[data-folder-path="' + path + '"]'); }
  function groupOf(folderRow) { return folderRow && folderRow.nextElementSibling; }
  function isLaidOut(el) { const r = el && el.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; }
  async function closeTree(h) { if (popupOpen()) { popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await h.sleep(30); } }
  async function tidyFolders(paths, ids) {
    for (const path of paths) await TemplatePreferences.setFolderCollapsed(path, false);
    for (const id of ids) { await TemplatePreferences.setFolder(id, ''); await TemplatePreferences.setPinned(id, false); }
  }

  cases.push({
    id: 'tree_folder_set_collapsed_by_default_opens_collapsed_and_other_folders_stay_expanded',
    description: 'Un dossier réglé « replié par défaut » par cette personne s’ouvre replié dans la liste (contenu masqué, caret fermé), un autre dossier reste déplié - le comportement historique (tout déplié) ne change pas sans réglage',
    run: async (h) => {
      const idA = await createTemplate(h, 'document', 'Arbre - Repli A');
      const idB = await createTemplate(h, 'document', 'Arbre - Repli B');
      await TemplatePreferences.setFolder(idA, 'Arbre-Repli-1');
      await TemplatePreferences.setFolder(idB, 'Arbre-Repli-2');
      await openPopup(h);
      const before = { one: folderRowByPath('Arbre-Repli-1').getAttribute('aria-expanded'), two: folderRowByPath('Arbre-Repli-2').getAttribute('aria-expanded') };
      await closeTree(h);
      await TemplatePreferences.setFolderCollapsed('Arbre-Repli-2', true);
      await openPopup(h);
      const one = folderRowByPath('Arbre-Repli-1'), two = folderRowByPath('Arbre-Repli-2');
      const result = {
        before,
        oneExpanded: one.getAttribute('aria-expanded'), oneLeafShown: isLaidOut(rowFor(idA)),
        twoExpanded: two.getAttribute('aria-expanded'), twoGroupDisplay: getComputedStyle(groupOf(two)).display, twoLeafShown: isLaidOut(rowFor(idB)),
      };
      await closeTree(h);
      await tidyFolders(['Arbre-Repli-2'], [idA, idB]);
      const pass = before.one === 'true' && before.two === 'true' && result.oneExpanded === 'true' && result.oneLeafShown
        && result.twoExpanded === 'false' && result.twoGroupDisplay === 'none' && !result.twoLeafShown;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'tree_folder_opened_by_hand_stays_open_while_panel_redraws_and_defaults_again_on_reopen',
    description: 'Un dossier replié par défaut, déplié à la main, reste déplié quand le panneau se redessine (clic sur une épingle) ; fermé puis rouvert, il redevient replié',
    run: async (h) => {
      const idA = await createTemplate(h, 'document', 'Arbre - Repli main A');
      const idB = await createTemplate(h, 'document', 'Arbre - Repli main B');
      await TemplatePreferences.setFolder(idA, 'Arbre-Main-1');
      await TemplatePreferences.setFolder(idB, 'Arbre-Main-2');
      await TemplatePreferences.setFolderCollapsed('Arbre-Main-2', true);
      await openPopup(h);
      await clickEl(h, folderRowByPath('Arbre-Main-2'));
      const opened = { expanded: folderRowByPath('Arbre-Main-2').getAttribute('aria-expanded'), shown: isLaidOut(rowFor(idB)) };
      await clickEl(h, rowFor(idA).querySelector('.tts-pin-btn')); // écriture -> render() pendant que le panneau est ouvert
      await h.sleep(60);
      const afterRedraw = { open: popupOpen(), expanded: folderRowByPath('Arbre-Main-2').getAttribute('aria-expanded'), shown: isLaidOut(rowFor(idB)) };
      await closeTree(h);
      await openPopup(h);
      const reopened = { expanded: folderRowByPath('Arbre-Main-2').getAttribute('aria-expanded'), shown: isLaidOut(rowFor(idB)) };
      await closeTree(h);
      await tidyFolders(['Arbre-Main-2'], [idA, idB]);
      const pass = opened.expanded === 'true' && opened.shown && afterRedraw.open && afterRedraw.expanded === 'true' && afterRedraw.shown
        && reopened.expanded === 'false' && !reopened.shown;
      return { pass, notes: JSON.stringify({ opened, afterRedraw, reopened }) };
    },
  });

  cases.push({
    id: 'tree_folder_default_is_per_user_and_state_rows_do_not_leak_into_pins_and_folders',
    description: 'L’état d’un dossier posé par UNE AUTRE personne est ignoré ; celui de la personne courante survit à un rechargement des préférences ; les lignes d’état (ModeleId 0) ne se retrouvent ni dans getCached(), ni dans les dossiers proposés',
    run: async (h) => {
      const id = await createTemplate(h, 'document', 'Arbre - Repli perso');
      await TemplatePreferences.setFolder(id, 'Arbre-Perso-1');
      await TemplatePreferences.setFolderCollapsed('Arbre-Perso-2', true); // dossier sans modèle : l'état existe quand même
      await stub().applyUserActions([['AddRecord', TABLE, null, { Utilisateur: 'autre@exemple.fr', ModeleId: 0, Epingle: false, Dossier: 'Arbre-Perso-1', Replie: true }]]);
      await TemplatePreferences.loadForCurrentUser();
      const result = {
        otherUserIgnored: TemplatePreferences.isFolderCollapsed('Arbre-Perso-1') === false,
        ownStateSurvivesReload: TemplatePreferences.isFolderCollapsed('Arbre-Perso-2') === true,
        noZeroKeyInCache: !('0' in TemplatePreferences.getCached()),
        foldersListed: TemplatePreferences.listFolders(),
      };
      await TemplatePreferences.setFolderCollapsed('Arbre-Perso-2', false);
      await tidyFolders([], [id]);
      const pass = result.otherUserIgnored && result.ownStateSurvivesReload && result.noZeroKeyInCache
        && result.foldersListed.includes('Arbre-Perso-1') && !result.foldersListed.includes('Arbre-Perso-2');
      return { pass, notes: JSON.stringify(result) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateTree = cases;
})();
