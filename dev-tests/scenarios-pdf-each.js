// Suite "pdfEach" - « PDF en plusieurs fichiers » (demande d'Antoine du 19/11 : « téléchargement PDF quand une liste ou une boucle fait plusieurs destinataires, j'aimerais avoir un settings dans les paramètres pour choisir si je veux un ZIP, ou des PDF un par un »).
// Quand un export PDF fait plusieurs fichiers - toutes les lignes de la vue, ou une ligne que « Un document par valeur » découpe - et qu'ils se téléchargent, la personne choisit dans Réglages > Thème > « PDF en plusieurs fichiers » :
// « Une archive ZIP » (l'origine : ce que l'app a toujours fait), « Des PDF un par un » ou « Me demander à chaque export » (une fenêtre pose la question ; choix d'Antoine sur la carte du 19/11) (js/pdf-delivery.js : manyFiles / chooseMany, clé `pp_export_pdf_many`, un pas d'Annuler comme les autres réglages). Ce que la suite garde :
//  1) le choix : l'archive tant que la personne n'a rien choisi, le choix gardé par PersonStore, une valeur étrangère vaut l'origine, un choix hors des deux n'écrit rien ;
//  2) l'onglet : la section est dans Thème (la barre des onglets est pleine à 700 px), deux cases, l'archive cochée au départ, un clic garde le choix, en français comme en anglais ;
//  2 bis) « Me demander » : la fenêtre (deux boutons et Annuler) tient lieu de confirmation pour toutes les lignes et pour une ligne de plus de 50 documents, se pose à part après le mot de passe d'un PDF protégé, ne se pose pas pour un seul PDF, le PDF unique,
//     Word ni quand rien ne se télécharge ; « un par un » et « Me demander » ne parlent plus d'archive dans la confirmation et la fenêtre du PDF protégé ;
//  3) les VRAIS exports de toutes les lignes (ligne de menu cliquée, fichiers interceptés) : « ZIP » ne change rien (une archive de trois PDF, ses phrases d'avant) ; « un par un » télécharge trois vrais PDF sous les noms des entrées de l'archive, dit où
//     il en est, date les lignes, et les autres formats gardent leur archive, le PDF unique son fichier ;
//  4) les phrases de fin, en français et en anglais, pour les trois sortes de PDF en archive (PDF, PDF protégé, PDF/A) et leurs échecs.
// Le même choix pour une ligne découpée par « Un document par valeur » est dans scenarios-list-split.js ; avec GFS (ranger, ranger et télécharger, un PDF refusé) dans scenarios-pdf-shelve.js ; Ctrl + Z dans scenarios-undo-settings.js.
(function () {
  const cases = [];
  const TABLE = 'PeClients';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const KEY = 'pp_export_pdf_many';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const gristStub = () => window.__gristStub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;

  function finish() {
    PersonStore.remove(KEY);
    I18n.setLang('fr');
    byId('settings-modal').style.display = 'none';
  }

  // --- 1) le choix ---
  cases.push({
    id: 'pdfeach_the_choice_is_the_archive_until_chosen_and_follows_the_stored_choice',
    description: 'Sans choix gardé, les PDF en plusieurs fichiers viennent en archive ZIP (l’origine) ; le choix « un par un » est gardé par PersonStore sous pp_export_pdf_many ; une valeur étrangère gardée vaut l’origine et un choix hors des deux n’écrit rien',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      PersonStore.remove(KEY);
      check(problems, 'au départ : l’archive, rien de gardé', [PdfDelivery.manyFiles(), PersonStore.get(KEY)], ['zip', null]);
      check(problems, 'un par un : écrit et gardé', [PdfDelivery.chooseMany('each'), PersonStore.get(KEY), PdfDelivery.manyFiles()], [true, 'each', 'each']);
      check(problems, 'l’archive : écrite et gardée', [PdfDelivery.chooseMany('zip'), PersonStore.get(KEY), PdfDelivery.manyFiles()], [true, 'zip', 'zip']);
      check(problems, 'me demander : écrit et gardé', [PdfDelivery.chooseMany('ask'), PersonStore.get(KEY), PdfDelivery.manyFiles()], [true, 'ask', 'ask']);
      PdfDelivery.chooseMany('each');
      check(problems, 'un choix hors des trois n’écrit rien', [PdfDelivery.chooseMany('gfs'), PdfDelivery.chooseMany(''), PdfDelivery.chooseMany(undefined), PersonStore.get(KEY)], [false, false, false, 'each']);
      PersonStore.set(KEY, 'zippé');
      check(problems, 'une valeur étrangère gardée vaut l’archive', PdfDelivery.manyFiles(), 'zip');
      check(problems, 'le plan de livraison ne change pas (la destination est un autre réglage)', PdfDelivery.plan(), { download: true, shelve: false, attach: false });
      finish();
      return verdict(problems, {});
    },
  });

  // --- 2) l'onglet ---
  const radio = value => document.querySelector('input[name="settings-pdf-many"][value="' + value + '"]');
  const checkedValue = () => { const found = document.querySelector('input[name="settings-pdf-many"]:checked'); return found ? found.value : null; };
  async function openTheme(h) {
    byId('v2-btn-settings').click();
    await h.sleep(80);
    document.querySelector('.settings-tab[data-settings-tab="theme"]').click();
    await h.sleep(40);
  }
  const sectionOf = () => radio('zip').closest('.settings-section');

  cases.push({
    id: 'pdfeach_settings_section_is_in_the_theme_tab_with_two_boxes_and_a_click_keeps_the_choice',
    description: 'Réglages > Thème a la section « PDF en plusieurs fichiers » (pas un onglet de plus : la barre est pleine à 700 px) : trois cases (ZIP, un par un, me demander), l’archive ZIP cochée au départ, un clic sur « Des PDF un par un » puis sur « Me demander » garde le choix, la fenêtre rouverte le montre, retour à l’archive d’un clic',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      I18n.setLang('fr');
      PersonStore.remove(KEY);
      await openTheme(h);
      const section = sectionOf();
      const themePanel = document.querySelector('.settings-panel[data-settings-panel="theme"]');
      check(problems, 'la section est dans l’onglet Thème, avec son titre et trois cases', [!!section && themePanel.contains(section), section && section.querySelector('.settings-section-title').textContent, section && section.querySelectorAll('input[type="radio"]').length], [true, 'PDF en plusieurs fichiers', 3]);
      check(problems, 'aucun onglet de plus', document.querySelectorAll('.settings-tab').length, 9);
      check(problems, 'les trois cases en français', [radio('zip').nextElementSibling.textContent, radio('each').nextElementSibling.textContent, radio('ask').nextElementSibling.textContent], ['Une archive ZIP', 'Des PDF un par un', 'Me demander à chaque export']);
      check(problems, 'l’archive est cochée au départ', checkedValue(), 'zip');
      radio('each').click();
      await h.sleep(60);
      check(problems, 'un clic garde « un par un »', [checkedValue(), PersonStore.get(KEY), PdfDelivery.manyFiles()], ['each', 'each', 'each']);
      byId('settings-close').click();
      await h.sleep(60);
      await openTheme(h);
      check(problems, 'rouverte, la fenêtre montre « un par un »', checkedValue(), 'each');
      radio('ask').click();
      await h.sleep(60);
      check(problems, 'un clic sur « Me demander » le garde', [checkedValue(), PersonStore.get(KEY), PdfDelivery.manyFiles()], ['ask', 'ask', 'ask']);
      radio('zip').click();
      await h.sleep(60);
      check(problems, 'un clic rend l’archive', [checkedValue(), PersonStore.get(KEY), PdfDelivery.manyFiles()], ['zip', 'zip', 'zip']);
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfeach_settings_section_reads_in_english',
    lang: 'en',
    description: 'La section de Réglages > Thème est traduite : « PDFs in several files », « A ZIP archive », « PDFs one by one », et sa phrase dit que « Save to GFS » range déjà chaque PDF seul',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      PersonStore.remove(KEY);
      await openTheme(h);
      const section = sectionOf();
      check(problems, 'le titre et les deux cases', [section.querySelector('.settings-section-title').textContent, radio('zip').nextElementSibling.textContent, radio('each').nextElementSibling.textContent], ['PDFs in several files', 'A ZIP archive', 'PDFs one by one']);
      check(problems, 'la troisième case', radio('ask').nextElementSibling.textContent, 'Ask me at each export');
      check(problems, 'la phrase nomme la destination « Save to GFS » comme le menu Exporter', section.textContent.indexOf('“Save to GFS”') !== -1 && I18n.t('destination.gfs') === 'Save to GFS', true);
      finish();
      return verdict(problems, {});
    },
  });

  // --- 3) les vrais exports ---
  async function seed(h) {
    await h.resetEditor();
    I18n.setLang('fr');
    gristStub().setVariables(TABLE, { Nom: 'Text' });
    gristStub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    gristStub().fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
  }
  // Clique la VRAIE ligne du menu et attend `until` : les fichiers téléchargés (le <a download> intercepté), les messages d'état de tout l'export, les dates écrites.
  async function runExport(h, rowId, until, options) {
    const o = options || {};
    const downloads = [];
    const stamps = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const origStamp = ExportDate.stamp;
    // `o.choose` : la réponse à la fenêtre « Me demander » (une valeur, ou une fonction de ses options) ; les fenêtres posées sont rendues dans `asked`.
    const dialogs = h.stubDialogs(Object.assign({ confirm: o.confirm || (() => true) }, o.choose === undefined ? {} : { choose: o.choose }));
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return undefined; }
      return origClick.call(this);
    };
    ExportDate.stamp = async (table, ids) => { stamps.push({ table, ids: Array.from(ids) }); return null; };
    const statusEl = byId('status-msg');
    const statuses = [];
    const observer = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      byId(rowId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!until() && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(o.settle === undefined ? 120 : o.settle);
    } finally {
      observer.disconnect();
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
      ExportDate.stamp = origStamp;
    }
    return { downloads, stamps, statuses, asked: dialogs.asked, status: byId('status-msg').textContent, error: byId('status-msg').className };
  }
  const done = pattern => () => pattern.test(byId('status-msg').textContent);
  const head = async blob => String.fromCharCode.apply(null, Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 5)));

  cases.push({
    id: 'pdfeach_all_rows_export_is_one_archive_by_default_and_one_pdf_per_row_when_chosen',
    description: 'Le vrai export de toutes les lignes (PDF) : par défaut UNE archive de trois PDF et sa phrase d’avant ; avec « un par un », trois vrais PDF téléchargés sous les noms des entrées de l’archive, dans l’ordre des lignes, le coin d’état dit « 1/3… » à « 3/3… » puis « 3 PDF générés — téléchargés un par un. », et les trois lignes sont datées',
    run: async (h) => {
      const problems = [];
      await seed(h);
      PersonStore.remove(KEY);
      const zipped = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/), { settle: 400 });
      const entries = zipped.downloads[0] ? Object.keys((await JSZip.loadAsync(await zipped.downloads[0].blob.arrayBuffer())).files) : [];
      check(problems, 'par défaut : une archive de trois PDF, sa phrase', [zipped.downloads.map(d => d.name), entries.length, zipped.status], [[TABLE + '-export-pdf.zip'], 3, '3 PDF générés — archive ZIP téléchargée.']);
      check(problems, 'par défaut : aucune phrase « un par un » pendant l’export', zipped.statuses.filter(s => /un par un/.test(s)), []);
      PdfDelivery.chooseMany('each');
      const each = await runExport(h, 'v2-btn-export-pdf-batch', done(/téléchargés un par un\.$/), { settle: 400 });
      check(problems, 'un par un : trois fichiers, sous les noms des entrées de l’archive, dans l’ordre', each.downloads.map(d => d.name), entries);
      check(problems, 'un par un : aucune archive', each.downloads.some(d => /\.zip$/.test(d.name) || (d.blob && /zip/i.test(d.blob.type || ''))), false);
      check(problems, 'un par un : trois vrais PDF', await Promise.all(each.downloads.map(d => head(d.blob))), ['%PDF-', '%PDF-', '%PDF-']);
      // Sans nom de fichier réglé dans le modèle, les trois portent le nom d'origine : le navigateur n'en écraserait aucun, les noms sont déjà uniques (publipostage.pdf, publipostage (2).pdf…), comme dans l'archive.
      check(problems, 'un par un : trois noms différents', new Set(each.downloads.map(d => d.name)).size, 3);
      check(problems, 'un par un : le coin d’état dit où l’on en est', each.statuses.filter(s => /un par un :/.test(s)), ['Téléchargement des PDF un par un : 1/3…', 'Téléchargement des PDF un par un : 2/3…', 'Téléchargement des PDF un par un : 3/3…']);
      check(problems, 'un par un : la phrase de fin, sans rouge, les lignes datées', [each.status, each.error, each.stamps[0] && each.stamps[0].ids], ['3 PDF générés — téléchargés un par un.', '', [1, 2, 3]]);
      check(problems, 'un par un : « Compression de l’archive » ne s’écrit pas', each.statuses.some(s => /Compression/.test(s)), false);
      PdfDelivery.chooseMany('zip');
      const back = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/), { settle: 400 });
      check(problems, 'revenu à l’archive : une archive', [back.downloads.map(d => d.name), back.status], [[TABLE + '-export-pdf.zip'], '3 PDF générés — archive ZIP téléchargée.']);
      finish();
      return verdict(problems, { entries });
    },
  });

  cases.push({
    id: 'pdfeach_a_batch_of_one_row_downloads_the_pdf_alone_and_says_so',
    description: 'Une seule ligne dans l’export de toutes les lignes : « un par un » donne le PDF seul (« 1 PDF généré — téléchargé seul. »), jamais une archive d’un fichier ; pas de pause ni de « 2/… »',
    run: async (h) => {
      const problems = [];
      await seed(h);
      gristStub().setRows(TABLE, [{ id: 1, Nom: NAMES[0] }]);
      PdfDelivery.chooseMany('each');
      const one = await runExport(h, 'v2-btn-export-pdf-batch', done(/téléchargé seul\.$/), { settle: 300 });
      check(problems, 'un fichier PDF, au nom du modèle', [one.downloads.map(d => d.name), one.downloads[0] ? await head(one.downloads[0].blob) : ''], [['publipostage.pdf'], '%PDF-']);
      check(problems, 'la phrase de fin', one.status, '1 PDF généré — téléchargé seul.');
      finish();
      gristStub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfeach_the_choice_does_not_touch_word_the_single_pdf_or_the_sheets',
    description: 'Avec « un par un » choisi : l’export Word de toutes les lignes reste une archive ZIP, le PDF réuni reste UN fichier ; le choix ne vaut que pour les PDF qui se téléchargent en archive',
    run: async (h) => {
      const problems = [];
      await seed(h);
      PdfDelivery.chooseMany('each');
      const docx = await runExport(h, 'v2-btn-export-docx-batch', done(/archive ZIP téléchargée\.$/), { settle: 300 });
      check(problems, 'Word : une archive', [docx.downloads.map(d => d.name), docx.status, docx.statuses.filter(s => /un par un/.test(s))], [[TABLE + '-export-docx.zip'], '3 DOCX générés — archive ZIP téléchargée.', []]);
      const merged = await runExport(h, 'v2-btn-export-pdf-merged', done(/en un seul fichier|PDF.*généré|fusion|réuni/i), { settle: 2500 });
      check(problems, 'PDF réuni : un seul fichier PDF', [merged.downloads.map(d => d.name), merged.downloads[0] ? await head(merged.downloads[0].blob) : '', merged.statuses.filter(s => /un par un/.test(s))], [[TABLE + '-export.pdf'], '%PDF-', []]);
      finish();
      return verdict(problems, {});
    },
  });

  // --- 3 bis) « Me demander » ---
  const chooses = res => res.asked.filter(d => d.kind === 'choose');
  const confirms = res => res.asked.filter(d => d.kind === 'confirm');

  cases.push({
    id: 'pdfeach_ask_puts_the_question_in_place_of_the_zip_confirmation_and_follows_the_answer',
    description: 'Avec « Me demander » : l’export de toutes les lignes ouvre UNE fenêtre à la place de la confirmation « … dans une archive ZIP ? » (« Générer 3 PDF pour chacune des 3 lignes de « table ». Comment les recevoir ? », boutons « Une archive ZIP » (principal), « Des PDF un par un »), « Des PDF un par un » télécharge trois PDF seuls, « Une archive ZIP » une archive, Annuler ne génère ni ne télécharge rien',
    run: async (h) => {
      const problems = [];
      await seed(h);
      PdfDelivery.chooseMany('ask');
      const each = await runExport(h, 'v2-btn-export-pdf-batch', done(/téléchargés un par un\.$/), { settle: 400, choose: () => 'each' });
      const question = chooses(each)[0];
      check(problems, 'une seule fenêtre « choose », aucune confirmation en plus', [chooses(each).length, confirms(each).length], [1, 0]);
      check(problems, 'la fenêtre : titre, phrase, boutons', question && [question.title, question.message.split('\n')[0], question.choices.map(c => [c.value, c.label, !!c.primary])], ['Exporter les lignes', 'Générer 3 PDF pour chacune des 3 lignes de « ' + TABLE + ' ». Comment les recevoir ?', [['zip', 'Une archive ZIP', true], ['each', 'Des PDF un par un', false]]]);
      check(problems, 'la fenêtre ne parle pas d’archive dans sa phrase, et dit où arrêter de la poser', question && [/archive/i.test(question.message.split('\n')[0]), /Réglages > Thème > PDF en plusieurs fichiers/.test(question.message)], [false, true]);
      check(problems, '« un par un » : trois PDF seuls, la phrase de fin', [each.downloads.length, each.downloads.some(d => /\.zip$/.test(d.name)), each.status], [3, false, '3 PDF générés — téléchargés un par un.']);
      const zipped = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/), { settle: 400, choose: () => 'zip' });
      check(problems, '« Une archive ZIP » : une archive de trois PDF', [chooses(zipped).length, zipped.downloads.map(d => d.name), zipped.status], [1, [TABLE + '-export-pdf.zip'], '3 PDF générés — archive ZIP téléchargée.']);
      check(problems, 'la réponse ne change pas le réglage gardé', PdfDelivery.manyFiles(), 'ask');
      const cancelled = await runExport(h, 'v2-btn-export-pdf-batch', () => true, { settle: 1500, choose: () => null });
      check(problems, 'Annuler : rien n’est généré ni téléchargé, pas d’erreur', [chooses(cancelled).length, cancelled.downloads.length, cancelled.stamps.length, cancelled.error], [1, 0, 0, '']);
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfeach_ask_is_not_asked_when_there_is_nothing_to_choose',
    description: 'Avec « Me demander » : un seul document (une ligne), l’export Word, le PDF réuni ne posent pas la question (leur confirmation d’avant reste) ; une seule ligne donne l’archive d’un PDF comme avant',
    run: async (h) => {
      const problems = [];
      await seed(h);
      PdfDelivery.chooseMany('ask');
      gristStub().setRows(TABLE, [{ id: 1, Nom: NAMES[0] }]);
      const one = await runExport(h, 'v2-btn-export-pdf-batch', done(/archive ZIP téléchargée\.$/), { settle: 300 });
      check(problems, 'une seule ligne : pas de question, la confirmation d’avant, l’archive', [chooses(one).length, confirms(one).length, one.downloads.map(d => d.name), one.status], [0, 1, [TABLE + '-export-pdf.zip'], '1 PDF généré — archive ZIP téléchargée.']);
      gristStub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
      const docx = await runExport(h, 'v2-btn-export-docx-batch', done(/archive ZIP téléchargée\.$/), { settle: 300 });
      check(problems, 'Word : pas de question, une archive', [chooses(docx).length, confirms(docx).length, docx.downloads.map(d => d.name)], [0, 1, [TABLE + '-export-docx.zip']]);
      const merged = await runExport(h, 'v2-btn-export-pdf-merged', () => true, { settle: 3000 });
      check(problems, 'PDF réuni : pas de question, un seul fichier', [chooses(merged).length, merged.downloads.map(d => d.name)], [0, [TABLE + '-export.pdf']]);
      finish();
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'pdfeach_the_confirmation_and_the_protected_window_stop_talking_about_a_zip_archive',
    description: 'Avec « Des PDF un par un » : la confirmation de l’export de toutes les lignes dit « les télécharger un par un » (pas « dans une archive ZIP ») ; la fenêtre du PDF protégé ne parle plus de ZIP ni avec « Me demander » ; avec l’archive, rien ne change dans les deux phrases',
    run: async (h) => {
      const problems = [];
      await seed(h);
      const confirmText = async value => {
        PdfDelivery.chooseMany(value);
        const res = await runExport(h, 'v2-btn-export-pdf-batch', () => true, { settle: 1200, confirm: () => false });
        return confirms(res)[0] ? confirms(res)[0].message : null;
      };
      const zipText = await confirmText('zip');
      check(problems, 'archive : la phrase d’avant', zipText, 'Générer un PDF pour chacune des 3 lignes de « ' + TABLE + ' » et les regrouper dans une archive ZIP ?');
      const eachText = await confirmText('each');
      check(problems, 'un par un : la phrase sans archive', eachText, 'Générer un PDF pour chacune des 3 lignes de « ' + TABLE + ' » et les télécharger un par un ?');
      I18n.setLang('fr');
      const intro = value => { PdfDelivery.chooseMany(value); return I18n.t('pdfProtect.batch' + (PdfDelivery.manyFiles() === 'zip' ? '' : 'Files'), { count: 3, table: TABLE }); };
      check(problems, 'PDF protégé, archive : la phrase d’avant', intro('zip'), '3 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.');
      check(problems, 'PDF protégé, un par un ou me demander : sans archive', [intro('each'), intro('ask')], ['3 PDF protégés pour « ' + TABLE + ' », avec le même mot de passe et les mêmes autorisations.', '3 PDF protégés pour « ' + TABLE + ' », avec le même mot de passe et les mêmes autorisations.']);
      // La vraie fenêtre : le texte d'accueil d'un lot (#pp-protect-intro, écrit par introText), avec et sans `files`.
      const introOf = async context => {
        const pending = PdfProtectionDialog.open(Object.assign({ batch: true, count: 3, table: TABLE }, context));
        const modal = () => byId('pp-protect-modal');
        for (let i = 0; i < 100 && !(modal() && getComputedStyle(modal()).display !== 'none'); i++) await sleep(40);
        const text = byId('pp-protect-intro').textContent;
        modal().querySelector('.pp-modal-actions button:not(.var-modal-primary)').click();
        await pending;
        return text;
      };
      check(problems, 'la vraie fenêtre : avec l’archive, puis sans archive', [await introOf({}), await introOf({ files: true })], ['3 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.', '3 PDF protégés pour « ' + TABLE + ' », avec le même mot de passe et les mêmes autorisations.']);
      finish();
      return verdict(problems, {});
    },
  });

  // --- 4) les phrases de fin ---
  cases.push({
    id: 'pdfeach_done_sentences_in_french_and_english_for_the_three_kinds_of_pdf_in_an_archive',
    description: 'Les phrases de fin de « un par un » : PDF, PDF protégé, PDF/A, avec ou sans échec, au singulier (« téléchargé seul ») et au pluriel (« téléchargés un par un »), en français et en anglais ; la progression dit « n/total »',
    run: async (h) => {
      const problems = [];
      const t = (key, vars) => I18n.t(key, vars);
      I18n.setLang('fr');
      check(problems, 'FR PDF', [t('status.batchExportDoneEach', { ok: 1 }), t('status.batchExportDoneEach', { ok: 3 })], ['1 PDF généré — téléchargé seul.', '3 PDF générés — téléchargés un par un.']);
      check(problems, 'FR PDF avec échecs', [t('status.batchExportDoneWithFailuresEach', { ok: 2, failed: 1 })], ['2 PDF générés, 1 échec — téléchargés un par un.']);
      check(problems, 'FR PDF protégé', [t('status.batchExportDoneProtectedEach', { ok: 3 }), t('status.batchExportDoneWithFailuresProtectedEach', { ok: 2, failed: 2 })], ['3 PDF protégés générés — téléchargés un par un.', '2 PDF protégés générés, 2 échecs — téléchargés un par un.']);
      check(problems, 'FR PDF/A', [t('status.batchExportDoneArchiveEach', { ok: 3 }), t('status.batchExportDoneWithFailuresArchiveEach', { ok: 1, failed: 1 })], ['3 PDF/A générés — téléchargés un par un.', '1 PDF/A généré, 1 échec — téléchargé seul.']);
      check(problems, 'FR progression', t('status.pdfEachDownloading', { current: 2, total: 5 }), 'Téléchargement des PDF un par un : 2/5…');
      I18n.setLang('en');
      check(problems, 'EN PDF', [t('status.batchExportDoneEach', { ok: 1 }), t('status.batchExportDoneEach', { ok: 3 })], ['1 PDF generated — downloaded on its own.', '3 PDFs generated — downloaded one by one.']);
      check(problems, 'EN PDF with failures', t('status.batchExportDoneWithFailuresEach', { ok: 2, failed: 1 }), '2 PDFs generated, 1 failure — downloaded one by one.');
      check(problems, 'EN protected', [t('status.batchExportDoneProtectedEach', { ok: 3 }), t('status.batchExportDoneWithFailuresProtectedEach', { ok: 2, failed: 2 })], ['3 protected PDFs generated — downloaded one by one.', '2 protected PDFs generated, 2 failures — downloaded one by one.']);
      check(problems, 'EN PDF/A', [t('status.batchExportDoneArchiveEach', { ok: 3 }), t('status.batchExportDoneWithFailuresArchiveEach', { ok: 1, failed: 1 })], ['3 PDF/A files generated — downloaded one by one.', '1 PDF/A file generated, 1 failure — downloaded on its own.']);
      check(problems, 'EN progress', t('status.pdfEachDownloading', { current: 2, total: 5 }), 'Downloading the PDFs one by one: 2/5…');
      I18n.setLang('fr');
      return verdict(problems, {});
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfEach = cases;
})();
