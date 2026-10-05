// Suite "twoColumns" - insertion, formatage dans chaque colonne, poignée de
// redimensionnement (glisser réel).
(function () {
  const cases = [];

  cases.push({
    id: 'twocol_insert_basic',
    description: 'Insertion d\'une zone 2-colonnes (exactement 2 colonnes)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      const html = Editor.getHTML();
      return { pass: html.includes('two-columns') && cols.length === 2, notes: 'cols=' + cols.length + ' html=' + html };
    },
  });

  cases.push({
    id: 'twocol_independent_content',
    description: 'Chaque colonne garde un contenu indépendant',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      await h.focusInElement(cols[0].querySelector('p') || cols[0]);
      await h.typeText('Colonne gauche');
      await h.focusInElement(cols[1].querySelector('p') || cols[1]);
      await h.typeText('Colonne droite');
      const html = Editor.getHTML();
      return { pass: html.includes('Colonne gauche') && html.includes('Colonne droite'), notes: html };
    },
  });

  cases.push({
    id: 'twocol_formatting_per_column',
    description: 'Aligner à droite le texte d\'UNE SEULE colonne ne touche pas l\'autre',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      const pLeft = cols[0].querySelector('p');
      const pRight = cols[1].querySelector('p');
      await h.focusInElement(pLeft);
      await h.typeText('Gauche');
      await h.focusInElement(pRight);
      await h.typeText('Droite');
      await h.selectAllInElement(pRight);
      await h.clickButton('v2-btn-align-right');
      const html = Editor.getHTML();
      const rightAligned = /Droite[\s\S]{0,5}<\/p>/.test(html) && /text-align:\s*right[^>]*>Droite/.test(html);
      const leftUntouched = !/text-align:\s*right[^>]*>Gauche/.test(html);
      return { pass: rightAligned && leftUntouched, notes: html };
    },
  });

  cases.push({
    id: 'twocol_resize_grip',
    description: 'Glisser la poignée de redimensionnement change la largeur relative des colonnes',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const grip = h.tiptap().querySelector('.two-columns-resize-grip');
      if (!grip) return { pass: false, notes: 'poignée de redimensionnement introuvable - html=' + Editor.getHTML() };
      const before = Editor.getHTML();
      const beforeMatch = /--layout-left:\s*([\d.]+)%/.exec(before);
      const rect = grip.getBoundingClientRect();
      await h.dragFromTo(grip, [rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + 100, rect.top]);
      const after = Editor.getHTML();
      const afterMatch = /--layout-left:\s*([\d.]+)%/.exec(after);
      const beforeVal = beforeMatch ? beforeMatch[1] : '50';
      const afterVal = afterMatch ? afterMatch[1] : '50';
      return { pass: beforeVal !== afterVal, notes: JSON.stringify({ beforeVal, afterVal, before, after }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------
  // La vue d'une zone 2 colonnes (js/editor-nodes.js, NodeView de twoColumnsZone) : le DOM qu'elle construit, la poignée qu'on glisse, le popover du
  // bouton « mm », la mise à jour du nœud et la destruction de la vue. Ces scénarios ont été écrits sur l'ancien code, une seule fonction de 228
  // lignes, avant son découpage : ils fixent ce que la vue fait, ni plus ni moins. Les événements sont envoyés à la main (même schéma que
  // h.dragFromTo) pour pouvoir s'arrêter entre deux étapes d'un glisser.
  const zoneHtml = style => '<p>Avant</p><div class="two-columns-zone" style="' + style + '">'
    + '<div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>';
  const IN_PERCENT = '--layout-left: 50%';
  const IN_MM = '--layout-left: 60mm; --layout-left-mm: 60mm';
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const clampPct = v => Math.max(20, Math.min(80, v));
  const mouse = (type, x, y) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  const liveLeft = wrap => wrap.style.getPropertyValue('--layout-left');
  // Deux objets plats égaux, quel que soit l'ordre de leurs clés.
  const same = (a, b) => { const keys = Object.keys(Object.assign({}, a, b)).sort(); return JSON.stringify(a, keys) === JSON.stringify(b, keys); };

  async function zoneSetup(h, style) {
    await h.resetEditor();
    Editor.setHTML(zoneHtml(style));
    await h.sleep(150);
    return h.tiptap().querySelector('.two-columns-zone-outer');
  }
  function zoneNode() {
    let found = null;
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (!found && node.type.name === 'twoColumnsZone') found = { node, pos }; });
    return found;
  }
  function zoneAttrs() {
    const zone = zoneNode();
    return zone ? { layoutLeft: zone.node.attrs.layoutLeft, layoutLeftMm: zone.node.attrs.layoutLeftMm } : null;
  }
  function setZoneAttrs(patch) {
    const ed = EditorCore.getEditor();
    const zone = zoneNode();
    ed.view.dispatch(ed.state.tr.setNodeMarkup(zone.pos, undefined, Object.assign({}, zone.node.attrs, patch)));
  }
  // Appuie sur la poignée sans la relâcher. Rend le cadre mesuré, si le mousedown a été annulé (preventDefault) et s'il est remonté jusqu'au <body>.
  function gripDown(wrap) {
    const grip = wrap.querySelector('.two-columns-resize-grip');
    const rect = wrap.getBoundingClientRect();
    const reached = [];
    const spy = event => reached.push(event.type);
    document.body.addEventListener('mousedown', spy);
    const notPrevented = grip.dispatchEvent(mouse('mousedown', rect.left + rect.width / 2, rect.top + 4));
    document.body.removeEventListener('mousedown', spy);
    return { rect, prevented: !notPrevented, reachedBody: reached.length > 0 };
  }
  // Un mousemove ou un mouseup à la fraction `fraction` de la largeur du cadre. Rend le pourcentage (borné) que la souris désigne : le navigateur
  // arrondit clientX au pixel, la valeur attendue se lit donc sur l'événement envoyé, pas sur la fraction demandée.
  function pointer(type, rect, fraction) {
    const event = mouse(type, rect.left + rect.width * fraction, rect.top + 4);
    document.dispatchEvent(event);
    return clampPct(((event.clientX - rect.left) / rect.width) * 100);
  }

  // Les ajouts et retraits d'écouteurs de souris sur `document` pendant `action`, avec la fonction et la phase (capture ou non).
  async function documentListeners(action) {
    const log = [];
    const add = document.addEventListener;
    const remove = document.removeEventListener;
    const watched = type => type === 'mousemove' || type === 'mouseup' || type === 'mousedown';
    const capture = opts => opts === true || !!(opts && opts.capture);
    document.addEventListener = function (type, fn, opts) { if (watched(type)) log.push({ op: 'add', type, fn, capture: capture(opts) }); return add.apply(this, arguments); };
    document.removeEventListener = function (type, fn, opts) { if (watched(type)) log.push({ op: 'remove', type, fn, capture: capture(opts) }); return remove.apply(this, arguments); };
    try { await action(log); } finally { document.addEventListener = add; document.removeEventListener = remove; }
    return log;
  }
  // Les écouteurs ajoutés et jamais retirés avec la même fonction et la même phase : un retrait ne défait que l'ajout qui le précède.
  const leaked = (log, type) => {
    const live = [];
    log.forEach(e => {
      if (e.type !== type) return;
      const at = live.findIndex(l => l.fn === e.fn && l.capture === e.capture);
      if (e.op === 'add') { if (at === -1) live.push(e); } else if (at !== -1) live.splice(at, 1);
    });
    return live.length;
  };

  cases.push({
    id: 'twocol_view_builds_its_dom',
    description: 'La vue de la zone : le cadre, les deux colonnes, la poignée puis le bouton « mm », et la largeur posée sur le cadre',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_PERCENT);
      const kids = Array.from(wrap.children);
      const grip = wrap.querySelector('.two-columns-resize-grip');
      const button = wrap.querySelector('.two-columns-mm-button');
      const seen = {
        frame: wrap.classList.contains('two-columns-zone-outer') && wrap.tagName === 'DIV',
        order: kids.map(k => k.classList[0]).join(' '),
        columns: wrap.querySelectorAll(':scope > .two-columns-zone > .two-columns-column').length,
        gripTitle: grip.title === I18n.t('twoColumns.resizeGrip') && grip.title !== '',
        buttonTitle: button.title === I18n.t('twoColumns.widthMmButton') && button.title !== '',
        button: button.tagName + ' ' + button.type + ' ' + button.textContent,
        percent: liveLeft(wrap),
        noPopover: !wrap.querySelector('.two-columns-mm-popover'),
      };
      Editor.setHTML(zoneHtml('--layout-left: 37%'));
      await h.sleep(150);
      seen.thirtySeven = liveLeft(h.tiptap().querySelector('.two-columns-zone-outer'));
      seen.millimetres = liveLeft(await zoneSetup(h, IN_MM));
      const expected = { frame: true, order: 'two-columns-zone two-columns-resize-grip two-columns-mm-button', columns: 2, gripTitle: true, buttonTitle: true,
        button: 'BUTTON button mm', percent: '50%', noPopover: true, thirtySeven: '37%', millimetres: '60mm' };
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'twocol_view_grip_drag_in_percent',
    description: 'La poignée suit la souris en pourcentage (bornes 20 et 80, valeur vivante non arrondie), écrit l\'arrondi au relâchement et se détache',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_PERCENT);
      // Un simple clic, sans bouger : la largeur ne change pas.
      const click = gripDown(wrap);
      pointer('mouseup', click.rect, 0.5);
      await h.sleep(100);
      const afterClick = zoneAttrs();
      // Un glisser : la valeur vivante est bornée mais pas arrondie ; deux relâchements, l'un dont l'arrondi monte, l'autre dont il descend.
      const down = gripDown(wrap);
      const live = [];
      const wanted = [];
      for (const f of [0.3724, 0.95, 0.02, 0.6283]) { wanted.push(pointer('mousemove', down.rect, f)); live.push(parseFloat(liveLeft(wrap))); }
      const finalPct = wanted[3];
      pointer('mouseup', down.rect, 0.6283);
      await h.sleep(100);
      const afterDrag = zoneAttrs();
      const settled = liveLeft(wrap);
      // Détachée : un mousemove après le relâchement ne bouge plus rien.
      pointer('mousemove', down.rect, 0.9);
      const afterDetach = liveLeft(wrap);
      const html = Editor.getHTML();
      const second = gripDown(wrap);
      const lowPct = pointer('mousemove', second.rect, 0.3724);
      pointer('mouseup', second.rect, 0.3724);
      await h.sleep(100);
      const afterSecond = zoneAttrs();
      const seen = {
        afterClick: afterClick.layoutLeft + ' ' + afterClick.layoutLeftMm,
        prevented: down.prevented, reachedBody: down.reachedBody,
        liveOk: live.every((v, i) => near(v, wanted[i], 1e-9)) && live[1] === 80 && live[2] === 20,
        afterDrag: afterDrag.layoutLeft + ' ' + afterDrag.layoutLeftMm, settled: settled, afterDetach: afterDetach,
        html: new RegExp('--layout-left:\\s*' + Math.round(finalPct) + '%').test(html) && !/--layout-left-mm/.test(html),
        afterSecond: afterSecond.layoutLeft + ' ' + afterSecond.layoutLeftMm,
        sameFrame: h.tiptap().querySelector('.two-columns-zone-outer') === wrap,
        roundsUp: Math.round(finalPct) !== Math.floor(finalPct), roundsDown: Math.round(lowPct) !== Math.ceil(lowPct),
      };
      const expected = {
        afterClick: '50 null', prevented: true, reachedBody: false, liveOk: true,
        afterDrag: Math.round(finalPct) + ' null', settled: Math.round(finalPct) + '%', afterDetach: Math.round(finalPct) + '%', html: true,
        afterSecond: Math.round(lowPct) + ' null', sameFrame: true, roundsUp: true, roundsDown: true,
      };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, expected, live, wanted, lowPct }) };
    },
  });

  cases.push({
    id: 'twocol_view_grip_click_keeps_the_width_within_the_bounds',
    description: 'Un clic sur la poignée, sans bouger, ramène une largeur de colonne hors des bornes 20-80 % à la borne la plus proche',
    run: async (h) => {
      const seen = {};
      for (const [name, start] of [['high', 90], ['low', 8], ['inside', 35]]) {
        const wrap = await zoneSetup(h, '--layout-left: ' + start + '%');
        const press = gripDown(wrap);
        pointer('mouseup', press.rect, 0.5);
        await h.sleep(100);
        const a = zoneAttrs();
        seen[name] = a.layoutLeft + ' ' + a.layoutLeftMm;
      }
      const expected = { high: '80 null', low: '20 null', inside: '35 null' };
      return { pass: same(seen, expected), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'twocol_view_grip_drag_keeps_millimetres',
    description: 'En mode mm, la poignée reste en mm : le pourcentage non arrondi de la souris est reconverti en mm, le pourcentage arrondi suit',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_MM);
      const contentMm = PageLayout.getContentWidthMm();
      const down = gripDown(wrap);
      // Une fraction dont la conversion en mm n'est pas la même depuis le pourcentage arrondi : le scénario distingue ainsi l'un de l'autre.
      let fraction = 0.6;
      const mmFrom = f => { const px = Math.trunc(down.rect.left + down.rect.width * f); const p = clampPct(((px - down.rect.left) / down.rect.width) * 100); return [Math.round(p / 100 * contentMm), Math.round(Math.round(p) / 100 * contentMm)]; };
      while (fraction < 0.79 && mmFrom(fraction)[0] === mmFrom(fraction)[1]) fraction += 0.0007;
      const pct = pointer('mousemove', down.rect, fraction);
      const live = parseFloat(liveLeft(wrap));
      pointer('mouseup', down.rect, fraction);
      await h.sleep(100);
      const expectedMm = Math.round(pct / 100 * contentMm);
      const attrs = zoneAttrs();
      const html = Editor.getHTML();
      const seen = {
        distinct: mmFrom(fraction)[0] !== mmFrom(fraction)[1],
        live: near(live, pct, 1e-9),
        layoutLeft: attrs.layoutLeft === Math.round(pct),
        layoutLeftMm: attrs.layoutLeftMm === expectedMm,
        html: html.includes('--layout-left: ' + expectedMm + 'mm') && html.includes('--layout-left-mm: ' + expectedMm + 'mm'),
        settled: liveLeft(wrap) === expectedMm + 'mm',
      };
      const expected = { distinct: true, live: true, layoutLeft: true, layoutLeftMm: true, html: true, settled: true };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, attrs, expectedMm, pct, fraction }) };
    },
  });

  cases.push({
    id: 'twocol_view_grip_click_leaves_a_millimetre_width_alone',
    description: 'En mode mm, un clic sur la poignée sans la bouger ne change rien (60 mm ne deviennent pas 114 mm), même hors des bornes 20-80 % ; un clic après un glisser garde la largeur du glisser',
    run: async (h) => {
      // Un clic sans mouvement : --layout-left du cadre porte une longueur (« 60mm »), que la poignée lisait comme « 60 % » avant d'écrire 114 mm.
      const seen = {};
      const expected = {};
      for (const mm of [60, 30, 12, 170]) {
        const wrap = await zoneSetup(h, '--layout-left: ' + mm + 'mm; --layout-left-mm: ' + mm + 'mm');
        const html = Editor.getHTML();
        const start = zoneAttrs();
        const press = gripDown(wrap);
        pointer('mouseup', press.rect, 0.5);
        await h.sleep(100);
        const a = zoneAttrs();
        seen['mm' + mm] = [a.layoutLeft, a.layoutLeftMm, liveLeft(wrap), Editor.getHTML() === html].join(' ');
        expected['mm' + mm] = [start.layoutLeft, mm, mm + 'mm', true].join(' ');
      }
      // Un glisser puis un clic : l'appui suivant ne garde rien du mouvement du premier.
      const wrap = await zoneSetup(h, IN_MM);
      const down = gripDown(wrap);
      pointer('mousemove', down.rect, 0.3);
      pointer('mouseup', down.rect, 0.3);
      await h.sleep(100);
      const dragged = zoneAttrs();
      const draggedLive = liveLeft(wrap);
      const press = gripDown(wrap);
      pointer('mouseup', press.rect, 0.5);
      await h.sleep(100);
      const clicked = zoneAttrs();
      seen.afterDrag = [dragged.layoutLeftMm !== 60, clicked.layoutLeft === dragged.layoutLeft, clicked.layoutLeftMm === dragged.layoutLeftMm, liveLeft(wrap) === draggedLive].join(' ');
      expected.afterDrag = 'true true true true';
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, expected, dragged, clicked }) };
    },
  });

  cases.push({
    id: 'twocol_view_update_waits_for_the_drag',
    description: 'Une mise à jour du nœud pendant un glisser ne touche pas la largeur vivante ; au repos elle s\'applique tout de suite, en % comme en mm',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_PERCENT);
      const down = gripDown(wrap);
      const pct = pointer('mousemove', down.rect, 0.3);
      const dragged = liveLeft(wrap);
      setZoneAttrs({ layoutLeft: 66 });
      await h.sleep(80);
      const duringExternal = liveLeft(wrap);
      const sameDuring = h.tiptap().querySelector('.two-columns-zone-outer') === wrap;
      pointer('mouseup', down.rect, 0.3);
      await h.sleep(100);
      const afterDrag = zoneAttrs();
      setZoneAttrs({ layoutLeft: 33 });
      await h.sleep(80);
      const idle = liveLeft(wrap);
      setZoneAttrs({ layoutLeftMm: 45 });
      await h.sleep(80);
      const idleMm = liveLeft(wrap);
      setZoneAttrs({ layoutLeftMm: null, layoutLeft: 41 });
      await h.sleep(80);
      const backToPercent = liveLeft(wrap);
      const seen = {
        dragged: near(parseFloat(dragged), pct, 1e-9), duringExternal: duringExternal === dragged, sameDuring,
        afterDrag: afterDrag.layoutLeft + ' ' + afterDrag.layoutLeftMm, idle, idleMm, backToPercent,
        sameFrame: h.tiptap().querySelector('.two-columns-zone-outer') === wrap,
      };
      const expected = { dragged: true, duringExternal: true, sameDuring: true, afterDrag: Math.round(pct) + ' null', idle: '33%', idleMm: '45mm', backToPercent: '41%', sameFrame: true };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, expected, dragged, duringExternal }) };
    },
  });

  cases.push({
    id: 'twocol_view_destroyed_during_a_drag',
    description: 'La vue détruite en plein glisser retire son écouteur de mouvement, et le relâchement qui suit n\'écrit rien et ne lève rien',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_PERCENT);
      const errors = [];
      const onError = event => errors.push(event.message);
      window.addEventListener('error', onError);
      let log = [];
      let leakedAtDestroy = -1;
      try {
        log = await documentListeners(async (inner) => {
          const down = gripDown(wrap);
          pointer('mousemove', down.rect, 0.3);
          Editor.setHTML('<p>Apres</p>');
          await h.sleep(150);
          leakedAtDestroy = leaked(inner.slice(), 'mousemove');
          pointer('mouseup', down.rect, 0.3);
          await h.sleep(100);
        });
      } finally { window.removeEventListener('error', onError); }
      const seen = {
        movesAdded: log.filter(e => e.op === 'add' && e.type === 'mousemove').length,
        movesLeakedAtDestroy: leakedAtDestroy,
        movesLeaked: leaked(log, 'mousemove'),
        errors: errors.length,
        noZone: !zoneNode() && !h.tiptap().querySelector('.two-columns-zone-outer'),
        html: Editor.getHTML(),
      };
      const expected = { movesAdded: 1, movesLeakedAtDestroy: 0, movesLeaked: 0, errors: 0, noZone: true, html: '<p>Apres</p>' };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, errors }) };
    },
  });

  cases.push({
    id: 'twocol_view_ignores_style_mutations',
    description: 'Une mutation de style du cadre, hors transaction, ne fait pas recréer la vue (le glisser en dépend)',
    run: async (h) => {
      const wrap = await zoneSetup(h, IN_PERCENT);
      wrap.style.setProperty('--layout-left', '71%');
      wrap.setAttribute('data-test-mutation', '1');
      await h.sleep(150);
      const same = h.tiptap().querySelector('.two-columns-zone-outer') === wrap && wrap.isConnected;
      return { pass: same && liveLeft(wrap) === '71%', notes: 'même cadre=' + same + ' largeur=' + liveLeft(wrap) };
    },
  });

  // Ouvre le popover du bouton « mm » et rend ses parties.
  async function openPopover(h) {
    h.tiptap().querySelector('.two-columns-mm-button').click();
    await h.sleep(40);
    const popover = document.querySelector('.two-columns-mm-popover');
    return popover ? { popover, input: popover.querySelector('input'), right: popover.querySelector('.two-columns-mm-computed') } : null;
  }
  // Tape une valeur dans le champ du popover, comme l'utilisateur (l'événement input met à jour la largeur de droite).
  function typeIn(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const keydown = (input, key) => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  cases.push({
    id: 'twocol_view_popover_shows_the_current_widths',
    description: 'Le popover « mm » s\'ouvre sur la largeur gauche courante (en mm, ou le pourcentage converti), annonce la droite en direct et se referme au second clic',
    run: async (h) => {
      const contentMm = PageLayout.getContentWidthMm();
      const gapMm = PageLayout.getColumnGapMm();
      const wrap = await zoneSetup(h, IN_PERCENT);
      const seen = {};
      let ui = await openPopover(h);
      seen.inPercent = ui ? ui.input.value + ' / ' + ui.right.textContent : 'absent';
      seen.insideFrame = !!ui && ui.popover.parentNode === wrap;
      seen.input = ui ? [ui.input.type, ui.input.min, ui.input.step].join(' ') : '';
      seen.labels = ui ? Array.from(ui.popover.querySelectorAll(':scope > label')).map(l => l.firstChild.nodeValue).join('|') : '';
      seen.focused = !!ui && document.activeElement === ui.input;
      typeIn(ui.input, '100');
      seen.typed = ui.right.textContent;
      typeIn(ui.input, '');
      seen.emptied = ui.right.textContent;
      typeIn(ui.input, '-20');
      seen.negative = ui.right.textContent;
      // Le bouton referme le popover, et la saisie est validée (le retrait du champ lui fait perdre le focus) : -20 est ramené au minimum de 10 mm.
      h.tiptap().querySelector('.two-columns-mm-button').click();
      await h.sleep(40);
      seen.toggledClosed = !document.querySelector('.two-columns-mm-popover');
      ui = await openPopover(h);
      seen.reopened = ui ? ui.input.value : 'absent';
      // Le clic du bouton est annulé (preventDefault) et ne remonte pas (stopPropagation).
      const reached = [];
      const spy = event => reached.push(event.type);
      document.body.addEventListener('click', spy);
      seen.clickPrevented = !h.tiptap().querySelector('.two-columns-mm-button').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      document.body.removeEventListener('click', spy);
      seen.clickReachedBody = reached.length > 0;
      await h.sleep(40);
      await zoneSetup(h, IN_MM);
      ui = await openPopover(h);
      seen.inMm = ui ? ui.input.value + ' / ' + ui.right.textContent : 'absent';
      document.body.dispatchEvent(mouse('mousedown', 3, 3));
      await h.sleep(60);
      const half = Math.round(0.5 * contentMm);
      const expected = {
        inPercent: half + ' / ' + Math.round(contentMm - gapMm - half),
        insideFrame: true, input: 'number 10 1',
        labels: I18n.t('twoColumns.widthMmLeftLabel') + '|' + I18n.t('twoColumns.widthMmRightLabel'),
        focused: true,
        typed: String(Math.round(contentMm - gapMm - 100)), emptied: '—', negative: String(Math.round(contentMm - gapMm + 20)),
        toggledClosed: true, reopened: '10', clickPrevented: true, clickReachedBody: false,
        inMm: '60 / ' + Math.round(contentMm - gapMm - 60),
      };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, expected }) };
    },
  });

  cases.push({
    id: 'twocol_view_popover_commits_cancels_and_clamps',
    description: 'Entrée et la perte de focus valident (bornes 10 mm et largeur utile - gouttière - 10 mm), Échap annule, une saisie vide ne change rien',
    run: async (h) => {
      const contentMm = PageLayout.getContentWidthMm();
      const gapMm = PageLayout.getColumnGapMm();
      await zoneSetup(h, IN_PERCENT);
      const seen = {};
      const step = async (name, run) => {
        const ui = await openPopover(h);
        if (!ui) { seen[name] = 'popover absent'; return; }
        run(ui);
        await h.sleep(80);
        const a = zoneAttrs();
        seen[name] = [a.layoutLeft, a.layoutLeftMm == null ? null : Math.round(a.layoutLeftMm * 1000) / 1000, !document.querySelector('.two-columns-mm-popover')].join(' ');
      };
      await step('enter', ui => { typeIn(ui.input, '70'); seen.enterPrevented = !keydown(ui.input, 'Enter'); });
      await step('tooSmall', ui => { typeIn(ui.input, '5'); keydown(ui.input, 'Enter'); });
      await step('tooBig', ui => { typeIn(ui.input, '5000'); keydown(ui.input, 'Enter'); });
      await step('escape', ui => { seen.openedAfterBig = ui.input.value; typeIn(ui.input, '88'); seen.escapePrevented = !keydown(ui.input, 'Escape'); });
      await step('empty', ui => { typeIn(ui.input, ''); keydown(ui.input, 'Enter'); });
      await step('blur', ui => { typeIn(ui.input, '80'); ui.input.blur(); });
      await step('otherKey', ui => { seen.otherKeyPrevented = !keydown(ui.input, 'a'); typeIn(ui.input, '60'); keydown(ui.input, 'Escape'); });
      const bodyKeys = [];
      const spy = event => bodyKeys.push(event.key);
      document.body.addEventListener('keydown', spy);
      const ui = await openPopover(h);
      keydown(ui.input, 'Enter'); keydown(ui.input, 'x');
      document.body.removeEventListener('keydown', spy);
      await h.sleep(60);
      const maxMm = Math.round((contentMm - gapMm - 10) * 1000) / 1000;
      const pct = mm => Math.round(mm / contentMm * 100);
      const expected = {
        enter: pct(70) + ' 70 true', enterPrevented: true,
        tooSmall: pct(10) + ' 10 true',
        tooBig: pct(contentMm - gapMm - 10) + ' ' + maxMm + ' true',
        escape: pct(contentMm - gapMm - 10) + ' ' + maxMm + ' true', escapePrevented: true, openedAfterBig: String(Math.round(contentMm - gapMm - 10)),
        empty: pct(contentMm - gapMm - 10) + ' ' + maxMm + ' true',
        blur: pct(80) + ' 80 true',
        otherKey: pct(80) + ' 80 true', otherKeyPrevented: false,
      };
      return { pass: same(seen, expected) && bodyKeys.length === 0, notes: JSON.stringify({ seen, expected, bodyKeys }) };
    },
  });

  cases.push({
    id: 'twocol_view_popover_closes_and_cleans_up',
    description: 'Le popover se ferme au clic ailleurs (la saisie est validée), reste ouvert au clic dedans, et la destruction de la vue le retire avec son écouteur',
    run: async (h) => {
      await zoneSetup(h, IN_PERCENT);
      const seen = {};
      const errors = [];
      const onError = event => errors.push(event.message);
      window.addEventListener('error', onError);
      let log = [];
      try { log = await documentListeners(async (inner) => {
        // L'écouteur du clic ailleurs n'est posé qu'au tour suivant (le clic qui ouvre le popover ne doit pas le fermer).
        const before = inner.length;
        h.tiptap().querySelector('.two-columns-mm-button').click();
        seen.listenerDeferred = inner.slice(before).filter(e => e.op === 'add' && e.type === 'mousedown' && e.capture).length === 0;
        await h.sleep(40);
        let ui = { popover: document.querySelector('.two-columns-mm-popover'), input: document.querySelector('.two-columns-mm-popover input') };
        // Un clic dans le popover (sur son étiquette) ou sur le bouton « mm » lui-même : il reste (c'est le clic du bouton qui le bascule).
        ui.popover.querySelector('label').dispatchEvent(mouse('mousedown', 5, 5));
        seen.insideStays = !!document.querySelector('.two-columns-mm-popover');
        h.tiptap().querySelector('.two-columns-mm-button').dispatchEvent(mouse('mousedown', 5, 5));
        seen.buttonStays = !!document.querySelector('.two-columns-mm-popover');
        // Un clic ailleurs : fermé, et la saisie est validée (le retrait du champ lui fait perdre le focus).
        typeIn(ui.input, '70');
        document.body.dispatchEvent(mouse('mousedown', 3, 3));
        await h.sleep(80);
        seen.outsideCloses = !document.querySelector('.two-columns-mm-popover');
        seen.outsideCommits = zoneAttrs().layoutLeftMm === 70;
        // Détruite pendant que le popover est ouvert : il disparaît du document et son écouteur avec lui. D'abord sans que le champ perde le focus
        // (le blur que son retrait déclenche d'ordinaire est étouffé : seule la destruction ferme alors le popover) ...
        Editor.setHTML(zoneHtml(IN_PERCENT));
        await h.sleep(150);
        ui = await openPopover(h);
        ui.input.addEventListener('blur', event => event.stopImmediatePropagation(), true);
        Editor.setHTML('<p>Apres</p>');
        await h.sleep(150);
        seen.quietDestroyRemoves = !document.querySelector('.two-columns-mm-popover');
        seen.captureLeakedAfterQuietDestroy = leaked(inner.filter(e => e.capture), 'mousedown');
        // ... puis avec la perte de focus : la saisie voudrait se valider sur un nœud qui n'existe plus.
        Editor.setHTML(zoneHtml(IN_PERCENT));
        await h.sleep(150);
        ui = await openPopover(h);
        Editor.setHTML('<p>Apres</p>');
        await h.sleep(150);
        seen.destroyRemoves = !document.querySelector('.two-columns-mm-popover');
        seen.captureLeakedAtDestroy = leaked(inner.filter(e => e.capture), 'mousedown');
        document.body.dispatchEvent(mouse('mousedown', 3, 3));
        await h.sleep(40);
      }); } finally { window.removeEventListener('error', onError); }
      seen.captureAdds = log.filter(e => e.op === 'add' && e.type === 'mousedown' && e.capture).length;
      seen.captureLeaked = leaked(log.filter(e => e.capture), 'mousedown');
      seen.errors = errors.length;
      seen.html = Editor.getHTML();
      const expected = { listenerDeferred: true, insideStays: true, buttonStays: true, outsideCloses: true, outsideCommits: true, quietDestroyRemoves: true, captureLeakedAfterQuietDestroy: 0, destroyRemoves: true, captureLeakedAtDestroy: 0,
        captureAdds: 3, captureLeaked: 0, errors: 0, html: '<p>Apres</p>' };
      return { pass: same(seen, expected), notes: JSON.stringify({ seen, errors, log: log.map(e => e.op + ' ' + e.type + (e.capture ? ' capture' : '')) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.twoColumns = cases;
})();
