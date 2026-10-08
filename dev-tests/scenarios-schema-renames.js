// Suite "schemaRenames" - suivi des renommages de tables et de colonnes faits dans Grist (js/schema-renames.js ; point 11 d'Antoine du 2026-10-02 : « si je change le nom d'une colonne
// sur Grist, est-ce que ça peut le changer dans la variable ? »). Deux étages :
//  - le mappeur et les réécritures SANS Grist, sur des schémas écrits à la main (instantané d'hier, schéma d'aujourd'hui) : colonne renommée, table renommée, chemin de références,
//    colonne supprimée, supprimée puis recréée (nouvel identifiant : introuvable), nom repris par une autre colonne, deux noms échangés, plus long nom d'abord dans un texte ;
//  - la passe entière sur le faux Grist, après un vrai renommage (dev-tests/grist-stub.js : renameColumn / renameTable gardent l'identifiant de ligne, comme Grist) : bulles, conditions,
//    boucles, calculs, images, QR codes, en-têtes et pieds, macro-modèles, champs de l'e-mail, clés de correspondance, lecture seule, personne qui a déjà commencé à modifier,
//    modèle affiché redessiné, passe rejouée sans rien écrire, un instantané par document.
// Le démarrage réel (appel de js/main.js, après l'affichage du modèle) est dans verify-schema-renames-open.mjs.
(function () {
  const cases = [];
  let documents = 0;
  const TABLE = 'Publipostage_Modeles';
  const LINKS = 'Publipostage_LiensTables';
  const PAGE = 'SrDossiers';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  const stub = () => window.__gristStub;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (name, value) => ` ${name}="${esc(typeof value === 'string' ? value : JSON.stringify(value))}"`;
  const trigger = () => Variables.triggerChar();
  const text = s => String(s).replace(/§/g, trigger()); // « § » dans les textes de ce fichier = la touche de déclenchement des variables
  const cond = (rules, mode) => ({ mode: mode || 'all', rules: rules.map(([column, operator, value]) => ({ column, operator, value })) });
  const badge = (table, column, extra) => `<span class="var-badge" contenteditable="false" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra || ''}>${trigger()}${table}.${column}</span>`;
  const dom = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
  const all = (html, selector) => Array.from(dom(html).querySelectorAll(selector));
  const json = (el, name) => { try { return JSON.parse(el.getAttribute(name)); } catch (e) { return undefined; } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const verdict = checks => { const failed = Object.keys(checks).filter(k => !checks[k]); return { pass: failed.length === 0, failed }; };

  // === Le schéma écrit à la main (étage 1) ===
  // Hier : Dossiers (Titre, Montant, MontantTTC, Projet -> Projets, Notes), Projets (Nom, Chef -> Annuaire), Annuaire (NomPrenom, Email).
  const OLD = { f: 1, t: {
    1: ['Dossiers', { 1: 'Titre', 2: 'Montant', 3: 'MontantTTC', 4: 'Projet', 5: 'Notes' }],
    2: ['Projets', { 6: 'Nom', 7: 'Chef' }],
    3: ['Annuaire', { 8: 'NomPrenom', 9: 'Email' }],
  } };
  // Aujourd'hui : Montant -> Total, Projet -> Programme, Notes supprimée ; Projets -> Portefeuille (Nom -> Intitule, Chef -> Responsable) ; Email -> Courriel.
  const NEW = { f: 1, t: {
    1: ['Dossiers', { 1: 'Titre', 2: 'Total', 3: 'MontantTTC', 4: 'Programme' }],
    2: ['Portefeuille', { 6: 'Intitule', 7: 'Responsable' }],
    3: ['Annuaire', { 8: 'NomPrenom', 9: 'Courriel' }],
  } };
  const NEW_REFS = { 4: 'Portefeuille', 7: 'Annuaire' };
  const mapper = () => SchemaRenames.createMapper(OLD, NEW, NEW_REFS);

  // === Les modèles sur le faux Grist (étage 2) ===
  const rowOf = id => stub().getRow(TABLE, id);
  const written = () => stub().getActionLog().filter(a => (a[1] === TABLE || a[1] === LINKS) && /^(Update|Add|Remove|BulkUpdate|BulkAdd|BulkRemove)Record$/.test(a[0]));
  const storageKeys = () => Object.keys(localStorage).filter(k => k.indexOf('pp_schema_') === 0 && k !== 'pp_schema_index');
  const ed = () => EditorCore.getEditor();
  const badgeNodes = () => { const out = []; ed().state.doc.descendants(node => { if (node.type.name === 'varBadge') out.push(node); }); return out; };

  // Retire les tables d'un scénario précédent (un nom renommé reste dans le faux Grist) : seules les tables « Sr… » partent, avec leurs identifiants.
  function purge() {
    stub().state.tables.filter(t => /^Sr[A-Z]/.test(t)).forEach(t => stub().dropTable(t));
  }

  // Page = SrDossiers ; Projet (liée par sa clé « id ») et Responsable sont ses deux Références ; SrLignes pointe vers la page (clé « match », plusieurs lignes possibles).
  async function seedSchema() {
    const s = stub();
    s.setVariables('SrAnnuaire', { NomPrenom: 'Text', Email: 'Text' });
    s.setVariables('SrProjets', { Nom: 'Text', Budget: 'Numeric', Chef: 'Ref:SrAnnuaire' });
    s.setVariables(PAGE, { Titre: 'Text', Montant: 'Numeric', MontantTTC: 'Numeric', Statut: 'Text', Notes: 'Text', Projet: 'Ref:SrProjets', Responsable: 'Ref:SrAnnuaire' });
    s.setVariables('SrLignes', { Dossier: 'Ref:' + PAGE, Designation: 'Text', Prix: 'Numeric' });
    s.setRows('SrAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr' }]);
    s.setRows('SrProjets', [{ id: 1, Nom: 'Projet Alpha', Budget: 5000, Chef: 7 }]);
    s.setRows(PAGE, [{ id: 1, Titre: 'Dossier 1', Montant: 1200, MontantTTC: 1440, Statut: 'Ouvert', Projet: 1, Responsable: 7 }]);
    s.setRows('SrLignes', [{ id: 1, Dossier: 1, Designation: 'Audit', Prix: 100 }, { id: 2, Dossier: 1, Designation: 'Livret', Prix: 50 }]);
    await GristAPI.refreshSchema();
    for (const t of ['SrAnnuaire', 'SrProjets', 'SrLignes']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('SrProjets', { mode: 'match', colonneCible: 'id', colonneSource: 'Projet' });
    await GristAPI.saveLinkRule('SrLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.saveLinkRule('SrAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    s.fireRecord({ id: 1, Titre: 'Dossier 1', Montant: 1200, MontantTTC: 1440, Statut: 'Ouvert', Projet: 1, Responsable: 7 }, PAGE);
  }

  // Un scénario de la passe entière : schéma neuf, table des modèles VIDE (les modèles des autres suites sont mis de côté, puis remis), aucun instantané. La page se remet comme avant.
  function scenario(id, description, body) {
    cases.push({
      id, description,
      run: async (h) => {
        await h.resetEditor();
        SchemaRenames.reset();
        stub().setDocId('sr-doc-' + (++documents)); // un document par scénario : aucun instantané ne passe de l'un à l'autre
        purge();
        await seedSchema();
        const rows = stub().state.rows[TABLE];
        const backup = JSON.parse(JSON.stringify(rows));
        const keptCurrent = Templates.getCurrentId();
        Object.keys(rows).forEach(k => { rows[k].length = 0; });
        await Templates.loadAll();
        Templates.setCurrentId(null);
        try {
          return await body(h);
        } finally {
          for (const rule of GristAPI.getAllLinkRules().filter(r => /^Sr[A-Z]/.test(r.tableCible))) await GristAPI.deleteLinkRule(rule.tableCible);
          purge();
          await GristAPI.refreshSchema();
          stub().state.rows[TABLE] = backup;
          await Templates.loadAll();
          Templates.setCurrentId(keptCurrent);
          SchemaRenames.reset();
          await h.resetEditor();
        }
      },
    });
  }

  // Enregistre un modèle comme le fait le widget (Templates.save) et rend son identifiant ; aucun modèle n'est « affiché » (identifiant courant effacé).
  async function addTemplate(spec) {
    const saved = await Templates.save(null, spec.nom, spec.html || '<p></p>', spec.pdf || '', spec.hf || NO_HF, null, spec.type || 'document', spec.email || null);
    Templates.setCurrentId(null);
    return saved.id;
  }

  // La passe, comme l'appelle js/main.js ; attend la fin d'une passe déjà en cours (celle du démarrage du harnais). `hooks` complète { isUntouched, notify }.
  async function pass(h, hooks) {
    const messages = [];
    const merged = Object.assign({ isUntouched: () => true, notify: m => messages.push(m) }, hooks || {});
    for (let i = 0; i < 80; i++) {
      const result = await SchemaRenames.checkAfterOpen(merged);
      if (result.skipped !== 'running') return Object.assign({ messages }, result);
      await h.sleep(50);
    }
    throw new Error('la passe précédente ne se termine pas');
  }
  const bootstrap = async h => { const r = await pass(h); if (!r.bootstrapped) throw new Error('première passe : ' + JSON.stringify(r)); return r; };
  const renamed = async fn => { fn(stub()); await GristAPI.refreshSchema(); };

  // ============================================================================================================
  // Étage 1 : le mappeur et les réécritures, sans Grist
  // ============================================================================================================
  cases.push({
    id: 'schemarenames_diff_lists_renames_by_identifier_and_ignores_deleted_columns',
    description: 'Comparer l’instantané d’hier au schéma d’aujourd’hui, identifiant par identifiant : une table et cinq colonnes renommées, la colonne supprimée et ce qui n’a pas bougé ne comptent pas ; rien à comparer = aucun renommage',
    run: async () => {
      const d = SchemaRenames.diff(OLD, NEW);
      const names = d.columns.map(c => `${c.table}.${c.from}>${c.to}`).sort();
      const nothing = SchemaRenames.diff(OLD, OLD);
      const checks = {
        tables: same(d.tables, [{ from: 'Projets', to: 'Portefeuille' }]),
        columns: same(names, ['Annuaire.Email>Courriel', 'Dossiers.Montant>Total', 'Dossiers.Projet>Programme', 'Portefeuille.Chef>Responsable', 'Portefeuille.Nom>Intitule']),
        any: d.any === true,
        nothing: nothing.any === false && nothing.tables.length === 0 && nothing.columns.length === 0,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(names) };
    },
  });

  cases.push({
    id: 'schemarenames_mapper_follows_columns_tables_and_paths_by_identifier',
    description: 'Une colonne renommée, une table renommée et un chemin « Projet.Chef.Email » se disent avec les noms d’aujourd’hui, chaque maillon se lisant dans la table que la colonne désigne aujourd’hui ; ce qui se lit déjà tel quel, une colonne supprimée, une table inconnue : rien',
    run: async () => {
      const m = mapper();
      const checks = {
        column: same(m.mapQualified('Dossiers', 'Montant'), { table: 'Dossiers', column: 'Total' }),
        tableAndColumn: same(m.mapQualified('Projets', 'Nom'), { table: 'Portefeuille', column: 'Intitule' }),
        onlyTheTable: same(m.mapQualified('Projets', 'Chef'), { table: 'Portefeuille', column: 'Responsable' }),
        path: same(m.mapQualified('Dossiers', 'Projet.Nom'), { table: 'Dossiers', column: 'Programme.Intitule' }),
        longPath: same(m.mapQualified('Dossiers', 'Projet.Chef.Email'), { table: 'Dossiers', column: 'Programme.Responsable.Courriel' }),
        readsAsWritten: m.mapQualified('Dossiers', 'Titre') === null && m.mapQualified('Dossiers', 'Total') === null && m.mapQualified('Portefeuille', 'Intitule') === null,
        deleted: m.mapQualified('Dossiers', 'Notes') === null,
        unknownTable: m.mapQualified('Inconnue', 'Montant') === null,
        unknownColumn: m.mapQualified('Dossiers', 'Jamais') === null,
        brokenPath: m.mapQualified('Dossiers', 'Projet.Jamais') === null,
        table: m.mapTable('Projets') === 'Portefeuille' && m.mapTable('Dossiers') === null && m.mapTable('Portefeuille') === null && m.mapTable('Inconnue') === null,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'schemarenames_mapper_never_touches_a_name_that_still_reads_and_cannot_follow_a_recreated_column',
    description: 'Un nom repris par une autre colonne, deux noms échangés : toujours lisibles, jamais réécrits ; une colonne supprimée puis recréée (autre identifiant) ou une Référence qui désigne une autre table : introuvable, laissée',
    run: async () => {
      const oldSchema = { f: 1, t: { 1: ['T', { 1: 'A', 2: 'B', 3: 'Montant', 4: 'Ref' }], 2: ['U', { 5: 'Nom' }], 3: ['V', { 6: 'Autre' }] } };
      // A et B échangent leurs noms ; Montant devient Total et un NOUVEAU Montant est créé (autre identifiant) ; Ref ne désigne plus U mais V.
      const swapped = { f: 1, t: { 1: ['T', { 1: 'B', 2: 'A', 3: 'Total', 4: 'Ref', 10: 'Montant' }], 2: ['U', { 5: 'Nom' }], 3: ['V', { 6: 'Autre' }] } };
      const m = SchemaRenames.createMapper(oldSchema, swapped, { 4: 'V' });
      const recreated = { f: 1, t: { 1: ['T', { 1: 'A', 2: 'B', 4: 'Ref', 11: 'Montant2' }], 2: ['U', { 5: 'Nom' }], 3: ['V', { 6: 'Autre' }] } };
      const m2 = SchemaRenames.createMapper(oldSchema, recreated, { 4: 'U' });
      const checks = {
        swapUntouched: m.mapQualified('T', 'A') === null && m.mapQualified('T', 'B') === null,
        reusedNameUntouched: m.mapQualified('T', 'Montant') === null, // se lit encore : la nouvelle colonne « Montant »
        retargetedReference: m.mapQualified('T', 'Ref.Nom') === null, // « Nom » était dans U, la Référence mène à V
        deletedAndRecreated: m2.mapQualified('T', 'Montant') === null,
        diffReportsThemAsRenames: SchemaRenames.diff(oldSchema, swapped).columns.length === 3, // A, B et Montant ont bien changé de nom, c'est mapQualified qui s'abstient
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'schemarenames_text_variables_are_read_longest_name_first_and_follow_a_path',
    description: 'Dans un texte (nom du PDF, champs de l’e-mail), « #Dossiers.MontantTTC » n’est pas lu comme « #Dossiers.Montant » suivi de « TTC », un chemin est lu jusqu’au bout, un nom inconnu reste ; rien d’autre n’est touché',
    run: async () => {
      const m = mapper();
      const t = trigger();
      const out = SchemaRenames.rewriteText(`Dossier ${t}Dossiers.Montant / ${t}Dossiers.MontantTTC / ${t}Projets.Nom / ${t}Dossiers.Projet.Chef.Email. ${t}Inconnue.Montant ${t}Dossiers.Titre fin`, m, t);
      const untouched = SchemaRenames.rewriteText(`${t}Dossiers.MontantTTC et ${t}Dossiers.Titre`, m, t);
      const noTrigger = SchemaRenames.rewriteText('Dossiers.Montant sans touche', m, t);
      const expected = `Dossier ${t}Dossiers.Total / ${t}Dossiers.MontantTTC / ${t}Portefeuille.Intitule / ${t}Dossiers.Programme.Responsable.Courriel. ${t}Inconnue.Montant ${t}Dossiers.Titre fin`;
      const checks = {
        rewritten: out.text === expected && out.count === 3,
        nothingToDo: untouched.count === 0 && untouched.text === `${t}Dossiers.MontantTTC et ${t}Dossiers.Titre`,
        noTrigger: noTrigger.count === 0 && noTrigger.text === 'Dossiers.Montant sans touche',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || out.text };
    },
  });

  cases.push({
    id: 'schemarenames_conditions_loops_formulas_and_macro_rules_are_rewritten_in_place',
    description: 'Condition (colonne nue = table de la page, « Table.Colonne », chemin), boucle (table, filtre et tri sur la table parcourue), formule enregistrée, règles d’un macro-modèle, en-tête et pied de page : seules les colonnes renommées changent, tout le reste est rendu tel quel',
    run: async () => {
      const m = mapper();
      const page = m.tableContext('Dossiers');
      // Une colonne nue est une colonne de la table de la page ; avec un point, le premier mot est une TABLE (ConditionRules.parseColumnRef) : un chemin de la page s'écrit « Dossiers.Projet.Nom ».
      const c = SchemaRenames.rewriteCondition(cond([['Montant', '>', '100'], ['Titre', '=', 'x'], ['Projets.Nom', '=', 'A'], ['Dossiers.Projet.Nom', '=', 'B'], ['Notes', '=', 'y']]), m, page);
      const untouched = cond([['Titre', '=', 'x']]);
      const same0 = SchemaRenames.rewriteCondition(untouched, m, page);
      const noPage = SchemaRenames.rewriteCondition(cond([['Montant', '=', '1'], ['Projets.Nom', '=', '2']]), m, null);
      const loop = SchemaRenames.rewriteLoop({ repeat: 'row', table: 'Projets', via: { table: 'Dossiers', column: 'Projet' }, filter: cond([['Nom', '=', 'A'], ['Projets.Chef', '=', 'z']]), sort: { column: 'Nom', direction: 'desc' }, empty: 'blank' }, m);
      const loopSame = { repeat: 'inline', table: 'Annuaire', via: null, filter: null, sort: { column: 'NomPrenom', direction: 'asc' } };
      const loopSameOut = SchemaRenames.rewriteLoop(loopSame, m);
      const formula = SchemaRenames.rewriteFormula('{Dossiers.Montant}*2+SUM({Projets.Nom};10)+{Dossiers.Titre}', m);
      const macro = SchemaRenames.rewriteMacro(JSON.stringify({ slots: [
        { type: 'conditional', rules: [{ column: 'Montant', operator: '>', value: '10', modeleId: 'a' }, { column: 'Projets.Nom', operator: '=', value: 'A', modeleId: 'b' }], defaultModeleId: null },
        { type: 'model', modeleId: 'c' },
      ] }), m, page);
      const hf = SchemaRenames.rewriteHeaderFooter(JSON.stringify({ enabled: true, differentFirstPage: true, header: { default: `<p>${badge('Dossiers', 'Montant')}</p>`, first: '<p>Première</p>' }, footer: { default: '<p>Pied</p>', first: '' } }), m, { page, trigger: trigger() });
      const hfData = JSON.parse(hf.text);
      const checks = {
        condition: same(c.condition.rules.map(r => r.column), ['Total', 'Titre', 'Portefeuille.Intitule', 'Dossiers.Programme.Intitule', 'Notes']) && c.count === 3 && c.condition.mode === 'all' && c.condition.rules[0].value === '100',
        conditionUntouchedIsTheSameObject: same0.count === 0 && same0.condition === untouched,
        conditionWithoutAPageKeepsBareColumns: same(noPage.condition.rules.map(r => r.column), ['Montant', 'Portefeuille.Intitule']) && noPage.count === 1,
        loop: loop.count === 5 && loop.loop.table === 'Portefeuille' && same(loop.loop.via, { table: 'Dossiers', column: 'Programme' }) && same(loop.loop.filter.rules.map(r => r.column), ['Intitule', 'Portefeuille.Responsable']) && loop.loop.sort.column === 'Intitule' && loop.loop.sort.direction === 'desc' && loop.loop.repeat === 'row' && loop.loop.empty === 'blank',
        loopUntouchedIsTheSameObject: loopSameOut.count === 0 && loopSameOut.loop === loopSame,
        formula: formula.count === 2 && formula.text === '{Dossiers.Total}*2+SUM({Portefeuille.Intitule};10)+{Dossiers.Titre}',
        macro: macro.count === 2 && same(JSON.parse(macro.text).slots[0].rules.map(r => r.column), ['Total', 'Portefeuille.Intitule']) && same(JSON.parse(macro.text).slots[1], { type: 'model', modeleId: 'c' }) && JSON.parse(macro.text).slots[0].rules[0].modeleId === 'a',
        headerFooter: hf.count === 1 && hfData.enabled === true && hfData.differentFirstPage === true && hfData.header.default.indexOf('data-column="Total"') !== -1 && hfData.header.first === '<p>Première</p>' && hfData.footer.default === '<p>Pied</p>',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'schemarenames_a_bare_column_that_another_table_still_has_is_left_where_the_loop_table_is_certain',
    description: 'Une colonne nue dont une autre table porte encore le nom (le modèle peut servir sur l’autre page) ne bouge pas, dans une condition comme dans un macro-modèle ; le filtre et le tri d’une boucle, sur une table certaine, suivent quand même',
    run: async () => {
      const shareOld = { f: 1, t: { 1: ['A', { 1: 'Statut', 2: 'Code' }], 2: ['B', { 3: 'Statut' }] } };
      const shareNew = { f: 1, t: { 1: ['A', { 1: 'Etat', 2: 'Reference' }], 2: ['B', { 3: 'Statut' }] } };
      const m = SchemaRenames.createMapper(shareOld, shareNew, {});
      const page = m.tableContext('A');
      const c = SchemaRenames.rewriteCondition(cond([['Statut', '=', 'x'], ['Code', '=', 'y'], ['A.Statut', '=', 'z']]), m, page, true);
      const macro = SchemaRenames.rewriteMacro(JSON.stringify({ slots: [{ type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'x', modeleId: '1' }, { column: 'Code', operator: '=', value: 'y', modeleId: '2' }] }] }), m, page);
      const loop = SchemaRenames.rewriteLoop({ repeat: 'inline', table: 'A', via: null, filter: cond([['Statut', '=', 'x']]), sort: { column: 'Statut', direction: 'asc' } }, m);
      const checks = {
        condition: same(c.condition.rules.map(r => r.column), ['Statut', 'Reference', 'A.Etat']) && c.count === 2,
        macro: same(JSON.parse(macro.text).slots[0].rules.map(r => r.column), ['Statut', 'Reference']) && macro.count === 1,
        loop: loop.count === 2 && loop.loop.filter.rules[0].column === 'Etat' && loop.loop.sort.column === 'Etat',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'schemarenames_each_part_of_a_loop_follows_on_its_own_and_an_unchanged_loop_comes_back_as_it_was',
    description: 'Dans une boucle, la table, le chemin « via », le filtre et le tri suivent chacun de leur côté (le filtre et le tri se lisent dans la table parcourue, renommée ou non) ; une boucle sans table, sans rien à changer ou à moitié écrite est rendue telle quelle, et l’original n’est jamais modifié',
    run: async () => {
      const m = mapper();
      const via = (table, column, extra) => Object.assign({ table, column }, extra || {});
      const sort = (column, direction) => ({ column, direction: direction || 'asc' });
      // [étiquette, boucle écrite, boucle attendue (null : rendue telle quelle), nombre de références réécrites]
      const variants = [
        ['table seule', { repeat: 'row', table: 'Projets' }, { repeat: 'row', table: 'Portefeuille' }, 1],
        ['via seul', { table: 'Dossiers', via: via('Dossiers', 'Projet', { label: 'x' }) }, { table: 'Dossiers', via: via('Dossiers', 'Programme', { label: 'x' }) }, 1],
        ['filtre seul', { table: 'Dossiers', filter: cond([['Montant', '>', '1'], ['Titre', '=', 'x']], 'any') }, { table: 'Dossiers', filter: cond([['Total', '>', '1'], ['Titre', '=', 'x']], 'any') }, 1],
        ['tri nu seul', { table: 'Dossiers', sort: sort('Montant', 'desc') }, { table: 'Dossiers', sort: sort('Total', 'desc') }, 1],
        ['tri avec nom de table', { table: 'Dossiers', sort: sort('Projets.Nom') }, { table: 'Dossiers', sort: sort('Portefeuille.Intitule') }, 1],
        ['table renommée, filtre et tri lus dans la nouvelle', { table: 'Projets', filter: cond([['Nom', '=', 'A']]), sort: sort('Chef') }, { table: 'Portefeuille', filter: cond([['Intitule', '=', 'A']]), sort: sort('Responsable') }, 3],
        ['via sans colonne', { table: 'Dossiers', via: { table: 'Dossiers' } }, null, 0],
        ['via vide', { table: 'Dossiers', via: null }, null, 0],
        ['via déjà lisible', { table: 'Dossiers', via: via('Dossiers', 'Titre') }, null, 0],
        ['filtre sans règle', { table: 'Dossiers', filter: { mode: 'all' } }, null, 0],
        ['filtre déjà lisible', { table: 'Dossiers', filter: cond([['Titre', '=', 'x']]) }, null, 0],
        ['tri sans colonne', { table: 'Dossiers', sort: { direction: 'asc' } }, null, 0],
        ['tri à colonne vide', { table: 'Dossiers', sort: sort('') }, null, 0],
        ['tri à colonne qui n’est pas un texte', { table: 'Dossiers', sort: sort(5) }, null, 0],
        ['tri déjà lisible', { table: 'Dossiers', sort: sort('Titre') }, null, 0],
        ['table inconnue', { table: 'Inconnue', filter: cond([['Montant', '=', '1']]), sort: sort('Montant') }, null, 0],
        ['table déjà lisible', { table: 'Portefeuille', filter: cond([['Intitule', '=', '1']]), sort: sort('Intitule') }, null, 0],
      ];
      const failed = [];
      for (const [label, written, expected, count] of variants) {
        const before = JSON.stringify(written);
        const out = SchemaRenames.rewriteLoop(written, m);
        const asWritten = expected === null;
        const ok = out.count === count && JSON.stringify(written) === before
          && (asWritten ? out.loop === written : out.loop !== written && same(out.loop, expected) && same(Object.keys(out.loop), Object.keys(expected)));
        if (!ok) failed.push(label + ' : ' + JSON.stringify(out));
      }
      // Sans table, ou qui n’est pas une boucle : rendue telle quelle, sans rien lire d’autre.
      for (const odd of [null, undefined, 'texte', 5, {}, { table: '' }, { table: null, filter: cond([['Montant', '=', '1']]) }]) {
        const out = SchemaRenames.rewriteLoop(odd, m);
        if (out.count !== 0 || out.loop !== odd) failed.push('boucle sans table ' + JSON.stringify(odd));
      }
      return { pass: failed.length === 0, notes: failed.join(' ; ') || variants.length + ' boucles' };
    },
  });

  cases.push({
    id: 'schemarenames_bare_columns_belong_to_the_page_table_only_for_a_template_of_that_page',
    description: 'Une colonne sans nom de table est lue dans la table de la page, mais un modèle qui ne nomme que d’autres tables n’est pas lu comme un modèle de cette page : ses colonnes nues restent ; un modèle qui nomme la page, ou aucune table, les voit suivre',
    run: async () => {
      const m = mapper();
      const ctx = { page: m.tableContext('Dossiers'), trigger: trigger() };
      const block = c => `<div class="conditional-text"${attr('data-condition', c)}><p>Texte</p></div>`;
      const bare = block(cond([['Montant', '>', '1']]));
      const none = SchemaRenames.rewriteHtml(bare, m, ctx);
      const named = SchemaRenames.rewriteHtml(`<p>${badge('Dossiers', 'Titre')}</p>${bare}`, m, ctx);
      const other = SchemaRenames.rewriteHtml(`<p>${badge('Annuaire', 'Email')}</p>${bare}`, m, ctx);
      const otherAndRenamed = SchemaRenames.rewriteHtml(`<p>${badge('Annuaire', 'Email')}</p>${bare}`, m, { page: null, trigger: trigger() });
      const checks = {
        noTableAtAll: none.count === 1 && none.html.indexOf('Total') !== -1,
        namesThePage: named.count === 1 && named.html.indexOf('Total') !== -1,
        namesOnlyAnotherTable: other.count === 1 && other.html.indexOf('Courriel') !== -1 && other.html.indexOf('Total') === -1 && other.html.indexOf('Montant') !== -1,
        noPageGiven: otherAndRenamed.count === 1 && otherAndRenamed.html.indexOf('Montant') !== -1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  });

  // ============================================================================================================
  // Étage 2 : la passe entière sur le faux Grist
  // ============================================================================================================
  scenario(
    'schemarenames_first_open_only_notes_the_schema_then_a_quiet_pass_writes_nothing',
    'La première ouverture d’un navigateur note le schéma et n’écrit rien (même un modèle qui nomme une colonne déjà introuvable), une passe sans renommage derrière n’écrit rien non plus ; l’instantané est rangé sous un seul document',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr déjà rouge', html: `<p>${badge(PAGE, 'Disparue')}${badge(PAGE, 'Montant')}</p>` });
      const before = rowOf(id).Contenu;
      stub().clearActionLog();
      const first = await bootstrap(h);
      const afterFirst = written().length;
      const second = await pass(h);
      const checks = {
        bootstrap: first.bootstrapped === true,
        nothingWritten: afterFirst === 0 && written().length === 0 && rowOf(id).Contenu === before,
        quiet: second.renames === 0 && !second.skipped && !second.bootstrapped,
        oneSnapshot: storageKeys().length === 1,
        noMessage: first.messages.length === 0 && second.messages.length === 0,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_column_of_the_page_table_follows_in_bubbles_conditions_formulas_and_text_fields',
    'Montant renommée « Total » dans Grist : la bulle (colonne, clé, texte) suit en gardant son format et sa condition, ainsi que la condition d’un bloc et d’une case, la formule d’un calcul et le nom du PDF ; MontantTTC, Titre, Statut, le nom et la date du modèle ne bougent pas, un autre modèle n’est pas écrit ; un seul envoi',
    async (h) => {
      const bubble = badge(PAGE, 'Montant', attr('data-format', { type: 'number', decimals: 2 }) + attr('data-condition', cond([['Statut', '=', 'Ouvert']])));
      const html = `<p>Total ${bubble} / ${badge(PAGE, 'Titre')} / ${badge(PAGE, 'MontantTTC')}</p>`
        + `<div class="conditional-text"${attr('data-condition', cond([['Montant', '>', '100']]))}><p>Gros dossier</p></div>`
        + `<p><span class="calc-badge"${attr('data-formula', '{SrDossiers.Montant}*2+{SrDossiers.MontantTTC}')}>= ancien libellé</span></p>`
        + `<p><span class="conditional-checkbox"${attr('data-condition', cond([['SrDossiers.Montant', '>', '0']]))}>☐</span></p>`;
      const id = await addTemplate({ nom: 'Sr bulles', html, pdf: text('§SrDossiers.Titre - §SrDossiers.Montant - §SrDossiers.MontantTTC') });
      const otherHtml = `<p>${badge('SrProjets', 'Nom')} ${badge(PAGE, 'Titre')}</p>`;
      const otherId = await addTemplate({ nom: 'Sr autre', html: otherHtml });
      const dateBefore = rowOf(id).DateModif;
      const otherBefore = rowOf(otherId);
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      stub().clearActionLog();
      const res = await pass(h);
      const row = rowOf(id);
      const bubbleOut = all(row.Contenu, '.var-badge')[0];
      const block = all(row.Contenu, '.conditional-text')[0];
      const calc = all(row.Contenu, '.calc-badge')[0];
      const box = all(row.Contenu, '.conditional-checkbox')[0];
      const updates = stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === TABLE);
      const checks = {
        summary: res.renames === 1 && res.templates === 1 && res.variables === 5 && res.links === 0,
        bubbleColumn: bubbleOut.getAttribute('data-column') === 'Total' && bubbleOut.getAttribute('data-key') === PAGE + '.Total' && bubbleOut.textContent === trigger() + PAGE + '.Total' && bubbleOut.getAttribute('data-table') === PAGE,
        bubbleKeepsFormatAndCondition: same(json(bubbleOut, 'data-format'), { type: 'number', decimals: 2 }) && same(json(bubbleOut, 'data-condition'), cond([['Statut', '=', 'Ouvert']])),
        otherBubblesUntouched: all(row.Contenu, '.var-badge').slice(1).map(b => b.getAttribute('data-key')).join() === PAGE + '.Titre,' + PAGE + '.MontantTTC',
        block: same(json(block, 'data-condition'), cond([['Total', '>', '100']])) && block.textContent === 'Gros dossier',
        calc: calc.getAttribute('data-formula') === '{SrDossiers.Total}*2+{SrDossiers.MontantTTC}' && calc.textContent.indexOf('SrDossiers.Total') !== -1 && calc.textContent.indexOf('ancien libellé') === -1,
        checkbox: same(json(box, 'data-condition'), cond([['SrDossiers.Total', '>', '0']])),
        pdfName: row.NomFichierPDF === text('§SrDossiers.Titre - §SrDossiers.Total - §SrDossiers.MontantTTC'),
        nameAndDateKept: row.Nom === 'Sr bulles' && row.DateModif === dateBefore,
        otherTemplateNotWritten: same(rowOf(otherId), otherBefore) && updates.length === 1 && updates[0][2] === id,
        oneBatch: written().length === 1,
        onlyChangedColumnsWritten: Object.keys(updates[0][3]).sort().join() === 'Contenu,NomFichierPDF',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_column_of_another_table_and_its_matching_key_follow',
    'Une colonne d’une autre table renommée suit dans ses bulles ; la clé de correspondance de cette table suit aussi (colonne de la table liée, colonne de la page) ; la clé « id » et les clés des autres tables ne bougent pas',
    async (h) => {
      await GristAPI.saveLinkRule('SrProjets', { mode: 'match', colonneCible: 'Nom', colonneSource: 'Titre' });
      const id = await addTemplate({ nom: 'Sr projets', html: `<p>${badge('SrProjets', 'Budget')} ${badge('SrProjets', 'Nom')}</p>` });
      await bootstrap(h);
      await renamed(s => { s.renameColumn('SrProjets', 'Budget', 'Enveloppe'); s.renameColumn('SrProjets', 'Nom', 'Intitule'); s.renameColumn(PAGE, 'Titre', 'Libelle'); });
      stub().clearActionLog();
      const res = await pass(h);
      const keys = all(rowOf(id).Contenu, '.var-badge').map(b => b.getAttribute('data-key'));
      const checks = {
        summary: res.renames === 3 && res.templates === 1 && res.links === 1,
        bubbles: same(keys, ['SrProjets.Enveloppe', 'SrProjets.Intitule']),
        projetsKey: same(GristAPI.getLinkRule('SrProjets') && [GristAPI.getLinkRule('SrProjets').mode, GristAPI.getLinkRule('SrProjets').colonneCible, GristAPI.getLinkRule('SrProjets').colonneSource], ['match', 'Intitule', 'Libelle']),
        otherKeys: same(GristAPI.getLinkRule('SrLignes') && [GristAPI.getLinkRule('SrLignes').colonneCible, GristAPI.getLinkRule('SrLignes').colonneSource], ['Dossier', 'id']) && GristAPI.getLinkRule('SrAnnuaire').colonneCible === 'id' && GristAPI.getLinkRule('SrAnnuaire').colonneSource === 'Responsable',
        stored: stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === LINKS).length === 1 && written().length === 2,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_paths_through_references_follow_each_hop_then_the_renamed_target_table',
    'Un chemin « Projet.Chef.NomPrenom » suit quand une de ses colonnes est renommée, à chaque maillon, texte du nom du PDF compris ; puis, la table qu’il traverse renommée à son tour (Ref:SrProjets -> Ref:SrPortefeuille), les bulles de CETTE table et sa clé la suivent et le chemin, lui, ne change pas',
    async (h) => {
      const id = await addTemplate({
        nom: 'Sr chemins',
        html: `<p>${badge(PAGE, 'Projet.Nom')} ${badge(PAGE, 'Projet.Chef.NomPrenom')} ${badge('SrProjets', 'Budget')}</p>`,
        pdf: text('§SrDossiers.Projet.Chef.Email - §SrDossiers.Projet.Nom'),
      });
      await bootstrap(h);
      await renamed(s => { s.renameColumn(PAGE, 'Projet', 'Programme'); s.renameColumn('SrProjets', 'Nom', 'Intitule'); s.renameColumn('SrProjets', 'Chef', 'Responsable'); s.renameColumn('SrAnnuaire', 'Email', 'Courriel'); });
      const first = await pass(h);
      const afterColumns = rowOf(id);
      const keysOf = html => all(html, '.var-badge').map(b => b.getAttribute('data-key'));
      await renamed(s => s.renameTable('SrProjets', 'SrPortefeuille'));
      const second = await pass(h);
      const afterTable = rowOf(id);
      const checks = {
        columns: same(keysOf(afterColumns.Contenu), [PAGE + '.Programme.Intitule', PAGE + '.Programme.Responsable.NomPrenom', 'SrProjets.Budget']),
        columnsStored: same(all(afterColumns.Contenu, '.var-badge').map(b => b.getAttribute('data-column')), ['Programme.Intitule', 'Programme.Responsable.NomPrenom', 'Budget']),
        pdf: afterColumns.NomFichierPDF === text('§SrDossiers.Programme.Responsable.Courriel - §SrDossiers.Programme.Intitule'),
        firstSummary: first.renames === 4 && first.templates === 1,
        table: same(keysOf(afterTable.Contenu), [PAGE + '.Programme.Intitule', PAGE + '.Programme.Responsable.NomPrenom', 'SrPortefeuille.Budget']),
        tableTextOfTheBubble: all(afterTable.Contenu, '.var-badge')[2].textContent === trigger() + 'SrPortefeuille.Budget',
        tableKey: !GristAPI.getLinkRule('SrProjets') && !!GristAPI.getLinkRule('SrPortefeuille') && GristAPI.getLinkRule('SrPortefeuille').colonneSource === 'Programme' && GristAPI.getLinkRule('SrPortefeuille').colonneCible === 'id',
        secondSummary: second.renames === 1 && second.templates === 1 && second.links === 1,
        noLeftoverRule: GristAPI.getAllLinkRules().filter(r => r.tableCible === 'SrProjets').length === 0,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_renamed_table_follows_in_bubbles_loops_macros_and_its_matching_key',
    'Une table renommée (SrLignes -> SrPrestations) et ses colonnes : les bulles de cette table, leur boucle (table, filtre et tri sur ses colonnes), les règles d’un macro-modèle et sa clé de correspondance suivent ; la clé reste d’une seule ligne',
    async (h) => {
      const loop = { repeat: 'inline', table: 'SrLignes', via: null, filter: cond([['Prix', '>', '10']]), sort: { column: 'Designation', direction: 'asc' }, empty: 'blank', emptyText: '', separator: ', ', lastSeparator: null };
      const id = await addTemplate({ nom: 'Sr lignes', html: `<p>${badge('SrLignes', 'Designation', attr('data-loop', loop) + ' data-loop-repeat="inline"')}</p>` });
      const macroId = await addTemplate({ nom: 'Sr macro', type: 'macro', html: JSON.stringify({ slots: [{ type: 'conditional', rules: [{ column: 'SrLignes.Prix', operator: '>', value: '5', modeleId: String(id) }, { column: 'Statut', operator: '=', value: 'Ouvert', modeleId: String(id) }], defaultModeleId: null }, { type: 'model', modeleId: String(id) }] }) });
      await bootstrap(h);
      await renamed(s => { s.renameTable('SrLignes', 'SrPrestations'); s.renameColumn('SrPrestations', 'Prix', 'Montant'); s.renameColumn('SrPrestations', 'Designation', 'Libelle'); s.renameColumn(PAGE, 'Statut', 'Etat'); });
      const res = await pass(h);
      const bubble = all(rowOf(id).Contenu, '.var-badge')[0];
      const loopOut = json(bubble, 'data-loop');
      const slots = JSON.parse(rowOf(macroId).Contenu).slots;
      const rule = GristAPI.getLinkRule('SrPrestations');
      const checks = {
        bubble: bubble.getAttribute('data-table') === 'SrPrestations' && bubble.getAttribute('data-column') === 'Libelle' && bubble.getAttribute('data-key') === 'SrPrestations.Libelle' && bubble.textContent === trigger() + 'SrPrestations.Libelle',
        loop: !!loopOut && loopOut.table === 'SrPrestations' && same(loopOut.filter, cond([['Montant', '>', '10']])) && same(loopOut.sort, { column: 'Libelle', direction: 'asc' }) && loopOut.repeat === 'inline' && loopOut.separator === ', ' && loopOut.via === null && bubble.getAttribute('data-loop-repeat') === 'inline',
        macro: same(slots[0].rules.map(r => r.column), ['SrPrestations.Montant', 'Etat']) && slots[0].rules.every(r => r.modeleId === String(id)) && same(slots[1], { type: 'model', modeleId: String(id) }),
        key: !GristAPI.getLinkRule('SrLignes') && !!rule && rule.mode === 'match' && rule.colonneCible === 'Dossier' && rule.colonneSource === 'id',
        oneKey: GristAPI.getAllLinkRules().filter(r => /^Sr/.test(r.tableCible)).length === 3,
        summary: res.renames === 4 && res.templates === 2 && res.links === 1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_renamed_page_table_follows_and_its_bare_columns_are_read_in_the_renamed_table',
    'La table de la page elle-même renommée (SrDossiers -> SrAffaires) : les bulles qui la nomment suivent, les conditions sans nom de table sont lues dans la table renommée et suivent leur colonne renommée ; la clé qui pointe vers la page suit',
    async (h) => {
      const html = `<p>${badge(PAGE, 'Titre')}</p><div class="conditional-text"${attr('data-condition', cond([['Statut', '=', 'Ouvert']]))}><p>Ouvert</p></div>`;
      const id = await addTemplate({ nom: 'Sr page', html });
      await bootstrap(h);
      await renamed(s => { s.renameTable(PAGE, 'SrAffaires'); s.renameColumn('SrAffaires', 'Statut', 'Etat'); });
      stub().fireRecord({ id: 1, Titre: 'Dossier 1', Etat: 'Ouvert' }, 'SrAffaires');
      const res = await pass(h);
      const row = rowOf(id);
      const checks = {
        bubble: all(row.Contenu, '.var-badge')[0].getAttribute('data-key') === 'SrAffaires.Titre' && all(row.Contenu, '.var-badge')[0].getAttribute('data-table') === 'SrAffaires',
        bare: same(json(all(row.Contenu, '.conditional-text')[0], 'data-condition'), cond([['Etat', '=', 'Ouvert']])),
        keysKeepTheirPageColumns: GristAPI.getLinkRule('SrProjets').colonneSource === 'Projet' && GristAPI.getLinkRule('SrLignes').colonneCible === 'Dossier',
        summary: res.renames === 2 && res.templates === 1 && res.variables === 2,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_images_qr_codes_headers_footers_and_email_fields_follow',
    'Une image liée à une colonne, un QR code qui cite deux colonnes, l’en-tête de la première page, le pied de page, et les champs À, Cc, Cci et Objet d’un modèle e-mail : tout suit, l’en-tête et le pied gardent leurs réglages',
    async (h) => {
      const img = `<img class="editor-image" alt="Logo" style="width: 80px"${attr('data-var-table', PAGE)}${attr('data-var-column', 'Montant')}${attr('data-var-key', PAGE + '.Montant')}>`;
      const qr = `<img class="editor-image" alt="QR code" style="width: 120px; aspect-ratio: 1 / 1"${attr('data-qr-text', text('https://ex.fr/§SrDossiers.Montant?t=§SrDossiers.Titre'))}>`;
      const hf = { enabled: true, differentFirstPage: true, header: { default: `<p>${badge(PAGE, 'Titre')}</p>`, first: `<p>Première ${badge(PAGE, 'Montant')}</p>` }, footer: { default: `<p>Page ${badge(PAGE, 'Montant')}</p>`, first: '' } };
      const id = await addTemplate({ nom: 'Sr images', html: `<p>${img}${qr}</p>`, hf });
      const mailId = await addTemplate({
        nom: 'Sr mail', type: 'email', html: `<p>Bonjour ${badge(PAGE, 'Montant')}</p>`,
        email: { destinataires: text('§SrDossiers.Responsable.Email; §SrDossiers.Titre'), cc: text('§SrDossiers.Montant'), cci: '', objet: text('Dossier §SrDossiers.Montant') },
      });
      await bootstrap(h);
      await renamed(s => { s.renameColumn(PAGE, 'Montant', 'Total'); s.renameColumn('SrAnnuaire', 'Email', 'Courriel'); });
      const res = await pass(h);
      const row = rowOf(id);
      const [imgOut, qrOut] = all(row.Contenu, 'img.editor-image');
      const hfOut = JSON.parse(row.HeaderFooter);
      const mail = rowOf(mailId);
      const checks = {
        image: imgOut.getAttribute('data-var-column') === 'Total' && imgOut.getAttribute('data-var-key') === PAGE + '.Total' && imgOut.getAttribute('data-var-table') === PAGE && imgOut.getAttribute('style') === 'width: 80px',
        qr: qrOut.getAttribute('data-qr-text') === text('https://ex.fr/§SrDossiers.Total?t=§SrDossiers.Titre') && qrOut.getAttribute('style').indexOf('aspect-ratio') !== -1,
        headerFooter: hfOut.enabled === true && hfOut.differentFirstPage === true && all(hfOut.header.default, '.var-badge')[0].getAttribute('data-key') === PAGE + '.Titre'
          && all(hfOut.header.first, '.var-badge')[0].getAttribute('data-key') === PAGE + '.Total' && all(hfOut.footer.default, '.var-badge')[0].getAttribute('data-key') === PAGE + '.Total' && hfOut.footer.first === '',
        emailFields: mail.Destinataires === text('§SrDossiers.Responsable.Courriel; §SrDossiers.Titre') && mail.Cc === text('§SrDossiers.Total') && mail.Cci === '' && mail.Objet === text('Dossier §SrDossiers.Total'),
        emailBody: all(mail.Contenu, '.var-badge')[0].getAttribute('data-key') === PAGE + '.Total' && mail.TypeModele === 'email',
        summary: res.renames === 2 && res.templates === 2,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_email_and_file_name_fields_written_as_html_follow_a_renamed_column_table_and_loop',
    'Objet et nom du PDF écrits en HTML (js/field-codec.js : une bulle à condition ou à format, une boucle dans la phrase) suivent un renommage de colonne puis de table comme les bulles du corps - colonne, clé et texte de la bulle, colonne de sa condition, format, table et filtre de la boucle -, le champ À resté en texte brut suit comme avant ; une puce de l’Objet (date du jour) n’est pas touchée ; un champ vide reste vide',
    async (h) => {
      const bubbleItem = (table, column, extra) => ({ badge: Object.assign({ table, column, key: table + '.' + column, format: null, condition: null, loop: null }, extra || {}) });
      const field = list => FieldCodec.serializeRich(list);
      const loop = { repeat: 'inline', table: 'SrLignes', via: null, filter: cond([['Prix', '>', '10']]), sort: { column: 'Designation', direction: 'asc' }, empty: 'blank', emptyText: '', separator: ', ', lastSeparator: null };
      const objet = field([
        { text: 'Dossier ' }, bubbleItem(PAGE, 'Montant', { format: { type: 'number', decimals: 2 }, condition: cond([['Statut', '=', 'Ouvert']]) }),
        { text: ' - ' }, bubbleItem('SrLignes', 'Designation', { loop }), { text: ' le ' }, { chip: { kind: 'date' } },
      ]);
      const pdf = field([bubbleItem(PAGE, 'Titre'), { text: ' - ' }, bubbleItem(PAGE, 'MontantTTC', { condition: cond([['Montant', '>', '100']]) })]);
      const id = await addTemplate({ nom: 'Sr mail riche', type: 'email', html: '<p>Bonjour</p>', pdf, email: { destinataires: text('§SrDossiers.Responsable.Email'), cc: '', cci: '', objet } });
      await bootstrap(h);
      await renamed(s => { s.renameColumn(PAGE, 'Montant', 'Total'); s.renameColumn('SrLignes', 'Prix', 'Tarif'); s.renameColumn('SrAnnuaire', 'Email', 'Courriel'); });
      const first = await pass(h);
      const afterColumns = rowOf(id);
      await renamed(s => s.renameTable('SrLignes', 'SrPrestations'));
      const second = await pass(h);
      const row = rowOf(id);
      const subject = FieldCodec.itemsOf(row.Objet).filter(item => item.badge).map(item => item.badge);
      const name = FieldCodec.itemsOf(row.NomFichierPDF).filter(item => !FieldCodec.isText(item)).map(item => item.badge);
      const loopOut = LoopRules.normalizeLoop(subject[1] && subject[1].loop);
      const checks = {
        stillHtml: FieldCodec.isRich(row.Objet) && FieldCodec.isRich(row.NomFichierPDF),
        amount: subject[0].column === 'Total' && subject[0].key === PAGE + '.Total' && subject[0].table === PAGE,
        amountKeepsFormatAndCondition: same(subject[0].format, { type: 'number', decimals: 2 }) && same(subject[0].condition, cond([['Statut', '=', 'Ouvert']])),
        text: FieldCodec.itemsOf(row.Objet).length === 6 && all(row.Objet, '.var-badge')[0].textContent === trigger() + PAGE + '.Total',
        chipUntouched: same(FieldCodec.itemsOf(row.Objet).filter(FieldCodec.isChip).map(item => item.chip.kind), ['date']) && all(row.Objet, '.smart-chip').length === 1,
        loopTable: subject[1].table === 'SrPrestations' && subject[1].key === 'SrPrestations.Designation' && !!loopOut && loopOut.table === 'SrPrestations',
        loopFilterAndSort: !!loopOut && same(loopOut.filter, cond([['Tarif', '>', '10']])) && !!loopOut.sort && loopOut.sort.column === 'Designation',
        fileName: name.length === 2 && name[0].key === PAGE + '.Titre' && name[1].key === PAGE + '.MontantTTC' && same(name[1].condition, cond([['Total', '>', '100']])),
        plainField: row.Destinataires === text('§SrDossiers.Responsable.Courriel'),
        emptyFields: row.Cc === '' && row.Cci === '',
        summaries: first.renames === 3 && first.templates === 1 && second.renames === 1 && second.templates === 1,
        firstPassAlreadyRewroteTheColumns: FieldCodec.itemsOf(afterColumns.Objet).filter(item => item.badge)[0].badge.column === 'Total',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_a_name_that_still_reads_is_never_rewritten_and_a_deleted_column_is_left_alone',
    'Une colonne renommée dont le nom est repris par une AUTRE colonne, deux noms échangés, une colonne supprimée, une supprimée puis remplacée par une colonne neuve : leurs bulles restent comme elles étaient ; un vrai renommage fait en même temps suit quand même ; rien ne plante',
    async (h) => {
      const html = `<p>${badge(PAGE, 'Montant')} ${badge(PAGE, 'Titre')} ${badge(PAGE, 'Statut')} ${badge('SrLignes', 'Prix')} ${badge(PAGE, 'MontantTTC')} ${badge(PAGE, 'Notes')}</p>`;
      const id = await addTemplate({ nom: 'Sr lisibles', html });
      await bootstrap(h);
      await renamed(s => {
        s.renameColumn(PAGE, 'Montant', 'Total'); // « Montant » est repris ci-dessous par une nouvelle colonne
        s.setVariables(PAGE, Object.assign({}, s.state.columns[PAGE], { Montant: 'Text' }), null, {}, {});
        s.renameColumn(PAGE, 'Titre', 'tmp'); s.renameColumn(PAGE, 'Statut', 'Titre'); s.renameColumn(PAGE, 'tmp', 'Statut'); // Titre et Statut échangés
        s.renameColumn(PAGE, 'MontantTTC', 'TotalTTC'); // le vrai renommage
        s.deleteColumn('SrLignes', 'Prix'); // supprimée
        s.deleteColumn(PAGE, 'Notes'); // supprimée, puis une colonne neuve (autre identifiant) : on ne peut pas savoir que c'est « la même »
        s.setVariables(PAGE, Object.assign({}, s.state.columns[PAGE], { Remarques: 'Text' }), null, {}, {});
      });
      stub().clearActionLog();
      const res = await pass(h);
      const keys = all(rowOf(id).Contenu, '.var-badge').map(b => b.getAttribute('data-key'));
      const checks = {
        untouched: same(keys.slice(0, 4), [PAGE + '.Montant', PAGE + '.Titre', PAGE + '.Statut', 'SrLignes.Prix']) && keys[5] === PAGE + '.Notes',
        realRename: keys[4] === PAGE + '.TotalTTC',
        summary: res.renames === 4 && res.templates === 1 && res.variables === 1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_nothing_is_written_in_read_only_and_the_snapshot_does_not_move',
    'Un lecteur (droits Réglages > Accès) n’écrit rien : ni modèle, ni clé, ni instantané ; la passe d’une personne qui peut modifier, ensuite, réécrit comme si de rien n’était',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr lecteur', html: `<p>${badge(PAGE, 'Montant')}</p>` });
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      const before = rowOf(id).Contenu;
      const original = AccessRights.get;
      const snapshots = () => JSON.stringify(storageKeys().map(k => localStorage.getItem(k)));
      const snapshotsBefore = snapshots();
      let res;
      stub().clearActionLog();
      AccessRights.get = () => Object.assign({}, original(), { readOnly: true });
      try { res = await pass(h); } finally { AccessRights.get = original; }
      const readerWrites = written().length;
      const snapshotMoved = snapshots() !== snapshotsBefore;
      const unchanged = rowOf(id).Contenu === before;
      const later = await pass(h);
      const checks = {
        skipped: res.skipped === 'readOnly' && res.messages.length === 0,
        nothingWritten: readerWrites === 0 && unchanged && !snapshotMoved && storageKeys().length === 1,
        laterRewrites: later.renames === 1 && later.templates === 1 && all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Total' && before.indexOf('data-column="Montant"') !== -1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_nothing_is_written_once_the_person_started_editing_and_the_pass_resumes_next_time',
    'Quand la personne a déjà commencé à modifier le modèle affiché, rien n’est écrit et l’instantané n’avance pas ; à l’ouverture suivante la passe reprend et réécrit ; une modification faite entre l’écriture et le redessin garde l’instantané en arrière (la passe se rejoue)',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr occupé', html: `<p>${badge(PAGE, 'Montant')}</p>` });
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      const before = rowOf(id).Contenu;
      stub().clearActionLog();
      const busy = await pass(h, { isUntouched: () => false });
      const untouchedRow = rowOf(id).Contenu === before && written().length === 0;
      const resumed = await pass(h);
      const done = all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Total';

      // Une nouvelle personne, un nouveau renommage ; l'instantané doit rester en arrière si la personne se met à modifier PENDANT la passe, sur le modèle affiché.
      await renamed(s => s.renameColumn(PAGE, 'Total', 'Somme'));
      Templates.setCurrentId(id);
      await Templates.loadAll();
      const select = document.getElementById('template-select');
      const option = document.createElement('option');
      option.value = String(id); option.textContent = 'Sr occupé';
      select.appendChild(option);
      select.value = String(id);
      let calls = 0;
      const midway = await pass(h, { isUntouched: () => ++calls <= 1 }); // intacte avant d'écrire, plus après
      option.remove(); select.value = '';
      Templates.setCurrentId(null);
      const retried = await pass(h);
      const checks = {
        busySkipped: busy.skipped === 'touched' && busy.renames === 1 && busy.templates === 1,
        busyWroteNothing: untouchedRow,
        resumed: resumed.renames === 1 && resumed.templates === 1 && !resumed.skipped && done,
        midwaySkipped: midway.skipped === 'touched' && midway.redisplayed === false && all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Somme',
        midwayRetry: retried.renames === 1 && !retried.skipped,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_displayed_template_is_redrawn_with_the_new_name_without_becoming_unsaved_and_the_message_says_so',
    'Le modèle affiché est redessiné avec la colonne renommée (la bulle n’est plus rouge, rien à enregistrer, aucune question en changeant de modèle) et le coin d’état le dit, au singulier comme au pluriel, en français et en anglais ; un modèle non affiché ne redessine rien',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr affiché', html: `<p>${badge(PAGE, 'Montant')} ${badge(PAGE, 'MontantTTC')}</p>` });
      const otherId = await addTemplate({ nom: 'Sr non affiché', html: `<p>${badge(PAGE, 'MontantTTC')}</p>` });
      await Templates.loadAll();
      const select = document.getElementById('template-select');
      const option = document.createElement('option');
      option.value = String(id); option.textContent = 'Sr affiché';
      select.appendChild(option);
      select.value = String(id);
      select.dispatchEvent(new Event('change', { bubbles: true })); // le vrai chemin : choisir le modèle dans la liste
      await h.sleep(400);
      const shownBefore = badgeNodes().map(n => n.attrs.column);
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      const brokenBefore = VariableColumn.isBroken({ table: PAGE, column: 'Montant' });
      const prompts = h.choosePrompts.length;
      const res = await inLang('fr', () => pass(h));
      await h.sleep(300);
      const shownAfter = badgeNodes().map(n => n.attrs.column);
      const brokenAfter = badgeNodes().some(n => VariableColumn.isBroken(n.attrs));
      select.dispatchEvent(new Event('change', { bubbles: true })); // quitter un modèle « non modifié » ne pose aucune question
      await h.sleep(300);
      const asked = h.choosePrompts.length - prompts;

      await renamed(s => { s.renameColumn(PAGE, 'MontantTTC', 'TotalTTC'); s.renameColumn(PAGE, 'Titre', 'Libelle'); });
      const english = await inLang('en', () => pass(h));
      await h.sleep(200);
      await renamed(s => s.renameColumn(PAGE, 'Statut', 'Etat'));
      const quiet = await inLang('fr', () => pass(h)); // un renommage qu'aucun modèle ne nomme : rien à dire
      option.remove(); select.value = '';
      Templates.setCurrentId(null);
      const checks = {
        shownBefore: same(shownBefore, ['Montant', 'MontantTTC']),
        wasBroken: brokenBefore === true,
        redrawn: res.redisplayed === true && same(shownAfter, ['Total', 'MontantTTC']),
        notBroken: brokenAfter === false,
        notUnsaved: asked === 0,
        messageFr: res.messages.length === 1 && res.messages[0] === 'Mis à jour après un renommage dans Grist : 1 variable dans 1 modèle.',
        messageEn: english.messages.length === 1 && english.messages[0] === 'Updated after a rename in Grist: 2 variables in 2 templates.',
        quiet: quiet.messages.length === 0 && quiet.templates === 0 && quiet.renames === 1,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ fr: res.messages, en: english.messages, otherId }) };
    },
  );

  scenario(
    'schemarenames_message_counts_links_in_plural_and_a_second_pass_is_quiet',
    'Le coin d’état compte aussi les clés de correspondance (singulier, pluriel) ; une deuxième passe sur le même schéma n’écrit plus rien, et un modèle sans rapport reste identique à l’octet près',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr deux', html: `<p>${badge(PAGE, 'Montant')} ${badge('SrLignes', 'Prix')}</p>` });
      const otherId = await addTemplate({ nom: 'Sr sans rapport', html: `<p>Texte ${badge(PAGE, 'Titre')}</p>`, pdf: text('§SrDossiers.Titre') });
      const otherBefore = JSON.stringify(rowOf(otherId));
      await bootstrap(h);
      await renamed(s => { s.renameColumn(PAGE, 'Montant', 'Total'); s.renameTable('SrLignes', 'SrPrestations'); s.renameTable('SrAnnuaire', 'SrContacts'); });
      const res = await inLang('fr', () => pass(h));
      stub().clearActionLog();
      const again = await pass(h);
      const checks = {
        message: res.messages[0] === 'Mis à jour après un renommage dans Grist : 2 variables dans 1 modèle, 2 clés de correspondance.',
        quietAfter: again.renames === 0 && again.messages.length === 0 && written().length === 0,
        other: JSON.stringify(rowOf(otherId)) === otherBefore,
        template: all(rowOf(id).Contenu, '.var-badge').map(b => b.getAttribute('data-key')).join() === PAGE + '.Total,SrPrestations.Prix',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify(res.messages) };
    },
  );

  scenario(
    'schemarenames_without_the_page_table_nothing_is_written_and_the_pass_waits_for_the_next_opening',
    'Tant que la table de la page est inconnue (aucune ligne reçue, grist.getTable muet), la passe n’écrit rien et l’instantané n’avance pas : une colonne sans nom de table ne se lirait pas, la passe reprend à l’ouverture suivante',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr page inconnue', html: `<p>${badge(PAGE, 'Titre')}</p><div class="conditional-text"${attr('data-condition', cond([['Montant', '>', '1']]))}><p>Texte</p></div>` });
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      const current = GristAPI.getCurrentTableId;
      const detect = GristAPI.detectTableId;
      let res;
      stub().clearActionLog();
      GristAPI.getCurrentTableId = () => null;
      GristAPI.detectTableId = async () => null;
      try { res = await pass(h); } finally { GristAPI.getCurrentTableId = current; GristAPI.detectTableId = detect; }
      const writesWhileUnknown = written().length;
      const later = await pass(h);
      const checks = {
        skipped: res.skipped === 'noPage' && res.messages.length === 0 && writesWhileUnknown === 0,
        laterFollows: later.renames === 1 && later.templates === 1 && same(json(all(rowOf(id).Contenu, '.conditional-text')[0], 'data-condition'), cond([['Total', '>', '1']])),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_a_key_already_set_for_the_renamed_table_is_kept_and_a_shared_column_name_is_not_rewritten',
    'Quand la table renommée a déjà sa propre clé, celle de l’ancien nom n’est pas recopiée par-dessus ; la colonne source d’une clé n’est réécrite que si aucune autre table n’a une colonne de ce nom',
    async (h) => {
      // La personne a déjà posé une clé pour SrPortefeuille avant que SrProjets ne prenne ce nom.
      await GristAPI.saveLinkRule('SrPortefeuille', { mode: 'match', colonneCible: 'Code', colonneSource: 'Titre' });
      // « Responsable » est aussi le nom d'une colonne d'une AUTRE table (SrProjets, ajoutée en dernière colonne avant la première passe).
      await renamed(s => s.setVariables('SrProjets', { Nom: 'Text', Budget: 'Numeric', Chef: 'Ref:SrAnnuaire', Responsable: 'Text' }));
      await bootstrap(h);
      await renamed(s => { s.renameTable('SrProjets', 'SrPortefeuille'); s.renameColumn(PAGE, 'Responsable', 'Contact'); });
      stub().clearActionLog();
      const res = await pass(h);
      const portefeuille = GristAPI.getLinkRule('SrPortefeuille');
      const old = GristAPI.getLinkRule('SrProjets');
      const annuaire = GristAPI.getLinkRule('SrAnnuaire');
      const checks = {
        keptTheirs: !!portefeuille && portefeuille.colonneCible === 'Code' && portefeuille.colonneSource === 'Titre',
        oldOneStays: !!old && old.colonneSource === 'Projet' && old.colonneCible === 'id',
        sharedNameLeft: !!annuaire && annuaire.colonneSource === 'Responsable',
        nothingWritten: written().length === 0 && res.links === 0,
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || JSON.stringify({ res, portefeuille, old, annuaire }) };
    },
  );

  scenario(
    'schemarenames_snapshots_are_kept_per_document_and_the_oldest_ones_are_forgotten',
    'Un instantané par document : un autre document ne reprend pas celui-ci (première ouverture, rien d’écrit), et celui-ci le retrouve ; au-delà de 30 documents les plus anciens sont oubliés',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr documents', html: `<p>${badge(PAGE, 'Montant')}</p>` });
      stub().setDocId('doc-A');
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      stub().setDocId('doc-B');
      const other = await pass(h);
      const untouched = all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Montant';
      stub().setDocId('doc-A');
      const back = await pass(h);
      const rewritten = all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Total';
      for (let i = 0; i < 31; i++) { stub().setDocId('cap-' + i); await pass(h); }
      const keys = storageKeys();
      const index = JSON.parse(localStorage.getItem('pp_schema_index') || '[]');
      const checks = {
        otherDocumentOnlyNotes: other.bootstrapped === true && untouched,
        sameDocumentFollows: back.renames === 1 && back.templates === 1 && rewritten,
        capped: keys.length === 30 && index.length === 30,
        oldestForgotten: !keys.some(k => k.indexOf('doc-A') !== -1) && keys.some(k => k.indexOf('cap-30') !== -1) && !keys.some(k => k.indexOf('cap-0') !== -1) && keys.some(k => k.indexOf('cap-1') !== -1),
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  scenario(
    'schemarenames_survives_unavailable_storage_and_a_failing_read_without_writing',
    'Sans stockage utilisable la passe ne réécrit jamais rien (elle ne peut que noter) ; sans aucune table lisible elle n’avance pas l’instantané ; une lecture du schéma qui échoue rejette la promesse sans rien écrire, le verrou se relâche et la passe suivante marche',
    async (h) => {
      const id = await addTemplate({ nom: 'Sr pannes', html: `<p>${badge(PAGE, 'Montant')}</p>` });
      await bootstrap(h);
      await renamed(s => s.renameColumn(PAGE, 'Montant', 'Total'));
      const before = rowOf(id).Contenu;
      const getItem = Storage.prototype.getItem;
      const setItem = Storage.prototype.setItem;
      let noStorage;
      stub().clearActionLog();
      Storage.prototype.getItem = function () { throw new Error('stockage refusé'); };
      Storage.prototype.setItem = function () { throw new Error('stockage refusé'); };
      try { noStorage = await pass(h); } finally { Storage.prototype.getItem = getItem; Storage.prototype.setItem = setItem; }
      const writesWithoutStorage = written().length;
      const unchangedWithoutStorage = rowOf(id).Contenu === before;

      // Aucune table lisible (la liste des tables n'est pas rendue) : la passe n'avance pas l'instantané, seule mémoire des anciens noms.
      const tablesOf = GristAPI.getTables;
      stub().clearActionLog();
      GristAPI.getTables = () => [];
      let emptyRead;
      try { emptyRead = await pass(h); } finally { GristAPI.getTables = tablesOf; }
      const writesOnEmptyRead = written().length;

      const fetchTable = grist.docApi.fetchTable;
      let failure = null;
      grist.docApi.fetchTable = async function (name) { if (name === '_grist_Tables_column') throw new Error('lecture impossible'); return fetchTable.apply(this, arguments); };
      try { await SchemaRenames.checkAfterOpen({ isUntouched: () => true }); } catch (e) { failure = e; } finally { grist.docApi.fetchTable = fetchTable; }
      const writesAfterFailure = written().length;
      const recovered = await pass(h);
      const checks = {
        noStorageOnlyNotes: noStorage.bootstrapped === true && writesWithoutStorage === 0 && unchangedWithoutStorage,
        emptyReadKeepsTheSnapshot: emptyRead.skipped === 'noSchema' && writesOnEmptyRead === 0,
        failureRejects: !!failure && /lecture impossible/.test(failure.message) && writesAfterFailure === 0,
        recovered: recovered.renames === 1 && recovered.templates === 1 && all(rowOf(id).Contenu, '.var-badge')[0].getAttribute('data-column') === 'Total',
      };
      const v = verdict(checks);
      return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
    },
  );

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.schemaRenames = cases;
})();
