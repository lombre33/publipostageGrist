// Suite "varValueTip" - l'info-bulle de valeur d'une bulle de l'éditeur (js/variable-tip.js, js/editor-tip.js ; ReaderMode.peek dans js/reader-mode.js, LoopRules.zoneChainOf et bindElement dans
// js/loop-rules.js, GristAPI.withSharedReadPass dans js/grist-api.js) : laisser la souris sur une bulle sans cliquer montre ce qu'elle vaut pour la ligne sélectionnée dans Grist, comme la Lecture
// l'écrit ; dans une zone répétée, les 5 premiers tours. Demande d'Antoine du 12/11. La vraie souris (700×400, barre de GFS) est dans verify-var-tip-mouse.mjs (script varTipMouse).
// Jeu de données fictif : dossiers (table de la page), leurs lignes (VtLignes, 7 pour le dossier 1), leurs détails (VtSous, rattachés à une ligne).
(function () {
  const cases = [];

  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 };
  const TABLE = 'VtDossiers';
  const ROW = { repeat: 'row', table: 'VtLignes', empty: 'header' };
  const ITEM = { repeat: 'item', table: 'VtLignes', empty: 'none' };
  const SUB_ITEM = { repeat: 'item', table: 'VtSous', within: 'VtLignes', by: 'Ligne', empty: 'none' };
  const SECTION = { repeat: 'section', table: 'VtLignes', empty: 'hide' };
  const NOT_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  function badge(table, column, extra) {
    const loop = extra && extra.loop;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat}"` : '';
    const other = extra && extra.condition ? attr('data-condition', extra.condition) : '';
    const around = (extra && extra.before ? ` data-before="${extra.before}"` : '') + (extra && extra.after ? ` data-after="${extra.after}"` : '');
    const otherwise = extra && extra.otherwise ? ` data-otherwise-table="${extra.otherwise.table}" data-otherwise-column="${extra.otherwise.column}" data-otherwise-key="${extra.otherwise.table}.${extra.otherwise.column}"` : '';
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${loopAttrs}${other}${around}${otherwise}></span>`;
  }
  const rowTable = `<table><tbody><tr><td><p>${badge('VtLignes', 'Designation', { loop: ROW })}</p></td><td><p>${badge('VtLignes', 'Qte')}</p></td></tr></tbody></table>`;

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setVariables('VtLignes', { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setVariables('VtSous', { Ligne: 'Ref:VtLignes', Detail: 'Text', manualSort: 'ManualSortPos' });
    stub.setRows(TABLE, [Object.assign({}, RECORD_1), Object.assign({}, RECORD_2), { id: 3, Titre: '', Statut: 'Normal', Montant: 0 }]);
    const lines = [];
    for (let i = 1; i <= 7; i++) lines.push({ id: i, Dossier: 1, Designation: 'Ligne ' + i, Qte: i * 10, manualSort: i });
    lines.push({ id: 8, Dossier: 2, Designation: 'Ligne seule', Qte: 1, manualSort: 8 });
    stub.setRows('VtLignes', lines);
    stub.setRows('VtSous', [
      { id: 1, Ligne: 1, Detail: 'Détail a', manualSort: 1 }, { id: 2, Ligne: 1, Detail: 'Détail b', manualSort: 2 }, { id: 3, Ligne: 1, Detail: 'Détail c', manualSort: 3 },
      { id: 4, Ligne: 2, Detail: 'Détail d', manualSort: 4 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('VtLignes');
    await GristAPI.saveLinkRule('VtLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    VariableTip.close();
    VariableTip.setOn(true);
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  function ed() { return EditorCore.getEditor(); }
  const badges = () => Array.from(document.querySelectorAll('.tiptap span.var-badge'));
  const badgeAt = index => badges()[index];
  async function load(h, html) {
    Editor.setHTML(html);
    await h.sleep(120);
  }
  const tipEl = () => document.getElementById('pp-var-tip');
  const shown = () => { const tip = tipEl(); return !!tip && !tip.hidden; };
  const tipText = () => (shown() ? tipEl().textContent : null);
  const over = el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  const out = (el, to) => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: to || document.body }));
  // Un vrai mouvement de souris (3 px ou plus) : ce qui arme l’info-bulle après une frappe ou un défilement.
  const wiggle = el => { el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 })); el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 40, clientY: 10 })); };
  const key = (name, type) => document.dispatchEvent(new KeyboardEvent(type || 'keydown', { key: name, bubbles: true }));
  const peek = (el, record, max) => ReaderMode.peek(el, TABLE, record || GristAPI.getCurrentRecord(), { root: ed().view.dom, max: max || 5 });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Ce que la Lecture écrit pour ce HTML (la même porte que le PDF, le Word et l'e-mail).
  async function read(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  async function done(h) {
    VariableTip.close();
    VariableTip.setOn(true);
    document.getElementById('reader-container').style.display = '';
    await h.sleep(10);
  }

  cases.push({
    id: 'vartip_peek_gives_the_value_the_reading_writes_for_the_chosen_row',
    description: 'ReaderMode.peek : la valeur d’une bulle de l’éditeur pour la ligne sélectionnée est celle que la Lecture écrit (avec le « Avant » / « Après »), elle change avec la ligne, et le document de l’éditeur n’est pas touché',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badge(TABLE, 'Titre')}</p><p>${badge(TABLE, 'Montant', { before: 'Total : ', after: ' €' })}</p>`;
      await load(h, html);
      const before = ed().getHTML();
      const one = await peek(badgeAt(0));
      const two = await peek(badgeAt(1));
      const reading = Array.from((await read(html)).querySelectorAll('p')).map(p => p.textContent);
      await setRecord(h, RECORD_2);
      const other = await peek(badgeAt(0), GristAPI.getCurrentRecord());
      const untouched = ed().getHTML() === before;
      const pass = one.turns.length === 1 && one.zone === null && one.turns[0].text === 'Dossier A' && /^Total : .*€$/.test(two.turns[0].text)
        && reading[0] === one.turns[0].text && reading[1] === two.turns[0].text && other.turns[0].text === 'Dossier B' && untouched;
      await done(h);
      return { pass, notes: JSON.stringify({ one, two, reading, other, untouched }) };
    },
  });

  cases.push({
    id: 'vartip_peek_states_hidden_empty_otherwise',
    description: 'ReaderMode.peek dit en clair pourquoi une bulle n’écrit rien : masquée par sa condition, vide, ou remplacée par son sinon',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badge(TABLE, 'Titre', { condition: NOT_URGENT })}</p><p>${badge(TABLE, 'Titre', { condition: NOT_URGENT, otherwise: { table: TABLE, column: 'Statut' } })}</p>`;
      await load(h, html);
      const hidden = await peek(badgeAt(0));
      const viaOtherwise = await peek(badgeAt(1));
      await setRecord(h, { id: 3, Titre: '', Statut: 'Normal', Montant: 0 });
      const holds = await peek(badgeAt(0), GristAPI.getCurrentRecord());
      const pass = same(hidden.turns, [{ hidden: true }]) && viaOtherwise.turns[0].text === 'Urgent' && viaOtherwise.turns[0].otherwise === true && same(holds.turns, [{ empty: true }]);
      await done(h);
      return { pass, notes: JSON.stringify({ hidden, viaOtherwise, holds }) };
    },
  });

  cases.push({
    id: 'vartip_peek_row_zone_gives_the_first_five_turns_like_the_reading',
    description: 'Bulle dans une ligne de tableau répétée (7 lignes liées) : cinq tours au plus, le total, et les mêmes valeurs que les 5 premières lignes de la Lecture ; la bulle qui porte la boucle est lue de même',
    run: async (h) => {
      await seed(h);
      await load(h, rowTable);
      const qte = await peek(badgeAt(1));
      const owner = await peek(badgeAt(0));
      const reading = Array.from((await read(rowTable)).querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim()));
      const pass = qte.zone && qte.zone.repeat === 'row' && qte.zone.nested === false && qte.total === 7 && qte.turns.length === 5
        && same(qte.turns.map(t => t.text), reading.slice(0, 5).map(r => r[1])) && same(owner.turns.map(t => t.text), reading.slice(0, 5).map(r => r[0]))
        && owner.total === 7;
      await done(h);
      return { pass, notes: JSON.stringify({ qte, owner, reading }) };
    },
  });

  cases.push({
    id: 'vartip_peek_nested_zone_reads_the_first_turn_of_the_outer_zone',
    description: 'Zone répétée dans une autre : la bulle du dedans est lue pour les tours de sa zone, dans la première ligne de la zone qui l’entoure ; une section répétée est reconnue en remontant aux frères du bloc',
    run: async (h) => {
      await seed(h);
      const nested = `<ul><li><p>${badge('VtLignes', 'Designation', { loop: ITEM })}</p><ul><li><p>${badge('VtSous', 'Detail', { loop: SUB_ITEM })}</p></li></ul></li></ul>`;
      await load(h, nested);
      const inner = await peek(badgeAt(1));
      const outer = await peek(badgeAt(0));
      const reading = Array.from((await read(nested)).querySelectorAll('li li')).map(li => li.textContent.trim());
      const sectionHtml = `<h2>${badge('VtLignes', 'Designation', { loop: SECTION })}</h2><p>Quantité ${badge('VtLignes', 'Qte')}</p><h1>Suite</h1><p>${badge(TABLE, 'Titre')}</p>`;
      await load(h, sectionHtml);
      const inSection = await peek(badgeAt(1));
      const afterSection = await peek(badgeAt(2));
      const pass = inner.zone && inner.zone.nested === true && inner.total === 3 && same(inner.turns.map(t => t.text), ['Détail a', 'Détail b', 'Détail c'])
        && same(inner.turns.map(t => t.text), reading.slice(0, 3)) && outer.zone && outer.zone.nested === false && outer.total === 7
        && inSection.zone && inSection.zone.repeat === 'section' && inSection.total === 7 && inSection.turns.length === 5 && inSection.turns[1].text === '20'
        && afterSection.zone === null && afterSection.turns[0].text === 'Dossier A';
      await done(h);
      return { pass, notes: JSON.stringify({ inner, outer, reading, inSection, afterSection }) };
    },
  });

  cases.push({
    id: 'vartip_zone_without_any_row_and_no_row_selected',
    description: 'Zone répétée sans aucune ligne pour ce dossier : aucun tour, dit en clair dans l’info-bulle ; sans ligne sélectionnée dans Grist : une phrase neutre, pas une erreur',
    run: async (h) => {
      await seed(h);
      await load(h, rowTable);
      await setRecord(h, { id: 3, Titre: '', Statut: 'Normal', Montant: 0 });
      const none = await peek(badgeAt(1));
      over(badgeAt(1));
      await h.sleep(650);
      const zoneText = tipText();
      out(badgeAt(1));
      await h.sleep(250);
      window.__gristStub.fireRecord(null, TABLE);
      await h.sleep(50);
      over(badgeAt(0));
      await h.sleep(650);
      const noRowText = tipText();
      const pass = none.turns.length === 0 && none.total === 0 && /Aucune ligne à répéter/.test(zoneText || '') && noRowText && /Aucune ligne n’est sélectionnée/.test(noRowText);
      await done(h);
      return { pass, notes: JSON.stringify({ none, zoneText, noRowText }) };
    },
  });

  cases.push({
    id: 'vartip_hover_shows_value_and_row_then_closes_when_the_mouse_leaves',
    description: 'La souris reste 0,5 s sur une bulle : l’info-bulle donne la valeur et « nom · ligne n° … » (role tooltip, aria-describedby sur la bulle) ; avant 0,5 s rien ; elle part quand la souris s’en va',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>${badge(TABLE, 'Titre')}</p>`);
      await h.sleep(1600); // une info-bulle fermée il y a moins de 1,5 s raccourcit l’attente : on repart à froid
      const b = badgeAt(0);
      over(b);
      await h.sleep(250);
      const early = shown();
      await h.sleep(450);
      const tip = tipEl();
      const text = tipText();
      const describedBy = b.getAttribute('aria-describedby');
      const role = tip && tip.getAttribute('role');
      out(b);
      await h.sleep(60);
      const stillGrace = shown();
      await h.sleep(250);
      const closed = !shown();
      const pass = !early && /^Dossier A/.test(text || '') && text.includes(b.textContent.trim()) && /ligne n° 1/.test(text) && describedBy === 'pp-var-tip' && role === 'tooltip'
        && stillGrace && closed && !b.hasAttribute('aria-describedby');
      await done(h);
      return { pass, notes: JSON.stringify({ early, text, describedBy, role, stillGrace, closed }) };
    },
  });

  cases.push({
    id: 'vartip_loop_turns_list_with_more_count_in_the_tip',
    description: 'Dans une zone répétée, l’info-bulle écrit « Répétée pour 7 lignes », les 5 premiers tours numérotés et « + 2 autres »',
    run: async (h) => {
      await seed(h);
      await load(h, rowTable);
      over(badgeAt(1));
      await h.sleep(700);
      const tip = tipEl();
      const turns = tip ? Array.from(tip.querySelectorAll('.pp-var-tip-turn')).map(t => t.textContent) : [];
      const notes = tip ? Array.from(tip.querySelectorAll('.pp-var-tip-note')).map(n => n.textContent) : [];
      const pass = same(turns, ['110', '220', '330', '440', '550']) && same(notes, ['Répétée pour 7 lignes', '+ 2 autres']);
      await done(h);
      return { pass, notes: JSON.stringify({ turns, notes }) };
    },
  });

  cases.push({
    id: 'vartip_flawed_bubbles_keep_their_own_title_and_no_value_tip',
    description: 'Une bulle rouge (colonne disparue) garde son info-bulle d’origine (title) : aucune info-bulle de valeur',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>${badge(TABLE, 'ColonneDisparue')}</p>`);
      Editor.markBadgeValidity(ed().view.dom, ed());
      await h.sleep(60);
      const b = badgeAt(0);
      const flawed = b.classList.contains('var-badge-broken');
      over(b);
      await h.sleep(700);
      const pass = flawed && !shown() && b.title.length > 0;
      await done(h);
      return { pass, notes: JSON.stringify({ flawed, shown: shown(), title: b.title }) };
    },
  });

  cases.push({
    id: 'vartip_parked_pointer_under_moving_text_needs_a_real_mouse_move',
    description: 'Après une frappe, un texte qui glisse sous une souris parquée envoie un mouseover : rien ne s’ouvre ; un vrai mouvement (3 px ou plus) l’arme, et l’info-bulle vient 0,5 s après',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>${badge(TABLE, 'Titre')}</p>`);
      const b = badgeAt(0);
      key('a');
      over(b);
      await h.sleep(700);
      const parked = shown();
      const move = x => b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: 100 }));
      move(100); move(101);
      await h.sleep(700);
      const tiny = shown();
      move(112);
      await h.sleep(250);
      const early = shown();
      await h.sleep(450);
      const moved = shown();
      const pass = !parked && !tiny && !early && moved;
      await done(h);
      return { pass, notes: JSON.stringify({ parked, tiny, early, moved }) };
    },
  });

  cases.push({
    id: 'vartip_closes_on_escape_click_keystroke_and_record_change',
    description: 'L’info-bulle se ferme à Échap (et ne revient pas tant que la souris n’a pas quitté la bulle), au clic, à une touche et quand la ligne de Grist change ; une seconde bulle survolée juste après s’ouvre plus vite',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>${badge(TABLE, 'Titre')} ${badge(TABLE, 'Statut')}</p>`);
      const [first, second] = badges();
      const opens = async el => { wiggle(el); over(el); await h.sleep(650); return shown(); };
      const results = {};
      results.escOpen = await opens(first);
      key('Escape');
      results.escClosed = !shown();
      wiggle(first);
      await h.sleep(700);
      results.noReturn = !shown();
      out(first);
      await h.sleep(250);
      results.clickOpen = await opens(first);
      first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      results.clickClosed = !shown();
      out(first);
      await h.sleep(250);
      results.typeOpen = await opens(first);
      key('b');
      results.typeClosed = !shown();
      out(first);
      await h.sleep(250);
      results.recordOpen = await opens(first);
      await setRecord(h, RECORD_2);
      results.recordClosed = !shown();
      out(first);
      // Une seconde bulle juste après une info-bulle fermée : 0,15 s d’attente au lieu de 0,5 s.
      wiggle(second);
      over(second);
      await h.sleep(300);
      results.warm = shown();
      const pass = results.escOpen && results.escClosed && results.noReturn && results.clickOpen && results.clickClosed && results.typeOpen && results.typeClosed
        && results.recordOpen && results.recordClosed && results.warm;
      await done(h);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'vartip_keyboard_selected_bubble_shows_the_tip_below_and_escape_closes_it',
    description: 'Au clavier : la bulle sélectionnée aux flèches montre la même info-bulle après 0,6 s, sous elle, annoncée aux lecteurs d’écran ; Échap la ferme ; la ligne « Voir la valeur de la variable sélectionnée » de la palette (Shortcuts.run) l’ouvre tout de suite ; sans bulle sélectionnée, elle ne fait rien',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>Avant ${badge(TABLE, 'Titre')} après</p>`);
      let pos = null;
      ed().state.doc.descendants((node, p) => { if (pos == null && node.type.name === 'varBadge') pos = p; });
      ed().commands.setNodeSelection(pos);
      ed().view.focus();
      document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      await h.sleep(300);
      const early = shown();
      await h.sleep(500);
      const open = shown();
      const b = badgeAt(0);
      const below = open && tipEl().getBoundingClientRect().top >= b.getBoundingClientRect().bottom;
      const live = document.querySelector('.pp-var-tip-live');
      const announced = !!live && /Dossier A/.test(live.textContent);
      key('Escape');
      const closed = !shown();
      const now = Shortcuts.run('variableValue') === true;
      await h.sleep(80);
      const immediate = now && shown();
      VariableTip.close();
      ed().commands.setTextSelection(1);
      const none = Shortcuts.run('variableValue') === true;
      const pass = !early && open && below && announced && closed && immediate && none === false;
      await done(h);
      return { pass, notes: JSON.stringify({ early, open, below, announced, closed, immediate, none }) };
    },
  });

  cases.push({
    id: 'vartip_switch_off_in_settings_and_texts_in_both_languages',
    description: 'Réglages > Thème : la case éteint l’info-bulle (rien au survol, clé pp_variable_tip) et la rallume ; chaque texte existe en français et en anglais',
    run: async (h) => {
      await seed(h);
      await load(h, `<p>${badge(TABLE, 'Titre')}</p>`);
      const box = document.getElementById('settings-var-tip');
      document.getElementById('v2-btn-settings').click();
      await h.sleep(80);
      const startsOn = !!box && box.checked === true;
      box.click();
      await h.sleep(40);
      const off = VariableTip.isOn() === false && PersonStore.get('pp_variable_tip') === 'off';
      over(badgeAt(0));
      await h.sleep(700);
      const silent = !shown();
      out(badgeAt(0));
      box.click();
      await h.sleep(40);
      const backOn = VariableTip.isOn() === true && PersonStore.get('pp_variable_tip') === 'on';
      const keys = ['varTip.empty', 'varTip.hidden', 'varTip.noRow', 'varTip.files', 'varTip.otherwise', 'varTip.zone', 'varTip.zoneNested', 'varTip.more', 'varTip.zoneEmpty', 'varTip.foot', 'settings.varTip.label', 'settings.varTip.hint', 'settings.varTip.on', 'settings.varTip.off', 'shortcuts.action.variableValue', 'palette.kw.variableValue'];
      const missing = {};
      const lang = I18n.getLang();
      try { for (const code of ['fr', 'en']) { I18n.setLang(code); missing[code] = keys.filter(k => I18n.t(k) === k); } } finally { I18n.setLang(lang); }
      document.getElementById('settings-close').click();
      const pass = startsOn && off && silent && backOn && missing.fr.length === 0 && missing.en.length === 0;
      await done(h);
      return { pass, notes: JSON.stringify({ startsOn, off, silent, backOn, missing }) };
    },
  });

  cases.push({
    id: 'vartip_hovering_ten_bubbles_reads_each_table_once_and_typing_reads_nothing',
    description: 'Le coût : balayer plusieurs fois la même bulle de zone répétée dans les 10 s relit zéro table de plus (passe partagée), une autre ligne de Grist repart d’une passe neuve, et taper dans un document qui a des bulles ne lance aucune lecture',
    run: async (h) => {
      await seed(h);
      await load(h, rowTable + `<p>${badge(TABLE, 'Titre')}</p>`);
      let reads = 0;
      const original = window.grist.docApi.fetchTable;
      window.grist.docApi.fetchTable = function () { reads++; return original.apply(this, arguments); };
      let peeks = 0;
      const peekOriginal = ReaderMode.peek;
      ReaderMode.peek = function () { peeks++; return peekOriginal.apply(this, arguments); };
      try {
        await peek(badgeAt(1));
        const first = reads;
        await peek(badgeAt(0));
        await peek(badgeAt(1));
        await peek(badgeAt(2));
        const again = reads - first;
        await setRecord(h, RECORD_2);
        const before = reads;
        await peek(badgeAt(1), GristAPI.getCurrentRecord());
        const fresh = reads - before;
        peeks = 0;
        reads = 0;
        ed().commands.focus('end');
        await h.typeText('bonjour');
        await h.sleep(200);
        const typing = { peeks, reads };
        const pass = first > 0 && again === 0 && fresh > 0 && typing.peeks === 0 && typing.reads === 0;
        await done(h);
        return { pass, notes: JSON.stringify({ first, again, fresh, typing }) };
      } finally {
        window.grist.docApi.fetchTable = original;
        ReaderMode.peek = peekOriginal;
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varValueTip = cases;
})();
