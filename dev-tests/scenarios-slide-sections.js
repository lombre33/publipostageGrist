// Suite "slideSections" - les SECTIONS d'une présentation (js/slide-props.js : `section`, sectionNamesOf, sectionsOf, sectionsFrom, sectionNamesAfter, applySection, writeSections ; demande du 06/11 : « la vue
// d'ensemble des diapositives et les sections ») :
//  - la DONNÉE : le nom d'une section est une ligne de 80 caractères au plus (blancs réduits, caractères de contrôle ôtés, jamais une paire de substitution coupée) ; il vit dans le repère de la diapositive qui OUVRE
//    la section, avec les autres réglages (transition, fond, notes) qu'il ne touche pas ; un repère qui n'a qu'un nom de section n'est pas vide ; il s'écrit et se relit (`data-section`) ;
//  - la LECTURE : une présentation sans aucun nom n'a pas de sections ; les diapositives d'avant la première forment la section du début, sans nom ; une section dure jusqu'à celle qui en ouvre une autre ;
//  - les GESTES (sectionNamesAfter, la règle pure) : monter ou descendre, glisser, dupliquer et supprimer gardent les sections justes - la première diapositive d'une section qui en sort laisse son nom à la suivante,
//    une diapositive déplacée rejoint la section où elle se pose (celle d'avant, ou celle d'après quand elle est déposée sous un titre), les copies restent dans la section de l'original, une section sans diapositive
//    disparaît avec son nom, rien ne change quand aucune section n'existe ;
//  - le TEXTE : applySection ouvre, renomme ou ferme une section en un seul Ctrl+Z sans toucher au reste du repère ; writeSections range d'un coup les noms d'un geste dans sa transaction ; la Lecture, le PDF et le
//    Word ne voient pas les sections (forOutput).
// Les gestes de la bande et la vue d'ensemble, à la vraie souris et au vrai clavier : dev-tests/verify-slides-overview.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => EditorCore.getEditor();
  const add = (id, description, run) => cases.push({ id, description, run });
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const NAMES = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six'];
  // Un repère qui n'a que le nom d'une section, tel que l'éditeur l'écrit.
  const marker = (name, extra) => (name || extra ? SlideProps.html(Object.assign({ section: name }, extra || {})) : '');
  // Six diapositives ; `sections` : { rang: nom } pour celles qui ouvrent une section.
  const deck = sections => NAMES.map((name, i) => marker(sections[i] || '') + '<p>' + name + '</p>').join(BR);
  async function load(markup) {
    Editor.setHTML(markup);
    await sleep(150);
  }
  const names = () => SlideProps.sectionNamesOf(editor().state.doc);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const text = () => SlideProps.slidesOf(editor().state.doc).length;
  // Les noms d'après un geste, d'après les noms d'avant ('' : aucun).
  const after = (before, order, joiners, side) => SlideProps.sectionNamesAfter(before, order, joiners ? new Set(joiners) : null, side);

  add('data', 'le nom d\'une section est borné et s\'écrit avec le repère, sans toucher aux autres réglages', async () => {
    const bad = [];
    const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 160))); };
    const n = raw => SlideProps.normalized({ section: raw }).section;
    check('un nom ordinaire est gardé', n('Offre') === 'Offre', n('Offre'));
    check('les blancs sont réduits et rognés', n('  Notre \n  offre\t ') === 'Notre offre', n('  Notre \n  offre\t '));
    check('les caractères de contrôle sont ôtés', n('Of\u0001fre\u0007') === 'Offre', n('Of\u0001fre\u0007'));
    check('au plus 80 caractères', n('x'.repeat(200)).length === SlideProps.SECTION_MAX && SlideProps.SECTION_MAX === 80, n('x'.repeat(200)).length);
    const emoji = '😀';
    const cut = n('a'.repeat(79) + emoji + 'b');
    check('une paire de substitution n\'est jamais coupée', !/[\uD800-\uDBFF]$/.test(cut) && cut.length <= 80, cut.length);
    check('ce qui n\'est pas un texte ne donne aucune section', n(42) === '' && n(null) === '' && n(undefined) === '' && n({}) === '' && n('   ') === '');
    check('le défaut est sans section', SlideProps.DEFAULTS.section === '' && SlideProps.normalized(null).section === '');
    check('un repère qui n\'a qu\'un nom de section n\'est pas vide', !SlideProps.isBlank(SlideProps.normalized({ section: 'Offre' })) && SlideProps.isBlank(SlideProps.normalized({ section: '' })));
    const html = SlideProps.html({ section: 'Offre', notes: 'Dire bonjour', bg: '#ffeecc' });
    check('l\'attribut s\'écrit', /data-section="Offre"/.test(html), html);
    const back = SlideProps.attrsOf(Dom.inertTemplate(html).content.firstElementChild);
    check('et se relit avec le fond et les notes', back.section === 'Offre' && back.notes === 'Dire bonjour' && back.bg === '#ffeecc', back);
    check('un nom vide n\'écrit pas l\'attribut', !/data-section/.test(SlideProps.html({ notes: 'seules' })));
    check('une diapositive sans rien n\'a pas de repère', SlideProps.html({ section: '' }) === '');
    const quote = SlideProps.html({ section: 'L\'"offre" <b>' });
    check('un nom avec des guillemets et des chevrons s\'écrit et se relit tel quel', SlideProps.attrsOf(Dom.inertTemplate(quote).content.firstElementChild).section === 'L\'"offre" <b>', quote);
    return result(bad);
  });

  add('read', 'les sections se lisent : aucune sans nom, la section du début sans nom, une section dure jusqu\'à la suivante', async (h) => {
    try {
      const bad = [];
      const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 220))); };
      check('une liste sans nom n\'a pas de sections', same(SlideProps.sectionsFrom(['', '', '']), []) && same(SlideProps.sectionsFrom([]), []));
      check('une section dès la première diapositive', same(SlideProps.sectionsFrom(['A', '', 'B', '', '']), [{ name: 'A', from: 0, to: 1 }, { name: 'B', from: 2, to: 4 }]), SlideProps.sectionsFrom(['A', '', 'B', '', '']));
      check('les diapositives d\'avant la première forment la section du début', same(SlideProps.sectionsFrom(['', '', 'B', '']), [{ name: '', from: 0, to: 1, lead: true }, { name: 'B', from: 2, to: 3 }]), SlideProps.sectionsFrom(['', '', 'B', '']));
      check('deux sections qui se suivent', same(SlideProps.sectionsFrom(['A', 'B']), [{ name: 'A', from: 0, to: 0 }, { name: 'B', from: 1, to: 1 }]));
      await load(deck({ 1: 'Offre', 4: 'Conclusion' }));
      check('le texte relu donne les noms de chaque diapositive', same(names(), ['', 'Offre', '', '', 'Conclusion', '']), names());
      check('et ses sections', same(SlideProps.sectionsOf(editor().state.doc), [{ name: '', from: 0, to: 0, lead: true }, { name: 'Offre', from: 1, to: 3 }, { name: 'Conclusion', from: 4, to: 5 }]), SlideProps.sectionsOf(editor().state.doc));
      await load(deck({}));
      check('un texte sans nom n\'a pas de sections', same(SlideProps.sectionsOf(editor().state.doc), []) && names().every(name => name === ''));
      return result(bad);
    } finally { await h.resetEditor(); }
  });

  add('rule', 'la règle des gestes : les sections suivent leurs diapositives', async () => {
    const bad = [];
    const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 200))); };
    const eq = (label, got, want) => check(label, same(got, want), { got, want });
    // Six diapositives en deux sections : A = 0-2, B = 3-5.
    const AB = ['A', '', '', 'B', '', ''];
    eq('rien ne bouge : les mêmes noms', after(AB, [0, 1, 2, 3, 4, 5]), AB);
    eq('aucune section : rien n\'est inventé', after(['', '', ''], [2, 0, 1], [0]), ['', '', '']);
    eq('descendre la première de A à l\'intérieur de A : son nom reste à la tête de la section', after(AB, [1, 0, 2, 3, 4, 5], [1]), ['A', '', '', 'B', '', '']);
    // Monter la première de B (3) d\'une place : elle passe sous A, B commence à la suivante.
    eq('monter la première de B : elle rejoint A, le nom de B passe à la suivante', after(AB, [0, 1, 3, 2, 4, 5], [2]), ['A', '', '', '', 'B', '']);
    // Monter 2 (dernière de A) d\'une place : un swap avec 1, restent dans A.
    eq('descendre la dernière de A sous la première de B : elle rejoint B', after(AB, [0, 1, 3, 2, 4, 5], [3]), ['A', '', 'B', '', '', '']);
    // Glisser la quatrième (3, première de B) en tête.
    eq('glisser la première de B en tête : elle rejoint A (la section du début), B commence à la suivante', after(AB, [3, 0, 1, 2, 4, 5], [0]), ['A', '', '', '', 'B', '']);
    // Glisser 1 (milieu de A) en queue.
    eq('glisser une diapositive de A en queue : elle rejoint B', after(AB, [0, 2, 3, 4, 5, 1], [5]), ['A', '', 'B', '', '', '']);
    // Déposée juste sous le titre de B (side next) : elle ouvre B.
    eq('déposée sous le titre de B : elle ouvre B', after(AB, [0, 2, 1, 3, 4, 5], [2], 'next'), ['A', '', 'B', '', '', '']);
    eq('déposée avant le titre de B (côté précédent) : elle ferme A', after(AB, [0, 2, 1, 3, 4, 5], [2], 'prev'), ['A', '', '', 'B', '', '']);
    // Supprimer.
    eq('supprimer la première de B : son nom passe à la suivante', after(AB, [0, 1, 2, 4, 5]), ['A', '', '', 'B', '']);
    eq('supprimer la première de A : son nom passe à la suivante', after(AB, [1, 2, 3, 4, 5]), ['A', '', 'B', '', '']);
    eq('supprimer toute une section : son nom disparaît', after(AB, [0, 1, 2]), ['A', '', '']);
    eq('supprimer la section du début : la suivante ouvre le texte', after(['', '', 'B', ''], [2, 3]), ['B', '']);
    eq('supprimer la seule diapositive d\'une section au milieu', after(['A', 'B', 'C'], [0, 2]), ['A', 'C']);
    // Dupliquer : les copies viennent après la dernière du choix, dans sa section.
    eq('dupliquer la première de B : la copie reste dans B, sans nom', after(AB, [0, 1, 2, 3, 3, 4, 5], [4]), ['A', '', '', 'B', '', '', '']);
    eq('dupliquer la dernière de A : la copie reste dans A', after(AB, [0, 1, 2, 2, 3, 4, 5], [3]), ['A', '', '', '', 'B', '', '']);
    eq('dupliquer la dernière du texte : la copie reste dans B', after(AB, [0, 1, 2, 3, 4, 5, 5], [6]), ['A', '', '', 'B', '', '', '']);
    eq('dupliquer deux diapositives : les deux copies restent dans la section de la dernière', after(AB, [0, 1, 2, 1, 2, 3, 4, 5], [3, 4]), ['A', '', '', '', '', 'B', '', '']);
    // Le début sans nom.
    const LEAD = ['', '', 'B', ''];
    eq('descendre la première du début : elle reste au début', after(LEAD, [1, 0, 2, 3], [1]), ['', '', 'B', '']);
    eq('glisser la première de B en tête : elle rejoint le début', after(LEAD, [2, 0, 1, 3], [0]), ['', '', '', 'B']);
    eq('glisser la dernière du début à la fin : elle rejoint B', after(LEAD, [0, 2, 3, 1], [3]), ['', 'B', '', '']);
    // Plusieurs déplacées ensemble, séparées.
    eq('des diapositives de deux sections glissées ensemble rejoignent la même', after(AB, [0, 2, 5, 1, 3, 4], [2, 3]), ['A', '', '', '', 'B', '']);
    eq('toutes celles d\'une section glissées dans une autre : la section disparaît', after(AB, [0, 3, 4, 5, 1, 2], [1, 2, 3]), ['A', '', '', '', '', '']);
    eq('une section d\'une seule diapositive glissée en tête rejoint la première : elle disparaît', after(['A', 'B', 'C'], [1, 0, 2], [0]), ['A', '', 'C']);
    // Les noms sont ceux d\'avant, jamais inventés ; la longueur suit l\'ordre.
    const many = after(AB, [5, 4, 3, 2, 1, 0], [0, 1, 2, 3, 4, 5]);
    check('autant de noms que de places', many.length === 6, many);
    check('tout glissé à la fois : aucun nom inventé', many.filter(Boolean).every(name => name === 'A' || name === 'B'), many);
    return result(bad);
  });

  add('write', 'applySection ouvre, renomme et ferme une section en un Ctrl+Z, sans toucher au reste du repère ; writeSections range les noms d\'un geste', async (h) => {
    try {
      const bad = [];
      const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 220))); };
      await load(deck({}));
      check('six diapositives, aucune section', text() === 6 && names().every(name => !name));
      check('ouvrir une section sur la quatrième', SlideProps.applySection(editor(), 3, '  Offre ') === 1);
      check('son nom est rangé, rogné', same(names(), ['', '', '', 'Offre', '', '']), names());
      check('un repère est né, au tout début de sa diapositive', SlideProps.slidesOf(editor().state.doc)[3].markers.length === 1);
      SlideProps.applyNotes(editor(), [3], 'Dire bonjour');
      check('renommer', SlideProps.applySection(editor(), 3, 'Notre offre') === 1 && names()[3] === 'Notre offre');
      check('le même nom ne change rien', SlideProps.applySection(editor(), 3, 'Notre offre') === 0);
      check('les notes du repère sont gardées', SlideProps.notesOf(editor().state.doc)[3] === 'Dire bonjour');
      check('fermer la section : le nom s\'en va mais pas les notes', SlideProps.applySection(editor(), 3, '') === 1 && names()[3] === '' && SlideProps.notesOf(editor().state.doc)[3] === 'Dire bonjour');
      SlideProps.applyNotes(editor(), [3], '');
      check('un repère qui n\'a plus rien disparaît', SlideProps.slidesOf(editor().state.doc)[3].markers.length === 0);
      // Annuler.
      await sleep(650);
      SlideProps.applySection(editor(), 1, 'Début');
      const count = () => SlideProps.slidesOf(editor().state.doc).reduce((n, slide) => n + slide.markers.length, 0);
      check('un repère de section est posé', count() === 1);
      editor().commands.undo();
      check('un seul Ctrl+Z défait l\'ouverture de la section', count() === 0 && names().every(name => !name), names());
      // writeSections.
      const tr = editor().state.tr;
      check('écrire des noms : la transaction change', SlideProps.writeSections(tr, ['A', '', '', 'B', '', '']) === true && tr.docChanged);
      editor().view.dispatch(tr);
      check('les noms sont rangés', same(names(), ['A', '', '', 'B', '', '']), names());
      const noop = editor().state.tr;
      check('écrire les mêmes noms ne change rien', SlideProps.writeSections(noop, ['A', '', '', 'B', '', '']) === false && !noop.docChanged);
      const clear = editor().state.tr;
      SlideProps.writeSections(clear, ['', '', '', '', '', '']);
      editor().view.dispatch(clear);
      check('des noms vides retirent tous les repères', names().every(name => !name) && SlideProps.slidesOf(editor().state.doc).every(slide => slide.markers.length === 0));
      // Le garde-fou du repère ne rend pas les noms d'avant à une transaction de rangement.
      await load(deck({ 0: 'A', 3: 'B' }));
      const move = editor().state.tr;
      SlideProps.writeSections(move, ['', '', '', '', '', '']);
      editor().view.dispatch(move);
      await sleep(60);
      check('une transaction de rangement n\'est pas défaite par le rangement du repère', names().every(name => !name), names());
      return result(bad);
    } finally { await h.resetEditor(); }
  });

  add('move', 'monter ou descendre une SECTION : elle change de place avec sa voisine, avec toutes ses diapositives et son nom, jamais au-dessus de la section du début', async () => {
    const bad = [];
    const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 200))); };
    const move = (names, index, dir) => SlideProps.sectionMove(names, index, dir);
    // A (0-1), B (2-3), C (4-5)
    const abc = ['A', '', 'B', '', 'C', ''];
    let m = move(abc, 2, -1);
    check('B monte au-dessus de A : B A C, les diapositives de chaque section restent ensemble et dans l\'ordre', m && same(m.order, [2, 3, 0, 1, 4, 5]) && same(m.names, ['B', '', 'A', '', 'C', '']), m);
    check('la première diapositive de la section qui monte est à la place 0, sa section a deux diapositives', m && m.target === 0 && m.count === 2, m);
    m = move(abc, 3, 1);
    check('n\'importe quelle diapositive de B la descend : A C B', m && same(m.order, [0, 1, 4, 5, 2, 3]) && same(m.names, ['A', '', 'C', '', 'B', '']) && m.target === 4, m);
    check('la première ne monte pas, la dernière ne descend pas', move(abc, 1, -1) === null && move(abc, 5, 1) === null);
    // Des sections de tailles différentes : A (0), B (1-3), C (4)
    m = move(['A', 'B', '', '', 'C'], 4, -1);
    check('tailles différentes : C monte au-dessus de B : A C B', m && same(m.order, [0, 4, 1, 2, 3]) && same(m.names, ['A', 'C', 'B', '', '']) && m.target === 1 && m.count === 1, m);
    // La section du début (sans nom) ne bouge pas, et rien ne passe au-dessus d'elle.
    const lead = ['', '', 'B', '', 'C', ''];
    check('la section du début ne descend pas', move(lead, 0, 1) === null && move(lead, 1, 1) === null);
    check('la première section nommée ne passe pas au-dessus de la section du début', move(lead, 2, -1) === null);
    m = move(lead, 4, -1);
    check('mais la suivante monte au-dessus de la première : le début reste en tête', m && same(m.order, [0, 1, 4, 5, 2, 3]) && same(m.names, ['', '', 'C', '', 'B', '']), m);
    check('aucune section : rien ne bouge', move(['', '', ''], 1, 1) === null && move([], 0, 1) === null);
    check('un sens qui n\'est ni -1 ni 1 ne bouge rien', move(abc, 2, 2) === null && move(abc, 2, 0) === null);
    check('sectionIndexAt : la section d\'une diapositive', SlideProps.sectionIndexAt(SlideProps.sectionsFrom(abc), 3) === 1 && SlideProps.sectionIndexAt(SlideProps.sectionsFrom(abc), 9) === -1 && SlideProps.sectionIndexAt([], 0) === -1);
    return result(bad);
  });

  add('pptx', 'PowerPoint : l\'export écrit les sections (`p14:sectionLst`, la section par défaut pour les diapositives d\'avant la première), l\'import les relit : un aller-retour rend les mêmes sections', async () => {
    const bad = [];
    const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 260))); };
    await ExportEngines.ensure('pptx');
    await ExportEngines.ensure('pptxImport');
    const html = deck({ 2: 'Offre', 4: 'Conclusion & suite' });
    const blob = await PptxExport.fromHtml(html, { title: 'x' });
    const buffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('ppt/presentation.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    check('presentation.xml se lit', !doc.getElementsByTagName('parsererror').length);
    const sections = Array.from(doc.getElementsByTagName('p14:section')).map(node => ({ name: node.getAttribute('name'), id: node.getAttribute('id'), slides: Array.from(node.getElementsByTagName('p14:sldId')).map(id => id.getAttribute('id')) }));
    const listed = Array.from(doc.getElementsByTagName('p:sldId')).map(id => id.getAttribute('id'));
    check('trois sections : la section par défaut (avant la première), « Offre », « Conclusion & suite »', sections.length === 3 && sections[0].name === I18n.t('pptx.export.defaultSection') && sections[1].name === 'Offre' && sections[2].name === 'Conclusion & suite', sections.map(section => section.name));
    check('chaque section range ses diapositives (2, 2, 2), dans l\'ordre de la présentation', same(sections.map(section => section.slides.length), [2, 2, 2]) && same(sections.flatMap(section => section.slides), listed), { sections: sections.map(section => section.slides), listed });
    check('toutes les diapositives sont dans une section, une seule fois', new Set(sections.flatMap(section => section.slides)).size === listed.length, listed);
    check('les identifiants des sections sont des GUID tous différents', sections.every(section => /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/.test(section.id)) && new Set(sections.map(section => section.id)).size === 3, sections.map(section => section.id));
    check('l\'extension est déclarée à la fin de la présentation, avec l\'identifiant de PowerPoint', /<p:extLst><p:ext uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}">/.test(xml) && xml.indexOf('<p:extLst>') > xml.indexOf('</p:defaultTextStyle>'), xml.slice(-300));
    const back = await PptxImport.fromBuffer(buffer);
    const names = [];
    let first = true;
    Array.from(Dom.inertTemplate(back.html).content.children).forEach((node) => {
      if (node.classList.contains('page-break-marker')) { first = true; return; }
      if (node.classList.contains('pp-slide-props') && first) { names.push(SlideProps.attrsOf(node).section); first = false; return; }
      if (first && !node.classList.contains('pp-slide-props')) { names.push(''); first = false; }
    });
    check('l\'import relit les sections (celle des diapositives du début garde le nom que l\'export lui a donné)', same(names, [I18n.t('pptx.export.defaultSection'), '', 'Offre', '', 'Conclusion & suite', '']), names);
    const plain = await PptxExport.fromHtml(deck({}), { title: 'x' });
    const plainXml = await (await JSZip.loadAsync(await plain.arrayBuffer())).file('ppt/presentation.xml').async('string');
    check('sans aucune section, rien n\'est écrit', !/sectionLst|p:extLst/.test(plainXml), plainXml.slice(-200));
    return result(bad);
  });

  add('outputs', 'les sections ne sortent nulle part : la Lecture, le PDF et le Word ne les voient pas', async (h) => {
    try {
      const bad = [];
      const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 220))); };
      await load(deck({ 1: 'Offre', 4: 'Conclusion' }));
      const html = editor().getHTML();
      check('le texte enregistré porte les noms', /data-section="Offre"/.test(html) && /data-section="Conclusion"/.test(html));
      const out = SlideProps.forOutput(html);
      check('les sorties n\'en voient aucun', !/data-section|Offre|Conclusion|pp-slide-props/.test(out), out.slice(0, 200));
      check('et gardent le texte des diapositives', NAMES.every(name => out.indexOf('<p>' + name + '</p>') >= 0));
      const stripped = SlideProps.strip(html);
      check('strip retire aussi le repère', !/data-section/.test(stripped));
      return result(bad);
    } finally { await h.resetEditor(); }
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.slideSections = cases;
})();
