// Signets : un endroit nommé du document, que n'importe quel texte peut viser par un lien « Dans ce document » (js/link-dialog.js). Un signet n'est pas un
// nouveau nœud : c'est un attribut du paragraphe ou du titre qu'il marque (`<p data-anchor="conditions" data-anchor-name="Conditions">`), comme « Garder avec
// le suivant » (js/keep-with-next.js), de sorte que le texte garde tout ce qu'un paragraphe sait faire et qu'un signet suit son bloc quand on le déplace.
//  - `anchorId` : l'adresse du signet, écrite dans le lien (`<a href="#conditions">`) et dans les exports (une destination du PDF, un signet du Word, un `id` du
//    HTML). Tirée du nom (slugify : sans accents ni espaces), unique dans le document ; elle ne change que si le nom donne une autre adresse, et les liens qui la
//    portent la suivent alors (save).
//  - `anchorName` : le nom que la personne a donné, vide pour un titre qu'un lien vise sans qu'il ait de signet : un titre est une cible sans rien poser (claim
//    lui donne alors une adresse tirée de son texte, idFor). Seuls les blocs qui portent un nom sont des « Signets » de la liste ; seuls ils ont un drapeau.
// Un signet se pose sur un paragraphe ou un titre du premier niveau du texte (ni dans un tableau, une liste, une colonne ou un encadré, ni dans un en-tête ou un pied
// de page : les exports n'y savent pas encore poser de destination) ; celui qu'un bloc porte ailleurs (collé, ou entré dans une liste) est retiré. Un doublon (un
// bloc copié) perd le sien : le premier du document garde l'adresse, un signet déplacé (couper-coller) la garde donc.
// Une diapositive peut aussi être une cible : son repère (js/slide-props.js) porte les mêmes `anchorId` et `anchorName` (`<div class="pp-slide-props" data-anchor="slide-3" data-anchor-name="Diapositive 3">`), que pose l'import d'un
// fichier PowerPoint pour une diapositive que vise un lien (js/pptx-import.js). Elle n'a ni drapeau ni fenêtre « Signet… » ; elle est dans la liste « Dans ce document », et la Lecture et le diaporama la retrouvent par son bloc
// d'adresse (SlideProps.forOutput, option `anchors`).
// Ce qui se passe au clic est ailleurs : js/link-dialog.js (Ctrl/⌘+clic dans l'éditeur), js/reader-mode.js (la Lecture), et les exports écrivent chacun leur
// destination (js/pdf-export.js, js/docx-export.js, js/html-export.js, js/markdown-export.js).
const Anchors = (function () {
  const ATTR_ID = 'data-anchor';
  const ATTR_NAME = 'data-anchor-name';
  const SLIDE_ANCHOR_CLASS = 'pp-slide-anchor';
  const MAX_NAME = 80;
  const MAX_ID = 60;
  const BLOCK_TYPES = ['paragraph', 'heading'];
  const FLAG_CLASS = 'pp-anchor-flag';
  const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

  const isBlock = node => !!node && BLOCK_TYPES.indexOf(node.type.name) !== -1;
  // Une cible de lien : un paragraphe ou un titre, ou le repère d'une diapositive (js/slide-props.js : `anchorId` et `anchorName` y sont les siens), que vise un lien « vers une autre diapositive » d'un
  // fichier PowerPoint. Seuls les paragraphes et les titres se posent et se retirent par la fenêtre « Signet… ».
  const SLIDE_NODE = 'slideProps';
  const isSlide = node => !!node && node.type.name === SLIDE_NODE;
  const isTarget = node => isBlock(node) || isSlide(node);
  const isId = id => typeof id === 'string' && HtmlSanitize.internalAnchorId('#' + id) === id;
  const hrefOf = id => '#' + id;
  const idOfHref = href => HtmlSanitize.internalAnchorId(href);

  // L'adresse tirée d'un nom : sans accents, en minuscules, un tiret entre deux mots, jamais vide (« Été 2024 » -> « ete-2024 », « 日本 » -> « signet »).
  function slugify(text) {
    const slug = String(text == null ? '' : text)
      .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, MAX_ID).replace(/-+$/, '');
    return slug || 'signet';
  }

  // `base`, ou `base-2`, `base-3`... : la première adresse que `isTaken` ne refuse pas.
  function uniqueId(base, isTaken) {
    if (!isTaken(base)) return base;
    for (let n = 2; ; n++) {
      const suffix = '-' + n;
      const candidate = base.slice(0, MAX_ID - suffix.length).replace(/-+$/, '') + suffix;
      if (!isTaken(candidate)) return candidate;
    }
  }

  const cleanName = name => String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

  // Les adresses que portent les blocs du premier niveau, sauf celui de `exceptPos` (le bloc dont on choisit l'adresse).
  function idsIn(doc, exceptPos) {
    const ids = new Set();
    doc.forEach((node, pos) => { if (pos !== exceptPos && isTarget(node) && node.attrs.anchorId) ids.add(node.attrs.anchorId); });
    return ids;
  }

  // Les blocs du premier niveau qui portent l'adresse `id` : { node, pos } du premier, ou null.
  function find(editor, id) {
    let found = null;
    editor.state.doc.forEach((node, pos) => { if (!found && isTarget(node) && node.attrs.anchorId === id) found = { node, pos }; });
    return found;
  }

  // Les passages (texte ou image) qui portent un lien vers `id`, d'un seul tenant : { from, to, mark }. Un lien coupé en deux morceaux par du gras est un seul passage.
  function linkRuns(doc, id) {
    const href = hrefOf(id);
    const runs = [];
    doc.descendants((node, pos, parent) => {
      if (!node.isInline) return true;
      const mark = node.marks.find(m => m.type.name === 'link' && m.attrs.href === href);
      if (!mark) return false;
      const last = runs[runs.length - 1];
      if (last && last.parent === parent && last.to === pos && last.mark.eq(mark)) last.to = pos + node.nodeSize;
      else runs.push({ from: pos, to: pos + node.nodeSize, mark, parent });
      return false;
    });
    return runs;
  }
  const linkCount = (editor, id) => (id ? linkRuns(editor.state.doc, id).length : 0);

  // La normalisation : à chaque changement du document, un signet qui n'a plus de place (bloc entré dans une liste ou un tableau, légende), un doublon, une
  // adresse que le HTML ne saurait écrire sont retirés ; un nom sans adresse (un HTML écrit à la main) en reçoit une. Une seule transaction, rangée dans
  // l'événement de la modification (Annuler la défait avec elle).
  function normalize(transactions, _oldState, state) {
    if (!transactions.some(tr => tr.docChanged)) return null;
    const doc = state.doc;
    const present = idsIn(doc, -1);
    const seen = new Set();
    let tr = null;
    const rewrite = (pos, id, name) => {
      tr = tr || state.tr;
      tr.setNodeAttribute(pos, 'anchorId', id);
      tr.setNodeAttribute(pos, 'anchorName', name);
    };
    doc.descendants((node, pos, parent) => {
      if (!isTarget(node)) return true;
      const { anchorId, anchorName, caption } = node.attrs;
      if (!anchorId && !anchorName) return false;
      const name = cleanName(anchorName) || null;
      let id = isId(anchorId) ? anchorId : null;
      if (parent !== doc || caption || (id && seen.has(id))) { rewrite(pos, null, null); return false; }
      if (!id && name) id = uniqueId(slugify(name), candidate => present.has(candidate) || seen.has(candidate));
      if (!id) { rewrite(pos, null, null); return false; }
      seen.add(id);
      if (id !== anchorId || name !== (anchorName || null)) rewrite(pos, id, name);
      return false;
    });
    return tr;
  }

  // Le drapeau d'un signet : un repère de l'éditeur seulement, dans la marge, au début du bloc (css/editor-v2.css). Un clic ouvre la fenêtre du signet.
  function flagElement(editor, name) {
    const flag = document.createElement('span');
    flag.className = FLAG_CLASS;
    flag.setAttribute('aria-hidden', 'true');
    flag.contentEditable = 'false';
    flag.title = I18n.t('bookmark.flag', { name });
    flag.addEventListener('mousedown', event => {
      event.preventDefault();
      const block = flag.parentElement;
      if (!block || !editor.isEditable) return;
      const pos = editor.view.posAtDOM(block, 0);
      editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(pos).run();
      BookmarkDialog.open();
    });
    return flag;
  }

  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    return Extension.create({
      name: 'anchors',
      addGlobalAttributes() {
        // Entrée au milieu d'un bloc ouvre un bloc sans signet : un signet est un endroit, il ne se propage pas à ce qu'on écrit ensuite.
        return [{
          types: BLOCK_TYPES,
          attributes: {
            anchorId: {
              default: null,
              keepOnSplit: false,
              parseHTML: el => (isId(el.getAttribute(ATTR_ID)) ? el.getAttribute(ATTR_ID) : null),
              renderHTML: attrs => (attrs.anchorId ? { [ATTR_ID]: attrs.anchorId } : {}),
            },
            anchorName: {
              default: null,
              keepOnSplit: false,
              parseHTML: el => cleanName(el.getAttribute(ATTR_NAME)) || null,
              renderHTML: attrs => (attrs.anchorName ? { [ATTR_NAME]: attrs.anchorName } : {}),
            },
          },
        }];
      },
      addProseMirrorPlugins() {
        const editor = this.editor;
        let cached = { doc: null, set: DecorationSet.empty };
        return [new Plugin({
          key: new PluginKey('anchors'),
          appendTransaction: normalize,
          props: {
            // Les drapeaux sont une décoration : rien n'en reste dans le document ni dans les exports. Recalculés au changement du document seulement.
            decorations(state) {
              if (cached.doc === state.doc) return cached.set;
              const decorations = [];
              state.doc.forEach((node, pos) => {
                if (isBlock(node) && node.attrs.anchorName) {
                  const name = node.attrs.anchorName;
                  decorations.push(Decoration.widget(pos + 1, () => flagElement(editor, name), { side: -1, ignoreSelection: true, key: 'anchor:' + node.attrs.anchorId + ':' + name }));
                }
              });
              cached = { doc: state.doc, set: decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty };
              return cached.set;
            },
          },
        })];
      },
    });
  }

  // Ce que la sélection permet : le bloc du premier niveau où est le curseur, { node, pos }, ou null (un tableau, une liste, une colonne, un encadré, une légende,
  // un en-tête ou un pied de page, une image seule).
  function blockAtSelection(editor) {
    if (HeaderFooterPreview.getHfMode()) return null;
    const { $from } = editor.state.selection;
    if ($from.depth < 1) return null;
    const node = $from.node(1);
    return isBlock(node) && !node.attrs.caption ? { node, pos: $from.before(1) } : null;
  }

  // `locked` : la clé de la raison du grisage de la ligne « Signet… », ou null ; `block` : le bloc visé ; `named` : le nom du signet qu'il porte, ou null.
  function status(editor) {
    const block = blockAtSelection(editor);
    return { block, locked: block ? null : 'bookmark.notHere', named: block ? block.node.attrs.anchorName || null : null };
  }

  // La ligne du menu à l'état de la sélection : grisée par aria-disabled et `v2-hover-row-disabled` avec sa raison pour info-bulle (comme « Garder avec le suivant »),
  // enfoncée et relue « Modifier le signet… » quand le bloc en porte un. `lockedBy` : la clé d'une autre raison de griser (un modèle d'e-mail est du texte brut).
  function syncRow(row, editor, lockedBy) {
    if (!row || !editor) return;
    const s = status(editor);
    const locked = lockedBy || s.locked;
    row.setAttribute('aria-disabled', locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!locked);
    row.classList.toggle('is-active', !locked && !!s.named);
    row.tabIndex = locked ? -1 : 0;
    if (locked) row.title = I18n.t(locked); else row.removeAttribute('title');
    const label = row.querySelector('[data-bookmark-label]');
    if (label) label.textContent = I18n.t(s.named ? 'insert.bookmark.rowEdit' : 'insert.bookmark.row');
    row.setAttribute('aria-label', I18n.t(s.named ? 'insert.bookmark.ariaEdit' : 'insert.bookmark.aria'));
  }

  // Pose, renomme ou retire (`name` vide) le signet du bloc `pos`, en une transaction : les liens qui menaient à l'ancienne adresse suivent la nouvelle. Rend
  // { id, name } (null quand le signet est retiré), ou false sans rien changer.
  function save(editor, pos, name) {
    if (!editor || !editor.isEditable) return false;
    const { state, view } = editor;
    const node = state.doc.nodeAt(pos);
    if (!isBlock(node)) return false;
    const tr = state.tr;
    const wanted = cleanName(name);
    const oldId = node.attrs.anchorId || null;
    if (!wanted) {
      tr.setNodeAttribute(pos, 'anchorId', null);
      tr.setNodeAttribute(pos, 'anchorName', null);
      view.dispatch(tr);
      return { id: null, name: null };
    }
    // L'adresse suit le nom : elle ne change que si le nom en donne une autre (la casse, les accents, le « -2 » d'un doublon gardent la leur).
    const slug = slugify(wanted);
    const keeps = oldId && (oldId === slug || oldId.replace(/-\d+$/, '') === slug);
    const taken = idsIn(state.doc, pos);
    const id = keeps ? oldId : uniqueId(slug, candidate => taken.has(candidate));
    if (oldId && id !== oldId) {
      linkRuns(state.doc, oldId).forEach(run => tr.addMark(run.from, run.to, run.mark.type.create(Object.assign({}, run.mark.attrs, { href: hrefOf(id) }))));
    }
    tr.setNodeAttribute(pos, 'anchorId', id);
    tr.setNodeAttribute(pos, 'anchorName', wanted);
    view.dispatch(tr);
    return { id, name: wanted };
  }

  // Un autre bloc porte-t-il déjà ce nom (sans compter la casse ni les accents) ? Deux signets du même nom ne se distingueraient pas dans la liste.
  function nameTaken(editor, name, exceptPos) {
    const wanted = SearchSelect.normalize(cleanName(name));
    let taken = false;
    editor.state.doc.forEach((node, pos) => {
      if (pos !== exceptPos && isTarget(node) && node.attrs.anchorName && SearchSelect.normalize(node.attrs.anchorName) === wanted) taken = true;
    });
    return taken;
  }

  // L'adresse qu'aurait le bloc `pos` avec ce nom (l'aperçu de la fenêtre du signet).
  function previewId(editor, pos, name) {
    const node = editor.state.doc.nodeAt(pos);
    const slug = slugify(cleanName(name));
    const oldId = node && node.attrs.anchorId;
    if (oldId && (oldId === slug || oldId.replace(/-\d+$/, '') === slug)) return oldId;
    const taken = idsIn(editor.state.doc, pos);
    return uniqueId(slug, candidate => taken.has(candidate));
  }

  // L'adresse du bloc `pos` pour un lien : celle qu'il porte, sinon une adresse tirée de son texte, que l'appelant pose avec le lien, dans la même transaction (un titre est
  // une cible sans signet).
  function idFor(editor, pos) {
    const node = editor.state.doc.nodeAt(pos);
    if (node.attrs.anchorId) return node.attrs.anchorId;
    const taken = idsIn(editor.state.doc, pos);
    return uniqueId(slugify(node.textContent), candidate => taken.has(candidate));
  }

  // Ce que la fenêtre « Lien… » propose dans « Dans ce document » : les titres du premier niveau (leur texte comme le sommaire l'écrit, numérotation comprise) et les
  // signets nommés, dans l'ordre du document. `pos` est la place du bloc, `id` son adresse (null pour un titre qui n'en a pas encore), `plain` le texte du titre sans sa
  // numérotation.
  function targets(editor) {
    const dom = editor.view.dom;
    const entries = HeadingNumbering.entriesFor(Array.from(dom.querySelectorAll(HEADINGS)), dom.dataset.headingStyle || 'none');
    const headings = [];
    const bookmarks = [];
    let rank = 0;
    editor.state.doc.forEach((node, pos) => {
      if (!isTarget(node)) return;
      if (node.type.name === 'heading') {
        const entry = entries[rank++];
        const text = (entry ? entry.text : node.textContent).trim();
        if (text) headings.push({ pos, id: node.attrs.anchorId || null, text, plain: node.textContent.replace(/\s+/g, ' ').trim(), level: node.attrs.level || 1 });
      }
      if (node.attrs.anchorName) bookmarks.push({ pos, id: node.attrs.anchorId, name: node.attrs.anchorName, snippet: isSlide(node) ? '' : node.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) });
    });
    return { headings, bookmarks };
  }

  // Le nom que la personne reconnaît pour l'adresse `id` (le nom du signet, sinon le texte du titre), ou null : la cible n'existe plus.
  function labelOf(editor, id) {
    const found = find(editor, id);
    if (!found) return null;
    return found.node.attrs.anchorName || found.node.textContent.replace(/\s+/g, ' ').trim() || id;
  }

  // Amène la cible de `id` en haut de la zone visible et y pose le curseur (un document en lecture seule garde le sien). Faux quand elle n'existe plus.
  function goTo(editor, id) {
    const found = find(editor, id);
    const el = found ? editor.view.nodeDOM(found.pos) : null;
    if (!el || el.nodeType !== 1) return false;
    TocLinks.reveal(el);
    if (!editor.isEditable) return true;
    // Le curseur d'une diapositive est dans son premier texte (le repère n'a pas de texte à lui) ; une diapositive sans texte garde la place du curseur.
    const at = isSlide(found.node) ? firstTextIn(editor.state.doc, found.pos + found.node.nodeSize) : found.pos + 1;
    if (at == null) editor.view.focus(); else editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(at).run();
    return true;
  }
  // Le début du premier texte après `from`, avant le prochain saut de page (la fin de la diapositive), ou null.
  function firstTextIn(doc, from) {
    let at = null;
    let done = false;
    doc.nodesBetween(from, doc.content.size, (node, pos) => {
      if (done || at != null) return false;
      if (node.type.name === 'pageBreak') { done = true; return false; }
      if (node.isTextblock) { at = pos + 1; return false; }
      return true;
    });
    return at;
  }

  // Dans un arbre HTML (la Lecture, un export) : le bloc du premier niveau qui porte l'adresse `id`, ou null.
  function elementFor(root, id) {
    if (!isId(id) || !root) return null;
    return Array.from(root.children).find(el => el.getAttribute(ATTR_ID) === id) || null;
  }

  // Les cibles d'une suite de blocs du premier niveau : adresse -> bloc, pour les paragraphes et titres et le bloc d'adresse d'une diapositive (SlideProps.forOutput) (le premier d'un doublon, qui seul garde l'adresse).
  function indexElements(elements) {
    const map = new Map();
    Array.from(elements).forEach(el => {
      const id = el.getAttribute(ATTR_ID);
      if (id && isId(id) && (/^(?:P|H[1-6])$/.test(el.tagName) || (el.tagName === 'DIV' && el.classList.contains(SLIDE_ANCHOR_CLASS))) && !map.has(id)) map.set(id, el);
    });
    return map;
  }

  // Les cibles d'un arbre HTML d'export (la Lecture, le HTML, le Markdown).
  function elementsOf(root) {
    return indexElements(root.children);
  }

  return {
    ATTR_ID, ATTR_NAME, MAX_NAME, slugify, uniqueId, cleanName, hrefOf, idOfHref, isId, createExtension, status, syncRow, blockAtSelection, save, nameTaken, previewId, idFor,
    targets, labelOf, find, goTo, linkCount, elementFor, elementsOf, indexElements,
  };
})();
