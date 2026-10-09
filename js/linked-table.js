// Tableau lié à un modèle Grille (09/10, lot 6 sur 6 du tableau de document, « En direct » : un tableau intégré au document qui est en fait un modèle Grille, une seule
// copie qui change partout). Un tableau de document peut être la copie du tableau d'un modèle Grille : il porte le numéro de ce
// modèle (`linkedTemplate`, `data-linked-template` dans le HTML enregistré) et ses cases sont celles du modèle au moment de la pose. Le HTML du document garde donc
// les cases : la Lecture, le PDF, le Word et les lots de macro-modèles les lisent comme celles de n'importe quel tableau, sans rien savoir du lien (un attribut qu'ils
// ne connaissent pas est ignoré).
//
// Cette étape pose le lien : la ligne « Tableau d'un modèle Grille… » du menu du bouton « Tableau » (au survol, comme « Image depuis une variable » sous le bouton
// Image ; le menu « Lien et blocs de contenu » n'a plus de place dans 700x400), qui ouvre une liste avec recherche des modèles Grille (ceux déjà liés dans le
// document grisés avec leur raison), le repère dans la page, le bouton du lien de la barre du tableau (son menu : le nom du modèle, « Détacher ») et les règles qui font tenir le lien :
//  - ses cases suivent celles d'une grille (GridEditor.isForbiddenNode : ni second tableau, ni colonnes, ni sommaire, ni citation, encadré, bloc de code...), pour
//    que ce qu'on y écrit puisse s'écrire dans le modèle ; le garde-fou refuse la transaction qui en ajouterait (collage et clavier compris), les boutons concernés
//    se grisent ;
//  - un modèle n'est lié qu'une fois par document : une copie du tableau (Ctrl+C, Ctrl+V) perd son lien ;
//  - un tableau lié se pose hors de tout autre tableau (les cases d'un tableau ne contiennent pas de tableau lié) ;
//  - suivi des modifications allumé : le tableau est verrouillé (une suggestion ne s'écrirait pas dans un modèle partagé), le lien ne se pose ni ne se défait ;
//  - un lien dont le modèle n'existe plus (supprimé, ou devenu d'un autre type) est sans effet : ni repère ni groupe, le tableau est un tableau comme un autre.
// Une grille n'a jamais de lien, ni une zone d'en-tête ou de pied de page : un tableau lié qui y est collé le perd.
const LinkedTable = (function () {
  const ATTR = 'linkedTemplate';
  const DOM_ATTR = 'data-linked-template';
  // Marque les transactions que ce module écrit (pose, détachement, réparation) : le garde-fou les laisse passer.
  const OWN_META = 'linkedTable';
  const MARK_CLASS = 'pp-linked-table';
  const LOCKED_CLASS = 'pp-linked-locked';

  let libs = null;
  function configure(deps) { libs = deps; }

  // Le numéro d'un modèle tel que le HTML l'écrit : un entier positif, sinon rien.
  function idOf(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  const isLinked = node => !!node && !!node.type && node.type.name === 'table' && !!node.attrs[ATTR];

  // L'attribut du tableau : `data-linked-template` s'écrit sur le <table> et se relit au chargement (le schéma est le vrai filtre : un attribut qu'il ne
  // déclare pas se perdrait).
  function withAttributes(TableExtension) {
    return TableExtension.extend({
      addAttributes() {
        const parent = this.parent ? this.parent() : {};
        return Object.assign({}, parent, {
          [ATTR]: {
            default: null,
            parseHTML: el => idOf(el.getAttribute(DOM_ATTR)),
            renderHTML: attrs => (attrs[ATTR] ? { [DOM_ATTR]: String(attrs[ATTR]) } : {}),
          },
        });
      },
    });
  }

  // Le modèle Grille que ce numéro désigne, ou null (supprimé, devenu d'un autre type, liste pas encore lue).
  function modelOf(id) {
    const model = id ? Templates.byId(id) : null;
    return model && model.typeModele === GridEditor.TYPE ? model : null;
  }

  // Un tableau dont le lien compte : il porte un numéro et ce modèle Grille existe encore. Les autres sont des tableaux comme les autres.
  const isLive = node => isLinked(node) && !!modelOf(node.attrs[ATTR]);

  const { linkedTables, linkedAround, tableAt, insideTable } = (function () {
    // Où sont les tableaux liés du document, et lequel porte la sélection

    // Un tableau lié ne se trouve jamais dans un autre tableau : la recherche ne descend pas dans les tableaux (un document de quarante tableaux de deux mille
    // lignes ne se parcourt pas à chaque frappe). `below` retient, par nœud, s'il en contient un : un nœud que la frappe n'a pas touché garde son résultat.
    // Ne dépend que du document (le numéro posé), jamais de la liste des modèles.
    const below = new WeakMap();
    function holdsLinked(node) {
      if (node.isTextblock || node.isLeaf) return false;
      let found = below.get(node);
      if (found !== undefined) return found;
      found = false;
      for (let i = 0; i < node.childCount && !found; i++) {
        const child = node.child(i);
        found = isLinked(child) || (child.type.name !== 'table' && holdsLinked(child));
      }
      below.set(node, found);
      return found;
    }

    // Les tableaux qui portent un numéro de modèle dans `doc`, dans l'ordre du document : { node, pos } (pos : juste avant le tableau).
    function linkedTables(doc) {
      const list = [];
      (function walk(parent, start) {
        parent.forEach((child, offset) => {
          const pos = start + offset;
          if (isLinked(child)) list.push({ node: child, pos });
          else if (child.type.name !== 'table' && holdsLinked(child)) walk(child, pos + 1);
        });
      })(doc, 0);
      return list;
    }

    // `$pos` est-il dans un tableau, quel qu'il soit ?
    function insideTable($pos) {
      for (let depth = 1; depth <= $pos.depth; depth++) if ($pos.node(depth).type.name === 'table') return true;
      return false;
    }

    // Le tableau lié qui entoure `$pos` : le plus extérieur des tableaux qui l'entourent, quand son lien compte.
    function linkedAround($pos) {
      for (let depth = 1; depth <= $pos.depth; depth++) {
        const node = $pos.node(depth);
        if (node.type.name === 'table') return isLive(node) ? { node, pos: $pos.before(depth) } : null;
      }
      return null;
    }

    // Le tableau lié qui porte la sélection (le curseur dans une case, des cases choisies, le tableau choisi en entier) : { node, pos }, ou null.
    function tableAt(state) {
      const { selection } = state;
      if (selection.node && selection.node.type.name === 'table') {
        return !insideTable(selection.$from) && isLive(selection.node) ? { node: selection.node, pos: selection.from } : null;
      }
      return linkedAround(selection.$anchorCell ? selection.$headCell : selection.$head);
    }

    return { linkedTables, linkedAround, tableAt, insideTable };
  })();

  // ---- Ce que refuse le lien -------------------------------------------------------------------------------------------------------------------------

  // Le suivi des modifications verrouille le tableau lié : une suggestion (texte barré, texte ajouté) ne s'écrirait pas dans un modèle que d'autres documents
  // partagent. Clé de la raison, ou null.
  function lockReason() { return Editor.isTrackChangesOn() ? 'linkedTable.lockedTracked' : null; }

  // Une zone d'en-tête ou de pied de page s'édite dans le même éditeur (js/header-footer-preview.js) : elle n'a pas de lien, comme une grille.
  const inZone = () => !!HeaderFooterPreview.getHfMode();

  // Pourquoi un tableau lié ne se pose pas ici (clé de la raison), ou null : suivi allumé, une zone d'en-tête ou de pied de page, ou le curseur est déjà dans un
  // tableau (un tableau lié ne se pose pas dans une case, et un autre tableau lié ne vient pas dans celui-ci).
  function placeBlock(editor) {
    if (Editor.isTrackChangesOn()) return 'linkedTable.rowTracked';
    if (inZone()) return 'linkedTable.rowZone';
    const { selection } = editor.state;
    if (insideTable(selection.$anchorCell ? selection.$headCell : selection.$head) || (selection.node && selection.node.type.name === 'table')) return 'linkedTable.rowInTable';
    return null;
  }

  const { refuses } = (function () {
    // Le garde-fou des transactions : rien d'interdit dans un tableau lié, et il ne bouge pas sous le suivi

    function carries(fragment, test) {
      let found = false;
      fragment.descendants(node => {
        if (found) return false;
        if (test(node)) found = true;
        return !found;
      });
      return found;
    }

    // Une pose ou un détachement du module, un chargement, un Annuler et un Rétablir (ils rendent un état qui s'accordait déjà) ne sont pas refusés ; tout
    // le reste l'est quand un pas, pris dans le document tel qu'il était avant lui, tombe dans un tableau lié et :
    //  - le suivi est allumé (la marque d'une suggestion, une insertion, une suppression : tout pas qui touche le tableau) ;
    //  - le contenu qu'il met en place est refusé par une grille (un tableau, des colonnes, un encadré...) ;
    //  - ou il met un tableau lié dans un tableau.
    function refuses(tr) {
      const tracking = Editor.isTrackChangesOn();
      for (let i = 0; i < tr.steps.length; i++) {
        const step = tr.steps[i];
        const from = step.from != null ? step.from : step.pos;
        if (from == null) continue;
        const doc = tr.docs[i];
        const to = step.to != null ? step.to : from;
        const $from = doc.resolve(from);
        const inside = !!linkedAround($from);
        if (tracking && (inside || linkedAround(doc.resolve(to)))) return true;
        const slice = step.slice ? step.slice.content : null;
        if (!slice) continue;
        if (inside && carries(slice, GridEditor.isForbiddenNode)) return true;
        if (insideTable($from) && carries(slice, isLive)) return true;
      }
      return false;
    }

    return { refuses };
  })();

  // ---- Après une transaction : un seul lien par modèle -----------------------------------------------------------------------------------------------

  // La place, dans le document d'après `trs`, de chaque tableau lié du document d'avant : numéro du modèle -> position.
  function originalPositions(trs, oldDoc) {
    const maps = [];
    trs.forEach(tr => tr.mapping.maps.forEach(map => maps.push(map)));
    const places = new Map();
    linkedTables(oldDoc).forEach(({ node, pos }) => places.set(node.attrs[ATTR], maps.reduce((at, map) => map.map(at, 1), pos)));
    return places;
  }

  // Un tableau lié qui vient d'entrer dans le document (collé, glissé, rendu par Annuler) peut être le second d'un même modèle, ou celui d'un modèle qui n'existe
  // plus, ou arriver dans une grille ou une zone d'en-tête ou de pied de page : il perd son lien, ses cases restent. Le tableau qui était déjà là garde le sien,
  // où qu'il soit par rapport à la copie. Rien à regarder tant qu'aucun pas ne met de tableau lié en place (la frappe ne coûte rien).
  function tidy(trs, oldState, state) {
    const arrived = trs.some(tr => tr.docChanged && !tr.getMeta('preventUpdate') && !tr.getMeta(OWN_META)
      && tr.steps.some(step => step.slice && step.slice.content.size && containsLinked(step.slice.content)));
    if (!arrived) return null;
    const grid = GridEditor.isActive() || inZone();
    const byModel = new Map();
    linkedTables(state.doc).forEach(entry => {
      const id = entry.node.attrs[ATTR];
      if (!byModel.has(id)) byModel.set(id, []);
      byModel.get(id).push(entry);
    });
    const before = originalPositions(trs, oldState.doc);
    let tr = null;
    byModel.forEach((entries, id) => {
      const keeper = grid || !modelOf(id) ? null : (entries.find(entry => entry.pos === before.get(id)) || entries[0]);
      entries.forEach((entry) => {
        if (entry === keeper) return;
        if (!tr) tr = state.tr.setMeta(OWN_META, 'tidy');
        tr.setNodeAttribute(entry.pos, ATTR, null);
      });
    });
    return tr;
  }
  function containsLinked(fragment) {
    let found = false;
    fragment.descendants(node => {
      if (found) return false;
      if (isLinked(node)) found = true;
      return !found;
    });
    return found;
  }

  // ---- Le repère dans la page --------------------------------------------------------------------------------------------------------------------------

  // Une décoration de l'éditeur seulement (rien n'en reste dans le document ni dans les exports) : la classe porte le filet d'accent du bord gauche
  // (css/linked-table.css), et le nom du modèle, lu dans la liste des modèles, est dit aux lecteurs d'écran. Rien pour un lien dont le modèle n'existe plus.
  function marks(state) {
    if (GridEditor.isActive() || inZone()) return null;
    const { Decoration, DecorationSet } = libs;
    const locked = !!lockReason();
    const decorations = [];
    linkedTables(state.doc).forEach(({ node, pos }) => {
      const model = modelOf(node.attrs[ATTR]);
      if (!model) return;
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {
        class: MARK_CLASS + (locked ? ' ' + LOCKED_CLASS : ''),
        role: 'group',
        'aria-label': I18n.t('linkedTable.aria', { name: model.nom }),
      }));
    });
    return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
  }

  function createExtension(Extension) {
    const { Plugin, PluginKey } = libs;
    return Extension.create({
      name: 'linkedTable',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('linkedTable'),
          filterTransaction(tr) {
            if (!tr.docChanged || GridEditor.isActive() || inZone() || tr.getMeta(OWN_META) || tr.getMeta('history$') || tr.getMeta('preventUpdate') || TrackChanges.isSkipped(tr)) return true;
            return !refuses(tr);
          },
          appendTransaction(trs, oldState, newState) { return tidy(trs, oldState, newState); },
          props: { decorations: marks },
        })];
      },
    });
  }

  // ---- La barre du tableau -----------------------------------------------------------------------------------------------------------------------------

  // Ce que la barre du tableau montre du lien, selon la sélection : { at, model, name, locked } (`locked` : la clé de la raison du verrou, ou null), ou null
  // quand le tableau du curseur n'est pas lié à un modèle qui existe (ou dans une grille).
  function status(state) {
    if (GridEditor.isActive() || inZone()) return null;
    const at = tableAt(state);
    const model = at ? modelOf(at.node.attrs[ATTR]) : null;
    return model ? { at, model, name: model.nom, locked: lockReason() } : null;
  }

  // Le curseur est-il dans un tableau lié (dont le modèle existe) ? Les boutons qui poseraient ce qu'une grille refuse se grisent alors.
  function cursorIn(state) { return !GridEditor.isActive() && !inZone() && !!tableAt(state); }

  // « Détacher » : le tableau garde ses cases, il n'est plus que celui du document. Un seul Annuler. Faux, sans rien changer, sous le suivi des modifications.
  function detach(editor) {
    if (!editor || !editor.isEditable || lockReason()) return false;
    const at = tableAt(editor.state);
    if (!at) return false;
    editor.view.dispatch(editor.state.tr.setNodeAttribute(at.pos, ATTR, null).setMeta(OWN_META, 'detach'));
    return true;
  }

  // ---- La pose ---------------------------------------------------------------------------------------------------------------------------------------

  // Le tableau du modèle, lu comme au chargement d'un modèle (HTML assaini, schéma de l'éditeur) et marqué de son lien ; null quand le modèle n'a pas de tableau.
  function tableNodeOf(editor, model) {
    const body = HtmlSanitize.parseInert(model.contenu || '');
    if (!body.querySelector('table')) return null;
    const first = libs.PMDOMParser.fromSchema(editor.schema).parse(body).firstChild;
    if (!first || first.type.name !== 'table') return null;
    return first.type.create(Object.assign({}, first.attrs, { [ATTR]: model.id }), first.content, first.marks);
  }

  // Pose la copie du tableau de `model` à la place de la sélection, comme le bouton « Tableau », et met le curseur dans sa première case (la barre du tableau
  // s'ouvre sur le lien). Faux, sans rien changer, quand le modèle est déjà lié dans le document, n'a pas de tableau ou que la sélection ne s'y prête pas.
  function insert(editor, model) {
    if (!editor || !editor.isEditable || GridEditor.isActive() || placeBlock(editor)) return false;
    const live = model ? modelOf(model.id) : null;
    if (!live || linkedTables(editor.state.doc).some(({ node }) => node.attrs[ATTR] === live.id)) return false;
    const node = tableNodeOf(editor, live);
    if (!node) return false;
    editor.view.dispatch(editor.state.tr.replaceSelectionWith(node).scrollIntoView().setMeta(OWN_META, 'place'));
    const placed = linkedTables(editor.state.doc).find(entry => entry.node.attrs[ATTR] === live.id);
    if (placed) editor.view.dispatch(editor.state.tr.setSelection(libs.TextSelection.near(editor.state.doc.resolve(placed.pos + 1), 1)));
    editor.view.focus();
    return true;
  }

  const { openPicker } = (function () {
    // La liste avec recherche des modèles Grille (js/search-select.js), ouverte à côté de la ligne du menu

    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    let open = null; // { host, search } tant que la liste est ouverte

    function close(instance) {
      if (!open || (instance && instance !== open)) return;
      const { host, search } = open;
      open = null;
      try { search.destroy(); } catch (e) { /* déjà défait */ }
      host.remove();
    }

    // Le rectangle de la ligne du menu ; le menu se referme dès que la souris le quitte (ligne en display:none, rectangle nul) : celui du bouton Tableau sert
    // alors.
    function anchorRect(anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      return rect.width || rect.height ? rect : document.getElementById('v2-btn-table').getBoundingClientRect();
    }

    // Pourquoi ce modèle ne peut pas être posé (clé de la raison), ou null.
    function unavailable(model, linked) {
      if (linked.has(model.id)) return 'linkedTable.pickUsed';
      return /<table[\s>]/i.test(model.contenu || '') ? null : 'linkedTable.pickEmpty';
    }

    // Faux si la liste avec recherche est indisponible (fichier introuvable, erreur) : il n'y a pas de liste simple de repli, rien ne s'ouvre.
    async function openPicker(editor, anchorEl) {
      if (!editor || GridEditor.isActive() || placeBlock(editor)) return false;
      // Les modèles et leur contenu sont relus : la liste du moment, pas celle d'il y a quelques minutes (une grille faite ou changée ailleurs).
      try { await Templates.loadAll(); } catch (e) { /* hors ligne : le cache d'avant sert */ }
      if (placeBlock(editor)) return false;
      const models = Templates.getCached().filter(t => t.typeModele === GridEditor.TYPE).sort((a, b) => collator.compare(a.nom, b.nom));
      const linked = new Set(linkedTables(editor.state.doc).map(({ node }) => node.attrs[ATTR]));
      let host = null;
      let instance = null;
      try {
        close();
        host = document.createElement('div');
        host.id = 'v2-linked-table-search';
        const select = document.createElement('select');
        models.forEach((model) => {
          const option = document.createElement('option');
          option.value = String(model.id);
          option.textContent = model.nom;
          option.dataset.name = model.nom;
          const reason = unavailable(model, linked);
          if (reason) option.dataset.unavailable = I18n.t(reason);
          select.appendChild(option);
        });
        host.appendChild(select);
        document.body.appendChild(host);
        select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
        const search = SearchSelect.attach(select, {
          popup: true,
          anchor: () => anchorRect(anchorEl),
          searchPlaceholder: () => I18n.t('linkedTable.search'),
          emptyText: () => I18n.t(models.length ? 'linkedTable.noMatch' : 'linkedTable.none'),
          // Défait après l'évènement en cours : un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte. Le focus revient à
          // l'éditeur après Échap ou un choix, pas après un clic ailleurs.
          onClose: (refocus) => { if (refocus) editor.commands.focus(); setTimeout(() => close(instance), 0); },
        });
        instance = { host, search };
        open = instance;
        select.addEventListener('change', () => { insert(editor, models.find(model => String(model.id) === select.value)); });
        search.open();
        return true;
      } catch (e) {
        console.warn('[LinkedTable] liste avec recherche indisponible', e);
        if (instance) close(instance); else if (host) host.remove();
        return false;
      }
    }

    return { openPicker };
  })();

  // La ligne « Tableau d'un modèle Grille… » du menu du bouton Tableau : grisée avec sa raison en info-bulle (suivi des modifications, curseur dans un tableau),
  // comme la ligne « Garder avec le suivant » ; le grisé du mode (grille, e-mail, macro-modèle) est celui du bouton Tableau, dont le menu ne s'ouvre plus
  // (css/linked-table.css).
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const reason = placeBlock(editor);
    row.setAttribute('aria-disabled', reason ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!reason);
    if (reason) row.title = I18n.t(reason); else row.removeAttribute('title');
  }

  return { ATTR, configure, withAttributes, createExtension, modelOf, linkedTables, tableAt, status, cursorIn, lockReason, placeBlock, detach, insert, openPicker, syncRow };
})();
