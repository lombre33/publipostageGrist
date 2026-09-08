// Publipostage Grist — widget custom v1.1.2 — 2026-09-04
(function () {
  let quill = null; let currentMode = 'edit'; let currentTableId = null; let latestRecord = null; let latestRecordTableId = null;
  const statusMsg = document.getElementById('status-msg'); const templateSelect = document.getElementById('template-select'); const templateNameInput = document.getElementById('template-name');
  function getPdfFilenameInput() { return document.getElementById('pdf-filename-template') || document.getElementById('pdfFilenameInput') || document.getElementById('pdf-filename'); }
  function getPdfFilenameTemplate() { const input = getPdfFilenameInput(); if (!input) return ''; return input.value.trim(); }
  const editorContainer = document.getElementById('editor-container'); const readerContainer = document.getElementById('reader-container'); const btnEdit = document.getElementById('btn-mode-edit'); const btnRead = document.getElementById('btn-mode-read'); const toolbar = document.getElementById('toolbar'); let ind = document.getElementById('table-indicator');
  function setStatus(msg, isError) { statusMsg.textContent = msg; statusMsg.className = isError ? 'error-msg' : ''; }
  function updateTableIndicator(tableId) { if (!ind) { ind = document.createElement('span'); ind.id = 'table-indicator'; ind.style.marginLeft = '10px'; ind.style.fontSize = '0.85em'; ind.style.opacity = '0.8'; if (toolbar) toolbar.appendChild(ind); } ind.textContent = tableId ? ('Table: ' + tableId) : 'Table: —'; }
  // Ne recharge PLUS l'éditeur depuis ici (ancien comportement : après avoir
  // reconstruit les <option>, cherchait un modèle dont l'id correspondait à
  // templateSelect.value ET le rechargeait dans l'éditeur - un onSave() de-
  // vait ENSUITE remettre templateSelect.value sur le modèle sauvegardé, ce
  // qui arrivait trop tard : l'éditeur, lui, avait déjà été rechargé avec le
  // mauvais modèle - le PREMIER de la liste, puisque templateSelect.value
  // valait encore '' au moment du find(). Reconstruire la liste des options
  // ne doit affecter QUE le <select>, jamais le contenu de l'éditeur - au
  // seul appelant qui veut réellement changer le modèle affiché (onNew,
  // onDelete, onTemplateSelectChange) de le faire explicitement.
  async function refreshTemplateList() { const templates = await Templates.loadAll(); templateSelect.innerHTML = '-- Nouveau modèle --'; templates.forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.textContent = t.nom; templateSelect.appendChild(opt); }); }
  function loadTemplateIntoEditor(tpl) { Editor.setHTML(tpl ? tpl.contenu : ''); if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : ''; const input = getPdfFilenameInput(); if (input) input.value = tpl ? (tpl.nomFichierPDF || '') : ''; Templates.setCurrentId(tpl ? tpl.id : null); }
  async function onTemplateSelectChange() { const id = templateSelect.value; if (!id) { loadTemplateIntoEditor(null); return; } const tpl = Templates.getCached().find(t => String(t.id) === String(id)); if (tpl) loadTemplateIntoEditor(tpl); }
  async function onNew() { templateSelect.value = ''; loadTemplateIntoEditor(null); setStatus('Nouveau modèle prêt.'); }
  async function onSave() { const id = Templates.getCurrentId(); const nom = templateNameInput ? templateNameInput.value.trim() : ''; if (!nom) { setStatus('Nom du modèle requis.', true); return; } const savedId = await Templates.save(id, nom, Editor.getHTML(), getPdfFilenameTemplate()); Templates.setCurrentId(savedId); await refreshTemplateList(); templateSelect.value = savedId; setStatus('Modèle enregistré.'); }
  async function onSaveAs() { const nom = prompt('Nom du nouveau modèle :'); if (!nom) return; if (templateNameInput) templateNameInput.value = nom; Templates.setCurrentId(null); await onSave(); }
  async function onDelete() { const id = Templates.getCurrentId(); if (!id) { setStatus('Aucun modèle sélectionné.', true); return; } if (!confirm('Supprimer ce modèle ?')) return; await Templates.remove(id); await refreshTemplateList(); onNew(); setStatus('Modèle supprimé.'); }
  async function switchMode(mode) { currentMode = mode; if (mode === 'edit') { btnEdit.classList.add('active'); btnRead.classList.remove('active'); editorContainer.style.display = 'block'; readerContainer.style.display = 'none'; } else { btnEdit.classList.remove('active'); btnRead.classList.add('active'); editorContainer.style.display = 'none'; readerContainer.style.display = 'block'; await renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId()); } }
  async function renderReader(record, recordTableId) { const html = Editor.getHTML(); if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord(); let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId; if (!record) return; if (!tableId) { const ctx = await GristAPI.detectCurrentContext(); if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; updateTableIndicator(ctx.tableId); } } await ReaderMode.render(html, tableId, record); }
  async function onExportPdf() { const record = GristAPI.getCurrentRecord(); if (!record) { alert('Aucune ligne sélectionnée : impossible d\'exporter en PDF.'); return; } setStatus('Génération du PDF en cours...'); try { const quality = (document.getElementById('pdf-quality') || {}).value || 'standard'; await PdfExport.exportCurrentRecord(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality); setStatus('PDF généré.'); } catch (e) { console.error(e); setStatus('Erreur génération PDF.', true); } }
  // Génère le même PDF que "Exporter en PDF" mais l'enregistre dans la
  // colonne Pièce Jointe mappée (panneau de config, à droite) au lieu de le
  // télécharger — écrase systématiquement la pièce jointe précédente de
  // cette cellule (une seule PJ "PDF exporté" par ligne pour ce widget).
  async function onSaveToAttachment() {
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert('Aucune ligne sélectionnée : impossible d\'enregistrer le PDF.'); return; }
    if (!GristAPI.getPdfAttachmentColumnId()) { alert('Aucune colonne Pièce Jointe n’est mappée pour le PDF.\nOuvrez le panneau de configuration du widget (à droite) et choisissez une colonne dans « Colonne PJ pour le PDF exporté ».'); return; }
    setStatus('Génération et enregistrement du PDF en pièce jointe...');
    try {
      const quality = (document.getElementById('pdf-quality') || {}).value || 'standard';
      const { blob, filename } = await PdfExport.generatePdfBlob(Editor.getHTML(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality);
      await GristAPI.saveAttachmentToMappedColumn(blob, (filename || 'publipostage') + '.pdf');
      setStatus('PDF enregistré dans la pièce jointe.');
    } catch (e) {
      console.error(e);
      setStatus('Erreur enregistrement PJ.', true);
      alert(e && e.message ? e.message : 'Erreur lors de l’enregistrement du PDF en pièce jointe.');
    }
  }
  async function init() { try { await GristAPI.init(); } catch (e) { setStatus('Erreur init API Grist.', true); } quill = Editor.init(); Variables.initFilenameInput(getPdfFilenameInput()); GristAPI.onRecord(async function (record, tableId) { latestRecord = record; latestRecordTableId = tableId || GristAPI.getCurrentTableId(); if (tableId) currentTableId = tableId; updateTableIndicator(latestRecordTableId); if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId); }); try { if (grist.onOptions) grist.onOptions(() => {}); } catch (e) {} try { if (grist.onRecords) grist.onRecords(() => {}); } catch (e) {} await refreshTemplateList(); await onTemplateSelectChange(); templateSelect.addEventListener('change', onTemplateSelectChange); document.getElementById('btn-new').addEventListener('click', onNew); document.getElementById('btn-save').addEventListener('click', onSave); document.getElementById('btn-save-as').addEventListener('click', onSaveAs); document.getElementById('btn-delete').addEventListener('click', onDelete); btnEdit.addEventListener('click', () => switchMode('edit')); btnRead.addEventListener('click', () => switchMode('read')); document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf); document.getElementById('btn-save-attachment').addEventListener('click', onSaveToAttachment); const toggleA4 = document.getElementById('toggle-a4-preview'); if (toggleA4) { toggleA4.addEventListener('change', () => { editorContainer.classList.toggle('a4-preview', toggleA4.checked); }); editorContainer.classList.toggle('a4-preview', toggleA4.checked); } updateTableIndicator(GristAPI.getCurrentTableId()); await switchMode('edit'); setStatus('Widget prêt.'); }
  init();
})();
