// Le menu de couleur de la barre d'outils et des barres flottantes (police, surlignage, fond de case, trait des bordures) : une palette de dix
// colonnes sur cinq rangées, les rangées de couleurs que la personne a gardées (« Couleurs du modèle » et « Couleurs du document »,
// js/color-store.js) et un pied « Personnalisé… » / « Par défaut ». « Personnalisé… » ouvre la fenêtre de js/color-dialog.js (carré, teinte, code hexadécimal, rouge-vert-bleu) :
// le menu ne cache plus de sélecteur natif sous un bouton, dont la fenêtre se refermait au premier choix, ne proposait aucun code et ne se laissait
// pas piloter à la souris. Les boutons gardent les actions d'avant (`pick:<couleur>`, `custom`, `none`) : le panneau reste celui d'EditorCore.
const ColorPalette = (function () {
  // Dix colonnes, cinq rangées. La première : les gris, du noir au blanc. Les quatre suivantes : dix teintes en quatre tons - foncé (4,9:1 au moins
  // sur la page blanche, donc lisible en texte), vif, clair et pastel (les fonds de surlignage et de case : les anciens pastels y sont, le jaune
  // #fff2a8 du surlignage compris).
  const GRAYS = ['#000000', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#ffffff'];
  const HUES = [
    ['#b91c1c', '#ef4444', '#fca5a5', '#ffd6d6'], // rouge
    ['#c2410c', '#f97316', '#fdba74', '#ffe0b3'], // orange
    ['#a16207', '#eab308', '#fde047', '#fff2a8'], // jaune
    ['#15803d', '#22c55e', '#86efac', '#c8f7c5'], // vert
    ['#0f766e', '#14b8a6', '#5eead4', '#c2f5ea'], // turquoise
    ['#0369a1', '#0ea5e9', '#7dd3fc', '#c8e6ff'], // ciel
    ['#1d4ed8', '#3b82f6', '#93c5fd', '#d0dcff'], // bleu
    ['#6d28d9', '#8b5cf6', '#c4b5fd', '#e6d6ff'], // violet
    ['#a21caf', '#d946ef', '#f0abfc', '#f5d0fe'], // fuchsia
    ['#be185d', '#ec4899', '#f9a8d4', '#ffd1e6'], // rose
  ];
  const ROWS = [GRAYS].concat([0, 1, 2, 3].map(tone => HUES.map(hue => hue[tone])));
  // Ce que le bouton « appliquer » d'un clic pose avant tout choix : le noir pour la police, le jaune de surligneur pour le surlignage.
  const DEFAULT_TEXT = GRAYS[0];
  const DEFAULT_HIGHLIGHT = '#fff2a8';

  const FORGET_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.2 2.2l5.6 5.6M7.8 2.2 2.2 7.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  // Une pastille. `pick` : le nom de l'action (« pick:<couleur> »). L'encre sert à la coche de la pastille choisie.
  function swatch(color, pick, attributes) {
    const name = color.toUpperCase();
    return `<button type="button" class="cp-swatch" data-action="${pick}:${color}" data-color="${color}" style="--swatch:${color};--ink:${ColorMath.inkOn(color)}" title="${name}" aria-label="${name}" aria-pressed="false"${attributes || ''}></button>`;
  }

  // Une rangée de couleurs gardées : son nom, puis ses pastilles, chacune avec sa croix (au survol : css/color-palette.css) qui la retire de la
  // rangée. Sans couleur, « Aucune » à côté du nom (une seule ligne : css/color-palette.css).
  function savedRow(scope, pick) {
    const items = scope.colors.map(color => {
      const forget = I18n.t('color.forget', { color: color.toUpperCase() });
      return `<span class="cp-saved" data-scope="${scope.id}">${swatch(color, pick, ' aria-keyshortcuts="Delete"')}`
        + `<button type="button" class="cp-forget" data-action="forget:${scope.id}:${color}" tabindex="-1" title="${forget}" aria-label="${forget}">${FORGET_ICON}</button></span>`;
    }).join('');
    return `<div class="cp-row${items ? '' : ' is-empty'}" data-scope="${scope.id}" role="group" aria-label="${scope.label}"><div class="cp-row-label" title="${scope.hint}">${scope.label}</div>`
      + `<div class="cp-row-list">${items || `<span class="cp-row-empty">${I18n.t('color.scope.empty')}</span>`}</div></div>`;
  }

  function footer(opts) {
    const none = opts.noneKey ? I18n.t(opts.noneKey) : '';
    return '<div class="v2-color-dropdown-footer">'
      + `<button type="button" class="cp-custom" data-action="${opts.customAction}" title="${I18n.t('colorDropdown.custom')}">${Icons.svg('fill')}<span>${I18n.t('colorDropdown.customLabel')}</span></button>`
      + (none ? `<button type="button" data-action="${opts.noneAction}" title="${none}">${Icons.svg('noColor')}<span>${none}</span></button>` : '')
      + '</div>';
  }

  // Le corps du menu : le réglage éventuel (`head`) et la palette (`.cp-main`), les rangées de couleurs gardées (`.cp-rows`), le pied. Dans un panneau haut
  // tout s'empile dans cet ordre ; dans un panneau court les rangées passent à droite, le pied reste sous la palette (css/color-palette.css).
  function markup(opts) {
    const grid = ROWS.filter((row, at) => !opts.rows || opts.rows.includes(at)).map(row => row.map(color => swatch(color, opts.pickAction)).join('')).join('');
    return '<div class="cp-body"><div class="cp-main">' + (opts.head || '')
      + `<div class="cp-grid" role="group" aria-label="${I18n.t('color.palette')}">${grid}</div></div>`
      + `<div class="cp-rows">${ColorStore.scopes().map(scope => savedRow(scope, opts.pickAction)).join('')}</div>`
      + footer(opts) + '</div>'
      + (opts.tail || '');
  }

  // Marque dans `root` la pastille de `color` (une couleur de style, « #1e8449 » ou « rgb(30, 132, 73) »), et « Personnalisé… » quand la couleur
  // n'est dans aucune rangée : c'est alors une couleur composée à la main. Aucune pastille remplacée : appelée sous la souris, elle ne change pas
  // ce que le bouton enfoncé devient.
  function mark(root, color) {
    const hex = ColorMath.parseCss(color);
    let found = false;
    root.querySelectorAll('.cp-swatch').forEach(button => {
      const on = !!hex && button.dataset.color === hex;
      found = found || on;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const custom = root.querySelector('.cp-custom');
    if (custom) custom.classList.toggle('is-active', !!hex && !found);
  }

  // Un menu de couleur dans un panneau d'EditorCore.createFloatingPanel. Options :
  //   className       les classes du panneau (« v2-color-dropdown », le menu Bordures y ajoute les siennes) ;
  //   head            du HTML posé au-dessus de la palette (les réglages du menu Bordures) ;
  //   tail            du HTML posé sous le pied du menu (la ligne « Quadrillage » du menu Bordures) ;
  //   rows            les rangées de la palette à montrer, par rang (toutes par défaut) : le menu Bordures, plus haut que les autres, en prend deux ;
  //   pickAction, customAction, noneAction   les noms d'action des boutons (« pick », « custom » et « none » par défaut ; le menu Bordures : « pen »,
  //                   « pen-custom » et « pen-auto ») ; noneKey : la clé du libellé du bouton qui retire la couleur, sans elle pas de bouton ;
  //   current()       la couleur du moment (de style ou #rrggbb), marquée dans la palette ; null quand il n'y en a pas ;
  //   onPick(color), onNone()   ce que fait un choix, y compris refermer le menu s'il doit se refermer ;
  //   onAction(action)          les autres boutons du panneau (les réglages de bordures) ;
  //   markNone                  marquer aussi le bouton qui retire la couleur quand il n'y en a pas (« Par défaut » du menu Bordures) ;
  //   afterRender(panel)        rappelé après chaque redessin : ce que le menu règle sur ses boutons à l'ouverture (le menu Bordures grise un réglage) ;
  //   reopenAfterCustom         rouvrir le menu quand la fenêtre se ferme (le menu Bordures, où l'on choisit encore un réglage après la couleur).
  // Rend le panneau, dont `mark(color)` change la couleur marquée sans le redessiner. Le menu se redessine à chaque ouverture : langue, couleurs
  // gardées (du modèle chargé, du document) et couleur du moment sont ceux d'alors.
  function createMenu(options) {
    const opts = Object.assign({ pickAction: 'pick', customAction: 'custom', noneAction: 'none' }, options);
    const current = () => (opts.current ? opts.current() : null);
    const paint = (color) => {
      mark(panel.el, color);
      const none = opts.markNone ? panel.el.querySelector('[data-action="' + opts.noneAction + '"]') : null;
      if (none) none.classList.toggle('is-active', !ColorMath.parseCss(color));
    };
    const render = () => {
      panel.el.innerHTML = markup(opts);
      paint(current());
      if (opts.afterRender) opts.afterRender(panel);
    };
    const panel = EditorCore.createFloatingPanel(opts.className, markup(opts), (action) => {
      if (action === opts.customAction) openDialog();
      else if (action === opts.noneAction) opts.onNone();
      else if (action.indexOf(opts.pickAction + ':') === 0) opts.onPick(action.slice(opts.pickAction.length + 1));
      else if (action.indexOf('forget:') === 0) forget(action.split(':')[1], action.split(':')[2], true);
      else if (opts.onAction) opts.onAction(action);
    });

    // Le menu mesure de 165 (panneau court et large) à 245 px de haut, parfois plus que la place dont il dispose au-dessus ou au-dessous d'une barre
    // flottante dans un panneau de 400 px : plutôt que de déborder de la fenêtre (pied « Personnalisé… » coupé), il glisse le long de son bouton
    // jusqu'à y tenir tout entier.
    const fitInWindow = options => () => {
      const asked = (typeof options === 'function' ? options() : options) || {};
      return Object.assign({}, asked, { shift: Object.assign({ crossAxis: true }, asked.shift) });
    };
    let shownAt = null;
    const show = panel.show;
    panel.show = (referenceEl, options) => {
      shownAt = [referenceEl, options];
      render();
      show(referenceEl, fitInWindow(options));
    };
    panel.mark = paint;

    function reopen() {
      if (!shownAt) return;
      panel.show(shownAt[0], shownAt[1]);
      EditorCore.setOpenDropdownPanel(panel, shownAt[0]);
    }

    // « Personnalisé… » : le menu se referme et la fenêtre s'ouvre sur la couleur du moment ; « Appliquer » garde la couleur dans les rangées
    // cochées, puis la pose comme un clic sur une pastille.
    function openDialog() {
      const initial = ColorMath.parseCss(current());
      EditorCore.closeDropdownPanel();
      ColorDialog.open({
        initial,
        onApply: ({ color, scopes }) => { ColorStore.addTo(scopes, color); opts.onPick(color); },
        onClose: opts.reopenAfterCustom ? reopen : null,
      });
    }

    // Retire une couleur gardée. Sous la souris, les pastilles ne se redessinent qu'une fois le bouton relâché : celle qui prendrait la place du
    // pointeur recevrait sinon le clic qui suit l'appui, et poserait sa couleur.
    function forget(scopeId, color, underMouse) {
      if (!ColorStore.remove(scopeId, color)) return;
      if (underMouse) document.addEventListener('mouseup', () => setTimeout(render, 0), { once: true, capture: true });
      else render();
    }
    // Au clavier : Suppr (ou Retour arrière) sur une couleur gardée la retire, le focus passe à la première couleur gardée qui reste.
    panel.el.addEventListener('keydown', (event) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const saved = event.target.closest ? event.target.closest('.cp-saved') : null;
      if (!saved) return;
      event.preventDefault();
      forget(saved.dataset.scope, saved.querySelector('.cp-swatch').dataset.color, false);
      const next = panel.el.querySelector('.cp-saved .cp-swatch') || panel.el.querySelector('.cp-custom');
      if (next) next.focus();
    });
    return panel;
  }

  return { ROWS, DEFAULT_TEXT, DEFAULT_HIGHLIGHT, createMenu, mark };
})();
