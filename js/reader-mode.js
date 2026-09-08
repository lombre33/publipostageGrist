// Publipostage Grist — reader mode v1.1.2 — 2026-09-04
const ReaderMode = (function () {
  let lastCurrentTableId = null;
  let renderGeneration = 0;
  async function render(htmlContent, tableId, record) {
    const renderId = ++renderGeneration;
    const container = document.getElementById('reader-container'); if (!container) return;
    if (!record) { container.innerHTML = '<p class="error-msg">Aucune ligne sélectionnée dans Grist.</p>'; return; }
    const wrapper = document.createElement('div'); wrapper.innerHTML = htmlContent;
    const badges = wrapper.querySelectorAll('.var-badge'); let hasError = false;
    const results = await Promise.all(Array.from(badges).map(async badge => {
      const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column');
      try { const value = await Variables.resolveVariable(table, column, tableId, record); return { badge, value, error: null }; }
      catch (e) { return { badge, value: '[ERREUR: ' + e.message + ']', error: e }; }
    }));
    for (const r of results) { const span = document.createElement('span'); span.textContent = r.value; span.className = 'resolved-var' + (r.error ? ' error-msg' : ''); if (r.error) hasError = true; r.badge.replaceWith(span); }
    await GristAPI.hydrateAttachmentImages(wrapper);
    if (renderId !== renderGeneration) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = 'Attention : certaines variables n\'ont pas pu être résolues.'; container.appendChild(warn); }
    container.appendChild(wrapper);
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
