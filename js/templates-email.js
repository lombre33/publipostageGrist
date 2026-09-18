// Module de gestion des modèles EMAIL : CRUD sur la table Grist Publipostage_Modeles_Email, table
// séparée de Publipostage_Modeles (décision actée, planning/feature-email-mode.md §3 - un modèle PDF
// peut contenir tableaux/images sans objet ici, et destinataires/objet n'ont aucun sens pour un
// modèle PDF). Module distinct de js/templates.js plutôt qu'un paramétrage de ce dernier : la table
// email est entièrement nouvelle, donc son schéma se crée en un seul AddTable, sans la moindre des
// migrations idempotentes (HeaderFooter/Margins/EstParDefaut/DateModif) que js/templates.js a dû
// accumuler au fil des évolutions du mode document - les rejouer ici n'aurait aucun sens, et
// paramétrer js/templates.js risquerait de perturber sa logique DateModif tout juste corrigée
// (cf. commit du jour "fix(autosave): faux conflit modifié ailleurs"). Même forme d'API publique que
// Templates (loadAll/getCached/getCurrentId/setCurrentId/getDefaultId/setDefault/save/remove) pour
// que js/main.js puisse traiter les deux stores de façon interchangeable selon le mode courant.
const TemplatesEmail = (function () {
  const TABLE_NAME = 'Publipostage_Modeles_Email';
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
          { id: 'Destinataires', type: 'Text' },
          { id: 'Cc', type: 'Text' },
          { id: 'Cci', type: 'Text' },
          { id: 'Objet', type: 'Text' },
          { id: 'EstParDefaut', type: 'Bool' },
          { id: 'DateModif', type: 'DateTime' },
        ]]
      ]);
    } catch (e) {
      console.error('Erreur création table modèles email', e);
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
          destinataires: data.Destinataires ? data.Destinataires[i] : '',
          cc: data.Cc ? data.Cc[i] : '',
          cci: data.Cci ? data.Cci[i] : '',
          objet: data.Objet ? data.Objet[i] : '',
          estParDefaut: !!(data.EstParDefaut && data.EstParDefaut[i]),
          // Même usage que Templates : comparaison auto-save, jamais affiché tel quel.
          dateModif: data.DateModif ? data.DateModif[i] : null,
        });
      }
    } catch (e) {
      console.error('Erreur chargement modèles email', e);
      templatesCache = [];
    }
    return templatesCache;
  }

  function getCached() { return templatesCache; }

  function getCurrentId() { return currentTemplateId; }

  function setCurrentId(id) { currentTemplateId = id; }

  function getDefaultId() {
    const found = templatesCache.find(t => t.estParDefaut);
    return found ? found.id : null;
  }

  // Un seul modèle par défaut à la fois, même logique que Templates.setDefault.
  async function setDefault(id) {
    await ensureTableExists();
    const actions = [];
    templatesCache.forEach(t => {
      if (t.estParDefaut && String(t.id) !== String(id)) actions.push(['UpdateRecord', TABLE_NAME, t.id, { EstParDefaut: false }]);
    });
    if (id != null) actions.push(['UpdateRecord', TABLE_NAME, id, { EstParDefaut: true }]);
    if (actions.length) await grist.docApi.applyUserActions(actions);
    templatesCache.forEach(t => { t.estParDefaut = (id != null && String(t.id) === String(id)); });
  }

  // Même précaution que Templates.readBackDateModif (js/templates.js) : ne jamais faire confiance à
  // la chaîne ISO qu'on vient nous-mêmes d'écrire, toujours relire ce que Grist a réellement stocké.
  async function readBackDateModif(rowId, fallback) {
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      const idx = data.id.indexOf(rowId);
      if (idx === -1 || !data.DateModif) return fallback;
      return data.DateModif[idx];
    } catch (e) {
      console.error('Erreur relecture DateModif après enregistrement (email)', e);
      return fallback;
    }
  }

  async function save(id, nom, contenuHtml, destinataires, cc, cci, objet) {
    await ensureTableExists();
    const now = new Date().toISOString();
    const columns = { Nom: nom, Contenu: contenuHtml, Destinataires: destinataires, Cc: cc, Cci: cci, Objet: objet, DateModif: now };
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, columns]
      ]);
      const dateModif = await readBackDateModif(id, now);
      return { id, dateModif };
    } else {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns]
      ]);
      const newId = result.retValues[0];
      currentTemplateId = newId;
      const dateModif = await readBackDateModif(newId, now);
      return { id: newId, dateModif };
    }
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
  }

  return { loadAll, getCached, getCurrentId, setCurrentId, getDefaultId, setDefault, save, remove, TABLE_NAME };
})();
