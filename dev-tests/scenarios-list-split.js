// Suite "listSplit" - « Un document par valeur » (demande d'Antoine du 2026-10-04 : « une feature qui indiquera que ça fera un export par valeur, c'est-à-dire que toutes les autres valeurs seront les mêmes mais
// ça sortira deux pdf s'il y a deux éléments dans la liste, un avec la première valeur et l'autre avec le deuxième »). Une bulle de liste réglée `format.list.perValue` (case de la fenêtre « Liste »,
// js/variable-list.js) fait sortir de chaque ligne un document par valeur : js/list-split.js fait le plan de la ligne (une liste par colonne, une combinaison par document) et réécrit, pour le document n° k,
// les bulles réglées en « La k-ième » ; js/main.js (onExportBatch, onExportPdf/Docx/Xlsx) rend le même modèle autant de fois. La Lecture et l'e-mail écrivent la liste comme réglée. Sans bulle réglée ainsi, rien
// n'est lu ni calculé de plus : un document par ligne, comme avant. Ces cas passent par les VRAIES lignes du menu d'export (le fichier téléchargé est intercepté puis ouvert, comme dans scenarios-pdf-batch.js).
(function () {
  const cases = [];
  const TABLE = 'LsDossiers';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PER = { list: { perValue: true } };
  const RECORD_1 = { id: 1, Titre: 'Alpha', Themes: ['Santé', 'Social'], Langues: ['fr', 'en'] };
  const RECORD_2 = { id: 2, Titre: 'Beta', Themes: ['Sport'], Langues: ['fr'] };
  const squash = s => String(s).replace(/\s+/g, '');
  const NAME = '#' + TABLE + '.Titre'; // le nom d'un fichier : une variable s'écrit « #Table.Colonne » (Variables.findTextVariables)

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (column, format, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${format ? attr('data-format', format) : ''}${extra || ''}></span>`;
  const never = attr('data-condition', { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Zzz' }] });
  const onlyAlpha = attr('data-condition', { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Alpha' }] });
  const BODY = `<p>Dossier ${badge('Titre')} : ${badge('Themes', PER)} / ${badge('Langues')}</p>`;

  async function seed(h, bodyHtml, headerFooterData) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Themes: 'ChoiceList', Langues: 'ChoiceList' });
    // Les lignes comme fetchTable les donne : ["L", …] pour une liste. La troisième n'a aucune valeur.
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Alpha', Themes: ['L', 'Santé', 'Social'], Langues: ['L', 'fr', 'en'] },
      { id: 2, Titre: 'Beta', Themes: ['L', 'Sport'], Langues: ['L', 'fr'] },
      { id: 3, Titre: 'Gamma', Themes: null, Langues: null },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
    if (bodyHtml != null) {
      Editor.setHTML(bodyHtml);
      Editor.setHeaderFooterData(headerFooterData || NO_HF);
      await h.sleep(80);
    }
  }
  const labelsOf = plan => plan.variants.map(v => v.label);

  // Clique la ligne du menu et attend le téléchargement (mêmes gestes que scenarios-pdf-batch.js:clickExportRow) : la confirmation acceptée et notée, le <a download> intercepté, chaque message d'état noté.
  async function clickExportRow(h, rowId, expect) {
    const downloads = [];
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
    const statusEl = document.getElementById('status-msg');
    const statuses = [];
    const statusObserver = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    statusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (downloads.length < (expect || 1) && Date.now() - startedAt < 60000) await h.sleep(100);
      await h.sleep(60);
    } finally {
      statusObserver.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, confirms, statuses, status: document.getElementById('status-msg').textContent };
  }
  // pdfmake télécharge un PDF seul par un Blob passé à FileSaver (pas par le <a download> du lot) : le Blob est repéré à sa création, jusqu'à ce qu'un PDF apparaisse (scenarios-pdf-batch.js:capturePdfBlob).
  async function clickAndCapturePdf(h, rowId) {
    const blobs = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = obj => { blobs.push(obj); return origCreate.call(URL, obj); };
    const downloads = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { downloads.push(this.download); return; } return origClick.call(this); };
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && !blobs.some(b => b && b.size > 0 && /pdf|zip/i.test(b.type || '')) && Date.now() - startedAt < 60000) await h.sleep(100);
      await h.sleep(80);
    } finally { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick; }
    return { blobs, downloads };
  }
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
  async function withFilenameTemplate(template, fn) {
    const input = document.getElementById('pdf-filename-template');
    const before = input.value;
    input.value = template;
    try { return await fn(); } finally { input.value = before; }
  }
  async function zipEntries(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return { zip, names: Object.keys(zip.files).filter(n => !zip.files[n].dir).sort() };
  }

  // --- Le plan d'une ligne ---
  cases.push({
    id: 'listsplit_plan_one_document_per_value_per_list_and_a_combination_for_several_lists',
    description: 'Le plan d’une ligne compte un document par valeur de la liste réglée « Un document par valeur » (le rang de chaque valeur et les valeurs écrites en étiquette) ; une liste vide laisse un seul document sans épingle ; deux bulles sur la même colonne n’en font qu’une ; deux colonnes donnent une combinaison par document, la première liste changeant le plus lentement',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const one = `<p>${badge('Titre')} ${badge('Themes', PER)}</p>`;
      const two = `<p>${badge('Themes', PER)} ${badge('Langues', PER)}</p>`;
      const twice = `<p>${badge('Themes', PER)} ${badge('Themes', { list: { perValue: true, pick: 'last' } })}</p>`;
      const p1 = await ListSplit.plan([one], TABLE, rows[0]);
      const p2 = await ListSplit.plan([one], TABLE, rows[1]);
      const p3 = await ListSplit.plan([one], TABLE, rows[2]);
      const both = await ListSplit.plan([two], TABLE, rows[0]);
      const same = await ListSplit.plan([twice], TABLE, rows[0]);
      const r = {
        labels: [labelsOf(p1), labelsOf(p2), labelsOf(p3)],
        ranks: p1.variants.map(v => Object.values(v.pins)),
        emptyListNoPin: p3.variants.length === 1 && Object.keys(p3.variants[0].pins).length === 0 && p3.groups.length === 1 && p3.groups[0].texts.length === 0,
        both: labelsOf(both),
        sameColumn: [same.groups.length, labelsOf(same)],
      };
      const pass = JSON.stringify(r.labels) === JSON.stringify([['Santé', 'Social'], ['Sport'], ['']])
        && JSON.stringify(r.ranks) === JSON.stringify([[1], [2]]) && r.emptyListNoPin
        && JSON.stringify(r.both) === JSON.stringify(['Santé - fr', 'Santé - en', 'Social - fr', 'Social - en'])
        && JSON.stringify(r.sameColumn) === JSON.stringify([1, ['Santé', 'Social']]);
      return { pass, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'listsplit_plan_reads_nothing_without_the_setting',
    description: 'Un modèle sans bulle réglée « Un document par valeur » n’est pas lu du tout (ReaderMode.splitBadges jamais appelé) : un seul document, sans épingle ni étiquette, et le HTML rendu est la même chaîne',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const plain = `<p>${badge('Titre')} ${badge('Themes')} ${badge('Langues', { list: { pick: 'first' } })}</p>`;
      const orig = ReaderMode.splitBadges;
      let calls = 0;
      ReaderMode.splitBadges = (...args) => { calls++; return orig(...args); };
      let plan;
      try { plan = await ListSplit.plan(ListSplit.partsOf(plain, NO_HF), TABLE, rows[0]); } finally { ReaderMode.splitBadges = orig; }
      const v = plan.variants[0];
      const pass = calls === 0 && plan.groups.length === 0 && plan.variants.length === 1 && v.label === '' && Object.keys(v.pins).length === 0
        && ListSplit.pin(plain, v) === plain && ListSplit.pinHeaderFooter(NO_HF, v) === NO_HF && !ListSplit.hasMarker([plain, '', undefined]) && ListSplit.hasMarker([plain, BODY]);
      return { pass, notes: JSON.stringify({ calls, groups: plan.groups.length, variants: plan.variants.length }) };
    },
  });

  cases.push({
    id: 'listsplit_plan_ignores_what_the_export_does_not_write',
    description: 'Le plan ne compte pas une bulle réglée que l’export n’écrit pas : sa propre condition d’affichage fausse pour la ligne, un bloc de texte conditionnel masqué, une boucle « dans la phrase » ; une condition remplie la compte ; les zones d’en-tête et de pied comptent seulement quand elles sont activées',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const count = async (html, row, hf) => (await ListSplit.plan(ListSplit.partsOf(html, hf || NO_HF), TABLE, row || rows[0])).variants.length;
      const loop = attr('data-loop', { repeat: 'inline', table: TABLE });
      const hiddenBlock = `<div class="conditional-text"${never}><p>${badge('Themes', PER)}</p></div>`;
      const shownBlock = `<div class="conditional-text"${onlyAlpha}><p>${badge('Themes', PER)}</p></div>`;
      const footerHf = on => ({ enabled: on, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>${badge('Themes', PER)}</p>`, first: '' } });
      const r = {
        ownConditionFalse: await count(`<p>${badge('Themes', PER, never)}</p>`),
        ownConditionHoldsAlpha: await count(`<p>${badge('Themes', PER, onlyAlpha)}</p>`),
        ownConditionHoldsBeta: await count(`<p>${badge('Themes', PER, onlyAlpha)}</p>`, rows[1]),
        hiddenBlock: await count(hiddenBlock),
        shownBlock: await count(shownBlock),
        shownBlockOtherRow: await count(shownBlock, rows[1]),
        inlineLoop: await count(`<p>${badge('Themes', PER, loop)}</p>`),
        footerOn: await count('<p>Texte</p>', rows[0], footerHf(true)),
        footerOff: await count('<p>Texte</p>', rows[0], footerHf(false)),
      };
      const pass = r.ownConditionFalse === 1 && r.ownConditionHoldsAlpha === 2 && r.ownConditionHoldsBeta === 1 && r.hiddenBlock === 1 && r.shownBlock === 2 && r.shownBlockOtherRow === 1
        && r.inlineLoop === 1 && r.footerOn === 2 && r.footerOff === 1;
      return { pass, notes: JSON.stringify(r) };
    },
  });

  // --- Le document n° k ---
  cases.push({
    id: 'listsplit_pin_rewrites_only_the_marked_bubbles_of_the_pinned_column',
    description: 'Le document n° k réécrit en « La k-ième » les bulles réglées « Un document par valeur » des colonnes épinglées, sans toucher les autres bulles (même colonne sans le réglage, texte) ni leurs autres clés de format ; mêmes réécritures dans les quatre zones d’en-tête et de pied ; sans épingle, le même objet',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const marked = badge('Themes', { type: 'number', list: { perValue: true, pick: 'last' } });
      const html = `<p>${marked} ${badge('Themes')} ${badge('Langues', PER)} ${badge('Titre')}</p>`;
      const hf = {
        enabled: true, differentFirstPage: true,
        header: { default: `<p>${badge('Themes', PER)}</p>`, first: `<p>${badge('Titre')}</p>` },
        footer: { default: `<p>${badge('Langues', PER)}</p>`, first: '<p>Texte seul</p>' },
      };
      const plan = await ListSplit.plan(ListSplit.partsOf(html, hf), TABLE, rows[0]);
      // Themes × Langues : (Santé, fr), (Santé, en), (Social, fr), (Social, en) - le troisième épingle « Social » (2) et « fr » (1).
      const third = plan.variants[2];
      const pinned = ListSplit.pin(html, third);
      const formats = Array.from(new DOMParser().parseFromString(pinned, 'text/html').querySelectorAll('.var-badge')).map(b => b.getAttribute('data-format'));
      const pinnedHf = ListSplit.pinHeaderFooter(hf, third);
      const indexOf = zoneHtml => { const m = /&quot;index&quot;:(\d+)/.exec(zoneHtml); return m ? Number(m[1]) : null; };
      const none = { pins: {}, label: '' };
      const r = {
        pins: Object.values(third.pins), formats,
        headerDefault: indexOf(pinnedHf.header.default), footerDefault: indexOf(pinnedHf.footer.default),
        untouchedZones: pinnedHf.header.first === hf.header.first && pinnedHf.footer.first === hf.footer.first,
        noPinSameObject: ListSplit.pinHeaderFooter(hf, none) === hf && ListSplit.pin(html, none) === html && ListSplit.pinHeaderFooter(NO_HF, third) === NO_HF,
      };
      const pass = JSON.stringify(r.pins) === JSON.stringify([2, 1])
        && formats[0] === JSON.stringify({ type: 'number', list: { pick: 'nth', index: 2 } }) && formats[1] === null
        && formats[2] === JSON.stringify({ list: { pick: 'nth', index: 1 } }) && formats[3] === null
        && r.headerDefault === 2 && r.footerDefault === 1 && r.untouchedZones && r.noPinSameObject;
      return { pass, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'listsplit_each_document_writes_its_value_and_everything_else_is_identical',
    description: 'Rendu par le chemin ordinaire (ReaderMode.preview), le document n° 1 écrit « Santé », le n° 2 « Social », et tout le reste du texte (autre variable, liste sans le réglage) est identique d’un document à l’autre ; la Lecture, elle, écrit toujours la liste comme réglée',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const plan = await ListSplit.plan(ListSplit.partsOf(BODY, NO_HF), TABLE, rows[0]);
      const docs = [];
      for (const v of plan.variants) docs.push((await ReaderMode.preview(ListSplit.pin(BODY, v), TABLE, rows[0])).replace(/<[^>]+>/g, ''));
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(BODY, TABLE, RECORD_1, NO_HF);
      const reading = squash(reader.querySelector('.reader-content').textContent);
      const pass = docs.length === 2 && squash(docs[0]) === squash('Dossier Alpha : Santé / fr, en') && squash(docs[1]) === squash('Dossier Alpha : Social / fr, en')
        && reading === squash('Dossier Alpha : Santé, Social / fr, en');
      return { pass, notes: JSON.stringify({ docs, reading }) };
    },
  });

  // --- Les exports en lot ---
  cases.push({
    id: 'listsplit_batch_pdf_zip_one_pdf_per_value_named_after_the_value',
    description: '« Exporter les lignes (ZIP)… » avec une liste réglée « Un document par valeur » : un PDF par valeur (Alpha en a deux, Beta un, Gamma, sans valeur, un seul), nommé d’après la ligne puis la valeur, le texte identique hors la valeur ; la confirmation annonce le nombre de documents, la fin dit combien de PDF',
    run: async (h) => {
      await seed(h, BODY);
      const res = await withFilenameTemplate(NAME, () => clickExportRow(h, 'v2-btn-export-pdf-batch'));
      const dl = res.downloads[0];
      const { zip, names } = dl && dl.blob ? await zipEntries(dl.blob) : { zip: null, names: [] };
      const texts = {};
      for (const n of names) texts[n] = squash((await pdfPageTexts(h, await zip.file(n).async('blob'))).join(' '));
      const expectedTexts = {
        'Alpha - Santé.pdf': 'DossierAlpha:Santé/fr,en', 'Alpha - Social.pdf': 'DossierAlpha:Social/fr,en',
        'Beta - Sport.pdf': 'DossierBeta:Sport/fr', 'Gamma.pdf': 'DossierGamma:/',
      };
      const note = I18n.t('confirm.splitNote', { documents: 4 });
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export-pdf.zip'
        && JSON.stringify(names) === JSON.stringify(Object.keys(expectedTexts).sort())
        && names.every(n => texts[n] === squash(expectedTexts[n]))
        && res.confirms.length === 1 && res.confirms[0] === I18n.t('confirm.batchExport', { count: 3, table: TABLE }) + '\n\n' + note
        && res.status === I18n.t('status.batchExportDone', { ok: 4 });
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), names, texts, confirms: res.confirms, status: res.status }) };
    },
  });

  cases.push({
    id: 'listsplit_batch_without_the_setting_is_unchanged',
    description: 'Le même export sans bulle réglée « Un document par valeur » reste ce qu’il était : un PDF par ligne, la confirmation sans phrase en plus, la fin « 3 PDF générés », rien lu de plus (ReaderMode.splitBadges jamais appelé)',
    run: async (h) => {
      await seed(h, `<p>Dossier ${badge('Titre')} : ${badge('Themes')} / ${badge('Langues')}</p>`);
      const orig = ReaderMode.splitBadges;
      let calls = 0;
      ReaderMode.splitBadges = (...args) => { calls++; return orig(...args); };
      let res;
      try { res = await withFilenameTemplate(NAME, () => clickExportRow(h, 'v2-btn-export-pdf-batch')); } finally { ReaderMode.splitBadges = orig; }
      const dl = res.downloads[0];
      const { names } = dl && dl.blob ? await zipEntries(dl.blob) : { names: [] };
      const pass = calls === 0 && JSON.stringify(names) === JSON.stringify(['Alpha.pdf', 'Beta.pdf', 'Gamma.pdf'])
        && res.confirms.length === 1 && res.confirms[0] === I18n.t('confirm.batchExport', { count: 3, table: TABLE })
        && res.status === I18n.t('status.batchExportDone', { ok: 3 });
      return { pass, notes: JSON.stringify({ calls, names, confirms: res.confirms, status: res.status }) };
    },
  });

  cases.push({
    id: 'listsplit_merged_pdf_pages_follow_the_rows_then_the_values',
    description: '« Exporter les lignes en un seul PDF… » : une page par document, dans l’ordre des lignes puis des valeurs, et la fin compte des documents (« 4 documents réunis »), pas des lignes',
    run: async (h) => {
      await seed(h, BODY);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
      const dl = res.downloads[0];
      const texts = dl && dl.blob ? (await pdfPageTexts(h, dl.blob)).map(squash) : [];
      const expected = ['DossierAlpha:Santé/fr,en', 'DossierAlpha:Social/fr,en', 'DossierBeta:Sport/fr', 'DossierGamma:/'].map(squash);
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export.pdf' && JSON.stringify(texts) === JSON.stringify(expected)
        && res.confirms.length === 1 && res.confirms[0].endsWith(I18n.t('confirm.splitNote', { documents: 4 }))
        && res.status === I18n.t('status.splitMergedDone', { ok: 4 });
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), texts, confirms: res.confirms, status: res.status }) };
    },
  });

  cases.push({
    id: 'listsplit_batch_docx_zip_one_docx_per_value',
    description: '« Exporter les lignes en DOCX (ZIP)… » : un .docx par valeur, nommé d’après la ligne puis la valeur, chacun écrivant sa valeur et la liste non réglée en entier',
    run: async (h) => {
      await seed(h, BODY);
      const res = await withFilenameTemplate(NAME, () => clickExportRow(h, 'v2-btn-export-docx-batch'));
      const dl = res.downloads[0];
      const { zip, names } = dl && dl.blob ? await zipEntries(dl.blob) : { zip: null, names: [] };
      const texts = {};
      for (const n of names) {
        const inner = await JSZip.loadAsync(await zip.file(n).async('arraybuffer'));
        texts[n] = squash((await inner.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ''));
      }
      const expected = { 'Alpha - Santé.docx': 'DossierAlpha:Santé/fr,en', 'Alpha - Social.docx': 'DossierAlpha:Social/fr,en', 'Beta - Sport.docx': 'DossierBeta:Sport/fr', 'Gamma.docx': 'DossierGamma:/' };
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export-docx.zip' && JSON.stringify(names) === JSON.stringify(Object.keys(expected).sort())
        && names.every(n => texts[n].includes(squash(expected[n])))
        && res.status === I18n.t('status.batchExportDoneDocx', { ok: 4 });
      return { pass, notes: JSON.stringify({ names, texts, status: res.status }) };
    },
  });

  cases.push({
    id: 'listsplit_markdown_zip_and_single_export_one_md_per_value',
    description: 'Type Markdown : « Toutes les lignes de la vue (ZIP) » rend un .md par valeur, nommé d’après la ligne puis la valeur, chacun écrivant sa valeur et la liste non réglée en entier ; « Une seule ligne » d’une ligne à deux valeurs rend une archive d’un .md par valeur, d’une ligne à une seule valeur le .md ordinaire',
    run: async (h) => {
      await seed(h, BODY);
      const choose = (type, lines) => {
        document.querySelector(`#v2-quality-flyout .v2-hover-row[data-export-type="${type}"]`).click();
        document.querySelector(`#v2-export-pdf-flyout .v2-hover-row[data-export-lines="${lines}"]`).click();
      };
      const textsOf = async (blob) => {
        const { zip, names } = await zipEntries(blob);
        const texts = {};
        for (const n of names) texts[n] = squash(await zip.file(n).async('string'));
        return { names, texts };
      };
      let all;
      let single;
      let plain;
      try {
        choose('md', 'zip');
        all = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
        choose('md', 'one');
        single = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
        window.__gristStub.fireRecord(Object.assign({}, RECORD_2), TABLE);
        await h.sleep(60);
        plain = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
      } finally { choose('pdf', 'one'); }
      const allEntries = all.downloads[0] && all.downloads[0].blob ? await textsOf(all.downloads[0].blob) : { names: [], texts: {} };
      const singleEntries = single.downloads[0] && single.downloads[0].blob ? await textsOf(single.downloads[0].blob) : { names: [], texts: {} };
      const expected = { 'Alpha - Santé.md': 'DossierAlpha:Santé/fr,en', 'Alpha - Social.md': 'DossierAlpha:Social/fr,en', 'Beta - Sport.md': 'DossierBeta:Sport/fr', 'Gamma.md': 'DossierGamma:/' };
      const plainText = plain.downloads[0] && plain.downloads[0].blob ? squash(await plain.downloads[0].blob.text()) : '';
      const pass = all.downloads.length === 1 && all.downloads[0].name === TABLE + '-export-md.zip' && JSON.stringify(allEntries.names) === JSON.stringify(Object.keys(expected).sort())
        && allEntries.names.every(n => allEntries.texts[n] === squash(expected[n])) && all.status === I18n.t('status.batchExportDoneMd', { ok: 4 })
        && single.downloads.length === 1 && JSON.stringify(singleEntries.names) === JSON.stringify(['Alpha - Santé.md', 'Alpha - Social.md'])
        && singleEntries.names.every(n => singleEntries.texts[n] === squash(expected[n]))
        && plain.downloads.length === 1 && plain.downloads[0].name === 'Beta.md' && plainText === squash('DossierBeta:Sport/fr');
      return { pass, notes: JSON.stringify({ allDownloads: all.downloads.map(d => d.name), allEntries, singleDownloads: single.downloads.map(d => d.name), singleEntries, plainDownloads: plain.downloads.map(d => d.name), plainText, status: all.status }) };
    },
  });

  cases.push({
    id: 'listsplit_html_zip_and_single_export_one_html_per_value',
    description: 'Types HTML (fichier à déposer et contenu à coller) : « Toutes les lignes de la vue (ZIP) » rend un .html par valeur (« -fragment.html » pour le contenu à coller), nommé d’après la ligne puis la valeur, chacun écrivant sa valeur et la liste non réglée en entier ; « Une seule ligne » d’une ligne à deux valeurs rend une archive d’un .html par valeur, d’une ligne à une seule valeur le .html ordinaire',
    run: async (h) => {
      await seed(h, BODY);
      const choose = (type, lines) => {
        document.querySelector(`#v2-quality-flyout .v2-hover-row[data-export-type="${type}"]`).click();
        document.querySelector(`#v2-export-pdf-flyout .v2-hover-row[data-export-lines="${lines}"]`).click();
      };
      // Le texte du contenu de chaque fichier (`.pp-doc`), sans la mise en page.
      const textOf = source => squash(new DOMParser().parseFromString(source, 'text/html').querySelector('.pp-doc').textContent);
      const textsOf = async (blob) => {
        const { zip, names } = await zipEntries(blob);
        const texts = {};
        for (const n of names) texts[n] = textOf(await zip.file(n).async('string'));
        return { names, texts };
      };
      const expected = { 'Alpha - Santé': 'DossierAlpha:Santé/fr,en', 'Alpha - Social': 'DossierAlpha:Social/fr,en', 'Beta - Sport': 'DossierBeta:Sport/fr', 'Gamma': 'DossierGamma:/' };
      const bad = [];
      for (const [type, suffix, zipName] of [['html', '.html', '-export-html.zip'], ['htmlFragment', '-fragment.html', '-export-html-fragment.zip']]) {
        let all;
        let single;
        let plain;
        try {
          window.__gristStub.fireRecord(Object.assign({}, RECORD_1), TABLE);
          await h.sleep(60);
          choose(type, 'zip');
          all = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
          choose(type, 'one');
          single = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
          window.__gristStub.fireRecord(Object.assign({}, RECORD_2), TABLE);
          await h.sleep(60);
          plain = await withFilenameTemplate(NAME, () => clickExportRow(h, 'btn-export-pdf'));
        } finally { choose('pdf', 'one'); }
        const allEntries = all.downloads[0] && all.downloads[0].blob ? await textsOf(all.downloads[0].blob) : { names: [], texts: {} };
        const singleEntries = single.downloads[0] && single.downloads[0].blob ? await textsOf(single.downloads[0].blob) : { names: [], texts: {} };
        const names = Object.keys(expected).map(n => n + suffix).sort();
        const plainText = plain.downloads[0] && plain.downloads[0].blob ? textOf(await plain.downloads[0].blob.text()) : '';
        if (all.downloads.length !== 1 || all.downloads[0].name !== TABLE + zipName) bad.push(type + ' : archive=' + JSON.stringify(all.downloads.map(d => d.name)));
        if (JSON.stringify(allEntries.names) !== JSON.stringify(names)) bad.push(type + ' : fichiers=' + JSON.stringify(allEntries.names));
        names.forEach(n => { if (allEntries.texts[n] !== squash(expected[n.slice(0, -suffix.length)])) bad.push(type + ' : ' + n + '=' + allEntries.texts[n]); });
        if (all.status !== I18n.t('status.batchExportDoneHtml', { ok: 4 })) bad.push(type + ' : état=' + all.status);
        if (single.downloads.length !== 1 || JSON.stringify(singleEntries.names) !== JSON.stringify(['Alpha - Santé' + suffix, 'Alpha - Social' + suffix])) bad.push(type + ' : une ligne=' + JSON.stringify(singleEntries.names));
        singleEntries.names.forEach(n => { if (singleEntries.texts[n] !== squash(expected[n.slice(0, -suffix.length)])) bad.push(type + ' : ' + n + '=' + singleEntries.texts[n]); });
        if (plain.downloads.length !== 1 || plain.downloads[0].name !== 'Beta' + suffix || plainText !== squash('DossierBeta:Sport/fr')) bad.push(type + ' : ligne ordinaire=' + JSON.stringify(plain.downloads.map(d => d.name)) + ' ' + plainText);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'listsplit_header_footer_follow_the_same_value_as_the_body',
    description: 'Une bulle réglée dans le pied de page écrit la même valeur que celle du corps dans chaque document du PDF unique',
    run: async (h) => {
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Pied : ${badge('Themes', PER)}</p>`, first: '' } };
      await seed(h, `<p>Dossier ${badge('Titre')} : ${badge('Themes', PER)}</p>`, hf);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
      const dl = res.downloads[0];
      const texts = dl && dl.blob ? (await pdfPageTexts(h, dl.blob)).map(squash) : [];
      const pass = texts.length === 4 && texts[0].includes('DossierAlpha:Santé') && texts[0].includes('Pied:Santé') && texts[1].includes('DossierAlpha:Social') && texts[1].includes('Pied:Social')
        && texts[2].includes('DossierBeta:Sport') && texts[2].includes('Pied:Sport') && texts[3].includes('DossierGamma:') && !texts[3].includes('Santé');
      return { pass, notes: JSON.stringify({ texts, status: res.status }) };
    },
  });

  cases.push({
    id: 'listsplit_excel_single_workbook_names_each_sheet_after_its_value',
    description: 'Dans le classeur Excel unique, chaque valeur a sa feuille, nommée d’après la ligne puis la valeur sans dépasser les 31 caractères d’Excel (la valeur reste lisible)',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const grid = `<table style="width:300px"><colgroup><col style="width:150px"><col style="width:150px"></colgroup><tbody><tr><td><p>${badge('Titre')}</p></td><td><p>${badge('Themes', PER)}</p></td></tr></tbody></table>`;
      const book = await XlsxExport.createSingleWorkbook();
      const plan = await ListSplit.plan(ListSplit.partsOf(grid, NO_HF), TABLE, rows[0]);
      const long = 'Un dossier au nom vraiment très long';
      for (const v of plan.variants) await book.appendRecord(ListSplit.pin(grid, v), TABLE, rows[0], long + ' ' + NAME, v.label);
      await book.appendRecord(grid, TABLE, rows[1], NAME);
      const blob = await book.toBlob();
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('xl/workbook.xml').async('string');
      const sheets = Array.from(xml.matchAll(/<sheet [^>]*name="([^"]+)"/g)).map(m => m[1]);
      const pass = sheets.length === 3 && sheets[0].length <= 31 && sheets[0].endsWith(' - Santé') && sheets[1].length <= 31 && sheets[1].endsWith(' - Social') && sheets[2] === 'Beta';
      return { pass, notes: JSON.stringify({ sheets }) };
    },
  });

  // --- Un export seul ---
  cases.push({
    id: 'listsplit_single_pdf_export_is_a_zip_of_one_pdf_per_value_else_the_plain_pdf',
    description: '« Exporter en PDF » (ligne courante) : deux valeurs donnent une archive ZIP d’un PDF par valeur, une seule valeur le PDF ordinaire qui écrit cette valeur, sans archive',
    run: async (h) => {
      await seed(h, BODY);
      const two = await withFilenameTemplate(NAME, () => clickAndCapturePdf(h, 'btn-export-pdf'));
      const zipBlob = two.blobs.find(b => b && /zip/i.test(b.type || ''));
      const { zip, names } = zipBlob ? await zipEntries(zipBlob) : { zip: null, names: [] };
      const texts = {};
      for (const n of names) texts[n] = squash((await pdfPageTexts(h, await zip.file(n).async('blob'))).join(' '));
      window.__gristStub.fireRecord(Object.assign({}, RECORD_2), TABLE);
      await h.sleep(60);
      const one = await withFilenameTemplate(NAME, () => clickAndCapturePdf(h, 'btn-export-pdf'));
      const pdfBlob = one.blobs.find(b => b && /pdf/i.test(b.type || ''));
      const oneText = pdfBlob ? squash((await pdfPageTexts(h, pdfBlob)).join(' ')) : '';
      const pass = JSON.stringify(names) === JSON.stringify(['Alpha - Santé.pdf', 'Alpha - Social.pdf'])
        && texts['Alpha - Santé.pdf'] === squash('DossierAlpha:Santé/fr,en') && texts['Alpha - Social.pdf'] === squash('DossierAlpha:Social/fr,en')
        && !one.blobs.some(b => b && /zip/i.test(b.type || '')) && oneText === squash('DossierBeta:Sport/fr');
      return { pass, notes: JSON.stringify({ twoBlobs: two.blobs.map(b => [b.type, b.size]), twoDownloads: two.downloads, names, texts, oneBlobs: one.blobs.map(b => [b.type, b.size]), oneText }) };
    },
  });

  // Un clic sur la ligne du menu, la confirmation (si elle est posée) refusée ou acceptée comme `answer`, et ce qui se passe pendant `waitMs` : les questions posées, les fichiers téléchargés, le coin d'état.
  async function clickAnswering(h, rowId, answer, waitMs) {
    const asked = [];
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: opts => { asked.push(opts); return answer; } });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      document.getElementById(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < waitMs) await h.sleep(100);
      // Un export qui continue après un refus montrerait « Génération… » ici : on attend un peu avant de lire le coin d'état.
      if (!downloads.length) await h.sleep(1500);
    } finally {
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { asked, downloads, status: document.getElementById('status-msg').textContent };
  }

  cases.push({
    id: 'listsplit_single_export_asks_before_making_more_than_50_documents',
    description: 'Un export seul (« Exporter en PDF ») dont la ligne fait plus de 50 documents - deux listes de 20 valeurs en font 400 - demande d\'abord « Cette ligne fait N documents… Générer l\'archive ? » : « Annuler » ne fabrique rien et laisse « Export annulé. » dans le coin d\'état, « Générer » donne l\'archive de tous les documents ; à 50 documents ou moins le clic vaut accord comme avant, sans question ; la question est en anglais en anglais.',
    run: async (h) => {
      await seed(h, BODY);
      const values = n => Array.from({ length: n }, (_, i) => 'v' + String(i + 1).padStart(2, '0'));
      const fire = n => { window.__gristStub.fireRecord({ id: 1, Titre: 'Alpha', Themes: values(n), Langues: ['fr'] }, TABLE); };
      const lang = I18n.getLang();
      try {
        fire(51);
        await h.sleep(60);
        const refused = await withFilenameTemplate(NAME, () => clickAnswering(h, 'btn-export-pdf', false, 2000));
        const accepted = await withFilenameTemplate(NAME, () => clickAnswering(h, 'btn-export-pdf', true, 120000));
        const names = accepted.downloads[0] && accepted.downloads[0].blob ? (await zipEntries(accepted.downloads[0].blob)).names : [];
        I18n.setLang('en');
        const refusedEn = await withFilenameTemplate(NAME, () => clickAnswering(h, 'btn-export-pdf', false, 2000));
        I18n.setLang('fr');
        // 50 documents : la limite, pas de question. La réponse « refuser » le prouverait par un export annulé : il se fait.
        fire(50);
        await h.sleep(60);
        const atLimit = await withFilenameTemplate(NAME, () => clickAnswering(h, 'btn-export-pdf', false, 120000));
        const limitNames = atLimit.downloads[0] && atLimit.downloads[0].blob ? (await zipEntries(atLimit.downloads[0].blob)).names : [];
        const checks = {
          refusedAskedOnce: refused.asked.length === 1,
          message: refused.asked[0] && refused.asked[0].message === 'Cette ligne fait 51 documents, un par valeur des listes réglées « Un document par valeur ». Générer l’archive ?' && refused.asked[0].title === 'Un document par valeur' && refused.asked[0].confirmLabel === 'Générer',
          refusedNothingMade: refused.downloads.length === 0 && refused.status === 'Export annulé.',
          acceptedAskedOnce: accepted.asked.length === 1,
          acceptedArchive: names.length === 51 && names[0] === 'Alpha - v01.pdf' && names[50] === 'Alpha - v51.pdf',
          english: refusedEn.asked.length === 1 && refusedEn.asked[0].message === 'This row makes 51 documents, one per value of the lists set to “One document per value”. Generate the archive?' && refusedEn.status === 'Export canceled.',
          atLimitNoQuestion: atLimit.asked.length === 0 && limitNames.length === 50,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, refused: refused.asked.map(a => a.message), status: refused.status, names: names.length, first: names[0], last: names[names.length - 1], limitNames: limitNames.length }) };
      } finally {
        I18n.setLang(lang);
      }
    },
  });

  // --- Une liste de références : un document par ligne liée, nommé d'après son texte affiché (la colonne d'aide de Grist), pas d'après son numéro ---
  cases.push({
    id: 'listsplit_reference_list_one_document_per_linked_row_named_after_its_shown_text',
    description: 'Une liste de références (RefList) réglée « Un document par valeur » : un document par ligne liée, qui écrit le texte affiché de cette ligne (la colonne d’aide de Grist, jamais son numéro) ; les noms de fichier portent ce texte',
    run: async (h) => {
      await h.resetEditor();
      const stub = window.__gristStub;
      const TEAMS = 'LsEquipes';
      const PEOPLE = 'LsPersonnes';
      stub.setVariables(PEOPLE, { Nom: 'Text' });
      stub.setRows(PEOPLE, [{ id: 1, Nom: 'Dupont Jean' }, { id: 2, Nom: 'Martin Anne' }, { id: 3, Nom: 'Durand Paul' }]);
      stub.setVariables(TEAMS, { Nom: 'Text', Membres: 'RefList:' + PEOPLE, gristHelper_Display: 'Any' }, null, { Membres: 'gristHelper_Display' });
      stub.setRows(TEAMS, [
        { id: 1, Nom: 'Alpha', Membres: ['L', 1, 2, 3], gristHelper_Display: ['L', 'Dupont Jean', 'Martin Anne', 'Durand Paul'] },
        { id: 2, Nom: 'Beta', Membres: ['L', 2], gristHelper_Display: ['L', 'Martin Anne'] },
      ]);
      await GristAPI.refreshSchema();
      stub.fireRecord({ id: 1, Nom: 'Alpha', Membres: ['Dupont Jean', 'Martin Anne', 'Durand Paul'] }, TEAMS);
      await h.sleep(50);
      const bubble = (column, format) => `<span class="var-badge" data-table="${TEAMS}" data-column="${column}" data-key="${TEAMS}.${column}"${format ? attr('data-format', format) : ''}></span>`;
      Editor.setHTML(`<p>Équipe ${bubble('Nom')} : ${bubble('Membres', PER)}</p>`);
      Editor.setHeaderFooterData(NO_HF);
      await h.sleep(80);
      const res = await clickExportRow(h, 'v2-btn-export-pdf-merged');
      const dl = res.downloads[0];
      const texts = dl && dl.blob ? (await pdfPageTexts(h, dl.blob)).map(squash) : [];
      const named = await withFilenameTemplate('#' + TEAMS + '.Nom', () => clickExportRow(h, 'v2-btn-export-pdf-batch'));
      const { names } = named.downloads[0] && named.downloads[0].blob ? await zipEntries(named.downloads[0].blob) : { names: [] };
      const pass = JSON.stringify(texts) === JSON.stringify(['ÉquipeAlpha:DupontJean', 'ÉquipeAlpha:MartinAnne', 'ÉquipeAlpha:DurandPaul', 'ÉquipeBeta:MartinAnne'])
        && JSON.stringify(names) === JSON.stringify(['Alpha - Dupont Jean.pdf', 'Alpha - Durand Paul.pdf', 'Alpha - Martin Anne.pdf', 'Beta - Martin Anne.pdf']);
      return { pass, notes: JSON.stringify({ texts, names, status: res.status }) };
    },
  });

  // --- Un macro-modèle : le HTML de chaque ligne est assemblé ligne par ligne (annexes choisies selon la ligne), puis découpé par valeur. Placé en dernier : le macro chargé laisse l'application en mode
  // macro, restauré par le vrai bouton « Nouveau document » (resetEditor() ne touche pas à ce mode), comme dans scenarios-pdf-batch.js. ---
  async function loadMacro(h) {
    await seed(h);
    const cover = await Templates.save(null, 'LsMacro couverture', `<p>COUVERTURE ${badge('Titre')} : ${badge('Themes', PER)}</p>`, '', null, null, 'document', null);
    const annexe = await Templates.save(null, 'LsMacro annexe', '<p>ANNEXEALPHA</p>', '', null, null, 'document', null);
    const slots = { slots: [
      { type: 'fixed', modeleId: cover.id },
      { type: 'conditional', rules: [{ column: 'Titre', operator: '=', value: 'Alpha', modeleId: annexe.id }], defaultModeleId: null },
    ] };
    const macro = await Templates.save(null, 'LsMacro dossier', JSON.stringify(slots), '', null, null, 'macro', null);
    await Templates.loadAll();
    const select = document.getElementById('template-select');
    if (!Array.from(select.options).some(o => o.value === String(macro.id))) {
      const option = document.createElement('option');
      option.value = String(macro.id);
      option.textContent = 'LsMacro dossier';
      select.appendChild(option);
    }
    select.value = String(macro.id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(300);
    return String(Templates.getCurrentId()) === String(macro.id);
  }
  async function restoreDocumentMode(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(100);
  }

  cases.push({
    id: 'listsplit_macro_model_splits_each_row_after_picking_its_annexes',
    description: 'Macro-modèle (une couverture à liste réglée « Un document par valeur », une annexe réservée à la ligne Alpha) : chaque valeur de la ligne a son document, couverture à sa valeur puis l’annexe de la ligne (jamais celle d’une autre) ; l’export d’une seule ligne en fait une archive de même contenu',
    run: async (h) => {
      try {
        const loaded = await loadMacro(h);
        const res = await clickExportRow(h, 'v2-btn-export-pdf-batch');
        const dl = res.downloads[0];
        const { zip, names } = dl && dl.blob ? await zipEntries(dl.blob) : { zip: null, names: [] };
        const texts = {};
        for (const n of names) texts[n] = squash((await pdfPageTexts(h, await zip.file(n).async('blob'))).join(' | '));
        // Sans nom réglé, chaque PDF porte le nom du macro-modèle puis celui de sa ligne, puis la valeur du « Un document par valeur » (audit confort du 12/11, idée 1).
        const expected = {
          'LsMacro dossier - Alpha - Santé.pdf': squash('COUVERTURE Alpha : Santé') + '|' + 'ANNEXEALPHA',
          'LsMacro dossier - Alpha - Social.pdf': squash('COUVERTURE Alpha : Social') + '|' + 'ANNEXEALPHA',
          'LsMacro dossier - Beta - Sport.pdf': squash('COUVERTURE Beta : Sport'),
          'LsMacro dossier - Gamma.pdf': squash('COUVERTURE Gamma :'),
        };
        const matches = names.every(n => texts[n] === expected[n]);
        window.__gristStub.fireRecord(Object.assign({}, RECORD_1), TABLE);
        await h.sleep(60);
        const single = await clickAndCapturePdf(h, 'btn-export-pdf');
        const singleZip = single.blobs.find(b => b && /zip/i.test(b.type || ''));
        const single2 = singleZip ? await zipEntries(singleZip) : { names: [] };
        const pass = loaded && JSON.stringify(names) === JSON.stringify(Object.keys(expected).sort()) && matches && res.status === I18n.t('status.batchExportDone', { ok: 4 })
          && JSON.stringify(single2.names) === JSON.stringify(['LsMacro dossier - Alpha - Santé.pdf', 'LsMacro dossier - Alpha - Social.pdf']);
        return { pass, notes: JSON.stringify({ loaded, names, texts, status: res.status, single: single2.names }) };
      } finally { await restoreDocumentMode(h); }
    },
  });

  // --- Le sinon d'une bulle (demande d'Antoine du 2026-10-08 : « Sinon afficher » dans la condition d'une bulle, js/variable-otherwise.js) ---
  cases.push({
    id: 'listsplit_plan_follows_the_variable_a_bubble_with_an_otherwise_writes',
    description: 'Une bulle de liste réglée « Un document par valeur » dont la condition n’est pas remplie écrit son sinon, une valeur simple qui ne se découpe pas : un seul document, sans épingle, même quand la colonne du sinon est elle aussi une liste (le réglage de liste ne passe jamais au sinon) ; condition remplie, la liste se découpe comme avant',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(TABLE);
      const sinon = column => ` data-otherwise-table="${TABLE}" data-otherwise-column="${column}" data-otherwise-key="${TABLE}.${column}"`;
      const unmet = await ListSplit.plan([`<p>${badge('Themes', PER, never + sinon('Langues'))}</p>`], TABLE, rows[0]);
      const held = await ListSplit.plan([`<p>${badge('Themes', PER, onlyAlpha + sinon('Langues'))}</p>`], TABLE, rows[0]);
      const r = { unmet: [unmet.variants.length, unmet.groups.length, Object.keys(unmet.variants[0].pins).length], held: labelsOf(held) };
      const pass = JSON.stringify(r.unmet) === '[1,0,0]' && JSON.stringify(r.held) === JSON.stringify(['Santé', 'Social']);
      return { pass, notes: JSON.stringify(r) };
    },
  });

  // --- Plusieurs variables d'une même liste de références (cas d'usage d'Antoine du 17/11 : « une colonne référence multiple pour tous les partenaires d'un projet, un document pour chacun » ;
  // #Projets.Partenaires.Nom_complet, .ligne_1, .ligne_2, .CP et .Ville cochées « Un document par valeur » faisaient le produit des listes, 32 documents pour 2 partenaires) ---
  const PROJ = 'LsProjets';
  const ETAB = 'LsEtablissements';
  const refBadge = (path, format) => `<span class="var-badge" data-table="${PROJ}" data-column="${path}" data-key="${PROJ}.${path}"${format ? attr('data-format', format) : ''}></span>`;
  const FIELDS = ['Nom_complet', 'ligne_1', 'ligne_2', 'CP', 'Ville'];
  const addressOf = (list, perValue) => `<p>${FIELDS.map(f => refBadge(list + '.' + f, perValue === false ? null : PER)).join(' | ')}</p>`;
  async function seedRefs(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(ETAB, { Nom_complet: 'Text', ligne_1: 'Text', ligne_2: 'Text', CP: 'Text', Ville: 'Text' });
    stub.setRows(ETAB, [
      { id: 1, Nom_complet: 'Bordeaux Sciences Agro', ligne_1: '1 cours du Général de Gaulle', ligne_2: '', CP: '33170', Ville: 'Gradignan' },
      { id: 2, Nom_complet: 'Institut d’Études Politiques de Bordeaux', ligne_1: '11 allée Ausone', ligne_2: 'Bâtiment B', CP: '33607', Ville: 'Pessac' },
      { id: 3, Nom_complet: '', ligne_1: '5 rue Sans-Nom', ligne_2: '', CP: '33000', Ville: 'Bordeaux' },
      { id: 4, Nom_complet: 'Université de Bordeaux', ligne_1: '35 place Pey-Berland', ligne_2: '', CP: '33000', Ville: 'Bordeaux' },
    ]);
    stub.setVariables(PROJ, { Titre: 'Text', Partenaires: 'RefList:' + ETAB, Autres: 'RefList:' + ETAB, gristHelper_Display: 'Any' }, null, { Partenaires: 'gristHelper_Display' });
    stub.setRows(PROJ, [
      { id: 1, Titre: 'Alpha', Partenaires: ['L', 1, 2], Autres: ['L', 3, 4, 1], gristHelper_Display: ['L', 'Bordeaux Sciences Agro', 'Institut d’Études Politiques de Bordeaux'] },
      { id: 2, Titre: 'Beta', Partenaires: ['L', 3, 2], Autres: null, gristHelper_Display: ['L', '', 'Institut d’Études Politiques de Bordeaux'] },
      { id: 3, Titre: 'Gamma', Partenaires: null, Autres: null, gristHelper_Display: null },
    ]);
    await GristAPI.refreshSchema();
  }
  // Le texte de chaque document d'une ligne, résolu comme le fait l'export : le plan, la réécriture, puis la Lecture commune.
  async function documentsOf(html, record) {
    const plan = await ListSplit.plan([html], PROJ, record);
    const texts = [];
    for (const variant of plan.variants) {
      const resolved = await ReaderMode.resolvedHtml(() => ListSplit.pin(html, variant), PROJ, record);
      const holder = document.createElement('div');
      holder.innerHTML = resolved.html;
      texts.push(Array.from(holder.querySelectorAll('.resolved-var')).map(e => e.textContent).join(' | '));
    }
    return { plan, texts };
  }

  cases.push({
    id: 'listsplit_variables_of_one_list_of_references_advance_together_one_document_per_row',
    description: 'Cinq variables d’une même liste de références (#Projets.Partenaires.Nom_complet, .ligne_1, .ligne_2, .CP, .Ville) cochées « Un document par valeur » ne font plus un document par combinaison (32 pour deux partenaires) : un seul groupe, un document par partenaire, la k-ième ligne de la liste pour chaque variable, les fichiers nommés d’après le premier texte écrit.',
    run: async (h) => {
      await seedRefs(h);
      const rows = await GristAPI.fetchTableRows(PROJ);
      const { plan, texts } = await documentsOf(addressOf('Partenaires'), rows[0]);
      const r = { groups: plan.groups.length, labels: labelsOf(plan), pins: plan.variants.map(v => Object.values(v.pins)), texts };
      const pass = r.groups === 1 && JSON.stringify(r.labels) === JSON.stringify(['Bordeaux Sciences Agro', 'Institut d’Études Politiques de Bordeaux']) && JSON.stringify(r.pins) === '[[1],[2]]'
        && JSON.stringify(texts) === JSON.stringify([
          'Bordeaux Sciences Agro | 1 cours du Général de Gaulle |  | 33170 | Gradignan',
          'Institut d’Études Politiques de Bordeaux | 11 allée Ausone | Bâtiment B | 33607 | Pessac',
        ]);
      return { pass, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'listsplit_an_empty_cell_of_one_partner_does_not_shift_the_following_partners',
    description: 'Le rang suit la LIGNE de la liste de références, pas la k-ième valeur non vide : le premier partenaire n’a pas de deuxième ligne d’adresse, son document l’écrit vide et celui du second garde « Bâtiment B » ; un partenaire sans nom mais avec une adresse a son document, nommé d’après le premier texte écrit.',
    run: async (h) => {
      await seedRefs(h);
      const rows = await GristAPI.fetchTableRows(PROJ);
      const beta = await documentsOf(addressOf('Partenaires'), rows[1]);
      const line2 = await documentsOf(`<p>${refBadge('Partenaires.ligne_2', PER)} ${refBadge('Partenaires.Ville', PER)}</p>`, rows[0]);
      const r = { beta: beta.texts, betaLabels: labelsOf(beta.plan), line2: line2.texts, line2Labels: labelsOf(line2.plan) };
      const pass = JSON.stringify(r.beta) === JSON.stringify([' | 5 rue Sans-Nom |  | 33000 | Bordeaux', 'Institut d’Études Politiques de Bordeaux | 11 allée Ausone | Bâtiment B | 33607 | Pessac'])
        && JSON.stringify(r.betaLabels) === JSON.stringify(['5 rue Sans-Nom', 'Institut d’Études Politiques de Bordeaux'])
        && JSON.stringify(r.line2) === JSON.stringify([' | Gradignan', 'Bâtiment B | Pessac']) && JSON.stringify(r.line2Labels) === JSON.stringify(['Gradignan', 'Bâtiment B']);
      return { pass, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'listsplit_the_list_column_itself_and_its_paths_are_one_list_and_two_lists_are_a_product',
    description: 'La colonne Liste de références elle-même (#Projets.Partenaires) et les chemins qui la traversent forment une seule liste ; deux listes de références différentes (Partenaires et Autres) font toujours un document par combinaison (2 × 2 : la ligne de « Autres » sans nom n’écrit rien dans sa seule variable, comme avant) ; une seule variable cochée sur une liste de références garde ses documents d’avant (un par valeur écrite) ; une ligne sans partenaire garde son document.',
    run: async (h) => {
      await seedRefs(h);
      const rows = await GristAPI.fetchTableRows(PROJ);
      const mixed = await documentsOf(`<p>${refBadge('Partenaires', PER)} ${refBadge('Partenaires.Ville', PER)}</p>`, rows[0]);
      const product = await documentsOf(`<p>${refBadge('Partenaires.Nom_complet', PER)} ${refBadge('Autres.Nom_complet', PER)}</p>`, rows[0]);
      const alone = await documentsOf(`<p>${refBadge('Partenaires.Nom_complet', PER)}</p>`, rows[1]);
      const none = await documentsOf(addressOf('Partenaires'), rows[2]);
      const r = { mixed: mixed.texts, mixedGroups: mixed.plan.groups.length, product: [product.plan.groups.length, product.plan.variants.length, labelsOf(product.plan)], alone: labelsOf(alone.plan), none: [none.plan.variants.length, none.plan.groups.length] };
      const pass = r.mixedGroups === 1 && JSON.stringify(r.mixed) === JSON.stringify(['Bordeaux Sciences Agro | Gradignan', 'Institut d’Études Politiques de Bordeaux | Pessac'])
        && r.product[0] === 2 && r.product[1] === 4 && r.product[2][0] === 'Bordeaux Sciences Agro - Université de Bordeaux'
        && JSON.stringify(r.alone) === JSON.stringify(['Institut d’Études Politiques de Bordeaux']) && JSON.stringify(r.none) === '[1,1]';
      return { pass, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'listsplit_single_pdf_export_of_a_project_is_one_pdf_per_partner_not_one_per_combination',
    description: '« Exporter en PDF » d’un projet dont les cinq variables d’adresse lisent la même liste de références : une archive de deux PDF, un par partenaire, nommés d’après son nom, chacun avec l’adresse de SON partenaire (« Bâtiment B » dans le seul second) - pas les 32 PDF du produit des cinq listes.',
    run: async (h) => {
      await seedRefs(h);
      window.__gristStub.fireRecord({ id: 1, Titre: 'Alpha', Partenaires: ['Bordeaux Sciences Agro', 'Institut d’Études Politiques de Bordeaux'] }, PROJ);
      await h.sleep(60);
      Editor.setHTML(`<p>Projet ${refBadge('Titre')} : ${FIELDS.map(f => refBadge('Partenaires.' + f, PER)).join(' / ')}</p>`);
      Editor.setHeaderFooterData(NO_HF);
      await h.sleep(80);
      const exported = await withFilenameTemplate('#' + PROJ + '.Titre', () => clickAndCapturePdf(h, 'btn-export-pdf'));
      const zipBlob = exported.blobs.find(b => b && /zip/i.test(b.type || ''));
      const { zip, names } = zipBlob ? await zipEntries(zipBlob) : { zip: null, names: [] };
      const texts = {};
      for (const n of names) texts[n] = squash((await pdfPageTexts(h, await zip.file(n).async('blob'))).join(' '));
      const first = names.find(n => /Bordeaux Sciences Agro/.test(n));
      const second = names.find(n => /Institut/.test(n));
      const pass = names.length === 2 && !!first && !!second
        && texts[first] === squash('ProjetAlpha:BordeauxSciencesAgro/1coursduGénéraldeGaulle//33170/Gradignan')
        && texts[second] === squash('ProjetAlpha:Institut d’ÉtudesPolitiquesdeBordeaux/11alléeAusone/BâtimentB/33607/Pessac');
      return { pass, notes: JSON.stringify({ names, texts }) };
    },
  });

  cases.push({
    id: 'listsplit_a_row_pick_writes_the_row_of_the_list_with_its_empty_ones_and_the_other_settings_are_unchanged',
    description: 'Le réglage « une ligne de la liste » (list.row, posé seulement par l’export) écrit la valeur de la k-ième ligne de la liste de références, vide comprise ; sans lui « La n-ième » saute toujours les vides, et les valeurs d’une Liste de choix restent découpées une par une (les cas d’avant n’ont pas changé).',
    run: async (h) => {
      await seedRefs(h);
      const rows = await GristAPI.fetchTableRows(PROJ);
      const one = async (path, list) => Variables.resolveVariable(PROJ, path, PROJ, rows[0], { list });
      const r = {
        rowEmpty: await one('Partenaires.ligne_2', { pick: 'nth', index: 1, row: true }),
        rowFilled: await one('Partenaires.ligne_2', { pick: 'nth', index: 2, row: true }),
        rowBeyond: await one('Partenaires.ligne_2', { pick: 'nth', index: 3, row: true }),
        plainNth: await one('Partenaires.ligne_2', { pick: 'nth', index: 1 }),
        listOf: [Variables.rowListOf(PROJ, 'Partenaires'), Variables.rowListOf(PROJ, 'Partenaires.Ville'), Variables.rowListOf(PROJ, 'Titre'), Variables.rowListOf(PROJ, 'Titre.Foo')],
      };
      const pass = r.rowEmpty === '' && r.rowFilled === 'Bâtiment B' && r.rowBeyond === '' && r.plainNth === 'Bâtiment B' && JSON.stringify(r.listOf) === JSON.stringify(['Partenaires', 'Partenaires', '', '']);
      return { pass, notes: JSON.stringify(r) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.listSplit = cases;
})();
