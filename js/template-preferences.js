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
// GFS range aussi dans cette table, pour la même personne (consigne 072 ; manifeste de GFS : `rangement.ecriture`) : il met à jour ou ajoute la ligne d'un modèle
// et écrit la ligne d'état d'un dossier créé vide. Ce que ce widget a chargé au démarrage peut donc être dépassé pendant qu'il est ouvert : `refresh()` relit la
// table (à chaque ouverture de la liste des modèles et de « Organiser mes modèles », js/template-arrangement.js:reread), et une ligne qu'on ne connaît pas est
// cherchée dans la table avant d'en ajouter une (sinon elle doublerait celle de GFS). Un dossier existe tant qu'une ligne le nomme, celle d'un modèle ou celle
// d'un état (listFolders). Plusieurs lignes pour un même modèle : GFS lit la première, ce widget la dernière, et les deux les mettent toutes à jour.
// Poser la ligne d'état d'un dossier créé vide (`createFolderState` : « Nouveau dossier » de « Organiser mes modèles ») en fait un dossier que GFS voit aussi ; la retirer (`clearFolderState`) supprime
// le dossier vide, et c'est aussi ce que défaire le geste qui l'avait posée fait : sans cela, un dossier que Ctrl + Z vide resterait là, vide.
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
    const tableData = await grist.docApi.fetchTable(TABLE_NAME);
    if (!('Replie' in tableData)) {
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
    const tableData = await grist.docApi.fetchTable(TABLE_NAME);
    const missing = EXPORT_FIELDS.filter((f) => !(f.column in tableData));
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

  // { [chemin normalisé]: { rowId, rowIds, replie, saved } } pour la personne courante. `rowId` : la ligne qui fait foi (la première), `rowIds` : toutes celles
  // de ce dossier. `replie` est l'état affiché (mis à jour avant l'écriture), `saved` le dernier état confirmé par Grist (retour arrière si l'écriture échoue). Object.create(null) : un dossier nommé « constructor » ou « __proto__ » ne
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
      parseRows(await readTable(), email, { cache, folderStates });
    } catch (e) {
      console.error('Erreur chargement préférences de rangement', e);
    }
    return cache;
  }

  async function readTable() {
    const tableData = await grist.docApi.fetchTable(TABLE_NAME);
    // Schéma relu à chaque lecture : Replie peut manquer (document ancien) ou avoir été ajoutée ailleurs.
    replieColumnPresent = ('Replie' in tableData);
    exportColumnsPresent = EXPORT_FIELDS.every((f) => f.column in tableData);
    return tableData;
  }

  // Remplit `into` ({ cache, folderStates }) d'après ce que dit la table pour la personne `email`. Une lecture sans Utilisateur ni ModeleId (règle d'accès qui
  // les cache, lecture partielle) ne dit rien de la personne : aucune préférence, sans erreur. Dossier et Epingle absents se lisent vides.
  function parseRows(tableData, email, into) {
    const count = tableData.Utilisateur && tableData.ModeleId ? tableData.id.length : 0;
    const folderOf = i => normalizeFolderPath(tableData.Dossier ? tableData.Dossier[i] : null);
    for (let i = 0; i < count; i++) {
      if ((tableData.Utilisateur[i] || '') !== email) continue;
      if (tableData.ModeleId[i] === FOLDER_ROW_MODELE_ID) {
        const chemin = folderOf(i);
        const replie = !!(tableData.Replie && tableData.Replie[i]);
        // Plusieurs lignes pour un même dossier (double écriture d'un autre onglet, ou de GFS) : la première fait foi, c'est celle que setFolderCollapsed met
        // à jour ; `rowIds` les garde toutes, pour que retirer le dossier les retire toutes.
        if (chemin) {
          const known = into.folderStates[chemin];
          if (known) known.rowIds.push(tableData.id[i]);
          else into.folderStates[chemin] = { rowId: tableData.id[i], rowIds: [tableData.id[i]], replie, saved: replie };
        }
        continue;
      }
      // Les réglages d'export manquent aux lignes d'un document ancien (colonnes pas encore ajoutées) : ils se lisent vides, le réglage d'origine.
      const exportChoices = {};
      EXPORT_FIELDS.forEach(({ field, column }) => { exportChoices[field] = tableData[column] ? String(tableData[column][i] || '') : ''; });
      const known = into.cache[tableData.ModeleId[i]];
      into.cache[tableData.ModeleId[i]] = {
        // La dernière ligne de la personne pour ce modèle fait foi ; `rowIds` les garde toutes, dans l'ordre de la table : une écriture les met toutes à jour.
        rowId: tableData.id[i],
        rowIds: (known ? known.rowIds : []).concat(tableData.id[i]),
        epingle: !!(tableData.Epingle && tableData.Epingle[i]),
        dossier: folderOf(i),
        exportChoices,
      };
    }
  }

  async function readRows(email) {
    const fresh = { cache: {}, folderStates: Object.create(null) };
    parseRows(await readTable(), email, fresh);
    return fresh;
  }

  // Les écritures de cette table (une ligne de modèle, l'état d'un dossier, les réglages d'export) et la relecture passent par UNE file : aucune ne commence
  // avant la fin de la précédente, donc aucune ne lit une image à moitié mise à jour et deux gestes rapides sur le même modèle n'ajoutent pas deux lignes.
  const writes = GristAPI.createWriteQueue();
  // Les gestes sur l'état d'un dossier dont l'écriture n'est pas finie : leur interface est déjà à jour (setFolderCollapsed).
  let pendingFolderWrites = 0;

  // L'image lue remplace celle de la mémoire, sauf l'état d'un dossier qu'un geste vient de changer (l'écran est déjà à jour, l'écriture suit dans la file) :
  // le remplacer annulerait le geste à l'écran.
  function adopt(fresh) {
    cache = fresh.cache;
    if (!pendingFolderWrites) folderStates = fresh.folderStates;
  }

  // Ce que le rangement montre : épingle et dossier de chaque modèle, état et existence de chaque dossier. Sert à dire si une relecture a changé quelque chose.
  function signature() {
    const models = Object.keys(cache || {}).sort().map((id) => id + ':' + (cache[id].epingle ? 1 : 0) + ':' + (cache[id].dossier || ''));
    const states = Object.keys(folderStates).sort().map((path) => path + ':' + (folderStates[path].replie ? 1 : 0) + ':' + (folderStates[path].rowId != null ? 1 : 0));
    return JSON.stringify([models, states]);
  }

  // Relit la table : une autre connexion (GFS range aussi dans cette table) a pu y écrire depuis le chargement du démarrage. Rend `true` quand ce que le
  // rangement montre a changé, `false` sinon - et aussi quand la lecture échoue ou que la table n'est pas là (refusée par la personne), sans lever : l'écran garde
  // ce qu'il montre. Plusieurs appels de suite ne font qu'une lecture.
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    const job = writes.enqueue(async () => {
      // La lecture du démarrage dit si la table est là et quelles lignes la personne a déjà : on l'attend.
      if (loading) await loading.catch(() => {});
      if (!tableChecked || !cache) return false;
      const email = (await userEmail.get()) || '';
      const before = signature();
      adopt(await readRows(email));
      return signature() !== before;
    });
    refreshing = job.then(
      (changed) => { refreshing = null; return changed; },
      (e) => { refreshing = null; console.error('Erreur relecture préférences de rangement', e); return false; }
    );
    return refreshing;
  }

  function getCached() { return cache || {}; }

  // patch = { Epingle } et/ou { Dossier }. Une identification indisponible ne lève pas (repli '') ; seule une panne d'écriture Grist remonte à
  // l'appelant.
  function upsert(modeleId, patch) {
    return writes.enqueue(async () => {
      await ensureTableExists();
      const email = (await userEmail.get()) || '';
      if (!cache) await loadForCurrentUser();
      const id = Number(modeleId);
      // Une ligne que GFS a écrite pendant que ce widget était ouvert n'est pas dans le cache : en ajouter une pour le même modèle doublerait la sienne.
      if (!cache[id]) adopt(await readRows(email));
      const existing = cache[id];
      if (existing) {
        // Toutes les lignes de la personne pour ce modèle, comme GFS (il lit la première, ce widget la dernière : elles doivent dire la même chose).
        await grist.docApi.applyUserActions(existing.rowIds.map((rowId) => ['UpdateRecord', TABLE_NAME, rowId, patch]));
        if ('Epingle' in patch) existing.epingle = !!patch.Epingle;
        if ('Dossier' in patch) existing.dossier = normalizeFolderPath(patch.Dossier);
        return existing;
      }
      const columns = Object.assign({ Utilisateur: email, ModeleId: id, Epingle: false, Dossier: '' }, patch);
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
      const row = { rowId: result.retValues[0], rowIds: [result.retValues[0]], epingle: !!columns.Epingle, dossier: normalizeFolderPath(columns.Dossier), exportChoices: emptyExportChoices() };
      cache[id] = row;
      return row;
    });
  }

  function setPinned(modeleId, pinned) { return upsert(modeleId, { Epingle: !!pinned }); }
  function setFolder(modeleId, path) { return upsert(modeleId, { Dossier: normalizeFolderPath(path) || '' }); }

  // Les écritures d'état de dossier passent par la file `writes` : deux clics rapides sur le même interrupteur ne doivent pas créer deux lignes (la seconde ne
  // verrait pas encore le rowId de la première).

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
    const state = folderStates[key] || (folderStates[key] = { rowId: null, rowIds: [], replie: false, saved: false });
    state.replie = !!collapsed;
    pendingFolderWrites++;
    const job = writes.enqueue(async () => {
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
        state.rowIds = [state.rowId];
      }
      state.saved = wanted;
      return state;
    });
    const settled = () => { pendingFolderWrites--; };
    job.then(settled, settled);
    return job.catch((e) => { state.replie = state.saved; throw e; });
  }

  // Pose la ligne d'état d'un dossier créé vide : celle que GFS écrit pour son propre « Nouveau dossier » (ModeleId = 0, Dossier = le chemin, Epingle = faux ; `rangement.ecriture.dossiers`
  // de son manifeste), pour que les deux écrans voient le même dossier. `collapsed` : le dossier s'ouvre replié dans la liste (Replie, colonne ajoutée au besoin ; sinon la ligne ne la
  // porte pas, comme celles de GFS). Lit la table avant d'écrire : GFS a pu poser la ligne entre-temps, en ajouter une doublerait la sienne. Rend `true` quand une ligne est ajoutée, `false`
  // quand une ligne nomme déjà ce dossier ; ne lève que si Grist refuse l'écriture (rien n'est alors affiché) ou si la personne a refusé de créer la table.
  function createFolderState(path, collapsed) {
    const key = normalizeFolderPath(path);
    if (!key) return Promise.resolve(false);
    return writes.enqueue(async () => {
      await ensureTableExists();
      if (loading) await loading.catch(() => {});
      if (!cache) await loadForCurrentUser();
      const email = (await userEmail.get()) || '';
      adopt(await readRows(email));
      const known = folderStates[key];
      if (known && known.rowId != null) return false;
      if (collapsed) await ensureReplieColumn();
      const columns = { Utilisateur: email, ModeleId: FOLDER_ROW_MODELE_ID, Epingle: false, Dossier: key };
      if (collapsed) columns.Replie = true;
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
      // Un geste sur l'interrupteur de ce dossier, parti avant la fin de cette écriture, a déjà son entrée : elle prend la ligne (son état affiché reste, la file l'écrira ensuite).
      const state = folderStates[key] || (folderStates[key] = { rowId: null, rowIds: [], replie: false, saved: false });
      state.rowId = result.retValues[0];
      state.rowIds = [state.rowId];
      state.saved = !!collapsed;
      if (!pendingFolderWrites) state.replie = !!collapsed;
      return true;
    });
  }

  // Une ligne d'état nomme-t-elle ce dossier, ou va-t-elle le nommer ? Un dossier « replié » dont l'écriture n'est pas finie compte : sa ligne va exister (deux clics
  // de suite sur l'interrupteur, le second avant la fin de l'écriture du premier). Le dossier existe alors, même sans modèle dedans (listStateFolders, lui, attend la
  // ligne écrite). Un geste qui pose cette ligne le demande avant, pour que le défaire puisse la retirer (js/template-arrangement.js) au lieu de la laisser dire « déplié ».
  function hasFolderState(path) {
    const key = normalizeFolderPath(path);
    const state = key && folderStates[key];
    return !!(state && (state.rowId != null || state.replie));
  }

  // Retire la ou les lignes d'état de ce dossier pour la personne (supprimer un dossier vide, défaire sa création) : le dossier n'existe plus que par les modèles qu'il contient. Lit la table avant de retirer (GFS a pu
  // retirer ou ajouter une ligne : Grist refuse de retirer une ligne qui n'est plus là, et une ligne ajoutée entre-temps resterait nommer le dossier). Rend `true` quand
  // une ligne a été retirée ; ne lève que si Grist refuse l'écriture, l'état affiché reste alors celui d'avant.
  function clearFolderState(path) {
    const key = normalizeFolderPath(path);
    if (!key) return Promise.resolve(false);
    return writes.enqueue(async () => {
      // La lecture du démarrage dit si la table est là ; refusée par la personne (pas de table), il n'y a rien à retirer.
      if (loading) await loading.catch(() => {});
      if (!tableChecked) return false;
      const email = (await userEmail.get()) || '';
      const state = (await readRows(email)).folderStates[key];
      if (state) await grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE_NAME, state.rowIds.slice()]]);
      // Un geste sur un dossier qui attend encore dans la file garde son entrée (il la complétera : plus aucune ligne, il en ajoutera une) ; sinon l'entrée part.
      const current = folderStates[key];
      if (current) {
        current.rowId = null; current.rowIds = []; current.saved = false;
        if (!pendingFolderWrites) { current.replie = false; delete folderStates[key]; }
      }
      return !!state;
    });
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
    return writes.enqueue(async () => {
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
      // Une ligne que GFS a écrite pendant que ce widget était ouvert n'est pas dans le cache : en ajouter une pour le même modèle doublerait la sienne.
      const email = (await userEmail.get()) || '';
      if (!cache[id]) adopt(await readRows(email));
      const written = emptyExportChoices();
      EXPORT_FIELDS.forEach(({ field, column }) => { written[field] = column in patch ? patch[column] : ((cache[id] && cache[id].exportChoices && cache[id].exportChoices[field]) || ''); });
      const existing = cache[id];  // une épingle posée entre-temps, ou une ligne de GFS, a pu créer la ligne
      if (existing) {
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, existing.rowId, patch]]);
        existing.exportChoices = written;
        return existing;
      }
      const columns = { Utilisateur: email, ModeleId: id, Epingle: false, Dossier: '' };
      EXPORT_FIELDS.forEach(({ field, column }) => { columns[column] = written[field]; });
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, columns]]);
      cache[id] = { rowId: result.retValues[0], rowIds: [result.retValues[0]], epingle: false, dossier: null, exportChoices: written };
      return cache[id];
    });
  }

  function isPinned(modeleId) { const r = cache && cache[Number(modeleId)]; return !!(r && r.epingle); }
  function getFolder(modeleId) { const r = cache && cache[Number(modeleId)]; return r ? r.dossier : null; }

  const byPath = (a, b) => a.localeCompare(b, 'fr');

  // Les dossiers que leur seule ligne d'état fait exister (ModeleId = 0 : ce que GFS écrit pour « Nouveau dossier »), avec ou sans modèle dedans : l'arbre les montre
  // (TemplateOrganizer.buildView). Un état dont l'écriture n'a pas encore abouti (rowId nul) n'en fait pas un : aucune ligne ne nomme encore ce dossier.
  function listStateFolders() {
    return Object.keys(folderStates).filter((path) => folderStates[path].rowId != null).sort(byPath);
  }

  // Les dossiers qui existent : un dossier existe tant qu'une ligne le nomme, celle d'un modèle (son champ Dossier) ou celle d'un état (listStateFolders). Sert à proposer
  // où ranger un modèle ; l'arbre, lui, ne montre un dossier de modèle que si le modèle existe encore (la ligne d'un modèle supprimé reste dans la table).
  function listFolders() {
    const set = new Set(listStateFolders());
    Object.keys(cache || {}).forEach((id) => { const folder = cache[id].dossier; if (folder) set.add(folder); });
    return Array.from(set).sort(byPath);
  }

  return {
    loadForCurrentUser, refresh, getCached, setPinned, setFolder, isPinned, getFolder, listFolders, listStateFolders,
    isFolderCollapsed, setFolderCollapsed, hasFolderState, createFolderState, clearFolderState, normalizeFolderPath, getExportChoices, setExportChoices,
  };
})();
