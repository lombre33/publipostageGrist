// Date du dernier export PDF : une colonne de la table du widget garde, ligne par ligne, le moment où le PDF de la ligne a été exporté pour la dernière
// fois (demande du 09/10 : « une option où tu choisis une colonne qui gardera la date du dernier export PDF »).
// Le choix vit dans l'option `dateDernierExport` (le nom de la colonne), même mécanique que js/view-template.js et js/access-rights.js : lue avec le widget,
// partagée par tout le monde seulement une fois la vue enregistrée côté Grist (grist.setOption ne pose qu'un brouillon). Écran : section « Date du dernier
// export PDF » de Réglages > Vue.
// Ce qui s'écrit, et quand :
//  - après un export PDF réussi seulement : le PDF d'une ligne, le lot en ZIP, le PDF unique, la planche (js/main.js:stampExportDate). Ni Word, ni Excel, ni
//    l'email ; ni un export annulé ;
//  - pour chaque ligne dont le PDF est dans le fichier téléchargé, jamais pour une ligne en échec ;
//  - en une seule écriture (BulkUpdateRecord) pour tout le lot, au même instant : celui de la fin de l'export ;
//  - le type de la colonne décide de la valeur : « Date » reçoit le jour (en secondes, à minuit UTC, comme Grist le garde), « Date et heure » l'instant (en
//    secondes), « Texte » le texte « 2026-10-09 14:32 ». Le jour et l'heure sont ceux de l'appareil.
// Grist (mesuré dans un vrai Grist le 09/10, labo-grist-reel/probe-export-date.mjs) refuse l'écriture d'une colonne à formule, d'une colonne inconnue et d'une
// ligne qui n'existe plus, et annule alors le LOT ENTIER. D'où : les colonnes à formule ne sont pas proposées ; le type est relu avant d'écrire
// (GristAPI.refreshColumnTypes, deux petites lectures) ; une ligne supprimée pendant l'export ne fait pas perdre les autres (l'écriture est refaite sur celles
// qui restent). Une colonne « vide » (ajoutée dans Grist, type posé, aucune donnée) devient une colonne de données à la première écriture.
// Un compte Lecteur de Grist n'écrit rien, sans message : il ne peut rien enregistrer.
//   ExportDate.init() -> lit l'option et s'abonne à ses changements (après GristAPI.init)
//   ExportDate.getColumn() -> la colonne choisie (son identifiant) ou null
//   ExportDate.stamp(tableId, rowIds) -> Promise<null | { reason, column }> : écrit la date dans la colonne choisie pour ces lignes. null : écrit, ou rien à écrire
//     (aucune colonne choisie, compte Lecteur, aucune ligne). reason : 'missing' (la colonne n'existe plus), 'unusable' (ni Date, ni Date et heure, ni Texte, ou
//     devenue une colonne à formule), 'failed' (Grist a refusé l'écriture).
//   ExportDate.valueFor(kind, now) -> la valeur que reçoit une colonne de ce genre ('date', 'datetime' ou 'text'), `now` étant une Date
//   ExportDate.wirePanel() -> branche la section de Réglages (redessinée à l'ouverture, puis tant que la fenêtre est ouverte à chaque changement de langue, de droits ou
//     d'option ; grisée en lecture seule)
//   ExportDate.render() -> redessine la section tout de suite, fenêtre ouverte ou non
const ExportDate = (function () {
  const OPTION_KEY = 'dateDernierExport';
  const SELECT_ID = 'settings-exportdate-column';

  let column = null;         // identifiant de la colonne choisie (texte) ou null
  let search = null;         // la liste avec recherche de la section (SearchSelect), absente quand le composant ne s'est pas attaché
  // Ce que cet écran vient d'écrire dans les options : Grist le renvoie par onOptions, parfois après un choix plus récent (même garde que js/view-template.js).
  const expectedEchoes = [];

  const normalize = value => (typeof value === 'string' && value !== '' ? value : null);
  const getColumn = () => column;
  const el = id => document.getElementById(id);
  const isReadOnly = () => typeof AccessRights !== 'undefined' && AccessRights.get().readOnly;

  // Le genre de valeur qu'un type de colonne Grist reçoit ; null pour tout autre type. Un « DateTime » porte son fuseau après les deux-points (DateTime:Europe/Paris).
  function kindOf(type) {
    const base = String(type || '').split(':')[0];
    return base === 'Date' ? 'date' : base === 'DateTime' ? 'datetime' : base === 'Text' ? 'text' : null;
  }

  // Seuls les accesseurs locaux de `now` servent : le jour d'une personne est celui de son appareil, pas celui du méridien de Greenwich.
  const two = n => String(n).padStart(2, '0');
  function valueFor(kind, now) {
    if (kind === 'datetime') return Math.floor(now.getTime() / 1000);
    if (kind === 'date') return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
    return now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate()) + ' ' + two(now.getHours()) + ':' + two(now.getMinutes());
  }

  // Ce que vaut la colonne `colId` de `table` pour cet usage : 'ok', 'missing' (le schéma est connu et ne l'a pas), 'unusable' (autre type, ou à formule), 'unknown'
  // (schéma pas encore lu : on ne sait rien).
  function columnState(table, colId) {
    const type = GristAPI.getColumnType(table, colId);
    if (!type) return GristAPI.getTables().length ? 'missing' : 'unknown';
    return kindOf(type) && !GristAPI.isFormulaColumn(table, colId) ? 'ok' : 'unusable';
  }

  // Les colonnes de `table` qui peuvent recevoir la date, dans l'ordre de la table.
  function candidates(table) {
    return GristAPI.getVisibleColumns(table).filter(col => columnState(table, col) === 'ok');
  }

  async function write(next) {
    const value = normalize(next);
    expectedEchoes.push(JSON.stringify(value));
    if (expectedEchoes.length > 20) expectedEchoes.shift();
    column = value;
    try { await GristAPI.setWidgetOption(OPTION_KEY, value); }
    catch (e) { console.error('[ExportDate] enregistrement de l’option du widget impossible', e); }
    renderPanel(true);
  }

  function init() {
    column = normalize((GristAPI.getWidgetOptions() || {})[OPTION_KEY]);
    GristAPI.onWidgetOptionsChange(options => {
      const incoming = normalize(options && options[OPTION_KEY]);
      const echo = expectedEchoes.indexOf(JSON.stringify(incoming));
      if (echo !== -1) { expectedEchoes.splice(0, echo + 1); return; }
      expectedEchoes.length = 0;
      column = incoming;
      renderPanel();
    });
  }

  // === Écrire la date ===
  async function stamp(tableId, rowIds) {
    const target = column;
    const ids = Array.from(new Set(rowIds || []));
    if (!target || !tableId || !ids.length || GristAPI.isDocumentReadOnly()) return null;
    const problem = reason => ({ reason, column: target });
    // Le type et les formules ont pu changer dans Grist depuis la dernière lecture du schéma (les Réglages, l'ouverture) : deux petites lectures de métadonnées,
    // pas de relecture des tables.
    await GristAPI.refreshColumnTypes().catch(() => {});
    const state = columnState(tableId, target);
    if (state === 'missing' || state === 'unusable') return problem(state);
    if (state !== 'ok') return problem('failed');
    const value = valueFor(kindOf(GristAPI.getColumnType(tableId, target)), new Date());
    const writeRows = rows => grist.docApi.applyUserActions([['BulkUpdateRecord', tableId, rows, { [target]: rows.map(() => value) }]]);
    try {
      await writeRows(ids);
      return null;
    } catch (e) {
      console.error('[ExportDate] écriture refusée, vérification des lignes', e);
    }
    // Une ligne supprimée pendant l'export fait refuser tout le lot : on ne garde que les lignes qui existent encore. Aucune ligne manquante : le refus vient d'ailleurs
    // (règle d'accès, colonne devenue à formule entre-temps), on le dit.
    let present;
    try { present = new Set((await grist.docApi.fetchTable(tableId)).id); }
    catch (e) { console.error('[ExportDate] lignes illisibles', e); return problem('failed'); }
    const kept = ids.filter(id => present.has(id));
    if (kept.length === ids.length) return problem('failed');
    if (!kept.length) return null;
    try { await writeRows(kept); return null; }
    catch (e) { console.error('[ExportDate] écriture refusée sur les lignes restantes', e); return problem('failed'); }
  }

  // === Réglages > Vue > Date du dernier export PDF ===
  // Les colonnes de la liste portent leur genre pour indice : la date, la date et l'heure, ou le texte (une colonne de texte n'a pas d'indice dans
  // js/condition-fields.js, où le texte est le cas courant ; ici il décide de ce qui s'écrit).
  function fillColumns(select, table, choices) {
    select.innerHTML = '';
    select.appendChild(Dom.option('', I18n.t('settings.exportDate.none')));
    choices.forEach(col => {
      ConditionFields.appendColumnOption(select, col, table, col);
      const option = select.lastElementChild;
      if (kindOf(GristAPI.getColumnType(table, col)) === 'text') {
        const hint = I18n.t('settings.exportDate.typeText');
        option.dataset.hint = hint;
        option.textContent = col + ' (' + hint + ')';
      }
    });
    // Colonne choisie qui n'est plus proposée (supprimée, renommée, devenue à formule) : gardée visible plutôt que remplacée en silence par « — Aucune — ».
    if (column && choices.indexOf(column) === -1) select.appendChild(Dom.option(column, column));
    select.value = column || '';
  }

  // L'état sous la liste : { text, problem }, text vide quand il n'y a rien à dire.
  function statusOf(table, choices) {
    if (!column) {
      return table && !choices.length && GristAPI.getTables().length
        ? { text: I18n.t('settings.exportDate.status.noColumns', { table }), problem: false }
        : { text: '', problem: false };
    }
    const state = table ? columnState(table, column) : 'unknown';
    if (state === 'missing' || state === 'unusable') return { text: I18n.t('settings.exportDate.status.' + state, { column }), problem: true };
    if (state === 'unknown') return { text: '', problem: false };
    return { text: I18n.t('settings.exportDate.status.' + kindOf(GristAPI.getColumnType(table, column)), { column }), problem: false };
  }

  // Fermées, les Réglages n'ont rien à redessiner : l'ouverture le fait (`force`). Évite aussi de questionner Grist à chaque changement d'option ou de droits d'un widget
  // dont personne n'ouvre les Réglages.
  const settingsOpen = () => { const modal = el('settings-modal'); return !!modal && modal.style.display !== 'none' && modal.style.display !== ''; };

  function renderPanel(force) {
    const select = el(SELECT_ID);
    if (!select || (force !== true && !settingsOpen())) return;
    const table = GristAPI.getCurrentTableId();
    const choices = table ? candidates(table) : [];
    fillColumns(select, table, choices);
    const locked = isReadOnly();
    select.disabled = locked;
    if (search) search.sync();
    const status = el('settings-exportdate-status');
    if (status) {
      const info = statusOf(table, choices);
      status.textContent = info.text;
      status.hidden = !info.text;
      status.classList.toggle('is-problem', info.problem);
    }
    const lockedHint = el('settings-exportdate-locked');
    if (lockedHint) lockedHint.hidden = !locked;
  }

  function wirePanel() {
    const select = el(SELECT_ID);
    if (!select) return;
    select.addEventListener('change', () => {
      if (isReadOnly()) { renderPanel(true); return; }
      write(select.value);
    });
    // Composant indisponible : la liste native reste, inchangée.
    try { search = SearchSelect.attachColumns(select); }
    catch (e) { console.warn('[ExportDate] recherche indisponible, liste native conservée', e); }
    // Relue à chaque ouverture des Réglages : une colonne a pu être ajoutée, retirée ou renommée dans Grist depuis.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      renderPanel(true);
      GristAPI.refreshSchema().then(() => renderPanel(true)).catch(() => {});
    });
    I18n.onChange(() => renderPanel());
    // Les droits changent aussi Réglages ouverts (onglet Accès, case cochée dans la table des droits, relecture de 10 s) : la liste se grise ou se dégrise sans rouvrir.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(() => renderPanel());
    renderPanel(true);
  }

  return { init, getColumn, stamp, valueFor, wirePanel, render: () => renderPanel(true) };
})();
