// Suite "emailPlainText" - un modèle email n'écrit que ce que le lien mailto: porte (js/email-plain-text.js). Retour d'Antoine du 09/10 : « là on peut encore mettre en gras avec le
// raccourci » dans un email dont le bouton Gras est grisé. Le corps d'un mailto: est du texte brut (js/mailto-export.js) : tout ce que l'éditeur y montre en plus est un écart entre la
// vue de l'éditeur et le mail. Les cas ouvrent un VRAI nouvel email (survol de « + », clic sur « Nouvel email ») puis un nouveau document pour la contre-épreuve :
//  1) les touches de mise en forme de TipTap (gras, italique, souligné, code, barré, alignements) ne font rien dans un email et font toujours leur effet dans un document ; la citation,
//     les listes, le bloc de code et les titres, que le texte brut écrit, restent possibles dans l'email ;
//  2) les signes de Markdown tapés (**gras**, *italique*, ~~barré~~, `code`) restent du texte au lieu d'être mangés par les règles de saisie ; un document en fait de la mise en forme ;
//  3) un collage perd les marques, la couleur, la taille, la police, l'alignement et les images, mais garde les liens, listes, citations, blocs de code, titres et bulles ; le même
//     collage dans un document garde tout ;
//  4) un texte brut collé garde ses lignes vides (ProseMirror compte plusieurs retours à la ligne de suite pour un seul), son retrait, et se glisse dans la ligne du curseur ;
//  5) une mise en forme restée dans un ancien modèle email (le gras des bulles de la notification d'Antoine) n'est plus montrée dans l'éditeur ni à la Lecture, sans rien changer au
//     modèle enregistré, alors qu'un document la montre ;
//  6) une image collée n'est pas posée dans un email.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const view = () => ed().view;
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await sleep(300); }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(300); }
  // Un scénario dans un email neuf, puis dans un document neuf : `body(h, kind)` y est appelé pour chacun, la contre-épreuve du document ne voit rien du module.
  async function inBoth(h, body) {
    const out = {};
    try {
      await newEmail(h);
      out.email = await body(h, 'email');
      await newDocument(h);
      out.document = await body(h, 'document');
    } finally {
      await newDocument(h);
      await h.resetEditor();
    }
    return out;
  }
  const html = () => Editor.getHTML();
  const parse = markup => { const t = document.createElement('template'); t.innerHTML = markup; return t.content; };
  async function startWith(markup) { Editor.setHTML(markup); await sleep(60); ed().commands.focus('end'); await sleep(30); }
  // Une touche comme le navigateur l'envoie (Ctrl, avec Maj : la lettre en capitale), reçue par ProseMirror sur la zone d'édition.
  // `caps` : Verr. Maj. allumé, la lettre arrive en capitale sans Maj.
  function press(key, { shift = false, alt = false, caps = false } = {}) {
    const upper = key.toUpperCase();
    const event = new KeyboardEvent('keydown', {
      key: (shift && !alt) || caps ? upper : key, code: /^[a-z]$/.test(key) ? 'Key' + upper : 'Digit' + key, keyCode: /^[a-z]$/.test(key) ? upper.charCodeAt(0) : key.charCodeAt(0),
      ctrlKey: true, shiftKey: shift, altKey: alt, bubbles: true, cancelable: true,
    });
    view().dom.dispatchEvent(event);
    return event;
  }

  const KEYS = [
    { name: 'gras (Ctrl+B)', key: 'b', test: markup => /<strong>/.test(markup) },
    { name: 'gras avec Verr. Maj. (Ctrl+B en capitale)', key: 'b', caps: true, test: markup => /<strong>/.test(markup) },
    { name: 'italique (Ctrl+I)', key: 'i', test: markup => /<em>/.test(markup) },
    { name: 'italique (Ctrl+Maj+I)', key: 'i', shift: true, test: markup => /<em>/.test(markup) },
    { name: 'souligné (Ctrl+U)', key: 'u', test: markup => /<u>/.test(markup) },
    { name: 'souligné (Ctrl+Maj+U)', key: 'u', shift: true, test: markup => /<u>/.test(markup) },
    { name: 'code en ligne (Ctrl+E)', key: 'e', test: markup => /<code>/.test(markup) },
    { name: 'barré (Ctrl+Maj+S)', key: 's', shift: true, test: markup => /<s>/.test(markup) },
    { name: 'à gauche (Ctrl+Maj+L)', key: 'l', shift: true, test: markup => /text-align/.test(markup) },
    { name: 'centré (Ctrl+Maj+E)', key: 'e', shift: true, test: markup => /text-align: center/.test(markup) },
    { name: 'à droite (Ctrl+Maj+R)', key: 'r', shift: true, test: markup => /text-align: right/.test(markup) },
    { name: 'justifié (Ctrl+Maj+J)', key: 'j', shift: true, test: markup => /text-align: justify/.test(markup) },
  ];

  cases.push({
    id: 'epl_formatting_keys_do_nothing_in_an_email_and_work_in_a_document',
    description: 'Les touches de gras, d\'italique, de souligné, de code en ligne, de barré et des alignements ne font rien dans un modèle email (le texte brut du lien ne les porte pas) et font leur effet dans un document',
    run: async (h) => {
      const result = await inBoth(h, async (_, kind) => {
        const applied = {};
        for (const k of KEYS) {
          await startWith('<p>Bonjour</p>');
          ed().commands.selectAll();
          await sleep(20);
          const event = press(k.key, k);
          await sleep(30);
          applied[k.name] = k.test(html());
          // Dans un email la touche est consommée (le navigateur n'a pas non plus le gras natif).
          if (kind === 'email') applied[k.name + ' / consommée'] = event.defaultPrevented;
        }
        return applied;
      });
      const email = result.email || {}, doc = result.document || {};
      const emailNone = KEYS.every(k => email[k.name] === false && email[k.name + ' / consommée'] === true);
      const docAll = KEYS.every(k => doc[k.name] === true);
      return { pass: emailNone && docAll, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'epl_keys_for_what_plain_text_writes_still_work_in_an_email',
    description: 'Dans un email, la citation (Ctrl+Maj+B), les listes (Ctrl+Maj+7, 8, 9), le bloc de code (Ctrl+Alt+C) et un titre (Ctrl+Alt+1) restent possibles : le texte du lien les écrit',
    run: async (h) => {
      const result = await inBoth(h, async (_, kind) => {
        const got = {};
        const tries = [
          ['citation', 'b', { shift: true }, /<blockquote>/], ['liste numérotée', '7', { shift: true }, /<ol/], ['puces', '8', { shift: true }, /<ul/],
          ['cases', '9', { shift: true }, /data-type="taskList"/], ['bloc de code', 'c', { alt: true }, /<pre>/], ['titre', '1', { alt: true }, /<h1/],
        ];
        for (const [name, key, mods, re] of tries) {
          await startWith('<p>Bonjour</p>');
          ed().commands.selectAll();
          await sleep(20);
          press(key, mods);
          await sleep(30);
          got[name] = re.test(html());
        }
        return got;
      });
      const all = r => Object.keys(r || {}).length === 6 && Object.values(r).every(Boolean);
      return { pass: all(result.email) && all(result.document), notes: JSON.stringify(result) };
    },
  });

  // Une frappe comme la traite ProseMirror, un signe à la fois : `handleTextInput` d'abord (les règles de saisie de TipTap en font partie), puis l'insertion par défaut.
  function typeLikeTheKeyboard(text) {
    for (const ch of text) {
      const { from, to } = view().state.selection;
      const deflt = () => view().state.tr.insertText(ch, from, to);
      if (!view().someProp('handleTextInput', f => f(view(), from, to, ch, deflt))) view().dispatch(deflt());
    }
  }

  cases.push({
    id: 'epl_markdown_signs_typed_stay_text_in_an_email',
    description: 'Les signes de Markdown tapés (**gras**, *italique*, ~~barré~~, `code`, __gras__, _italique_) restent du texte dans un email, que le lien écrit tel quel (les règles de saisie les mangeraient pour une mise en forme que le lien ne porte pas), et posent la mise en forme dans un document ; les règles de saisie des listes (« - », « * »), du titre (« # ») et de la citation (« > ») marchent dans les deux',
    run: async (h) => {
      const MARKDOWN = 'Voici **gras**, *ital*, ~~barré~~, `code`, __gras2__ et _ital2_ fin, snake_case_nom';
      const result = await inBoth(h, async () => {
        await startWith('<p></p>');
        typeLikeTheKeyboard(MARKDOWN);
        await sleep(40);
        const got = { typed: html() };
        for (const [name, typed] of [['puces', '- Un'], ['puces avec un astérisque', '* Un'], ['titre', '# Un'], ['citation', '> Un']]) {
          await startWith('<p></p>');
          typeLikeTheKeyboard(typed);
          await sleep(30);
          got[name] = html();
        }
        return got;
      });
      const email = result.email || {}, doc = result.document || {};
      const marks = markup => (markup.match(/<(strong|em|s|code)>/g) || []).length;
      const emailText = email.typed === `<p>${MARKDOWN}</p>`;
      const docMarks = marks(doc.typed || '') === 6;
      const blocks = r => /<ul><li><p>Un<\/p><\/li><\/ul>/.test(r.puces || '') && /<ul><li><p>Un<\/p><\/li><\/ul>/.test(r['puces avec un astérisque'] || '')
        && /<h1[ >][^]*Un/.test(r.titre || '') && /<blockquote><p>Un<\/p><\/blockquote>/.test(r.citation || '');
      return { pass: emailText && docMarks && blocks(email) && blocks(doc), notes: JSON.stringify(result) };
    },
  });

  const BUBBLE ='<span class="var-badge" data-table="Contacts" data-column="Prenom" data-key="Contacts.Prenom">#Contacts.Prenom</span>';
  const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const PASTED = '<p>Avant</p><p style="text-align: center">Centré</p>'
    + '<p><strong>Gras</strong> <em>ital</em> <u>sou</u> <s>bar</s> <code>code</code> <span style="color: rgb(255, 0, 0); font-size: 24px; font-family: Georgia">rouge</span> '
    + `<a href="https://exemple.fr/page">lien</a> <strong>${BUBBLE}</strong> <img class="editor-image" src="${GIF}"></p>`
    + '<h2 style="text-align: right">Titre</h2><ul><li><p>Puce</p></li></ul><blockquote><p>Cité</p></blockquote><pre><code>ligne de code</code></pre>';

  cases.push({
    id: 'epl_pasted_formatting_is_dropped_in_an_email_and_kept_in_a_document',
    description: 'Un collage dans un email perd gras, italique, souligné, barré, code en ligne, couleur, taille, police, alignement et images (même sur une bulle), mais garde le texte, le lien, le titre, la liste, la citation, le bloc de code et la bulle ; dans un document, tout est gardé',
    run: async (h) => {
      const result = await inBoth(h, async () => {
        await startWith('<p></p>');
        view().pasteHTML(PASTED);
        await sleep(120);
        const doc = parse(html());
        const count = selector => doc.querySelectorAll(selector).length;
        return {
          marks: count('strong, em, u, s'), inlineCode: count(':not(pre) > code'), styles: count('[style]'), images: count('img'),
          link: count('a[href="https://exemple.fr/page"]'), heading: count('h2'), list: count('ul li'), quote: count('blockquote'), codeBlock: count('pre code'), bubbles: count('.var-badge'),
          text: doc.textContent.replace(/\s+/g, ' ').trim(),
        };
      });
      const kept = r => r && r.link === 1 && r.heading === 1 && r.list === 1 && r.quote === 1 && r.codeBlock === 1 && r.bubbles === 1
        && /^AvantCentréGras ital sou bar code rouge lien #Contacts\.Prenom TitrePuceCitéligne de code$/.test(r.text);
      const email = result.email, doc = result.document;
      const emailBare = email && email.marks === 0 && email.inlineCode === 0 && email.styles === 0 && email.images === 0;
      const docWhole = doc && doc.marks >= 5 && doc.inlineCode === 1 && doc.styles >= 2 && doc.images === 1;
      return { pass: kept(email) && kept(doc) && emailBare && docWhole, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'epl_pasted_text_keeps_its_blank_lines_and_indent_in_an_email',
    description: 'Un texte brut collé dans un email garde ses lignes vides (plusieurs de suite) et son retrait, un texte d\'une ligne se glisse dans la ligne du curseur ; dans un document le collage reste celui de ProseMirror (les retours à la ligne de suite comptent pour un)',
    run: async (h) => {
      const result = await inBoth(h, async () => {
        await startWith('<p></p>');
        view().pasteText('A\n\nB\n\n\n  - C');
        await sleep(80);
        const lines = html();
        await startWith('<p>Bonjour</p>');
        ed().commands.setTextSelection(4);
        view().pasteText(' à tous');
        await sleep(80);
        return { lines, inline: html() };
      });
      const emailLines = '<p>A</p><p></p><p>B</p><p></p><p></p><p>  - C</p>';
      const pass = !!result.email && result.email.lines === emailLines && result.email.inline === '<p>Bon à tousjour</p>'
        && !!result.document && result.document.lines === '<p>A</p><p>B</p><p>  - C</p>' && result.document.inline === '<p>Bon à tousjour</p>';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'epl_old_formatting_of_an_email_model_is_not_shown_and_not_removed',
    description: 'Une mise en forme restée dans un modèle email (gras sur des bulles, couleur, taille, alignement) s\'affiche comme le texte autour dans l\'éditeur et à la Lecture, le modèle enregistré la garde ; un document la montre, les titres, listes et liens d\'un email aussi',
    run: async (h) => {
      const OLD = '<h1>Titre</h1><p>Texte <strong>gras</strong> <em>ital</em> <u>sou</u> <s>bar</s> <code>code</code> <span style="color: rgb(255, 0, 0); font-size: 24px; font-family: Georgia">rouge</span> '
        + `<strong>${BUBBLE}</strong> <a href="https://exemple.fr">lien</a></p><p style="text-align: center">Centré</p><ul><li><p>Puce</p></li></ul>`;
      const result = await inBoth(h, async () => {
        await startWith(OLD);
        const shown = root => {
          const style = (selector, prop) => { const el = root.querySelector(selector); return el ? getComputedStyle(el)[prop] : null; };
          const paragraph = root.querySelector('p');
          const read = {
            bold: style('strong', 'fontWeight'), italic: style('em', 'fontStyle'), underline: style('u', 'textDecorationLine'), strike: style('s', 'textDecorationLine'),
            code: style(':not(pre) > code', 'fontFamily'), color: style('span[style]', 'color'), size: style('span[style]', 'fontSize'), family: style('span[style]', 'fontFamily'),
            align: style('p[style*="text-align"]', 'textAlign'), heading: style('h1', 'fontSize'), link: style('a', 'textDecorationLine'),
            paragraphColor: paragraph ? getComputedStyle(paragraph).color : null, paragraphSize: paragraph ? getComputedStyle(paragraph).fontSize : null,
            paragraphFamily: paragraph ? getComputedStyle(paragraph).fontFamily : null, paragraphWeight: paragraph ? getComputedStyle(paragraph).fontWeight : null,
          };
          return read;
        };
        const inEditor = shown(document.querySelector('.tiptap'));
        const stored = html();
        const reader = await h.renderReaderMode(OLD);
        const inReader = shown(reader);
        document.getElementById('reader-container').style.display = '';
        return { inEditor, inReader, storedKeepsFormatting: /<strong>/.test(stored) && /<em>/.test(stored) && /color: rgb\(255, 0, 0\)/.test(stored) && /text-align: center/.test(stored) };
      });
      const plain = r => r && r.bold === r.paragraphWeight && r.italic === 'normal' && r.underline === 'none' && r.strike === 'none' && r.color === r.paragraphColor
        && r.size === r.paragraphSize && r.family === r.paragraphFamily && r.align !== 'center' && r.code === r.paragraphFamily && r.link.includes('underline') && parseFloat(r.heading) > parseFloat(r.paragraphSize);
      const formatted = r => r && Number(r.bold) >= 700 && r.italic === 'italic' && r.underline.includes('underline') && r.strike.includes('line-through') && r.color === 'rgb(255, 0, 0)' && r.size === '24px' && r.align === 'center';
      const email = result.email, doc = result.document;
      const pass = !!email && plain(email.inEditor) && plain(email.inReader) && email.storedKeepsFormatting
        && !!doc && formatted(doc.inEditor) && formatted(doc.inReader);
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'epl_body_class_follows_the_model_type',
    description: 'La classe pp-email-model est sur <body> pendant un email et nulle part ailleurs (document, nouvel email puis nouveau document)',
    run: async (h) => {
      const has = () => document.body.classList.contains('pp-email-model');
      const states = { start: has() };
      try {
        await newEmail(h);
        states.email = has();
        states.active = EmailPlainText.isActive();
        await newDocument(h);
        states.document = has();
        states.inactive = !EmailPlainText.isActive();
      } finally { await newDocument(h); await h.resetEditor(); }
      return { pass: states.start === false && states.email === true && states.active === true && states.document === false && states.inactive === true, notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'epl_pasted_image_file_is_not_inserted_in_an_email',
    description: 'Une image dans le presse-papiers (un fichier) est posée dans un document et ne l\'est pas dans un email : le texte brut du lien n\'a pas d\'image',
    run: async (h) => {
      const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const result = await inBoth(h, async () => {
        await startWith('<p></p>');
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(PNG), c => c.charCodeAt(0))], 'a.png', { type: 'image/png' }));
        view().dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        await sleep(600);
        return { images: parse(html()).querySelectorAll('img').length };
      });
      return { pass: !!result.email && result.email.images === 0 && !!result.document && result.document.images === 1, notes: JSON.stringify(result) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emailPlainText = cases;
})();
