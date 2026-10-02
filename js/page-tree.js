// Rangement des pages que Grist crée avec les tables du widget (retour d'Antoine, 2026-10-02, point 15 : « lorsque le widget est ajouté dans un nouveau document, créer
// une table et les autres imbriquées dessous pour éviter d'alourdir la navigation, et si possible en mode replié par défaut »).
// grist-core (sandbox/grist/useractions.py : AddTable -> doAddView) crée pour chaque AddTable une page au premier niveau, tout en bas du volet des pages. Le widget en crée
// jusqu'à six (modèles, commentaires, préférences de rangement, abréviations, liens entre tables, sonde de l'e-mail) : autant de lignes dans la navigation du document.
// Ici : la page de `Publipostage_Modeles` reste au premier niveau et se replie par défaut ; la page de chacune des autres tables passe juste dessous, comme le fait le
// glisser-déposer de Grist (app/client/models/TreeModel.ts : UpdateRecord sur `_grist_Pages`, `indentation` et `pagePos` = position de la page qui doit la suivre).
// Le « replié par défaut » est l'option du document que Grist lit (app/client/models/entities/PageRec.ts : `_grist_Pages.options` = {"collapsed": true}, la case « Replier
// par défaut » du menu d'une page) ; elle n'est posée qu'à la création de la table des modèles, donc dans un document neuf, jamais re-posée après un choix de l'utilisateur.
// Rien n'est jamais déplacé dans un document existant : seules les tables créées pendant la session sont rangées, une fois. Un échec (droits, ancienne version de
// Grist sans la colonne `options`) ne casse jamais la création de la table : il est consigné dans la console et c'est tout.
//   PageTree.afterTableCreated(tableId) -> Promise<void> ; à appeler juste après l'AddTable d'une table du widget (sans attendre : rien ne dépend du rangement)
//   PageTree.whenIdle()                 -> Promise<void> ; les rangements demandés jusque-là sont finis (tests)
//   PageTree.reset()                    -> oublie les tables en attente (tests : chaque scénario repart d'un volet à lui)
const PageTree = (function () {
  const MAIN_TABLE = 'Publipostage_Modeles';
  const PAGES = '_grist_Pages';

  let pendingNest = new Set();     // tables créées pendant la session dont la page n'est pas encore rangée (la page des modèles peut ne pas exister encore)
  let collapsePending = false;     // la table des modèles vient d'être créée : sa page doit être repliée par défaut
  let queue = Promise.resolve();   // un rangement à la fois : deux créations qui se croisent lisent chacune l'état laissé par l'autre

  // fetchTable rend des colonnes ({ id: [...], viewRef: [...] }) : on les relit en lignes.
  function rowsOf(table) {
    const ids = (table && table.id) || [];
    return ids.map((id, i) => {
      const row = { id };
      Object.keys(table).forEach(key => { if (key !== 'id') row[key] = table[key][i]; });
      return row;
    });
  }

  async function snapshot() {
    const [tables, pages] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable(PAGES)]);
    return { tables: rowsOf(tables), pages: rowsOf(pages), hasOptions: !!pages && 'options' in pages };
  }

  // Dans l'ordre du volet : par pagePos, une position absente en dernier.
  const byPosition = (a, b) => (a.pagePos == null ? Infinity : a.pagePos) - (b.pagePos == null ? Infinity : b.pagePos) || a.id - b.id;

  function pageOfTable(tableId, snap) {
    const table = snap.tables.find(row => row.tableId === tableId);
    if (!table || !table.primaryViewId) return null;
    return snap.pages.find(page => page.viewRef === table.primaryViewId) || null;
  }

  function parseOptions(text) {
    if (!text) return {};
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (e) { return {}; }
  }

  // Une page à l'indentation n est suivie de ses enfants : les pages suivantes d'indentation plus grande.
  function subtreeEnd(list, index) {
    let end = index + 1;
    while (end < list.length && list[end].indentation > list[index].indentation) end++;
    return end;
  }

  async function nestPage(tableId, snap) {
    const main = pageOfTable(MAIN_TABLE, snap);
    const mine = pageOfTable(tableId, snap);
    if (!main || !mine || main.id === mine.id) return false;
    const list = snap.pages.slice().sort(byPosition);
    const mainAt = list.findIndex(page => page.id === main.id);
    const mineAt = list.findIndex(page => page.id === mine.id);
    if (mineAt > mainAt && mineAt < subtreeEnd(list, mainAt) && mine.indentation > main.indentation) return true; // déjà dessous
    // Juste après le dernier descendant de la page des modèles, sans compter la page qu'on range.
    const rest = list.filter(page => page.id !== mine.id);
    const restMainAt = rest.findIndex(page => page.id === main.id);
    const next = rest[subtreeEnd(rest, restMainAt)] || null;
    await grist.docApi.applyUserActions([[
      'UpdateRecord', PAGES, mine.id, { indentation: main.indentation + 1, pagePos: next ? next.pagePos : null },
    ]]);
    return true;
  }

  async function collapseMain(snap) {
    const main = pageOfTable(MAIN_TABLE, snap);
    if (!main) return false;
    if (!snap.hasOptions) return true; // Grist sans l'option : rien à poser, rien à retenter
    const options = parseOptions(main.options);
    if (options.collapsed === true) return true;
    await grist.docApi.applyUserActions([['UpdateRecord', PAGES, main.id, { options: JSON.stringify(Object.assign({}, options, { collapsed: true })) }]]);
    return true;
  }

  async function tidy() {
    if (!collapsePending && !pendingNest.size) return;
    const snap = await snapshot();
    if (collapsePending && await collapseMain(snap)) collapsePending = false;
    // Une page rangée n'est plus touchée ensuite : l'utilisateur peut la déplacer. Un rangement refusé (droits, réseau) reste en attente et se retente à la création suivante.
    for (const tableId of Array.from(pendingNest)) {
      const fresh = await snapshot();
      if (!pageOfTable(MAIN_TABLE, fresh) || !pageOfTable(tableId, fresh)) continue; // la page des modèles ou la sienne n'est pas encore là : au prochain passage
      await nestPage(tableId, fresh);
      pendingNest.delete(tableId);
    }
  }

  function afterTableCreated(tableId) {
    if (tableId === MAIN_TABLE) collapsePending = true; else pendingNest.add(tableId);
    queue = queue.then(tidy).catch(e => { console.warn('[PageTree] rangement des pages impossible', e); });
    return queue;
  }

  const whenIdle = () => queue;

  function reset() {
    pendingNest = new Set();
    collapsePending = false;
  }

  return { afterTableCreated, whenIdle, reset, MAIN_TABLE };
})();
