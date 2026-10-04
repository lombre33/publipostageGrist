// Suite "readerGuide" - le guide de la Lecture sans ligne (js/reader-guide.js, css/reader-guide.css, img/reader-guide/), demande d'Antoine du 2026-10-04 : « en mode lecture, quand le
// widget n'a pas le select by de configuré, il affiche "Aucune ligne sélectionnée" : il faudrait guider l'utilisateur proprement sur ce qu'il faut faire, avec du texte et des captures
// d'écran, au lieu de ce message ». Ici : ce que le guide montre selon le lien « Sélectionner par » (settings.linking de grist.onOptions, js/grist-api.js:getLinkState), les captures dans
// les deux langues, sa mise à jour sans recharger, sa disparition quand une ligne arrive, le clic sur une capture, les contrastes en clair et en sombre - DANS la page.
// dev-tests/verify-reader-guide-mouse.mjs le mesure à 700x400 à la vraie souris (défilement à la molette, clic sur une vraie capture, toutes les étapes atteignables).
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TABLE = 'RgFactures';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const reader = () => document.getElementById('reader-container');
  const guide = () => reader().querySelector(':scope > .reader-guide');
  const message = () => reader().querySelector(':scope > .reader-empty');
  const steps = () => Array.from(reader().querySelectorAll('.reader-guide-step'));
  const imgs = () => Array.from(reader().querySelectorAll('.reader-guide-shot img'));

  // Ce que Grist transmet au widget par onOptions : `asTarget` null (aucun lien), une chaîne (relié), ou rien du tout (version de Grist sans `linking`).
  function fireLinking(linking) {
    const settings = { accessLevel: stub().state.accessLevel };
    if (linking !== undefined) settings.linking = linking;
    stub().state.optionsCallback(stub().state.options, settings);
  }
  const UNLINKED = { asTarget: null, asSource: false };
  const LINKED = { asTarget: 'Cursor:Same-Table', asSource: false };

  // La Lecture sans ligne, rendue comme le fait js/main.js:renderReader quand Grist n'a rien sélectionné.
  async function showEmptyReader() {
    reader().style.display = 'block';
    await ReaderMode.render('<p>Modèle</p>', TABLE, null, NO_HF);
  }
  async function setup(h, linking, lang) {
    await h.resetEditor();
    I18n.setLang(lang || 'fr');
    fireLinking(linking);
    await showEmptyReader();
  }
  async function finish() {
    I18n.setLang('fr');
    fireLinking({});
    const r = reader();
    r.style.display = 'none';
    r.innerHTML = '';
  }
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  cases.push({
    id: 'reader_guide_replaces_the_empty_message_when_the_widget_is_not_linked',
    description: 'Sans « Sélectionner par », la Lecture sans ligne montre le guide en trois étapes (chacune avec son titre, ses repères numérotés et sa capture) à la place de « Aucune ligne sélectionnée »',
    run: async (h) => {
      await setup(h, UNLINKED);
      const got = {
        guide: !!guide(),
        message: !!message(),
        oldTitle: reader().textContent.includes('Aucune ligne sélectionnée'),
        title: text(reader().querySelector('.reader-guide-title')),
        steps: steps().length,
        eyebrows: steps().map(s => text(s.querySelector('.reader-guide-eyebrow'))),
        marks: steps().map(s => s.querySelectorAll('.reader-guide-mark-item').length),
        shots: steps().map(s => s.querySelectorAll('.reader-guide-shot img').length),
        unsure: !!reader().querySelector('.reader-guide-unsure'),
      };
      await finish();
      const pass = got.guide && !got.message && !got.oldTitle && got.title === 'Reliez ce widget à votre tableau' && got.steps === 3
        && got.eyebrows.join('|') === 'Étape 1|Étape 2|Étape 3' && got.marks.join(',') === '3,3,2' && got.shots.join(',') === '1,1,1' && !got.unsure;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'reader_guide_shots_load_in_french_and_english_at_double_resolution',
    description: 'Chaque étape montre sa capture dans la langue de l\'interface (fr-1 à fr-3, en-1 à en-3) : le fichier se charge, son texte alternatif est écrit, sa taille réelle est le double de celle que lit le guide (écrans à forte densité)',
    run: async (h) => {
      const out = {};
      for (const lang of ['fr', 'en']) {
        await setup(h, UNLINKED, lang);
        await waitFor(() => imgs().length === 3 && imgs().every(i => i.complete), 5000);
        out[lang] = imgs().map(i => ({
          file: (i.getAttribute('src') || '').replace(/^.*\//, '').replace(/\?.*$/, ''),
          loaded: i.complete && i.naturalWidth > 0,
          alt: i.alt.length > 20,
          doubled: i.naturalWidth === 2 * Number(i.style.getPropertyValue('--shot-w')),
        }));
      }
      await finish();
      const ok = (lang) => out[lang].length === 3 && out[lang].every((s, i) => s.file === lang + '-' + (i + 1) + '.png' && s.loaded && s.alt && s.doubled);
      return { pass: ok('fr') && ok('en'), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'reader_guide_texts_follow_the_interface_language_live',
    description: 'Le guide est écrit dans la langue de l\'interface (libellés de Grist compris : « Ajouter une vue à la page » / « Add widget to page ») et se réécrit seul quand la langue change, captures comprises',
    run: async (h) => {
      await setup(h, UNLINKED, 'fr');
      const fr = { title: text(reader().querySelector('.reader-guide-title')), lead: text(reader().querySelector('.reader-guide-lead')), src: imgs()[0].getAttribute('src') };
      I18n.setLang('en');
      await sleep(60);
      const en = { title: text(reader().querySelector('.reader-guide-title')), lead: text(reader().querySelector('.reader-guide-lead')), src: imgs()[0].getAttribute('src'), all: text(guide()) };
      I18n.setLang('fr');
      await sleep(60);
      const back = text(reader().querySelector('.reader-guide-title'));
      await finish();
      const frenchLeft = /Reliez|Étape|Cliquez|Choisissez|tableau/.test(en.all);
      const pass = fr.title === 'Reliez ce widget à votre tableau' && /Ajouter une vue à la page/.test(fr.lead) && /fr-1\.png/.test(fr.src)
        && en.title === 'Link this widget to your table' && /Add widget to page/.test(en.lead) && /en-1\.png/.test(en.src) && !frenchLeft && back === fr.title;
      return { pass, notes: JSON.stringify({ fr, en: Object.assign({}, en, { all: undefined }), frenchLeft, back }) };
    },
  });

  cases.push({
    id: 'reader_guide_keeps_the_short_message_when_the_widget_is_already_linked',
    description: 'Un widget déjà relié n\'a rien à régler, seulement un clic à faire : la Lecture sans ligne garde son court message (« Aucune ligne sélectionnée » et son indication), sans guide',
    run: async (h) => {
      await setup(h, LINKED);
      const got = { guide: !!guide(), message: !!message(), title: text(reader().querySelector('.reader-empty-title')), hint: text(reader().querySelector('.reader-empty-hint')) };
      await finish();
      return { pass: !got.guide && got.message && got.title === 'Aucune ligne sélectionnée' && /Sélectionnez une ligne/.test(got.hint), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'reader_guide_follows_the_link_live_without_reloading',
    description: 'Dès que Grist renvoie les options du widget avec un autre lien (« Sélectionner par » choisi, puis vidé), la Lecture sans ligne passe du guide au court message et revient, sans rendu demandé',
    run: async (h) => {
      await setup(h, UNLINKED);
      const seen = [];
      const note = (label) => seen.push(label + ':' + (guide() ? 'guide' : message() ? 'message' : 'rien'));
      note('start');
      fireLinking(LINKED);
      await sleep(60);
      note('linked');
      fireLinking(UNLINKED);
      await sleep(60);
      note('unlinked');
      fireLinking(LINKED);
      fireLinking(LINKED); // le même état renvoyé : rien ne change
      await sleep(60);
      note('linkedTwice');
      const state = GristAPI.getLinkState();
      await finish();
      return { pass: seen.join(' ') === 'start:guide linked:message unlinked:guide linkedTwice:message' && state === 'linked', notes: JSON.stringify({ seen, state }) };
    },
  });

  cases.push({
    id: 'reader_guide_unknown_link_keeps_the_guide_and_says_what_to_do_if_already_linked',
    description: 'Une version de Grist qui ne dit pas le lien (settings sans `linking`, ou `linking` vide) n\'est jamais prise pour « relié » : le guide reste, avec en dernière ligne quoi faire si le widget l\'est déjà ; l\'état « non relié » connu n\'a pas cette ligne',
    run: async (h) => {
      const got = {};
      await setup(h, undefined);
      got.absent = { state: GristAPI.getLinkState(), guide: !!guide(), unsure: text(reader().querySelector('.reader-guide-unsure')) };
      fireLinking({});
      await sleep(40);
      got.empty = { state: GristAPI.getLinkState(), guide: !!guide(), unsure: !!reader().querySelector('.reader-guide-unsure') };
      fireLinking(UNLINKED);
      await sleep(60);
      got.unlinked = { state: GristAPI.getLinkState(), unsure: !!reader().querySelector('.reader-guide-unsure') };
      fireLinking({ asTarget: '', asSource: false });
      await sleep(60);
      got.blank = { state: GristAPI.getLinkState(), guide: !!guide() };
      await finish();
      const pass = got.absent.state === 'unknown' && got.absent.guide && /déjà relié/.test(got.absent.unsure)
        && got.empty.state === 'unknown' && got.empty.guide && got.empty.unsure
        && got.unlinked.state === 'unlinked' && !got.unlinked.unsure
        && got.blank.state === 'unknown' && got.blank.guide;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'reader_guide_gives_way_to_the_document_when_a_row_arrives_and_does_not_come_back',
    description: 'Au vrai passage en Lecture sans ligne le guide s\'affiche ; une ligne qui arrive (clic dans le tableau relié) le remplace par le document, et un changement de lien ou de langue ne le fait pas revenir',
    run: async (h) => {
      await h.resetEditor();
      I18n.setLang('fr');
      stub().setVariables(TABLE, { Client: 'Text' });
      stub().setRows(TABLE, [{ id: 1, Client: 'Dupont' }]);
      await GristAPI.refreshSchema();
      fireLinking(UNLINKED);
      Editor.setHTML('<p>Facture de <span class="var-badge" data-table="' + TABLE + '" data-column="Client" data-key="' + TABLE + '.Client"></span></p>');
      await sleep(300);
      document.getElementById('btn-mode-read').click();
      const showsGuide = await waitFor(() => !!guide(), 4000);
      stub().fireRecord({ id: 1, Client: 'Dupont' }, TABLE);
      const showsDocument = await waitFor(() => !guide() && !message() && text(reader().querySelector('.reader-content')).includes('Dupont'), 5000);
      fireLinking(UNLINKED);
      fireLinking(LINKED);
      fireLinking(UNLINKED);
      I18n.setLang('en');
      I18n.setLang('fr');
      await sleep(150);
      const stillDocument = !guide() && !message() && text(reader().querySelector('.reader-content')).includes('Dupont');
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      await finish();
      return { pass: showsGuide && showsDocument && stillDocument, notes: JSON.stringify({ showsGuide, showsDocument, stillDocument }) };
    },
  });

  cases.push({
    id: 'reader_guide_shot_is_a_button_that_zooms_to_full_size_and_back',
    description: 'La capture d\'une étape est un bouton (clavier compris) : un clic l\'affiche à sa taille réelle dans sa carte (aria-pressed, info-bulle), un second la rétrécit à 66 %, sans toucher aux autres étapes',
    run: async (h) => {
      await setup(h, UNLINKED);
      await waitFor(() => imgs().every(i => i.complete && i.naturalWidth > 0), 5000);
      const first = reader().querySelector('.reader-guide-shot');
      const second = steps()[1].querySelector('.reader-guide-shot');
      const natural = imgs()[0].naturalWidth / 2;
      const width = () => Math.round(imgs()[0].getBoundingClientRect().width);
      const rest = { tag: first.tagName, type: first.type, pressed: first.getAttribute('aria-pressed'), title: first.title, width: width(), zoomed: steps()[0].classList.contains('is-zoomed') };
      first.click();
      await sleep(60);
      const open = { pressed: first.getAttribute('aria-pressed'), title: first.title, width: width(), zoomed: steps()[0].classList.contains('is-zoomed'), others: steps().slice(1).map(s => s.classList.contains('is-zoomed')) };
      // Le clavier : un bouton se déclenche par Entrée ou Espace (le navigateur en fait un clic) ; ici on vérifie qu'il est atteignable (pas de tabindex négatif).
      const tabbable = first.tabIndex >= 0 && second.tabIndex >= 0;
      first.click();
      await sleep(60);
      const back = { pressed: first.getAttribute('aria-pressed'), title: first.title, width: width(), zoomed: steps()[0].classList.contains('is-zoomed') };
      await finish();
      const fits = Math.abs(rest.width - Math.round(natural * 0.66)) <= 2 && Math.abs(open.width - natural) <= 2 && Math.abs(back.width - rest.width) <= 1;
      const pass = rest.tag === 'BUTTON' && rest.type === 'button' && rest.pressed === 'false' && rest.title === 'Cliquer pour agrandir la capture' && !rest.zoomed
        && open.pressed === 'true' && open.title === 'Cliquer pour réduire la capture' && open.zoomed && open.others.every(z => !z)
        && back.pressed === 'false' && back.title === rest.title && !back.zoomed && tabbable && fits;
      return { pass, notes: JSON.stringify({ natural, rest, open, back, tabbable }) };
    },
  });

  // --- Contrastes : la couleur calculée de chaque texte composée sur son vrai fond (le plan de travail de la Lecture, ou la carte), en clair puis en sombre.
  function parseColor(str) {
    const srgb = String(str).match(/^color\(srgb\s+([^)]+)\)/);
    if (srgb) { const q = srgb[1].split(/[\s\/]+/).filter(Boolean).map(Number); return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 }; }
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
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
  const textRatio = el => { const bg = backgroundOf(el); return Math.round(ratio(over(parseColor(getComputedStyle(el).color), bg), bg) * 100) / 100; };

  cases.push({
    id: 'reader_guide_texts_reach_4_5_on_their_backgrounds_in_light_and_dark',
    description: 'Le guide passe les jetons de contraste : titre, introduction, « Étape n », titres, phrases, lignes de repères et dernière ligne à 4,5:1 au moins sur leur fond, chiffre blanc des ronds sur --accent-solid, en clair et en sombre, avec l\'aperçu A4 allumé (plan de travail) comme coupé (conteneur blanc) : tout le texte est posé sur la carte, jamais sur le conteneur',
    run: async (h) => {
      await setup(h, undefined); // « inconnu » : la dernière ligne est là elle aussi
      const html = document.documentElement;
      const before = html.getAttribute('data-theme');
      // Transitions coupées le temps de la mesure : le fond du plan de travail et les couleurs en transition rendent encore la valeur du thème d'avant juste après le changement.
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noMotion);
      const a4Before = reader().classList.contains('a4-preview');
      const byTheme = {};
      try {
        // L'aperçu A4 allumé donne au conteneur de la Lecture le plan de travail (sombre en sombre), coupé il le laisse blanc : le texte du guide doit se lire dans les quatre cas.
        for (const a4 of [true, false]) {
          reader().classList.toggle('a4-preview', a4);
          for (const theme of ['light', 'dark']) {
            html.setAttribute('data-theme', theme);
            await sleep(50);
            const pick = sel => reader().querySelector(sel);
            byTheme[theme + (a4 ? '' : ' sans A4')] = {
              titre: textRatio(pick('.reader-guide-title')),
              introduction: textRatio(pick('.reader-guide-intro')),
              etape: textRatio(pick('.reader-guide-eyebrow')),
              titreEtape: textRatio(pick('.reader-guide-step-title')),
              phrase: textRatio(pick('.reader-guide-lead')),
              repere: textRatio(pick('.reader-guide-mark-text')),
              ronds: textRatio(pick('.reader-guide-mark')),
              derniereLigne: textRatio(pick('.reader-guide-unsure')),
            };
          }
        }
      } finally {
        if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
        reader().classList.toggle('a4-preview', a4Before);
        noMotion.remove();
      }
      await finish();
      const bad = [];
      for (const theme of Object.keys(byTheme)) for (const [name, value] of Object.entries(byTheme[theme])) if (!(value >= 4.5)) bad.push(theme + ' ' + name + ' ' + value);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.readerGuide = cases;
})();
