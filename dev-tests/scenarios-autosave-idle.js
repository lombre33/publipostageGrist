// Suite "autosaveIdle" - l'enregistrement automatique AU REPOS (retour d'Antoine du 02/10, carte « Ralentir au repos » : « relire moins souvent la table des modèles quand rien n'est
// modifié »). js/main.js, « Auto-save (V1) » : AUTOSAVE_IDLE_INTERVAL_MS.
//
// Avant : chaque passage (toutes les 2,5 s) relisait la table des modèles EN ENTIER, contenus compris, même quand rien n'avait changé - 816 Ko par passage sur le document type de
// ouverture-widget/. Après : rien à enregistrer = une lecture toutes les 15 s ; une modification (autosaveDirty) garde le passage de 2,5 s, et il relit toujours AVANT d'écrire.
//
// Ce que la suite vérifie, avec de vrais minuteurs (l'auto-save est un `setInterval` que rien ne peut déclencher à la demande, cf. dev-tests/scenarios-autosave.js) :
// 1. au repos, la table est relue à 15 s d'intervalle - pas avant -, et un enregistrement fait ailleurs pendant ce temps est signalé à la lecture suivante, sans rien écrire ;
// 2. l'attente du repos ne protège pas moins : quelqu'un d'autre enregistre pendant que rien ne bouge, la personne tape juste après - le premier passage relit AVANT d'écrire,
//    affiche le bandeau et n'écrase rien (une horloge qui sauterait la lecture parce qu'elle date de moins de 15 s écraserait la version de l'autre) ;
// 3. une table des modèles LOURDE attend plus longtemps (js/main.js, autosaveIdleIntervalMs : une milliseconde pour 100 caractères de la dernière lecture, 3 Mo : 30 s) : vingt modèles de
//    1,6 Mo relus toutes les 15 s, c'étaient 118 Mo par minute (lot « Lectures de fond » de « Tests de charge »).
// Les lectures se comptent en enveloppant grist.docApi.fetchTable le temps du cas : le stub journalise les écritures, pas les lectures.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js). À garder synchronisé si cette constante change.
  const IDLE_MS = 15000; // = AUTOSAVE_IDLE_INTERVAL_MS (js/main.js).
  const HEAVY_CHARS = 3000000; // une table de 3 Mo de texte ...
  const HEAVY_IDLE_MS = 30000; // ... attend HEAVY_CHARS / AUTOSAVE_IDLE_CHARS_PER_MS (js/main.js) = 30 s.

  const stub = () => window.__gristStub;
  const banner = () => document.getElementById('autosave-conflict-banner');
  const bannerVisible = () => { const b = banner(); return !!b && b.style.display !== 'none'; };
  const selectEl = () => document.getElementById('template-select');
  // Même geste que la liste (js/template-tree-select.js:selectValue) : l'option choisie, puis l'évènement 'change'.
  function chooseTemplate(id) {
    selectEl().value = String(id);
    selectEl().dispatchEvent(new Event('change', { bubbles: true }));
  }
  const contentOf = (id) => { const row = stub().getRow(TABLE, id); return row ? String(row.Contenu) : ''; };

  // Attend qu'une condition devienne vraie ; rend true/false (jamais ne lève), pour que le verdict dise ce qui manquait plutôt qu'une exception.
  async function waitUntil(h, condition, timeoutMs, stepMs) {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      if (condition()) return true;
      await h.sleep(stepMs || 100);
    }
    return condition();
  }

  // Un bandeau resté affiché gèlerait l'auto-save des scénarios suivants : un Enregistrer manuel est la sortie prévue par le code lui-même.
  async function clearConflictIfAny(h) {
    if (!bannerVisible()) return;
    await h.clickButton('btn-save');
    await h.sleep(500);
  }

  // Les instants (performance.now) de chaque lecture de la table des modèles, tant que le cas dure.
  function watchModelReads() {
    const docApi = window.grist.docApi;
    const original = docApi.fetchTable;
    const times = [];
    docApi.fetchTable = function (tableId) {
      if (tableId === TABLE) times.push(performance.now());
      return original.apply(this, arguments);
    };
    return { times, stop: () => { docApi.fetchTable = original; } };
  }

  // Un modèle RÉELLEMENT enregistré (le vrai bouton Enregistrer : l'auto-save dépend de l'état de main.js), puis rouvert par la liste : c'est ce chargement qui met l'horloge du repos à
  // l'heure (le modèle vient de Grist), la suite d'un cas se compte à partir de là. Rend l'id du modèle ouvert, propre, rien à enregistrer.
  async function openSavedTemplate(h, nom, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    const id = Templates.getCurrentId();
    if (!id) return null;
    await h.clickButton('btn-new');
    await h.sleep(300);
    chooseTemplate(id);
    await h.sleep(500);
    return String(Templates.getCurrentId()) === String(id) ? id : null;
  }

  cases.push({
    id: 'autosave_idle_rereads_the_models_table_only_every_15_seconds_and_still_sees_a_save_made_elsewhere',
    description: "Au repos (rien à enregistrer) l'auto-save relit la table des modèles toutes les 15 s, pas toutes les 2,5 s : un enregistrement fait ailleurs est signalé à la lecture suivante, jamais avant, et rien n'est écrit",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await openSavedTemplate(h, 'AutoSave au repos', '<p>Rien à enregistrer</p>');
      if (!id) return { pass: false, notes: 'modèle non rouvert par la liste' };
      const watch = watchModelReads();
      const loadedAt = performance.now(); // le modèle vient d'être chargé (une demi-seconde plus tôt)
      try {
        stub().clearActionLog();
        // Première lecture du repos : 15 s après le chargement du modèle (au tour de 2,5 s près), pas au premier passage qui suit son ouverture.
        const first = await waitUntil(h, () => watch.times.length >= 1, IDLE_MS + TICK_MS * 2, 100);
        if (!first) return { pass: false, notes: 'aucune lecture de la table des modèles en ' + (IDLE_MS + TICK_MS * 2) + ' ms : un modèle au repos n\'est plus jamais comparé à Grist' };
        const firstDelay = Math.round(watch.times[0] - loadedAt);
        // Quelqu'un d'autre enregistre le modèle : DateModif change sans que ce client l'ait écrit. Aucune frappe ici : le client reste au repos.
        stub().remoteWrite(TABLE, id, { Contenu: '<p>Version de quelqu\'un d\'autre</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
        // L'ancien rythme (2,5 s) l'aurait vu au tour suivant : huit secondes plus tard le bandeau ne doit pas encore y être, et la table ne doit pas avoir été relue.
        await h.sleep(8000);
        const earlyBanner = bannerVisible();
        const earlyReads = watch.times.length;
        const shown = await waitUntil(h, bannerVisible, IDLE_MS, 100);
        const reads = watch.times.length;
        const gap = reads >= 2 ? Math.round(watch.times[1] - watch.times[0]) : null;
        const writes = stub().countActions('UpdateRecord', TABLE);
        const remoteIntact = contentOf(id).indexOf('quelqu\'un d\'autre') !== -1;
        await clearConflictIfAny(h);
        const pass = firstDelay >= IDLE_MS - TICK_MS * 2 && !earlyBanner && earlyReads === 1 && shown && reads === 2 && gap !== null && gap >= IDLE_MS - TICK_MS && gap <= IDLE_MS + TICK_MS * 2
          && writes === 0 && remoteIntact;
        return {
          pass,
          notes: 'première lecture ' + firstDelay + ' ms après le chargement du modèle (attendu ~' + IDLE_MS + '), bandeau 8 s après l\'enregistrement d\'ailleurs=' + earlyBanner + ', lectures à ce moment=' + earlyReads + ' (attendu 1), bandeau ensuite=' + shown
            + ', lectures au total=' + reads + ' (attendu 2), écart entre les deux=' + gap + ' ms (attendu ~' + IDLE_MS + '), écritures=' + writes + ', version d\'ailleurs intacte=' + remoteIntact,
        };
      } finally { watch.stop(); }
    },
  });

  cases.push({
    id: 'autosave_typing_after_an_idle_stretch_reads_before_writing_and_never_overwrites_a_save_made_elsewhere',
    description: "Quelqu'un d'autre enregistre pendant que rien ne bouge, la personne tape juste après : le premier passage relit AVANT d'écrire, affiche le bandeau et n'écrase pas sa version, même si la dernière lecture date de moins de 15 s",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await openSavedTemplate(h, 'AutoSave repos puis frappe', '<p>Version locale</p>');
      if (!id) return { pass: false, notes: 'modèle non rouvert par la liste' };
      const watch = watchModelReads();
      try {
        stub().clearActionLog();
        // Au repos, l'horloge est toute neuve (le modèle vient d'être chargé) : un passage au repos ne lirait pas avant ~15 s.
        stub().remoteWrite(TABLE, id, { Contenu: '<p>Version de quelqu\'un d\'autre</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
        await h.focusAtEnd();
        await h.typeText(' frappe locale juste après');
        const shown = await waitUntil(h, bannerVisible, TICK_MS * 2, 50);
        await h.sleep(TICK_MS); // un passage de plus : gelé, rien ne part
        const reads = watch.times.length;
        const writes = stub().countActions('UpdateRecord', TABLE);
        const remoteIntact = contentOf(id).indexOf('quelqu\'un d\'autre') !== -1;
        await clearConflictIfAny(h);
        return {
          pass: shown && reads >= 1 && writes === 0 && remoteIntact,
          notes: 'bandeau affiché en ' + TICK_MS * 2 + ' ms=' + shown + ', lectures=' + reads + ' (au moins 1 : lire avant d\'écrire), écritures=' + writes + ', version d\'ailleurs intacte=' + remoteIntact,
        };
      } finally { watch.stop(); }
    },
  });

  // Une ligne de plus dans la table des modèles, directement dans le faux Grist (le modèle du cas garde sa petite taille) : `chars` caractères de texte dans son contenu. Rend son id.
  function addHeavyModel(chars) {
    const table = stub().state.rows[TABLE];
    const id = Math.max.apply(null, table.id.concat([0])) + 1000;
    table.id.push(id);
    Object.keys(table).forEach(column => {
      if (column === 'id') return;
      table[column].push(column === 'Nom' ? 'Modèle lourd du cas' : column === 'Contenu' ? '<p>' + 'x'.repeat(chars) + '</p>' : column === 'TypeModele' ? 'document' : null);
    });
    return id;
  }
  function removeModel(id) {
    const table = stub().state.rows[TABLE];
    const index = table.id.indexOf(id);
    if (index === -1) return;
    Object.keys(table).forEach(column => { table[column].splice(index, 1); });
  }

  cases.push({
    id: 'autosave_idle_waits_longer_before_rereading_a_heavy_models_table',
    description: "Au repos, une table des modèles de 3 Mo n'est relue qu'au bout de 30 s (une milliseconde pour 100 caractères lus), pas toutes les 15 s : à ce rythme, vingt modèles de 1,6 Mo relisaient 118 Mo par minute pour n'y rien trouver ; rien n'est écrit",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await openSavedTemplate(h, 'AutoSave table lourde', '<p>Rien à enregistrer</p>');
      if (!id) return { pass: false, notes: 'modèle non rouvert par la liste' };
      const heavyId = addHeavyModel(HEAVY_CHARS);
      try {
        // Le poids de la table est connu avant que l'attente du repos ne commence : la lecture de la liste des modèles le lit, puis le modèle est rouvert (c'est lui qui met l'horloge à l'heure).
        await Templates.loadAll();
        await h.clickButton('btn-new');
        await h.sleep(300);
        chooseTemplate(id);
        await h.sleep(500);
        if (String(Templates.getCurrentId()) !== String(id)) return { pass: false, notes: 'modèle non rouvert par la liste' };
        const watch = watchModelReads();
        const loadedAt = performance.now();
        try {
          stub().clearActionLog();
          // L'ancien rythme aurait lu à 15 s : à 25 s la table ne doit toujours pas avoir été relue.
          const tooEarly = await waitUntil(h, () => watch.times.length >= 1, 25000, 250);
          const readAt = tooEarly ? null : await waitUntil(h, () => watch.times.length >= 1, HEAVY_IDLE_MS + TICK_MS * 2 - 25000, 250);
          const delay = watch.times.length ? Math.round(watch.times[0] - loadedAt) : null;
          const writes = stub().countActions('UpdateRecord', TABLE);
          const pass = !tooEarly && !!readAt && delay !== null && delay >= HEAVY_IDLE_MS - TICK_MS * 2 && delay <= HEAVY_IDLE_MS + TICK_MS * 2 && writes === 0;
          return {
            pass,
            notes: 'table de ' + HEAVY_CHARS + ' caractères : lue avant 25 s=' + tooEarly + ' (attendu non), lecture venue=' + !!readAt + ', délai ' + delay + ' ms (attendu ~' + HEAVY_IDLE_MS + '), écritures=' + writes,
          };
        } finally { watch.stop(); }
      } finally {
        removeModel(heavyId);
        await Templates.loadAll();
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.autosaveIdle = cases;
})();
