// Export « toutes les lignes en un seul PDF » (cf. js/main.js:onExportBatch) : chaque ligne est rendue exactement comme pour le ZIP
// (PdfExport.getNativePdfBlobForRecord), puis pdf-lib recopie ses pages à la suite dans un seul document. En-tête/pied de page, numéros de page ("1/2") et
// notes restent donc ceux de CHAQUE ligne, et chaque ligne commence sur une nouvelle page par construction. Chargé à la demande, hors du lot de
// PdfExport.ensurePdfLibsLoaded : aucun autre export n'en a besoin. `createSheets` sert l'« Assemblage avant impression » (js/sheet-layout.js) : les mêmes PDF par ligne, posés sur des feuilles.
const PdfMerge = (function () {
  // `integrity` (SRI sha384) : même recette que js/pdf-export.js. Fichier identique octet pour octet à dist/pdf-lib.min.js du paquet npm pdf-lib@1.17.1.
  const PDF_LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI' };
  let libPromise = null;
  function ensureLibLoaded() {
    if (!libPromise) {
      libPromise = (window.PDFLib ? Promise.resolve() : ExportCommon.loadScriptOnce(PDF_LIB)).catch(e => { libPromise = null; throw e; });
    }
    return libPromise;
  }

  // Document vide auquel `append(blob)` ajoute toutes les pages d'un PDF, dans l'ordre des appels. Une ligne à la fois plutôt qu'une liste de blobs fusionnée
  // à la fin : seul le document en construction reste en mémoire, pas les PDF de toute la table en même temps.
  async function create(title) {
    await ensureLibLoaded();
    const merged = await window.PDFLib.PDFDocument.create();
    if (title) merged.setTitle(title);
    return {
      async append(blob) {
        const src = await window.PDFLib.PDFDocument.load(await blob.arrayBuffer());
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(page => merged.addPage(page));
      },
      async toBlob() {
        return new Blob([await merged.save()], { type: 'application/pdf' });
      },
    };
  }

  // Planches (« Assemblage avant impression », js/sheet-layout.js) : même principe que `create`, mais chaque page reçue est POSÉE dans l'emplacement suivant d'une feuille au lieu d'être recopiée à
  // la suite - les pages d'une ligne, puis celles de la ligne d'après, une par emplacement ; une feuille neuve s'ouvre dès que la précédente est pleine, avec ses traits de coupe (peints avant les
  // pages : ils sont hors de la grille). `layout` est le résultat de SheetLayout.compute : la feuille, l'échelle et les emplacements en points, origine en haut à gauche (pdf-lib a la sienne en bas :
  // y est retourné ici). Les pages sont intégrées telles quelles (embedPdf : le texte reste du texte vectoriel, la page est rognée à son cadre), seulement mises à l'échelle de leur emplacement.
  // Les liens cliquables d'une page n'y survivent pas (une annotation n'est pas dans le contenu de la page) : une planche est faite pour être imprimée.
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
          // La page tient dans son emplacement à l'échelle de la planche ; une page d'une autre taille que celle du modèle (aucune aujourd'hui) y est ajustée et centrée plutôt que rognée.
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

  return { ensureLibLoaded, create, createSheets };
})();
