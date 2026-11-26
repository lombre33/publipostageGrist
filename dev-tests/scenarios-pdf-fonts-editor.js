// Suite "pdfFontsEditor" - les polices que le PDF ne peut pas écrire, dites dans l'éditeur (consigne 090 de GFS, demande du porteur du 19/11 : « pour les polices présentes à l'import qui ne peuvent pas être exportées,
// le message n'est qu'à l'export : cela crée un décalage entre la vue éditeur et le reste ») : js/pdf-font-notice.js, le bandeau #pdf-fonts-bar, la pastille #v2-font-chip-flag du bouton « Police » et la fenêtre
// « Remplacer des polices ». La fenêtre « Polices du document » de l'export (js/pdf-font-plan.js : review) ne change pas : son essai est celui de la suite `pdfFontPlan`, et la liste de l'éditeur est comparée à la sienne ici.
// Joué « hébergé » (dev-tests/gfs-stub.js) : l'extension « polices » est active ou non selon `setExtensions`. Les essais écrivent la police dans le texte comme l'import le fait (`font-family` d'un <span>), lisent la
// marque `textStyle` de l'éditeur et le brouillon de l'en-tête et du pied, et défont d'un seul Annuler.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const hf = (header, footer) => ({ enabled: true, differentFirstPage: false, header: { default: header || '', first: '' }, footer: { default: footer || '', first: '' } });
  const para = (font, text, extra) => `<p><span style="font-family: ${font}${extra ? '; ' + extra : ''}">${text}</span></p>`;
  const byId = id => document.getElementById(id);
  const chip = () => byId('v2-font-chip');
  const flag = () => byId('v2-font-chip-flag');
  const bar = () => byId('pdf-fonts-bar');
  const barText = () => bar().querySelector('.pp-fonts-bar-text').textContent.replace(/\s+/g, ' ').trim();
  const dotOn = () => !!flag() && !flag().hidden;
  const swapOverlay = () => byId('pp-font-swap-modal');
  const swapOpen = () => !!swapOverlay() && swapOverlay().style.display !== 'none';
  const swapRows = () => Array.from(swapOverlay().querySelectorAll('.pp-fontswap-row'));
  const rowOf = name => swapRows().find(row => row.querySelector('.pp-fonts-name').textContent === name);
  const waitFor = async (check, tries) => { for (let i = 0; i < (tries || 100); i++) { if (check()) return true; await sleep(30); } return !!check(); };
  const editor = () => EditorCore.getEditor();

  // Chaque passage de texte du document avec sa police et ce que sa marque garde d'autre : [{ text, font, size, color, bold }].
  function runs() {
    const out = [];
    editor().state.doc.descendants((node) => {
      if (!node.isText) return;
      const style = node.marks.find(mark => mark.type.name === 'textStyle');
      out.push({ text: node.text, font: style ? style.attrs.fontFamily : null, size: style ? style.attrs.fontSize : null, color: style ? style.attrs.color : null, bold: node.marks.some(mark => mark.type.name === 'bold') });
    });
    return out;
  }
  const fontsOf = () => Array.from(new Set(runs().map(run => run.font).filter(Boolean))).sort();
  const headerFooter = () => JSON.stringify(Editor.getHeaderFooterData());

  // Un document posé comme à l'ouverture : le relevé se fait tout de suite (le vrai se fait une demi-seconde après, voir le premier essai).
  async function open(h, html, data) {
    await h.resetEditor();
    Editor.setHTML(html);
    Editor.setHeaderFooterData(data || NO_HF);
    await sleep(40);
    PdfFontNotice.scanNow();
  }

  async function withExtensions(list, fn) {
    const stub = window.__gfsStub;
    const before = stub.extensions.slice();
    stub.setExtensions(list);
    for (let i = 0; i < 60 && Extensions.isActive('polices') !== list.includes('polices'); i++) await sleep(30);
    try { return await fn(); } finally { stub.setExtensions(before); await sleep(60); }
  }

  const MIXED = para('Cambria', 'Texte') + para('Consolas', 'Code') + para('Arial', 'a') + para('Roboto, sans-serif', 'b') + para('sans-serif', 'c');

  // --- Le message à l'ouverture ---
  cases.push({
    id: 'pdffontseditor_open_shows_bar_naming_fonts_and_what_the_pdf_writes_instead',
    description: 'Un document qui contient des polices que le PDF remplace montre, à l’ouverture et sans rien faire, un bandeau qui dit lesquelles et par quoi (les mots « proche de » de la fenêtre d’export) ; ni Arial, ni Roboto, ni un nom générique',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(MIXED);
      Editor.setHeaderFooterData(NO_HF);
      const shown = await waitFor(() => !bar().hidden, 120);
      const bad = [];
      if (!shown) return result(['le bandeau ne s’est pas montré à l’ouverture']);
      const text = barText();
      if (text.indexOf('Dans le PDF, 2 polices seront remplacées') !== 0) bad.push('début=' + text);
      if (text.indexOf('Cambria → Tinos (proche de Times New Roman)') === -1) bad.push('Cambria manque : ' + text);
      if (text.indexOf('Consolas → Cousine (proche de Courier New)') === -1) bad.push('Consolas manque : ' + text);
      if (/Arial|Roboto|serif/.test(text)) bad.push('une police du PDF est dite : ' + text);
      if (bar().querySelector('.pp-fonts-bar-text').title !== text) bad.push('le title natif ne dit pas la ligne entière');
      if (!bar().querySelector('.pp-fonts-bar-swap').offsetWidth || !bar().querySelector('.pp-fonts-bar-close').offsetWidth) bad.push('un bouton du bandeau n’est pas là');
      if (bar().getAttribute('role') !== 'region' || !bar().getAttribute('aria-label')) bad.push('le bandeau n’a pas de nom');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_header_and_footer_fonts_are_said_too',
    description: 'La police d’un en-tête ou d’un pied est dite comme celle du texte (la fenêtre d’export les lit aussi)',
    run: async (h) => {
      await open(h, para('Arial', 'texte'), hf(para('Verdana', 'entête'), para('Cambria', 'pied')));
      const names = PdfFontNotice.fonts().map(font => font.name + '>' + font.family).sort();
      const bad = [];
      if (names.join() !== 'Cambria>Tinos,Verdana>Roboto') bad.push('liste=' + names.join());
      if (bar().hidden) bad.push('bandeau caché');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_header_and_footer_fonts_are_named_alone_as_the_editor_writes_them',
    description: 'Une police écrite dans l’en-tête ou le pied comme l’éditeur l’écrit (un style entre guillemets doubles, seul dans son attribut, sans point-virgule ; ou entre guillemets simples ; ou avec des guillemets dans la valeur) est nommée seule : « Cambria », jamais « Cambria\'>Entête » ; le remplacement la change et laisse le reste du texte',
    run: async (h) => {
      const bad = [];
      const header = '<p><span style="font-family: Cambria">Entête</span></p>';
      const footer = '<p><span style=\'font-family: Consolas\'>Pied</span></p><p><span style="font-family: &quot;Segoe UI&quot;, sans-serif">Marge</span></p>';
      await open(h, para('Arial', 'texte'), hf(header, footer));
      const footerBefore = Editor.getHeaderFooterData().footer.default;
      const names = PdfFontNotice.fonts().map(font => font.name).sort();
      if (names.join() !== 'Cambria,Consolas,Segoe UI') bad.push('noms=' + names.join(' | '));
      if (names.some(name => /['<>]/.test(name))) bad.push('un nom porte un guillemet ou une balise : ' + names.join(' | '));
      const exported = PdfFontPlan.scan([Editor.getHTML(), Editor.getHeaderFooterData()]).replaced.map(item => item.name).sort();
      if (exported.join() !== names.join()) bad.push('l’export dit ' + exported.join(' | '));
      const changed = PdfFontNotice.replaceFont('cambria', 'Georgia');
      const after = Editor.getHeaderFooterData();
      if (!changed || after.header.default !== '<p><span style="font-family: Georgia">Entête</span></p>') bad.push('en-tête après=' + after.header.default);
      if (after.footer.default !== footerBefore) bad.push('le pied a changé : ' + after.footer.default);
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_same_list_as_the_export_window',
    description: 'La liste de l’éditeur est celle que la fenêtre d’export relève sur le même document : mêmes noms, mêmes polices de remplacement, dans le même ordre (le relevé de l’export est `PdfFontPlan.scan` sur le HTML et l’en-tête et le pied)',
    run: async (h) => {
      const html = para('Aptos', 'a') + para('aptos', 'b') + para('Cambria', 'c') + para('Arial', 'd') + para('&quot;Times New Roman&quot;, serif', 'e') + para('Segoe UI', 'f') + para('Consolas', 'g');
      await open(h, html, hf(para('Verdana', 'entête'), ''));
      await PdfExport.ensurePdfLibsLoaded();
      const exported = PdfFontPlan.scan([Editor.getHTML(), Editor.getHeaderFooterData()]).replaced.map(item => item.name + '>' + item.family).join();
      PdfFontNotice.scanNow();
      const here = PdfFontNotice.fonts().map(font => font.name + '>' + font.family).join();
      const bad = [];
      if (here !== exported) bad.push('éditeur=' + here + ' export=' + exported);
      if (!here) bad.push('liste vide');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_the_six_pdf_fonts_say_nothing',
    description: 'Un document qui n’emploie que les polices que le PDF écrit (Roboto, Arial, Times New Roman, Georgia, Courier New, Calibri, Helvetica) ne montre ni bandeau ni pastille',
    run: async (h) => {
      const html = ['Roboto', 'Arial', '&quot;Times New Roman&quot;, serif', 'Georgia', 'Courier New', 'Calibri', 'Helvetica'].map(font => para(font, 'x')).join('');
      await open(h, html);
      const bad = [];
      if (!bar().hidden) bad.push('bandeau montré : ' + barText());
      if (dotOn()) bad.push('pastille allumée');
      if (chip().getAttribute('data-tip') !== I18n.t('font.family')) bad.push('info-bulle=' + chip().getAttribute('data-tip'));
      return result(bad);
    },
  });

  // --- La pastille ---
  cases.push({
    id: 'pdffontseditor_chip_dot_stays_while_the_document_has_them_and_goes_when_it_has_none',
    description: 'La pastille de « Police » s’allume avec le nombre de polices (singulier et pluriel), dans l’info-bulle ET le nom du bouton (jamais la couleur seule, pas de title en double) ; elle s’éteint quand le texte est supprimé et quand un autre document n’en a pas',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria', 'un') + para('Cambria', 'deux') + para('Cambria', 'trois'));
      const base = I18n.t('font.family');
      if (!dotOn()) bad.push('pastille éteinte avec une police');
      const one = I18n.t('pdfFonts.chip', { n: 1 });
      if (one !== '1 police que le PDF ne peut pas écrire') bad.push('singulier=' + one);
      if (chip().getAttribute('data-tip') !== base + ' · ' + one) bad.push('info-bulle=' + chip().getAttribute('data-tip'));
      if (chip().getAttribute('aria-label') !== base + ' · ' + one) bad.push('nom=' + chip().getAttribute('aria-label'));
      if (chip().hasAttribute('title')) bad.push('title en double de l’info-bulle');
      if (flag().getAttribute('aria-hidden') !== 'true') bad.push('la pastille n’est pas décorative pour le lecteur d’écran');
      await open(h, para('Cambria', 'a') + para('Consolas', 'b') + para('Aptos', 'c'));
      const three = I18n.t('pdfFonts.chip', { n: 3 });
      if (three !== '3 polices que le PDF ne peut pas écrire' || chip().getAttribute('aria-label') !== base + ' · ' + three) bad.push('pluriel=' + chip().getAttribute('aria-label'));
      // Le texte est supprimé : la pastille s’éteint d’elle-même, sans rouvrir le document.
      editor().chain().focus().selectAll().deleteSelection().run();
      const off = await waitFor(() => !dotOn(), 80);
      if (!off) bad.push('la pastille reste allumée sans texte');
      if (chip().getAttribute('data-tip') !== base || chip().getAttribute('aria-label') !== base) bad.push('l’info-bulle garde le nombre : ' + chip().getAttribute('data-tip'));
      await open(h, para('Cambria', 'a'));
      if (!dotOn()) bad.push('pastille éteinte après réouverture');
      await open(h, para('Arial', 'a'));
      if (dotOn()) bad.push('pastille allumée pour un document sans police à dire');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_closing_the_bar_keeps_the_dot_and_reopening_brings_the_bar_back',
    description: '« Fermer » retire le bandeau et laisse la pastille ; rouvrir le document (Editor.setHTML) remontre le bandeau ; une police qui arrive après l’ouverture (un collage) n’allume que la pastille',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria', 'a'));
      if (bar().hidden) return result(['bandeau caché à l’ouverture']);
      bar().querySelector('.pp-fonts-bar-close').click();
      await sleep(40);
      if (!bar().hidden) bad.push('« Fermer » n’a pas retiré le bandeau');
      if (!dotOn()) bad.push('« Fermer » a éteint la pastille');
      await open(h, para('Cambria', 'a'));
      if (bar().hidden) bad.push('le bandeau ne revient pas à la réouverture');
      await open(h, para('Arial', 'a'));
      if (!bar().hidden || dotOn()) bad.push('un document sans police montre quelque chose');
      editor().chain().focus('end').insertContent('<span style="font-family: Cambria">collé</span>').run();
      PdfFontNotice.scanNow();
      if (!dotOn()) bad.push('une police collée n’allume pas la pastille');
      if (!bar().hidden) bad.push('une police collée rouvre le bandeau');
      return result(bad);
    },
  });

  // --- Ce qui compte, avec ou sans l'extension « polices » ---
  cases.push({
    id: 'pdffontseditor_free_fonts_and_marianne_count_only_without_the_fonts_extension',
    description: 'Là où la fenêtre d’export demande un choix (les polices libres et Marianne avec l’extension « polices »), l’éditeur ne tranche pas : sans l’extension, le PDF les remplace aussi et elles comptent ; avec elle, seules les polices que le PDF remplace toujours comptent',
    run: async (h) => {
      const html = para('Cambria', 'a') + para('Open Sans', 'b') + para('Marianne', 'c');
      const bad = [];
      await withExtensions([], async () => {
        await open(h, html);
        const names = PdfFontNotice.fonts().map(font => font.name + '>' + font.family).join();
        if (names !== 'Cambria>Tinos,Open Sans>Roboto,Marianne>Roboto') bad.push('sans extension=' + names);
        if (chip().getAttribute('aria-label').indexOf(I18n.t('pdfFonts.chip', { n: 3 })) === -1) bad.push('nombre sans extension=' + chip().getAttribute('aria-label'));
      });
      await withExtensions(['polices'], async () => {
        await open(h, html);
        const names = PdfFontNotice.fonts().map(font => font.name).join();
        if (names !== 'Cambria') bad.push('avec extension=' + names);
      });
      return result(bad);
    },
  });

  // --- Le remplacement ---
  const RICH = '<p><span style="font-family: Cambria; font-size: 14pt; color: #aa0000;"><strong>Gras</strong> Cambria</span></p>'
    + '<table><tbody><tr><td><p><span style="font-family: Cambria">cellule</span></p></td><td><p><span style="font-family: Consolas">autre</span></p></td></tr></tbody></table>'
    + '<ul><li><p><span style="font-family: Cambria">élément</span></p></li></ul>'
    + para('Consolas', 'Code') + para('Arial', 'Arial');
  const RICH_HF = hf(para('Cambria', 'Entête'), para('Consolas', 'Pied'));

  cases.push({
    id: 'pdffontseditor_replace_everywhere_in_one_undo_step_from_the_bar',
    description: '« Remplacer… » du bandeau ouvre la fenêtre ; « Remplacer » change la police partout (texte, tableau, liste, en-tête) en gardant taille, couleur et gras, laisse les autres polices, éteint ce qui est réglé et se défait, puis se rétablit, d’UN seul Annuler (texte et en-tête ensemble)',
    run: async (h) => {
      const bad = [];
      await open(h, RICH, RICH_HF);
      const before = { fonts: fontsOf().join(), hf: headerFooter() };
      if (before.fonts !== 'Arial,Cambria,Consolas') bad.push('départ=' + before.fonts);
      bar().querySelector('.pp-fonts-bar-swap').click();
      if (!(await waitFor(swapOpen, 80))) return result(['la fenêtre ne s’est pas ouverte']);
      const names = swapRows().map(row => row.querySelector('.pp-fonts-name').textContent).join();
      if (names !== 'Cambria,Consolas') bad.push('lignes=' + names);
      const row = rowOf('Cambria');
      const select = row.querySelector('select');
      const options = Array.from(select.options).map(option => option.value + '=' + option.textContent);
      if (options[0] !== 'Times New Roman=Times New Roman (comme le PDF)') bad.push('première proposition=' + options[0]);
      if (options.length !== 6 || new Set(options.map(item => item.split('=')[0])).size !== 6) bad.push('propositions=' + options.join('|'));
      if (select.value !== 'Times New Roman') bad.push('valeur de départ=' + select.value);
      row.querySelector('.pp-fontswap-apply').click();
      await sleep(120);
      const after = runs();
      const cambria = after.filter(run => /Cambria|Gras|cellule|élément|Entête/.test(run.text) && run.text !== 'Entête');
      if (fontsOf().join() !== 'Arial,Consolas,Times New Roman') bad.push('après=' + fontsOf().join());
      const gras = after.find(run => run.text === 'Gras');
      if (!gras || gras.font !== 'Times New Roman' || gras.size !== '14pt' || !gras.bold || !/^(#aa0000|rgb\(170,\s*0,\s*0\))$/i.test(String(gras.color))) bad.push('le passage en gras perd sa mise en forme : ' + JSON.stringify(gras));
      ['cellule', 'élément'].forEach((text) => { const run = after.find(r => r.text === text); if (!run || run.font !== 'Times New Roman') bad.push(text + '=' + (run && run.font)); });
      if (after.find(run => run.text === 'autre').font !== 'Consolas' || after.find(run => run.text === 'Code').font !== 'Consolas') bad.push('Consolas touchée');
      const data = Editor.getHeaderFooterData();
      if (data.header.default.indexOf('Cambria') !== -1 || data.header.default.indexOf('Times New Roman') === -1) bad.push('en-tête=' + data.header.default);
      if (data.footer.default.indexOf('Consolas') === -1) bad.push('pied touché=' + data.footer.default);
      if (cambria.length < 3) bad.push('passages lus=' + cambria.length);
      if (PdfFontNotice.fonts().map(font => font.name).join() !== 'Consolas') bad.push('reste=' + PdfFontNotice.fonts().map(font => font.name).join());
      if (!dotOn() || chip().getAttribute('aria-label').indexOf(I18n.t('pdfFonts.chip', { n: 1 })) === -1) bad.push('pastille=' + dotOn() + ' ' + chip().getAttribute('aria-label'));
      if (rowOf('Cambria')) bad.push('la ligne remplacée reste dans la fenêtre');
      const status = swapOverlay().querySelector('.pp-fontswap-status').textContent;
      if (status.indexOf('Cambria est remplacée par Times New Roman') === -1) bad.push('phrase=' + status);
      // UN Annuler défait le texte ET l'en-tête.
      editor().commands.undo();
      await sleep(120);
      PdfFontNotice.scanNow();
      if (fontsOf().join() !== before.fonts) bad.push('Annuler : polices=' + fontsOf().join());
      if (headerFooter() !== before.hf) bad.push('Annuler : l’en-tête n’est pas revenu : ' + Editor.getHeaderFooterData().header.default);
      if (PdfFontNotice.fonts().length !== 2) bad.push('Annuler : pastille=' + PdfFontNotice.fonts().length);
      editor().commands.redo();
      await sleep(120);
      PdfFontNotice.scanNow();
      if (fontsOf().join() !== 'Arial,Consolas,Times New Roman') bad.push('Rétablir : polices=' + fontsOf().join());
      if (Editor.getHeaderFooterData().header.default.indexOf('Cambria') !== -1) bad.push('Rétablir : l’en-tête garde Cambria');
      PdfFontNotice.scanNow();
      if (swapOpen()) { swapOverlay().querySelector('.var-modal-primary').click(); await sleep(60); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_replace_with_another_editor_font_than_the_suggestion',
    description: 'La personne peut choisir une autre police de l’éditeur que celle que propose le PDF : Consolas devient Georgia (et non Courier New) partout',
    run: async (h) => {
      const bad = [];
      await open(h, para('Consolas', 'a') + para('Aptos', 'b'), hf('', para('Consolas', 'pied')));
      PdfFontNotice.openSwap();
      await waitFor(swapOpen, 60);
      const row = rowOf('Consolas');
      row.querySelector('select').value = 'Georgia';
      row.querySelector('.pp-fontswap-apply').click();
      await sleep(100);
      if (fontsOf().join() !== 'Aptos,Georgia') bad.push('polices=' + fontsOf().join());
      if (Editor.getHeaderFooterData().footer.default.indexOf('Georgia') === -1) bad.push('pied=' + Editor.getHeaderFooterData().footer.default);
      if (PdfFontNotice.fonts().map(font => font.name).join() !== 'Aptos') bad.push('reste=' + PdfFontNotice.fonts().map(font => font.name).join());
      swapOverlay().querySelector('.var-modal-primary').click();
      await sleep(60);
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_a_font_only_in_the_footer_is_replaced_and_undone_in_one_step',
    description: 'Une police qui n’est que dans le pied se remplace aussi (rien dans le texte) ; un Annuler la rend, un Rétablir la remplace de nouveau',
    run: async (h) => {
      const bad = [];
      await open(h, para('Arial', 'texte'), hf('', para('Verdana', 'pied')));
      const before = headerFooter();
      const changed = PdfFontNotice.replaceFont('verdana', 'Georgia');
      await sleep(60);
      if (changed !== 1) bad.push('passages=' + changed);
      if (Editor.getHeaderFooterData().footer.default.indexOf('Georgia') === -1) bad.push('pied=' + Editor.getHeaderFooterData().footer.default);
      if (PdfFontNotice.fonts().length || dotOn()) bad.push('la pastille reste');
      editor().commands.undo();
      await sleep(100);
      if (headerFooter() !== before) bad.push('Annuler : pied=' + Editor.getHeaderFooterData().footer.default);
      editor().commands.redo();
      await sleep(100);
      if (Editor.getHeaderFooterData().footer.default.indexOf('Georgia') === -1) bad.push('Rétablir : pied=' + Editor.getHeaderFooterData().footer.default);
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_nothing_is_replaced_without_the_gesture_and_a_font_with_fallbacks_is_matched',
    description: 'Rien ne change tant que la personne ne remplace pas ; une police écrite avec des polices de repli (« Cambria, serif ») est remplacée comme « Cambria », et la valeur neuve ne garde pas l’ancienne liste',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria, serif', 'a') + para('&quot;Cambria&quot;', 'b'));
      const before = JSON.stringify(runs());
      PdfFontNotice.scanNow();
      PdfFontNotice.openSwap();
      await sleep(80);
      if (JSON.stringify(runs()) !== before) bad.push('le texte a changé à l’ouverture de la fenêtre');
      if (PdfFontNotice.fonts().length !== 1) bad.push('liste=' + PdfFontNotice.fonts().map(font => font.name).join());
      swapOverlay().querySelector('.var-modal-primary').click();
      await sleep(40);
      if (PdfFontNotice.replaceFont('cambria', 'Times New Roman') !== 2) bad.push('passages remplacés');
      if (fontsOf().join() !== 'Times New Roman') bad.push('polices=' + fontsOf().join());
      return result(bad);
    },
  });

  // --- Ce qui grise le remplacement ---
  cases.push({
    id: 'pdffontseditor_replace_is_greyed_with_its_reason_when_tracking_or_in_header_footer_or_read_only',
    description: '« Remplacer » reste dans la fenêtre, grisé avec sa raison (au survol, sous la liste et au lecteur d’écran) quand le suivi des modifications est actif, qu’un en-tête ou un pied s’écrit, ou que le modèle est en lecture seule ; il ne change rien',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria', 'a'), hf(para('Cambria', 'entête'), ''));
      // Ce qui compte est la police du texte et celle de l'en-tête : écrire l'en-tête puis le quitter le fait relire par son éditeur, qui réécrit son HTML (un « ; » après la déclaration) sans changer la police.
      const snapshot = () => JSON.stringify(runs()) + '#' + (/font-family:\s*([^;"\\]+)/.exec(headerFooter()) || [])[1];
      const before = snapshot();
      const probe = async (label, key, enter, leave) => {
        enter();
        try {
          const reason = PdfFontNotice.blockedReason();
          if (reason !== key) { bad.push(label + ' : raison=' + reason); return; }
          if (PdfFontNotice.replaceFont('cambria', 'Georgia') !== 0) bad.push(label + ' : a remplacé');
          if (!swapOpen()) PdfFontNotice.openSwap(); else { PdfFontNotice.scanNow(); }
          await sleep(60);
          const apply = swapOverlay().querySelector('.pp-fontswap-apply');
          if (!apply) { bad.push(label + ' : le bouton est retiré'); return; }
          if (apply.getAttribute('aria-disabled') !== 'true') bad.push(label + ' : pas grisé');
          if (apply.title !== I18n.t(key)) bad.push(label + ' : title=' + apply.title);
          if (swapOverlay().querySelector('.pp-fontswap-status').textContent.indexOf(I18n.t(key)) === -1) bad.push(label + ' : phrase absente');
          apply.click();
          await sleep(40);
        } finally { leave(); }
        // Comparé une fois le mode quitté : pendant l'écriture de l'en-tête, l'éditeur montre la zone, pas le document (le retour se fait en quelques images : on attend qu'il soit fait).
        if (!(await waitFor(() => snapshot() === before, 40))) bad.push(label + ' : le clic a changé le document');
      };
      await probe('suivi', 'pdfFonts.swap.tracking', () => Editor.setTrackChanges(true), () => Editor.setTrackChanges(false));
      await probe('lecture seule', 'pdfFonts.swap.readOnly', () => editor().setEditable(false), () => editor().setEditable(true));
      await probe('en-tête', 'pdfFonts.swap.headerFooter', () => HeaderFooterPreview.enterHeaderFooterMode('header', 'default'), () => HeaderFooterPreview.exitHeaderFooterModeIfActive());
      if (swapOpen()) { swapOverlay().querySelector('.var-modal-primary').click(); await sleep(60); }
      const free = PdfFontNotice.blockedReason();
      if (free !== null) bad.push('rien ne devrait bloquer : ' + free);
      return result(bad);
    },
  });

  // --- Les deux langues, le clavier, les couches ---
  cases.push({
    id: 'pdffontseditor_texts_follow_the_language_and_the_window_is_a_real_modal',
    description: 'Le bandeau, l’info-bulle et la fenêtre sont écrits dans la langue choisie, français comme anglais, sans clé brute ; la fenêtre est une vraie fenêtre (role dialog, aria-modal, nommée, Échap la ferme et rend le focus)',
    run: async (h) => {
      const bad = [];
      const before = I18n.getLang();
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          await open(h, para('Cambria', 'a') + para('Consolas', 'b'));
          const tip = chip().getAttribute('aria-label');
          const text = barText();
          if (/pdfFonts\./.test(tip + text)) bad.push(lang + ' : clé brute ' + tip + ' ' + text);
          const want = lang === 'fr'
            ? ['Dans le PDF, 2 polices seront remplacées :', 'proche de Times New Roman', '2 polices que le PDF ne peut pas écrire']
            : ['In the PDF, 2 fonts will be replaced:', 'close to Times New Roman', '2 fonts the PDF cannot write'];
          if (text.indexOf(want[0]) !== 0 || text.indexOf(want[1]) === -1 || tip.indexOf(want[2]) === -1) bad.push(lang + ' : ' + text + ' / ' + tip);
          PdfFontNotice.openSwap();
          await waitFor(swapOpen, 60);
          const box = swapOverlay().querySelector('.pp-modal-box');
          const title = box.querySelector('h3').textContent;
          if (title !== (lang === 'fr' ? 'Remplacer des polices' : 'Replace fonts')) bad.push(lang + ' : titre=' + title);
          if (box.getAttribute('role') !== 'dialog' || box.getAttribute('aria-modal') !== 'true' || !box.getAttribute('aria-labelledby')) bad.push(lang + ' : pas une fenêtre');
          const apply = box.querySelector('.pp-fontswap-apply').textContent;
          if (apply !== (lang === 'fr' ? 'Remplacer' : 'Replace')) bad.push(lang + ' : bouton=' + apply);
          if (/pdfFonts\./.test(box.textContent)) bad.push(lang + ' : clé brute dans la fenêtre');
          const label = box.querySelector('select').getAttribute('aria-label');
          if (label !== (lang === 'fr' ? 'Police qui remplace Cambria' : 'Font that replaces Cambria')) bad.push(lang + ' : nom du champ=' + label);
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await sleep(80);
          if (swapOpen()) bad.push(lang + ' : Échap ne ferme pas la fenêtre');
        }
      } finally { I18n.setLang(before); }
      return result(bad);
    },
  });

  // --- Les couleurs et la place ---
  const parseColor = (str) => { const m = String(str).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const colorToken = (name) => { const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;visibility:hidden;background:var(' + name + ')'; document.body.appendChild(probe); const c = parseColor(getComputedStyle(probe).backgroundColor); probe.remove(); return c; };

  cases.push({
    id: 'pdffontseditor_dot_is_a_token_orange_with_4_5_to_1_in_both_themes_and_sits_on_the_button',
    description: 'La pastille prend sa couleur du jeton --warn-dot (jamais en dur) et garde 4,5:1 sur les trois fonds du bouton, en clair et en sombre ; elle est dans le coin du bouton « Police », sans le déborder ni couvrir le chevron',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria', 'a'));
      const html = document.documentElement;
      const was = html.getAttribute('data-theme');
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noMotion);
      try {
        for (const theme of ['light', 'dark']) {
          html.setAttribute('data-theme', theme);
          await sleep(40);
          const dot = parseColor(getComputedStyle(flag()).backgroundColor);
          const token = colorToken('--warn-dot');
          if (!dot || !token || Math.abs(dot.r - token.r) + Math.abs(dot.g - token.g) + Math.abs(dot.b - token.b) > 2) bad.push(theme + ' : la pastille n’a pas la couleur du jeton ' + JSON.stringify([dot, token]));
          ['--surface', '--surface-sunken', '--bg'].forEach((name) => {
            const bg = colorToken(name);
            const value = ratio(dot, bg);
            if (value < 4.5) bad.push(theme + ' : ' + name + ' ' + Math.round(value * 100) / 100 + ':1');
          });
        }
      } finally { noMotion.remove(); if (was === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', was); }
      const f = flag().getBoundingClientRect();
      const c = chip().getBoundingClientRect();
      // Le chevron que la personne voit : le tracé de l'icône (la boîte de l'icône a de la marge autour), élargi de la demi-épaisseur de son trait.
      const glyph = byId('v2-font-chip-caret').querySelector('svg path').getBoundingClientRect();
      const caret = { left: glyph.left - 1, right: glyph.right + 1, top: glyph.top - 1, bottom: glyph.bottom + 1 };
      if (f.width < 6 || f.width > 10) bad.push('taille=' + f.width);
      if (f.left < c.left - 0.5 || f.right > c.right + 0.5 || f.top < c.top - 0.5 || f.bottom > c.bottom + 0.5) bad.push('déborde du bouton ' + JSON.stringify([f, c]));
      if (f.left < caret.right && f.right > caret.left && f.top < caret.bottom && f.bottom > caret.top) bad.push('couvre le chevron');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_bar_is_hidden_in_reading_and_in_clean_reading',
    description: 'Le bandeau n’est pas à l’écran quand le texte ne l’est pas (Lecture, résumé d’un macro-modèle : pp-editor-hidden) ni en Lecture épurée, et revient avec lui',
    run: async (h) => {
      const bad = [];
      await open(h, para('Cambria', 'a'));
      if (bar().offsetHeight === 0) return result(['le bandeau n’est pas à l’écran à l’ouverture']);
      ['pp-editor-hidden', 'pp-clean-reading'].forEach((name) => {
        document.body.classList.add(name);
        if (getComputedStyle(bar()).display !== 'none') bad.push(name + ' : le bandeau reste');
        document.body.classList.remove(name);
        if (bar().offsetHeight === 0) bad.push(name + ' : le bandeau ne revient pas');
      });
      return result(bad);
    },
  });

  // --- Le garde-fou entre l'éditeur et le moteur du PDF ---
  cases.push({
    id: 'pdffontseditor_fonts_written_as_is_before_the_engine_loads_match_the_pdf_engine',
    description: 'La liste que le relevé tient tant que le moteur du PDF n’est pas chargé (`PdfFontPlan.WRITTEN_AS_IS`) dit la même chose que le moteur (`PdfExport.hasEmbeddedFamily`) : si le moteur apprend une famille, l’éditeur la sait aussi',
    run: async () => {
      await PdfExport.ensurePdfLibsLoaded();
      const probes = ['roboto', 'arial', 'helvetica', 'times new roman', 'times', 'georgia', 'courier new', 'courier', 'calibri', 'cambria', 'consolas', 'arial narrow', 'segoe ui', 'aptos', 'verdana', 'tahoma', 'garamond', 'palatino', 'comic sans ms', 'trebuchet ms', 'impact', 'lucida console', 'open sans', 'lato', 'inter', 'marianne', 'tinos', 'arimo', 'gelasio', 'cousine', 'carlito', 'sans-serif'];
      const bad = probes.filter(name => PdfFontPlan.WRITTEN_AS_IS.indexOf(name) !== -1 !== PdfExport.hasEmbeddedFamily(name)).map(name => name + ' : liste=' + (PdfFontPlan.WRITTEN_AS_IS.indexOf(name) !== -1) + ' moteur=' + PdfExport.hasEmbeddedFamily(name));
      PdfFontPlan.WRITTEN_AS_IS.forEach((name) => { if (!PdfExport.hasEmbeddedFamily(name)) bad.push(name + ' : dans la liste, pas dans le moteur'); });
      return result(bad);
    },
  });

  // --- Le relevé mémorisé par nœud (20/11, « le coût de frappe de pdf-font-notice.js ») : une lettre ne relit que le chemin qu'elle touche, la liste reste celle d'un parcours complet du document ---
  cases.push({
    id: 'pdffontseditor_the_list_after_typing_deleting_pasting_and_undoing_is_the_one_of_a_full_walk',
    description: 'Le relevé reprend la réponse des nœuds que la frappe n\'a pas touchés au lieu de parcourir tout le texte : après une lettre tapée dans un passage, un passage effacé, une police ajoutée AVANT les autres (l\'ordre) et Annuler, la liste, son ordre et la pastille sont ceux d\'un parcours complet du document (l\'ancien relevé)',
    run: async (h) => {
      const bad = [];
      const filler = Array.from({ length: 40 }, (_, i) => `<p>Ligne ${i}</p>`).join('');
      await open(h, MIXED + filler + para('Cambria', 'tard'));
      // L'ancien relevé, tel qu'il était écrit : chaque valeur distincte de la marque `textStyle`, dans l'ordre du document, puis l'en-tête et le pied.
      const reference = () => {
        const texts = [];
        const distinct = new Set();
        editor().state.doc.descendants((node) => {
          if (!node.isInline || !node.marks.length) return;
          node.marks.forEach((mark) => {
            const value = mark.type.name === 'textStyle' ? mark.attrs.fontFamily : null;
            if (!value || distinct.has(value)) return;
            distinct.add(value);
            texts.push('font-family: ' + String(value).replace(/"/g, "'"));
          });
        });
        texts.push(HeaderFooterPreview.getHeaderFooterData());
        return PdfFontPlan.scan(texts).replaced.map(font => font.name).join();
      };
      const mine = () => { PdfFontNotice.scanNow(); return PdfFontNotice.fonts().map(font => font.name).join(); };
      const same = (label) => { const a = mine(); const b = reference(); if (a !== b) bad.push(label + ' : ' + a + ' au lieu de ' + b); return a; };
      const first = same('à l\'ouverture');
      if (first !== 'Cambria,Consolas') bad.push('à l\'ouverture : attendu Cambria,Consolas, vu ' + first);
      const textPos = (needle) => { let at = -1; editor().state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text.indexOf(needle) >= 0) at = pos + node.text.indexOf(needle); }); return at; };
      // Une lettre tapée dans le passage de Consolas : rien ne change.
      editor().view.dispatch(editor().state.tr.insertText('x', textPos('Code') + 2));
      same('après une lettre dans le passage de Consolas');
      if (!dotOn()) bad.push('la pastille s\'éteint après une lettre');
      // Le seul paragraphe de Consolas effacé : il n'est plus dans la liste.
      const range = (() => { let out = null; editor().state.doc.forEach((node, offset) => { if (!out && node.textContent.indexOf('Co') === 0 && node.textContent.indexOf('de') > 0) out = [offset, offset + node.nodeSize]; }); return out; })();
      if (!range) bad.push('le paragraphe de Consolas est introuvable');
      else {
        editor().view.dispatch(editor().state.tr.delete(range[0], range[1]));
        const afterDelete = same('après avoir effacé le paragraphe de Consolas');
        if (afterDelete !== 'Cambria') bad.push('après l\'effacement : attendu Cambria, vu ' + afterDelete);
        // Annuler le rend.
        editor().commands.undo();
        const afterUndo = same('après Annuler');
        if (afterUndo !== 'Cambria,Consolas') bad.push('après Annuler : attendu Cambria,Consolas, vu ' + afterUndo);
      }
      // Une police posée AVANT les autres passe en tête : l'ordre est celui de la première apparition dans le texte.
      editor().commands.insertContentAt(0, para('Consolas', 'neuf'));
      const ordered = same('après un passage de Consolas posé en tête');
      if (ordered !== 'Consolas,Cambria') bad.push('l\'ordre après la pose en tête : attendu Consolas,Cambria, vu ' + ordered);
      // Tout effacer : plus de police, la pastille s'éteint.
      editor().view.dispatch(editor().state.tr.delete(0, editor().state.doc.content.size));
      const none = same('après avoir tout effacé');
      if (none !== '' || dotOn()) bad.push('tout effacé : liste « ' + none + ' », pastille ' + dotOn());
      return result(bad);
    },
  });

  // --- Un macro-modèle (26/11 : « je travaille depuis des semaines sur mes modèles et je n'ai jamais eu de warning dans l'éditeur ») ---
  // L'éditeur d'un macro-modèle est vide (`Editor.setHTML('')`) et son résumé prend la place du texte : le bandeau y est caché et rien ne lisait les modèles assemblés, alors que la fenêtre d'export les lit. Le résumé
  // dit donc les polices de ces modèles (js/macro-editor.js : paintFonts ; js/pdf-font-notice.js : scanModels), avec le modèle qui les écrit.
  const MACRO_TABLE = 'Publipostage_Modeles';
  const MAC = para('TimesNewRomanPS-BoldItalicMT', 'Titre') + para('MS Gothic', '☐');
  const summaryNote = () => byId('macro-summary-fonts');
  const noteText = () => summaryNote().textContent.replace(/\s+/g, ' ').trim();
  const fontTags = () => Array.from(document.querySelectorAll('#macro-summary-parts .macro-summary-model-tag[data-tag="fonts"]'));
  const rowOfModel = (id) => { const edit = document.querySelector('#macro-summary-parts .macro-summary-edit[data-template-id="' + id + '"]'); return edit ? edit.closest('.macro-summary-model') : null; };
  const tagOfModel = (id) => { const row = rowOfModel(id); return row ? row.querySelector('.macro-summary-model-tag[data-tag="fonts"]') : null; };
  const summaryShown = () => { const box = byId('macro-summary-container'); return !!box && getComputedStyle(box).display !== 'none'; };
  const noteShown = () => !summaryNote().hidden && summaryNote().offsetHeight > 0;
  const setAutosaveOn = () => { try { localStorage.removeItem('pp_autosave_enabled'); } catch (e) { /* stockage indisponible */ } };

  // Un macro-modèle réel : un modèle par entrée de `models` ([{ label, html }]), une position « document » chacun, par la vraie fenêtre de composition puis la composition écrite dans sa ligne et relue par la liste.
  async function macroOf(h, name, models) {
    setAutosaveOn();
    await h.clickButton('btn-new');
    await h.sleep(300);
    const saved = [];
    for (const model of models) saved.push(await Templates.save(null, name + ' - ' + model.label, model.html, '', null, null, 'document', null));
    await Templates.loadAll();
    MacroEditor.openModal(null);
    byId('macro-editor-name').value = name;
    const select = document.querySelector('#macro-editor-slots .macro-doc-model');
    select.value = String(saved[0].id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    byId('macro-editor-save').click();
    await h.sleep(700);
    const id = Templates.getCurrentId();
    window.__gristStub.remoteWrite(MACRO_TABLE, id, { Contenu: JSON.stringify({ slots: saved.map(model => ({ type: 'fixed', modeleId: model.id })) }) });
    await Templates.loadAll();
    const list = byId('template-select');
    list.value = String(id);
    list.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(800);
    await waitFor(summaryShown, 100);
    return { id, ids: saved.map(model => model.id), names: models.map(model => name + ' - ' + model.label) };
  }
  async function leaveMacro(h) {
    setAutosaveOn();
    await h.clickButton('btn-new');
    await h.sleep(300);
  }

  cases.push({
    id: 'pdffontseditor_macro_summary_says_the_fonts_of_its_models_and_which_model',
    description: 'Un macro-modèle dont un modèle est écrit en TimesNewRomanPS-BoldItalicMT et en MS Gothic (le retour du 26/11) le dit dans son résumé : une ligne avec les mots du bandeau (« Dans le PDF, 2 polices seront remplacées : … → Tinos (proche de Times New Roman) … ») et le modèle qui les écrit, et une étiquette « 2 polices » sur ce modèle seul ; l’autre modèle (Arial) n’en a pas',
    run: async (h) => {
      const bad = [];
      try {
        const macro = await macroOf(h, 'Macro polices A', [{ label: 'garde', html: MAC }, { label: 'annexe', html: para('Arial', 'Texte') }]);
        if (!summaryShown()) return result(['le résumé n’est pas à l’écran']);
        if (!noteShown()) bad.push('la ligne des polices n’est pas montrée');
        const text = noteText();
        if (text.indexOf('Dans le PDF, 2 polices seront remplacées :') !== 0) bad.push('début=' + text);
        if (text.indexOf('TimesNewRomanPS-BoldItalicMT → Tinos (proche de Times New Roman), dans « ' + macro.names[0] + ' »') === -1) bad.push('Times manque : ' + text);
        if (text.indexOf('MS Gothic → Roboto, dans « ' + macro.names[0] + ' »') === -1) bad.push('MS Gothic manque : ' + text);
        if (text.indexOf(macro.names[1]) !== -1) bad.push('l’annexe en Arial est nommée : ' + text);
        if (text.indexOf('Pour les remplacer, ouvrez le modèle concerné avec son crayon.') === -1) bad.push('la phrase du crayon manque : ' + text);
        const tag = tagOfModel(macro.ids[0]);
        if (!tag) bad.push('pas d’étiquette sur le modèle concerné');
        else {
          if (tag.textContent !== '2 polices') bad.push('étiquette=' + tag.textContent);
          if (tag.title.indexOf('Dans le PDF, 2 polices seront remplacées : TimesNewRomanPS-BoldItalicMT → Tinos') !== 0) bad.push('infobulle=' + tag.title);
          if (tag.nextElementSibling !== rowOfModel(macro.ids[0]).querySelector('.macro-summary-edit')) bad.push('l’étiquette n’est pas juste avant le crayon');
        }
        if (tagOfModel(macro.ids[1])) bad.push('une étiquette sur le modèle en Arial');
        if (fontTags().length !== 1) bad.push(fontTags().length + ' étiquettes');
        // L'éditeur, lui, reste vide : c'est le résumé qui parle.
        if (PdfFontNotice.fonts().length) bad.push('le relevé de l’éditeur n’est pas vide : ' + PdfFontNotice.fonts().map(font => font.name));
        if (summaryNote().getAttribute('role') !== 'status') bad.push('la ligne n’est pas annoncée (role=status)');
      } finally { await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_macro_summary_a_hidden_model_is_not_counted',
    description: 'Le modèle que l’œil masque n’est pas écrit dans le PDF : sa police n’est plus dite et son étiquette part ; l’œil rouvert, ils reviennent (un seul geste, la ligne se redessine sur place)',
    run: async (h) => {
      const bad = [];
      try {
        const macro = await macroOf(h, 'Macro polices B', [{ label: 'garde', html: MAC }, { label: 'annexe', html: para('Arial', 'Texte') }]);
        const eye = document.querySelector('#macro-summary-parts .macro-summary-eye[data-template-id="' + macro.ids[0] + '"]');
        if (!eye || !noteShown()) return result(['départ : œil ' + !!eye + ', ligne ' + noteShown()]);
        eye.click();
        await sleep(200);
        if (noteShown() || summaryNote().textContent !== '') bad.push('masqué : la ligne dit encore « ' + noteText() + ' »');
        if (fontTags().length) bad.push('masqué : une étiquette reste');
        eye.click();
        await sleep(200);
        if (!noteShown() || noteText().indexOf('Dans le PDF, 2 polices seront remplacées :') !== 0) bad.push('rouvert : ' + noteText());
        if (!tagOfModel(macro.ids[0])) bad.push('rouvert : l’étiquette ne revient pas');
      } finally { await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_macro_summary_says_nothing_when_every_model_can_be_written',
    description: 'Un macro-modèle dont les modèles sont en Arial, en Roboto ou sans police ne dit rien : la ligne est cachée et vide, aucune étiquette',
    run: async (h) => {
      const bad = [];
      try {
        await macroOf(h, 'Macro polices C', [{ label: 'un', html: para('Arial', 'a') + para('Roboto, sans-serif', 'b') }, { label: 'deux', html: '<p>Sans police</p>' }]);
        if (noteShown() || summaryNote().textContent !== '') bad.push('la ligne dit « ' + noteText() + ' »');
        if (fontTags().length) bad.push(fontTags().length + ' étiquettes');
      } finally { await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_macro_summary_follows_the_polices_extension_like_the_editor',
    description: 'Une police libre (Open Sans) n’est dite qu’SANS l’extension « polices » (le PDF la remplace alors par la plus proche) ; avec elle, la personne choisit à l’export et le résumé ne dit que Cambria ; la ligne se redessine dès que l’extension change',
    run: async (h) => {
      const bad = [];
      try {
        await macroOf(h, 'Macro polices D', [{ label: 'libre', html: para('Cambria', 'a') + para('Open Sans', 'b') }]);
        await withExtensions([], async () => {
          await sleep(120);
          if (noteText().indexOf('Dans le PDF, 2 polices seront remplacées :') !== 0 || noteText().indexOf('Open Sans → Roboto') === -1) bad.push('sans l’extension : ' + noteText());
        });
        await withExtensions(['polices'], async () => {
          await sleep(120);
          const text = noteText();
          if (text.indexOf('Dans le PDF, 1 police sera remplacée :') !== 0 || text.indexOf('Open Sans') !== -1 || text.indexOf('Cambria → Tinos') === -1) bad.push('avec l’extension : ' + text);
        });
      } finally { await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_macro_summary_pencil_opens_the_model_where_the_bar_names_the_same_fonts',
    description: 'Le crayon du modèle concerné l’ouvre dans l’éditeur : le bandeau y nomme les mêmes polices (avec « Remplacer… »), et « Revenir au macro-modèle » ramène le résumé avec sa ligne',
    run: async (h) => {
      const bad = [];
      try {
        const macro = await macroOf(h, 'Macro polices E', [{ label: 'garde', html: MAC }]);
        const pencil = document.querySelector('#macro-summary-parts .macro-summary-edit[data-template-id="' + macro.ids[0] + '"]');
        if (!pencil) return result(['pas de crayon']);
        pencil.click();
        const shown = await waitFor(() => !bar().hidden && PdfFontNotice.fonts().length === 2, 150);
        if (!shown) bad.push('le bandeau ne s’est pas montré dans le modèle : ' + state());
        else {
          const text = barText();
          if (text.indexOf('TimesNewRomanPS-BoldItalicMT → Tinos (proche de Times New Roman)') === -1 || text.indexOf('MS Gothic → Roboto') === -1) bad.push('bandeau=' + text);
          if (!dotOn()) bad.push('la pastille de « Police » est éteinte');
          if (summaryShown()) bad.push('le résumé reste à l’écran');
        }
        const back = byId('btn-macro-return');
        if (!back || back.offsetWidth === 0) bad.push('pas de bouton « Revenir au macro-modèle »');
        else {
          back.click();
          await waitFor(summaryShown, 100);
          await sleep(150);
          if (!noteShown() || noteText().indexOf('Dans le PDF, 2 polices seront remplacées :') !== 0) bad.push('au retour : ' + noteText());
        }
      } finally { await leaveMacro(h); }
      return result(bad);
    },
  });

  function state() { return JSON.stringify({ list: PdfFontNotice.fonts().map(font => font.name), dot: dotOn(), bar: !bar().hidden }); }

  cases.push({
    id: 'pdffontseditor_macro_summary_reads_a_model_not_read_yet_once',
    description: 'Un modèle dont la page n’est pas encore lue (lecture légère) est lu une seule fois pour le relevé, et la ligne vient à son arrivée ; une lecture qui échoue ne se redemande pas en boucle',
    run: async (h) => {
      const bad = [];
      const realEnsure = Templates.ensureLoaded;
      try {
        const macro = await macroOf(h, 'Macro polices F', [{ label: 'lourd', html: MAC }]);
        const entry = Templates.byId(macro.ids[0]);
        const text = entry.contenu;
        const calls = [];
        // Le modèle redevient « pas lu » (son texte vide) ; la lecture, ici, le rend.
        entry.chargee = false;
        entry.contenu = '';
        Templates.ensureLoaded = async (ids) => { calls.push(ids.map(String).join()); if (calls.length === 1) { entry.contenu = text; entry.chargee = true; } return calls.length === 1; };
        MacroEditor.showSummary(Templates.byId(macro.id));
        const came = await waitFor(noteShown, 100);
        if (!came) bad.push('la ligne n’est pas venue après la lecture : ' + noteText());
        await sleep(200);
        if (calls.join('|') !== String(macro.ids[0])) bad.push('lectures demandées : ' + calls.join('|'));
        // Une lecture qui échoue : demandée une fois, jamais en boucle, et la ligne reste vide.
        entry.chargee = false;
        entry.contenu = '';
        calls.length = 0;
        Templates.ensureLoaded = async (ids) => { calls.push(ids.map(String).join()); return false; };
        MacroEditor.showSummary(Templates.byId(macro.id));
        await sleep(500);
        if (calls.length !== 1) bad.push('lecture qui échoue : ' + calls.length + ' demandes');
        if (noteShown()) bad.push('la ligne dit des polices d’un texte non lu : ' + noteText());
      } finally { Templates.ensureLoaded = realEnsure; await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_macro_summary_texts_in_french_and_english_without_raw_keys',
    description: 'La ligne du résumé, son étiquette et son infobulle sont écrites en français et en anglais (guillemets de la langue), sans clé brute',
    run: async (h) => {
      const bad = [];
      const before = I18n.getLang ? I18n.getLang() : 'fr';
      try {
        const macro = await macroOf(h, 'Macro polices G', [{ label: 'garde', html: MAC }]);
        I18n.setLang('en');
        MacroEditor.showSummary(Templates.byId(macro.id));
        await sleep(150);
        const text = noteText();
        if (text.indexOf('In the PDF, 2 fonts will be replaced:') !== 0) bad.push('en : début=' + text);
        if (text.indexOf('TimesNewRomanPS-BoldItalicMT → Tinos (close to Times New Roman), in “' + macro.names[0] + '”') === -1) bad.push('en : Times=' + text);
        if (text.indexOf('To replace them, open the template concerned with its pencil.') === -1) bad.push('en : phrase=' + text);
        const tag = tagOfModel(macro.ids[0]);
        if (!tag || tag.textContent !== '2 fonts' || tag.title.indexOf('In the PDF, 2 fonts will be replaced:') !== 0) bad.push('en : étiquette=' + (tag && (tag.textContent + ' / ' + tag.title)));
        if (/pdfFonts\./.test(text + (tag ? tag.textContent + tag.title : ''))) bad.push('en : clé brute');
        I18n.setLang('fr');
        MacroEditor.showSummary(Templates.byId(macro.id));
        await sleep(150);
        if (noteText().indexOf('Dans le PDF, 2 polices seront remplacées :') !== 0 || /pdfFonts\./.test(noteText())) bad.push('fr : ' + noteText());
      } finally { I18n.setLang(before); await leaveMacro(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontseditor_scan_models_reads_each_text_once_and_nothing_without_a_font',
    description: 'Le relevé d’un modèle est mémorisé tant que son texte ne change pas (un œil, un crayon ou une extension ne relisent pas un texte de plusieurs mégaoctets) ; un texte sans « font-family » n’est pas parcouru ; un texte qui change est relu ; chaque police dit tous les modèles qui l’écrivent, dans l’ordre',
    run: async () => {
      const bad = [];
      const real = PdfFontPlan.scan;
      let reads = 0;
      PdfFontPlan.scan = (texts) => { reads += 1; return real(texts); };
      try {
        const a = { id: 'zz-a', nom: 'Modèle A', contenu: para('Cambria', 'x') + para('Consolas', 'y') };
        const b = { id: 'zz-b', nom: 'Modèle B', contenu: para('Cambria', 'z') };
        const plain = { id: 'zz-c', nom: 'Modèle C', contenu: '<p>' + 'mot '.repeat(5000) + '</p>' };
        const first = PdfFontNotice.scanModels([a, b, plain]);
        const names = first.map(font => font.name + '@' + font.models.join('+')).join();
        if (names !== 'Cambria@Modèle A+Modèle B,Consolas@Modèle A') bad.push('liste=' + names);
        const readsAfterFirst = reads;
        if (readsAfterFirst !== 2) bad.push('première passe : ' + readsAfterFirst + ' lectures (2 attendues : A et B, pas C)');
        PdfFontNotice.scanModels([a, b, plain]);
        if (reads !== readsAfterFirst) bad.push('deuxième passe : ' + (reads - readsAfterFirst) + ' relectures');
        PdfFontNotice.scanModels([Object.assign({}, a, { contenu: para('Verdana', 'x') })]);
        if (reads !== readsAfterFirst + 1) bad.push('texte changé : ' + (reads - readsAfterFirst) + ' lectures au lieu d’une');
        const after = PdfFontNotice.scanModels([Object.assign({}, a, { contenu: para('Verdana', 'x') })]).map(font => font.name).join();
        if (after !== 'Verdana') bad.push('après le changement : ' + after);
        if (PdfFontNotice.scanModels([]).length || PdfFontNotice.scanModels([null, { id: 'q', nom: 'Q' }]).length) bad.push('rien à lire : une liste non vide');
      } finally { PdfFontPlan.scan = real; }
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfFontsEditor = cases;
})();
