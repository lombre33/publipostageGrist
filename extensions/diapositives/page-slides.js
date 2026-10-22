// Une page de document en diapositives (extension « diapositives » de Grist Factory Suite ; demande du 22/10, lot 2 : « importer […] des pages de document dans des slides » ; cartes « En texte, dans les
// deux sens » et « Celle d'arrivée, avec une case »). Le volet « Importer » (extensions/diapositives/slide-import.js) et le Ctrl+V d'une sélection de document sur la bande (slide-strip.js) s'en servent.
//  - UNE PAGE est ce qui sépare deux sauts de page de premier niveau d'un document ; sans saut, tout le document est une page (slide-import.js : readSource).
//  - LE TEXTE de la page devient du texte de diapositive : les tailles du document sont remplacées par celles d'une diapositive (20 pt, titres à 44, 36, 28 pt…), ou gardées par la case « Garder la mise en forme
//    d'origine » (js/slide-text.js : toSlide). Les images devant ou derrière le texte deviennent des images du texte ; le reste (gras, couleur, listes, tableaux, variables) passe tel quel.
//  - UNE PAGE TROP LONGUE devient plusieurs diapositives, coupées entre deux blocs, jamais au milieu d'un paragraphe : le texte est posé hors de l'éditeur, à la largeur de la diapositive d'arrivée, et coupé
//    où la pagination de l'éditeur couperait (HeaderFooterPreview.breaksOf, la même géométrie de page) ; un tableau trop haut se coupe entre deux lignes (js/table-page-cut.js), une zone à deux colonnes ne se
//    coupe pas. Un bloc plus haut qu'une diapositive reste d'une pièce : l'éditeur le continue sur une page de plus, avec le point rouge de sa miniature.
// Tout se fait sur un document inerte (HtmlSanitize.parseInert) : rien ne s'y charge ni ne s'y exécute ; seule la copie qu'on mesure entre dans la page, sans ses images d'un autre site (js/external-images.js).
const PageSlides = (function () {
  const BREAK_CLASS = 'page-break-marker';
  const SLICE_ATTR = 'data-pm-slice';
  // Une sélection copiée de l'éditeur porte cet attribut sur son premier élément : c'est ainsi qu'on la reconnaît (une diapositive copiée porte en plus l'enveloppe `data-pp-slide`).
  const COPIED_BY_EDITOR = /\sdata-pm-slice(?:=|\s|>)/i;
  const COPIED_CHARS = 4096;
  const px = value => Math.max(0, Math.round(value * 100) / 100) + 'px';
  const isTable = block => block.tagName === 'TABLE' || block.classList.contains('tableWrapper');

  // Le HTML d'une sélection de l'éditeur d'un document (Ctrl+C), pas d'une diapositive ni d'un autre logiciel.
  function isEditorCopy(html) {
    if (typeof html !== 'string') return false;
    const head = html.slice(0, COPIED_CHARS);
    return COPIED_BY_EDITOR.test(head) && !/\sdata-pp-slide(?:=|\s|>)/i.test(head);
  }

  // Le texte posé hors de l'éditeur, de la largeur d'une diapositive d'arrivée (la page à l'écran) : un .tiptap affiché mais invisible, hors de la feuille. Mêmes marges, mêmes feuilles de style que l'éditeur.
  function measureHost() {
    const margins = PageLayout.getMarginsPx();
    const host = Dom.el('div', 'tiptap pp-page-slides-measure');
    host.setAttribute('aria-hidden', 'true');
    host.inert = true;
    Object.assign(host.style, {
      position: 'absolute', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box', minHeight: '0',
      width: px(PageLayout.getSheetWidthPx()), padding: [margins.top, margins.right, margins.bottom, margins.left].map(px).join(' '),
    });
    return host;
  }

  // Où couper `holder` : { after } (une coupure derrière le bloc de rang `after`) ou { after, row } (derrière la ligne `row - 1` du tableau de rang `after`), dans l'ordre. Mesuré sur une copie posée dans la page.
  function cutsOf(holder) {
    const blocks = Array.from(holder.children);
    if (!blocks.length || (blocks.length < 2 && !blocks.some(isTable))) return [];
    const copy = holder.cloneNode(true);
    ExternalImages.blockIn(copy, { zoom: 1 });
    // L'éditeur enveloppe chaque tableau de premier niveau (.tableWrapper, que la pagination mesure et coupe entre deux lignes) ; le HTML enregistré et celui du presse-papiers n'ont que le <table>.
    Array.from(copy.children).forEach((block) => {
      if (block.tagName !== 'TABLE') return;
      const wrapper = copy.ownerDocument.createElement('div');
      wrapper.className = 'tableWrapper';
      block.replaceWith(wrapper);
      wrapper.appendChild(block);
    });
    const host = measureHost();
    host.append(...Array.from(copy.childNodes));
    document.body.appendChild(host);
    try {
      const kids = Array.from(host.children);
      return HeaderFooterPreview.breaksOf(host)
        .filter(brk => !brk.zone && kids.indexOf(brk.afterEl) >= 0)
        .map(brk => (Number.isFinite(brk.rowIndex) ? { after: kids.indexOf(brk.afterEl), row: brk.rowIndex } : { after: kids.indexOf(brk.afterEl) }));
    } finally {
      host.remove();
    }
  }

  // Un tableau (le <table>, ou son enveloppe) coupé derrière les lignes `rows` (rang de la première ligne de chaque nouvelle partie) : un tableau par partie, mêmes attributs et mêmes colonnes ; les lignes passent de l'un à l'autre.
  function tableParts(block, rows) {
    const table = block.tagName === 'TABLE' ? block : block.querySelector(':scope > table');
    const body = table && table.querySelector(':scope > tbody');
    const all = body ? Array.from(body.children) : [];
    const bounds = [0].concat(rows.filter(row => row > 0 && row < all.length), [all.length]);
    if (bounds.length < 3) return [block];
    const colgroup = table.querySelector(':scope > colgroup');
    return bounds.slice(0, -1).map((from, i) => {
      if (!i) {
        all.slice(bounds[1]).forEach(row => row.remove());
        return block;
      }
      const part = block.cloneNode(false);
      part.removeAttribute(SLICE_ATTR);
      const partTable = block === table ? part : table.cloneNode(false);
      if (colgroup) partTable.appendChild(colgroup.cloneNode(true));
      const partBody = body.cloneNode(false);
      partBody.append(...all.slice(from, bounds[i + 1]));
      partTable.appendChild(partBody);
      if (partTable !== part) part.appendChild(partTable);
      return part;
    });
  }

  // Les diapositives de `holder` : la liste des nœuds de chacune, les blocs rangés dans l'ordre, coupés aux `cuts`.
  function slidesOf(holder, cuts) {
    const blocks = Array.from(holder.children);
    const slides = [[]];
    blocks.forEach((block, index) => {
      const rows = cuts.filter(cut => cut.after === index && Number.isFinite(cut.row)).map(cut => cut.row).sort((a, b) => a - b);
      if (rows.length) {
        tableParts(block, rows).forEach((part, i) => {
          if (i) slides.push([]);
          slides[slides.length - 1].push(part);
        });
      } else {
        slides[slides.length - 1].push(block);
      }
      if (cuts.some(cut => cut.after === index && !Number.isFinite(cut.row))) slides.push([]);
    });
    return slides.filter(nodes => nodes.length);
  }

  // Convertit en place `holder` (les blocs d'une page de document, dans un document inerte) en diapositives, séparées par un saut de page. Rend { html, slides, blank } : le HTML à coller, le nombre de
  // diapositives, et si rien de lisible n'en reste (`html` est alors vide). `keepFormat` : garde les tailles du document. Une sélection qui traverse des sauts de page (un Ctrl+C sur plusieurs pages)
  // se prend page par page : chaque saut ouvre une diapositive, et chaque page se coupe pour elle-même.
  function fromPage(holder, { keepFormat = false } = {}) {
    const result = SlideText.toSlide(holder, { keepFormat });
    if (result.blank) return { html: '', slides: 0, blank: true };
    const doc = holder.ownerDocument;
    const pages = [[]];
    Array.from(holder.children).forEach((block) => {
      if (block.classList.contains(BREAK_CLASS)) pages.push([]); else pages[pages.length - 1].push(block);
    });
    // Les pages blanches qui terminent la sélection n'en sont pas : un document ne les montre pas non plus (le saut qui les ouvre n'ouvre rien).
    while (pages.length > 1 && pages[pages.length - 1].every(SlideText.isBlank)) pages.pop();
    const slides = [];
    pages.filter(blocks => blocks.length).forEach((blocks) => {
      const page = doc.createElement('div');
      page.append(...blocks);
      slides.push(...slidesOf(page, cutsOf(page)));
    });
    const nodes = [];
    slides.forEach((group, i) => {
      if (i) {
        const brk = doc.createElement('div');
        brk.className = BREAK_CLASS;
        brk.setAttribute('contenteditable', 'false');
        nodes.push(brk);
      }
      nodes.push(...group);
    });
    holder.replaceChildren(...nodes);
    const first = holder.firstElementChild;
    if (first && !first.hasAttribute(SLICE_ATTR)) first.setAttribute(SLICE_ATTR, '0 0 []');
    return { html: holder.innerHTML, slides: slides.length, blank: false };
  }

  // Une sélection copiée de l'éditeur d'un document (HTML du presse-papiers) en diapositives, ou null quand `html` n'en est pas une : { html, slides, blank }.
  function fromEditorCopy(html, options) {
    if (!isEditorCopy(html)) return null;
    const body = HtmlSanitize.parseInert(html);
    return fromPage(body, options);
  }

  return { fromPage, fromEditorCopy, isEditorCopy };
})();
