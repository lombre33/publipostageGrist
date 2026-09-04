// Module export PDF : génère un PDF A4 portrait à partir du contenu résolu (mode lecture)
// v1.4.0 : ajout du mécanisme `pagebreak` html2pdf pour transformer chaque
// `.page-break-marker` (inséré via le nouveau Blot Quill `PageBreakBlot`)
// en saut de page RÉEL dans le PDF généré.
const PdfExport = (function () {
  // Standard conserve exactement le rendu historique ; high et print privilégient
  // la résolution raster, avec compression jsPDF désactivée.
  const QUALITY_PRESETS = {
    standard: { label: 'Standard', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 } },
    high: { label: 'Haute qualité', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 4 }, jsPDF: { compress: false } },
    print: { label: 'Impression (HD)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } }
  };
  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.standard; }

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality) {
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

    // Le marqueur Quill contient un libellé et une bordure destinés à l'éditeur.
    // Les neutraliser dans le DOM temporaire d'export évite qu'html2canvas ne
    // les rasterise, tout en conservant l'élément et ses propriétés de saut de
    // page pour html2pdf.pagebreak (mode CSS).
    container.querySelectorAll('.page-break-marker').forEach((marker) => {
      marker.innerHTML = '';
      marker.style.border = '0';
      marker.style.background = 'transparent';
      marker.style.color = 'transparent';
      marker.style.height = '0';
      marker.style.margin = '0';
      marker.style.pageBreakAfter = 'always';
      marker.style.breakAfter = 'page';
    });

    document.body.appendChild(container);

    const preset = getQualityPreset(quality);
    const opt = {
      margin: 10,
      filename: (filename || 'publipostage') + '.pdf',
      image: preset.image,
      html2canvas: preset.html2canvas,
      jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}),
      // v1.4.0 — sauts de page forcés :
      //   - mode 'css' : html2pdf détecte tout élément portant
      //     `page-break-after: always` (cf. style.css `.page-break-marker`)
      //     et coupe la page juste après.
      //   - mode 'legacy' : filet de sécurité pour les rares cas où le
      //     rendu html2canvas ignorerait la propriété CSS.
      //   - avoid '.var-badge' : empêche html2pdf de couper au milieu d'un
      //     badge de variable (#Table_Colonne), qui est insécable.
      pagebreak: { mode: ['css', 'legacy'], avoid: '.var-badge' }
    };

    try {
      console.log('[pdf-export] avant génération PDF:', opt.filename, 'qualité=', preset.label);
      await html2pdf().set(opt).from(container).save();
      console.log('[pdf-export] génération PDF terminée:', opt.filename, 'qualité=', preset.label);
    } finally {
      document.body.removeChild(container);
    }
  }

  return { exportCurrentRecord };
})();
