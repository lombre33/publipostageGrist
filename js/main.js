// main.js
// Point d'entrée du widget. Orchestre grist-api.js, variables.js, editor.js,
// reader-mode.js, templates.js et pdf-export.js.

(async function () {
  const els = {
    tableIdBadge: document.getElementById('current-table-badge'),
    modeToggleBtn: document.getElementById('mode-toggle-btn'),
    editorContainer: document.getElementById('editor-container'),
    readerContainer: document.getElementById('reader-container'),
    errorBanner: document.getElementById('error-banner'),
    templateSelect: document.getElementById('template-select'),
    newTemplateBtn: document.getElementById('new-template-btn'),
    saveTemplateBtn: document.getElementById('save-template-btn'),
    exportPdfBtn: document.getElementById('export-pdf-btn'),
    fileNamePatternInput: document.getElementById('filename-pattern-input'),
  };

  let mode = 'edit'; // 'edit' | 'read'
  let currentRecord = null;

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
      els.editorContainer.style.display = 'block';
      els.readerContainer.style.display = 'none';
      els.modeToggleBtn.textContent = 'Passer en mode lecture';
      showError(null);
    } else {
      els.editorContainer.style.display = 'none';
      els.readerContainer.style.display = 'block';
      els.modeToggleBtn.textContent = 'Passer en mode édition';
      refreshReaderMode();
    }
  }

  els.modeToggleBtn.addEventListener('click', () => {
    switchMode(mode === 'edit' ? 'read' : 'edit');
  });

  els.newTemplateBtn.addEventListener('click', () => {
    Templates.newTemplate();
  });

  els.saveTemplateBtn.addEventListener('click', () => {
    Templates.saveCurrentTemplate();
  });

  els.templateSelect.addEventListener('change', (e) => {
    Templates.loadTemplate(e.target.value);
  });

  els.exportPdfBtn.addEventListener('click', async () => {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId || !currentRecord) {
      showError('Impossible d\'exporter : table ou ligne courante non détectée.');
      return;
    }
    await PdfExport.exportCurrentRecord(currentRecord, currentTableId, els.fileNamePatternInput.value);
  });

  // --- Initialisation ---
  await GristAPI.init();

  GristAPI.onTableIdChange((tableId) => {
    showDiagnostic(tableId);
    VariablesManager.buildVariableList();
    Editor.refreshAutocompleteSource();
    if (mode === 'read') refreshReaderMode();
  });

  GristAPI.onRecord((record, tableId) => {
    currentRecord = record;
    showDiagnostic(tableId);
    if (mode === 'read') refreshReaderMode();
  });

  VariablesManager.buildVariableList();
  Editor.init(document.getElementById('editor'));
  await Templates.init();

  switchMode('edit');
})();
