// Suite "contrast" - contrastes mesurés sur les éléments réels, en thème clair puis sombre (audit UX/UI du 2026-09-29, constat F5).
//
// Seuils : 4,5:1 pour un texte, 3:1 pour un anneau de focus (WCAG 2.1, 1.4.3 et 1.4.11). Chaque cas relève la couleur CALCULÉE de l'élément (celle que le
// navigateur peint, jetons CSS résolus) et la compose sur son vrai fond : le premier ancêtre opaque, ou le blanc à défaut. Un fond ou une couleur écrits en
// dur qui ne suivent pas le thème sont donc attrapés sans qu'on ait à les connaître.
//
// Le thème se change comme le fait js/settings.js (attribut data-theme sur <html>) ; chaque cas remet celui qu'il a trouvé.
(function () {
  const cases = [];
  const html = document.documentElement;

  function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const round2 = n => Math.round(n * 100) / 100;

  // Fond réellement peint derrière `el` : les fonds translucides des ancêtres se composent jusqu'au premier opaque (blanc du navigateur en dernier recours).
  function backgroundOf(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const colorOf = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    const c = parseColor(cs.color);
    if (c && pseudo) c.a *= parseFloat(cs.opacity);
    return c;
  };
  const textRatio = (el, pseudo) => { const bg = backgroundOf(el); return ratio(over(colorOf(el, pseudo), bg), bg); };

  // Rend `probe(theme)` pour clair puis sombre et remet le thème d'origine.
  // Les transitions sont coupées le temps de la mesure : une couleur en transition rend la valeur de départ juste après le changement de thème (les boutons
  // pleins de la barre ont un `transition: background`), donc une mesure « en sombre » lirait encore le clair.
  function inBothThemes(probe) {
    const before = html.getAttribute('data-theme');
    const noMotion = document.createElement('style');
    noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    document.head.appendChild(noMotion);
    const out = {};
    try {
      for (const theme of ['light', 'dark']) {
        html.setAttribute('data-theme', theme);
        out[theme] = probe(theme);
      }
    } finally {
      if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
      noMotion.remove();
    }
    return out;
  }
  const failing = (byTheme, min) => {
    const bad = [];
    for (const theme of Object.keys(byTheme)) {
      for (const [name, value] of Object.entries(byTheme[theme])) if (!(value >= min)) bad.push(theme + ' ' + name + ' ' + value);
    }
    return bad;
  };

  // Élément fabriqué pour une règle qui ne vit que dans une fenêtre ouverte à la demande : posé dans <body>, retiré aussitôt.
  function withProbe(markup, fn) {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.appendChild(host);
    try { return fn(host.firstElementChild); } finally { host.remove(); }
  }

  cases.push({
    id: 'contrast_faint_text_reaches_4_5_on_its_background_in_light_and_dark',
    description: 'Texte discret (onglets inactifs des Réglages, introductions des fenêtres) : 4,5:1 au moins sur son fond, en clair et en sombre',
    run: async () => {
      const byTheme = inBothThemes(() => {
        const tab = Array.from(document.querySelectorAll('.settings-tab')).find(t => !t.classList.contains('active'));
        return {
          'onglet inactif des Réglages': round2(textRatio(tab)),
          'introduction de Organiser mes modèles': round2(textRatio(document.querySelector('.template-organize-intro'))),
          'introduction du macro-modèle': round2(textRatio(document.querySelector('.macro-editor-intro'))),
        };
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_credits_links_follow_the_accent_colour_in_light_and_dark',
    description: 'Liens des Crédits : couleur d’accent (pas le bleu du navigateur), 4,5:1 au moins sur le fond de la fenêtre, en clair et en sombre',
    run: async () => {
      const notAccent = [];
      const byTheme = inBothThemes(theme => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent)';
        document.body.appendChild(probe);
        const accentColor = getComputedStyle(probe).color;
        probe.remove();
        const out = {};
        ['settings-credits-website-link', 'settings-credits-license-link'].forEach(id => {
          const link = document.getElementById(id);
          out[id] = round2(textRatio(link));
          if (getComputedStyle(link).color !== accentColor) notAccent.push(theme + ' ' + id + ' ' + getComputedStyle(link).color);
        });
        return out;
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0 && notAccent.length === 0, notes: JSON.stringify({ bad, notAccent, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_solid_buttons_keep_white_text_at_4_5_in_light_and_dark',
    description: 'Boutons pleins à texte blanc (Enregistrer, Exporter, Créer l’email, Utiliser ce template, Valider une fenêtre…) : 4,5:1 au moins, le fond ne s’éclaircit pas en sombre',
    run: async () => {
      const solid = [
        ['Enregistrer', '#btn-save'], ['Exporter en PDF', '#btn-export-pdf'], ['Créer l’email', '#btn-create-email'], ['Modifier la composition', '#btn-edit-macro'],
        ['Utiliser ce template', '#tpl-preview-use-empty'], ['Utiliser avec une nouvelle table', '#tpl-preview-use-data'], ['Macro : Enregistrer', '#macro-editor-save'],
        ['Fenêtre de variable : Enregistrer', null, '<div class="var-modal-actions"><button class="var-modal-primary">Enregistrer</button></div>'],
        ['Filtre actif de la galerie', null, '<div class="tpl-gallery-tags"><button class="tpl-gallery-tag is-active">test</button></div>'],
        ['Recharger', null, '<div class="settings-trigger-reload-notice"><button>Recharger</button></div>'],
        ['Terminer l’en-tête', null, '<div><button class="v2-hf-btn-done">Terminer</button></div>'],
        ['Fusion de zone 2 colonnes', null, '<div class="tiptap"><button class="two-columns-mm-button">mm</button></div>'],
      ];
      const byTheme = inBothThemes(() => {
        const out = {};
        for (const [label, sel, markup] of solid) {
          const measure = el => {
            const text = parseColor(getComputedStyle(el).color);
            const bg = parseColor(getComputedStyle(el).backgroundColor);
            return round2(ratio(text, over(bg, { r: 255, g: 255, b: 255, a: 1 })));
          };
          out[label] = sel ? measure(document.querySelector(sel)) : withProbe(markup, host => measure(host.querySelector('button')));
        }
        return out;
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_field_hint_text_reaches_4_5_in_dark_and_light_keeps_browser_default',
    description: 'Texte d’aide d’un champ (« Rechercher un modèle… ») : 4,5:1 au moins sur le fond du champ, en clair et en sombre',
    run: async () => {
      const byTheme = inBothThemes(() => {
        const input = document.getElementById('tpl-gallery-search');
        return { 'Rechercher un modèle…': round2(textRatio(input, '::placeholder')) };
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_template_picker_focus_ring_is_3_to_1_against_what_it_borders',
    description: 'Anneau de focus du sélecteur de modèle (bouton et lignes de la liste) : 3:1 au moins contre le fond qu’il borde, en clair et en sombre',
    run: async (h) => {
      // La liste n'a plus de ligne « Nouveau modèle » : sans modèle enregistré elle n'a aucune ligne à mesurer.
      if (!Templates.getCached().length) {
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-document');
        await h.sleep(50);
        Editor.setHTML('<p>Contraste</p>');
        document.getElementById('template-name').value = 'Contraste - Modèle';
        await h.clickButton('btn-save');
        await h.sleep(400);
      }
      const trigger = document.querySelector('.tts-trigger');
      const popup = document.querySelector('.tts-popup');
      const wasOpen = popup && popup.classList.contains('is-open');
      if (!wasOpen) trigger.click();
      await new Promise(r => setTimeout(r, 250));
      const row = document.querySelector('.tts-popup .tts-row');
      try {
        const byTheme = inBothThemes(() => {
          const out = {};
          const ring = el => {
            el.focus();
            const cs = getComputedStyle(el);
            const focusVisible = el.matches(':focus-visible');
            const ringColor = parseColor(cs.outlineColor);
            const bg = backgroundOf(el);
            return { focusVisible, width: cs.outlineWidth, value: focusVisible && ringColor ? round2(ratio(over(ringColor, bg), bg)) : 0 };
          };
          const t = ring(trigger);
          out['bouton'] = t.value;
          if (row) { const r = ring(row); out['ligne'] = r.value; }
          return out;
        });
        const bad = failing(byTheme, 3);
        return { pass: bad.length === 0 && !!row, notes: JSON.stringify({ bad, byTheme, rows: !!row }) };
      } finally {
        if (!wasOpen) trigger.click();
        trigger.blur();
      }
    },
  });

  cases.push({
    id: 'contrast_template_list_header_and_empty_text_reach_4_5_and_organize_focus_ring_3_to_1',
    description: 'En-tête de la liste des modèles (titre, bouton « Organiser ») et phrase « Aucun modèle enregistré » : 4,5:1 au moins sur le fond du panneau ; anneau de focus du bouton « Organiser » : 3:1 ; en clair et en sombre',
    run: async () => {
      const trigger = document.querySelector('.tts-trigger');
      const popup = document.querySelector('.tts-popup');
      const wasOpen = popup && popup.classList.contains('is-open');
      if (!wasOpen) trigger.click();
      await new Promise(r => setTimeout(r, 250));
      try {
        const title = document.querySelector('.tts-head-title');
        const organize = document.getElementById('btn-organize-templates');
        const byTheme = inBothThemes(() => {
          const out = {
            'titre de l’en-tête': round2(textRatio(title)),
            'bouton Organiser': round2(textRatio(organize.querySelector('.tts-organize-label') || organize)),
            'phrase « aucun modèle »': withProbe('<div class="tts-popup is-open" style="position:static;"><div class="tts-empty">x</div></div>', p => round2(textRatio(p.querySelector('.tts-empty')))),
          };
          organize.focus();
          const cs = getComputedStyle(organize);
          const ringColor = parseColor(cs.outlineColor);
          const bg = backgroundOf(organize);
          out['anneau de focus (3:1)'] = organize.matches(':focus-visible') && ringColor ? round2(ratio(over(ringColor, bg), bg)) : 0;
          return out;
        });
        const ringLow = Object.keys(byTheme).filter(t => !(byTheme[t]['anneau de focus (3:1)'] >= 3));
        const textsBad = [];
        for (const theme of Object.keys(byTheme)) for (const [name, value] of Object.entries(byTheme[theme])) if (name !== 'anneau de focus (3:1)' && !(value >= 4.5)) textsBad.push(theme + ' ' + name + ' ' + value);
        return { pass: textsBad.length === 0 && ringLow.length === 0, notes: JSON.stringify({ textsBad, ringLow, byTheme }) };
      } finally {
        if (!wasOpen) trigger.click();
        trigger.blur();
      }
    },
  });

  cases.push({
    id: 'contrast_links_blocks_menu_link_window_and_link_text_reach_4_5_in_light_and_dark',
    description: 'Menu Lien et blocs de contenu (lignes, raccourci Ctrl+K, ligne active), fenêtre de lien (aide, erreur, Retirer le lien), info-bulle d’un lien et lien du document : 4,5:1 au moins, en clair et en sombre',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Voir <a href="https://exemple.fr">ce site</a></p>');
      await new Promise(r => setTimeout(r, 100));
      // La fenêtre de lien, ouverte sur le lien (« Retirer le lien » visible), avec une erreur affichée.
      const range = document.createRange();
      const textNode = document.querySelector('.tiptap a').firstChild;
      range.setStart(textNode, 2); range.collapse(true);
      document.querySelector('.tiptap').focus();
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      await new Promise(r => setTimeout(r, 120));
      LinkDialog.open();
      const url = document.getElementById('pp-link-url');
      url.value = 'nope';
      document.querySelector('#pp-link-modal .var-modal-primary').click();
      const flyout = h.openFlyout('#v2-blocks-group');
      const activeRow = document.getElementById('v2-btn-citation');
      activeRow.classList.add('is-active');
      let byTheme;
      try {
        byTheme = inBothThemes(() => {
          const out = {};
          out['lien du document (sur la page)'] = round2(textRatio(document.querySelector('.tiptap a')));
          out['ligne Lien du menu'] = round2(textRatio(document.querySelector('#v2-row-link > span:nth-child(2)')));
          out['raccourci Ctrl+K du menu'] = round2(textRatio(document.getElementById('v2-row-link-kbd')));
          out['ligne Bloc de code du menu'] = round2(textRatio(document.querySelector('#v2-btn-code-block > span:nth-child(2)')));
          out['ligne active du menu'] = round2(textRatio(activeRow));
          out['titre du volet du menu'] = round2(textRatio(flyout.querySelector('.v2-hover-flyout-label')));
          out['aide sous le champ adresse'] = round2(textRatio(document.getElementById('pp-link-hint')));
          out['erreur sous le champ adresse'] = round2(textRatio(document.getElementById('pp-link-error')));
          const remove = document.querySelector('#pp-link-modal .var-modal-danger');
          out['Retirer le lien'] = round2(textRatio(remove));
          withProbe('<div class="pp-link-tip"><span class="pp-link-tip-url">https://exemple.fr</span><span class="pp-link-tip-hint">Ctrl+clic pour ouvrir</span></div>', tip => {
            out['info-bulle : adresse'] = round2(textRatio(tip.querySelector('.pp-link-tip-url')));
            out['info-bulle : indication'] = round2(textRatio(tip.querySelector('.pp-link-tip-hint')));
          });
          return out;
        });
      } finally {
        activeRow.classList.remove('is-active');
        flyout.style.display = ''; flyout.style.opacity = ''; flyout.style.visibility = ''; flyout.style.pointerEvents = '';
        document.querySelector('#pp-link-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      }
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_save_menu_texts_reach_4_5_tick_and_row_focus_ring_3_to_1',
    description: 'Menu du bouton Enregistrer : titre et lignes 4,5:1 au moins sur le fond du menu ; coche de « Enregistrement automatique » et anneau de focus des lignes 3:1 ; en clair et en sombre',
    run: async (h) => {
      const flyout = h.openFlyout('#v2-save-group');
      const title = document.getElementById('v2-save-flyout-label');
      const saveAs = document.getElementById('v2-btn-save-as');
      const auto = document.getElementById('v2-btn-autosave');
      try {
        const byTheme = inBothThemes(() => {
          const bg = backgroundOf(flyout);
          const out = {
            'titre du menu': round2(textRatio(title)),
            'ligne Enregistrer sous': round2(textRatio(saveAs)),
            'ligne Enregistrement automatique': round2(textRatio(auto)),
          };
          const tick = parseColor(getComputedStyle(auto, '::after').backgroundColor);
          out['coche (3:1)'] = tick ? round2(ratio(over(tick, bg), bg)) : 0;
          saveAs.focus();
          const ring = parseColor(getComputedStyle(saveAs).outlineColor);
          out['anneau de focus (3:1)'] = saveAs.matches(':focus-visible') && ring ? round2(ratio(over(ring, bg), bg)) : 0;
          saveAs.blur();
          return out;
        });
        const low = [];
        for (const theme of Object.keys(byTheme)) for (const [name, value] of Object.entries(byTheme[theme])) {
          const min = /3:1/.test(name) ? 3 : 4.5;
          if (!(value >= min)) low.push(theme + ' ' + name + ' ' + value);
        }
        return { pass: low.length === 0, notes: JSON.stringify({ low, byTheme }) };
      } finally {
        flyout.style.cssText = '';
      }
    },
  });

  cases.push({
    id: 'contrast_callout_menu_rows_window_and_document_box_reach_the_thresholds_in_light_and_dark',
    description: 'Encadré et signature : lignes du menu (dont la ligne active) et fenêtre (titre, libellés, types coché et non coché, aperçu, boutons, Retirer l’encadré) à 4,5:1 au moins, en clair et en sombre ; dans le document, le texte des six couleurs sur leur teinte à 4,5:1, la barre et l’icône sur la teinte et sur le papier blanc à 3:1',
    run: async (h) => {
      await h.resetEditor();
      const colors = Callout.COLOR_ORDER;
      Editor.setHTML('<p>Dehors</p>' + colors.map((c, i) => '<div class="callout" data-color="' + c + '" data-icon="' + Callout.ICON_ORDER[i] + '"><p>Texte de l’encadré ' + c + '</p></div>').join(''));
      await new Promise(r => setTimeout(r, 150));
      const ed = EditorCore.getEditor();
      const flyout = h.openFlyout('#v2-blocks-group');
      const activeRow = document.getElementById('v2-btn-callout');
      activeRow.classList.add('is-active');
      const white = { r: 255, g: 255, b: 255, a: 1 };
      const cancel = () => document.querySelector('#pp-callout-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      let rows, windowNew, windowEdit, graphics, document6;
      try {
        // Phase 1 : la fenêtre ouverte hors d'un encadré (« Note » coché, « Retirer » caché).
        ed.commands.setTextSelection(1);
        Callout.open();
        rows = inBothThemes(() => ({
          'ligne Encadré du menu (active)': round2(textRatio(activeRow)),
          'ligne Bloc de signature du menu': round2(textRatio(document.querySelector('#v2-btn-signature > span:nth-child(2)'))),
        }));
        windowNew = inBothThemes(() => {
          const out = {};
          out['titre de la fenêtre'] = round2(textRatio(document.getElementById('pp-callout-title')));
          ['type', 'color', 'icon'].forEach(k => { out['libellé ' + k] = round2(textRatio(document.getElementById('pp-callout-' + k + '-label'))); });
          out['type coché'] = round2(textRatio(document.querySelector('#pp-callout-modal .pp-callout-type[aria-checked="true"] .pp-callout-type-name')));
          out['type non coché'] = round2(textRatio(document.querySelector('#pp-callout-modal .pp-callout-type[aria-checked="false"] .pp-callout-type-name')));
          out['aperçu : texte sur la teinte'] = round2(textRatio(document.querySelector('#pp-callout-modal .pp-callout-paper .callout p')));
          out['bouton Insérer'] = round2(textRatio(document.querySelector('#pp-callout-modal .var-modal-primary')));
          out['bouton Annuler'] = round2(textRatio(document.querySelector('#pp-callout-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)')));
          return out;
        });
        cancel();
        // Phase 2 : la fenêtre ouverte dans un encadré (« Retirer l'encadré » visible).
        let inside = 0;
        ed.state.doc.descendants((node, pos) => { if (!inside && node.type.name === 'callout') inside = pos + 2; });
        ed.commands.setTextSelection(inside);
        Callout.open();
        windowEdit = inBothThemes(() => ({
          'Retirer l’encadré': round2(textRatio(document.querySelector('#pp-callout-modal .var-modal-danger'))),
          'bouton Valider': round2(textRatio(document.querySelector('#pp-callout-modal .var-modal-primary'))),
        }));
        cancel();
        // Dans le document (papier blanc dans les deux thèmes) : le texte sur la teinte, puis la barre et l'icône (éléments graphiques, 3:1).
        document6 = inBothThemes(() => {
          const out = {};
          Array.from(document.querySelectorAll('.tiptap .callout')).forEach(c => { out['texte, ' + c.dataset.color] = round2(textRatio(c.querySelector('p'))); });
          return out;
        });
        graphics = inBothThemes(() => {
          const out = {};
          Array.from(document.querySelectorAll('.tiptap .callout')).forEach(c => {
            const cs = getComputedStyle(c);
            const tint = parseColor(cs.backgroundColor), bar = parseColor(cs.borderLeftColor), icon = parseColor(getComputedStyle(c, '::before').backgroundColor);
            out['barre sur la teinte, ' + c.dataset.color] = round2(ratio(bar, tint));
            out['icône sur la teinte, ' + c.dataset.color] = round2(ratio(icon, tint));
            out['barre sur le papier, ' + c.dataset.color] = round2(ratio(bar, white));
          });
          return out;
        });
      } finally {
        activeRow.classList.remove('is-active');
        flyout.style.display = ''; flyout.style.opacity = ''; flyout.style.visibility = ''; flyout.style.pointerEvents = '';
        const m = document.getElementById('pp-callout-modal');
        if (m && m.style.display !== 'none') cancel();
      }
      const bad = failing(rows, 4.5).concat(failing(windowNew, 4.5), failing(windowEdit, 4.5), failing(document6, 4.5), failing(graphics, 3));
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, rows, windowNew, windowEdit, document6, graphics }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.contrast = cases;
})();
