// Suite "varZero" - le zéro d'une bulle nombre (retours d'Antoine : 2026-09-30 « par défaut si c'est un nombre, Grist stocke 0 et l'affiche, je ne peux pas avoir une
// case vide - mais dans le mode lecture et l'export j'aimerais pouvoir ne rien afficher si 0 » ; 2026-10-01 « plutôt qu'un menu, une icône en bascule » - le choix
// « 0 qui devient Ø » - « et par défaut, ne pas afficher 0 »). Un nombre qui vaut 0 ne s'écrit pas du tout dans une colonne Numérique ou Entier, sauf si la bulle
// porte `zero: 'show'` (le bouton de la barre flottante, js/floating-toolbars.js) ; `zero: 'hide'`, posé par l'ancien menu, dit la même chose que l'absence de réglage.
// js/variables.js:formatValue lit la règle pour TOUS les chemins de rendu (Lecture, en-têtes et pieds, aperçu commun au PDF, au DOCX et à l'email, lignes d'un export
// en lot, boucles). Le zéro est la valeur exacte 0, pas un nombre que l'arrondi fait afficher 0. Les champs texte (Objet, À, Cc, Cci, nom du PDF) gardent le 0.
// Les autres valeurs s'écrivent comme tout nombre sans réglage : FR par défaut (1200 → « 1 200 », dev-tests/scenarios-var-number-default.js).
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VzFactures';
  const NBSP = ' ';
  const SHOW = { zero: 'show' };
  const OLD_HIDE = { zero: 'hide' };
  const MONEY = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
  const MONEY_SHOW = Object.assign({ zero: 'show' }, MONEY);
  const MONEY_OLD_HIDE = Object.assign({ zero: 'hide' }, MONEY);
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
    stub.setVariables(PAGE, { Ref: 'Text', Montant: 'Numeric', Quantite: 'Int', Naissance: 'Date' });
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

  // --- Variables.formatValue / zeroHidden : la règle, sans réglage, avec « afficher », avec l'ancien « ne rien afficher » ---
  cases.push({
    id: 'varzero_a_zero_is_hidden_by_default_in_number_columns_and_nowhere_else',
    description: 'formatValue sans aucun réglage : un 0 ne s’écrit pas dans une colonne Numérique ou Entier (nombre, devise, décimales, toutes lettres), il est retiré d’une liste sans virgule en trop, un autre nombre s’écrit comme d’habitude ; « afficher » (zero:"show") le rend ; l’ancien zero:"hide" fait comme le défaut ; une colonne Texte, une date, un format date, une cellule sans colonne connue, un champ texte et la liste des attributs gardent leur 0',
    run: async (h) => {
      await seed(h);
      const fv = (v, f, col, opts) => Variables.formatValue(v, f, PAGE, col || 'Montant', opts);
      const preset = VariableFormat.DATE_PRESETS[0].key;
      const WORDS = { type: 'number', words: true };
      const got = {
        zero: fv(0, null), zeroInt: fv(0, null, 'Quantite'), other: fv(1200, null), fraction: fv(0.5, null), negative: fv(-3, null),
        zeroMoney: fv(0, MONEY), roundedToZero: fv(0.004, MONEY), zeroWords: fv(0, WORDS), otherWords: fv(21, WORDS),
        zeroText: fv('0,00', null), list: fv([10, 0, 5], null), allZeros: fv([0, 0], null), listMoney: fv([10, 0], MONEY), empty: fv(null, null),
        // « Afficher » : le zéro s'écrit, comme tout autre nombre.
        shown: fv(0, SHOW), shownMoney: fv(0, MONEY_SHOW), shownWords: fv(0, Object.assign({ zero: 'show' }, WORDS)), shownList: fv([10, 0, 5], SHOW), shownOther: fv(1200, SHOW),
        // Le menu de la veille posait zero:'hide' : même effet que rien du tout.
        oldHide: fv(0, OLD_HIDE), oldHideOther: fv(1200, OLD_HIDE), oldHideMoney: fv(0, MONEY_OLD_HIDE),
        // Ce que la règle ne touche pas.
        textColumn: fv('0', null, 'Ref'), dateColumn: fv(0, null, 'Naissance'), dateFormat: fv(0, { type: 'date', preset, zero: 'hide' }, 'Naissance'),
        noColumn: Variables.formatValue(0, null, null, null), rawNumbers: fv(0, null, 'Montant', { rawNumbers: true }), keepZero: fv(0, null, 'Montant', { keepZero: true }),
        keepZeroList: fv([100, 0, 25], null, 'Montant', { keepZero: true }),
      };
      const expected = {
        zero: '', zeroInt: '', other: '1' + NBSP + '200', fraction: '0,5', negative: '-3',
        zeroMoney: '', roundedToZero: VariableFormat.formatNumber(0.004, MONEY), zeroWords: '', otherWords: 'vingt et un',
        zeroText: '', list: '10, 5', allZeros: '', listMoney: VariableFormat.formatNumber(10, MONEY), empty: '',
        shown: '0', shownMoney: VariableFormat.formatNumber(0, MONEY), shownWords: 'zéro', shownList: '10, 0, 5', shownOther: '1' + NBSP + '200',
        oldHide: '', oldHideOther: '1' + NBSP + '200', oldHideMoney: '',
        textColumn: '0', dateColumn: VariableFormat.formatDate(0, { type: 'date', preset }), dateFormat: VariableFormat.formatDate(0, { type: 'date', preset }),
        noColumn: '0', rawNumbers: '0', keepZero: '0', keepZeroList: '100, 0, 25',
      };
      // La règle que lit aussi la barre flottante (Variables.zeroHidden) : même réponse que le rendu.
      const rule = [[null, 'Numeric', true], [null, 'Int', true], [{}, 'Numeric', true], [null, 'Text', false], [null, 'Date', false], [SHOW, 'Numeric', false],
        [OLD_HIDE, 'Numeric', true], [MONEY, 'Numeric', true], [MONEY_SHOW, 'Int', false], [{ type: 'date', preset }, 'Numeric', false], [null, null, false]];
      const wrongRule = rule.filter(([format, type, hidden]) => Variables.zeroHidden(format, type) !== hidden).map(([format, type]) => [JSON.stringify(format), type]);
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0 && wrongRule.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]), wrongRule }) };
    },
  });

  // --- La barre flottante : un bouton à deux états (0 / Ø), enfoncé par défaut ---
  cases.push({
    id: 'varzero_toolbar_toggle_button_shows_the_state_and_flips_it_without_turning_number_formatting_on',
    description: 'La barre d’une bulle nombre a un bouton « Ne rien afficher si la valeur vaut zéro » : enfoncé avec un 0 barré tant que rien n’est réglé (le défaut), relâché avec un 0 quand la bulle l’affiche, la barre restant ouverte après un appui sur le dessin du bouton ; un clic pose {zero:"show"} SANS `type` (les autres valeurs gardent leur écriture) puis le retire ; les autres réglages le gardent ; le modèle enregistré le retrouve ; une bulle de l’ancien menu (zero:"hide") se montre enfoncée',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables(PAGE, { Ref: 'Text', Montant: 'Numeric' });
      await GristAPI.refreshSchema();
      Editor.setHTML(`<p>Montant : ${badge('Montant')}</p>`);
      const ed = EditorCore.getEditor();
      const badgeNode = () => { let found = null; ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') found = n; }); return found; };
      const select = async () => {
        document.querySelector('.tiptap').focus();
        let pos = -1;
        ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
        ed.commands.setNodeSelection(pos);
        await h.sleep(150);
      };
      await select();
      const panel = document.querySelector('.v2-varfmt-toolbar');
      const button = () => panel.querySelector('[data-var-panel="number"] button[data-action="num-zero"]');
      if (!panel.classList.contains('visible') || !button()) return { pass: false, notes: 'panneau nombre ou bouton « zéro » introuvable, panneau visible : ' + panel.classList.contains('visible') };
      // Le trait du 0 est visible tant que son attribut `display` n'est pas « none » ; l'appui part du dessin (l'ovale) et non du bouton : c'est là que tombe un vrai clic, et
      // un bouton dont le SVG serait remplacé pendant l'appui perdrait sa cible (le filet de editor-core.js refermerait alors la barre).
      const state = () => { const path = button().querySelector('svg path'); return { active: button().classList.contains('is-active'), pressed: button().getAttribute('aria-pressed'), slash: !!path && path.getAttribute('display') !== 'none', ellipse: !!button().querySelector('svg ellipse') }; };
      const press = async () => { button().querySelector('svg ellipse').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await h.sleep(80); };
      const initial = Object.assign(state(), { title: button().title, aria: button().getAttribute('aria-label'), select: !!panel.querySelector('select[data-role="num-zero"]') });
      // Comme les autres réglages de la barre : le focus a quitté l'éditeur, le panneau doit survivre.
      ed.view.dom.blur();
      await h.sleep(30);
      await press();
      const afterShow = Object.assign(state(), { format: badgeNode().attrs.format, visible: panel.classList.contains('visible') });
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const serialized = box.querySelector('span.var-badge').getAttribute('data-format');
      Editor.setHTML(html);
      const roundTrip = badgeNode().attrs.format;
      await select();
      const afterReload = state();
      // Un autre réglage nombre ensuite : la clé du zéro reste, `type` est posé par ce réglage.
      panel.querySelector('button[data-action="num-style:us"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(60);
      const afterStyle = badgeNode().attrs.format;
      await press();
      const backWithStyle = badgeNode().attrs.format;
      const backState = state();
      // Une bulle qui n'a que ce réglage retrouve un format vide en le retirant : plus de data-format dans le modèle.
      Editor.setHTML(`<p>Montant : ${badge('Montant')}</p>`);
      await select();
      await press();
      await press();
      const emptyAgain = badgeNode().attrs.format;
      const emptyHtml = document.createElement('div');
      emptyHtml.innerHTML = Editor.getHTML();
      const stillSerialized = emptyHtml.querySelector('span.var-badge').hasAttribute('data-format');
      // Un modèle enregistré avec l'ancien menu : la barre le montre enfoncé, un clic l'affiche.
      Editor.setHTML(`<p>Montant : ${badge('Montant', OLD_HIDE)}</p>`);
      await select();
      const legacyState = state();
      await press();
      const legacyAfter = badgeNode().attrs.format;
      const en = (() => { const before = I18n.getLang(); I18n.setLang('en'); const t = I18n.t('varFmt.zero'); I18n.setLang(before); return t; })();
      const checks = {
        noMoreMenu: !initial.select,
        defaultIsPressedWithSlash: initial.active && initial.pressed === 'true' && initial.slash && initial.ellipse,
        fr: initial.title === 'Ne rien afficher si la valeur vaut zéro' && initial.aria === 'Ne rien afficher si la valeur vaut zéro',
        en: en === 'Show nothing if the value is zero',
        showAlone: JSON.stringify(afterShow.format) === JSON.stringify({ zero: 'show' }) && afterShow.visible && !afterShow.active && afterShow.pressed === 'false' && !afterShow.slash && afterShow.ellipse,
        serialized: !!serialized && JSON.parse(serialized).zero === 'show',
        roundTrip: !!roundTrip && roundTrip.zero === 'show' && !afterReload.active && afterReload.pressed === 'false',
        keptByOtherSettings: !!afterStyle && afterStyle.zero === 'show' && afterStyle.type === 'number' && afterStyle.style === 'us',
        removedKeepsRest: !!backWithStyle && !('zero' in backWithStyle) && backWithStyle.type === 'number' && backWithStyle.style === 'us' && backState.active && backState.slash,
        emptyAgain: emptyAgain === null && !stillSerialized,
        legacyShownPressed: legacyState.active && legacyState.pressed === 'true' && legacyState.slash && JSON.stringify(legacyAfter) === JSON.stringify({ zero: 'show' }),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, initial, afterShow, serialized, roundTrip, afterReload, afterStyle, backWithStyle, backState, emptyAgain, legacyState, legacyAfter, en }) };
    },
  });

  // --- Lecture : corps et pied de page ---
  cases.push({
    id: 'varzero_reading_mode_body_and_footer',
    description: 'Mode Lecture : sans réglage, la bulle d’un nombre est vide pour un 0 (devise comprise) et s’écrit comme d’habitude pour une autre valeur ; « afficher » écrit le 0 ; même règle dans le pied de page',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badge('Montant')}|${badge('Montant', SHOW)}|${badge('Quantite', MONEY)}|${badge('Quantite', MONEY_SHOW)}|${badge('Montant', OLD_HIDE)}|${badge('Ref')}</p>`;
      const first = resolvedTexts(await renderReader(html, RECORD_1));
      const second = resolvedTexts(await renderReader(html, RECORD_2));
      const expectedFirst = ['', '0', VariableFormat.formatNumber(3, MONEY), VariableFormat.formatNumber(3, MONEY), '', 'F-001'];
      const expectedSecond = ['1' + NBSP + '200', '1' + NBSP + '200', '', VariableFormat.formatNumber(0, MONEY), '1' + NBSP + '200', 'F-002'];
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Reste dû : ${badge('Montant')} €</p>`, first: '' } };
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
    description: 'Une boucle sur les lignes liées : la case du tableau d’un prix à 0 reste vide (Lecture et export) sauf pour la colonne réglée sur « afficher », et dans la phrase les valeurs à 0 sont sautées - toutes à 0, c’est le texte « si aucune ligne » de la boucle qui s’affiche',
    run: async (h) => {
      await seed(h);
      const rowLoop = { repeat: 'row', table: 'VzLignes', empty: 'header' };
      const inlineLoop = { repeat: 'inline', table: 'VzLignes', empty: 'text', emptyText: 'aucun frais', separator: ', ', lastSeparator: ' et ' };
      const cell = content => `<td><p>${content}</p></td>`;
      const html = '<table><tbody>'
        + '<tr><th><p>Libellé</p></th><th><p>Prix</p></th><th><p>Prix affiché</p></th></tr>'
        + `<tr>${cell(badge('Libelle', null, 'VzLignes', rowLoop))}${cell(badge('Prix', null, 'VzLignes'))}${cell(badge('Prix', SHOW, 'VzLignes'))}</tr>`
        + `</tbody></table><p>Frais : ${badge('Prix', null, 'VzLignes', inlineLoop)}.</p>`;
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
      const firstOk = r => JSON.stringify(r.rows) === JSON.stringify(['Libellé | Prix | Prix affiché', 'Livret | 100 | 100', 'Remise |  | 0', 'Envoi | 25 | 25']) && r.sentence === 'Frais : 100 et 25.';
      const secondOk = r => JSON.stringify(r.rows) === JSON.stringify(['Libellé | Prix | Prix affiché', 'Gratuit |  | 0']) && r.sentence === 'Frais : aucun frais.';
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
    description: 'Export : l’aperçu commun (ReaderMode.preview), la ligne brute d’un lot (fetchTable), le pied résolu, le fichier PDF et le fichier DOCX ne contiennent pas le 0 d’une bulle sans réglage, gardent celui d’une bulle réglée sur « afficher », la valeur non nulle et le texte autour',
    run: async (h) => {
      await seed(h);
      const html = `<p>Montant : ${badge('Montant')} EUR - Qté ${badge('Quantite')}.</p><p>Solde : ${badge('Montant', SHOW)}.</p>`;
      const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: `<p>Solde : ${badge('Montant')} EUR</p>`, first: '' } };
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
      // Ligne 1 : Montant 0 masqué par défaut, Quantité 3, « Solde » affiché 0 ; ligne 2 : Montant 1200, Quantité 0 masquée.
      const first = 'Montant:EUR-Qté3.Solde:0.', second = 'Montant:1200EUR-Qté.Solde:1200.';
      const checks = {
        previews: previews.first === first && previews.batchFirst === first && previews.second === second && previews.batchSecond === second,
        footerZone: zoneFirst === 'Solde:EUR',
        pdf: pdf1.includes(first) && pdf1.includes('Solde:EUR') && !pdf1.includes('Montant:0') && pdf2.includes(second) && pdf2.includes('Solde:1200EUR'),
        docx: squash(docx1.body).includes(first) && docx1.footers.some(f => squash(f) === 'Solde:EUR') && !squash(docx1.body).includes('Montant:0')
          && squash(docx2.body).includes(second) && docx2.footers.some(f => squash(f) === 'Solde:1200EUR'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, previews, zoneFirst, pdf1: pdf1.slice(0, 200), pdf2: pdf2.slice(0, 200), docx1, docx2 }) };
    },
  });

  // --- Ce qui garde son 0 : les champs texte et la liste des attributs d'une ligne liée ---
  cases.push({
    id: 'varzero_text_fields_and_attribute_list_keep_the_zero',
    description: 'Les champs texte (Objet, À, Cc, Cci du mode email, nom du fichier PDF) écrivent le 0 tel quel, et la fenêtre « Autres attributs » montre le 0 de la ligne liée : c’est la donnée, pas ce que la bulle insérée écrira',
    run: async (h) => {
      await seed(h);
      const subject = await Variables.resolveTextVariables(`Solde #${PAGE}.Montant - #${PAGE}.Quantite`, PAGE, RECORD_1);
      const filename = await ReaderMode.resolveFilename(`Solde_#${PAGE}.Montant`, PAGE, RECORD_1);
      // Fenêtre des autres attributs de la bulle « Prix » (lignes liées : 100, 0 et 25).
      Editor.setHTML(`<p>Prix : ${badge('Prix', null, 'VzLignes')}</p>`);
      const ed = EditorCore.getEditor();
      document.querySelector('.tiptap').focus();
      let pos = -1;
      ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
      ed.commands.setNodeSelection(pos);
      await h.sleep(150);
      document.querySelector('.v2-varfmt-toolbar button[data-action="var-linked"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(400);
      const modal = document.getElementById('var-linked-modal');
      const row = modal && modal.querySelector('.var-linked-row[data-col="Prix"] .var-linked-value');
      const listed = row ? row.textContent : null;
      if (modal) modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(100);
      const got = { subject, filename, listed };
      const expected = { subject: 'Solde 0 - 3', filename: 'Solde_0', listed: '100, 0, 25' };
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varZero = cases;
})();
