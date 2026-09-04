/**
 * Main - Gestion du widget de publipostage Grist
 */

let currentMode = 'edit'; // 'edit' ou 'read'
let currentRecord = null; // La ligne actuellement sélectionnée
let currentTableId = null; // La table courante du widget

// Récupérer les éléments DOM
const editorContainer = document.getElementById('editor-container');
const readerContainer = document.getElementById('reader-container');
const modeToggleBtn = document.getElementById('mode-toggle');
const downloadPdfBtn = document.getElementById('download-pdf');
const modelSelect = document.getElementById('model-select');
const saveModelBtn = document.getElementById('save-model');
const newModelBtn = document.getElementById('new-model');
const pdfFilenameInput = document.getElementById('pdf-filename');
const statusDiv = document.getElementById('status');
const debugDiv = document.getElementById('debug-info');

// Vérifier que tous les éléments existent avant d'en utiliser
if (!editorContainer || !readerContainer || !modeToggleBtn || !downloadPdfBtn) {
  console.error('[main] Erreur: éléments DOM critiques manquants');
  if (statusDiv) statusDiv.innerHTML = '⚠ Erreur: widget non correctement initialisé';
}

/**
 * Charge un modèle dans l'éditeur
 */
function loadTemplateIntoEditor(template) {
  if (!template || !editorContainer) return;
  
  try {
    EditorModule.setContent(template.content || '');
    if (pdfFilenameInput) {
      pdfFilenameInput.value = template.pdfFilename || '';
    }
  } catch (err) {
    console.error('[main] Erreur lors du chargement du template:', err);
  }
}

/**
 * Événement: changement de sélection de modèle
 */
function onTemplateSelectChange() {
  const selectedId = modelSelect?.value;
  if (!selectedId) return;
  
  try {
    const template = Templates.getTemplate(selectedId);
    if (template) {
      loadTemplateIntoEditor(template);
    }
  } catch (err) {
    console.error('[main] Erreur onTemplateSelectChange:', err);
  }
}

/**
 * Événement: créer un nouveau modèle
 */
function onNewModel() {
  try {
    const newTemplate = Templates.createNewTemplate();
    if (newTemplate) {
      Templates.refreshModelSelect();
      // Sélectionner le nouveau modèle
      if (modelSelect) modelSelect.value = newTemplate.id;
      loadTemplateIntoEditor(newTemplate);
    }
  } catch (err) {
    console.error('[main] Erreur onNewModel:', err);
  }
}

/**
 * Événement: enregistrer le modèle courant
 */
function onSaveModel() {
  const modelId = modelSelect?.value;
  if (!modelId) {
    console.warn('[main] Aucun modèle sélectionné pour la sauvegarde');
    return;
  }
  
  try {
    const content = EditorModule.getContent();
    const pdfFilename = pdfFilenameInput?.value || 'document';
    
    const updated = Templates.updateTemplate(modelId, {
      content: content,
      pdfFilename: pdfFilename
    });
    
    if (updated) {
      console.log('[main] Modèle sauvegardé:', modelId);
      if (statusDiv) statusDiv.innerHTML = '✓ Modèle sauvegardé';
      setTimeout(() => {
        if (statusDiv) statusDiv.innerHTML = '';
      }, 2000);
    }
  } catch (err) {
    console.error('[main] Erreur onSaveModel:', err);
    if (statusDiv) statusDiv.innerHTML = '⚠ Erreur lors de la sauvegarde';
  }
}

/**
 * Événement: basculer mode édition ↔ lecture
 */
