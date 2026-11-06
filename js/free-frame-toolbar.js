// Barre flottante du cadre sélectionné (js/free-frame.js : `wireToolbar`) : son fond, la couleur et l'épaisseur de son trait (un menu chacun : la palette de la barre d'outils,
// js/color-palette.js, et une courte liste), premier plan, arrière-plan, dupliquer, supprimer. Un choix est UN pas d'historique ; une couleur de trait sans épaisseur (ou l'inverse) apporte
// l'autre, celle d'une forme neuve : un choix doit se voir. `wire(ed, api)` pose la barre et rend { panel, sync } ; `api` : ce que js/free-frame.js lui donne (selectedFrame, patch,
// reorder...). Les menus du trait sont à js/free-frame-line-menus.js, ceux de la boîte (colonnes, orientation, ordre) à js/free-frame-box-menus.js ; les corps viennent de wireToolbar, copiés tels quels.
const FrameToolbar = (function () {
  function wire(ed, api) {
    const {
      BAR_GAP_PX, BOX, LAYER_BEHIND, ROTATE_ROOM_PX, SHAPE_LOOK, clamp, duplicate, inPresentation, isLineAttrs, lookRefused, normalized, paint, patch, remove,
      selectedFrame, toNumber,
    } = api;
    // « Animation… » : la fenêtre de l'extension « diapositives » (extensions/diapositives/frame-anim-ui.js) règle l'animation de l'objet ; sans elle, la ligne dit pourquoi elle ne s'ouvre pas.
    function openAnimation(ed, found) {
      if (typeof FrameAnimUi === 'undefined') { SlidesEntry.explainOff(); return; }
      EditorCore.closeDropdownPanel();
      FrameAnimUi.open(ed, found.pos);
    }
    // « Lien… » : la fenêtre « Lien… » du texte (js/link-dialog.js), pour l'objet entier (js/frame-link.js). Le lien choisi se pose d'UN pas d'historique, avec le signet d'une diapositive qui n'en avait pas.
    function openLink(ed, found) {
      EditorCore.closeDropdownPanel();
      // L'objet se retrouve à la validation : la fenêtre est ouverte, le texte peut avoir bougé (écriture en direct), la sélection est restée sur lui.
      const here = () => { const again = selectedFrame(ed.state.selection); return again ? again.pos : -1; };
      LinkDialog.openForObject({
        href: normalized(found.node.attrs).link,
        trans: normalized(found.node.attrs).linkTrans,
        apply: (href, claim, trans) => { const pos = here(); if (pos >= 0) patch(ed, pos, { link: href, linkTrans: trans || '' }, true, tr => LinkDialog.claimInto(tr, claim)); },
        remove: () => { const pos = here(); if (pos >= 0) patch(ed, pos, { link: '', linkTrans: '' }, true); },
      });
    }
    const button = (action, icon, key) => '<button data-action="' + action + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key) + '">' + Icons.svg(icon) + '</button>';
    const chip = (action, icon, key, bar) => '<button data-action="' + action + '" class="v2-fill-chip" id="v2-frame-' + action + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key)
      + '" aria-haspopup="true" aria-expanded="false">' + Icons.svg(icon) + (bar ? '<span class="v2-fill-bar" id="v2-frame-' + bar + '-bar"></span>' : '') + Icons.svg('caretDown') + '</button>';
    const html = [
      chip('fill-open', 'fill', 'frame.fill', 'fill'),
      chip('line-open', 'shapeLine', 'frame.line', 'line'),
      chip('width-open', 'lineWidth', 'frame.lineWidth'),
      chip('dash-open', 'lineDash', 'frame.dash'),
      chip('ends-open', 'lineEnds', 'frame.ends'),
      '<span class="v2-floating-sep"></span>',
      chip('order-open', 'layerFront', 'frame.order'),
      '<span class="v2-floating-sep"></span>',
      button('animate', 'frameAnimation', 'frame.animation'),
      button('link', 'link', 'frame.link'),
      button('alt', 'altText', 'altText.button'),
      chip('orient-open', 'frameOrientDown', 'frame.orientation'),
      chip('columns-open', 'frameColumns', 'frame.columns'),
      chip('align-open', 'alignObjLeft', 'frame.align'),
      '<span class="v2-floating-sep"></span>',
      button('hide', 'eyeOff', 'frame.hide'),
      button('duplicate', 'duplicate', 'frame.duplicate'),
      '<span class="v2-floating-sep"></span>',
      button('delete', 'trash', 'frame.delete'),
    ].join('');
    const looksOf = () => { const found = selectedFrame(ed.state.selection); return found ? normalized(found.node.attrs) : null; };
    const applyLook = (changes) => {
      const found = selectedFrame(ed.state.selection);
      if (found) {
        const current = normalized(found.node.attrs);
        const next = typeof changes === 'function' ? changes(current) : changes;
        if (lookRefused(current, next)) SlidesEntry.status(I18n.t('frame.artTooDetailed'));
        else patch(ed, found.pos, next, true);
      }
      EditorCore.closeDropdownPanel();
    };
    // Une ligne a toujours un trait : ni « Sans trait » dans la palette de sa couleur, ni « Aucun trait » dans la liste de ses épaisseurs.
    const lineSelected = () => { const a = looksOf(); return !!a && isLineAttrs(a); };
    // La TRANSPARENCE d'un fond ou d'un trait se règle dans le menu de sa couleur, sous la palette : une glissière de 0 (opaque) à 100 % (invisible) et sa valeur. Tirée, elle redessine le cadre
    // sans toucher au document ; relâchée (ou à chaque touche fléchée), elle écrit : UN pas d'historique par geste, et le menu reste ouvert pour ajuster encore. Sans fond (ou sans trait)
    // à voiler elle est grisée, avec sa raison en info-bulle, jamais retirée.
    const TRANSPARENCY = {
      fill: { attr: 'fillTr', label: 'frame.fillTransparency', off: 'frame.transparencyNoFill' },
      line: { attr: 'lineTr', label: 'frame.lineTransparency', off: 'frame.transparencyNoLine' },
    };
    const transparencyRow = key => '<div class="v2-frame-tr"><label class="v2-frame-tr-name" for="v2-frame-' + key + '-tr">' + I18n.t('frame.transparency') + '</label>'
      + '<input type="range" id="v2-frame-' + key + '-tr" data-role="' + key + '-tr" min="0" max="100" step="1" value="0" aria-label="' + I18n.t(TRANSPARENCY[key].label) + '">'
      + '<output class="v2-frame-tr-value" for="v2-frame-' + key + '-tr"></output></div>';
    const showTransparency = (input) => {
      const text = I18n.t('frame.transparencyValue', { n: input.value });
      input.setAttribute('aria-valuetext', text);
      input.parentElement.querySelector('output').textContent = text;
    };
    const syncTransparency = (menu, key) => {
      const input = menu.el.querySelector('[data-role="' + key + '-tr"]');
      if (!input) return;
      const a = looksOf();
      if (!a) return;
      const on = !!a[key];
      input.value = on ? a[TRANSPARENCY[key].attr] : 0;
      input.disabled = !on;
      input.parentElement.title = on ? '' : I18n.t(TRANSPARENCY[key].off);
      showTransparency(input);
    };
    const wireTransparency = (menu, key) => {
      const attr = TRANSPARENCY[key].attr;
      const slider = '[data-role="' + key + '-tr"]';
      const valueOf = input => clamp(Math.round(toNumber(input.value, 0)), 0, 100);
      menu.el.addEventListener('input', (event) => {
        const input = event.target.closest(slider);
        const found = input ? selectedFrame(ed.state.selection) : null;
        if (!found) return;
        showTransparency(input);
        const dom = ed.view.nodeDOM(found.pos);
        if (dom) paint(dom, Object.assign(normalized(found.node.attrs), { [attr]: valueOf(input) }));
      });
      menu.el.addEventListener('change', (event) => {
        const input = event.target.closest(slider);
        const found = input ? selectedFrame(ed.state.selection) : null;
        if (!found) return;
        if (patch(ed, found.pos, { [attr]: valueOf(input) }, true)) return;
        const dom = ed.view.nodeDOM(found.pos);
        if (dom) paint(dom, normalized(found.node.attrs));
      });
      // Menu ouvert, le document peut changer sous la glissière (Annuler, Rétablir) : elle reprend la valeur du cadre. Seul un changement du document compte : le focus qui passe de l'éditeur à la glissière
      // est lui aussi une transaction, et la glissière tirée ne doit pas revenir en arrière sous la souris.
      ed.on('transaction', ({ transaction }) => { if (transaction.docChanged && menu.el.classList.contains('visible')) syncTransparency(menu, key); });
    };
    const colorMenu = (key, noneKey, onPick, onNone) => {
      const menu = ColorPalette.createMenu({
        className: 'v2-color-dropdown', noneKey, tail: transparencyRow(key), current: () => (looksOf() || {})[key] || null, onPick, onNone,
        afterRender: (panel) => {
          const none = panel.el.querySelector('[data-action="none"]');
          if (none) none.style.display = key === 'line' && lineSelected() ? 'none' : '';
          syncTransparency(panel, key);
        },
      });
      wireTransparency(menu, key);
      return menu;
    };
    const ctx = { ed, api, looksOf, applyLook, lineSelected };
    const { dashMenu, endsMenu, markDash, markEnds, markWidth, widthMenu } = FrameLineMenus.create(ctx);
    const { columnsMenu, markColumns, markOrder, markOrient, orderMenu, orientMenu } = FrameBoxMenus.create(ctx);
    const menus = {
      'order-open': orderMenu,
      'orient-open': orientMenu,
      'columns-open': columnsMenu,
      'align-open': FrameMulti.createAlignMenu(ed),
      'fill-open': colorMenu('fill', 'frame.noFill', color => applyLook({ fill: color }), () => applyLook({ fill: '' })),
      'line-open': colorMenu('line', 'frame.noLine', color => applyLook(a => ({ line: color, lw: a.lw || SHAPE_LOOK.lw })), () => applyLook({ line: '' })),
      'width-open': widthMenu,
      'dash-open': dashMenu,
      'ends-open': endsMenu,
    };
    const openMenu = (action) => {
      const menu = menus[action];
      const trigger = document.getElementById('v2-frame-' + action);
      if (EditorCore.getOpenDropdownPanel() === menu) { EditorCore.closeDropdownPanel(); return; }
      EditorCore.closeDropdownPanel();
      if (action === 'order-open') markOrder();
      if (action === 'orient-open') markOrient();
      if (action === 'columns-open') markColumns();
      if (action === 'width-open') markWidth();
      if (action === 'dash-open') markDash();
      if (action === 'ends-open') markEnds();
      menu.show(trigger);
      EditorCore.setOpenDropdownPanel(menu, trigger);
    };
    const panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-frame-toolbar', html, (action) => {
      if (menus[action]) { openMenu(action); return; }
      const found = selectedFrame(ed.state.selection);
      if (!found) return;
      if (action === 'animate') openAnimation(ed, found);
      else if (action === 'link') openLink(ed, found);
      else if (action === 'alt') AltText.open();
      else if (action === 'hide') patch(ed, found.pos, { hidden: normalized(found.node.attrs).hidden ? '' : '1' }, true);
      else if (action === 'duplicate') duplicate(ed, found);
      else if (action === 'delete') remove(ed, found);
    });
    const fillChip = panel.el.querySelector('#v2-frame-fill-open');
    const endsChip = panel.el.querySelector('#v2-frame-ends-open');
    const columnsChip = panel.el.querySelector('#v2-frame-columns-open');
    const orientChip = panel.el.querySelector('#v2-frame-orient-open');
    const orderChip = panel.el.querySelector('#v2-frame-order-open');
    const animateButton = panel.el.querySelector('[data-action="animate"]');
    const linkButton = panel.el.querySelector('[data-action="link"]');
    const altButton = panel.el.querySelector('[data-action="alt"]');
    const hideButton = panel.el.querySelector('[data-action="hide"]');
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      // Le blur de l'éditeur (un clic ailleurs dans la page) est une transaction de plus, mais ne change ni la sélection ni le document : la traiter rouvrirait la barre que le filet de
      // editor-core.js vient de fermer.
      if (transaction && transaction.getMeta('blur')) return;
      const found = ed.isEditable && inPresentation() && FrameMulti.count(ed.state) < 2 ? selectedFrame(ed.state.selection) : null;   // plusieurs cadres choisis : la barre est celle de js/frame-multi.js
      const dom = found ? ed.view.nodeDOM(found.pos) : null;
      const box = dom && dom.querySelector ? dom.querySelector('.' + BOX) : null;
      const a = box ? normalized(found.node.attrs) : null;
      // Une ligne n'a pas de fond mais des extrémités ; un cadre ou une forme, l'inverse : les pastilles sont réglées AVANT de poser la barre, qui se place d'après sa largeur.
      const isLine = !!a && isLineAttrs(a);
      if (fillChip) fillChip.style.display = isLine ? 'none' : '';
      if (endsChip) endsChip.style.display = isLine ? '' : 'none';
      if (columnsChip) columnsChip.style.display = isLine ? 'none' : '';
      if (orientChip) orientChip.style.display = isLine ? 'none' : '';
      if (linkButton) linkButton.style.display = isLine ? 'none' : '';
      // « Derrière le texte » est un réglage : la pastille de l'ordre est enfoncée quand le cadre l'est (le menu coche sa ligne), comme l'était son bouton.
      if (orderChip) orderChip.classList.toggle('is-active', !!a && a.layer === LAYER_BEHIND);
      if (menus['order-open'].el.classList.contains('visible')) markOrder();
      // « Animation… » est enfoncé quand l'objet est animé.
      if (animateButton) {
        animateButton.classList.toggle('is-active', !!a && !!a.anim);
        animateButton.setAttribute('aria-pressed', a && a.anim ? 'true' : 'false');
      }
      // « Lien… » est enfoncé quand l'objet a un lien, et son info-bulle dit où il mène.
      if (linkButton) {
        linkButton.classList.toggle('is-active', !!a && !!a.link);
        linkButton.setAttribute('aria-pressed', a && a.link ? 'true' : 'false');
        const tip = a && a.link ? I18n.t('frame.linkOn', { name: FrameLink.describe(ed, a.link) }) : I18n.t('frame.link');
        linkButton.title = tip;
        linkButton.setAttribute('aria-label', tip);
      }
      // « Texte alternatif… » est enfoncé quand l'objet est décrit (un texte, ou « Objet décoratif »).
      if (altButton) {
        const described = !!a && AltText.isDescribed(a);
        altButton.classList.toggle('is-active', described);
        altButton.setAttribute('aria-pressed', described ? 'true' : 'false');
      }
      // « Masquer l'objet » est enfoncé quand l'objet est masqué.
      if (hideButton) {
        hideButton.classList.toggle('is-active', !!a && !!a.hidden);
        hideButton.setAttribute('aria-pressed', a && a.hidden ? 'true' : 'false');
      }
      if (box) panel.show(box, isLine ? undefined : () => ({ offset: BAR_GAP_PX + Math.ceil(ROTATE_ROOM_PX * EditorCore.layoutZoom(box)) }));
      else {
        panel.hide();
        if (Object.keys(menus).some(name => menus[name] === EditorCore.getOpenDropdownPanel())) EditorCore.closeDropdownPanel();
      }
      EditorCore.setColorBar('v2-frame-fill-bar', a && a.fill ? a.fill : null);
      EditorCore.setColorBar('v2-frame-line-bar', a && a.line ? a.line : null);
    };
    ed.on('selectionUpdate', check);
    ed.on('transaction', check);
    // Menu des extrémités ouvert, le document peut changer sous lui (Annuler, Rétablir) : ses choix reprennent ceux de la ligne.
    ed.on('transaction', ({ transaction }) => { if (transaction.docChanged && endsMenu.el.classList.contains('visible')) markEnds(); });
    const sync = () => { check(); multiCheck(); };
    const multiCheck = FrameMulti.wireToolbar(ed);
    return { panel, sync };
  }

  return { wire };
})();
