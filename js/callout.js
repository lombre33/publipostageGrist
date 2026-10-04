// Encadrés et bloc de signature de l'éditeur, sous la même icône de menu que le lien, la citation et le bloc de code (« Lien et blocs de contenu »).
//  - L'encadré est un nœud TipTap (`callout`, un bloc qui contient des blocs) : un fond teinté, une barre de couleur à gauche et une icône, tous
//    trois posés par le CSS à partir de deux attributs, `data-color` et `data-icon`. Note, Attention et Important ne sont que trois points de départ
//    de la fenêtre (bleu + information, orange + triangle, rouge + point d'exclamation) : la couleur et l'icône se choisissent ensuite à part, c'est
//    pourquoi le type n'est pas gardé dans le document. La palette et les icônes ne sont écrites qu'ici : le CSS de l'éditeur et de la Lecture en est
//    généré (installStyles), les exports PDF et Word en tirent les mêmes couleurs (colors) et la même icône en PNG (iconPng).
//  - Le bloc de signature est un morceau de document fait de nœuds qui existent déjà (une zone 2 colonnes, des paragraphes) : de l'espace pour
//    signer, une ligne, puis « Nom et signature » sous la première colonne et « Date » sous la seconde. Rien à rendre de nouveau dans la Lecture, le
//    PDF, le Word ou l'e-mail, et tout reste modifiable (une variable à la place du nom, une autre légende...).
// Styles de la fenêtre et de l'encadré : css/callout.css ; le menu est dans index.html (#v2-blocks-group), ses actions dans js/main-toolbar.js.
const Callout = (function () {
  const el = Dom.el;

  // La palette et les icônes
  // Couleur d'accent (barre, icône : 3:1 au moins sur la teinte, 4,4 à 6,7:1 en pratique) et teinte de fond (le texte du document, #1b2430, y reste à
  // plus de 14:1). Le papier du document reste blanc dans le thème sombre : ces couleurs ne changent pas avec lui.
  const COLOR_ORDER = ['blue', 'green', 'amber', 'red', 'purple', 'gray'];
  const COLORS = {
    blue: { accent: '#2563eb', tint: '#eff6ff' },
    green: { accent: '#15803d', tint: '#f0fdf4' },
    amber: { accent: '#b45309', tint: '#fffbeb' },
    red: { accent: '#dc2626', tint: '#fef2f2' },
    purple: { accent: '#7e22ce', tint: '#faf5ff' },
    gray: { accent: '#4b5563', tint: '#f3f4f6' },
  };
  // Icônes « trait » sur une grille de 24 (même famille que js/icons.js) : une liste de tracés, un rond de 9 de rayon pour les cercles. Les points
  // (`h.01`) sont des tracés de longueur nulle : avec des bouts ronds ils se peignent comme un point.
  const CIRCLE = 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
  function starPath() {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 9.6 : 4.3;
      points.push((12 + radius * Math.cos(angle)).toFixed(2) + ' ' + (12.9 + radius * Math.sin(angle)).toFixed(2));
    }
    return 'M' + points.join('L') + 'z';
  }
  const ICON_ORDER = ['info', 'warning', 'alert', 'check', 'bulb', 'star'];
  const ICONS = {
    info: [CIRCLE, 'M12 16v-5', 'M12 8h.01'],
    warning: ['M12 3.5 21.4 20H2.6z', 'M12 10v4.5', 'M12 17.4h.01'],
    alert: [CIRCLE, 'M12 8v5', 'M12 16.2h.01'],
    check: [CIRCLE, 'm8.2 12.4 2.7 2.7 5-5.4'],
    bulb: ['M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z', 'M9.5 18.5h5', 'M10.5 21h3'],
    star: [starPath()],
  };
  const PRESET_ORDER = ['note', 'attention', 'important'];
  const PRESETS = {
    note: { color: 'blue', icon: 'info' },
    attention: { color: 'amber', icon: 'warning' },
    important: { color: 'red', icon: 'alert' },
  };
  const DEFAULT = PRESETS.note;

  const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key);
  const colorOf = key => COLORS[has(COLORS, key) ? key : DEFAULT.color];
  const iconOf = key => ICONS[has(ICONS, key) ? key : DEFAULT.icon];

  function svgMarkup(iconKey, stroke) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + iconOf(iconKey).map(d => '<path d="' + d + '"/>').join('') + '</svg>';
  }

  // L'icône en PNG, de la couleur d'accent : pdfmake et Word n'embarquent que des images (les glyphes d'icône, eux, manquent aux polices des PDF).
  // `pixels` de côté ; dessinée à partir des mêmes tracés que le CSS, par Path2D. Retourne une URL de données.
  function iconPng(iconKey, hexColor, pixels) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    ctx.scale(pixels / 24, pixels / 24);
    ctx.strokeStyle = hexColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    iconOf(iconKey).forEach(d => ctx.stroke(new Path2D(d)));
    return canvas.toDataURL('image/png');
  }

  // Le CSS qui dépend de la palette : les variables d'une couleur et d'une icône, portées par l'attribut de l'encadré (`.callout` seul garde les
  // valeurs par défaut : la plus faible spécificité, donc battue par les règles à attribut). La mise en page de l'encadré est dans css/callout.css.
  function maskUrl(iconKey) { return 'url("data:image/svg+xml,' + encodeURIComponent(svgMarkup(iconKey, '#000')) + '")'; }
  function styleText() {
    const first = COLORS[DEFAULT.color];
    const rules = ['.callout { --callout-accent: ' + first.accent + '; --callout-tint: ' + first.tint + '; --callout-icon: ' + maskUrl(DEFAULT.icon) + '; }'];
    COLOR_ORDER.forEach(key => rules.push('.callout[data-color="' + key + '"] { --callout-accent: ' + COLORS[key].accent + '; --callout-tint: ' + COLORS[key].tint + '; }'));
    ICON_ORDER.forEach(key => rules.push('.callout[data-icon="' + key + '"] { --callout-icon: ' + maskUrl(key) + '; }'));
    return rules.join('\n');
  }
  function installStyles() {
    if (document.getElementById('pp-callout-style')) return;
    const style = document.createElement('style');
    style.id = 'pp-callout-style';
    style.textContent = styleText();
    document.head.appendChild(style);
  }

  // Le nœud
  // Un bloc qui contient des blocs (comme la citation) : défini (`defining`), pour que le copier-coller et la transformation gardent l'encadré autour
  // de son contenu.
  function createNode(Node, mergeAttributes) {
    return Node.create({
      name: 'callout',
      group: 'block',
      content: 'block+',
      defining: true,
      addAttributes() {
        return {
          color: { default: DEFAULT.color, parseHTML: el => (has(COLORS, el.getAttribute('data-color')) ? el.getAttribute('data-color') : DEFAULT.color), renderHTML: attrs => ({ 'data-color': attrs.color }) },
          icon: { default: DEFAULT.icon, parseHTML: el => (has(ICONS, el.getAttribute('data-icon')) ? el.getAttribute('data-icon') : DEFAULT.icon), renderHTML: attrs => ({ 'data-icon': attrs.icon }) },
        };
      },
      parseHTML() { return [{ tag: 'div.callout' }]; },
      // role="note" : un lecteur d'écran annonce l'encadré comme une remarque à part du texte (l'icône, elle, n'est qu'un dessin).
      renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'callout', role: 'note' }), 0]; },
    });
  }

  // L'encadré le plus proche autour d'une position : { pos, node } ou null.
  function findAround($pos) {
    for (let depth = $pos.depth; depth >= 1; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'callout') return { pos: $pos.before(depth), node };
    }
    return null;
  }
  const isInside = ed => !!ed && !!findAround(ed.state.selection.$from);

  // Entoure la sélection : les blocs choisis (ou celui du curseur) se retrouvent dans l'encadré. Dans une liste, un encadré ne peut pas prendre la
  // place d'un paragraphe d'élément (le premier enfant d'un élément est un paragraphe) : c'est alors la liste entière qui est entourée.
  function wrapSelection(ed, attrs) {
    if (ed.can().wrapIn('callout', attrs)) return ed.chain().focus().wrapIn('callout', attrs).run();
    const { $from } = ed.state.selection;
    for (let depth = $from.depth; depth >= 1; depth--) {
      if (!/(?:bullet|ordered|task)List$/i.test($from.node(depth).type.name)) continue;
      const pos = $from.before(depth);
      return ed.chain().focus().setNodeSelection(pos).wrapIn('callout', attrs).run();
    }
    return false;
  }

  // Retire l'encadré autour du curseur sans toucher à son contenu : le cadre est remplacé par ses blocs, et la sélection reste où elle était dans le
  // texte (un cran plus bas : le jeton d'ouverture du cadre n'est plus devant elle). Pas `tr.lift` : en mode suivi, la bibliothèque traduit une levée
  // en texte barré dans le cadre et le même texte inséré après lui (le cadre, vide, reste une fois tout accepté), alors qu'un remplacement donne le
  // cadre entier barré et son contenu inséré : « Tout accepter » rend exactement le document sans l'encadré, « Tout refuser » celui d'avant (même
  // technique que ConditionalText.unwrap, js/conditional-text.js). Faux, sans rien changer, quand le parent n'accepte pas ces blocs à la place du
  // cadre (le premier bloc d'un élément de liste doit être un paragraphe).
  function unwrapAround(ed) {
    const found = findAround(ed.state.selection.$from);
    if (!found) return false;
    return ed.chain().focus().command(({ tr }) => {
      const $pos = tr.doc.resolve(found.pos);
      if (!$pos.parent.canReplace($pos.index(), $pos.index() + 1, found.node.content)) return false;
      const { selection } = tr;
      const end = found.pos + found.node.nodeSize;
      const inside = pos => pos > found.pos && pos < end;
      const type = selection.toJSON().type;
      tr.replaceWith(found.pos, end, found.node.content);
      let next = null;
      // Un nœud sélectionné (une image du cadre) reste sélectionné : sa classe est celle de la sélection même (deux exemplaires du module de
      // ProseMirror circulent, cf. selectedImageNode).
      if (type === 'node' && inside(selection.from)) next = selection.constructor.create(tr.doc, selection.from - 1);
      else if (type === 'text' && inside(selection.anchor) && inside(selection.head)) next = EditorCore.getTextSelectionClass().create(tr.doc, selection.anchor - 1, selection.head - 1);
      tr.setSelection(next || EditorCore.getTextSelectionClass().near(tr.doc.resolve(found.pos), 1));
      return true;
    }).run();
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let state = { color: DEFAULT.color, icon: DEFAULT.icon, editing: false };

  // Les groupes de choix de la fenêtre : Entrée la valide (Dom.radioGroup).
  const radioGroup = (labelId, options, onPick) => Dom.radioGroup({ className: 'pp-callout-options', labelId, options, onPick, onEnter: apply });

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton de la barre - la sélection y est restée.
    win = ModalBase.create({ id: 'pp-callout-modal', titleId: 'pp-callout-title', size: 'md', boxClass: 'pp-callout-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const grid = el('div', 'pp-callout-grid');
    const typeLabel = el('span', 'pp-callout-label'); typeLabel.id = 'pp-callout-type-label';
    const colorLabel = el('span', 'pp-callout-label'); colorLabel.id = 'pp-callout-color-label';
    const iconLabel = el('span', 'pp-callout-label'); iconLabel.id = 'pp-callout-icon-label';
    const previewLabel = el('span', 'pp-callout-label');

    const types = radioGroup('pp-callout-type-label', PRESET_ORDER.map(key => ({
      value: key,
      className: 'pp-callout-type',
      fill(button) {
        const swatch = el('span', 'pp-callout-type-icon');
        swatch.innerHTML = svgMarkup(PRESETS[key].icon, 'currentColor');
        swatch.style.color = COLORS[PRESETS[key].color].accent;
        button.append(swatch, el('span', 'pp-callout-type-name'));
      },
    })), key => pick({ color: PRESETS[key].color, icon: PRESETS[key].icon }));
    const colors = radioGroup('pp-callout-color-label', COLOR_ORDER.map(key => ({
      value: key,
      className: 'pp-callout-swatch',
      fill(button) { button.style.setProperty('--swatch', COLORS[key].accent); },
    })), key => pick({ color: key }));
    const icons = radioGroup('pp-callout-icon-label', ICON_ORDER.map(key => ({
      value: key,
      className: 'pp-callout-icon-option',
      fill(button) { button.innerHTML = svgMarkup(key, 'currentColor'); },
    })), key => pick({ icon: key }));

    const paper = el('div', 'pp-callout-paper');
    const preview = el('div', 'callout');
    const sample = el('p');
    preview.appendChild(sample);
    paper.appendChild(preview);
    grid.append(typeLabel, types.group, colorLabel, colors.group, iconLabel, icons.group, previewLabel, paper);
    win.body.appendChild(grid);

    const { first: remove, cancel, ok } = win.addButtons('var-modal-danger');
    refs = { typeLabel, colorLabel, iconLabel, previewLabel, types, colors, icons, preview, sample, remove, cancel, ok };
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
    remove.addEventListener('click', removeCallout);
  }

  function pick(change) {
    Object.assign(state, change);
    render();
  }

  function render() {
    const { types, colors, icons, preview } = refs;
    const preset = PRESET_ORDER.find(key => PRESETS[key].color === state.color && PRESETS[key].icon === state.icon);
    types.check(preset);
    colors.check(state.color);
    icons.check(state.icon);
    preview.dataset.color = state.color;
    preview.dataset.icon = state.icon;
  }

  function closeWindow() {
    if (win) win.hide();
    const ed = EditorCore.getEditor();
    if (ed) ed.commands.focus();
  }

  // Ouvre la fenêtre : pour modifier l'encadré autour du curseur s'il y en a un, sinon pour en insérer un (autour de la sélection). Faux quand
  // l'éditeur n'est pas modifiable.
  function open() {
    const ed = EditorCore.getEditor();
    if (!ed || !ed.isEditable) return false;
    ensure();
    const found = findAround(ed.state.selection.$from);
    state = found ? { color: has(COLORS, found.node.attrs.color) ? found.node.attrs.color : DEFAULT.color, icon: has(ICONS, found.node.attrs.icon) ? found.node.attrs.icon : DEFAULT.icon, editing: true }
      : { color: DEFAULT.color, icon: DEFAULT.icon, editing: false };
    const { typeLabel, colorLabel, iconLabel, previewLabel, types, colors, icons, sample, remove, cancel, ok } = refs;
    win.title.textContent = I18n.t(state.editing ? 'callout.title.edit' : 'callout.title.new');
    typeLabel.textContent = I18n.t('callout.type');
    colorLabel.textContent = I18n.t('callout.color');
    iconLabel.textContent = I18n.t('callout.icon');
    previewLabel.textContent = I18n.t('callout.preview');
    types.buttons.forEach(b => { b.querySelector('.pp-callout-type-name').textContent = I18n.t('callout.type.' + b.dataset.value); });
    colors.buttons.forEach(b => { const name = I18n.t('callout.color.' + b.dataset.value); b.setAttribute('aria-label', name); b.title = name; });
    icons.buttons.forEach(b => { const name = I18n.t('callout.icon.' + b.dataset.value); b.setAttribute('aria-label', name); b.title = name; });
    sample.textContent = I18n.t('callout.preview.sample');
    remove.textContent = I18n.t('callout.remove');
    remove.hidden = !state.editing;
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(state.editing ? 'common.confirm' : 'common.insert');
    render();
    win.show(() => refs.types.buttons.find(b => b.tabIndex === 0));
    return true;
  }

  function apply() {
    const ed = EditorCore.getEditor();
    const attrs = { color: state.color, icon: state.icon };
    if (state.editing) {
      const found = findAround(ed.state.selection.$from);
      if (found) ed.chain().focus().command(({ tr }) => { tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, attrs)); return true; }).run();
    } else {
      wrapSelection(ed, attrs);
    }
    closeWindow();
  }

  function removeCallout() {
    unwrapAround(EditorCore.getEditor());
    closeWindow();
  }

  // Le bloc de signature
  // Une zone 2 colonnes : trois lignes vides pour signer (~1,6 cm), une ligne de tirets bas, puis la légende (« Nom et signature » à gauche, « Date »
  // à droite). Les tirets bas font une ligne dans tous les rendus sans rien de nouveau à exporter, et se remplacent comme du texte (une variable, une
  // autre légende...).
  const SIGNATURE_LINE = '_'.repeat(30);
  function signatureContent() {
    const column = caption => ({
      type: 'twoColumnsColumn',
      content: [{ type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: SIGNATURE_LINE }] },
        { type: 'paragraph', content: [{ type: 'text', text: caption }] }],
    });
    return { type: 'twoColumnsZone', content: [column(I18n.t('signature.name')), column(I18n.t('signature.date'))] };
  }

  // Insère le bloc sous le bloc du curseur (au premier niveau du document : sous la liste, le tableau, l'encadré où il se trouve) ; un paragraphe
  // vide est remplacé, pour ne pas laisser une ligne vide devant. Le curseur se pose dans la légende de gauche, prête à être changée.
  function insertSignature(ed) {
    if (!ed || !ed.isEditable) return false;
    const { $from } = ed.state.selection;
    const top = $from.depth >= 1 ? $from.node(1) : null;
    const emptyParagraph = !!top && top.type.name === 'paragraph' && top.content.size === 0;
    const from = $from.depth >= 1 ? (emptyParagraph ? $from.before(1) : $from.after(1)) : $from.pos;
    const to = emptyParagraph ? $from.after(1) : from;
    const ok = ed.chain().focus().insertContentAt({ from, to }, signatureContent()).run();
    if (!ok) return false;
    const zone = ed.state.doc.nodeAt(from);
    if (zone && zone.type.name === 'twoColumnsZone') {
      // Fin du dernier paragraphe de la première colonne : zone (1) + colonne (1) + ses cinq paragraphes.
      const firstColumn = zone.child(0);
      const target = from + 1 + 1 + firstColumn.content.size - 1;
      ed.chain().setTextSelection(target).focus().run();
    }
    return true;
  }

  installStyles();
  return { COLORS, COLOR_ORDER, ICON_ORDER, PRESETS, PRESET_ORDER, createNode, isInside, open, wrapSelection, insertSignature, iconPng, colorOf };
})();
