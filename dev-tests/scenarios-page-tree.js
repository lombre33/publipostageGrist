// Suite "pageTree" - rangement des pages que Grist crée avec les tables du widget (js/page-tree.js ; retour d'Antoine, 2026-10-02, point 15).
//
// AddTable crée une page au premier niveau, tout en bas du volet des pages du document (grist-core, useractions.py:doAddView). Le widget crée jusqu'à sept tables :
// sans rangement, sept lignes de plus dans la navigation. La page de Publipostage_Modeles reste au premier niveau et se replie par défaut (option du document, la case
// « Replier par défaut » du menu d'une page) ; les pages des autres tables passent dessous, après son dernier enfant.
//
// Le stub (dev-tests/grist-stub.js) fait ce que fait Grist : AddTable crée une vue et une page en bas du volet, UpdateRecord sur `pagePos` place la page juste avant celle
// dont on donne la position (null = tout en bas). `resetPages(volet)` pose un volet connu ; `readPages()` le relit dans l'ordre où Grist l'affiche.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const MODELES = 'Publipostage_Modeles';
  const COMMENTS = 'Publipostage_Commentaires';
  const ABBREVIATIONS = 'Publipostage_Abreviations';
  const COLUMNS = [{ id: 'Texte', type: 'Text' }];

  // Un volet lisible d'un coup d'œil : « Publipostage_Modeles | > Publipostage_Commentaires | Clients ».
  const outline = () => stub().readPages().map(p => (p.indentation ? '> '.repeat(p.indentation) : '') + p.table + (p.collapsed ? ' [replié]' : '')).join(' | ');

  // Crée la table comme le fait le widget (AddTable puis l'appel de js/page-tree.js) et attend la fin du rangement.
  async function createTable(tableId) {
    await stub().applyUserActions([['AddTable', tableId, COLUMNS]]);
    PageTree.afterTableCreated(tableId);
    await PageTree.whenIdle();
  }

  function freshLayout(layout) {
    PageTree.reset();
    stub().resetPages(layout);
  }

  cases.push({
    id: 'pagetree_other_tables_nest_under_the_models_page_after_its_last_child',
    description: 'La page d’une table créée par le widget passe sous celle de Publipostage_Modeles, après son dernier enfant, devant les pages de l’utilisateur ; les pages de l’utilisateur ne bougent pas',
    run: async () => {
      freshLayout([{ table: MODELES }, { table: 'Clients' }, { table: 'Factures' }]);
      await createTable(COMMENTS);
      const first = outline();
      await createTable(ABBREVIATIONS);
      const second = outline();
      const pass = first === 'Publipostage_Modeles | > Publipostage_Commentaires | Clients | Factures'
        && second === 'Publipostage_Modeles | > Publipostage_Commentaires | > Publipostage_Abreviations | Clients | Factures';
      return { pass, notes: JSON.stringify({ first, second }) };
    },
  });

  cases.push({
    id: 'pagetree_new_page_goes_below_pages_the_user_nested_under_the_models_page',
    description: 'Une page que l’utilisateur a mise sous la page des modèles garde sa place : la nouvelle page vient après elle, jamais entre la page des modèles et elle',
    run: async () => {
      freshLayout([{ table: MODELES }, { table: 'Mes notes', indentation: 1 }, { table: 'Clients' }]);
      await createTable(COMMENTS);
      const got = outline();
      return { pass: got === 'Publipostage_Modeles | > Mes notes | > Publipostage_Commentaires | Clients', notes: got };
    },
  });

  cases.push({
    id: 'pagetree_new_page_goes_last_when_the_models_page_ends_the_pane',
    description: 'Quand la page des modèles est la dernière du volet, la nouvelle page reste en bas, simplement décalée d’un niveau',
    run: async () => {
      freshLayout([{ table: 'Clients' }, { table: MODELES }]);
      await createTable(COMMENTS);
      const got = outline();
      return { pass: got === 'Clients | Publipostage_Modeles | > Publipostage_Commentaires', notes: got };
    },
  });

  cases.push({
    id: 'pagetree_models_page_collapses_by_default_only_when_its_table_is_created',
    description: 'La page de Publipostage_Modeles est repliée par défaut à la création de sa table ; une table créée plus tard ne la replie pas de nouveau si l’utilisateur a décoché la case',
    run: async () => {
      PageTree.reset();
      stub().resetPages([{ table: 'Clients' }]);
      await createTable(MODELES);
      const created = outline();
      // L'utilisateur coche puis décoche « Replier par défaut » : l'option redevient vide.
      const pages = stub().state.rows._grist_Pages;
      const modelesPageId = pages.id[pages.viewRef.indexOf(stub().state.primaryViewOf[MODELES])];
      await stub().applyUserActions([['UpdateRecord', '_grist_Pages', modelesPageId, { options: '{"collapsed":false}' }]]);
      await createTable(COMMENTS);
      const later = outline();
      const pass = created === 'Clients | Publipostage_Modeles [replié]'
        && later === 'Clients | Publipostage_Modeles | > Publipostage_Commentaires';
      return { pass, notes: JSON.stringify({ created, later }) };
    },
  });

  cases.push({
    id: 'pagetree_keeps_the_other_options_of_the_models_page_when_collapsing',
    description: 'Replier par défaut garde les autres options de la page (le reste du JSON de _grist_Pages.options)',
    run: async () => {
      freshLayout([{ table: MODELES, options: '{"foo":"bar"}' }]);
      PageTree.afterTableCreated(MODELES);
      await PageTree.whenIdle();
      const pages = stub().state.rows._grist_Pages;
      const options = JSON.parse(pages.options[0]);
      return { pass: options.collapsed === true && options.foo === 'bar', notes: pages.options[0] };
    },
  });

  cases.push({
    id: 'pagetree_waits_for_the_models_page_then_nests_what_was_created_before_it',
    description: 'Une table créée avant que la page des modèles n’existe (deux créations qui se croisent au démarrage) est rangée dès que celle-ci apparaît',
    run: async () => {
      freshLayout([{ table: 'Clients' }]);
      await createTable(COMMENTS);
      const before = outline();
      await createTable(MODELES);
      const after = outline();
      const pass = before === 'Clients | Publipostage_Commentaires'
        && after === 'Clients | Publipostage_Modeles [replié] | > Publipostage_Commentaires';
      return { pass, notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'pagetree_never_moves_a_page_again_once_nested',
    description: 'Une page rangée une fois n’est plus touchée : l’utilisateur la sort de là, une création suivante ne la remet pas dessous',
    run: async () => {
      freshLayout([{ table: MODELES }, { table: 'Clients' }]);
      await createTable(COMMENTS);
      const pages = stub().state.rows._grist_Pages;
      const commentsPageId = pages.id[pages.viewRef.indexOf(stub().state.primaryViewOf[COMMENTS])];
      await stub().applyUserActions([['UpdateRecord', '_grist_Pages', commentsPageId, { indentation: 0, pagePos: null }]]);
      const moved = outline();
      await createTable(ABBREVIATIONS);
      const got = outline();
      const pass = moved === 'Publipostage_Modeles | Clients | Publipostage_Commentaires'
        && got === 'Publipostage_Modeles | > Publipostage_Abreviations | Clients | Publipostage_Commentaires';
      return { pass, notes: JSON.stringify({ moved, got }) };
    },
  });

  cases.push({
    id: 'pagetree_leaves_the_pane_alone_when_no_table_is_created',
    description: 'Un document existant n’est jamais touché : charger les commentaires d’un modèle quand leur table existe déjà n’écrit rien dans le volet des pages',
    run: async () => {
      freshLayout([{ table: MODELES }, { table: COMMENTS }, { table: 'Clients' }]);
      const before = outline();
      stub().clearActionLog();
      await Comments.loadForTemplate(1);
      await PageTree.whenIdle();
      const writes = stub().countActions('UpdateRecord', '_grist_Pages') + stub().countActions('BulkUpdateRecord', '_grist_Pages') + stub().countActions('AddTable');
      const after = outline();
      return { pass: writes === 0 && before === after && after === 'Publipostage_Modeles | Publipostage_Commentaires | Clients', notes: JSON.stringify({ writes, after }) };
    },
  });

  cases.push({
    id: 'pagetree_comments_table_created_by_the_widget_is_nested_through_the_real_code_path',
    description: 'Le chemin réel : Comments.loadForTemplate crée la table des commentaires dans un document qui n’en a pas, et sa page passe sous celle des modèles',
    run: async () => {
      const s = stub();
      const tables = s.state.tables;
      const hadTable = tables.indexOf(COMMENTS);
      if (hadTable !== -1) tables.splice(hadTable, 1); // listTables ne la rapporte plus : le widget la crée
      const savedRows = s.state.rows[COMMENTS];
      delete s.state.rows[COMMENTS];
      freshLayout([{ table: MODELES }, { table: 'Clients' }]);
      try {
        await Comments.loadForTemplate(1);
        await PageTree.whenIdle();
        const got = outline();
        const created = s.countActions('AddTable', COMMENTS);
        return { pass: created >= 1 && got === 'Publipostage_Modeles | > Publipostage_Commentaires | Clients', notes: JSON.stringify({ created, got }) };
      } finally {
        if (hadTable !== -1 && tables.indexOf(COMMENTS) === -1) tables.splice(hadTable, 0, COMMENTS);
        if (savedRows) s.state.rows[COMMENTS] = savedRows;
      }
    },
  });

  cases.push({
    id: 'pagetree_a_refused_move_never_breaks_the_table_creation',
    description: 'Droits insuffisants sur les pages : la table est créée quand même, rien n’est jeté à l’appelant, la page reste où Grist l’a mise',
    run: async () => {
      freshLayout([{ table: MODELES }, { table: 'Clients' }]);
      const original = grist.docApi.applyUserActions;
      const warn = console.warn;
      const warnings = [];
      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
      grist.docApi.applyUserActions = async function (actions) {
        if (actions.some(a => a[1] === '_grist_Pages')) throw new Error('Permission refusée (schéma)');
        return original.apply(this, arguments);
      };
      try {
        let threw = null;
        try { await createTable(COMMENTS); } catch (e) { threw = String(e); }
        const exists = !!stub().state.rows[COMMENTS];
        const got = outline();
        // Le prochain rangement repart de zéro : une table créée ensuite, avec les droits, se range normalement.
        grist.docApi.applyUserActions = original;
        await createTable(ABBREVIATIONS);
        const later = outline();
        return {
          pass: !threw && exists && got === 'Publipostage_Modeles | Clients | Publipostage_Commentaires' && warnings.length >= 1
            && later === 'Publipostage_Modeles | > Publipostage_Commentaires | > Publipostage_Abreviations | Clients',
          notes: JSON.stringify({ threw, exists, got, warnings: warnings.length, later }),
        };
      } finally {
        grist.docApi.applyUserActions = original;
        console.warn = warn;
      }
    },
  });

  cases.push({
    id: 'pagetree_every_table_creation_of_the_widget_calls_the_pane_tidy',
    description: 'Chaque table du widget (modèles, commentaires, préférences, abréviations, formats de page, liens, sonde de l’e-mail) est créée par GristAPI.ensureTable ou addTableIfMissing, le seul endroit qui écrit un AddTable, et celui-ci est suivi de PageTree.afterTableCreated pour cette table',
    run: async () => {
      const sources = Array.from(document.querySelectorAll('script[src^="js/"]')).map(s => s.getAttribute('src').split('?')[0]).filter(src => src !== 'js/page-tree.js');
      const direct = [];
      const created = [];
      let tidied = false;
      for (const src of sources) {
        const lines = (await (await fetch(src)).text()).split('\n');
        lines.forEach((line, i) => {
          if (/\[\s*'AddTable'\s*,\s*(?:[A-Z_]*TABLE_NAME|name)\b/.test(line)) {
            if (src === 'js/grist-api.js') tidied = lines.slice(i, i + 25).some(l => l.indexOf('PageTree.afterTableCreated(name)') !== -1);
            else direct.push(src + ':' + (i + 1));
          }
          const table = /\b(?:ensureTable|addTableIfMissing)\(/.test(line) && !/function /.test(line) && /\b([A-Z_]*TABLE_NAME)\b/.exec(line);
          if (table) created.push(src + ' ' + table[1]);
        });
      }
      return { pass: tidied && direct.length === 0 && created.length >= 7, notes: JSON.stringify({ created, direct, tidied }) }; // sept tables aujourd'hui ; une huitième doit passer par là
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pageTree = cases;
})();
