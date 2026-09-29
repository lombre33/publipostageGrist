// Export « toutes les lignes en un seul PDF » (cf. js/main.js:onExportBatch) : chaque ligne est rendue exactement comme pour le ZIP
// (PdfExport.getNativePdfBlobForRecord), puis pdf-lib recopie ses pages à la suite dans un seul document. En-tête/pied de page, numéros de page ("1/2") et
// notes restent donc ceux de CHAQUE ligne, et chaque ligne commence sur une nouvelle page par construction. Chargé à la demande, hors du lot de
// PdfExport.ensurePdfLibsLoaded : aucun autre export n'en a besoin.
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

  return { ensureLibLoaded, create };
})();
