// Suite "trackChanges" - suivi des modifications façon Word/Google Docs, intégration réelle de js/track-changes.js dans js/editor.js/js/main.js/
// js/templates.js (planning/feature-track-changes.md). Le moteur lui-même (extensions ProseMirror, transformToSuggestionTransaction, bug de perf O(N²)
// mitigé par chunking...) a déjà 27 scénarios verts dans le prototype isolé (prototypes/test-suivi-modifications.mjs) - cette suite-ci vérifie seulement
// les POINTS D'INTÉGRATION dans l'app réelle : le vrai bouton de la barre, le vrai <ins>/<del> rendu à l'écran (pas seulement dans le HTML), le vrai
// aller-retour par la table Grist (SuiviModifications, même UpdateRecord que Contenu), et l'exclusion des macro-modèles. Une suppression/insertion de
// BLOC ENTIER (pas seulement de texte inline) n'est volontairement pas reproduite ici : ce cas (et le contournement `runGuardedLibCommand` du bug de la
// librairie sur le dernier nœud du document) est déjà couvert par le prototype, qui teste le moteur en isolation.
//
// Comme scenarios-comments.js, deux moitiés à vérifier à chaque scénario qui touche à la persistance : l'ANCRAGE (marques <ins>/<del>/<span data-type=
// "modification">) vit DANS le document (Editor.getHTML()), et l'AUTEUR/L'HORODATAGE vivent dans la colonne Grist SuiviModifications - un id present
// dans l'un mais pas l'autre serait exactement le genre d'incohérence que ces tests doivent attraper.
//
// Le mode suivi est un bouton GLOBAL (isSuggestChangesEnabled sur le plugin ProseMirror), jamais remis à zéro par TestHelpers.resetEditor() ni par un
// changement de modèle (Editor.setHTML -> loadTrackedDocument ne touche jamais l'état du plugin) - chaque scénario qui l'active le désactive donc
// explicitement à la fin (disableTrackChangesIfOn), pour ne jamais laisser le mode suivi fuiter sur le scénario suivant.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;

  const toggleBtn = () => document.getElementById('v2-btn-track-changes');
  const acceptBtn = () => document.getElementById('v2-btn-accept-all');
  const rejectBtn = () => document.getElementById('v2-btn-reject-all');

  async function enableTrackChanges(h) {
    if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
  }
  async function disableTrackChangesIfOn(h) {
    if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
  }

  // Sélectionne exactement la sous-chaîne `text` (première occurrence) dans `container`, via le premier nœud texte qui la contient - sélectionner un
  // ÉLÉMENT entier (cf. TestHelpers.selectAllInElement) ne suffit pas ici : on veut marquer UNE portion précise, pas tout le paragraphe.
  function selectSubstring(container, text) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(text);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + text.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    return false;
  }

  // Construit un document avec UNE insertion (texte tapé en fin de paragraphe) ET UNE suppression (portion du texte existant) en attente, pour les
  // scénarios "tout accepter"/"tout refuser" qui doivent distinguer les deux traitements.
  async function markInsertionAndDeletion(h) {
    Editor.setHTML('<p>Garder ceci, retirer cela, fin.</p>');
    await h.focusAtEnd();
    await h.typeText(' Ajout suivi.');
    if (!selectSubstring(document.querySelector('.tiptap p'), 'retirer cela')) {
      throw new Error('texte à supprimer introuvable - scénario mal construit');
    }
    await h.sleep(30);
    document.execCommand('delete');
    await h.sleep(60);
  }

  cases.push({
    id: 'trackchanges_toggle_button_reflects_state_and_render',
    description: 'Le bouton "Suivi des modifications" bascule Editor.isTrackChangesOn() ET son propre rendu (classe .is-active + fond réellement changé), pas juste un état interne',
    run: async (h) => {
      await h.resetEditor();
      await disableTrackChangesIfOn(h);
      const bgOff = getComputedStyle(toggleBtn()).backgroundColor;
      await h.clickButton('v2-btn-track-changes');
      const onNow = Editor.isTrackChangesOn();
      const activeNow = toggleBtn().classList.contains('is-active');
      const bgOn = getComputedStyle(toggleBtn()).backgroundColor;
      await h.clickButton('v2-btn-track-changes');
      const offAgain = !Editor.isTrackChangesOn();
      const inactiveAgain = !toggleBtn().classList.contains('is-active');
      return {
        pass: onNow && activeNow && bgOn !== bgOff && offAgain && inactiveAgain,
        notes: 'on=' + onNow + ' active=' + activeNow + ' bgOff=' + bgOff + ' bgOn=' + bgOn + ' offAgain=' + offAgain + ' inactiveAgain=' + inactiveAgain,
      };
    },
  });

  cases.push({
    id: 'trackchanges_typing_marks_insertion_rendered',
    description: 'Suivi actif : taper du texte l\'entoure d\'une marque <ins> dans le HTML, réellement rendue (fond visible) dans l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Texte existant.</p>');
      await h.focusAtEnd();
      await h.typeText(' Ajout suivi.');
      const html = Editor.getHTML();
      const insEl = document.querySelector('.tiptap ins[data-id]');
      const hasIns = html.indexOf('<ins') !== -1 && html.indexOf('Ajout suivi.') !== -1;
      const rendered = !!insEl && getComputedStyle(insEl).backgroundColor !== 'rgba(0, 0, 0, 0)';
      const pending = Editor.hasPendingTrackedChanges();
      await disableTrackChangesIfOn(h);
      return {
        pass: hasIns && rendered && pending,
        notes: 'html contient <ins>=' + hasIns + ', fond visible=' + rendered + ', pending=' + pending,
      };
    },
  });

  cases.push({
    id: 'trackchanges_deleting_marks_deletion_rendered',
    description: 'Suivi actif : supprimer du texte le garde dans le document sous <del> (jamais retiré tout de suite), rendu réellement barré à l\'écran',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Phrase à supprimer entièrement.</p>');
      await h.selectAllInElement(document.querySelector('.tiptap p'));
      document.execCommand('delete');
      await h.sleep(60);
      const html = Editor.getHTML();
      const delEl = document.querySelector('.tiptap del[data-id]');
      const textStillThere = html.indexOf('supprimer entièrement') !== -1;
      const struck = !!delEl && getComputedStyle(delEl).textDecorationLine.indexOf('line-through') !== -1;
      const pending = Editor.hasPendingTrackedChanges();
      await disableTrackChangesIfOn(h);
      return {
        pass: textStillThere && struck && pending,
        notes: 'texte conservé=' + textStillThere + ', <del> rendu barré=' + struck + ', pending=' + pending,
      };
    },
  });

  cases.push({
    id: 'trackchanges_accept_reject_buttons_disabled_until_pending',
    description: '"Tout accepter"/"Tout refuser" restent visibles mais grisés (jamais masqués, règle d\'Antoine) sans suggestion en attente, et se réactivent dès qu\'une suggestion existe',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Rien à traiter.</p>');
      await h.sleep(60);
      const bothPresent = !!acceptBtn() && !!rejectBtn();
      const disabledClean = acceptBtn().disabled && rejectBtn().disabled;
      const opacityClean = getComputedStyle(acceptBtn()).opacity;
      await h.focusAtEnd();
      await h.typeText(' ajout.');
      const enabledAfter = !acceptBtn().disabled && !rejectBtn().disabled;
      const opacityAfter = getComputedStyle(acceptBtn()).opacity;
      await disableTrackChangesIfOn(h);
      return {
        pass: bothPresent && disabledClean && enabledAfter && Number(opacityClean) < Number(opacityAfter),
        notes: 'présents=' + bothPresent + ' disabledClean=' + disabledClean + ' opacityClean=' + opacityClean + ' enabledAfter=' + enabledAfter + ' opacityAfter=' + opacityAfter,
      };
    },
  });

  cases.push({
    id: 'trackchanges_accept_all_keeps_insertion_removes_deletion',
    description: '"Tout accepter" (bouton réel, commande découpée en tranches) garde le texte inséré et retire vraiment le texte supprimé, sans toucher au reste',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      await markInsertionAndDeletion(h);
      await h.clickButton('v2-btn-accept-all');
      await h.sleep(150);
      const html = Editor.getHTML();
      const noMarksLeft = !Editor.hasPendingTrackedChanges() && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
      const insertionKept = html.indexOf('Ajout suivi.') !== -1;
      const deletionGone = html.indexOf('retirer cela') === -1;
      const otherTextIntact = html.indexOf('Garder ceci') !== -1 && html.indexOf('fin.') !== -1;
      await disableTrackChangesIfOn(h);
      return {
        pass: noMarksLeft && insertionKept && deletionGone && otherTextIntact,
        notes: 'html final=' + html,
      };
    },
  });

  cases.push({
    id: 'trackchanges_reject_all_removes_insertion_restores_deletion',
    description: '"Tout refuser" retire le texte inséré et restaure le texte supprimé, sans marque restante',
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      await markInsertionAndDeletion(h);
      await h.clickButton('v2-btn-reject-all');
      await h.sleep(150);
      const html = Editor.getHTML();
      const noMarksLeft = !Editor.hasPendingTrackedChanges() && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
      const insertionGone = html.indexOf('Ajout suivi.') === -1;
      const deletionRestored = html.indexOf('retirer cela') !== -1;
      await disableTrackChangesIfOn(h);
      return {
        pass: noMarksLeft && insertionGone && deletionRestored,
        notes: 'html final=' + html,
      };
    },
  });

  cases.push({
    id: 'trackchanges_survives_save_and_reload',
    description: "Un Enregistrer réel écrit auteur/horodatage dans SuiviModifications (MÊME UpdateRecord que Contenu), et un rechargement par le vrai sélecteur redonne la marque en attente",
    run: async (h) => {
      await h.resetEditor();
      await enableTrackChanges(h);
      Editor.setHTML('<p>Modèle avec suivi.</p>');
      await h.focusAtEnd();
      await h.typeText(' Suggestion en attente.');
      document.getElementById('template-name').value = 'Suivi persistance';
      await h.clickButton('btn-save');
      await h.sleep(500);
      const id = Templates.getCurrentId();
      const row = stub().getRow(TABLE, id);
      let suivi = {};
      try { suivi = JSON.parse(row.SuiviModifications || '{}'); } catch (e) { /* laissé vide, jugé plus bas */ }
      const ids = Object.keys(suivi);
      // author=null : GristAPI.getCurrentUserEmail() échoue dans ce harnais (formule user.Email non évaluée par le stub, cf. dev-tests/grist-stub.js) -
      // Editor.getSuiviModificationsForSave() retombe alors sur l'auteur anonyme (null), même convention documentée dans js/editor.js.
      const entryOk = ids.length === 1 && suivi[ids[0]] && suivi[ids[0]].author === null && typeof suivi[ids[0]].createdAt === 'string';

      await disableTrackChangesIfOn(h);
      await h.resetEditor();
      Editor.setHTML('<p>Vidé entre-temps.</p>');
      const select = document.getElementById('template-select');
      select.value = String(id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(600);
      const htmlBack = Editor.getHTML();
      const markBack = htmlBack.indexOf('Suggestion en attente') !== -1 && htmlBack.indexOf('<ins') !== -1;
      return {
        pass: entryOk && markBack,
        notes: 'SuiviModifications=' + row.SuiviModifications + ', markBack=' + markBack,
      };
    },
  });

  // Avant le scénario du macro-modèle ci-dessous : celui-ci laisse l'application en mode macro, éditeur masqué (aucune mise en page, aucun focus possible), alors
  // que les colonnes se mesurent sur l'éditeur affiché.
  // === Colonnes d'un tableau avec le suivi (demande d'Antoine du 01/10, « Faire marcher ») ===
  // « Colonne avant », « Colonne après » et « Supprimer la colonne » (barre flottante du tableau) ne faisaient rien quand le suivi était allumé : la ligne du tableau
  // n'acceptait pas la marque que le suivi pose sur chaque case de la colonne (la transaction était refusée, console.warn « Invalid content for node tableRow »).
  // Elles posent maintenant une marque d'insertion ou de suppression sur chaque case, dessinée en teinte verte ou rouge barrée, acceptée ou refusée par « Tout
  // accepter » / « Tout refuser », annulée par Ctrl+Z, et enregistrée EN ATTRIBUT DE LA CASE (data-tc-insertion="3") : un <ins> / <del> posé autour du <td> dans le
  // <tr> ne survit pas à l'analyseur HTML du navigateur, la suggestion disparaissait à la réouverture.
  const TABLE_3X2 = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
  const TABLE_MERGED = '<table><tbody><tr><td colspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
  const TABLE_FIXED_WIDTHS = '<table style="width: 600px;"><colgroup><col style="width: 200px;"><col style="width: 400px;"></colgroup><tbody><tr><td colspan="1" rowspan="1" colwidth="200"><p>Nom</p></td><td colspan="1" rowspan="1" colwidth="400"><p>Valeur 1</p></td></tr><tr><td colspan="1" rowspan="1" colwidth="200"><p>Date</p></td><td colspan="1" rowspan="1" colwidth="400"><p>Valeur 2</p></td></tr></tbody></table><p>fin</p>';

  // HTML comparable : sans styles en ligne, sans <colgroup> (largeurs recalculées par le widget) ni colspan/rowspan à 1.
  const plainHtml = html => html.replace(/ style="[^"]*"/g, '').replace(/<colgroup>.*?<\/colgroup>/, '').replace(/ colspan="1" rowspan="1"/g, '');
  const cellRows = () => Array.from(document.querySelectorAll('.tiptap tr')).map(tr => Array.from(tr.querySelectorAll('td, th')));

  // Un modèle tout neuf, suivi allumé ou non, avec le curseur dans la case qui porte `text`.
  async function loadTable(h, html, text, tracking) {
    await h.resetEditor();
    await disableTrackChangesIfOn(h);
    Editor.setHTML(html);
    await h.sleep(200);
    await placeInCell(h, text);
    if (tracking) { Editor.setTrackChanges(true); await h.sleep(100); }
  }
  async function placeInCell(h, text) {
    const ed = EditorCore.getEditor();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === text) pos = p + 1; });
    if (pos < 0) throw new Error('case « ' + text + ' » introuvable');
    // Le focus d'abord : la barre du tableau se met à jour sur la transaction de sélection, et seulement si l'éditeur a déjà le focus.
    ed.view.focus();
    ed.view.dispatch(ed.state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed.state.doc, pos)));
    await h.sleep(150);
  }
  // La barre du tableau agit au mousedown (js/editor-core.js:createFloatingPanel), comme le fait la vraie souris.
  async function pressTableButton(h, action) {
    const btn = document.querySelector('.v2-floating-toolbar button[data-action="' + action + '"]');
    if (btn) btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(250);
    return btn;
  }
  // Chaque ligne : les cases se suivent bord à bord (aucune n'est sortie de la ligne, aucune n'est écrasée).
  function rowsAreInLine(rows, columns) {
    return rows.length > 0 && rows.every(cells => cells.length === columns
      && cells.every((td, i) => { const r = td.getBoundingClientRect(); return r.width > 20 && (i === 0 || Math.abs(r.left - cells[i - 1].getBoundingClientRect().right) < 2); }));
  }
  const spans = rows => rows.map(cells => cells.map(td => { const r = td.getBoundingClientRect(); return Math.round(r.left) + '-' + Math.round(r.right); }).join(' | ')).join(' // ');
  const isInsertedCell = td => td.parentElement.tagName === 'INS';
  const isDeletedCell = td => td.parentElement.tagName === 'DEL';

  cases.push({
    id: 'trackchanges_column_buttons_add_a_marked_column_laid_out_in_line',
    description: 'Suivi actif : « Colonne avant » et « Colonne après » ajoutent une colonne dont chaque case porte la marque d\'insertion (écrite en attribut de la case), teintée de vert, au bon rang, et alignée avec les autres colonnes',
    run: async (h) => {
      try {
        const out = [];
        for (const [action, expectedIndex] of [['col-before', 1], ['col-after', 2]]) {
          await loadTable(h, TABLE_3X2, 'b1', true);
          const btn = await pressTableButton(h, action);
          const html = Editor.getHTML();
          const rows = cellRows();
          const inserted = rows.map(cells => cells.findIndex(isInsertedCell));
          const tinted = rows.every(cells => { const td = cells.find(isInsertedCell); return !!td && getComputedStyle(td).backgroundColor === 'rgb(229, 246, 238)'; });
          out.push({
            action,
            found: !!btn,
            marked: (html.match(/<td[^>]* data-tc-insertion="\d+"/g) || []).length === 2,
            noWrapperInRow: !/<\/td><ins|<tr><ins/.test(html),
            index: inserted.every(i => i === expectedIndex),
            inLine: rowsAreInLine(rows, 4),
            tinted,
            pending: Editor.hasPendingTrackedChanges(),
            spans: spans(rows),
          });
        }
        return { pass: out.every(o => Object.keys(o).every(k => k === 'action' || k === 'spans' || o[k] === true)), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_delete_button_marks_a_struck_tinted_column_and_keeps_it',
    description: 'Suivi actif : « Supprimer la colonne » garde la colonne dans le tableau, chaque case marquée supprimée (attribut de la case), barrée et teintée de rouge, alignée avec les autres',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_3X2, 'b1', true);
        const btn = await pressTableButton(h, 'col-del');
        const html = Editor.getHTML();
        const rows = cellRows();
        const deleted = rows.map(cells => cells.findIndex(isDeletedCell));
        const struck = rows.every(cells => { const td = cells.find(isDeletedCell); return !!td && getComputedStyle(td).textDecorationLine.indexOf('line-through') !== -1 && getComputedStyle(td).backgroundColor === 'rgb(251, 233, 233)'; });
        const textKept = html.indexOf('b1') !== -1 && html.indexOf('b2') !== -1;
        const checks = {
          found: !!btn,
          marked: (html.match(/<td[^>]* data-tc-deletion="\d+"/g) || []).length === 2,
          column: deleted.every(i => i === 1),
          inLine: rowsAreInLine(rows, 3),
          struck,
          textKept,
          pending: Editor.hasPendingTrackedChanges(),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_accept_all_applies_and_reject_all_restores',
    description: '« Tout accepter » rend réelle la colonne ajoutée et retire la colonne supprimée ; « Tout refuser » retire la colonne ajoutée et rend la colonne supprimée : plus aucune marque, tableau rectangulaire',
    run: async (h) => {
      try {
        const out = {};
        for (const [name, action, resolveId, expectedCols] of [
          ['addAccept', 'col-after', 'v2-btn-accept-all', 4], ['addReject', 'col-after', 'v2-btn-reject-all', 3],
          ['delAccept', 'col-del', 'v2-btn-accept-all', 2], ['delReject', 'col-del', 'v2-btn-reject-all', 3],
        ]) {
          await loadTable(h, TABLE_3X2, 'b1', true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          await h.clickButton(resolveId);
          await h.sleep(250);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1 && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
          const rectangular = cellRows().every(cells => cells.length === expectedCols);
          const restored = expectedCols === 3 ? plainHtml(html) === before : true;
          out[name] = clean && rectangular && restored;
        }
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_undo_and_redo',
    description: 'Annuler défait une colonne ajoutée ou supprimée avec le suivi d\'un seul coup (tableau et marques tels qu\'avant), Rétablir la remet',
    run: async (h) => {
      try {
        const out = {};
        for (const action of ['col-after', 'col-del']) {
          await loadTable(h, TABLE_3X2, 'b1', true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          const pending = plainHtml(Editor.getHTML());
          const ed = EditorCore.getEditor();
          ed.commands.undo();
          await h.sleep(150);
          const undone = plainHtml(Editor.getHTML()) === before && !Editor.hasPendingTrackedChanges();
          ed.commands.redo();
          await h.sleep(150);
          const redone = plainHtml(Editor.getHTML()) === pending && Editor.hasPendingTrackedChanges();
          out[action] = undone && redone;
        }
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_suggestions_survive_the_html_round_trip',
    description: 'Une colonne ajoutée et une colonne supprimée en attente se retrouvent à l\'identique après Editor.getHTML() puis Editor.setHTML() (le chemin de l\'enregistrement), et « Tout refuser » rend alors le tableau d\'origine',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_3X2, 'b1', true);
        const original = plainHtml(Editor.getHTML());
        await pressTableButton(h, 'col-after');
        await placeInCell(h, 'c1');
        await pressTableButton(h, 'col-del');
        const html1 = Editor.getHTML();
        const both = /data-tc-insertion/.test(html1) && /data-tc-deletion/.test(html1);
        Editor.setHTML(html1);
        await h.sleep(250);
        const html2 = Editor.getHTML();
        const same = html2 === html1;
        const pending = Editor.hasPendingTrackedChanges();
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(250);
        const restored = plainHtml(Editor.getHTML()) === original;
        return { pass: both && same && pending && restored, notes: JSON.stringify({ both, same, pending, restored, html1, html2 }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_in_a_fixed_width_table_stays_a_rejectable_insertion',
    description: 'Dans un tableau aux largeurs fixées, les largeurs que le widget recalcule après l\'ajout ne sont pas des suggestions : les cases ajoutées gardent leur marque d\'insertion (« Tout refuser » retire la colonne), aucune case ne reçoit de marque de modification, et Annuler rend les largeurs d\'origine',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_FIXED_WIDTHS, 'Nom', true);
        await pressTableButton(h, 'col-after');
        await h.sleep(500);
        const html = Editor.getHTML();
        const insertions = (html.match(/data-tc-insertion/g) || []).length;
        const modifications = (html.match(/data-tc-modification/g) || []).length;
        EditorCore.getEditor().commands.undo();
        await h.sleep(300);
        const widthsBack = (Editor.getHTML().match(/colwidth="(\d+)"/g) || []).join(',') === 'colwidth="200",colwidth="400",colwidth="200",colwidth="400"';
        EditorCore.getEditor().commands.redo();
        await h.sleep(300);
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(300);
        const twoColumns = cellRows().every(cells => cells.length === 2) && !Editor.hasPendingTrackedChanges();
        return { pass: insertions === 2 && modifications === 0 && widthsBack && twoColumns, notes: JSON.stringify({ insertions, modifications, widthsBack, twoColumns }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_through_a_merged_cell_add_resolves_delete_is_greyed',
    description: 'Une colonne ajoutée à travers une case fusionnée s\'accepte et se refuse proprement (colspan rendu à l\'identique au refus) ; « Supprimer la colonne » est grisé avec une info-bulle dans ce cas (aria-disabled) et ne fait rien, mais reste actif suivi coupé',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_MERGED, 'b2', true);
        const before = plainHtml(Editor.getHTML());
        const delBtn = () => document.querySelector('.v2-floating-toolbar button[data-action="col-del"]');
        const greyed = !!delBtn() && delBtn().getAttribute('aria-disabled') === 'true' && delBtn().classList.contains('is-disabled') && delBtn().title.indexOf('fusionn') !== -1;
        await pressTableButton(h, 'col-del');
        const untouched = plainHtml(Editor.getHTML()) === before && !Editor.hasPendingTrackedChanges();
        // Hors de la case fusionnée (colonne 3) : actif.
        await placeInCell(h, 'c2');
        const freeColumn = delBtn().getAttribute('aria-disabled') === 'false' && delBtn().title === 'Supprimer la colonne';
        // Suivi coupé : actif aussi sous la case fusionnée.
        Editor.setTrackChanges(false);
        await placeInCell(h, 'b2');
        const enabledUntracked = delBtn().getAttribute('aria-disabled') === 'false';
        Editor.setTrackChanges(true);
        await h.sleep(100);
        // Ajout à travers la case fusionnée : accepté puis refusé.
        const out = {};
        for (const [name, resolveId] of [['accept', 'v2-btn-accept-all'], ['reject', 'v2-btn-reject-all']]) {
          await loadTable(h, TABLE_MERGED, 'b2', true);
          await pressTableButton(h, 'col-before');
          await h.clickButton(resolveId);
          await h.sleep(250);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1;
          out[name] = clean && (name === 'accept' ? cellRows().map(c => c.length).join() === '2,4' && /colspan="3"/.test(html) : plainHtml(html) === before);
        }
        return { pass: greyed && untouched && freeColumn && enabledUntracked && out.accept && out.reject, notes: JSON.stringify({ greyed, untouched, freeColumn, enabledUntracked, out }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_column_commands_without_suivi_leave_no_trace',
    description: 'Suivi coupé : les trois boutons de colonne agissent tout de suite, sans aucune marque ni attribut data-tc-* dans le HTML enregistré',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_3X2, 'b1', false);
        await pressTableButton(h, 'col-after');
        const afterAdd = cellRows().map(c => c.length).join();
        await pressTableButton(h, 'col-del');
        const afterDel = cellRows().map(c => c.length).join();
        const html = Editor.getHTML();
        const clean = html.indexOf('data-tc-') === -1 && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1 && !Editor.hasPendingTrackedChanges();
        return { pass: afterAdd === '4,4' && afterDel === '3,3' && clean, notes: JSON.stringify({ afterAdd, afterDel, clean }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  // === Lignes d'un tableau avec le suivi (demande d'Antoine du 01/10, carte « Faire marcher aussi Ligne avant / après et Supprimer la ligne avec le suivi ? », « Corriger ») ===
  // Même défaut que les colonnes avant leur correction : la marque que le suivi pose sur la LIGNE est dessinée par ProseMirror en <ins> / <del> autour du <tr>, donc enfant direct du
  // <tbody>. Sans règle, cet élément en ligne sortait la ligne du tableau (une bande de 22 à 49 px de large, au lieu de la ligne pleine largeur), et le HTML enregistré
  // (`<tbody><ins><tr>`) ne survivait pas à l'analyseur HTML du navigateur, qui écarte l'élément étranger : à la réouverture la ligne ajoutée n'était plus refusable, la ligne
  // supprimée revenait comme si de rien n'était. La marque s'écrit maintenant en attribut de la ligne (<tr data-tc-insertion="3">), les enveloppes vivantes sont mises en page
  // par `display: contents` et les cases de la ligne portent la teinte des cases d'une colonne suivie.
  const TABLE_ROWS = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr><tr><td><p>a3</p></td><td><p>b3</p></td></tr></tbody></table><p>fin</p>';
  const TABLE_ROWSPAN = '<table><tbody><tr><td rowspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>c2</p></td></tr><tr><td><p>a3</p></td><td><p>b3</p></td></tr></tbody></table><p>fin</p>';
  const tableRowEls = () => Array.from(document.querySelectorAll('.tiptap tr'));
  const isInsertedRow = tr => tr.parentElement.tagName === 'INS';
  const isDeletedRow = tr => tr.parentElement.tagName === 'DEL';
  const rowTexts = () => tableRowEls().map(tr => tr.textContent).join('|');
  // Chaque ligne a la largeur de la première (le tableau), à 2 px près : une ligne sortie du tableau (ancien rendu : une bande étroite) fait échouer ce test.
  function rowsAreFullWidth(rows) {
    const widths = rows.map(tr => tr.getBoundingClientRect().width);
    return widths.length > 0 && widths[0] > 100 && widths.every(w => Math.abs(w - widths[0]) < 2) && rows.every(tr => tr.getBoundingClientRect().height > 10);
  }
  const tintOf = tr => Array.from(tr.querySelectorAll('td, th')).map(td => getComputedStyle(td).backgroundColor + ' ' + getComputedStyle(td).color);
  const GREEN_TINT = 'rgb(229, 246, 238) rgb(20, 108, 72)';
  const RED_TINT = 'rgb(251, 233, 233) rgb(180, 35, 24)';

  cases.push({
    id: 'trackchanges_row_buttons_add_a_marked_row_laid_out_full_width',
    description: 'Suivi actif : « Ligne avant » et « Ligne après » ajoutent une ligne marquée comme insertion (attribut de la ligne, pas d\'enveloppe dans le tableau), au bon rang, pleine largeur comme les autres et teintée de vert',
    run: async (h) => {
      try {
        const out = [];
        for (const [action, expectedIndex] of [['row-before', 1], ['row-after', 2]]) {
          await loadTable(h, TABLE_ROWS, 'a2', true);
          const btn = await pressTableButton(h, action);
          const html = Editor.getHTML();
          const rows = tableRowEls();
          const index = rows.findIndex(isInsertedRow);
          out.push({
            action,
            found: !!btn,
            marked: (html.match(/<tr[^>]* data-tc-insertion="\d+"/g) || []).length === 1,
            noWrapperInBody: !/<tbody><ins|<\/tr><ins|<\/tr><del/.test(html),
            index: index === expectedIndex,
            fourRows: rows.length === 4,
            fullWidth: rowsAreFullWidth(rows),
            tinted: index >= 0 && tintOf(rows[index]).every(t => t === GREEN_TINT),
            othersPlain: rows.filter((tr, i) => i !== index).every(tr => tintOf(tr).every(t => t !== GREEN_TINT)),
            pending: Editor.hasPendingTrackedChanges(),
            widths: rows.map(tr => Math.round(tr.getBoundingClientRect().width)).join(),
          });
        }
        return { pass: out.every(o => Object.keys(o).every(k => k === 'action' || k === 'widths' || o[k] === true)), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_delete_button_marks_a_struck_tinted_row_and_keeps_it',
    description: 'Suivi actif : « Supprimer la ligne » garde la ligne dans le tableau, marquée supprimée (attribut de la ligne), barrée et teintée de rouge, pleine largeur comme les autres',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_ROWS, 'a2', true);
        const btn = await pressTableButton(h, 'row-del');
        const html = Editor.getHTML();
        const rows = tableRowEls();
        const index = rows.findIndex(isDeletedRow);
        const struck = index >= 0 && Array.from(rows[index].querySelectorAll('td')).every(td => getComputedStyle(td).textDecorationLine.indexOf('line-through') !== -1);
        const checks = {
          found: !!btn,
          marked: (html.match(/<tr[^>]* data-tc-deletion="\d+"/g) || []).length === 1,
          noWrapperInBody: !/<tbody><ins|<\/tr><ins|<\/tr><del/.test(html),
          threeRows: rows.length === 3,
          index: index === 1,
          fullWidth: rowsAreFullWidth(rows),
          tinted: index >= 0 && tintOf(rows[index]).every(t => t === RED_TINT),
          struck,
          textKept: rowTexts() === 'a1b1|a2b2|a3b3',
          pending: Editor.hasPendingTrackedChanges(),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_accept_all_applies_and_reject_all_restores',
    description: '« Tout accepter » rend réelle la ligne ajoutée et retire la ligne supprimée ; « Tout refuser » retire la ligne ajoutée et rend la ligne supprimée : plus aucune marque, tableau rectangulaire',
    run: async (h) => {
      try {
        const out = {};
        for (const [name, action, resolveId, expectedRows] of [
          ['addAccept', 'row-after', 'v2-btn-accept-all', 4], ['addReject', 'row-after', 'v2-btn-reject-all', 3],
          ['delAccept', 'row-del', 'v2-btn-accept-all', 2], ['delReject', 'row-del', 'v2-btn-reject-all', 3],
        ]) {
          await loadTable(h, TABLE_ROWS, 'a2', true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          await h.clickButton(resolveId);
          await h.sleep(250);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1 && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1;
          const rectangular = tableRowEls().length === expectedRows && cellRows().every(cells => cells.length === 2);
          const restored = expectedRows === 3 ? plainHtml(html) === before : true;
          const kept = name === 'delAccept' ? rowTexts() === 'a1b1|a3b3' : true;
          out[name] = clean && rectangular && restored && kept;
        }
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_undo_and_redo',
    description: 'Annuler défait une ligne ajoutée ou supprimée avec le suivi d\'un seul coup (tableau et marques tels qu\'avant), Rétablir la remet',
    run: async (h) => {
      try {
        const out = {};
        for (const action of ['row-after', 'row-del']) {
          await loadTable(h, TABLE_ROWS, 'a2', true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          const pending = plainHtml(Editor.getHTML());
          const ed = EditorCore.getEditor();
          ed.commands.undo();
          await h.sleep(150);
          const undone = plainHtml(Editor.getHTML()) === before && !Editor.hasPendingTrackedChanges();
          ed.commands.redo();
          await h.sleep(150);
          const redone = plainHtml(Editor.getHTML()) === pending && Editor.hasPendingTrackedChanges();
          out[action] = undone && redone;
        }
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_suggestions_survive_the_html_round_trip',
    description: 'Une ligne ajoutée et une ligne supprimée en attente se retrouvent à l\'identique, teintées, après Editor.getHTML() puis Editor.setHTML() (le chemin de l\'enregistrement), et « Tout refuser » rend alors le tableau d\'origine',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_ROWS, 'a2', true);
        const original = plainHtml(Editor.getHTML());
        await pressTableButton(h, 'row-after');
        await placeInCell(h, 'a3');
        await pressTableButton(h, 'row-del');
        const html1 = Editor.getHTML();
        const both = /<tr[^>]* data-tc-insertion/.test(html1) && /<tr[^>]* data-tc-deletion/.test(html1);
        Editor.setHTML(html1);
        await h.sleep(250);
        const html2 = Editor.getHTML();
        const same = html2 === html1;
        const pending = Editor.hasPendingTrackedChanges();
        const rows = tableRowEls();
        const tinted = rows.filter(isInsertedRow).length === 1 && rows.filter(isDeletedRow).length === 1 && rowsAreFullWidth(rows);
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(250);
        const restored = plainHtml(Editor.getHTML()) === original;
        return { pass: both && same && pending && tinted && restored, notes: JSON.stringify({ both, same, pending, tinted, restored, html1, html2 }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_through_a_merged_cell_add_resolves_delete_is_greyed',
    description: 'Une ligne ajoutée à travers une case fusionnée en hauteur s\'accepte et se refuse proprement (rowspan rendu à l\'identique au refus) ; « Supprimer la ligne » est grisé avec une info-bulle dans ce cas (aria-disabled) et ne fait rien, actif ailleurs et suivi coupé',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_ROWSPAN, 'c2', true);
        const before = plainHtml(Editor.getHTML());
        const delBtn = () => document.querySelector('.v2-floating-toolbar button[data-action="row-del"]');
        const isGreyed = () => !!delBtn() && delBtn().getAttribute('aria-disabled') === 'true' && delBtn().classList.contains('is-disabled') && delBtn().title.indexOf('fusionn') !== -1;
        const greyedBelow = isGreyed();
        await pressTableButton(h, 'row-del');
        const untouched = plainHtml(Editor.getHTML()) === before && !Editor.hasPendingTrackedChanges();
        await placeInCell(h, 'c1');
        const greyedFirst = isGreyed();
        // Hors de la case fusionnée (ligne 3) : actif.
        await placeInCell(h, 'a3');
        const freeRow = delBtn().getAttribute('aria-disabled') === 'false' && delBtn().title === 'Supprimer la ligne';
        // Suivi coupé : actif aussi sous la case fusionnée.
        Editor.setTrackChanges(false);
        await placeInCell(h, 'c2');
        const enabledUntracked = delBtn().getAttribute('aria-disabled') === 'false';
        Editor.setTrackChanges(true);
        await h.sleep(100);
        // Ajout à travers la case fusionnée : accepté puis refusé.
        const out = {};
        for (const [name, resolveId] of [['accept', 'v2-btn-accept-all'], ['reject', 'v2-btn-reject-all']]) {
          await loadTable(h, TABLE_ROWSPAN, 'c1', true);
          await pressTableButton(h, 'row-after');
          await h.clickButton(resolveId);
          await h.sleep(250);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1;
          out[name] = clean && (name === 'accept' ? tableRowEls().length === 4 && /rowspan="3"/.test(html) : plainHtml(html) === before);
        }
        return { pass: greyedBelow && untouched && greyedFirst && freeRow && enabledUntracked && out.accept && out.reject, notes: JSON.stringify({ greyedBelow, untouched, greyedFirst, freeRow, enabledUntracked, out }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_row_commands_without_suivi_leave_no_trace',
    description: 'Suivi coupé : les trois boutons de ligne agissent tout de suite, sans aucune marque ni attribut data-tc-* dans le HTML enregistré',
    run: async (h) => {
      try {
        await loadTable(h, TABLE_ROWS, 'a2', false);
        await pressTableButton(h, 'row-after');
        const afterAdd = tableRowEls().length;
        await pressTableButton(h, 'row-del');
        const afterDel = tableRowEls().length;
        const html = Editor.getHTML();
        const clean = html.indexOf('data-tc-') === -1 && html.indexOf('<ins') === -1 && html.indexOf('<del') === -1 && !Editor.hasPendingTrackedChanges();
        return { pass: afterAdd === 4 && afterDel === 3 && clean, notes: JSON.stringify({ afterAdd, afterDel, clean }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  // Déplacement d'une image en calque (choix d'Antoine, 01/10 : « le déplacement d'une image laisse une trace, quel que soit le mode de déplacement ») : EditorNodes.moveImageNode est la
  // voie commune du glisser de la NodeView et des flèches du clavier (leurs parcours à la vraie souris et au vrai clavier : imageZoomMouse, imageArrowsKeyboard). Le suivi s'active APRÈS
  // la pose de l'image : l'insérer suivi en ferait déjà une insertion suggérée.
  const IMG_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  async function layeredImageDocument(h, trackOn) {
    await h.resetEditor();
    await disableTrackChangesIfOn(h);
    Editor.setHTML('<p>Texte </p><p>Une deuxième ligne.</p>');
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(6);
    ed.commands.insertContent({ type: 'editorImage', attrs: { src: IMG_PNG, alt: '', width: '120px', layer: 'front', left: 50, top: 40, pageIndex: 0, pageLeftPt: 37.5, pageTopPt: 30 } });
    await h.sleep(150);
    if (trackOn) await enableTrackChanges(h);
    return ed;
  }
  function imagesState() {
    const ed = EditorCore.getEditor();
    const images = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'editorImage') return;
      const marks = node.marks.map(m => m.type.name);
      images.push({ pos, left: node.attrs.left, top: node.attrs.top, pageLeftPt: node.attrs.pageLeftPt, deleted: marks.includes('deletion'), inserted: marks.includes('insertion'), marks });
    });
    const sel = ed.state.selection;
    return { images, selImage: !!(sel.node && sel.node.type.name === 'editorImage'), selFrom: sel.from };
  }
  const firstImagePos = () => imagesState().images[0].pos;

  cases.push({
    id: 'trackchanges_image_move_leaves_a_struck_original_and_an_inserted_copy',
    description: "Suivi actif : déplacer une image en calque laisse l'original en suppression suggérée à sa place et la copie en insertion suggérée à la nouvelle position, resélectionnée ; l'une barrée et estompée au cadre rouge en tirets, l'autre au cadre vert plein ; « Tout accepter » garde la copie seule",
    run: async (h) => {
      try {
        const ed = await layeredImageDocument(h, true);
        const wrote = EditorNodes.moveImageNode(ed, firstImagePos(), { left: 80, top: 60, pageLeftPt: 60 });
        await h.sleep(120);
        const st = imagesState();
        const orig = st.images.find(i => i.deleted);
        const copy = st.images.find(i => i.inserted);
        const structure = wrote === true && st.images.length === 2 && !!orig && !!copy && orig.left === 50 && orig.top === 40 && copy.left === 80 && copy.top === 60 && copy.pageLeftPt === 60;
        const selectedCopy = !!copy && st.selImage && st.selFrom === copy.pos;
        const del = document.querySelector('.tiptap del img.editor-image');
        const ins = document.querySelector('.tiptap ins img.editor-image');
        const cs = el => (el ? getComputedStyle(el) : null);
        const cues = !!del && !!ins && cs(del).outlineStyle === 'dashed' && cs(del).outlineColor === 'rgb(180, 35, 24)' && Number(cs(del).opacity) < 0.6 && cs(ins).outlineStyle === 'solid' && cs(ins).outlineColor === 'rgb(20, 108, 72)' && Number(cs(ins).opacity) === 1;
        const pending = Editor.hasPendingTrackedChanges();
        await h.clickButton('v2-btn-accept-all');
        await h.sleep(120);
        const after = imagesState();
        const accepted = after.images.length === 1 && after.images[0].marks.length === 0 && after.images[0].left === 80 && after.images[0].top === 60 && !Editor.hasPendingTrackedChanges();
        return { pass: structure && selectedCopy && cues && pending && accepted, notes: JSON.stringify({ wrote, structure, selectedCopy, cues, pending, accepted, st, after }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_image_move_reject_all_restores_the_original_position',
    description: "Suivi actif : « Tout refuser » après un déplacement d'image rend l'original seul, à sa position d'avant, sans marque",
    run: async (h) => {
      try {
        const ed = await layeredImageDocument(h, true);
        EditorNodes.moveImageNode(ed, firstImagePos(), { left: 130, top: 90, pageLeftPt: 97.5 });
        await h.sleep(120);
        const moved = imagesState().images.length === 2;
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(120);
        const st = imagesState();
        const restored = st.images.length === 1 && st.images[0].marks.length === 0 && st.images[0].left === 50 && st.images[0].top === 40 && st.images[0].pageLeftPt === 37.5 && !Editor.hasPendingTrackedChanges();
        return { pass: moved && restored, notes: JSON.stringify({ moved, st }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_image_move_survives_save_and_reopen',
    description: "Suivi actif : la trace d'un déplacement d'image est enregistrée dans le HTML du modèle (<del> puis <ins> autour de l'image, avec son calque, sa position et sa grille page) et retrouvée à l'identique à la réouverture ; « Tout refuser » rend alors l'original",
    run: async (h) => {
      try {
        const ed = await layeredImageDocument(h, true);
        EditorNodes.moveImageNode(ed, firstImagePos(), { left: 80, top: 60, pageLeftPt: 60 });
        await h.sleep(120);
        const summary = st => JSON.stringify(st.images.map(i => [i.left, i.top, i.pageLeftPt, i.deleted, i.inserted]));
        const before = imagesState();
        const html = Editor.getHTML();
        const written = /<del data-id="[^"]+"><img[^>]*data-layer="front"[^>]*><\/del><ins data-id="[^"]+"><img[^>]*data-layer="front"[^>]*><\/ins>/.test(html);
        Editor.setHTML(html);
        await h.sleep(250);
        const after = imagesState();
        const identical = before.images.length === 2 && summary(after) === summary(before);
        const pending = Editor.hasPendingTrackedChanges();
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(120);
        const rejected = imagesState();
        const restored = rejected.images.length === 1 && rejected.images[0].marks.length === 0 && rejected.images[0].left === 50 && rejected.images[0].top === 40 && rejected.images[0].pageLeftPt === 37.5 && !Editor.hasPendingTrackedChanges();
        return { pass: written && identical && pending && restored, notes: JSON.stringify({ written, identical, pending, restored, before, after, rejected }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_image_move_of_an_inserted_copy_stays_in_place',
    description: "Suivi actif : déplacer une seconde fois l'image (la copie déjà insérée) la déplace en place, sans empiler une autre trace ; l'original barré ne bouge pas, même si on essaie",
    run: async (h) => {
      try {
        const ed = await layeredImageDocument(h, true);
        EditorNodes.moveImageNode(ed, firstImagePos(), { left: 60, top: 40 });
        let st = imagesState();
        const copyPos = st.images.find(i => i.inserted).pos;
        const second = EditorNodes.moveImageNode(ed, copyPos, { left: 75, top: 55 });
        const third = EditorNodes.moveImageNode(ed, copyPos, { left: 90, top: 55 });
        st = imagesState();
        const orig = st.images.find(i => i.deleted);
        const copy = st.images.find(i => i.inserted);
        const onePair = st.images.length === 2 && !!orig && !!copy && st.images.filter(i => i.deleted).length === 1 && st.images.filter(i => i.inserted).length === 1;
        const inPlace = !!copy && copy.left === 90 && copy.top === 55 && !!orig && orig.left === 50 && orig.top === 40;
        const selected = !!copy && st.selImage && st.selFrom === copy.pos;
        const txBefore = EditorCore.getEditor().state.doc;
        const moveOriginal = EditorNodes.moveImageNode(ed, orig.pos, { left: 10, top: 10 });
        const originalUntouched = moveOriginal === false && EditorCore.getEditor().state.doc === txBefore;
        return { pass: second === true && third === true && onePair && inPlace && selected && originalUntouched, notes: JSON.stringify({ second, third, onePair, inPlace, selected, moveOriginal, originalUntouched, st }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_image_move_writes_nothing_when_no_value_changes',
    description: "Un déplacement qui ne change aucune valeur (un simple clic sur l'image déjà sélectionnée, une flèche contre le bord de la page) n'écrit rien : même document, suivi actif ou non, aucune suggestion",
    run: async (h) => {
      try {
        let ed = await layeredImageDocument(h, false);
        const docOff = ed.state.doc;
        const sameOff = EditorNodes.moveImageNode(ed, firstImagePos(), { left: 50, top: 40, pageIndex: 0, pageLeftPt: 37.5, pageTopPt: 30 });
        const untouchedOff = sameOff === false && ed.state.doc === docOff;
        await enableTrackChanges(h);
        const docOn = ed.state.doc;
        const sameOn = EditorNodes.moveImageNode(ed, firstImagePos(), { left: 50, top: 40, pageIndex: 0, pageLeftPt: 37.5, pageTopPt: 30 });
        const untouchedOn = sameOn === false && ed.state.doc === docOn && !Editor.hasPendingTrackedChanges() && imagesState().images.length === 1;
        return { pass: untouchedOff && untouchedOn, notes: JSON.stringify({ sameOff, untouchedOff, sameOn, untouchedOn }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_image_move_without_suivi_leaves_no_trace',
    description: "Suivi coupé : déplacer une image la déplace tout simplement (une image, sans marque, rien en attente), toujours sélectionnée",
    run: async (h) => {
      await h.resetEditor();
      const ed = await layeredImageDocument(h, false);
      const wrote = EditorNodes.moveImageNode(ed, firstImagePos(), { left: 80, top: 60, pageLeftPt: 60 });
      await h.sleep(120);
      const st = imagesState();
      const one = st.images.length === 1 && st.images[0].marks.length === 0 && st.images[0].left === 80 && st.images[0].top === 60 && st.images[0].pageLeftPt === 60;
      return { pass: wrote === true && one && st.selImage && !Editor.hasPendingTrackedChanges() && Editor.getHTML().indexOf('<ins') === -1 && Editor.getHTML().indexOf('<del') === -1, notes: JSON.stringify({ wrote, st }) };
    },
  });

  // === Accepter ou refuser UNE modification (demande d'Antoine du 04/10 : « cliquer sur la zone modifiée et n'accepter que celle-là ») ===
  // La barre du haut ne savait que « Tout accepter » et « Tout refuser ». Un clic sur une modification ouvre maintenant une petite barre « Accepter / Refuser » sous le curseur
  // (js/floating-toolbars.js:wireSuggestionFloatingToolbar) : elle ne traite que cette suggestion - avec tout ce qui en fait partie : l'ancien texte ET le nouveau d'un remplacement, les
  // deux bouts d'une suppression à cheval sur deux paragraphes, toutes les cases d'une colonne - en UNE transaction (un seul Annuler). Les parcours à la vraie souris sont dans le script
  // Node suggestionBarMouse ; ici, la barre est pressée comme le fait la souris (mousedown, js/editor-core.js:createFloatingPanel).
  const suggestBar = () => document.querySelector('.v2-suggest-toolbar');
  const barVisible = () => !!suggestBar() && suggestBar().classList.contains('visible');
  async function pressBarButton(h, action) {
    const btn = suggestBar() && suggestBar().querySelector('button[data-action="' + action + '"]');
    if (btn) btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(250);
    return btn;
  }
  // Position du `offset`-ième caractère du premier texte qui contient `text`.
  function textPos(text, offset) {
    let pos = -1;
    EditorCore.getEditor().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text.includes(text)) pos = p + node.text.indexOf(text) + offset; });
    if (pos < 0) throw new Error('texte « ' + text + ' » introuvable');
    return pos;
  }
  // Le curseur (ou la sélection de `from` à `to`) posé comme le fait un clic : le focus d'abord - la barre se met à jour sur la transaction de sélection, et seulement si l'éditeur a le focus.
  async function selectDoc(h, from, to) {
    const ed = EditorCore.getEditor();
    ed.view.focus();
    ed.view.dispatch(ed.state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed.state.doc, from, to == null ? from : to)));
    await h.sleep(150);
  }
  const caretIn = (h, text, offset) => selectDoc(h, textPos(text, offset));
  // Un document, suivi allumé, avec un ajout tapé au bout de chaque paragraphe donné : [texte du paragraphe, ajout].
  async function documentWithInsertions(h, html, additions) {
    await h.resetEditor();
    await disableTrackChangesIfOn(h);
    Editor.setHTML(html);
    await h.sleep(200);
    Editor.setTrackChanges(true);
    for (const [text, add] of additions) { await caretIn(h, text, text.length); await h.typeText(add); }
  }
  const insCount = html => (html.match(/<ins /g) || []).length;
  // La position de la première case (ou ligne) portant une marque `markName`, `n` fois ignorée, et celle de son premier paragraphe.
  function markedNodePos(typeName, markName, skip) {
    let pos = -1;
    let seen = 0;
    EditorCore.getEditor().state.doc.descendants((node, p) => { if (node.type.name === typeName && node.marks.some(m => m.type.name === markName) && seen++ === (skip || 0) && pos < 0) pos = p; });
    if (pos < 0) throw new Error(typeName + ' marqué ' + markName + ' introuvable');
    return pos;
  }

  cases.push({
    id: 'trackchanges_bar_accepts_or_rejects_only_the_touched_suggestion',
    description: "Trois ajouts en attente : le curseur dans le premier ouvre la barre « Accepter / Refuser », « Accepter » ne résout que celui-là (texte gardé, marque retirée, barre fermée) et les deux autres restent en attente, suivi coupé ou non ; « Refuser » sur le deuxième retire son texte et laisse le troisième ; Annuler rend le deuxième d'un seul coup",
    run: async (h) => {
      try {
        await documentWithInsertions(h, '<p>Alpha beta</p><p>Gamma delta</p><p>Epsilon zeta</p>', [['Alpha beta', ' XX'], ['Gamma delta', ' YY'], ['Epsilon zeta', ' ZZ']]);
        const three = insCount(Editor.getHTML()) === 3;
        await caretIn(h, ' XX', 2);
        const opened = barVisible();
        await pressBarButton(h, 'accept');
        const html1 = Editor.getHTML();
        const first = html1.indexOf('<p>Alpha beta XX</p>') !== -1 && insCount(html1) === 2;
        const closed = !barVisible();
        // Suivi coupé : des suggestions restent à résoudre, la barre fonctionne de même.
        Editor.setTrackChanges(false);
        await h.sleep(100);
        await caretIn(h, ' YY', 2);
        const openedUntracked = barVisible();
        await pressBarButton(h, 'reject');
        const html2 = Editor.getHTML();
        const second = html2.indexOf('<p>Gamma delta</p>') !== -1 && html2.indexOf('YY') === -1 && insCount(html2) === 1 && html2.indexOf('ZZ') !== -1;
        await h.sleep(700);
        EditorCore.getEditor().commands.undo();
        await h.sleep(200);
        const html3 = Editor.getHTML();
        const undone = /<ins [^>]*> YY<\/ins>/.test(html3) && insCount(html3) === 2 && html3.indexOf('<p>Alpha beta XX</p>') !== -1;
        return { pass: three && opened && first && closed && openedUntracked && second && undone, notes: JSON.stringify({ three, opened, first, closed, openedUntracked, second, undone, html3 }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_opens_on_a_suggestion_below_the_caret_and_stays_closed_while_typing',
    description: "La barre s'ouvre quand le curseur touche une suggestion (ajout ou suppression), SOUS le curseur et dans la fenêtre ; elle se ferme sur un texte sans suggestion, reste fermée pendant la frappe (même collée au bout de l'ajout) et se rouvre au déplacement suivant ; sans focus dans l'éditeur elle reste fermée ; libellés et info-bulles suivent la langue, au pluriel pour une sélection de plusieurs modifications",
    run: async (h) => {
      try {
        await documentWithInsertions(h, '<p>Garder ceci, retirer cela, fin.</p><p>Autre paragraphe.</p>', [['Autre paragraphe.', ' Ajout.']]);
        const from = textPos('retirer cela', 0);
        await selectDoc(h, from, from + 'retirer cela'.length);
        document.execCommand('delete');
        await h.sleep(150);
        const closedAfterDelete = !barVisible();
        const none = !(await (async () => { await caretIn(h, 'Garder', 2); return barVisible(); })());
        await caretIn(h, 'retirer cela', 3);
        const onDeletion = barVisible();
        const ed = EditorCore.getEditor();
        const caret = ed.view.coordsAtPos(ed.state.selection.head);
        const rect = suggestBar().getBoundingClientRect();
        const below = rect.top >= caret.bottom - 1 && rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
        await caretIn(h, ' Ajout.', 7);
        const atEnd = barVisible();
        await h.typeText('abc');
        const closedWhileTyping = !barVisible();
        await caretIn(h, 'Garder', 2);
        await caretIn(h, ' Ajout.', 3);
        const reopened = barVisible();
        const titleOne = suggestBar().querySelector('button[data-action="accept"]').title;
        // Une sélection qui recouvre les deux suggestions : l'info-bulle passe au pluriel.
        await selectDoc(h, textPos('retirer cela', 2), textPos(' Ajout.', 3));
        const titleMany = suggestBar().querySelector('button[data-action="reject"]').title;
        // Hors du texte (le focus ailleurs) : la sélection peut bouger, la barre ne s'ouvre pas.
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
        ed.view.dispatch(ed.state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed.state.doc, textPos('retirer cela', 3))));
        await h.sleep(150);
        const noFocusClosed = !barVisible();
        await caretIn(h, ' Ajout.', 3);
        I18n.setLang('en');
        await h.sleep(100);
        const english = suggestBar().textContent === 'AcceptReject';
        await caretIn(h, 'retirer cela', 2);
        const titleEn = suggestBar().querySelector('button[data-action="accept"]').title;
        I18n.setLang('fr');
        await h.sleep(100);
        const french = suggestBar().textContent === 'AccepterRefuser';
        const checks = { closedAfterDelete, none, onDeletion, below, atEnd, closedWhileTyping, reopened, titleOne: titleOne === 'Accepter cette modification', titleMany: titleMany === 'Refuser ces modifications', noFocusClosed, english, titleEn: titleEn === 'Accept this change', french };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) + ' titres=' + titleOne + ' / ' + titleMany + ' / ' + titleEn + ' barre=' + JSON.stringify(rect) };
      } finally { I18n.setLang('fr'); await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_resolves_a_replacement_and_a_deletion_across_paragraphs_as_one',
    description: "Un remplacement (l'ancien texte barré ET le nouveau) se résout d'un seul clic depuis l'un ou l'autre ; une suppression à cheval sur deux paragraphes aussi - accepter fusionne les deux paragraphes, refuser les rend tels quels ; un gras posé sur un mot (supprimé + inséré) de même",
    run: async (h) => {
      try {
        const out = {};
        // Le texte neuf ne partage ni début ni fin avec l'ancien : sur une sélection, execCommand('insertText') laisse au navigateur le calcul de ce qui a changé (« changer » -> « modifier » donne
        // « chang » barré, « modifi » ajouté, « er » intact), ce qui n'est plus un remplacement de mot.
        const replace = async (button, caretText) => {
          await h.resetEditor();
          await disableTrackChangesIfOn(h);
          Editor.setHTML('<p>Un mot à changer ici</p>');
          await h.sleep(200);
          Editor.setTrackChanges(true);
          const from = textPos('changer', 0);
          await selectDoc(h, from, from + 'changer'.length);
          await h.typeText('nouveau');
          await caretIn(h, caretText, 3);
          await pressBarButton(h, button);
          return Editor.getHTML();
        };
        out.replaceAccept = (await replace('accept', 'nouveau')) === '<p>Un mot à nouveau ici</p>';
        out.replaceReject = (await replace('reject', 'nouveau')) === '<p>Un mot à changer ici</p>';
        out.replaceFromOld = (await replace('accept', 'changer')) === '<p>Un mot à nouveau ici</p>';
        const crossing = async (button) => {
          await h.resetEditor();
          await disableTrackChangesIfOn(h);
          Editor.setHTML('<p>Alpha beta</p><p>Gamma delta</p><p>Epsilon</p>');
          await h.sleep(200);
          Editor.setTrackChanges(true);
          await selectDoc(h, textPos('beta', 0), textPos('Gamma', 5));
          document.execCommand('delete');
          await h.sleep(150);
          await caretIn(h, 'beta', 2);
          await pressBarButton(h, button);
          return Editor.getHTML();
        };
        out.crossAccept = (await crossing('accept')) === '<p>Alpha delta</p><p>Epsilon</p>';
        out.crossReject = (await crossing('reject')) === '<p>Alpha beta</p><p>Gamma delta</p><p>Epsilon</p>';
        const bold = async (button) => {
          await h.resetEditor();
          await disableTrackChangesIfOn(h);
          Editor.setHTML('<p>Un mot important ici</p>');
          await h.sleep(200);
          Editor.setTrackChanges(true);
          const from = textPos('important', 0);
          await selectDoc(h, from, from + 'important'.length);
          EditorCore.getEditor().chain().focus().toggleBold().run();
          await h.sleep(150);
          await caretIn(h, 'important', 3);
          await pressBarButton(h, button);
          return Editor.getHTML();
        };
        out.boldAccept = (await bold('accept')) === '<p>Un mot <strong>important</strong> ici</p>';
        out.boldReject = (await bold('reject')) === '<p>Un mot important ici</p>';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_resolves_a_whole_column_or_row_from_one_cell',
    description: "Depuis UNE case d'une colonne ou d'une ligne ajoutée ou supprimée avec le suivi, la barre résout la colonne ou la ligne entière (une marque par case, un id chacune) : plus aucune marque, tableau rectangulaire, d'un seul Annuler ; à travers une case fusionnée, refuser rend aussi sa largeur ou sa hauteur à la case, accepter garde la nouvelle",
    run: async (h) => {
      try {
        const out = {};
        for (const [name, table, caretText, action, button, columns, rows] of [
          ['colAddAccept', TABLE_3X2, 'b1', 'col-after', 'accept', 4, 2], ['colAddReject', TABLE_3X2, 'b1', 'col-after', 'reject', 3, 2],
          ['colDelAccept', TABLE_3X2, 'b1', 'col-del', 'accept', 2, 2], ['colDelReject', TABLE_3X2, 'b1', 'col-del', 'reject', 3, 2],
        ]) {
          await loadTable(h, table, caretText, true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          await h.sleep(600);
          // Une case de la colonne : la nouvelle (2e ligne) pour un ajout, la case supprimée pour une suppression.
          const cellPos = markedNodePos('tableCell', action === 'col-after' ? 'insertion' : 'deletion', 1);
          await selectDoc(h, cellPos + 2);
          const opened = barVisible();
          await pressBarButton(h, button);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1;
          const rectangular = cellRows().length === rows && cellRows().every(cells => cells.length === columns);
          out[name] = opened && clean && rectangular && (columns === 3 ? plainHtml(html) === before : true);
        }
        // Un seul Annuler pour toute la colonne.
        await loadTable(h, TABLE_3X2, 'b1', true);
        await pressTableButton(h, 'col-after');
        await h.sleep(600);
        const pendingHtml = plainHtml(Editor.getHTML());
        await selectDoc(h, markedNodePos('tableCell', 'insertion', 0) + 2);
        await pressBarButton(h, 'accept');
        await h.sleep(600);
        EditorCore.getEditor().commands.undo();
        await h.sleep(200);
        out.colUndoOnce = plainHtml(Editor.getHTML()) === pendingHtml && Editor.hasPendingTrackedChanges();
        for (const [name, table, caretText, action, button, rowCount] of [
          ['rowAddAccept', TABLE_ROWS, 'a2', 'row-after', 'accept', 4], ['rowAddReject', TABLE_ROWS, 'a2', 'row-after', 'reject', 3],
          ['rowDelAccept', TABLE_ROWS, 'a2', 'row-del', 'accept', 2], ['rowDelReject', TABLE_ROWS, 'a2', 'row-del', 'reject', 3],
        ]) {
          await loadTable(h, table, caretText, true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          await h.sleep(600);
          await selectDoc(h, markedNodePos('tableRow', action === 'row-after' ? 'insertion' : 'deletion', 0) + 3);
          const opened = barVisible();
          await pressBarButton(h, button);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1;
          out[name] = opened && clean && tableRowEls().length === rowCount && cellRows().every(cells => cells.length === 2) && (rowCount === 3 ? plainHtml(html) === before : true);
        }
        for (const [name, table, caretText, action, button] of [
          ['mergedColReject', TABLE_MERGED, 'b2', 'col-before', 'reject'], ['mergedColAccept', TABLE_MERGED, 'b2', 'col-before', 'accept'],
          ['mergedRowReject', TABLE_ROWSPAN, 'c1', 'row-after', 'reject'], ['mergedRowAccept', TABLE_ROWSPAN, 'c1', 'row-after', 'accept'],
        ]) {
          await loadTable(h, table, caretText, true);
          const before = plainHtml(Editor.getHTML());
          await pressTableButton(h, action);
          await h.sleep(600);
          const isCol = action === 'col-before';
          await selectDoc(h, markedNodePos(isCol ? 'tableCell' : 'tableRow', 'insertion', 0) + (isCol ? 2 : 3));
          await pressBarButton(h, button);
          const html = Editor.getHTML();
          const clean = !Editor.hasPendingTrackedChanges() && html.indexOf('data-tc-') === -1;
          const shape = button === 'reject' ? plainHtml(html) === before
            : isCol ? cellRows().map(c => c.length).join() === '2,4' && /colspan="3"/.test(html) : tableRowEls().length === 4 && /rowspan="3"/.test(html);
          out[name] = clean && shape;
        }
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_leaves_other_suggestions_and_attribute_changes_alone',
    description: "Une suppression suivie d'un paragraphe dont l'ALIGNEMENT a changé (marque de modification d'un autre id) : accepter ou refuser la suppression ne touche pas à la modification voisine, que la barre refuse à son tour en rendant l'alignement d'avant - la lib résout sinon toutes les modifications de la plage, de n'importe quelle suggestion",
    run: async (h) => {
      try {
        const build = async () => {
          await h.resetEditor();
          await disableTrackChangesIfOn(h);
          Editor.setHTML('<p>Garder retirer fin</p><p>Aligné</p><p>Fin</p>');
          await h.sleep(200);
          Editor.setTrackChanges(true);
          const from = textPos('retirer', 0);
          await selectDoc(h, from, from + 'retirer'.length);
          document.execCommand('delete');
          await h.sleep(150);
          await caretIn(h, 'Aligné', 2);
          EditorCore.getEditor().chain().focus().setTextAlign('right').run();
          await h.sleep(150);
        };
        const modificationsLeft = () => (Editor.getHTML().match(/data-type="modification"/g) || []).length;
        const out = {};
        await build();
        out.pending = insCount(Editor.getHTML()) === 0 && /<del /.test(Editor.getHTML()) && modificationsLeft() === 1;
        await caretIn(h, 'retirer', 3);
        await pressBarButton(h, 'accept');
        out.acceptKeepsModification = Editor.getHTML().indexOf('<p>Garder fin</p>') !== -1 && modificationsLeft() === 1 && /text-align: right/.test(Editor.getHTML());
        await build();
        await caretIn(h, 'retirer', 3);
        await pressBarButton(h, 'reject');
        out.rejectKeepsModification = Editor.getHTML().indexOf('<p>Garder retirer fin</p>') !== -1 && modificationsLeft() === 1 && /text-align: right/.test(Editor.getHTML());
        await caretIn(h, 'Aligné', 2);
        out.barOnModification = barVisible();
        await pressBarButton(h, 'reject');
        out.modificationRejected = modificationsLeft() === 0 && !/text-align: right/.test(Editor.getHTML()) && !Editor.hasPendingTrackedChanges();
        await build();
        await caretIn(h, 'Aligné', 2);
        await pressBarButton(h, 'accept');
        out.modificationAccepted = modificationsLeft() === 0 && /<p style="text-align: right;">Aligné<\/p>/.test(Editor.getHTML()) && /<del /.test(Editor.getHTML());
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_resolves_every_suggestion_a_selection_covers',
    description: "Une sélection qui recouvre deux des trois ajouts en attente : « Accepter » les résout tous deux d'un coup et laisse le troisième ; le curseur ou la sélection sans aucune suggestion n'ouvre pas la barre et les commandes ne changent rien (document identique)",
    run: async (h) => {
      try {
        await documentWithInsertions(h, '<p>Alpha beta</p><p>Gamma delta</p><p>Epsilon zeta</p>', [['Alpha beta', ' XX'], ['Gamma delta', ' YY'], ['Epsilon zeta', ' ZZ']]);
        const ed = EditorCore.getEditor();
        await caretIn(h, 'Gamma', 2);
        const docBefore = ed.state.doc;
        const noneOpen = !barVisible();
        const noneChange = ed.commands.acceptSuggestionsAtSelection() === false && ed.commands.rejectSuggestionsAtSelection() === false && ed.state.doc === docBefore;
        await selectDoc(h, textPos(' XX', 1), textPos(' YY', 2));
        const open = barVisible();
        await pressBarButton(h, 'accept');
        const html = Editor.getHTML();
        const both = html.indexOf('<p>Alpha beta XX</p>') !== -1 && html.indexOf('<p>Gamma delta YY</p>') !== -1 && insCount(html) === 1 && html.indexOf('ZZ') !== -1;
        return { pass: noneOpen && noneChange && open && both, notes: JSON.stringify({ noneOpen, noneChange, open, both, html }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_bar_resolves_a_last_block_marked_as_a_suggestion',
    description: "Dernier bloc du document suggéré en suppression : « Refuser » le rend et « Accepter » le retire, sans erreur de la lib (contournement du dernier nœud) et sans paragraphe-tampon laissé derrière",
    run: async (h) => {
      try {
        const out = {};
        for (const [name, button, expected] of [['reject', 'reject', '<p>Un</p><p>Dernier</p>'], ['accept', 'accept', '<p>Un</p>']]) {
          await h.resetEditor();
          await disableTrackChangesIfOn(h);
          Editor.setHTML('<p>Un</p><del data-id="5"><p>Dernier</p></del>');
          await h.sleep(250);
          const lastMarked = EditorCore.getEditor().state.doc.lastChild.marks.some(m => m.type.name === 'deletion');
          await caretIn(h, 'Dernier', 3);
          await pressBarButton(h, button);
          out[name] = lastMarked && Editor.getHTML() === expected && !Editor.hasPendingTrackedChanges();
        }
        return { pass: out.reject && out.accept, notes: JSON.stringify(out) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  // === Lecture : le document comme si toutes les suggestions étaient acceptées (demande d'Antoine du 04/10) ===
  // « En mode lecture afficher comme si toutes les modifications étaient acceptées, avec juste un léger changement de couleur là où des modifs sont présentes. » La Lecture retouche le HTML qu'elle
  // reçoit (js/track-changes.js:acceptedView, appelée par js/reader-mode.js:renderRecord) : le résultat doit être EXACTEMENT celui de « Tout accepter » (comparé ici, cas par cas, au vrai
  // résultat de la lib), la teinte étant la seule différence voulue. Les deux sources de HTML y passent : editor.getHTML() et js/comments.js:buildReaderHtml (Lecture avec commentaires).
  // HTML comparable : la teinte et les repères de position déroulés, les U+200B (repères de saut de paragraphe, que la lib laisse parfois devant un texte) retirés, les mises en forme voisines identiques réunies.
  function comparableHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = HtmlSanitize.clean(html);
    root.querySelectorAll('span.pp-tc-changed, span[data-pp-pos]').forEach(span => span.replaceWith(...span.childNodes));
    root.querySelectorAll('.pp-tc-changed').forEach(el => { el.classList.remove('pp-tc-changed'); if (!el.getAttribute('class')) el.removeAttribute('class'); });
    root.querySelectorAll('[data-pp-atom]').forEach(el => el.removeAttribute('data-pp-atom'));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(text => { text.data = text.data.split('​').join(''); });
    root.normalize();
    for (let merged = true; merged;) {
      merged = false;
      for (const el of Array.from(root.querySelectorAll('strong, em, u, s, code, sub, sup, a, span'))) {
        const next = el.nextSibling;
        if (el.parentNode && next && next.nodeType === 1 && next.tagName === el.tagName && el.cloneNode(false).outerHTML === next.cloneNode(false).outerHTML) {
          while (next.firstChild) el.appendChild(next.firstChild);
          next.remove();
          root.normalize();
          merged = true;
          break;
        }
      }
    }
    return root.innerHTML;
  }
  const SUGGESTION_LEFTOVERS = 'ins[data-id], del[data-id], span[data-type="modification"], [data-tc-insertion], [data-tc-deletion], [data-tc-modification]';
  // Ce que la Lecture fait d'un HTML : la vue « comme acceptée », sa teinte et ce qui reste du suivi (rien).
  function acceptedViewOf(html) {
    const root = document.createElement('div');
    root.innerHTML = HtmlSanitize.clean(html);
    TrackChanges.acceptedView(root);
    return { html: comparableHtml(root.innerHTML), tinted: root.querySelectorAll('.pp-tc-changed').length, leftovers: root.querySelectorAll(SUGGESTION_LEFTOVERS).length };
  }
  const deleteSelection = async h => { document.execCommand('delete'); await h.sleep(120); };
  // Une touche pressée comme au clavier : ProseMirror lit l'évènement keydown et passe par les raccourcis de l'éditeur (Entrée coupe le bloc, Retour arrière le rejoint).
  const press = async (h, key) => {
    const keyCode = { Enter: 13, Backspace: 8 }[key];
    EditorCore.getEditor().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
    await h.sleep(120);
  };
  const readingScenarios = [
    ['une insertion', '<p>Alpha beta</p>', async h => { await caretIn(h, 'Alpha beta', 10); await h.typeText(' XX'); }, true],
    ['un mot supprimé entre deux espaces (une seule espace reste)', '<p>Garder retirer fin</p>', async h => {
      await selectDoc(h, textPos('retirer', 0), textPos('retirer', 7)); await deleteSelection(h);
    }, false],
    ['un remplacement', '<p>Un mot à changer ici</p>', async h => {
      await selectDoc(h, textPos('changer', 0), textPos('changer', 7)); document.execCommand('insertText', false, 'nouveau'); await h.sleep(120);
    }, true],
    ['une suppression à cheval sur deux paragraphes', '<p>Alpha beta</p><p>Gamma delta</p><p>Epsilon</p>', async h => {
      await selectDoc(h, textPos('beta', 0), textPos('Gamma', 5)); await deleteSelection(h);
    }, false],
    ['une suppression sur trois paragraphes', '<p>Alpha beta</p><p>Gamma</p><p>Epsilon zeta</p><p>Fin</p>', async h => {
      await selectDoc(h, textPos('beta', 0), textPos('Epsilon', 7)); await deleteSelection(h);
    }, false],
    ['une suppression à cheval sur deux items de liste', '<ul><li><p>Un deux</p></li><li><p>Trois quatre</p></li><li><p>Cinq</p></li></ul>', async h => {
      await selectDoc(h, textPos('deux', 0), textPos('Trois', 5)); await deleteSelection(h);
    }, false],
    ['Entrée au milieu d\'un paragraphe, puis du texte', '<p>Alpha beta</p><p>Fin</p>', async h => { await caretIn(h, 'Alpha beta', 5); await press(h, 'Enter'); await h.typeText('NEW'); }, true],
    ['Retour arrière au début d\'un paragraphe', '<p>Alpha</p><p>Beta</p>', async h => { await caretIn(h, 'Beta', 0); await press(h, 'Backspace'); }, false],
    ['un item de liste ajouté', '<ul><li><p>Un</p></li><li><p>Deux</p></li></ul>', async h => { await caretIn(h, 'Deux', 4); await press(h, 'Enter'); await h.typeText('Trois'); }, true],
    ['un texte mis en gras (suppression + insertion de même id)', '<p>Un mot important ici</p>', async h => {
      await selectDoc(h, textPos('important', 0), textPos('important', 9)); EditorCore.getEditor().commands.toggleBold(); await h.sleep(120);
    }, true],
    ['un alignement changé (marque sur le bloc)', '<p>Un</p><p>Aligné</p>', async h => { await caretIn(h, 'Aligné', 2); EditorCore.getEditor().commands.setTextAlign('right'); await h.sleep(120); }, true],
    ['une insertion dans un mot en gras', '<p>Un <strong>mot gras</strong> ici</p>', async h => { await caretIn(h, 'mot gras', 3); await h.typeText('XY'); }, true],
    ['deux suppressions séparées par une espace', '<p>a b c d</p>', async h => {
      await selectDoc(h, textPos('a b c d', 2), textPos('a b c d', 3)); await deleteSelection(h);
      await selectDoc(h, textPos(' c d', 1), textPos(' c d', 2)); await deleteSelection(h);
    }, false],
  ];
  const WIDTHS = '<table><tbody><tr><td colwidth="100"><p>a1</p></td><td colwidth="150"><p>b1</p></td><td colwidth="80"><p>c1</p></td></tr><tr><td colwidth="100"><p>a2</p></td><td colwidth="150"><p>b2</p></td><td colwidth="80"><p>c2</p></td></tr></tbody></table><p>fin</p>';
  const MERGED = '<table><tbody><tr><td colspan="2"><p>ab</p></td><td><p>c1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td><td><p>c2</p></td></tr></tbody></table><p>fin</p>';
  const THREE_ROWS = '<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr><tr><td><p>a3</p></td><td><p>b3</p></td></tr></tbody></table><p>fin</p>';
  const tableScenarios = [
    ['une colonne ajoutée (les largeurs restent)', WIDTHS, 'b1', 'col-after', true],
    ['une colonne supprimée (la largeur du tableau suit)', WIDTHS, 'b1', 'col-del', false],
    ['la première colonne supprimée', WIDTHS, 'a1', 'col-del', false],
    ['une colonne supprimée à travers une cellule fusionnée', MERGED, 'b2', 'col-del', false],
    ['une colonne ajoutée à travers une cellule fusionnée', MERGED, 'b2', 'col-before', true],
    ['une ligne ajoutée', THREE_ROWS, 'a2', 'row-after', true],
    ['la première ligne supprimée', THREE_ROWS, 'a1', 'row-del', false],
  ];
  // Une même construction, vue de la Lecture par les deux HTML qu'elle reçoit, puis comparée à ce que « Tout accepter » donne vraiment.
  async function readingAgainstAcceptAll(h, name, tinted) {
    const pending = Editor.getHTML();
    const fromEditor = acceptedViewOf(pending);
    const fromComments = acceptedViewOf(await Comments.buildReaderHtml());
    EditorCore.getEditor().chain().focus().acceptAllSuggestionsChunked().run();
    await h.sleep(200);
    const real = comparableHtml(Editor.getHTML());
    const same = fromEditor.html === real && fromComments.html === real;
    const clean = fromEditor.leftovers === 0 && fromComments.leftovers === 0;
    const tint = !tinted || (fromEditor.tinted > 0 && fromComments.tinted > 0);
    return same && clean && tint ? null : { name, same, clean, tint, pending: pending.slice(0, 900), view: fromEditor.html.slice(0, 900), viewComments: fromComments.html.slice(0, 900), real: real.slice(0, 900) };
  }

  cases.push({
    id: 'trackchanges_reading_view_equals_accept_all_on_text_edits',
    description: "Le document que la Lecture montre (js/track-changes.js:acceptedView) est exactement celui que « Tout accepter » donne, pour treize façons de modifier du texte : insertion, mot supprimé entre deux espaces (une seule reste), remplacement, suppression sur deux ou trois paragraphes ou sur deux items de liste, Entrée, Retour arrière, item ajouté, gras, alignement - depuis le HTML de l'éditeur comme depuis celui de la Lecture avec commentaires - sans <ins>, <del> ni marque de suivi, avec de la teinte là où du texte est ajouté ou une mise en forme change.",
    run: async (h) => {
      try {
        const failures = [];
        for (const [name, html, build, tinted] of readingScenarios) {
          await documentWithInsertions(h, html, []);
          await build(h);
          const failure = await readingAgainstAcceptAll(h, name, tinted);
          if (failure) failures.push(failure);
        }
        return { pass: failures.length === 0, notes: failures.length ? JSON.stringify(failures) : readingScenarios.length + ' constructions identiques à « Tout accepter »' };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_reading_view_equals_accept_all_on_table_columns_and_rows',
    description: "Colonnes et lignes suivies : la Lecture montre le tableau tel que « Tout accepter » le laisse - cases, colonnes (les <col> et la largeur du tableau refaits d'après la première ligne, comme Tiptap), lignes, cases fusionnées - depuis le HTML de l'éditeur comme depuis celui de la Lecture avec commentaires (dont le sérialiseur écrit maintenant la marque en attribut de la case, sinon l'analyseur HTML sortait la case de son tableau), avec de la teinte sur ce qui est ajouté.",
    run: async (h) => {
      try {
        const failures = [];
        for (const [name, html, cell, action, tinted] of tableScenarios) {
          await loadTable(h, html, cell, true);
          await pressTableButton(h, action);
          const failure = await readingAgainstAcceptAll(h, name, tinted);
          if (failure) failures.push(failure);
        }
        return { pass: failures.length === 0, notes: failures.length ? JSON.stringify(failures) : tableScenarios.length + ' tableaux identiques à « Tout accepter »' };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_reading_renders_the_accepted_document_with_a_light_tint_in_light_and_dark',
    description: "Dans la vraie Lecture (ReaderMode.render, aussi quand le HTML vient d'une fonction comme pour un macro-modèle) : plus d'<ins>, de <del> ni de marque de suivi, le texte supprimé a disparu, le texte ajouté a un fond vert pâle (rgb(229, 246, 238), le même en clair et en sombre, texte à 4,5:1 au moins) SANS changer la couleur du texte ni le souligner, une case ajoutée prend la teinte même avec un fond posé en ligne, et le document de l'éditeur garde ses suggestions (rien n'est accepté pour de bon).",
    run: async (h) => {
      const root = document.documentElement;
      const themeBefore = root.getAttribute('data-theme');
      const containers = [document.getElementById('reader-container'), document.getElementById('editor-container')];
      const displayBefore = containers.map(el => el.style.display);
      try {
        await h.resetEditor();
        await disableTrackChangesIfOn(h);
        const pending = '<p>Début <ins data-id="1">ajouté</ins> milieu <del data-id="2">retiré</del> fin.</p><p>Texte normal.</p>'
          + '<p>Coupé<ins data-id="3">​</ins></p><p><ins data-id="3">​suite</ins> du texte</p>'
          + '<span data-type="modification" data-id="4" type="attr" attrname="textAlign" newvalue="right"><p style="text-align: right;">Aligné</p></span>'
          + '<table><tbody><tr><td><p>A</p></td><td data-tc-deletion="5"><p>B</p></td><td data-tc-insertion="6" style="background-color: #fff2cc;"><p>N</p></td></tr></tbody></table>';
        Editor.setHTML(pending);
        await h.sleep(250);
        const suggestionsKept = () => /<ins |<del /.test(Editor.getHTML());
        const out = {};
        for (const [label, source] of [['html', pending], ['fonction', () => pending]]) {
          const content = await h.renderReaderMode(source, null);
          out[label] = {
            leftovers: content.querySelectorAll(SUGGESTION_LEFTOVERS).length,
            text: content.textContent.replace(/​/g, ''),
          };
        }
        const content = document.querySelector('#reader-container .reader-content');
        const plain = Array.from(content.querySelectorAll('p')).find(p => p.textContent === 'Texte normal.');
        const inserted = content.querySelector('span.pp-tc-changed');
        const cell = content.querySelector('td.pp-tc-changed');
        const luminance = css => {
          const [r, g, b] = css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
        const byTheme = {};
        for (const theme of ['light', 'dark']) {
          root.setAttribute('data-theme', theme);
          const cs = getComputedStyle(inserted);
          byTheme[theme] = { background: cs.backgroundColor, color: cs.color, sameColor: cs.color === getComputedStyle(plain).color, plainDecoration: cs.textDecorationLine === 'none', ratio: Math.round(ratio(cs.color, cs.backgroundColor) * 100) / 100, cell: getComputedStyle(cell).backgroundColor };
        }
        const tinted = Array.from(content.querySelectorAll('.pp-tc-changed')).map(el => el.tagName + ':' + el.textContent);
        const textOk = out.html.text.indexOf('retiré') === -1 && out.html.text.indexOf('Début ajouté milieu fin.') !== -1 && out.html.text.indexOf('Coupé') !== -1 && out.html.text.indexOf('suite du texte') !== -1 && out.html.text.indexOf('B') === -1;
        const gone = out.html.leftovers === 0 && out.fonction.leftovers === 0 && out.fonction.text === out.html.text;
        const tint = ['light', 'dark'].every(theme => byTheme[theme].background === 'rgb(229, 246, 238)' && byTheme[theme].cell === 'rgb(229, 246, 238)' && byTheme[theme].sameColor && byTheme[theme].plainDecoration && byTheme[theme].ratio >= 4.5);
        const alignTinted = tinted.some(item => item.startsWith('P:Aligné'));
        return { pass: textOk && gone && tint && alignTinted && suggestionsKept(), notes: JSON.stringify({ textOk, gone, tint, alignTinted, suggestionsKept: suggestionsKept(), byTheme, tinted, out }) };
      } finally {
        if (themeBefore === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', themeBefore);
        containers.forEach((el, i) => { el.style.display = displayBefore[i]; });
      }
    },
  });

  cases.push({
    id: 'trackchanges_reading_with_comments_keeps_comment_positions_after_the_accepted_view',
    description: "Lecture avec commentaires (js/comments.js:buildReaderHtml) : le texte supprimé a disparu et les repères de position (data-pp-pos) désignent toujours le bon texte du document - y compris quand la vue retire une espace en trop ou le U+200B d'un saut de paragraphe au début d'un texte - sinon un commentaire serait posé à côté de ce qui est sélectionné.",
    run: async (h) => {
      try {
        await documentWithInsertions(h, '<p>Garder retirer fin</p><p>Alpha beta</p>', []);
        await selectDoc(h, textPos('retirer', 0), textPos('retirer', 7)); await deleteSelection(h);
        await caretIn(h, 'Alpha beta', 5); await press(h, 'Enter'); await h.typeText('NEW');
        const html = await Comments.buildReaderHtml();
        const root = document.createElement('div');
        root.innerHTML = HtmlSanitize.clean(html);
        TrackChanges.acceptedView(root);
        const doc = EditorCore.getEditor().state.doc;
        const spans = Array.from(root.querySelectorAll('span[data-pp-pos]'));
        const wrong = spans.filter(span => doc.textBetween(Number(span.getAttribute('data-pp-pos').split(':')[1]), Number(span.getAttribute('data-pp-pos').split(':')[1]) + span.textContent.length) !== span.textContent);
        const trimmed = spans.some(span => span.textContent === 'fin') && spans.some(span => span.textContent === 'NEW');
        return { pass: spans.length > 0 && wrong.length === 0 && trimmed && root.textContent.indexOf('retirer') === -1, notes: JSON.stringify({ spans: spans.length, wrong: wrong.map(s => s.getAttribute('data-pp-pos') + ':' + s.textContent), trimmed, text: root.textContent }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_reading_survives_a_failing_accepted_view',
    description: "Si la vue « comme acceptée » échoue en route (js/reader-mode.js:renderRecord), la Lecture ne reste ni vide ni à moitié transformée : elle montre le document tel qu'avant, suggestions visibles, et l'erreur va à la console.",
    run: async (h) => {
      const original = TrackChanges.acceptedView;
      const consoleError = console.error;
      const logged = [];
      const containers = [document.getElementById('reader-container'), document.getElementById('editor-container')];
      const displayBefore = containers.map(el => el.style.display);
      try {
        await h.resetEditor();
        await disableTrackChangesIfOn(h);
        TrackChanges.acceptedView = (root) => { root.innerHTML = ''; throw new Error('vue impossible'); };
        console.error = (...args) => { logged.push(String(args[0])); };
        const content = await h.renderReaderMode('<p>Début <ins data-id="1">ajouté</ins> milieu <del data-id="2">retiré</del> fin.</p>', null);
        const kept = content.querySelectorAll('ins').length === 1 && content.querySelectorAll('del').length === 1 && content.textContent.indexOf('Début ajouté milieu retiré fin.') !== -1;
        const reported = logged.filter(line => line.indexOf('vue « comme acceptée » impossible') !== -1).length === 1;
        return { pass: kept && reported, notes: JSON.stringify({ kept, reported, logged, html: content.innerHTML.slice(0, 300) }) };
      } finally {
        TrackChanges.acceptedView = original;
        console.error = consoleError;
        containers.forEach((el, i) => { el.style.display = displayBefore[i]; });
      }
    },
  });

  // === Exports : le PDF, le Word et l'Excel sortent le document comme la Lecture, sans teinte (choix d'Antoine, 04/10) ===
  // Carte « Faire sortir le PDF, le Word et l'Excel comme la Lecture, modifications acceptées ? » : « Acceptées, sans teinte ». Les trois exports lisent le HTML du modèle par ReaderMode.preview
  // (js/reader-mode.js:expandedWrapper), qui le passe par TrackChanges.acceptedView sans teinte : le texte supprimé n'y est plus (il y sortait barré), le texte ajouté s'écrit comme le reste, et le
  // modèle garde ses suggestions en attente. Les en-têtes et pieds de page prennent le même chemin (js/export-common.js:resolveZone) ; ceux de la Lecture aussi (resolveHeaderFooterZone), avec la teinte.
  const EXPORT_RECORD = { id: 1 };
  const exportedHtml = html => ReaderMode.preview(html, null, EXPORT_RECORD);
  const hasSuggestions = html => /<ins |<del |data-tc-|data-type="modification"/.test(html);
  // Supprimer une colonne à travers une cellule fusionnée : le bouton est grisé sous le suivi (js/floating-toolbars.js), rien n'est donc en attente ; l'export reste le même.
  const LOCKED_UNDER_TRACKING = new Set(['une colonne supprimée à travers une cellule fusionnée']);
  // Une même construction, exportée avec ses suggestions en attente, puis comparée à l'export du document que « Tout accepter » donne vraiment : pareil, et rien du suivi ni de la teinte ne reste.
  async function exportAgainstAcceptAll(h, name) {
    const pending = Editor.getHTML();
    const exported = await exportedHtml(pending);
    EditorCore.getEditor().chain().focus().acceptAllSuggestionsChunked().run();
    await h.sleep(200);
    const real = comparableHtml(await exportedHtml(Editor.getHTML()));
    const view = comparableHtml(exported);
    const holder = document.createElement('div');
    holder.innerHTML = exported;
    const clean = !/pp-tc-changed/.test(exported) && holder.querySelectorAll(SUGGESTION_LEFTOVERS).length === 0 && !holder.querySelector('ins, del');
    const pendingHadSuggestions = hasSuggestions(pending) || LOCKED_UNDER_TRACKING.has(name);
    return pendingHadSuggestions && view === real && clean ? null : { name, pendingHadSuggestions, same: view === real, clean, pending: pending.slice(0, 900), view: view.slice(0, 900), real: real.slice(0, 900) };
  }
  const EXPORT_PENDING = '<p>Début <ins data-id="1">ajouté</ins> milieu <del data-id="2">retiré</del> fin.</p>'
    + '<p>Coupé<ins data-id="3">​</ins></p><p><ins data-id="3">​suite</ins> du texte</p>'
    + '<span data-type="modification" data-id="4" type="attr" attrname="textAlign" newvalue="right"><p style="text-align: right;">Aligné</p></span>'
    + '<table><tbody><tr><td><p>A</p></td><td data-tc-deletion="5"><p>B</p></td><td data-tc-insertion="6" style="background-color: #fff2cc;"><p>N</p></td></tr></tbody></table>';
  const EXPORT_HEADER_FOOTER = {
    enabled: true, differentFirstPage: false,
    header: { default: '<p>En-tête <del data-id="9">brouillon</del><ins data-id="10">final</ins></p>', first: '' },
    footer: { default: '<p>Pied <ins data-id="11">validé</ins> <del data-id="12">provisoire</del></p>', first: '' },
  };
  const compact = text => String(text).replace(/\s+/g, '');
  const meaningfulTexts = paragraphs => paragraphs.map(p => p.text).filter(text => text.trim() !== '');

  cases.push({
    id: 'trackchanges_exports_read_the_document_as_accepted_like_accept_all',
    description: "Ce que le PDF, le Word et l'Excel lisent du modèle (ReaderMode.preview) est exactement le document que « Tout accepter » donne, pour les treize façons de modifier du texte et les sept tableaux de la Lecture - sans <ins>, <del>, marque de suivi ni teinte (.pp-tc-changed) : le texte supprimé n'y est plus, le texte ajouté s'y écrit comme le reste.",
    run: async (h) => {
      try {
        const failures = [];
        for (const [name, html, build] of readingScenarios) {
          await documentWithInsertions(h, html, []);
          await build(h);
          const failure = await exportAgainstAcceptAll(h, name);
          if (failure) failures.push(failure);
        }
        for (const [name, html, cell, action] of tableScenarios) {
          await loadTable(h, html, cell, true);
          await pressTableButton(h, action);
          const failure = await exportAgainstAcceptAll(h, name);
          if (failure) failures.push(failure);
        }
        return { pass: failures.length === 0, notes: failures.length ? JSON.stringify(failures) : (readingScenarios.length + tableScenarios.length) + ' exports identiques à « Tout accepter », sans teinte' };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_exports_word_comes_out_as_accepted_without_strike_or_tint',
    description: "Le .docx d'un modèle aux suggestions en attente (texte ajouté, texte supprimé, saut de paragraphe, alignement changé, case supprimée et case ajoutée) et d'en-têtes et de pieds de page qui en ont aussi : le texte supprimé n'est écrit nulle part, aucun passage n'est barré, aucun fond de teinte (E5F6EE) n'est posé, le texte ajouté est écrit comme le reste - et le modèle de l'éditeur garde ses suggestions.",
    run: async (h) => {
      try {
        await h.resetEditor();
        await disableTrackChangesIfOn(h);
        Editor.setHTML(EXPORT_PENDING);
        await h.sleep(250);
        const pending = Editor.getHTML();
        const docx = await h.exportDocxParts(pending, EXPORT_HEADER_FOOTER);
        const body = meaningfulTexts(h.docxParagraphs(docx.doc));
        const header = h.docxParagraphs(docx.part('word/header1.xml'));
        const footer = h.docxParagraphs(docx.part('word/footer1.xml'));
        const everyPart = Object.keys(docx.parts).map(name => docx.parts[name]).join('\n');
        const struck = [docx.doc, docx.part('word/header1.xml'), docx.part('word/footer1.xml')].some(xml => h.docxParagraphs(xml).some(p => p.runs.some(r => r.strike)));
        const checks = {
          body: body.join('|') === 'Début ajouté milieu fin.|Coupé|suite du texte|Aligné|A|N',
          header: meaningfulTexts(header).join('|') === 'En-tête final',
          footer: compact(meaningfulTexts(footer).join('|')) === compact('Pied validé'),
          deletedTextGone: !/retiré|brouillon|provisoire/.test(everyPart),
          nothingStruck: !struck,
          noTint: !/E5F6EE/i.test(everyPart),
          templateKeepsSuggestions: hasSuggestions(Editor.getHTML()) && Editor.getHTML() === pending,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, body, header: meaningfulTexts(header), footer: meaningfulTexts(footer) }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_exports_pdf_comes_out_as_accepted_without_strike_or_tint',
    description: "Le PDF d'un modèle aux suggestions en attente et d'en-têtes et de pieds de page qui en ont aussi, relu dans le fichier (pdf.js) : le texte supprimé n'est peint nulle part, le texte ajouté l'est comme le reste (une seule espace entre les mots quand une suppression retire un mot entouré d'espaces), rien n'est barré (lineThrough) ni teinté.",
    run: async (h) => {
      try {
        await h.resetEditor();
        await disableTrackChangesIfOn(h);
        Editor.setHTML(EXPORT_PENDING);
        await h.sleep(250);
        const pdf = await h.exportPdfContent(Editor.getHTML(), EXPORT_HEADER_FOOTER);
        const truth = await h.extractPdfGroundTruth(pdf.base64);
        const painted = truth.pages.map(page => page.textItems.map(item => item.str).join(' ')).join(' ');
        const zone = fn => { try { return typeof fn === 'function' ? fn(1, 1) : fn; } catch (e) { return null; } };
        const definition = JSON.stringify([pdf.docDefinition.content, zone(pdf.docDefinition.header), zone(pdf.docDefinition.footer)]);
        const checks = {
          bodyPainted: compact(painted).includes(compact('Début ajouté milieu fin.')) && compact(painted).includes(compact('suite du texte')),
          headerFooterPainted: compact(painted).includes('En-têtefinal') && compact(painted).includes('Piedvalidé'),
          deletedTextGone: !/retiré|brouillon|provisoire/.test(painted),
          deletedCellGone: !/\bB\b/.test(painted),
          nothingStruck: definition.indexOf('lineThrough') === -1,
          noTint: !/e5f6ee/i.test(definition),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, painted: painted.slice(0, 400) }) };
      } finally { await disableTrackChangesIfOn(h); }
    },
  });

  cases.push({
    id: 'trackchanges_exports_header_footer_zones_are_resolved_as_accepted',
    description: "Les quatre fragments d'en-tête et de pied que le PDF et le Word reçoivent (ExportCommon.resolveHeaderFooterVariables) sont déjà « comme acceptés » : ni <ins>, <del> ni teinte, le texte supprimé n'y est plus.",
    run: async (h) => {
      await h.resetEditor();
      const hf = {
        enabled: true, differentFirstPage: true,
        header: { default: EXPORT_HEADER_FOOTER.header.default, first: '<p>Première <del data-id="13">ancienne</del><ins data-id="14">page</ins></p>' },
        footer: { default: EXPORT_HEADER_FOOTER.footer.default, first: '<p><del data-id="15">Rien</del></p>' },
      };
      const zones = await ExportCommon.resolveHeaderFooterVariables(hf, null, EXPORT_RECORD);
      const text = html => { const box = document.createElement('div'); box.innerHTML = html || ''; return { text: box.textContent.replace(/\s+/g, ' ').trim(), leftovers: box.querySelectorAll('ins, del, .pp-tc-changed').length }; };
      const read = { headerDefault: text(zones.header.default), headerFirst: text(zones.header.first), footerDefault: text(zones.footer.default), footerFirst: text(zones.footer.first) };
      const pass = read.headerDefault.text === 'En-tête final' && read.headerFirst.text === 'Première page' && read.footerDefault.text === 'Pied validé' && read.footerFirst.text === ''
        && Object.values(read).every(zone => zone.leftovers === 0);
      return { pass, notes: JSON.stringify(read) };
    },
  });

  cases.push({
    id: 'trackchanges_reading_header_footer_zones_show_the_accepted_text_with_the_tint',
    description: "Les en-têtes et les pieds de page de la Lecture (l'espaceur du bord de la feuille) montrent aussi leurs suggestions comme acceptées : le texte supprimé n'y est plus, ni <ins> ni <del>, et ce qui est ajouté a le fond vert pâle de la Lecture (rgb(229, 246, 238)), texte inchangé.",
    run: async (h) => {
      const containers = [document.getElementById('reader-container'), document.getElementById('editor-container')];
      const displayBefore = containers.map(el => el.style.display);
      try {
        await h.resetEditor();
        await disableTrackChangesIfOn(h);
        h.setA4Preview(true);
        await h.renderReaderMode('<p>Corps</p>', EXPORT_HEADER_FOOTER);
        const zoneOf = selector => {
          const el = document.querySelector('#reader-container ' + selector);
          if (!el) return null;
          const tinted = el.querySelector('.pp-tc-changed');
          return { text: el.textContent.replace(/\s+/g, ' ').trim(), leftovers: el.querySelectorAll('ins, del').length, tinted: tinted ? tinted.textContent : null, background: tinted ? getComputedStyle(tinted).backgroundColor : null };
        };
        const header = zoneOf('.v2-page-edge-top');
        const footer = zoneOf('.v2-page-edge-bottom');
        const pass = !!header && !!footer && header.text === 'En-tête final' && footer.text === 'Pied validé' && header.leftovers === 0 && footer.leftovers === 0
          && header.tinted === 'final' && footer.tinted === 'validé' && header.background === 'rgb(229, 246, 238)' && footer.background === 'rgb(229, 246, 238)';
        return { pass, notes: JSON.stringify({ header, footer }) };
      } finally {
        h.setA4Preview(false);
        containers.forEach((el, i) => { el.style.display = displayBefore[i]; });
      }
    },
  });

  cases.push({
    id: 'trackchanges_macro_template_excluded_from_suivi',
    description: "Un macro-modèle (TypeModele='macro') n'a jamais de suiviModifications exploitable (null, jamais un objet) et verrouille les 3 boutons de suivi dans la barre - son JSON de composition ne passe jamais par l'éditeur suivi",
    run: async (h) => {
      await h.resetEditor();
      await disableTrackChangesIfOn(h);
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      const nameInput = document.getElementById('macro-editor-name');
      if (!nameInput) return { pass: false, notes: 'modale macro introuvable après clic sur "Nouveau macro-modèle"' };
      nameInput.value = 'Macro test suivi';
      document.getElementById('macro-editor-save').click();
      await h.sleep(300);
      const id = Templates.getCurrentId();
      const cached = Templates.getCached().find(t => String(t.id) === String(id));
      const suiviNull = !!cached && cached.suiviModifications === null;
      const html = Editor.getHTML();
      const editorUntouched = html.indexOf('slots') === -1 && html.indexOf('macroSlots') === -1;
      const locked = toggleBtn().classList.contains('v2-hf-locked')
        && acceptBtn().classList.contains('v2-hf-locked')
        && rejectBtn().classList.contains('v2-hf-locked');
      return {
        pass: suiviNull && editorUntouched && locked,
        notes: 'suiviModifications=' + JSON.stringify(cached && cached.suiviModifications) + ', editorUntouched=' + editorUntouched + ', verrouillé=' + locked,
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.trackChanges = cases;
})();
