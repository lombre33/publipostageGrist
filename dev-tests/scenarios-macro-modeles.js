// Suite "macroModeles" - js/macro-templates.js (résolution pure, sans DOM) et son intégration dans le pipeline ReaderMode existant
// (planning/feature-macro-modeles.md). Contrairement aux autres suites de ce dossier, ces scénarios n'appellent PAS TestHelpers.resetEditor() :
// MacroTemplates n'a aucune dépendance à l'éditeur TipTap (cf. son commentaire d'en-tête), donc rien à réinitialiser entre les cas.
// Le cas de comparaison "même ligne courante" (Variables.resolveRawValue, branche varTable === resolvedTableId) résout directement
// record[varColumn] sans aucun appel réseau/stub Grist - donc testable avec un `record` JS ordinaire, pas besoin de window.__gristStub.setVariables/setRows.
(function () {
  const cases = [];

  // --- compareValues : chaque opérateur, y compris le cas numérique (valeur de règle toujours une chaîne saisie dans la modale). ---
  cases.push({
    id: 'macro_compare_operators',
    description: 'MacroTemplates.compareValues couvre =, ≠, >, <, ≥, ≤ (numérique et texte), contient, vide, non vide',
    run: async () => {
      const c = MacroTemplates.compareValues;
      const checks = [
        [c(5, '=', '5'), true, 'numérique ='],
        [c(5, '≠', '5'), false, 'numérique ≠'],
        [c(10, '>', '9'), true, 'numérique >'],
        [c(3, '<', '9'), true, 'numérique <'],
        [c(9, '≥', '9'), true, 'numérique ≥'],
        [c(9, '≤', '9'), true, 'numérique ≤'],
        [c('Paris', '=', 'Paris'), true, 'texte ='],
        [c('Paris', '=', 'paris'), false, 'texte = sensible à la casse'],
        [c('Bordeaux', '>', 'Amiens'), true, 'texte > (ordre lexical)'],
        [c('Grand Est', 'contient', 'est'), true, 'contient insensible à la casse'],
        [c('Grand Nord', 'contient', 'est'), false, 'contient absent'],
        [c(null, 'vide', null), true, 'vide sur null'],
        [c('', 'vide', null), true, 'vide sur chaîne vide'],
        [c('x', 'vide', null), false, 'vide faux si non vide'],
        [c('x', 'non vide', null), true, 'non vide vrai'],
        [c(null, 'non vide', null), false, 'non vide faux sur null'],
      ];
      const failed = checks.filter(([actual, expected]) => actual !== expected);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify(failed.map(f => f[2])) : 'OK' };
    },
  });

  // --- compareValues, columnType : Bool/Date-DateTime étaient structurellement incapables de correspondre à AUCUNE valeur saisie avant ce correctif
  // (Antoine, 2026-09-28 : "la condition ne fonctionne pas..."). Un 1er correctif (`d31b15a`) a aussi tenté Reference/ReferenceList en supposant un
  // format [id, valeur affichée] qui n'existe sur AUCUN des deux chemins réels de lecture (audit du coordinateur contre grist-core, 2026-09-28) - retiré,
  // condition non fiable sur ce type pour l'instant (repli sur la comparaison générique, cf. macro-templates.js). Date/DateTime arrive sous deux formes
  // réelles selon le chemin (même audit) : un objet Date (GristDate, chemin aperçu/lecture d'une ligne, js/main.js:524) OU un nombre de secondes UTC
  // (chemin export en lot multi-lignes, js/main.js:773/840) - les deux sont exercées ici. Construites en UTC (Date.UTC), JAMAIS `new Date(y,m,d)` (heure
  // locale) : le fuseau du navigateur/serveur qui exécute ce test ne doit jamais changer le résultat, puisque toUtcInstant/parseDateExpected/dayKey
  // (macro-templates.js) n'utilisent eux-mêmes que des accesseurs UTC - une seule exécution couvre donc tous les fuseaux par construction, sans avoir
  // besoin de faire tourner ce harnais dans plusieurs `timezoneId` Playwright pour le prouver.
  // Sans `columnType` (4e paramètre), ces deux cas restent ignorés (cf. macro_compare_operators ci-dessus) - c'est justement l'ancien comportement qui
  // cassait silencieusement ces colonnes.
  cases.push({
    id: 'macro_compare_values_column_type_aware',
    description: 'compareValues interprète Bool ("Oui"/"Non") et Date/DateTime (objet Date OU secondes UTC, jour/avant/après, fuseau de colonne, "contient", dates invalides rejetées) selon columnType',
    run: async () => {
      const c = MacroTemplates.compareValues;
      const day26Obj = new Date(Date.UTC(2026, 8, 26)); // forme "onRecord" (objet Date, ex. GristDate)
      const day26Sec = Date.UTC(2026, 8, 26) / 1000; // forme "export en lot" (secondes UTC, js/variable-format.js)
      const day27Obj = new Date(Date.UTC(2026, 8, 27));
      // 26/09 23h30 UTC = 27/09 01h30 à Paris (CEST, UTC+2, encore actif fin septembre) - le jour Paris diffère du jour UTC (audit du coordinateur,
      // 2026-09-28, trouvé en vérifiant CE correctif séparément du bug Choice d'Antoine dont la cause est ailleurs, cf. js/grist-api.js:includeColumns).
      const parisLateObj = new Date(Date.UTC(2026, 8, 26, 23, 30));
      const parisLateSec = Date.UTC(2026, 8, 26, 23, 30) / 1000;
      const day03MarObj = new Date(Date.UTC(2026, 2, 3));
      const checks = [
        [c(true, '=', 'Oui', 'Bool'), true, 'Bool = "Oui" sur true'],
        [c(false, '=', 'Non', 'Bool'), true, 'Bool = "Non" sur false'],
        [c(true, '=', 'Non', 'Bool'), false, 'Bool = "Non" sur true est faux'],
        [c(true, '≠', 'Non', 'Bool'), true, 'Bool ≠ "Non" sur true'],
        [c(day26Obj, '=', '26/09/2026', 'Date'), true, 'Date (objet) = format FR'],
        [c(day26Obj, '=', '2026-09-26', 'Date'), true, 'Date (objet) = format ISO'],
        [c(day26Sec, '=', '26/09/2026', 'Date'), true, 'Date (secondes) = format FR'],
        [c(day26Sec, '=', '2026-09-26', 'DateTime:UTC'), true, 'DateTime (secondes) = format ISO'],
        [c(day26Obj, '≠', '27/09/2026', 'Date'), true, 'Date (objet) ≠ jour différent'],
        [c(day26Sec, '≠', '27/09/2026', 'DateTime:UTC'), true, 'DateTime (secondes) ≠ jour différent'],
        [c(day26Obj, '<', '27/09/2026', 'Date'), true, 'Date (objet) < jour suivant'],
        [c(day26Sec, '<', '27/09/2026', 'DateTime:UTC'), true, 'DateTime (secondes) < jour suivant'],
        [c(day27Obj, '>', '26/09/2026', 'Date'), true, 'Date (objet) > jour précédent'],
        // Cohérence entre opérateurs à la même paire de valeurs (14h le jour J doit être = J, PAS > J, et ≤ J) - avant ce correctif, "=" utilisait le
        // jour et ">"/"≤" l'instant exact, ce qui les rendait incohérents entre eux (audit du coordinateur, 2026-09-28).
        [c(new Date(Date.UTC(2026, 8, 26, 14, 0)), '=', '26/09/2026', 'Date'), true, '14h le jour J est bien = J'],
        [c(new Date(Date.UTC(2026, 8, 26, 14, 0)), '>', '26/09/2026', 'Date'), false, '14h le jour J ne doit PAS être > J'],
        [c(new Date(Date.UTC(2026, 8, 26, 14, 0)), '≤', '26/09/2026', 'Date'), true, '14h le jour J doit être ≤ J (inclusif)'],
        // Fuseau de colonne (DateTime:<fuseau>) : même instant, jour différent selon le fuseau déclaré par la colonne.
        [c(parisLateObj, '=', '27/09/2026', 'DateTime:Europe/Paris'), true, 'DateTime (objet, fuseau Paris) = jour Paris (différent du jour UTC)'],
        [c(parisLateSec, '=', '27/09/2026', 'DateTime:Europe/Paris'), true, 'DateTime (secondes, fuseau Paris) = jour Paris'],
        [c(parisLateObj, '=', '26/09/2026', 'DateTime:UTC'), true, 'même instant, = jour UTC quand la colonne est déclarée UTC'],
        [c(parisLateObj, '=', '26/09/2026', 'DateTime:Europe/Paris'), false, 'le même instant ne doit PAS matcher le jour UTC quand la colonne est à Paris'],
        // "contient" sur une date : avant ce correctif, toujours faux (régression par rapport à avant le tout premier correctif) - doit à nouveau
        // fonctionner, sur les DEUX chemins de lecture, sans dépendre d'une coïncidence de format.
        [c(day26Obj, 'contient', '09-26', 'Date'), true, 'contient (objet) retrouve un fragment du jour'],
        [c(day26Sec, 'contient', '2026-09-26', 'DateTime:UTC'), true, 'contient (secondes) retrouve le jour complet'],
        [c(day26Obj, 'contient', '2026-10', 'Date'), false, 'contient (objet) absent'],
        // Date saisie invalide : avant ce correctif, Date.UTC débordait silencieusement sur un autre mois/année au lieu d'être rejetée.
        [c(day03MarObj, '=', '31/02/2026', 'Date'), false, '31/02 (jour hors bornes du mois) rejeté, ne déborde plus silencieusement sur le 03/03'],
        [c(new Date(Date.UTC(2028, 1, 9)), '=', '09/26/2026', 'Date'), false, 'mois=26 (saisie US par erreur) rejeté, ne déborde plus sur le 09/02/2028'],
        // Régression trouvée seulement sur ">"/"≥"/"<" (pas "=", déjà correct ci-dessus) : `expected` illisible retombait sur la comparaison générique en
        // TEXTE ci-dessous, qui matchait parfois par ordre lexicographique de chaînes ("09/26/2026" > "2026-09-26T00:00:00.000Z" en tant que chaînes) -
        // une date invalide doit être fausse pour TOUS les opérateurs, jamais seulement "=" (audit du coordinateur, 2026-09-28).
        [c(day26Obj, '>', '09/26/2026', 'Date'), false, 'mois=26 invalide avec ">" : faux, pas un repli texte qui matche par accident'],
        [c(day26Obj, '≥', '09/26/2026', 'Date'), false, 'mois=26 invalide avec "≥" : faux'],
        [c(day26Obj, '<', '31/02/2026', 'Date'), false, '31/02 invalide avec "<" : faux'],
        [c(day26Sec, '≥', '09/26/2026', 'DateTime:Europe/Paris'), false, 'même régression sur DateTime (secondes, fuseau Paris)'],
      ];
      const failed = checks.filter(([actual, expected]) => actual !== expected);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify(failed.map(f => f[2])) : 'OK' };
    },
  });

  // --- parseColumnRef : colonne nue (table courante) vs "Table.Colonne" (cross-table, même mécanisme que #Variable). ---
  cases.push({
    id: 'macro_parse_column_ref',
    description: 'parseColumnRef distingue une colonne nue (table courante) et une référence "Table.Colonne"',
    run: async () => {
      const bare = MacroTemplates.parseColumnRef('TypeDossier', 'Dossiers');
      const qualified = MacroTemplates.parseColumnRef('Clients.Statut', 'Dossiers');
      const pass = bare.table === 'Dossiers' && bare.column === 'TypeDossier' && qualified.table === 'Clients' && qualified.column === 'Statut';
      return { pass, notes: JSON.stringify({ bare, qualified }) };
    },
  });

  // --- pickModeleId : slot fixe (page de garde), toujours le même modèle quelle que soit la ligne. ---
  cases.push({
    id: 'macro_pick_fixed_slot',
    description: 'pickModeleId renvoie toujours le même modeleId pour un slot fixe (page de garde), sans lire la ligne',
    run: async () => {
      const slot = { type: 'fixed', modeleId: '42' };
      const id1 = await MacroTemplates.pickModeleId(slot, 'Dossiers', { id: 1, TypeDossier: 'A' });
      const id2 = await MacroTemplates.pickModeleId(slot, 'Dossiers', { id: 2, TypeDossier: 'B' });
      const pass = id1 === '42' && id2 === '42';
      return { pass, notes: JSON.stringify({ id1, id2 }) };
    },
  });

  // --- pickModeleId : slot conditionnel, première règle qui correspond gagne (contre la MÊME ligne que la page de garde - décision d'Antoine). ---
  cases.push({
    id: 'macro_pick_conditional_first_rule_wins',
    description: 'pickModeleId choisit le modèle de la première règle qui correspond, sur la ligne courante fournie',
    run: async () => {
      const slot = {
        type: 'conditional',
        rules: [
          { column: 'TypeDossier', operator: '=', value: 'Particulier', modeleId: 'annexe-particulier' },
          { column: 'TypeDossier', operator: '=', value: 'Entreprise', modeleId: 'annexe-entreprise' },
        ],
        defaultModeleId: null,
      };
      const record = { id: 7, TypeDossier: 'Entreprise' };
      const chosen = await MacroTemplates.pickModeleId(slot, 'Dossiers', record);
      return { pass: chosen === 'annexe-entreprise', notes: 'chosen=' + chosen };
    },
  });

  cases.push({
    id: 'macro_pick_conditional_no_match_uses_default',
    description: 'pickModeleId retombe sur defaultModeleId quand aucune règle ne correspond à la ligne',
    run: async () => {
      const slot = {
        type: 'conditional',
        rules: [{ column: 'TypeDossier', operator: '=', value: 'Particulier', modeleId: 'annexe-particulier' }],
        defaultModeleId: 'annexe-defaut',
      };
      const record = { id: 8, TypeDossier: 'Association' };
      const chosen = await MacroTemplates.pickModeleId(slot, 'Dossiers', record);
      return { pass: chosen === 'annexe-defaut', notes: 'chosen=' + chosen };
    },
  });

  cases.push({
    id: 'macro_pick_conditional_no_match_no_default_skips',
    description: 'pickModeleId renvoie null (annexe absente du document assemblé) sans règle correspondante ni valeur par défaut',
    run: async () => {
      const slot = {
        type: 'conditional',
        rules: [{ column: 'TypeDossier', operator: '=', value: 'Particulier', modeleId: 'annexe-particulier' }],
        defaultModeleId: null,
      };
      const record = { id: 9, TypeDossier: 'Association' };
      const chosen = await MacroTemplates.pickModeleId(slot, 'Dossiers', record);
      return { pass: chosen === null, notes: 'chosen=' + chosen };
    },
  });

  // --- buildConcatenatedHtml : assemble page de garde + annexes retenues, séparées par le même marqueur que "Saut de page" manuel, dans l'ordre des
  // slots ; un slot résolu à null (aucune règle ni défaut) est absent du résultat, sans laisser de séparateur orphelin. ---
  cases.push({
    id: 'macro_build_concatenated_html_order_and_separators',
    description: 'buildConcatenatedHtml assemble les fragments retenus dans l’ordre des slots, séparés par le marqueur de saut de page',
    run: async () => {
      const templates = [
        { id: 'cover', contenu: '<p>PAGE DE GARDE</p>' },
        { id: 'annexe-a', contenu: '<p>ANNEXE A</p>' },
        { id: 'annexe-b', contenu: '<p>ANNEXE B</p>' },
      ];
      const macroSlots = {
        slots: [
          { type: 'fixed', modeleId: 'cover' },
          { type: 'conditional', rules: [{ column: 'TypeDossier', operator: '=', value: 'X', modeleId: 'annexe-a' }], defaultModeleId: null },
          { type: 'conditional', rules: [{ column: 'TypeDossier', operator: '=', value: 'Entreprise', modeleId: 'annexe-b' }], defaultModeleId: null },
        ],
      };
      const record = { id: 1, TypeDossier: 'Entreprise' };
      const html = await MacroTemplates.buildConcatenatedHtml(macroSlots, 'Dossiers', record, templates);
      const expected = '<p>PAGE DE GARDE</p>' + MacroTemplates.PAGE_BREAK_HTML + '<p>ANNEXE B</p>';
      return { pass: html === expected, notes: html };
    },
  });

  cases.push({
    id: 'macro_build_concatenated_html_missing_template_is_skipped',
    description: 'buildConcatenatedHtml ignore un slot dont le modeleId ne correspond à aucun modèle connu, sans planter',
    run: async () => {
      const templates = [{ id: 'cover', contenu: '<p>PAGE DE GARDE</p>' }];
      const macroSlots = { slots: [{ type: 'fixed', modeleId: 'cover' }, { type: 'fixed', modeleId: 'inconnu' }] };
      const html = await MacroTemplates.buildConcatenatedHtml(macroSlots, 'Dossiers', { id: 1 }, templates);
      return { pass: html === '<p>PAGE DE GARDE</p>', notes: html };
    },
  });

  // --- Bout en bout minimal : le HTML assemblé traverse ReaderMode.render() sans traitement spécial - même moteur qu'un modèle normal (aucun code
  // dédié aux macro modèles dans reader-mode.js), donc les deux fragments et le saut de page entre eux doivent apparaître tels quels dans le rendu. ---
  cases.push({
    id: 'macro_concatenated_html_renders_through_reader_mode',
    description: 'Le HTML assemblé par un macro modèle se rend dans #reader-container comme un document normal, avec un saut de page entre les slots',
    run: async (h) => {
      const templates = [
        { id: 'cover', contenu: '<p>Contenu de la page de garde</p>' },
        { id: 'annexe', contenu: '<p>Contenu de l’annexe choisie</p>' },
      ];
      const macroSlots = { slots: [{ type: 'fixed', modeleId: 'cover' }, { type: 'fixed', modeleId: 'annexe' }] };
      const html = await MacroTemplates.buildConcatenatedHtml(macroSlots, 'Dossiers', { id: 1 }, templates);
      const content = await h.renderReaderMode(html);
      const text = content ? content.textContent : '';
      const hasBothFragments = text.includes('Contenu de la page de garde') && text.includes('Contenu de l’annexe choisie');
      const hasPageBreak = !!content.querySelector('.page-break-marker');
      return { pass: hasBothFragments && hasPageBreak, notes: JSON.stringify({ hasBothFragments, hasPageBreak, text }) };
    },
  });

  // --- État rendu du champ colonne de la modale (js/macro-editor.js:buildColumnField) - demande d'Antoine du 2026-09-28 : "que le champ ... soit une
  // liste des colonnes de la page sur laquelle est le widget" plutôt qu'un texte libre. Teste l'état RENDU (options du <select>, visibilité du champ
  // avancé, texte de l'indice de type), pas seulement la logique - exigence du projet pour toute correction UI. ---
  cases.push({
    id: 'macro_rule_column_field_lists_real_columns',
    description: 'Le champ colonne de la modale macro liste les vraies colonnes de la table courante, garde un repli "avancé", et adapte l’indice de type',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersTest', { TypeDossier: 'Text', Actif: 'Bool' });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Actif: true }, 'DossiersTest');
      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);

      const row = document.querySelector('.macro-rule-row');
      const select = row ? row.querySelector('select.macro-rule-column') : null;
      const optionValues = select ? Array.from(select.options).map(o => o.value) : [];
      const hasRealColumns = optionValues.includes('TypeDossier') && optionValues.includes('Actif');
      const advancedInput = row ? row.querySelector('.macro-rule-column-advanced') : null;
      const hasAdvancedOption = optionValues.includes('__advanced__'); // ADVANCED_COLUMN_VALUE (js/macro-editor.js)
      const advancedHiddenInitially = advancedInput ? advancedInput.hidden : null;

      select.value = 'Actif';
      select.dispatchEvent(new Event('change'));
      const typeHint = row.querySelector('.macro-rule-column-type');
      const valInput = row.querySelector('.macro-rule-value');
      const boolHintOk = typeHint.textContent === I18n.t('macro.modal.typeBool');
      const boolPlaceholderOk = valInput.placeholder === I18n.t('macro.modal.valuePlaceholderBool');

      select.value = '__advanced__';
      select.dispatchEvent(new Event('change'));
      const advancedVisibleAfterToggle = advancedInput.hidden === false;

      const pass = hasRealColumns && hasAdvancedOption && advancedHiddenInitially === true && boolHintOk && boolPlaceholderOk && advancedVisibleAfterToggle;
      return { pass, notes: JSON.stringify({ optionValues, boolHintOk, boolPlaceholderOk, advancedHiddenInitially, advancedVisibleAfterToggle }) };
    },
  });

  // --- État rendu du champ Valeur pour une colonne Choice (js/macro-editor.js:buildValueField) - Antoine, 2026-09-28 : "une colonne comprenant des
  // choix uniques avec l'opérateur '=' ça ne fonctionne pas". La cause réelle (colonne masquée dans le panneau du widget, cf. le test ci-dessous) est
  // réglée côté js/grist-api.js:includeColumns, mais un dropdown des vrais choix Grist (au lieu d'un texte libre) élimine en plus toute la classe des
  // fautes de frappe/casse/espace qui feraient échouer "=" en silence - même patron que buildColumnField pour la colonne. ---
  cases.push({
    id: 'macro_rule_value_field_choice_dropdown',
    description: 'Le champ Valeur devient un <select> des vrais choix Grist pour une colonne Choice, avec repli "autre valeur" pour une valeur déjà enregistrée absente des choix actuels',
    run: async (h) => {
      await h.resetEditor();
      // Nom de table dédié, jamais réutilisé par un autre cas de ce fichier : le faux Grist ne reconstruit PAS state.rows[tableId] (donc GristAPI.getColumns)
      // sur un 2e setVariables() du même tableId (seulement state.columns, cf. dev-tests/grist-stub.js) - réutiliser "DossiersTest" ici laissait "Statut"
      // absent du <select> colonne (limite du faux Grist, pas de MacroEditor), trouvé en debuggant ce test.
      window.__gristStub.setVariables('DossiersChoixTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'En cours', 'Clos'] });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Statut: 'Urgent' }, 'DossiersChoixTest');

      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);
      let row = document.querySelector('.macro-rule-row');
      let columnSelect = row.querySelector('select.macro-rule-column');
      columnSelect.value = 'Statut';
      columnSelect.dispatchEvent(new Event('change'));

      const valueSelect = row.querySelector('select.macro-rule-value');
      const optionValues = valueSelect ? Array.from(valueSelect.options).map(o => o.value) : [];
      const hasRealChoices = optionValues.includes('Urgent') && optionValues.includes('En cours') && optionValues.includes('Clos');
      const hasAdvancedValueOption = optionValues.includes('__advanced_value__'); // ADVANCED_VALUE (js/macro-editor.js)
      const advancedValueInput = row.querySelector('.macro-rule-value-advanced');
      const advancedHiddenInitially = advancedValueInput ? advancedValueInput.hidden : null;

      valueSelect.value = '__advanced_value__';
      valueSelect.dispatchEvent(new Event('change'));
      const advancedVisibleAfterToggle = advancedValueInput.hidden === false;

      // Une valeur DÉJÀ enregistrée (ex. un ancien choix retiré côté Grist depuis) qui ne correspond à aucun choix actuel doit rester visible en saisie
      // avancée à l'ouverture, jamais silencieusement effacée ni remplacée par le premier choix venu.
      MacroEditor.openModal({ id: null, nom: 'x', macroSlots: { slots: [
        { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'ValeurObsolete', modeleId: null }], defaultModeleId: null },
      ] } });
      await h.sleep(20);
      row = document.querySelector('.macro-rule-row');
      const staleValueSelect = row.querySelector('select.macro-rule-value');
      const staleAdvancedInput = row.querySelector('.macro-rule-value-advanced');
      const staleValueKept = staleValueSelect && staleValueSelect.value === '__advanced_value__'
        && staleAdvancedInput && staleAdvancedInput.hidden === false && staleAdvancedInput.value === 'ValeurObsolete';

      const pass = hasRealChoices && hasAdvancedValueOption && advancedHiddenInitially === true && advancedVisibleAfterToggle && staleValueKept;
      return { pass, notes: JSON.stringify({ optionValues, advancedHiddenInitially, advancedVisibleAfterToggle, staleValueKept }) };
    },
  });

  // --- Avertissement visible (js/macro-editor.js:updateTypeHint) quand la colonne choisie par une règle est absente de la ligne actuellement affichée
  // (record) - cause RÉELLE du bug Choice d'Antoine du 2026-09-28 (colonne pas cochée dans le panneau de droite DE CE WIDGET -> absente d'onRecord par
  // défaut, cf. js/grist-api.js:includeColumns), trouvée par l'audit du coordinateur en vérifiant grist-core à la source. Sans ce signal, rien
  // n'indique que la règle ne PEUT pas fonctionner tant que la colonne n'est pas cochée là-bas. ---
  cases.push({
    id: 'macro_rule_column_missing_from_record_warns',
    description: 'La modale macro avertit visiblement quand la colonne choisie par une règle est absente de la ligne actuellement affichée dans le widget',
    run: async (h) => {
      await h.resetEditor();
      // Nom de table dédié, jamais réutilisé ailleurs dans ce fichier (cf. le commentaire du test précédent sur cette même limite du faux Grist).
      window.__gristStub.setVariables('DossiersMissingColTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      await GristAPI.refreshSchema();
      // Statut n'est délibérément PAS dans ce record - simule une colonne non cochée dans le panneau du widget (includeColumns:'shown').
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier' }, 'DossiersMissingColTest');

      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);
      const row = document.querySelector('.macro-rule-row');
      const columnSelect = row.querySelector('select.macro-rule-column');
      const typeHint = row.querySelector('.macro-rule-column-type');

      columnSelect.value = 'TypeDossier';
      columnSelect.dispatchEvent(new Event('change'));
      const noWarningWhenPresent = !typeHint.classList.contains('is-warning');

      columnSelect.value = 'Statut';
      columnSelect.dispatchEvent(new Event('change'));
      const warnsWhenMissing = typeHint.classList.contains('is-warning') && typeHint.textContent === I18n.t('macro.modal.columnMissingFromRecord');

      const pass = noWarningWhenPresent && warnsWhenMissing;
      return { pass, notes: JSON.stringify({ noWarningWhenPresent, warnsWhenMissing, typeHintText: typeHint.textContent }) };
    },
  });

  // --- Verrou de la cause RÉELLE du bug Choice d'Antoine (audit du coordinateur, 2026-09-28) : le test ci-dessus et le dropdown de choix passent même
  // si js/grist-api.js:onRecord perd son 2e argument {includeColumns:'normal'}, parce que le faux Grist ignorait jusqu'ici les options de onRecord (le
  // coordinateur l'a mesuré en le retirant : 15/15 quand même). window.__gristStub.setHiddenColumns simule une colonne PAS cochée dans le panneau de
  // droite DE CE WIDGET (includeColumns:'shown', le défaut réel de Grist, vérifié à la source) - CE test doit échouer si le correctif disparaît. ---
  cases.push({
    id: 'macro_rule_matches_when_column_hidden_from_widget_section',
    description: 'Une règle sur une colonne PAS cochée dans le panneau de droite du widget matche quand même (includeColumns:"normal"), et la modale ne montre pas de faux avertissement',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersHiddenColTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      window.__gristStub.setHiddenColumns('DossiersHiddenColTest', ['Statut']); // Statut PAS cochée dans le panneau de droite de CE widget
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Statut: 'Urgent' }, 'DossiersHiddenColTest');
      await h.sleep(20);

      const record = GristAPI.getCurrentRecord();
      const columnMissingFromRecord = !('Statut' in record); // sans le correctif (includeColumns par défaut 'shown'), vrai

      const slot = { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: 'm1' }], defaultModeleId: 'm-defaut' };
      const chosen = await MacroTemplates.pickModeleId(slot, 'DossiersHiddenColTest', record);
      const ruleMatchedDespiteHiddenColumn = chosen === 'm1'; // le point que le correctif doit verrouiller

      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);
      const row = document.querySelector('.macro-rule-row');
      const columnSelect = row.querySelector('select.macro-rule-column');
      const typeHint = row.querySelector('.macro-rule-column-type');
      columnSelect.value = 'Statut';
      columnSelect.dispatchEvent(new Event('change'));
      const noWarningDespiteHiddenColumn = !typeHint.classList.contains('is-warning');

      const pass = !columnMissingFromRecord && ruleMatchedDespiteHiddenColumn && noWarningDespiteHiddenColumn;
      return { pass, notes: JSON.stringify({ columnMissingFromRecord, ruleMatchedDespiteHiddenColumn, noWarningDespiteHiddenColumn, recordKeys: Object.keys(record) }) };
    },
  });

  // --- Verrou de la régression de production du 2026-09-28 (mesurée par le coordinateur avec le vrai grist-plugin-api.js/grain-rpc) : une PREMIÈRE
  // version bascule pas à pas (repli 'shown' seul au démarrage, souscription 'normal' ajoutée seulement APRÈS confirmation de l'accès complet par
  // onOptions) laissait getCurrentRecord() à `null` en accès complet (cas normal d'Antoine) parce que la confirmation d'accès arrivait AVANT que le
  // repli 'shown' n'ait fini son aller-retour RPC, et la souscription 'normal' ajoutée après coup n'avait de toute façon jamais reçu ce premier
  // message (pas de rejeu d'événements passés côté bus 'message' de grist-plugin-api.ts). Le correctif enregistre 'shown' ET 'normal' ENSEMBLE, tous
  // les deux avant tout await, dans init() (js/grist-api.js) - il n'y a plus de bascule différée à rater, donc plus d'ordre d'arrivée à reproduire
  // fidèlement ici (grist-stub.js:fireRecord est resté volontairement synchrone, cf. son commentaire). Ce test verrouille l'état final : la ligne
  // reçue au tout premier événement onRecord doit porter les données enrichies ('normal'), jamais rester sur les données bridées du repli 'shown'
  // ni sur `null` - doit échouer si une bascule différée (dépendante de l'ordre d'arrivée) réapparaît. ---
  cases.push({
    id: 'macro_onrecord_no_data_loss_when_access_confirmation_races_delivery',
    description: 'getCurrentRecord() n\'est jamais null/incomplet après le tout premier fireRecord, même juste après une confirmation d\'accès (onOptions) (régression de production du 2026-09-28)',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersRaceStartupTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      window.__gristStub.setHiddenColumns('DossiersRaceStartupTest', ['Statut']); // Statut PAS cochée dans le panneau de droite de CE widget
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Statut: 'Urgent' }, 'DossiersRaceStartupTest');
      window.__gristStub.setAccessLevel('full'); // équivalent d'une confirmation onOptions/ConfigNotifier juste après la ligne
      await h.sleep(20);

      const record = GristAPI.getCurrentRecord();
      const recordIsNull = !record;
      const columnMissingFromRecord = !record || !('Statut' in record); // 'Statut' est masquée pour 'shown' : sa présence prouve que 'normal' a bien livré

      const pass = !recordIsNull && !columnMissingFromRecord;
      return { pass, notes: JSON.stringify({ recordIsNull, columnMissingFromRecord, recordKeys: record ? Object.keys(record) : null }) };
    },
  });

  // --- Mise en page réelle du ⚠ (2e audit du coordinateur, 2026-09-28, mesuré à la vraie souris) : dans .macro-rule-column-wrap (~1/3 de la ligne), le
  // texte de l'avertissement (400px+) écrasait le reste de la ligne - le sélecteur de colonne tombait à 10px. Vérifie l'état RENDU (rect + elementFromPoint,
  // pas juste une classe CSS) : le ⚠ doit être ENTIÈREMENT atteignable au clic sur toute sa largeur, jamais recouvert par un voisin. ---
  cases.push({
    id: 'macro_rule_missing_column_warning_own_full_width_line',
    description: 'L’avertissement "colonne absente" occupe sa propre ligne pleine largeur (entièrement touché par elementFromPoint), sans écraser la largeur du sélecteur de colonne',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersWarnLayoutTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier' }, 'DossiersWarnLayoutTest'); // Statut absent du record

      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);
      const row = document.querySelector('.macro-rule-row');
      const columnSelect = row.querySelector('select.macro-rule-column');
      columnSelect.value = 'Statut';
      columnSelect.dispatchEvent(new Event('change'));
      await h.sleep(20);

      const typeHint = row.querySelector('.macro-rule-column-type');
      const hintRect = typeHint.getBoundingClientRect();
      const midY = hintRect.top + hintRect.height / 2;
      const samples = 12;
      const inset = 3; // évite le bord exact du rect (arrondi sous-pixel/ligne voisine) - pas ce qu'on cherche à mesurer
      let hitCount = 0;
      for (let i = 0; i < samples; i++) {
        const x = hintRect.left + inset + ((hintRect.width - 2 * inset) * i) / (samples - 1);
        const el = document.elementFromPoint(x, midY);
        if (el === typeHint || (el && typeHint.contains(el))) hitCount++;
      }
      const warningFullyHit = hitCount === samples;

      const rowRect = row.getBoundingClientRect();
      const hintOwnFullLine = hintRect.width >= rowRect.width - 20; // pleine largeur de LA LIGNE, pas seulement de columnField.wrap (~1/3)

      // Le champ VISIBLE de la colonne : la liste avec recherche (js/search-select.js), qui masque le <select> (largeur 0) ; le <select> lui-même si le composant n'est pas là.
      const columnField = row.querySelector('.macro-rule-column-wrap .ss-trigger') || columnSelect;
      const columnSelectRect = columnField.getBoundingClientRect();
      const columnSelectReadable = columnSelectRect.width >= 80; // pas réduit à 10px par l'avertissement

      const pass = warningFullyHit && hintOwnFullLine && columnSelectReadable;
      return { pass, notes: JSON.stringify({ hitCount, samples, hintRectWidth: hintRect.width, rowRectWidth: rowRect.width, columnSelectWidth: columnSelectRect.width }) };
    },
  });

  // --- Mise en page réelle du repli "autre valeur" (2e audit du coordinateur, 2026-09-28) : select ET champ texte visibles ensemble se partageaient la
  // largeur à 50/50 jusqu'à tronquer leur texte ("Autre valeur…" -> "Au"). Vérifie les largeurs RENDUES (rect), pas juste que le champ est visible. ---
  cases.push({
    id: 'macro_rule_value_advanced_fallback_keeps_readable_width',
    description: 'Le repli "autre valeur" (select + champ texte visibles ensemble) garde une largeur lisible pour les deux, sans être tronqué à quelques caractères',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersValWidthTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Statut: 'Urgent' }, 'DossiersValWidthTest');

      MacroEditor.openModal({ id: null, nom: 'x', macroSlots: { slots: [
        { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Ancien choix', modeleId: null }], defaultModeleId: null },
      ] } });
      await h.sleep(20);
      const row = document.querySelector('.macro-rule-row');
      const valueSelect = row.querySelector('select.macro-rule-value');
      const valueAdvanced = row.querySelector('.macro-rule-value-advanced');

      const selectWidth = valueSelect.getBoundingClientRect().width;
      const advancedWidth = valueAdvanced.getBoundingClientRect().width;
      const minWidthRespected = selectWidth >= 85 && advancedWidth >= 85; // marge sous les 90px CSS pour bordures/arrondi

      const pass = !valueAdvanced.hidden && minWidthRespected;
      return { pass, notes: JSON.stringify({ selectWidth, advancedWidth, hidden: valueAdvanced.hidden }) };
    },
  });

  // --- Défaut préexistant (pas de ce push) relevé en retouchant la même modale (coordinateur, 2026-09-28) : Enregistrer/Annuler sortaient de la fenêtre
  // dans un panneau bas (700×400 - la taille probable du panneau d'Antoine, cf. mémoire d'équipe section Environnement) dès qu'une règle est ajoutée,
  // la modale n'ayant ni hauteur maximale ni défilement interne. Vérifie l'état RENDU (elementFromPoint) à la taille de fenêtre réelle du harnais - un
  // panneau plus grand masquerait le défaut. ---
  cases.push({
    id: 'macro_editor_modal_save_cancel_reachable_in_short_viewport',
    description: 'Les boutons Enregistrer/Annuler de la modale macro restent atteignables (touchés par elementFromPoint) même quand la fenêtre est basse',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersModalHeightTest', { TypeDossier: 'Text' });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier' }, 'DossiersModalHeightTest');

      MacroEditor.openModal(null);
      // Plusieurs annexes conditionnelles : pousse le contenu au-delà d'un panneau bas, exactement le cas signalé.
      for (let i = 0; i < 3; i++) document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);

      function reachable(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) return false;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === el || (hit && el.contains(hit));
      }

      const saveBtn = document.getElementById('macro-editor-save');
      const cancelBtn = document.getElementById('macro-editor-cancel');
      const saveReachable = reachable(saveBtn);
      const cancelReachable = reachable(cancelBtn);

      const pass = saveReachable && cancelReachable;
      return {
        pass,
        notes: JSON.stringify({
          saveReachable, cancelReachable, innerHeight: window.innerHeight,
          saveRect: saveBtn ? saveBtn.getBoundingClientRect() : null,
        }),
      };
    },
  });

  // --- GristAPI.getColumnChoices (js/grist-api.js) - widgetOptions.choices d'une colonne Choice/ChoiceList, source du dropdown ci-dessus. ---
  cases.push({
    id: 'macro_get_column_choices',
    description: 'GristAPI.getColumnChoices renvoie les choix configurés (widgetOptions.choices) d’une colonne Choice, et null pour une colonne sans choix connus',
    run: async () => {
      window.__gristStub.setVariables('DossiersTest', { TypeDossier: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'En cours', 'Clos'] });
      await GristAPI.refreshSchema();
      const statutChoices = GristAPI.getColumnChoices('DossiersTest', 'Statut');
      const typeDossierChoices = GristAPI.getColumnChoices('DossiersTest', 'TypeDossier');
      const unknownColChoices = GristAPI.getColumnChoices('DossiersTest', 'ColonneInconnue');
      const pass = Array.isArray(statutChoices) && statutChoices.join(',') === 'Urgent,En cours,Clos'
        && typeDossierChoices === null && unknownColChoices === null;
      return { pass, notes: JSON.stringify({ statutChoices, typeDossierChoices, unknownColChoices }) };
    },
  });

  // --- Garde-fou de non-régression, distinct des cas ci-dessus : ceux-là testent MacroTemplates (résolution), celui-ci teste que js/main.js n'envoie
  // JAMAIS le JSON de composition d'un macro-modèle à Editor.setHTML(). Exercé par le VRAI flux UI (flyout "Nouveau" -> modale -> Enregistrer) plutôt
  // qu'un appel direct à loadTemplateIntoEditor : cette fonction vit dans la fermeture de js/main.js, non exposée sur window, et ce chemin réel couvre
  // en même temps loadTemplateIntoEditor ET onMacroSaved (js/main.js). Protège contre un futur réordonnancement de la garde de type
  // (js/main.js:loadTemplateIntoEditor) qui laisserait passer tpl.contenu jusqu'à l'éditeur avant la redirection vers loadMacroIntoEditor.
  cases.push({
    id: 'macro_save_flow_never_leaks_json_into_editor',
    description: 'Créer et enregistrer un macro-modèle par le vrai flux UI ne fait jamais atterrir son JSON de composition dans l’éditeur TipTap',
    run: async (h) => {
      await h.resetEditor();
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      const nameInput = document.getElementById('macro-editor-name');
      if (!nameInput) return { pass: false, notes: 'modale macro introuvable après clic sur "Nouveau macro-modèle"' };
      nameInput.value = 'Macro test fuite JSON';
      document.getElementById('macro-editor-save').click();
      await h.sleep(250);
      const html = EditorCore.getEditor().getHTML();
      const editorVisible = getComputedStyle(document.getElementById('editor-container')).display !== 'none';
      const summaryVisible = getComputedStyle(document.getElementById('macro-summary-container')).display !== 'none';
      const pass = !html.includes('slots') && !html.includes('macroSlots') && !editorVisible && summaryVisible;
      return { pass, notes: JSON.stringify({ html, editorVisible, summaryVisible }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.macroModeles = cases;
})();
