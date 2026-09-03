// Module export PDF : génère un PDF A4 portrait à partir du contenu résolu (mode lecture)
const PdfExport = (function () {
  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate) {
    if (!record) {
      alert("Aucune ligne sélectionnée : impossible d'exporter en PDF.");
      return;
    }
    const resolvedHtml = await ReaderMode.getResolvedHTML(htmlContent, currentTableId, record);
    const filename = await ReaderMode.getResolvedFilename(filenameTemplate, currentTableId, record);

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
      await html2pdf().set(opt).from(container).save();
    } finally {
      document.body.removeChild(container);
    }
  }

  return { exportCurrentRecord };
})();
