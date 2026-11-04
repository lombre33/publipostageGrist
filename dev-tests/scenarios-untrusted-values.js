// Suite "untrustedValues" - la valeur d'une cellule est un TEXTE, jamais du code (consigne GFS 046 : une ligne reçue par un lien public, ou écrite par un autre collaborateur, est du texte non
// fiable ; contrats 11.6 point 9 et 11.9 point 5). Chaque cas rejoue le même jeu de valeurs piégées contre un endroit où une valeur entre dans un écran, un document, une adresse ou un fichier,
// et lit ce qui sort : le relevé de GFS-ETAT.md dit « où » et « ce que l'app en fait », cette suite le prouve.
//  1) la Lecture : la valeur est posée comme un nœud de texte (js/reader-mode.js:valueNode, resolveBadgeValue), aucune balise de la valeur n'existe ensuite, aucun gestionnaire ne part,
//     et la marque de l'app elle-même (`#Table.Colonne`, `{{Table.Colonne}}`) écrite DANS une valeur n'est pas fusionnée une seconde fois (aperçu compris : ReaderMode.preview) ;
//  2) les champs texte (objet, À, Cc, Cci, nom d'un fichier) : une seule passe (Variables.replaceTextVariables), les caractères interdits d'un nom de fichier remplacés (fileSafe) ;
//  3) les exports : Markdown (escapeText), HTML (document inerte, balises de la valeur échappées), Word (XML bien formé, rien d'ajouté), PDF (une valeur est un texte de pdfmake, ni image ni
//     lien) ;
//  4) une valeur ne devient jamais l'adresse d'un lien ou d'une image : une valeur « javascript: », « https://… » ou en Markdown n'ajoute aucun <a>, aucune <img> à la Lecture ni dans les exports ;
//  5) les règles : une valeur est COMPARÉE (opérateurs fixes), jamais évaluée, jamais lue comme un motif, jamais un identifiant de modèle ou d'annexe (js/condition-rules.js, js/macro-templates.js,
//     js/row-template.js) ;
//  6) rien ne part tout seul : une ligne piégée qui arrive ne télécharge rien, n'ouvre aucune fenêtre ni aucun lien et n'écrit rien dans Grist (js/main.js:onRecordChange).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TABLE = 'ValeursNonFiables';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // --- Les valeurs piégées ----------------------------------------------------------------------------------------------------------------------------------------------
  // Une valeur qui essaie tout ce qu'une balise, un gestionnaire d'événement, un script ou un lien Markdown peut tenter.
  const MARKUP = '<img src="x" onerror="window.__pwn=1"><' + 'script>window.__pwn=2<' + '/script><svg onload="window.__pwn=3"></svg><b>gras</b><a href="javascript:window.__pwn=4">piège</a>';
  // La marque de l'app elle-même, dans une valeur : si elle était fusionnée une seconde fois, la valeur de `Nom` (le texte piégé) reviendrait.
  const TRAP = '#' + TABLE + '.Nom et {{' + TABLE + '.Nom}} et @' + TABLE + '.Nom';
  // Une valeur qui est une adresse active ou un lien Markdown.
  const LINKISH = 'javascript:window.__pwn=5 [clic](javascript:window.__pwn=6) ![i](https://exemple.invalid/x.png) <https://exemple.invalid/auto>';
  const RECORD = { id: 1, Nom: MARKUP, Autre: TRAP, Lien: LINKISH, Genre: "x'); window.__pwn=7; //", Montant: 12 };
  const badge = (column, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${extra || ''}></span>`;
  const TEMPLATE = '<p>Nom : ' + badge('Nom') + '</p><p>Autre : ' + badge('Autre') + '</p><p>Lien : ' + badge('Lien') + '</p>';
  const withCondition = condition => ` data-condition="${JSON.stringify(condition).replace(/"/g, '&quot;')}"`;

  async function seed(h, rows) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Autre: 'Text', Lien: 'Text', Genre: 'Text', Montant: 'Numeric' });
    stub.setRows(TABLE, rows || [RECORD]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, (rows || [RECORD])[0]), TABLE);
    window.__pwn = undefined;
    await sleep(100);
  }
  const noPwn = () => window.__pwn === undefined;
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const verdict = (checks, extra) => { const failed = failedOf(checks); return { pass: failed.length === 0, notes: JSON.stringify(Object.assign({ failed }, extra || {})) }; };

  // --- 1) La Lecture --------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'untrusted_value_in_reading_is_text_never_markup_and_the_apps_own_mark_in_it_is_not_merged_again',
    description: 'Lecture et aperçu : une valeur de cellule faite de balises (<img onerror>, <script>, <svg onload>, <a href="javascript:">) s\'affiche comme texte - aucune balise de la valeur n\'existe dans la page, aucun gestionnaire ne part - et la marque de l\'app (#Table.Colonne, {{Table.Colonne}}) écrite dans une valeur reste telle quelle : elle n\'est pas fusionnée une seconde fois',
    run: async (h) => {
      await seed(h);
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(TEMPLATE, TABLE, RECORD, NO_HF);
      await sleep(200);
      const content = reader.querySelector('.reader-content');
      const shown = Array.from(content.querySelectorAll('.resolved-var')).map(el => el.textContent);
      const made = Array.from(content.querySelectorAll('img, script, svg, b, a, iframe, object, embed, [onerror], [onload]')).map(el => el.outerHTML.slice(0, 80));
      const previewHtml = await ReaderMode.preview(TEMPLATE, TABLE, RECORD);
      const parsed = new DOMParser().parseFromString(previewHtml, 'text/html');
      const madeInPreview = Array.from(parsed.body.querySelectorAll('img, script, svg, b, a, iframe, object, embed, [onerror], [onload]')).map(el => el.outerHTML.slice(0, 80));
      await sleep(150);
      return verdict({
        valuesShownAsText: JSON.stringify(shown) === JSON.stringify([MARKUP, TRAP, LINKISH]),
        noElementFromAValue: made.length === 0,
        previewHasNoElementFromAValue: madeInPreview.length === 0,
        previewKeepsTheTextOfTheValues: parsed.body.textContent.includes(MARKUP) && parsed.body.textContent.includes(TRAP) && parsed.body.textContent.includes(LINKISH),
        theMarkInAValueIsNotMergedTwice: !shown[1].includes('onerror') && shown[1] === TRAP,
        nothingRan: noPwn(),
      }, { shown, made, madeInPreview });
    },
  });

  // --- 2) Les champs texte : objet, À, Cc, Cci, nom d'un fichier ---------------------------------------------------------------------------------------------------
  cases.push({
    id: 'untrusted_value_in_text_fields_is_merged_in_one_pass_and_file_names_lose_their_forbidden_characters',
    description: 'Champs texte (objet, À, Cc, Cci, nom d\'un fichier) : les variables du modèle sont remplacées en UNE passe - la marque de l\'app écrite dans une valeur n\'est pas relue -, une valeur piégée reste du texte, et le nom d\'un fichier remplace dans chaque valeur les caractères que ses systèmes interdisent (\\ / : * ? " < > |) par « _ »',
    run: async (h) => {
      await seed(h);
      const mark = column => '#' + TABLE + '.' + column;
      const subject = await Variables.resolveTextVariables('Re : ' + mark('Autre') + ' / ' + mark('Genre'), TABLE, RECORD);
      const rich = await ReaderMode.fieldText('<p>Re : ' + badge('Autre') + ' / ' + badge('Nom') + '</p>', TABLE, RECORD);
      const fileName = await ReaderMode.resolveFilename(mark('Nom') + ' ' + mark('Autre'), TABLE, RECORD);
      const travel = await ReaderMode.resolveFilename(mark('Genre'), TABLE, Object.assign({}, RECORD, { Genre: '../../etc/passwd:*?"<>|\\x' }));
      return verdict({
        oneSingleMerge: subject === 'Re : ' + TRAP + ' / ' + RECORD.Genre,
        richFieldIsTextToo: rich === 'Re : ' + TRAP + ' / ' + MARKUP,
        fileNameHasNoForbiddenCharacter: !/[\\/:*?"<>|]/.test(fileName),
        fileNameKeepsTheTextOfTheValue: fileName.startsWith('_img src=_x_ onerror=_window.__pwn=1__') && fileName.endsWith(' ' + TRAP),
        pathSeparatorsAreReplaced: travel === '.._.._etc_passwd' + '_'.repeat(8) + 'x',
        nothingRan: noPwn(),
      }, { subject, rich, fileName, travel });
    },
  });

  // --- 3) Les exports ---------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'untrusted_value_in_exports_is_written_as_text_markdown_html_word_pdf',
    description: 'Exports Markdown, HTML, Word et PDF : une valeur piégée est écrite comme texte (Markdown : « < », « [ » et « ! » échappés ; HTML : balises échappées, aucun gestionnaire ni script de la valeur ; Word : XML bien formé, rien d\'ajouté ; PDF : un texte, ni image ni lien), et la marque de l\'app dans une valeur n\'est pas fusionnée une seconde fois',
    run: async (h) => {
      await seed(h);
      const md = await h.exportMarkdown(TEMPLATE, null, RECORD, TABLE, '');
      const htmlFile = await h.exportHtml(TEMPLATE, null, RECORD, TABLE, '');
      const doc = new DOMParser().parseFromString(htmlFile.text, 'text/html');
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const docx = await DocxExport.getDocxBlobForRecord(TEMPLATE, TABLE, RECORD, '', NO_HF, null);
      const zip = await JSZip.loadAsync(await docx.blob.arrayBuffer());
      const wordXml = await zip.file('word/document.xml').async('string');
      const word = new DOMParser().parseFromString(wordXml, 'application/xml');
      const wordText = Array.from(word.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const pdf = await h.exportPdfContent(TEMPLATE, NO_HF, undefined, { tableId: TABLE, record: RECORD });
      const pdfNodes = h.flattenPdfContent(pdf.content);
      const pdfText = pdfNodes.filter(n => typeof n.text === 'string').map(n => n.text).join('');
      await sleep(150);
      // Le Markdown relu par le lecteur Markdown de l'app (marked, js/markdown-import.js), SANS l'assainissement qui suit : ce que la valeur y ferait si elle n'était pas échappée.
      await MarkdownImport.ensureLibLoaded();
      const reread = new DOMParser().parseFromString('<body>' + new window.marked.Marked({ gfm: true, breaks: false }).parse(md.text) + '</body>', 'text/html').body;
      const madeByMarked = Array.from(reread.querySelectorAll('img, script, svg, b, strong, em, del, code, iframe, object, embed, h1, h2, h3, ul, ol, blockquote, table, [onerror], [onload]')).map(el => el.outerHTML.slice(0, 80));
      // Seule l'adresse nue d'une valeur (https://…) peut être rendue cliquable par un lecteur Markdown (l'autolien de GFM : http, https seulement), comme pour tout texte ; ni « javascript: » ni lien Markdown.
      const linksByMarked = Array.from(reread.querySelectorAll('a')).map(a => a.getAttribute('href'));
      const autreLine = md.text.split('\n').find(line => line.startsWith('Autre')) || '';
      return verdict({
        markdownRereadMakesNoElementFromAValue: madeByMarked.length === 0 && linksByMarked.every(href => /^https?:\/\//i.test(href)),
        markdownRereadGivesTheSameText: reread.textContent.includes(MARKUP) && reread.textContent.includes(TRAP) && reread.textContent.includes(LINKISH),
        markdownMarkIsNotMergedTwice: autreLine.length > 0 && !autreLine.includes('onerror'),
        htmlHasNoElementFromAValue: doc.querySelectorAll('[onerror], [onload], svg, b').length === 0 && !Array.from(doc.querySelectorAll('script')).some(s => s.textContent.includes('__pwn')) && !Array.from(doc.querySelectorAll('a[href]')).some(a => /^\s*javascript:/i.test(a.getAttribute('href'))),
        htmlKeepsTheText: doc.body.textContent.includes(MARKUP) && doc.body.textContent.includes(TRAP),
        wordXmlIsWellFormed: !word.getElementsByTagName('parsererror').length,
        wordHasTheTextAndNoLinkOrDrawing: wordText.includes(MARKUP) && word.getElementsByTagName('w:hyperlink').length === 0 && word.getElementsByTagName('w:drawing').length === 0,
        pdfHasTheTextAndNoImageOrLink: pdfText.includes('onerror') && pdfNodes.filter(n => n.image).length === 0 && pdfNodes.filter(n => n.link).length === 0,
        nothingRan: noPwn(),
      }, { markdown: md.text.slice(0, 600), madeByMarked, linksByMarked, wordText: wordText.slice(0, 200) });
    },
  });

  // --- 4) Une valeur n'est jamais l'adresse d'un lien ou d'une image ------------------------------------------------------------------------------------------
  cases.push({
    id: 'untrusted_value_never_becomes_the_address_of_a_link_or_an_image',
    description: 'Lecture, aperçu, Markdown, HTML, Word et PDF : une valeur « javascript: », « https://… » ou écrite en lien Markdown n\'ajoute ni lien ni image ; la seule adresse issue d\'une valeur est celle du lien mailto: (À, Cc, Cci, objet, corps), dont un « ? », un « & » ou un retour à la ligne n\'ajoutent ni destinataire ni champ (essai emailExport)',
    run: async (h) => {
      await seed(h);
      const only = '<p>' + badge('Lien') + '</p>';
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(only, TABLE, RECORD, NO_HF);
      await sleep(150);
      const content = reader.querySelector('.reader-content');
      const inReading = content.querySelectorAll('a, img, iframe, object, embed').length;
      const md = await h.exportMarkdown(only, null, RECORD, TABLE, '');
      const htmlFile = await h.exportHtml(only, null, RECORD, TABLE, '');
      const doc = new DOMParser().parseFromString(htmlFile.text, 'text/html');
      const docx = await DocxExport.getDocxBlobForRecord(only, TABLE, RECORD, '', NO_HF, null);
      const zip = await JSZip.loadAsync(await docx.blob.arrayBuffer());
      const relationships = zip.file('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : '';
      const pdf = await h.exportPdfContent(only, NO_HF, undefined, { tableId: TABLE, record: RECORD });
      const pdfNodes = h.flattenPdfContent(pdf.content);
      return verdict({
        readingHasNoLinkOrImage: inReading === 0,
        markdownLinkIsEscapedText: !/(^|[^\\])\]\(/.test(md.text) && !/(^|[^\\])<https?:/.test(md.text),
        htmlHasNoLinkOrImage: doc.querySelectorAll('a[href], img, iframe, object, embed').length === 0,
        wordHasNoExternalRelationship: !/Target="(?:javascript|https?:)/i.test(relationships),
        pdfHasNoLinkOrImage: pdfNodes.filter(n => n.link || n.image).length === 0,
        nothingRan: noPwn(),
      }, { inReading, markdown: md.text.slice(0, 300) });
    },
  });

  // --- 5) Les règles : une valeur est comparée, jamais évaluée --------------------------------------------------------------------------------------------------
  cases.push({
    id: 'untrusted_value_in_rules_is_compared_never_evaluated_or_read_as_a_pattern_or_an_identifier',
    description: 'Règles (conditions d\'affichage, macro-modèles, « Modèle selon la ligne ») : une valeur est comparée par des opérateurs fixes, jamais évaluée (un « ); … // » ne s\'exécute pas), jamais lue comme un motif (« .* » n\'est qu\'un texte pour « contient »), et ne choisit jamais un modèle ou une annexe par son identifiant (le modèle d\'une règle est écrit dans la règle, la valeur dit seulement si la règle tient)',
    run: async (h) => {
      await seed(h);
      const rule = (column, operator, value, extra) => Object.assign({ column, operator, value }, extra || {});
      const compare = (actual, operator, expected) => ConditionRules.compareValues(actual, operator, expected, 'Text');
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      const condition = (column, operator, value) => withCondition({ mode: 'all', rules: [rule(column, operator, value)] });
      await ReaderMode.render('<p>A ' + badge('Montant', condition('Genre', '=', RECORD.Genre)) + '</p><p>B ' + badge('Montant', condition('Genre', '=', 'autre')) + '</p>', TABLE, RECORD, NO_HF);
      await sleep(150);
      const paragraphs = Array.from(reader.querySelectorAll('.reader-content p')).map(p => p.textContent.trim());
      const slot = { type: 'conditional', rules: [rule('Genre', '=', '7', { modeleId: '70' }), rule('Genre', 'contient', '.*', { modeleId: '71' })], defaultModeleId: '72' };
      const pickWith = async genre => MacroTemplates.pickModeleId(slot, TABLE, Object.assign({}, RECORD, { Genre: genre }));
      return verdict({
        aValueEqualToTheRuleTextHolds: paragraphs[0] === 'A 12' && paragraphs[1] === 'B',
        aPatternIsPlainText: compare('abc', 'contient', '.*') === false && compare('a.*b', 'contient', '.*') === true && compare('x', 'contient', '(') === false,
        aCodeValueIsOnlyCompared: compare("x'); window.__pwn=8; //", '=', "x'); window.__pwn=8; //") === true && compare('1+1', '=', '2') === false && compare('constructor', '=', '__proto__') === false,
        theValueCannotNameAModel: (await pickWith('70')) === '72' && (await pickWith('71')) === '72',
        theRuleNamesTheModel: (await pickWith('7')) === '70' && (await pickWith('a.*b')) === '71',
        nothingRan: noPwn(),
      }, { paragraphs });
    },
  });

  // --- 6) Rien ne part tout seul ----------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'a_trapped_row_that_arrives_launches_nothing_by_itself',
    description: 'Une ligne piégée qui arrive (ou change) redessine la Lecture et rien d\'autre : aucun téléchargement, aucune fenêtre ni aucun lien ouvert, aucun courriel, aucune écriture dans Grist ; envoyer, exporter, ranger et écrire restent des gestes de la personne',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const launched = [];
      const original = { open: window.open, click: HTMLAnchorElement.prototype.click, createObjectURL: URL.createObjectURL };
      window.open = function () { launched.push('window.open'); return null; };
      HTMLAnchorElement.prototype.click = function () { launched.push('a.click ' + (this.download ? 'download' : this.href.slice(0, 40))); };
      URL.createObjectURL = function () { launched.push('createObjectURL'); return original.createObjectURL.apply(URL, arguments); };
      let writes = 0;
      try {
        stub.clearActionLog();
        // Les deux voies d'une ligne qui change : celle de la ligne sous le curseur (fireRecord) et un document qui boucle sur toutes les lignes (setRows).
        for (let i = 0; i < 3; i++) {
          stub.fireRecord(Object.assign({}, RECORD, { id: 10 + i }), TABLE);
          await sleep(120);
        }
        stub.setRows(TABLE, [RECORD, Object.assign({}, RECORD, { id: 2 })]);
        await sleep(400);
        writes = stub.getActionLog().length;
      } finally {
        window.open = original.open;
        HTMLAnchorElement.prototype.click = original.click;
        URL.createObjectURL = original.createObjectURL;
      }
      return verdict({
        nothingWasLaunched: launched.length === 0,
        nothingWasWritten: writes === 0,
        nothingRan: noPwn(),
      }, { launched, writes });
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.untrustedValues = cases;
})();
