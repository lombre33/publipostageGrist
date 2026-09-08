// Publipostage Grist — reader mode v1.1.2 — 2026-09-04
const ReaderMode = (function () {
  let lastCurrentTableId = null;
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
      try { const value = await Variables.resolveVariable(table, column, tableId, record); return { badge, value, error: null }; }
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
  // Remplace chaque placeholder .toc-marker (posé par l'éditeur, cf.
  // editor.js:TocBlot) par la vraie liste des titres de premier niveau -
  // numérotée comme dans l'éditeur (même mécanisme de compteur CSS ::before,
  // cf. style.css), variables déjà résolues en texte (headings scannés APRÈS
  // la boucle de résolution des badges ci-dessus). Pas de numéro de page ici
  // (le mode lecture n'est pas paginé) - contrairement à l'export PDF vectoriel
  // (cf. pdf-export.js:buildTocStack), seul endroit où cette information a un
  // sens.
  function resolveTocMarkers(wrapper) {
    const tocMarkers = wrapper.querySelectorAll(':scope > .toc-marker');
    if (!tocMarkers.length) return;
    const headings = Array.from(wrapper.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    // getComputedStyle(node, '::before').content n'est fiable que sur un noeud
    // réellement en boîte (attaché au document) - cf. pdf-export.js:attachMeasureHost,
    // même contrainte, même remède : attacher hors-écran le temps de la mesure,
    // puis détacher avant le rattachement normal (fait par l'appelant juste après).
    const prevPosition = wrapper.style.position, prevLeft = wrapper.style.left, prevVisibility = wrapper.style.visibility;
    wrapper.style.position = 'absolute'; wrapper.style.left = '-99999px'; wrapper.style.visibility = 'hidden';
    document.body.appendChild(wrapper);
    const entries = headings.map(h => {
      const level = parseInt(h.tagName.slice(1), 10) || 1;
      let marker = '';
      try {
        const raw = getComputedStyle(h, '::before').content;
        if (raw && raw !== 'none' && raw !== 'normal') { const stripped = raw.replace(/^["']|["']$/g, '').trim(); if (stripped) marker = stripped + ' '; }
      } catch (e) { /* pas de numérotation configurée */ }
      return { level, text: (marker + (h.textContent || '')).replace(/\s+/g, ' ').trim() };
    });
    wrapper.parentNode.removeChild(wrapper);
    wrapper.style.position = prevPosition; wrapper.style.left = prevLeft; wrapper.style.visibility = prevVisibility;
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
  async function preview(htmlContent, tableId, record) {
    const wrapper = document.createElement('div'); wrapper.innerHTML = htmlContent; const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => { const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column'); try { const value = await Variables.resolveVariable(table, column, tableId || lastCurrentTableId, record); const span = document.createElement('span'); span.textContent = value; badge.replaceWith(span); } catch (e) {} }));
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
