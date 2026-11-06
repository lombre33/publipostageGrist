// Barre flottante d'un cadre, les menus de la boîte : les colonnes de texte, l'orientation du texte et l'ordre (premier plan, arrière-plan, derrière le texte). `create(ctx)` rend les menus et ce qui
// les coche d'après le cadre sélectionné ; `ctx` : { ed, api, looksOf, applyLook } (js/free-frame-toolbar.js), `ctx.api` ce que js/free-frame.js lui donne (selectedFrame, patch...).
// Les corps viennent de wireToolbar de js/free-frame.js, copiés tels quels.
const FrameBoxMenus = (function () {
  function create(ctx) {
    const { applyLook, ed, looksOf } = ctx;
    const { COLUMN_GAP_PT, LAYER_BEHIND, normalized, patch, reorder, selectedFrame } = ctx.api;

    // Les COLONNES de texte : une, deux, trois ou quatre (le nombre d'un fichier PowerPoint qui n'est pas de ceux-là s'ajoute en dernière ligne, cochée). Un choix est UN pas d'historique ; l'écart entre les colonnes
    // reste celui du cadre (18 points pour un cadre qui n'en avait pas).
    const COLUMN_CHOICES = [1, 2, 3, 4];
    const columnRow = n => '<button type="button" role="menuitemradio" data-action="columns:' + n + '">' + Icons.svg('frameColumns' + (n === 1 ? 'One' : n === 2 ? 'Two' : n === 3 ? 'Three' : 'Four')) + '<span>' + I18n.t('frame.columnsValue', { n }) + '</span></button>';
    const columnsMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-columns-menu', COLUMN_CHOICES.map(columnRow).join('') + '<button type="button" role="menuitemradio" data-action="columns:other" style="display:none"><span></span></button>', (action) => {
      if (action.indexOf('columns:') !== 0 || action === 'columns:other') { EditorCore.closeDropdownPanel(); return; }
      const n = Number(action.slice(8));
      applyLook(a => ({ cols: n > 1 ? n : 0, colGap: n > 1 ? a.cols ? a.colGap : COLUMN_GAP_PT : 0 }));
    });
    columnsMenu.el.setAttribute('role', 'menu');
    columnsMenu.el.setAttribute('aria-label', I18n.t('frame.columns'));
    // L'ORIENTATION du texte : horizontal, tourné vers le bas (de haut en bas) ou vers le haut (de bas en haut). Un choix est UN pas d'historique.
    const ORIENTS = [['', 'frameOrientHorz', 'frame.orientHorz'], ['vert', 'frameOrientDown', 'frame.orientDown'], ['vert270', 'frameOrientUp', 'frame.orientUp']];
    const orientRow = o => '<button type="button" role="menuitemradio" data-action="orient:' + (o[0] || 'horz') + '">' + Icons.svg(o[1]) + '<span>' + I18n.t(o[2]) + '</span></button>';
    const orientMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-columns-menu v2-frame-orient-menu', ORIENTS.map(orientRow).join(''), (action) => {
      if (action.indexOf('orient:') !== 0) { EditorCore.closeDropdownPanel(); return; }
      const name = action.slice(7);
      applyLook({ vert: name === 'horz' ? '' : name });
    });
    orientMenu.el.setAttribute('role', 'menu');
    orientMenu.el.setAttribute('aria-label', I18n.t('frame.orientation'));
    // L'ORDRE : « Premier plan » et « Arrière-plan » (l'objet passe devant ou derrière les autres objets de la diapositive) et « Derrière le texte » (un réglage, coché quand l'objet l'est). Un menu à lignes nommées, comme
    // l'orientation et les colonnes : trois boutons côte à côte, sans libellé, se ressemblaient (deux carrés, l'un en pointillés) et allongeaient la barre. Chaque choix est UN pas d'historique et referme le menu.
    const orderRow = (name, icon, key, role) => '<button type="button" role="' + role + '" data-action="order:' + name + '">' + Icons.svg(icon) + '<span>' + I18n.t(key) + '</span></button>';
    const orderMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-columns-menu v2-frame-order-menu',
      orderRow('front', 'layerFront', 'frame.front', 'menuitem') + orderRow('back', 'layerBehind', 'frame.back', 'menuitem') + orderRow('behind', 'frameBehindText', 'frame.behindText', 'menuitemcheckbox'), (action) => {
        const found = selectedFrame(ed.state.selection);
        const name = action.indexOf('order:') === 0 ? action.slice(6) : '';
        if (found && (name === 'front' || name === 'back')) reorder(ed, found, name);
        else if (found && name === 'behind') patch(ed, found.pos, { layer: normalized(found.node.attrs).layer ? '' : LAYER_BEHIND }, true);
        EditorCore.closeDropdownPanel();
      });
    orderMenu.el.setAttribute('role', 'menu');
    orderMenu.el.setAttribute('aria-label', I18n.t('frame.order'));
    // « Derrière le texte » est un réglage : sa ligne est cochée quand l'objet l'est.
    const markOrder = () => {
      const a = looksOf();
      const row = orderMenu.el.querySelector('[data-action="order:behind"]');
      const on = !!a && a.layer === LAYER_BEHIND;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-checked', on ? 'true' : 'false');
    };
    const markOrient = () => {
      const a = looksOf();
      const now = a && a.vert ? a.vert : 'horz';
      orientMenu.el.querySelectorAll('[data-action^="orient:"]').forEach((row) => {
        const on = row.dataset.action.slice(7) === now;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    const markColumns = () => {
      const a = looksOf();
      const now = a && a.cols ? a.cols : 1;
      const known = COLUMN_CHOICES.indexOf(now) >= 0;
      columnsMenu.el.querySelectorAll('[data-action^="columns:"]').forEach((row) => {
        const name = row.dataset.action.slice(8);
        if (name === 'other') {
          row.style.display = known ? 'none' : '';
          if (!known) row.querySelector('span').textContent = I18n.t('frame.columnsValue', { n: now });
        }
        const on = name === 'other' ? !known : Number(name) === now;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };

    return { columnsMenu, markColumns, markOrder, markOrient, orderMenu, orientMenu };
  }

  return { create };
})();
