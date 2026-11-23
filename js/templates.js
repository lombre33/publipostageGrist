// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Templates.
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Templates';
  // La colonne où le document garde, quand la personne le choisit, le mot de passe commun des PDF protégés (cf. writePdfPassword plus bas).
  const PDF_PASSWORD_COLUMN = 'PdfPassword';
  // La colonne où chaque modèle garde sa notice (cf. ensureNoticeColumn, saveNotice).
  const NOTICE_COLUMN = 'Notice';
  // La colonne où un document ou une grille garde l'email que la personne lui a lié (cf. setLinkedEmail plus bas) : le JETON de cet email, jamais son numéro de ligne.
  const LINKED_EMAIL_COLUMN = 'LinkedEmail';
  let templatesCache = [];
  // Les mises à jour du cache que les écritures de CE widget font (cf. settleWritten) : un compteur, et pour chaque ligne sa valeur à la dernière mise à jour. loadAll s'en sert pour ne pas
  // remettre dans le cache l'état d'avant d'une ligne que ce widget a écrite pendant sa lecture (cf. keepWrittenSince).
  let cacheWrites = 0;
  const cacheWrittenAt = new Map();
  // Quand le cache a été lu dans Grist (le début de la dernière lecture de loadAll) et quand ce widget a écrit chacune de ses lignes pour la dernière fois : saveRow s'en sert pour savoir si l'état qu'il
  // va remplacer est celui que Grist garde encore (cf. storedStateFor), sans relire la table quand il vient d'être lu. `cacheArrivedAt` : le moment où cette lecture est arrivée (une table lourde
  // met des secondes à venir).
  let cacheReadAt = 0;
  let cacheArrivedAt = 0;
  const cacheRowWrittenAt = new Map();
  const CACHE_FRESH_MS = 3000;
  // Une table LOURDE (11/11, un PowerPoint de 29 Mo importé : 38 millions de signes dans une ligne) : chaque lecture la rapporte en entier, des dizaines de Mo que le navigateur recopie d'un cadre à l'autre
  // (deux fois quand Grist Factory Suite héberge l'app : son courtier la reçoit puis la renvoie), page prise pendant ce temps. À partir de ce poids, un enregistrement ne la relit plus pour rien : ni
  // pour sa date (cf. readBackDateModifs), ni pour l'état qu'il remplace quand elle vient d'arriver (cf. storedStateFor). Même seuil que le passage espacé de l'enregistrement automatique
  // (js/main-autosave.js, AUTOSAVE_HEAVY_CHARS).
  const HEAVY_TABLE_CHARS = 8 * 1000 * 1000;
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
        { id: 'Name', type: 'Text' },
        { id: 'Content', type: 'Text' },
        { id: 'PdfFileName', type: 'Text' },
        { id: 'ModifiedAt', type: 'DateTime' },
      ]);
      return true;
    } catch (e) {
      // La personne refuse de créer la table : tout ce qui en dépend s'arrête (loadAll rend une liste vide, Enregistrer le dit), sans journal d'erreur.
      if (GristAPI.isTablesDeclined(e)) throw e;
      console.error('Erreur création table modèles', e);
      return false;
    }
  }, ['Name', 'Content']); // la table sous la forme que loadAll lit : une lecture qui n'y trouve pas ces deux colonnes ne prouve pas qu'elle existe

  function ensureColumns(columns) {
    // Migration d'une table existante : ajoute les colonnes `columns` ([id, type, libellé]) qui manquent, sans rien faire pour celles qui sont là
    // (AddTable ne sert qu'aux documents neufs). `columns` est aussi ce que loadAll sait d'une migration déjà faite (cf. ensureOnce).
    return ensureOnce(async function () {
      await ensureTableExists();
      // Un compte Lecteur de Grist n'écrit rien et n'essaie pas : Grist refuserait l'ajout (js/grist-api.js:isDocumentReadOnly). La colonne qui manque à un document d'avant elle se lit vide (templateFromRow) et le premier
      // compte qui modifie le document la crée à son tour.
      if (GristAPI.isDocumentReadOnly()) return false;
      try {
        const tableData = await SchemaColumns.docApi.fetchTable(TABLE_NAME);
        const actions = columns.filter(([id]) => !(id in tableData)).map(([id, type]) => ['AddVisibleColumn', TABLE_NAME, id, { type, isFormula: false }]);
        if (actions.length) await SchemaColumns.docApi.applyUserActions(actions);
        return true;
      } catch (e) {
        console.error('Erreur migration des colonnes ' + columns.map(([id]) => id).join(', '), e);
        return false;
      }
    }, columns.map(([id]) => id));
  }

  function defineColumnMigrations() {
    // Les migrations de colonnes de la table existante (cf. ensureColumns), dans l'ordre où loadAll les lance.
    const ensureHeaderFooterColumn = ensureColumns([['HeaderFooter', 'Text']]);

    // Marges de page (haut, droite, bas, gauche, en mm).
    const ensureMarginsColumn = ensureColumns([['Margins', 'Text']]);

    // Horodatage de la dernière modification (enregistrement automatique, js/main.js). Aussi dans le AddTable de ensureTableExists, mais un document
    // existant ne l'a que par cette migration.
    const ensureDateModifColumn = ensureColumns([['ModifiedAt', 'DateTime']]);

    // Modèle qui s'ouvre automatiquement au chargement du widget (au plus un à la fois, cf. setDefault).
    const ensureDefaultColumn = ensureColumns([['IsDefault', 'Bool']]);

    // Mode email (planning/feature-email-mode.md) : des colonnes dans la table existante plutôt qu'une table dédiée. TemplateType distingue un modèle
    // email d'un modèle document ('document' par défaut : une ligne sans cette colonne, ou vide, est un modèle document, aucune donnée à migrer). Les
    // quatre autres n'ont de sens que pour un modèle email mais restent, vides, sur un modèle document : pas de schéma conditionnel.
    const ensureEmailColumns = ensureColumns([
      ['TemplateType', 'Text'],
      ['To', 'Text'],
      ['Cc', 'Text'],
      ['Bcc', 'Text'],
      ['Subject', 'Text'],
    ]);

    // Les pièces jointes du .eml (js/eml-export.js) : des variables de colonnes Pièces jointes de Grist, dans l'écriture des autres champs (js/field-codec.js). Une colonne à part, comme « Modifié par » :
    // tous les documents d'avant elle ne l'ont pas, et une personne qui n'a pas le droit d'ajouter une colonne enregistre quand même, sans elle (cf. pjColumnReady).
    const ensurePjColumn = ensureColumns([['Attachments', 'Text']]);

    // Suivi des modifications (planning/feature-track-changes.md) : auteur et horodatage de chaque suggestion en attente, écrits dans le même
    // UpdateRecord/AddRecord que Content et ModifiedAt, jamais dans un appel séparé.
    const ensureTrackChangesColumn = ensureColumns([['TrackedChanges', 'Text']]);

    // Identité d'un modèle Grille que des tableaux de document lient (js/linked-table.js, ensureToken ci-dessous). Seule migration de cette liste que loadAll et saveRow ne lancent
    // pas : un document qui ne lie aucun tableau n'a pas de colonne de plus ; elle se crée à la première pose d'un lien. Un enregistrement (saveRow) n'écrit jamais cette colonne :
    // un modèle enregistré garde son jeton.
    const ensureTokenColumn = ensureColumns([['Token', 'Text']]);

    // Le mot de passe commun des PDF protégés (writePdfPassword). Comme le jeton, ni loadAll ni saveRow ne la lancent : un document qui ne garde aucun mot de passe n'a pas de
    // colonne de plus ; elle se crée à la première écriture d'un mot de passe, jamais pour le lire.
    const ensurePdfPasswordColumn = ensureColumns([[PDF_PASSWORD_COLUMN, 'Text']]);

    // Qui a écrit l'état actuel d'un modèle (« Nom <adresse> », ou l'adresse seule) : l'historique des versions (js/versions-store.js) garde l'état d'une autre personne avant de l'écraser, et la fenêtre de
    // l'historique dit qui avait écrit chaque version. Écrite dans le même UpdateRecord que Content et ModifiedAt ; créée à l'ouverture comme les colonnes ci-dessus, mais une personne qui n'a pas le droit
    // d'ajouter une colonne enregistre quand même, sans elle (cf. modifiedByColumnReady).
    const ensureModifiedByColumn = ensureColumns([['ModifiedBy', 'Text']]);

    // La notice du modèle (js/template-notice.js : « comment se servir de ce modèle », du HTML court, jamais exporté) : une colonne à part, hors de Content, pour qu'aucun export ne puisse la lire. Comme le jeton, ni loadAll ni
    // saveRow ne la lancent : un document dont aucun modèle n'a de notice n'a pas de colonne de plus ; elle se crée à la première écriture d'une notice (saveNotice), jamais pour lire.
    const ensureNoticeColumn = ensureColumns([[NOTICE_COLUMN, 'Text']]);
    // L'email lié à un document ou à une grille (setLinkedEmail) : le jeton de l'email, dans la ligne du document. Comme le jeton et le mot de passe des PDF, ni loadAll ni saveRow ne la lancent - un document qui ne lie aucun
    // email n'a pas de colonne de plus ; elle se crée au premier lien posé - et un enregistrement n'écrit jamais cette colonne : un document enregistré garde son lien, et un enregistrement automatique qui part d'un cache
    // en retard ne défait pas le lien qu'une autre personne vient de poser.
    const ensureLinkedEmailColumn = ensureColumns([[LINKED_EMAIL_COLUMN, 'Text']]);
    return {
      ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensurePjColumn, ensureTrackChangesColumn, ensureTokenColumn, ensurePdfPasswordColumn, ensureModifiedByColumn,
      ensureLinkedEmailColumn, ensureNoticeColumn,
    };
  }
  const {
    ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensurePjColumn, ensureTrackChangesColumn, ensureTokenColumn, ensurePdfPasswordColumn, ensureModifiedByColumn,
    ensureLinkedEmailColumn, ensureNoticeColumn,
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

  // La colonne « Attachments » existe-t-elle (ou vient-elle d'être créée) ? Même règle que « Modifié par » : faux quand la personne n'a pas le droit d'ajouter une colonne, l'enregistrement la laisse alors de côté
  // (un UpdateRecord sur une colonne inconnue annulerait tout le lot, et aucun modèle ne s'enregistrerait plus) et ne retente pas avant dix minutes.
  let pjRetryAt = 0;
  async function pjColumnReady() {
    if (Date.now() < pjRetryAt) return false;
    try { if (await ensurePjColumn()) return true; } catch (e) { /* refus de créer la table : l'enregistrement le dira lui-même */ }
    pjRetryAt = Date.now() + 10 * 60 * 1000;
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
    // Macro-modèles (planning/feature-macro-modeles.md) : TemplateType = 'macro' réutilise la colonne Content pour y ranger du JSON (la liste ordonnée
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

  // Une étape du démarrage dans le rapport de fluidité (js/perf-trace.js, temporaire) ; sans lui (page de test), rien.
  const traceStep = (label, extra) => { if (typeof PerfTrace !== 'undefined') PerfTrace.mark(label, extra); };

  async function readTable() {
    // Lecture de la table des modèles, null si elle est absente ou illisible (document neuf : les migrations de loadAll la créent).
    try {
      const tableData = await SchemaColumns.docApi.fetchTable(TABLE_NAME);
      return tableData && typeof tableData === 'object' ? tableData : null;
    } catch (e) {
      return null;
    }
  }

  // Poids de la dernière lecture de la table, en caractères de texte (contenus et images en base64 compris) : js/main.js en tire l'attente de la
  // relecture au repos, plus longue quand la table est lourde.
  let loadedChars = 0;
  // `weights` : de quoi se compose cette lecture (par colonne, et les lignes les plus lourdes), pour le rapport de fluidité (js/perf-trace.js, temporaire) : la table pèse 42 Mo chez une personne, et ce qui la remplit décide de ce qu'on peut alléger.
  let loadWeights = null;
  const HEAVIEST_ROWS = 6;
  function charsOf(data, weights) {
    let chars = 0;
    const rowChars = weights && Array.isArray(data.id) ? new Array(data.id.length).fill(0) : null;
    Object.keys(data).forEach(column => {
      const values = data[column];
      if (!Array.isArray(values)) return;
      let columnChars = 0;
      for (let i = 0; i < values.length; i++) {
        if (typeof values[i] !== 'string') continue;
        columnChars += values[i].length;
        if (rowChars) rowChars[i] += values[i].length;
      }
      chars += columnChars;
      if (weights) weights.columns[column] = columnChars;
    });
    if (rowChars) {
      weights.rows = rowChars.length;
      weights.heaviest = rowChars.map((total, i) => ({ id: data.id[i], chars: total, type: (data.TemplateType && data.TemplateType[i]) || 'document', name: String((data.Name && data.Name[i]) || '').slice(0, 24) }))
        .sort((a, b) => b.chars - a.chars).slice(0, HEAVIEST_ROWS);
    }
    return chars;
  }
  function getLoadedChars() { return loadedChars; }
  function getLoadWeights() { return loadWeights; }

  // Une ligne de la table des modèles, au format du cache : `cell` lit la colonne si elle existe (une table migrée à moitié, un accès restreint),
  // sinon la valeur par défaut.
  function templateFromRow(data, i) {
    const cell = (column, fallback) => (data[column] ? data[column][i] : fallback);
    const typeModele = cell('TemplateType', '') || 'document';
    return {
      id: data.id[i],
      nom: cell('Name', ''),
      contenu: cell('Content', ''),
      nomFichierPDF: cell('PdfFileName', ''),
      headerFooter: safeParseHeaderFooter(cell('HeaderFooter', null)),
      marginsMm: safeParseMargins(cell('Margins', null)),
      estParDefaut: !!cell('IsDefault', false),
      // Une ligne existante sans TemplateType (créée avant le mode email) est un modèle document - aucune migration de données à rejouer.
      typeModele: typeModele,
      // null pour un modèle document/email : évite de faire porter à chaque consommateur la charge de vérifier typeModele avant de lire ce champ.
      macroSlots: (typeModele === 'macro') ? safeParseMacroSlots(cell('Content', null)) : null,
      // null pour un macro-modèle (jamais chargé dans l'éditeur suivi, cf. loadMacroIntoEditor - js/main.js) - même convention que macroSlots
      // ci-dessus.
      suiviModifications: (typeModele === 'macro') ? null : safeParseSuiviModifications(cell('TrackedChanges', null)),
      destinataires: cell('To', ''),
      cc: cell('Cc', ''),
      cci: cell('Bcc', ''),
      objet: cell('Subject', ''),
      pj: cell('Attachments', ''),
      // Utilisé par js/main.js (auto-save) pour détecter qu'une autre personne a enregistré ce même modèle entre deux vérifications - jamais
      // affiché tel quel à l'utilisateur.
      dateModif: cell('ModifiedAt', null),
      // L'identité du modèle (cf. ensureToken) : '' tant qu'aucun tableau de document ne l'a lié. Le numéro de la ligne ne la donne pas.
      jeton: String(cell('Token', '') || ''),
      // Qui a écrit cet état (cf. ensureModifiedByColumn) : '' quand on ne le sait pas (modèle d'avant la colonne, personne non identifiée).
      modifiePar: String(cell('ModifiedBy', '') || ''),
      // La notice du modèle (cf. ensureNoticeColumn) : du HTML tel que la table le garde, '' quand il n'y en a pas. Elle n'est lue qu'à travers TemplateNotice.clean, jamais posée telle quelle dans la page.
      notice: String(cell(NOTICE_COLUMN, '') || ''),
      // Le jeton de l'email que ce document ou cette grille a pour compagnon (cf. setLinkedEmail) : '' quand aucun n'est lié, ou pour un document d'avant la colonne. Le jeton seul ne désigne rien : EmailLink.emailOf le cherche.
      emailLie: String(cell(LINKED_EMAIL_COLUMN, '') || ''),
    };
  }

  // Une ligne lue par l'interface REST de Grist (`{ id, fields }`, js/grist-api.js:lightRecords), au format du cache : de quoi montrer un document avant la fin de la lecture de toute la table (js/early-preview.js). Les colonnes
  // sont celles que Grist donne, donc sous leurs noms anglais seulement quand le document les porte (un ancien document n'a ni `Content` ni `TemplateType` : le texte est alors vide, et l'aperçu ne se pose pas). null : la ligne
  // des réglages du document, qui n'est pas un modèle.
  function templateFromRecord(record) {
    const columns = { id: [record && record.id] };
    const fields = (record && record.fields) || {};
    Object.keys(fields).forEach((column) => { columns[column] = [fields[column]]; });
    return isSettingsRow(columns, 0) ? null : templateFromRow(columns, 0);
  }
  // Vrai dès que la table des modèles entière est dans le cache : à partir de là, l'ouverture se fait depuis lui.
  function hasLoaded() { return cacheArrivedAt > 0; }

  // Le cache après une écriture de ce widget. La liste charge le modèle choisi depuis le cache (js/main.js:onTemplateSelectChange) et le cache ne se relit qu'au début d'un passage de
  // l'enregistrement automatique qui a quelque chose à écrire et à la lecture au repos (15 s à 3 min), jamais après l'écriture : sans la mise à jour ci-dessous, un modèle quitté puis
  // rouvert aussitôt montrait son état d'AVANT la modification, et l'enregistrement suivant l'écrasait dans Grist sans bandeau (la date de la ligne est celle que ce widget a lui-même écrite).
  // L'entrée est modifiée en place (des modules la tiennent : le résumé d'un macro-modèle, le bandeau de conflit) et cherchée au moment de l'appel, jamais avant un await : loadAll remplace
  // tous les objets du cache.
  function cacheWritten(id) { cacheWrittenAt.set(String(id), ++cacheWrites); cacheRowWrittenAt.set(String(id), Date.now()); }

  // Une ligne que saveRow vient d'écrire : `columns` sont les colonnes posées (sous le nom de leur colonne Grist), lues par templateFromRow comme une ligne de la table ; ce que saveRow
  // n'écrit pas (IsDefault, Token, et Name quand le nom ne change pas) reste ce que l'entrée porte. `dateModif` : celle envoyée, remplacée par celle que Grist relit (noteDateModif).
  function settleWritten(id, columns, dateModif) {
    cacheWritten(id);
    const cached = byId(id);
    if (!cached) return;
    const row = { id: [cached.id], Name: [cached.nom], IsDefault: [cached.estParDefaut], Token: [cached.jeton], [LINKED_EMAIL_COLUMN]: [cached.emailLie], [NOTICE_COLUMN]: [cached.notice], ModifiedAt: [dateModif] };
    Object.keys(columns).forEach(column => { if (column !== 'ModifiedAt') row[column] = [columns[column]]; });
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

  // Les réglages du document : une ligne réservée de cette table (TemplateType = 'reglages', leur JSON dans Content, comme un macro-modèle y range ses
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

  const isSettingsRow = (data, i) => !!data.TemplateType && data.TemplateType[i] === SETTINGS_TYPE;

  // `at` : le rang de la ligne réservée dans `data` (-1 quand la table n'en a pas) ; `epoch` : settingsEpoch quand la lecture a commencé. Une lecture
  // qui a croisé une écriture de ce widget (partie avant elle, ou finie pendant) montre un état d'avant : elle n'est pas adoptée, la suivante le sera.
  function adoptDocumentSettings(data, at, epoch) {
    if (epoch !== settingsEpoch || settingsPending > 0) return;
    const before = JSON.stringify(documentSettings);
    settingsRowId = at === -1 ? null : data.id[at];
    settingsSaved = at === -1 ? {} : safeParseObject(data.Content ? data.Content[at] : null);
    documentSettings = settingsSaved;
    if (JSON.stringify(documentSettings) !== before) announceSettings();
  }

  // Prévient les modules qui montrent un réglage du document (le style des titres, js/heading-styles.js) qu'il a pu changer : une écriture d'ici, le retour arrière d'une écriture refusée, une lecture qui
  // apporte ce qu'une autre personne a écrit. Rien hors d'une page (les essais de ce module seul).
  function announceSettings() {
    if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('pp:documentSettingsChanged'));
  }

  // Une copie des réglages du document ({} tant que rien n'est écrit ou lu).
  function getDocumentSettings() { return JSON.parse(JSON.stringify(documentSettings)); }

  // Une copie d'UN réglage du document (undefined quand il n'est pas écrit) : la lecture légère de ce que la barre d'outils relit à chaque mise à jour de la sélection.
  function getDocumentSetting(key) {
    const value = documentSettings[key];
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  // Fusionne `patch` ({ clé: valeur }, une valeur null ou absente retire la clé) dans les réglages du document et les écrit. Le changement vaut tout
  // de suite pour getDocumentSettings ; la promesse rend vrai quand Grist l'a écrit, faux sinon (table refusée, droit d'écriture absent, Grist
  // injoignable) : les lecteurs retrouvent alors le dernier état confirmé. Plusieurs changements de suite font une écriture utile, de l'état le plus
  // récent.
  function updateDocumentSettings(patch) {
    const next = Object.assign({}, documentSettings);
    Object.keys(patch).forEach(key => { if (patch[key] == null) delete next[key]; else next[key] = patch[key]; });
    if (JSON.stringify(next) === JSON.stringify(documentSettings)) return Promise.resolve(true);
    documentSettings = next;
    announceSettings();
    settingsPending++;
    settingsEpoch++;
    settingsQueue = settingsQueue || GristAPI.createWriteQueue();
    return settingsQueue.enqueue(async () => {
      const wanted = JSON.stringify(documentSettings);
      if (wanted === JSON.stringify(settingsSaved)) return;
      await ensureEmailColumns(); // TemplateType : la colonne qui désigne la ligne
      if (settingsRowId != null) {
        await SchemaColumns.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, settingsRowId, { Content: wanted }]]);
      } else {
        const result = await SchemaColumns.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Name: SETTINGS_NAME, Content: wanted, TemplateType: SETTINGS_TYPE }]]);
        settingsRowId = result.retValues[0];
      }
      settingsSaved = JSON.parse(wanted);
    }).then(() => { settingsPending--; settingsEpoch++; return true; }, (e) => {
      settingsPending--;
      settingsEpoch++;
      if (!GristAPI.isTablesDeclined(e)) console.warn('[Templates] réglages du document non enregistrés', e);
      if (settingsPending === 0) { documentSettings = settingsSaved; announceSettings(); }
      return false;
    });
  }

  // Le mot de passe commun des PDF protégés, quand la personne a choisi de le garder dans le document (mode « le même pour tous, enregistré dans le document » de la fenêtre
  // js/pdf-protection-dialog.js ; demande du 12/10 : « un mot de passe stocké dans grist pour l'ensemble des pdf, bien indiqué dans quel table/colonne il sera stocké et le
  // risque »). Il s'écrit dans la colonne PDF_PASSWORD_COLUMN de la même ligne réservée que les réglages du document, et non dans leur JSON : une règle d'accès de Grist peut ainsi
  // masquer cette colonne seule. Il y est EN CLAIR - toute personne qui ouvre le document le lit, sauf règle d'accès -, et c'est ce que la fenêtre dit. Il n'entre dans aucun cache du
  // widget (ni la liste des modèles, ni getDocumentSettings) : chaque lecture relit la table. PDF_PASSWORD_LOCATION dit où le chercher, pour que la fenêtre le nomme.
  // Les noms que la personne voit dans Grist, pour CE document : ceux d'avant tant que le document les porte (SchemaColumns.whereIs).
  const pdfPasswordLocation = () => Object.freeze(Object.assign(SchemaColumns.whereIs(TABLE_NAME, PDF_PASSWORD_COLUMN), { row: SETTINGS_NAME }));

  // Le rang de la ligne réservée dans `data` (la première s'il y en a plusieurs, comme loadAll), -1 quand la table n'en a pas.
  const settingsRowAt = data => data.id.findIndex((id, i) => isSettingsRow(data, i));

  // Rend { ok, password } : `ok` faux quand la table n'a pas pu être lue (refusée, absente, Grist injoignable) ; sinon le mot de passe gardé, '' quand il n'y en a pas - ni colonne, ni
  // ligne, ou une colonne que les règles d'accès cachent à cette personne. Lire ne crée jamais rien.
  async function readPdfPassword() {
    const tableData = await readTable();
    if (!tableData || !Array.isArray(tableData.id)) return { ok: false, password: '' };
    const at = settingsRowAt(tableData);
    const cell = at === -1 || !Array.isArray(tableData[PDF_PASSWORD_COLUMN]) ? '' : tableData[PDF_PASSWORD_COLUMN][at];
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
      await ensureEmailColumns(); // TemplateType : la colonne qui désigne la ligne
      await ensurePdfPasswordColumn();
      const tableData = await SchemaColumns.docApi.fetchTable(TABLE_NAME);
      if (!Array.isArray(tableData[PDF_PASSWORD_COLUMN])) throw new Error('Colonne ' + PDF_PASSWORD_COLUMN + ' absente ou cachée : le mot de passe n’est pas enregistré.');
      const at = settingsRowAt(tableData);
      if (at === -1) {
        const result = await SchemaColumns.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Name: SETTINGS_NAME, TemplateType: SETTINGS_TYPE, [PDF_PASSWORD_COLUMN]: wanted }]]);
        if (settingsRowId == null) settingsRowId = result.retValues[0];
        return;
      }
      if (settingsRowId == null) settingsRowId = tableData.id[at];
      if (tableData[PDF_PASSWORD_COLUMN][at] !== wanted) await SchemaColumns.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, tableData.id[at], { [PDF_PASSWORD_COLUMN]: wanted }]]);
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
      await pjColumnReady();
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
      const tableData = first && migrationRuns === runsBefore ? first : await SchemaColumns.docApi.fetchTable(TABLE_NAME);
      const weights = { columns: {}, rows: 0, heaviest: [] };
      const weighStart = Date.now();
      loadedChars = charsOf(tableData, weights);
      loadWeights = Object.assign(weights, { weighMs: Date.now() - weighStart });
      traceStep('modèles : table reçue', { lignes: weights.rows, signesMo: Math.round(loadedChars / 104857.6) / 10 });
      confirmPredictedDates(tableData, writtenAtStart);
      // La ligne des réglages du document n'est pas un modèle : mise de côté, jamais dans le cache.
      const templates = [];
      let settingsAt = -1;
      const rowsStart = Date.now();
      tableData.id.forEach((id, i) => {
        if (!isSettingsRow(tableData, i)) templates.push(templateFromRow(tableData, i));
        else if (settingsAt === -1) settingsAt = i;
      });
      loadWeights.rowsMs = Date.now() - rowsStart;
      templatesCache = keepWrittenSince(templates, writtenAtStart);
      cacheReadAt = readStartedAt;
      cacheArrivedAt = Date.now();
      adoptDocumentSettings(tableData, settingsAt, settingsEpochAtStart);
      traceStep('modèles : en cache', { rowsMs: loadWeights.rowsMs });
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

  // Les types de modèle que ce widget sait ouvrir (colonne TemplateType ; la valeur vide est un document), plus ceux d'une extension de Grist Factory Suite que GFS a activée (« presentation »,
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

  // Nom libre le plus proche de `nom` : `nom` lui-même s'il est libre, sinon « nom (2) », « nom (3) »... Un nom qui finit déjà par « (n) » continue sa série au numéro suivant (dupliquer « Rapport (2) » donne
  // « Rapport (3) », pas « Rapport (2) (2) »). `taken(nom)` dit si un autre modèle le porte déjà.
  function freeName(nom, taken) {
    const base = String(nom || '').trim();
    if (!base || !taken(base)) return base;
    const series = base.match(/^(.*\S)\s*\((\d+)\)$/);
    const root = series ? series[1] : base;
    let x = series ? Number(series[2]) + 1 : 2;
    while (taken(root + ' (' + x + ')')) x++;
    return root + ' (' + x + ')';
  }

  // Lit le cache des modèles, relu à chaque enregistrement et à chaque passage de l'enregistrement automatique : il ne retarde que d'un nom créé à l'instant par quelqu'un d'autre.
  function uniqueName(nom, ignoreId) {
    return freeName(nom, candidate => isNameTaken(candidate, ignoreId));
  }

  function getCurrentId() { return currentTemplateId; }

  const isCurrent = id => id != null && sameId(currentTemplateId, id);

  function setCurrentId(id) { currentTemplateId = id; currentIdSeq++; }

  // Ce qui suit la naissance d'un modèle : `fn(id)` est attendue (jamais plus d'un abonné, le dernier) juste après l'écriture de sa ligne, avant que save() rende la main. js/main.js y range le modèle dans le
  // dossier que GFS a donné à sa création (js/gfs-open.js) : la ligne de rangement part avec le premier enregistrement, la liste la montre dès qu'il est fini. Un abonné qui échoue ne fait pas échouer
  // l'enregistrement : la ligne du modèle est écrite, ce serait mentir.
  let createdHook = null;
  function onCreated(fn) { createdHook = typeof fn === 'function' ? fn : null; }

  function getDefaultId() {
    // Un modèle email ou macro n'est jamais le ★ du document (cf. js/main.js, syncDefaultTemplateButton) : une ligne restée marquée
    // IsDefault sur l'un d'eux (défaut posé avant cette règle, colonne éditée dans Grist) ne doit pas masquer un modèle document lui aussi marqué,
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
      if (t.estParDefaut && isOpenableType(t.typeModele) && !sameId(t.id, id)) actions.push(['UpdateRecord', TABLE_NAME, t.id, { IsDefault: false }]);
    });
    if (id != null) actions.push(['UpdateRecord', TABLE_NAME, id, { IsDefault: true }]);
    if (actions.length) await SchemaColumns.docApi.applyUserActions(actions);
    templatesCache.forEach(t => { if (isOpenableType(t.typeModele)) t.estParDefaut = (id != null && sameId(t.id, id)); });
  }

  // LA DATE QUE GRIST GARDE, SANS LA RELIRE (11/11, table lourde : relire une date, c'était faire revenir les 38 Mo de la table après chaque enregistrement). Une colonne « Date et heure » qui reçoit la
  // date ISO de saveRow garde ce même instant en secondes, millièmes compris : exactement Date.parse(iso) / 1000 (mesuré dans un vrai Grist, grist-static 0.1.6 : 47 dates sur 47, le même nombre bit pour
  // bit). Ce n'est tenu pour vrai dans CE document qu'après l'avoir vu : `dateModifShape` vaut 'seconds' quand la dernière relecture a rendu ce nombre pour chaque ligne écrite (à un instant qui ne tombait pas pile sur une seconde), 'other' sinon (une
  // colonne d'un autre type, un Grist qui arrondirait : le faux Grist des essais arrondit à la seconde, sauf demande). Alors, et pour une table lourde seulement (HEAVY_TABLE_CHARS : rien ne change pour
  // les autres), la date d'un enregistrement est ce nombre, sans relecture. La lecture suivante de la table le confirme (confirmPredictedDates, dans loadAll - le passage suivant de l'enregistrement
  // automatique la fait avant d'écrire) : une date prévue que Grist ne rend pas - une autre personne a écrit la ligne depuis, ou la colonne a changé - remet 'other', et les enregistrements relisent de
  // nouveau leur date jusqu'à ce qu'une relecture redonne le nombre prévu.
  let dateModifShape = '';
  const predictedDates = new Map();   // identifiant de ligne (en texte) -> la date prévue à sa dernière écriture, tant qu'aucune lecture ne l'a confirmée
  function predictedDateModif(iso) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return Number.isNaN(ms) ? null : ms / 1000;
  }
  // `tableData` : la table qui vient d'arriver ; `writtenAtStart` : `cacheWrites` au début de sa lecture. Une ligne écrite pendant cette lecture y a peut-être encore son état d'avant (cf. keepWrittenSince) :
  // sa date prévue attend la lecture suivante.
  function confirmPredictedDates(tableData, writtenAtStart) {
    if (!predictedDates.size || !tableData || !Array.isArray(tableData.id)) return;
    predictedDates.forEach((predicted, key) => {
      if (cacheWrittenAt.get(key) > writtenAtStart) return;
      const at = tableData.id.findIndex(rowId => String(rowId) === key);
      if (at !== -1 && (!tableData.ModifiedAt || tableData.ModifiedAt[at] !== predicted)) dateModifShape = 'other';
      predictedDates.delete(key);
    });
  }

  async function readBackDateModifs(rowIds, fallback, writtenChars = 0) {
    // Relit le ModifiedAt réellement stocké par Grist pour ces lignes plutôt que de se fier à la chaîne ISO qu'on vient d'envoyer : rien ne garantit
    // que Grist la redonne telle quelle (une colonne DateTime peut être représentée autrement en interne, en nombre par exemple). js/main.js
    // (autosaveTick) compare la valeur renvoyée par save() à une valeur lue plus tard par loadAll() ou fetchTable() : dans deux représentations
    // différentes, la comparaison stricte voit un faux conflit dès le tick suivant, même seul sur le document. Passer par la même lecture des deux
    // côtés l'évite, quelle que soit la représentation. Défensif : un échec ici (colonne absente, ligne introuvable, requête en échec) ne doit pas
    // faire échouer un enregistrement réussi par ailleurs ; on retombe sur la chaîne ISO d'origine. Une seule lecture de la table pour toutes les lignes
    // (un enregistrement qui écrit aussi des modèles Grille, cf. saveRow) ; rend une Map identifiant -> ModifiedAt.
    // `writtenChars` : le poids du texte que l'enregistrement vient d'écrire. Table lourde (ce poids, ou celui de sa dernière lecture) dont on sait comment Grist garde une date : la date est prévue,
    // la table n'est pas relue (voir plus haut).
    const dates = new Map();
    const predicted = predictedDateModif(fallback);
    if (dateModifShape === 'seconds' && predicted !== null && Math.max(loadedChars, writtenChars) >= HEAVY_TABLE_CHARS) {
      rowIds.forEach((rowId) => { dates.set(rowId, predicted); predictedDates.set(String(rowId), predicted); });
      return dates;
    }
    const keep = rowId => dates.set(rowId, fallback);
    try {
      const tableData = await SchemaColumns.docApi.fetchTable(TABLE_NAME);
      let asPredicted = predicted !== null;
      rowIds.forEach((rowId) => {
        predictedDates.delete(String(rowId));
        const idx = tableData.id.indexOf(rowId);
        if (idx === -1 || !tableData.ModifiedAt) {
          console.error('Relecture ModifiedAt après enregistrement : ligne ou colonne introuvable, valeur locale conservée');
          keep(rowId);
          asPredicted = false;
        } else {
          dates.set(rowId, tableData.ModifiedAt[idx]);
          if (tableData.ModifiedAt[idx] !== predicted) asPredicted = false;
        }
      });
      // Un instant tombé pile sur une seconde ne prouve rien (une colonne qui arrondirait à la seconde rendrait le même nombre) : il ne fait jamais passer à 'seconds', il peut seulement en faire sortir.
      if (!asPredicted) dateModifShape = 'other';
      else if (!Number.isInteger(predicted)) dateModifShape = 'seconds';
    } catch (e) {
      console.error('Erreur relecture ModifiedAt après enregistrement', e);
      rowIds.forEach(keep);
    }
    return dates;
  }
  async function readBackDateModif(rowId, fallback, writtenChars = 0) { return (await readBackDateModifs([rowId], fallback, writtenChars)).get(rowId); }

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
  // Une table lourde met des secondes à venir : comptés depuis le début de sa lecture, les trois secondes de fraîcheur étaient passées quand elle arrivait, et l'enregistrement qui suit la lecture d'un
  // passage la relisait aussitôt en entier (une traversée de plus, pour rien : relue, elle aurait eu le même âge en arrivant). Sa fraîcheur se compte donc depuis son arrivée.
  async function storedStateFor(id) {
    const cached = byId(id);
    const freshAt = Math.max(loadedChars >= HEAVY_TABLE_CHARS ? cacheArrivedAt : cacheReadAt, cacheRowWrittenAt.get(String(id)) || 0);
    if (cached && Date.now() - freshAt <= CACHE_FRESH_MS) return cached;
    const tableData = await readTable();
    if (!tableData || !Array.isArray(tableData.id)) return cached || null;
    const at = tableData.id.findIndex(rowId => sameId(rowId, id));
    return at === -1 ? null : templateFromRow(tableData, at);
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
    if (!copy) return SchemaColumns.docApi.applyUserActions(actions);
    let result;
    try {
      result = await SchemaColumns.docApi.applyUserActions([...actions, copy.action]);
    } catch (error) {
      let again;
      try { again = await SchemaColumns.docApi.applyUserActions(actions); } catch (e) { throw error; }
      VersionsStore.suspend(error);
      return again;
    }
    copy.commit(result && result.retValues ? result.retValues[actions.length] : null);
    return result;
  }

  async function saveRow(id, nom, contenuHtml, nomFichierPDF, headerFooterData, marginsData, typeModele = 'document', emailFields = null, suiviModifications = null, alsoWrite = null, versionOptions = null) {
    // `nom` : le nom que la personne a donné ici, ou null pour une ligne existante dont elle n'a pas changé le nom : la colonne Name n'est alors pas dans le lot et la ligne garde celui qu'elle porte (GFS
    // renomme un fichier en n'écrivant que cette colonne : un nom d'avant remis dans chaque lot le défaisait, consigne GFS 029). Une ligne neuve porte toujours le sien.
    // Rend { id, dateModif } (pas seulement l'id) : js/main.js (auto-save) doit connaître le ModifiedAt qu'il vient d'écrire pour le distinguer d'un
    // ModifiedAt constaté plus tard, preuve qu'une autre personne a enregistré ce modèle entre-temps. dateModif vient d'une relecture de Grist
    // (readBackDateModif), pas de la chaîne ISO envoyée. `typeModele` et `emailFields` (mode email, cf. ensureEmailColumns) sont facultatifs : les
    // appels du mode document ne changent pas. emailFields = { destinataires, cc, cci, objet, pj }, ignoré (colonnes laissées vides) pour un modèle
    // document. `suiviModifications` : { [id]: { author, createdAt } } (TrackChanges.computeMetadata, js/track-changes.js), écrite dans le même
    // UpdateRecord/AddRecord que Content, jamais dans un appel séparé (planning/feature-track-changes.md : la fenêtre de risque en cas de conflit
    // d'auto-save). null pour un macro-modèle (Editor.getSuiviModificationsForSave n'est jamais appelée sur ce chemin, cf. onSave dans js/main.js).
    // `alsoWrite` : [{ id, contenu }], les modèles Grille que les tableaux liés du document ont changé (js/linked-table.js:prepareSend). Leur Content et leur ModifiedAt s'écrivent
    // dans le MÊME applyUserActions que la ligne du document : Grist applique le lot en entier ou pas du tout, jamais le document sans le modèle ni l'inverse (un modèle supprimé
    // entre-temps refuse le lot, et rien n'est écrit). Leur ModifiedAt est noté et leur contenu mis dans le cache comme le fait saveContent.
    // `versionOptions` : { force, genre } de l'historique des versions (cf. prepareVersionCopy) ; l'état que l'enregistrement remplace s'y garde dans le même lot, quand les règles de VersionsStore le demandent.
    refuseUnwritable(id, typeModele);
    (alsoWrite || []).forEach(other => refuseUnwritable(other.id));
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    const writesPj = await pjColumnReady();
    await ensureTrackChangesColumn();
    const writesModifiedBy = await modifiedByColumnReady();
    const now = new Date().toISOString();
    const email = emailFields || {};
    const columns = {
      Content: contenuHtml, PdfFileName: nomFichierPDF, ModifiedAt: now,
      HeaderFooter: JSON.stringify(headerFooterData || safeParseHeaderFooter(null)),
      Margins: JSON.stringify(marginsData || safeParseMargins(null)),
      TemplateType: typeModele,
      To: email.destinataires || '', Cc: email.cc || '', Bcc: email.cci || '', Subject: email.objet || '',
      TrackedChanges: JSON.stringify(suiviModifications || {}),
    };
    // Jamais une colonne que la table n'a pas : Grist refuserait tout le lot (cf. modifiedByColumnReady, pjColumnReady).
    if (writesPj) columns.Attachments = email.pj || '';
    if (writesModifiedBy) columns.ModifiedBy = currentAuthorLabel();
    if (nom != null || !id) columns.Name = nom == null ? '' : nom;
    const others = alsoWrite || [];
    // Le poids de ce qui part : readBackDateModifs ne relit pas une table lourde pour une date qu'il sait prévoir.
    const writtenChars = others.reduce((sum, other) => sum + (typeof other.contenu === 'string' ? other.contenu.length : 0), typeof contenuHtml === 'string' ? contenuHtml.length : 0);
    const otherActions = others.map(({ id: modelId, contenu }) => ['UpdateRecord', TABLE_NAME, modelId, { Content: contenu, ModifiedAt: now }]);
    // Ce que les modèles écrits avec le document gardent après coup : leur contenu dans le cache dès l'écriture faite, puis leur ModifiedAt relu, noté.
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
      if (typeof contenuHtml === 'string') writtenTextSize.set(String(id), contenuHtml.length);
      const dates = await readBackDateModifs([id, ...others.map(({ id: modelId }) => modelId)], now, writtenChars);
      const dateModif = dates.get(id);
      writes.remember(id, dateModif);
      noteDateModif(id, dateModif);
      settleOthers(dates);
      return { id, dateModif };
    } else {
      const seqAtStart = currentIdSeq;
      const result = await SchemaColumns.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns],
        ...otherActions
      ]);
      const newId = result.retValues[0];
      // Le modèle neuf devient le modèle courant, sauf si un autre a été chargé pendant l'écriture (Grist lent : des secondes) : c'est celui-là qui
      // est à l'écran, et l'enregistrement automatique y écrirait ensuite, sous l'identifiant du modèle neuf, ce que l'écran montre.
      if (currentIdSeq === seqAtStart) currentTemplateId = newId;
      settleOthersContent();
      if (typeof contenuHtml === 'string') writtenTextSize.set(String(newId), contenuHtml.length);
      const dates = await readBackDateModifs([newId, ...others.map(({ id: modelId }) => modelId)], now, writtenChars);
      const dateModif = dates.get(newId);
      writes.remember(newId, dateModif);
      settleOthers(dates);
      if (createdHook) {
        try { await createdHook(newId); } catch (e) { console.warn('[Templates] suite de la création impossible', e); }
      }
      return { id: newId, dateModif };
    }
  }

  // Écrit le seul contenu d'un modèle (et sa date de modification), jamais ses autres colonnes : son nom, son nom de fichier PDF, son en-tête, ses marges, son type
  // gardent ce qu'ils ont. C'est le tableau qu'un tableau lié d'un document envoie à son modèle Grille (js/linked-table.js). Même relecture du ModifiedAt que saveRow
  // (js/main.js compare les deux). Pas pour un macro-modèle, dont le contenu est la liste de ses emplacements. Rend { id, dateModif }.
  async function saveContent(id, contenuHtml) {
    refuseUnwritable(id);
    await ensureTableExists();
    await ensureDateModifColumn();
    const now = new Date().toISOString();
    await SchemaColumns.docApi.applyUserActions([
      ['UpdateRecord', TABLE_NAME, id, { Content: contenuHtml, ModifiedAt: now }]
    ]);
    settleContent(id, contenuHtml, now);
    if (typeof contenuHtml === 'string') writtenTextSize.set(String(id), contenuHtml.length);
    const dateModif = await readBackDateModif(id, now, typeof contenuHtml === 'string' ? contenuHtml.length : 0);
    writes.remember(id, dateModif);
    noteDateModif(id, dateModif);
    return { id, dateModif };
  }

  // Le jeton qui dit de quel modèle il s'agit : un tableau de document lié à un modèle Grille le recopie (js/linked-table.js) et le lien ne compte que si les deux sont égaux. Le
  // numéro de la ligne ne suffit pas : Grist peut le redonner à un autre modèle une fois la ligne supprimée, et un tableau copié depuis un autre document en porte un qui désigne
  // ici un modèle sans rapport. Crée la colonne `Token` au premier besoin, relit la ligne dans Grist et n'écrit un jeton que si elle n'en a pas (un jeton existant ne change jamais) ;
  // rend celui que Grist garde, ou '' quand le modèle n'existe plus. Écrit la colonne `Token` seule : ni Content ni ModifiedAt, aucun conflit d'enregistrement automatique.
  function newToken() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), word => word.toString(36).padStart(7, '0')).join('').slice(0, 24);
  }
  // `fresh` : l'appelant vient de relire la table (loadAll) ; si le cache n'y voit pas de jeton pour ce modèle, il n'y en a pas, et la première relecture de la table entière (des dizaines de Mo pour un gros
  // PowerPoint) n'apprendrait rien : seul le jeton écrit est relu, pour la course ci-dessous.
  async function ensureToken(id, { fresh = false } = {}) {
    await ensureTableExists();
    await ensureTokenColumn();
    async function read() {
      const tableData = await SchemaColumns.docApi.fetchTable(TABLE_NAME);
      const at = tableData.id.findIndex(rowId => sameId(rowId, id));
      return { rowId: at === -1 ? null : tableData.id[at], token: at === -1 || !tableData.Token ? '' : String(tableData.Token[at] || '') };
    }
    const known = fresh ? byId(id) : null;
    let { rowId, token } = known && !known.jeton ? { rowId: known.id, token: '' } : await read();
    if (rowId == null) return '';
    if (!token) {
      await SchemaColumns.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, rowId, { Token: newToken() }]]);
      // Celui que Grist garde : deux personnes qui posent le premier lien du même modèle au même instant partagent le dernier jeton écrit.
      ({ token } = await read());
    }
    const cached = byId(id);
    if (cached && token) cached.jeton = token;
    return token;
  }

  // La notice d'un modèle (js/template-notice.js), écrite dans la colonne `Notice` SEULE : ni Content ni ModifiedAt, donc aucun conflit avec l'enregistrement automatique du texte (même règle qu'ensureToken). Crée la colonne à la
  // première notice. Un modèle d'un type inconnu n'est pas écrit (refuseUnwritable) ; une colonne qu'on ne peut pas créer (compte qui n'a pas le droit d'ajouter une colonne, Lecteur) lève : la fenêtre le dit, rien n'est perdu.
  // Le cache prend la notice tout de suite et la garde contre une lecture de la table partie avant l'écriture (keepWrittenSince). Rend le HTML écrit.
  function saveNotice(id, html) {
    return writes.track(async () => {
      refuseUnwritable(id);
      const value = typeof html === 'string' ? html : '';
      await ensureTableExists();
      if (!(await ensureNoticeColumn())) throw new Error('La colonne des notices ne peut pas être créée : rien n’a été enregistré.');
      await SchemaColumns.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, id, { [NOTICE_COLUMN]: value }]]);
      // Cherché après l'écriture : une relecture de la table a pu remplacer les objets du cache pendant qu'elle durait.
      const cached = byId(id);
      if (cached) { cached.notice = value; cacheWritten(id); }
      return value;
    });
  }

  // L'email que le document (ou la grille) `id` a pour compagnon : le jeton de `emailId` dans la colonne LinkedEmail de sa ligne, `null` pour retirer le lien. Le jeton et non le numéro de la ligne, comme le lien d'un tableau (cf.
  // ensureToken) : un numéro rendu à un autre modèle ne fait pas passer le lien sur un email sans rapport, et un email supprimé puis rendu par Annuler (même jeton) retrouve ses documents. Écrit la colonne seule - ni Content ni
  // ModifiedAt - et crée la colonne au premier lien posé (jamais pour retirer un lien qui n'existe pas). Le jeton de l'email se crée au besoin. Refuse (erreur) un document ou un email qui n'existe plus, ou qui n'est pas d'un type
  // qui se lie : rien n'est écrit. Rend le jeton écrit ('' pour un lien retiré).
  function setLinkedEmail(id, emailId) {
    return writes.track(async () => {
      const wantsLink = emailId != null && emailId !== '';
      const row = byId(id);
      if (!row) throw new Error('Document introuvable : rien n’a été lié.');
      if (DEFAULT_TYPES.indexOf(row.typeModele) === -1) throw new Error('Seul un document ou une grille se lie à un email : rien n’a été lié.');
      if (wantsLink) {
        const email = byId(emailId);
        if (!email || email.typeModele !== 'email') throw new Error('Email introuvable : rien n’a été lié.');
      } else if (!row.emailLie) {
        return '';
      }
      await ensureTableExists();
      await ensureLinkedEmailColumn();
      const token = wantsLink ? await ensureToken(emailId) : '';
      if (wantsLink && !token) throw new Error('Email introuvable : rien n’a été lié.');
      // Le numéro de la ligne tel que le cache le rend (un nombre) : l'appelant le tient d'une liste de choix, où c'est un texte, que Grist ne prend pas pour un numéro de ligne.
      await SchemaColumns.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, row.id, { [LINKED_EMAIL_COLUMN]: token }]]);
      cacheWritten(row.id);
      // Cherché après l'écriture : une relecture de la table a pu remplacer les objets du cache pendant qu'elle durait.
      const cached = byId(row.id);
      if (cached) cached.emailLie = token;
      return token;
    });
  }

  function createWriteTracker() {
    // Les écritures en cours de ce widget et ce qu'elles laissent dans Grist. js/main.js (auto-save, commentaires de la Lecture) compare le ModifiedAt
    // relu dans Grist à celui que ce widget a écrit en dernier pour dire « modifié ailleurs ». Or une écriture n'est pas un instant : Grist
    // l'applique, puis la relecture du ModifiedAt (readBackDateModif) revient plus tard, des secondes quand Grist répond lentement (la table des
    // modèles se relit en entier). Une lecture qui tombe dans cet intervalle voit la date écrite sans la connaître encore, ou revient avec l'état
    // d'avant l'écriture : faux conflit, alors que personne d'autre n'a rien touché. getWriteSeq() change au début et à la fin de chaque écriture :
    // une lecture qui commence et finit avec le même nombre n'a croisé aucune écriture de ce widget. isWriting() : une écriture est en cours ;
    // whenIdle() : rend la main quand plus aucune ne l'est ; lastWritten(id) : le ModifiedAt que Grist a relu après la dernière écriture de cette
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

  // Le nombre de signes du texte que le dernier enregistrement de chaque ligne a écrit : verifyStored le compare à ce que Grist rend à la relecture de la table (loadAll). Seul le nombre est gardé, jamais le texte.
  const writtenTextSize = new Map();
  // Ce que Grist garde de la ligne `id` d'après la dernière lecture de la table : 'ok' (la ligne est là, avec le nom et le texte que le dernier enregistrement de CE widget a écrits), 'missing' (la ligne n'est pas dans
  // la table lue) ou 'differs' (elle y est, mais son texte n'a pas la taille de celui qui est parti). À appeler après l'enregistrement ET la relecture de la liste (js/main-save.js la fait avant de rendre la main) : le cache
  // est alors ce que Grist a rendu, pas ce que le widget a écrit (js/templates.js:keepWrittenSince ne garde la valeur écrite que pour une ligne écrite PENDANT la lecture).
  function verifyStored(id, name) {
    const row = byId(id);
    if (!row) return 'missing';
    if (typeof name === 'string' && name.trim() !== '' && String(row.nom).trim() !== name.trim()) return 'differs';
    const size = writtenTextSize.get(String(id));
    if (size !== undefined && typeof row.contenu === 'string' && row.contenu.length !== size) return 'differs';
    return 'ok';
  }

  function save(...args) { return writes.track(() => saveRow(...args)); }
  function saveContentTracked(...args) { return writes.track(() => saveContent(...args)); }

  function dateModifSeconds(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') { const ms = Date.parse(value); return Number.isNaN(ms) ? null : ms / 1000; }
    return null;
  }
  function sameDateModif(a, b) {
    // Deux formes d'un même ModifiedAt : Grist rend une colonne DateTime en secondes (un nombre, décimales comprises : grist-core,
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
    await SchemaColumns.docApi.applyUserActions([
      ['RemoveRecord', TABLE_NAME, id]
    ]);
    // Ses versions restent dans leur table jusqu'à la prochaine ouverture de l'historique, qui les retire : supprimer un modèle ne lit rien (la table des versions n'est lue qu'à l'ouverture de l'historique).
    if (versionsAvailable()) VersionsStore.forget(id);
  }

  // Les colonnes qu'une ligne de la table porte pour le widget (celles que templateFromRow lit et que saveRow écrit) : de quoi rendre une ligne supprimée telle qu'elle était. Pas les autres colonnes du document : Grist
  // refuse toute valeur dans une colonne à formule, et tout le lot sur une colonne qu'il ne connaît pas.
  const ROW_COLUMNS = ['Name', 'Content', 'PdfFileName', 'ModifiedAt', 'HeaderFooter', 'Margins', 'IsDefault', 'TemplateType', 'To', 'Cc', 'Bcc', 'Subject', 'Attachments', 'TrackedChanges', 'Token', 'ModifiedBy', LINKED_EMAIL_COLUMN, NOTICE_COLUMN];

  // La ligne `id` telle que Grist la garde en ce moment - relue, pas celle du cache : une autre personne a pu l'enregistrer depuis -, à lire AVANT de la supprimer (Annuler la rend, cf. restoreRow). { id, values } ; null si la
  // ligne n'existe plus ou si la table ne se lit pas.
  async function snapshotRow(id) {
    const tableData = await readTable();
    if (!tableData || !Array.isArray(tableData.id)) return null;
    const at = tableData.id.findIndex(rowId => sameId(rowId, id));
    if (at === -1) return null;
    const values = {};
    ROW_COLUMNS.forEach(column => { if (tableData[column]) values[column] = tableData[column][at]; });
    return { id: tableData.id[at], values };
  }

  // Rend à la table la ligne que snapshotRow a gardée. Sous le MÊME numéro - les commentaires, le rangement et les choix d'export de la personne le désignent, et un tableau lié le désigne avec son jeton - et le même jeton ; si
  // quelqu'un a pris ce numéro depuis, sous un numéro neuf (le contenu revient, pas ce qui tenait au numéro). Ce que le document a décidé depuis n'est pas écrasé : un nom devenu pris reçoit un numéro (« nom (2) »), un autre ★ reste
  // où il est. Une colonne que la table n'a plus n'est pas écrite (Grist refuserait tout). Rend { present: true } quand un modèle de même jeton est déjà là (rien n'est écrit), sinon { id, nom, renamed }.
  function restoreRow(snapshot) {
    return writes.track(async () => {
      await ensureTableExists();
      const tableData = await readTable();
      if (!tableData || !Array.isArray(tableData.id)) throw new Error('Table des modèles illisible : rien n’a été rendu.');
      // Un ★ resté sur un email ou un macro-modèle ne compte pas (cf. getDefaultId).
      const rows = tableData.id.map((rowId, i) => ({
        id: rowId, settings: isSettingsRow(tableData, i), nom: tableData.Name ? tableData.Name[i] : '',
        jeton: tableData.Token ? String(tableData.Token[i] || '') : '',
        isDefault: !!(tableData.IsDefault && tableData.IsDefault[i]) && canBeDocumentDefault(tableData.TemplateType ? tableData.TemplateType[i] : ''),
      }));
      const token = String(snapshot.values.Token || '');
      if (token) {
        const back = rows.find(row => row.jeton === token);
        if (back) return { present: true, id: back.id };
      }
      const values = {};
      ROW_COLUMNS.forEach(column => { if (column in tableData && snapshot.values[column] !== undefined) values[column] = snapshot.values[column]; });
      const models = rows.filter(row => !row.settings);
      const original = String(values.Name || '').trim();
      const nom = freeName(original, candidate => models.some(row => sameName(row.nom, candidate)));
      const renamed = nom !== original;
      if (renamed) values.Name = nom;
      if (values.IsDefault && models.some(row => row.isDefault)) values.IsDefault = false;
      const sameNumber = !rows.some(row => sameId(row.id, snapshot.id));
      const result = await SchemaColumns.docApi.applyUserActions([['AddRecord', TABLE_NAME, sameNumber ? snapshot.id : null, values]]);
      const id = result && result.retValues && result.retValues[0] != null ? result.retValues[0] : snapshot.id;
      cacheWritten(id);
      return { id, nom, renamed };
    });
  }

  // Remet dans le modèle `id` l'état `snapshot` d'une de ses versions (VersionsStore.unpack), sous son nom d'aujourd'hui (celui de la ligne : le lot n'écrit pas Name). L'état qu'elle remplace est gardé d'office
  // (genre « restauration ») : une restauration se défait par la même fenêtre. Rend { id, dateModif }, comme save.
  function restoreVersion(id, snapshot) {
    const cached = byId(id);
    if (!cached) return Promise.reject(new Error('Modèle introuvable : rien n’a été restauré.'));
    if ((snapshot.typeModele || 'document') !== cached.typeModele) return Promise.reject(new Error('Cette version est d’un autre type de modèle : rien n’a été restauré.'));
    const email = { destinataires: snapshot.destinataires, cc: snapshot.cc, cci: snapshot.cci, objet: snapshot.objet, pj: snapshot.pj };
    return writes.track(() => saveRow(id, null, snapshot.contenu, snapshot.nomFichierPDF, snapshot.headerFooter, snapshot.margins, cached.typeModele, email, snapshot.suiviModifications || {}, null, { force: true, genre: 'restauration' }));
  }

  return {
    loadAll, getCached, byId, openableById, getCurrentId, setCurrentId, onCreated, isCurrent, getDefaultId, isDefault, canBeDocumentDefault, setDefault, save, saveContent: saveContentTracked, ensureToken, remove, snapshotRow, restoreRow, restoreVersion, sameName, uniqueName, setLinkedEmail, saveNotice,
    isOpenableType, isKnownType, declareExtensionType, unavailableOf, unavailableText,
    getWriteSeq: writes.seq, isWriting: writes.isWriting, whenIdle: writes.whenIdle, lastWritten: writes.lastWritten,
    sameDateModif, verifyStored, getLoadedChars, getLoadWeights, templateFromRecord, hasLoaded, TABLE_NAME, getDocumentSettings, getDocumentSetting, updateDocumentSettings, readPdfPassword, writePdfPassword,
    get PDF_PASSWORD_LOCATION() { return pdfPasswordLocation(); },
  };
})();