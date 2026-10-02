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

  // --- Un autre modèle choisi pendant un enregistrement lent (carte « Corriger » d'Antoine, 02/10) ---------------------------------------------------------------------------------------
  // Vu en réglant le point 12 : A modifié, clic sur Enregistrer, B choisi avant que Grist réponde. À son retour l'Enregistrer remettait A comme modèle courant et dans la liste alors que
  // l'écran montrait B ; la frappe suivante dans B était écrite par l'enregistrement automatique dans la ligne de A (contenu ET nom). Ici l'enregistrement automatique est coupé pendant le geste
  // lui-même (l'écriture lente est celle du bouton), puis rallumé pour la frappe qui suit : c'est elle qui révélait le mal. La question « Enregistrer / Abandonner / Annuler » posée en
  // quittant un modèle modifié reçoit « Abandonner » du harnais.
  const nameOf = (id) => { const row = stub().getRow(TABLE, id); return row ? String(row.Nom) : ''; };
  const screenNow = () => ({ current: Templates.getCurrentId(), select: selectEl().value, name: document.getElementById('template-name').value, html: Editor.getHTML() });
  function autosaveSwitch(on) {
    try { if (on) localStorage.removeItem('pp_autosave_enabled'); else localStorage.setItem('pp_autosave_enabled', 'false'); } catch (e) { /* pas de stockage : l'enregistrement automatique reste allumé */ }
  }
  // Un nom par cas : un nom déjà pris par un cas précédent deviendrait « nom (2) » (cf. Templates.uniqueName) et fausserait les comparaisons de noms.
  async function twoTemplates(h, tag) {
    const nameA = 'Échange ' + tag + ' A';
    const nameB = 'Échange ' + tag + ' B';
    const idA = await saveTemplate(h, nameA, '<p>Contenu A</p>');
    await h.sleep(1200); // DateModif en secondes entières : deux enregistrements à une seconde d'écart au moins
    await newTemplate(h);
    const idB = await saveTemplate(h, nameB, '<p>Contenu B</p>');
    return { idA, idB, nameA, nameB };
  }
  // Frappe dans le modèle à l'écran, enregistrement automatique rallumé : dans quelle ligne atterrit-elle ?
  async function typeThenWatchRows(h, typed, rowIdExpected) {
    autosaveSwitch(true);
    await h.focusAtEnd();
    await h.typeText(typed);
    const written = await waitUntil(h, () => contentOf(rowIdExpected).indexOf(typed.trim()) !== -1, TICK_MS * 2 + 1500, 60);
    await h.sleep(TICK_MS + 600); // un passage de plus : rien d'autre ne s'écrit
    return written;
  }

  cases.push({
    id: 'race_switching_template_while_a_manual_save_is_writing_keeps_the_screen_and_the_current_template',
    description: "Un autre modèle choisi pendant qu'un Enregistrer lent écrit : à son retour l'enregistrement ne remet pas l'ancien modèle comme modèle courant ni dans la liste, l'écran garde le modèle choisi, et ce qui est tapé ensuite va dans sa ligne - jamais dans celle de l'ancien",
    run: async (h) => {
      await clearConflictIfAny(h);
      const { idA, idB, nameA, nameB } = await twoTemplates(h, 'écriture');
      if (!idA || !idB || idA === idB) return { pass: false, notes: 'deux modèles distincts attendus : A=' + idA + ' B=' + idB };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        chooseTemplate(idA);
        await h.sleep(700);
        await h.focusAtEnd();
        await h.typeText(' modifié');
        stub().setLatency({ fetchTable: 0, applyUserActions: 2500 });
        await h.clickButton('btn-save');
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        chooseTemplate(idB); // la question avant de quitter A, « Abandonner » : B se charge pendant que l'écriture de A dure encore
        await h.sleep(500);
        const during = screenNow();
        await waitUntil(h, () => inFlightNow() === 0, 8000, 40);
        await h.sleep(900); // la fin de l'enregistrement : la liste relue
        stub().setLatency(0);
        const after = screenNow();
        const listHasBoth = Array.from(selectEl().options).filter(o => o.value === String(idA) || o.value === String(idB)).length === 2;
        const rowsAfterSave = { a: contentOf(idA), b: contentOf(idB), nameA: nameOf(idA), nameB: nameOf(idB) };
        const written = await typeThenWatchRows(h, ' TAPÉ', idB);
        const rows = { a: contentOf(idA), b: contentOf(idB), nameA: nameOf(idA), nameB: nameOf(idB) };
        const pass = during.current === idB && during.html.indexOf('Contenu B') !== -1
          && after.current === idB && after.select === String(idB) && after.name === nameB && after.html.indexOf('Contenu B') !== -1 && listHasBoth
          && rowsAfterSave.a.indexOf('modifié') !== -1 && rowsAfterSave.b === '<p>Contenu B</p>'
          && written && rows.b.indexOf('TAPÉ') !== -1 && rows.nameB === nameB
          && rows.a === rowsAfterSave.a && rows.nameA === nameA && !watch.seen();
        return { pass, notes: 'pendant l\'écriture=' + JSON.stringify(during) + ', après=' + JSON.stringify(after) + ', liste des deux=' + listHasBoth + ', lignes après l\'écriture=' + JSON.stringify(rowsAfterSave) + ', frappe enregistrée dans B=' + written + ', lignes à la fin=' + JSON.stringify(rows) + ', bandeau vu=' + watch.seen() };
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_switching_template_while_a_new_template_is_being_created_keeps_the_screen_and_the_current_template',
    description: "Un autre modèle choisi pendant que l'Enregistrer d'un modèle tout neuf écrit (la ligne est créée, son identifiant n'arrive qu'à la fin) : la ligne neuve apparaît dans la liste mais ne devient ni le modèle courant ni celui de l'écran, et ce qui est tapé ensuite va dans le modèle à l'écran",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nameB = 'Échange neuf B';
      const nameC = 'Échange neuf C';
      const idB = await saveTemplate(h, nameB, '<p>Contenu B</p>');
      if (!idB) return { pass: false, notes: 'aucun modèle créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        await newTemplate(h); // « + » : un modèle tout neuf, sans identifiant
        document.getElementById('template-name').value = nameC;
        await h.focusAtEnd();
        await h.typeText('Contenu C');
        stub().setLatency({ fetchTable: 0, applyUserActions: 2500 });
        await h.clickButton('btn-save');
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        chooseTemplate(idB);
        await h.sleep(500);
        const during = screenNow();
        await waitUntil(h, () => inFlightNow() === 0, 8000, 40);
        await h.sleep(900);
        stub().setLatency(0);
        const rowsTable = stub().state.rows[TABLE];
        const posC = rowsTable.Nom.indexOf(nameC);
        const idC = posC === -1 ? null : rowsTable.id[posC];
        const after = screenNow();
        const listHasC = idC != null && Array.from(selectEl().options).some(o => o.value === String(idC));
        const rowCAfter = idC != null ? contentOf(idC) : '';
        const written = await typeThenWatchRows(h, ' TAPÉ', idB);
        const rows = { b: contentOf(idB), nameB: nameOf(idB), c: idC != null ? contentOf(idC) : '', nameC: idC != null ? nameOf(idC) : '' };
        const pass = idC != null && idC !== idB && during.current === idB
          && after.current === idB && after.select === String(idB) && after.name === nameB && after.html.indexOf('Contenu B') !== -1 && listHasC
          && rowCAfter.indexOf('Contenu C') !== -1
          && written && rows.b.indexOf('TAPÉ') !== -1 && rows.nameB === nameB
          && rows.c === rowCAfter && rows.nameC === nameC && !watch.seen();
        return { pass, notes: 'ligne neuve=' + idC + ', pendant l\'écriture=' + JSON.stringify(during) + ', après=' + JSON.stringify(after) + ', dans la liste=' + listHasC + ', frappe enregistrée dans B=' + written + ', lignes à la fin=' + JSON.stringify(rows) + ', bandeau vu=' + watch.seen() };
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  // Une attente AVANT l'écriture (l'identification de la personne : une écriture et une lecture de Grist quand elle n'est pas encore connue) laisse le temps de choisir un autre modèle : l'éditeur
  // montre alors celui-là et le geste, qui garde l'identifiant de l'ancien, y écrirait ce que l'écran montre. Ici cette attente est simulée par un Editor.getSuiviModificationsForSave qui dure.
  async function slowIdentification(h, run) {
    const original = Editor.getSuiviModificationsForSave;
    const state = { waiting: false };
    Editor.getSuiviModificationsForSave = async function () {
      state.waiting = true;
      await h.sleep(1500);
      state.waiting = false;
      return original.apply(this, arguments);
    };
    try { return await run(state); } finally { Editor.getSuiviModificationsForSave = original; }
  }

  cases.push({
    id: 'race_switching_template_while_a_manual_save_waits_for_the_identification_never_writes_the_screen_into_the_wrong_row',
    description: "Un autre modèle choisi pendant l'attente d'un Enregistrer (avant que rien ne parte vers Grist) : l'enregistrement renonce, il n'écrit pas ce que l'écran montre sous l'identifiant de l'ancien modèle",
    run: async (h) => {
      await clearConflictIfAny(h);
      const { idA, idB, nameA } = await twoTemplates(h, 'attente manuelle');
      if (!idA || !idB || idA === idB) return { pass: false, notes: 'deux modèles distincts attendus : A=' + idA + ' B=' + idB };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        return await slowIdentification(h, async (state) => {
          chooseTemplate(idA);
          await h.sleep(700);
          await h.focusAtEnd();
          await h.typeText(' modifié');
          const writesBefore = stub().countActions('UpdateRecord', TABLE);
          await h.clickButton('btn-save');
          const waiting = await waitUntil(h, () => state.waiting, 3000, 20);
          if (!waiting) return { pass: false, notes: "l'enregistrement n'attend pas l'identification, rien à vérifier" };
          chooseTemplate(idB);
          await h.sleep(500);
          await waitUntil(h, () => !state.waiting, 4000, 40);
          await h.sleep(900);
          const after = screenNow();
          const writes = stub().countActions('UpdateRecord', TABLE) - writesBefore;
          const pass = after.current === idB && after.html.indexOf('Contenu B') !== -1 && contentOf(idA) === '<p>Contenu A</p>' && nameOf(idA) === nameA && contentOf(idB) === '<p>Contenu B</p>' && writes === 0;
          return { pass, notes: 'écran=' + JSON.stringify(after) + ', écritures=' + writes + ', ligne A=' + contentOf(idA) + ' / ' + nameOf(idA) + ', ligne B=' + contentOf(idB) };
        });
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_switching_template_while_a_pass_waits_for_the_identification_never_writes_the_screen_into_the_wrong_row',
    description: "Même attente dans un passage de l'enregistrement automatique : un autre modèle choisi pendant qu'il attend, il ne part pas écrire ce que l'écran montre sous l'identifiant de l'ancien modèle",
    run: async (h) => {
      await clearConflictIfAny(h);
      const { idA, idB, nameA } = await twoTemplates(h, 'attente passage');
      if (!idA || !idB || idA === idB) return { pass: false, notes: 'deux modèles distincts attendus : A=' + idA + ' B=' + idB };
      autosaveSwitch(true);
      const watch = watchBanner();
      try {
        return await slowIdentification(h, async (state) => {
          chooseTemplate(idA);
          await h.sleep(700);
          await h.focusAtEnd();
          await h.typeText(' modifié'); // le prochain passage écrit - et attend l'identification
          const waiting = await waitUntil(h, () => state.waiting, TICK_MS * 2 + 500, 20);
          if (!waiting) return { pass: false, notes: "aucun passage n'attend l'identification, rien à vérifier" };
          const writesBefore = stub().countActions('UpdateRecord', TABLE);
          chooseTemplate(idB);
          await h.sleep(500);
          await waitUntil(h, () => !state.waiting, 4000, 40);
          await h.sleep(TICK_MS + 900); // le passage rend la main, un autre suit : rien ne doit être écrit pour A
          const after = screenNow();
          const writes = stub().countActions('UpdateRecord', TABLE) - writesBefore;
          const pass = after.current === idB && after.html.indexOf('Contenu B') !== -1 && contentOf(idA) === '<p>Contenu A</p>' && nameOf(idA) === nameA && contentOf(idB) === '<p>Contenu B</p>' && writes === 0;
          return { pass, notes: 'écran=' + JSON.stringify(after) + ', écritures=' + writes + ', ligne A=' + contentOf(idA) + ' / ' + nameOf(idA) + ', ligne B=' + contentOf(idB) };
        });
      } finally { await leaveClean(h, watch); }
    },
  });

  // --- Un deuxième clic sur Enregistrer pendant l'écriture d'un modèle tout neuf (carte « Corriger » d'Antoine, 02/10) -----------------------------------------------------------------
  // Grist lent : l'identifiant d'un modèle neuf n'arrive qu'à la fin de l'écriture. Un deuxième clic (ou Ctrl+S) pendant ce temps partait aussitôt, voyait toujours un modèle sans
  // identifiant et créait une deuxième ligne, sous le même nom. Désormais il attend la fin du premier enregistrement (liste relue comprise) puis enregistre ce que l'écran montre alors,
  // dans la même ligne (js/main.js:onSave) ; la fenêtre d'un macro-modèle ignore le clic en trop (js/macro-editor.js:save). L'enregistrement automatique est coupé : il n'écrit jamais
  // dans un modèle sans identifiant, et ses écritures fausseraient le compte des actions.
  const SLOW_WRITE = { fetchTable: 0, applyUserActions: 2500 };
  const rowIdsNamed = (nom) => { const t = stub().state.rows[TABLE]; return t.id.filter((id, i) => t.Nom[i] === nom); };
  const pressSaveShortcut = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
  // Un modèle de départ enregistré d'abord : la table et ses colonnes existent, l'enregistrement qui suit ne fait plus que l'écriture de la ligne (c'est elle qui est lente ici).
  async function baseTemplate(h, tag) {
    return saveTemplate(h, 'Double clic base ' + tag, '<p>Base</p>');
  }
  // Un modèle tout neuf (« + »), nommé et rempli, prêt à être enregistré ; les compteurs du faux Grist repartent de zéro.
  async function readyNewTemplate(h, nom, text) {
    await newTemplate(h);
    document.getElementById('template-name').value = nom;
    await h.focusAtEnd();
    await h.typeText(text);
    stub().clearActionLog();
    stub().resetInFlightStats();
  }
  const countsNow = () => ({ adds: stub().countActions('AddRecord', TABLE), updates: stub().countActions('UpdateRecord', TABLE), maxWrites: stub().state.maxInFlight.applyUserActions });
  // Attend que les écritures attendues (`expected` : { adds, updates }) soient faites et revenues, et qu'une ligne de ce nom porte `expectedText`, puis laisse le temps à une écriture en
  // trop de se montrer. Le code d'avant n'atteint jamais le compte de mises à jour : il sort au délai, c'est son verdict.
  async function settleWrites(h, nom, expectedText, expected) {
    const done = () => {
      const counts = countsNow();
      return counts.adds >= expected.adds && counts.updates >= expected.updates && inFlightNow() === 0 && rowIdsNamed(nom).some(id => contentOf(id).indexOf(expectedText) !== -1);
    };
    await waitUntil(h, done, 12000, 100);
    await h.sleep(1500);
    stub().setLatency(0);
    await untilQuiet(h);
  }

  cases.push({
    id: 'race_double_click_on_save_of_a_new_template_creates_one_row_and_the_follow_up_saves_the_latest_text',
    description: "Deux clics sur Enregistrer d'un modèle tout neuf pendant que Grist écrit (2,5 s) : une seule ligne est créée, sous le nom tapé (jamais « (2) »), le deuxième clic attend la première écriture puis enregistre le texte tapé entre-temps dans la MÊME ligne, jamais deux écritures en même temps",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nom = 'Double clic neuf';
      if (!await baseTemplate(h, 'neuf')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        await readyNewTemplate(h, nom, 'Premier texte');
        stub().setLatency(SLOW_WRITE);
        await h.clickButton('btn-save');
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        await h.sleep(600);
        await h.focusAtEnd();
        await h.typeText(' DEUXIÈME'); // tapé pendant que la première écriture dure encore
        await h.clickButton('btn-save');
        await settleWrites(h, nom, 'DEUXIÈME', { adds: 1, updates: 1 });
        const ids = rowIdsNamed(nom);
        const id = ids[0];
        const counts = countsNow();
        const content = id != null ? contentOf(id) : '';
        const pass = ids.length === 1 && rowIdsNamed(nom + ' (2)').length === 0 && counts.adds === 1 && counts.updates === 1 && counts.maxWrites <= 1
          && content.indexOf('Premier texte') !== -1 && content.indexOf('DEUXIÈME') !== -1
          && Templates.getCurrentId() === id && selectEl().value === String(id) && document.getElementById('template-name').value === nom;
        return { pass, notes: 'lignes de ce nom=' + JSON.stringify(ids) + ', « (2) »=' + rowIdsNamed(nom + ' (2)').length + ', créations=' + counts.adds + ', mises à jour=' + counts.updates + ', écritures simultanées au plus=' + counts.maxWrites + ', contenu=' + content + ', modèle courant=' + Templates.getCurrentId() + ', liste=' + selectEl().value };
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_ctrl_s_and_clicks_during_a_new_template_write_make_one_follow_up_in_the_same_row',
    description: "Plusieurs Ctrl+S et clics pendant l'écriture d'un modèle tout neuf : une seule ligne, un seul enregistrement de plus (ils n'en font qu'un, qui lit l'état au moment où il part), jamais deux écritures en même temps",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nom = 'Double clic raccourci';
      if (!await baseTemplate(h, 'raccourci')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        await readyNewTemplate(h, nom, 'Premier texte');
        stub().setLatency(SLOW_WRITE);
        await h.clickButton('btn-save');
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        await h.sleep(300);
        pressSaveShortcut();
        await h.sleep(300);
        await h.clickButton('btn-save');
        await h.sleep(300);
        await h.focusAtEnd();
        await h.typeText(' DERNIER');
        pressSaveShortcut(); // le dernier geste : l'enregistrement de plus lit l'écran quand il part, pas au moment de ce geste
        await settleWrites(h, nom, 'DERNIER', { adds: 1, updates: 1 });
        const ids = rowIdsNamed(nom);
        const id = ids[0];
        const counts = countsNow();
        const content = id != null ? contentOf(id) : '';
        const pass = ids.length === 1 && counts.adds === 1 && counts.updates === 1 && counts.maxWrites <= 1
          && content.indexOf('Premier texte') !== -1 && content.indexOf('DERNIER') !== -1 && Templates.getCurrentId() === id;
        return { pass, notes: 'lignes de ce nom=' + JSON.stringify(ids) + ', créations=' + counts.adds + ', mises à jour=' + counts.updates + ', écritures simultanées au plus=' + counts.maxWrites + ', contenu=' + content };
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_double_click_while_the_first_save_waits_for_the_identification_creates_one_row',
    description: "Deux clics sur Enregistrer d'un modèle tout neuf pendant l'attente de l'identification, avant que rien ne parte vers Grist : une seule ligne, comme pendant l'écriture",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nom = 'Double clic identification';
      if (!await baseTemplate(h, 'identification')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        await readyNewTemplate(h, nom, 'Premier texte');
        stub().setLatency({ fetchTable: 0, applyUserActions: 300 });
        return await slowIdentification(h, async (state) => {
          await h.clickButton('btn-save');
          const waiting = await waitUntil(h, () => state.waiting, 3000, 20);
          if (!waiting) return { pass: false, notes: "l'enregistrement n'attend pas l'identification, rien à vérifier" };
          await h.sleep(300);
          await h.clickButton('btn-save');
          await settleWrites(h, nom, 'Premier texte', { adds: 1, updates: 1 });
          const ids = rowIdsNamed(nom);
          const counts = countsNow();
          const pass = ids.length === 1 && counts.adds === 1 && counts.updates === 1 && counts.maxWrites <= 1 && Templates.getCurrentId() === ids[0];
          return { pass, notes: 'lignes de ce nom=' + JSON.stringify(ids) + ', créations=' + counts.adds + ', mises à jour=' + counts.updates + ', écritures simultanées au plus=' + counts.maxWrites };
        });
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_save_as_during_a_manual_save_still_makes_a_separate_copy_and_leaves_the_original_name',
    description: "« Enregistrer sous… » choisi pendant qu'un Enregistrer écrit encore : la copie attend la fin de l'enregistrement puis crée sa propre ligne ; l'original garde son nom et son texte enregistré, la copie devient le modèle courant, jamais deux écritures en même temps",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nomA = 'Double clic copie original';
      const nomCopy = 'Double clic copie faite';
      const idA = await saveTemplate(h, nomA, '<p>Contenu A</p>');
      if (!idA) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      const asked = h.stubDialogs({ prompt: () => nomCopy });
      try {
        await h.focusAtEnd();
        await h.typeText(' modifié');
        stub().clearActionLog();
        stub().resetInFlightStats();
        stub().setLatency(SLOW_WRITE);
        await h.clickButton('btn-save'); // la mise à jour de A, en vol
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        await h.sleep(400);
        await h.clickButton('v2-btn-save-as'); // la saisie répond tout de suite : la copie doit attendre la fin de l'écriture de A
        await settleWrites(h, nomCopy, 'modifié', { adds: 1, updates: 1 });
        const copies = rowIdsNamed(nomCopy);
        const counts = countsNow();
        const pass = copies.length === 1 && nameOf(idA) === nomA && contentOf(idA).indexOf('modifié') !== -1 && contentOf(copies[0]).indexOf('modifié') !== -1
          && counts.adds === 1 && counts.updates === 1 && counts.maxWrites <= 1
          && Templates.getCurrentId() === copies[0] && document.getElementById('template-name').value === nomCopy && rowIdsNamed(nomA).length === 1;
        return { pass, notes: 'copies=' + JSON.stringify(copies) + ', original=' + nameOf(idA) + ' / ' + contentOf(idA) + ', créations=' + counts.adds + ', mises à jour=' + counts.updates + ', écritures simultanées au plus=' + counts.maxWrites + ', modèle courant=' + Templates.getCurrentId() };
      } finally { asked.restore(); autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_a_save_that_never_returns_does_not_block_the_save_button_for_good',
    description: "Un enregistrement dont Grist ne répond jamais ne bloque pas le bouton Enregistrer au-delà d'une minute : un clic passé ce délai part aussitôt et crée la ligne",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nom = 'Double clic sans réponse';
      if (!await baseTemplate(h, 'sans réponse')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      const realSave = Templates.save;
      const realNow = Date.now;
      let hungCalls = 0;
      try {
        await readyNewTemplate(h, nom, 'Texte');
        Templates.save = function () { hungCalls++; return new Promise(() => {}); }; // Grist ne répond jamais
        await h.clickButton('btn-save');
        await h.sleep(300);
        Templates.save = realSave;
        Date.now = () => realNow.call(Date) + 61000; // une minute plus tard
        await h.clickButton('btn-save');
        await settleWrites(h, nom, 'Texte', { adds: 1, updates: 0 });
        const ids = rowIdsNamed(nom);
        const pass = hungCalls === 1 && ids.length === 1 && Templates.getCurrentId() === ids[0];
        return { pass, notes: 'appels sans réponse=' + hungCalls + ', lignes de ce nom=' + JSON.stringify(ids) + ', modèle courant=' + Templates.getCurrentId() };
      } finally { Templates.save = realSave; Date.now = realNow; autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_double_click_on_the_save_button_of_a_new_macro_template_creates_one_macro_template',
    description: "Deux clics sur « Enregistrer » dans la fenêtre d'un macro-modèle tout neuf pendant que Grist écrit : un seul macro-modèle est créé, le clic en trop est ignoré, la fenêtre se referme et il devient le modèle courant",
    run: async (h) => {
      await clearConflictIfAny(h);
      const nom = 'Double clic macro';
      if (!await baseTemplate(h, 'macro')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-macro');
        await h.sleep(150);
        document.getElementById('macro-editor-name').value = nom;
        stub().clearActionLog();
        stub().resetInFlightStats();
        stub().setLatency(SLOW_WRITE);
        document.getElementById('macro-editor-save').click();
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 4000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        await h.sleep(600);
        document.getElementById('macro-editor-save').click();
        await waitUntil(h, () => rowIdsNamed(nom).length >= 1 && inFlightNow() === 0, 20000, 100);
        await h.sleep(1500);
        stub().setLatency(0);
        await untilQuiet(h);
        const ids = rowIdsNamed(nom);
        const counts = countsNow();
        const modal = document.getElementById('macro-editor-modal');
        const closed = !modal || modal.style.display === 'none';
        const pass = ids.length === 1 && rowIdsNamed(nom + ' (2)').length === 0 && counts.adds === 1 && counts.maxWrites <= 1 && closed && Templates.getCurrentId() === ids[0];
        return { pass, notes: 'macro-modèles de ce nom=' + JSON.stringify(ids) + ', créations=' + counts.adds + ', écritures simultanées au plus=' + counts.maxWrites + ', fenêtre fermée=' + closed + ', modèle courant=' + Templates.getCurrentId() };
      } finally { autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  // --- Un deuxième clic sur « Utiliser… » dans l'aperçu de la galerie pendant la création (carte « Corriger » d'Antoine, 02/10) -------------------------------------------------------
  // Même geste que le double clic sur Enregistrer : Grist lent, rien ne bouge à l'écran, la personne clique une deuxième fois. « Utiliser ce modèle » créait alors un deuxième modèle
  // (« Facture » puis « Facture (2) ») ; « Utiliser avec une nouvelle table de données » rouvrait la fenêtre du nom de la table. Le clic en trop est ignoré (js/main.js, `once`).
  // La première carte de la galerie est « Facture », qui a un schéma : les deux boutons sont là. Les noms créés se lisent par différence (un nom pris devient « (2) » d'un cas à l'autre).
  const namesNow = () => stub().state.rows[TABLE].Nom.slice();
  const createdSince = (before) => namesNow().slice(before.length);
  async function openGalleryPreview(h) {
    document.getElementById('v2-btn-new-from-template').click();
    if (!await waitUntil(h, () => !!document.querySelector('#tpl-gallery-grid .tpl-gallery-card'), 8000, 50)) return null;
    document.querySelector('#tpl-gallery-grid .tpl-gallery-card').click();
    const shown = await waitUntil(h, () => {
      const preview = document.getElementById('template-preview-modal');
      return !!preview && preview.style.display !== 'none' && document.getElementById('tpl-preview-tiptap').innerHTML.length > 20;
    }, 8000, 50);
    return shown ? document.getElementById('tpl-preview-name').textContent.trim() : null;
  }
  function closeGallery() {
    ['template-preview-modal', 'template-gallery-modal'].forEach(id => { const modal = document.getElementById(id); if (modal) modal.style.display = 'none'; });
  }
  const galleryOpen = () => ['template-preview-modal', 'template-gallery-modal'].some(id => { const modal = document.getElementById(id); return !!modal && modal.style.display !== 'none'; });

  cases.push({
    id: 'race_double_click_on_use_this_template_in_the_gallery_creates_one_template',
    description: "Deux clics sur « Utiliser ce modèle » dans l'aperçu de la galerie pendant que Grist écrit (2,5 s) : un seul modèle est créé, sous le nom de la galerie (jamais « (2) »), la galerie se ferme, il devient le modèle courant et le deuxième clic n'écrit rien de plus",
    run: async (h) => {
      await clearConflictIfAny(h);
      if (!await baseTemplate(h, 'galerie')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      try {
        const entryName = await openGalleryPreview(h);
        if (!entryName) return { pass: false, notes: "l'aperçu de la galerie ne s'ouvre pas, rien à vérifier" };
        const before = namesNow();
        const expected = Templates.uniqueName(entryName); // le nom que la création doit prendre : celui de la galerie, numéroté seulement s'il est déjà pris avant le geste
        stub().clearActionLog();
        stub().resetInFlightStats();
        stub().setLatency(SLOW_WRITE);
        const useEmpty = document.getElementById('tpl-preview-use-empty');
        useEmpty.click();
        const writing = await waitUntil(h, () => stub().state.inFlight.applyUserActions > 0, 6000, 20);
        if (!writing) return { pass: false, notes: "aucune écriture en vol à temps, rien à vérifier" };
        await h.sleep(600);
        useEmpty.click(); // le clic en trop, pendant l'écriture
        await waitUntil(h, () => createdSince(before).length >= 1 && inFlightNow() === 0 && !galleryOpen(), 20000, 100);
        await h.sleep(1500); // une création en trop se montrerait ici
        const counts = countsNow();
        stub().setLatency(0);
        await untilQuiet(h);
        const created = createdSince(before);
        const id = created.length ? stub().state.rows[TABLE].id[before.length] : null;
        const pass = created.length === 1 && created[0] === expected && counts.adds === 1 && counts.updates === 0 && counts.maxWrites <= 1
          && !galleryOpen() && Templates.getCurrentId() === id && document.getElementById('template-name').value === expected;
        return { pass, notes: 'galerie=' + entryName + ', nom attendu=' + expected + ', modèles créés=' + JSON.stringify(created) + ', créations=' + counts.adds + ', mises à jour=' + counts.updates + ', écritures simultanées au plus=' + counts.maxWrites + ', galerie ouverte=' + galleryOpen() + ', modèle courant=' + Templates.getCurrentId() };
      } finally { closeGallery(); autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_double_click_on_use_with_a_new_table_in_the_gallery_asks_the_table_name_once_and_creates_one_table',
    description: "Deux clics sur « Utiliser avec une nouvelle table de données » : la fenêtre du nom de la table s'ouvre une seule fois, une seule table et un seul modèle sont créés",
    run: async (h) => {
      await clearConflictIfAny(h);
      if (!await baseTemplate(h, 'galerie table')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      let prompts = 0;
      const dialogs = h.stubDialogs({ prompt: async () => { prompts++; await h.sleep(300); return 'Facture_sonde_double_clic'; } });
      try {
        const entryName = await openGalleryPreview(h);
        if (!entryName) return { pass: false, notes: "l'aperçu de la galerie ne s'ouvre pas, rien à vérifier" };
        const before = namesNow();
        stub().clearActionLog();
        stub().setLatency({ fetchTable: 0, applyUserActions: 1500 });
        const useData = document.getElementById('tpl-preview-use-data');
        useData.click();
        await h.sleep(120);
        useData.click(); // le clic en trop, avant même que la première création ait commencé
        await waitUntil(h, () => createdSince(before).length >= 1 && inFlightNow() === 0 && !galleryOpen(), 20000, 100);
        await h.sleep(1500);
        stub().setLatency(0);
        await untilQuiet(h);
        const created = createdSince(before);
        const tables = stub().getActionLog().filter(a => a[0] === 'AddTable' && a[1] === 'Facture_sonde_double_clic').length; // les autres tables du widget ne comptent pas
        const pass = prompts === 1 && tables === 1 && created.length === 1 && !galleryOpen();
        return { pass, notes: 'fenêtres du nom de table=' + prompts + ', tables créées=' + tables + ', modèles créés=' + JSON.stringify(created) + ', galerie ouverte=' + galleryOpen() };
      } finally { dialogs.restore(); closeGallery(); autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  cases.push({
    id: 'race_a_gallery_creation_that_never_returns_does_not_block_the_use_buttons_for_good',
    description: "Une création de la galerie dont Grist ne répond jamais ne bloque pas « Utiliser ce modèle » au-delà d'une minute : un clic passé ce délai crée le modèle",
    run: async (h) => {
      await clearConflictIfAny(h);
      if (!await baseTemplate(h, 'galerie sans réponse')) return { pass: false, notes: 'aucun modèle de départ créé' };
      autosaveSwitch(false);
      const watch = watchBanner();
      const realSave = Templates.save;
      const realNow = Date.now;
      let hungCalls = 0;
      try {
        const entryName = await openGalleryPreview(h);
        if (!entryName) return { pass: false, notes: "l'aperçu de la galerie ne s'ouvre pas, rien à vérifier" };
        const before = namesNow();
        const expected = Templates.uniqueName(entryName);
        const useEmpty = document.getElementById('tpl-preview-use-empty');
        Templates.save = function () { hungCalls++; return new Promise(() => {}); }; // Grist ne répond jamais
        useEmpty.click();
        await h.sleep(500);
        Templates.save = realSave;
        Date.now = () => realNow.call(Date) + 61000; // une minute plus tard
        useEmpty.click();
        await waitUntil(h, () => createdSince(before).length >= 1 && inFlightNow() === 0 && !galleryOpen(), 10000, 100);
        await h.sleep(500);
        const created = createdSince(before);
        const pass = hungCalls === 1 && created.length === 1 && created[0] === expected && !galleryOpen();
        return { pass, notes: 'appels sans réponse=' + hungCalls + ', modèles créés=' + JSON.stringify(created) + ', galerie ouverte=' + galleryOpen() };
      } finally { Templates.save = realSave; Date.now = realNow; closeGallery(); autosaveSwitch(true); await leaveClean(h, watch); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.autosaveRace = cases;
})();
