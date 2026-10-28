// Suite "undoLibrary" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les actions de la BIBLIOTHÈQUE et des Réglages (suite de scenarios-undo-comments.js : demande du 22/10, « Il doit prendre en compte 100% des
// actions faites dans le widget », et réponse du 27/10 « Oui, tout, Réglages compris »). Ces actions visent plus que le modèle ouvert, alors que l'historique de l'éditeur est celui du modèle affiché (Editor.setHTML le vide à chaque
// modèle chargé) : js/action-history.js garde de quoi les défaire et refaire, et le nouvel historique reçoit le repère de celles qui sont faites (js/history-markers.js, domaine « actions »). Ici : 1) le ★ « modèle par défaut » du
// document (le bouton de la barre, une ligne de la liste, une ligne d'« Organiser mes modèles »).
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

  return cases;
})();
