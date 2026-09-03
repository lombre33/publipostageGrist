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

  return { loadAll, getCached, getCurrentId, setCurrentId, save, remove, TABLE_NAME };
})();
