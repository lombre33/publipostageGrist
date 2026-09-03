// Publipostage Grist — widget custom v1.1.0 — 2026-09-03 (ré-instrumentation [GristAPI])
console.log('[main] script chargé, timestamp:', new Date().toISOString(), 'v1.1.0');

(function () {
  let quill = null;
  let currentMode = 'edit'; // 'edit' | 'read'
  let currentTableId = null;

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template')
    || document.getElementById('pdfFilenameInput')
    || document.getElementById('pdf-filename');

  // BUG 1 — sécurisation : tous les accès à pdfFilenameInput passent par
  // cette fonction qui journalise un console.warn('[main] ...') explicite
  // si l'élément est absent (par exemple si index.html est modifié).
  function getPdfFilenameTemplate() {
    if (!pdfFilenameInput) {
      console.warn('[main] Élément #pdf-filename-template absent. Aucun nom de fichier PDF personnalisé ne sera utilisé.');
      return '';
    }
    return pdfFilenameInput.value.trim();
  }
  const editorContainer = document.getElementById('editor-container');
  const readerContainer = document.getElementById('reader-container');
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnRead = document.getElementById('btn-mode-read');

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
  }

  function updateTableIndicator(tableId) {
    let ind = document.getElementById('table-indicator');
    if (!ind) {
      ind = document.createElement('span');
      ind.id = 'table-indicator';
      ind.style.marginLeft = '10px';
      ind.style.fontSize = '0.85em';
      ind.style.opacity = '0.8';
      const toolbar = document.querySelector('.mode-bar') || statusMsg.parentNode;
      toolbar && toolbar.appendChild(ind);
    }
    ind.textContent = tableId ? `Table détectée : ${tableId}` : 'Table non détectée';
    console.log('[main] updateTableIndicator:', tableId);
  }

  async function refreshTemplateList() {
    const templates = await Templates.loadAll();
    templateSelect.innerHTML = '-- Nouveau modèle --';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.nom;
      templateSelect.appendChild(opt);
    });

    const defaultTemplate = templates.find(t => String(t.id) === String(templateSelect.value));
    if (defaultTemplate) {
      try {
        loadTemplateIntoEditor(defaultTemplate);
      } catch (e) {
        console.warn('[main] Impossible de charger le modèle par défaut dans l’éditeur.', e);
      }
    }
  }

  function loadTemplateIntoEditor(tpl) {
    Editor.setHTML(tpl ? tpl.contenu : '');
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    else console.warn('[main] Champ template-name absent.');
    if (pdfFilenameInput) pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
    else console.warn('[main] #pdf-filename-template absent : impossible de restaurer le nom de fichier PDF depuis le modèle.');
    Templates.setCurrentId(tpl ? tpl.id : null);
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (!id) {
      loadTemplateIntoEditor(null);
      return;
    }
    const templates = Templates.getCached();
    const tpl = templates.find(t => String(t.id) === String(id));
    if (!tpl) return;
    loadTemplateIntoEditor(tpl);
  }

  async function onNew() {
    templateSelect.value = '';
    loadTemplateIntoEditor(null);
    setStatus('Nouveau modèle prêt.');
  }

  async function onSave() {
    const id = Templates.getCurrentId();
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) {
      setStatus('Nom du modèle requis.', true);
      return;
    }
    const html = Editor.getHTML();
    const filenameTpl = getPdfFilenameTemplate();
    const savedId = await Templates.save(id, nom, html, filenameTpl);
    Templates.setCurrentId(savedId);
    await refreshTemplateList();
    templateSelect.value = savedId;
    setStatus('Modèle enregistré.');
  }

  async function onSaveAs() {
    const nom = prompt('Nom du nouveau modèle :');
    if (!nom) return;
    if (templateNameInput) templateNameInput.value = nom;
    Templates.setCurrentId(null);
    await onSave();
  }

  async function onDelete() {
    const id = Templates.getCurrentId();
    if (!id) {
      setStatus('Aucun modèle sélectionné.', true);
      return;
    }
    if (!confirm('Supprimer ce modèle ?')) return;
    await Templates.remove(id);
    await refreshTemplateList();
    onNew();
    setStatus('Modèle supprimé.');
  }

  // BUG 2 — switchMode est async pour pouvoir await renderReader() ;
  // sans await, renderReader() retournait une Promise non attendue.
  async function switchMode(mode) {
    currentMode = mode;
    if (mode === 'edit') {
      btnEdit.classList.add('active');
      btnRead.classList.remove('active');
      editorContainer.style.display = 'block';
      readerContainer.style.display = 'none';
    } else {
      btnEdit.classList.remove('active');
      btnRead.classList.add('active');
      editorContainer.style.display = 'none';
      readerContainer.style.display = 'block';
      await renderReader();
    }
  }

  async function renderReader() {
    const html = Editor.getHTML();
    const record = GristAPI.getCurrentRecord();
    let tableId = GristAPI.getCurrentTableId() || currentTableId;
    if (!record) {
      console.warn('[main] renderReader appelé SANS record courant.');
      return;
    }
    if (!tableId) {
      console.warn('[main] renderReader appelé SANS tableId courant, tentative detectCurrentContext…');
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) {
        currentTableId = ctx.tableId;
        updateTableIndicator(ctx.tableId);
      }
    }
    console.log('[main] renderReader: avant ReaderMode.render', { tableId, record: Object.keys(record) });
    await ReaderMode.render(html, tableId, record);
    console.log('[main] renderReader: après ReaderMode.render — affichage mis à jour.');
  }

  async function onExportPdf() {
    const html = Editor.getHTML();
    const record = GristAPI.getCurrentRecord();
    if (!record) {
      alert('Aucune ligne sélectionnée : impossible d\'exporter en PDF.');
      return;
    }
    const filenameTpl = getPdfFilenameTemplate();
    setStatus('Génération du PDF en cours...');
    try {
      console.log('[main] onExportPdf: avant PdfExport.exportCurrentRecord', { currentTableId, hasRecord: !!record, filenameTpl });
      await PdfExport.exportCurrentRecord(html, currentTableId || GristAPI.getCurrentTableId(), record, filenameTpl);
      console.log('[main] onExportPdf: après PdfExport.exportCurrentRecord — PDF généré.');
      setStatus('PDF généré.');
    } catch (e) {
      console.error(e);
      setStatus('Erreur génération PDF.', true);
    }
  }

  async function init() {
    console.log('[main] init: démarrage, version v1.1.0');
    try {
      await GristAPI.init();
      console.log('[main] GristAPI.init() terminé.');
    } catch (e) {
      console.error('[main] Erreur GristAPI.init():', e);
      setStatus('Erreur init API Grist.', true);
    }
    quill = Editor.init();

    // BUG 2 — onRecord callback async pour await renderReader() et éviter
    // qu'une Promise non-attendue ne s'affiche comme '[object Promise]'.
    GristAPI.onRecord(async function (record, tableId) {
      console.log('[main] onRecord reçu: record=', !!record, 'tableId=', tableId);
      if (tableId) currentTableId = tableId;
      updateTableIndicator(tableId);
      if (currentMode === 'read' && record) await renderReader();
    });

    // Abonnement aux options du widget (mapping colonnes, settings)
    try {
      if (grist.onOptions) {
        grist.onOptions(function (options, settings) {
          console.log('[main] onOptions reçu: options=', options, 'settings=', settings);
        });
      }
    } catch (e) {
      console.warn('[main] onOptions non disponible:', e);
    }

    // Abonnement aux records multiples (vue multi-sélection)
    try {
      if (grist.onRecords) {
        grist.onRecords(function (records, mappings) {
          console.log('[main] onRecords reçu: nb=', records ? records.length : 0);
        });
      }
    } catch (e) {
      console.warn('[main] onRecords non disponible:', e);
    }

    await refreshTemplateList();

    templateSelect.addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnRead.addEventListener('click', () => switchMode('read'));
    document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf);

    setStatus('Widget prêt.');
    console.log('[main] init terminé. widget prêt.');
  }

  init();
})();
