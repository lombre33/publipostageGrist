// Module export PDF : génère un PDF A4 portrait à partir du contenu résolu (mode lecture)
const PdfExport = (function () {
  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate) {
    if (!record) {
      alert("Aucune ligne sélectionnée : impossible d'exporter en PDF.");
      return;
    }
    // BUG 3 — reader-mode.js expose désormais `preview` et `resolveFilename`
    // (anciens noms getResolvedHTML / getResolvedFilename qui n'existent plus).
    console.log('[pdf-export] avant résolution du contenu et du nom de fichier.');
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    console.log('[pdf-export] après résolution', { filename, htmlLength: (resolvedHtml || '').length });

    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.innerHTML = resolvedHtml;
    document.body.appendChild(container);

    const opt = {
      margin: 10,
      filename: (filename || 'publipostage') + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      console.log('[pdf-export] avant génération PDF:', opt.filename);
      await html2pdf().set(opt).from(container).save();
      console.log('[pdf-export] génération PDF terminée:', opt.filename);
    } finally {
      document.body.removeChild(container);
    }
  }

  return { exportCurrentRecord };
})();
