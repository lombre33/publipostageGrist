// Suite "pageNumberLive" - le VRAI NUMÉRO dans la pastille verte de numéro de page (demande d'Antoine, 20/11 : « qu'ils apparaissent même en mode édition, pour que ce soit plus pratique
// pendant l'écriture, mais qu'ils gardent une couleur verte pour indiquer que c'est une variable », carte « Partout, même numéro en sortie »).
//  - l'ÉDITEUR (js/header-footer-preview.js:watchPageNumber, js/editor-nodes.js:createPageNumberBadgeNode) : la pastille d'un texte montre la page où elle tombe (« 1 », « Page 2 », « 3/3 »), mise à jour à chaque
//    pagination, jamais écrite dans le document (`getHTML` garde « # »), toujours verte ; sans Aperçu A4 elle garde son espace réservé ; dans une présentation, c'est le rang de la diapositive, même sans Aperçu ;
//    pendant l'écriture d'un en-tête ou d'un pied (une seule zone pour toutes les pages), c'est un EXEMPLE : la page dont la marge a été cliquée (« 2/3 »), la première pour la variante « première page » ;
//  - la LECTURE (js/reader-mode.js:resolveBodyPageNumbers) et le PDF (js/pdf-export.js:fillBodyPageNumbers) : une pastille posée dans le TEXTE écrivait « # » (seul Word posait un vrai champ) ; elle écrit
//    maintenant le même numéro que l'éditeur ;
//  - le COÛT : taper une lettre n'écrit rien dans la pastille (aucun travail en dehors d'une pagination).
(function () {
  const cases = [];
  const add = (id, description, run) => cases.push({ id, description, run });
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const NO_HF = () => ({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
  const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const badge = (format = 'n') => '<span class="page-number-badge" contenteditable="false" data-format="' + format + '">' + ({ n: '#', 'page-n': 'Page #', 'n-slash-total': '#/#' }[format]) + '</span>';
  // Trois pages, une pastille de chaque format.
  const BODY3 = '<p>Un ' + badge('n') + '</p>' + BR + '<p>Deux ' + badge('page-n') + '</p>' + BR + '<p>Trois ' + badge('n-slash-total') + '</p>';
  const container = () => document.getElementById('editor-container');
  const badgeTexts = root => Array.from(root.querySelectorAll('.page-number-badge')).map(el => el.textContent);
  const editorBadges = () => badgeTexts(container().querySelector('.tiptap'));

  async function setup(h, html, data) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    container().classList.add('a4-preview');
    Editor.setHeaderFooterData(JSON.parse(JSON.stringify(data || NO_HF())));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(400);
  }
  async function readerTexts(h, html, data) {
    const readerContainer = document.getElementById('reader-container');
    container().style.display = 'none';
    readerContainer.style.display = 'block';
    readerContainer.classList.add('a4-preview');
    try {
      await ReaderMode.render(html, 'FakeTable', {}, data || NO_HF());
      await h.sleep(300);
      return badgeTexts(readerContainer.querySelector('.reader-content'));
    } finally {
      container().style.display = '';
      readerContainer.style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
    }
  }

  add('pagenum_live_editor_shows_the_page_of_each_badge_and_saves_only_the_placeholder',
    'Dans l\'éditeur, la pastille de numéro de page d\'un texte montre la page où elle tombe (« 1 », « Page 2 », « 3/3 »), reste verte, et le HTML enregistré garde « # », « Page # », « #/# »',
    async (h) => {
      const bad = [];
      await setup(h, BODY3);
      const texts = editorBadges();
      if (JSON.stringify(texts) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('textes de la vue : ' + JSON.stringify(texts));
      const el = container().querySelector('.tiptap .page-number-badge');
      const color = getComputedStyle(el).color;
      if (!el.classList.contains('page-number-badge') || color !== 'rgb(20, 108, 67)') bad.push('la pastille n\'est plus verte : ' + color);
      const html = Editor.getHTML();
      if (/page-number-badge[^>]*>[^<]*\d/.test(html)) bad.push('un chiffre est entré dans le document : ' + html);
      if (!/>#<\/span>/.test(html) || !/>Page #<\/span>/.test(html) || !/>#\/#<\/span>/.test(html)) bad.push('l\'espace réservé enregistré a changé : ' + html);
      return result(bad);
    });

  add('pagenum_live_editor_follows_a_page_break_added_in_front',
    'Un saut de page ajouté devant une pastille la fait passer à la page suivante : « 1 » devient « 2 » après la pagination suivante',
    async (h) => {
      const bad = [];
      await setup(h, '<p>Un ' + badge('n') + '</p>');
      if (editorBadges()[0] !== '1') bad.push('départ : ' + editorBadges()[0]);
      Editor.setHTML(BR + '<p>Un ' + badge('n') + '</p>');
      Editor.refreshLayout();
      await h.sleep(500);
      const after = editorBadges();
      if (after[0] !== '2') bad.push('après le saut de page : ' + JSON.stringify(after));
      return result(bad);
    });

  add('pagenum_live_editor_without_preview_keeps_the_placeholder',
    'Sans Aperçu A4 il n\'y a pas de pages : la pastille garde son espace réservé (« # », « Page # », « #/# »), et le numéro revient avec l\'aperçu',
    async (h) => {
      const bad = [];
      await setup(h, BODY3);
      container().classList.remove('a4-preview');
      Editor.refreshLayout();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(300);
      const off = editorBadges();
      if (JSON.stringify(off) !== JSON.stringify(['#', 'Page #', '#/#'])) bad.push('sans aperçu : ' + JSON.stringify(off));
      container().classList.add('a4-preview');
      Editor.refreshLayout();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(400);
      const on = editorBadges();
      if (JSON.stringify(on) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('avec l\'aperçu : ' + JSON.stringify(on));
      return result(bad);
    });

  add('pagenum_live_editor_presentation_shows_the_slide_rank_even_without_preview',
    'Dans une présentation, la pastille montre le rang de sa diapositive (1 plus les sauts de page de premier niveau qui la précèdent), comme la Lecture, le PDF et le diaporama, avec ou sans Aperçu A4',
    async (h) => {
      const bad = [];
      const deck = '<p>Un ' + badge('n') + '</p>' + BR + '<p>Deux ' + badge('page-n') + '</p>' + BR + '<p>Trois ' + badge('n-slash-total') + '</p>';
      await setup(h, deck);
      SlidesEntry.setContext(() => ({ type: 'presentation', editing: true }));
      try {
        HeaderFooterPreview.renderPaginationOverlay();
        await h.sleep(300);
        const withPreview = editorBadges();
        if (JSON.stringify(withPreview) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('avec aperçu : ' + JSON.stringify(withPreview));
        container().classList.remove('a4-preview');
        HeaderFooterPreview.renderPaginationOverlay();
        await h.sleep(300);
        const without = editorBadges();
        if (JSON.stringify(without) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('sans aperçu : ' + JSON.stringify(without));
      } finally {
        SlidesEntry.setContext(() => ({ type: 'document', editing: true }));
        container().classList.add('a4-preview');
      }
      return result(bad);
    });

  add('pagenum_live_editor_writing_a_zone_shows_the_clicked_page_as_an_example',
    'Pendant l\'écriture d\'un pied, la pastille montre la page dont la marge a été cliquée et le vrai nombre de pages (« 2/3 »), la première page pour la variante « première page » ; « Terminer » rend les numéros du texte',
    async (h) => {
      const bad = [];
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>' + badge('n-slash-total') + '</p>', first: '' } };
      await setup(h, BODY3, hf);
      // Le pied de la page 2 (la deuxième couture), cliqué comme une personne le fait.
      const footers = Array.from(container().querySelectorAll('.v2-page-band-footer'));
      if (footers.length !== 2) { bad.push('pieds de couture : ' + footers.length); return result(bad); }
      footers[1].click();
      await h.sleep(400);
      if (!Editor.isEditingHeaderFooter()) { bad.push('la zone ne s\'ouvre pas'); return result(bad); }
      const second = editorBadges();
      if (JSON.stringify(second) !== JSON.stringify(['2/3'])) bad.push('pied de la page 2 : ' + JSON.stringify(second));
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(500);
      const back = editorBadges();
      if (JSON.stringify(back) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('après « Terminer » : ' + JSON.stringify(back));
      // Le pied de la dernière page (le bord bas de la feuille).
      const edge = container().querySelector('.v2-page-edge-bottom');
      edge.onclick();
      await h.sleep(400);
      const last = editorBadges();
      if (JSON.stringify(last) !== JSON.stringify(['3/3'])) bad.push('pied de la dernière page : ' + JSON.stringify(last));
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(300);
      return result(bad);
    });

  add('pagenum_live_editor_first_page_variant_shows_page_one',
    'Avec « première page différente », la variante « première page » montre la page 1 et la variante courante la suivante',
    async (h) => {
      const bad = [];
      const hf = { enabled: true, differentFirstPage: true, header: { default: '', first: '' }, footer: { default: '<p>' + badge('n-slash-total') + '</p>', first: '<p>' + badge('page-n') + '</p>' }, };
      await setup(h, BODY3, hf);
      const edge = container().querySelector('.v2-page-edge-top');
      // Le haut de la première page est vide ici : on ouvre le pied de la première page (la couture du bas de page 1, variante « première »).
      const footers = Array.from(container().querySelectorAll('.v2-page-band-footer'));
      footers[0].click();
      await h.sleep(400);
      const first = editorBadges();
      if (JSON.stringify(first) !== JSON.stringify(['Page 1'])) bad.push('variante première page : ' + JSON.stringify(first) + (edge ? '' : ''));
      // Passer à la variante courante : la page 1 est celle de la variante « première page », la courante montre la 2.
      document.querySelector('#v2-hf-variant-segment [data-variant="default"]').click();
      await h.sleep(400);
      const current = editorBadges();
      if (JSON.stringify(current) !== JSON.stringify(['2/3'])) bad.push('variante courante : ' + JSON.stringify(current));
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(300);
      return result(bad);
    });

  add('pagenum_live_typing_does_not_touch_the_badge',
    'Taper une lettre dans un paragraphe n\'écrit rien dans la pastille : le numéro se met à jour avec la pagination, jamais à la frappe',
    async (h) => {
      const bad = [];
      await setup(h, BODY3);
      const el = container().querySelector('.tiptap .page-number-badge');
      const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      let writes = 0;
      Object.defineProperty(Node.prototype, 'textContent', { configurable: true, enumerable: desc.enumerable, get: desc.get, set(value) { if (this === el) writes++; desc.set.call(this, value); } });
      try {
        await h.focusAtEnd();
        await h.typeText('abcdefghij');
        await h.sleep(500);
      } finally { Object.defineProperty(Node.prototype, 'textContent', desc); }
      if (writes !== 0) bad.push('écritures dans la pastille pendant la frappe : ' + writes);
      return result(bad);
    });

  add('pagenum_live_reader_writes_the_page_of_a_badge_placed_in_the_text',
    'La Lecture écrit, pour une pastille posée dans le texte, le numéro de sa page (« 1 », « Page 2 », « 3/3 ») au lieu de « # » ; celles d\'un en-tête et d\'un pied restent résolues page par page',
    async (h) => {
      const bad = [];
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>' + badge('n') + '</p>', first: '' } };
      await h.resetEditor();
      const texts = await readerTexts(h, BODY3, hf);
      const reader = document.getElementById('reader-container');
      // Les pastilles du texte d'abord (l'ordre du document), puis celles des pieds, dans les couches de pagination.
      const body = texts;
      if (JSON.stringify(body) !== JSON.stringify(['1', 'Page 2', '3/3'])) bad.push('texte de la Lecture : ' + JSON.stringify(body) + ' ' + reader.id);
      return result(bad);
    });

  add('pagenum_live_pdf_writes_the_page_of_a_badge_placed_in_the_text',
    'Le PDF écrit, pour une pastille posée dans le texte, le numéro de sa page (« 1 » sur la page 1, « Page 2 » sur la 2, « 3/3 » sur la 3) au lieu de « # »',
    async (h) => {
      const bad = [];
      await h.resetEditor();
      const out = await h.exportPdfContent(BODY3, null);
      await h.ensurePdfJsLoaded();
      const bin = atob(out.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) pages.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join('').replace(/\s+/g, ' ').trim());
      if (pdf.numPages !== 3) bad.push('pages : ' + pdf.numPages);
      const expected = ['Un 1', 'Deux Page 2', 'Trois 3/3'];
      expected.forEach((text, i) => { if (pages[i] !== text) bad.push('page ' + (i + 1) + ' : « ' + pages[i] + ' » au lieu de « ' + text + ' »'); });
      return result(bad);
    });

  add('pagenum_live_editor_settles_on_a_long_document_with_wider_numbers',
    'Dans un long document, le numéro (plus large que « # ») ne relance pas la pagination en boucle : peu de paginations après le chargement, et les numéros ne bougent plus ensuite',
    async (h) => {
      const bad = [];
      let html = '';
      for (let page = 0; page < 24; page++) {
        for (let i = 0; i < 8; i++) html += '<p>Ligne ' + i + ' de la page ' + page + ', assez longue pour remplir presque toute la largeur de la feuille A4 et finir au bord. ' + (i === 7 ? badge('page-n') : '') + '</p>';
        html += BR;
      }
      await h.resetEditor();
      PageLayout.setMarginsMm(null);
      container().classList.add('a4-preview');
      Editor.setHeaderFooterData(NO_HF());
      let paginations = 0;
      const stop = HeaderFooterPreview.onPaginated(() => { paginations += 1; });
      try {
        Editor.setHTML(html);
        Editor.refreshLayout();
        await h.sleep(2500);
        const first = editorBadges();
        await h.sleep(1200);
        const second = editorBadges();
        if (paginations > 6) bad.push('paginations en 2,5 s : ' + paginations);
        if (JSON.stringify(first) !== JSON.stringify(second)) bad.push('les numéros bougent encore');
        if (first.length !== 24 || first.some(text => /#/.test(text))) bad.push('numéros : ' + JSON.stringify(first.slice(0, 4)) + ' (' + first.length + ')');
        const numbers = first.map(text => Number(String(text).replace(/\D/g, '')));
        if (numbers.some((n, i) => n < i + 1 || n > i + 3)) bad.push('numéros hors de leur page : ' + JSON.stringify(numbers));
      } finally { stop(); }
      return result(bad);
    });

  add('pagenum_live_pdf_writes_the_page_of_a_badge_in_a_table_cell',
    'Le PDF écrit le numéro de la page d\'une pastille posée dans la cellule d\'un tableau de la page 2',
    async (h) => {
      const bad = [];
      await h.resetEditor();
      const html = '<p>Un</p>' + BR + '<table><tbody><tr><td><p>Cellule ' + badge('n') + '</p></td></tr></tbody></table>';
      const out = await h.exportPdfContent(html, null);
      await h.ensurePdfJsLoaded();
      const bin = atob(out.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) pages.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join('').replace(/\s+/g, ' ').trim());
      if (pages.length !== 2 || !/Cellule 2/.test(pages[1] || '') || /#/.test(pages.join(' '))) bad.push('pages du PDF : ' + JSON.stringify(pages));
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pageNumberLive = cases;
})();
