// Suite "formatting" - gras/italique/souligné/barré/couleur/surlignage/
// police/taille/alignement, dans le flux principal. Les mêmes formats
// DANS une cellule de tableau / une colonne 2-colonnes sont couverts par
// scenarios-nesting.js (mécanisme différent : document.execCommand direct,
// pas les commandes chain() de l'éditeur principal).
(function () {
  const cases = [];

  cases.push({
    id: 'fmt_bold_basic',
    description: 'Gras appliqué via le bouton toolbar sur une sélection',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte en gras');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-bold');
      const html = Editor.getHTML();
      return { pass: /<strong>Texte en gras<\/strong>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'fmt_italic_basic',
    description: 'Italique appliqué via le bouton toolbar',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte italique');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-italic');
      const html = Editor.getHTML();
      return { pass: /<em>Texte italique<\/em>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'fmt_underline_basic',
    description: 'Souligné appliqué via le bouton toolbar',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte souligné');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-underline');
      const html = Editor.getHTML();
      return { pass: /<u>Texte souligné<\/u>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'fmt_strike_basic',
    description: 'Barré appliqué via le bouton toolbar',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte barré');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-strike');
      const html = Editor.getHTML();
      return { pass: /<s>Texte barré<\/s>/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'fmt_combine_bold_italic_underline',
    description: 'Gras + italique + souligné combinés sur la même sélection',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Combo');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-bold');
      await h.clickButton('v2-btn-italic');
      await h.clickButton('v2-btn-underline');
      const html = Editor.getHTML();
      const pass = /<strong>/.test(html) && /<em>/.test(html) && /<u>/.test(html);
      return { pass, notes: html };
    },
  });

  cases.push({
    id: 'fmt_toggle_off',
    description: 'Recliquer sur Gras retire le format (bascule, pas un état figé)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Toggle');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-bold');
      const htmlOn = Editor.getHTML();
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-bold');
      const htmlOff = Editor.getHTML();
      return { pass: /<strong>/.test(htmlOn) && !/<strong>/.test(htmlOff), notes: JSON.stringify({ htmlOn, htmlOff }) };
    },
  });

  const ALIGNS = ['left', 'center', 'right', 'justify'];
  ALIGNS.forEach(align => {
    cases.push({
      id: 'fmt_align_' + align,
      description: 'Alignement ' + align + ' appliqué sur un paragraphe',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Paragraphe à aligner ' + align);
        await h.selectAllInEditor();
        await h.clickButton('v2-btn-align-' + align);
        const html = Editor.getHTML();
        const pass = align === 'left'
          ? !/text-align/.test(html) || /text-align:\s*left/.test(html)
          : new RegExp('text-align:\\s*' + align).test(html);
        return { pass, notes: html };
      },
    });
  });

  cases.push({
    id: 'fmt_font_size_change',
    description: 'Changer la taille de police via le stepper +',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Taille test');
      await h.selectAllInEditor();
      const before = document.getElementById('v2-size-chip-val').textContent;
      await h.clickButton('v2-size-plus');
      const after = document.getElementById('v2-size-chip-val').textContent;
      return { pass: before !== after, notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'fmt_heading_levels',
    description: 'Chaque niveau de titre (1 à 6) produit bien la balise attendue',
    run: async (h) => {
      const failures = [];
      for (let level = 1; level <= 6; level++) {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Titre niveau ' + level);
        await h.selectAllInEditor();
        const select = document.getElementById('v2-header-select');
        select.value = String(level);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(40);
        const html = Editor.getHTML();
        if (!new RegExp('<h' + level + '[ >]').test(html)) failures.push({ level, html });
      }
      return { pass: failures.length === 0, notes: JSON.stringify(failures) };
    },
  });

  cases.push({
    id: 'fmt_heading_numbering_numeric',
    description: 'Numérotation "1." appliquée à 2 titres de même niveau se numérote 1 puis 2',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Premier titre');
      await h.selectAllInEditor();
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(40);
      await h.focusAtEnd();
      await h.typeText('\n');
      await h.typeText('Second titre');
      const sel2 = window.getSelection();
      const range2 = document.createRange();
      range2.selectNodeContents(h.tiptap().lastElementChild);
      sel2.removeAllRanges(); sel2.addRange(range2);
      await h.sleep(20);
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(40);
      const numSelect = document.getElementById('v2-heading-numbering-select');
      numSelect.value = 'numeric';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      const headings = Array.from(h.tiptap().querySelectorAll('h1'));
      const numbers = headings.map(el => getComputedStyle(el, '::before').content);
      return { pass: headings.length === 2, notes: 'headings=' + headings.length + ' beforeContents=' + JSON.stringify(numbers) + ' html=' + Editor.getHTML() };
    },
  });

  cases.push({
    id: 'fmt_undo_redo',
    description: 'Undo annule la dernière frappe, Redo la restaure',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('AAA');
      await h.typeText('BBB');
      const beforeUndo = Editor.getHTML();
      await h.clickButton('v2-btn-undo');
      const afterUndo = Editor.getHTML();
      await h.clickButton('v2-btn-redo');
      const afterRedo = Editor.getHTML();
      return {
        pass: beforeUndo.includes('AAABBB') && !afterUndo.includes('AAABBB') && afterRedo.includes('AAABBB'),
        notes: JSON.stringify({ beforeUndo, afterUndo, afterRedo }),
      };
    },
  });

  cases.push({
    id: 'fmt_undo_history_not_cleared_by_sethtml',
    // BUG CONFIRMÉ (cf. BUGS.md) : Editor.setHTML() (chemin réel de "Nouveau
    // modèle"/changement de modèle, cf. v2/js/main.js:loadTemplateIntoEditor)
    // ne vide PAS l'historique annuler/rétablir de TipTap - après avoir
    // chargé un AUTRE contenu, appuyer sur Annuler peut faire réapparaître le
    // contenu du modèle PRÉCÉDENT au lieu de ne rien faire (ou de rester sur
    // le contenu fraîchement chargé). Testé ici en reproduisant exactement ce
    // chemin (deux appels distincts à Editor.setHTML, comme un changement de
    // modèle réel), pas juste resetEditor() du harnais.
    description: 'CAS CONNU CASSÉ : Annuler après avoir chargé un NOUVEAU contenu (Editor.setHTML, ex. changement de modèle) ne doit PAS faire réapparaître un ANCIEN contenu (ni celui du modèle précédent, ni - constaté encore plus grave en pratique - celui d\'un modèle chargé BIEN avant)',
    run: async (h) => {
      Editor.exitHeaderFooterModeIfActive();
      Editor.setHTML('<p>Contenu du premier modèle</p>');
      await h.sleep(100);
      Editor.setHTML('<p>Contenu du second modèle</p>');
      await h.sleep(100);
      const beforeUndo = Editor.getHTML();
      await h.clickButton('v2-btn-undo');
      const afterUndo = Editor.getHTML();
      // Le résultat correct attendu : soit rien ne change (setHTML n'est pas
      // annulable, un choix de conception défendable), soit au pire on
      // retombe sur le "premier modèle" - mais JAMAIS un contenu qui n'a
      // RIEN à voir avec CE scénario (constaté en conditions réelles : un
      // Annuler a fait réapparaître le contenu d'un scénario complètement
      // différent, exécuté BIEN avant dans la même session - la pile
      // annuler/rétablir de TipTap n'est jamais vidée par setHTML, elle
      // s'accumule sur toute la durée de vie de l'éditeur).
      const bugReproduced = !afterUndo.includes('second modèle') && !afterUndo.includes('premier modèle');
      const alsoBadButNarrower = afterUndo.includes('premier modèle');
      return {
        pass: !bugReproduced && !alsoBadButNarrower,
        notes: 'beforeUndo=' + beforeUndo + ' afterUndo=' + afterUndo + (bugReproduced ? ' -- BUG REPRODUIT (grave) : Annuler a fait réapparaître le contenu d\'un scénario totalement étranger.' : alsoBadButNarrower ? ' -- BUG REPRODUIT : Annuler a fait réapparaître le modèle précédent.' : ''),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.formatting = cases;
})();
