// Publipostage Grist — reader mode v1.1.0 — 2026-09-03 (logs de garde)
console.log('[reader-mode] module chargé, timestamp:', new Date().toISOString(), 'v1.1.0');

const ReaderMode = (function () {
  let lastCurrentTableId = null;

  async function render(htmlContent, tableId, record) {
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
    // BUG 2 — Promise.all pour paralléliser les résolutions indépendantes,
    // avec logs avant/après chaque appel.
    const results = await Promise.all(Array.from(badges).map(async (badge) => {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      try {
        console.log('[reader-mode] render: avant resolveVariable', { table, column, tableId });
        const value = await Variables.resolveVariable(table, column, tableId, record);
        console.log('[reader-mode] render: après resolveVariable', { table, column, value });
        return { badge, value, error: null };
      } catch (e) {
        console.error('[reader-mode] render: échec resolveVariable', { table, column }, e);
        return { badge, value: '[ERREUR: ' + e.message + ']', error: e };
      }
    }));
    for (const r of results) {
      const span = document.createElement('span');
      span.textContent = r.value;
      span.className = 'resolved-var' + (r.error ? ' error-msg' : '');
      if (r.error) hasError = true;
      r.badge.replaceWith(span);
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

  async function preview(htmlContent, tableId, record) {
    console.log('[reader-mode] preview: avant résolution (badges=' + (htmlContent.match(/var-badge/g) || []).length + ')');
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    const badges = wrapper.querySelectorAll('.var-badge');
    // BUG 2 — Promise.all sur tous les badges (résolution parallèle).
    await Promise.all(Array.from(badges).map(async (badge) => {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      try {
        console.log('[reader-mode] preview: avant resolveVariable', { table, column, tableId: tableId || lastCurrentTableId });
        const value = await Variables.resolveVariable(table, column, tableId || lastCurrentTableId, record);
        console.log('[reader-mode] preview: après resolveVariable', { table, column, value });
        const span = document.createElement('span');
        span.textContent = value;
        badge.replaceWith(span);
      } catch (e) {
        console.warn('[reader-mode] preview: variable non résolue', { table, column }, e);
      }
    }));
    console.log('[reader-mode] preview: après résolution.');
    return wrapper.innerHTML;
  }

  async function resolveFilename(filenameTemplate, tableId, record) {
    console.log('[reader-mode] resolveFilename: avant résolution', { template: filenameTemplate, tableId });
    if (!filenameTemplate) {
      console.log('[reader-mode] resolveFilename: pas de modèle, retour "publipostage".');
      return 'publipostage';
    }
    const regex = /#([A-Za-z0-9_]+)/g;
    const matches = [...filenameTemplate.matchAll(regex)];
    const allVars = GristAPI.getAllVariables();
    // BUG 2 — Promise.all : on résout toutes les variables du nom de fichier
    // en parallèle, puis on les ré-injecte (replaceAll pour gérer les répétitions).
    const resolved = await Promise.all(matches.map(async (m) => {
      const key = m[1];
      const found = allVars.find(v => v.key === key || v.column === key);
      if (!found) return { key, value: '' };
      try {
        console.log('[reader-mode] resolveFilename: avant resolveVariable', { table: found.table, column: found.column, key, tableId });
        const val = await Variables.resolveVariable(found.table, found.column, tableId, record);
        console.log('[reader-mode] resolveFilename: après resolveVariable', { key, val });
        return { key, value: String(val || '').replace(/[\\/:*?"<>|]/g, '_') };
      } catch (e) {
        console.warn('[reader-mode] resolveFilename: échec résolution', { key }, e);
        return { key, value: '' };
      }
    }));
    let result = filenameTemplate;
    for (const { key, value } of resolved) {
      result = result.replaceAll('#' + key, value);
    }
    console.log('[reader-mode] resolveFilename: après résolution', { result });
    return result;
  }

  return { render, preview, resolveFilename };
})();
