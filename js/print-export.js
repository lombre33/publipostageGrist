// Impression par le navigateur : la qualité « Impression navigateur » du bouton PDF. Le navigateur imprime le document tel que la Lecture le montre,
// et la personne choisit « Enregistrer au format PDF » (ou une imprimante) dans sa fenêtre d'impression.
//
// Le document n'est pas confié à la pagination du navigateur, qui couperait les pages ailleurs que la Lecture, l'éditeur et le PDF vectoriel. Il est
// rendu par la Lecture elle-même (ReaderMode.renderInto : mêmes fonctions, mêmes mesures, mêmes coutures de page) dans un conteneur caché qui reprend les
// vraies feuilles de style du widget, puis découpé en feuilles : une par page de la Lecture, de la taille exacte de la page, qui montre la fenêtre de
// cette page sur le document mesuré. Chaque feuille est un saut de page pour le navigateur (css/print.css) : les coupures, les en-têtes et pieds, les
// numéros de page, les images en calque, le filigrane et les tableaux coupés sont ceux de la Lecture, au pixel près.
//
// Une page de la Lecture est parfois plus haute qu'une feuille : sa pagination ne coupe pas un bloc (une liste, une zone à deux colonnes ou un
// paragraphe plus hauts que la place qui reste) et ne compte pas les marges de certains blocs, la page descend alors sous le bas d'une feuille. Ce
// qui dépasse n'est jamais perdu : il continue sur la ou les feuilles suivantes, coupé entre deux lignes (jamais au travers d'une ligne ou d'une image).
//
// Un macro-modèle aux pages mêlées (js/page-sections.js : des sens différents, ou la diapositive 16:9 d'une présentation parmi des pages A4) a des pages de tailles différentes : la Lecture
// le range en une pile de feuilles par section, chacune dans SA page, et chaque page dit son sens, son format, la place de sa feuille et sa largeur (`page.orientation`, `format`,
// `sheetLeft`, `sheetWidth`). Chaque feuille d'impression a alors la taille de SA page, et le navigateur la sort sur du papier de cette taille : une règle `@page` NOMMÉE par sens
// (`pp-portrait`, `pp-landscape`) et, pour un autre format que celui du modèle, par sens et format (`pp-landscape-190-5x338-7`), que la feuille appelle par son bloc
// (`page`, posé sur le bloc). Sans repère de page, rien de tout cela : la page unique du modèle, comme avant.
//
// Le rendu se fait dans la PAGE du widget, jamais dans un cadre. Hébergée par Grist Factory Suite (js/gfs-link.js), l'app tourne elle-même dans un cadre isolé SANS `allow-same-origin`
// (consigne GFS 011) : son origine est « nulle », et un cadre qu'elle fabrique n'a plus la sienne - son `contentDocument` vaut null et sa fenêtre lève une SecurityError. Seul `window.print()` sur
// la fenêtre de l'app elle-même marche, avec `beforeprint` et `afterprint`. Il n'y a donc qu'une façon d'imprimer, pour l'app seule comme pour l'app hébergée (choix du 16/10 : l'app seule
// imprimait avant par un cadre caché `srcdoc`, retiré). Les feuilles sont rendues dans un conteneur de la page (#pp-print-host, hors de l'écran mais mis en page, pour la mesure) dont l'arbre
// ombre (Shadow DOM) porte les mêmes feuilles de style que la page. L'arbre ombre est ce qui garde ce rendu à part de la Lecture de la page : le `#reader-container` de l'impression n'est pas celui
// de la Lecture (même identifiant, mais un autre arbre), les règles de pagination qu'il écrit à son nom ne touchent pas la Lecture, et celles de la page ne touchent pas les feuilles. À
// l'impression, css/print.css ne montre que ce conteneur (`html.pp-printing`, posé le temps d'une impression : un Ctrl+P ordinaire de la page garde son comportement) ; la règle `@page` est posée dans
// l'en-tête de la page (l'arbre ombre n'en lit pas) ; le titre de la page est le nom du fichier proposé ; et tout est retiré à `afterprint`. Le HTML du document passe par les filtres de la Lecture
// (js/html-sanitize.js) comme pour l'écran, et par la politique de sécurité de index.html (aucun script en ligne) : l'ancien bac à sable du cadre n'existe plus.
//
//   PrintExport.printRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options?) -> Promise<void>
//     L'impression d'une ligne : la fenêtre des images d'un autre site (ExternalImages.confirmExport, comme les exports), le rendu, puis la fenêtre
//     d'impression du navigateur. Rend la main quand l'impression est lancée (dans Chrome : à la fermeture de la fenêtre d'impression). Rejette
//     (isTooLong) un document de plus de MAX_PAGES feuilles.
//     `options.print(fenêtre)` remplace `window.print()` (les tests : un navigateur sans écran n'ouvre pas de fenêtre) ; `fenêtre` est celle de l'app.
//   PrintExport.prepare(htmlContent, tableId, record, headerFooterData, title) -> Promise<{ host, root, document, window, pageCount, pageMm, windows, dispose }>
//     Le document prêt à imprimer, sans l'imprimer. `host` : le conteneur #pp-print-host posé dans la page ; `root` : l'élément de son arbre ombre qui porte les feuilles ; `document` : la page ;
//     `window` : la fenêtre à imprimer. `pageCount` : le nombre de feuilles ; `windows` : pour chacune, la part du document qu'elle montre `{ from, to, at }` (de `from` à `to`, dessinée à la
//     hauteur `at` de la feuille), et, pour un document aux sens mêlés, `sheet` : la feuille de sa page `{ orientation, width, height, left, mm }`. `pageMm` : la taille de la première feuille.
//     `dispose()` retire tout ce que l'impression a posé dans la page.
//   PrintExport.stage(htmlContent, tableId, record, headerFooterData, { id, parent }) -> Promise<{ host, root, stage, windows, pagePx, sheetLeft, dispose }>
//     Le document rendu et mesuré comme pour l'impression, sans feuilles ni impression : `stage`, le #reader-container de l'arbre ombre de `host` (le conteneur, d'identifiant `id`,
//     posé dans `parent`, sinon dans <body>), et ses fenêtres (`windows`, comme ci-dessus, chacune avec `page`, l'indice de la page de la Lecture qu'elle montre). Une seule copie du document, qu'on
//     déplace d'une fenêtre à l'autre : le diaporama d'une présentation (extensions/diapositives/slide-show.js). Aucune limite de pages. `dispose()` retire le conteneur.
//   PrintExport.isTooLong(error), PrintExport.MAX_PAGES
const PrintExport = (function () {
  const HOST_ID = 'pp-print-host';
  // La classe que l'impression pose sur <html> le temps d'une impression : css/print.css ne cache le reste de la page qu'à ce moment-là.
  const PRINTING_CLASS = 'pp-printing';
  // Une fenêtre d'impression que le navigateur ne signale jamais fermée (afterprint) ne garde pas le conteneur pour toujours.
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
  // entre deux pages et son repère « Page N ». Un cadre libre (js/free-frame.js) flotte sur sa diapositive : son texte ne fait jamais descendre une page (la feuille le rogne à son bord, comme
  // le PDF), sans quoi un cadre posé au bas d'une diapositive ajouterait une feuille.
  const INK_SKIP = '.v2-reader-backdrop, .v2-page-seam-divider, .pp-free-frame, style, script, template';
  let live = null;   // ce que la dernière impression a posé (le conteneur, la règle @page, la classe de <html> et le titre), retiré à la suivante ou à la fermeture de sa fenêtre

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

  // Ce que le conteneur ne reprend pas des <style> de l'en-tête : les marges de page de l'éditeur (js/header-footer-preview.js), qui ne visent que l'éditeur et grossissent avec le document.
  const EDITOR_ONLY_STYLES = '#v2-pagination-margins-style';

  // Les feuilles de style de la page, dans son ordre : les fichiers CSS du widget, puis les règles que des scripts posent dans un <style> de l'en-tête à leur chargement (la palette des
  // encadrés, js/callout.js : leur fond, leur barre et leur icône n'existent que là ; sans elle l'impression montre l'encadré en simple texte décalé).
  function pageStyleSheets() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"], head > style:not(' + EDITOR_ONLY_STYLES + ')')).map(sheet => (sheet.tagName === 'LINK'
      ? '<link rel="stylesheet" href="' + attr(sheet.href) + '">'
      : '<style' + (sheet.id ? ' id="' + attr(sheet.id) + '"' : '') + '>' + sheet.textContent.replace(/<\/style/gi, '<\\/style') + '</style>')).join('');
  }

  // La taille de la plus grande feuille que le document emploie (un document aux sens mêlés a des feuilles de deux tailles) : la largeur du conteneur le temps de la mesure.
  function hostSizeFor(htmlContent, pagePx) {
    if (typeof htmlContent !== 'string' || !PageSections.hasSenses(htmlContent)) return pagePx;
    const sizes = PageSections.pagesIn(htmlContent).map(page => PageLayout.withPage(page, () => PageLayout.getPageSizePx())).concat([pagePx]);
    return { width: Math.max.apply(null, sizes.map(size => size.width)), height: Math.max.apply(null, sizes.map(size => size.height)) };
  }

  // Les polices du widget (Roboto, en data: dans css/roboto-fonts.css) sont chargées avant la première mesure : sans elles, la première mise en page se
  // ferait dans la police de repli, et les lignes ne couperaient pas pareil.
  async function loadFonts() {
    if (!document.fonts) return;
    await Promise.all(Array.from(document.fonts).map(face => face.load().catch(() => null)));
    await document.fonts.ready;
  }

  // Ce que la pile dessine : la boîte `{ top, bottom }` (pixels de mise en page, depuis le haut de la pile) de chaque ligne de texte, image ou trait. Elle dit
  // jusqu'où descend une page, et où la couper sans traverser une ligne. Ce qu'on ne voit pas n'en est pas : le « Saut de page » du repère de la Lecture, par
  // exemple, est écrit en transparent (css/style.css) et ne doit pas faire croire qu'une page descend plus bas qu'elle ne le fait.
  function collectInk(stage) {
    const origin = stage.getBoundingClientRect().top;
    const shown = new Map();
    const isShown = el => {
      if (!shown.has(el)) {
        const style = getComputedStyle(el);
        shown.set(el, !(style.visibility === 'hidden' || style.opacity === '0' || /^transparent$|^rgba\(.*,\s*0\)$/.test(style.color)));
      }
      return shown.get(el);
    };
    const boxes = [];
    const add = rect => { if (rect.width > 0 && rect.height > 0) boxes.push({ top: rect.top - origin, bottom: rect.bottom - origin }); };
    const range = document.createRange();
    const walker = document.createTreeWalker(stage, 1 | 4, node => (node.nodeType === 1 && node.matches(INK_SKIP) ? 2 : 1));
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

  // La feuille de papier d'une page de la Lecture : `{ orientation, format, name, width, height, left, mm }` (pixels de mise en page ; `left` : le bord gauche de la feuille dans la pile,
  // `mm` : sa taille pour `@page`, `name` : le nom de cette page pour le navigateur). Une page d'un document aux pages mêlées dit son sens et son format (ReaderMode.renderInto) et sa feuille
  // se lit à PageLayout pour CETTE page ; une page d'un document ordinaire n'en dit pas : null, c'est la feuille du modèle. Le nom est celui du sens (`pp-portrait`, `pp-landscape`), suivi du
  // format quand ce n'est pas celui du modèle (`pp-landscape-190-5x338-7` : la diapositive 16:9 d'une présentation assemblée, qui n'a pas la taille d'une page A4 paysage) ; `format` est alors celui
  // de la page, nul quand c'est celui du modèle.
  function sheetOf(page) {
    if (!page.orientation) return null;
    const format = page.format && page.format !== PageLayout.getFormat() ? page.format : null;
    return PageLayout.withPage(page, () => {
      const px = PageLayout.getPageSizePx();
      const name = 'pp-' + page.orientation + (format ? '-' + format.replace(/[^A-Za-z0-9]/g, '-') : '');
      return { orientation: page.orientation, format, name, width: px.width, height: px.height, left: page.sheetLeft, mm: PageLayout.getPageSizeMm() };
    });
  }

  // Toutes les fenêtres, page après page. Celles d'une page d'un document aux sens mêlés portent la feuille de leur page (`sheet`) : la hauteur où une page trop haute se
  // coupe est celle de SA feuille.
  function planWindows(stage, paged, pagePx) {
    const boxes = collectInk(stage);
    const marginBottomPx = PageLayout.getMarginsPx().bottom;
    const windows = [];
    paged.pages.forEach((page, index) => {
      const next = paged.pages[index + 1];
      const sheet = sheetOf(page);
      pageWindows(page, next ? next.top : Infinity, boxes, sheet ? sheet.height : pagePx.height, marginBottomPx).forEach(win => windows.push(Object.assign(win, { page: index }, sheet ? { sheet } : {})));
    });
    return windows;
  }

  // Les feuilles : une par fenêtre, la taille exacte d'une page, qui rogne une copie du document mesuré décalée de la place de la fenêtre. Elles sont posées dans `root` (le conteneur
  // de l'impression), à la place de `stage`. `sheetLeft` est le bord gauche de la feuille de papier. La copie garde son identifiant (#reader-container) : les règles de la Lecture, de la pagination (marges de bas de
  // page, rognage des tableaux) et de css/print.css en dépendent toutes. Une fenêtre d'un document aux sens mêlés a sa propre feuille (`win.sheet` : taille et bord
  // gauche de SA page) : la feuille est alors posée dans un bloc qui porte le NOM de sa page (`pp-print-page pp-print-<sens>`, css/print.css) - le nom ne se lit pas
  // sur la feuille elle-même, que `contain: size` rend atomique pour le navigateur.
  function buildSheets(root, stage, windows, sheetLeft, pagePx) {
    const host = document.createElement('div');
    host.id = 'pp-print-sheets';
    windows.forEach(win => {
      const paper = win.sheet || { width: pagePx.width, height: pagePx.height, left: sheetLeft };
      const sheet = document.createElement('div');
      sheet.className = 'pp-print-sheet';
      sheet.style.width = paper.width + 'px';
      sheet.style.height = paper.height + 'px';
      const view = document.createElement('div');
      view.className = 'pp-print-window';
      view.style.top = win.at + 'px';
      view.style.height = (win.to - win.from) + 'px';
      const copy = stage.cloneNode(true);
      copy.style.position = 'absolute';
      copy.style.left = (-paper.left) + 'px';
      copy.style.top = (-win.from) + 'px';
      view.appendChild(copy);
      sheet.appendChild(view);
      if (win.sheet) {
        const named = document.createElement('div');
        named.className = 'pp-print-page pp-print-' + win.sheet.orientation;
        // Le nom de la page est posé sur le bloc (css/print.css le dit du sens seul ; une page d'un autre format que le modèle a le sien).
        named.style.setProperty('page', win.sheet.name);
        named.appendChild(sheet);
        host.appendChild(named);
      } else host.appendChild(sheet);
    });
    stage.remove();
    root.appendChild(host);
  }

  // Le format de la page pour le navigateur : la taille du modèle, sans marge (les marges sont dans les feuilles), donc ni en-tête ni pied du navigateur. Un document
  // aux sens mêlés ajoute une règle NOMMÉE par sens employé (`@page pp-landscape { size }`), que les blocs de ses feuilles appellent (css/print.css : `page`) ; la règle
  // sans nom, celle de la première feuille, reste la taille des pages que le navigateur ne sait pas nommer. Elle est posée dans l'en-tête de la page, le temps de l'impression.
  function addPageRule(pageMm, windows) {
    const style = document.createElement('style');
    style.id = 'pp-print-page';
    const named = [];
    windows.forEach(win => { if (win.sheet && !named.some(item => item.name === win.sheet.name)) named.push(win.sheet); });
    style.textContent = '@page { size: ' + mm(pageMm.width) + ' ' + mm(pageMm.height) + '; margin: 0; }'
      + named.map(sheet => ' @page ' + sheet.name + ' { size: ' + mm(sheet.mm.width) + ' ' + mm(sheet.mm.height) + '; margin: 0; }').join('');
    document.head.appendChild(style);
    return style;
  }

  // Attend que chacun de ces éléments ait chargé (ou échoué) : au plus `maxMs` en tout.
  function settleAll(elements, maxMs) {
    if (!elements.length) return Promise.resolve();
    return new Promise(resolve => {
      let left = elements.length;
      const timer = setTimeout(resolve, maxMs);
      const one = () => { if (--left === 0) { clearTimeout(timer); resolve(); } };
      elements.forEach(el => { el.addEventListener('load', one, { once: true }); el.addEventListener('error', one, { once: true }); });
    });
  }
  const settleSheets = (root, maxMs) => settleAll(Array.from(root.querySelectorAll('img')).filter(img => !img.complete), maxMs);
  // Les feuilles de style d'un arbre ombre : lues dès qu'elles sont chargées (leur `sheet` existe), jamais avant la première mesure.
  const settleStyles = (root, maxMs) => settleAll(Array.from(root.querySelectorAll('link[rel="stylesheet"]')).filter(link => !link.sheet), maxMs);

  // Le conteneur de l'impression. Un arbre ombre reprend les feuilles de style de la page et porte l'emplacement où la Lecture est rendue ; il garde ce rendu à part de la Lecture de
  // la page. `size` : la taille de la plus grande feuille ; le conteneur a cette largeur le temps de la mesure (--pp-print-host-width, css/print.css).
  function createPageHost(size, hostId) {
    const host = document.createElement('div');
    host.id = hostId || HOST_ID;
    host.className = 'pp-print-host';
    host.setAttribute('aria-hidden', 'true');
    host.style.setProperty('--pp-print-host-width', Math.ceil(size.width) + 'px');
    // `lang` est posé sur l'emplacement du rendu, pas sur le conteneur : `all: initial` (css/print.css) ramène la langue du conteneur à « auto », et les césures (`hyphens`), les guillemets et
    // les règles de coupure de ligne suivent cette langue, celle de la page (le cadre caché d'avant la recevait de son <html lang>).
    Dom.setMarkup(host.attachShadow({ mode: 'open' }), pageStyleSheets() + '<div class="pp-print-scope" lang="' + attr(document.documentElement.lang || 'fr') + '"><div id="reader-container" class="a4-preview"></div></div>');
    return host;
  }

  // Le document rendu par la Lecture dans le conteneur `host`, déjà posé dans la page, et découpé en fenêtres.
  async function layOut(host, htmlContent, tableId, record, headerFooterData, pagePx) {
    const shadow = host.shadowRoot;
    await settleStyles(shadow, 8000);
    await loadFonts();
    const scope = shadow.querySelector('.pp-print-scope');
    const stage = shadow.getElementById('reader-container');
    const { paged } = await ReaderMode.renderInto(stage, htmlContent, tableId, record, headerFooterData);
    if (!paged || !paged.pages.length) throw new Error('Pagination impossible pour l’impression');
    return { scope, stage, paged, windows: planWindows(stage, paged, pagePx) };
  }

  // Le document mesuré, sans feuilles : une seule copie, que l'appelant déplace d'une fenêtre à l'autre (le diaporama). Le conteneur est à lui : une impression ne le retire pas.
  async function stage(htmlContent, tableId, record, headerFooterData, options) {
    const pagePx = PageLayout.getPageSizePx();
    const host = createPageHost(hostSizeFor(htmlContent, pagePx), options && options.id);
    ((options && options.parent) || document.body).appendChild(host);
    try {
      const laid = await layOut(host, htmlContent, tableId, record, headerFooterData, pagePx);
      return { host, root: laid.scope, stage: laid.stage, windows: laid.windows, pagePx, sheetLeft: laid.paged.sheetLeft, dispose: () => host.remove() };
    } catch (e) {
      host.remove();
      throw e;
    }
  }

  // Ce que l'impression pose dans la page et retire avec elle : le conteneur, la règle `@page` (posée dans l'en-tête de la page : l'arbre ombre n'en lit pas), la classe qui laisse
  // css/print.css cacher le reste de la page à l'impression, et le titre, que le navigateur propose comme nom de fichier à « Enregistrer au format PDF ».
  async function prepare(htmlContent, tableId, record, headerFooterData, title) {
    dispose();
    const pageMm = PageLayout.getPageSizeMm();
    const pagePx = PageLayout.getPageSizePx();
    const html = document.documentElement;
    const previousTitle = document.title;
    const host = createPageHost(hostSizeFor(htmlContent, pagePx));
    let pageRule = null;
    let removed = false;
    // Une seule fois : l'`afterprint` d'une impression déjà remplacée par la suivante ne doit pas défaire la classe ni le titre de celle-ci.
    const handle = { remove() { if (removed) return; removed = true; host.remove(); if (pageRule) pageRule.remove(); html.classList.remove(PRINTING_CLASS); document.title = previousTitle; } };
    document.body.appendChild(host);
    live = handle;
    try {
      const { scope, stage, paged, windows } = await layOut(host, htmlContent, tableId, record, headerFooterData, pagePx);
      if (windows.length > MAX_PAGES) throw tooLongError(windows.length);
      buildSheets(scope, stage, windows, paged.sheetLeft, pagePx);
      // La règle sans nom est celle de la première feuille (un document qui commence en paysage s'imprime d'abord en paysage).
      const firstMm = windows[0].sheet ? windows[0].sheet.mm : pageMm;
      pageRule = addPageRule(firstMm, windows);
      await settleSheets(scope, 8000);
      document.title = title;
      html.classList.add(PRINTING_CLASS);
      return { host, root: scope, document, window, pageCount: windows.length, pageMm: firstMm, windows, dispose: () => { if (live === handle) dispose(); else handle.remove(); } };
    } catch (e) {
      if (live === handle) dispose();
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

  // `print()` bloque dans Chrome jusqu'à la fermeture de la fenêtre ; ailleurs il rend la main tout de suite. Le conteneur reste donc jusqu'à `afterprint`
  // (ou, faute de cet évènement, un long délai) : le retirer plus tôt viderait l'aperçu d'un navigateur qui n'attend pas.
  function startPrint(job, print) {
    const win = job.window;
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

  return { printRecord, prepare, stage, isTooLong, MAX_PAGES };
})();
