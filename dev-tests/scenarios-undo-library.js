// Suite "undoLibrary" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les actions de la BIBLIOTHÈQUE et des Réglages (suite de scenarios-undo-comments.js : demande du 22/10, « Il doit prendre en compte 100% des
// actions faites dans le widget », et réponse du 27/10 « Oui, tout, Réglages compris »). Ces actions visent plus que le modèle ouvert, alors que l'historique de l'éditeur est celui du modèle affiché (Editor.setHTML le vide à chaque
// modèle chargé) : js/action-history.js garde de quoi les défaire et refaire, et le nouvel historique reçoit le repère de celles qui sont faites (js/history-markers.js, domaine « actions »). Ici : 1) le ★ « modèle par défaut » du
// document (le bouton de la barre, une ligne de la liste, une ligne d'« Organiser mes modèles »). Et deux états du MODÈLE OUVERT, rangés dans son historique comme le texte (domaines « name » et « exportChoices » de
// js/history-markers.js) : 2) le nom que le crayon lui donne, 3) le type, la qualité du PDF et les lignes d'export qu'on lui choisit.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z rend le ★ à ce qu'il était (au modèle d'avant, ou à aucun), UN Ctrl + Y le repose ; l'ordre est celui des gestes, texte et actions mêlés ; depuis un AUTRE modèle
// que celui où l'action a été faite ; un geste neuf efface ce qui se rétablissait ; ce qu'une autre personne a changé depuis n'est jamais écrasé. Le même parcours à la vraie souris dans le panneau de 700x400 : verify-undo-library-mouse.mjs
// (undoLibraryMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoLibrary = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts), ou de la page quand le focus est ailleurs (le raccourci de js/shortcuts.js clique le bouton de la barre).
  function keyEvent(key, shiftKey) { return new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true }); }
  function inEditor(key) { ed().view.dom.dispatchEvent(keyEvent(key)); }
  function inPage(key) {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    document.body.dispatchEvent(keyEvent(key));
  }
  // La réserve d'actions (js/action-history.js) ; sur le code d'avant elle n'existe pas : les cas échouent alors sur ce que la personne voit, pas sur un nom inconnu.
  const reserve = () => (typeof ActionHistory === 'undefined' ? { reset() {}, whenIdle: () => Promise.resolve(), count: () => 0 } : ActionHistory);
  const settle = async h => { await reserve().whenIdle(); await h.sleep(120); };

  // Les lignes marquées « modèle par défaut » dans la table, telles que Grist les garde (jamais le cache du widget).
  function flagged() {
    const table = stub().state.rows[TABLE];
    return table.id.filter((id, i) => table.EstParDefaut && table.EstParDefaut[i]);
  }
  const cachedDefault = () => Templates.getDefaultId();
  const barStarOn = () => byId('btn-set-default-template').classList.contains('is-default');
  const status = () => byId('status-msg').textContent;
  const starSet = name => I18n.t('status.defaultTemplateSet', { name });
  const starCleared = name => I18n.t('status.defaultTemplateCleared', { name });
  const typedAtEnd = text => {
    const state = ed().state;
    const tr = state.tr.insertText(text, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  };

  // Un modèle neuf, par le vrai chemin (Nouveau, puis Enregistrer) : la liste, le cache et le modèle ouvert le connaissent.
  async function createTemplate(h, name) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(50);
    Editor.setHTML('<p>Contenu de ' + name + '</p>');
    byId('template-name').value = name;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function open(h, id) {
    await Templates.loadAll();
    const select = byId('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }
  // Deux modèles A et B, sans modèle par défaut ni action en réserve ; B est ouvert.
  async function fresh(h, tag) {
    const a = await createTemplate(h, tag + ' A');
    const b = await createTemplate(h, tag + ' B');
    await Templates.setDefault(null);
    await Templates.loadAll();
    reserve().reset();
    return { a, b, nameA: tag + ' A', nameB: tag + ' B' };
  }
  async function leave(h) {
    reserve().reset();
    await Templates.setDefault(null);
    await h.clickButton('btn-new');
    await h.sleep(300);
  }

  cases.push({
    id: 'undo_library_star_is_one_ctrl_z_and_ctrl_y_gives_it_back',
    description: 'Le ★ posé sur le modèle ouvert : UN Ctrl + Z (le focus dans l\'éditeur) le retire, UN Ctrl + Y le repose ; la ligne de la barre, la liste et la table suivent, et le coin d\'état dit ce qui vient d\'être fait',
    async run(h) {
      const problems = [];
      let ids;
      try {
        ids = await fresh(h, 'Étoile un pas');
        await open(h, ids.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        check(problems, 'le ★ posé, dans la table', flagged(), [ids.a]);
        check(problems, 'le bouton de la barre', barStarOn(), true);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la table', flagged(), []);
        check(problems, 'Ctrl + Z : le cache du widget', cachedDefault(), null);
        check(problems, 'Ctrl + Z : le bouton de la barre', barStarOn(), false);
        check(problems, 'Ctrl + Z : la liste', Array.from(byId('template-select').options).some(o => /★/.test(o.textContent)), false);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), starCleared(ids.nameA));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : la table', flagged(), [ids.a]);
        check(problems, 'Ctrl + Y : le bouton de la barre', barStarOn(), true);
        check(problems, 'Ctrl + Y : la liste', Array.from(byId('template-select').options).filter(o => /★/.test(o.textContent)).map(o => o.textContent), [ids.nameA + ' ★']);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), starSet(ids.nameA));
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_taken_from_another_template_goes_back_to_it',
    description: 'Le ★ pris à un autre modèle : Ctrl + Z le lui rend (un seul modèle par défaut à tout moment), Ctrl + Y le reprend',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile reprise');
        await open(h, ids.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await open(h, ids.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        check(problems, 'le ★ sur B', flagged(), [ids.b]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le ★ revient sur A, B le perd', flagged(), [ids.a]);
        check(problems, 'Ctrl + Z : le bouton de la barre (B est ouvert)', barStarOn(), false);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), starSet(ids.nameA));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le ★ repart sur B', flagged(), [ids.b]);
        check(problems, 'Ctrl + Y : le bouton de la barre', barStarOn(), true);
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_comes_back_by_the_buttons_the_page_keys_and_the_browser_edit_menu',
    description: 'Le même ★ se défait de toutes les entrées d\'Annuler : le bouton de la barre, la touche quand le focus est hors de l\'éditeur (le corps de la page), la touche dans l\'éditeur, le menu Édition du navigateur (historyUndo)',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile entrées');
        const star = async () => { await h.clickButton('btn-set-default-template'); await h.sleep(300); };
        await open(h, ids.b);
        await star();
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'le bouton Annuler', flagged(), []);
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'le bouton Rétablir', flagged(), [ids.b]);
        inPage('z');
        await settle(h);
        check(problems, 'la touche, le focus hors de l\'éditeur', flagged(), []);
        inPage('y');
        await settle(h);
        check(problems, 'Ctrl + Y, le focus hors de l\'éditeur', flagged(), [ids.b]);
        ed().commands.focus('end');
        await h.sleep(100);
        ed().view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyUndo', bubbles: true, cancelable: true }));
        await settle(h);
        check(problems, 'le menu Édition du navigateur (historyUndo)', flagged(), []);
        ed().view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'historyRedo', bubbles: true, cancelable: true }));
        await settle(h);
        check(problems, 'le menu Édition du navigateur (historyRedo)', flagged(), [ids.b]);
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_comes_back_from_another_template_than_the_one_it_was_set_in',
    description: 'Le ★ posé dans un modèle, puis un AUTRE modèle ouvert (l\'historique du texte repart à vide) : Ctrl + Z retire encore le ★, Ctrl + Y le repose - sans rouvrir le premier modèle',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile ailleurs');
        await open(h, ids.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await open(h, ids.b);
        check(problems, 'le modèle ouvert est B', Templates.getCurrentId(), ids.b);
        check(problems, 'le ★ est toujours sur A', flagged(), [ids.a]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z depuis B : le ★ de A est retiré', flagged(), []);
        check(problems, 'B est toujours le modèle ouvert', Templates.getCurrentId(), ids.b);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le ★ est reposé sur A', flagged(), [ids.a]);
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_and_text_come_back_in_the_order_of_the_gestures',
    description: 'Du texte, le ★, du texte : trois Ctrl + Z défont dans l\'ordre inverse (le second texte, le ★, le premier texte), trois Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile ordre');
        await open(h, ids.b);
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd(' un');
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        typedAtEnd(' deux');
        const body = () => ed().getText();
        check(problems, 'le texte avant', /un deux/.test(body()), true);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le second texte seul', [/ un/.test(body()), / deux/.test(body()), flagged()], [true, false, [ids.b]]);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : le ★ seul', [/ un/.test(body()), flagged()], [true, []]);
        inEditor('z');
        await settle(h);
        check(problems, '3e Ctrl + Z : le premier texte', [/ un/.test(body()), flagged()], [false, []]);
        inEditor('y');
        await settle(h);
        inEditor('y');
        await settle(h);
        check(problems, '2e Ctrl + Y : le premier texte et le ★', [/ un/.test(body()), / deux/.test(body()), flagged()], [true, false, [ids.b]]);
        inEditor('y');
        await settle(h);
        check(problems, '3e Ctrl + Y : le second texte', [/ deux/.test(body()), flagged()], [true, [ids.b]]);
        return verdict(problems, { text: body() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_cleared_is_undone_and_a_new_gesture_forgets_what_could_be_redone',
    description: 'Le ★ retiré se défait (il revient) ; un geste neuf après un Ctrl + Z efface ce qui se rétablissait, comme une frappe',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile retirée');
        await open(h, ids.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        check(problems, 'le ★ retiré', flagged(), []);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le ★ revient', flagged(), [ids.a]);
        inEditor('z');
        await settle(h);
        check(problems, 'un second Ctrl + Z défait la pose, le ★ s\'en va', flagged(), []);
        await open(h, ids.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y après un geste neuf ne rétablit rien : le ★ reste sur B', flagged(), [ids.b]);
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_changed_by_someone_else_is_not_overwritten',
    description: 'Une autre personne a déplacé le ★ depuis : Ctrl + Z ne l\'écrase pas, il n\'écrit rien et le dit ; il en va de même quand le modèle à qui il devait revenir n\'existe plus',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile autrui');
        await open(h, ids.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await open(h, ids.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        // Une autre personne retire le ★ de B puis le pose sur A.
        stub().remoteWrite(TABLE, ids.b, { EstParDefaut: false });
        stub().remoteWrite(TABLE, ids.a, { EstParDefaut: true });
        await Templates.loadAll();
        const writes = stub().getActionLog().length;
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la table n\'a pas bougé', flagged(), [ids.a]);
        check(problems, 'Ctrl + Z : le coin d\'état dit pourquoi', status(), I18n.t('history.defaultChanged'));
        check(problems, 'aucune écriture', stub().getActionLog().length, writes);
        // Le modèle à qui le ★ devait revenir a été supprimé par quelqu'un d'autre.
        const ids2 = await fresh(h, 'Étoile disparue');
        await open(h, ids2.a);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await open(h, ids2.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        await stub().applyUserActions([['RemoveRecord', TABLE, ids2.a]]);
        await Templates.loadAll();
        inEditor('z');
        await settle(h);
        check(problems, 'le ★ reste sur B', flagged(), [ids2.b]);
        check(problems, 'le coin d\'état dit que le modèle n\'existe plus', status(), I18n.t('history.templateGone'));
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_with_the_changes_tracked_adds_no_suggestion_and_comes_back',
    description: 'Le suivi des modifications allumé : le ★ ne laisse aucune suggestion dans le texte (son repère n\'est pas une modification de la personne), Ctrl + Z le défait avant la suggestion tapée avant lui, Ctrl + Y le repose',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile suivi');
        await open(h, ids.b);
        Editor.setTrackChanges(true);
        await h.sleep(150);
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd(' proposé');
        const tracked = ed().getHTML();
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        check(problems, 'le ★ ne change pas le texte suivi', ed().getHTML(), tracked);
        check(problems, 'le ★ est posé', flagged(), [ids.b]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le ★ seul est défait, la suggestion reste', [flagged(), ed().getHTML() === tracked], [[], true]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la suggestion est défaite', /proposé/.test(ed().getText()), false);
        inEditor('y');
        inEditor('y');
        await settle(h);
        check(problems, 'deux Ctrl + Y : la suggestion et le ★', [flagged(), ed().getHTML() === tracked], [[ids.b], true]);
        return verdict(problems, { flagged: flagged() });
      } finally { if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false); await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_two_keys_in_a_row_run_in_the_order_they_were_pressed',
    description: 'Ctrl + Z puis Ctrl + Y appuyés sans attendre se compensent (le ★ reste où il était, aucune écriture de trop) ; deux Ctrl + Z de suite défont une fois, le second ne trouve rien à défaire',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile file');
        await open(h, ids.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        stub().setLatency({ fetchTable: 0, applyUserActions: 120 });
        const writes = stub().getActionLog().length;
        inEditor('z');
        inEditor('y');
        await h.sleep(900);
        await settle(h);
        check(problems, 'Ctrl + Z puis Ctrl + Y : le ★ est sur B', flagged(), [ids.b]);
        check(problems, 'Ctrl + Z puis Ctrl + Y : aucune écriture', stub().getActionLog().length, writes);
        inEditor('z');
        inEditor('z');
        await h.sleep(900);
        await settle(h);
        check(problems, 'deux Ctrl + Z de suite : le ★ est parti, le second ne trouve rien à défaire', flagged(), []);
        return verdict(problems, { flagged: flagged() });
      } finally { stub().setLatency({ fetchTable: 0, applyUserActions: 0 }); await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_star_write_failing_changes_nothing_and_says_so',
    description: 'Une écriture refusée par Grist pendant Ctrl + Z : le ★ reste où il est, le coin d\'état dit que l\'action n\'a pas pu être défaite, Ctrl + Y qui suit ne pose rien de plus',
    async run(h) {
      const problems = [];
      const real = grist.docApi.applyUserActions;
      try {
        const ids = await fresh(h, 'Étoile refus');
        await open(h, ids.b);
        await h.clickButton('btn-set-default-template');
        await h.sleep(300);
        grist.docApi.applyUserActions = () => Promise.reject(new Error('refus de test'));
        const errors = [];
        const realError = console.error;
        console.error = (...args) => { errors.push(args); };
        try {
          inEditor('z');
          await settle(h);
        } finally { console.error = realError; }
        grist.docApi.applyUserActions = real;
        check(problems, 'le ★ n\'a pas bougé', flagged(), [ids.b]);
        check(problems, 'le coin d\'état dit l\'échec', status(), I18n.t('history.undoFailed'));
        check(problems, 'le coin d\'état est une erreur', byId('status-msg').className, 'error-msg');
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y ne repose rien : le ★ est toujours sur B', flagged(), [ids.b]);
        return verdict(problems, { flagged: flagged() });
      } finally { grist.docApi.applyUserActions = real; await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_keeps_the_last_thirty_actions_only',
    description: 'La réserve garde les trente dernières actions : trente-cinq ★ posés ou retirés, trente en réserve ; une page neuve repart de zéro',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Étoile réserve');
        await open(h, ids.b);
        for (let i = 0; i < 35; i++) { await h.clickButton('btn-set-default-template'); await h.sleep(140); }
        await h.sleep(300);
        check(problems, 'actions en réserve', reserve().count(), 30);
        return verdict(problems, { count: reserve().count() });
      } finally { await leave(h); }
    },
  });

  // --- 2) le nom du modèle ouvert (le crayon) ---
  const nameInput = () => byId('template-name');
  const nameInTable = id => { const t = stub().state.rows[TABLE]; const i = t.id.indexOf(id); return i === -1 ? null : t.Nom[i]; };
  const triggerLabel = () => (document.querySelector('.tts-trigger .tts-trigger-label') || {}).textContent;
  // Le crayon, comme sous les doigts : le clic ouvre le champ, la frappe (évènement `input`), Entrée valide.
  async function rename(h, name) {
    byId('btn-rename-template').click();
    await h.sleep(60);
    nameInput().value = name;
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(150);
  }

  cases.push({
    id: 'undo_library_name_by_the_pencil_is_one_ctrl_z_and_ctrl_y_gives_it_back',
    description: 'Le nom donné au crayon : UN Ctrl + Z rend le nom d\'avant (le champ, la liste, puis la ligne Grist au prochain Enregistrer), UN Ctrl + Y le nom donné',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Nom un pas');
        await open(h, ids.b);
        await rename(h, 'Nom un pas renommé');
        check(problems, 'le champ montre le nouveau nom', nameInput().value, 'Nom un pas renommé');
        check(problems, 'la liste montre le nouveau nom', triggerLabel(), 'Nom un pas renommé');
        await h.clickButton('btn-save');
        await h.sleep(500);
        check(problems, 'la table a le nouveau nom', nameInTable(ids.b), 'Nom un pas renommé');
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le champ', nameInput().value, ids.nameB);
        check(problems, 'Ctrl + Z : la liste', triggerLabel(), ids.nameB);
        await h.clickButton('btn-save');
        await h.sleep(500);
        check(problems, 'Ctrl + Z puis Enregistrer : la table', nameInTable(ids.b), ids.nameB);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le champ et la liste', [nameInput().value, triggerLabel()], ['Nom un pas renommé', 'Nom un pas renommé']);
        await h.clickButton('btn-save');
        await h.sleep(500);
        check(problems, 'Ctrl + Y puis Enregistrer : la table', nameInTable(ids.b), 'Nom un pas renommé');
        return verdict(problems, { name: nameInput().value });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_name_and_text_come_back_in_the_order_of_the_gestures',
    description: 'Du texte, un nouveau nom, du texte : trois Ctrl + Z défont dans l\'ordre inverse (le second texte, le nom, le premier texte), trois Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Nom ordre');
        await open(h, ids.b);
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd(' un');
        await rename(h, 'Nom ordre donné');
        typedAtEnd(' deux');
        const body = () => ed().getText();
        const seen = () => [nameInput().value, / un/.test(body()), / deux/.test(body())];
        check(problems, 'avant', seen(), ['Nom ordre donné', true, true]);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le second texte seul', seen(), ['Nom ordre donné', true, false]);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : le nom seul', seen(), [ids.nameB, true, false]);
        inEditor('z');
        await settle(h);
        check(problems, '3e Ctrl + Z : le premier texte', seen(), [ids.nameB, false, false]);
        inEditor('y');
        inEditor('y');
        await settle(h);
        check(problems, '2e Ctrl + Y : le premier texte et le nom', seen(), ['Nom ordre donné', true, false]);
        inEditor('y');
        await settle(h);
        check(problems, '3e Ctrl + Y : le second texte', seen(), ['Nom ordre donné', true, true]);
        return verdict(problems, { name: nameInput().value, text: body() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_name_abandoned_or_unchanged_adds_no_step',
    description: 'Échap abandonne la frappe et Entrée sur le même nom ne change rien : aucun pas dans l\'historique (rien à défaire), alors qu\'un vrai renommage en laisse un',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Nom sans pas');
        await open(h, ids.b);
        check(problems, 'rien à défaire au départ', ed().can().undo(), false);
        byId('btn-rename-template').click();
        await h.sleep(60);
        nameInput().value = 'Un autre nom';
        nameInput().dispatchEvent(new Event('input', { bubbles: true }));
        nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.sleep(150);
        check(problems, 'Échap : le nom d\'avant est revenu', nameInput().value, ids.nameB);
        check(problems, 'Échap : aucun pas', ed().can().undo(), false);
        await rename(h, ids.nameB);
        check(problems, 'Entrée sur le même nom : aucun pas', ed().can().undo(), false);
        await rename(h, 'Nom sans pas donné');
        check(problems, 'un vrai renommage laisse un pas', ed().can().undo(), true);
        return verdict(problems, { name: nameInput().value });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_name_renamed_elsewhere_is_not_overwritten',
    description: 'Le modèle a été renommé ailleurs (l\'explorateur de GFS) depuis le renommage : Ctrl + Z ne remet pas l\'ancien nom par-dessus, il le dit, ne change rien et n\'écrit rien',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Nom autrui');
        await open(h, ids.b);
        await rename(h, 'Nom autrui à moi');
        await h.clickButton('btn-save');
        await h.sleep(500);
        stub().remoteWrite(TABLE, ids.b, { Nom: 'Nom autrui GFS' });
        // Enregistrer relit la table : le titre prend le nom donné ailleurs (js/main.js, adoptTableName).
        await h.clickButton('btn-save');
        await h.sleep(600);
        check(problems, 'le titre a pris le nom donné ailleurs', nameInput().value, 'Nom autrui GFS');
        // Les écritures dans la table des modèles (la sonde des droits, elle, écrit de son côté).
        const writtenToModels = () => stub().getActionLog().filter(action => action[1] === TABLE).length;
        const writes = writtenToModels();
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le nom donné ailleurs reste', nameInput().value, 'Nom autrui GFS');
        check(problems, 'Ctrl + Z : le coin d\'état le dit', status(), I18n.t('history.nameChanged'));
        check(problems, 'Ctrl + Z : aucune écriture dans la table des modèles', writtenToModels(), writes);
        check(problems, 'la table garde le nom donné ailleurs', nameInTable(ids.b), 'Nom autrui GFS');
        return verdict(problems, { name: nameInput().value });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_name_of_a_new_template_goes_back_to_the_invitation',
    description: 'Un modèle neuf pas encore enregistré, nommé au crayon : Ctrl + Z vide le champ et la liste reprend son invite (« Nouveau modèle »), Ctrl + Y rend le nom',
    async run(h) {
      const problems = [];
      try {
        await h.resetEditor();
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-document');
        await h.sleep(300);
        reserve().reset();
        check(problems, 'le modèle neuf n\'a pas de nom', [nameInput().value, Templates.getCurrentId()], ['', null]);
        await rename(h, 'Brouillon nommé');
        check(problems, 'le champ et la liste', [nameInput().value, triggerLabel()], ['Brouillon nommé', 'Brouillon nommé']);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le champ est vide', nameInput().value, '');
        check(problems, 'Ctrl + Z : la liste reprend l\'invite', triggerLabel(), I18n.t('template.newOption'));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le champ et la liste', [nameInput().value, triggerLabel()], ['Brouillon nommé', 'Brouillon nommé']);
        return verdict(problems, { name: nameInput().value, label: triggerLabel() });
      } finally { await leave(h); }
    },
  });

  // --- 3) le type, la qualité du PDF et les lignes d'export du modèle ouvert ---
  const TYPE_FLYOUT = '#v2-quality-flyout';
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  const PREFS = 'Publipostage_PreferencesModeles';
  const choices = () => ['v2-export-type', 'v2-pdf-quality', 'v2-export-lines'].map(id => byId(id).value).join('|');
  const pickType = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]').click();
  const pickQuality = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]').click();
  const pickLines = lines => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]').click();
  // Ce que la table des préférences de la personne garde pour ce modèle (une chaîne vide : le réglage d'origine), telle que Grist l'a.
  function storedChoices(id) {
    const table = stub().state.rows[PREFS];
    if (!table) return null;
    const at = table.ModeleId.findIndex(model => String(model) === String(id));
    return at === -1 ? null : [table.TypeExport[at], table.QualitePdf[at], table.LignesExport[at]].join('|');
  }

  cases.push({
    id: 'undo_library_export_choices_each_choice_is_one_step',
    description: 'La qualité du PDF, les lignes puis le type d\'export choisis pour le modèle ouvert : chaque choix est UN pas, trois Ctrl + Z les défont dans l\'ordre inverse (listes, menus et table des préférences), trois Ctrl + Y les rendent',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Export pas');
        await open(h, ids.b);
        check(problems, 'au départ : le PDF vectoriel, une seule ligne', choices(), 'pdf|native|one');
        pickQuality('light');
        await h.sleep(80);
        pickLines('zip');
        await h.sleep(80);
        pickType('docx');
        await h.sleep(300);
        check(problems, 'les trois choix', choices(), 'docx|light|zip');
        check(problems, 'la table des préférences', storedChoices(ids.b), 'docx|light|zip');
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le type seul', choices(), 'pdf|light|zip');
        check(problems, '1er Ctrl + Z : le bouton du type n\'est plus allumé', byId('v2-btn-quality').classList.contains('active'), false);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : les lignes', choices(), 'pdf|light|one');
        check(problems, '2e Ctrl + Z : l\'option cochée du menu Exporter', Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row[aria-checked="true"]')).map(row => row.dataset.exportLines).join(), 'one');
        inEditor('z');
        await settle(h);
        await h.sleep(250);
        check(problems, '3e Ctrl + Z : la qualité', choices(), 'pdf|native|one');
        check(problems, '3e Ctrl + Z : la table des préférences', storedChoices(ids.b), '||');
        inEditor('y');
        inEditor('y');
        inEditor('y');
        await settle(h);
        await h.sleep(250);
        check(problems, 'trois Ctrl + Y', choices(), 'docx|light|zip');
        check(problems, 'trois Ctrl + Y : la table des préférences', storedChoices(ids.b), 'docx|light|zip');
        check(problems, 'trois Ctrl + Y : le bouton du type est allumé', byId('v2-btn-quality').classList.contains('active'), true);
        return verdict(problems, { choices: choices() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_export_choices_stay_with_their_template',
    description: 'Les choix d\'export sont ceux du modèle ouvert, comme le texte : un autre modèle chargé repart d\'un historique vide, Ctrl + Z n\'y touche pas aux choix du premier, qui les retrouve',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Export modèles');
        await open(h, ids.b);
        pickType('docx');
        await h.sleep(300);
        await open(h, ids.a);
        check(problems, 'le modèle A a les siens', choices(), 'pdf|native|one');
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z dans A ne change pas ses choix', choices(), 'pdf|native|one');
        check(problems, 'Ctrl + Z dans A n\'a rien écrit pour B', storedChoices(ids.b), 'docx||');
        await open(h, ids.b);
        check(problems, 'B retrouve son choix', choices(), 'docx|native|one');
        return verdict(problems, { choices: choices() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_export_choice_and_text_come_back_in_the_order_of_the_gestures',
    description: 'Du texte, un type d\'export, du texte : trois Ctrl + Z défont dans l\'ordre inverse, trois Ctrl + Y les rendent dans l\'ordre ; choisir le type déjà choisi ne laisse aucun pas',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Export ordre');
        await open(h, ids.b);
        ed().commands.focus('end');
        await h.sleep(100);
        pickType('pdf');
        await h.sleep(100);
        check(problems, 'choisir le type déjà choisi ne laisse aucun pas', ed().can().undo(), false);
        typedAtEnd(' un');
        pickType('md');
        await h.sleep(200);
        typedAtEnd(' deux');
        const body = () => ed().getText();
        const seen = () => [byId('v2-export-type').value, / un/.test(body()), / deux/.test(body())];
        check(problems, 'avant', seen(), ['md', true, true]);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le second texte seul', seen(), ['md', true, false]);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : le type seul', seen(), ['pdf', true, false]);
        inEditor('z');
        await settle(h);
        check(problems, '3e Ctrl + Z : le premier texte', seen(), ['pdf', false, false]);
        inEditor('y');
        inEditor('y');
        await settle(h);
        check(problems, '2e Ctrl + Y : le premier texte et le type', seen(), ['md', true, false]);
        inEditor('y');
        await settle(h);
        check(problems, '3e Ctrl + Y : le second texte', seen(), ['md', true, true]);
        return verdict(problems, { choices: choices(), text: body() });
      } finally { await leave(h); }
    },
  });

  return cases;
})();
