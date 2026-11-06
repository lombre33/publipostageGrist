// Barre flottante d'un cadre, les menus du trait : l'épaisseur, les extrémités d'une ligne (la forme et la taille de chaque pointe) et le style (le type composé, le tiret, le bout). `create(ctx)` rend
// les menus et ce qui les coche d'après le cadre sélectionné ; `ctx` : { ed, api, looksOf, applyLook, lineSelected } (js/free-frame-toolbar.js), `ctx.api` ce que js/free-frame.js lui donne (selectedFrame, patch...).
// Les corps viennent de wireToolbar de js/free-frame.js, copiés tels quels.
const FrameLineMenus = (function () {
  const WIDTHS = [0.5, 1, 1.5, 2, 3, 4.5, 6];

  function create(ctx) {
    const { applyLook, ed, lineSelected, looksOf } = ctx;
    const { SHAPE_LOOK, isLineAttrs, lookRefused, normalized, numberText, patch, selectedFrame } = ctx.api;

    const widthRows = [0].concat(WIDTHS).map(n => '<button type="button" role="menuitemradio" data-action="width:' + n + '"><span class="pp-ff-width-sample" style="--w:' + n + 'pt"></span><span>'
      + (n ? I18n.t('frame.widthValue', { n: numberText(n) }) : I18n.t('frame.widthNone')) + '</span></button>').join('');
    const widthMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-width-menu', widthRows, (action) => {
      if (action.indexOf('width:') !== 0) return;
      const lw = Number(action.slice(6));
      applyLook(a => (lw ? { lw, line: a.line || SHAPE_LOOK.line } : { lw }));
    });
    widthMenu.el.setAttribute('role', 'menu');
    widthMenu.el.setAttribute('aria-label', I18n.t('frame.lineWidth'));
    // Les extrémités d'une ligne. En haut, QUELS bouts portent une pointe (aucun, la fin, le début, les deux : le triangle plein pour un bout qui n'en avait pas, la forme et la taille d'une pointe déjà posée sont
    // gardées) ; dessous, une section par bout, « Début » puis « Fin » : la FORME de sa pointe (aucune, triangle plein, flèche ouverte, flèche à encoche, losange, ovale) et sa TAILLE (la largeur en rangées, la longueur
    // en colonnes : petite, moyenne, grande). Chaque échantillon est dessiné par ShapeGeometry.lineParts : la pointe du menu est celle du document. Une forme ou une taille choisie est UN pas d'historique et laisse
    // le menu ouvert, pour régler l'autre sans le rouvrir ; la taille d'un bout sans pointe est grisée, avec sa raison en info-bulle, jamais retirée.
    const ENDS = [
      { action: 'ends:none', icon: 'lineEndsNone', key: 'frame.endsNone', head: false, tail: false },
      { action: 'ends:end', icon: 'lineEndsEnd', key: 'frame.endsEnd', head: false, tail: true },
      { action: 'ends:start', icon: 'lineEndsStart', key: 'frame.endsStart', head: true, tail: false },
      { action: 'ends:both', icon: 'lineEndsBoth', key: 'frame.endsBoth', head: true, tail: true },
    ];
    const END_SIDES = [['head', 'frame.endsHead'], ['tail', 'frame.endsTail']];
    const END_NONE = 'none';
    const TYPE_SAMPLE = { w: 24, h: 18, pad: 5, lw: 2.5 };   // en points (32 x 24 px) : le trait et sa pointe, de la pointe du début à gauche, de la fin à droite
    const SIZE_SAMPLE = { w: 22.5, h: 15, pad: 5, lw: 2 };   // 30 x 20 px
    const sampleNumber = n => String(Math.round(n * 100) / 100);
    const endSample = (side, type, wide, long, spec) => {
      const parts = ShapeGeometry.lineParts(spec.w - 2 * spec.pad, 0, { flip: '', lw: spec.lw, head: side === 'head' ? type : '', tail: side === 'tail' ? type : '', [side + 'W']: wide, [side + 'Len']: long });
      const at = p => sampleNumber(p[0] + spec.pad) + ' ' + sampleNumber(p[1] + spec.h / 2);
      const body = parts.bands.map(band => '<path d="M' + at(band.from) + 'L' + at(band.to) + '" fill="none" stroke="currentColor" stroke-width="' + sampleNumber(band.width) + '"/>').join('');
      const heads = parts.heads.map(points => '<path d="M' + points.map(at).join('L') + 'Z" fill="currentColor"/>').join('');
      return '<svg viewBox="0 0 ' + spec.w + ' ' + spec.h + '" width="' + sampleNumber(spec.w * 4 / 3) + '" height="' + sampleNumber(spec.h * 4 / 3) + '" aria-hidden="true" focusable="false">' + body + heads + '</svg>';
    };
    const endTypeRow = (side, type) => {
      const name = I18n.t(type === END_NONE ? 'frame.endsNone' : 'frame.endType.' + type);
      return '<button type="button" role="menuitemradio" data-action="end:' + side + ':type:' + type + '" title="' + name + '" aria-label="' + name + '">'
        + endSample(side, type === END_NONE ? '' : type, '', '', TYPE_SAMPLE) + '</button>';
    };
    const endSizeRow = (side, wide, long) => {
      const name = I18n.t('frame.endSize', { width: I18n.t('frame.endWidths.' + wide), length: I18n.t('frame.endLengths.' + long) });
      return '<button type="button" role="menuitemradio" data-action="end:' + side + ':size:' + wide + ':' + long + '" title="' + name + '" aria-label="' + name + '"></button>';
    };
    const endsMenuHtml = '<div class="pp-ff-ends-presets" role="group" aria-label="' + I18n.t('frame.endsPresets') + '">'
      + ENDS.map(row => '<button type="button" role="menuitemradio" data-action="' + row.action + '" title="' + I18n.t(row.key) + '" aria-label="' + I18n.t(row.key) + '">' + Icons.svg(row.icon) + '</button>').join('') + '</div>'
      + END_SIDES.map(([side, key]) => '<div class="pp-ff-end" role="group" aria-label="' + I18n.t(key) + '"><div class="pp-ff-end-title" aria-hidden="true">' + I18n.t(key) + '</div><div class="pp-ff-end-body">'
        + '<div class="pp-ff-end-types" role="group" aria-label="' + I18n.t('frame.endTypes') + '">' + [END_NONE].concat(ShapeGeometry.END_TYPES).map(type => endTypeRow(side, type)).join('') + '</div>'
        + '<div class="pp-ff-end-sizes" role="group" aria-label="' + I18n.t('frame.endSizes') + '">'
        + ShapeGeometry.END_SIZES.map(wide => ShapeGeometry.END_SIZES.map(long => endSizeRow(side, wide, long)).join('')).join('') + '</div></div></div>').join('');
    const endsMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-ends-menu', endsMenuHtml, (action) => {
      const preset = ENDS.find(r => r.action === action);
      if (preset) {
        applyLook(a => ({ head: preset.head ? a.head || ShapeGeometry.endOf('triangle') : '', tail: preset.tail ? a.tail || ShapeGeometry.endOf('triangle') : '' }));
        return;
      }
      const [prefix, side, kind, first, second] = action.split(':');
      const found = prefix === 'end' && (side === 'head' || side === 'tail') ? selectedFrame(ed.state.selection) : null;
      if (!found) return;
      if (kind === 'type') patch(ed, found.pos, { [side]: first === END_NONE ? '' : first }, true);
      else if (kind === 'size' && normalized(found.node.attrs)[side]) patch(ed, found.pos, { [side + 'W']: first === 'med' ? '' : first, [side + 'Len']: second === 'med' ? '' : second }, true);
      markEnds();
    });
    endsMenu.el.setAttribute('role', 'menu');
    endsMenu.el.setAttribute('aria-label', I18n.t('frame.ends'));
    endsMenu.el.querySelectorAll('svg').forEach((svg) => { svg.setAttribute('aria-hidden', 'true'); });
    // Le STYLE du trait, dans l'ordre de PowerPoint : le type composé (simple, double, fin puis épais, épais puis fin, triple), le tiret (plein, pointillés, tirets, tirets et points...) en grille d'échantillons
    // dont le nom est l'info-bulle, puis le bout (plat, rond, carré). Choisir un tiret ou un type composé pour un objet sans trait lui donne le trait d'une forme neuve (un choix doit se voir) ; le bout ne
    // se voit que sur une ligne ou un trait en tirets : grisé sinon, avec sa raison, jamais retiré.
    const dashSample = (dash) => {
      const array = ShapeGeometry.dashArray(dash, 2, '');
      return '<svg viewBox="0 0 56 10" width="56" height="10" aria-hidden="true" focusable="false"><path d="M1 5H55" fill="none" stroke="currentColor" stroke-width="2"'
        + (array ? ' stroke-dasharray="' + array.join(' ') + '"' : '') + '/></svg>';
    };
    const capSample = cap => '<svg viewBox="0 0 34 12" width="34" height="12" aria-hidden="true" focusable="false"><path d="M8 6H26" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="' + (cap || 'butt') + '"/></svg>';
    // Un type composé en échantillon : ses bandes, dessinées dans la proportion de ShapeGeometry.compoundBands (12 unités d'épaisseur : chaque bande tombe sur un nombre entier).
    const cmpdSample = (cmpd) => {
      const bands = ShapeGeometry.compoundBands(cmpd, 12) || [{ center: 6, width: 12 }];
      return '<svg viewBox="0 0 28 12" width="28" height="12" aria-hidden="true" focusable="false" shape-rendering="crispEdges">'
        + bands.map(band => '<rect x="0" y="' + (band.center - band.width / 2) + '" width="28" height="' + band.width + '" fill="currentColor"/>').join('') + '</svg>';
    };
    const CMPDS = [''].concat(ShapeGeometry.COMPOUNDS);
    const DASH_CUSTOM = 'custom';
    const CAPS = [['', 'frame.capFlat'], ['round', 'frame.capRound'], ['square', 'frame.capSquare']];
    const dashRow = (name, key, extra) => '<button type="button" role="menuitemradio" data-action="dash:' + name + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key) + '"' + (extra || '') + '>'
      + (name === DASH_CUSTOM ? '' : dashSample(name)) + '</button>';
    const cmpdRow = name => '<button type="button" role="menuitemradio" data-action="cmpd:' + name + '" title="' + I18n.t('frame.cmpds.' + (name || 'sng')) + '" aria-label="' + I18n.t('frame.cmpds.' + (name || 'sng')) + '">'
      + cmpdSample(name) + '</button>';
    const dashMenuHtml = '<div class="pp-ff-cmpd-row" role="group" aria-label="' + I18n.t('frame.cmpd') + '">' + CMPDS.map(cmpdRow).join('') + '</div>'
      + '<div class="pp-ff-dash-grid" role="group" aria-label="' + I18n.t('frame.dash') + '">'
      + [''].concat(ShapeGeometry.DASHES).map(name => dashRow(name, 'frame.dashes.' + (name || 'solid'))).join('') + dashRow(DASH_CUSTOM, 'frame.dashes.custom', ' style="display:none"') + '</div>'
      + '<div class="pp-ff-cap-row" role="group" aria-label="' + I18n.t('frame.cap') + '">'
      + CAPS.map(([cap, key]) => '<button type="button" role="menuitemradio" data-action="cap:' + cap + '" title="' + I18n.t(key) + '" aria-label="' + I18n.t(key) + '">' + capSample(cap) + '</button>').join('') + '</div>';
    const capShows = a => !!a && (isLineAttrs(a) || !!a.dash);
    // Ce qu'un choix du menu change à l'aspect `a` du cadre ; null pour un choix qui ne change rien (la ligne du tiret d'un fichier, qu'aucun clic ne pose).
    const lookChange = (action, a) => {
      if (action.indexOf('dash:') === 0) {
        const dash = action.slice(5);
        if (dash === DASH_CUSTOM) return null;
        // Un trait plein rend le bout sans effet sur une forme (aucun bout à voir sur un contour fermé) : il s'en va avec le tiret ; une ligne garde le sien.
        return dash ? { dash, line: a.line || SHAPE_LOOK.line, lw: a.lw || SHAPE_LOOK.lw } : (isLineAttrs(a) ? { dash: '' } : { dash: '', cap: '' });
      }
      if (action.indexOf('cmpd:') === 0) {
        const cmpd = action.slice(5);
        return cmpd ? { cmpd, line: a.line || SHAPE_LOOK.line, lw: a.lw || SHAPE_LOOK.lw } : { cmpd: '' };
      }
      return action.indexOf('cap:') === 0 ? { cap: action.slice(4) } : null;
    };
    const dashMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-dash-menu', dashMenuHtml, (action) => {
      if (action.indexOf('cap:') === 0 && !capShows(looksOf())) return;
      const found = selectedFrame(ed.state.selection);
      const change = found ? lookChange(action, normalized(found.node.attrs)) : null;
      if (!change) { EditorCore.closeDropdownPanel(); return; }
      applyLook(change);
    });
    dashMenu.el.setAttribute('role', 'menu');
    dashMenu.el.setAttribute('aria-label', I18n.t('frame.dash'));
    const markWidth = () => {
      const a = looksOf();
      const now = a && a.line ? a.lw : 0;
      widthMenu.el.querySelectorAll('[data-action]').forEach((row) => {
        const n = Number(row.dataset.action.slice(6));
        const on = n === now;
        row.style.display = n === 0 && lineSelected() ? 'none' : '';
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    };
    const markDash = () => {
      const a = looksOf();
      const named = !a || !a.dash || ShapeGeometry.DASHES.indexOf(a.dash) >= 0;
      dashMenu.el.querySelectorAll('[data-action^="dash:"]').forEach((row) => {
        const name = row.dataset.action.slice(5);
        const custom = name === DASH_CUSTOM;
        if (custom) {
          row.style.display = named ? 'none' : '';
          if (!named) Dom.setMarkup(row, dashSample(a.dash));
        }
        const on = !!a && (custom ? !named : name === a.dash);
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      dashMenu.el.querySelectorAll('[data-action^="cmpd:"]').forEach((row) => {
        const on = !!a && row.dataset.action.slice(5) === a.cmpd;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      // Un choix que le dessin de la forme ne supporterait pas (trop détaillée pour la Lecture) reste là, grisé avec sa raison, jamais retiré.
      dashMenu.el.querySelectorAll('[data-action^="dash:"], [data-action^="cmpd:"]').forEach((row) => {
        const change = a ? lookChange(row.dataset.action, a) : null;
        const blocked = !!change && lookRefused(a, change);
        row.disabled = blocked;
        row.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        if (blocked) row.title = I18n.t('frame.artTooDetailed');
        else row.title = row.getAttribute('aria-label') || '';
      });
      const shows = capShows(a);
      dashMenu.el.querySelectorAll('[data-action^="cap:"]').forEach((row) => {
        const cap = row.dataset.action.slice(4);
        const on = !!a && cap === a.cap;
        row.classList.toggle('is-active', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
        row.setAttribute('aria-disabled', shows ? 'false' : 'true');
        row.disabled = !shows;
        row.title = shows ? I18n.t(CAPS.find(pair => pair[0] === cap)[1]) : I18n.t('frame.capNoEffect');
      });
    };
    const markRow = (row, on) => {
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-checked', on ? 'true' : 'false');
    };
    // Les choix du menu des extrémités d'après la ligne sélectionnée : les bouts qui portent une pointe, la forme et la taille de chacune ; les tailles s'y dessinent avec la forme du bout (le triangle sans pointe),
    // et se grisent sans pointe.
    const markEnds = () => {
      const a = looksOf();
      endsMenu.el.querySelectorAll('[data-action^="ends:"]').forEach((row) => {
        const spec = ENDS.find(r => r.action === row.dataset.action);
        markRow(row, !!a && spec.head === !!a.head && spec.tail === !!a.tail);
      });
      END_SIDES.forEach(([side]) => {
        const type = a ? a[side] : '';
        endsMenu.el.querySelectorAll('[data-action^="end:' + side + ':type:"]').forEach(row => markRow(row, !!a && row.dataset.action.split(':')[3] === (type || END_NONE)));
        endsMenu.el.querySelectorAll('[data-action^="end:' + side + ':size:"]').forEach((row) => {
          const [, , , wide, long] = row.dataset.action.split(':');
          const drawn = type || ShapeGeometry.endOf('triangle');
          if (row.dataset.drawn !== drawn) {
            row.dataset.drawn = drawn;
            Dom.setMarkup(row, endSample(side, drawn, wide === 'med' ? '' : wide, long === 'med' ? '' : long, SIZE_SAMPLE));
          }
          markRow(row, !!type && wide === (a[side + 'W'] || 'med') && long === (a[side + 'Len'] || 'med'));
          row.disabled = !type;
          row.setAttribute('aria-disabled', type ? 'false' : 'true');
          row.title = type ? row.getAttribute('aria-label') : I18n.t('frame.endSizeNoEnd');
        });
      });
    };

    return { dashMenu, endsMenu, markDash, markEnds, markWidth, widthMenu };
  }

  return { create };
})();