function onToggleMode() {
  if (currentMode === 'edit') {
    // Passer en mode lecture
    if (!currentRecord || !currentTableId) {
      console.warn('[main] Aucune ligne sélectionnée ou table indisponible');
      if (statusDiv) statusDiv.innerHTML = '⚠ Aucune ligne sélectionnée dans Grist';
      return;
    }
    
    try {
      currentMode = 'read';
      editorContainer.style.display = 'none';
      readerContainer.style.display = 'block';
      if (modeToggleBtn) modeToggleBtn.textContent = 'Mode Édition';
      
      // Rendu du mode lecture avec le record courant
      ReaderMode.render(EditorModule.getContent(), currentRecord, currentTableId);
    } catch (err) {
      console.error('[main] Erreur lors du passage en mode lecture:', err);
      currentMode = 'edit';
      if (statusDiv) statusDiv.innerHTML = '⚠ Erreur mode lecture';
    }
  } else {
    // Revenir en mode édition
    currentMode = 'edit';
    editorContainer.style.display = 'block';
    readerContainer.style.display = 'none';
    if (modeToggleBtn) modeToggleBtn.textContent = 'Mode Lecture';
  }
}

/**
 * Événement: télécharger le PDF
 */
function onDownloadPdf() {
  if (!currentRecord || !currentTableId) {
    console.warn('[main] Aucune ligne sélectionnée pour PDF');
    if (statusDiv) statusDiv.innerHTML = '⚠ Sélectionnez une ligne';
    return;
  }
  
  try {
    const filename = pdfFilenameInput?.value || 'document';
    PdfExport.downloadPdf(
      EditorModule.getContent(),
      currentRecord,
      currentTableId,
      filename
    );
  } catch (err) {
    console.error('[main] Erreur téléchargement PDF:', err);
    if (statusDiv) statusDiv.innerHTML = '⚠ Erreur PDF';
  }
}

/**
 * Callback appelé quand la ligne Grist change (via polling ou onRecord)
 * @param {Object} record - Le nouveau record
 */
function onRecordChanged(record) {
  console.log('[main] onRecordChanged: record reçu, id=', record?.id);
  
  currentRecord = record;
  
  // Mettre à jour l'indicateur de débogage
  if (debugDiv && record && record.id !== undefined) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR');
    debugDiv.textContent = `Ligne courante: ${record.id} — reçu à ${timeStr}`;
  }
  
  // Si on est en mode lecture, re-rendre avec le nouveau record
  if (currentMode === 'read' && currentTableId) {
    try {
      console.log('[main] Rendu mode lecture avec nouveau record');
      ReaderMode.render(EditorModule.getContent(), record, currentTableId);
    } catch (err) {
      console.error('[main] Erreur re-rendu mode lecture:', err);
    }
  }
}

/**
 * Initialisation du widget
 */
async function init() {
  console.log('[main] Initialisation du widget');
  
  if (statusDiv) statusDiv.innerHTML = 'Initialisation...';
  
  try {
    // Initialiser l'API Grist
    const gristReady = await GristAPI.init();
    if (!gristReady) {
      throw new Error('GristAPI non initialisée');
    }
    
    // Récupérer la table courante
    currentTableId = GristAPI.getCurrentTableId();
    console.log('[main] Table courante détectée:', currentTableId);
    
    // S'abonner aux changements de ligne
    GristAPI.onRecordChange(onRecordChanged);
    
    // Initialiser le module d'édition (Quill)
    EditorModule.init();
    
    // Charger les modèles de templates
    Templates.loadTemplatesFromGrist(currentTableId);
    Templates.refreshModelSelect();
    
    // Si un modèle existe par défaut, le charger
    const models = Templates.getAllTemplates();
    if (models.length > 0) {
      if (modelSelect) modelSelect.value = models[0].id;
      loadTemplateIntoEditor(models[0]);
    }
    
    // Attacher les event listeners
    if (modelSelect) modelSelect.addEventListener('change', onTemplateSelectChange);
    if (newModelBtn) newModelBtn.addEventListener('click', onNewModel);
    if (saveModelBtn) saveModelBtn.addEventListener('click', onSaveModel);
    if (modeToggleBtn) modeToggleBtn.addEventListener('click', onToggleMode);
    if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', onDownloadPdf);
    
    if (statusDiv) statusDiv.innerHTML = `Widget prêt. Table: ${currentTableId || 'détection en cours...'}`;
    
  } catch (err) {
    console.error('[main] Erreur lors de l\'initialisation:', err);
    if (statusDiv) statusDiv.innerHTML = `⚠ Erreur initialisation: ${err.message}`;
  }
}

// Démarrer l'initialisation
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
