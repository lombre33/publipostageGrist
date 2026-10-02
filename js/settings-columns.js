// Avertissement d'ouverture (point 11 d'Antoine du 2026-10-02, carte « Prévenir quand Accès ou Selon la ligne cite une colonne renommée ou supprimée ? ») : Réglages > Accès
// (js/access-rights.js) et Réglages > Selon la ligne (js/row-template.js) sont des OPTIONS DU WIDGET qui citent des colonnes - et, pour l'Accès, la table des droits - par leur NOM.
// Un renommage ou une suppression dans Grist ne les atteint pas : js/schema-renames.js réécrit les modèles et les clés de correspondance, mais les options ne se partagent qu'une
// fois la vue enregistrée (grist.setOption ne pose qu'un brouillon). La colonne citée compte alors pour « Aucune », sans rien dire : une colonne de droit renommée lève le verrou
// d'interface, une règle « Selon la ligne » ne correspond plus à rien.
// Ici, à l'ouverture et une fois le modèle affiché, le coin d'état dit QUEL réglage cite QUOI qui n'existe plus ; rien n'est réécrit, la personne re-choisit dans les Réglages.
// Sans réglage activé, ce n'est qu'un test : aucun appel à Grist.
//   SettingsColumns.problems()            -> Promise<{ access, rowTemplate }> : access = { table } (la table des droits a disparu) ou { columns: [noms] } ; rowTemplate = { columns: [noms
//                                            tels que la règle les cite] } ; null pour un réglage sain, coupé ou incomplet
//   SettingsColumns.message(found)        -> le texte du coin d'état, dans la langue de l'interface ('' sans problème)
//   SettingsColumns.checkAfterOpen(hooks) -> Promise<{ message, skipped? }> ; hooks = { notify(texte, estUneErreur), isUntouched() } (js/main.js)
const SettingsColumns = (function () {
  const unique = list => list.filter((name, i) => list.indexOf(name) === i);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Grist ne connaît pas encore le schéma (métadonnées illisibles : js/grist-api.js:refreshColumnTypes laisse alors tout vide) : on ne sait rien, donc on ne dit rien.
  function schemaKnown() { return GristAPI.getTables().length > 0; }
  // Les colonnes de `table` sont connues : les types viennent des mêmes métadonnées que cette liste (js/grist-api.js:runSchemaPass).
  function columnsKnown(table) { return GristAPI.getColumns(table).length > 0; }
  function tableExists(table) { return GristAPI.getTables().indexOf(table) !== -1; }
  // Une table absente de la liste est supprimée OU cachée à cette personne par une règle d'accès : Grist ne liste pas ces tables-là et laisse leur ligne de _grist_Tables, au nom
  // blanchi (WidgetFrame.ts:listTables, vérifié à la source grist-core le 2026-10-02). Sans aucune ligne blanchie elle est bien supprimée ; avec, on ne peut pas savoir laquelle
  // des deux c'est, et un message « n'existe plus » serait faux pour qui n'a simplement pas le droit de la lire. Lue une fois, et seulement quand une table manque.
  async function mayBeHidden() {
    try { return (await GristAPI.fetchTableRows('_grist_Tables')).some(row => row.tableId === ''); }
    catch (e) { return true; }
  }

  // Réglage Accès : { table } si la table des droits a disparu (ses colonnes ne se comptent alors pas), { columns } pour celles qui manquent dans l'ordre de l'onglet, null sinon.
  async function accessProblem() {
    const config = AccessRights.getConfig();
    if (!config || !schemaKnown()) return null;
    if (!tableExists(config.table)) return (await mayBeHidden()) ? null : { table: config.table };
    if (!columnsKnown(config.table)) return null;
    const cited = unique([config.emailColumn, config.readOnlyColumn, config.exportColumn, config.commentsColumn].filter(Boolean));
    const missing = cited.filter(col => !GristAPI.getColumnType(config.table, col));
    return missing.length ? { columns: missing } : null;
  }

  // Réglage Selon la ligne : les colonnes de ses règles qui n'existent plus, écrites comme la règle les cite (nue pour la table de la page, « Table.Colonne » sinon, chemin de
  // références compris). Coupé, le réglage ne sert à rien : ses règles gardées ne comptent pas. Une colonne nue ne se vérifie qu'avec la table de la page.
  async function rowTemplateProblem() {
    const raw = RowTemplate.readRaw();
    if (!raw || !raw.enabled || !raw.rules.length || !schemaKnown()) return null;
    let pageTable = null;
    if (raw.rules.some(rule => String(rule.column || '').indexOf('.') === -1)) {
      pageTable = GristAPI.getCurrentTableId() || await GristAPI.detectTableId(null, 'settingsColumns').catch(() => null);
    }
    const missing = [];
    let hidden;
    for (const rule of raw.rules) {
      if (!rule.column) continue;
      const { table, column } = ConditionRules.parseColumnRef(rule.column, pageTable);
      if (!table || !column) continue;
      if (GristAPI.resolveColumnPath(table, column)) continue;
      if (tableExists(table)) {
        // Table dont les colonnes ne sont pas encore lues : rien à conclure.
        if (!columnsKnown(table)) continue;
      } else {
        // Table absente du schéma : la colonne citée n'existe plus non plus - sauf si la table est seulement cachée à cette personne.
        if (hidden === undefined) hidden = await mayBeHidden();
        if (hidden) continue;
      }
      missing.push(rule.column);
    }
    return missing.length ? { columns: unique(missing) } : null;
  }

  async function problems() {
    return { access: await accessProblem(), rowTemplate: await rowTemplateProblem() };
  }

  const quoted = list => list.map(name => I18n.t('settingsColumns.quoted', { name })).join(', ');
  function part(titleKey, found) {
    const title = I18n.t(titleKey);
    if (found.table) return I18n.t('settingsColumns.part.table', { title, name: found.table });
    return I18n.t('settingsColumns.part.columns', { title, count: found.columns.length, names: quoted(found.columns) });
  }
  function message(found) {
    const parts = [];
    if (found && found.access) parts.push(part('settings.tab.access', found.access));
    if (found && found.rowTemplate) parts.push(part('settings.rowTemplate.title', found.rowTemplate));
    return parts.length ? I18n.t('settingsColumns.status', { parts: parts.join(' ') }) : '';
  }

  // Une personne que son propre droit met en lecture seule n'a pas à lire un message qui ne regarde que qui règle l'Accès. Pas celle que la table des droits illisible verrouille (état
  // « error » : tout le monde l'est, y compris qui l'a réglée) ni celle dont les droits se calculent encore.
  async function restricted() {
    for (let i = 0; i < 30 && AccessRights.getStatus().state === 'pending'; i++) await sleep(100);
    return AccessRights.getStatus().state === 'found' && AccessRights.get().readOnly;
  }

  async function checkAfterOpen(hooks) {
    const hook = hooks || {};
    if (await restricted()) return { message: '', skipped: 'restricted' };
    const text = message(await problems());
    if (!text) return { message: '' };
    // Modifications en cours : le coin d'état dit « Modifications non enregistrées », ce message-ci attendra la prochaine ouverture.
    if (hook.isUntouched && !hook.isUntouched()) return { message: text, skipped: 'edited' };
    if (hook.notify) hook.notify(text, true);
    return { message: text };
  }

  return { problems, message, checkAfterOpen };
})();
