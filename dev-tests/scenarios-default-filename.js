// Suite "defaultFilename" - le nom d'un fichier exporté quand le modèle n'en règle aucun (audit « confort d'usage » du 12/11, idée 1, GO d'Antoine) : le nom du modèle, puis celui de la ligne
// (« Facture - Dupont »), au lieu de « publipostage » partout. Trois choses à tenir :
//  1) le NOM : le nom du modèle, un tiret, la colonne qui nomme les fiches du « @ » (à défaut le n° de la ligne), les caractères interdits d'un nom de fichier remplacés, un nom réglé par la
//     personne jamais touché, un nom de modèle vide qui retombe sur « publipostage » comme avant ;
//  2) le BOUTON Exporter : sans « Nom du fichier PDF », il passe aux moteurs le nom d'office (celui du modèle ouvert) ; avec un nom réglé, ce nom ; un modèle email garde l'objet de l'email
//     (aucun nom d'office) ;
//  3) le LOT en ZIP : chaque fichier de l'archive porte le nom de sa ligne, plus « publipostage » puis « publipostage (2) »…
// Le contrôle d'avant lot ne compare pas ces noms (un nom d'office n'est pas un nom réglé) : couvert par le dernier cas.
(function () {
  const cases = [];
  const TABLE = 'DfnClients';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const add = (id, description, run) => cases.push({ id, description, run });
  const typeSelect = () => document.getElementById('v2-export-type');
  const linesSelect = () => document.getElementById('v2-export-lines');
  const nameInput = () => document.getElementById('template-name');
  const pdfNameField = () => document.getElementById('pdf-filename-template');
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  const TYPE_FLYOUT = '#v2-quality-flyout';

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Ville: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom, Ville: 'Lyon' })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0], Ville: 'Lyon' }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}.</p>`);
    await sleep(80);
  }
  // Remet le menu d'avant (PDF, une ligne) et vide les champs que ces cas touchent.
  async function reset() {
    typeSelect().value = 'pdf';
    linesSelect().value = 'one';
    const type = document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="pdf"]');
    const lines = document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="one"]');
    if (type) type.click();
    if (lines) lines.click();
    nameInput().value = '';
    pdfNameField().value = '';
    await sleep(30);
  }
  const pickType = async type => { document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]').click(); await sleep(20); };
  const pickLines = async lines => { document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]').click(); await sleep(20); };

  add('dfn_the_name_is_the_model_then_the_row',
    'Sans nom réglé, le nom d\'un fichier est celui du modèle, un tiret, puis celui de la ligne (la première colonne de texte) ; une valeur vide retombe sur le n° de la ligne ; « / : » et les autres caractères interdits sont remplacés ; un nom réglé par la personne ne change pas ; un nom de modèle vide donne « publipostage »',
    async (h) => {
      await seed(h);
      const bad = [];
      const name = (template, record) => ReaderMode.resolveFilename(template, TABLE, record);
      const auto = ReaderMode.autoName('Facture');
      const one = await name(auto, { id: 1, Nom: 'Dupont', Ville: 'Lyon' });
      if (one !== 'Facture - Dupont') bad.push('nom d\'office=' + JSON.stringify(one));
      const empty = await name(auto, { id: 5, Nom: '', Ville: 'Lyon' });
      if (empty !== 'Facture - 5') bad.push('ligne sans nom=' + JSON.stringify(empty));
      const forbidden = await name(auto, { id: 6, Nom: 'Dupont/Fils: "x"', Ville: '' });
      if (forbidden !== 'Facture - Dupont_Fils_ _x_') bad.push('caractères interdits=' + JSON.stringify(forbidden));
      const spaced = await name(ReaderMode.autoName('  Facture   mars  '), { id: 7, Nom: 'Lenoir', Ville: '' });
      if (spaced !== 'Facture mars - Lenoir') bad.push('espaces=' + JSON.stringify(spaced));
      const long = await name(auto, { id: 8, Nom: 'N'.repeat(200), Ville: '' });
      if (long !== 'Facture - ' + 'N'.repeat(80)) bad.push('nom de ligne long, ' + long.length + ' signes');
      const set = await name(`Suivi_#${TABLE}.Ville`, { id: 1, Nom: 'Dupont', Ville: 'Lyon' });
      if (set !== 'Suivi_Lyon') bad.push('nom réglé=' + JSON.stringify(set));
      if (ReaderMode.autoName('') !== '' || ReaderMode.autoName('   ') !== '' || ReaderMode.autoName(null) !== '') bad.push('nom de modèle vide non vide');
      if ((await name('', { id: 1, Nom: 'Dupont' })) !== 'publipostage') bad.push('sans rien=' + (await name('', { id: 1, Nom: 'Dupont' })));
      if (!ReaderMode.isAutoName(auto) || ReaderMode.isAutoName('Suivi') || ReaderMode.isAutoName('') || ReaderMode.isAutoName(null)) bad.push('isAutoName');
      // Le même point de passage que le PDF, le Word et l'Excel.
      const resolved = await ExportCommon.resolveRecord('<p>x</p>', TABLE, { id: 2, Nom: 'Bravo Martin', Ville: 'Lyon' }, auto, null);
      if (resolved.filename !== 'Facture - Bravo Martin') bad.push('resolveRecord=' + JSON.stringify(resolved.filename));
      const md = await h.exportMarkdown('<p>x</p>', null, { id: 3, Nom: 'Charlie Petit', Ville: 'Lyon' }, TABLE, auto);
      if (md.filename !== 'Facture - Charlie Petit') bad.push('export Markdown=' + JSON.stringify(md.filename));
      return result(bad);
    });

  add('dfn_the_export_button_hands_the_model_name_to_the_engines_when_no_name_is_set',
    'Le bouton Exporter d\'une ligne passe aux moteurs le nom d\'office (celui du modèle ouvert) quand « Nom du fichier PDF » est vide, le nom réglé quand il y en a un, et rien pour un modèle email (qui garde l\'objet de l\'email)',
    async (h) => {
      await seed(h);
      await reset();
      const bad = [];
      const asked = [];
      const real = MarkdownExport.exportCurrentRecord;
      MarkdownExport.exportCurrentRecord = async (html, tableId, record, filenameTemplate) => { asked.push(filenameTemplate); };
      const click = async () => {
        const before = asked.length;
        document.getElementById('btn-export-pdf').click();
        for (let i = 0; i < 60 && asked.length === before; i++) await sleep(50);
        for (let i = 0; i < 40 && document.getElementById('btn-export-pdf').style.pointerEvents === 'none'; i++) await sleep(50);
        return asked[asked.length - 1];
      };
      try {
        await pickType('md');
        nameInput().value = 'Facture';
        const auto = await click();
        if (!ReaderMode.isAutoName(auto) || (await ReaderMode.resolveFilename(auto, TABLE, { id: 1, Nom: 'Alpha Durand' })) !== 'Facture - Alpha Durand') bad.push('sans nom réglé : ' + JSON.stringify(auto));
        pdfNameField().value = 'Courrier_#' + TABLE + '.Nom';
        const set = await click();
        if (set !== 'Courrier_#' + TABLE + '.Nom') bad.push('avec un nom réglé : ' + JSON.stringify(set));
        pdfNameField().value = '';
        nameInput().value = '';
        const noName = await click();
        if (noName !== '') bad.push('modèle sans nom : ' + JSON.stringify(noName));
      } finally { MarkdownExport.exportCurrentRecord = real; await reset(); }
      return result(bad);
    });

  add('dfn_each_file_of_a_batch_zip_is_named_after_its_row',
    'Un lot en ZIP sans nom réglé : un fichier par ligne, « Facture - Alpha Durand.md », « Facture - Bravo Martin.md »… (avant : « publipostage », « publipostage (2) »…), et le contrôle d\'avant lot ne compare pas ces noms d\'office : deux clients du même nom ne le font pas s\'ouvrir',
    async (h) => {
      await seed(h);
      await reset();
      const bad = [];
      const downloads = [];
      const realDownload = ExportCommon.downloadBlob;
      ExportCommon.downloadBlob = (blob, name) => downloads.push({ blob, name });
      const dialogs = h.stubDialogs({ confirm: true });
      const realReview = BatchPrecheck.review;
      let reviews = 0;
      BatchPrecheck.review = async (...args) => { reviews++; return realReview(...args); };
      try {
        await pickType('md');
        await pickLines('zip');
        nameInput().value = 'Facture';
        // Deux lignes du même nom : un nom d'office ne s'ouvre pas à la comparaison des noms.
        window.__gristStub.setRows(TABLE, [{ id: 1, Nom: 'Alpha Durand', Ville: 'Lyon' }, { id: 2, Nom: 'Alpha Durand', Ville: 'Brest' }, { id: 3, Nom: 'Charlie Petit', Ville: 'Nantes' }]);
        document.getElementById('btn-export-pdf').click();
        for (let i = 0; i < 160 && !downloads.length; i++) await sleep(50);
        await sleep(60);
        if (downloads.length !== 1) bad.push('fichiers téléchargés : ' + downloads.length);
        else {
          const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer());
          const names = Object.keys(zip.files).sort();
          const want = ['Facture - Alpha Durand (2).md', 'Facture - Alpha Durand.md', 'Facture - Charlie Petit.md'];
          if (JSON.stringify(names) !== JSON.stringify(want)) bad.push('noms dans l\'archive : ' + JSON.stringify(names));
        }
        if (reviews) bad.push('le contrôle d\'avant lot s\'est ouvert ' + reviews + ' fois pour deux lignes du même nom');
      } finally {
        ExportCommon.downloadBlob = realDownload;
        BatchPrecheck.review = realReview;
        dialogs.restore();
        window.__gristStub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom, Ville: 'Lyon' })));
        await reset();
      }
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.defaultFilename = cases;
})();
