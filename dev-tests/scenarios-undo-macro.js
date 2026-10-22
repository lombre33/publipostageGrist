// Suite "undoMacro" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi ce qu'un MACRO-MODÈLE garde hors du texte (suite de scenarios-undo-page.js et scenarios-undo-model.js : demande du 22/10, « Il doit
// prendre en compte 100% des actions faites dans le widget »). Un macro-modèle n'a pas de corps de document : l'éditeur est caché, son résumé prend la place, et Annuler / Rétablir étaient grisés. Or on y change sa page
// (format, sens « Selon chaque modèle », marges), on y ferme l'œil d'un modèle (masqué de la Lecture et des exports : la composition est réécrite dans sa ligne) et on y enregistre la fenêtre de composition.
//
// Les attendus sont ceux de la personne qui défait : 1) les boutons de la barre sont actifs et la touche agit, le focus sur le corps de la page ; 2) UN Ctrl + Z rend la page d'avant, UN Ctrl + Y la rend de nouveau ;
// 3) l'œil refermé se rouvre (le résumé, le cache des modèles, la ligne de Grist), le coin d'état le dit ; 4) la composition enregistrée par la fenêtre se défait d'un pas, le nom n'y est pour rien ; 5) l'ordre est celui
// des gestes ; 6) une rafale de clics et de Ctrl + Z finit sur l'état voulu, Grist lent ; 7) un autre macro-modèle ne reçoit jamais le geste de l'ancien. Le même parcours à la vraie souris dans le panneau de 700x400 :
// verify-undo-macro-mouse.mjs (undoMacroMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoMacro = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const AUTOSAVE_KEY = 'pp_autosave_enabled';
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  const row = id => window.__gristStub.getRow(TABLE, id);
  const slotsOf = r => { try { return JSON.parse(r.Contenu).slots; } catch (e) { return null; } };
  // Les modèles masqués de la position `index` dans la composition écrite dans une ligne (null : cette position n'existe pas).
  const hiddenIn = (r, index) => { const slot = (slotsOf(r) || [])[index]; return slot ? (slot.hiddenModeleIds || []).map(String) : null; };
  const eyeOf = (slot, id) => document.querySelector('#macro-summary-parts .macro-summary-eye[data-slot="' + slot + '"][data-template-id="' + id + '"]');
  const pressed = (slot, id) => { const eye = eyeOf(slot, id); return eye ? eye.getAttribute('aria-pressed') : null; };
  const statusNow = () => byId('status-msg').textContent;
  const summaryShown = () => getComputedStyle(byId('macro-summary-container')).display !== 'none';
  const locked = id => byId(id).classList.contains('v2-hf-locked');
  // La page du macro-modèle telle que le modèle la garde.
  const page = () => ({ format: PageLayout.getFormat(), orientation: PageLayout.getOrientation(), auto: PageLayout.isOrientationAuto() });
  const savedPage = id => { try { const m = JSON.parse(row(id).Margins || '{}'); return { format: m.format || 'A4', orientation: m.orientation || 'portrait' }; } catch (e) { return null; } };

  // Ctrl + Z et Ctrl + Y au vrai clavier de la page : l'éditeur est caché, le focus est sur le corps de la page.
  function press(key, shiftKey) {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  // Compte les annonces qui préviennent l'enregistrement automatique.
  function listen() {
    const counter = { margins: 0, reset() { counter.margins = 0; }, stop() { document.removeEventListener('pp:marginsChanged', handler); } };
    const handler = () => { counter.margins++; };
    document.addEventListener('pp:marginsChanged', handler);
    return counter;
  }

  function setAutosave(enabled) { try { if (enabled) localStorage.removeItem(AUTOSAVE_KEY); else localStorage.setItem(AUTOSAVE_KEY, 'false'); } catch (e) { /* stockage indisponible */ } }
  async function leave(h) {
    window.__gristStub.setLatency({ fetchTable: 0, applyUserActions: 0 });
    setAutosave(true);
    await h.clickButton('btn-new');
    await h.sleep(300);
  }
  async function reopen(h, id) {
    await Templates.loadAll();
    const select = byId('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
  }
  // Un macro-modèle composé et ouvert comme par une personne : créé par la vraie fenêtre de composition (la page de garde est le premier modèle ; il est enregistré, sélectionné et chargé), puis complété d'une annexe conditionnelle
  // (règle 'a' → l'autre modèle, règle 'b' → la garde, défaut → un troisième), donc plusieurs yeux, et rouvert par la liste.
  async function composedMacro(h, nom) {
    setAutosave(true);
    await h.clickButton('btn-new');
    await h.sleep(300);
    const cover = await Templates.save(null, nom + ' - garde', '<p>Page de garde</p>', '', null, null, 'document', null);
    const other = await Templates.save(null, nom + ' - autre', '<p>Autre page</p>', '', null, null, 'document', null);
    const third = await Templates.save(null, nom + ' - défaut', '<p>Page par défaut</p>', '', null, null, 'document', null);
    await Templates.loadAll();
    MacroEditor.openModal(null);
    byId('macro-editor-name').value = nom;
    const select = byId('macro-editor-cover');
    select.value = String(cover.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    byId('macro-editor-save').click();
    await h.sleep(700);
    const id = Templates.getCurrentId();
    const rule = (modeleId, value) => ({ column: 'Nom', operator: '=', value, modeleId });
    const slots = [{ type: 'fixed', modeleId: cover.id }, { type: 'conditional', rules: [rule(other.id, 'a'), rule(cover.id, 'b')], defaultModeleId: third.id }];
    window.__gristStub.remoteWrite(TABLE, id, { Contenu: JSON.stringify({ slots }) });
    await reopen(h, id);
    return { id, coverId: cover.id, otherId: other.id, thirdId: third.id };
  }

  cases.push({
    id: 'undo_macro_buttons_are_active_and_the_summary_is_what_is_on_screen',
    description: 'Dans un macro-modèle, les boutons Annuler et Rétablir de la barre ne sont plus grisés ; ce que le macro-modèle ne porte pas (Rechercher, Suivi des modifications) l\'est toujours ; le résumé est à l\'écran, l\'éditeur caché',
    async run(h) {
      const problems = [];
      try {
        await composedMacro(h, 'Macro boutons');
        check(problems, 'Annuler grisé', locked('v2-btn-undo'), false);
        check(problems, 'Rétablir grisé', locked('v2-btn-redo'), false);
        check(problems, 'Rechercher doit rester grisé', locked('v2-btn-find'), true);
        check(problems, 'Suivi des modifications doit rester grisé', locked('v2-btn-track-changes'), true);
        check(problems, 'résumé à l\'écran', summaryShown(), true);
        check(problems, 'éditeur caché', EditorCore.getEditor().view.dom.getClientRects().length, 0);
      } finally { await leave(h); }
      return verdict(problems, 'boutons');
    },
  });

  cases.push({
    id: 'undo_macro_page_format_comes_back_with_ctrl_z_and_goes_again_with_ctrl_y',
    description: 'Le format de la page d\'un macro-modèle (A5) entre dans l\'historique : Ctrl + Z rend l\'A4, Ctrl + Y l\'A5, le bouton Annuler de la barre fait comme Ctrl + Z, chaque retour prévient l\'enregistrement automatique',
    async run(h) {
      const problems = [];
      const log = listen();
      try {
        const macro = await composedMacro(h, 'Macro format');
        const start = page();
        OrientationToggle.selectFormat('A5');
        await h.sleep(150);
        check(problems, 'A5 posé', page().format, 'A5');
        log.reset();
        check(problems, 'Ctrl + Z agit', undo(), true);
        await h.sleep(250);
        check(problems, 'Ctrl + Z rend la page d\'avant', page(), start);
        if (!log.margins) problems.push('Ctrl + Z ne prévient pas l\'enregistrement automatique');
        log.reset();
        redo();
        await h.sleep(250);
        check(problems, 'Ctrl + Y rend l\'A5', page().format, 'A5');
        if (!log.margins) problems.push('Ctrl + Y ne prévient pas l\'enregistrement automatique');
        byId('v2-btn-undo').click();
        await h.sleep(250);
        check(problems, 'le bouton Annuler rend l\'A4', page(), start);
        byId('v2-btn-redo').click();
        await h.sleep(250);
        check(problems, 'le bouton Rétablir rend l\'A5', page().format, 'A5');
        check(problems, 'le résumé est toujours à l\'écran', summaryShown(), true);
        check(problems, 'la composition n\'a pas bougé', hiddenIn(row(macro.id), 0), []);
      } finally { log.stop(); await leave(h); }
      return verdict(problems, 'format');
    },
  });

  cases.push({
    id: 'undo_macro_page_undone_is_written_to_the_row_by_the_autosave',
    description: 'La page défaite d\'un macro-modèle est réécrite dans sa ligne (colonne Margins) par l\'enregistrement automatique, sans toucher à sa composition',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro ligne');
        const composition = row(macro.id).Contenu;
        OrientationToggle.selectFormat('A5');
        await h.sleep(3600);
        check(problems, 'la ligne dit A5', savedPage(macro.id).format, 'A5');
        undo();
        await h.sleep(3600);
        check(problems, 'la ligne dit A4 après Ctrl + Z', savedPage(macro.id).format, 'A4');
        check(problems, 'la composition de la ligne n\'a pas bougé', row(macro.id).Contenu, composition);
      } finally { await leave(h); }
      return verdict(problems, 'autosave');
    },
  });

  cases.push({
    id: 'undo_macro_eye_comes_back_with_ctrl_z_and_goes_again_with_ctrl_y',
    description: 'L\'œil refermé d\'un modèle du résumé se rouvre avec Ctrl + Z (résumé, cache des modèles, ligne de Grist, coin d\'état), se referme avec Ctrl + Y ; le bouton Annuler fait comme la touche',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro œil');
        const cover = String(macro.coverId);
        check(problems, 'œil ouvert au départ', pressed(0, macro.coverId), 'false');
        eyeOf(0, macro.coverId).click();
        await h.sleep(500);
        check(problems, 'œil fermé', pressed(0, macro.coverId), 'true');
        check(problems, 'ligne : masqué', hiddenIn(row(macro.id), 0), [cover]);
        undo();
        await h.sleep(500);
        check(problems, 'Ctrl + Z : œil rouvert', pressed(0, macro.coverId), 'false');
        check(problems, 'Ctrl + Z : ligne', hiddenIn(row(macro.id), 0), []);
        check(problems, 'Ctrl + Z : cache', (Templates.byId(macro.id).macroSlots.slots[0].hiddenModeleIds || []).length, 0);
        if (!/de nouveau dans la Lecture/.test(statusNow()) && !/back in Read mode/.test(statusNow())) problems.push('Ctrl + Z : coin d\'état : ' + statusNow());
        redo();
        await h.sleep(500);
        check(problems, 'Ctrl + Y : œil refermé', pressed(0, macro.coverId), 'true');
        check(problems, 'Ctrl + Y : ligne', hiddenIn(row(macro.id), 0), [cover]);
        if (!/masqué de la Lecture/.test(statusNow()) && !/hidden from Read mode/.test(statusNow())) problems.push('Ctrl + Y : coin d\'état : ' + statusNow());
        byId('v2-btn-undo').click();
        await h.sleep(500);
        check(problems, 'le bouton Annuler rouvre l\'œil', [pressed(0, macro.coverId), hiddenIn(row(macro.id), 0)], ['false', []]);
        byId('v2-btn-redo').click();
        await h.sleep(500);
        check(problems, 'le bouton Rétablir referme l\'œil', [pressed(0, macro.coverId), hiddenIn(row(macro.id), 0)], ['true', [cover]]);
      } finally { await leave(h); }
      return verdict(problems, 'œil');
    },
  });

  cases.push({
    id: 'undo_macro_the_same_model_in_two_positions_has_one_eye_per_position',
    description: 'Le même modèle dans deux positions du résumé (la garde et la règle b de l\'annexe) : fermer l\'œil de l\'une, puis défaire, ne touche pas à l\'autre',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro deux positions');
        const cover = String(macro.coverId);
        eyeOf(1, macro.coverId).click();
        await h.sleep(500);
        check(problems, 'seule l\'annexe masque la garde', [hiddenIn(row(macro.id), 0), hiddenIn(row(macro.id), 1)], [[], [cover]]);
        eyeOf(0, macro.coverId).click();
        await h.sleep(500);
        check(problems, 'les deux positions la masquent', [hiddenIn(row(macro.id), 0), hiddenIn(row(macro.id), 1)], [[cover], [cover]]);
        undo();
        await h.sleep(500);
        check(problems, 'un Ctrl + Z rouvre la page de garde seule', [hiddenIn(row(macro.id), 0), hiddenIn(row(macro.id), 1)], [[], [cover]]);
        undo();
        await h.sleep(500);
        check(problems, 'un second rouvre l\'annexe', [hiddenIn(row(macro.id), 0), hiddenIn(row(macro.id), 1)], [[], []]);
      } finally { await leave(h); }
      return verdict(problems, 'positions');
    },
  });

  cases.push({
    id: 'undo_macro_order_of_gestures_page_and_eyes',
    description: 'L\'ordre est celui des gestes : un œil, le format, un autre œil ; trois Ctrl + Z défont dans l\'ordre le second œil, le format, le premier œil ; trois Ctrl + Y les rendent',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro ordre');
        const cover = String(macro.coverId), other = String(macro.otherId);
        const state = () => ({ format: page().format, cover: hiddenIn(row(macro.id), 0), annex: hiddenIn(row(macro.id), 1) });
        eyeOf(0, macro.coverId).click();
        await h.sleep(500);
        OrientationToggle.selectFormat('A5');
        await h.sleep(200);
        eyeOf(1, macro.otherId).click();
        await h.sleep(500);
        check(problems, 'départ des trois gestes', state(), { format: 'A5', cover: [cover], annex: [other] });
        undo();
        await h.sleep(500);
        check(problems, '1er Ctrl + Z : le second œil', state(), { format: 'A5', cover: [cover], annex: [] });
        undo();
        await h.sleep(500);
        check(problems, '2e Ctrl + Z : le format', state(), { format: 'A4', cover: [cover], annex: [] });
        undo();
        await h.sleep(500);
        check(problems, '3e Ctrl + Z : le premier œil', state(), { format: 'A4', cover: [], annex: [] });
        redo(); redo(); redo();
        await h.sleep(900);
        check(problems, 'trois Ctrl + Y', state(), { format: 'A5', cover: [cover], annex: [other] });
      } finally { await leave(h); }
      return verdict(problems, 'ordre');
    },
  });

  cases.push({
    id: 'undo_macro_a_burst_of_clicks_and_undos_ends_on_the_wanted_state_with_a_slow_grist',
    description: 'Grist lent : un œil fermé puis aussitôt défait, rétabli, défait, finit sur l\'état voulu (œil ouvert, ligne sans masque) sans qu\'une écriture ancienne ne passe devant',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro rafale');
        window.__gristStub.setLatency({ applyUserActions: 400 });
        eyeOf(0, macro.coverId).click();
        undo(); redo(); undo();
        check(problems, 'à l\'écran tout de suite : œil ouvert', pressed(0, macro.coverId), 'false');
        await h.sleep(3500);
        window.__gristStub.setLatency({ fetchTable: 0, applyUserActions: 0 });
        await h.sleep(300);
        check(problems, 'ligne : rien de masqué', hiddenIn(row(macro.id), 0), []);
        check(problems, 'œil ouvert à la fin', pressed(0, macro.coverId), 'false');
        check(problems, 'cache : rien de masqué', (Templates.byId(macro.id).macroSlots.slots[0].hiddenModeleIds || []).length, 0);
        check(problems, 'aucune erreur au coin d\'état', byId('status-msg').className === 'error-msg', false);
      } finally { await leave(h); }
      return verdict(problems, 'rafale');
    },
  });

  cases.push({
    id: 'undo_macro_composition_saved_by_the_window_is_one_step_and_the_name_is_not_part_of_it',
    description: 'La composition enregistrée par la fenêtre de composition (nouvelle page de garde, une annexe de plus) se défait d\'un seul Ctrl + Z (résumé, cache, ligne), se refait d\'un Ctrl + Y ; le nom, changé dans la même fenêtre, reste celui qu\'on a donné',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro fenêtre');
        const before = slotsOf(row(macro.id));
        const sentenceBefore = byId('macro-summary-text').textContent;
        MacroEditor.openModal(Templates.byId(macro.id));
        byId('macro-editor-name').value = 'Macro fenêtre 2';
        const select = byId('macro-editor-cover');
        select.value = String(macro.otherId);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        byId('macro-editor-add-slot').click();
        byId('macro-editor-save').click();
        await h.sleep(1200);
        const after = slotsOf(row(macro.id));
        check(problems, 'la page de garde est l\'autre modèle', String(after[0].modeleId), String(macro.otherId));
        check(problems, 'une annexe de plus', after.length, before.length + 1);
        const sentenceAfter = byId('macro-summary-text').textContent;
        undo();
        await h.sleep(900);
        check(problems, 'Ctrl + Z : la ligne a la composition d\'avant', slotsOf(row(macro.id)), before);
        check(problems, 'Ctrl + Z : le cache aussi', Templates.byId(macro.id).macroSlots.slots, before);
        check(problems, 'Ctrl + Z : le résumé la dit', byId('macro-summary-text').textContent, sentenceBefore);
        check(problems, 'Ctrl + Z : le nom reste', row(macro.id).Nom, 'Macro fenêtre 2');
        redo();
        await h.sleep(900);
        check(problems, 'Ctrl + Y : la ligne a la composition d\'après', slotsOf(row(macro.id)), after);
        check(problems, 'Ctrl + Y : le résumé la dit', byId('macro-summary-text').textContent, sentenceAfter);
        check(problems, 'Ctrl + Y : le nom reste', row(macro.id).Nom, 'Macro fenêtre 2');
      } finally { await leave(h); }
      return verdict(problems, 'fenêtre');
    },
  });

  cases.push({
    id: 'undo_macro_window_save_keeps_the_history_before_it',
    description: 'La fenêtre de composition enregistrée recharge le macro-modèle sans vider son historique : un œil fermé et un format choisi avant elle se défont après la composition, dans l\'ordre, et se refont de même',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro historique');
        const cover = String(macro.coverId);
        eyeOf(0, macro.coverId).click();
        await h.sleep(500);
        OrientationToggle.selectFormat('A5');
        await h.sleep(200);
        const count = slotsOf(row(macro.id)).length;
        const state = () => ({ eye: pressed(0, macro.coverId), format: page().format, annexes: slotsOf(row(macro.id)).length, hidden: hiddenIn(row(macro.id), 0) });
        MacroEditor.openModal(Templates.byId(macro.id));
        byId('macro-editor-add-slot').click();
        byId('macro-editor-save').click();
        await h.sleep(1300);
        check(problems, 'départ : œil fermé, A5, une annexe de plus', state(), { eye: 'true', format: 'A5', annexes: count + 1, hidden: [cover] });
        undo();
        await h.sleep(900);
        check(problems, '1er Ctrl + Z : la composition d\'avant', state(), { eye: 'true', format: 'A5', annexes: count, hidden: [cover] });
        undo();
        await h.sleep(500);
        check(problems, '2e Ctrl + Z : le format d\'avant la fenêtre', state(), { eye: 'true', format: 'A4', annexes: count, hidden: [cover] });
        undo();
        await h.sleep(600);
        check(problems, '3e Ctrl + Z : l\'œil d\'avant la fenêtre', state(), { eye: 'false', format: 'A4', annexes: count, hidden: [] });
        redo(); redo(); redo();
        await h.sleep(1500);
        check(problems, 'trois Ctrl + Y', state(), { eye: 'true', format: 'A5', annexes: count + 1, hidden: [cover] });
      } finally { await leave(h); }
      return verdict(problems, 'fenêtre et historique');
    },
  });

  cases.push({
    id: 'undo_macro_window_save_that_only_renames_adds_no_step',
    description: 'La fenêtre de composition enregistrée avec un autre nom et rien d\'autre ne laisse aucun pas dans l\'historique : Ctrl + Z ne touche ni au nom ni à la composition',
    async run(h) {
      const problems = [];
      try {
        const macro = await composedMacro(h, 'Macro nom seul');
        MacroEditor.openModal(Templates.byId(macro.id));
        byId('macro-editor-name').value = 'Macro nom seul 2';
        byId('macro-editor-save').click();
        await h.sleep(1200);
        // La fenêtre réécrit les identifiants en texte (Grist les rendait en nombre) : la composition de la ligne, après l'enregistrement, est celle que Ctrl + Z doit laisser.
        const composition = row(macro.id).Contenu;
        check(problems, 'le nom est enregistré', row(macro.id).Nom, 'Macro nom seul 2');
        check(problems, 'aucun pas à défaire', EditorCore.getEditor().can().undo(), false);
        undo();
        await h.sleep(500);
        check(problems, 'Ctrl + Z ne rend pas l\'ancien nom', row(macro.id).Nom, 'Macro nom seul 2');
        check(problems, 'Ctrl + Z ne touche pas à la composition', row(macro.id).Contenu, composition);
      } finally { await leave(h); }
      return verdict(problems, 'nom seul');
    },
  });

  cases.push({
    id: 'undo_macro_never_reaches_another_macro_or_a_document',
    description: 'Un autre macro-modèle (ou un document) ne reçoit jamais le geste de l\'ancien : un œil fermé dans le premier, le second ouvert, Ctrl + Z ne touche à aucun des deux',
    async run(h) {
      const problems = [];
      try {
        const first = await composedMacro(h, 'Macro premier');
        const firstCover = String(first.coverId);
        eyeOf(0, first.coverId).click();
        await h.sleep(500);
        const second = await composedMacro(h, 'Macro second');
        check(problems, 'le second est ouvert', Templates.getCurrentId(), second.id);
        undo();
        await h.sleep(500);
        check(problems, 'le premier garde son œil fermé', hiddenIn(row(first.id), 0), [firstCover]);
        check(problems, 'le second n\'a rien de masqué', hiddenIn(row(second.id), 0), []);
        await reopen(h, first.id);
        check(problems, 'rouvert, le premier a toujours son œil fermé', pressed(0, first.coverId), 'true');
        undo();
        await h.sleep(500);
        check(problems, 'sans geste depuis l\'ouverture, Ctrl + Z ne change rien', hiddenIn(row(first.id), 0), [firstCover]);
      } finally { await leave(h); }
      return verdict(problems, 'autres modèles');
    },
  });

  return cases;
})();
