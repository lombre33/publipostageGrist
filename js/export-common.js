// Aides partagées par les exports (PDF vectoriel, Word, Excel, PDF unique, lots ZIP de js/main.js). Chargé avant pdf-export.js, pdf-merge.js,
// docx-export.js, xlsx-export.js et js/main.js (index.html) ; rien ne s'exécute au chargement, tout sert à un export en cours.
const ExportCommon = (function () {
  // Charge un script CDN (`integrity` : SRI sha384, avec `crossOrigin`) ou un fichier du dépôt (sans SRI : même origine que la page). Résolu au
  // `load`, rejeté si le script ne charge pas ; l'appelant mémorise sa propre promesse pour ne charger qu'une fois.
  function loadScriptOnce(lib) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = lib.src;
      if (lib.integrity) { s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; }
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Échec de chargement du script : ' + lib.src));
      document.head.appendChild(s);
    });
  }

  // JSZip fabrique l'archive des exports en lot (PDF et Word en ZIP) : ~0,1 Mo, chargé seul, sans pdfmake ni ses polices (~4 Mo) que seul l'export
  // PDF demande (js/pdf-export.js:ensurePdfLibsLoaded). SRI sha384 comme les autres bibliothèques CDN.
  const JSZIP_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG' };
  let jsZipPromise = null;
  function ensureJsZipLoaded() {
    if (!jsZipPromise) jsZipPromise = (window.JSZip ? Promise.resolve() : loadScriptOnce(JSZIP_LIB)).catch(e => { jsZipPromise = null; throw e; });
    return jsZipPromise;
  }

  // Télécharge un Blob par un <a download> synthétique : window.location.href se comporte moins bien dans l'iframe sandboxée d'un widget Grist.
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Attache `root` hors écran, avec la seule classe .tiptap (pas #editor-container .tiptap : aucune dépendance au conteneur réel), le temps d'une
  // mesure : un <div> détaché n'a aucun rendu. `extraClasses` : classes de l'appelant, posées avant .tiptap. Le min-height:0 en ligne l'emporte sur
  // .tiptap { min-height: 200px } (zone cliquable de l'éditeur vide), qui plafonnerait à 200 px la hauteur mesurée. Renvoie la fonction qui retire
  // `root`.
  function attachMeasureHost(root, widthPx, ...extraClasses) {
    root.classList.add(...extraClasses, 'tiptap');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + widthPx + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }

  // Les <tr> d'un tableau dans l'ordre du document, les <td>/<th> d'une ligne, et le colspan ou rowspan d'une case (au moins 1).
  const tableRows = table => Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
  const cellsOf = tr => Array.from(tr.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName));
  const spanOf = (cell, attribute) => Math.max(1, parseInt(cell.getAttribute(attribute) || '1', 10) || 1);

  // Pose chaque case sur la grille du tableau : une case fusionnée sur plusieurs lignes n'est pas répétée dans les lignes d'après et décale celles
  // qui la suivent. { placed: [{ el, row, col, rowspan, colspan }] depuis 0, width: nombre de colonnes } ; un rowspan qui dépasse le bas du tableau
  // est ramené aux lignes qui restent.
  function placeCells(rows) {
    const taken = [];
    const placed = [];
    let width = 0;
    rows.forEach((tr, r) => {
      let c = 0;
      cellsOf(tr).forEach((el) => {
        while (taken[r] && taken[r][c]) c += 1;
        const colspan = spanOf(el, 'colspan');
        const rowspan = Math.min(rows.length - r, spanOf(el, 'rowspan'));
        for (let dr = 1; dr < rowspan; dr += 1) for (let dc = 0; dc < colspan; dc += 1) (taken[r + dr] = taken[r + dr] || [])[c + dc] = true;
        placed.push({ el, row: r, col: c, rowspan, colspan });
        c += colspan;
        width = Math.max(width, c);
      });
    });
    return { placed, width };
  }

  // Largeurs des colonnes mesurées sur le rendu réel (le <col> de @tiptap ne porte qu'un minimum en px, pas un pourcentage exploitable) ; le tableau
  // doit être attaché au document (attachMeasureHost). Largeur du contenu, pas de la boîte : chaque exporteur applique son propre padding de
  // cellule ; elle se lit sur le premier bloc enfant de la cellule, plus juste (~1 px) que la boîte moins son padding et sa bordure. Chaque colonne
  // se mesure sur la première case simple (colspan 1) qui la couvre. Une case fusionnée sur plusieurs colonnes ne dit rien de la largeur de chacune :
  // elle ne sert, à parts égales, qu'à une colonne qu'aucune case simple ne couvre.
  function measuredColumnWidthsPx(table, columnCount) {
    const { placed } = placeCells(tableRows(table));
    if (!placed.length) return null;
    const perColumnPx = (cell, span) => {
      const contentEl = cell.querySelector(':scope > p, :scope > div, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol');
      if (contentEl) return contentEl.getBoundingClientRect().width / span;
      const cs = getComputedStyle(cell);
      const inset = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      return (cell.getBoundingClientRect().width - inset) / span;
    };
    const single = [];
    const merged = [];
    placed.forEach(({ el, col, colspan }) => {
      if (colspan === 1) { if (single[col] === undefined) single[col] = perColumnPx(el, 1); }
      else for (let i = 0; i < colspan; i += 1) if (!merged[col + i]) merged[col + i] = { cell: el, span: colspan };
    });
    const widths = [];
    for (let col = 0; col < columnCount; col += 1) widths.push(single[col] !== undefined ? single[col] : merged[col] ? perColumnPx(merged[col].cell, merged[col].span) : 0);
    return widths;
  }

  // Résout les #Variable et les chips des quatre fragments d'en-tête et de pied (ReaderMode.preview) au même niveau que le corps : les exporteurs
  // restent appelables avec du HTML déjà résolu, sans enregistrement Grist en dessous. Les quatre zones sont des lectures indépendantes (aucune
  // n'écrit d'état partagé) : lancées ensemble.
  async function resolveHeaderFooterVariables(headerFooterData, tableId, record) {
    if (!headerFooterData || !headerFooterData.enabled) return headerFooterData;
    const resolveZone = html => (html ? ReaderMode.preview(html, tableId, record) : html);
    const [headerDefault, headerFirst, footerDefault, footerFirst] = await Promise.all([
      resolveZone(headerFooterData.header && headerFooterData.header.default),
      resolveZone(headerFooterData.header && headerFooterData.header.first),
      resolveZone(headerFooterData.footer && headerFooterData.footer.default),
      resolveZone(headerFooterData.footer && headerFooterData.footer.first),
    ]);
    return {
      enabled: true,
      differentFirstPage: !!headerFooterData.differentFirstPage,
      header: { default: headerDefault, first: headerFirst },
      footer: { default: footerDefault, first: footerFirst },
    };
  }

  // Lignes d'un bloc de code (<pre>) pour le PDF et le Word : retours chariot normalisés, tabulation = 4 espaces (`tab-size: 4` de `.tiptap pre`,
  // css/editor-v2.css). Une ligne vide reste une entrée vide : à l'exporteur d'en faire une ligne de hauteur normale.
  function codeLinesOf(node) {
    return (node.textContent || '').replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/\t/g, '    '));
  }

  // Largeur, en px, à laquelle l'éditeur montre une image dans le texte : `.tiptap img.editor-image { max-width: 100% }` (css/editor-v2.css) la
  // ramène à la largeur de son conteneur (page, case de tableau, colonne), proportions gardées, même si la largeur réglée (`styleWidthPx`) est plus
  // grande. L'hôte de mesure (attachMeasureHost) porte .tiptap : le navigateur y pose la boîte de l'éditeur, que le PDF et le Word reprennent. Un
  // nœud détaché de la page n'a aucune boîte (largeur 0) : il garde la largeur réglée.
  function shownImageWidthPx(imgNode, styleWidthPx) {
    if (!imgNode || !imgNode.isConnected) return styleWidthPx;
    const shown = imgNode.getBoundingClientRect().width;
    return shown > 0 && shown < styleWidthPx ? shown : styleWidthPx;
  }

  // Mesures d'un encadré (js/callout.js) en px, prises sur son CSS réel (css/callout.css) quand il est dans le document : barre de gauche, marges
  // intérieures et extérieures, icône (le ::before). Un nœud détaché de la page prend les valeurs de css/callout.css. Partagé par le PDF et le Word
  // pour qu'ils dessinent la même boîte.
  function calloutMetricsPx(node) {
    const live = !!node && node.isConnected;
    const cs = live ? getComputedStyle(node) : null;
    const before = live ? getComputedStyle(node, '::before') : null;
    const num = (style, name, fallback) => { const n = style ? parseFloat(style[name]) : NaN; return Number.isFinite(n) ? n : fallback; };
    return {
      barPx: num(cs, 'borderLeftWidth', 4),
      padLeftPx: num(cs, 'paddingLeft', 40), padRightPx: num(cs, 'paddingRight', 12), padTopPx: num(cs, 'paddingTop', 8), padBottomPx: num(cs, 'paddingBottom', 8),
      marginTopPx: num(cs, 'marginTop', 6), marginBottomPx: num(cs, 'marginBottom', 6),
      iconSizePx: num(before, 'width', 20), iconLeftPx: num(before, 'left', 12), iconTopPx: num(before, 'top', 10),
    };
  }

  // Les bords de chaque case d'un tableau de grille, tels que l'éditeur les montre (js/table-borders.js : un trait que deux cases se partagent n'a
  // qu'une valeur, quoi que dise le HTML) : une Map case -> { top, right, bottom, left } (null = trait fin gris de départ, 'none' = pas de trait,
  // '#rrggbb'). Lue sur les `data-border-*`, jamais sur le style calculé, qui suit le thème sombre. null quand aucune case n'en porte (tout tableau
  // de document, la plupart des grilles) : le PDF et l'Excel gardent alors leur trait de départ.
  function cellBorderSides(table) {
    const rows = tableRows(table);
    const { placed, width } = placeCells(rows);
    let any = false;
    placed.forEach((cell) => {
      TableBorders.SIDES.forEach((side) => {
        cell[side] = cell.el.getAttribute('data-border-' + side);
        if (cell[side]) any = true;
      });
    });
    if (!any) return null;
    const sides = TableBorders.resolve({ width, height: rows.length, cells: placed });
    return new Map(placed.map((cell, i) => [cell.el, sides[i]]));
  }

  // Les tranches d'une grille que ses sauts de page découpent (`data-page-break-before` sur une ligne : js/grid-editor.js), une par page du PDF et
  // par feuille de l'Excel : une liste de [première ligne, ligne qui suit la dernière] sur `rows`, les lignes du tableau dans l'ordre. Sans saut, une
  // seule tranche. Un saut avant la première ligne n'ouvre rien (pas de page vide) ; un saut qu'une case fusionnée sur plusieurs lignes traverse
  // n'est pas suivi, pour ne jamais couper une case en deux (l'éditeur ne laisse pas le poser, un HTML venu d'ailleurs le peut).
  function gridRowSegments(rows) {
    const starts = [0];
    let reach = 0; // la première ligne que les cases des lignes déjà vues ne recouvrent plus
    rows.forEach((tr, r) => {
      if (r > 0 && tr.hasAttribute('data-page-break-before') && reach <= r) starts.push(r);
      cellsOf(tr).forEach((cell) => { reach = Math.max(reach, r + Math.min(rows.length - r, spanOf(cell, 'rowspan'))); });
    });
    return starts.map((from, i) => [from, i + 1 < starts.length ? starts[i + 1] : rows.length]);
  }

  // Les lignes de titres d'un tableau, reprises en haut de chaque page où il se poursuit (PDF et Word) : les lignes du début dont toutes les cases
  // sont des <th>. Rien ne se répète quand le tableau n'est fait que de lignes de titres, ni au-delà d'une case fusionnée sur plusieurs lignes qui
  // déborde sous elles (le bloc répété serait coupé en deux) : on s'arrête avant elle. `rows` : les <tr> du tableau, dans l'ordre.
  function headerRowCount(rows) {
    let count = 0;
    while (count < rows.length) {
      const cells = cellsOf(rows[count]);
      if (!cells.length || !cells.every(cell => /^TH$/i.test(cell.tagName))) break;
      count += 1;
    }
    if (count === rows.length) return 0;
    while (count > 0 && rows.slice(0, count).some((tr, i) => cellsOf(tr).some(cell => i + spanOf(cell, 'rowspan') > count))) count -= 1;
    return count;
  }

  // Les images qu'un export laisse de côté faute de pouvoir les lire (pièce jointe supprimée, adresse qui ne répond plus, format illisible) : le
  // reste du fichier s'écrit, mais la personne doit le savoir (js/main.js : l'état sous les boutons). Comptées sans doublon sur la durée d'un clic,
  // lot entier compris : la même image dans l'en-tête de chaque ligne n'est qu'une image. Une pièce jointe se reconnaît à son numéro (le jeton de son
  // adresse change d'un appel à l'autre), toute autre image à son adresse.
  const unreadImages = new Set();
  function unreadImageKey(img) {
    const src = (img.getAttribute('src') || '').trim();
    const attachmentId = img.getAttribute('data-attachment-id') || (src.match(/\/attachments\/(\d+)\/download/) || [])[1];
    if (attachmentId) return 'attachment:' + attachmentId;
    return src.length > 200 ? src.slice(0, 200) + '#' + src.length : src;
  }
  function noteUnreadImage(img) { unreadImages.add(unreadImageKey(img)); }
  // Une image sans adresse n'a rien d'illisible, sauf une pièce jointe dont l'adresse n'a pas pu être posée : seule celle-là compte.
  function noteImageWithoutSource(img) { if (img.getAttribute('data-attachment-id')) noteUnreadImage(img); }
  function unreadImageCount() { return unreadImages.size; }
  function resetUnreadImages() { unreadImages.clear(); }

  return { loadScriptOnce, ensureJsZipLoaded, downloadBlob, attachMeasureHost, tableRows, placeCells, measuredColumnWidthsPx, shownImageWidthPx, cellBorderSides, gridRowSegments, resolveHeaderFooterVariables,
    codeLinesOf, calloutMetricsPx, headerRowCount, noteUnreadImage, noteImageWithoutSource, unreadImageCount, resetUnreadImages };
})();
