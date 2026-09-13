// Numérotation des titres — cascade de compteurs reproduite en JS, partagée entre js/editor.js (aperçu du sommaire) et js/pdf-export.js (marqueurs + sommaire
// du PDF). Doit produire le même texte que les compteurs CSS de editor-v2.css - jamais via `getComputedStyle(h,'::before').content` (déclaré, pas peint).
//
// js/reader-mode.js a besoin de la même logique mais garde sa propre copie (pas de mécanisme de module entre scripts classiques) — compromis délibéré.
const HeadingNumbering = (function () {
  const SCHEMES = {
    numeric: ['decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman'],
    alpha: ['lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal'],
    roman: ['upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha'],
  };

  function formatCounterValue(n, counterStyle) {
    if (counterStyle === 'lower-alpha') {
      let result = '';
      let value = n;
      while (value > 0) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(97 + remainder) + result;
        value = Math.floor((value - 1) / 26);
      }
      return result;
    }
    if (counterStyle === 'upper-roman') {
      const table = [
        [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
        [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
      ];
      let result = '';
      let value = n;
      table.forEach(([amount, symbol]) => { while (value >= amount) { result += symbol; value -= amount; } });
      return result;
    }
    return String(n);
  }

  // Un marqueur ("1) "/"a) "/"") par titre, aligné par index à `headingEls` (ordre document) - jamais le texte complet du titre : les deux consommateurs
  // construisent ce texte différemment (pdf-export.js préserve la mise en forme via de vrais "runs" pdfmake, le sommaire n'a besoin que du textContent brut).
  function markersFor(headingEls, numberingStyle) {
    const scheme = SCHEMES[numberingStyle];
    if (!scheme) return headingEls.map(() => '');
    const counters = [0, 0, 0, 0, 0, 0];
    return headingEls.map(h => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      counters[level - 1] += 1;
      for (let i = level; i < 6; i += 1) counters[i] = 0;
      return formatCounterValue(counters[level - 1], scheme[level - 1]) + ') ';
    });
  }

  // Marqueur + texte du titre en une chaîne, pour un simple aperçu texte (cf. js/editor.js:Toc).
  function entriesFor(headingEls, numberingStyle) {
    const markers = markersFor(headingEls, numberingStyle);
    return headingEls.map((h, i) => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      return { level, text: (markers[i] + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
  }

  return { markersFor, entriesFor, formatCounterValue };
})();
