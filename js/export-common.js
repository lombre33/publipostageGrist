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
  // entière : chaque exporteur applique déjà son propre padding de cellule), mesurée sur le 1er enfant de bloc de chaque cellule de la 1ère ligne - un simple
  // soustrait padding+bordure est imprécis d'~1px. Le tableau doit être attaché au document (cf. attachMeasureHost).
  function measuredColumnWidthsPx(table, columnCount) {
    const firstRow = table.querySelector(':scope > tbody > tr, :scope > thead > tr, :scope > tr');
    if (!firstRow) return null;
    const cells = Array.from(firstRow.children).filter(c => /^(TD|TH)$/i.test(c.tagName));
    if (!cells.length) return null;
    const widths = [];
    cells.forEach(cell => {
      const span = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const contentEl = cell.querySelector(':scope > p, :scope > div, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > ul, :scope > ol');
      let perCol;
      if (contentEl) {
        perCol = contentEl.getBoundingClientRect().width / span;
      } else {
        const cs = getComputedStyle(cell);
        const inset = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        perCol = (cell.getBoundingClientRect().width - inset) / span;
      }
      for (let i = 0; i < span; i += 1) widths.push(perCol);
    });
    while (widths.length < columnCount) widths.push(0);
    return widths.slice(0, columnCount);
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

  return { loadScriptOnce, ensureJsZipLoaded, downloadBlob, attachMeasureHost, measuredColumnWidthsPx, resolveHeaderFooterVariables };
})();
