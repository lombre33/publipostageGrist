// « Paragraphe… » (menu Alignement) : l'interligne et l'espace avant / après d'un paragraphe, comme dans Word et dans PowerPoint. Demande du 22/10 (import
// PowerPoint sans perte, chantier 2) : un fichier PowerPoint règle presque toujours l'un des trois (interligne de 90 %, 10 pt avant un point de liste), et l'éditeur
// ne savait ni les lire ni les garder.
//
// Les trois réglages sont des attributs du paragraphe, comme l'alignement ou « Garder avec le suivant » (js/keep-with-next.js) : `data-line-height` (le facteur CSS,
// 1,42 pour celui de l'éditeur), `data-space-before` et `data-space-after` (en points). Ils s'écrivent aussi en style (`line-height`, `padding-top`, `padding-bottom`)
// pour que tout lecteur du HTML - la Lecture, les exports, une présentation - les voie sans connaître l'extension. L'espace est un remplissage et non une marge : les
// espaces de deux paragraphes qui se suivent s'additionnent (Word, PowerPoint et pdfmake font de même), une marge CSS se fondrait en la plus grande des deux. Seuls les
// attributs `data-*` sont lus à l'ouverture d'un HTML : un texte collé de Word ou d'une page web garde son aspect habituel. Rien ne change pour un document qui ne s'en
// sert pas.
//
// Dans la fenêtre, l'interligne se dit comme dans Word et PowerPoint : un multiple de la ligne simple (1 = simple, 1,5, 2...), la ligne simple étant celle de la police
// de l'éditeur (`naturalLine`, 1,172 pour Roboto) ; l'interligne d'origine de l'éditeur s'y lit donc 1,21. Un réglage égal à celui d'origine n'est pas écrit : le
// paragraphe redevient ordinaire. Le réglage vaut pour les paragraphes sélectionnés (ou celui du curseur), y compris dans une liste, une case de tableau, une colonne, un
// encadré, une citation ou un cadre de diapositive ; la ligne du menu est grisée, avec sa raison en info-bulle, ailleurs : un titre, une légende (sa taille est fixe), un
// en-tête ou un pied de page (une zone de hauteur fixe). « Valider » pose tout dans une seule transaction (un Annuler la défait d'un coup) ; seul un champ modifié
// s'applique, de sorte qu'une sélection aux valeurs mêlées garde chacune des siennes.
//
// La Lecture et l'éditeur le montrent par le style. Le PDF (js/pdf-export.js) et le Word (js/docx-export.js) le lisent par `readOf` ; le PowerPoint (js/pptx-export.js)
// le mesure sur le texte posé, l'import (js/pptx-import.js) l'écrit par `markup`.
const ParagraphFormat = (function () {
  const el = Dom.el;
  const STYLE = ExportCommon.EDITOR_STYLE;

  // La ligne simple (le rapport entre la hauteur de ligne et le corps de la police de l'éditeur) et l'interligne d'origine de l'éditeur, en facteurs CSS.
  const NATURAL_LINE = STYLE.naturalLine;
  const DEFAULT_LINE = STYLE.lineHeight;
  // Les bornes de PowerPoint : de 0,2 à 9,99 fois la ligne simple, de 0 à 1584 pt d'espace.
  const LINE_MULTIPLE_MIN = 0.2;
  const LINE_MULTIPLE_MAX = 9.99;
  const SPACE_MAX = 1584;
  const KEYS = ['lineHeight', 'spaceBefore', 'spaceAfter'];
  const FIELDS = {
    lineHeight: { data: 'data-line-height', css: 'line-height', unit: '', min: LINE_MULTIPLE_MIN * NATURAL_LINE, max: LINE_MULTIPLE_MAX * NATURAL_LINE, digits: 3 },
    spaceBefore: { data: 'data-space-before', css: 'padding-top', unit: 'pt', min: 0, max: SPACE_MAX, digits: 2 },
    spaceAfter: { data: 'data-space-after', css: 'padding-bottom', unit: 'pt', min: 0, max: SPACE_MAX, digits: 2 },
  };

  const rounded = (value, digits) => { const f = Math.pow(10, digits); return Math.round(value * f) / f; };
  // Une valeur d'attribut ramenée à ses bornes, ou null (absente, illisible : « abc », « 1e999 »).
  function boundedValue(key, raw) {
    const f = FIELDS[key];
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    return rounded(Math.min(f.max, Math.max(f.min, n)), f.digits);
  }
  // Un réglage égal à celui d'origine n'est pas écrit : null. L'interligne d'origine et zéro point d'espace sont « aucun réglage ». L'interligne se lit au centième de ligne
  // simple dans la fenêtre (1,21 pour 1,42) : l'écart d'un demi-centième (0,006) à l'interligne d'origine est lui aussi « aucun réglage ».
  const DEFAULT_LINE_SLACK = 0.006;
  function normalized(key, value) {
    const v = value == null ? null : boundedValue(key, value);
    if (v === null) return null;
    if (key === 'lineHeight') return Math.abs(v - DEFAULT_LINE) <= DEFAULT_LINE_SLACK ? null : v;
    return v === 0 ? null : v;
  }
  const toMultiple = css => css / NATURAL_LINE;
  const toCss = multiple => rounded(multiple * NATURAL_LINE, FIELDS.lineHeight.digits);

  function createExtension(Extension) {
    const attribute = key => ({
      default: null,
      parseHTML: node => normalized(key, node.getAttribute(FIELDS[key].data)),
      renderHTML: attrs => (attrs[key] == null ? {} : { [FIELDS[key].data]: String(attrs[key]), style: FIELDS[key].css + ': ' + attrs[key] + FIELDS[key].unit }),
    });
    return Extension.create({
      name: 'paragraphFormat',
      addGlobalAttributes() {
        return [{ types: ['paragraph'], attributes: { lineHeight: attribute('lineHeight'), spaceBefore: attribute('spaceBefore'), spaceAfter: attribute('spaceAfter') } }];
      },
    });
  }

  // Les attributs et le style d'un paragraphe écrit à la main (l'import PowerPoint) : ` data-line-height="1.055" style="..."`, vide quand rien n'est réglé. `align`
  // (facultatif) : l'alignement, qui partage l'attribut style.
  function markup(values, align) {
    const attrs = [];
    const style = [];
    if (align) style.push('text-align: ' + align);
    KEYS.forEach((key) => {
      const v = normalized(key, values && values[key]);
      if (v === null) return;
      attrs.push(FIELDS[key].data + '="' + v + '"');
      style.push(FIELDS[key].css + ': ' + v + FIELDS[key].unit);
    });
    return (attrs.length ? ' ' + attrs.join(' ') : '') + (style.length ? ' style="' + style.join('; ') + '"' : '');
  }

  // Ce que porte un élément du HTML, pour les exports : { lineHeight, spaceBefore, spaceAfter } (null pour ce que le paragraphe ne règle pas) ou null quand rien n'est
  // réglé. Un paragraphe se lit lui-même ; un <li> ou une citation, dont les exports aplatissent le texte en un seul bloc, prend l'interligne et l'espace avant de son
  // premier paragraphe, l'espace après du dernier.
  function readOf(node) {
    if (!node || node.nodeType !== 1) return null;
    let first = null;
    let last = null;
    if (node.tagName === 'P') {
      first = node;
      last = node;
    } else if (node.tagName === 'LI' || node.tagName === 'BLOCKQUOTE') {
      // Le texte d'un point de liste à cases est dans un <div> à côté de sa case.
      const paragraphsIn = parent => Array.from(parent.children).filter(child => child.tagName === 'P');
      let paragraphs = paragraphsIn(node);
      if (!paragraphs.length) {
        const wrapper = Array.from(node.children).find(child => child.tagName === 'DIV');
        paragraphs = wrapper ? paragraphsIn(wrapper) : [];
      }
      first = paragraphs[0] || null;
      last = paragraphs[paragraphs.length - 1] || null;
    }
    if (!first || first.hasAttribute('data-caption')) return null;
    const out = {
      lineHeight: normalized('lineHeight', first.getAttribute(FIELDS.lineHeight.data)),
      spaceBefore: normalized('spaceBefore', first.getAttribute(FIELDS.spaceBefore.data)),
      spaceAfter: normalized('spaceAfter', last.getAttribute(FIELDS.spaceAfter.data)),
    };
    return KEYS.some(key => out[key] !== null) ? out : null;
  }

  // La ligne du menu
  // Les paragraphes que le réglage vise dans la sélection : ceux du texte, à toute profondeur (liste, case, colonne, encadré, citation, cadre), sauf les légendes. Par
  // plage de la sélection : une sélection de cases n'en couvre pas les cases intermédiaires.
  function eligibleParagraphs(editor) {
    const { doc, selection } = editor.state;
    const found = new Map();
    selection.ranges.forEach((range) => {
      doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
        if (node.type.name !== 'paragraph') return true;
        if (!node.attrs.caption) found.set(pos, node);
        return false;
      });
    });
    return Array.from(found, ([pos, node]) => ({ pos, node }));
  }

  // `locked` : la clé de la raison du grisage, ou null ; `targets` : les paragraphes visés.
  function status(editor) {
    const targets = HeaderFooterPreview.getHfMode() ? [] : eligibleParagraphs(editor);
    return { targets, locked: targets.length ? null : 'paragraphFormat.notHere' };
  }

  function syncRow(row, editor) {
    if (!row || !editor) return;
    const s = status(editor);
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) row.title = I18n.t(s.locked); else row.removeAttribute('title');
  }

  // Pose les réglages de `changes` ({ lineHeight, spaceBefore, spaceAfter } : un nombre, ou null pour le retirer ; une clé absente ne change rien) sur les paragraphes
  // visés, en une seule transaction. Faux, sans rien changer, quand la ligne est grisée ou que l'éditeur n'est pas modifiable.
  function apply(editor, changes) {
    if (!editor || !editor.isEditable) return false;
    const s = status(editor);
    if (s.locked) return false;
    const tr = editor.state.tr;
    s.targets.forEach(({ node, pos }) => {
      KEYS.forEach((key) => {
        if (!(key in changes)) return;
        const wanted = normalized(key, changes[key]);
        if ((node.attrs[key] == null ? null : node.attrs[key]) !== wanted) tr.setNodeAttribute(pos, key, wanted);
      });
    });
    if (!tr.docChanged) return false;
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let target = null;  // l'éditeur dont la fenêtre règle les paragraphes
  let initial = null; // le texte de chaque champ à l'ouverture : seul un champ modifié s'applique

  const numberText = (value, digits) => String(rounded(value, digits)).replace('.', I18n.getLang() === 'fr' ? ',' : '.');
  // « 1,5 », « 1.5 » ou « 6 pt » -> un nombre ; null si ce n'est pas un nombre. Le point ou la virgule seule (« 1. », « ,5 ») passe : on tape un nombre.
  function parseNumber(text) {
    const match = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:pt)?\s*$/i.exec(String(text));
    return match ? Number(match[1].replace(',', '.')) : null;
  }
  const fieldMin = key => (key === 'lineHeight' ? LINE_MULTIPLE_MIN : 0);
  const fieldMax = key => (key === 'lineHeight' ? LINE_MULTIPLE_MAX : SPACE_MAX);

  function field(key, id) {
    const input = el('input', 'pp-dialog-input');
    input.id = id;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-parafmt-hint pp-parafmt-error');
    const unit = el('span', 'pp-parafmt-unit', key === 'lineHeight' ? '×' : 'pt');
    unit.setAttribute('aria-hidden', 'true');
    const cell = el('div', 'pp-parafmt-field');
    cell.append(input, unit);
    return { input, cell };
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-parafmt-modal', titleId: 'pp-parafmt-title', size: 'md', boxClass: 'pp-parafmt-box', actionsClass: 'var-modal-actions' });
    const grid = el('div', 'pp-parafmt-grid');
    const labels = {};
    const inputs = {};
    KEYS.forEach((key) => {
      const id = 'pp-parafmt-' + key;
      const label = el('label', 'pp-parafmt-label');
      label.htmlFor = id;
      const f = field(key, id);
      labels[key] = label;
      inputs[key] = f.input;
      grid.append(label, f.cell);
    });
    const notes = el('div', 'pp-parafmt-notes');
    const hint = el('p', 'pp-parafmt-note'); hint.id = 'pp-parafmt-hint';
    const error = el('p', 'pp-parafmt-note pp-parafmt-error'); error.id = 'pp-parafmt-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);
    grid.append(notes);
    win.body.appendChild(grid);
    const { first: reset, cancel, ok } = win.addButtons('pp-parafmt-reset');
    refs = { labels, inputs, hint, error, reset, cancel, ok };

    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique) : elle ne fait alors que choisir le caractère.
    const submitOnEnter = (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit();
    };
    KEYS.forEach((key) => {
      inputs[key].addEventListener('input', render);
      inputs[key].addEventListener('keydown', submitOnEnter);
    });
    reset.addEventListener('click', resetFields);
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', submit);
  }

  // L'état d'un champ : { value } (le nombre de l'éditeur : un facteur CSS ou des points ; null pour « par défaut »), { error: 'number' | 'range' } sinon.
  function readField(key) {
    const text = refs.inputs[key].value;
    if (!text.trim()) return { value: null, empty: true };
    const n = parseNumber(text);
    if (n === null) return { error: 'number' };
    if (n < fieldMin(key) || n > fieldMax(key)) return { error: 'range' };
    return { value: key === 'lineHeight' ? toCss(n) : rounded(n, FIELDS[key].digits) };
  }
  const fieldErrorText = (key, code) => (code === 'number' ? I18n.t('paragraphFormat.error.number')
    : I18n.t(key === 'lineHeight' ? 'paragraphFormat.error.rangeLine' : 'paragraphFormat.error.rangeSpace',
      { min: numberText(fieldMin(key), 1), max: numberText(fieldMax(key), 2) }));

  function render() {
    const states = KEYS.map(readField);
    let message = '';
    KEYS.forEach((key, i) => {
      const bad = !!states[i].error;
      if (bad) { refs.inputs[key].setAttribute('aria-invalid', 'true'); if (!message) message = fieldErrorText(key, states[i].error); } else refs.inputs[key].removeAttribute('aria-invalid');
    });
    refs.error.hidden = !message;
    refs.error.textContent = message;
    refs.ok.disabled = states.some(state => state.error);
  }

  // Le texte d'un champ pour une valeur : le multiple de la ligne simple pour l'interligne, les points pour les espaces ; « par défaut » : l'interligne d'origine et zéro.
  function textFor(key, value) {
    if (key === 'lineHeight') return numberText(toMultiple(value == null ? DEFAULT_LINE : value), 2);
    return numberText(value == null ? 0 : value, 2);
  }

  function resetFields() {
    KEYS.forEach((key) => { refs.inputs[key].value = textFor(key, null); });
    render();
    refs.inputs.lineHeight.focus();
  }

  // Ouvre la fenêtre sur les paragraphes visés : chaque champ montre la valeur commune, ou reste vide quand les paragraphes diffèrent. Faux si la ligne est grisée.
  function open(editor) {
    if (typeof ModalBase === 'undefined' || !editor || !editor.isEditable) return false;
    const s = status(editor);
    if (s.locked) return false;
    ensure();
    target = editor;
    const { labels, inputs, hint, reset, cancel, ok } = refs;
    win.title.textContent = I18n.t('paragraphFormat.title');
    labels.lineHeight.textContent = I18n.t('paragraphFormat.lineHeight.label');
    labels.spaceBefore.textContent = I18n.t('paragraphFormat.spaceBefore.label');
    labels.spaceAfter.textContent = I18n.t('paragraphFormat.spaceAfter.label');
    inputs.lineHeight.setAttribute('aria-label', I18n.t('paragraphFormat.lineHeight.aria'));
    inputs.spaceBefore.setAttribute('aria-label', I18n.t('paragraphFormat.spaceBefore.aria'));
    inputs.spaceAfter.setAttribute('aria-label', I18n.t('paragraphFormat.spaceAfter.aria'));
    hint.textContent = I18n.t('paragraphFormat.hint', { line: textFor('lineHeight', null) });
    reset.textContent = I18n.t('paragraphFormat.reset');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    initial = {};
    KEYS.forEach((key) => {
      const values = s.targets.map(t => normalized(key, t.node.attrs[key]));
      const same = values.every(v => v === values[0]);
      inputs[key].placeholder = same ? '' : I18n.t('paragraphFormat.mixed');
      initial[key] = same ? textFor(key, values[0]) : '';
      inputs[key].value = initial[key];
    });
    render();
    win.show(inputs.lineHeight);
    inputs.lineHeight.select();
    return true;
  }

  // « Valider » : seuls les champs modifiés s'appliquent (un champ vidé redevient « par défaut ») ; une saisie qui n'est pas bonne garde la fenêtre ouverte.
  function submit() {
    const states = KEYS.map(readField);
    const bad = states.findIndex(state => state.error);
    if (bad >= 0) { refs.inputs[KEYS[bad]].focus(); return; }
    const changes = {};
    KEYS.forEach((key, i) => { if (refs.inputs[key].value.trim() !== initial[key]) changes[key] = states[i].value; });
    win.hide();
    if (Object.keys(changes).length) apply(target, changes);
  }

  return { createExtension, markup, readOf, status, syncRow, apply, open, normalized, toMultiple, toCss, NATURAL_LINE, DEFAULT_LINE, LINE_MULTIPLE_MIN, LINE_MULTIPLE_MAX, SPACE_MAX };
})();
