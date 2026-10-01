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
