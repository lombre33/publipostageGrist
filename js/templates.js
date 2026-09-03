// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Modeles';
  let templatesCache = [];
  let currentTemplateId = null;

  async function ensureTableExists() {
    const tables = await grist.docApi.listTables();
    if (tables.includes(TABLE_NAME)) return;
    try {
      await grist.docApi.applyUserActions([
        ['AddTable', TABLE_NAME, [
          { id: 'Nom', type: 'Text' },
          { id: 'Contenu', type: 'Text' },
          { id: 'NomFichierPDF', type: 'Text' },
          { id: 'DateModif', type: 'DateTime' }
        ]]
      ]);
    } catch (e) {
      console.error('Erreur création table modèles', e);
    }
  }

  async function loadAll() {
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      templatesCache = [];
      for (let i = 0; i < data.id.length; i++) {
        templatesCache.push({
          id: data.id[i],
          nom: data.Nom[i],
          contenu: data.Contenu[i],
          nomFichierPDF: data.NomFichierPDF ? data.NomFichierPDF[i] : ''
        });
      }
    } catch (e) {
      console.error('Erreur chargement modèles', e);
      templatesCache = [];
    }
    return templatesCache;
  }

  function getCached() { return templatesCache; }
  function getCurrentId() { return currentTemplateId; }
  function setCurrentId(id) { currentTemplateId = id; }

  async function save(id, nom, contenuHtml, nomFichierPDF) {
    await ensureTableExists();
    const now = new Date().toISOString();
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, { Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now }]
      ]);
      return id;
    } else {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, { Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now }]
      ]);
      const newId = result.retValues[0];
      currentTemplateId = newId;
      return newId;
    }
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
  }

  function getElement(id) { return document.getElementById(id); }

  function populateSelect() {
    const select = getElement('template-select');
    if (!select) return;
    const selected = currentTemplateId == null ? '' : String(currentTemplateId);
    select.innerHTML = '<option value="">-- Nouveau modèle --</option>';
    templatesCache.forEach(template => {
      const option = document.createElement('option');
      option.value = String(template.id);
      option.textContent = template.nom || `Modèle ${template.id}`;
      option.selected = String(template.id) === selected;
      select.appendChild(option);
    });
  }

  async function init() {
    await loadAll();
    populateSelect();
    if (templatesCache.length && currentTemplateId == null) await loadTemplate(templatesCache[0].id);
    return templatesCache;
  }

  async function newTemplate() {
    currentTemplateId = null;
    const name = getElement('template-name'); const filename = getElement('pdf-filename-template');
    if (name) name.value = ''; if (filename) filename.value = '';
    if (typeof Editor !== 'undefined' && Editor.setHTML) Editor.setHTML('');
    const select = getElement('template-select'); if (select) select.value = '';
  }

  async function saveCurrentTemplate() {
    const name = getElement('template-name'); const filename = getElement('pdf-filename-template');
    const nom = name && name.value.trim() ? name.value.trim() : 'Nouveau modèle';
    const contenu = typeof Editor !== 'undefined' ? Editor.getHTML() : '';
    const id = await save(currentTemplateId, nom, contenu, filename ? filename.value : '');
    currentTemplateId = id; await loadAll(); populateSelect(); return id;
  }

  async function loadTemplate(id) {
    if (id === '' || id == null) return newTemplate();
    const template = templatesCache.find(t => String(t.id) === String(id));
    if (!template) return null;
    currentTemplateId = template.id;
    const name = getElement('template-name'); const filename = getElement('pdf-filename-template');
    if (name) name.value = template.nom || ''; if (filename) filename.value = template.nomFichierPDF || '';
    if (typeof Editor !== 'undefined' && Editor.setHTML) Editor.setHTML(template.contenu || '');
    populateSelect(); return template;
  }

  return { loadAll, getCached, getCurrentId, setCurrentId, save, remove, init, newTemplate, saveCurrentTemplate, loadTemplate, populateSelect, TABLE_NAME };
})();
