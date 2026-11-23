// Le motif (les « hachures ») du fond d'une case de tableau, de document ou de grille : des traits, des points ou des damiers dans une couleur, par-dessus la couleur de fond de la case (`backgroundColor`).
// Les noms des motifs sont ceux de PowerPoint (`a:pattFill prst`) : un fichier PowerPoint s'importe et s'exporte sans table de correspondance pour ceux-là, les autres motifs de la norme se rapprochent
// du plus proche (`fromPowerPoint`). Le motif vit dans l'attribut `fillPattern` des cases (`{ kind, ink }`), écrit dans le HTML en `data-fill-pattern` et `data-fill-ink` (les sorties lisent ces deux marques :
// la peinture en ligne n'est que ce que l'écran en montre) ; la peinture est un dégradé CSS, jamais une adresse (`url()`), que le nettoyage du HTML retirerait.
//
//   CellPattern.KINDS                   les motifs gérés, dans l'ordre du menu
//   CellPattern.parse(element)          { kind, ink } lu sur `data-fill-pattern` / `data-fill-ink`, ou null (motif inconnu, couleur illisible)
//   CellPattern.attributes(pattern)     les attributs HTML d'une case : les deux marques et la peinture en ligne (`style`)
//   CellPattern.paint(kind, ink)        la peinture seule : `background-image: ...; background-size: ...`
//   CellPattern.fromPowerPoint(prst)    { kind, exact } : le motif de PowerPoint repris, exact ou rapproché ; null pour un nom inconnu
//   CellPattern.autoInk(backgroundHex)  la couleur de motif qui se lit sur ce fond (le motif choisi sans couleur)
//   CellPattern.averageTone(pattern, backgroundHex)  la teinte moyenne de la case (pour une sortie qui ne sait pas tramer)
//   CellPattern.word(kind), .excel(kind)   le nom du motif le plus proche dans Word (`w:shd`) et dans Excel (`patternType`) ; .fromWord(nom) le chemin inverse (import)
const CellPattern = (function () {
  const INK = /^#[0-9a-f]{6}$/i;
  const SLANT = Math.SQRT1_2; // d'un pas mesuré sur l'axe à la distance entre deux traits obliques

  // Les traits : [épaisseur, pas] en pixels, sur l'axe.
  const LINES = { lt: [1, 4], plain: [2, 8], dk: [4, 8] };
  const DIAGONAL = { lt: [1, 4], plain: [1, 8], dk: [2, 4], wd: [3, 8] };

  const horizontal = (ink, [width, step]) => ({ image: `linear-gradient(${ink} ${width}px, transparent ${width}px)`, size: `100% ${step}px` });
  const vertical = (ink, [width, step]) => ({ image: `linear-gradient(90deg, ${ink} ${width}px, transparent ${width}px)`, size: `${step}px 100%` });
  // Des traits obliques : `down` vers le bas à droite (↘, « descendante »), sinon vers le haut à droite (↗).
  const oblique = (ink, [width, step], down) => {
    const gap = step * SLANT;
    return { image: `repeating-linear-gradient(${down ? 45 : 135}deg, ${ink} 0 ${(width * SLANT).toFixed(2)}px, transparent ${(width * SLANT).toFixed(2)}px ${gap.toFixed(2)}px)`, size: 'auto' };
  };
  const dots = (ink, tile, radius) => ({ image: `radial-gradient(circle at 50% 50%, ${ink} ${radius}px, transparent ${radius + 0.5}px)`, size: `${tile}px ${tile}px` });
  const quarter = (ink, quarters) => ({
    image: quarters === 1 ? `conic-gradient(${ink} 0 25%, transparent 0)`
      : (quarters === 2 ? `conic-gradient(${ink} 0 25%, transparent 0 50%, ${ink} 0 75%, transparent 0)` : `conic-gradient(${ink} 0 75%, transparent 0)`),
    size: '2px 2px',
  });
  const check = (ink, tile) => ({ image: `conic-gradient(${ink} 0 25%, transparent 0 50%, ${ink} 0 75%, transparent 0)`, size: `${tile}px ${tile}px` });
  const grid = (ink, step) => [horizontal(ink, [1, step]), vertical(ink, [1, step])];

  // Chaque motif : la liste de ses couches de peinture, de la plus haute à la plus basse.
  const LAYERS = {
    pct10: ink => [dots(ink, 3, 0.6)],
    pct25: ink => [quarter(ink, 1)],
    pct50: ink => [quarter(ink, 2)],
    pct75: ink => [quarter(ink, 3)],
    ltHorz: ink => [horizontal(ink, LINES.lt)],
    horz: ink => [horizontal(ink, LINES.plain)],
    dkHorz: ink => [horizontal(ink, LINES.dk)],
    ltVert: ink => [vertical(ink, LINES.lt)],
    vert: ink => [vertical(ink, LINES.plain)],
    dkVert: ink => [vertical(ink, LINES.dk)],
    ltDnDiag: ink => [oblique(ink, DIAGONAL.lt, true)],
    dnDiag: ink => [oblique(ink, DIAGONAL.plain, true)],
    dkDnDiag: ink => [oblique(ink, DIAGONAL.dk, true)],
    wdDnDiag: ink => [oblique(ink, DIAGONAL.wd, true)],
    ltUpDiag: ink => [oblique(ink, DIAGONAL.lt, false)],
    upDiag: ink => [oblique(ink, DIAGONAL.plain, false)],
    dkUpDiag: ink => [oblique(ink, DIAGONAL.dk, false)],
    wdUpDiag: ink => [oblique(ink, DIAGONAL.wd, false)],
    cross: ink => grid(ink, 8),
    diagCross: ink => [oblique(ink, DIAGONAL.plain, true), oblique(ink, DIAGONAL.plain, false)],
    smGrid: ink => grid(ink, 4),
    lgGrid: ink => grid(ink, 8),
    smCheck: ink => [check(ink, 4)],
    lgCheck: ink => [check(ink, 8)],
  };
  const KINDS = Object.keys(LAYERS);

  // Les motifs de PowerPoint qu'on n'a pas : le plus proche à l'œil.
  const NEAREST = {
    pct5: 'pct10', pct20: 'pct25', pct30: 'pct25', pct40: 'pct50', pct60: 'pct50', pct70: 'pct75', pct80: 'pct75', pct90: 'pct75',
    narHorz: 'ltHorz', dashHorz: 'ltHorz', narVert: 'ltVert', dashVert: 'ltVert', dashDnDiag: 'dnDiag', dashUpDiag: 'upDiag',
    dotGrid: 'smGrid', plaid: 'lgGrid', horzBrick: 'lgGrid', diagBrick: 'diagCross', trellis: 'diagCross', openDmnd: 'diagCross', solidDmnd: 'pct50',
    smConfetti: 'pct25', lgConfetti: 'pct25', dotDmnd: 'pct25', divot: 'pct25', sphere: 'lgCheck', weave: 'smCheck', shingle: 'dnDiag', wave: 'horz', zigZag: 'dnDiag',
  };

  const ink = value => (INK.test(String(value || '')) ? String(value).toLowerCase() : null);

  // La peinture d'un motif de couleur `color` : `background-image` (les couches, la plus haute d'abord) et `background-size`.
  function paint(kind, color) {
    const layers = LAYERS[kind] && ink(color) ? LAYERS[kind](ink(color)) : null;
    if (!layers) return '';
    return 'background-image: ' + layers.map(layer => layer.image).join(', ') + '; background-size: ' + layers.map(layer => layer.size).join(', ');
  }
  function parse(element) {
    const kind = element && element.getAttribute ? element.getAttribute('data-fill-pattern') : null;
    const color = ink(element && element.getAttribute ? element.getAttribute('data-fill-ink') : null);
    return kind && LAYERS[kind] && color ? { kind, ink: color } : null;
  }
  function attributes(pattern) {
    const style = pattern && LAYERS[pattern.kind] && ink(pattern.ink) ? paint(pattern.kind, pattern.ink) : '';
    return style ? { 'data-fill-pattern': pattern.kind, 'data-fill-ink': ink(pattern.ink), style } : {};
  }
  function fromPowerPoint(name) {
    if (LAYERS[name]) return { kind: name, exact: true };
    return NEAREST[name] ? { kind: NEAREST[name], exact: false } : null;
  }
  // La couleur de motif d'un motif choisi sans couleur : sombre sur un fond clair ou sans fond, claire sur un fond sombre.
  function autoInk(backgroundHex) {
    const hex = String(backgroundHex || '').replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return '#595959';
    const [r, g, b] = [0, 2, 4].map(at => parseInt(hex.slice(at, at + 2), 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128 ? '#d9d9d9' : '#595959';
  }
  // La part du fond que l'encre couvre, pour chaque motif (traits : épaisseur sur pas ; points : surface du point sur celle de la maille).
  const COVERAGE = {
    pct10: 0.125, pct25: 0.25, pct50: 0.5, pct75: 0.75,
    ltHorz: 0.25, horz: 0.25, dkHorz: 0.5, ltVert: 0.25, vert: 0.25, dkVert: 0.5,
    ltDnDiag: 0.25, dnDiag: 0.125, dkDnDiag: 0.5, wdDnDiag: 0.375, ltUpDiag: 0.25, upDiag: 0.125, dkUpDiag: 0.5, wdUpDiag: 0.375,
    cross: 0.23, diagCross: 0.23, smGrid: 0.44, lgGrid: 0.23, smCheck: 0.5, lgCheck: 0.5,
  };
  // La teinte moyenne d'une case à motif (`#rrggbb`) : l'encre sur la part qu'elle couvre, le fond (à défaut blanc) sur le reste. Pour une sortie qui ne sait pas tramer (le PDF de pdfmake 0.2.7 n'a pas de motif
  // de remplissage, l'OpenDocument texte non plus) : la case a au moins le ton qu'elle a à l'écran.
  function averageTone(pattern, backgroundHex) {
    const part = pattern && COVERAGE[pattern.kind] !== undefined && ink(pattern.ink) ? COVERAGE[pattern.kind] : null;
    const back = String(backgroundHex || '#ffffff').replace(/^#/, '');
    if (part === null || !/^[0-9a-f]{6}$/i.test(back)) return /^#?[0-9a-f]{6}$/i.test(String(backgroundHex || '')) ? '#' + String(backgroundHex).replace(/^#/, '').toLowerCase() : null;
    const front = pattern.ink.replace(/^#/, '');
    const mix = at => Math.round(parseInt(front.slice(at, at + 2), 16) * part + parseInt(back.slice(at, at + 2), 16) * (1 - part)).toString(16).padStart(2, '0');
    return '#' + mix(0) + mix(2) + mix(4);
  }
  // Les motifs des autres formats : le nom qu'y porte le plus proche (jamais exact pour tous : le damier n'existe ni dans Word ni dans Excel). Word : `w:shd w:val` ; Excel : `patternFill patternType`.
  const WORD = {
    pct10: 'pct10', pct25: 'pct25', pct50: 'pct50', pct75: 'pct75',
    ltHorz: 'thinHorzStripe', horz: 'horzStripe', dkHorz: 'horzStripe', ltVert: 'thinVertStripe', vert: 'vertStripe', dkVert: 'vertStripe',
    ltDnDiag: 'thinDiagStripe', dnDiag: 'diagStripe', dkDnDiag: 'diagStripe', wdDnDiag: 'diagStripe',
    ltUpDiag: 'thinReverseDiagStripe', upDiag: 'reverseDiagStripe', dkUpDiag: 'reverseDiagStripe', wdUpDiag: 'reverseDiagStripe',
    cross: 'horzCross', diagCross: 'diagCross', smGrid: 'thinHorzCross', lgGrid: 'horzCross', smCheck: 'pct50', lgCheck: 'pct50',
  };
  // Le chemin inverse (à l'import) : le motif de l'éditeur que dit une trame de Word. Les pourcentages de Word sont rangés au plus proche de ceux de PowerPoint ; la trame sans équivalent propre (`thinDiagCross`) prend le damier de traits croisés.
  const FROM_WORD = {
    pct5: 'pct10', pct10: 'pct10', pct12: 'pct10', pct15: 'pct10', pct20: 'pct25', pct25: 'pct25', pct30: 'pct25', pct35: 'pct25', pct37: 'pct25', pct40: 'pct50', pct45: 'pct50', pct50: 'pct50',
    pct55: 'pct50', pct60: 'pct50', pct62: 'pct75', pct65: 'pct75', pct70: 'pct75', pct75: 'pct75', pct80: 'pct75', pct85: 'pct75', pct87: 'pct75', pct90: 'pct75', pct95: 'pct75',
    thinHorzStripe: 'ltHorz', horzStripe: 'horz', thinVertStripe: 'ltVert', vertStripe: 'vert', thinDiagStripe: 'ltDnDiag', diagStripe: 'dnDiag', thinReverseDiagStripe: 'ltUpDiag', reverseDiagStripe: 'upDiag',
    horzCross: 'cross', thinHorzCross: 'smGrid', diagCross: 'diagCross', thinDiagCross: 'diagCross',
  };
  const EXCEL = {
    pct10: 'gray125', pct25: 'lightGray', pct50: 'mediumGray', pct75: 'darkGray',
    ltHorz: 'lightHorizontal', horz: 'darkHorizontal', dkHorz: 'darkHorizontal', ltVert: 'lightVertical', vert: 'darkVertical', dkVert: 'darkVertical',
    ltDnDiag: 'lightDown', dnDiag: 'darkDown', dkDnDiag: 'darkDown', wdDnDiag: 'darkDown', ltUpDiag: 'lightUp', upDiag: 'darkUp', dkUpDiag: 'darkUp', wdUpDiag: 'darkUp',
    cross: 'lightGrid', diagCross: 'lightTrellis', smGrid: 'lightGrid', lgGrid: 'darkGrid', smCheck: 'darkTrellis', lgCheck: 'darkTrellis',
  };
  // Les couleurs de motif que le menu propose.
  const INKS = ['#000000', '#595959', '#a6a6a6', '#ffffff', '#1f4e79', '#c00000', '#548235', '#bf8f00'];

  return { KINDS, INKS, parse, attributes, paint, fromPowerPoint, autoInk, averageTone, word: kind => WORD[kind] || null, fromWord: name => FROM_WORD[name] || null, excel: kind => EXCEL[kind] || null, isInk: value => !!ink(value) };
}());
