// Suite "varFormat" - barre flottante de formatage nombre/date d'une bulle #Variable (js/floating-toolbars.js:wireVariableFloatingToolbar). Couvre
// spécifiquement le bug réel trouvé en séance (2026-09-14, cf. dev-tests/BUGS.md Bug 5) : le panneau se refermait à l'instant où on interagissait avec
// un de ses propres <select>/<input> (nb décimales, format de date, devise) - cliquer dessus déplace le focus DOM hors de l'éditeur, ce que check()
// interprétait à tort comme "l'utilisateur a cliqué ailleurs, fermer le panneau". Un premier correctif (tolérer `panel.el.contains(document.activeElement)`)
// s'est révélé INSUFFISANT : mesuré que le <select> ne reçoit pas toujours le focus DOM de façon synchrone/fiable au moment du clic, rendant
// document.activeElement invérifiable pour ce cas précis - d'où le correctif définitif (suppression de la garde hasFocus() dans check(), la fermeture
// "clic dehors" restant déjà assurée par ailleurs, cf. hideFloatingContextToolbars). Reproduit ici sans dépendre du focus réel du <select> (non fiable en
// automatisation, constaté) : un blur() EXPLICITE de l'éditeur suffit à reproduire la condition qui faisait échouer check() avant correctif - le panneau
// doit survivre à cet état tant que la bulle reste sélectionnée.
(function () {
  const cases = [];

  async function selectFirstVarBadge(h) {
    const ed = EditorCore.getEditor();
    // .focus() DOM direct (comme focusAtEnd, dev-tests/helpers.js) - ed.commands.focus() s'est révélé peu fiable dans ce contexte d'exécution scripté
    // (hasFocus() restait faux malgré l'appel), contrairement au vrai .focus() sur l'élément .tiptap lui-même.
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
    if (pos === -1) return null;
    ed.commands.setNodeSelection(pos);
    await h.sleep(120);
    return ed;
  }

  cases.push({
    id: 'varfmt_number_decimals_select_keeps_panel_open',
    description: 'Choisir un nombre de décimales dans la barre flottante nombre/date ne referme plus le panneau (Bug 5)',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('VarFmtTestTable', { Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Montant : <span class="var-badge" data-table="VarFmtTestTable" data-column="Montant" data-key="Montant"></span></p>');
      const ed = await selectFirstVarBadge(h);
      if (!ed) return { pass: false, notes: 'bulle #Variable introuvable après setHTML' };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      if (!panel.classList.contains('visible')) return { pass: false, notes: 'panneau non affiché après sélection de la bulle' };
      // Reproduit la condition réelle (focus DOM quitte l'éditeur) sans dépendre du focus effectif du <select> lui-même, non fiable en automatisation.
      ed.view.dom.blur();
      await h.sleep(50);
      const sel = document.querySelector('select[data-role="num-decimals"]');
      sel.value = '2';
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(50);
      let node = null;
      ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') node = n; });
      const pass = panel.classList.contains('visible') && !!node && node.attrs.format && node.attrs.format.decimals === 2;
      return { pass, notes: JSON.stringify({ panelVisible: panel.classList.contains('visible'), format: node && node.attrs.format }) };
    },
  });

  cases.push({
    id: 'varfmt_date_preset_select_keeps_panel_open',
    description: 'Choisir un format de date dans la barre flottante nombre/date ne referme plus le panneau (Bug 5)',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('VarFmtTestTable', { Naissance: 'Date' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Date : <span class="var-badge" data-table="VarFmtTestTable" data-column="Naissance" data-key="Naissance"></span></p>');
      const ed = await selectFirstVarBadge(h);
      if (!ed) return { pass: false, notes: 'bulle #Variable introuvable après setHTML' };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      if (!panel.classList.contains('visible')) return { pass: false, notes: 'panneau non affiché après sélection de la bulle' };
      ed.view.dom.blur();
      await h.sleep(50);
      const sel = document.querySelector('select[data-role="date-preset"]');
      const targetValue = sel.options[1] ? sel.options[1].value : sel.options[0].value;
      sel.value = targetValue;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(50);
      let node = null;
      ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') node = n; });
      const pass = panel.classList.contains('visible') && !!node && node.attrs.format && node.attrs.format.preset === targetValue;
      return { pass, notes: JSON.stringify({ panelVisible: panel.classList.contains('visible'), format: node && node.attrs.format, targetValue }) };
    },
  });

  cases.push({
    id: 'varfmt_currency_input_keeps_panel_open',
    description: 'Taper une devise dans la barre flottante nombre/date ne referme plus le panneau (Bug 5, même piège pour un <input> que pour un <select>)',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('VarFmtTestTable', { Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Montant : <span class="var-badge" data-table="VarFmtTestTable" data-column="Montant" data-key="Montant"></span></p>');
      const ed = await selectFirstVarBadge(h);
      if (!ed) return { pass: false, notes: 'bulle #Variable introuvable après setHTML' };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      ed.view.dom.blur();
      await h.sleep(50);
      const input = document.querySelector('input[data-role="num-currency"]');
      input.value = '€';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await h.sleep(50);
      let node = null;
      ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') node = n; });
      const pass = panel.classList.contains('visible') && !!node && node.attrs.format && node.attrs.format.currency === '€';
      return { pass, notes: JSON.stringify({ panelVisible: panel.classList.contains('visible'), format: node && node.attrs.format }) };
    },
  });

  cases.push({
    id: 'varfmt_panel_still_hides_on_real_outside_click',
    description: 'Un vrai clic hors de l\'éditeur ET hors du panneau referme quand même la barre flottante (garde-fou : ne pas sur-corriger le Bug 5)',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('VarFmtTestTable', { Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Montant : <span class="var-badge" data-table="VarFmtTestTable" data-column="Montant" data-key="Montant"></span></p>');
      const ed = await selectFirstVarBadge(h);
      if (!ed) return { pass: false, notes: 'bulle #Variable introuvable après setHTML' };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      if (!panel.classList.contains('visible')) return { pass: false, notes: 'panneau non affiché après sélection de la bulle' };
      // Un vrai clic ailleurs dans la page (ex. le titre du modèle), hors .tiptap ET hors .v2-floating-toolbar - doit déclencher hideFloatingContextToolbars.
      const outside = document.getElementById('template-name') || document.body;
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(50);
      return { pass: !panel.classList.contains('visible'), notes: 'panelVisible=' + panel.classList.contains('visible') };
    },
  });

  // Choix « Corriger » d'Antoine (2026-10-01) : une bulle restée sélectionnée quand on passe en Lecture gardait sa barre flottante, posée en haut à gauche (8, 8) par floating-ui
  // sur un éditeur sans boîte, par-dessus la barre du haut. Le changement de mode ferme les barres contextuelles (main.js:syncEditorVisibilityForMode), et une transaction qui
  // arrive pendant la Lecture - le blur de l'éditeur à un vrai clic sur « Lecture », qui rouvrait la barre juste après sa fermeture - ne la rouvre plus (check() ne montre rien
  // pour une bulle sans boîte). Un vrai clic et la touche Entrée sont rejoués dans verify-var-toolbar-mouse.mjs ; ici le changement de mode lui-même.
  cases.push({
    id: 'varfmt_panel_closes_in_reader_mode_and_stays_closed',
    description: 'Passer en Lecture ferme la barre flottante d\'une bulle restée sélectionnée, une transaction qui arrive pendant la Lecture ne la rouvre pas, et de retour en Édition la barre revient dès qu\'une transaction concerne la bulle',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables('VarFmtTestTable', { Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>Montant : <span class="var-badge" data-table="VarFmtTestTable" data-column="Montant" data-key="Montant"></span></p>');
      const ed = await selectFirstVarBadge(h);
      if (!ed) return { pass: false, notes: 'bulle #Variable introuvable après setHTML' };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      const openBefore = panel.classList.contains('visible');
      const seen = { openBefore };
      try {
        document.getElementById('btn-mode-read').click();
        await h.sleep(300);
        seen.editorHiddenInReader = getComputedStyle(document.getElementById('editor-container')).display === 'none';
        seen.openInReader = panel.classList.contains('visible');
        // Une transaction qui arrive pendant la Lecture, la bulle étant toujours la sélection de l'éditeur masqué.
        ed.view.dispatch(ed.state.tr);
        await h.sleep(300);
        seen.openAfterTransactionInReader = panel.classList.contains('visible');
        document.getElementById('btn-mode-edit').click();
        await h.sleep(300);
        seen.openBackInEdit = panel.classList.contains('visible');
        ed.view.dispatch(ed.state.tr);
        await h.sleep(300);
        seen.openAfterTransactionInEdit = panel.classList.contains('visible');
      } finally {
        document.getElementById('btn-mode-edit').click();
        await h.sleep(200);
      }
      const pass = openBefore && seen.editorHiddenInReader && !seen.openInReader && !seen.openAfterTransactionInReader && seen.openAfterTransactionInEdit;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varFormat = cases;
})();
