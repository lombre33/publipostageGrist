// Rangement des modèles par personne (épingle, dossier, dossier replié par défaut) : planning/feature-rangement-tri-modeles.md.
// Table dédiée Publipostage_PreferencesModeles : une préférence est une relation (personne × modèle), pas un attribut du modèle (même principe que
// Publipostage_Commentaires, js/comments.js) ; elle évite aussi de toucher aux colonnes de Templates.save().
// Identification : GristAPI.getCurrentUserEmail(). Si elle échoue, repli anonyme silencieux (Utilisateur = '') plutôt que de bloquer l'action :
// épingle et dossier deviennent alors une préférence partagée par toutes les personnes sans identité résolue (comme Auteur = '' des commentaires).
// État d'un dossier : un dossier n'existe que par le champ Dossier des lignes de modèles, son état ne peut pas vivre sur l'une d'elles. Il vit sur
// une ligne à part de cette table, une par (personne × dossier) : ModeleId = 0, Dossier = le chemin, Replie = vrai si le dossier s'ouvre replié. Ces
// lignes ne passent jamais par `cache` (getCached(), isPinned(), getFolder() et listFolders() ne les voient pas) : `folderStates` en est le seul
// lecteur.
// Réglages d'export (type d'export, qualité du PDF, lignes exportées : js/export-choices.js) : trois colonnes Text de la même ligne (personne × modèle).
// Une valeur vide est le réglage d'origine, que personne n'a changé : il n'écrit aucune ligne. Les colonnes manquent aux documents créés avant cette
// fonction : ajoutées à la première écriture, jamais au démarrage.
const TemplatePreferences = (function () {
  const TABLE_NAME = 'Publipostage_PreferencesModeles';
  // Sentinelle de la ligne « état d'un dossier » : un vrai ModeleId (id de ligne Grist) est toujours >= 1.
  const FOLDER_ROW_MODELE_ID = 0;

  const TABLE_COLUMNS = [
    { id: 'Utilisateur', type: 'Text' },
    { id: 'ModeleId', type: 'Int' },
    { id: 'Epingle', type: 'Bool' },
    // Chemin complet séparé par « / » (ex. « Factures/Clients A ») : des dossiers imbriqués sans changer de schéma.
    { id: 'Dossier', type: 'Text' },
    // Replie : uniquement sur les lignes ModeleId = 0 (état d'un dossier).
    { id: 'Replie', type: 'Bool' },
    // Réglages d'export de la personne pour ce modèle (lignes ModeleId >= 1) : vides tant qu'elle n'a rien changé.
    { id: 'TypeExport', type: 'Text' },
    { id: 'QualitePdf', type: 'Text' },
    { id: 'LignesExport', type: 'Text' },
  ];
  // Les trois réglages d'export : le nom côté widget (`field`), la colonne Grist et son intitulé quand elle est ajoutée à un document ancien.
  const EXPORT_FIELDS = [
    { field: 'type', column: 'TypeExport', label: 'Type d\'export' },
    { field: 'quality', column: 'QualitePdf', label: 'Qualité du PDF' },
    { field: 'lines', column: 'LignesExport', label: 'Lignes exportées' },
  ];

  let tableChecked = false;
  async function ensureTableExists() {
    if (tableChecked) return;
    try {
      await GristAPI.ensureTable(TABLE_NAME, TABLE_COLUMNS);
      tableChecked = true;
    } catch (e) {
      // La personne refuse de créer la table : l'appelant s'arrête (rien à lire, rien à écrire), sans journal d'erreur.
      if (GristAPI.isTablesDeclined(e)) throw e;
      console.error('Erreur création table préférences de rangement', e);
    }
  }

  // Absente des documents créés avant cette fonction, et AddRecord/UpdateRecord sur une colonne inconnue annule toute l'action : relire le schéma
  // puis n'ajouter la colonne que si elle manque (deux AddVisibleColumn simultanés créeraient Replie et Replie2). Seul setFolderCollapsed l'appelle,
  // en série par folderWrites ; jamais au démarrage.
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

  // Les colonnes des réglages d'export : même précaution que Replie (AddRecord/UpdateRecord sur une colonne inconnue annule l'action), toutes en une seule
  // action pour ne pas laisser un document avec une partie d'entre elles. Seule la file des écritures d'export l'appelle, jamais au démarrage.
  let exportColumnsPresent = false;
  async function ensureExportColumns() {
    if (exportColumnsPresent) return;
    const data = await grist.docApi.fetchTable(TABLE_NAME);
    const missing = EXPORT_FIELDS.filter((f) => !(f.column in data));
    if (missing.length) {
      await grist.docApi.applyUserActions(missing.map((f) => ['AddVisibleColumn', TABLE_NAME, f.column, { type: 'Text', isFormula: false, label: f.label }]));
    }
    exportColumnsPresent = true;
  }

  // La personne courante : identification impossible = repli anonyme (Utilisateur = ''), jamais bloquant ; le refus de créer la table d'identification
  // n'est pas gardé (js/grist-api.js:createUserEmailCache).
  const userEmail = GristAPI.createUserEmailCache(() => GristAPI.getCurrentUserEmail());

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

  // La lecture en cours : une écriture d'export qui part avant sa fin l'attend, car c'est elle qui dit si la table est là (tableChecked) et quelles lignes
  // la personne a déjà.
  let loading = null;
  function loadForCurrentUser() {
    loading = loadNow();
    return loading;
  }

  async function loadNow() {
    try { await ensureTableExists(); }
    catch (e) {
      if (!GristAPI.isTablesDeclined(e)) throw e;
      cache = {}; // pas de table, donc aucune préférence
      folderStates = Object.create(null);
      return cache;
    }
    cache = {};
    folderStates = Object.create(null);
    // '' sans court-circuit : une préférence écrite en repli anonyme doit se relire dans la même session anonyme, sinon épingler puis rouvrir l'arbre
    // « oublierait » l'épingle.
    const email = (await userEmail.get()) || '';
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      // Schéma relu à chaque chargement : Replie peut manquer (document ancien) ou avoir été ajoutée ailleurs.
      replieColumnPresent = ('Replie' in data);
      exportColumnsPresent = EXPORT_FIELDS.every((f) => f.column in data);
      // Une lecture sans Utilisateur ni ModeleId (règle d'accès qui les cache, lecture partielle) ne dit rien de la personne : aucune préférence, sans erreur.
      // Dossier et Epingle absents se lisent vides.
      const count = data.Utilisateur && data.ModeleId ? data.id.length : 0;
      const folderOf = i => normalizeFolderPath(data.Dossier ? data.Dossier[i] : null);
      for (let i = 0; i < count; i++) {
        if ((data.Utilisateur[i] || '') !== email) continue;
        if (data.ModeleId[i] === FOLDER_ROW_MODELE_ID) {
          const chemin = folderOf(i);
          const replie = !!(data.Replie && data.Replie[i]);
          // Plusieurs lignes pour un même dossier (double écriture d'un autre onglet) : la première fait foi, c'est celle que setFolderCollapsed met
          // à jour.
          if (chemin && !folderStates[chemin]) folderStates[chemin] = { rowId: data.id[i], replie, saved: replie };
          continue;
        }
        // Les réglages d'export manquent aux lignes d'un document ancien (colonnes pas encore ajoutées) : ils se lisent vides, le réglage d'origine.
        const exportChoices = {};
        EXPORT_FIELDS.forEach(({ field, column }) => { exportChoices[field] = data[column] ? String(data[column][i] || '') : ''; });
        cache[data.ModeleId[i]] = {
          rowId: data.id[i],
          epingle: !!(data.Epingle && data.Epingle[i]),
          dossier: folderOf(i),
          exportChoices,
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
    const email = (await userEmail.get()) || '';
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
    const row = { rowId: result.retValues[0], epingle: !!columns.Epingle, dossier: normalizeFolderPath(columns.Dossier), exportChoices: emptyExportChoices() };
    cache[id] = row;
    return row;
  }

  function setPinned(modeleId, pinned) { return upsert(modeleId, { Epingle: !!pinned }); }
  function setFolder(modeleId, path) { return upsert(modeleId, { Dossier: normalizeFolderPath(path) || '' }); }

  // Écritures d'état de dossier en file : deux clics rapides sur le même interrupteur ne doivent pas créer deux lignes (la seconde ne verrait pas
  // encore le rowId de la première).
  const folderWrites = GristAPI.createWriteQueue();

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
    const job = folderWrites.enqueue(async () => {
      await ensureTableExists();
      await ensureReplieColumn();
      const wanted = state.replie;  // l'état le plus récent : plusieurs clics de suite font une seule écriture utile
      if (state.rowId != null) {
        if (wanted === state.saved) return state;
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, state.rowId, { Replie: wanted }]]);
      } else {
        if (!wanted) return state;  // « déplié » est l'état par défaut : pas de ligne à créer
        const email = (await userEmail.get()) || '';
        const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, {
          Utilisateur: email, ModeleId: FOLDER_ROW_MODELE_ID, Epingle: false, Dossier: key, Replie: true,
        }]]);
        state.rowId = result.retValues[0];
      }
      state.saved = wanted;
      return state;
    });
    return job.catch((e) => { state.replie = state.saved; throw e; });
  }

  function emptyExportChoices() {
    const choices = {};
    EXPORT_FIELDS.forEach(({ field }) => { choices[field] = ''; });
    return choices;
  }

  // Réglages d'export que la personne a posés pour ce modèle, ou null quand elle n'en a posé aucun (pas de ligne). Une valeur vide est le réglage
  // d'origine. Ceux d'un autre document ou d'une autre personne ne sont jamais là (loadNow).
  function getExportChoices(modeleId) {
    const row = cache && cache[Number(modeleId)];
    return row && row.exportChoices ? Object.assign({}, row.exportChoices) : null;
  }

  // Ce que les files d'écriture ont à écrire, par modèle : le dernier réglage voulu, lu à l'exécution. Plusieurs choix de suite ne font qu'une écriture.
  const exportWanted = Object.create(null);
  const exportWrites = GristAPI.createWriteQueue();

  // Garde les réglages d'export de la personne pour un modèle enregistré (`choices` : { type, quality, lines }, chaque champ une chaîne, vide pour le
  // réglage d'origine ; un champ absent n'est pas touché). Écrit seulement ce qui change par rapport à ce que Grist a déjà, sur la ligne de la personne
  // pour ce modèle (créée au besoin), et rien quand tout est d'origine et qu'il n'y a pas de ligne. Sans table - la personne a refusé de la créer -,
  // rien n'est écrit et aucune question n'est posée pour un simple choix de menu : les réglages ne vivent alors que dans la session. L'échec d'une
  // écriture remonte à l'appelant ; l'écriture suivante reprend ce qui n'a pas pu passer.
  function setExportChoices(modeleId, choices) {
    const id = Number(modeleId);
    if (!(id >= 1)) return Promise.resolve(null);
    const wanted = exportWanted[id] || (exportWanted[id] = {});
    EXPORT_FIELDS.forEach(({ field }) => { if (choices && typeof choices[field] === 'string') wanted[field] = choices[field]; });
    return exportWrites.enqueue(async () => {
      // La lecture du démarrage dit si la table est là et quelles lignes la personne a déjà ; un choix fait avant sa fin l'attend.
      if (loading) await loading.catch(() => {});
      if (!tableChecked || !cache) return null;
      const known = (cache[id] && cache[id].exportChoices) || {};
      const patch = {};
      EXPORT_FIELDS.forEach(({ field, column }) => {
        if (wanted[field] !== undefined && wanted[field] !== (known[field] || '')) patch[column] = wanted[field];
      });
      if (!Object.keys(patch).length) return cache[id] || null;
      await ensureExportColumns();
      const written = emptyExportChoices();
      EXPORT_FIELDS.forEach(({ field, column }) => { written[field] = column in patch ? patch[column] : ((cache[id] && cache[id].exportChoices && cache[id].exportChoices[field]) || ''); });
      const existing = cache[id];  // une épingle posée entre-temps a pu créer la ligne
      if (existing) {
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, existing.rowId, patch]]);
        existing.exportChoices = written;
        return existing;
      }
      const email = (await userEmail.get()) || '';
      const columns = { Utilisateur: email, ModeleId: id, Epingle: false, Dossier: '' };
      EXPORT_FIELDS.forEach(({ field, column }) => { columns[column] = written[field]; });
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
      cache[id] = { rowId: result.retValues[0], epingle: false, dossier: null, exportChoices: written };
      return cache[id];
    });
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
    isFolderCollapsed, setFolderCollapsed, normalizeFolderPath, getExportChoices, setExportChoices,
  };
})();
