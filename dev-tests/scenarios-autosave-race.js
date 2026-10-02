// Suite "autosaveRace" - l'enregistrement automatique face à un Grist LENT et à des gestes qui se chevauchent (retour d'Antoine du 02/10, point 12 : « ce modèle a été modifié
// ailleurs, recharger » alors qu'il est seul sur le modèle, d'après lui quand il tape trop vite pendant une sauvegarde).
//
// Pourquoi une suite à part et un faux Grist qui prend son temps : le bandeau de conflit compare le DateModif relu dans Grist à celui que CE widget a écrit en dernier
// (js/main.js, « Auto-save (V1) »). Tant qu'un seul appel est en vol à la fois, les deux concordent toujours : c'est le cas de dev-tests/scenarios-autosave.js, où le stub répond
// dans la même microtâche. Dès que Grist met du temps (la table des modèles se relit EN ENTIER, contenus compris, à CHAQUE passage de l'auto-save, puis une seconde fois après
// chaque écriture), deux de nos propres gestes se chevauchent : un passage pendant que le précédent écrit encore, un Enregistrer pendant un passage, un changement de modèle
// pendant une lecture. L'un lit le DateModif que l'autre vient d'écrire et n'a pas encore noté : faux conflit, sans que personne d'autre n'ait rien touché. Chaque cas ci-dessous
// monte un de ces chevauchements avec `__gristStub.setLatency` (une requête arrive au serveur à mi-délai, la réponse revient à l'autre moitié) et surveille le bandeau à 40 ms
// d'intervalle : même une apparition d'une seconde compte, c'est elle que la personne voit. AUCUN remoteWrite ici : le client est seul du début à la fin.
// Les vrais conflits (un second utilisateur) restent couverts, et inchangés, par scenarios-autosave.js.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js). À garder synchronisé si cette constante change.
  const IDLE_MS = 15000; // = AUTOSAVE_IDLE_INTERVAL_MS (js/main.js) : au repos (rien à enregistrer), un passage ne relit la table qu'à cette échéance.

  const stub = () => window.__gristStub;
  const banner = () => document.getElementById('autosave-conflict-banner');
  const bannerVisible = () => { const b = banner(); return !!b && b.style.display !== 'none'; };
  const selectEl = () => document.getElementById('template-select');
  // Même geste que la liste (js/template-tree-select.js:selectValue) : l'option choisie, puis l'évènement 'change'.
  function chooseTemplate(id) {
    selectEl().value = String(id);
    selectEl().dispatchEvent(new Event('change', { bubbles: true }));
  }
  const inFlightNow = () => stub().state.inFlight.fetchTable + stub().state.inFlight.applyUserActions;
  const contentOf = (id) => { const row = stub().getRow(TABLE, id); return row ? String(row.Contenu) : ''; };

  // Surveille le bandeau pendant tout le scénario : `seen()` reste vrai dès qu'il a été visible UN instant.
  function watchBanner() {
    let seen = false;
    const timer = setInterval(() => { if (bannerVisible()) seen = true; }, 40);
    return { seen: () => seen, stop: () => clearInterval(timer) };
  }

  // Attend qu'une condition devienne vraie ; rend true/false (jamais ne lève), pour que le verdict dise ce qui manquait plutôt qu'une exception.
  async function waitUntil(h, condition, timeoutMs, stepMs) {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      if (condition()) return true;
      await h.sleep(stepMs || 40);
    }
    return condition();
  }
  // Plus aucun appel en vol, deux relevés de suite : les minuteurs du stub sont tous retombés.
  async function untilQuiet(h) {
    let calm = 0;
    await waitUntil(h, () => { calm = inFlightNow() === 0 ? calm + 1 : 0; return calm >= 3; }, 20000, 60);
  }

  // Crée un modèle RÉELLEMENT enregistré par le vrai bouton Enregistrer (jamais Templates.save() : l'auto-save dépend de l'état de main.js). Latence nulle, c'est l'état de départ.
  async function saveTemplate(h, nom, html) {
    // Une identification qui réussit (comme sur un vrai document, où la formule user.Email répond) : sans elle chaque passage ferait trois appels de plus vers Publipostage_UserProbe
    // (js/grist-api.js:getCurrentUserEmail ne garde en mémoire que l'identification réussie) et la chronologie ci-dessous ne serait plus celle d'un vrai Grist lent.
    stub().setUserEmail('course@example.org');
    await h.resetEditor();
    if (html) Editor.setHTML(html);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function newTemplate(h) {
    await h.clickButton('btn-new');
    await h.sleep(300);
  }
  // Un bandeau resté affiché gèlerait l'auto-save des scénarios suivants : un Enregistrer manuel est la sortie prévue par le code lui-même.
  async function clearConflictIfAny(h) {
    if (!bannerVisible()) return;
    await h.clickButton('btn-save');
    await h.sleep(500);
  }
  // Fin de chaque cas, quel que soit le verdict : latence rendue, appels en vol retombés, bandeau levé.
  async function leaveClean(h, watch) {
    if (watch) watch.stop();
    stub().setLatency(0);
    await untilQuiet(h);
    await clearConflictIfAny(h);
  }

  cases.push({
    id: 'race_slow_grist_continuous_typing_never_shows_a_false_conflict_and_never_writes_twice_at_once',
    description: "Grist lent (la table des modèles met ~2 s à se relire) et frappe continue : les passages de l'enregistrement automatique ne se chevauchent pas, le bandeau « modifié ailleurs » n'apparaît jamais, tout ce qui a été tapé finit enregistré",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course frappe continue', '<p>Début</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        stub().setLatency({ fetchTable: 2000, applyUserActions: 1500 }); // un passage dure ~5,5 s (relecture, écriture, relecture) pour un intervalle de 2,5 s
        stub().resetInFlightStats();
        await h.focusAtEnd();
        for (let i = 0; i < 16 && !watch.seen(); i++) { await h.typeText(' m' + i); await h.sleep(500); }
        const saved = await waitUntil(h, () => !watch.seen() && contentOf(id).indexOf('m15') !== -1 && inFlightNow() === 0, 30000, 100);
        await h.sleep(TICK_MS + 1500); // un passage de plus, au repos : un faux conflit tardif se verrait ici
        const maxWrites = stub().state.maxInFlight.applyUserActions;
        const pass = !watch.seen() && saved && maxWrites <= 1;
        return { pass, notes: 'bandeau vu=' + watch.seen() + ', tout enregistré=' + saved + ', écritures simultanées au plus=' + maxWrites + ', fin du contenu=' + contentOf(id).slice(-40) };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_manual_save_then_typing_under_slow_grist_never_shows_a_false_conflict',
    description: "Enregistrer à la main puis continuer à taper pendant que Grist répond lentement : le bandeau « modifié ailleurs » n'apparaît pas, même une seconde, et la frappe suivante est enregistrée",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course Enregistrer puis frappe', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        stub().setLatency({ fetchTable: 1500, applyUserActions: 500 }); // l'Enregistrer relit, écrit, relit, puis relit la liste : ~3,5 s, plus que l'intervalle
        await h.focusAtEnd();
        await h.typeText(' avant');
        // Le clic tombe juste après le départ d'un passage de l'auto-save (sa relecture est en vol) : c'est le moment où l'ancien code se trompait à coup sûr, les passages se
        // répétant toutes les 2,5 s à partir de l'ouverture de la page, l'instant d'un clic quelconque ne le garantissait pas.
        await waitUntil(h, () => stub().state.inFlight.fetchTable > 0, 8000, 20);
        await h.clickButton('btn-save');
        for (let i = 0; i < 12 && !watch.seen(); i++) { await h.typeText(' k' + i); await h.sleep(450); }
        const saved = await waitUntil(h, () => !watch.seen() && contentOf(id).indexOf('k11') !== -1 && inFlightNow() === 0, 30000, 100);
        await h.sleep(TICK_MS * 2); // deux passages au repos de plus
        const pass = !watch.seen() && saved;
        return { pass, notes: 'bandeau vu=' + watch.seen() + ', dernière frappe enregistrée=' + saved + ', fin du contenu=' + contentOf(id).slice(-30) };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_what_is_typed_during_a_save_is_saved_by_the_next_pass',
    description: "Ce qui est tapé PENDANT l'écriture d'un passage de l'enregistrement automatique n'est pas déclaré enregistré : le passage suivant l'écrit sans attendre une autre frappe",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course frappe pendant écriture', '<p>Base</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        stub().setLatency({ fetchTable: 300, applyUserActions: 1800 }); // l'écriture dure 1,8 s : le temps d'y taper
        await h.focusAtEnd();
        await h.typeText(' alpha');
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 8000, 20);
        if (!writing) return { pass: false, notes: 'aucune écriture de l\'auto-save en vol à temps, rien à vérifier' };
        const contentAtWrite = contentOf(id);
        await h.typeText(' beta'); // tapé pendant que « alpha » s'écrit
        const saved = await waitUntil(h, () => contentOf(id).indexOf('beta') !== -1, 14000, 100);
        const pass = saved && contentAtWrite.indexOf('alpha') === -1 && !watch.seen(); // la ligne ne contenait pas « alpha » quand « beta » a été tapé : l'écriture suivante est bien la seconde
        return { pass, notes: 'beta enregistré=' + saved + ', bandeau vu=' + watch.seen() + ', fin du contenu=' + contentOf(id).slice(-40) };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_switching_template_while_a_pass_is_reading_never_shows_a_false_conflict',
    description: "Changer de modèle pendant que l'auto-save relit la table : ce passage appartient au modèle quitté, il ne compare plus (ni n'écrit) rien pour le nouveau - pas de bandeau, aucun des deux modèles modifié",
    run: async (h) => {
      await clearConflictIfAny(h);
      const idA = await saveTemplate(h, 'Course A', '<p>Contenu A</p>');
      await h.sleep(1200); // DateModif en secondes entières : deux enregistrements à une seconde d'écart au moins, sinon rien ne distingue A de B
      await newTemplate(h);
      const idB = await saveTemplate(h, 'Course B', '<p>Contenu B</p>');
      if (!idA || !idB || idA === idB) return { pass: false, notes: 'deux modèles distincts attendus : A=' + idA + ' B=' + idB };
      const watch = watchBanner();
      try {
        stub().setLatency({ fetchTable: 1600, applyUserActions: 0 });
        const reading = await waitUntil(h, () => stub().state.inFlight.fetchTable > 0, IDLE_MS + TICK_MS * 2, 20); // un passage de repos part relire la table (une fois toutes les 15 s)
        if (!reading) return { pass: false, notes: 'aucun passage de l\'auto-save en vol à temps, rien à vérifier' };
        chooseTemplate(idA);
        await h.sleep(TICK_MS * 2 + 2500);
        const shown = Editor.getHTML();
        const pass = !watch.seen() && Templates.getCurrentId() === idA && shown.indexOf('Contenu A') !== -1
          && contentOf(idA).indexOf('Contenu A') !== -1 && contentOf(idB).indexOf('Contenu B') !== -1;
        return { pass, notes: 'bandeau vu=' + watch.seen() + ', modèle courant=' + Templates.getCurrentId() + ' (A=' + idA + ', B=' + idB + '), éditeur=' + shown + ', ligne A=' + contentOf(idA) + ', ligne B=' + contentOf(idB) };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_a_failed_read_back_after_a_save_never_shows_a_false_conflict',
    description: "La relecture du DateModif qui suit une écriture échoue (réseau coupé un instant) : le widget retombe sur l'heure qu'il a envoyée, sous une autre forme que celle de Grist - le passage suivant ne le prend pas pour un conflit",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course relecture échouée', '<p>Avant</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        await h.focusAtEnd();
        await h.typeText(' changé');
        stub().failReadBackOnce();
        const written = await waitUntil(h, () => contentOf(id).indexOf('changé') !== -1, TICK_MS * 2, 40);
        await h.sleep(TICK_MS * 2 + 600); // deux passages de relecture au repos
        const pass = written && !watch.seen() && !stub().state.failNextModelsFetchAfterWrite; // la panne simulée a bien eu lieu (elle se désarme en échouant)
        return { pass, notes: 'écrit=' + written + ', bandeau vu=' + watch.seen() + ', panne encore armée=' + stub().state.failNextModelsFetchAfterWrite };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_a_write_by_another_module_of_the_widget_is_never_a_conflict',
    description: "Une écriture du modèle chargé faite par un autre module du widget que l'enregistrement (la fenêtre d'un macro-modèle passe par Templates.save sans mettre à jour l'état de l'auto-save) n'est pas prise pour celle de quelqu'un d'autre : pas de bandeau aux passages suivants",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course écriture directe', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        await h.sleep(1200); // DateModif en secondes entières : la seconde écriture doit tomber à une autre seconde que la première
        await Templates.save(id, 'Course écriture directe', '<p>Écrit ailleurs dans le widget</p>', '', null, null, 'document', null, null);
        await h.sleep(TICK_MS * 2 + 800);
        const pass = !watch.seen() && contentOf(id).indexOf('Écrit ailleurs') !== -1;
        return { pass, notes: 'bandeau vu=' + watch.seen() + ', ligne=' + contentOf(id) };
      } finally { await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_a_real_conflict_is_still_reported_under_slow_grist',
    description: "Un vrai conflit (quelqu'un d'autre enregistre le même modèle) reste signalé quand Grist est lent : le bandeau s'affiche, l'enregistrement automatique reste gelé (aucune écriture), la version de l'autre est intacte",
    run: async (h) => {
      await clearConflictIfAny(h);
      const id = await saveTemplate(h, 'Course vrai conflit', '<p>Version locale</p>');
      if (!id) return { pass: false, notes: 'aucun modèle créé' };
      const watch = watchBanner();
      try {
        stub().setLatency({ fetchTable: 900, applyUserActions: 400 });
        stub().remoteWrite(TABLE, id, { Contenu: '<p>Version d\'ailleurs</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
        stub().clearActionLog();
        await h.focusAtEnd();
        await h.typeText(' frappe locale');
        const shown = await waitUntil(h, bannerVisible, TICK_MS * 3, 40);
        await h.sleep(TICK_MS * 2); // deux passages de plus : toujours gelé
        const writes = stub().countActions('UpdateRecord', TABLE);
        const intact = contentOf(id).indexOf('d\'ailleurs') !== -1;
        return { pass: shown && writes === 0 && intact, notes: 'bandeau affiché=' + shown + ', écritures pendant le gel=' + writes + ', version de l\'autre intacte=' + intact };
      } finally { await leaveClean(h, watch); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.autosaveRace = cases;
})();
