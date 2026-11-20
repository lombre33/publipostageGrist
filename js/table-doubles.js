// Deux tables pour les mêmes données : un document peut porter une table du widget sous son ancien nom français ET sous son nom anglais (« Publipostage_Modeles » et
// « Publipostage_Templates », « Publipostage_PreferencesModeles » et « Publipostage_TemplatePreferences »...). Cela arrive quand une copie plus ancienne du widget (ou de son
// hôte) travaille dans le même document qu'une copie récente : l'ancienne ne voit plus ses tables, renommées, et en recrée de vides sous les anciens noms. Le widget lit alors
// l'une (l'anglaise, js/schema-columns.js:actualTable) et Grist Factory Suite l'autre (l'ancienne, consigne 080) : chacun montre un rangement différent du même document.
//
// Ce module détecte ces paires, RÉUNIT leurs lignes dans la table que le widget lit, sans rien écraser de ce qu'elle porte, et, seulement quand la réunion est complète et que la
// personne le confirme, supprime l'ancienne (RemoveTable). Les écritures de ce fichier sont bornées par le registre des noms (SchemaColumns.TABLES) : un nom qui n'y figure pas n'est jamais
// écrit ni supprimé (`assertRegistered`), donc jamais une table de la personne.
//
// Chaque ligne est reconnue par une clé naturelle propre à sa table (SPECS) : la réunion peut donc être rejouée, elle ne double rien. Ce qui existe déjà dans la table en service y reste
// tel quel ; une ligne n'y est complétée que pour les champs qu'elle y laisse vides (dossier, épingle, réglages d'export du rangement). Les numéros de ligne des modèles ne sont pas les
// mêmes d'une table à l'autre : les lignes du rangement et des commentaires qui en citent un sont réécrites avec le numéro que le modèle a dans la table en service.
//
//   TableDoubles.detect() -> Promise<[{ table, kept, extra }]>   (table : nom anglais du registre ; kept : celle que le widget lit ; extra : l'autre)
//   TableDoubles.merge(pairs) -> Promise<[résumé]>                résumé : { table, kept, extra, extraRows, added, filled, matched, conflicts, dropped, columnsAdded, pending }
//   TableDoubles.verify(pairs) -> Promise<[résumé]>               la même passe sans rien écrire : `pending` dit ce qui resterait à reprendre
//   TableDoubles.removeExtra(pair) -> Promise<void>               supprime l'ancienne table ; refuse si la réunion n'est pas complète
//   TableDoubles.checkAfterOpen(hooks) -> Promise<{ pairs, action }>   la question posée à l'ouverture (js/main.js)
const TableDoubles = (function () {
  const SEP = '\u0000';
  const BATCH = 25; // lignes ajoutées par appel : une table lourde (le contenu des modèles) ne part pas en un seul envoi

  const real = () => grist.docApi;
  const blank = value => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  // Une valeur qui dit quelque chose : faux et zéro sont ce que Grist rend pour une cellule jamais remplie, ils ne justifient pas d'ajouter une colonne.
  const meaningful = value => !blank(value) && value !== false && value !== 0;
  const registryTables = () => SchemaColumns.TABLES.filter(table => table.legacyId !== table.id);
  const registryNames = () => new Set(registryTables().flatMap(table => [table.id, table.legacyId]));

  // Une écriture ne vise qu'un nom du registre : ce fichier ne peut ni écrire ni supprimer une table de la personne.
  function assertRegistered(name) {
    if (!registryNames().has(name)) throw new Error('[TableDoubles] table hors registre : ' + name);
  }

  // --- Ce que dit chaque table : la clé d'une ligne, ce qu'on y complète ---------------------------------------------------------------------------------------------------------
  // `key(row, mapId)` : la clé naturelle d'une ligne (null : la ligne ne peut pas être reprise) ; `mapId(id)` donne le numéro de modèle qu'a ce modèle dans la table en service (null : il n'y est pas).
  function templateKey(row) {
    if (row.TemplateType === 'reglages') return 'settings';          // la ligne réservée aux réglages du document : une seule
    if (row.Token) return 'token' + SEP + row.Token;                 // l'identité du modèle, la même d'une table à l'autre
    const type = row.TemplateType || '';
    return blank(row.Content) ? 'name' + SEP + type + SEP + (row.Name || '') : 'content' + SEP + type + SEP + row.Content;
  }
  function preferenceKey(row, mapId) {
    const user = row.User || '';
    if (Number(row.TemplateId) === 0) return 'folder' + SEP + user + SEP + normalizedFolder(row.Folder);
    const id = mapId(row.TemplateId);
    return id === null ? null : 'model' + SEP + user + SEP + id;
  }
  function commentKey(row, mapId) {
    const id = blank(row.TemplateId) ? '' : mapId(row.TemplateId);
    return id === null ? null : [id, row.PdfId || '', row.Author || '', row.CreatedAt || '', row.Text || ''].join(SEP);
  }
  // Même règle que TemplatePreferences.normalizeFolderPath (recopiée : ce module n'en dépend pas pour lire une table qu'il n'a pas encore réunie).
  function normalizedFolder(path) {
    return path ? String(path).split('/').map(part => part.trim()).filter(Boolean).join('/') : '';
  }

  // Les champs d'une ligne du rangement que la table en service laisse vides et que l'ancienne renseigne : on les complète, jamais on n'en remplace un.
  const EXPORT_COLUMNS = ['ExportType', 'PdfQuality', 'ExportLines'];
  function preferenceFill(existing, row, keptHas) {
    const patch = {};
    if (Number(row.TemplateId) === 0) return patch;
    if (blank(existing.Folder) && !blank(row.Folder)) patch.Folder = row.Folder;
    if (!existing.Pinned && row.Pinned) patch.Pinned = true;
    // Une colonne que la table en service n'a pas (document d'avant les réglages d'export) n'est pas complétée : elle ne le serait jamais, la réunion resterait « incomplète ».
    EXPORT_COLUMNS.forEach(column => { if (keptHas(column) && blank(existing[column]) && !blank(row[column])) patch[column] = row[column]; });
    return patch;
  }

  const SPECS = {
    Publipostage_Templates: { key: templateKey, mapsIds: true },
    Publipostage_TemplatePreferences: { key: preferenceKey, fill: preferenceFill, remapColumn: 'TemplateId' },
    Publipostage_Comments: { key: commentKey, remapColumn: 'TemplateId' },
    Publipostage_Abbreviations: { key: row => [row.User || '', row.Abbreviation || ''].join(SEP) },
    Publipostage_PageFormats: { key: row => [row.Name || '', row.Width, row.Height].join(SEP) },
    Publipostage_TableLinks: { key: row => [row.SourceTable || '', row.TargetTable || ''].join(SEP) },
  };
  // Les modèles d'abord : les lignes des autres tables en citent le numéro.
  const ORDER = ['Publipostage_Templates', 'Publipostage_TemplatePreferences', 'Publipostage_Comments', 'Publipostage_Abbreviations', 'Publipostage_PageFormats', 'Publipostage_TableLinks'];

  // --- Détection ---------------------------------------------------------------------------------------------------------------------------------------------------------
  async function detect() {
    const names = new Set((await real().listTables()) || []);
    return registryTables()
      .filter(table => SPECS[table.id] && names.has(table.id) && names.has(table.legacyId))
      .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
      .map(table => {
        const kept = SchemaColumns.actualTable(table.id);
        return { table: table.id, kept, extra: kept === table.id ? table.legacyId : table.id };
      });
  }

  // --- Lecture : les colonnes du registre, sous leurs noms anglais, quel que soit le nom que la table porte -------------------------------------------------------------
  async function readRows(actual, table) {
    const fetched = await real().fetchTable(actual);
    const has = new Set(Object.keys(fetched || {}));
    const columns = [];
    table.pairs.forEach(pair => {
      const name = has.has(pair.id) ? pair.id : (has.has(pair.legacy) ? pair.legacy : null);
      if (name) columns.push({ id: pair.id, actual: name });
    });
    const rows = ((fetched && fetched.id) || []).map((rowId, i) => {
      const row = { id: rowId };
      columns.forEach(column => { row[column.id] = fetched[column.actual][i]; });
      return row;
    });
    // `english` : la table suit les noms anglais (une colonne dont le nom a changé porte son nom anglais) ; les colonnes qui n'ont jamais changé de nom n'en disent rien.
    const english = table.pairs.some(pair => pair.id !== pair.legacy && columns.some(column => column.id === pair.id && column.actual === pair.id));
    return { rows, columns, english };
  }

  const tableOf = id => SchemaColumns.TABLES.find(table => table.id === id);

  // --- Le plan d'une paire : ce qui s'ajoute, ce qui se complète --------------------------------------------------------------------------------------------------------
  function planPair(pair, kept, extra, idMap) {
    const spec = SPECS[pair.table];
    const identity = id => id;
    const toKept = id => (idMap ? (idMap.has(id) ? idMap.get(id) : null) : id);
    const keptColumns = new Set(kept.columns.map(column => column.id));
    const keptHas = column => keptColumns.has(column);
    const byKey = new Map();
    kept.rows.forEach(row => {
      const key = spec.key(row, identity);
      if (key === null) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    });
    const plan = { adds: [], fills: [], matches: [], conflicts: 0, dropped: 0 };
    extra.rows.forEach(row => {
      // Une table de rangement ou de commentaires dont les modèles ne sont pas tous dans la table en service (idMap) ne reprend que ceux qui y sont.
      const key = spec.key(row, spec.remapColumn ? toKept : identity);
      if (key === null) { plan.dropped++; return; }
      const same = byKey.get(key);
      if (!same) { plan.adds.push({ row, key }); return; }
      plan.matches.push({ row, kept: same[0] });
      if (spec.mapsIds && row.Token && !blank(row.Content) && !blank(same[0].Content) && row.Content !== same[0].Content) plan.conflicts++;
      if (spec.fill) {
        same.forEach(existing => {
          const patch = spec.fill(existing, row, keptHas);
          if (Object.keys(patch).length) plan.fills.push({ id: existing.id, patch });
        });
      }
    });
    return plan;
  }

  // Les colonnes que l'ancienne table renseigne (au moins une ligne à reprendre) et que la table en service n'a pas : elles s'y ajoutent, avec le type que Grist leur donne dans l'ancienne.
  function missingColumns(kept, extra, adds) {
    const present = new Set(kept.columns.map(column => column.id));
    return extra.columns
      .filter(column => !present.has(column.id) && adds.some(({ row }) => meaningful(row[column.id])))
      .map(column => column.id);
  }
  async function columnTypes(actual) {
    const types = new Map();
    try {
      const [tables, columns] = await Promise.all([real().fetchTable('_grist_Tables'), real().fetchTable('_grist_Tables_column')]);
      const at = (tables.tableId || []).indexOf(actual);
      if (at === -1) return types;
      (columns.colId || []).forEach((colId, i) => { if (columns.parentId[i] === tables.id[at]) types.set(colId, columns.type ? columns.type[i] : 'Text'); });
    } catch (e) { /* métadonnées illisibles : les colonnes ajoutées seront du texte */ }
    return types;
  }

  // Le nom de colonne que la table en service donnerait à une colonne neuve : le style qu'elle suit déjà (anglais ou ancien).
  const columnNameFor = (table, id, kept) => {
    const pair = table.pairs.find(item => item.id === id);
    return kept.english ? pair.id : pair.legacy;
  };

  // --- La réunion d'une paire -------------------------------------------------------------------------------------------------------------------------------------------------
  async function runPair(pair, ctx, dryRun) {
    assertRegistered(pair.kept);
    assertRegistered(pair.extra);
    const table = tableOf(pair.table);
    const spec = SPECS[pair.table];
    const [kept, extra] = await Promise.all([readRows(pair.kept, table), readRows(pair.extra, table)]);
    const plan = planPair(pair, kept, extra, ctx.idMap);
    if (spec.mapsIds) {
      ctx.idMap = new Map();
      plan.matches.forEach(({ row, kept: target }) => ctx.idMap.set(row.id, target.id));
    }
    const summary = {
      table: pair.table, kept: pair.kept, extra: pair.extra, extraRows: extra.rows.length, added: 0, filled: 0, matched: plan.matches.length,
      conflicts: plan.conflicts, dropped: plan.dropped, columnsAdded: 0, pending: plan.adds.length + plan.fills.length,
    };
    if (dryRun) return summary;

    const newColumns = missingColumns(kept, extra, plan.adds);
    if (newColumns.length) {
      const types = await columnTypes(pair.extra);
      const actions = newColumns.map(id => {
        const name = columnNameFor(table, id, kept);
        const pairInfo = table.pairs.find(item => item.id === id);
        const type = types.get(extra.columns.find(column => column.id === id).actual) || 'Text';
        const info = { type, isFormula: false };
        if (!kept.english && pairInfo.legacyLabel) info.label = pairInfo.legacyLabel;
        return ['AddVisibleColumn', pair.kept, name, info];
      });
      const result = await real().applyUserActions(actions);
      newColumns.forEach((id, i) => {
        const given = result && result.retValues && result.retValues[i] && result.retValues[i].colId;
        kept.columns.push({ id, actual: given || columnNameFor(table, id, kept) });
      });
      summary.columnsAdded = newColumns.length;
    }
    const actualOf = new Map(kept.columns.map(column => [column.id, column.actual]));
    const taken = new Set(kept.rows.map(row => row.Name).filter(Boolean));
    // Un seul document par défaut : celui de la table en service reste, la copie n'en prend pas la marque.
    const keptHasDefault = kept.rows.some(row => row.IsDefault);

    for (let start = 0; start < plan.adds.length; start += BATCH) {
      const chunk = plan.adds.slice(start, start + BATCH);
      const actions = chunk.map(({ row }) => {
        const fields = {};
        extra.columns.forEach(column => {
          if (!actualOf.has(column.id) || blank(row[column.id])) return;
          fields[actualOf.get(column.id)] = row[column.id];
        });
        if (spec.remapColumn && actualOf.has(spec.remapColumn) && !blank(row[spec.remapColumn]) && ctx.idMap && Number(row[spec.remapColumn]) !== 0) {
          fields[actualOf.get(spec.remapColumn)] = ctx.idMap.get(row[spec.remapColumn]);
        }
        if (spec.mapsIds && keptHasDefault && actualOf.has('IsDefault')) delete fields[actualOf.get('IsDefault')];
        // Deux modèles de même nom dans l'application se confondent à l'écran : la copie venue de l'ancienne table dit d'où elle vient.
        if (spec.mapsIds && row.TemplateType !== 'reglages' && actualOf.has('Name') && !blank(row.Name) && taken.has(row.Name)) {
          fields[actualOf.get('Name')] = row.Name + I18n.t('doubles.copySuffix');
        }
        return ['AddRecord', pair.kept, null, fields];
      });
      const result = await real().applyUserActions(actions);
      chunk.forEach(({ row }, i) => {
        const id = result && result.retValues ? result.retValues[i] : null;
        if (spec.mapsIds && id != null) ctx.idMap.set(row.id, id);
      });
      summary.added += chunk.length;
    }
    for (let start = 0; start < plan.fills.length; start += BATCH) {
      const chunk = plan.fills.slice(start, start + BATCH);
      await real().applyUserActions(chunk.map(({ id, patch }) => {
        const fields = {};
        Object.keys(patch).forEach(column => { if (actualOf.has(column)) fields[actualOf.get(column)] = patch[column]; });
        return ['UpdateRecord', pair.kept, id, fields];
      }));
      summary.filled += chunk.length;
    }
    summary.pending = 0;
    return summary;
  }

  async function run(pairs, dryRun) {
    const ctx = { idMap: null };
    const out = [];
    for (const pair of pairs) out.push(await runPair(pair, ctx, dryRun));
    return out;
  }
  const merge = pairs => run(pairs, false);
  const verify = pairs => run(pairs, true);

  // --- La suppression de l'ancienne table ------------------------------------------------------------------------------------------------------------------------------
  // Seulement quand une passe à blanc ne trouve plus rien à reprendre : l'ancienne table ne part jamais avec une ligne que la table en service n'a pas.
  async function removeExtra(pair) {
    assertRegistered(pair.kept);
    assertRegistered(pair.extra);
    if (pair.kept === pair.extra) throw new Error('[TableDoubles] une seule table : rien à supprimer');
    const names = new Set((await real().listTables()) || []);
    if (!names.has(pair.kept) || !names.has(pair.extra)) throw new Error('[TableDoubles] la paire a changé : ' + pair.table);
    const pairs = await detect();
    const current = pairs.find(item => item.table === pair.table);
    if (!current || current.extra !== pair.extra) throw new Error('[TableDoubles] la table à garder a changé : ' + pair.table);
    const left = (await verify(pairs)).find(item => item.table === pair.table);
    if (!left || left.pending > 0) throw new Error('[TableDoubles] la réunion n\'est pas complète : ' + pair.table);
    await real().applyUserActions([['RemoveTable', pair.extra]]);
    // Le traducteur des noms relit la liste des tables du document : il ne doit plus compter l'ancienne.
    try { await SchemaColumns.docApi.listTables(); } catch (e) { /* la prochaine lecture le fera */ }
  }

  // --- Ce que la personne a répondu : « La garder » ------------------------------------------------------------------------------------------------------------------------
  // Retenu par personne (PersonStore : `pp_doubles_kept`, une courte liste « document + ancienne table » en JSON, jamais une donnée du document ; chez GFS, l'espace de l'app), par document et par ancienne
  // table : la réponse ne vaut que pour cet endroit-ci. Absent, illisible ou refusé par le stockage : la question est reposée, jamais l'inverse.
  const KEPT_KEY = 'pp_doubles_kept';
  const KEPT_MAX = 40;
  // Le document, tel que Grist le nomme dans l'adresse de son interface de programmation (même clé que js/schema-renames.js) ; null : pas de réponse retenue.
  async function documentKey() {
    try {
      const info = await grist.docApi.getAccessToken({ readOnly: true });
      const url = new URL(String((info && info.baseUrl) || ''));
      const found = /\/api\/docs\/([^/?#]+)/.exec(url.pathname);
      return found ? url.host + '/' + found[1] : null;
    } catch (e) { return null; }
  }
  function readKept() {
    if (typeof PersonStore === 'undefined') return [];
    try {
      const list = JSON.parse(PersonStore.get(KEPT_KEY) || '[]');
      return Array.isArray(list) ? list.filter(item => typeof item === 'string') : [];
    } catch (e) { return []; }
  }
  const keptAnswers = docKey => new Set(docKey ? readKept().filter(item => item.indexOf(docKey + SEP) === 0).map(item => item.slice(docKey.length + 1)) : []);
  function rememberKept(docKey, extra) {
    if (!docKey || typeof PersonStore === 'undefined') return;
    const list = readKept();
    const entry = docKey + SEP + extra;
    if (list.indexOf(entry) === -1) PersonStore.set(KEPT_KEY, JSON.stringify(list.concat(entry).slice(-KEPT_MAX)));
  }

  // --- La question posée à l'ouverture ----------------------------------------------------------------------------------------------------------------------------------------
  const label = table => I18n.t('doubles.label.' + table.replace('Publipostage_', ''));
  const rowCount = n => I18n.t(n === 1 ? 'doubles.rows.one' : 'doubles.rows.many', { n });

  function describe(pairs, counts) {
    return pairs.map(pair => '• ' + I18n.t('doubles.line', { label: label(pair.table), kept: pair.kept, extra: pair.extra, rows: rowCount(counts.get(pair.table)) })).join('\n');
  }

  function summaryText(results) {
    const total = key => results.reduce((sum, item) => sum + item[key], 0);
    const parts = [I18n.t('doubles.done.counts', { added: total('added'), filled: total('filled') })];
    const left = total('conflicts') + total('dropped');
    if (left) parts.push(I18n.t('doubles.done.left', { n: left }));
    return parts.join(' ');
  }

  // hooks : { isUntouched(), isReadOnly(), notify(texte, estUneErreur), onMerged(), ask } ; `ask` est Dialogs (essais : une doublure).
  async function checkAfterOpen(hooks) {
    const hook = hooks || {};
    const dialogs = hook.ask || Dialogs;
    if (hook.isReadOnly && hook.isReadOnly()) return { pairs: [], action: 'readonly' };
    let pairs;
    try { pairs = await detect(); } catch (e) { return { pairs: [], action: 'unknown' }; }
    if (!pairs.length) return { pairs, action: 'none' };
    // Des modifications attendent : le coin d'état dit « Modifications non enregistrées », la question attendra la prochaine ouverture.
    if (hook.isUntouched && !hook.isUntouched()) return { pairs, action: 'edited' };

    // Ce que la réunion ferait : rien d'écrit. Les paires sont toujours passées ensemble, les lignes du rangement citent le numéro des modèles.
    let planned;
    try { planned = await verify(pairs); } catch (e) { return { pairs, action: 'unknown' }; }
    const pendingBefore = new Map(planned.map(item => [item.table, item.pending]));
    const needsMerge = planned.some(item => item.pending > 0);
    // « La garder » est une réponse : tant que l'ancienne table n'a rien de nouveau à donner, on ne la repose pas à chaque ouverture.
    const docKey = await documentKey();
    const keptBefore = keptAnswers(docKey);
    const askedRemoval = item => needsMerge || !keptBefore.has(item.extra);
    if (!needsMerge && !planned.some(askedRemoval)) return { pairs, action: 'kept' };

    let results = planned;
    if (needsMerge) {
      const counts = new Map();
      for (const pair of pairs) {
        try { counts.set(pair.table, (await readRows(pair.extra, tableOf(pair.table))).rows.length); } catch (e) { counts.set(pair.table, 0); }
      }
      const choice = await dialogs.choose({
        title: I18n.t('doubles.title'),
        message: I18n.t('doubles.message', { list: describe(pairs, counts) }),
        choices: [{ value: 'merge', label: I18n.t('doubles.merge'), primary: true }],
        cancelLabel: I18n.t('doubles.later'),
      });
      if (choice !== 'merge') {
        if (hook.notify) hook.notify(I18n.t('doubles.status.pending'), false);
        return { pairs, action: 'later' };
      }
      try {
        if (hook.notify) hook.notify(I18n.t('doubles.status.merging'), false);
        results = await merge(pairs);
      } catch (e) {
        console.warn('[TableDoubles] réunion impossible', e);
        if (hook.notify) hook.notify(I18n.t('doubles.status.failed'), true);
        return { pairs, action: 'failed', error: e };
      }
      if (hook.onMerged) { try { await hook.onMerged(results); } catch (e) { console.warn('[TableDoubles] relecture impossible', e); } }
    }

    // La suppression : une question par table, ancienne table nommée, avec ce qui n'a pas été repris.
    // Les tables qui citent des numéros de modèle d'abord, les modèles en dernier : une passe à blanc ne sait plus réécrire ces numéros quand l'ancienne table des modèles n'est plus là, elle refuserait
    // de supprimer l'ancienne table du rangement. Et l'ancienne table des modèles reste tant qu'une table qui en dépend garde la sienne.
    const removed = [];
    const keptBack = [];
    for (const result of results.slice().reverse()) {
      const pair = pairs.find(item => item.table === result.table);
      if (result.table === 'Publipostage_Templates' && keptBack.length) continue;
      if (!needsMerge && !askedRemoval(pair)) continue;
      const left = result.conflicts + result.dropped;
      const wants = await dialogs.confirm({
        title: I18n.t('doubles.remove.title', { extra: pair.extra }),
        message: I18n.t('doubles.remove.message', { extra: pair.extra, kept: pair.kept, summary: summaryText([result]) }) + (left ? '\n' + I18n.t('doubles.remove.left', { n: left }) : ''),
        confirmLabel: I18n.t('doubles.remove.confirm'),
        cancelLabel: I18n.t('doubles.remove.keep'),
        danger: true,
      });
      if (!wants) { rememberKept(docKey, pair.extra); if (SPECS[result.table].remapColumn) keptBack.push(pair.extra); continue; }
      try { await removeExtra(pair); removed.push(pair.extra); }
      catch (e) {
        console.warn('[TableDoubles] suppression impossible', e);
        if (SPECS[result.table].remapColumn) keptBack.push(pair.extra);
        await dialogs.notice({ title: I18n.t('doubles.remove.failedTitle'), message: I18n.t('doubles.remove.failed', { extra: pair.extra }) });
      }
    }
    if (hook.notify) hook.notify(removed.length ? I18n.t('doubles.status.removed') : I18n.t('doubles.status.merged', { summary: summaryText(results) }), false);
    return { pairs, action: removed.length ? 'removed' : 'merged', results, removed };
  }

  return { detect, merge, verify, removeExtra, checkAfterOpen };
})();
