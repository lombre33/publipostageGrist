// Coupure d'un tableau entre deux lignes, au saut de page (Antoine, 01/10 : « un tableau ne se coupe pas au moment du saut de page »).
// Une ligne de tableau ne se coupe jamais en deux : le PDF (dontBreakRows de pdfmake) et le Word (cantSplit) la passent en entier à la page suivante quand elle ne tient pas,
// et l'aperçu de l'éditeur (js/header-footer-preview.js) comme la Lecture (js/reader-mode.js) posent la couture à cet endroit, entre deux lignes, au lieu de la laisser
// recouvrir une ligne ou de laisser le tableau déborder en bas de sa page. Ce module ne contient que ce que les quatre ont en commun : retrouver les lignes d'un tableau
// qu'on sait couper, décider lesquelles ouvrent une page (`plan`), écrire la règle CSS qui descend une ligne sous la couture (`padRule`) et celle qui rogne le tableau sur la place
// libre de la page qui finit et sur les marges de la couture (`clipRule`). Les aperçus ne touchent jamais au DOM de ProseMirror : la ligne est descendue par une feuille de style
// (comme les marges de coupure des autres blocs), le document enregistré n'en sait rien.
const TablePageCut = (function () {
  // Une ligne plus haute que cette part de la page ne se range plus : pdfmake, avec dontBreakRows, fait alors DISPARAÎTRE la ligne du PDF (mesuré : ligne de 80 lignes de
  // texte sur une page de 60, ni sur la page 1 ni sur la page 2). Le tableau garde alors son ancien comportement partout (aperçu : un bloc d'une pièce ; PDF : lignes
  // coupées entre deux lignes de texte). 90 % et non 100 : la ligne se mesure dans le navigateur, pdfmake l'écrit un peu plus haute ou plus basse.
  const MAX_ROW_RATIO = 0.9;

  // Les lignes d'un tableau qu'on sait couper entre deux lignes, dans l'ordre ; null sinon (le tableau reste alors un bloc d'une pièce, comme avant) :
  //  - un seul <tbody>, sans <thead> ni <tfoot> : ce que l'éditeur et getHTML() produisent ;
  //  - toutes ses lignes sont des <tr> (une ligne proposée en suivi des modifications est enveloppée dans un <ins> ou un <del>) ;
  //  - aucune case fusionnée sur plusieurs lignes (rowspan) : une coupure y couperait la case, et dontBreakRows de pdfmake s'y emmêle ;
  //  - pas une grille (js/grid-editor.js) : ses lignes portent leur hauteur et la grille n'a pas de feuille A4 ;
  //  - au moins deux lignes : un tableau d'une ligne n'a aucun endroit où se couper.
  function rowsOf(table) {
    if (!table || table.tagName !== 'TABLE') return null;
    const sections = Array.from(table.children).filter(child => /^(THEAD|TBODY|TFOOT)$/.test(child.tagName));
    if (sections.length !== 1 || sections[0].tagName !== 'TBODY') return null;
    const rows = Array.from(sections[0].children);
    if (rows.length < 2 || rows.some(row => row.tagName !== 'TR' || row.hasAttribute('data-row-height'))) return null;
    const merged = rows.some(row => Array.from(row.querySelectorAll('td, th')).some(cell => cell.closest('tr') === row && cell.rowSpan > 1));
    return merged ? null : rows;
  }

  // Toutes les lignes tiennent-elles dans la page ? `heights` et `pageHeight` dans la même unité (px dans les aperçus, pt dans le PDF).
  function rowsFit(heights, pageHeight) {
    return heights.every(h => h <= MAX_ROW_RATIO * pageHeight);
  }

  // Mesure un tableau pour `plan`. `blockEl` est le bloc de premier niveau qui le porte (l'enveloppe .tableWrapper de l'éditeur, le <table> lui-même en Lecture),
  // `zoom` le facteur de la feuille (les rectangles sont en pixels écran, la page en pixels de mise en page), `pageHeightPx` la hauteur utile d'une page, `padOf(ligne)` le
  // rembourrage que l'aperçu a déjà ajouté à une ligne pour la descendre sous une couture (0 s'il n'y en a pas) : une mesure faite après la pose des coupures ne doit pas le
  // compter. Rend { rows, segs, heights } ou null si le tableau ne se coupe pas entre deux lignes. `segs` découpe la hauteur du bloc : la tranche de chaque ligne, du haut
  // de la ligne au haut de la suivante (la première reprend ce qui est au-dessus d'elle, la dernière ce qui est au-dessous), donc leur somme est la hauteur du bloc.
  function measure(blockEl, table, zoom, pageHeightPx, padOf) {
    const rows = rowsOf(table);
    if (!rows) return null;
    const blockRect = blockEl.getBoundingClientRect();
    const rects = rows.map(row => row.getBoundingClientRect());
    const pads = rows.map(row => (padOf && padOf(row)) || 0);
    const heights = rects.map((rect, i) => rect.height / zoom - pads[i]);
    if (!rowsFit(heights, pageHeightPx)) return null;
    const tops = rects.map(rect => (rect.top - blockRect.top) / zoom);
    const total = blockRect.height / zoom;
    const segs = tops.map((top, i) => ((i + 1 < tops.length ? tops[i + 1] : total) - top) - pads[i]);
    segs[0] += tops[0];
    return { rows, segs, heights };
  }

  // Où le tableau change de page. `consumedBefore` : ce que la page en cours porte déjà avant lui (0 : il est en haut de page) ; `segs` : les tranches de `measure` ;
  // `capacity` : la hauteur utile d'une page. Une ligne qui ne tient pas dans la place restante ouvre la page suivante, avec tout ce qui la suit. Rend
  //  - blockBreakBefore : même la première ligne ne tient pas, le tableau entier passe à la page suivante (coupure avant le tableau, comme pour tout autre bloc) ;
  //  - cuts : les rangs (à partir de 1) des lignes qui ouvrent une page ;
  //  - consumedAfter : ce que la dernière page du tableau porte, pour le bloc suivant.
  // Une ligne seule en haut de page qui dépasse la page reste là et déborde : il n'y a rien de mieux à faire (rowsFit l'écarte déjà du plan).
  function plan(consumedBefore, segs, capacity) {
    const cuts = [];
    let blockBreakBefore = false;
    let acc = consumedBefore;
    segs.forEach((seg, i) => {
      if (acc > 0 && acc + seg > capacity) {
        if (i === 0) blockBreakBefore = true; else cuts.push(i);
        acc = seg;
      } else {
        acc += seg;
      }
    });
    return { blockBreakBefore, cuts, consumedAfter: acc };
  }

  // Règle CSS qui descend la ligne `rowIndex` (0 = la première) de `padPx` en rembourrant le haut de ses cases ; la bande de couture, posée sur le haut de la ligne, recouvre
  // exactement ce rembourrage. `tableSelector` désigne le <table> (il est à une profondeur connue de chaque aperçu). Les cases d'une colonne proposée en suivi sont
  // enveloppées dans un <ins>/<del>/<span> (css/track-changes.css) : elles sont visées aussi. `!important` : un style en ligne sur une case ne doit pas l'annuler.
  function padRule(tableSelector, rowIndex, padPx) {
    const row = tableSelector + ' > tbody > tr:nth-child(' + (rowIndex + 1) + ')';
    return row + ' > :is(td, th), ' + row + ' > :is(ins, del, span) > :is(td, th) { padding-top: ' + padPx + 'px !important; }';
  }

  // Règle CSS qui rogne un tableau sur les bandes `strips` ([{ top, bottom }], pixels de mise en page depuis le haut du bloc que vise `blockSelector`) : tout ce qu'il peint
  // dans une bande disparaît, fond et traits des cases compris (aucun trait ne se pose depuis le DOM, ProseMirror le défait). Une ligne descendue par `padRule` laisse sous
  // la couture une réserve et deux marges de page transparentes (c'est la feuille qui est blanche, et l'image d'un coin répétée sur chaque page y passe) : sans le rognage,
  // les traits verticaux des cases la traverseraient. Un `path()` à deux sous-tracés et la règle `evenodd` : le grand rectangle, moins les bandes.
  function clipRule(blockSelector, strips) {
    const far = 100000;
    let path = 'M' + (-far) + ' ' + (-far) + 'H' + far + 'V' + far + 'H' + (-far) + 'Z';
    strips.forEach(strip => { path += 'M' + (-far) + ' ' + strip.top + 'H' + far + 'V' + strip.bottom + 'H' + (-far) + 'Z'; });
    return blockSelector + ' { clip-path: path(evenodd, "' + path + '"); }';
  }

  // Rembourrage haut d'une ligne au repos (avant toute règle de coupure) : celui de sa première case.
  function restingPadTop(row) {
    const cell = row.querySelector('td, th');
    const pad = cell ? parseFloat(getComputedStyle(cell).paddingTop) : NaN;
    return isFinite(pad) ? pad : 4;
  }

  return { MAX_ROW_RATIO, rowsOf, rowsFit, measure, plan, padRule, clipRule, restingPadTop };
})();
