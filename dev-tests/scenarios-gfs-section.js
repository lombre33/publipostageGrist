// Suite "gfsSection" - la section que GFS dit être la sienne (consigne 097 de GFS, contrats 5.4 point 15 : l'appel `section`). Sous GFS toutes les sections de GFS d'une page portent l'adresse de GFS : un document
// qui en a deux sur la même table, chacune reliée à la grille de SA page par « Sélectionner par », faisait dire à l'export en lot « Le widget ne sait pas quelle vue de la page lui est liée » et ne laissait que « Toute la
// table » (js/view-source.js : readLinkedRows, `unreadable: 'ambiguous'`). Maintenant le widget demande d'abord à GFS laquelle est la sienne (js/gfs-link.js : `GfsLink.section()`), prend celle-là et suit sa vue ; quand GFS
// ne sait pas (`{ id: null }`, un GFS d'avant la consigne, un délai) ou quand le widget est seul, la recherche par adresse reprend, texte inchangé. Joué « hébergé » (HOSTED_GROUPS de dev-tests/run-headless.mjs : la page
// s'ouvre avec `?gfs=0`, dev-tests/gfs-stub.js joue GFS, dont `section`) ; le lien lui-même (formes de réponse, erreur, délai, une seule demande) est dans dev-tests/unit-gfs-link-section.mjs. Ce que la suite garde :
//  1) le vrai chemin, de bout en bout : le widget demande à GFS (UN appel, sans argument), prend la section qu'il nomme et suit la vue de SA grille ; la réponse est gardée pour la vie du cadre (un GFS qui changerait d'avis ne
//     change rien) - ce cas passe PREMIER : la réponse du lien ne s'oublie pas d'un cas à l'autre, les suivants jouent ce que le lien rend ;
//  2) deux pages sur la même table : chaque GFS suit la grille de sa page (avant : « ambiguous » pour les deux) ; deux GFS reliés à la même grille donnent ce qu'ils donnaient ;
//  3) pas de réponse précise (null) : la conduite d'avant, texte inchangé ; une section de GFS non reliée ne suit rien ; la section d'une autre table que la table de travail ne suit rien ; un numéro qui n'est plus une
//     section de widget (une vue défaite, une grille) n'est pas cru ;
//  4) sans l'adresse de GFS dans le contexte, rien n'est demandé ;
//  5) la VRAIE fenêtre « Quelles lignes exporter ? » (js/batch-scope.js : pick) : « Celles de la vue » de la grille de CE GFS en gras (le focus), « Toute la table » à côté, sans dire que le widget ne sait pas laquelle est la sienne ;
//     avec null, la fenêtre d'avant, mot pour mot.
(function () {
  const cases = [];
  const gfs = () => window.__gfsStub;
  const stub = () => window.__gristStub;
  const TABLE = 'GsClients';
  const OTHER_TABLE = 'GsAutres';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const CITIES = ['Lyon', 'Paris', 'Lyon'];
  const GFS_ONE = 30, GFS_TWO = 31, GFS_THREE = 32, GFS_OTHER = 33;   // les sections de GFS de la page
  const GRID_ONE = 21, GRID_TWO = 22, GRID_OTHER = 23;                // les grilles qu'elles suivent
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  // L'adresse de ce widget-ci telle que Grist la garde sur la section de GFS : celle que GFS donne à son contexte (`adresseWidget`), sinon celle de la page, sans requête, sans « index.html » et sans barre finale.
  const ownUrl = () => String(Extensions.widgetAddress() || window.location.origin + window.location.pathname).replace(/[?#].*$/, '').replace(/index\.html$/, '').replace(/\/+$/, '');

  async function seed(h) {
    await h.resetEditor();
    stub().setVariables(TABLE, { Nom: 'Text', Ville: 'Text' });
    stub().setVariables(OTHER_TABLE, { Nom: 'Text' });
    stub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom, Ville: CITIES[i] })));
    stub().setRows(OTHER_TABLE, [{ id: 1, Nom: 'Un' }, { id: 2, Nom: 'Deux' }]);
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: NAMES[0], Ville: CITIES[0] }, TABLE);
    await h.sleep(50);
  }

  // `sections` : [{ id, kind ('custom' : un widget à l'adresse de celui-ci sauf `url` ; 'record', 'detail', 'single'), table?, title?, link?: { section } }] ; `filters` : [{ section, col, filter }] (le JSON de Grist).
  // Les réglages sont posés dans le faux Grist comme Grist les écrit (comme dev-tests/scenarios-pdf-batch.js:installPage).
  function installPage(sections, filters) {
    const state = stub().state;
    const tables = state.rows._grist_Tables;
    const columns = state.rows._grist_Tables_column;
    const tableRef = tableId => { const at = tables.tableId.indexOf(tableId); if (at < 0) throw new Error('table inconnue ' + tableId); return tables.id[at]; };
    const colRef = (tableId, colId) => {
      const parent = tableRef(tableId);
      for (let i = 0; i < columns.id.length; i++) if (columns.parentId[i] === parent && columns.colId[i] === colId) return columns.id[i];
      throw new Error('colonne inconnue ' + tableId + '.' + colId);
    };
    const out = { id: [], parentId: [], parentKey: [], tableRef: [], title: [], options: [], sortColRefs: [], linkSrcSectionRef: [], linkSrcColRef: [], linkTargetColRef: [] };
    sections.forEach((section) => {
      const link = section.link || {};
      out.id.push(section.id); out.parentId.push(11); out.parentKey.push(section.kind); out.tableRef.push(tableRef(section.table || TABLE)); out.title.push(section.title || '');
      out.options.push(section.kind === 'custom' ? JSON.stringify({ customView: JSON.stringify({ mode: 'url', url: section.url || ownUrl() }) }) : '');
      out.sortColRefs.push('[]'); out.linkSrcSectionRef.push(link.section || 0); out.linkSrcColRef.push(0); out.linkTargetColRef.push(0);
    });
    state.rows._grist_Views_section = out;
    state.rows._grist_Views_section_field = { id: [], parentId: [], parentPos: [], colRef: [], displayCol: [], widgetOptions: [] };
    const saved = { id: [], viewSectionRef: [], colRef: [], filter: [] };
    (filters || []).forEach((one, i) => { saved.id.push(i + 1); saved.viewSectionRef.push(one.section); saved.colRef.push(colRef(one.table || TABLE, one.col)); saved.filter.push(JSON.stringify(one.filter)); });
    state.rows._grist_Filters = saved;
  }
  function clearPage() {
    const rows = stub().state.rows;
    delete rows._grist_Views_section; delete rows._grist_Views_section_field; delete rows._grist_Filters;
    stub().dropTable(OTHER_TABLE);
  }
  async function onPage(h, sections, filters, fn) {
    await seed(h);
    installPage(sections, filters);
    try { return await fn(); } finally { clearPage(); }
  }
  // Un GFS de la page : une section de widget reliée à `grid` par un lien de curseur de même table (« Sélectionner par » : ni colonne source ni colonne cible).
  const gfsOn = (grid, extra) => Object.assign({ id: GFS_ONE, kind: 'custom', link: { section: grid } }, extra);
  const GRIDS = [{ id: GRID_ONE, kind: 'record', title: 'Clients de Lyon' }, { id: GRID_TWO, kind: 'record', title: 'Clients de Paris' }];
  const FILTERS = [{ section: GRID_ONE, col: 'Ville', filter: { included: ['Lyon'] } }, { section: GRID_TWO, col: 'Ville', filter: { included: ['Paris'] } }];
  const twoPages = () => [gfsOn(GRID_ONE), gfsOn(GRID_TWO, { id: GFS_TWO })].concat(GRIDS);
  const linkedFor = async (tableId) => ViewSource.linkedRows(tableId || TABLE, await GristAPI.fetchTableRows(tableId || TABLE));
  const idsOf = found => (found && found.ids ? JSON.stringify(found.ids) : JSON.stringify(found));
  const LYON = { name: 'Clients de Lyon', ids: [1, 3] };
  const PARIS = { name: 'Clients de Paris', ids: [2] };
  const AMBIGUOUS = { name: '', unreadable: 'ambiguous' };

  // Ce que GFS répondrait, le temps de `fn` : `GfsLink.section` rend `answer` (un numéro, ou null) et compte ses appels. La réponse du VRAI lien se garde pour la vie du cadre (dev-tests/unit-gfs-link-section.mjs) ;
  // ces cas jouent donc ce que le lien rend.
  async function whenGfsSays(answer, fn) {
    const original = GfsLink.section;
    const calls = [];
    GfsLink.section = () => { calls.push(answer); return Promise.resolve(answer); };
    try { return await fn(calls); } finally { GfsLink.section = original; }
  }

  // 1) Le vrai chemin, de bout en bout - PREMIER cas : c'est le premier appel `section` de la page.
  cases.push({
    id: 'gfssection_the_widget_asks_gfs_once_and_follows_the_view_of_the_section_gfs_names',
    description: 'Deux GFS sur la même table, reliés à deux grilles (Lyon, Paris) : le widget demande à GFS laquelle est la sienne (UN appel `section`, sans argument), prend la deuxième (31) et suit la vue de SA grille (Paris, ligne 2), au lieu de dire « ambiguous » ; la réponse est gardée : un GFS qui changerait d’avis ne change rien, et aucun second appel ne part',
    run: async (h) => {
      const problems = [];
      await onPage(h, twoPages(), FILTERS, async () => {
        gfs().section = { reponse: { id: GFS_TWO } };
        gfs().sectionAppels.length = 0;
        const first = await linkedFor();
        if (!same(first, PARIS)) problems.push('GFS dit la deuxième : ' + JSON.stringify(first));
        gfs().section = { reponse: { id: GFS_ONE } };
        const again = await linkedFor();
        if (!same(again, PARIS)) problems.push('la réponse n’est pas gardée : ' + JSON.stringify(again));
        const asked = gfs().sectionAppels;
        if (asked.length !== 1 || asked[0].args !== undefined) problems.push('appels `section` : ' + JSON.stringify(asked));
        const calls = gfs().calls.filter(call => call.nom === 'section');
        if (calls.length !== 1 || 'args' in calls[0] && calls[0].args !== undefined) problems.push('message envoyé : ' + JSON.stringify(calls));
      });
      return verdict(problems, 'réponse 31 : Paris, un appel');
    },
  });

  // 2) Deux pages sur la même table.
  cases.push({
    id: 'gfssection_each_gfs_of_two_pages_follows_the_grid_of_its_own_page',
    description: 'Le même document, vu de l’un puis de l’autre GFS : celui de la première page (30) suit la grille « Clients de Lyon » (lignes 1 et 3), celui de la deuxième (31) la grille « Clients de Paris » (ligne 2) ; sans réponse de GFS (null) le widget dit « ambiguous », comme avant',
    run: async (h) => {
      const problems = [];
      await onPage(h, twoPages(), FILTERS, async () => {
        for (const [answer, wanted] of [[GFS_ONE, LYON], [GFS_TWO, PARIS], [null, AMBIGUOUS]]) {
          await whenGfsSays(answer, async (calls) => {
            const got = await linkedFor();
            if (!same(got, wanted)) problems.push('GFS dit ' + answer + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(wanted));
            if (calls.length !== 1) problems.push('GFS dit ' + answer + ' : appels ' + calls.length);
          });
        }
      });
      await onPage(h, [gfsOn(GRID_ONE), gfsOn(GRID_ONE, { id: GFS_TWO })].concat(GRIDS), FILTERS, async () => {
        for (const answer of [GFS_ONE, GFS_TWO, null]) {
          await whenGfsSays(answer, async () => {
            const got = await linkedFor();
            if (!same(got, LYON)) problems.push('deux GFS reliés à la même grille, GFS dit ' + answer + ' : ' + JSON.stringify(got));
          });
        }
      });
      return verdict(problems, 'deux pages : chacun sa grille ; une seule grille : inchangé');
    },
  });

  // 3) Pas de réponse précise, ou une réponse qu'on ne peut pas suivre.
  cases.push({
    id: 'gfssection_without_an_answer_the_widget_searches_by_address_as_before',
    description: 'GFS qui ne sait pas (null : `{ id: null, raison }`, un GFS d’avant la consigne, un délai) : la recherche par adresse, comme avant - une seule section de GFS sur la table donne sa vue, deux sections reliées à des vues différentes donnent « ambiguous » (même résultat qu’avant la consigne)',
    run: async (h) => {
      const problems = [];
      await onPage(h, [gfsOn(GRID_ONE)].concat(GRIDS), FILTERS, async () => {
        for (const answer of [null, GFS_ONE]) {
          await whenGfsSays(answer, async () => {
            const got = await linkedFor();
            if (!same(got, LYON)) problems.push('un seul GFS, GFS dit ' + answer + ' : ' + JSON.stringify(got));
          });
        }
      });
      await onPage(h, twoPages(), FILTERS, async () => {
        await whenGfsSays(null, async () => {
          const got = await linkedFor();
          if (!same(got, AMBIGUOUS)) problems.push('deux GFS, aucune réponse : ' + JSON.stringify(got));
        });
      });
      return verdict(problems, 'null : la recherche par adresse');
    },
  });

  cases.push({
    id: 'gfssection_a_gfs_that_is_not_linked_follows_nothing',
    description: 'Trois GFS sur la table dont un n’est relié à aucune grille : quand GFS dit que le widget est celui-là (32), il n’y a rien à suivre (null : les lignes du widget), alors que sans réponse le widget disait « ambiguous »',
    run: async (h) => {
      const problems = [];
      const sections = [gfsOn(GRID_ONE), gfsOn(GRID_TWO, { id: GFS_TWO }), { id: GFS_THREE, kind: 'custom' }].concat(GRIDS);
      await onPage(h, sections, FILTERS, async () => {
        await whenGfsSays(GFS_THREE, async () => {
          const got = await linkedFor();
          if (got !== null) problems.push('le GFS non relié : ' + JSON.stringify(got));
        });
        await whenGfsSays(null, async () => {
          const got = await linkedFor();
          if (!same(got, AMBIGUOUS)) problems.push('sans réponse : ' + JSON.stringify(got));
        });
      });
      return verdict(problems, 'un GFS non relié : rien à suivre');
    },
  });

  cases.push({
    id: 'gfssection_the_section_of_another_table_than_the_working_table_follows_nothing',
    description: 'La personne a choisi une autre table de travail que celle de la section de GFS : GFS dit 30 (une section de « ' + TABLE + ' »), le widget travaille sur « ' + OTHER_TABLE + ' » : rien à suivre (null), alors que la recherche par adresse suivrait la grille que sa propre section a sur cette table',
    run: async (h) => {
      const problems = [];
      const sections = [gfsOn(GRID_ONE), { id: GFS_OTHER, kind: 'custom', table: OTHER_TABLE, link: { section: GRID_OTHER } }, { id: GRID_OTHER, kind: 'record', table: OTHER_TABLE, title: 'Autres' }].concat(GRIDS);
      await onPage(h, sections, FILTERS, async () => {
        await whenGfsSays(GFS_ONE, async () => {
          const other = await linkedFor(OTHER_TABLE);
          if (other !== null) problems.push('table de travail différente de la section de GFS : ' + JSON.stringify(other));
          const same_ = await linkedFor(TABLE);
          if (!same(same_, LYON)) problems.push('la table de la section de GFS : ' + JSON.stringify(same_));
        });
        await whenGfsSays(null, async () => {
          const other = await linkedFor(OTHER_TABLE);
          if (!same(other, { name: 'Autres', ids: [1, 2] })) problems.push('sans réponse, la recherche par adresse sur l’autre table : ' + JSON.stringify(other));
        });
      });
      return verdict(problems, 'autre table : null');
    },
  });

  cases.push({
    id: 'gfssection_a_number_that_is_no_longer_a_widget_section_is_not_believed',
    description: 'Une page recopiée ou une vue défaite change les numéros : un numéro qui n’est plus dans le document (777), ou celui d’une grille et non d’un widget (21), n’est pas cru ; le widget cherche alors par adresse, comme avant',
    run: async (h) => {
      const problems = [];
      await onPage(h, twoPages(), FILTERS, async () => {
        for (const answer of [777, GRID_ONE, GRID_TWO]) {
          await whenGfsSays(answer, async () => {
            const got = await linkedFor();
            if (!same(got, AMBIGUOUS)) problems.push('numéro ' + answer + ' : ' + JSON.stringify(got));
          });
        }
      });
      await onPage(h, [gfsOn(GRID_ONE)].concat(GRIDS), FILTERS, async () => {
        for (const answer of [777, GRID_TWO]) {
          await whenGfsSays(answer, async () => {
            const got = await linkedFor();
            if (!same(got, LYON)) problems.push('un seul GFS, numéro ' + answer + ' : ' + JSON.stringify(got));
          });
        }
      });
      return verdict(problems, 'numéro inconnu : la recherche par adresse');
    },
  });

  // 4) Sans l'adresse de GFS : rien n'est demandé.
  cases.push({
    id: 'gfssection_without_the_address_of_gfs_nothing_is_asked',
    description: 'Un GFS qui ne donne pas son adresse (`adresseWidget` absent) ou un widget seul : le widget ne demande rien (aucun appel `section`) et cherche par l’adresse de sa propre page, comme avant ; deux sections à cette adresse reliées à deux grilles donnent « ambiguous »',
    run: async (h) => {
      const problems = [];
      const original = Extensions.widgetAddress;
      Extensions.widgetAddress = () => '';
      try {
        await onPage(h, twoPages(), FILTERS, async () => {
          await whenGfsSays(GFS_ONE, async (calls) => {
            const got = await linkedFor();
            if (!same(got, AMBIGUOUS)) problems.push('sans adresse de GFS : ' + JSON.stringify(got));
            if (calls.length !== 0) problems.push('GfsLink.section appelé ' + calls.length + ' fois sans adresse de GFS');
          });
        });
        await onPage(h, [gfsOn(GRID_ONE)].concat(GRIDS), FILTERS, async () => {
          await whenGfsSays(GFS_ONE, async (calls) => {
            const got = await linkedFor();
            if (!same(got, LYON) || calls.length !== 0) problems.push('un seul widget : ' + JSON.stringify({ got, appels: calls.length }));
          });
        });
      } finally { Extensions.widgetAddress = original; }
      return verdict(problems, 'sans adresse de GFS : aucun appel');
    },
  });

  // 5) La vraie fenêtre « Quelles lignes exporter ? ».
  cases.push({
    id: 'gfssection_the_export_window_offers_the_rows_of_the_view_linked_to_this_gfs',
    description: 'L’export en lot (ViewSource.linkedRows puis BatchScope.pick, comme js/main-export.js:readBatchRows) dans le GFS de la deuxième page : la fenêtre « Quelles lignes exporter ? » nomme la vue « Clients de Paris », propose « Celle de la vue » en mis en avant (le focus) et « Toute la table » à côté, sans dire que le widget ne sait pas laquelle est la sienne ; sans réponse de GFS, la fenêtre d’avant, mot pour mot (« plusieurs widgets de cette table ont la même adresse que lui », « Toute la table » seule)',
    run: async (h) => {
      const problems = [];
      await onPage(h, twoPages(), FILTERS, async () => {
        const all = await GristAPI.fetchTableRows(TABLE);
        const ask = async (answer, chosen) => {
          const dialogs = h.stubDialogs({ choose: () => chosen });
          try {
            return await whenGfsSays(answer, async () => {
              const linked = await ViewSource.linkedRows(TABLE, all);
              const picked = await BatchScope.pick(all, null, { table: TABLE, linked });
              return { picked, asked: dialogs.asked.filter(one => one.kind === 'choose') };
            });
          } finally { dialogs.restore(); }
        };
        const labels = window_ => (window_.choices || []).map(choice => choice.value + ':' + choice.label + (choice.primary ? '*' : ''));
        const parisVars = { view: 1, all: 3, table: TABLE, name: 'Clients de Paris' };
        let r = await ask(GFS_TWO, 'view');
        const win = r.asked[0];
        if (r.asked.length !== 1 || !win) problems.push('fenêtres : ' + r.asked.length);
        else {
          if (win.title !== I18n.t('batchScope.title')) problems.push('titre : ' + win.title);
          if (win.message !== I18n.t('batchScope.messageLinked', parisVars)) problems.push('texte : ' + JSON.stringify(win.message));
          if (win.message === I18n.t('batchScope.unreadableAmbiguous', parisVars)) problems.push('la fenêtre dit encore qu’elle ne sait pas laquelle est la sienne');
          const wanted = ['all:' + I18n.t('batchScope.all', parisVars), 'view:' + I18n.t('batchScope.viewLinked', parisVars) + '*'];
          if (!same(labels(win), wanted)) problems.push('boutons : ' + JSON.stringify(labels(win)) + ' au lieu de ' + JSON.stringify(wanted));
        }
        if (!r.picked || r.picked.scope !== 'view' || r.picked.linked !== 'Clients de Paris' || !same(r.picked.rows.map(row => row.id), [2])) problems.push('celles de la vue : ' + JSON.stringify(r.picked));
        r = await ask(GFS_TWO, 'all');
        if (!r.picked || r.picked.scope !== 'all' || r.picked.rows.length !== 3) problems.push('toute la table : ' + JSON.stringify(r.picked));
        r = await ask(GFS_ONE, 'view');
        if (!r.picked || r.picked.linked !== 'Clients de Lyon' || !same(r.picked.rows.map(row => row.id), [1, 3])) problems.push('le GFS de la première page : ' + JSON.stringify(r.picked));
        // Sans réponse de GFS : la fenêtre d'avant.
        r = await ask(null, 'all');
        const before = r.asked[0];
        if (r.asked.length !== 1 || !before) problems.push('sans réponse, fenêtres : ' + r.asked.length);
        else {
          const vars = { name: '', table: TABLE, all: 3, view: 3 };
          if (before.message !== I18n.t('batchScope.unreadableAmbiguous', vars)) problems.push('sans réponse, texte : ' + JSON.stringify(before.message));
          if (!same(labels(before), ['all:' + I18n.t('batchScope.all', vars)])) problems.push('sans réponse, boutons : ' + JSON.stringify(labels(before)));
        }
        if (!r.picked || r.picked.scope !== 'all') problems.push('sans réponse, toute la table : ' + JSON.stringify(r.picked));
      });
      return verdict(problems, 'la fenêtre propose la vue du GFS où l’on est');
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gfsSection = cases;
})();
