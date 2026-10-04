// Icônes SVG « trait » (viewBox 24x24, stroke=currentColor) : source unique pour la barre statique (applyToolbarIcons, editor.js) et le HTML généré
// des barres flottantes (tableau, image).
const Icons = (function () {
  const WRAP_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  const WRAP_CLOSE = '</svg>';
  // Bordures d'une grille (barre de la case, js/floating-toolbars.js) : un carré (4 côtés) et sa croix (2 traits) ; ce que le réglage pose est plein,
  // le reste en pointillé clair.
  const BORDER_SEGMENTS = { top: 'M4 4h16', right: 'M20 4v16', bottom: 'M4 20h16', left: 'M4 4v16', cv: 'M12 4v16', ch: 'M4 12h16' };
  function bordersIcon(solid) {
    const keys = Object.keys(BORDER_SEGMENTS);
    const draw = list => list.map(k => BORDER_SEGMENTS[k]).join('');
    const off = draw(keys.filter(k => !solid.includes(k)));
    const on = draw(keys.filter(k => solid.includes(k)));
    return (off ? `<path d="${off}" stroke-width="1.5" stroke-opacity=".45" stroke-dasharray="1.5 2"/>` : '') + (on ? `<path d="${on}"/>` : '');
  }
  function textAndBlockPaths() {
    // Le texte, les listes, les blocs (citation, tableau, image, légende, sauts), les cases à cocher et les puces.
    return {
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
      // Légende : un cadre large (l'image ou le tableau) et, dessous, deux lignes de texte alignées à gauche (un cadre plus haut, avec un pied centré,
      // se lisait comme un écran).
      caption: '<rect x="3" y="3" width="18" height="9" rx="1.5"/><path d="M3 16.5h18M3 20.5h11"/>',
      // Page traversée par une ligne de coupe pointillée.
      pageBreak: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 12h16" stroke-dasharray="2 2"/><path d="M2.5 12h1.5M20 12h1.5"/>',
      // Pastille du numéro d'une ligne de grille qui porte un saut de page : deux pages face à face, la coupure en tirets entre elles.
      gridBreak: '<rect x="5" y="3" width="14" height="7" rx="1"/><rect x="5" y="14" width="14" height="7" rx="1"/><path d="M2 12h20" stroke-dasharray="2 2"/>',
      // Points de suite et folios, comme un sommaire imprimé ; distinct du bouton « Liste » (puces et texte), juste à côté. Les points de suite sont
      // des tracés de longueur nulle (h.01) : avec stroke-linecap="round", ils se peignent comme un simple point.
      toc: '<path d="M4 6h5M4 12h5M4 18h5"/><path d="M11.5 6h.01M14 6h.01M16.5 6h.01M11.5 12h.01M14 12h.01M11.5 18h.01"/><text x="18.5" y="7.7" font-size="6.2" fill="currentColor" stroke="none">1</text><text x="18.5" y="13.7" font-size="6.2" fill="currentColor" stroke="none">2</text><text x="18.5" y="19.7" font-size="6.2" fill="currentColor" stroke="none">3</text>',
      comment: '<path d="M4 5h16v11H9l-4 3.5V16H4z"/><path d="M8 9h8M8 12.5h5"/>',
      indent: '<path d="M4 6h16M11 12h9M4 18h16"/><path d="M4 9.2v5.6l4.5-2.8z" fill="currentColor" stroke="none"/>',
      outdent: '<path d="M4 6h16M11 12h9M4 18h16"/><path d="M8.5 9.2v5.6L4 12z" fill="currentColor" stroke="none"/>',
      // 3 styles de case à cocher, différenciés par la forme - le rendu réel dans le document dépend de data-tasklist-style (CSS + taskCheckboxCanvas
      // côté export PDF), pas de ces icônes elles-mêmes.
      checklistAccentStrike: '<rect x="3" y="9" width="7" height="7" rx="1.5"/><path d="M4.5 12.5l1.3 1.3L9 11"/><path d="M13 12.5h8"/>',
      checklistClassic: '<rect x="3" y="9" width="7" height="7"/><path d="M4.5 12.5l1.3 1.3L9 11"/>',
      checklistAccentPlain: '<rect x="3" y="9" width="7" height="7" rx="1.5"/><path d="M4.5 12.5l1.3 1.3L9 11"/><path d="M13 12.5h5"/>',
      bulletDisc: '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>',
      bulletCircle: '<circle cx="12" cy="12" r="4.2"/>',
      bulletSquare: '<rect x="7.8" y="7.8" width="8.4" height="8.4" fill="currentColor" stroke="none"/>',
    };
  }
  function tableAndImagePaths() {
    // Les lignes et colonnes d'un tableau, la barre de la case d'une grille (fusion, alignement, bordures), la corbeille, le crayon et l'œil d'un modèle, le zoom et la disposition d'une image.
    return {
      rowBefore: '<path d="M4 9h16M4 15h16M12 4v4"/>',
      rowAfter: '<path d="M4 9h16M4 15h16M12 16v4"/>',
      rowDel: '<path d="M4 9h16M4 15h16"/>',
      colBefore: '<path d="M9 4v16M15 4v16M4 12h4"/>',
      colAfter: '<path d="M9 4v16M15 4v16M16 12h4"/>',
      colDel: '<path d="M9 4v16M15 4v16"/>',
      // Barre de la case d'une grille : fusionner (deux flèches vers le centre) et scinder (deux flèches vers les bords), puis l'alignement vertical
      // (un trait de référence, haut, milieu ou bas, et la case posée contre lui).
      cellMerge: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h5"/><path d="M16 12h5"/><polyline points="9 9 12 12 9 15"/><polyline points="15 9 12 12 15 15"/>',
      cellSplit: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><polyline points="8 9 5 12 8 15"/><polyline points="16 9 19 12 16 15"/>',
      valignTop: '<path d="M4 4h16"/><rect x="8" y="8" width="8" height="12" rx="1"/>',
      valignMiddle: '<path d="M4 12h16"/><rect x="8" y="5" width="8" height="14" rx="1"/>',
      valignBottom: '<path d="M4 20h16"/><rect x="8" y="4" width="8" height="12" rx="1"/>',
      // Puce « Bordures » (le carré et sa croix pointillée), puis les huit réglages de son menu.
      borders: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18" stroke-dasharray="2 2"/>',
      bordersAll: bordersIcon(['top', 'right', 'bottom', 'left', 'cv', 'ch']),
      bordersOuter: bordersIcon(['top', 'right', 'bottom', 'left']),
      bordersInner: bordersIcon(['cv', 'ch']),
      bordersTop: bordersIcon(['top']),
      bordersBottom: bordersIcon(['bottom']),
      bordersLeft: bordersIcon(['left']),
      bordersRight: bordersIcon(['right']),
      bordersNone: bordersIcon([]),
      trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
      // Crayon « Modifier ce modèle » des lignes du résumé d'un macro-modèle (js/macro-editor.js) : le tracé du crayon « Renommer » du titre
      // (css/toolbar-v2.css), sa ligne de base comprise.
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      // Œil « Masquer ce modèle » des lignes du résumé d'un macro-modèle (js/macro-editor.js), à côté du stylo : l'œil ouvert (le modèle est dans la
      // Lecture et les exports) et le même œil barré d'un trait (le modèle en est masqué), comme le « Sans couleur » de la barre (noColor).
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      eyeOff: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
      zoomOut: '<circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.5-5.5M7 10h6"/>',
      zoomIn: '<circle cx="10" cy="10" r="6.5"/><path d="M20 20l-5.5-5.5M10 7v6M7 10h6"/>',
      resetSize: '<path d="M20 11A8 8 0 1 0 18 16"/><path d="M20 5v6h-6"/>',
      // Distinct de alignJustify : un petit carré (l'image) à côté de lignes courtes (texte qui l'habille) puis des lignes pleines en dessous (le flux
      // qui reprend).
      wrapToggle: '<rect x="4" y="4" width="7" height="7" rx="1"/><path d="M13 6h7M13 9h7M4 16h16M4 20h11"/>',
      layerNormal: '<path d="M4 6h6M4 18h16M4 12h6"/><rect x="12" y="9" width="8" height="6" rx="1"/>',
      layerFront: '<rect x="3" y="3" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="9" y="9" width="12" height="12" rx="1.5"/>',
      layerBehind: '<rect x="9" y="9" width="12" height="12" rx="1.5" stroke-dasharray="2.5 2.5"/><rect x="3" y="3" width="12" height="12" rx="1.5"/>',
      // Deux feuilles l'une derrière l'autre, un triangle dans le coin de celle de devant : la même image dans le coin de chaque page.
      layerRepeat: '<rect x="8" y="2.5" width="12" height="15" rx="1.5"/><path d="M5 7.5v11a2.5 2.5 0 0 0 2.5 2.5H16"/><path d="M8 2.5h6L8 8.5z" fill="currentColor" stroke="none"/>',
    };
  }
  function toolbarPaths() {
    // La barre d'outils et les menus : surlignage, pinceau, remplissage, « # », suivi des modifications, barre d'une bulle #Variable, lien, encadré et signature.
    return {
      highlight: '<path d="m8 15-4 4M15.5 4.5 19 8l-9 9-4.5-.5L5 12z"/>',
      // Pinceau de mise en forme (js/format-painter.js) : un rouleau de peintre (le rouleau, son bras, son manche). Ni le feutre du surlignage ni le
      // seau de la couleur de fond : une icône = une fonction.
      formatPainter: '<rect x="3" y="3" width="14" height="6" rx="1.5"/><path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5V11a1.5 1.5 0 0 1-1.5 1.5H12V15"/><rect x="10" y="15" width="4" height="6" rx="1"/>',
      fill: '<path d="M13 2 4 11a4 4 0 0 0 0 5.5A4 4 0 0 0 9.5 21a4 4 0 0 0 5.5-5.5z"/><path d="M4 15h11"/>',
      caretDown: '<path d="M6 9l6 6 6-6"/>',
      noColor: '<circle cx="12" cy="12" r="8.5"/><path d="M5.5 5.5l13 13"/>',
      // Symbole « # » : ouvre l'autocomplétion #Variable et chips (js/variables.js) sans taper le déclencheur ; même icône dans les deux modes
      // (document et email).
      variable: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
      // Suivi des modifications : crayon (bouton bascule) + coche/croix (tout accepter/tout refuser), même style trait que le reste de la barre.
      trackChanges: '<path d="M4 20l1-4L15.5 5.5a2 2 0 0 1 3 0l0 0a2 2 0 0 1 0 3L8 19l-4 1z"/><path d="M13.5 7.5l3 3"/>',
      acceptAll: '<path d="M5 13l4 4L19 7"/>',
      rejectAll: '<path d="M6 6l12 12M18 6L6 18"/>',
      // Barre flottante d'une bulle #Variable (js/floating-toolbars.js) : condition d'affichage (embranchement) et autres attributs de la même ligne
      // (maillons de chaîne).
      varCondition: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
      varLinked: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
      varLoop: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
      // Bouton « Colonne… » de la même barre (js/variable-column.js : changer ou réparer la colonne d'une bulle) : une colonne de tableau avec sa case
      // d'en-tête et les deux chevrons, haut et bas, d'un choix dans une liste.
      varColumn: '<rect x="3" y="3" width="9" height="18" rx="1.5"/><path d="M3 8h9"/><path d="m16 9 2.5-2.5L21 9"/><path d="m16 15 2.5 2.5L21 15"/>',
      // Bouton « Liste… » de la même barre (js/variable-list.js : quelles valeurs d'une liste le document écrit) : des crochets qui enferment trois
      // valeurs - une liste au sens de la donnée, qui ne se confond ni avec les puces ni avec les numéros de la barre (une icône ne porte qu'une
      // fonction). Les trois points sont espacés de 3,5 : à 15 px, plus près, ils se fondent en un tiret.
      varList: '<path d="M6.5 4H3.5v16h3"/><path d="M17.5 4h3v16h-3"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
      // Un 0 (ovale) barré d'un trait (Ø) : bouton « Ne rien afficher si la valeur vaut zéro » de la barre d'un nombre. Le trait (l'unique <path>) est
      // caché par l'attribut `display` quand la bulle affiche le zéro : on ne remplace pas le SVG, la cible d'un clic en train de se produire doit
      // rester dans la barre (cf. wireVariableFloatingToolbar).
      zeroToggle: '<ellipse cx="12" cy="12" rx="5.5" ry="8"/><path d="M5 21 19 3"/>',
      // Bouton « Modifier le calcul » de la barre flottante d'une bulle « Calcul » (js/floating-toolbars.js) : une calculatrice (corps, écran,
      // touches).
      calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
      // Menu « Lien et blocs de contenu » de la barre (une seule icône, js/link-dialog.js) : maillon horizontal pour le lien (le maillon en diagonale,
      // varLinked, est déjà pris par « autres attributs » de la barre d'une bulle : une icône ne porte qu'une fonction) et chevrons pour le bloc de
      // code.
      link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>',
      codeBlock: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
      // Encadré (une boîte avec sa barre de couleur à gauche et deux lignes de texte) et bloc de signature (un paraphe au-dessus de sa ligne), lignes
      // du même menu.
      callout: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 5v14"/><path d="M11.5 10h5M11.5 14h3"/>',
      signature: '<path d="M3 20h18"/><path d="M5 15.5c1.5-3.8 2.8-8 4-8 1.3 0-.5 6.4.9 6.4 1.4 0 2.2-3.8 3.4-3.8 1 0 .9 2.4 2 2.4.6 0 1.2-.7 1.7-1.5"/>',
    };
  }
  function findAndQrPaths() {
    // Rechercher / Remplacer et le QR code.
    return {
      // Rechercher / Remplacer (js/find-replace.js) : la loupe de la barre, puis les contrôles du panneau - chevrons précédent / suivant / afficher le
      // remplacement, « Aa » (respecter la casse), « ab » souligné d'un crochet (mot entier) et la croix de fermeture (distincte de rejectAll, qui est
      // « tout refuser »).
      search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m20 20-5.2-5.2"/>',
      chevronUp: '<path d="m6 15 6-6 6 6"/>',
      chevronDown: '<path d="m6 9 6 6 6-6"/>',
      chevronRight: '<path d="m9 6 6 6-6 6"/>',
      matchCase: '<path d="M2.5 18 7 6l4.5 12M4.2 14h5.6"/><circle cx="17" cy="15" r="3"/><path d="M20 12v6"/>',
      wholeWord: '<circle cx="7.5" cy="10" r="2.8"/><path d="M10.3 7.2V13"/><path d="M13.7 4v9"/><circle cx="16.7" cy="10" r="2.8"/><path d="M3.5 17v3.5h17V17"/>',
      closeFind: '<path d="M7 7l10 10M17 7 7 17"/>',
      // QR code (js/qr-code.js) : ligne du même menu - trois repères d'angle et quelques modules, la même figure que le cadre d'un QR code dont le
      // texte contient une colonne (css/qr-code.css).
      qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M17 20h4v-3"/>',
    };
  }
  const PATHS = Object.assign({}, textAndBlockPaths(), tableAndImagePaths(), toolbarPaths(), findAndQrPaths());
  return { svg: name => WRAP_OPEN + (PATHS[name] || '') + WRAP_CLOSE };
})();
