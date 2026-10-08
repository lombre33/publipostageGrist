// Suite "nameSearch" - la recherche d'une colonne par son nom (js/search-select.js:searchWords / searchKey / foundIn), la même dans toutes les listes (demande d'Antoine
// du 2026-10-08 : « si la colonne est Projets.Porteur_3, en tapant "porteur 3" ou "Porteur3" je ne la trouve pas ; plus exhaustif, qui teste tous les noms »). Les règles :
// une espace sépare des mots qui peuvent venir dans n'importe quel ordre ; « _ », « . » et « - » ne comptent pas (« Porteur_3 » tapé en entier ne retrouve pas Porteur_13,
// « porteur 3 » oui), sauf un point à la fin d'un mot dans la liste « # » (js/variables.js:nameTest) : il peut finir la phrase, « #NsProjets. » liste la table mais
// « Voir #NsProjets.Titre. » ferme la liste, comme avant ; ni les accents ni la casse ; tous les noms d'une colonne se cherchent : « Table.Colonne » et son libellé
// Grist (js/grist-api.js:getColumnLabel).
// Surfaces ici : la liste « # » du corps (@tiptap/suggestion avec les espaces permis) et des champs texte (Nom du PDF, À), les colonnes d'un chemin « Table.Référence. »,
// l'onglet des puces, la liste de la fenêtre de condition, celle de la fenêtre de la clé de liaison, le menu « Image depuis une variable » et les listes de Réglages > Accès
// (le libellé et la table y sont portés par `data-search`). La fonction elle-même est dans dev-tests/unit-name-search.mjs (groupe nameSearchUnit) ; les gestes à la vraie
// frappe et à la vraie souris à 700x400 sont dans la section nameSearch de verify-column-search-mouse.mjs (groupe columnSearchMouse).
(function () {
  const cases = [];

  const P1 = 'NsProjets.Porteur_1', P3 = 'NsProjets.Porteur_3', P13 = 'NsProjets.Porteur_13';
  // Toutes les colonnes de la table de la page, dans l'ordre de la table (celle que « #NsProjets. » liste).
  const ALL_PROJETS = ['NsProjets.Titre', P1, P3, P13, 'NsProjets.Responsable', 'NsProjets.Echeance'];

  // La page est sur NsProjets (Porteur_1, Porteur_3, Porteur_13 ; Responsable = Référence vers NsAnnuaire) ; `labels` : { table: { colonne: libellé Grist } }.
  async function seed(h, labels) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('NsAnnuaire', { Nom: 'Text', Telephone: 'Text' });
    stub.setVariables('NsProjets', { Titre: 'Text', Porteur_1: 'Text', Porteur_3: 'Text', Porteur_13: 'Text', Responsable: 'Ref:NsAnnuaire', Echeance: 'Date' });
    Object.keys(labels || {}).forEach(table => stub.setColumnLabels(table, labels[table]));
    stub.setRows('NsAnnuaire', [{ id: 7, Nom: 'Dupont Jean', Telephone: '06 11 22 33 44' }]);
    stub.setRows('NsProjets', [{ id: 1, Titre: 'Projet A', Porteur_1: 'a', Porteur_3: 'c', Porteur_13: 'm', Responsable: 7, Echeance: 631152000 }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Projet A', Porteur_1: 'a', Porteur_3: 'c', Porteur_13: 'm', Responsable: 'Dupont Jean', Echeance: 631152000 }, 'NsProjets');
    await h.sleep(50);
  }
  // Les tables de plus retirées, la page rendue à ce qu'elle était : le scénario suivant (ou la suite suivante) ne les connaît pas.
  async function withSeed(h, labels, run) {
    const before = GristAPI.getCurrentRecord();
    await seed(h, labels);
    try { return await run(); } finally {
      const stub = window.__gristStub;
      ['NsProjets', 'NsAnnuaire'].forEach(table => stub.dropTable(table));
      await GristAPI.refreshSchema();
      if (before && before.tableId && stub.state.tables.indexOf(before.tableId) !== -1) stub.fireRecord(before.record, before.tableId);
      await h.sleep(30);
    }
  }

  const press = (el, key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };
  const same = (got, expected) => JSON.stringify(got) === JSON.stringify(expected);
  // Les clés des tables de ce fichier : les autres suites peuvent avoir laissé les leurs dans le document factice.
  const ns = list => (list ? list.filter(key => key.indexOf('Ns') === 0) : list);
  // Ce que la liste doit rendre : exactement `expected` (les clés Ns), ou rien du tout quand `expected` est null (liste fermée ou sans clé Ns).
  const matches = (list, expected) => (expected === null ? !list || ns(list).length === 0 : same(ns(list), expected));

  const acBox = () => document.getElementById('autocomplete-box');
  const acListed = () => (acBox() && acBox().style.display !== 'none' ? Array.from(acBox().querySelectorAll('.ac-item')).map(item => item.textContent) : null);
  async function emptyParagraph(h) { Editor.setHTML('<p></p>'); await h.sleep(40); return document.querySelector('.tiptap p'); }
  // Tape `text` dans un paragraphe vide du corps et rend ce que propose la liste « # » (null = fermée), puis la ferme.
  async function hashList(h, text) {
    await h.focusInElement(await emptyParagraph(h));
    await h.typeText(text);
    await h.sleep(70);
    const items = acListed();
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await h.sleep(40);
    return items;
  }
  // Les champs texte (Objet, À, Cc, Cci, nom du PDF) sont des éditeurs d'une ligne (js/field-editor.js) : `value` est écrite comme une frappe, le curseur derrière ;
  // la liste est lue puis refermée.
  async function textFieldList(h, id, value) {
    await h.fieldType(id, value);
    const items = acListed();
    h.fieldKey(id, 'Escape');
    document.getElementById(id).value = '';
    await h.sleep(20);
    return items;
  }
  const badgeKeys = () => {
    const out = [];
    EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node.attrs.key); });
    return out;
  };
  const paragraphTexts = () => {
    const out = [];
    EditorCore.getEditor().state.doc.forEach(node => out.push(node.textContent));
    return out;
  };

  // La même frappe, tous les écrits possibles du même nom : ce que la liste « # » doit rendre pour chacun (clés Ns, dans l'ordre : la table de la page, ses colonnes dans
  // l'ordre de la table).
  const WRITINGS = [
    ['#porteur 3', [P3, P13]], ['#Porteur3', [P3]], ['#3 porteur', [P3, P13]], ['#PORTEUR-3', [P3]], ['#porteur_3', [P3]], ['#projets porteur 3', [P3, P13]],
    ['#nsprojets.porteur_3', [P3]], ['#Porteur   3', [P3, P13]], ['#porteur ', [P1, P3, P13]], ['#PÔRTEUR 3', [P3, P13]],
    // Un point au milieu d'un nom ne compte pas ; derrière le nom d'une table, il liste ses colonnes (comme avant).
    ['#porteur.3', [P3]], ['#NsProjets.', ALL_PROJETS],
  ];
  // Les champs texte ferment leur liste devant une clé tapée en entier (une seule proposition, rien à compléter) : l'écriture « table.colonne » complète n'y est pas à retrouver.
  const TEXT_WRITINGS = WRITINGS.filter(([typed]) => typed !== '#nsprojets.porteur_3');
  // Rien à proposer : un autre numéro, une saisie qui ne correspond à aucun nom, un espace juste après le déclencheur, une ponctuation qui n'est pas d'un nom, un point qui
  // finit la phrase (derrière une colonne, un mot ou une colonne suivie d'une espace).
  const NOTHING = ['#porteur 4', '#zzz qqq', 'Voir # porteur', '#porteur,', '#porteur 3 4', 'Voir #NsProjets.Titre.', '#porteur.', '#NsProjets.Porteur_3. '];

  cases.push({
    id: 'namesearch_hash_list_finds_a_column_typed_with_a_space_without_one_or_in_another_order',
    description: 'Liste « # » du corps : Projets.Porteur_3 se retrouve en tapant « porteur 3 », « Porteur3 », « 3 porteur », « PORTEUR-3 », « porteur_3 » ou avec sa table ; la liste garde la table de la page en tête et l’ordre de ses colonnes ; « Porteur3 » ne retrouve pas Porteur_13, « porteur 3 » (deux mots) oui ; un point au milieu d’un nom ne compte pas (« porteur.3 »), derrière une table il liste ses colonnes (« #NsProjets. ») ; un autre numéro, un espace juste après « # », une ponctuation et le point qui finit la phrase (« Voir #NsProjets.Titre. », « #porteur. ») ferment la liste',
    run: async (h) => withSeed(h, null, async () => {
      const got = {};
      for (const [typed] of WRITINGS) got[typed] = await hashList(h, typed);
      const empty = {};
      for (const typed of NOTHING) empty[typed] = await hashList(h, typed);
      const wrong = WRITINGS.filter(([typed, expected]) => !matches(got[typed], expected)).map(([typed]) => typed);
      const notClosed = NOTHING.filter(typed => !matches(empty[typed], null));
      // « # » suivi d'un espace ou d'une virgule ne laisse aucune liste, quelles que soient les autres tables du document.
      const strictlyClosed = ['Voir # porteur', '#porteur,'].every(typed => empty[typed] === null);
      const pass = wrong.length === 0 && notClosed.length === 0 && strictlyClosed;
      return { pass, notes: JSON.stringify({ wrong: wrong.map(typed => [typed, ns(got[typed])]), notClosed: notClosed.map(typed => [typed, ns(empty[typed])]), strictlyClosed }) };
    }),
  });

  cases.push({
    id: 'namesearch_hash_list_enter_inserts_the_first_match_and_replaces_everything_typed',
    description: 'Liste « # » du corps : après « #porteur 3 », Entrée pose la première ligne (NsProjets.Porteur_3) à la place de tout ce qui a été tapé, espace comprise ; la liste se ferme et rien ne reste du texte tapé',
    run: async (h) => withSeed(h, null, async () => {
      await h.focusInElement(await emptyParagraph(h));
      await h.typeText('#porteur 3');
      await h.sleep(70);
      const before = acListed();
      press(document.querySelector('.tiptap'), 'Enter');
      await h.sleep(150);
      const keys = badgeKeys();
      const texts = paragraphTexts();
      const after = acListed();
      const pass = same(ns(before), [P3, P13]) && same(keys, [P3]) && texts.length === 1 && texts[0] === '' && after === null;
      return { pass, notes: JSON.stringify({ before: ns(before), keys, texts, after }) };
    }),
  });

  cases.push({
    id: 'namesearch_hash_list_enter_keeps_the_text_when_nothing_matches',
    description: 'Liste « # » du corps : quand rien ne correspond à ce qui suit « # » (deux mots inconnus, une virgule ou le point qui finit la phrase derrière un nom, un espace juste après « # »), Entrée ne pose aucune variable et coupe le paragraphe comme sans la liste, le texte tapé intact',
    run: async (h) => withSeed(h, null, async () => {
      const outcomes = [];
      for (const typed of ['#zzz qqq', '#porteur,', 'Voir # ', 'Voir #NsProjets.Titre.']) {
        await h.focusInElement(await emptyParagraph(h));
        await h.typeText(typed);
        await h.sleep(70);
        const listed = acListed();
        press(document.querySelector('.tiptap'), 'Enter');
        await h.sleep(100);
        outcomes.push({ typed, listed: listed && ns(listed).length, keys: badgeKeys(), texts: paragraphTexts() });
      }
      const pass = outcomes.every(o => !o.listed && o.keys.length === 0 && o.texts.length === 2 && o.texts[0] === o.typed && o.texts[1] === '');
      return { pass, notes: JSON.stringify(outcomes) };
    }),
  });

  cases.push({
    id: 'namesearch_text_fields_list_finds_a_column_the_same_way_and_closes_like_the_editor_list',
    description: 'Champs texte (Nom du PDF, À) : la liste « # » cherche comme celle du corps — « porteur 3 », « Porteur3 », « 3 porteur », « PORTEUR-3 » — après du texte comme seule ; Entrée écrit « #NsProjets.Porteur_3 » à la place de ce qui a été tapé ; un espace juste après « # », une ponctuation, un point de fin de phrase, un autre numéro et une clé tapée en entier suivie d’un espace laissent la liste fermée',
    run: async (h) => withSeed(h, null, async () => {
      const got = {};
      for (const [typed] of TEXT_WRITINGS) {
        got['pdf ' + typed] = await textFieldList(h, 'pdf-filename-template', typed);
        got['to ' + typed] = await textFieldList(h, 'v2-email-to', 'Suivi ' + typed);
      }
      const empty = {};
      for (const typed of NOTHING) empty[typed] = await textFieldList(h, 'pdf-filename-template', typed);
      empty.fullKey = await textFieldList(h, 'pdf-filename-template', 'Dossier #NsProjets.Porteur_3 ');
      empty.fullKeyDash = await textFieldList(h, 'pdf-filename-template', 'Dossier #NsProjets.Porteur_3-');
      const wrong = TEXT_WRITINGS.filter(([typed, expected]) => !matches(got['pdf ' + typed], expected) || !matches(got['to ' + typed], expected)).map(([typed]) => typed);
      const notClosed = Object.keys(empty).filter(typed => !matches(empty[typed], null));
      // Entrée : la première ligne remplace ce qui a été tapé après le déclencheur, le texte d'avant reste.
      const input = document.getElementById('pdf-filename-template');
      await h.fieldType('pdf-filename-template', 'Suivi #porteur 3');
      const listedBefore = ns(acListed());
      h.fieldKey('pdf-filename-template', 'Enter');
      await h.sleep(120);
      const written = input.value;
      const closedAfter = acListed() === null;
      input.value = '';
      await h.sleep(20);
      const pass = wrong.length === 0 && notClosed.length === 0 && same(listedBefore, [P3, P13]) && written === 'Suivi #NsProjets.Porteur_3' && closedAfter;
      return { pass, notes: JSON.stringify({ wrong: wrong.map(typed => [typed, ns(got['pdf ' + typed]), ns(got['to ' + typed])]), notClosed: notClosed.map(typed => [typed, ns(empty[typed])]), listedBefore, written, closedAfter }) };
    }),
  });

  cases.push({
    id: 'namesearch_text_field_path_after_a_reference_searches_the_columns_of_the_linked_table_by_name',
    description: 'Champ texte, après « Table.Référence. » : les colonnes de la table liée se cherchent comme les autres — « tele », « TÉLÉ », « phone tele » (deux mots) — et les colonnes d’aide restent écartées',
    run: async (h) => withSeed(h, null, async () => {
      const path = typed => textFieldList(h, 'pdf-filename-template', '#NsProjets.Responsable.' + typed);
      const tele = await path('tele');
      const accented = await path('TÉLÉ');
      const twoWords = await path('phone tele');
      const none = await path('zzz');
      const pass = same(tele, ['NsProjets.Responsable.Telephone']) && same(accented, ['NsProjets.Responsable.Telephone']) && same(twoWords, ['NsProjets.Responsable.Telephone']) && none === null;
      return { pass, notes: JSON.stringify({ tele, accented, twoWords, none }) };
    }),
  });

  const LABELS = { NsProjets: { Porteur_3: 'Chef de projet n°3' }, NsAnnuaire: { Telephone: 'Numéro direct' } };

  cases.push({
    id: 'namesearch_hash_list_and_text_fields_search_the_grist_label_of_a_column',
    description: 'Le libellé que Grist montre en tête d’une colonne (différent de son identifiant) se cherche aussi : « chef projet » retrouve NsProjets.Porteur_3 et « numero direct » NsAnnuaire.Telephone dans la liste « # » du corps, des champs texte et après « Table.Référence. » ; GristAPI.getColumnLabel le rend, vide quand le libellé redit l’identifiant',
    run: async (h) => withSeed(h, LABELS, async () => {
      const got = {
        chef: await hashList(h, '#chef projet'),
        chefNumber: await hashList(h, '#n 3 chef'),
        phone: await hashList(h, '#numero direct'),
        phoneOrder: await hashList(h, '#direct nsannuaire'),
        textChef: await textFieldList(h, 'pdf-filename-template', 'Contact #chef projet'),
        textPhone: await textFieldList(h, 'v2-email-to', '#numero direct'),
        path: await textFieldList(h, 'pdf-filename-template', '#NsProjets.Responsable.direct'),
        noLabel: await hashList(h, '#chef titre'),
      };
      const labels = { chef: GristAPI.getColumnLabel('NsProjets', 'Porteur_3'), phone: GristAPI.getColumnLabel('NsAnnuaire', 'Telephone'), sameAsId: GristAPI.getColumnLabel('NsProjets', 'Titre'), unknown: GristAPI.getColumnLabel('NsProjets', 'Inconnue') };
      const pass = same(ns(got.chef), [P3]) && same(ns(got.chefNumber), [P3]) && same(ns(got.phone), ['NsAnnuaire.Telephone']) && same(ns(got.phoneOrder), ['NsAnnuaire.Telephone'])
        && same(ns(got.textChef), [P3]) && same(ns(got.textPhone), ['NsAnnuaire.Telephone']) && same(got.path, ['NsProjets.Responsable.Telephone']) && matches(got.noLabel, null)
        && labels.chef === 'Chef de projet n°3' && labels.phone === 'Numéro direct' && labels.sameAsId === '' && labels.unknown === '';
      return { pass, notes: JSON.stringify({ got: { chef: ns(got.chef), chefNumber: ns(got.chefNumber), phone: ns(got.phone), phoneOrder: ns(got.phoneOrder), textChef: ns(got.textChef), textPhone: ns(got.textPhone), path: got.path, noLabel: ns(got.noLabel) }, labels }) };
    }),
  });

  cases.push({
    id: 'namesearch_hash_list_chips_tab_searches_several_words',
    description: 'Onglet des puces de la liste « # » : plusieurs mots, dans n’importe quel ordre, retrouvent une puce (« jour date » : Date du jour)',
    run: async (h) => withSeed(h, null, async () => {
      await h.focusInElement(await emptyParagraph(h));
      await h.typeText('#jour date');
      await h.sleep(70);
      const variables = acListed();
      acBox().querySelector('.ac-tab[data-tab="chips"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(60);
      const chips = acListed();
      document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(40);
      const pass = !variables && same(chips, [I18n.t('chips.date')]);
      return { pass, notes: JSON.stringify({ variables, chips }) };
    }),
  });

  // === Les listes avec recherche (js/search-select.js) : les noms affichés, l'indice, et `data-search` (la table et le libellé Grist). ===
  const names = panel => Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(node => node.textContent);
  const triggerIn = root => root.querySelector('.ss-trigger');
  const panelOf = trigger => trigger.parentNode.querySelector('.ss-panel');
  const inputOf = panel => panel.querySelector('.ss-input');
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const visible = el => !!el && el.style.display !== 'none' && el.getClientRects().length > 0;
  const badgeHtml = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
  async function openConditionWindow(h) {
    Editor.setHTML(`<p>Objet : ${badgeHtml('NsProjets', 'Titre')}</p>`);
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let at = -1;
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge' && at === -1) at = pos; });
    ed.commands.setNodeSelection(at);
    await h.sleep(120);
    document.querySelector('.v2-varfmt-toolbar').querySelector('button[data-action="var-condition"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(60);
    return document.getElementById('var-condition-modal');
  }

  cases.push({
    id: 'namesearch_condition_window_list_finds_a_column_typed_with_a_space_or_not_and_by_its_table_and_label',
    description: 'Fenêtre de condition (liste à plat, colonnes de la page en nom nu, des autres tables en « Table.Colonne ») : « porteur 3 » (Porteur_3 et Porteur_13), « Porteur3 » (Porteur_3 seul), « 3 porteur », la table de la page tapée avec un nom nu (« nsprojets 3 porteur »), une autre table avec son libellé (« numero direct »), le libellé d’une colonne de la page (« chef projet ») ; la ligne de saisie avancée reste en bas, « rien » ne se propose pas',
    run: async (h) => withSeed(h, LABELS, async () => {
      const modal = await openConditionWindow(h);
      const trigger = triggerIn(modal);
      trigger.click();
      await h.sleep(30);
      const panel = panelOf(trigger);
      const input = inputOf(panel);
      const advanced = I18n.t('macro.modal.columnAdvanced');
      const typed = async (text) => { setInput(input, text); await h.sleep(10); return names(panel); };
      const rows = {
        porteur3: await typed('porteur 3'), glued: await typed('Porteur3'), reversed: await typed('3 porteur'), underscore: await typed('Porteur_3'),
        table: await typed('nsprojets 3 porteur'), otherTable: await typed('nsannuaire telephone'), phone: await typed('numero direct'), chef: await typed('chef projet'), chefSign: await typed('N°3 chef'),
        none: await typed('porteur 4'), cleared: await typed(''),
      };
      const cancel = modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
      if (visible(modal) && cancel) cancel.click();
      await h.sleep(30);
      const noneLabel = I18n.t('macro.modal.columnChoosePlaceholder');
      const pass = same(rows.porteur3, ['Porteur_3', 'Porteur_13', advanced]) && same(rows.glued, ['Porteur_3', advanced]) && same(rows.reversed, ['Porteur_3', 'Porteur_13', advanced])
        && same(rows.underscore, ['Porteur_3', advanced]) && same(rows.table, ['Porteur_3', 'Porteur_13', advanced]) && same(rows.otherTable, ['NsAnnuaire.Telephone', advanced])
        && same(rows.phone, ['NsAnnuaire.Telephone', advanced]) && same(rows.chef, ['Porteur_3', advanced]) && same(rows.chefSign, ['Porteur_3', advanced]) && same(rows.none, [advanced])
        && rows.cleared[0] === noneLabel && rows.cleared[rows.cleared.length - 1] === advanced && rows.cleared.length > 8;
      return { pass, notes: JSON.stringify(rows) };
    }),
  });

  cases.push({
    id: 'namesearch_link_key_window_lists_find_a_column_by_its_grist_label',
    description: 'Fenêtre de choix de la clé de liaison (noms nus des colonnes de la table liée) : le libellé Grist se cherche (« numero direct » retrouve Telephone), comme la table (« nsannuaire nom ») et plusieurs mots dans l’autre ordre',
    run: async (h) => withSeed(h, LABELS, async () => {
      const closed = Variables.ensureLinkConfigured({ table: 'NsAnnuaire' });
      await h.sleep(150);
      const select = document.getElementById('link-config-col-cible');
      const trigger = select.parentNode.querySelector('.ss-trigger');
      const found = {};
      if (trigger) {
        trigger.click();
        await h.sleep(30);
        const panel = select.parentNode.querySelector('.ss-panel');
        const input = inputOf(panel);
        const typed = async (text) => { setInput(input, text); await h.sleep(10); return names(panel); };
        found.phone = await typed('numero direct');
        found.reversed = await typed('direct numero');
        found.table = await typed('nsannuaire nom');
        found.none = await typed('zzz');
      }
      document.getElementById('link-config-cancel').click();
      await Promise.race([closed, h.sleep(1500)]);
      const pass = !!trigger && same(found.phone, ['Telephone']) && same(found.reversed, ['Telephone']) && same(found.table, ['Nom']) && same(found.none, []);
      return { pass, notes: JSON.stringify(found) };
    }),
  });

  cases.push({
    id: 'namesearch_image_menu_and_access_lists_find_a_column_by_its_grist_label',
    description: 'Menu « Image depuis une variable » et listes de Réglages > Accès : le libellé Grist d’une colonne se cherche (« chantier photo » retrouve NsPieces.Photo, « adresse mail » la colonne Email de la table des droits), la table aussi',
    run: async (h) => {
      const stub = window.__gristStub;
      const before = GristAPI.getCurrentRecord();
      await h.resetEditor();
      stub.setVariables('NsPieces', { Titre: 'Text', Photo: 'Attachments', Plan: 'Attachments' });
      stub.setColumnLabels('NsPieces', { Photo: 'Photo du chantier' });
      stub.setVariables('NsDroits', { Email: 'Text', Nom: 'Text', LectureSeule: 'Bool' });
      stub.setColumnLabels('NsDroits', { Email: 'Adresse mail' });
      stub.setRows('NsDroits', [{ id: 1, Email: 'a@exemple.fr', Nom: 'A', LectureSeule: false }]);
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Bonjour Marie</p><p>Fin</p>');
      await h.sleep(60);
      document.querySelector('.tiptap').focus();
      EditorCore.getEditor().commands.setTextSelection(9);
      await h.sleep(30);
      const result = {};
      try {
        document.getElementById('v2-btn-image-from-variable').click();
        let imagePanel = null;
        for (let i = 0; i < 80 && !imagePanel; i++) {
          await h.sleep(25);
          imagePanel = document.querySelector('#v2-image-var-search .ss-panel:not([hidden])');
        }
        if (imagePanel) {
          const input = inputOf(imagePanel);
          setInput(input, 'chantier photo');
          await h.sleep(20);
          result.image = names(imagePanel);
          setInput(input, 'nspieces plan');
          await h.sleep(20);
          result.imageTable = names(imagePanel);
          press(input, 'Escape');
          await h.sleep(60);
        }
        stub.setWidgetOptions({ droitsAcces: { table: 'NsDroits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: '', commentsColumn: '' } });
        await h.sleep(400);
        document.getElementById('v2-btn-settings').click();
        await h.sleep(300);
        document.querySelector('#settings-tabs [data-settings-tab="access"]').click();
        await h.sleep(60);
        const field = document.getElementById('settings-access-email').nextElementSibling.querySelector('.ss-trigger');
        field.click();
        await h.sleep(30);
        const accessPanel = panelOf(field);
        const accessInput = inputOf(accessPanel);
        setInput(accessInput, 'adresse mail');
        await h.sleep(10);
        result.access = names(accessPanel);
        setInput(accessInput, 'nsdroits nom');
        await h.sleep(10);
        result.accessTable = names(accessPanel);
        field.click();
        await h.sleep(20);
        document.getElementById('settings-close').click();
        await h.sleep(60);
      } finally {
        stub.setWidgetOptions(null);
        ['NsPieces', 'NsDroits'].forEach(table => stub.dropTable(table));
        await GristAPI.refreshSchema();
        if (before && before.tableId && stub.state.tables.indexOf(before.tableId) !== -1) stub.fireRecord(before.record, before.tableId);
        await h.sleep(200);
      }
      const pass = same(result.image, ['NsPieces.Photo']) && same(result.imageTable, ['NsPieces.Plan']) && same(result.access, ['Email']) && same(result.accessTable, ['Nom']);
      return { pass, notes: JSON.stringify(result) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.nameSearch = cases;
})();
