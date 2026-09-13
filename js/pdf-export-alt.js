// Qualités PDF non-vectorielles — impression navigateur et raster (basse/ultra HD via html2pdf.js). Isolées de js/pdf-export.js (moteur vectoriel pdfmake) :
// ces deux chemins capturent le vrai DOM résolu plutôt qu'un docDefinition. Désactivées dans l'UI (index.html) - encore peu robustes, à fiabiliser.
const PdfExportAlt = (function () {
  const QUALITY_PRESETS = {
    low: { label: 'Basse qualité (compressé)', image: { type: 'jpeg', quality: 0.6 }, html2canvas: { scale: 1.5 }, jsPDF: { compress: true } },
    ultra: { label: 'Ultra HD (impression)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } },
  };
  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.low; }

  // Passe par la boîte de dialogue d'impression native du navigateur plutôt que par un rendu canvas ou une image base64 : un <img> s'affiche sans CORS, seul
  // mode immunisé contre les images bloquées par CORS à l'export. Réutilise les vraies feuilles de style du projet (relinkées), pas un <style> recopié.
  async function exportViaBrowserPrint(resolvedHtml, filename) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    try {
      const container = document.createElement('div');
      container.innerHTML = resolvedHtml;
      const config = container.querySelector(':scope > .heading-numbering-config');
      container.classList.add('tiptap', 'reader-content');
      container.dataset.headingStyle = (config && config.dataset.style) || 'none';
      const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(link => '<link rel="stylesheet" href="' + link.href + '">')
        .join('');
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (filename || 'publipostage') + '</title>' +
        stylesheetLinks +
        '<style>' +
        '@page { size: A4; margin: 18mm; }' +
        'body { margin: 0; }' +
        // Pagination d'impression - absente des feuilles de style du projet (non pertinente hors export), ajoutée ici seulement.
        '.page-break-marker { page-break-after: always; break-after: page; height: 0; margin: 0; border: 0; color: transparent; background: transparent; }' +
        '</style></head><body>' + container.outerHTML + '</body></html>'
      );
      doc.close();
      // Attend le chargement des feuilles de style ET des images avant d'imprimer (avec filet de sécurité) : sans ça, la mise en page
      // (tableaux/2-colonnes/numérotation) ou certaines images apparaîtraient non stylées/blanches dans le PDF imprimé.
      await new Promise(resolve => {
        const pending = Array.from(doc.images || []).concat(Array.from(doc.querySelectorAll('link[rel="stylesheet"]')));
        if (!pending.length) { resolve(); return; }
        let remaining = pending.length;
        const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
        pending.forEach(el => {
          if (el.tagName === 'IMG' && el.complete) { done(); return; }
          el.addEventListener('load', done, { once: true });
          el.addEventListener('error', done, { once: true });
        });
        setTimeout(resolve, 4000);
      });
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1000);
    }
  }

  // Conteneur détaché pour les qualités raster (html2canvas + jsPDF via html2pdf.js). Classes 'tiptap reader-content' portées toutes les deux sur ce même
  // conteneur pour cumuler mise en page réelle et numérotation des titres. Le sommaire n'est pas résolu ici : html2canvas n'a aucune notion de "page".
  function buildRasterContainerAndOptions(resolvedHtml, filename, quality) {
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.position = 'relative';
    container.innerHTML = resolvedHtml;
    const config = container.querySelector(':scope > .heading-numbering-config');
    container.classList.add('tiptap', 'reader-content');
    container.dataset.headingStyle = (config && config.dataset.style) || 'none';
    container.querySelectorAll('.page-break-marker').forEach(marker => { marker.innerHTML = ''; marker.style.border = '0'; marker.style.background = 'transparent'; marker.style.color = 'transparent'; marker.style.height = '0'; marker.style.margin = '0'; marker.style.pageBreakAfter = 'always'; marker.style.breakAfter = 'page'; });
    document.body.appendChild(container);
    const preset = getQualityPreset(quality);
    const opt = { margin: 10, filename: (filename || 'publipostage') + '.pdf', image: preset.image, html2canvas: preset.html2canvas, jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}), pagebreak: { mode: ['css', 'legacy'] } };
    return { container, opt };
  }

  return { getQualityPreset, exportViaBrowserPrint, buildRasterContainerAndOptions };
})();
