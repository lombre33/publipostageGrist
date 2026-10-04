// Suite "externalImages" - la fenêtre qui précède un export dont le modèle contient une image d'un site externe (js/external-images.js, choix d'Antoine du
// 2026-10-01 « Fenêtre avant l'export », AUDIT_CODE.md §2.3). Trois étages :
//  1) le module seul : quels sites sont listés (http(s) hors widget, hors serveur de Grist ; data:, blob:, adresse relative, ftp: jamais), en-tête et pied
//     comptés seulement quand ils sont exportés, un site accepté n'est pas redemandé dans un même lancement, un refus arrête tout, une seule fenêtre à la fois ;
//  2) les vrais exports (PDF et Word d'une ligne) : la fenêtre s'ouvre AVANT tout téléchargement, « Annuler » ne télécharge rien et ne produit rien ;
//  3) les vraies lignes du menu Exporter (un PDF, un Word, tout en un seul PDF) : un lot ne pose la question qu'une fois, « Annuler » arrête le lot entier et
//     écrit « Export annulé. » (pas une erreur).
// Puis, en dernier (contrôle de sécurité du 04/10, « Tout corriger ») : l'AFFICHAGE. Toute image qui charge depuis un autre site que le widget et Grist est signalée en permanence - hôte,
// infobulle, contour en tirets - dans l'éditeur, la Lecture, ses en-têtes et ses pieds, y compris une image brute que l'éditeur n'écrit pas ; le signalement ne prend aucune place et
// n'entre jamais dans le HTML enregistré.
// Les adresses sont en « .test » (jamais résolues) et `fetch` est remplacé le temps d'un cas : rien ne part sur le réseau.
(function () {
  const cases = [];
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const DATA_PNG = 'data:image/png;base64,' + PNG_B64;
  const TABLE = 'ExtImgTable';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const img = src => `<img class="editor-image" src="${src}" alt="Image" style="width: 120px;">`;
  const WINDOW_TITLE = () => I18n.t('dialog.externalImages.title');
  const isImagesWindow = opts => opts.title === WINDOW_TITLE();
  const sitesOf = message => String(message).split('\n').filter(line => line.startsWith('• ')).map(line => line.slice(2));

  // fetch remplacé : une adresse en « .test » est notée et reçoit une image, le reste passe (les fichiers du harnais).
  function stubFetch() {
    const original = window.fetch;
    const urls = [];
    window.fetch = function (input, init) {
      const url = String(typeof input === 'string' ? input : input && input.url);
      if (!/^https?:\/\/[^/]*\.test(:\d+)?\//.test(url)) return original.call(window, input, init);
      urls.push(url);
      const bytes = Uint8Array.from(atob(PNG_B64), c => c.charCodeAt(0));
      return Promise.resolve(new Response(new Blob([bytes], { type: 'image/png' }), { status: 200 }));
    };
    return { urls, restore() { window.fetch = original; } };
  }

  // Message d'état affiché pendant et après une action (le dernier suffit pour une annulation, la suite complète sert aux lots).
  function watchStatus() {
    const el = document.getElementById('status-msg');
    const seen = [];
    const observer = new MutationObserver(() => { if (seen[seen.length - 1] !== el.textContent) seen.push(el.textContent); });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return { seen, stop: () => observer.disconnect() };
  }

  // Les téléchargements du <a download> interceptés (un .docx, un lot ZIP, un PDF unique), comme dans scenarios-pdf-batch.js.
  function interceptDownloads() {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    return { downloads, restore() { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick; } };
  }

  // Un PDF seul passe par pdfmake.download() : on note l'appel (et son contenu) au lieu d'enregistrer un fichier, comme h.exportPdfContent.
  async function interceptCreatePdf() {
    await PdfExport.ensurePdfLibsLoaded();
    const original = window.pdfMake.createPdf;
    const calls = [];
    window.pdfMake.createPdf = function (docDefinition) {
      const gen = original.call(window.pdfMake, docDefinition);
      gen.download = function (name) { calls.push(name); };
      return gen;
    };
    return { calls, restore() { window.pdfMake.createPdf = original; } };
  }

  async function seed(h, bodyHtml, headerFooterData) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await h.sleep(50);
    Editor.setHTML(bodyHtml);
    Editor.setHeaderFooterData(headerFooterData || NO_HF);
    await h.sleep(80);
  }

  async function waitFor(h, predicate, ms) {
    const startedAt = Date.now();
    while (!predicate() && Date.now() - startedAt < (ms || 30000)) await h.sleep(50);
    await h.sleep(60); // le message d'état final est posé juste après
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 1) Le module seul
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'extimg_lists_external_sites_only_in_page_order',
    description: 'La fenêtre liste les sites http(s) extérieurs au widget et à Grist, une fois chacun, dans l’ordre de la page (corps, puis en-tête et pied exportés) ; data:, blob:, adresse relative, même origine, ftp: et image sans adresse ne sont jamais listés',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => true });
      const body = '<p>Bonjour</p>' + img('https://images.exemple.test/a.png') + img('https://images.exemple.test/b.png') + img('https://cdn.autre.test:8443/c.png')
        + img(DATA_PNG) + img('blob:' + location.origin + '/0b1c') + img('images/relatif.png') + img(location.origin + '/meme-origine.png') + img('//cdn3.test/d.png')
        + img('ftp://fichiers.test/e.png') + img('');
      const hf = { enabled: true, differentFirstPage: true, header: { default: img('https://entete.test/h.png'), first: img('https://premiere.test/f.png') }, footer: { default: '', first: '' } };
      let error = null;
      try { await ExternalImages.confirmExport(body, hf); } catch (e) { error = e; }
      dialogs.restore();
      const asked = dialogs.asked;
      const expected = ['images.exemple.test', 'cdn.autre.test:8443', 'cdn3.test', 'entete.test', 'premiere.test'];
      const pass = !error && asked.length === 1 && asked[0].kind === 'confirm' && asked[0].title === WINDOW_TITLE() && asked[0].confirmLabel === I18n.t('common.continue')
        && JSON.stringify(sitesOf(asked[0].message)) === JSON.stringify(expected);
      return { pass, notes: JSON.stringify({ error: error && error.message, asked: asked.map(a => ({ title: a.title, sites: sitesOf(a.message) })) }) };
    },
  });

  cases.push({
    id: 'extimg_header_footer_counted_only_when_exported',
    description: 'Une image externe d’un en-tête ou d’un pied désactivé, ou d’une première page qui ne diffère pas, n’est pas exportée : aucune fenêtre ; sans image externe nulle part, la promesse se résout sans rien demander',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => true });
      const ext = img('https://silencieux.test/x.png');
      const body = img(DATA_PNG) + img('images/relatif.png');
      const disabled = { enabled: false, differentFirstPage: true, header: { default: ext, first: ext }, footer: { default: ext, first: ext } };
      const sameFirst = { enabled: true, differentFirstPage: false, header: { default: '', first: ext }, footer: { default: '', first: ext } };
      let error = null;
      try { await ExternalImages.confirmExport(body, disabled); await ExternalImages.confirmExport(body, sameFirst); await ExternalImages.confirmExport(body, null); await ExternalImages.confirmExport('', undefined); }
      catch (e) { error = e; }
      dialogs.restore();
      return { pass: !error && dialogs.asked.length === 0, notes: JSON.stringify({ error: error && error.message, asked: dialogs.asked.length }) };
    },
  });

  cases.push({
    id: 'extimg_refusal_rejects_with_cancel_error',
    description: '« Annuler » fait échouer confirmExport avec une erreur que isCancel reconnaît (et seulement elle)',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => false });
      let error = null;
      try { await ExternalImages.confirmExport(img('https://refus.test/x.png'), null); } catch (e) { error = e; }
      dialogs.restore();
      const pass = !!error && ExternalImages.isCancel(error) && !ExternalImages.isCancel(new Error('autre')) && !ExternalImages.isCancel(null) && dialogs.asked.length === 1;
      return { pass, notes: JSON.stringify({ error: error && error.name, asked: dialogs.asked.length }) };
    },
  });

  cases.push({
    id: 'extimg_message_wording_one_or_several_sites_in_both_languages',
    description: 'Le texte de la fenêtre, en français et en anglais : titre, « sur un site externe » / « sur des sites externes » (pluriel par {count|…|…}), un site par ligne à puce, « Annuler arrête l’export. » ; le bouton principal est « Continuer » / « Continue »',
    run: async (h) => {
      const original = I18n.getLang();
      const expected = {
        fr: {
          title: 'Images d’un site externe', label: 'Continuer',
          one: 'Pour cet export, le widget doit télécharger des images hébergées sur un site externe :\n• un.test\n\nAnnuler arrête l’export.',
          several: 'Pour cet export, le widget doit télécharger des images hébergées sur des sites externes :\n• un.test\n• deux.test\n\nAnnuler arrête l’export.',
        },
        en: {
          title: 'Images from an external site', label: 'Continue',
          one: 'For this export, the widget has to download images hosted on an external site:\n• un.test\n\nCancel stops the export.',
          several: 'For this export, the widget has to download images hosted on external sites:\n• un.test\n• deux.test\n\nCancel stops the export.',
        },
      };
      const seenTexts = {};
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          const dialogs = h.stubDialogs({ confirm: () => true });
          await ExternalImages.confirmExport(img('https://un.test/a.png'), null);
          await ExternalImages.confirmExport(img('https://un.test/a.png') + img('https://deux.test/b.png'), null);
          dialogs.restore();
          seenTexts[lang] = { title: dialogs.asked[0].title, label: dialogs.asked[0].confirmLabel, one: dialogs.asked[0].message, several: dialogs.asked[1].message };
        }
      } finally { I18n.setLang(original); }
      const pass = JSON.stringify(seenTexts) === JSON.stringify(expected);
      return { pass, notes: JSON.stringify(seenTexts) };
    },
  });

  cases.push({
    id: 'extimg_run_remembers_sites_and_a_refusal_stops_it',
    description: 'Dans un lancement (beginRun), un site accepté n’est pas redemandé, un nouveau site n’est demandé que lui, un refus arrête la suite sans nouvelle fenêtre ; un nouveau lancement redemande tout',
    run: async (h) => {
      const page = (...hosts) => hosts.map(host => img('https://' + host + '/x.png')).join('');
      let answer = true;
      const dialogs = h.stubDialogs({ confirm: () => answer });
      const log = [];
      const attempt = async html => { try { await ExternalImages.confirmExport(html, null); log.push('ok'); } catch (e) { log.push(ExternalImages.isCancel(e) ? 'annulé' : 'erreur ' + e.message); } };
      ExternalImages.beginRun();
      await attempt(page('un.test'));
      await attempt(page('un.test'));
      await attempt(page('un.test', 'deux.test'));
      const askedAfterAccepted = dialogs.asked.map(a => sitesOf(a.message));
      answer = false;
      await attempt(page('trois.test'));
      await attempt(page('un.test', 'quatre.test'));
      const askedAfterRefusal = dialogs.asked.length;
      ExternalImages.endRun();
      answer = true;
      ExternalImages.beginRun();
      await attempt(page('un.test'));
      ExternalImages.endRun();
      dialogs.restore();
      const pass = JSON.stringify(askedAfterAccepted) === JSON.stringify([['un.test'], ['deux.test']]) && askedAfterRefusal === 3
        && JSON.stringify(log) === JSON.stringify(['ok', 'ok', 'ok', 'annulé', 'annulé', 'ok']) && dialogs.asked.length === 4;
      return { pass, notes: JSON.stringify({ log, askedAfterAccepted, askedAfterRefusal, total: dialogs.asked.length }) };
    },
  });

  cases.push({
    id: 'extimg_two_requests_at_once_open_one_window',
    description: 'Deux demandes qui se croisent pour le même site (dans un lancement) ne font ouvrir qu’une fenêtre : la seconde attend la première, puis voit le site déjà accepté',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: async () => { await h.sleep(120); return true; } });
      ExternalImages.beginRun();
      const html = img('https://double.test/x.png');
      const results = await Promise.allSettled([ExternalImages.confirmExport(html, null), ExternalImages.confirmExport(html, null)]);
      ExternalImages.endRun();
      dialogs.restore();
      return { pass: dialogs.asked.length === 1 && results.every(r => r.status === 'fulfilled'), notes: JSON.stringify({ asked: dialogs.asked.length, results: results.map(r => r.status) }) };
    },
  });

  cases.push({
    id: 'extimg_grist_server_is_trusted_by_its_token_origin_only',
    description: 'Une image de pièce jointe servie par le serveur de Grist (origine du jeton) n’est pas listée ; une image marquée « pièce jointe » mais pointant ailleurs l’est',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => true });
      const gristUrl = await GristAPI.getAttachmentDownloadUrl(7);
      const attachment = src => `<img class="editor-image" data-source="attachment" data-attachment-id="7" src="${src}">`;
      await ExternalImages.confirmExport(attachment(gristUrl) + img('https://tiers.test/x.png'), null);
      await ExternalImages.confirmExport(attachment('https://faux-gist.test/api/docs/stub/attachments/7/download'), null);
      dialogs.restore();
      const asked = dialogs.asked.map(a => sitesOf(a.message));
      const pass = /^https?:\/\/[^/]+\/api\/docs\//.test(gristUrl) && JSON.stringify(asked) === JSON.stringify([['tiers.test'], ['faux-gist.test']]);
      return { pass, notes: JSON.stringify({ gristUrl, asked }) };
    },
  });

  cases.push({
    id: 'extimg_html_is_read_without_loading_images',
    description: 'Lire le HTML pour y chercher les images ne fait charger aucune image au navigateur (document inerte) : avant la réponse de la fenêtre, aucune requête image n’est partie vers le site',
    run: async (h) => {
      const probe = 'https://sonde-' + Date.now() + '.test/pixel.png';
      const requested = () => performance.getEntriesByType('resource').filter(e => e.name === probe).length;
      let during = -1;
      const dialogs = h.stubDialogs({ confirm: async () => { await h.sleep(250); during = requested(); return false; } });
      try { await ExternalImages.confirmExport(img(probe), null); } catch (e) { /* refus attendu */ }
      dialogs.restore();
      return { pass: during === 0, notes: JSON.stringify({ requestsWhileWindowOpen: during }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 2) Les vrais exports d'une ligne
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const EXTERNAL = 'https://images.exemple.test/logo.png';
  const DOC_HTML = '<p>Bonjour</p>' + img(EXTERNAL) + '<p>Merci.</p>';

  cases.push({
    id: 'extimg_pdf_window_comes_before_any_download',
    description: 'PDF d’une ligne : la fenêtre s’ouvre avant le moindre téléchargement ; une fois acceptée, l’image est téléchargée et le PDF produit',
    run: async (h) => {
      const net = stubFetch();
      const events = [];
      const dialogs = h.stubDialogs({ confirm: opts => { events.push({ downloadsSoFar: net.urls.length, sites: sitesOf(opts.message) }); return true; } });
      let result = null; let error = null;
      try { result = await PdfExport.getNativePdfBlobForRecord(DOC_HTML, null, {}, '', null, undefined); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const head = result && result.blob ? new TextDecoder().decode(new Uint8Array(await result.blob.slice(0, 5).arrayBuffer())) : '';
      const pass = !error && events.length === 1 && events[0].downloadsSoFar === 0 && JSON.stringify(events[0].sites) === JSON.stringify(['images.exemple.test'])
        && net.urls.includes(EXTERNAL) && head === '%PDF-';
      return { pass, notes: JSON.stringify({ error: error && error.message, events, downloads: net.urls, head }) };
    },
  });

  cases.push({
    id: 'extimg_pdf_refusal_downloads_nothing',
    description: 'PDF d’une ligne : « Annuler » arrête l’export (erreur d’annulation), l’image n’est pas téléchargée et aucun PDF n’est produit',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => false });
      let result = null; let error = null;
      try { result = await PdfExport.getNativePdfBlobForRecord(DOC_HTML, null, {}, '', null, undefined); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      return { pass: !result && ExternalImages.isCancel(error) && net.urls.length === 0 && dialogs.asked.length === 1, notes: JSON.stringify({ error: error && error.name, downloads: net.urls }) };
    },
  });

  cases.push({
    id: 'extimg_pdf_header_footer_images_are_listed_too',
    description: 'PDF : l’image externe d’un en-tête de page est listée avec celles du corps, dans la même fenêtre',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => true });
      const hf = { enabled: true, differentFirstPage: false, header: { default: img('https://entete.test/h.png'), first: '' }, footer: { default: '', first: '' } };
      let error = null;
      try { await PdfExport.getNativePdfBlobForRecord(DOC_HTML, null, {}, '', hf, undefined); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const pass = !error && dialogs.asked.length === 1 && JSON.stringify(sitesOf(dialogs.asked[0].message)) === JSON.stringify(['images.exemple.test', 'entete.test'])
        && net.urls.includes('https://entete.test/h.png');
      return { pass, notes: JSON.stringify({ error: error && error.message, asked: dialogs.asked.map(a => sitesOf(a.message)), downloads: net.urls }) };
    },
  });

  cases.push({
    id: 'extimg_pdf_without_external_image_asks_nothing',
    description: 'PDF d’un modèle sans image externe (data:, relative) : aucune fenêtre, le PDF est produit comme avant',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => false });
      let result = null; let error = null;
      try { result = await PdfExport.getNativePdfBlobForRecord('<p>Bonjour</p>' + img(DATA_PNG) + img('images/relatif.png'), null, {}, '', null, undefined); } catch (e) { error = e; }
      dialogs.restore();
      return { pass: !error && !!result && !!result.blob && dialogs.asked.length === 0, notes: JSON.stringify({ error: error && error.message, asked: dialogs.asked.length }) };
    },
  });

  cases.push({
    id: 'extimg_docx_window_comes_before_any_download',
    description: 'Word d’une ligne : la fenêtre s’ouvre avant le moindre téléchargement ; une fois acceptée, l’image est téléchargée et se retrouve dans word/media',
    run: async (h) => {
      const net = stubFetch();
      const events = [];
      const dialogs = h.stubDialogs({ confirm: opts => { events.push({ downloadsSoFar: net.urls.length, sites: sitesOf(opts.message) }); return true; } });
      let parts = null; let error = null;
      try { parts = await h.exportDocxParts(DOC_HTML, null, null); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const media = parts ? parts.names.filter(n => n.startsWith('word/media/')) : [];
      const pass = !error && events.length === 1 && events[0].downloadsSoFar === 0 && JSON.stringify(events[0].sites) === JSON.stringify(['images.exemple.test'])
        && net.urls.includes(EXTERNAL) && media.length === 1;
      return { pass, notes: JSON.stringify({ error: error && error.message, events, downloads: net.urls, media }) };
    },
  });

  cases.push({
    id: 'extimg_docx_refusal_downloads_nothing',
    description: 'Word d’une ligne : « Annuler » arrête l’export (erreur d’annulation), l’image n’est pas téléchargée et aucun fichier n’est produit',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => false });
      let parts = null; let error = null;
      try { parts = await h.exportDocxParts(DOC_HTML, null, null); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      return { pass: !parts && ExternalImages.isCancel(error) && net.urls.length === 0 && dialogs.asked.length === 1, notes: JSON.stringify({ error: error && error.name, downloads: net.urls }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 3) Les vraies lignes du menu Exporter
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  // Clique la ligne ou le bouton d'export. La fenêtre des images répond `imagesAnswer` ; toute autre confirmation (« Générer N PDF ? ») est acceptée et notée.
  async function clickExport(h, id, imagesAnswer, until) {
    const net = stubFetch();
    const dl = interceptDownloads();
    const status = watchStatus();
    const imageWindows = []; const otherConfirms = [];
    const dialogs = h.stubDialogs({ confirm: opts => {
      if (isImagesWindow(opts)) { imageWindows.push({ downloadsSoFar: net.urls.length, sites: sitesOf(opts.message) }); return imagesAnswer; }
      otherConfirms.push(opts.message);
      return true;
    } });
    try {
      document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await waitFor(h, () => until({ net, dl, status }), 60000);
    } finally { status.stop(); dialogs.restore(); dl.restore(); net.restore(); }
    return { downloads: dl.downloads, imageWindows, otherConfirms, fetched: net.urls, statuses: status.seen, finalStatus: document.getElementById('status-msg').textContent };
  }
  const cancelledStatus = () => I18n.t('status.exportCancelled');

  cases.push({
    id: 'extimg_pdf_button_refusal_says_export_cancelled',
    description: '« Exporter en PDF » : « Annuler » sur la fenêtre des images écrit « Export annulé. » (pas « Erreur génération PDF. »), ne télécharge rien et ne produit aucun PDF',
    run: async (h) => {
      await seed(h, DOC_HTML);
      const pdf = await interceptCreatePdf();
      const res = await clickExport(h, 'btn-export-pdf', false, c => c.status.seen.includes(cancelledStatus()));
      pdf.restore();
      const pass = res.imageWindows.length === 1 && res.imageWindows[0].downloadsSoFar === 0 && res.fetched.length === 0 && pdf.calls.length === 0
        && res.finalStatus === cancelledStatus() && !res.statuses.includes(I18n.t('status.pdfGenerationError'));
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, fetched: res.fetched, created: pdf.calls, statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_pdf_button_acceptance_exports',
    description: '« Exporter en PDF » : « Continuer » sur la fenêtre des images télécharge l’image et crée le PDF, état « PDF généré. »',
    run: async (h) => {
      await seed(h, DOC_HTML);
      const pdf = await interceptCreatePdf();
      const res = await clickExport(h, 'btn-export-pdf', true, c => c.status.seen.includes(I18n.t('status.pdfGenerated')) || c.status.seen.includes(I18n.t('status.pdfGenerationError')));
      pdf.restore();
      const pass = res.imageWindows.length === 1 && res.imageWindows[0].downloadsSoFar === 0 && res.fetched.includes(EXTERNAL) && pdf.calls.length === 1
        && res.finalStatus === I18n.t('status.pdfGenerated');
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, fetched: res.fetched, created: pdf.calls, statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_docx_button_refusal_says_export_cancelled',
    description: '« Exporter en DOCX » : « Annuler » sur la fenêtre des images écrit « Export annulé. », ne télécharge rien et ne produit aucun fichier',
    run: async (h) => {
      await seed(h, DOC_HTML);
      const res = await clickExport(h, 'v2-btn-export-docx', false, c => c.status.seen.includes(cancelledStatus()));
      const pass = res.imageWindows.length === 1 && res.fetched.length === 0 && res.downloads.length === 0 && res.finalStatus === cancelledStatus()
        && !res.statuses.includes(I18n.t('status.docxGenerationError'));
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, fetched: res.fetched, downloads: res.downloads.map(d => d.name), statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_batch_asks_once_for_all_rows',
    description: '« Exporter toutes les lignes en un seul PDF » : une seule fenêtre des images pour les trois lignes (le site accepté n’est pas redemandé), les trois lignes sont exportées dans un seul PDF',
    run: async (h) => {
      await seed(h, '<p>Bonjour</p>' + img(EXTERNAL));
      const res = await clickExport(h, 'v2-btn-export-pdf-merged', true, c => c.dl.downloads.length > 0);
      const dl = res.downloads[0];
      const pass = res.imageWindows.length === 1 && res.imageWindows[0].downloadsSoFar === 0 && res.otherConfirms.length === 1
        && res.fetched.filter(u => u === EXTERNAL).length >= NAMES.length && res.downloads.length === 1 && dl.name === TABLE + '-export.pdf'
        && res.finalStatus === I18n.t('status.mergedExportDone', { ok: NAMES.length });
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, otherConfirms: res.otherConfirms.length, fetched: res.fetched.length, downloads: res.downloads.map(d => d.name), status: res.finalStatus }) };
    },
  });

  cases.push({
    id: 'extimg_batch_refusal_stops_the_whole_batch',
    description: 'Un lot (ZIP de PDF) : « Annuler » sur la fenêtre des images arrête tout le lot sur la première ligne : une seule fenêtre, rien de téléchargé, aucune archive, « Export annulé. » et aucune ligne comptée en échec',
    run: async (h) => {
      await seed(h, '<p>Bonjour</p>' + img(EXTERNAL));
      const res = await clickExport(h, 'v2-btn-export-pdf-batch', false, c => c.status.seen.includes(cancelledStatus()));
      const pass = res.imageWindows.length === 1 && res.fetched.length === 0 && res.downloads.length === 0 && res.finalStatus === cancelledStatus()
        && !res.statuses.some(s => /échec|failure/i.test(s));
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, fetched: res.fetched.length, downloads: res.downloads.map(d => d.name), statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_docx_batch_refusal_stops_the_whole_batch',
    description: 'Un lot DOCX (ZIP) : « Annuler » arrête tout le lot de la même façon : une fenêtre, rien de téléchargé, aucune archive, « Export annulé. »',
    run: async (h) => {
      await seed(h, '<p>Bonjour</p>' + img(EXTERNAL));
      const res = await clickExport(h, 'v2-btn-export-docx-batch', false, c => c.status.seen.includes(cancelledStatus()));
      const pass = res.imageWindows.length === 1 && res.fetched.length === 0 && res.downloads.length === 0 && res.finalStatus === cancelledStatus();
      return { pass, notes: JSON.stringify({ windows: res.imageWindows, fetched: res.fetched.length, downloads: res.downloads.map(d => d.name), statuses: res.statuses }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 4) L'export Excel d'une grille (js/xlsx-export.js) : même téléchargement d'images, même fenêtre
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const GRID_HTML = `<table style="width: 200px;"><colgroup><col style="width: 200px;"></colgroup><tbody><tr data-row-height="60" style="height: 60px"><td colwidth="200"><p>Logo ${img(EXTERNAL)}</p></td></tr></tbody></table>`;
  const RECORD = { id: 1, Nom: NAMES[0] };
  async function enterGrid(h, html) {
    await seed(h, '<p>x</p>');
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await h.sleep(250);
    GridEditor.setActive(false);
    Editor.setHTML(html);
    GridEditor.setActive(true);
    await h.sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(250);
    GridEditor.setActive(false);
  }

  cases.push({
    id: 'extimg_xlsx_window_comes_before_any_download',
    description: 'Excel d’une ligne : la fenêtre s’ouvre avant le moindre téléchargement ; acceptée, l’image est téléchargée et se retrouve dans xl/media ; refusée, erreur d’annulation, rien de téléchargé et aucun classeur',
    run: async (h) => {
      await seed(h, '<p>x</p>');
      const net = stubFetch();
      const events = [];
      let accepted = null; let error = null; let refused = null; let refusedError = null; let media = [];
      try {
        const yes = h.stubDialogs({ confirm: opts => { events.push({ downloadsSoFar: net.urls.length, sites: sitesOf(opts.message) }); return true; } });
        try { accepted = await XlsxExport.getXlsxBlobForRecord(GRID_HTML, TABLE, RECORD, ''); } catch (e) { error = e; }
        yes.restore();
        if (accepted) { await ExportCommon.ensureJsZipLoaded(); media = Object.keys((await JSZip.loadAsync(accepted.blob)).files).filter(n => n.startsWith('xl/media/') && !n.endsWith('/')); }
        net.urls.length = 0;
        const no = h.stubDialogs({ confirm: () => false });
        try { refused = await XlsxExport.getXlsxBlobForRecord(GRID_HTML, TABLE, RECORD, ''); } catch (e) { refusedError = e; }
        no.restore();
      } finally { net.restore(); }
      const pass = !error && events.length === 1 && events[0].downloadsSoFar === 0 && JSON.stringify(events[0].sites) === JSON.stringify(['images.exemple.test']) && media.length === 1
        && !refused && ExternalImages.isCancel(refusedError) && net.urls.length === 0;
      return { pass, notes: JSON.stringify({ error: error && error.message, events, media, refused: !!refused, refusedError: refusedError && refusedError.name, downloadsAfterRefusal: net.urls }) };
    },
  });

  cases.push({
    id: 'extimg_xlsx_single_workbook_refusal_downloads_nothing',
    description: 'Un seul classeur pour toutes les valeurs : la fenêtre s’ouvre avant le moindre téléchargement, un site accepté n’est pas redemandé pour la feuille suivante (même lancement) ; refusée, erreur d’annulation et rien de téléchargé',
    run: async (h) => {
      await seed(h, '<p>x</p>');
      const net = stubFetch();
      const events = [];
      let answer = true; let log = [];
      try {
        const dialogs = h.stubDialogs({ confirm: opts => { events.push({ downloadsSoFar: net.urls.length, sites: sitesOf(opts.message) }); return answer; } });
        ExternalImages.beginRun();
        const workbook = await XlsxExport.createSingleWorkbook();
        const append = async () => { try { await workbook.appendRecord(GRID_HTML, TABLE, RECORD, ''); log.push('ok'); } catch (e) { log.push(ExternalImages.isCancel(e) ? 'annulé' : 'erreur ' + e.message); } };
        await append(); await append();
        const askedWhileAccepted = events.length;
        net.urls.length = 0;
        ExternalImages.endRun();
        answer = false;
        ExternalImages.beginRun();
        const refusing = await XlsxExport.createSingleWorkbook();
        try { await refusing.appendRecord(GRID_HTML, TABLE, RECORD, ''); log.push('ok'); } catch (e) { log.push(ExternalImages.isCancel(e) ? 'annulé' : 'erreur ' + e.message); }
        ExternalImages.endRun();
        dialogs.restore();
        const pass = askedWhileAccepted === 1 && events[0].downloadsSoFar === 0 && JSON.stringify(log) === JSON.stringify(['ok', 'ok', 'annulé']) && net.urls.length === 0 && events.length === 2;
        return { pass, notes: JSON.stringify({ log, events, downloadsAfterRefusal: net.urls }) };
      } finally { net.restore(); }
    },
  });

  cases.push({
    id: 'extimg_xlsx_buttons_refusal_says_export_cancelled_and_acceptance_exports',
    description: 'Les trois lignes Excel du menu Exporter (une valeur, ZIP de classeurs, classeur unique) : « Annuler » sur la fenêtre des images écrit « Export annulé. » (pas une erreur), ne télécharge rien et ne produit aucun fichier, un lot s’arrête sur la première valeur ; « Continuer » exporte avec UNE seule fenêtre pour toutes les valeurs',
    run: async (h) => {
      await enterGrid(h, GRID_HTML);
      const bad = [];
      try {
        for (const id of ['v2-btn-export-xlsx', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single']) {
          const res = await clickExport(h, id, false, c => c.status.seen.includes(cancelledStatus()));
          const wrong = res.statuses.filter(t => /erreur|error|échec|failure/i.test(t));
          if (res.imageWindows.length !== 1 || res.imageWindows[0].downloadsSoFar !== 0 || res.fetched.length || res.downloads.length || res.finalStatus !== cancelledStatus() || wrong.length)
            bad.push(id + ' refus : ' + JSON.stringify({ windows: res.imageWindows, fetched: res.fetched.length, downloads: res.downloads.map(d => d.name), status: res.finalStatus, wrong }));
        }
        const single = await clickExport(h, 'v2-btn-export-xlsx-single', true, c => c.dl.downloads.length > 0);
        if (single.imageWindows.length !== 1 || single.downloads.length !== 1 || !/\.xlsx$/.test(single.downloads[0].name) || single.fetched.filter(u => u === EXTERNAL).length < NAMES.length
          || single.finalStatus !== I18n.t('status.singleWorkbookDone', { ok: NAMES.length }))
          bad.push('classeur unique accepté : ' + JSON.stringify({ windows: single.imageWindows.length, downloads: single.downloads.map(d => d.name), fetched: single.fetched.length, status: single.finalStatus }));
        const zip = await clickExport(h, 'v2-btn-export-xlsx-batch', true, c => c.dl.downloads.length > 0);
        if (zip.imageWindows.length !== 1 || zip.downloads.length !== 1 || !/\.zip$/.test(zip.downloads[0].name) || zip.finalStatus !== I18n.t('status.batchExportDoneXlsx', { ok: NAMES.length }))
          bad.push('ZIP accepté : ' + JSON.stringify({ windows: zip.imageWindows.length, downloads: zip.downloads.map(d => d.name), status: zip.finalStatus }));
        const one = await clickExport(h, 'v2-btn-export-xlsx', true, c => c.dl.downloads.length > 0);
        if (one.imageWindows.length !== 1 || one.downloads.length !== 1 || !/\.xlsx$/.test(one.downloads[0].name) || one.finalStatus !== I18n.t('status.xlsxGenerated'))
          bad.push('une valeur acceptée : ' + JSON.stringify({ windows: one.imageWindows.length, downloads: one.downloads.map(d => d.name), status: one.finalStatus }));
      } finally { await leaveGrid(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 5) L'affichage : toute image qui charge depuis un autre site est signalée en permanence (contour en tirets, infobulle), sans rien changer à la mise en page
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const SHOWN = [['https://affiche.test/logo.png', 'affiche.test'], ['https://autre.test:8443/c.png', 'autre.test:8443'], ['//cdn3.test/d.png', 'cdn3.test'], ['http://clair.test/e.png', 'clair.test']];
  const QUIET = [DATA_PNG, 'blob:' + location.origin + '/0b1c', 'images/relatif.png', location.origin + '/meme-origine.png', 'ftp://fichiers.test/e.png'];
  const tipOf = site => I18n.t('image.externalSite', { site });
  const dashedRed = img => { const css = getComputedStyle(img); return css.outlineStyle === 'dashed' && css.outlineWidth === '3px' && css.outlineColor === 'rgb(197, 48, 48)'; };
  const stateOf = img => ({ src: (img.getAttribute('src') || '').slice(0, 40), site: img.getAttribute('data-external-site'), tip: img.title, dashed: dashedRed(img) });
  // Ce que l'affichage doit montrer : les adresses de SHOWN signalées (hôte, infobulle, contour), les autres ni signalées ni cernées.
  function displayProblems(images) {
    const problems = [];
    const byUrl = new Map(images.map(img => [img.getAttribute('src'), img]));
    SHOWN.forEach(([src, site]) => {
      const img = byUrl.get(src);
      if (!img) { problems.push('absente : ' + src); return; }
      const state = stateOf(img);
      if (state.site !== site || state.tip !== tipOf(site) || !state.dashed) problems.push('non signalée : ' + JSON.stringify(state));
    });
    QUIET.forEach(src => {
      const img = byUrl.get(src);
      if (!img) { problems.push('absente : ' + src.slice(0, 30)); return; }
      const state = stateOf(img);
      if (state.site !== null || state.tip || state.dashed) problems.push('signalée à tort : ' + JSON.stringify(state));
    });
    return problems;
  }
  const showAllHtml = () => '<p>Affichage</p>' + SHOWN.concat(QUIET.map(src => [src])).map(([src]) => img(src)).join('');
  function restoreContainers() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }

  cases.push({
    id: 'extimg_display_editor_flags_external_images_only',
    description: 'Éditeur : une image d’un autre site (http(s) hors du widget, « // » compris) porte son hôte et une infobulle et est cernée de tirets rouges ; data:, blob:, adresse relative, même origine et ftp: ne sont pas signalées ; rien de cela n’entre dans le HTML enregistré',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(showAllHtml());
      await h.sleep(250);
      const images = Array.from(document.querySelectorAll('.tiptap img.editor-image'));
      const problems = displayProblems(images);
      const saved = Editor.getHTML();
      if (/data-external-site|Image hébergée sur un site externe|Image hosted on an external site/.test(saved)) problems.push('le signalement est entré dans le HTML enregistré');
      await h.resetEditor();
      return { pass: images.length === SHOWN.length + QUIET.length && problems.length === 0, notes: JSON.stringify({ images: images.length, problems }) };
    },
  });

  cases.push({
    id: 'extimg_display_reader_flags_every_image_even_without_the_editor_class',
    description: 'Lecture : même signalement, y compris pour une image brute écrite à la main dans le modèle (sans la classe de l’éditeur), la seule que l’éditeur ne montrerait pas',
    run: async (h) => {
      await h.resetEditor();
      const raw = '<p><img src="https://brut.test/pixel.png" alt=""></p>';
      let content = null; let problems = [];
      try {
        content = await h.renderReaderMode(showAllHtml() + raw, NO_HF);
        await h.sleep(250);
        const images = Array.from(content.querySelectorAll('img'));
        problems = displayProblems(images);
        const rawImg = images.find(i => i.getAttribute('src') === 'https://brut.test/pixel.png');
        if (!rawImg || rawImg.getAttribute('data-external-site') !== 'brut.test' || !dashedRed(rawImg)) problems.push('image brute non signalée : ' + JSON.stringify(rawImg && stateOf(rawImg)));
      } finally { restoreContainers(); }
      return { pass: !!content && problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'extimg_display_reader_flags_header_and_footer_images',
    description: 'Lecture en pages (Aperçu A4) : l’image d’un autre site posée dans l’en-tête ou dans le pied de page l’est aussi - toute la page est surveillée, pas seulement le corps',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: img('https://entete.test/h.png'), first: '' }, footer: { default: img('https://pied.test/f.png'), first: '' } };
      const seen = {};
      try {
        h.setA4Preview(true);
        await h.renderReaderMode('<p>Corps</p>', hf);
        await h.sleep(300);
        const top = document.querySelector('#reader-container .v2-page-edge-top img');
        const bottom = document.querySelector('#reader-container .v2-page-edge-bottom img');
        seen.header = top && stateOf(top); seen.footer = bottom && stateOf(bottom);
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = !!seen.header && seen.header.site === 'entete.test' && seen.header.dashed && !!seen.footer && seen.footer.site === 'pied.test' && seen.footer.dashed;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_display_attachment_images_are_trusted_only_from_the_grist_server',
    description: 'Une image de pièce jointe servie par le serveur de Grist (hôte du jeton) n’est pas signalée ; la même marque posée sur une autre adresse l’est, et une image sans la marque servie par Grist l’est aussi',
    run: async (h) => {
      const original = GristAPI.getAttachmentDownloadUrl;
      GristAPI.getAttachmentDownloadUrl = async id => 'https://grist.fictif.test/api/docs/stub/attachments/' + id + '/download?auth=jeton';
      const host = document.createElement('div');
      try {
        host.innerHTML = '<img id="pj-grist" class="editor-image" data-source="attachment" data-attachment-id="7" src="https://grist.fictif.test/api/docs/stub/attachments/7/download?auth=jeton">'
          + '<img id="pj-ailleurs" class="editor-image" data-source="attachment" data-attachment-id="7" src="https://tiers.test/x.png">'
          + '<img id="sans-marque" class="editor-image" src="https://grist.fictif.test/api/docs/stub/attachments/7/download?auth=jeton">';
        document.body.appendChild(host);
        await h.sleep(300);
        const state = id => stateOf(host.querySelector('#' + id));
        const seen = { grist: state('pj-grist'), ailleurs: state('pj-ailleurs'), sansMarque: state('sans-marque') };
        const pass = seen.grist.site === null && !seen.grist.dashed && seen.ailleurs.site === 'tiers.test' && seen.ailleurs.dashed && seen.sansMarque.site === 'grist.fictif.test' && seen.sansMarque.dashed;
        return { pass, notes: JSON.stringify(seen) };
      } finally { GristAPI.getAttachmentDownloadUrl = original; host.remove(); }
    },
  });

  cases.push({
    id: 'extimg_display_follows_src_changes_and_language',
    description: 'Une image qui change d’adresse suit : signalée quand elle part vers un autre site, plus signalée (hôte, infobulle, contour retirés) quand elle revient à une image intégrée, nouvel hôte quand elle change de site ; l’infobulle change de langue avec l’interface',
    run: async (h) => {
      const host = document.createElement('div');
      const lang = I18n.getLang();
      const seen = {};
      try {
        const image = document.createElement('img');
        image.src = DATA_PNG;
        image.style.width = '90px';
        host.appendChild(image);
        document.body.appendChild(host);
        await h.sleep(60);
        seen.first = stateOf(image);
        image.src = 'https://un.test/a.png';
        await h.sleep(60);
        seen.second = stateOf(image);
        image.src = 'https://deux.test:81/b.png';
        await h.sleep(60);
        seen.third = stateOf(image);
        I18n.setLang('en');
        seen.english = image.title;
        I18n.setLang('fr');
        seen.french = image.title;
        image.src = DATA_PNG;
        await h.sleep(60);
        seen.last = stateOf(image);
        seen.hadTitleAfter = image.hasAttribute('title');
        const pass = seen.first.site === null && !seen.first.dashed
          && seen.second.site === 'un.test' && seen.second.tip === tipOf('un.test') && seen.second.dashed
          && seen.third.site === 'deux.test:81' && seen.third.tip === tipOf('deux.test:81')
          && seen.english === 'Image hosted on an external site (deux.test:81): every display downloads it from that site.'
          && seen.french === 'Image hébergée sur un site externe (deux.test:81) : chaque affichage la télécharge depuis ce site.'
          && seen.last.site === null && !seen.last.dashed && !seen.hadTitleAfter;
        return { pass, notes: JSON.stringify(seen) };
      } finally { I18n.setLang(lang); host.remove(); }
    },
  });

  cases.push({
    id: 'extimg_display_marker_changes_no_layout',
    description: 'Le signalement ne prend aucune place : une image signalée garde exactement la boîte (position et taille) qu’elle avait sans le signalement, donc ni l’éditeur, ni la Lecture, ni la pagination, ni le PDF ne bougent',
    run: async (h) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:20px;top:20px;width:400px';
      host.innerHTML = '<p>avant</p><img id="mesure" src="' + DATA_PNG + '" style="width:120px;height:80px"><p>après</p>';
      document.body.appendChild(host);
      try {
        await h.sleep(60);
        const image = host.querySelector('#mesure');
        const box = () => { const r = image.getBoundingClientRect(); const p = host.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, p.height].map(n => Math.round(n * 100) / 100); };
        image.src = 'https://mesure.test/x.png';
        await h.sleep(60);
        const flagged = image.hasAttribute('data-external-site');
        const during = box();
        // Le même élément, le signalement retiré à la main (l'observateur ne le remet que si l'adresse change) : seule la feuille de style change entre les deux mesures.
        image.removeAttribute('data-external-site');
        const without = box();
        return { pass: flagged && JSON.stringify(without) === JSON.stringify(during) && during[2] === 120 && during[3] === 80, notes: JSON.stringify({ during, without, flagged }) };
      } finally { host.remove(); }
    },
  });

  cases.push({
    id: 'extimg_site_of_matches_the_export_window',
    description: 'ExternalImages.siteOf donne l’hôte (port compris) des seules adresses que la fenêtre d’export liste : mêmes sites, mêmes exclusions',
    run: async () => {
      const urls = SHOWN.map(pair => pair[0]).concat(QUIET, ['', '   ', 'https://exotique.test/ a.png', 'https://[invalide']);
      const fromDisplay = urls.map(src => ExternalImages.siteOf(src)).filter(Boolean);
      const dialogs = { asked: [] };
      const original = Dialogs.confirm;
      Dialogs.confirm = async opts => { dialogs.asked.push(opts); return true; };
      try { await ExternalImages.confirmExport(urls.map(img).join(''), null); } finally { Dialogs.confirm = original; }
      const fromExport = dialogs.asked.length ? sitesOf(dialogs.asked[0].message) : [];
      const pass = JSON.stringify(fromDisplay) === JSON.stringify(fromExport) && fromDisplay.length >= SHOWN.length;
      return { pass, notes: JSON.stringify({ fromDisplay, fromExport }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.externalImages = cases;
})();
