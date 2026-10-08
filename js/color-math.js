// Calculs de couleur communs au menu de couleur (js/color-palette.js) et à la fenêtre « Couleur personnalisée » (js/color-dialog.js) : lecture d'un
// code hexadécimal, passages entre #rrggbb, rouge-vert-bleu et teinte-saturation-valeur (la forme du carré de la fenêtre), couleur de l'encre qui se
// lit sur un fond. Des fonctions pures, sans DOM ni état : dev-tests/unit-color-math.mjs les exerce telles quelles. Une couleur est toujours un
// « #rrggbb » en minuscules, la forme que les marques de texte, les fonds de case et le trait des bordures gardent depuis toujours.
const ColorMath = (function () {
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
  const byteHex = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

  // « #1e8449 », « 1E8449 », « #1e8 » ou « 1e8 » (le # est facultatif, les blancs autour sont ignorés, trois chiffres valent six chiffres doublés) en
  // « #1e8449 » ; null pour tout autre texte (cinq chiffres, un caractère qui n'est pas hexadécimal, un code avec opacité).
  function parseHex(text) {
    const found = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text == null ? '' : text).trim());
    if (!found) return null;
    const digits = found[1].toLowerCase();
    return '#' + (digits.length === 3 ? digits.replace(/./g, '$&$&') : digits);
  }

  // Une couleur telle que les marques et les cases la gardent : « #1e8449 » ou « rgb(30, 132, 73) » (ce que le navigateur relit d'un style en
  // ligne), en « #1e8449 ». null pour une valeur vide, un nom de couleur ou tout autre texte : l'appelant n'a alors aucune couleur à marquer.
  function parseCss(value) {
    const text = String(value == null ? '' : value).trim();
    if (text.charAt(0) === '#') return parseHex(text);
    const found = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(text);
    return found ? toHex({ r: Number(found[1]), g: Number(found[2]), b: Number(found[3]) }) : null;
  }

  function toHex({ r, g, b }) { return '#' + byteHex(r) + byteHex(g) + byteHex(b); }
  function toRgb(hex) {
    const n = parseInt(parseHex(hex).slice(1), 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  }

  // Teinte en degrés [0, 360[, saturation et valeur dans [0, 1]. Un gris (saturation nulle) ou un noir n'a pas de teinte : 0, à l'appelant de garder
  // celle qu'il avait.
  function rgbToHsv({ r, g, b }) {
    const red = r / 255, green = g / 255, blue = b / 255;
    const max = Math.max(red, green, blue);
    const delta = max - Math.min(red, green, blue);
    let h = 0;
    if (delta) {
      if (max === red) h = ((green - blue) / delta) % 6;
      else if (max === green) h = (blue - red) / delta + 2;
      else h = (red - green) / delta + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? delta / max : 0, v: max };
  }
  function hsvToRgb({ h, s, v }) {
    const hue = ((h % 360) + 360) % 360 / 60;
    const chroma = v * s;
    const x = chroma * (1 - Math.abs((hue % 2) - 1));
    const [r, g, b] = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(hue) % 6];
    const m = v - chroma;
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  // Luminance relative et contraste de la WCAG 2 : de quoi choisir, sur un fond, entre une encre noire et une encre blanche.
  function luminance(hex) {
    const { r, g, b } = toRgb(hex);
    const linear = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // L'encre (noir ou blanc) qui se lit le mieux sur `hex` : la coche de la pastille choisie, la valeur écrite sur l'aperçu.
  function inkOn(hex) { return contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff'; }

  return { parseHex, parseCss, toHex, toRgb, rgbToHsv, hsvToRgb, luminance, contrast, inkOn };
})();
