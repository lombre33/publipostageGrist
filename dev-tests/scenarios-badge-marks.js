// Suite "badgeMarks" - la couleur de police, le surlignage, le souligné et le barré posés sur une bulle de variable se voient dans l'éditeur (Antoine, 22/10, carte « Tout montrer sur la bulle » :
// « Montrer la couleur et le souligné des bulles dans l'éditeur ? »). La Lecture, le PDF et le Word les écrivaient déjà ; l'éditeur non : la bulle a ses propres couleurs (css/style.css,
// `.var-badge`) et son texte dans une boîte en ligne (`inline-block`, `inline-flex` dans une case) que ni la couleur, ni le fond, ni un trait de la marque qui l'entoure n'atteignent (le gras,
// l'italique, la taille et la police, eux, s'y voyaient). js/editor-nodes.js:splitBadgeView relit les marques du nœud (showTextMarks) et les pose en variables `--pp-mark-*` que
// css/variable-actions.css montre : une couleur choisie efface le fond pâle, le surlignage le remplace, le souligné et le barré se dessinent sur le nom ; une bulle cassée ou sans lien garde
// ses couleurs d'alerte ; sélectionnée, une bulle colorée montre un double anneau au lieu du fond bleu. Le HTML enregistré ne change pas. Les gestes à la vraie souris (clic sur la bulle, palette de
// la barre, liste « # » dans une case foncée) sont dans dev-tests/verify-table-cells-mouse.mjs (section « bulle »).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();

  const BADGE = (column = 'Nom') => `<span class="var-badge" data-table="Clients" data-column="${column}" data-key="Clients.${column}"></span>`;
  const WHITE = 'rgb(255, 255, 255)';
  const RED = 'rgb(185, 28, 28)';
  const INK = 'rgb(18, 64, 107)';       // le texte de la bulle sans réglage (css/style.css)
  const PALE = 'rgb(234, 242, 255)';    // son fond
  const SELECTED = 'rgb(185, 210, 248)'; // son fond quand elle est sélectionnée (css/variable-actions.css)
  const CLEAR = 'rgba(0, 0, 0, 0)';
  const span = (style, inner) => `<span style="${style}">${inner}</span>`;

  async function withBadges(h, html, body) {
    await h.resetEditor();
    window.__gristStub.setVariables('Clients', { Nom: 'Text', Ville: 'Text', Adresse_postale_complete_du_client: 'Text' });
    await GristAPI.refreshSchema();
    Editor.setHTML(html);
    await sleep(300);
    try { return await body(); } finally { await sleep(30); }
  }
  const badgeEl = (index = 0) => document.querySelectorAll('.tiptap .var-badge')[index];
  const looks = el => {
    const s = getComputedStyle(el);
    return { color: s.color, bg: s.backgroundColor, lines: s.textDecorationLine, ring: s.boxShadow !== 'none', border: s.borderTopColor, weight: s.fontWeight, style: s.fontStyle, size: s.fontSize, family: s.fontFamily.split(',')[0].replace(/["']/g, '') };
  };
  const viewAttrs = el => Array.from(el.attributes).filter(a => a.name.startsWith('data-mark')).map(a => a.name);
  const posOfBadge = (index = 0) => { const list = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') list.push(pos); }); return list[index]; };
  const selectBadge = async (index = 0) => { ed().commands.setNodeSelection(posOfBadge(index)); await sleep(80); };

  cases.push({
    id: 'badge_marks_text_color_shows_on_the_bubble_and_drops_the_pale_fill',
    description: 'Une couleur de police posée sur une bulle de variable se voit dans l\'éditeur : le nom prend la couleur choisie et le fond pâle de la bulle disparaît (le liseré reste), pour que le blanc choisi se lise sur une case foncée (avant, la bulle gardait son bleu foncé sur son fond pâle, la couleur n\'existait qu\'à la Lecture, au PDF et au Word)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', BADGE()) + '</p>', async () => {
      const l = looks(badgeEl());
      const plainBorder = 'rgb(183, 205, 242)';
      return { pass: l.color === WHITE && l.bg === CLEAR && l.border === plainBorder, notes: JSON.stringify(l) };
    }),
  });

  cases.push({
    id: 'badge_marks_highlight_shows_on_the_bubble',
    description: 'Un surlignage posé sur une bulle de variable prend la place de son fond pâle ; le nom garde sa couleur (avant, la bulle gardait son fond pâle : le jaune ne se voyait qu\'autour d\'elle)',
    run: async (h) => withBadges(h, '<p>' + span('background-color: #fde68a', BADGE()) + '</p>', async () => {
      const l = looks(badgeEl());
      return { pass: l.bg === 'rgb(253, 230, 138)' && l.color === INK, notes: JSON.stringify(l) };
    }),
  });

  cases.push({
    id: 'badge_marks_color_and_highlight_together',
    description: 'Couleur et surlignage ensemble sur une bulle : le nom prend la couleur et le fond le surlignage, comme le texte qui l\'entoure (blanc sur rouge)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff; background-color: #b91c1c', 'Texte ' + BADGE()) + '</p>', async () => {
      const l = looks(badgeEl());
      return { pass: l.color === WHITE && l.bg === RED, notes: JSON.stringify(l) };
    }),
  });

  [
    ['underline', '<u>' + BADGE() + '</u>', 'underline', 'souligné'],
    ['strike', '<s>' + BADGE() + '</s>', 'line-through', 'barré'],
    ['underline_and_strike', '<u><s>' + BADGE() + '</s></u>', 'underline line-through', 'souligné et barré ensemble'],
  ].forEach(([name, inner, want, label]) => {
    cases.push({
      id: 'badge_marks_' + name + '_is_drawn_on_the_bubble',
      description: `Le ${label} posé sur une bulle de variable se dessine sur son nom (la boîte en ligne de la bulle n'hérite pas du trait de la marque qui l'entoure : avant, rien ne se voyait)`,
      run: async (h) => withBadges(h, '<p>Texte ' + inner + '</p>', async () => {
        const l = looks(badgeEl());
        const lines = l.lines.split(' ').sort().join(' ');
        return { pass: lines === want.split(' ').sort().join(' '), notes: JSON.stringify({ want, got: l.lines }) };
      }),
    });
  });

  cases.push({
    id: 'badge_marks_a_plain_bubble_keeps_its_own_look',
    description: 'Une bulle sans réglage garde son texte bleu foncé sur son fond pâle, sans trait, et ne reçoit aucun attribut de vue (rien ne change pour ce qui n\'a pas de marque)',
    run: async (h) => withBadges(h, '<p>Texte ' + BADGE() + '</p>', async () => {
      const el = badgeEl();
      const l = looks(el);
      return { pass: l.color === INK && l.bg === PALE && l.lines === 'none' && !l.ring && viewAttrs(el).length === 0 && !el.getAttribute('style'), notes: JSON.stringify({ l, attrs: viewAttrs(el), style: el.getAttribute('style') }) };
    }),
  });

  cases.push({
    id: 'badge_marks_bold_italic_size_and_font_are_unchanged',
    description: 'Le gras, l\'italique, la taille et la police d\'une bulle se voyaient déjà et ne passent pas par la vue des couleurs : ils s\'affichent comme avant et ne posent aucun attribut de vue',
    run: async (h) => withBadges(h, '<p><strong><em>' + span('font-size: 24pt; font-family: Georgia', BADGE()) + '</em></strong></p>', async () => {
      const el = badgeEl();
      const l = looks(el);
      return { pass: Number(l.weight) >= 700 && l.style === 'italic' && parseFloat(l.size) > 25 && l.family === 'Georgia' && l.color === INK && l.bg === PALE && viewAttrs(el).length === 0, notes: JSON.stringify({ l, attrs: viewAttrs(el) }) };
    }),
  });

  cases.push({
    id: 'badge_marks_a_broken_bubble_keeps_its_alert_colors_and_shows_the_lines',
    description: 'Une bulle dont la colonne n\'existe plus garde son rouge d\'alerte même avec une couleur et un surlignage choisis (le signal ne disparaît pas) ; son souligné se dessine',
    run: async (h) => withBadges(h, '<p><u>' + span('color: #ffffff; background-color: #1e3a8a', BADGE('Inconnue')) + '</u></p>', async () => {
      const el = badgeEl();
      const l = looks(el);
      return { pass: el.classList.contains('var-badge-broken') && l.color === 'rgb(164, 35, 28)' && l.bg === 'rgb(251, 233, 233)' && l.lines === 'underline', notes: JSON.stringify({ cls: el.className, l }) };
    }),
  });

  cases.push({
    id: 'badge_marks_an_unlinked_bubble_keeps_its_alert_colors',
    description: 'Une bulle dont la table n\'a plus de lien avec la page garde son ambre d\'alerte avec une couleur choisie (la classe est posée par refreshVariableBadgeValidity, ici à la main : seul le CSS est en jeu)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', BADGE()) + '</p>', async () => {
      const el = badgeEl();
      el.classList.add('var-badge-unlinked');
      await sleep(30);
      const l = looks(el);
      return { pass: l.color === 'rgb(135, 54, 0)' && l.bg === 'rgb(255, 230, 199)', notes: JSON.stringify(l) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_palette_commands_on_a_selected_bubble_update_the_view_and_unset_restores_it',
    description: 'Une bulle sélectionnée (un clic sur elle) à laquelle la barre pose une couleur, un surlignage, le souligné puis le barré se met à jour tout de suite ; retirer la couleur et le surlignage lui rend son aspect d\'origine (ProseMirror refait la vue de la bulle dès que ses marques changent)',
    run: async (h) => withBadges(h, '<p>Texte ' + BADGE() + ' fin</p>', async () => {
      await selectBadge();
      ed().chain().focus().setTextColor('#b91c1c').run();
      await sleep(60);
      const withColor = looks(badgeEl());
      await selectBadge();
      ed().chain().focus().setHighlight('#fde68a').run();
      await selectBadge();
      ed().chain().focus().toggleUnderline().run();
      await selectBadge();
      ed().chain().focus().toggleStrike().run();
      await sleep(60);
      const withAll = looks(badgeEl());
      await selectBadge();
      ed().chain().focus().unsetTextColor().run();
      await selectBadge();
      ed().chain().focus().unsetHighlight().run();
      await selectBadge();
      ed().chain().focus().toggleUnderline().run();
      await selectBadge();
      ed().chain().focus().toggleStrike().run();
      await sleep(60);
      const back = looks(badgeEl());
      const ok = withColor.color === RED && withColor.bg === CLEAR
        && withAll.color === RED && withAll.bg === 'rgb(253, 230, 138)' && withAll.lines.includes('underline') && withAll.lines.includes('line-through')
        && back.color === INK && back.bg !== undefined && back.lines === 'none' && viewAttrs(badgeEl()).length === 0;
      return { pass: ok, notes: JSON.stringify({ withColor, withAll, back, attrs: viewAttrs(badgeEl()) }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_saved_html_and_the_copied_html_do_not_carry_the_view',
    description: 'Les variables CSS et les attributs de la vue ne sont que dans l\'éditeur : getHTML() (l\'enregistrement, la Lecture, les exports) et le HTML copié gardent la bulle et ses marques comme avant, sans `data-mark-` ni `--pp-mark`',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff; background-color: #1e3a8a', '<u>' + BADGE() + '</u>') + '</p>', async () => {
      const saved = ed().getHTML();
      const view = ed().view;
      const slice = view.state.doc.slice(0, view.state.doc.content.size);
      const copied = view.serializeForClipboard ? view.serializeForClipboard(slice).dom.innerHTML : '';
      const clean = html => !/data-mark-|--pp-mark/.test(html) && /class="var-badge"/.test(html) && /color: ?rgb\(255, 255, 255\)/.test(html) && /<u>/.test(html);
      return { pass: clean(saved) && clean(copied), notes: JSON.stringify({ saved: saved.slice(0, 300), copied: copied.slice(0, 300) }) };
    }),
  });

  cases.push({
    id: 'badge_marks_a_selected_colored_bubble_shows_a_ring_instead_of_the_blue_fill',
    description: 'Sélectionnée, une bulle dont la couleur ou le surlignage est choisi montre un double anneau et garde son fond (le fond bleu de la sélection rendrait un texte clair illisible) ; une bulle sans réglage garde le fond bleu de la sélection, sans anneau',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', BADGE()) + ' ' + BADGE('Ville') + '</p>', async () => {
      await selectBadge(0);
      const colored = looks(badgeEl(0));
      await selectBadge(1);
      const plain = looks(badgeEl(1));
      return { pass: colored.ring && colored.bg === CLEAR && colored.color === WHITE && !plain.ring && plain.bg === SELECTED, notes: JSON.stringify({ colored, plain }) };
    }),
  });

  cases.push({
    id: 'badge_marks_in_a_table_cell_the_head_and_tail_of_the_bubble_read_in_the_chosen_color',
    description: 'Dans une case de tableau, où la bulle est coupée en un début et une fin en boîtes flex (nom long), les deux morceaux prennent la couleur choisie et le trait se pose sur la bulle',
    run: async (h) => withBadges(h, '<table><tbody><tr><td style="background-color:#1e3a8a" data-background-color="#1e3a8a"><p>' + span('color: #ffffff', '<s>' + BADGE('Adresse_postale_complete_du_client') + '</s>') + '</p></td></tr></tbody></table>', async () => {
      const el = badgeEl();
      const head = el.querySelector('.var-badge-head');
      const tail = el.querySelector('.var-badge-tail');
      const l = looks(el);
      const inCell = getComputedStyle(el).display === 'inline-flex';
      const headColor = head ? getComputedStyle(head).color : null;
      const tailColor = tail ? getComputedStyle(tail).color : null;
      return { pass: inCell && !!head && !!tail && headColor === WHITE && tailColor === WHITE && l.lines === 'line-through' && l.bg === CLEAR, notes: JSON.stringify({ inCell, headColor, tailColor, l }) };
    }),
  });

  cases.push({
    id: 'badge_marks_a_bubble_put_in_empty_cells_with_a_chosen_color_reads_in_that_color',
    description: 'Le parcours de la demande : des cases vides d\'un tableau, une police blanche choisie sur leur sélection, puis une bulle posée dans l\'une d\'elles : la bulle prend la couleur gardée (js/typing-style.js) ET la montre dans l\'éditeur (avant, elle restait bleu foncé sur son fond pâle)',
    run: async (h) => withBadges(h, '<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table><p>Après</p>', async () => {
      const cells = [];
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') cells.push(pos); });
      ed().commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
      await sleep(60);
      ed().chain().focus().setTextColor('#ffffff').run();
      await sleep(60);
      ed().chain().focus().setTextSelection(cells[0] + 2).run();
      await sleep(40);
      ed().chain().focus().insertContent({ type: 'varBadge', attrs: { table: 'Clients', column: 'Nom', key: 'Clients.Nom' } }).run();
      await sleep(120);
      const el = badgeEl();
      const l = el ? looks(el) : null;
      return { pass: !!el && l.color === WHITE && l.bg === CLEAR, notes: JSON.stringify({ l, html: ed().getHTML().slice(0, 300) }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.badgeMarks = cases;
})();
