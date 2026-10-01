// Suite "varZero" - option « Si la valeur vaut zéro » de la barre flottante d'une bulle nombre (retour d'Antoine du 2026-09-30 : « par défaut si c'est un
// nombre, Grist stocke 0 et l'affiche, je ne peux pas avoir une case vide - mais dans le mode lecture et l'export j'aimerais pouvoir ne rien afficher si 0 »).
// Le réglage est `zero: 'hide'` dans le format de la bulle (js/floating-toolbars.js, `data-format`) ; js/variables.js:formatValue le lit pour TOUS les chemins
// de rendu (Lecture, en-têtes et pieds, aperçu commun au PDF, au DOCX et à l'email, lignes d'un export en lot, boucles). Défaut « Afficher 0 » : un modèle
// enregistré avant cette option se rend à l'identique. Le zéro est la valeur exacte 0, pas un nombre que l'arrondi fait afficher 0. Les autres valeurs
// s'écrivent comme tout nombre sans réglage : FR par défaut (1200 → « 1 200 »), comme la barre le montre (dev-tests/scenarios-varformat.js).
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VzFactures';
  const HIDE = { zero: 'hide' };
  const MONEY = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
  const MONEY_HIDE = Object.assign({ zero: 'hide' }, MONEY);
  // Lignes de la page telles que grist.onRecord les livre (valeurs affichées).
  const RECORD_1 = { id: 1, Ref: 'F-001', Montant: 0, Quantite: 3 };
  const RECORD_2 = { id: 2, Ref: 'F-002', Montant: 1200, Quantite: 0 };

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  function badge(column, format, table, loop) {
    const t = table || PAGE;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${t}" data-column="${column}" data-key="${t}.${column}"${format ? attr('data-format', format) : ''}${loopAttrs}></span>`;
  }
  const squash = s => String(s).replace(/\s+/g, '');

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Ref: 'Text', Montant: 'Numeric', Quantite: 'Int' });
    stub.setVariables('VzLignes', { Facture: 'Ref:VzFactures', Libelle: 'Text', Prix: 'Numeric', manualSort: 'ManualSortPos' });
    stub.setRows(PAGE, [
      { id: 1, Ref: 'F-001', Montant: 0, Quantite: 3 },
      { id: 2, Ref: 'F-002', Montant: 1200, Quantite: 0 },
    ]);
    stub.setRows('VzLignes', [
      { id: 1, Facture: 1, Libelle: 'Livret', Prix: 100, manualSort: 1 },
      { id: 2, Facture: 1, Libelle: 'Remise', Prix: 0, manualSort: 2 },
      { id: 3, Facture: 1, Libelle: 'Envoi', Prix: 25, manualSort: 3 },
      { id: 4, Facture: 2, Libelle: 'Gratuit', Prix: 0, manualSort: 4 },
    ]);
    await GristAPI.refreshSchema();
    // Les lignes de VzLignes sont celles de la facture affichée (colonne Référence Facture = id de la ligne de la page), comme le fait la fenêtre de clé.
    await GristAPI.deleteLinkRule('VzLignes');
    await GristAPI.saveLinkRule('VzLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), PAGE);
    await h.sleep(30);
  }

  async function renderReader(html, record, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, hf || NO_HF);
    return reader;
  }
  // Texte de chaque bulle résolue du corps, dans l'ordre du modèle.
  const resolvedTexts = reader => Array.from(reader.querySelectorAll('.reader-content .resolved-var')).map(e => e.textContent);
  async function previewBox(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, record);
    return box;
  }
  const rowTexts = table => Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join(' | '));

  // --- Le zéro exact, et lui seul ---
  cases.push({
    id: 'varzero_is_zero_reads_only_the_value_zero',
    description: 'VariableFormat.isZero : le nombre 0 (et -0), un texte qui ne s’écrit que 0 (« 0 », « 0,00 », « 0.0 ») ; pas 0,004, pas un nombre non nul, pas du texte, pas une valeur vide',
    run: async () => {
      const zeros = [0, -0, '0', ' 0 ', '0,00', '0.0', '-0', '00'];
      const others = [0.004, -0.5, 5, 1200, '', '  ', null, undefined, NaN, 'abc', '0abc', '0,5', '10', true, [0], {}];
      const wrongZeros = zeros.filter(v => !VariableFormat.isZero(v));
      const wrongOthers = others.filter(v => VariableFormat.isZero(v));
      return { pass: wrongZeros.length === 0 && wrongOthers.length === 0, notes: JSON.stringify({ wrongZeros, wrongOthers: wrongOthers.map(String) }) };
    },
  });

  // --- Variables.formatValue : ce que l'option change, et tout ce qu'elle ne change pas ---
  cases.push({
    id: 'varzero_format_value_hides_only_the_zero_and_keeps_everything_else_as_before',
    description: 'formatValue : « Ne rien afficher » vide un 0 (nombre, devise, décimales, toutes lettres) et le retire d’une liste sans virgule en trop ; choisie seule elle laisse les autres valeurs à l’écriture par défaut d’un nombre (1200 → « 1 200 ») ; sans l’option, ou avec « Afficher 0 », un 0 s’écrit comme avant',
    run: async (h) => {
      await seed(h);
      const fv = (v, f) => Variables.formatValue(v, f, PAGE, 'Montant');
      const got = {
        zeroAlone: fv(0, HIDE), otherAlone: fv(1200, HIDE), fractionAlone: fv(0.5, HIDE), negativeAlone: fv(-3, HIDE),
        zeroMoney: fv(0, MONEY_HIDE), otherMoney: fv(1200, MONEY_HIDE), fractionMoney: fv(0.004, MONEY_HIDE),
        zeroWords: fv(0, { type: 'number', words: true, zero: 'hide' }), otherWords: fv(21, { type: 'number', words: true, zero: 'hide' }),
        zeroText: fv('0,00', HIDE), list: fv([10, 0, 5], HIDE), allZeros: fv([0, 0], HIDE), listMoney: fv([10, 0], MONEY_HIDE), empty: fv(null, HIDE),
        // Sans l'option : exactement ce que rendaient les modèles d'avant.
        noFormat: fv(0, null), noFormatOther: fv(1200, null), moneyZero: fv(0, MONEY), zeroShown: fv(0, { zero: 'show' }), zeroNull: fv(0, { zero: null }),
        wordsZero: fv(0, { type: 'number', words: true }), listShown: fv([10, 0, 5], MONEY),
      };
      const expected = {
        zeroAlone: '', otherAlone: '1\u00a0200', fractionAlone: '0,5', negativeAlone: '-3',
        zeroMoney: '', otherMoney: VariableFormat.formatNumber(1200, MONEY), fractionMoney: VariableFormat.formatNumber(0.004, MONEY),
        zeroWords: '', otherWords: 'vingt et un', zeroText: '', list: '10, 5', allZeros: '', listMoney: VariableFormat.formatNumber(10, MONEY), empty: '',
        noFormat: '0', noFormatOther: '1\u00a0200', moneyZero: VariableFormat.formatNumber(0, MONEY), zeroShown: '0', zeroNull: '0',
        wordsZero: 'zéro', listShown: [10, 0, 5].map(v => VariableFormat.formatNumber(v, MONEY)).join(', '),
      };
      // Une date dont l'ancien réglage nombre traîne : la valeur 0 (1er janvier 1970) reste une date.
      const preset = VariableFormat.DATE_PRESETS[0].key;
      got.staleOnDate = Variables.formatValue(0, { type: 'date', preset, zero: 'hide' }, PAGE, 'Naissance');
      expected.staleOnDate = VariableFormat.formatDate(0, { type: 'date', preset });
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0 && expected.staleOnDate !== '', notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  // --- La barre flottante : le réglage, sa forme enregistrée, l'aller-retour du modèle ---
  cases.push({
    id: 'varzero_toolbar_option_sets_the_format_without_turning_number_formatting_on',
    description: 'La barre d’une bulle nombre propose « Afficher 0 » (par défaut) / « Ne rien afficher » ; choisir seulement cela pose {zero:"hide"} sans `type` (les autres valeurs gardent leur écriture), les autres réglages le gardent, revenir à « Afficher 0 » le retire (format vide si rien d’autre), le modèle enregistré le retrouve, le panneau reste ouvert',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables(PAGE, { Ref: 'Text', Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML(`<p>Montant : ${badge('Montant')}</p>`);
      const ed = EditorCore.getEditor();
      const badgeNode = () => { let found = null; ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') found = n; }); return found; };
      const select = () => {
        document.querySelector('.tiptap').focus();
        let pos = -1;
        ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
        ed.commands.setNodeSelection(pos);
      };
      select();
      await h.sleep(150);
      const panel = document.querySelector('.v2-varfmt-toolbar');
      const zero = panel.querySelector('[data-var-panel="number"] select[data-role="num-zero"]');
      if (!panel.classList.contains('visible') || !zero) return { pass: false, notes: 'panneau nombre ou réglage « zéro » introuvable', panelVisible: panel.classList.contains('visible') };
      const initial = { value: zero.value, options: Array.from(zero.options).map(o => o.value + ':' + o.textContent), title: zero.title, aria: zero.getAttribute('aria-label') };
      // Comme les autres réglages de la barre : le focus a quitté l'éditeur, le panneau doit survivre.
      ed.view.dom.blur();
      await h.sleep(30);
      const choose = async value => { zero.value = value; zero.dispatchEvent(new Event('input', { bubbles: true })); await h.sleep(60); };
      await choose('hide');
      const afterHide = { format: badgeNode().attrs.format, visible: panel.classList.contains('visible') };
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const serialized = box.querySelector('span.var-badge').getAttribute('data-format');
      Editor.setHTML(html);
      const roundTrip = badgeNode().attrs.format;
      select();
      await h.sleep(150);
      const shownAfterReload = zero.value;
      // Un autre réglage nombre ensuite : la clé du zéro reste, `type` est posé par ce réglage.
      panel.querySelector('button[data-action="num-style:us"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(60);
      const afterStyle = badgeNode().attrs.format;
      await choose('show');
      const backWithStyle = badgeNode().attrs.format;
      // Une bulle qui n'a que ce réglage retrouve un format vide en le retirant : plus de data-format dans le modèle.
      Editor.setHTML(`<p>Montant : ${badge('Montant')}</p>`);
      select();
      await h.sleep(120);
      await choose('hide');
      await choose('show');
      const emptyAgain = badgeNode().attrs.format;
      const emptyHtml = document.createElement('div');
      emptyHtml.innerHTML = Editor.getHTML();
      const stillSerialized = emptyHtml.querySelector('span.var-badge').hasAttribute('data-format');
      const en = (() => { const before = I18n.getLang(); I18n.setLang('en'); const t = [I18n.t('varFmt.zero'), I18n.t('varFmt.zeroShow'), I18n.t('varFmt.zeroHide')]; I18n.setLang(before); return t; })();
      const checks = {
        defaultIsShow: initial.value === 'show',
        fr: JSON.stringify(initial.options) === JSON.stringify(['show:Afficher 0', 'hide:Ne rien afficher']) && initial.title === 'Si la valeur vaut zéro' && initial.aria === 'Si la valeur vaut zéro',
        en: JSON.stringify(en) === JSON.stringify(['If the value is zero', 'Show 0', 'Show nothing']),
        hideAlone: JSON.stringify(afterHide.format) === JSON.stringify({ zero: 'hide' }) && afterHide.visible,
        serialized: !!serialized && JSON.parse(serialized).zero === 'hide',
        roundTrip: roundTrip && roundTrip.zero === 'hide' && shownAfterReload === 'hide',
        keptByOtherSettings: !!afterStyle && afterStyle.zero === 'hide' && afterStyle.type === 'number' && afterStyle.style === 'us',
        removedKeepsRest: !!backWithStyle && !('zero' in backWithStyle) && backWithStyle.type === 'number' && backWithStyle.style === 'us',
        emptyAgain: emptyAgain === null && !stillSerialized,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, initial, afterHide, serialized, roundTrip, afterStyle, backWithStyle, emptyAgain, en }) };
    },
  });

  // --- Lecture : corps et pied de page ---
  cases.push({
    id: 'varzero_reading_mode_body_and_footer',
    description: 'Mode Lecture : la bulle « Ne rien afficher » est vide pour un 0 (nombre, devise comprise) et s’écrit comme d’habitude pour une autre valeur ; une bulle sans l’option affiche toujours 0 ; même règle dans le pied de page',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badge('Montant', HIDE)}|${badge('Montant')}|${badge('Quantite', MONEY_HIDE)}|${badge('Quantite', MONEY)}|${badge('Ref')}</p>`;
      const first = resolvedTexts(await renderReader(html, RECORD_1));
      const second = resolvedTexts(await renderReader(html, RECORD_2));
      const expectedFirst = ['', '0', VariableFormat.formatNumber(3, MONEY), VariableFormat.formatNumber(3, MONEY), 'F-001'];
      const expectedSecond = ['1\u00a0200', '1\u00a0200', '', VariableFormat.formatNumber(0, MONEY), 'F-002'];
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Reste dû : ${badge('Montant', HIDE)} €</p>`, first: '' } };
      h.setA4Preview(true);
      await h.sleep(60);
      const footerOf = async record => {
        const reader = await renderReader('<p>Corps</p>', record, hf);
        const edge = reader.querySelector('.v2-page-edge-bottom');
        return edge ? edge.textContent.replace(/\s+/g, ' ').trim() : null;
      };
      const footers = [await footerOf(RECORD_1), await footerOf(RECORD_2)];
      h.setA4Preview(false);
      const pass = JSON.stringify(first) === JSON.stringify(expectedFirst) && JSON.stringify(second) === JSON.stringify(expectedSecond)
        && footers[0] === 'Reste dû : €' && footers[1] === 'Reste dû : 1 200 €';
      return { pass, notes: JSON.stringify({ first, second, footers }) };
    },
  });

  // --- Lignes liées : cases d'un tableau et bulle en boucle dans la phrase ---
  cases.push({
    id: 'varzero_loop_table_cells_and_inline_values',
    description: 'Une boucle sur les lignes liées : la case du tableau d’un prix à 0 reste vide (Lecture et export), et dans la phrase les valeurs à 0 sont sautées - toutes à 0, c’est le texte « si aucune ligne » de la boucle qui s’affiche',
    run: async (h) => {
      await seed(h);
      const rowLoop = { repeat: 'row', table: 'VzLignes', empty: 'header' };
      const inlineLoop = { repeat: 'inline', table: 'VzLignes', empty: 'text', emptyText: 'aucun frais', separator: ', ', lastSeparator: ' et ' };
      const cell = content => `<td><p>${content}</p></td>`;
      const html = '<table><tbody>'
        + '<tr><th><p>Libellé</p></th><th><p>Prix</p></th></tr>'
        + `<tr>${cell(badge('Libelle', null, 'VzLignes', rowLoop))}${cell(badge('Prix', HIDE, 'VzLignes'))}</tr>`
        + `</tbody></table><p>Frais : ${badge('Prix', HIDE, 'VzLignes', inlineLoop)}.</p>`;
      // La phrase est le paragraphe posé sous le tableau, pas ceux des cases.
      const sentenceOf = root => Array.from(root.children).filter(c => c.tagName === 'P').pop();
      const read = async record => {
        const content = (await renderReader(html, record)).querySelector('.reader-content');
        return { rows: rowTexts(content.querySelector('table')), sentence: sentenceOf(content).textContent };
      };
      const exported = async record => {
        const box = await previewBox(html, record);
        return { rows: rowTexts(box.querySelector('table')), sentence: sentenceOf(box).textContent };
      };
      const got = { readFirst: await read(RECORD_1), readSecond: await read(RECORD_2), exportFirst: await exported(RECORD_1), exportSecond: await exported(RECORD_2) };
      const firstOk = r => JSON.stringify(r.rows) === JSON.stringify(['Libellé | Prix', 'Livret | 100', 'Remise | ', 'Envoi | 25']) && r.sentence === 'Frais : 100 et 25.';
      const secondOk = r => JSON.stringify(r.rows) === JSON.stringify(['Libellé | Prix', 'Gratuit | ']) && r.sentence === 'Frais : aucun frais.';
      const pass = firstOk(got.readFirst) && firstOk(got.exportFirst) && secondOk(got.readSecond) && secondOk(got.exportSecond);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // --- Exports : l'aperçu commun, la ligne d'un lot (fetchTable), l'en-tête/pied, puis le vrai PDF et le vrai DOCX ---
  async function pdfText(h, blob) {
    await h.ensurePdfJsLoaded();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(it => it.str).join(' ');
    return text;
  }
  async function docxTexts(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const textOf = async name => {
      const xml = new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
      return Array.from(xml.getElementsByTagName('w:t')).map(t => t.textContent).join('');
    };
    const footerParts = Object.keys(zip.files).filter(n => /^word\/footer\d*\.xml$/.test(n));
    const footers = [];
    for (const name of footerParts) footers.push(await textOf(name));
    return { body: await textOf('word/document.xml'), footers };
  }
  cases.push({
    id: 'varzero_exports_preview_batch_row_footer_pdf_and_docx',
    description: 'Export : l’aperçu commun (ReaderMode.preview), la ligne brute d’un lot (fetchTable), le pied résolu, le fichier PDF et le fichier DOCX ne contiennent plus le 0 masqué, et gardent la valeur non nulle et le texte autour',
    run: async (h) => {
      await seed(h);
      const html = `<p>Montant : ${badge('Montant', HIDE)} EUR - Qté ${badge('Quantite', HIDE)}.</p>`;
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Solde : ${badge('Montant', HIDE)} EUR</p>`, first: '' } };
      const rows = await GristAPI.fetchTableRows(PAGE);
      const [batchFirst, batchSecond] = [rows.find(r => r.id === 1), rows.find(r => r.id === 2)];
      const previews = {
        first: squash((await previewBox(html, RECORD_1)).textContent), second: squash((await previewBox(html, RECORD_2)).textContent),
        batchFirst: squash((await previewBox(html, batchFirst)).textContent), batchSecond: squash((await previewBox(html, batchSecond)).textContent),
      };
      const zoneBox = document.createElement('div');
      zoneBox.innerHTML = (await ExportCommon.resolveHeaderFooterVariables(hf, PAGE, RECORD_1)).footer.default;
      const zoneFirst = squash(zoneBox.textContent);
      await PdfExport.ensurePdfLibsLoaded();
      const pdf1 = squash(await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, PAGE, RECORD_1, '', hf, undefined)).blob));
      const pdf2 = squash(await pdfText(h, (await PdfExport.getNativePdfBlobForRecord(html, PAGE, RECORD_2, '', hf, undefined)).blob));
      await DocxExport.ensureDocxLibLoaded();
      const docx1 = await docxTexts((await DocxExport.getDocxBlobForRecord(html, PAGE, RECORD_1, '', hf, null)).blob);
      const docx2 = await docxTexts((await DocxExport.getDocxBlobForRecord(html, PAGE, RECORD_2, '', hf, null)).blob);
      // Ligne 1 : Montant 0 masqué, Quantité 3 ; ligne 2 : Montant 1200, Quantité 0 masquée.
      const first = 'Montant:EUR-Qté3.', second = 'Montant:1200EUR-Qté.';
      const checks = {
        previews: previews.first === first && previews.batchFirst === first && previews.second === second && previews.batchSecond === second,
        footerZone: zoneFirst === 'Solde:EUR',
        pdf: pdf1.includes(first) && pdf1.includes('Solde:EUR') && !pdf1.includes('Montant:0') && !pdf1.includes('Solde:0') && pdf2.includes(second) && pdf2.includes('Solde:1200EUR'),
        docx: squash(docx1.body).includes(first) && docx1.footers.some(f => squash(f) === 'Solde:EUR') && !squash(docx1.body).includes('Montant:0')
          && squash(docx2.body).includes(second) && docx2.footers.some(f => squash(f) === 'Solde:1200EUR'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, previews, zoneFirst, pdf1: pdf1.slice(0, 200), pdf2: pdf2.slice(0, 200), docx1, docx2 }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varZero = cases;
})();
