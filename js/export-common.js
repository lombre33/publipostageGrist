// Aides partagées par les exports (PDF vectoriel, Word, Excel, PDF unique, lots ZIP de js/main.js). Chargé avant pdf-export.js, pdf-merge.js,
// docx-export.js, xlsx-export.js et js/main.js (index.html) ; rien ne s'exécute au chargement, tout sert à un export en cours.
const ExportCommon = (function () {
  // Ce que l'éditeur fixe en CSS (css/editor-v2.css) et que les exports reprennent, écrit une seule fois en points et en « #rrggbb » ; le Word en
  // tire ses demi-points (× 2) et ses « RRGGBB » (hexOf), l'Excel ses « AARRGGBB ». Corps : `.tiptap { font-size: 14px }`, soit 10,5 pt pour tout
  // texte sans taille inline. Interligne : `.tiptap { line-height: 1.42 }`. Lien : le bleu de Word. Bloc de code : `.tiptap pre`, 9,5 pt, dans une
  // police dont le rapport naturel entre hauteur de ligne et corps est `codeFontRatio` (Cousine, comme Courier New) : on divise l'interligne par lui
  // pour que la ligne mesure la hauteur de l'éditeur.
  const EDITOR_STYLE = {
    bodyPt: 10.5,
    headingPt: { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 },
    lineHeight: 1.42,
    // La ligne « simple » : le rapport entre la hauteur de ligne et le corps de la police de l'éditeur (Roboto). L'interligne se dit en multiples d'elle, comme dans Word et
    // PowerPoint (js/paragraph-format.js, js/pptx-export.js, js/pptx-import.js).
    naturalLine: 1.172,
    linkColor: '#0563c1',
    codePt: 9.5,
    codeFontRatio: 1.1328,
    codeBoxColor: '#d0d7de',
    codeFillColor: '#f6f8fa',
    codeTextColor: '#1b2430',
  };
  const hexOf = color => color.slice(1).toUpperCase();

  // Une couleur CSS en « RRGGBB » (majuscules), la seule forme que docx.js accepte pour w:color et w:shd (toute autre chaîne lève « Invalid hex
  // value » et fait échouer l'export entier) et dont l'Excel tire son ARGB. Un texte collé de Word ou d'une page web garde ses couleurs nommées
  // (« black », « red » : le navigateur ne les réécrit pas en rgb()), et « #f00 », « rgb(100%, 0%, 0%) » ou « hsl(...) » sont aussi des couleurs
  // valides : c'est donc le navigateur qui lit la valeur, par le fillStyle d'un canevas (jamais un style calculé, qui suit le thème sombre), qui
  // rend « #rrggbb », ou « rgba(r, g, b, a) » sous 100 % d'opacité. null quand la valeur est vide, transparente ou illisible : l'appelant garde alors
  // la couleur héritée, jamais d'exception.
  const cssColorCache = new Map();
  let colorProbeContext;
  function readCssColor(v) {
    if (colorProbeContext === undefined) colorProbeContext = document.createElement('canvas').getContext('2d');
    const ctx = colorProbeContext;
    if (!ctx) return null;
    // fillStyle ignore sans rien dire une valeur qui n'est pas une couleur : deux amorces distinctes séparent « illisible » (l'amorce revient telle
    // quelle) d'une couleur qui vaut l'amorce.
    ctx.fillStyle = '#000000'; ctx.fillStyle = v; const onBlack = String(ctx.fillStyle);
    ctx.fillStyle = '#ffffff'; ctx.fillStyle = v; const onWhite = String(ctx.fillStyle);
    if (onBlack !== onWhite) return null;
    const opaque = onBlack.match(/^#([0-9a-f]{6})$/);
    if (opaque) return opaque[1].toUpperCase();
    const translucent = onBlack.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
    if (!translucent || !(parseFloat(translucent[4]) > 0)) return null;
    return translucent.slice(1, 4).map(n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  function cssColorHex(value) {
    const v = String(value == null ? '' : value).trim().toLowerCase();
    if (!v || /^(transparent|inherit|initial|unset|revert|currentcolor)$/.test(v)) return null;
    if (!cssColorCache.has(v)) cssColorCache.set(v, readCssColor(v));
    return cssColorCache.get(v);
  }

  // D'où un script peut venir : le CDN que la politique de sécurité du contenu d'index.html laisse charger des scripts (jsDelivr, consigne 106 de GFS), avec une empreinte (SRI) que
  // le navigateur vérifie, ou le dépôt lui-même (même origine que la page, sans SRI). Le texte de refus, ou '' quand la bibliothèque est permise ; la
  // politique du navigateur refuserait déjà le reste, ceci le dit avant d'ajouter la balise.
  const SCRIPT_CDN_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
  function scriptRefusal(lib) {
    const src = String((lib && lib.src) || '').trim();
    if (!src) return 'adresse absente';
    let url;
    try { url = new URL(src, document.baseURI); } catch (e) { return 'adresse illisible'; }
    if (url.origin === window.location.origin && /^https?:$/.test(url.protocol)) return '';
    if (!SCRIPT_CDN_ORIGINS.has(url.origin)) return 'origine non permise';
    if (!/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(String(lib.integrity || ''))) return 'empreinte absente ou illisible';
    return '';
  }

  // Charge un script CDN (`integrity` : SRI sha384, avec `crossOrigin`) ou un fichier du dépôt (sans SRI : même origine que la page), sous réserve de
  // scriptRefusal. Résolu au `load`, rejeté si le script est refusé ou ne charge pas ; l'appelant mémorise sa propre promesse pour ne charger qu'une fois.
  // `lib.type: 'module'` : le fichier assemblé d'une extension de GFS (js/extensions.js:loadModuleLibrary) est un module, que seule une balise charge avec son empreinte.
  //
  // `rescue` (consigne 108 de GFS, contrats 5.2 point 14) : la copie de GFS ({ src, integrite, forme }, GfsLink.secours) que le chargeur du kit (kit/js/script-loader.js, une carte d'importation d'index.html le
  // nomme) essaie après le CDN, quand il échoue (un hôte mort, des octets que l'empreinte refuse, une adresse que la politique ne nomme pas : le navigateur lève le même `error`) ou ne répond pas en 3 secondes.
  // Jamais un deuxième CDN : la copie est du site de GFS (même origine que la page, `script-src 'self'` suffit). Elle passe par scriptRefusal comme le CDN ; refusée, ou sans chargeur du kit (une page qui n'a pas sa
  // carte d'importation), le script se charge comme avant, sans secours. Sans `rescue` (l'app seule, un GFS d'avant, un fichier du dépôt), rien ne change : une balise, sans minuterie.
  function loadScriptTag(lib) {
    return new Promise((resolve, reject) => {
      const refusal = scriptRefusal(lib);
      if (refusal) { reject(new Error('Script refusé (' + refusal + ') : ' + (lib && lib.src))); return; }
      const s = document.createElement('script');
      if (lib.type) s.type = lib.type;
      s.src = lib.src;
      if (lib.integrity) { s.integrity = lib.integrity; s.crossOrigin = 'anonymous'; }
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Échec de chargement du script : ' + lib.src));
      document.head.appendChild(s);
    });
  }
  function loadScriptOnce(lib, rescue) {
    const spare = rescue && typeof rescue === 'object' && !scriptRefusal({ src: rescue.src, integrity: rescue.integrite }) ? rescue : null;
    if (!spare || scriptRefusal(lib)) return loadScriptTag(lib);
    const primary = { src: lib.src, integrite: lib.integrity, forme: lib.type === 'module' ? 'module' : 'script' };
    return import('kit/script-loader').then(
      module => module.loadScript(primary, { secours: spare }).then(() => undefined, () => { throw new Error('Échec de chargement du script : ' + lib.src + ' (et de sa copie chez GFS)'); }),
      () => loadScriptTag(lib),
    );
  }

  // JSZip fabrique l'archive des exports en lot (PDF et Word en ZIP) : ~0,1 Mo, chargé seul, sans pdfmake ni ses polices (~4 Mo) que seul l'export
  // PDF demande (js/pdf-export.js:ensurePdfLibsLoaded). D'où il vient (la copie figée de GFS ou le CDN, avec son empreinte SRI) : js/native-libs.js, fonction « zip ».
  let jsZipPromise = null;
  function ensureJsZipLoaded() {
    if (!jsZipPromise) jsZipPromise = (window.JSZip ? Promise.resolve() : NativeLibs.load('jszip')).catch(e => { jsZipPromise = null; throw e; });
    return jsZipPromise;
  }

  // Ce qu'un paquet zip (.pptx, .xlsx) pèse une fois défait, d'après les tailles que son répertoire central annonce : rien n'est décompressé pour le savoir (JSZip.loadAsync ne lit que ce
  // répertoire). Les imports refusent un paquet qui annonce plus que leur plafond : une « bombe » de compression tient en quelques Ko et remplirait la mémoire de l'onglet.
  // Une entrée dont l'en-tête annonce MOINS que ce qu'elle contient (un fichier forgé exprès) n'est vue qu'une fois défaite : ce plafond arrête les fichiers qui disent vrai.
  function zipUnpackedBytes(zip) {
    let total = 0;
    Object.keys(zip.files).forEach((name) => {
      const entry = zip.files[name];
      if (entry.dir) return;
      total += entry._data && Number.isFinite(entry._data.uncompressedSize) ? entry._data.uncompressedSize : 0;
    });
    return total;
  }

  // Télécharge un Blob par un <a download> synthétique : window.location.href se comporte moins bien dans l'iframe sandboxée d'un widget Grist.
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }

  // Attache `root` hors écran, avec la seule classe .tiptap (pas #editor-container .tiptap : aucune dépendance au conteneur réel), le temps d'une
  // mesure : un <div> détaché n'a aucun rendu. `extraClasses` : classes de l'appelant, posées avant .tiptap. Le min-height:0 en ligne l'emporte sur
  // .tiptap { min-height: 200px } (zone cliquable de l'éditeur vide), qui plafonnerait à 200 px la hauteur mesurée. Renvoie la fonction qui retire
  // `root`.
  function attachMeasureHost(root, widthPx, ...extraClasses) {
    // Le rond ou le numéro de chaque point de liste a la couleur et la taille du début de son texte, comme à l'écran (js/list-markers.js) : les mesures et `getComputedStyle(li, '::marker')` le voient.
    ListMarkers.apply(root);
    root.classList.add(...extraClasses, 'tiptap');
    // `.tiptap` remet à zéro le compteur CSS des notes de bas de page (css/editor-v2.css). Sur un hôte posé à la fin du <body>, le navigateur retrouve la place de ce compteur parmi tous les éléments de la page : environ 7 ms
    // pour un éditeur de 36 000 nœuds (0,5 ms quand il est vide), à CHAQUE hôte posé puis retiré. Le PDF d'un diaporama en pose un par cadre (11/11, 57 diapositives à photos : 62 s avant, 10 s depuis ; 21 s avec l'éditeur vidé). Sans note de
    // bas de page dans son contenu, l'hôte n'a aucun besoin de ce compteur et ne le remet pas à zéro (0,1 ms) ; avec une note, il garde celui de la feuille de style, qui numérote ses renvois comme à l'écran.
    const noteCounter = root.querySelector('.footnote-ref-marker') ? '' : ' counter-reset:none;';
    root.style.cssText = 'position:absolute; left:-99999px; top:0; visibility:hidden; width:' + widthPx + 'px; min-height:0; padding:0; margin:0; box-sizing:border-box;' + noteCounter;
    document.body.appendChild(root);
    return () => { if (root.parentNode) root.parentNode.removeChild(root); };
  }

  // Les images en calque de la 1re page (`data-page-index="0"`), ancrées au premier paragraphe de leur page. Word et OpenDocument posent une image en calque à une place de la PAGE
  // du paragraphe qui la porte (ancre `wp:anchor`, cadre `text:anchor-type="paragraph"`) : une image que la personne a insérée dans un paragraphe tardif (la formule de politesse, en
  // page 2) puis glissée en haut de la page 1 sortait en page 2, à la même place. L'éditeur, la Lecture et le PDF la mettent à la page de sa grille, jamais à celle de son paragraphe
  // porteur : l'image est donc rangée dans le premier paragraphe de sa page - celle du document, ou celle de son modèle dans un macro-modèle (après le saut `data-macro-slot` qui
  // l'ouvre) - dont la page est sûre. Une image déjà portée par ce paragraphe, une image répétée (« Sur toutes les pages » : l'en-tête) et une image hors paragraphe ne bougent pas ;
  // les images des pages suivantes non plus (la pagination de Word n'est pas celle de l'éditeur : aucun paragraphe n'y ouvre sûrement la page 2).
  const LAYERED_IMAGES = 'img.editor-image[data-layer="front"], img.editor-image[data-layer="behind"]';
  const PARAGRAPHS = 'p, h1, h2, h3, h4, h5, h6';
  function anchorFirstPageImages(root) {
    const gridNumber = (img, name) => (img.hasAttribute(name) ? parseFloat(img.getAttribute(name)) : NaN);
    const onFirstPage = img => gridNumber(img, 'data-page-index') === 0 && Number.isFinite(gridNumber(img, 'data-page-left-pt')) && Number.isFinite(gridNumber(img, 'data-page-top-pt'))
      && !(typeof PageLayer !== 'undefined' && PageLayer.isRepeatedEl(img));
    const images = Array.from(root.querySelectorAll(LAYERED_IMAGES)).filter(onFirstPage);
    if (!images.length) return;
    // Le premier paragraphe de chaque bloc de premier niveau : celui du premier bloc de son modèle qui en porte un (le bloc lui-même, ou son premier paragraphe : une zone, une
    // case de tableau, une liste).
    const targetOf = new Map();
    let slotTarget = null;
    Array.from(root.children).forEach((child) => {
      if (child.matches('.page-break-marker[data-macro-slot]')) { slotTarget = null; return; }
      if (!slotTarget) slotTarget = child.matches(PARAGRAPHS) ? child : child.querySelector(PARAGRAPHS);
      targetOf.set(child, slotTarget);
    });
    images.forEach((img) => {
      let top = img;
      while (top.parentElement && top.parentElement !== root) top = top.parentElement;
      const target = targetOf.get(top);
      const host = img.closest(PARAGRAPHS);
      if (!target || !host || host === target) return;
      // À la fin du paragraphe : l'image vient d'un paragraphe plus tardif, elle passe donc après celles que le paragraphe porte déjà, et les images rangées là gardent leur ordre dans
      // le document (l'ordre de peinture de Word et de LibreOffice).
      target.appendChild(img);
    });
  }

  // Un bloc vide (`<p></p>`, une case sans texte) n'a aucune hauteur dans un hôte de mesure, alors que l'éditeur lui laisse sa ligne (le <br> de fin que ProseMirror
  // pose) et que Word et le PDF l'écrivent comme une ligne vide : sans un <br>, une zone aux lignes vides se mesurerait trop basse, et Word, qui les écrit toutes,
  // descendrait le corps de la page (js/docx-export.js:measureZoneHeightTwip).
  function fillEmptyBlocks(root) {
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th').forEach(el => { if (!el.hasChildNodes()) el.appendChild(document.createElement('br')); });
  }

  // Un retour saisi (Maj+Entrée) qui TERMINE un bloc n'ouvre aucune ligne dans un hôte de mesure, alors que l'éditeur lui laisse la sienne (le <br> de fin que ProseMirror pose, absent de Editor.getHTML()) et que Word écrit
  // son `w:br` : sans un <br> de plus derrière lui, la hauteur mesurée serait d'une ligne trop courte par retour de fin (consigne 092 de GFS). Le <br> ajouté porte `attribute` : il compte pour la mesure, et
  // personne ne l'écrit (`data-measure-filler` pour l'Excel, `data-pdf-measure-filler` pour le PDF, que leurs lecteurs de texte écartent). Un bloc qui ne finit pas par un retour saisi, un bloc vide et un retour qui sépare deux
  // blocs ne changent pas (ReaderMode.trailingTypedBreaks).
  function fillTrailingBreaks(root, attribute = 'data-measure-filler') {
    root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th').forEach(el => {
      const endingReturns = ReaderMode.trailingTypedBreaks(el);
      if (!endingReturns.length) return;
      const filler = document.createElement('br');
      filler.setAttribute(attribute, '1');
      endingReturns[endingReturns.length - 1].after(filler);
    });
  }

  // Les <tr> d'un tableau dans l'ordre du document, les <td>/<th> d'une ligne, et le colspan ou rowspan d'une case (de 1 à 1 000, ramené à ce que son tableau peut porter : HtmlSanitize.cellSpan).
  const tableRows = table => Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
  const cellsOf = tr => Array.from(tr.children).filter(cell => /^(TD|TH)$/i.test(cell.tagName));
  const spanOf = (cell, attribute) => HtmlSanitize.cellSpan(cell, attribute);

  // Pose chaque case sur la grille du tableau : une case fusionnée sur plusieurs lignes n'est pas répétée dans les lignes d'après et décale celles
  // qui la suivent. { placed: [{ el, row, col, rowspan, colspan }] depuis 0, width: nombre de colonnes } ; un rowspan qui dépasse le bas du tableau
  // est ramené aux lignes qui restent.
  function placeCells(rows) {
    const taken = [];
    const placed = [];
    let width = 0;
    rows.forEach((tr, r) => {
      let column = 0;
      cellsOf(tr).forEach((el) => {
        while (taken[r] && taken[r][column]) column += 1;
        const colspan = spanOf(el, 'colspan');
        const rowspan = Math.min(rows.length - r, spanOf(el, 'rowspan'));
        for (let dr = 1; dr < rowspan; dr += 1) for (let dc = 0; dc < colspan; dc += 1) (taken[r + dr] = taken[r + dr] || [])[column + dc] = true;
        placed.push({ el, row: r, col: column, rowspan, colspan });
        column += colspan;
        width = Math.max(width, column);
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

  // Les largeurs mesurées (`measured`, dans l'unité de l'appelant : points pour le PDF, twips pour le Word) sur le total visé `usable` : celles du tableau
  // tel quel s'il y tient (un tableau rétréci reste rétréci à l'export), ramenées au prorata au-delà. Aucune colonne sous `floor` : ce que le plancher
  // ajoute est retiré aux colonnes plus larges, au prorata. Un seul calcul pour le PDF et le Word, pour qu'un tableau plus large que la page y prenne
  // les mêmes proportions.
  function fitColumnWidths(measured, usable, floor) {
    const sum = measured.reduce((total, w) => total + w, 0);
    const widths = measured.map(w => (w / sum) * Math.min(sum, usable));
    const flooredTotal = widths.reduce((total, w) => total + Math.max(floor, w), 0);
    if (flooredTotal > usable) {
      const deficit = flooredTotal - usable;
      const aboveFloorTotal = widths.reduce((total, w) => total + (w > floor ? w : 0), 0) || 1;
      return widths.map(w => (w > floor ? Math.max(floor, w - deficit * (w / aboveFloorTotal)) : floor));
    }
    return widths.map(w => Math.max(floor, w));
  }

  // La place d'un tableau qui se trouve dans une colonne de zone à deux colonnes (`el` : le tableau, ou ce qui l'enveloppe dans l'éditeur) : le texte de la colonne,
  // sa boîte sans bordure ni remplissage, en pixels de mise en page (`clientWidth` ne suit pas la réduction de la feuille). C'est pour lui ce que la page est pour un
  // tableau du texte courant. 0 : pas dans une colonne, dans une case (un tableau de case se règle sur sa case), ou une colonne sans mise en page (éditeur masqué,
  // zone détachée) : l'appelant garde alors la page.
  function zoneColumnWidthPx(el) {
    const column = el && el.closest ? el.closest('.two-columns-column') : null;
    if (!column) return 0;
    const cell = el.closest('td, th');
    if (cell && column.contains(cell)) return 0;
    const cs = getComputedStyle(column);
    return Math.max(0, column.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  }

  // Un item de liste ou une citation qui porte un tableau (le bouton Tableau le pose dans l'item ou la citation où se trouve le curseur) : un tableau
  // n'est pas du texte, lu comme tel il perd ses cases (« Un itemL1AL1BL2A »).
  const hasTableChild = node => Array.from(node.children).some(child => child.tagName === 'TABLE');

  // Les enfants d'un item de liste ou d'une citation, coupés à chaque tableau et dans l'ordre : des suites de nœuds (le texte, les sous-listes) et les
  // tableaux eux-mêmes ({ nodes } ou { table }). Le texte d'avant un tableau porte la puce ou le numéro de l'item, celui d'après le continue.
  function segmentsAroundTables(node) {
    const segments = [];
    let run = null;
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'TABLE') { run = null; segments.push({ table: child }); return; }
      if (!run) { run = { nodes: [] }; segments.push(run); }
      run.nodes.push(child);
    });
    return segments;
  }

  // Un morceau de texte qui ne montre rien : des espaces entre deux blocs, pas un paragraphe vide (une ligne que la personne a laissée).
  const isBlankSegment = segment => !!segment.nodes && segment.nodes.every(node => node.nodeType !== Node.ELEMENT_NODE && !(node.nodeValue || '').trim());

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

  // Le HTML du modèle, le nom du fichier et les zones d'en-tête et de pied résolus pour une ligne : le même point de passage pour le PDF, le Word et
  // l'Excel. `previewHook` : le crochet de ReaderMode.preview (les marques de l'Excel sur les cases à nombre ou à date). Les trois se lisent dans une
  // seule passe de lecture (GristAPI.withReadPass) : chaque table n'est lue qu'une fois pour la ligne, pas une fois par variable.
  function resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, previewHook) {
    return GristAPI.withReadPass(async () => ({
      resolvedHtml: await ReaderMode.preview(htmlContent, tableId, record, previewHook),
      filename: await ReaderMode.resolveFilename(filenameTemplate, tableId, record),
      resolvedHeaderFooterData: await resolveHeaderFooterVariables(headerFooterData, tableId, record),
    }));
  }

  // Lignes d'un bloc de code (<pre>) pour le PDF et le Word : retours chariot normalisés, tabulation = 4 espaces (`tab-size: 4` de `.tiptap pre`,
  // css/editor-v2.css). Une ligne vide reste une entrée vide : à l'exporteur d'en faire une ligne de hauteur normale.
  // Les points d'une liste de cases à cocher que Word, OpenDocument et le texte brut écrivent comme des paragraphes qui COMMENCENT PAR leur case (☐, ☑ ou ☒, la forme que les exports de l'éditeur écrivent aussi) :
  // `taskEntryOf(html)` lit un paragraphe en balisage ({ checked, inner } ou null), `taskListHtml(entries)` rend la liste de cases de l'éditeur de points consécutifs. Un point coché de l'éditeur est barré
  // et grisé dans les exports : ces deux marques, posées sur tout son texte, sont rendues à l'éditeur, qui les dessine lui-même.
  const TASK_PARAGRAPH = /^<p[^>]*>(?:<span[^>]*>)?([☐☑☒])[ \u00a0]?(?:<\/span>)?([^]*)<\/p>$/;
  const TASK_CHECKED_LOOK = /^<s><span style="color: #667085">([^]*)<\/span><\/s>$/;
  function taskEntryOf(html) {
    const found = TASK_PARAGRAPH.exec(String(html || ''));
    if (!found || /<\/?(?:p|ul|ol|li|table|blockquote|h[1-6])\b/.test(found[2])) return null;
    const checked = found[1] !== '☐';
    const look = checked ? TASK_CHECKED_LOOK.exec(found[2]) : null;
    return { checked, inner: look ? look[1] : found[2] };
  }
  // Les paragraphes d'un bloc de code que Word et OpenDocument écrivent un par ligne : tout le texte du paragraphe dans UNE série de caractères à police à chasse fixe (Courier New, Consolas, Cousine...) ; `codeEntryOf` lit
  // le texte de la ligne (déjà échappé), `groupedBlocks(blocks)` rend les blocs avec leurs points de liste de cases (☐ ☑ ☒) réunis en liste de cases à cocher et leurs lignes de code réunies en un bloc de code.
  const CODE_LINE = /^<p[^>]*><span style="[^"]*font-family: (?:Courier New|Consolas|Cousine|Liberation Mono|Lucida Console|Menlo|Monaco|monospace)[^"]*">([^<]*)<\/span><\/p>$/i;
  const codeEntryOf = html => { const found = CODE_LINE.exec(String(html || '')); return found ? found[1] : null; };
  function groupedBlocks(blocks) {
    let out = '';
    let tasks = [];
    let code = [];
    const flush = () => {
      if (tasks.length) out += taskListHtml(tasks);
      if (code.length) out += '<pre><code>' + code.join('\n') + '</code></pre>';
      tasks = [];
      code = [];
    };
    blocks.forEach((html) => {
      const task = taskEntryOf(html);
      const line = task ? null : codeEntryOf(html);
      if (task) { if (code.length) flush(); tasks.push(task); return; }
      if (line !== null) { if (tasks.length) flush(); code.push(line.replace(/\u00a0/g, ' ')); return; }
      flush();
      out += html;
    });
    flush();
    return out;
  }
  function taskListHtml(entries) {
    return '<ul data-type="taskList">' + entries.map(entry => '<li data-type="taskItem" data-checked="' + (entry.checked ? 'true' : 'false') + '"><label><input type="checkbox"' + (entry.checked ? ' checked' : '')
      + '><span></span></label><div><p>' + (entry.inner || '') + '</p></div></li>').join('') + '</ul>';
  }
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

  // Le quadrillage de départ d'une grille est-il masqué ? (`data-grid-lines="off"` sur le tableau, js/grid-editor.js : la Lecture, le PDF, le Word et
  // l'Excel le lisent au même endroit.)
  function gridLinesHidden(table) { return table.getAttribute('data-grid-lines') === 'off'; }

  // La hauteur minimale d'une ligne en px (`data-row-height`, js/grid-editor.js) ; null pour une ligne que personne n'a réglée : elle a la hauteur de
  // son texte. Lue sur la marque de l'enregistrement, comme l'alignement vertical d'une case : le PDF et le Word s'accordent sur ce qu'ils lisent.
  function rowHeightPx(tr) {
    const px = parseFloat(tr.getAttribute('data-row-height'));
    return px > 0 ? px : null;
  }

  // L'alignement vertical d'une case : 'top', 'middle' ou 'bottom' (`data-valign`, js/grid-editor.js, ou son `vertical-align` en ligne), null quand
  // personne n'en a posé : la case reste en haut, comme dans l'éditeur.
  const VALIGNS = ['top', 'middle', 'bottom'];
  function cellVerticalAlign(cell) {
    const mark = String(cell.getAttribute('data-valign') || '').toLowerCase();
    if (VALIGNS.includes(mark)) return mark;
    const inline = String(cell.style.verticalAlign || '').toLowerCase();
    return VALIGNS.includes(inline) ? inline : null;
  }

  // Les bords de chaque case d'un tableau réglé (grille ou tableau de document), tels que l'éditeur les montre (js/table-borders.js : un trait que deux
  // cases se partagent n'a qu'une valeur, quoi que dise le HTML) : une Map case -> { top, right, bottom, left } (null = trait fin gris de départ,
  // 'none' = pas de trait, '#rrggbb'), ce qu'il faut dessiner : quand le quadrillage est masqué, le trait de départ que la personne n'a pas posé devient
  // « pas de trait » (TableBorders.drawn). Lue sur les `data-border-*`, jamais sur le style calculé, qui suit le thème sombre. null quand aucune case
  // ne porte de bord et que le quadrillage est montré (tout tableau que personne n'a réglé, la plupart des grilles) : le PDF, le Word et l'Excel
  // gardent alors leur trait de départ.
  function cellBorderSides(table) {
    const rows = tableRows(table);
    const { placed, width } = placeCells(rows);
    const gridShown = !gridLinesHidden(table);
    let any = false;
    placed.forEach((cell) => {
      TableBorders.SIDES.forEach((side) => {
        cell[side] = cell.el.getAttribute('data-border-' + side);
        if (cell[side]) any = true;
      });
    });
    if (!any && gridShown) return null;
    const sides = TableBorders.resolve({ width, height: rows.length, cells: placed });
    return new Map(placed.map((cell, i) => [cell.el, TableBorders.drawn(sides[i], gridShown)]));
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
  // Les images d'un autre site, que l'export ne télécharge jamais (ReaderMode.preview range leur adresse dans data-external-src : js/external-images.js:setAside) : laissées de côté, elles manquent dans le
  // fichier, et la personne doit le savoir comme pour une image illisible. Comptées à part (le message dit comment les garder : les coller dans le document) et sans doublon, comme les autres.
  const outsideImages = new Set();
  const outsideImageKey = src => (src.length > 200 ? src.slice(0, 200) + '#' + src.length : src);
  // Une image sans adresse n'a rien d'illisible, sauf une pièce jointe dont l'adresse n'a pas pu être posée (comptée comme illisible) et une image d'un autre site (comptée à part) : seules celles-là comptent.
  function noteImageWithoutSource(img) {
    if (img.getAttribute('data-attachment-id')) noteUnreadImage(img);
    else if (img.hasAttribute('data-external-src')) outsideImages.add(outsideImageKey((img.getAttribute('data-external-src') || '').trim()));
  }
  function unreadImageCount() { return unreadImages.size; }
  function outsideImageCount() { return outsideImages.size; }
  function resetUnreadImages() { unreadImages.clear(); outsideImages.clear(); }

  // Une image que le modèle lie à une donnée au lieu de lui donner une adresse : une pièce jointe de la ligne (data-var-*), un graphique de la page (data-chart-*), une vidéo (data-video, js/video-frame.js : son identifiant, sans adresse) ou un code QR dont le
  // texte cite une colonne (data-qr-text, sans adresse). La Lecture et les exports la dessinent pour la ligne (js/reader-mode.js). Partagé par l'export Markdown d'un modèle, qui l'écrit
  // en HTML en ligne, et par son import, qui la reprend telle quelle.
  const isMergeImage = img => img.hasAttribute('data-var-table') || img.hasAttribute('data-chart-section') || img.hasAttribute('data-chart-spec') || img.hasAttribute('data-video') || (img.hasAttribute('data-qr-text') && !(img.getAttribute('src') || '').trim());

  // La lecture des fichiers Office (OOXML) : ce que l'import Word (js/docx-import.js) et l'import PowerPoint (js/pptx-import.js) ont en commun, écrit une seule fois. Les noms XML se lisent par leur
  // nom LOCAL (`w:val` et `val`, `a:solidFill` et `solidFill` y sont le même : les fichiers « strict » et « transitional » se lisent pareil) ; un texte devient du balisage de l'éditeur sans caractère
  // illégal en XML, avec ses tabulations (js/tab-indent.js) et ses retours à la ligne. Les moteurs ne se lisent pas entre eux (js/export-engines.js) : le partage passe par ce fichier, chargé d'avance.
  const Ooxml = (function () {
    const NS_RELS = /relationships/;
    function fail(code, message, extra) { return Object.assign(new Error(message), { code }, extra || {}); }
    const matches = (el, names) => (Array.isArray(names) ? names.indexOf(el.localName) >= 0 : el.localName === names);
    function kids(el, names) {
      const out = [];
      if (!el) return out;
      for (let n = el.firstElementChild; n; n = n.nextElementSibling) if (!names || matches(n, names)) out.push(n);
      return out;
    }
    function kid(el, names) {
      if (!el) return null;
      for (let n = el.firstElementChild; n; n = n.nextElementSibling) if (matches(n, names)) return n;
      return null;
    }
    const at = (el, path) => path.split('/').reduce((node, name) => (node ? kid(node, name) : null), el);
    function descendants(el, name) { return el ? Array.from(el.getElementsByTagNameNS('*', name)) : []; }
    // Un attribut lu par son nom local, quel que soit son préfixe (`w:val`, `val`, `p14:dur`) ; null quand il manque.
    function localAttr(el, name) {
      if (!el) return null;
      for (let i = 0; i < el.attributes.length; i++) if (el.attributes[i].localName === name) return el.attributes[i].value;
      return null;
    }
    // Un attribut de relation (`r:embed`, `r:id`, `r:link`) : l'espace de noms le dit, pas le préfixe.
    function relAttr(el, name) {
      if (!el) return null;
      for (let i = 0; i < el.attributes.length; i++) {
        const attribute = el.attributes[i];
        if (attribute.localName === name && NS_RELS.test(attribute.namespaceURI || '')) return attribute.value;
      }
      return null;
    }
    // Un nombre lu par la façon de lire un attribut du moteur (`attr`) ; `fallback` quand il manque ou n'est pas un nombre.
    const numAttrOf = attr => (el, name, fallback) => {
      const value = attr(el, name);
      const n = value === null || value === '' ? NaN : Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const round2 = value => Math.round(value * 100) / 100;
    const fixed = value => String(round2(value));
    const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
    const escText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escAttr = text => escText(text).replace(/"/g, '&quot;');
    // Lu à l'appel : le nœud-tabulation est celui de js/tab-indent.js, chargé avant ce fichier mais qu'aucun autre ne garantit à la lecture de celui-ci.
    const tabMarkup = () => '<span class="' + TabIndent.CLASS + '" style="white-space: pre-wrap">' + TabIndent.TAB + '</span>';
    // Un texte en balisage : les espaces qui se suivent restent (la première ordinaire, les suivantes \u00a0 : l'éditeur lit « a   b » en « a b »), une tabulation devient le nœud-tabulation de l'éditeur, un retour à la ligne devient <br>.
    function spaced(text) {
      const tab = tabMarkup();
      return escText(String(text).replace(ILLEGAL, '')).replace(/\t/g, tab).replace(/ {2,}/g, run => ' ' + '\u00a0'.repeat(run.length - 1)).replace(/\r\n?|\n|\u000b/g, '<br>');
    }
    // Le chemin d'une partie visée par une relation (`target`) depuis la partie qui la porte ; null pour une adresse extérieure.
    function resolvePath(partPath, target) {
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
      const parts = target.charAt(0) === '/' ? [] : partPath.split('/').slice(0, -1);
      target.split('/').forEach((segment) => {
        if (segment === '..') parts.pop();
        else if (segment && segment !== '.') parts.push(segment);
      });
      return parts.join('/');
    }
    // Le paquet OPC (un zip de parties XML) : refuse ce qui n'en est pas un (ancien format binaire ou protégé par un mot de passe, pas un zip, zip illisible, trop gros une fois défait), puis rend ses
    // lectures : `xml(chemin)` (la partie en document, null si elle manque, passe `maxPart` ou ne se lit pas), `rels(partie)` (ses relations par identifiant : { type (le dernier mot), target (chemin dans
    // le paquet, ou null), href (adresse extérieure), external }), `fileOf(chemin)` (le fichier du zip, sans tenir compte des majuscules), `has(chemin)`, `zip`. `limits` : { maxUnpacked, maxPart } ;
    // `messages` : le texte de chaque refus, qui dit le genre de fichier (Word, PowerPoint) : { legacy, notPackage, unreadable, tooBig }.
    async function openPackage(buffer, { limits, messages }) {
      const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
      if (head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0) throw fail('legacy', messages.legacy);
      if (head[0] !== 0x50 || head[1] !== 0x4B) throw fail('unreadable', messages.notPackage);
      try {
        await ensureJsZipLoaded();
      } catch (e) {
        throw fail('library', 'La bibliothèque de lecture des fichiers n’a pas pu être chargée.', { cause: e });
      }
      let zip;
      try {
        zip = await JSZip.loadAsync(buffer);
      } catch (e) {
        throw fail('unreadable', messages.unreadable, { cause: e });
      }
      const names = new Map();
      Object.keys(zip.files).forEach((name) => { if (!zip.files[name].dir) names.set(name.toLowerCase(), name); });
      const unpacked = zipUnpackedBytes(zip);
      if (unpacked > limits.maxUnpacked) throw fail('tooBig', messages.tooBig, { size: unpacked, max: limits.maxUnpacked });
      const docs = new Map();
      const relsCache = new Map();
      const fileOf = path => (path ? zip.file(names.get(String(path).toLowerCase()) || path) : null);
      const parser = new DOMParser();
      async function xml(path) {
        if (!path) return null;
        if (docs.has(path)) return docs.get(path);
        let doc = null;
        const file = fileOf(path);
        if (file) {
          try {
            const text = await file.async('string');
            if (text.length <= limits.maxPart) {
              const parsed = parser.parseFromString(text, 'application/xml');
              doc = parsed.getElementsByTagName('parsererror').length ? null : parsed;
            }
          } catch (e) {
            doc = null;
          }
        }
        docs.set(path, doc);
        return doc;
      }
      async function rels(partPath) {
        if (relsCache.has(partPath)) return relsCache.get(partPath);
        const slash = partPath.lastIndexOf('/');
        const doc = await xml(partPath.slice(0, slash + 1) + '_rels/' + partPath.slice(slash + 1) + '.rels');
        const byId = new Map();
        const list = [];
        if (doc) {
          descendants(doc.documentElement, 'Relationship').forEach((el) => {
            const external = localAttr(el, 'TargetMode') === 'External';
            const targetText = localAttr(el, 'Target') || '';
            const entry = {
              id: localAttr(el, 'Id'), type: String(localAttr(el, 'Type') || '').split('/').pop(), external,
              target: external ? null : resolvePath(partPath, targetText), href: external ? targetText : null,
            };
            byId.set(entry.id, entry);
            list.push(entry);
          });
        }
        const result = { byId, list, ofType: type => list.filter(entry => entry.type === type) };
        relsCache.set(partPath, result);
        return result;
      }
      return { zip, fileOf, xml, rels, has: path => !!fileOf(path) };
    }
    // Ce que les deux imports se donnent en commun. Plafonds (en octets) : le fichier, le paquet une fois défait (plus, c'est une bombe de compression), une image, le poids des images reprises au
    // total (le modèle s'écrit dans une case de Grist). Le type d'image que le navigateur sait lire, par extension. La couleur du texte de l'éditeur (js/character-format.js) : un texte de cette
    // couleur n'en pose pas. Les polices que l'éditeur sait montrer ; toute autre est remplacée par la plus proche (`nearestFamily`, sur le nom en minuscules) et comptée au compte rendu, sauf Marianne et les polices libres du catalogue (`keptFamily`), dont le nom est gardé.
    const LIMITS = { file: 150 * 1024 * 1024, unpacked: 900 * 1024 * 1024, image: 25 * 1024 * 1024, images: 80 * 1024 * 1024 };
    const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
    const EDITOR_TEXT = '1b2430';
    const EDITOR_FONTS = new Set(['roboto', 'arial', 'times new roman', 'georgia', 'courier new', 'calibri']);
    function nearestFamily(key) {
      if (/^(calibri|carlito)/.test(key)) return 'Calibri';
      if (/^(arial|helvetica|arimo)/.test(key)) return 'Arial';
      if (key === 'georgia' || key === 'gelasio') return 'Georgia';
      if (/^(courier|consolas|lucida console|monaco|menlo|cascadia|source code|fira (code|mono)|andale mono|cousine|monospace)/.test(key)) return 'Courier New';
      if (/^(times|tinos|cambria|garamond|palatino|book antiqua|bookman|century (schoolbook|old)|constantia|baskerville|didot|bodoni|sitka|minion|perpetua|goudy|caslon|georgia pro|serif$)/.test(key)) return 'Times New Roman';
      return null;
    }
    // Le nom qu'un import GARDE tel quel au lieu de le remplacer par la plus proche : Marianne (police de l'État : le document est écrit en Marianne, le PDF la propose à l'export avec GFS) et les polices libres
    // de js/free-fonts.js (Open Sans, Lato, Inter...), que le PDF sait inclure à la demande (extensions/polices/libres.js). Le nom est celui de la liste, quelle que soit la casse du fichier ; null pour toute autre.
    function keptFamily(name) {
      const key = String(name || '').trim().toLowerCase();
      if (!key) return null;
      if (key === 'marianne') return 'Marianne';
      const font = typeof FreeFonts !== 'undefined' ? FreeFonts.find(key) : null;
      return font ? font.name : null;
    }
    return { fail, kids, kid, at, descendants, localAttr, relAttr, numAttrOf, round2, fixed, escText, escAttr, spaced, resolvePath, openPackage, LIMITS, IMAGE_TYPES, EDITOR_TEXT, EDITOR_FONTS, nearestFamily, keptFamily };
  })();

  // Les marques d'une série de caractères en balisage de l'éditeur : ce que l'import Word (js/docx-import.js) et l'import OpenDocument (js/odt-import.js) écrivent de la même façon. Une série de caractères est
  // { text, look: { style (déclarations CSS), b, i, u, uLine, s, sup, sub }, key, link, caps, track, comments } ; un élément `raw` (image, note, numéro de page) reste seul.
  const Markup = (function () {
    const { escAttr, spaced } = Ooxml;
    // Le texte `inner` (déjà en balisage) avec les marques de la série de caractères, dans l'ordre de l'éditeur (js/pptx-import.js:runMarkup).
    function wrapRun(inner, look, link, track, comments) {
      let html = look.style.length ? '<span style="' + look.style.join('; ') + '">' + inner + '</span>' : inner;
      if (look.b) html = '<strong>' + html + '</strong>';
      if (look.i) html = '<em>' + html + '</em>';
      if (look.u) html = look.uLine ? '<u style="text-decoration-style: ' + look.uLine + '">' + html + '</u>' : '<u>' + html + '</u>';
      if (look.s) html = '<s>' + html + '</s>';
      if (look.sup) html = '<sup>' + html + '</sup>';
      else if (look.sub) html = '<sub>' + html + '</sub>';
      if (link) html = '<a href="' + escAttr(link) + '">' + html + '</a>';
      // Les marques de l'éditeur qui ne changent pas l'aspect : le fil de commentaire (js/comments.js), puis la modification suivie (js/track-changes.js : `<ins>` ou `<del>` et son numéro).
      if (comments) comments.forEach((c) => { html = '<span class="comment-mark" data-comment-id="' + escAttr(c.id) + '" data-resolved="' + (c.resolved ? 'true' : 'false') + '">' + html + '</span>'; });
      if (track) html = trackWrap(html, track);
      return html;
    }
    const trackWrap = (html, track) => '<' + (track.kind === 'del' ? 'del' : 'ins') + ' data-id="' + track.id + '">' + html + '</' + (track.kind === 'del' ? 'del' : 'ins') + '>';
    // Les séries de caractères qui se suivent avec le même aspect ne font qu'un (Word en coupe à chaque correction ou révision) ; un élément `raw` (image, note, numéro de page) reste seul.
    function itemsHtml(items) {
      let out = '';
      for (let i = 0; i < items.length;) {
        const item = items[i];
        if (item.raw !== undefined) { out += item.raw; i += 1; continue; }
        let text = item.text;
        let j = i + 1;
        while (j < items.length && items[j].raw === undefined && items[j].key === item.key) { text += items[j].text; j += 1; }
        out += wrapRun(spaced(item.caps ? text.toLocaleUpperCase() : text), item.look, item.link, item.track, item.comments);
        i = j;
      }
      return out;
    }
    const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
    function safeHref(href) {
      const text = String(href || '').trim();
      return SAFE_LINK.test(text) && !/[\u0000-\u001f\s]/.test(text) ? text : '';
    }
    // Un champ de fusion (Word, OpenDocument) devient la variable de la colonne du même nom dans la table courante, quand elle existe et qu'une seule colonne porte ce nom ('' : il reste son texte). Le nom se
    // compare sans tenir compte des majuscules ni des accents, un blanc valant un trait bas (Word écrit « Prénom_du_client » pour « Prénom du client »).
    const plainName = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_]+/g, '_').trim();
    function mergeFieldHtml(name) {
      try {
        const wanted = plainName(name);
        const table = GristAPI.getCurrentTableId();
        if (!wanted || !table) return '';
        const matches = GristAPI.getAllVariables().filter(v => v.table === table && (plainName(v.column) === wanted || plainName(GristAPI.getColumnLabel(v.table, v.column)) === wanted));
        return matches.length === 1 ? EditorNodes.varBadgeHtml({ table: matches[0].table, column: matches[0].column, key: matches[0].key }) : '';
      } catch (e) {
        return '';
      }
    }
    // Le numéro de page de l'éditeur (js/editor-nodes.js : la bulle du format « # », que l'export et l'aperçu remplacent par le vrai numéro) ; son libellé compte comme du contenu : un pied de page qui ne porte que lui n'est pas vide.
    const pageNumberHtml = () => '<span class="page-number-badge" contenteditable="false" data-format="n">#</span>';
    return { wrapRun, trackWrap, itemsHtml, safeHref, mergeFieldHtml, pageNumberHtml };
  })();

  // La lecture des fichiers OpenDocument (ODT, ODS, ODP : js/odt-import.js et ses frères) : ce qu'ils ont en commun, écrit une seule fois. Un fichier OpenDocument est un zip (JSZip) de parties XML - `content.xml`,
  // `styles.xml`, `meta.xml`, `META-INF/manifest.xml`, les images dans `Pictures/` - ou, en « flat », un seul fichier XML (.fodt, .fods, .fodp). Les noms se lisent par leur ESPACE de noms, jamais par leur préfixe
  // (`text:p` s'écrit parfois autrement) : `name(el)` rend « text:p », `attr(el, 'fo:color')` lit un attribut. Rien n'est exécuté : les macros du fichier ne sont jamais lues.
  const Odf = (function () {
    const { fail, kids, kid, descendants } = Ooxml;
    const NS = {
      office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
      style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
      text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
      table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
      draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
      fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
      svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
      number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
      presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
      smil: 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0',
      anim: 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
      manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
      xlink: 'http://www.w3.org/1999/xlink',
      dc: 'http://purl.org/dc/elements/1.1/',
      meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
      loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0',
      xml: 'http://www.w3.org/XML/1998/namespace',
      calcext: 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
    };
    const PREFIX_OF = {};
    Object.keys(NS).forEach((prefix) => { PREFIX_OF[NS[prefix]] = prefix; });
    const name = el => (el ? (PREFIX_OF[el.namespaceURI] || '?') + ':' + el.localName : '');
    // Un attribut par son nom qualifié (`fo:color`, `style:name`) ; null quand il manque.
    function attr(el, qname) {
      if (!el) return null;
      const cut = qname.indexOf(':');
      const value = el.getAttributeNS(NS[qname.slice(0, cut)] || '', qname.slice(cut + 1));
      return value === '' && !el.hasAttributeNS(NS[qname.slice(0, cut)] || '', qname.slice(cut + 1)) ? null : value;
    }
    // Tous les attributs d'un élément en objet { 'fo:color': '#c80000', ... } (noms qualifiés) ; vide quand l'élément manque.
    function attrs(el) {
      const out = {};
      if (!el) return out;
      for (let i = 0; i < el.attributes.length; i++) {
        const entry = el.attributes[i];
        const prefix = PREFIX_OF[entry.namespaceURI];
        out[(prefix ? prefix + ':' : '') + entry.localName] = entry.value;
      }
      return out;
    }
    // Les enfants dont le nom qualifié est dans `names` (un nom ou une liste) ; tous sans `names`.
    function children(el, names) {
      const list = Array.isArray(names) ? names : (names ? [names] : null);
      return kids(el).filter(child => !list || list.indexOf(name(child)) >= 0);
    }
    const child = (el, names) => children(el, names)[0] || null;
    // Une longueur (« 0.25in », « 1.27cm », « 10mm », « 12pt », « 1pc », « 16px ») en points ; `percentOf` donne la base d'un pourcentage ; null quand ce n'en est pas une.
    function toPoints(value, percentOf) {
      const m = /^\s*(-?\d*\.?\d+)\s*(in|cm|mm|pt|pc|px|%)?\s*$/.exec(String(value === null || value === undefined ? '' : value));
      if (!m) return null;
      const n = Number(m[1]);
      switch (m[2]) {
        case 'in': return n * 72;
        case 'cm': return n * 72 / 2.54;
        case 'mm': return n * 72 / 25.4;
        case 'pc': return n * 12;
        case 'px': return n * 0.75;
        case '%': return percentOf === undefined || percentOf === null ? null : n * percentOf / 100;
        default: return m[2] === 'pt' || m[2] === undefined ? n : null;
      }
    }
    const MIMES = { text: 'text', 'text-template': 'text', 'text-master': 'text', 'text-web': 'text', spreadsheet: 'spreadsheet', 'spreadsheet-template': 'spreadsheet', presentation: 'presentation', 'presentation-template': 'presentation', graphics: 'graphics', 'graphics-template': 'graphics' };
    const BODIES = { 'office:text': 'text', 'office:spreadsheet': 'spreadsheet', 'office:presentation': 'presentation', 'office:drawing': 'graphics' };
    // Le fichier OpenDocument : refuse ce qui n'en est pas un (ni zip ni XML, zip illisible, partie principale absente, protégé par un mot de passe, trop gros une fois défait) puis rend ses lectures :
    // `kind` (`text`, `spreadsheet`, `presentation`, `graphics` ou ''), `body` (l'élément `office:text`...), `contentDoc` et `stylesDoc` (les documents ; le même en « flat »), `sections(nom)` (les
    // éléments `office:styles`, `office:automatic-styles`, `office:font-face-decls`, `office:master-styles` de tous les documents), `fileOf(chemin)` et `has(chemin)` (une partie du zip).
    // `limits` : { maxUnpacked, maxPart } ; `messages` : { notPackage, unreadable, tooBig, encrypted }.
    async function open(buffer, { limits, messages }) {
      const head = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
      const parser = new DOMParser();
      const parse = (text) => {
        const parsed = parser.parseFromString(text, 'application/xml');
        return parsed.getElementsByTagName('parsererror').length ? null : parsed;
      };
      let contentDoc = null;
      let stylesDoc = null;
      let mime = '';
      let zip = null;
      let fileOf = () => null;
      let flat = false;
      if (head[0] === 0x50 && head[1] === 0x4B) {
        try {
          await ensureJsZipLoaded();
        } catch (e) {
          throw fail('library', 'La bibliothèque de lecture des fichiers n’a pas pu être chargée.', { cause: e });
        }
        try {
          zip = await JSZip.loadAsync(buffer);
        } catch (e) {
          throw fail('unreadable', messages.unreadable, { cause: e });
        }
        const names = new Map();
        Object.keys(zip.files).forEach((entry) => { if (!zip.files[entry].dir) names.set(entry.toLowerCase(), entry); });
        const unpacked = zipUnpackedBytes(zip);
        if (unpacked > limits.maxUnpacked) throw fail('tooBig', messages.tooBig, { size: unpacked, max: limits.maxUnpacked });
        fileOf = path => (path ? zip.file(names.get(String(path).toLowerCase()) || path) : null);
        const read = async (path) => {
          const file = fileOf(path);
          if (!file) return null;
          try {
            const text = await file.async('string');
            return text.length <= limits.maxPart ? parse(text) : null;
          } catch (e) {
            return null;
          }
        };
        const manifest = fileOf('META-INF/manifest.xml');
        if (manifest) {
          const text = await manifest.async('string').catch(() => '');
          if (/encryption-data/.test(text)) throw fail('encrypted', messages.encrypted);
        }
        const type = fileOf('mimetype');
        if (type) mime = String(await type.async('string').catch(() => '')).trim();
        contentDoc = await read('content.xml');
        stylesDoc = await read('styles.xml');
        if (!contentDoc || name(contentDoc.documentElement) !== 'office:document-content') throw fail('unreadable', messages.notPackage);
      } else {
        // Un fichier « flat » : tout le document tient dans un seul XML.
        let text = '';
        try {
          text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        } catch (e) {
          throw fail('unreadable', messages.unreadable, { cause: e });
        }
        if (!/^﻿?\s*<(\?xml|office:document)/.test(text.slice(0, 200))) throw fail('unreadable', messages.notPackage);
        if (text.length > limits.maxPart) throw fail('tooBig', messages.tooBig, { size: text.length, max: limits.maxPart });
        contentDoc = parse(text);
        if (!contentDoc || name(contentDoc.documentElement) !== 'office:document') throw fail('unreadable', messages.notPackage);
        stylesDoc = contentDoc;
        flat = true;
        mime = attr(contentDoc.documentElement, 'office:mimetype') || '';
      }
      const bodyHolder = child(contentDoc.documentElement, 'office:body');
      const body = bodyHolder ? kids(bodyHolder)[0] || null : null;
      const bodyKind = body ? BODIES[name(body)] || '' : '';
      const mimeKind = MIMES[mime.replace(/^application\/vnd\.oasis\.opendocument\./, '').replace(/-flat-xml$/, '')] || '';
      const documents = flat ? [contentDoc] : [contentDoc, stylesDoc].filter(Boolean);
      const sections = sectionName => documents.map(doc => child(doc.documentElement, sectionName)).filter(Boolean);
      return { kind: bodyKind || mimeKind, mime, flat, body, contentDoc, stylesDoc, sections, fileOf, has: path => !!fileOf(path), zip, descendants };
    }
    // Le genre d'un fichier OpenDocument (`text`, `spreadsheet`, `presentation`, `graphics`), lu sans le défaire : l'entrée `mimetype` d'un zip, ou l'attribut `office:mimetype` en tête d'un fichier « flat » ;
    // '' quand le fichier ne le dit pas (c'est alors `open` qui juge). Sert à choisir le moteur d'import (texte ou tableur) avant d'en charger un.
    async function kindOf(buffer) {
      try {
        const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        let mime = '';
        if (head[0] === 0x50 && head[1] === 0x4B) {
          await ensureJsZipLoaded();
          const zip = await JSZip.loadAsync(buffer);
          const entry = zip.file('mimetype');
          mime = entry ? String(await entry.async('string')).trim() : '';
        } else {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer, 0, Math.min(4096, buffer.byteLength)));
          mime = (/office:mimetype="([^"]+)"/.exec(text) || [])[1] || '';
        }
        return MIMES[mime.replace(/^application\/vnd\.oasis\.opendocument\./, '').replace(/-flat-xml$/, '')] || '';
      } catch (e) {
        return '';
      }
    }
    return { NS, name, attr, attrs, children, child, descendants, toPoints, open, kindOf };
  })();

  // L'écriture des fichiers OpenDocument (js/odt-export.js, js/ods-export.js) : ce que les moteurs d'export ont en commun, écrit une seule fois - les espaces de noms, l'en-tête XML, le texte et les attributs sans
  // caractère interdit, et le texte d'un paragraphe comme OpenDocument le lit.
  const OdfXml = (function () {
    const NAMESPACES = [
      ['office', 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'], ['style', 'urn:oasis:names:tc:opendocument:xmlns:style:1.0'], ['text', 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'],
      ['table', 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'], ['draw', 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0'], ['fo', 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0'],
      ['svg', 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0'], ['xlink', 'http://www.w3.org/1999/xlink'], ['dc', 'http://purl.org/dc/elements/1.1/'], ['meta', 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0'],
      ['number', 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0'], ['manifest', 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'], ['config', 'urn:oasis:names:tc:opendocument:xmlns:config:1.0'],
    ];
    const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';
    const namespaceAttrs = NAMESPACES.map(entry => 'xmlns:' + entry[0] + '="' + entry[1] + '"').join(' ');

    // --- Le XML ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    // Un texte pour un élément ou un attribut : les caractères que XML 1.0 interdit sont retirés (un seul suffit à rendre tout le fichier illisible), puis les quatre signes réservés sont écrits.
    const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
    const escText = text => String(text === null || text === undefined ? '' : text).replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escAttr = text => escText(text).replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
    const fixed = (value, digits) => String(Math.round(value * Math.pow(10, digits === undefined ? 3 : digits)) / Math.pow(10, digits === undefined ? 3 : digits));
    const attrsOf = (list) => list.filter(pair => pair[1] !== null && pair[1] !== undefined && pair[1] !== '').map(pair => ' ' + pair[0] + '="' + escAttr(pair[1]) + '"').join('');
    // Le texte d'un paragraphe comme OpenDocument le lit : les blancs qui se suivent n'en font qu'un, et le premier blanc d'un paragraphe ne compte pas ; une suite d'espaces s'écrit donc `text:s`, une tabulation
    // `text:tab`, un retour à la ligne `text:line-break`. `state.blank` : le caractère d'avant est un blanc (ou le paragraphe commence).
    function textXml(raw, state) {
      const text = String(raw === null || raw === undefined ? '' : raw).replace(INVALID_XML, '').replace(/\r\n?/g, '\n');
      let out = '';
      let index = 0;
      while (index < text.length) {
        const char = text[index];
        if (char === ' ') {
          let run = 1;
          while (text[index + run] === ' ') run += 1;
          if (state.blank) out += '<text:s' + (run > 1 ? ' text:c="' + run + '"' : '') + '/>';
          else out += ' ' + (run > 1 ? '<text:s' + (run > 2 ? ' text:c="' + (run - 1) + '"' : '') + '/>' : '');
          state.blank = true;
          index += run;
        } else if (char === '\t') {
          out += '<text:tab/>';
          state.blank = true;
          index += 1;
        } else if (char === '\n') {
          out += '<text:line-break/>';
          state.blank = true;
          index += 1;
        } else {
          let end = index + 1;
          while (end < text.length && !/[ \t\n]/.test(text[end])) end += 1;
          out += escText(text.slice(index, end));
          state.blank = false;
          index = end;
        }
      }
      return out;
    }
    return { NAMESPACES, XML_HEAD, namespaceAttrs, escText, escAttr, fixed, attrsOf, textXml };
  })();

  return { EDITOR_STYLE, taskEntryOf, taskListHtml, codeEntryOf, groupedBlocks, hexOf, cssColorHex, scriptRefusal, loadScriptOnce, ensureJsZipLoaded, zipUnpackedBytes, downloadBlob, attachMeasureHost, anchorFirstPageImages, fillEmptyBlocks, fillTrailingBreaks, tableRows, cellsOf, spanOf, placeCells, measuredColumnWidthsPx, zoneColumnWidthPx, shownImageWidthPx, gridLinesHidden, rowHeightPx, cellVerticalAlign, cellBorderSides, gridRowSegments, fitColumnWidths, hasTableChild, segmentsAroundTables, isBlankSegment, resolveHeaderFooterVariables,
    resolveRecord, codeLinesOf, calloutMetricsPx, headerRowCount, noteUnreadImage, noteImageWithoutSource, unreadImageCount, outsideImageCount, resetUnreadImages, isMergeImage, Ooxml, Markup, Odf, OdfXml };
})();
