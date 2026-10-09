// Droits par personne : lecture seule, export autorisé, commentaires autorisés, lus dans une table Grist choisie dans Réglages > Accès - une ligne
// par personne, repérée par son email Grist (GristAPI.getCurrentUserEmail), une colonne Booléen par droit, chacune facultative. Le widget ne crée
// jamais cette table : elle appartient au document, et peut servir en même temps aux règles d'accès de Grist.
//
// Le réglage vit dans les options du widget (grist.setOption, clé OPTION_KEY) : partagé par tous ceux qui ouvrent cette vue, mais seulement une fois
// enregistré côté Grist - setOption ne pose qu'un brouillon de la section, que Grist propose d'enregistrer par un bouton en haut du widget (voir
// ViewSectionRec.activeCustomOptions et ViewSectionMenu.ts doSave dans grist-core).
//
// Ce n'est qu'un verrou d'interface (js/main.js:applyAccessRights grise, jamais ne retire) : seules les règles d'accès de Grist protègent les
// données.
//
// Table des droits supprimée ou renommée dans Grist : tout le monde reste en lecture seule par précaution (état « error »), mais l'onglet Réglages >
// Accès, lui, reste modifiable pour en choisir une autre - sans cela, la personne qui a réglé l'Accès n'aurait aucun moyen de se débloquer depuis le
// widget. Une table seulement cachée par une règle d'accès de Grist ne déverrouille rien (état « error » sans `tableGone`).
//
// Compte Lecteur de Grist (Grist ouvre le document en lecture seule pour lui : `readonly=true` dans l'adresse du cadre, GristAPI.isDocumentReadOnly) :
// lecture seule d'office, export gardé, sans commentaires - il ne peut rien écrire. Il n'est pas identifié (la sonde de GristAPI.getCurrentUserEmail
// écrit une ligne, que Grist refuse à un Lecteur) : la table des droits n'est pas lue pour lui, sa ligne éventuelle ne compte pas, et l'export ne se règle
// pas pour lui. C'est connu dès l'adresse du cadre : aucune attente (état « viewer », jamais « pending »), et rien de ce qui est réglé dans l'onglet ne
// le change.
//
// Case « Ouvrir les personnes en lecture seule sur la Lecture épurée » : clé cleanReading du même réglage, décochée au départ, grisée tant qu'aucune
// colonne « Lecture seule » n'est choisie (sans elle, personne n'est en lecture seule). js/main.js la lit à la première réponse des droits
// (CleanReading.openForReadOnly) : la personne dont la ligne dit « lecture seule » ouvre alors le widget sur le document seul, sans barre d'outils.
const AccessRights = (function () {
  const OPTION_KEY = 'droitsAcces';
  // Relecture périodique, seulement quand un réglage existe : une case cochée dans la table pendant que la personne a le widget ouvert s'applique
  // sans recharger. Aucun abonnement possible à une autre table que celle de la vue (grist.onRecords ne couvre que la section liée).
  const REFRESH_INTERVAL_MS = 10000;
  // La table est relue en entier : plus elle est grosse, plus la relecture attend - une milliseconde par case de la dernière lecture (50 000
  // lignes de quatre colonnes, id compris : 200 000 cases, 3 minutes), sans dépasser REFRESH_MAX_INTERVAL_MS. Une table de droits ordinaire, une
  // ligne par personne, reste à 10 s.
  const REFRESH_MAX_INTERVAL_MS = 180000;
  const REFRESH_MS_PER_CELL = 1;
  const FULL_RIGHTS = Object.freeze({ readOnly: false, canExport: true, canComment: true });
  // Table réglée mais illisible pour cette personne (règle d'accès Grist qui la lui cache, le plus souvent) : on ne sait pas si elle y figure.
  // Verrouillé par précaution plutôt que tous les droits - le propriétaire du document, qui lit toujours la table, n'est jamais concerné.
  const LOCKED_RIGHTS = Object.freeze({ readOnly: true, canExport: false, canComment: false });
  // Compte Lecteur de Grist : l'export reste (il ne modifie rien, et la lecture seule d'un Lecteur doit pouvoir exporter), les commentaires non (ils
  // s'écrivent dans le document).
  const VIEWER_RIGHTS = Object.freeze({ readOnly: true, canExport: true, canComment: false });
  const VIEWER_STATUS = Object.freeze({ state: 'viewer' });

  let config = null;
  let rights = FULL_RIGHTS;
  // Tant que le tout premier calcul n'est pas fini (réglage présent au démarrage) : les gardes de js/main.js lisent get() et bloquent toute écriture.
  let pending = false;
  let status = { state: 'off' };
  // L'identification (GristAPI.getCurrentUserEmail) écrit une ligne dans une table interne : un lecteur Grist ne le peut pas. Un seul essai par
  // session, pas un toutes les REFRESH_INTERVAL_MS.
  let emailLookupFailed = false;
  let refreshTimer = null;
  // Cases de la table des droits à la dernière lecture : elles règlent l'attente de la suivante (refreshDelayMs).
  let lastReadCells = 0;
  let computeGeneration = 0;
  const listeners = [];

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const clean = v => (typeof v === 'string' ? v.trim() : '');
    const next = {
      source: 'personne',
      table: clean(raw.table),
      emailColumn: clean(raw.emailColumn),
      readOnlyColumn: clean(raw.readOnlyColumn),
      exportColumn: clean(raw.exportColumn),
      commentsColumn: clean(raw.commentsColumn),
      cleanReading: raw.cleanReading === true,
    };
    if (!next.table || !next.emailColumn) return null;
    if (!next.readOnlyColumn && !next.exportColumn && !next.commentsColumn) return null;
    return next;
  }

  function configFromOptions(options) {
    return normalizeConfig(options && options[OPTION_KEY]);
  }

  function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  function sameRights(a, b) {
    return a.readOnly === b.readOnly && a.canExport === b.canExport && a.canComment === b.canComment;
  }

  // Lu à neuf à chaque fois (l'adresse du cadre ne change pas en vrai, mais les tests la changent en cours de route).
  function isViewer() { return GristAPI.isDocumentReadOnly(); }
  // Ce que la personne a sans réglage de la table des droits : tous les droits, ou ceux d'un Lecteur.
  function baseRights() { return isViewer() ? VIEWER_RIGHTS : FULL_RIGHTS; }
  function baseStatus() { return isViewer() ? VIEWER_STATUS : { state: 'off' }; }

  function get() { return pending ? LOCKED_RIGHTS : rights; }
  function getStatus() { return status; }
  function getConfig() { return config; }
  function onChange(cb) { listeners.push(cb); }

  function notify() {
    listeners.forEach(cb => { try { cb(get()); } catch (e) { console.error('[AccessRights] un abonné a levé une exception', e); } });
  }

  // La table des droits a-t-elle disparu du document (supprimée ou renommée), au lieu d'être seulement illisible ou cachée à cette personne ? Le test
  // est celui de js/settings-columns.js (liste des tables, puis lignes blanchies de _grist_Tables) ; sans lui, ou dans le doute : non.
  async function tableIsGone(table) {
    try { return typeof SettingsColumns !== 'undefined' && (await SettingsColumns.tableGone(table)) === true; }
    catch (e) { return false; }
  }

  async function compute(cfg) {
    // Un Lecteur n'est pas identifié, réglage ou pas : ni sonde, ni lecture de la table.
    if (isViewer()) return { rights: VIEWER_RIGHTS, status: VIEWER_STATUS };
    if (!cfg) return { rights: FULL_RIGHTS, status: { state: 'off' } };
    let email = null;
    if (!emailLookupFailed) {
      try { email = await GristAPI.getCurrentUserEmail(); }
      catch (e) { emailLookupFailed = true; console.warn('[AccessRights] email Grist introuvable, tous les droits', e); }
    }
    if (!email) return { rights: FULL_RIGHTS, status: { state: 'noEmail' } };
    let rows;
    try { rows = await GristAPI.fetchTableRows(cfg.table); }
    catch (e) {
      lastReadCells = 0;
      console.warn('[AccessRights] table des droits illisible : ' + cfg.table, e);
      // `tableGone` seulement quand c'est vrai : les autres états « error » gardent leur forme d'avant.
      const gone = await tableIsGone(cfg.table);
      return { rights: LOCKED_RIGHTS, status: gone ? { state: 'error', email, tableGone: true } : { state: 'error', email } };
    }
    lastReadCells = rows.length * (rows.length ? Object.keys(rows[0]).length : 0);
    const wanted = normalizeEmail(email);
    const row = rows.find(r => normalizeEmail(r[cfg.emailColumn]) === wanted);
    if (!row) return { rights: FULL_RIGHTS, status: { state: 'notFound', email } };
    // Une colonne réglée puis supprimée de la table ne compte plus (même effet que « — Aucune — ») : sinon une colonne disparue interdirait l'export
    // à tous.
    const flag = (col, whenUnset) => ((col && Object.prototype.hasOwnProperty.call(row, col)) ? row[col] === true : whenUnset);
    return {
      rights: { readOnly: flag(cfg.readOnlyColumn, false), canExport: flag(cfg.exportColumn, true), canComment: flag(cfg.commentsColumn, true) },
      status: { state: 'found', email },
    };
  }

  async function refresh() {
    const generation = ++computeGeneration;
    const result = await compute(config);
    if (generation !== computeGeneration) return; // un réglage plus récent a relancé le calcul entre-temps
    // Quelle que soit la cause de cette lecture (minuterie, nouveau réglage), l'attente de la suivante repart d'ici, d'après ce qu'elle a lu.
    if (refreshTimer) scheduleRefresh();
    const before = get();
    const statusChanged = JSON.stringify(result.status) !== JSON.stringify(status);
    rights = result.rights;
    status = result.status;
    pending = false;
    if (!sameRights(before, get()) || statusChanged) notify();
    // Un changement d'état arrivé tout seul (relecture de 10 s : la table des droits supprimée, ou revenue) alors que l'onglet est ouvert : il le
    // montre sans qu'on le rouvre.
    if (statusChanged) renderSettingsPanel();
  }

  function refreshDelayMs() {
    return Math.min(REFRESH_MAX_INTERVAL_MS, Math.max(REFRESH_INTERVAL_MS, lastReadCells * REFRESH_MS_PER_CELL));
  }

  // La relecture suivante est prévue au départ de chaque tour, pas à son retour : une lecture qui ne revient jamais n'arrête pas la boucle
  // (refresh la replace, d'après ce qu'elle vient de lire, quand elle revient).
  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      scheduleRefresh();
      refresh().catch(e => console.error('[AccessRights] relecture des droits impossible', e));
    }, refreshDelayMs());
  }

  function startTimer() {
    if (!refreshTimer) scheduleRefresh();
  }

  function stopTimer() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  // Les droits en vigueur restent appliqués pendant le calcul qui suit un changement de réglage (pas de passage par l'état verrouillé) : sinon chaque
  // choix dans l'onglet Accès ferait basculer l'interface en lecture puis la rendrait.
  function setConfig(nextConfig) {
    if (JSON.stringify(nextConfig) === JSON.stringify(config)) return Promise.resolve();
    config = nextConfig;
    // Sans réglage, ou pour un Lecteur (la table n'est pas lue pour lui, mais le réglage reste connu : la case de la Lecture épurée s'y lit) : l'état de
    // départ, sans relecture périodique.
    if (!config || isViewer()) {
      ++computeGeneration;
      stopTimer();
      const before = get();
      rights = baseRights();
      status = baseStatus();
      pending = false;
      if (!sameRights(before, get())) notify();
      renderSettingsPanel();
      return Promise.resolve();
    }
    startTimer();
    status = { state: 'pending' };
    renderSettingsPanel();
    return refresh().then(renderSettingsPanel);
  }

  // Appelé par js/main.js juste après GristAPI.init() (les options du widget sont alors connues). Sans réglage : résolu tout de suite, sans le
  // moindre appel à Grist - en particulier aucune écriture dans la table interne d'identification pour qui n'a jamais réglé cet onglet.
  function init() {
    GristAPI.onWidgetOptionsChange(options => {
      setConfig(configFromOptions(options)).catch(e => console.error('[AccessRights] calcul des droits impossible', e));
    });
    wireSettingsPanel();
    // Un Lecteur est connu dès l'adresse du cadre : ses droits sont posés avant tout, même sans réglage (setConfig ne fait rien quand il n'y en a pas).
    if (isViewer()) { rights = VIEWER_RIGHTS; status = VIEWER_STATUS; }
    const initial = configFromOptions(GristAPI.getWidgetOptions());
    if (initial && !isViewer()) pending = true;
    return setConfig(initial).catch(e => {
      console.error('[AccessRights] calcul des droits impossible', e);
      pending = false;
    });
  }

  const ids = {
    table: 'settings-access-table',
    email: 'settings-access-email',
    readOnly: 'settings-access-readonly',
    exportCol: 'settings-access-export',
    comments: 'settings-access-comments',
  };
  // La case n'est pas dans `ids` : celui-ci ne contient que les listes, que wireSettingsPanel habille de la recherche.
  const CLEAN_ID = 'settings-access-clean-reading';
  // Réglage en cours d'édition dans l'onglet - distinct de `config` (normalisé, donc null tant qu'aucune case n'est choisie) : sans lui, choisir la
  // table puis la colonne email effacerait le choix de table au rendu suivant, faute de colonne de droit déjà choisie.
  let draft = null;
  // Listes avec recherche des choix de l'onglet (la table, puis l'email et les trois droits), comme partout ailleurs dans l'interface. Chaque
  // <select> est rempli à nouveau à chaque rendu : le champ visible le relit ensuite (`sync`).
  const searches = [];

  function el(id) { return document.getElementById(id); }

  // `columnsOf` : la table dont `values` sont les colonnes, pour que leur libellé Grist se cherche aussi (rien pour la liste des tables).
  function fillSelect(select, values, current, noneLabel, columnsOf) {
    if (!select) return;
    select.innerHTML = '';
    if (noneLabel !== null) {
      const none = document.createElement('option');
      none.value = '';
      none.textContent = noneLabel;
      select.appendChild(none);
    }
    const list = values.slice();
    // Colonne réglée qui n'existe plus : gardée visible plutôt que remplacée en silence par « — Aucune — ».
    if (current && list.indexOf(current) === -1) list.push(current);
    list.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (columnsOf) opt.dataset.search = Variables.columnSearchText(columnsOf, v);
      select.appendChild(opt);
    });
    select.value = current || '';
  }

  function columnsOfType(table, types) {
    return GristAPI.getColumns(table).filter(col => types.indexOf(GristAPI.getColumnType(table, col)) !== -1);
  }

  function rightsSummary(r) {
    return [
      I18n.t(r.readOnly ? 'settings.access.right.readOnly' : 'settings.access.right.edit'),
      I18n.t(r.canExport ? 'settings.access.right.export' : 'settings.access.right.noExport'),
      I18n.t(r.canComment ? 'settings.access.right.comments' : 'settings.access.right.noComments'),
    ].join(', ');
  }

  function statusText() {
    switch (status.state) {
      case 'pending': return I18n.t('settings.access.status.pending');
      case 'found': return I18n.t('settings.access.status.found', { email: status.email, rights: rightsSummary(rights) });
      case 'notFound': return I18n.t('settings.access.status.notFound', { email: status.email });
      case 'noEmail': return I18n.t('settings.access.status.noEmail');
      case 'viewer': return I18n.t('settings.access.status.viewer', { rights: rightsSummary(rights) });
      case 'error': return I18n.t(status.tableGone ? 'settings.access.status.tableGone' : 'settings.access.status.error');
      default: return '';
    }
  }

  function renderSettingsPanel() {
    const tableSelect = el(ids.table);
    if (!tableSelect) return;
    const current = draft || config || {};
    const none = I18n.t('settings.access.none');
    fillSelect(tableSelect, GristAPI.getTables(), current.table, none);
    const table = tableSelect.value;
    // Types proposés pour l'email : ceux qui livrent du texte brut par fetchTable (une Référence y arrive en id de ligne, jamais en email).
    fillSelect(el(ids.email), table ? columnsOfType(table, ['Text', 'Choice', 'Any']) : [], current.emailColumn, none, table);
    const bools = table ? columnsOfType(table, ['Bool']) : [];
    fillSelect(el(ids.readOnly), bools, current.readOnlyColumn, none, table);
    fillSelect(el(ids.exportCol), bools, current.exportColumn, none, table);
    fillSelect(el(ids.comments), bools, current.commentsColumn, none, table);
    // Verrouillé pour qui est lui-même en lecture seule : sinon l'onglet suffirait à se déverrouiller. Sauf quand la table des droits n'existe plus
    // (`tableGone`) : tout le monde est alors en lecture seule par précaution, y compris qui l'a réglée, et rien d'autre ne permettrait d'en choisir
    // une autre. Les droits restent en lecture seule jusqu'à ce qu'une table soit rechoisie.
    // Un Lecteur de Grist ne peut rien enregistrer : verrouillé pour lui aussi, réglage ou non.
    const locked = get().readOnly && (!!config || status.state === 'viewer') && !status.tableGone;
    Object.keys(ids).forEach(k => { const s = el(ids[k]); if (s) s.disabled = locked; });
    // La case reste là, grisée, tant qu'aucune colonne « Lecture seule » n'est choisie (rien ne disparaît, on grise) ; verrouillée aussi pour qui est
    // lui-même en lecture seule.
    const cleanBox = el(CLEAN_ID);
    if (cleanBox) {
      cleanBox.checked = !!current.cleanReading;
      cleanBox.disabled = locked || !current.readOnlyColumn;
    }
    searches.forEach(search => search.sync());
    const lockedHint = el('settings-access-locked');
    if (lockedHint) lockedHint.hidden = !locked;
    const statusEl = el('settings-access-status');
    if (statusEl) {
      const text = statusText();
      statusEl.textContent = text;
      statusEl.hidden = !text;
    }
  }

  function readDraftFromPanel() {
    const valueOf = id => (el(id) ? el(id).value : '');
    return {
      table: valueOf(ids.table),
      emailColumn: valueOf(ids.email),
      readOnlyColumn: valueOf(ids.readOnly),
      exportColumn: valueOf(ids.exportCol),
      commentsColumn: valueOf(ids.comments),
      cleanReading: !!(el(CLEAN_ID) && el(CLEAN_ID).checked),
    };
  }

  async function onPanelChange(changedId) {
    const next = readDraftFromPanel();
    if (changedId === ids.table) {
      // Nouvelle table : ses colonnes n'ont rien à voir avec celles de la précédente. L'email est pré-choisi quand une seule colonne s'appelle ainsi.
      next.readOnlyColumn = ''; next.exportColumn = ''; next.commentsColumn = '';
      const emails = next.table ? columnsOfType(next.table, ['Text', 'Choice', 'Any']).filter(c => /e-?mail/i.test(c)) : [];
      next.emailColumn = emails.length === 1 ? emails[0] : '';
    }
    // Sans colonne « Lecture seule » (colonne retirée, ou autre table), la case n'a plus de sens : elle se décoche en même temps qu'elle se grise.
    if (!next.readOnlyColumn) next.cleanReading = false;
    draft = next;
    renderSettingsPanel();
    const normalized = normalizeConfig(next);
    try {
      // Brouillon incomplet (table sans colonne de droit) : l'option est retirée, pas enregistrée à moitié.
      await GristAPI.setWidgetOption(OPTION_KEY, normalized);
    } catch (e) {
      console.error('[AccessRights] enregistrement de l’option du widget impossible', e);
    }
    await setConfig(normalized);
    renderSettingsPanel();
  }

  function wireSettingsPanel() {
    Object.keys(ids).forEach(k => {
      const select = el(ids[k]);
      if (!select) return;
      select.addEventListener('change', () => { onPanelChange(ids[k]); });
      // Composant indisponible : la liste native reste, inchangée.
      try { searches.push(k === 'table' ? SearchSelect.attachTables(select) : SearchSelect.attachColumns(select)); }
      catch (e) { console.warn('[AccessRights] recherche indisponible, liste native conservée', e); }
    });
    const cleanBox = el(CLEAN_ID);
    if (cleanBox) cleanBox.addEventListener('change', () => { onPanelChange(CLEAN_ID); });
    // Rempli à chaque ouverture des Réglages (schéma relu : une table ou une colonne a pu être ajoutée depuis), jamais seulement au démarrage.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      draft = null;
      renderSettingsPanel();
      GristAPI.refreshSchema().then(renderSettingsPanel).catch(() => {});
    });
    I18n.onChange(renderSettingsPanel);
  }

  return { init, get, getStatus, getConfig, onChange, refresh };
})();
