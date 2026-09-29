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
    run: async () => {
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.contrast = cases;
})();
