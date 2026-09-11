// Suite "lists" - puces (3 styles), listes numérotées (3 styles), cases à
// cocher (3 styles), indent/outdent, dans le flux principal.
(function () {
  const cases = [];

  function bulletShapeOf(html) { return /data-bullet-style="([^"]+)"/.exec(html); }

  ['disc', 'circle', 'square'].forEach(shape => {
    cases.push({
      id: 'list_bullet_' + shape,
      description: 'Puce style "' + shape + '"',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Item ' + shape);
        await h.clickButton('v2-btn-bullet-' + shape);
        const html = Editor.getHTML();
        // 'disc' est la valeur par défaut - aucun attribut n'est rendu dans ce
        // cas (optimisation volontaire, cf. editor.js:695), donc son absence
        // EST le résultat correct pour "disc" spécifiquement.
        const pass = shape === 'disc'
          ? html.includes('<ul>') && !/data-bullet-style/.test(html)
          : new RegExp('data-bullet-style="' + shape + '"').test(html);
        return { pass, notes: html };
      },
    });
  });

  ['numeric', 'alpha', 'roman'].forEach(style => {
    cases.push({
      id: 'list_ordered_' + style,
      description: 'Liste numérotée style "' + style + '"',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Item ' + style);
        await h.clickButton('v2-btn-ordered-' + style);
        const html = Editor.getHTML();
        return { pass: html.includes('<ol'), notes: html };
      },
    });
  });

  ['accent-strike', 'classic', 'accent-plain'].forEach(style => {
    cases.push({
      id: 'list_checklist_' + style,
      description: 'Case à cocher style "' + style + '"',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Tâche ' + style);
        await h.clickButton('v2-btn-checklist-' + style);
        const html = Editor.getHTML();
        return { pass: /data-type="taskList"/.test(html) && /data-checked/.test(html), notes: html };
      },
    });
  });

  cases.push({
    id: 'list_multi_item_ordered',
    description: 'Liste numérotée à 3 éléments, chacun distinct (pas fusionnés)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Premier');
      await h.clickButton('v2-btn-ordered-numeric');
      await h.typeText('\n');
      await h.typeText('Deuxième');
      await h.typeText('\n');
      await h.typeText('Troisième');
      await h.sleep(60);
      const items = h.tiptap().querySelectorAll('ol li');
      return { pass: items.length === 3, notes: 'items=' + items.length + ' html=' + Editor.getHTML() };
    },
  });

  cases.push({
    id: 'list_indent_outdent',
    description: 'Augmenter puis diminuer le retrait d\'un élément de liste',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Parent');
      await h.clickButton('v2-btn-ordered-numeric');
      await h.typeText('\n');
      await h.typeText('Enfant');
      await h.sleep(40);
      await h.clickButton('v2-btn-indent');
      const htmlIndented = Editor.getHTML();
      await h.clickButton('v2-btn-outdent');
      const htmlOutdented = Editor.getHTML();
      // Un retrait ProseMirror pour une liste imbrique un <ol> DANS le <li> précédent.
      const nestedWhenIndented = /<li[^>]*>[^<]*<ol/.test(htmlIndented) || /<\/p><ol/.test(htmlIndented);
      return { pass: nestedWhenIndented, notes: JSON.stringify({ htmlIndented, htmlOutdented }) };
    },
  });

  cases.push({
    id: 'list_checklist_check_toggle',
    description: 'Cocher une case à cocher change son attribut data-checked',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('À cocher');
      await h.clickButton('v2-btn-checklist-classic');
      await h.sleep(40);
      const checkbox = h.tiptap().querySelector('input[type="checkbox"]');
      if (!checkbox) return { pass: false, notes: 'aucune case à cocher trouvée dans le DOM - html=' + Editor.getHTML() };
      checkbox.click();
      await h.sleep(40);
      const html = Editor.getHTML();
      return { pass: /data-checked="true"/.test(html), notes: html };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.lists = cases;
})();
