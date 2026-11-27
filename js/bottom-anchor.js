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
// DANS UNE COLONNE d'une zone à deux colonnes (demande du 27/11), le réglage se pose sur les blocs de la colonne que la sélection touche et la même règle s'applique à leurs suites, DANS la colonne :
// elles descendent au bas du corps de la page où elles tombent par un décalage visuel, sans que la zone, l'autre colonne ni le texte qui suit ne bougent (`columnShifts`) ; elles ne passent pas sur
// le bloc de leur colonne qui les suit, ni, quand du texte suit la zone sur la même page, sous le bas naturel de la zone. Le PDF les cale par une marge mesurée (js/pdf-export.js) ; le Word et l'ODT
// les laissent à leur place dans la colonne (le Word écrit la zone en tableau, l'ODT en blocs l'un après l'autre : ni l'un ni l'autre n'a de calage par colonne).
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
            // Les blocs d'une colonne d'une zone à deux colonnes ont la même marque (un tableau ou un encadré de colonne a lui aussi une vue de nœud).
            decorations(state) {
              const found = [];
              const mark = (node, offset) => {
                if (node.attrs && node.attrs.bottomAnchor) found.push(Decoration.node(offset, offset + node.nodeSize, { [ATTR]: 'true' }));
              };
              state.doc.forEach((node, offset) => {
                mark(node, offset);
                if (node.type.name === 'twoColumnsZone') node.forEach((column, columnOffset) => column.forEach((block, blockOffset) => mark(block, offset + 1 + columnOffset + 1 + blockOffset)));
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

  // « En bas de la page » DANS une colonne d'une zone à deux colonnes (demande du 27/11 : « la sélection va tout en bas de la page, mais sans influencer le reste des éléments des colonnes ») : de combien
  // descendent les blocs calés de chaque colonne. Une suite (`runFrom` sur les blocs de la colonne) se cale au bas du corps de la page où elle tombe, par un décalage VISUEL (ni la zone, ni l'autre colonne, ni
  // ce qui suit ne bougent), une fois les coupures posées ; la suite que la coupure de la zone sépare en deux pages se cale page par page. Elle s'arrête AVANT ce qui la gênerait sur cette page : le bloc qui
  // la suit dans sa colonne, ou, quand du texte suit la zone sur la même page (« s'il reste du texte sous la zone, ça ne pourra pas aller en bas de page »), le bas naturel de la zone (la zone ne grandit pas). Une suite plus
  // haute que la place qui lui reste ne bouge pas. `env` (pixels de mise en page depuis le haut du texte, sur la feuille nue) : `columns` (les éléments des colonnes), `below` (le bloc de premier niveau
  // rendu qui suit la zone, ou null), `topRel(el)`, `bottomRel(el)`, `pageOf(rel)` (la page où tombe cette ordonnée), `bodyBottomOf(page)`. Rend `[{ column, lo, hi, px }]` : les rangs (depuis 1) du premier et du
  // dernier bloc qui descendent de `px`, dans la colonne `column` (depuis 0).
  function columnShifts(env) {
    const shifts = [];
    env.columns.forEach((columnEl, column) => {
      const blocks = Array.from(columnEl.children);
      blocks.forEach((block, index) => {
        const run = runFrom(blocks, index, blocks.length);
        if (!run) return;
        const groups = [];
        run.members.forEach((member) => {
          const page = env.pageOf(env.topRel(member));
          const group = groups[groups.length - 1];
          if (group && group.page === page) group.members.push(member); else groups.push({ page, members: [member] });
        });
        groups.forEach((group) => {
          const first = group.members[0];
          const last = group.members[group.members.length - 1];
          const bodyBottom = env.bodyBottomOf(group.page);
          let limit = bodyBottom;
          const stop = el => el && env.topRel(el) < bodyBottom - 0.01 && env.pageOf(env.topRel(el)) === group.page;
          if (stop(last.nextElementSibling)) limit = Math.min(limit, env.topRel(last.nextElementSibling));
          // Du texte suit la zone sur cette page : le bas naturel de la zone, le plus bas des derniers blocs de ses colonnes sur cette page.
          if (stop(env.below)) {
            let natural = -Infinity;
            env.columns.forEach((other) => {
              const onPage = Array.from(other.children).filter(el => env.pageOf(env.topRel(el)) === group.page);
              if (onPage.length) natural = Math.max(natural, env.bottomRel(onPage[onPage.length - 1]));
            });
            limit = Math.min(limit, natural);
          }
          const px = limit - env.bottomRel(last);
          if (px > 0.01) shifts.push({ column, lo: blocks.indexOf(first) + 1, hi: blocks.indexOf(last) + 1, px: Math.round(px * 100) / 100 });
        });
      });
    });
    return shifts;
  }

  // La zone à deux colonnes dont la sélection est TOUT ENTIÈRE dans ses colonnes (le curseur dans un paragraphe d'une colonne, des lignes choisies d'une colonne, ou d'une colonne à l'autre), ou null : la
  // sélection qui sort de la zone (début avant elle, fin après) ou qui est la zone elle-même (sélection d'objet) vise la zone entière, comme un tableau.
  function zoneAround(editor) {
    const { $from, $to } = editor.state.selection;
    if ($from.depth < 1 || $from.node(1).type.name !== 'twoColumnsZone') return null;
    return $to.depth >= 1 && $to.node(1) === $from.node(1) ? $from.node(1) : null;
  }

  // La ligne du menu : les blocs que le réglage vise dans la sélection, avec les légendes qui suivent un bloc visé (elles voyagent avec lui). Ce sont les blocs de premier niveau qui la touchent (le tableau
  // entier quand le curseur est dans une de ses cases) ; DANS une zone à deux colonnes (demande du 27/11 : « sur les 4 lignes de la fin de la colonne de gauche, j'ai mis l'option »), les blocs de ses
  // colonnes que la sélection touche : ils se calent seuls au bas de la page, sans que la zone, ni l'autre colonne, ni ce qui suit ne bougent. Une zone déjà calée en entier (un document d'avant) reste visée
  // en entier : cochée, un clic la décale.
  function eligibleBlocks(editor) {
    const { selection, doc } = editor.state;
    const zone = zoneAround(editor);
    const inColumn = !!zone && !zone.attrs.bottomAnchor;
    const found = [];
    let refused = false;
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (inColumn) {
        if (parent.type.name !== 'twoColumnsColumn') return true;
      } else if (parent !== doc) return false;
      if (TYPES.includes(node.type.name)) found.push({ node, pos }); else refused = true;
      return false;
    });
    if (refused || !found.length) return [];
    const isCaption = n => n.type.name === 'paragraph' && !!n.attrs.caption;
    // Les légendes qui suivent le dernier bloc visé (une légende d'image ou de tableau) : le bloc et sa légende ne se séparent pas.
    const last = found[found.length - 1];
    const $last = doc.resolve(last.pos);
    let offset = last.pos + last.node.nodeSize;
    for (let i = $last.index() + 1; i < $last.parent.childCount && isCaption($last.parent.child(i)); i++) {
      const node = $last.parent.child(i);
      found.push({ node, pos: offset });
      offset += node.nodeSize;
    }
    return found;
  }

  // `locked` : la clé de la raison du grisage, ou null ; `active` : tous les blocs visés portent le réglage ; `targets` : ces blocs.
  function status(editor) {
    const hfMode = HeaderFooterPreview.getHfMode();
    const targets = hfMode ? [] : eligibleBlocks(editor);
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

  return { ATTR, createExtension, isAnchoredElement, runFrom, fits, columnShifts, eligibleBlocks, status, syncRow, run };
})();
