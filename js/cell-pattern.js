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
  // Les couleurs de motif que le menu propose.
  const INKS = ['#000000', '#595959', '#a6a6a6', '#ffffff', '#1f4e79', '#c00000', '#548235', '#bf8f00'];

  return { KINDS, INKS, parse, attributes, paint, fromPowerPoint, autoInk, isInk: value => !!ink(value) };
}());
