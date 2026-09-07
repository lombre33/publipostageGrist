// Harnais d'exécution des scénarios de fidélité (dev-tests/README.md).
// Chargé via eval() APRÈS scenarios.js (cf. README) : définit window.FidelityHarness.
(function () {
  async function loadFreshPdfExport() {
    // Toujours re-fetch avec cache:'no-store' : le cache navigateur sur les
    // fichiers JS servis en local a produit plusieurs faux négatifs pendant le
    // développement de ce harnais (un correctif semblait ne rien changer alors
    // que le code exécuté datait d'avant le correctif).
    const resp = await fetch('/js/pdf-export.js', { cache: 'no-store' });
    const txt = await resp.text();
    window.__FidelityPdfExport = undefined;
    // eslint-disable-next-line no-eval
    eval(txt.replace('const PdfExport = ', 'window.__FidelityPdfExport = '));
    return window.__FidelityPdfExport;
  }

  async function setupScenario(sc) {
    document.getElementById('editor-container').classList.add('a4-preview');
    const quill = Editor.getQuill();
    quill.setText('');
    quill.setSelection(0, 0);

    if (sc.headingIsHtml) {
      quill.root.innerHTML = sc.heading + '<p><br></p>';
      quill.setSelection(quill.getLength() - 1, 0);
    } else if (sc.heading) {
      quill.insertText(0, sc.heading, 'bold', true);
      quill.insertText(quill.getLength() - 1, '\n');
      quill.setSelection(quill.getLength() - 1, 0);
    }

    const paraStart = quill.getSelection().index;
    Editor.insertImage({ src: sc.imageSrc, width: '80px' });
    await new Promise(r => setTimeout(r, 60));
    quill.insertText(quill.getLength() - 1, ' ' + sc.text);
    await new Promise(r => setTimeout(r, 60));
    if (sc.align && sc.align !== 'left') quill.formatLine(paraStart + 1, 1, 'align', sc.align);
    await new Promise(r => setTimeout(r, 60));

    let img = quill.root.querySelector('img.editor-image');
    // Attend le chargement réel de l'image (surtout pour une URL externe) avant
    // de mesurer son paragraphe ancre, sinon getBoundingClientRect() ne tient
    // pas compte de sa taille finale.
    await new Promise(resolve => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 5000);
    });

    if (sc.layer !== 'normal') {
      img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(r => setTimeout(r, 40));
      const toolbar = document.querySelector('.editor-image-toolbar');
      const btn = toolbar.querySelector('button[data-act="layer-' + sc.layer + '"]');
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise(r => setTimeout(r, 40));
      img = quill.root.querySelector('img.editor-image');
      const p = img.closest('p, h1, h2, h3, li, blockquote');
      const pRect = p.getBoundingClientRect();
      img.style.width = Math.round(pRect.width) + 'px';
      img.style.height = Math.round(pRect.height) + 'px';
      img.style.opacity = '0.35';
      await new Promise(r => setTimeout(r, 40));
    }
    return { quill, img };
  }

  async function run(sc) {
    const { img } = await setupScenario(sc);
    const PdfExportFresh = await loadFreshPdfExport();

    let lastContent = null;
    const gens = [];
    const origCreatePdf = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      lastContent = docDefinition.content;
      const gen = origCreatePdf.call(window.pdfMake, docDefinition);
      gen.download = function () {}; // jamais déclencher de vrai téléchargement navigateur
      gens.push(gen);
      return gen;
    };

    const html = Editor.getHTML();
    let exportError = null;
    try {
      await PdfExportFresh.exportCurrentRecord(html, null, {}, '', 'native');
    } catch (e) {
      exportError = String(e && e.stack || e);
    } finally {
      window.pdfMake.createPdf = origCreatePdf;
    }
    if (exportError) return { scenario: sc.id, error: exportError };

    // Le dernier générateur créé correspond à la mise en page FINALE (2e passe
    // si ancrage, sinon l'unique passe) : .download() a été neutralisé, donc
    // il faut déclencher nous-mêmes sa mise en page pour obtenir le PDF ET
    // peupler `.positions` sur les blocs de lastContent (effet de bord du
    // moteur de mise en page pdfmake, déjà exploité dans pdf-export.js).
    const finalGen = gens[gens.length - 1];
    const base64 = await new Promise(resolve => finalGen.getBase64(resolve));

    const images = lastContent.filter(b => b && b.image);
    const textBlocks = lastContent.filter(b => b && b.text);
    const diagnostics = {
      scenario: sc.id,
      description: sc.description,
      align: sc.align,
      layer: sc.layer,
      passCount: gens.length,
      imageDataset: img ? Object.assign({}, img.dataset) : null,
      imageStyle: img ? img.getAttribute('style') : null,
      images: images.map(im => ({
        absolutePosition: im.absolutePosition || null,
        width: im.width, height: im.height, alignment: im.alignment || null,
      })),
      textBlocks: textBlocks.map(b => ({
        alignment: b.alignment || null,
        firstRunText: (b.text && b.text[0] && b.text[0].text) || null,
        firstRunFontSize: (b.text && b.text[0] && b.text[0].fontSize) || null,
        lineCount: (b.positions || []).length,
        positions: (b.positions || []).map(p => ({ left: p.left, top: p.top })),
      })),
    };
    return { base64, diagnostics };
  }

  async function runAll(scenarios) {
    const results = [];
    for (const key of Object.keys(scenarios)) {
      if (key.startsWith('_')) continue;
      const sc = scenarios[key];
      // eslint-disable-next-line no-await-in-loop
      const result = await run(sc);
      results.push(Object.assign({ key }, result));
    }
    return results;
  }

  window.FidelityHarness = { run, runAll, setupScenario, loadFreshPdfExport };
})();
