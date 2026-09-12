// Icônes de la toolbar — SVG "trait" (viewBox 24x24, stroke=currentColor,
// stroke-width=2, fill=none) : aucune dépendance externe, cohérent avec
// l'absence de bundler dans cet environnement (index.html charge tout en
// ESM natif via importmap).
// Source de vérité UNIQUE : utilisé à la fois pour injecter les icônes de la
// toolbar statique (boutons déjà présents dans index.html, cf.
// applyToolbarIcons dans editor.js) et pour construire en JS le contenu des
// toolbars flottantes (tableau, image) dont le HTML n'existe pas à l'avance.
const Icons = (function () {
  const WRAP_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  const WRAP_CLOSE = '</svg>';
  const PATHS = {
    undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1"/>',
    redo: '<path d="M15 7l5 5-5 5M20 12H9A5 5 0 0 0 9 22h1"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M11 4h6M5 20h6M14 4 8 20"/>',
    underline: '<path d="M6 4v7a6 6 0 0 0 12 0V4M5 20h14"/>',
    strike: '<path d="M6 12h12M8 6.5c.4-1.5 2-2.5 4-2.5 2.2 0 3.7 1 4 2.5M8 17.5c.3 1.5 1.8 2.5 4 2.5 2 0 3.6-1 4-2.5"/>',
    alignLeft: '<path d="M4 6h16M4 12h10M4 18h13"/>',
    alignCenter: '<path d="M4 6h16M7 12h10M5.5 18h13"/>',
    alignRight: '<path d="M4 6h16M10 12h10M7 18h13"/>',
    alignJustify: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    bulletList: '<circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/><path d="M9 6h11M9 12h11M9 18h11"/>',
    orderedList: '<path d="M9 6h11M9 12h11M9 18h11"/><text x="1.5" y="7.7" font-size="6.2" fill="currentColor" stroke="none">1</text><text x="1.5" y="13.7" font-size="6.2" fill="currentColor" stroke="none">2</text><text x="1.5" y="19.7" font-size="6.2" fill="currentColor" stroke="none">3</text>',
    orderedAlpha: '<path d="M9 6h11M9 12h11M9 18h11"/><text x="1.5" y="7.7" font-size="6.2" fill="currentColor" stroke="none">a</text><text x="1.5" y="13.7" font-size="6.2" fill="currentColor" stroke="none">b</text><text x="1.5" y="19.7" font-size="6.2" fill="currentColor" stroke="none">c</text>',
    orderedRoman: '<path d="M9 6h11M9 12h11M9 18h11"/><text x="0.5" y="7.7" font-size="6.2" fill="currentColor" stroke="none">i</text><text x="0.5" y="13.7" font-size="6.2" fill="currentColor" stroke="none">ii</text><text x="0.5" y="19.7" font-size="6.2" fill="currentColor" stroke="none">iii</text>',
    blockquote: '<path d="M7 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h1v-4H6a1 1 0 0 1 1-1z"/><path d="M16 8a3 3 0 0 0-3 3v2a2 2 0 0 0 2 2h1v-4h-1a1 1 0 0 1 1-1z"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 10v10"/>',
    twoColumns: '<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="m21 16-5-5-4 4-3-3-6 6"/>',
    // Page + ligne de coupe pointillée (avec petits traits latéraux "ciseaux")
    // - l'ancienne icône (carré divisé en 4) ne voulait rien dire de précis,
    // signalé par l'utilisateur ; option "D" retenue parmi plusieurs
    // maquettes proposées.
    pageBreak: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 12h16" stroke-dasharray="2 2"/><path d="M2.5 12h1.5M20 12h1.5"/>',
    // Pointillés + folios (option retenue parmi plusieurs propositions,
    // maquette "Sommaire & titres") : évoque le sommaire imprimé classique
    // (lignes de texte, points de suite, numéros de page) - l'ancienne icône
    // (lignes puces + texte) était trop proche visuellement du bouton
    // "Liste" juste à côté, signalé par l'utilisateur. Les "points de suite"
    // sont des tracés de longueur nulle (h.01) : avec stroke-linecap="round"
    // (WRAP_OPEN ci-dessus), un tracé nul se peint comme un simple point.
    toc: '<path d="M4 6h5M4 12h5M4 18h5"/><path d="M11.5 6h.01M14 6h.01M16.5 6h.01M11.5 12h.01M14 12h.01M11.5 18h.01"/><text x="18.5" y="7.7" font-size="6.2" fill="currentColor" stroke="none">1</text><text x="18.5" y="13.7" font-size="6.2" fill="currentColor" stroke="none">2</text><text x="18.5" y="19.7" font-size="6.2" fill="currentColor" stroke="none">3</text>',
    indent: '<path d="M4 6h16M11 12h9M4 18h16"/><path d="M4 9.2v5.6l4.5-2.8z" fill="currentColor" stroke="none"/>',
    outdent: '<path d="M4 6h16M11 12h9M4 18h16"/><path d="M8.5 9.2v5.6L4 12z" fill="currentColor" stroke="none"/>',
    // 3 styles de case à cocher (survol du bouton "Liste", 3ᵉ ligne du
    // panneau) - différenciés par la FORME (le trait/la case), le vrai
    // libellé de chacun vit dans son data-tip (index.html) : le rendu réel
    // dans le document dépend de data-tasklist-style (CSS, cf. editor-v2.css,
    // et taskCheckboxCanvas côté export PDF, js/pdf-export.js), pas de ces
    // icônes elles-mêmes.
    checklistAccentStrike: '<rect x="3" y="9" width="7" height="7" rx="1.5"/><path d="M4.5 12.5l1.3 1.3L9 11"/><path d="M13 12.5h8"/>',
    checklistClassic: '<rect x="3" y="9" width="7" height="7"/><path d="M4.5 12.5l1.3 1.3L9 11"/>',
    checklistAccentPlain: '<rect x="3" y="9" width="7" height="7" rx="1.5"/><path d="M4.5 12.5l1.3 1.3L9 11"/><path d="M13 12.5h5"/>',
    bulletDisc: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>',
    bulletCircle: '<circle cx="12" cy="12" r="4.2"/>',
    bulletSquare: '<rect x="7.8" y="7.8" width="8.4" height="8.4" fill="currentColor" stroke="none"/>',
    rowBefore: '<path d="M4 9h16M4 15h16M12 4v4"/>',
    rowAfter: '<path d="M4 9h16M4 15h16M12 16v4"/>',
    rowDel: '<path d="M4 9h16M4 15h16"/>',
    colBefore: '<path d="M9 4v16M15 4v16M4 12h4"/>',
    colAfter: '<path d="M9 4v16M15 4v16M16 12h4"/>',
    colDel: '<path d="M9 4v16M15 4v16"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
    zoomOut: '<circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.5-5.5M7 10h6"/>',
    zoomIn: '<circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.5-5.5M10 7v6M7 10h6"/>',
    resetSize: '<path d="M20 11A8 8 0 1 0 18 16"/><path d="M20 5v6h-6"/>',
    // Distinct de alignJustify (3 lignes pleine largeur) : ici un petit carré
    // (l'image) à côté de lignes COURTES (texte qui l'habille) puis des
    // lignes pleines EN DESSOUS (le flux qui reprend) - confondu avec
    // justify par l'utilisateur avant ce redessin, cf. mémoire.
    wrapToggle: '<rect x="4" y="4" width="7" height="7" rx="1"/><path d="M13 6h7M13 9h7M4 16h16M4 20h11"/>',
    layerNormal: '<path d="M4 6h6M4 18h16M4 12h6"/><rect x="12" y="9" width="8" height="6" rx="1"/>',
    layerFront: '<rect x="3" y="3" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="9" y="9" width="12" height="12" rx="1.5"/>',
    layerBehind: '<rect x="9" y="9" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="3" y="3" width="12" height="12" rx="1.5"/>',
    highlight: '<path d="m8 15-4 4M15.5 4.5 19 8l-9 9-4.5-.5L5 12z"/>',
    fill: '<path d="M13 2 4 11a4 4 0 0 0 0 5.5A4 4 0 0 0 9.5 21a4 4 0 0 0 5.5-5.5z"/><path d="M4 15h11"/>',
    caretDown: '<path d="M6 9l6 6 6-6"/>',
    noColor: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 5.5l13 13"/>',
  };
  return { svg: name => WRAP_OPEN + (PATHS[name] || '') + WRAP_CLOSE };
})();
