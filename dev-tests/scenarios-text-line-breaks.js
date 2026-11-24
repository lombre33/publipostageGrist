// Suite "textLineBreaks" - un retour à la ligne dans le texte « Avant » / « Après » d'une bulle et dans les séparateurs d'une liste ou d'une boucle (demande d'Antoine du 2026-11-24 : « dans le champ qui permet de
// mettre un texte avant ou après une valeur (dans les conditions, boucles etc.), y a-t-il un moyen de mettre un retour à la ligne ? » - sa réponse à la carte : « Maj+Entrée dans le champ »). Le champ (js/grow-text.js,
// `lines`) garde un « \n » dans le texte ; ce fichier prouve ce qui se passe ensuite : ce que VariableFormat et LoopRules gardent et mêlent aux valeurs (le signe VariableFormat.LINE_BREAK pour un séparateur, le « \n »
// de l'« Avant » / « Après »), ce que la Lecture écrit (un <br>, jamais le signe lui-même), ce que lisent les champs texte (une espace), l'aller-retour du HTML et la pastille de l'éditeur, puis Word et PDF.
// Les valeurs d'une cellule qui portent leurs propres « \n » (consigne 091 de GFS) ne bougent pas : un cas le garde. Les fenêtres et le clavier réel : dev-tests/verify-line-break-fields-mouse.mjs.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'LbFactures';
  const PEOPLE = 'LbParticipants';
  const SIGN = '\u2028';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const attr = (name, value) => ` ${name}="${String(typeof value === 'string' ? value : JSON.stringify(value)).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
  // Une bulle : `extra` ajoute ses attributs (data-before, data-after, data-format, data-loop…). Un « \n » dans un attribut reste tel quel, comme dans le HTML enregistré.
  const badge = (column, extra, table) => `<span class="var-badge" data-table="${table || PAGE}" data-column="${column}" data-key="${table || PAGE}.${column}"${extra || ''}></span>`;
  const RECORD = { id: 1, Numero: 'F-041', Notes: 'ligne 1\nligne 2', Themes: ['Santé', 'Social', 'Culture'] };

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables(PEOPLE, { Facture: 'Ref:' + PAGE, Nom: 'Text' });
    stub.setVariables(PAGE, { Numero: 'Text', Notes: 'Text', Themes: 'ChoiceList', Vide: 'Text' });
    stub.setRows(PAGE, [{ id: 1, Numero: 'F-041', Notes: 'ligne 1\nligne 2', Themes: ['L', 'Santé', 'Social', 'Culture'], Vide: '' }]);
    stub.setRows(PEOPLE, [{ id: 1, Facture: 1, Nom: 'Karim' }, { id: 2, Facture: 1, Nom: 'Léa' }, { id: 3, Facture: 1, Nom: 'Sophie' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(PEOPLE);
    await GristAPI.saveLinkRule(PEOPLE, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({ Vide: '' }, RECORD), PAGE);
    await h.sleep(30);
  }
  const record = () => Object.assign({ Vide: '' }, RECORD);
  // Le texte résolu d'un paragraphe, tel que les exports le lisent : le <p> du HTML résolu.
  async function resolved(html) { return Dom.inertTemplate(await ReaderMode.preview(html, PAGE, record())).content; }
  const brCount = node => node.querySelectorAll('br').length;
  const inline = (extra) => Object.assign({ repeat: 'inline', table: PEOPLE, empty: 'hide', separator: ', ', lastSeparator: ' et ' }, extra || {});
  const loopAttrs = loop => attr('data-loop', loop) + ' data-loop-repeat="inline"';

  cases.push({
    id: 'linebreak_affix_text_keeps_one_break_and_nothing_else',
    description: 'VariableFormat.affix : un retour à la ligne se garde (« \\n », un signe de la longueur permise), « \\r\\n » devient « \\n », une tabulation ou un signe de contrôle une espace ; un retour seul est un vrai texte',
    run: async () => {
      const VF = VariableFormat;
      const long = 'x'.repeat(38) + '\ny';
      const checks = {
        kept: VF.affix('Cher\nMonsieur') === 'Cher\nMonsieur',
        crlf: VF.affix('a\r\nb') === 'a\nb' && VF.affix('a\rb') === 'a\nb',
        tab: VF.affix('a\tb') === 'a b' && VF.affix('a\u0001b') === 'a b' && VF.affix('a\u2028b') === 'a b' && VF.affix('a b') === 'a b',
        alone: VF.affix('\n') === '\n' && VF.affix('') === null && VF.affix(null) === null && VF.affix(5) === null,
        max: VF.affix(long) === long && VF.affix(long + 'z') === long && VF.affix('x'.repeat(40) + '\n') === 'x'.repeat(40),
        pair: same(VF.affixes(null, '\n'), { before: null, after: '\n' }) && VF.affixes(null, null) === null && same(VF.affixes('(', ')'), { before: '(', after: ')' }),
        aroundText: VF.withAffixes('Bob', { before: 'Cher\n', after: '\n(fin)' }) === 'Cher' + SIGN + 'Bob' + SIGN + '(fin)' && VF.withAffixes('', { before: 'Cher\n' }) === '' && VF.withAffixes('Bob', { before: ', ' }) === ', Bob',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  cases.push({
    id: 'linebreak_separators_use_their_own_sign_and_cell_breaks_stay',
    description: 'VariableFormat.listText et LoopRules.joinValues : un séparateur qui porte « \\n » écrit le signe de retour posé exprès entre les valeurs ; le « \\n » d’une valeur de cellule, lui, reste ce qu’il est ; sans retour, rien ne change',
    run: async () => {
      const VF = VariableFormat;
      const T = ['Santé', 'Social', 'Culture'];
      const checks = {
        listAll: VF.listText(T, { separator: '\n' }) === ['Santé', 'Social', 'Culture'].join(SIGN),
        listLast: VF.listText(T, { separator: ', ', lastSeparator: '\n' }) === 'Santé, Social' + SIGN + 'Culture',
        listBoth: VF.listText(T, { separator: '\n', lastSeparator: '\net ' }) === 'Santé' + SIGN + 'Social' + SIGN + 'et Culture',
        listCrlf: VF.listText(T, { separator: '\r\n' }) === T.join(SIGN),
        listPlain: VF.listText(T, { separator: ' / ', lastSeparator: ' et ' }) === 'Santé / Social et Culture' && VF.listText(T, { pick: 'first' }) === 'Santé' && VF.listText(T, {}) === 'Santé, Social, Culture',
        listCell: VF.listText(['a\nb', 'c'], { separator: ', ' }) === 'a\nb, c' && VF.listText(['a\nb', 'c'], { separator: '\n' }) === 'a\nb' + SIGN + 'c',
        join: LoopRules.joinValues(['Karim', 'Léa', 'Sophie'], '\n', ' et ') === 'Karim' + SIGN + 'Léa et Sophie' && LoopRules.joinValues(['Karim', 'Léa', 'Sophie'], ', ', '\n') === 'Karim, Léa' + SIGN + 'Sophie',
        joinPlain: LoopRules.joinValues(['Karim', 'Léa', 'Sophie'], ', ', ' et ') === 'Karim, Léa et Sophie' && LoopRules.joinValues(['a\nb', 'c'], ', ') === 'a\nb, c' && LoopRules.joinValues(['seul'], '\n') === 'seul',
        stored: same(VF.storedList({ separator: '\n' }), { separator: '\n' }) && same(VF.normalizeList({ separator: '\n' }).separator, '\n') && !VF.isDefaultList({ separator: '\n' }),
        flat: VF.flatBreaks('a' + SIGN + 'b') === 'a b' && VF.flatBreaks('a\nb') === 'a\nb' && VF.breaksOf('a\nb\r\nc') === 'a' + SIGN + 'b' + SIGN + 'c',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  cases.push({
    id: 'linebreak_reading_writes_a_real_break_around_the_value',
    description: 'Lecture : « Avant » / « Après » avec un retour à la ligne écrivent un <br> contre la valeur, dans le même élément ; une valeur vide n’en reçoit pas ; sans retour, UN nœud de texte comme avant',
    run: async (h) => {
      await seed(h);
      const one = await resolved('<p>Bonjour ' + badge('Numero', attr('data-before', 'Facture\n') + attr('data-after', '\n(à régler)')) + ' fin</p>');
      const span = one.querySelector('.resolved-var');
      const empty = await resolved('<p>[' + badge('Vide', attr('data-before', 'Facture\n') + attr('data-after', '\n(fin)')) + ']</p>');
      const plain = await resolved('<p>' + badge('Numero', attr('data-before', '(') + attr('data-after', ')')) + '</p>');
      const plainSpan = plain.querySelector('.resolved-var');
      const checks = {
        spanHasTwoBreaks: !!span && brCount(span) === 2,
        order: !!span && Array.from(span.childNodes).map(n => (n.nodeName === 'BR' ? '<br>' : n.textContent)).join('|') === 'Facture|<br>|F-041|<br>|(à régler)',
        noSign: !/[\u2028\n]/.test(one.textContent),
        words: one.textContent === 'Bonjour FactureF-041(à régler) fin',
        emptyNoBreak: brCount(empty) === 0 && empty.textContent === '[]',
        plainOneText: !!plainSpan && brCount(plainSpan) === 0 && plainSpan.textContent === '(F-041)',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, html: one.firstElementChild && one.firstElementChild.innerHTML }) };
    },
  });

  cases.push({
    id: 'linebreak_reading_list_and_loop_separators_write_breaks',
    description: 'Lecture : le séparateur d’une liste et celui d’une boucle « dans la phrase » qui portent « \\n » écrivent un <br> entre les valeurs (le signe interne n’arrive jamais dans le HTML) ; la valeur d’une cellule à plusieurs lignes reste un texte seul',
    run: async (h) => {
      await seed(h);
      const list = await resolved('<p>' + badge('Themes', attr('data-format', { list: { separator: '\n', lastSeparator: ' et\n' } })) + '</p>');
      const listSpan = list.querySelector('.resolved-var');
      const loop = await resolved('<p>' + badge('Nom', loopAttrs(inline({ separator: '\n', lastSeparator: '' })), PEOPLE) + '</p>');
      const loopSpan = loop.querySelector('.resolved-var');
      const loopLast = await resolved('<p>' + badge('Nom', loopAttrs(inline({ separator: ', ', lastSeparator: '\n' })), PEOPLE) + '</p>');
      const cell = await resolved('<p>' + badge('Notes') + '</p>');
      const cellSpan = cell.querySelector('.resolved-var');
      const plainList = await resolved('<p>' + badge('Themes') + '</p>');
      const checks = {
        listBreaks: !!listSpan && brCount(listSpan) === 2 && Array.from(listSpan.childNodes).map(n => (n.nodeName === 'BR' ? '<br>' : n.textContent)).join('|') === 'Santé|<br>|Social et|<br>|Culture',
        listNoSign: !/\u2028/.test(list.textContent),
        loopBreaks: !!loopSpan && brCount(loopSpan) === 2 && loopSpan.textContent === 'KarimLéaSophie',
        loopLast: brCount(loopLast) === 1 && loopLast.textContent === 'Karim, LéaSophie',
        loopNoSign: !/\u2028/.test(loop.textContent + loopLast.textContent),
        cellUnchanged: !!cellSpan && brCount(cellSpan) === 0 && cellSpan.textContent === 'ligne 1\nligne 2',
        plainListUnchanged: plainList.textContent === 'Santé, Social, Culture' && brCount(plainList) === 0,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, list: listSpan && listSpan.innerHTML, loop: loopSpan && loopSpan.innerHTML }) };
    },
  });

  cases.push({
    id: 'linebreak_text_fields_read_a_space_never_a_break_or_the_sign',
    description: 'Champs texte (Objet, nom du PDF) : un retour posé dans « Avant » / « Après » ou un séparateur s’y lit comme une espace, jamais deux mots collés ni le signe interne',
    run: async (h) => {
      await seed(h);
      const text = html => ReaderMode.fieldText(html, PAGE, record());
      const subject = await text('<p>Objet' + badge('Numero', attr('data-before', ' :\n') + attr('data-after', '\n!')) + '</p>');
      const list = await text('<p>' + badge('Themes', attr('data-format', { list: { separator: '\n' } })) + '</p>');
      const loop = await text('<p>' + badge('Nom', loopAttrs(inline({ separator: '\n', lastSeparator: '\nou ' })), PEOPLE) + '</p>');
      const checks = {
        subject: subject === 'Objet : F-041 !' || subject === 'Objet :  F-041 !',
        noBreaks: !/[\u2028]/.test(subject + list + loop) && !/\n/.test(subject.trim().replace(/\n/g, '')),
        list: list === 'Santé Social Culture',
        loop: loop === 'Karim Léa ou Sophie',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, subject, list, loop }) };
    },
  });

  cases.push({
    id: 'linebreak_html_round_trip_and_editor_chip',
    description: 'Le « \\n » de « Avant » / « Après » survit à l’aller-retour du HTML (attribut data-before / data-after) ; la pastille de l’éditeur le montre « ↵ » ; le séparateur d’une liste ou d’une boucle (JSON) aussi',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>x ' + badge('Numero', attr('data-before', 'Cher\nClient') + attr('data-after', '\n(fin)')) + ' ' + badge('Themes', attr('data-format', { list: { separator: '\n' } })) + ' y</p>');
      await h.sleep(50);
      const ed = EditorCore.getEditor();
      const nodes = [];
      ed.state.doc.descendants(node => { if (node.type.name === 'varBadge') nodes.push(node); });
      const saved = Editor.getHTML();
      Editor.setHTML(saved);
      await h.sleep(50);
      const again = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') again.push(node); });
      const chips = Array.from(document.querySelectorAll('.tiptap .var-badge-affix')).map(c => c.getAttribute('data-text'));
      const checks = {
        attrs: nodes.length === 2 && nodes[0].attrs.before === 'Cher\nClient' && nodes[0].attrs.after === '\n(fin)',
        saved: /data-before="Cher\nClient"/.test(saved) && /data-after="\n\(fin\)"/.test(saved),
        again: again.length === 2 && again[0].attrs.before === 'Cher\nClient' && again[0].attrs.after === '\n(fin)' && again[1].attrs.format && again[1].attrs.format.list.separator === '\n',
        chips: same(chips, ['Cher↵Client', '↵(fin)']),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, chips, saved: saved.slice(0, 400) }) };
    },
  });

  cases.push({
    id: 'linebreak_word_and_pdf_write_the_break_between_the_lines',
    description: 'Export Word et PDF : le retour posé dans « Avant » / « Après » et dans un séparateur de liste est un vrai retour de ligne (w:br dans le Word, deux lignes dans le PDF) ; sans lui, une seule ligne',
    run: async (h) => {
      await seed(h);
      const html = '<p>Facture ' + badge('Numero', attr('data-before', 'n°\n') + attr('data-after', '\n(à régler)')) + ' puis ' + badge('Themes', attr('data-format', { list: { separator: '\n' } })) + '.</p>'
        + '<p>Sans retour ' + badge('Numero', attr('data-before', '(') + attr('data-after', ')')) + '</p>';
      const out = await ReaderMode.preview(html, PAGE, record());
      const parts = await h.exportDocxParts(out);
      const paragraphs = Array.from(parts.doc.getElementsByTagName('w:p')).filter(p => p.getElementsByTagName('w:t').length);
      const brs = paragraphs.map(p => p.getElementsByTagName('w:br').length);
      const texts = paragraphs.map(p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join(''));
      const pdf = await h.exportPdfContent(out);
      const lines = h.findTextBlocks(pdf.content, b => /Facture|Santé|Social|Culture|à régler/.test(h.blockPlainText(b))).map(b => h.blockPlainText(b));
      const flat = lines.join('\n');
      const checks = {
        wordBreaks: brs.length >= 2 && brs[0] === 4 && brs[1] === 0,
        wordText: texts[0] === 'Facture n°F-041(à régler) puis SantéSocialCulture.' && texts[1] === 'Sans retour (F-041)',
        wordNoSign: !/\u2028/.test(texts.join('')),
        pdfNoSign: !/\u2028/.test(flat),
        pdfBreaks: /n°\s*\n\s*F-041|n°[\s\S]*F-041/.test(flat) && /\(à régler\)/.test(flat),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, brs, texts, lines, codes: Array.from(texts[0] || '').filter(c => c.charCodeAt(0) > 126 || c.charCodeAt(0) < 32).map(c => c.charCodeAt(0).toString(16)) }) };
    },
  });

  cases.push({
    id: 'linebreak_odt_odp_pptx_excel_markdown_and_html_write_the_break',
    description: 'Export OpenDocument (texte et présentation), PowerPoint, Excel (une case de tableau), Markdown et HTML : le retour posé dans « Avant » / « Après » ou un séparateur est une vraie ligne de plus ; une valeur de cellule à plusieurs lignes reste comme avant',
    run: async (h) => {
      await seed(h);
      await ExportEngines.loadAll();
      await ExportCommon.ensureJsZipLoaded();
      const body = '<p>Facture ' + badge('Numero', attr('data-before', 'n°\n') + attr('data-after', '\n(à régler)')) + ' puis ' + badge('Themes', attr('data-format', { list: { separator: '\n' } })) + '.</p><p>Cellule ' + badge('Notes') + '</p>';
      const cells = '<table><tbody><tr><td><p>Facture ' + badge('Numero', attr('data-before', 'n°\n') + attr('data-after', '\n(à régler)')) + '</p></td><td><p>' + badge('Themes', attr('data-format', { list: { separator: '\n' } })) + '</p></td><td><p>' + badge('Notes') + '</p></td></tr></tbody></table>';
      const unzip = async (blob, name) => { const zip = await JSZip.loadAsync(blob); return zip.file(name).async('string'); };
      const count = (text, re) => (text.match(re) || []).length;
      const rec = record();
      const odt = await unzip((await OdtExport.getOdtBlobForRecord(body, PAGE, rec, '', null, null)).blob, 'content.xml');
      const odp = await unzip((await OdpExport.getOdpBlobForRecord(body, PAGE, rec, '', null, null)).blob, 'content.xml');
      const pptx = await unzip((await PptxExport.getPptxBlobForRecord(body, PAGE, rec, '', null, null)).blob, 'ppt/slides/slide1.xml');
      const xlsx = await unzip((await XlsxExport.getXlsxBlobForRecord(cells, PAGE, rec, '', {})).blob, 'xl/sharedStrings.xml');
      const md = (await MarkdownExport.getMarkdownBlobForRecord(body, PAGE, rec, '', null)).blob;
      const mdText = await md.text();
      const html = await (await HtmlExport.getHtmlBlobForRecord(body, PAGE, rec, '', null, { fragment: true })).blob.text();
      const checks = {
        odt: count(odt, /<text:line-break\/>/g) === 5 && /Facture n°<text:line-break\/>F-041<text:line-break\/>\(à régler\) puis Santé<text:line-break\/>Social<text:line-break\/>Culture\./.test(odt),
        odp: count(odp, /<text:line-break\/>/g) === 5,
        pptx: count(pptx, /<a:br\b/g) === 5,
        excel: /<t xml:space="preserve">Facture n°\nF-041\n\(à régler\)<\/t>/.test(xlsx) && /<t xml:space="preserve">Santé\nSocial\nCulture<\/t>/.test(xlsx) && /<t xml:space="preserve">ligne 1\nligne 2<\/t>/.test(xlsx),
        markdown: mdText.startsWith('Facture n°\\\nF-041\\\n(à régler) puis Santé\\\nSocial\\\nCulture.'),
        html: html.indexOf('<p>Facture n°<br>F-041<br>(à régler) puis Santé<br>Social<br>Culture.</p>') !== -1 && html.indexOf('<p>Cellule ligne 1\nligne 2</p>') !== -1,
        noSign: ![odt, odp, pptx, xlsx, mdText, html].some(text => /\u2028/.test(text)),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, md: mdText.slice(0, 160) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.textLineBreaks = cases;
})();
