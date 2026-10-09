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

  // --- « Modèle selon la ligne » (js/row-template.js, Réglages > Selon la ligne) : un export en lot donne à CHAQUE ligne le modèle que les règles lui désignent - son contenu, ses en-têtes et pieds, le sens de sa
  // page, le nom de son fichier -, comme quand la ligne s'ouvre à l'écran, au lieu du seul modèle ouvert (essais d'Antoine du 04/10, défaut B4). Les modèles sont enregistrés par Templates.save, le réglage est posé comme
  // Grist le fait (options du widget) ; à l'écran, un brouillon que les lignes « Autre » gardent (`otherwise: 'keep'`). Chaque cas retire le réglage et les modèles en partant. ---
  const RT_KEY = 'modeleSelonLigne';
  const RT_ROWS = [
    { id: 1, Nom: 'Alpha Durand', Genre: 'Facture' },
    { id: 2, Nom: 'Bravo Martin', Genre: 'Devis' },
    { id: 3, Nom: 'Charlie Petit', Genre: 'Autre' },
    { id: 4, Nom: 'Delta Moreau', Genre: 'Devis' },
  ];
  const rtPage = orientation => ({ top: 20, right: 20, bottom: 20, left: 20, orientation, format: 'A4' });
  const rtHeader = text => ({ enabled: true, differentFirstPage: false, header: { default: `<p>${text}</p>`, first: '' }, footer: { default: '', first: '' } });
  const rtRule = (value, modeleId) => ({ column: 'Genre', operator: '=', value, modeleId: String(modeleId) });
  const PER_VALUE = ` data-format="${JSON.stringify({ list: { perValue: true } }).replace(/"/g, '&quot;')}"`;
  const listBadge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${PER_VALUE}></span>`;

  // `options` : `rows` et `columns` (la table), `extra(saved)` (des modèles de plus, enregistrés après Facture et Devis : { key, nom, html, filename, headerFooter, page, type }), `rules(saved)` (des règles de plus),
  // `enabled` (faux : réglage coupé). Rend les numéros des modèles enregistrés, par clé.
  async function seedRowTemplates(h, options) {
    const opt = options || {};
    const rows = opt.rows || RT_ROWS;
    const stub = window.__gristStub;
    await h.resetEditor();
    stub.setVariables(TABLE, Object.assign({ Nom: 'Text', Genre: 'Text' }, opt.columns || {}));
    stub.setRows(TABLE, rows);
    await GristAPI.refreshSchema();
    // Une ligne que le réglage laisse au modèle de l'écran : le poser n'ouvre aucun modèle.
    stub.fireRecord(Object.assign({}, rows.find(r => r.Genre === 'Autre') || rows[0]), TABLE);
    await h.sleep(50);
    const saved = {};
    const save = async spec => {
      saved[spec.key] = (await Templates.save(null, spec.nom, spec.html, spec.filename || '', spec.headerFooter || null, spec.page || null, spec.type || 'document', null)).id;
    };
    await save({ key: 'facture', nom: 'RT Facture', html: `<p>FACTURE ${badge('Nom')}</p>`, filename: 'Facture_#' + TABLE + '.Nom', headerFooter: rtHeader('ENTETEFACTURE'), page: rtPage('portrait') });
    await save({ key: 'devis', nom: 'RT Devis', html: `<p>DEVIS ${badge('Nom')}</p>`, filename: 'Devis_#' + TABLE + '.Nom', headerFooter: rtHeader('ENTETEDEVIS'), page: rtPage('landscape') });
    for (const spec of (opt.extra ? opt.extra(saved) : [])) await save(spec);
    await Templates.loadAll();
    Templates.setCurrentId(null);
    const rules = [rtRule('Facture', saved.facture), rtRule('Devis', saved.devis)].concat(opt.rules ? opt.rules(saved) : []);
    stub.setWidgetOptions({ [RT_KEY]: { enabled: opt.enabled !== false, rules, otherwise: 'keep' } });
    await h.sleep(150);
    // Le brouillon de l'écran : un modèle pas enregistré, en portrait, avec son propre en-tête et sans nom de fichier.
    document.getElementById('pdf-filename-template').value = '';
    PageLayout.setMarginsMm(rtPage('portrait'));
    Editor.setHTML(`<p>BROUILLON ${badge('Nom')}</p>`);
    Editor.setHeaderFooterData(rtHeader('ENTETEBROUILLON'));
    await h.sleep(100);
    return saved;
  }
  async function releaseRowTemplates(h, saved) {
    window.__gristStub.setWidgetOptions(null);
    await h.sleep(150);
    for (const id of Object.values(saved || {})) await Templates.remove(id);
    await Templates.loadAll();
    Templates.setCurrentId(null);
    PageLayout.setMarginsMm(null);
    await restoreDocumentMode(h); // un modèle ouvert pour de bon laisse son nom et son nom de fichier à l'écran
  }

  // Ce qu'un .docx dit de son texte et de sa page, lu dans ses octets : le corps, les en-têtes et pieds (word/header*.xml, footer*.xml) et le sens de la page (w:pgSz).
  async function docxFacts(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = async name => (await zip.file(name).async('string')).replace(/<[^>]+>/g, '');
    let headers = '';
    for (const name of Object.keys(zip.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n))) headers += await text(name);
    const documentXml = await zip.file('word/document.xml').async('string');
    return { body: squash(documentXml.replace(/<[^>]+>/g, '')), headers: squash(headers), landscape: /<w:pgSz[^>]*w:orient="landscape"/.test(documentXml) };
  }
  // Le texte (en-têtes compris) et le sens de chaque page d'un PDF, lus dans ses octets (pdf.js).
  async function pdfFacts(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({ body: squash(content.items.map(it => it.str).join(' ')), landscape: view.width > view.height });
    }
    return pages;
  }
  // Ce qui manque ou déborde dans un document : `has` doit y être (corps ou en-tête), `hasNot` ne doit pas y être, et sa page est dans le sens attendu.
  function documentProblems(label, fact, expect) {
    const all = (fact && (fact.body + (fact.headers || ''))) || '';
    const problems = [];
    if (!fact) return [label + ' : absent'];
    expect.has.forEach(needle => { if (!all.includes(needle)) problems.push(label + ' : « ' + needle + ' » manque'); });
    (expect.hasNot || []).forEach(needle => { if (all.includes(needle)) problems.push(label + ' : « ' + needle + ' » ne devrait pas y être'); });
    if (fact.landscape !== expect.landscape) problems.push(label + ' : paysage=' + fact.landscape);
    return problems;
  }
  const FACTURE_OF = nom => ({ has: ['FACTURE', squash(nom), 'ENTETEFACTURE'], hasNot: ['DEVIS', 'BROUILLON'], landscape: false });
  const DEVIS_OF = nom => ({ has: ['DEVIS', squash(nom), 'ENTETEDEVIS'], hasNot: ['FACTURE', 'BROUILLON'], landscape: true });
  const BROUILLON_OF = nom => ({ has: ['BROUILLON', squash(nom), 'ENTETEBROUILLON'], hasNot: ['FACTURE', 'DEVIS'], landscape: false });

  cases.push({
    id: 'pdfbatch_row_template_docx_zip_each_row_comes_from_its_own_template',
    description: 'Lot DOCX (ZIP) avec « Modèle selon la ligne » : chaque ligne sort du modèle que ses règles lui donnent - son contenu, son en-tête, le sens de sa page (le devis en paysage), le nom de son fichier -, et la ligne que le réglage laisse au modèle ouvert garde le brouillon de l’écran',
    run: async (h) => {
      const saved = await seedRowTemplates(h);
      try {
        const active = RowTemplate.isActive();
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const expected = {
          'Facture_Alpha Durand.docx': FACTURE_OF('Alpha Durand'),
          'Devis_Bravo Martin.docx': DEVIS_OF('Bravo Martin'),
          'publipostage.docx': BROUILLON_OF('Charlie Petit'),
          'Devis_Delta Moreau.docx': DEVIS_OF('Delta Moreau'),
        };
        const problems = [];
        if (JSON.stringify(files) !== JSON.stringify(Object.keys(expected).sort())) problems.push('fichiers=' + JSON.stringify(files));
        for (const name of Object.keys(expected)) problems.push(...documentProblems(name, zip && zip.file(name) ? await docxFacts(await zip.file(name).async('blob')) : null, expected[name]));
        if (res.status !== I18n.t('status.batchExportDoneDocx', { ok: RT_ROWS.length })) problems.push('fin=' + res.status);
        return { pass: active && res.downloads.length === 1 && dl.name === TABLE + '-export-docx.zip' && !problems.length, notes: JSON.stringify({ active, files, problems }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_pdf_zip_each_row_comes_from_its_own_template',
    description: 'Lot PDF (ZIP) avec « Modèle selon la ligne » : le PDF de chaque ligne a le contenu, l’en-tête, le sens de page (devis en paysage) et le nom de fichier du modèle de SA ligne',
    run: async (h) => {
      const saved = await seedRowTemplates(h);
      try {
        const res = await clickExportRow(h, 'v2-btn-export-pdf-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const expected = {
          'Facture_Alpha Durand.pdf': FACTURE_OF('Alpha Durand'),
          'Devis_Bravo Martin.pdf': DEVIS_OF('Bravo Martin'),
          'publipostage.pdf': BROUILLON_OF('Charlie Petit'),
          'Devis_Delta Moreau.pdf': DEVIS_OF('Delta Moreau'),
        };
        const problems = [];
        if (JSON.stringify(files) !== JSON.stringify(Object.keys(expected).sort())) problems.push('fichiers=' + JSON.stringify(files));
        for (const name of Object.keys(expected)) {
          const pages = zip && zip.file(name) ? await pdfFacts(h, await zip.file(name).async('blob')) : [];
          problems.push(...(pages.length === 1 ? documentProblems(name, pages[0], expected[name]) : [name + ' : ' + pages.length + ' pages']));
        }
        if (res.status !== I18n.t('status.batchExportDone', { ok: RT_ROWS.length })) problems.push('fin=' + res.status);
        return { pass: res.downloads.length === 1 && dl.name === TABLE + '-export-pdf.zip' && !problems.length, notes: JSON.stringify({ files, problems }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_merged_pdf_follows_the_templates_in_row_order',
    description: 'PDF unique avec « Modèle selon la ligne » : les pages suivent l’ordre des lignes, chacune avec le contenu, l’en-tête et le sens de page du modèle de sa ligne (facture et brouillon en portrait, devis en paysage)',
    run: async (h) => {
      const saved = await seedRowTemplates(h);
      try {
        const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
        const dl = res.downloads[0];
        const pages = dl && dl.blob ? await pdfFacts(h, dl.blob) : [];
        const expected = [FACTURE_OF('Alpha Durand'), DEVIS_OF('Bravo Martin'), BROUILLON_OF('Charlie Petit'), DEVIS_OF('Delta Moreau')];
        const problems = pages.length === expected.length ? expected.flatMap((expect, i) => documentProblems('page ' + (i + 1), pages[i], expect)) : ['pages=' + pages.length];
        return { pass: res.downloads.length === 1 && dl.name === TABLE + '-export.pdf' && !problems.length, notes: JSON.stringify({ problems, status: res.status }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_off_keeps_the_open_template_for_every_row',
    description: 'Réglage « Selon la ligne » coupé (règles gardées, case décochée) : toutes les lignes sortent du modèle ouvert, comme sans le réglage',
    run: async (h) => {
      const saved = await seedRowTemplates(h, { enabled: false });
      try {
        const active = RowTemplate.isActive();
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const expected = ['publipostage (2).docx', 'publipostage (3).docx', 'publipostage (4).docx', 'publipostage.docx'];
        const problems = [];
        for (const name of files) problems.push(...documentProblems(name, await docxFacts(await zip.file(name).async('blob')), BROUILLON_OF('')));
        return { pass: !active && JSON.stringify(files) === JSON.stringify(expected) && !problems.length, notes: JSON.stringify({ active, files, problems }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  // Le modèle de la ligne est celui qui est déjà ouvert : c'est l'écran, avec ce qui n'est pas enregistré (comme l'export d'une seule ligne), pas la copie enregistrée.
  cases.push({
    id: 'pdfbatch_row_template_open_template_keeps_its_unsaved_edits',
    description: 'Lot DOCX avec « Modèle selon la ligne » : une ligne dont les règles désignent le modèle ouvert sort de l’écran, avec ses modifications pas encore enregistrées ; les autres, de leur modèle enregistré',
    run: async (h) => {
      const saved = await seedRowTemplates(h);
      try {
        // Le modèle Facture ouvert pour de bon (la liste des modèles), puis modifié sans être enregistré.
        const select = document.getElementById('template-select');
        if (!Array.from(select.options).some(o => o.value === String(saved.facture))) {
          const option = document.createElement('option');
          option.value = String(saved.facture);
          option.textContent = 'RT Facture';
          select.appendChild(option);
        }
        select.value = String(saved.facture);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(400);
        const opened = String(Templates.getCurrentId()) === String(saved.facture);
        Editor.setHTML(`<p>FACTURE MODIFIEE ${badge('Nom')}</p>`);
        await h.sleep(100);
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        // Ligne 1 (Facture) et ligne 3 (« Autre », gardée) : l'écran, nommé comme le modèle Facture ouvert ; lignes 2 et 4 : le devis enregistré.
        const expected = {
          'Facture_Alpha Durand.docx': { has: ['FACTUREMODIFIEE', 'AlphaDurand', 'ENTETEFACTURE'], landscape: false },
          'Devis_Bravo Martin.docx': DEVIS_OF('Bravo Martin'),
          'Facture_Charlie Petit.docx': { has: ['FACTUREMODIFIEE', 'CharliePetit', 'ENTETEFACTURE'], landscape: false },
          'Devis_Delta Moreau.docx': DEVIS_OF('Delta Moreau'),
        };
        const problems = [];
        if (JSON.stringify(files) !== JSON.stringify(Object.keys(expected).sort())) problems.push('fichiers=' + JSON.stringify(files));
        for (const name of Object.keys(expected)) problems.push(...documentProblems(name, zip && zip.file(name) ? await docxFacts(await zip.file(name).async('blob')) : null, expected[name]));
        return { pass: opened && !problems.length, notes: JSON.stringify({ opened, files, problems }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_macro_model_assembles_its_own_annexes_for_the_row',
    description: 'Une ligne que « Modèle selon la ligne » envoie vers un macro-modèle sort de sa composition (ses modèles bout à bout, un saut de page entre eux), avec l’en-tête, la page et le nom de fichier du macro-modèle',
    run: async (h) => {
      const rows = RT_ROWS.concat([{ id: 5, Nom: 'Echo Blanc', Genre: 'Dossier' }]);
      const saved = await seedRowTemplates(h, {
        rows,
        extra: ids => [{
          key: 'dossier', nom: 'RT Dossier', html: JSON.stringify({ slots: [{ type: 'fixed', modeleId: ids.facture }, { type: 'fixed', modeleId: ids.devis }] }),
          filename: 'Dossier_#' + TABLE + '.Nom', headerFooter: rtHeader('ENTETEDOSSIER'), page: rtPage('landscape'), type: 'macro',
        }],
        rules: ids => [rtRule('Dossier', ids.dossier)],
      });
      try {
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const entry = zip && zip.file('Dossier_Echo Blanc.docx');
        const fact = entry ? await docxFacts(await entry.async('blob')) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const problems = documentProblems('Dossier_Echo Blanc.docx', fact, { has: ['FACTURE', 'DEVIS', 'EchoBlanc', 'ENTETEDOSSIER'], hasNot: ['BROUILLON'], landscape: true });
        if (fact && fact.body.indexOf('FACTURE') > fact.body.indexOf('DEVIS')) problems.push('les modèles du macro ne sont pas dans l’ordre');
        return { pass: res.downloads.length === 1 && files.length === rows.length && !problems.length, notes: JSON.stringify({ files, problems }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_split_list_of_the_row_model_makes_one_document_per_value',
    description: 'Le modèle d’une ligne (pas celui de l’écran) a une liste réglée « Un document par valeur » : cette ligne sort en un document par valeur, nommés avec la valeur, et la confirmation compte tous les documents',
    run: async (h) => {
      const rows = [{ id: 1, Nom: 'Alpha Durand', Genre: 'Autre' }, { id: 2, Nom: 'Echo Blanc', Genre: 'Liste', Themes: ['L', 'Santé', 'Social'] }];
      const saved = await seedRowTemplates(h, {
        rows, columns: { Themes: 'ChoiceList' },
        extra: () => [{ key: 'liste', nom: 'RT Liste', html: `<p>LISTE ${badge('Nom')} ${listBadge('Themes')}</p>`, filename: 'Liste_#' + TABLE + '.Nom', headerFooter: rtHeader('ENTETELISTE'), page: rtPage('portrait') }],
        rules: ids => [rtRule('Liste', ids.liste)],
      });
      try {
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const expected = ['Liste_Echo Blanc - Santé.docx', 'Liste_Echo Blanc - Social.docx', 'publipostage.docx'];
        const problems = [];
        for (const [name, value] of [['Liste_Echo Blanc - Santé.docx', 'Santé'], ['Liste_Echo Blanc - Social.docx', 'Social']]) {
          const fact = zip && zip.file(name) ? await docxFacts(await zip.file(name).async('blob')) : null;
          problems.push(...documentProblems(name, fact, { has: ['LISTE', 'EchoBlanc', squash(value), 'ENTETELISTE'], hasNot: ['BROUILLON', value === 'Santé' ? 'Social' : 'Santé'], landscape: false }));
        }
        const note = I18n.t('confirm.splitNote', { documents: expected.length });
        const confirmed = res.confirms.length === 1 && res.confirms[0].endsWith(note);
        return { pass: res.downloads.length === 1 && JSON.stringify(files) === JSON.stringify(expected) && !problems.length && confirmed, notes: JSON.stringify({ files, problems, confirms: res.confirms }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  cases.push({
    id: 'pdfbatch_row_template_model_of_the_wrong_kind_is_counted_as_failed_not_written_by_the_open_one',
    description: 'Lot DOCX : une ligne que « Modèle selon la ligne » envoie vers une grille (qui ne se génère pas en Word) n’est pas générée et est comptée en échec ; elle ne sort pas du brouillon de l’écran, et les autres lignes sortent de leur modèle',
    run: async (h) => {
      const rows = [{ id: 1, Nom: 'Alpha Durand', Genre: 'Facture' }, { id: 2, Nom: 'Bravo Martin', Genre: 'Grille' }, { id: 3, Nom: 'Charlie Petit', Genre: 'Autre' }];
      const saved = await seedRowTemplates(h, {
        rows,
        extra: () => [{ key: 'grille', nom: 'RT Grille', html: '<table><tbody><tr><td><p>GRILLE</p></td></tr></tbody></table>', filename: 'Grille_#' + TABLE + '.Nom', page: rtPage('portrait'), type: GridEditor.TYPE }],
        rules: ids => [rtRule('Grille', ids.grille)],
      });
      try {
        const res = await clickExportRow(h, 'v2-btn-export-docx-batch');
        const dl = res.downloads[0];
        const zip = dl && dl.blob ? await JSZip.loadAsync(await dl.blob.arrayBuffer()) : null;
        const files = zip ? Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() : [];
        const expected = ['Facture_Alpha Durand.docx', 'publipostage.docx'];
        const problems = [];
        problems.push(...documentProblems('Facture_Alpha Durand.docx', zip && zip.file('Facture_Alpha Durand.docx') ? await docxFacts(await zip.file('Facture_Alpha Durand.docx').async('blob')) : null, FACTURE_OF('Alpha Durand')));
        const status = I18n.t('status.batchExportDoneWithFailuresDocx', { ok: 2, failed: 1 });
        if (res.status !== status) problems.push('fin=' + res.status);
        return { pass: res.downloads.length === 1 && JSON.stringify(files) === JSON.stringify(expected) && !problems.length, notes: JSON.stringify({ files, problems, status: res.status }) };
      } finally { await releaseRowTemplates(h, saved); }
    },
  });

  // Un lot PDF peut mêler grilles et documents (« Modèle selon la ligne ») : le tableau d'une ligne suit les règles du genre du modèle de SA ligne - la grille n'a ni titres repris ni lignes gardées
  // entières -, pas celles du modèle ouvert à l'écran. On lit ce que le lot confie à pdfmake (le docDefinition de chaque ligne).
  cases.push({
    id: 'pdfbatch_row_template_pdf_table_follows_the_kind_of_the_row_model',
    description: 'Lot PDF avec « Modèle selon la ligne » (modèle ouvert : un document) : le tableau du modèle Grille d\'une ligne garde les règles de la grille (ni titres repris, ni lignes gardées entières) et le même tableau dans le modèle Document d\'une autre ligne se range comme un document (titres repris, lignes gardées entières)',
    run: async (h) => {
      const rows = [{ id: 1, Nom: 'Alpha Durand', Genre: 'Grille' }, { id: 2, Nom: 'Bravo Martin', Genre: 'Tableau' }, { id: 3, Nom: 'Charlie Petit', Genre: 'Autre' }];
      const rowAttrs = ' data-row-height="28" style="height: 28px"';
      const tableOf = marker => '<table><tbody><tr' + rowAttrs + '><th><p>' + marker + '</p></th><th><p>Autre</p></th></tr><tr' + rowAttrs + '><td><p>un</p></td><td><p>deux</p></td></tr><tr' + rowAttrs + '><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table>';
      const saved = await seedRowTemplates(h, {
        rows,
        extra: () => [
          { key: 'grille', nom: 'RT Grille', html: tableOf('MARQUEGRILLE'), filename: 'Grille_#' + TABLE + '.Nom', page: rtPage('portrait'), type: GridEditor.TYPE },
          { key: 'tableau', nom: 'RT Tableau', html: tableOf('MARQUETABLEAU'), filename: 'Tableau_#' + TABLE + '.Nom', page: rtPage('portrait'), type: 'document' },
        ],
        rules: ids => [rtRule('Grille', ids.grille), rtRule('Tableau', ids.tableau)],
      });
      try {
        await PdfExport.ensurePdfLibsLoaded();
        const docs = [];
        const original = window.pdfMake.createPdf;
        window.pdfMake.createPdf = function (docDefinition) { docs.push(docDefinition); return original.apply(window.pdfMake, arguments); };
        let res;
        try { res = await clickExportRow(h, 'v2-btn-export-pdf-batch'); } finally { window.pdfMake.createPdf = original; }
        const everyNode = (root, visit) => {
          const seen = new Set();
          const walk = (node) => { if (!node || typeof node !== 'object' || seen.has(node)) return; seen.add(node); visit(node); (Array.isArray(node) ? node : Object.values(node)).forEach(walk); };
          walk(root);
        };
        const textOf = (root) => { let text = ''; everyNode(root, (node) => { if (typeof node.text === 'string') text += node.text; }); return text; };
        const tableWith = (marker) => {
          for (let i = docs.length - 1; i >= 0; i--) {
            let found = null;
            everyNode(docs[i].content, (node) => { if (!found && node.table && Array.isArray(node.table.body) && textOf(node.table.body).includes(marker)) found = node; });
            if (found) return found;
          }
          return null;
        };
        const grid = tableWith('MARQUEGRILLE');
        const document_ = tableWith('MARQUETABLEAU');
        const facts = t => (t ? { headerRows: t.table.headerRows, dontBreakRows: !!t.table.dontBreakRows, heights: (t.table.heights || []).length } : null);
        const pass = res.downloads.length === 1 && !!grid && !!document_
          && grid.table.headerRows === 0 && !grid.table.dontBreakRows && (grid.table.heights || []).length === 3
          && document_.table.headerRows === 1 && document_.table.dontBreakRows === true && (document_.table.heights || []).length === 3;
        return { pass, notes: JSON.stringify({ grid: facts(grid), document: facts(document_), downloads: res.downloads.length, status: res.status }) };
      } finally { await releaseRowTemplates(h, saved); }
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
