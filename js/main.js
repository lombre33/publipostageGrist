// Point d'entrée : orchestration de l'ensemble des modules
(function () {
  let quill = null;
  let currentMode = 'edit'; // 'edit' | 'read'
  let currentTableId = null; // table active dans Grist au moment de la sélection

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template');

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
    setTimeout(() => { statusMsg.textContent = ''; }, 4000);
  }

  async function refreshTemplateList() {
    const templates = await Templates.loadAll();
    templateSelect.innerHTML = '<option value="">-- Nouveau modèle --</option>';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.nom;
      templateSelect.appendChild(opt);
    });
  }

  function loadTemplateIntoEditor(tpl) {
    Editor.setHTML(tpl ? tpl.contenu : '');
    templateNameInput.value = tpl ? tpl.nom : '';
    pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
    Templates.setCurrentId(tpl ? tpl.id : null);
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (!id) { loadTemplateIntoEditor(null); return; }
    const templates = Templates.getCached();
    const tpl = templates.find(t => String(t.id) === String(id));
    loadTemplateIntoEditor(tpl);
  }

  async function onNew() {
    templateSelect.value = '';
    loadTemplateIntoEditor(null);
    setStatus('Nouveau modèle prêt.');
  }

  async function onSave() {
    const id = Templates.getCurrentId();
    const nom = templateNameInput.value.trim();
    if (!nom) { setStatus('Veuillez indiquer un nom de modèle.', true); return; }
    const html = Editor.getHTML();
    const filenameTpl = pdfFilenameInput.value.trim();
    const savedId = await Templates.save(id, nom, html, filenameTpl);
    Templates.setCurrentId(savedId);
    await refreshTemplateList();
    templateSelect.value = savedId;
    setStatus('Modèle enregistré.');
  }

  async function onSaveAs() {
    const nom = prompt('Nom du nouveau modèle :', templateNameInput.value || 'Nouveau modèle');
    if (!nom) return;
    templateNameInput.value = nom;
    Templates.setCurrentId(null);
    await onSave();
  }

  async function onDelete() {
    const id = Templates.getCurrentId();
    if (!id) { setStatus('Aucun modèle chargé à supprimer.', true); return; }
    if (!confirm('Supprimer ce modèle ?')) return;
    await Templates.remove(id);
    await refreshTemplateList();
    onNew();
    setStatus('Modèle supprimé.');
  }

  function switchMode(mode) {
    currentMode = mode;
    const btnEdit = document.getElementById('btn-mode-edit');
    const btnRead = document.getElementById('btn-mode-read');
    const editorContainer = document.getElementById('editor-container');
    const editorToolbar = document.querySelector('.ql-toolbar');
    const readerContainer = document.getElementById('reader-container');

    if (mode === 'edit') {
      btnEdit.classList.add('active');
      btnRead.classList.remove('active');
      editorContainer.style.display = 'block';
      if (editorToolbar) editorToolbar.style.display = 'block';
      readerContainer.style.display = 'none';
    } else {
      btnEdit.classList.remove('active');
      btnRead.classList.add('active');
      editorContainer.style.display = 'none';
      if (editorToolbar) editorToolbar.style.display = 'none';
      readerContainer.style.display = 'block';
      renderReader();
    }
  }

  async function renderReader() {
    const html = Editor.getHTML();
    const context = await GristAPI.detectCurrentContext();
    const record = context ? context.record : GristAPI.getCurrentRecord();
    if (context) currentTableId = context.tableId;
    console.log('[main] renderReader: contexte=', context ? context.tableId : null, 'record=', !!record);
    await ReaderMode.render(html, currentTableId, record);
  }

  async function onExportPdf() {
    const html = Editor.getHTML();
    const record = GristAPI.getCurrentRecord();
    const filenameTpl = pdfFilenameInput.value.trim();
    setStatus('Génération du PDF en cours...');
    try {
      await PdfExport.exportCurrentRecord(html, currentTableId, record, filenameTpl);
      setStatus('PDF généré.');
    } catch (e) {
      console.error(e);
      setStatus("Erreur lors de l'export PDF : " + e.message, true);
    }
  }

  async function detectCurrentTable() {
    try {
      const tableId = await grist.getTable ? null : null;
    } catch (e) {}
  }

  async function init() {
    await GristAPI.init();
    quill = Editor.init();

    GristAPI.onRecord(function (record, tableId) {
      console.log('[main] onRecord: record=', !!record, 'tableId=', tableId);
      if (tableId) currentTableId = tableId;
      if (currentMode === 'read') renderReader();
    });

    grist.onOptions(async function (options, settings) {
      console.log('[main] onOptions reçu, settings=', settings || null);
      const context = await GristAPI.detectCurrentContext();
      if (context) currentTableId = context.tableId;
    });

    try {
      if (grist.getTable) {
        // Fallback : certaines versions de l'API exposent le tableId courant
      }
    } catch (e) {}

    await refreshTemplateList();

    document.getElementById('template-select').addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-mode-edit').addEventListener('click', () => switchMode('edit'));
    document.getElementById('btn-mode-read').addEventListener('click', () => switchMode('read'));
    document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf);

    setStatus('Widget prêt.');
  }

  init();
})();
