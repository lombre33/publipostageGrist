// « Colonne… » de la barre flottante d'une bulle #Variable CASSÉE (colonne renommée ou supprimée dans Grist) : choisir à la main, dans une liste
// avec recherche (js/search-select.js) de toutes les colonnes - celles de la table de la page en tête, comme la liste « # » -, la colonne qui prend
// la place de celle de la bulle. Le bouton n'est dans la barre que sur une bulle rouge (js/floating-toolbars.js, `isBroken` ci-dessous) ; la liste,
// elle, sait remplacer aussi la colonne d'une bulle valide.
//
// C'est la même bulle, avec la même démarche que « Remplacer » d'Autres attributs (js/variable-linked-attrs.js:replace) : ses réglages restent, sauf
// ce qui ne vaut que pour l'ancienne colonne - un format d'un autre genre (une date sur un texte donnerait n'importe quoi), une boucle d'une autre
// source. La condition d'affichage reste toujours : elle parle de la ligne, pas de la colonne. Le genre du format se lit sur le format lui-même, pas
// sur l'ancienne colonne : celle d'une bulle cassée n'existe plus. Une variable d'une autre table passe par la fenêtre de choix de la clé, comme à
// l'insertion (Variables.ensureLinkConfigured, sauf dans une zone répétée pour cette table) ; refusée, rien ne change. Une seule transaction : un
// seul Annuler rend l'ancienne colonne.
const VariableColumn = (function () {
  let session = null;  // { host, search } pendant que la liste est ouverte
  let picking = false; // vrai du choix à la fin de la fenêtre de la clé : la liste est refermée, mais rien d'autre ne doit s'ouvrir par-dessus

  const isOpen = () => picking || !!session;

  // Même lecture que le rouge de la bulle (Variables.badgeProblem) : table disparue, colonne absente de sa table, chemin dont un maillon a disparu ou
  // n'est plus une Référence.
  const isBroken = attrs => !!(attrs && attrs.column && Variables.badgeProblem(attrs.table, attrs.column));

  // Genre de réglage que porte un format de bulle, et que permet une colonne : nombre, date, Oui / Non, liste. Le zéro se règle seul, sans `type`
  // (js/floating-toolbars.js, num-zero) : c'est un réglage nombre ; la liste aussi (`list`, js/variable-list.js) : elle suit d'une liste de choix à
  // une liste de références, pas sur une colonne qui n'est pas une liste.
  function formatKindOf(format) {
    if (!format) return null;
    if (format.type === 'number' || format.type === 'date' || format.type === 'bool') return format.type;
    if (format.zero) return 'number';
    return format.list ? 'list' : null;
  }
  function columnKindOf(type) {
    if (type === 'Numeric' || type === 'Int') return 'number';
    if (type === 'Date' || type === 'DateTime') return 'date';
    if (VariableFormat.isListType(type)) return 'list';
    return type === 'Bool' ? 'bool' : null;
  }
  const sameVia = (a, b) => (!a && !b) || (!!a && !!b && a.table === b.table && a.column === b.column);

  // Les attributs de la bulle une fois sa colonne remplacée par `item` ({ table, column, key }) : tout le reste de la bulle est gardé, sauf ce qui ne
  // vaut plus.
  function replacementAttrs(node, item) {
    const attrs = Object.assign({}, node.attrs, { table: item.table, column: item.column, key: item.key });
    const kind = formatKindOf(node.attrs.format);
    if (kind && kind !== columnKindOf(GristAPI.getColumnType(item.table, item.column))) attrs.format = null;
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

  async function pick(editor, pos, node, item) {
    picking = true;
    try {
      // Dans une zone répétée pour cette table, la variable lit la ligne du tour : aucun lien à configurer (même règle qu'à l'insertion,
      // js/variables.js).
      const inLoop = VariableLoop.loopTableAt(editor.state, pos) === item.table;
      if (!inLoop && !(await Variables.ensureLinkConfigured(item))) { editor.view.focus(); return; }
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
    // Sans les colonnes d'aide « gristHelper_… » (le texte affiché d'une Référence, rangé par Grist dans la même table) : elles ne se choisissent
    // jamais.
    const candidates = Variables.prioritizeTables(GristAPI.getAllVariables().filter(v => !GristAPI.isHelperColumn(v.column)), Variables.currentTables(editor));
    if (!candidates.length) return false;
    let host = null;
    let instance = null;
    try {
      host = Dom.el('div');
      host.id = 'v2-var-column-search';
      const select = Dom.el('select');
      select.append(...candidates.map(v => Dom.option(v.key, v.key)));
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
        // Défait après la fin de l'évènement en cours (un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte). Le focus
        // revient à l'éditeur quand la fermeture vient du clavier (Échap) ou d'un choix ; après un clic ailleurs, il est déjà là où la personne a
        // cliqué.
        onClose: refocus => { if (refocus) editor.view.focus(); setTimeout(() => close(instance), 0); },
      });
      instance = { host, search };
      session = instance;
      select.addEventListener('change', () => {
        const item = candidates.find(c => c.key === select.value);
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

  return { open, isBroken, replacementAttrs };
})();
