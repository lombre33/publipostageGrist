// Publipostage Grist — widget custom v1.2.3 — 2026-09-04
// Correctif du bandeau Select By : détection fiable via linking.asTarget
// + confirmation manuelle persistée (grist.setOption) créée dynamiquement.
console.log('[main] script chargé, timestamp:', new Date().toISOString(), 'v1.2.3');

(function () {
  let quill = null;
  let currentMode = 'edit'; // 'edit' | 'read'
  let currentTableId = null;
  let latestRecord = null;
  let latestRecordTableId = null;

  function buildSelectByWarningMessage(tableId) {
    const tbl = tableId || (GristAPI.getCurrentTableId() || 'NomTable');
    return "⚠ Mode lecture non dynamique : aucun lien 'Select By' détecté. Pour que le mode lecture se mette à jour automatiquement à chaque changement de ligne, configurez 'Select By : " + tbl + "' dans le panneau de configuration du widget (à droite dans Grist) ou cochez la case « Confirmer Select By » dans la barre d'outils du widget.";
  }

  function applySelectByWarning() {
    if (typeof ReaderMode === 'undefined' || !ReaderMode.setSelectByWarning) return;
    // Le bandeau est strictement réservé au mode lecture : les callbacks
    // Grist continuent d'arriver en mode édition et ne doivent jamais le réafficher.
    if (currentMode !== 'read') {
      ReaderMode.setSelectByWarning(null);
      console.log('[reader-mode] bandeau masqué (mode édition).');
      return;
    }
    const active = GristAPI.isSelectByActive();
    console.log('[reader-mode] état Select By=', active, 'mode=', currentMode,
      '=> bandeau=', active ? 'masqué' : 'affiché');
    ReaderMode.setSelectByWarning(active ? null : buildSelectByWarningMessage(currentTableId));
  }

  // Crée dynamiquement (sans modifier index.html) une case à cocher dans la
  // toolbar du mode édition pour permettre à l'utilisateur de confirmer
  // manuellement que le Select By est configuré. La valeur est persistée
  // par Grist via grist.setOption({ selectByConfirmed: true }) et
  // automatiquement ré-émise via onOptions au chargement suivant.
  let _selectByOverrideCheckbox = null;
  function ensureSelectByOverrideCheckbox() {
    if (_selectByOverrideCheckbox && document.body.contains(_selectByOverrideCheckbox)) {
      return _selectByOverrideCheckbox;
    }
    const toolbar = document.getElementById('toolbar') || document.getElementById('toolbar-top');
    if (!toolbar) {
      console.warn('[main] Toolbar absente : case Confirmer Select By non créée.');
      return null;
    }
    const label = document.createElement('label');
    label.id = 'selectby-override-label';
    label.style.cssText = 'margin-left:12px;font-size:0.85em;cursor:pointer;user-select:none;';
    label.title = "Cochez si vous avez configuré le lien 'Select By' dans le panneau de configuration du widget (repli robuste si Grist n'expose pas linking.asTarget).";
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'selectby-override';
    cb.style.cssText = 'margin-right:4px;vertical-align:middle;';
    cb.addEventListener('change', async function () {
      try {
        await GristAPI.setUserSelectByOverride(cb.checked);
        applySelectByWarning();
      } catch (e) {
        console.error('[main] échec application override Select By:', e);
      }
    });
    label.appendChild(cb);
    const span = document.createElement('span');
    span.textContent = "Confirmer Select By";
    label.appendChild(span);
    toolbar.appendChild(label);
    _selectByOverrideCheckbox = cb;
    console.log('[main] case "Confirmer Select By" créée dynamiquement dans la toolbar.');
    return cb;
  }

  function syncSelectByOverrideCheckbox() {
    const cb = ensureSelectByOverrideCheckbox();
    if (!cb) return;
    const current = !!GristAPI.getUserSelectByOverride();
    if (cb.checked !== current) {
      cb.checked = current;
      console.log('[main] case "Confirmer Select By" synchronisée à', current, '(depuis options Grist).');
    }
  }

  function getPdfFilenameInput() {
    return document.getElementById('pdf-filename-template')
      || document.getElementById('pdfFilenameInput')
      || document.getElementById('pdf-filename');
  }

  // BUG 1 — sécurisation : tous les accès à pdfFilenameInput passent par
  // cette fonction qui journalise un console.warn('[main] ...') explicite
  // si l'élément est absent (par exemple si index.html est modifié).
  function getPdfFilenameTemplate() {
    const pdfFilenameInput = getPdfFilenameInput();
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
  const toolbar = document.getElementById('toolbar');
  let ind = document.getElementById('table-indicator');
  const statusMsg = document.getElementById('status-msg');
  const templateSelect = document.getElementById('template-select');
  const templateNameInput = document.getElementById('template-name');

  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = isError ? 'error-msg' : '';
  }

  function updateTableIndicator(tableId) {
    if (!ind) {
      ind = document.createElement('span');
      ind.id = 'table-indicator';
      ind.style.marginLeft = '10px';
      ind.style.fontSize = '0.85em';
      ind.style.opacity = '0.8';
      if (toolbar) toolbar.appendChild(ind);
    }
    ind.textContent = tableId ? ('Table: ' + tableId) : 'Table: —';
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
    const pdfFilenameInput = getPdfFilenameInput();
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
    loadTemplateIntoEditor(null);
    setStatus('Modèle supprimé.');
  }

  async function switchMode(mode) {
    currentMode = mode;
    if (mode === 'edit') {
      btnEdit.classList.add('active');
      btnRead.classList.remove('active');
      editorContainer.style.display = 'block';
      readerContainer.style.display = 'none';
      if (quill) quill.enable(true);
      applySelectByWarning();
      return;
    }

    btnEdit.classList.remove('active');
    btnRead.classList.add('active');
    editorContainer.style.display = 'none';
    readerContainer.style.display = 'block';
    if (quill) quill.enable(false);
    applySelectByWarning();
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (record) {
      await renderReader(record, latestRecordTableId || currentTableId || GristAPI.getCurrentTableId());
    } else {
      await ReaderMode.render('', {});
    }
  }

  async function renderReader(record, tableId) {
    if (!record) return;
    try {
      const nomFichierPDF = getPdfFilenameTemplate();
      await ReaderMode.render(Editor.getHTML(), record, {
        resolveVariables: Variables.resolveAll,
        tableId,
        nomFichierPDF
      });
    } catch (e) {
      console.error('[main] Erreur rendu lecteur:', e);
      setStatus('Erreur rendu lecture : ' + e.message, true);
    }
  }

  async function onExportPdf() {
    const record = latestRecord || GristAPI.getCurrentRecord();
    if (!record) {
      setStatus('Aucune ligne sélectionnée.', true);
      return;
    }
    try {
      const nomFichierPDF = getPdfFilenameTemplate();
      await PdfExport.export(Editor.getHTML(), record, {
        resolveVariables: Variables.resolveAll,
        tableId: latestRecordTableId || currentTableId || GristAPI.getCurrentTableId(),
        nomFichierPDF
      });
      setStatus('PDF exporté.');
    } catch (e) {
      console.error('[main] Erreur export PDF:', e);
      setStatus('Erreur export PDF : ' + e.message, true);
    }
  }

  async function init() {
    try {
      await GristAPI.init();
    } catch (e) {
      setStatus('Erreur init API Grist.', true);
    }

    quill = Editor.init();

    if (typeof GristAPI.onSelectByChange === 'function') {
      GristAPI.onSelectByChange(() => {
        applySelectByWarning();
        if (currentMode === 'read' && (latestRecord || GristAPI.getCurrentRecord())) {
          renderReader(latestRecord || GristAPI.getCurrentRecord(), latestRecordTableId || GristAPI.getCurrentTableId());
        }
      });
    }

    GristAPI.onRecord(async function (record, tableId) {
      latestRecord = record;
      latestRecordTableId = tableId || GristAPI.getCurrentTableId();
      if (tableId) currentTableId = tableId;
      updateTableIndicator(latestRecordTableId);
      applySelectByWarning();
      if (currentMode === 'read' && record) await renderReader(record, latestRecordTableId);
    });

    // Abonnement aux options du widget (mapping colonnes, settings + selectByConfirmed)
    try {
      if (grist.onOptions) {
        grist.onOptions(function (options, settings) {
          console.log('[main] onOptions reçu: options=', options, 'settings=', settings);
          // Si Grist nous ré-émet `options.selectByConfirmed`, on resynchronise
          // la checkbox locale pour rester en phase avec l'état persistant.
          syncSelectByOverrideCheckbox();
          applySelectByWarning();
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

    updateTableIndicator(GristAPI.getCurrentTableId());
    applySelectByWarning();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
