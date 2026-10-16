// Numérotation des titres : la cascade de compteurs CSS reproduite en JS, pour le sommaire de l'éditeur (js/editor-nodes.js), celui de la Lecture
// (js/reader-mode.js) et les marqueurs et sommaires du PDF et du Word. Elle doit produire le même texte que les compteurs de css/editor-v2.css et de
// css/style.css, que `getComputedStyle(h, '::before').content` ne donnerait pas : il rend la déclaration, pas ce qui est peint.
const HeadingNumbering = (function () {
  // Trois styles à un compteur par niveau : « 1) », « a) », « I) » (le style de chaque niveau tourne entre décimal, lettres et romain).
  const SCHEMES = {
    numeric: ['decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman'],
    alpha: ['lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal'],
    roman: ['upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha'],
  };

  // Un style à chemin : le marqueur d'un titre est le chemin de ses compteurs, un point entre deux niveaux (« 1.a.1 »), et non son seul compteur.
  // « Article » : « Article 1 » pour le niveau 1 (le mot ne précède que lui), « 1.a » pour le niveau 2, « 1.a.1 » pour le niveau 3, puis
  // l'alternance continue (« 1.a.1.a »). Le mot est le même en français et en anglais.
  const PATH_SCHEMES = {
    article: { word: 'Article ', counters: ['decimal', 'lower-alpha', 'decimal', 'lower-alpha', 'decimal', 'lower-alpha'] },
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

  const levelOf = h => parseInt(h.tagName.slice(1), 10) || 1;

  // Un compteur d'un chemin peut être à zéro (un titre 2 avant tout titre 1, un titre 3 sous un titre 1 sans titre 2) : CSS écrit alors « 0 » même
  // en lettres (zéro est hors de l'intervalle des lettres, son repli est le décimal), là où formatCounterValue n'écrirait rien.
  const pathCounter = (count, counterStyle) => (count < 1 ? String(count) : formatCounterValue(count, counterStyle));

  // Un marqueur ("1) "/"a) "/"Article 1 "/"1.a "/"") par titre, aligné par index à `headingEls` (ordre document) - jamais le texte complet du titre :
  // les deux consommateurs construisent ce texte différemment (pdf-export.js préserve la mise en forme via de vrais "runs" pdfmake, le sommaire n'a
  // besoin que du textContent brut).
  function markersFor(headingEls, numberingStyle) {
    const scheme = SCHEMES[numberingStyle];
    const path = PATH_SCHEMES[numberingStyle];
    if (!scheme && !path) return headingEls.map(() => '');
    const counters = [0, 0, 0, 0, 0, 0];
    return headingEls.map(h => {
      const level = levelOf(h);
      counters[level - 1] += 1;
      for (let i = level; i < 6; i += 1) counters[i] = 0;
      if (scheme) return formatCounterValue(counters[level - 1], scheme[level - 1]) + ') ';
      return (level === 1 ? path.word : '') + counters.slice(0, level).map((count, i) => pathCounter(count, path.counters[i])).join('.') + ' ';
    });
  }

  // Marqueur + texte du titre en une chaîne, pour un simple aperçu texte (cf. js/editor.js:Toc).
  function entriesFor(headingEls, numberingStyle) {
    const markers = markersFor(headingEls, numberingStyle);
    return headingEls.map((h, i) => {
      const level = levelOf(h);
      return { level, text: (markers[i] + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
  }

  return { markersFor, entriesFor, formatCounterValue };
})();
