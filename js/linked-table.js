// Tableau lié à un modèle Grille (09/10, lot 6 sur 6 du tableau de document, « En direct » : un tableau intégré au document qui est en fait un modèle Grille, une seule
// copie qui change partout). Un tableau de document peut être la copie du tableau d'un modèle Grille : il porte le numéro de ce
// modèle (`linkedTemplate`, `data-linked-template` dans le HTML enregistré) et ses cases sont celles du modèle au moment de la pose. Le HTML du document garde donc
// les cases : la Lecture, le PDF, le Word et les lots de macro-modèles les lisent comme celles de n'importe quel tableau, sans rien savoir du lien (un attribut qu'ils
// ne connaissent pas est ignoré).
//
// La pose du lien : la ligne « Tableau d'un modèle Grille… » du menu du bouton « Tableau » (au survol, comme « Image depuis une variable » sous le bouton
// Image ; le menu « Lien et blocs de contenu » n'a plus de place dans 700x400), qui ouvre une liste avec recherche des modèles Grille (ceux déjà liés dans le
// document grisés avec leur raison), le repère dans la page, le bouton du lien de la barre du tableau (son menu : le nom du modèle, « Mettre à jour depuis le
// modèle », « Envoyer au modèle », « Ouvrir le modèle », « Détacher ») et les règles qui font tenir le lien :
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
// marques de commentaire ne passent jamais d'un côté à l'autre : leur fil est celui du document où elles sont posées. « Ouvrir le modèle » ouvre le modèle Grille dans
// l'éditeur (js/main.js:openLinkedModel) et un bandeau ramène au document, le curseur dans la même case du tableau (reveal).
// L'identité du lien (lot 6c-1) : le numéro d'un modèle ne dit pas de quel modèle il s'agit (Grist peut le redonner à un autre une fois la ligne supprimée, et un tableau copié d'un autre
// document en porte un qui désigne ici un modèle sans rapport). Le tableau porte donc aussi le jeton du modèle (`linkedKey`, `data-linked-key` ; Templates.ensureToken) et le lien ne compte
// que si les deux sont égaux. Un tableau lié avant ce lot n'a pas de jeton (lien ancien) : il compte, à la main seulement, et la première action à la main qui réussit le lui donne.
// Le document suit le modèle (lot 6c-2a) : un tableau à jeton porte aussi sa base (`linkedBase`, `data-linked-base`) : deux empreintes prises à la dernière synchro, celle du tableau du
// document sans ses largeurs de colonnes (la page les rogne : ce n'est pas une modification de la personne) et celle du tableau du modèle avec ses largeurs (une largeur changée dans
// le modèle doit arriver). Au chargement du document et à chaque lecture de l'enregistrement automatique, chaque tableau à jeton est comparé à sa base et à son modèle (planOf) : le modèle
// a changé et pas ce document, le tableau prend celui du modèle ; le document a changé et pas le modèle, rien ne part (le lot 6c-2b l'enverra) ; les deux ont changé, ou la base manque
// et ils diffèrent, rien ne s'écrit et la ligne d'état le dit. La relève n'entre pas dans l'historique et ne rend pas le document « à enregistrer » (ouvrir un document n'écrit rien) ; elle garde les fils de commentaires des cases dont le texte n'a pas changé (keepComments).
// Un lien ancien (sans jeton) reste à la main. Les sorties hors de l'éditeur (macro-modèle, export en lot d'un autre modèle) lisent le modèle pour un tableau resté en arrière (resolveHtml).
const LinkedTable = (function () {
  const ATTR = 'linkedTemplate';
  const DOM_ATTR = 'data-linked-template';
  const KEY = 'linkedKey';
  const DOM_KEY = 'data-linked-key';
  const BASE = 'linkedBase';
  const DOM_BASE = 'data-linked-base';
  // Marque les transactions que ce module écrit (pose, détachement, réparation) : le garde-fou les laisse passer.
  const OWN_META = 'linkedTable';
  const MARK_CLASS = 'pp-linked-table';
  const LOCKED_CLASS = 'pp-linked-locked';

  let libs = null;
  function configure(deps) { libs = deps; }
  // Ce que la page prête au module (js/main.js) : écrire dans la ligne d'état (`setStatus`) et ouvrir un modèle à l'écran (`openModel`). Sans elle (ce module seul, en test), les
  // messages ne vont nulle part.
  let host = { setStatus() {}, openModel() {} };
  function wire(callbacks) { host = Object.assign({}, host, callbacks); }
  const say = (key, vars, isError) => host.setStatus(I18n.t(key, vars), !!isError);
  const fail = (key, vars) => { say(key, vars, true); return false; };

  // Le numéro d'un modèle tel que le HTML l'écrit : un entier positif, sinon rien.
  function idOf(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  // Le jeton d'un modèle tel que le HTML l'écrit (Templates.ensureToken) : 8 à 64 lettres ou chiffres, sinon rien.
  function keyOf(value) {
    const text = String(value == null ? '' : value);
    return /^[A-Za-z0-9]{8,64}$/.test(text) ? text : null;
  }

  // La base d'un tableau lié telle que le HTML l'écrit : deux empreintes de 8 à 12 lettres et chiffres séparées par un point (celle du tableau du document, celle du tableau du modèle),
  // sinon rien. `parseBase` : { doc, model }, ou null.
  function baseOf(value) {
    const text = String(value == null ? '' : value);
    return /^[a-z0-9]{8,12}\.[a-z0-9]{8,12}$/.test(text) ? text : null;
  }
  function parseBase(value) {
    const text = baseOf(value);
    if (!text) return null;
    const [doc, model] = text.split('.');
    return { doc, model };
  }
  const makeBase = (docHash, modelHash) => docHash + '.' + modelHash;

  // Une empreinte de 53 bits (cyrb53) d'un texte, en base 36 sur 11 signes : de quoi voir qu'un tableau n'est plus le même, pas de quoi se protéger de quelqu'un.
  function hashOf(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0');
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
          [KEY]: {
            default: null,
            // Un jeton sans numéro de modèle ne désigne rien : il ne reste pas seul.
            parseHTML: el => (idOf(el.getAttribute(DOM_ATTR)) ? keyOf(el.getAttribute(DOM_KEY)) : null),
            renderHTML: attrs => (attrs[ATTR] && attrs[KEY] ? { [DOM_KEY]: String(attrs[KEY]) } : {}),
          },
          [BASE]: {
            default: null,
            // Une base sans numéro de modèle ni jeton ne désigne rien : elle ne reste pas seule.
            parseHTML: el => (idOf(el.getAttribute(DOM_ATTR)) && keyOf(el.getAttribute(DOM_KEY)) ? baseOf(el.getAttribute(DOM_BASE)) : null),
            renderHTML: attrs => (attrs[ATTR] && attrs[KEY] && baseOf(attrs[BASE]) ? { [DOM_BASE]: String(attrs[BASE]) } : {}),
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

  // Le modèle Grille auquel CE tableau est lié, ou null : son numéro désigne un modèle Grille qui existe et son jeton est celui de ce modèle. Un jeton qui n'est pas le sien (ou que le modèle
  // n'a pas) est un numéro repris par un autre modèle ou un tableau venu d'un autre document : pas un lien. Un tableau sans jeton (lien d'avant le lot 6c-1) compte pour son numéro.
  function modelFor(node) {
    const model = isLinked(node) ? modelOf(node.attrs[ATTR]) : null;
    if (!model) return null;
    const key = node.attrs[KEY];
    return !key || key === model.jeton ? model : null;
  }

  // Un tableau dont le lien compte (cf. modelFor). Les autres sont des tableaux comme les autres.
  const isLive = node => !!modelFor(node);

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

  // Les tableaux du document dont le lien compte (cf. modelFor), dans l'ordre du document.
  const liveTables = doc => linkedTables(doc).filter(({ node }) => isLive(node));

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
    liveTables(oldDoc).forEach(({ node, pos }) => places.set(node.attrs[ATTR], maps.reduce((at, map) => map.map(at, 1), pos)));
    return places;
  }

  // Un tableau lié qui vient d'entrer dans le document (collé, glissé, rendu par Annuler) peut être le second d'un même modèle, ou celui d'un modèle qui n'existe
  // plus ou dont le jeton n'est pas celui du modèle (un tableau copié d'un autre document), ou arriver dans une grille ou une zone d'en-tête ou de pied de page : il
  // perd son lien et son jeton, ses cases restent. Le tableau qui était déjà là garde le sien, où qu'il soit par rapport à la copie. Rien à regarder tant qu'aucun
  // pas ne met de tableau lié en place (la frappe ne coûte rien).
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
      const alive = grid ? [] : entries.filter(entry => isLive(entry.node));
      const keeper = alive.find(entry => entry.pos === before.get(id)) || alive[0] || null;
      entries.forEach((entry) => {
        if (entry === keeper) return;
        if (!tr) tr = state.tr.setMeta(OWN_META, 'tidy');
        tr.setNodeAttribute(entry.pos, ATTR, null);
        if (entry.node.attrs[KEY]) tr.setNodeAttribute(entry.pos, KEY, null);
        if (entry.node.attrs[BASE]) tr.setNodeAttribute(entry.pos, BASE, null);
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
      const model = modelFor(node);
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
    const model = at ? modelFor(at.node) : null;
    return model ? { at, model, name: model.nom, locked: lockReason() } : null;
  }

  // Le curseur est-il dans un tableau lié (dont le modèle existe) ? Les boutons qui poseraient ce qu'une grille refuse se grisent alors.
  function cursorIn(state) { return !GridEditor.isActive() && !inZone() && !!tableAt(state); }

  // « Détacher » : le tableau garde ses cases, il n'est plus que celui du document. Un seul Annuler. Faux, sans rien changer, sous le suivi des modifications.
  function detach(editor) {
    if (!editor || !editor.isEditable || lockReason()) return false;
    const at = tableAt(editor.state);
    if (!at) return false;
    const tr = editor.state.tr.setNodeAttribute(at.pos, ATTR, null).setMeta(OWN_META, 'detach');
    if (at.node.attrs[KEY]) tr.setNodeAttribute(at.pos, KEY, null);
    if (at.node.attrs[BASE]) tr.setNodeAttribute(at.pos, BASE, null);
    editor.view.dispatch(tr);
    return true;
  }

  // ---- La pose ---------------------------------------------------------------------------------------------------------------------------------------

  // Les marques de commentaire d'un morceau de HTML, retirées en gardant leur texte : le fil d'un commentaire est celui du modèle ou du document où il est posé, jamais
  // d'un autre.
  function unwrapComments(root) {
    root.querySelectorAll('span.comment-mark').forEach(span => span.replaceWith(...span.childNodes));
  }

  // Le HTML d'un tableau tel que le modèle le garde : celui de editor.getHTML() pour ce nœud (le sérialiseur du schéma), sans le lien, le jeton ni la base (un modèle n'est lié à rien) et sans
  // les marques de commentaire. Écrit dans un document inerte : une <img> créée dans la page charge son adresse même détachée.
  function htmlOf(editor, node) {
    const inert = document.implementation.createHTMLDocument('');
    const bare = node.type.create(Object.assign({}, node.attrs, { [ATTR]: null, [KEY]: null, [BASE]: null }), node.content, node.marks);
    const dom = libs.PMDOMSerializer.fromSchema(editor.schema).serializeNode(bare, { document: inert });
    unwrapComments(dom);
    return dom.outerHTML;
  }

  // Le même tableau sans les largeurs de ses colonnes : la page rogne un tableau trop large et fige les colonnes « auto » après coup (js/editor.js:clampOverflowingTables,
  // backfillAutoColumnWidths), ce qui ne dit rien de ce que la personne a écrit. `toJSON` rend les attributs du nœud eux-mêmes, pas une copie : on les remplace, on ne les écrit pas.
  function contentHtmlOf(editor, node) {
    const json = node.toJSON();
    (function strip(item) {
      if (item.attrs && item.attrs.colwidth) item.attrs = Object.assign({}, item.attrs, { colwidth: null });
      (item.content || []).forEach(strip);
    })(json);
    return htmlOf(editor, editor.schema.nodeFromJSON(json));
  }

  // Les empreintes d'un tableau, gardées par nœud (un nœud ne change pas : la frappe ailleurs ne coûte rien) : `fullHash` du tableau tel que le modèle le garde, `contentHash` sans les
  // largeurs de colonnes.
  const fullHashes = new WeakMap();
  const contentHashes = new WeakMap();
  function memoHash(memo, node, compute) {
    let hash = memo.get(node);
    if (hash === undefined) { hash = hashOf(compute()); memo.set(node, hash); }
    return hash;
  }
  const fullHash = (editor, node) => memoHash(fullHashes, node, () => htmlOf(editor, node));
  const contentHash = (editor, node) => memoHash(contentHashes, node, () => contentHtmlOf(editor, node));

  // Le premier tableau du modèle, lu comme au chargement d'un modèle (HTML assaini, schéma de l'éditeur, sans les marques de commentaire) ; null quand le modèle n'a pas de tableau. Lu
  // une fois tant que son contenu ne change pas : la synchro automatique le relit à chaque passage.
  const parsedTables = new Map();
  function firstTableOf(editor, model) {
    const contenu = model.contenu || '';
    const kept = parsedTables.get(model.id);
    if (kept && kept.contenu === contenu && kept.schema === editor.schema) return kept.first;
    let first = null;
    const body = HtmlSanitize.parseInert(contenu);
    if (body.querySelector('table')) {
      unwrapComments(body);
      const parsed = libs.PMDOMParser.fromSchema(editor.schema).parse(body).firstChild;
      if (parsed && parsed.type.name === 'table') first = parsed;
    }
    parsedTables.set(model.id, { contenu, schema: editor.schema, first });
    return first;
  }

  // Le tableau du modèle, marqué de son lien (le numéro du modèle et son jeton : `key`, ou celui que la liste des modèles lui connaît) ; null quand le modèle n'a pas de tableau.
  function tableNodeOf(editor, model, key) {
    const first = firstTableOf(editor, model);
    if (!first) return null;
    return first.type.create(Object.assign({}, first.attrs, { [ATTR]: model.id, [KEY]: key || model.jeton || null }), first.content, first.marks);
  }

  // Ce tableau du modèle, copie du modèle à l'instant : il reçoit sa base (le document et le modèle disent la même chose), pour peu qu'il porte un jeton.
  function withBase(editor, node) {
    if (!node.attrs[KEY]) return node;
    const base = makeBase(contentHash(editor, node), fullHash(editor, node));
    return node.type.create(Object.assign({}, node.attrs, { [BASE]: base }), node.content, node.marks);
  }

  // Le contenu d'une case tel que le modèle le garderait : sans les marques de commentaire (celles-ci ne sont jamais dans un modèle, htmlOf les retire).
  function plainContent(editor, content) {
    const inert = document.implementation.createHTMLDocument('');
    const holder = inert.createElement('div');
    holder.appendChild(libs.PMDOMSerializer.fromSchema(editor.schema).serializeFragment(content, { document: inert }));
    unwrapComments(holder);
    return holder.innerHTML;
  }

  function hasComment(content) {
    let found = false;
    content.descendants((child) => { if (child.marks.some(mark => mark.type.name === 'commentMark')) found = true; return !found; });
    return found;
  }

  // Le tableau du modèle qui prend la place de `current`, avec les fils de commentaires de `current` dans les cases que le modèle n'a pas changées (même texte) : une marque de commentaire n'est
  // pas dans le modèle, et la relève automatique n'entre pas dans l'historique, rien ne la rendrait. Une case dont le texte change perd la sienne, le fil n'a plus de texte où se poser.
  function keepComments(editor, current, fresh) {
    if (!hasComment(current.content)) return fresh;
    let kept = false;
    const rows = [];
    fresh.forEach((row, offset, r) => {
      const before = r < current.childCount ? current.child(r) : null;
      const cells = [];
      row.forEach((cell, at, c) => {
        const old = before && c < before.childCount ? before.child(c) : null;
        if (old && hasComment(old.content) && plainContent(editor, old.content) === plainContent(editor, cell.content)) {
          cells.push(cell.type.create(cell.attrs, old.content, cell.marks));
          kept = true;
        } else cells.push(cell);
      });
      rows.push(row.type.create(row.attrs, cells, row.marks));
    });
    return kept ? fresh.type.create(fresh.attrs, rows, fresh.marks) : fresh;
  }

  // Pose la copie du tableau de `model` à la place de la sélection, comme le bouton « Tableau », et met le curseur dans sa première case (la barre du tableau
  // s'ouvre sur le lien). Le tableau porte le jeton `key` du modèle (la liste avec recherche le crée avant, Templates.ensureToken) ; sans lui, celui que la liste des modèles lui
  // connaît, sinon un lien ancien. Faux, sans rien changer, quand le modèle est déjà lié dans le document, n'a pas de tableau ou que la sélection ne s'y prête pas.
  function insert(editor, model, key) {
    if (!editor || !editor.isEditable || GridEditor.isActive() || placeBlock(editor)) return false;
    const live = model ? modelOf(model.id) : null;
    if (!live || liveTables(editor.state.doc).some(({ node }) => node.attrs[ATTR] === live.id)) return false;
    const copy = tableNodeOf(editor, live, key);
    if (!copy) return false;
    const node = withBase(editor, copy);
    editor.view.dispatch(editor.state.tr.replaceSelectionWith(node).scrollIntoView().setMeta(OWN_META, 'place'));
    const placed = linkedTables(editor.state.doc).find(entry => entry.node.attrs[ATTR] === live.id && entry.node.attrs[KEY] === node.attrs[KEY]);
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
      const linked = new Set(liveTables(editor.state.doc).map(({ node }) => node.attrs[ATTR]));
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
        select.addEventListener('change', async () => {
          const model = models.find(item => String(item.id) === select.value);
          if (!model) return;
          // Le jeton du modèle (créé au premier lien) est celui que le tableau porte. Sans lui (Grist n'écrit pas, hors ligne), le lien se pose sans identité : un lien ancien, à la main.
          let key = '';
          try { key = await Templates.ensureToken(model.id); } catch (e) { console.warn('[LinkedTable] jeton du modèle impossible', e); }
          insert(editor, model, key);
        });
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

  // ---- Ce que les actions à la main et la synchro automatique partagent -------------------------------------------------------------------------------

  // Une action à la fois : un double clic, ou une seconde action pendant la lecture des modèles, ne part pas deux fois ; la synchro automatique attend qu'elle ait fini.
  let busy = false;

  // Le tableau lié à ce modèle dans le document d'à présent : le curseur, le texte, le document entier ont pu changer pendant que les modèles se relisaient. Celui dont le lien compte
  // d'abord : un tableau resté d'un modèle qui portait ce numéro avant n'est pas celui-là.
  const tableOf = (editor, id) => {
    const same = linkedTables(editor.state.doc).filter(({ node }) => node.attrs[ATTR] === id);
    return same.find(({ node }) => isLive(node)) || same[0];
  };

  // Le jeton que le tableau lié doit porter : celui du modèle, créé s'il manque (Templates.ensureToken). '' quand Grist ne l'écrit pas (document en lecture, hors ligne) : le lien
  // reste alors comme il était, à la main.
  async function keyFor(model) {
    if (model.jeton) return model.jeton;
    try { return await Templates.ensureToken(model.id); } catch (e) { console.warn('[LinkedTable] jeton du modèle impossible', e); return ''; }
  }

  // Le tableau lié `found` dit la même chose que son modèle à cet instant : il reçoit son jeton s'il n'en a pas (un lien d'avant le lot 6c-1 ; celui d'un autre modèle n'est pas touché)
  // et sa base, prise sur `docNode` (le tableau du document tel qu'il a été comparé ou envoyé, pas tel que la frappe l'a changé depuis) et sur le tableau que le modèle garde à
  // présent. Une petite transaction à part, qui rend le document « à enregistrer » comme tout geste de la personne ; « Mettre à jour » pose la base avec les cases.
  function settle(editor, found, key, docNode) {
    if (!found || !isLive(found.node)) return;
    const remote = firstTableOf(editor, modelOf(found.node.attrs[ATTR]));
    const token = found.node.attrs[KEY] || key;
    if (!token || !remote) return;
    const base = makeBase(contentHash(editor, docNode), fullHash(editor, remote));
    if (found.node.attrs[KEY] && found.node.attrs[BASE] === base) return;
    const tr = editor.state.tr.setMeta(OWN_META, 'adopt');
    if (!found.node.attrs[KEY]) tr.setNodeAttribute(found.pos, KEY, token);
    tr.setNodeAttribute(found.pos, BASE, base);
    editor.view.dispatch(tr);
  }

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

  // Ce tableau n'est-il plus celui de son modèle ? Un tableau à jeton se juge sur ses cases (la page rogne ses largeurs de colonnes : ce n'est pas une différence), un lien ancien sur
  // son HTML entier.
  function differsFromModel(editor, node, model) {
    const remote = firstTableOf(editor, model);
    if (!remote) return true;
    return node.attrs[KEY] ? contentHash(editor, node) !== contentHash(editor, remote) : fullHash(editor, node) !== fullHash(editor, remote);
  }

  // ---- Les deux sens du lien, à la main ---------------------------------------------------------------------------------------------------------------

  const { pull, push, usedBy, open, reveal } = (function () {
    // Mettre à jour le tableau du document depuis son modèle, envoyer le tableau du document à son modèle

    // Ce HTML pose-t-il un tableau lié à ce modèle ? Les balises <table> ouvrantes sont lues une à une : le numéro est cherché avec ses guillemets (« 1 » n'est pas « 12 ») et le
    // jeton doit être celui du modèle ou manquer (lien d'avant le lot 6c-1) : un numéro repris par un autre modèle, ou un tableau venu d'un autre document, ne compte pas.
    function postsLink(html, model) {
      const read = (tag, name) => { const found = tag.match(new RegExp('\\s' + name + '="([^"]*)"', 'i')); return found ? found[1] : null; };
      return (String(html || '').match(/<table\b[^>]*>/gi) || []).some((tag) => {
        if (read(tag, DOM_ATTR) !== String(model.id)) return false;
        const key = read(tag, DOM_KEY);
        return key == null || key === model.jeton;
      });
    }

    // Les modèles, hors celui qui est ouvert, qui posent un tableau lié à ce modèle : lus dans les contenus du cache (une grille n'en pose jamais, un macro-modèle n'a pas de
    // HTML). Rien pour un numéro qui n'est pas celui d'un modèle Grille (le numéro d'un modèle supprimé peut se retrouver à un autre type de modèle : ce n'est pas lui que ces
    // tableaux désignaient).
    function usedBy(id) {
      const model = modelOf(id);
      if (!model) return [];
      return Templates.getCached().filter(t => t.typeModele !== 'macro' && t.typeModele !== GridEditor.TYPE && !Templates.isCurrent(t.id) && postsLink(t.contenu, model));
    }

    // Le lien du tableau sous le curseur quand une action peut partir : éditeur qui écrit, aucune autre action en cours, suivi des modifications éteint ; sinon null.
    function ready(editor) {
      if (!editor || !editor.isEditable || busy || lockReason()) return null;
      return status(editor.state);
    }

    // « Mettre à jour depuis le modèle » : les cases du tableau deviennent celles du modèle (relu dans Grist), le curseur reste dans la même case, un seul Annuler les rend.
    // Un tableau déjà identique n'est pas touché (ses commentaires restent). Vrai si le tableau est (devenu) celui du modèle ; faux, sans rien changer, quand l'action est
    // refusée (suivi allumé, une autre en cours) ou impossible (modèle ou tableau introuvable). Un lien d'avant le lot 6c-1 reçoit le jeton du modèle (settle), et tout lien sa base.
    async function pull(editor) {
      const link = ready(editor);
      if (!link) return false;
      busy = true;
      const id = link.model.id;
      try {
        await refreshModels();
        const there = tableOf(editor, id);
        const model = there ? modelFor(there.node) : modelOf(id);
        if (!model) return fail('linkedTable.gone', { name: link.name });
        if (!there || lockReason()) return false;
        const key = await keyFor(model);
        const found = tableOf(editor, id);
        if (!found || lockReason()) return false;
        if (!isLive(found.node)) return fail('linkedTable.gone', { name: link.name });
        const node = tableNodeOf(editor, model, key);
        if (!node) return fail('linkedTable.noTable', { name: model.nom });
        if (htmlOf(editor, found.node) === htmlOf(editor, node)) { settle(editor, found, key, found.node); say('linkedTable.upToDate', { name: model.nom }); return true; }
        const place = cellPlace(editor.state, found);
        const tr = editor.state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, withBase(editor, keepComments(editor, found.node, node))).setMeta(OWN_META, 'pull');
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
        const there = tableOf(editor, id);
        const model = there ? modelFor(there.node) : modelOf(id);
        if (!model) return fail('linkedTable.gone', { name: link.name });
        if (!there || lockReason()) return false;
        const current = tableNodeOf(editor, model);
        if (current && htmlOf(editor, current) === htmlOf(editor, there.node)) {
          const key = await keyFor(model);
          settle(editor, tableOf(editor, id), key, there.node);
          say('linkedTable.upToDate', { name: model.nom });
          return true;
        }
        const others = usedBy(id).length;
        const message = [I18n.t('linkedTable.pushMessage', { name: model.nom }), others ? I18n.t('linkedTable.pushOthers', { n: others }) : ''].filter(Boolean).join(' ');
        const confirmed = await Dialogs.confirm({ title: I18n.t('linkedTable.pushTitle'), message, confirmLabel: I18n.t('linkedTable.pushConfirm') });
        if (!confirmed) return false;
        // La fenêtre est restée ouverte : le document a pu être rechargé, le suivi allumé. Ce qui part est le tableau d'après la réponse.
        const sent = tableOf(editor, id);
        if (!sent || lockReason()) return false;
        if (!isLive(sent.node)) return fail('linkedTable.gone', { name: link.name });
        const key = await keyFor(model);
        await Templates.saveContent(id, htmlOf(editor, sent.node));
        settle(editor, tableOf(editor, id), key, sent.node);
        say('linkedTable.pushed', { name: model.nom });
        return true;
      } catch (e) {
        console.warn('[LinkedTable] envoi au modèle impossible', e);
        return fail('linkedTable.pushFailed', { name: link.name });
      } finally { busy = false; }
    }

    // « Ouvrir le modèle » : donne à la page (js/main.js:openLinkedModel) le modèle du tableau sous le curseur et la case où est le curseur, pour y revenir. N'écrit rien dans le
    // document : le suivi des modifications allumé ne l'empêche pas, et les modifications en attente se demandent dans la page (Enregistrer / Abandonner / Annuler). Faux, sans rien
    // faire, quand une autre action tourne ou que le tableau n'est pas lié à un modèle qui existe.
    function open(editor) {
      const link = editor && !busy ? status(editor.state) : null;
      if (!link) return false;
      host.openModel({ id: link.model.id, name: link.name, place: cellPlace(editor.state, link.at) });
      return true;
    }

    // Au retour du modèle (js/main.js:returnFromLinkedModel) : le curseur revient dans le tableau lié à ce modèle, dans la case où il était, et le tableau se montre. Rend { name,
    // differs } (`differs` : ce tableau n'est plus celui du modèle, que la page dit sur la ligne d'état), ou null quand le document n'a plus ce tableau ou que le modèle n'existe plus.
    function reveal(editor, id, place) {
      const found = editor ? tableOf(editor, id) : null;
      const model = found ? modelFor(found.node) : null;
      if (!found || !model) return null;
      const tr = editor.state.tr;
      cursorTo(tr, found.pos, place || { row: 0, col: 0 });
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      return { name: model.nom, differs: differsFromModel(editor, found.node, model) };
    }

    return { pull, push, usedBy, open, reveal };
  })();

  // ---- Le document suit le modèle (lot 6c-2a) ---------------------------------------------------------------------------------------------------------

  // Ce qu'il y a à faire de ce tableau, de sa base et de son modèle : { action, name, remote } (remote : le tableau du modèle, null quand il n'en a pas). `action` :
  //  - 'manual' : un lien d'avant le lot 6c-1 (sans jeton), à la main seulement ;
  //  - 'none' : rien n'a bougé depuis la dernière synchro (ou le modèle n'a pas de tableau) ;
  //  - 'rebase' : le document et le modèle disent la même chose, mais la base n'est pas à jour : seule la base s'écrit ;
  //  - 'pull' : le modèle a changé, pas ce tableau : il prend celui du modèle ;
  //  - 'push' : ce tableau a changé, pas le modèle : il est à envoyer (lot 6c-2b) ;
  //  - 'differs' : les deux ont changé, ou la base manque et ils diffèrent : rien ne bouge, la ligne d'état le dit, les actions à la main tranchent.
  // Le document « a changé » sur ses cases (contentHash : la page rogne les largeurs de colonnes, ce n'est pas la personne), le modèle sur tout (fullHash : une largeur changée dans
  // le modèle doit arriver).
  function planOf(editor, node, model) {
    const name = model.nom;
    if (!node.attrs[KEY]) return { action: 'manual', name, remote: null };
    const remote = firstTableOf(editor, model);
    const plan = action => ({ action, name, remote });
    if (!remote) return plan('none');
    const sameContent = contentHash(editor, node) === contentHash(editor, remote);
    const base = parseBase(node.attrs[BASE]);
    if (!base) return plan(sameContent ? 'rebase' : 'differs');
    const docMoved = contentHash(editor, node) !== base.doc;
    const modelMoved = fullHash(editor, remote) !== base.model;
    if (!docMoved && !modelMoved) return plan('none');
    if (sameContent) return plan(modelMoved && !docMoved && fullHash(editor, node) !== fullHash(editor, remote) ? 'pull' : 'rebase');
    if (docMoved && modelMoved) return plan('differs');
    return plan(docMoved ? 'push' : 'pull');
  }

  const { syncOpen, syncOnLoad, isSyncTransaction } = (function () {
    // La synchro du document ouvert : chaque tableau à jeton suit son modèle (planOf), à l'ouverture et à chaque lecture de l'enregistrement automatique

    // Les désaccords déjà dits sur la ligne d'état (un modèle dans l'état où il est) : un passage toutes les quelques secondes ne répète pas la même phrase, et la frappe qui continue dans
    // le tableau en désaccord non plus. Remis à zéro à l'ouverture d'un document.
    const noted = new Set();

    // Les cas où la synchro laisse le document tranquille : une action à la main attend sa fin, le suivi des modifications est allumé (une suggestion ne se remplace pas), l'éditeur
    // montre une grille, un en-tête ou un pied de page, ou une composition de texte (accent mort, clavier japonais) est en cours.
    function paused(editor) {
      if (!editor || editor.isDestroyed || busy || lockReason() || inZone() || GridEditor.isActive()) return true;
      return !!(editor.view && editor.view.composing);
    }

    // Les tableaux à jeton du document suivent leur modèle, d'après les modèles du cache (relus par le passage de l'enregistrement automatique, ou à l'instant par la page) : le
    // modèle a changé et pas ce tableau, il prend celui du modèle, le curseur reste dans sa case ; les deux disent la même chose, la base se met à jour ; les deux ont changé, rien ne
    // bouge et la ligne d'état le dit. Une seule transaction, hors de l'historique (Annuler ne rend pas ce que personne n'a fait) et qui ne rend pas le document « à enregistrer »
    // (isSyncTransaction) : ouvrir un document n'écrit rien. Rend ce qui a été fait { pulled: [noms], differs: [noms], rebased: n }, ou null quand la synchro n'a pas lieu.
    function syncOpen(editor) {
      if (paused(editor)) return null;
      const entries = liveTables(editor.state.doc).filter(({ node }) => node.attrs[KEY]);
      if (!entries.length) return null;
      const tr = editor.state.tr;
      const done = { pulled: [], differs: [], rebased: 0 };
      let cursor = null;
      // Du dernier au premier : remplacer un tableau ne déplace pas ceux d'avant.
      for (let i = entries.length - 1; i >= 0; i--) {
        const { node, pos } = entries[i];
        const model = modelFor(node);
        const plan = model ? planOf(editor, node, model) : null;
        if (!plan) continue;
        if (plan.action === 'pull') {
          const place = cellPlace(editor.state, entries[i]);
          tr.replaceWith(pos, pos + node.nodeSize, withBase(editor, keepComments(editor, node, tableNodeOf(editor, model, node.attrs[KEY]))));
          if (place) cursor = { pos, place };
          done.pulled.unshift(plan.name);
        } else if (plan.action === 'rebase') {
          tr.setNodeAttribute(pos, BASE, makeBase(contentHash(editor, node), fullHash(editor, plan.remote)));
          done.rebased++;
        } else if (plan.action === 'differs') {
          const signature = [model.id, fullHash(editor, plan.remote)].join('|');
          if (noted.has(signature)) continue;
          noted.add(signature);
          done.differs.unshift(plan.name);
        }
      }
      if (tr.steps.length) {
        if (cursor) cursorTo(tr, tr.mapping.map(cursor.pos, -1), cursor.place);
        editor.view.dispatch(tr.setMeta(OWN_META, 'sync').setMeta('addToHistory', false));
      }
      if (done.pulled.length === 1) say('linkedTable.pulled', { name: done.pulled[0] });
      else if (done.pulled.length > 1) say('linkedTable.pulledMany', { n: done.pulled.length });
      if (done.differs.length) say('linkedTable.differs', { name: done.differs[0] });
      return done;
    }

    // À l'ouverture d'un document : les désaccords se redisent, même ceux d'une ouverture d'avant.
    function syncOnLoad(editor) {
      noted.clear();
      return syncOpen(editor);
    }

    // La transaction de la synchro, ou celle que la page pose derrière elle (js/editor.js:dispatchColumnWidthFix : largeurs de colonnes d'un tableau qui vient d'arriver), ne rend pas le
    // document « à enregistrer ».
    function isSyncTransaction(tr) {
      if (!tr || !tr.getMeta) return false;
      if (tr.getMeta(OWN_META) === 'sync') return true;
      const root = tr.getMeta('appendedTransaction');
      return !!root && root !== tr && !!root.getMeta && root.getMeta(OWN_META) === 'sync';
    }

    return { syncOpen, syncOnLoad, isSyncTransaction };
  })();

  const { resolveHtml, resolveTemplates } = (function () {
    // Les sorties hors de l'éditeur (macro-modèle, export en lot d'un autre modèle) lisent les documents tels qu'ils sont enregistrés, et l'enregistré n'a pas suivi son modèle tant
    // que personne n'a ouvert le document

    // Le HTML d'un document enregistré tel que ces sorties doivent le lire : un tableau à jeton que le document n'a pas modifié depuis sa dernière synchro (sa base) et que le modèle a
    // changé depuis prend celui du modèle, comme le fera l'éditeur à l'ouverture. Même lecture du tableau que l'éditeur (le schéma de `editor`, jamais une empreinte du texte brut).
    // Le HTML sans tableau à base est rendu tel quel, sans être relu.
    function resolveHtml(editor, html) {
      const text = String(html == null ? '' : html);
      if (!editor || !libs || text.indexOf(DOM_BASE) === -1) return text;
      const body = HtmlSanitize.parseInert(text);
      const dom = body.ownerDocument;
      let changed = false;
      body.querySelectorAll('table[' + DOM_ATTR + '][' + DOM_BASE + ']').forEach((el) => {
        if (el.parentElement && el.parentElement.closest('table')) return;
        const id = idOf(el.getAttribute(DOM_ATTR));
        const key = keyOf(el.getAttribute(DOM_KEY));
        const base = parseBase(el.getAttribute(DOM_BASE));
        const model = id ? modelOf(id) : null;
        if (!key || !base || !model || model.jeton !== key) return;
        const remote = firstTableOf(editor, model);
        if (!remote) return;
        const holder = dom.createElement('div');
        holder.appendChild(el.cloneNode(true));
        const saved = libs.PMDOMParser.fromSchema(editor.schema).parse(holder).firstChild;
        if (!saved || saved.type.name !== 'table') return;
        if (contentHash(editor, saved) !== base.doc || fullHash(editor, remote) === base.model || fullHash(editor, saved) === fullHash(editor, remote)) return;
        const fresh = dom.createElement('div');
        fresh.innerHTML = htmlOf(editor, remote);
        el.replaceWith(...fresh.childNodes);
        changed = true;
      });
      return changed ? body.innerHTML : text;
    }

    // Les modèles de `templates` lus de la même façon : une copie de la liste dont les contenus ont suivi leur modèle (la liste elle-même quand rien n'a changé). Un macro-modèle n'a pas de
    // HTML et une grille ne pose jamais de tableau lié.
    function resolveTemplates(editor, templates) {
      const list = templates || [];
      const resolved = list.map((tpl) => {
        if (!tpl || tpl.typeModele === 'macro' || tpl.typeModele === GridEditor.TYPE || typeof tpl.contenu !== 'string' || tpl.contenu.indexOf(DOM_BASE) === -1) return tpl;
        const contenu = resolveHtml(editor, tpl.contenu);
        return contenu === tpl.contenu ? tpl : Object.assign({}, tpl, { contenu });
      });
      return resolved.some((tpl, i) => tpl !== list[i]) ? resolved : list;
    }

    return { resolveHtml, resolveTemplates };
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

  return {
    ATTR, KEY, BASE, configure, wire, withAttributes, createExtension, modelOf, modelFor, linkedTables, liveTables, tableAt, status, cursorIn, lockReason, placeBlock, detach, insert, openPicker, pull, push, usedBy, open, reveal,
    planOf, syncOpen, syncOnLoad, isSyncTransaction, resolveHtml, resolveTemplates, syncRow,
  };
})();
