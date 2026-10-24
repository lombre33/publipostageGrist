// « Caractère… » (menu Alignement) : l'espacement des caractères et les petites capitales d'un texte, comme dans Word et dans PowerPoint. Demande du 24/10 (import PowerPoint sans perte,
// chantier 9 « caractères et puces », lot 9a) : un fichier PowerPoint resserre ou écarte souvent les lettres d'un titre (`spc`) et met un sous-titre en petites capitales (`cap="small"`), et
// l'éditeur ne savait ni les lire ni les garder.
//
// Les deux réglages sont des attributs de la marque `textStyle` (celle de la taille, de la couleur et du surlignage, js/editor-nodes.js:createTextStyleExtension) : `letterSpacing`, un
// nombre de points écrit « 1.5pt » (négatif : resserré), et `fontVariant`, « small-caps ». Ils s'écrivent en style (`letter-spacing`, `font-variant`) sur le <span> du texte, de sorte que
// tout lecteur du HTML - la Lecture, l'impression, les exports, une présentation - les voit sans connaître l'extension. Un texte collé d'une page web garde ses lettres espacées (px, em
// et rem sont ramenés en points) ; `font-variant: normal` et un espacement nul ne sont pas des réglages. Rien ne change pour un document qui ne s'en sert pas.
//
// La fenêtre règle le texte sélectionné (ou le style de frappe, curseur seul) : l'espacement en points et la case « Petites capitales » (état mêlé quand la sélection est partagée).
// « Valider » pose tout dans une seule transaction (un Annuler la défait d'un coup) ; seul un réglage modifié s'applique, de sorte qu'une sélection aux valeurs mêlées garde chacune des siennes.
//
// La Lecture et l'éditeur le montrent par le style. Le PDF (js/pdf-export.js), le Word (js/docx-export.js) et le PowerPoint (js/pptx-export.js) le lisent par `spacingPt` et `smallCapsOf` ;
// l'import (js/pptx-import.js) l'écrit par `declarations`. Le PDF n'a pas de petites capitales : il les dessine (`smallCapsPieces`), comme le navigateur - des majuscules à 70 % de la taille.
const CharacterFormat = (function () {
  const el = Dom.el;
  const SPACING = { min: -50, max: 500, digits: 2 };
  const SMALL_CAPS = 'small-caps';
  // Le navigateur dessine une petite capitale à 70 % de la taille de la majuscule quand la police n'a pas les siennes.
  const SMALL_CAPS_RATIO = 0.7;
  const PT_PER_PX = 0.75;
  const EM_PT = 10.5;

  const rounded = (value, digits) => { const f = Math.pow(10, digits); return Math.round(value * f) / f; };
  // Une longueur CSS (« 1.5pt », « 2px », « .1em », « normal ») en points ; null quand ce n'en est pas une.
  function toPoints(raw) {
    const m = /^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|px|em|rem)?\s*$/i.exec(String(raw == null ? '' : raw));
    if (!m) return null;
    const n = Number(m[1]);
    const unit = (m[2] || 'pt').toLowerCase();
    return unit === 'px' ? n * PT_PER_PX : (unit === 'pt' ? n : n * EM_PT);
  }
  // Un espacement (un nombre de points, ou une longueur CSS) ramené à ses bornes et écrit « 1.5pt » ; null quand il est absent, illisible ou nul.
  function normalizedSpacing(raw) {
    const n = typeof raw === 'number' ? raw : toPoints(raw);
    if (n === null || !Number.isFinite(n)) return null;
    const v = rounded(Math.min(SPACING.max, Math.max(SPACING.min, n)), SPACING.digits);
    return v === 0 ? null : v + 'pt';
  }
  // Le même espacement en points (0 quand il n'y en a pas), pour les exports.
  const spacingPt = raw => { const v = normalizedSpacing(raw); return v === null ? 0 : parseFloat(v); };
  const normalizedCaps = raw => (/^small-caps$/i.test(String(raw == null ? '' : raw).trim()) ? SMALL_CAPS : null);
  const smallCapsOf = raw => normalizedCaps(raw) === SMALL_CAPS;

  // Les déclarations de style d'un texte écrit à la main (l'import PowerPoint) : « letter-spacing: 1.5pt; font-variant: small-caps », vide quand rien n'est réglé.
  function declarations(values) {
    const parts = [];
    const spacing = normalizedSpacing(values && values.letterSpacing);
    if (spacing) parts.push('letter-spacing: ' + spacing);
    if (normalizedCaps(values && values.smallCaps ? SMALL_CAPS : null)) parts.push('font-variant: ' + SMALL_CAPS);
    return parts.join('; ');
  }

  function createExtension(Extension) {
    return Extension.create({
      name: 'characterFormat',
      addGlobalAttributes() {
        return [{
          types: ['textStyle'],
          attributes: {
            letterSpacing: {
              default: null,
              parseHTML: node => normalizedSpacing(node.style.letterSpacing),
              renderHTML: attrs => (attrs.letterSpacing ? { style: 'letter-spacing: ' + attrs.letterSpacing } : {}),
            },
            fontVariant: {
              default: null,
              parseHTML: node => normalizedCaps(node.style.fontVariant || node.style.fontVariantCaps),
              renderHTML: attrs => (attrs.fontVariant ? { style: 'font-variant: ' + attrs.fontVariant } : {}),
            },
          },
        }];
      },
    });
  }

  // Un texte en petites capitales découpé pour le PDF : { text, style } par morceau - les minuscules en majuscules à 70 % de la taille, le reste tel quel. `style` : celui du texte, avec sa
  // taille (`fontSize`) ; le morceau d'origine d'un texte sans minuscule est rendu seul.
  function smallCapsPieces(text, style) {
    const pieces = [];
    const small = Object.assign({}, style, { fontSize: rounded((style.fontSize || 10.5) * SMALL_CAPS_RATIO, 2) });
    Array.from(String(text)).forEach((ch) => {
      const lower = ch !== ch.toLocaleUpperCase() && ch === ch.toLocaleLowerCase();
      const piece = lower ? { text: ch.toLocaleUpperCase(), style: small } : { text: ch, style };
      const last = pieces[pieces.length - 1];
      if (last && last.style === piece.style) last.text += piece.text; else pieces.push(piece);
    });
    return pieces;
  }

  // Les réglages du texte visé : { spacing: [valeurs distinctes, null pour « aucun »], caps: [true / false distincts] } ; vides quand la sélection ne contient aucun texte.
  function readState(editor) {
    const { doc, selection, storedMarks } = editor.state;
    const lists = [];
    if (selection.empty) lists.push(storedMarks || selection.$from.marks());
    else selection.ranges.forEach((range) => doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => { if (node.isText) lists.push(node.marks); return true; }));
    const spacing = new Set();
    const caps = new Set();
    lists.forEach((marks) => {
      const style = marks.find(mark => mark.type.name === 'textStyle');
      spacing.add(normalizedSpacing(style && style.attrs.letterSpacing));
      caps.add(!!normalizedCaps(style && style.attrs.fontVariant));
    });
    return { spacing: Array.from(spacing), caps: Array.from(caps) };
  }

  // Pose les réglages de `changes` ({ letterSpacing: un espacement ou null, smallCaps: vrai ou faux } ; une clé absente ne change rien) sur le texte visé, en une seule transaction. Faux, sans
  // rien changer, quand l'éditeur n'est pas modifiable.
  function apply(editor, changes) {
    if (!editor || !editor.isEditable) return false;
    const chain = editor.chain().focus();
    let any = false;
    if ('letterSpacing' in changes) { chain.setMark('textStyle', { letterSpacing: normalizedSpacing(changes.letterSpacing) }); any = true; }
    if ('smallCaps' in changes) { chain.setMark('textStyle', { fontVariant: changes.smallCaps ? SMALL_CAPS : null }); any = true; }
    // Un texte qui n'a plus aucun réglage perd sa marque : pas de <span> vide.
    chain.command(({ tr, state }) => {
      const type = state.schema.marks.textStyle;
      state.selection.ranges.forEach((range) => {
        tr.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
          const mark = node.isText ? node.marks.find(m => m.type === type) : null;
          if (mark && Object.values(mark.attrs).every(v => v == null || v === '')) tr.removeMark(Math.max(pos, range.$from.pos), Math.min(pos + node.nodeSize, range.$to.pos), mark);
        });
      });
      return true;
    });
    return any ? chain.run() : false;
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let target = null;  // l'éditeur dont la fenêtre règle le texte
  let initial = null; // l'état de chaque champ à l'ouverture : { spacing: son texte, caps: 'on' | 'off' | 'mixed' }

  const numberText = value => String(rounded(value, SPACING.digits)).replace('.', I18n.getLang() === 'fr' ? ',' : '.');
  // « 1,5 », « 1.5 », « -0,5 pt » -> un nombre ; null si ce n'est pas un nombre.
  function parseNumber(text) {
    const match = /^\s*([-−]?)\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:pt)?\s*$/i.exec(String(text));
    return match ? (match[1] ? -1 : 1) * Number(match[2].replace(',', '.')) : null;
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-charfmt-modal', titleId: 'pp-charfmt-title', size: 'md', boxClass: 'pp-parafmt-box', actionsClass: 'var-modal-actions' });
    const grid = el('div', 'pp-parafmt-grid');
    const label = el('label', 'pp-parafmt-label');
    label.htmlFor = 'pp-charfmt-spacing';
    const input = el('input', 'pp-dialog-input');
    input.id = 'pp-charfmt-spacing';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-charfmt-hint pp-charfmt-error');
    const unit = el('span', 'pp-parafmt-unit', 'pt');
    unit.setAttribute('aria-hidden', 'true');
    const cell = el('div', 'pp-parafmt-field');
    cell.append(input, unit);
    const capsLabel = el('label', 'pp-parafmt-label');
    capsLabel.htmlFor = 'pp-charfmt-caps';
    const caps = el('input', 'pp-charfmt-check');
    caps.id = 'pp-charfmt-caps';
    caps.type = 'checkbox';
    const capsCell = el('div', 'pp-parafmt-field');
    capsCell.append(caps);
    grid.append(label, cell, capsLabel, capsCell);
    const notes = el('div', 'pp-parafmt-notes');
    const hint = el('p', 'pp-parafmt-note'); hint.id = 'pp-charfmt-hint';
    const error = el('p', 'pp-parafmt-note pp-parafmt-error'); error.id = 'pp-charfmt-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);
    grid.append(notes);
    win.body.appendChild(grid);
    const { first: reset, cancel, ok } = win.addButtons('pp-charfmt-reset');
    refs = { label, capsLabel, input, caps, hint, error, reset, cancel, ok };

    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique).
    const submitOnEnter = (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit();
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', submitOnEnter);
    caps.addEventListener('keydown', submitOnEnter);
    caps.addEventListener('change', () => { caps.indeterminate = false; });
    reset.addEventListener('click', resetFields);
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', submit);
  }

  // L'état du champ d'espacement : { value } (« 1.5pt » ou null pour « aucun »), { error: 'number' | 'range' } sinon.
  function readSpacing() {
    const text = refs.input.value;
    if (!text.trim()) return { value: null, empty: true };
    const n = parseNumber(text);
    if (n === null) return { error: 'number' };
    if (n < SPACING.min || n > SPACING.max) return { error: 'range' };
    return { value: normalizedSpacing(n) };
  }
  function render() {
    const state = readSpacing();
    let message = '';
    if (state.error) {
      refs.input.setAttribute('aria-invalid', 'true');
      message = state.error === 'number' ? I18n.t('charFormat.error.number') : I18n.t('charFormat.error.range', { min: numberText(SPACING.min), max: numberText(SPACING.max) });
    } else refs.input.removeAttribute('aria-invalid');
    refs.error.hidden = !message;
    refs.error.textContent = message;
    refs.ok.disabled = !!state.error;
  }
  function resetFields() {
    refs.input.value = numberText(0);
    refs.caps.checked = false;
    refs.caps.indeterminate = false;
    render();
    refs.input.focus();
  }
  const capsState = () => (refs.caps.indeterminate ? 'mixed' : (refs.caps.checked ? 'on' : 'off'));

  // Ouvre la fenêtre sur le texte visé : chaque réglage montre la valeur commune, ou reste vide (case mêlée) quand le texte diffère.
  function open(editor) {
    if (typeof ModalBase === 'undefined' || !editor || !editor.isEditable) return false;
    ensure();
    target = editor;
    const { label, capsLabel, input, caps, hint, reset, cancel, ok } = refs;
    win.title.textContent = I18n.t('charFormat.title');
    label.textContent = I18n.t('charFormat.spacing.label');
    capsLabel.textContent = I18n.t('charFormat.caps.label');
    input.setAttribute('aria-label', I18n.t('charFormat.spacing.aria'));
    caps.setAttribute('aria-label', I18n.t('charFormat.caps.aria'));
    hint.textContent = I18n.t('charFormat.hint');
    reset.textContent = I18n.t('charFormat.reset');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    const state = readState(editor);
    const sameSpacing = state.spacing.length <= 1;
    const sameCaps = state.caps.length <= 1;
    input.placeholder = sameSpacing ? '' : I18n.t('charFormat.mixed');
    input.value = sameSpacing ? numberText(state.spacing.length && state.spacing[0] ? parseFloat(state.spacing[0]) : 0) : '';
    caps.indeterminate = !sameCaps;
    caps.checked = sameCaps && state.caps[0] === true;
    initial = { spacing: input.value, caps: capsState() };
    render();
    win.show(input);
    input.select();
    return true;
  }

  // « Valider » : seuls les réglages modifiés s'appliquent (un espacement vidé redevient « aucun ») ; une saisie qui n'est pas bonne garde la fenêtre ouverte.
  function submit() {
    const state = readSpacing();
    if (state.error) { refs.input.focus(); return; }
    const changes = {};
    if (refs.input.value.trim() !== initial.spacing) changes.letterSpacing = state.value;
    if (capsState() !== initial.caps) changes.smallCaps = refs.caps.checked && !refs.caps.indeterminate;
    win.hide();
    if (Object.keys(changes).length) apply(target, changes);
  }

  return { createExtension, declarations, spacingPt, smallCapsOf, smallCapsPieces, normalizedSpacing, readState, apply, open, SPACING, SMALL_CAPS, SMALL_CAPS_RATIO };
})();
