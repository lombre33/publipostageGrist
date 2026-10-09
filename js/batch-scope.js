// Les lignes d'un export en lot : celles que la vue Grist du widget affiche (ses filtres, son tri, le lien « Sélectionner par » d'un autre widget), ou
// toute la table. Une vue qui n'en montre qu'une partie fait demander laquelle exporter ; une vue qui les montre toutes ne demande rien.
//  BatchScope.viewRowIds(tableId) -> Promise<number[] | null> : les identifiants des lignes de la vue, dans son ordre (GristView.fetchSelectedTable : le
//    client de Grist rend les lignes de la section une fois filtrées et triées, jamais la table entière). null : cette table n'est pas celle de la page du
//    widget (aucune vue ne la montre), ou Grist ne les donne pas. Seuls les identifiants servent : les valeurs d'une ligne viennent de la lecture de la
//    table (forme brute), comme pour toute la table.
//  BatchScope.pick(allRows, viewIds, { table, grid? }) -> Promise<{ rows, scope } | null>
//    allRows : toute la table, dans l'ordre de ses lignes ; viewIds : ce que rend viewRowIds. `rows` : les lignes à exporter ; `scope` : 'view' (celles de
//    la vue, dans son ordre) ou 'all' (toute la table, dans son ordre). null : la personne renonce (Annuler, Échap). Sans vue connue (viewIds nul), ou
//    quand la vue montre toute la table, aucune fenêtre ne s'ouvre. `grid` : le modèle est une grille, « lignes » devient « valeurs ».
const BatchScope = (function () {
  async function viewRowIds(tableId) {
    if (!tableId || tableId !== GristAPI.getCurrentTableId()) return null;
    const fetchView = grist.fetchSelectedTable || (grist.docApi && grist.docApi.fetchSelectedTable);
    if (typeof fetchView !== 'function') return null;
    try {
      const data = await fetchView.call(grist, { includeColumns: 'shown', keepEncoded: true });
      return data && Array.isArray(data.id) ? data.id.slice() : null;
    } catch (e) {
      console.error('[BatchScope] fetchSelectedTable : les lignes de la vue sont illisibles', e);
      return null;
    }
  }

  // Les lignes de `allRows` que la vue nomme, dans l'ordre de la vue : un identifiant que la table ne connaît pas est ignoré, un identifiant répété ne
  // compte qu'une fois.
  function viewRowsOf(allRows, viewIds) {
    const byId = new Map(allRows.map(row => [row.id, row]));
    const seen = new Set();
    const rows = [];
    viewIds.forEach(id => {
      const row = byId.get(id);
      if (row && !seen.has(id)) { seen.add(id); rows.push(row); }
    });
    return rows;
  }

  // Les mots de la fenêtre : « lignes » pour un document, « valeurs » pour une grille (comme GRID_WORDING dans js/main.js). Chaque clé est écrite en
  // entier, pour qu'une recherche de la clé retrouve son usage.
  const WORDS = {
    rows: { title: 'batchScope.title', message: 'batchScope.message', messageNone: 'batchScope.messageNone', view: 'batchScope.view' },
    grid: { title: 'batchScope.titleGrid', message: 'batchScope.messageGrid', messageNone: 'batchScope.messageNoneGrid', view: 'batchScope.viewGrid' },
  };

  async function pick(allRows, viewIds, { table = '', grid = false } = {}) {
    if (!viewIds) return { rows: allRows, scope: 'all' };
    const viewRows = viewRowsOf(allRows, viewIds);
    // La vue montre toute la table : rien à demander, mais le lot suit l'ordre de la vue (un tri de la vue se retrouve dans le fichier).
    if (viewRows.length === allRows.length) return { rows: viewRows, scope: 'view' };
    const words = grid ? WORDS.grid : WORDS.rows;
    const vars = { view: viewRows.length, all: allRows.length, table };
    // Une vue vide ne laisse que « Toute la table », sans choix mis en avant : Entrée y annule plutôt que d'exporter ce que la personne n'a pas voulu.
    const choices = [{ value: 'all', label: I18n.t('batchScope.all', vars) }];
    if (viewRows.length) choices.push({ value: 'view', label: I18n.t(words.view, vars), primary: true });
    const picked = await Dialogs.choose({
      title: I18n.t(words.title),
      message: I18n.t(viewRows.length ? words.message : words.messageNone, vars),
      choices,
    });
    if (picked === 'view') return { rows: viewRows, scope: 'view' };
    if (picked === 'all') return { rows: allRows, scope: 'all' };
    return null;
  }

  return { viewRowIds, pick };
})();
