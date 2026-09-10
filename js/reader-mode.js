// Publipostage Grist — reader mode v1.1.2 — 2026-09-04
const ReaderMode = (function () {
  let lastCurrentTableId = null;
  // Format nombre/date choisi via la barre flottante d'une bulle #Variable
  // (v2 uniquement, cf. v2/js/editor.js:wireVariableFloatingToolbar) -
  // sérialisé en JSON dans data-format par le nœud varBadge
  // (v2/js/editor.js:createVarBadgeNode). Transmis en 5e argument à
  // Variables.resolveVariable, qui l'ignore silencieusement côté V1 (sa
  // propre resolveVariable ne déclare que 4 paramètres) - un seul point de
  // lecture ici, partagé par render()/preview() ci-dessous, qui alimentent
  // respectivement le mode Lecture et l'export PDF (PdfExport ne voit jamais
  // les bulles brutes, preview() les a déjà toutes résolues avant).
  function parseBadgeFormat(badge) {
    const raw = badge.getAttribute('data-format');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  let renderGeneration = 0;
  async function render(htmlContent, tableId, record) {
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    if (!record) { container.innerHTML = '<p class="error-msg">Aucune ligne sélectionnée dans Grist.</p>'; return; }
    // .reader-content : PAS un simple <div> anonyme - c'est le parent DIRECT
    // des titres de premier niveau, celui qui porte data-heading-style (cf.
    // resolveTocMarkers ci-dessous et css/style.css : #reader-container lui-
    // même ne peut pas jouer ce rôle, il n'est jamais le parent direct des
    // titres puisque ce <div> s'intercale toujours entre les deux).
    const wrapper = document.createElement('div'); wrapper.className = 'reader-content'; wrapper.innerHTML = htmlContent;
    const configEl = wrapper.querySelector(':scope > .heading-numbering-config');
    wrapper.dataset.headingStyle = (configEl && configEl.dataset.style) || 'none';
    const badges = wrapper.querySelectorAll('.var-badge'); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column');
      const format = parseBadgeFormat(badge);
      try { const value = await Variables.resolveVariable(table, column, tableId, record, format); return { badge, value, error: null }; }
      catch (e) { return { badge, value: '[ERREUR: ' + e.message + ']', error: e }; }
    }));
    for (const r of results) { const span = document.createElement('span'); span.textContent = r.value; span.className = 'resolved-var' + (r.error ? ' error-msg' : ''); if (r.error) hasError = true; r.badge.replaceWith(span); }
    await GristAPI.hydrateAttachmentImages(wrapper);
    // Variables déjà résolues (texte des titres définitif) : peut construire
    // le sommaire maintenant, avant le swap DOM final ci-dessous.
    resolveTocMarkers(wrapper);
    if (renderId !== renderGeneration) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = 'Attention : certaines variables n\'ont pas pu être résolues.'; container.appendChild(warn); }
    container.appendChild(wrapper);
  }
  // Remplace chaque placeholder .toc-marker (posé par l'éditeur) par la
  // vraie liste des titres de premier niveau - numérotée avec le même schéma
  // que la numérotation CSS visible à l'écran (cf. style.css), variables
  // déjà résolues en texte (headings scannés APRÈS la boucle de résolution
  // des badges ci-dessus). Pas de numéro de page ici (le mode lecture n'est
  // pas paginé) - contrairement à l'export PDF vectoriel (cf. pdf-export.js:
  // buildTocStack), seul endroit où cette information a un sens.
  //
  // Le marqueur est RECALCULÉ EN JS (headingCounterEntries ci-dessous),
  // PAS lu via getComputedStyle(h, '::before').content : ce dernier ne
  // renvoie que la valeur CSS *déclarée* (ex. littéralement "counter(h1c)"),
  // jamais le texte réellement affiché à l'écran - `counter()` n'est résolu
  // qu'au moment de la peinture, la CSSOM ne l'expose pas (vérifié en
  // conditions réelles, Chrome à jour - un ancien comportement resolu existait
  // mais n'est plus spec-compliant). Bug pré-existant corrigé au passage :
  // ce fichier n'a donc plus besoin d'attacher `wrapper` hors-écran pour
  // mesurer quoi que ce soit ici.
  function resolveTocMarkers(wrapper) {
    const tocMarkers = wrapper.querySelectorAll(':scope > .toc-marker');
    if (!tocMarkers.length) return;
    const headings = Array.from(wrapper.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const numberingStyle = wrapper.dataset.headingStyle || 'none';
    const entries = headingCounterEntries(headings, numberingStyle);
    tocMarkers.forEach(marker => {
      marker.innerHTML = '';
      marker.classList.add('toc-resolved');
      const title = document.createElement('div'); title.className = 'toc-title'; title.textContent = 'Sommaire'; marker.appendChild(title);
      if (!entries.length) { const empty = document.createElement('div'); empty.className = 'toc-empty'; empty.textContent = 'Aucun titre trouvé.'; marker.appendChild(empty); return; }
      entries.forEach(entry => {
        const line = document.createElement('div'); line.className = 'toc-entry toc-level-' + entry.level; line.textContent = entry.text;
        marker.appendChild(line);
      });
    });
  }
  // Reproduit en JS la cascade de compteurs CSS de style.css
  // (.reader-content[data-heading-style] > h1..h6) : chaque titre incrémente
  // le compteur de SON niveau et réinitialise ceux des niveaux plus profonds
  // - même ordre de style par niveau que les règles CSS ::before (numeric/
  // alpha/roman). Un même titre affiche donc le MÊME marqueur ici qu'à
  // l'écran dans l'éditeur, sans dépendre de la lecture (non fiable, cf.
  // commentaire de resolveTocMarkers) d'un ::before déjà peint.
  const HEADING_COUNTER_SCHEMES = {
    numeric: ['decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman'],
    alpha: ['lower-alpha', 'upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal'],
    roman: ['upper-roman', 'decimal', 'lower-alpha', 'upper-roman', 'decimal', 'lower-alpha'],
  };
  function formatCounterValue(n, counterStyle) {
    if (counterStyle === 'lower-alpha') { let s = ''; let v = n; while (v > 0) { const rem = (v - 1) % 26; s = String.fromCharCode(97 + rem) + s; v = Math.floor((v - 1) / 26); } return s; }
    if (counterStyle === 'upper-roman') { const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; let v = n; table.forEach(([val, sym]) => { while (v >= val) { s += sym; v -= val; } }); return s; }
    return String(n);
  }
  function headingCounterEntries(headingEls, numberingStyle) {
    const scheme = HEADING_COUNTER_SCHEMES[numberingStyle];
    const counters = [0, 0, 0, 0, 0, 0];
    return headingEls.map(h => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      counters[level - 1] += 1;
      for (let i = level; i < 6; i += 1) counters[i] = 0;
      const marker = scheme ? formatCounterValue(counters[level - 1], scheme[level - 1]) + ') ' : '';
      return { level, text: (marker + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
  }
  async function preview(htmlContent, tableId, record) {
    const wrapper = document.createElement('div'); wrapper.innerHTML = htmlContent; const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => { const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column'); const format = parseBadgeFormat(badge); try { const value = await Variables.resolveVariable(table, column, tableId || lastCurrentTableId, record, format); const span = document.createElement('span'); span.textContent = value; badge.replaceWith(span); } catch (e) {} }));
    await GristAPI.hydrateAttachmentImages(wrapper);
    return wrapper.innerHTML;
  }
  // Découpe le gabarit en scannant chaque "#" et en essayant la PLUS LONGUE
  // clé de variable connue qui suit (pas un simple regex [A-Za-z0-9_]+) :
  // une clé Grist ("Clients_Nom") contient elle-même des "_", indiscernables
  // d'un séparateur littéral tapé entre deux variables ("Courrier_#Clients_
  // Nom_#Clients_Prenom" - le "_" avant le second "#" fait aussi partie de la
  // classe de caractères). Un simple regex captait alors "Clients_Nom_"
  // (avec le séparateur inclus), qui ne correspondait plus à AUCUNE vraie
  // clé - la variable entière était donc silencieusement perdue. Comparer
  // aux clés RÉELLEMENT connues (les plus longues d'abord, au cas où une
  // clé serait préfixe d'une autre) élimine cette ambiguïté : seul un "#"
  // non suivi d'AUCUNE clé connue reste tel quel, littéralement.
  async function resolveFilename(filenameTemplate, tableId, record) {
    if (!filenameTemplate) return 'publipostage';
    const allVars = GristAPI.getAllVariables();
    const sortedKeys = allVars.map(v => v.key).sort((a, b) => b.length - a.length);
    const matches = [];
    let i = 0;
    while (i < filenameTemplate.length) {
      if (filenameTemplate[i] === '#') {
        const rest = filenameTemplate.slice(i + 1);
        const key = sortedKeys.find(k => rest.startsWith(k));
        if (key) { matches.push({ start: i, key, end: i + 1 + key.length }); i += 1 + key.length; continue; }
      }
      i += 1;
    }
    const resolved = await Promise.all(matches.map(async m => {
      const found = allVars.find(v => v.key === m.key);
      try { const val = await Variables.resolveVariable(found.table, found.column, tableId, record); return String(val || '').replace(/[\\/:*?"<>|]/g, '_'); }
      catch (e) { return ''; }
    }));
    let result = ''; let lastEnd = 0;
    matches.forEach((m, idx) => { result += filenameTemplate.slice(lastEnd, m.start) + resolved[idx]; lastEnd = m.end; });
    result += filenameTemplate.slice(lastEnd);
    return result;
  }
  return { render, preview, resolveFilename };
})();
