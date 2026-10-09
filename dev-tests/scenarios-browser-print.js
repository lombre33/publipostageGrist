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

  cases.push({
    id: 'bprint_quality_menu_offers_browser_print',
    description: 'Menu « Qualité PDF » : la ligne « Impression navigateur » (ex « Impr. navigateur (bientôt) ») n’est plus grisée, ni dans la liste cachée ni dans le panneau, se nomme ainsi en français et « Browser print » en anglais, et un clic dessus la choisit (les autres lignes du menu : groupe pdfLight)',
    run: async () => {
      const select = document.getElementById('v2-pdf-quality');
      const row = name => document.querySelector('#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]');
      const option = name => select.querySelector('option[value="' + name + '"]');
      const lang = I18n.getLang();
      const seen = {};
      try {
        I18n.setLang('fr');
        seen.fr = [option('browser-print').textContent, row('browser-print').textContent];
        I18n.setLang('en');
        seen.en = [option('browser-print').textContent, row('browser-print').textContent];
      } finally { I18n.setLang(lang); }
      seen.optionDisabled = option('browser-print').disabled;
      seen.rowDisabled = row('browser-print').classList.contains('v2-hover-row-disabled');
      const before = select.value;
      row('browser-print').click();
      seen.chosen = select.value;
      seen.active = row('browser-print').classList.contains('is-active') && !row('native').classList.contains('is-active');
      row('native').click();
      seen.back = select.value;
      select.value = before;
      const pass = seen.fr[0] === 'Impression navigateur' && seen.fr[1] === 'Impression navigateur' && seen.en[0] === 'Browser print' && seen.en[1] === 'Browser print'
        && !seen.optionDisabled && !seen.rowDisabled && seen.chosen === 'browser-print' && seen.active && seen.back === 'native';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.browserPrint = cases;
})();
