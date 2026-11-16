// Suite "lockBubble" - la bulle d'une icône grisée et son constat (js/lock-bubble.js, js/lock-diagnostic.js ; js/lock-reasons.js pour la cause et son genre). Demande du 12/11, étude du 13/11 : un clic sur une icône grisée ouvre sous elle
// sa raison ; « En savoir plus » déplie le constat lu dans le document (✓ écartée, ✕ c'est celle-ci, le geste, ce que le widget voit) ; « Copier le constat » donne le texte du forum, « Masquer les noms » remplace les noms de tables,
// de colonnes et de modèle par Table 1, Colonne 1… dans ce texte seul. Ces cas jouent le module, les jetons de noms, la bulle des grisés de la barre du haut (email, Lecture et son bouton, grille) et son clavier ; la vraie souris à 700 x 400,
// la Boucle d'une variable et les barres flottantes : le script Node verify-lock-bubble-mouse.mjs (groupe lockBubbleMouse).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const byId = id => document.getElementById(id);
  const bubble = () => document.querySelector('.pp-lockbubble');
  const text = selector => { const node = bubble() && bubble().querySelector(selector); return node ? node.textContent.trim() : ''; };
  const checks = () => Array.from(document.querySelectorAll('.pp-lockbubble-check')).map(li => ({ no: li.classList.contains('is-no'), text: li.textContent.replace(/\s+/g, ' ').trim() }));
  const closeAll = () => { LockBubble.close(); };

  async function goToNewDocument(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(250);
  }
  async function goToNewEmail(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-email');
    await sleep(250);
  }
  async function goToNewGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(300);
  }
  cases.push({
    id: 'lock_bubble_module_keeps_the_cause_and_its_kind_on_the_control',
    description: 'LockReasons : la cause qui parle et son genre sont posés sur le contrôle (`data-pp-lock-cause`, `data-pp-lock-kind`) et lus par `detailOf` ; la cause générale l\'emporte avec son genre, et tout s\'efface au dégrisé',
    run: async () => {
      const el = document.createElement('button');
      document.body.appendChild(el);
      const read = () => ({ cause: el.getAttribute('data-pp-lock-cause'), kind: el.getAttribute('data-pp-lock-kind'), detail: LockReasons.detailOf(el) });
      const steps = {};
      try {
        LockReasons.set(el, 'mode', 'raison mode', 'email');
        steps.mode = read();
        LockReasons.set(el, 'access', 'raison droits', 'lock.readOnly');
        steps.access = read();
        LockReasons.set(el, 'access', '');
        steps.backToMode = read();
        LockReasons.set(el, 'mode', '');
        steps.none = read();
        LockReasons.set(el, 'state', 'raison état');
        steps.noKind = read();
        LockReasons.set(el, 'state', '');
      } finally { el.remove(); }
      const pass = steps.mode.cause === 'mode' && steps.mode.kind === 'email' && steps.mode.detail.reason === 'raison mode'
        && steps.access.cause === 'access' && steps.access.kind === 'lock.readOnly' && steps.access.detail.cause === 'access'
        && steps.backToMode.cause === 'mode' && steps.backToMode.kind === 'email'
        && steps.none.cause === null && steps.none.kind === null && steps.none.detail === null
        && steps.noKind.cause === 'state' && steps.noKind.kind === null;
      return { pass, notes: JSON.stringify(steps) };
    },
  });

  cases.push({
    id: 'lock_bubble_names_are_tokens_masked_the_same_way_in_the_whole_text',
    description: 'LockDiagnostic : un nom de table, de colonne ou de modèle passe en jeton ; à l\'écran le jeton est le nom, et dans le texte copié « Masquer les noms » le remplace par Table 1, Colonne 1… - le même nom garde le même alias de la première à la dernière ligne, le modèle devient « Modèle », le texte dit qu\'il est masqué, et rien d\'autre que les noms ne change',
    run: async () => {
      const { tableName, columnName, templateName } = LockDiagnostic.tokens;
      const spec = {
        why: 'Zone répétée pour « ' + tableName('Lignes') + ' », variable ' + tableName('Factures') + '.' + columnName('Numero'),
        checks: [{ s: 'ok', t: 'Colonne ' + columnName('Numero'), d: tableName('Factures') + ' · Texte' }, { s: 'no', t: 'Rattachée à ' + tableName('Lignes'), d: 'aucune' }],
        fix: 'Ajoutez à ' + tableName('Factures') + ' une colonne vers ' + tableName('Lignes') + '.',
        context: [['Table de la page', tableName('Factures')], ['Modèle', '« ' + templateName('Facture client') + ' »'], ['Colonnes de ' + tableName('Factures'), columnName('Numero') + ', ' + columnName('Client')]],
      };
      const plain = LockDiagnostic.report(spec, { name: 'Boucle', why: spec.why, mask: false });
      const masked = LockDiagnostic.report(spec, { name: 'Boucle', why: spec.why, mask: true });
      const screenText = LockDiagnostic.resolve(spec.why, false);
      const names = ['Lignes', 'Factures', 'Numero', 'Client', 'Facture client'];
      const plainKeepsNames = names.every(name => plain.indexOf(name) !== -1);
      const maskedLeaks = names.filter(name => masked.indexOf(name) !== -1);
      const aliasLines = masked.split('\n').filter(line => /Table 1/.test(line)).length;
      const pass = screenText === 'Zone répétée pour « Lignes », variable Factures.Numero'
        && plainKeepsNames && maskedLeaks.length === 0
        && /Table 1/.test(masked) && /Table 2/.test(masked) && !/Table 3/.test(masked) && /Colonne 1/.test(masked) && /Colonne 2/.test(masked) && /« Modèle »/.test(masked)
        && aliasLines >= 3 && /Raison : Zone répétée pour « Table 1 »/.test(masked) && masked.indexOf('Table 2.Colonne 1') !== -1
        && /Aucun contenu de cellule/.test(plain) && !/remplacés/.test(plain) && /remplacés/.test(masked)
        && /^\*\*Publipostage\+ \d+\.\d+\.\d+ : icône grisée « Boucle »\*\*/.test(plain)
        && /- ✓ Colonne Numero/.test(plain) && /- ✕ Rattachée à Lignes/.test(plain) && !/|/.test(plain + masked);
      return { pass, notes: JSON.stringify({ screenText, maskedLeaks, aliasLines, masked }) };
    },
  });

  cases.push({
    id: 'lock_bubble_email_press_opens_the_bubble_with_its_findings_and_the_forum_text',
    description: 'Un modèle email : un clic sur « Tableau » grisé ouvre sous lui la bulle (son nom, la raison de l\'info-bulle, « En savoir plus » replié) ; le document ne bouge pas ; « En savoir plus » liste droits ✓, mode Édition ✓ et « Ce modèle est un email » ✕, le geste et ce que le widget voit ; l\'icône reste grisée avec son info-bulle ; Échap ferme',
    run: async (h) => {
      await h.resetEditor();
      await goToNewEmail(h);
      closeAll();
      Editor.setHTML('<p>Bonjour</p>');
      await sleep(60);
      const docBefore = Editor.getHTML();
      const reason = I18n.t('lock.email');
      const button = byId('v2-btn-table');
      button.click();
      const open = !!bubble();
      const out = {
        open, name: text('.pp-lockbubble-name'), why: text('.pp-lockbubble-why'), more: text('.pp-lockbubble-more'), expandedAtFirst: byId('v2-btn-table') && bubble() && bubble().querySelector('.pp-lockbubble-more').getAttribute('aria-expanded'),
        diagHidden: !!bubble() && bubble().querySelector('.pp-lockbubble-diag').hidden, marked: button.getAttribute('data-pp-lock-open'), stillGrey: button.getAttribute('title') === reason && button.hasAttribute('data-pp-lock-blocks'),
      };
      bubble().querySelector('.pp-lockbubble-more').click();
      await sleep(40);
      out.checks = checks();
      out.fix = text('.pp-lockbubble-fix');
      out.context = text('.pp-lockbubble-ctx');
      out.footShown = !bubble().querySelector('.pp-lockbubble-foot').hidden;
      out.docUnchanged = Editor.getHTML() === docBefore;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.closedByEscape = !bubble() && !button.hasAttribute('data-pp-lock-open');
      await goToNewDocument(h);
      const pass = out.open && /^Insérer un tableau/.test(out.name) && out.why === reason && /En savoir plus/.test(out.more) && out.expandedAtFirst === 'false' && out.diagHidden && out.marked === '1' && out.stillGrey
        && out.checks.length === 3 && !out.checks[0].no && !out.checks[1].no && out.checks[2].no && /email/i.test(out.checks[2].text)
        && /Document/.test(out.fix) && /Publipostage\+/.test(out.context) && /email/.test(out.context) && /Édition/.test(out.context) && out.footShown && out.docUnchanged && out.closedByEscape;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_bubble_read_mode_offers_the_one_click_gesture',
    description: 'En mode Lecture, « Gras » grisé : la bulle dit les droits ✓, l\'accès ✓ et « le widget est en mode Lecture » ✕, écrit la ligne sélectionnée dans ce que le widget voit, et propose le bouton « Passer en mode Édition » ; ce bouton ferme la bulle et remet l\'Édition',
    run: async (h) => {
      await h.resetEditor();
      await goToNewDocument(h);
      closeAll();
      byId('btn-mode-read').click();
      await sleep(500);
      byId('v2-btn-bold').click();
      bubble().querySelector('.pp-lockbubble-more').click();
      await sleep(40);
      const out = { checks: checks(), action: text('.pp-lockbubble-act'), context: text('.pp-lockbubble-ctx'), why: text('.pp-lockbubble-why') };
      bubble().querySelector('.pp-lockbubble-act').click();
      await sleep(500);
      out.closed = !bubble();
      out.edit = byId('btn-mode-edit').classList.contains('active');
      const pass = out.checks.length === 3 && out.checks.filter(c => c.no).length === 1 && /Lecture/.test(out.checks.find(c => c.no).text) && out.action === I18n.t('lockBubble.fix.editMode')
        && /Lecture/.test(out.context) && out.why === I18n.t('lock.readMode') && out.closed && out.edit;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_bubble_grid_and_one_bubble_at_a_time',
    description: 'Une grille : l\'aperçu A4 grisé dit « Ce modèle est une grille » (✕) ; une seule bulle à la fois (un autre grisé remplace la première) ; un second clic sur le même contrôle la ferme ; une icône qui marche n\'ouvre rien',
    run: async (h) => {
      await h.resetEditor();
      await goToNewGrid(h);
      closeAll();
      const a4 = byId('v2-a4-toggle');
      a4.click();
      bubble().querySelector('.pp-lockbubble-more').click();
      await sleep(40);
      const out = { gridChecks: checks().filter(c => c.no).map(c => c.text) };
      out.firstName = text('.pp-lockbubble-name');
      const first = bubble();
      const other = byId('v2-btn-table');
      other.click();
      out.count = document.querySelectorAll('.pp-lockbubble').length;
      out.replaced = bubble() !== first && !a4.hasAttribute('data-pp-lock-open') && other.getAttribute('data-pp-lock-open') === '1';
      other.click();
      out.toggledOff = !bubble() && !other.hasAttribute('data-pp-lock-open');
      await goToNewDocument(h);
      closeAll();
      byId('v2-btn-undo').click();
      out.quietControl = !bubble();
      const pass = out.gridChecks.length === 1 && /grille/i.test(out.gridChecks[0]) && out.count === 1 && out.replaced && out.toggledOff && out.quietControl;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_bubble_is_text_only_closes_on_a_press_outside_and_keeps_focus_rules',
    description: 'La bulle ne pose que du texte (aucun balisage venu d\'un nom), se ferme à un appui hors d\'elle (pas à un appui dedans), et ouverte au clavier prend le focus (« En savoir plus ») que la fermeture par Échap rend à l\'icône',
    run: async (h) => {
      await h.resetEditor();
      await goToNewEmail(h);
      closeAll();
      const button = byId('v2-btn-bold');
      button.focus();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
      const out = { focusInside: !!bubble() && bubble().contains(document.activeElement), focusOn: document.activeElement && document.activeElement.className };
      bubble().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      out.stayedOnInsidePress = !!bubble();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.focusBack = document.activeElement === button && !bubble();
      button.click();
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      out.closedOutside = !bubble();
      // Un nom qui ressemble à du balisage reste un texte.
      LockBubble.openFor(button, { reason: '<img src=x onerror=window.__lockBubbleXss=1> raison' });
      out.noElementFromReason = !bubble().querySelector('.pp-lockbubble-why img') && /<img/.test(text('.pp-lockbubble-why')) && window.__lockBubbleXss === undefined;
      closeAll();
      await goToNewDocument(h);
      const pass = out.focusInside && /pp-lockbubble-more/.test(out.focusOn) && out.stayedOnInsidePress && out.focusBack && out.closedOutside && out.noElementFromReason;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'lock_bubble_en_says_the_findings_in_english',
    lang: 'en',
    description: 'La page qui démarre en anglais : la bulle d\'un grisé de l\'email, ses vérifications, son geste et son texte copié sont en anglais',
    run: async (h) => {
      await h.resetEditor();
      await goToNewEmail(h);
      closeAll();
      byId('v2-btn-table').click();
      bubble().querySelector('.pp-lockbubble-more').click();
      await sleep(40);
      const out = { more: text('.pp-lockbubble-more'), why: text('.pp-lockbubble-why'), checks: checks(), fix: text('.pp-lockbubble-fix'), copy: text('.pp-lockbubble-copy'), mask: text('.pp-lockbubble-mask'), ctx: text('.pp-lockbubble-ctx h4') };
      out.report = LockDiagnostic.report({ checks: [{ s: 'no', t: 'A' }], fix: 'B', context: [['C', 'D']] }, { name: 'Table', why: out.why, mask: false });
      closeAll();
      await goToNewDocument(h);
      const pass = I18n.getLang() === 'en' && /Learn more/.test(out.more) && /^Unavailable in an email template/.test(out.why) && out.checks.some(c => c.no && /This template is an email/.test(c.text))
        && /To enable it/.test(out.fix) && out.copy === 'Copy the findings' && out.mask === 'Hide names' && out.ctx === 'What the widget sees'
        && /^\*\*Publipostage\+ \d+\.\d+\.\d+: disabled icon “Table”\*\*/.test(out.report) && /Findings:/.test(out.report) && /Context:/.test(out.report);
      return { pass, notes: JSON.stringify(out) };
    },
  });
  // === Les barres du tableau et de l'image (js/lock-bar-causes.js, lot 2) : chaque raison de grisé a un constat, dans les deux langues, et ses textes sont complets ===
  const TABLE_DOC = '<table><tbody><tr><th><p>Produit</p></th><th><p>Quantité</p></th></tr><tr><td colspan="2"><p>Fusion</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table><p>Fin</p>';
  const textPos = (editor, word) => { let found = -1; editor.state.doc.descendants((node, pos) => { if (found === -1 && node.isText && node.text === word) found = pos + 1; }); return found; };
  const imagePos = editor => { let found = -1; editor.state.doc.descendants((node, pos) => { if (found === -1 && node.type.name === 'editorImage') found = pos; }); return found; };
  const unfinished = value => typeof value === 'string' && /\{[a-zA-Z]+\}|lockBubble\.|undefined|\[object|NaN/.test(value);
  const everyText = spec => [spec.fix, spec.why].concat((spec.checks || []).reduce((all, check) => all.concat([check.t, check.d]), []), (spec.context || []).reduce((all, row) => all.concat(row), []));
  async function everyBarKey(h) {
    await h.resetEditor();
    const editor = EditorCore.getEditor();
    const out = { keys: LockBarCauses.keys(), failures: [] };
    const IMAGE_KEY = /^(imgToolbar\.|caption\.image)/;
    Editor.setHTML(TABLE_DOC);
    await sleep(60);
    editor.commands.setTextSelection(textPos(editor, 'Gamma'));
    const imageDoc = '<p>Avant</p><p><img class="editor-image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="" style="width: 160px"></p><p>Après</p>';
    for (const key of out.keys) {
      if (IMAGE_KEY.test(key)) { Editor.setHTML(imageDoc); await sleep(60); editor.commands.setNodeSelection(imagePos(editor)); } else { Editor.setHTML(TABLE_DOC); await sleep(60); editor.commands.setTextSelection(textPos(editor, 'Gamma')); }
      const spec = LockBarCauses.forKey(key);
      if (!spec) { out.failures.push(key + ' : aucun constat'); continue; }
      const texts = everyText(spec).filter(value => value !== undefined);
      const resolved = texts.map(value => LockDiagnostic.resolve(value, false));
      const masked = LockDiagnostic.report(spec, { name: 'Icône', why: spec.why || 'Raison', mask: true });
      if (!spec.checks.length || !spec.checks.some(check => check.s === 'no')) out.failures.push(key + ' : pas de cause ✕');
      if (!spec.fix || !spec.fix.trim()) out.failures.push(key + ' : pas de geste');
      if (!spec.context.length) out.failures.push(key + ' : pas de contexte');
      if (resolved.some(unfinished) || unfinished(masked)) out.failures.push(key + ' : texte inachevé ' + JSON.stringify(resolved.filter(unfinished)));
    }
    return out;
  }
  cases.push({
    id: 'lock_bubble_every_bar_reason_has_a_complete_finding',
    description: 'LockBarCauses : chaque raison de grisé des barres du tableau et de l\'image, des lignes de menu et des boutons grisés « doux » (clés lues sur le bouton) a un constat - au moins une cause ✕, un geste, ce que le widget voit - dont aucun texte n\'est inachevé (accolade, clé non traduite, undefined), en français',
    run: async (h) => {
      const out = await everyBarKey(h);
      const required = ['table.rowsEqualizeNeed', 'table.cellMergeNeedsCells', 'table.cellTracked', 'table.settingTracked', 'table.rowRepeatNoSource', 'table.pivotDocument', 'linkedTable.lockedTracked', 'imgToolbar.conditionNeedsColumn', 'imgToolbar.reshapeVector', 'imgToolbar.repeatNeedsPage', 'caption.gridLocked', 'keepNext.notHere', 'paragraphFormat.notHere', 'textDirection.notHere', 'bulletFormat.notHere', 'bookmark.notHere', 'headingStyle.notHere', 'headingStyle.none', 'headingStyle.document.none', 'lock.indent', 'lock.outdent', 'lock.noPending', 'lock.defaultNone', 'lock.defaultType', 'lock.keyDefault', 'lock.keysAllDefault', 'lock.pageBusy', 'lock.pageDocHf'];
      const missing = required.filter(key => out.keys.indexOf(key) === -1);
      return { pass: out.failures.length === 0 && missing.length === 0 && out.keys.length >= 48, notes: JSON.stringify({ count: out.keys.length, missing, failures: out.failures }) };
    },
  });
  cases.push({
    id: 'lock_bubble_every_bar_reason_has_a_complete_finding_in_english',
    lang: 'en',
    description: 'La page qui démarre en anglais : les mêmes constats sont complets et sans texte inachevé, et le premier dit « Fewer than two rows chosen »',
    run: async (h) => {
      const out = await everyBarKey(h);
      await h.resetEditor();
      const editor = EditorCore.getEditor();
      Editor.setHTML(TABLE_DOC);
      await sleep(60);
      editor.commands.setTextSelection(textPos(editor, 'Gamma'));
      const rows = LockBarCauses.forKey('table.rowsEqualizeNeed');
      const english = !!rows && rows.checks.some(check => check.s === 'no' && /Fewer than two rows chosen/.test(check.t)) && /drag across the table to choose at least two rows/.test(rows.fix) && rows.context.some(row => row[0] === 'Table type');
      return { pass: I18n.getLang() === 'en' && out.failures.length === 0 && english, notes: JSON.stringify({ lang: I18n.getLang(), failures: out.failures, english }) };
    },
  });
  cases.push({
    id: 'lock_bubble_bar_external_image_and_row_inside_a_zone_without_source',
    description: 'LockBarCauses : l\'image d\'une adresse web dit qu\'elle n\'est pas dans le document ; la ligne d\'un tableau dans une zone répétée dont la variable n\'est pas rattachée à la table de la zone nomme la variable et la zone (noms lus dans le document, jetons)',
    run: async (h) => {
      await h.resetEditor();
      const stub = window.__gristStub;
      stub.setViewRows(null);
      stub.setVariables('Factures', { Numero: 'Text' });
      stub.setVariables('Lignes', { Parent: 'Ref:Factures', Designation: 'Text' });
      stub.setVariables('Autre', { Nom: 'Text' });
      stub.setRows('Factures', [{ id: 1, Numero: 'F-1' }]);
      stub.setRows('Lignes', [{ id: 1, Parent: 1, Designation: 'A' }]);
      stub.setRows('Autre', [{ id: 1, Nom: 'N' }]);
      await GristAPI.refreshSchema();
      await GristAPI.deleteLinkRule('Lignes');
      await GristAPI.saveLinkRule('Lignes', { mode: 'match', colonneCible: 'Parent', colonneSource: 'id' });
      await GristAPI.refreshSchema();
      stub.fireRecord({ id: 1, Numero: 'F-1' }, 'Factures');
      const editor = EditorCore.getEditor();
      Editor.setHTML('<p><img class="editor-image" src="https://exemple.invalid/logo.png" alt=""></p>');
      await sleep(60);
      editor.commands.setNodeSelection(imagePos(editor));
      const external = LockBarCauses.forKey('imgToolbar.reshapeExternal');
      const badge = (table, column, extra) => '<span class="var-badge" data-table="' + table + '" data-column="' + column + '" data-key="' + table + '.' + column + '"' + (extra || '') + '></span>';
      const loop = JSON.stringify({ repeat: 'row', table: 'Lignes' }).replace(/"/g, '&quot;');
      Editor.setHTML('<table><tbody><tr><td><p>' + badge('Lignes', 'Designation', ' data-loop="' + loop + '" data-loop-repeat="row"') + '</p></td><td><table><tbody><tr><td><p>' + badge('Autre', 'Nom') + '</p></td><td><p>Fixe</p></td></tr></tbody></table></td></tr></tbody></table><p>Fin</p>');
      await sleep(80);
      editor.commands.setTextSelection(textPos(editor, 'Fixe'));
      const status = VariableLoop.rowStatus(editor);
      const found = LockBarCauses.forKey('table.rowRepeatNoSource');
      const none = found.checks.find(check => check.s === 'no');
      const shown = none ? LockDiagnostic.resolve(none.d, false) : '';
      const masked = LockDiagnostic.report(found, { name: 'Répéter la ligne', why: 'Raison', mask: true });
      const pass = !!external && external.checks.some(check => check.s === 'no' && /L’image vient d’une adresse web/.test(check.t))
        && status.reason === 'table.rowRepeatNoSource' && !status.enabled
        && shown === 'Autre.Nom (dans la zone répétée de « Lignes », mais sa table n’y est pas rattachée)'
        && /Table 1\.Colonne 1 \(dans la zone répétée de « Table 2 »/.test(masked) && !/Autre|Lignes/.test(masked);
      return { pass, notes: JSON.stringify({ external: !!external, reason: status.reason, shown, masked: masked.split('\n').filter(line => /Table/.test(line)).slice(0, 4) }) };
    },
  });
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.lockBubble = cases;
})();
