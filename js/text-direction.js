// « Texte de droite à gauche » : le sens d'écriture d'un paragraphe, d'un titre ou d'une liste (hébreu, arabe, ou une mise en page en miroir), comme dans Word et dans PowerPoint. Demande du 24/10
// (import PowerPoint sans perte, chantier 9) : un paragraphe `rtl="1"` d'un fichier PowerPoint s'écrivait de gauche à droite et l'éditeur ne savait pas le garder.
//
// Le réglage est l'attribut `dir` (« rtl » ; absent, le texte va de gauche à droite) du paragraphe, du titre et de la liste (puce, numéro, cases) : `<p dir="rtl" data-dir="rtl">`. Les deux sont écrits - le
// navigateur lit `dir`, l'éditeur ne lit que `data-dir` à l'ouverture d'un HTML (un texte collé d'une page web garde son aspect habituel, comme pour les autres réglages de paragraphe). Une liste porte
// le sien : ses puces et ses numéros passent à droite (css/text-direction.css), ses points la suivent. Les retraits de « Paragraphe… » se comptent alors depuis la marge de droite
// (js/paragraph-format.js). Rien ne change pour un document qui ne s'en sert pas.
//
// Le réglage est une ligne à cocher du menu Alignement (#v2-btn-rtl) : cochée quand tous les paragraphes visés vont de droite à gauche, un clic le retire à tous, sinon un clic le pose à tous - sur les
// paragraphes et titres de la sélection (ou du curseur) et sur les listes qui les contiennent, en une transaction (un Annuler la défait d'un coup). Entrée garde le sens (le paragraphe suivant va dans le
// même sens). La Lecture et l'impression le montrent par la feuille de style ; le PDF (js/pdf-export.js), le Word (js/docx-export.js) et le PowerPoint (js/pptx-export.js) le lisent par `isRtl`.
const TextDirection = (function () {
  const ATTR = 'data-dir';
  const TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList'];
  const LISTS = ['bulletList', 'orderedList', 'taskList'];
  const isRtl = el => !!el && el.nodeType === 1 && el.getAttribute(ATTR) === 'rtl';

  function createExtension(Extension) {
    return Extension.create({
      name: 'ppTextDirection',
      addGlobalAttributes() {
        return [{
          types: TYPES,
          attributes: {
            dir: {
              default: null,
              parseHTML: el => (isRtl(el) ? 'rtl' : null),
              renderHTML: attrs => (attrs.dir === 'rtl' ? { dir: 'rtl', [ATTR]: 'rtl' } : {}),
            },
          },
        }];
      },
    });
  }

  // Les attributs d'un paragraphe ou d'une liste écrit à la main (l'import PowerPoint) : ` dir="rtl" data-dir="rtl"`, vide pour un texte de gauche à droite.
  const markup = rtl => (rtl ? ' dir="rtl" ' + ATTR + '="rtl"' : '');

  // Un élément va-t-il de droite à gauche pour l'affichage (le sien ou celui qu'il hérite) ? Pour les exports, qui lisent le DOM mesuré.
  const isShownRtl = el => !!el && getComputedStyle(el).direction === 'rtl';

  // Les blocs que le réglage vise dans la sélection : les paragraphes et titres du texte (jamais ceux d'un en-tête, d'un pied de page), et, pour ceux d'une liste, la liste qui les contient.
  function targets(editor) {
    const { selection, doc } = editor.state;
    const found = new Map();
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true;
      if (!node.attrs.caption) found.set(pos, node);
      const $pos = doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth--) {
        const ancestor = $pos.node(depth);
        if (LISTS.indexOf(ancestor.type.name) >= 0) { found.set($pos.before(depth), ancestor); break; }
      }
      return false;
    });
    return Array.from(found, ([pos, node]) => ({ pos, node }));
  }

  // `locked` : la clé de la raison du grisage, ou null ; `active` : tous les blocs visés vont de droite à gauche ; `targets` : ces blocs.
  function status(editor) {
    const list = HeaderFooterPreview.getHfMode() ? [] : targets(editor);
    const text = list.filter(t => t.node.type.name === 'paragraph' || t.node.type.name === 'heading');
    return { targets: list, active: text.length > 0 && text.every(t => t.node.attrs.dir === 'rtl'), locked: text.length ? null : 'textDirection.notHere' };
  }

  // La ligne du menu à l'état de la sélection : cochée, grisée par aria-disabled et `v2-hover-row-disabled` avec sa raison pour info-bulle (comme « Garder avec le suivant »).
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const s = status(editor);
    row.setAttribute('aria-checked', s.active ? 'true' : 'false');
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) row.title = I18n.t(s.locked); else row.removeAttribute('title');
  }

  // Le clic sur la ligne : pose le sens sur tous les blocs visés, ou le retire à tous quand tous l'ont. Une seule transaction. Faux, sans rien changer, quand la ligne est grisée.
  function run(editor) {
    if (!editor || !editor.isEditable) return false;
    const s = status(editor);
    if (s.locked) return false;
    const value = s.active ? null : 'rtl';
    const tr = editor.state.tr;
    s.targets.forEach((t) => { if ((t.node.attrs.dir || null) !== value) tr.setNodeAttribute(t.pos, 'dir', value); });
    if (!tr.docChanged) return false;
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }

  return { ATTR, createExtension, isRtl, isShownRtl, markup, syncRow, run };
})();
