// Suite "linksBlocks" - liens, citation et bloc de code sous UNE seule icône de la barre (demande d'Antoine, 2026-10-01 : « un moyen d'ajouter des liens », « une seule icone
// pour tout ça » et « le raccourci Ctrl + K qui marche pour les liens »). Deux moitiés, comme les autres suites de rendu :
//  1) l'ÉDITEUR : le menu (js/main-toolbar.js, index.html), la fenêtre « Insérer / Modifier le lien » et Ctrl+K (js/link-dialog.js), le bloc de code (conversion, fusion de
//     plusieurs paragraphes, grisé quand il effacerait une variable) ;
//  2) les RENDUS : Lecture, PDF, Word, e-mail - lus sur la sortie réelle (annotations de lien et texte peint du PDF décodé par pdf.js, OOXML du .docx dézippé, texte du mailto).
// La frappe réelle (Ctrl+K au clavier, survol et clic à la souris à 700x400, clair et sombre) est dans dev-tests/verify-links-blocks-mouse.mjs : une page.evaluate ne déclenche
// ni un geste « trusted » ni un survol.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const modal = () => document.getElementById('pp-link-modal');
  const modalOpen = () => { const m = modal(); return !!m && m.style.display !== 'none'; };
  const okButton = () => document.querySelector('#pp-link-modal .var-modal-primary');
  const removeButton = () => document.querySelector('#pp-link-modal .var-modal-danger');
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const setField = (id, value) => { const e = document.getElementById(id); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); };

  // Sélection réelle du navigateur sur `text` (première occurrence), que ProseMirror rejoint ensuite (cf. TestHelpers.selectAllInEditor) ; `collapseAt` : curseur à ce
  // décalage dans le texte au lieu d'une sélection.
  async function selectText(text, collapseAt) {
    const walker = document.createTreeWalker(tiptap(), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(text);
      if (i === -1) continue;
      tiptap().focus();
      const range = document.createRange();
      range.setStart(node, i + (collapseAt || 0));
      if (collapseAt !== undefined) range.collapse(true); else range.setEnd(node, i + text.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      await sleep(120);
      return;
    }
    throw new Error('texte introuvable dans l\'éditeur : ' + text);
  }
  // Ctrl+K tel que ProseMirror le reçoit ; vrai quand la frappe est consommée (le navigateur ne la reçoit pas).
  function pressCtrlK() {
    const ev = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true });
    tiptap().dispatchEvent(ev);
    return ev.defaultPrevented;
  }
  async function closeWindowIfOpen() {
    if (modalOpen()) document.querySelector('#pp-link-modal .var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
    await sleep(60);
  }
  async function pdfAnnotations(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const out = [];
    for (let p = 1; p <= pdf.numPages; p++) { (await (await pdf.getPage(p)).getAnnotations()).forEach(a => out.push({ page: p, url: a.url })); }
    return out;
  }
  const relationships = xml => Array.from(new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Relationship')).map(r => ({ id: r.getAttribute('Id'), type: r.getAttribute('Type'), target: r.getAttribute('Target'), mode: r.getAttribute('TargetMode') }));

  // === 1) L'adresse saisie ==================================================================================================================================

  cases.push({
    id: 'lb_normalize_web_mail_and_phone_addresses',
    description: 'Adresse saisie : « exemple.fr » devient https://exemple.fr, une adresse e-mail devient mailto:, un numéro devient tel: (indicatif gardé, espaces retirés)',
    run: async () => {
      const n = LinkDialog.normalizeUrl;
      const want = [
        ['exemple.fr', 'https://exemple.fr'],
        ['www.exemple.fr/page?x=1#haut', 'https://www.exemple.fr/page?x=1#haut'],
        ['  https://exemple.fr/a  ', 'https://exemple.fr/a'],
        ['http://exemple.fr', 'http://exemple.fr'],
        ['localhost:3000', 'https://localhost:3000'],
        ['//exemple.fr/x', 'https://exemple.fr/x'],
        ['https://exemple.fr/un deux', 'https://exemple.fr/un%20deux'],
        ['nom@exemple.fr', 'mailto:nom@exemple.fr'],
        ['mailto:nom@exemple.fr?subject=Bonjour', 'mailto:nom@exemple.fr?subject=Bonjour'],
        ['01 23 45 67 89', 'tel:0123456789'],
        ['+33 1 23 45 67 89', 'tel:+33123456789'],
        ['tel:+33 1 23 45 67 89', 'tel:+33123456789'],
      ];
      const bad = want.filter(([raw, href]) => n(raw).href !== href).map(([raw]) => raw + ' -> ' + JSON.stringify(n(raw)));
      const shown = n('mailto:nom@exemple.fr?subject=Bonjour').text;
      return { pass: bad.length === 0 && shown === 'nom@exemple.fr', notes: JSON.stringify({ bad, shown }) };
    },
  });

  cases.push({
    id: 'lb_normalize_refuses_scripts_files_and_nonsense',
    description: 'Adresse saisie : javascript:, data:, file:, ftp:, une phrase ou rien du tout sont refusés (vide et invalide se distinguent) - aucun de ces schémas n\'arrive dans un href',
    run: async () => {
      const n = LinkDialog.normalizeUrl;
      const invalid = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://exemple.fr', 'vbscript:x', 'pas une adresse', 'http:/exemple.fr', '12', 'a@b'];
      const bad = invalid.filter(raw => n(raw).error !== 'invalid' || n(raw).href).map(raw => raw + ' -> ' + JSON.stringify(n(raw)));
      const empty = [n(''), n('   '), n(null), n(undefined)].every(r => r.error === 'empty');
      return { pass: bad.length === 0 && empty, notes: JSON.stringify({ bad, empty }) };
    },
  });

  cases.push({
    id: 'lb_normalize_returns_href_and_displayed_text_for_each_kind_of_address',
    description: 'Adresse saisie : pour chaque famille (web avec ou sans schéma, e-mail, mailto:, téléphone, tel:, hôte avec port, //hôte) normalizeUrl rend l\'adresse ET le texte à afficher ; un schéma web sans « // », un autre schéma et une adresse incomplète rendent « invalid »',
    run: async () => {
      const n = LinkDialog.normalizeUrl;
      const ok = (href, text) => JSON.stringify({ href, text });
      const bad = JSON.stringify({ error: 'invalid' });
      const want = [
        ['  https://exemple.fr/a  ', ok('https://exemple.fr/a', 'https://exemple.fr/a')],
        ['http://exemple.fr/un deux', ok('http://exemple.fr/un%20deux', 'http://exemple.fr/un deux')],
        ['HTTP://EXEMPLE.FR', ok('http://EXEMPLE.FR', 'HTTP://EXEMPLE.FR')],
        ['https:exemple.fr', bad],
        ['https://', bad],
        ['mailto:nom@exemple.fr?subject=Bonjour', ok('mailto:nom@exemple.fr?subject=Bonjour', 'nom@exemple.fr')],
        ['MAILTO:x@y.fr?cc=z', ok('mailto:x@y.fr?cc=z', 'x@y.fr')],
        ['mailto:a@b', ok('mailto:a@b', 'a@b')],
        ['mailto:nom', bad],
        ['mailto:', bad],
        ['tel:+33 1 23 45 67 89', ok('tel:+33123456789', '+33 1 23 45 67 89')],
        ['tel:12', bad],
        ['tel:', bad],
        ['javascript:alert(1)', bad],
        ['ftp://exemple.fr', bad],
        ['a:b', bad],
        ['localhost:3000/x', ok('https://localhost:3000/x', 'localhost:3000/x')],
        ['exemple.fr:8080', ok('https://exemple.fr:8080', 'exemple.fr:8080')],
        ['x:80?y', bad],
        ['nom@exemple.fr', ok('mailto:nom@exemple.fr', 'nom@exemple.fr')],
        ['a@b', bad],
        ['01 23 45 67 89', ok('tel:0123456789', '01 23 45 67 89')],
        ['+33 1 23 45 67 89', ok('tel:+33123456789', '+33 1 23 45 67 89')],
        ['123456', ok('tel:123456', '123456')],
        ['12345', bad],
        ['//exemple.fr/x', ok('https://exemple.fr/x', '//exemple.fr/x')],
        ['//', bad],
        ['www.exemple.fr/page?x=1#haut', ok('https://www.exemple.fr/page?x=1#haut', 'www.exemple.fr/page?x=1#haut')],
        ['münchen.de', ok('https://münchen.de', 'münchen.de')],
        ['exemple', bad],
        ['a b.fr', bad],
      ];
      const wrong = want.filter(([raw, expected]) => JSON.stringify(n(raw)) !== expected).map(([raw]) => raw + ' -> ' + JSON.stringify(n(raw)));
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong }) };
    },
  });

  cases.push({
    id: 'lb_normalize_accepts_tel_with_glued_digits_but_keeps_ports_for_machines',
    description: 'Adresse saisie : « tel:0612345678 » (chiffres collés, sans espace ni +) est un numéro de téléphone, pas un port : tel:0612345678, comme « tel:+33612345678 » et « tel:06 12 34 56 78 » ; trop court ou trop long reste refusé ; « localhost:3000 » et « exemple.fr:8080 » restent des machines, « x:80?y » reste refusé',
    run: async () => {
      const n = LinkDialog.normalizeUrl;
      const ok = (href, text) => JSON.stringify({ href, text });
      const bad = JSON.stringify({ error: 'invalid' });
      const want = [
        ['tel:0612345678', ok('tel:0612345678', '0612345678')],
        ['TEL:0612345678', ok('tel:0612345678', '0612345678')],
        ['  tel:0612345678  ', ok('tel:0612345678', '0612345678')],
        ['tel:+33612345678', ok('tel:+33612345678', '+33612345678')],
        ['tel:06 12 34 56 78', ok('tel:0612345678', '06 12 34 56 78')],
        ['tel:123456', ok('tel:123456', '123456')],
        ['tel:123456789012345', ok('tel:123456789012345', '123456789012345')],
        ['tel:12345', bad],
        ['tel:1234567890123456', bad],
        ['tel:0612345678/x', bad],
        ['localhost:3000', ok('https://localhost:3000', 'localhost:3000')],
        ['exemple.fr:8080', ok('https://exemple.fr:8080', 'exemple.fr:8080')],
        ['x:80?y', bad],
        ['mailto:0612345678', bad],
        ['javascript:0612345678', bad],
      ];
      const wrong = want.filter(([raw, expected]) => JSON.stringify(n(raw)) !== expected).map(([raw]) => raw + ' -> ' + JSON.stringify(n(raw)));
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong }) };
    },
  });

  cases.push({
    id: 'lb_sanitizer_keeps_only_safe_link_addresses',
    description: 'HtmlSanitize : un lien ne garde que http(s), mailto et tel (adresse nettoyée des espaces) ; data:, vbscript:, adresse relative et javascript: perdent leur href, le texte reste',
    run: async () => {
      const html = HtmlSanitize.clean('<p><a href="javascript:x">a</a><a href="data:text/html,x">b</a><a href=" https://ok.fr/p ">c</a><a href="page.html">d</a><a href="MAILTO:x@y.fr">e</a><a href="tel:+33123456789">f</a><a href="vbscript:x">g</a></p>');
      const hrefs = Array.from(parse(html).querySelectorAll('a')).map(a => a.getAttribute('href'));
      const text = parse(html).textContent;
      const safe = [HtmlSanitize.safeLinkHref(' https://a.fr '), HtmlSanitize.safeLinkHref('javascript:x'), HtmlSanitize.safeLinkHref(''), HtmlSanitize.safeLinkHref(null)];
      return {
        pass: JSON.stringify(hrefs) === JSON.stringify([null, null, 'https://ok.fr/p', null, 'MAILTO:x@y.fr', 'tel:+33123456789', null]) && text === 'abcdefg' && JSON.stringify(safe) === JSON.stringify(['https://a.fr', null, null, null]),
        notes: JSON.stringify({ hrefs, text, safe }),
      };
    },
  });

  // === 2) Le menu de la barre ===============================================================================================================================

  cases.push({
    id: 'lb_menu_is_one_icon_with_link_quote_code_callout_signature_and_qr_rows',
    description: 'Un seul bouton dans la barre pour lien + citation + bloc de code + encadré + signature + QR code + graphique de la page (le groupe à survol), sept lignes dans son volet ; la ligne Lien annonce Ctrl+K ; le bouton porte le raccourci dans son nom (l\'encadré, la signature, le QR code et le graphique ont leurs propres scénarios : calloutSignature, qrCode, chart)',
    run: async (h) => {
      await h.resetEditor();
      const group = document.getElementById('v2-blocks-group');
      const flyout = document.getElementById('v2-blocks-flyout');
      const main = document.getElementById('v2-btn-link');
      const rows = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.id);
      const topLevelButtons = Array.from(group.children).filter(c => c.tagName === 'BUTTON').map(b => b.id);
      const toolbarLevel = ['v2-btn-citation', 'v2-btn-code-block', 'v2-row-link', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart'].filter(id => document.getElementById(id).parentElement === document.getElementById('v2-toolbar'));
      const kbd = document.getElementById('v2-row-link-kbd').textContent;
      const shortcut = LinkDialog.shortcutLabel();
      const labels = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.textContent.trim());
      const iconOk = ['v2-btn-link', 'v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart'].every(id => document.getElementById(id).querySelector('svg'));
      const aria = main.getAttribute('aria-label');
      const flyoutLabel = flyout.querySelector('.v2-hover-flyout-label').textContent;
      return {
        pass: JSON.stringify(rows) === JSON.stringify(['v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart']) && JSON.stringify(topLevelButtons) === JSON.stringify(['v2-btn-link'])
          && toolbarLevel.length === 0 && /^(Ctrl\+K|⌘K)$/.test(kbd) && kbd === shortcut && iconOk && aria.includes(shortcut) && flyoutLabel === 'Lien et blocs de contenu'
          && labels[0].startsWith('Lien') && labels[1] === 'Citation' && labels[2].startsWith('Bloc de code') && labels[3] === 'Encadré…' && labels[4] === 'Bloc de signature' && labels[5] === 'QR code…' && labels[6] === 'Graphique de la page…',
        notes: JSON.stringify({ rows, topLevelButtons, toolbarLevel, kbd, iconOk, aria, flyoutLabel, labels }),
      };
    },
  });

  cases.push({
    id: 'lb_menu_texts_follow_the_interface_language',
    description: 'Le menu, la fenêtre de lien et ses erreurs passent en anglais avec l\'interface, puis reviennent en français',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Hello world</p>');
      await sleep(100);
      I18n.setLang('en');
      await sleep(100);
      let en;
      try {
        const flyout = document.getElementById('v2-blocks-flyout');
        const labels = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.textContent.replace(/(Ctrl\+K|⌘K)$/, '').trim());
        const flyoutLabel = flyout.querySelector('.v2-hover-flyout-label').textContent;
        const aria = document.getElementById('v2-btn-link').getAttribute('aria-label');
        await selectText('world');
        await h.clickButton('v2-btn-link');
        const title = document.getElementById('pp-link-title').textContent;
        setField('pp-link-url', 'javascript:alert(1)');
        okButton().click();
        const error = document.getElementById('pp-link-error').textContent;
        const buttons = Array.from(document.querySelectorAll('#pp-link-modal .var-modal-actions button')).map(b => b.textContent);
        const urlLabel = document.querySelector('#pp-link-modal label[for="pp-link-url"]').textContent;
        await closeWindowIfOpen();
        en = { labels, flyoutLabel, aria, title, error, buttons, urlLabel };
      } finally {
        await closeWindowIfOpen();
        I18n.setLang('fr');
        await sleep(100);
      }
      const frTitle = (await (async () => { await selectText('world'); await h.clickButton('v2-btn-link'); const t = document.getElementById('pp-link-title').textContent; await closeWindowIfOpen(); return t; })());
      return {
        pass: JSON.stringify(en.labels) === JSON.stringify(['Link…', 'Quote', 'Code block', 'Callout…', 'Signature block', 'QR code…', 'Chart from the page…']) && en.flyoutLabel === 'Link and content blocks' && /Insert a link/.test(en.aria)
          && en.title === 'Insert a link' && /address|valid/i.test(en.error) && !/[éèà]/.test(en.error) && en.urlLabel !== 'Adresse' && frTitle === 'Insérer un lien',
        notes: JSON.stringify({ en, frTitle }),
      };
    },
  });

  cases.push({
    id: 'lb_menu_is_greyed_for_a_macro_template_not_removed',
    description: 'Macro-modèle : tout le groupe lien / citation / bloc de code est grisé en entier (jamais retiré), il redevient actif en quittant ce mode',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Texte</p>');
      await sleep(100);
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const greyed = isLocked('v2-blocks-group');
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      const back = !isLocked('v2-blocks-group');
      return { pass: greyed && back && !!document.getElementById('v2-blocks-group'), notes: JSON.stringify({ greyed, back }) };
    },
  });

  // === 3) Le lien dans l'éditeur ============================================================================================================================

  cases.push({
    id: 'lb_link_button_opens_window_on_selection_and_applies',
    description: 'Texte sélectionné + bouton de la barre : la fenêtre s\'ouvre sur le champ adresse (focus), « exemple.fr » valide en https://exemple.fr, la fenêtre se ferme et le clavier revient dans l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour le monde</p>');
      await sleep(100);
      await selectText('le monde');
      await h.clickButton('v2-btn-link');
      const opened = modalOpen();
      const title = document.getElementById('pp-link-title').textContent;
      const focusId = document.activeElement && document.activeElement.id;
      const textFieldHidden = document.querySelector('#pp-link-modal .pp-link-text-field').hidden;
      const removeHidden = removeButton().hidden;
      setField('pp-link-url', 'exemple.fr');
      okButton().click();
      await sleep(150);
      const anchors = Array.from(parse(Editor.getHTML()).querySelectorAll('a'));
      const a = anchors[0];
      return {
        pass: opened && title === 'Insérer un lien' && focusId === 'pp-link-url' && textFieldHidden && removeHidden && !modalOpen()
          && anchors.length === 1 && a.getAttribute('href') === 'https://exemple.fr' && a.textContent === 'le monde' && a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || '')
          && tiptap().contains(document.activeElement),
        notes: JSON.stringify({ opened, title, focusId, textFieldHidden, removeHidden, html: Editor.getHTML() }),
      };
    },
  });

  cases.push({
    id: 'lb_ctrl_k_opens_the_window_and_is_swallowed',
    description: 'Ctrl+K dans l\'éditeur ouvre la fenêtre de lien et la frappe est consommée (elle n\'atteint pas le navigateur) ; Annuler ferme sans toucher au texte',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour le monde</p>');
      await sleep(100);
      await selectText('Bonjour');
      const swallowed = pressCtrlK();
      await sleep(100);
      const opened = modalOpen();
      const focusId = document.activeElement && document.activeElement.id;
      await closeWindowIfOpen();
      return { pass: swallowed && opened && focusId === 'pp-link-url' && !modalOpen() && Editor.getHTML() === '<p>Bonjour le monde</p>', notes: JSON.stringify({ swallowed, opened, focusId, html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'lb_link_edit_prefills_changes_address_and_keeps_text_and_caret',
    description: 'Curseur dans un lien : la fenêtre se rouvre sur son adresse (« Modifier le lien », « Retirer le lien » visible), la nouvelle adresse remplace l\'ancienne pour tout le lien, le texte et le curseur ne bougent pas',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Voir <a href="https://ancien.fr">ce site</a> demain</p>');
      await sleep(100);
      await selectText('ce site', 3);
      pressCtrlK();
      await sleep(100);
      const title = document.getElementById('pp-link-title').textContent;
      const prefilled = document.getElementById('pp-link-url').value;
      const removeShown = !removeButton().hidden;
      const textFieldHidden = document.querySelector('#pp-link-modal .pp-link-text-field').hidden;
      const okLabel = okButton().textContent;
      setField('pp-link-url', 'nouveau.fr');
      okButton().click();
      await sleep(150);
      const ed = EditorCore.getEditor();
      const anchors = Array.from(parse(Editor.getHTML()).querySelectorAll('a'));
      return {
        pass: title === 'Modifier le lien' && prefilled === 'https://ancien.fr' && removeShown && textFieldHidden && okLabel !== 'Insérer'
          && anchors.length === 1 && anchors[0].getAttribute('href') === 'https://nouveau.fr' && anchors[0].textContent === 'ce site' && parse(Editor.getHTML()).textContent === 'Voir ce site demain'
          && ed.state.selection.empty && ed.isActive('link'),
        notes: JSON.stringify({ title, prefilled, removeShown, okLabel, html: Editor.getHTML(), empty: ed.state.selection.empty }),
      };
    },
  });

  cases.push({
    id: 'lb_link_remove_keeps_the_text',
    description: '« Retirer le lien » enlève le lien et garde son texte',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Voir <a href="https://exemple.fr">ce site</a> demain</p>');
      await sleep(100);
      await selectText('ce site', 2);
      pressCtrlK();
      await sleep(100);
      removeButton().click();
      await sleep(150);
      const html = Editor.getHTML();
      return { pass: !modalOpen() && !/<a[\s>]/.test(html) && parse(html).textContent === 'Voir ce site demain', notes: html };
    },
  });

  cases.push({
    id: 'lb_link_without_selection_asks_for_the_text_and_leaves_the_link_after',
    description: 'Curseur seul : la fenêtre demande aussi le texte à afficher ; le lien est inséré avec ce texte, et ce qu\'on tape ensuite n\'allonge pas le lien (adresse seule : l\'adresse sert de texte)',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Début </p>');
      await h.focusAtEnd();
      await sleep(100);
      await h.clickButton('v2-btn-link');
      const textFieldShown = !document.querySelector('#pp-link-modal .pp-link-text-field').hidden;
      setField('pp-link-url', 'exemple.fr');
      setField('pp-link-text', 'Notre site');
      okButton().click();
      await sleep(150);
      await h.typeText(' suite');
      const first = Editor.getHTML();
      const a1 = parse(first).querySelector('a');
      const outside = a1 && a1.textContent === 'Notre site' && /<\/a> suite/.test(first);
      Editor.setHTML('<p></p>');
      await h.focusAtEnd();
      await sleep(100);
      await h.clickButton('v2-btn-link');
      setField('pp-link-url', 'nom@exemple.fr');
      okButton().click();
      await sleep(150);
      const second = parse(Editor.getHTML()).querySelector('a');
      return {
        pass: textFieldShown && !!a1 && a1.getAttribute('href') === 'https://exemple.fr' && outside && !!second && second.getAttribute('href') === 'mailto:nom@exemple.fr' && second.textContent === 'nom@exemple.fr',
        notes: JSON.stringify({ textFieldShown, first, second: second && second.outerHTML }),
      };
    },
  });

  cases.push({
    id: 'lb_link_invalid_address_shows_an_alert_and_changes_nothing',
    description: 'Adresse refusée (javascript:, vide) : la fenêtre reste ouverte avec un message en alerte sous le champ, le champ est marqué invalide, le document ne change pas ; le message disparaît dès qu\'on retape',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour le monde</p>');
      await sleep(100);
      await selectText('le monde');
      await h.clickButton('v2-btn-link');
      const err = document.getElementById('pp-link-error');
      const url = document.getElementById('pp-link-url');
      setField('pp-link-url', 'javascript:alert(1)');
      okButton().click();
      await sleep(80);
      const invalidMsg = err.textContent;
      const invalid = { open: modalOpen(), shown: !err.hidden, role: err.getAttribute('role'), aria: url.getAttribute('aria-invalid'), msg: invalidMsg, focus: document.activeElement === url };
      setField('pp-link-url', '');
      okButton().click();
      await sleep(80);
      const emptyMsg = err.textContent;
      const unchanged = Editor.getHTML() === '<p>Bonjour le monde</p>';
      setField('pp-link-url', 'x');
      const cleared = err.hidden && err.textContent === '' && !url.hasAttribute('aria-invalid');
      await closeWindowIfOpen();
      return {
        pass: invalid.open && invalid.shown && invalid.role === 'alert' && invalid.aria === 'true' && invalid.focus && invalidMsg.length > 5 && emptyMsg.length > 5 && emptyMsg !== invalidMsg && unchanged && cleared,
        notes: JSON.stringify({ invalid, emptyMsg, unchanged, cleared }),
      };
    },
  });

  cases.push({
    id: 'lb_link_window_accepts_a_phone_number_typed_as_tel_with_glued_digits',
    description: 'Fenêtre du lien : « tel:0612345678 » (chiffres collés) est accepté comme « tel:+33612345678 » et « tel:06 12 34 56 78 » : la fenêtre se ferme, le lien porte l\'adresse tel: attendue, aucune alerte « adresse invalide » ne reste',
    run: async (h) => {
      const results = {};
      for (const [typed, href] of [['tel:0612345678', 'tel:0612345678'], ['tel:+33612345678', 'tel:+33612345678'], ['tel:06 12 34 56 78', 'tel:0612345678']]) {
        await h.resetEditor();
        Editor.setHTML('<p>Appelez le standard</p>');
        await sleep(100);
        await selectText('standard');
        await h.clickButton('v2-btn-link');
        setField('pp-link-url', typed);
        okButton().click();
        await sleep(150);
        const a = parse(Editor.getHTML()).querySelector('a');
        const error = document.getElementById('pp-link-error');
        results[typed] = { href: a && a.getAttribute('href'), text: a && a.textContent, open: modalOpen(), error: error.hidden ? '' : error.textContent };
        await closeWindowIfOpen();
        results[typed].expected = href;
      }
      const wrong = Object.keys(results).filter(typed => results[typed].href !== results[typed].expected || results[typed].text !== 'standard' || results[typed].open || results[typed].error !== '');
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong, results }) };
    },
  });

  cases.push({
    id: 'lb_link_is_greyed_in_a_code_block_and_ctrl_k_opens_nothing',
    description: 'Dans un bloc de code (qui n\'accepte aucune marque) : la ligne Lien et le bouton sont grisés, Ctrl+K est avalé mais n\'ouvre rien',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<pre><code>a = 1</code></pre><p>suite</p>');
      await sleep(100);
      await selectText('a = 1', 2);
      await sleep(100);
      const locked = isLocked('v2-btn-link') && isLocked('v2-row-link');
      const swallowed = pressCtrlK();
      await sleep(100);
      await selectText('suite', 1);
      await sleep(100);
      const freeAgain = !isLocked('v2-btn-link') && !isLocked('v2-row-link');
      return { pass: locked && swallowed && !modalOpen() && freeAgain, notes: JSON.stringify({ locked, swallowed, open: modalOpen(), freeAgain }) };
    },
  });

  cases.push({
    id: 'lb_link_ctrl_click_opens_it_a_plain_click_only_places_the_caret',
    description: 'Dans l\'éditeur, un clic simple sur un lien place le curseur (rien ne s\'ouvre) ; Ctrl+clic l\'ouvre dans un nouvel onglet (noopener) ; un lien mailto: s\'ouvre sans onglet',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Voir <a href="https://exemple.fr/page">ce site</a> et <a href="mailto:a@b.fr">écrire</a></p>');
      await sleep(100);
      const seen = [];
      const spy = e => {
        const a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (a && a.style.display === 'none') { seen.push({ href: a.getAttribute('href'), target: a.target, rel: a.rel }); e.preventDefault(); }
      };
      document.addEventListener('click', spy, true);
      try {
        const [web, mail] = Array.from(tiptap().querySelectorAll('a'));
        const click = (el, opts) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 }, opts))); };
        click(web, {});
        const afterPlain = seen.length;
        click(web, { ctrlKey: true });
        click(mail, { metaKey: true });
        return {
          pass: afterPlain === 0 && seen.length === 2 && seen[0].href === 'https://exemple.fr/page' && seen[0].target === '_blank' && seen[0].rel === 'noopener noreferrer' && seen[1].href === 'mailto:a@b.fr' && seen[1].target === '',
          notes: JSON.stringify({ afterPlain, seen }),
        };
      } finally {
        document.removeEventListener('click', spy, true);
      }
    },
  });

  cases.push({
    id: 'lb_link_hover_shows_the_address_and_how_to_open_it',
    description: 'Survol d\'un lien : une info-bulle montre l\'adresse et « Ctrl+clic pour ouvrir », elle disparaît quand la souris quitte le lien',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Voir <a href="https://exemple.fr/page">ce site</a></p>');
      await sleep(100);
      const a = tiptap().querySelector('a');
      a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(500);
      const tip = document.querySelector('.pp-link-tip');
      const shown = !!tip && !tip.hidden && tip.textContent.includes('https://exemple.fr/page') && /(Ctrl|⌘)\+clic pour ouvrir/.test(tip.textContent);
      a.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      await sleep(50);
      return { pass: shown && tip.hidden, notes: JSON.stringify({ shown, text: tip && tip.textContent, hiddenAfter: tip && tip.hidden }) };
    },
  });

  cases.push({
    id: 'lb_link_typed_address_becomes_a_https_link',
    description: 'Une adresse tapée dans le texte devient un lien en https:// (« www.exemple.fr » suivi d\'un espace), et le texte tapé après reste hors du lien',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p></p>');
      await h.focusAtEnd();
      // L'adresse devient un lien quand l'espace qui la suit est tapé (autolink de TipTap lit la fin de ce qui vient d'être écrit).
      await h.typeText('Visitez www.exemple.fr ');
      await h.typeText('maintenant');
      const html = Editor.getHTML();
      const a = parse(html).querySelector('a');
      return { pass: !!a && a.getAttribute('href') === 'https://www.exemple.fr' && a.textContent === 'www.exemple.fr' && /<\/a> maintenant/.test(html), notes: html };
    },
  });

  // === 4) Le bloc de code ===================================================================================================================================

  cases.push({
    id: 'lb_code_block_row_converts_and_toggles_back',
    description: 'Ligne « Bloc de code » : un paragraphe devient <pre><code>, la ligne est active tant que le curseur y reste, un second clic redonne le paragraphe',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Ligne</p>');
      await selectText('Ligne', 2);
      await h.clickButton('v2-btn-code-block');
      await sleep(100);
      const html = Editor.getHTML();
      const active = document.getElementById('v2-btn-code-block').classList.contains('is-active');
      await h.clickButton('v2-btn-code-block');
      await sleep(100);
      // Le paragraphe vide que TipTap garde après un bloc en fin de document (comme après un titre) reste une fois le bloc redevenu paragraphe : sans importance ici.
      const back = Editor.getHTML().replace(/<p><\/p>$/, '');
      return { pass: /^<pre><code>Ligne<\/code><\/pre>/.test(html) && active && back === '<p>Ligne</p>' && !document.getElementById('v2-btn-code-block').classList.contains('is-active'), notes: JSON.stringify({ html, active, back }) };
    },
  });

  cases.push({
    id: 'lb_code_block_merges_selected_paragraphs_into_one_block_and_undo_restores_them',
    description: 'Plusieurs paragraphes sélectionnés : UN seul bloc de code, une ligne par paragraphe (ligne vide gardée) ; Annuler redonne les paragraphes d\'origine',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>un</p><p></p><p>deux</p>');
      await sleep(100);
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-code-block');
      await sleep(120);
      const html = Editor.getHTML();
      const blocks = parse(html).querySelectorAll('pre');
      EditorCore.getEditor().commands.undo();
      await sleep(120);
      const undone = Editor.getHTML();
      return {
        pass: blocks.length === 1 && blocks[0].textContent === 'un\n\ndeux' && undone === '<p>un</p><p></p><p>deux</p>',
        notes: JSON.stringify({ html, undone }),
      };
    },
  });

  cases.push({
    id: 'lb_code_block_is_greyed_when_it_would_erase_a_variable_bubble',
    description: 'Un paragraphe qui contient une bulle #Variable ne peut pas devenir bloc de code (la bulle serait effacée) : la ligne est grisée et un clic ne change rien',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span></p><p>autre</p>');
      await sleep(150);
      await selectText('autre', 2);
      await sleep(100);
      const freeOnPlain = !isLocked('v2-btn-code-block');
      await selectText('Bonjour', 3);
      await sleep(100);
      const lockedOnBubble = isLocked('v2-btn-code-block');
      const before = Editor.getHTML();
      await h.clickButton('v2-btn-code-block');
      await sleep(100);
      return { pass: freeOnPlain && lockedOnBubble && Editor.getHTML() === before && /var-badge/.test(Editor.getHTML()), notes: JSON.stringify({ freeOnPlain, lockedOnBubble, before, after: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'lb_hash_in_a_code_block_does_not_open_the_variable_popup',
    description: '« # » dans un bloc de code reste un « # » (pas de liste de variables) ; dans un paragraphe elle s\'ouvre toujours',
    run: async (h) => {
      await h.resetEditor();
      // Des colonnes à proposer : sans elles la liste reste vide, donc fermée, même dans un paragraphe.
      window.__gristStub.setVariables('LbClients', { Nom: 'Text', Ville: 'Text' });
      window.__gristStub.setRows('LbClients', [{ id: 1, Nom: 'Dupont', Ville: 'Lyon' }]);
      await GristAPI.refreshSchema();
      const popupShown = () => { const b = document.getElementById('autocomplete-box'); return !!b && b.style.display !== 'none' && b.getClientRects().length > 0; };
      Editor.setHTML('<pre><code>a = 1</code></pre><p>texte</p>');
      await sleep(100);
      await selectText('a = 1', 5);
      await h.typeText(' # note #Nom');
      await sleep(400);
      const inCode = popupShown();
      const codeText = tiptap().querySelector('pre').textContent;
      await selectText('texte', 5);
      await h.typeText(' #Nom');
      await sleep(400);
      const inParagraph = popupShown();
      return { pass: !inCode && codeText === 'a = 1 # note #Nom' && inParagraph, notes: JSON.stringify({ inCode, codeText, inParagraph }) };
    },
  });

  // === 5) Les rendus ========================================================================================================================================

  cases.push({
    id: 'lb_reader_links_open_in_a_new_tab_and_unsafe_ones_lose_their_address',
    description: 'Lecture : un lien http(s) s\'ouvre dans un nouvel onglet (noopener noreferrer), mailto/tel sans onglet, un href javascript:/data: disparaît ; liens en bleu souligné, bloc de code en chasse fixe sur fond gris',
    run: async (h) => {
      const content = await h.renderReaderMode('<p><a href="https://exemple.fr/a">web</a> <a href="mailto:a@b.fr">mail</a> <a href="tel:+33123456789">tel</a> <a href="javascript:alert(1)">js</a> <a href="data:text/html,x">data</a></p><pre><code>a = 1\n  b = 2</code></pre>');
      const as = Array.from(content.querySelectorAll('a')).map(a => ({ text: a.textContent, href: a.getAttribute('href'), target: a.target, rel: a.rel, color: getComputedStyle(a).color, deco: getComputedStyle(a).textDecorationLine }));
      const byText = t => as.find(a => a.text === t);
      const pre = content.querySelector('pre');
      const cs = getComputedStyle(pre);
      const lines = pre.textContent;
      return {
        pass: byText('web').href === 'https://exemple.fr/a' && byText('web').target === '_blank' && byText('web').rel === 'noopener noreferrer' && byText('mail').target === '' && byText('tel').target === ''
          && byText('js').href === null && byText('data').href === null && byText('web').color === 'rgb(5, 99, 193)' && byText('web').deco === 'underline' && byText('js').deco === 'none'
          && /Cousine|Courier/.test(cs.fontFamily) && cs.backgroundColor === 'rgb(246, 248, 250)' && cs.whiteSpace === 'pre-wrap' && lines === 'a = 1\n  b = 2',
        notes: JSON.stringify({ as, font: cs.fontFamily, bg: cs.backgroundColor, ws: cs.whiteSpace }),
      };
    },
  });

  cases.push({
    id: 'lb_pdf_link_is_clickable_blue_underlined_and_unsafe_ones_are_not',
    description: 'PDF : un lien devient une annotation cliquable vers son adresse (corps, titre, en-tête de page), texte bleu souligné ; un href javascript: n\'en fait pas une',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>Entête <a href="https://exemple.fr/h">lien d\'entête</a></p>', first: '' }, footer: { default: '', first: '' } };
      const html = '<h2>Titre <a href="https://exemple.fr/titre">lien</a></h2><p>Voir <a href="https://www.exemple.fr/page?x=1">le site</a>, <a href="mailto:contact@exemple.fr">écrire</a> et <a href="javascript:alert(1)">piège</a>.</p>';
      const out = await h.exportPdfContent(html, hf);
      const annots = await pdfAnnotations(out.base64);
      const urls = Array.from(new Set(annots.map(a => a.url))).sort();
      const json = JSON.stringify(out.content);
      const truth = await h.extractPdfGroundTruth(out.base64);
      const painted = truth.pages[0].textItems.map(i => i.str).join(' ');
      return {
        pass: JSON.stringify(urls) === JSON.stringify(['https://exemple.fr/h', 'https://exemple.fr/titre', 'https://www.exemple.fr/page?x=1', 'mailto:contact@exemple.fr'].sort())
          && !annots.some(a => /javascript/i.test(a.url || '')) && /"link":"https:\/\/www\.exemple\.fr\/page\?x=1"[^}]*"color":"#0563c1"|"color":"#0563c1"[^}]*"link":"https:\/\/www\.exemple\.fr\/page\?x=1"/.test(json)
          && /"decoration":\["underline"\]/.test(json) && /piège/.test(painted) && /Entête/.test(painted),
        notes: JSON.stringify({ urls, painted: painted.slice(0, 200) }),
      };
    },
  });

  cases.push({
    id: 'lb_pdf_code_block_is_monospace_keeps_indentation_and_wraps_long_lines',
    description: 'PDF : le bloc de code est en Cousine (chasse fixe), les espaces de tête et la tabulation (= 4 espaces) sont gardés au pas de la police, une ligne trop longue passe à la ligne dans le cadre sans dépasser la marge',
    run: async (h) => {
      await h.resetEditor();
      const long = 'x'.repeat(30) + ' ' + 'mot '.repeat(40);
      const out = await h.exportPdfContent('<pre><code>def f(x):\n    return x\n\n\tfin\n# ' + long + '</code></pre><p>Après</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const page = truth.pages[0];
      const at = s => page.textItems.find(i => i.str === s);
      const def = at('def'), ret = at('return'), fin = at('fin'), after = at('Après');
      const step = 9.5 * 0.6; // Cousine : 0,6 em par caractère
      const rightMost = Math.max(...page.textItems.map(i => i.x + i.width));
      const json = JSON.stringify(out.content);
      const wrapped = page.textItems.filter(i => i.str === 'mot').length === 40 && new Set(page.textItems.filter(i => i.str === 'mot').map(i => Math.round(i.y))).size >= 2;
      return {
        pass: /"font":"Cousine"/.test(json) && Math.abs((ret.x - def.x) - 4 * step) < 1 && Math.abs((fin.x - def.x) - 4 * step) < 1 && ret.y > def.y && fin.y > ret.y + 12 && after.y > fin.y && wrapped && rightMost <= page.width - 28 + 1,
        notes: JSON.stringify({ def, ret, fin, after: after && after.y, rightMost, pageWidth: page.width, wrapped }),
      };
    },
  });

  cases.push({
    id: 'lb_pdf_long_code_block_splits_between_two_lines_never_through_one',
    description: 'PDF : un long bloc de code passe d\'une page à l\'autre entre deux lignes de code, sans en perdre ni en couper une',
    run: async (h) => {
      await h.resetEditor();
      const lines = Array.from({ length: 120 }, (_, i) => 'L' + String(i + 1).padStart(3, '0') + ': valeur');
      const out = await h.exportPdfContent('<p>Avant</p><pre><code>' + lines.join('\n') + '</code></pre><p>Après</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const tokens = truth.pages.flatMap(p => p.textItems.map(i => i.str));
      const missing = lines.map(l => l.split(':')[0] + ':').filter(t => tokens.filter(x => x === t).length !== 1);
      const pageOfLast = truth.pages.findIndex(p => p.textItems.some(i => i.str === 'L120:'));
      // Une ligne de tableau par ligne de code : c'est ce qui rend le bloc sécable entre deux lignes seulement.
      const codeRows = (JSON.stringify(out.content).match(/"font":"Cousine"/g) || []).length;
      return { pass: truth.pages.length >= 2 && missing.length === 0 && pageOfLast === truth.pages.length - 1 && tokens.includes('Après') && codeRows === 120, notes: JSON.stringify({ pages: truth.pages.length, missing: missing.slice(0, 5), pageOfLast, codeRows }) };
    },
  });

  cases.push({
    id: 'lb_pdf_code_block_inside_quote_list_cell_and_column_stays_on_its_own_lines',
    description: 'PDF : un bloc de code dans une citation, un item de liste, une cellule de tableau ou une colonne reste sur ses propres lignes, en chasse fixe et avec ses retraits ; les deux paragraphes d\'une citation ne se collent pas',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportPdfContent('<blockquote><p>Citation un</p><p>Citation deux</p><pre><code>dans = 1</code></pre></blockquote>'
        + '<ul><li><p>Item</p><pre><code>dans_liste()\n  indente</code></pre></li></ul>'
        + '<table><tbody><tr><td><pre><code>x = 1\n  y = 2</code></pre></td><td><p>Cellule</p></td></tr></tbody></table>'
        + '<div class="two-columns-zone"><div class="two-columns-column"><pre><code>colonne = 1\n   a</code></pre></div><div class="two-columns-column"><p>Droite</p></div></div>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const items = truth.pages.flatMap(p => p.textItems);
      const at = s => items.find(i => i.str === s);
      const step = 9.5 * 0.6;
      const monoCount = (JSON.stringify(out.content).match(/"font":"Cousine"/g) || []).length;
      const y = s => at(s) && Math.round(at(s).y);
      const separate = [y('Citation'), y('dans')].every(Boolean) && items.filter(i => i.str === 'Citation').length === 2 && y('Item') < y('dans_liste()') && y('dans_liste()') < y('indente');
      const quoteLines = new Set(items.filter(i => i.str === 'Citation').map(i => Math.round(i.y))).size === 2;
      const cellIndent = at('y') && at('x') ? at('y').x - at('x').x : null;
      const colIndent = at('a') && at('colonne') ? at('a').x - at('colonne').x : null;
      return {
        pass: monoCount >= 5 && separate && quoteLines && Math.abs(cellIndent - 2 * step) < 1.5 && colIndent > 3 * step - 1.5 && !!at('Droite') && !!at('Cellule'),
        notes: JSON.stringify({ monoCount, separate, quoteLines, cellIndent, colIndent }),
      };
    },
  });

  cases.push({
    id: 'lb_docx_link_is_a_real_hyperlink_in_body_and_header_and_unsafe_ones_are_not',
    description: 'Word : un lien est un vrai w:hyperlink avec sa relation externe (corps et en-tête, chacun dans sa part), texte bleu souligné ; javascript: n\'en fait pas un',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>Entête <a href="https://exemple.fr/h">lien</a></p>', first: '' }, footer: { default: '', first: '' } };
      const out = await h.exportDocxParts('<p>Voir <a href="https://www.exemple.fr/page?x=1&amp;y=2"><strong>le site</strong></a>, <a href="mailto:contact@exemple.fr">écrire</a> et <a href="javascript:alert(1)">piège</a>.</p>', hf);
      const links = Array.from(out.doc.getElementsByTagName('w:hyperlink'));
      const rels = relationships(out.parts['word/_rels/document.xml.rels']).filter(r => /hyperlink$/.test(r.type));
      const targetOf = id => (rels.find(r => r.id === id) || {}).target;
      const first = links[0];
      const run = first && first.getElementsByTagName('w:r')[0];
      const color = run && run.getElementsByTagName('w:color')[0] && run.getElementsByTagName('w:color')[0].getAttribute('w:val');
      const underline = !!(run && run.getElementsByTagName('w:u')[0]);
      const bold = !!(run && run.getElementsByTagName('w:b')[0]);
      const headerName = out.names.find(n => /^word\/header\d*\.xml$/.test(n));
      const headerRels = relationships(out.parts[headerName.replace('word/', 'word/_rels/') + '.rels'] || '<Relationships/>').filter(r => /hyperlink$/.test(r.type));
      const headerLink = out.part(headerName).getElementsByTagName('w:hyperlink')[0];
      return {
        pass: links.length === 2 && targetOf(links[0].getAttribute('r:id')) === 'https://www.exemple.fr/page?x=1&y=2' && targetOf(links[1].getAttribute('r:id')) === 'mailto:contact@exemple.fr'
          && rels.every(r => r.mode === 'External') && rels.length === 2 && color === '0563C1' && underline && bold && !rels.some(r => /javascript/i.test(r.target))
          && /piège/.test(out.doc.documentElement.textContent) && headerRels.length === 1 && headerRels[0].target === 'https://exemple.fr/h' && !!headerLink && headerLink.getAttribute('r:id') === headerRels[0].id,
        notes: JSON.stringify({ links: links.length, rels, color, underline, bold, headerRels }),
      };
    },
  });

  cases.push({
    id: 'lb_docx_code_block_is_one_shaded_framed_paragraph_per_line_in_courier',
    description: 'Word : le bloc de code est un paragraphe par ligne (ligne vide et espaces de tête gardés), Courier New 9,5pt, tous avec le même fond gris et le même cadre pour que Word n\'en fasse qu\'un seul cadre',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<p>Avant</p><pre><code>def f(x):\n    return x\n\n\tfin</code></pre><p>Après</p>');
      const paras = Array.from(out.doc.getElementsByTagName('w:p'));
      const code = paras.filter(p => p.getElementsByTagName('w:pBdr').length);
      const textOf = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const texts = code.map(textOf);
      const sameFrame = new Set(code.map(p => p.getElementsByTagName('w:pBdr')[0].outerHTML)).size === 1;
      const sameFill = code.every(p => (p.getElementsByTagName('w:shd')[0] || { getAttribute: () => null }).getAttribute('w:fill') === 'F6F8FA');
      const font = code.every(p => Array.from(p.getElementsByTagName('w:rFonts')).every(f => f.getAttribute('w:ascii') === 'Courier New'));
      const size = code.every(p => Array.from(p.getElementsByTagName('w:sz')).every(s => s.getAttribute('w:val') === '19'));
      const preserved = code.slice(1, 2).every(p => p.getElementsByTagName('w:t')[0].getAttribute('xml:space') === 'preserve');
      const around = [textOf(paras.find(p => textOf(p) === 'Avant')), textOf(paras.find(p => textOf(p) === 'Après'))];
      return {
        pass: JSON.stringify(texts) === JSON.stringify(['def f(x):', '    return x', ' ', '    fin']) && sameFrame && sameFill && font && size && preserved && around[0] === 'Avant' && around[1] === 'Après',
        notes: JSON.stringify({ texts, sameFrame, sameFill, font, size, preserved }),
      };
    },
  });

  cases.push({
    id: 'lb_docx_quote_paragraphs_and_code_in_a_list_item_start_their_own_line',
    description: 'Word : les deux paragraphes d\'une citation et le bloc de code d\'un item de liste ne se collent pas (saut de ligne entre eux), le code garde sa chasse fixe',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<blockquote><p>Citation un</p><p>Citation deux</p></blockquote><ul><li><p>Item</p><pre><code>dans_liste()\n  indente</code></pre></li></ul>');
      const paras = Array.from(out.doc.getElementsByTagName('w:p'));
      const quote = paras.find(p => /Citation un/.test(p.textContent));
      const item = paras.find(p => /^Item/.test(p.textContent));
      const breaks = p => p.getElementsByTagName('w:br').length;
      const mono = Array.from(item.getElementsByTagName('w:r')).filter(r => /dans_liste|indente/.test(r.textContent)).every(r => (r.getElementsByTagName('w:rFonts')[0] || { getAttribute: () => '' }).getAttribute('w:ascii') === 'Courier New');
      return { pass: !!quote && /Citation deux/.test(quote.textContent) && breaks(quote) === 1 && !!item && breaks(item) === 2 && mono, notes: JSON.stringify({ quote: quote && quote.textContent, quoteBreaks: quote && breaks(quote), itemBreaks: item && breaks(item), mono }) };
    },
  });

  cases.push({
    id: 'lb_mailto_text_writes_links_with_their_address_and_keeps_code_lines',
    description: 'Email (texte brut) : « texte (adresse) » pour un lien, l\'adresse seule quand le texte est déjà l\'adresse, rien de plus pour un href refusé ; le bloc de code garde ses lignes et ses retraits ; citation (« > » devant chaque ligne) et item de liste (le bloc de code sous le texte de l\'item) ne collent pas leurs blocs',
    run: async () => {
      const text = MailtoExport.plainTextFromHtml('<p>Voir <a href="https://www.exemple.fr/page?x=1">le site</a>, <a href="https://exemple.fr">https://exemple.fr</a>, <a href="https://www.exemple.fr/">www.exemple.fr</a>, <a href="mailto:contact@exemple.fr">contact@exemple.fr</a>, <a href="mailto:contact@exemple.fr">écrire</a>, <a href="tel:+33123456789">01 23 45 67 89</a>, <a href="javascript:alert(1)">piège</a>, <a href="https://exemple.fr/vide"></a>.</p>'
        + '<pre><code>def f(x):\n    return x\n\n\tfin</code></pre>'
        + '<blockquote><p>Citation un</p><p>Citation deux</p></blockquote>'
        + '<ul><li><p>Item</p><pre><code>dans_liste()</code></pre></li></ul>');
      const want = 'Voir le site (https://www.exemple.fr/page?x=1), https://exemple.fr, www.exemple.fr, contact@exemple.fr, écrire (contact@exemple.fr), 01 23 45 67 89 (+33123456789), piège, https://exemple.fr/vide.'
        + '\ndef f(x):\n    return x\n\n\tfin\n> Citation un\n> Citation deux\n• Item\n  dans_liste()';
      return { pass: text === want, notes: JSON.stringify({ text, want }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.linksBlocks = cases;
})();
