// Suite "readerReads" - la Lecture (js/reader-mode.js) lit chaque table une fois par rendu, un export (PDF, Word, Excel) une fois par ligne exportée, et la
// pagination suit ce qui bouge après la mesure. fetchTable est un aller-retour jusqu'au serveur de Grist qui renvoie la table entière : une variable d'une autre
// table en demandait cinq à elle seule (la table liée, la table de la page, deux tables de métadonnées...), un macro-modèle de trois pages 304. Le temps d'un
// rendu (GristAPI.withReadPass), chaque table n'est lue qu'une fois, sans mémoire ensuite ; un export en fait autant (ExportCommon.resolveRecord). Côté mise en
// page, les coupures de page sont mesurées une fois : une image qui finit de charger après la mesure (pièce jointe, adresse externe) laisserait des bandes
// périmées, la Lecture surveille donc sa feuille. L'image réellement lente (réseau) et la vraie souris : dev-tests/verify-reader-late-images-mouse.mjs.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'RdDossiers';
  const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

  // La page est sur RdDossiers, dont Client et Responsable sont des Références. Les règles de liaison sont celles du document d'Antoine : table liée par sa clé de
  // correspondance (identifiant de ligne = colonne Référence de la page). La ligne livrée par grist.onRecord porte les valeurs AFFICHÉES, pas les identifiants :
  // c'est ce qui force chaque variable à relire la table de la page pour retrouver l'identifiant.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('RdClients', { Nom: 'Text', Ville: 'Text', Pays: 'Text' });
    stub.setRows('RdClients', Array.from({ length: 40 }, (_, i) => ({ id: i + 1, Nom: 'Client ' + (i + 1), Ville: 'Ville ' + (i + 1), Pays: i === 16 ? 'France' : 'Italie' })));
    stub.setVariables('RdEmployes', { Nom: 'Text', Service: 'Text' });
    stub.setRows('RdEmployes', Array.from({ length: 8 }, (_, i) => ({ id: i + 1, Nom: 'Employé ' + (i + 1), Service: 'Service ' + (i + 1) })));
    stub.setVariables(PAGE, { Nom: 'Text', Client: 'Ref:RdClients', Responsable: 'Ref:RdEmployes', gristHelper_Display: 'Text', gristHelper_Display2: 'Text' }, null,
      { Client: 'gristHelper_Display', Responsable: 'gristHelper_Display2' });
    stub.setRows(PAGE, Array.from({ length: 20 }, (_, i) => ({ id: i + 1, Nom: 'Dossier ' + (i + 1), Client: i + 1, Responsable: (i % 8) + 1,
      gristHelper_Display: 'Client ' + (i + 1), gristHelper_Display2: 'Employé ' + ((i % 8) + 1) })));
    await GristAPI.refreshSchema();
    await GristAPI.saveLinkRule('RdClients', { mode: 'match', colonneCible: 'id', colonneSource: 'Client' });
    await GristAPI.saveLinkRule('RdEmployes', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
  }
  const delivered = () => ({ id: 17, Nom: 'Dossier 17', Client: 'Client 17', Responsable: 'Employé 1' });

  async function showReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record || delivered(), NO_HF);
    return reader;
  }
  // Tables lues par fetchTable pendant `fn` - la seule façon de prouver « une seule lecture ».
  async function tablesRead(fn) {
    const original = grist.docApi.fetchTable;
    const read = [];
    grist.docApi.fetchTable = async (tableId) => { read.push(tableId); return original(tableId); };
    try { await fn(); } finally { grist.docApi.fetchTable = original; }
    return read;
  }
  const countOf = (read) => read.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {});

  // Quarante variables : onze de la table de la page, vingt-deux de RdClients, sept de RdEmployes - chacune relisait des tables entières.
  function manyBadges() {
    let html = '';
    for (let i = 0; i < 40; i++) {
      const pick = i % 4;
      html += '<p>L' + i + ' ' + (pick === 0 ? badge(PAGE, 'Nom') : pick === 3 ? badge('RdEmployes', 'Nom') : badge('RdClients', i % 2 ? 'Nom' : 'Ville')) + '</p>';
    }
    return html;
  }

  cases.push({
    id: 'reader_reads_each_table_once_per_render',
    description: 'Un rendu de la Lecture avec quarante variables de trois tables lit chaque table une seule fois (avant : plus de cent lectures), et les valeurs sont les bonnes',
    run: async (h) => {
      await seed(h);
      let reader;
      const read = await tablesRead(async () => { reader = await showReader(manyBadges()); });
      const counts = countOf(read);
      const text = reader.querySelector('.reader-content').textContent;
      const values = text.includes('Dossier 17') && text.includes('Client 17') && text.includes('Ville 17') && text.includes('Employé 1');
      const errors = reader.querySelectorAll('.error-msg').length;
      const worst = Math.max(...Object.values(counts));
      return { pass: worst === 1 && read.length <= 6 && values && errors === 0, notes: JSON.stringify({ total: read.length, counts, values, errors }) };
    },
  });

  cases.push({
    id: 'reader_reads_include_macro_model_assembly',
    description: 'Un macro-modèle assemblé pendant le rendu (règle de slot sur une colonne d’une autre table) partage ses lectures avec les variables : toujours une lecture par table',
    run: async (h) => {
      await seed(h);
      const templates = [
        { id: 'a', contenu: '<h1>Garde</h1>' + manyBadges() },
        { id: 'b', contenu: '<h1>Annexe France</h1>' + badge('RdClients', 'Nom') },
        { id: 'c', contenu: '<h1>Annexe autre</h1>' },
      ];
      const slots = { slots: [
        { type: 'fixed', modeleId: 'a' },
        { type: 'conditional', rules: [{ column: 'RdClients.Pays', operator: '=', value: 'France', modeleId: 'b' }], defaultModeleId: 'c' },
      ] };
      let reader;
      const read = await tablesRead(async () => {
        reader = await showReader(() => MacroTemplates.buildConcatenatedHtml(slots, PAGE, delivered(), templates));
      });
      const counts = countOf(read);
      const text = reader.querySelector('.reader-content').textContent;
      const franceSlot = text.includes('Annexe France') && !text.includes('Annexe autre');
      const worst = Math.max(...Object.values(counts));
      return { pass: worst === 1 && franceSlot && text.includes('Ville 17'), notes: JSON.stringify({ total: read.length, counts, franceSlot }) };
    },
  });

  cases.push({
    id: 'reader_reads_are_not_kept_after_the_render',
    description: 'Les lectures partagées ne survivent pas au rendu : une valeur modifiée dans Grist apparaît au rendu suivant, et hors rendu rien n’est mémorisé',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      let reader = await showReader(manyBadges());
      const before = reader.querySelector('.reader-content').textContent;
      // Grist change le nom du client 17 entre deux rendus.
      stub.setRows('RdClients', Array.from({ length: 40 }, (_, i) => ({ id: i + 1, Nom: i === 16 ? 'Client 17 renommé' : 'Client ' + (i + 1), Ville: 'Ville ' + (i + 1), Pays: 'Italie' })));
      let read;
      read = await tablesRead(async () => { reader = await showReader(manyBadges()); });
      const after = reader.querySelector('.reader-content').textContent;
      // Hors rendu : deux lectures de ligne donnent chacune l'état du moment.
      const first = await GristAPI.fetchRowById('RdClients', 17);
      stub.setRows('RdClients', Array.from({ length: 40 }, (_, i) => ({ id: i + 1, Nom: 'Client autre ' + (i + 1), Ville: 'Ville ' + (i + 1), Pays: 'Italie' })));
      const second = await GristAPI.fetchRowById('RdClients', 17);
      const rowsFirst = await GristAPI.fetchTableRows('RdClients');
      stub.setRows('RdClients', Array.from({ length: 40 }, (_, i) => ({ id: i + 1, Nom: 'Client dernier ' + (i + 1), Ville: 'Ville ' + (i + 1), Pays: 'Italie' })));
      const rowsSecond = await GristAPI.fetchTableRows('RdClients');
      const problems = [];
      if (before.includes('renommé') || !before.includes('Client 17')) problems.push('avant : ' + before.slice(0, 120));
      if (!after.includes('Client 17 renommé')) problems.push('après : ' + after.slice(0, 160));
      if (countOf(read).RdClients !== 1) problems.push('lectures du rendu : ' + JSON.stringify(countOf(read)));
      if (first.Nom !== 'Client 17 renommé' || second.Nom !== 'Client autre 17') problems.push('fetchRowById hors rendu : ' + first.Nom + ' / ' + second.Nom);
      if (rowsFirst[16].Nom !== 'Client autre 17' || rowsSecond[16].Nom !== 'Client dernier 17') problems.push('fetchTableRows hors rendu : ' + rowsFirst[16].Nom + ' / ' + rowsSecond[16].Nom);
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // En-tête et pied de page avec une variable de chacune des deux autres tables, et un nom de fichier qui en lit aussi : tout ce qu'un export résout pour une ligne.
  const EXPORT_HF = { enabled: true, differentFirstPage: false,
    header: { default: '<p>' + badge('RdClients', 'Ville') + '</p>', first: '' }, footer: { default: '<p>' + badge('RdEmployes', 'Service') + '</p>', first: '' } };
  const EXPORT_FILENAME = 'Fiche_#RdClients.Nom_#RdEmployes.Nom';

  cases.push({
    id: 'export_reads_each_table_once_per_record',
    description: 'Un export d’une ligne (PDF, Word, Excel) lit chaque table une seule fois, corps, nom du fichier, en-tête et pied réunis (avant : une série de lectures par variable), et le nom du fichier est le bon',
    run: async (h) => {
      await seed(h);
      await PdfExport.ensurePdfLibsLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const html = manyBadges();
      const exporters = {
        pdf: () => PdfExport.getNativePdfBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME, EXPORT_HF, undefined),
        docx: () => DocxExport.getDocxBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME, EXPORT_HF, undefined),
        xlsx: () => XlsxExport.getXlsxBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME),
      };
      const problems = [];
      const counted = {};
      for (const [name, run] of Object.entries(exporters)) {
        let result = null;
        const read = await tablesRead(async () => { result = await run(); });
        const counts = countOf(read);
        counted[name] = counts;
        if (!read.length || Math.max(...Object.values(counts)) !== 1) problems.push(name + ' : lectures ' + JSON.stringify(counts));
        if (!result || result.filename !== 'Fiche_Client 17_Employé 1') problems.push(name + ' : nom du fichier ' + (result && result.filename));
        if (!result || !result.blob || !result.blob.size) problems.push(name + ' : fichier vide');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, counted }) };
    },
  });

  // Deux tables de 2 000 lignes que le document n'utilise pas, dans le schéma du document : un export ne les lit pas.
  async function addUnusedTables() {
    const stub = window.__gristStub;
    ['RdArchives', 'RdJournal'].forEach(name => {
      stub.setVariables(name, { Titre: 'Text', Montant: 'Numeric' });
      stub.setRows(name, Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, Titre: 'Ligne ' + (i + 1), Montant: i })));
    });
    await GristAPI.refreshSchema();
  }

  cases.push({
    id: 'export_does_not_read_tables_the_document_does_not_use',
    description: 'Un export de trois lignes d’affilée (PDF, Word, Excel) ne lit pas les tables du document que ses variables n’utilisent pas (avant : la passe de schéma exact relisait toutes les tables à chaque ligne, 1,4 million de cases pour un PDF d’une ligne dans le banc de charge) ; les trois autres tables restent lues une seule fois par ligne',
    run: async (h) => {
      await seed(h);
      await addUnusedTables();
      await PdfExport.ensurePdfLibsLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const html = manyBadges();
      const exporters = {
        pdf: () => PdfExport.getNativePdfBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME, EXPORT_HF, undefined),
        docx: () => DocxExport.getDocxBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME, EXPORT_HF, undefined),
        xlsx: () => XlsxExport.getXlsxBlobForRecord(html, PAGE, delivered(), EXPORT_FILENAME),
      };
      const problems = [];
      const counted = {};
      for (const [name, run] of Object.entries(exporters)) {
        const read = await tablesRead(async () => { await run(); await run(); await run(); });
        const counts = countOf(read);
        counted[name] = counts;
        const unused = (counts.RdArchives || 0) + (counts.RdJournal || 0);
        if (unused) problems.push(name + ' : ' + unused + ' lecture(s) d’une table que le document n’utilise pas');
        ['RdDossiers', 'RdClients', 'RdEmployes'].forEach(table => { if (counts[table] !== 3) problems.push(name + ' : ' + table + ' lue ' + (counts[table] || 0) + ' fois pour 3 lignes'); });
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, counted }) };
    },
  });

  cases.push({
    id: 'export_types_a_column_added_since_the_last_schema_pass',
    description: 'Une colonne Pièces jointes ajoutée dans Grist depuis la dernière passe de schéma est connue comme telle après un export (les types de colonnes sont relus à chaque ligne exportée, comme à chaque rendu de la Lecture : une photo ne s’écrit pas comme une liste de nombres)',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      stub.setVariables('RdPieces', { Nom: 'Text', Photo: 'Attachments' });
      stub.setRows('RdPieces', [{ id: 1, Nom: 'Pièce 1', Photo: [] }]);
      const before = GristAPI.getColumnType('RdPieces', 'Photo');
      await XlsxExport.getXlsxBlobForRecord('<p>' + badge('RdPieces', 'Nom') + '</p>', 'RdPieces', { id: 1, Nom: 'Pièce 1', Photo: [] }, '');
      const after = GristAPI.getColumnType('RdPieces', 'Photo');
      return { pass: before !== 'Attachments' && after === 'Attachments', notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'reader_superseded_renders_stop_early',
    description: 'Trois rendus lancés d’affilée (ligne qui change, zoom qui s’applique) : les deux premiers s’arrêtent après leur première attente, seul le dernier lit les tables et s’affiche',
    run: async (h) => {
      await seed(h);
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      const html = manyBadges();
      const read = await tablesRead(async () => {
        await Promise.all([
          ReaderMode.render(html, PAGE, { id: 15, Nom: 'Dossier 15', Client: 'Client 15', Responsable: 'Employé 7' }, NO_HF),
          ReaderMode.render(html, PAGE, { id: 16, Nom: 'Dossier 16', Client: 'Client 16', Responsable: 'Employé 8' }, NO_HF),
          ReaderMode.render(html, PAGE, delivered(), NO_HF),
        ]);
      });
      const counts = countOf(read);
      const contents = reader.querySelectorAll('.reader-content');
      const text = contents.length ? contents[0].textContent : '';
      const problems = [];
      if (contents.length !== 1) problems.push(contents.length + ' feuilles affichées');
      if (!text.includes('Dossier 17') || text.includes('Dossier 15') || text.includes('Dossier 16')) problems.push('texte : ' + text.slice(0, 80));
      if (counts.RdClients !== 1 || counts.RdEmployes !== 1 || counts[PAGE] !== 1) problems.push('lectures : ' + JSON.stringify(counts));
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'reader_column_types_never_blank_during_a_refresh',
    description: 'Pendant que les types de colonnes se rafraîchissent, un autre rendu qui lit un type (Référence, Pièces jointes) ne tombe pas sur un schéma vidé',
    run: async (h) => {
      await seed(h);
      const pending = GristAPI.refreshColumnTypes();
      const during = GristAPI.getColumnType(PAGE, 'Client');
      await pending;
      const after = GristAPI.getColumnType(PAGE, 'Client');
      return { pass: during === 'Ref:RdClients' && after === 'Ref:RdClients', notes: JSON.stringify({ during, after }) };
    },
  });

  // --- Mise en page : suit une image qui change de taille après la mesure. ---
  // L'image est ici une image ordinaire dont la largeur change après le rendu : même effet, pour la mise en page, qu'une image qui finit de charger (hauteur de 0 à sa taille
  // naturelle) - sans dépendre du réseau. La référence est la même page rendue d'emblée avec la taille finale.
  function pngDataUri() {
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4a7bd0'; ctx.fillRect(0, 0, 900, 600);
    return canvas.toDataURL('image/png');
  }
  const para = (t, n) => Array.from({ length: n }, (_, i) => `<p>${t} ligne ${i + 1} du texte courant du modèle</p>`).join('');
  const pageHtml = (src, width) => `<h1>Page de garde</h1>${para('Garde', 14)}<p><img class="editor-image" src="${src}" style="width: ${width}px"></p>${para('Suite', 46)}`
    + MacroTemplates.slotBreakHtml(1) + `<h1>Annexe</h1>${para('Annexe', 30)}`;
  function readerGeometry() {
    const rc = document.getElementById('reader-container');
    const content = rc.querySelector('.reader-content');
    const zoom = parseFloat(getComputedStyle(content).zoom) || 1;
    const bands = Array.from(rc.querySelectorAll('.v2-page-band')).map(b => { const r = b.getBoundingClientRect(); return { top: r.top / zoom, bottom: r.bottom / zoom }; });
    const kids = Array.from(content.children).filter(k => k.tagName !== 'STYLE' && !k.classList.contains('page-break-marker')).map(k => { const r = k.getBoundingClientRect(); return { text: (k.textContent || '').slice(0, 20), top: r.top / zoom, bottom: r.bottom / zoom, h: r.height / zoom }; });
    const straddle = bands.flatMap((b, i) => kids.filter(k => k.h > 0 && k.top < b.bottom - 0.5 && k.bottom > b.top + 0.5).map(k => ({ band: i, kid: k.text })));
    // Les feuilles entières ont une hauteur fixe : la couture reste au même endroit quand le contenu bouge ; ce qui change, c'est le bloc qui finit la page et celui qui
    // ouvre la suivante.
    const cuts = bands.map(b => {
      const before = kids.filter(k => k.bottom <= b.top + 0.5).pop();
      const after = kids.find(k => k.top >= b.bottom - 0.5);
      return (before ? before.text : '-') + ' | ' + (after ? after.text : '-');
    });
    return { bandTops: bands.map(b => Math.round(b.top * 10) / 10), cuts, straddle, contentHeight: Math.round(content.getBoundingClientRect().height / zoom) };
  }
  async function untilStable(ms) {
    let last = JSON.stringify(readerGeometry()); const t0 = performance.now();
    for (;;) {
      await new Promise(r => setTimeout(r, 120));
      const now = JSON.stringify(readerGeometry());
      if (now === last && performance.now() - t0 > 360) return;
      last = now;
      if (performance.now() - t0 > ms) return;
    }
  }

  cases.push({
    id: 'reader_pagination_follows_an_image_that_changes_size',
    description: 'Une image qui change de taille après le rendu (comme une image qui finit de charger) : les coupures de page sont refaites, identiques à celles d’un rendu d’emblée à la taille finale, aucune ligne coupée en deux',
    run: async (h) => {
      h.setA4Preview(true);
      const src = pngDataUri();
      document.getElementById('editor-container').style.display = 'none';
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(pageHtml(src, 560), PAGE, { id: 1 }, NO_HF);
      const initial = readerGeometry();
      // Après coup : l'image passe de 560 à 230 px de large (donc de 373 à 153 px de haut) et les coupures qui suivent doivent remonter.
      reader.querySelector('.reader-content img').style.width = '230px';
      await untilStable(2500);
      const followed = readerGeometry();
      await ReaderMode.render(pageHtml(src, 230), PAGE, { id: 1 }, NO_HF);
      const reference = readerGeometry();
      const sameCuts = JSON.stringify(followed.cuts) === JSON.stringify(reference.cuts) && JSON.stringify(followed.bandTops) === JSON.stringify(reference.bandTops);
      const moved = JSON.stringify(initial.cuts) !== JSON.stringify(reference.cuts);
      return { pass: moved && sameCuts && followed.straddle.length === 0 && followed.contentHeight === reference.contentHeight,
        notes: JSON.stringify({ initial: initial.cuts, followed: followed.cuts, reference: reference.cuts, straddle: followed.straddle, heights: [followed.contentHeight, reference.contentHeight] }) };
    },
  });

  cases.push({
    id: 'reader_pagination_recompute_keeps_scroll_and_layer_images',
    description: 'Refaire la mise en page (ici : une police qui arrive) ne déplace ni le défilement du lecteur, même tout en bas, ni les images en calque de chaque courrier (décalage par slot appliqué une seule fois)',
    run: async (h) => {
      h.setA4Preview(true);
      const src = pngDataUri();
      document.getElementById('editor-container').style.display = 'none';
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      const layered = '<img class="editor-image" src="' + src + '" alt="" style="width: 60px; position: absolute; left: 600px; top: 120px;" data-layer="behind" data-wrap="inline">';
      const html = pageHtml(src, 560).replace('<h1>Annexe</h1>', '<p>ANNEXE</p><p>' + layered + 'Avec une image en calque</p>');
      await ReaderMode.render(html, PAGE, { id: 1 }, NO_HF);
      const content = reader.querySelector('.reader-content');
      const distance = () => {
        const zoom = parseFloat(getComputedStyle(content).zoom) || 1;
        const title = Array.from(content.querySelectorAll('p')).find(e => e.textContent === 'ANNEXE');
        return (content.querySelector('img[data-layer="behind"]').getBoundingClientRect().top - title.getBoundingClientRect().top) / zoom;
      };
      const expected = 120 - (parseFloat(getComputedStyle(content).paddingTop) || 0);
      const distanceBefore = distance();
      const overlayBefore = reader.querySelector('.v2-pagination-overlay');
      reader.style.height = '300px';
      reader.scrollTop = reader.scrollHeight;
      const scrolled = reader.scrollTop;
      // Une police web qui finit de charger : la mise en page est refaite, sans que rien ne change de taille.
      document.fonts.dispatchEvent(new Event('loadingdone'));
      await h.sleep(500);
      const overlayAfter = reader.querySelector('.v2-pagination-overlay');
      const kept = reader.scrollTop;
      const distanceAfter = distance();
      reader.style.height = '';
      const problems = [];
      if (scrolled < 1000) problems.push('défilement posé : ' + scrolled);
      if (overlayBefore === overlayAfter) problems.push('la mise en page n’a pas été refaite');
      if (Math.abs(kept - scrolled) > 1) problems.push('défilement ' + scrolled + ' -> ' + kept);
      // L'image en calque de l'annexe garde sa distance au titre de son courrier : le décalage par slot repart de son `top` d'origine, il ne s'ajoute pas au précédent.
      if (Math.abs(distanceBefore - expected) > 2 || Math.abs(distanceAfter - distanceBefore) > 0.5) problems.push('image en calque : distance au titre ' + distanceBefore.toFixed(1) + ' -> ' + distanceAfter.toFixed(1) + ' (attendu ' + expected.toFixed(1) + ')');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.readerReads = cases;
})();
