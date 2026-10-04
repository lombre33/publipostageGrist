// Suite "rowTemplate" - modèle selon la ligne (js/row-template.js, onglet Réglages > Selon la ligne : js/row-template-panel.js), point 16 d'Antoine du 2026-10-02 :
// « relier un modèle à une condition dans la table où est le widget pour qu'il ouvre le bon modèle en fonction de la ligne, y compris en mode édition, sans alourdir
// l'ouverture quand l'option n'est pas activée ».
//
// Le réglage vit dans les options du widget : chaque scénario le pose comme Grist le ferait (stub.setWidgetOptions -> onOptions) ou par l'onglet, puis change de ligne
// comme Grist (stub.fireRecord). Trois modèles réels, créés par le flux de l'interface ; chaque scénario retire le réglage en partant (cleanup).
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'PpLignes';
  const KEY = 'modeleSelonLigne';
  const HTML = { A: '<p>Contenu A défaut</p>', B: '<p>Contenu B urgent</p>', C: '<p>Contenu C archive</p>' };

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const same = (a, b) => String(a) === String(b);
  const editorText = () => document.querySelector('.ProseMirror').textContent;
  const readerText = () => document.getElementById('reader-container').textContent;
  const inReadMode = () => document.getElementById('reader-container').style.display === 'block' && document.getElementById('editor-container').style.display === 'none';
  const dialogEl = () => document.getElementById('pp-dialog-modal');
  const dialogOpen = () => !!dialogEl() && getComputedStyle(dialogEl()).display !== 'none';
  const dialogButtons = () => Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(b => !b.hidden);
  async function answerDialog(label) {
    const button = dialogButtons().find(b => b.textContent === label);
    if (!button) throw new Error('bouton « ' + label + ' » absent de la fenêtre');
    button.click();
    await sleep(500);
  }
  async function closeDialogIfOpen() {
    if (!dialogOpen()) return;
    const cancel = dialogButtons().find(b => b.textContent === 'Annuler');
    if (cancel) cancel.click();
    await sleep(300);
  }
  async function setMode(mode) {
    document.getElementById(mode === 'read' ? 'btn-mode-read' : 'btn-mode-edit').click();
    await waitFor(() => (mode === 'read') === inReadMode(), 3000);
    await sleep(200);
  }

  // Un modèle document enregistré par le flux de l'interface (comme dev-tests/scenarios-template-tree.js:createTemplate).
  async function createDoc(h, nom, html) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(50);
    Editor.setHTML(html);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await sleep(400);
    return Templates.getCurrentId();
  }

  // Trois modèles (le premier est ★) et la table des lignes, la première ligne affichée. Recréés seulement s'ils manquent : la suite les partage.
  let fixture = null;
  async function ensureFixture(h) {
    stub().setVariables(TABLE, { Nom: 'Text', Statut: 'Choice' }, { Statut: ['Urgent', 'Archive', 'Autre'] });
    await GristAPI.refreshSchema();
    if (!fixture || !Templates.getCached().some(t => same(t.id, fixture.A))) {
      const A = await createDoc(h, 'Ligne - A défaut', HTML.A);
      const B = await createDoc(h, 'Ligne - B urgent', HTML.B);
      const C = await createDoc(h, 'Ligne - C archive', HTML.C);
      fixture = { A, B, C };
    }
    // ★ sur A seul.
    const rows = stub().state.rows.Publipostage_Modeles;
    rows.id.forEach((rowId, i) => { rows.EstParDefaut[i] = same(rowId, fixture.A); });
    await Templates.loadAll();
    return fixture;
  }

  const rule = (column, value, modeleId, operator) => ({ column, operator: operator || '=', value, modeleId: String(modeleId) });
  const RULES = f => [rule('Statut', 'Urgent', f.B), rule('Statut', 'Archive', f.C)];
  const config = (f, extra) => Object.assign({ enabled: true, rules: RULES(f), otherwise: 'default' }, extra || {});

  async function setOption(raw) {
    stub().setWidgetOptions(raw ? { [KEY]: raw } : null);
    await sleep(120);
  }
  // Ouvre un modèle à la main (liste des modèles), comme la personne, puis attend qu'il soit chargé.
  async function openByHand(id) {
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => same(Templates.getCurrentId(), id), 2500);
    await sleep(150);
  }
  // Ligne de la table, comme grist.onRecord : attend que le modèle voulu soit le courant (ou laisse 400 ms quand on attend qu'il ne bouge PAS).
  async function fireRow(id, statut, expectId) {
    stub().fireRecord({ id, Nom: 'Ligne ' + id, Statut: statut }, TABLE);
    if (expectId != null) await waitFor(() => same(Templates.getCurrentId(), expectId), 2500);
    else await sleep(400);
    await sleep(200);
  }
  async function cleanup(h) {
    await closeDialogIfOpen();
    await setOption(null);
    const f = fixture;
    if (f && !same(Templates.getCurrentId(), f.A)) await openByHand(f.A);
    if (inReadMode()) await setMode('edit');
    if (h) h.choosePrompts.length = 0;
  }

  // Compte les appels qui coûteraient à l'ouverture : évaluations de règle et lectures de table faites à travers l'API Grist.
  function spies() {
    const calls = { matches: 0, fetchTable: 0 };
    const origMatches = ConditionRules.matches;
    const origFetch = grist.docApi.fetchTable;
    ConditionRules.matches = function () { calls.matches++; return origMatches.apply(this, arguments); };
    grist.docApi.fetchTable = function () { calls.fetchTable++; return origFetch.apply(this, arguments); };
    return { calls, restore() { ConditionRules.matches = origMatches; grist.docApi.fetchTable = origFetch; } };
  }

  cases.push({
    id: 'row_template_off_changes_nothing_and_asks_nothing_from_grist',
    description: "Réglage absent : changer de ligne n'ouvre aucun modèle, n'évalue aucune règle et ne lit aucune table (aucun coût à l'ouverture) ; coupé après avoir été réglé, pareil",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(null);
      const off = { active: RowTemplate.isActive() };
      const spy = spies();
      try {
        await fireRow(1, 'Urgent', null);
        await fireRow(2, 'Archive', null);
        const absent = { current: Templates.getCurrentId(), matches: spy.calls.matches, fetches: spy.calls.fetchTable };
        // Réglé puis décoché : les règles restent enregistrées, rien n'est évalué.
        await setOption({ enabled: false, rules: RULES(f), otherwise: 'default' });
        const disabled = { active: RowTemplate.isActive() };
        spy.calls.matches = 0; spy.calls.fetchTable = 0;
        await fireRow(3, 'Urgent', null);
        const afterOff = { current: Templates.getCurrentId(), matches: spy.calls.matches, fetches: spy.calls.fetchTable, stored: RowTemplate.readRaw().rules.length };
        const pass = !off.active && same(absent.current, f.A) && absent.matches === 0 && absent.fetches === 0
          && !disabled.active && same(afterOff.current, f.A) && afterOff.matches === 0 && afterOff.fetches === 0 && afterOff.stored === 2;
        return { pass, notes: JSON.stringify({ off, absent, disabled, afterOff }) };
      } finally { spy.restore(); await cleanup(h); }
    },
  });

  cases.push({
    id: 'row_template_opens_the_template_of_the_row_in_read_mode',
    description: "En Lecture : une ligne « Urgent » ouvre le modèle B, « Archive » le modèle C, une autre ligne le modèle par défaut (★) ; la Lecture montre le contenu du modèle de la ligne, une seule fois par ligne",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(config(f));
      await setMode('read');
      const log = [];
      const seen = (label) => log.push({ label, current: Templates.getCurrentId(), read: readerText().includes('Contenu ' + label.slice(0, 1)), mode: inReadMode() });
      await fireRow(1, 'Urgent', f.B); seen('B urgent');
      await fireRow(2, 'Archive', f.C); seen('C archive');
      await fireRow(3, 'Autre', f.A); seen('A défaut');
      await fireRow(4, 'Urgent', f.B); seen('B urgent');
      const pass = log.length === 4 && log.every(e => e.read && e.mode)
        && same(log[0].current, f.B) && same(log[1].current, f.C) && same(log[2].current, f.A) && same(log[3].current, f.B);
      await cleanup(h);
      return { pass, notes: JSON.stringify(log) };
    },
  });

  cases.push({
    id: 'row_template_opens_the_template_of_the_row_in_edit_mode',
    description: "En édition aussi : le modèle de la ligne se charge dans l'éditeur (contenu, nom, liste des modèles), le mode ne change pas ; une ligne sans règle ouvre le modèle par défaut",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setMode('edit');
      await setOption(config(f));
      await fireRow(1, 'Urgent', f.B);
      const onB = { current: Templates.getCurrentId(), text: editorText(), name: document.getElementById('template-name').value, list: document.getElementById('template-select').value, read: inReadMode() };
      await fireRow(2, 'Archive', f.C);
      const onC = { current: Templates.getCurrentId(), text: editorText(), read: inReadMode() };
      await fireRow(3, 'Autre', f.A);
      const onA = { current: Templates.getCurrentId(), text: editorText() };
      const pass = same(onB.current, f.B) && onB.text === 'Contenu B urgent' && onB.name === 'Ligne - B urgent' && same(onB.list, f.B) && !onB.read
        && same(onC.current, f.C) && onC.text === 'Contenu C archive' && !onC.read
        && same(onA.current, f.A) && onA.text === 'Contenu A défaut';
      await cleanup(h);
      return { pass, notes: JSON.stringify({ onB, onC, onA }) };
    },
  });

  cases.push({
    id: 'row_template_first_matching_rule_wins_and_a_deleted_template_is_skipped',
    description: "Les règles se lisent dans l'ordre : la première qui correspond choisit ; une règle vers un modèle supprimé est sautée, la suivante est lue",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      // Deux règles vraies pour « Urgent » : B d'abord, C ensuite.
      await setOption(config(f, { rules: [rule('Statut', 'Urgent', f.B), rule('Statut', 'Urgent', f.C)] }));
      await fireRow(1, 'Urgent', f.B);
      const first = Templates.getCurrentId();
      // La première règle pointe un modèle qui n'existe plus : la deuxième s'applique.
      await setOption(config(f, { rules: [rule('Statut', 'Urgent', 999999), rule('Statut', 'Urgent', f.C)] }));
      await fireRow(2, 'Urgent', f.C);
      const skipped = Templates.getCurrentId();
      const pass = same(first, f.B) && same(skipped, f.C);
      await cleanup(h);
      return { pass, notes: JSON.stringify({ first, skipped }) };
    },
  });

  cases.push({
    id: 'row_template_otherwise_default_keep_or_a_chosen_template',
    description: "« Si aucune règle ne correspond » : le modèle par défaut (★), « Laisser le modèle ouvert » ne bouge rien, un modèle choisi s'ouvre ; sans ★, « par défaut » ne change rien",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.B);
      await setOption(config(f, { otherwise: 'default' }));
      await fireRow(1, 'Autre', f.A);
      const byDefault = Templates.getCurrentId();
      await openByHand(f.C);
      await setOption(config(f, { otherwise: 'keep' }));
      await fireRow(2, 'Autre', null);
      const kept = Templates.getCurrentId();
      await setOption(config(f, { otherwise: String(f.B) }));
      await fireRow(3, 'Autre', f.B);
      const chosen = Templates.getCurrentId();
      // Sans modèle par défaut : « par défaut » laisse le modèle ouvert.
      const rows = stub().state.rows.Publipostage_Modeles;
      rows.id.forEach((rowId, i) => { rows.EstParDefaut[i] = false; });
      await Templates.loadAll();
      await openByHand(f.C);
      await setOption(config(f, { otherwise: 'default' }));
      await fireRow(4, 'Autre', null);
      const noStar = Templates.getCurrentId();
      const pass = same(byDefault, f.A) && same(kept, f.C) && same(chosen, f.B) && same(noStar, f.C);
      await cleanup(h);
      return { pass, notes: JSON.stringify({ byDefault, kept, chosen, noStar }) };
    },
  });

  cases.push({
    id: 'row_template_same_row_keeps_a_template_opened_by_hand_until_the_row_or_the_rule_changes',
    description: "Un modèle ouvert à la main sur une ligne y reste quand la même ligne est mise à jour (même résultat de règle) ; une autre ligne qui donne le même modèle le rouvre ; la règle qui change le rouvre aussi",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(config(f));
      await fireRow(1, 'Urgent', f.B);
      await openByHand(f.C); // la personne ouvre C à la main pour cette ligne
      await fireRow(1, 'Urgent', null); // même ligne, même résultat (une cellule a changé : Grist rappelle onRecord)
      const heldByHand = Templates.getCurrentId();
      await fireRow(2, 'Urgent', f.B); // autre ligne, même résultat : le modèle de la ligne revient
      const otherRow = Templates.getCurrentId();
      await openByHand(f.C);
      await fireRow(2, 'Autre', f.A); // la même ligne change de résultat (Statut modifié) : A
      const ruleOutcomeChanged = Templates.getCurrentId();
      await openByHand(f.C);
      await setOption(config(f, { rules: [rule('Statut', 'Autre', f.B)] })); // une règle modifiée s'applique de nouveau à la ligne courante
      await waitFor(() => same(Templates.getCurrentId(), f.B), 2500);
      const reapplied = Templates.getCurrentId();
      const pass = same(heldByHand, f.C) && same(otherRow, f.B) && same(ruleOutcomeChanged, f.A) && same(reapplied, f.B);
      await cleanup(h);
      return { pass, notes: JSON.stringify({ heldByHand, otherRow, ruleOutcomeChanged, reapplied }) };
    },
  });

  cases.push({
    id: 'row_template_asks_before_leaving_unsaved_edits_and_cancel_is_not_asked_again_for_the_same_row',
    description: "Des modifications en attente : changer de ligne pose la question « Enregistrer / Abandonner / Annuler » avant d'ouvrir l'autre modèle ; Annuler garde le modèle et le texte, sans reposer la question pour la même ligne ; Abandonner ouvre le modèle de la ligne",
    run: async (h) => h.withRealChoose(async () => {
      const f = await ensureFixture(h);
      try {
        await openByHand(f.A);
        await setMode('edit');
        await setOption(config(f));
        await fireRow(1, 'Autre', null);
        await h.focusAtEnd();
        await h.typeText(' modifié');
        stub().clearActionLog();
        stub().fireRecord({ id: 2, Nom: 'Ligne 2', Statut: 'Urgent' }, TABLE);
        const asked = await waitFor(dialogOpen, 2500);
        const heldBack = { current: Templates.getCurrentId(), text: editorText() };
        await answerDialog('Annuler');
        const afterCancel = { open: dialogOpen(), current: Templates.getCurrentId(), text: editorText() };
        stub().fireRecord({ id: 2, Nom: 'Ligne 2 bis', Statut: 'Urgent' }, TABLE); // même ligne, cellule modifiée
        await sleep(500);
        const notAgain = { open: dialogOpen(), current: Templates.getCurrentId() };
        stub().fireRecord({ id: 3, Nom: 'Ligne 3', Statut: 'Archive' }, TABLE); // une autre ligne : la question revient
        const askedAgain = await waitFor(dialogOpen, 2500);
        await answerDialog('Abandonner');
        await waitFor(() => same(Templates.getCurrentId(), f.C), 2500);
        const afterDiscard = { open: dialogOpen(), current: Templates.getCurrentId(), text: editorText() };
        const pass = asked && same(heldBack.current, f.A) && heldBack.text === 'Contenu A défaut modifié'
          && !afterCancel.open && same(afterCancel.current, f.A) && afterCancel.text === 'Contenu A défaut modifié'
          && !notAgain.open && same(notAgain.current, f.A)
          && askedAgain && !afterDiscard.open && same(afterDiscard.current, f.C) && afterDiscard.text === 'Contenu C archive';
        return { pass, notes: JSON.stringify({ asked, heldBack, afterCancel, notAgain, askedAgain, afterDiscard }) };
      } finally { await closeDialogIfOpen(); await cleanup(h); }
    }),
  });

  cases.push({
    id: 'row_template_a_row_received_while_the_question_waits_is_the_one_that_counts',
    description: "Une ligne reçue pendant que la question attend sa réponse remplace la précédente : jamais deux changements de modèle en même temps, c'est le modèle de la dernière ligne qui s'ouvre",
    run: async (h) => h.withRealChoose(async () => {
      const f = await ensureFixture(h);
      try {
        await openByHand(f.A);
        await setMode('edit');
        await setOption(config(f));
        await fireRow(1, 'Autre', null);
        await h.focusAtEnd();
        await h.typeText(' modifié');
        stub().fireRecord({ id: 2, Nom: 'Ligne 2', Statut: 'Urgent' }, TABLE);
        await waitFor(dialogOpen, 2500);
        stub().fireRecord({ id: 3, Nom: 'Ligne 3', Statut: 'Archive' }, TABLE); // reçue pendant la question
        await sleep(300);
        await answerDialog('Abandonner'); // B s'ouvre pour la ligne 2 ...
        await waitFor(() => same(Templates.getCurrentId(), f.C), 3000); // ... puis la ligne 3 (la dernière) ouvre C
        await sleep(300);
        const end = { current: Templates.getCurrentId(), text: editorText(), open: dialogOpen() };
        const pass = same(end.current, f.C) && end.text === 'Contenu C archive' && !end.open;
        return { pass, notes: JSON.stringify(end) };
      } finally { await closeDialogIfOpen(); await cleanup(h); }
    }),
  });

  cases.push({
    id: 'row_template_options_saved_by_someone_else_apply_to_the_open_row_and_our_own_echo_does_not_undo_a_newer_edit',
    description: "Un réglage enregistré par quelqu'un d'autre (onOptions) s'applique tout de suite à la ligne ouverte ; l'écho d'une valeur déjà remplacée ne défait pas le réglage en cours",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await fireRow(1, 'Urgent', null);
      const before = Templates.getCurrentId();
      await setOption(config(f)); // arrive par onOptions, sans que cet écran n'ait rien écrit
      await waitFor(() => same(Templates.getCurrentId(), f.B), 2500);
      const applied = Templates.getCurrentId();
      // Deux écritures de suite (brouillon de la vue) : l'écho de la première arrive après la seconde (le faux Grist rend toujours la dernière valeur, l'écho périmé est donc rejoué à la main, avant que les siens n'arrivent).
      const spy = spies();
      await RowTemplate.save(config(f, { otherwise: 'keep' }));
      await RowTemplate.save(config(f, { otherwise: String(f.C) }));
      stub().state.optionsCallback({ [KEY]: config(f, { otherwise: 'keep' }) }, { accessLevel: stub().state.accessLevel, linking: {} });
      await sleep(300);
      const evaluatedMeanwhile = spy.calls.matches; // l'écho périmé ne relance aucune lecture de la ligne (ni, ailleurs, une question) : rien n'est évalué
      spy.restore();
      await openByHand(f.A);
      await fireRow(5, 'Autre', f.C); // « Si aucune règle ne correspond » = le modèle C : l'écho périmé (« keep ») n'a rien défait
      const afterStaleEcho = Templates.getCurrentId();
      await RowTemplate.save(null);
      await sleep(200);
      const pass = same(before, f.A) && same(applied, f.B) && same(afterStaleEcho, f.C) && evaluatedMeanwhile === 0;
      await cleanup(h);
      return { pass, notes: JSON.stringify({ before, applied, afterStaleEcho, evaluatedMeanwhile }) };
    },
  });

  // --- Onglet Réglages > Selon la ligne ---
  const tabBtn = () => document.querySelector('.settings-tab[data-settings-tab="rowTemplate"]');
  const panel = () => document.querySelector('.settings-panel[data-settings-panel="rowTemplate"]');
  const box = () => document.getElementById('settings-rowtemplate-body');
  const settingsOpen = () => document.getElementById('settings-modal').style.display === 'flex';
  async function openPanel() {
    document.getElementById('v2-btn-settings').click();
    await sleep(150);
    tabBtn().click();
    await sleep(150);
  }
  async function closeSettings() {
    document.getElementById('settings-close').click();
    await sleep(500);
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  cases.push({
    id: 'row_template_panel_tab_exists_and_is_greyed_not_removed_when_off',
    description: "L'onglet « Selon la ligne » existe ; décoché, ses champs restent visibles mais grisés et inertes ; cocher pose une première règle vide, prête à remplir",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(null);
      await openPanel();
      const checkbox = document.getElementById('settings-rowtemplate-enabled');
      const off = { tab: !!tabBtn(), shown: !panel().hidden, checked: checkbox.checked, grey: box().classList.contains('is-off'), inert: box().inert, visible: box().getBoundingClientRect().height > 0, rules: document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length };
      checkbox.checked = true;
      fire(checkbox, 'change');
      await sleep(150);
      const on = { grey: box().classList.contains('is-off'), inert: box().inert, rules: document.querySelectorAll('#settings-rowtemplate-rules .macro-rule-row').length, connector: (document.querySelector('#settings-rowtemplate-rules .macro-rule-connector') || {}).textContent };
      checkbox.checked = false;
      fire(checkbox, 'change');
      await sleep(150);
      await closeSettings();
      await setOption(null);
      const pass = off.tab && off.shown && !off.checked && off.grey && off.inert && off.visible && off.rules === 0
        && !on.grey && !on.inert && on.rules === 1 && on.connector === 'Si';
      return { pass, notes: JSON.stringify({ off, on }) };
    },
  });

  // Le texte d'aide du bas de l'onglet : depuis qu'un export en lot donne à chaque ligne son modèle (js/main.js rowSourceResolver), il ne dit plus « garde le modèle ouvert ».
  cases.push({
    id: 'row_template_panel_export_hint_says_a_batch_export_follows_the_rules_in_both_languages',
    description: "Le texte d'aide de l'onglet « Selon la ligne » dit qu'un export en lot rend chaque ligne avec le modèle que les règles lui désignent (et non plus qu'il garde le modèle ouvert), en français comme en anglais",
    run: async (h) => {
      await ensureFixture(h);
      const lang = I18n.getLang();
      const hint = () => (document.querySelector('[data-settings-panel="rowTemplate"] [data-i18n="settings.rowTemplate.exportHint"]') || {}).textContent || '';
      await openPanel();
      const out = {};
      try {
        I18n.setLang('fr'); await sleep(100); out.fr = hint();
        I18n.setLang('en'); await sleep(100); out.en = hint();
      } finally { I18n.setLang(lang); await sleep(100); await closeSettings(); }
      const pass = /chaque ligne/.test(out.fr) && /règles/.test(out.fr) && !/garde le modèle ouvert/.test(out.fr)
        && /each (exported )?row/.test(out.en) && /rules/.test(out.en) && !/keeps the open template/.test(out.en);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'row_template_panel_fills_a_rule_with_the_real_fields_writes_the_option_and_opens_the_row_template_on_close',
    description: "Colonne, opérateur, valeur et modèle se choisissent avec les vrais champs (listes avec recherche) ; chaque saisie écrit l'option du widget sans rien ouvrir ; à la fermeture des Réglages le modèle de la ligne s'ouvre",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(null);
      await fireRow(1, 'Urgent', null);
      await openPanel();
      const checkbox = document.getElementById('settings-rowtemplate-enabled');
      checkbox.checked = true;
      fire(checkbox, 'change');
      await sleep(150);
      const column = document.querySelector('#settings-rowtemplate-rules .macro-rule-column');
      column.value = 'Statut';
      fire(column, 'change');
      await sleep(200);
      const value = document.querySelector('#settings-rowtemplate-rules .macro-rule-value');
      value.value = 'Urgent';
      fire(value, 'change');
      const modele = document.querySelector('#settings-rowtemplate-rules .macro-rule-modele');
      modele.value = String(f.B);
      fire(modele, 'change');
      await sleep(500);
      const written = (stub().state.options || {})[KEY];
      const stillA = same(Templates.getCurrentId(), f.A); // rien ne s'ouvre pendant la saisie
      const modeleTrigger = modele.nextElementSibling && modele.nextElementSibling.querySelector('.ss-trigger');
      const triggerText = modeleTrigger ? modeleTrigger.textContent : '';
      await closeSettings();
      await waitFor(() => same(Templates.getCurrentId(), f.B), 2500);
      const opened = Templates.getCurrentId();
      await cleanup(h);
      const pass = !!written && written.enabled === true && written.rules.length === 1 && written.rules[0].column === 'Statut' && written.rules[0].operator === '='
        && written.rules[0].value === 'Urgent' && same(written.rules[0].modeleId, f.B) && written.otherwise === 'default'
        && stillA && same(opened, f.B) && /Ligne - B urgent/.test(triggerText || '');
      return { pass, notes: JSON.stringify({ written, stillA, opened, triggerText }) };
    },
  });

  cases.push({
    id: 'row_template_panel_is_locked_for_a_read_only_person',
    description: "En lecture seule l'onglet est verrouillé : case désactivée, champs grisés et inertes, message affiché",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      await setOption(config(f));
      const savedRights = AccessRights.get;
      AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
      try {
        await openPanel();
        const checkbox = document.getElementById('settings-rowtemplate-enabled');
        const locked = { disabled: checkbox.disabled, inert: box().inert, grey: box().classList.contains('is-off'), hint: !document.getElementById('settings-rowtemplate-locked').hidden };
        await closeSettings();
        AccessRights.get = savedRights;
        await openPanel();
        const free = { disabled: checkbox.disabled, inert: box().inert, hint: !document.getElementById('settings-rowtemplate-locked').hidden };
        await closeSettings();
        const pass = locked.disabled && locked.inert && locked.grey && locked.hint && !free.disabled && !free.inert && !free.hint;
        return { pass, notes: JSON.stringify({ locked, free }) };
      } finally { AccessRights.get = savedRights; await cleanup(h); }
    },
  });

  // --- Droits qui changent Réglages ouverts (choix d'Antoine du 2026-10-02, « Dégriser tout de suite ») ---
  // Le vrai calcul des droits (js/access-rights.js) : une table de droits dans le faux Grist, la personne y est repérée par son email ; AccessRights.refresh() fait ce que fait la minuterie de 10 s.
  // Le même email que dev-tests/scenarios-access-rights.js : GristAPI le garde en cache après la première identification.
  const RIGHTS_TABLE = 'PpDroitsLignes';
  const RIGHTS_EMAIL = 'Lecteur@Exemple.fr';
  const RIGHTS_CONFIG = { table: RIGHTS_TABLE, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  const rightsRow = flags => [{ id: 1, Email: RIGHTS_EMAIL, LectureSeule: !!flags.readOnly, Export: flags.export !== false, Commentaires: flags.comments !== false }];
  const rightsAre = flags => { const r = AccessRights.get(); return r.readOnly === !!flags.readOnly && r.canExport === (flags.export !== false) && r.canComment === (flags.comments !== false); };
  // Réglage Selon la ligne `raw` + réglage Accès sur la table des droits, la personne ayant `flags` ; attend que les droits soient ceux-là.
  async function applyRights(raw, flags) {
    stub().setUserEmail('lecteur@exemple.fr');
    stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub().setRows(RIGHTS_TABLE, rightsRow(flags));
    await GristAPI.refreshSchema();
    stub().setWidgetOptions({ droitsAcces: RIGHTS_CONFIG, [KEY]: raw });
    await sleep(120);
    await AccessRights.refresh();
    const ok = await waitFor(() => rightsAre(flags), 3000);
    await sleep(200);
    return ok;
  }
  // Une case de la table des droits change dans Grist : la relecture suivante (ici tout de suite) fait suivre l'interface.
  async function changeRights(flags) {
    stub().setRows(RIGHTS_TABLE, rightsRow(flags));
    await AccessRights.refresh();
    const ok = await waitFor(() => rightsAre(flags), 3000);
    await sleep(150);
    return ok;
  }
  async function dropRights() {
    stub().dropTable(RIGHTS_TABLE);
    await GristAPI.refreshSchema();
  }
  const lockState = () => ({
    hint: !document.getElementById('settings-rowtemplate-locked').hidden,
    disabled: document.getElementById('settings-rowtemplate-enabled').disabled,
    inert: box().inert,
    grey: box().classList.contains('is-off'),
  });
  const isLocked = s => s.hint && s.disabled && s.inert && s.grey;
  const isFree = s => !s.hint && !s.disabled && !s.inert && !s.grey;

  cases.push({
    id: 'row_template_panel_follows_rights_that_change_while_the_settings_are_open',
    description: "Réglages ouverts sur l'onglet Selon la ligne, un changement de droits (en lecture seule, puis plus, puis de nouveau) grise ou dégrise l'onglet tout de suite, sans fermer ni rouvrir les Réglages",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      try {
        const started = await applyRights(config(f), { readOnly: true });
        await openPanel();
        const lockedAtOpen = lockState();
        const freeNow = await changeRights({ readOnly: false });
        const stillOpen = settingsOpen() && !panel().hidden;
        const freed = lockState();
        const lockedNow = await changeRights({ readOnly: true });
        const lockedAgain = lockState();
        const freeAgainNow = await changeRights({ readOnly: false });
        const freedAgain = lockState();
        await closeSettings();
        const pass = started && freeNow && lockedNow && freeAgainNow && stillOpen && isLocked(lockedAtOpen) && isFree(freed) && isLocked(lockedAgain) && isFree(freedAgain);
        return { pass, notes: JSON.stringify({ started, lockedAtOpen, freed, lockedAgain, freedAgain, stillOpen }) };
      } finally { await cleanup(h); await dropRights(); }
    },
  });

  cases.push({
    id: 'row_template_panel_keeps_what_is_being_typed_when_the_rights_change',
    description: "Un changement de droits Réglages ouverts ne redessine pas la saisie en cours : même champ, même valeur, même focus et même sélection, rien d'écrit par-dessus ; seul le verrou change",
    run: async (h) => {
      const f = await ensureFixture(h);
      await openByHand(f.A);
      try {
        const started = await applyRights({ enabled: true, rules: [rule('Nom', 'abc', f.B)], otherwise: 'default' }, {});
        await openPanel();
        const field = document.querySelector('#settings-rowtemplate-rules .macro-rule-value');
        const isText = !!field && field.tagName === 'INPUT';
        if (!isText) return { pass: false, notes: 'champ Valeur introuvable ou pas un champ texte : ' + (field ? field.tagName : 'aucun') };
        field.focus();
        field.value = 'abc def';
        field.setSelectionRange(2, 5);
        fire(field, 'input');
        await sleep(450); // le brouillon s'enregistre 250 ms après la saisie
        const written = () => JSON.stringify(((stub().state.options || {})[KEY] || {}).rules);
        const savedTyped = written();
        const snap = () => ({ same: document.querySelector('#settings-rowtemplate-rules .macro-rule-value') === field && field.isConnected, value: field.value, focused: document.activeElement === field, from: field.selectionStart, to: field.selectionEnd });
        // Un droit sans rapport avec le verrou change (l'export est retiré) : l'onglet est rejoué, le champ ne bouge pas.
        const exportOff = await changeRights({ export: false });
        const afterExport = Object.assign(snap(), lockState());
        // La personne passe en lecture seule : mêmes champ et valeur, l'onglet est verrouillé, rien n'est écrit par-dessus.
        const readOnlyNow = await changeRights({ readOnly: true, export: false });
        const afterReadOnly = Object.assign(snap(), lockState());
        await sleep(450);
        const savedLocked = written();
        // Plus en lecture seule : dégrisé, toujours le même champ avec la même valeur.
        const freeNow = await changeRights({});
        const afterFree = Object.assign(snap(), lockState());
        // La saisie continue : le même champ écrit encore dans le brouillon, qui s'enregistre (un brouillon relu des options ferait perdre ce qui s'écrit ensuite).
        field.value = 'abc def!';
        fire(field, 'input');
        await sleep(450);
        const savedAfter = written();
        await closeSettings();
        const kept = s => s.same && s.value === 'abc def';
        const pass = started && exportOff && readOnlyNow && freeNow && /abc def/.test(savedTyped)
          && kept(afterExport) && afterExport.focused && afterExport.from === 2 && afterExport.to === 5 && isFree(afterExport)
          && kept(afterReadOnly) && isLocked(afterReadOnly) && savedLocked === savedTyped
          && kept(afterFree) && isFree(afterFree) && /abc def!/.test(savedAfter);
        return { pass, notes: JSON.stringify({ started, savedTyped, afterExport, afterReadOnly, savedLocked, afterFree, savedAfter }) };
      } finally { await cleanup(h); await dropRights(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.rowTemplate = cases;
})();
