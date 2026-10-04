// Suite "pdfBatch" - export de toutes les lignes (js/main.js:onExportBatch) par les VRAIES lignes du menu « Exporter en PDF » : archive ZIP (un PDF
// par ligne) et PDF unique (js/pdf-merge.js, demande d'Antoine du 2026-09-28 : « toutes les lignes mais à la suite »), puis les deux téléchargements DOCX
// (un .docx, une archive d'un .docx par ligne). Le fichier téléchargé est intercepté (URL.createObjectURL + clic du <a download>) puis ouvert pour de vrai -
// pdf.js pour un PDF, JSZip pour une archive ou un .docx - comme le ferait l'utilisateur.
(function () {
  const cases = [];
  const TABLE = 'PbClients';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  function badge(column) {
    return `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  }
  const squash = s => String(s).replace(/\s+/g, '');

  async function seed(h, bodyHtml, headerFooterData) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await h.sleep(50);
    Editor.setHTML(bodyHtml);
    Editor.setHeaderFooterData(headerFooterData || NO_HF);
    await h.sleep(80);
  }

  // Clique la ligne du menu et attend le téléchargement : la confirmation acceptée et notée (options reçues), le <a download> intercepté au lieu d'un vrai téléchargement.
  // `downloadsSink` (facultatif) : la liste où un autre chemin de téléchargement note aussi ses fichiers (un PDF seul, pdfmake.download : voir clickSinglePdf).
  async function clickExportRow(h, rowId, downloadsSink) {
    const downloads = downloadsSink || [];
    const confirms = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: opts => { confirms.push(opts.message); return true; } });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    // Chaque message d'état affiché pendant l'export (confirmation, chargement, progression, fin), pas seulement le dernier.
    const statusEl = document.getElementById('status-msg');
    const statuses = [];
    const statusObserver = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    statusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < 60000) await h.sleep(100);
      await h.sleep(50); // le statut final est posé juste après le clic du <a>
    } finally {
      statusObserver.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, confirms, statuses, status: document.getElementById('status-msg').textContent };
  }

  // Texte de chaque page, dans l'ordre, lu dans les octets du PDF (pdf.js).
  async function pdfPageTexts(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const texts = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      texts.push(content.items.map(it => it.str).join(' '));
    }
    return texts;
  }

  // Le lot DOCX en ZIP n'a besoin que de JSZip pour fabriquer l'archive (choix d'Antoine, 29/09) : il ne télécharge plus le lot PDF (pdfmake, polices : ~4 Mo).
  // Premier cas du groupe, exprès : la page est neuve, ni JSZip ni pdfmake n'y sont encore chargés - un cas qui exporterait en PDF avant celui-ci les chargerait.
  const scriptsMatching = re => Array.from(document.scripts).filter(sc => re.test(sc.src)).length;
  cases.push({
    id: 'pdfbatch_docx_zip_loads_jszip_without_the_pdf_libs',
    description: '« Exporter toutes les lignes en DOCX (ZIP)… » charge JSZip seul : ni pdfmake, ni ses polices (window.pdfMake absent, aucun de ces scripts ajouté), et l’archive contient bien un .docx par ligne',
    run: async (h) => {
      await seed(h, `<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      const before = { jszip: typeof window.JSZip, pdfMake: typeof window.pdfMake, jszipScripts: scriptsMatching(/jszip/i), pdfScripts: scriptsMatching(/pdfmake|vfs_fonts|pdf-fonts/i) };
      const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
      const after = { jszip: typeof window.JSZip, pdfMake: typeof window.pdfMake, jszipScripts: scriptsMatching(/jszip/i), pdfScripts: scriptsMatching(/pdfmake|vfs_fonts|pdf-fonts/i) };
      const dl = res.downloads[0];
      const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
      const files = zip ? Object.keys(zip.files).sort() : [];
      const pass = before.jszip === 'undefined' && before.pdfMake === 'undefined' && before.pdfScripts === 0
        && after.jszip === 'function' && after.jszipScripts === 1 && after.pdfMake === 'undefined' && after.pdfScripts === 0
        && res.downloads.length === 1 && dl.name === TABLE + '-export-docx.zip' && files.length === NAMES.length && files.every(f => /\.docx$/.test(f));
      return { pass, notes: JSON.stringify({ before, after, files, status: res.status }) };
    },
  });

  // Une ligne courte par modèle : mises dans un même flux, les trois tiendraient sur une page - trois pages prouvent que chaque ligne en commence une.
  cases.push({
    id: 'pdfbatch_merged_single_pdf_rows_in_order',
    description: '« Exporter toutes les lignes en un seul PDF… » télécharge un seul .pdf où les lignes se suivent dans l’ordre de la table, chacune sur une nouvelle page',
    run: async (h) => {
      await seed(h, `<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
      const dl = res.downloads[0];
      const texts = dl && dl.blob ? await pdfPageTexts(h, dl.blob) : [];
      const pagesOk = texts.length === NAMES.length
        && NAMES.every((name, i) => squash(texts[i]).includes(squash(name)) && NAMES.every(other => other === name || !squash(texts[i]).includes(squash(other))));
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export.pdf' && !!dl.blob && dl.blob.type === 'application/pdf' && pagesOk
        && res.confirms.length === 1 && res.confirms[0] === I18n.t('confirm.mergedExport', { count: NAMES.length, table: TABLE })
        && res.status === I18n.t('status.mergedExportDone', { ok: NAMES.length });
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), confirms: res.confirms, status: res.status, texts }) };
    },
  });

  // Chaque ligne est rendue seule puis ses pages recopiées : un pied « n/total » reste propre à la ligne (1/2, 2/2), là où un flux unique donnerait 1/6...6/6.
  cases.push({
    id: 'pdfbatch_merged_keeps_each_row_page_numbering',
    description: 'Dans le PDF unique, chaque ligne garde sa propre numérotation de pages (pied « n/total » : 1/2 puis 2/2 pour chaque ligne)',
    run: async (h) => {
      // Badge tel que l'éditeur le sérialise (js/editor-nodes.js), libellé compris : sans texte, la zone serait jugée vide et le pied abandonné.
      const pageNum = '<span class="page-number-badge" contenteditable="false" data-format="n-slash-total">#/#</span>';
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>${pageNum}</p>`, first: '' } };
      await seed(h, `<p>Bonjour ${badge('Nom')}</p><div class="page-break-marker">Saut de page</div><p>Suite pour ${badge('Nom')}</p>`, hf);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
      const dl = res.downloads[0];
      const texts = dl && dl.blob ? await pdfPageTexts(h, dl.blob) : [];
      const expected = NAMES.flatMap(name => [[name, '1/2'], [name, '2/2']]);
      const pass = res.downloads.length === 1 && texts.length === expected.length
        && expected.every(([name, pageNum], p) => squash(texts[p]).includes(squash(name)) && squash(texts[p]).includes(pageNum))
        && !texts.some(t => /\/6/.test(squash(t)));
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), status: res.status, texts }) };
    },
  });

  // Le ZIP passe par la même fonction que le PDF unique depuis son ajout : il doit rester une archive d'un PDF par ligne.
  cases.push({
    id: 'pdfbatch_zip_still_one_pdf_per_row',
    description: '« Exporter toutes les lignes (ZIP)… » télécharge toujours une archive ZIP contenant un PDF par ligne',
    run: async (h) => {
      await seed(h, `<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-batch');
      const dl = res.downloads[0];
      const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
      // Nom de fichier vide par défaut -> "publipostage" pour chaque ligne, dédoublonné dans l'ordre des lignes (cf. uniqueZipFilename).
      const expectedByFile = { 'publipostage.pdf': NAMES[0], 'publipostage (2).pdf': NAMES[1], 'publipostage (3).pdf': NAMES[2] };
      const files = zip ? Object.keys(zip.files).sort() : [];
      const textsByFile = {};
      for (const f of files) textsByFile[f] = (await pdfPageTexts(h, await zip.file(f).async('blob'))).join(' | ');
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export-pdf.zip'
        && JSON.stringify(files) === JSON.stringify(Object.keys(expectedByFile).sort())
        && files.every(f => squash(textsByFile[f]).includes(squash(expectedByFile[f])))
        && res.confirms.length === 1 && res.confirms[0] === I18n.t('confirm.batchExport', { count: NAMES.length, table: TABLE })
        && res.status === I18n.t('status.batchExportDone', { ok: NAMES.length });
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), confirms: res.confirms, status: res.status, textsByFile }) };
    },
  });

  // Texte du corps d'un .docx, lu dans les octets (word/document.xml dézippé) : ce que Word afficherait, pas un état interne.
  async function docxBodyText(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const file = zip.file('word/document.xml');
    return file ? (await file.async('string')).replace(/<[^>]+>/g, '') : null;
  }

  // Les deux exports DOCX téléchargent par la même aide que le PDF unique et les lots ZIP (js/export-common.js:downloadBlob) : sans ces deux cas, rien ne
  // verrait un téléchargement DOCX cassé (docx/docxImages lisent le blob sans jamais le télécharger).
  cases.push({
    id: 'pdfbatch_docx_single_download',
    description: '« Exporter en DOCX » télécharge un seul .docx dont le corps contient le texte de la ligne courante',
    run: async (h) => {
      await seed(h, `<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      const res = await clickExportRow(h, 'v2-btn-export-docx');
      const dl = res.downloads[0];
      const text = dl && dl.blob ? await docxBodyText(dl.blob) : null;
      const pass = res.downloads.length === 1 && /\.docx$/.test(dl.name) && !!text && squash(text).includes(squash(NAMES[0]))
        && res.status === I18n.t('status.docxGenerated');
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), status: res.status, text }) };
    },
  });

  cases.push({
    id: 'pdfbatch_docx_zip_one_docx_per_row',
    description: '« Exporter toutes les lignes en DOCX (ZIP)… » télécharge une archive ZIP contenant un .docx par ligne, chacun avec le texte de sa ligne',
    run: async (h) => {
      await seed(h, `<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
      const dl = res.downloads[0];
      const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
      const expectedByFile = { 'publipostage.docx': NAMES[0], 'publipostage (2).docx': NAMES[1], 'publipostage (3).docx': NAMES[2] };
      const files = zip ? Object.keys(zip.files).sort() : [];
      const textsByFile = {};
      for (const f of files) textsByFile[f] = (await docxBodyText(await zip.file(f).async('blob'))) || '';
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export-docx.zip'
        && JSON.stringify(files) === JSON.stringify(Object.keys(expectedByFile).sort())
        && files.every(f => squash(textsByFile[f]).includes(squash(expectedByFile[f])))
        && res.confirms.length === 1;
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), confirms: res.confirms, status: res.status, textsByFile }) };
    },
  });

  // Avant le 29/09, ce lot demandait « Générer un PDF pour chacune des N lignes… », affichait « Export PDF en lot » puis « N PDF générés » alors que les fichiers
  // sont des .docx (choix d'Antoine : corriger). Vérifié sur ce que la personne LIT - chaque message d'état de l'export, dans les deux langues - et non sur les
  // clés i18n : aucun ne doit dire PDF, et confirmation, progression et fin doivent dire DOCX.
  ['fr', 'en'].forEach(lang => cases.push({
    id: 'pdfbatch_docx_zip_wording_says_docx_' + lang,
    description: 'Lot DOCX (' + lang + ') : confirmation, progression et message final parlent de DOCX, jamais de PDF',
    run: async (h) => {
      const previousLang = I18n.getLang();
      try {
        I18n.setLang(lang);
        await seed(h, `<p>Bonjour ${badge('Nom')}.</p>`);
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const messages = [...res.confirms, ...res.statuses];
        const mentionsPdf = messages.filter(m => /pdf/i.test(m));
        const progress = res.statuses.filter(m => /1\/3/.test(m));
        const pass = res.downloads.length === 1 && res.confirms.length === 1 && /docx/i.test(res.confirms[0]) && mentionsPdf.length === 0
          && progress.length >= 1 && progress.every(m => /docx/i.test(m)) && /docx/i.test(res.status) && res.status.includes('3');
        return { pass, notes: JSON.stringify({ confirms: res.confirms, statuses: res.statuses, mentionsPdf }) };
      } finally { I18n.setLang(previousLang); }
    },
  }));

  // --- Une pièce jointe dont le fichier n'existe plus (supprimée du document : Grist répond 404 à son adresse). L'export laisse l'image de côté et écrit le reste ; il doit le dire, en tête de
  // l'état de fin (« 1 image introuvable (voir la console). PDF généré. »), au lieu d'un « PDF généré. » seul. Une case vide, elle, n'a pas d'image à perdre : aucun avertissement. ---
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const PHOTO_IMG = `<img class="editor-image" src="" alt="Photo" style="width: 120px;" data-var-table="${TABLE}" data-var-column="Photo" data-var-key="${TABLE}.Photo">`;
  // Le serveur de Grist, côté pièces jointes : les numéros de `missing` reçoivent un 404, les autres une image. Les adresses demandées sont notées (le test ne prouve rien si l'image n'a jamais été demandée).
  function stubAttachments(missing) {
    const original = window.fetch;
    const asked = [];
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : input && input.url);
      const match = url.match(/\/attachments\/(\d+)\/download/);
      if (!match) return original.call(window, input, init);
      const id = Number(match[1]);
      asked.push(id);
      if (missing.includes(id)) return Promise.resolve(new Response('Not Found', { status: 404 }));
      return Promise.resolve(new Response(new Blob([Uint8Array.from(atob(PNG_B64), c => c.charCodeAt(0))], { type: 'image/png' }), { status: 200 }));
    };
    return { asked, restore() { window.fetch = original; } };
  }
  // `attachments` : la pièce jointe de chaque ligne (un numéro, ou null pour une case vide) ; la ligne `current` est celle de la page.
  async function seedPhotos(h, attachments, current) {
    await h.resetEditor();
    const stub = window.__gristStub;
    const rows = attachments.map((id, i) => ({ id: i + 1, Nom: NAMES[i] || ('Nom ' + (i + 1)), Photo: id == null ? null : ['L', id] }));
    stub.setVariables(TABLE, { Nom: 'Text', Photo: 'Attachments' });
    stub.setRows(TABLE, rows);
    await GristAPI.refreshSchema();
    stub.fireRecord(rows[current || 0], TABLE);
    await h.sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}</p>` + PHOTO_IMG);
    Editor.setHeaderFooterData(NO_HF);
    await h.sleep(80);
    return rows;
  }
  // « Exporter en PDF » d'une ligne passe par pdfmake.download() et non par un <a download> : l'appel est pris au passage (son PDF relu depuis ses octets) au lieu d'enregistrer un fichier.
  async function clickSinglePdf(h) {
    await PdfExport.ensurePdfLibsLoaded();
    const original = window.pdfMake.createPdf;
    const sink = [];
    window.pdfMake.createPdf = function (docDefinition) {
      const gen = original.call(window.pdfMake, docDefinition);
      gen.download = function (name) { gen.getBlob(blob => sink.push({ name, blob })); };
      return gen;
    };
    try { return await clickExportRow(h, 'btn-export-pdf', sink); } finally { window.pdfMake.createPdf = original; }
  }
  const withLang = async (lang, fn) => {
    const previous = I18n.getLang();
    try { I18n.setLang(lang); return await fn(); } finally { I18n.setLang(previous); }
  };
  const fireRow = async (h, rows, index) => { window.__gristStub.fireRecord(rows[index], TABLE); await h.sleep(60); };

  cases.push({
    id: 'pdfbatch_pdf_says_when_an_attachment_file_is_missing',
    description: '« Exporter en PDF » d’une ligne dont la pièce jointe n’existe plus : le PDF est produit, et l’état commence par « 1 image introuvable (voir la console). » ; une pièce jointe lisible ou une case vide ne changent pas « PDF généré. », et l’avertissement ne reste pas pour l’export suivant',
    run: async (h) => {
      const net = stubAttachments([8]);
      try {
        const rows = await seedPhotos(h, [7, 8, null], 1);
        const missing = await clickSinglePdf(h);
        const missingText = missing.downloads[0] && missing.downloads[0].blob ? squash((await pdfPageTexts(h, missing.downloads[0].blob)).join(' ')) : '';
        await fireRow(h, rows, 0);
        const readable = await clickSinglePdf(h);
        await fireRow(h, rows, 2);
        const empty = await clickSinglePdf(h);
        const pass = missing.downloads.length === 1 && missingText.includes(squash(NAMES[1])) && net.asked.includes(8) && net.asked.includes(7)
          && missing.status === '1 image introuvable (voir la console). PDF généré.'
          && readable.downloads.length === 1 && readable.status === 'PDF généré.'
          && empty.downloads.length === 1 && empty.status === 'PDF généré.';
        return { pass, notes: JSON.stringify({ asked: net.asked, missing: missing.status, readable: readable.status, empty: empty.status, missingText, downloads: missing.downloads.map(d => [d.name, d.blob && d.blob.type, d.blob && d.blob.size]) }) };
      } finally { net.restore(); }
    },
  });

  cases.push({
    id: 'pdfbatch_docx_says_when_an_attachment_file_is_missing',
    description: '« Exporter en DOCX » d’une ligne dont la pièce jointe n’existe plus : le .docx est produit sans l’image (aucun fichier dans word/media) et l’état commence par « 1 image introuvable… » ; une pièce jointe lisible garde son image et l’état « DOCX généré. »',
    run: async (h) => {
      const net = stubAttachments([8]);
      try {
        const rows = await seedPhotos(h, [7, 8], 1);
        const mediaOf = async blob => { await ExportCommon.ensureJsZipLoaded(); return Object.keys((await JSZip.loadAsync(await blob.arrayBuffer())).files).filter(n => /^word\/media\/.+/.test(n)); };
        const missing = await clickExportRow(h, 'v2-btn-export-docx');
        const missingText = missing.downloads[0] && missing.downloads[0].blob ? squash(await docxBodyText(missing.downloads[0].blob) || '') : '';
        const missingMedia = missing.downloads[0] && missing.downloads[0].blob ? await mediaOf(missing.downloads[0].blob) : null;
        await fireRow(h, rows, 0);
        const readable = await clickExportRow(h, 'v2-btn-export-docx');
        const readableMedia = readable.downloads[0] && readable.downloads[0].blob ? await mediaOf(readable.downloads[0].blob) : null;
        const pass = missing.downloads.length === 1 && missingText.includes(squash(NAMES[1])) && missingMedia && missingMedia.length === 0
          && missing.status === '1 image introuvable (voir la console). DOCX généré.'
          && readable.downloads.length === 1 && readableMedia && readableMedia.length === 1 && readable.status === 'DOCX généré.';
        return { pass, notes: JSON.stringify({ asked: net.asked, missing: missing.status, missingMedia, readable: readable.status, readableMedia }) };
      } finally { net.restore(); }
    },
  });

  cases.push({
    id: 'pdfbatch_zip_counts_each_missing_file_once',
    description: 'Lot en ZIP : la même pièce jointe absente dans deux lignes ne compte que pour une image, deux pièces jointes absentes pour deux ; le nombre précède « 3 PDF générés — archive ZIP téléchargée. » (PDF) et « 3 DOCX générés… » (Word), et chaque ligne a son fichier',
    run: async (h) => {
      const net = stubAttachments([8, 9]);
      try {
        await seedPhotos(h, [7, 8, 8]);
        const sameFile = await clickExportRow(h, 'v2-btn-export-pdf-batch');
        const sameZip = sameFile.downloads[0] && sameFile.downloads[0].blob ? await JSZip.loadAsync(await sameFile.downloads[0].blob.arrayBuffer()) : null;
        await seedPhotos(h, [7, 8, 9]);
        const twoFiles = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const twoZip = twoFiles.downloads[0] && twoFiles.downloads[0].blob ? await JSZip.loadAsync(await twoFiles.downloads[0].blob.arrayBuffer()) : null;
        const pass = sameFile.downloads.length === 1 && sameZip && Object.keys(sameZip.files).length === NAMES.length
          && sameFile.status === '1 image introuvable (voir la console). 3 PDF générés — archive ZIP téléchargée.'
          && twoFiles.downloads.length === 1 && twoZip && Object.keys(twoZip.files).length === NAMES.length
          && twoFiles.status === '2 images introuvables (voir la console). 3 DOCX générés — archive ZIP téléchargée.';
        return { pass, notes: JSON.stringify({ asked: net.asked, sameFile: sameFile.status, twoFiles: twoFiles.status }) };
      } finally { net.restore(); }
    },
  });

  cases.push({
    id: 'pdfbatch_merged_pdf_says_missing_files_in_english',
    description: 'PDF unique en anglais : « 2 missing images (see console). 3 rows combined into a single PDF — file downloaded. », au pluriel anglais ; sans pièce jointe absente, l’état reste « 3 rows combined… » seul',
    run: async (h) => {
      const net = stubAttachments([8, 9]);
      try {
        return await withLang('en', async () => {
          await seedPhotos(h, [7, 8, 9]);
          const two = await clickExportRow(h, 'v2-btn-export-pdf-merged');
          await seedPhotos(h, [7, 7, null]);
          const none = await clickExportRow(h, 'v2-btn-export-pdf-merged');
          const pass = two.downloads.length === 1 && two.status === '2 missing images (see console). 3 rows combined into a single PDF — file downloaded.'
            && none.downloads.length === 1 && none.status === '3 rows combined into a single PDF — file downloaded.';
          return { pass, notes: JSON.stringify({ two: two.status, none: none.status }) };
        });
      } finally { net.restore(); }
    },
  });

  // Excel : le classeur est produit par XlsxExport (une image par case), sans passer par le menu - le même état de fin que Word s'y ajoute (js/main.js:setExportDoneStatus).
  cases.push({
    id: 'pdfbatch_xlsx_notes_an_attachment_file_it_cannot_read',
    description: 'Excel : une grille avec deux pièces jointes dont une absente écrit le classeur avec la seule image lisible (un fichier dans xl/media) et note l’image perdue ; le décompte repart de zéro à chaque clic',
    run: async (h) => {
      const net = stubAttachments([8]);
      try {
        await h.resetEditor();
        const url = id => `http://localhost/api/docs/stub/attachments/${id}/download?auth=stub-token`;
        const cell = id => `<td colwidth="120"><p><img class="editor-image" src="${url(id)}" data-attachment-id="${id}" data-source="attachment" style="width: 40px" data-layer="normal" data-wrap="inline"></p></td>`;
        const html = `<table style="width: 240px;"><colgroup><col style="width: 120px;"><col style="width: 120px;"></colgroup><tbody><tr data-row-height="40" style="height: 40px">${cell(7)}${cell(8)}</tr></tbody></table>`;
        ExportCommon.resetUnreadImages();
        const { blob } = await XlsxExport.getXlsxBlobForRecord(html, TABLE, { id: 1, Nom: NAMES[0] }, '');
        await ExportCommon.ensureJsZipLoaded();
        const media = Object.keys((await JSZip.loadAsync(await blob.arrayBuffer())).files).filter(n => /^xl\/media\/.+/.test(n));
        const counted = ExportCommon.unreadImageCount();
        ExportCommon.resetUnreadImages();
        const pass = media.length === 1 && counted === 1 && ExportCommon.unreadImageCount() === 0 && net.asked.includes(7) && net.asked.includes(8);
        return { pass, notes: JSON.stringify({ media, counted, asked: net.asked }) };
      } finally { net.restore(); ExportCommon.resetUnreadImages(); }
    },
  });

  // --- Macro-modèle : les annexes se choisissent ligne par ligne (js/main.js:onExportBatch appelle MacroTemplates.buildConcatenatedHtml pour CHAQUE ligne, pas une
  // fois pour le lot). Un macro-modèle réel, chargé par le vrai <select> de modèles, sur trois lignes dont deux ont le même type. Placé en dernier : le macro
  // chargé laisse l'application en mode macro, restauré à la fin par le vrai bouton « Nouveau document » (resetEditor() ne touche pas à ce mode). ---
  const MACRO_ROWS = [
    { Nom: 'Alpha Durand', TypeDossier: 'Particulier' },
    { Nom: 'Bravo Martin', TypeDossier: 'Entreprise' },
    { Nom: 'Charlie Petit', TypeDossier: 'Particulier' },
  ];
  const ANNEX_BY_TYPE = { Particulier: 'ANNEXEPARTICULIER', Entreprise: 'ANNEXEENTREPRISE' };

  async function loadMacroForBatch(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', TypeDossier: 'Text' });
    stub.setRows(TABLE, MACRO_ROWS.map((r, i) => Object.assign({ id: i + 1 }, r)));
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({ id: 1 }, MACRO_ROWS[0]), TABLE);
    await h.sleep(50);
    const cover = await Templates.save(null, 'PbMacro couverture', `<p>COUVERTURE ${badge('Nom')}</p>`, '', null, null, 'document', null);
    const annexP = await Templates.save(null, 'PbMacro annexe particulier', '<p>ANNEXEPARTICULIER</p>', '', null, null, 'document', null);
    const annexE = await Templates.save(null, 'PbMacro annexe entreprise', '<p>ANNEXEENTREPRISE</p>', '', null, null, 'document', null);
    const slots = { slots: [
      { type: 'fixed', modeleId: cover.id },
      { type: 'conditional', rules: [
        { column: 'TypeDossier', operator: '=', value: 'Particulier', modeleId: annexP.id },
        { column: 'TypeDossier', operator: '=', value: 'Entreprise', modeleId: annexE.id },
      ], defaultModeleId: null },
    ] };
    const macro = await Templates.save(null, 'PbMacro dossier', JSON.stringify(slots), '', null, null, 'macro', null);
    await Templates.loadAll();
    // Les lignes viennent d'être écrites sans passer par le bouton Enregistrer, qui referait la liste (refreshTemplateList, js/main.js) : l'option du macro
    // est posée ici, le reste - lecture dans le cache, chargement du macro - est le vrai gestionnaire du <select>.
    const select = document.getElementById('template-select');
    if (!Array.from(select.options).some(o => o.value === String(macro.id))) {
      const option = document.createElement('option');
      option.value = String(macro.id);
      option.textContent = 'PbMacro dossier';
      select.appendChild(option);
    }
    select.value = String(macro.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(300);
    return { loaded: String(Templates.getCurrentId()) === String(macro.id) };
  }

  async function restoreDocumentMode(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(100);
  }

  cases.push({
    id: 'pdfbatch_macro_zip_picks_annexes_row_by_row',
    description: 'Macro-modèle, ZIP de PDF : chaque ligne reçoit sa couverture ET l’annexe qui correspond à SON type (pas celle de la 1re ligne, pas les deux)',
    run: async (h) => {
      try {
        const { loaded } = await loadMacroForBatch(h);
        const res = await clickExportRow(h, 'v2-btn-export-pdf-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).sort() : [];
        const textsByFile = {};
        for (const f of files) textsByFile[f] = squash((await pdfPageTexts(h, await zip.file(f).async('blob'))).join(' | '));
        const expectedFiles = ['publipostage (2).pdf', 'publipostage (3).pdf', 'publipostage.pdf'];
        const rowOk = files.length === MACRO_ROWS.length && MACRO_ROWS.every((row, i) => {
          const text = textsByFile[['publipostage.pdf', 'publipostage (2).pdf', 'publipostage (3).pdf'][i]] || '';
          const other = row.TypeDossier === 'Particulier' ? ANNEX_BY_TYPE.Entreprise : ANNEX_BY_TYPE.Particulier;
          return text.includes(squash('COUVERTURE' + row.Nom)) && text.includes(ANNEX_BY_TYPE[row.TypeDossier]) && !text.includes(other);
        });
        const pass = loaded && res.downloads.length === 1 && dl.name === TABLE + '-export-pdf.zip'
          && JSON.stringify(files) === JSON.stringify(expectedFiles) && rowOk
          && res.status === I18n.t('status.batchExportDone', { ok: MACRO_ROWS.length });
        return { pass, notes: JSON.stringify({ loaded, downloads: res.downloads.map(d => d.name), status: res.status, textsByFile }) };
      } finally { await restoreDocumentMode(h); }
    },
  });

  cases.push({
    id: 'pdfbatch_macro_merged_picks_annexes_row_by_row',
    description: 'Macro-modèle, PDF unique : les pages suivent l’ordre des lignes, chacune avec sa couverture puis l’annexe de SON type',
    run: async (h) => {
      try {
        const { loaded } = await loadMacroForBatch(h);
        const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
        const dl = res.downloads[0];
        const texts = dl && dl.blob ? (await pdfPageTexts(h, dl.blob)).map(squash) : [];
        // Deux pages par ligne (le saut de page du macro sépare couverture et annexe) : couverture de la ligne, puis son annexe.
        const expected = MACRO_ROWS.flatMap(row => [squash('COUVERTURE' + row.Nom), ANNEX_BY_TYPE[row.TypeDossier]]);
        const pass = loaded && res.downloads.length === 1 && dl.name === TABLE + '-export.pdf' && texts.length === expected.length
          && expected.every((needle, p) => texts[p].includes(needle))
          && res.status === I18n.t('status.mergedExportDone', { ok: MACRO_ROWS.length });
        return { pass, notes: JSON.stringify({ loaded, downloads: res.downloads.map(d => d.name), status: res.status, texts }) };
      } finally { await restoreDocumentMode(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfBatch = cases;
})();
