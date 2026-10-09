// Coupure d'une zone à deux colonnes au saut de page. Le PDF (pdfmake) coupe une zone là où la page finit, chaque colonne à sa propre ligne : la colonne
// la plus longue continue en haut de la page suivante, l'autre finit sur la première si elle y tient. L'aperçu de l'éditeur (js/header-footer-preview.js)
// comme la Lecture (js/reader-mode.js), qui ne coupaient que ENTRE deux blocs de premier niveau, gardaient la zone d'une pièce : une zone plus haute que la
// place qui reste dépassait le bas de la feuille et n'ouvrait jamais la page suivante, alors que le PDF et l'impression navigateur (qui découpe la Lecture)
// la coupaient, chacun à un endroit. Ce module ne contient que ce que les deux aperçus ont en commun : retrouver les blocs de chaque colonne
// (`blocksOf`), les mesurer (`measure`), décider quel bloc de chaque colonne ouvre la page suivante (`plan`), et poser les règles CSS qui descendent ces
// blocs sous la couture (`place`). Le grain est le bloc d'une colonne (un paragraphe, une liste, un tableau... jamais coupé en deux, comme partout dans
// l'aperçu). Les aperçus ne touchent jamais au DOM de ProseMirror : le bloc est descendu par une feuille de style (sa marge haute), comme les marges de
// coupure des blocs de premier niveau, le document enregistré n'en sait rien.
const ZonePageCut = (function () {
  // Un bloc qui dépasse de moins que cela la place de la page y tient : l'arrondi des rectangles (zoom de la feuille) ne doit pas ouvrir une page.
  const EPSILON_PX = 0.5;

  // Les deux colonnes d'une zone (`zoneEl` : l'élément `.two-columns-zone`, l'enfant de l'enveloppe de l'éditeur ou la zone elle-même en Lecture) ; null
  // si elle n'en a pas deux.
  function columnsOf(zoneEl) {
    const columns = zoneEl ? Array.from(zoneEl.querySelectorAll(':scope > .two-columns-column')) : [];
    return columns.length === 2 ? columns : null;
  }

  // Paragraphe sans texte ni objet (un <br> décoratif ne compte pas) : la ligne vide qu'on obtient en appuyant sur Entrée.
  function isBlankParagraph(el) {
    return el.tagName === 'P' && !el.textContent.trim() && !el.querySelector(':scope > :not(br)');
  }

  // Les blocs d'une colonne qui comptent pour la pagination, dans l'ordre. `trimTail` : les lignes vides au bas des colonnes de la DERNIÈRE zone du
  // document ne comptent pas (la Lecture et les exports les retirent, ReaderMode.trimTrailingBlankBlocks : sans cadre ni fond à l'impression elles ne
  // font que rallonger la zone) ; l'éditeur les garde, elles dépassent la dernière page sans en ouvrir une. Une colonne garde toujours son premier bloc.
  function blocksOf(column, trimTail) {
    const blocks = Array.from(column.children);
    if (trimTail) while (blocks.length > 1 && isBlankParagraph(blocks[blocks.length - 1])) blocks.pop();
    return blocks;
  }

  // Mesure une zone pour `plan`. `zoom` : le facteur de la feuille (les rectangles sont en pixels écran, la page en pixels de mise en page). Rend, pour
  // chaque colonne, ses blocs, leur haut et leur bas (pixels de mise en page depuis le haut de la zone) et la hauteur de son bas de colonne (padding et
  // bordure, qui ne se rangent pas dans la page : c'est de la marge, pas du contenu) ; null si la zone n'a pas deux colonnes.
  function measure(zoneEl, zoom, trimTail) {
    const columns = columnsOf(zoneEl);
    if (!columns) return null;
    const zoneTop = zoneEl.getBoundingClientRect().top;
    return {
      zone: zoneEl,
      columns: columns.map(column => {
        const blocks = blocksOf(column, trimTail);
        const rects = blocks.map(block => block.getBoundingClientRect());
        const style = getComputedStyle(column);
        return {
          blocks,
          tops: rects.map(rect => (rect.top - zoneTop) / zoom),
          bottoms: rects.map(rect => (rect.bottom - zoneTop) / zoom),
          endPad: (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0),
        };
      }),
    };
  }

  // Où la zone change de page. `consumedBefore` : ce que la page en cours porte déjà au-dessus de la zone (0 : elle est en haut de page) ; `gapAbove` :
  // l'écart entre ce qui la précède et son bord haut (sa marge) ; `gapBelow` : celui qui la sépare du bloc suivant ; `capacity` : la hauteur utile d'une
  // page. Chaque colonne se plan à part, comme le PDF : son premier bloc qui ne tient pas dans la place restante ouvre la page suivante (il y passe en
  // haut du corps de page, avec tout ce qui le suit), sauf s'il est seul en haut de page (un bloc plus haut que la page reste là et déborde : il n'y a
  // rien de mieux à faire). Rend
  //  - blockBreakBefore : même le premier bloc de CHAQUE colonne ne tient pas dans la place restante, la zone entière passe à la page suivante (coupure
  //    avant la zone, comme pour tout autre bloc) ;
  //  - cuts : une entrée par frontière de page DANS la zone, `{ ranks, lasts }` : pour chaque colonne le rang du bloc qui ouvre la page suivante
  //    (null : cette colonne ne continue pas) et le rang du dernier bloc qu'elle garde sur la page qui finit (null : aucun) ;
  //  - consumedAfter : ce que la dernière page de la zone porte, écart avant le bloc suivant compris.
  function plan(consumedBefore, gapAbove, measured, capacity, gapBelow) {
    const run = (consumed, gap) => {
      const start = consumed + gap;
      return measured.columns.map(column => {
        const ranks = [];
        let pageTop = -start;
        column.blocks.forEach((block, j) => {
          const fits = column.bottoms[j] - pageTop <= capacity + EPSILON_PX;
          if (!fits && (j > 0 || consumed > EPSILON_PX)) { ranks.push(j); pageTop = column.tops[j]; }
        });
        const last = column.blocks.length - 1;
        return { ranks, end: last >= 0 ? column.bottoms[last] - pageTop + column.endPad : 0 };
      });
    };
    let perColumn = run(consumedBefore, gapAbove);
    const blockBreakBefore = consumedBefore > EPSILON_PX && perColumn.every(column => column.ranks[0] === 0);
    if (blockBreakBefore) perColumn = run(0, 0);
    const pages = Math.max(...perColumn.map(column => column.ranks.length));
    const cuts = Array.from({ length: pages }, (_, k) => ({
      ranks: perColumn.map(column => (column.ranks.length > k ? column.ranks[k] : null)),
      lasts: perColumn.map((column, c) => {
        if (column.ranks.length < k) return null;
        const last = column.ranks.length > k ? column.ranks[k] - 1 : measured.columns[c].blocks.length - 1;
        return last >= 0 ? last : null;
      }),
    }));
    const consumedAfter = Math.max(...perColumn.filter(column => column.ranks.length === pages).map(column => column.end)) + (gapBelow || 0);
    return { blockBreakBefore, cuts, consumedAfter };
  }

  // Pose une frontière de page dans la zone `zoneEl`. `cut` : une entrée de `plan().cuts` ; `blocks` : les blocs de chaque colonne (ceux de `measure`) ; `env` :
  //  - rootTop : le haut (pixels écran) de ce qui porte la page (`.tiptap`, `.reader-content`), `zoom` : le facteur de la feuille ;
  //  - bodyTopRel : le haut du corps de la page qui finit depuis `rootTop` (pixels de mise en page), `pageContentHeightPx` : la hauteur utile d'une page ;
  //  - seamHeight : la hauteur de la couture ;
  //  - selector : le sélecteur CSS de la zone (`.two-columns-zone`).
  // Le bas de la page qui finit est le plus bas des derniers blocs que les colonnes y gardent ; ce qui reste jusqu'au bas du corps de page
  // (`remaining`) et la couture sont réservés comme sous un bloc de premier niveau, mais DANS les colonnes : le bloc qui ouvre la page suivante descend
  // jusqu'en haut du corps de la page suivante (sa marge haute), les deux colonnes y reprennent à la même hauteur. Rend les règles à poser (une par
  // colonne qui continue, à appliquer dans l'ordre : la frontière suivante mesure ce que celle-ci a déplacé), le bas de la page qui finit en pixels
  // écran, ce qui reste dessous et la bande de la hauteur de la zone que la couture recouvre (`strip` : du bas de la page qui finit au haut de la page
  // suivante, pixels de mise en page depuis le haut de la zone ; l'éditeur la rogne, cf. TablePageCut.clipRule : le liseré de la zone et les bordures
  // de ses colonnes ne traversent pas les marges de la couture).
  function place(cut, zoneEl, blocks, env) {
    let afterBottomScreen = -Infinity;
    cut.lasts.forEach((last, c) => {
      if (last != null && blocks[c][last]) afterBottomScreen = Math.max(afterBottomScreen, blocks[c][last].getBoundingClientRect().bottom);
    });
    if (afterBottomScreen === -Infinity) afterBottomScreen = env.rootTop + env.bodyTopRel * env.zoom;
    const afterBottomRel = (afterBottomScreen - env.rootTop) / env.zoom;
    const remaining = Math.max(0, env.pageContentHeightPx - (afterBottomRel - env.bodyTopRel));
    const nextBodyTopRel = afterBottomRel + remaining + env.seamHeight;
    const rules = [];
    cut.ranks.forEach((rank, c) => {
      if (rank == null || !blocks[c][rank]) return;
      const topScreen = blocks[c][rank].getBoundingClientRect().top;
      const previous = blocks[c][rank - 1];
      // Le bloc est descendu de ce qu'il faut pour que son bord haut tombe en haut du corps de la page suivante : sa marge haute devient l'écart qui le
      // sépare de son voisin plus ce déplacement (sans voisin, c'est le bloc de tête de la colonne, dont la marge haute est nulle).
      const gapNow = previous ? Math.max(0, (topScreen - previous.getBoundingClientRect().bottom) / env.zoom) : 0;
      const push = nextBodyTopRel - (topScreen - env.rootTop) / env.zoom;
      rules.push(env.selector + ' > .two-columns-column:nth-child(' + (c + 1) + ') > :nth-child(' + (rank + 1) + ') { margin-top: ' + (gapNow + Math.max(0, push)) + 'px !important; }');
    });
    const stripTop = (afterBottomScreen - zoneEl.getBoundingClientRect().top) / env.zoom;
    return { rules, afterBottomScreen, afterBottomRel, remaining, strip: { top: stripTop, bottom: stripTop + remaining + env.seamHeight } };
  }

  return { EPSILON_PX, columnsOf, blocksOf, isBlankParagraph, measure, plan, place };
})();
