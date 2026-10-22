// Export « toutes les lignes en un seul PDF » (js/main.js:onExportBatch) : chaque ligne est rendue exactement comme pour le ZIP
// (PdfExport.getNativePdfBlobForRecord), puis pdf-lib recopie ses pages à la suite dans un seul document. L'en-tête, le pied, les numéros de page
// (« 1/2 ») et les notes restent donc ceux de chaque ligne, et chaque ligne commence sur une nouvelle page. Chargé à la demande, hors du lot de
// PdfExport.ensurePdfLibsLoaded : seuls en ont besoin ce PDF unique et le PDF d'un document qui mêle des formats de page (`joinParts`). `createSheets` sert l'« Assemblage
// avant impression » (js/sheet-layout.js) : les mêmes PDF par ligne, posés sur des feuilles.
const PdfMerge = (function () {
  // `integrity` (SRI sha384) : même recette que js/pdf-export.js ; fichier identique octet pour octet à dist/pdf-lib.min.js du paquet npm
  // pdf-lib@1.17.1.
  const PDF_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI' };
  let libPromise = null;
  function ensureLibLoaded() {
    if (!libPromise) {
      libPromise = (window.PDFLib ? Promise.resolve() : ExportCommon.loadScriptOnce(PDF_LIB)).catch(e => { libPromise = null; throw e; });
    }
    return libPromise;
  }

  // Les destinations nommées d'un PDF (js/pdf-export.js en écrit une par titre que le sommaire cite et une par signet) : nom -> { page, left, top }, lues dans l'arbre de noms du
  // document ; `page` est le rang de la page, à partir de 0. pdf-lib ne recopie pas cet arbre avec les pages : les liens d'une ligne (ceux de son sommaire, ceux qui mènent à un signet) y restent
  // des noms que le document réuni ne connaît plus.
  function namedDestinationsOf(src) {
    const { PDFName, PDFDict, PDFArray, PDFNumber, PDFString, PDFHexString } = window.PDFLib;
    const destinations = new Map();
    const pageTags = src.getPages().map(page => page.ref.tag);
    const numberOf = value => (value instanceof PDFNumber ? value.asNumber() : null);
    const visit = (node, depth) => {
      if (!node || depth > 8) return;
      const names = node.lookupMaybe(PDFName.of('Names'), PDFArray);
      for (let i = 0; names && i + 1 < names.size(); i += 2) {
        const key = names.lookupMaybe(i, PDFString, PDFHexString);
        const value = names.lookup(i + 1);
        const array = value instanceof PDFDict ? value.lookupMaybe(PDFName.of('D'), PDFArray) : value;
        const page = array instanceof PDFArray && array.get(0) ? pageTags.indexOf(array.get(0).tag) : -1;
        if (key && page >= 0) destinations.set(key.decodeText(), { page, left: numberOf(array.lookup(2)), top: numberOf(array.lookup(3)) });
      }
      const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
      for (let i = 0; kids && i < kids.size(); i++) visit(kids.lookupMaybe(i, PDFDict), depth + 1);
    };
    const names = src.catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
    visit(names && names.lookupMaybe(PDFName.of('Dests'), PDFDict), 0);
    return destinations;
  }

  // Les liens d'un sommaire ou d'un signet, copiés avec leurs pages, nomment encore une destination du PDF d'origine : chacun prend l'adresse que ce nom désignait (la page
  // copiée et le haut du titre ou du bloc). Un nom que le PDF d'origine ne connaissait pas reste comme il était.
  function relinkNamedDestinations(merged, copied, destinations) {
    if (!destinations.size) return;
    const { PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = window.PDFLib;
    copied.forEach(page => {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      for (let i = 0; annots && i < annots.size(); i++) {
        const annot = annots.lookupMaybe(i, PDFDict);
        const action = annot && annot.lookupMaybe(PDFName.of('A'), PDFDict);
        const name = action && action.lookupMaybe(PDFName.of('D'), PDFString, PDFHexString);
        const target = name && destinations.get(name.decodeText());
        if (target && copied[target.page]) action.set(PDFName.of('D'), merged.context.obj([copied[target.page].ref, 'XYZ', target.left, target.top, null]));
      }
    });
  }

  // Document vide auquel `append(blob)` ajoute toutes les pages d'un PDF, dans l'ordre des appels. Une ligne à la fois plutôt qu'une liste de blobs
  // fusionnée à la fin : seul le document en construction reste en mémoire, pas les PDF de toute la table en même temps. Les liens du sommaire et des signets d'une
  // ligne gardent leur cible (relinkNamedDestinations).
  async function create(title) {
    await ensureLibLoaded();
    const merged = await window.PDFLib.PDFDocument.create();
    if (title) merged.setTitle(title);
    return {
      async append(blob) {
        const src = await window.PDFLib.PDFDocument.load(await blob.arrayBuffer());
        const destinations = namedDestinationsOf(src);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(page => merged.addPage(page));
        relinkNamedDestinations(merged, pages, destinations);
      },
      async toBlob() {
        return new Blob([await merged.save()], { type: 'application/pdf' });
      },
    };
  }

  // Les PDF d'UN seul document, mis en page suite par suite de pages de même format (js/pdf-export.js:renderRuns : un macro-modèle qui mêle des pages A4 et des diapositives), réunis en un seul
  // dans l'ordre. Comme `create`, mais les destinations nommées de TOUS les PDF servent à relier les liens de chacun : le sommaire d'une suite mène à un titre qui est dans une autre.
  async function joinParts(title, blobs) {
    await ensureLibLoaded();
    const { PDFDocument } = window.PDFLib;
    const merged = await PDFDocument.create();
    if (title) merged.setTitle(title);
    const copied = [];
    const destinations = new Map();
    for (const blob of blobs) {
      const src = await PDFDocument.load(await blob.arrayBuffer());
      namedDestinationsOf(src).forEach((target, name) => destinations.set(name, Object.assign({}, target, { page: copied.length + target.page })));
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(page => { merged.addPage(page); copied.push(page); });
    }
    relinkNamedDestinations(merged, copied, destinations);
    return new Blob([await merged.save()], { type: 'application/pdf' });
  }

  // Planches (« Assemblage avant impression », js/sheet-layout.js) : même principe que `create`, mais chaque page reçue est posée dans l'emplacement
  // suivant d'une feuille au lieu d'être recopiée à la suite : les pages d'une ligne, puis celles de la ligne d'après, une par emplacement ; une
  // feuille neuve s'ouvre dès que la précédente est pleine, avec ses traits de coupe (peints avant les pages : ils sont hors de la grille). `layout`
  // est le résultat de SheetLayout.compute : la feuille, l'échelle et les emplacements en points, origine en haut à gauche (pdf-lib a la sienne en
  // bas : y est retourné ici). Les pages sont intégrées telles quelles (embedPdf : le texte reste du texte vectoriel, la page est rognée à son
  // cadre), seulement mises à l'échelle de leur emplacement.
  // Les liens cliquables d'une page n'y survivent pas (une annotation n'est pas dans le contenu de la page) : une planche est faite pour être
  // imprimée.
  async function createSheets(title, layout) {
    await ensureLibLoaded();
    const { PDFDocument, cmyk } = window.PDFLib;
    const out = await PDFDocument.create();
    if (title) out.setTitle(title);
    const black = cmyk(0, 0, 0, 1); // le noir seul de l'imprimerie : un trait de coupe ne doit jamais sortir en quadrichromie
    const sheetHeight = layout.sheet.height;
    let sheet = null;
    let used = 0;
    let sheets = 0;
    let pages = 0;
    function openSheet() {
      sheet = out.addPage([layout.sheet.width, sheetHeight]);
      used = 0;
      sheets++;
      layout.cutMarks.forEach(mark => sheet.drawLine({
        start: { x: mark.x1, y: sheetHeight - mark.y1 }, end: { x: mark.x2, y: sheetHeight - mark.y2 }, thickness: layout.markWidth, color: black,
      }));
    }
    return {
      async append(blob) {
        const src = await PDFDocument.load(await blob.arrayBuffer());
        const embedded = await out.embedPdf(src, src.getPageIndices());
        embedded.forEach(page => {
          if (!sheet || used >= layout.count) openSheet();
          const slot = layout.slots[used++];
          // La page tient dans son emplacement à l'échelle de la planche ; une page d'une autre taille que celle du modèle (la page paysage d'un macro-modèle
          // « Selon chaque modèle », dont l'emplacement suit la page du macro-modèle) y est ajustée et centrée plutôt que rognée.
          const fit = Math.min(slot.width / page.width, slot.height / page.height);
          const width = page.width * fit;
          const height = page.height * fit;
          sheet.drawPage(page, { x: slot.x + (slot.width - width) / 2, y: sheetHeight - slot.y - slot.height + (slot.height - height) / 2, width, height });
          pages++;
        });
      },
      async toBlob() {
        return new Blob([await out.save()], { type: 'application/pdf' });
      },
      get sheetCount() { return sheets; },
      get pageCount() { return pages; },
    };
  }

  return { ensureLibLoaded, create, createSheets, joinParts };
})();
