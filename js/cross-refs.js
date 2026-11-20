// Renvois : « cf Conditions générales », où le nom du titre s'écrit TOUT SEUL et suit le titre quand il change, en même temps qu'un lien qui mène à lui (comme un renvoi croisé de Word).
// Un renvoi est un petit nœud en ligne (comme une note de bas de page) qui vise l'adresse d'un titre ou d'un signet (js/anchors.js : `data-anchor`) et dit ce qu'il montre (`mode` : le
// texte du titre, son numéro, ou les deux). Il s'écrit dans le HTML comme un lien « Dans ce document » (`<a class="pp-xref" href="#adresse" data-xref="adresse">texte du moment</a>`) :
// la Lecture, le PDF, le Word, le HTML, le Markdown et l'e-mail le lisent déjà (js/pdf-export.js, js/docx-export.js, js/html-export.js, js/markdown-export.js, js/reader-mode.js) et un renvoi
// dont le titre n'existe plus y reste du texte, comme un lien mort. Les deux seuls endroits qui savent qu'il est dynamique :
//  - l'éditeur : `label`, le texte du moment, est gardé dans le nœud et remis à jour dans la transaction même qui change le titre (appendTransaction : Annuler défait les deux d'un coup, comme
//    la normalisation des signets) ; `broken` dit que le titre n'existe plus (le renvoi passe en rouge, son dernier texte reste) ;
//  - la Lecture et tout export (js/reader-mode.js:resolveReaderBody, `resolveIn`) : le texte est relu dans le document RÉSOLU de la ligne - un titre qui porte une variable (« Contrat de #Nom »)
//    y est écrit avec la valeur de la ligne - par la même lecture des titres que le sommaire (HeadingNumbering).
// La fenêtre « Renvoi… » est dans js/cross-ref-dialog.js ; les styles dans css/editor-v2.css (`.pp-xref`).
const CrossRefs = (function () {
  const NODE = 'crossRef';
  const CLASS = 'pp-xref';
  const ATTR_ID = 'data-xref';
  const ATTR_MODE = 'data-xref-mode';
  const MODES = ['text', 'number', 'both'];
  const DEFAULT_MODE = 'text';
  const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

  const modeOf = value => (MODES.indexOf(value) !== -1 ? value : DEFAULT_MODE);
  const clean = text => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const isRef = node => !!node && node.type.name === NODE;

  // Le texte qu'un renvoi montre pour un titre ou un signet `entry` ({ text, number }) selon son `mode` : le texte seul, le numéro seul (le marqueur de HeadingNumbering sans son blanc final :
  // « 2.a », « Article 1 », « a) »), ou les deux (« 2.a Conditions générales », comme la ligne du sommaire). Un titre sans numéro (numérotation éteinte, signet d'un paragraphe) montre son texte.
  function labelFor(entry, mode) {
    if (!entry) return null;
    const number = entry.number || '';
    if (mode === 'number' && number) return number;
    if (mode === 'both' && number) return clean(number + ' ' + entry.text);
    return entry.text || number;
  }

  // === Lire le document ===
  // Le texte d'un titre dans le modèle du document : son texte, plus ce que montrent ses bulles (une variable s'y lit « #Nom », comme dans l'aperçu du sommaire de l'éditeur).
  function leafText(leaf) {
    switch (leaf.type.name) {
      case 'varBadge': return Variables.triggerChar() + (leaf.attrs.key || '');
      case 'calcBadge': return EditorNodes.calcBadgeLabel(leaf.attrs.formula);
      case 'smartChip': return EditorNodes.smartChipLabel(leaf.attrs.kind, leaf.attrs);
      case 'hardBreak': return ' ';
      default: return '';
    }
  }
  function textOf(block) {
    let text = '';
    block.forEach(child => { text += child.isText ? child.text : leafText(child); });
    return clean(text);
  }
  // Le style de numérotation des titres du document : l'attribut du nœud `headingNumberingConfig` (le même que `data-heading-style` de la racine de l'éditeur).
  function numberingStyleOf(doc) {
    let style = 'none';
    doc.forEach(node => { if (node.type.name === 'headingNumberingConfig') style = node.attrs.numberingStyle || 'none'; });
    return style;
  }
  // Ce que chaque adresse du document vise : Map adresse -> { heading, text, number }. Les titres du premier niveau, numérotés comme le sommaire ; un paragraphe qui porte un signet y
  // est sous son nom de signet. Le premier bloc d'une adresse l'emporte (un doublon perd la sienne, js/anchors.js).
  function targetsOf(doc) {
    const map = new Map();
    const style = numberingStyleOf(doc);
    // HeadingNumbering ne lit que le niveau d'un titre (`tagName`) : un titre du modèle n'a pas besoin d'élément.
    const headings = [];
    doc.forEach(node => { if (node.type.name === 'heading') headings.push({ tagName: 'H' + (node.attrs.level || 1) }); });
    const markers = HeadingNumbering.markersFor(headings, style);
    let rank = 0;
    doc.forEach(node => {
      const type = node.type.name;
      if (type === 'heading') {
        const number = clean(markers[rank++]);
        const id = node.attrs.anchorId;
        if (id && !map.has(id)) map.set(id, { heading: true, text: textOf(node), number });
      } else if (type === 'paragraph' && node.attrs.anchorId && !map.has(node.attrs.anchorId)) {
        map.set(node.attrs.anchorId, { heading: false, text: node.attrs.anchorName || textOf(node), number: '' });
      }
    });
    return map;
  }
  // Pareil sur un arbre HTML déjà résolu (la Lecture, l'impression, les exports) : le texte des titres est celui qu'ils ont une fois les variables remplacées.
  function targetsOfTree(root) {
    const map = new Map();
    const headings = Array.from(root.querySelectorAll(HEADINGS));
    const markers = HeadingNumbering.markersFor(headings, root.dataset.headingStyle || 'none');
    headings.forEach((heading, index) => {
      const id = heading.getAttribute(Anchors.ATTR_ID);
      if (id && !map.has(id)) map.set(id, { heading: true, text: clean(heading.textContent), number: clean(markers[index]) });
    });
    Array.from(root.children).forEach(el => {
      const id = el.getAttribute(Anchors.ATTR_ID);
      if (id && el.tagName === 'P' && !map.has(id)) map.set(id, { heading: false, text: clean(el.getAttribute(Anchors.ATTR_NAME)) || clean(el.textContent), number: '' });
    });
    return map;
  }

  // Ce que la fenêtre « Renvoi… » propose : les titres du premier niveau (leur place, leur adresse - null tant qu'aucun lien ne les vise -, leur texte, leur numéro, leur niveau) et les
  // blocs qui portent un nom de signet, dans l'ordre du document. `style` : la numérotation des titres du document ('none' : pas de numéro à montrer).
  function choices(editor) {
    const doc = editor.state.doc;
    const style = numberingStyleOf(doc);
    const found = [];
    doc.forEach((node, pos) => { if (node.type.name === 'heading') found.push({ node, pos }); });
    const markers = HeadingNumbering.markersFor(found.map(({ node }) => ({ tagName: 'H' + (node.attrs.level || 1) })), style);
    const headings = [];
    found.forEach(({ node, pos }, index) => {
      const text = textOf(node);
      if (text) headings.push({ pos, id: node.attrs.anchorId || null, text, number: clean(markers[index]), level: node.attrs.level || 1 });
    });
    const bookmarks = [];
    doc.forEach(node => {
      const type = node.type.name;
      if ((type === 'paragraph' || type === 'heading') && node.attrs.anchorId && node.attrs.anchorName) {
        bookmarks.push({ id: node.attrs.anchorId, name: node.attrs.anchorName, snippet: textOf(node).slice(0, 40) });
      }
    });
    return { headings, bookmarks, style };
  }

  // === Le nœud ===
  const hrefAttrs = attrs => ({ class: CLASS, href: Anchors.hrefOf(attrs.target), [ATTR_ID]: attrs.target, [ATTR_MODE]: attrs.mode, contenteditable: 'false' });

  function paint(dom, node) {
    const { target, mode, label, broken } = node.attrs;
    dom.className = CLASS + (broken ? ' ' + CLASS + '-broken' : '');
    dom.setAttribute('href', Anchors.hrefOf(target));
    dom.setAttribute(ATTR_ID, target);
    dom.setAttribute(ATTR_MODE, mode);
    dom.setAttribute('contenteditable', 'false');
    dom.textContent = label || I18n.t('crossRef.untitled');
  }

  function createNode(Node) {
    const { internalAttr, inlineAtom } = EditorNodes;
    return inlineAtom(Node, {
      name: NODE,
      addAttributes() {
        return { target: internalAttr(null), mode: internalAttr(DEFAULT_MODE), label: internalAttr(''), broken: internalAttr(false) };
      },
      // Avant la marque `link` (`a[href]`) : un renvoi relu du HTML enregistré, du presse-papiers ou d'un autre document est lu comme un renvoi, pas comme un lien dont le texte est figé.
      parseHTML() {
        return [{
          tag: `a.${CLASS}[${ATTR_ID}]`,
          priority: 1000,
          getAttrs: el => {
            const target = el.getAttribute(ATTR_ID);
            return Anchors.isId(target) ? { target, mode: modeOf(el.getAttribute(ATTR_MODE)), label: clean(el.textContent) } : false;
          },
        }];
      },
      renderHTML({ node }) {
        return ['a', hrefAttrs(node.attrs), node.attrs.label];
      },
      // Le texte brut d'une sélection copiée : ce que le renvoi dit.
      renderText({ node }) {
        return node.attrs.label || '';
      },
      addNodeView() {
        return ({ node, editor, getPos }) => {
          const dom = document.createElement('a');
          paint(dom, node);
          // Un clic ne suit pas le lien (une adresse `#…` changerait celle du cadre) : Ctrl/⌘+clic mène au titre (js/link-dialog.js:wireEditor), un double clic ouvre la fenêtre du renvoi.
          dom.addEventListener('click', event => event.preventDefault());
          dom.addEventListener('dblclick', event => {
            event.preventDefault();
            const pos = getPos();
            if (typeof pos !== 'number' || !editor.isEditable) return;
            editor.chain().focus(null, { scrollIntoView: false }).setNodeSelection(pos).run();
            CrossRefDialog.open();
          });
          return { dom };
        };
      },
    });
  }

  // === Garder le texte à jour ===
  // Une modification qui ne change ni un titre, ni un signet, ni un renvoi, ni la numérotation : une lettre tapée dans un paragraphe, une marque posée. Elle n'oblige à rien relire (le parcours du
  // document entier coûte 0,4 ms par lettre dans un texte de 117 pages). Un lien posé sur un renvoi (une marque `link` autour d'un `<a>` : deux liens l'un dans l'autre) est relu : il est retiré.
  function insertsRef(slice) {
    let found = false;
    if (slice) slice.content.descendants(node => { if (isRef(node)) found = true; return !found; });
    return found;
  }
  function untouched(tr) {
    if (!tr.docChanged) return true;
    return tr.steps.every((step, index) => {
      if (step.jsonID === 'removeMark') return true;
      if (step.jsonID === 'addMark') return step.mark.type.name !== 'link';
      if (step.jsonID !== 'replace') return false;
      const $from = tr.docs[index].resolve(step.from);
      const $to = tr.docs[index].resolve(step.to);
      if (!$from.parent.isTextblock || !$from.sameParent($to) || $from.parent.type.name === 'heading') return false;
      return !step.slice.openStart && !step.slice.openEnd && !insertsRef(step.slice);
    });
  }
  function hasRef(doc) {
    let found = false;
    doc.descendants(node => { if (isRef(node)) found = true; return !found && !node.isLeaf; });
    return found;
  }

  // Remet à jour les renvois d'un document : leur texte d'après le titre visé, `broken` quand il n'existe plus (le dernier texte reste), et retire le lien qu'une marque aurait posé sur eux.
  function syncTransaction(state, key) {
    const refs = [];
    state.doc.descendants((node, pos) => {
      if (isRef(node)) { refs.push({ node, pos }); return false; }
      return !node.isLeaf;
    });
    if (!refs.length) return null;
    const targets = targetsOf(state.doc);
    const linkType = state.schema.marks.link;
    let tr = null;
    const change = () => { tr = tr || state.tr.setMeta(key, true); return tr; };
    refs.forEach(({ node, pos }) => {
      const entry = targets.get(node.attrs.target);
      const label = entry ? labelFor(entry, node.attrs.mode) : node.attrs.label;
      if (label !== node.attrs.label) change().setNodeAttribute(pos, 'label', label);
      if (!entry !== !!node.attrs.broken) change().setNodeAttribute(pos, 'broken', !entry);
      if (linkType && node.marks.some(mark => mark.type === linkType)) change().removeMark(pos, pos + node.nodeSize, linkType);
    });
    return tr;
  }

  function createExtension(Extension, libs) {
    const { Plugin, PluginKey } = libs;
    return Extension.create({
      name: 'crossRefSync',
      addProseMirrorPlugins() {
        const key = new PluginKey('crossRefs');
        return [new Plugin({
          key,
          // `any` : le document a (eu) au moins un renvoi. Sans renvoi, aucune frappe ne coûte rien ici.
          state: {
            init: (_config, state) => ({ any: hasRef(state.doc) }),
            apply: (tr, value) => (value.any || !tr.docChanged || !tr.steps.some(step => insertsRef(step.slice)) ? value : { any: true }),
          },
          appendTransaction(transactions, _oldState, state) {
            const value = key.getState(state);
            if (!value || !value.any || transactions.every(tr => tr.getMeta(key) || untouched(tr))) return null;
            return syncTransaction(state, key);
          },
        })];
      },
    });
  }

  // === Poser, changer ===
  // Ce que la sélection permet : le renvoi sélectionné ({ node, pos }, la fenêtre le modifie), ou l'endroit où un renvoi se pose (du texte d'un seul bloc de texte). `locked` : la clé de la raison
  // du grisage de la ligne « Renvoi… », ou null.
  function selectedRef(editor) {
    const selection = editor.state.selection;
    return selection.node && isRef(selection.node) ? { node: selection.node, pos: selection.from } : null;
  }
  function status(editor, lockedBy) {
    const chosen = editor ? selectedRef(editor) : null;
    if (lockedBy) return { locked: lockedBy, ref: null };
    if (!editor || !editor.isEditable) return { locked: 'crossRef.notHere', ref: null };
    if (chosen) return { locked: null, ref: chosen };
    if (HeaderFooterPreview.getHfMode() || editor.isActive('codeBlock')) return { locked: 'crossRef.notHere', ref: null };
    const { $from, $to } = editor.state.selection;
    return { locked: $from.parent.inlineContent && $from.sameParent($to) ? null : 'crossRef.notHere', ref: null };
  }
  // La ligne du menu à l'état de la sélection : grisée avec sa raison (aria-disabled, `v2-hover-row-disabled`, info-bulle : comme « Signet… »), relue « Modifier le renvoi… » quand un renvoi est choisi.
  function syncRow(row, editor, lockedBy) {
    if (!row || !editor) return;
    const s = status(editor, lockedBy);
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.classList.toggle('is-active', !s.locked && !!s.ref);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) { row.title = I18n.t(s.locked); row.setAttribute('data-pp-bar-reason', s.locked); } else { row.removeAttribute('title'); row.removeAttribute('data-pp-bar-reason'); }
    const label = row.querySelector('[data-cross-ref-label]');
    if (label) label.textContent = I18n.t(s.ref ? 'insert.crossRef.rowEdit' : 'insert.crossRef.row');
    row.setAttribute('aria-label', I18n.t(s.ref ? 'insert.crossRef.ariaEdit' : 'insert.crossRef.aria'));
  }

  // Pose un renvoi vers `id` au curseur (il remplace la sélection), ou change celui qui est sélectionné. `claim` ({ pos, id }) : l'adresse qu'un titre sans signet reçoit dans la même
  // transaction (js/link-dialog.js:claimInto) - un seul Annuler défait les deux. Le texte du renvoi est écrit par la mise à jour (appendTransaction), dans cette même transaction. Rend vrai
  // quand c'est fait.
  function put(editor, { id, mode, claim }) {
    if (!editor || !editor.isEditable || !Anchors.isId(id)) return false;
    const chosen = selectedRef(editor);
    const chain = editor.chain().focus();
    if (claim) chain.command(({ tr }) => { tr.setNodeAttribute(claim.pos, 'anchorId', claim.id); return true; });
    if (chosen) {
      // Une adresse posée sur un titre ne déplace rien : le renvoi garde sa place.
      chain.command(({ tr }) => {
        tr.setNodeAttribute(chosen.pos, 'target', id).setNodeAttribute(chosen.pos, 'mode', mode);
        return true;
      }).run();
      return true;
    }
    chain.insertContent({ type: NODE, attrs: { target: id, mode, label: '', broken: false } }).run();
    return true;
  }

  // Les renvois qui visent l'adresse `id` : { pos } de chacun. Un signet qu'on renomme change d'adresse (js/anchors.js:save) : ses renvois, comme ses liens, la suivent ; en retirant le signet, la
  // fenêtre dit combien de liens et de renvois resteront sans cible (`count`).
  function refsTo(doc, id) {
    const found = [];
    doc.descendants((node, pos) => {
      if (isRef(node)) { if (node.attrs.target === id) found.push({ pos }); return false; }
      return !node.isLeaf;
    });
    return found;
  }
  const count = (doc, id) => refsTo(doc, id).length;
  function retarget(doc, tr, from, to) {
    refsTo(doc, from).forEach(({ pos }) => tr.setNodeAttribute(pos, 'target', to));
  }

  // === À la Lecture et à l'export ===
  // Écrit dans `root` (le document résolu d'une ligne) le texte de chaque renvoi d'après le titre qu'il vise, tel que ce document le montre. Un renvoi dont le titre n'y est pas redevient du texte
  // seul : le lien n'aurait nulle part où mener.
  function resolveIn(root) {
    const refs = Array.from(root.querySelectorAll(`a.${CLASS}[${ATTR_ID}]`));
    if (!refs.length) return;
    const targets = targetsOfTree(root);
    refs.forEach(ref => {
      const entry = targets.get(ref.getAttribute(ATTR_ID));
      if (!entry) { ref.replaceWith(document.createTextNode(ref.textContent)); return; }
      ref.textContent = labelFor(entry, modeOf(ref.getAttribute(ATTR_MODE))) || ref.textContent;
    });
  }

  return { NODE, CLASS, MODES, DEFAULT_MODE, modeOf, labelFor, targetsOf, choices, createNode, createExtension, status, syncRow, selectedRef, put, count, retarget, resolveIn };
})();
