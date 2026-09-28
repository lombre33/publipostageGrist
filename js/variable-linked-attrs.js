// Fenêtre « Autres attributs » d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) : depuis une variable dont la ligne est déterminée dans
// une autre table (ex. #Annuaire.NomPrenom, trouvée via Dossiers.Responsable), insère d'autres colonnes de la MÊME ligne (ex. Annuaire.Telephone) juste
// après elle, séparées par une espace. Les bulles insérées sont des #Variable ordinaires de cette table : elles passent par la même règle de liaison (une
// par table et par document, Publipostage_LiensTables), donc désignent bien la même ligne, en lecture comme à l'export. Proposée pour :
//  - une variable d'une autre table (liée à son insertion ; sinon la fenêtre de choix de la clé s'ouvre d'abord, comme à l'insertion) ;
//  - une colonne Référence de la table de la page (ex. #Dossiers.Responsable) : la table référencée est liée par cette colonne si elle ne l'est pas encore.
// Grisée dans la barre flottante ailleurs (js/floating-toolbars.js:linkedAttrsAvailable, même règle que targetFor ci-dessous).
const VariableLinkedAttrs = (function () {
  let modalEl = null;
  let refs = null;
  // { editor, pos, node, target, refColumn } pendant que la fenêtre est ouverte ; `opening` couvre l'éventuelle fenêtre de choix de la clé qui la précède.
  let state = null;
  let opening = false;
  let valuesGeneration = 0;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function isOpen() { return opening || !!state; }

  // Table dont on propose les colonnes : celle de la variable si c'est une autre table que celle de la page, sinon la table visée par une colonne
  // Référence de la page. Null sinon (colonne ordinaire de la page, RefList - plusieurs lignes, future boucle - ou référence vers la page elle-même, dont
  // les colonnes se résoudraient sur la ligne courante et pas sur la ligne référencée).
  function targetFor(attrs) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (attrs.table && attrs.table !== currentTableId) return { target: attrs.table, refColumn: null };
    const type = GristAPI.getColumnType(attrs.table, attrs.column) || '';
    if (type.indexOf('Ref:') !== 0) return null;
    const target = type.slice(4);
    return target && target !== currentTableId ? { target, refColumn: attrs.column } : null;
  }
  function isAvailable(attrs) { return !!targetFor(attrs); }

  // Une règle de liaison doit exister pour que les bulles insérées trouvent la ligne. Colonne Référence de la page sans règle : règle créée d'office
  // (identifiant de ligne = cette colonne - celle que la fenêtre de choix de la clé proposerait d'elle-même). Autre table sans règle : la fenêtre de
  // choix de la clé, comme à l'insertion. Faux si l'utilisateur annule.
  async function ensureLink(target, refColumn) {
    if (GristAPI.getLinkRule(target) || !GristAPI.getCurrentTableId()) return true;
    if (refColumn) {
      await GristAPI.saveLinkRule(target, { mode: 'match', colonneCible: 'id', colonneSource: refColumn });
      Variables.refreshLinkRulesPanel();
      return true;
    }
    return Variables.ensureLinkConfigured({ table: target });
  }

  function ensureModal() {
    if (modalEl) return;
    modalEl = el('div');
    modalEl.id = 'var-linked-modal';
    modalEl.style.display = 'none';
    modalEl.tabIndex = -1;
    const box = el('div', 'modal-content var-modal-content var-linked-modal-content');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'var-linked-title');
    const title = el('h3');
    title.id = 'var-linked-title';
    const subtitle = el('p', 'var-modal-intro');
    const filter = el('input', 'var-linked-filter');
    filter.type = 'search';
    const list = el('div', 'var-linked-list');
    const note = el('p', 'var-linked-note');
    note.setAttribute('aria-live', 'polite');
    const actions = el('div', 'var-modal-actions');
    const spacer = el('span', 'var-modal-spacer');
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    const insertBtn = el('button', 'var-modal-primary');
    insertBtn.type = 'button';
    actions.append(spacer, cancelBtn, insertBtn);
    box.append(title, subtitle, filter, list, note, actions);
    modalEl.appendChild(box);
    document.body.appendChild(modalEl);
    refs = { title, subtitle, filter, list, note, cancelBtn, insertBtn };

    filter.addEventListener('input', applyFilter);
    list.addEventListener('change', syncInsertButton);
    cancelBtn.addEventListener('click', close);
    insertBtn.addEventListener('click', insert);
    modalEl.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state) { event.preventDefault(); close(); }
    });
  }

  function checkedColumns() {
    return Array.from(refs.list.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')).map(i => i.value);
  }
  function syncInsertButton() {
    const count = checkedColumns().length;
    refs.insertBtn.textContent = I18n.t('varLinked.insert', { count });
    refs.insertBtn.disabled = count === 0;
  }
  function applyFilter() {
    const q = refs.filter.value.trim().toLowerCase();
    let visible = 0;
    refs.list.querySelectorAll('.var-linked-row').forEach(row => {
      const show = !q || row.dataset.search.indexOf(q) !== -1;
      row.hidden = !show;
      if (show) visible += 1;
    });
    const emptyEl = refs.list.querySelector('.var-linked-empty[data-role="no-match"]');
    if (emptyEl) emptyEl.hidden = visible !== 0;
  }

  // Colonnes proposées : toutes celles de la table, sauf les colonnes techniques d'affichage des références (gristHelper_*).
  function listedColumns(target) {
    return GristAPI.getColumns(target).filter(c => c.indexOf('gristHelper_') !== 0);
  }
  function renderList() {
    const { list } = refs;
    const { target, node } = state;
    list.replaceChildren();
    const cols = listedColumns(target);
    const currentCol = node.attrs.table === target ? node.attrs.column : null;
    if (!cols.filter(c => c !== currentCol).length) {
      list.appendChild(el('div', 'var-linked-empty', I18n.t('varLinked.empty', { table: target })));
    }
    cols.forEach(col => {
      const row = el('label', 'var-linked-row');
      const isCurrent = col === currentCol;
      row.classList.toggle('is-current', isCurrent);
      row.dataset.col = col;
      row.dataset.search = col.toLowerCase();
      const box = el('input');
      box.type = 'checkbox';
      box.value = col;
      box.disabled = isCurrent;
      const name = el('span', 'var-linked-col', col);
      if (isCurrent) { name.appendChild(document.createTextNode(' ')); name.appendChild(el('small', null, I18n.t('varLinked.thisVariable'))); }
      const value = el('span', 'var-linked-value');
      row.append(box, name, value);
      list.appendChild(row);
    });
    const noMatch = el('div', 'var-linked-empty', I18n.t('varLinked.noFilterMatch'));
    noMatch.dataset.role = 'no-match';
    noMatch.hidden = true;
    list.appendChild(noMatch);
    syncInsertButton();
  }

  function displayValue(rows, col) {
    if (GristAPI.getColumnType(state.target, col) === 'Attachments') return I18n.t('varLinked.attachmentValue');
    const raw = rows.length === 1 ? rows[0][col] : rows.map(r => r[col]);
    return Variables.formatValue(raw, null, state.target, col);
  }
  // Valeurs de la ligne liée à la ligne sélectionnée dans Grist - même recherche que la résolution des bulles (Variables.resolveLinkedRows), donc ce que
  // les attributs afficheront en lecture.
  async function loadValues() {
    const gen = ++valuesGeneration;
    const { note, list } = refs;
    const { target } = state;
    const currentTableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    const rule = GristAPI.getLinkRule(target);
    const insertHint = I18n.t('varLinked.noteInsert');
    if (!record || !currentTableId || !rule) { note.textContent = I18n.t('varLinked.noteNoRecord') + ' ' + insertHint; return; }
    note.textContent = I18n.t('varCond.debug.computing');
    let rows = [];
    try { rows = await Variables.resolveLinkedRows(target, rule, record, currentTableId); }
    catch (e) { console.warn('[VariableLinkedAttrs] valeurs indisponibles', e); }
    if (gen !== valuesGeneration || !state) return;
    if (!rows.length) { note.textContent = I18n.t('varLinked.noteNoLinkedRow', { table: target, id: record.id }) + ' ' + insertHint; return; }
    list.querySelectorAll('.var-linked-row').forEach(row => {
      const text = displayValue(rows, row.dataset.col);
      row.querySelector('.var-linked-value').textContent = text;
      row.title = text;
      row.dataset.search = (row.dataset.col + ' ' + text).toLowerCase();
    });
    applyFilter();
    note.textContent = I18n.t('varLinked.noteRow', { id: record.id }) + ' ' + insertHint;
  }

  function subtitleText(attrs, target, refColumn) {
    const currentTableId = GristAPI.getCurrentTableId();
    const badge = Variables.triggerChar() + (attrs.key || '');
    const rule = GristAPI.getLinkRule(target);
    if (!rule || !currentTableId) return I18n.t('varLinked.subtitlePlain', { badge });
    if (rule.mode === 'singleton') return I18n.t('varLinked.subtitleSingleton', { badge, table: target });
    const via = Variables.describeLinkVia(target, rule, currentTableId);
    // Colonne Référence déjà couverte par une AUTRE règle pour la même table (une seule par document) : les bulles insérées suivront cette règle-là, le
    // dire plutôt que d'annoncer « même ligne que » à tort.
    if (refColumn && !(rule.colonneCible === 'id' && rule.colonneSource === refColumn)) return I18n.t('varLinked.subtitleOtherLink', { table: target, via, badge });
    return I18n.t('varLinked.subtitleVia', { badge, via });
  }

  function insert() {
    if (!state) return;
    const cols = checkedColumns();
    if (!cols.length) return;
    const { editor, pos, node: original, target } = state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || node.attrs.table !== original.attrs.table || node.attrs.column !== original.attrs.column) {
      console.warn('[VariableLinkedAttrs] bulle introuvable à sa position d\'origine - rien inséré.');
      alert(I18n.t('varLinked.insertLost'));
      close();
      return;
    }
    // Ordre des colonnes de la table (celui de la liste), jamais l'ordre des clics.
    const content = [];
    cols.forEach(col => {
      content.push({ type: 'text', text: ' ' });
      content.push({ type: 'varBadge', attrs: { table: target, column: col, key: target + '.' + col } });
    });
    const insertAt = pos + node.nodeSize;
    close({ keepFocus: true });
    editor.chain().focus().insertContentAt(insertAt, content).run();
  }

  function close(opts) {
    if (!modalEl) return;
    const editor = state && state.editor;
    modalEl.style.display = 'none';
    state = null;
    valuesGeneration += 1;
    if (editor && !(opts && opts.keepFocus)) editor.view.focus();
  }

  // `pos` : position de la bulle, capturée au clic sur l'icône de la barre flottante.
  async function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || opening || state) return;
    const t = targetFor(node.attrs);
    if (!t) return;
    opening = true;
    EditorCore.hideFloatingContextToolbars();
    let linked = false;
    try { linked = await ensureLink(t.target, t.refColumn); }
    catch (e) { console.error('[VariableLinkedAttrs] échec de la liaison de « ' + t.target + ' »', e); }
    finally { opening = false; }
    if (!linked) { editor.view.focus(); return; }
    ensureModal();
    state = { editor, pos, node, target: t.target, refColumn: t.refColumn };
    const { title, subtitle, filter, cancelBtn } = refs;
    title.textContent = I18n.t('varLinked.title', { table: t.target });
    subtitle.textContent = subtitleText(node.attrs, t.target, t.refColumn);
    filter.value = '';
    filter.placeholder = I18n.t('varLinked.filter');
    filter.setAttribute('aria-label', I18n.t('varLinked.filter'));
    cancelBtn.textContent = I18n.t('common.cancel');
    renderList();
    modalEl.style.display = 'flex';
    filter.focus();
    loadValues();
  }

  return { open, close, isOpen, isAvailable };
})();
