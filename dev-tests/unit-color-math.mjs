#!/usr/bin/env node
// Tests purs (sans navigateur) du calcul des couleurs du menu de couleur et de la fenêtre « Couleur personnalisée » : js/color-math.js (code hexadécimal, rouge-vert-bleu,
// teinte-saturation-valeur, encre lisible sur un fond) et les données de js/color-palette.js (la palette de dix colonnes sur cinq rangées) - cf. dev-tests/unit-harness.mjs
// pour le contexte général. Demande d'Antoine du 08/10 : « pouvoir en plus du RGB rentrer l'hexa # », une palette plus moderne. Les attendus sont ceux de la personne qui tape :
//  1) un code se tape avec ou sans #, en majuscules ou en minuscules, à trois ou six chiffres, des blancs autour ; cinq chiffres, une lettre hors a-f ou un code avec opacité ne
//     sont pas un code (la fenêtre grise alors « Appliquer ») ;
//  2) la couleur qu'une marque ou une case garde (« #1e8449 » ou « rgb(30, 132, 73) » une fois relu du navigateur) se marque dans la palette ; un nom de couleur ne se marque pas ;
//  3) le carré et le curseur de teinte ne déplacent jamais la couleur d'un cran : toute couleur à 8 bits fait l'aller-retour hexadécimal -> teinte-saturation-valeur -> hexadécimal ;
//  4) la coche d'une pastille choisie et la valeur de l'aperçu se lisent sur n'importe quel fond (4,5:1 au moins) ; la rangée « foncé » de la palette se lit en texte sur la page blanche.
// Lancer : node dev-tests/unit-color-math.mjs
import { createContext, loadScript, evalIn, check, summarizeAndExit } from './unit-harness.mjs';

const ctx = createContext({});
loadScript(ctx, 'js/color-math.js');
loadScript(ctx, 'js/color-palette.js');
const call = (expr, ...args) => { ctx.__ARGS = args; return evalIn(ctx, `ColorMath.${expr}(...__ARGS)`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Le code que la personne tape.
for (const [typed, color] of [['#1e8449', '#1e8449'], ['1E8449', '#1e8449'], ['#1E8449', '#1e8449'], ['#1e8', '#11ee88'], ['1E8', '#11ee88'], ['  #1E8449  ', '#1e8449'], ['\t#abc\n', '#aabbcc'], ['#000', '#000000'], ['FFF', '#ffffff']]) {
  check(`le code « ${JSON.stringify(typed)} » donne ${color}`, call('parseHex', typed) === color, call('parseHex', typed));
}
for (const typed of ['', ' ', '#', '#1', '#12', '#1234', '#12345', '#1234567', '#12345678', '#1e8449ff', '#ggg', '#12 34 56', '##123456', 'rgb(1,2,3)', 'red', null, undefined, {}, [], true]) {
  check(`le texte ${JSON.stringify(typed) === undefined ? 'undefined' : JSON.stringify(typed)} n'est pas un code`, call('parseHex', typed) === null, call('parseHex', typed));
}

// 2. La couleur gardée par une marque ou une case.
check('une couleur de style : #1E8449 et rgb(30, 132, 73) sont la même', call('parseCss', '#1E8449') === '#1e8449' && call('parseCss', 'rgb(30, 132, 73)') === '#1e8449' && call('parseCss', 'rgb(30,132,73)') === '#1e8449');
check('rgba(30, 132, 73, 0.5) et rgb(30 132 73) se lisent aussi', call('parseCss', 'rgba(30, 132, 73, 0.5)') === '#1e8449' && call('parseCss', 'rgb(30 132 73)') === '#1e8449' && call('parseCss', 'rgb(30 132 73 / 50%)') === '#1e8449');
check('un style sans couleur lisible : null (rien à marquer)', ['', null, undefined, 'red', 'transparent', 'inherit', 'hsl(0, 100%, 50%)', 'rgb(1, 2)', '#12'].every(v => call('parseCss', v) === null));
check('un « # » devant est exigé d\'un style : « 1e8449 » n\'est pas une couleur CSS', call('parseCss', '1e8449') === null);
check('un rouge à 300 est ramené à 255', call('parseCss', 'rgb(300, 0, 0)') === '#ff0000');

// 3. Passages entre #rrggbb, rouge-vert-bleu et teinte-saturation-valeur.
check('toRgb(#1e8449) = 30, 132, 73 et toHex le rend', same(call('toRgb', '#1e8449'), { r: 30, g: 132, b: 73 }) && call('toHex', { r: 30, g: 132, b: 73 }) === '#1e8449');
check('toHex borne et arrondit : (300, -5, 127.6) -> #ff0080', call('toHex', { r: 300, g: -5, b: 127.6 }) === '#ff0080');
const hsv = hex => call('rgbToHsv', call('toRgb', hex));
check('le rouge, le vert et le bleu : teintes 0, 120 et 240, saturation et valeur à 1', same(hsv('#ff0000'), { h: 0, s: 1, v: 1 }) && same(hsv('#00ff00'), { h: 120, s: 1, v: 1 }) && same(hsv('#0000ff'), { h: 240, s: 1, v: 1 }), JSON.stringify([hsv('#ff0000'), hsv('#00ff00'), hsv('#0000ff')]));
check('le jaune, le cyan et le magenta : 60, 180 et 300 degrés', hsv('#ffff00').h === 60 && hsv('#00ffff').h === 180 && hsv('#ff00ff').h === 300);
check('un gris n\'a ni saturation ni teinte (0), un noir non plus ; leur valeur est la sienne', same(hsv('#808080'), { h: 0, s: 0, v: 128 / 255 }) && same(hsv('#000000'), { h: 0, s: 0, v: 0 }) && same(hsv('#ffffff'), { h: 0, s: 0, v: 1 }));
check('la teinte reste dans [0, 360[ : un rose proche du rouge (#ff0001) n\'est pas à -0,1 degré', (() => { const h = hsv('#ff0001').h; return h >= 0 && h < 360 && h > 359; })(), hsv('#ff0001').h);
check('hsvToRgb : le rouge, le jaune pur à 60 degrés, le bleu à 240, un gris de valeur 0,5', same(call('hsvToRgb', { h: 0, s: 1, v: 1 }), { r: 255, g: 0, b: 0 }) && same(call('hsvToRgb', { h: 60, s: 1, v: 1 }), { r: 255, g: 255, b: 0 }) && same(call('hsvToRgb', { h: 240, s: 1, v: 1 }), { r: 0, g: 0, b: 255 }) && same(call('hsvToRgb', { h: 200, s: 0, v: 0.5 }), { r: 128, g: 128, b: 128 }));
check('hsvToRgb : une teinte de 360 degrés ou négative revient dans le cercle', same(call('hsvToRgb', { h: 360, s: 1, v: 1 }), { r: 255, g: 0, b: 0 }) && same(call('hsvToRgb', { h: -120, s: 1, v: 1 }), { r: 0, g: 0, b: 255 }));
{
  // Toute couleur à 8 bits fait l'aller-retour sans bouger d'un cran : le pas de 5 couvre les 16,7 millions de couleurs d'assez près, le tirage au hasard (graine fixe) les extrêmes.
  const bad = [];
  const roundTrip = (r, g, b) => { const back = call('hsvToRgb', call('rgbToHsv', { r, g, b })); if (back.r !== r || back.g !== g || back.b !== b) bad.push([r, g, b, back.r, back.g, back.b].join(',')); };
  for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) roundTrip(r, g, b);
  let seed = 20261008;
  const next = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let i = 0; i < 20000; i++) roundTrip(Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256));
  for (const r of [0, 1, 254, 255]) for (const g of [0, 1, 254, 255]) for (const b of [0, 1, 254, 255]) roundTrip(r, g, b);
  check('aller-retour #rrggbb -> teinte-saturation-valeur -> #rrggbb : aucune couleur ne bouge', bad.length === 0, bad.slice(0, 5).join(' | '));
}

