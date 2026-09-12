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

  // Colonne ajoutée APRÈS la création initiale de la table (v2, en-têtes/pieds
  // de page) - AddTable ne concerne que les tout nouveaux documents, un
  // document existant a besoin de ce chemin de migration dédié, même schéma
  // que createImageColumn ci-dessus (AddVisibleColumn, idempotent - ne fait
  // rien si la colonne existe déjà).
  let headerFooterColumnChecked = false;
  async function ensureHeaderFooterColumn() {
    if (headerFooterColumnChecked) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!('HeaderFooter' in data)) {
        await grist.docApi.applyUserActions([
          ['AddVisibleColumn', TABLE_NAME, 'HeaderFooter', { type: 'Text', isFormula: false, label: 'En-tête / pied de page' }]
        ]);
      }
      headerFooterColumnChecked = true;
    } catch (e) {
      console.error('Erreur migration colonne HeaderFooter', e);
    }
  }

  // Forme par défaut si absente/invalide - DOIT rester cohérente avec la
  // forme utilisée côté js/editor.js (dupliquée plutôt qu'importée, ces
  // deux fichiers ne partagent aucun mécanisme de module - même tolérance à
  // la duplication que le reste de ce projet pour ce genre de petite forme).
  function safeParseHeaderFooter(json) {
    const empty = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    if (!json) return empty;
    try {
      const parsed = JSON.parse(json);
      return Object.assign(empty, parsed, {
        header: Object.assign({}, empty.header, parsed.header),
        footer: Object.assign({}, empty.footer, parsed.footer),
      });
    } catch (e) {
      return empty;
    }
  }

  async function loadAll() {
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      templatesCache = [];
      for (let i = 0; i < data.id.length; i++) {
        templatesCache.push({
          id: data.id[i],
          nom: data.Nom[i],
          contenu: data.Contenu[i],
          nomFichierPDF: data.NomFichierPDF ? data.NomFichierPDF[i] : '',
          headerFooter: safeParseHeaderFooter(data.HeaderFooter ? data.HeaderFooter[i] : null)
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

  async function save(id, nom, contenuHtml, nomFichierPDF, headerFooterData) {
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    const now = new Date().toISOString();
    const columns = { Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now, HeaderFooter: JSON.stringify(headerFooterData || safeParseHeaderFooter(null)) };
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