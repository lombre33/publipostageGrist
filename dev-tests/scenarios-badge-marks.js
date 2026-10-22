// Suite "badgeMarks" - la couleur de police, le surlignage, le souligné et le barré posés sur une bulle de variable, une bulle « Calcul », une puce (date, heure, email, nom, numéro de ligne) ou une
// fiche « @ » se voient dans l'éditeur SI la personne a choisi « Mise en forme » dans Réglages > Thème (Antoine, 22/10 : carte « Tout montrer sur la bulle », puis « est-ce que l'on peut mettre le
// choix dans les setting ? », réponse « Un seul choix pour tout »). « Par défaut » (le départ), tout garde son aspect pâle, facile à repérer. La Lecture, le PDF et le Word les écrivaient déjà ;
// l'éditeur non : l'atome a ses propres couleurs (css/style.css, `.var-badge`, `.calc-badge`, `.smart-chip`, `.mention-chip`) et son texte dans une boîte en ligne (`inline-block`, `inline-flex` dans
// une case) que ni la couleur, ni le fond, ni un trait de la marque qui l'entoure n'atteignent (le gras, l'italique, la taille et la police, eux, s'y voyaient). js/editor-nodes.js:showTextMarks
// relit les marques du nœud (vue de la bulle de variable, de la bulle de calcul, de la puce ; js/mention.js:chipView pour la fiche) et les pose en variables `--pp-mark-*` que css/variable-actions.css
// montre sous l'attribut `data-bubble-marks` de <html> (js/settings.js:setBubbleMarks) : une couleur choisie efface le fond pâle, le surlignage le remplace, le souligné et le barré se dessinent
// sur le nom ; une bulle cassée ou sans lien garde ses couleurs d'alerte ; sélectionnée, une bulle colorée montre un double anneau au lieu de son fond de sélection. Le HTML enregistré ne change
// pas. Les gestes à la vraie souris (clic sur la bulle, palette de la barre, liste « # » dans une case foncée) sont dans dev-tests/verify-table-cells-mouse.mjs (section « bulle »), la fenêtre
// Réglages dans dev-tests/verify-settings-window-mouse.mjs, l'espace de GFS dans dev-tests/verify-gfs-storage.mjs.
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

  // Le choix de Réglages > Thème pendant le cas (« Mise en forme » : les cas d'origine décrivent ce qui se montre), puis rendu comme il était : la clé effacée si la page n'en avait pas.
  const SETTING_KEY = 'pp_bubble_marks';
  async function withBadges(h, html, body, setting = 'marks') {
    await h.resetEditor();
    window.__gristStub.setVariables('Clients', { Nom: 'Text', Ville: 'Text', Adresse_postale_complete_du_client: 'Text' });
    // La fiche « @ » des cas (ligne 1 de Clients) ne rougit que si sa ligne manque : une ligne, et rien de lu avant elle.
    window.__gristStub.setRows('Clients', [{ id: 1, Nom: 'Alpha', Ville: 'Lyon', Adresse_postale_complete_du_client: 'Rue des Lilas' }]);
    Mention.reset();
    await GristAPI.refreshSchema();
    const was = PersonStore.get(SETTING_KEY);
    Settings.setBubbleMarks(setting);
    Editor.setHTML(html);
    await sleep(300);
    try { return await body(); } finally {
      await sleep(30);
      Settings.setBubbleMarks(was === 'marks' ? 'marks' : 'default');
      if (was === null) PersonStore.remove(SETTING_KEY);
    }
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


  // ---- Un seul choix pour tout : la bulle de variable, la bulle « Calcul », les puces et la fiche « @ » (Réglages > Thème) ----

  const CALC = (formula = '1+1') => `<span class="calc-badge" data-formula="${formula}"></span>`;
  const CHIP = kind => `<span class="smart-chip" data-chip-kind="${kind}">${kind}</span>`;
  const MENTION = (table = 'Clients') => `<span class="mention-chip" data-mention-table="${table}" data-mention-row="1" data-mention-column="Nom">Alpha</span>`;
  const ATOMS = {
    variable: ['.var-badge', BADGE()],
    calcul: ['.calc-badge', CALC()],
    date: ['.smart-chip[data-chip-kind="date"]', CHIP('date')],
    heure: ['.smart-chip[data-chip-kind="time"]', CHIP('time')],
    email: ['.smart-chip[data-chip-kind="email"]', CHIP('email')],
    nom: ['.smart-chip[data-chip-kind="name"]', CHIP('name')],
    numeroLigne: ['.smart-chip[data-chip-kind="rowNumber"]', CHIP('rowNumber')],
    fiche: ['.mention-chip', MENTION()],
  };
  const CHIPS = ['date', 'heure', 'email', 'nom', 'numeroLigne'];
  // Blanc sur rouge, souligné et barré : tout ce que la vue relève.
  const MARKED = html => span('color: #ffffff; background-color: #b91c1c', '<u><s>' + html + '</s></u>');
  // Chaque atome deux fois : le premier paragraphe en porte la mise en forme, le second est son jumeau sans réglage (la référence de son aspect pâle).
  const TWINS = names => names.map(name => '<p>' + MARKED(ATOMS[name][1]) + '</p>').join('') + names.map(name => '<p>' + ATOMS[name][1] + '</p>').join('');
  const twinsOf = name => { const found = document.querySelectorAll('.tiptap ' + ATOMS[name][0]); return { marked: found[0], plain: found[1] }; };
  const same = (a, b) => a.color === b.color && a.bg === b.bg && a.lines === b.lines && a.ring === b.ring && a.border === b.border;
  const nodePosOf = (typeName, index = 0) => { const list = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === typeName) list.push(pos); }); return list[index]; };

  cases.push({
    id: 'badge_marks_by_default_every_bubble_and_chip_keeps_its_pale_look',
    description: 'Sous « Par défaut » (le choix de départ de Réglages > Thème), la bulle de variable, la bulle « Calcul », les cinq puces et la fiche « @ » qui portent une couleur, un surlignage, un souligné et un barré gardent leur aspect pâle, sans trait : leur couleur et leur fond sont ceux de leur jumeau sans réglage (la mise en forme reste dans le document, la Lecture, le PDF et le Word la portent)',
    run: async (h) => withBadges(h, TWINS(Object.keys(ATOMS)), async () => {
      const bad = [];
      Object.keys(ATOMS).forEach(name => {
        const { marked, plain } = twinsOf(name);
        if (!marked || !plain) { bad.push(name + ' : absent'); return; }
        const a = looks(marked);
        const b = looks(plain);
        if (!same(a, b) || a.lines !== 'none') bad.push(name + ' : ' + JSON.stringify({ marked: a, plain: b }));
      });
      return { pass: bad.length === 0 && document.documentElement.getAttribute('data-bubble-marks') === null, notes: bad.join(' ; ') };
    }, 'default'),
  });

  cases.push({
    id: 'badge_marks_by_default_a_dark_cell_keeps_the_bubble_readable',
    description: 'Le cas qui a mené au choix : une bulle de variable blanche dans une case bleu foncé reste, sous « Par défaut », la pastille pâle au nom bleu foncé (lisible sur n\'importe quel fond), alors que sous « Mise en forme » elle devient blanche sur le fond de la case',
    run: async (h) => {
      const html = '<table><tbody><tr><td style="background-color:#1e3a8a" data-background-color="#1e3a8a"><p>' + span('color: #ffffff', BADGE()) + '</p></td></tr></tbody></table>';
      const byDefault = await withBadges(h, html, async () => looks(badgeEl()), 'default');
      const formatted = await withBadges(h, html, async () => looks(badgeEl()), 'marks');
      return { pass: byDefault.color === INK && byDefault.bg === PALE && formatted.color === WHITE && formatted.bg === CLEAR, notes: JSON.stringify({ byDefault, formatted }) };
    },
  });

  cases.push({
    id: 'badge_marks_the_calc_bubble_shows_color_highlight_and_lines',
    description: 'Sous « Mise en forme », la bulle « Calcul » prend la couleur choisie (son fond vert pâle disparaît), le surlignage prend la place du fond (le texte garde son vert), le souligné et le barré se dessinent sur elle (avant, elle gardait son vert pâle, sans trait)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', CALC()) + '</p><p>' + span('background-color: #fde68a', CALC()) + '</p><p><u><s>' + CALC() + '</s></u></p><p>' + CALC() + '</p>', async () => {
      const [colored, highlighted, lined, plain] = Array.from(document.querySelectorAll('.tiptap .calc-badge')).map(looks);
      const ok = colored.color === WHITE && colored.bg === CLEAR
        && highlighted.bg === 'rgb(253, 230, 138)' && highlighted.color === plain.color
        && lined.lines.split(' ').sort().join(' ') === 'line-through underline' && lined.bg === plain.bg
        && plain.lines === 'none' && plain.color === 'rgb(20, 108, 67)' && plain.bg === 'rgb(231, 247, 238)';
      return { pass: ok, notes: JSON.stringify({ colored, highlighted, lined, plain }) };
    }),
  });

  cases.push({
    id: 'badge_marks_every_chip_shows_color_highlight_and_lines',
    description: 'Sous « Mise en forme », les cinq puces (date, heure, email, nom, numéro de ligne) prennent la couleur, le surlignage, le souligné et le barré choisis, comme la bulle de variable (avant, elles gardaient leur vert pâle, sans trait)',
    run: async (h) => withBadges(h, TWINS(CHIPS), async () => {
      const bad = [];
      CHIPS.forEach(name => {
        const { marked, plain } = twinsOf(name);
        if (!marked || !plain) { bad.push(name + ' : absent'); return; }
        const a = looks(marked);
        const b = looks(plain);
        const lines = a.lines.split(' ').sort().join(' ');
        if (!(a.color === WHITE && a.bg === RED && lines === 'line-through underline' && b.color === 'rgb(20, 108, 67)' && b.bg === 'rgb(231, 247, 238)' && b.lines === 'none')) bad.push(name + ' : ' + JSON.stringify({ marked: a, plain: b }));
      });
      return { pass: bad.length === 0, notes: bad.join(' ; ') };
    }),
  });

  cases.push({
    id: 'badge_marks_a_chip_color_alone_drops_its_pale_fill_and_a_highlight_alone_replaces_it',
    description: 'Une puce à qui l\'on ne donne qu\'une couleur perd son fond vert pâle (le blanc se lit sur une case foncée) ; qui reçoit seulement un surlignage garde son texte vert sur le fond choisi ; son liseré reste',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', CHIP('date')) + '</p><p>' + span('background-color: #fde68a', CHIP('date')) + '</p><p>' + CHIP('date') + '</p>', async () => {
      const [colored, highlighted, plain] = Array.from(document.querySelectorAll('.tiptap .smart-chip')).map(looks);
      const ok = colored.color === WHITE && colored.bg === CLEAR && colored.border === plain.border
        && highlighted.bg === 'rgb(253, 230, 138)' && highlighted.color === plain.color && highlighted.border === plain.border;
      return { pass: ok, notes: JSON.stringify({ colored, highlighted, plain }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_record_chip_shows_color_highlight_and_lines',
    description: 'Sous « Mise en forme », la fiche « @ » prend la couleur, le surlignage, le souligné et le barré choisis (avant, elle gardait son violet pâle, sans trait) ; sous « Par défaut » elle reste violette',
    run: async (h) => {
      const html = TWINS(['fiche']);
      const shown = await withBadges(h, html, async () => ({ marked: looks(twinsOf('fiche').marked), plain: looks(twinsOf('fiche').plain) }), 'marks');
      const pale = await withBadges(h, html, async () => ({ marked: looks(twinsOf('fiche').marked), plain: looks(twinsOf('fiche').plain) }), 'default');
      const lines = shown.marked.lines.split(' ').sort().join(' ');
      const ok = shown.marked.color === WHITE && shown.marked.bg === RED && lines === 'line-through underline' && shown.plain.color === 'rgb(70, 39, 122)' && shown.plain.bg === 'rgb(241, 235, 251)'
        && same(pale.marked, pale.plain) && pale.marked.lines === 'none';
      return { pass: ok, notes: JSON.stringify({ shown, pale }) };
    },
  });

  cases.push({
    id: 'badge_marks_the_choice_applies_at_once_to_the_same_elements',
    description: 'Changer le choix de Réglages se voit à l\'instant sur les bulles et les puces déjà là : les mêmes éléments passent de l\'aspect pâle à la mise en forme et reviennent, sans que l\'éditeur les redessine ni que le document change ; un atome sans réglage ne bouge pas',
    run: async (h) => withBadges(h, TWINS(Object.keys(ATOMS)), async () => {
      const names = Object.keys(ATOMS);
      const before = names.map(name => twinsOf(name).marked);
      const docBefore = ed().getHTML();
      const snapshot = () => names.map(name => ({ name, marked: looks(twinsOf(name).marked), plain: looks(twinsOf(name).plain), el: twinsOf(name).marked }));
      Settings.setBubbleMarks('marks');
      const shown = snapshot();
      Settings.setBubbleMarks('default');
      const pale = snapshot();
      Settings.setBubbleMarks('marks');
      const again = snapshot();
      const sameElements = [shown, pale, again].every(list => list.every((item, i) => item.el === before[i]));
      const plainUnmoved = shown.every((item, i) => same(item.plain, pale[i].plain));
      const shownOk = shown.every(item => item.marked.color === WHITE && item.marked.bg === RED);
      const paleOk = pale.every(item => same(item.marked, item.plain));
      const againOk = again.every((item, i) => same(item.marked, shown[i].marked));
      return { pass: sameElements && plainUnmoved && shownOk && paleOk && againOk && ed().getHTML() === docBefore, notes: JSON.stringify({ sameElements, plainUnmoved, shownOk, paleOk, againOk, docSame: ed().getHTML() === docBefore }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_choice_is_kept_per_person_and_only_two_values_exist',
    description: 'Le choix passe par PersonStore (clé pp_bubble_marks, « marks » ou « default »), pose ou retire l\'attribut data-bubble-marks de <html>, et toute autre valeur donne « Par défaut » ; une valeur gardée mais inconnue se relit « Par défaut »',
    run: async (h) => withBadges(h, '<p>' + BADGE() + '</p>', async () => {
      const root = document.documentElement;
      Settings.setBubbleMarks('marks');
      const a = { stored: PersonStore.get(SETTING_KEY), attr: root.getAttribute('data-bubble-marks'), read: Settings.getBubbleMarks() };
      Settings.setBubbleMarks('default');
      const b = { stored: PersonStore.get(SETTING_KEY), attr: root.getAttribute('data-bubble-marks'), read: Settings.getBubbleMarks() };
      Settings.setBubbleMarks('marks');
      Settings.setBubbleMarks('n\'importe quoi');
      const c = { stored: PersonStore.get(SETTING_KEY), attr: root.getAttribute('data-bubble-marks'), read: Settings.getBubbleMarks() };
      PersonStore.set(SETTING_KEY, 'xyz');
      const d = Settings.getBubbleMarks();
      PersonStore.set(SETTING_KEY, 'marks');
      const e = Settings.getBubbleMarks();
      const ok = a.stored === 'marks' && a.attr === 'marks' && a.read === 'marks'
        && b.stored === 'default' && b.attr === null && b.read === 'default'
        && c.stored === 'default' && c.attr === null && c.read === 'default'
        && d === 'default' && e === 'marks';
      return { pass: ok, notes: JSON.stringify({ a, b, c, d, e }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_settings_window_shows_the_choice_and_applies_it_on_a_click',
    description: 'Réglages > Thème porte le choix : deux cases radio (« Par défaut », « Mise en forme ») sous le thème, celle du choix en vigueur cochée à l\'ouverture ; cocher « Mise en forme » le met en vigueur à l\'instant (la bulle de la page se met en forme), cocher « Par défaut » la remet pâle',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', BADGE()) + '</p>', async () => {
      const modal = document.getElementById('settings-modal');
      const radios = () => Array.from(document.querySelectorAll('input[name="settings-bubble-marks"]'));
      const labels = () => radios().map(r => r.closest('label').textContent.trim());
      document.getElementById('v2-btn-settings').click();
      await sleep(80);
      document.querySelector('#settings-modal .settings-tab[data-settings-tab="theme"]').click();
      await sleep(60);
      try {
        const start = { values: radios().map(r => r.value), checked: radios().filter(r => r.checked).map(r => r.value), labels: labels(), shown: radios().every(r => r.getClientRects().length > 0) };
        radios().find(r => r.value === 'default').click();
        await sleep(60);
        const pale = looks(badgeEl());
        radios().find(r => r.value === 'marks').click();
        await sleep(60);
        const formatted = looks(badgeEl());
        const afterClick = radios().filter(r => r.checked).map(r => r.value);
        const sectionInTheme = !!document.querySelector('#settings-modal [data-settings-panel="theme"] #settings-bubble-marks-title');
        const ok = start.values.join() === 'default,marks' && start.checked.join() === 'marks' && start.shown && start.labels.join() === (I18n.getLang() === 'fr' ? 'Par défaut,Mise en forme' : 'Default,Formatting')
          && pale.color === INK && pale.bg === PALE && formatted.color === WHITE && formatted.bg === CLEAR && afterClick.join() === 'marks' && sectionInTheme;
        return { pass: ok, notes: JSON.stringify({ start, pale, formatted, afterClick, sectionInTheme }) };
      } finally {
        modal.style.display = 'none';
      }
    }),
  });

  cases.push({
    id: 'badge_marks_a_broken_calc_bubble_and_a_broken_record_keep_their_alert_colors',
    description: 'Sous « Mise en forme », une bulle « Calcul » cassée (rouge) ou sans lien (ambre) et une fiche dont la table a disparu (rouge) gardent leurs couleurs d\'alerte même avec une couleur et un surlignage choisis ; leur souligné se dessine (les classes sont posées à la main : seul le CSS est en jeu)',
    run: async (h) => withBadges(h, '<p><u>' + span('color: #ffffff; background-color: #1e3a8a', CALC()) + '</u></p><p>' + span('color: #ffffff', CALC()) + '</p><p><u>' + span('color: #ffffff; background-color: #1e3a8a', MENTION()) + '</u></p>', async () => {
      const [broken, unlinked] = Array.from(document.querySelectorAll('.tiptap .calc-badge'));
      const record = document.querySelector('.tiptap .mention-chip');
      broken.classList.add('calc-badge-broken');
      unlinked.classList.add('calc-badge-unlinked');
      record.classList.add('mention-chip-broken');
      await sleep(30);
      const a = looks(broken), b = looks(unlinked), c = looks(record);
      const ok = a.color === 'rgb(164, 35, 28)' && a.bg === 'rgb(251, 233, 233)' && a.lines === 'underline'
        && b.color === 'rgb(135, 54, 0)' && b.bg === 'rgb(255, 230, 199)'
        && c.color === 'rgb(164, 35, 28)' && c.bg === 'rgb(251, 233, 233)' && c.lines === 'underline';
      return { pass: ok, notes: JSON.stringify({ a, b, c }) };
    }),
  });

  cases.push({
    id: 'badge_marks_a_selected_colored_calc_bubble_and_record_show_a_ring_instead_of_their_selection_fill',
    description: 'Sélectionnées, une bulle « Calcul » et une fiche dont la couleur est choisie montrent le double anneau et gardent leur fond (le fond de sélection rendrait un texte clair illisible) ; sans réglage elles gardent le fond de leur sélection, sans anneau',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff', CALC()) + ' ' + CALC('2+2') + ' ' + span('color: #ffffff', MENTION()) + ' ' + MENTION() + '</p>', async () => {
      const pick = async (type, index) => { ed().commands.setNodeSelection(nodePosOf(type, index)); await sleep(80); };
      const calc = () => Array.from(document.querySelectorAll('.tiptap .calc-badge'));
      const rec = () => Array.from(document.querySelectorAll('.tiptap .mention-chip'));
      await pick('calcBadge', 0); const calcColored = looks(calc()[0]);
      await pick('calcBadge', 1); const calcPlain = looks(calc()[1]);
      await pick('mention', 0); const recColored = looks(rec()[0]);
      await pick('mention', 1); const recPlain = looks(rec()[1]);
      const ok = calcColored.ring && calcColored.bg === CLEAR && calcColored.color === WHITE && !calcPlain.ring && calcPlain.bg === 'rgb(185, 227, 203)'
        && recColored.ring && recColored.bg === CLEAR && recColored.color === WHITE && !recPlain.ring && recPlain.bg === 'rgb(220, 205, 243)';
      return { pass: ok, notes: JSON.stringify({ calcColored, calcPlain, recColored, recPlain }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_saved_html_and_the_copied_html_of_calc_chips_and_records_do_not_carry_the_view',
    description: 'La bulle « Calcul », les puces et la fiche gardent, dans getHTML() (l\'enregistrement, la Lecture, les exports) et dans le HTML copié, leur écriture d\'avant : leur classe, leur couleur en <span style> et leur <u>, sans `data-mark-` ni `--pp-mark` (la vue ne sert qu\'à l\'écran)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff; background-color: #1e3a8a', '<u>' + CALC() + CHIP('date') + MENTION() + '</u>') + '</p>', async () => {
      const saved = ed().getHTML();
      const view = ed().view;
      const copied = view.serializeForClipboard ? view.serializeForClipboard(view.state.doc.slice(0, view.state.doc.content.size)).dom.innerHTML : '';
      const clean = html => !/data-mark-|--pp-mark/.test(html) && /class="calc-badge"/.test(html) && /class="smart-chip"/.test(html) && /class="mention-chip"/.test(html) && /color: ?rgb\(255, 255, 255\)/.test(html) && /<u>/.test(html);
      return { pass: clean(saved) && clean(copied), notes: JSON.stringify({ saved: saved.slice(0, 400), copied: copied.slice(0, 400) }) };
    }),
  });

  cases.push({
    id: 'badge_marks_a_found_colored_bubble_keeps_the_find_highlight',
    description: 'Sous « Mise en forme », une bulle de variable ou de calcul colorée que « Rechercher » a trouvée montre le jaune de la recherche (et l\'orange de la correspondance courante) : le surlignage choisi ne le masque pas (css/find-replace.css passe après la mise en forme)',
    run: async (h) => withBadges(h, '<p>' + span('color: #ffffff; background-color: #1e3a8a', BADGE() + CALC()) + '</p>', async () => {
      const [v, c] = [badgeEl(), document.querySelector('.tiptap .calc-badge')];
      [v, c].forEach(el => el.classList.add('pp-find-match'));
      await sleep(30);
      const matched = [looks(v), looks(c)];
      [v, c].forEach(el => el.classList.add('pp-find-current'));
      await sleep(30);
      const current = [looks(v), looks(c)];
      const ok = matched.every(l => l.bg === 'rgb(255, 229, 143)') && current.every(l => l.bg === 'rgb(255, 179, 71)');
      return { pass: ok, notes: JSON.stringify({ matched, current }) };
    }),
  });

  cases.push({
    id: 'badge_marks_in_a_table_cell_the_head_and_tail_of_the_calc_bubble_read_in_the_chosen_color',
    description: 'Dans une case de tableau, la bulle « Calcul » est coupée en un début et une fin comme une bulle de variable : les deux morceaux prennent la couleur choisie et le trait se pose sur la bulle',
    run: async (h) => withBadges(h, '<table><tbody><tr><td style="background-color:#1e3a8a" data-background-color="#1e3a8a"><p>' + span('color: #ffffff', '<s>' + CALC('{Clients.Adresse_postale_complete_du_client}*2') + '</s>') + '</p></td></tr></tbody></table>', async () => {
      const el = document.querySelector('.tiptap .calc-badge');
      const head = el.querySelector('.calc-badge-head');
      const tail = el.querySelector('.calc-badge-tail');
      const l = looks(el);
      const headColor = head ? getComputedStyle(head).color : null;
      const tailColor = tail ? getComputedStyle(tail).color : null;
      return { pass: getComputedStyle(el).display === 'inline-flex' && !!head && headColor === WHITE && (!tail || tailColor === WHITE) && l.lines === 'line-through' && l.bg === CLEAR, notes: JSON.stringify({ display: getComputedStyle(el).display, headColor, tailColor, l }) };
    }),
  });

  cases.push({
    id: 'badge_marks_the_palette_commands_on_a_selected_chip_update_the_view_and_unset_restores_it',
    description: 'Une puce sélectionnée à laquelle la barre pose une couleur puis un surlignage se met à jour tout de suite (sa vue est refaite dès que ses marques changent) ; retirer la couleur et le surlignage lui rend son aspect d\'origine',
    run: async (h) => withBadges(h, '<p>Texte ' + CHIP('date') + ' fin</p>', async () => {
      const pick = async () => { ed().commands.setNodeSelection(nodePosOf('smartChip')); await sleep(80); };
      const el = () => document.querySelector('.tiptap .smart-chip');
      const plain = looks(el());
      await pick(); ed().chain().focus().setTextColor('#b91c1c').run(); await sleep(60);
      const withColor = looks(el());
      await pick(); ed().chain().focus().setHighlight('#fde68a').run(); await sleep(60);
      const withBoth = looks(el());
      await pick(); ed().chain().focus().unsetTextColor().run();
      await pick(); ed().chain().focus().unsetHighlight().run(); await sleep(60);
      const back = looks(el());
      const ok = withColor.color === RED && withColor.bg === CLEAR && withBoth.color === RED && withBoth.bg === 'rgb(253, 230, 138)' && same(back, plain) && viewAttrs(el()).length === 0;
      return { pass: ok, notes: JSON.stringify({ plain, withColor, withBoth, back, attrs: viewAttrs(el()) }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.badgeMarks = cases;
})();
