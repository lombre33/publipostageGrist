// main.js
// Point d'entrée du widget. Orchestre grist-api.js, variables.js, editor.js,
// reader-mode.js, templates.js et pdf-export.js.

(async function () {
  const els = {
    tableIdBadge: document.getElementById('current-table-badge'),
    modeToggleBtn: document.getElementById('btn-mode-read'),
    modeEditBtn: document.getElementById('btn-mode-edit'),
    editorContainer: document.getElementById('editor-container'),
    readerContainer: document.getElementById('reader-container'),
    errorBanner: document.getElementById('error-banner'),
    tableSelectorContainer: document.getElementById('table-selector-container'),
    tableSelector: document.getElementById('table-selector'),
    templateSelect: document.getElementById('template-select'),
    newTemplateBtn: document.getElementById('btn-new'),
    saveTemplateBtn: document.getElementById('btn-save'),
    exportPdfBtn: document.getElementById('btn-export-pdf'),
    fileNamePatternInput: document.getElementById('pdf-filename-template'),
  };

  let mode = 'edit'; // 'edit' | 'read'
  let currentRecord = null;

  // Tous les écouteurs sont attachés de façon défensive : certains éléments
  // restent optionnels selon le contexte d'intégration du widget.
  function on(el, event, handler) {
    if (el) el.addEventListener(event, handler);
  }

  function refreshTableSelector() {
    if (!els.tableSelector || !els.tableSelectorContainer) return;
    const tables = GristAPI.getAvailableTableIds();
    els.tableSelector.innerHTML = '<option value="">-- Sélectionner une table --</option>';
    tables.forEach(tableId => {
      const option = document.createElement('option');
      option.value = tableId;
      option.textContent = tableId;
      els.tableSelector.appendChild(option);
    });
    const detected = GristAPI.getCurrentTableId();
    els.tableSelector.value = detected || '';
    els.tableSelectorContainer.style.display = detected ? 'none' : 'block';
  }

  function showDiagnostic(tableId) {
    if (els.tableIdBadge) {
      els.tableIdBadge.textContent = tableId
        ? `Table courante détectée : ${tableId}`
        : 'Table courante : non détectée';
      els.tableIdBadge.classList.toggle('badge-ok', !!tableId);
      els.tableIdBadge.classList.toggle('badge-warn', !tableId);
    }
  }

  function showError(message) {
    if (!els.errorBanner) return;
    if (message) {
      els.errorBanner.textContent = `⚠ ${message}`;
      els.errorBanner.style.display = 'block';
    } else {
      els.errorBanner.style.display = 'none';
    }
  }

  async function refreshReaderMode() {
    if (mode !== 'read') return;
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId) {
      showError('Table courante non détectée. Vérifiez que le widget est bien rattaché à une vue/table dans Grist.');
      return;
    }
    if (!currentRecord) {
      showError('Aucune ligne sélectionnée dans la table courante.');
      return;
    }
    const ok = await ReaderMode.render(currentRecord, currentTableId);
    showError(ok ? null : 'Certaines variables n\'ont pas pu être résolues (vérifiez que le modèle correspond bien à cette table / qu\'une référence existe).');
  }

  function switchMode(newMode) {
    mode = newMode;
    if (mode === 'edit') {
      if (els.editorContainer) els.editorContainer.style.display = 'block';
      if (els.readerContainer) els.readerContainer.style.display = 'none';
      if (els.modeEditBtn) els.modeEditBtn.classList.add('active');
      if (els.modeToggleBtn) els.modeToggleBtn.classList.remove('active');
      showError(null);
    } else {
      if (els.editorContainer) els.editorContainer.style.display = 'none';
      if (els.readerContainer) els.readerContainer.style.display = 'block';
      if (els.modeToggleBtn) els.modeToggleBtn.classList.add('active');
      if (els.modeEditBtn) els.modeEditBtn.classList.remove('active');
      refreshReaderMode();
    }
  }

  on(els.modeToggleBtn, 'click', () => switchMode('read'));
  on(els.modeEditBtn, 'click', () => switchMode('edit'));
  on(els.newTemplateBtn, 'click', () => Templates.newTemplate());
  on(els.saveTemplateBtn, 'click', () => Templates.saveCurrentTemplate());
  on(els.templateSelect, 'change', (e) => Templates.loadTemplate(e.target.value));
  on(els.tableSelector, 'change', (e) => {
    if (e.target.value) GristAPI.setManualTableId(e.target.value);
  });
  on(els.exportPdfBtn, 'click', async () => {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId || !currentRecord) {
      showError('Impossible d\'exporter : table ou ligne courante non détectée.');
      return;
    }
    await PdfExport.exportCurrentRecord(
      currentRecord,
      currentTableId,
      els.fileNamePatternInput ? els.fileNamePatternInput.value : ''
    );
  });

  // --- Initialisation ---
  await GristAPI.init();
  refreshTableSelector();

  GristAPI.onTableIdChange((tableId) => {
    showDiagnostic(tableId);
    VariablesManager.buildVariableList();
    if (typeof Editor.refreshAutocompleteSource === 'function') Editor.refreshAutocompleteSource();
    refreshTableSelector();
    if (mode === 'read') refreshReaderMode();
  });

  GristAPI.onRecord((record, tableId) => {
    currentRecord = record;
    showDiagnostic(tableId);
    if (mode === 'read') refreshReaderMode();
    refreshTableSelector();
  });

  VariablesManager.buildVariableList();
  Editor.init(document.getElementById('editor'));
  await Templates.init();

  switchMode('edit');
})();
