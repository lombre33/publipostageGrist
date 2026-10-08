// « Colonne… » de la barre flottante d'une bulle #Variable cassée (colonne renommée ou supprimée dans Grist) : choisir à la main, dans une liste
// avec recherche (js/search-select.js) de toutes les colonnes - celles de la table de la page en tête, comme la liste « # » -, la colonne qui prend
// la place de celle de la bulle. Le bouton n'est dans la barre que sur une bulle rouge (js/floating-toolbars.js, `isBroken` ci-dessous) ; la liste,
// elle, sait remplacer aussi la colonne d'une bulle valide.
//
// C'est la même bulle, avec la même démarche que « Remplacer » d'Autres attributs (js/variable-linked-attrs.js:replace) : ses réglages restent, sauf
// ce qui ne vaut que pour l'ancienne colonne - un format d'un autre genre (une date sur un texte donnerait n'importe quoi), une boucle d'une autre
// source. La condition d'affichage reste toujours : elle parle de la ligne, pas de la colonne. Le genre du format se lit sur le format lui-même, pas
// sur l'ancienne colonne : celle d'une bulle cassée n'existe plus. Une variable d'une autre table passe par la fenêtre de choix de la clé, comme à
// l'insertion (Variables.ensureLinkConfigured, sauf dans une zone répétée pour cette table) ; refusée, rien ne change. Une seule transaction : un
// seul Annuler rend l'ancienne colonne. La liste des variables, sa ligne et la vérification du lien sont aussi celles de « Sinon afficher » dans la
// fenêtre de condition d'une bulle (js/variable-condition.js : `candidates`, `optionOf`, `itemOf`, `expand`, `ensureLinked`), flèche des colonnes Référence comprise.
const VariableColumn = (function () {
  let session = null;  // { host, search } pendant que la liste est ouverte
  let picking = false; // vrai du choix à la fin de la fenêtre de la clé : la liste est refermée, mais rien d'autre ne doit s'ouvrir par-dessus

  const isOpen = () => picking || !!session;

  // Même lecture que le rouge de la bulle (Variables.badgeProblem) : table disparue, colonne absente de sa table, chemin dont un maillon a disparu ou
  // n'est plus une Référence.
  const isBroken = attrs => !!(attrs && attrs.column && Variables.badgeProblem(attrs.table, attrs.column));

  const sameVia = (a, b) => (!a && !b) || (!!a && !!b && a.table === b.table && a.column === b.column);

  // Les attributs de la bulle une fois sa colonne remplacée par `item` ({ table, column, key }) : tout le reste de la bulle est gardé, sauf ce qui ne
  // vaut plus.
  function replacementAttrs(node, item) {
    const attrs = Object.assign({}, node.attrs, { table: item.table, column: item.column, key: item.key });
    const kind = VariableFormat.formatKindOf(node.attrs.format);
    if (kind && kind !== VariableFormat.columnKind(GristAPI.getColumnType(item.table, item.column))) attrs.format = null;
    if (node.attrs.loop) {
      const loop = LoopRules.normalizeLoop(node.attrs.loop);
      const source = LoopRules.sourceFor(attrs, GristAPI.getCurrentTableId());
      if (!loop || !source || source.table !== loop.table || !sameVia(source.via, loop.via)) attrs.loop = null;
    }
    return attrs;
  }

  function close(instance) {
    if (!session || (instance && instance !== session)) return;
    const { host, search } = session;
    session = null;
    try { search.destroy(); } catch (e) { /* déjà défait */ }
    host.remove();
  }

  // Les variables qu'une bulle peut prendre : toutes celles du document, sans les colonnes d'aide « gristHelper_… » (le texte affiché d'une Référence,
  // rangé par Grist dans la même table : elles ne se choisissent jamais), celles des tables « en cours » en tête - la table que parcourt la zone
  // répétée de la bulle, puis celle de la page, comme la liste « # ». Aussi la liste du « sinon » d'une bulle (js/variable-condition.js).
  function candidates(editor) {
    return Variables.prioritizeTables(GristAPI.getAllVariables().filter(v => !GristAPI.isHelperColumn(v.column)), Variables.currentTables(editor));
  }
  // Une ligne de liste avec recherche pour `variable` ({ table, column, key }) : sa clé, sa table et son libellé Grist pour la recherche, et - pour une
  // colonne Référence - la table que sa flèche ouvre : la liste descend dans les colonnes de cette table (`expand`), la bulle peut alors prendre pour
  // colonne un chemin, comme celles d'Autres attributs.
  function optionOf(variable) {
    const option = Dom.option(variable.key, variable.key);
    option.dataset.search = Variables.columnSearchText(variable.table, variable.column);
    const target = Variables.referencedTable(variable.table, variable.column);
    if (target) option.dataset.expand = target;
    return option;
  }
  // Les lignes où mène la flèche d'une ligne de ces listes : option `expand` de SearchSelect.attachColumns.
  const expand = item => Variables.columnsBelow(item.value);
  // Le choix `key` d'une de ces listes : une variable de `choices`, ou - en descendant dans une colonne Référence (« Projet.Accompagnateur.Email ») - une
  // variable dont la colonne est le chemin, comme celles que pose Autres attributs (js/variables.js:pathItems).
  function itemOf(choices, key) {
    const found = choices.find(c => c.key === key);
    if (found) return found;
    const cut = String(key).indexOf('.');
    return cut === -1 ? null : { table: key.slice(0, cut), column: key.slice(cut + 1), key };
  }
  // Vrai quand la variable `item` ({ table, … }) se lira à cet endroit : sa table est celle de la page, déjà liée, ou - dans une zone répétée pour cette
  // table, où la variable lit la ligne du tour - n'a aucun lien à configurer (même règle qu'à l'insertion, js/variables.js) ; sinon la fenêtre de la
  // clé s'ouvre, et le résultat est faux quand elle est refusée.
  async function ensureLinked(editor, pos, item) {
    return VariableLoop.loopTableAt(editor.state, pos) === item.table || Variables.ensureLinkConfigured(item);
  }

  async function pick(editor, pos, node, item) {
    picking = true;
    try {
      if (!(await ensureLinked(editor, pos, item))) { editor.view.focus(); return; }
      // La fenêtre de la clé a pu rester ouverte longtemps : la bulle doit toujours être là, la même.
      const current = editor.state.doc.nodeAt(pos);
      if (!current || current.type.name !== 'varBadge' || current.attrs.key !== node.attrs.key || current.attrs.table !== node.attrs.table) return;
      if (item.key !== current.attrs.key) EditorCore.patchNodeAndReselect(editor, pos, replacementAttrs(current, item));
      editor.view.focus();
    } catch (e) {
      console.error('[VariableColumn] échec du changement de colonne', e);
    } finally {
      picking = false;
    }
  }

  // `pos` : position de la bulle, capturée au clic sur l'icône de la barre flottante. Rend faux quand la liste ne s'ouvre pas (bulle introuvable,
  // aucune colonne, composant indisponible).
  function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || isOpen()) return false;
    const choices = candidates(editor);
    if (!choices.length) return false;
    let host = null;
    let instance = null;
    try {
      host = Dom.el('div');
      host.id = 'v2-var-column-search';
      const select = Dom.el('select');
      select.append(...choices.map(optionOf));
      host.appendChild(select);
      document.body.appendChild(host);
      select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
      // Ancre = la bulle elle-même : la barre qui porte le bouton se referme dès un clic dans la liste, la bulle reste là.
      const anchor = () => {
        const dom = editor.view.nodeDOM(pos);
        return (dom && dom.getBoundingClientRect ? dom : editor.view.dom).getBoundingClientRect();
      };
      const search = SearchSelect.attachColumns(select, {
        popup: true,
        anchor,
        expand,
        // Défait après la fin de l'évènement en cours (un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte). Le focus
        // revient à l'éditeur quand la fermeture vient du clavier (Échap) ou d'un choix ; après un clic ailleurs, il est déjà là où la personne a
        // cliqué.
        onClose: refocus => { if (refocus) editor.view.focus(); setTimeout(() => close(instance), 0); },
      });
      instance = { host, search };
      session = instance;
      select.addEventListener('change', () => {
        const item = itemOf(choices, select.value);
        if (item) pick(editor, pos, node, item);
      });
      search.open();
      return true;
    } catch (e) {
      console.warn('[VariableColumn] liste des colonnes indisponible', e);
      if (instance) close(instance); else if (host) host.remove();
      session = null;
      return false;
    }
  }

  return { open, isBroken, replacementAttrs, candidates, optionOf, itemOf, expand, ensureLinked };
})();
