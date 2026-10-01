// Suite "pdfGroundTruth" - matrice exhaustive contexte × alignement de paragraphe × type d'ancre pour une image en calque, vérifiée contre la position
// RÉELLEMENT PEINTE dans le PDF (h.extractPdfGroundTruth, décodage pdf.js des octets générés), jamais contre `.positions[]`/`.absolutePosition`
// (métadonnées internes pdfmake) seules.
//
// Pourquoi cette suite existe : un bug réel a échappé à `scenarios-pdf-fidelity.js:pdffid_matrix_*` (qui croise déjà contexte × type d'ancre) parce que
// cette matrice ne faisait jamais varier l'ALIGNEMENT du paragraphe hôte - toujours par défaut (gauche). `twoColumnsFrom` (js/pdf-export.js) ré-appliquait
// alors le text-align du paragraphe hôte à "quel que soit le bloc qui s'y trouve", y compris une image en calque (position:absolute) placée seule dans un
// paragraphe centré/aligné à droite - pdfmake applique `alignment` MÊME par-dessus `absolutePosition`, décalant le rendu réel de l'image de dizaines de pt
// sans que `.absolutePosition` (la métadonnée qu'on lisait) ne le révèle : elle continuait d'afficher la valeur CAPTURÉE, correcte, pendant que le rendu
// réel divergeait silencieusement. Trouvé uniquement en décodant les octets du PDF final (pdf.js) et en comparant à la position réellement peinte - d'où
// cette suite, qui fait EXACTEMENT ça pour toute la matrice, et continuera de le faire si ce genre de bug revient sous une autre forme. Le mécanisme fautif
// a été supprimé (pas seulement patché) dans js/pdf-export.js:twoColumnsFrom - cette suite est le filet de sécurité qui doit détecter une régression.
(function () {
  const cases = [];
  const PAGE_MARGIN_PT = 28;

  async function buildScenario(h, context, align, anchorType) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview');
    await h.focusAtEnd();
    let hostP;
    if (context === 'tableCell') {
      document.getElementById('v2-btn-table').click();
      await h.sleep(80);
      const cells = h.tiptap().querySelectorAll('table td');
      hostP = cells[cells.length - 1].querySelector('p');
    } else if (context === 'mainFlow') {
      hostP = h.tiptap().lastElementChild;
    } else {
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const colIdx = context === 'twoColumnsLeft' ? 0 : 1;
      hostP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[colIdx].querySelector('p');
    }
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(ed.view.posAtDOM(hostP, 0));
    ed.commands.focus();
    await h.sleep(50);
    // Assez long pour forcer un vrai retour à la ligne dans la colonne la plus étroite (2-colonnes gauche, 34%/50%) - un texte tenant sur une seule ligne
    // n'aurait pas exercé le centrage multi-lignes là où le bug se manifestait réellement.
    await h.typeText('XXXXXXXXXX texte ancre suffisamment long pour forcer un vrai retour a la ligne dans la colonne la plus etroite du scenario teste ici');
    if (align !== 'left') { document.getElementById('v2-btn-align-' + align).click(); await h.sleep(30); }
    if (anchorType === 'above') {
      ed.commands.enter();
      await h.sleep(60);
      if (align !== 'left') { document.getElementById('v2-btn-align-' + align).click(); await h.sleep(30); }
    }
    const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
    document.getElementById('v2-btn-image').click();
    await h.sleep(120);
    dialogs.restore();
    const container = context === 'tableCell'
      ? h.tiptap().querySelectorAll('table td')[h.tiptap().querySelectorAll('table td').length - 1]
      : (context === 'mainFlow' ? h.tiptap() : h.tiptap().querySelectorAll('.two-columns-column')[context === 'twoColumnsLeft' ? 0 : 1]);
    const img = container.querySelector('img.editor-image');
    if (!img) return null;
    await h.selectAtomNode(img);
    await h.sleep(80);
    const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
    if (!frontBtn) return null;
    frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await h.sleep(100);
    const wrap = img.closest('.editor-image-view');
    const grid = HeaderFooterPreview.computePageGridPosition(wrap);
    if (!grid) return null;
    return { html: Editor.getHTML(), expected: { x: PAGE_MARGIN_PT + grid.pageLeftPt, y: PAGE_MARGIN_PT + grid.pageTopPt } };
  }

  ['mainFlow', 'twoColumnsLeft', 'twoColumnsRight', 'tableCell'].forEach(context => {
    ['left', 'center', 'right', 'justify'].forEach(align => {
      ['container', 'above'].forEach(anchorType => {
        cases.push({
          id: 'pdfgt_' + context + '_' + align + '_' + anchorType,
          description: 'Image en calque (contexte=' + context + ', align=' + align + ', ancre=' + anchorType + ') : position RÉELLEMENT PEINTE (pdf.js) == grille page capturée',
          run: async (h) => {
            const scenario = await buildScenario(h, context, align, anchorType);
            if (!scenario) return { pass: false, notes: 'construction du scénario a échoué (bouton/toolbar introuvable)' };
            const result = await h.exportPdfContent(scenario.html, null);
            // Garde-fou direct sur le bug trouvé cette session : une image en calque ne doit JAMAIS porter `alignment` dans le docDefinition (pdfmake
            // l'applique par-dessus absolutePosition, cf. en-tête de fichier) - vérifié en plus de la position réelle, pour que cette suite échoue
            // explicitement sur CE mécanisme précis s'il revenait, pas seulement sur son symptôme.
            const images = h.findImages(result.content);
            if (!images.length) return { pass: false, notes: 'image absente du PDF' };
            if (images[0].alignment) return { pass: false, notes: 'régression exacte du bug corrigé : `alignment` posé sur une image en calque = ' + images[0].alignment };
            const gt = await h.extractPdfGroundTruth(result.base64);
            const painted = gt.pages[0] && gt.pages[0].images[0];
            if (!painted) return { pass: false, notes: 'aucune image peinte trouvée dans le PDF décodé' };
            const deltaX = painted.x - scenario.expected.x;
            const deltaY = painted.y - scenario.expected.y;
            // Tolérance large uniquement pour le résidu déjà documenté et distinct (moteur de tableau pdfmake vs rendu <table> natif, cf.
            // pdffid_matrix_tableCell_* dans scenarios-pdf-fidelity.js) - partout ailleurs, la position peinte doit être quasi exacte.
            const tolerance = context === 'tableCell' ? 6 : 1.5;
            const pass = Math.abs(deltaX) < tolerance && Math.abs(deltaY) < tolerance;
            return { pass, notes: JSON.stringify({ expected: scenario.expected, painted, deltaX, deltaY, tolerance }) };
          },
        });
      });
    });
  });

  // Bug réel (repéré par l'utilisateur) : une image en calque glissée tout en haut/à gauche de l'éditeur pouvait finir avec un `pageTopPt`/`pageLeftPt`
  // négatif au-delà de -PAGE_MARGIN_PT - une fois exportée (PAGE_MARGIN_PT + pageTopPt), une coordonnée PDF négative, donc une image partiellement ou
  // entièrement rognée/invisible, alors que ni `.tiptap` ni `.v2-page-sheet` ne la découpaient visuellement dans l'éditeur (l'éditeur montrait l'image
  // entière, le PDF non - vrai écart de fidélité, pas juste "l'utilisateur l'a mal placée"). Corrigé en repoussant l'image dans le DOM réel jusqu'au bord
  // physique de la page dès que `computePageGridPosition` la détecte au-delà (js/header-footer-preview.js) - vérifié ici en glissant délibérément bien
  // au-delà du bord et en confirmant que la position peinte finale est exactement calée sur ce bord (0,0), jamais négative.
  ['top', 'left'].forEach(axis => {
    cases.push({
      id: 'pdfgt_clamp_image_dragged_off_page_' + axis,
      description: 'Une image en calque glissée hors de la page physique (' + axis + ') est repoussée au bord, jamais rognée/invisible au PDF',
      run: async (h) => {
        await h.resetEditor();
        document.getElementById('editor-container').classList.add('a4-preview');
        await h.focusAtEnd();
        const tinyPngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const dialogs = h.stubDialogs({ prompt: tinyPngDataUri });
        document.getElementById('v2-btn-image').click();
        await h.sleep(120);
        dialogs.restore();
        const img = h.tiptap().querySelector('img.editor-image');
        if (!img) return { pass: false, notes: 'image non insérée' };
        await h.selectAtomNode(img);
        await h.sleep(80);
        const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
        if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
        frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(100);
        const wrap = img.closest('.editor-image-view');
        const handle = wrap.querySelector('.editor-image-move-handle');
        const handleRect = handle.getBoundingClientRect();
        const tiptapRect = h.tiptap().getBoundingClientRect();
        // Cible délibérément à 150px AU-DELÀ du bord physique (pas juste dans la marge) - le cas qui a produit le bug réel.
        const target = axis === 'top' ? [handleRect.left, tiptapRect.top - 150] : [tiptapRect.left - 150, handleRect.top];
        await h.dragFromTo(handle, null, target, 8);
        const ed = EditorCore.getEditor();
        let attrs = null;
        ed.state.doc.descendants(node => { if (node.type.name === 'editorImage') attrs = node.attrs; });
        if (!attrs) return { pass: false, notes: 'nœud image introuvable après glisser' };
        const html = Editor.getHTML();
        const result = await h.exportPdfContent(html, null);
        const gt = await h.extractPdfGroundTruth(result.base64);
        const painted = gt.pages[0] && gt.pages[0].images[0];
        if (!painted) return { pass: false, notes: 'aucune image peinte trouvée dans le PDF décodé' };
        const pass = axis === 'top'
          ? Math.abs(painted.y - 0) < 1.5 && attrs.pageTopPt === -28
          : Math.abs(painted.x - 0) < 1.5 && attrs.pageLeftPt === -28;
        return { pass, notes: JSON.stringify({ attrs: { pageLeftPt: attrs.pageLeftPt, pageTopPt: attrs.pageTopPt }, painted }) };
      },
    });
  });

  // Un saut de page suivi d'une image en calque seule dans son paragraphe (le triangle de coin du courrier suivant, posé au début de sa première page) : l'image sort du flux du PDF
  // (position absolue, résolue après coup) et emportait le saut avec elle - le texte d'après restait sous celui d'avant, et la page où l'image est posée n'existait plus. Le saut passe
  // maintenant au bloc suivant (`breakLeavesWithLayers`, js/pdf-export.js). Mesuré sur le PDF décodé : le texte d'après ouvre la 3e page, l'image est peinte sur cette page-là seulement.
  ['behind', 'front'].forEach(layer => {
    cases.push({
      id: 'pdfgt_page_break_before_a_layer_only_paragraph_' + layer,
      description: 'Un saut de page suivi d\'une image en calque ' + (layer === 'behind' ? 'derrière' : 'devant') + ' le texte, seule dans son paragraphe : le texte d\'après ouvre bien une nouvelle page (il ne reste pas sous celui d\'avant) et l\'image est peinte sur cette page-là',
      run: async (h) => {
        await h.resetEditor();
        document.getElementById('editor-container').classList.add('a4-preview');
        const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + (i + 1) + ' du corps du document.</p>').join('');
        const image = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 80px; height: 80px; position: absolute; left: 0px; top: 0px; z-index: ' + (layer === 'front' ? 5 : -1) + ';" data-layer="' + layer + '" data-wrap="inline" data-page-index="2" data-page-left-pt="100" data-page-top-pt="100"></p>';
        const html = lines(70, 'Premier') + '<div class="page-break-marker" contenteditable="false">Saut de page</div>' + image + lines(70, 'Second');
        const res = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
        const truth = await h.extractPdfGroundTruth(res.base64);
        const has = (page, word) => page.textItems.some(t => t.str.indexOf(word) !== -1);
        const mixed = truth.pages.some(p => has(p, 'Premier') && has(p, 'Second'));
        const firstSecond = truth.pages.findIndex(p => has(p, 'Second'));
        const atTop = firstSecond > 0 && !!truth.pages[firstSecond].textItems[0] && truth.pages[firstSecond].textItems[0].str.indexOf('Second') !== -1;
        const painted = truth.pages.map(p => p.images.length);
        const pass = !mixed && atTop && firstSecond === 2 && painted[2] === 1 && painted.reduce((a, b) => a + b, 0) === 1;
        return { pass, notes: JSON.stringify({ pages: truth.pages.length, textesMelanges: mixed, premiereDuSecond: firstSecond + 1, enHaut: atTop, imagesParPage: painted }) };
      },
    });
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfGroundTruth = cases;
})();
