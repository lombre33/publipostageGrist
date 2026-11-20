// Suite "crossRefs" - les renvois (demande d'Antoine, 2026-11-20 : « cf [nomDuTitre] », le nom résolu en direct ET un lien vers la section, comme un renvoi croisé de Word). Un renvoi est un petit nœud
// en ligne (js/cross-refs.js) qui vise l'adresse d'un titre ou d'un signet (js/anchors.js) et écrit son texte, son numéro ou les deux ; il s'écrit dans le HTML comme un lien « Dans ce document ».
// Quatre moitiés :
//  1) le MODÈLE : la pose (le titre reçoit son adresse dans la même transaction), le texte tenu à jour (titre renommé, numérotation changée, titre déplacé), le titre supprimé (le renvoi
//     reste, cassé), le HTML relu, aucun lien posé sur un renvoi, aucun parcours du document tant qu'un titre n'a pas bougé ;
//  2) les FENÊTRES : la ligne « Renvoi… » du menu (grisée avec sa raison, jamais retirée), la fenêtre (la liste, les trois choix et leurs exemples, le numéro grisé quand il n'y en a pas) ;
//  3) la LECTURE : le texte relu dans le document résolu (un titre à variable y porte la valeur de la ligne), un renvoi sans titre redevient du texte ;
//  4) les EXPORTS lus sur la sortie réelle : PDF (destination nommée), Word (lien interne), HTML, Markdown, e-mail (texte seul).
// Le vrai geste (survol, clic, double clic, Ctrl+clic, 700x400, clair et sombre) est dans dev-tests/verify-cross-refs-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const xref = (id, text, mode) => '<a class="pp-xref" href="#' + id + '" data-xref="' + id + '" data-xref-mode="' + (mode || 'text') + '" contenteditable="false">' + text + '</a>';
  const en = () => I18n.getLang() === 'en';

  const rangeOf = text => {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(text);
      if (i >= 0) found = { from: pos + i, to: pos + i + text.length };
    });
    if (!found) throw new Error('texte introuvable dans l\'éditeur : ' + text);
    return found;
  };
  const caretIn = async text => { ed().chain().focus().setTextSelection(rangeOf(text).from + 1).run(); await sleep(100); };
  const caretAtEnd = async text => { ed().chain().focus().setTextSelection(rangeOf(text).to).run(); await sleep(100); };
  const setDoc = async html => { Editor.setHTML(html); await sleep(150); };
  const blocks = () => Array.from(parse(Editor.getHTML()).children);
  // Les renvois du document : { pos, attrs }, dans l'ordre.
  const refs = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'crossRef') out.push({ pos, attrs: node.attrs }); return !node.isLeaf; }); return out; };
  const labels = () => refs().map(r => r.attrs.label);
  const viewLabels = () => Array.from(ed().view.dom.querySelectorAll('a.pp-xref')).map(a => a.textContent);
  const headingPos = index => { let found = -1; let rank = 0; ed().state.doc.forEach((node, pos) => { if (node.type.name === 'heading') { if (rank === index) found = pos; rank += 1; } }); return found; };
  // Pose un renvoi vers le titre de rang `index` au curseur, comme la fenêtre le fait.
  function putRef(index, mode) {
    const heading = CrossRefs.choices(ed()).headings[index];
    const id = heading.id || Anchors.idFor(ed(), heading.pos);
    return CrossRefs.put(ed(), { id, mode: mode || 'text', claim: heading.id ? null : { pos: heading.pos, id } });
  }
  const windowOpen = id => { const m = byId(id); return !!m && m.style.display !== 'none'; };
  const buttons = id => Array.from(byId(id).querySelectorAll('.var-modal-actions button'));
  const okOf = id => buttons(id).find(b => b.classList.contains('var-modal-primary'));
  const cancelOf = id => buttons(id).find(b => !b.classList.contains('var-modal-primary') && !b.classList.contains('var-modal-danger'));
  async function closeWindows() {
    ['pp-xref-modal', 'pp-link-modal', 'pp-bookmark-modal'].forEach(id => { if (windowOpen(id)) cancelOf(id).click(); });
    await sleep(80);
  }
  const row = () => byId('v2-row-cross-ref');
  const syncRow = async () => { MainToolbar.syncToolbarState(); await sleep(60); };
  // Compte les relectures du document : la numérotation des titres est lue (HeadingNumbering.markersFor) à chaque parcours.
  async function countScans(run) {
    const orig = HeadingNumbering.markersFor;
    let calls = 0;
    HeadingNumbering.markersFor = function () { calls += 1; return orig.apply(this, arguments); };
    try { await run(); await sleep(80); } finally { HeadingNumbering.markersFor = orig; }
    return calls;
  }

  // === 1) Le modèle ===========================================================================================================================================================

  cases.push({
    id: 'xr_put_gives_the_heading_its_address_and_writes_a_link_shaped_node_in_one_undoable_step',
    description: 'Poser un renvoi vers un titre sans signet lui donne une adresse tirée de son texte (sans nom de signet : il n\'est pas un « Signet » de la liste) et écrit un renvoi qui porte le texte du titre ; le HTML est celui d\'un lien « Dans ce document » (`a.pp-xref`, `href="#adresse"`, `data-xref`, `data-xref-mode`) ; un Annuler défait le renvoi et l\'adresse ensemble',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1>Conditions générales</h1><p>Voir ci-dessus</p>');
      await caretAtEnd('Voir ci-dessus');
      const before = Editor.getHTML();
      const placed = putRef(0, 'text');
      await sleep(100);
      const blocksAfter = blocks();
      const heading = blocksAfter[0];
      const link = blocksAfter[1].querySelector('a.pp-xref');
      const got = {
        placed, anchor: heading.getAttribute('data-anchor'), name: heading.getAttribute('data-anchor-name'), href: link && link.getAttribute('href'), xref: link && link.getAttribute('data-xref'),
        mode: link && link.getAttribute('data-xref-mode'), text: link && link.textContent, stored: labels(), inView: viewLabels(),
        bookmarks: Anchors.targets(ed()).bookmarks.length,
      };
      ed().commands.undo();
      await sleep(100);
      const undone = Editor.getHTML();
      ed().commands.redo();
      await sleep(100);
      const redone = { refs: refs().length, anchor: blocks()[0].getAttribute('data-anchor') };
      const pass = placed === true && got.anchor === 'conditions-generales' && got.name === null && got.href === '#conditions-generales' && got.xref === 'conditions-generales' && got.mode === 'text'
        && got.text === 'Conditions générales' && JSON.stringify(got.stored) === JSON.stringify(['Conditions générales']) && JSON.stringify(got.inView) === JSON.stringify(['Conditions générales']) && got.bookmarks === 0
        && undone === before && redone.refs === 1 && redone.anchor === 'conditions-generales';
      return { pass, notes: JSON.stringify({ got, undoneEqualsBefore: undone === before, redone }) };
    },
  });

  cases.push({
    id: 'xr_the_text_follows_the_heading_as_it_is_typed_and_undo_takes_both_back',
    description: 'Le texte du renvoi suit le titre dans la transaction même qui le change (une lettre tapée, un titre réécrit) : l\'éditeur ne montre jamais un texte en retard ; un Annuler défait le titre et le renvoi ensemble',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Voir ' + xref('cgv', 'Conditions') + ' puis la suite</p>');
      const states = [];
      const snap = tag => states.push([tag, ed().state.doc.child(0).textContent, labels()[0], viewLabels()[0]]);
      snap('start');
      ed().chain().focus().setTextSelection(headingPos(0) + 1 + 'Conditions'.length).run();
      ed().commands.insertContent(' de vente');
      await sleep(80);
      snap('typed');
      const html = blocks();
      const inHtml = html[1].querySelector('a.pp-xref').textContent;
      ed().commands.undo();
      await sleep(80);
      snap('undone');
      ed().commands.redo();
      await sleep(80);
      snap('redone');
      const consistent = states.every(s => s[1] === s[2] && s[2] === s[3]);
      const pass = consistent && states[1][2] === 'Conditions de vente' && inHtml === 'Conditions de vente' && states[2][2] === 'Conditions' && states[3][2] === 'Conditions de vente';
      return { pass, notes: JSON.stringify({ states, inHtml }) };
    },
  });

  cases.push({
    id: 'xr_the_number_and_both_modes_follow_the_numbering_and_the_order_of_the_headings',
    description: 'Le mode « numéro » écrit le marqueur du titre tel que le sommaire l\'écrit (« 2) », « Article 2 »), le mode « les deux » le marqueur et le texte ; ils suivent le style de numérotation du document et l\'arrivée d\'un titre avant ; sans numérotation, le renvoi écrit le texte',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="un">Un</h1><h1 data-anchor="deux">Deux</h1><p>' + xref('deux', 'Deux', 'number') + ' / ' + xref('deux', 'Deux', 'both') + ' / ' + xref('deux', 'Deux', 'text') + '</p>');
      const read = () => labels();
      const plain = read();
      ed().chain().focus().setHeadingNumberingStyle('numeric').run();
      await sleep(100);
      const numeric = read();
      ed().chain().focus().setHeadingNumberingStyle('article').run();
      await sleep(100);
      const article = read();
      ed().chain().focus().insertContentAt(headingPos(0), '<h1>Zéro</h1>').run();
      await sleep(100);
      const added = read();
      const html = blocks().pop().textContent;
      const pass = JSON.stringify(plain) === JSON.stringify(['Deux', 'Deux', 'Deux'])
        && JSON.stringify(numeric) === JSON.stringify(['2)', '2) Deux', 'Deux'])
        && JSON.stringify(article) === JSON.stringify(['Article 2', 'Article 2 Deux', 'Deux'])
        && added[0] === 'Article 3' && added[1] === 'Article 3 Deux' && added[2] === 'Deux' && html.indexOf('Article 3') === 0;
      return { pass, notes: JSON.stringify({ plain, numeric, article, added, html }) };
    },
  });

  cases.push({
    id: 'xr_a_deleted_heading_leaves_the_cross_reference_broken_with_its_last_text',
    description: 'Le titre supprimé laisse le renvoi en place, avec son dernier texte, marqué cassé (classe rouge de l\'éditeur) ; un Annuler qui rend le titre le rend sain ; la copie de l\'adresse (un titre collé ailleurs) le rend sain aussi',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Voir ' + xref('cgv', 'Conditions') + '</p>');
      const state = () => ({ broken: refs()[0].attrs.broken, label: refs()[0].attrs.label, cls: ed().view.dom.querySelector('a.pp-xref').className });
      const healthy = state();
      const start = headingPos(0);
      ed().chain().focus().deleteRange({ from: start, to: start + ed().state.doc.child(0).nodeSize }).run();
      await sleep(100);
      const broken = state();
      ed().commands.undo();
      await sleep(100);
      const back = state();
      const pass = !healthy.broken && !/pp-xref-broken/.test(healthy.cls) && broken.broken === true && broken.label === 'Conditions' && /pp-xref-broken/.test(broken.cls) && !back.broken && !/pp-xref-broken/.test(back.cls);
      return { pass, notes: JSON.stringify({ healthy, broken, back }) };
    },
  });

  cases.push({
    id: 'xr_html_is_read_back_as_a_cross_reference_and_never_as_a_link',
    description: 'Le HTML enregistré, collé ou copié d\'un autre document se relit comme un renvoi (jamais comme un lien dont le texte est figé), avec son mode et son texte ; un `a.pp-xref` sans adresse lisible n\'est qu\'un lien ordinaire ; deux écritures de suite donnent le même HTML',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>' + xref('cgv', 'vieux texte', 'both') + ' et <a class="pp-xref" href="#x" data-xref="pas une adresse">sans adresse</a></p>');
      const first = Editor.getHTML();
      const found = refs().map(r => r.attrs.target + ':' + r.attrs.mode);
      const links = []; ed().state.doc.descendants(node => { node.marks.forEach(mark => { if (mark.type.name === 'link') links.push(mark.attrs.href); }); });
      await setDoc(first);
      const second = Editor.getHTML();
      const pass = JSON.stringify(found) === JSON.stringify(['cgv:both']) && JSON.stringify(links) === JSON.stringify(['#x']) && first === second && labels()[0] === 'Conditions';
      return { pass, notes: JSON.stringify({ found, links, same: first === second, label: labels()[0] }) };
    },
  });

  cases.push({
    id: 'xr_a_link_cannot_be_laid_over_a_cross_reference',
    description: 'Un lien posé sur une sélection qui contient un renvoi ne s\'y pose pas (deux `<a>` l\'un dans l\'autre seraient mal relus) : le texte autour devient un lien, le renvoi reste un renvoi',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Avant ' + xref('cgv', 'Conditions') + ' après</p>');
      const p = ed().state.doc.child(1);
      const start = headingPos(0) + ed().state.doc.child(0).nodeSize + 1;
      ed().chain().focus().setTextSelection({ from: start, to: start + p.content.size }).setLink({ href: 'https://exemple.fr' }).run();
      await sleep(100);
      const nested = parse(Editor.getHTML()).querySelectorAll('a a').length;
      const marked = []; ed().state.doc.descendants(node => { if (node.type.name === 'crossRef') marked.push(node.marks.map(m => m.type.name)); });
      const outer = parse(Editor.getHTML()).querySelectorAll('a[href="https://exemple.fr"]').length;
      const pass = nested === 0 && marked.length === 1 && marked[0].indexOf('link') === -1 && outer >= 1 && refs().length === 1;
      return { pass, notes: JSON.stringify({ nested, marked, outer }) };
    },
  });

  cases.push({
    id: 'xr_nothing_is_read_while_no_heading_moves',
    description: 'Sans renvoi, aucune frappe ne relit le document ; avec un renvoi, une lettre tapée dans un paragraphe non plus ; une lettre tapée dans un titre, oui (le texte du renvoi doit suivre)',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Un paragraphe</p>');
      await caretAtEnd('Un paragraphe');
      const noRef = await countScans(async () => { ed().commands.insertContent('x'); });
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Un paragraphe ' + xref('cgv', 'Conditions') + '</p>');
      await caretAtEnd('Un paragraphe');
      const inParagraph = await countScans(async () => { ed().commands.insertContent('x'); });
      const bold = await countScans(async () => { ed().chain().focus().setTextSelection(rangeOf('Un paragraphe')).toggleBold().run(); });
      ed().chain().focus().setTextSelection(headingPos(0) + 1 + 'Conditions'.length).run();
      const inHeading = await countScans(async () => { ed().commands.insertContent('s'); });
      const pass = noRef === 0 && inParagraph === 0 && bold === 0 && inHeading >= 1 && labels()[0] === 'Conditionss';
      return { pass, notes: JSON.stringify({ noRef, inParagraph, bold, inHeading, label: labels()[0] }) };
    },
  });

  cases.push({
    id: 'xr_a_bookmark_on_a_paragraph_is_cited_by_its_name',
    description: 'Un renvoi vers un signet posé sur un paragraphe écrit le nom du signet, et suit son renommage (l\'adresse reste, les renvois la gardent) ; un signet posé sur un titre écrit le texte du titre',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p data-anchor="fin" data-anchor-name="Fin du contrat">Dernier paragraphe</p><h2 data-anchor="art" data-anchor-name="Article clé">Un titre</h2><p>' + xref('fin', 'x') + ' ' + xref('art', 'y') + '</p>');
      const first = labels();
      Anchors.save(ed(), 0, 'Clôture');
      await sleep(100);
      const renamed = labels();
      const pass = JSON.stringify(first) === JSON.stringify(['Fin du contrat', 'Un titre']) && renamed[0] === 'Clôture' && renamed[1] === 'Un titre' && refs()[0].attrs.target === 'cloture' && refs().every(r => !r.attrs.broken)
        && Anchors.linkCount(ed(), 'cloture') === 1 && Anchors.linkCount(ed(), 'art') === 1;
      return { pass, notes: JSON.stringify({ first, renamed, targets: refs().map(r => r.attrs.target), broken: refs().map(r => r.attrs.broken) }) };
    },
  });

  // === 2) Les fenêtres ========================================================================================================================================================

  const rowCase = {
    id: 'xr_menu_row_follows_the_selection_and_is_greyed_not_removed',
    description: 'La ligne « Renvoi… » est la troisième du menu chaîne, avec son icône ; elle se lit « Modifier le renvoi… » et s\'allume quand un renvoi est sélectionné ; elle est grisée (aria-disabled, classe des lignes grisées, raison en info-bulle) dans un bloc de code et sur plusieurs blocs, jamais retirée ; elle ne l\'est pas dans un tableau ni une liste',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="cgv">Conditions</h1><p>Un paragraphe</p><p>Un autre</p><pre><code>du code</code></pre><table><tbody><tr><td><p>Case</p></td></tr></tbody></table><ul><li><p>Puce ' + xref('cgv', 'Conditions') + '</p></li></ul>');
      const flyoutRows = Array.from(byId('v2-blocks-flyout').querySelectorAll('.v2-menu-row')).map(r => r.id);
      const state = () => ({ label: row().textContent.trim(), disabled: row().getAttribute('aria-disabled'), grey: row().classList.contains('v2-hover-row-disabled'), active: row().classList.contains('is-active'), title: row().title, tab: row().tabIndex, aria: row().getAttribute('aria-label') });
      await caretIn('Un paragraphe');
      await syncRow();
      const plain = state();
      const overBlocks = { from: rangeOf('Un paragraphe').from + 1, to: rangeOf('Un autre').to - 1 };
      ed().chain().focus().setTextSelection(overBlocks).run();
      await syncRow();
      const across = state();
      await caretIn('du code');
      await syncRow();
      const inCode = state();
      await caretIn('Case');
      await syncRow();
      const inTable = state();
      await caretIn('Puce');
      await syncRow();
      const inList = state();
      const at = refs()[0].pos;
      ed().chain().focus().setNodeSelection(at).run();
      await syncRow();
      const chosen = state();
      const icon = !!row().querySelector('.v2-menu-row-icon svg');
      const want = en()
        ? { row: 'Cross-reference…', edit: 'Edit cross-reference…', aria: 'Insert a cross-reference that follows a heading or bookmark', ariaEdit: 'Edit the selected cross-reference' }
        : { row: 'Renvoi…', edit: 'Modifier le renvoi…', aria: 'Insérer un renvoi qui suit un titre ou un signet', ariaEdit: 'Modifier le renvoi sélectionné' };
      const reason = I18n.t('crossRef.notHere');
      const pass = flyoutRows[0] === 'v2-row-link' && flyoutRows[1] === 'v2-row-bookmark' && flyoutRows[2] === 'v2-row-cross-ref' && icon
        && plain.label === want.row && plain.disabled === 'false' && !plain.grey && !plain.active && plain.title === '' && plain.tab === 0 && plain.aria === want.aria
        && [across, inCode].every(s => s.disabled === 'true' && s.grey && s.title === reason && s.tab === -1 && !s.active) && reason.length > 20
        && [inTable, inList].every(s => s.disabled === 'false' && !s.grey)
        && chosen.label === want.edit && chosen.active && chosen.disabled === 'false' && chosen.aria === want.ariaEdit;
      return { pass, notes: JSON.stringify({ flyoutRows, plain, across, inCode, inTable, inList, chosen, icon, reason }) };
    },
  };
  cases.push(rowCase);
  cases.push(Object.assign({}, rowCase, {
    id: 'xr_menu_row_follows_the_selection_and_is_greyed_not_removed_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne « Cross-reference… » du menu se lit « Edit cross-reference… » sur un renvoi et se grise dans un bloc de code avec sa raison en anglais',
  }));

  cases.push({
    id: 'xr_menu_row_is_greyed_in_a_header_or_footer_and_in_an_email_template',
    description: 'Dans un en-tête ou un pied de page et dans un modèle d\'e-mail (du texte brut), la ligne « Renvoi… » est grisée avec sa raison, et la fenêtre ne s\'ouvre pas',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1>Conditions</h1><p>Un paragraphe</p>');
      await caretIn('Un paragraphe');
      const orig = HeaderFooterPreview.getHfMode;
      let inHf;
      try {
        HeaderFooterPreview.getHfMode = () => 'header';
        await syncRow();
        inHf = { disabled: row().getAttribute('aria-disabled'), grey: row().classList.contains('v2-hover-row-disabled'), opens: CrossRefDialog.open(), reason: row().title };
      } finally { HeaderFooterPreview.getHfMode = orig; }
      await closeWindows();
      MainToolbar.setEmailMode(true);
      await syncRow();
      const inEmail = { disabled: row().getAttribute('aria-disabled'), reason: row().title, opens: CrossRefDialog.open() };
      MainToolbar.setEmailMode(false);
      await closeWindows();
      await syncRow();
      const back = row().getAttribute('aria-disabled');
      const pass = inHf.disabled === 'true' && inHf.grey && inHf.opens === false && inHf.reason === I18n.t('crossRef.notHere') && !windowOpen('pp-xref-modal')
        && inEmail.disabled === 'true' && inEmail.reason === I18n.t('crossRef.email') && inEmail.opens === false && back === 'false';
      return { pass, notes: JSON.stringify({ inHf, inEmail, back }) };
    },
  });

  const dialogCase = {
    id: 'xr_window_lists_the_headings_shows_each_choice_with_its_example_and_inserts',
    description: 'La fenêtre liste les titres (numérotés comme le sommaire) puis les signets ; les trois choix montrent chacun ce qu\'ils écriraient avec le titre choisi ; le numéro est grisé (raison en info-bulle) quand les titres ne sont pas numérotés ou que le signet n\'est pas un titre ; valider pose le renvoi au curseur (le titre reçoit son adresse) ; ouvrir sans titre choisi puis valider est refusé avec sa raison',
    run: async (h) => {
      const T = en()
        ? { newTitle: 'Insert a cross-reference', editTitle: 'Edit the cross-reference', show: 'The cross-reference shows', text: 'The heading text', bookmarkText: 'The bookmark name', number: 'The heading number', both: 'The number and the text', noNumbering: 'The headings of this document are not numbered.', notHeading: 'Only a heading has a number.', noTarget: 'Choose the heading or bookmark to refer to.', insert: 'Insert', confirm: 'Confirm', cancel: 'Cancel', headings: 'Headings', bookmarks: 'Bookmarks' }
        : { newTitle: 'Insérer un renvoi', editTitle: 'Modifier le renvoi', show: 'Le renvoi écrit', text: 'Le texte du titre', bookmarkText: 'Le nom du signet', number: 'Le numéro du titre', both: 'Le numéro et le texte', noNumbering: 'Les titres de ce document ne sont pas numérotés.', notHeading: 'Seul un titre a un numéro.', noTarget: 'Choisissez le titre ou le signet visé.', insert: 'Insérer', confirm: 'Valider', cancel: 'Annuler', headings: 'Titres', bookmarks: 'Signets' };
      await h.resetEditor();
      await setDoc('<h1>Conditions générales</h1><h2>Prix</h2><p data-anchor="fin" data-anchor-name="Fin du contrat">Dernier paragraphe</p><p>cf </p>');
      const modal = () => byId('pp-xref-modal');
      const target = () => byId('pp-xref-target');
      const read = () => {
        const boxes = Array.from(modal().querySelectorAll('.pp-xref-mode')).map(l => ({ name: l.querySelector('.pp-xref-mode-name').textContent, example: l.querySelector('.pp-xref-mode-example').textContent, disabled: l.querySelector('input').disabled, checked: l.querySelector('input').checked, title: l.title }));
        return { title: byId('pp-xref-title').textContent, legend: modal().querySelector('legend').textContent, boxes, value: target().value, error: byId('pp-xref-error').hidden ? '' : byId('pp-xref-error').textContent, ok: okOf('pp-xref-modal').textContent, cancel: cancelOf('pp-xref-modal').textContent };
      };
      const groups = () => Array.from(target().querySelectorAll('optgroup')).map(g => [g.label, Array.from(g.querySelectorAll('option')).map(o => [o.value, o.textContent])]);
      const pick = value => { target().value = value; target().dispatchEvent(new Event('change', { bubbles: true })); };
      await caretAtEnd('cf');
      await syncRow();
      row().click();
      await sleep(120);
      const opened = { open: windowOpen('pp-xref-modal'), ...read(), groups: groups() };
      // Sans titre choisi : refusé.
      okOf('pp-xref-modal').click();
      await sleep(60);
      const refused = { ...read(), open: windowOpen('pp-xref-modal') };
      pick('h:0');
      await sleep(40);
      const plainTitle = read();
      pick('a:fin');
      await sleep(40);
      const bookmark = read();
      pick('h:0');
      ed().chain().focus().setHeadingNumberingStyle('numeric').run();
      await sleep(60);
      await closeWindows();
      await caretAtEnd('cf');
      await syncRow();
      row().click();
      await sleep(120);
      const numbered = { groups: groups() };
      pick('h:1');
      await sleep(40);
      const second = read();
      Array.from(modal().querySelectorAll('.pp-xref-mode input')).find(i => i.value === 'both').click();
      okOf('pp-xref-modal').click();
      await sleep(120);
      const done = { open: windowOpen('pp-xref-modal'), refs: refs().map(r => [r.attrs.target, r.attrs.mode, r.attrs.label]), anchor: (blocks().find(b => b.textContent === 'Prix') || { getAttribute: () => 'absent' }).getAttribute('data-anchor') };
      const pass = opened.open && opened.title === T.newTitle && opened.legend === T.show && opened.value === '' && opened.ok === T.insert && opened.cancel === T.cancel
        && JSON.stringify(opened.groups.map(g => g[0])) === JSON.stringify([T.headings, T.bookmarks]) && opened.groups[0][1].length === 2 && opened.groups[1][1].length === 1 && opened.groups[1][1][0][0] === 'a:fin'
        && refused.open && refused.error === T.noTarget
        && plainTitle.boxes[0].name === T.text && plainTitle.boxes[0].example === '« Conditions générales »' && plainTitle.boxes[0].checked && !plainTitle.boxes[0].disabled
        && plainTitle.boxes[1].name === T.number && plainTitle.boxes[1].disabled && plainTitle.boxes[1].title === T.noNumbering && plainTitle.boxes[2].disabled
        && bookmark.boxes[0].name === T.bookmarkText && bookmark.boxes[0].example === '« Fin du contrat »' && bookmark.boxes[1].disabled && bookmark.boxes[1].title === T.notHeading
        && numbered.groups[0][1][0][1] === '1) Conditions générales' && numbered.groups[0][1][1][1] === 'a) Prix'
        && second.boxes[1].example === '« a) »' && !second.boxes[1].disabled && second.boxes[2].example === '« a) Prix »'
        && !done.open && JSON.stringify(done.refs) === JSON.stringify([['prix', 'both', 'a) Prix']]) && done.anchor === 'prix';
      return { pass, notes: JSON.stringify({ opened, refused, plainTitle, bookmark, numbered, second, done }) };
    },
  };
  cases.push(dialogCase);
  cases.push(Object.assign({}, dialogCase, {
    id: 'xr_window_lists_the_headings_shows_each_choice_with_its_example_and_inserts_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la fenêtre « Insert a cross-reference », ses trois choix, leurs raisons et son erreur sont en anglais',
  }));

  cases.push({
    id: 'xr_window_edits_the_selected_cross_reference',
    description: 'Un renvoi sélectionné rouvre la fenêtre sur lui (son titre et son choix déjà posés) ; valider un autre titre ou un autre choix change CE renvoi sans en poser un second ; un double clic sur le renvoi l\'ouvre aussi',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<h1 data-anchor="un">Un</h1><h1 data-anchor="deux">Deux</h1><p>cf ' + xref('un', 'Un') + '</p>');
      ed().chain().focus().setHeadingNumberingStyle('numeric').run();
      await sleep(80);
      ed().chain().focus().setNodeSelection(refs()[0].pos).run();
      await syncRow();
      row().click();
      await sleep(120);
      const target = byId('pp-xref-target');
      const opened = { open: windowOpen('pp-xref-modal'), value: target.value, mode: Array.from(byId('pp-xref-modal').querySelectorAll('.pp-xref-mode input')).find(i => i.checked).value, title: byId('pp-xref-title').textContent };
      target.value = 'h:1';
      target.dispatchEvent(new Event('change', { bubbles: true }));
      Array.from(byId('pp-xref-modal').querySelectorAll('.pp-xref-mode input')).find(i => i.value === 'number').click();
      okOf('pp-xref-modal').click();
      await sleep(120);
      const changed = refs().map(r => [r.attrs.target, r.attrs.mode, r.attrs.label]);
      ed().chain().focus().setTextSelection(1).run();
      await sleep(60);
      const dom = ed().view.dom.querySelector('a.pp-xref');
      dom.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      await sleep(120);
      const dbl = { open: windowOpen('pp-xref-modal'), value: byId('pp-xref-target').value };
      await closeWindows();
      const pass = opened.open && opened.value === 'h:0' && opened.mode === 'text' && opened.title === I18n.t('crossRef.title.edit')
        && JSON.stringify(changed) === JSON.stringify([['deux', 'number', '2)']]) && dbl.open && dbl.value === 'h:1';
      return { pass, notes: JSON.stringify({ opened, changed, dbl }) };
    },
  });

  // === 3) La Lecture ==========================================================================================================================================================

  cases.push({
    id: 'xr_reader_writes_the_text_of_the_resolved_heading_and_leaves_plain_text_without_one',
    description: 'La Lecture relit le texte du renvoi dans le document RÉSOLU (un titre qui portait une variable y a la valeur de la ligne : le texte gardé dans le modèle est écarté) ; le numéro suit celui du sommaire ; un renvoi sans titre n\'est plus qu\'un texte, sans lien ; un clic mène au titre',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="heading-numbering-config" contenteditable="false" data-style="numeric"></div><h1 data-anchor="a">Contrat de Dupont</h1><h1 data-anchor="b">Annexe</h1>'
        + '<p>' + xref('a', 'Contrat de #Nom') + ' | ' + xref('b', 'x', 'number') + ' | ' + xref('b', 'x', 'both') + ' | ' + xref('absent', 'Ancien titre') + '</p>';
      const reader = await h.renderReaderMode(html, null);
      const p = Array.from(reader.querySelectorAll('p')).find(node => /Contrat de Dupont/.test(node.textContent));
      const links = Array.from(p.querySelectorAll('a')).map(a => [a.getAttribute('href'), a.textContent]);
      const revealed = [];
      const orig = TocLinks.reveal;
      TocLinks.reveal = el => { revealed.push(el.textContent); };
      try { p.querySelector('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } finally { TocLinks.reveal = orig; }
      const pass = !!p && JSON.stringify(links) === JSON.stringify([['#a', 'Contrat de Dupont'], ['#b', '2)'], ['#b', '2) Annexe']]) && p.textContent.replace(/\s+/g, ' ') === 'Contrat de Dupont | 2) | 2) Annexe | Ancien titre'
        && JSON.stringify(revealed) === JSON.stringify(['Contrat de Dupont']);
      return { pass, notes: JSON.stringify({ links, text: p && p.textContent, revealed }) };
    },
  });

  cases.push({
    id: 'xr_resolve_in_reads_any_resolved_tree_and_is_idempotent',
    description: 'La relecture d\'un arbre résolu (Lecture, impression, exports) écrit le texte de chaque renvoi d\'après son titre, y compris dans un tableau et une liste, et rend le même arbre quand on la rejoue',
    run: async (h) => {
      await h.resetEditor();
      const root = parse('<h1 data-anchor="a">Un titre</h1><table><tbody><tr><td><p>' + xref('a', 'vieux') + '</p></td></tr></tbody></table><ul><li><p>' + xref('a', 'vieux') + '</p></li></ul><p data-anchor="n" data-anchor-name="Mon signet">Un paragraphe</p><p>' + xref('n', 'vieux') + '</p>');
      CrossRefs.resolveIn(root);
      const first = root.innerHTML;
      CrossRefs.resolveIn(root);
      const texts = Array.from(root.querySelectorAll('a.pp-xref')).map(a => a.textContent);
      const pass = JSON.stringify(texts) === JSON.stringify(['Un titre', 'Un titre', 'Mon signet']) && first === root.innerHTML;
      return { pass, notes: JSON.stringify({ texts, same: first === root.innerHTML }) };
    },
  });

  // === 4) Les exports =========================================================================================================================================================

  const allLinks = links => links.pages.flatMap((p, i) => p.links.map(l => Object.assign({ on: i + 1 }, l)));
  const DOC = '<h1 data-anchor="cgv" data-anchor-name="Conditions">Conditions générales</h1><p>Texte.</p>';
  const SRC = '<p>Voir ' + xref('cgv', 'Conditions générales') + ' et ' + xref('absent', 'rien') + '.</p>' + BREAK + DOC;

  cases.push({
    id: 'xr_pdf_cross_reference_leads_to_the_heading_and_a_missing_one_is_plain_text',
    description: 'PDF (lu par pdf.js) : le texte du renvoi mène à la destination nommée de son titre, sur la page où le titre est peint ; un renvoi dont le titre n\'existe pas est du texte, sans annotation',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent(SRC, null);
      const links = await h.extractPdfLinks(result.base64);
      const all = allLinks(links);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const first = truth.pages[0].textItems.map(it => it.str).join(' ');
      const pass = links.pages.length === 2 && JSON.stringify(links.destinations) === JSON.stringify(['pp-a-cgv']) && all.length >= 1 && all.every(l => l.name === 'pp-a-cgv' && l.on === 1 && l.page === 2) && /Conditions/.test(first) && /rien/.test(first) && !JSON.stringify(result.content).includes('pp-a-absent');
      return { pass, notes: JSON.stringify({ destinations: links.destinations, links: all.length, first }) };
    },
  });

  cases.push({
    id: 'xr_docx_cross_reference_is_an_internal_hyperlink_to_the_heading_bookmark',
    description: 'Word (OOXML dézippé) : le renvoi est un lien interne (`w:hyperlink w:anchor`) vers le signet du titre, de la couleur d\'un lien, avec le texte du titre ; un renvoi sans titre n\'est que du texte',
    run: async (h) => {
      await h.resetEditor();
      const parts = await h.exportDocxParts(SRC, null);
      const doc = parts.doc;
      const all = tag => Array.from(doc.getElementsByTagNameNS('*', tag));
      const starts = all('bookmarkStart').map(b => b.getAttribute('w:name')).filter(n => !/^_Toc/.test(n));
      const links = all('hyperlink').filter(l => l.getAttribute('w:anchor')).map(l => [l.getAttribute('w:anchor'), l.textContent]);
      const pass = starts.length === 1 && links.length === 1 && links[0][0] === starts[0] && links[0][1] === 'Conditions générales' && !/rien.*hyperlink/.test(doc.documentElement.textContent);
      return { pass, notes: JSON.stringify({ starts, links }) };
    },
  });

  cases.push({
    id: 'xr_html_and_markdown_write_the_cross_reference_as_an_internal_link',
    description: 'HTML : un `#adresse` qui reste dans la page, sans target ni rel, avec le texte du titre ; Markdown : `[texte](#adresse)` ; un renvoi sans titre n\'est que du texte dans les deux',
    run: async (h) => {
      await h.resetEditor();
      const full = parse((await h.exportHtml(SRC, null, {}, null, '')).text);
      const links = Array.from(full.querySelectorAll('.pp-doc a[href^="#"]')).filter(a => !a.closest('.pp-toc, nav'));
      const md = (await h.exportMarkdown(SRC, null, {}, null, '')).text;
      const pass = links.length === 1 && links[0].getAttribute('href') === '#cgv' && links[0].textContent === 'Conditions générales' && !links[0].hasAttribute('target') && !links[0].hasAttribute('rel')
        && md.split('\n')[0] === 'Voir [Conditions générales](#cgv) et rien.' && !md.includes('pp-xref') && !md.includes('data-xref');
      return { pass, notes: JSON.stringify({ hrefs: links.map(a => a.getAttribute('href')), first: md.split('\n')[0] }) };
    },
  });

  cases.push({
    id: 'xr_email_text_keeps_only_the_text_of_the_cross_reference',
    description: 'E-mail (texte brut) : un renvoi n\'écrit que son texte (ni « (#adresse) », ni lien)',
    run: async (h) => {
      await h.resetEditor();
      const text = MailtoExport.plainTextFromHtml('<p>Voir ' + xref('cgv', 'Conditions générales') + ' ci-dessous.</p>' + DOC);
      const flat = text.replace(/\s+/g, ' ').trim();
      const pass = flat.indexOf('Voir Conditions générales ci-dessous.') === 0 && flat.indexOf('#cgv') === -1;
      return { pass, notes: JSON.stringify(text) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.crossRefs = cases;
})();
