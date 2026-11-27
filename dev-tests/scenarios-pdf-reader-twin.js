// Le PDF est la Lecture, ligne à ligne. Défaut d'Antoine du 27/11 : « le PDF doit être STRICTEMENT IDENTIQUE au mode Lecture (et à l'éditeur) » - un courrier en deux colonnes
// (adresse à gauche, texte à droite, Roboto 10,5 pt) gardait « Un rapport d'activités sera demandé… » au bas de la page 1 dans le PDF et le passait en haut de la page 2 en Lecture.
// La Lecture (js/reader-mode.js), l'éditeur (js/header-footer-preview.js) et le PDF (pdfmake) ont chacun leur arithmétique de coupure de page : un bloc qui tombe à quelques dixièmes de
// pixel du bas de la page tenait pour l'un et pas pour l'autre, et tout ce qui suit changeait de page. Ici le PDF est relu par pdf.js (une ligne = une rangée de texte, sa page et sa hauteur)
// et comparé à la Lecture (le rectangle de chaque mot, rangé par page d'après les coutures) : même nombre de pages, même nombre de lignes par page, même texte à chaque rang, même hauteur
// (à 1,5 px près, depuis la première ligne de la page). Les coupures se trouvent par dichotomie sur la marge du bas : c'est autour d'elles, et seulement là, que les deux moteurs divergent.
(function () {
  const cases = [];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PX = 4 / 3;
  const TOLERANCE_PX = 1.5;

  const zone = (left, right) => '<div class="two-columns-zone" style="--layout-left: 35%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  const sty = text => '<span style="font-family: Roboto; font-size: 10.5pt">' + text + '</span>';
  const para = text => '<p>' + sty(text) + '</p>';
  const blank = () => '<p></p>';
  const justified = inner => '<p style="text-align: justify">' + inner + '</p>';

  const TABLE = 'TwPostes';
  const COND_CCD = { mode: 'all', rules: [{ column: 'Type', operator: '=', value: 'CCD Projet' }] };
  const attrJson = (name, value) => ' ' + name + '="' + JSON.stringify(value).replace(/"/g, '&quot;') + '"';
  const badge = column => '<span class="var-badge" data-table="' + TABLE + '" data-column="' + column + '" data-key="' + TABLE + '.' + column + '"></span>';
  const RECORD = {
    id: 1, Type: 'CCD Projet', Nom: 'Etienne DUGUET', Titre: 'Vice-président Innovation', Duree: '12', Debut: '16/11/2026', Fin: '29/02/2028', Contrat: 'CCD Projet', Poste: 'IGE', Categ: 'A', Struct: 'Service Dev_Innovation',
    Mission: 'Animer la communauté scientifique en Environnement, Agronomie, Agroalimentaire et Nutrition, en favorisant l\'innovation, l\'entrepreneuriat et les partenariats public-privé, tout en servant d\'interface entre les acteurs académiques et l\'écosystème local d\'innovation',
    Justif: '- Conduite d\'un plan tactique d\'innovation par an.\n- Organisation ou co-organisation d\'au moins un évènement pour sa communauté.\n- Deux candidats / AAP prématuration ou MyPhD+, deux cofinancements prémat/mat.\n- Initiation d\'au moins 10 rencontres par an d\'EC/C avec une entreprise partenaire potentielle.',
  };
  const SOURCE = { tableId: TABLE, record: Object.assign({}, RECORD) };
  async function seedRecord(h) {
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Type: 'Text', Nom: 'Text', Titre: 'Text', Duree: 'Text', Debut: 'Text', Fin: 'Text', Contrat: 'Text', Poste: 'Text', Categ: 'Text', Struct: 'Text', Mission: 'Text', Justif: 'Text' });
    stub.setRows(TABLE, [Object.assign({}, RECORD)]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await h.sleep(50);
  }

  // Le courrier d'Antoine (capture du 27/11) : adresse à gauche, courrier à droite - des lignes vides, une liste à puces justifiée dont les valeurs sont des variables, un bloc à condition,
  // le paragraphe qui change de page, la formule de politesse. `extra` : des lignes vides en tête de la colonne de droite, pour décaler la coupure.
  function letter(extra) {
    const left = blank().repeat(30) + para('Adresse postale Université de Bordeaux 351 cours de la Libération') + para('33405 Talence cedex') + para('www.u-bordeaux.fr');
    const right = blank().repeat(extra)
      + para('Ce projet s\'inscrit dans l\'axe "Projets innovation", action(s) : 6 : Doubler le flux de projets d\'innovation à fort impact, y compris des deeptechs.')
      + blank()
      + '<p><strong>' + sty('Poste concerné (Cf plan de déploiement RH 2026)') + '</strong></p>'
      + '<ul><li>' + justified(sty('CHAI Agri Agro - prolongation')) + '</li>'
      + '<li>' + justified(sty('Mission principale : ') + badge('Mission')) + '</li>'
      + '<li>' + justified(sty('Durée du financement : ') + badge('Duree')) + '</li>'
      + '<li>' + justified(sty('Date début financement prévisionnel ') + badge('Debut')) + '</li>'
      + '<li>' + justified(sty('Date limite de financement : ') + badge('Fin')) + '</li>'
      + '<li>' + justified(sty('Type de contrat : ') + badge('Contrat') + sty(' Corps : ') + badge('Poste') + sty(' Catégorie ') + badge('Categ')) + '</li>'
      + '<li>' + justified(sty('Structure d\'affectation : ') + badge('Struct')) + '</li></ul>'
      + blank()
      + '<div class="conditional-text"' + attrJson('data-condition', COND_CCD) + '><p><strong>' + sty('Livrables et résultats attendus à la fin du contrat :') + '</strong></p><p>' + badge('Justif') + '</p></div>'
      + justified(sty('Un rapport d\'activités sera demandé chaque année dans le cadre de l\'évaluation annelle demandée par l\'ANR,'))
      + blank()
      + justified(sty('Vous souhaitant une bonne réussite dans votre projet, je vous prie de croire à l\'assurance de mes sentiments les meilleurs.'))
      + blank()
      + '<p>' + badge('Nom') + sty(', ') + badge('Titre') + '</p>';
    return zone(left, right);
  }
  // Des paragraphes de deux lignes (justifiés), au premier niveau, puis dans une colonne de zone.
  const twoLines = (n, tag) => Array.from({ length: n }, (_, k) => justified(sty(tag + k + ' Un rapport d\'activités sera demandé chaque année dans le cadre de l\'évaluation annelle demandée par l\'ANR, merci'))).join('');
  const oneLines = (n, tag) => Array.from({ length: n }, (_, k) => para(tag + ' ligne ' + k)).join('');
  // Un titre de 18 pt, une ligne de 14 pt et des lignes courantes : les tailles différentes d'une même page.
  const mixed = n => Array.from({ length: n }, (_, k) => (k % 7 === 0 ? '<h2>Titre ' + k + '</h2>' : (k % 5 === 0 ? '<p><span style="font-size: 14pt">Grande ligne ' + k + '</span></p>' : justified(sty('Ligne ' + k + ' Un rapport d\'activités sera demandé chaque année dans le cadre de l\'évaluation annelle'))))).join('');

  const FIXTURES = {
    courrier: { html: () => letter(24), record: true, from: 8, to: 16 },
    courrierDeCalage: { html: () => letter(20), record: true, from: 4, to: 20 },
    paragraphes: { html: () => twoLines(60, 'P'), from: 8, to: 22 },
    zone: { html: () => zone(oneLines(75, 'G'), twoLines(40, 'D')), from: 8, to: 22 },
    tailles: { html: () => mixed(60), from: 8, to: 22 },
    petit: { html: () => Array.from({ length: 90 }, (_, k) => justified('<span style="font-family: Roboto; font-size: 8pt">Ligne ' + k + ' Un rapport d\'activités sera demandé chaque année dans le cadre de l\'évaluation annelle demandée par l\'ANR, merci</span>')).join(''), from: 8, to: 22 },
  };

  const norm = s => s.replace(/[\s  ]+/g, '');
  async function blobBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < buf.length; i += 8192) text += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(text);
  }
  // Les lignes du PDF, par page : { text, y (px depuis le haut de la page), col } - une rangée de texte, hors les puces de liste (un glyphe seul).
  async function pdfLines(h, html, source) {
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt(), source);
    const truth = await h.extractPdfGroundTruth(await blobBase64(result.blob));
    return truth.pages.map(page => {
      const rows = [];
      page.textItems.filter(it => !/^\s*[•◦▪‣]\s*$/.test(it.str)).forEach(it => {
        const y = it.y * PX; const col = it.x * PX < 250 ? 0 : 1;
        let row = rows.find(r => r.col === col && Math.abs(r.y - y) < 2);
        if (!row) { row = { y, col, items: [] }; rows.push(row); }
        row.items.push(it);
      });
      return rows.map(r => ({ y: r.y, col: r.col, text: norm(r.items.sort((a, b) => a.x - b.x).map(i => i.str).join('')) })).sort((a, b) => a.y - b.y || a.col - b.col);
    });
  }
  // Les lignes de la Lecture, par page (rangées par les coutures de page) : la même forme.
  function readerLines() {
    const root = document.querySelector('#reader-container .reader-content');
    const seams = Array.from(document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-seam, #reader-container .v2-pagination-overlay .v2-page-break-line'))
      .map(s => s.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const pages = Array.from({ length: seams.length + 1 }, () => []);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const rootLeft = root.getBoundingClientRect().left;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('.v2-pagination-overlay, .page-break-marker, style, script, button')) continue;
      const re = /\S+/g; let m;
      while ((m = re.exec(node.textContent))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        let page = 0;
        while (page < seams.length && seams[page].top <= rect.top) page++;
        pages[page].push({ word: m[0], top: rect.top, left: rect.left - rootLeft });
      }
    }
    return pages.map((words) => {
      const rows = [];
      words.forEach((w) => {
        const col = w.left < 250 ? 0 : 1;
        let row = rows.find(r => r.col === col && Math.abs(r.top - w.top) < 3);
        if (!row) { row = { top: w.top, col, words: [] }; rows.push(row); }
        row.words.push(w);
      });
      return rows.map(r => ({ y: r.top, col: r.col, text: norm(r.words.sort((a, b) => a.left - b.left).map(w => w.word).join('')) })).sort((a, b) => a.y - b.y || a.col - b.col);
    });
  }
  const summarize = lines => lines.map(page => page.length).join('+');

  // Ce qui sépare le PDF de la Lecture (vide : identiques) : le nombre de pages, le nombre de lignes de chaque page, le texte de chaque ligne, puis la hauteur de chaque ligne depuis la première
  // de sa page. Le PDF donne la ligne de base d'un texte, la Lecture le haut de sa boîte : l'écart de hauteur ne se lit qu'entre des lignes de même taille, donc depuis la première ligne courante.
  function difference(pdf, reader) {
    if (pdf.length !== reader.length) return 'pages : ' + pdf.length + ' dans le PDF, ' + reader.length + ' en Lecture (lignes ' + summarize(pdf) + ' contre ' + summarize(reader) + ')';
    for (let k = 0; k < pdf.length; k++) {
      const a = pdf[k], b = reader[k];
      if (a.length !== b.length) return 'page ' + (k + 1) + ' : ' + a.length + ' lignes dans le PDF, ' + b.length + ' en Lecture (' + summarize(pdf) + ' contre ' + summarize(reader) + ')';
      for (let i = 0; i < a.length; i++) {
        if (a[i].text !== b[i].text) return 'page ' + (k + 1) + ', ligne ' + (i + 1) + ' : « ' + a[i].text.slice(0, 24) + ' » dans le PDF, « ' + b[i].text.slice(0, 24) + ' » en Lecture';
      }
    }
    return '';
  }
  // L'écart de hauteur : ligne à ligne, entre des lignes de la taille courante (celles dont le texte ne commence ni par « Titre » ni par « Grande »).
  function heightGap(pdf, reader) {
    let worst = { gap: 0, where: '' };
    pdf.forEach((a, k) => {
      const b = reader[k];
      const ref = a.findIndex(l => !/^(Titre|Grande)/.test(l.text));
      if (ref < 0) return;
      a.forEach((l, i) => {
        if (/^(Titre|Grande)/.test(l.text)) return;
        const gap = Math.abs((l.y - a[ref].y) - (b[i].y - b[ref].y));
        if (gap > worst.gap) worst = { gap, where: 'page ' + (k + 1) + ', ligne ' + (i + 1) + ' (' + l.text.slice(0, 16) + ')' };
      });
    });
    return worst.gap > TOLERANCE_PX ? 'hauteur : ' + worst.gap.toFixed(1) + ' px d\'écart, ' + worst.where : '';
  }

  async function setBottomMargin(h, mm) {
    await h.resetEditor();
    PageLayout.setMarginsMm({ top: 15, right: 15, bottom: Math.round(mm * 1000) / 1000, left: 15 });
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(250);
  }
  async function renderReader(h, fixture) {
    document.getElementById('reader-container').style.display = 'block';
    document.getElementById('editor-container').style.display = 'block';
    if (fixture.record) await ReaderMode.render(fixture.html(), TABLE, GristAPI.getCurrentRecord(), NO_HF);
    else await h.renderReaderMode(fixture.html(), null);
    await h.sleep(150);
  }
  // Le PDF et la Lecture du même document à la marge du bas `mm` : leur différence ('' si identiques).
  async function compareAt(h, fixture, mm) {
    await setBottomMargin(h, mm);
    if (fixture.record) await seedRecord(h);
    const pdf = await pdfLines(h, fixture.html(), fixture.record ? SOURCE : undefined);
    await renderReader(h, fixture);
    const reader = readerLines();
    return difference(pdf, reader) || heightGap(pdf, reader);
  }
  // Les lignes de la première page de la Lecture à la marge `mm` : ce qu'une coupure change d'une marge à l'autre (le PDF n'est pas produit : l'essai est rapide).
  async function readerFirstPageLines(h, fixture, mm) {
    await setBottomMargin(h, mm);
    if (fixture.record) await seedRecord(h);
    await renderReader(h, fixture);
    return readerLines().map(page => page.length)[0];
  }
  // Les marges (mm) où la première page de la Lecture perd une ligne, entre `from` et `to` : par pas de 0,5 mm puis dichotomie à 0,005 mm. On en garde `count` à partir de la première.
  async function transitions(h, fixture, count) {
    const found = [];
    let previous = await readerFirstPageLines(h, fixture, fixture.from);
    for (let mm = fixture.from + 0.5; mm <= fixture.to && found.length < count; mm += 0.5) {
      const lines = await readerFirstPageLines(h, fixture, mm);
      if (lines < previous) {
        let lo = mm - 0.5, hi = mm;
        while (hi - lo > 0.005) {
          const mid = (lo + hi) / 2;
          if (await readerFirstPageLines(h, fixture, mid) < previous) hi = mid; else lo = mid;
        }
        found.push(hi);
      }
      previous = lines;
    }
    return found;
  }

  // Les marges autour de chaque coupure : en deçà, le bloc tient pour les deux moteurs ; au-delà, il passe à la page suivante pour les deux ; entre les deux (quelques centièmes de millimètre),
  // l'un et l'autre ne s'accordaient pas.
  const OFFSETS_MM = [-0.08, -0.04, -0.02, -0.005, 0.005, 0.02, 0.04, 0.08];
  function twinCase(id, description, fixtureName, count) {
    cases.push({
      id, description,
      run: async (h) => {
        const fixture = FIXTURES[fixtureName];
        const bad = [];
        let compared = 0;
        try {
          if (fixture.record) { await h.resetEditor(); await seedRecord(h); }
          const cuts = await transitions(h, fixture, count);
          if (!cuts.length) return { pass: false, notes: 'aucune coupure trouvée entre ' + fixture.from + ' et ' + fixture.to + ' mm : le document d\'essai ne remplit plus la page' };
          for (const cut of cuts) {
            for (const offset of OFFSETS_MM) {
              const mm = cut + offset;
              const diff = await compareAt(h, fixture, mm);
              compared++;
              if (diff) bad.push(mm.toFixed(3) + ' mm (coupure ' + cut.toFixed(3) + ') : ' + diff);
            }
          }
        } finally { PageLayout.setMarginsMm(null); OrientationToggle.sync(); document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged')); }
        return { pass: bad.length === 0, notes: compared + ' marges comparées autour de ' + count + ' coupures' + (bad.length ? ', ' + bad.length + ' écarts : ' + bad.slice(0, 4).join(' | ') : ' : le PDF est la Lecture') };
      },
    });
  }

  twinCase('twin_courrier_deux_colonnes', 'Le courrier d\'Antoine (deux colonnes, variables, bloc à condition) : le PDF coupe aux mêmes lignes que la Lecture, aux marges où la coupure bascule', 'courrier', 2);
  twinCase('twin_courrier_deux_colonnes_decale', 'Le même courrier décalé de quatre lignes vides : mêmes coupures', 'courrierDeCalage', 2);
  twinCase('twin_paragraphes_premier_niveau', 'Des paragraphes justifiés de deux lignes au premier niveau : mêmes coupures', 'paragraphes', 2);
  twinCase('twin_zone_deux_colonnes', 'Une zone à deux colonnes (lignes seules à gauche, paragraphes de deux lignes à droite) : mêmes coupures', 'zone', 2);
  twinCase('twin_petit_texte', 'Du texte de 8 pt (plus petit que la cale du paragraphe) : mêmes coupures et mêmes hauteurs', 'petit', 2);
  twinCase('twin_tailles_melangees', 'Titres de 18 pt, lignes de 14 pt et lignes courantes : mêmes coupures et mêmes hauteurs', 'tailles', 2);


  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfReaderTwin = cases;
})();
