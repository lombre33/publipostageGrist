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
    description: 'ConditionRules.compareValues couvre =, ≠, >, <, ≥, ≤ (numérique et texte), contient, vide, non vide',
    run: async () => {
      const c = ConditionRules.compareValues;
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
      const c = ConditionRules.compareValues;
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
      const c = ConditionRules.compareValues;
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
      const bare = ConditionRules.parseColumnRef('TypeDossier', 'Dossiers');
      const qualified = ConditionRules.parseColumnRef('Clients.Statut', 'Dossiers');
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
    id: 'macro_build_concatenated_html_keeps_the_address_block_of_a_linked_slide_when_asked',
    description: 'buildConcatenatedHtml (option `anchors`, les sorties qui écrivent la cible d\'un lien vers une diapositive) laisse à une diapositive de présentation que vise un lien son bloc d\'adresse ; sans l\'option, rien ne change (le HTML est le même qu\'avant) ; un document n\'en reçoit pas',
    run: async () => {
      const props = n => '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0;overflow:hidden" data-anchor="slide-' + n + '" data-anchor-name="Diapositive ' + n + '"></div>';
      const brk = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
      const templates = [
        { id: 'deck', typeModele: 'presentation', contenu: '<h1>Un</h1>' + brk + props(2) + '<p>Deux</p>' },
        { id: 'doc', typeModele: 'document', contenu: '<p>Texte</p>' },
      ];
      const macroSlots = { slots: [{ type: 'fixed', modeleId: 'doc' }, { type: 'fixed', modeleId: 'deck' }] };
      const withAnchors = await MacroTemplates.buildConcatenatedHtml(macroSlots, 'Dossiers', { id: 1 }, templates, { anchors: true });
      const without = await MacroTemplates.buildConcatenatedHtml(macroSlots, 'Dossiers', { id: 1 }, templates);
      const count = html => (html.match(/class="pp-slide-anchor"/g) || []).length;
      const pass = count(withAnchors) === 1 && /data-anchor="slide-2"/.test(withAnchors) && count(without) === 0 && !/data-anchor/.test(without) && /<p>Texte<\/p>/.test(withAnchors);
      return { pass, notes: JSON.stringify({ with: withAnchors, without }) };
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
    const select = document.querySelector('#macro-editor-slots .macro-doc-model');
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
        const cover = document.querySelector('#macro-editor-slots .macro-doc-model');
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
        const cover = document.querySelector('#macro-editor-slots .macro-doc-model');
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
    description: 'Le bouton Page est actif pour un macro-modèle et son menu coche sa page (colonne Margins de sa ligne) : « Selon chaque modèle » en A4 pour un macro-modèle neuf, A4 portrait pour un macro-modèle fait avant ce réglage (sa ligne n\'en dit rien), A5 paysage une fois écrit ; revenir d\'un modèle classique la retrouve',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro page menu');
        const problems = [];
        const first = pageState();
        if (first.disabled || first.pressed !== 'false' || first.checked !== 'auto,A4' || first.title !== 'Page' || first.grey !== 0 || first.label !== 'Page A4 selon chaque modèle (passer en paysage)') problems.push('macro-modèle neuf : ' + JSON.stringify(first));
        if (JSON.parse(macroRow(id).Margins || '{}').orientationAuto !== true) problems.push('ligne d\'un macro-modèle neuf : ' + macroRow(id).Margins);
        window.__gristStub.remoteWrite(MACRO_TABLE, id, { Margins: storedMargins({}) });
        await reopen(h, id);
        const legacy = pageState();
        if (legacy.disabled || legacy.pressed !== 'false' || legacy.checked !== 'portrait,A4' || legacy.label !== 'Page A4 en portrait (passer en paysage)') problems.push('macro-modèle fait avant le réglage : ' + JSON.stringify(legacy));
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
    description: 'Un macro-modèle sans réglage de page (fait avant « Selon chaque modèle ») reste en A4 portrait (Lecture, PDF, Word) même si sa page de garde est en A3 paysage : son sens, imposé, est le seul qui compte',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro page défaut');
        await feedRecord(h);
        window.__gristStub.remoteWrite(MACRO_TABLE, coverId, { Margins: storedMargins({ orientation: 'landscape', format: 'A3' }) });
        // Un macro-modèle fait avant « Selon chaque modèle » : sa ligne n\'en dit rien, son sens (portrait) est imposé à ses modèles.
        window.__gristStub.remoteWrite(MACRO_TABLE, id, { Margins: storedMargins({}) });
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

  // --- « Selon chaque modèle » (12/10, carte « Dans un macro-modèle, qui décide du sens des pages ? », réponse « Chaque modèle, ou imposé ») -----------------------------------------------------
  // Le troisième choix du sens, dans le menu Page du macro-modèle : chaque modèle assemblé garde le sens de SA page (le format et les marges restent ceux du macro-modèle). C\'est le réglage d\'un
  // macro-modèle neuf ; un macro-modèle fait avant lui garde son sens imposé. Il voyage avec la page du macro-modèle (clé `orientationAuto` de la colonne Margins).
  cases.push({
    id: 'macro_following_each_model_is_the_default_of_a_new_macro_and_travels_with_its_page',
    description: '« Selon chaque modèle » est le réglage d\'un macro-modèle créé par la fenêtre de composition (clé orientationAuto de sa colonne Margins, sens portrait, format A4) ; Paysage l\'impose (la clé disparaît), « Selon chaque modèle » le rétablit en gardant format et marges, la composition reste intacte ; le macro-modèle rouvert montre ce qui est écrit',
    run: async (h) => {
      try {
        const { id } = await loadedMacro(h, 'Macro selon chaque modèle');
        const problems = [];
        const before = macroRow(id);
        const written = JSON.parse(before.Margins || '{}');
        if (written.orientationAuto !== true || written.orientation !== 'portrait' || written.format !== 'A4') problems.push('ligne du macro-modèle neuf : ' + before.Margins);
        const marginsBefore = ['top', 'right', 'bottom', 'left'].map(k => written[k]);
        await pickPage(h, 'landscape');
        await waitTicks(h, 2);
        const imposed = JSON.parse(macroRow(id).Margins || '{}');
        if (imposed.orientation !== 'landscape' || 'orientationAuto' in imposed) problems.push('Paysage imposé : ' + macroRow(id).Margins);
        await reopen(h, id);
        if (pageChecked() !== 'landscape,A4') problems.push('rouvert en paysage : ' + pageChecked());
        await pickPage(h, 'auto', 'A5');
        await waitTicks(h, 2);
        const again = JSON.parse(macroRow(id).Margins || '{}');
        if (again.orientationAuto !== true || again.orientation !== 'portrait' || again.format !== 'A5') problems.push('« Selon chaque modèle » rétabli en A5 : ' + macroRow(id).Margins);
        if (!['top', 'right', 'bottom', 'left'].every((k, i) => near(again[k], marginsBefore[i], .001))) problems.push('marges changées : ' + macroRow(id).Margins);
        if (macroRow(id).Contenu !== before.Contenu) problems.push('composition changée : ' + macroRow(id).Contenu);
        await reopen(h, id);
        const state = pageState();
        if (state.checked !== 'auto,A5' || state.pressed !== 'false' || state.label !== 'Page A5 selon chaque modèle (passer en paysage)') problems.push('rouvert : ' + JSON.stringify(state));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, written: before.Margins, again: macroRow(id).Margins }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_following_each_model_takes_the_sense_of_its_cover_and_keeps_its_own_format',
    description: 'Un macro-modèle « Selon chaque modèle » dont la page de garde est en A3 paysage donne une Lecture, un PDF, un PDF unique et un Word en paysage mais au FORMAT du macro-modèle (A4) : le modèle apporte son sens, jamais son format ; Portrait impose ensuite le portrait à tous',
    run: async (h) => {
      try {
        const { id, coverId } = await loadedMacro(h, 'Macro selon la garde');
        await feedRecord(h);
        h.setA4Preview(true);
        await h.sleep(300);
        window.__gristStub.remoteWrite(MACRO_TABLE, coverId, { Margins: storedMargins({ orientation: 'landscape', format: 'A3' }) });
        await reopen(h, id);
        const problems = [];
        const state = pageState();
        if (state.checked !== 'auto,A4') problems.push('menu : ' + state.checked);
        document.getElementById('btn-mode-read').click();
        await h.sleep(900);
        const sheet = sheetLayoutWidth();
        if (sheet === null || !near(sheet, 1122.52, 2)) problems.push('feuille de la Lecture : ' + sheet + ' (1122.52 attendu)');
        const exportPdf = async () => {
          const blob = await pdfDownloaded(h, async () => { document.getElementById('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
          return blob ? pdfPages(h, blob) : [];
        };
        const pages = await exportPdf();
        if (pages.length !== 1 || !near(pages[0].width, 841.89, .5) || !near(pages[0].height, 595.28, .5) || !/Page\s*de\s*garde/.test(pages[0].text)) problems.push('PDF : ' + JSON.stringify(pages));
        const merged = await fileDownloaded(h, 'v2-btn-export-pdf-merged');
        const mergedPages = merged && merged.blob ? await pdfPages(h, merged.blob) : [];
        if (mergedPages.length !== 1 || !near(mergedPages[0].width, 841.89, .5) || !near(mergedPages[0].height, 595.28, .5)) problems.push('PDF unique : ' + JSON.stringify(mergedPages));
        const word = await fileDownloaded(h, 'v2-btn-export-docx');
        const wordPage = word && word.blob ? await docxPage(word.blob) : null;
        if (!wordPage || wordPage.width !== 16838 || wordPage.height !== 11906 || wordPage.orient !== 'landscape') problems.push('Word : ' + JSON.stringify(wordPage));
        // Portrait impose le portrait à tous, la page de garde en paysage comprise.
        document.getElementById('btn-mode-edit').click();
        await h.sleep(500);
        await pickPage(h, 'portrait');
        const portraitPages = await exportPdf();
        if (portraitPages.length !== 1 || !near(portraitPages[0].width, 595.28, .5) || !near(portraitPages[0].height, 841.89, .5)) problems.push('PDF en portrait imposé : ' + JSON.stringify(portraitPages));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, sheet, pages, mergedPages, wordPage }) };
      } finally {
        const edit = document.getElementById('btn-mode-edit'); if (edit) edit.click();
        await leaveMacro(h);
      }
    },
  });

  // Un modèle Grille entre dans un macro-modèle comme un document (12/10, « il faudrait qu\'un macro modèle puisse contenir des modèles paysage, portrait et grille ») : la fenêtre de composition le propose
  // (page de garde, annexes, modèle par défaut), le macro-modèle assemble son tableau, et sa propre page lui donne le sens de ses pages (« Selon chaque modèle »). Une présentation y entre aussi (22/10, lot 4 :
  // « importer des slides dans des documents ») : elle garde sa page de diapositive au milieu des pages du macro-modèle.
  cases.push({
    id: 'macro_editor_offers_documents_grids_and_presentations_but_neither_emails_nor_macros',
    description: 'La fenêtre de composition d\'un macro-modèle propose les documents, les modèles Grille et les présentations (page de garde, modèle par défaut d\'une annexe) ; ni les modèles email ni les macro-modèles (pas d\'imbrication)',
    run: async (h) => {
      try {
        setAutosave(true);
        await h.clickButton('btn-new');
        await h.sleep(300);
        const table = '<table style="width: 200px;"><colgroup><col style="width: 200px;"></colgroup><tbody><tr data-row-height="28" style="height: 28px"><td colwidth="200"><p>Grille</p></td></tr></tbody></table>';
        await Templates.save(null, 'Liste - document', '<p>Document</p>', '', null, null, 'document', null);
        await Templates.save(null, 'Liste - grille', table, '', null, null, 'grille', null);
        await Templates.save(null, 'Liste - diapositives', '<h1>Une</h1><p>Texte</p>', '', null, null, 'presentation', null);
        await Templates.save(null, 'Liste - email', '<p>Email</p>', '', null, null, 'email', { destinataires: '', cc: '', cci: '', objet: '' });
        await Templates.save(null, 'Liste - macro', JSON.stringify({ slots: [] }), '', null, null, 'macro', null);
        await Templates.loadAll();
        MacroEditor.openModal(null);
        document.getElementById('macro-editor-add-slot').click();
        await h.sleep(150);
        const ours = select => Array.from(select.options).map(option => option.textContent.replace(/^Utiliser\s+«\s*/i, '').replace(/\s*»\s*$/, '').trim()).filter(name => /^Liste - /.test(name)).sort();
        const cover = ours(document.querySelector('#macro-editor-slots .macro-doc-model'));
        const annex = ours(document.querySelector('#macro-editor-slots .macro-slot-default-select'));
        const want = ['Liste - diapositives', 'Liste - document', 'Liste - grille'];
        const problems = [];
        if (cover.join('|') !== want.join('|')) problems.push('page de garde : ' + cover.join('|'));
        if (annex.join('|') !== want.join('|')) problems.push('modèle par défaut d\'une annexe : ' + annex.join('|'));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, cover, annex }) };
      } finally {
        const cancel = document.getElementById('macro-editor-cancel'); if (cancel) cancel.click();
        await leaveMacro(h);
      }
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
        const cover = document.querySelector('#macro-editor-slots .macro-doc-model');
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

  // --- Les marges d'un macro-modèle priment sur celles des modèles qu'il assemble, et l'onglet Marges le dit (09/10, Antoine : « préciser que ça prend le pas sur les marges des modèles assemblés ») ---
  // Un macro-modèle impose SES marges à tous les modèles qu'il assemble (la Lecture, le PDF, le Word) ; celles d'un modèle ne servent que s'il est ouvert seul (js/main.js:loadMacroIntoEditor lit celles de
  // la ligne du macro-modèle, MacroTemplates.buildConcatenatedHtml ne joint que les contenus). La mention de l'onglet Marges (js/settings.js:setMacroMode) affirme exactement cela : le premier cas le mesure
  // sur les trois sorties, le second vérifie quand la mention est là.
  const MACRO_MARGINS_MM = { top: 30, right: 25, bottom: 35, left: 40 };
  // Distance (px de mise en page) du bord gauche de la feuille de la Lecture au premier texte qui contient `text`.
  function readerTextLeft(root, text, zoom) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.includes(text)) continue;
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      return rect ? (rect.left - root.getBoundingClientRect().left) / zoom : null;
    }
    return null;
  }
  // Abscisse (points) du premier texte de chaque page d'un PDF, relu par pdf.js.
  async function pdfFirstTextX(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const xs = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const items = (await (await pdf.getPage(n)).getTextContent()).items.filter(it => it.str && it.str.trim());
      xs.push(items.length ? +items[0].transform[4].toFixed(2) : null);
    }
    return xs;
  }
  // Marges déclarées par un .docx (w:pgMar de word/document.xml), en twips.
  async function docxPageMargins(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const xml = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml').async('string');
    const tag = (xml.match(/<w:pgMar[^>]*>/) || [''])[0];
    const attr = name => { const m = tag.match(new RegExp('w:' + name + '="([^"]*)"')); return m ? Number(m[1]) : null; };
    return { top: attr('top'), right: attr('right'), bottom: attr('bottom'), left: attr('left') };
  }

  cases.push({
    id: 'macro_margins_replace_the_margins_of_the_models_it_assembles_in_reading_pdf_and_word',
    description: 'Les marges d\'un macro-modèle valent pour tous les modèles qu\'il assemble : sa page de garde (gauche 12 mm) et le modèle de son annexe (gauche 60 mm) ont leur texte à 40 mm du bord de la feuille dans la Lecture et dans le PDF, et le Word porte les marges du macro-modèle ; c\'est ce que dit la mention de l\'onglet Marges',
    run: async (h) => {
      try {
        const { id, coverId, thirdId } = await composedMacro(h, 'Macro marges rendus');
        await feedRecord(h);
        h.setA4Preview(true);
        await h.sleep(300);
        // Chaque modèle a SES marges (gauche 12 mm, gauche 60 mm), le macro-modèle les siennes (gauche 40 mm).
        window.__gristStub.remoteWrite(MACRO_TABLE, coverId, { Margins: storedMargins({ left: 12 }) });
        window.__gristStub.remoteWrite(MACRO_TABLE, thirdId, { Margins: storedMargins({ left: 60 }) });
        window.__gristStub.remoteWrite(MACRO_TABLE, id, { Margins: storedMargins(MACRO_MARGINS_MM) });
        await reopen(h, id);
        const problems = [];
        document.getElementById('btn-mode-read').click();
        await h.sleep(900);
        const content = document.querySelector('#reader-container .reader-content');
        const zoom = parseFloat(getComputedStyle(content).zoom) || 1;
        const lefts = ['Page de garde', 'Page par défaut'].map(text => readerTextLeft(content, text, zoom));
        const wantedPx = MACRO_MARGINS_MM.left * 96 / 25.4;
        if (lefts.some(left => left === null || !near(left, wantedPx, 1.5))) problems.push('Lecture : texte à ' + JSON.stringify(lefts) + ' px du bord de la feuille (' + wantedPx.toFixed(2) + ' attendus pour 40 mm)');
        const pdf = await pdfDownloaded(h, async () => { document.getElementById('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
        const xs = pdf ? await pdfFirstTextX(h, pdf) : [];
        const wantedPt = MACRO_MARGINS_MM.left * 72 / 25.4;
        if (xs.length !== 2 || xs.some(x => x === null || !near(x, wantedPt, .6))) problems.push('PDF : premier texte de chaque page à ' + JSON.stringify(xs) + ' pt (' + wantedPt.toFixed(2) + ' attendus pour 40 mm)');
        const word = await fileDownloaded(h, 'v2-btn-export-docx');
        const wordMargins = word && word.blob ? await docxPageMargins(word.blob) : null;
        const twips = mm => mm * 1440 / 25.4;
        if (!wordMargins || ['top', 'right', 'bottom', 'left'].some(side => wordMargins[side] === null || !near(wordMargins[side], twips(MACRO_MARGINS_MM[side]), 2))) problems.push('Word : ' + JSON.stringify(wordMargins) + ' twips');
        document.getElementById('btn-mode-edit').click();
        await h.sleep(500);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, lefts, xs, wordMargins }) };
      } finally {
        const edit = document.getElementById('btn-mode-edit'); if (edit) edit.click();
        await leaveMacro(h);
      }
    },
  });

  // Ce que la personne voit : Réglages, onglet Marges ; la mention compte comme vue si rien ne la cache.
  const marginsNoteSeen = h => async () => {
    document.getElementById('v2-btn-settings').click();
    await h.sleep(150);
    document.querySelector('.settings-tab[data-settings-tab="pageMargins"]').click();
    await h.sleep(150);
    const el = document.getElementById('settings-margins-macro-note');
    const panel = el && el.closest('.settings-panel');
    const out = !el ? null : {
      shown: !el.hidden && !panel.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0,
      text: el.textContent,
    };
    document.getElementById('settings-close').click();
    await h.sleep(100);
    return out;
  };

  cases.push({
    id: 'macro_margins_tab_says_the_macro_margins_take_precedence',
    description: 'L\'onglet Marges des Réglages dit, tant qu\'un macro-modèle est chargé, que ses marges priment sur celles des modèles assemblés (en français ici ; une copie dans une page qui démarre en anglais la lit en anglais) ; la mention est cachée avec un modèle ouvert par le stylo du macro-modèle et avec un nouveau document, revient au retour au macro-modèle, et l\'ouvrir n\'écrit rien',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro mention marges');
        const problems = [];
        const seen = marginsNoteSeen(h);
        // Les écritures de modèles : les enregistrements du contenu (countSaves) et les créations, pas l'écriture du jeton qui accompagne la première copie de version (Templates.ensureToken).
        const writesNow = () => window.__gristStub.countSaves(MACRO_TABLE) + window.__gristStub.countActions('AddRecord', MACRO_TABLE);
        const writesBefore = writesNow();
        const inMacro = await seen();
        if (!inMacro) problems.push('la mention est absente de l\'onglet Marges');
        else if (!inMacro.shown || !/priment sur celles des modèles assemblés/.test(inMacro.text)) problems.push('macro-modèle chargé, en français : ' + JSON.stringify(inMacro));
        // Le modèle ouvert par son stylo a SES marges : pas de mention.
        pencilOf(macro.otherId).click();
        await h.sleep(900);
        const inModel = await seen();
        if (!inModel || inModel.shown) problems.push('modèle ouvert par le stylo : ' + JSON.stringify(inModel));
        document.getElementById('btn-macro-return').click();
        await h.sleep(900);
        const back = await seen();
        if (!back || !back.shown) problems.push('retour au macro-modèle : ' + JSON.stringify(back));
        await leaveMacro(h);
        const inNew = await seen();
        if (!inNew || inNew.shown) problems.push('nouveau document : ' + JSON.stringify(inNew));
        if (writesNow() !== writesBefore) problems.push('ouvrir l\'onglet a écrit ' + (writesNow() - writesBefore) + ' fois dans la table des modèles');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, inMacro, inModel, inNew }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_margins_tab_says_the_macro_margins_take_precedence_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : tant qu\'un macro-modèle est chargé, l\'onglet Marges des Réglages dit que ses marges priment (« take precedence over those of the assembled templates »)',
    run: async (h) => {
      try {
        await composedMacro(h, 'Macro mention marges');
        const seen = marginsNoteSeen(h);
        const inMacro = await seen();
        const ok = I18n.getLang() === 'en' && !!inMacro && inMacro.shown && /take precedence over those of the assembled templates/.test(inMacro.text);
        return { pass: ok, notes: JSON.stringify({ lang: I18n.getLang(), inMacro }) };
      } finally { await leaveMacro(h); }
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
  // Les écritures de modèles : les enregistrements du contenu (countSaves) et les créations, pas l'écriture du jeton qui accompagne la première copie de version (Templates.ensureToken).
  const writesNow = () => window.__gristStub.countSaves(MACRO_TABLE) + window.__gristStub.countActions('AddRecord', MACRO_TABLE);
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
    description: 'Le résumé d\'un macro-modèle liste ses modèles (un « Document n » par position : le modèle d\'un document, ou celui de chaque règle d\'une position choisie selon la ligne et le modèle par défaut, sans doublon dans une position), un stylo chacun ; une position sans modèle garde sa ligne, un modèle supprimé reste dit avec son stylo grisé',
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
        const wanted = [['Document 1', [cover]], ['Document 2', [other, cover, third]], ['Document 3', [other]], ['Document 4', ['aucun modèle choisi']], ['Document 5', ['modèle introuvable']]];
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
        if (sentence !== '5 documents, dont 4 sous condition.') problems.push('phrase : ' + sentence);
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
        if (!asked.open || JSON.stringify(asked.labels) !== JSON.stringify(['Annuler', 'Ne pas enregistrer', 'Enregistrer']) || !asked.message.includes('Macro retour question - autre') || asked.writes !== 0) problems.push('question : ' + JSON.stringify(asked));
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
        if (dialogOpen()) await answerDialog(h, 'Ne pas enregistrer').catch(() => {});
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

  // Le résumé et le bandeau de retour s'écrivent avec la langue de la page, au moment où ils se dessinent : le même parcours en français, puis dans une page qui démarre en anglais.
  const macroTextsCase = {
    id: 'macro_pencil_and_return_bar_texts_are_in_the_page_language',
    description: 'En français, le résumé (Document 1, Document 2, infobulle du stylo) et le bandeau de retour sont en français ; dans la page qui démarre en anglais (Document 1, Document 2, « Edit the template … », « Back to the macro template ») ils sont en anglais',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro langue');
        const problems = [];
        const en = I18n.getLang() === 'en';
        const want = en
          ? { cover: 'Document 1', annex: 'Document 2', pencil: 'Edit the template “Macro langue - garde”', barText: 'Template opened from the macro template “Macro langue”.', barButton: 'Back to the macro template', barAria: 'Back to the macro template' }
          : { cover: 'Document 1', annex: 'Document 2', pencil: 'Modifier le modèle « Macro langue - garde »', barText: 'Modèle ouvert depuis le macro-modèle « Macro langue ».', barButton: 'Revenir au macro-modèle', barAria: 'Retour au macro-modèle' };
        const rows = summaryRows();
        if (rows[0].label !== want.cover || rows[1].label !== want.annex || rows[0].pencils[0].label !== want.pencil) problems.push('résumé : ' + JSON.stringify(rows[0]));
        pencilOf(macro.otherId).click();
        await h.sleep(800);
        const bar = screenState();
        if (bar.barText !== want.barText || bar.barButton !== want.barButton || document.getElementById('macro-return-bar').getAttribute('aria-label') !== want.barAria) problems.push('bandeau : ' + JSON.stringify(bar));
        document.getElementById('btn-macro-return').click();
        await h.sleep(800);
        if (summaryRows()[0].label !== want.cover || summaryRows()[0].pencils[0].label !== want.pencil) problems.push('résumé de retour : ' + JSON.stringify(summaryRows()[0]));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  };
  cases.push(macroTextsCase, Object.assign({}, macroTextsCase, { id: 'macro_pencil_and_return_bar_texts_are_in_english_on_a_page_that_starts_in_english', lang: 'en' }));

  // --- L'œil d'un modèle du résumé (04/10, demande d'Antoine : « dans l'interface d'édition du macro-modèle, une icône œil pour masquer l'un des modèles : il ne s'applique plus en Lecture ni aux exports ») ---
  // Le résumé (js/macro-editor.js:renderParts) met un œil après le stylo de chaque modèle. Un clic le masque de la Lecture et de toutes les sorties du macro-modèle (js/macro-templates.js:pickModeleId, le seul
  // endroit où une position choisit son modèle), le grise sans le retirer (l'œil est barré) et écrit la composition dans sa ligne (`hiddenModeleIds`, dans SA position : le même modèle peut rester affiché ailleurs).
  // Les gestes sont ceux de la personne (le vrai œil, les vrais boutons d'export, la vraie fenêtre de composition) ; ce que la souris mesure à 700×400 est dans le script Node macroHiddenMouse.
  const squashed = s => String(s).replace(/\s+/g, '');
  const countOf = (text, word) => (String(text).match(new RegExp(word, 'g')) || []).length;
  const eyeOf = (slot, id) => document.querySelector('#macro-summary-parts .macro-summary-eye[data-slot="' + slot + '"][data-template-id="' + id + '"]');
  const eyeState = (slot, id) => {
    const eye = eyeOf(slot, id);
    if (!eye) return null;
    const entry = eye.closest('.macro-summary-model');
    const box = eye.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      pressed: eye.getAttribute('aria-pressed'), disabled: eye.disabled, label: eye.getAttribute('aria-label'), title: eye.title,
      crossed: eye.innerHTML.includes('M4 4l16 16'), greyed: entry.classList.contains('is-hidden-model'),
      nameColor: getComputedStyle(entry.querySelector('.macro-summary-model-name')).color,
      w: Math.round(box.width), h: Math.round(box.height), afterPencil: eye.previousElementSibling === entry.querySelector('.macro-summary-edit'),
      onTop: !!hit && (hit === eye || eye.contains(hit)),
    };
  };
  // Les modèles masqués de la position `slotIndex` dans la composition écrite dans une ligne (null : cette position n'existe pas).
  const hiddenIn = (row, slotIndex) => { const slot = (composition(row) || [])[slotIndex]; return slot ? (slot.hiddenModeleIds || []).map(String) : null; };
  const statusNow = () => { const el = document.getElementById('status-msg'); return { text: el.textContent, error: el.className === 'error-msg' }; };
  // La ligne courante de la page du document (la colonne Nom décide des annexes : « a », « b » dans composedMacro).
  async function feedNom(h, nom) {
    const stub = window.__gristStub;
    stub.setVariables(PAGE_DATA, { Nom: 'Text' });
    stub.setRows(PAGE_DATA, [{ id: 1, Nom: nom }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: nom }, PAGE_DATA);
    await h.sleep(100);
  }
  // Ce que la personne lit : la Lecture du macro-modèle (texte sans espaces), puis retour à l'Édition (le résumé).
  async function readingOf(h) {
    document.getElementById('btn-mode-read').click();
    await h.sleep(1000);
    const text = squashed(document.getElementById('reader-container').textContent || '');
    document.getElementById('btn-mode-edit').click();
    await h.sleep(500);
    return text;
  }
  // Les sorties, par les vrais boutons : le PDF de la ligne, le PDF unique (toutes les lignes à la suite), le Word ; chacune rend le texte de ses pages (sans espaces).
  async function singlePdfOf(h) {
    const blob = await pdfDownloaded(h, async () => { document.getElementById('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    return blob ? (await pdfPages(h, blob)).map(p => squashed(p.text)) : null;
  }
  async function mergedPdfOf(h) {
    const file = await fileDownloaded(h, 'v2-btn-export-pdf-merged');
    return file && file.blob ? (await pdfPages(h, file.blob)).map(p => squashed(p.text)) : null;
  }
  async function wordTextOf(h) {
    const file = await fileDownloaded(h, 'v2-btn-export-docx');
    if (!file || !file.blob) return null;
    await ExportCommon.ensureJsZipLoaded();
    const xml = await (await JSZip.loadAsync(await file.blob.arrayBuffer())).file('word/document.xml').async('string');
    return squashed(xml.replace(/<[^>]+>/g, ''));
  }

  cases.push({
    id: 'macro_hidden_model_is_left_out_by_pick_and_build',
    description: "pickModeleId et buildConcatenatedHtml laissent de côté le modèle masqué de SA position (page de garde, règle qui correspond, modèle par défaut), sans passer à la règle suivante ni au modèle par défaut ; les identifiants se comparent en texte ; les sauts de page se recomptent sans lui ; une composition sans liste se lit comme avant",
    run: async () => {
      const problems = [];
      const pick = (slot, record) => MacroTemplates.pickModeleId(slot, 'Dossiers', record);
      if (await pick({ type: 'fixed', modeleId: '42', hiddenModeleIds: ['42'] }, {}) !== null) problems.push('page de garde masquée');
      if (await pick({ type: 'fixed', modeleId: '42' }, {}) !== '42') problems.push('page de garde non masquée');
      // Identifiants en texte : la fenêtre de composition écrit '42', Grist rend 42.
      if (await pick({ type: 'fixed', modeleId: 42, hiddenModeleIds: ['42'] }, {}) !== null) problems.push('42 (nombre) masqué par "42" (texte)');
      if (await pick({ type: 'fixed', modeleId: '42', hiddenModeleIds: [42] }, {}) !== null) problems.push('"42" (texte) masqué par 42 (nombre)');
      // Annexe : la première règle qui correspond donne son modèle, masqué ou non ; jamais la règle suivante ni le modèle par défaut à sa place.
      const annex = hidden => ({
        type: 'conditional',
        rules: [{ column: 'Type', operator: '=', value: 'A', modeleId: 'ma' }, { column: 'Type', operator: '=', value: 'A', modeleId: 'mb' }],
        defaultModeleId: 'md',
        hiddenModeleIds: hidden,
      });
      if (await pick(annex(['ma']), { Type: 'A' }) !== null) problems.push('la règle 1 correspond et son modèle est masqué : rien attendu (ni la règle 2, ni le défaut)');
      if (await pick(annex(['mb']), { Type: 'A' }) !== 'ma') problems.push('le modèle masqué de la règle 2 ne change pas la règle 1');
      if (await pick(annex(['md']), { Type: 'A' }) !== 'ma') problems.push('le modèle par défaut masqué ne change pas la règle 1');
      if (await pick(annex(['md']), { Type: 'Z' }) !== null) problems.push('aucune règle ne correspond et le modèle par défaut est masqué : rien attendu');
      if (await pick(annex(['ma', 'mb']), { Type: 'Z' }) !== 'md') problems.push('aucune règle ne correspond : le modèle par défaut, même si les modèles des règles sont masqués');
      if (await pick(annex([]), { Type: 'A' }) !== 'ma' || await pick(annex(undefined), { Type: 'A' }) !== 'ma') problems.push('liste vide ou absente : rien de masqué');
      // Assemblage : pas de modèle masqué dans le document, pas de saut de page orphelin, les rangs des sauts se suivent.
      const templates = [{ id: 'cover', contenu: '<p>GARDE</p>' }, { id: 'a1', contenu: '<p>ANNEXE1</p>' }, { id: 'a2', contenu: '<p>ANNEXE2</p>' }];
      const rule = modeleId => ({ column: 'Type', operator: '=', value: 'A', modeleId });
      const slots = { slots: [
        { type: 'fixed', modeleId: 'cover', hiddenModeleIds: ['cover'] },
        { type: 'conditional', rules: [rule('a1')], defaultModeleId: null },
        { type: 'conditional', rules: [rule('a2')], defaultModeleId: null },
      ] };
      const html = await MacroTemplates.buildConcatenatedHtml(slots, 'Dossiers', { Type: 'A' }, templates);
      if (html !== '<p>ANNEXE1</p>' + MacroTemplates.slotBreakHtml(1) + '<p>ANNEXE2</p>') problems.push('assemblage sans la page de garde : ' + html);
      // Le même modèle dans deux positions : masqué dans l'une seulement.
      const twice = { slots: [{ type: 'fixed', modeleId: 'cover', hiddenModeleIds: ['cover'] }, { type: 'conditional', rules: [rule('cover')], defaultModeleId: null }] };
      const once = await MacroTemplates.buildConcatenatedHtml(twice, 'Dossiers', { Type: 'A' }, templates);
      if (once !== '<p>GARDE</p>') problems.push('même modèle masqué dans la page de garde seulement : ' + once);
      // Tout masqué : un document vide, sans erreur. Composition d'avant l'œil (sans liste) : comme avant.
      const none = await MacroTemplates.buildConcatenatedHtml({ slots: [{ type: 'fixed', modeleId: 'cover', hiddenModeleIds: ['cover'] }] }, 'Dossiers', {}, templates);
      if (none !== '') problems.push('tout masqué : ' + none);
      const legacy = await MacroTemplates.buildConcatenatedHtml({ slots: [{ type: 'fixed', modeleId: 'cover' }] }, 'Dossiers', {}, templates);
      if (legacy !== '<p>GARDE</p>') problems.push('composition sans liste : ' + legacy);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_hidden_model_helpers_copy_prune_and_ignore_the_unknown',
    description: "withModelHidden rend une copie (jamais la composition reçue), masque ou affiche UN modèle d'UNE position et retire la liste devenue vide ; keepHidden ne reporte que les modèles encore présents dans la position reconstruite ; slotModelIds ne donne ni doublon ni modèle vide",
    run: async () => {
      const problems = [];
      const base = { slots: [
        { type: 'fixed', modeleId: 7 },
        { type: 'conditional', rules: [{ column: 'C', operator: '=', value: 'x', modeleId: '8' }, { column: 'C', operator: '=', value: 'y', modeleId: 8 }, { column: 'C', operator: '=', value: 'z', modeleId: null }], defaultModeleId: '9' },
      ] };
      const frozen = JSON.stringify(base);
      const ids = MacroTemplates.slotModelIds(base.slots[1]).map(String);
      if (JSON.stringify(ids) !== JSON.stringify(['8', '9'])) problems.push('slotModelIds : ' + JSON.stringify(ids));
      if (MacroTemplates.slotModelIds(null).length || MacroTemplates.slotModelIds({ type: 'conditional' }).length || MacroTemplates.slotModelIds({ type: 'fixed', modeleId: '' }).length) problems.push('slotModelIds sur des positions vides');
      const hid = MacroTemplates.withModelHidden(base, 1, '8', true);
      if (JSON.stringify(base) !== frozen) problems.push('la composition reçue a été modifiée');
      if (JSON.stringify(hid.slots[1].hiddenModeleIds) !== JSON.stringify(['8'])) problems.push('masquer : ' + JSON.stringify(hid.slots[1]));
      if (hid.slots[0].hiddenModeleIds !== undefined) problems.push('une autre position a été touchée');
      const again = MacroTemplates.withModelHidden(hid, 1, 8, true);
      if (JSON.stringify(again.slots[1].hiddenModeleIds.map(String)) !== JSON.stringify(['8'])) problems.push('masquer deux fois (texte puis nombre) : ' + JSON.stringify(again.slots[1].hiddenModeleIds));
      const both = MacroTemplates.withModelHidden(hid, 1, '9', true);
      if (JSON.stringify(both.slots[1].hiddenModeleIds.map(String).sort()) !== JSON.stringify(['8', '9'])) problems.push('deux modèles masqués dans une position : ' + JSON.stringify(both.slots[1].hiddenModeleIds));
      const one = MacroTemplates.withModelHidden(both, 1, 8, false);
      if (JSON.stringify(one.slots[1].hiddenModeleIds.map(String)) !== JSON.stringify(['9'])) problems.push('en afficher un des deux : ' + JSON.stringify(one.slots[1].hiddenModeleIds));
      const back = MacroTemplates.withModelHidden(MacroTemplates.withModelHidden(base, 0, 7, true), 0, 7, false);
      if (JSON.stringify(back) !== frozen) problems.push("masquer puis afficher ne rend pas la composition d'origine : " + JSON.stringify(back));
      if (JSON.stringify(MacroTemplates.withModelHidden(base, 5, '8', true)) !== frozen) problems.push('position inexistante');
      if (JSON.stringify(MacroTemplates.withModelHidden(null, 0, '8', true)) !== JSON.stringify({ slots: [] })) problems.push('composition absente');
      const rebuilt = { type: 'conditional', rules: [{ column: 'C', operator: '=', value: 'x', modeleId: '8' }], defaultModeleId: null };
      const kept = MacroTemplates.keepHidden(rebuilt, both.slots[1]);
      if (JSON.stringify(kept.hiddenModeleIds) !== JSON.stringify(['8'])) problems.push('keepHidden : le modèle 9 a quitté la position, son masquage aussi : ' + JSON.stringify(kept));
      const replaced = MacroTemplates.keepHidden({ type: 'fixed', modeleId: '10' }, { type: 'fixed', modeleId: '7', hiddenModeleIds: ['7'] });
      if (replaced.hiddenModeleIds !== undefined) problems.push('un autre modèle mis à la place repart affiché : ' + JSON.stringify(replaced));
      if (MacroTemplates.keepHidden({ type: 'fixed', modeleId: '7' }, null).hiddenModeleIds !== undefined) problems.push("keepHidden sans position d'origine");
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_summary_gives_each_model_an_eye_that_says_its_state',
    description: "Le résumé met un œil après le stylo de chaque modèle (nom accessible « Masquer le modèle « … » », info-bulle, 24 px au moins, au premier plan) ; un modèle masqué dans sa position a l'œil barré et enfoncé et son nom grisé, sans être retiré ; le même modèle dans une autre position reste affiché ; un modèle supprimé a un œil grisé",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro yeux', (m, rule) => [
          { type: 'conditional', rules: [rule(m.coverId, 'c')], defaultModeleId: null },
          { type: 'conditional', rules: [rule(987654, 'e')], defaultModeleId: null },
        ]);
        const problems = [];
        const cover = 'Macro yeux - garde', other = 'Macro yeux - autre', third = 'Macro yeux - défaut';
        const hideLabel = name => 'Masquer le modèle « ' + name + ' »';
        const hideTip = name => 'Masquer « ' + name + ' » de la Lecture et des exports';
        const hiddenTip = name => '« ' + name + ' » est masqué de la Lecture et des exports : cliquer pour l’afficher';
        const everyModel = [[0, macro.coverId, cover], [1, macro.otherId, other], [1, macro.coverId, cover], [1, macro.thirdId, third], [2, macro.coverId, cover]];
        // Rien de masqué : tous les yeux ouverts, actifs, après leur stylo, au premier plan.
        for (const [slot, id, name] of everyModel) {
          const s = eyeState(slot, id);
          if (!s) { problems.push('œil absent : position ' + slot + ', ' + name); continue; }
          if (s.pressed !== 'false' || s.crossed || s.greyed || s.disabled) problems.push('œil ouvert attendu (' + slot + ', ' + name + ') : ' + JSON.stringify(s));
          if (s.label !== hideLabel(name) || s.title !== hideTip(name)) problems.push('noms (' + slot + ', ' + name + ') : ' + s.label + ' / ' + s.title);
          if (s.w < 24 || s.h < 24 || !s.onTop || !s.afterPencil) problems.push('taille, premier plan ou place (' + slot + ', ' + name + ') : ' + JSON.stringify(s));
        }
        const gone = eyeState(3, 987654);
        if (!gone || !gone.disabled || gone.pressed !== null || gone.crossed || gone.label !== 'modèle introuvable') problems.push('modèle supprimé : œil grisé attendu : ' + JSON.stringify(gone));
        const shownColor = eyeState(1, macro.coverId).nameColor;
        const namesBefore = JSON.stringify(summaryRows().map(r => [r.label, r.models]));
        // Des modèles masqués dans la ligne (comme après un clic, ou écrits par quelqu'un d'autre) : la page de garde dans sa position, « autre » et « défaut » dans l'annexe 1.
        const slots = composition(macroRow(macro.id));
        slots[0].hiddenModeleIds = [macro.coverId];
        slots[1].hiddenModeleIds = [macro.otherId, macro.thirdId];
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.id, { Contenu: JSON.stringify({ slots }) });
        await reopen(h, macro.id);
        const wanted = [[0, macro.coverId, cover, true], [1, macro.otherId, other, true], [1, macro.coverId, cover, false], [1, macro.thirdId, third, true], [2, macro.coverId, cover, false]];
        for (const [slot, id, name, hidden] of wanted) {
          const s = eyeState(slot, id);
          if (!s) { problems.push('œil absent après relecture : position ' + slot + ', ' + name); continue; }
          if (s.pressed !== String(hidden) || s.crossed !== hidden || s.greyed !== hidden) problems.push('état (' + slot + ', ' + name + ') attendu ' + hidden + ' : ' + JSON.stringify(s));
          if (s.label !== hideLabel(name)) problems.push('le nom accessible change avec l\'état (' + slot + ', ' + name + ') : ' + s.label);
          if (s.title !== (hidden ? hiddenTip(name) : hideTip(name))) problems.push('info-bulle (' + slot + ', ' + name + ') : ' + s.title);
          if (hidden && s.nameColor === shownColor) problems.push('nom masqué pas grisé (' + slot + ', ' + name + ') : ' + s.nameColor);
          if (!hidden && s.nameColor !== shownColor) problems.push('nom affiché grisé (' + slot + ', ' + name + ') : ' + s.nameColor);
        }
        // Rien ne disparaît : mêmes lignes, mêmes modèles, mêmes stylos.
        if (JSON.stringify(summaryRows().map(r => [r.label, r.models])) !== namesBefore) problems.push('les lignes du résumé ont changé : ' + JSON.stringify(summaryRows().map(r => [r.label, r.models])));
        if (summaryRows().flatMap(r => r.pencils).filter(p => !p.disabled).length !== 5) problems.push('stylos : ' + JSON.stringify(summaryRows().map(r => r.pencils.length)));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_eye_hides_the_model_from_reading_pdf_merged_pdf_and_word_and_shows_it_again',
    description: "Un clic sur l'œil d'un modèle le retire de la Lecture, du PDF, du PDF unique et du Word (UNE seule position : le même modèle, donné par une règle d'une annexe, reste), le macro-modèle reste composé de la même façon ; un second clic remet tout, la ligne Grist retrouve exactement sa composition d'avant",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil sorties');
        await feedNom(h, 'b'); // l'annexe 1 donne alors, par sa règle « b », le modèle de la page de garde : « Page de garde » deux fois
        setAutosave(false);
        const problems = [];
        const original = macroRow(macro.id).Contenu;
        const word = 'Pagedegarde';
        const outputs = async () => {
          const pdf = await singlePdfOf(h), merged = await mergedPdfOf(h), docx = await wordTextOf(h);
          return { reading: countOf(await readingOf(h), word), pdf: pdf && pdf.map(t => countOf(t, word)), merged: merged && merged.map(t => countOf(t, word)), word: docx && countOf(docx, word) };
        };
        const full = await outputs();
        if (JSON.stringify(full) !== JSON.stringify({ reading: 2, pdf: [1, 1], merged: [1, 1], word: 2 })) problems.push('avant tout masquage : ' + JSON.stringify(full));
        // Un clic sur l'œil de la page de garde : une seule « Page de garde » partout (celle de l'annexe 1, même modèle dans une autre position).
        eyeOf(0, macro.coverId).click();
        await h.sleep(700);
        const hiddenCover = await outputs();
        if (JSON.stringify(hiddenCover) !== JSON.stringify({ reading: 1, pdf: [1], merged: [1], word: 1 })) problems.push('page de garde masquée : ' + JSON.stringify(hiddenCover));
        if (JSON.stringify(summaryRows().map(r => [r.label, r.models])) !== JSON.stringify([['Document 1', ['Macro œil sorties - garde']], ['Document 2', ['Macro œil sorties - autre', 'Macro œil sorties - garde', 'Macro œil sorties - défaut']]])) problems.push('le résumé a changé : ' + JSON.stringify(summaryRows().map(r => r.models)));
        // Un second clic remet tout, à l'identique.
        eyeOf(0, macro.coverId).click();
        await h.sleep(700);
        if (macroRow(macro.id).Contenu !== original) problems.push('la ligne ne retrouve pas sa composition : ' + macroRow(macro.id).Contenu + ' pour ' + original);
        const reading = await readingOf(h);
        if (countOf(reading, word) !== 2) problems.push('Lecture après le second clic : ' + reading);
        // Même modèle, autre position : l'œil du modèle que donne la règle de l'annexe 1 ne retire pas la page de garde.
        eyeOf(1, macro.coverId).click();
        await h.sleep(700);
        const hiddenAnnex = await readingOf(h);
        if (countOf(hiddenAnnex, word) !== 1) problems.push("l'œil de l'annexe 1 retire une seule page : " + hiddenAnnex);
        const row = macroRow(macro.id);
        if (JSON.stringify(hiddenIn(row, 1)) !== JSON.stringify([String(macro.coverId)]) || JSON.stringify(hiddenIn(row, 0)) !== JSON.stringify([])) problems.push('ligne : page de garde ' + JSON.stringify(hiddenIn(row, 0)) + ', annexe 1 ' + JSON.stringify(hiddenIn(row, 1)));
        // Une ligne qui ne choisit pas ce modèle : l'annexe 1 donne « Autre page », seule la page de garde reste d'avant.
        await feedNom(h, 'a');
        const forA = await readingOf(h);
        if (countOf(forA, word) !== 1 || countOf(forA, 'Autrepage') !== 1) problems.push('ligne « a » : ' + forA);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_eye_click_writes_the_composition_only_and_keeps_the_rest_of_the_row',
    description: "Un clic sur l'œil dit son état tout de suite, écrit UNE fois la composition dans sa ligne (le modèle masqué dans sa position) sans toucher au reste (nom, nom du PDF, en-tête et pied, page), garde le focus et le même bouton, ne quitte ni le résumé ni le macro-modèle, et le coin d'état le dit ; relu depuis Grist, l'œil est toujours fermé",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil ligne');
        const problems = [];
        // Une ligne qui a des réglages, écrits par l'enregistrement automatique (vrai champ, vrai minuteur).
        const field = document.getElementById('pdf-filename-template');
        field.hidden = false;
        field.value = 'Dossier-{Nom}';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        PageLayout.setMarginsMm({ top: 31, right: 24, bottom: 26, left: 22 });
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
        await waitTicks(h, 2);
        setAutosave(false); // plus rien d'autre n'écrit : seule l'écriture de l'œil peut changer la ligne
        const before = macroRow(macro.id);
        if (before.NomFichierPDF !== 'Dossier-{Nom}') problems.push('le cas ne prouve rien, nom du PDF : ' + before.NomFichierPDF);
        const writes0 = writesNow();
        const screen0 = JSON.stringify(screenState());
        const eye = eyeOf(1, macro.otherId);
        eye.focus();
        eye.click();
        await h.sleep(40);
        const instant = eyeState(1, macro.otherId);
        if (instant.pressed !== 'true' || !instant.crossed || !instant.greyed) problems.push("l'écran ne dit pas l'état dès le clic : " + JSON.stringify(instant));
        await h.sleep(700);
        const after = macroRow(macro.id);
        const changed = Object.keys(Object.assign({}, before, after)).filter(k => k !== 'Contenu' && k !== 'DateModif' && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
        if (changed.length) problems.push('colonnes changées en plus de la composition : ' + changed.join());
        if (JSON.stringify(hiddenIn(after, 1)) !== JSON.stringify([String(macro.otherId)]) || JSON.stringify(hiddenIn(after, 0)) !== JSON.stringify([])) problems.push('composition écrite : ' + after.Contenu);
        const unchanged = composition(after).map(s => { const copy = JSON.parse(JSON.stringify(s)); delete copy.hiddenModeleIds; return copy; });
        if (JSON.stringify(unchanged) !== JSON.stringify(composition(before))) problems.push('la composition elle-même a changé : ' + after.Contenu);
        if (writesNow() - writes0 !== 1) problems.push('une seule écriture attendue : ' + (writesNow() - writes0));
        if (JSON.stringify(screenState()) !== screen0) problems.push("l'écran a changé (modèle, résumé, bandeau) : " + JSON.stringify(screenState()));
        if (document.activeElement !== eye || !document.contains(eye)) problems.push("l'œil n'a plus le focus ou a été remplacé : " + (document.activeElement && document.activeElement.className));
        const status = statusNow();
        if (status.text !== 'Modèle masqué de la Lecture et des exports : « Macro œil ligne - autre »' || status.error) problems.push('coin d\'état : ' + JSON.stringify(status));
        const cached = Templates.getCached().find(t => String(t.id) === String(macro.id));
        if (JSON.stringify((cached.macroSlots.slots[1].hiddenModeleIds || []).map(String)) !== JSON.stringify([String(macro.otherId)])) problems.push('cache des modèles : ' + JSON.stringify(cached.macroSlots.slots[1]));
        // Relu depuis Grist (le modèle est rechargé par la liste), l'œil est toujours fermé.
        await reopen(h, macro.id);
        const reread = eyeState(1, macro.otherId);
        if (!reread || reread.pressed !== 'true' || !reread.crossed || !reread.greyed) problems.push('relu depuis Grist : ' + JSON.stringify(reread));
        // Le second clic retire le masquage : la liste disparaît de la ligne, qui retrouve sa composition d'avant.
        eyeOf(1, macro.otherId).click();
        await h.sleep(700);
        const restored = macroRow(macro.id);
        if (restored.Contenu !== before.Contenu) problems.push('composition après le second clic : ' + restored.Contenu);
        if (statusNow().text !== 'Modèle de nouveau dans la Lecture et les exports : « Macro œil ligne - autre »') problems.push('coin d\'état au second clic : ' + statusNow().text);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_hidden_model_stays_hidden_through_the_window_save_and_leaves_with_its_model',
    description: "Après un œil, une relecture des modèles puis « Modifier la composition » et « Enregistrer » sans rien changer, le modèle reste masqué (le résumé reçu avant la relecture est périmé) ; changer la page de garde ou le modèle d'une règle ne laisse pas le masquage derrière le modèle retiré, et un modèle mis à sa place repart affiché ; les autres positions gardent le leur",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil fenêtre');
        setAutosave(false);
        const problems = [];
        await Templates.loadAll(); // le cache change d'objet : le résumé à l'écran (et son bouton « Modifier la composition ») en a reçu un plus ancien
        eyeOf(1, macro.otherId).click();
        await h.sleep(600);
        eyeOf(0, macro.coverId).click();
        await h.sleep(600);
        document.getElementById('btn-edit-macro').click();
        await h.sleep(250);
        document.getElementById('macro-editor-save').click();
        await h.sleep(900);
        let row = macroRow(macro.id);
        if (JSON.stringify(hiddenIn(row, 0)) !== JSON.stringify([String(macro.coverId)]) || JSON.stringify(hiddenIn(row, 1)) !== JSON.stringify([String(macro.otherId)])) problems.push('après « Enregistrer » sans changement : ' + row.Contenu);
        if (!eyeState(0, macro.coverId) || eyeState(0, macro.coverId).pressed !== 'true' || eyeState(1, macro.otherId).pressed !== 'true') problems.push('yeux après « Enregistrer » : ' + JSON.stringify([eyeState(0, macro.coverId), eyeState(1, macro.otherId)]));
        // Le modèle de la règle 1 de l'annexe 1 (masqué) est remplacé par le modèle par défaut : son masquage part avec lui, l'autre position garde le sien.
        document.getElementById('btn-edit-macro').click();
        await h.sleep(250);
        const ruleSelect = document.querySelector('#macro-editor-slots .macro-rule-modele');
        ruleSelect.value = String(macro.thirdId);
        ruleSelect.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(900);
        row = macroRow(macro.id);
        if (JSON.stringify(hiddenIn(row, 1)) !== JSON.stringify([]) || JSON.stringify(hiddenIn(row, 0)) !== JSON.stringify([String(macro.coverId)])) problems.push('après le changement de la règle 1 : ' + row.Contenu);
        if (eyeState(1, macro.thirdId) === null || eyeState(1, macro.thirdId).pressed !== 'false') problems.push('le modèle mis à la place repart affiché : ' + JSON.stringify(eyeState(1, macro.thirdId)));
        // Une autre page de garde : le masquage de l'ancienne ne la suit pas ; remettre l'ancienne ne le ressuscite pas.
        document.getElementById('btn-edit-macro').click();
        await h.sleep(250);
        const cover = document.querySelector('#macro-editor-slots .macro-doc-model');
        cover.value = String(macro.otherId);
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(900);
        row = macroRow(macro.id);
        if (JSON.stringify(hiddenIn(row, 0)) !== JSON.stringify([]) || String(composition(row)[0].modeleId) !== String(macro.otherId)) problems.push('après une autre page de garde : ' + row.Contenu);
        document.getElementById('btn-edit-macro').click();
        await h.sleep(250);
        const back = document.querySelector('#macro-editor-slots .macro-doc-model');
        back.value = String(macro.coverId);
        back.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('macro-editor-save').click();
        await h.sleep(900);
        if (JSON.stringify(hiddenIn(macroRow(macro.id), 0)) !== JSON.stringify([])) problems.push('la page de garde remise ne redevient pas masquée toute seule : ' + macroRow(macro.id).Contenu);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_eye_clicks_in_a_row_end_on_the_last_state_with_one_write_at_a_time',
    description: "Grist lent : quatre clics de suite (deux yeux, l'un trois fois, après une relecture des modèles qui croise la première écriture) font au plus deux écritures, jamais deux en même temps, et la ligne, le cache et l'écran finissent sur le dernier état demandé, sans perdre le premier masquage, même si le résumé a été redessiné entre-temps à partir d'un cache périmé ; un œil cliqué ensuite part de cette composition",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil rafale', (m, rule) => [{ type: 'conditional', rules: [rule(m.coverId, 'c')], defaultModeleId: null }]);
        setAutosave(false);
        const problems = [];
        const writes0 = writesNow();
        await Templates.loadAll(); // le cache change d'objet : celui que le résumé a reçu à l'ouverture est périmé
        window.__gristStub.setLatency({ fetchTable: 200, applyUserActions: 400 });
        window.__gristStub.resetInFlightStats();
        try {
          eyeOf(0, macro.coverId).click(); // masqué : l'écriture part
          // Dès le clic, avant toute réponse de Grist, le cache des modèles (que lisent la Lecture et les exports) dit déjà le masquage.
          const instant = Templates.getCached().find(t => String(t.id) === String(macro.id));
          if (JSON.stringify((instant.macroSlots.slots[0].hiddenModeleIds || []).map(String)) !== JSON.stringify([String(macro.coverId)])) problems.push('le cache ne dit pas le masquage dès le clic : ' + JSON.stringify(instant.macroSlots.slots[0]));
          const reread = Templates.loadAll(); // la lecture arrive avant l'écriture : elle rend l'état d'avant et remplace les objets du cache
          await reread; // ... alors que l'écriture dure encore : les clics qui suivent partent de ce que l'écran demande, pas de ce cache périmé
          // Un redessin du résumé à partir de ce cache périmé (ici un changement de langue) rouvre l'œil de la page de garde à l'écran : la fin des écritures le referme.
          I18n.setLang('en');
          await h.sleep(60);
          I18n.setLang('fr');
          await h.sleep(60);
          eyeOf(1, macro.otherId).click(); // masqué
          eyeOf(1, macro.otherId).click(); // affiché
          eyeOf(1, macro.otherId).click(); // masqué
          await h.sleep(3000);
        } finally { window.__gristStub.setLatency(0); }
        const writes = writesNow() - writes0;
        if (writes < 1 || writes > 2) problems.push('écritures : ' + writes);
        if (window.__gristStub.state.maxInFlight.applyUserActions > 1) problems.push('deux écritures en même temps : ' + window.__gristStub.state.maxInFlight.applyUserActions);
        const row = macroRow(macro.id);
        if (JSON.stringify(hiddenIn(row, 0)) !== JSON.stringify([String(macro.coverId)]) || JSON.stringify(hiddenIn(row, 1)) !== JSON.stringify([String(macro.otherId)])) problems.push('ligne : ' + row.Contenu);
        const cached = Templates.getCached().find(t => String(t.id) === String(macro.id));
        if (JSON.stringify(cached.macroSlots.slots.map(s => (s.hiddenModeleIds || []).map(String))) !== JSON.stringify([[String(macro.coverId)], [String(macro.otherId)], []])) problems.push('cache : ' + JSON.stringify(cached.macroSlots));
        if (eyeState(0, macro.coverId).pressed !== 'true' || eyeState(1, macro.otherId).pressed !== 'true' || eyeState(2, macro.coverId).pressed !== 'false') problems.push('écran : ' + JSON.stringify([eyeState(0, macro.coverId), eyeState(1, macro.otherId), eyeState(2, macro.coverId)]));
        if (statusNow().text !== 'Modèle masqué de la Lecture et des exports : « Macro œil rafale - autre »' || statusNow().error) problems.push('coin d\'état : ' + JSON.stringify(statusNow()));
        // Un œil cliqué après une relecture des modèles part de la composition à jour : les deux premiers masquages restent.
        await Templates.loadAll();
        eyeOf(2, macro.coverId).click();
        await h.sleep(700);
        const last = macroRow(macro.id);
        if (JSON.stringify([0, 1, 2].map(i => hiddenIn(last, i))) !== JSON.stringify([[String(macro.coverId)], [String(macro.otherId)], [String(macro.coverId)]])) problems.push('après un troisième œil : ' + last.Contenu);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, writes }) };
      } finally { window.__gristStub.setLatency(0); I18n.setLang('fr'); await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_eye_write_failure_puts_the_eye_back_and_says_so',
    description: "Grist refuse l'écriture : l'œil, qui s'était fermé tout de suite, se rouvre (l'écran repart de ce que Grist garde), le coin d'état dit « Échec de l'enregistrement. » en erreur, la ligne n'a pas bougé ; une fois Grist de retour, le même clic marche",
    run: async (h) => {
      const real = window.grist.docApi.applyUserActions;
      try {
        const macro = await composedMacro(h, 'Macro œil échec');
        setAutosave(false);
        const problems = [];
        const original = macroRow(macro.id).Contenu;
        window.grist.docApi.applyUserActions = actions => actions.some(a => a[0] === 'UpdateRecord' && a[1] === MACRO_TABLE) ? Promise.reject(new Error('Grist refuse (simulé)')) : real.call(window.grist.docApi, actions);
        eyeOf(1, macro.otherId).click();
        // Aussitôt, avant que Grist ait répondu (ici il refuse sur-le-champ) : l'écran dit déjà l'état demandé.
        if (eyeState(1, macro.otherId).pressed !== 'true') problems.push("l'œil ne se ferme pas tout de suite : " + JSON.stringify(eyeState(1, macro.otherId)));
        await h.sleep(900);
        const failed = eyeState(1, macro.otherId);
        if (failed.pressed !== 'false' || failed.crossed || failed.greyed) problems.push("l'œil ne se rouvre pas après l'échec : " + JSON.stringify(failed));
        if (macroRow(macro.id).Contenu !== original) problems.push('la ligne a bougé : ' + macroRow(macro.id).Contenu);
        const cached = Templates.getCached().find(t => String(t.id) === String(macro.id));
        if ((cached.macroSlots.slots[1].hiddenModeleIds || []).length) problems.push('le cache garde le masquage : ' + JSON.stringify(cached.macroSlots.slots[1]));
        if (statusNow().text !== 'Échec de l’enregistrement.' || !statusNow().error) problems.push("coin d'état : " + JSON.stringify(statusNow()));
        window.grist.docApi.applyUserActions = real;
        eyeOf(1, macro.otherId).click();
        await h.sleep(700);
        if (JSON.stringify(hiddenIn(macroRow(macro.id), 1)) !== JSON.stringify([String(macro.otherId)]) || eyeState(1, macro.otherId).pressed !== 'true') problems.push('après le retour de Grist : ' + macroRow(macro.id).Contenu);
        if (statusNow().error || !/masqué/.test(statusNow().text)) problems.push("coin d'état au second essai : " + JSON.stringify(statusNow()));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { window.grist.docApi.applyUserActions = real; await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_eye_does_nothing_for_a_read_only_person',
    description: "En lecture seule, un clic sur l'œil n'écrit rien et ne change rien à l'écran",
    run: async (h) => {
      const realGet = AccessRights.get;
      try {
        const macro = await composedMacro(h, 'Macro œil lecture seule');
        setAutosave(false);
        const problems = [];
        const writes0 = writesNow();
        const before = JSON.stringify(eyeState(1, macro.otherId));
        AccessRights.get = () => ({ readOnly: true, canExport: true, canComment: false });
        eyeOf(1, macro.otherId).click();
        await h.sleep(600);
        if (writesNow() !== writes0) problems.push('une écriture a eu lieu');
        if (JSON.stringify(eyeState(1, macro.otherId)) !== before) problems.push("l'œil a changé : " + JSON.stringify(eyeState(1, macro.otherId)));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { AccessRights.get = realGet; await leaveMacro(h); }
    },
  });

  // L'œil, son info-bulle et le coin d'état sont écrits dans la langue de la page : le même parcours en français, puis dans une page qui démarre en anglais.
  const macroEyeLanguageCase = {
    id: 'macro_eye_follows_the_language',
    description: "L'œil dit « Masquer le modèle « … » » (« Hide the template “…” » dans la page qui démarre en anglais), son info-bulle et le coin d'état suivent l'état (masqué / affiché) ; un redessin du résumé laisse le focus à l'œil sans l'ouvrir",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil langue');
        setAutosave(false);
        const problems = [];
        const name = 'Macro œil langue - garde';
        const english = I18n.getLang() === 'en';
        const want = english
          ? { label: 'Hide the template “' + name + '”', open: 'Hide “' + name + '” from Read mode and exports', hidden: '“' + name + '” is hidden from Read mode and exports: click to show it',
            status: 'Template hidden from Read mode and exports: “' + name + '”', back: 'Template back in Read mode and exports: “' + name + '”' }
          : { label: 'Masquer le modèle « ' + name + ' »', open: 'Masquer « ' + name + ' » de la Lecture et des exports', hidden: '« ' + name + ' » est masqué de la Lecture et des exports : cliquer pour l’afficher',
            status: 'Modèle masqué de la Lecture et des exports : « ' + name + ' »', back: 'Modèle de nouveau dans la Lecture et les exports : « ' + name + ' »' };
        const shown = eyeState(0, macro.coverId);
        if (shown.label !== want.label || shown.title !== want.open) problems.push('œil ouvert : ' + JSON.stringify(shown));
        eyeOf(0, macro.coverId).click();
        await h.sleep(700);
        const hiddenNow = eyeState(0, macro.coverId);
        if (hiddenNow.pressed !== 'true' || hiddenNow.label !== want.label || hiddenNow.title !== want.hidden) problems.push('œil fermé : ' + JSON.stringify(hiddenNow));
        if (statusNow().text !== want.status) problems.push('coin d\'état : ' + statusNow().text);
        // Le résumé redessiné (ici par un changement de mise en page) laisse le focus à l'œil qui l'avait : le clavier ne repart pas du début de la page.
        const eyeBefore = eyeOf(0, macro.coverId);
        eyeBefore.focus();
        document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
        await h.sleep(200);
        if (eyeOf(0, macro.coverId) === eyeBefore) problems.push('le résumé n\'a pas été redessiné');
        const focused = document.activeElement;
        if (!focused || !focused.classList.contains('macro-summary-eye') || focused.dataset.slot !== '0' || String(focused.dataset.templateId) !== String(macro.coverId)) problems.push('le focus de l\'œil ne survit pas au redessin du résumé : ' + (focused && (focused.className + ' ' + focused.dataset.slot)));
        const redrawn = eyeState(0, macro.coverId);
        if (redrawn.pressed !== 'true' || redrawn.label !== want.label || redrawn.title !== want.hidden) problems.push('œil fermé après le redessin : ' + JSON.stringify(redrawn));
        eyeOf(0, macro.coverId).click();
        await h.sleep(700);
        if (statusNow().text !== want.back) problems.push('coin d\'état au second clic : ' + statusNow().text);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  };
  cases.push(macroEyeLanguageCase, Object.assign({}, macroEyeLanguageCase, {
    id: 'macro_eye_speaks_english_in_an_english_page',
    lang: 'en',
    description: "Page qui démarre en anglais : l'œil dit « Hide the template “…” », son info-bulle et le coin d'état suivent l'état (masqué / affiché), en anglais",
  }));

  cases.push({
    id: 'macro_eye_batch_zip_leaves_the_hidden_model_out_row_by_row',
    description: "ZIP de PDF, une ligne après l'autre : le modèle masqué de l'annexe 1 manque à la ligne dont une règle le choisit (sans que la règle suivante ou le modèle par défaut prenne sa place), les autres lignes gardent leurs annexes",
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro œil lot');
        setAutosave(false);
        const stub = window.__gristStub;
        const rows = [{ id: 1, Nom: 'a' }, { id: 2, Nom: 'b' }, { id: 3, Nom: 'z' }];
        stub.setVariables(PAGE_DATA, { Nom: 'Text' });
        stub.setRows(PAGE_DATA, rows);
        await GristAPI.refreshSchema();
        stub.fireRecord(rows[0], PAGE_DATA);
        await h.sleep(100);
        eyeOf(1, macro.otherId).click(); // « Autre page » : l'annexe de la ligne « a »
        await h.sleep(700);
        const problems = [];
        const file = await fileDownloaded(h, 'v2-btn-export-pdf-batch');
        if (!file || !file.blob) return { pass: false, notes: 'aucun ZIP téléchargé' };
        await ExportCommon.ensureJsZipLoaded();
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const texts = {};
        for (const name of Object.keys(zip.files)) texts[name] = (await pdfPages(h, await zip.file(name).async('blob'))).map(p => squashed(p.text));
        // Sans nom réglé : le nom du macro-modèle puis celui de la ligne (audit confort du 12/11, idée 1).
        const names = ['Macro œil lot - a.pdf', 'Macro œil lot - b.pdf', 'Macro œil lot - z.pdf'];
        if (Object.keys(texts).length !== 3 || !names.every(n => texts[n])) return { pass: false, notes: 'fichiers : ' + JSON.stringify(Object.keys(texts)) };
        const pages = n => texts[n].map(t => ['Pagedegarde', 'Autrepage', 'Pagepardéfaut'].filter(w => t.includes(w)).join('+'));
        // Ligne « a » : annexe 1 = « Autre page », masquée : rien à sa place. Ligne « b » : son annexe est le modèle de la page de garde (autre position). Ligne « z » : modèle par défaut.
        if (JSON.stringify(pages(names[0])) !== JSON.stringify(['Pagedegarde'])) problems.push('ligne a : ' + JSON.stringify(pages(names[0])));
        if (JSON.stringify(pages(names[1])) !== JSON.stringify(['Pagedegarde', 'Pagedegarde'])) problems.push('ligne b : ' + JSON.stringify(pages(names[1])));
        if (JSON.stringify(pages(names[2])) !== JSON.stringify(['Pagedegarde', 'Pagepardéfaut'])) problems.push('ligne z : ' + JSON.stringify(pages(names[2])));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_save_as_copy_keeps_the_hidden_models',
    description: "« Enregistrer sous… » d'un macro-modèle dont un modèle est masqué en fait une copie qui garde le masquage (même composition, œil fermé à l'écran)",
    run: async (h) => {
      const dialogs = h.stubDialogs({ prompt: 'Copie œil' });
      try {
        const macro = await composedMacro(h, 'Macro œil copie');
        setAutosave(false);
        eyeOf(1, macro.otherId).click();
        await h.sleep(700);
        const problems = [];
        const rowsBefore = window.__gristStub.state.rows[MACRO_TABLE].id.slice();
        document.getElementById('v2-btn-save-as').click();
        await h.sleep(900);
        const copyId = window.__gristStub.state.rows[MACRO_TABLE].id.find(x => !rowsBefore.includes(x));
        const copy = copyId != null ? macroRow(copyId) : null;
        if (!copy || copy.Nom !== 'Copie œil') problems.push('copie absente : ' + JSON.stringify(copy && copy.Nom));
        else if (copy.Contenu !== macroRow(macro.id).Contenu || JSON.stringify(hiddenIn(copy, 1)) !== JSON.stringify([String(macro.otherId)])) problems.push('composition de la copie : ' + copy.Contenu);
        const onScreen = eyeState(1, macro.otherId);
        if (!onScreen || onScreen.pressed !== 'true') problems.push("œil de la copie à l'écran : " + JSON.stringify(onScreen));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { dialogs.restore(); await leaveMacro(h); }
    },
  });

  // --- Les étiquettes « Grille » et « Paysage » du résumé (14/10, carte « Écrire « Paysage » ou « Grille » à côté des modèles, dans le résumé du macro-modèle ? », réponse « Oui, dans le résumé ») -----------------------
  // Une étiquette à droite du nom de chaque modèle qui n'est pas un document en portrait (js/macro-editor.js:modelTags), pas dans les listes de choix. « Paysage » ne se dit que quand le macro-modèle suit chaque modèle :
  // sous un sens imposé, tous ses modèles ont la page du macro-modèle et l'étiquette mentirait. Ce que la souris mesure à 700×400 (place, coupe d'un nom long, contraste) est dans le script Node macroPageAutoMouse.
  cases.push({
    id: 'macro_summary_tags_grid_and_landscape_models_next_to_their_name',
    description: 'Le résumé d\'un macro-modèle écrit « Grille » et « Paysage » à droite du nom des modèles qui ne sont pas un document en portrait (une Grille en paysage : les deux, dans cet ordre ; rien pour un document en portrait ni pour un modèle introuvable), entre le nom et le stylo ; « Paysage » seulement sous « Selon chaque modèle » (le menu Page du macro-modèle le suit sans attendre l\'enregistrement ; un macro-modèle à sens imposé n\'en dit pas), « Grille » partout ; un modèle masqué garde ses étiquettes ; anglais ; les listes de la fenêtre de composition n\'en portent pas',
    run: async (h) => {
      try {
        const nom = 'Macro étiquettes';
        const macro = await loadedMacro(h, nom);
        const table = '<table style="width: 200px;"><colgroup><col style="width: 200px;"></colgroup><tbody><tr data-row-height="28" style="height: 28px"><td colwidth="200"><p>Grille</p></td></tr></tbody></table>';
        const sideways = { top: 10, right: 10, bottom: 10, left: 10, orientation: 'landscape', format: 'A4' };
        const wide = await Templates.save(null, nom + ' - paysage', '<p>Large</p>', '', null, sideways, 'document', null);
        const grid = await Templates.save(null, nom + ' - grille', table, '', null, null, 'grille', null);
        const wideGrid = await Templates.save(null, nom + ' - grille paysage', table, '', null, sideways, 'grille', null);
        const rule = (modeleId, value) => ({ column: 'Nom', operator: '=', value, modeleId });
        const slots = [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'conditional', rules: [rule(wide.id, 'a'), rule(grid.id, 'b')], defaultModeleId: wideGrid.id },
          { type: 'conditional', rules: [rule(987654, 'c')], defaultModeleId: null },
        ];
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.id, { Contenu: JSON.stringify({ slots }) });
        await reopen(h, macro.id);
        const problems = [];
        // Chaque modèle du résumé : son nom, ses étiquettes dans l'ordre où elles se lisent, l'ordre de ses éléments (nom, étiquettes, stylo, œil) et la place des étiquettes (à droite du nom, avant le stylo).
        const entries = () => Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-model')).map(entry => {
          const rect = el => el.getBoundingClientRect();
          const name = entry.querySelector('.macro-summary-model-name'), pencil = entry.querySelector('.macro-summary-edit');
          const tags = Array.from(entry.querySelectorAll('.macro-summary-model-tag'));
          return {
            name: name.textContent, tags: tags.map(t => t.textContent).join('+'),
            shape: Array.from(entry.children).map(c => c.className.split(' ')[0].replace('macro-summary-', '')).join(' '),
            placed: tags.every(t => rect(t).width > 0 && rect(t).left >= rect(name).right - .5 && rect(t).right <= rect(pencil).left + .5),
          };
        });
        const names = [nom + ' - garde', nom + ' - paysage', nom + ' - grille', nom + ' - grille paysage', 'modèle introuvable'];
        const check = (where, tags) => {
          const now = entries();
          const got = JSON.stringify(now.map(e => [e.name, e.tags]));
          const wanted = JSON.stringify(names.map((name, i) => [name, tags[i]]));
          if (got !== wanted) problems.push(where + ' : ' + got + ' (attendu ' + wanted + ')');
          const shapeOf = e => 'model-name' + ' model-tag'.repeat(e.tags ? e.tags.split('+').length : 0) + ' edit eye';
          if (now.some(e => e.shape !== shapeOf(e))) problems.push(where + ', éléments de chaque modèle : ' + JSON.stringify(now.map(e => e.shape)));
          if (now.some(e => !e.placed)) problems.push(where + ', étiquette hors de sa place (à droite du nom, avant le stylo) : ' + JSON.stringify(now.filter(e => !e.placed).map(e => e.name)));
        };
        const following = ['', 'Paysage', 'Grille', 'Grille+Paysage', ''];
        const imposed = ['', '', 'Grille', 'Grille', ''];
        if (pageChecked() !== 'auto,A4') problems.push('le macro-modèle neuf n\'est pas « Selon chaque modèle » : ' + pageChecked());
        check('selon chaque modèle', following);
        // Le menu Page du macro-modèle : un sens imposé retire « Paysage » tout de suite (pas d'enregistrement entre-temps), « Selon chaque modèle » le rend.
        await pickPage(h, 'portrait');
        check('portrait imposé', imposed);
        await pickPage(h, 'landscape');
        check('paysage imposé', imposed);
        await pickPage(h, 'auto');
        check('« Selon chaque modèle » rétabli', following);
        // Un modèle masqué par son œil garde ses étiquettes (il se grise, rien ne disparaît).
        eyeOf(1, wide.id).click();
        await h.sleep(700);
        const hidden = eyeState(1, wide.id);
        if (!hidden || hidden.pressed !== 'true' || !hidden.greyed) problems.push('l\'œil du modèle en paysage ne l\'a pas masqué : ' + JSON.stringify(hidden));
        check('modèle masqué', following);
        eyeOf(1, wide.id).click();
        await h.sleep(700);
        // L'anglais : « Landscape », « Grid » (le résumé écrit ses étiquettes quand il se bâtit, dans la langue de la page : on le rouvre).
        I18n.setLang('en');
        await reopen(h, macro.id);
        const english = entries().map(e => [e.name, e.tags]);
        if (JSON.stringify(english.map(e => e[1])) !== JSON.stringify(['', 'Landscape', 'Grid', 'Grid+Landscape', ''])) problems.push('anglais : ' + JSON.stringify(english));
        I18n.setLang('fr');
        await reopen(h, macro.id);
        // Un macro-modèle fait avant « Selon chaque modèle » (sa ligne n'en dit rien) a un sens imposé : « Paysage » n'y est dit nulle part, même devant un modèle en paysage ; « Grille » y reste.
        await waitTicks(h, 2);
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.id, { Margins: storedMargins({}) });
        await reopen(h, macro.id);
        if (pageChecked() !== 'portrait,A4') problems.push('le macro-modèle d\'avant n\'est pas en sens imposé : ' + pageChecked());
        check('macro-modèle d\'avant « Selon chaque modèle » (sens imposé)', imposed);
        // Les listes de la fenêtre de composition ne portent pas d'étiquette (« Oui, dans le résumé », pas « partout »).
        MacroEditor.openModal(Templates.byId(macro.id));
        await h.sleep(200);
        const listed = Array.from(document.querySelectorAll('#macro-editor-slots .macro-doc-model option, #macro-editor-slots .macro-slot-default-select option')).map(o => o.textContent);
        if (!listed.some(text => text.includes(nom + ' - grille paysage'))) problems.push('la liste de la fenêtre n\'a pas le modèle attendu : ' + JSON.stringify(listed.slice(0, 6)));
        if (listed.some(text => /Paysage|Grille/.test(text))) problems.push('une liste de la fenêtre de composition porte une étiquette : ' + JSON.stringify(listed.filter(text => /Paysage|Grille/.test(text))));
        document.getElementById('macro-editor-cancel').click();
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { I18n.setLang('fr'); await leaveMacro(h); }
    },
  });

  // --- Les présentations dans le résumé (22/10, lot 4 : pages de deux formats dans un macro-modèle) ---------------------------------------------------------------------------------------------------------
  // Une présentation s'assemble comme un document (son contenu enregistré, sans l'extension « Diapositives » de Grist Factory Suite) : le résumé l'étiquette « Diapositives » (avant « Paysage », sa page de
  // diapositive est en paysage tant qu'elle n'a pas un autre sens), et son stylo est grisé, avec la raison, tant que l'extension est éteinte - elle ne s'ouvre pas, comme dans la liste des modèles.
  cases.push({
    id: 'macro_summary_tags_presentations_and_greys_their_pencil_while_the_extension_is_off',
    description: 'Le résumé d\'un macro-modèle écrit « Diapositives » à droite du nom d\'une présentation (avant « Paysage », que sa page de diapositive porte sous « Selon chaque modèle » ; pas de « Paysage » pour une présentation enregistrée en A4 portrait ni sous un sens imposé) ; anglais ; son stylo est grisé avec la raison tant que l\'extension est éteinte (un clic ne l\'ouvre pas) et vivant une fois l\'extension allumée ; celui d\'un document reste vivant',
    run: async (h) => {
      const declare = active => Templates.declareExtensionType('presentation', Extensions.nameOf('diapositives'), active);
      try {
        const nom = 'Macro diapositives';
        const macro = await loadedMacro(h, nom);
        const deck = '<h1>Une</h1><div class="page-break-marker" contenteditable="false" data-slide-break="">Saut de page</div><h1>Deux</h1>';
        const slides = await Templates.save(null, nom + ' - diapos', deck, '', null, null, 'presentation', null);
        const upright = await Templates.save(null, nom + ' - diapos A4', deck, '', null, { top: 10, right: 10, bottom: 10, left: 10, orientation: 'portrait', format: 'A4' }, 'presentation', null);
        const rule = (modeleId, value) => ({ column: 'Nom', operator: '=', value, modeleId });
        const slots = [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'conditional', rules: [rule(upright.id, 'a')], defaultModeleId: slides.id },
        ];
        window.__gristStub.remoteWrite(MACRO_TABLE, macro.id, { Contenu: JSON.stringify({ slots }) });
        await reopen(h, macro.id);
        const problems = [];
        const names = [nom + ' - garde', nom + ' - diapos A4', nom + ' - diapos'];
        const entries = () => Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-model')).map(entry => {
          const pencil = entry.querySelector('.macro-summary-edit');
          return { name: entry.querySelector('.macro-summary-model-name').textContent, tags: Array.from(entry.querySelectorAll('.macro-summary-model-tag')).map(t => t.textContent).join('+'), disabled: pencil.disabled, title: pencil.title };
        });
        // L'étiquette « Paysage » d'une présentation vient de sa page : tant que la liste ne l'a pas lue (lecture légère de la table, js/templates.js : lue à la demande, le résumé se redessine à son arrivée), elle n'y est
        // pas encore ; une machine chargée (le groupe joué avec d'autres) la fait venir après le sommeil de `reopen`. On attend donc jusqu'à 5 s que le résumé dise ce qu'on attend, au lieu de le lire à l'instant.
        const tagsAre = async (where, tags) => {
          const read = () => JSON.stringify(entries().map(e => [e.name, e.tags]));
          const wanted = JSON.stringify(names.map((name, i) => [name, tags[i]]));
          const until = Date.now() + 5000;
          while (read() !== wanted && Date.now() < until) await h.sleep(100);
          const got = read();
          if (got !== wanted) problems.push(where + ' : ' + got + ' (attendu ' + wanted + ')');
        };
        if (pageChecked() !== 'auto,A4') problems.push('le macro-modèle neuf n\'est pas « Selon chaque modèle » : ' + pageChecked());
        await tagsAre('selon chaque modèle', ['', 'Diapositives', 'Diapositives+Paysage']);
        await pickPage(h, 'portrait');
        await tagsAre('portrait imposé', ['', 'Diapositives', 'Diapositives']);
        await pickPage(h, 'auto');
        await tagsAre('« Selon chaque modèle » rétabli', ['', 'Diapositives', 'Diapositives+Paysage']);
        // Le stylo : celui du document vit, ceux des deux présentations sont grisés avec la raison de la liste des modèles ; un clic ne quitte pas le macro-modèle.
        const reason = Templates.unavailableText('presentation');
        const off = entries();
        if (!reason || !reason.includes(Extensions.nameOf('diapositives'))) problems.push('la raison de la liste des modèles : « ' + reason + ' »');
        if (off[0].disabled || off[0].title === reason) problems.push('le stylo du document est grisé : ' + JSON.stringify(off[0]));
        off.slice(1).forEach(e => { if (!e.disabled || e.title !== reason) problems.push('le stylo de « ' + e.name + ' » n\'est pas grisé avec la raison : ' + JSON.stringify({ disabled: e.disabled, title: e.title })); });
        document.querySelectorAll('#macro-summary-parts .macro-summary-edit')[1].click();
        await h.sleep(300);
        if (String(Templates.getCurrentId()) !== String(macro.id)) problems.push('un clic sur le stylo grisé ouvre un autre modèle : ' + Templates.getCurrentId());
        // L'extension allumée : les stylos vivent, avec le libellé des autres.
        declare(() => true);
        await reopen(h, macro.id);
        const on = entries();
        if (on.some(e => e.disabled)) problems.push('extension allumée, un stylo reste grisé : ' + JSON.stringify(on.map(e => [e.name, e.disabled])));
        if (on[1].title !== on[0].title.replace(names[0], names[1])) problems.push('extension allumée, le libellé du stylo d\'une présentation : « ' + on[1].title + ' » (document : « ' + on[0].title + ' »)');
        await tagsAre('extension allumée', ['', 'Diapositives', 'Diapositives+Paysage']);
        declare(() => Extensions.isActive('diapositives'));
        // L'anglais : « Slides », « Landscape » et la raison dite dans la langue de la page.
        I18n.setLang('en');
        await reopen(h, macro.id);
        const english = entries();
        if (JSON.stringify(english.map(e => e.tags)) !== JSON.stringify(['', 'Slides', 'Slides+Landscape'])) problems.push('anglais : ' + JSON.stringify(english.map(e => [e.name, e.tags])));
        if (english[2].title !== Templates.unavailableText('presentation') || !/extension/i.test(english[2].title) || /Demande/.test(english[2].title)) problems.push('anglais, la raison du stylo : « ' + english[2].title + ' »');
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally {
        declare(() => Extensions.isActive('diapositives'));
        I18n.setLang('fr');
        await leaveMacro(h);
      }
    },
  });

  // --- La condition de chaque document (24/11, demande d'Antoine : « ne plus avoir le fonctionnement par page de garde, mais pouvoir mettre des conditions sur chaque document ») ---
  // Un macro-modèle est une liste de documents : chacun est inclus toujours, ou seulement si sa condition (`condition` : { mode, rules }, la même que celle d'une bulle conditionnelle : Et / Ou, groupes, autre colonne)
  // est remplie pour la ligne. Les macro-modèles d'avant (une page de garde puis des annexes) s'ouvrent tels quels : la page de garde est leur premier document, toujours inclus.
  // Le moteur (MacroTemplates.pickModeleId, buildConcatenatedHtml) est testé sans DOM ; la fenêtre, le résumé, la Lecture et le ZIP par les vrais gestes.
  const COND_TEXTS = { cover: 'Pagedegarde', other: 'Autrepage', third: 'Pagepardéfaut' };
  const whenCond = (...rules) => ({ mode: 'all', rules });
  const ruleOn = (column, operator, value) => ({ column, operator, value });
  const pickOn = (slot, record) => MacroTemplates.pickModeleId(slot, 'Dossiers', record);

  cases.push({
    id: 'macro_condition_includes_the_document_only_when_the_condition_holds',
    description: 'pickModeleId : un document avec condition ne sort que pour la ligne qui la remplit (null sinon) ; sans condition il sort toujours, comme avant',
    run: async () => {
      const problems = [];
      const slot = { type: 'fixed', modeleId: '42', condition: whenCond(ruleOn('Statut', '=', 'Urgent')) };
      if (await pickOn(slot, { id: 1, Statut: 'Urgent' }) !== '42') problems.push('ligne qui remplit la condition');
      if (await pickOn(slot, { id: 2, Statut: 'Normal' }) !== null) problems.push('ligne qui ne la remplit pas');
      if (await pickOn(slot, { id: 3 }) !== null) problems.push('ligne sans la colonne');
      if (await pickOn({ type: 'fixed', modeleId: '42' }, { id: 4, Statut: 'Normal' }) !== '42') problems.push('document sans condition');
      if (await pickOn({ type: 'fixed', modeleId: '42', condition: null }, { id: 5 }) !== '42') problems.push('condition nulle');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_condition_combines_and_or_groups_and_another_column',
    description: 'La condition d\'un document se lit comme celle d\'une bulle : « toutes » ou « au moins une », un groupe (« A et (B ou C) »), la comparaison à une autre colonne de la ligne',
    run: async () => {
      const problems = [];
      const all = { type: 'fixed', modeleId: 'x', condition: whenCond(ruleOn('Statut', '=', 'Urgent'), ruleOn('Montant', '>', '100')) };
      const any = { type: 'fixed', modeleId: 'x', condition: { mode: 'any', rules: [ruleOn('Statut', '=', 'Urgent'), ruleOn('Montant', '>', '100')] } };
      const grouped = { type: 'fixed', modeleId: 'x', condition: whenCond(ruleOn('Statut', '=', 'Urgent'), { mode: 'any', rules: [ruleOn('Montant', '>', '100'), ruleOn('Nom', 'contient', 'A')] }) };
      const versus = { type: 'fixed', modeleId: 'x', condition: whenCond({ column: 'Montant', operator: '>', value: '', valueColumn: 'Seuil' }) };
      const rows = {
        urgentBig: { id: 1, Statut: 'Urgent', Montant: 500, Nom: 'Zed', Seuil: 1000 },
        urgentSmallA: { id: 2, Statut: 'Urgent', Montant: 5, Nom: 'Ada', Seuil: 1 },
        urgentSmall: { id: 3, Statut: 'Urgent', Montant: 5, Nom: 'Zed', Seuil: 1 },
        normalBig: { id: 4, Statut: 'Normal', Montant: 500, Nom: 'Ada', Seuil: 1000 },
      };
      const verdicts = async slot => (await Promise.all(Object.values(rows).map(row => pickOn(slot, row)))).map(v => v === 'x');
      const same = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(name + ' : ' + JSON.stringify(got)); };
      same('toutes', await verdicts(all), [true, false, false, false]);
      same('au moins une', await verdicts(any), [true, true, true, true]);
      same('A et (B ou C)', await verdicts(grouped), [true, true, false, false]);
      same('autre colonne', await verdicts(versus), [false, true, true, false]);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_condition_without_a_complete_rule_keeps_the_document_and_an_unreadable_column_leaves_it_out',
    description: 'Une condition sans règle complète n\'en est pas une (le document reste, comme avant) ; une règle sur une colonne que la ligne n\'a pas n\'est pas remplie : le document sort de l\'assemblage, sans erreur',
    run: async () => {
      const problems = [];
      const record = { id: 1, Statut: 'Urgent' };
      if (await pickOn({ type: 'fixed', modeleId: 'x', condition: whenCond(ruleOn('', '=', '')) }, record) !== 'x') problems.push('règle vide');
      if (await pickOn({ type: 'fixed', modeleId: 'x', condition: { mode: 'all', rules: [] } }, record) !== 'x') problems.push('aucune règle');
      if (await pickOn({ type: 'fixed', modeleId: 'x', condition: whenCond(ruleOn('Inexistante', '=', 'oui')) }, record) !== null) problems.push('colonne absente de la ligne');
      if (await pickOn({ type: 'fixed', modeleId: 'x', condition: whenCond(ruleOn('Statut', '=', 'Urgent'), ruleOn('Inexistante', '=', 'oui')) }, record) !== null) problems.push('une règle remplie et une illisible');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_condition_on_a_position_chosen_by_the_row_and_the_hidden_eye',
    description: 'La condition d\'une position qui choisit son modèle selon la ligne vaut avant le choix (condition fausse : rien, même si une règle correspond) ; un modèle masqué par son œil reste masqué que la condition soit remplie ou non',
    run: async () => {
      const problems = [];
      const byRow = condition => ({ type: 'conditional', rules: [ruleOn('Statut', '=', 'Urgent')].map(r => Object.assign(r, { modeleId: 'urgent' })), defaultModeleId: 'defaut', condition });
      const record = { id: 1, Statut: 'Urgent', Montant: 500 };
      if (await pickOn(byRow(whenCond(ruleOn('Montant', '>', '100'))), record) !== 'urgent') problems.push('condition remplie : la règle choisit');
      if (await pickOn(byRow(whenCond(ruleOn('Montant', '>', '1000'))), record) !== null) problems.push('condition non remplie : ni règle ni défaut');
      if (await pickOn(byRow(undefined), record) !== 'urgent') problems.push('sans condition : comme avant');
      const hidden = condition => ({ type: 'fixed', modeleId: 'm', hiddenModeleIds: ['m'], condition });
      if (await pickOn(hidden(whenCond(ruleOn('Statut', '=', 'Urgent'))), record) !== null) problems.push('masqué, condition remplie');
      if (await pickOn(hidden(whenCond(ruleOn('Statut', '=', 'Normal'))), record) !== null) problems.push('masqué, condition non remplie');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_condition_build_leaves_documents_out_row_by_row_without_a_stray_page_break',
    description: 'buildConcatenatedHtml : chaque ligne a son assemblage - le premier document sorti ne laisse pas de saut de page devant, les suivants gardent leur rang (saut n° 1, n° 2…), un document sans condition est toujours là',
    run: async () => {
      const problems = [];
      const templates = [{ id: 'g', contenu: '<p>GARDE</p>' }, { id: 'u', contenu: '<p>URGENT</p>' }, { id: 'c', contenu: '<p>CONTRAT</p>' }];
      const slots = { slots: [
        { type: 'fixed', modeleId: 'u', condition: whenCond(ruleOn('Statut', '=', 'Urgent')) },
        { type: 'fixed', modeleId: 'g' },
        { type: 'fixed', modeleId: 'c', condition: whenCond(ruleOn('Montant', '>', '100')) },
      ] };
      const build = record => MacroTemplates.buildConcatenatedHtml(slots, 'Dossiers', record, templates);
      const wanted = [
        [{ id: 1, Statut: 'Urgent', Montant: 50 }, '<p>URGENT</p>' + MacroTemplates.slotBreakHtml(1) + '<p>GARDE</p>'],
        [{ id: 2, Statut: 'Normal', Montant: 500 }, '<p>GARDE</p>' + MacroTemplates.slotBreakHtml(1) + '<p>CONTRAT</p>'],
        [{ id: 3, Statut: 'Normal', Montant: 5 }, '<p>GARDE</p>'],
        [{ id: 4, Statut: 'Urgent', Montant: 500 }, '<p>URGENT</p>' + MacroTemplates.slotBreakHtml(1) + '<p>GARDE</p>' + MacroTemplates.slotBreakHtml(2) + '<p>CONTRAT</p>'],
      ];
      for (const [record, expected] of wanted) {
        const html = await build(record);
        if (html !== expected) problems.push('ligne ' + record.id + ' : ' + html);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  // --- La fenêtre de composition : une carte par document, dans l'ordre ---
  const cardsOf = () => Array.from(document.querySelectorAll('#macro-editor-slots .macro-slot-card'));
  const cardView = card => ({
    kind: card.dataset.kind,
    title: card.querySelector('.macro-slot-title').textContent,
    byRowTag: (card.querySelector('.macro-slot-kind') || {}).textContent || null,
    model: card.querySelector('select.macro-doc-model') ? card.querySelector('select.macro-doc-model').value : null,
    when: card.querySelector('select.macro-doc-when') ? card.querySelector('select.macro-doc-when').value : null,
    conditionShown: card.querySelector('.macro-doc-condition') ? !card.querySelector('.macro-doc-condition').hidden : null,
    up: card.querySelector('.macro-slot-move-up').disabled,
    down: card.querySelector('.macro-slot-move-down').disabled,
    rules: card.querySelectorAll('.macro-slot-rules .macro-rule-row').length,
  });
  const setSelect = (select, value) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
  // Une règle de la condition d'un document, remplie comme la personne : la colonne dans la liste, l'opérateur, la valeur saisie.
  async function fillRule(h, row, column, operator, value) {
    setSelect(row.querySelector('select.macro-rule-column:not(.macro-rule-value-column)'), column);
    await h.sleep(80);
    const op = Array.from(row.querySelectorAll('select')).find(s => s.options.length === ConditionRules.OPERATORS.length && s.options[0].value === '=');
    if (operator && op) setSelect(op, operator);
    const input = row.querySelector('input.macro-rule-value');
    if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  async function feedColumns(h, row) {
    const stub = window.__gristStub;
    stub.setVariables(PAGE_DATA, { Nom: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setRows(PAGE_DATA, [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(row, PAGE_DATA);
    await h.sleep(100);
  }
  async function recomposed(h, macro, slots) {
    window.__gristStub.remoteWrite(MACRO_TABLE, macro.id, { Contenu: JSON.stringify({ slots }) });
    await reopen(h, macro.id);
  }
  const savedSlots = id => (composition(macroRow(id)) || []);
  const saveWindow = async h => { document.getElementById('macro-editor-save').click(); await h.sleep(900); };
  const openWindow = async h => { document.getElementById('btn-edit-macro').click(); await h.sleep(300); };

  cases.push({
    id: 'macro_editor_opens_a_legacy_composition_as_documents_and_saves_it_unchanged',
    description: 'Un macro-modèle fait d\'une page de garde et d\'annexes s\'ouvre en cartes « Document 1, 2… » dans le même ordre (la page de garde est le premier document, toujours inclus ; l\'annexe garde ses règles et son modèle par défaut, sous « Modèle : Choisi selon la ligne ») ; « Enregistrer » sans rien toucher réécrit la même composition, sans condition',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro ancienne');
        setAutosave(false);
        const problems = [];
        const before = macroRow(macro.id).Contenu;
        await openWindow(h);
        const views = cardsOf().map(cardView);
        const want = [
          { kind: 'document', title: 'Document 1', byRowTag: null, model: String(macro.coverId), when: 'always', conditionShown: false, up: true, down: false, rules: 0 },
          { kind: 'by-row', title: 'Document 2', byRowTag: 'choisi selon la ligne', model: '__by-row__', when: 'always', conditionShown: false, up: false, down: true, rules: 2 },
        ];
        if (JSON.stringify(views) !== JSON.stringify(want)) problems.push('cartes : ' + JSON.stringify(views));
        if (document.getElementById('macro-editor-cover') || document.querySelector('#macro-editor-modal .macro-editor-slots-header').textContent !== 'Documents') problems.push('la page de garde a encore sa liste à part');
        if (document.getElementById('macro-editor-add-document').textContent !== '+ Ajouter un document' || document.getElementById('macro-editor-add-slot').textContent !== '+ Ajouter un document choisi selon la ligne') problems.push('boutons d\'ajout');
        await saveWindow(h);
        const norm = text => JSON.stringify(JSON.parse(text).slots.map(s => s.type === 'fixed'
          ? [s.type, String(s.modeleId), s.condition || null, s.hiddenModeleIds || null]
          : [s.type, (s.rules || []).map(r => [r.column, r.operator, r.value, String(r.modeleId)]), s.defaultModeleId == null ? null : String(s.defaultModeleId), s.condition || null, s.hiddenModeleIds || null]));
        if (norm(macroRow(macro.id).Contenu) !== norm(before)) problems.push('composition réécrite : ' + macroRow(macro.id).Contenu + ' / avant : ' + before);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_new_macro_opens_on_one_empty_document',
    description: 'Un macro-modèle neuf s\'ouvre sur un premier document à choisir ; « + Ajouter un document » en ajoute un, « + Ajouter un document choisi selon la ligne » une position à règles ; un document sans modèle n\'est pas enregistré',
    run: async (h) => {
      try {
        setAutosave(true);
        await h.clickButton('btn-new');
        await h.sleep(300);
        const a = await Templates.save(null, 'Neuf - A', '<p>A</p>', '', null, null, 'document', null);
        const b = await Templates.save(null, 'Neuf - B', '<p>B</p>', '', null, null, 'document', null);
        await Templates.loadAll();
        const problems = [];
        MacroEditor.openModal(null);
        if (JSON.stringify(cardsOf().map(c => [cardView(c).kind, cardView(c).model])) !== JSON.stringify([['document', '']])) problems.push('à l\'ouverture : ' + JSON.stringify(cardsOf().map(cardView)));
        document.getElementById('macro-editor-add-document').click();
        document.getElementById('macro-editor-add-slot').click();
        await h.sleep(60);
        if (JSON.stringify(cardsOf().map(c => cardView(c).kind)) !== JSON.stringify(['document', 'document', 'by-row'])) problems.push('après les ajouts : ' + JSON.stringify(cardsOf().map(cardView)));
        const models = Array.from(document.querySelectorAll('#macro-editor-slots select.macro-doc-model'));
        setSelect(models[1], String(b.id));
        document.getElementById('macro-editor-name').value = 'Macro neuve';
        await saveWindow(h);
        const id = Templates.getCurrentId();
        const slots = savedSlots(id);
        if (slots.length !== 2 || slots[0].type !== 'fixed' || String(slots[0].modeleId) !== String(b.id) || slots[1].type !== 'conditional') problems.push('composition : ' + JSON.stringify(slots));
        void a;
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_document_condition_is_saved_under_only_if_and_dropped_under_always',
    description: 'Sous « Seulement si… » le document porte la condition réglée dans sa carte (colonne, opérateur, valeur), écrite dans la ligne Grist ; la rouvrir la montre ; revenir à « Toujours » l\'efface de la ligne mais la garde en brouillon tant que la fenêtre reste ouverte',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro condition');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        await openWindow(h);
        const first = () => cardsOf()[0];
        setSelect(first().querySelector('select.macro-doc-when'), 'if');
        await h.sleep(100);
        if (first().querySelector('.macro-doc-condition').hidden) problems.push('la condition ne s\'affiche pas sous « Seulement si… »');
        await fillRule(h, first().querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        await saveWindow(h);
        const saved = savedSlots(macro.id)[0];
        if (!saved || saved.type !== 'fixed' || String(saved.modeleId) !== String(macro.coverId) || JSON.stringify(saved.condition) !== JSON.stringify({ mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] })) problems.push('première écriture : ' + JSON.stringify(saved));
        // Rouverte : la carte la montre.
        await openWindow(h);
        const view = cardView(first());
        const row = first().querySelector('.macro-doc-rules .macro-rule-row');
        if (view.when !== 'if' || !view.conditionShown || !row || row.querySelector('select.macro-rule-column').value !== 'Statut' || (row.querySelector('input.macro-rule-value') || {}).value !== 'Urgent') problems.push('fenêtre rouverte : ' + JSON.stringify(view));
        // « Toujours » : plus de condition écrite, mais le brouillon revient si l'on change d'avis.
        setSelect(first().querySelector('select.macro-doc-when'), 'always');
        await h.sleep(50);
        if (!first().querySelector('.macro-doc-condition').hidden) problems.push('la condition reste affichée sous « Toujours »');
        setSelect(first().querySelector('select.macro-doc-when'), 'if');
        await h.sleep(50);
        const draft = first().querySelector('.macro-doc-rules .macro-rule-row input.macro-rule-value');
        if (!draft || draft.value !== 'Urgent') problems.push('le brouillon n\'est pas revenu : ' + (draft && draft.value));
        setSelect(first().querySelector('select.macro-doc-when'), 'always');
        await saveWindow(h);
        const cleared = savedSlots(macro.id)[0];
        if (!cleared || 'condition' in cleared) problems.push('« Toujours » écrit encore une condition : ' + JSON.stringify(cleared));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_incomplete_condition_says_so_and_is_not_saved',
    description: 'Sous « Seulement si… » sans colonne choisie, la carte dit que le document sera toujours inclus (l\'indication disparaît dès qu\'une règle est complète) ; rien n\'est écrit comme condition',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro incomplète');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        await openWindow(h);
        const card = () => cardsOf()[0];
        const hint = () => card().querySelector('.macro-doc-hint');
        setSelect(card().querySelector('select.macro-doc-when'), 'if');
        await h.sleep(100);
        if (hint().hidden || !/toujours inclus/.test(hint().textContent)) problems.push('indication absente : ' + hint().textContent + ' / ' + hint().hidden);
        await fillRule(h, card().querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        await h.sleep(80);
        if (!hint().hidden) problems.push('l\'indication reste affichée avec une règle complète');
        // Le document reste vide de condition : on vide la règle, l'indication revient, et la ligne n'a pas de condition.
        const select = card().querySelector('.macro-doc-rules select.macro-rule-column:not(.macro-rule-value-column)');
        setSelect(select, '');
        await h.sleep(80);
        if (hint().hidden) problems.push('l\'indication ne revient pas quand la colonne est vidée');
        await saveWindow(h);
        const saved = savedSlots(macro.id)[0];
        if (!saved || 'condition' in saved) problems.push('condition écrite sans règle complète : ' + JSON.stringify(saved));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_condition_takes_several_rules_a_group_and_an_or_connector',
    description: 'La carte reprend les gestes de la fenêtre de condition d\'une bulle : « + Ajouter une condition », le mot « Et » / « Ou » devant une ligne qui change la combinaison, « + Groupe » pose des parenthèses ; la condition enregistrée porte la combinaison et le groupe',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro groupe');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        await openWindow(h);
        const card = () => cardsOf()[0];
        setSelect(card().querySelector('select.macro-doc-when'), 'if');
        await h.sleep(80);
        await fillRule(h, card().querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        card().querySelector('.macro-doc-rules .var-condition-add-group').click();
        await h.sleep(120);
        let rows = Array.from(card().querySelectorAll('.macro-doc-rules .macro-rule-row'));
        if (rows.length !== 3 || !card().querySelector('.macro-doc-rules .cond-group')) { problems.push('groupe : ' + rows.length + ' lignes'); return { pass: false, notes: JSON.stringify({ problems }) }; }
        await fillRule(h, rows[1], 'Montant', '>', '100');
        await fillRule(h, rows[2], 'Nom', 'contient', 'A');
        // Le groupe est combiné à l'inverse de la condition (« toutes » dehors, « au moins une » dedans).
        const groupMode = card().querySelector('.cond-group .cond-group-mode').value;
        if (groupMode !== 'any') problems.push('combinaison du groupe : ' + groupMode);
        // Le mot « Et » devant la ligne du groupe est un bouton : un clic passe la condition entière à « Ou ».
        const toggle = card().querySelector('.macro-doc-rules > .cond-group-row > .macro-rule-connector-toggle');
        if (!toggle) problems.push('pas de bouton « Et » devant le groupe');
        else { toggle.click(); await h.sleep(120); }
        const modeSelect = card().querySelector('.macro-doc-mode select');
        if (!modeSelect || modeSelect.value !== 'any' || card().querySelector('.macro-doc-mode').hidden) problems.push('la liste « Inclure si » ne suit pas : ' + (modeSelect && modeSelect.value));
        await saveWindow(h);
        const saved = savedSlots(macro.id)[0];
        const want = { mode: 'any', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { mode: 'any', rules: [{ column: 'Montant', operator: '>', value: '100' }, { column: 'Nom', operator: 'contient', value: 'A' }] }] };
        if (!saved || JSON.stringify(saved.condition) !== JSON.stringify(want)) problems.push('condition enregistrée : ' + JSON.stringify(saved && saved.condition));
        rows = [];
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_move_and_remove_keep_the_hidden_eye_with_its_document',
    description: 'Monter / descendre un document change l\'ordre de la composition (le premier ne monte pas, le dernier ne descend pas : boutons grisés) ; son œil et sa condition le suivent ; supprimer un document retire sa carte et sa position',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro ordre');
        setAutosave(false);
        const condition = whenCond(ruleOn('Nom', '=', 'a'));
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId, hiddenModeleIds: [macro.coverId] },
          { type: 'fixed', modeleId: macro.otherId, condition },
          { type: 'fixed', modeleId: macro.thirdId },
        ]);
        const problems = [];
        await openWindow(h);
        const ends = cardsOf().map(c => { const v = cardView(c); return [v.up, v.down]; });
        if (JSON.stringify(ends) !== JSON.stringify([[true, false], [false, false], [false, true]])) problems.push('boutons : ' + JSON.stringify(ends));
        cardsOf()[1].querySelector('.macro-slot-move-up').click();
        await h.sleep(100);
        const order = cardsOf().map(c => cardView(c).model);
        if (JSON.stringify(order) !== JSON.stringify([macro.otherId, macro.coverId, macro.thirdId].map(String))) problems.push('ordre à l\'écran : ' + JSON.stringify(order));
        // Le document monté est arrivé en tête : son bouton « monter » y est grisé, le focus passe donc à son vis-à-vis « descendre », toujours sur la même carte.
        const focused = document.activeElement;
        if (!focused || !focused.classList.contains('macro-slot-move-down') || !cardsOf()[0].contains(focused)) problems.push('le focus ne suit pas le document monté : ' + (focused && focused.className));
        // Supprimer le troisième document.
        cardsOf()[2].querySelector('.macro-slot-remove').click();
        await h.sleep(100);
        await saveWindow(h);
        const slots = savedSlots(macro.id);
        if (slots.length !== 2 || String(slots[0].modeleId) !== String(macro.otherId) || String(slots[1].modeleId) !== String(macro.coverId)) problems.push('composition : ' + JSON.stringify(slots));
        else if (JSON.stringify(slots[0].condition) !== JSON.stringify(condition) || JSON.stringify((slots[1].hiddenModeleIds || []).map(String)) !== JSON.stringify([String(macro.coverId)]) || slots[0].hiddenModeleIds) problems.push('condition ou œil perdus : ' + JSON.stringify(slots));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  // La fenêtre et le résumé en anglais : le même parcours dans une page qui démarre en anglais.
  cases.push({
    id: 'macro_editor_and_summary_speak_english_on_a_page_that_starts_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la fenêtre (« Document 1 », « Template », « Include this document », « Always », « Only if… », « Include if », les deux boutons d\'ajout) et le résumé (« Only if: … », « 2 documents, 1 of them conditional. ») sont en anglais',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro english');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        await openWindow(h);
        const card = cardsOf()[0];
        const texts = {
          title: card.querySelector('.macro-slot-title').textContent,
          labels: Array.from(card.querySelectorAll('.macro-doc-label')).map(l => l.textContent),
          when: Array.from(card.querySelectorAll('select.macro-doc-when option')).map(o => o.textContent),
          tag: cardsOf()[1].querySelector('.macro-slot-kind').textContent,
          add: [document.getElementById('macro-editor-add-document').textContent, document.getElementById('macro-editor-add-slot').textContent],
          intro: document.querySelector('#macro-editor-modal .macro-editor-intro').textContent,
          move: [card.querySelector('.macro-slot-move-up').getAttribute('aria-label'), card.querySelector('.macro-slot-move-down').getAttribute('aria-label'), card.querySelector('.macro-slot-remove').getAttribute('aria-label')],
        };
        const want = {
          title: 'Document 1', labels: ['Template', 'Include this document'], when: ['Always', 'Only if…'], tag: 'chosen by the row',
          add: ['+ Add a document', '+ Add a document chosen by the row'],
          intro: 'One document made of several templates, in the order of the list. Each document can have its own condition: it is only included when the condition is met for the row.',
          move: ['Move document 1 up', 'Move document 1 down', 'Remove document 1'],
        };
        if (JSON.stringify(texts) !== JSON.stringify(want)) problems.push('fenêtre : ' + JSON.stringify(texts));
        setSelect(card.querySelector('select.macro-doc-when'), 'if');
        await h.sleep(80);
        const modeText = card.querySelector('.macro-doc-mode');
        const hint = card.querySelector('.macro-doc-hint').textContent;
        if (hint !== 'No complete condition yet: this document will always be included. Choose a column.') problems.push('indication : ' + hint);
        void modeText;
        await fillRule(h, card.querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        await saveWindow(h);
        const summary = { sentence: document.getElementById('macro-summary-text').textContent, notes: Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-condition')).map(n => n.textContent) };
        if (summary.sentence !== '2 documents, 2 of them conditional.' || JSON.stringify(summary.notes) !== JSON.stringify(['Only if: Statut = Urgent', 'The template is chosen by the row'])) problems.push('résumé : ' + JSON.stringify(summary));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_summary_says_when_each_document_is_included',
    description: 'Le résumé écrit, sous les modèles d\'un document sous condition, « Seulement si : … » (la condition en entier en info-bulle), « Le modèle est choisi selon la ligne » sous une position à règles, rien sous un document toujours inclus ; la phrase compte les documents et ceux qui sont sous condition',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro résumé');
        setAutosave(false);
        const problems = [];
        const condition = { mode: 'all', rules: [ruleOn('Nom', '=', 'a'), { mode: 'any', rules: [ruleOn('Montant', '>', '100'), ruleOn('Statut', '=', 'Urgent')] }] };
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.otherId, condition },
          { type: 'conditional', rules: [{ column: 'Nom', operator: '=', value: 'a', modeleId: macro.thirdId }], defaultModeleId: null },
        ]);
        const notes = () => Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part')).map(row => { const n = row.querySelector('.macro-summary-condition'); return n ? [n.textContent, n.title] : null; });
        const full = 'Nom = a et (Montant > 100 ou Statut = Urgent)';
        const got = notes();
        if (JSON.stringify(got) !== JSON.stringify([null, ['Seulement si : ' + full, full], ['Le modèle est choisi selon la ligne', '']])) problems.push('notes : ' + JSON.stringify(got));
        if (document.getElementById('macro-summary-text').textContent !== '3 documents, dont 2 sous condition.') problems.push('phrase : ' + document.getElementById('macro-summary-text').textContent);
        // Sans aucune condition : « toujours inclus ».
        await recomposed(h, macro, [{ type: 'fixed', modeleId: macro.coverId }, { type: 'fixed', modeleId: macro.otherId }]);
        if (document.getElementById('macro-summary-text').textContent !== '2 documents, toujours inclus.') problems.push('phrase sans condition : ' + document.getElementById('macro-summary-text').textContent);
        if (notes().some(Boolean)) problems.push('notes sans condition : ' + JSON.stringify(notes()));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  // --- Ce que la personne lit : la Lecture et le ZIP de PDF suivent la condition de chaque document, ligne après ligne ---
  cases.push({
    id: 'macro_reading_follows_each_document_condition_row_by_row',
    description: 'En Lecture, un document sous condition n\'apparaît que pour la ligne qui la remplit ; changer de ligne change les documents (le document sans condition est toujours là)',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro lecture condition');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.otherId, condition: whenCond(ruleOn('Nom', '=', 'a')) },
          { type: 'fixed', modeleId: macro.thirdId, condition: whenCond(ruleOn('Nom', '≠', 'a')) },
        ]);
        const seen = text => ['cover', 'other', 'third'].filter(key => text.includes(COND_TEXTS[key])).join('+');
        await feedNom(h, 'a');
        const forA = seen(await readingOf(h));
        await feedNom(h, 'z');
        const forZ = seen(await readingOf(h));
        if (forA !== 'cover+other') problems.push('ligne a : ' + forA);
        if (forZ !== 'cover+third') problems.push('ligne z : ' + forZ);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_batch_zip_follows_each_document_condition_row_by_row',
    description: 'ZIP de PDF, une ligne après l\'autre : chaque ligne reçoit les documents dont la condition est remplie pour ELLE (un document sorti en tête ne laisse pas de page blanche, le document sans condition est partout)',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro lot condition');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.otherId, condition: whenCond(ruleOn('Nom', '=', 'a')) },
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.thirdId, condition: whenCond(ruleOn('Nom', '=', 'z')) },
        ]);
        const stub = window.__gristStub;
        const rows = [{ id: 1, Nom: 'a' }, { id: 2, Nom: 'b' }, { id: 3, Nom: 'z' }];
        stub.setVariables(PAGE_DATA, { Nom: 'Text' });
        stub.setRows(PAGE_DATA, rows);
        await GristAPI.refreshSchema();
        stub.fireRecord(rows[0], PAGE_DATA);
        await h.sleep(100);
        const file = await fileDownloaded(h, 'v2-btn-export-pdf-batch');
        if (!file || !file.blob) return { pass: false, notes: 'aucun ZIP téléchargé' };
        await ExportCommon.ensureJsZipLoaded();
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const texts = {};
        for (const name of Object.keys(zip.files)) texts[name] = (await pdfPages(h, await zip.file(name).async('blob'))).map(p => squashed(p.text));
        const names = ['Macro lot condition - a.pdf', 'Macro lot condition - b.pdf', 'Macro lot condition - z.pdf'];
        if (Object.keys(texts).length !== 3 || !names.every(n => texts[n])) return { pass: false, notes: 'fichiers : ' + JSON.stringify(Object.keys(texts)) };
        const pages = n => texts[n].map(t => ['cover', 'other', 'third'].filter(key => t.includes(COND_TEXTS[key])).join('+'));
        if (JSON.stringify(pages(names[0])) !== JSON.stringify(['other', 'cover'])) problems.push('ligne a : ' + JSON.stringify(pages(names[0])));
        if (JSON.stringify(pages(names[1])) !== JSON.stringify(['cover'])) problems.push('ligne b : ' + JSON.stringify(pages(names[1])));
        if (JSON.stringify(pages(names[2])) !== JSON.stringify(['cover', 'third'])) problems.push('ligne z : ' + JSON.stringify(pages(names[2])));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });


  // --- Une seule carte pour tous les documents (24/11, retour d'Antoine : « je ne comprends pas pourquoi ce n'est pas harmonisé entre le premier et les autres », « tout comme sur le document 1 ») ---
  // Chaque carte a « Modèle » puis « Inclure ce document » ; « Choisi selon la ligne » est un choix de « Modèle », et ses règles se déroulent sous la carte.
  cases.push({
    id: 'macro_editor_every_card_has_model_and_include_and_by_row_is_a_model_choice',
    description: 'Tous les documents, y compris celui choisi selon la ligne, ont la même carte : « Modèle » puis « Inclure ce document » (Toujours) ; le document choisi selon la ligne montre « Choisi selon la ligne » dans « Modèle » avec ses règles et son modèle par défaut dessous ; la liste « Modèle » le propose toujours en tête, même à la recherche',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro carte unique');
        setAutosave(false);
        const problems = [];
        await openWindow(h);
        const cards = cardsOf();
        const shape = card => ({
          labels: Array.from(card.querySelectorAll('.macro-doc-row .macro-doc-label')).map(l => l.textContent),
          when: Array.from(card.querySelectorAll('select.macro-doc-when option')).map(o => o.textContent),
          modelFirst: !!card.querySelector('.macro-doc-row select.macro-doc-model'),
          rules: card.querySelectorAll('.macro-slot-rules .macro-rule-row').length,
          defaultSelect: !!card.querySelector('.macro-by-row select.macro-slot-default-select'),
        });
        const want = { labels: ['Modèle', 'Inclure ce document'], when: ['Toujours', 'Seulement si…'], modelFirst: true };
        const first = shape(cards[0]), second = shape(cards[1]);
        if (JSON.stringify([first.labels, first.when, first.modelFirst]) !== JSON.stringify([want.labels, want.when, want.modelFirst]) || first.rules !== 0 || first.defaultSelect) problems.push('carte 1 : ' + JSON.stringify(first));
        if (JSON.stringify([second.labels, second.when, second.modelFirst]) !== JSON.stringify([want.labels, want.when, want.modelFirst]) || second.rules !== 2 || !second.defaultSelect) problems.push('carte 2 : ' + JSON.stringify(second));
        const select = cards[1].querySelector('select.macro-doc-model');
        const field = select.nextElementSibling;
        const shown = field && field.classList.contains('ss-wrap') ? (field.querySelector('.ss-trigger') || {}).textContent : select.selectedOptions[0].textContent;
        if (shown.trim() !== 'Choisi selon la ligne') problems.push('« Modèle » de la carte 2 : ' + shown);
        const options = Array.from(select.options).map(o => o.textContent);
        if (options[0] !== '— Choisir un modèle —' || options[1] !== 'Choisi selon la ligne') problems.push('options : ' + JSON.stringify(options.slice(0, 3)));
        if (select.options[1].dataset.pinned !== 'true') problems.push('« Choisi selon la ligne » n\'est pas épinglé');
        const heads = Array.from(cards[0].querySelectorAll('select.macro-doc-model option')).map(o => o.textContent).slice(0, 2);
        if (JSON.stringify(heads) !== JSON.stringify(['— Choisir un modèle —', 'Choisi selon la ligne'])) problems.push('options de la carte 1 : ' + JSON.stringify(heads));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_by_row_document_takes_an_include_condition_like_the_others',
    description: 'Le document choisi selon la ligne a lui aussi « Inclure ce document » : sous « Seulement si… » sa condition est enregistrée avec ses règles et son modèle par défaut intacts ; la fenêtre rouverte la montre ; « Toujours » l\'efface',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro selon la ligne condition');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        const rulesBefore = JSON.stringify(savedSlots(macro.id)[1].rules);
        await openWindow(h);
        const card = () => cardsOf()[1];
        setSelect(card().querySelector('select.macro-doc-when'), 'if');
        await h.sleep(100);
        if (card().querySelector('.macro-doc-condition').hidden) problems.push('la condition ne s\'affiche pas sous « Seulement si… »');
        await fillRule(h, card().querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        await saveWindow(h);
        let saved = savedSlots(macro.id)[1];
        if (!saved || saved.type !== 'conditional' || JSON.stringify(saved.rules) !== rulesBefore || String(saved.defaultModeleId) !== String(macro.thirdId)) problems.push('règles ou modèle par défaut perdus : ' + JSON.stringify(saved));
        if (!saved || JSON.stringify(saved.condition) !== JSON.stringify({ mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] })) problems.push('condition enregistrée : ' + JSON.stringify(saved && saved.condition));
        await openWindow(h);
        const view = cardView(card());
        if (view.when !== 'if' || !view.conditionShown || view.rules !== 2) problems.push('fenêtre rouverte : ' + JSON.stringify(view));
        setSelect(card().querySelector('select.macro-doc-when'), 'always');
        await saveWindow(h);
        saved = savedSlots(macro.id)[1];
        if (!saved || 'condition' in saved || saved.type !== 'conditional') problems.push('« Toujours » : ' + JSON.stringify(saved));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_model_list_switches_a_document_between_one_model_and_by_row',
    description: 'Dans « Modèle », « Choisi selon la ligne » fait du document une cascade de règles (une règle vide, la condition d\'inclusion gardée) ; un modèle le refait document à un seul modèle ; revenir à « Choisi selon la ligne » retrouve ses règles',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro bascule');
        setAutosave(false);
        const problems = [];
        const condition = whenCond(ruleOn('Nom', '=', 'a'));
        await recomposed(h, macro, [{ type: 'fixed', modeleId: macro.coverId, condition }, { type: 'fixed', modeleId: macro.otherId }]);
        await openWindow(h);
        const pick = async (index, value) => { setSelect(cardsOf()[index].querySelector('select.macro-doc-model'), value); await h.sleep(150); };
        // Document 1 : un modèle -> selon la ligne : une règle vide, la condition d'inclusion gardée.
        await pick(0, '__by-row__');
        let view = cardView(cardsOf()[0]);
        if (view.kind !== 'by-row' || view.model !== '__by-row__' || view.rules !== 1 || view.when !== 'if' || !view.conditionShown) problems.push('un modèle -> selon la ligne : ' + JSON.stringify(view));
        const nextRule = cardsOf()[0].querySelector('.macro-slot-rules .macro-rule-row');
        if (!nextRule) problems.push('pas de règle dessous');
        // Selon la ligne -> un modèle : un document à un seul modèle, sa condition intacte.
        await pick(0, String(macro.thirdId));
        view = cardView(cardsOf()[0]);
        if (view.kind !== 'document' || view.model !== String(macro.thirdId) || view.rules !== 0 || view.when !== 'if') problems.push('selon la ligne -> un modèle : ' + JSON.stringify(view));
        // Document 2 : un modèle -> selon la ligne -> retour : ses règles d'avant reviennent si on en avait.
        await pick(1, '__by-row__');
        const rules = cardsOf()[1].querySelectorAll('.macro-slot-rules .macro-rule-row').length;
        if (rules !== 1) problems.push('document 2, une règle vide attendue : ' + rules);
        await saveWindow(h);
        const slots = savedSlots(macro.id);
        if (slots[0].type !== 'fixed' || String(slots[0].modeleId) !== String(macro.thirdId) || JSON.stringify(slots[0].condition) !== JSON.stringify(condition)) problems.push('document 1 enregistré : ' + JSON.stringify(slots[0]));
        if (slots[1].type !== 'conditional' || (slots[1].rules || []).length !== 0) problems.push('document 2 enregistré (aucune règle complète : aucune règle écrite) : ' + JSON.stringify(slots[1]));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_editor_rules_of_a_by_row_document_come_back_after_a_round_trip',
    description: 'Passer un document « selon la ligne » à un modèle puis revenir à « Choisi selon la ligne » sans enregistrer entre-temps lui rend ses règles et son modèle par défaut, tels qu\'ils étaient',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro aller-retour');
        setAutosave(false);
        const problems = [];
        const before = JSON.stringify(savedSlots(macro.id)[1]);
        await openWindow(h);
        const pick = async value => { setSelect(cardsOf()[1].querySelector('select.macro-doc-model'), value); await h.sleep(150); };
        await pick(String(macro.otherId));
        if (cardView(cardsOf()[1]).kind !== 'document') problems.push('pas passé en document');
        await pick('__by-row__');
        const view = cardView(cardsOf()[1]);
        if (view.kind !== 'by-row' || view.rules !== 2) problems.push('règles revenues : ' + JSON.stringify(view));
        await saveWindow(h);
        const after = JSON.stringify(savedSlots(macro.id)[1]);
        if (after !== before) problems.push('composition changée : ' + after + ' / avant : ' + before);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_summary_by_row_document_with_a_condition_says_both',
    description: 'Le résumé d\'un document choisi selon la ligne ET sous condition dit les deux : « Le modèle est choisi selon la ligne », puis « Seulement si : … » ; la phrase le compte sous condition',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro résumé deux notes');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'conditional', condition: whenCond(ruleOn('Statut', '=', 'Urgent')), rules: [{ column: 'Nom', operator: '=', value: 'a', modeleId: macro.otherId }], defaultModeleId: null },
        ]);
        const notes = Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part'))
          .map(row => Array.from(row.querySelectorAll('.macro-summary-condition')).map(n => n.textContent));
        if (JSON.stringify(notes) !== JSON.stringify([[], ['Le modèle est choisi selon la ligne', 'Seulement si : Statut = Urgent']])) problems.push('notes : ' + JSON.stringify(notes));
        if (document.getElementById('macro-summary-text').textContent !== '2 documents, dont 1 sous condition.') problems.push('phrase : ' + document.getElementById('macro-summary-text').textContent);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  // --- Des modèles à la suite, dans la carte d'un document (26/11, demande d'Antoine : « après avoir mis des conditions sur un modèle, ajouter d'autres modèles dans le bloc à la suite », pour des conditions qui valent pour la présence de plusieurs modèles) ---
  // `followingModeleIds` (clé facultative d'une position) : d'autres modèles qui s'assemblent après celui du document, dans l'ordre, tous sous la condition de la carte. Sans la clé, la position se lit comme avant.
  cases.push({
    id: 'macro_following_engine_gives_the_block_models_in_order_under_one_condition',
    description: 'pickModeleIds / buildConcatenatedHtml : un document à modèles à la suite donne son modèle puis les suivants dans l\'ordre, un saut de page entre chacun, tous retenus ou tous sortis par la condition du document ; l\'œil d\'un modèle ne masque que lui ; une position sans la clé se lit comme avant',
    run: async () => {
      const problems = [];
      const same = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(name + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      const templates = [{ id: 'a', contenu: '<p>AAA</p>' }, { id: 'b', contenu: '<p>BBB</p>' }, { id: 'c', contenu: '<p>CCC</p>' }, { id: 'd', contenu: '<p>DDD</p>' }];
      const pick = (slot, record) => MacroTemplates.pickModeleIds(slot, 'Dossiers', record || { id: 1, Statut: 'Urgent' });
      const build = (slots, record) => MacroTemplates.buildConcatenatedHtml({ slots }, 'Dossiers', record || { id: 1, Statut: 'Urgent' }, templates);
      const brk = rank => MacroTemplates.slotBreakHtml(rank);
      // Le bloc d'un document.
      const block = { type: 'fixed', modeleId: 'a', followingModeleIds: ['b', 'c'] };
      same('modèles du bloc', await pick(block), ['a', 'b', 'c']);
      same('modèles de la position', MacroTemplates.slotModelIds(block), ['a', 'b', 'c']);
      same('modèles à la suite', MacroTemplates.followingModeleIds(block), ['b', 'c']);
      same('modèles entre lesquels elle choisit', MacroTemplates.choiceModelIds(block), ['a']);
      if (await build([block]) !== '<p>AAA</p>' + brk(1) + '<p>BBB</p>' + brk(2) + '<p>CCC</p>') problems.push('assemblage : ' + await build([block]));
      // La même condition pour tous : remplie, le bloc entier ; non remplie, aucun de ses modèles, et le document d'après n'a pas de saut devant.
      const only = { type: 'fixed', modeleId: 'a', followingModeleIds: ['b', 'c'], condition: whenCond(ruleOn('Statut', '=', 'Urgent')) };
      same('condition remplie', await pick(only, { id: 1, Statut: 'Urgent' }), ['a', 'b', 'c']);
      same('condition non remplie', await pick(only, { id: 2, Statut: 'Normal' }), []);
      if (await build([only, { type: 'fixed', modeleId: 'd' }], { id: 2, Statut: 'Normal' }) !== '<p>DDD</p>') problems.push('bloc sorti : ' + await build([only, { type: 'fixed', modeleId: 'd' }], { id: 2, Statut: 'Normal' }));
      if (await build([{ type: 'fixed', modeleId: 'd' }, only], { id: 1, Statut: 'Urgent' }) !== '<p>DDD</p>' + brk(1) + '<p>AAA</p>' + brk(2) + '<p>BBB</p>' + brk(3) + '<p>CCC</p>') problems.push('document puis bloc : ' + await build([{ type: 'fixed', modeleId: 'd' }, only]));
      // L'œil d'un modèle : lui seul, les rangs des sauts suivent.
      const eyed = Object.assign({}, block, { hiddenModeleIds: ['b'] });
      same('œil sur un modèle à la suite', await pick(eyed), ['a', 'c']);
      if (await build([eyed]) !== '<p>AAA</p>' + brk(1) + '<p>CCC</p>') problems.push('assemblage avec un œil : ' + await build([eyed]));
      same('œil sur le modèle du document', await pick(Object.assign({}, block, { hiddenModeleIds: ['a'] })), ['b', 'c']);
      // Choisi selon la ligne : le modèle choisi puis ceux qui suivent ; sans modèle choisi (ni règle ni défaut), ceux qui suivent restent là tant que la condition tient.
      const byRow = { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: 'a' }], defaultModeleId: null, followingModeleIds: ['c'] };
      same('selon la ligne, une règle remplie', await pick(byRow, { id: 1, Statut: 'Urgent' }), ['a', 'c']);
      same('selon la ligne, aucune règle ne convient', await pick(byRow, { id: 2, Statut: 'Normal' }), ['c']);
      same('selon la ligne, la position est sortie par sa condition', await pick(Object.assign({}, byRow, { condition: whenCond(ruleOn('Statut', '=', 'Normal')) }), { id: 1, Statut: 'Urgent' }), []);
      same('modèles d\'une position selon la ligne', MacroTemplates.slotModelIds(Object.assign({}, byRow, { defaultModeleId: 'd' })), ['a', 'd', 'c']);
      // Sans la clé, rien ne change ; la clé vide, un choix pas fait et un doublon ne produisent pas de modèle de trop.
      same('position sans la clé', await pick({ type: 'fixed', modeleId: 'a' }), ['a']);
      same('pickModeleId ne dit que le modèle choisi', await MacroTemplates.pickModeleId(block, 'Dossiers', { id: 1 }), 'a');
      same('clé vide, choix pas fait', await pick({ type: 'fixed', modeleId: 'a', followingModeleIds: [null, '', 'b'] }), ['a', 'b']);
      same('le même modèle deux fois s\'assemble deux fois', await pick({ type: 'fixed', modeleId: 'a', followingModeleIds: ['a', 'b', 'b'] }), ['a', 'a', 'b', 'b']);
      same('et se dit une fois', MacroTemplates.slotModelIds({ type: 'fixed', modeleId: 'a', followingModeleIds: ['a', 'b', 'b'] }), ['a', 'b']);
      same('identifiants en texte ou en nombre', await pick({ type: 'fixed', modeleId: 7, followingModeleIds: [8], hiddenModeleIds: ['8'] }), [7]);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'macro_editor_adds_models_after_a_document_and_saves_them_in_order',
    description: 'Sous la carte d\'un document, « + Ajouter un modèle à la suite » pose une ligne « Modèle » (sans « Choisi selon la ligne ») avec sa croix ; les modèles choisis s\'enregistrent dans l\'ordre sous `followingModeleIds`, un choix pas fait n\'est pas écrit, la fenêtre rouverte les montre, retirer le dernier ôte la clé ; la condition de la carte est écrite avec eux',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro à la suite');
        setAutosave(false);
        await feedColumns(h, { id: 1, Nom: 'a', Statut: 'Urgent', Montant: 10 });
        const problems = [];
        const before = macroRow(macro.id).Contenu;
        await openWindow(h);
        const card = i => cardsOf()[i];
        const rowsOf = i => Array.from(card(i).querySelectorAll('.macro-following-row'));
        const addButton = i => card(i).querySelector('.macro-following-add');
        // À l'ouverture : aucune ligne, le lien d'ajout sous chaque carte (document et choisi selon la ligne) ; une composition d'avant se réécrit sans la clé.
        if (addButton(0).textContent !== '+ Ajouter un modèle à la suite' || addButton(1).textContent !== '+ Ajouter un modèle à la suite' || rowsOf(0).length || rowsOf(1).length) problems.push('ouverture : ' + JSON.stringify([addButton(0).textContent, rowsOf(0).length, rowsOf(1).length]));
        if (card(0).querySelector('.macro-following-title')) problems.push('le titre « À la suite » s\'affiche sans aucun modèle');
        await saveWindow(h);
        if (/followingModeleIds/.test(macroRow(macro.id).Contenu)) problems.push('clé écrite pour rien : ' + macroRow(macro.id).Contenu);
        const asText = slots => JSON.stringify(slots, (key, value) => (key === 'modeleId' || key === 'defaultModeleId') && value != null ? String(value) : value);
        if (asText(savedSlots(macro.id)) !== asText(JSON.parse(before).slots)) problems.push('composition d\'avant réécrite autrement : ' + macroRow(macro.id).Contenu);
        // Deux modèles à la suite du premier document, un troisième laissé sans choix.
        await openWindow(h);
        addButton(0).click(); addButton(0).click(); addButton(0).click();
        await h.sleep(80);
        if (rowsOf(0).length !== 3) problems.push('trois lignes attendues : ' + rowsOf(0).length);
        const selects = () => rowsOf(0).map(row => row.querySelector('select.macro-following-model'));
        const first = selects()[0];
        const optionValues = Array.from(first.options).map(o => o.value);
        if (optionValues.includes('__by-row__') || optionValues[0] !== '' || optionValues.length !== 1 + SearchableTemplatesCount()) problems.push('choix de la ligne : ' + JSON.stringify(optionValues));
        if (card(0).querySelector('.macro-following-title').textContent !== 'À la suite, sous la même condition') problems.push('titre : ' + card(0).querySelector('.macro-following-title').textContent);
        if (first.getAttribute('aria-label') !== 'Modèle 1 à la suite du document 1' || rowsOf(0)[1].querySelector('.macro-following-remove').getAttribute('aria-label') !== 'Retirer le modèle 2 à la suite du document 1') problems.push('noms accessibles : ' + first.getAttribute('aria-label') + ' / ' + rowsOf(0)[1].querySelector('.macro-following-remove').getAttribute('aria-label'));
        setSelect(selects()[0], String(macro.otherId));
        setSelect(selects()[1], String(macro.thirdId));
        setSelect(card(0).querySelector('select.macro-doc-when'), 'if');
        await h.sleep(100);
        await fillRule(h, card(0).querySelector('.macro-doc-rules .macro-rule-row'), 'Statut', '=', 'Urgent');
        await saveWindow(h);
        const saved = savedSlots(macro.id);
        const want = { type: 'fixed', modeleId: macro.coverId, followingModeleIds: [macro.otherId, macro.thirdId].map(String), condition: { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] } };
        const norm = slot => JSON.stringify(Object.assign({}, slot, { modeleId: String(slot.modeleId), followingModeleIds: (slot.followingModeleIds || []).map(String) }));
        if (norm(saved[0]) !== norm(want)) problems.push('composition : ' + JSON.stringify(saved[0]));
        if (saved.length !== 2 || saved[1].type !== 'conditional' || 'followingModeleIds' in saved[1]) problems.push('l\'autre position a changé : ' + JSON.stringify(saved[1]));
        // Rouverte : les deux lignes, dans l'ordre, sous la même condition ; retirer la première laisse l'autre, retirer la dernière ôte la clé.
        await openWindow(h);
        if (JSON.stringify(selects().map(s => s.value)) !== JSON.stringify([String(macro.otherId), String(macro.thirdId)])) problems.push('rouverte : ' + JSON.stringify(selects().map(s => s.value)));
        rowsOf(0)[0].querySelector('.macro-following-remove').click();
        await h.sleep(80);
        if (JSON.stringify(selects().map(s => s.value)) !== JSON.stringify([String(macro.thirdId)])) problems.push('après retrait de la première : ' + JSON.stringify(selects().map(s => s.value)));
        if (document.activeElement !== addButton(0)) problems.push('le focus ne revient pas sur « + Ajouter un modèle à la suite » après un retrait');
        await saveWindow(h);
        if (JSON.stringify((savedSlots(macro.id)[0].followingModeleIds || []).map(String)) !== JSON.stringify([String(macro.thirdId)])) problems.push('après retrait : ' + JSON.stringify(savedSlots(macro.id)[0]));
        await openWindow(h);
        rowsOf(0)[0].querySelector('.macro-following-remove').click();
        await saveWindow(h);
        if ('followingModeleIds' in savedSlots(macro.id)[0]) problems.push('la clé reste sans modèle à la suite : ' + JSON.stringify(savedSlots(macro.id)[0]));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });
  // Le nombre de modèles que les listes de la fenêtre proposent (documents, grilles, présentations : availableTemplates de js/macro-editor.js).
  function SearchableTemplatesCount() { return Templates.getCached().filter(t => ['document', 'grille', 'presentation'].indexOf(t.typeModele || 'document') !== -1).length; }

  cases.push({
    id: 'macro_editor_following_models_stay_when_a_document_changes_between_one_model_and_by_row',
    description: 'Passer un document de « un modèle » à « Choisi selon la ligne » et retour garde ses modèles à la suite ; une position choisie selon la ligne a aussi les siens, écrits avec ses règles ; déplacer ou supprimer une carte emporte ses modèles ; un modèle masqué par l\'œil le reste à travers la fenêtre',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro à la suite bascule');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId, followingModeleIds: [macro.otherId], hiddenModeleIds: [macro.otherId] },
          { type: 'conditional', rules: [{ column: 'Nom', operator: '=', value: 'a', modeleId: macro.otherId }], defaultModeleId: macro.thirdId, followingModeleIds: [macro.coverId] },
        ]);
        await openWindow(h);
        const card = i => cardsOf()[i];
        const followed = i => Array.from(card(i).querySelectorAll('select.macro-following-model')).map(s => s.value);
        if (JSON.stringify(followed(0)) !== JSON.stringify([String(macro.otherId)]) || JSON.stringify(followed(1)) !== JSON.stringify([String(macro.coverId)])) problems.push('ouverture : ' + JSON.stringify([followed(0), followed(1)]));
        // Document 1 : « Choisi selon la ligne », puis un modèle à nouveau.
        setSelect(card(0).querySelector('select.macro-doc-model'), '__by-row__');
        await h.sleep(100);
        if (JSON.stringify(followed(0)) !== JSON.stringify([String(macro.otherId)])) problems.push('les modèles à la suite ne suivent pas le passage selon la ligne : ' + JSON.stringify(followed(0)));
        setSelect(card(0).querySelector('select.macro-doc-model'), String(macro.thirdId));
        await h.sleep(100);
        if (JSON.stringify(followed(0)) !== JSON.stringify([String(macro.otherId)])) problems.push('les modèles à la suite ne suivent pas le retour à un modèle : ' + JSON.stringify(followed(0)));
        // Déplacer le premier document en bas : ses modèles à la suite le suivent.
        card(0).querySelector('.macro-slot-move-down').click();
        await h.sleep(100);
        if (JSON.stringify(followed(0)) !== JSON.stringify([String(macro.coverId)]) || JSON.stringify(followed(1)) !== JSON.stringify([String(macro.otherId)])) problems.push('après déplacement : ' + JSON.stringify([followed(0), followed(1)]));
        await saveWindow(h);
        const saved = savedSlots(macro.id).map(slot => ({ type: slot.type, follow: (slot.followingModeleIds || []).map(String), hidden: (slot.hiddenModeleIds || []).map(String) }));
        const wanted = [{ type: 'conditional', follow: [String(macro.coverId)], hidden: [] }, { type: 'fixed', follow: [String(macro.otherId)], hidden: [String(macro.otherId)] }];
        if (JSON.stringify(saved) !== JSON.stringify(wanted)) problems.push('composition : ' + JSON.stringify(saved));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_summary_lists_following_models_after_then_each_with_a_pencil_and_an_eye',
    description: 'Le résumé dit un document à modèles à la suite sur une seule ligne : son modèle, puis « puis » devant chaque modèle suivant, chacun avec son stylo et son œil ; l\'œil d\'un modèle à la suite le masque de la Lecture sans toucher aux autres ; la phrase compte les documents, pas les modèles',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro résumé suite');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.otherId, followingModeleIds: [macro.thirdId, macro.coverId], condition: whenCond(ruleOn('Nom', '=', 'a')) },
        ]);
        const rows = summaryRows();
        const cover = 'Macro résumé suite - garde', other = 'Macro résumé suite - autre', third = 'Macro résumé suite - défaut';
        if (JSON.stringify(rows.map(r => [r.label, r.models])) !== JSON.stringify([['Document 1', [cover]], ['Document 2', [other, third, cover]]])) problems.push('lignes : ' + JSON.stringify(rows.map(r => [r.label, r.models])));
        const thens = Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-part')[1].querySelectorAll('.macro-summary-then')).map(n => n.textContent);
        if (JSON.stringify(thens) !== JSON.stringify(['puis', 'puis'])) problems.push('« puis » : ' + JSON.stringify(thens));
        if (JSON.stringify(rows[1].pencils.map(p => p.id)) !== JSON.stringify([macro.otherId, macro.thirdId, macro.coverId].map(String))) problems.push('stylos : ' + JSON.stringify(rows[1].pencils.map(p => p.id)));
        if (document.getElementById('macro-summary-text').textContent !== '2 documents, dont 1 sous condition.') problems.push('phrase : ' + document.getElementById('macro-summary-text').textContent);
        const note = document.querySelectorAll('#macro-summary-parts .macro-summary-part')[1].querySelector('.macro-summary-condition');
        if (!note || note.textContent !== 'Seulement si : Nom = a') problems.push('la condition du bloc : ' + (note && note.textContent));
        // L'œil du modèle « défaut » (deuxième du bloc) : lui seul est masqué, écrit dans la position de ce document.
        const eye = document.querySelector('#macro-summary-parts .macro-summary-eye[data-slot="1"][data-template-id="' + macro.thirdId + '"]');
        if (!eye) return { pass: false, notes: 'œil introuvable' };
        eye.click();
        await h.sleep(900);
        const slot = savedSlots(macro.id)[1];
        if (JSON.stringify((slot.hiddenModeleIds || []).map(String)) !== JSON.stringify([String(macro.thirdId)]) || JSON.stringify((slot.followingModeleIds || []).map(String)) !== JSON.stringify([String(macro.thirdId), String(macro.coverId)])) problems.push('composition après l\'œil : ' + JSON.stringify(slot));
        const hiddenNow = Array.from(document.querySelectorAll('#macro-summary-parts .is-hidden-model .macro-summary-model-name')).map(n => n.textContent);
        if (JSON.stringify(hiddenNow) !== JSON.stringify([third])) problems.push('modèle grisé : ' + JSON.stringify(hiddenNow));
        await feedNom(h, 'a');
        const reading = await readingOf(h);
        const order = ['Autrepage', 'Pagepardéfaut', 'Pagedegarde'].map(t => reading.indexOf(t));
        if (order[0] < 0 || order[1] !== -1 || reading.lastIndexOf('Pagedegarde') <= order[0]) problems.push('Lecture avec l\'œil : ' + JSON.stringify(order));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_reading_follows_the_block_condition_and_keeps_its_models_in_order',
    description: 'En Lecture, les modèles à la suite d\'un document paraissent tous avec lui, dans l\'ordre, pour la ligne qui remplit la condition, et aucun pour les autres ; le document sans condition est toujours là',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro lecture suite');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.otherId, followingModeleIds: [macro.thirdId], condition: whenCond(ruleOn('Nom', '=', 'a')) },
        ]);
        const seen = text => ['cover', 'other', 'third'].map(key => [key, text.indexOf(COND_TEXTS[key])]).filter(pair => pair[1] >= 0).sort((a, b) => a[1] - b[1]).map(pair => pair[0]).join('+');
        await feedNom(h, 'a');
        const forA = seen(await readingOf(h));
        await feedNom(h, 'z');
        const forZ = seen(await readingOf(h));
        if (forA !== 'cover+other+third') problems.push('ligne a : ' + forA);
        if (forZ !== 'cover') problems.push('ligne z : ' + forZ);
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_batch_zip_follows_the_block_condition_row_by_row',
    description: 'ZIP de PDF, une ligne après l\'autre : le bloc (un modèle et ceux à sa suite) arrive en entier dans le PDF des lignes qui remplissent sa condition, un modèle par page, et manque entièrement aux autres',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro lot suite');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [
          { type: 'fixed', modeleId: macro.coverId },
          { type: 'fixed', modeleId: macro.otherId, followingModeleIds: [macro.thirdId], condition: whenCond(ruleOn('Nom', '=', 'a')) },
        ]);
        const stub = window.__gristStub;
        const rows = [{ id: 1, Nom: 'a' }, { id: 2, Nom: 'b' }];
        stub.setVariables(PAGE_DATA, { Nom: 'Text' });
        stub.setRows(PAGE_DATA, rows);
        await GristAPI.refreshSchema();
        stub.fireRecord(rows[0], PAGE_DATA);
        await h.sleep(100);
        const file = await fileDownloaded(h, 'v2-btn-export-pdf-batch');
        if (!file || !file.blob) return { pass: false, notes: 'aucun ZIP téléchargé' };
        await ExportCommon.ensureJsZipLoaded();
        const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
        const texts = {};
        for (const name of Object.keys(zip.files)) texts[name] = (await pdfPages(h, await zip.file(name).async('blob'))).map(p => squashed(p.text));
        const names = ['Macro lot suite - a.pdf', 'Macro lot suite - b.pdf'];
        if (Object.keys(texts).length !== 2 || !names.every(n => texts[n])) return { pass: false, notes: 'fichiers : ' + JSON.stringify(Object.keys(texts)) };
        const pages = n => texts[n].map(t => ['cover', 'other', 'third'].filter(key => t.includes(COND_TEXTS[key])).join('+'));
        if (JSON.stringify(pages(names[0])) !== JSON.stringify(['cover', 'other', 'third'])) problems.push('ligne a : ' + JSON.stringify(pages(names[0])));
        if (JSON.stringify(pages(names[1])) !== JSON.stringify(['cover'])) problems.push('ligne b : ' + JSON.stringify(pages(names[1])));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  cases.push({
    id: 'macro_following_models_speak_english_on_a_page_that_starts_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : « + Add a template after it », le titre « Then, under the same condition », les noms accessibles de la ligne et de sa croix, et « then » dans le résumé',
    run: async (h) => {
      try {
        const macro = await composedMacro(h, 'Macro following english');
        setAutosave(false);
        const problems = [];
        await recomposed(h, macro, [{ type: 'fixed', modeleId: macro.coverId, followingModeleIds: [macro.otherId] }]);
        const thens = Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-then')).map(n => n.textContent);
        if (JSON.stringify(thens) !== JSON.stringify(['then'])) problems.push('résumé : ' + JSON.stringify(thens));
        await openWindow(h);
        const card = cardsOf()[0];
        const texts = {
          add: card.querySelector('.macro-following-add').textContent,
          title: card.querySelector('.macro-following-title').textContent,
          row: card.querySelector('select.macro-following-model').getAttribute('aria-label'),
          remove: card.querySelector('.macro-following-remove').getAttribute('aria-label'),
        };
        const want = { add: '+ Add a template after it', title: 'Then, under the same condition', row: 'Template 1 after document 1', remove: 'Remove template 1 after document 1' };
        if (JSON.stringify(texts) !== JSON.stringify(want)) problems.push('fenêtre : ' + JSON.stringify(texts));
        return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
      } finally { await leaveMacro(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.macroModeles = cases;
})();
