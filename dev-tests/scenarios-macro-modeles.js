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

  // --- compareValues sur une LISTE (choix multiples, liste de références : un tableau). Antoine, 2026-09-29, carte « Sur une colonne à choix multiples, que doit
  // tester « = » dans une règle ? » : « Contient ce choix » - « = Projet » retient aussi une ligne Projet + Urgent, « ≠ Projet » l'exclut. Avant, le tableau retombait
  // sur sa forme texte « Projet,Urgent » : « = Projet » était faux et « ≠ Projet » vrai pour une ligne qui a pourtant ce choix. Le même sens que le filtre d'une
  // boucle (js/loop-rules.js:ruleHolds). Une règle sur une valeur seule, et les autres opérateurs, ne changent pas. ---
  cases.push({
    id: 'macro_compare_list_contains',
    description: '« = » sur une liste (ChoiceList, liste de références) veut dire « contient ce choix » et « ≠ » « ne le contient pas » ; une valeur seule et les autres opérateurs ne changent pas',
    run: async () => {
      const c = MacroTemplates.compareValues;
      const both = ['Projet', 'Urgent'];
      const checks = [
        [c(both, '=', 'Projet', 'ChoiceList'), true, '= Projet retient Projet + Urgent'],
        [c(both, '=', 'Urgent', 'ChoiceList'), true, '= Urgent retient Projet + Urgent'],
        [c(both, '=', 'Interne', 'ChoiceList'), false, '= Interne ne retient pas Projet + Urgent'],
        [c(both, '≠', 'Projet', 'ChoiceList'), false, '≠ Projet exclut Projet + Urgent'],
        [c(both, '≠', 'Interne', 'ChoiceList'), true, '≠ Interne retient Projet + Urgent'],
        [c(['Projet'], '=', 'Projet', 'ChoiceList'), true, 'liste d’un seul choix : ='],
        [c(['Projet'], '≠', 'Projet', 'ChoiceList'), false, 'liste d’un seul choix : ≠'],
        [c(['Projet', 'Urgent'], '=', ' Urgent ', 'ChoiceList'), true, 'la valeur saisie est rognée, comme pour une valeur seule'],
        [c(['Dupont Jean', 'Martin Paul'], '=', 'Martin Paul', 'RefList:Annuaire'), true, 'liste de références : la valeur affichée'],
        [c(['Dupont Jean', 'Martin Paul'], '≠', 'Martin Paul', 'RefList:Annuaire'), false, 'liste de références : ≠'],
        [c([1, 2, 3], '=', '2'), true, 'liste de nombres : comparaison numérique de chaque élément'],
        [c([], '=', 'Projet', 'ChoiceList'), false, 'liste vide : = faux'],
        [c([], '≠', 'Projet', 'ChoiceList'), true, 'liste vide : ≠ vrai'],
        // Inchangé : une valeur seule (Choice, texte), qu'une chaîne « Projet,Urgent » n'est pas une liste, et les autres opérateurs.
        [c('Projet', '=', 'Projet', 'Choice'), true, 'Choice = : inchangé'],
        [c('Projet', '≠', 'Projet', 'Choice'), false, 'Choice ≠ : inchangé'],
        [c('Projet,Urgent', '=', 'Projet'), false, 'une chaîne n’est pas une liste'],
        [c(both, 'contient', 'proj', 'ChoiceList'), true, 'contient sur une liste : inchangé'],
        [c(both, 'non vide', null, 'ChoiceList'), true, 'non vide sur une liste : inchangé'],
        [c(null, '=', 'Projet', 'ChoiceList'), false, 'cellule vide : = faux'],
        [c(null, '≠', 'Projet', 'ChoiceList'), true, 'cellule vide : ≠ vrai'],
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

  // --- pickModeleId sur une colonne à choix multiples (Antoine, 2026-09-29) : la ligne coche « Projet » et « Urgent » (grist.onRecord livre un tableau), la règle
  // « Etiquettes = Projet » la retient. ---
  cases.push({
    id: 'macro_pick_conditional_list_column_equals_contains',
    description: 'pickModeleId : une règle « = Projet » sur une colonne à choix multiples retient la ligne qui coche Projet et Urgent ; « ≠ Projet » la laisse de côté',
    run: async () => {
      const record = { id: 10, Etiquettes: ['Projet', 'Urgent'] };
      const slot = operator => ({
        type: 'conditional',
        rules: [{ column: 'Etiquettes', operator, value: 'Projet', modeleId: 'annexe-projet' }],
        defaultModeleId: 'annexe-defaut',
      });
      const equals = await MacroTemplates.pickModeleId(slot('='), 'Dossiers', record);
      const differs = await MacroTemplates.pickModeleId(slot('≠'), 'Dossiers', record);
      const other = await MacroTemplates.pickModeleId(slot('='), 'Dossiers', { id: 11, Etiquettes: ['Interne'] });
      const pass = equals === 'annexe-projet' && differs === 'annexe-defaut' && other === 'annexe-defaut';
      return { pass, notes: JSON.stringify({ equals, differs, other }) };
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
      const expected = '<p>PAGE DE GARDE</p>' + MacroTemplates.slotBreakHtml(1) + '<p>ANNEXE B</p>';
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
    description: 'Le champ colonne de la modale macro liste les vraies colonnes de la table courante, garde un repli "avancé", adapte l’indice de type et le champ Valeur (la liste Oui / Non pour une colonne Oui / Non, plus de texte libre)',
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
      const boolHintOk = typeHint.textContent === I18n.t('macro.modal.typeBool');
      // Colonne Oui / Non : le champ Valeur est la liste de deux mots (js/condition-fields.js:buildBoolList), jamais un texte libre.
      const valSelect = row.querySelector('select.macro-rule-value');
      const boolValueOptions = valSelect ? Array.from(valSelect.options).map(o => o.value) : [];
      const boolValueListOk = JSON.stringify(boolValueOptions) === JSON.stringify(['', I18n.t('macro.modal.valueBoolYes'), I18n.t('macro.modal.valueBoolNo')])
        && !row.querySelector('input.macro-rule-value');

      select.value = '__advanced__';
      select.dispatchEvent(new Event('change'));
      const advancedVisibleAfterToggle = advancedInput.hidden === false;

      const pass = hasRealColumns && hasAdvancedOption && advancedHiddenInitially === true && boolHintOk && boolValueListOk && advancedVisibleAfterToggle;
      return { pass, notes: JSON.stringify({ optionValues, boolHintOk, boolValueOptions, boolValueListOk, advancedHiddenInitially, advancedVisibleAfterToggle }) };
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
      // Liste avec recherche (js/search-select.js) : le <select> est masqué, c'est son champ voisin qui occupe la place à l'écran.
      const valueSelect = row.querySelector('.macro-rule-value-wrap .ss-trigger') || row.querySelector('select.macro-rule-value');
      const valueAdvanced = row.querySelector('.macro-rule-value-advanced');

      const selectWidth = valueSelect.getBoundingClientRect().width;
      const advancedWidth = valueAdvanced.getBoundingClientRect().width;
      const minWidthRespected = selectWidth >= 85 && advancedWidth >= 85; // marge sous les 90px CSS pour bordures/arrondi

      const pass = !valueAdvanced.hidden && minWidthRespected;
      return { pass, notes: JSON.stringify({ selectWidth, advancedWidth, hidden: valueAdvanced.hidden }) };
    },
  });

  // --- Règle d'une annexe sur DEUX lignes (audit UX/UI du 2026-09-29, F8) : cinq contrôles sur une seule ligne se chevauchaient dans la fenêtre de 520 px - la
  // liste des colonnes recouvrait l'opérateur, dont le « = » disparaissait. Ligne 1 : « Si », colonne, opérateur ; ligne 2, sous la colonne : valeur, →, modèle ;
  // la croix, à droite, retire la règle entière ; l'avertissement « colonne absente » et l'indication de type (« nombre ») restent sur leur propre ligne, en dessous, et commencent sous la colonne (choix « Aligner » d'Antoine, 2026-09-29). Vérifie l'état RENDU (rectangles et
  // elementFromPoint), à la taille du harnais ; le même point est mesuré à 700×400, à la vraie souris, en clair et en sombre, par la section `ruleRows` de
  // verify-column-search-mouse.mjs (avec la fenêtre de condition et le filtre d'une boucle, qui gardent leur ligne unique). ---
  cases.push({
    id: 'macro_rule_two_lines_no_overlap',
    description: 'La règle d’une annexe tient sur deux lignes (« Si », colonne, opérateur ; puis valeur, →, modèle sous la colonne), aucun contrôle n’en recouvre un autre, la croix est centrée sur les deux, l’avertissement et l’indication de type passent dessous, sous la colonne',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('DossiersRuleTwoLinesTest', { TypeDossier: 'Text', Montant: 'Numeric', Statut: 'Choice' }, { Statut: ['Urgent', 'Clos'] });
      await GristAPI.refreshSchema();
      window.__gristStub.fireRecord({ id: 1, TypeDossier: 'Particulier', Montant: 10 }, 'DossiersRuleTwoLinesTest'); // Statut absent du record : l'avertissement s'affiche plus bas
      MacroEditor.openModal({ id: null, nom: 'x', macroSlots: { slots: [
        { type: 'conditional', rules: [
          { column: 'TypeDossier', operator: '≠', value: 'Entreprise', modeleId: null },
          { column: 'Montant', operator: '>', value: '5', modeleId: null },
        ], defaultModeleId: null },
      ] } });
      await h.sleep(30);

      const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; };
      // Le champ VISIBLE d'une liste : le déclencheur de la liste avec recherche (js/search-select.js), le <select> lui-même si le composant n'est pas là.
      const visibleField = (row, selector) => { const s = row.querySelector(selector); const w = s && s.nextElementSibling; return w && w.classList.contains('ss-wrap') ? w.querySelector('.ss-trigger') : s; };
      const controls = row => ({
        connector: row.querySelector('.macro-rule-connector'),
        column: visibleField(row, 'select.macro-rule-column'),
        operator: Array.from(row.querySelectorAll('select')).find(s => !s.matches('.macro-rule-column, .macro-rule-modele, .macro-rule-value')),
        value: row.querySelector('.macro-rule-value-slot'),
        arrow: row.querySelector('.macro-rule-arrow'),
        model: visibleField(row, 'select.macro-rule-modele'),
        remove: row.querySelector('.macro-rule-remove'),
      });
      const overlap = (a, c) => Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5;
      // Le bord gauche du TEXTE d'un élément (pas de sa boîte : l'indication de type prend toute la largeur de la règle et se décale par son retrait).
      const textLeft = el => { const range = document.createRange(); range.selectNodeContents(el); const rects = range.getClientRects(); return rects.length ? rects[0].left : null; };

      const rows = Array.from(document.querySelectorAll('#macro-editor-modal .macro-rule-row'));
      const problems = [];
      if (rows.length !== 2) problems.push('2 règles attendues, ' + rows.length + ' trouvées');
      const measured = rows.map((row, i) => {
        const parts = controls(row);
        const missing = Object.keys(parts).filter(k => !parts[k]);
        if (missing.length) { problems.push('règle ' + (i + 1) + ' : contrôle introuvable (' + missing.join(', ') + ')'); return null; }
        const b = {};
        Object.keys(parts).forEach(k => { b[k] = box(parts[k]); });
        const tag = 'règle ' + (i + 1) + ' : ';
        // Ligne 1 : « Si », la colonne et l'opérateur, alignés ; ligne 2 : la valeur, la flèche et le modèle, alignés, en dessous de la colonne.
        if (Math.abs(b.connector.cy - b.column.cy) > 3 || Math.abs(b.operator.cy - b.column.cy) > 3) problems.push(tag + '« Si », la colonne et l’opérateur ne sont pas sur une même ligne');
        if (Math.abs(b.value.cy - b.model.cy) > 3 || Math.abs(b.arrow.cy - b.model.cy) > 3) problems.push(tag + 'la valeur, la flèche et le modèle ne sont pas sur une même ligne');
        if (b.value.t < b.column.b - 1) problems.push(tag + 'la valeur n’est pas sous la colonne');
        if (Math.abs(b.value.l - b.column.l) > 2) problems.push(tag + 'la valeur n’est pas alignée sous la colonne');
        // Aucun contrôle n'en recouvre un autre, et chacun reçoit le clic en son centre (rien devant lui).
        const names = Object.keys(b);
        for (let x = 0; x < names.length; x++) for (let y = x + 1; y < names.length; y++) {
          if (overlap(b[names[x]], b[names[y]])) problems.push(tag + names[x] + ' et ' + names[y] + ' se recouvrent');
        }
        names.forEach(k => {
          const hit = document.elementFromPoint(b[k].cx, b[k].cy);
          if (!(hit === parts[k] || (hit && parts[k].contains(hit)))) problems.push(tag + k + ' est recouvert en son centre');
        });
        // Largeurs lisibles : ni le « = » de l'opérateur ni le nom d'un modèle ne sont rognés.
        if (b.column.w < 150) problems.push(tag + 'colonne trop étroite (' + Math.round(b.column.w) + ' px)');
        if (b.model.w < 150) problems.push(tag + 'modèle trop étroit (' + Math.round(b.model.w) + ' px)');
        if (b.operator.w < 40) problems.push(tag + 'opérateur trop étroit (' + Math.round(b.operator.w) + ' px)');
        if (b.value.w < 90) problems.push(tag + 'valeur trop étroite (' + Math.round(b.value.w) + ' px)');
        // La croix retire la règle entière : à droite des deux lignes, centrée verticalement sur elles.
        if (b.remove.l < Math.max(b.operator.r, b.model.r) - 0.5) problems.push(tag + 'la croix n’est pas à droite des deux lignes');
        if (Math.abs(b.remove.cy - (b.column.t + b.model.b) / 2) > 3) problems.push(tag + 'la croix n’est pas centrée sur les deux lignes');
        return b;
      });
      // Deux règles se suivent sans se chevaucher.
      if (rows.length === 2 && rows[1].getBoundingClientRect().top < rows[0].getBoundingClientRect().bottom - 0.5) problems.push('les deux règles se chevauchent');
      // L'indication de type (« nombre ») de la seconde règle : sous la seconde ligne, et son texte commence sous la colonne, comme dans la fenêtre de condition.
      const typeHint = rows[1] && rows[1].querySelector('.macro-rule-column-type');
      if (!typeHint || typeHint.textContent.trim() !== 'nombre') problems.push('l’indication de type « nombre » ne s’affiche pas (' + (typeHint ? typeHint.textContent : 'absente') + ')');
      else if (measured[1]) {
        if (Math.abs(textLeft(typeHint) - measured[1].column.l) > 2) problems.push('l’indication de type ne commence pas sous la colonne (' + Math.round(textLeft(typeHint)) + ' au lieu de ' + Math.round(measured[1].column.l) + ')');
        if (box(typeHint).t < Math.max(measured[1].value.b, measured[1].model.b) - 0.5) problems.push('l’indication de type n’est pas sous la seconde ligne');
      }

      // L'avertissement « colonne absente » : sur sa propre ligne, sous la valeur et le modèle, sans rien recouvrir.
      const firstRow = rows[0];
      const columnSelect = firstRow.querySelector('select.macro-rule-column');
      columnSelect.value = 'Statut';
      columnSelect.dispatchEvent(new Event('change'));
      await h.sleep(30);
      const hint = firstRow.querySelector('.macro-rule-column-type');
      const parts = controls(firstRow);
      if (!hint || !hint.textContent.trim()) problems.push('l’avertissement « colonne absente » ne s’affiche pas');
      else {
        const hb = box(hint);
        const lower = Math.max(box(parts.value).b, box(parts.model).b);
        if (hb.t < lower - 0.5) problems.push('l’avertissement n’est pas sous la seconde ligne (' + Math.round(hb.t) + ' < ' + Math.round(lower) + ')');
        ['column', 'operator', 'value', 'arrow', 'model', 'remove'].forEach(k => { if (overlap(hb, box(parts[k]))) problems.push('l’avertissement recouvre ' + k); });
        if (Math.abs(textLeft(hint) - box(parts.column).l) > 2) problems.push('l’avertissement ne commence pas sous la colonne (' + Math.round(textLeft(hint)) + ' au lieu de ' + Math.round(box(parts.column).l) + ')');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, firstRule: measured[0] && Object.fromEntries(Object.entries(measured[0]).map(([k, v]) => [k, [Math.round(v.l), Math.round(v.t), Math.round(v.w), Math.round(v.h)]])) }) };
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

  // --- GristAPI.getReferenceColumn / getReferenceValues (js/grist-api.js) - la « Colonne à afficher » (visibleCol) d'une Référence ou d'une liste de références
  // et les valeurs qu'elle prend dans la table liée, source de la liste des valeurs possibles d'une règle (Antoine, 2026-09-29 : « quand on indique une colonne à
  // choix ou à référence, mettre de l'autocompletion ou un dropdown des valeurs possibles »). ---
  cases.push({
    id: 'macro_get_reference_values',
    description: 'GristAPI.getReferenceColumn dit la colonne montrée par une Référence (texte ou nombre seulement) et getReferenceValues en lit les valeurs : rognées, sans doublon, triées, une seule lecture pour deux demandes simultanées',
    run: async () => {
      const stub = window.__gristStub;
      stub.setVariables('RefValAnnuaire', { NomPrenom: 'Text', Age: 'Int', Naissance: 'Date', Divers: 'Any' });
      stub.setVariables('RefValDossiers', {
        Titre: 'Text', Responsable: 'Ref:RefValAnnuaire', Equipe: 'RefList:RefValAnnuaire', Age: 'Ref:RefValAnnuaire', SansColonne: 'Ref:RefValAnnuaire',
        DateMontree: 'Ref:RefValAnnuaire', Divers: 'Ref:RefValAnnuaire',
      }, undefined, undefined, { Responsable: 'NomPrenom', Equipe: 'NomPrenom', Age: 'Age', DateMontree: 'Naissance', Divers: 'Divers' });
      stub.setRows('RefValAnnuaire', [
        { id: 1, NomPrenom: 'Martin Paul', Age: 30, Naissance: 631152000, Divers: 'x' },
        { id: 2, NomPrenom: 'Dupont Jean', Age: 4, Naissance: 631152000, Divers: 12 },
        { id: 3, NomPrenom: 'Dupont Jean ', Age: 30, Naissance: 631152000, Divers: true },
        { id: 4, NomPrenom: 'Bernard Léa', Age: 100, Naissance: 631152000, Divers: ['L', 'a'] },
        { id: 5, NomPrenom: '', Age: null, Naissance: null, Divers: null },
        { id: 6, NomPrenom: '   ', Age: null, Naissance: null, Divers: '  ' },
        { id: 7, NomPrenom: 'zola Émile', Age: 4, Naissance: null, Divers: 'x' },
      ]);
      await GristAPI.refreshSchema();
      const column = c => GristAPI.getReferenceColumn('RefValDossiers', c);
      const columns = {
        responsable: column('Responsable'), equipe: column('Equipe'), age: column('Age'), sansColonne: column('SansColonne'),
        date: column('DateMontree'), divers: column('Divers'), titre: column('Titre'), inconnue: column('Inconnue'),
      };
      const shape = (source, table, col) => !!source && source.table === table && source.column === col;
      const columnsOk = shape(columns.responsable, 'RefValAnnuaire', 'NomPrenom') && shape(columns.equipe, 'RefValAnnuaire', 'NomPrenom')
        && shape(columns.age, 'RefValAnnuaire', 'Age') && shape(columns.divers, 'RefValAnnuaire', 'Divers')
        && columns.sansColonne === null && columns.date === null && columns.titre === null && columns.inconnue === null;

      // Lectures de la table liée comptées, et retardées pour que deux demandes se chevauchent.
      const realFetch = grist.docApi.fetchTable;
      let reads = 0;
      grist.docApi.fetchTable = async (tableId) => {
        if (tableId === 'RefValAnnuaire') { reads++; await new Promise(resolve => setTimeout(resolve, 30)); }
        return realFetch(tableId);
      };
      let values = null, both = null, numbers = null, mixed = null, none = null, refreshed = null, failure = null, afterFailure = null;
      try {
        both = await Promise.all([GristAPI.getReferenceValues('RefValDossiers', 'Responsable'), GristAPI.getReferenceValues('RefValDossiers', 'Equipe')]);
        values = both[0];
        const readsForTwo = reads;
        numbers = await GristAPI.getReferenceValues('RefValDossiers', 'Age');
        mixed = await GristAPI.getReferenceValues('RefValDossiers', 'Divers');
        none = [await GristAPI.getReferenceValues('RefValDossiers', 'SansColonne'), await GristAPI.getReferenceValues('RefValDossiers', 'DateMontree'), await GristAPI.getReferenceValues('RefValDossiers', 'Titre')];
        // Sans mémoire : une ligne ajoutée dans Grist entre deux ouvertures apparaît à la suivante.
        stub.setRows('RefValAnnuaire', [{ id: 1, NomPrenom: 'Nouveau Nom', Age: 1, Naissance: null, Divers: null }]);
        refreshed = await GristAPI.getReferenceValues('RefValDossiers', 'Responsable');
        // Table liée illisible : la demande est rejetée, et la suivante repart d'une lecture neuve.
        grist.docApi.fetchTable = async (tableId) => { if (tableId === 'RefValAnnuaire') throw new Error('illisible'); return realFetch(tableId); };
        failure = await GristAPI.getReferenceValues('RefValDossiers', 'Responsable').then(() => 'résolue', e => 'rejetée : ' + e.message);
        grist.docApi.fetchTable = realFetch;
        afterFailure = await GristAPI.getReferenceValues('RefValDossiers', 'Responsable');
        values = { values, readsForTwo, same: JSON.stringify(both[0]) === JSON.stringify(both[1]) };
      } finally { grist.docApi.fetchTable = realFetch; }
      const pass = columnsOk
        && JSON.stringify(values.values) === JSON.stringify(['Bernard Léa', 'Dupont Jean', 'Martin Paul', 'zola Émile']) && values.same && values.readsForTwo === 1
        && JSON.stringify(numbers) === JSON.stringify(['4', '30', '100'])
        && JSON.stringify(mixed) === JSON.stringify(['12', 'x'])
        && JSON.stringify(none) === '[[],[],[]]'
        && JSON.stringify(refreshed) === '["Nouveau Nom"]'
        && failure === 'rejetée : illisible' && JSON.stringify(afterFailure) === '["Nouveau Nom"]';
      return { pass, notes: JSON.stringify({ columns, values, numbers, mixed, none, refreshed, failure, afterFailure }) };
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


  // --- Un macro-modèle ne perd plus sa composition ni ses réglages (01/10, trouvé en préparant la page des macro-modèles) -----------------------------------------------------------
  // Avant : l'enregistrement automatique (js/main.js:autosaveTick) écrivait Editor.getHTML() - toujours vide pour un macro-modèle - à la place de sa composition dès que le nom, le nom du PDF
  // ou une marge changeait : le Contenu devenait « <p></p> » en moins de 3 s. Et « Enregistrer » dans sa fenêtre (js/macro-editor.js) remettait à zéro le nom du PDF, l'en-tête / pied et les
  // marges, comme « Enregistrer sous ». Ces cas passent par les vrais gestes (la vraie fenêtre, le vrai champ de nom, le vrai minuteur d'enregistrement automatique) et lisent la ligne Grist.
  const MACRO_TABLE = 'Publipostage_Modeles';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js), à garder synchronisé
  const waitTicks = (h, n) => h.sleep(TICK_MS * n + 900);
  const macroRow = id => window.__gristStub.getRow(MACRO_TABLE, id);
  const AUTOSAVE_KEY = 'pp_autosave_enabled';
  function setAutosave(enabled) { try { if (enabled) localStorage.removeItem(AUTOSAVE_KEY); else localStorage.setItem(AUTOSAVE_KEY, 'false'); } catch (e) { /* stockage indisponible */ } }

  // Repart d'un document vierge (le vrai bouton « + » ouvre un document ; le harnais répond « Abandonner » à la question d'avant de quitter), crée deux modèles puis un macro-modèle par la
  // VRAIE fenêtre de composition (page de garde = le premier modèle) : il est enregistré, sélectionné et chargé comme par une personne.
  async function loadedMacro(h, nom) {
    setAutosave(true);
    await h.clickButton('btn-new');
    await h.sleep(300);
    const cover = await Templates.save(null, nom + ' - garde', '<p>Page de garde</p>', '', null, null, 'document', null);
    const other = await Templates.save(null, nom + ' - autre', '<p>Autre page</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-name').value = nom;
    const select = document.getElementById('macro-editor-cover');
    select.value = String(cover.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('macro-editor-save').click();
    await h.sleep(700);
    return { id: Templates.getCurrentId(), coverId: cover.id, otherId: other.id };
  }
  async function leaveMacro(h) {
    setAutosave(true);
    await h.clickButton('btn-new');
    await h.sleep(300);
  }
  const composition = row => { try { return JSON.parse(row.Contenu).slots; } catch (e) { return null; } };

  cases.push({
    id: 'macro_autosave_rename_keeps_the_composition',
    description: 'Renommer un macro-modèle chargé (champ de nom) enregistre le nom et laisse sa composition intacte : avant, son Contenu devenait « <p></p> » en moins de 3 s',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro renommée');
        const before = macroRow(id).Contenu;
        const name = document.getElementById('template-name');
        name.value = 'Macro renommée 2';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        await waitTicks(h, 2);
        const row = macroRow(id);
        const slots = composition(row);
        const pass = row.Contenu === before && row.Nom === 'Macro renommée 2' && !!slots && slots.length === 1 && String(slots[0].modeleId) === String(coverId);
        return { pass, notes: JSON.stringify({ before, after: row.Contenu, nom: row.Nom }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_autosave_margin_change_keeps_the_composition_and_saves_the_margins',
    description: 'Changer une marge pendant qu\'un macro-modèle est chargé (Réglages) enregistre la marge et laisse la composition intacte',
    run: async (h) => {
      try {
        const { id } = await loadedMacro(h, 'Macro marges');
        const before = macroRow(id).Contenu;
        PageLayout.setMarginsMm({ top: 31, right: 24, bottom: 26, left: 22 });
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
        await waitTicks(h, 2);
        const row = macroRow(id);
        const margins = JSON.parse(row.Margins || '{}');
        const pass = row.Contenu === before && Math.abs(margins.top - 31) < .001 && Math.abs(margins.left - 22) < .001;
        return { pass, notes: JSON.stringify({ before, after: row.Contenu, margins }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_autosave_pdf_filename_keeps_the_composition_and_saves_the_filename',
    description: 'Saisir un nom de PDF pour un macro-modèle chargé enregistre ce nom et laisse la composition intacte',
    run: async (h) => {
      try {
        const { id } = await loadedMacro(h, 'Macro nom PDF');
        const before = macroRow(id).Contenu;
        const field = document.getElementById('pdf-filename-template');
        field.hidden = false;
        field.value = 'Dossier-{Nom}';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await waitTicks(h, 2);
        const row = macroRow(id);
        return { pass: row.Contenu === before && row.NomFichierPDF === 'Dossier-{Nom}', notes: JSON.stringify({ before, after: row.Contenu, pdf: row.NomFichierPDF }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_autosave_never_writes_an_empty_composition_when_the_macro_vanished',
    description: 'Un macro-modèle supprimé ailleurs pendant qu\'il est chargé : l\'enregistrement automatique n\'écrit rien (ni composition vide, ni ligne recréée)',
    run: async (h) => {
      try {
        const { id } = await loadedMacro(h, 'Macro disparue');
        const rows = window.__gristStub.state.rows[MACRO_TABLE];
        const before = rows.id.length;
        const writes = () => window.__gristStub.countActions('UpdateRecord', MACRO_TABLE) + window.__gristStub.countActions('AddRecord', MACRO_TABLE);
        const writes0 = writes();
        // Suppression « ailleurs » : directement dans l'état du faux Grist, sans passer par le journal d'actions de ce client.
        const at = rows.id.indexOf(id);
        Object.keys(rows).forEach(k => { if (Array.isArray(rows[k]) && at >= 0) rows[k].splice(at, 1); });
        const name = document.getElementById('template-name');
        name.value = 'Macro disparue 2';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        await waitTicks(h, 2);
        const after = rows.id.length;
        const writes1 = writes();
        return { pass: after === before - 1 && writes1 === writes0, notes: JSON.stringify({ before, after, writes0, writes1 }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_modal_save_keeps_pdf_filename_header_footer_and_page_settings',
    description: 'Enregistrer dans la fenêtre d\'un macro-modèle change sa composition et garde son nom de PDF, son en-tête / pied et ses marges (avant : tout remis à zéro)',
    run: async (h) => {
      try {
        const { id, otherId } = await loadedMacro(h, 'Macro fenêtre');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>ENTETE DU MACRO</p>', first: '' }, footer: { default: '<p>PIED DU MACRO</p>', first: '' } };
        window.__gristStub.remoteWrite(MACRO_TABLE, id, {
          NomFichierPDF: 'Macro-{Nom}', HeaderFooter: JSON.stringify(hf),
          Margins: JSON.stringify({ top: 22, right: 21, bottom: 20, left: 19, orientation: 'portrait', format: 'A4' }),
        });
        await Templates.loadAll();
        const select = document.getElementById('template-select');
        select.value = String(id);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(700);
        document.getElementById('btn-edit-macro').click();
        await h.sleep(200);
        const cover = document.getElementById('macro-editor-cover');
        cover.value = String(otherId);
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(700);
        const row = macroRow(id);
        const slots = composition(row);
        const savedHf = JSON.parse(row.HeaderFooter || '{}');
        const margins = JSON.parse(row.Margins || '{}');
        const pass = !!slots && slots.length === 1 && String(slots[0].modeleId) === String(otherId)
          && row.NomFichierPDF === 'Macro-{Nom}' && savedHf.enabled === true && savedHf.header.default.includes('ENTETE DU MACRO') && savedHf.footer.default.includes('PIED DU MACRO')
          && margins.top === 22 && margins.right === 21 && margins.bottom === 20 && margins.left === 19;
        return { pass, notes: JSON.stringify({ slots, pdf: row.NomFichierPDF, hf: savedHf, margins }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_modal_save_writes_the_settings_still_on_screen_when_autosave_is_off',
    description: 'Enregistrement automatique coupé : une marge et un nom de PDF réglés à l\'écran pour un macro-modèle partent avec « Enregistrer » de sa fenêtre, composition comprise',
    run: async (h) => {
      try {
        const { id, otherId } = await loadedMacro(h, 'Macro écran');
        setAutosave(false);
        PageLayout.setMarginsMm({ top: 33, right: 18, bottom: 18, left: 18 });
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
        const field = document.getElementById('pdf-filename-template');
        field.value = 'Ecran-{Nom}';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await waitTicks(h, 2);
        const untouched = macroRow(id);
        document.getElementById('btn-edit-macro').click();
        await h.sleep(200);
        const cover = document.getElementById('macro-editor-cover');
        cover.value = String(otherId);
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(700);
        const row = macroRow(id);
        const margins = JSON.parse(row.Margins || '{}');
        const slots = composition(row);
        const pass = JSON.parse(untouched.Margins || '{}').top !== 33 && untouched.NomFichierPDF === ''
          && Math.abs(margins.top - 33) < .001 && row.NomFichierPDF === 'Ecran-{Nom}' && !!slots && String(slots[0].modeleId) === String(otherId);
        return { pass, notes: JSON.stringify({ untouchedPdf: untouched.NomFichierPDF, margins, pdf: row.NomFichierPDF, slots }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_save_as_copy_keeps_pdf_filename_header_footer_and_page_settings',
    description: '« Enregistrer sous… » sur un macro-modèle en fait une copie qui garde son nom de PDF, son en-tête / pied et ses marges, avec la même composition',
    run: async (h) => {
      const dialogs = h.stubDialogs({ prompt: 'Copie du macro réglé' });
      try {
        const { id } = await loadedMacro(h, 'Macro à copier');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>ENTETE COPIE</p>', first: '' }, footer: { default: '', first: '' } };
        window.__gristStub.remoteWrite(MACRO_TABLE, id, {
          NomFichierPDF: 'Copie-{Nom}', HeaderFooter: JSON.stringify(hf),
          Margins: JSON.stringify({ top: 23, right: 17, bottom: 20, left: 17, orientation: 'portrait', format: 'A4' }),
        });
        await Templates.loadAll();
        const select = document.getElementById('template-select');
        select.value = String(id);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(700);
        const original = macroRow(id);
        const rowsBefore = window.__gristStub.state.rows[MACRO_TABLE].id.slice();
        document.getElementById('v2-btn-save-as').click();
        await h.sleep(900);
        const rowsAfter = window.__gristStub.state.rows[MACRO_TABLE].id;
        const copyId = rowsAfter.find(x => !rowsBefore.includes(x));
        const copy = copyId != null ? macroRow(copyId) : null;
        const copyHf = copy ? JSON.parse(copy.HeaderFooter || '{}') : {};
        const copyMargins = copy ? JSON.parse(copy.Margins || '{}') : {};
        const pass = !!copy && copy.Nom === 'Copie du macro réglé' && copy.Contenu === original.Contenu && copy.NomFichierPDF === 'Copie-{Nom}'
          && copyHf.enabled === true && String(copyHf.header && copyHf.header.default).includes('ENTETE COPIE') && copyMargins.top === 23 && copyMargins.left === 17;
        return { pass, notes: JSON.stringify({ copy: copy && { nom: copy.Nom, pdf: copy.NomFichierPDF, margins: copyMargins, hf: copyHf }, sameContent: copy && copy.Contenu === original.Contenu }) };
      } finally { dialogs.restore(); await leaveMacro(h); }
    },
  });


  // --- Chaque saut de page entre deux slots porte le rang du slot qu'il ouvre (data-macro-slot) : c'est par lui que la Lecture et l'export PDF retrouvent où chaque
  // slot commence pour y rebaser ses images en calque (cas suivants). ---
  cases.push({
    id: 'macro_build_concatenated_html_marks_slot_starts',
    description: 'Le saut de page qui ouvre un slot porte son rang dans data-macro-slot (aucun avant le premier) ; un slot absent ne laisse ni séparateur ni trou dans les rangs',
    run: async () => {
      const templates = [
        { id: 'a', contenu: '<p>A</p>' },
        { id: 'b', contenu: '<p>B</p>' },
        { id: 'c', contenu: '<p>C</p>' },
        { id: 'd', contenu: '<p>D</p>' },
      ];
      const slots = { slots: [
        { type: 'fixed', modeleId: 'a' },
        { type: 'conditional', rules: [{ column: 'TypeDossier', operator: '=', value: 'Jamais', modeleId: 'b' }], defaultModeleId: null },
        { type: 'fixed', modeleId: 'c' },
        { type: 'fixed', modeleId: 'd' },
      ] };
      const html = await MacroTemplates.buildConcatenatedHtml(slots, 'Dossiers', { id: 1, TypeDossier: 'Autre' }, templates);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const markers = Array.from(doc.body.querySelectorAll(':scope > .page-break-marker'));
      const ranks = markers.map(m => m.getAttribute('data-macro-slot'));
      const order = Array.from(doc.body.children).map(el => el.matches('.page-break-marker') ? '|' + el.getAttribute('data-macro-slot') : el.textContent).join(' ');
      const pass = ranks.join(',') === '1,2' && order === 'A |1 C |2 D' && markers.every(m => m.textContent === 'Saut de page')
        && (await MacroTemplates.buildConcatenatedHtml({ slots: [{ type: 'fixed', modeleId: 'a' }] }, 'Dossiers', { id: 1 }, templates)) === '<p>A</p>';
      return { pass, notes: JSON.stringify({ ranks, order }) };
    },
  });

  // --- Images en calque (flottantes) : chaque slot garde les siennes (Antoine, 01/10 : « les images flottantes se stackent tout en haut du document plutôt que de rester à
  // leur place dans leur document respectif »). Le `top` et la page d'une image se comptent depuis le haut de la première page de SON modèle ; mis bout à bout, les slots
  // suivants commencent plus bas et sur d'autres pages. Trois courriers, le premier sur deux pages : ALPHA (image derrière), BRAVO (devant), CHARLIE (derrière). ---
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const layerImage = (layer, topPx, pageTopPt) => '<img class="editor-image" src="' + PIXEL + '" alt="" style="width: 71px; position: absolute; left: 674px; top: ' + topPx + 'px;" data-layer="' + layer + '" data-wrap="inline"'
    + (pageTopPt == null ? '' : ' data-page-index="0" data-page-left-pt="477.5" data-page-top-pt="' + pageTopPt + '"') + '>';
  const letter = (word, image) => '<p>' + word + image + '</p>' + [0, 1, 2, 3, 4].map(i => '<p>Ligne ' + i + ' du courrier</p>').join('');
  const fillerLines = n => Array.from({ length: n }, (_, i) => '<p>Remplissage ' + i + '</p>').join('');
  // Avec `grid`, chaque image a sa position de page (pageTopPt 20, 90, 160 : de quoi les reconnaître dans le PDF) ; sans, c'est un ancien modèle (left/top seulement).
  const threeLetters = grid => [
    { id: 'a', contenu: letter('ALPHA', layerImage('behind', 34, grid ? 20 : null)) + fillerLines(60) },
    { id: 'b', contenu: letter('BRAVO', layerImage('front', 34, grid ? 90 : null)) },
    { id: 'c', contenu: letter('CHARLIE', layerImage('behind', 120, grid ? 160 : null)) },
  ];
  const threeSlots = { slots: [{ type: 'fixed', modeleId: 'a' }, { type: 'fixed', modeleId: 'b' }, { type: 'fixed', modeleId: 'c' }] };
  const WORDS = ['ALPHA', 'BRAVO', 'CHARLIE'];
  const PDF_MARGIN_PT = 28.35;

  cases.push({
    id: 'macro_layer_images_keep_their_place_in_their_own_slot_in_reader_mode',
    description: 'Macro-modèle en Lecture : l\'image en calque de chaque modèle reste à la même distance du début de SON modèle que dans ce modèle seul, au lieu de s\'empiler en haut du document',
    run: async (h) => {
      for (const grid of [true, false]) {
        h.setA4Preview(true);
        const html = await MacroTemplates.buildConcatenatedHtml(threeSlots, 'Dossiers', { id: 1 }, threeLetters(grid));
        const content = await h.renderReaderMode(html);
        await h.sleep(250);
        const zoom = content.getBoundingClientRect().width / content.offsetWidth || 1;
        const padTop = parseFloat(getComputedStyle(content).paddingTop) || 0;
        const imgs = Array.from(content.querySelectorAll('img.editor-image'));
        const titles = WORDS.map(w => Array.from(content.querySelectorAll('p')).find(p => p.firstChild && p.firstChild.nodeType === 3 && p.firstChild.nodeValue === w));
        if (imgs.length !== 3 || titles.some(t => !t)) return { pass: false, notes: JSON.stringify({ grid, images: imgs.length, titles: titles.map(t => !!t) }) };
        // Seul, chaque modèle met son image à (top CSS - padding de la feuille) sous son premier bloc.
        const cssTops = [34, 34, 120];
        const distances = imgs.map((img, i) => (img.getBoundingClientRect().top - titles[i].getBoundingClientRect().top) / zoom);
        const tops = imgs.map(img => img.getBoundingClientRect().top);
        const close = distances.every((d, i) => Math.abs(d - (cssTops[i] - padTop)) < 2);
        if (!close || !(tops[0] < tops[1] && tops[1] < tops[2])) return { pass: false, notes: JSON.stringify({ grid, distances, expected: cssTops.map(t => t - padTop), tops }) };
      }
      return { pass: true, notes: '' };
    },
  });

  // La page de chaque courrier se lit dans le texte du PDF ; l'image d'un courrier doit être sur cette page et sur aucune autre (grille : à l'ordonnée de sa position de page).
  const pdfPagesOf = async (h, html) => {
    const pdf = await h.exportPdfContent(html, null);
    const truth = await h.extractPdfGroundTruth(pdf.base64);
    const pageOf = word => truth.pages.findIndex(p => p.textItems.some(t => t.str.includes(word))) + 1;
    return { truth, pages: WORDS.map(pageOf) };
  };
  cases.push({
    id: 'macro_layer_images_land_on_their_own_slot_page_in_pdf',
    description: 'Macro-modèle en PDF : chaque image en calque à position de page sort sur la page où son courrier commence, à sa position (derrière ou devant, courrier précédent sur deux pages)',
    run: async (h) => {
      const html = await MacroTemplates.buildConcatenatedHtml(threeSlots, 'Dossiers', { id: 1 }, threeLetters(true));
      const { truth, pages } = await pdfPagesOf(h, html);
      const expectedY = [20, 90, 160].map(pt => PDF_MARGIN_PT + pt);
      const near = (im, y) => Math.abs(im.y - y) < 1.5;
      const checks = expectedY.map((y, i) => ({
        word: WORDS[i], page: pages[i],
        onOwnPage: pages[i] > 0 && truth.pages[pages[i] - 1].images.some(im => near(im, y)),
        elsewhere: truth.pages.some((p, j) => j + 1 !== pages[i] && p.images.some(im => near(im, y))),
      }));
      const pass = pages[0] === 1 && pages[1] > 2 && pages[2] > pages[1] && checks.every(c => c.onOwnPage && !c.elsewhere);
      return { pass, notes: JSON.stringify({ pages, checks, imagesPerPage: truth.pages.map(p => p.images.length) }) };
    },
  });

  cases.push({
    id: 'macro_legacy_layer_images_land_on_their_own_slot_page_in_pdf',
    description: 'Macro-modèle en PDF, anciens modèles (images sans position de page) : chaque image en calque sort sur la page de son courrier, une seule par courrier, à la distance de son titre qu\'elle a quand le courrier est exporté seul',
    run: async (h) => {
      const letters = threeLetters(false);
      const html = await MacroTemplates.buildConcatenatedHtml(threeSlots, 'Dossiers', { id: 1 }, letters);
      const { truth, pages } = await pdfPagesOf(h, html);
      const perPage = truth.pages.map(p => p.images.length);
      // Un ancien modèle n'a pas de position de page : son image est ancrée au texte voisin. Sa distance au titre de son courrier est celle qu'elle a quand ce courrier
      // est exporté seul (même mise en page, premier courrier de l'export).
      const gapOf = (t, word) => {
        const pageNo = t.pages.findIndex(p => p.textItems.some(it => it.str.includes(word))) + 1;
        if (!pageNo || !t.pages[pageNo - 1].images.length) return null;
        return t.pages[pageNo - 1].images[0].y - t.pages[pageNo - 1].textItems.find(it => it.str.includes(word)).y;
      };
      const gapsInMacro = WORDS.map(w => gapOf(truth, w));
      const gapsAlone = [];
      for (let i = 0; i < letters.length; i++) gapsAlone.push(gapOf((await pdfPagesOf(h, letters[i].contenu)).truth, WORDS[i]));
      const sameGaps = gapsInMacro.every((g, i) => g != null && gapsAlone[i] != null && Math.abs(g - gapsAlone[i]) < 3);
      const pass = pages[0] === 1 && pages[1] > 2 && pages[2] > pages[1]
        && perPage[pages[0] - 1] === 1 && perPage[pages[1] - 1] === 1 && perPage[pages[2] - 1] === 1 && perPage.reduce((a, b) => a + b, 0) === 3 && sameGaps;
      return { pass, notes: JSON.stringify({ pages, perPage, gapsInMacro, gapsAlone }) };
    },
  });

  cases.push({
    id: 'macro_layer_images_stay_with_their_slot_in_docx',
    description: 'Macro-modèle en DOCX : chaque image flottante reste ancrée dans le paragraphe de SON courrier, après le saut de page qui ouvre ce courrier',
    run: async (h) => {
      const html = await MacroTemplates.buildConcatenatedHtml(threeSlots, 'Dossiers', { id: 1 }, threeLetters(true));
      const parts = await h.exportDocxParts(html, null);
      // L'ordre des événements de word/document.xml : titre d'un courrier, image (w:drawing), saut de page avant un paragraphe.
      const events = [];
      const walk = node => {
        if (node.nodeType !== 1) return;
        if (node.nodeName === 'w:drawing') events.push('image');
        else if (node.nodeName === 'w:pageBreakBefore' || (node.nodeName === 'w:br' && node.getAttribute('w:type') === 'page')) events.push('saut');
        else if (node.nodeName === 'w:t' && WORDS.includes(node.textContent.trim())) events.push(node.textContent.trim());
        Array.from(node.childNodes).forEach(walk);
      };
      walk(parts.doc.documentElement);
      const sequence = events.join(' ');
      const pass = /^ALPHA image (?:saut )?BRAVO image (?:saut )?CHARLIE image$/.test(sequence) && (sequence.match(/saut/g) || []).length >= 2;
      return { pass, notes: sequence };
    },
  });

  // --- La page d'un macro-modèle : sens et format (01/10, carte « Autoriser le paysage pour les macro-modèles ? » d'Antoine : Oui) ---------------------------------------------------
  // Le bouton Page de la barre (js/orientation-toggle.js) est actif pour un macro-modèle : son menu pose le sens et le format dans PageLayout, l'enregistrement automatique les écrit dans la colonne
  // Margins de SA ligne (comme ses marges), et la Lecture, le PDF et le Word du macro-modèle suivent cette page. Il l'impose aux modèles qu'il assemble : l'assemblage ne reprend que leur contenu,
  // jamais leur page. Les gestes sont ceux de la personne (les vraies lignes du menu, les vrais boutons d'export), la ligne Grist est relue après le vrai minuteur d'enregistrement automatique.
  const PAGE_DATA = 'MacroPageClients';
  const pageButton = () => document.getElementById('btn-page-orientation');
  const pageRow = key => document.querySelector('#v2-page-flyout [data-page-orientation="' + key + '"], #v2-page-flyout [data-page-format="' + key + '"]');
  const pageChecked = () => Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).filter(r => r.getAttribute('aria-checked') === 'true')
    .map(r => r.getAttribute('data-page-orientation') || r.getAttribute('data-page-format')).join();
  const pageState = () => ({
    disabled: pageButton().disabled, pressed: pageButton().getAttribute('aria-pressed'), label: pageButton().getAttribute('aria-label'),
    title: document.getElementById('v2-page-flyout-label').textContent, checked: pageChecked(),
    grey: document.querySelectorAll('#v2-page-flyout .v2-hover-row-disabled').length, css: document.documentElement.style.getPropertyValue('--pp-page-width'),
  });
  async function pickPage(h, ...keys) { for (const key of keys) { pageRow(key).click(); await h.sleep(250); } }
  const storedMargins = (page) => JSON.stringify(Object.assign({ top: 20, right: 20, bottom: 20, left: 20 }, page));
  // Recharge la ligne d'un modèle (macro-modèle ou classique) par la liste, comme une personne qui y revient.
  async function reopen(h, id) {
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }
  async function feedRecord(h) {
    const stub = window.__gristStub;
    stub.setVariables(PAGE_DATA, { Nom: 'Text' });
    stub.setRows(PAGE_DATA, [{ id: 1, Nom: 'Alpha Durand' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Alpha Durand' }, PAGE_DATA);
    await h.sleep(100);
  }
  // Le blob PDF que pdfmake fait télécharger pendant `action` (repéré à sa création, comme dev-tests/scenarios-pdf-batch.js).
  async function pdfDownloaded(h, action) {
    const blobs = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = obj => { blobs.push(obj); return origCreate.call(URL, obj); };
    try {
      await action();
      const startedAt = Date.now();
      while (!blobs.some(b => b && b.size > 0 && /pdf/i.test(b.type || '')) && Date.now() - startedAt < 30000) await h.sleep(100);
    } finally { URL.createObjectURL = origCreate; }
    return blobs.find(b => b && b.size > 0 && /pdf/i.test(b.type || '')) || null;
  }
  // Le fichier que la ligne d'export fait télécharger (le clic du <a download> est intercepté) ; `confirmAnswer` répond à la confirmation d'un export en lot.
  async function fileDownloaded(h, rowId) {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: () => true });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < 60000) await h.sleep(100);
      await h.sleep(50);
    } finally {
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return downloads[0] || null;
  }
  // Pages d'un PDF lues dans ses octets (pdf.js) : taille en points et texte.
  async function pdfPages(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      pages.push({ width: +view.width.toFixed(2), height: +view.height.toFixed(2), text: (await page.getTextContent()).items.map(it => it.str).join(' ') });
    }
    return pages;
  }
  // Page déclarée par un .docx (w:pgSz de word/document.xml) : ce que Word applique.
  async function docxPage(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml').async('string');
    const tag = (xml.match(/<w:pgSz[^>]*>/) || [''])[0];
    const attr = name => { const m = tag.match(new RegExp('w:' + name + '="([^"]*)"')); return m ? m[1] : null; };
    return { width: Number(attr('w')), height: Number(attr('h')), orient: attr('orient') };
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const sheetLayoutWidth = () => {
    const el = document.querySelector('#reader-container .reader-content');
    if (!el) return null;
    const zoom = parseFloat(getComputedStyle(el).zoom);
    return el.getBoundingClientRect().width / (isFinite(zoom) && zoom > 0 ? zoom : 1);
  };

  cases.push({
    id: 'macro_page_menu_is_active_and_shows_the_page_of_the_macro',
    description: 'Le bouton Page est actif pour un macro-modèle et son menu coche sa page (colonne Margins de sa ligne) : A4 portrait par défaut, A5 paysage une fois écrit ; revenir d\'un modèle classique la retrouve',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro page menu');
        const problems = [];
        const first = pageState();
        if (first.disabled || first.pressed !== 'false' || first.checked !== 'portrait,A4' || first.title !== 'Page' || first.grey !== 0 || first.label !== 'Page A4 en portrait (passer en paysage)') problems.push('macro sans réglage : ' + JSON.stringify(first));
        window.__gristStub.remoteWrite(MACRO_TABLE, id, { Margins: storedMargins({ orientation: 'landscape', format: 'A5' }) });
        await reopen(h, id);
        const stored = pageState();
        if (stored.disabled || stored.pressed !== 'true' || stored.checked !== 'landscape,A5' || stored.label !== 'Page A5 en paysage (passer en portrait)' || stored.css !== '793.7px') problems.push('macro A5 paysage : ' + JSON.stringify(stored));
        await reopen(h, coverId);
        const classic = pageState();
        if (classic.pressed !== 'false' || classic.checked !== 'portrait,A4' || classic.disabled) problems.push('modèle classique après le macro-modèle : ' + JSON.stringify(classic));
        await reopen(h, id);
        const again = pageState();
        if (again.checked !== 'landscape,A5' || again.pressed !== 'true') problems.push('macro-modèle retrouvé : ' + JSON.stringify(again));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, first, stored }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_page_chosen_in_the_menu_is_saved_in_its_row_with_the_composition_untouched',
    description: 'Choisir Paysage puis A3 dans le menu Page d\'un macro-modèle chargé écrit cette page dans sa ligne (colonne Margins, quatre marges gardées) par l\'enregistrement automatique, composition et nom de PDF intacts',
    run: async (h) => {
      const events = [];
      const onEvent = event => events.push(event.type);
      try {
        const { id } = await loadedMacro(h, 'Macro page enregistrée');
        const before = macroRow(id);
        const marginsBefore = Object.assign({}, PageLayout.getMarginsMm());
        document.addEventListener('pp:marginsChanged', onEvent);
        document.addEventListener('pp:pageLayoutChanged', onEvent);
        await pickPage(h, 'landscape', 'A3');
        document.removeEventListener('pp:marginsChanged', onEvent);
        document.removeEventListener('pp:pageLayoutChanged', onEvent);
        const onScreen = pageState();
        await waitTicks(h, 2);
        const row = macroRow(id);
        const saved = JSON.parse(row.Margins || '{}');
        const problems = [];
        if (onScreen.checked !== 'landscape,A3' || onScreen.pressed !== 'true' || onScreen.css !== '1587.4px') problems.push('écran : ' + JSON.stringify(onScreen));
        if (events.filter(e => e === 'pp:marginsChanged').length !== 2 || events.filter(e => e === 'pp:pageLayoutChanged').length !== 2) problems.push('évènements : ' + events.join());
        if (saved.orientation !== 'landscape' || saved.format !== 'A3') problems.push('page écrite : ' + row.Margins);
        if (!['top', 'right', 'bottom', 'left'].every(k => near(saved[k], marginsBefore[k], .001))) problems.push('marges changées : ' + row.Margins + ' pour ' + JSON.stringify(marginsBefore));
        if (row.Contenu !== before.Contenu || composition(row).length !== 1) problems.push('composition changée : ' + row.Contenu);
        if (row.NomFichierPDF !== before.NomFichierPDF) problems.push('nom du PDF changé : ' + row.NomFichierPDF);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, margins: row.Margins }) };
      } finally {
        document.removeEventListener('pp:marginsChanged', onEvent);
        document.removeEventListener('pp:pageLayoutChanged', onEvent);
        await leaveMacro(h);
      }
    },
  });

  cases.push({
    id: 'macro_page_reaches_reading_pdf_merged_pdf_and_word_and_replaces_the_page_of_its_cover',
    description: 'Un macro-modèle en A3 paysage donne une Lecture, un PDF, un PDF unique et un Word en A3 paysage, alors que sa page de garde est en A5 portrait : il impose sa page aux modèles qu\'il assemble, qui gardent la leur',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro page rendus');
        await feedRecord(h);
        h.setA4Preview(true); // sans l'Aperçu A4, la Lecture n'a pas de feuille : le contenu prend la largeur du panneau
        await h.sleep(300);
        // La page de garde a SA page, très différente de celle du macro-modèle.
        window.__gristStub.remoteWrite(MACRO_TABLE, coverId, { Margins: storedMargins({ orientation: 'portrait', format: 'A5' }) });
        await reopen(h, id);
        await pickPage(h, 'landscape', 'A3');
        const problems = [];
        document.getElementById('btn-mode-read').click();
        await h.sleep(900);
        const sheet = sheetLayoutWidth();
        if (sheet === null || !near(sheet, 1587.4, 2)) problems.push('feuille de la Lecture : ' + sheet + ' (1587.4 attendu)');
        const pdf = await pdfDownloaded(h, async () => { document.getElementById('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
        const pages = pdf ? await pdfPages(h, pdf) : [];
        if (pages.length !== 1 || !near(pages[0].width, 1190.55, .5) || !near(pages[0].height, 841.89, .5) || !/Page\s*de\s*garde/.test(pages[0].text)) problems.push('PDF : ' + JSON.stringify(pages));
        const merged = await fileDownloaded(h, 'v2-btn-export-pdf-merged');
        const mergedPages = merged && merged.blob ? await pdfPages(h, merged.blob) : [];
        if (mergedPages.length !== 1 || !near(mergedPages[0].width, 1190.55, .5) || !near(mergedPages[0].height, 841.89, .5)) problems.push('PDF unique : ' + JSON.stringify(mergedPages));
        const word = await fileDownloaded(h, 'v2-btn-export-docx');
        const wordPage = word && word.blob ? await docxPage(word.blob) : null;
        if (!wordPage || wordPage.width !== 23811 || wordPage.height !== 16838 || wordPage.orient !== 'landscape') problems.push('Word : ' + JSON.stringify(wordPage));
        document.getElementById('btn-mode-edit').click();
        await h.sleep(500);
        // La page de garde, ouverte seule, a gardé sa page.
        await reopen(h, coverId);
        const cover = pageState();
        if (cover.checked !== 'portrait,A5' || cover.pressed !== 'false') problems.push('page de garde ouverte seule : ' + JSON.stringify(cover));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, sheet, pages, mergedPages, wordPage }) };
      } finally {
        const edit = document.getElementById('btn-mode-edit'); if (edit) edit.click();
        await leaveMacro(h);
      }
    },
  });

  cases.push({
    id: 'macro_without_page_settings_keeps_a4_portrait_whatever_the_page_of_its_cover',
    description: 'Un macro-modèle sans réglage de page reste en A4 portrait (Lecture, PDF, Word) même si sa page de garde est en A3 paysage : la page de garde n\'a aucune prise sur lui',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro page défaut');
        await feedRecord(h);
        window.__gristStub.remoteWrite(MACRO_TABLE, coverId, { Margins: storedMargins({ orientation: 'landscape', format: 'A3' }) });
        await reopen(h, id);
        const problems = [];
        const state = pageState();
        if (state.checked !== 'portrait,A4' || state.css !== '793.71px') problems.push('écran : ' + JSON.stringify(state));
        const pdf = await pdfDownloaded(h, async () => { document.getElementById('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
        const pages = pdf ? await pdfPages(h, pdf) : [];
        if (pages.length !== 1 || !near(pages[0].width, 595.28, .5) || !near(pages[0].height, 841.89, .5)) problems.push('PDF : ' + JSON.stringify(pages));
        const word = await fileDownloaded(h, 'v2-btn-export-docx');
        const wordPage = word && word.blob ? await docxPage(word.blob) : null;
        if (!wordPage || wordPage.width !== 11906 || wordPage.height !== 16838 || wordPage.orient === 'landscape') problems.push('Word : ' + JSON.stringify(wordPage));
        const row = macroRow(id);
        if (JSON.parse(row.Margins || '{}').orientation === 'landscape') problems.push('la ligne du macro-modèle a pris la page de sa page de garde : ' + row.Margins);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages, wordPage }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_page_is_kept_by_the_window_save_and_by_save_as',
    description: 'Enregistrement automatique coupé : la page réglée à l\'écran pour un macro-modèle (A6 paysage) part avec « Enregistrer » de sa fenêtre, composition comprise, et « Enregistrer sous… » en fait une copie qui la garde',
    run: async (h) => {
      const dialogs = h.stubDialogs({ prompt: 'Copie A6 paysage' });
      try {
        const { id, otherId } = await loadedMacro(h, 'Macro page fenêtre');
        setAutosave(false);
        await pickPage(h, 'landscape', 'A6');
        await waitTicks(h, 2);
        const untouched = JSON.parse(macroRow(id).Margins || '{}');
        document.getElementById('btn-edit-macro').click();
        await h.sleep(200);
        const cover = document.getElementById('macro-editor-cover');
        cover.value = String(otherId);
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(700);
        const row = macroRow(id);
        const saved = JSON.parse(row.Margins || '{}');
        const slots = composition(row);
        const problems = [];
        if (untouched.orientation === 'landscape' || untouched.format === 'A6') problems.push('écrit sans enregistrement automatique : ' + JSON.stringify(untouched));
        if (saved.orientation !== 'landscape' || saved.format !== 'A6') problems.push('fenêtre : ' + row.Margins);
        if (!slots || slots.length !== 1 || String(slots[0].modeleId) !== String(otherId)) problems.push('composition : ' + row.Contenu);
        const rowsBefore = window.__gristStub.state.rows[MACRO_TABLE].id.slice();
        document.getElementById('v2-btn-save-as').click();
        await h.sleep(900);
        const copyId = window.__gristStub.state.rows[MACRO_TABLE].id.find(x => !rowsBefore.includes(x));
        const copy = copyId != null ? macroRow(copyId) : null;
        const copyMargins = copy ? JSON.parse(copy.Margins || '{}') : {};
        if (!copy || copy.Nom !== 'Copie A6 paysage' || copy.Contenu !== row.Contenu || copyMargins.orientation !== 'landscape' || copyMargins.format !== 'A6') problems.push('copie : ' + JSON.stringify(copy && { nom: copy.Nom, margins: copy.Margins }));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, margins: row.Margins }) };
      } finally { dialogs.restore(); await leaveMacro(h); }
    },
  });

  // --- Ouvrir un modèle d'un macro-modèle par son stylo, et y revenir (02/10, retour d'Antoine : « modifier un sous-modèle en cliquant sur un stylo […] et, si possible, un bouton pour revenir au macro-modèle ») ---
  // Le résumé du macro-modèle (js/macro-editor.js:renderParts) liste ses modèles, un stylo chacun ; le stylo ouvre le modèle dans l'éditeur (js/main.js:openTemplateFromMacro) et le bandeau « Revenir au
  // macro-modèle » (#macro-return-bar) ramène au macro-modèle d'où l'on vient. Les gestes sont ceux de la personne (le vrai stylo, le vrai bouton, la vraie fenêtre « Modifications non enregistrées ») ; ce
  // que la souris mesure à 700×400 est dans le script Node macroSubmodelMouse.
  const summaryRows = () => Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part')).map(row => ({
    label: row.querySelector('.macro-summary-part-label').textContent,
    models: Array.from(row.querySelectorAll('.macro-summary-model-name')).map(n => n.textContent),
    pencils: Array.from(row.querySelectorAll('.macro-summary-edit')).map(b => {
      const r = b.getBoundingClientRect();
      return { id: String(b.dataset.templateId), disabled: b.disabled, label: b.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  }));
  const pencilOf = id => Array.from(document.querySelectorAll('.macro-summary-edit')).find(b => String(b.dataset.templateId) === String(id) && !b.disabled);
  const isShown = id => getComputedStyle(document.getElementById(id)).display !== 'none';
  const returnBarShown = () => { const bar = document.getElementById('macro-return-bar'); return !bar.hidden && getComputedStyle(bar).display !== 'none'; };
  const triggerLabel = () => document.querySelector('.tts-trigger').textContent.trim();
  const screenState = () => ({
    current: String(Templates.getCurrentId()), list: String(document.getElementById('template-select').value), trigger: triggerLabel(), name: document.getElementById('template-name').value,
    text: document.querySelector('.ProseMirror').textContent, editor: isShown('editor-container'), summary: isShown('macro-summary-container'), bar: returnBarShown(),
    barText: document.getElementById('macro-return-text').textContent, barButton: document.getElementById('btn-macro-return').textContent,
  });
  const writesNow = () => window.__gristStub.countActions('UpdateRecord', MACRO_TABLE) + window.__gristStub.countActions('AddRecord', MACRO_TABLE);
  const dialogButtons = () => Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(b => !b.hidden);
  const dialogOpen = () => !!document.getElementById('pp-dialog-modal') && getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none';
  async function answerDialog(h, label) {
    const button = dialogButtons().find(b => b.textContent === label);
    if (!button) throw new Error('bouton « ' + label + ' » absent de la fenêtre : ' + JSON.stringify(dialogButtons().map(b => b.textContent)));
    button.click();
    await h.sleep(600);
  }
  // Un macro-modèle à plusieurs modèles : sa page de garde, une annexe à deux règles et un modèle par défaut (le troisième, créé APRÈS la dernière relecture de la liste : il n'a pas encore sa ligne dans le
  // <select>), puis les annexes que `moreSlots` ajoute. La composition est écrite dans sa ligne Grist et rechargée par la liste, comme une personne qui y revient.
  async function composedMacro(h, nom, moreSlots) {
    const loaded = await loadedMacro(h, nom);
    const third = await Templates.save(null, nom + ' - défaut', '<p>Page par défaut</p>', '', null, null, 'document', null);
    const rule = (modeleId, value) => ({ column: 'Nom', operator: '=', value, modeleId });
    const slots = [{ type: 'fixed', modeleId: loaded.coverId }, { type: 'conditional', rules: [rule(loaded.otherId, 'a'), rule(loaded.coverId, 'b')], defaultModeleId: third.id }]
      .concat(moreSlots ? moreSlots(loaded, rule) : []);
    window.__gristStub.remoteWrite(MACRO_TABLE, loaded.id, { Contenu: JSON.stringify({ slots }) });
    await reopen(h, loaded.id);
    return Object.assign({ thirdId: third.id }, loaded);
  }

  cases.push({
    id: 'macro_summary_lists_every_model_of_the_composition_with_a_pencil',
    description: 'Le résumé d\'un macro-modèle liste ses modèles (page de garde, puis chaque annexe : modèle de chaque règle et modèle par défaut, sans doublon dans une annexe), un stylo chacun ; une annexe sans modèle garde sa ligne, un modèle supprimé reste dit avec son stylo grisé',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro stylos', (m, rule) => [
          { type: 'conditional', rules: [rule(m.otherId, 'c'), rule(m.otherId, 'd')], defaultModeleId: m.otherId },
          { type: 'conditional', rules: [], defaultModeleId: null },
          { type: 'conditional', rules: [rule(987654, 'e')], defaultModeleId: null },
        ]);
        const cover = 'Macro stylos - garde', other = 'Macro stylos - autre', third = 'Macro stylos - défaut';
        const rows = summaryRows();
        const problems = [];
        const wanted = [['Page de garde', [cover]], ['Annexe 1', [other, cover, third]], ['Annexe 2', [other]], ['Annexe 3', ['aucun modèle choisi']], ['Annexe 4', ['modèle introuvable']]];
        if (JSON.stringify(rows.map(r => [r.label, r.models])) !== JSON.stringify(wanted)) problems.push('lignes : ' + JSON.stringify(rows.map(r => [r.label, r.models])));
        const ids = rows.map(r => r.pencils.map(p => p.id + (p.disabled ? '(grisé)' : '')));
        const wantedIds = [[macro.coverId], [macro.otherId, macro.coverId, macro.thirdId], [macro.otherId], [], ['987654(grisé)']].map(list => list.map(String));
        if (JSON.stringify(ids) !== JSON.stringify(wantedIds)) problems.push('stylos : ' + JSON.stringify(ids));
        const enabled = rows.flatMap(r => r.pencils).filter(p => !p.disabled);
        if (enabled.some(p => p.w < 24 || p.h < 24)) problems.push('stylo plus petit que 24 px : ' + JSON.stringify(enabled));
        const labels = rows.flatMap(r => r.pencils).map(p => p.label);
        const wantedLabels = ['Modifier le modèle « ' + cover + ' »', 'Modifier le modèle « ' + other + ' »', 'Modifier le modèle « ' + cover + ' »', 'Modifier le modèle « ' + third + ' »', 'Modifier le modèle « ' + other + ' »', 'modèle introuvable'];
        if (JSON.stringify(labels) !== JSON.stringify(wantedLabels)) problems.push('noms accessibles : ' + JSON.stringify(labels));
        const sentence = document.getElementById('macro-summary-text').textContent;
        if (sentence !== 'Page de garde : ' + cover + ' — 4 annexes conditionnelles.') problems.push('phrase : ' + sentence);
        if (!isShown('macro-summary-container') || returnBarShown()) problems.push('le résumé doit être à l\'écran, sans bandeau de retour');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_pencil_opens_the_model_in_the_editor_and_the_return_bar_brings_back_to_the_macro',
    description: 'Le stylo d\'une ligne du résumé ouvre ce modèle dans l\'éditeur (liste, nom, texte, pas de résumé) avec le bandeau « Revenir au macro-modèle » ; le bouton ramène au macro-modèle (résumé, plus de bandeau, focus rendu au stylo) ; rien n\'est écrit dans Grist ; un modèle créé ailleurs (sans ligne dans la liste) s\'ouvre aussi, la liste le montre',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro stylo ouvre');
        setAutosave(false); // aucun passage du minuteur : seul un enregistrement de ce geste pourrait écrire
        const problems = [];
        const writes0 = writesNow();
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        const opened = screenState();
        if (opened.current !== String(macro.otherId) || opened.list !== String(macro.otherId) || opened.trigger !== 'Macro stylo ouvre - autre' || opened.name !== 'Macro stylo ouvre - autre' || opened.text !== 'Autre page') problems.push('modèle ouvert : ' + JSON.stringify(opened));
        if (!opened.editor || opened.summary) problems.push('l\'éditeur doit remplacer le résumé : ' + JSON.stringify(opened));
        if (!opened.bar || opened.barText !== 'Modèle ouvert depuis le macro-modèle « Macro stylo ouvre ».' || opened.barButton !== 'Revenir au macro-modèle') problems.push('bandeau : ' + JSON.stringify(opened));
        document.getElementById('btn-macro-return').click();
        await h.sleep(800);
        const back = screenState();
        if (back.current !== String(macro.id) || back.list !== String(macro.id) || back.trigger !== 'Macro stylo ouvre' || !back.summary || back.editor || back.bar) problems.push('retour : ' + JSON.stringify(back));
        const focused = document.activeElement;
        if (!focused || !focused.classList.contains('macro-summary-edit') || String(focused.dataset.templateId) !== String(macro.otherId)) problems.push('focus après le retour : ' + (focused && (focused.className + ' ' + focused.dataset.templateId)));
        // Un modèle créé après la dernière relecture de la liste : pas de ligne dans le <select>, que le stylo relit avant d'ouvrir.
        pencilOf(macro.thirdId).click();
        await h.sleep(800);
        const third = screenState();
        if (third.current !== String(macro.thirdId) || third.list !== String(macro.thirdId) || third.trigger !== 'Macro stylo ouvre - défaut' || third.text !== 'Page par défaut' || !third.bar) problems.push('modèle absent de la liste : ' + JSON.stringify(third));
        document.getElementById('btn-macro-return').click();
        await h.sleep(800);
        if (screenState().current !== String(macro.id) || screenState().bar) problems.push('second retour : ' + JSON.stringify(screenState()));
        const writes1 = writesNow();
        if (writes1 !== writes0) problems.push('ouvrir et revenir ont écrit dans Grist : ' + writes0 + ' -> ' + writes1);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_return_bar_goes_away_with_any_other_model_but_stays_when_the_same_one_is_reloaded',
    description: 'Le bandeau « Revenir au macro-modèle » disparaît dès qu\'un autre modèle se charge (la liste, « + ») et reste quand le même est rechargé (« Recharger la dernière version » après un conflit d\'enregistrement)',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro bandeau');
        const problems = [];
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        if (!returnBarShown()) problems.push('bandeau absent après le stylo');
        // Quelqu'un d'autre enregistre ce modèle : le conflit de l'enregistrement automatique fait proposer « Recharger la dernière version », qui recharge LE MÊME modèle.
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.otherId, { Contenu: '<p>Version de quelqu\'un d\'autre</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
        await h.focusAtEnd();
        await h.typeText(' frappe locale');
        await waitTicks(h, 1);
        const banner = document.getElementById('autosave-conflict-banner');
        if (getComputedStyle(banner).display === 'none') problems.push('le conflit n\'a pas affiché son bandeau');
        document.getElementById('autosave-conflict-reload').click();
        await h.sleep(800);
        const reloaded = screenState();
        if (reloaded.current !== String(macro.otherId) || !reloaded.text.includes('quelqu\'un d\'autre') || !reloaded.bar) problems.push('même modèle rechargé, le bandeau doit rester : ' + JSON.stringify(reloaded));
        await reopen(h, macro.coverId);
        if (returnBarShown()) problems.push('bandeau resté après un choix dans la liste');
        await reopen(h, macro.id);
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        if (!returnBarShown()) problems.push('bandeau absent après le second stylo');
        await h.clickButton('btn-new');
        await h.sleep(500);
        if (returnBarShown()) problems.push('bandeau resté après « + »');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_return_bar_goes_away_when_save_as_puts_a_copy_on_screen',
    description: '« Enregistrer sous… » depuis un modèle ouvert par le stylo met une copie à l\'écran : ce n\'est pas un modèle du macro-modèle, le bandeau « Revenir au macro-modèle » s\'efface',
    run: async (h) => {
      const dialogs = h.stubDialogs({ prompt: 'Copie du modèle ouvert' });
      try {
        const macro = await composedMacro(h, 'Macro copie');
        const problems = [];
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        if (!returnBarShown()) problems.push('bandeau absent après le stylo');
        document.getElementById('v2-btn-save-as').click();
        await h.sleep(900);
        const after = screenState();
        if (after.current === String(macro.otherId) || after.name !== 'Copie du modèle ouvert') problems.push('la copie n\'est pas à l\'écran : ' + JSON.stringify(after));
        if (after.bar) problems.push('bandeau resté sur une copie : ' + JSON.stringify(after));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { dialogs.restore(); await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_return_with_the_macro_deleted_elsewhere_keeps_the_model_and_drops_the_bar',
    description: 'Le macro-modèle a été supprimé par quelqu\'un d\'autre pendant qu\'on modifie un de ses modèles : « Revenir au macro-modèle » laisse le modèle à l\'écran (pas de modèle vide à la place) et le bandeau s\'efface',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro supprimée');
        setAutosave(false);
        const problems = [];
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        await window.__gristStub.applyUserActions([['RemoveRecord', MACRO_TABLE, macro.id]]);
        const before = screenState();
        document.getElementById('btn-macro-return').click();
        await h.sleep(900);
        const after = screenState();
        if (after.current !== String(macro.otherId) || after.text !== before.text || after.text === '') problems.push('le modèle doit rester à l\'écran : ' + JSON.stringify({ before, after }));
        if (after.bar) problems.push('bandeau resté alors que le macro-modèle n\'existe plus : ' + JSON.stringify(after));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_return_asks_before_dropping_a_pending_edit_and_cancel_keeps_the_model_and_the_bar',
    description: 'Revenir au macro-modèle avec une modification en attente pose la question « Modifications non enregistrées » (rien d\'écrit tant qu\'on n\'a pas répondu) : Annuler garde le modèle, son texte et le bandeau ; Enregistrer écrit le modèle puis ramène au macro-modèle',
    run: async (h) => {
      try {
        return await h.withRealChoose(async () => {
        const macro = await composedMacro(h, 'Macro retour question');
        setAutosave(false);
        const problems = [];
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        await h.focusAtEnd();
        await h.typeText(' modifié');
        const writes0 = writesNow();
        document.getElementById('btn-macro-return').click();
        await h.sleep(500);
        const asked = { open: dialogOpen(), labels: dialogButtons().map(b => b.textContent), message: dialogOpen() ? document.getElementById('pp-dialog-message').textContent : '', writes: writesNow() - writes0 };
        if (!asked.open || JSON.stringify(asked.labels) !== JSON.stringify(['Annuler', 'Abandonner', 'Enregistrer']) || !asked.message.includes('Macro retour question - autre') || asked.writes !== 0) problems.push('question : ' + JSON.stringify(asked));
        await answerDialog(h, 'Annuler');
        const kept = screenState();
        if (dialogOpen() || kept.current !== String(macro.otherId) || kept.list !== String(macro.otherId) || kept.text !== 'Autre page modifié' || !kept.bar || writesNow() !== writes0) problems.push('après Annuler : ' + JSON.stringify(kept));
        document.getElementById('btn-macro-return').click();
        await h.sleep(500);
        await answerDialog(h, 'Enregistrer');
        const done = screenState();
        const stored = String(macroRow(macro.otherId).Contenu);
        if (dialogOpen() || done.current !== String(macro.id) || !done.summary || done.bar || !stored.includes('Autre page modifié')) problems.push('après Enregistrer : ' + JSON.stringify({ done, stored }));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
        });
      } finally {
        // Une assertion qui échoue ne doit pas laisser la fenêtre ouverte (ni la modification en attente) aux scénarios suivants.
        if (dialogOpen()) await answerDialog(h, 'Abandonner').catch(() => {});
        await leaveMacro(h);
      }
    },
  });

  cases.push({
    id: 'macro_return_rereads_the_models_so_the_reading_shows_what_was_just_saved',
    description: 'Revenir au macro-modèle relit les modèles : le texte qu\'un modèle vient de recevoir dans Grist (enregistrement automatique pas encore relu) se lit dans la Lecture du macro-modèle, sans attendre le passage suivant',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro relecture');
        await feedRecord(h);
        setAutosave(false); // aucun passage du minuteur ne relit la liste à la place du retour
        const problems = [];
        pencilOf(macro.coverId).click();
        await h.sleep(800);
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.coverId, { Contenu: '<p>Texte enregistré à l\'instant</p>' });
        const stale = String(Templates.getCached().find(t => String(t.id) === String(macro.coverId)).contenu);
        if (stale.includes('à l\'instant')) problems.push('le cache n\'était pas en retard, le cas ne prouve rien : ' + stale);
        document.getElementById('btn-macro-return').click();
        await h.sleep(900);
        const cached = String(Templates.getCached().find(t => String(t.id) === String(macro.coverId)).contenu);
        if (!cached.includes('à l\'instant')) problems.push('cache des modèles pas relu au retour : ' + cached);
        await h.clickButton('btn-mode-read');
        await h.sleep(1200);
        const reading = (document.getElementById('reader-container').textContent || '');
        if (!reading.includes('Texte enregistré à l\'instant')) problems.push('Lecture du macro-modèle : ' + reading.slice(0, 160));
        await h.clickButton('btn-mode-edit');
        await h.sleep(300);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_pencil_and_return_bar_follow_the_language',
    description: 'En anglais, le résumé (Cover page, Annex 1, infobulle du stylo) et le bandeau de retour sont traduits, et un changement de langue en cours de route les réécrit',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro langue');
        const problems = [];
        I18n.setLang('en');
        await h.sleep(200);
        const rows = summaryRows();
        if (rows[0].label !== 'Cover page' || rows[1].label !== 'Annex 1' || rows[0].pencils[0].label !== 'Edit the template “Macro langue - garde”') problems.push('résumé en anglais : ' + JSON.stringify(rows[0]));
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        const en = screenState();
        if (en.barText !== 'Template opened from the macro template “Macro langue”.' || en.barButton !== 'Back to the macro template' || document.getElementById('macro-return-bar').getAttribute('aria-label') !== 'Back to the macro template') problems.push('bandeau en anglais : ' + JSON.stringify(en));
        I18n.setLang('fr');
        await h.sleep(200);
        const fr = screenState();
        if (fr.barText !== 'Modèle ouvert depuis le macro-modèle « Macro langue ».' || fr.barButton !== 'Revenir au macro-modèle') problems.push('bandeau repassé en français : ' + JSON.stringify(fr));
        document.getElementById('btn-macro-return').click();
        await h.sleep(800);
        I18n.setLang('en');
        await h.sleep(200);
        if (summaryRows()[0].label !== 'Cover page' || !summaryRows()[0].pencils[0].label.startsWith('Edit the template')) problems.push('résumé déjà à l\'écran, repassé en anglais : ' + JSON.stringify(summaryRows()[0]));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { I18n.setLang('fr'); await leaveMacro(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.macroModeles = cases;
})();
