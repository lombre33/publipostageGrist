// Tableau lié à un modèle Grille (09/10, lot 6 sur 6 du tableau de document, « En direct » : un tableau intégré au document qui est en fait un modèle Grille, une seule
// copie qui change partout). Un tableau de document peut être la copie du tableau d'un modèle Grille : il porte le numéro de ce
// modèle (`linkedTemplate`, `data-linked-template` dans le HTML enregistré) et ses cases sont celles du modèle au moment de la pose. Le HTML du document garde donc
// les cases : la Lecture, le PDF, le Word et les lots de macro-modèles les lisent comme celles de n'importe quel tableau, sans rien savoir du lien (un attribut qu'ils
// ne connaissent pas est ignoré).
//
// La pose du lien : la ligne « Tableau d'un modèle Grille… » du menu du bouton « Tableau » (au survol, comme « Image depuis une variable » sous le bouton
// Image ; le menu « Lien et blocs de contenu » n'a plus de place dans 700x400), qui ouvre une liste avec recherche des modèles Grille (ceux déjà liés dans le
// document grisés avec leur raison), le repère dans la page, le bouton du lien de la barre du tableau (son menu : le nom du modèle, « Mettre à jour depuis le
// modèle », « Envoyer au modèle », « Détacher ») et les règles qui font tenir le lien :
//  - ses cases suivent celles d'une grille (GridEditor.isForbiddenNode : ni second tableau, ni colonnes, ni sommaire, ni citation, encadré, bloc de code...), pour
//    que ce qu'on y écrit puisse s'écrire dans le modèle ; le garde-fou refuse la transaction qui en ajouterait (collage et clavier compris), les boutons concernés
//    se grisent ;
//  - un modèle n'est lié qu'une fois par document : une copie du tableau (Ctrl+C, Ctrl+V) perd son lien ;
//  - un tableau lié se pose hors de tout autre tableau (les cases d'un tableau ne contiennent pas de tableau lié) ;
//  - suivi des modifications allumé : le tableau est verrouillé (une suggestion ne s'écrirait pas dans un modèle partagé), le lien ne se pose ni ne se défait ;
//  - un lien dont le modèle n'existe plus (supprimé, ou devenu d'un autre type) est sans effet : ni repère ni groupe, le tableau est un tableau comme un autre.
// Une grille n'a jamais de lien, ni une zone d'en-tête ou de pied de page : un tableau lié qui y est collé le perd.
// Les deux sens du lien se font à la main, depuis ce menu : « Mettre à jour depuis le modèle » remplace les cases du tableau par celles du modèle (un seul Annuler
// les rend), « Envoyer au modèle » écrit le tableau du document dans le modèle (après confirmation : il est partagé), sans toucher à ses autres colonnes. Les
// marques de commentaire ne passent jamais d'un côté à l'autre : leur fil est celui du document où elles sont posées.
const LinkedTable = (function () {
  const ATTR = 'linkedTemplate';
  const DOM_ATTR = 'data-linked-template';
  // Marque les transactions que ce module écrit (pose, détachement, réparation) : le garde-fou les laisse passer.
  const OWN_META = 'linkedTable';
  const MARK_CLASS = 'pp-linked-table';
  const LOCKED_CLASS = 'pp-linked-locked';

  let libs = null;
  function configure(deps) { libs = deps; }
  // Ce que la page prête au module (js/main.js) : écrire dans la ligne d'état. Sans elle (ce module seul, en test), les messages ne vont nulle part.
  let host = { setStatus() {} };
  function wire(callbacks) { host = Object.assign({}, host, callbacks); }
  const say = (key, vars, isError) => host.setStatus(I18n.t(key, vars), !!isError);
  const fail = (key, vars) => { say(key, vars, true); return false; };

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

  // Les modèles relus dans Grist avant d'en lire un contenu : celui du moment, pas celui d'il y a quelques minutes (un modèle changé dans un autre document ou par une autre
  // personne). Hors ligne, le cache d'avant sert.
  async function refreshModels() {
    try { await Templates.loadAll(); } catch (e) { /* hors ligne : le cache d'avant sert */ }
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

  // Les marques de commentaire d'un morceau de HTML, retirées en gardant leur texte : le fil d'un commentaire est celui du modèle ou du document où il est posé, jamais
  // d'un autre.
  function unwrapComments(root) {
    root.querySelectorAll('span.comment-mark').forEach(span => span.replaceWith(...span.childNodes));
  }

  // Le tableau du modèle, lu comme au chargement d'un modèle (HTML assaini, schéma de l'éditeur) et marqué de son lien ; null quand le modèle n'a pas de tableau.
  function tableNodeOf(editor, model) {
    const body = HtmlSanitize.parseInert(model.contenu || '');
    if (!body.querySelector('table')) return null;
    unwrapComments(body);
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
      await refreshModels();
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

  const { pull, push, usedBy } = (function () {
    // Les deux sens du lien, à la main : mettre à jour le tableau du document depuis son modèle, envoyer le tableau du document à son modèle

    // Une action à la fois : un double clic, ou une seconde action pendant la lecture des modèles, ne part pas deux fois.
    let busy = false;

    // Le HTML d'un tableau tel que le modèle le garde : celui de editor.getHTML() pour ce nœud (le sérialiseur du schéma), sans le lien (un modèle n'est lié à rien) et sans
    // les marques de commentaire. Écrit dans un document inerte : une <img> créée dans la page charge son adresse même détachée.
    function htmlOf(editor, node) {
      const inert = document.implementation.createHTMLDocument('');
      const bare = node.type.create(Object.assign({}, node.attrs, { [ATTR]: null }), node.content, node.marks);
      const dom = libs.PMDOMSerializer.fromSchema(editor.schema).serializeNode(bare, { document: inert });
      unwrapComments(dom);
      return dom.outerHTML;
    }

    // Les modèles, hors celui qui est ouvert, qui posent un tableau lié à ce modèle : lus dans les contenus du cache (une grille n'en pose jamais, un macro-modèle n'a pas de
    // HTML). Le numéro est cherché avec ses guillemets : « 1 » n'est pas « 12 ».
    function usedBy(id) {
      const marker = DOM_ATTR + '="' + id + '"';
      return Templates.getCached().filter(t => t.typeModele !== 'macro' && t.typeModele !== GridEditor.TYPE && !Templates.isCurrent(t.id) && String(t.contenu || '').includes(marker));
    }

    // Le lien du tableau sous le curseur quand une action peut partir : éditeur qui écrit, aucune autre action en cours, suivi des modifications éteint ; sinon null.
    function ready(editor) {
      if (!editor || !editor.isEditable || busy || lockReason()) return null;
      return status(editor.state);
    }

    // Le tableau lié à ce modèle dans le document d'à présent : le curseur, le texte, le document entier ont pu changer pendant que les modèles se relisaient.
    const tableOf = (editor, id) => linkedTables(editor.state.doc).find(({ node }) => node.attrs[ATTR] === id);

    // La case du curseur dans ce tableau : { row, col } (rang de la ligne, rang de la case dans sa ligne), ou null quand la sélection est ailleurs ou sur le tableau entier.
    function cellPlace(state, at) {
      const { selection } = state;
      const $pos = selection.$anchorCell ? selection.$headCell : selection.$head;
      for (let depth = 1; depth < $pos.depth; depth++) {
        if ($pos.node(depth).type.name === 'table' && $pos.before(depth) === at.pos) return { row: $pos.index(depth), col: $pos.index(depth + 1) };
      }
      return null;
    }

    // Une sélection de texte au début de la case (row, col) du tableau en `pos` dans `tr.doc` (rangs bornés aux dimensions du tableau d'après).
    function cursorTo(tr, pos, place) {
      const table = tr.doc.nodeAt(pos);
      if (!table || table.type.name !== 'table' || !table.childCount) return;
      const row = Math.min(place.row, table.childCount - 1);
      let at = pos + 1;
      for (let r = 0; r < row; r++) at += table.child(r).nodeSize;
      const cells = table.child(row);
      const col = Math.min(place.col, cells.childCount - 1);
      at += 1;
      for (let c = 0; c < col; c++) at += cells.child(c).nodeSize;
      tr.setSelection(libs.TextSelection.near(tr.doc.resolve(at + 1), 1));
    }

    // « Mettre à jour depuis le modèle » : les cases du tableau deviennent celles du modèle (relu dans Grist), le curseur reste dans la même case, un seul Annuler les rend.
    // Un tableau déjà identique n'est pas touché (ses commentaires restent). Vrai si le tableau est (devenu) celui du modèle ; faux, sans rien changer, quand l'action est
    // refusée (suivi allumé, une autre en cours) ou impossible (modèle ou tableau introuvable).
    async function pull(editor) {
      const link = ready(editor);
      if (!link) return false;
      busy = true;
      const id = link.model.id;
      try {
        await refreshModels();
        const model = modelOf(id);
        if (!model) return fail('linkedTable.gone', { name: link.name });
        const found = tableOf(editor, id);
        if (!found || lockReason()) return false;
        const node = tableNodeOf(editor, model);
        if (!node) return fail('linkedTable.noTable', { name: model.nom });
        if (htmlOf(editor, found.node) === htmlOf(editor, node)) { say('linkedTable.upToDate', { name: model.nom }); return true; }
        const place = cellPlace(editor.state, found);
        const tr = editor.state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, node).setMeta(OWN_META, 'pull');
        if (place) cursorTo(tr, found.pos, place);
        editor.view.dispatch(tr);
        say('linkedTable.pulled', { name: model.nom });
        return true;
      } catch (e) {
        console.warn('[LinkedTable] mise à jour depuis le modèle impossible', e);
        return fail('linkedTable.pullFailed');
      } finally { busy = false; }
    }

    // « Envoyer au modèle » : le tableau du document devient celui du modèle, que d'autres documents posent aussi : une confirmation, qui dit dans combien d'autres modèles il est
    // posé. Seuls le contenu et la date du modèle sont écrits (Templates.saveContent). Vrai si le modèle a (déjà) ce tableau ; faux, sans rien écrire, quand l'action est
    // refusée, impossible ou annulée.
    async function push(editor) {
      const link = ready(editor);
      if (!link) return false;
      busy = true;
      const id = link.model.id;
      try {
        await refreshModels();
        const model = modelOf(id);
        if (!model) return fail('linkedTable.gone', { name: link.name });
        const found = tableOf(editor, id);
        if (!found || lockReason()) return false;
        const current = tableNodeOf(editor, model);
        if (current && htmlOf(editor, current) === htmlOf(editor, found.node)) { say('linkedTable.upToDate', { name: model.nom }); return true; }
        const others = usedBy(id).length;
        const message = [I18n.t('linkedTable.pushMessage', { name: model.nom }), others ? I18n.t('linkedTable.pushOthers', { n: others }) : ''].filter(Boolean).join(' ');
        const confirmed = await Dialogs.confirm({ title: I18n.t('linkedTable.pushTitle'), message, confirmLabel: I18n.t('linkedTable.pushConfirm') });
        if (!confirmed) return false;
        // La fenêtre est restée ouverte : le document a pu être rechargé, le suivi allumé. Ce qui part est le tableau d'après la réponse.
        const sent = tableOf(editor, id);
        if (!sent || lockReason()) return false;
        await Templates.saveContent(id, htmlOf(editor, sent.node));
        say('linkedTable.pushed', { name: model.nom });
        return true;
      } catch (e) {
        console.warn('[LinkedTable] envoi au modèle impossible', e);
        return fail('linkedTable.pushFailed', { name: link.name });
      } finally { busy = false; }
    }

    return { pull, push, usedBy };
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

  return { ATTR, configure, wire, withAttributes, createExtension, modelOf, linkedTables, tableAt, status, cursorIn, lockReason, placeBlock, detach, insert, openPicker, pull, push, usedBy, syncRow };
})();
