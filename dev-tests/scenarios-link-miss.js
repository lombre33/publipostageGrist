// Suite "linkMiss" - une bulle #Table.Colonne dont le lien ne trouve aucune ligne pour la ligne sélectionnée le dit dans l'éditeur (consigne 062 de GFS, demande du porteur du 10/11 :
// « si une référence n'est pas résolue, ça doit afficher une erreur dans l'éditeur, pas juste s'en rendre compte en mode lecture ou à l'export »). Le cas vécu : une règle
// « Projet (Référence) = Projet (Projets) » ne trouvait rien parce que la Référence MONTRAIT la colonne Acronyme ; l'aperçu disait « aucune ligne » sans piste et la bulle restait bleue.
// La bulle prend l'orange de « lien à refaire » avec une phrase qui guide la correction (la même dans l'info-bulle et dans l'aperçu de la fenêtre de liaison) ; une cellule vide ne marque
// rien (choix du porteur) ; une bulle qu'une zone répétée ou sa propre boucle nourrit n'est jamais marquée ; la table liée n'est lue qu'une fois par passe, page au repos (600 ms après la
// dernière demande), pour la seule ligne sélectionnée. Les gestes à la vraie souris, à 700x400, sont dans verify-link-miss-mouse.mjs.
(function () {
  const cases = [];
  const PAGE = 'LmEnvois';
  const TARGET = 'LmProjets';
  const LONG = 'Innovation au Coeur des Services';

  // La page a quatre lignes : la 1 désigne un projet (la Référence Projet MONTRE l'acronyme, la Référence Modele le nom), la 2 n'en désigne aucun, la 3 désigne la ligne 99 qui n'existe pas,
  // la 4 désigne un autre projet.
  const ROWS = [
    { id: 1, Titre: 'Envoi 1', Libelle: LONG, Projet: 1, Modele: 1, gristHelper_Display: 'ICS', gristHelper_Display2: LONG },
    { id: 2, Titre: 'Envoi 2', Libelle: '', Projet: 0, Modele: 0, gristHelper_Display: '', gristHelper_Display2: '' },
    { id: 3, Titre: 'Envoi 3', Libelle: 'Inconnu', Projet: 99, Modele: 99, gristHelper_Display: '', gristHelper_Display2: '' },
    { id: 4, Titre: 'Envoi 4', Libelle: 'Mobilité douce', Projet: 2, Modele: 2, gristHelper_Display: 'MD', gristHelper_Display2: 'Mobilité douce' },
  ];
  // La ligne telle que grist.onRecord la livre : une Référence arrive sous la forme qu'elle montre.
  const record = n => { const r = ROWS[n - 1]; return { id: r.id, Titre: r.Titre, Libelle: r.Libelle, Projet: r.gristHelper_Display, Modele: r.gristHelper_Display2 }; };
  // Les règles : le piège du porteur (Projet = Projet alors que la Référence montre Acronyme), puis ce qui marche.
  const TRAP = { colonneCible: 'Projet', colonneSource: 'Projet' };
  const BY_ACRONYM = { colonneCible: 'Acronyme', colonneSource: 'Projet' };
  const BY_AUTO = { colonneCible: 'id', colonneSource: 'Projet' };
  const BY_NAME_REFERENCE = { colonneCible: 'Projet', colonneSource: 'Modele' };
  const BY_TEXT = { colonneCible: 'Projet', colonneSource: 'Libelle' };

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (table, column, extra) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra || ''}></span>`;
  const loopOf = (table, extra) => Object.assign({ repeat: 'row', table, via: null, within: null, by: null, all: null, filter: null, sort: { column: '', direction: 'asc' }, empty: 'header', emptyText: '', separator: ', ', lastSeparator: null }, extra || {});
  const loopBadge = (table, column, loop) => badge(table, column, attr('data-loop', loop) + (loop.repeat === 'inline' ? '' : ' data-loop-repeat="' + loop.repeat + '"'));
  const ed = () => EditorCore.getEditor();
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const stub = () => window.__gristStub;
  // Le code d'avant n'a pas ces fonctions : les essais les appellent sans planter, pour que ce soit leur verdict (la bulle reste bleue) qui échoue et non une erreur de script.
  const forget = keepShown => { if (typeof Variables.forgetLinkMisses === 'function') Variables.forgetLinkMisses(keepShown); };
  const bubbleTables = () => Array.from(new Set(Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(b => b.dataset.table)));
  const stale = () => typeof Variables.linkMissesStale === 'function' && Variables.linkMissesStale(bubbleTables());

  // Les lectures de table que Grist reçoit, par table, depuis le dernier `reset` ; `delay` retarde celles d'une table (la lecture est alors encore en vol quand la ligne change),
  // `delayOnce` seulement la prochaine (la première lecture est lente, la suivante rapide : la plus ancienne finit la dernière).
  function watchReads() {
    const api = window.grist.docApi;
    const real = api.fetchTable;
    const counts = {};
    const delays = {};
    const onceDelays = {};
    api.fetchTable = function (table, ...rest) {
      counts[table] = (counts[table] || 0) + 1;
      const result = real.call(this, table, ...rest);
      const wait = onceDelays[table] || delays[table];
      delete onceDelays[table];
      return wait ? new Promise(resolve => setTimeout(() => resolve(result), wait)) : result;
    };
    return { counts, delay(table, ms) { delays[table] = ms; }, delayOnce(table, ms) { onceDelays[table] = ms; }, reset() { Object.keys(counts).forEach(k => delete counts[k]); }, stop() { api.fetchTable = real; } };
  }

  // Le décor : la page est sur LmEnvois (deux Références vers LmProjets, l'une montre Acronyme, l'autre Projet), liée par la règle du porteur. La ligne 1 est sélectionnée, le verdict
  // d'avant est oublié, puis le modèle `html` est posé : rien n'est encore lu (la lecture part 600 ms après la dernière demande).
  async function seed(h, html, rule) {
    await h.resetEditor();
    const s = stub();
    s.setVariables(TARGET, { Projet: 'Text', Acronyme: 'Text', Budget: 'Numeric' });
    s.setVariables(PAGE, {
      Titre: 'Text', Libelle: 'Text', Projet: 'Ref:' + TARGET, Modele: 'Ref:' + TARGET, gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Projet: 'gristHelper_Display', Modele: 'gristHelper_Display2' }, { Projet: 'Acronyme', Modele: 'Projet' });
    s.setRows(TARGET, [{ id: 1, Projet: LONG, Acronyme: 'ICS', Budget: 100 }, { id: 2, Projet: 'Mobilité douce', Acronyme: 'MD', Budget: 50 }]);
    s.setRows(PAGE, ROWS.map(r => Object.assign({}, r)));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(TARGET);
    await GristAPI.saveLinkRule(TARGET, Object.assign({ mode: 'match' }, rule || TRAP));
    s.fireRecord(record(1), PAGE);
    await h.sleep(30);
    forget();
    Editor.setHTML(html || '<p></p>');
    await h.sleep(120);
  }
  const flags = () => Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(b => ({
    key: b.dataset.key, red: b.classList.contains('var-badge-broken'), orange: b.classList.contains('var-badge-unlinked'), title: b.title,
  }));
  const colourOf = f => (f.orange ? 'orange' : f.red ? 'rouge' : 'bleu');
  const colours = () => flags().map(colourOf);
  // Attend que plus rien ne reste à lire (la lecture part page au repos), puis que les bulles aient repris leur couleur.
  async function settle(h) {
    for (let waited = 0; waited < 5000; waited += 50) {
      await h.sleep(50);
      if (!stale()) break;
    }
    await h.sleep(80);
  }
  // Une autre règle de liaison pour la page, comme après « Modifier le lien » : les bulles se relisent.
  async function relink(h, rule) {
    await GristAPI.saveLinkRule(TARGET, Object.assign({ mode: 'match' }, rule));
    Editor.refreshLinkState();
    await settle(h);
  }

  const sentenceColumn = { column: 'Projet', table: PAGE, shown: 'Acronyme', target: TARGET, compared: 'Projet' };
  const SENTENCE_1 = {
    fr: 'La colonne « Projet » de « LmEnvois » est une Référence qui montre la colonne « Acronyme » de « LmProjets », mais la règle la compare à la colonne « Projet ». Comparez plutôt « Acronyme » ou « Auto » (la ligne désignée).',
    en: 'Column “Projet” of “LmEnvois” is a Reference that shows column “Acronyme” of “LmProjets”, but the rule compares it to column “Projet”. Compare “Acronyme” or “Auto” (the row it points to) instead.',
  };

  // --- La fenêtre de liaison ---
  const pick = (which) => document.getElementById(which === 'source' ? 'link-config-col-source' : 'link-config-col-cible');
  const previewBox = () => document.getElementById('link-config-preview');
  const keyWindowOpen = () => { const m = document.getElementById('link-config-modal'); return !!m && m.style.display === 'flex'; };
  const choose = async (h, which, value) => { pick(which).value = value; pick(which).dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(70); };
  // Ouvre la fenêtre du lien de TARGET (« Modifier le lien ») ; `closed` se règle à la fermeture, borné pour ne pas bloquer la suite.
  async function openWindow(h) {
    const closed = Variables.editLinkRule(TARGET);
    await h.sleep(250);
    return { closed: Promise.race([closed, new Promise(resolve => setTimeout(() => resolve('timeout'), 3000))]) };
  }
  const confirmWindow = async (h, win) => { document.getElementById('link-config-confirm').click(); const done = await win.closed; await h.sleep(80); return done; };
  const cancelWindow = async (h, win) => { if (keyWindowOpen()) document.getElementById('link-config-cancel').click(); await win.closed; await h.sleep(40); };

  // --- La barre d'une bulle ---
  const badgeNodes = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); }); return out; };
  async function selectBadge(h, index) {
    document.querySelector('.tiptap').focus();
    const found = badgeNodes()[index || 0];
    if (!found) throw new Error('pas de bulle n° ' + (index || 0));
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(150);
  }
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const barButton = action => toolbar().querySelector(`button[data-action="${action}"]`);
  // Le bouton tel que la personne le voit : la barre est ouverte ET le bouton a une boîte.
  const barState = action => {
    const b = barButton(action);
    return { shown: !!b && toolbar().classList.contains('visible') && b.getClientRects().length > 0, label: b ? b.textContent.trim() : null, title: b ? b.title : null, aria: b ? b.getAttribute('aria-label') : null };
  };
  const press = action => barButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  const DOC = `<p>${badge(TARGET, 'Projet')} ${badge(TARGET, 'Acronyme')} ${badge(PAGE, 'Titre')}</p>`;

  // ============================================================================================================
  // Le cas du porteur : la Référence montre Acronyme, la règle compare Projet
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_bubble_turns_orange_with_the_sentence_naming_the_column_the_reference_shows',
    description: 'Une règle « Projet (Référence) = Projet (Projets) » alors que la Référence Projet montre la colonne Acronyme ne trouve aucune ligne : une fois la lecture faite (page au repos), les bulles de LmProjets sont orange (`var-badge-unlinked`, jamais rouge) avec la phrase qui nomme la colonne montrée - la même, mot pour mot, dans l’aperçu de la fenêtre de liaison -, en français et en anglais ; la bulle de la table de la page reste bleue ; la table liée n’est lue qu’une fois pour les deux bulles ; refaire la règle (« Acronyme » ou « Auto » à droite) rend la bulle bleue tout de suite',
    run: async (h) => {
      const reads = watchReads();
      const got = {};
      try {
        for (const lang of ['fr', 'en']) {
          await inLang(lang, async () => {
            await seed(h, DOC);
            reads.reset();
            const before = flags();
            const readsBefore = reads.counts[TARGET] || 0;
            await settle(h);
            const after = flags();
            const readsAfter = reads.counts[TARGET] || 0;
            const win = await openWindow(h);
            const inWindow = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
            await choose(h, 'cible', 'Acronyme');
            const withAcronym = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
            await choose(h, 'cible', 'id');
            const withAuto = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
            await choose(h, 'cible', 'Projet');
            const backToTrap = previewBox().textContent;
            await choose(h, 'cible', 'Acronyme');
            const saved = await confirmWindow(h, win);
            const rightAway = flags();
            await settle(h);
            got[lang] = {
              before, readsBefore, after, readsAfter, inWindow, withAcronym, withAuto, backToTrap, saved, rightAway, later: flags(),
              found: I18n.t('linkConfig.previewMatches', { count: 1, table: TARGET, ids: '1' }),
              rule: (() => { const r = GristAPI.getLinkRule(TARGET); return r && [r.mode, r.colonneCible, r.colonneSource]; })(),
            };
          });
        }
      } finally { reads.stop(); }
      const wrong = [];
      for (const lang of ['fr', 'en']) {
        const g = got[lang];
        const sentence = SENTENCE_1[lang];
        if (!same(g.before.map(colourOf), ['bleu', 'bleu', 'bleu']) || g.before.some(f => f.title)) wrong.push(lang + ' avant la lecture : ' + JSON.stringify(g.before));
        if (g.readsBefore !== 0) wrong.push(lang + ' LmProjets lue ' + g.readsBefore + ' fois avant la lecture au repos');
        if (!same(g.after.map(colourOf), ['orange', 'orange', 'bleu'])) wrong.push(lang + ' couleurs : ' + g.after.map(colourOf).join(','));
        if (g.after[0].title !== sentence || g.after[1].title !== sentence || g.after[2].title) wrong.push(lang + ' info-bulles : ' + JSON.stringify(g.after.map(f => f.title)));
        if (g.readsAfter !== 1) wrong.push(lang + ' LmProjets lue ' + g.readsAfter + ' fois pour deux bulles');
        if (g.inWindow.text !== sentence || g.inWindow.good) wrong.push(lang + ' aperçu : ' + JSON.stringify(g.inWindow));
        if (g.backToTrap !== sentence) wrong.push(lang + ' aperçu en revenant à Projet : ' + g.backToTrap);
        const found = g.found;
        if (g.withAcronym.text !== found || !g.withAcronym.good || g.withAuto.text !== found || !g.withAuto.good) wrong.push(lang + ' aperçu avec Acronyme / Auto : ' + JSON.stringify([g.withAcronym, g.withAuto]));
        if (g.saved !== true || !same(g.rule, ['match', 'Acronyme', 'Projet'])) wrong.push(lang + ' règle enregistrée : ' + JSON.stringify(g.rule));
        if (!same(g.rightAway.map(colourOf), ['bleu', 'bleu', 'bleu']) || g.rightAway.some(f => f.title)) wrong.push(lang + ' juste après la règle refaite : ' + JSON.stringify(g.rightAway));
        if (!same(g.later.map(colourOf), ['bleu', 'bleu', 'bleu'])) wrong.push(lang + ' après la relecture : ' + g.later.map(colourOf).join(','));
      }
      return { pass: wrong.length === 0, notes: wrong.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'linkmiss_a_rule_that_finds_a_row_leaves_the_bubble_blue',
    description: 'Seule une règle qui ne trouve rien oranges la bulle : « Acronyme », « Auto » (la ligne que la Référence désigne), une autre Référence qui montre bien Projet, une colonne texte qui porte le nom et la ligne fixe laissent les bulles bleues, sans info-bulle ; le piège (« Projet = Projet ») les oranges, et redevient bleu dès que la règle est refaite',
    run: async (h) => {
      await seed(h, DOC);
      const seen = {};
      for (const [name, rule] of [['trap', TRAP], ['acronym', BY_ACRONYM], ['trapAgain', TRAP], ['auto', BY_AUTO], ['nameReference', BY_NAME_REFERENCE], ['text', BY_TEXT]]) {
        await relink(h, rule);
        seen[name] = { colours: colours(), titled: flags().filter(f => f.title).length };
      }
      await GristAPI.saveLinkRule(TARGET, { mode: 'singleton' });
      Editor.refreshLinkState();
      await settle(h);
      seen.singleton = { colours: colours(), titled: flags().filter(f => f.title).length };
      const orange = ['orange', 'orange', 'bleu'], blue = ['bleu', 'bleu', 'bleu'];
      const checks = {
        trapIsOrange: same(seen.trap.colours, orange) && seen.trap.titled === 2,
        acronymIsBlue: same(seen.acronym.colours, blue) && seen.acronym.titled === 0,
        trapAgainIsOrange: same(seen.trapAgain.colours, orange),
        autoIsBlue: same(seen.auto.colours, blue) && seen.auto.titled === 0,
        aReferenceShowingTheComparedColumnIsBlue: same(seen.nameReference.colours, blue) && seen.nameReference.titled === 0,
        aTextColumnThatCarriesTheNameIsBlue: same(seen.text.colours, blue) && seen.text.titled === 0,
        theFixedRowIsBlue: same(seen.singleton.colours, blue) && seen.singleton.titled === 0,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, seen }) : 'ok' };
    },
  });

  // ============================================================================================================
  // Une cellule vide n'est pas une erreur ; une Référence vers une ligne disparue le dit
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_an_empty_cell_marks_nothing_and_a_reference_to_a_gone_row_says_so',
    description: 'Choix du porteur : une cellule vide sur la ligne sélectionnée (Référence qui ne désigne rien, texte vide) ne rend aucune bulle orange - c’est la donnée, pas le modèle - et l’aperçu de la fenêtre le dit au lieu de chercher « rien » ; une Référence qui désigne une ligne qui n’existe plus rend les bulles orange avec la phrase « La Référence « Projet » désigne une ligne qui n’existe plus dans « LmProjets » », la même dans l’aperçu',
    run: async (h) => {
      await seed(h, DOC);
      const seen = {};
      stub().fireRecord(record(2), PAGE);
      for (const [name, rule] of [['trap', TRAP], ['auto', BY_AUTO], ['text', BY_TEXT]]) {
        await relink(h, rule);
        seen['empty_' + name] = { colours: colours(), titled: flags().filter(f => f.title).length };
      }
      const emptyWindow = await openWindow(h);
      const emptyPreview = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
      await cancelWindow(h, emptyWindow);
      stub().fireRecord(record(3), PAGE);
      await relink(h, BY_AUTO);
      seen.gone = { colours: colours(), titles: flags().map(f => f.title) };
      const goneWindow = await openWindow(h);
      const gonePreview = previewBox().textContent;
      await cancelWindow(h, goneWindow);
      stub().fireRecord(record(1), PAGE);
      await settle(h);
      seen.backOnRowOne = colours();
      const goneSentence = I18n.t('linkMiss.gone', { column: 'Projet', target: TARGET });
      const checks = {
        emptyReferenceWithTheTrapMarksNothing: same(seen.empty_trap, { colours: ['bleu', 'bleu', 'bleu'], titled: 0 }),
        emptyReferenceWithAutoMarksNothing: same(seen.empty_auto, { colours: ['bleu', 'bleu', 'bleu'], titled: 0 }),
        emptyTextMarksNothing: same(seen.empty_text, { colours: ['bleu', 'bleu', 'bleu'], titled: 0 }),
        theWindowSaysTheCellIsEmpty: emptyPreview.text === I18n.t('linkMiss.empty', { column: 'Libelle', table: TARGET }) && !emptyPreview.good,
        goneRowIsOrangeWithItsSentence: same(seen.gone.colours, ['orange', 'orange', 'bleu']) && seen.gone.titles[0] === goneSentence && seen.gone.titles[1] === goneSentence,
        theWindowSaysTheSame: gonePreview === goneSentence,
        theNextRowIsReadAgain: same(seen.backOnRowOne, ['bleu', 'bleu', 'bleu']),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, seen, emptyPreview, gonePreview }) : 'ok' };
    },
  });

  // ============================================================================================================
  // Les phrases : presque la même valeur, puis la phrase générale
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_a_near_value_and_the_general_sentence_guide_the_correction',
    description: 'Quand aucune Référence n’est en cause : une ligne qui ne diffère de la valeur cherchée que par la casse, les accents, « œ » contre « oe » ou une espace insécable donne « Aucune ligne n’a exactement « … », mais « … » s’en approche » ; sinon la phrase générale nomme la table liée, la table de la page et la valeur ; chacune est la même dans l’info-bulle et dans l’aperçu de la fenêtre',
    run: async (h) => {
      await seed(h, DOC, BY_TEXT);
      const seen = {};
      const tryValue = async (name, value) => {
        stub().fireRecord(Object.assign({}, record(1), { Libelle: value }), PAGE);
        await relink(h, BY_TEXT);
        const win = await openWindow(h);
        seen[name] = { colours: colours(), title: flags()[0].title, preview: previewBox().textContent };
        await cancelWindow(h, win);
      };
      await tryValue('caseAndAccents', 'innovation au cœur des services');
      await tryValue('nbsp', 'Innovation au Coeur des Services');
      await tryValue('upper', 'INNOVATION AU COEUR DES SERVICES');
      await tryValue('nothingNear', 'Projet inconnu');
      const near = value => I18n.t('linkMiss.near', { value, near: LONG });
      const general = value => I18n.t('linkMiss.general', { table: TARGET, page: PAGE, value });
      const expected = {
        caseAndAccents: near('innovation au cœur des services'),
        nbsp: near('Innovation au Coeur des Services'),
        upper: near('INNOVATION AU COEUR DES SERVICES'),
        nothingNear: general('Projet inconnu'),
      };
      const wrong = [];
      Object.keys(expected).forEach(name => {
        const s = seen[name];
        if (!same(s.colours, ['orange', 'orange', 'bleu']) || s.title !== expected[name] || s.preview !== expected[name]) wrong.push(name + ' : ' + JSON.stringify(s) + ' au lieu de ' + expected[name]);
      });
      const literal = {
        fr: 'Aucune ligne n’a exactement « innovation au cœur des services », mais « Innovation au Coeur des Services » s’en approche : vérifiez la casse, les accents et les espaces.',
        general: 'Aucune ligne de « LmProjets » ne correspond à « LmEnvois » pour la valeur « Projet inconnu ». Vérifiez la règle dans « Tables liées ».',
      };
      if (I18n.getLang() === 'fr' && (expected.caseAndAccents !== literal.fr || expected.nothingNear !== literal.general)) wrong.push('texte des phrases : ' + JSON.stringify([expected.caseAndAccents, expected.nothingNear]));
      return { pass: wrong.length === 0, notes: wrong.join(' | ') || 'ok' };
    },
  });

  // ============================================================================================================
  // Ce qui n'est jamais marqué : une zone répétée, la boucle de la bulle, la table de la page
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_a_bubble_fed_by_a_repeated_zone_or_its_own_loop_is_never_marked',
    description: 'Une bulle de LmProjets dans une zone répétée sur LmProjets ou sur la page, ou qui porte sa propre boucle « toutes les lignes », lit la ligne du tour et non la ligne sélectionnée : la passe ne la marque jamais, quel que soit le verdict de la table ; la même bulle hors zone est orange',
    run: async (h) => {
      await seed(h);
      const zoneOverTarget = `<table><tbody><tr><td><p>${loopBadge(TARGET, 'Projet', loopOf(TARGET, { all: 'table' }))}</p></td></tr></tbody></table>`;
      const zoneOverPage = `<table><tbody><tr><td><p>${loopBadge(PAGE, 'Titre', loopOf(PAGE, { all: 'table' }))}</p></td><td><p>${badge(TARGET, 'Acronyme')}</p></td></tr></tbody></table>`;
      const ownLoop = `<p>Tous : ${loopBadge(TARGET, 'Acronyme', loopOf(TARGET, { repeat: 'inline', all: 'table', empty: 'blank' }))}, seule : ${badge(TARGET, 'Acronyme')}.</p>`;
      const seen = {};
      for (const [name, html] of [['zoneOverTarget', zoneOverTarget + `<p>${badge(TARGET, 'Projet')}</p>`], ['zoneOverPage', zoneOverPage + `<p>${badge(TARGET, 'Projet')}</p>`], ['ownLoop', ownLoop]]) {
        forget();
        Editor.setHTML(html);
        await settle(h);
        seen[name] = flags().map(f => ({ key: f.key, colour: colourOf(f) }));
      }
      const verdictKept = typeof Variables.linkMissText === 'function' ? !!Variables.linkMissText(TARGET) : false;
      const checks = {
        theTableHasAMissVerdict: verdictKept,
        zoneOverTheTableIsNotMarkedButTheBubbleOutsideIs: same(seen.zoneOverTarget.map(f => f.colour), ['bleu', 'orange']),
        zoneOverThePageIsNotMarkedButTheBubbleOutsideIs: same(seen.zoneOverPage.map(f => f.colour), ['bleu', 'bleu', 'orange']),
        theBubbleCarryingItsOwnLoopIsNotMarkedButItsNeighbourIs: same(seen.ownLoop.map(f => f.colour), ['bleu', 'orange']),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, seen }) : 'ok' };
    },
  });

  // ============================================================================================================
  // Le verdict suit la ligne sélectionnée, la règle et le schéma ; une lecture dépassée est jetée
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_the_verdict_follows_the_selected_row_the_rule_and_the_schema',
    description: 'Le verdict ne vaut que pour la ligne sélectionnée : une autre ligne retire l’orange tout de suite (la phrase citerait la valeur de la ligne d’avant) puis la relit au repos ; une cellule retouchée sur la même ligne laisse l’orange affiché sans clignoter ; la colonne que la Référence montre change dans Grist (schéma relu à l’ouverture du modèle) : la phrase est relue avec la nouvelle',
    run: async (h) => {
      await seed(h, DOC);
      const seen = {};
      await settle(h);
      seen.rowOne = colours();
      const firstSentence = flags()[0].title;
      stub().fireRecord(record(2), PAGE);
      await h.sleep(60);
      seen.rowTwoRightAway = { colours: colours(), titled: flags().filter(f => f.title).length };
      await settle(h);
      seen.rowTwoLater = colours();
      stub().fireRecord(record(1), PAGE);
      await h.sleep(60);
      seen.backToRowOneRightAway = colours();
      await settle(h);
      seen.backToRowOneLater = colours();
      // La même ligne, une cellule retouchée (un autre titre) : l'orange reste affiché pendant la relecture.
      stub().fireRecord(Object.assign({}, record(1), { Titre: 'Envoi 1 corrigé' }), PAGE);
      await h.sleep(60);
      seen.sameRowRightAway = colours();
      await settle(h);
      seen.sameRowLater = colours();
      // Le schéma : la Référence Projet montre maintenant Budget (un nombre), le modèle est rouvert.
      stub().setVariables(PAGE, {
        Titre: 'Text', Libelle: 'Text', Projet: 'Ref:' + TARGET, Modele: 'Ref:' + TARGET, gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
      }, null, { Projet: 'gristHelper_Display', Modele: 'gristHelper_Display2' }, { Projet: 'Budget', Modele: 'Projet' });
      await GristAPI.refreshSchema();
      Editor.setHTML(DOC);
      await settle(h);
      seen.afterSchema = { colours: colours(), title: flags()[0].title };
      const budgetSentence = I18n.t('linkMiss.column', Object.assign({}, sentenceColumn, { shown: 'Budget' }));
      const checks = {
        orangeOnTheSelectedRow: same(seen.rowOne, ['orange', 'orange', 'bleu']) && firstSentence === I18n.t('linkMiss.column', sentenceColumn),
        anotherRowDropsItAtOnce: same(seen.rowTwoRightAway, { colours: ['bleu', 'bleu', 'bleu'], titled: 0 }),
        theEmptyRowStaysBlueOnceRead: same(seen.rowTwoLater, ['bleu', 'bleu', 'bleu']),
        backOnTheFirstRowItIsBlueUntilRead: same(seen.backToRowOneRightAway, ['bleu', 'bleu', 'bleu']),
        thenOrangeAgain: same(seen.backToRowOneLater, ['orange', 'orange', 'bleu']),
        aCellEditedOnTheSameRowDoesNotBlink: same(seen.sameRowRightAway, ['orange', 'orange', 'bleu']) && same(seen.sameRowLater, ['orange', 'orange', 'bleu']),
        theSentenceFollowsTheColumnTheReferenceNowShows: same(seen.afterSchema.colours, ['orange', 'orange', 'bleu']) && seen.afterSchema.title === budgetSentence,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, seen }) : 'ok' };
    },
  });

  cases.push({
    id: 'linkmiss_a_reading_overtaken_by_another_row_is_dropped',
    description: 'La table liée se lit lentement : si la ligne sélectionnée change pendant la lecture, ce qu’elle a trouvé pour l’ancienne ligne n’est jamais affiché (ni orange, ni phrase), et la relecture donne le verdict de la nouvelle ligne',
    run: async (h) => {
      const reads = watchReads();
      try {
        await seed(h, DOC);
        reads.delay(TARGET, 300);
        reads.reset();
        // La lecture part 600 ms après la dernière demande et dure 300 ms de plus : la ligne change pendant qu'elle est en vol, et la relecture de la nouvelle ligne ne part que 600 ms
        // plus tard - la lecture d'avant se termine entre les deux, c'est là que son verdict ne doit pas apparaître.
        let waited = 0;
        while (!(reads.counts[TARGET] > 0) && waited < 3000) { await h.sleep(20); waited += 20; }
        const started = reads.counts[TARGET] > 0;
        stub().fireRecord(record(2), PAGE);
        await h.sleep(60);
        const duringTheRead = colours();
        await h.sleep(370);
        const afterTheOldRead = { colours: colours(), titled: flags().filter(f => f.title).length };
        reads.delay(TARGET, 0);
        await settle(h);
        const later = colours();
        const checks = {
          theReadStartedAtRest: started,
          blueWhileItReads: same(duringTheRead, ['bleu', 'bleu', 'bleu']),
          theOldVerdictIsNeverShown: same(afterTheOldRead, { colours: ['bleu', 'bleu', 'bleu'], titled: 0 }),
          theNewRowHasItsOwnVerdict: same(later, ['bleu', 'bleu', 'bleu']) && !stale(),
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, duringTheRead, afterTheOldRead, later }) : 'ok' };
      } finally { reads.stop(); }
    },
  });

  // ============================================================================================================
  // La lecture : au repos, une fois par passe, partagée avec les champs à bulles
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_the_table_is_read_once_per_pass_at_rest_and_shared_with_the_fields',
    description: 'La table liée n’est pas lue à l’affichage du modèle ni pendant qu’on tape ; 600 ms après la dernière frappe, une seule lecture sert toutes les bulles du modèle et celle d’un champ à bulles (Objet) ; au repos elle n’est plus relue ; une cellule retouchée ou une autre ligne la relit une fois ; une cellule vide n’a rien à chercher : aucune lecture',
    run: async (h) => {
      const reads = watchReads();
      try {
        await seed(h, DOC);
        reads.reset();
        const field = document.getElementById('v2-email-subject');
        field.value = 'Suivi #' + TARGET + '.Projet';
        // Pendant la frappe (plus longue que le délai), rien n'est lu : chaque modification repousse la lecture.
        const typingStart = Date.now();
        for (let i = 0; i < 7; i++) {
          ed().commands.insertContentAt(ed().state.doc.content.size - 1, 'x');
          await h.sleep(120);
        }
        const typedFor = Date.now() - typingStart;
        const duringTyping = reads.counts[TARGET] || 0;
        await settle(h);
        const first = reads.counts[TARGET] || 0;
        const inField = Array.from(FieldEditor.of(field).view.dom.querySelectorAll('.var-badge')).map(b => ({ orange: b.classList.contains('var-badge-unlinked'), title: b.title }));
        const inDocument = flags().filter(f => f.orange).length;
        await h.sleep(900);
        const idle = reads.counts[TARGET] || 0;
        stub().fireRecord(Object.assign({}, record(1), { Titre: 'Envoi 1 bis' }), PAGE);
        await settle(h);
        const sameRow = reads.counts[TARGET] || 0;
        stub().fireRecord(record(2), PAGE);
        await settle(h);
        const emptyRow = reads.counts[TARGET] || 0;
        stub().fireRecord(record(4), PAGE);
        await settle(h);
        const otherRow = reads.counts[TARGET] || 0;
        const otherRowOrange = flags().filter(f => f.orange).length;
        field.value = '';
        const checks = {
          typedLongerThanTheDelay: typedFor > 700,
          nothingReadWhileTyping: duringTyping === 0,
          oneReadForTheDocumentAndTheField: first === 1,
          bothAreOrange: inDocument === 2 && inField.length === 1 && inField[0].orange && inField[0].title === I18n.t('linkMiss.column', sentenceColumn),
          nothingReadAtRestAfterwards: idle === 1,
          theSameRowIsReadOnceMoreAfterAnEdit: sameRow === 2,
          anEmptyCellReadsNothing: emptyRow === 2,
          anotherRowIsReadOnceMore: otherRow === 3 && otherRowOrange === 2,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, typedFor, duringTyping, first, inField, inDocument, idle, sameRow, emptyRow, otherRow, otherRowOrange }) : 'ok' };
      } finally { reads.stop(); }
    },
  });

  // ============================================================================================================
  // L'aperçu de la fenêtre : le dernier choix gagne
  // ============================================================================================================
  cases.push({
    id: 'linkmiss_the_preview_of_the_window_keeps_the_last_choice_when_an_older_one_finishes_later',
    description: 'Choisir la colonne de gauche puis celle de droite lance deux aperçus : le premier (une règle qui ne trouve rien, dont la phrase d’aide lit plus) peut finir APRÈS le second ; l’aperçu garde la règle que la personne vient de choisir et ne repasse pas à « aucune ligne »',
    run: async (h) => {
      const reads = watchReads();
      try {
        await seed(h, '<p></p>');
        reads.reset();
        // La première lecture de LmProjets - celle de l'aperçu de la règle fautive (Projet = Projet) à l'ouverture - est lente ; celle de la règle choisie ensuite est rapide.
        reads.delayOnce(TARGET, 400);
        const closed = Variables.editLinkRule(TARGET);
        await h.sleep(40);
        const first = previewBox().textContent;
        await choose(h, 'cible', 'Acronyme');
        const found = I18n.t('linkConfig.previewMatches', { count: 1, table: TARGET, ids: '1' });
        const quick = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
        await h.sleep(700);
        const late = { text: previewBox().textContent, good: previewBox().classList.contains('is-good') };
        await choose(h, 'cible', 'Projet');
        await h.sleep(120);
        const back = previewBox().textContent;
        if (keyWindowOpen()) document.getElementById('link-config-cancel').click();
        await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))]);
        const checks = {
          computingAtFirst: first === I18n.t('linkConfig.previewComputing'),
          foundAtOnce: quick.text === found && quick.good,
          stillFoundWhenTheOlderOneEnds: late.text === found && late.good,
          theTrapSaysItAgain: back === I18n.t('linkMiss.column', sentenceColumn),
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, first, quick, late, back }) : 'ok' };
      } finally { reads.stop(); }
    },
  });

  cases.push({
    id: 'linkmiss_showing_a_template_again_does_not_force_the_exact_schema_pass_for_a_bubble_that_only_misses',
    description: 'Une bulle orange parce que son lien ne trouve aucune ligne (`var-badge-linkmiss`) n’est pas le signe d’un schéma périmé : afficher de nouveau un modèle ne relit pas toutes les tables en entier (la passe exacte, lourde sur un gros document), alors qu’une bulle sans lien, orange aussi, la demande toujours ; l’orange reste affiché pendant que le schéma se relit et la lecture du lien repart après',
    run: async (h) => {
      const reads = watchReads();
      try {
        stub().setVariables('LmAilleurs', { Nom: 'Text' });
        stub().setRows('LmAilleurs', [{ id: 1, Nom: 'Ailleurs' }]);
        await seed(h, DOC);
        await GristAPI.refreshSchema();
        await GristAPI.deleteLinkRule('LmAilleurs');
        await settle(h);
        const miss = { orange: flags().filter(f => f.orange).length, marked: document.querySelectorAll('.tiptap span.var-badge-linkmiss').length };
        reads.reset();
        Editor.setHTML(DOC);
        await h.sleep(250);
        const afterMiss = { reads: Object.assign({}, reads.counts), orange: flags().filter(f => f.orange).length, marked: document.querySelectorAll('.tiptap span.var-badge-linkmiss').length, stale: stale() };
        await settle(h);
        const settled = { orange: flags().filter(f => f.orange).length, reads: reads.counts[TARGET] || 0 };
        // Une bulle sans lien, elle, laisse penser à un schéma périmé : la passe exacte repart (une lecture de chaque table).
        const withUnlinked = DOC + '<p>' + badge('LmAilleurs', 'Nom') + '</p>';
        Editor.setHTML(withUnlinked);
        await h.sleep(60);
        reads.reset();
        Editor.setHTML(withUnlinked);
        await h.sleep(250);
        const afterUnlinked = Object.assign({}, reads.counts);
        const checks = {
          bothBubblesMissAndCarryTheClass: miss.orange === 2 && miss.marked === 2,
          noTableIsReadWhenOnlyMissing: Object.keys(afterMiss.reads).length === 0,
          theOrangeStaysWhileTheSchemaIsChecked: afterMiss.orange === 2 && afterMiss.marked === 2,
          theLinkIsToBeReadAgain: afterMiss.stale === true,
          readAgainAtRest: settled.orange === 2 && settled.reads === 1,
          anUnlinkedBubbleStillAsksForTheExactPass: (afterUnlinked[TARGET] || 0) >= 1 && (afterUnlinked.LmAilleurs || 0) >= 1,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, miss, afterMiss, settled, afterUnlinked }) : 'ok' };
      } finally { reads.stop(); }
    },
  });

  // ============================================================================================================
  // « Lien… » dans la barre de la bulle
  // ============================================================================================================
  // Le mot du bouton est écrit à la construction de la barre, dans la langue de la page : le cas se joue en français, puis dans une seconde page qui démarre en anglais (la copie `lang: 'en'`).
  const barCase = {
    id: 'linkmiss_the_bar_of_an_orange_bubble_offers_link_and_it_opens_the_link_window',
    description: 'Un clic sur la bulle orange offre « Lien… » (« Link… » en anglais) dans sa barre, avec une info-bulle qui dit pourquoi : il ouvre la fenêtre du lien de la table de la bulle, et la règle refaite rend la bulle bleue, la barre restée ouverte perdant le bouton ; sur la bulle de la page, sur une bulle sans lien (qui a « Colonne… ») et sur une bulle rouge, le bouton n’est pas là',
    run: async (h) => {
      const lang = I18n.getLang();
      await seed(h, `<p>${badge(TARGET, 'Projet')} ${badge(PAGE, 'Titre')} ${badge('LmAilleurs', 'Nom')} ${badge(TARGET, 'Ancienne')}</p>`);
      stub().setVariables('LmAilleurs', { Nom: 'Text' });
      stub().setRows('LmAilleurs', [{ id: 1, Nom: 'Ailleurs' }]);
      await GristAPI.refreshSchema();
      await GristAPI.deleteLinkRule('LmAilleurs');
      Editor.refreshLinkState();
      await settle(h);
      const states = {};
      for (const [name, index] of [['miss', 0], ['page', 1], ['unlinked', 2], ['broken', 3]]) {
        await selectBadge(h, index);
        states[name] = { link: barState('var-link'), column: barState('var-column'), colour: colourOf(flags()[index]) };
      }
      await selectBadge(h, 0);
      press('var-link');
      await h.sleep(300);
      const opened = keyWindowOpen();
      const previewWhenOpened = previewBox().textContent;
      await choose(h, 'cible', 'Acronyme');
      document.getElementById('link-config-confirm').click();
      await h.sleep(250);
      const afterRule = { colour: colourOf(flags()[0]), link: barState('var-link'), bar: toolbar().classList.contains('visible') };
      await settle(h);
      const later = colourOf(flags()[0]);
      const label = { fr: 'Lien…', en: 'Link…' }[lang];
      const wrong = [];
      const miss = states.miss;
      if (miss.colour !== 'orange' || !miss.link.shown || miss.link.label !== label || !miss.link.title || miss.link.aria !== miss.link.title) wrong.push('bulle orange : ' + JSON.stringify(miss));
      if (miss.link.title !== I18n.t('varToolbar.linkMiss')) wrong.push('info-bulle du bouton : ' + miss.link.title);
      if (miss.column.shown) wrong.push('« Colonne… » sur la bulle orange du lien : ' + JSON.stringify(miss.column));
      if (states.page.link.shown || states.page.colour !== 'bleu') wrong.push('bulle de la page : ' + JSON.stringify(states.page));
      if (states.unlinked.link.shown || !states.unlinked.column.shown || states.unlinked.colour !== 'orange') wrong.push('bulle sans lien : ' + JSON.stringify(states.unlinked));
      if (states.broken.link.shown || states.broken.colour !== 'rouge') wrong.push('bulle rouge : ' + JSON.stringify(states.broken));
      if (!opened || previewWhenOpened !== SENTENCE_1[lang]) wrong.push('fenêtre : ' + JSON.stringify([opened, previewWhenOpened]));
      if (afterRule.colour !== 'bleu' || afterRule.link.shown || later !== 'bleu') wrong.push('après la règle refaite : ' + JSON.stringify([afterRule, later]));
      return { pass: wrong.length === 0, notes: wrong.join(' | ') || 'ok' };
    },
  };
  cases.push(barCase);
  cases.push(Object.assign({}, barCase, {
    id: 'linkmiss_the_bar_of_an_orange_bubble_offers_link_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la barre de la bulle orange offre « Link… », avec son info-bulle et la phrase d’aide en anglais, et la fenêtre qu’il ouvre dit la même phrase',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.linkMiss = cases;
})();
