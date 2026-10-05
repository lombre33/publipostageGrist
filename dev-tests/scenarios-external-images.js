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
// Enfin, depuis le choix du 05/10 (« Bloquer jusqu'à un clic ») : une image d'un autre site ne charge qu'après un clic « Afficher ». Le cadre dans un HTML qui va s'afficher
// (ExternalImages.block : Lecture, en-têtes et pieds, galerie), dans la vue de l'éditeur, son bouton, l'adresse qui reste dans le modèle, le clic et le clavier, ce que la fenêtre
// d'export ne redemande plus, les copies d'une image répétée.
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

  // Depuis le choix du 05/10 (« Bloquer jusqu'à un clic »), une image d'un autre site ne charge qu'une fois son site affiché : ces scénarios d'affichage regardent
  // le signalement des images AFFICHÉES, leurs sites sont donc affichés d'abord (les cadres sont l'objet de la partie 6).
  const showSites = sites => sites.forEach(site => ExternalImages.allow(site));

  cases.push({
    id: 'extimg_display_editor_flags_external_images_only',
    description: 'Éditeur : une image d’un autre site (http(s) hors du widget, « // » compris) porte son hôte et une infobulle et est cernée de tirets rouges ; data:, blob:, adresse relative, même origine et ftp: ne sont pas signalées ; rien de cela n’entre dans le HTML enregistré',
    run: async (h) => {
      showSites(SHOWN.map(pair => pair[1]));
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
      showSites(SHOWN.map(pair => pair[1]).concat('brut.test'));
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
      showSites(['entete.test', 'pied.test']);
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
      // Des sites à part (« cmp- ») : ceux de SHOWN sont déjà affichés par les scénarios d'affichage, et la fenêtre ne liste pas un site affiché.
      const fresh = src => src.replace(/^((?:https?:)?\/\/)/i, '$1cmp-');
      const urls = SHOWN.map(pair => fresh(pair[0])).concat(QUIET, ['', '   ', 'https://exotique.test/ a.png', 'https://[invalide']);
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

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 6) Le blocage jusqu'au clic « Afficher » (choix du 05/10, « Bloquer jusqu'à un clic »)
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // Chaque scénario a ses propres sites « .test » : un site affiché le reste pour toute la session de la page, il ne doit pas déteindre sur le suivant.

  const parse = html => { const t = document.createElement('template'); t.innerHTML = html; return Array.from(t.content.querySelectorAll('img')); };
  const frameState = image => ({
    src: image.getAttribute('src'), site: image.getAttribute('data-blocked-site'), original: image.getAttribute('data-blocked-src'), role: image.getAttribute('role'),
    tab: image.getAttribute('tabindex'), alt: image.getAttribute('alt'), title: image.getAttribute('title'), keptAlt: image.getAttribute('data-blocked-alt'),
    keptTitle: image.getAttribute('data-blocked-title'),
  });
  const svgOf = src => decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

  cases.push({
    id: 'extimg_block_html_replaces_external_images_with_frames',
    description: 'ExternalImages.block(html) : une image d’un autre site prend un cadre dessiné (SVG en data:) qui nomme le site et dit « Afficher », garde son adresse, son alt et son titre dans data-blocked-*, devient un bouton (role, tabindex) et garde son style ; data:, blob:, adresse relative, même origine, ftp: et pièce jointe restent telles quelles ; un HTML sans rien à bloquer est rendu tel quel (même chaîne)',
    run: async () => {
      const external = '<img class="editor-image" src="https://bloc1.test/a.png" alt="Logo" title="Titre" style="width: 90px;">';
      const quiet = [DATA_PNG, 'blob:' + location.origin + '/0b1c', 'images/relatif.png', location.origin + '/meme.png', 'ftp://fichiers.test/e.png'];
      const attachment = '<img data-attachment-id="7" src="https://grist.fictif.test/api/docs/x/attachments/7/download">';
      const html = '<p>Texte</p>' + external + quiet.map(src => '<img src="' + src + '">').join('') + attachment + '<img src="//bloc1.test/b.png">';
      const out = ExternalImages.block(html);
      const images = parse(out);
      const blocked = images.filter(i => i.hasAttribute('data-blocked-src'));
      const first = blocked[0] && frameState(blocked[0]);
      const problems = [];
      if (blocked.length !== 2) problems.push('images bloquées : ' + blocked.length);
      if (first) {
        if (!/^data:image\/svg\+xml;charset=utf-8,/.test(first.src)) problems.push('pas un cadre SVG : ' + first.src.slice(0, 50));
        const svg = svgOf(first.src);
        if (!svg.includes('bloc1.test') || !svg.includes(I18n.t('image.blocked.show'))) problems.push('le cadre ne dit pas le site et « Afficher »');
        if (first.original !== 'https://bloc1.test/a.png' || first.site !== 'bloc1.test') problems.push('adresse ou site perdus : ' + JSON.stringify(first));
        if (first.role !== 'button' || first.tab !== '0') problems.push('pas un bouton : ' + JSON.stringify(first));
        if (first.alt !== I18n.t('image.blocked.alt', { site: 'bloc1.test' }) || first.title !== ExternalImages.hintOf('bloc1.test')) problems.push('alt ou titre : ' + JSON.stringify(first));
        if (first.keptAlt !== 'Logo' || first.keptTitle !== 'Titre') problems.push('alt et titre d\'origine non gardés : ' + JSON.stringify(first));
        if (!/width: 90px/.test(blocked[0].getAttribute('style') || '') || !blocked[0].classList.contains('editor-image')) problems.push('style ou classe perdus');
      }
      if (blocked[1] && blocked[1].getAttribute('data-blocked-src') !== '//bloc1.test/b.png') problems.push('adresse sans protocole perdue');
      const untouched = images.filter(i => !i.hasAttribute('data-blocked-src')).map(i => i.getAttribute('src'));
      const expectedUntouched = quiet.concat(['https://grist.fictif.test/api/docs/x/attachments/7/download']);
      if (JSON.stringify(untouched) !== JSON.stringify(expectedUntouched)) problems.push('images touchées à tort : ' + JSON.stringify(untouched));
      const plain = '<p>Rien</p>' + quiet.map(src => '<img src="' + src + '">').join('');
      if (ExternalImages.block(plain) !== plain) problems.push('un HTML sans image à bloquer n\'est pas rendu tel quel');
      if (ExternalImages.block('<p>Pas d\'image</p>') !== '<p>Pas d\'image</p>' || ExternalImages.block('') !== '' || ExternalImages.block(null) !== null) problems.push('chaîne sans image ou vide modifiée');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'extimg_block_html_reads_addresses_the_way_the_browser_does',
    description: 'block(html) lit les adresses après décodage et sans tenir compte de la casse : « &#104;ttps:// », « HTTPS:// » et « // » sont bloquées comme « https:// » ; deux appels de suite donnent le même HTML (un cadre n’est pas bloqué une seconde fois)',
    run: async () => {
      const html = '<img id="a" src="&#104;ttps://deco1.test/x.png"><img id="b" src="HTTPS://MAJ1.test/x.png"><img id="c" src=" https://espace1.test/x.png "><img id="d" src=\'//proto1.test/x.png\'>';
      const out = ExternalImages.block(html);
      const sites = parse(out).map(i => i.getAttribute('data-blocked-site'));
      const twice = ExternalImages.block(out);
      const pass = JSON.stringify(sites) === JSON.stringify(['deco1.test', 'maj1.test', 'espace1.test', 'proto1.test']) && twice === out;
      return { pass, notes: JSON.stringify({ sites, idempotent: twice === out }) };
    },
  });

  cases.push({
    id: 'extimg_block_frame_is_drawn_against_the_sheet_zoom_and_follows_the_language',
    description: 'Le cadre dessiné ne grandit ni ne rétrécit avec la boîte de l’image et est à l’envers du facteur de la feuille : à 0,5 le texte et le bouton sont dessinés deux fois plus grands (11 px et 64 × 22 px d’écran), à 1 à leur taille ; sans option, le facteur est celui de la page (--pp-fit-zoom) ; un cadre déjà dans la page suit la langue (texte, alt, titre) en gardant son facteur',
    run: async (h) => {
      const one = '<img id="z" src="https://zoom1.test/a.png">';
      const sizes = html => {
        const svg = svgOf(parse(html)[0].getAttribute('src'));
        return { font: Number((svg.match(/font-size='([\d.]+)'/) || [])[1]), button: (svg.match(/<rect x='-?[\d.]+' y='-?[\d.]+' width='([\d.]+)' height='([\d.]+)'/) || []).slice(1).map(Number), viewBox: /viewBox/.test(svg), show: (svg.match(/>(Afficher|Show)<\/text>/) || [])[1] };
      };
      const half = sizes(ExternalImages.block(one, { zoom: 0.5 }));
      const full = sizes(ExternalImages.block(one, { zoom: 1 }));
      const container = document.getElementById('editor-container');
      const previous = container.style.getPropertyValue('--pp-fit-zoom');
      container.style.setProperty('--pp-fit-zoom', '0.8');
      const ofPage = sizes(ExternalImages.block(one));
      if (previous) container.style.setProperty('--pp-fit-zoom', previous); else container.style.removeProperty('--pp-fit-zoom');
      const host = document.createElement('div');
      host.innerHTML = ExternalImages.block('<img id="l" src="https://zoom2.test/a.png" alt="Logo">', { zoom: 0.5 });
      document.body.appendChild(host);
      const seen = { half, full, ofPage };
      try {
        I18n.setLang('en');
        await h.sleep(60);
        const frame = host.querySelector('#l');
        seen.english = { show: sizes(host.innerHTML).show, font: sizes(host.innerHTML).font, alt: frame.getAttribute('alt'), title: frame.getAttribute('title').slice(0, 30), kept: frame.getAttribute('data-blocked-alt') };
      } finally { I18n.setLang('fr'); host.remove(); }
      const pass = half.font === 22 && JSON.stringify(half.button) === '[128,44]' && full.font === 11 && JSON.stringify(full.button) === '[64,22]'
        && ofPage.font === 13.75 && JSON.stringify(ofPage.button) === '[80,27.5]' && !half.viewBox && half.show === 'Afficher'
        && seen.english.show === 'Show' && seen.english.font === 22 && seen.english.alt === 'Show the image from zoom2.test' && /^Image hosted on an external/.test(seen.english.title) && seen.english.kept === 'Logo';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_allow_restores_addresses_in_html_and_in_live_frames',
    description: 'ExternalImages.allow(site) : les cadres vivants de la page de ce site reprennent leur adresse, leur alt et leur titre (plus de rôle ni de data-blocked-*) puis sont signalés comme toute image affichée ; un cadre d’un autre site reste ; block(html) rend ensuite leur adresse aux cadres déjà dans une chaîne ; les abonnés (onReveal) sont prévenus une fois, un site déjà affiché ne prévient personne',
    run: async (h) => {
      const html = '<img id="x1" src="https://rev1.test/a.png" alt="Logo" title="Titre"><img id="x2" src="https://rev1.test/b.png"><img id="y" src="https://rev2.test/c.png">';
      const blockedString = ExternalImages.block(html);
      const host = document.createElement('div');
      host.innerHTML = blockedString;
      document.body.appendChild(host);
      const told = [];
      ExternalImages.onReveal(site => told.push(site));
      try {
        const before = Array.from(host.querySelectorAll('img')).map(i => i.hasAttribute('data-blocked-src'));
        ExternalImages.allow('rev1.test');
        ExternalImages.allow('rev1.test');
        await h.sleep(80);
        const x1 = host.querySelector('#x1'); const x2 = host.querySelector('#x2'); const y = host.querySelector('#y');
        const attrs = i => ['data-blocked-src', 'data-blocked-site', 'data-blocked-alt', 'data-blocked-title', 'role', 'tabindex'].filter(n => i.hasAttribute(n));
        const seen = {
          before, told,
          x1: { src: x1.getAttribute('src'), alt: x1.getAttribute('alt'), left: attrs(x1), site: x1.getAttribute('data-external-site') },
          x2: { src: x2.getAttribute('src'), left: attrs(x2), site: x2.getAttribute('data-external-site') },
          y: { blocked: y.hasAttribute('data-blocked-src'), src: y.getAttribute('src').slice(0, 24) },
          stringAfter: parse(ExternalImages.block(blockedString)).map(i => i.getAttribute('src')),
          allowed: [ExternalImages.isAllowed('rev1.test'), ExternalImages.isAllowed('rev2.test')],
        };
        const pass = JSON.stringify(before) === '[true,true,true]' && JSON.stringify(told) === '["rev1.test"]'
          && seen.x1.src === 'https://rev1.test/a.png' && seen.x1.alt === 'Logo' && seen.x1.left.length === 0 && seen.x1.site === 'rev1.test'
          && seen.x2.src === 'https://rev1.test/b.png' && seen.x2.left.length === 0 && seen.x2.site === 'rev1.test'
          && seen.y.blocked && seen.y.src.startsWith('data:image/svg+xml')
          && JSON.stringify(seen.stringAfter) === JSON.stringify(['https://rev1.test/a.png', 'https://rev1.test/b.png', parse(blockedString)[2].getAttribute('src')])
          && JSON.stringify(seen.allowed) === '[true,false]';
        return { pass, notes: JSON.stringify(seen) };
      } finally { host.remove(); }
    },
  });

  cases.push({
    id: 'extimg_click_or_key_on_a_frame_shows_its_site',
    description: 'Un clic sur un cadre, ou Entrée ou Espace quand il a le focus, affiche le site de l’image (avec preventDefault) sans que l’élément qui le contient reçoive le clic (la zone d’en-tête de l’éditeur ne s’ouvre pas) ; une autre touche ne fait rien',
    run: async (h) => {
      const host = document.createElement('div');
      host.innerHTML = ExternalImages.block('<img id="c" src="https://clic1.test/a.png"><img id="e" src="https://clic2.test/a.png"><img id="s" src="https://clic3.test/a.png"><img id="t" src="https://clic4.test/a.png">');
      document.body.appendChild(host);
      let reached = 0;
      host.addEventListener('click', () => { reached++; });
      try {
        const fire = (id, type, init) => { const e = new (type === 'click' ? MouseEvent : KeyboardEvent)(type, Object.assign({ bubbles: true, cancelable: true }, init)); host.querySelector('#' + id).dispatchEvent(e); return e; };
        const click = fire('c', 'click');
        const enter = fire('e', 'keydown', { key: 'Enter' });
        const space = fire('s', 'keydown', { key: ' ' });
        fire('t', 'keydown', { key: 'a' });
        fire('t', 'keydown', { key: 'Tab' });
        await h.sleep(60);
        const shown = ['clic1.test', 'clic2.test', 'clic3.test', 'clic4.test'].map(site => ExternalImages.isAllowed(site));
        const pass = JSON.stringify(shown) === '[true,true,true,false]' && click.defaultPrevented && enter.defaultPrevented && space.defaultPrevented && reached === 0;
        return { pass, notes: JSON.stringify({ shown, reached, prevented: [click.defaultPrevented, enter.defaultPrevented, space.defaultPrevented] }) };
      } finally { host.remove(); }
    },
  });

  cases.push({
    id: 'extimg_editor_view_withholds_the_address_until_the_site_is_shown',
    description: 'Éditeur : l’image d’un autre site n’a pas d’adresse dans le DOM tant que son site n’est pas affiché (cadre, nom du site, vrai bouton « Afficher »), alors que le modèle et le HTML enregistré gardent l’adresse ; le bouton affiche le site : l’image reprend son adresse dans toutes les vues de ce site, et le HTML enregistré ne bouge pas ; une image d’un autre site reste bloquée',
    run: async (h) => {
      await h.resetEditor();
      const url = 'https://vue1.test/logo.png'; const other = 'https://vue2.test/autre.png';
      Editor.setHTML('<p>Texte</p><p>' + img(url) + img(url) + '</p><p>' + img(other) + '</p>');
      await h.sleep(250);
      const views = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      const state = view => {
        const image = view.querySelector('img');
        return { blocked: view.classList.contains('editor-image-blocked'), src: image.getAttribute('src'), site: (view.querySelector('.editor-image-blocked-site') || {}).textContent, button: (view.querySelector('.editor-image-reveal') || {}).textContent, boxShown: getComputedStyle(view.querySelector('.editor-image-blocked-box')).display };
      };
      const before = views().map(state);
      const savedBefore = Editor.getHTML();
      const first = views()[0].querySelector('.editor-image-reveal');
      first.click();
      await h.sleep(250);
      const after = views().map(state);
      const savedAfter = Editor.getHTML();
      const flagged = views().map(view => view.querySelector('img').getAttribute('data-external-site'));
      await h.resetEditor();
      const pass = views().length === 0 && before.length === 3
        && before.every(v => v.blocked && !v.src && v.button === I18n.t('image.blocked.show') && v.boxShown !== 'none')
        && before[0].site === 'vue1.test' && before[2].site === 'vue2.test'
        && savedBefore.includes('src="' + url + '"') && savedBefore.includes('src="' + other + '"')
        && !after[0].blocked && after[0].src === url && !after[1].blocked && after[1].src === url && after[0].boxShown === 'none'
        && after[2].blocked && !after[2].src
        && savedAfter === savedBefore && flagged[0] === 'vue1.test' && flagged[1] === 'vue1.test' && !flagged[2];
      return { pass, notes: JSON.stringify({ before, after, flagged, sameHtml: savedAfter === savedBefore }) };
    },
  });

  cases.push({
    id: 'extimg_editor_view_blocked_frame_keeps_the_images_box',
    description: 'Éditeur : le cadre d’une image bloquée a exactement la largeur du modèle (style en ligne de l’image) et, sans largeur, en prend une ; il reste dans la page (jamais plus large que la ligne) ; l’image affichée a la même largeur : rien ne bouge quand la personne affiche le site',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p><img class="editor-image" src="https://boite1.test/a.png" style="width: 120px;"></p><p><img class="editor-image" src="https://boite1.test/b.png"></p>');
      await h.sleep(250);
      const widths = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view')).map(v => Math.round(v.getBoundingClientRect().width));
      const lineWidth = Math.round(document.querySelector('.tiptap').getBoundingClientRect().width);
      const blocked = widths();
      ExternalImages.allow('boite1.test');
      await h.sleep(250);
      const shown = widths();
      await h.resetEditor();
      await h.resetEditor();
      // Le cadre est dessiné dans la boîte de l'image : à la largeur du modèle près (120), et rien ne bouge quand le site est affiché.
      const pass = blocked[0] === 120 && shown[0] === 120 && blocked[1] === shown[1] && blocked[1] >= 96 && blocked[1] <= lineWidth;
      return { pass, notes: JSON.stringify({ blocked, shown, lineWidth }) };
    },
  });

  cases.push({
    id: 'extimg_reader_blocks_body_and_header_images_until_shown',
    description: 'Lecture en pages : l’image d’un autre site du corps et celle de l’en-tête prennent un cadre « Afficher » (pas d’adresse dans la page) ; le clic sur le cadre affiche le site, la mise en page se refait, et un nouveau rendu montre les images sans cadre',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: img('https://lect1.test/h.png'), first: '' }, footer: { default: '', first: '' } };
      const body = '<p>Corps</p>' + img('https://lect1.test/b.png') + img('https://lect2.test/c.png');
      const seen = {};
      try {
        h.setA4Preview(true);
        await h.renderReaderMode(body, hf);
        await h.sleep(300);
        const frames = () => Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.getAttribute('data-blocked-src'));
        seen.before = frames();
        const bodyFrame = document.querySelector('#reader-container .reader-content img[data-blocked-src="https://lect1.test/b.png"]');
        if (bodyFrame) bodyFrame.click();
        await h.sleep(400);
        seen.after = frames();
        seen.bodySrc = (document.querySelector('#reader-container .reader-content img[src="https://lect1.test/b.png"]') || {}).src || null;
        await h.renderReaderMode(body, hf);
        await h.sleep(300);
        seen.rerender = frames();
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = JSON.stringify(seen.before.slice().sort()) === JSON.stringify(['https://lect1.test/b.png', 'https://lect1.test/h.png', 'https://lect2.test/c.png'])
        && JSON.stringify(seen.after) === JSON.stringify(['https://lect2.test/c.png']) && seen.bodySrc === 'https://lect1.test/b.png'
        && JSON.stringify(seen.rerender) === JSON.stringify(['https://lect2.test/c.png']);
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_page_zones_get_frames_from_resolve_page_number_badges',
    description: 'PageLayout.resolvePageNumberBadges (le passage de tout en-tête et pied affichés : aperçu paginé de l’éditeur, Lecture) met le cadre « Afficher » aux images d’un autre site pas encore affichées et rend leur adresse à celles dont le site l’est ; les badges de page se résolvent comme avant',
    run: async () => {
      const html = '<p>Page <span class="page-number-badge" data-format="n">#</span></p><img src="https://zone1.test/a.png"><img src="' + DATA_PNG + '">';
      const out = PageLayout.resolvePageNumberBadges(html, 3, 9);
      const frames = parse(out).filter(i => i.hasAttribute('data-blocked-src')).map(i => i.getAttribute('data-blocked-src'));
      ExternalImages.allow('zone1.test');
      const later = PageLayout.resolvePageNumberBadges(out, 3, 9);
      const srcs = parse(later).map(i => i.getAttribute('src'));
      const pass = JSON.stringify(frames) === '["https://zone1.test/a.png"]' && out.includes('>3</span>') && srcs[0] === 'https://zone1.test/a.png' && srcs[1] === DATA_PNG && !/data-blocked/.test(later);
      return { pass, notes: JSON.stringify({ frames, srcs: srcs.map(s => s.slice(0, 30)) }) };
    },
  });

  cases.push({
    id: 'extimg_export_window_skips_the_sites_already_shown',
    description: 'La fenêtre d’avant l’export ne redemande pas un site que la personne a affiché (clic « Afficher ») : seuls les sites pas encore affichés sont listés, et aucune fenêtre quand tous le sont ; un site pas affiché est listé comme avant',
    run: async () => {
      const asked = [];
      const original = Dialogs.confirm;
      Dialogs.confirm = async opts => { asked.push(sitesOf(opts.message)); return true; };
      try {
        const both = img('https://vu1.test/a.png') + img('https://pasvu1.test/b.png');
        await ExternalImages.confirmExport(both, null);
        ExternalImages.allow('vu1.test');
        await ExternalImages.confirmExport(both, null);
        ExternalImages.allow('pasvu1.test');
        await ExternalImages.confirmExport(both, null);
      } finally { Dialogs.confirm = original; }
      const pass = JSON.stringify(asked) === JSON.stringify([['vu1.test', 'pasvu1.test'], ['pasvu1.test']]);
      return { pass, notes: JSON.stringify(asked) };
    },
  });

  cases.push({
    id: 'extimg_showing_a_site_is_kept_for_the_session_only',
    description: 'Afficher un site (allow) ne se retient que dans la page : ni localStorage ni sessionStorage ne changent, aucune action n’est envoyée au document Grist, le HTML d’un modèle garde ses adresses (le cadre d’un autre site reste) ; un site vide ou absent n’affiche rien (pas de « tout afficher »)',
    run: async (h) => {
      const stored = () => JSON.stringify({ local: Object.entries(localStorage).sort(), session: Object.entries(sessionStorage).sort() });
      const stub = window.__gristStub;
      const html = '<img id="a" src="https://sess1.test/a.png"><img id="b" src="https://sess2.test/b.png">';
      const before = stored();
      stub.clearActionLog();
      ExternalImages.allow('sess1.test');
      ExternalImages.allow('');
      ExternalImages.allow(null);
      ExternalImages.allow(undefined);
      await h.sleep(120);
      const images = parse(ExternalImages.block(html));
      const seen = {
        storageChanged: stored() !== before, actions: stub.getActionLog().length,
        srcs: images.map(i => i.getAttribute('src').slice(0, 24)), allowed: ['sess1.test', 'sess2.test', '', null].map(site => ExternalImages.isAllowed(site)),
      };
      const pass = !seen.storageChanged && seen.actions === 0 && seen.srcs[0] === 'https://sess1.test/a.png' && seen.srcs[1].startsWith('data:image/svg+xml')
        && JSON.stringify(seen.allowed) === '[true,false,false,false]';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // Une image « sur toutes les pages » : calque derrière le texte avec sa grille page (comme dev-tests/scenarios-full-pages.js), plusieurs feuilles de texte.
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const repeatedImg = src => `<p><img class="editor-image" src="${src}" alt="" style="width: 80px; height: 80px; position: absolute; left: 0px; top: 0px; z-index: -1;" data-layer="behind" data-wrap="inline" data-repeat="true" data-page-index="0" data-page-left-pt="-10" data-page-top-pt="-20"></p>`;
  const bodyLines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const editorCopies = () => Array.from(document.querySelectorAll('#editor-container .v2-page-layer img.v2-page-layer-copy')).map(i => i.getAttribute('src'));
  const readerCopies = () => Array.from(document.querySelectorAll('#reader-container .v2-page-layer img.v2-page-layer-copy')).map(i => i.getAttribute('src'));

  cases.push({
    id: 'extimg_blocked_images_are_not_repeated_on_every_page',
    description: 'Éditeur (Aperçu A4) : une image « sur toutes les pages » d’un autre site pas encore affichée n’est pas peinte en copie sur les autres feuilles (ses copies seraient des cadres ou chargeraient le site) ; son site affiché, ses copies se peignent à l’adresse de l’image ; une image intégrée est répétée comme avant',
    run: async (h) => {
      const url = 'https://repete1.test/f.png';
      const seen = {};
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        h.setA4Preview(true);
        Editor.setHeaderFooterData(JSON.parse(JSON.stringify(EMPTY_HF)));
        Editor.setHTML(repeatedImg(DATA_PNG) + bodyLines(130));
        Editor.refreshLayout();
        await h.sleep(400);
        seen.control = editorCopies().length;
        Editor.setHTML(repeatedImg(url) + bodyLines(130));
        Editor.refreshLayout();
        await h.sleep(400);
        seen.blocked = editorCopies();
        ExternalImages.allow('repete1.test');
        await h.sleep(600);
        seen.shown = editorCopies();
      } finally { h.setA4Preview(false); await h.resetEditor(); }
      const pass = seen.control >= 2 && seen.blocked.length === 0 && seen.shown.length >= 2 && seen.shown.every(src => src === url);
      return { pass, notes: JSON.stringify({ control: seen.control, blocked: seen.blocked.length, shown: seen.shown.length, srcs: Array.from(new Set(seen.shown)) }) };
    },
  });

  cases.push({
    id: 'extimg_reader_does_not_repeat_a_blocked_image_and_repeats_it_once_shown',
    description: 'Lecture en pages : une image « sur toutes les pages » d’un autre site pas encore affichée garde son cadre sur sa feuille et n’a aucune copie sur les autres ; le clic sur « Afficher » la rend à son adresse et les copies se peignent sur les autres feuilles',
    run: async (h) => {
      const url = 'https://repete2.test/f.png';
      const html = repeatedImg(url) + bodyLines(130);
      const seen = {};
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        h.setA4Preview(true);
        await h.renderReaderMode(html, JSON.parse(JSON.stringify(EMPTY_HF)));
        await h.sleep(400);
        const rc = document.getElementById('reader-container');
        seen.copiesBefore = readerCopies().length;
        const frame = rc.querySelector('img[data-blocked-src="' + url + '"]');
        seen.frame = !!frame;
        if (frame) frame.click();
        await h.sleep(800);
        seen.copiesAfter = readerCopies();
        seen.original = !!rc.querySelector('.reader-content img[src="' + url + '"]');
      } finally { h.setA4Preview(false); restoreContainers(); }
      const pass = seen.frame && seen.copiesBefore === 0 && seen.original && seen.copiesAfter.length >= 2 && seen.copiesAfter.every(src => src === url);
      return { pass, notes: JSON.stringify({ frame: seen.frame, before: seen.copiesBefore, after: seen.copiesAfter.length, original: seen.original }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.externalImages = cases;
})();
