// « Garder avec le suivant » : un réglage des paragraphes du texte, comme dans Word, pour que les totaux d'une facture ne se coupent plus entre deux
// pages. Un paragraphe qui le porte (`<p data-keep-next="true">`, un attribut du paragraphe comme l'alignement ou la légende) reste sur la même page
// que le bloc qui le suit ; plusieurs paragraphes de suite qui le portent restent tous avec le bloc qui les suit, le premier qui ne le porte pas.
// Rien ne change pour un document qui ne s'en sert pas.
//
// Le réglage est une ligne à cocher du menu Alignement (#v2-btn-keep-next). Il vaut pour les paragraphes sélectionnés (ou celui du curseur) : cochée
// quand tous le portent, un clic le retire à tous, sinon un clic le pose à tous. Il se pose sur les paragraphes du texte courant, y compris dans un
// bloc de texte conditionnel (c'est là que sont les lignes de totaux d'une facture) ; la ligne est grisée, avec sa raison en info-bulle, partout
// ailleurs : un tableau, une liste, une colonne, un encadré, une citation, un titre, une légende (elle reste déjà avec son bloc, js/caption.js), une
// grille, un en-tête ou un pied de page. Entrée à la fin d'un paragraphe qui le porte ouvre un paragraphe qui ne le porte pas : une suite se règle
// ligne par ligne ou d'un coup, sur une sélection.
//
// Au saut de page, l'éditeur (js/header-footer-preview.js), la Lecture (js/reader-mode.js), le PDF (js/pdf-export.js) et le Word (js/docx-export.js)
// le décident sur le HTML : `isKeptElement` dit si un bloc de premier niveau est gardé, `runFrom` quels blocs restent ensemble, `fits` jusqu'à quelle
// hauteur on les garde (même plafond que la légende : au-delà, ils restent comme avant). Le Word, lui, met « Conserver avec le suivant » (w:keepNext)
// sur chaque paragraphe gardé et laisse Word décider.
const KeepWithNext = (function () {
  const ATTR = 'data-keep-next';
  const isOn = el => el.hasAttribute(ATTR) && el.getAttribute(ATTR) !== 'false';

  function createExtension(Extension) {
    return Extension.create({
      name: 'keepNext',
      addGlobalAttributes() {
        return [{
          types: ['paragraph'],
          attributes: {
            keepNext: {
              default: false,
              // Entrée à la fin d'un paragraphe gardé ouvre un paragraphe ordinaire : le réglage est un geste, il ne se propage pas à tout ce qu'on
              // écrit ensuite.
              keepOnSplit: false,
              parseHTML: el => isOn(el),
              renderHTML: attrs => (attrs.keepNext ? { [ATTR]: 'true' } : {}),
            },
          },
        }];
      },
    });
  }

  // Au saut de page Un bloc de premier niveau est gardé avec le suivant : un paragraphe qui porte le réglage (jamais une légende : elle est déjà liée
  // à son bloc), ou un bloc de texte conditionnel (l'éditeur le montre d'une pièce) dont le dernier bloc l'est. À la Lecture, au PDF et au Word le
  // bloc conditionnel est déjà défait : ce sont ses paragraphes qui se suivent.
  function isKeptElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === 'P') return isOn(el) && !Caption.isCaptionElement(el);
    if (el.classList.contains('conditional-text')) {
      const content = el.querySelector(':scope > .conditional-text-content') || el;
      return isKeptElement(content.lastElementChild);
    }
    return false;
  }

  // Les blocs qui restent ensemble, à partir du bloc `index` de `children` (les blocs de premier niveau, jusqu'à `end` exclu) : `members`, les blocs
  // gardés qui se suivent, et `target`, le bloc qui les suit (le premier qui ne l'est pas) ; null quand `index` n'ouvre pas une telle suite (il n'est
  // pas gardé, ou il en prolonge une que son premier bloc a déjà traitée). Un saut de page ou la fin du texte ne sont pas un bloc à garder : la suite
  // ne compte alors que ses blocs gardés, et reste vide s'il n'y en a qu'un.
  function runFrom(children, index, end) {
    if (!isKeptElement(children[index]) || (index > 0 && isKeptElement(children[index - 1]))) return null;
    const members = [];
    let i = index;
    while (i < end && isKeptElement(children[i])) members.push(children[i++]);
    const next = i < end ? children[i] : null;
    const target = next && !next.classList.contains('page-break-marker') ? next : null;
    return members.length + (target ? 1 : 0) > 1 ? { members, target } : null;
  }

  // La suite et la tête du bloc qui la suit tiennent-elles dans une page ? Même plafond que le bloc et sa légende (Caption.fitsWithCaption) :
  // au-delà, pdfmake ne saurait pas les garder et l'aperçu laisserait une page presque vide. `unitHeight` et `pageHeight` dans la même unité.
  function fits(unitHeight, pageHeight) {
    return unitHeight <= TablePageCut.MAX_ROW_RATIO * pageHeight;
  }

  // La ligne du menu Les paragraphes que le réglage vise dans la sélection : ceux du texte courant (le document ou un bloc de texte conditionnel, à
  // toute profondeur de ces blocs), sauf les légendes.
  function eligibleParagraphs(editor) {
    const { selection, doc } = editor.state;
    const found = [];
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        if (!node.attrs.caption) found.push({ node, pos });
        return false;
      }
      return node.type.name === 'conditionalText';
    });
    return found;
  }

  // `locked` : la clé de la raison du grisage, ou null ; `active` : tous les paragraphes visés portent le réglage ; `targets` : ces paragraphes.
  function status(editor) {
    const targets = HeaderFooterPreview.getHfMode() ? [] : eligibleParagraphs(editor);
    const active = targets.length > 0 && targets.every(t => t.node.attrs.keepNext);
    return { targets, active, locked: targets.length ? null : 'keepNext.notHere' };
  }

  // La ligne du menu à l'état de la sélection : cochée, grisée par aria-disabled et `v2-hover-row-disabled` (comme les lignes du menu Page) avec sa
  // raison pour info-bulle, sortie de l'ordre des tabulations quand elle est grisée.
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const s = status(editor);
    row.setAttribute('aria-checked', s.active ? 'true' : 'false');
    row.setAttribute('aria-disabled', s.locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!s.locked);
    row.tabIndex = s.locked ? -1 : 0;
    if (s.locked) row.title = I18n.t(s.locked); else row.removeAttribute('title');
  }

  // Le clic sur la ligne : pose le réglage sur tous les paragraphes visés, ou le retire à tous quand tous le portent. Une seule transaction (un
  // Annuler la défait d'un coup). Faux, sans rien changer, quand la ligne est grisée ou que l'éditeur n'est pas modifiable.
  function run(editor) {
    if (!editor || !editor.isEditable) return false;
    const s = status(editor);
    if (s.locked) return false;
    const { state, view } = editor;
    const tr = state.tr;
    s.targets.forEach(t => { if (!!t.node.attrs.keepNext === s.active) tr.setNodeAttribute(t.pos, 'keepNext', !s.active); });
    if (!tr.docChanged) return false;
    view.dispatch(tr);
    view.focus();
    return true;
  }

  return { createExtension, isKeptElement, runFrom, fits, syncRow, run };
})();
