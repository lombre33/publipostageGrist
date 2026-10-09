// Coupure d'un tableau entre deux lignes, au saut de page. Une ligne de tableau ne se coupe jamais en deux : le PDF (dontBreakRows de pdfmake) et le
// Word (cantSplit) la passent en entier à la page suivante quand elle ne tient pas, et l'aperçu de l'éditeur (js/header-footer-preview.js) comme la
// Lecture (js/reader-mode.js) posent la couture à cet endroit, entre deux lignes, au lieu de la laisser recouvrir une ligne ou de laisser le tableau
// déborder en bas de sa page. Une case fusionnée sur plusieurs lignes lie les siennes : elles forment un groupe (`unitsOf`) que la page ne sépare
// jamais, et c'est entre deux groupes que le tableau se coupe. Ce module ne contient que ce que les quatre ont en commun : retrouver les lignes d'un
// tableau qu'on sait couper et leurs groupes, décider lesquels ouvrent une page (`plan`), écrire la règle CSS qui descend une ligne sous la couture
// (`padRule`) et celle qui rogne le tableau sur la place libre de la page qui finit et sur les marges de la couture (`clipRule`). Les aperçus ne
// touchent jamais au DOM de ProseMirror : la ligne est descendue par une feuille de style (comme les marges de coupure des autres blocs), le document
// enregistré n'en sait rien.
const TablePageCut = (function () {
  // Une ligne (ou un groupe de lignes) plus haute que cette part de la page ne se range plus : avec dontBreakRows, pdfmake fait disparaître la ligne
  // du PDF (mesuré : ligne de 80 lignes de texte sur une page de 60, ni sur la page 1 ni sur la page 2). Le tableau n'est alors pas coupé entre ses
  // lignes : un bloc d'une pièce dans l'aperçu, des lignes coupées entre deux lignes de texte dans le PDF. 90 % et non 100 : la ligne se mesure dans
  // le navigateur, pdfmake l'écrit un peu plus haute ou plus basse.
  const MAX_ROW_RATIO = 0.9;

  // Les lignes d'un tableau qu'on sait couper entre deux lignes (ou deux groupes de lignes, cf. unitsOf), dans l'ordre ; null sinon (le tableau reste
  // alors un bloc d'une pièce) :
  //  - un seul <tbody>, sans <thead> ni <tfoot> : ce que l'éditeur et getHTML() produisent ;
  //  - toutes ses lignes sont des <tr> (une ligne proposée en suivi des modifications est enveloppée dans un <ins> ou un <del>) ;
  //  - au moins deux lignes : un tableau d'une ligne n'a aucun endroit où se couper.
  // Une ligne à hauteur réglée (`data-row-height`, js/grid-editor.js) se coupe comme une autre : sa hauteur est un minimum que `measure` lit sur le
  // rendu. La grille ouverte n'a pas de feuille A4 : ni l'aperçu ni la Lecture ne la découpent, et le PDF la range lui-même (js/pdf-export.js).
  function rowsOf(table) {
    if (!table || table.tagName !== 'TABLE') return null;
    const sections = Array.from(table.children).filter(child => /^(THEAD|TBODY|TFOOT)$/.test(child.tagName));
    if (sections.length !== 1 || sections[0].tagName !== 'TBODY') return null;
    const rows = Array.from(sections[0].children);
    if (rows.length < 2 || rows.some(row => row.tagName !== 'TR')) return null;
    return rows;
  }

  // Les groupes de lignes qu'une page ne sépare pas : une case fusionnée sur plusieurs lignes (rowspan) lie les lignes qu'elle recouvre, la page ne
  // change qu'entre deux groupes (une coupure au milieu couperait la case, et dontBreakRows de pdfmake s'y emmêle). [{ from, to }] : la première
  // ligne du groupe et celle qui suit sa dernière, dans l'ordre ; sans case fusionnée, un groupe par ligne. `rows` : celles de rowsOf. Même règle que
  // ExportCommon.gridRowSegments, sur les cases lues à travers les enveloppes du suivi.
  function unitsOf(rows) {
    const units = [];
    let reach = 0; // la première ligne que les cases des lignes déjà vues ne recouvrent plus
    rows.forEach((row, r) => {
      if (reach <= r) units.push({ from: r, to: r + 1 }); else units[units.length - 1].to = r + 1;
      reach = Math.max(reach, r + 1);
      row.querySelectorAll('td, th').forEach((cell) => {
        if (cell.closest('tr') === row) reach = Math.max(reach, r + Math.min(rows.length - r, Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1)));
      });
    });
    return units;
  }

  // Toutes les lignes tiennent-elles dans la page ? `heights` et `pageHeight` dans la même unité (px dans les aperçus, pt dans le PDF).
  function rowsFit(heights, pageHeight) {
    return heights.every(h => h <= MAX_ROW_RATIO * pageHeight);
  }

  // Mesure un tableau pour `plan`. `blockEl` est le bloc de premier niveau qui le porte (l'enveloppe .tableWrapper de l'éditeur, le <table> lui-même
  // en Lecture), `zoom` le facteur de la feuille (les rectangles sont en pixels écran, la page en pixels de mise en page), `pageHeightPx` la hauteur
  // utile d'une page, `padOf(ligne)` le rembourrage que l'aperçu a déjà ajouté à une ligne pour la descendre sous une couture (0 s'il n'y en a pas) :
  // une mesure faite après la pose des coupures ne doit pas le compter. Rend { rows, units, starts, segs, heights, keepsTail } ou null si le tableau
  // ne se coupe pas entre deux lignes, ni entre deux groupes de lignes (un groupe plus haut que la page). Les tranches sont celles des groupes
  // (unitsOf : une ligne chacun sans case fusionnée, un seul groupe quand une case fusionnée lie tout le tableau : c'est lui qui passe alors en
  // entier à la page suivante) ; `starts[i]` : le rang de la première ligne du groupe i. `segs` découpe la hauteur du bloc : la tranche de chaque
  // groupe, du haut de sa première ligne au haut du groupe suivant (la première reprend ce qui est au-dessus d'elle, la dernière ce qui est
  // au-dessous), donc leur somme est la hauteur du bloc. `captionPx` : la hauteur des légendes qui suivent le tableau (js/caption.js, « Rester
  // ensemble »). Si le dernier groupe et elles tiennent ensemble dans une page, elles s'ajoutent à la dernière tranche (`keepsTail`) : la dernière
  // ligne ne quitte jamais sa légende, c'est le groupe et sa légende que `plan` passe à la page suivante. Sinon (`keepsTail` faux), les légendes
  // restent des paragraphes à part.
  function measure(blockEl, table, zoom, pageHeightPx, padOf, captionPx) {
    const rows = rowsOf(table);
    if (!rows) return null;
    const units = unitsOf(rows);
    const blockRect = blockEl.getBoundingClientRect();
    const rects = rows.map(row => row.getBoundingClientRect());
    const pads = rows.map(row => (padOf && padOf(row)) || 0);
    const padOfUnit = unit => pads.slice(unit.from, unit.to).reduce((sum, pad) => sum + pad, 0);
    const heights = units.map(unit => (rects[unit.to - 1].bottom - rects[unit.from].top) / zoom - padOfUnit(unit));
    if (!rowsFit(heights, pageHeightPx)) return null;
    const tops = units.map(unit => (rects[unit.from].top - blockRect.top) / zoom);
    const total = blockRect.height / zoom;
    const segs = tops.map((top, i) => ((i + 1 < tops.length ? tops[i + 1] : total) - top) - padOfUnit(units[i]));
    segs[0] += tops[0];
    const keepsTail = captionPx > 0 && heights[heights.length - 1] + captionPx <= MAX_ROW_RATIO * pageHeightPx;
    if (keepsTail) segs[segs.length - 1] += captionPx;
    return { rows, units, starts: units.map(unit => unit.from), segs, heights, keepsTail };
  }

  // Où le tableau change de page. `consumedBefore` : ce que la page en cours porte déjà avant lui (0 : il est en haut de page) ; `segs` : les
  // tranches de `measure` ; `capacity` : la hauteur utile d'une page ; `starts` : les rangs de lignes que `measure` rend (omis, une tranche est une
  // ligne). Une ligne (un groupe de lignes) qui ne tient pas dans la place restante ouvre la page suivante, avec tout ce qui la suit. Rend
  //  - blockBreakBefore : même la première ligne ne tient pas, le tableau entier passe à la page suivante (coupure avant le tableau, comme pour tout
  //    autre bloc) ;
  //  - cuts : les rangs de lignes (à partir de 1) qui ouvrent une page ;
  //  - ranks : les rangs des tranches qui les portent (les mêmes sans case fusionnée), pour retrouver la hauteur de ce qui précède ;
  //  - consumedAfter : ce que la dernière page du tableau porte, pour le bloc suivant.
  // Une ligne seule en haut de page qui dépasse la page reste là et déborde : il n'y a rien de mieux à faire (rowsFit l'écarte déjà du plan).
  function plan(consumedBefore, segs, capacity, starts) {
    const ranks = [];
    let blockBreakBefore = false;
    let acc = consumedBefore;
    segs.forEach((seg, i) => {
      if (acc > 0 && acc + seg > capacity) {
        if (i === 0) blockBreakBefore = true; else ranks.push(i);
        acc = seg;
      } else {
        acc += seg;
      }
    });
    return { blockBreakBefore, cuts: ranks.map(rank => (starts ? starts[rank] : rank)), ranks, consumedAfter: acc };
  }

  // Règle CSS qui descend la ligne `rowIndex` (0 = la première) de `padPx` en rembourrant le haut de ses cases ; la bande de couture, posée sur le
  // haut de la ligne, recouvre exactement ce rembourrage. `tableSelector` désigne le <table> (il est à une profondeur connue de chaque aperçu). Les
  // cases d'une colonne proposée en suivi sont enveloppées dans un <ins>/<del>/<span> (css/track-changes.css) : elles sont visées aussi.
  // `!important` : un style en ligne sur une case ne doit pas l'annuler.
  //
  // Une ligne à hauteur réglée (`fixedHeightPx`, cf. fixedHeightPx : un minimum que son <tr> porte en ligne) ne grandit du rembourrage que s'il dépasse
  // la place que sa hauteur lui laisse : elle ne descendrait pas ce qui la suit de toute la descente. Sa hauteur réglée grandit donc elle aussi de
  // `extraPx`, la descente (le rembourrage moins celui de la ligne au repos).
  function padRule(tableSelector, rowIndex, padPx, fixedHeightPx, extraPx) {
    const row = tableSelector + ' > tbody > tr:nth-child(' + (rowIndex + 1) + ')';
    const cells = row + ' > :is(td, th), ' + row + ' > :is(ins, del, span) > :is(td, th) { padding-top: ' + padPx + 'px !important; }';
    return fixedHeightPx > 0 ? cells + ' ' + row + ' { height: ' + (fixedHeightPx + (extraPx || 0)) + 'px !important; }' : cells;
  }

  // La hauteur réglée d'une ligne (`data-row-height`, en px), null quand personne n'en a réglé : elle a la hauteur de son texte.
  function fixedHeightPx(row) {
    const px = row ? parseFloat(row.getAttribute('data-row-height')) : NaN;
    return px > 0 ? px : null;
  }

  // Règle CSS qui rogne un tableau sur les bandes `strips` ([{ top, bottom }], pixels de mise en page depuis le haut du bloc que vise
  // `blockSelector`) : tout ce qu'il peint dans une bande disparaît, fond et traits des cases compris (aucun trait ne se pose depuis le DOM,
  // ProseMirror le défait). Une ligne descendue par `padRule` laisse sous la couture une réserve et deux marges de page transparentes (c'est la
  // feuille qui est blanche, et l'image d'un coin répétée sur chaque page y passe) : sans le rognage, les traits verticaux des cases la
  // traverseraient. Un `path()` à deux sous-tracés et la règle `evenodd` : le grand rectangle, moins les bandes.
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

  return { MAX_ROW_RATIO, rowsOf, unitsOf, rowsFit, measure, plan, padRule, fixedHeightPx, clipRule, restingPadTop };
})();
