// Rangement des modèles PAR UTILISATEUR (épingle + dossier) - planning/feature-rangement-tri-modeles.md.
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
const TemplatePreferences = (function () {
  const TABLE_NAME = 'Publipostage_PreferencesModeles';

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
          ]]
        ]);
      } catch (e) {
        console.error('Erreur création table préférences de rangement', e);
        return;
      }
    }
    tableChecked = true;
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

  async function loadForCurrentUser() {
    await ensureTableExists();
    cache = {};
    // '' (pas de court-circuit ici) : une préférence écrite en repli anonyme (upsert ci-dessous) doit
    // pouvoir être relue dans la même session anonyme, exactement comme un commentaire à Auteur=''
    // reste lisible par tous (js/comments.js) - sans ce round-trip, épingler puis rouvrir l'arbre
    // "oublierait" l'épingle qu'on vient de poser.
    const email = (await currentUserEmail()) || '';
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      for (let i = 0; i < data.id.length; i++) {
        if ((data.Utilisateur[i] || '') !== email) continue;
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

  function isPinned(modeleId) { const r = cache && cache[Number(modeleId)]; return !!(r && r.epingle); }
  function getFolder(modeleId) { const r = cache && cache[Number(modeleId)]; return r ? r.dossier : null; }

  function listFolders() {
    const set = new Set();
    Object.keys(cache || {}).forEach((id) => { const d = cache[id].dossier; if (d) set.add(d); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  return {
    TABLE_NAME, loadForCurrentUser, getCached, setPinned, setFolder, isPinned, getFolder, listFolders,
    normalizeFolderPath,
  };
})();
