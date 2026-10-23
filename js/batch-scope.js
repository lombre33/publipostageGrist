// Les lignes d'un export en lot : celles que la vue Grist du widget affiche (ses filtres, son tri, le lien « Sélectionner par » d'un autre widget), celles de la vue d'à côté
// à laquelle le widget est relié par « Sélectionner par » sur la même table (ses filtres enregistrés : js/view-source.js), ou toute la table. Une vue qui n'en montre qu'une
// partie fait demander laquelle exporter ; une vue qui les montre toutes ne demande rien.
//  BatchScope.viewRowIds(tableId) -> Promise<number[] | null> : les identifiants des lignes de la vue, dans son ordre (GristView.fetchSelectedTable : le
//    client de Grist rend les lignes de la section une fois filtrées et triées, jamais la table entière). null : cette table n'est pas celle de la page du
//    widget (aucune vue ne la montre), ou Grist ne les donne pas. Seuls les identifiants servent : les valeurs d'une ligne viennent de la lecture de la
//    table (forme brute), comme pour toute la table.
//  BatchScope.viewRowsOf(allRows, viewIds) -> row[] : les lignes de `allRows` que la vue nomme, dans l'ordre de la vue (aussi lu par la Boucle sur toutes les
//    lignes, js/loop-rules.js).
//  BatchScope.linkedViewRows(allRows, linkedIds, ownRows) -> row[] : les lignes de la vue d'à côté (`linkedIds` : ce que rend ViewSource.linkedRows), dans son ordre, moins
//    celles que le widget lui-même ne montre pas (`ownRows` : viewRowsOf de sa vue ; null quand elle est inconnue). Aussi lu par la Boucle (js/loop-rules.js).
//  BatchScope.onViewChange(callback) : `callback()` à chaque fois que Grist dit que les données de la vue ont changé (un filtre ou un tri posé ou retiré, une ligne
//    ajoutée, supprimée ou modifiée) : le message `dataChange` que grist.onRecords écoute aussi, lu seul, sans relire les lignes (onRecords les relit toutes à
//    chaque message). C'est à celui qui s'abonne de relire la vue (viewRowIds) quand il en a besoin.
//  BatchScope.pick(allRows, viewIds, { table, grid?, linked? }) -> Promise<{ rows, scope, linked? } | null>
//    allRows : toute la table, dans l'ordre de ses lignes ; viewIds : ce que rend viewRowIds. `rows` : les lignes à exporter ; `scope` : 'view' (celles de
//    la vue, dans son ordre) ou 'all' (toute la table, dans son ordre). null : la personne renonce (Annuler, Échap). Sans vue connue (viewIds nul), ou
//    quand la vue montre toute la table, aucune fenêtre ne s'ouvre. `grid` : le modèle est une grille, « lignes » devient « valeurs ».
//    `linked` : ce que rend ViewSource.linkedRows (null : pas de vue liée). Avec `ids`, « la vue » est celle d'à côté - ses lignes dans son ordre, moins celles que ce widget ne
//    montre pas - et le résultat porte son nom (`linked`) quand ses lignes partent. Avec `unreadable`, le widget ne sait pas dire ce que la vue liée affiche : la fenêtre le dit et ne
//    propose que « Toute la table » et, si le widget cache des lignes, « Celles du widget » (aucun choix mis en avant : Entrée annule).
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

  // Les lignes de la vue d'à côté, dans son ordre, que ce widget montre aussi : son propre filtre, posé sur son cadre, s'ajoute à celui du tableau auquel il est relié.
  function linkedViewRows(allRows, linkedIds, ownRows) {
    const rows = viewRowsOf(allRows, linkedIds);
    if (!ownRows) return rows;
    const shown = new Set(ownRows.map(row => row.id));
    return rows.filter(row => shown.has(row.id));
  }

  // Un seul écouteur de messages pour tous les abonnés, posé au premier abonnement (l'API de Grist n'a pas de désinscription) : un widget que personne n'écoute ne
  // reçoit rien de plus. Le message vient de la section du widget : une autre table du document n'en envoie pas.
  const viewListeners = [];
  let listening = false;
  function onViewChange(callback) {
    viewListeners.push(callback);
    if (listening || typeof grist === 'undefined' || typeof grist.on !== 'function') return;
    listening = true;
    grist.on('message', msg => {
      if (!msg || !msg.tableId || !msg.dataChange) return;
      viewListeners.forEach(listener => {
        try { listener(); } catch (e) { console.error('[BatchScope] onViewChange : abonné en erreur', e); }
      });
    });
  }

  // Les mots de la fenêtre : « lignes » pour un document, « valeurs » pour une grille (comme GRID_WORDING dans js/main.js). Chaque clé est écrite en
  // entier, pour qu'une recherche de la clé retrouve son usage. `linked*` : la vue d'à côté ; `own` : le bouton des lignes du widget quand la vue liée est illisible.
  const WORDS = {
    rows: {
      title: 'batchScope.title', message: 'batchScope.message', messageNone: 'batchScope.messageNone', view: 'batchScope.view',
      linkedMessage: 'batchScope.messageLinked', linkedMessageNone: 'batchScope.messageNoneLinked', linkedView: 'batchScope.viewLinked', own: 'batchScope.viewOwn',
    },
    grid: {
      title: 'batchScope.titleGrid', message: 'batchScope.messageGrid', messageNone: 'batchScope.messageNoneGrid', view: 'batchScope.viewGrid',
      linkedMessage: 'batchScope.messageLinkedGrid', linkedMessageNone: 'batchScope.messageNoneLinkedGrid', linkedView: 'batchScope.viewLinkedGrid', own: 'batchScope.viewOwnGrid',
    },
  };
  // Pourquoi le widget ne sait pas dire ce que la vue liée affiche (`unreadable` de ViewSource.linkedRows) : le texte entier de la fenêtre.
  const UNREADABLE = { relative: 'batchScope.unreadableRelative', upstream: 'batchScope.unreadableUpstream', ambiguous: 'batchScope.unreadableAmbiguous' };

  // La vue liée est illisible : toute la table, ou les lignes de ce widget s'il en cache, sinon renoncer. `own` : les lignes de ce widget (null : sa vue est inconnue).
  async function askUnreadable(allRows, own, linked, words, table) {
    const vars = { name: linked.name, table, all: allRows.length, view: own ? own.length : allRows.length };
    const choices = [{ value: 'all', label: I18n.t('batchScope.all', vars) }];
    if (own && own.length && own.length < allRows.length) choices.push({ value: 'view', label: I18n.t(words.own, vars) });
    const picked = await Dialogs.choose({ title: I18n.t(words.title), message: I18n.t(UNREADABLE[linked.unreadable], vars), choices });
    if (picked === 'view') return { rows: own, scope: 'view' };
    if (picked === 'all') return { rows: allRows, scope: 'all' };
    return null;
  }

  async function pick(allRows, viewIds, { table = '', grid = false, linked = null } = {}) {
    const words = grid ? WORDS.grid : WORDS.rows;
    const own = viewIds ? viewRowsOf(allRows, viewIds) : null;
    if (linked && linked.unreadable) return askUnreadable(allRows, own, linked, words, table);
    // La vue liée : ses lignes dans son ordre, celles que ce widget montre aussi ; sans elle, les lignes du widget.
    const viewRows = linked ? linkedViewRows(allRows, linked.ids, own) : own;
    if (!viewRows) return { rows: allRows, scope: 'all' };
    const viewResult = () => (linked ? { rows: viewRows, scope: 'view', linked: linked.name } : { rows: viewRows, scope: 'view' });
    // La vue montre toute la table : rien à demander, mais le lot suit l'ordre de la vue (un tri de la vue se retrouve dans le fichier).
    if (viewRows.length === allRows.length) return viewResult();
    const vars = { view: viewRows.length, all: allRows.length, table, name: linked ? linked.name : '' };
    // Une vue vide ne laisse que « Toute la table », sans choix mis en avant : Entrée y annule plutôt que d'exporter ce que la personne n'a pas voulu.
    const choices = [{ value: 'all', label: I18n.t('batchScope.all', vars) }];
    if (viewRows.length) choices.push({ value: 'view', label: I18n.t(linked ? words.linkedView : words.view, vars), primary: true });
    let message = viewRows.length ? words.message : words.messageNone;
    if (linked) message = viewRows.length ? words.linkedMessage : words.linkedMessageNone;
    const picked = await Dialogs.choose({ title: I18n.t(words.title), message: I18n.t(message, vars), choices });
    if (picked === 'view') return viewResult();
    if (picked === 'all') return { rows: allRows, scope: 'all' };
    return null;
  }

  return { viewRowIds, viewRowsOf, linkedViewRows, onViewChange, pick };
})();
