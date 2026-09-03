// Module mode lecture : affiche le contenu avec variables remplacées par les valeurs de la ligne courante
const ReaderMode = (function () {
  let lastCurrentTableId = null;

  async function render(htmlContent, currentTableId, record) {
    const container = document.getElementById('reader-container');
    if (!record) {
      container.innerHTML = '<p class="error-msg">Aucune ligne sélectionnée dans Grist.</p>';
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;

    const badges = wrapper.querySelectorAll('.var-badge, [data-key]');
    let hasError = false;
    for (const badge of badges) {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      try {
        const value = await Variables.resolveVariable(table, column, currentTableId, record);
        if (typeof value === 'string' && value.startsWith('[ERREUR')) hasError = true;
        const span = document.createElement('span');
        span.textContent = value;
        span.className = 'resolved-var';
        badge.replaceWith(span);
      } catch (e) {
        const span = document.createElement('span');
        span.textContent = `[ERREUR: ${e.message}]`;
        span.className = 'resolved-var error-msg';
        badge.replaceWith(span);
        hasError = true;
      }
    }

    container.innerHTML = '';
    if (hasError) {
      const warn = document.createElement('p');
      warn.className = 'error-msg';
      warn.textContent = "⚠ Certaines variables n'ont pas pu être résolues (vérifiez que le modèle correspond bien à cette table / qu'une référence existe).";
      container.appendChild(warn);
    }
    container.appendChild(wrapper);
  }

  async function getResolvedHTML(htmlContent, currentTableId, record) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = htmlContent;
    const badges = wrapper.querySelectorAll('.var-badge, [data-key]');
    for (const badge of badges) {
      const table = badge.getAttribute('data-table');
      const column = badge.getAttribute('data-column');
      const value = await Variables.resolveVariable(table, column, currentTableId, record);
      const span = document.createElement('span');
      span.textContent = value;
      badge.replaceWith(span);
    }
    return wrapper.innerHTML;
  }

  async function getResolvedFilename(filenameTemplate, currentTableId, record) {
    if (!filenameTemplate) return `publipostage_${new Date().toISOString().slice(0,10)}`;
    const regex = /#([A-Za-z0-9_]+)/g;
    let result = filenameTemplate;
    const matches = [...filenameTemplate.matchAll(regex)];
    for (const m of matches) {
      const key = m[1];
      const allVars = GristAPI.getAllVariables();
      const found = allVars.find(v => v.key === key);
      if (found) {
        const value = await Variables.resolveVariable(found.table, found.column, currentTableId, record);
        result = result.replace('#' + key, (value || '').toString().replace(/[\\/:*?"<>|]/g, '_'));
      }
    }
    return result;
  }

  return { render, getResolvedHTML, getResolvedFilename };
})();
