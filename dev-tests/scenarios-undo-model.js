// Suite "undoModel" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi ce que le modèle garde HORS du texte et HORS de la page (suite de scenarios-undo-page.js : demande du 22/10, « Il doit prendre en
// compte 100% des actions faites dans le widget »). Ici : 1) l'en-tête et le pied de page. L'éditeur n'a qu'un historique ; en changeant de texte (le corps, l'en-tête, le pied) js/header-footer-preview.js met de côté celui qu'on
// quitte, si bien qu'après « Terminer » Ctrl + Z défaisait le dernier mot du CORPS et laissait l'en-tête tel quel. La séance d'écriture entière - de la première zone ouverte à « Terminer » - laisse maintenant UN repère dans
// l'historique du corps (js/history-markers.js, domaine « headerFooter ») : le texte des zones, les cases de leur pastille et un geste de la page fait pendant la séance.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z après « Terminer » rend l'état d'avant la séance (le texte des zones, « Première page différente », le brouillon que l'enregistrement automatique écrit),
// UN Ctrl + Y la rend ; l'ordre est celui des gestes, texte du corps et séances mêlés ; une séance qui ne laisse rien de net n'ajoute rien ; pendant la séance Ctrl + Z reste celui de la zone ; un autre modèle ne reçoit jamais
// l'en-tête de l'ancien. Le même parcours à la vraie souris dans le panneau de 700x400 : verify-undo-model-mouse.mjs (undoModelMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoModel = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function press(key, shiftKey) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  // Du texte tapé à la fin du texte que l'éditeur contient (le corps, ou la zone ouverte) : un événement de l'historique, clos aussitôt pour que la frappe suivante n'y soit pas rangée.
  function type(text) {
    const state = ed().state;
    const tr = state.tr.insertText(text, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  }
  const text = () => ed().getText();
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // L'en-tête et le pied tels que le modèle les garde (le brouillon que l'enregistrement écrit), jamais le DOM.
  const hf = () => JSON.parse(JSON.stringify(Editor.getHeaderFooterData()));
  const zones = () => { const d = hf(); return { header: d.header.default, first: d.header.first, footer: d.footer.default, footerFirst: d.footer.first, enabled: d.enabled, different: d.differentFirstPage }; };
  const textOf = html => String(html || '').replace(/<[^>]*>/g, '');
  const brief = () => { const z = zones(); return { header: textOf(z.header), first: textOf(z.first), footer: textOf(z.footer), footerFirst: textOf(z.footerFirst), enabled: z.enabled, different: z.different }; };
  const EMPTY = { header: '', first: '', footer: '', footerFirst: '', enabled: false, different: false };
  const enter = (zone, variant) => HeaderFooterPreview.enterHeaderFooterMode(zone, variant || 'default');
  const done = () => Editor.exitHeaderFooterModeIfActive();
  const canUndo = () => ed().can().undo();

  // Un modèle neuf en Aperçu A4, du type Document, `html` dans l'éditeur, sans en-tête ni pied.
  async function fresh(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHTML(html || '<p></p>');
    Editor.setHeaderFooterData(null);
    OrientationToggle.sync('document');
    await h.sleep(250);
  }
  async function leave(h) {
    done();
    PageLayout.setMarginsMm(null);
    Editor.setHeaderFooterData(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.resetEditor();
  }

  // --- 1) L'en-tête et le pied de page ---

  cases.push({
    id: 'undo_header_footer_session_is_one_step_after_done_and_ctrl_y_gives_it_back',
    description: 'Un en-tête écrit puis « Terminer » : UN Ctrl + Z remet l\'en-tête à vide (et « activé » à faux) sans toucher au texte du corps, UN Ctrl + Y rend l\'en-tête ; le mode d\'écriture de la zone ne se rouvre pas',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Texte du corps.</p>');
        enter('header');
        await h.sleep(100);
        type('Entête de test');
        done();
        await h.sleep(150);
        const written = brief();
        check(problems, 'l\'en-tête écrit', { header: written.header, enabled: written.enabled }, { header: 'Entête de test', enabled: true });
        if (!canUndo()) problems.push('Annuler est grisé après « Terminer » alors qu\'une séance vient d\'avoir lieu');
        undo();
        await h.sleep(200);
        check(problems, 'Ctrl + Z après « Terminer »', brief(), EMPTY);
        if (!/Texte du corps/.test(text())) problems.push('le texte du corps a été défait avec l\'en-tête : ' + text());
        if (Editor.isEditingHeaderFooter()) problems.push('Ctrl + Z a rouvert la zone d\'écriture');
        redo();
        await h.sleep(200);
        check(problems, 'Ctrl + Y', { header: brief().header, enabled: brief().enabled }, { header: 'Entête de test', enabled: true });
        if (Editor.isEditingHeaderFooter()) problems.push('Ctrl + Y a rouvert la zone d\'écriture');
        return verdict(problems, { written });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_steps_come_back_in_the_order_of_the_gestures_with_the_body_text',
    description: 'Du texte dans le corps, un en-tête, du texte dans le corps : trois Ctrl + Z défont dans l\'ordre inverse le second texte, l\'en-tête, le premier texte ; trois Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Corps</p>');
        type(' Alpha');
        enter('header');
        type('Tête');
        done();
        type(' Beta');
        await h.sleep(150);
        undo(); await h.sleep(150);
        check(problems, '1er Ctrl + Z : « Beta » défait, l\'en-tête reste', { alpha: /Alpha/.test(text()), beta: /Beta/.test(text()), header: brief().header }, { alpha: true, beta: false, header: 'Tête' });
        undo(); await h.sleep(150);
        check(problems, '2e Ctrl + Z : l\'en-tête défait, « Alpha » reste', { alpha: /Alpha/.test(text()), beta: /Beta/.test(text()), header: brief().header }, { alpha: true, beta: false, header: '' });
        undo(); await h.sleep(150);
        check(problems, '3e Ctrl + Z : « Alpha » défait', { alpha: /Alpha/.test(text()), header: brief().header }, { alpha: false, header: '' });
        redo(); await h.sleep(150);
        redo(); await h.sleep(150);
        check(problems, 'deux Ctrl + Y : « Alpha » puis l\'en-tête', { alpha: /Alpha/.test(text()), beta: /Beta/.test(text()), header: brief().header }, { alpha: true, beta: false, header: 'Tête' });
        redo(); await h.sleep(150);
        check(problems, '3e Ctrl + Y : « Beta »', { beta: /Beta/.test(text()), header: brief().header }, { beta: true, header: 'Tête' });
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_two_sessions_are_two_steps_the_footer_goes_first',
    description: 'Un en-tête puis, dans une autre séance, un pied : le premier Ctrl + Z défait le pied et laisse l\'en-tête, le second défait l\'en-tête ; Ctrl + Y les rend dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Corps</p>');
        enter('header'); type('Tête'); done();
        enter('footer'); type('Pied'); done();
        await h.sleep(150);
        check(problems, 'les deux zones écrites', { header: brief().header, footer: brief().footer }, { header: 'Tête', footer: 'Pied' });
        undo(); await h.sleep(150);
        check(problems, '1er Ctrl + Z', { header: brief().header, footer: brief().footer }, { header: 'Tête', footer: '' });
        undo(); await h.sleep(150);
        check(problems, '2e Ctrl + Z', brief(), EMPTY);
        redo(); await h.sleep(150);
        check(problems, '1er Ctrl + Y', { header: brief().header, footer: brief().footer }, { header: 'Tête', footer: '' });
        redo(); await h.sleep(150);
        check(problems, '2e Ctrl + Y', { header: brief().header, footer: brief().footer }, { header: 'Tête', footer: 'Pied' });
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_one_session_over_both_zones_and_the_first_page_box_is_one_step',
    description: 'Une séance qui passe de l\'en-tête à sa variante « première page » (case cochée) puis au pied, un texte dans chacun : UN Ctrl + Z remet les trois zones à vide ET décoche « Première page différente » ; UN Ctrl + Y rend le tout',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Corps</p>');
        enter('header'); type('Tête');
        const box = byId('v2-hf-different-first');
        if (!box) problems.push('la case « Première page différente » n\'est pas dans la pastille');
        else { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
        enter('header', 'first'); type('Première');
        enter('footer', 'default'); type('Pied');
        done();
        await h.sleep(150);
        check(problems, 'la séance écrite', brief(), { header: 'Tête', first: 'Première', footer: 'Pied', footerFirst: '', enabled: true, different: true });
        undo(); await h.sleep(200);
        check(problems, 'UN Ctrl + Z', brief(), EMPTY);
        redo(); await h.sleep(200);
        check(problems, 'UN Ctrl + Y', brief(), { header: 'Tête', first: 'Première', footer: 'Pied', footerFirst: '', enabled: true, different: true });
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_a_session_with_nothing_left_adds_no_step',
    description: 'Entrer dans une zone puis « Terminer » sans rien écrire, ou écrire puis défaire dans la zone : aucun pas de plus dans l\'historique du corps (Annuler reste grisé) ; pendant la séance Ctrl + Z défait la frappe de la zone et laisse le corps',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Corps</p>');
        if (canUndo()) problems.push('Annuler est actif sur un modèle qui vient de s\'ouvrir');
        enter('header');
        done();
        await h.sleep(100);
        if (canUndo()) problems.push('une zone ouverte et refermée à vide a laissé un pas');
        check(problems, 'le brouillon après une zone ouverte et refermée à vide', brief(), EMPTY);
        enter('header');
        type('Brouillon');
        if (!/Brouillon/.test(text())) problems.push('la frappe n\'est pas dans la zone : ' + text());
        undo();
        await h.sleep(150);
        if (/Brouillon/.test(text())) problems.push('Ctrl + Z dans la zone n\'a pas défait la frappe de la zone');
        if (!Editor.isEditingHeaderFooter()) problems.push('Ctrl + Z dans la zone l\'a refermée');
        done();
        await h.sleep(100);
        if (canUndo()) problems.push('une frappe écrite puis défaite dans la zone a laissé un pas');
        type(' Gamma');
        enter('footer'); type('Pied'); done();
        undo(); await h.sleep(150);
        check(problems, 'Ctrl + Z défait le pied et laisse « Gamma »', { gamma: /Gamma/.test(text()), footer: brief().footer }, { gamma: true, footer: '' });
        undo(); await h.sleep(150);
        check(problems, 'le second Ctrl + Z défait « Gamma » (rien d\'autre ne s\'est glissé entre les deux)', { gamma: /Gamma/.test(text()) }, { gamma: false });
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_a_page_gesture_made_during_the_session_goes_with_the_session',
    description: 'Le format A5 posé PENDANT qu\'on écrit l\'en-tête (le repère va dans l\'historique de la zone, introuvable depuis le corps) : après « Terminer », UN Ctrl + Z rend l\'A4 et l\'en-tête à vide, UN Ctrl + Y rend l\'A5 et l\'en-tête',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, lines(2, 'Texte'));
        const start = PageLayout.getFormat();
        enter('header');
        type('Tête');
        OrientationToggle.selectFormat('A5');
        await h.sleep(150);
        done();
        await h.sleep(150);
        check(problems, 'séance écrite', { format: PageLayout.getFormat(), header: brief().header }, { format: 'A5', header: 'Tête' });
        undo(); await h.sleep(250);
        check(problems, 'UN Ctrl + Z', { format: PageLayout.getFormat(), header: brief().header }, { format: start, header: '' });
        redo(); await h.sleep(250);
        check(problems, 'UN Ctrl + Y', { format: PageLayout.getFormat(), header: brief().header }, { format: 'A5', header: 'Tête' });
        return verdict(problems, { start });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_with_track_changes_on_is_not_a_suggestion',
    description: 'Le suivi des modifications allumé, un en-tête écrit puis défait et rétabli : le corps ne reçoit ni insertion ni suppression suivie, le texte du corps est intact',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Corps suivi.</p>');
        Editor.setTrackChanges(true);
        await h.sleep(150);
        enter('header');
        type('Tête');
        done();
        await h.sleep(150);
        undo(); await h.sleep(200);
        redo(); await h.sleep(200);
        undo(); await h.sleep(200);
        const html = Editor.getHTML();
        if (/<ins|<del|data-suggestion|suggestion-/.test(html)) problems.push('une suggestion a été posée dans le corps : ' + html.slice(0, 300));
        check(problems, 'le texte du corps', text().trim(), 'Corps suivi.');
        check(problems, 'l\'en-tête après le dernier Ctrl + Z', brief().header, '');
        return verdict(problems, {});
      } finally { Editor.setTrackChanges(false); await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_does_not_cross_a_model_change',
    description: 'Un en-tête écrit dans un modèle, un autre modèle ouvert : Ctrl + Z ne rend jamais l\'en-tête du premier au second',
    async run(h) {
      const problems = [];
      try {
        await fresh(h, '<p>Modèle A</p>');
        enter('header'); type('En-tête de A'); done();
        await h.sleep(100);
        Editor.setHTML('<p>Modèle B</p>');
        Editor.setHeaderFooterData(null);
        await h.sleep(250);
        undo(); await h.sleep(200);
        redo(); await h.sleep(200);
        check(problems, 'l\'en-tête du modèle B', brief(), EMPTY);
        check(problems, 'le texte du modèle B', text().trim(), 'Modèle B');
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_header_footer_is_written_by_the_autosave_with_the_template',
    description: 'Un modèle enregistré, son en-tête écrit puis défait par Ctrl + Z : l\'enregistrement automatique écrit l\'en-tête DÉFAIT dans la colonne HeaderFooter (sans lui, le modèle gardait l\'en-tête que la personne venait d\'annuler)',
    async run(h) {
      const problems = [];
      let id = null;
      try {
        await h.clickButton('btn-new');
        await h.sleep(300);
        await fresh(h, lines(4, 'Texte'));
        byId('template-name').value = 'Annuler l\'en-tête';
        await h.clickButton('btn-save');
        await h.sleep(500);
        id = Templates.getCurrentId();
        enter('header'); type('Tête enregistrée'); done();
        await h.sleep(2500 + 900);
        const written = JSON.parse(stub().getRow(TABLE, id).HeaderFooter || '{}');
        if (!written.header || !/Tête enregistrée/.test(written.header.default || '')) problems.push('l\'enregistrement automatique n\'a pas écrit l\'en-tête : ' + JSON.stringify(written));
        undo();
        await h.sleep(2500 + 900);
        const undone = JSON.parse(stub().getRow(TABLE, id).HeaderFooter || '{}');
        if (undone.header && undone.header.default) problems.push('après Ctrl + Z, la colonne HeaderFooter garde ' + JSON.stringify(undone.header.default));
        if (undone.enabled) problems.push('après Ctrl + Z, l\'en-tête reste « activé » dans la colonne HeaderFooter');
        return verdict(problems, { written: written.enabled, undone: undone.enabled });
      } finally { await h.clickButton('btn-new'); await leave(h); }
    },
  });

  return cases;
})();
