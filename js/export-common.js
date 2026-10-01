// Aides partagées par les exports (PDF vectoriel, DOCX, PDF unique, lots ZIP de js/main.js) : ce qui était recopié à l'identique dans chacun. Chargé avant
// pdf-export.js/pdf-merge.js/docx-export.js/main.js (index.html) ; toutes les fonctions ne servent qu'à l'exécution d'un export, jamais au chargement.
const ExportCommon = (function () {
  // Chargement d'un script CDN (`integrity` = SRI sha384, `crossOrigin` obligatoire avec lui) ou d'un fichier du dépôt (sans SRI : même origine que la page).
  // Résolu au `load`, rejeté si le script ne charge pas ; l'appelant garde sa propre promesse mémorisée pour ne charger qu'une fois.
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

  // JSZip fabrique l'archive des exports en lot (PDF en ZIP, DOCX en ZIP) : ~0,1 Mo, chargé seul, sans pdfmake ni ses polices (~4 Mo) que seul l'export PDF
  // demande (js/pdf-export.js:ensurePdfLibsLoaded). SRI sha384 + crossOrigin, comme pour les autres bibliothèques CDN.
  const JSZIP_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG' };
  let jsZipPromise = null;
  function ensureJsZipLoaded() {
    if (!jsZipPromise) jsZipPromise = (window.JSZip ? Promise.resolve() : loadScriptOnce(JSZIP_LIB)).catch(e => { jsZipPromise = null; throw e; });
    return jsZipPromise;
  }

  // Téléchargement d'un Blob par un <a download> synthétique (même geste que partout ailleurs : window.location.href se comporte moins bien dans l'iframe
  // sandboxée d'un widget Grist).
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Attache `root` hors-écran avec la classe .tiptap (scopée à la classe seule, pas #editor-container .tiptap, pour ne pas dépendre du conteneur réel) le
  // temps d'une mesure : un <div> détaché n'a aucun rendu. `extraClasses` : classes propres à l'appelant, posées avant .tiptap. min-height:0 en inline
  // l'emporte sur .tiptap { min-height: 200px } (zone cliquable de l'éditeur vide) : sans lui, mesurer la hauteur totale de `root` plafonne à 200px quel que
  // soit le contenu réel. Renvoie la fonction qui le retire.
  function attachMeasureHost(root, widthPx, ...extraClasses) {
    root.classList.add(...extraClasses, 'tiptap');
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + widthPx + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;';
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }

  // Largeurs mesurées sur le rendu réel (le <col> de @tiptap ne porte qu'un minimum px, pas un pourcentage exploitable), largeur de CONTENU (pas la boîte
  // entière : chaque exporteur applique déjà son propre padding de cellule), mesurée sur le 1er enfant de bloc de la cellule - un simple soustrait
  // padding+bordure est imprécis d'~1px. Le tableau doit être attaché au document (cf. attachMeasureHost).
  // Chaque colonne se mesure sur la première case d'UNE seule colonne qui la couvre (la 1re ligne dans un tableau ordinaire). Une case fusionnée sur plusieurs colonnes ne dit rien
  // de la largeur propre de chacune : une ligne de titre fusionnée sur toute la largeur rendait toutes les colonnes égales dans le PDF ; elle ne sert (à parts égales) qu'à une
  // colonne qu'aucune case simple ne couvre. Les cases fusionnées sur plusieurs lignes (`rowspan`), que le HTML ne répète pas dans les lignes suivantes, décalent les cases d'après.
  function measuredColumnWidthsPx(table, columnCount) {
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    if (!rows.length) return null;
    const perColumnPx = (cell, span) => {
      const contentEl = cell.querySelector(':scope > p, :scope > div, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol');
      if (contentEl) return contentEl.getBoundingClientRect().width / span;
      const cs = getComputedStyle(cell);
      const inset = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      return (cell.getBoundingClientRect().width - inset) / span;
    };
    const single = [];
    const merged = [];
    const taken = [];
    let any = false;
    rows.forEach((tr, r) => {
      let c = 0;
      Array.from(tr.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName)).forEach(cell => {
        any = true;
        while (taken[r] && taken[r][c]) c += 1;
        const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
        const rowSpan = Math.max(1, Math.min(rows.length - r, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1));
        for (let dr = 1; dr < rowSpan; dr += 1) for (let dc = 0; dc < span; dc += 1) (taken[r + dr] = taken[r + dr] || [])[c + dc] = true;
        if (span === 1) { if (single[c] === undefined) single[c] = perColumnPx(cell, 1); }
        else for (let i = 0; i < span; i += 1) if (!merged[c + i]) merged[c + i] = { cell, span };
        c += span;
      });
    });
    if (!any) return null;
    const widths = [];
    for (let col = 0; col < columnCount; col += 1) widths.push(single[col] !== undefined ? single[col] : merged[col] ? perColumnPx(merged[col].cell, merged[col].span) : 0);
    return widths;
  }

  // #Variable/chips des 4 fragments d'en-tête/pied résolus (ReaderMode.preview) au même niveau que le corps, pour que les exporteurs restent appelables avec
  // du HTML déjà résolu, sans avoir besoin d'un vrai enregistrement Grist plus bas. Les 4 zones sont des lectures indépendantes (aucune n'écrit d'état
  // partagé) : parallélisées.
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

  // Lignes d'un bloc de code (<pre>) pour le PDF et le Word : retours chariot normalisés, tabulation = 4 espaces (`tab-size: 4` de `.tiptap pre`, css/editor-v2.css). Une ligne
  // vide reste une entrée vide : c'est à l'exporteur d'en faire une ligne de hauteur normale.
  function codeLinesOf(node) {
    return (node.textContent || '').replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/\t/g, '    '));
  }

  // Largeur, en px, à laquelle l'éditeur montre une image dans le texte : `.tiptap img.editor-image { max-width: 100% }` (css/editor-v2.css) la ramène à la largeur de ce qui la
  // contient (page, case de tableau, colonne), proportions gardées (`height: auto`), même quand la largeur réglée (`styleWidthPx`, le style de l'image) est plus grande.
  // L'hôte de mesure (attachMeasureHost) porte la classe .tiptap : la boîte que le navigateur y pose est celle de l'éditeur, le PDF et le Word la reprennent au lieu de la
  // largeur réglée. Un nœud détaché de la page n'a aucune boîte (largeur 0) : il garde la largeur réglée.
  function shownImageWidthPx(imgNode, styleWidthPx) {
    if (!imgNode || !imgNode.isConnected) return styleWidthPx;
    const shown = imgNode.getBoundingClientRect().width;
    return shown > 0 && shown < styleWidthPx ? shown : styleWidthPx;
  }

  // Mesures d'un encadré (js/callout.js) en pixels, prises sur son CSS réel (css/callout.css) quand il est dans le document : barre de gauche, marges intérieures et extérieures, icône
  // (le ::before). Les valeurs de css/callout.css servent de repli pour un nœud détaché de la page. Partagé par le PDF et le Word, pour qu'ils dessinent la même boîte.
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

  return { loadScriptOnce, ensureJsZipLoaded, downloadBlob, attachMeasureHost, measuredColumnWidthsPx, shownImageWidthPx, resolveHeaderFooterVariables, codeLinesOf, calloutMetricsPx };
})();
