// Suite "browserPrint" - l'impression par le navigateur (js/print-export.js, css/print.css, ReaderMode.renderInto), la qualité « Impression navigateur » du bouton PDF : la Lecture,
// rendue dans un cadre caché et découpée en feuilles, que le navigateur imprime telle quelle (« même rendu que l'éditeur, la Lecture et le PDF classique », demande d'Antoine du 09/10).
// Ce que cette suite garde, dans le widget :
//  1) la ligne du menu « Qualité PDF » existe, s'appelle « Impression navigateur » (français et anglais) et se choisit ; les autres lignes du menu sont dans le groupe pdfLight ;
//  2) le cadre : srcdoc à bac à sable sans script, hors de l'écran, retiré à la fin de l'impression et au début de la suivante ;
//  3) la FIDÉLITÉ : une feuille par page de la Lecture, de la taille exacte de la page, le texte et les coutures aux mêmes endroits qu'en Lecture (écart nul à 0,05 px près), même
//     en paysage A5 ; `@page` dans le cadre seulement ; la vue « comme acceptée » sans teinte ; une image d'un autre site montrée dans l'impression sans être montrée dans la Lecture ;
//  4) une page de la Lecture plus haute qu'une feuille (liste plus longue que la place qui reste) : ce qui dépasse continue sur d'autres feuilles, coupé entre deux lignes, sans rien
//     perdre ni doubler ; un petit dépassement qui tient dans la marge du bas ne crée pas de feuille ;
//  5) le déroulement : la fenêtre du navigateur (`print`) s'ouvre une fois, le cadre reste jusqu'à `afterprint`, le nom proposé est celui du fichier, un document de plus de 60 pages est
//     refusé avant toute impression.
// Le vrai PDF qu'en tire Chromium (pages, taille, positions, pixels), le clic réel et la politique de sécurité sont dans dev-tests/verify-browser-print.mjs et verify-csp.mjs.
(function () {
  const cases = [];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const HF = {
    enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du document</p>', first: '' },
    footer: { default: '<p style="text-align:right">Page <span class="page-number-badge" data-format="n-slash-total">1</span></p>', first: '' },
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const bodyLines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const para = i => '<p>Paragraphe ' + i + ' : Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>';
  const items = n => Array.from({ length: n }, (_, i) => '<li><p>Élément ' + (i + 1) + ' de la liste : un texte assez long pour passer sur deux lignes dans la largeur de la page, avec quelques mots de plus pour en être sûr.</p></li>').join('');
  // Un document qui montre de tout (titres numérotés, paragraphes, tableau coloré, liste, citation, saut de page forcé) sur plusieurs pages.
  const sample = () => '<h1>Titre du courrier</h1>' + [1, 2, 3, 4, 5, 6].map(para).join('')
    + '<table><tr><th>Indicateur</th><th>Résultat</th></tr><tr><td style="background-color: #fde9d9">Taux de réalisation</td><td style="text-align:right">78 %</td></tr><tr><td>Satisfaction</td><td style="text-align:right">81 %</td></tr></table>'
    + '<ul><li>Mobilités douces</li><li>Végétalisation</li></ul><blockquote><p>Une citation qui montre la barre de gauche.</p></blockquote>'
    + [7, 8, 9, 10, 11, 12, 13, 14].map(para).join('') + '<div class="page-break-marker">Saut de page</div>' + '<h2>Seconde partie</h2>' + bodyLines(60);
  function restoreContainers() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  async function readAt(h, html, hf, layout) {
    PageLayout.setMarginsMm(null);
    if (layout) layout();
    h.setA4Preview(true);
    document.getElementById('reader-container').style.removeProperty('--pp-fit-zoom');
    await h.renderReaderMode(html, clone(hf));
    await h.sleep(300);
    return document.getElementById('reader-container');
  }
  const framePresent = () => !!document.getElementById('pp-print-frame');
  const overlayBands = root => Array.from(root.querySelectorAll('.v2-pagination-overlay > .v2-page-band'));
  // Une boîte par ligne de texte du contenu, depuis son coin haut gauche, en pixels de mise en page (ce que la Lecture lit pour paginer).
  function lineBoxes(content, zoom) {
    const origin = content.getBoundingClientRect();
    const range = content.ownerDocument.createRange();
    const walker = content.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const boxes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\S/.test(node.nodeValue)) continue;
      range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(r => boxes.push({ text: node.nodeValue.trim().slice(0, 14), top: (r.top - origin.top) / zoom, left: (r.left - origin.left) / zoom, width: r.width / zoom, height: r.height / zoom }));
    }
    return boxes;
  }
  const sheetsOf = job => Array.from(job.frame.contentDocument.querySelectorAll('.pp-print-sheet'));
  async function withJob(html, hf, fn) {
    const job = await PrintExport.prepare(html, null, { id: 1 }, clone(hf), 'essai');
    try { return await fn(job); } finally { job.dispose(); }
  }

  // Les lignes du menu sont écrites dans la langue de la page : le cas se joue en français, puis dans une seconde page qui démarre en anglais (la copie `lang: 'en'`).
  const qualityMenuCase = {
    id: 'bprint_quality_menu_offers_browser_print',
    description: 'Menu « Qualité PDF » : la ligne « Impression navigateur » (ex « Impr. navigateur (bientôt) ») n’est plus grisée, ni dans la liste cachée ni dans le panneau, se nomme ainsi dans la langue de la page (« Browser print » en anglais), et un clic dessus la choisit (les autres lignes du menu : groupe pdfLight)',
    run: async () => {
      const select = document.getElementById('v2-pdf-quality');
      const row = name => document.querySelector('#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]');
      const option = name => select.querySelector('option[value="' + name + '"]');
      const seen = { lang: I18n.getLang(), names: [option('browser-print').textContent, row('browser-print').textContent] };
      seen.optionDisabled = option('browser-print').disabled;
      seen.rowDisabled = row('browser-print').classList.contains('v2-hover-row-disabled');
      const before = select.value;
      row('browser-print').click();
      seen.chosen = select.value;
      seen.active = row('browser-print').classList.contains('is-active') && !row('native').classList.contains('is-active');
      row('native').click();
      seen.back = select.value;
      select.value = before;
      const wanted = seen.lang === 'en' ? 'Browser print' : 'Impression navigateur';
      const pass = seen.names[0] === wanted && seen.names[1] === wanted
        && !seen.optionDisabled && !seen.rowDisabled && seen.chosen === 'browser-print' && seen.active && seen.back === 'native';
      return { pass, notes: JSON.stringify(seen) };
    },
  };
  cases.push(qualityMenuCase);
  cases.push(Object.assign({}, qualityMenuCase, {
    id: 'bprint_quality_menu_offers_browser_print_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne « Browser print » du menu « Qualité PDF » n’est pas grisée, dans la liste cachée comme dans le panneau, et un clic dessus la choisit',
  }));

  cases.push({
    id: 'bprint_frame_is_hidden_sandboxed_and_single',
    description: 'Le cadre d’impression est un srcdoc caché (hors de l’écran, aria-hidden, sans focus) à bac à sable « allow-same-origin allow-modals » SANS allow-scripts ni allow-popups ni allow-top-navigation ; il charge les feuilles de style du widget ; un second « prepare » retire le premier ; « dispose » le retire',
    run: async (h) => {
      const seen = {};
      try {
        await readAt(h, bodyLines(5), NO_HF);
        const first = await PrintExport.prepare(bodyLines(5), null, { id: 1 }, clone(NO_HF), 'premier');
        const frame = first.frame;
        const tokens = Array.from(frame.sandbox);
        seen.sandbox = tokens.slice().sort();
        seen.srcdoc = frame.hasAttribute('srcdoc') && !frame.hasAttribute('src');
        const rect = frame.getBoundingClientRect();
        seen.offscreen = rect.right < 0;
        seen.hidden = frame.getAttribute('aria-hidden') === 'true' && frame.tabIndex === -1 && getComputedStyle(frame).opacity === '0';
        const doc = frame.contentDocument;
        seen.links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every(link => !!doc.querySelector('link[rel="stylesheet"][href="' + link.href + '"]'));
        seen.printSheet = !!doc.querySelector('link[href*="css/print.css"]');
        seen.light = doc.documentElement.getAttribute('data-theme') === 'light' && getComputedStyle(doc.body).colorScheme === 'light';
        seen.title = doc.title;
        const second = await PrintExport.prepare(bodyLines(5), null, { id: 1 }, clone(NO_HF), 'second');
        seen.firstGone = !frame.isConnected;
        seen.frames = document.querySelectorAll('#pp-print-frame').length;
        second.dispose();
        seen.afterDispose = framePresent();
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.sandbox.join(' ') === 'allow-modals allow-same-origin' && seen.srcdoc && seen.offscreen && seen.hidden && seen.links && seen.printSheet && seen.light
        && seen.title === 'premier' && seen.firstGone && seen.frames === 1 && !seen.afterDispose;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_trapped_html_does_not_run_in_the_frame',
    description: 'Du HTML piégé posé tel quel dans le cadre d’impression (comme si le filtre l’avait laissé passer) ne s’exécute pas : ni gestionnaire en ligne, ni script, ni adresse javascript: - le bac à sable les arrête, et le cadre ne touche jamais la page du widget',
    run: async (h) => {
      window.__bprintHit = [];
      const seen = {};
      try {
        await readAt(h, bodyLines(3), NO_HF);
        await withJob(bodyLines(3), NO_HF, async job => {
          const doc = job.frame.contentDocument;
          const host = doc.createElement('div');
          host.innerHTML = '<img src="x" onerror="parent.__bprintHit.push(\'handler\')"><a href="javascript:parent.__bprintHit.push(\'href\')">lien</a>';
          doc.body.appendChild(host);
          const script = doc.createElement('script');
          script.textContent = 'parent.__bprintHit.push("script")';
          doc.body.appendChild(script);
          host.querySelector('a').click();
          await h.sleep(500);
          seen.hits = window.__bprintHit.slice();
        });
      } catch (e) {
        seen.error = String(e && e.message || e);
      } finally { delete window.__bprintHit; h.setA4Preview(false); restoreContainers(); }
      const pass = seen.hits && seen.hits.length === 0 && !seen.error;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_sheets_are_the_reading_pages',
    description: 'Une feuille par page de la Lecture, de la taille exacte de la page, qui montre la fenêtre [haut de la page ; haut + hauteur d’une page] : mêmes coutures que la Lecture (écart nul), même nombre de pages, aucune feuille de trop ; `@page` posé dans le cadre à la taille du modèle en millimètres et nulle part ailleurs',
    run: async (h) => {
      const seen = {};
      try {
        const rc = await readAt(h, sample(), HF);
        const readerBands = overlayBands(rc).map(band => parseFloat(band.style.top));
        seen.readingPages = readerBands.length + 1;
        const pageRulesBefore = Array.from(document.styleSheets).reduce((n, sheet) => { try { return n + Array.from(sheet.cssRules).filter(rule => rule.type === CSSRule.PAGE_RULE).length; } catch (e) { return n; } }, 0);
        await withJob(sample(), HF, async job => {
          const doc = job.frame.contentDocument;
          const page = PageLayout.getPageSizePx();
          const mm = PageLayout.getPageSizeMm();
          const sheets = sheetsOf(job);
          seen.sheets = sheets.length;
          seen.pageCount = job.pageCount;
          seen.sizes = Array.from(new Set(sheets.map(sheet => { const r = sheet.getBoundingClientRect(); return r.width.toFixed(2) + 'x' + r.height.toFixed(2); })));
          seen.expectedSize = page.width.toFixed(2) + 'x' + page.height.toFixed(2);
          seen.windows = job.windows.map(w => [Math.round(w.from * 100) / 100, Math.round((w.to - w.from) * 100) / 100, w.at]);
          const stageBands = overlayBands(sheets[0]).map(band => parseFloat(band.style.top));
          // Les coutures se mesurent depuis le haut de leur conteneur : celui de la Lecture a un rembourrage que celui du cadre n'a pas (css/print.css), seul l'écart entre elles compte.
          seen.sameSeams = stageBands.length === readerBands.length && stageBands.every((top, i) => Math.abs((top - stageBands[0]) - (readerBands[i] - readerBands[0])) < 0.05);
          seen.pageRule = Array.from(doc.querySelectorAll('style#pp-print-page')).map(style => style.textContent);
          seen.expectedRule = '@page { size: ' + (Math.round(mm.width * 1000) / 1000) + 'mm ' + (Math.round(mm.height * 1000) / 1000) + 'mm; margin: 0; }';
          seen.noBreakAfterLast = getComputedStyle(sheets[sheets.length - 1], null).breakAfter === 'auto' || sheets[sheets.length - 1].matches(':last-child');
          seen.pitch = job.windows.slice(2).map((w, i) => Math.round((w.from - job.windows[i + 1].from) * 100) / 100);
          seen.readerPitch = readerBands.slice(1).map((top, i) => Math.round((top - readerBands[i]) * 100) / 100);
        });
        const pageRulesAfter = Array.from(document.styleSheets).reduce((n, sheet) => { try { return n + Array.from(sheet.cssRules).filter(rule => rule.type === CSSRule.PAGE_RULE).length; } catch (e) { return n; } }, 0);
        seen.pageRulesMain = [pageRulesBefore, pageRulesAfter];
      } finally { h.setA4Preview(false); restoreContainers(); }
      const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
      const expected = seen.expectedSize.split('x').map(Number);
      const pass = seen.sheets === seen.readingPages && seen.pageCount === seen.sheets && seen.readingPages >= 3 && seen.sizes.length === 1
        && seen.sizes[0].split('x').every((value, i) => near(Number(value), expected[i], 0.02))
        && seen.windows.every(w => w[2] === 0 && near(w[1], expected[1], 0.01)) && seen.sameSeams
        && seen.pageRule.length === 1 && seen.pageRule[0] === seen.expectedRule && seen.pageRulesMain[0] === 0 && seen.pageRulesMain[1] === 0
        && seen.pitch.length === seen.readerPitch.length && seen.pitch.every((value, i) => near(value, seen.readerPitch[i], 0.02));
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_text_is_laid_out_exactly_like_the_reading',
    description: 'Parité de mise en page : chaque ligne de texte du document rendu dans le cadre d’impression est au même endroit (à 0,05 px) que dans la Lecture de la page - mêmes polices, mêmes coupures de ligne, mêmes marges de bas de page, même tableau coupé ; avec et sans en-tête et pied, en portrait A4 puis en paysage A5 (`@page` à la taille du modèle)',
    run: async (h) => {
      const seen = { cases: [] };
      async function compare(label, hf, layout) {
        const rc = await readAt(h, sample(), hf, layout);
        const content = rc.querySelector('.reader-content');
        const reader = lineBoxes(content, EditorCore.layoutZoom(content));
        const mm = PageLayout.getPageSizeMm();
        const printed = await withJob(sample(), hf, async job => ({
          boxes: lineBoxes(sheetsOf(job)[0].querySelector('.reader-content'), 1),
          rule: job.frame.contentDocument.getElementById('pp-print-page').textContent, sheets: job.pageCount,
        }));
        let worst = 0;
        let mismatched = 0;
        reader.forEach((box, i) => {
          const other = printed.boxes[i];
          if (!other || other.text !== box.text) { mismatched++; return; }
          worst = Math.max(worst, Math.abs(box.top - other.top), Math.abs(box.left - other.left), Math.abs(box.width - other.width), Math.abs(box.height - other.height));
        });
        const readingPages = overlayBands(rc).length + 1;
        seen.cases.push({ label, lines: reader.length, printed: printed.boxes.length, mismatched, worst: Math.round(worst * 1000) / 1000, readingPages, sheets: printed.sheets, rule: printed.rule, mm: [Math.round(mm.width), Math.round(mm.height)] });
        return reader.length > 20 && reader.length === printed.boxes.length && mismatched === 0 && worst <= 0.05 && printed.sheets === readingPages && printed.sheets >= 2
          && printed.rule === '@page { size: ' + (Math.round(mm.width * 1000) / 1000) + 'mm ' + (Math.round(mm.height * 1000) / 1000) + 'mm; margin: 0; }';
      }
      const oks = [];
      try {
        oks.push(await compare('A4 avec en-tête et pied', HF));
        oks.push(await compare('A4 sans en-tête ni pied', NO_HF));
        oks.push(await compare('A5 paysage avec en-tête et pied', HF, () => { PageLayout.setFormat('A5'); PageLayout.setOrientation('landscape'); }));
      } finally { PageLayout.setMarginsMm(null); h.setA4Preview(false); restoreContainers(); }
      const a5 = seen.cases[2];
      return { pass: oks.length === 3 && oks.every(Boolean) && !!a5 && a5.mm[0] === 210 && a5.mm[1] === 148, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_reading_view_without_tint_and_with_the_other_site_images_shown',
    description: 'La Lecture montre une modification en attente teintée et une image d’un autre site derrière son cadre « Afficher » ; l’impression montre le texte comme accepté SANS teinte et l’image affichée, et ne laisse rien derrière : la Lecture garde sa teinte et son cadre, aucun site n’est affiché pour la séance',
    run: async (h) => {
      const url = 'https://bprint-site.test/photo.png';
      const html = '<p>Avant <ins data-id="a1" data-author="x">ajouté</ins> et <del data-id="a2" data-author="x">retiré</del> après.</p><p><img class="editor-image" src="' + url + '" alt="" style="width: 120px;"></p>';
      const seen = {};
      try {
        const rc = await readAt(h, html, NO_HF);
        seen.readerTint = rc.querySelectorAll('.pp-tc-changed').length;
        seen.readerBlocked = rc.querySelectorAll('img[data-blocked-src="' + url + '"]').length;
        await withJob(html, NO_HF, async job => {
          const copy = sheetsOf(job)[0];
          seen.printTint = copy.querySelectorAll('.pp-tc-changed').length;
          seen.printText = copy.querySelector('.reader-content p').textContent;
          seen.printBlocked = copy.querySelectorAll('[data-blocked-src]').length;
          seen.printSrc = Array.from(copy.querySelectorAll('.reader-content img')).map(img => img.getAttribute('src'));
        });
        seen.readerAfter = [rc.querySelectorAll('.pp-tc-changed').length, rc.querySelectorAll('img[data-blocked-src="' + url + '"]').length];
        seen.allowed = ExternalImages.isAllowed('bprint-site.test');
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.readerTint >= 1 && seen.readerBlocked === 1 && seen.printTint === 0 && seen.printText === 'Avant ajouté et après.' && seen.printBlocked === 0
        && seen.printSrc.length === 1 && seen.printSrc[0] === url && seen.readerAfter[0] >= 1 && seen.readerAfter[1] === 1 && seen.allowed === false;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // La plus basse ligne de chaque fenêtre et la liste de ses lignes : une ligne est « dans » une fenêtre quand elle y tient tout entière.
  function windowsCover(job, content) {
    const origin = content.getBoundingClientRect();
    const stageTop = content.closest('#reader-container').getBoundingClientRect().top;
    const lines = lineBoxes(content, 1).map(box => ({ text: box.text, top: box.top + (origin.top - stageTop), bottom: box.top + box.height + (origin.top - stageTop) }));
    const counts = lines.map(line => job.windows.filter(win => line.top >= win.from - 0.5 && line.bottom <= win.to + 0.5).length);
    return { lines: lines.length, lost: counts.filter(n => n === 0).length, doubled: counts.filter(n => n > 1).length };
  }

  cases.push({
    id: 'bprint_page_taller_than_a_sheet_continues_without_losing_a_line',
    description: 'Une liste plus haute que la place qui reste fait une page de la Lecture plus haute qu’une feuille : l’impression la continue sur d’autres feuilles, coupées ENTRE deux lignes - aucune ligne perdue, aucune doublée, aucune coupée en deux -, la suite reprend sous la marge du haut, la marge du bas reste libre, et la page d’après repart sur sa propre feuille ; avec et sans en-tête et pied',
    run: async (h) => {
      const html = '<h1>Titre</h1>' + para(1) + para(2) + '<ul>' + items(60) + '</ul>' + para(3) + '<h2>Fin</h2>' + para(4);
      const seen = { cases: [] };
      const oks = [];
      try {
        for (const [label, hf] of [['sans en-tête ni pied', NO_HF], ['avec en-tête et pied', HF]]) {
          const rc = await readAt(h, html, hf);
          const readingPages = overlayBands(rc).length + 1;
          const page = PageLayout.getPageSizePx();
          const margins = PageLayout.getMarginsPx();
          await withJob(html, hf, async job => {
            const copy = sheetsOf(job)[0].querySelector('.reader-content');
            const cover = windowsCover(job, copy);
            const heights = job.windows.map(w => Math.round((w.to - w.from) * 10) / 10);
            const fits = job.windows.every(w => w.at + (w.to - w.from) <= page.height + 0.01);
            const bottomMarginKept = job.windows.filter(w => w.at > 0 || w.to - w.from < page.height - 1).every(w => w.at + (w.to - w.from) <= page.height - margins.bottom + 20);
            const sheets = sheetsOf(job);
            seen.cases.push({ label, readingPages, sheets: sheets.length, windows: job.windows.map(w => [Math.round(w.from), Math.round(w.to), Math.round(w.at)]), heights, cover, fits });
            oks.push(sheets.length > readingPages && cover.lines > 100 && cover.lost === 0 && cover.doubled === 0 && fits && bottomMarginKept
              && job.windows.slice(1).every((w, i) => w.at === 0 ? true : Math.abs(w.from - job.windows[i].to) < 0.01) && sheets.every(sheet => Math.abs(sheet.getBoundingClientRect().height - page.height) < 0.02));
          });
        }
      } finally { h.setA4Preview(false); restoreContainers(); }
      return { pass: oks.length === 2 && oks.every(Boolean), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_small_overflow_in_the_bottom_margin_makes_no_extra_sheet',
    description: 'Une page de la Lecture qui dépasse de quelques pixels (les marges des citations, que la pagination ne compte pas) mais dont tout ce qui est dessiné tient sur la feuille ne crée pas de feuille de suite : autant de feuilles que de pages, chaque ligne entière sur sa feuille ; un saut de page forcé (son repère est écrit en transparent) ne compte pas comme de l’encre non plus',
    run: async (h) => {
      // Neuf citations de 52 lignes en tout remplissent une page : leurs marges (4 px devant chacune) la font descendre d'une vingtaine de pixels sous le corps de page,
      // sans sortir de la feuille. Cinq lignes de plus passent à la page suivante.
      const quote = (n, lines) => '<blockquote>' + Array.from({ length: lines }, (_, k) => '<p>Citation ' + n + ' ligne ' + (k + 1) + '</p>').join('') + '</blockquote>';
      const quotes = [6, 6, 6, 6, 6, 6, 6, 5, 5].map((lines, i) => quote(i + 1, lines)).join('');
      const html = quotes + bodyLines(5);
      const seen = {};
      try {
        const rc = await readAt(h, html, NO_HF);
        seen.readingPages = overlayBands(rc).length + 1;
        const page = PageLayout.getPageSizePx();
        await withJob(html, NO_HF, async job => {
          const copy = sheetsOf(job)[0].querySelector('.reader-content');
          seen.sheets = job.pageCount;
          seen.windows = job.windows.map(w => [Math.round(w.from), Math.round(w.to), Math.round(w.at)]);
          seen.cover = windowsCover(job, copy);
          seen.pitch = job.windows.length > 1 ? Math.round((job.windows[1].from - job.windows[0].from) * 100) / 100 : 0;
          seen.taller = seen.pitch - 28 - page.height;
        });
        // Un saut de page forcé en bas d'une page pleine : le repère (texte transparent) ne fait pas descendre la page.
        const withBreak = quotes + '<div class="page-break-marker">Saut de page</div>' + bodyLines(3);
        await readAt(h, withBreak, NO_HF);
        await withJob(withBreak, NO_HF, async job => { seen.breakSheets = job.pageCount; seen.breakWindows = job.windows.map(w => [Math.round(w.from), Math.round(w.to), Math.round(w.at)]); });
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.sheets === seen.readingPages && seen.readingPages === 2 && seen.taller > 5 && seen.taller < 37 && seen.cover.lost === 0 && seen.cover.doubled === 0 && seen.cover.lines > 55
        && seen.windows.every(w => w[2] === 0 && w[1] - w[0] === Math.round(PageLayout.getPageSizePx().height)) && seen.breakSheets === 2;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_refuses_a_document_of_more_than_60_pages',
    description: 'Un document de plus de 60 pages est refusé avant toute impression (une copie du document par feuille : le coût croît comme le carré du nombre de pages) : « prepare » rejette avec une erreur que PrintExport.isTooLong reconnaît et qui porte le nombre de pages, aucun cadre ne reste ; 60 feuilles au plus sont acceptées',
    run: async (h) => {
      const breaks = n => Array.from({ length: n }, (_, i) => '<p>Page ' + (i + 1) + '</p><div class="page-break-marker">Saut de page</div>').join('');
      const seen = {};
      try {
        await readAt(h, bodyLines(2), NO_HF);
        seen.max = PrintExport.MAX_PAGES;
        let error = null;
        try { await PrintExport.prepare(breaks(60) + '<p>Fin</p>', null, { id: 1 }, clone(NO_HF), 'trop long'); } catch (e) { error = e; }
        seen.tooLong = !!error && PrintExport.isTooLong(error);
        seen.pages = error && error.pages;
        seen.message = error && error.message;
        seen.frameLeft = framePresent();
        seen.otherError = PrintExport.isTooLong(new Error('autre')) || PrintExport.isTooLong(null);
        const ok = await PrintExport.prepare(breaks(5) + '<p>Fin</p>', null, { id: 1 }, clone(NO_HF), 'court');
        seen.okPages = ok.pageCount;
        ok.dispose();
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.max === 60 && seen.tooLong && seen.pages === 61 && /61 pages/.test(seen.message) && !seen.frameLeft && !seen.otherError && seen.okPages === 6;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'bprint_print_flow_opens_the_browser_window_once_and_cleans_up',
    description: 'printRecord : le document est prêt, la fenêtre du navigateur (print) est appelée UNE fois avec la fenêtre du cadre, le cadre reste jusqu’à « afterprint » puis disparaît, le nom proposé à « Enregistrer au format PDF » est celui du fichier résolu (« publipostage » à défaut) ; sans geste récent, une fenêtre « Impression prête » demande un clic de plus, et un refus n’imprime rien et ne laisse aucun cadre ; une seconde impression retire le cadre de la première',
    run: async (h) => {
      const printed = [];
      const seen = {};
      const stub = h.stubDialogs({ confirm: true });
      const activation = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userActivation');
      try {
        await readAt(h, bodyLines(5), NO_HF);
        // Sans geste récent : le navigateur n'ouvrirait pas sa fenêtre, la question se pose.
        Object.defineProperty(Navigator.prototype, 'userActivation', { configurable: true, get: () => ({ isActive: false, hasBeenActive: false }) });
        await PrintExport.printRecord(bodyLines(5), null, { id: 1 }, 'Mon courrier', clone(NO_HF), { print: win => printed.push(win) });
        const frame = document.getElementById('pp-print-frame');
        seen.asked = stub.asked.map(a => a.kind + ':' + a.title);
        seen.calls = printed.length;
        seen.sameWindow = !!frame && printed[0] === frame.contentWindow;
        seen.title = frame && frame.contentDocument.title;
        seen.stillThere = !!frame;
        frame.contentWindow.dispatchEvent(new Event('afterprint'));
        await h.sleep(50);
        seen.goneAfterPrint = !framePresent();
        // Un refus : rien ne s'imprime, aucun cadre.
        stub.restore();
        const stubNo = h.stubDialogs({ confirm: false });
        await PrintExport.printRecord(bodyLines(5), null, { id: 1 }, '', clone(NO_HF), { print: win => printed.push(win) });
        seen.refusedCalls = printed.length;
        seen.refusedFrame = framePresent();
        stubNo.restore();
        // Avec un geste récent : pas de question ; le nom par défaut ; la seconde impression retire le premier cadre.
        Object.defineProperty(Navigator.prototype, 'userActivation', { configurable: true, get: () => ({ isActive: true, hasBeenActive: true }) });
        const stubNone = h.stubDialogs({ confirm: false });
        await PrintExport.printRecord(bodyLines(5), null, { id: 1 }, '', clone(NO_HF), { print: win => printed.push(win) });
        const firstFrame = document.getElementById('pp-print-frame');
        seen.defaultTitle = firstFrame && firstFrame.contentDocument.title;
        seen.noQuestion = stubNone.asked.length === 0;
        await PrintExport.printRecord(bodyLines(5), null, { id: 1 }, 'Autre', clone(NO_HF), { print: win => printed.push(win) });
        seen.replaced = firstFrame && !firstFrame.isConnected && document.querySelectorAll('#pp-print-frame').length === 1;
        stubNone.restore();
      } finally {
        if (activation) Object.defineProperty(Navigator.prototype, 'userActivation', activation); else delete Navigator.prototype.userActivation;
        stub.restore();
        const left = document.getElementById('pp-print-frame'); if (left) left.remove();
        h.setA4Preview(false); restoreContainers();
      }
      const pass = seen.asked.length === 1 && /confirm:/.test(seen.asked[0]) && seen.calls === 1 && seen.sameWindow && seen.title === 'Mon courrier' && seen.stillThere && seen.goneAfterPrint
        && seen.refusedCalls === 1 && !seen.refusedFrame && seen.defaultTitle === 'publipostage' && seen.noQuestion && seen.replaced;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // Les <style> de l'en-tête d'un document, dans leur ordre, avec les fichiers CSS : `lien:adresse` ou `style:id:texte`. `skip` : ceux qu'on laisse de côté.
  const sheetsIn = (head, skip) => Array.from(head.querySelectorAll('link[rel="stylesheet"], style')).filter(el => !el.matches(skip))
    .map(el => (el.tagName === 'LINK' ? 'lien:' + el.href : 'style:' + el.id + ':' + el.textContent));

  cases.push({
    id: 'bprint_frame_carries_the_styles_scripts_write_into_the_page_head',
    description: 'Le cadre d’impression reprend, dans l’ordre de la page, les fichiers CSS ET les <style> que des scripts posent dans l’en-tête de la page (la palette des encadrés, js/callout.js : sans eux la Lecture du cadre perd ce qu’ils dessinent), sauf la feuille des marges de page de l’éditeur, qui ne vise que l’éditeur',
    run: async (h) => {
      const seen = {};
      try {
        await readAt(h, bodyLines(3), NO_HF);
        await withJob(bodyLines(3), NO_HF, async job => {
          const doc = job.frame.contentDocument;
          const expected = sheetsIn(document.head, '#v2-pagination-margins-style');
          const framed = sheetsIn(doc.head, '#pp-print-page');
          seen.pageStyles = expected.filter(item => item.indexOf('style:') === 0).map(item => item.split(':')[1] || '(sans id)');
          seen.sameSheets = expected.length === framed.length && expected.every((item, i) => item === framed[i]);
          seen.counts = [expected.length, framed.length];
          seen.calloutStyle = !!doc.getElementById('pp-callout-style') && doc.getElementById('pp-callout-style').textContent === document.getElementById('pp-callout-style').textContent;
          seen.editorMarginsHere = !!document.getElementById('v2-pagination-margins-style');
          seen.editorMarginsInFrame = !!doc.getElementById('v2-pagination-margins-style');
        });
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.sameSheets && seen.pageStyles.includes('pp-callout-style') && seen.calloutStyle && seen.editorMarginsHere && !seen.editorMarginsInFrame;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // Le fond, la barre et l'icône d'un encadré, tels que le navigateur les calcule dans `view` (la fenêtre du document où l'élément vit).
  const calloutLook = (el, view) => {
    const cs = view.getComputedStyle(el);
    const before = view.getComputedStyle(el, '::before');
    return { bg: cs.backgroundColor, bar: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor, icon: before.backgroundColor, mask: before.maskImage || before.webkitMaskImage, text: cs.color, padding: cs.paddingLeft };
  };
  const hexRgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';

  cases.push({
    id: 'bprint_callouts_keep_their_tint_bar_and_icon_in_the_print',
    description: 'Les six couleurs et icônes d’encadré s’impriment comme en Lecture : même fond teinté, même barre de 4 px à gauche, même icône (masque) de la couleur d’accent, aux couleurs de la palette de js/callout.js - sans cela l’encadré s’imprimait en simple texte décalé de 40 px, sans fond, sans barre ni icône',
    run: async (h) => {
      const colors = ['blue', 'green', 'amber', 'red', 'purple', 'gray'];
      const icons = ['info', 'warning', 'alert', 'check', 'bulb', 'star'];
      const html = '<p>Avant</p>' + colors.map((c, i) => '<div class="callout" data-color="' + c + '" data-icon="' + icons[i] + '" role="note"><p>Encadré ' + c + ' : un texte assez long pour passer à la ligne et montrer la barre sur deux lignes.</p></div>').join('') + '<p>Après</p>';
      const seen = {};
      try {
        const rc = await readAt(h, html, NO_HF);
        const reader = Array.from(rc.querySelectorAll('.callout')).map(el => calloutLook(el, window));
        let printed = [];
        await withJob(html, NO_HF, async job => {
          const copy = sheetsOf(job)[0];
          printed = Array.from(copy.querySelectorAll('.callout')).map(el => calloutLook(el, job.frame.contentWindow));
        });
        seen.count = [reader.length, printed.length];
        seen.same = reader.length === 6 && printed.length === 6 && reader.every((look, i) => JSON.stringify(look) === JSON.stringify(printed[i]));
        seen.palette = printed.length === 6 && colors.every((c, i) => printed[i].bg === hexRgb(Callout.COLORS[c].tint) && printed[i].bar === '4px solid ' + hexRgb(Callout.COLORS[c].accent) && printed[i].icon === hexRgb(Callout.COLORS[c].accent));
        seen.masks = printed.length === 6 && new Set(printed.map(look => look.mask)).size === 6 && printed.every(look => /^url\(/.test(look.mask));
        seen.first = [reader[0], printed[0] && Object.assign({}, printed[0], { mask: String(printed[0].mask).slice(0, 40) })];
      } finally { h.setA4Preview(false); restoreContainers(); }
      return { pass: !!seen.same && !!seen.palette && !!seen.masks, notes: JSON.stringify(seen) };
    },
  });

  // Un document qui montre chaque fonction de la barre d'outils, au HTML tel que l'éditeur l'enregistre (sans bulle de colonne : la page d'essai n'a pas de table à lire) : mise en forme du
  // texte, les trois sortes de liste, tableau aux cases fusionnées et colorées, citation, code, lien, encadrés, zone à deux colonnes et signature, images (dans le texte, qui flotte, derrière et
  // devant), pastilles, note de bas de page, sommaire, titres numérotés, « garder avec le suivant », trait, légendes, saut de page.
  function featureDocument(img) {
    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const task = (style, label) => '<ul data-type="taskList"' + (style === 'accentStrike' ? '' : ' data-tasklist-style="' + style + '"') + '>'
      + [[true, 'faite'], [false, 'à faire']].map(([done, word]) => '<li data-type="taskItem" data-checked="' + done + '"><label><input type="checkbox"' + (done ? ' checked="checked"' : '') + '><span></span></label><div><p>' + label + ' ' + word + '</p></div></li>').join('') + '</ul>';
    const callout = (color, icon, inner) => '<div class="callout" data-color="' + color + '" data-icon="' + icon + '" role="note">' + inner + '</div>';
    const picture = (attrs, style) => '<img class="editor-image" draggable="false" src="' + img + '" alt="" ' + attrs + ' style="' + style + '">';
    return '<div class="heading-numbering-config" data-style="numeric"></div><h1>Document de contrôle</h1>'
      + '<h2>Texte</h2><p><strong>Gras</strong>, <em>italique</em>, <u>souligné</u>, <s>barré</s>, x<sup>2</sup>, H<sub>2</sub>O, <span style="color: rgb(192, 57, 43)">rouge</span>, <span style="background-color: rgb(255, 242, 168)">surligné</span>, <span style="font-size: 18pt">grand</span>, <span style="font-family: Georgia, serif">Georgia</span>, <span style="font-family: \'Courier New\', monospace">Courier</span>.</p>'
      + '<p style="text-align:center">Centré : ' + lorem + '</p><p style="text-align:right">À droite : ' + lorem + '</p><p style="text-align:justify">Justifié : ' + lorem + ' ' + lorem + '</p>'
      + '<h2>Listes</h2><ul><li><p>Disque un</p></li><li><p>Disque deux</p><ul><li><p>Imbriqué</p></li></ul></li></ul>'
      + '<ul data-bullet-style="circle"><li><p>Cercle</p></li></ul><ul data-bullet-style="square"><li><p>Carré</p></li></ul>'
      + '<ol><li><p>Numéro</p></li></ol><ol data-number-style="alpha"><li><p>Lettre</p></li></ol><ol data-number-style="roman"><li><p>Romain</p></li></ol>'
      + task('accentStrike', 'Tâche') + task('classic', 'Tâche') + task('accentPlain', 'Tâche')
      + '<h2>Tableau</h2><table><tr><th>Indicateur</th><th>Résultat</th><th>Évolution</th></tr>'
      + '<tr><td style="background-color: #fde9d9">Fond orangé</td><td style="text-align:right">78 %</td><td style="text-align:right"><strong style="color: rgb(30, 132, 73)">+8 pts</strong></td></tr>'
      + '<tr><td colspan="2">Cellule fusionnée sur deux colonnes</td><td>Fin</td></tr><tr><td rowspan="2">Fusion verticale</td><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>'
      + '<h2>Citation, code, lien</h2><blockquote><p>Une citation qui montre la barre de gauche.</p></blockquote><pre><code>const x = 1;\nfunction f() { return x; }</code></pre>'
      + '<p>Du <code>code en ligne</code> et un <a href="https://example.com/page">lien hypertexte</a>.</p>'
      + '<h2>Encadrés</h2>' + [['blue', 'info'], ['green', 'check'], ['amber', 'warning'], ['red', 'alert'], ['purple', 'bulb'], ['gray', 'star']].map(([c, i]) => callout(c, i, '<p>Encadré ' + c + '. ' + lorem + '</p>')).join('')
      + callout('blue', 'info', '<p>Encadré avec liste :</p><ul><li><p>un</p></li><li><p>deux</p></li></ul>')
      + '<h2>Signature</h2><div class="two-columns-zone"><div class="two-columns-column"><p></p><p>______________________</p><p>Nom et signature</p></div><div class="two-columns-column"><p></p><p>______________________</p><p>Date</p></div></div>'
      + '<h2>Deux colonnes</h2><div class="two-columns-zone" style="--layout-left: 55%;"><div class="two-columns-column"><p><strong>Colonne gauche</strong></p><p>' + lorem + '</p></div><div class="two-columns-column"><p>' + picture('data-layer="normal" data-wrap="inline"', 'width: 100%') + '</p></div></div>'
      + '<h2>Images</h2><p>Dans le texte' + picture('data-layer="normal" data-wrap="inline" data-align="left"', 'width: 120px') + ' suivie de texte qui l’habille : ' + lorem + ' ' + lorem + '</p>'
      + picture('data-layer="behind" data-wrap="inline"', 'width: 300px; position: absolute; left: 37px; top: 1500px; z-index: -1; opacity: 0.35') + picture('data-layer="front" data-wrap="inline"', 'width: 70px; position: absolute; left: 437px; top: 1520px; z-index: 5')
      + '<h2>Pastilles</h2><p>Date <span class="smart-chip" data-chip-kind="date">Date</span>, heure <span class="smart-chip" data-chip-kind="time">Heure</span>, e-mail <span class="smart-chip" data-chip-kind="email">Email</span>.</p>'
      + '<p>Note<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Texte de la note de bas de page."></sup> de bas de page.</p>'
      + '<div class="toc-marker">Sommaire</div><h1>Titre un</h1><h2>Titre deux</h2><h3>Titre trois</h3><h4>Titre quatre</h4><p data-keep-next="true">Paragraphe gardé avec le suivant.</p><p>Paragraphe suivant.</p><hr><p>Après le trait.</p>'
      + '<h2>Légende</h2><p>' + picture('data-layer="normal" data-wrap="inline"', 'width: 160px') + '</p><p data-caption="true">Légende sous l’image</p><table><tr><td>Cellule</td></tr></table><p data-caption="true">Légende sous le tableau</p>'
      + '<div class="page-break-marker">Saut de page</div><h2>Après le saut</h2><p>Texte de la page suivante.</p>';
  }
  // Ce qu'un élément du document doit montrer pour que la comparaison prouve quelque chose : une fonction de la liste absente du document ne serait comparée à rien.
  const FEATURE_SELECTORS = ['strong', 'em', 'u', 's', 'sup:not(.footnote-ref-marker)', 'sub', 'a[href]', 'code', 'pre code', 'blockquote', 'hr', 'ul[data-bullet-style="circle"]', 'ul[data-bullet-style="square"]', 'ol[data-number-style="alpha"]', 'ol[data-number-style="roman"]',
    'ul[data-type="taskList"]:not([data-tasklist-style])', 'ul[data-tasklist-style="classic"]', 'ul[data-tasklist-style="accentPlain"]', 'td[colspan="2"]', 'td[rowspan="2"]', '.callout[data-color="amber"]', '.callout[data-color="gray"]', '.callout ul',
    '.two-columns-zone .two-columns-column', 'img[data-align="left"]', 'img[data-layer="behind"]', 'img[data-layer="front"]', '.footnote-ref-marker', '.toc-resolved .toc-entry', 'p[data-caption="true"]', 'h4', 'p[data-keep-next="true"]', '.v2-page-watermark'];

  // Ce que le navigateur calcule pour chaque élément du document et ses pseudo-éléments (`::before`, `::after` qui écrivent un contenu), vu de la fenêtre `view` : toutes les propriétés, sauf les mesures
  // (les positions se comparent dans bprint_text_is_laid_out_exactly_like_the_reading), les variables CSS (les valeurs du thème) et `print-color-adjust` (que le cadre pose exprès). Trois éléments
  // ne se comparent pas parce que leur mise en forme est celle de l'écran par construction : le conteneur de la Lecture (gouttière, remplissage), la feuille de papier (son ombre) et les entretoises
  // des bords de page (centrées sur l'écran). Tout ce qu'ils contiennent se compare.
  const SIZES = /^(width|height|inline-size|block-size|min-.*|max-.*|perspective-origin|transform-origin|top|left|right|bottom|inset.*|margin-block.*|margin-inline.*|padding-block.*|padding-inline.*|border-block.*|border-inline.*|zoom|(-webkit-)?print-color-adjust)$/;
  function looksOf(root, view) {
    const list = [];
    // Les marges du texte du document (`.reader-content`) sont celles de son centrage sur l'écran, en pixels : elles dépendent de la largeur du panneau, pas du document.
    const read = (cs, el) => { const out = {}; for (let i = 0; i < cs.length; i++) { const name = cs[i]; if (name.indexOf('--') !== 0 && !SIZES.test(name) && !(el.matches('.reader-content') && /^margin-(left|right)$/.test(name))) out[name] = cs.getPropertyValue(name); } return out; };
    const walk = (el, path) => {
      const screenOnly = el === root || el.matches('.v2-reader-paper, .v2-page-edge-spacer');
      const entry = { path, tag: el.tagName, own: screenOnly ? {} : read(view.getComputedStyle(el), el), pseudo: {} };
      if (!screenOnly) ['::before', '::after'].forEach(side => { const cs = view.getComputedStyle(el, side); if (cs.content && cs.content !== 'none' && cs.content !== 'normal') entry.pseudo[side] = read(cs, el); });
      list.push(entry);
      Array.from(el.children).forEach((child, i) => walk(child, path + '>' + child.tagName.toLowerCase() + '.' + String(child.getAttribute('class') || '').split(/\s+/)[0] + '[' + i + ']'));
    };
    walk(root, 'racine');
    return list;
  }
  function lookDiffs(reading, printed) {
    const diffs = [];
    if (reading.length !== printed.length) diffs.push('éléments : ' + reading.length + ' contre ' + printed.length);
    for (let i = 0; i < Math.min(reading.length, printed.length); i++) {
      const a = reading[i]; const b = printed[i];
      if (a.tag !== b.tag) { diffs.push('structure à ' + a.path + ' : ' + a.tag + ' contre ' + b.tag); break; }
      const compare = (pa, pb, where) => Object.keys(pa).forEach(name => { if (pa[name] !== pb[name]) diffs.push(where + a.path + ' ' + name + ' : ' + String(pa[name]).slice(0, 50) + ' => ' + String(pb[name]).slice(0, 50)); });
      compare(a.own, b.own, '');
      Object.keys(a.pseudo).forEach(side => { if (b.pseudo[side]) compare(a.pseudo[side], b.pseudo[side], side + ' '); else diffs.push(side + ' absent de l’impression à ' + a.path); });
      Object.keys(b.pseudo).forEach(side => { if (!a.pseudo[side]) diffs.push(side + ' seulement dans l’impression à ' + a.path); });
    }
    return diffs;
  }

  cases.push({
    id: 'bprint_every_document_feature_looks_the_same_in_the_print_as_in_the_reading',
    description: 'Chaque fonction du document (texte, listes, tableau, citation, code, lien, encadrés, colonnes, images en calque, pastilles, note, sommaire, titres numérotés, légendes, filigrane, en-tête et pied) a, dans le cadre d’impression, les mêmes propriétés calculées - couleur, fond, bordures, police, puces, contenu et masque des pseudo-éléments - que dans la Lecture de la page : aucune fonction ne perd son aspect à l’impression, comme l’encadré avant le 14/10',
    run: async (h) => {
      const seen = {};
      const theme = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'light');
      try {
        const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 96;
        const paint = canvas.getContext('2d'); paint.fillStyle = '#2f6fed'; paint.fillRect(0, 0, 240, 96);
        const html = featureDocument(canvas.toDataURL('image/png'));
        const rc = await readAt(h, html, HF, () => PageLayout.setWatermark({ text: 'CONFIDENTIEL', angle: 'diagonal', color: '#c0392b', opacity: 0.18 }));
        const reading = looksOf(rc, window);
        await withJob(html, HF, async job => {
          const copy = sheetsOf(job)[0].querySelector('#reader-container');
          const printed = looksOf(copy, job.frame.contentWindow);
          seen.elements = [reading.length, printed.length];
          seen.sheets = [overlayBands(rc).length + 1, job.pageCount];
          seen.missing = FEATURE_SELECTORS.filter(selector => !rc.querySelector(selector) || !copy.querySelector(selector));
          seen.diffs = lookDiffs(reading, printed);
        });
      } finally {
        if (theme === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
        PageLayout.setMarginsMm(null); h.setA4Preview(false); restoreContainers();
      }
      const shown = seen.diffs.length > 12 ? seen.diffs.slice(0, 12).concat(['… et ' + (seen.diffs.length - 12) + ' autres']) : seen.diffs;
      return { pass: seen.elements[0] > 250 && seen.sheets[0] >= 3 && seen.sheets[0] === seen.sheets[1] && seen.missing.length === 0 && seen.diffs.length === 0, notes: JSON.stringify(Object.assign({}, seen, { diffs: shown })) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.browserPrint = cases;
})();
