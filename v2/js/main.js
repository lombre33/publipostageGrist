// Orchestration V2 — même structure que js/main.js (V1), volontairement
// simplifiée pour cet incrément agile : gestion de modèles + mode Édition/
// Lecture + export PDF (vectoriel uniquement, cf. v2/js/pdf-export.js) +
// câblage Grist (variables/tableaux/2 colonnes/images/sommaire sont gérés
// dans v2/js/editor.js, pas ici) + modale "Tables liées" (règles de
// correspondance inter-tables, cf. wireLinkRulesModal/v2/js/variables.js).
// `Editor.init()` est ASYNC ici (contrairement à V1) - v2/js/editor.js
// charge TipTap/ProseMirror via import() dynamique au moment de l'appel.
(function () {
  let currentMode = 'edit';
  let currentTableId = null;
  let latestRecord = null;
  let latestRecordTableId = null;

  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');
  const pdfFilenameInput = document.getElementById('pdf-filename-template');
  const editorContainer = document.getElementById('editor-container');
  const readerContainer = document.getElementById('reader-container');
  const btnEdit = document.getElementById('btn-mode-edit');
  const btnRead = document.getElementById('btn-mode-read');

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
  }

  function getPdfFilenameTemplate() {
    return pdfFilenameInput ? pdfFilenameInput.value.trim() : '';
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
  }

  function loadTemplateIntoEditor(tpl) {
    Editor.setHTML(tpl ? tpl.contenu : '');
    if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : '';
    if (pdfFilenameInput) pdfFilenameInput.value = tpl ? (tpl.nomFichierPDF || '') : '';
    Templates.setCurrentId(tpl ? tpl.id : null);
    const headingNumberingSelect = document.getElementById('v2-heading-numbering-select');
    if (headingNumberingSelect) headingNumberingSelect.value = Editor.getHeadingNumberingStyle();
  }

  async function onTemplateSelectChange() {
    const id = templateSelect.value;
    if (!id) { loadTemplateIntoEditor(null); return; }
    const tpl = Templates.getCached().find(t => String(t.id) === String(id));
    if (tpl) loadTemplateIntoEditor(tpl);
  }

  async function onNew() {
    templateSelect.value = '';
    loadTemplateIntoEditor(null);
    setStatus('Nouveau modèle prêt.');
  }

  async function onSave() {
    const id = Templates.getCurrentId();
    const nom = templateNameInput ? templateNameInput.value.trim() : '';
    if (!nom) { setStatus('Nom du modèle requis.', true); return; }
    const savedId = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate());
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
    if (!id) { setStatus('Aucun modèle sélectionné.', true); return; }
    if (!confirm('Supprimer ce modèle ?')) return;
    await Templates.remove(id);
    await refreshTemplateList();
    onNew();
    setStatus('Modèle supprimé.');
  }

  async function renderReader(record, recordTableId) {
    const html = Editor.getHTML();
    if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord();
    let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId;
    if (!record) return;
    if (!tableId) {
      const ctx = await GristAPI.detectCurrentContext();
      if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; }
    }
    await ReaderMode.render(html, tableId, record);
  }

  async function onExportPdf() {
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; }
    setStatus('Génération du PDF en cours...');
    try {
      await PdfExport.exportCurrentRecord(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate());
      setStatus('PDF généré.');
    } catch (e) {
      console.error(e);
      setStatus('Erreur génération PDF.', true);
    }
  }

  async function switchMode(mode) {
    currentMode = mode;
    btnEdit.classList.toggle('active', mode === 'edit');
    btnRead.classList.toggle('active', mode === 'read');
    editorContainer.style.display = mode === 'edit' ? 'block' : 'none';
    readerContainer.style.display = mode === 'read' ? 'block' : 'none';
    if (mode === 'read') await renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId());
  }

  function wireA4PreviewToggle() {
    const toggle = document.getElementById('v2-toggle-a4-preview');
    if (!toggle) return;
    const sync = () => editorContainer.classList.toggle('a4-preview', toggle.checked);
    toggle.addEventListener('change', sync);
    sync();
  }

  // "Tables liées" (v2/js/variables.js) : modale séparée plutôt que le volet
  // repliable de la V1 (#toolbar-panel) - v2 n'a pas ce volet du tout, une
  // modale évite d'avoir à en introduire un pour ce seul besoin. Rafraîchit
  // la liste à chaque ouverture (une règle a pu être ajoutée entre-temps via
  // l'insertion d'une variable).
  function wireLinkRulesModal() {
    const btn = document.getElementById('btn-link-rules');
    const modal = document.getElementById('link-rules-modal');
    const btnClose = document.getElementById('link-rules-close');
    if (!btn || !modal || !btnClose) return;
    btn.addEventListener('click', () => { Variables.refreshLinkRulesPanel(); modal.style.display = 'flex'; });
    btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  async function init() {
    try { await GristAPI.init(); } catch (e) { setStatus('Erreur init API Grist.', true); }
    await Editor.init();
    GristAPI.onRecord(async function (record, tableId) {
      latestRecord = record;
      latestRecordTableId = tableId || GristAPI.getCurrentTableId();
      if (tableId) currentTableId = tableId;
      if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId);
    });
    await refreshTemplateList();
    await onTemplateSelectChange();
    templateSelect.addEventListener('change', onTemplateSelectChange);
    document.getElementById('btn-new').addEventListener('click', onNew);
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-save-as').addEventListener('click', onSaveAs);
    document.getElementById('btn-delete').addEventListener('click', onDelete);
    document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf);
    btnEdit.addEventListener('click', () => switchMode('edit'));
    btnRead.addEventListener('click', () => switchMode('read'));
    wireA4PreviewToggle();
    wireLinkRulesModal();
    await switchMode('edit');
    setStatus('Widget V2 prêt.');
  }

  init();
})();
