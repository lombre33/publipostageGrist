// Suite "pdfBatch" - export de toutes les lignes (js/main.js:onExportPdfBatch) par les VRAIES lignes du menu « Exporter en PDF » : archive ZIP (un PDF
// par ligne) et PDF unique (js/pdf-merge.js, demande d'Antoine du 2026-09-28 : « toutes les lignes mais à la suite »). Le fichier téléchargé est intercepté
// (URL.createObjectURL + clic du <a download>) puis ouvert pour de vrai - pdf.js pour un PDF, JSZip pour l'archive - comme le ferait l'utilisateur.
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

  // Clique la ligne du menu et attend le téléchargement : confirm() accepté et noté, le <a download> intercepté au lieu d'un vrai téléchargement.
  async function clickExportRow(h, rowId) {
    const downloads = [];
    const confirms = [];
    const blobsByUrl = new Map();
    const origConfirm = window.confirm;
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    window.confirm = msg => { confirms.push(msg); return true; };
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < 60000) await h.sleep(100);
      await h.sleep(50); // le statut final est posé juste après le clic du <a>
    } finally {
      window.confirm = origConfirm;
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, confirms, status: document.getElementById('status-msg').textContent };
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfBatch = cases;
})();
