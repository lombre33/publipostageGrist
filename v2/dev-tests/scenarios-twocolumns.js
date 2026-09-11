// Suite "twoColumns" - insertion, formatage dans chaque colonne, poignée de
// redimensionnement (glisser réel).
(function () {
  const cases = [];

  cases.push({
    id: 'twocol_insert_basic',
    description: 'Insertion d\'une zone 2-colonnes (exactement 2 colonnes)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      const html = Editor.getHTML();
      return { pass: html.includes('two-columns') && cols.length === 2, notes: 'cols=' + cols.length + ' html=' + html };
    },
  });

  cases.push({
    id: 'twocol_independent_content',
    description: 'Chaque colonne garde un contenu indépendant',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      await h.focusInElement(cols[0].querySelector('p') || cols[0]);
      await h.typeText('Colonne gauche');
      await h.focusInElement(cols[1].querySelector('p') || cols[1]);
      await h.typeText('Colonne droite');
      const html = Editor.getHTML();
      return { pass: html.includes('Colonne gauche') && html.includes('Colonne droite'), notes: html };
    },
  });

  cases.push({
    id: 'twocol_formatting_per_column',
    description: 'Aligner à droite le texte d\'UNE SEULE colonne ne touche pas l\'autre',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      const pLeft = cols[0].querySelector('p');
      const pRight = cols[1].querySelector('p');
      await h.focusInElement(pLeft);
      await h.typeText('Gauche');
      await h.focusInElement(pRight);
      await h.typeText('Droite');
      await h.selectAllInElement(pRight);
      await h.clickButton('v2-btn-align-right');
      const html = Editor.getHTML();
      const rightAligned = /Droite[\s\S]{0,5}<\/p>/.test(html) && /text-align:\s*right[^>]*>Droite/.test(html);
      const leftUntouched = !/text-align:\s*right[^>]*>Gauche/.test(html);
      return { pass: rightAligned && leftUntouched, notes: html };
    },
  });

  cases.push({
    id: 'twocol_resize_grip',
    description: 'Glisser la poignée de redimensionnement change la largeur relative des colonnes',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const grip = h.tiptap().querySelector('.two-columns-resize-grip');
      if (!grip) return { pass: false, notes: 'poignée de redimensionnement introuvable - html=' + Editor.getHTML() };
      const before = Editor.getHTML();
      const beforeMatch = /--layout-left:\s*([\d.]+)%/.exec(before);
      const rect = grip.getBoundingClientRect();
      await h.dragFromTo(grip, [rect.left + rect.width / 2, rect.top + rect.height / 2], [rect.left + 100, rect.top]);
      const after = Editor.getHTML();
      const afterMatch = /--layout-left:\s*([\d.]+)%/.exec(after);
      const beforeVal = beforeMatch ? beforeMatch[1] : '50';
      const afterVal = afterMatch ? afterMatch[1] : '50';
      return { pass: beforeVal !== afterVal, notes: JSON.stringify({ beforeVal, afterVal, before, after }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.twoColumns = cases;
})();
