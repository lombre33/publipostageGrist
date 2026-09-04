// Module export PDF : génère un PDF A4 portrait à partir du contenu résolu (mode lecture)
// v1.4.0 : ajout du mécanisme `pagebreak` html2pdf pour transformer chaque
// `.page-break-marker` (inséré via le nouveau Blot Quill `PageBreakBlot`)
// en saut de page RÉEL dans le PDF généré.
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
    // v1.4.1 — Masquer le label visuel "— Saut de page —" à l'export PDF :
    //   le Blot Quill `PageBreakBlot` insère ce span dans le DOM (cf. editor.js)
    //   pour l'affichage éditeur, mais html2pdf/html2canvas le capture aussi
    //   et l'imprime dans le PDF. On retire ici uniquement les labels visibles ;
    //   les `.page-break-marker` (avec `page-break-after: always`) sont conservés
    //   afin que html2pdf continue à générer un saut de page RÉEL.
    container.querySelectorAll('.page-break-marker .page-break-label').forEach(function (label) {
      label.remove();
    });
    document.body.appendChild(container);

    const opt = {
      margin: 10,
      filename: (filename || 'publipostage') + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
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
      console.log('[pdf-export] avant génération PDF:', opt.filename);
      await html2pdf().set(opt).from(container).save();
      console.log('[pdf-export] génération PDF terminée:', opt.filename);
    } finally {
      document.body.removeChild(container);
    }
  }

  return { exportCurrentRecord };
})();
