// Suite "slideNumber" - le NUMÉRO DE DIAPOSITIVE d'une présentation (js/slides-entry.js:resolveSlideNumbers, css/editor-v2.css, js/pdf-export.js, js/docx-export.js, le champ « numéro de diapositive » de js/pptx-import.js),
// demande du 11/11 : « suite à mon import j'ai un # vert à la place des numéros de slides, qui n'est pas résolu en mode Lecture ni quand on lance le diapo ».
//  - la SORTIE : dans le texte que la Lecture, le diaporama, l'impression et les exports lisent (SlidesEntry.outputHtml), chaque pastille de numéro de page d'une présentation prend le rang de la diapositive où elle est posée (1
//    plus les sauts de page de premier niveau qui la précèdent), dans son format (« 3 », « Page 3 », « 3/12 ») ; une pastille que l'export PowerPoint doit écrire en champ (`keepProps`) et un document gardent leur « # » ;
//  - la LECTURE et le DIAPORAMA : le numéro se lit comme du texte de la diapositive (sa taille, sa couleur), sans la pastille verte ;
//  - les EXPORTS : le PDF et le Word écrivent le texte du numéro (le corps d'une page du PDF n'a pas de callback qui résoudrait un numéro de page), le HTML garde de retirer la pastille d'un texte qui coule ;
//  - l'IMPORT : le champ de numéro d'un PowerPoint garde la taille, la couleur et le gras de son champ ; de l'import à la Lecture, le numéro de chaque diapositive est le sien.
// L'import lui-même (le fichier .pptx écrit ici) est dans le groupe pptxImport, qui rejoue aussi ce chemin entier (`pptx_import_slide_number_field_...`).
(function () {
  const cases = [];
  const add = (id, description, run) => cases.push({ id, description, run });
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const badge = (format = 'n') => '<span class="page-number-badge" contenteditable="false" data-format="' + format + '">#</span>';
  // Une présentation de trois diapositives : un cadre à numéro (« Page # » en 1, « #/# » en 2), un texte qui coule avec son numéro en 3.
  const frame = (y, inner) => FreeFrame.html({ x: 40, y, w: 240, h: 60 }, inner);
  const DECK = frame(40, '<p style="color: #aa0000">Page ' + badge() + '</p>') + '<p>Un</p>' + BR + frame(40, '<p>' + badge('n-slash-total') + '</p>') + '<p>Deux</p>' + BR + '<p>Trois ' + badge() + '</p>';
  const parse = html => new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  const badgesOf = html => Array.from(parse(html).querySelectorAll('.page-number-badge'));
  const readOf = html => badgesOf(html).map(b => b.textContent + '@' + (b.getAttribute('data-slide-number') || '-')).join(' ');
  const outputOf = (html, options) => SlidesEntry.outputHtml('presentation', html, Object.assign({ theme: null }, options));

  add('slidenum_output_gives_each_badge_the_rank_of_its_slide',
    'Le texte de sortie d\'une présentation (Lecture, diaporama, exports) écrit dans chaque pastille de numéro de page le rang de sa diapositive : « # » d\'un cadre de la 1 devient 1, « #/# » d\'un cadre de la 2 devient 2/3, « # » du texte de la 3 devient 3 ; une présentation d\'une seule diapositive donne 1 ; « Page # » donne « Page 2 »',
    async () => {
      const bad = [];
      const out = outputOf(DECK);
      if (readOf(out) !== '1@1 2/3@2 3@3') bad.push('trois diapositives : ' + readOf(out));
      const single = outputOf('<p>Seule ' + badge() + '</p>');
      if (readOf(single) !== '1@1') bad.push('une seule diapositive : ' + readOf(single));
      const named = outputOf('<p>a</p>' + BR + '<p>' + badge('page-n') + '</p>');
      if (readOf(named) !== 'Page 2@2') bad.push('« Page # » : ' + readOf(named));
      // La pastille reste une pastille de numéro de page (le HTML et le Markdown la retirent toujours) : même classe, même format.
      const kept = badgesOf(out).map(b => b.getAttribute('data-format')).join(',');
      if (kept !== 'n,n-slash-total,n') bad.push('formats : ' + kept);
      // Le texte autour d'elle ne bouge pas.
      if (!/Page\s*<span[^>]*page-number-badge/.test(out) || !/color: #aa0000/.test(out)) bad.push('le texte autour : ' + out.slice(0, 200));
      return result(bad);
    });

  add('slidenum_output_without_theme_and_with_a_theme_agree',
    'Avec un thème (chemin « arbre » de computeOutputHtml) comme sans (chemin « texte »), les numéros sont les mêmes',
    async () => {
      const bad = [];
      const theme = { name: 'Essai', colors: { bg: '#ffffff', text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, fonts: { title: 'Georgia', body: 'Arial' } };
      const plain = outputOf(DECK);
      const themed = outputOf(DECK, { theme: PageLayout.getTheme() || theme });
      if (readOf(plain) !== '1@1 2/3@2 3@3') bad.push('sans thème : ' + readOf(plain));
      if (readOf(themed) !== '1@1 2/3@2 3@3') bad.push('avec thème : ' + readOf(themed));
      const real = outputOf(DECK, { theme });
      if (readOf(real) !== '1@1 2/3@2 3@3') bad.push('thème choisi : ' + readOf(real));
      return result(bad);
    });

  add('slidenum_powerpoint_export_and_documents_keep_the_placeholder',
    'L\'export PowerPoint (`keepProps`) garde la pastille « # » (il l\'écrit en vrai champ de numéro de diapositive), et un document n\'a pas de diapositives : sa pastille reste « # » ; un texte sans pastille n\'est pas touché',
    async () => {
      const bad = [];
      const kept = outputOf(DECK, { keepProps: true });
      if (readOf(kept) !== '#@- #@- #@-') bad.push('keepProps : ' + readOf(kept));
      const doc = SlidesEntry.outputHtml('document', '<p>Page ' + badge() + '</p>' + BR + '<p>' + badge() + '</p>', {});
      if (readOf(doc) !== '#@- #@-') bad.push('document : ' + readOf(doc));
      const none = outputOf('<p>Un</p>' + BR + '<p>Deux</p>');
      if (/data-slide-number/.test(none)) bad.push('sans pastille : un repère de trop');
      PageLayout.setMarginsMm(SlidesEntry.pageFor('presentation', null));
      let field;
      try {
        const slide = FreeFrame.html({ x: 40, y: 40, w: 240, h: 60 }, '<p>Numéro ' + badge() + '</p>');
        const blob = await PptxExport.fromHtml(outputOf(slide + BR + slide, { keepProps: true }), { marginsPt: PageLayout.getMarginsPt(), title: 'Essai' });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const names = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort();
        const xml = await Promise.all(names.map(name => zip.file(name).async('string')));
        field = xml.map(text => (text.match(/<a:fld [^>]*type="slidenum"/g) || []).length).join(',');
      } finally {
        PageLayout.setMarginsMm(null);
      }
      if (field !== '1,1') bad.push('champs de numéro de diapositive du PowerPoint : ' + field);
      return result(bad);
    });

  add('slidenum_reading_shows_the_number_as_slide_text_not_as_a_green_pill',
    'La Lecture d\'une présentation montre le numéro (« 1 », « 2/3 », « 3 ») comme du texte de la diapositive : ni « # », ni la pastille verte (fond, bordure, couleur propres), la couleur et la taille de son texte lui restent',
    async (h) => {
      const bad = [];
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      const reader = await h.renderReaderMode(outputOf(DECK), NO_HF);
      await h.sleep(300);
      const shown = Array.from(reader.querySelectorAll('.page-number-badge'));
      if (shown.map(b => b.textContent).join(' ') !== '1 2/3 3') bad.push('textes : ' + shown.map(b => b.textContent).join(' '));
      shown.forEach((b, i) => {
        const cs = getComputedStyle(b);
        const pill = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.paddingLeft) > 0;
        if (pill) bad.push('pastille encore verte (' + (i + 1) + ') : ' + cs.backgroundColor + ' / bordure ' + cs.borderTopWidth + ' / marge ' + cs.paddingLeft);
        const parent = getComputedStyle(b.parentElement);
        if (cs.color !== parent.color || cs.fontSize !== parent.fontSize) bad.push('le numéro (' + (i + 1) + ') n\'a pas le texte de son paragraphe : ' + cs.color + ' ' + cs.fontSize + ' / ' + parent.color + ' ' + parent.fontSize);
      });
      if (shown[0] && getComputedStyle(shown[0]).color !== 'rgb(170, 0, 0)') bad.push('couleur du paragraphe perdue : ' + getComputedStyle(shown[0]).color);
      // Hors d'une présentation, dans un document, la pastille garde son aspect (elle n'est pas résolue ici).
      const doc = await h.renderReaderMode('<p>Page ' + badge() + '</p>', NO_HF);
      const own = doc.querySelector('.page-number-badge');
      if (!own || getComputedStyle(own).backgroundColor === 'rgba(0, 0, 0, 0)') bad.push('la pastille d\'un document a perdu son aspect');
      h.setA4Preview(false);
      document.getElementById('reader-container').style.display = '';
      document.getElementById('editor-container').style.display = '';
      return result(bad);
    });

  add('slidenum_slide_show_stage_shows_the_number',
    'Le diaporama (PrintExport.stage, le rendu de Présenter) écrit le numéro de chaque diapositive : « 1 », « 2/3 », « 3 », sans pastille verte',
    async (h) => {
      const bad = [];
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      const job = await PrintExport.stage(outputOf(DECK), null, { id: 1 }, NO_HF, { id: 'pp-slide-number-test', parent: document.body });
      try {
        const shown = Array.from(job.stage.querySelectorAll('.page-number-badge'));
        if (shown.map(b => b.textContent).join(' ') !== '1 2/3 3') bad.push('textes : ' + shown.map(b => b.textContent).join(' '));
        shown.forEach((b, i) => {
          const cs = getComputedStyle(b);
          if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0) bad.push('pastille encore verte (' + (i + 1) + ') : ' + cs.backgroundColor + ' / ' + cs.borderTopWidth);
        });
      } finally {
        job.dispose();
      }
      h.setA4Preview(false);
      return result(bad);
    });

  add('slidenum_pdf_and_word_write_the_number',
    'Le PDF écrit le numéro de chaque diapositive (« 1 », « 2/3 », « 3 »), pas « # » ni une pastille à résoudre ; le Word écrit le même texte, non un champ de page (la diapositive 3 n\'est pas « la page courante » quand une diapositive en prend plusieurs)',
    async (h) => {
      const bad = [];
      await h.resetEditor();
      // PDF : le corps d'une page n'a pas de callback pour résoudre un numéro de page, et les cadres se peignent après la mise en page : le texte lu est celui que le PDF peint (pdf.js).
      const pdf = await h.exportPdfContent(outputOf(DECK));
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const pages = truth.pages.map(page => page.textItems.map(item => item.str).join(' '));
      if (pages.length !== 3) bad.push('PDF : ' + pages.length + ' pages au lieu de 3');
      else if (pages[0] !== 'Un Page 1' || pages[1] !== 'Deux 2/3' || pages[2] !== 'Trois 3') bad.push('PDF : textes peints ' + JSON.stringify(pages));
      if (/_pendingPageNumber/.test(JSON.stringify(pdf.content))) bad.push('PDF : une pastille de numéro de page attend encore sa page');
      // Word : de vrais textes.
      const docx = await h.exportDocxParts(outputOf(DECK));
      const xml = docx.parts['word/document.xml'] || '';
      if (/<w:instrText[^>]*>\s*PAGE\b/.test(xml) || /w:fldSimple[^>]*PAGE/.test(xml) || /<w:fldChar/.test(xml)) bad.push('Word : un champ de page pour un numéro de diapositive');
      ['>1<', '>2/3<', '>3<'].forEach((piece) => { if (xml.indexOf(piece) === -1) bad.push('Word : ' + piece + ' absent'); });
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.slideNumber = cases;
})();
