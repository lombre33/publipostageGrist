// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles
// + une colonne PJ (Attachments) dédiée par image insérée (v1.10.0)
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

  // Crée une nouvelle colonne Pièce jointe dédiée à une image insérée dans le modèle.
  // Une colonne par image (et non une colonne partagée) afin que chaque pièce jointe
  // reste référencée par une cellule Grist et ne soit jamais purgée comme « orpheline ».
  async function createImageColumn() {
    await ensureTableExists();
    const colId = 'ImagePJ_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await grist.docApi.applyUserActions([
      ['AddVisibleColumn', TABLE_NAME, colId, { type: 'Attachments', isFormula: false, label: 'Image' }]
    ]);
    return colId;
  }

  // Rattache une pièce jointe déjà uploadée (attachmentId) à la ligne du modèle courant,
  // dans la colonne dédiée créée par createImageColumn().
  async function attachImage(templateId, colId, attachmentId) {
    if (!templateId || !colId || !attachmentId) return;
    await grist.docApi.applyUserActions([
      ['UpdateRecord', TABLE_NAME, templateId, { [colId]: ['L', attachmentId] }]
    ]);
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
    const columns = { Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now };
    for (const column of ['Nom', 'Contenu', 'NomFichierPDF', 'DateModif']) {
      if (!(column in columns)) console.warn(`[templates] Colonne attendue absente : ${column}`);
    }
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, columns]
      ]);
      return id;
    } else {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns]
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

  return { loadAll, getCached, getCurrentId, setCurrentId, save, remove, createImageColumn, attachImage, TABLE_NAME };
})();