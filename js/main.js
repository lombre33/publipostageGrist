// Publipostage Grist — widget custom v1.1.2 — 2026-09-04
(function () {
  let quill = null; let currentMode = 'edit'; let currentTableId = null; let latestRecord = null; let latestRecordTableId = null;
  const statusMsg = document.getElementById('status-msg'); const templateSelect = document.getElementById('template-select'); const templateNameInput = document.getElementById('template-name');
  function getPdfFilenameInput() { return document.getElementById('pdf-filename-template') || document.getElementById('pdfFilenameInput') || document.getElementById('pdf-filename'); }
  function getPdfFilenameTemplate() { const input = getPdfFilenameInput(); if (!input) return ''; return input.value.trim(); }
  const editorContainer = document.getElementById('editor-container'); const readerContainer = document.getElementById('reader-container'); const htmlSourceContainer = document.getElementById('html-source-container'); const btnEdit = document.getElementById('btn-mode-edit'); const btnRead = document.getElementById('btn-mode-read'); const btnHtml = document.getElementById('btn-mode-html'); const toolbar = document.getElementById('toolbar'); let ind = document.getElementById('table-indicator');
  // La toolbar de mise en forme Quill (.ql-toolbar) est un élément que Quill
  // crée et insère LUI-MÊME dans le DOM (sœur de #editor-container, jamais
  // dedans) - switchMode ne la masquait donc jamais en changeant de mode :
  // rester en mode Lecture ou Code HTML laissait la toolbar complète visible
  // et cliquable au-dessus d'un contenu qu'elle ne peut plus affecter,
  // trompeur pour l'utilisateur. Résolue paresseusement (querySelector au
  // premier changement de mode) car Quill ne l'a pas forcément encore créée
  // au moment où ce script s'exécute.
  let quillToolbarEl = null;
  function getQuillToolbarEl() { if (!quillToolbarEl) quillToolbarEl = document.querySelector('.ql-toolbar'); return quillToolbarEl; }
  // Point d'accès unique du HTML "actif" : celui de l'éditeur Quill classique,
  // SAUF quand l'onglet Code HTML (mode avancé, cf. html-source-tab.js) est
  // le dernier à avoir été explicitement choisi, auquel cas c'est son contenu
  // (assaini) qui fait foi pour aperçu/export/sauvegarde - sans aucun
  // changement requis côté ReaderMode/PdfExport/Templates, qui ne consomment
  // déjà qu'une simple chaîne HTML, agnostique de son origine.
  //
  // activeSource (PAS currentMode directement) : le mode Lecture n'est qu'un
  // APERÇU en lecture seule de l'un ou l'autre - basculer dessus pour
  // prévisualiser l'onglet Code HTML ne doit pas faire retomber getActiveHtml()
  // sur Quill juste parce que currentMode n'est alors plus 'html'. Seul un
  // passage explicite en 'edit' ou 'html' change quelle source fait foi ;
  // 'read' la laisse telle quelle.
  let activeSource = 'quill';
  function getActiveHtml() { return activeSource === 'html' ? HtmlSourceTab.getSanitizedHtml() : Editor.getHTML(); }
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
  function loadTemplateIntoEditor(tpl) { Editor.setHTML(tpl ? tpl.contenu : ''); if (templateNameInput) templateNameInput.value = tpl ? tpl.nom : ''; const input = getPdfFilenameInput(); if (input) input.value = tpl ? (tpl.nomFichierPDF || '') : ''; Templates.setCurrentId(tpl ? tpl.id : null); const headingStyleSelect = document.getElementById('heading-numbering-style'); if (headingStyleSelect) headingStyleSelect.value = Editor.getHeadingNumberingStyle(); HtmlSourceTab.reset(tpl ? tpl.contenu : ''); }
  async function onTemplateSelectChange() { const id = templateSelect.value; if (!id) { loadTemplateIntoEditor(null); return; } const tpl = Templates.getCached().find(t => String(t.id) === String(id)); if (tpl) loadTemplateIntoEditor(tpl); }
  async function onNew() { templateSelect.value = ''; loadTemplateIntoEditor(null); setStatus('Nouveau modèle prêt.'); }
  async function onSave() { const id = Templates.getCurrentId(); const nom = templateNameInput ? templateNameInput.value.trim() : ''; if (!nom) { setStatus('Nom du modèle requis.', true); return; } const savedId = await Templates.save(id, nom, getActiveHtml(), getPdfFilenameTemplate()); Templates.setCurrentId(savedId); await refreshTemplateList(); templateSelect.value = savedId; setStatus('Modèle enregistré.'); }
  async function onSaveAs() { const nom = prompt('Nom du nouveau modèle :'); if (!nom) return; if (templateNameInput) templateNameInput.value = nom; Templates.setCurrentId(null); await onSave(); }
  async function onDelete() { const id = Templates.getCurrentId(); if (!id) { setStatus('Aucun modèle sélectionné.', true); return; } if (!confirm('Supprimer ce modèle ?')) return; await Templates.remove(id); await refreshTemplateList(); onNew(); setStatus('Modèle supprimé.'); }
  // Onglet Code HTML (mode avancé) : sa propre vue reste affichée telle
  // quelle tant qu'on y bascule ('html'), SANS jamais être reseedée depuis
  // Quill à chaque passage (cf. html-source-tab.js:ensureInitialized - une
  // seule fois par modèle chargé, cf. loadTemplateIntoEditor) - un
  // aller-retour Code HTML <-> Lecture <-> Code HTML sur le MÊME modèle en
  // cours d'édition ne doit jamais écraser ce qui vient d'y être tapé.
  async function switchMode(mode) {
    currentMode = mode;
    if (mode === 'edit' || mode === 'html') activeSource = mode === 'html' ? 'html' : 'quill';
    btnEdit.classList.toggle('active', mode === 'edit');
    btnRead.classList.toggle('active', mode === 'read');
    if (btnHtml) btnHtml.classList.toggle('active', mode === 'html');
    editorContainer.style.display = mode === 'edit' ? 'block' : 'none';
    readerContainer.style.display = mode === 'read' ? 'block' : 'none';
    if (htmlSourceContainer) htmlSourceContainer.style.display = mode === 'html' ? 'block' : 'none';
    const toolbarEl = getQuillToolbarEl();
    if (toolbarEl) toolbarEl.style.display = mode === 'edit' ? '' : 'none';
    if (mode === 'read') {
      await renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId());
    } else if (mode === 'html') {
      HtmlSourceTab.ensureInitialized(Editor.getHTML());
    }
  }
  async function renderReader(record, recordTableId) { const html = getActiveHtml(); if (typeof record === 'undefined') record = latestRecord || GristAPI.getCurrentRecord(); let tableId = recordTableId || GristAPI.getCurrentTableId() || currentTableId; if (!record) return; if (!tableId) { const ctx = await GristAPI.detectCurrentContext(); if (ctx && ctx.tableId) { currentTableId = ctx.tableId; tableId = ctx.tableId; updateTableIndicator(ctx.tableId); } } await ReaderMode.render(html, tableId, record); }
  async function onExportPdf() { const record = GristAPI.getCurrentRecord(); if (!record) { alert('Aucune ligne sélectionnée : impossible d\'exporter en PDF.'); return; } setStatus('Génération du PDF en cours...'); try { const quality = (document.getElementById('pdf-quality') || {}).value || 'native'; await PdfExport.exportCurrentRecord(getActiveHtml(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality); setStatus('PDF généré.'); } catch (e) { console.error(e); setStatus('Erreur génération PDF.', true); } }
  // Génère le même PDF que "Exporter en PDF" mais l'enregistre dans la
  // colonne Pièce Jointe mappée (panneau de config, à droite) au lieu de le
  // télécharger — écrase systématiquement la pièce jointe précédente de
  // cette cellule (une seule PJ "PDF exporté" par ligne pour ce widget).
  //
  // Bouton "PJ" retiré de la toolbar (cf. index.html) : DOUBLEMENT inerte en
  // l'état - GristAPI.getPdfAttachmentColumnId() ne peut plus jamais rien
  // renvoyer depuis le retrait d'urgence du mappage `columns:[...]` dans
  // grist-api.js:init (cassait la résolution de #Variable partout ailleurs,
  // cf. son commentaire), ET l'upload d'attachment lui-même échouait déjà en
  // 401 sur l'instance Grist réelle avant ça. Fonction conservée telle
  // quelle (non appelée depuis l'UI) pour ne pas perdre ce travail si les
  // deux causes sont un jour résolues.
  async function onSaveToAttachment() {
    const record = GristAPI.getCurrentRecord();
    if (!record) { alert('Aucune ligne sélectionnée : impossible d\'enregistrer le PDF.'); return; }
    if (!GristAPI.getPdfAttachmentColumnId()) { alert('Aucune colonne Pièce Jointe n’est mappée pour le PDF.\nOuvrez le panneau de configuration du widget (à droite) et choisissez une colonne dans « Colonne PJ pour le PDF exporté ».'); return; }
    setStatus('Génération et enregistrement du PDF en pièce jointe...');
    try {
      const quality = (document.getElementById('pdf-quality') || {}).value || 'native';
      const { blob, filename } = await PdfExport.generatePdfBlob(getActiveHtml(), currentTableId || GristAPI.getCurrentTableId(), record, getPdfFilenameTemplate(), quality);
      await GristAPI.saveAttachmentToMappedColumn(blob, (filename || 'publipostage') + '.pdf');
      setStatus('PDF enregistré dans la pièce jointe.');
    } catch (e) {
      console.error(e);
      setStatus('Erreur enregistrement PJ.', true);
      alert(e && e.message ? e.message : 'Erreur lors de l’enregistrement du PDF en pièce jointe.');
    }
  }
  async function init() { try { await GristAPI.init(); } catch (e) { setStatus('Erreur init API Grist.', true); } quill = Editor.init(); HtmlSourceTab.init(); Variables.initFilenameInput(getPdfFilenameInput()); Variables.refreshLinkRulesPanel(); GristAPI.onRecord(async function (record, tableId) { latestRecord = record; latestRecordTableId = tableId || GristAPI.getCurrentTableId(); if (tableId) currentTableId = tableId; updateTableIndicator(latestRecordTableId); if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId); }); try { if (grist.onOptions) grist.onOptions(() => {}); } catch (e) {} try { if (grist.onRecords) grist.onRecords(() => {}); } catch (e) {} await refreshTemplateList(); await onTemplateSelectChange(); templateSelect.addEventListener('change', onTemplateSelectChange); document.getElementById('btn-new').addEventListener('click', onNew); document.getElementById('btn-save').addEventListener('click', onSave); document.getElementById('btn-save-as').addEventListener('click', onSaveAs); document.getElementById('btn-delete').addEventListener('click', onDelete); btnEdit.addEventListener('click', () => switchMode('edit')); btnRead.addEventListener('click', () => switchMode('read')); if (btnHtml) btnHtml.addEventListener('click', () => switchMode('html')); document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf); const toggleA4 = document.getElementById('toggle-a4-preview'); if (toggleA4) { const a4Label = toggleA4.closest('.a4-toggle'); const syncA4Checked = () => { editorContainer.classList.toggle('a4-preview', toggleA4.checked); if (a4Label) a4Label.classList.toggle('checked', toggleA4.checked); }; toggleA4.addEventListener('change', syncA4Checked); syncA4Checked(); } const headingStyleSelect = document.getElementById('heading-numbering-style'); if (headingStyleSelect) { headingStyleSelect.value = Editor.getHeadingNumberingStyle(); headingStyleSelect.addEventListener('change', () => Editor.setHeadingNumberingStyle(headingStyleSelect.value)); } const btnTogglePanel = document.getElementById('btn-toggle-panel'); const toolbarPanel = document.getElementById('toolbar-panel'); if (btnTogglePanel && toolbarPanel) { btnTogglePanel.addEventListener('click', () => { const willOpen = toolbarPanel.hidden; toolbarPanel.hidden = !willOpen; btnTogglePanel.setAttribute('aria-expanded', String(willOpen)); if (willOpen) { Variables.refreshLinkRulesPanel(); if (templateNameInput) templateNameInput.focus(); } }); } updateTableIndicator(GristAPI.getCurrentTableId()); await switchMode('edit'); setStatus('Widget prêt.'); }
  init();
})();
