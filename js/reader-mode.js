// Publipostage Grist — reader mode v1.1.0 — 2026-09-03 (logs de garde)
console.log('[reader-mode] module chargé, timestamp:', new Date().toISOString(), 'v1.1.0');

const ReaderMode = (function () {
  let lastCurrentTableId = null;

  function render(htmlContent, record, tableId) {
    const container = document.getElementById('reader-container');
    if (!container) return;
    if (!record) {
      console.warn('[reader-mode] render appelé SANS record.');
      container.innerHTML = '<p class="error-msg">Aucune ligne sélectionnée dans Grist.</p>';
      return;
    }
    console.log('[reader-mode] render: tableId=', tableId, 'recordKeys=', Object.keys(record));

    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;

    const badges = wrapper.querySelectorAll('.var-badge');
    let hasError = false;
    for (const badge of badges) {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      try {
        const value = Variables.resolveVariable(table, column, record, tableId);
        const span = document.createElement('span');
        span.textContent = value;
        span.className = 'resolved-var';
        badge.replaceWith(span);
      } catch (e) {
        const span = document.createElement('span');
        span.textContent = '[ERREUR: ' + e.message + ']';
        span.className = 'resolved-var error-msg';
        badge.replaceWith(span);
        hasError = true;
      }
    }

    container.innerHTML = '';
    if (hasError) {
      const warn = document.createElement('p');
      warn.className = 'error-msg';
      warn.textContent = 'Attention : certaines variables n\'ont pas pu être résolues.';
      container.appendChild(warn);
    }
    container.appendChild(wrapper);
  }

  function preview(htmlContent, record) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    const badges = wrapper.querySelectorAll('.var-badge');
    for (const badge of badges) {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      try {
        const value = Variables.resolveVariable(table, column, record, lastCurrentTableId);
        const span = document.createElement('span');
        span.textContent = value;
        badge.replaceWith(span);
      } catch (e) { /* silencieux pour preview */ }
    }
    return wrapper.innerHTML;
  }

  function resolveFilename(filenameTemplate, record) {
    if (!filenameTemplate) return 'publipostage';
    const regex = /#([A-Za-z0-9_]+)/g;
    let result = filenameTemplate;
    const matches = [...filenameTemplate.matchAll(regex)];
    for (const m of matches) {
      const key = m[1];
      const allVars = GristAPI.getAllVariables();
      const found = allVars.find(v => v.key === key || v.column === key);
      if (found) {
        const val = record[found.column];
        result = result.replace('#' + key, val != null ? String(val) : '');
      }
    }
    return result;
  }

  return { render, preview, resolveFilename };
})();
