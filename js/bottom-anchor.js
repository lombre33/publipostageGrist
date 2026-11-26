// « En bas de la page » (demande du 26/11, carte « Réglage sur la sélection ») : un réglage des blocs du texte pour caler une signature, un bloc de fin ou des mentions
// au bas de la page, quelle que soit la longueur du texte au-dessus. En publipostage, la valeur d'une variable ne prend pas la place de son nom : un bloc placé à la main
// (des lignes vides) se décalait d'une fiche à l'autre ; ici sa place est celle du bas de la page, mesurée sur ce que la fiche écrit vraiment.
//
// Le RÉGLAGE est un attribut des blocs de premier niveau du texte (`<p data-bottom-anchor="true">`, comme `data-keep-next`, mais sur tout bloc : paragraphe, titre, liste,
// citation, tableau, encadré, bloc de signature, zone 2 colonnes). Rien ne change pour un document qui ne s'en sert pas.
//
// La RÈGLE, la même dans l'éditeur, la Lecture, l'impression, le PDF, le Word et l'ODT :
//  - une SUITE est un ou plusieurs blocs de premier niveau qui portent le réglage et se suivent ; la suite se pose au bas de la page où elle tombe ;
//  - si elle ne tient pas dans la place restante de cette page, elle passe en haut de la page suivante et se cale au bas de celle-ci ;
//  - ce qui la suit (s'il y a quelque chose, saut de page posé à la main mis à part) repart en haut de la page d'après : l'ordre de lecture ne change pas ;
//  - une suite plus haute qu'une page ne se cale pas : elle se range comme le reste du texte (`fits`).
// Une légende (js/caption.js) suit son image ou son tableau : le réglage se pose aussi sur les légendes qui le suivent.
//
// Le réglage est une ligne à cocher du menu Alignement (#v2-btn-bottom-anchor). Il vaut pour les blocs de premier niveau qui touchent la sélection (le tableau entier quand le
// curseur est dans une de ses cases) : cochée quand tous le portent, un clic le retire à tous, sinon un clic le pose à tous. La ligne est grisée, avec sa raison en info-bulle,
// dans un bloc de texte conditionnel, un en-tête ou un pied de page, et sur ce qui n'est pas un bloc du texte (cadre libre d'une présentation, repère de saut de page, sommaire).
//
// Qui décide de la place : l'éditeur (js/header-footer-preview.js, computePageBreaks), la Lecture et l'impression (js/reader-mode.js), le PDF (js/pdf-export.js : une passe de
// mesure donne la place qui reste, un espace la remplit), le Word (js/docx-export.js : un tableau flottant calé au bas de la marge) et l'ODT (js/odt-export.js : un cadre calé au
// bas de la zone de texte). `isAnchoredElement` dit si un bloc de premier niveau est calé, `runFrom` quels blocs forment la suite, `fits` jusqu'à quelle hauteur on la cale.
const BottomAnchor = (function () {
  const ATTR = 'data-bottom-anchor';
  const isOn = el => el.hasAttribute(ATTR) && el.getAttribute(ATTR) !== 'false';
  // Les blocs de premier niveau qui peuvent porter le réglage (les nœuds de l'éditeur) ; tout autre bloc (cadre libre, repère de saut de page, sommaire, numérotation des
  // titres, bloc de texte conditionnel) le refuse : la ligne du menu est alors grisée.
  const TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'table', 'callout', 'twoColumnsZone'];

  // `libs` : les classes de ProseMirror que js/editor.js a déjà chargées ({ Plugin, PluginKey, Decoration, DecorationSet }).
  function createExtension(Extension, libs) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = libs;
    return Extension.create({
      name: 'bottomAnchor',
      addGlobalAttributes() {
        return [{
          types: TYPES,
          attributes: {
            bottomAnchor: {
              default: false,
              // Entrée à la fin d'un paragraphe calé ouvre un paragraphe ordinaire : le réglage est un geste, il ne se propage pas à ce qu'on écrit ensuite.
              keepOnSplit: false,
              parseHTML: el => isOn(el),
              renderHTML: attrs => (attrs.bottomAnchor ? { [ATTR]: 'true' } : {}),
            },
          },
        }];
      },
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('bottomAnchorMark'),
          props: {
            // Le tableau, la zone 2 colonnes et l'encadré ont une vue de nœud qui ne rend pas les attributs globaux : la marque est posée sur leur élément de premier
            // niveau par une décoration, que la pagination de l'éditeur (js/header-footer-preview.js) lit sur le DOM. Rien n'en reste dans le document ni dans les exports.
            decorations(state) {
              const found = [];
              state.doc.forEach((node, offset) => {
                if (node.attrs && node.attrs.bottomAnchor) found.push(Decoration.node(offset, offset + node.nodeSize, { [ATTR]: 'true' }));
              });
              return found.length ? DecorationSet.create(state.doc, found) : null;
            },
          },
        })];
      },
    });
  }

  // Un bloc de premier niveau du HTML (de l'éditeur, de la Lecture, du PDF...) est-il calé en bas de la page ?
  function isAnchoredElement(el) {
    return !!el && el.nodeType === 1 && isOn(el);
  }

  // La suite de blocs calés qui commence au bloc `index` de `children` (les blocs de premier niveau, jusqu'à `end` exclu) : ses membres, ou null quand `index` n'ouvre pas une
  // suite (il n'est pas calé, ou il prolonge une suite que son premier bloc a déjà traitée).
  function runFrom(children, index, end) {
    if (!isAnchoredElement(children[index]) || (index > 0 && isAnchoredElement(children[index - 1]))) return null;
    const members = [];
    for (let i = index; i < end && isAnchoredElement(children[i]); i++) members.push(children[i]);
    return members.length ? { members } : null;
  }

  // Les blocs calés tiennent-ils dans une page ? Plus hauts qu'elle, ils se rangent comme le reste du texte (aucun calage ne les ferait tenir). `runHeight` et `pageHeight`
  // dans la même unité.
  function fits(runHeight, pageHeight) {
    return runHeight > 0 && runHeight <= pageHeight;
  }

  // La ligne du menu : les blocs de premier niveau que le réglage vise dans la sélection, avec les légendes qui suivent un bloc visé (elles voyagent avec lui).
  function eligibleBlocks(editor) {
    const { selection, doc } = editor.state;
    const found = [];
    let refused = false;
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (parent !== doc) return false;
      if (TYPES.includes(node.type.name)) found.push({ node, pos }); else refused = true;
      return false;
    });
    if (refused || !found.length) return [];
    const isCaption = n => n.type.name === 'paragraph' && !!n.attrs.caption;
    // Les légendes qui suivent le dernier bloc visé (une légende d'image ou de tableau) : le bloc et sa légende ne se séparent pas.
    let index = doc.childCount;
    let offset = 0;
    doc.forEach((n, o, i) => { if (o === found[found.length - 1].pos) { index = i; offset = o + n.nodeSize; } });
    for (let i = index + 1; i < doc.childCount && isCaption(doc.child(i)); i++) {
      const node = doc.child(i);
      found.push({ node, pos: offset });
      offset += node.nodeSize;
    }
    return found;
  }

  // `locked` : la clé de la raison du grisage, ou null ; `active` : tous les blocs visés portent le réglage ; `targets` : ces blocs.
  function status(editor) {
    const targets = HeaderFooterPreview.getHfMode() ? [] : eligibleBlocks(editor);
    const active = targets.length > 0 && targets.every(t => t.node.attrs.bottomAnchor);
    return { targets, active, locked: targets.length ? null : 'bottomAnchor.notHere' };
  }

  // La ligne du menu à l'état de la sélection : cochée, grisée par aria-disabled et `v2-hover-row-disabled` (comme « Garder avec le suivant ») avec sa raison pour info-bulle,
  // sortie de l'ordre des tabulations quand elle est grisée.
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const s = status(editor);
    row.setAttribute('aria-checked', s.active ? 'true' : 'false');
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) { row.title = I18n.t(s.locked); row.setAttribute('data-pp-bar-reason', s.locked); } else { row.removeAttribute('title'); row.removeAttribute('data-pp-bar-reason'); }
  }

  // Le clic sur la ligne : pose le réglage sur tous les blocs visés, ou le retire à tous quand tous le portent. Une seule transaction (un Annuler la défait d'un coup). Faux,
  // sans rien changer, quand la ligne est grisée ou que l'éditeur n'est pas modifiable.
  function run(editor) {
    if (!editor || !editor.isEditable) return false;
    const s = status(editor);
    if (s.locked) return false;
    const { state, view } = editor;
    const tr = state.tr;
    s.targets.forEach(t => { if (!!t.node.attrs.bottomAnchor === s.active) tr.setNodeAttribute(t.pos, 'bottomAnchor', !s.active); });
    if (!tr.docChanged) return false;
    view.dispatch(tr);
    view.focus();
    return true;
  }

  return { ATTR, createExtension, isAnchoredElement, runFrom, fits, eligibleBlocks, status, syncRow, run };
})();
