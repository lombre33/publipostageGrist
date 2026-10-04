// Module de gestion des modèles : CRUD sur la table Grist Publipostage_Modeles.
const Templates = (function () {
  const TABLE_NAME = 'Publipostage_Modeles';
  let templatesCache = [];
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
    // que si le premier a échoué.
    //
    // Pour l'ouverture, `columns` (les colonnes que la migration garantit, [] pour la table elle-même) inscrit la migration dans `columnMigrations` :
    // loadAll lit la table une seule fois et tient pour faites celles dont toutes les colonnes s'y trouvent, au lieu d'une lecture complète par
    // migration (contenus et images compris). Sans `columns`, une migration n'est jamais tenue pour faite d'avance : elle tourne au premier appel.
    let inFlight = null;
    function ensure() {
      if (!inFlight) {
        migrationRuns++;
        inFlight = worker().then(ok => { if (!ok) inFlight = null; return ok; });
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
    return {
      ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensureTrackChangesColumn,
    };
  }
  const {
    ensureHeaderFooterColumn, ensureMarginsColumn, ensureDateModifColumn, ensureDefaultColumn, ensureEmailColumns, ensureTrackChangesColumn,
  } = defineColumnMigrations();

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

  function safeParseSuiviModifications(json) {
    // Forme par défaut si la colonne est vide ou illisible : {} (aucune suggestion connue) plutôt que null, pour que TrackChanges.computeMetadata
    // (js/track-changes.js) puisse s'en servir directement comme previousMetadata.
    if (!json) return {};
    try {
      const parsed = JSON.parse(json);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      return {};
    }
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
    };
  }

  async function loadAll() {
    // Une seule lecture pour tout vérifier : les migrations dont les colonnes sont déjà là n'ont plus rien à relire (cf. ensureOnce).
    const first = await readTable();
    if (first) columnMigrations.forEach(migration => { if (migration.satisfiedBy(first)) migration.markDone(); });
    const runsBefore = migrationRuns;
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureDefaultColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    await ensureTrackChangesColumn();
    try {
      // Aucune migration n'a tourné (ni écrit une colonne) depuis la lecture initiale : elle est encore la table, inutile de la relire.
      const data = first && migrationRuns === runsBefore ? first : await grist.docApi.fetchTable(TABLE_NAME);
      loadedChars = charsOf(data);
      templatesCache = data.id.map((id, i) => templateFromRow(data, i));
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

  // Un modèle email ou macro n'ouvre jamais le widget tout seul (modèle par défaut, de la vue ou de la ligne) : une action ponctuelle ou un mode
  // spécialisé ne s'affiche que sur demande.
  const canOpenAtStart = typeModele => typeModele !== 'email' && typeModele !== 'macro';

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
    // Un modèle email ou macro n'est jamais le modèle de démarrage (cf. js/main.js, syncDefaultTemplateButton) : une ligne restée marquée
    // EstParDefaut sur l'un d'eux (défaut posé avant cette règle, colonne éditée dans Grist) ne doit pas masquer un modèle document lui aussi marqué,
    // sinon le widget s'ouvrirait sur « Nouveau modèle » et l'étoile n'apparaîtrait sur aucun des deux. Plusieurs modèles document marqués : le
    // premier de la table.
    const found = templatesCache.find(t => t.estParDefaut && canOpenAtStart(t.typeModele));
    return found ? found.id : null;
  }

  const isDefault = id => id != null && sameId(getDefaultId(), id);

  async function setDefault(id) {
    // id = null retire le modèle par défaut sans en redéfinir un autre. Un seul modèle par défaut à la fois : les autres sont explicitement repassés
    // à false, pour ne jamais avoir deux « par défaut » après un enchaînement d'appels.
    await ensureTableExists();
    await ensureDefaultColumn();
    const actions = [];
    templatesCache.forEach(t => {
      if (t.estParDefaut && !sameId(t.id, id)) actions.push(['UpdateRecord', TABLE_NAME, t.id, { EstParDefaut: false }]);
    });
    if (id != null) actions.push(['UpdateRecord', TABLE_NAME, id, { EstParDefaut: true }]);
    if (actions.length) await grist.docApi.applyUserActions(actions);
    templatesCache.forEach(t => { t.estParDefaut = (id != null && sameId(t.id, id)); });
  }

  async function readBackDateModif(rowId, fallback) {
    // Relit le DateModif réellement stocké par Grist pour cette ligne plutôt que de se fier à la chaîne ISO qu'on vient d'envoyer : rien ne garantit
    // que Grist la redonne telle quelle (une colonne DateTime peut être représentée autrement en interne, en nombre par exemple). js/main.js
    // (autosaveTick) compare la valeur renvoyée par save() à une valeur lue plus tard par loadAll() ou fetchTable() : dans deux représentations
    // différentes, la comparaison stricte voit un faux conflit dès le tick suivant, même seul sur le document. Passer par la même lecture des deux
    // côtés l'évite, quelle que soit la représentation. Défensif : un échec ici (colonne absente, ligne introuvable, requête en échec) ne doit pas
    // faire échouer un enregistrement réussi par ailleurs ; on retombe sur la chaîne ISO d'origine.
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      const idx = data.id.indexOf(rowId);
      if (idx === -1 || !data.DateModif) {
        console.error('Relecture DateModif après enregistrement : ligne ou colonne introuvable, valeur locale conservée');
        return fallback;
      }
      return data.DateModif[idx];
    } catch (e) {
      console.error('Erreur relecture DateModif après enregistrement', e);
      return fallback;
    }
  }

  async function saveRow(id, nom, contenuHtml, nomFichierPDF, headerFooterData, marginsData, typeModele = 'document', emailFields = null, suiviModifications = null) {
    // Rend { id, dateModif } (pas seulement l'id) : js/main.js (auto-save) doit connaître le DateModif qu'il vient d'écrire pour le distinguer d'un
    // DateModif constaté plus tard, preuve qu'une autre personne a enregistré ce modèle entre-temps. dateModif vient d'une relecture de Grist
    // (readBackDateModif), pas de la chaîne ISO envoyée. `typeModele` et `emailFields` (mode email, cf. ensureEmailColumns) sont facultatifs : les
    // appels du mode document ne changent pas. emailFields = { destinataires, cc, cci, objet }, ignoré (colonnes laissées vides) pour un modèle
    // document. `suiviModifications` : { [id]: { author, createdAt } } (TrackChanges.computeMetadata, js/track-changes.js), écrite dans le même
    // UpdateRecord/AddRecord que Contenu, jamais dans un appel séparé (planning/feature-track-changes.md : la fenêtre de risque en cas de conflit
    // d'auto-save). null pour un macro-modèle (Editor.getSuiviModificationsForSave n'est jamais appelée sur ce chemin, cf. onSave dans js/main.js).
    await ensureTableExists();
    await ensureHeaderFooterColumn();
    await ensureMarginsColumn();
    await ensureDateModifColumn();
    await ensureEmailColumns();
    await ensureTrackChangesColumn();
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
    if (id) {
      await grist.docApi.applyUserActions([
        ['UpdateRecord', TABLE_NAME, id, columns]
      ]);
      // Le cache garde le nom que la ligne vient de recevoir : js/main.js (settleTemplateName) y compare le nom tapé, et uniqueName y cherche les
      // noms pris.
      const cached = byId(id);
      if (cached) cached.nom = nom;
      const dateModif = await readBackDateModif(id, now);
      writes.remember(id, dateModif);
      return { id, dateModif };
    } else {
      const seqAtStart = currentIdSeq;
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, columns]
      ]);
      const newId = result.retValues[0];
      // Le modèle neuf devient le modèle courant, sauf si un autre a été chargé pendant l'écriture (Grist lent : des secondes) : c'est celui-là qui
      // est à l'écran, et l'enregistrement automatique y écrirait ensuite, sous l'identifiant du modèle neuf, ce que l'écran montre.
      if (currentIdSeq === seqAtStart) currentTemplateId = newId;
      const dateModif = await readBackDateModif(newId, now);
      writes.remember(newId, dateModif);
      return { id: newId, dateModif };
    }
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
  }

  return {
    loadAll, getCached, byId, getCurrentId, setCurrentId, isCurrent, getDefaultId, isDefault, canOpenAtStart, setDefault, save, remove, sameName, uniqueName,
    getWriteSeq: writes.seq, isWriting: writes.isWriting, whenIdle: writes.whenIdle, lastWritten: writes.lastWritten,
    sameDateModif, getLoadedChars, TABLE_NAME,
  };
})();