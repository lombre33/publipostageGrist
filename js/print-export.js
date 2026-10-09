// Impression par le navigateur : la qualité « Impression navigateur » du bouton PDF. Le navigateur imprime le document tel que la Lecture le montre,
// et la personne choisit « Enregistrer au format PDF » (ou une imprimante) dans sa fenêtre d'impression.
//
// Le document n'est pas confié à la pagination du navigateur, qui couperait les pages ailleurs que la Lecture, l'éditeur et le PDF vectoriel. Il est
// rendu par la Lecture elle-même (ReaderMode.renderInto : mêmes fonctions, mêmes mesures, mêmes coutures de page) dans un cadre caché qui reprend les
// vraies feuilles de style du widget, puis découpé en feuilles : une par page de la Lecture, de la taille exacte de la page, qui montre la fenêtre de
// cette page sur le document mesuré. Chaque feuille est un saut de page pour le navigateur (css/print.css) : les coupures, les en-têtes et pieds, les
// numéros de page, les images en calque, le filigrane et les tableaux coupés sont ceux de la Lecture, au pixel près.
//
// Une page de la Lecture est parfois plus haute qu'une feuille : sa pagination ne coupe pas un bloc (une liste, une zone à deux colonnes ou un
// paragraphe plus hauts que la place qui reste) et ne compte pas les marges de certains blocs, la page descend alors sous le bas d'une feuille. Ce
// qui dépasse n'est jamais perdu : il continue sur la ou les feuilles suivantes, coupé entre deux lignes (jamais au travers d'une ligne ou d'une image).
//
// Le cadre est un srcdoc (un cadre `blob:` serait refusé par la politique de sécurité de index.html, `frame-src 'none'`, qui laisse passer srcdoc) :
// il hérite de cette politique, aucun script n'y tourne, et `sandbox="allow-same-origin allow-modals"` l'empêche d'en lancer un même si du HTML
// piégé échappait au filtre (js/html-sanitize.js). Le widget lit son document pour le mesurer et lance `print()` ; `allow-modals` est ce que le
// navigateur exige pour imprimer depuis un cadre isolé.
//
//   PrintExport.printRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options?) -> Promise<void>
//     L'impression d'une ligne : la fenêtre des images d'un autre site (ExternalImages.confirmExport, comme les exports), le rendu, puis la fenêtre
//     d'impression du navigateur. Rend la main quand l'impression est lancée (dans Chrome : à la fermeture de la fenêtre d'impression). Rejette
//     (isTooLong) un document de plus de MAX_PAGES feuilles.
//     `options.print(fenêtreDuCadre)` remplace `window.print()` (les tests : un navigateur sans écran n'ouvre pas de fenêtre).
//   PrintExport.prepare(htmlContent, tableId, record, headerFooterData, title) -> Promise<{ frame, pageCount, pageMm, windows, dispose }>
//     Le cadre prêt à imprimer, sans l'imprimer : ses feuilles sont dans frame.contentDocument. `pageCount` : le nombre de feuilles ; `windows` : pour
//     chacune, la part du document qu'elle montre `{ from, to, at }` (de `from` à `to`, dessinée à la hauteur `at` de la feuille).
//   PrintExport.isTooLong(error), PrintExport.MAX_PAGES
const PrintExport = (function () {
  const FRAME_ID = 'pp-print-frame';
  // Une fenêtre d'impression que le navigateur ne signale jamais fermée (afterprint) ne garde pas le cadre pour toujours.
  const AFTER_PRINT_CAP_MS = 10 * 60 * 1000;
  // Chaque feuille porte une copie du document mesuré : le coût de la mise en page croît comme le carré du nombre de pages (14 pages : 0,2 s ; 35 : 1,2 s ;
  // 69 : 9 s ; 115 : 30 s, avant le dessin et le PDF). Au-delà de cette limite l'impression est refusée, le PDF vectoriel n'en a pas.
  const MAX_PAGES = 60;
  const TOO_LONG_NAME = 'PrintTooLong';
  // Écart toléré entre deux mesures d'une même position (arrondis des rectangles, 1/64 px de la mise en page).
  const EPSILON_PX = 0.5;
  // Ce que la Lecture montre sans texte : les boîtes de ces éléments comptent comme de l'encre, avec chaque ligne de texte.
  const INK_TAGS = ['IMG', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED', 'HR'];
  // Ce qui n'est pas de la page : le fond de la feuille (et les copies de « Sur toutes les pages » qu'il porte, chacune dans sa page), la gouttière
  // entre deux pages et son repère « Page N ».
  const INK_SKIP = '.v2-reader-backdrop, .v2-page-seam-divider, style, script, template';
  let live = null;   // le cadre de la dernière impression, retiré à la suivante ou à la fermeture de sa fenêtre

  const attr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const text = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Les dimensions en millimètres d'une page, pour `@page { size }` : trois décimales suffisent (un millième de millimètre), sans zéros inutiles.
  const mm = value => String(Math.round(value * 1000) / 1000) + 'mm';

  function tooLongError(pages) {
    const error = new Error('Document trop long pour l’impression par le navigateur : ' + pages + ' pages (' + MAX_PAGES + ' au plus)');
    error.name = TOO_LONG_NAME;
    error.pages = pages;
    return error;
  }
  const isTooLong = error => !!error && error.name === TOO_LONG_NAME;

  function dispose() {
    if (!live) return;
    live.remove();
    live = null;
  }

  // Le document du cadre : les mêmes feuilles de style que la page du widget (le navigateur les sert de son cache), en thème clair (la feuille est
  // blanche dans les deux thèmes), et l'emplacement où la Lecture est rendue. `title` : le nom que le navigateur propose à « Enregistrer au format PDF ».
  function frameDocumentHtml(title) {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => '<link rel="stylesheet" href="' + attr(link.href) + '">').join('');
    return '<!DOCTYPE html><html lang="' + attr(document.documentElement.lang || 'fr') + '" class="pp-print-frame" data-theme="light"><head><meta charset="utf-8">'
      + '<title>' + text(title) + '</title>' + links + '</head><body><div id="reader-container" class="a4-preview"></div></body></html>';
  }

  function createFrame(title, pagePx) {
    const frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
    // Hors de l'écran mais mis en page (un cadre en `display: none` n'a aucune mise en page, donc rien à mesurer), à la largeur d'une feuille.
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;opacity:0;pointer-events:none;width:' + Math.ceil(pagePx.width) + 'px;height:' + Math.ceil(pagePx.height) + 'px';
    frame.srcdoc = frameDocumentHtml(title);
    return frame;
  }

  function frameLoaded(frame) {
    return new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.addEventListener('error', () => reject(new Error('Cadre d’impression illisible')), { once: true });
    });
  }

  // Les variables de mise en page posées sur la racine de la page (marges, largeur de la feuille : PageLayout.applyToPreviewCss) sont reprises par le
  // cadre : css/editor-v2.css les lit sur :root.
  function copyRootVariables(doc) {
    const from = document.documentElement.style;
    for (let i = 0; i < from.length; i++) {
      const name = from[i];
      if (name.indexOf('--') === 0) doc.documentElement.style.setProperty(name, from.getPropertyValue(name));
    }
  }

  // Les polices du widget (Roboto, en data: dans css/roboto-fonts.css) sont chargées avant la première mesure : sans elles, la première mise en page se
  // ferait dans la police de repli, et les lignes ne couperaient pas pareil.
  async function loadFonts(doc) {
    if (!doc.fonts) return;
    await Promise.all(Array.from(doc.fonts).map(face => face.load().catch(() => null)));
    await doc.fonts.ready;
  }

  // Ce que la pile dessine : la boîte `{ top, bottom }` (pixels de mise en page, depuis le haut de la pile) de chaque ligne de texte, image ou trait. Elle dit
  // jusqu'où descend une page, et où la couper sans traverser une ligne. Ce qu'on ne voit pas n'en est pas : le « Saut de page » du repère de la Lecture, par
  // exemple, est écrit en transparent (css/style.css) et ne doit pas faire croire qu'une page descend plus bas qu'elle ne le fait.
  function collectInk(doc, stage) {
    const origin = stage.getBoundingClientRect().top;
    const view = doc.defaultView;
    const shown = new Map();
    const isShown = el => {
      if (!shown.has(el)) {
        const style = view.getComputedStyle(el);
        shown.set(el, !(style.visibility === 'hidden' || style.opacity === '0' || /^transparent$|^rgba\(.*,\s*0\)$/.test(style.color)));
      }
      return shown.get(el);
    };
    const boxes = [];
    const add = rect => { if (rect.width > 0 && rect.height > 0) boxes.push({ top: rect.top - origin, bottom: rect.bottom - origin }); };
    const range = doc.createRange();
    const walker = doc.createTreeWalker(stage, 1 | 4, node => (node.nodeType === 1 && node.matches(INK_SKIP) ? 2 : 1));
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === 3) {
        if (!/\S/.test(node.nodeValue) || !isShown(node.parentElement)) continue;
        range.selectNodeContents(node);
        Array.from(range.getClientRects()).forEach(add);
      } else if (INK_TAGS.indexOf(node.tagName.toUpperCase()) >= 0 && isShown(node)) {
        add(node.getBoundingClientRect());
      }
    }
    return boxes;
  }

  // Où couper une page trop haute à la hauteur `target`, sans traverser une ligne ni une image : la coupe remonte au haut de la ligne (ou de l'image) qu'elle
  // traverserait, tant qu'il y en a une, sans passer sous `floor` (le haut de ce qui est déjà montré : un objet plus haut que la place qui reste se coupe
  // où il tombe).
  function cutAt(boxes, target, floor) {
    let cut = target;
    for (let pass = 0; pass <= boxes.length; pass++) {
      const crossed = boxes.find(box => box.top < cut - EPSILON_PX && box.bottom > cut + EPSILON_PX && box.top > floor + EPSILON_PX);
      if (!crossed) return cut;
      cut = crossed.top;
    }
    return target;
  }

  // Les fenêtres d'une page : `{ from, to, at }` = la part du document entre `from` et `to`, dessinée à la hauteur `at` de la feuille. Une seule, de la hauteur
  // de la feuille, quand ce que la page dessine y tient (le plus souvent : son pied peut descendre dans la marge du bas sans rien perdre). Sinon la suite
  // passe sur d'autres feuilles, où elle reprend à la place du corps de page (sous la marge et la bande du haut) et laisse la marge du bas.
  function pageWindows(page, nextTop, boxes, sheetPx, marginBottomPx) {
    let lowest = page.top;
    boxes.forEach(box => { if (box.top >= page.top - EPSILON_PX && box.top < nextTop - EPSILON_PX && box.bottom > lowest) lowest = box.bottom; });
    if (lowest <= page.top + sheetPx + EPSILON_PX) return [{ from: page.top, to: page.top + sheetPx, at: 0 }];
    const bodyOffset = page.bodyTop - page.top;
    const windows = [];
    let from = page.top;
    let at = 0;
    for (;;) {
      const room = sheetPx - at;
      if (lowest <= from + room + EPSILON_PX || windows.length >= MAX_PAGES) {
        windows.push({ from, to: Math.min(from + room, Math.max(page.bottom, lowest)), at });
        return windows;
      }
      const to = cutAt(boxes, from + room - marginBottomPx, from);
      windows.push({ from, to, at });
      from = to;
      at = bodyOffset;
    }
  }

  // Toutes les fenêtres, page après page.
  function planWindows(doc, stage, paged, pagePx) {
    const boxes = collectInk(doc, stage);
    const marginBottomPx = PageLayout.getMarginsPx().bottom;
    const windows = [];
    paged.pages.forEach((page, index) => {
      const next = paged.pages[index + 1];
      pageWindows(page, next ? next.top : Infinity, boxes, pagePx.height, marginBottomPx).forEach(win => windows.push(win));
    });
    return windows;
  }

  // Les feuilles : une par fenêtre, la taille exacte d'une page, qui rogne une copie du document mesuré décalée de la place de la fenêtre. `sheetLeft` est
  // le bord gauche de la feuille de papier. La copie garde son identifiant (#reader-container) : les règles de la Lecture, de la pagination (marges de bas de
  // page, rognage des tableaux) et de css/print.css en dépendent toutes.
  function buildSheets(doc, stage, windows, sheetLeft, pagePx) {
    const host = doc.createElement('div');
    host.id = 'pp-print-sheets';
    windows.forEach(win => {
      const sheet = doc.createElement('div');
      sheet.className = 'pp-print-sheet';
      sheet.style.width = pagePx.width + 'px';
      sheet.style.height = pagePx.height + 'px';
      const view = doc.createElement('div');
      view.className = 'pp-print-window';
      view.style.top = win.at + 'px';
      view.style.height = (win.to - win.from) + 'px';
      const copy = stage.cloneNode(true);
      copy.style.position = 'absolute';
      copy.style.left = (-sheetLeft) + 'px';
      copy.style.top = (-win.from) + 'px';
      view.appendChild(copy);
      sheet.appendChild(view);
      host.appendChild(sheet);
    });
    stage.remove();
    doc.body.appendChild(host);
  }

  // Le format de la page pour le navigateur : la taille du modèle, sans marge (les marges sont dans les feuilles), donc ni en-tête ni pied du navigateur.
  function addPageRule(doc, pageMm) {
    const style = doc.createElement('style');
    style.id = 'pp-print-page';
    style.textContent = '@page { size: ' + mm(pageMm.width) + ' ' + mm(pageMm.height) + '; margin: 0; }';
    doc.head.appendChild(style);
  }

  function settleSheets(doc, maxMs) {
    const pending = Array.from(doc.images).filter(img => !img.complete);
    if (!pending.length) return Promise.resolve();
    return new Promise(resolve => {
      let left = pending.length;
      const timer = setTimeout(resolve, maxMs);
      const one = () => { if (--left === 0) { clearTimeout(timer); resolve(); } };
      pending.forEach(img => { img.addEventListener('load', one, { once: true }); img.addEventListener('error', one, { once: true }); });
    });
  }

  async function prepare(htmlContent, tableId, record, headerFooterData, title) {
    dispose();
    const pageMm = PageLayout.getPageSizeMm();
    const pagePx = PageLayout.getPageSizePx();
    const frame = createFrame(title, pagePx);
    document.body.appendChild(frame);
    live = frame;
    try {
      await frameLoaded(frame);
      const doc = frame.contentDocument;
      copyRootVariables(doc);
      await loadFonts(doc);
      const stage = doc.getElementById('reader-container');
      const { paged } = await ReaderMode.renderInto(stage, htmlContent, tableId, record, headerFooterData);
      if (!paged || !paged.pages.length) throw new Error('Pagination impossible pour l’impression');
      const windows = planWindows(doc, stage, paged, pagePx);
      if (windows.length > MAX_PAGES) throw tooLongError(windows.length);
      buildSheets(doc, stage, windows, paged.sheetLeft, pagePx);
      addPageRule(doc, pageMm);
      await settleSheets(doc, 8000);
      return { frame, pageCount: windows.length, pageMm, windows, dispose: () => { if (live === frame) dispose(); else frame.remove(); } };
    } catch (e) {
      if (live === frame) dispose();
      throw e;
    }
  }

  // Le navigateur n'ouvre sa fenêtre d'impression que sur un geste récent (le clic sur PDF, ou celui de « Continuer » sur la fenêtre des images d'un
  // autre site) : un rendu long le laisse expirer. Dans ce cas, un clic de plus rend le geste, plutôt qu'une fenêtre d'impression qui ne s'ouvre pas.
  async function ensureGesture() {
    const activation = navigator.userActivation;
    if (!activation || activation.isActive) return true;
    return Dialogs.confirm({ title: I18n.t('dialog.printReady.title'), message: I18n.t('confirm.printReady'), confirmLabel: I18n.t('common.print') });
  }

  // `print()` bloque dans Chrome jusqu'à la fermeture de la fenêtre ; ailleurs il rend la main tout de suite. Le cadre reste donc jusqu'à `afterprint`
  // (ou, faute de cet évènement, un long délai) : le retirer plus tôt viderait l'aperçu d'un navigateur qui n'attend pas.
  function startPrint(job, print) {
    const win = job.frame.contentWindow;
    let timer = 0;
    const release = () => { clearTimeout(timer); job.dispose(); };
    win.addEventListener('afterprint', release, { once: true });
    timer = setTimeout(release, AFTER_PRINT_CAP_MS);
    win.focus();
    (print || (w => w.print()))(win);
  }

  async function printRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options) {
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, tableId, record);
    const job = await prepare(htmlContent, tableId, record, headerFooterData, filename || 'publipostage');
    if (!(await ensureGesture())) { job.dispose(); return; }
    startPrint(job, options && options.print);
  }

  return { printRecord, prepare, isTooLong, MAX_PAGES };
})();
