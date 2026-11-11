// Suite "pdfArchive" - le type d'export « PDF/A (archivage) » (js/pdf-archive.js, js/pdf-export.js : `docFields.archive`, `archived` ; js/main-export.js : `pdfArchive`, `pdfArchiveZip`, `pdfArchiveMerged` ; demande
// d'Antoine du 11/11, carte « Ajouter un type d'export PDF/A pour archiver tes factures ? » : « Oui, un type PDF/A »). Le PDF que pdfmake écrit est passé en PDF/A-2b (ISO 19005-2, niveau B) après sa mise en page :
// la description XMP du document (`pdfaid:part` 2, `pdfaid:conformance` B, titre, producteur, dates), l'intention de rendu sRGB (OutputIntent GTS_PDFA1 et son profil ICC) et l'identifiant du fichier au trailer.
// Ce que la suite garde :
//  1) le menu : la ligne « PDF/A (archivage) » (« PDF/A (archiving) » en anglais) sous « PDF protégé » ; la qualité, la destination et « Joindre à la ligne » y sont montrées ; « Impression navigateur » et
//     « Assemblage avant impression » y sont grisées avec leur raison, « un seul PDF » reste active ; le PDF protégé garde ses deux grisés ;
//  2) l'export d'une ligne : le fichier porte la description PDF/A-2b, le même texte qu'un PDF ordinaire, et un PDF ordinaire n'en porte aucune ;
//  3) le lot ZIP : chacun des PDF est en PDF/A ; le PDF unique : un seul fichier réuni, converti une fois (une description, une intention de rendu), les lignes à la suite ;
//  4) le fichier rangé dans GFS ou joint à la ligne est le PDF converti ; un PDF protégé n'est pas touché ;
//  5) la conversion elle-même (PdfArchive.convert) : un titre qui porte des signes interdits en XML reste un XMP lisible, un PDF assemblé sans identifiant en reçoit un, un PDF chiffré est refusé,
//     deux conversions de suite ne doublent rien.
// La conformité est mesurée avec veraPDF (dev-tests/verify-pdf-archive.mjs, quand Java et ses bibliothèques sont là).
(function () {
  const cases = [];
  const TABLE = 'PbArchive';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TYPE_FLYOUT = '#v2-quality-flyout';
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const el = id => document.getElementById(id);
  const typeRow = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]');
  const qualityRow = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]');
  const linesRow = lines => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]');
  const greyed = row => row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === 'true';
  const live = row => !row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === null;
  const shown = node => node.closest('[hidden]') === null;
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  const squash = text => String(text).replace(/\s+/g, '');
  const latin1 = async blob => new TextDecoder('latin1').decode(await blob.arrayBuffer());

  async function seed(h, html) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(html || `<h1>Facture</h1><p>Bonjour ${badge('Nom')}, voici votre facture.</p><ul><li>Stylo</li><li>Cahier</li></ul>`);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
  }
  // Le type, la qualité et les lignes choisis par un vrai clic sur la ligne du menu, comme la personne ; reset() remet le menu d'avant (PDF vectoriel, une seule ligne).
  const pick = async row => { row.click(); await sleep(20); };
  async function reset() {
    el('v2-export-type').value = 'pdf'; el('v2-pdf-quality').value = 'native'; el('v2-export-lines').value = 'one';
    await pick(typeRow('pdf')); await pick(qualityRow('native')); await pick(linesRow('one'));
  }

  // Ce que dit un PDF de sa conformité, lu avec pdf-lib (celui de l'app) : la description XMP (texte, sans filtre), l'intention de rendu et son profil, l'identifiant du trailer, le titre et le producteur du
  // dictionnaire d'informations, le nombre de pages.
  async function inspect(blob) {
    await PdfMerge.ensureLibLoaded();
    const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFDict, decodePDFRawStream } = window.PDFLib;
    const doc = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
    const catalog = doc.catalog;
    const metadata = catalog.lookupMaybe(PDFName.of('Metadata'), PDFRawStream);
    const xmp = metadata ? new TextDecoder().decode(metadata.contents) : null;
    const parsed = xmp ? new DOMParser().parseFromString(xmp.replace(/<\?xpacket[^>]*\?>/g, ''), 'application/xml') : null;
    const textOf = (ns, name) => { const found = parsed && parsed.getElementsByTagNameNS(ns, name)[0]; return found ? found.textContent : null; };
    const intents = catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
    const intent = intents && intents.size() ? intents.lookupMaybe(0, PDFDict) : null;
    const profile = intent && intent.lookupMaybe(PDFName.of('DestOutputProfile'), PDFRawStream);
    return {
      pages: doc.getPageCount(),
      hasXmp: !!xmp,
      xmpFiltered: !!metadata && metadata.dict.has(PDFName.of('Filter')),
      xmpWellFormed: !!parsed && !parsed.getElementsByTagName('parsererror').length,
      part: textOf('http://www.aiim.org/pdfa/ns/id/', 'part'),
      conformance: textOf('http://www.aiim.org/pdfa/ns/id/', 'conformance'),
      xmpTitle: textOf('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'li'),
      xmpProducer: textOf('http://ns.adobe.com/pdf/1.3/', 'Producer'),
      intents: intents ? intents.size() : 0,
      intentKind: intent ? String(intent.lookup(PDFName.of('S'))) : null,
      profileComponents: profile ? String(profile.dict.lookup(PDFName.of('N'))) : null,
      profileBytes: profile ? decodePDFRawStream(profile).decode().length : 0,
      fileId: !!doc.context.trailerInfo.ID,
      title: doc.getTitle(),
      producer: doc.getProducer(),
    };
  }
  const isPdfA2b = i => i.hasXmp && i.part === '2' && i.conformance === 'B' && i.xmpWellFormed && !i.xmpFiltered && i.intents === 1 && i.intentKind === '/GTS_PDFA1' && i.profileComponents === '3' && i.profileBytes === 3024 && i.fileId;

  // Le texte de chaque page, relu par pdf.js dans les octets du PDF.
  async function pageTexts(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const texts = [];
    for (let n = 1; n <= pdf.numPages; n++) texts.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join(' '));
    return texts;
  }

  // Le bouton Exporter, cliqué : le <a download> est intercepté (le fichier est gardé) et les confirmations sont acceptées.
  async function clickExport(h) {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: () => true });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      el('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(50);
    } finally {
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, status: el('status-msg').textContent };
  }

  cases.push({
    id: 'pdfarchive_menu_type_row_and_greyed_lines',
    description: 'Le menu « Type d\'export » a la ligne « PDF/A (archivage) » (« PDF/A (archiving) » en anglais) ; la qualité, la destination et « Joindre à la ligne » y sont montrées ; « Impression navigateur » et « Assemblage avant impression » y sont grisées avec leur raison, « un seul PDF » reste active ; le PDF protégé garde ses deux grisés',
    run: async (h) => {
      await seed(h);
      await reset();
      const problems = [];
      const row = typeRow('pdfArchive');
      if (!row) return verdict(['la ligne « pdfArchive » manque au menu Type d\'export'], {});
      const names = {};
      const before = I18n.getLang();
      try { ['fr', 'en'].forEach(lang => { I18n.setLang(lang); names[lang] = I18n.t('exportType.pdfArchive'); }); } finally { I18n.setLang(before); }
      if (names.fr !== 'PDF/A (archivage)' || names.en !== 'PDF/A (archiving)') problems.push('noms : ' + JSON.stringify(names));
      const rows = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row[data-export-type]')).map(r => r.dataset.exportType).slice(0, 3).join();
      if (rows !== 'pdf,pdfProtected,pdfArchive') problems.push('ordre des trois premiers types : ' + rows);
      if (!live(row)) problems.push('la ligne est grisée dans un document');
      await pick(qualityRow('browser-print'));
      await pick(row);
      if (el('v2-export-type').value !== 'pdfArchive') problems.push('le clic n\'a pas choisi le type : ' + el('v2-export-type').value);
      if (!row.classList.contains('is-active')) problems.push('la ligne du type choisi n\'est pas active');
      const quality = ['native', 'browser-print', 'light'].map(q => qualityRow(q));
      if (!quality.every(shown)) problems.push('les trois lignes de qualité ne sont pas montrées');
      if (!greyed(quality[1]) || !quality[1].dataset.exportGreyFor.split(' ').includes('pdfArchive')) problems.push('« Impression navigateur » n\'est pas grisée en PDF/A');
      if (!quality[0].classList.contains('is-active') || quality[1].classList.contains('is-active')) problems.push('la qualité active n\'est pas « Vectoriel » alors que l\'impression est choisie');
      if (!live(quality[0]) || !live(quality[2])) problems.push('« Vectoriel » ou « Léger » est grisée en PDF/A');
      const archiveOff = I18n.t('quality.archiveOff');
      if (!/PDF\/A/.test(archiveOff) || archiveOff === 'quality.archiveOff') problems.push('la raison de l\'impression navigateur : ' + archiveOff);
      const lines = ['one', 'zip', 'merged', 'sheets'].map(l => linesRow(l));
      if (!lines.every(shown)) problems.push('les quatre options de lignes ne sont pas montrées en PDF/A');
      if (!live(lines[0]) || !live(lines[1]) || !live(lines[2])) problems.push('« une ligne », « ZIP » ou « un seul PDF » est grisée en PDF/A');
      if (!greyed(lines[3])) problems.push('« Assemblage avant impression » n\'est pas grisée en PDF/A');
      if (lines[3].getAttribute('data-export-grey-for').split(' ').includes('pdfArchive') === false) problems.push('data-export-grey-for de la planche ne nomme pas pdfArchive');
      const destination = Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' [data-destination]')).every(shown);
      if (!destination || !shown(el('v2-export-attach'))) problems.push('la destination ou « Joindre à la ligne » n\'est pas montrée en PDF/A');
      // Le PDF protégé n'a pas changé : l'impression, la planche et le PDF unique y restent grisés.
      await pick(typeRow('pdfProtected'));
      if (!greyed(qualityRow('browser-print')) || !greyed(linesRow('sheets')) || !greyed(linesRow('merged'))) problems.push('le PDF protégé a perdu un de ses trois grisés');
      // Une option que le type n'a pas retombe sur « ZIP » : la planche choisie dans le PDF reste cochée en PDF, et le PDF/A ne la lance pas.
      await pick(typeRow('pdf'));
      await pick(linesRow('sheets'));
      await pick(typeRow('pdfArchive'));
      const ticked = Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines][aria-checked="true"]')).map(r => r.dataset.exportLines).join();
      if (ticked !== 'zip') problems.push('la planche choisie en PDF devrait retomber sur « zip » en PDF/A : ' + ticked);
      // Un modèle Grille ne sait pas faire un PDF/A ? Si : le PDF est un PDF, grille ou document.
      await reset();
      return verdict(problems, { names, rows });
    },
  });

  cases.push({
    id: 'pdfarchive_single_export_is_pdfa2b_and_plain_pdf_is_not',
    description: 'Le bouton Exporter en « PDF/A (archivage) » : le fichier porte la description XMP PDF/A-2b et l\'intention de rendu sRGB, garde le texte du document ; le même export en PDF ordinaire ne porte ni l\'une ni l\'autre (le test échouerait si la conversion ne faisait rien, ou si elle touchait tous les PDF)',
    run: async (h) => {
      await seed(h);
      await reset();
      const problems = [];
      await pick(typeRow('pdfArchive'));
      const res = await clickExport(h);
      await reset();
      if (res.downloads.length !== 1) return verdict(['téléchargements : ' + res.downloads.length + ' (' + res.status + ')'], {});
      const file = res.downloads[0];
      if (!/\.pdf$/.test(file.name)) problems.push('nom du fichier : ' + file.name);
      const info = await inspect(file.blob);
      if (!isPdfA2b(info)) problems.push('le fichier n\'est pas du PDF/A-2b : ' + JSON.stringify(info));
      if (info.producer !== info.xmpProducer) problems.push('le producteur du dictionnaire (' + info.producer + ') et celui du XMP (' + info.xmpProducer + ') diffèrent');
      if (info.title !== info.xmpTitle) problems.push('le titre du dictionnaire (' + info.title + ') et celui du XMP (' + info.xmpTitle + ') diffèrent');
      const text = squash((await pageTexts(h, file.blob)).join(' '));
      if (!text.includes('Facture') || !text.includes('BonjourAlphaDurand') || !text.includes('Stylo')) problems.push('le texte du document a changé : ' + text.slice(0, 120));
      if (!/PDF\/A généré/.test(res.status)) problems.push('le coin d\'état ne dit pas « PDF/A généré » : ' + res.status);
      const plain = await h.exportPdfContent(Editor.getHTML(), NO_HF, undefined, { tableId: TABLE, record: { id: 1, Nom: NAMES[0] } });
      const plainInfo = await inspect(plain.blob);
      if (plainInfo.hasXmp || plainInfo.intents !== 0) problems.push('un PDF ordinaire porte une description PDF/A : ' + JSON.stringify(plainInfo));
      return verdict(problems, { size: file.blob.size, plainSize: plain.blob.size, info });
    },
  });

  cases.push({
    id: 'pdfarchive_zip_converts_every_pdf',
    description: '« PDF/A (archivage) » en « Toutes les lignes (ZIP) » : l\'archive s\'appelle -export-pdfa.zip et porte un PDF par ligne, chacun en PDF/A-2b avec le texte de sa ligne',
    run: async (h) => {
      await seed(h);
      await reset();
      const problems = [];
      await pick(typeRow('pdfArchive'));
      await pick(linesRow('zip'));
      const res = await clickExport(h);
      await reset();
      if (res.downloads.length !== 1) return verdict(['téléchargements : ' + res.downloads.length + ' (' + res.status + ')'], {});
      const file = res.downloads[0];
      if (file.name !== TABLE + '-export-pdfa.zip') problems.push('nom de l\'archive : ' + file.name);
      const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
      if (names.length !== NAMES.length || !names.every(n => /\.pdf$/.test(n))) problems.push('contenu de l\'archive : ' + names.join());
      const verdicts = [];
      for (const name of names) {
        const blob = new Blob([await zip.files[name].async('arraybuffer')], { type: 'application/pdf' });
        const info = await inspect(blob);
        verdicts.push(isPdfA2b(info));
        if (!isPdfA2b(info)) problems.push(name + ' n\'est pas du PDF/A-2b : ' + JSON.stringify(info));
        const text = squash((await pageTexts(h, blob)).join(' '));
        if (!NAMES.some(n => text.includes(squash('Bonjour ' + n)))) problems.push(name + ' : le texte de sa ligne manque : ' + text.slice(0, 100));
      }
      if (!/PDF\/A.*ZIP/.test(res.status)) problems.push('le coin d\'état : ' + res.status);
      return verdict(problems, { names, verdicts });
    },
  });

  cases.push({
    id: 'pdfarchive_merged_is_one_file_converted_once',
    description: '« PDF/A (archivage) » en « un seul PDF » : un fichier -export-pdfa.pdf, une page par ligne dans l\'ordre, converti une seule fois (une description XMP, une intention de rendu) ; le PDF unique ordinaire, lui, reste ordinaire',
    run: async (h) => {
      await seed(h);
      await reset();
      const problems = [];
      await pick(typeRow('pdfArchive'));
      await pick(linesRow('merged'));
      const res = await clickExport(h);
      await pick(typeRow('pdf'));
      await pick(linesRow('merged'));
      const ordinary = await clickExport(h);
      await reset();
      if (res.downloads.length !== 1) return verdict(['téléchargements : ' + res.downloads.length + ' (' + res.status + ')'], {});
      const file = res.downloads[0];
      if (file.name !== TABLE + '-export-pdfa.pdf') problems.push('nom du fichier : ' + file.name);
      const info = await inspect(file.blob);
      if (!isPdfA2b(info)) problems.push('le PDF unique n\'est pas du PDF/A-2b : ' + JSON.stringify(info));
      if (info.pages !== NAMES.length) problems.push('pages : ' + info.pages + ' au lieu de ' + NAMES.length);
      const raw = await latin1(file.blob);
      if ((raw.match(/<pdfaid:part>/g) || []).length !== 1 || (raw.match(/GTS_PDFA1/g) || []).length !== 1) problems.push('la description ou l\'intention de rendu est écrite plus d\'une fois');
      const texts = await pageTexts(h, file.blob);
      NAMES.forEach((name, i) => { if (!squash(texts[i] || '').includes(squash('Bonjour ' + name))) problems.push('page ' + (i + 1) + ' : « Bonjour ' + name + ' » manque (' + (texts[i] || '').slice(0, 60) + ')'); });
      if (!/PDF\/A/.test(res.status)) problems.push('le coin d\'état : ' + res.status);
      if (ordinary.downloads.length !== 1 || ordinary.downloads[0].name !== TABLE + '-export.pdf') problems.push('le PDF unique ordinaire : ' + JSON.stringify(ordinary.downloads.map(d => d.name)));
      else if ((await inspect(ordinary.downloads[0].blob)).hasXmp) problems.push('le PDF unique ordinaire porte une description PDF/A');
      return verdict(problems, { info, pages: texts.length });
    },
  });

  cases.push({
    id: 'pdfarchive_shelved_or_attached_file_is_the_converted_pdf',
    description: 'Ce que l\'export remet à la livraison (GFS, « Joindre à la ligne ») est le PDF converti, pas celui de pdfmake ; un PDF protégé, lui, reste chiffré et sans description PDF/A',
    run: async (h) => {
      await seed(h);
      await reset();
      const problems = [];
      const orig = { plan: PdfDelivery.plan, deliver: PdfDelivery.deliver, keep: PdfDelivery.keep };
      const received = [];
      PdfDelivery.plan = () => ({ download: false, shelve: true, attach: false });
      PdfDelivery.deliver = async files => { received.push(...files); return { delivered: new Set(files.map((_, i) => i)), downloaded: false, shelved: true }; };
      PdfDelivery.keep = () => {};
      const dialogs = h.stubDialogs({ confirm: () => true });
      try {
        const record = { id: 1, Nom: NAMES[0] };
        const run = docFields => PdfExport.exportCurrentRecord(Editor.getHTML(), TABLE, record, '', NO_HF, PageLayout.getMarginsPt(), undefined, undefined, docFields);
        await run({ archive: true });
        await run(undefined);
        await run(PdfProtection.docFields({ mode: 'typed', password: 'stub-token-secret' }));
      } finally {
        dialogs.restore();
        Object.assign(PdfDelivery, orig);
      }
      if (received.length !== 3) return verdict(['fichiers remis à la livraison : ' + received.length], {});
      const [archived, ordinary, protectedFile] = received;
      const info = await inspect(archived.blob);
      if (!isPdfA2b(info)) problems.push('le fichier remis à la livraison n\'est pas du PDF/A-2b : ' + JSON.stringify(info));
      if (archived.rowId !== 1) problems.push('la ligne du fichier : ' + archived.rowId);
      if ((await inspect(ordinary.blob)).hasXmp) problems.push('un PDF ordinaire remis à la livraison porte une description PDF/A');
      const raw = await latin1(protectedFile.blob);
      if (!/\/Encrypt/.test(raw) || /GTS_PDFA1|pdfaid/.test(raw)) problems.push('le PDF protégé n\'est plus chiffré tel quel, ou porte une description PDF/A');
      return verdict(problems, { info });
    },
  });

  cases.push({
    id: 'pdfarchive_convert_details',
    description: 'PdfArchive.convert : un titre qui porte des signes interdits en XML (< & " \' et un caractère de contrôle) reste un XMP lisible et égal au titre du dictionnaire ; un PDF assemblé par pdf-lib (sans identifiant) en reçoit un ; deux conversions de suite ne doublent ni la description ni l\'intention de rendu ; un PDF chiffré est refusé',
    run: async (h) => {
      await seed(h);
      const problems = [];
      await PdfExport.ensurePdfLibsLoaded();
      await PdfMerge.ensureLibLoaded();
      // Un PDF réuni par pdf-lib : pas d'identifiant au trailer, pas de description.
      const merged = await PdfMerge.create('Facture <A&B> "x" \'y\'\u0001 fin');
      const one = await PdfExport.getNativePdfBlobForRecord('<p>Un</p>', null, {}, '', NO_HF, PageLayout.getMarginsPt());
      await merged.append(one.blob);
      const rough = await merged.toBlob();
      const roughInfo = await inspect(rough);
      if (roughInfo.fileId || roughInfo.hasXmp) problems.push('le PDF de départ n\'est pas brut (identifiant ou XMP déjà là) : ' + JSON.stringify(roughInfo));
      const converted = await PdfArchive.convert(rough);
      const info = await inspect(converted);
      if (!isPdfA2b(info)) problems.push('le PDF réuni converti n\'est pas du PDF/A-2b : ' + JSON.stringify(info));
      if (info.xmpTitle !== 'Facture <A&B> "x" \'y\' fin') problems.push('titre du XMP : ' + JSON.stringify(info.xmpTitle));
      const twice = await PdfArchive.convert(converted);
      const raw = await latin1(twice);
      if ((raw.match(/<pdfaid:part>/g) || []).length !== 1 || (raw.match(/GTS_PDFA1/g) || []).length !== 1) problems.push('deux conversions de suite ont doublé la description ou l\'intention de rendu');
      if (!isPdfA2b(await inspect(twice))) problems.push('la seconde conversion n\'est plus du PDF/A-2b');
      // Un PDF chiffré : refusé, jamais livré sans chiffrement.
      const encrypted = await PdfExport.getNativePdfBlobForRecord('<p>Secret</p>', null, {}, '', NO_HF, PageLayout.getMarginsPt(), undefined, undefined, PdfProtection.docFields({ mode: 'typed', password: 'stub-token-secret' }));
      let refused = null;
      try { await PdfArchive.convert(encrypted.blob); } catch (e) { refused = e; }
      if (!refused) problems.push('un PDF chiffré a été converti');
      return verdict(problems, { title: info.xmpTitle, refused: refused && refused.message });
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfArchive = cases;
})();
