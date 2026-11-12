// Suite "pdfFontPlan" - les polices d'un PDF (js/pdf-font-plan.js, extensions/polices/marianne.js, js/pdf-export.js:pdfFontFor, js/main-export.js) - retour d'un agent de l'État du 11/11 : son texte en Marianne
// sortait en Roboto dans le PDF, sans un mot (le PDF ne sait écrire que Roboto, Arimo, Tinos, Gelasio, Cousine et Carlito ; toute autre police retombait sur Roboto). Demande d'Antoine : (1) le PDF remplace
// une police qu'il n'a pas par la plus proche (Cambria par Tinos...) au lieu de Roboto ; (2) à l'export, une fenêtre « Polices du document » dit lesquelles sont remplacées et par quoi, seulement s'il y en a
// une ; (3) si le document est écrit en Marianne : un bloc à part, où la personne, AVEC GFS (extension « polices »), choisit de l'inclure en déclarant (case cochée) avoir le droit de s'en servir - rien
// n'est lu de jsDelivr avant ce oui, et le fichier lu est vérifié contre son empreinte ; sans GFS le bloc le dit et Marianne reste en Roboto.
// Les essais ne lisent PAS la vraie Marianne (sa licence : elle n'est pas dans le dépôt, et le réseau n'est pas un prérequis) : un faux serveur rend, pour les quatre fichiers, des WOFF faits ici avec Arimo
// (les quatre graisses ont quatre noms de police distincts), et le test pose leurs empreintes. Le vrai téléchargement se vérifie à la main (dev-tests/README.md).
// Joué « hébergé » (dev-tests/gfs-stub.js) : l'extension « polices » est active ou non selon `setExtensions`. Les polices du PDF se lisent dans les octets du fichier (les noms /BaseFont).
(function () {
  const cases = [];
  const TABLE = 'PbFontes';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const JSDELIVR = 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@';
  const STYLES = ['normal', 'bold', 'italics', 'bolditalics'];
  const ARIMO = { normal: 'Arimo-Regular.ttf', bold: 'Arimo-Bold.ttf', italics: 'Arimo-Italic.ttf', bolditalics: 'Arimo-BoldItalic.ttf' };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const baseFontsOf = base64 => Array.from(new Set((atob(base64).match(/\/BaseFont\s*\/[A-Za-z0-9+\-_]+/g) || []).map(s => s.replace(/^\/BaseFont\s*\//, '').replace(/^[A-Z]{6}\+/, '')))).sort();
  const para = (font, text, extra) => `<p><span style="font-family: ${font};${extra || ''}">${text}</span></p>`;
  const four = font => para(font, 'Maigre ') + para(font, 'Gras ', 'font-weight: bold;') + para(font, 'Italique ', 'font-style: italic;') + para(font, 'Gras italique ', 'font-weight: bold; font-style: italic;');

  const overlay = () => document.getElementById('pp-fonts-modal');
  const isOpen = () => !!overlay() && overlay().style.display !== 'none';
  const waitOpen = async (tries) => { for (let i = 0; i < (tries || 100) && !isOpen(); i++) await sleep(30); return isOpen(); };
  const waitClosed = async () => { for (let i = 0; i < 100 && isOpen(); i++) await sleep(30); return !isOpen(); };
  const pick = selector => overlay().querySelector(selector);
  const shown = node => !!node && !node.hidden && !node.closest('[hidden]');
  const rowsText = () => Array.from(overlay().querySelectorAll('.pp-fonts-row')).map(row => row.textContent.replace(/\s+/g, ' ').trim());
  const okButton = () => overlay().querySelector('.var-modal-primary');
  const cancelButton = () => overlay().querySelector('.pp-modal-actions button:not(.var-modal-primary)');

  async function withExtensions(list, fn) {
    const stub = window.__gfsStub;
    const before = stub.extensions.slice();
    stub.setExtensions(list);
    for (let i = 0; i < 60 && Extensions.isActive('polices') !== list.includes('polices'); i++) await sleep(30);
    try { return await fn(); } finally { stub.setExtensions(before); await sleep(60); }
  }

  // --- Les faux fichiers de Marianne : des WOFF faits avec Arimo ---
  async function deflate(bytes) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); }
  async function woffOf(ttfBase64) {
    const ttf = Uint8Array.from(atob(ttfBase64), c => c.charCodeAt(0));
    const view = new DataView(ttf.buffer);
    const count = view.getUint16(4);
    const tables = [];
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16;
      const tag = String.fromCharCode(ttf[at], ttf[at + 1], ttf[at + 2], ttf[at + 3]);
      const offset = view.getUint32(at + 8);
      const length = view.getUint32(at + 12);
      const raw = ttf.subarray(offset, offset + length);
      const packed = await deflate(raw);
      tables.push({ tag, checksum: view.getUint32(at + 4), length, data: packed.length < length ? packed : raw });
    }
    let next = 44 + count * 20;
    tables.forEach((t) => { t.offset = next; next += (t.data.length + 3) & ~3; });
    const out = new Uint8Array(next);
    const dv = new DataView(out.buffer);
    [0x77, 0x4f, 0x46, 0x46].forEach((c, i) => { out[i] = c; });
    dv.setUint32(4, view.getUint32(0));
    dv.setUint32(8, next);
    dv.setUint16(12, count);
    dv.setUint32(16, ttf.length);
    tables.forEach((t, i) => {
      const at = 44 + i * 20;
      for (let k = 0; k < 4; k++) out[at + k] = t.tag.charCodeAt(k);
      dv.setUint32(at + 4, t.offset);
      dv.setUint32(at + 8, t.data.length);
      dv.setUint32(at + 12, t.length);
      dv.setUint32(at + 16, t.checksum);
      out.set(t.data, t.offset);
    });
    return out;
  }
  async function digestOf(bytes) { return 'sha384-' + btoa(String.fromCharCode.apply(null, new Uint8Array(await crypto.subtle.digest('SHA-384', bytes)))); }

  // Le faux serveur de jsDelivr le temps de `fn` : rend les faux WOFF (`fetched` : les adresses demandées), et pose leurs empreintes sauf `wrongHash` (le fichier ne correspond plus à l'empreinte du dépôt).
  async function withFakeMarianne(fn, options) {
    const wrongHash = !!(options && options.wrongHash);
    await Extensions.ensure('polices');
    await PdfExport.ensurePdfLibsLoaded();
    const files = {};
    for (const style of STYLES) files[style] = await woffOf(window.pdfMake.vfs[ARIMO[style]]);
    const saved = {};
    for (const style of STYLES) { saved[style] = PolicesMarianne.FILES[style].hash; if (!wrongHash) PolicesMarianne.FILES[style].hash = await digestOf(files[style]); }
    const originalFetch = window.fetch;
    const fetched = [];
    window.fetch = function (input, init) {
      const url = String((input && input.url) || input);
      const style = STYLES.find(s => url.startsWith(JSDELIVR) && url.endsWith('/' + PolicesMarianne.FILES[s].remote));
      if (!style) return originalFetch.apply(this, arguments);
      fetched.push(url);
      return Promise.resolve(new Response(files[style], { status: 200 }));
    };
    PolicesMarianne.forget();
    try { return await fn({ fetched, files }); } finally {
      window.fetch = originalFetch;
      STYLES.forEach((style) => { PolicesMarianne.FILES[style].hash = saved[style]; delete window.pdfMake.vfs[PolicesMarianne.FILES[style].local]; });
      delete window.pdfMake.fonts.Marianne;
      PolicesMarianne.forget();
      PdfFontPlan.reset();
    }
  }

  async function pdfOf(h, html) { return h.exportPdfContent(html, NO_HF); }
  const arimoCount = base64 => baseFontsOf(base64).filter(name => name.indexOf('Arimo-') === 0).length;

  async function seed(h, html) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(html);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
  }

  // Le bouton Exporter (le PDF d'une ligne) et l'export du moteur remplacé par un espion qui note le plan des polices au moment de l'appel. `whileOpen(ouverte)` répond à la fenêtre ; `expectCall` : attendre le
  // départ du moteur (sinon seulement un instant, pour constater qu'il ne part pas).
  async function clickExport(whileOpen, options) {
    const { expectCall, tries } = options || {};
    const calls = [];
    const real = PdfExport.exportCurrentRecord;
    PdfExport.exportCurrentRecord = async () => { calls.push({ marianne: PdfFontPlan.current().marianne }); };
    try {
      document.getElementById('btn-export-pdf').click();
      const opened = await waitOpen(tries);
      if (whileOpen) await whileOpen(opened);
      if (expectCall) { for (let i = 0; i < 150 && !calls.length; i++) await sleep(30); }
      await sleep(300);
    } finally { PdfExport.exportCurrentRecord = real; }
    return { calls };
  }

  // --- Le PDF remplace une police qu'il n'a pas par la plus proche ---
  cases.push({
    id: 'pdffontplan_pdf_writes_a_missing_font_in_the_closest_one',
    description: 'Une police que le PDF n’a pas prend la plus proche de celles qu’il a : Cambria devient Tinos, Consolas Cousine, Arial Narrow Arimo ; une police sans proche (Segoe UI, Aptos) reste Roboto (avant : tout sortait en Roboto)',
    run: async (h) => {
      const base64 = (await pdfOf(h, para('Cambria', 'Texte') + para('Consolas', 'Code') + para('Arial Narrow', 'Etroit') + para('Segoe UI', 'Interface') + para('Aptos', 'Moderne'))).base64;
      const names = baseFontsOf(base64);
      const bad = [];
      ['Tinos-Regular', 'Cousine-Regular', 'Arimo-Regular', 'Roboto-Regular'].forEach((name) => { if (!names.includes(name)) bad.push(name + ' absente : ' + names.join()); });
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontplan_the_six_embedded_families_are_unchanged',
    description: 'Les six familles du PDF ne changent pas : Arial et Helvetica en Arimo, Times New Roman en Tinos, Georgia en Gelasio, Courier New en Cousine, Calibri en Carlito, Roboto en Roboto',
    run: async (h) => {
      const html = ['Arial', 'Helvetica', '&quot;Times New Roman&quot;, serif', 'Georgia', 'Courier New', 'Calibri', 'Roboto'].map(font => para(font, 'x' + font.length)).join('');
      const names = baseFontsOf((await pdfOf(h, html)).base64);
      const want = ['Arimo-Regular', 'Tinos-Regular', 'Gelasio-Regular', 'Cousine-Regular', 'Carlito-Regular', 'Roboto-Regular'];
      const bad = want.filter(name => !names.includes(name)).map(name => name + ' absente : ' + names.join());
      return result(bad);
    },
  });

  // --- Ce que le document dit ---
  cases.push({
    id: 'pdffontplan_scan_lists_only_the_fonts_the_pdf_replaces',
    description: 'La liste de la fenêtre : les polices que le PDF remplace (avec la plus proche), une fois chacune, dans l’ordre ; ni les six du PDF, ni les noms génériques, ni var(...) ; Marianne à part ; l’en-tête et le pied sont lus aussi',
    run: async (h) => {
      await PdfExport.ensurePdfLibsLoaded();
      const html = para('Aptos', 'a') + para('aptos', 'b') + para('Cambria', 'c') + para('Arial', 'd') + para('Roboto, sans-serif', 'e') + para('sans-serif', 'f') + para('var(--x)', 'g') + para('&quot;Times New Roman&quot;', 'h') + para('Marianne', 'i');
      const header = { default: para('Verdana', 'entête'), first: '' };
      const found = PdfFontPlan.scan([html, { enabled: true, header, footer: { default: '', first: '' } }]);
      const got = found.replaced.map(item => item.name + '>' + item.family).join();
      const bad = [];
      if (got !== 'Aptos>Roboto,Cambria>Tinos,Verdana>Roboto') bad.push('liste=' + got);
      if (found.marianne !== true) bad.push('Marianne=' + found.marianne);
      const none = PdfFontPlan.scan([para('Arial', 'a') + para('Calibri', 'b')]);
      if (none.replaced.length || none.marianne) bad.push('rien à dire=' + JSON.stringify(none));
      return result(bad);
    },
  });

  // --- La fenêtre ---
  cases.push({
    id: 'pdffontplan_no_window_when_every_font_is_in_the_pdf',
    description: 'Un document dont toutes les polices sont dans le PDF n’ouvre aucune fenêtre : l’export part comme avant',
    run: async () => {
      const plan = await PdfFontPlan.review([para('Arial', 'a') + para('Georgia', 'b')]);
      const bad = [];
      if (!plan || plan.marianne !== false) bad.push('plan=' + JSON.stringify(plan));
      if (isOpen()) bad.push('une fenêtre s’est ouverte');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontplan_window_names_the_replaced_fonts_and_the_closest_one',
    description: 'La fenêtre « Polices du document » : le titre, la phrase, une ligne par police remplacée avec la plus proche (« Cambria → Tinos (proche de Times New Roman) »), aucun bloc Marianne ; « Exporter le PDF » rend le plan, « Annuler » rend null',
    run: async () => {
      const bad = [];
      const html = para('Aptos', 'a') + para('Cambria', 'b');
      let pending = PdfFontPlan.review([html]);
      if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
      if (pick('#pp-fonts-title').textContent !== I18n.t('pdfFonts.title')) bad.push('titre=' + pick('#pp-fonts-title').textContent);
      const rows = rowsText();
      if (JSON.stringify(rows) !== JSON.stringify(['Aptos → Roboto', 'Cambria → Tinos (proche de Times New Roman)'])) bad.push('lignes=' + JSON.stringify(rows));
      if (shown(pick('.pp-fonts-choice')) || Array.from(overlay().querySelectorAll('.pp-fonts-section')).filter(shown).length !== 1) bad.push('un bloc Marianne est montré sans Marianne');
      if (okButton().textContent !== I18n.t('pdfFonts.export') || okButton().disabled) bad.push('bouton=' + okButton().textContent + ' grisé=' + okButton().disabled);
      okButton().click();
      const plan = await pending;
      if (!plan || plan.marianne !== false) bad.push('plan rendu=' + JSON.stringify(plan));
      if (!(await waitClosed())) bad.push('la fenêtre reste ouverte');
      pending = PdfFontPlan.review([html]);
      await waitOpen();
      cancelButton().click();
      const cancelled = await pending;
      if (cancelled !== null) bad.push('Annuler rend ' + JSON.stringify(cancelled));
      return result(bad);
    },
  });

  cases.push({
    id: 'pdffontplan_window_shows_the_marianne_block_only_for_marianne',
    description: 'Le bloc Marianne (le titre, le texte sur l’usage réservé à l’administration, les deux liens vers les règles de l’État) n’est montré que si le document est écrit en Marianne',
    run: async () => withExtensions(['graphique', 'polices'], async () => {
      const bad = [];
      let pending = PdfFontPlan.review([para('Marianne', 'Bonjour') + para('Aptos', 'x')]);
      if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
      const sections = Array.from(overlay().querySelectorAll('.pp-fonts-section')).filter(shown);
      if (sections.length !== 2) bad.push('blocs montrés=' + sections.length);
      const text = overlay().textContent;
      if (!/Marianne \(police de l’État\)/.test(text) || !/réserve l’usage à l’administration/.test(text) || !/ne vérifie pas vos droits/.test(text)) bad.push('texte du bloc Marianne manquant');
      const links = Array.from(overlay().querySelectorAll('.pp-fonts-link')).map(a => a.getAttribute('href') + '|' + a.target + '|' + a.rel);
      if (JSON.stringify(links) !== JSON.stringify(['https://www.info.gouv.fr/marque-de-letat/la-typographie|_blank|noopener noreferrer', 'https://github.com/GouvernementFR/dsfr/blob/main/doc/legal/cgu.md|_blank|noopener noreferrer'])) bad.push('liens=' + JSON.stringify(links));
      if (JSON.stringify(rowsText()) !== JSON.stringify(['Aptos → Roboto'])) bad.push('liste sans Marianne=' + JSON.stringify(rowsText()));
      cancelButton().click();
      await pending;
      pending = PdfFontPlan.review([para('Aptos', 'x')]);
      await waitOpen();
      if (Array.from(overlay().querySelectorAll('.pp-fonts-section')).filter(shown).length !== 1) bad.push('bloc Marianne montré pour un document sans Marianne');
      cancelButton().click();
      await pending;
      return result(bad);
    }),
  });

  cases.push({
    id: 'pdffontplan_without_gfs_marianne_stays_in_roboto_and_the_window_says_why',
    description: 'Sans GFS (extension « polices » inactive) : le bloc Marianne dit qu’inclure Marianne demande Grist Factory Suite, sans choix ni case ; Exporter laisse Marianne en Roboto, et rien n’est lu de jsDelivr',
    run: async (h) => withExtensions(['graphique'], async () => {
      const bad = [];
      const originalFetch = window.fetch;
      const asked = [];
      window.fetch = function (input) { const url = String((input && input.url) || input); if (url.startsWith(JSDELIVR)) asked.push(url); return originalFetch.apply(this, arguments); };
      try {
        const pending = PdfFontPlan.review([para('Marianne', 'Bonjour')]);
        if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
        if (shown(pick('.pp-fonts-choice'))) bad.push('le choix est montré sans GFS');
        const needs = I18n.t('pdfFonts.marianne.needsExtension', { extension: Extensions.nameOf('polices') });
        if (!shown(pick('.pp-fonts-note')) || pick('.pp-fonts-note').textContent !== needs) bad.push('phrase sans GFS=' + pick('.pp-fonts-note').textContent);
        const activateButton = pick('.pp-fonts-activate');
        if (!shown(activateButton) || activateButton.textContent !== I18n.t('pdfFonts.marianne.activate', { extension: Extensions.nameOf('polices') })) bad.push('bouton d’activation=' + (activateButton ? activateButton.textContent : 'absent'));
        okButton().click();
        const plan = await pending;
        if (!plan || plan.marianne !== false) bad.push('plan=' + JSON.stringify(plan));
        const base64 = (await pdfOf(h, four('Marianne'))).base64;
        if (arimoCount(base64) !== 0 || !baseFontsOf(base64).includes('Roboto-Regular')) bad.push('PDF=' + baseFontsOf(base64).join());
        if (asked.length) bad.push('requêtes=' + asked.join());
      } finally { window.fetch = originalFetch; }
      return result(bad);
    }),
  });

  cases.push({
    id: 'pdffontplan_the_window_opens_the_gfs_install_window_and_shows_the_choice_once_the_extension_is_on',
    description: 'Dans GFS, extension « polices » non cochée : la fenêtre dit laquelle cocher et porte le bouton « Activer l’extension « Polices »… » ; le clic demande à GFS sa fenêtre d’installation (appel `installer`) ; une fois l’extension cochée là-bas, la fenêtre ouverte montre le choix Roboto / Inclure (le bouton et la phrase partent, le focus passe au choix) sans se refermer ; « Exporter » garde Marianne en Roboto tant que rien n’est inclus',
    run: async () => withExtensions(['graphique'], async () => {
      const bad = [];
      const stub = window.__gfsStub;
      const pending = PdfFontPlan.review([para('Marianne', 'Bonjour')]);
      if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
      const button = pick('.pp-fonts-activate');
      if (!shown(button)) { okButton().click(); await pending; return result(['le bouton d’activation n’est pas montré']); }
      const before = stub.calls.filter(call => call.nom === 'installer').length;
      button.focus();
      button.click();
      for (let i = 0; i < 60 && stub.calls.filter(call => call.nom === 'installer').length === before; i++) await sleep(30);
      const asked = stub.calls.filter(call => call.nom === 'installer');
      if (asked.length !== before + 1 || !asked[asked.length - 1].args || asked[asked.length - 1].args.extension !== 'polices') bad.push('appel installer=' + JSON.stringify(asked.slice(before)));
      if (shown(pick('.pp-fonts-choice'))) bad.push('le choix est montré avant que l’extension soit cochée');
      await sleep(150);
      stub.setExtensions(['graphique', 'polices']);
      for (let i = 0; i < 60 && !shown(pick('.pp-fonts-choice')); i++) await sleep(30);
      if (!isOpen()) bad.push('la fenêtre s’est fermée');
      if (!shown(pick('.pp-fonts-choice')) || !shown(pick('#pp-fonts-roboto')) || !shown(pick('#pp-fonts-include'))) bad.push('le choix n’est pas montré une fois l’extension cochée');
      if (shown(pick('.pp-fonts-note')) || shown(pick('.pp-fonts-activate'))) bad.push('la phrase ou le bouton restent');
      if (document.activeElement !== pick('#pp-fonts-roboto')) bad.push('le focus n’est pas passé au choix : ' + (document.activeElement && (document.activeElement.id || document.activeElement.className)));
      if (!pick('#pp-fonts-roboto').checked || okButton().disabled) bad.push('Roboto n’est pas choisi au départ ou Exporter est grisé');
      okButton().click();
      const plan = await pending;
      if (!plan || plan.marianne !== false) bad.push('plan=' + JSON.stringify(plan));
      return result(bad);
    }),
  });

  cases.push({
    id: 'pdffontplan_no_activate_button_when_gfs_does_not_answer',
    description: 'Si GFS ne répond pas (rien à y cocher), la fenêtre garde la phrase « demande Grist Factory Suite » seule : pas de bouton pour activer l’extension',
    run: async () => withExtensions(['graphique'], async () => {
      const bad = [];
      const original = GfsLink.isAnswering;
      GfsLink.isAnswering = () => false;
      try {
        if (GfsLink.isAnswering() !== false) return result(['essai mal posé : GfsLink.isAnswering ne se remplace pas']);
        const pending = PdfFontPlan.review([para('Marianne', 'Bonjour')]);
        if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
        if (shown(pick('.pp-fonts-activate'))) bad.push('le bouton est montré');
        if (pick('.pp-fonts-note').textContent !== I18n.t('pdfFonts.marianne.needsGfs')) bad.push('phrase=' + pick('.pp-fonts-note').textContent);
        okButton().click();
        await pending;
      } finally { GfsLink.isAnswering = original; }
      return result(bad);
    }),
  });

  cases.push({
    id: 'pdffontplan_marianne_needs_the_declaration_and_is_read_only_after_it',
    description: 'Avec GFS : Roboto est choisi au départ ; « Inclure Marianne » rend la case de déclaration et grise « Exporter le PDF » tant qu’elle n’est pas cochée ; rien n’est lu de jsDelivr avant « Exporter » ; ensuite les quatre fichiers sont lus, et le PDF écrit Marianne en maigre, gras, italique et gras italique (quatre polices distinctes)',
    run: async (h) => withExtensions(['graphique', 'polices'], () => withFakeMarianne(async ({ fetched }) => {
      const bad = [];
      const html = four('Marianne');
      const pending = PdfFontPlan.review([html]);
      if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
      const roboto = pick('#pp-fonts-roboto');
      const include = pick('#pp-fonts-include');
      const consent = pick('#pp-fonts-consent');
      if (!shown(pick('.pp-fonts-choice')) || !roboto.checked || include.checked) bad.push('choix de départ : roboto=' + roboto.checked + ' inclure=' + include.checked);
      if (!consent.disabled || consent.checked || okButton().disabled) bad.push('départ : case grisée=' + consent.disabled + ' cochée=' + consent.checked + ' Exporter grisé=' + okButton().disabled);
      include.click();
      if (consent.disabled || !okButton().disabled) bad.push('Inclure : case grisée=' + consent.disabled + ' Exporter grisé=' + okButton().disabled);
      consent.click();
      if (okButton().disabled) bad.push('case cochée : Exporter reste grisé');
      roboto.click();
      if (!consent.disabled || consent.checked || okButton().disabled) bad.push('retour à Roboto : case grisée=' + consent.disabled + ' cochée=' + consent.checked + ' Exporter grisé=' + okButton().disabled);
      include.click();
      consent.click();
      if (fetched.length) bad.push('requêtes avant « Exporter » : ' + fetched.join());
      okButton().click();
      const plan = await pending;
      if (!plan || plan.marianne !== true) bad.push('plan=' + JSON.stringify(plan));
      if (fetched.length !== 4 || !fetched.every(url => /^https:\/\/cdn\.jsdelivr\.net\/npm\/@gouvfr\/dsfr@[0-9.]+\/dist\/fonts\/Marianne-[A-Za-z_]+\.woff$/.test(url))) bad.push('requêtes=' + JSON.stringify(fetched));
      const base64 = (await pdfOf(h, html)).base64;
      if (arimoCount(base64) !== 4) bad.push('polices Marianne du PDF=' + baseFontsOf(base64).join());
      return result(bad);
    })),
  });

  cases.push({
    id: 'pdffontplan_marianne_font_is_a_truetype_the_glyph_fallback_can_read',
    description: 'Le WOFF devient un fichier TrueType (chaque table décompressée, rangée dans l’ordre) : ses tables sont celles du fichier d’origine, et le repli de police par caractère lit sa table cmap (un ✓ que Marianne n’a pas s’écrit en PPSymbols, pas en case vide)',
    run: async (h) => withExtensions(['graphique', 'polices'], () => withFakeMarianne(async ({ files }) => {
      const bad = [];
      const sfnt = await PolicesMarianne.woffToSfnt(files.normal);
      const original = Uint8Array.from(atob(window.pdfMake.vfs['Arimo-Regular.ttf']), c => c.charCodeAt(0));
      const tablesOf = (bytes) => {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const out = {};
        for (let i = 0; i < view.getUint16(4); i++) {
          const at = 12 + i * 16;
          const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
          out[tag] = bytes.subarray(view.getUint32(at + 8), view.getUint32(at + 8) + view.getUint32(at + 12));
        }
        return out;
      };
      const a = tablesOf(original);
      const b = tablesOf(sfnt);
      if (Object.keys(a).join() !== Object.keys(b).join()) bad.push('tables ' + Object.keys(b).join() + ' pour ' + Object.keys(a).join());
      Object.keys(a).forEach((tag) => { if (!b[tag] || a[tag].length !== b[tag].length || a[tag].some((value, i) => value !== b[tag][i])) bad.push('table ' + tag + ' différente'); });
      const loaded = await PolicesMarianne.load(window.pdfMake);
      if (!loaded.ok) bad.push('chargement=' + JSON.stringify(loaded));
      else {
        const runs = PdfGlyphFallback.runsFor('Bon ✓', { font: 'Marianne' });
        const check = runs.find(run => run.text.indexOf('✓') !== -1);
        if (!check || check.font !== 'PPSymbols') bad.push('✓ écrit en ' + (check && check.font) + ' : ' + JSON.stringify(runs));
      }
      return result(bad);
    })),
  });

  cases.push({
    id: 'pdffontplan_marianne_file_that_does_not_match_its_hash_is_refused',
    description: 'Un fichier qui ne correspond pas à l’empreinte SHA-384 du dépôt est refusé : rien n’entre dans pdfMake, la fenêtre reste ouverte et le dit, et la personne peut repasser à Roboto',
    run: async (h) => withExtensions(['graphique', 'polices'], () => withFakeMarianne(async ({ fetched }) => {
      const bad = [];
      const pending = PdfFontPlan.review([para('Marianne', 'Bonjour')]);
      if (!(await waitOpen())) return result(['la fenêtre ne s’ouvre pas']);
      pick('#pp-fonts-include').click();
      pick('#pp-fonts-consent').click();
      okButton().click();
      for (let i = 0; i < 60 && !pick('.pp-fonts-status.is-problem'); i++) await sleep(30);
      const status = pick('.pp-fonts-status');
      if (!status.classList.contains('is-problem') || status.textContent !== I18n.t('pdfFonts.marianne.failed')) bad.push('phrase=' + status.textContent);
      if (!isOpen()) bad.push('la fenêtre s’est refermée');
      if (STYLES.some(style => window.pdfMake.vfs[PolicesMarianne.FILES[style].local]) || (window.pdfMake.fonts && window.pdfMake.fonts.Marianne)) bad.push('un fichier est entré dans pdfMake');
      if (fetched.length !== 4) bad.push('requêtes=' + fetched.length);
      pick('#pp-fonts-roboto').click();
      okButton().click();
      const plan = await pending;
      if (!plan || plan.marianne !== false) bad.push('plan=' + JSON.stringify(plan));
      const base64 = (await pdfOf(h, four('Marianne'))).base64;
      if (arimoCount(base64) !== 0) bad.push('le PDF écrit un faux fichier : ' + baseFontsOf(base64).join());
      return result(bad);
    }, { wrongHash: true })),
  });

  // --- Les exports ---
  cases.push({
    id: 'pdffontplan_single_export_asks_once_and_the_plan_lasts_for_that_export_only',
    description: 'Le PDF d’une ligne : la fenêtre s’ouvre avant d’écrire le PDF quand une police est remplacée ; « Annuler » ne lance rien (« Export annulé ») ; « Exporter » lance le moteur avec le plan choisi, remis à zéro à la fin ; un modèle sans police à dire ne l’ouvre pas',
    run: async (h) => withExtensions(['graphique', 'polices'], () => withFakeMarianne(async () => {
      const bad = [];
      const status = () => document.getElementById('status-msg').textContent;
      // Un modèle sans police à dire : aucune fenêtre.
      await seed(h, '<p>Bonjour ' + `<span class="var-badge" data-table="${TABLE}" data-column="Nom" data-key="${TABLE}.Nom"></span>` + '</p>');
      let run = await clickExport(null, { expectCall: true, tries: 15 });
      if (run.calls.length !== 1 || isOpen()) bad.push('sans police à dire : exports=' + run.calls.length);
      // Annuler.
      await seed(h, para('Aptos', 'Bonjour') + para('Marianne', 'Salut'));
      run = await clickExport((opened) => { if (!opened) bad.push('annuler : la fenêtre ne s’ouvre pas'); else cancelButton().click(); });
      if (run.calls.length) bad.push('annuler : le moteur est parti (' + run.calls.length + ')');
      if (status() !== I18n.t('status.exportCancelled')) bad.push('annuler : état=' + status());
      // Inclure Marianne.
      run = await clickExport((opened) => {
        if (!opened) { bad.push('inclure : la fenêtre ne s’ouvre pas'); return; }
        pick('#pp-fonts-include').click();
        pick('#pp-fonts-consent').click();
        okButton().click();
      }, { expectCall: true });
      if (run.calls.length !== 1 || run.calls[0].marianne !== true) bad.push('inclure : exports=' + JSON.stringify(run.calls));
      if (PdfFontPlan.current().marianne !== false) bad.push('le plan reste à Marianne après l’export');
      // Roboto.
      run = await clickExport((opened) => { if (opened) okButton().click(); else bad.push('Roboto : la fenêtre ne s’ouvre pas'); }, { expectCall: true });
      if (run.calls.length !== 1 || run.calls[0].marianne !== false) bad.push('Roboto : exports=' + JSON.stringify(run.calls));
      return result(bad);
    })),
  });

  cases.push({
    id: 'pdffontplan_batch_export_asks_once_for_every_document_of_the_batch',
    description: 'Le lot de PDF (archive ZIP) : une seule fenêtre pour les trois documents, après la confirmation du lot ; « Annuler » ne génère aucun PDF ; avec Marianne incluse, chaque document est écrit avec le plan choisi',
    run: async (h) => withExtensions(['graphique', 'polices'], () => withFakeMarianne(async () => {
      const bad = [];
      await seed(h, para('Marianne', 'Bonjour ') + `<p><span class="var-badge" data-table="${TABLE}" data-column="Nom" data-key="${TABLE}.Nom"></span></p>`);
      const plans = [];
      const real = PdfExport.getNativePdfBlobForRecord;
      PdfExport.getNativePdfBlobForRecord = function () { plans.push(PdfFontPlan.current().marianne); return real.apply(this, arguments); };
      const origCreate = URL.createObjectURL;
      const origClick = HTMLAnchorElement.prototype.click;
      const dialogs = h.stubDialogs({ confirm: () => true });
      const downloads = [];
      URL.createObjectURL = obj => origCreate.call(URL, obj);
      HTMLAnchorElement.prototype.click = function () { if (this.download) { downloads.push(this.download); return; } return origClick.call(this); };
      let windows = 0;
      const watcher = async (action) => { for (let i = 0; i < 20; i++) { if (await waitOpen()) { windows++; await action(); return true; } } return false; };
      try {
        // Annuler : aucun PDF.
        const cancelling = watcher(async () => { cancelButton().click(); });
        document.getElementById('v2-btn-export-pdf-batch').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        if (!(await cancelling)) bad.push('annuler : la fenêtre ne s’ouvre pas');
        await sleep(600);
        if (plans.length || downloads.length) bad.push('annuler : PDF=' + plans.length + ' téléchargements=' + downloads.length);
        if (document.getElementById('status-msg').textContent !== I18n.t('status.exportCancelled')) bad.push('annuler : état=' + document.getElementById('status-msg').textContent);
        // Inclure Marianne : une fenêtre, trois documents.
        const including = watcher(async () => { pick('#pp-fonts-include').click(); pick('#pp-fonts-consent').click(); okButton().click(); });
        document.getElementById('v2-btn-export-pdf-batch').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        if (!(await including)) bad.push('inclure : la fenêtre ne s’ouvre pas');
        for (let i = 0; i < 300 && !downloads.length; i++) await sleep(100);
        if (windows !== 2) bad.push('fenêtres=' + windows + ' (une par export)');
        if (plans.length !== 3 || plans.some(plan => plan !== true)) bad.push('plans des documents=' + JSON.stringify(plans));
        if (downloads.length !== 1) bad.push('téléchargements=' + downloads.length);
        if (PdfFontPlan.current().marianne !== false) bad.push('le plan reste à Marianne après le lot');
      } finally {
        PdfExport.getNativePdfBlobForRecord = real;
        URL.createObjectURL = origCreate;
        HTMLAnchorElement.prototype.click = origClick;
        dialogs.restore();
      }
      return result(bad);
    })),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfFontPlan = cases;
})();
