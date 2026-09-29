// Suite "varLookup" - champ rapporté de la table de la page (retour d'Antoine du 2026-09-29 : « une colonne de la même table que là où est le widget, mais qui
// est un champ rapporté, la valeur ne s'affiche pas »). Un champ rapporté est une colonne à formule ($Projet.Ville) créée par le menu « Champ rapporté » de
// Grist. grist.onRecord peut ne pas la livrer dans `record` (clé absente, `record[col] === undefined` : colonne pas cochée dans CE widget tant que la
// souscription 'normal' ne l'a pas complétée) - la variable la lisait alors dans `record` et n'affichait rien. Variables.rawRowOf la relit dans la table
// (fetchTable, une seule lecture par ligne livrée) ; la ligne livrée est ici fabriquée SANS ces clés, exactement ce que reçoit le widget dans ce cas.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'LkDossiers';

  // La ligne livrée par grist.onRecord SANS aucun des champs rapportés (Projet_*) : seuls Titre et Projet (affiché) sont dedans.
  const delivered = over => Object.assign({ id: 1, Titre: 'Dossier A', Projet: 'Alpha' }, over);
  const badge = (column, table) => `<span class="var-badge" data-table="${table || PAGE}" data-column="${column}" data-key="${table || PAGE}.${column}"></span>`;
  const badgeIf = (column, condition) => `<span class="var-badge" data-table="${PAGE}" data-column="${column}" data-key="${PAGE}.${column}" data-condition="${JSON.stringify(condition).replace(/"/g, '&quot;')}"></span>`;
  const DATE_1990 = () => VariableFormat.formatDate(631152000, { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key });

  // La page est sur LkDossiers. Projet est une Référence vers LkProjets ; les cinq colonnes Projet_* sont des champs rapportés de Projet (formules
  // $Projet.Ville, $Projet.Code, $Projet.Budget, $Projet.Lancement, $Projet.Responsable) : présentes dans la table, absentes de la ligne livrée.
  // Projet_Responsable est une Référence vers l'annuaire, affichée par une colonne d'aide comme fetchTable la renvoie.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('LkAnnuaire', { NomPrenom: 'Text' });
    stub.setRows('LkAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean' }, { id: 8, NomPrenom: 'Martin Anne' }]);
    stub.setVariables('LkProjets', { Nom: 'Text', Ville: 'Text', Code: 'Text' });
    stub.setRows('LkProjets', [{ id: 1, Nom: 'Alpha', Ville: 'Lyon', Code: 'P-01' }, { id: 2, Nom: 'Beta', Ville: 'Paris', Code: 'P-02' }]);
    stub.setVariables(PAGE, {
      Titre: 'Text', Projet: 'Ref:LkProjets', Projet_Ville: 'Text', Projet_Code: 'Text', Projet_Budget: 'Numeric', Projet_Lancement: 'Date',
      Projet_Responsable: 'Ref:LkAnnuaire', gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Projet: 'gristHelper_Display', Projet_Responsable: 'gristHelper_Display2' });
    stub.setRows(PAGE, [
      { id: 1, Titre: 'Dossier A', Projet: 1, Projet_Ville: 'Lyon', Projet_Code: 'P-01', Projet_Budget: 1500.5, Projet_Lancement: 631152000, Projet_Responsable: 7,
        gristHelper_Display: 'Alpha', gristHelper_Display2: 'Dupont Jean' },
      { id: 2, Titre: 'Dossier B', Projet: 2, Projet_Ville: 'Paris', Projet_Code: 'P-02', Projet_Budget: 0, Projet_Lancement: 662688000, Projet_Responsable: 0,
        gristHelper_Display: 'Beta', gristHelper_Display2: '' },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('LkProjets');
    await GristAPI.deleteLinkRule('LkAnnuaire');
  }

  async function renderReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, NO_HF);
    return reader;
  }
  async function readerText(html, record) { return (await renderReader(html, record)).querySelector('.reader-content').textContent; }
  // Même modèle pour une ligne lue par fetchTable, comme l'export en lot (forme brute : les champs rapportés y sont toujours).
  async function batchText(html, row) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, row);
    return box.textContent;
  }
  // Tables lues par fetchTable pendant `fn` - la seule façon de prouver « une seule lecture » ou « aucune lecture ».
  async function tablesRead(fn) {
    const original = grist.docApi.fetchTable;
    const read = [];
    grist.docApi.fetchTable = async (tableId) => { read.push(tableId); return original(tableId); };
    try { await fn(); } finally { grist.docApi.fetchTable = original; }
    return read;
  }
  const readsOfPage = read => read.filter(t => t === PAGE).length;

  cases.push({
    id: 'varlookup_champ_rapporte_absent_de_la_ligne_livree_s_affiche',
    description: 'Un champ rapporté de la table de la page que grist.onRecord n’a pas livré (texte, nombre, date, référence à colonne d’affichage) s’affiche en mode Lecture, comme à l’export en lot',
    run: async (h) => {
      await seed(h);
      const html = `<p>V=${badge('Projet_Ville')}|C=${badge('Projet_Code')}|B=${badge('Projet_Budget')}|D=${badge('Projet_Lancement')}|R=${badge('Projet_Responsable')}|T=${badge('Titre')}</p>`;
      window.__gristStub.fireRecord(delivered(), PAGE);
      await h.sleep(30);
      const record = GristAPI.getCurrentRecord();
      const absent = Object.keys(record).filter(k => k.indexOf('Projet_') === 0);
      const reading = await readerText(html, record);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const batch = await batchText(html, rows[0]);
      const expected = `V=Lyon|C=P-01|B=1500.5|D=${DATE_1990()}|R=Dupont Jean|T=Dossier A`;
      const pass = absent.length === 0 && reading === expected && batch === expected;
      return { pass, notes: JSON.stringify({ absent, reading, batch, expected }) };
    },
  });

  cases.push({
    id: 'varlookup_chaque_ligne_livree_relit_sa_propre_valeur',
    description: 'Passer à une autre ligne, ou revoir la même ligne après un changement de la donnée, donne la valeur actuelle du champ rapporté et jamais celle de la ligne précédente',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badge('Projet_Ville')}</p>`;
      const first = await readerText(html, delivered());
      const second = await readerText(html, delivered({ id: 2, Titre: 'Dossier B', Projet: 'Beta' }));
      // Grist recalcule la formule et redonne la ligne : un NOUVEL objet, donc une nouvelle lecture.
      window.__gristStub.setRows(PAGE, [
        { id: 1, Titre: 'Dossier A', Projet: 1, Projet_Ville: 'Nice', Projet_Code: 'P-01', Projet_Budget: 1500.5, Projet_Lancement: 631152000, Projet_Responsable: 7,
          gristHelper_Display: 'Alpha', gristHelper_Display2: 'Dupont Jean' },
        { id: 2, Titre: 'Dossier B', Projet: 2, Projet_Ville: 'Paris', Projet_Code: 'P-02', Projet_Budget: 0, Projet_Lancement: 662688000, Projet_Responsable: 0,
          gristHelper_Display: 'Beta', gristHelper_Display2: '' },
      ]);
      const afterChange = await readerText(html, delivered());
      const pass = first === 'Lyon' && second === 'Paris' && afterChange === 'Nice';
      return { pass, notes: JSON.stringify({ first, second, afterChange }) };
    },
  });

  // Chaque affichage du mode Lecture relit déjà toutes les tables pour son schéma (GristAPI.refreshSchema, js/reader-mode.js:render) : les lectures de la
  // table de la page qui sont l'affaire de la variable se comptent donc sur Variables.resolveVariable directement, sans rendu autour.
  cases.push({
    id: 'varlookup_colonne_livree_ne_coute_aucune_lecture',
    description: 'Une colonne que grist.onRecord a livrée - même vide ou nulle - ne relit jamais la table : la lecture supplémentaire est réservée aux colonnes absentes',
    run: async (h) => {
      await seed(h);
      const record = delivered({ Projet_Ville: 'Lyon', Projet_Code: '', Projet_Budget: null });
      const values = [];
      const read = await tablesRead(async () => {
        for (const column of ['Titre', 'Projet_Ville', 'Projet_Code', 'Projet_Budget']) values.push(await Variables.resolveVariable(PAGE, column, PAGE, record));
      });
      const pass = JSON.stringify(values) === JSON.stringify(['Dossier A', 'Lyon', '', '']) && read.length === 0;
      return { pass, notes: JSON.stringify({ values, read }) };
    },
  });

  cases.push({
    id: 'varlookup_plusieurs_colonnes_absentes_une_seule_lecture',
    description: 'Plusieurs champs rapportés absents de la même ligne se lisent avec UNE seule lecture de la table de la page, même demandés en même temps, et une ligne déjà lue n’est pas relue par la variable suivante',
    run: async (h) => {
      await seed(h);
      const record = delivered();
      const columns = ['Projet_Ville', 'Projet_Code', 'Projet_Budget', 'Projet_Lancement', 'Projet_Responsable'];
      let together;
      const read = await tablesRead(async () => { together = await Promise.all(columns.map(c => Variables.resolveVariable(PAGE, c, PAGE, record))); });
      const again = await tablesRead(async () => { await Variables.resolveVariable(PAGE, 'Projet_Code', PAGE, record); });
      // Le rendu du mode Lecture : cinq champs rapportés coûtent UNE lecture de plus que la même page sans aucun (le reste, la relecture du schéma, est le même).
      const withoutLookups = await tablesRead(async () => { await readerText(`<p>${badge('Titre')}</p>`, delivered()); });
      const withLookups = await tablesRead(async () => { await readerText(`<p>${columns.map(c => badge(c)).join('|')}</p>`, delivered()); });
      const pass = JSON.stringify(together) === JSON.stringify(['Lyon', 'P-01', '1500.5', DATE_1990(), 'Dupont Jean']) && readsOfPage(read) === 1 && again.length === 0
        && readsOfPage(withLookups) === readsOfPage(withoutLookups) + 1;
      return { pass, notes: JSON.stringify({ together, read, again, withoutLookups, withLookups }) };
    },
  });

  cases.push({
    id: 'varlookup_colonne_absente_partout_reste_vide_sans_erreur',
    description: 'Une colonne qui n’existe ni dans la ligne livrée ni dans la table donne une valeur vide, sans message d’erreur ; une ligne sans identifiant n’est jamais relue',
    run: async (h) => {
      await seed(h);
      const missing = await Variables.resolveVariable(PAGE, 'Inexistante', PAGE, delivered());
      const rawMissing = await Variables.resolveRawValue(PAGE, 'Inexistante', PAGE, delivered());
      let noId;
      const read = await tablesRead(async () => { noId = await Variables.resolveRawValue(PAGE, 'Projet_Ville', PAGE, { Titre: 'Nouvelle ligne' }); });
      const pass = missing === '' && rawMissing.error === undefined && rawMissing.value === undefined && noId.error === undefined && noId.value === undefined
        && readsOfPage(read) === 0;
      return { pass, notes: JSON.stringify({ missing, rawMissing, noId, read }) };
    },
  });

  cases.push({
    id: 'varlookup_lecture_de_la_table_impossible_reste_vide',
    description: 'Si la lecture de la table échoue (droits d’accès), la variable reste vide comme avant : ni erreur affichée ni blocage du rendu, et les colonnes livrées s’affichent toujours',
    run: async (h) => {
      await seed(h);
      const original = grist.docApi.fetchTable;
      let text;
      try {
        grist.docApi.fetchTable = async (tableId) => {
          if (tableId === PAGE) throw new Error('Blocked by table read access rules');
          return original(tableId);
        };
        text = await readerText(`<p>T=${badge('Titre')}|V=${badge('Projet_Ville')}|</p>`, delivered());
      } finally { grist.docApi.fetchTable = original; }
      return { pass: text === 'T=Dossier A|V=|', notes: JSON.stringify({ text }) };
    },
  });

  cases.push({
    id: 'varlookup_champ_rapporte_absent_comme_cle_de_liaison',
    description: 'Un champ rapporté absent de la ligne livrée, choisi comme clé de liaison avec une autre table (Projet_Code = Code), trouve la ligne liée : ses variables ne restent plus vides',
    run: async (h) => {
      await seed(h);
      await GristAPI.saveLinkRule('LkProjets', { mode: 'match', colonneCible: 'Code', colonneSource: 'Projet_Code' });
      const text = await readerText(`<p>N=${badge('Nom', 'LkProjets')}|V=${badge('Ville', 'LkProjets')}</p>`, delivered());
      const other = await readerText(`<p>N=${badge('Nom', 'LkProjets')}</p>`, delivered({ id: 2, Titre: 'Dossier B', Projet: 'Beta' }));
      const pass = text === 'N=Alpha|V=Lyon' && other === 'N=Beta';
      return { pass, notes: JSON.stringify({ text, other }) };
    },
  });

  cases.push({
    id: 'varlookup_condition_sur_champ_rapporte_absent',
    description: 'Une condition sur un champ rapporté absent de la ligne livrée le lit dans la table : elle est remplie (ou non) selon sa vraie valeur, en lecture comme dans ConditionRules',
    run: async (h) => {
      await seed(h);
      const isLyon = { column: 'Projet_Ville', operator: '=', value: 'Lyon' };
      const yes = await ConditionRules.matches(isLyon, PAGE, delivered());
      const no = await ConditionRules.matches(Object.assign({}, isLyon, { value: 'Paris' }), PAGE, delivered());
      const budget = await ConditionRules.matches({ column: 'Projet_Budget', operator: '>', value: '1000' }, PAGE, delivered());
      const html = `<p>A=${badgeIf('Titre', { mode: 'all', rules: [isLyon] })}|B=${badgeIf('Titre', { mode: 'all', rules: [Object.assign({}, isLyon, { value: 'Paris' })] })}|</p>`;
      const text = await readerText(html, delivered());
      const pass = yes === true && no === false && budget === true && text === 'A=Dossier A|B=|';
      return { pass, notes: JSON.stringify({ yes, no, budget, text }) };
    },
  });

  cases.push({
    id: 'varlookup_apercu_de_la_fenetre_de_cle_lit_le_champ_rapporte',
    description: 'La fenêtre de clé entre deux tables, avec un champ rapporté absent de la ligne livrée comme colonne source, annonce la ligne qui correspond (et pas « aucune ligne »)',
    run: async (h) => {
      await seed(h);
      window.__gristStub.fireRecord(delivered(), PAGE);
      await h.sleep(30);
      const closed = Variables.ensureLinkConfigured({ table: 'LkProjets' });
      await h.sleep(200);
      const source = document.getElementById('link-config-col-source');
      const cible = document.getElementById('link-config-col-cible');
      source.value = 'Projet_Code';
      source.dispatchEvent(new Event('change', { bubbles: true }));
      cible.value = 'Code';
      cible.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(200);
      const preview = document.getElementById('link-config-preview').textContent;
      document.getElementById('link-config-cancel').click();
      await closed;
      const expected = I18n.t('linkConfig.previewMatches', { count: 1, table: 'LkProjets', ids: '1' });
      const pass = source.value === 'Projet_Code' && cible.value === 'Code' && preview === expected;
      return { pass, notes: JSON.stringify({ preview, expected, source: source.value, cible: cible.value }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varLookup = cases;
})();
