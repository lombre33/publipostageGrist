// Page blanche en fin de document : Lecture, PDF et Word (demande d'Antoine, 2026-10-01 : « souvent en mode lecture et en export PDF j'ai une deuxième page qui se
// crée mais vide. Je pense que c'est quand le texte est ras les marges [...] s'il n'y a pas de contenu, peu importe les marges (là j'ai un module deux colonnes
// en fin de page, c'est peut-être lui), on ne crée pas de nouvelle page »).
//
// Cause : une dernière ligne vide ne s'imprime pas, mais elle occupe une ligne. Quand le texte arrive à la marge du bas, elle n'y tient plus et la mise en page
// ouvre une page pour elle seule. Elle est toujours là après un dernier tableau ou une dernière zone deux colonnes (l'éditeur ajoute un paragraphe final derrière),
// et dès que la personne tape une Entrée de trop. ReaderMode.trimTrailingBlankBlocks retire ces blocs de la FIN du document - ceux du milieu gardent leur
// ligne - ainsi que les lignes vides au bas des colonnes d'une dernière zone.
//
// Pour que le test ne dépende pas des polices de la machine, la capacité d'une page est MESURÉE : `lines(n)` est le plus long texte qui tient encore sur une
// seule page (« ras la marge »), à chaque moteur - PDF (pdfmake, vérité terrain pdf.js) et Lecture (pagination du mode Lecture) mesurent chacun la leur.
//
// L'ÉDITEUR (repère « Page 2 » de l'Aperçu A4, carte d'Antoine du 01/10 : « Faire ignorer les lignes vides de fin au repère « Page 2 » de l'éditeur ? » - Oui) :
// il garde ses lignes vides (il faut pouvoir écrire à la suite), mais celles de la FIN n'ouvrent plus de page, comme dans la Lecture et les exports ; un saut de page
// posé par la personne garde, lui, son repère.
//
// UNE IMAGE FLOTTANTE SUR SA PROPRE LIGNE (Antoine, 2026-10-04 : « dans un document format personnalisé assez petit, j'ai deux images, une première en mode classique, une
// deuxième en mode flottante, sauf que même si l'image est sur la première page on dirait qu'elle crée une deuxième page ; et quand je supprime la ligne de la deuxième page cela
// supprime l'image flottante ») : une image en calque vit dans un paragraphe, et quand cette ligne ne porte qu'elle, la ligne est une ligne comme une autre pour la mise en page - elle
// ne tient plus sur une page que le texte remplit, et ouvre la page 2 pour une image que sa grille a posée sur la page 1. Même règle que pour les lignes vides de fin, dans l'éditeur
// (HeaderFooterPreview.trailingBlankStart) comme dans la Lecture, le PDF et le Word (ReaderMode.trimTrailingBlankBlocks) : la ligne de fin qui ne porte que des images en calque de la
// PAGE 1 (grille complète) n'ouvre pas de page, et les exports donnent ses images au paragraphe de texte qui la précède. Les images d'une page 2 ou plus, les lignes suivies de
// texte, les images sans grille et les lignes sans paragraphe de texte avant elles gardent leur ligne. Une image importée via une colonne PJ (même jour, « important ! l'image est une image
// importée via une colonne PJ ») suit la même règle : le cadre « #Table.Colonne » qu'en montre l'éditeur porte un libellé, qui ne compte pas comme du texte de la ligne.
//
// UN MACRO-MODÈLE (Antoine, 2026-10-09 : « mode macro modèle, en mode lecture et éditeur je n'ai pas de page vide, à l'export pdf j'ai une page vide qui vient se glisser ») : ses modèles sont
// mis bout à bout, chacun derrière un saut de page `data-macro-slot` (js/macro-templates.js:buildConcatenatedHtml), et la fin de CHAQUE modèle est la fin d'une page. Seule la fin du DOCUMENT était
// rognée : la ligne vide que l'éditeur laisse derrière la dernière zone ou le dernier tableau d'un modèle, ou une Entrée de trop, restait au milieu du document, et quand la lettre arrive à la marge du
// bas (le PDF compte les marges de blocs que la Lecture ignore, donc la Lecture tient plus de lignes) elle ouvre une page blanche entre deux modèles, avant le saut de page du suivant.
// ReaderMode.trimTrailingBlankBlocks rogne maintenant la fin de chaque modèle comme celle du document (lignes vides, lignes de calque de la page 1, lignes vides au bas des colonnes d'une dernière zone).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.blankLastPage = (function () {
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const TABLE_HTML = '<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td><td><p>trois</p></td></tr></tbody></table>';
  // En-tête et pied de page : ils réduisent la zone de texte de chaque page, donc la capacité change - c'est pourquoi elle est mesurée, jamais écrite en dur.
  const HEADER_FOOTER = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED DE PAGE</p>', first: '' } };

  function lines(n) { return Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join(''); }
  function blankLines(n) { return '<p></p>'.repeat(n); }
  function zone(left, right) {
    return '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  }

  async function setup(h) {
    await h.resetEditor();
    PageLayout.setOrientation('portrait');
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    await h.sleep(150);
  }
  // Le HTML que contient le modèle enregistré : ProseMirror ajoute lui-même un paragraphe vide derrière une dernière zone ou un dernier tableau.
  async function asSaved(h, html) {
    Editor.setHTML(html);
    await h.sleep(250);
    return Editor.getHTML();
  }
  // Le texte d'en-tête et de pied de page est peint sur CHAQUE page : une page qui ne porte que lui est blanche pour la personne qui lit.
  const HEADER_FOOTER_TEXT = /^(EN-TETE|PIED DE PAGE|PIED|DE|PAGE)$/;
  // Pages du PDF réellement peintes (pdf.js) ; une page sans texte du corps ni image est une page blanche.
  async function pdfPages(h, html, headerFooter) {
    const result = await h.exportPdfContent(html, headerFooter || null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    const isBlank = page => !page.textItems.some(item => !HEADER_FOOTER_TEXT.test(item.str.trim())) && !page.images.length;
    return { count: gt.pages.length, blank: gt.pages.filter(isBlank).length, gt };
  }
  // Pages de la Lecture : une frontière par changement de page (« Page N » sans en-tête ni pied, une couture avec).
  async function readerPages(h, html, headerFooter) {
    await h.renderReaderMode(html, headerFooter || null);
    await h.sleep(250);
    return document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-break-line, #reader-container .v2-pagination-overlay .v2-page-seam').length + 1;
  }
  const NO_HEADER_FOOTER = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  // Pages de l'ÉDITEUR (Aperçu A4) : une bande « Page N » (sans en-tête ni pied) ou une couture (avec) par changement de page, posée par
  // HeaderFooterPreview.renderPaginationOverlay. Le dessin est refait tout de suite plutôt que d'attendre le minuteur de la frappe.
  async function editorPages(h, html, headerFooter) {
    Editor.setHeaderFooterData(headerFooter || NO_HEADER_FOOTER);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    return document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam').length + 1;
  }
  // Plus grand nombre de lignes qui tient sur UNE page : recherche par dichotomie, chaque essai est un vrai rendu.
  async function fullPage(measure) {
    let fits = 20; let over = 90;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await measure(lines(mid))) === 1) fits = mid; else over = mid;
    }
    return fits;
  }

  // Scénarios « texte ras la marge + queue vide » communs à la Lecture et au PDF : [nom, html].
  function flushCases(n) {
    return [
      ['une ligne vide', lines(n) + '<p></p>'],
      ['trois lignes vides', lines(n) + blankLines(3)],
      ['espace insécable', lines(n) + '<p>&nbsp;</p>'],
      ['saut de ligne seul', lines(n) + '<p><br></p>'],
    ];
  }


  // --- Une image flottante sur sa propre ligne (Antoine, 2026-10-04) ---
  // La grille de page de l'image, celle que l'Aperçu A4 capture quand on la pose (data-page-index, puis deux décalages en points depuis le coin du contenu) : c'est elle, pas la ligne qui la
  // porte, qui place l'image dans le PDF, le Word et la Lecture. 150 pt à droite et 20 pt sous le coin du contenu tiennent dans la page de 100 x 70 mm comme dans l'A4.
  const GRID_LEFT_PT = 150;
  const GRID_TOP_PT = 20;
  const FLOAT_PX = 40;
  // Une image liée à la colonne PJ « Photo » de la table Clients : dans l'éditeur un cadre « #Clients.Photo » sans image, à la Lecture et à l'export la pièce jointe de la ligne.
  const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
  function floatingImage(o) {
    o = o || {};
    const layer = o.layer || 'front';
    const grid = o.grid === false ? '' : ' data-page-index="' + (o.pageIndex || 0) + '" data-page-left-pt="' + GRID_LEFT_PT + '" data-page-top-pt="' + GRID_TOP_PT + '"';
    // `left` et `top` du style sont comptés depuis le coin de la feuille : la grille plus la marge, comme l'éditeur les pose quand l'image est positionnée.
    const margins = PageLayout.getMarginsMm();
    return '<img class="editor-image" src="' + (o.pj ? '' : TINY_PNG) + '" alt="" style="width: ' + FLOAT_PX + 'px; height: ' + FLOAT_PX + 'px; position: absolute; left: ' + (margins.left * 96 / 25.4 + GRID_LEFT_PT * 96 / 72) + 'px; top: '
      + (margins.top * 96 / 25.4 + GRID_TOP_PT * 96 / 72) + 'px; z-index: ' + (layer === 'front' ? 5 : -1) + ';" data-layer="' + layer + '" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '') + grid + (o.pj ? PJ_ATTRS : '') + '>';
  }
  function anchorLine(o) { return '<p>' + floatingImage(o) + '</p>'; }
  // Une image au fil du texte (le mode par défaut) sur sa ligne.
  function classicImageLine(widthPx) {
    return '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: ' + widthPx + 'px" data-layer="normal" data-wrap="inline"></p>';
  }
  // Un petit format personnalisé, celui d'Antoine : 100 x 70 mm, soit 80 x 50 mm de contenu avec les marges de 10 mm que setPageSize donne à une petite page.
  async function setupSmallFormat(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    PageLayout.setPageSize(100, 70);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(300);
  }
  function restorePage() {
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
  }
  // Largeur de l'image au fil du texte qui remplit la page : la plus petite avec laquelle une ligne de texte derrière elle ne tient plus, donc la plus grande image qui laisse encore
  // moins d'une ligne de place sous elle (dichotomie, chaque essai est un vrai rendu). On cherche DERRIÈRE une ligne de texte parce qu'une image plus haute que la page reste seule sur
  // la sienne sans en ouvrir une autre (il n'y a rien à couper devant elle) : seule la ligne suivante fait grandir le nombre de pages avec l'image.
  async function fullImageWidth(measure) {
    let fits = 40;
    let over = Math.ceil(PageLayout.getContentHeightMm() * 96 / 25.4);
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await measure(classicImageLine(mid) + '<p>Texte</p>')) === 1) fits = mid; else over = mid;
    }
    return over;
  }
  // Même dichotomie pour des lignes de texte suivies d'un bloc donné : le plus long texte qui tient sur une page AVEC ce bloc à la fin.
  async function fullPageWith(measure, suffix) {
    let fits = 5; let over = 90;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await measure(lines(mid) + suffix)) === 1) fits = mid; else over = mid;
    }
    return fits;
  }
  // Les trois moteurs qui paginent : le nombre de pages de l'ÉDITEUR (Aperçu A4), de la LECTURE et du PDF pour un HTML donné.
  function enginesOf(h, headerFooter) {
    return {
      editor: html => editorPages(h, html, headerFooter),
      reader: html => readerPages(h, html, headerFooter),
      pdf: async html => (await pdfPages(h, html, headerFooter)).count,
    };
  }
  // L'image flottante (30 pt de large) parmi les images peintes d'une page de PDF, et sa place relevée dans le fichier.
  function paintedFloating(page) {
    const found = page && page.images.find(image => Math.abs(image.width - FLOAT_PX * 0.75) < 1);
    return found ? { x: Math.round(found.x * 100) / 100, y: Math.round(found.y * 100) / 100 } : null;
  }

  // --- Un macro-modèle : les modèles bout à bout ---
  // Le document tel que l'application l'assemble (js/macro-templates.js:buildConcatenatedHtml) : le HTML de chaque modèle, un saut de page `data-macro-slot` devant chacun sauf le premier.
  async function macroDocument(fragments) {
    const templates = fragments.map((contenu, index) => ({ id: index + 1, contenu }));
    return MacroTemplates.buildConcatenatedHtml({ slots: templates.map(template => ({ type: 'fixed', modeleId: template.id })) }, 'Clients', { id: 1 }, templates);
  }
  const NEXT_TEMPLATE = '<p>Le modèle suivant.</p>';
  // Ce qui peut terminer un modèle sans rien montrer : une Entrée de trop, trois, un espace insécable, un saut de ligne seul.
  const BLANK_TAILS = [['une ligne vide', '<p></p>'], ['trois lignes vides', '<p></p><p></p><p></p>'], ['espace insécable', '<p>&nbsp;</p>'], ['saut de ligne seul', '<p><br></p>']];
  // Une zone à deux colonnes de `k` lignes dans chacune : la forme d'une lettre (colonne de gauche, texte à droite) qui remplit la page jusqu'à la marge du bas.
  function zoneOfLines(k) {
    const column = tag => Array.from({ length: k }, (_, i) => '<p>' + tag + ' ' + i + '</p>').join('');
    return zone(column('Gauche'), column('Droite'));
  }
  // Les deux moteurs qui mettent un macro-modèle en pages : la Lecture et le PDF (le Word n'a pas de pagination à lui, il se lit dans son XML).
  function macroEngines(h) {
    return { pdf: async html => (await pdfPages(h, html)).count, reader: html => readerPages(h, html) };
  }

  return [
    {
      id: 'blank_page_pdf_empty_lines_after_text_flush_with_the_bottom_margin',
      description: 'PDF, avec et sans en-tête et pied : le texte arrive à la marge du bas, une ou plusieurs lignes vides derrière ne créent pas de deuxième page',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [label, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          const n = await fullPage(async html => (await pdfPages(h, html, hf)).count);
          const seen = { lignesParPage: n };
          const bare = await pdfPages(h, lines(n), hf);
          const over = await pdfPages(h, lines(n + 1), hf);
          if (bare.count !== 1 || over.count !== 2) problems.push(label + ', capacité mal mesurée : ' + n + ' lignes -> ' + bare.count + ' page(s), ' + (n + 1) + ' lignes -> ' + over.count);
          for (const [name, html] of flushCases(n)) {
            const r = await pdfPages(h, html, hf);
            seen[name] = r.count + ' page(s), ' + r.blank + ' blanche(s)';
            if (r.count !== 1 || r.blank) problems.push(label + ', ' + name + ' : ' + seen[name]);
          }
          // Une ligne de plus que la page n'en contient reste, elle, sur deux pages : seul le vide de fin disparaît.
          const overWithBlank = await pdfPages(h, lines(n + 1) + '<p></p>', hf);
          if (overWithBlank.count !== 2 || overWithBlank.blank) problems.push(label + ', une ligne de trop + une ligne vide : ' + overWithBlank.count + ' pages dont ' + overWithBlank.blank + ' blanche(s) (2 et 0 attendues)');
          summary[label] = seen;
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_reader_empty_lines_after_text_flush_with_the_bottom_margin',
      description: 'Lecture, avec et sans en-tête et pied : le texte arrive à la marge du bas, une ou plusieurs lignes vides derrière ne créent pas de page de plus',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [label, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          const n = await fullPage(html => readerPages(h, html, hf));
          const seen = { lignesParPage: n };
          const bare = await readerPages(h, lines(n), hf);
          const over = await readerPages(h, lines(n + 1), hf);
          if (bare !== 1 || over !== 2) problems.push(label + ', capacité mal mesurée : ' + n + ' lignes -> ' + bare + ' page(s), ' + (n + 1) + ' lignes -> ' + over);
          for (const [name, html] of flushCases(n)) {
            const pages = await readerPages(h, html, hf);
            seen[name] = pages + ' page(s)';
            if (pages !== 1) problems.push(label + ', ' + name + ' : ' + pages + ' pages');
          }
          const overWithBlank = await readerPages(h, lines(n + 1) + '<p></p>', hf);
          if (overWithBlank !== 2) problems.push(label + ', une ligne de trop + une ligne vide : ' + overWithBlank + ' pages (2 attendues)');
          summary[label] = seen;
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_pdf_zone_at_the_end_adds_no_page_of_its_own',
      description: 'PDF : une dernière zone deux colonnes, avec ou sans lignes vides au bas de ses colonnes, suivie du paragraphe vide de l\'éditeur, ne change pas le nombre de pages et n\'en laisse aucune blanche',
      async run(h) {
        await setup(h);
        const n = await fullPage(async html => (await pdfPages(h, html)).count);
        const problems = [];
        const rows = [];
        for (let k = n - 8; k <= n; k++) {
          // Référence : la même zone, sans rien derrière ni lignes vides dans ses colonnes - seul son contenu compte.
          const reference = await pdfPages(h, lines(k) + zone('<p>GAUCHE</p>', '<p>DROITE</p>'));
          const withEditorParagraph = await pdfPages(h, await asSaved(h, lines(k) + zone('<p>GAUCHE</p>', '<p>DROITE</p>')));
          const withBlankColumnLines = await pdfPages(h, await asSaved(h, lines(k) + zone('<p>GAUCHE</p><p></p><p></p>', '<p>DROITE</p><p></p>')));
          rows.push(k + ':' + reference.count + '/' + withEditorParagraph.count + '/' + withBlankColumnLines.count);
          if (withEditorParagraph.count !== reference.count || withEditorParagraph.blank) problems.push(k + ' lignes + zone + paragraphe vide : ' + withEditorParagraph.count + ' pages dont ' + withEditorParagraph.blank + ' blanche(s), référence ' + reference.count);
          if (withBlankColumnLines.count !== reference.count || withBlankColumnLines.blank) problems.push(k + ' lignes + zone à lignes vides : ' + withBlankColumnLines.count + ' pages dont ' + withBlankColumnLines.blank + ' blanche(s), référence ' + reference.count);
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, 'lignes:référence/paragrapheVide/lignesVidesDeColonne': rows, problems }) };
      },
    },
    {
      id: 'blank_page_reader_zone_at_the_end_adds_no_page_of_its_own',
      description: 'Lecture : une dernière zone deux colonnes, avec ou sans lignes vides au bas de ses colonnes, suivie du paragraphe vide de l\'éditeur, ne change pas le nombre de pages',
      async run(h) {
        await setup(h);
        const n = await fullPage(html => readerPages(h, html));
        const problems = [];
        const rows = [];
        for (let k = n - 8; k <= n; k++) {
          const reference = await readerPages(h, lines(k) + zone('<p>GAUCHE</p>', '<p>DROITE</p>'));
          const withEditorParagraph = await readerPages(h, await asSaved(h, lines(k) + zone('<p>GAUCHE</p>', '<p>DROITE</p>')));
          const withBlankColumnLines = await readerPages(h, await asSaved(h, lines(k) + zone('<p>GAUCHE</p><p></p><p></p>', '<p>DROITE</p><p></p>')));
          rows.push(k + ':' + reference + '/' + withEditorParagraph + '/' + withBlankColumnLines);
          if (withEditorParagraph !== reference) problems.push(k + ' lignes + zone + paragraphe vide : ' + withEditorParagraph + ' pages, référence ' + reference);
          if (withBlankColumnLines !== reference) problems.push(k + ' lignes + zone à lignes vides : ' + withBlankColumnLines + ' pages, référence ' + reference);
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, 'lignes:référence/paragrapheVide/lignesVidesDeColonne': rows, problems }) };
      },
    },
    {
      id: 'blank_page_pdf_and_reader_agree_for_a_table_at_the_end',
      description: 'Un dernier tableau suivi du paragraphe vide de l\'éditeur : même nombre de pages que le tableau seul, en PDF comme en Lecture, sans page blanche',
      async run(h) {
        await setup(h);
        const n = await fullPage(async html => (await pdfPages(h, html)).count);
        const problems = [];
        const rows = [];
        for (let k = n - 6; k <= n; k++) {
          const reference = await pdfPages(h, lines(k) + TABLE_HTML);
          const saved = await asSaved(h, lines(k) + TABLE_HTML);
          const pdf = await pdfPages(h, saved);
          const readerReference = await readerPages(h, lines(k) + TABLE_HTML);
          const reader = await readerPages(h, saved);
          rows.push(k + ':pdf ' + reference.count + '/' + pdf.count + ' lecture ' + readerReference + '/' + reader);
          if (pdf.count !== reference.count || pdf.blank) problems.push(k + ' lignes + tableau : PDF ' + pdf.count + ' pages dont ' + pdf.blank + ' blanche(s), référence ' + reference.count);
          if (reader !== readerReference) problems.push(k + ' lignes + tableau : Lecture ' + reader + ' pages, référence ' + readerReference);
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ rows, problems }) };
      },
    },
    {
      id: 'blank_page_a_page_break_with_nothing_after_it_adds_no_page',
      description: 'Un saut de page tout à la fin du modèle, sans rien derrière, ne crée pas de page vide (PDF et Lecture) ; avec du texte derrière, il saute toujours une page',
      async run(h) {
        await setup(h);
        const problems = [];
        const marker = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
        const trailing = await pdfPages(h, lines(5) + marker + '<p></p>');
        const trailingReader = await readerPages(h, lines(5) + marker + '<p></p>');
        const followed = await pdfPages(h, lines(5) + marker + '<p>Suite</p>');
        const followedReader = await readerPages(h, lines(5) + marker + '<p>Suite</p>');
        if (trailing.count !== 1 || trailing.blank) problems.push('PDF, saut de page final : ' + trailing.count + ' pages dont ' + trailing.blank + ' blanche(s) (1 et 0 attendue)');
        if (trailingReader !== 1) problems.push('Lecture, saut de page final : ' + trailingReader + ' pages (1 attendue)');
        if (followed.count !== 2 || followed.blank) problems.push('PDF, saut de page suivi de texte : ' + followed.count + ' pages dont ' + followed.blank + ' blanche(s) (2 et 0 attendues)');
        if (followedReader !== 2) problems.push('Lecture, saut de page suivi de texte : ' + followedReader + ' pages (2 attendues)');
        return { pass: problems.length === 0, notes: JSON.stringify({ trailing: trailing.count, trailingReader, followed: followed.count, followedReader, problems }) };
      },
    },
    {
      id: 'blank_page_blank_lines_in_the_middle_keep_their_height',
      description: 'Seules les lignes vides de la FIN disparaissent : celles du milieu gardent leur hauteur en Lecture et en PDF',
      async run(h) {
        await setup(h);
        const problems = [];
        const html = '<p>AVANT</p><p></p><p></p><p>APRES</p><p></p><p></p>';
        await h.renderReaderMode(html, null);
        const reader = document.querySelector('#reader-container .reader-content');
        const readerBlocks = Array.from(reader.children).filter(el => el.tagName === 'P');
        const readerTexts = readerBlocks.map(p => p.textContent);
        if (readerBlocks.length !== 4 || readerTexts.join('|') !== 'AVANT|||APRES') problems.push('Lecture : blocs ' + JSON.stringify(readerTexts) + ' (AVANT, deux lignes vides puis APRES attendus, rien derrière)');
        const filled = readerBlocks.filter(p => p.querySelector('br.pp-blank-line')).length;
        if (filled !== 2) problems.push('Lecture : ' + filled + ' ligne(s) vide(s) du milieu gardent leur hauteur (2 attendues)');
        const withBlank = await pdfPages(h, html);
        const without = await pdfPages(h, '<p>AVANT</p><p>APRES</p>');
        const yOf = (r, str) => { const item = r.gt.pages[0].textItems.find(t => t.str.indexOf(str) !== -1); return item ? item.y : null; };
        const gapWith = yOf(withBlank, 'APRES') - yOf(withBlank, 'AVANT');
        const gapWithout = yOf(without, 'APRES') - yOf(without, 'AVANT');
        if (!(gapWith - gapWithout > 20)) problems.push('PDF : les deux lignes vides du milieu ajoutent ' + (gapWith - gapWithout).toFixed(1) + ' pt entre AVANT et APRES (plus de 20 attendus)');
        return { pass: problems.length === 0, notes: JSON.stringify({ readerTexts, filled, gapWith: +gapWith.toFixed(1), gapWithout: +gapWithout.toFixed(1), problems }) };
      },
    },
    {
      id: 'blank_page_trim_only_removes_what_prints_nothing',
      description: 'ReaderMode.trimTrailingBlankBlocks : retire paragraphes vides, espaces, saut de ligne seul, saut de page et zone vide de la fin ; garde images, tableaux, listes, titres, notes, encadrés et le premier bloc',
      async run(h) {
        const trim = html => {
          const root = document.createElement('div'); root.innerHTML = html;
          ReaderMode.trimTrailingBlankBlocks(root);
          return root.innerHTML;
        };
        const emptyZone = zone('<p></p>', '<p></p>');
        const checks = [
          ['paragraphes vides, espace, insécable et saut de ligne', trim('<p>A</p><p></p><p> </p><p>&nbsp;</p><p><br></p>'), '<p>A</p>'],
          ['espace de largeur nulle', trim('<p>A</p><p>​</p>'), '<p>A</p>'],
          ['saut de page puis paragraphe vide', trim('<p>A</p><div class="page-break-marker" contenteditable="false">Saut de page</div><p></p>'), '<p>A</p>'],
          ['zone entièrement vide puis paragraphe vide', trim('<p>A</p>' + emptyZone + '<p></p>'), '<p>A</p>'],
          ['rien à retirer', trim('<p>A</p><p>B</p>'), '<p>A</p><p>B</p>'],
          ['lignes vides du milieu', trim('<p>A</p><p></p><p>B</p><p></p>'), '<p>A</p><p></p><p>B</p>'],
          ['image dans le dernier paragraphe', trim('<p>A</p><p><img src="' + TINY_PNG + '"></p>'), '<p>A</p><p><img src="' + TINY_PNG + '"></p>'],
          ['dernier titre sans texte', trim('<p>A</p><h2></h2>'), '<p>A</p><h2></h2>'],
          ['tableau puis paragraphe vide', trim('<p>A</p>' + TABLE_HTML + '<p></p>'), '<p>A</p>' + TABLE_HTML],
          ['liste vide en dernier', trim('<p>A</p><ul><li></li></ul>'), '<p>A</p><ul><li></li></ul>'],
          ['note de bas de page seule', trim('<p>A</p><p><sup class="footnote-ref-marker" data-note-id="1" data-note-text="x"></sup></p>'), '<p>A</p><p><sup class="footnote-ref-marker" data-note-id="1" data-note-text="x"></sup></p>'],
          ['numéro de page seul', trim('<p>A</p><p><span class="page-number-badge" data-format="n"></span></p>'), '<p>A</p><p><span class="page-number-badge" data-format="n"></span></p>'],
          ['encadré vide en dernier', trim('<p>A</p><div class="callout"><p></p></div>'), '<p>A</p><div class="callout"><p></p></div>'],
          ['sommaire en dernier', trim('<p>A</p><div class="toc-marker">Sommaire</div>'), '<p>A</p><div class="toc-marker">Sommaire</div>'],
          ['réglage de numérotation derrière un vide', trim('<p>A</p><p></p><div class="heading-numbering-config" data-style="numeric"></div>'), '<p>A</p><div class="heading-numbering-config" data-style="numeric"></div>'],
          ['document entièrement vide : le premier bloc reste', trim('<p></p><p></p><p></p>'), '<p></p>'],
          ['zone seule et vide : elle reste', trim(emptyZone), emptyZone],
          ['colonnes de la dernière zone : lignes vides du bas retirées, une ligne gardée', trim('<p>A</p>' + zone('<p>X</p><p></p><p></p>', '<p></p><p></p>')), '<p>A</p>' + zone('<p>X</p>', '<p></p>')],
          ['colonne : lignes vides du haut gardées (bloc de signature)', trim('<p>A</p>' + zone('<p></p><p></p><p></p><p>Nom</p>', '<p></p><p>Date</p>')), '<p>A</p>' + zone('<p></p><p></p><p></p><p>Nom</p>', '<p></p><p>Date</p>')],
          ['zone suivie de texte : ses lignes vides restent', trim(zone('<p>X</p><p></p>', '<p>Y</p><p></p>') + '<p>Suite</p>'), zone('<p>X</p><p></p>', '<p>Y</p><p></p>') + '<p>Suite</p>'],
          ['colonne : liste en dernier gardée', trim('<p>A</p>' + zone('<p>X</p><ul><li>un</li></ul>', '<p>Y</p>')), '<p>A</p>' + zone('<p>X</p><ul><li>un</li></ul>', '<p>Y</p>')],
        ];
        const problems = checks.filter(c => c[1] !== c[2]).map(c => c[0] + ' : ' + c[1] + ' (attendu ' + c[2] + ')');
        return { pass: problems.length === 0, notes: JSON.stringify({ verifies: checks.length, problems }) };
      },
    },
    {
      id: 'blank_page_word_keeps_no_empty_paragraph_at_the_end_and_a_one_point_one_after_a_table',
      description: 'Word : plus de paragraphe vide à la fin du document ; derrière un dernier tableau, le paragraphe que Word exige ne fait que 1 pt de haut',
      async run(h) {
        await setup(h);
        const problems = [];
        const bodyOf = parts => Array.from(parts.doc.getElementsByTagName('w:body')[0].children).filter(n => n.nodeName !== 'w:sectPr');
        const textOf = el => Array.from(el.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const plain = await h.exportDocxParts(lines(3) + blankLines(3), null, PageLayout.getMarginsTwip());
        const plainBody = bodyOf(plain);
        if (plainBody.length !== 3 || plainBody.some(el => !textOf(el))) problems.push('texte + 3 lignes vides : ' + plainBody.length + ' paragraphe(s) [' + plainBody.map(textOf).map(t => t.slice(0, 7)).join('|') + '] (3 paragraphes de texte attendus)');
        const middle = await h.exportDocxParts('<p>A</p><p></p><p>B</p><p></p>', null, PageLayout.getMarginsTwip());
        const middleBody = bodyOf(middle);
        if (middleBody.map(textOf).join('|') !== 'A||B') problems.push('ligne vide du milieu : [' + middleBody.map(textOf).join('|') + '] (A||B attendu)');
        const withTable = await h.exportDocxParts(await asSaved(h, TABLE_HTML), null, PageLayout.getMarginsTwip());
        const tableBody = bodyOf(withTable);
        const last = tableBody[tableBody.length - 1];
        const spacing = last && last.getElementsByTagName('w:spacing')[0];
        const markSize = last && last.getElementsByTagName('w:rPr')[0] && last.getElementsByTagName('w:rPr')[0].getElementsByTagName('w:sz')[0];
        if (tableBody.length !== 2 || tableBody[0].nodeName !== 'w:tbl' || !last || last.nodeName !== 'w:p') problems.push('tableau final : ' + tableBody.map(el => el.nodeName).join(',') + ' (w:tbl puis w:p attendus)');
        else if (!spacing || spacing.getAttribute('w:line') !== '20' || spacing.getAttribute('w:lineRule') !== 'exact' || !markSize || markSize.getAttribute('w:val') !== '2') {
          problems.push('paragraphe derrière le tableau : interligne ' + (spacing ? spacing.getAttribute('w:line') + '/' + spacing.getAttribute('w:lineRule') : 'absent') + ', taille ' + (markSize ? markSize.getAttribute('w:val') : 'absente') + ' (20/exact et 2 demi-points attendus)');
        }
        const zoneEnd = await h.exportDocxParts(await asSaved(h, zone('<p>X</p>', '<p>Y</p>')), null, PageLayout.getMarginsTwip());
        const zoneBody = bodyOf(zoneEnd);
        const zoneLast = zoneBody[zoneBody.length - 1];
        const zoneSpacing = zoneLast && zoneLast.getElementsByTagName('w:spacing')[0];
        if (zoneBody.length !== 2 || zoneBody[0].nodeName !== 'w:tbl' || !zoneSpacing || zoneSpacing.getAttribute('w:line') !== '20') problems.push('zone deux colonnes finale : ' + zoneBody.map(el => el.nodeName).join(',') + ' (w:tbl puis un paragraphe de 1 pt attendus)');
        const empty = await h.exportDocxParts('<p></p><p></p>', null, PageLayout.getMarginsTwip());
        if (bodyOf(empty).length !== 1) problems.push('modèle vide : ' + bodyOf(empty).length + ' paragraphe(s) (1 attendu)');
        return { pass: problems.length === 0, notes: JSON.stringify({ plain: plainBody.length, tableBody: tableBody.map(el => el.nodeName), problems }) };
      },
    },
    {
      id: 'blank_page_an_empty_template_still_exports_and_renders',
      description: 'Un modèle réduit à des lignes vides garde son premier bloc : PDF d\'une page, Lecture d\'une page, aucune erreur',
      async run(h) {
        await setup(h);
        const problems = [];
        const html = '<p></p><p></p>';
        const pdf = await pdfPages(h, html);
        const reader = await readerPages(h, html);
        const blocks = document.querySelectorAll('#reader-container .reader-content > p').length;
        if (pdf.count !== 1) problems.push('PDF : ' + pdf.count + ' pages (1 attendue)');
        if (reader !== 1 || blocks !== 1) problems.push('Lecture : ' + reader + ' page(s), ' + blocks + ' bloc(s) (1 et 1 attendus)');
        return { pass: problems.length === 0, notes: JSON.stringify({ pdf: pdf.count, reader, blocks, problems }) };
      },
    },
    {
      id: 'blank_page_header_and_footer_zones_keep_their_blank_lines',
      description: 'Les zones d\'en-tête et de pied résolues par ReaderMode.preview gardent leurs lignes vides de fin : seul le corps du document est rogné',
      async run(h) {
        const resolved = await ReaderMode.preview('<p>Titre</p><p></p>', null, { id: 1 });
        const probe = document.createElement('div'); probe.innerHTML = resolved;
        const count = probe.querySelectorAll(':scope > p').length;
        return { pass: count === 2, notes: 'html=' + resolved };
      },
    },
    {
      id: 'blank_page_editor_empty_lines_after_text_flush_with_the_bottom_margin',
      description: 'Éditeur, avec et sans en-tête et pied : le texte arrive à la marge du bas, une ou plusieurs lignes vides tapées derrière n\'ouvrent pas de « Page 2 », comme dans la Lecture et les exports',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [label, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          const n = await fullPage(html => editorPages(h, html, hf));
          const seen = { lignesParPage: n };
          const bare = await editorPages(h, lines(n), hf);
          const over = await editorPages(h, lines(n + 1), hf);
          if (bare !== 1 || over !== 2) problems.push(label + ', capacité mal mesurée : ' + n + ' lignes -> ' + bare + ' page(s), ' + (n + 1) + ' lignes -> ' + over);
          const cases = flushCases(n).concat([
            ['deux lignes vides', lines(n) + blankLines(2)],
            ['plus d\'une page de lignes vides', lines(n) + blankLines(n + 10)],
            ['lignes vides, espaces et saut de ligne mêlés', lines(n) + '<p></p><p>&nbsp;</p><p><br></p><p> </p>'],
          ]);
          for (const [name, html] of cases) {
            const pages = await editorPages(h, html, hf);
            seen[name] = pages + ' page(s)';
            if (pages !== 1) problems.push(label + ', ' + name + ' : ' + pages + ' pages (1 attendue)');
          }
          // Une ligne de plus que la page n'en contient reste sur deux pages : seul le vide de fin disparaît.
          const overWithBlanks = await editorPages(h, lines(n + 1) + blankLines(3), hf);
          if (overWithBlanks !== 2) problems.push(label + ', une ligne de trop + trois lignes vides : ' + overWithBlanks + ' pages (2 attendues)');
          summary[label] = seen;
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_editor_blank_lines_before_text_keep_their_room',
      description: 'Éditeur : seules les lignes vides de la FIN sont ignorées ; celles qui précèdent du texte gardent leur place, et dès que du texte est tapé derrière elles la « Page 2 » apparaît',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [label, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          const n = await fullPage(html => editorPages(h, html, hf));
          // Sans les trois lignes vides le texte final tient sur la page ; avec elles (au milieu, donc comptées) il passe en page 2.
          const without = await editorPages(h, lines(n - 2) + '<p>Suite</p>', hf);
          const withBlank = await editorPages(h, lines(n - 2) + blankLines(3) + '<p>Suite</p>', hf);
          // Le texte tapé sur la dernière des lignes vides : elle n'est plus vide, la page où elle tombe apparaît.
          const typedOnLast = await editorPages(h, lines(n) + blankLines(2) + '<p>Fin</p>', hf);
          const stillBlank = await editorPages(h, lines(n) + blankLines(3), hf);
          summary[label] = { sansLesVides: without, avecLesVides: withBlank, texteTapeSurLaDerniere: typedOnLast, toujoursVides: stillBlank };
          if (without !== 1) problems.push(label + ', texte sans lignes vides : ' + without + ' page(s) (1 attendue)');
          if (withBlank !== 2) problems.push(label + ', lignes vides du milieu : ' + withBlank + ' page(s) (2 attendues : elles gardent leur place)');
          if (typedOnLast !== 2) problems.push(label + ', texte tapé derrière deux lignes vides : ' + typedOnLast + ' page(s) (2 attendues)');
          if (stillBlank !== 1) problems.push(label + ', trois lignes vides : ' + stillBlank + ' page(s) (1 attendue)');
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_editor_a_page_break_keeps_its_page_and_blank_lines_after_it_open_no_other',
      description: 'Éditeur : un saut de page posé par la personne garde son repère « Page 2 » ; les lignes vides tapées derrière lui n\'ouvrent pas de « Page 3 »',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        const marker = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
        for (const [label, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          const n = await fullPage(html => editorPages(h, html, hf));
          const alone = await editorPages(h, lines(3) + marker + '<p></p>', hf);
          const followedByText = await editorPages(h, lines(3) + marker + lines(5), hf);
          const blankPage = await editorPages(h, lines(3) + marker + blankLines(n + 10), hf);
          const twoBreaks = await editorPages(h, lines(3) + marker + lines(3) + marker + '<p>Fin</p>', hf);
          summary[label] = { sautSeul: alone, sautPuisTexte: followedByText, sautPuisUnePageDeVides: blankPage, deuxSauts: twoBreaks };
          if (alone !== 2) problems.push(label + ', saut de page + une ligne vide : ' + alone + ' page(s) (2 attendues : le saut garde son repère)');
          if (followedByText !== 2) problems.push(label + ', saut de page + texte : ' + followedByText + ' page(s) (2 attendues)');
          if (blankPage !== 2) problems.push(label + ', saut de page + plus d\'une page de lignes vides : ' + blankPage + ' page(s) (2 attendues)');
          if (twoBreaks !== 3) problems.push(label + ', deux sauts de page et du texte derrière : ' + twoBreaks + ' page(s) (3 attendues)');
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_editor_footer_page_total_ignores_the_trailing_blank_lines',
      description: 'Éditeur : le « n/total » du pied de page ne compte pas la page que n\'occupent que des lignes vides de fin',
      async run(h) {
        await setup(h);
        const footer = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p><span class="page-number-badge" contenteditable="false" data-format="n-slash-total">#</span></p>', first: '' } };
        const problems = [];
        const read = async html => {
          await editorPages(h, html, footer);
          const zone = document.querySelector('#editor-container .v2-page-edge-bottom');
          return zone ? zone.textContent.replace(/\s+/g, '') : null;
        };
        const n = await fullPage(html => editorPages(h, html, footer));
        const expected = total => PageLayout.pageNumberText('n-slash-total', total, total).replace(/\s+/g, '');
        const flush = await read(lines(n) + blankLines(3));
        const over = await read(lines(n + 1) + blankLines(3));
        if (flush !== expected(1)) problems.push('texte ras la marge + 3 lignes vides : pied « ' + flush + ' » (« ' + expected(1) + ' » attendu)');
        if (over !== expected(2)) problems.push('une ligne de trop + 3 lignes vides : pied « ' + over + ' » (« ' + expected(2) + ' » attendu)');
        return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, flush, over, problems }) };
      },
    },
    {
      id: 'blank_page_floating_image_on_page_1_opens_no_page_in_a_small_format',
      description: 'Petit format personnalisé (100 x 70 mm), une image au fil du texte qui remplit la page et, sur la ligne suivante, une image flottante posée sur la page 1 (devant, derrière, ou derrière sur toutes les pages) : éditeur, Lecture et PDF restent sur UNE page, le document garde ses deux images, le PDF les peint sur cette page et la flottante est à la place que lui donne sa grille',
      async run(h) {
        const problems = [];
        const summary = {};
        try {
          await setupSmallFormat(h);
          const m = PageLayout.getMarginsPt();
          const variants = [['devant le texte', { layer: 'front' }], ['derrière le texte', { layer: 'behind' }], ['derrière, sur toutes les pages', { layer: 'behind', repeat: true }]];
          for (const [engine, measure] of Object.entries(enginesOf(h))) {
            const width = await fullImageWidth(measure);
            // La page tient l'image, et pas une ligne de plus derrière elle.
            const bare = await measure(classicImageLine(width));
            const over = await measure(classicImageLine(width) + '<p>Texte</p>');
            const seen = { largeurDeLImage: width };
            if (bare !== 1 || over !== 2) problems.push(engine + ', capacité mal mesurée : image de ' + width + ' px -> ' + bare + ' page(s), avec une ligne de texte derrière -> ' + over + ' (1 puis 2 attendues)');
            for (const [label, o] of variants) {
              const html = classicImageLine(width) + anchorLine(o);
              const pages = await measure(html);
              seen[label] = pages + ' page(s)';
              if (pages !== 1) problems.push(engine + ', image flottante ' + label + ' : ' + pages + ' pages (1 attendue)');
              if (engine === 'editor') {
                // Rien n'est supprimé : la ligne de l'image reste dans le document, seule la page qu'elle ouvrait disparaît.
                const probe = document.createElement('div'); probe.innerHTML = Editor.getHTML();
                const kept = probe.querySelectorAll(':scope > p').length + ' paragraphes, ' + probe.querySelectorAll('img.editor-image').length + ' images';
                seen[label] += ', ' + kept;
                if (kept !== '2 paragraphes, 2 images') problems.push('éditeur, image flottante ' + label + ' : le document garde ' + kept + ' (2 paragraphes et 2 images attendus)');
              }
              if (engine === 'reader') {
                const painted = document.querySelectorAll('#reader-container img.editor-image').length;
                seen[label] += ', ' + painted + ' image(s) à l\'écran';
                if (painted !== 2) problems.push('Lecture, image flottante ' + label + ' : ' + painted + ' images à l\'écran (2 attendues)');
              }
              if (engine === 'pdf') {
                const pdf = await pdfPages(h, html);
                const first = pdf.gt.pages[0];
                const at = paintedFloating(first);
                seen[label] += ', ' + (first ? first.images.length : 0) + ' image(s) sur la page 1, flottante en ' + JSON.stringify(at);
                if (pdf.blank) problems.push('PDF, image flottante ' + label + ' : ' + pdf.blank + ' page(s) blanche(s)');
                if (!first || first.images.length !== 2) problems.push('PDF, image flottante ' + label + ' : ' + (first ? first.images.length : 0) + ' image(s) sur la page 1 (2 attendues)');
                if (!at || Math.abs(at.x - (m.left + GRID_LEFT_PT)) > 0.6 || Math.abs(at.y - (m.top + GRID_TOP_PT)) > 0.6) problems.push('PDF, image flottante ' + label + ' : peinte en ' + JSON.stringify(at) + ', attendue en {"x":' + (m.left + GRID_LEFT_PT) + ',"y":' + (m.top + GRID_TOP_PT) + '}');
                if (first && Math.abs(first.width - 100 * 72 / 25.4) > 1) problems.push('PDF : page de ' + first.width + ' pt de large (le petit format de 100 mm attendu)');
              }
            }
            summary[engine] = seen;
          }
        } finally { restorePage(); }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_floating_image_from_an_attachment_column_opens_no_page_either',
      description: 'La même image flottante importée via une colonne PJ (Antoine, 2026-10-04, « important ! l\'image est une image importée via une colonne PJ ») : dans l\'éditeur son cadre « #Clients.Photo » est un objet, pas du texte - la ligne de fin n\'ouvre pas de page, comme à la Lecture où la pièce jointe de la ligne est peinte dessus ; la ligne suivie de texte et une image PJ au fil du texte gardent leur ligne',
      async run(h) {
        const problems = [];
        const summary = {};
        const original = window.fetch;
        // Le serveur de Grist, côté pièces jointes : toute pièce jointe est une image.
        window.fetch = (input, init) => {
          const url = String(typeof input === 'string' ? input : input && input.url);
          if (!/\/attachments\/\d+\/download/.test(url)) return original.call(window, input, init);
          return Promise.resolve(new Response(new Blob([Uint8Array.from(atob(TINY_PNG.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/png' }), { status: 200 }));
        };
        try {
          await setupSmallFormat(h);
          const stub = window.__gristStub;
          const row = { id: 1, Nom: 'Dupont', Photo: ['L', 7] };
          stub.setVariables('Clients', { Nom: 'Text', Photo: 'Attachments' });
          stub.setRows('Clients', [row]);
          await GristAPI.refreshSchema();
          stub.fireRecord(row, 'Clients');
          await h.sleep(100);
          const engines = enginesOf(h);
          for (const engine of ['editor', 'reader']) {
            const measure = engines[engine];
            const width = await fullImageWidth(measure);
            const pjClassic = '<p><img class="editor-image" src="" alt="" style="width: ' + width + 'px; height: ' + width + 'px" data-layer="normal" data-wrap="inline"' + PJ_ATTRS + '></p>';
            const seen = { largeurDeLImage: width };
            for (const [label, o] of [['devant le texte', { layer: 'front', pj: true }], ['derrière le texte', { layer: 'behind', pj: true }], ['derrière, sur toutes les pages', { layer: 'behind', repeat: true, pj: true }]]) {
              // L'image au fil du texte est une vraie image, puis une image PJ : le cadre de la PJ est plus haut que l'image, la largeur mesurée convient aux deux.
              for (const [firstLabel, first] of [['image au fil du texte', classicImageLine(width)], ['image PJ au fil du texte', pjClassic]]) {
                const pages = await measure(first + anchorLine(o));
                seen[firstLabel + ', flottante PJ ' + label] = pages;
                if (pages !== 1) problems.push(engine + ', ' + firstLabel + ' puis image PJ flottante ' + label + ' : ' + pages + ' pages (1 attendue)');
              }
              if (engine === 'editor') {
                const probe = document.createElement('div'); probe.innerHTML = Editor.getHTML();
                const kept = probe.querySelectorAll(':scope > p').length + ' paragraphes, ' + probe.querySelectorAll('img.editor-image').length + ' images';
                if (kept !== '2 paragraphes, 2 images') problems.push('éditeur, image PJ flottante ' + label + ' : le document garde ' + kept + ' (2 paragraphes et 2 images attendus)');
              }
              if (engine === 'reader') {
                await measure(classicImageLine(width) + anchorLine(o));
                const painted = Array.from(document.querySelectorAll('#reader-container img.editor-image'));
                const withFile = painted.filter(img => img.getAttribute('src'));
                if (painted.length !== 2 || withFile.length !== 2) problems.push('Lecture, image PJ flottante ' + label + ' : ' + painted.length + ' images à l\'écran dont ' + withFile.length + ' avec leur fichier (2 et 2 attendues)');
              }
            }
            // Garde-fous : la ligne de l'image PJ suivie de texte, et une image PJ au fil du texte seule en fin de page, gardent leur ligne.
            const n = await fullPageWith(measure, '');
            const guards = [
              ['ligne de l\'image PJ suivie de texte', lines(n) + anchorLine({ layer: 'front', pj: true }) + '<p>Suite</p>', 2],
              ['image PJ au fil du texte en fin de page', lines(n) + pjClassic, 2],
            ];
            for (const [name, html, expected] of guards) {
              const pages = await measure(html);
              seen[name] = pages;
              if (pages !== expected) problems.push(engine + ', ' + name + ' : ' + pages + ' page(s) (' + expected + ' attendue(s))');
            }
            summary[engine] = seen;
          }
        } finally { window.fetch = original; restorePage(); }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_floating_image_word_anchors_to_the_paragraph_before_its_line',
      description: 'Word : l\'image flottante de la page 1 qui était seule sur sa ligne de fin est ancrée au paragraphe de texte qui la précède, à la même place de la page (marge + grille) ; il ne reste pas de paragraphe à elle seule, que Word pouvait rejeter sur une page 2 où l\'ancre se serait retrouvée',
      async run(h) {
        const problems = [];
        const rows = {};
        try {
          await setupSmallFormat(h);
          const m = PageLayout.getMarginsPt();
          const cases = [
            ['devant le texte', classicImageLine(180) + anchorLine({ layer: 'front' })],
            ['derrière le texte', classicImageLine(180) + anchorLine({ layer: 'behind' })],
            ['lignes vides entre le texte et la ligne de l\'image', classicImageLine(180) + blankLines(2) + anchorLine()],
            ['derrière du texte', '<p>Texte</p>' + anchorLine()],
          ];
          for (const [label, html] of cases) {
            const parts = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
            const body = parts.doc.getElementsByTagName('w:body')[0];
            const paragraphs = Array.from(body.children).filter(node => node.tagName === 'w:p');
            const kinds = paragraphs.map(p => Array.from(p.getElementsByTagName('w:drawing')).map(d => (d.getElementsByTagName('wp:anchor')[0] ? 'ancre' : 'en ligne')));
            const anchors = h.docxDrawings(parts.doc).filter(d => d.kind === 'anchor');
            rows[label] = { paragraphes: paragraphs.length, images: kinds, ancres: anchors.map(a => ({ x: Math.round(a.x * 100) / 100, y: Math.round(a.y * 100) / 100, relativeFrom: a.relativeFrom })) };
            if (paragraphs.length !== 1) problems.push(label + ' : ' + paragraphs.length + ' paragraphes (1 attendu, celui qui précède la ligne)');
            if (anchors.length !== 1) { problems.push(label + ' : ' + anchors.length + ' ancre(s) (1 attendue)'); continue; }
            const a = anchors[0];
            if (!kinds[0] || kinds[0].filter(k => k === 'ancre').length !== 1) problems.push(label + ' : l\'ancre n\'est pas dans le paragraphe de texte (' + JSON.stringify(kinds) + ')');
            if (Math.abs(a.x - (m.left + GRID_LEFT_PT)) > 0.6 || Math.abs(a.y - (m.top + GRID_TOP_PT)) > 0.6) problems.push(label + ' : ancre en (' + a.x + ', ' + a.y + ') pt, attendue en (' + (m.left + GRID_LEFT_PT) + ', ' + (m.top + GRID_TOP_PT) + ')');
            if (a.relativeFrom.h !== 'page' || a.relativeFrom.v !== 'page') problems.push(label + ' : ancre relative à ' + JSON.stringify(a.relativeFrom) + ' (la page attendue)');
          }
        } finally { restorePage(); }
        return { pass: problems.length === 0, notes: JSON.stringify({ rows, problems }) };
      },
    },
    {
      id: 'blank_page_floating_image_line_keeps_its_page_when_it_has_something_to_show',
      description: 'Garde-fous, éditeur / Lecture / PDF, avec et sans en-tête et pied : seule la ligne de fin qui ne porte QUE des images flottantes de la page 1 (grille complète) derrière un paragraphe de texte n\'ouvre pas de page, avec ou sans lignes vides autour ; l\'image d\'une page 2, la ligne suivie de texte, la ligne qui porte aussi du texte, l\'image sans grille et la ligne derrière un titre gardent leur ligne, au même nombre de pages dans les trois moteurs',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        // Avec un en-tête et un pied la page est plus courte et la grille compte la bande de l'en-tête : la règle est la même, seuls les cas qui la portent sont rejoués.
        for (const [hfLabel, hf] of [['sans en-tête', null], ['avec en-tête et pied', HEADER_FOOTER]]) {
          for (const [engine, measure] of Object.entries(enginesOf(h, hf))) {
            const n = await fullPageWith(measure, '');
            const nHeading = hf ? null : await fullPageWith(measure, '<h2>Fin</h2>');
            const cases = [
              ['la ligne seule, en fin', lines(n) + anchorLine(), 1],
              ['lignes vides autour', lines(n) + blankLines(2) + anchorLine() + blankLines(2), 1],
              ['deux images flottantes sur la ligne', lines(n) + '<p>' + floatingImage() + floatingImage({ layer: 'behind' }) + '</p>', 1],
              ['image de la page 2', lines(n) + anchorLine({ pageIndex: 1 }), 2],
              ['du texte derrière la ligne', lines(n) + anchorLine() + '<p>Suite</p>', 2],
              ['du texte sur la ligne', lines(n) + '<p>Légende ' + floatingImage() + '</p>', 2],
            ];
            if (!hf) cases.push(['la ligne derrière un titre', lines(nHeading) + '<h2>Fin</h2>' + anchorLine(), 2]);
            // L'éditeur donne tout seul une grille à l'image qui n'en a pas (il la capture au chargement) : le cas n'a de sens que pour le HTML d'un ancien modèle, lu tel quel par la Lecture et le PDF.
            if (!hf && engine !== 'editor') cases.push(['image sans grille (ancien modèle)', lines(n) + anchorLine({ grid: false }), 2]);
            const seen = { lignesParPage: n };
            if (nHeading) seen.lignesParPageDerriereUnTitre = nHeading;
            for (const [name, html, expected] of cases) {
              const pages = await measure(html);
              seen[name] = pages;
              if (pages !== expected) problems.push(hfLabel + ', ' + engine + ', ' + name + ' : ' + pages + ' page(s) (' + expected + ' attendue(s))');
            }
            if (engine === 'pdf') {
              // L'image d'une page 2 est peinte sur la page 2, pas sur la page 1 : sa ligne ouvre bien la page qu'elle a demandée.
              const second = await pdfPages(h, lines(n) + anchorLine({ pageIndex: 1 }), hf);
              const onPage = second.gt.pages.map(page => page.images.length);
              seen['images peintes par page, image de la page 2'] = onPage;
              if (onPage.length !== 2 || onPage[0] !== 0 || onPage[1] !== 1) problems.push(hfLabel + ', PDF, image de la page 2 : ' + JSON.stringify(onPage) + ' images par page (0 puis 1 attendues)');
            }
            (summary[hfLabel] = summary[hfLabel] || {})[engine] = seen;
          }
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_floating_image_alone_in_the_document',
      description: 'Une image flottante seule dans le document (aucun paragraphe de texte avant sa ligne) : une page en éditeur, Lecture et PDF, l\'image est peinte à sa place et le Word garde son ancre ; un document vide de texte ne plante pas',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        const m = PageLayout.getMarginsPt();
        for (const [engine, measure] of Object.entries(enginesOf(h))) {
          const pages = await measure(anchorLine());
          summary[engine] = pages + ' page(s)';
          if (pages !== 1) problems.push(engine + ' : ' + pages + ' pages (1 attendue)');
        }
        const pdf = await pdfPages(h, anchorLine());
        const at = paintedFloating(pdf.gt.pages[0]);
        summary.pdf += ', flottante en ' + JSON.stringify(at);
        if (!at || Math.abs(at.x - (m.left + GRID_LEFT_PT)) > 0.6 || Math.abs(at.y - (m.top + GRID_TOP_PT)) > 0.6) problems.push('PDF : image peinte en ' + JSON.stringify(at) + ', attendue en (' + (m.left + GRID_LEFT_PT) + ', ' + (m.top + GRID_TOP_PT) + ')');
        const parts = await h.exportDocxParts(anchorLine(), null, PageLayout.getMarginsTwip());
        const anchors = h.docxDrawings(parts.doc).filter(d => d.kind === 'anchor');
        summary.word = anchors.length + ' ancre(s)';
        if (anchors.length !== 1) problems.push('Word : ' + anchors.length + ' ancre(s) (1 attendue)');
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_macro_slot_tail_opens_no_page_before_the_next_template',
      description: 'Macro-modèle : la fin d\'un modèle (une ligne vide, trois, un espace insécable, un saut de ligne seul) n\'ouvre pas de page blanche avant le modèle suivant quand son texte arrive à la marge du bas, en PDF et en Lecture',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [engine, measure] of Object.entries(macroEngines(h))) {
          const n = await fullPage(measure);
          const rows = [];
          for (let k = n - 3; k <= n + 1; k++) {
            const reference = await measure(await macroDocument([lines(k), NEXT_TEMPLATE]));
            for (const [name, tail] of BLANK_TAILS) {
              const pages = await measure(await macroDocument([lines(k) + tail, NEXT_TEMPLATE]));
              rows.push(k + ' ' + name + ' : ' + pages + '/' + reference);
              if (pages !== reference) problems.push(engine + ', ' + k + ' lignes + ' + name + ' : ' + pages + ' pages, ' + reference + ' sans elle');
            }
          }
          summary[engine] = { lignesParPage: n, 'lignes + queue : pages/référence': rows };
        }
        const n = await fullPage(async html => (await pdfPages(h, html)).count);
        const flush = await pdfPages(h, await macroDocument([lines(n) + '<p></p>', NEXT_TEMPLATE]));
        summary.pdfBlancs = flush.blank;
        if (flush.count !== 2 || flush.blank) problems.push('PDF, texte ras la marge + une ligne vide : ' + flush.count + ' pages dont ' + flush.blank + ' blanche(s) (2 et 0 attendues)');
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_macro_slot_ending_with_a_zone_opens_no_page_before_the_next_template',
      description: 'Macro-modèle : une lettre en zone à deux colonnes qui arrive à la marge du bas, suivie du paragraphe vide que l\'éditeur laisse derrière une dernière zone, n\'ouvre pas de page blanche avant le modèle suivant (PDF et Lecture)',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        for (const [engine, measure] of Object.entries(macroEngines(h))) {
          const n = await fullPage(measure);
          const rows = [];
          for (let k = n - 4; k <= n + 2; k++) {
            const reference = await measure(await macroDocument([zoneOfLines(k), NEXT_TEMPLATE]));
            const html = await macroDocument([zoneOfLines(k) + '<p></p>', NEXT_TEMPLATE]);
            const pages = await measure(html);
            rows.push(k + ' : ' + pages + '/' + reference);
            if (pages !== reference) problems.push(engine + ', zone de ' + k + ' lignes + paragraphe vide : ' + pages + ' pages, ' + reference + ' sans lui');
            if (engine === 'pdf') {
              const blank = (await pdfPages(h, html)).blank;
              if (blank) problems.push('PDF, zone de ' + k + ' lignes + paragraphe vide : ' + blank + ' page(s) blanche(s)');
            }
          }
          summary[engine] = { 'lignes de zone : pages/référence': rows };
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_macro_slot_ending_with_a_layer_image_line_keeps_its_image_and_opens_no_page',
      description: 'Macro-modèle : la ligne de fin d\'un modèle qui ne porte qu\'une image en calque de la page 1 n\'ouvre pas de page blanche, et l\'image reste peinte à sa place (PDF) et dans la Lecture, sur la ligne de texte qui la précède',
      async run(h) {
        await setup(h);
        const problems = [];
        const summary = {};
        const m = PageLayout.getMarginsPt();
        for (const [engine, measure] of Object.entries(macroEngines(h))) {
          const n = await fullPage(measure);
          const rows = [];
          for (let k = n - 2; k <= n + 1; k++) {
            const reference = await measure(await macroDocument([lines(k), NEXT_TEMPLATE]));
            const pages = await measure(await macroDocument([lines(k) + anchorLine(), NEXT_TEMPLATE]));
            rows.push(k + ' : ' + pages + '/' + reference);
            if (pages !== reference) problems.push(engine + ', ' + k + ' lignes + ligne de l\'image : ' + pages + ' pages, ' + reference + ' sans elle');
          }
          summary[engine] = rows;
        }
        const n = await fullPage(async html => (await pdfPages(h, html)).count);
        const pdf = await pdfPages(h, await macroDocument([lines(n) + anchorLine(), NEXT_TEMPLATE]));
        const at = paintedFloating(pdf.gt.pages[0]);
        summary.pdfImage = at;
        if (!at || Math.abs(at.x - (m.left + GRID_LEFT_PT)) > 0.6 || Math.abs(at.y - (m.top + GRID_TOP_PT)) > 0.6) problems.push('PDF : image peinte en ' + JSON.stringify(at) + ' sur la page 1, attendue en (' + (m.left + GRID_LEFT_PT) + ', ' + (m.top + GRID_TOP_PT) + ')');
        if (pdf.blank) problems.push('PDF : ' + pdf.blank + ' page(s) blanche(s)');
        await h.renderReaderMode(await macroDocument([lines(n) + anchorLine(), NEXT_TEMPLATE]), null);
        await h.sleep(250);
        const content = document.querySelector('#reader-container .reader-content');
        const children = Array.from(content.children);
        const slotAt = children.findIndex(el => el.matches('.page-break-marker[data-macro-slot]'));
        const hostIndex = children.findIndex(el => el.querySelector('img.editor-image'));
        summary.lecture = { blocs: children.length, saut: slotAt, hoteDeLImage: hostIndex };
        if (hostIndex < 0 || hostIndex > slotAt - 1 || children[hostIndex].textContent.indexOf('Ligne') !== 0) problems.push('Lecture : l\'image est dans le bloc ' + hostIndex + ' (le dernier paragraphe de texte du modèle, avant le saut de page ' + slotAt + ', attendu)');
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'blank_page_macro_trim_removes_the_tail_of_every_template_and_keeps_the_rest',
      description: 'ReaderMode.trimTrailingBlankBlocks sur un macro-modèle : ce qui ne montre rien à la fin de chaque modèle disparaît (le saut de page du suivant reste) ; les lignes vides du milieu, le premier bloc d\'un modèle vide, un titre, un tableau, une image et un document sans macro-modèle gardent leur comportement',
      async run() {
        const problems = [];
        const MARK = rank => MacroTemplates.slotBreakHtml(rank);
        const MANUAL = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
        const normalize = html => { const root = document.createElement('div'); root.innerHTML = html; return root.innerHTML; };
        const trim = html => { const root = document.createElement('div'); root.innerHTML = html; ReaderMode.trimTrailingBlankBlocks(root); return root.innerHTML; };
        const IMAGE_LINE = '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" data-layer="normal" data-wrap="inline"></p>';
        const cases = [
          ['deux lignes vides en fin de modèle', '<p>A</p><p></p><p></p>' + MARK(1) + '<p>B</p><p></p>', '<p>A</p>' + MARK(1) + '<p>B</p>'],
          ['trois modèles, une queue à chacun', '<p>A</p><p></p>' + MARK(1) + '<p>B</p><p>&nbsp;</p><p><br></p>' + MARK(2) + '<p>C</p><p></p>', '<p>A</p>' + MARK(1) + '<p>B</p>' + MARK(2) + '<p>C</p>'],
          ['une ligne vide du milieu reste', '<p>A</p><p></p><p>B</p><p></p>' + MARK(1) + '<p>C</p>', '<p>A</p><p></p><p>B</p>' + MARK(1) + '<p>C</p>'],
          ['un modèle vide garde son premier bloc', '<p>A</p>' + MARK(1) + '<p></p><p></p>' + MARK(2) + '<p>C</p>', '<p>A</p>' + MARK(1) + '<p></p>' + MARK(2) + '<p>C</p>'],
          ['un saut de page posé à la main en fin de modèle', '<p>A</p>' + MANUAL + MARK(1) + '<p>B</p>', '<p>A</p>' + MARK(1) + '<p>B</p>'],
          ['une ligne vide derrière un tableau', TABLE_HTML + '<p></p>' + MARK(1) + '<p>B</p>', TABLE_HTML + MARK(1) + '<p>B</p>'],
          ['une ligne vide derrière une image', IMAGE_LINE + '<p></p>' + MARK(1) + '<p>B</p>', IMAGE_LINE + MARK(1) + '<p>B</p>'],
          ['un titre vide reste', '<p>A</p><h2></h2>' + MARK(1) + '<p>B</p>', '<p>A</p><h2></h2>' + MARK(1) + '<p>B</p>'],
          ['les lignes vides au bas des colonnes d\'une dernière zone', zone('<p>X</p><p></p><p></p>', '<p>Y</p><p></p>') + '<p></p>' + MARK(1) + '<p>B</p>', zone('<p>X</p>', '<p>Y</p>') + MARK(1) + '<p>B</p>'],
          ['la fin du document garde sa règle', '<p>A</p>' + MARK(1) + '<p>B</p><p></p><p></p>', '<p>A</p>' + MARK(1) + '<p>B</p>'],
          ['sans macro-modèle, rien ne change', '<p>A</p><p></p><p>B</p><p></p>', '<p>A</p><p></p><p>B</p>'],
        ];
        for (const [name, html, expected] of cases) {
          const got = trim(html);
          if (got !== normalize(expected)) problems.push(name + ' : ' + got + ' (attendu ' + normalize(expected) + ')');
          if (trim(got) !== got) problems.push(name + ' : un second rognage change encore le document');
        }
        const markers = html => (html.match(/data-macro-slot/g) || []).length;
        const three = '<p>A</p><p></p>' + MARK(1) + '<p></p>' + MARK(2) + '<p>C</p>';
        if (markers(trim(three)) !== 2) problems.push('un saut de page de macro-modèle a disparu : ' + trim(three));
        return { pass: problems.length === 0, notes: JSON.stringify({ cas: cases.length, problems }) };
      },
    },
    {
      id: 'blank_page_macro_word_has_no_empty_paragraph_before_the_next_template',
      description: 'Macro-modèle, Word : les lignes vides qui terminent un modèle ne laissent pas de paragraphe vide avant celui du modèle suivant, qui garde son saut de page ; celles du milieu d\'un modèle restent',
      async run(h) {
        await setup(h);
        const problems = [];
        const bodyOf = parts => Array.from(parts.doc.getElementsByTagName('w:body')[0].children).filter(n => n.nodeName !== 'w:sectPr');
        const textOf = el => Array.from(el.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const parts = await h.exportDocxParts(await macroDocument(['<p>Premier</p><p></p><p></p>', NEXT_TEMPLATE]), null, PageLayout.getMarginsTwip());
        const body = bodyOf(parts);
        const texts = body.map(textOf);
        if (texts.join('|') !== 'Premier|Le modèle suivant.') problems.push('paragraphes : [' + texts.join('|') + '] (Premier|Le modèle suivant. attendu)');
        const next = body[body.length - 1];
        if (!next || !next.getElementsByTagName('w:pageBreakBefore').length) problems.push('le premier paragraphe du modèle suivant n\'a plus son saut de page');
        const middle = await h.exportDocxParts(await macroDocument(['<p>A</p><p></p><p>B</p><p></p>', NEXT_TEMPLATE]), null, PageLayout.getMarginsTwip());
        const middleTexts = bodyOf(middle).map(textOf);
        if (middleTexts.join('|') !== 'A||B|Le modèle suivant.') problems.push('ligne vide du milieu : [' + middleTexts.join('|') + '] (A||B|Le modèle suivant. attendu)');
        return { pass: problems.length === 0, notes: JSON.stringify({ texts, middleTexts, problems }) };
      },
    },
  ];
})();
