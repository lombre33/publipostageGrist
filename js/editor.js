// Module éditeur Quill : configuration, formats étendus (taille de police, police), undo/redo, badge de variable
const Editor = (function () {
  let quill = null;

  const FontSize = Quill.import('attributors/style/size');
  FontSize.whitelist = ['10px','12px','14px','16px','18px','20px','24px','28px','32px','36px','48px'];
  Quill.register(FontSize, true);

  const FontFamily = Quill.import('attributors/style/font');
  FontFamily.whitelist = ['Arial','Georgia','Times New Roman','Courier New','Verdana','Tahoma','Trebuchet MS'];
  Quill.register(FontFamily, true);

  // Blot custom pour les badges de variable (non éditable, insécable)
  const Embed = Quill.import('blots/embed');
  class VarBadgeBlot extends Embed {
    static create(value) {
      const node = super.create();
      node.setAttribute('data-table', value.table);
      node.setAttribute('data-column', value.column);
      node.setAttribute('data-key', value.key);
      node.setAttribute('contenteditable', 'false');
      node.classList.add('var-badge');
      node.textContent = '#' + value.key;
      return node;
    }
    static value(node) {
      return { table: node.getAttribute('data-table'), column: node.getAttribute('data-column'), key: node.getAttribute('data-key') };
    }
  }
  VarBadgeBlot.blotName = 'varbadge';
  VarBadgeBlot.tagName = 'span';
  VarBadgeBlot.className = 'var-badge';
  Quill.register(VarBadgeBlot);

  function init() {
    quill = new Quill('#editor-container', {
      theme: 'snow',
      modules: {
        toolbar: {
          container: [[{ header: [1, 2, 3, 4, 5, 6, false] }], ['bold', 'italic', 'underline'], [{ align: [] }], [{ size: FontSize.whitelist }], [{ font: FontFamily.whitelist }], ['undo', 'redo'], ['clean']],
          handlers: { undo: function () { quill.history.undo(); }, redo: function () { quill.history.redo(); } }
        },
        history: { delay: 500, maxStack: 100, userOnly: true }
      }
    });
    const toolbar = document.querySelector('.ql-toolbar');
    if (toolbar) {
      const undoBtn = toolbar.querySelector('.ql-undo'); const redoBtn = toolbar.querySelector('.ql-redo');
      if (undoBtn) undoBtn.innerHTML = '↶'; if (redoBtn) redoBtn.innerHTML = '↷';
    }
    Variables.init(quill);
    return quill;
  }
  function getQuill() { return quill; }
  function getHTML() { return quill.root.innerHTML; }
  function setHTML(html) { quill.root.innerHTML = html || ''; }
  function refreshAutocompleteSource() { return (typeof VariablesManager !== 'undefined') ? VariablesManager.getVariableList() : []; }
  return { init, getQuill, getHTML, setHTML, refreshAutocompleteSource };
})();
