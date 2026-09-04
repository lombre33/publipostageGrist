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
    if (renderId !== renderGeneration) return;
    container.innerHTML = '';
    if (hasError) { const warn = document.createElement('p'); warn.className = 'error-msg'; warn.textContent = 'Attention : certaines variables n\'ont pas pu être résolues.'; container.appendChild(warn); }
    container.appendChild(wrapper);
  }
  async function preview(htmlContent, tableId, record) {
    const wrapper = document.createElement('div'); wrapper.innerHTML = htmlContent; const badges = wrapper.querySelectorAll('.var-badge');
    await Promise.all(Array.from(badges).map(async badge => { const table = badge.getAttribute('data-table'); const column = badge.getAttribute('data-column'); try { const value = await Variables.resolveVariable(table, column, tableId || lastCurrentTableId, record); const span = document.createElement('span'); span.textContent = value; badge.replaceWith(span); } catch (e) {} })); return wrapper.innerHTML;
  }
  async function resolveFilename(filenameTemplate, tableId, record) {
    if (!filenameTemplate) return 'publipostage';
    const matches = [...filenameTemplate.matchAll(/#([A-Za-z0-9_]+)/g)]; const allVars = GristAPI.getAllVariables();
    const resolved = await Promise.all(matches.map(async m => { const key = m[1]; const found = allVars.find(v => v.key === key || v.column === key); if (!found) return { key, value: '' }; try { const val = await Variables.resolveVariable(found.table, found.column, tableId, record); return { key, value: String(val || '').replace(/[\\/:*?"<>|]/g, '_') }; } catch (e) { return { key, value: '' }; } }));
    let result = filenameTemplate; for (const { key, value } of resolved) result = result.replaceAll('#' + key, value); return result;
  }
  return { render, preview, resolveFilename };
})();
