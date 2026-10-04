// Rangement des modèles par personne (épingle, dossier, dossier replié par défaut) : planning/feature-rangement-tri-modeles.md.
// Table dédiée Publipostage_PreferencesModeles : une préférence est une relation (personne × modèle), pas un attribut du modèle (même principe que
// Publipostage_Commentaires, js/comments.js) ; elle évite aussi de toucher aux colonnes de Templates.save().
// Identification : GristAPI.getCurrentUserEmail(). Si elle échoue, repli anonyme silencieux (Utilisateur = '') plutôt que de bloquer l'action :
// épingle et dossier deviennent alors une préférence partagée par toutes les personnes sans identité résolue (comme Auteur = '' des commentaires).
// État d'un dossier : un dossier n'existe que par le champ Dossier des lignes de modèles, son état ne peut pas vivre sur l'une d'elles. Il vit sur
// une ligne à part de cette table, une par (personne × dossier) : ModeleId = 0, Dossier = le chemin, Replie = vrai si le dossier s'ouvre replié. Ces
// lignes ne passent jamais par `cache` (getCached(), isPinned(), getFolder() et listFolders() ne les voient pas) : `folderStates` en est le seul
// lecteur.
const TemplatePreferences = (function () {
  const TABLE_NAME = 'Publipostage_PreferencesModeles';
  // Sentinelle de la ligne « état d'un dossier » : un vrai ModeleId (id de ligne Grist) est toujours >= 1.
  const FOLDER_ROW_MODELE_ID = 0;

  let tableChecked = false;
  async function ensureTableExists() {
    if (tableChecked) return;
    const tables = await grist.docApi.listTables();
    if (!tables.includes(TABLE_NAME)) {
      try {
        await grist.docApi.applyUserActions([
          ['AddTable', TABLE_NAME, [
            { id: 'Utilisateur', type: 'Text' },
            { id: 'ModeleId', type: 'Int' },
            { id: 'Epingle', type: 'Bool' },
            // Chemin complet séparé par « / » (ex. « Factures/Clients A ») : des dossiers imbriqués sans changer de schéma.
            { id: 'Dossier', type: 'Text' },
            // Replie : uniquement sur les lignes ModeleId = 0 (état d'un dossier).
            { id: 'Replie', type: 'Bool' },
          ]]
        ]);
        if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(TABLE_NAME);
      } catch (e) {
        console.error('Erreur création table préférences de rangement', e);
        return;
      }
    }
    tableChecked = true;
  }

  // Absente des documents créés avant cette fonction, et AddRecord/UpdateRecord sur une colonne inconnue annule toute l'action : relire le schéma
  // puis n'ajouter la colonne que si elle manque (deux AddVisibleColumn simultanés créeraient Replie et Replie2). Seul setFolderCollapsed l'appelle,
  // en série par folderWriteQueue ; jamais au démarrage.
  let replieColumnPresent = false;
  async function ensureReplieColumn() {
    if (replieColumnPresent) return;
    const data = await grist.docApi.fetchTable(TABLE_NAME);
    if (!('Replie' in data)) {
      await grist.docApi.applyUserActions([
        ['AddVisibleColumn', TABLE_NAME, 'Replie', { type: 'Bool', isFormula: false, label: 'Dossier replié par défaut' }]
      ]);
    }
    replieColumnPresent = true;
  }

  let cachedEmail; // undefined = jamais résolu, null = résolution tentée et échouée (repli anonyme)
  async function currentUserEmail() {
    if (cachedEmail !== undefined) return cachedEmail;
    try {
      cachedEmail = await GristAPI.getCurrentUserEmail();
    } catch (e) {
      cachedEmail = null;  // repli anonyme, jamais bloquant
    }
    return cachedEmail;
  }

  // "  Factures / / 2024 " -> "Factures/2024" ; chaîne vide/segments vides -> null (aucun dossier).
  function normalizeFolderPath(path) {
    if (!path) return null;
    const cleaned = String(path).split('/').map((s) => s.trim()).filter(Boolean).join('/');
    return cleaned || null;
  }

  // Préférences de la personne courante uniquement : { [modeleId]: { rowId, epingle, dossier } }, jamais celles des autres.
  let cache = null;

  // { [chemin normalisé]: { rowId, replie, saved } } pour la personne courante. `replie` est l'état affiché (mis à jour avant l'écriture), `saved` le
  // dernier état confirmé par Grist (retour arrière si l'écriture échoue). Object.create(null) : un dossier nommé « constructor » ou « __proto__ » ne
  // doit pas retrouver une propriété héritée.
  let folderStates = Object.create(null);

  async function loadForCurrentUser() {
    await ensureTableExists();
    cache = {};
    folderStates = Object.create(null);
    // '' sans court-circuit : une préférence écrite en repli anonyme doit se relire dans la même session anonyme, sinon épingler puis rouvrir l'arbre
    // « oublierait » l'épingle.
    const email = (await currentUserEmail()) || '';
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      // Schéma relu à chaque chargement : Replie peut manquer (document ancien) ou avoir été ajoutée ailleurs.
      replieColumnPresent = ('Replie' in data);
      for (let i = 0; i < data.id.length; i++) {
        if ((data.Utilisateur[i] || '') !== email) continue;
        if (data.ModeleId[i] === FOLDER_ROW_MODELE_ID) {
          const chemin = normalizeFolderPath(data.Dossier[i]);
          const replie = !!(data.Replie && data.Replie[i]);
          // Plusieurs lignes pour un même dossier (double écriture d'un autre onglet) : la première fait foi, c'est celle que setFolderCollapsed met
          // à jour.
          if (chemin && !folderStates[chemin]) folderStates[chemin] = { rowId: data.id[i], replie, saved: replie };
          continue;
        }
        cache[data.ModeleId[i]] = {
          rowId: data.id[i],
          epingle: !!data.Epingle[i],
          dossier: normalizeFolderPath(data.Dossier[i]),
        };
      }
    } catch (e) {
      console.error('Erreur chargement préférences de rangement', e);
    }
    return cache;
  }

  function getCached() { return cache || {}; }

  // patch = { Epingle } et/ou { Dossier }. Une identification indisponible ne lève pas (repli '') ; seule une panne d'écriture Grist remonte à
  // l'appelant.
  async function upsert(modeleId, patch) {
    await ensureTableExists();
    const email = (await currentUserEmail()) || '';
    if (!cache) await loadForCurrentUser();
    const id = Number(modeleId);
    const existing = cache[id];
    if (existing) {
      await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, existing.rowId, patch]]);
      if ('Epingle' in patch) existing.epingle = !!patch.Epingle;
      if ('Dossier' in patch) existing.dossier = normalizeFolderPath(patch.Dossier);
      return existing;
    }
    const columns = Object.assign({ Utilisateur: email, ModeleId: id, Epingle: false, Dossier: '' }, patch);
    const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
    const row = { rowId: result.retValues[0], epingle: !!columns.Epingle, dossier: normalizeFolderPath(columns.Dossier) };
    cache[id] = row;
    return row;
  }

  function setPinned(modeleId, pinned) { return upsert(modeleId, { Epingle: !!pinned }); }
  function setFolder(modeleId, path) { return upsert(modeleId, { Dossier: normalizeFolderPath(path) || '' }); }

  // Écritures d'état de dossier en file : deux clics rapides sur le même interrupteur ne doivent pas créer deux lignes (la seconde ne verrait pas
  // encore le rowId de la première).
  let folderWriteQueue = Promise.resolve();

  function isFolderCollapsed(path) {
    const key = normalizeFolderPath(path);
    const state = key && folderStates[key];
    return !!(state && state.replie);
  }

  // Met l'état à jour tout de suite (l'interface se redessine sans attendre Grist), puis écrit ; en cas d'échec, revient au dernier état confirmé et
  // relève l'erreur (l'appelant redessine : js/template-organize-modal.js:toggleFolderDefault).
  function setFolderCollapsed(path, collapsed) {
    const key = normalizeFolderPath(path);
    if (!key) return Promise.resolve(null);
    const state = folderStates[key] || (folderStates[key] = { rowId: null, replie: false, saved: false });
    state.replie = !!collapsed;
    const job = folderWriteQueue.then(async () => {
      await ensureTableExists();
      await ensureReplieColumn();
      const wanted = state.replie;  // l'état le plus récent : plusieurs clics de suite font une seule écriture utile
      if (state.rowId != null) {
        if (wanted === state.saved) return state;
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, state.rowId, { Replie: wanted }]]);
      } else {
        if (!wanted) return state;  // « déplié » est l'état par défaut : pas de ligne à créer
        const email = (await currentUserEmail()) || '';
        const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, {
          Utilisateur: email, ModeleId: FOLDER_ROW_MODELE_ID, Epingle: false, Dossier: key, Replie: true,
        }]]);
        state.rowId = result.retValues[0];
      }
      state.saved = wanted;
      return state;
    });
    folderWriteQueue = job.catch(() => {});
    return job.catch((e) => { state.replie = state.saved; throw e; });
  }

  function isPinned(modeleId) { const r = cache && cache[Number(modeleId)]; return !!(r && r.epingle); }
  function getFolder(modeleId) { const r = cache && cache[Number(modeleId)]; return r ? r.dossier : null; }

  function listFolders() {
    const set = new Set();
    Object.keys(cache || {}).forEach((id) => { const d = cache[id].dossier; if (d) set.add(d); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  return {
    loadForCurrentUser, getCached, setPinned, setFolder, isPinned, getFolder, listFolders,
    isFolderCollapsed, setFolderCollapsed, normalizeFolderPath,
  };
})();
