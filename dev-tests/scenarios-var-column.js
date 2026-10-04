// Suite "varColumn" - bouton « Colonne… » de la barre flottante d'une bulle #Variable (point 11 des retours du 2026-10-02 : « si une variable est cassée, est-ce que ça peut aider, quand
// je reviens sur le modèle, d'aller chercher le bon nom ? »), qui n'est là QUE sur une variable cassée (bulle rouge), demande du 2026-10-04 : « pas à chaque fois, uniquement quand une
// variable est cassée » - une variable saine, un calcul, un bloc de texte, une valeur et une case conditionnelle ne l'ont pas. Une liste avec recherche de toutes les colonnes, celles de
// la table de la page en tête ; la colonne choisie prend la place de celle de la bulle avec la même règle que « Remplacer » d'Autres attributs : condition, format du même genre et
// boucle de la même source sont gardés. Une table pas encore liée ouvre d'abord la fenêtre de choix de la clé. La souris réelle à 700x400 est dans verify-var-toolbar-mouse.mjs.
(function () {
  const cases = [];
  const PAGE = 'VcoNotifications';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const RECORD_1 = { id: 1, Titre: 'Notif 1', Montant: 1200, Actif: true, Projet: 'Projet Alpha', Responsable: 'Dupont Jean' };
  const COND = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Notif 1' }] };

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (table, column, extra) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra || ''}></span>`;
  const ed = () => EditorCore.getEditor();
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  // La page est sur VcoNotifications : Projet (liée par sa règle) et Responsable (pas liée) sont ses deux Références. VcoLignes est liée par une règle « match » qui peut trouver plusieurs lignes :
  // une bulle de cette table peut porter une boucle.
  async function seed(h, html) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('VcoAnnuaire', { NomPrenom: 'Text', Email: 'Text' });
    stub.setVariables('VcoProjet', { Nom: 'Text', Budget: 'Numeric' });
    stub.setVariables('VcoLignes', { Notification: 'Ref:' + PAGE, Designation: 'Text', Prix: 'Numeric' });
    stub.setVariables(PAGE, {
      Titre: 'Text', Montant: 'Numeric', Echeance: 'Date', Actif: 'Bool', Projet: 'Ref:VcoProjet', Responsable: 'Ref:VcoAnnuaire', gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Projet: 'gristHelper_Display', Responsable: 'gristHelper_Display2' });
    stub.setRows('VcoAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr' }]);
    stub.setRows('VcoProjet', [{ id: 1, Nom: 'Projet Alpha', Budget: 5000 }]);
    stub.setRows('VcoLignes', [{ id: 1, Notification: 1, Designation: 'Audit', Prix: 100 }, { id: 2, Notification: 1, Designation: 'Livret', Prix: 50 }]);
    stub.setRows(PAGE, [{ id: 1, Titre: 'Notif 1', Montant: 1200, Echeance: 631152000, Actif: true, Projet: 1, Responsable: 7, gristHelper_Display: 'Projet Alpha', gristHelper_Display2: 'Dupont Jean' }]);
    await GristAPI.refreshSchema();
    for (const t of ['VcoAnnuaire', 'VcoProjet', 'VcoLignes']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('VcoProjet', { mode: 'match', colonneCible: 'id', colonneSource: 'Projet' });
    await GristAPI.saveLinkRule('VcoLignes', { mode: 'match', colonneCible: 'Notification', colonneSource: 'id' });
    stub.fireRecord(Object.assign({}, RECORD_1), PAGE);
    Editor.setHTML(html || '<p></p>');
    await h.sleep(120);
  }

  const badgeNodes = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); }); return out; };
  async function selectBadge(h, index) {
    document.querySelector('.tiptap').focus();
    const found = badgeNodes()[index || 0];
    if (!found) throw new Error('pas de bulle n° ' + (index || 0));
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(150);
    return found;
  }
  const attrsOf = index => { const f = badgeNodes()[index || 0]; return f ? f.node.attrs : null; };
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const columnButton = () => toolbar().querySelector('button[data-action="var-column"]');
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  const pressColumn = () => columnButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const openPanel = () => Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden) || null;
  const optionNames = panel => Array.from(panel.querySelectorAll('.ss-option .ss-name')).map(n => n.textContent);
  async function pickRow(h, key) {
    const panel = openPanel();
    const row = panel && Array.from(panel.querySelectorAll('.ss-option')).find(r => r.querySelector('.ss-name').textContent === key);
    if (!row) throw new Error('« ' + key + ' » n’est pas dans la liste : ' + (panel ? optionNames(panel).slice(0, 12).join(', ') : '(liste fermée)'));
    row.click();
    await h.sleep(150);
  }
  const keyWindow = () => document.getElementById('link-config-modal');
  const keyWindowOpen = () => !!keyWindow() && keyWindow().style.display === 'flex';
  const closeKeyWindow = async h => { if (keyWindowOpen()) { document.getElementById('link-config-cancel').click(); await h.sleep(60); } };
  const ruleOf = table => { const rule = GristAPI.getLinkRule(table); return rule ? [rule.mode, rule.colonneCible, rule.colonneSource] : null; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Le bouton tel que la personne le voit : la barre est ouverte ET le bouton a une boîte (un bouton `hidden` n'en a aucune). Une barre fermée ne montre rien.
  const buttonState = () => {
    const b = columnButton();
    return {
      shown: !!b && toolbar().classList.contains('visible') && b.getClientRects().length > 0,
      hidden: !!b && b.hidden, disabled: !!b && b.getAttribute('aria-disabled') === 'true', title: b ? b.title : null, label: b ? b.getAttribute('aria-label') : null,
    };
  };
  const barIsOpen = () => toolbar().classList.contains('visible');

  // Sélection d'une bulle d'un type donné (calcul, bloc de texte, case conditionnelle) dans un document neuf : la barre s'ouvre sur elle comme sur un clic.
  async function selectNodeOfType(h, html, typeName) {
    Editor.setHTML(html);
    await h.sleep(120);
    document.querySelector('.tiptap').focus();
    let pos = null;
    ed().state.doc.descendants((node, p) => { if (node.type.name === typeName) pos = p; });
    if (pos === null) throw new Error('pas de nœud ' + typeName);
    ed().commands.setNodeSelection(pos);
    await h.sleep(150);
  }

  cases.push({
    id: 'varcolumn_button_shows_only_on_a_broken_variable',
    description: 'La barre d’une variable saine (colonne de la page, d’une autre table, chemin de références) n’a pas « Colonne… » ; elle l’a, avec une info-bulle qui dit que la colonne est introuvable, sur une variable cassée (colonne, chemin ou table disparus) ; un calcul (même cassé), un bloc de texte et une case conditionnelle ne l’ont jamais',
    run: async (h) => {
      const states = {};
      // Dans l'ordre : trois variables saines, puis trois cassées (colonne, chemin de références, table disparus).
      const kinds = ['valid', 'validPath', 'otherTable', 'broken', 'brokenPath', 'brokenTable'];
      const html = `<p>${[badge(PAGE, 'Titre'), badge(PAGE, 'Projet.Nom'), badge('VcoProjet', 'Nom'), badge(PAGE, 'Ancien'), badge(PAGE, 'Projet.Inconnu'), badge('VcoDisparue', 'Nom')].join(' ')}</p>`;
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          await seed(h, html);
          for (let i = 0; i < kinds.length; i++) {
            await selectBadge(h, i);
            states[lang + '_' + kinds[i]] = Object.assign(buttonState(), { bar: barIsOpen(), red: document.querySelectorAll('.tiptap .var-badge')[i].classList.contains('var-badge-broken') });
          }
        });
      }
      await inLang('fr', async () => {
        await selectNodeOfType(h, '<p><span class="calc-badge" data-formula="{VcoNotifications.Montant}*2"></span></p>', 'calcBadge');
        states.calc = Object.assign(buttonState(), { bar: barIsOpen() });
        await selectNodeOfType(h, '<p><span class="calc-badge" data-formula="{VcoNotifications.Ancien}*2"></span></p>', 'calcBadge');
        states.calcBroken = Object.assign(buttonState(), { bar: barIsOpen(), red: !!document.querySelector('.tiptap .calc-badge-broken') });
        await selectNodeOfType(h, '<div class="conditional-text"><p>Texte conditionnel</p></div>', 'conditionalText');
        states.block = Object.assign(buttonState(), { bar: barIsOpen() });
        await selectNodeOfType(h, '<p><span class="conditional-checkbox">☐</span></p>', 'conditionalCheckbox');
        states.checkbox = Object.assign(buttonState(), { bar: barIsOpen() });
      });
      const BROKEN = { fr: 'Cette variable ne trouve plus sa colonne : choisir la bonne…', en: 'This variable can no longer find its column: pick the right one…' };
      const absent = s => s.bar && !s.shown && s.hidden;
      const present = (s, lang) => s.bar && s.shown && !s.hidden && !s.disabled && s.title === BROKEN[lang] && s.label === BROKEN[lang];
      const wrong = [];
      for (const lang of ['fr', 'en']) {
        // Le bouton suit la bulle rouge, ni plus ni moins.
        ['valid', 'validPath', 'otherTable'].forEach(kind => { const s = states[lang + '_' + kind]; if (!absent(s) || s.red) wrong.push(lang + '_' + kind); });
        ['broken', 'brokenPath', 'brokenTable'].forEach(kind => { const s = states[lang + '_' + kind]; if (!present(s, lang) || !s.red) wrong.push(lang + '_' + kind); });
      }
      ['calc', 'calcBroken', 'block', 'checkbox'].forEach(kind => { if (!absent(states[kind])) wrong.push(kind); });
      if (!states.calcBroken.red) wrong.push('calcBroken (la bulle n’est pas rouge : le cas ne prouve rien)');
      return { pass: wrong.length === 0, notes: wrong.length ? wrong.map(k => k + ' : ' + JSON.stringify(states[k.split(' ')[0]])).join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'varcolumn_list_offers_every_column_page_table_first_without_helper_columns',
    description: 'La liste propose toutes les colonnes de toutes les tables, celles de la table de la page en tête, sans les colonnes techniques gristHelper_ ; un clic sur le bouton l’ouvre, Échap la referme sans rien changer',
    run: async (h) => {
      await seed(h, `<p>${badge(PAGE, 'Ancien')}</p>`);
      await selectBadge(h, 0);
      pressColumn();
      await h.sleep(200);
      const panel = openPanel();
      const names = panel ? optionNames(panel) : [];
      const pageNames = names.filter(n => n.indexOf(PAGE + '.') === 0);
      const firstOthers = names.findIndex(n => n.indexOf(PAGE + '.') !== 0);
      const before = JSON.stringify(attrsOf(0));
      if (panel) panel.querySelector('.ss-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(120);
      const checks = {
        open: !!panel,
        pageFirst: pageNames.length === 6 && firstOthers === pageNames.length,
        everyTable: ['VcoProjet.Nom', 'VcoAnnuaire.Email', 'VcoLignes.Prix'].every(k => names.indexOf(k) !== -1),
        noHelper: names.every(n => n.indexOf('gristHelper_') === -1),
        closedByEscape: !openPanel(),
        nothingChanged: JSON.stringify(attrsOf(0)) === before,
        hostRemoved: !document.getElementById('v2-var-column-search'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify(names) };
    },
  });

  cases.push({
    id: 'varcolumn_repairs_a_broken_variable_and_keeps_its_condition_and_number_format',
    description: 'Une variable cassée (colonne renommée dans Grist) prend la bonne colonne choisie dans la liste : sa condition et son format nombre restent, elle n’est plus rouge, un seul Annuler rend l’ancienne colonne',
    run: async (h) => {
      const extra = attr('data-format', { type: 'number', decimals: 2 }) + attr('data-condition', COND);
      await seed(h, `<p>${badge(PAGE, 'Libelle', extra)}</p>`);
      await selectBadge(h, 0);
      const wasBroken = document.querySelector('.tiptap .var-badge').classList.contains('var-badge-broken');
      pressColumn();
      await h.sleep(200);
      await pickRow(h, PAGE + '.Montant');
      await h.sleep(200);
      const after = attrsOf(0);
      const stillBroken = document.querySelector('.tiptap .var-badge').classList.contains('var-badge-broken');
      const reselected = ed().state.selection.node && ed().state.selection.node.type.name === 'varBadge';
      ed().commands.undo();
      await h.sleep(150);
      const undone = attrsOf(0);
      const checks = {
        wasBroken,
        replaced: after.table === PAGE && after.column === 'Montant' && after.key === PAGE + '.Montant',
        conditionKept: same(after.condition, COND),
        formatKept: same(after.format, { type: 'number', decimals: 2 }),
        notBrokenAnymore: !stillBroken,
        stillSelected: !!reselected,
        undoGivesTheOldColumn: undone.column === 'Libelle' && undone.key === PAGE + '.Libelle' && same(undone.condition, COND),
        listClosed: !openPanel(),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify(after) };
    },
  });

  cases.push({
    id: 'varcolumn_button_comes_with_a_column_renamed_in_grist_and_goes_once_the_variable_is_repaired',
    description: 'Une colonne renommée dans Grist rend la bulle rouge et « Colonne… » apparaît dans sa barre ; choisir la nouvelle colonne répare la bulle et la barre qui revient n’a plus le bouton ; renommée une seconde fois, il revient au retour sur le modèle',
    run: async (h) => {
      await seed(h, `<p>${badge(PAGE, 'Titre')}</p>`);
      const stub = window.__gristStub;
      const redBubble = () => document.querySelector('.tiptap .var-badge').classList.contains('var-badge-broken');
      const state = () => Object.assign(buttonState(), { bar: barIsOpen(), red: redBubble() });
      await selectBadge(h, 0);
      const beforeRename = state();
      const renamed = stub.renameColumn(PAGE, 'Titre', 'Intitule');
      await GristAPI.refreshSchema();
      // Retour sur le modèle : la bulle garde l'ancien nom.
      Editor.setHTML(`<p>${badge(PAGE, 'Titre')}</p>`);
      await h.sleep(200);
      await selectBadge(h, 0);
      const afterRename = state();
      pressColumn();
      await h.sleep(200);
      await pickRow(h, PAGE + '.Intitule');
      await h.sleep(250);
      const reselected = !!ed().state.selection.node && ed().state.selection.node.type.name === 'varBadge';
      const afterRepair = state();
      const repairedTo = attrsOf(0).column;
      // Le nom change encore dans Grist : au retour sur le modèle la bulle est de nouveau rouge et le bouton revient.
      const renamedAgain = stub.renameColumn(PAGE, 'Intitule', 'Objet');
      await GristAPI.refreshSchema();
      Editor.setHTML(`<p>${badge(PAGE, 'Intitule')}</p>`);
      await h.sleep(200);
      await selectBadge(h, 0);
      const afterSecondRename = state();
      const checks = {
        renamedInGrist: renamed && renamedAgain,
        saneBubbleHasNoButton: beforeRename.bar && !beforeRename.red && !beforeRename.shown && beforeRename.hidden,
        renamedBubbleIsRedAndHasTheButton: afterRename.bar && afterRename.red && afterRename.shown && !afterRename.hidden && !afterRename.disabled,
        listRepairsIt: repairedTo === 'Intitule' && reselected,
        repairedBubbleIsNeitherRedNorOffered: afterRepair.bar && !afterRepair.red && !afterRepair.shown && afterRepair.hidden,
        buttonComesBackWithTheNextRename: afterSecondRename.bar && afterSecondRename.red && afterSecondRename.shown,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'varcolumn_replacement_drops_only_what_fits_the_old_column',
    description: 'Le format d’un autre genre tombe (nombre, date, Oui / Non, zéro seul), celui du même genre reste ; la boucle reste pour une colonne de la même source et tombe sinon ; la condition reste toujours',
    run: async (h) => {
      await seed(h);
      const attrsWith = (extra) => Object.assign({ table: PAGE, column: 'Libelle', key: PAGE + '.Libelle', format: null, condition: COND, loop: null }, extra);
      const nodeOf = extra => ({ attrs: attrsWith(extra) });
      const item = (table, column) => ({ table, column, key: table + '.' + column });
      const fmtKept = (format, table, column) => same(VariableColumn.replacementAttrs(nodeOf({ format }), item(table, column)).format, format);
      const loop = { repeat: 'row', table: 'VcoLignes', via: null, filter: null, sort: { column: '', direction: 'asc' }, empty: 'header', emptyText: '', separator: ', ', lastSeparator: null };
      const loopNode = extra => ({ attrs: attrsWith(Object.assign({ table: 'VcoLignes', column: 'Designation', key: 'VcoLignes.Designation', loop }, extra)) });
      const loopKept = (table, column) => same(VariableColumn.replacementAttrs(loopNode(), item(table, column)).loop, loop);
      const checks = {
        numberToNumber: fmtKept({ type: 'number', decimals: 2 }, PAGE, 'Montant'),
        numberToText: !fmtKept({ type: 'number', decimals: 2 }, PAGE, 'Titre'),
        numberToDate: !fmtKept({ type: 'number', decimals: 2 }, PAGE, 'Echeance'),
        dateToDate: fmtKept({ type: 'date', preset: 'long' }, PAGE, 'Echeance'),
        dateToNumber: !fmtKept({ type: 'date', preset: 'long' }, PAGE, 'Montant'),
        boolToBool: fmtKept({ type: 'bool', style: 'classic' }, PAGE, 'Actif'),
        boolToText: !fmtKept({ type: 'bool', style: 'classic' }, PAGE, 'Titre'),
        zeroAloneIsANumberSetting: fmtKept({ zero: 'show' }, PAGE, 'Montant') && !fmtKept({ zero: 'show' }, PAGE, 'Titre'),
        noFormatStaysNone: VariableColumn.replacementAttrs(nodeOf({ format: null }), item(PAGE, 'Montant')).format === null,
        conditionAlwaysKept: same(VariableColumn.replacementAttrs(nodeOf({ format: { type: 'number' } }), item(PAGE, 'Titre')).condition, COND),
        loopKeptForAnotherColumnOfItsTable: loopKept('VcoLignes', 'Prix'),
        loopDroppedForThePageTable: !loopKept(PAGE, 'Titre'),
        loopDroppedForAnotherLinkedTable: !loopKept('VcoProjet', 'Nom'),
        loopDroppedForAnUnlinkedTable: !loopKept('VcoAnnuaire', 'Email'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || 'ok' };
    },
  });

  cases.push({
    id: 'varcolumn_variable_of_another_table_asks_for_the_key_first_and_refusal_changes_nothing',
    description: 'Choisir une colonne d’une table pas encore liée ouvre la fenêtre de choix de la clé avant tout : refusée, la bulle et les règles ne changent pas ; confirmée, la règle est enregistrée et la bulle prend la colonne ; une table déjà liée n’ouvre rien',
    run: async (h) => {
      await seed(h, `<p>${badge(PAGE, 'Libelle', attr('data-condition', COND))}</p>`);
      await selectBadge(h, 0);
      const before = JSON.stringify(attrsOf(0));
      pressColumn();
      await h.sleep(200);
      await pickRow(h, 'VcoAnnuaire.Email');
      await h.sleep(250);
      const opened = keyWindowOpen();
      const title = keyWindow() ? keyWindow().querySelector('h3, .var-modal-title, .pp-modal-title') : null;
      const heading = title ? title.textContent : '';
      const duringWindow = JSON.stringify(attrsOf(0));
      await closeKeyWindow(h);
      const afterRefusal = { attrs: JSON.stringify(attrsOf(0)), rule: ruleOf('VcoAnnuaire') };
      await selectBadge(h, 0);
      pressColumn();
      await h.sleep(200);
      await pickRow(h, 'VcoAnnuaire.Email');
      await h.sleep(250);
      document.getElementById('link-config-confirm').click();
      await h.sleep(300);
      const confirmed = { attrs: attrsOf(0), rule: ruleOf('VcoAnnuaire'), windowClosed: !keyWindowOpen() };
      // Une table déjà liée (VcoProjet) : rien à demander. La bulle réparée n'a plus le bouton : retour à une bulle cassée.
      Editor.setHTML(`<p>${badge(PAGE, 'Libelle', attr('data-condition', COND))}</p>`);
      await h.sleep(120);
      await selectBadge(h, 0);
      pressColumn();
      await h.sleep(200);
      await pickRow(h, 'VcoProjet.Nom');
      await h.sleep(250);
      const linked = { asked: keyWindowOpen(), attrs: attrsOf(0) };
      await closeKeyWindow(h);
      const checks = {
        windowOpened: opened,
        titleNamesBothTables: heading.indexOf(PAGE) !== -1 && heading.indexOf('VcoAnnuaire') !== -1,
        bubbleUntouchedWhileAsking: duringWindow === before,
        refusalChangesNothing: afterRefusal.attrs === before && afterRefusal.rule === null,
        confirmedSavesTheRule: same(confirmed.rule, ['match', 'id', 'Responsable']),
        confirmedReplacesTheColumn: confirmed.attrs.table === 'VcoAnnuaire' && confirmed.attrs.column === 'Email' && confirmed.attrs.key === 'VcoAnnuaire.Email' && same(confirmed.attrs.condition, COND),
        windowClosedAfterConfirm: confirmed.windowClosed,
        linkedTableAsksNothing: !linked.asked && linked.attrs.table === 'VcoProjet' && linked.attrs.column === 'Nom',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ heading, confirmed }) };
    },
  });

  cases.push({
    id: 'varcolumn_repaired_variable_reads_the_new_value_in_the_reader',
    description: 'Une fois la colonne choisie, la Lecture écrit la valeur de la nouvelle colonne pour la ligne en cours (la variable cassée écrivait un message d’erreur ou rien)',
    run: async (h) => {
      await seed(h, `<p>Titre : ${badge(PAGE, 'Libelle')}.</p>`);
      const read = async () => {
        const box = document.createElement('div');
        box.innerHTML = await ReaderMode.preview(Editor.getHTML(), PAGE, GristAPI.getCurrentRecord());
        return box.textContent.trim();
      };
      const broken = await read();
      await selectBadge(h, 0);
      pressColumn();
      await h.sleep(200);
      await pickRow(h, PAGE + '.Titre');
      await h.sleep(250);
      const repaired = await read();
      const checks = { wasNotTheValue: broken.indexOf('Notif 1') === -1, readsTheNewColumn: repaired === 'Titre : Notif 1.' };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ broken, repaired }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varColumn = cases;
})();
