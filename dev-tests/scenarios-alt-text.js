// Suite "altText" - le texte alternatif d'une image (js/alt-text.js, demande d'Antoine du 06/11 : « Texte alternatif des images et des objets », lot 1 : les images du document). Le nœud « image »
// porte `alt` (le texte) et `decorative` (la case « Image décorative ») ; le bouton « Texte alternatif… » de la barre de l'image et Ctrl+Alt+Y ouvrent la fenêtre ; Word, PowerPoint, HTML et Markdown
// reprennent le texte, et la marque « décorative » de Word et de PowerPoint est écrite. Deux moitiés :
//  1) l'ÉDITEUR : les assistants (nettoyage, « Image » d'avant), le nœud (défaut vide, aller-retour du HTML), le bouton (allumé quand l'image est décrite), la fenêtre (texte, case, Annuler, un seul
//     Ctrl+Z), la touche ;
//  2) les SORTIES : HTML, Markdown, Word (OOXML dézippé : `descr`, extension décorative), PowerPoint (export, puis réimport) ;
//  3) les OBJETS de diapositive (lot 2 : cadre, forme, trait) : le modèle (`alt`, `decorative`), la fenêtre sur l'objet, Word et PowerPoint (export et réimport).
// La vraie souris et le vrai clavier à 700x400 sont dans dev-tests/verify-alt-text-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const image = extra => `<img class="editor-image" src="${DATA}" style="width: 120px"${extra || ''}>`;
  const DECORATIVE_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // Les images du document, dans l'ordre : { node, pos }.
  function images() {
    const found = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') found.push({ node, pos }); });
    return found;
  }
  const select = async index => { ed().chain().focus().setNodeSelection(images()[index].pos).run(); await sleep(120); };
  const attrsAt = index => images()[index].node.attrs;
  const modal = () => document.getElementById('pp-alt-modal');
  const modalOpen = () => !!modal() && modal().style.display !== 'none';
  const barButton = () => document.querySelector('.v2-image-toolbar button[data-action="alt"]');
  const press = el => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
  async function closeModal() {
    if (!modalOpen()) return;
    document.querySelector('#pp-alt-modal .pp-modal-actions button:not(.var-modal-primary)').click();
    await sleep(60);
  }
  const input = () => document.getElementById('pp-alt-text');
  const decorativeBox = () => document.getElementById('pp-alt-decorative');
  const confirm = () => document.querySelector('#pp-alt-modal .var-modal-primary');

  // === 1) L'éditeur ===================================================================================================================================================
  cases.push({
    id: 'alttext_helpers_clean_the_text_and_read_an_image',
    description: 'AltText : un texte perd ses retours à la ligne, ses espaces en trop et se borne à 500 signes ; l\'ancien « Image » ne décrit rien ; une image est décrite par un texte ou par la case décorative ; une <img> décorative se lit sans texte',
    run: async () => {
      const long = AltText.clean('a'.repeat(900));
      const made = html => new DOMParser().parseFromString(html, 'text/html').body.firstElementChild;
      const seen = {
        spaced: AltText.clean('  Un\n  chat \t noir  '), long: long.length, notText: AltText.clean(42), controls: AltText.clean('a\u0000b\u0085c'),
        placeholder: AltText.textOf('Image'), placeholderSpaced: AltText.textOf('  Image '), real: AltText.textOf('Image du site'),
        describedByText: AltText.isDescribed({ alt: 'Un chat', decorative: false }), describedByCase: AltText.isDescribed({ alt: '', decorative: true }),
        notDescribed: AltText.isDescribed({ alt: '', decorative: false }), notDescribedLegacy: AltText.isDescribed({ alt: 'Image' }), noAttrs: AltText.isDescribed(null),
        decorativeValues: [true, 'true', false, 'false', undefined, 2, '1', 1].map(AltText.isDecorative).join(),
        plain: JSON.stringify(AltText.ofImage(made('<img alt="Un chat">'))), decor: JSON.stringify(AltText.ofImage(made('<img alt="Un chat" data-decorative="true">'))),
        legacy: JSON.stringify(AltText.ofImage(made('<img alt="Image">'))), bare: JSON.stringify(AltText.ofImage(made('<img>'))), missing: JSON.stringify(AltText.ofImage(null)),
        max: AltText.MAX,
      };
      const pass = seen.spaced === 'Un chat noir' && seen.long === 500 && seen.notText === '' && seen.controls === 'a b c' && seen.placeholder === '' && seen.placeholderSpaced === '' && seen.real === 'Image du site'
        && seen.describedByText && seen.describedByCase && !seen.notDescribed && !seen.notDescribedLegacy && !seen.noAttrs && seen.decorativeValues === 'true,true,false,false,false,false,true,true'
        && seen.plain === '{"decorative":false,"text":"Un chat"}' && seen.decor === '{"decorative":true,"text":""}' && seen.legacy === '{"decorative":false,"text":""}'
        && seen.bare === '{"decorative":false,"text":""}' && seen.missing === '{"decorative":false,"text":""}' && seen.max === 500;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_node_starts_empty_and_round_trips_through_the_html',
    description: 'Une image insérée n\'a plus le texte « Image » d\'avant (texte vide, pas décorative) ; le texte alternatif et la case décorative font l\'aller-retour du HTML (`alt`, `data-decorative`, rien d\'écrit pour une image ordinaire) ; une image d\'un ancien document garde son « Image », lu comme vide',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      ed().chain().focus('end').insertImage({ src: DATA, width: '100px' }).run();
      await sleep(100);
      const inserted = attrsAt(0);
      await setDoc(h, '<p>' + image(' alt="Un chat noir"') + '</p><p>' + image(' alt="" data-decorative="true"') + '</p><p>' + image(' alt="Image"') + '</p><p>' + image() + '</p>');
      const saved = Editor.getHTML();
      const tags = saved.match(/<img[^>]*>/g) || [];
      const nodes = images().map(one => one.node.attrs);
      const seen = {
        insertedAlt: inserted.alt, insertedDecorative: inserted.decorative, tags: tags.length,
        described: [nodes[0].alt, nodes[0].decorative], decorative: [nodes[1].alt, nodes[1].decorative], legacy: [nodes[2].alt, nodes[2].decorative, AltText.isDescribed(nodes[2])], bare: [nodes[3].alt, nodes[3].decorative],
        savedDescribed: /alt="Un chat noir"/.test(tags[0]) && !/data-decorative/.test(tags[0]), savedDecorative: /alt=""/.test(tags[1]) && /data-decorative="true"/.test(tags[1]), savedPlain: !/data-decorative/.test(tags[3]),
      };
      const pass = seen.insertedAlt === '' && seen.insertedDecorative === false && seen.tags === 4
        && seen.described.join('|') === 'Un chat noir|false' && seen.decorative.join('|') === '|true' && seen.legacy.join('|') === 'Image|false|false' && seen.bare.join('|') === '|false'
        && seen.savedDescribed && seen.savedDecorative && seen.savedPlain;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_toolbar_button_is_lit_when_described_and_opens_the_window_with_the_text',
    description: 'La barre de l\'image a le bouton « Texte alternatif… » : éteint pour une image sans description, allumé pour une image décrite ou décorative ; son clic ouvre la fenêtre avec le texte de l\'image (vide pour l\'ancien « Image »), la case et le compteur',
    run: async (h) => {
      await setDoc(h, '<p>' + image() + '</p><p>' + image(' alt="Un chat noir"') + '</p><p>' + image(' alt="" data-decorative="true"') + '</p><p>' + image(' alt="Image"') + '</p>');
      const seen = { present: [] };
      for (let index = 0; index < 4; index++) {
        await select(index);
        const button = barButton();
        seen.present.push(!!button && button.classList.contains('is-active'));
      }
      await select(1);
      press(barButton());
      await sleep(120);
      seen.opened = modalOpen();
      seen.text = input().value;
      seen.box = decorativeBox().checked;
      seen.count = document.getElementById('pp-alt-count').textContent;
      seen.title = document.getElementById('pp-alt-title').textContent;
      seen.focus = document.activeElement === input();
      await closeModal();
      await select(3);
      press(barButton());
      await sleep(120);
      seen.legacyText = input().value;
      await closeModal();
      const pass = seen.present.join() === 'false,true,true,false' && seen.opened && seen.text === 'Un chat noir' && seen.box === false && seen.count === '12 / 500' && seen.title === 'Texte alternatif' && seen.focus
        && seen.legacyText === '';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_window_writes_the_text_in_one_history_step',
    description: 'Écrire un texte dans la fenêtre et valider pose `alt` sur l\'image (l\'image reste sélectionnée, le bouton s\'allume) d\'UN pas d\'historique : un Ctrl+Z défait le texte ; Entrée valide aussi ; un texte de blancs ne décrit rien',
    run: async (h) => {
      await setDoc(h, '<p>' + image() + '</p>');
      await select(0);
      press(barButton());
      await sleep(120);
      input().value = '  Un chat\n noir  ';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      const counted = document.getElementById('pp-alt-count').textContent;
      confirm().click();
      await sleep(120);
      const seen = { counted, closed: !modalOpen(), alt: attrsAt(0).alt, decorative: attrsAt(0).decorative, selected: !!ed().state.selection.node, lit: barButton().classList.contains('is-active') };
      await h.clickButton('v2-btn-undo');
      await sleep(120);
      seen.undone = attrsAt(0).alt;
      // Entrée dans le champ valide (un texte alternatif tient sur une ligne).
      await select(0);
      press(barButton());
      await sleep(120);
      input().value = 'Par Entrée';
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(120);
      seen.enter = [attrsAt(0).alt, modalOpen()];
      // Des blancs seuls ne décrivent rien.
      await select(0);
      press(barButton());
      await sleep(120);
      input().value = '   \n  ';
      confirm().click();
      await sleep(120);
      seen.blank = [attrsAt(0).alt, AltText.isDescribed(attrsAt(0))];
      const pass = seen.counted === '17 / 500' && seen.closed && seen.alt === 'Un chat noir' && seen.decorative === false && seen.selected && seen.lit
        && seen.undone === '' && seen.enter.join('|') === 'Par Entrée|false' && seen.blank.join('|') === '|false';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_decorative_case_greys_the_field_and_leaves_no_text',
    description: 'La case « Image décorative » grise le champ (son texte revient si elle est décochée) ; valider avec elle cochée pose `decorative` et vide `alt` ; la rouvrir montre la case cochée et le champ gris ; la décocher et valider un texte la retire',
    run: async (h) => {
      await setDoc(h, '<p>' + image(' alt="Un chat noir"') + '</p>');
      await select(0);
      press(barButton());
      await sleep(120);
      const seen = { greyBefore: input().disabled };
      decorativeBox().checked = true;
      decorativeBox().dispatchEvent(new Event('change', { bubbles: true }));
      seen.greyAfter = input().disabled;
      decorativeBox().checked = false;
      decorativeBox().dispatchEvent(new Event('change', { bubbles: true }));
      seen.backText = [input().disabled, input().value];
      decorativeBox().checked = true;
      decorativeBox().dispatchEvent(new Event('change', { bubbles: true }));
      confirm().click();
      await sleep(120);
      seen.saved = [attrsAt(0).alt, attrsAt(0).decorative, barButton().classList.contains('is-active')];
      press(barButton());
      await sleep(120);
      seen.reopened = [decorativeBox().checked, input().disabled, input().value];
      decorativeBox().checked = false;
      decorativeBox().dispatchEvent(new Event('change', { bubbles: true }));
      input().value = 'Un chien';
      confirm().click();
      await sleep(120);
      seen.undecorated = [attrsAt(0).alt, attrsAt(0).decorative];
      const pass = seen.greyBefore === false && seen.greyAfter === true && seen.backText.join('|') === 'false|Un chat noir' && seen.saved.join('|') === '|true|true'
        && seen.reopened.join('|') === 'true|true|' && seen.undecorated.join('|') === 'Un chien|false';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_cancel_escape_and_unchanged_save_write_nothing',
    description: 'Annuler, Échap et valider sans rien changer n\'écrivent rien (même document, rien dans l\'historique) ; sans image sélectionnée, ni le bouton ni la touche n\'ouvrent la fenêtre',
    run: async (h) => {
      await setDoc(h, '<p>' + image(' alt="Un chat noir"') + '</p><p>Texte</p>');
      await select(0);
      const before = ed().state.doc;
      press(barButton());
      await sleep(120);
      input().value = 'Autre chose';
      document.querySelector('#pp-alt-modal .pp-modal-actions button:not(.var-modal-primary)').click();
      await sleep(80);
      const seen = { cancelClosed: !modalOpen(), cancelDoc: ed().state.doc === before };
      press(barButton());
      await sleep(120);
      input().value = 'Autre chose';
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(120);
      seen.escapeClosed = !modalOpen();
      seen.escapeDoc = ed().state.doc === before;
      await closeModal();
      press(barButton());
      await sleep(120);
      confirm().click();
      await sleep(120);
      seen.unchangedDoc = ed().state.doc === before;
      // Aucune image sélectionnée : rien à ouvrir.
      ed().chain().focus().setTextSelection(images()[0].pos + 4).run();
      await sleep(80);
      seen.noImage = [AltText.canOpen(), AltText.open(), modalOpen(), Shortcuts.run('altText') === true];
      const pass = seen.cancelClosed && seen.cancelDoc && seen.escapeClosed && seen.escapeDoc && seen.unchangedDoc && seen.noImage.join() === 'false,false,false,false';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_shortcut_is_ctrl_alt_y_and_opens_the_window_for_the_selected_image',
    description: 'Ctrl+Alt+Y (la touche de Google Docs) est dans le registre des raccourcis (groupe Insertion) ; la touche ouvre la fenêtre sur l\'image sélectionnée et sur elle seule',
    run: async (h) => {
      await setDoc(h, '<p>' + image() + '</p><p>Texte</p>');
      const action = Shortcuts.ACTIONS.find(one => one.id === 'altText');
      const seen = { registered: !!action, group: action && action.group, key: Shortcuts.keyFor('altText'), ctrlAlt: !!(action && action.ctrlAlt) };
      await select(0);
      seen.ran = Shortcuts.run('altText') === true;
      await sleep(120);
      seen.opened = modalOpen();
      await closeModal();
      const pass = seen.registered && seen.group === 'insert' && /Alt\+Y$/i.test(seen.key) && seen.ctrlAlt && seen.ran && seen.opened;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // === 2) Les sorties =================================================================================================================================================
  const OUT_HTML = '<p>' + image(' alt="Un chat noir"') + '</p><p>' + image(' alt="" data-decorative="true"') + '</p><p>' + image(' alt="Image"') + '</p><p>Fin</p>';
  const altsOf = text => (text.match(/<img[^>]*>/g) || []).map(tag => (/ alt="([^"]*)"/.exec(tag) || [])[1]);

  cases.push({
    id: 'alttext_html_and_markdown_exports_keep_the_text_and_leave_decorative_and_legacy_images_empty',
    description: 'HTML exporté : `alt` du texte alternatif, `alt=""` pour une image décorative et pour l\'ancien « Image » ; Markdown : `![texte](…)`, `![](…)` pour les deux autres',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: true });
      let html, markdown;
      try {
        html = await h.exportHtml(OUT_HTML);
        markdown = await h.exportMarkdown(OUT_HTML);
      } finally { dialogs.restore(); }
      const alts = altsOf(html.text);
      // Une image qui a sa largeur s'écrit en <img>, sans elle en ![texte](adresse) : le texte alternatif est le même dans les deux écritures.
      const altsMarkdown = text => Array.from(text.matchAll(/!\[([^\]]*)\]\(|<img\b[^>]*?\salt="([^"]*)"/g)).map(match => (match[1] !== undefined ? match[1] : match[2]));
      const plain = '<p><img class="editor-image" src="' + DATA + '" alt="Un chat noir"></p><p><img class="editor-image" src="' + DATA + '" alt="" data-decorative="true"></p><p><img class="editor-image" src="' + DATA + '" alt="Image"></p>';
      let bare;
      const again = h.stubDialogs({ confirm: true });
      try { bare = await h.exportMarkdown(plain); } finally { again.restore(); }
      const sized = altsMarkdown(markdown.text);
      const unsized = altsMarkdown(bare.text);
      const pass = alts.join('|') === 'Un chat noir||' && sized.join('|') === 'Un chat noir||' && unsized.join('|') === 'Un chat noir||';
      return { pass, notes: JSON.stringify({ alts, sized, unsized, bare: bare.text.slice(0, 200) }) };
    },
  });

  cases.push({
    id: 'alttext_word_export_writes_the_description_and_the_decorative_mark',
    description: 'Word (OOXML dézippé) : `wp:docPr` porte `descr` du texte alternatif ; une image décorative a l\'extension « décorative » de Microsoft (`adec:decorative`) dans `wp:docPr`, sans titre de repère ; une image sans description a `descr` vide et rien de plus ; une image répétée sur toutes les pages garde aussi son texte',
    run: async (h) => {
      const html = OUT_HTML + '<p>' + image(' alt="Un papier à en-tête" data-layer="behind" data-repeat="true"') + '</p>';
      const out = await h.exportDocxParts(html);
      const docPrs = Array.from(out.doc.getElementsByTagName('wp:docPr'));
      const marked = node => Array.from(node.getElementsByTagName('*')).some(el => el.localName === 'decorative' && el.getAttribute('val') === '1');
      const rows = docPrs.map(node => ({ descr: node.getAttribute('descr') || '', title: node.getAttribute('title') || '', decorative: marked(node), uri: Array.from(node.getElementsByTagName('*')).some(el => el.getAttribute('uri') === DECORATIVE_URI) }));
      const everything = Object.keys(out.parts).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)).map(name => out.parts[name]).join('\n');
      const decoratives = rows.filter(row => row.decorative);
      const described = rows.filter(row => row.descr === 'Un chat noir');
      const plain = rows.filter(row => row.descr === '' && !row.decorative);
      const repeated = /descr="Un papier à en-tête"/.test(everything);
      const pass = described.length === 1 && decoratives.length === 1 && decoratives[0].descr === '' && decoratives[0].uri && rows.every(row => row.title === '') && plain.length >= 1 && !/pp-decorative/.test(everything) && repeated
        && !/descr="Image"/.test(everything);
      return { pass, notes: JSON.stringify({ rows, repeated, decorativeTitleLeft: /pp-decorative/.test(everything) }) };
    },
  });

  cases.push({
    id: 'alttext_powerpoint_export_writes_descr_and_the_decorative_extension_and_the_import_reads_them_back',
    description: 'PowerPoint exporté : `descr` du texte alternatif, extension « décorative » dans `p:cNvPr` d\'une image décorative (après son lien, s\'il y en a un) ; relu par l\'import, le texte revient sur l\'image et la case décorative aussi ; un fichier sans description ne remet plus « Image »',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const frame = (y, content) => FreeFrame.html({ x: 60, y, w: 200, h: 120 }, '<p>' + content + '</p>');
      const html = frame(40, image(' alt="Un chat noir"')) + frame(200, image(' alt="" data-decorative="true"')) + frame(360, image());
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const pictures = xml.match(/<p:pic>.*?<\/p:pic>/g) || [];
      const props = pictures.map(pic => (/<p:cNvPr[^>]*>(?:.*?<\/p:cNvPr>)?/.exec(pic) || [''])[0]);
      const written = {
        count: pictures.length, described: /descr="Un chat noir"/.test(props[0]) && !/decorative/.test(props[0]),
        decorative: /descr=""/.test(props[1]) && props[1].indexOf(DECORATIVE_URI) > 0 && /<adec:decorative [^>]*val="1"\/>/.test(props[1]) && /<\/a:extLst><\/p:cNvPr>$/.test(props[1]),
        plain: /descr=""/.test(props[2]) && !/decorative/.test(props[2]),
      };
      const imported = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const tags = (imported.html.match(/<img[^>]*>/g) || []);
      const read = {
        count: tags.length, described: tags.some(tag => / alt="Un chat noir"/.test(tag) && !/data-decorative/.test(tag)),
        decorative: tags.some(tag => / alt=""/.test(tag) && /data-decorative="true"/.test(tag)), noPlaceholder: !tags.some(tag => / alt="Image"/.test(tag)),
      };
      const pass = written.count === 3 && written.described && written.decorative && written.plain && read.count === 3 && read.described && read.decorative && read.noPlaceholder;
      return { pass, notes: JSON.stringify({ written, read, props: props.map(p => p.slice(0, 420)) }) };
    },
  });

  // === 3) Les objets de diapositive (lot 2 : cadres, formes, traits) ==============================================================================================
  const frame = (y, extra, content) => FreeFrame.html(Object.assign({ x: 60, y, w: 220, h: 70 }, extra), content === undefined ? '<p>Texte</p>' : content);
  const OBJECTS = () => frame(40, { alt: 'Une flèche vers l’étape 2', shape: 'rect', fill: '#ddeeff' }, '<p></p>') + frame(130, { decorative: '1', alt: 'Ignoré', shape: 'rect', fill: '#eeeeee' }, '<p></p>')
    + frame(220, { alt: 'Le titre du bloc' }) + frame(310, { shape: 'line', line: '#0369a1', lw: 2, alt: 'Un filet bleu', h: 0 }, '') + frame(400, { shape: 'line', line: '#999999', lw: 1, decorative: '1', h: 0 }, '');
  // Les objets du document, dans l'ordre : { node, pos }.
  function objects() {
    const found = [];
    ed().state.doc.forEach((node, pos) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') found.push({ node, pos }); });
    return found;
  }
  const selectObject = async index => { FreeFrame.select(ed(), objects()[index].pos); await sleep(150); };
  const objectAttrs = index => FreeFrame.normalized(objects()[index].node.attrs);

  cases.push({
    id: 'alttext_object_model_keeps_the_text_drops_it_for_a_decorative_object_and_round_trips_the_html',
    description: 'Un objet de diapositive (cadre, forme, trait) a `alt` (500 signes au plus) et `decorative` (« 1 ») : une marque décorative n\'a pas de texte, le HTML écrit `data-ff-alt` / `data-ff-decorative` seulement pour ceux qui en ont, `role="presentation"` et pas d\'`aria-label` pour un objet décoratif, et l\'éditeur relit tout',
    run: async (h) => {
      await h.resetEditor();
      const normal = FreeFrame.normalized({ alt: '  Une \n flèche  ', decorative: '' });
      const long = FreeFrame.normalized({ alt: 'a'.repeat(900) });
      const decorative = FreeFrame.normalized({ alt: 'Ignoré', decorative: '1' });
      const wordy = FreeFrame.normalized({ alt: 'Dit', decorative: 'true' });
      const odd = FreeFrame.normalized({ alt: 'Dit', decorative: 'oui' });
      Editor.setHTML(OBJECTS());
      await sleep(250);
      const saved = Editor.getHTML();
      const doc = new DOMParser().parseFromString(saved, 'text/html');
      const frames = Array.from(doc.querySelectorAll('.pp-free-frame'));
      const rows = frames.map(el => ({ alt: el.getAttribute('data-ff-alt'), decorative: el.getAttribute('data-ff-decorative'), role: el.getAttribute('role'), label: el.getAttribute('aria-label') }));
      const after = objects().map((one, i) => objectAttrs(i)).map(a => ({ alt: a.alt, decorative: a.decorative }));
      const pass = normal.alt === 'Une flèche' && normal.decorative === '' && long.alt.length === 500 && decorative.alt === '' && decorative.decorative === '1' && wordy.decorative === '1' && wordy.alt === '' && odd.decorative === '' && odd.alt === 'Dit'
        && frames.length === 5
        && rows[0].alt === 'Une flèche vers l’étape 2' && rows[0].decorative === null && rows[0].role === 'group' && rows[0].label === 'Une flèche vers l’étape 2'
        && rows[1].alt === null && rows[1].decorative === '1' && rows[1].role === 'presentation' && rows[1].label === null
        && rows[2].alt === 'Le titre du bloc' && rows[3].alt === 'Un filet bleu' && rows[3].decorative === null && rows[4].decorative === '1' && rows[4].alt === null && rows[4].role === 'presentation'
        && after.length === 5 && after[0].alt === 'Une flèche vers l’étape 2' && after[1].decorative === '1' && after[1].alt === '' && after[4].decorative === '1';
      return { pass, notes: JSON.stringify({ normal: normal.alt, long: long.alt.length, decorative: [decorative.alt, decorative.decorative], wordy: [wordy.alt, wordy.decorative], odd: [odd.alt, odd.decorative], rows, after }) };
    },
  });

  cases.push({
    id: 'alttext_object_window_edits_the_selected_object_in_one_history_step_with_the_objects_words',
    description: 'Ctrl+Alt+Y (AltText.open) sur un objet sélectionné ou dont le texte a le curseur : la fenêtre dit « Description de l\'objet » et « Objet décoratif », se remplit du texte de l\'objet, Entrée valide en UN pas d\'historique (un Ctrl+Z le défait), la case décorative grise le champ et efface le texte, rien ne change quand rien n\'est changé, et le curseur dans le texte y reste',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(OBJECTS());
      await sleep(250);
      const seen = {};
      await selectObject(0);
      seen.canOpen = AltText.canOpen();
      seen.opened = AltText.open() === true;
      await sleep(120);
      seen.words = { label: (document.querySelector('#pp-alt-modal label[for="pp-alt-text"]') || {}).textContent, decorative: (document.querySelector('.pp-alt-decorative span') || {}).textContent, value: input().value };
      // Un texte nouveau, Entrée : un pas.
      input().value = '  Une flèche  vers l’étape 3 ';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(150);
      seen.written = objectAttrs(0).alt;
      seen.closed = !modalOpen();
      seen.stillSelected = !!ed().state.selection.node && ed().state.selection.from === objects()[0].pos;
      ed().commands.undo();
      await sleep(100);
      seen.undone = objectAttrs(0).alt;
      ed().commands.redo();
      await sleep(100);
      seen.redone = objectAttrs(0).alt;
      // Rien de changé : le document n'est pas touché.
      await selectObject(0);
      AltText.open();
      await sleep(100);
      const before = ed().state.doc;
      confirm().click();
      await sleep(100);
      seen.unchanged = ed().state.doc === before;
      // La case décorative : le champ se grise, le texte s'efface.
      await selectObject(2);
      AltText.open();
      await sleep(100);
      seen.third = input().value;
      decorativeBox().click();
      await sleep(60);
      seen.disabled = input().disabled;
      confirm().click();
      await sleep(120);
      seen.decorativeSet = [objectAttrs(2).alt, objectAttrs(2).decorative];
      AltText.open();
      await sleep(100);
      seen.reopened = { checked: decorativeBox().checked, disabled: input().disabled, value: input().value };
      await closeModal();
      // Une ligne : même fenêtre.
      await selectObject(3);
      AltText.open();
      await sleep(100);
      seen.line = input().value;
      await closeModal();
      // Le curseur dans le texte d'un cadre : la fenêtre s'ouvre sur lui, le curseur y reste.
      const at = objects()[2];
      ed().chain().focus().setTextSelection(at.pos + 3).run();
      await sleep(100);
      seen.cursorOpens = AltText.canOpen() && AltText.open() === true;
      await sleep(100);
      input().value = '';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      decorativeBox().click();
      confirm().click();
      await sleep(120);
      seen.cursorKept = !ed().state.selection.node && ed().state.selection.from > at.pos && ed().state.selection.from < at.pos + at.node.nodeSize;
      seen.cleared = [objectAttrs(2).alt, objectAttrs(2).decorative];
      // Hors d'un objet ou d'une image : rien.
      await h.resetEditor();
      Editor.setHTML('<p>Texte</p>');
      await sleep(100);
      seen.nothing = [AltText.canOpen(), AltText.open()];
      const pass = seen.canOpen && seen.opened && /objet/.test(seen.words.label) && /Objet décoratif/.test(seen.words.decorative) && seen.words.value === 'Une flèche vers l’étape 2'
        && seen.written === 'Une flèche vers l’étape 3' && seen.closed && seen.stillSelected && seen.undone === 'Une flèche vers l’étape 2' && seen.redone === 'Une flèche vers l’étape 3' && seen.unchanged
        && seen.third === 'Le titre du bloc' && seen.disabled && seen.decorativeSet.join('|') === '|1' && seen.reopened.checked && seen.reopened.disabled && seen.reopened.value === ''
        && seen.line === 'Un filet bleu' && seen.cursorOpens && seen.cursorKept && seen.cleared.join('|') === '|' && seen.nothing[0] === false && seen.nothing[1] === false;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'alttext_object_word_export_writes_the_description_and_the_decorative_mark',
    description: 'Word (OOXML dézippé) : une forme, un cadre de texte et un trait portent `descr` ; un objet décoratif (forme, trait) a l\'extension « décorative » de Microsoft dans son `wp:docPr`, sans description ni titre de repère',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(OBJECTS());
      await sleep(250);
      const out = await h.exportDocxParts(Editor.getHTML());
      const docPrs = Array.from(out.doc.getElementsByTagName('wp:docPr'));
      const marked = node => Array.from(node.getElementsByTagName('*')).some(el => el.localName === 'decorative' && el.getAttribute('val') === '1' && el.parentNode.getAttribute('uri') === DECORATIVE_URI);
      const rows = docPrs.map(node => ({ descr: node.getAttribute('descr') || '', title: node.getAttribute('title') || '', decorative: marked(node) }));
      const everything = Object.keys(out.parts).filter(name => /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)).map(name => out.parts[name]).join('\n');
      const described = ['Une flèche vers l’étape 2', 'Le titre du bloc', 'Un filet bleu'].map(text => rows.filter(row => row.descr === text).length);
      const decoratives = rows.filter(row => row.decorative);
      const pass = described.join() === '1,1,1' && decoratives.length === 2 && decoratives.every(row => row.descr === '' && row.title === '') && rows.every(row => row.title === '') && !/pp-decorative/.test(everything) && !/Ignoré/.test(everything);
      return { pass, notes: JSON.stringify({ rows, described, decoratives: decoratives.length, titleLeft: /pp-decorative/.test(everything) }) };
    },
  });

  cases.push({
    id: 'alttext_object_powerpoint_export_writes_descr_and_the_decorative_extension_and_the_import_reads_them_back',
    description: 'PowerPoint exporté : `descr` sur les formes, cadres de texte et traits ; extension « décorative » dans `p:cNvPr` d\'une forme (après son lien) ou d\'un trait décoratif ; relu par l\'import, `data-ff-alt` et `data-ff-decorative` reviennent sur les mêmes objets',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = OBJECTS() + frame(480, { decorative: '1', shape: 'rect', fill: '#cccccc', link: 'https://exemple.fr/page' }, '<p></p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const props = Array.from(xml.matchAll(/<p:nv(?:Sp|CxnSp)Pr>(<p:cNvPr [^>]*?(?:\/>|>[\s\S]*?<\/p:cNvPr>))/g), match => match[1]);
      const decorativeMark = new RegExp('<a:extLst><a:ext uri="' + DECORATIVE_URI.replace(/[{}]/g, m => '\\' + m) + '"><adec:decorative [^>]*val="1"/></a:ext></a:extLst>');
      const written = {
        count: props.length,
        described: [/descr="Une flèche vers l’étape 2"/, /descr="Le titre du bloc"/, /descr="Un filet bleu"/].map(re => props.filter(one => re.test(one) && !/decorative/.test(one)).length).join(),
        decoratives: props.filter(one => decorativeMark.test(one) && !/descr="[^"]/.test(one)).length,
        linkThenMark: props.some(one => /<a:hlinkClick[^>]*\/>.*<\/a:extLst><\/p:cNvPr>$/.test(one) && decorativeMark.test(one)),
        ignored: /Ignoré/.test(xml),
      };
      const imported = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString(imported.html, 'text/html');
      const read = Array.from(doc.querySelectorAll('.pp-free-frame')).map(el => ({ alt: el.getAttribute('data-ff-alt') || '', decorative: el.getAttribute('data-ff-decorative') || '', role: el.getAttribute('role') }));
      const pass = written.count === 6 && written.described === '1,1,1' && written.decoratives === 3 && written.linkThenMark && !written.ignored
        && read.length === 6 && read.filter(one => one.alt === 'Une flèche vers l’étape 2' && !one.decorative).length === 1 && read.filter(one => one.alt === 'Le titre du bloc').length === 1 && read.filter(one => one.alt === 'Un filet bleu').length === 1
        && read.filter(one => one.decorative === '1' && one.alt === '' && one.role === 'presentation').length === 3;
      return { pass, notes: JSON.stringify({ written, read, props: props.map(one => one.slice(0, 300)) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.altText = cases;
})();
