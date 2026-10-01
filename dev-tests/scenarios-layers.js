// Suite "layers" - ordre d'empilement des couches flottantes (js/layers.js, jetons --z-* de css/style.css). Retour d'Antoine du 2026-10-01 : « quand on est dans un tableau la toolbar tableau reste
// tj affichée, ca c'est ok mais du coup le menu # variable s'ouvre en dessous, il faudrait qu'il soit en dessus, le dernier menu qui s'ouvre doit tj être au-dessus de l'existant ».
// Chaque scénario superpose deux couches et demande au NAVIGATEUR laquelle gagne au centre de leur recouvrement (elementFromPoint), jamais un z-index lu dans une feuille de style, que rien ne dit
// appliqué. La géométrie réelle ne fait pas toujours se toucher les deux couches : le menu testé est donc déplacé à la main sur la barre, ou sur un menu déjà ouvert. La frappe et la souris réelles,
// à 700x400, avec les vraies barres de tableau, d'image et de bulle, sont dans verify-layers-mouse.mjs.
// Deux questions pour chaque menu : passe-t-il au-dessus d'une barre flottante affichée ? Au-dessus d'un menu déjà ouvert - posé APRÈS lui dans la page et remonté AVANT lui, donc qui gagnerait
// à niveau égal - ? La seconde prouve que le menu se remonte lui-même (Layers.raise), la première que son niveau est au-dessus de celui des barres.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const TABLE = 'LyContacts';

  // Le point au centre du recouvrement de deux éléments (null s'ils ne se touchent pas).
  function overlapPoint(a, b) {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const left = Math.max(ra.left, rb.left);
    const right = Math.min(ra.right, rb.right);
    const top = Math.max(ra.top, rb.top);
    const bottom = Math.min(ra.bottom, rb.bottom);
    if (right - left < 4 || bottom - top < 4) return null;
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }
  // true : `upper` est le premier élément atteint au centre de son recouvrement avec `lower` ; false : autre chose y gagne ; null : ils ne se recouvrent pas (mise en place ratée, jamais un succès).
  function isOver(upper, lower) {
    const point = overlapPoint(upper, lower);
    if (!point) return null;
    const hit = document.elementFromPoint(point.x, point.y);
    return !!hit && upper.contains(hit);
  }
  // Pose le coin haut-gauche de `el` (position absolute ou fixed, quel que soit son bloc conteneur) sur le point (x, y) de la fenêtre.
  function moveTo(el, x, y) {
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    const r = el.getBoundingClientRect();
    el.style.left = (x - r.left) + 'px';
    el.style.top = (y - r.top) + 'px';
  }
  // Une barre flottante « de décor », posée à la main sur le coin de `target` : au niveau que lui donne la feuille de style, sans floating-ui (position exacte).
  function toolbarOver(target) {
    const r = target.getBoundingClientRect();
    const bar = document.createElement('div');
    bar.className = 'v2-floating-toolbar visible';
    bar.innerHTML = '<button type="button" tabindex="-1">·</button><button type="button" tabindex="-1">·</button><button type="button" tabindex="-1">·</button>';
    document.body.appendChild(bar);
    moveTo(bar, r.left + 6, r.top + 6);
    return bar;
  }
  // Un menu déjà ouvert : grand, au niveau des menus, ajouté à la page APRÈS tout ce que le test ouvre ensuite, et remonté avant eux.
  function earlierMenu() {
    const menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;z-index:var(--z-menu);left:40px;top:60px;width:560px;height:440px;background:#fff;border:2px solid #c00;box-sizing:border-box;';
    document.body.appendChild(menu);
    Layers.raise(menu);
    return menu;
  }
  function tableBar() {
    const button = document.querySelector('.v2-floating-toolbar.visible button[data-action="table-del"]');
    return button ? button.closest('.v2-floating-toolbar') : null;
  }
  function dropAll(...els) { els.forEach(el => { if (el && el.parentNode) el.parentNode.removeChild(el); }); }

  // Les deux questions pour un menu que `open()` ouvre et rend. `close()` le referme.
  async function menuLayers(open, close) {
    window.scrollTo(0, 0);
    const earlier = earlierMenu();
    let bar = null;
    let menu = null;
    try {
      menu = await open();
      if (!menu) return { pass: false, notes: 'menu non ouvert' };
      moveTo(menu, 120, 120);
      const overEarlier = isOver(menu, earlier);
      bar = toolbarOver(menu);
      const overBar = isOver(menu, bar);
      return { pass: overEarlier === true && overBar === true, notes: JSON.stringify({ overEarlier, overBar, z: getComputedStyle(menu).zIndex, barZ: getComputedStyle(bar).zIndex }) };
    } finally {
      try { if (close) await close(menu); } catch (e) { /* le test a déjà son verdict */ }
      dropAll(earlier, bar);
    }
  }

  async function seedVariables(h) {
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Prenom: 'Text', Ville: 'Text' });
    stub.setRows(TABLE, [{ id: 1, Nom: 'Dupont', Prenom: 'Jean', Ville: 'Lyon' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Dupont', Prenom: 'Jean', Ville: 'Lyon' }, TABLE);
    await h.sleep(50);
  }

  // === 1) Le retour d'Antoine : la liste # dans un tableau ============================================================================================================

  cases.push({
    id: 'layers_hash_menu_opens_above_the_table_toolbar',
    description: 'Dans une cellule de tableau, la barre du tableau reste affichée et la liste # s\'ouvre PAR-DESSUS : aucune ligne de la liste (onglets compris) ne passe sous la barre',
    run: async (h) => {
      await h.resetEditor();
      await seedVariables(h);
      window.scrollTo(0, 0);
      Editor.setHTML('<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr></tbody></table><p>Après</p>');
      await h.sleep(300);
      const cellText = Array.from(document.querySelectorAll('.tiptap td p')).find(p => p.textContent === 'b1');
      if (!cellText) return { pass: false, notes: 'cellule introuvable' };
      await h.focusInElement(cellText);
      await sleep(200);
      const bar = tableBar();
      if (!bar) return { pass: false, notes: 'barre du tableau masquée ou absente' };
      EditorCore.getEditor().commands.insertContent({ type: 'text', text: ' ' });
      await h.typeText('#');
      await sleep(120);
      const menu = document.getElementById('autocomplete-box');
      if (!menu || menu.style.display === 'none') return { pass: false, notes: 'liste # non ouverte' };
      if (!tableBar()) return { pass: false, notes: 'la barre du tableau a disparu à la frappe' };
      // La liste tombe sur la barre, comme à 700x400 quand la barre est repoussée sous le tableau : le coin de la liste sur celui de la barre.
      const barRect = bar.getBoundingClientRect();
      moveTo(menu, barRect.left - 14, barRect.top - 8);
      const rows = Array.from(menu.querySelectorAll('.ac-tab, .ac-item')).filter(row => overlapPoint(row, bar));
      const covered = rows.filter(row => isOver(row, bar) !== true).map(row => row.textContent.slice(0, 20));
      const result = { rows: rows.length, covered, menuZ: getComputedStyle(menu).zIndex, barZ: getComputedStyle(bar).zIndex };
      menu.style.display = 'none';
      await h.resetEditor();
      return { pass: rows.length > 0 && covered.length === 0, notes: JSON.stringify(result) };
    },
  });

  // === 2) Chaque sorte de menu, au-dessus d'une barre et d'un menu déjà ouvert ========================================================================================

  cases.push({
    id: 'layers_top_toolbar_menu_opens_above_floating_toolbar_and_open_menus',
    description: 'Un menu de la barre du haut (au survol) s\'ouvre au-dessus d\'une barre flottante qui descendrait jusque-là et au-dessus d\'un menu déjà ouvert',
    run: async (h) => {
      await h.resetEditor();
      return menuLayers(async () => {
        const flyout = h.openFlyout('#v2-blocks-group');
        flyout.parentElement.querySelector(':scope > button').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(30);
        return flyout;
      }, async (flyout) => {
        ['display', 'opacity', 'visibility', 'pointerEvents', 'left', 'top', 'right', 'bottom'].forEach(property => { flyout.style[property] = ''; });
      });
    },
  });

  cases.push({
    id: 'layers_an_open_top_toolbar_menu_is_not_raised_again_by_a_second_mouseover',
    description: 'Un menu de la barre du haut déjà ouvert ne repasse pas devant le menu ouvert après lui quand le navigateur lui renvoie un mouseover (icône du bouton redessinée sous une souris au repos : l\'alignement, à chaque frappe)',
    run: async (h) => {
      await h.resetEditor();
      window.scrollTo(0, 0);
      const flyout = h.openFlyout('#v2-blocks-group');
      const trigger = flyout.parentElement.querySelector(':scope > button');
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); // l'ouverture, qui le remonte
      await sleep(30);
      const later = document.createElement('div');
      later.style.cssText = 'position:absolute;z-index:var(--z-menu);width:240px;height:120px;background:#fff;border:1px solid #444;box-sizing:border-box;';
      document.body.appendChild(later);
      try {
        const rect = flyout.getBoundingClientRect();
        moveTo(later, rect.left, rect.top);
        Layers.raise(later); // ouvert APRÈS le menu de la barre
        const before = isOver(later, flyout);
        // L'ancienne icône, retirée de la page : un relatedTarget qui n'est plus dans le groupe, comme celui que Chrome envoie dans ce cas.
        trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.createElement('span') }));
        await sleep(30);
        const after = isOver(later, flyout);
        return { pass: before === true && after === true, notes: JSON.stringify({ before, after, flyoutZ: getComputedStyle(flyout).zIndex, laterZ: getComputedStyle(later).zIndex }) };
      } finally {
        ['display', 'opacity', 'visibility', 'pointerEvents', 'left', 'top', 'right', 'bottom'].forEach(property => { flyout.style[property] = ''; });
        trigger.setAttribute('aria-expanded', 'false');
        dropAll(later);
      }
    },
  });

  cases.push({
    id: 'layers_popup_placed_by_viewport_fit_opens_above_floating_toolbar_and_open_menus',
    description: 'Un popup posé par ViewportFit.placePopup (liste #, commentaire, image depuis une variable) passe au-dessus d\'une barre flottante et d\'un menu déjà ouvert',
    run: async (h) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;z-index:var(--z-menu);width:220px;height:90px;background:#fff;border:1px solid #444;box-sizing:border-box;';
      document.body.appendChild(box); // AVANT le menu déjà ouvert que menuLayers ajoute ensuite : à niveau égal, celui-là gagnerait
      try {
        return await menuLayers(async () => {
          ViewportFit.placePopup(box, { left: 300, right: 400, top: 200, bottom: 220, width: 100, height: 20 }, { gap: 4 });
          return box;
        });
      } finally { dropAll(box); }
    },
  });

  cases.push({
    id: 'layers_footnote_popup_opens_above_floating_toolbar_and_open_menus',
    description: 'Le popup d\'une note de bas de page passe au-dessus d\'une barre flottante et d\'un menu déjà ouvert',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="note"></sup> suite</p>');
      await h.sleep(300);
      let notePos = null;
      EditorCore.getEditor().state.doc.descendants((node, pos) => { if (notePos == null && node.type.name === 'footnoteRef') notePos = pos; });
      if (notePos == null) return { pass: false, notes: 'note de bas de page introuvable' };
      // Le popup naît à la première ouverture : l'ouvrir une fois d'abord, pour qu'il soit dans la page AVANT le menu déjà ouvert.
      Editor.openFootnoteEditorAt(notePos);
      await sleep(60);
      const popup = document.getElementById('v2-footnote-popup');
      if (!popup) return { pass: false, notes: 'popup introuvable' };
      popup.style.display = 'none';
      return menuLayers(async () => { Editor.openFootnoteEditorAt(notePos); await sleep(60); return popup.style.display === 'none' ? null : popup; },
        async () => { popup.style.display = 'none'; });
    },
  });

  cases.push({
    id: 'layers_template_list_opens_above_floating_toolbar_and_open_menus',
    description: 'La liste des modèles de la barre du haut s\'ouvre au-dessus d\'une barre flottante et d\'un menu déjà ouvert',
    run: async (h) => {
      await h.resetEditor();
      const trigger = document.querySelector('.tts-trigger');
      const popup = document.querySelector('.tts-popup');
      if (!trigger || !popup) return { pass: false, notes: 'liste des modèles introuvable' };
      const click = (el) => ['mousedown', 'mouseup', 'click'].forEach(type => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true })));
      return menuLayers(async () => {
        if (!popup.classList.contains('is-open')) click(trigger);
        await sleep(60);
        return popup.classList.contains('is-open') ? popup : null;
      }, async () => {
        if (popup.classList.contains('is-open')) document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await sleep(30);
      });
    },
  });

  cases.push({
    id: 'layers_search_select_menu_opens_above_floating_toolbar_and_open_menus',
    description: 'Le menu avec recherche posé sur la page (« Image depuis une variable ») s\'ouvre au-dessus d\'une barre flottante et d\'un menu déjà ouvert ; celui d\'une fenêtre garde son niveau',
    run: async (h) => {
      await h.resetEditor();
      const host = document.createElement('div');
      const select = document.createElement('select');
      ['Photo', 'Logo', 'Signature'].forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; select.appendChild(option); });
      host.appendChild(select);
      document.body.appendChild(host); // AVANT le menu déjà ouvert que menuLayers ajoute ensuite
      select.selectedIndex = -1;
      const search = SearchSelect.attachColumns(select, { popup: true, anchor: () => ({ left: 300, right: 540, top: 200, bottom: 220, width: 240, height: 20 }) });
      try {
        const result = await menuLayers(async () => {
          search.open();
          await sleep(60);
          return host.querySelector('.ss-panel');
        }, async () => { search.close(false); });
        // Hors popup, le panneau d'une liste de fenêtre reste dans le niveau de sa fenêtre : rien n'y change.
        const inWindowSelect = document.createElement('select');
        inWindowSelect.innerHTML = '<option value="a">A</option>';
        host.appendChild(inWindowSelect);
        const inWindow = SearchSelect.attachColumns(inWindowSelect, { inline: true });
        inWindow.open();
        await sleep(40);
        const panel = host.querySelectorAll('.ss-panel')[1];
        const inline = panel ? panel.style.zIndex : null;
        inWindow.close(false);
        inWindow.destroy();
        return { pass: result.pass && inline === '', notes: JSON.stringify({ popup: result.notes, inWindowInlineZ: inline }) };
      } finally { search.destroy(); dropAll(host); }
    },
  });

  // === 3) Le dernier ouvert est au-dessus, dans son niveau ===========================================================================================================

  // Deux couches posées par le vrai kit de panneaux flottants (EditorCore.createFloatingPanel), ancrées au même endroit : elles se recouvrent.
  function anchor() {
    const ref = document.createElement('div');
    ref.style.cssText = 'position:absolute;left:300px;top:500px;width:120px;height:20px;';
    document.body.appendChild(ref);
    return ref;
  }
  async function twoPanels(kind) {
    window.scrollTo(0, 0);
    const ref = anchor();
    const make = (label) => EditorCore.createFloatingPanel(kind, '<button type="button" data-action="x" style="width:90px">' + label + '</button>', () => {});
    const first = make('A');
    const second = make('B');
    return { ref, first, second, drop: () => { [first, second].forEach(panel => { panel.hide(); dropAll(panel.el); }); dropAll(ref); } };
  }

  cases.push({
    id: 'layers_last_opened_menu_is_on_top',
    description: 'Deux menus (couleur, police) ouverts l\'un après l\'autre au même endroit : le dernier ouvert est au-dessus, même s\'il a été créé le premier',
    run: async () => {
      const { ref, first, second, drop } = await twoPanels('v2-format-panel');
      try {
        first.show(ref); await sleep(80);
        second.show(ref); await sleep(80);
        const secondOver = isOver(second.el, first.el);
        // Le premier se referme puis se rouvre : c'est lui le dernier ouvert, alors qu'il est avant l'autre dans la page.
        first.hide();
        first.show(ref); await sleep(80);
        const firstOver = isOver(first.el, second.el);
        return { pass: secondOver === true && firstOver === true, notes: JSON.stringify({ secondOver, firstOver, z: [first.el.style.zIndex, second.el.style.zIndex] }) };
      } finally { drop(); }
    },
  });

  cases.push({
    id: 'layers_floating_toolbars_are_not_ranked_the_later_created_one_stays_above',
    description: 'Deux barres flottantes (tableau, bulle) : la barre de la bulle, créée après celle du tableau, reste dessus, que le tableau s\'ouvre avant elle, après elle, ou qu\'il se rouvre ; Layers.raise ne leur pose aucun rang',
    run: async () => {
      const { ref, first, second, drop } = await twoPanels('v2-floating-toolbar'); // `first` : le tableau (créé d'abord), `second` : la bulle
      try {
        second.show(ref); await sleep(80);
        first.show(ref); await sleep(80); // le tableau s'ouvre EN DERNIER, comme au clic sur une bulle d'une case de tableau
        const bubbleOverWhenTableLast = isOver(second.el, first.el);
        first.hide();
        first.show(ref); await sleep(80); // le tableau se rouvre
        const bubbleOverWhenReopened = isOver(second.el, first.el);
        first.show(ref); await sleep(80); // recalé, déjà affiché (show rappelé à chaque transaction)
        const bubbleOverWhenRealigned = isOver(second.el, first.el);
        return {
          pass: bubbleOverWhenTableLast === true && bubbleOverWhenReopened === true && bubbleOverWhenRealigned === true && first.el.style.zIndex === '' && second.el.style.zIndex === '',
          notes: JSON.stringify({ bubbleOverWhenTableLast, bubbleOverWhenReopened, bubbleOverWhenRealigned, inline: [first.el.style.zIndex, second.el.style.zIndex] }),
        };
      } finally { drop(); }
    },
  });

  cases.push({
    id: 'layers_a_bubble_toolbar_stays_above_the_table_toolbar_that_the_same_click_opens',
    description: 'Une bulle dans une case de tableau : un seul clic ouvre la barre de la bulle ET celle du tableau, celle de la bulle reste au-dessus (bouton par bouton, au centre de leur recouvrement)',
    run: async (h) => {
      await h.resetEditor();
      window.scrollTo(0, 0);
      Editor.setHTML('<table><tbody><tr><td><p>Dossier <span class="var-badge" data-table="' + TABLE + '" data-column="Nom" data-key="' + TABLE + '.Nom"></span> suivi</p></td><td><p>b1</p></td></tr></tbody></table><p>Après</p>');
      await h.sleep(300);
      const ed = EditorCore.getEditor();
      document.querySelector('.tiptap').focus();
      let badgePos = null;
      ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge' && badgePos === null) badgePos = pos; });
      if (badgePos === null) return { pass: false, notes: 'bulle introuvable' };
      // Le curseur part d'HORS du tableau (aucune barre), puis un seul geste - le clic sur la bulle - ouvre les deux barres : celle de la bulle est testée avant celle du tableau.
      ed.commands.setTextSelection(ed.state.doc.content.size - 1);
      await h.sleep(250);
      if (document.querySelector('.v2-floating-toolbar.visible')) return { pass: false, notes: 'une barre flottante est restée affichée hors du tableau' };
      // Comme au vrai clic : ProseMirror sélectionne la bulle AVANT que le navigateur ne rende le focus à l'éditeur ; la barre de la bulle s'ouvre tout de suite, celle du tableau (qui exige le
      // focus) à l'arrivée du focus, quelques millisecondes après - la dernière ouverte, donc, ce qui la mettrait au-dessus si les barres flottantes étaient rangées.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      await h.sleep(100);
      ed.commands.setNodeSelection(badgePos);
      await h.sleep(150);
      document.querySelector('.tiptap').focus();
      await h.sleep(250);
      const bubbleBar = document.querySelector('.v2-varfmt-toolbar.visible');
      const tableBarEl = tableBar();
      if (!bubbleBar || !tableBarEl) return { pass: false, notes: JSON.stringify({ bubbleBar: !!bubbleBar, tableBar: !!tableBarEl }) };
      // La barre de la bulle sur le coin de celle du tableau : le navigateur dit laquelle des deux atteint la souris.
      const tableRect = tableBarEl.getBoundingClientRect();
      moveTo(bubbleBar, tableRect.left + 4, tableRect.top + 4);
      const bubbleOver = isOver(bubbleBar, tableBarEl);
      const buttons = Array.from(bubbleBar.querySelectorAll('button')).filter(button => overlapPoint(button, tableBarEl));
      const hidden = buttons.filter(button => isOver(button, tableBarEl) !== true).map(button => button.dataset.action);
      const result = { bubbleOver, overlappingButtons: buttons.length, hidden, bubbleZ: getComputedStyle(bubbleBar).zIndex, tableZ: getComputedStyle(tableBarEl).zIndex };
      await h.resetEditor();
      return { pass: bubbleOver === true && buttons.length > 0 && hidden.length === 0, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'layers_a_menu_is_above_every_floating_toolbar_whatever_the_order',
    description: 'Un menu de barre (couleur, police) passe toujours au-dessus d\'une barre flottante, qu\'il ait été créé ou ouvert avant ou après elle',
    run: async () => {
      window.scrollTo(0, 0);
      const ref = anchor();
      const menu = EditorCore.createFloatingPanel('v2-format-panel', '<button type="button" data-action="x" style="width:90px">M</button>', () => {}); // créé AVANT la barre
      const bar = EditorCore.createFloatingPanel('v2-floating-toolbar', '<button type="button" data-action="x" style="width:90px">B</button>', () => {});
      try {
        bar.show(ref); await sleep(80);
        menu.show(ref); await sleep(80);
        const menuLast = isOver(menu.el, bar.el);
        menu.hide();
        bar.hide();
        menu.show(ref); await sleep(80);
        bar.show(ref); await sleep(80); // la barre s'ouvre APRÈS le menu : le menu ne passe pas dessous pour autant
        const barLast = isOver(menu.el, bar.el);
        return { pass: menuLast === true && barLast === true, notes: JSON.stringify({ menuLast, barLast }) };
      } finally { [menu, bar].forEach(panel => { panel.hide(); dropAll(panel.el); }); dropAll(ref); }
    },
  });

  // === 4) Les niveaux eux-mêmes ======================================================================================================================================

  cases.push({
    id: 'layers_levels_are_ordered_toolbars_menus_tips_windows',
    description: 'Les niveaux donnés par les feuilles de style sont dans l\'ordre : barres flottantes < menus < info-bulles < fenêtres, chaque niveau large de 100 ; chaque sorte de menu a le niveau des menus',
    run: async (h) => {
      await h.resetEditor();
      // Des éléments NEUFS, jamais ceux de la page : un menu déjà ouvert porte un rang en ligne, qui n'est pas le niveau de sa feuille de style.
      const probes = [];
      const probe = (attrs, inner) => {
        const el = document.createElement('div');
        Object.keys(attrs).forEach(name => el.setAttribute(name, attrs[name]));
        if (inner) el.appendChild(inner);
        document.body.appendChild(el);
        probes.push(el);
        return el;
      };
      const level = (el, pseudo) => parseInt(getComputedStyle(el, pseudo || null).zIndex, 10);
      try {
        const toolbar = level(probe({ class: 'v2-floating-toolbar' }));
        const menu = level(probe({ class: 'v2-format-panel' }));
        const tipHost = document.querySelector('#toolbar-top [data-tip]');
        const tip = tipHost ? level(tipHost, '::after') : NaN;
        const windows = Array.from(document.querySelectorAll('.pp-modal')).map(modal => level(modal));
        const menuKinds = {
          flyout: probe({ class: 'v2-hover-flyout' }),
          color: probe({ class: 'v2-color-dropdown' }),
          templateList: probe({ class: 'tts-popup' }),
          hashList: probe({ id: 'autocomplete-box' }),
          commentPopup: probe({ id: 'v2-comment-popup' }),
          footnotePopup: probe({ id: 'v2-footnote-popup' }),
          imageVariablePicker: probe({ id: 'v2-image-var-picker' }),
          searchPopup: (() => { const panel = document.createElement('div'); panel.className = 'ss-panel'; return probe({ class: 'ss-popup' }, panel).firstChild; })(),
        };
        const kinds = {};
        Object.keys(menuKinds).forEach(name => { kinds[name] = level(menuKinds[name]); });
        const ordered = toolbar > 0 && menu - toolbar >= 100 && tip - menu >= 100 && windows.length > 0 && windows.every(value => value > tip);
        const wrong = Object.keys(kinds).filter(name => kinds[name] !== menu);
        return { pass: ordered && wrong.length === 0, notes: JSON.stringify({ toolbar, menu, tip, windowsMin: Math.min(...windows), wrong, kinds }) };
      } finally { dropAll(...probes); }
    },
  });

  cases.push({
    id: 'layers_a_rank_never_leaves_its_level_and_hidden_menus_free_theirs',
    description: 'Mille ouvertures dans tous les ordres : le rang reste dans les 100 du niveau des menus (jamais jusqu\'aux fenêtres) ; un menu refermé libère son rang',
    run: async () => {
      window.scrollTo(0, 0);
      const menus = [0, 1, 2, 3].map(() => {
        const menu = document.createElement('div');
        menu.style.cssText = 'position:absolute;z-index:var(--z-menu);left:10px;top:10px;width:20px;height:20px;';
        document.body.appendChild(menu);
        return menu;
      });
      const zOf = (menu) => parseInt(getComputedStyle(menu).zIndex, 10);
      try {
        const base = zOf(menus[0]);
        let worst = 0;
        let lastIsTop = true;
        for (let i = 0; i < 1000; i++) {
          const pick = menus[(i * 7 + (i >> 2)) % menus.length];
          Layers.raise(pick);
          const levels = menus.map(zOf);
          worst = Math.max(worst, ...levels);
          if (zOf(pick) !== Math.max(...levels)) lastIsTop = false;
        }
        const withinLevel = worst >= base && worst < base + 100;
        // Trois menus refermés, un seul rouvert : il retrouve le bas du niveau.
        menus.slice(1).forEach(menu => { menu.style.display = 'none'; });
        Layers.raise(menus[0]);
        const alone = zOf(menus[0]);
        return { pass: base === 1600 && withinLevel && lastIsTop && alone === base, notes: JSON.stringify({ base, worst, lastIsTop, alone }) };
      } finally { dropAll(...menus); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.layers = cases;
})();