// 4. Encre lisible sur un fond.
check('contraste noir sur blanc : 21:1 ; une couleur sur elle-même : 1:1', Math.abs(call('contrast', '#000000', '#ffffff') - 21) < 1e-9 && call('contrast', '#1e8449', '#1e8449') === 1);
check('l\'encre d\'un fond blanc est noire, celle d\'un fond noir est blanche', call('inkOn', '#ffffff') === '#000000' && call('inkOn', '#000000') === '#ffffff');
check('l\'encre d\'un jaune est noire, celle d\'un bleu foncé est blanche', call('inkOn', '#fff2a8') === '#000000' && call('inkOn', '#1d4ed8') === '#ffffff');
{
  let seed = 8102026;
  const next = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let worst = 99;
  for (let i = 0; i < 5000; i++) {
    const hex = call('toHex', { r: next() * 255, g: next() * 255, b: next() * 255 });
    worst = Math.min(worst, call('contrast', hex, call('inkOn', hex)));
  }
  check('sur n\'importe quel fond, l\'encre choisie fait 4,5:1 au moins (le pire de 5 000 tirages)', worst >= 4.5, worst);
}

// 5. La palette : dix colonnes, cinq rangées, des codes sûrs, des gris du noir au blanc, des teintes lisibles.
const rows = evalIn(ctx, 'ColorPalette.ROWS');
const flat = rows.flat();
check('cinq rangées de dix couleurs', rows.length === 5 && rows.every(row => row.length === 10), rows.map(r => r.length).join());
check('chaque couleur est un #rrggbb en minuscules, sans doublon', flat.every(c => /^#[0-9a-f]{6}$/.test(c)) && new Set(flat).size === flat.length);
check('la première rangée va du noir au blanc en s\'éclaircissant', rows[0][0] === '#000000' && rows[0][9] === '#ffffff' && rows[0].every((c, i) => i === 0 || call('luminance', c) > call('luminance', rows[0][i - 1])));
check('chaque colonne s\'éclaircit du ton foncé au ton pastel', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every(col => [1, 2, 3, 4].every(row => row === 1 || call('luminance', rows[row][col]) > call('luminance', rows[row - 1][col]))));
{
  const unreadable = rows[1].filter(c => call('contrast', c, '#ffffff') < 4.5);
  check('la rangée « foncé » se lit en texte sur la page blanche (4,5:1 au moins)', unreadable.length === 0, unreadable.join());
}
check('le noir de la police et le jaune de surligneur d\'avant sont dans la palette', evalIn(ctx, 'ColorPalette.DEFAULT_TEXT') === '#000000' && rows[0].includes('#000000') && evalIn(ctx, 'ColorPalette.DEFAULT_HIGHLIGHT') === '#fff2a8' && rows[4].includes('#fff2a8'));
check('les anciens pastels de fond (vert, bleu clair, rouge, violet, orange) sont toujours dans la palette', ['#c8f7c5', '#c8e6ff', '#ffd6d6', '#e6d6ff', '#ffe0b3'].every(c => rows[4].includes(c)));

summarizeAndExit();
