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
    // Un mélange (color-mix) ressort du navigateur en `color(srgb 0.34 0.38 0.45)`, composantes de 0 à 1.
    const srgb = String(str).match(/^color\(srgb\s+([^)]+)\)/);
    if (srgb) {
      const q = srgb[1].split(/[\s\/]+/).filter(Boolean).map(Number);
      return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 };
    }
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
    id: 'contrast_save_button_black_and_white_state_keeps_a_white_glyph_at_4_5_at_rest_and_hovered_in_light_and_dark',
    description: 'Bouton Enregistrer, enregistrement automatique coupé (noir et blanc classique, js/main.js:wireSaveMenu) : glyphe blanc sur le fond noir 4,5:1 au moins, au repos et survolé (jeton --solid-neutral-hover), en clair et en sombre ; le glyphe dessiné est bien de la couleur du texte',
    run: async () => {
      const btn = document.getElementById('btn-save');
      const had = btn.classList.contains('is-autosave-off');
      btn.classList.add('is-autosave-off');
      try {
        const byTheme = inBothThemes(() => {
          const text = parseColor(getComputedStyle(btn).color);
          const white = { r: 255, g: 255, b: 255, a: 1 };
          const fill = parseColor(getComputedStyle(btn).backgroundColor);
          const hoverFill = parseColor(withProbe('<i style="display:block;background:var(--solid-neutral-hover)"></i>', e => getComputedStyle(e).backgroundColor));
          return {
            'glyphe sur le fond noir': round2(ratio(text, over(fill, white))),
            'glyphe sur le fond survolé': round2(ratio(text, over(hoverFill, white))),
          };
        });
        const sameGlyph = getComputedStyle(btn).color === getComputedStyle(btn, '::before').backgroundColor;
        const bad = failing(byTheme, 4.5);
        return { pass: bad.length === 0 && sameGlyph, notes: JSON.stringify({ bad, sameGlyph, byTheme }) };
      } finally {
        if (!had) btn.classList.remove('is-autosave-off');
      }
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

  // Les champs texte à bulles de l'email (js/field-editor.js) : l'indication du champ vide est dessinée par la feuille de style (css/field-editor.css, `::before` de l'élément), non plus par le
  // `::placeholder` d'un <input> ; le curseur dans le champ se voit à son liseré d'accent (`:focus-within`).
  cases.push({
    id: 'contrast_email_bubble_fields_hint_reaches_4_5_and_focus_border_3_to_1',
    description: 'Champs de l’email à bulles (Objet, À, Cc) : indication du champ vide 4,5:1 au moins sur le fond du champ ; le curseur dedans, liseré d’accent 3:1 au moins contre le fond de la barre ; en clair et en sombre',
    run: async (h) => {
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-email');
      await h.sleep(300);
      const ids = ['v2-email-subject', 'v2-email-to', 'v2-email-cc'];
      try {
        const byTheme = inBothThemes(() => {
          const out = {};
          ids.forEach(id => {
            const host = document.getElementById(id);
            host.value = '';
            out['indication de ' + id] = round2(textRatio(host, '::before'));
          });
          const host = document.getElementById(ids[0]);
          host.focus();
          const ring = parseColor(getComputedStyle(host).borderTopColor);
          const bg = backgroundOf(host.parentElement);
          out['liseré de focus (3:1)'] = host.matches(':focus-within') && ring ? round2(ratio(over(ring, bg), bg)) : 0;
          host.blur();
          return out;
        });
        const ringLow = Object.keys(byTheme).filter(t => !(byTheme[t]['liseré de focus (3:1)'] >= 3));
        const textsBad = [];
        for (const theme of Object.keys(byTheme)) for (const [name, value] of Object.entries(byTheme[theme])) if (name !== 'liseré de focus (3:1)' && !(value >= 4.5)) textsBad.push(theme + ' ' + name + ' ' + value);
        return { pass: textsBad.length === 0 && ringLow.length === 0, notes: JSON.stringify({ textsBad, ringLow, byTheme }) };
      } finally {
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-document');
        await h.sleep(200);
      }
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

  // « Modifications non enregistrées. » (coin d'état, enregistrement automatique coupé ; choix d'Antoine du 01/10) : couleur du texte courant, plus soutenue que le gris des autres
  // messages pour se repérer d'un coup d'œil, sans le rouge d'une erreur.
  cases.push({
    id: 'contrast_unsaved_status_text_reaches_4_5_and_stands_out_from_the_plain_message',
    description: "« Modifications non enregistrées. » du coin d'état atteint 4,5:1 sur le fond de la barre en clair et en sombre, et se détache du gris des autres messages",
    run: async () => {
      const el = document.getElementById('status-msg');
      const saved = { text: el.textContent, cls: el.className };
      try {
        el.textContent = 'Modifications non enregistrées.';
        const byTheme = inBothThemes(() => {
          el.className = '';
          const plain = round2(textRatio(el));
          el.className = 'is-unsaved';
          return { 'message ordinaire': plain, 'message non enregistré': round2(textRatio(el)) };
        });
        const bad = failing(byTheme, 4.5);
        const stronger = Object.values(byTheme).every(v => v['message non enregistré'] > v['message ordinaire']);
        return { pass: bad.length === 0 && stronger, notes: JSON.stringify({ bad, stronger, byTheme }) };
      } finally {
        el.textContent = saved.text;
        el.className = saved.cls;
      }
    },
  });

  // Trois restes du constat F5 (choix d'Antoine du 01/10) : le message vert « lignes trouvées », le bleu d'accent posé sur un fond gris ou teinté, les puces de la galerie.
  cases.push({
    id: 'contrast_success_message_reaches_4_5_and_its_box_follows_the_dark_theme',
    description: 'Message de réussite en vert (« lignes trouvées », ligne de test de la condition, « Copié ») : 4,5:1 au moins, et l’encadré passe en vert sombre en thème sombre',
    run: async () => {
      const preview = document.getElementById('link-config-preview');
      const saved = { text: preview.textContent, cls: preview.className };
      try {
        preview.textContent = '2 lignes trouvées dans « Contrats » (n° 1, 2).';
        preview.className = 'link-config-preview is-good';
        const boxes = {};
        const byTheme = inBothThemes(theme => {
          const out = { 'lignes trouvées': round2(textRatio(preview)) };
          out['ligne de test de la condition'] = withProbe('<div class="var-condition-debug-line is-good">ok</div>', el => round2(textRatio(el)));
          out['bouton Copié'] = withProbe('<button class="var-condition-clip-btn is-done">Copié</button>', el => round2(textRatio(el)));
          boxes[theme] = Math.round(lum(backgroundOf(preview)) * 1000) / 1000;
          return out;
        });
        const bad = failing(byTheme, 4.5);
        const darkBoxIsDark = boxes.dark < 0.1 && boxes.light > 0.5;
        return { pass: bad.length === 0 && darkBoxIsDark, notes: JSON.stringify({ bad, darkBoxIsDark, boxLuminance: boxes, byTheme }) };
      } finally {
        preview.textContent = saved.text;
        preview.className = saved.cls;
      }
    },
  });

  cases.push({
    id: 'contrast_accent_text_on_tinted_backgrounds_reaches_4_5_in_light_and_dark',
    description: 'Texte d’accent sur un fond gris ou teinté (ligne choisie de la liste des modèles, Cci actif, « Modifier le lien », « + Ajouter une règle », lien de la boucle) : 4,5:1 au moins',
    run: async () => {
      const trigger = document.querySelector('.tts-trigger');
      const popup = document.querySelector('.tts-popup');
      const wasOpen = popup && popup.classList.contains('is-open');
      if (!wasOpen) trigger.click();
      await new Promise(r => setTimeout(r, 250));
      const row = document.querySelector('.tts-popup .tts-row');
      const cci = document.querySelector('.v2-email-cci-toggle');
      const savedRow = row && row.getAttribute('aria-selected');
      const savedCci = cci && cci.classList.contains('is-active');
      try {
        if (row) row.setAttribute('aria-selected', 'true');
        if (cci) cci.classList.add('is-active');
        const byTheme = inBothThemes(() => {
          const out = {};
          if (row) out['ligne choisie de la liste des modèles'] = round2(textRatio(row.querySelector('.tts-row-label') || row));
          if (cci) out['Cci actif'] = round2(textRatio(cci));
          out['Modifier le lien'] = withProbe('<div class="var-condition-rules"><div class="var-condition-link-hint">x <button type="button">Modifier le lien</button></div></div>', el => round2(textRatio(el.querySelector('button'))));
          out['+ Ajouter une règle'] = withProbe('<div class="macro-slot-card"><button type="button" class="macro-rule-add">+ Ajouter une règle</button></div>', el => round2(textRatio(el.querySelector('button'))));
          out['lien de la boucle'] = withProbe('<div class="var-loop-source"><span>x</span><button type="button" class="var-loop-link">Modifier</button></div>', el => round2(textRatio(el.querySelector('button'))));
          return out;
        });
        const bad = failing(byTheme, 4.5);
        return { pass: bad.length === 0 && !!row && !!cci, notes: JSON.stringify({ bad, row: !!row, cci: !!cci, byTheme }) };
      } finally {
        if (row) { if (savedRow === null) row.removeAttribute('aria-selected'); else row.setAttribute('aria-selected', savedRow); }
        if (cci && !savedCci) cci.classList.remove('is-active');
        if (!wasOpen) trigger.click();
      }
    },
  });

  cases.push({
    id: 'contrast_gallery_card_chips_reach_4_5_on_their_grey_in_light_and_dark',
    description: 'Puces d’étiquettes des cartes de la galerie (10,5 px sur fond gris) : 4,5:1 au moins en clair et en sombre',
    run: async () => {
      const modal = document.getElementById('template-gallery-modal');
      document.getElementById('v2-btn-new-from-template').click();
      const t0 = Date.now();
      while (Date.now() - t0 < 5000 && !document.querySelector('#tpl-gallery-grid .tpl-gallery-card-tags span')) await new Promise(r => setTimeout(r, 40));
      try {
        const chips = Array.from(document.querySelectorAll('#tpl-gallery-grid .tpl-gallery-card-tags span'));
        const byTheme = inBothThemes(() => {
          const values = chips.map(c => round2(textRatio(c)));
          return { 'puce la moins contrastée': Math.min.apply(null, values), 'nombre de puces': chips.length };
        });
        const bad = failing({ light: { 'puce la moins contrastée': byTheme.light['puce la moins contrastée'] }, dark: { 'puce la moins contrastée': byTheme.dark['puce la moins contrastée'] } }, 4.5);
        return { pass: bad.length === 0 && chips.length >= 4, notes: JSON.stringify({ bad, byTheme }) };
      } finally {
        const close = document.getElementById('tpl-gallery-close');
        if (close) close.click();
        if (modal) modal.style.display = 'none';
      }
    },
  });

  // Zones d'en-tête / pied de page : le survol (:hover) ne se joue pas depuis la page, donc on lit ce que la règle de survol déclare dans la feuille de
  // style (fond, couleur) et on le fait calculer par le navigateur, posé sur la vraie page blanche comme le fait la zone.
  function declaredOnHover(selectorTail, prop) {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = Array.from(sheet.cssRules); } catch (e) { continue; }
      for (const rule of rules) {
        if (!rule.selectorText || !rule.selectorText.endsWith(selectorTail)) continue;
        const value = rule.style.getPropertyValue(prop);
        if (value) return value;
      }
    }
    return null;
  }
  const paperSheet = () => document.querySelector('#editor-container .v2-page-sheet');
  // Page blanche de l'éditeur (le fond blanc du `.v2-page-sheet` réel, dans les deux thèmes) ; à défaut, une page blanche fabriquée.
  function onPaper(markup, fn) {
    const sheet = paperSheet();
    const host = document.createElement('div');
    host.innerHTML = markup;
    if (!sheet) host.style.background = '#fff';
    (sheet || document.body).appendChild(host);
    try { return fn(host.firstElementChild); } finally { host.remove(); }
  }
  function computedFromDeclaration(prop, value) {
    return onPaper('<div style="position:absolute;width:1px;height:1px"></div>', probe => {
      probe.style.setProperty(prop, value);
      const cs = getComputedStyle(probe);
      return parseColor(prop === 'color' ? cs.color : cs.backgroundColor);
    });
  }
  function hoverBand(selectorTail) {
    const value = declaredOnHover(selectorTail, 'background');
    const band = value && computedFromDeclaration('background', value);
    return band ? over(band, onPaper('<div></div>', backgroundOf)) : null;
  }

  cases.push({
    id: 'contrast_header_footer_ghost_text_reaches_4_5_on_the_band_the_hovered_zone_paints',
    description: '« Ajouter un en-tête / pied de page » (texte fantôme d’une zone vide, visible au survol) : 4,5:1 au moins sur le fond teinté que la zone prend au survol, en clair et en sombre',
    run: async () => {
      const byTheme = inBothThemes(() => {
        const band = hoverBand('.v2-hf-zone-empty:hover');
        const ghost = withProbe('<span class="v2-hf-zone-ghost"><span aria-hidden="true">+</span> Ajouter un en-tête</span>', el => colorOf(el));
        return { 'texte fantôme sur le fond de survol': band ? round2(ratio(over(ghost, band), band)) : 0 };
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  cases.push({
    id: 'contrast_faint_text_on_the_white_paper_reaches_4_5_at_rest_and_on_the_hovered_zone_in_light_and_dark',
    description: 'Texte discret posé sur la page blanche (texte d’attente de l’éditeur vide, contenu d’un en-tête ou d’un pied rempli, tâche cochée de la Lecture) : 4,5:1 au moins, y compris au survol de la zone teintée ; la page reste blanche en sombre',
    run: async () => {
      const byTheme = inBothThemes(() => {
        const out = {};
        out['texte d’attente de l’éditeur vide'] = onPaper('<div class="tiptap"><p class="is-editor-empty" data-placeholder="x"></p></div>', el => round2(textRatio(el.firstElementChild, '::before')));
        out['tâche cochée de la Lecture'] = onPaper('<div class="reader-content"><ul data-type="taskList"><li data-checked="true"><div>x</div></li></ul></div>', el => round2(textRatio(el.querySelector('li > div'))));
        const body = onPaper('<div class="v2-hf-zone-body">x</div>', el => ({ rest: round2(textRatio(el)), color: colorOf(el) }));
        out['contenu d’un en-tête rempli, au repos'] = body.rest;
        // Au survol : le fond de la règle de survol, et la couleur que sa règle déclare pour le contenu (à défaut, celle du repos).
        const band = hoverBand('.v2-hf-zone-filled:hover');
        const declared = declaredOnHover('.v2-hf-zone-filled:hover .v2-hf-zone-body', 'color');
        const hoverColor = (declared && computedFromDeclaration('color', declared)) || body.color;
        out['contenu d’un en-tête rempli, au survol'] = band ? round2(ratio(over(hoverColor, band), band)) : 0;
        return out;
      });
      const bad = failing(byTheme, 4.5);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  // Texte inséré et texte supprimé du suivi des modifications (demande d'Antoine du 01/10, carte « Rendre lisibles les couleurs du texte inséré et supprimé du suivi ? », réponse
  // « Aligner ») : les teintes des cases d'une colonne suivie (css/track-changes.css), écrites en dur donc les mêmes en clair et en sombre - la page reste blanche en thème
  // sombre. Avant : le texte supprimé prenait --danger sur --danger-soft (3,7:1 en clair) et, en sombre, la pastille foncée de ces deux jetons sur la page blanche.
  cases.push({
    id: 'contrast_track_changes_text_reaches_4_5_with_the_column_tints_in_light_and_dark',
    description: 'Suivi des modifications : le texte inséré (vert) et le texte supprimé (rouge, barré) ont 4,5:1 au moins sur leur fond, les teintes d\'une colonne suivie, identiques en clair et en sombre (pas de pastille foncée sur la page blanche)',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Garder <ins data-id="1">ajout</ins> et <del data-id="2">retrait</del> fin.</p>');
      await h.sleep(150);
      const ins = document.querySelector('.tiptap ins[data-id]');
      const del = document.querySelector('.tiptap del[data-id]');
      if (!ins || !del) return { pass: false, notes: 'marques introuvables dans l\'éditeur : ins=' + !!ins + ' del=' + !!del };
      const paint = el => { const cs = getComputedStyle(el); return cs.color + ' sur ' + cs.backgroundColor + (cs.textDecorationLine.indexOf('line-through') !== -1 ? ' barré' : ''); };
      const byTheme = inBothThemes(() => ({ 'texte inséré': round2(textRatio(ins)), 'texte supprimé': round2(textRatio(del)) }));
      const painted = inBothThemes(() => ({ ins: paint(ins), del: paint(del) }));
      const bad = failing(byTheme, 4.5);
      const sameInBoth = painted.light.ins === painted.dark.ins && painted.light.del === painted.dark.del;
      const columnTints = painted.light.ins === 'rgb(20, 108, 72) sur rgb(229, 246, 238)' && painted.light.del === 'rgb(180, 35, 24) sur rgb(251, 233, 233) barré';
      return { pass: bad.length === 0 && sameInBoth && columnTints, notes: JSON.stringify({ bad, sameInBoth, columnTints, byTheme, painted }) };
    },
  });

  cases.push({
    id: 'contrast_chosen_bubbles_stand_out_from_plain_ones_and_keep_4_5_text_in_light_and_dark',
    description: 'Bulle choisie par un clic (variable, calcul et leur état cassé ; demande d’Antoine du 01/10 : un retour visuel pour confirmer qu’on peut copier) : fond plus soutenu que celui d’une bulle ordinaire (1,2:1 au moins) et texte à 4,5:1 au moins, en clair et en sombre',
    run: async () => {
      const kinds = [['variable', 'var-badge'], ['variable cassée', 'var-badge var-badge-broken'], ['calcul', 'calc-badge'], ['calcul cassé', 'calc-badge calc-badge-broken']];
      // La page du document y est blanche dans les deux thèmes : un fond de bulle écrit en dur ne change pas avec lui, seule la barre autour change. Les bulles sont posées dans un `.tiptap`
      // fabriqué (les règles sont écrites `.tiptap .var-badge…`) : la vraie sélection d'un nœud par ProseMirror est mesurée à la souris, par `calcMouse`.
      const markup = '<div class="tiptap"><p>' + kinds.map(([name, cls]) => `<span class="${cls}" data-probe="${name}">x</span> <span class="${cls} ProseMirror-selectednode" data-probe="${name} choisie">x</span>`).join(' ') + '</p></div>';
      return withProbe(markup, root => {
        const byTheme = inBothThemes(() => {
          const text = {}, standsOut = {};
          kinds.forEach(([name]) => {
            const plain = root.querySelector(`[data-probe="${name}"]`), chosen = root.querySelector(`[data-probe="${name} choisie"]`);
            text[name + ' choisie : texte'] = round2(textRatio(chosen));
            standsOut[name + ' : fond choisi / fond ordinaire'] = round2(ratio(backgroundOf(chosen), backgroundOf(plain)));
          });
          return { text, standsOut };
        });
        const badText = failing({ light: byTheme.light.text, dark: byTheme.dark.text }, 4.5);
        const notVisible = failing({ light: byTheme.light.standsOut, dark: byTheme.dark.standsOut }, 1.2);
        return { pass: badText.length === 0 && notVisible.length === 0, notes: JSON.stringify({ badText, notVisible, byTheme }) };
      });
    },
  });

  // Cadre d'une image liée à une colonne (css/editor-v2.css) et cadre d'un QR code dont le texte contient une colonne (css/qr-code.css) : le texte « #Table.Colonne » est posé sur le fond gris
  // du cadre (--surface-sunken). Avant : il était en --text-faint (#667085), 4,39:1 sur ce gris en clair. Réponse d'Antoine du 02/10 à la carte « Foncer le texte gris des cadres d'image de
  // variable ? » : « Foncer ce texte ». L'icône du cadre, un tracé et non du texte, garde le gris (3:1 au moins, WCAG 1.4.11). Les cadres sont posés dans un `.tiptap` fabriqué (les règles
  // sont écrites `.tiptap .editor-image-view…`) avec les classes que leur donne le NodeView de js/editor-nodes.js.
  cases.push({
    id: 'contrast_variable_image_frame_label_reaches_4_5_on_the_frame_grey_and_its_icon_keeps_3_to_1_in_light_and_dark',
    description: 'Cadre d\'une image de variable et cadre d\'un QR code à colonne : le texte « #Table.Colonne » a 4,5:1 au moins sur le gris du cadre, en clair et en sombre (il n\'avait que 4,39:1 en clair), et l\'icône garde un gris à 3:1 au moins',
    run: async () => {
      const markup = '<div class="tiptap">'
        + '<div class="editor-image-view editor-image-var-placeholder" data-probe="image de variable"><span class="editor-image-var-label">#Table.Colonne</span></div>'
        + '<div class="editor-image-view editor-image-var-placeholder editor-image-qr-placeholder" data-probe="QR code"><span class="editor-image-var-label">https://exemple.fr/#Table.Colonne</span></div></div>';
      return withProbe(markup, root => {
        const byTheme = inBothThemes(() => {
          const text = {}, icon = {};
          for (const kind of ['image de variable', 'QR code']) {
            const label = root.querySelector(`[data-probe="${kind}"] .editor-image-var-label`);
            text[kind + ' : texte'] = round2(textRatio(label));
            icon[kind + ' : icône'] = round2(textRatio(label, '::before'));
          }
          return { text, icon };
        });
        const badText = failing({ light: byTheme.light.text, dark: byTheme.dark.text }, 4.5);
        const badIcon = failing({ light: byTheme.light.icon, dark: byTheme.dark.icon }, 3);
        return { pass: badText.length === 0 && badIcon.length === 0, notes: JSON.stringify({ badText, badIcon, byTheme }) };
      });
    },
  });

  // Gris des textes secondaires et rouge des textes d'erreur (contrôle complet du 03/10, réponse d'Antoine « Tout corriger » à la carte « Corriger le test périmé et les deux contrastes du thème clair ? ») :
  // un seul correctif au jeton, pas une teinte par fenêtre. Avant : --text-muted et --text-faint (#667085) ne faisaient que 4,39:1 sur --surface-sunken, le gris des cadres des fenêtres Condition et
  // Boucle, et --danger (#d84343) 4,37:1 sur blanc dès qu'une règle le posait en couleur de TEXTE. Le texte rouge prend --danger-ink ; --danger reste aux bordures, filets et icônes (3:1 suffit).
  const tokenColor = name => withProbe('<i style="display:block;color:var(' + name + ')"></i>', el => parseColor(getComputedStyle(el).color));
  const tokenFill = name => withProbe('<i style="display:block;background:var(' + name + ')"></i>', el => parseColor(getComputedStyle(el).backgroundColor));

  cases.push({
    id: 'contrast_secondary_grey_and_red_text_tokens_reach_4_5_on_every_surface_in_light_and_dark',
    description: 'Jetons de texte secondaire (--text-muted, --text-faint) et de texte rouge (--danger-ink) : 4,5:1 au moins sur chacun des fonds du thème (page, surface, cadre gris, accent doux, danger doux, réussite douce), en clair et en sombre ; --danger-ink existe, est plus foncé que --danger en clair et le même en sombre ; le gris du papier (--paper-text-faint) reste #667085, celui du PDF',
    run: async () => {
      const surfaces = ['--bg', '--surface', '--surface-sunken', '--accent-soft', '--danger-soft', '--good-soft'];
      const tokens = {};
      const byTheme = inBothThemes(theme => {
        const out = {};
        for (const fg of ['--text-muted', '--text-faint', '--danger-ink']) {
          const color = tokenColor(fg);
          for (const bg of surfaces) out[fg + ' sur ' + bg] = round2(ratio(color, tokenFill(bg)));
        }
        tokens[theme] = {
          declared: getComputedStyle(html).getPropertyValue('--danger-ink').trim(),
          ink: tokenColor('--danger-ink'), danger: tokenColor('--danger'), paper: tokenColor('--paper-text-faint'),
        };
        return out;
      });
      const bad = failing(byTheme, 4.5);
      const same = (a, b) => Math.round(a.r) === Math.round(b.r) && Math.round(a.g) === Math.round(b.g) && Math.round(a.b) === Math.round(b.b);
      // Sans --danger-ink, `color: var(--danger-ink)` hérite du texte courant : la mesure passerait à tort. D'où le contrôle qu'il est déclaré, dans les deux thèmes.
      const inkDeclared = !!tokens.light.declared && !!tokens.dark.declared;
      const inkDarkerInLight = lum(tokens.light.ink) < lum(tokens.light.danger);
      const inkIsDangerInDark = same(tokens.dark.ink, tokens.dark.danger);
      const paperGreyKept = same(tokens.light.paper, { r: 102, g: 112, b: 133 }) && same(tokens.dark.paper, { r: 102, g: 112, b: 133 });
      return {
        pass: bad.length === 0 && inkDeclared && inkDarkerInLight && inkIsDangerInDark && paperGreyKept,
        notes: JSON.stringify({ bad, inkDeclared, inkDarkerInLight, inkIsDangerInDark, paperGreyKept, byTheme }),
      };
    },
  });

  cases.push({
    id: 'contrast_grey_hints_of_the_condition_and_loop_windows_reach_4_5_on_the_grey_frames_in_light_and_dark',
    description: 'Textes gris des fenêtres Condition et Boucle posés sur le gris des cadres (« Si », « + Ajouter une condition », lien de la table liée, ligne d’aperçu « Choisissez une colonne… » / « Dans « Contrats » : 1 ligne sur 2… ») : 4,5:1 au moins, en clair et en sombre (ils n’avaient que 4,39:1 en clair)',
    run: async () => {
      // Les classes et les fonds sont ceux des fenêtres : le cadre des règles (.var-condition-rules) et la ligne d'aperçu (.var-condition-debug-line, reprise par la fenêtre Boucle) sont en --surface-sunken.
      const markup = '<div>'
        + '<div class="var-condition-rules"><span class="macro-rule-connector">Si</span><div class="var-condition-link-hint">ligne de « Clients » trouvée via Contrats.Client</div><button type="button" class="var-condition-add">+ Ajouter une condition</button></div>'
        + '<div class="var-condition-debug"><div class="var-condition-debug-line"><span>Choisissez une colonne pour voir l’aperçu.</span></div></div>'
        + '</div>';
      return withProbe(markup, root => {
        const byTheme = inBothThemes(() => ({
          '« Si »': round2(textRatio(root.querySelector('.macro-rule-connector'))),
          'lien de la table liée': round2(textRatio(root.querySelector('.var-condition-link-hint'))),
          '+ Ajouter une condition': round2(textRatio(root.querySelector('.var-condition-add'))),
          'ligne d’aperçu': round2(textRatio(root.querySelector('.var-condition-debug-line span'))),
        }));
        const bad = failing(byTheme, 4.5);
        return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
      });
    },
  });

  cases.push({
    id: 'contrast_compare_button_of_the_condition_window_keeps_4_5_glyph_and_3_to_1_ring_at_rest_and_pressed_in_light_and_dark',
    description: 'Bouton « autre colonne » du champ Valeur de la fenêtre de condition : son dessin à 4,5:1 au moins sur le fond du bouton, au repos comme enfoncé, son anneau de focus à 3:1 au moins contre le cadre des règles qui l’entoure, en clair et en sombre, et une cible d’au moins 24 x 24 px',
    run: async () => {
      // Les classes sont celles de la fenêtre : le cadre des règles (--surface-sunken) pose la ligne, le bouton a son propre fond (--surface, ou --accent-soft une fois enfoncé).
      const markup = '<div class="pp-modal-box modal-content"><div class="var-condition-rules"><div class="macro-rule-row"><span class="macro-rule-value-slot has-compare">'
        + '<button type="button" class="macro-rule-compare" aria-pressed="false"></button><button type="button" class="macro-rule-compare is-on" aria-pressed="true"></button>'
        + '</span></div></div></div>';
      return withProbe(markup, root => {
        const [rest, pressed] = root.querySelectorAll('.macro-rule-compare');
        const ring = el => {
          el.focus();
          const color = parseColor(getComputedStyle(el).outlineColor);
          const surround = backgroundOf(el.parentElement);
          return el.matches(':focus-visible') && color ? round2(ratio(over(color, surround), surround)) : 0;
        };
        const glyphs = inBothThemes(() => ({ 'au repos': round2(textRatio(rest)), 'enfoncé': round2(textRatio(pressed)) }));
        const rings = inBothThemes(() => ({ 'au repos': ring(rest), 'enfoncé': ring(pressed) }));
        const bad = failing(glyphs, 4.5).map(b => 'dessin ' + b).concat(failing(rings, 3).map(b => 'anneau ' + b));
        // Cible d'au moins 24 x 24 px (WCAG 2.2, 2.5.8), mesurée sur le bouton tel que la feuille de style le dessine.
        const size = [rest, pressed].map(el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
        if (size.some(([w, h]) => w < 24 || h < 24)) bad.push('cible ' + JSON.stringify(size));
        return { pass: bad.length === 0, notes: JSON.stringify({ bad, glyphs, rings, size }) };
      });
    },
  });

  cases.push({
    id: 'contrast_red_text_of_the_status_error_remove_buttons_counter_and_warnings_reaches_4_5_in_light_and_dark',
    description: 'Texte rouge (message d’erreur de la barre, « Retirer la condition », « Supprimer » des bulles de note et de commentaire, compteur d’email dépassé, avertissement de colonne du macro-modèle, ligne « accès verrouillé » de Réglages) : 4,5:1 au moins sur son fond, en clair et en sombre (--danger n’avait que 4,37:1 en clair)',
    run: async () => {
      const status = document.getElementById('status-msg');
      const counter = document.getElementById('v2-email-char-counter');
      const locked = document.getElementById('settings-access-locked');
      const saved = { text: status.textContent, cls: status.className, counterOver: counter.classList.contains('is-over-limit') };
      // Fenêtre : le texte posé sur --surface (.modal-content) ; bulles : #v2-footnote-popup / #v2-comment-popup (les règles sont écrites avec l'id) ; macro-modèle : le cadre d'une règle (--surface-sunken).
      const markup = '<div>'
        + '<div class="pp-modal-box modal-content"><div class="var-modal-actions"><button type="button" class="var-modal-danger">Retirer la condition</button></div></div>'
        + '<div id="v2-footnote-popup"><div class="v2-footnote-popup-actions"><button type="button" class="v2-footnote-popup-delete">Supprimer</button></div></div>'
        + '<div id="v2-comment-popup"><div class="v2-comment-popup-actions"><button type="button" class="v2-comment-popup-delete">Supprimer</button></div></div>'
        + '<div class="macro-slot-card"><div class="macro-rule"><span class="macro-rule-column-type is-warning">⚠ absente de la ligne affichée</span></div></div>'
        + '</div>';
      try {
        status.textContent = 'Modèle non enregistré : donnez-lui un nom puis cliquez sur Enregistrer.';
        status.className = 'error-msg';
        counter.classList.add('is-over-limit');
        return withProbe(markup, root => {
          const byTheme = inBothThemes(() => ({
            'message d’erreur de la barre': round2(textRatio(status)),
            '« Retirer la condition »': round2(textRatio(root.querySelector('.var-modal-danger'))),
            '« Supprimer » de la note de bas de page': round2(textRatio(root.querySelector('.v2-footnote-popup-delete'))),
            '« Supprimer » du commentaire': round2(textRatio(root.querySelector('.v2-comment-popup-delete'))),
            'compteur d’email dépassé': round2(textRatio(counter)),
            'avertissement de colonne du macro-modèle': round2(textRatio(root.querySelector('.macro-rule-column-type'))),
            'ligne « accès verrouillé »': round2(textRatio(locked)),
          }));
          const bad = failing(byTheme, 4.5);
          return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
        });
      } finally {
        status.textContent = saved.text;
        status.className = saved.cls;
        if (!saved.counterOver) counter.classList.remove('is-over-limit');
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.contrast = cases;
})();
