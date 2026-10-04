// Fenêtre « Assemblage avant impression… » du menu Exporter en PDF (js/main.js:onExportBatch, export 'pdfSheets') : pose les pages de chaque ligne
// sur des feuilles A4 ou A3, une page par emplacement et dans l'ordre de la table, avec ou sans traits de coupe, pour sortir des planches prêtes à
// imprimer (4 A6 sur une A4, 2 A5 sur une A4 en paysage...). Elle ne fait que choisir (la feuille, son sens, le nombre d'emplacements en largeur et
// en hauteur, les traits de coupe) et tient lieu de confirmation du lot. La géométrie est à SheetLayout, la même pour l'aperçu de la fenêtre et pour
// le PDF que js/pdf-merge.js (createSheets) écrit : l'aperçu montre ce que le fichier porte.
// `open` rend une promesse : le réglage { sheet, orientation, cols, rows, marks, layout } ou null (Annuler, Échap). Le dernier choix (feuille, sens,
// traits) est gardé par navigateur (localStorage, comme la langue et le thème) ; les emplacements repartent du maximum que la feuille reçoit, la page
// du modèle pouvant avoir changé entre-temps. Une feuille où la page ne tient pas reste affichée, grisée, avec la raison en info-bulle.
const SheetAssemblyDialog = (function () {
  const STORAGE = 'pp_sheet_assembly';
  const PREVIEW_PX = 108; // côté du carré où la feuille d'aperçu tient, quel que soit son sens
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let win = null;
  let refs = null;
  let state = null;   // { sheet, orientation, cols, rows, marks }
  let ctx = null;     // la demande en cours : { count (lignes de la table), grid (modèle de grille : « valeurs » plutôt que « lignes ») }
  let current = null; // { finish(valeur) } : de quoi refermer la fenêtre en rendant sa réponse

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(name => e.setAttribute(name, attrs[name]));
    return e;
  }

  function readSaved() {
    try { const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return raw && typeof raw === 'object' ? raw : null; } catch (e) { return null; }
  }
  function writeSaved() {
    try { localStorage.setItem(STORAGE, JSON.stringify({ sheet: state.sheet, orientation: state.orientation, marks: state.marks })); } catch (e) { /* stockage indisponible - le choix ne survivra pas au rechargement */ }
  }

  // La page du modèle ouvert (sens et format compris) : celle que chaque ligne produit ; un macro-modèle porte la sienne et l'impose à ses annexes.
  function pageSize() { return PageLayout.getPageSizePt(); }
  function gridFor(sheet, orientation) { return SheetLayout.maxGrid(SheetLayout.sheetSize(sheet, orientation), pageSize()); }
  function slotsFor(sheet, orientation) { return SheetLayout.slotCount(gridFor(sheet, orientation)); }

  // Un groupe de choix à une seule réponse (rôle radiogroup) fait de vraies cases d'option : les flèches, Tab et le grisage sont ceux du navigateur.
  function radioGroup(name, labelId, values, onPick) {
    const group = el('div', 'pp-sheets-options');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', labelId);
    const items = values.map(value => {
      const label = el('label', 'pp-sheets-option');
      const input = el('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.addEventListener('change', () => { if (input.checked) onPick(value); });
      const text = el('span');
      label.append(input, text);
      group.appendChild(label);
      return { value, label, input, text };
    });
    return { group, items };
  }

  // Un nombre d'emplacements (1 au maximum que la feuille reçoit dans ce sens), nommé par son libellé de ligne puis par son texte (« Emplacements en
  // largeur »).
  function slotField(id, rowLabelId, onPick) {
    const field = el('label', 'pp-sheets-slot-field');
    const select = el('select', 'pp-sheets-select');
    select.id = id;
    const text = el('span');
    text.id = id + '-text';
    select.setAttribute('aria-labelledby', rowLabelId + ' ' + text.id);
    select.addEventListener('change', () => onPick(Number(select.value)));
    field.append(select, text);
    return { field, select, text };
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-sheets-modal', titleId: 'pp-sheets-title', size: 'md', boxClass: 'pp-sheets-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(null); else win.hide(); },
    });
    const grid = el('div', 'pp-sheets-grid');

    const sheetLabel = el('span', 'pp-sheets-label'); sheetLabel.id = 'pp-sheets-sheet-label';
    const sheets = radioGroup('pp-sheets-sheet', 'pp-sheets-sheet-label', SheetLayout.SHEETS, chooseSheet);
    sheets.items.forEach(item => { item.text.textContent = item.value; });

    const orientationLabel = el('span', 'pp-sheets-label'); orientationLabel.id = 'pp-sheets-orientation-label';
    const orientations = radioGroup('pp-sheets-orientation', 'pp-sheets-orientation-label', SheetLayout.ORIENTATIONS, chooseOrientation);

    const slotsLabel = el('span', 'pp-sheets-label'); slotsLabel.id = 'pp-sheets-slots-label';
    const slots = el('div', 'pp-sheets-slots');
    slots.setAttribute('role', 'group');
    slots.setAttribute('aria-labelledby', 'pp-sheets-slots-label');
    const across = slotField('pp-sheets-cols', 'pp-sheets-slots-label', n => pick({ cols: n }));
    const times = el('span', 'pp-sheets-times', '×');
    times.setAttribute('aria-hidden', 'true');
    const down = slotField('pp-sheets-rows', 'pp-sheets-slots-label', n => pick({ rows: n }));
    slots.append(across.field, times, down.field);

    const marksLabel = el('span', 'pp-sheets-label'); marksLabel.id = 'pp-sheets-marks-label';
    const marks = radioGroup('pp-sheets-marks', 'pp-sheets-marks-label', ['off', 'on'], value => pick({ marks: value === 'on' }));

    // La feuille d'aperçu occupe la dernière colonne des trois premières lignes de réglage (la 4e, les emplacements, a besoin de toute la largeur) ;
    // le papier est blanc dans les deux thèmes, comme celui du document.
    const preview = el('div', 'pp-sheets-preview');
    preview.setAttribute('aria-hidden', 'true');
    const svg = svgEl('svg', { class: 'pp-sheets-svg' });
    preview.appendChild(svg);

    // Chaque indication commence sous le champ qu'elle concerne, jamais sous son libellé : l'échelle (seulement si les pages sont réduites) sous les
    // traits de coupe, la règle de l'ordre sous les emplacements. Le résumé de ce que le choix donne ferme la fenêtre (aria-live : il suit chaque
    // changement).
    const scaled = el('p', 'pp-sheets-note'); scaled.id = 'pp-sheets-scaled';
    scaled.setAttribute('aria-live', 'polite');
    marks.group.setAttribute('aria-describedby', scaled.id);
    const hint = el('p', 'pp-sheets-note'); hint.id = 'pp-sheets-hint';
    slots.setAttribute('aria-describedby', hint.id);
    const summary = el('p', 'pp-sheets-summary');
    summary.setAttribute('aria-live', 'polite');

    grid.append(sheetLabel, sheets.group, orientationLabel, orientations.group, marksLabel, marks.group, scaled, slotsLabel, slots, hint, preview, summary);
    win.body.appendChild(grid);

    const spacer = el('span', 'var-modal-spacer');
    const cancel = el('button');
    cancel.type = 'button';
    const ok = el('button', 'var-modal-primary');
    ok.type = 'button';
    win.actions.append(spacer, cancel, ok);
    refs = { sheetLabel, sheets, orientationLabel, orientations, slotsLabel, across, down, marksLabel, marks, svg, summary, hint, scaled, cancel, ok };

    // Entrée valide depuis n'importe quel réglage (une case d'option, la liste d'un nombre), sauf pendant une composition de texte.
    win.body.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      apply();
    });
    ok.addEventListener('click', apply);
  }

  // Les réglages de départ : le dernier choix gardé s'il laisse une page tenir sur la feuille, sinon le meilleur pour ces pages (la feuille A4, le
  // sens qui en place le plus) ; les emplacements au maximum.
  function initialState() {
    const saved = readSaved();
    const page = pageSize();
    const fallback = SheetLayout.best(page) || { sheet: 'A3', orientation: 'landscape' };
    let sheet = fallback.sheet;
    let orientation = fallback.orientation;
    if (saved && SheetLayout.SHEETS.includes(saved.sheet) && SheetLayout.ORIENTATIONS.includes(saved.orientation) && slotsFor(saved.sheet, saved.orientation) > 0) {
      sheet = saved.sheet;
      orientation = saved.orientation;
    }
    const grid = gridFor(sheet, orientation);
    return { sheet, orientation, cols: Math.max(1, grid.cols), rows: Math.max(1, grid.rows), marks: !!(saved && saved.marks === true) };
  }

  // Changer de feuille repart du meilleur sens pour elle et de tous ses emplacements ; changer de sens, de tous les emplacements de ce sens.
  function chooseSheet(sheet) {
    const choice = SheetLayout.bestOrientation(sheet, pageSize());
    if (!choice) return render();
    Object.assign(state, { sheet, orientation: choice.orientation, cols: choice.cols, rows: choice.rows });
    render();
  }
  function chooseOrientation(orientation) {
    const grid = gridFor(state.sheet, orientation);
    if (!SheetLayout.slotCount(grid)) return render();
    Object.assign(state, { orientation, cols: grid.cols, rows: grid.rows });
    render();
  }
  function pick(change) {
    Object.assign(state, change);
    render();
  }

  // La planche que la fenêtre décrit en ce moment (emplacements bornés au maximum de la feuille dans ce sens).
  function described() {
    const grid = gridFor(state.sheet, state.orientation);
    return SheetLayout.compute({
      sheet: SheetLayout.sheetSize(state.sheet, state.orientation), page: pageSize(),
      cols: Math.min(state.cols, Math.max(1, grid.cols)), rows: Math.min(state.rows, Math.max(1, grid.rows)), marks: state.marks,
    });
  }

  // La feuille d'aperçu : la feuille entière à l'échelle du carré de PREVIEW_PX, ses emplacements numérotés dans l'ordre de lecture et ses traits de
  // coupe, d'après les mêmes mesures que le PDF. L'épaisseur des traits est fixe à l'écran (vector-effect, css/sheet-assembly.css) : à cette échelle,
  // un trait de 0,5 pt ne se verrait pas.
  function renderPreview(layout) {
    const { svg } = refs;
    const { sheet } = layout;
    const k = Math.min(PREVIEW_PX / sheet.width, PREVIEW_PX / sheet.height);
    svg.setAttribute('viewBox', '0 0 ' + sheet.width + ' ' + sheet.height);
    svg.setAttribute('width', String(Math.round(sheet.width * k)));
    svg.setAttribute('height', String(Math.round(sheet.height * k)));
    svg.textContent = '';
    svg.appendChild(svgEl('rect', { class: 'pp-sheets-paper', x: 0, y: 0, width: sheet.width, height: sheet.height }));
    const fontSize = Math.max(Math.min(layout.cellWidth, layout.cellHeight) * 0.28, 8 / k);
    layout.slots.forEach(slot => {
      svg.appendChild(svgEl('rect', { class: 'pp-sheets-slot', x: slot.x, y: slot.y, width: slot.width, height: slot.height }));
      const number = svgEl('text', { class: 'pp-sheets-slot-number', x: slot.x + slot.width / 2, y: slot.y + slot.height / 2, 'font-size': fontSize });
      number.textContent = String(slot.index + 1);
      svg.appendChild(number);
    });
    layout.cutMarks.forEach(mark => svg.appendChild(svgEl('line', { class: 'pp-sheets-mark', x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2 })));
  }

  function fillSelect(select, max, value) {
    const count = Math.max(1, max);
    if (select.options.length !== count) {
      select.textContent = '';
      for (let n = 1; n <= count; n++) select.appendChild(el('option', '', String(n))).value = String(n);
    }
    select.value = String(Math.min(value, count));
  }

  function render() {
    const { sheets, orientations, across, down, marks, summary, scaled, ok } = refs;
    const page = pageSize();
    const format = PageLayout.getFormat();
    sheets.items.forEach(item => {
      const fits = SheetLayout.bestOrientation(item.value, page) !== null;
      item.input.checked = item.value === state.sheet;
      item.input.disabled = !fits;
      item.label.classList.toggle('pp-sheets-option-off', !fits);
      item.label.title = fits ? '' : I18n.t('sheetAssembly.sheet.tooSmall', { format });
    });
    orientations.items.forEach(item => {
      const fits = slotsFor(state.sheet, item.value) > 0;
      item.input.checked = item.value === state.orientation;
      item.input.disabled = !fits;
      item.label.classList.toggle('pp-sheets-option-off', !fits);
      item.label.title = fits ? '' : I18n.t('sheetAssembly.orientation.tooSmall', { format });
    });
    const grid = gridFor(state.sheet, state.orientation);
    fillSelect(across.select, grid.cols, state.cols);
    fillSelect(down.select, grid.rows, state.rows);
    marks.items.forEach(item => { item.input.checked = (item.value === 'on') === state.marks; });
    const layout = described();
    renderPreview(layout);
    const sheetCount = SheetLayout.sheetCount(ctx.count, layout.count);
    summary.textContent = I18n.t(ctx.grid ? 'sheetAssembly.summaryGrid' : 'sheetAssembly.summary', {
      slots: layout.count, cols: layout.cols, rows: layout.rows, count: ctx.count, sheets: sheetCount, sheet: state.sheet,
    });
    const percent = Math.round(layout.scale * 100);
    scaled.textContent = layout.scale < 1 && percent < 100 ? I18n.t('sheetAssembly.scaled', { n: percent }) : '';
    scaled.hidden = !scaled.textContent;
    ok.disabled = !SheetLayout.slotCount(grid);
  }

  function apply() {
    if (!current || refs.ok.disabled) return;
    const layout = described();
    writeSaved();
    current.finish({ sheet: state.sheet, orientation: state.orientation, cols: layout.cols, rows: layout.rows, marks: state.marks, layout });
  }

  // Ouvre la fenêtre pour `count` lignes de la table (`grid` : un modèle de grille, dont les lignes sont des « valeurs »). La page est celle du
  // modèle ouvert. Une demande qui arrive pendant qu'une autre est ouverte annule la première (elle se résout comme un clic sur Annuler).
  function open(opts) {
    if (typeof PageLayout === 'undefined' || typeof ModalBase === 'undefined' || typeof SheetLayout === 'undefined') return Promise.resolve(null);
    ensure();
    if (current) current.finish(null);
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        current = null;
        win.hide();
        resolve(value);
      };
      current = { finish };
      ctx = { count: Math.max(0, Number(opts && opts.count) || 0), grid: !!(opts && opts.grid) };
      state = initialState();
      const { sheetLabel, sheets, orientationLabel, orientations, slotsLabel, across, down, marksLabel, marks, hint, cancel, ok } = refs;
      win.title.textContent = I18n.t('sheetAssembly.title');
      sheetLabel.textContent = I18n.t('sheetAssembly.sheet.label');
      orientationLabel.textContent = I18n.t('sheetAssembly.orientation.label');
      orientations.items.forEach(item => { item.text.textContent = I18n.t('sheetAssembly.orientation.' + item.value); });
      slotsLabel.textContent = I18n.t('sheetAssembly.slots.label');
      across.text.textContent = I18n.t('sheetAssembly.slots.across');
      down.text.textContent = I18n.t('sheetAssembly.slots.down');
      marksLabel.textContent = I18n.t('sheetAssembly.marks.label');
      marks.items.forEach(item => { item.text.textContent = I18n.t('sheetAssembly.marks.' + item.value); });
      hint.textContent = I18n.t('sheetAssembly.hint');
      cancel.textContent = I18n.t('common.cancel');
      ok.textContent = I18n.t('common.generate');
      cancel.onclick = () => finish(null);
      render();
      win.show(() => (sheets.items.find(item => item.input.checked) || sheets.items[0]).input);
    });
  }

  return { STORAGE, open };
})();
