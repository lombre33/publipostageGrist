// Rangement des modèles PAR UTILISATEUR (épingle + dossier + dossier replié par défaut) - planning/feature-rangement-tri-modeles.md.
// Table interne dédiée (Publipostage_PreferencesModeles), pas une colonne sur Publipostage_Modeles :
// une préférence est une relation (utilisateur × modèle), pas un attribut d'un seul modèle - même
// principe que Publipostage_Commentaires (js/comments.js), déjà accepté sur ce projet pour la même
// raison. Conséquence utile : ce fichier ne touche ni le littéral `columns` de Templates.save()
// (js/templates.js:251-257) ni les 11 colonnes du même UpdateRecord, donc n'hérite pas de leur
// absence de détection de conflit (cf. project-publipostage-autosave-conflict-mechanics).
//
// Identification : GristAPI.getCurrentUserEmail() (js/grist-api.js), déjà utilisé en production par
// les commentaires - même repli anonyme SILENCIEUX si l'identification échoue (permissions, etc.),
// Utilisateur='' plutôt que de bloquer l'action (cf. js/comments.js:64, Auteur='' de la même façon) :
// dans ce cas dégradé, épingle/dossier deviennent une préférence "anonyme" partagée par quiconque n'a
// pas d'identité résolue, plutôt que de perdre l'action entièrement. Vérifié le 2026-09-21 par
// dev-tests/scenarios-template-tree.js : le harnais de test lui-même n'a aucune identité Grist réelle,
// exactement le cas que ce repli couvre.
//
// Dossier replié par défaut (29/09, demande d'Antoine : "un dossier apparaît déplié ou replié dans la
// dropdown, si on peut save le choix par utilisateur ça serait top") : un dossier n'a pas d'existence
// propre (c'est le champ Dossier des lignes ci-dessous, cf. js/template-organize-modal.js), son état ne peut
// donc pas vivre sur "une ligne de modèle" - il y en a autant que de modèles dans le dossier, et l'état
// se perdrait quand le dernier en sort. Il vit sur une ligne à part de CETTE table, une par (utilisateur ×
// dossier) : ModeleId = 0 (jamais un vrai id de ligne Grist), Dossier = le chemin, colonne Replie = vrai si
// le dossier s'ouvre replié. Une colonne (Replie), pas une nouvelle table ; ajoutée à un document existant
// par ensureReplieColumn(). Ces lignes ne passent JAMAIS par `cache` (getCached()/isPinned()/getFolder()/
// listFolders() ne les voient pas) : `folderStates` en est le seul lecteur.
const TemplatePreferences = (function () {
  const TABLE_NAME = 'Publipostage_PreferencesModeles';
  // Sentinelle de la ligne "état d'un dossier" (cf. commentaire d'en-tête) : un vrai ModeleId est un id de ligne Grist, toujours >= 1.
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
            // Chemin complet séparé par "/" (ex. "Factures/Clients A") - permet des dossiers imbriqués
            // sans changer de schéma si le besoin se confirme (planning/feature-rangement-tri-modeles.md §7.1).
            { id: 'Dossier', type: 'Text' },
            // Dossier replié par défaut : uniquement sur les lignes ModeleId = 0 (cf. commentaire d'en-tête).
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

  // Colonne Replie (dossier replié par défaut) : un document créé avant cette fonction ne l'a pas, et AddRecord/UpdateRecord sur une colonne
  // inconnue ANNULE toute l'action (cf. dev-tests/grist-stub.js). Même patron que ensureXxxColumn de js/templates.js : relire le schéma
  // (fetchTable) puis n'ajouter que si elle manque - deux AddVisibleColumn simultanés créeraient Replie et Replie2. Seul setFolderCollapsed
  // l'appelle, et ses écritures passent une par une par folderWriteQueue : pas de deuxième appel en vol. Jamais lue au démarrage.
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
      cachedEmail = null; // même politique que js/comments.js:64 - jamais bloquant
    }
    return cachedEmail;
  }

  // "  Factures / / 2024 " -> "Factures/2024" ; chaîne vide/segments vides -> null (aucun dossier).
  function normalizeFolderPath(path) {
    if (!path) return null;
    const cleaned = String(path).split('/').map((s) => s.trim()).filter(Boolean).join('/');
    return cleaned || null;
  }

  // { [modeleId]: { rowId, epingle: bool, dossier: string|null } } pour l'utilisateur courant
  // uniquement - jamais les préférences des autres, ni en cache ni chargées.
  let cache = null;

  // { [chemin normalisé]: { rowId, replie, saved } } pour l'utilisateur courant. `replie` est l'état AFFICHÉ (mis à jour tout de suite par
  // setFolderCollapsed, avant l'écriture), `saved` le dernier état confirmé par Grist (retour arrière si l'écriture échoue).
  // Object.create(null) : un dossier nommé "constructor" ou "__proto__" ne doit pas retrouver une propriété héritée (même piège que
  // TemplateOrganizer.buildView).
  let folderStates = Object.create(null);

  async function loadForCurrentUser() {
    await ensureTableExists();
    cache = {};
    folderStates = Object.create(null);
    // '' (pas de court-circuit ici) : une préférence écrite en repli anonyme (upsert ci-dessous) doit
    // pouvoir être relue dans la même session anonyme, exactement comme un commentaire à Auteur=''
    // reste lisible par tous (js/comments.js) - sans ce round-trip, épingler puis rouvrir l'arbre
    // "oublierait" l'épingle qu'on vient de poser.
    const email = (await currentUserEmail()) || '';
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      // Un schéma relu à chaque chargement : la colonne Replie peut manquer (document créé avant cette fonction) ou avoir été ajoutée ailleurs.
      replieColumnPresent = ('Replie' in data);
      for (let i = 0; i < data.id.length; i++) {
        if ((data.Utilisateur[i] || '') !== email) continue;
        if (data.ModeleId[i] === FOLDER_ROW_MODELE_ID) {
          const chemin = normalizeFolderPath(data.Dossier[i]);
          const replie = !!(data.Replie && data.Replie[i]);
          // Si plusieurs lignes existent pour un même dossier (double écriture d'un autre onglet), la première fait foi : c'est celle que
          // setFolderCollapsed met à jour ensuite.
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

  // patch = { Epingle } et/ou { Dossier } (colonnes Grist telles quelles). Ne lève jamais pour une
  // identification indisponible (repli '' silencieux, cf. commentaire d'en-tête) - seule une vraie
  // panne d'écriture Grist (applyUserActions) remonte à l'appelant.
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

  // Écritures d'état de dossier mises en file : deux clics rapides sur le même interrupteur ne doivent jamais créer deux lignes pour un même
  // dossier (la seconde écriture verrait "pas de ligne" avant que la première n'ait rendu son rowId).
  let folderWriteQueue = Promise.resolve();

  function isFolderCollapsed(path) {
    const key = normalizeFolderPath(path);
    const state = key && folderStates[key];
    return !!(state && state.replie);
  }

  // Met l'état à jour TOUT DE SUITE (l'interface se redessine sans attendre Grist), puis écrit. Si l'écriture échoue, revient au dernier état
  // confirmé et relève l'erreur : l'appelant redessine (cf. js/template-organize-modal.js:toggleFolderDefault).
  function setFolderCollapsed(path, collapsed) {
    const key = normalizeFolderPath(path);
    if (!key) return Promise.resolve(null);
    const state = folderStates[key] || (folderStates[key] = { rowId: null, replie: false, saved: false });
    state.replie = !!collapsed;
    const job = folderWriteQueue.then(async () => {
      await ensureTableExists();
      await ensureReplieColumn();
      const wanted = state.replie; // l'état le plus récent : plusieurs clics de suite se ramènent à une seule écriture utile
      if (state.rowId != null) {
        if (wanted === state.saved) return state;
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, state.rowId, { Replie: wanted }]]);
      } else {
        if (!wanted) return state; // pas de ligne à créer pour "s'ouvre déplié" : c'est l'état par défaut
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
    TABLE_NAME, loadForCurrentUser, getCached, setPinned, setFolder, isPinned, getFolder, listFolders,
    isFolderCollapsed, setFolderCollapsed, normalizeFolderPath,
  };
})();
