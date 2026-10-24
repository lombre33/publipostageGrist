// « Caractère… » (menu Alignement) : l'espacement des caractères et les petites capitales d'un texte, comme dans Word et dans PowerPoint. Demande du 24/10 (import PowerPoint sans perte,
// chantier 9 « caractères et puces », lot 9a) : un fichier PowerPoint resserre ou écarte souvent les lettres d'un titre (`spc`) et met un sous-titre en petites capitales (`cap="small"`), et
// l'éditeur ne savait ni les lire ni les garder.
//
// Les deux réglages sont des attributs de la marque `textStyle` (celle de la taille, de la couleur et du surlignage, js/editor-nodes.js:createTextStyleExtension) : `letterSpacing`, un
// nombre de points écrit « 1.5pt » (négatif : resserré), et `fontVariant`, « small-caps ». Ils s'écrivent en style (`letter-spacing`, `font-variant`) sur le <span> du texte, de sorte que
// tout lecteur du HTML - la Lecture, l'impression, les exports, une présentation - les voit sans connaître l'extension. Un texte collé d'une page web garde ses lettres espacées (px, em
// et rem sont ramenés en points) ; `font-variant: normal` et un espacement nul ne sont pas des réglages. Rien ne change pour un document qui ne s'en sert pas.
//
// Le SOULIGNEMENT (lot 9b) : la marque `underline` porte en plus `lineStyle`, l'un de `double`, `dotted`, `dashed` ou `wavy` (le simple est la marque seule), écrit en style sur le <u>
// (`text-decoration-style`) : la ligne se dessine sur l'élément qui la pose, pas sur un <span> voisin. La fenêtre règle aussi la sorte de soulignement (une liste : aucun, simple, double,
// pointillé, tireté, ondulé). Un soulignement épais ou en tirets mêlés de PowerPoint n'a pas d'équivalent exact : l'import prend le plus proche et le compte au compte rendu.
//
// L'OMBRE et le CONTOUR des lettres (lot 9c) : deux autres attributs de `textStyle`, `textShadow` (« 1.5pt 1.5pt 2pt #00000066 » : décalage à droite, décalage en bas, flou, couleur) et `textStroke`
// (« 0.75pt #ff0000 » : épaisseur, couleur), écrits en `text-shadow` et `-webkit-text-stroke`. Une seule ombre (un texte collé qui en a plusieurs garde la première) ; les longueurs en px, em et rem sont ramenées en
// points, les couleurs nommées ou en `rgb()` en hexadécimal. La fenêtre pose l'ombre ou le contour d'origine (une ombre douce grise, un trait noir de 0,75 pt) par une case ; une ombre ou un contour venu d'un fichier
// PowerPoint garde ses valeurs tant qu'on n'y touche pas. Le PDF ne sait pas dessiner ces deux effets dans son texte : un paragraphe qui en porte est dessiné en vectoriel (js/pdf-export.js : `effectParagraph`),
// l'ombre floue y est approchée par quelques copies décalées.
//
// La fenêtre règle le texte sélectionné (ou le style de frappe, curseur seul) : l'espacement en points, la case « Petites capitales » (état mêlé quand la sélection est partagée), le soulignement, l'ombre et le contour.
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
  // Les sortes de soulignement au-delà du simple, et leur nom dans Word (`w:u`) et dans PowerPoint (`u`).
  const UNDERLINE_STYLES = ['double', 'dotted', 'dashed', 'wavy'];
  const WORD_UNDERLINE = { double: 'double', dotted: 'dotted', dashed: 'dash', wavy: 'wave' };
  const POWERPOINT_UNDERLINE = { double: 'dbl', dotted: 'dotted', dashed: 'dash', wavy: 'wavy' };
  const EM_PT = 10.5;
  // L'ombre et le contour d'origine de la fenêtre, et leurs bornes (en points).
  const DEFAULT_SHADOW = '1.5pt 1.5pt 2pt #00000066';
  const DEFAULT_STROKE = '0.75pt #000000';
  const SHADOW_LIMIT = { offset: 100, blur: 100 };
  const STROKE_LIMIT = { min: 0.1, max: 20 };

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

  const normalizedLine = raw => { const v = String(raw == null ? '' : raw).trim().toLowerCase(); return UNDERLINE_STYLES.indexOf(v) === -1 ? null : v; };
  // Un soulignement de PowerPoint (`u`) en sorte de l'éditeur : { style (null : le simple), exact } ; `exact` faux quand l'éditeur le dessine un peu autrement (épais, tirets longs ou mêlés, double ondulé, mots seuls).
  const POWERPOINT_KINDS = {
    sng: { style: null, exact: true }, dbl: { style: 'double', exact: true }, dotted: { style: 'dotted', exact: true }, dash: { style: 'dashed', exact: true }, wavy: { style: 'wavy', exact: true },
    heavy: { style: null, exact: false }, dottedHeavy: { style: 'dotted', exact: false }, dashHeavy: { style: 'dashed', exact: false }, dashLong: { style: 'dashed', exact: false }, dashLongHeavy: { style: 'dashed', exact: false },
    dotDash: { style: 'dashed', exact: false }, dotDashHeavy: { style: 'dashed', exact: false }, dotDotDash: { style: 'dashed', exact: false }, dotDotDashHeavy: { style: 'dashed', exact: false },
    wavyHeavy: { style: 'wavy', exact: false }, wavyDbl: { style: 'wavy', exact: false }, words: { style: null, exact: false },
  };
  const underlineOfPowerPoint = kind => POWERPOINT_KINDS[kind] || { style: null, exact: false };

  // --- L'ombre et le contour : lus d'un texte CSS, écrits sous une forme unique.
  const hex2 = n => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
  // Une couleur CSS (« #f00 », « #ff000080 », « rgb(255 0 0 / 50%) », « red ») en { hex: « #rrggbb », alpha: 0 à 1 } ; null quand elle est illisible.
  function parseColor(raw) {
    const text = String(raw == null ? '' : raw).trim();
    let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
    if (m) {
      let h = m[1];
      if (h.length <= 4) h = h.split('').map(c => c + c).join('');
      return { hex: '#' + h.slice(0, 6).toLowerCase(), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(text);
    if (m) return { hex: '#' + hex2(m[1]) + hex2(m[2]) + hex2(m[3]), alpha: m[4] === undefined ? 1 : Math.min(1, Number(m[4]) / (m[5] ? 100 : 1)) };
    // Un nom de couleur : le navigateur le résout.
    if (/^[a-z]+$/i.test(text) && typeof document !== 'undefined' && document.body) {
      const probe = document.createElement('span');
      probe.style.color = text;
      if (!probe.style.color) return null;
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return /^rgb/i.test(resolved) ? parseColor(resolved) : null;
    }
    return null;
  }
  const colorText = c => c.hex + (c.alpha < 0.995 ? hex2(c.alpha * 255) : '');
  // Découpe une valeur CSS en jetons, sans couper une parenthèse (« rgba(0, 0, 0, .4) 2px 2px »).
  function tokensOf(text) {
    const out = [];
    let depth = 0;
    let at = '';
    Array.from(String(text)).forEach((ch) => {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if (/\s/.test(ch) && !depth) { if (at) out.push(at); at = ''; } else at += ch;
    });
    if (at) out.push(at);
    return out;
  }
  const clampTo = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  // Une ombre de texte en { dx, dy, blur (points), hex, alpha } ; null quand il n'y en a pas, qu'elle est illisible ou invisible. Seule la première d'une liste compte.
  function parseShadow(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text || /^(none|inherit|initial|unset)$/i.test(text)) return null;
    let first = '';
    let depth = 0;
    for (const ch of text) { if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1); if (ch === ',' && !depth) break; first += ch; }
    const lengths = [];
    let color = null;
    for (const token of tokensOf(first)) {
      const n = toPoints(token);
      if (n !== null && /^[-+]?[\d.]/.test(token)) lengths.push(n);
      else if (!color) color = parseColor(token); else return null;
    }
    if (lengths.length < 2 || lengths.length > 4 || (!color && lengths.length > 3)) return null;
    const c = color || { hex: '#000000', alpha: 0.5 };
    if (c.alpha <= 0) return null;
    return { dx: rounded(clampTo(lengths[0], -SHADOW_LIMIT.offset, SHADOW_LIMIT.offset), 2), dy: rounded(clampTo(lengths[1], -SHADOW_LIMIT.offset, SHADOW_LIMIT.offset), 2), blur: rounded(clampTo(lengths[2] || 0, 0, SHADOW_LIMIT.blur), 2), hex: c.hex, alpha: rounded(c.alpha, 3) };
  }
  // Le texte d'une ombre : « 1.5pt 1.5pt 2pt #00000066 » ; null quand il n'y en a pas.
  function normalizedShadow(raw) {
    const s = typeof raw === 'object' && raw ? raw : parseShadow(raw);
    return s ? s.dx + 'pt ' + s.dy + 'pt ' + s.blur + 'pt ' + colorText(s) : null;
  }
  // Un contour de texte en { w (points), hex, alpha } ; null quand il n'y en a pas ou qu'il est invisible (épaisseur nulle).
  function parseStroke(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text || /^(none|inherit|initial|unset)$/i.test(text)) return null;
    let width = null;
    let color = null;
    for (const token of tokensOf(text)) {
      const n = toPoints(token);
      if (n !== null && /^[-+]?[\d.]/.test(token) && width === null) width = n;
      else if (!color) color = parseColor(token) || (/^currentcolor$/i.test(token) ? { hex: '#000000', alpha: 1 } : null);
      else return null;
      if (n === null && !color) return null;
    }
    if (width === null || !(width > 0)) return null;
    const c = color || { hex: '#000000', alpha: 1 };
    return { w: rounded(clampTo(width, STROKE_LIMIT.min, STROKE_LIMIT.max), 2), hex: c.hex, alpha: rounded(c.alpha, 3) };
  }
  function normalizedStroke(raw) {
    const s = typeof raw === 'object' && raw ? raw : parseStroke(raw);
    return s ? s.w + 'pt ' + colorText(s) : null;
  }

  // Les déclarations de style d'un texte écrit à la main (l'import PowerPoint) : « letter-spacing: 1.5pt; font-variant: small-caps; text-shadow: … », vide quand rien n'est réglé.
  function declarations(values) {
    const parts = [];
    const spacing = normalizedSpacing(values && values.letterSpacing);
    if (spacing) parts.push('letter-spacing: ' + spacing);
    if (normalizedCaps(values && values.smallCaps ? SMALL_CAPS : null)) parts.push('font-variant: ' + SMALL_CAPS);
    const shadow = normalizedShadow(values && values.textShadow);
    if (shadow) parts.push('text-shadow: ' + shadow);
    const stroke = normalizedStroke(values && values.textStroke);
    if (stroke) parts.push('-webkit-text-stroke: ' + stroke);
    return parts.join('; ');
  }

  function createExtension(Extension) {
    return Extension.create({
      name: 'characterFormat',
      addGlobalAttributes() {
        return [{
          types: ['underline'],
          attributes: {
            lineStyle: {
              default: null,
              parseHTML: node => normalizedLine(node.style.textDecorationStyle),
              renderHTML: attrs => (attrs.lineStyle ? { style: 'text-decoration-style: ' + attrs.lineStyle } : {}),
            },
          },
        }, {
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
            textShadow: {
              default: null,
              parseHTML: node => normalizedShadow(node.style.textShadow),
              renderHTML: attrs => { const v = normalizedShadow(attrs.textShadow); return v ? { style: 'text-shadow: ' + v } : {}; },
            },
            textStroke: {
              default: null,
              parseHTML: node => normalizedStroke(node.style.getPropertyValue('-webkit-text-stroke') || node.style.webkitTextStroke),
              renderHTML: attrs => { const v = normalizedStroke(attrs.textStroke); return v ? { style: '-webkit-text-stroke: ' + v } : {}; },
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

  // Les réglages du texte visé : { spacing: [valeurs distinctes, null pour « aucun »], caps: [true / false distincts], line: ['none', 'single', 'double'... distincts] } ; vides quand la sélection ne contient aucun texte.
  function readState(editor) {
    const { doc, selection, storedMarks } = editor.state;
    const lists = [];
    if (selection.empty) lists.push(storedMarks || selection.$from.marks());
    else selection.ranges.forEach((range) => doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => { if (node.isText) lists.push(node.marks); return true; }));
    const spacing = new Set();
    const caps = new Set();
    const line = new Set();
    const shadow = new Set();
    const stroke = new Set();
    lists.forEach((marks) => {
      const style = marks.find(mark => mark.type.name === 'textStyle');
      spacing.add(normalizedSpacing(style && style.attrs.letterSpacing));
      caps.add(!!normalizedCaps(style && style.attrs.fontVariant));
      shadow.add(!!normalizedShadow(style && style.attrs.textShadow));
      stroke.add(!!normalizedStroke(style && style.attrs.textStroke));
      const underline = marks.find(mark => mark.type.name === 'underline');
      line.add(underline ? (normalizedLine(underline.attrs.lineStyle) || 'single') : 'none');
    });
    return { spacing: Array.from(spacing), caps: Array.from(caps), line: Array.from(line), shadow: Array.from(shadow), stroke: Array.from(stroke) };
  }

  // Pose les réglages de `changes` ({ letterSpacing: un espacement ou null, smallCaps: vrai ou faux, underline: 'none', 'single', 'double', 'dotted', 'dashed' ou 'wavy' } ; une clé absente ne change rien) sur le texte visé, en une seule transaction. Faux, sans
  // rien changer, quand l'éditeur n'est pas modifiable.
  function apply(editor, changes) {
    if (!editor || !editor.isEditable) return false;
    const chain = editor.chain().focus();
    let any = false;
    if ('letterSpacing' in changes) { chain.setMark('textStyle', { letterSpacing: normalizedSpacing(changes.letterSpacing) }); any = true; }
    if ('smallCaps' in changes) { chain.setMark('textStyle', { fontVariant: changes.smallCaps ? SMALL_CAPS : null }); any = true; }
    // `true` : l'ombre ou le contour d'origine ; `false` ou null : retiré ; une valeur CSS : celle-là.
    if ('textShadow' in changes) { chain.setMark('textStyle', { textShadow: changes.textShadow === true ? DEFAULT_SHADOW : normalizedShadow(changes.textShadow || null) }); any = true; }
    if ('textStroke' in changes) { chain.setMark('textStyle', { textStroke: changes.textStroke === true ? DEFAULT_STROKE : normalizedStroke(changes.textStroke || null) }); any = true; }
    if ('underline' in changes) {
      if (changes.underline === 'none') chain.unsetMark('underline');
      else { chain.setMark('underline', { lineStyle: normalizedLine(changes.underline) }); any = true; }
      any = true;
    }
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
  let initial = null; // l'état de chaque champ à l'ouverture : { spacing: son texte, caps: 'on' | 'off' | 'mixed', line: la valeur de la liste }
  const LINE_CHOICES = ['none', 'single'].concat(UNDERLINE_STYLES);

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
    const lineLabel = el('label', 'pp-parafmt-label');
    lineLabel.htmlFor = 'pp-charfmt-line';
    const line = el('select', 'pp-dialog-input pp-charfmt-line');
    line.id = 'pp-charfmt-line';
    const mixedOption = el('option');
    mixedOption.value = 'mixed';
    mixedOption.hidden = true;
    mixedOption.disabled = true;
    line.appendChild(mixedOption);
    LINE_CHOICES.forEach((choice) => { const option = el('option'); option.value = choice; line.appendChild(option); });
    const lineCell = el('div', 'pp-parafmt-field');
    lineCell.append(line);
    // Les effets : deux cases côte à côte, l'ombre et le contour des lettres.
    const effectsLabel = el('span', 'pp-parafmt-label');
    const effectsCell = el('div', 'pp-parafmt-field pp-charfmt-effects');
    const effectBox = (id) => {
      const wrap = el('label', 'pp-charfmt-effect');
      const box = el('input', 'pp-charfmt-check');
      box.id = id;
      box.type = 'checkbox';
      const text = el('span');
      wrap.append(box, text);
      effectsCell.appendChild(wrap);
      return { box, text };
    };
    const shadow = effectBox('pp-charfmt-shadow');
    const stroke = effectBox('pp-charfmt-stroke');
    effectsCell.setAttribute('role', 'group');
    grid.append(label, cell, capsLabel, capsCell, lineLabel, lineCell, effectsLabel, effectsCell);
    const notes = el('div', 'pp-parafmt-notes');
    const hint = el('p', 'pp-parafmt-note'); hint.id = 'pp-charfmt-hint';
    const error = el('p', 'pp-parafmt-note pp-parafmt-error'); error.id = 'pp-charfmt-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);
    grid.append(notes);
    win.body.appendChild(grid);
    const { first: reset, cancel, ok } = win.addButtons('pp-charfmt-reset');
    refs = { label, capsLabel, lineLabel, effectsLabel, effectsCell, input, caps, line, shadow: shadow.box, shadowText: shadow.text, stroke: stroke.box, strokeText: stroke.text, mixedOption, hint, error, reset, cancel, ok };

    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique).
    const submitOnEnter = (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit();
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', submitOnEnter);
    caps.addEventListener('keydown', submitOnEnter);
    line.addEventListener('keydown', submitOnEnter);
    caps.addEventListener('change', () => { caps.indeterminate = false; });
    [shadow.box, stroke.box].forEach((box) => {
      box.addEventListener('keydown', submitOnEnter);
      box.addEventListener('change', () => { box.indeterminate = false; });
    });
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
    [refs.shadow, refs.stroke].forEach((box) => { box.checked = false; box.indeterminate = false; });
    // « Par défaut » ramène un soulignement spécial au simple ; un texte sans soulignement ou aux soulignements mêlés n'est pas touché.
    if (UNDERLINE_STYLES.indexOf(refs.line.value) !== -1) refs.line.value = 'single';
    render();
    refs.input.focus();
  }
  const boxState = box => (box.indeterminate ? 'mixed' : (box.checked ? 'on' : 'off'));
  const capsState = () => boxState(refs.caps);

  // Ouvre la fenêtre sur le texte visé : chaque réglage montre la valeur commune, ou reste vide (case mêlée) quand le texte diffère.
  function open(editor) {
    if (typeof ModalBase === 'undefined' || !editor || !editor.isEditable) return false;
    ensure();
    target = editor;
    const { label, capsLabel, lineLabel, effectsLabel, effectsCell, input, caps, line, shadow, shadowText, stroke, strokeText, mixedOption, hint, reset, cancel, ok } = refs;
    win.title.textContent = I18n.t('charFormat.title');
    label.textContent = I18n.t('charFormat.spacing.label');
    capsLabel.textContent = I18n.t('charFormat.caps.label');
    input.setAttribute('aria-label', I18n.t('charFormat.spacing.aria'));
    caps.setAttribute('aria-label', I18n.t('charFormat.caps.aria'));
    lineLabel.textContent = I18n.t('charFormat.line.label');
    line.setAttribute('aria-label', I18n.t('charFormat.line.aria'));
    mixedOption.textContent = I18n.t('charFormat.mixed');
    Array.from(line.options).forEach((option) => { if (option.value !== 'mixed') option.textContent = I18n.t('charFormat.line.' + option.value); });
    effectsLabel.textContent = I18n.t('charFormat.effects.label');
    effectsCell.setAttribute('aria-label', I18n.t('charFormat.effects.aria'));
    shadowText.textContent = I18n.t('charFormat.shadow.label');
    strokeText.textContent = I18n.t('charFormat.stroke.label');
    shadow.setAttribute('aria-label', I18n.t('charFormat.shadow.aria'));
    stroke.setAttribute('aria-label', I18n.t('charFormat.stroke.aria'));
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
    line.value = state.line.length > 1 ? 'mixed' : (state.line[0] || 'none');
    [['shadow', shadow], ['stroke', stroke]].forEach(([key, box]) => {
      box.indeterminate = state[key].length > 1;
      box.checked = state[key].length === 1 && state[key][0] === true;
    });
    initial = { spacing: input.value, caps: capsState(), line: line.value, shadow: boxState(shadow), stroke: boxState(stroke) };
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
    if (refs.line.value !== initial.line && refs.line.value !== 'mixed') changes.underline = refs.line.value;
    if (boxState(refs.shadow) !== initial.shadow && !refs.shadow.indeterminate) changes.textShadow = refs.shadow.checked;
    if (boxState(refs.stroke) !== initial.stroke && !refs.stroke.indeterminate) changes.textStroke = refs.stroke.checked;
    win.hide();
    if (Object.keys(changes).length) apply(target, changes);
  }

  return { createExtension, declarations, spacingPt, smallCapsOf, smallCapsPieces, normalizedSpacing, normalizedShadow, normalizedStroke, parseShadow, parseStroke, DEFAULT_SHADOW, DEFAULT_STROKE, normalizedLine, underlineOfPowerPoint, readState, apply, open, SPACING, SMALL_CAPS, SMALL_CAPS_RATIO, UNDERLINE_STYLES, WORD_UNDERLINE, POWERPOINT_UNDERLINE };
})();
