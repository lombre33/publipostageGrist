// Droits par personne (demande d'Antoine du 2026-09-28) : lecture seule, export autorisé, commentaires autorisés, lus dans une table Grist choisie dans
// Réglages > Accès - une ligne par personne, repérée par son email Grist (GristAPI.getCurrentUserEmail), une colonne Booléen par droit, chacune facultative.
// Le widget ne crée jamais cette table : elle appartient au document, et peut servir en même temps aux règles d'accès de Grist.
//
// Le réglage vit dans les options du widget (grist.setOption, clé OPTION_KEY) : partagé par tous ceux qui ouvrent CETTE vue, mais seulement une fois
// enregistré côté Grist - setOption ne pose qu'un brouillon de la section, que Grist propose d'enregistrer par un bouton en haut du widget (vérifié à la
// source grist-core, ViewSectionRec.activeCustomOptions / ViewSectionMenu.ts doSave).
//
// Ce n'est qu'un verrou d'interface (js/main.js:applyAccessRights grise, jamais ne retire) : seules les règles d'accès de Grist protègent les données.
const AccessRights = (function () {
  const OPTION_KEY = 'droitsAcces';
  // Relecture périodique, seulement quand un réglage existe : une case cochée dans la table pendant que la personne a le widget ouvert s'applique sans
  // recharger. Aucun abonnement possible à une autre table que celle de la vue (grist.onRecords ne couvre que la section liée).
  const REFRESH_INTERVAL_MS = 10000;
  const FULL_RIGHTS = Object.freeze({ readOnly: false, canExport: true, canComment: true });
  // Table réglée mais illisible pour cette personne (règle d'accès Grist qui la lui cache, le plus souvent) : on ne sait pas si elle y figure. Verrouillé
  // par précaution plutôt que tous les droits - le propriétaire du document, qui lit toujours la table, n'est jamais concerné.
  const LOCKED_RIGHTS = Object.freeze({ readOnly: true, canExport: false, canComment: false });

  let config = null;
  let rights = FULL_RIGHTS;
  // Tant que le tout premier calcul n'est pas fini (réglage présent au démarrage) : les gardes de js/main.js lisent get() et bloquent toute écriture.
  let pending = false;
  let status = { state: 'off' };
  // L'identification (GristAPI.getCurrentUserEmail) écrit une ligne dans une table interne : un lecteur Grist ne le peut pas. Un seul essai par session,
  // pas un toutes les REFRESH_INTERVAL_MS.
  let emailLookupFailed = false;
  let refreshTimer = null;
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

  function get() { return pending ? LOCKED_RIGHTS : rights; }
  function getStatus() { return status; }
  function getConfig() { return config; }
  function onChange(cb) { listeners.push(cb); }

  function notify() {
    listeners.forEach(cb => { try { cb(get()); } catch (e) { console.error('[AccessRights] un abonné a levé une exception', e); } });
  }

  async function compute(cfg) {
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
      console.warn('[AccessRights] table des droits illisible : ' + cfg.table, e);
      return { rights: LOCKED_RIGHTS, status: { state: 'error', email } };
    }
    const wanted = normalizeEmail(email);
    const row = rows.find(r => normalizeEmail(r[cfg.emailColumn]) === wanted);
    if (!row) return { rights: FULL_RIGHTS, status: { state: 'notFound', email } };
    // Une colonne réglée puis supprimée de la table ne compte plus (même effet que « — Aucune — ») : sinon une colonne disparue interdirait l'export à tous.
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
    const before = get();
    const statusChanged = JSON.stringify(result.status) !== JSON.stringify(status);
    rights = result.rights;
    status = result.status;
    pending = false;
    if (!sameRights(before, get()) || statusChanged) notify();
  }

  function startTimer() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => { refresh().catch(e => console.error('[AccessRights] relecture des droits impossible', e)); }, REFRESH_INTERVAL_MS);
  }

  function stopTimer() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  // Les droits en vigueur restent appliqués pendant le calcul qui suit un changement de réglage (pas de passage par l'état verrouillé) : sinon chaque choix
  // dans l'onglet Accès ferait basculer l'interface en lecture puis la rendrait.
  function setConfig(nextConfig) {
    if (JSON.stringify(nextConfig) === JSON.stringify(config)) return Promise.resolve();
    config = nextConfig;
    if (!config) {
      ++computeGeneration;
      stopTimer();
      const before = get();
      rights = FULL_RIGHTS;
      status = { state: 'off' };
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

  // Appelé par js/main.js juste après GristAPI.init() (les options du widget sont alors connues). Sans réglage : résolu tout de suite, sans le moindre
  // appel à Grist - en particulier aucune écriture dans la table interne d'identification pour qui n'a jamais réglé cet onglet.
  function init() {
    GristAPI.onWidgetOptionsChange(options => {
      setConfig(configFromOptions(options)).catch(e => console.error('[AccessRights] calcul des droits impossible', e));
    });
    wireSettingsPanel();
    const initial = configFromOptions(GristAPI.getWidgetOptions());
    if (initial) pending = true;
    return setConfig(initial).catch(e => {
      console.error('[AccessRights] calcul des droits impossible', e);
      pending = false;
    });
  }

  // === Onglet Réglages > Accès ===
  const ids = {
    table: 'settings-access-table',
    email: 'settings-access-email',
    readOnly: 'settings-access-readonly',
    exportCol: 'settings-access-export',
    comments: 'settings-access-comments',
  };
  // Réglage en cours d'édition dans l'onglet - distinct de `config` (normalisé, donc null tant qu'aucune case n'est choisie) : sans lui, choisir la table
  // puis la colonne email effacerait le choix de table au rendu suivant, faute de colonne de droit déjà choisie.
  let draft = null;
  // Listes avec recherche des choix de COLONNE de l'onglet (email et les trois droits), comme partout ailleurs dans l'interface ; la liste des tables reste
  // native. Chaque <select> est rempli à nouveau à chaque rendu : le champ visible le relit ensuite (`sync`).
  const columnSearches = [];

  function el(id) { return document.getElementById(id); }

  function fillSelect(select, values, current, noneLabel) {
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
      case 'error': return I18n.t('settings.access.status.error');
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
    fillSelect(el(ids.email), table ? columnsOfType(table, ['Text', 'Choice', 'Any']) : [], current.emailColumn, none);
    const bools = table ? columnsOfType(table, ['Bool']) : [];
    fillSelect(el(ids.readOnly), bools, current.readOnlyColumn, none);
    fillSelect(el(ids.exportCol), bools, current.exportColumn, none);
    fillSelect(el(ids.comments), bools, current.commentsColumn, none);
    // Verrouillé pour qui est lui-même en lecture seule : sinon l'onglet suffirait à se déverrouiller.
    const locked = get().readOnly && !!config;
    Object.keys(ids).forEach(k => { const s = el(ids[k]); if (s) s.disabled = locked; });
    columnSearches.forEach(search => search.sync());
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
    return {
      table: el(ids.table) ? el(ids.table).value : '',
      emailColumn: el(ids.email) ? el(ids.email).value : '',
      readOnlyColumn: el(ids.readOnly) ? el(ids.readOnly).value : '',
      exportColumn: el(ids.exportCol) ? el(ids.exportCol).value : '',
      commentsColumn: el(ids.comments) ? el(ids.comments).value : '',
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
      if (k === 'table') return;
      // Composant indisponible : la liste native reste, inchangée.
      try { columnSearches.push(SearchSelect.attachColumns(select)); } catch (e) { console.warn('[AccessRights] recherche de colonne indisponible, liste native conservée', e); }
    });
    // Rempli à chaque ouverture des Réglages (schéma relu : une table ou une colonne a pu être ajoutée depuis), jamais seulement au démarrage.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      draft = null;
      renderSettingsPanel();
      GristAPI.refreshSchema().then(renderSettingsPanel).catch(() => {});
    });
    I18n.onChange(renderSettingsPanel);
  }

  return { OPTION_KEY, init, get, getStatus, getConfig, onChange, refresh, normalizeConfig };
})();
