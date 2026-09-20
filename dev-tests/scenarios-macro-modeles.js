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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.macroModeles = cases;
})();
