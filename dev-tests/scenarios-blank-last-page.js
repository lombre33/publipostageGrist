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
  ];
})();
