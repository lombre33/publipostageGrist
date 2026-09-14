// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles.
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

  // Colonne ajoutée APRÈS la création initiale de la table (v2, en-têtes/pieds de page) - AddTable ne concerne que les tout nouveaux documents, un document
  // existant a besoin de ce chemin de migration dédié (idempotent - ne fait rien si la colonne existe déjà).
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

  // Forme par défaut si absente/invalide - DOIT rester cohérente avec la forme utilisée côté js/editor.js (dupliquée plutôt qu'importée, ces deux fichiers ne
  // partagent aucun mécanisme de module - même tolérance à la duplication que le reste de ce projet pour ce genre de petite forme).
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
          headerFooter: safeParseHeaderFooter(data.HeaderFooter ? data.HeaderFooter[i] : null),
          // Utilisé par js/main.js (auto-save) pour détecter qu'une autre personne a enregistré ce même modèle entre deux vérifications - jamais affiché
          // tel quel à l'utilisateur.
          dateModif: data.DateModif ? data.DateModif[i] : null,
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

  // Renvoie { id, dateModif } (pas juste l'id) : js/main.js (auto-save) a besoin de connaître le DateModif qu'IL vient d'écrire, pour le distinguer d'un
  // DateModif différent constaté plus tard (preuve qu'quelqu'un d'autre a enregistré ce modèle entre-temps).
  async function save(id, nom, contenuHtml, nomFichierPDF, headerFooterData) {
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    const now = new Date().toISOString();
    const columns = { Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now, HeaderFooter: JSON.stringify(headerFooterData || safeParseHeaderFooter(null)) };
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, columns]
      ]);
      return { id, dateModif: now };
    } else {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns]
      ]);
      const newId = result.retValues[0];
      currentTemplateId = newId;
      return { id: newId, dateModif: now };
    }
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
  }

  return { loadAll, getCached, getCurrentId, setCurrentId, save, remove, TABLE_NAME };
})();