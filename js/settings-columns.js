// Avertissement d'ouverture : Réglages > Accès (js/access-rights.js) et Réglages > Selon la ligne (js/row-template.js) sont des options du widget qui
// citent des colonnes (et, pour l'Accès, la table des droits) par leur nom. Un renommage ou une suppression dans Grist ne les atteint pas :
// js/schema-renames.js réécrit les modèles et les clés de correspondance, mais les options ne se partagent qu'une fois la vue enregistrée
// (grist.setOption ne pose qu'un brouillon). La colonne citée compte alors pour « Aucune », sans rien dire : une colonne de droit renommée lève le
// verrou d'interface, une règle « Selon la ligne » ne correspond plus à rien.
// À l'ouverture et une fois le modèle affiché, le coin d'état dit donc quel réglage cite quoi qui n'existe plus ; rien n'est réécrit, la personne
// re-choisit dans les Réglages. Sans réglage activé, ce n'est qu'un test : aucun appel à Grist.
// - SettingsColumns.problems() -> Promise<{ access, rowTemplate }> : access = { table } (la table des droits a disparu) ou { columns: [noms] } ;
//   rowTemplate = { columns: [noms tels que la règle les cite] } ; null pour un réglage sain, coupé ou incomplet.
// - SettingsColumns.message(found) -> le texte du coin d'état, dans la langue de l'interface ('' sans problème).
// - SettingsColumns.checkAfterOpen(hooks) -> Promise<{ message, skipped? }> ; hooks = { notify(texte, estUneErreur), isUntouched() } (js/main.js).
// - SettingsColumns.tableGone(table) -> Promise<boolean> : la table est supprimée ou renommée (pas seulement cachée à cette personne par une règle
//   d'accès) ; faux quand on ne peut pas le savoir. js/access-rights.js s'en sert pour laisser l'onglet Accès modifiable quand la table des droits
//   n'existe plus.
const SettingsColumns = (function () {
  const unique = list => [...new Set(list)];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Grist ne connaît pas encore le schéma (métadonnées illisibles : js/grist-api.js:refreshColumnTypes laisse alors tout vide) : on ne sait rien,
  // donc on ne dit rien.
  function schemaKnown() { return GristAPI.getTables().length > 0; }
  // Les colonnes de `table` sont connues : les types viennent des mêmes métadonnées que cette liste (js/grist-api.js:runSchemaPass).
  function columnsKnown(table) { return GristAPI.getColumns(table).length > 0; }
  function tableExists(table) { return GristAPI.getTables().indexOf(table) !== -1; }
  // Une table absente de la liste est supprimée ou cachée à cette personne par une règle d'accès : Grist ne liste pas ces tables-là et laisse leur
  // ligne de _grist_Tables, au nom blanchi (WidgetFrame.ts:listTables dans grist-core). Sans aucune ligne blanchie elle est bien supprimée ; avec, on
  // ne peut pas savoir laquelle des deux c'est, et un message « n'existe plus » serait faux pour qui n'a simplement pas le droit de la lire. Lue une
  // fois, et seulement quand une table manque.
  async function mayBeHidden() {
    try { return (await GristAPI.fetchTableRows('_grist_Tables')).some(row => row.tableId === ''); }
    catch (e) { return true; }
  }
  // Table réellement disparue : le schéma est lu, elle n'y figure plus et aucune table n'est cachée dans le document. Dans le doute (schéma inconnu,
  // liste des tables illisible, table peut-être cachée) : faux - jamais « disparue » pour qui n'a simplement pas le droit de la lire.
  async function tableGone(table) {
    return !!table && schemaKnown() && !tableExists(table) && !(await mayBeHidden());
  }

  // Réglage Accès : { table } si la table des droits a disparu (ses colonnes ne se comptent alors pas), { columns } pour celles qui manquent dans
  // l'ordre de l'onglet, null sinon.
  async function accessProblem() {
    const config = AccessRights.getConfig();
    if (!config || !schemaKnown()) return null;
    if (!tableExists(config.table)) return (await tableGone(config.table)) ? { table: config.table } : null;
    if (!columnsKnown(config.table)) return null;
    const cited = unique([config.emailColumn, config.readOnlyColumn, config.exportColumn, config.commentsColumn].filter(Boolean));
    const missing = cited.filter(col => !GristAPI.getColumnType(config.table, col));
    return missing.length ? { columns: missing } : null;
  }

  // La table de la page, pour résoudre les colonnes citées nues ; inutile (null) quand toutes les règles citent « Table.Colonne ».
  async function pageTableOf(rules) {
    if (!rules.some(rule => String(rule.column || '').indexOf('.') === -1)) return null;
    return GristAPI.getCurrentTableId() || await GristAPI.detectTableId(null, 'settingsColumns').catch(() => null);
  }

  // La règle cite-t-elle une colonne qui n'existe plus ? `isHidden()` dit si une table absente du schéma est seulement cachée à cette personne.
  async function citesMissingColumn(rule, pageTable, isHidden) {
    if (!rule.column) return false;
    const { table, column } = ConditionRules.parseColumnRef(rule.column, pageTable);
    if (!table || !column) return false;
    if (GristAPI.resolveColumnPath(table, column)) return false;
    // Table dont les colonnes ne sont pas encore lues : rien à conclure.
    if (tableExists(table)) return columnsKnown(table);
    // Table absente du schéma : la colonne citée n'existe plus non plus - sauf si la table est seulement cachée à cette personne.
    return !(await isHidden());
  }

  // Réglage Selon la ligne : les colonnes de ses règles qui n'existent plus, écrites comme la règle les cite (nue pour la table de la page,
  // « Table.Colonne » sinon, chemin de références compris). Coupé, le réglage ne sert à rien : ses règles gardées ne comptent pas. Une colonne nue ne
  // se vérifie qu'avec la table de la page.
  async function rowTemplateProblem() {
    const raw = RowTemplate.readRaw();
    if (!raw || !raw.enabled || !raw.rules.length || !schemaKnown()) return null;
    const pageTable = await pageTableOf(raw.rules);
    let hidden;
    const isHidden = async () => {
      if (hidden === undefined) hidden = await mayBeHidden();
      return hidden;
    };
    const missing = [];
    for (const rule of raw.rules) {
      if (await citesMissingColumn(rule, pageTable, isHidden)) missing.push(rule.column);
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

  // Une personne que son propre droit met en lecture seule n'a pas à lire un message qui ne regarde que qui règle l'Accès. Pas celle que la table des
  // droits illisible verrouille (état « error » : tout le monde l'est, y compris qui l'a réglée) ni celle dont les droits se calculent encore.
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

  return { problems, message, checkAfterOpen, tableGone };
})();
