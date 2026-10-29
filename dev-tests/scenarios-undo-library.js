// Suite "undoLibrary" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les actions de la BIBLIOTHÈQUE et des Réglages (suite de scenarios-undo-comments.js : demande du 22/10, « Il doit prendre en compte 100% des
// actions faites dans le widget », et réponse du 27/10 « Oui, tout, Réglages compris »). Ces actions visent plus que le modèle ouvert, alors que l'historique de l'éditeur est celui du modèle affiché (Editor.setHTML le vide à chaque
// modèle chargé) : js/action-history.js garde de quoi les défaire et refaire, et le nouvel historique reçoit le repère de celles qui sont faites (js/history-markers.js, domaine « actions »). Ici : 1) le ★ « modèle par défaut » du
// document (le bouton de la barre, une ligne de la liste, une ligne d'« Organiser mes modèles »). Et deux états du MODÈLE OUVERT, rangés dans son historique comme le texte (domaines « name » et « exportChoices » de
// js/history-markers.js) : 2) le nom que le crayon lui donne, 3) le type, la qualité du PDF et les lignes d'export qu'on lui choisit. Puis 4) la suppression d'un modèle : Ctrl + Z rend sa ligne (même numéro, même jeton) et
// rouvre le modèle, Ctrl + Y le supprime de nouveau. Et 5) le rangement de la personne : l'épingle d'un modèle, le dossier où il est rangé, le dossier « replié par défaut » (js/template-arrangement.js, par la liste des modèles et la
// fenêtre « Organiser mes modèles »).
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


  // --- 4) supprimer un modèle ---
  // Les colonnes d'une ligne que le widget porte (js/templates.js : ROW_COLUMNS) et la ligne telle que Grist la garde, jamais le cache du widget. null : la ligne n'existe pas.
  const ROW_COLUMNS = ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif', 'HeaderFooter', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'SuiviModifications', 'Jeton', 'ModifiePar'];
  function rowOf(id) {
    const row = stub().getRow(TABLE, id);
    if (!row) return null;
    const out = {};
    ROW_COLUMNS.forEach(column => { if (column in row) out[column] = row[column]; });
    return out;
  }
  const inList = id => Array.from(byId('template-select').options).some(option => option.value === String(id));
  const shownId = () => (Templates.getCurrentId() == null ? null : String(Templates.getCurrentId()));
  // Ce qui a été écrit dans la table des modèles depuis le dernier `clearActionLog` : [type, numéro de ligne demandé].
  const modelWrites = () => stub().getActionLog().filter(action => action[1] === TABLE).map(action => [action[0], action[2]]);
  // Une ligne bien remplie : le ★, un jeton, un nom de fichier, un objet et les trois adresses - de quoi voir que rien ne manque au retour.
  async function furnish(id) {
    await Templates.setDefault(id);
    await Templates.ensureToken(id);
    stub().remoteWrite(TABLE, id, { NomFichierPDF: 'Fichier de test', Objet: 'Objet de test', Destinataires: 'a@exemple.fr', Cc: 'b@exemple.fr', Cci: 'c@exemple.fr' });
    await Templates.loadAll();
  }
  // Le vrai bouton « Supprimer », sa confirmation répondue « oui ».
  async function deleteOpen(h) {
    const dialogs = h.stubDialogs({ confirm: true });
    try {
      await h.clickButton('btn-delete');
      await h.sleep(700);
    } finally { dialogs.restore(); }
    return dialogs.asked;
  }
  // Une ligne que quelqu'un d'autre crée dans la table (numéro automatique, ou `row` si on le donne).
  async function addByAnother(values, row) {
    await stub().applyUserActions([['AddRecord', TABLE, row == null ? null : row, values]]);
    await Templates.loadAll();
  }
  const restored = name => I18n.t('status.templateRestored', { name });

  cases.push({
    id: 'undo_library_delete_is_one_ctrl_z_and_the_template_comes_back_on_screen',
    description: 'Un modèle supprimé : UN Ctrl + Z rend sa ligne à la table, telle qu\'elle était et sous le même numéro (une seule écriture), la liste le remontre, l\'écran le rouvre avec son nom, son texte, son ★ et ses choix d\'export, et le coin d\'état le dit',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr un pas');
        await open(h, ids.b);
        await furnish(ids.b);
        pickType('docx');
        await h.sleep(300);
        const before = rowOf(ids.b);
        const choicesBefore = storedChoices(ids.b);
        check(problems, 'avant : la ligne porte un jeton, le ★ et ses réglages', [Boolean(before.Jeton), before.EstParDefaut, before.Objet, before.Cci], [true, true, 'Objet de test', 'c@exemple.fr']);
        stub().clearActionLog();
        const asked = await deleteOpen(h);
        check(problems, 'la suppression pose sa question', asked.length, 1);
        check(problems, 'supprimé : la ligne n\'est plus dans la table', rowOf(ids.b), null);
        check(problems, 'supprimé : seule la suppression est écrite', modelWrites(), [['RemoveRecord', ids.b]]);
        check(problems, 'supprimé : la liste ne le montre plus', inList(ids.b), false);
        check(problems, 'supprimé : l\'écran est un document vierge', [Templates.getCurrentId(), ed().getText()], [null, '']);
        check(problems, 'supprimé : une action en réserve', reserve().count(), 1);
        ed().commands.focus('end');
        await h.sleep(100);
        stub().clearActionLog();
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la ligne est rendue telle qu\'elle était', rowOf(ids.b), before);
        check(problems, 'Ctrl + Z : une seule écriture, la ligne sous son numéro', modelWrites(), [['AddRecord', ids.b]]);
        check(problems, 'Ctrl + Z : la liste le montre', inList(ids.b), true);
        check(problems, 'Ctrl + Z : l\'écran l\'a rouvert', [shownId(), byId('template-select').value, nameInput().value], [String(ids.b), String(ids.b), ids.nameB]);
        check(problems, 'Ctrl + Z : son texte est à l\'écran', ed().getText(), 'Contenu de ' + ids.nameB);
        check(problems, 'Ctrl + Z : le ★ revient, dans la table et sur le bouton de la barre', [flagged(), barStarOn()], [[ids.b], true]);
        check(problems, 'Ctrl + Z : ses choix d\'export sont retrouvés', [choices(), storedChoices(ids.b)], ['docx|native|one', choicesBefore]);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), restored(ids.nameB));
        return verdict(problems, { row: rowOf(ids.b), writes: modelWrites() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_ctrl_y_deletes_again_even_when_ctrl_z_reopened_the_template',
    description: 'Le modèle rouvert par Ctrl + Z garde son Ctrl + Y (le bouton Rétablir de la barre aussi) : il le supprime de nouveau, et un Ctrl + Z de plus le rend encore, identique',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr rétablir');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : le modèle est rouvert', [shownId(), rowOf(ids.b)], [String(ids.b), before]);
        check(problems, 'il y a un Ctrl + Y à faire, et le bouton Rétablir de la barre l\'offre', [ed().can().redo(), byId('v2-btn-redo').disabled], [true, false]);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : supprimé de nouveau, la liste et la table', [rowOf(ids.b), inList(ids.b)], [null, false]);
        check(problems, 'Ctrl + Y : l\'écran est un document vierge', [Templates.getCurrentId(), ed().getText()], [null, '']);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), I18n.t('status.templateDeleted'));
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z encore : la ligne revient, identique', rowOf(ids.b), before);
        check(problems, 'Ctrl + Z encore : et l\'écran la rouvre', [shownId(), ed().getText()], [String(ids.b), 'Contenu de ' + ids.nameB]);
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'le bouton Rétablir de la barre le supprime une troisième fois', [rowOf(ids.b), Templates.getCurrentId()], [null, null]);
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'le bouton Annuler de la barre le rend une troisième fois', rowOf(ids.b), before);
        return verdict(problems, { row: rowOf(ids.b) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_comes_back_from_another_template_and_the_screen_stays',
    description: 'Un modèle supprimé, un autre ouvert depuis : Ctrl + Z le rend à la table et à la liste sans toucher à l\'écran, Ctrl + Y le supprime de nouveau sans toucher à l\'écran non plus, Ctrl + Z le rend encore',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr ailleurs');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        await open(h, ids.a);
        const screen = () => [shownId(), byId('template-select').value, ed().getText(), nameInput().value];
        const screenA = screen();
        check(problems, 'A est ouvert, B est parti', [screenA, inList(ids.b)], [[String(ids.a), String(ids.a), 'Contenu de ' + ids.nameA, ids.nameA], false]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la ligne est rendue telle qu\'elle était', rowOf(ids.b), before);
        check(problems, 'Ctrl + Z : B revient dans la liste', inList(ids.b), true);
        check(problems, 'Ctrl + Z : l\'écran reste à A', screen(), screenA);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), restored(ids.nameB));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : B est supprimé de nouveau', [rowOf(ids.b), inList(ids.b)], [null, false]);
        check(problems, 'Ctrl + Y : l\'écran reste à A', screen(), screenA);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), I18n.t('status.templateDeleted'));
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z encore : la ligne revient, identique', rowOf(ids.b), before);
        check(problems, 'Ctrl + Z encore : l\'écran reste à A', screen(), screenA);
        return verdict(problems, { row: rowOf(ids.b) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_and_typed_text_come_back_in_the_order_of_the_gestures',
    description: 'Un modèle supprimé, puis du texte tapé dans le document vierge : le premier Ctrl + Z défait le texte, le second rend le modèle et le rouvre (l\'écran est de nouveau vide) ; Ctrl + Y ne rejoue pas le texte tapé là sur le modèle rouvert',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr texte');
        await open(h, ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd('Brouillon');
        await h.sleep(300);
        check(problems, 'le brouillon est tapé, le modèle est toujours parti', [ed().getText(), rowOf(ids.b)], ['Brouillon', null]);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le texte seul', [ed().getText(), rowOf(ids.b)], ['', null]);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le texte revient, le modèle reste parti', [ed().getText(), rowOf(ids.b)], ['Brouillon', null]);
        inEditor('z');
        await settle(h);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : le modèle est rendu', rowOf(ids.b), before);
        check(problems, '2e Ctrl + Z : et rouvert, l\'écran n\'avait plus que du vide', [shownId(), ed().getText()], [String(ids.b), 'Contenu de ' + ids.nameB]);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le brouillon n\'est pas rejoué sur le modèle rouvert', ed().getText(), 'Contenu de ' + ids.nameB);
        return verdict(problems, { text: ed().getText() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_with_other_text_on_screen_comes_back_to_the_list_only',
    description: 'Le document vierge a été remplacé par un autre texte, pas encore enregistré : Ctrl + Z rend le modèle à la table et à la liste, l\'écran n\'est pas touché (ce texte ne se perd pas), Ctrl + Y supprime le modèle de nouveau, l\'écran non plus',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr écran pris');
        await open(h, ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        // Comme un import ou une copie de la galerie : un autre texte prend la place du document vierge (l'historique repart, le repère de la suppression y est reposé) et il est « à enregistrer » (js/main.js : markAutosaveDirty).
        Editor.setHTML('<p>Texte pas enregistré</p>');
        ed().view.dispatch(ed().state.tr.insertText(' !', ed().state.doc.content.size - 1).setMeta('addToHistory', false));
        await h.sleep(300);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la ligne est rendue', rowOf(ids.b), before);
        check(problems, 'Ctrl + Z : le modèle est dans la liste, aucun n\'est choisi', [inList(ids.b), byId('template-select').value], [true, '']);
        check(problems, 'Ctrl + Z : l\'écran garde son texte', [Templates.getCurrentId(), ed().getText()], [null, 'Texte pas enregistré !']);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), restored(ids.nameB));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : supprimé de nouveau', [rowOf(ids.b), inList(ids.b)], [null, false]);
        check(problems, 'Ctrl + Y : l\'écran garde son texte', ed().getText(), 'Texte pas enregistré !');
        return verdict(problems, { text: ed().getText() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_whose_name_was_taken_meanwhile_comes_back_with_a_numbered_name',
    description: 'Quelqu\'un a créé un modèle de même nom entre-temps : Ctrl + Z rend le supprimé sous « nom (2) », le coin d\'état le dit, et l\'autre modèle n\'est pas touché',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr nom pris');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        const other = Object.assign({}, before, { Nom: ids.nameB, Jeton: 'jeton-de-l-autre', EstParDefaut: false, Contenu: '<p>Celui de l\'autre</p>' });
        await addByAnother(other);
        const added = stub().state.rows[TABLE].id.slice(-1)[0];
        const otherRow = rowOf(added);
        stub().clearActionLog();
        inEditor('z');
        await settle(h);
        const back = rowOf(ids.b);
        check(problems, 'Ctrl + Z : la ligne revient sous son numéro, avec un nom numéroté', back && back.Nom, ids.nameB + ' (2)');
        check(problems, 'Ctrl + Z : le reste de la ligne est celui d\'avant', back && Object.assign({}, back, { Nom: before.Nom }), before);
        check(problems, 'Ctrl + Z : l\'autre modèle n\'est pas touché', rowOf(added), otherRow);
        check(problems, 'Ctrl + Z : une seule écriture', modelWrites(), [['AddRecord', ids.b]]);
        check(problems, 'Ctrl + Z : le coin d\'état dit le nouveau nom', status(), I18n.t('status.templateRestoredAs', { name: ids.nameB + ' (2)' }));
        check(problems, 'Ctrl + Z : le champ du nom montre le nouveau nom', nameInput().value, ids.nameB + ' (2)');
        return verdict(problems, { row: back });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_whose_row_number_was_taken_meanwhile_comes_back_under_a_new_number',
    description: 'Un autre modèle a pris le numéro du supprimé : Ctrl + Z rend le contenu sous un numéro neuf, sans écraser celui qui est là',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr numéro pris');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        const other = Object.assign({}, before, { Nom: 'Occupant ' + ids.b, Jeton: 'jeton-occupant', EstParDefaut: false, Contenu: '<p>Occupant</p>' });
        await addByAnother(other, ids.b);
        const occupant = rowOf(ids.b);
        stub().clearActionLog();
        inEditor('z');
        await settle(h);
        const table = stub().state.rows[TABLE];
        const newId = table.id.find(id => rowOf(id).Jeton === before.Jeton);
        check(problems, 'Ctrl + Z : la ligne est revenue, sous un autre numéro', [newId != null, newId !== ids.b], [true, true]);
        check(problems, 'Ctrl + Z : le contenu est celui d\'avant', rowOf(newId), before);
        check(problems, 'Ctrl + Z : l\'occupant du numéro n\'est pas touché', rowOf(ids.b), occupant);
        check(problems, 'Ctrl + Z : une seule écriture, sans numéro imposé', modelWrites(), [['AddRecord', null]]);
        check(problems, 'Ctrl + Z : l\'écran rouvre le modèle rendu', [shownId(), ed().getText()], [String(newId), 'Contenu de ' + ids.nameB]);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), restored(ids.nameB));
        return verdict(problems, { newId, occupant });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_does_not_take_the_star_back_from_another_template',
    description: 'Le ★ a été posé sur un autre modèle depuis la suppression : Ctrl + Z rend le modèle sans ★, le ★ reste où il est (un seul modèle par défaut)',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr étoile');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        await Templates.setDefault(ids.a);
        await Templates.loadAll();
        check(problems, 'le ★ est sur A', flagged(), [ids.a]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la ligne revient sans le ★, le reste est celui d\'avant', rowOf(ids.b), Object.assign({}, before, { EstParDefaut: false }));
        check(problems, 'Ctrl + Z : le ★ reste sur A', flagged(), [ids.a]);
        check(problems, 'Ctrl + Z : le bouton de la barre, B est ouvert sans ★', [shownId(), barStarOn()], [String(ids.b), false]);
        return verdict(problems, { flagged: flagged() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_already_back_or_gone_writes_nothing_and_says_so',
    description: 'Le modèle est déjà revenu (même jeton, recréé par quelqu\'un d\'autre) ou déjà parti quand Ctrl + Y le supprime : rien n\'est écrit, le coin d\'état dit pourquoi',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Suppr déjà');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        await addByAnother(Object.assign({}, before));
        const rows = stub().state.rows[TABLE].id.length;
        stub().clearActionLog();
        inEditor('z');
        await settle(h);
        check(problems, 'déjà revenu : aucune écriture', modelWrites(), []);
        check(problems, 'déjà revenu : une seule ligne porte ce jeton', stub().state.rows[TABLE].Jeton.filter(token => token === before.Jeton).length, 1);
        check(problems, 'déjà revenu : le nombre de lignes n\'a pas bougé', stub().state.rows[TABLE].id.length, rows);
        check(problems, 'déjà revenu : le coin d\'état le dit', [status(), byId('status-msg').className], [I18n.t('history.templateBack'), 'error-msg']);
        const ids2 = await fresh(h, 'Suppr parti');
        await open(h, ids2.b);
        await furnish(ids2.b);
        await deleteOpen(h);
        inEditor('z');
        await settle(h);
        check(problems, 'revenu et rouvert', shownId(), String(ids2.b));
        await stub().applyUserActions([['RemoveRecord', TABLE, ids2.b]]);
        await Templates.loadAll();
        stub().clearActionLog();
        inEditor('y');
        await settle(h);
        check(problems, 'déjà parti : aucune écriture', modelWrites(), []);
        check(problems, 'déjà parti : le coin d\'état le dit', [status(), byId('status-msg').className], [I18n.t('history.templateGone'), 'error-msg']);
        return verdict(problems, { status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_write_failing_changes_nothing_says_so_and_can_be_tried_again',
    description: 'Une écriture refusée par Grist pendant Ctrl + Z : le modèle reste supprimé, le coin d\'état dit l\'échec ; Ctrl + Y puis Ctrl + Z, l\'écriture passant, le rendent',
    async run(h) {
      const problems = [];
      const real = grist.docApi.applyUserActions;
      try {
        const ids = await fresh(h, 'Suppr refus');
        await open(h, ids.b);
        await furnish(ids.b);
        const before = rowOf(ids.b);
        await deleteOpen(h);
        grist.docApi.applyUserActions = () => Promise.reject(new Error('refus de test'));
        const realError = console.error;
        console.error = () => {};
        try {
          inEditor('z');
          await settle(h);
        } finally { console.error = realError; }
        grist.docApi.applyUserActions = real;
        check(problems, 'le modèle est toujours supprimé', [rowOf(ids.b), inList(ids.b)], [null, false]);
        check(problems, 'le coin d\'état dit l\'échec', [status(), byId('status-msg').className], [I18n.t('history.undoFailed'), 'error-msg']);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y ne change rien : le modèle est toujours supprimé', rowOf(ids.b), null);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z, l\'écriture passant : le modèle revient', rowOf(ids.b), before);
        return verdict(problems, { row: rowOf(ids.b) });
      } finally { grist.docApi.applyUserActions = real; await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_delete_refused_or_unread_leaves_no_action_and_still_deletes_what_was_confirmed',
    description: 'La suppression refusée à la question ne supprime rien et ne laisse aucune action ; si la ligne ne peut pas être lue avant la suppression, la suppression confirmée a lieu quand même, seul Annuler n\'en sait rien',
    async run(h) {
      const problems = [];
      const realSnapshot = Templates.snapshotRow;
      try {
        const ids = await fresh(h, 'Suppr refusée');
        await open(h, ids.b);
        const refused = h.stubDialogs({ confirm: false });
        try {
          await h.clickButton('btn-delete');
          await h.sleep(500);
        } finally { refused.restore(); }
        check(problems, 'refusée : la ligne est là, le modèle est ouvert', [Boolean(rowOf(ids.b)), shownId()], [true, String(ids.b)]);
        check(problems, 'refusée : aucune action en réserve', reserve().count(), 0);
        const realWarn = console.warn;
        console.warn = () => {};
        Templates.snapshotRow = () => Promise.reject(new Error('lecture refusée'));
        try {
          await deleteOpen(h);
        } finally { console.warn = realWarn; Templates.snapshotRow = realSnapshot; }
        check(problems, 'lecture refusée : le modèle est tout de même supprimé', [rowOf(ids.b), inList(ids.b)], [null, false]);
        check(problems, 'lecture refusée : aucune action en réserve', reserve().count(), 0);
        return verdict(problems, { count: reserve().count() });
      } finally { Templates.snapshotRow = realSnapshot; await leave(h); }
    },
  });

  // --- 5) le rangement de la personne : épingles, dossiers, dossiers repliés par défaut ---
  // La dernière ligne de rangement qui convient, telle que Grist la garde (jamais le cache du widget), comme TemplatePreferences la lit ; null : pas de ligne.
  function prefRow(match) {
    const table = stub().state.rows[PREFS];
    if (!table) return null;
    let at = -1;
    table.id.forEach((rowId, i) => { if (match(table, i)) at = i; });
    return at === -1 ? null : { pinned: !!table.Epingle[at], folder: table.Dossier[at] || '', collapsed: !!(table.Replie && table.Replie[at]) };
  }
  const pinOf = id => { const row = prefRow((t, i) => Number(t.ModeleId[i]) === Number(id)); return row ? row.pinned : false; };
  const folderOf = id => { const row = prefRow((t, i) => Number(t.ModeleId[i]) === Number(id)); return row ? row.folder : ''; };
  const collapsedOf = path => { const row = prefRow((t, i) => Number(t.ModeleId[i]) === 0 && t.Dossier[i] === path); return row ? row.collapsed : false; };
  const prefWrites = () => stub().getActionLog().filter(action => action[1] === PREFS).map(action => action[0]);

  const trigger = () => document.querySelector('.tts-trigger');
  const popup = () => document.querySelector('.tts-popup');
  const popupOpen = () => !!popup() && popup().classList.contains('is-open');
  const windowList = () => byId('template-organize-list');
  const windowRow = id => windowList().querySelector('.tts-row-leaf[data-template-id="' + id + '"]');
  const windowFolder = label => Array.from(windowList().querySelectorAll('.tts-row-folder')).find(row => row.querySelector('.tts-row-label').textContent === label) || null;
  // Les noms que la section « Épinglés » de la liste montre, et les dossiers qu'elle montre (leur nom, ouvert ou replié) ; `pattern` ne garde que ceux du cas (les modèles et les dossiers des cas d'avant restent dans la liste).
  function pinnedShown(pattern) {
    const names = [];
    let inPinned = false;
    Array.from(popup().children).forEach(node => {
      if (node.classList.contains('tts-section-label')) inPinned = node.textContent === I18n.t('templateTree.pinnedSection');
      else if (inPinned && node.classList.contains('tts-row-leaf')) names.push(node.querySelector('.tts-row-label').textContent.replace(/ ★| 📌/g, '').trim());
    });
    return names.filter(name => pattern.test(name));
  }
  const foldersShown = pattern => Array.from(popup().querySelectorAll('.tts-row-folder')).map(row => [row.querySelector('.tts-row-label').textContent, row.getAttribute('aria-expanded')]).filter(folder => pattern.test(folder[0]));

  // Un clic comme la souris le fait (appui, relâchement, clic).
  async function press(h, element) {
    if (!element) throw new Error('élément introuvable pour un clic simulé');
    ['mousedown', 'mouseup', 'click'].forEach(type => element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
    await h.sleep(80);
  }
  // L'épingle d'une ligne de la liste des modèles, puis la liste refermée.
  async function listPin(h, id) {
    if (!popupOpen()) { await press(h, trigger()); await h.sleep(250); }
    await press(h, popup().querySelector('.tts-row-leaf[data-template-id="' + id + '"] .tts-pin-btn'));
    await h.sleep(250);
    if (popupOpen()) await press(h, trigger());
    await h.sleep(150);
  }
  // La fenêtre « Organiser mes modèles » : `use` agit dedans, puis elle est refermée (sauf `keepOpen`).
  async function inWindow(h, use, keepOpen) {
    TemplateOrganizeModal.open();
    await h.sleep(80);
    try { await use(); } finally { if (!keepOpen) TemplateOrganizeModal.close(); }
    await h.sleep(100);
  }
  // « Déplacer vers… » d'une ligne, le dossier tapé dans la saisie (null : la saisie annulée).
  async function windowMove(h, id, path) {
    const dialogs = h.stubDialogs({ prompt: path });
    try { await press(h, windowRow(id).querySelector('.tom-move-btn')); await h.sleep(300); } finally { dialogs.restore(); }
  }
  const pinned = name => I18n.t('status.templatePinned', { name });
  const unpinned = name => I18n.t('status.templateUnpinned', { name });
  const moved = (name, folder) => I18n.t('status.templateMoved', { name, folder });
  const unfiled = name => I18n.t('status.templateUnfiled', { name });

  cases.push({
    id: 'undo_library_pin_from_the_list_is_one_ctrl_z_and_ctrl_y_gives_it_back',
    description: 'L\'épingle posée sur une ligne de la liste des modèles : UN Ctrl + Z la retire, UN Ctrl + Y la repose ; la table des préférences, le cache, la section « Épinglés » de la liste et le coin d\'état suivent',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Épingle un pas');
        await listPin(h, ids.a);
        check(problems, 'épinglé : la table, le cache et la liste', [pinOf(ids.a), TemplatePreferences.isPinned(ids.a), pinnedShown(/Épingle un pas/)], [true, true, [ids.nameA]]);
        check(problems, 'épinglé : une action en réserve', reserve().count(), 1);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la table, le cache et la liste', [pinOf(ids.a), TemplatePreferences.isPinned(ids.a), pinnedShown(/Épingle un pas/)], [false, false, []]);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), unpinned(ids.nameA));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : la table, le cache et la liste', [pinOf(ids.a), TemplatePreferences.isPinned(ids.a), pinnedShown(/Épingle un pas/)], [true, true, [ids.nameA]]);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), pinned(ids.nameA));
        check(problems, 'le modèle ouvert n\'a pas changé', Templates.getCurrentId(), ids.b);
        return verdict(problems, { pinned: pinOf(ids.a) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_pin_in_the_window_comes_back_by_the_bar_buttons_and_the_open_window_follows',
    description: 'L\'épingle posée dans « Organiser mes modèles » : fenêtre refermée, le bouton Annuler de la barre la retire et le bouton Rétablir la repose ; fenêtre rouverte, la ligne montre l\'état rendu, et une fenêtre restée ouverte se redessine d\'elle-même',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Épingle fenêtre');
        const pressedInWindow = id => windowRow(id).querySelector('.tts-pin-btn').getAttribute('aria-pressed');
        await inWindow(h, async () => { await press(h, windowRow(ids.a).querySelector('.tts-pin-btn')); await h.sleep(250); });
        check(problems, 'épinglé dans la fenêtre : la table et le cache', [pinOf(ids.a), TemplatePreferences.isPinned(ids.a)], [true, true]);
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'bouton Annuler : la table, le cache et la liste', [pinOf(ids.a), TemplatePreferences.isPinned(ids.a), pinnedShown(/Épingle fenêtre/)], [false, false, []]);
        check(problems, 'bouton Annuler : le coin d\'état', status(), unpinned(ids.nameA));
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'bouton Rétablir : la table et la liste', [pinOf(ids.a), pinnedShown(/Épingle fenêtre/)], [true, [ids.nameA]]);
        await inWindow(h, async () => {
          check(problems, 'fenêtre rouverte : la ligne montre l\'épingle', pressedInWindow(ids.a), 'true');
          // La fenêtre reste ouverte : le clavier ne passe pas sous elle, mais le bouton de la barre agit, et la ligne suit.
          await h.clickButton('v2-btn-undo');
          await settle(h);
          check(problems, 'fenêtre ouverte, bouton Annuler : la ligne se redessine sans épingle', pressedInWindow(ids.a), 'false');
          await h.clickButton('v2-btn-redo');
          await settle(h);
          check(problems, 'fenêtre ouverte, bouton Rétablir : la ligne montre l\'épingle', pressedInWindow(ids.a), 'true');
        });
        return verdict(problems, { pinned: pinOf(ids.a) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_move_to_a_folder_is_one_ctrl_z_and_the_folder_goes_with_it',
    description: '« Déplacer vers… » un dossier (même imbriqué) : UN Ctrl + Z remet le modèle hors de tout dossier - et le dossier, qui n\'existait que par lui, disparaît de la liste -, UN Ctrl + Y le range de nouveau ; le coin d\'état nomme le dossier',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Dossier un pas');
        const folder = 'Factures M1/Clients M1';
        await inWindow(h, () => windowMove(h, ids.a, folder));
        check(problems, 'rangé : la table, le cache et la liste', [folderOf(ids.a), TemplatePreferences.getFolder(ids.a), foldersShown(/ M1$/).map(f => f[0])], [folder, folder, ['Factures M1', 'Clients M1']]);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la table et le cache', [folderOf(ids.a), TemplatePreferences.getFolder(ids.a) || ''], ['', '']);
        check(problems, 'Ctrl + Z : plus de dossier dans la liste', foldersShown(/ M1$/), []);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), unfiled(ids.nameA));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : la table, le cache et la liste', [folderOf(ids.a), TemplatePreferences.getFolder(ids.a), foldersShown(/ M1$/).map(f => f[0])], [folder, folder, ['Factures M1', 'Clients M1']]);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), moved(ids.nameA, folder));
        return verdict(problems, { folder: folderOf(ids.a) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_move_from_one_folder_to_another_goes_back_one_step_at_a_time',
    description: 'Un modèle rangé dans un dossier, puis dans un autre : le premier Ctrl + Z le remet dans le premier, le second hors de tout dossier ; deux Ctrl + Y le rangent de nouveau, dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Dossier deux pas');
        await inWindow(h, () => windowMove(h, ids.a, 'Premier UL'));
        await inWindow(h, () => windowMove(h, ids.a, 'Second UL'));
        check(problems, 'rangé dans le second', folderOf(ids.a), 'Second UL');
        check(problems, 'deux actions en réserve', reserve().count(), 2);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le premier dossier', [folderOf(ids.a), status()], ['Premier UL', moved(ids.nameA, 'Premier UL')]);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : hors de tout dossier', [folderOf(ids.a), status()], ['', unfiled(ids.nameA)]);
        inEditor('y');
        await settle(h);
        check(problems, '1er Ctrl + Y : le premier dossier', folderOf(ids.a), 'Premier UL');
        inEditor('y');
        await settle(h);
        check(problems, '2e Ctrl + Y : le second dossier', [folderOf(ids.a), status()], ['Second UL', moved(ids.nameA, 'Second UL')]);
        return verdict(problems, { folder: folderOf(ids.a) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_drag_and_drop_and_place_here_are_one_step_each',
    description: 'Un modèle glissé sur un dossier, un autre rangé par « Ranger ici » dans un dossier tout juste nommé : chacun est UN pas, Ctrl + Z le remet hors du dossier (le dossier en attente, devenu réel, disparaît avec lui), Ctrl + Y le range de nouveau',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Glisser UL');
        await inWindow(h, () => windowMove(h, ids.a, 'Glissé UL'));
        // Le glisser-déposer HTML5, avec un DataTransfer partagé entre les quatre événements, comme le fait la souris.
        await inWindow(h, async () => {
          const dataTransfer = new DataTransfer();
          const source = windowRow(ids.b);
          const target = windowFolder('Glissé UL');
          source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
          target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
          source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
          await h.sleep(300);
        });
        check(problems, 'glissé : B est rangé avec A', [folderOf(ids.a), folderOf(ids.b)], ['Glissé UL', 'Glissé UL']);
        const third = await createTemplate(h, 'Glisser UL C');
        await Templates.loadAll();
        reserve().reset();
        await inWindow(h, async () => {
          const dialogs = h.stubDialogs({ prompt: 'Ici UL' });
          try { await press(h, byId('template-organize-new-folder')); await h.sleep(300); } finally { dialogs.restore(); }
          await press(h, windowRow(third).querySelector('.tom-place-here-btn'));
          await h.sleep(300);
        });
        check(problems, 'rangé ici : le dossier est réel', [folderOf(third), reserve().count()], ['Ici UL', 1]);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : « Ranger ici » est défait, le dossier a disparu', [folderOf(third), foldersShown(/^Ici UL$/).length], ['', 0]);
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : rangé de nouveau', [folderOf(third), foldersShown(/^Ici UL$/).length], ['Ici UL', 1]);
        return verdict(problems, { third: folderOf(third) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_folder_collapsed_by_default_is_one_step_and_the_list_follows',
    description: 'L\'interrupteur « replié par défaut » d\'un dossier : UN Ctrl + Z le remet comme il était (la table, le cache, la liste qui s\'ouvre dépliée), UN Ctrl + Y le replie de nouveau ; deux clics sont deux pas ; le coin d\'état nomme le dossier',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Replié UL');
        const folder = 'Replié UL dossier';
        await inWindow(h, () => windowMove(h, ids.a, folder));
        reserve().reset();
        const fold = async () => { await press(h, windowFolder(folder).querySelector('.tom-folder-default-btn')); await h.sleep(300); };
        await inWindow(h, fold);
        check(problems, 'replié : la table, le cache et la liste', [collapsedOf(folder), TemplatePreferences.isFolderCollapsed(folder), foldersShown(/^Replié UL dossier$/)], [true, true, [[folder, 'false']]]);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z : la table, le cache et la liste', [collapsedOf(folder), TemplatePreferences.isFolderCollapsed(folder), foldersShown(/^Replié UL dossier$/)], [false, false, [[folder, 'true']]]);
        check(problems, 'Ctrl + Z : le coin d\'état', status(), I18n.t('status.folderExpanded', { folder }));
        inEditor('y');
        await settle(h);
        check(problems, 'Ctrl + Y : la table et la liste', [collapsedOf(folder), foldersShown(/^Replié UL dossier$/)], [true, [[folder, 'false']]]);
        check(problems, 'Ctrl + Y : le coin d\'état', status(), I18n.t('status.folderCollapsed', { folder }));
        await inWindow(h, fold);
        check(problems, 'second clic : déplié de nouveau, deux actions en réserve', [collapsedOf(folder), reserve().count()], [false, 2]);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z du second clic : replié', collapsedOf(folder), true);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z du premier clic : déplié', collapsedOf(folder), false);
        return verdict(problems, { collapsed: collapsedOf(folder) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_arrangement_that_changes_nothing_or_fails_leaves_no_step',
    description: 'Ranger un modèle où il est, la saisie « Déplacer vers… » annulée, une écriture refusée par Grist : aucun pas à défaire (Ctrl + Z ne défait que le geste d\'avant) ; le rangement qui ne change rien s\'écrit comme avant',
    async run(h) {
      const problems = [];
      const real = grist.docApi.applyUserActions;
      try {
        const ids = await fresh(h, 'Rien UL');
        await inWindow(h, () => windowMove(h, ids.a, 'Même UL'));
        check(problems, 'un premier rangement : une action', reserve().count(), 1);
        await inWindow(h, () => windowMove(h, ids.a, 'Même UL'));
        check(problems, 'ranger où il est : toujours une action', reserve().count(), 1);
        await inWindow(h, () => windowMove(h, ids.b, ''));
        check(problems, 'ranger hors de tout dossier un modèle qui l\'est déjà : toujours une action', reserve().count(), 1);
        stub().clearActionLog();
        await inWindow(h, () => windowMove(h, ids.b, null));
        check(problems, 'saisie annulée : rien n\'est écrit, toujours une action', [prefWrites(), reserve().count()], [[], 1]);
        grist.docApi.applyUserActions = () => Promise.reject(new Error('refus de test'));
        const realError = console.error;
        console.error = () => {};
        try {
          await inWindow(h, async () => { await press(h, windowRow(ids.b).querySelector('.tts-pin-btn')); await h.sleep(300); });
        } finally { console.error = realError; grist.docApi.applyUserActions = real; }
        check(problems, 'écriture refusée : pas d\'épingle, toujours une action', [pinOf(ids.b), TemplatePreferences.isPinned(ids.b), reserve().count()], [false, false, 1]);
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z défait le seul vrai geste : le rangement de A', [folderOf(ids.a), pinOf(ids.b)], ['', false]);
        return verdict(problems, { count: reserve().count() });
      } finally { grist.docApi.applyUserActions = real; await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_arrangement_and_text_come_back_in_the_order_of_the_gestures',
    description: 'Du texte, une épingle, un dossier, du texte : quatre Ctrl + Z défont dans l\'ordre inverse (le second texte, le dossier, l\'épingle, le premier texte), quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Ordre UL');
        await open(h, ids.b);
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd(' un');
        await listPin(h, ids.a);
        await inWindow(h, () => windowMove(h, ids.a, 'Ordre UL dossier'));
        ed().commands.focus('end');
        await h.sleep(100);
        typedAtEnd(' deux');
        const body = () => ed().getText();
        const seen = () => [/ un/.test(body()), / deux/.test(body()), pinOf(ids.a), folderOf(ids.a)];
        check(problems, 'avant', seen(), [true, true, true, 'Ordre UL dossier']);
        inEditor('z');
        await settle(h);
        check(problems, '1er Ctrl + Z : le second texte seul', seen(), [true, false, true, 'Ordre UL dossier']);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : le dossier seul', seen(), [true, false, true, '']);
        inEditor('z');
        await settle(h);
        check(problems, '3e Ctrl + Z : l\'épingle seule', seen(), [true, false, false, '']);
        inEditor('z');
        await settle(h);
        check(problems, '4e Ctrl + Z : le premier texte', seen(), [false, false, false, '']);
        inEditor('y');
        inEditor('y');
        await settle(h);
        check(problems, '2e Ctrl + Y : le premier texte et l\'épingle', seen(), [true, false, true, '']);
        inEditor('y');
        await settle(h);
        check(problems, '3e Ctrl + Y : le dossier', seen(), [true, false, true, 'Ordre UL dossier']);
        inEditor('y');
        await settle(h);
        check(problems, '4e Ctrl + Y : le second texte', seen(), [true, true, true, 'Ordre UL dossier']);
        return verdict(problems, { text: body() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_arrangement_comes_back_from_another_template_than_the_one_it_was_made_in',
    description: 'L\'épingle et le dossier posés, puis un AUTRE modèle ouvert (l\'historique du texte repart à vide) : Ctrl + Z les défait encore, dans l\'ordre, sans changer le modèle ouvert ; Ctrl + Y les rend',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Ailleurs UL');
        await listPin(h, ids.a);
        await inWindow(h, () => windowMove(h, ids.a, 'Ailleurs UL dossier'));
        await open(h, ids.a);
        check(problems, 'le modèle ouvert est A', Templates.getCurrentId(), ids.a);
        inEditor('z');
        await settle(h);
        check(problems, 'Ctrl + Z depuis A : le dossier', [folderOf(ids.a), pinOf(ids.a), Templates.getCurrentId()], ['', true, ids.a]);
        inEditor('z');
        await settle(h);
        check(problems, '2e Ctrl + Z : l\'épingle', [folderOf(ids.a), pinOf(ids.a), Templates.getCurrentId()], ['', false, ids.a]);
        inEditor('y');
        inEditor('y');
        await settle(h);
        check(problems, 'deux Ctrl + Y : l\'épingle et le dossier', [folderOf(ids.a), pinOf(ids.a), Templates.getCurrentId()], ['Ailleurs UL dossier', true, ids.a]);
        return verdict(problems, { folder: folderOf(ids.a) });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_library_arrangement_of_a_template_deleted_meanwhile_writes_nothing_and_says_so',
    description: 'Le modèle épinglé, puis supprimé par quelqu\'un d\'autre : Ctrl + Z n\'écrit rien dans les préférences et le coin d\'état dit que le modèle n\'existe plus',
    async run(h) {
      const problems = [];
      try {
        const ids = await fresh(h, 'Parti UL');
        await listPin(h, ids.a);
        await stub().applyUserActions([['RemoveRecord', TABLE, ids.a]]);
        await Templates.loadAll();
        stub().clearActionLog();
        ed().commands.focus('end');
        await h.sleep(100);
        inEditor('z');
        await settle(h);
        check(problems, 'aucune écriture dans les préférences', prefWrites(), []);
        check(problems, 'le coin d\'état le dit', [status(), byId('status-msg').className], [I18n.t('history.templateGone'), 'error-msg']);
        return verdict(problems, { status: status() });
      } finally { await leave(h); }
    },
  });

  return cases;
})();
