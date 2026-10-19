// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles.
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Modeles';
  // La colonne où le document garde, quand la personne le choisit, le mot de passe commun des PDF protégés (cf. writePdfPassword plus bas).
  const PDF_PASSWORD_COLUMN = 'MotDePassePdf';
  const PDF_PASSWORD_LABEL = 'Mot de passe des PDF protégés';
  let templatesCache = [];
  // Les mises à jour du cache que les écritures de CE widget font (cf. settleWritten) : un compteur, et pour chaque ligne sa valeur à la dernière mise à jour. loadAll s'en sert pour ne pas
  // remettre dans le cache l'état d'avant d'une ligne que ce widget a écrite pendant sa lecture (cf. keepWrittenSince).
  let cacheWrites = 0;
  const cacheWrittenAt = new Map();
  // Quand le cache a été lu dans Grist (le début de la dernière lecture de loadAll) et quand ce widget a écrit chacune de ses lignes pour la dernière fois : saveRow s'en sert pour savoir si l'état qu'il
  // va remplacer est celui que Grist garde encore (cf. storedStateFor), sans relire la table quand il vient d'être lu.
  let cacheReadAt = 0;
  const cacheRowWrittenAt = new Map();
  const CACHE_FRESH_MS = 3000;
  let currentTemplateId = null;
  // Monte à chaque setCurrentId : saveRow ne pose la ligne qu'il crée comme modèle courant que si personne n'a chargé un autre modèle pendant que
  // Grist écrivait.
  let currentIdSeq = 0;

  const columnMigrations = [];
  let migrationRuns = 0; // migrations réellement lancées (pas celles tenues pour faites) : loadAll en déduit si sa lecture initiale est encore juste
  function ensureOnce(worker, columns) {
    // Chaque migration suit un patron « lire (fetchTable) puis ajouter (AddVisibleColumn) » qui n'est pas atomique. L'enregistrement automatique
    // (js/main.js) appelle loadAll toutes les ~2,5 s et un Enregistrer manuel appelle save : les deux passent par les mêmes migrations. Sur un
    // document qui vient de recevoir une nouvelle colonne, deux appels qui se chevauchent peuvent lire tous les deux la colonne absente avant que
    // l'un l'ait ajoutée, puis l'ajouter tous les deux sous le même identifiant : le vrai Grist le refuse, pas dev-tests/grist-stub.js, dont les
    // ajouts sont idempotents. ensureOnce fait partager l'appel en cours à tout appelant concurrent ; un nouvel essai n'a lieu, au prochain appel,
    // que si le premier a échoué (faux, ou une erreur : le refus de créer la table, cf. ensureTableExists).
    //
    // Pour l'ouverture, `columns` (les colonnes que la migration garantit, [] pour la table elle-même) inscrit la migration dans `columnMigrations` :
    // loadAll lit la table une seule fois et tient pour faites celles dont toutes les colonnes s'y trouvent, au lieu d'une lecture complète par
    // migration (contenus et images compris). Sans `columns`, une migration n'est jamais tenue pour faite d'avance : elle tourne au premier appel.
    let inFlight = null;
    function ensure() {
      if (!inFlight) {
        migrationRuns++;
        inFlight = worker().then(ok => { if (!ok) inFlight = null; return ok; }, error => { inFlight = null; throw error; });
      }
      return inFlight;
    }
    if (columns) {
      ensure.satisfiedBy = data => columns.every(column => column in data);
      ensure.markDone = () => { if (!inFlight) inFlight = Promise.resolve(true); };
      columnMigrations.push(ensure);
    }
    return ensure;
  }

  const ensureTableExists = ensureOnce(async function () {
    try {
      await GristAPI.ensureTable(TABLE_NAME, [
        { id: 'Nom', type: 'Text' },
        { id: 'Contenu', type: 'Text' },
        { id: 'NomFichierPDF', type: 'Text' },
        { id: 'DateModif', type: 'DateTime' },
      ]);
      return true;
    } catch (e) {
      // La personne refuse de créer la table : tout ce qui en dépend s'arrête (loadAll rend une liste vide, Enregistrer le dit), sans journal d'erreur.
      if (GristAPI.isTablesDeclined(e)) throw e;
      console.error('Erreur création table modèles', e);
      return false;
    }
  }, ['Nom', 'Contenu']); // la table sous la forme que loadAll lit : une lecture qui n'y trouve pas ces deux colonnes ne prouve pas qu'elle existe

  function ensureColumns(columns) {
    // Migration d'une table existante : ajoute les colonnes `columns` ([id, type, libellé]) qui manquent, sans rien faire pour celles qui sont là
    // (AddTable ne sert qu'aux documents neufs). `columns` est aussi ce que loadAll sait d'une migration déjà faite (cf. ensureOnce).
    return ensureOnce(async function () {
      await ensureTableExists();
      try {
        const data = await grist.docApi.fetchTable(TABLE_NAME);
        const actions = columns.filter(([id]) => !(id in data)).map(([id, type, label]) => ['AddVisibleColumn', TABLE_NAME, id, { type, isFormula: false, label }]);
        if (actions.length) await grist.docApi.applyUserActions(actions);
        return true;
      } catch (e) {
        console.error('Erreur migration des colonnes ' + columns.map(([id]) => id).join(', '), e);
        return false;
      }
    }, columns.map(([id]) => id));
  }

  function defineColumnMigrations() {
    // Les migrations de colonnes de la table existante (cf. ensureColumns), dans l'ordre où loadAll les lance.
    const ensureHeaderFooterColumn = ensureColumns([['HeaderFooter', 'Text', 'En-tête / pied de page']]);

    // Marges de page (haut, droite, bas, gauche, en mm).
    const ensureMarginsColumn = ensureColumns([['Margins', 'Text', 'Marges de page']]);

    // Horodatage de la dernière modification (enregistrement automatique, js/main.js). Aussi dans le AddTable de ensureTableExists, mais un document
    // existant ne l'a que par cette migration.
    const ensureDateModifColumn = ensureColumns([['DateModif', 'DateTime', 'Dernière modification']]);

    // Modèle qui s'ouvre automatiquement au chargement du widget (au plus un à la fois, cf. setDefault).
    const ensureDefaultColumn = ensureColumns([['EstParDefaut', 'Bool', 'Modèle par défaut']]);

    // Mode email (planning/feature-email-mode.md) : des colonnes dans la table existante plutôt qu'une table dédiée. TypeModele distingue un modèle
    // email d'un modèle document ('document' par défaut : une ligne sans cette colonne, ou vide, est un modèle document, aucune donnée à migrer). Les
    // quatre autres n'ont de sens que pour un modèle email mais restent, vides, sur un modèle document : pas de schéma conditionnel.
    const ensureEmailColumns = ensureColumns([
      ['TypeModele', 'Text', 'Type de modèle'],
      ['Destinataires', 'Text', 'Destinataires (À)'],
      ['Cc', 'Text', 'Copie (Cc)'],
      ['Cci', 'Text', 'Copie cachée (Cci)'],
      ['Objet', 'Text', 'Objet de l\'email'],
    ]);

    // Suivi des modifications (planning/feature-track-changes.md) : auteur et horodatage de chaque suggestion en attente, écrits dans le même
    // UpdateRecord/AddRecord que Contenu et DateModif, jamais dans un appel séparé.
    const ensureTrackChangesColumn = ensureColumns([['SuiviModifications', 'Text', 'Suivi des modifications']]);

    // Identité d'un modèle Grille que des tableaux de document lient (js/linked-table.js, ensureToken ci-dessous). Seule migration de cette liste que loadAll et saveRow ne lancent
    // pas : un document qui ne lie aucun tableau n'a pas de colonne de plus ; elle se crée à la première pose d'un lien. Un enregistrement (saveRow) n'écrit jamais cette colonne :
    // un modèle enregistré garde son jeton.
    const ensureTokenColumn = ensureColumns([['Jeton', 'Text', 'Identité du modèle']]);

    // Le mot de passe commun des PDF protégés (writePdfPassword). Comme le jeton, ni loadAll ni saveRow ne la lancent : un document qui ne garde aucun mot de passe n'a pas de
    // colonne de plus ; elle se crée à la première écriture d'un mot de passe, jamais pour le lire.
    const ensurePdfPasswordColumn = ensureColumns([[PDF_PASSWORD_COLUMN, 'Text', PDF_PASSWORD_LABEL]]);

    // Qui a écrit l'état actuel d'un modèle (« Nom <adresse> », ou l'adresse seule) : l'historique des versions (js/versions-store.js) garde l'état d'une autre personne avant de l'écraser, et la fenêtre de
    // l'historique dit qui avait écrit chaque version. Écrite dans le même UpdateRecord que Contenu et DateModif ; créée à l'ouverture comme les colonnes ci-dessus, mais une personne qui n'a pas le droit
    // d'ajouter une colonne enregistre quand même, sans elle (cf. modifiedByColumnReady).
    const ensureModifiedByColumn = ensureColumns([['ModifiePar', 'Text', 'Modifié par']]);
    return {
      ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensureTrackChangesColumn, ensureTokenColumn, ensurePdfPasswordColumn, ensureModifiedByColumn,
    };
  }
  const {
    ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensureTrackChangesColumn, ensureTokenColumn, ensurePdfPasswordColumn, ensureModifiedByColumn,
  } = defineColumnMigrations();

  // La colonne « Modifié par » existe-t-elle (ou vient-elle d'être créée) ? Faux quand la personne n'a pas le droit d'ajouter une colonne : l'enregistrement la laisse alors de côté (un UpdateRecord sur une
  // colonne inconnue annulerait tout le lot) et ne retente pas avant dix minutes.
  let modifiedByRetryAt = 0;
  async function modifiedByColumnReady() {
    if (Date.now() < modifiedByRetryAt) return false;
    try { if (await ensureModifiedByColumn()) return true; } catch (e) { /* refus de créer la table : l'enregistrement le dira lui-même */ }
    modifiedByRetryAt = Date.now() + 10 * 60 * 1000;
    return false;
  }

  function safeParseHeaderFooter(json) {
    // Forme par défaut si la colonne est vide ou illisible. Elle doit rester la même que celle de js/editor.js : dupliquée plutôt qu'importée, des
    // scripts classiques n'ont pas de module en commun.
    const empty = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    if (!json) return empty;
    let merged;
    try {
      const parsed = JSON.parse(json);
      merged = Object.assign(empty, parsed, {
        header: Object.assign({}, empty.header, parsed.header),
        footer: Object.assign({}, empty.footer, parsed.footer),
      });
    } catch (e) {
      return empty;
    }
    // La colonne peut être écrite par un autre collaborateur : le HTML des quatre zones passe par le même filtre que le corps (js/html-sanitize.js), une
    // seule fois, ici, pour tout ce qui le lit ensuite (aperçu paginé, Lecture, PDF, Word). Hors du try : un filtre absent doit se voir, pas vider l'en-tête.
    ['header', 'footer'].forEach(zone => ['default', 'first'].forEach(which => {
      const html = merged[zone][which];
      merged[zone][which] = typeof html === 'string' ? HtmlSanitize.clean(html) : '';
    }));
    return merged;
  }

  function safeParseMacroSlots(json) {
    // Macro-modèles (planning/feature-macro-modeles.md) : TypeModele = 'macro' réutilise la colonne Contenu pour y ranger du JSON (la liste ordonnée
    // des slots) plutôt que du HTML, sans colonne de plus. Forme par défaut si la colonne est vide ou illisible.
    const empty = { slots: [] };
    if (!json) return empty;
    try {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.slots)) return empty;
      return parsed;
    } catch (e) {
      return empty;
    }
  }

  // Un objet JSON rangé dans une colonne : {} si elle est vide, illisible, ou si ce qu'elle porte n'est pas un objet.
  function safeParseObject(json) {
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function safeParseSuiviModifications(json) {
    // Forme par défaut si la colonne est vide ou illisible : {} (aucune suggestion connue) plutôt que null, pour que TrackChanges.computeMetadata
    // (js/track-changes.js) puisse s'en servir directement comme previousMetadata.
    return safeParseObject(json);
  }

  function safeParseMargins(json) {
    // Défaut identique à PageLayout.DEFAULT_MARGIN_MM (js/page-layout.js), dupliqué plutôt qu'importé. Il convertit exactement vers 28 pt, l'ancienne
    // marge codée en dur : un modèle sans réglage propre reste identique à avant.
    const DEFAULT_MARGIN_MM = 28 * 25.4 / 72;
    const empty = { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM };
    if (!json) return empty;
    try {
      return Object.assign(empty, JSON.parse(json));
    } catch (e) {
      return empty;
    }
  }

  async function readTable() {
    // Lecture de la table des modèles, null si elle est absente ou illisible (document neuf : les migrations de loadAll la créent).
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      return null;
    }
  }

  // Poids de la dernière lecture de la table, en caractères de texte (contenus et images en base64 compris) : js/main.js en tire l'attente de la
  // relecture au repos, plus longue quand la table est lourde.
  let loadedChars = 0;
  function charsOf(data) {
    let chars = 0;
    Object.keys(data).forEach(column => {
      const values = data[column];
      if (!Array.isArray(values)) return;
      for (let i = 0; i < values.length; i++) if (typeof values[i] === 'string') chars += values[i].length;
    });
    return chars;
  }
  function getLoadedChars() { return loadedChars; }

  // Une ligne de la table des modèles, au format du cache : `cell` lit la colonne si elle existe (une table migrée à moitié, un accès restreint),
  // sinon la valeur par défaut.
  function templateFromRow(data, i) {
    const cell = (column, fallback) => (data[column] ? data[column][i] : fallback);
    const typeModele = cell('TypeModele', '') || 'document';
    return {
      id: data.id[i],
      nom: cell('Nom', ''),
      contenu: cell('Contenu', ''),
      nomFichierPDF: cell('NomFichierPDF', ''),
      headerFooter: safeParseHeaderFooter(cell('HeaderFooter', null)),
      marginsMm: safeParseMargins(cell('Margins', null)),
      estParDefaut: !!cell('EstParDefaut', false),
      // Une ligne existante sans TypeModele (créée avant le mode email) est un modèle document - aucune migration de données à rejouer.
      typeModele: typeModele,
      // null pour un modèle document/email : évite de faire porter à chaque consommateur la charge de vérifier typeModele avant de lire ce champ.
      macroSlots: (typeModele === 'macro') ? safeParseMacroSlots(cell('Contenu', null)) : null,
      // null pour un macro-modèle (jamais chargé dans l'éditeur suivi, cf. loadMacroIntoEditor - js/main.js) - même convention que macroSlots
      // ci-dessus.
      suiviModifications: (typeModele === 'macro') ? null : safeParseSuiviModifications(cell('SuiviModifications', null)),
      destinataires: cell('Destinataires', ''),
      cc: cell('Cc', ''),
      cci: cell('Cci', ''),
      objet: cell('Objet', ''),
      // Utilisé par js/main.js (auto-save) pour détecter qu'une autre personne a enregistré ce même modèle entre deux vérifications - jamais
      // affiché tel quel à l'utilisateur.
      dateModif: cell('DateModif', null),
      // L'identité du modèle (cf. ensureToken) : '' tant qu'aucun tableau de document ne l'a lié. Le numéro de la ligne ne la donne pas.
      jeton: String(cell('Jeton', '') || ''),
      // Qui a écrit cet état (cf. ensureModifiedByColumn) : '' quand on ne le sait pas (modèle d'avant la colonne, personne non identifiée).
      modifiePar: String(cell('ModifiePar', '') || ''),
    };
  }

  // Le cache après une écriture de ce widget. La liste charge le modèle choisi depuis le cache (js/main.js:onTemplateSelectChange) et le cache ne se relit qu'au début d'un passage de
  // l'enregistrement automatique qui a quelque chose à écrire et à la lecture au repos (15 s à 3 min), jamais après l'écriture : sans la mise à jour ci-dessous, un modèle quitté puis
  // rouvert aussitôt montrait son état d'AVANT la modification, et l'enregistrement suivant l'écrasait dans Grist sans bandeau (la date de la ligne est celle que ce widget a lui-même écrite).
  // L'entrée est modifiée en place (des modules la tiennent : le résumé d'un macro-modèle, le bandeau de conflit) et cherchée au moment de l'appel, jamais avant un await : loadAll remplace
  // tous les objets du cache.
  function cacheWritten(id) { cacheWrittenAt.set(String(id), ++cacheWrites); cacheRowWrittenAt.set(String(id), Date.now()); }

  // Une ligne que saveRow vient d'écrire : `columns` sont les colonnes posées (sous le nom de leur colonne Grist), lues par templateFromRow comme une ligne de la table ; ce que saveRow
  // n'écrit pas (EstParDefaut, Jeton) reste ce que l'entrée porte. `dateModif` : celle envoyée, remplacée par celle que Grist relit (noteDateModif).
  function settleWritten(id, columns, dateModif) {
    cacheWritten(id);
    const cached = byId(id);
    if (!cached) return;
    const row = { id: [cached.id], EstParDefaut: [cached.estParDefaut], Jeton: [cached.jeton], DateModif: [dateModif] };
    Object.keys(columns).forEach(column => { if (column !== 'DateModif') row[column] = [columns[column]]; });
    Object.assign(cached, templateFromRow(row, 0));
  }

  // Le contenu seul d'une ligne que ce widget vient d'écrire (saveContent, les modèles Grille écrits avec un document) : ses autres champs ne bougent pas.
  function settleContent(id, contenu, dateModif) {
    cacheWritten(id);
    const cached = byId(id);
    if (cached) { cached.contenu = contenu; cached.dateModif = dateModif; }
  }

  function noteDateModif(id, dateModif) {
    const cached = byId(id);
    if (cached) cached.dateModif = dateModif;
  }

  // Une lecture partie avant une écriture de ce widget et revenue après (Grist lent : la table se relit en entier, des secondes) porte l'état d'AVANT de cette ligne : l'adopter remettrait dans
  // le cache ce que l'écriture vient d'y laisser. Les lignes écrites depuis le début de la lecture gardent leur entrée ; la lecture suivante prendra l'état de Grist. Pas « la date la plus récente
  // gagne » : après un Annuler fait dans Grist sur ce modèle, le cache garderait pour toujours ce que Grist n'a plus, et le bandeau « modifié ailleurs » ne viendrait pas.
  function keepWrittenSince(read, writtenAtStart) {
    if (cacheWrites === writtenAtStart) return read;
    const previous = new Map(templatesCache.map(t => [String(t.id), t]));
    return read.map(t => (cacheWrittenAt.get(String(t.id)) > writtenAtStart && previous.get(String(t.id))) || t);
  }

  // Les réglages du document : une ligne réservée de cette table (TypeModele = 'reglages', leur JSON dans Contenu, comme un macro-modèle y range ses
  // slots) pour ce qui vaut pour tous les modèles du document et toute l'équipe sans mériter une table de plus (les couleurs du document,
  // js/color-store.js). Jamais dans templatesCache : loadAll la met de côté, si bien qu'aucune liste de modèles, aucun sélecteur et aucune opération
  // sur tous les modèles ne la voit, et que uniqueName ne la compte pas. Créée à la première écriture, jamais pour lire. S'il y en a plusieurs (deux
  // personnes qui écrivent en premier au même moment), la première fait foi ; une écriture ne touche jamais qu'elle.
  const SETTINGS_TYPE = 'reglages';
  const SETTINGS_NAME = 'Réglages du document';
  let documentSettings = {};  // ce que voient les lecteurs : l'état lu, ou celui qu'une écriture en cours vient de poser
  let settingsSaved = {};     // le dernier état que Grist a confirmé (retour arrière quand une écriture échoue)
  let settingsRowId = null;
  let settingsPending = 0;    // écritures en file : tant qu'il y en a, une lecture ne défait pas ce qu'elles posent
  let settingsEpoch = 0;      // change au début et à la fin de chaque écriture : une lecture qui en a croisé une n'est pas l'état du document
  let settingsQueue = null;   // créée à la première écriture : GristAPI n'est pas toujours chargé avec ce script (tests de ce module seul)

  const isSettingsRow = (data, i) => !!data.TypeModele && data.TypeModele[i] === SETTINGS_TYPE;

  // `at` : le rang de la ligne réservée dans `data` (-1 quand la table n'en a pas) ; `epoch` : settingsEpoch quand la lecture a commencé. Une lecture
  // qui a croisé une écriture de ce widget (partie avant elle, ou finie pendant) montre un état d'avant : elle n'est pas adoptée, la suivante le sera.
  function adoptDocumentSettings(data, at, epoch) {
    if (epoch !== settingsEpoch || settingsPending > 0) return;
    settingsRowId = at === -1 ? null : data.id[at];
    settingsSaved = at === -1 ? {} : safeParseObject(data.Contenu ? data.Contenu[at] : null);
    documentSettings = settingsSaved;
  }

  // Une copie des réglages du document ({} tant que rien n'est écrit ou lu).
  function getDocumentSettings() { return JSON.parse(JSON.stringify(documentSettings)); }

  // Fusionne `patch` ({ clé: valeur }, une valeur null ou absente retire la clé) dans les réglages du document et les écrit. Le changement vaut tout
  // de suite pour getDocumentSettings ; la promesse rend vrai quand Grist l'a écrit, faux sinon (table refusée, droit d'écriture absent, Grist
  // injoignable) : les lecteurs retrouvent alors le dernier état confirmé. Plusieurs changements de suite font une écriture utile, de l'état le plus
  // récent.
  function updateDocumentSettings(patch) {
    const next = Object.assign({}, documentSettings);
    Object.keys(patch).forEach(key => { if (patch[key] == null) delete next[key]; else next[key] = patch[key]; });
    if (JSON.stringify(next) === JSON.stringify(documentSettings)) return Promise.resolve(true);
    documentSettings = next;
    settingsPending++;
    settingsEpoch++;
    settingsQueue = settingsQueue || GristAPI.createWriteQueue();
    return settingsQueue.enqueue(async () => {
      const wanted = JSON.stringify(documentSettings);
      if (wanted === JSON.stringify(settingsSaved)) return;
      await ensureEmailColumns(); // TypeModele : la colonne qui désigne la ligne
      if (settingsRowId != null) {
        await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, settingsRowId, { Contenu: wanted }]]);
      } else {
        const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Nom: SETTINGS_NAME, Contenu: wanted, TypeModele: SETTINGS_TYPE }]]);
        settingsRowId = result.retValues[0];
      }
      settingsSaved = JSON.parse(wanted);
    }).then(() => { settingsPending--; settingsEpoch++; return true; }, (e) => {
      settingsPending--;
      settingsEpoch++;
      if (!GristAPI.isTablesDeclined(e)) console.warn('[Templates] réglages du document non enregistrés', e);
      if (settingsPending === 0) documentSettings = settingsSaved;
      return false;
    });
  }

  // Le mot de passe commun des PDF protégés, quand la personne a choisi de le garder dans le document (mode « le même pour tous, enregistré dans le document » de la fenêtre
  // js/pdf-protection-dialog.js ; demande du 12/10 : « un mot de passe stocké dans grist pour l'ensemble des pdf, bien indiqué dans quel table/colonne il sera stocké et le
  // risque »). Il s'écrit dans la colonne PDF_PASSWORD_COLUMN de la même ligne réservée que les réglages du document, et non dans leur JSON : une règle d'accès de Grist peut ainsi
  // masquer cette colonne seule. Il y est EN CLAIR - toute personne qui ouvre le document le lit, sauf règle d'accès -, et c'est ce que la fenêtre dit. Il n'entre dans aucun cache du
  // widget (ni la liste des modèles, ni getDocumentSettings) : chaque lecture relit la table. PDF_PASSWORD_LOCATION dit où le chercher, pour que la fenêtre le nomme.
  const PDF_PASSWORD_LOCATION = Object.freeze({ table: TABLE_NAME, column: PDF_PASSWORD_COLUMN, label: PDF_PASSWORD_LABEL, row: SETTINGS_NAME });

  // Le rang de la ligne réservée dans `data` (la première s'il y en a plusieurs, comme loadAll), -1 quand la table n'en a pas.
  const settingsRowAt = data => data.id.findIndex((id, i) => isSettingsRow(data, i));

  // Rend { ok, password } : `ok` faux quand la table n'a pas pu être lue (refusée, absente, Grist injoignable) ; sinon le mot de passe gardé, '' quand il n'y en a pas - ni colonne, ni
  // ligne, ou une colonne que les règles d'accès cachent à cette personne. Lire ne crée jamais rien.
  async function readPdfPassword() {
    const data = await readTable();
    if (!data || !Array.isArray(data.id)) return { ok: false, password: '' };
    const at = settingsRowAt(data);
    const cell = at === -1 || !Array.isArray(data[PDF_PASSWORD_COLUMN]) ? '' : data[PDF_PASSWORD_COLUMN][at];
    return { ok: true, password: typeof cell === 'string' ? cell : (typeof cell === 'number' ? String(cell) : '') };
  }

  // Écrit le mot de passe ('' le retire) : la colonne est créée au besoin (jamais un UpdateRecord ni un AddRecord sur une colonne inconnue, qui annulerait le lot), la ligne réservée
  // relue juste avant - une autre personne a pu la créer depuis le dernier chargement - et créée seulement si aucune n'existe. Même file d'écritures et même garde de lecture que
  // updateDocumentSettings : une lecture qui croise cette écriture n'écrase pas l'identifiant de la ligne que ce widget vient de créer. Rend vrai quand Grist l'a écrit, faux sinon
  // (table refusée, droit d'écriture absent, colonne que les règles d'accès cachent, Grist injoignable) : la fenêtre n'exporte alors pas.
  function writePdfPassword(password) {
    const wanted = typeof password === 'string' ? password : '';
    settingsPending++;
    settingsEpoch++;
    settingsQueue = settingsQueue || GristAPI.createWriteQueue();
    return settingsQueue.enqueue(async () => {
      await ensureEmailColumns(); // TypeModele : la colonne qui désigne la ligne
      await ensurePdfPasswordColumn();
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      if (!Array.isArray(data[PDF_PASSWORD_COLUMN])) throw new Error('Colonne ' + PDF_PASSWORD_COLUMN + ' absente ou cachée : le mot de passe n’est pas enregistré.');
      const at = settingsRowAt(data);
      if (at === -1) {
        const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Nom: SETTINGS_NAME, TypeModele: SETTINGS_TYPE, [PDF_PASSWORD_COLUMN]: wanted }]]);
        if (settingsRowId == null) settingsRowId = result.retValues[0];
        return;
      }
      if (settingsRowId == null) settingsRowId = data.id[at];
      if (data[PDF_PASSWORD_COLUMN][at] !== wanted) await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, data.id[at], { [PDF_PASSWORD_COLUMN]: wanted }]]);
    }).then(() => { settingsPending--; settingsEpoch++; return true; }, (e) => {
      settingsPending--;
      settingsEpoch++;
      if (!GristAPI.isTablesDeclined(e)) console.warn('[Templates] mot de passe des PDF protégés non enregistré', e);
      return false;
    });
  }

  async function loadAll() {
    const settingsEpochAtStart = settingsEpoch;
    const writtenAtStart = cacheWrites;
    const readStartedAt = Date.now();
    // Une seule lecture pour tout vérifier : les migrations dont les colonnes sont déjà là n'ont plus rien à relire (cf. ensureOnce).
    const first = await readTable();
    if (first) columnMigrations.forEach(migration => { if (migration.satisfiedBy(first)) migration.markDone(); });
    const runsBefore = migrationRuns;
    try {
      await ensureTableExists();
      await ensureHeaderFooterColumn();
      await ensureDefaultColumn();
      await ensureMarginsColumn();
      await ensureDateModifColumn();
      await ensureEmailColumns();
      await ensureTrackChangesColumn();
      await modifiedByColumnReady();
    } catch (e) {
      // Table refusée par la personne : aucun modèle à lire, et rien d'une erreur (ni ici ni dans le démarrage qui attend cette liste).
      if (!GristAPI.isTablesDeclined(e)) throw e;
      templatesCache = [];
      loadedChars = 0;
      return templatesCache;
    }
    try {
      // Aucune migration n'a tourné (ni écrit une colonne) depuis la lecture initiale : elle est encore la table, inutile de la relire.
      const data = first && migrationRuns === runsBefore ? first : await grist.docApi.fetchTable(TABLE_NAME);
      loadedChars = charsOf(data);
      // La ligne des réglages du document n'est pas un modèle : mise de côté, jamais dans le cache.
      const templates = [];
      let settingsAt = -1;
      data.id.forEach((id, i) => {
        if (!isSettingsRow(data, i)) templates.push(templateFromRow(data, i));
        else if (settingsAt === -1) settingsAt = i;
      });
      templatesCache = keepWrittenSince(templates, writtenAtStart);
      cacheReadAt = readStartedAt;
      adoptDocumentSettings(data, settingsAt, settingsEpochAtStart);
    } catch (e) {
      console.error('Erreur chargement modèles', e);
      templatesCache = [];
      loadedChars = 0;
    }
    return templatesCache;
  }

  function getCached() { return templatesCache; }

  // Des identifiants de modèle comparés en texte : un <select> les donne en texte, Grist en nombre.
  const sameId = (a, b) => String(a) === String(b);

  // Le modèle du cache qui porte cet identifiant.
  function byId(id) { return id == null ? undefined : templatesCache.find(t => sameId(t.id, id)); }

  // Les types de modèle que ce widget sait ouvrir (colonne TypeModele ; la valeur vide est un document), plus ceux d'une extension de Grist Factory Suite que GFS a activée (« presentation »,
  // extension « diapositives » : js/slides-entry.js). Tout autre type - celui d'une extension éteinte ou absente, ou d'une version plus récente du widget - est préservé tel quel (garde
  // « type inconnu », consigne GFS 002) : jamais chargé dans l'éditeur (par la liste, le modèle de la vue, une règle de ligne, le ★...), jamais le ★ du document. La liste et « Organiser mes
  // modèles » le montrent grisé, avec sa raison (unavailableText). Seul un type que ce widget ne connaît pas du tout (isKnownType) n'est jamais réécrit (saveRow, saveContent et
  // js/schema-renames.js le laissent ; setDefault laisse tout modèle qui ne s'ouvre pas).
  const OPENABLE_TYPES = ['document', 'grille', 'email', 'macro'];
  const isOpenableType = typeModele => !typeModele || OPENABLE_TYPES.indexOf(typeModele) !== -1 || isActiveExtensionType(typeModele);

  // Les types d'une extension, déclarés par son point d'entrée : « presentation » -> { nom: « Diapositives », active }. `nom` : le nom lisible de l'extension (la liste dit alors « Demande
  // l'extension {nom} ») ; `active()` : vrai quand GFS l'a activée - un modèle de ce type s'ouvre alors comme les autres. Son contenu est celui de ce widget (une présentation est du HTML de
  // l'éditeur) : extension éteinte comme allumée, il suit les renommages de colonnes et un modèle déjà ouvert s'enregistre, toujours sous son propre type.
  const extensionTypes = new Map();
  function declareExtensionType(typeModele, nom, active) {
    if (typeModele && nom && OPENABLE_TYPES.indexOf(typeModele) === -1) extensionTypes.set(String(typeModele), { nom: String(nom), active: typeof active === 'function' ? active : () => false });
  }
  function isActiveExtensionType(typeModele) {
    const declared = typeModele ? extensionTypes.get(String(typeModele)) : null;
    return !!declared && declared.active() === true;
  }
  // Un type dont ce widget connaît le contenu : ceux qu'il ouvre toujours, et ceux d'une extension déclarée, active ou non.
  const isKnownType = typeModele => !typeModele || OPENABLE_TYPES.indexOf(typeModele) !== -1 || extensionTypes.has(String(typeModele));

  // Pourquoi un modèle de ce type ne s'ouvre pas ici : { kind: 'extension', nom } (type nommé dont l'extension manque), { kind: 'newer' } (type inconnu), null quand il s'ouvre.
  function unavailableOf(typeModele) {
    if (isOpenableType(typeModele)) return null;
    const declared = extensionTypes.get(String(typeModele));
    return declared ? { kind: 'extension', nom: declared.nom } : { kind: 'newer' };
  }

  // Cette raison en une phrase, dans la langue de l'interface ; '' quand le modèle s'ouvre.
  function unavailableText(typeModele) {
    const why = unavailableOf(typeModele);
    if (!why) return '';
    return why.kind === 'extension' ? I18n.t('template.unavailable.extension', { name: why.nom }) : I18n.t('template.unavailable.newer');
  }

  // Le modèle `id` s'il existe ET s'ouvre ici ; undefined sinon (absent, ou d'un type que ce widget ne sait pas ouvrir).
  function openableById(id) {
    const tpl = byId(id);
    return tpl && isOpenableType(tpl.typeModele) ? tpl : undefined;
  }

  // Un modèle d'un type inconnu n'est jamais réécrit : le cache le dit à jour (relu au début de chaque passage de l'enregistrement automatique qui a quelque chose à écrire), et une
  // écriture sous le type « document » abîmerait son contenu. Un modèle d'un type d'extension ne change jamais de type : `typeModele`, celui que l'écriture pose (saveRow), doit être le sien.
  // Lève avant toute écriture de la table.
  function refuseUnwritable(id, typeModele) {
    const stored = id == null ? null : byId(id);
    if (!stored) return;
    if (!isKnownType(stored.typeModele)) throw new Error('Ce modèle est d’un type que cette version ne sait pas ouvrir : rien n’a été enregistré.');
    if (typeModele !== undefined && extensionTypes.has(String(stored.typeModele)) && typeModele !== stored.typeModele) throw new Error('Ce modèle est d’un autre type : rien n’a été enregistré.');
  }

  // Le ★ du document est un document ou une grille : un email ou un macro-modèle (une action ponctuelle ou un mode spécialisé), une présentation (le type d'une extension, que GFS peut
  // éteindre) ou un modèle d'un type inconnu ne s'ouvrent pas tout seuls dans toutes les vues. Le modèle d'UNE vue (js/view-template.js) et celui qu'une règle de ligne désigne sont un
  // choix explicite : ils peuvent être un email, un macro-modèle ou une présentation dont l'extension est active, jamais un type qui ne s'ouvre pas.
  const DEFAULT_TYPES = ['document', 'grille'];
  const canBeDocumentDefault = typeModele => !typeModele || DEFAULT_TYPES.indexOf(typeModele) !== -1;

  // Deux noms sont le même quand ils ne diffèrent que par les majuscules ou les espaces autour : « contrat » et « Contrat » se confondent dans la
  // liste.
  function sameName(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

  function isNameTaken(nom, ignoreId) {
    // Un autre modèle porte-t-il déjà ce nom ? `ignoreId` ne compte pas : le modèle qu'on enregistre ne se gêne pas lui-même.
    return templatesCache.some(t => (ignoreId == null || !sameId(t.id, ignoreId)) && sameName(t.nom, nom));
  }

  function uniqueName(nom, ignoreId) {
    // Nom libre le plus proche de `nom` : `nom` lui-même s'il est libre, sinon « nom (2) », « nom (3) »... Un nom qui finit déjà par « (n) » continue
    // sa série au numéro suivant (dupliquer « Rapport (2) » donne « Rapport (3) », pas « Rapport (2) (2) »). Lit le cache des modèles, relu à chaque
    // enregistrement et à chaque passage de l'enregistrement automatique : il ne retarde que d'un nom créé à l'instant par quelqu'un d'autre.
    const base = String(nom || '').trim();
    if (!base || !isNameTaken(base, ignoreId)) return base;
    const series = base.match(/^(.*\S)\s*\((\d+)\)$/);
    const root = series ? series[1] : base;
    let x = series ? Number(series[2]) + 1 : 2;
    while (isNameTaken(root + ' (' + x + ')', ignoreId)) x++;
    return root + ' (' + x + ')';
  }

  function getCurrentId() { return currentTemplateId; }

  const isCurrent = id => id != null && sameId(currentTemplateId, id);

  function setCurrentId(id) { currentTemplateId = id; currentIdSeq++; }

  function getDefaultId() {
    // Un modèle email ou macro n'est jamais le ★ du document (cf. js/main.js, syncDefaultTemplateButton) : une ligne restée marquée
    // EstParDefaut sur l'un d'eux (défaut posé avant cette règle, colonne éditée dans Grist) ne doit pas masquer un modèle document lui aussi marqué,
    // sinon le widget s'ouvrirait sur « Nouveau modèle » et l'étoile n'apparaîtrait sur aucun des deux. Plusieurs modèles document marqués : le
    // premier de la table. Même règle pour une ligne d'un type inconnu que la colonne marque (posée par une autre version ou une extension) : elle ne s'ouvre pas ici.
    const found = templatesCache.find(t => t.estParDefaut && canBeDocumentDefault(t.typeModele));
    return found ? found.id : null;
  }

  const isDefault = id => id != null && sameId(getDefaultId(), id);

  async function setDefault(id) {
    // id = null retire le modèle par défaut sans en redéfinir un autre. Un seul modèle par défaut à la fois : les autres sont explicitement repassés
    // à false, pour ne jamais avoir deux « par défaut » après un enchaînement d'appels. Une ligne d'un type inconnu n'est ni marquée ni démarquée : elle reste ce qu'une autre
    // version ou une extension y a écrit (getDefaultId l'ignore déjà).
    const target = id == null ? null : byId(id);
    if (target && !isOpenableType(target.typeModele)) return;
    await ensureTableExists();
    await ensureDefaultColumn();
    const actions = [];
    templatesCache.forEach(t => {
      if (t.estParDefaut && isOpenableType(t.typeModele) && !sameId(t.id, id)) actions.push(['UpdateRecord', TABLE_NAME, t.id, { EstParDefaut: false }]);
    });
    if (id != null) actions.push(['UpdateRecord', TABLE_NAME, id, { EstParDefaut: true }]);
    if (actions.length) await grist.docApi.applyUserActions(actions);
    templatesCache.forEach(t => { if (isOpenableType(t.typeModele)) t.estParDefaut = (id != null && sameId(t.id, id)); });
  }

  async function readBackDateModifs(rowIds, fallback) {
    // Relit le DateModif réellement stocké par Grist pour ces lignes plutôt que de se fier à la chaîne ISO qu'on vient d'envoyer : rien ne garantit
    // que Grist la redonne telle quelle (une colonne DateTime peut être représentée autrement en interne, en nombre par exemple). js/main.js
    // (autosaveTick) compare la valeur renvoyée par save() à une valeur lue plus tard par loadAll() ou fetchTable() : dans deux représentations
    // différentes, la comparaison stricte voit un faux conflit dès le tick suivant, même seul sur le document. Passer par la même lecture des deux
    // côtés l'évite, quelle que soit la représentation. Défensif : un échec ici (colonne absente, ligne introuvable, requête en échec) ne doit pas
    // faire échouer un enregistrement réussi par ailleurs ; on retombe sur la chaîne ISO d'origine. Une seule lecture de la table pour toutes les lignes
    // (un enregistrement qui écrit aussi des modèles Grille, cf. saveRow) ; rend une Map identifiant -> DateModif.
    const dates = new Map();
    const keep = rowId => dates.set(rowId, fallback);
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      rowIds.forEach((rowId) => {
        const idx = data.id.indexOf(rowId);
        if (idx === -1 || !data.DateModif) {
          console.error('Relecture DateModif après enregistrement : ligne ou colonne introuvable, valeur locale conservée');
          keep(rowId);
        } else dates.set(rowId, data.DateModif[idx]);
      });
    } catch (e) {
      console.error('Erreur relecture DateModif après enregistrement', e);
      rowIds.forEach(keep);
    }
    return dates;
  }
  async function readBackDateModif(rowId, fallback) { return (await readBackDateModifs([rowId], fallback)).get(rowId); }

  // L'historique des versions (js/versions-store.js) : à chaque enregistrement d'un modèle qui existe déjà, l'état qu'il remplace peut être gardé, en une ligne de plus dans le MÊME lot (Grist l'applique
  // en entier ou pas du tout). Absent des pages d'essai qui ne chargent que ce module : l'enregistrement se fait alors sans.
  const versionsAvailable = () => typeof VersionsStore !== 'undefined';

  // Qui enregistre : « Nom <adresse> » d'après ce que la session sait déjà (GristAPI.peekCurrentUser ne lit ni n'écrit rien), '' quand la personne n'est pas identifiée.
  function currentAuthorLabel() {
    return versionsAvailable() && typeof GristAPI !== 'undefined' ? VersionsStore.authorLabel(GristAPI.peekCurrentUser()) : '';
  }

  // Une ligne de la table, au format de templateFromRow, d'après les colonnes qu'un enregistrement écrit.
  function rowOf(id, columns) {
    const row = { id: [id] };
    Object.keys(columns).forEach(column => { row[column] = [columns[column]]; });
    return row;
  }

  // L'état que Grist garde pour la ligne `id` au moment d'enregistrer, celui que l'enregistrement va remplacer : le cache quand il vient d'être lu ou écrit par ce widget, sinon la ligne relue (une autre
  // personne a pu l'enregistrer depuis, et c'est son état qu'il faut garder). null quand la ligne n'existe plus.
  async function storedStateFor(id) {
    const cached = byId(id);
    const freshAt = Math.max(cacheReadAt, cacheRowWrittenAt.get(String(id)) || 0);
    if (cached && Date.now() - freshAt <= CACHE_FRESH_MS) return cached;
    const data = await readTable();
    if (!data || !Array.isArray(data.id)) return cached || null;
    const at = data.id.findIndex(rowId => sameId(rowId, id));
    return at === -1 ? null : templateFromRow(data, at);
  }

  // La copie de l'état que `columns` va remplacer, à joindre au lot qui l'écrit (cf. VersionsStore.prepare), ou null : rien à garder, historique indisponible (droits, table refusée) ou en pause. Jamais une
  // erreur : enregistrer ne dépend pas de l'historique. `options` : { force (garder même si les règles ne le demandent pas : une restauration), genre }.
  async function prepareVersionCopy(id, columns, options) {
    if (!versionsAvailable() || !VersionsStore.usable()) return null;
    try {
      const stored = await storedStateFor(id);
      if (!stored) return null;
      return await VersionsStore.prepare({
        rowId: id, stored, next: templateFromRow(rowOf(id, columns), 0), author: currentAuthorLabel(),
        force: !!(options && options.force), genre: options && options.genre,
        tokenFor: async () => stored.jeton || ensureToken(id),
      });
    } catch (e) {
      console.warn('[Templates] version non gardée', e);
      return null;
    }
  }

  // Applique `actions` avec la copie `copy` (ou sans, quand elle est null). Si Grist refuse le lot avec la copie, on le rejoue sans elle : s'il passe, la copie en était la cause (droits sur la table des
  // versions, table supprimée...) et les copies s'arrêtent dix minutes ; s'il est refusé aussi, c'est l'erreur du premier essai qui remonte (rien ne se suspend : la copie n'y était pour rien).
  async function applyWithCopy(actions, copy) {
    if (!copy) return grist.docApi.applyUserActions(actions);
    let result;
    try {
      result = await grist.docApi.applyUserActions([...actions, copy.action]);
    } catch (error) {
      let again;
      try { again = await grist.docApi.applyUserActions(actions); } catch (e) { throw error; }
      VersionsStore.suspend(error);
      return again;
    }
    copy.commit(result && result.retValues ? result.retValues[actions.length] : null);
    return result;
  }

  async function saveRow(id, nom, contenuHtml, nomFichierPDF, headerFooterData, marginsData, typeModele = 'document', emailFields = null, suiviModifications = null, alsoWrite = null, versionOptions = null) {
    // Rend { id, dateModif } (pas seulement l'id) : js/main.js (auto-save) doit connaître le DateModif qu'il vient d'écrire pour le distinguer d'un
    // DateModif constaté plus tard, preuve qu'une autre personne a enregistré ce modèle entre-temps. dateModif vient d'une relecture de Grist
    // (readBackDateModif), pas de la chaîne ISO envoyée. `typeModele` et `emailFields` (mode email, cf. ensureEmailColumns) sont facultatifs : les
    // appels du mode document ne changent pas. emailFields = { destinataires, cc, cci, objet }, ignoré (colonnes laissées vides) pour un modèle
    // document. `suiviModifications` : { [id]: { author, createdAt } } (TrackChanges.computeMetadata, js/track-changes.js), écrite dans le même
    // UpdateRecord/AddRecord que Contenu, jamais dans un appel séparé (planning/feature-track-changes.md : la fenêtre de risque en cas de conflit
    // d'auto-save). null pour un macro-modèle (Editor.getSuiviModificationsForSave n'est jamais appelée sur ce chemin, cf. onSave dans js/main.js).
    // `alsoWrite` : [{ id, contenu }], les modèles Grille que les tableaux liés du document ont changé (js/linked-table.js:prepareSend). Leur Contenu et leur DateModif s'écrivent
    // dans le MÊME applyUserActions que la ligne du document : Grist applique le lot en entier ou pas du tout, jamais le document sans le modèle ni l'inverse (un modèle supprimé
    // entre-temps refuse le lot, et rien n'est écrit). Leur DateModif est noté et leur contenu mis dans le cache comme le fait saveContent.
    // `versionOptions` : { force, genre } de l'historique des versions (cf. prepareVersionCopy) ; l'état que l'enregistrement remplace s'y garde dans le même lot, quand les règles de VersionsStore le demandent.
    refuseUnwritable(id, typeModele);
    (alsoWrite || []).forEach(other => refuseUnwritable(other.id));
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    await ensureTrackChangesColumn();
    const writesModifiedBy = await modifiedByColumnReady();
    const now = new Date().toISOString();
    const email = emailFields || {};
    const columns = {
      Nom: nom, Contenu: contenuHtml, NomFichierPDF: nomFichierPDF, DateModif: now,
      HeaderFooter: JSON.stringify(headerFooterData || safeParseHeaderFooter(null)),
      Margins: JSON.stringify(marginsData || safeParseMargins(null)),
      TypeModele: typeModele,
      Destinataires: email.destinataires || '', Cc: email.cc || '', Cci: email.cci || '', Objet: email.objet || '',
      SuiviModifications: JSON.stringify(suiviModifications || {}),
    };
    // Jamais une colonne que la table n'a pas : Grist refuserait tout le lot (cf. modifiedByColumnReady).
    if (writesModifiedBy) columns.ModifiePar = currentAuthorLabel();
    const others = alsoWrite || [];
    const otherActions = others.map(({ id: modelId, contenu }) => ['UpdateRecord', TABLE_NAME, modelId, { Contenu: contenu, DateModif: now }]);
    // Ce que les modèles écrits avec le document gardent après coup : leur contenu dans le cache dès l'écriture faite, puis leur DateModif relu, noté.
    const settleOthersContent = () => others.forEach(({ id: modelId, contenu }) => settleContent(modelId, contenu, now));
    function settleOthers(dates) {
      others.forEach(({ id: modelId }) => {
        const dateModif = dates.get(modelId);
        writes.remember(modelId, dateModif);
        noteDateModif(modelId, dateModif);
      });
    }
    if (id) {
      const copy = await prepareVersionCopy(id, columns, versionOptions);
      await applyWithCopy([
        ['UpdateRecord', TABLE_NAME, id, columns],
        ...otherActions
      ], copy);
      // Le cache garde tout ce que la ligne vient de recevoir (cf. settleWritten) : js/main.js (settleTemplateName) y compare le nom tapé, uniqueName y cherche les noms pris, et le modèle
      // quitté puis rouvert aussitôt y est lu - avant la relecture de la date ci-dessous, qui dure des secondes quand Grist est lent.
      settleWritten(id, columns, now);
      settleOthersContent();
      const dates = await readBackDateModifs([id, ...others.map(({ id: modelId }) => modelId)], now);
      const dateModif = dates.get(id);
      writes.remember(id, dateModif);
      noteDateModif(id, dateModif);
      settleOthers(dates);
      return { id, dateModif };
    } else {
      const seqAtStart = currentIdSeq;
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns],
        ...otherActions
      ]);
      const newId = result.retValues[0];
      // Le modèle neuf devient le modèle courant, sauf si un autre a été chargé pendant l'écriture (Grist lent : des secondes) : c'est celui-là qui
      // est à l'écran, et l'enregistrement automatique y écrirait ensuite, sous l'identifiant du modèle neuf, ce que l'écran montre.
      if (currentIdSeq === seqAtStart) currentTemplateId = newId;
      settleOthersContent();
      const dates = await readBackDateModifs([newId, ...others.map(({ id: modelId }) => modelId)], now);
      const dateModif = dates.get(newId);
      writes.remember(newId, dateModif);
      settleOthers(dates);
      return { id: newId, dateModif };
    }
  }

  // Écrit le seul contenu d'un modèle (et sa date de modification), jamais ses autres colonnes : son nom, son nom de fichier PDF, son en-tête, ses marges, son type
  // gardent ce qu'ils ont. C'est le tableau qu'un tableau lié d'un document envoie à son modèle Grille (js/linked-table.js). Même relecture du DateModif que saveRow
  // (js/main.js compare les deux). Pas pour un macro-modèle, dont le contenu est la liste de ses emplacements. Rend { id, dateModif }.
  async function saveContent(id, contenuHtml) {
    refuseUnwritable(id);
    await ensureTableExists();
    await ensureDateModifColumn();
    const now = new Date().toISOString();
    await grist.docApi.applyUserActions([
      ['UpdateRecord', TABLE_NAME, id, { Contenu: contenuHtml, DateModif: now }]
    ]);
    settleContent(id, contenuHtml, now);
    const dateModif = await readBackDateModif(id, now);
    writes.remember(id, dateModif);
    noteDateModif(id, dateModif);
    return { id, dateModif };
  }

  // Le jeton qui dit de quel modèle il s'agit : un tableau de document lié à un modèle Grille le recopie (js/linked-table.js) et le lien ne compte que si les deux sont égaux. Le
  // numéro de la ligne ne suffit pas : Grist peut le redonner à un autre modèle une fois la ligne supprimée, et un tableau copié depuis un autre document en porte un qui désigne
  // ici un modèle sans rapport. Crée la colonne `Jeton` au premier besoin, relit la ligne dans Grist et n'écrit un jeton que si elle n'en a pas (un jeton existant ne change jamais) ;
  // rend celui que Grist garde, ou '' quand le modèle n'existe plus. Écrit la colonne `Jeton` seule : ni Contenu ni DateModif, aucun conflit d'enregistrement automatique.
  function newToken() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), word => word.toString(36).padStart(7, '0')).join('').slice(0, 24);
  }
  async function ensureToken(id) {
    await ensureTableExists();
    await ensureTokenColumn();
    async function read() {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      const at = data.id.findIndex(rowId => sameId(rowId, id));
      return { rowId: at === -1 ? null : data.id[at], token: at === -1 || !data.Jeton ? '' : String(data.Jeton[at] || '') };
    }
    let { rowId, token } = await read();
    if (rowId == null) return '';
    if (!token) {
      await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, rowId, { Jeton: newToken() }]]);
      // Celui que Grist garde : deux personnes qui posent le premier lien du même modèle au même instant partagent le dernier jeton écrit.
      ({ token } = await read());
    }
    const cached = byId(id);
    if (cached && token) cached.jeton = token;
    return token;
  }

  function createWriteTracker() {
    // Les écritures en cours de ce widget et ce qu'elles laissent dans Grist. js/main.js (auto-save, commentaires de la Lecture) compare le DateModif
    // relu dans Grist à celui que ce widget a écrit en dernier pour dire « modifié ailleurs ». Or une écriture n'est pas un instant : Grist
    // l'applique, puis la relecture du DateModif (readBackDateModif) revient plus tard, des secondes quand Grist répond lentement (la table des
    // modèles se relit en entier). Une lecture qui tombe dans cet intervalle voit la date écrite sans la connaître encore, ou revient avec l'état
    // d'avant l'écriture : faux conflit, alors que personne d'autre n'a rien touché. getWriteSeq() change au début et à la fin de chaque écriture :
    // une lecture qui commence et finit avec le même nombre n'a croisé aucune écriture de ce widget. isWriting() : une écriture est en cours ;
    // whenIdle() : rend la main quand plus aucune ne l'est ; lastWritten(id) : le DateModif que Grist a relu après la dernière écriture de cette
    // ligne par ce widget (rien d'écrit par un autre n'y passe), jamais un conflit même si l'état de main.js ne l'a pas encore noté (un macro-modèle
    // enregistré par sa fenêtre : sa date est notée au rechargement). Une écriture qui ne revient jamais (connexion perdue) ne bloque rien au-delà de
    // WATCHDOG_MS : passé ce délai, isWriting() redit faux et whenIdle() rend la main.
    const WATCHDOG_MS = 60000;
    let seq = 0;
    let pending = 0;
    let pendingSince = 0;
    const idleWaiters = [];
    const lastById = new Map();
    function isWriting() { return pending > 0 && Date.now() - pendingSince < WATCHDOG_MS; }
    function whenIdle() {
      if (!isWriting()) return Promise.resolve();
      return new Promise(resolve => { idleWaiters.push(resolve); setTimeout(resolve, WATCHDOG_MS); });
    }
    async function track(write) {
      seq++;
      if (pending === 0) pendingSince = Date.now();
      pending++;
      try { return await write(); }
      finally {
        pending--;
        seq++;
        if (pending === 0) idleWaiters.splice(0).forEach(resolve => resolve());
      }
    }
    return {
      seq: () => seq,
      isWriting,
      whenIdle,
      track,
      remember: (id, dateModif) => { lastById.set(String(id), dateModif); },
      lastWritten: id => (id != null && lastById.has(String(id)) ? lastById.get(String(id)) : null),
    };
  }
  const writes = createWriteTracker();

  function save(...args) { return writes.track(() => saveRow(...args)); }
  function saveContentTracked(...args) { return writes.track(() => saveContent(...args)); }

  function dateModifSeconds(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') { const ms = Date.parse(value); return Number.isNaN(ms) ? null : ms / 1000; }
    return null;
  }
  function sameDateModif(a, b) {
    // Deux formes d'un même DateModif : Grist rend une colonne DateTime en secondes (un nombre, décimales comprises : grist-core,
    // sandbox/grist/usertypes.py, DateTime.do_convert puis moment.parse_iso) ; readBackDateModif retombe sur la chaîne ISO envoyée quand sa relecture
    // échoue (réseau coupé un instant). Comparer les deux avec `!==` voyait un conflit à chaque passage suivant. Même forme : égalité stricte (une
    // seconde d'écart est un vrai écart) ; formes différentes : le même instant à moins d'une seconde près (le stub de test arrondit à la seconde,
    // Grist non : la marge couvre les deux).
    if (a === b) return true;
    if (a == null || b == null || typeof a === typeof b) return false;
    const secondsA = dateModifSeconds(a);
    const secondsB = dateModifSeconds(b);
    return secondsA !== null && secondsB !== null && Math.abs(secondsA - secondsB) < 1;
  }

  async function remove(id) {
    await grist.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
    // Ses versions restent dans leur table jusqu'à la prochaine ouverture de l'historique, qui les retire : supprimer un modèle ne lit rien (la table des versions n'est lue qu'à l'ouverture de l'historique).
    if (versionsAvailable()) VersionsStore.forget(id);
  }

  // Remet dans le modèle `id` l'état `snapshot` d'une de ses versions (VersionsStore.unpack), sous son nom d'aujourd'hui. L'état qu'elle remplace est gardé d'office (genre « restauration ») : une restauration
  // se défait par la même fenêtre. Rend { id, dateModif }, comme save.
  function restoreVersion(id, snapshot) {
    const cached = byId(id);
    if (!cached) return Promise.reject(new Error('Modèle introuvable : rien n’a été restauré.'));
    if ((snapshot.typeModele || 'document') !== cached.typeModele) return Promise.reject(new Error('Cette version est d’un autre type de modèle : rien n’a été restauré.'));
    const email = { destinataires: snapshot.destinataires, cc: snapshot.cc, cci: snapshot.cci, objet: snapshot.objet };
    return writes.track(() => saveRow(id, cached.nom, snapshot.contenu, snapshot.nomFichierPDF, snapshot.headerFooter, snapshot.margins, cached.typeModele, email, snapshot.suiviModifications || {}, null, { force: true, genre: 'restauration' }));
  }

  return {
    loadAll, getCached, byId, openableById, getCurrentId, setCurrentId, isCurrent, getDefaultId, isDefault, canBeDocumentDefault, setDefault, save, saveContent: saveContentTracked, ensureToken, remove, restoreVersion, sameName, uniqueName,
    isOpenableType, isKnownType, declareExtensionType, unavailableOf, unavailableText,
    getWriteSeq: writes.seq, isWriting: writes.isWriting, whenIdle: writes.whenIdle, lastWritten: writes.lastWritten,
    sameDateModif, getLoadedChars, TABLE_NAME, getDocumentSettings, updateDocumentSettings, readPdfPassword, writePdfPassword, PDF_PASSWORD_LOCATION,
  };
})();