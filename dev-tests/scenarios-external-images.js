// Suite "externalImages" - les images d'un autre site (js/external-images.js). Depuis la demande du 24/11 (« plus aucun appel vers un autre site » : la politique de contenu de la
// page n'en admettra plus), le widget ne télécharge JAMAIS une image d'un autre site : ni à l'affichage, ni à l'export, ni pour une miniature. L'adresse reste dans le document (rien n'est
// modifié ni perdu), mais le navigateur ne la reçoit jamais. Sept étages :
//  1) le module seul : ce qui se lit (data:, blob:, adresse relative, le widget, le serveur de Grist) et ce qui ne se lit plus ; plus de « Afficher », plus de fenêtre avant l'export ;
//  2) setAside : le HTML d'un export perd l'adresse de ses images d'un autre site (data-external-src) et, entré dans la page, ne charge rien (les requêtes sont mesurées, avec un témoin
//     qui prouve que la mesure voit un chargement) ;
//  3) les vrais exports (PDF, Word, Excel, HTML, Markdown) : aucune image téléchargée, aucune fenêtre, le nombre d'images laissées de côté dit dans le coin d'état ; le HTML et le Markdown,
//     fichiers de texte, gardent le lien ;
//  4) les vraies lignes du menu Exporter (un PDF, un Word, tout en un seul PDF) : le même état, un lot compte la même image une seule fois ;
//  5) l'AFFICHAGE : toute image de la page qui charge quand même depuis un autre site est signalée en permanence (hôte, infobulle, contour en tirets) ;
//  6) le cadre : dans un HTML qui va s'afficher (ExternalImages.block : Lecture, en-têtes et pieds, galerie), dans la vue de l'éditeur, avec l'adresse gardée dans le document ; les copies d'une
//     image répétée ; un clic sur le cadre de l'éditeur ou de la Lecture ouvre la fenêtre qui explique, l'ailleurs reste inerte ;
//  7) la FENÊTRE QUI EXPLIQUE (demande du 24/11 : « une pop-up qui s'ouvre et explique le pourquoi et la manip ; ensuite les images en place holder, et au clic la pop-up revient ») : le décompte
//     (survey), l'ouverture d'un vrai document (une fois par document et par session, pas en lecture seule), le contenu en français et en anglais, la fermeture et le focus, le clic sur un cadre de
//     l'éditeur, le cadre de la Lecture comme bouton, le collage qui prend la place du cadre en un seul « Annuler ».
// Les adresses sont en « .test » (jamais résolues) et `fetch` est remplacé le temps d'un cas : rien ne part sur le réseau.
(function () {
  const cases = [];
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const DATA_PNG = 'data:image/png;base64,' + PNG_B64;
  const TABLE = 'ExtImgTable';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const RECORD = { id: 1, Nom: NAMES[0] };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const img = src => `<img class="editor-image" src="${src}" alt="Image" style="width: 120px;">`;
  const EXTERNAL = 'https://images.exemple.test/logo.png';
  const DOC_HTML = '<p>Bonjour</p>' + img(EXTERNAL) + '<p>Merci.</p>';
  const HEADER = 'https://entete.test/h.png';
  const HF_WITH_IMAGE = { enabled: true, differentFirstPage: false, header: { default: img(HEADER), first: '' }, footer: { default: '', first: '' } };

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

  // Les requêtes d'image que le navigateur a faites vers ces sites : les chargements ratés comptent aussi (Chromium les note), c'est ce qui prouve qu'une <img> a essayé.
  const requestsTo = hosts => performance.getEntriesByType('resource').filter(e => hosts.some(host => e.name.indexOf('//' + host + '/') >= 0)).length;

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

  const parse = html => { const t = document.createElement('template'); t.innerHTML = html; return Array.from(t.content.querySelectorAll('img')); };

  // La fenêtre qui explique (js/external-images.js:explain) : son voile, ce qu'elle montre, son seul bouton visible (« Compris »). Un cas qui l'ouvre la ferme à la fin (closeExplain) : une fenêtre restée
  // ouverte garderait le clavier et couvrirait la page des cas qui suivent.
  const explainWindow = () => document.getElementById('pp-external-images-modal');
  const explainOpen = () => { const w = explainWindow(); return !!w && getComputedStyle(w).display !== 'none'; };
  const explainButtons = () => Array.from(document.querySelectorAll('#pp-external-images-modal .pp-modal-actions button')).filter(b => !b.hidden);
  const explainText = () => { const body = document.querySelector('#pp-external-images-modal .pp-external-images-body'); return body ? body.textContent : ''; };
  async function closeExplain(h) {
    if (!explainOpen()) return;
    explainButtons()[0].click();
    await h.sleep(40);
  }

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 1) Le module seul
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const SHOWN = [['https://affiche.test/logo.png', 'affiche.test'], ['https://autre.test:8443/c.png', 'autre.test:8443'], ['//cdn3.test/d.png', 'cdn3.test'], ['http://clair.test/e.png', 'clair.test']];
  const QUIET = [DATA_PNG, 'blob:' + location.origin + '/0b1c', 'images/relatif.png', location.origin + '/meme-origine.png', 'ftp://fichiers.test/e.png'];

  cases.push({
    id: 'extimg_may_read_only_data_blob_the_widget_and_the_grist_server',
    description: 'ExternalImages.mayRead : data:, blob:, une adresse relative, le widget et le serveur de Grist (l’origine du jeton) se lisent ; tout autre site (« // » compris), un protocole qui n’est pas http(s), une adresse vide ou illisible non',
    run: async () => {
      const gristUrl = await GristAPI.getAttachmentDownloadUrl(7);
      const origin = await GristAPI.getServerOrigin();
      const allowed = [DATA_PNG, 'blob:' + location.origin + '/0b1c', 'images/relatif.png', location.origin + '/meme-origine.png', gristUrl, ' ' + gristUrl + ' '];
      const refused = ['https://tiers.test/x.png', 'http://tiers.test/x.png', '//cdn.test/x.png', 'HTTPS://MAJ.test/x.png', 'https://faux-gist.test/api/docs/stub/attachments/7/download', 'ftp://fichiers.test/e.png',
        'javascript:alert(1)', 'file:///etc/passwd', '', '   ', null, undefined, 'https://[invalide'];
      const answers = async list => Promise.all(list.map(src => ExternalImages.mayRead(src)));
      const seen = { origin, allowed: await answers(allowed), refused: await answers(refused) };
      const pass = /^https?:\/\/[^/]+$/.test(origin) && origin === new URL(gristUrl).origin && seen.allowed.every(Boolean) && seen.refused.every(answer => answer === false);
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_there_is_no_way_left_to_show_a_site_or_to_ask_before_an_export',
    description: 'Plus de « Afficher » ni de fenêtre avant l’export : ExternalImages n’a plus allow, isAllowed, onReveal, unblockIn, confirmExport, beginRun ni endRun, et un export qui garde la porte ouverte (isCancel, cancelError, fragmentsOf) sert encore au rappel des textes alternatifs',
    run: async () => {
      const gone = ['allow', 'isAllowed', 'onReveal', 'unblockIn', 'confirmExport', 'beginRun', 'endRun'].filter(name => typeof ExternalImages[name] !== 'undefined');
      const kept = ['isCancel', 'cancelError', 'fragmentsOf', 'siteOf', 'blockedSiteOf', 'block', 'blockIn', 'setAside', 'mayRead', 'hintOf'].filter(name => typeof ExternalImages[name] !== 'function');
      const cancel = ExternalImages.cancelError();
      const pass = gone.length === 0 && kept.length === 0 && ExternalImages.isCancel(cancel) && !ExternalImages.isCancel(new Error('autre'));
      return { pass, notes: JSON.stringify({ gone, missing: kept }) };
    },
  });

  cases.push({
    id: 'extimg_site_of_and_blocked_site_of_read_the_host_of_external_addresses_only',
    description: 'ExternalImages.siteOf et blockedSiteOf donnent l’hôte (port compris) des adresses qui partent vers un autre site, « // » compris, et rien pour data:, blob:, une adresse relative, la même origine, ftp:, une adresse vide ou illisible ; plus aucun site ne fait exception',
    run: async () => {
      const urls = SHOWN.map(pair => pair[0]).concat(QUIET, ['', '   ', 'https://exotique.test/ a.png', 'https://[invalide']);
      const sites = urls.map(src => ExternalImages.siteOf(src));
      const blocked = urls.map(src => ExternalImages.blockedSiteOf(src));
      const want = SHOWN.map(pair => pair[1]).concat(QUIET.map(() => ''), ['', '', 'exotique.test', '']);
      const pass = JSON.stringify(sites) === JSON.stringify(want) && JSON.stringify(blocked) === JSON.stringify(want);
      return { pass, notes: JSON.stringify({ sites, blocked }) };
    },
  });

  cases.push({
    id: 'extimg_image_io_refuses_other_sites_and_reads_the_rest',
    description: 'ImageIo.fetchBlob et ImageIo.load refusent l’adresse d’un autre site sans qu’aucune requête parte ; une data URI, une adresse relative du widget et une pièce jointe du serveur de Grist passent',
    run: async () => {
      const net = stubFetch();
      const seen = { refused: [], read: [] };
      try {
        for (const src of ['https://tiers1.test/a.png', '//tiers2.test/a.png', 'http://tiers3.test:81/a.png']) {
          let blobError = null; let loadError = null;
          try { await ImageIo.fetchBlob(src); } catch (e) { blobError = e.message; }
          try { await ImageIo.load(src); } catch (e) { loadError = e.message; }
          seen.refused.push({ src, blobError, loadError });
        }
        const blob = await ImageIo.fetchBlob(DATA_PNG);
        const image = await ImageIo.load(DATA_PNG);
        seen.read.push({ blobType: blob.type, width: image.naturalWidth });
        const grist = await GristAPI.getAttachmentDownloadUrl(7);
        const fetched = [];
        const original = window.fetch;
        window.fetch = (input, init) => { fetched.push(String(input)); return Promise.resolve(new Response(new Blob([new Uint8Array(4)], { type: 'image/png' }), { status: 200 })); };
        try { await ImageIo.fetchBlob(grist); } finally { window.fetch = original; }
        seen.read.push({ grist: fetched });
        const pass = seen.refused.every(r => r.blobError && r.loadError) && net.urls.length === 0 && seen.read[0].blobType === 'image/png' && seen.read[0].width === 1
          && JSON.stringify(seen.read[1].grist) === JSON.stringify([grist]);
        return { pass, notes: JSON.stringify(Object.assign({ downloads: net.urls }, seen)) };
      } finally { net.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 2) setAside : le HTML d'un export
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'extimg_set_aside_removes_the_address_of_external_images_only',
    description: 'ExternalImages.setAside(html) : une image d’un autre site (http(s), « // », majuscules, espaces, adresse écrite avec des entités) perd son src et garde l’adresse dans data-external-src ; data:, blob:, adresse relative, même origine, pièce jointe de Grist et ftp: gardent le leur ; la chaîne est rendue telle quelle quand rien ne change',
    run: async () => {
      const gristUrl = await GristAPI.getAttachmentDownloadUrl(7);
      const external = ['https://aside1.test/a.png', '//aside2.test/b.png', 'HTTP://ASIDE3.test/c.png'];
      const html = '<p>Texte</p>' + external.map(src => '<img class="editor-image" src="' + src + '" alt="Logo" style="width: 80px;">').join('')
        + '<img id="e" src="&#104;ttps://aside4.test/d.png"><img id="s" src=" https://aside5.test/e.png ">'
        + QUIET.map(src => '<img src="' + src + '">').join('') + '<img id="pj" data-attachment-id="7" src="' + gristUrl + '"><img id="serveur" src="' + gristUrl + '">';
      const out = await ExternalImages.setAside(html);
      const images = parse(out);
      const problems = [];
      const aside = images.filter(i => !i.hasAttribute('src'));
      if (aside.length !== 5) problems.push('images mises de côté : ' + aside.length);
      const addresses = aside.map(i => i.getAttribute('data-external-src'));
      const want = external.concat(['https://aside4.test/d.png', 'https://aside5.test/e.png']);
      if (JSON.stringify(addresses) !== JSON.stringify(want)) problems.push('adresses gardées : ' + JSON.stringify(addresses));
      const first = aside[0];
      if (first.getAttribute('alt') !== 'Logo' || !/width: 80px/.test(first.getAttribute('style') || '') || !first.classList.contains('editor-image')) problems.push('alt, style ou classe perdus');
      const kept = images.filter(i => i.hasAttribute('src')).map(i => i.getAttribute('src'));
      if (JSON.stringify(kept) !== JSON.stringify(QUIET.concat([gristUrl, gristUrl]))) problems.push('adresses touchées à tort : ' + JSON.stringify(kept));
      const plain = '<p>Rien</p>' + QUIET.map(src => '<img src="' + src + '">').join('');
      if ((await ExternalImages.setAside(plain)) !== plain) problems.push('un HTML sans image d’un autre site n’est pas rendu tel quel');
      if ((await ExternalImages.setAside('<p>Pas d\'image</p>')) !== '<p>Pas d\'image</p>' || (await ExternalImages.setAside('')) !== '' || (await ExternalImages.setAside(null)) !== null) problems.push('chaîne sans image ou vide modifiée');
      const twice = await ExternalImages.setAside(out);
      if (twice !== out) problems.push('un second passage change encore le HTML');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'extimg_set_aside_html_loads_nothing_when_it_enters_the_page',
    description: 'Le HTML d’un export, entré dans un nœud de la page (comme le font tous les exports), ne fait charger aucune image d’un autre site : aucune requête, alors que le même HTML sans setAside en fait partir une (témoin : la mesure voit un chargement)',
    run: async (h) => {
      const stamp = Date.now();
      const asideHost = 'sonde-a-' + stamp + '.test'; const rawHost = 'sonde-b-' + stamp + '.test'; const fragmentHost = 'sonde-c-' + stamp + '.test';
      const make = host => '<p>Texte</p><img src="https://' + host + '/pixel.png" alt="">';
      const asideHtml = await ExternalImages.setAside(make(asideHost));
      const moveInto = html => { const t = document.createElement('template'); t.innerHTML = html; const div = document.createElement('div'); div.appendChild(document.importNode(t.content, true)); return div; };
      const wrapper = document.createElement('div'); Dom.setMarkup(wrapper, asideHtml);
      const fragment = moveInto(await ExternalImages.setAside(make(fragmentHost)));
      const control = document.createElement('div'); Dom.setMarkup(control, make(rawHost));
      await h.sleep(700);
      const seen = { aside: requestsTo([asideHost]), fragment: requestsTo([fragmentHost]), control: requestsTo([rawHost]), kept: wrapper.querySelector('img').getAttribute('data-external-src') };
      return { pass: seen.aside === 0 && seen.fragment === 0 && seen.control >= 1 && seen.kept === 'https://' + asideHost + '/pixel.png' && !fragment.querySelector('img[src]'), notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_preview_sets_external_images_aside_in_the_body_and_in_the_header_and_footer',
    description: 'ExportCommon.resolveRecord (le point de passage de tous les exports) rend le corps et les zones d’en-tête et de pied sans l’adresse de leurs images d’un autre site : data-external-src seulement, rien n’est téléchargé',
    run: async (h) => {
      await seed(h, '<p>x</p>');
      const net = stubFetch();
      const hf = { enabled: true, differentFirstPage: true, header: { default: img(HEADER), first: img('https://premiere.test/p.png') }, footer: { default: img('https://pied.test/f.png'), first: '' } };
      let resolved = null; let error = null;
      try { resolved = await ExportCommon.resolveRecord(DOC_HTML + img(DATA_PNG), TABLE, RECORD, '', hf); } catch (e) { error = e; }
      net.restore();
      const zone = html => parse(html || '').map(i => ({ src: i.getAttribute('src'), aside: i.getAttribute('data-external-src') }));
      const seen = resolved && {
        body: zone(resolved.resolvedHtml).map(i => (i.src || '').slice(0, 22) + '|' + i.aside),
        header: zone(resolved.resolvedHeaderFooterData.header.default), first: zone(resolved.resolvedHeaderFooterData.header.first), footer: zone(resolved.resolvedHeaderFooterData.footer.default),
      };
      const pass = !error && !!seen && seen.body[0] === '|' + EXTERNAL && seen.body[1].startsWith('data:image/png;base64') && seen.header[0].src === null && seen.header[0].aside === HEADER
        && seen.first[0].aside === 'https://premiere.test/p.png' && seen.footer[0].aside === 'https://pied.test/f.png' && net.urls.length === 0;
      return { pass, notes: JSON.stringify({ error: error && error.message, seen, downloads: net.urls }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 3) Les vrais exports d'une ligne
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const outsideCount = () => ExportCommon.outsideImageCount();
  const noWindow = dialogs => dialogs.asked.length === 0;

  cases.push({
    id: 'extimg_pdf_export_downloads_nothing_asks_nothing_and_counts_the_images_left_out',
    description: 'PDF d’une ligne : l’image du corps et celle de l’en-tête ne sont pas téléchargées, aucune fenêtre ne s’ouvre, le PDF est produit sans elles et les deux images sont comptées (laissées de côté, pas « introuvables »)',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => true });
      ExportCommon.resetUnreadImages();
      let result = null; let error = null;
      try { result = await PdfExport.getNativePdfBlobForRecord(DOC_HTML, null, {}, '', HF_WITH_IMAGE, undefined); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const head = result && result.blob ? new TextDecoder().decode(new Uint8Array(await result.blob.slice(0, 5).arrayBuffer())) : '';
      const seen = { error: error && error.message, head, downloads: net.urls, asked: dialogs.asked.length, outside: outsideCount(), unread: ExportCommon.unreadImageCount(), requests: requestsTo(['images.exemple.test', 'entete.test']) };
      return { pass: !error && head === '%PDF-' && net.urls.length === 0 && noWindow(dialogs) && seen.outside === 2 && seen.unread === 0 && seen.requests === 0, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_pdf_without_external_image_counts_nothing',
    description: 'PDF d’un document sans image d’un autre site (data:, relative) : produit comme avant, aucune image comptée',
    run: async (h) => {
      const dialogs = h.stubDialogs({ confirm: () => false });
      ExportCommon.resetUnreadImages();
      let result = null; let error = null;
      try { result = await PdfExport.getNativePdfBlobForRecord('<p>Bonjour</p>' + img(DATA_PNG), null, {}, '', null, undefined); } catch (e) { error = e; }
      dialogs.restore();
      return { pass: !error && !!result && !!result.blob && noWindow(dialogs) && outsideCount() === 0 && ExportCommon.unreadImageCount() === 0, notes: JSON.stringify({ error: error && error.message, outside: outsideCount() }) };
    },
  });

  cases.push({
    id: 'extimg_docx_export_downloads_nothing_and_leaves_the_image_out',
    description: 'Word d’une ligne : aucune image d’un autre site téléchargée, aucune fenêtre, le fichier est produit sans elle (rien dans word/media) et elle est comptée ; une image intégrée du même document est écrite',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => true });
      ExportCommon.resetUnreadImages();
      let parts = null; let error = null;
      try { parts = await h.exportDocxParts(DOC_HTML + img(DATA_PNG), null, null); } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const media = parts ? parts.names.filter(n => n.startsWith('word/media/')) : [];
      const seen = { error: error && error.message, media, downloads: net.urls, outside: outsideCount(), requests: requestsTo(['images.exemple.test']) };
      return { pass: !error && media.length === 1 && net.urls.length === 0 && noWindow(dialogs) && seen.outside === 1 && seen.requests === 0, notes: JSON.stringify(seen) };
    },
  });

  const GRID_HTML = `<table style="width: 200px;"><colgroup><col style="width: 200px;"></colgroup><tbody><tr data-row-height="60" style="height: 60px"><td colwidth="200"><p>Logo ${img(EXTERNAL)}</p></td></tr></tbody></table>`;

  cases.push({
    id: 'extimg_xlsx_export_downloads_nothing_and_leaves_the_image_out',
    description: 'Excel d’une ligne : l’image d’un autre site d’une case n’est pas téléchargée, aucune fenêtre, le classeur est produit sans image (rien dans xl/media) et elle est comptée',
    run: async (h) => {
      await seed(h, '<p>x</p>');
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => true });
      ExportCommon.resetUnreadImages();
      let result = null; let error = null; let media = null;
      try {
        result = await XlsxExport.getXlsxBlobForRecord(GRID_HTML, TABLE, RECORD, '');
        await ExportCommon.ensureJsZipLoaded();
        media = Object.keys((await JSZip.loadAsync(result.blob)).files).filter(n => n.startsWith('xl/media/') && !n.endsWith('/'));
      } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const seen = { error: error && error.message, media, downloads: net.urls, outside: outsideCount() };
      return { pass: !error && !!result && media.length === 0 && net.urls.length === 0 && noWindow(dialogs) && seen.outside === 1, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_html_and_markdown_exports_keep_the_link_without_downloading',
    description: 'Les exports HTML et Markdown, des fichiers de texte, gardent l’adresse d’une image d’un autre site telle que le document la porte (le widget n’écrit que le lien : « src » en HTML, lien ou balise <img> en Markdown) : rien n’est téléchargé, aucune fenêtre, aucune image comptée comme laissée de côté',
    run: async (h) => {
      const net = stubFetch();
      const dialogs = h.stubDialogs({ confirm: () => true });
      ExportCommon.resetUnreadImages();
      let html = null; let markdown = null; let error = null;
      try {
        html = await h.exportHtml(DOC_HTML + img(DATA_PNG), HF_WITH_IMAGE, {}, null, '', { fragment: false });
        markdown = await h.exportMarkdown(DOC_HTML, null, {}, null, '');
      } catch (e) { error = e; }
      dialogs.restore(); net.restore();
      const seen = { error: error && error.message, htmlHasLink: !!html && html.text.includes('src="' + EXTERNAL + '"'), htmlHasHeaderLink: !!html && html.text.includes('src="' + HEADER + '"'), htmlHasData: !!html && html.text.includes('data:image/png;base64'),
        markdownHasLink: !!markdown && markdown.text.includes(EXTERNAL), downloads: net.urls, outside: outsideCount(), requests: requestsTo(['images.exemple.test', 'entete.test']) };
      return { pass: !error && seen.htmlHasLink && seen.htmlHasHeaderLink && seen.htmlHasData && seen.markdownHasLink && net.urls.length === 0 && noWindow(dialogs) && seen.outside === 0 && seen.requests === 0, notes: JSON.stringify(seen) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 4) Les vraies lignes du menu Exporter
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  // Clique la ligne ou le bouton d'export. Toute confirmation (« Générer N PDF ? ») est acceptée et notée : aucune ne doit être celle des images.
  async function clickExport(h, id, until) {
    const net = stubFetch();
    const dl = interceptDownloads();
    const status = watchStatus();
    const confirms = [];
    const dialogs = h.stubDialogs({ confirm: opts => { confirms.push(opts.title + ' | ' + String(opts.message).split('\n')[0]); return true; } });
    try {
      document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await waitFor(h, () => until({ net, dl, status }), 60000);
    } finally { status.stop(); dialogs.restore(); dl.restore(); net.restore(); }
    return { downloads: dl.downloads, confirms, fetched: net.urls, statuses: status.seen, finalStatus: document.getElementById('status-msg').textContent };
  }
  const outsideStatus = n => I18n.t('status.imagesOutside', { n });

  cases.push({
    id: 'extimg_pdf_button_exports_and_says_how_many_images_were_left_out',
    description: '« Exporter en PDF » : le PDF est créé sans télécharger l’image d’un autre site, aucune fenêtre n’est posée et le coin d’état dit « 1 image d’un autre site non reprise. PDF généré. »',
    run: async (h) => {
      await seed(h, DOC_HTML);
      const pdf = await interceptCreatePdf();
      const res = await clickExport(h, 'btn-export-pdf', c => c.status.seen.some(s => s.includes(I18n.t('status.pdfGenerated')) || s.includes(I18n.t('status.pdfGenerationError'))));
      pdf.restore();
      const pass = pdf.calls.length === 1 && res.fetched.length === 0 && res.confirms.length === 0 && res.finalStatus === outsideStatus(1) + ' ' + I18n.t('status.pdfGenerated');
      return { pass, notes: JSON.stringify({ created: pdf.calls, fetched: res.fetched, confirms: res.confirms, statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_docx_button_exports_and_says_how_many_images_were_left_out',
    description: '« Exporter en DOCX » : le fichier est téléchargé sans télécharger l’image d’un autre site, aucune fenêtre, le coin d’état dit « 1 image d’un autre site non reprise. DOCX généré. »',
    run: async (h) => {
      await seed(h, DOC_HTML);
      const res = await clickExport(h, 'v2-btn-export-docx', c => c.dl.downloads.length > 0);
      const pass = res.downloads.length === 1 && /\.docx$/.test(res.downloads[0].name) && res.fetched.length === 0 && res.confirms.length === 0 && res.finalStatus === outsideStatus(1) + ' ' + I18n.t('status.docxGenerated');
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), fetched: res.fetched, confirms: res.confirms, statuses: res.statuses }) };
    },
  });

  cases.push({
    id: 'extimg_batch_counts_the_same_image_once_for_all_rows',
    description: '« Exporter les lignes en un seul PDF » : la même image d’un autre site sur les trois lignes n’est comptée qu’une fois, rien n’est téléchargé, aucune fenêtre des images (seule la confirmation du lot) et les trois lignes sont exportées',
    run: async (h) => {
      await seed(h, '<p>Bonjour</p>' + img(EXTERNAL));
      const res = await clickExport(h, 'v2-btn-export-pdf-merged', c => c.dl.downloads.length > 0);
      const dl = res.downloads[0];
      const pass = res.downloads.length === 1 && dl.name === TABLE + '-export.pdf' && res.fetched.length === 0 && res.confirms.length === 1
        && res.finalStatus === outsideStatus(1) + ' ' + I18n.t('status.mergedExportDone', { ok: NAMES.length });
      return { pass, notes: JSON.stringify({ downloads: res.downloads.map(d => d.name), fetched: res.fetched.length, confirms: res.confirms, status: res.finalStatus }) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 5) L'affichage : toute image qui charge depuis un autre site est signalée en permanence (contour en tirets, infobulle), sans rien changer à la mise en page
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const tipOf = site => I18n.t('image.externalSite', { site });
  const dashedRed = image => { const css = getComputedStyle(image); return css.outlineStyle === 'dashed' && css.outlineWidth === '3px' && css.outlineColor === 'rgb(197, 48, 48)'; };
  const stateOf = image => ({ src: (image.getAttribute('src') || '').slice(0, 40), site: image.getAttribute('data-external-site'), tip: image.title, dashed: dashedRed(image) });

  cases.push({
    id: 'extimg_display_flags_a_raw_image_that_loads_from_another_site_and_only_that_one',
    description: 'Une <img> brute de la page (une surface qui n’aurait pas pensé à block) qui charge depuis un autre site porte son hôte, une infobulle et un contour en tirets rouges ; data:, blob:, adresse relative, même origine et ftp: ne sont pas signalées ; rien de cela n’entre dans un HTML enregistré',
    run: async (h) => {
      const host = document.createElement('div');
      try {
        host.innerHTML = SHOWN.concat(QUIET.map(src => [src])).map(([src]) => '<img src="' + src + '" style="width: 20px;">').join('');
        document.body.appendChild(host);
        await h.sleep(250);
        const problems = [];
        const byUrl = new Map(Array.from(host.querySelectorAll('img')).map(i => [i.getAttribute('src'), i]));
        SHOWN.forEach(([src, site]) => {
          const state = stateOf(byUrl.get(src));
          if (state.site !== site || state.tip !== tipOf(site) || !state.dashed) problems.push('non signalée : ' + JSON.stringify(state));
        });
        QUIET.forEach(src => {
          const state = stateOf(byUrl.get(src));
          if (state.site !== null || state.tip || state.dashed) problems.push('signalée à tort : ' + JSON.stringify(state));
        });
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      } finally { host.remove(); }
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

  // L'infobulle d'une image signalée est écrite dans la langue de la page : le même parcours en français, puis dans une page qui démarre en anglais.
  const displayCase = {
    id: 'extimg_display_follows_src_changes_and_language',
    description: 'Une image qui change d’adresse suit : signalée quand elle part vers un autre site, plus signalée (hôte, infobulle, contour retirés) quand elle revient à une image intégrée, nouvel hôte quand elle change de site ; l’infobulle est écrite dans la langue de la page',
    run: async (h) => {
      const host = document.createElement('div');
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
        seen.title = image.title;
        image.src = DATA_PNG;
        await h.sleep(60);
        seen.last = stateOf(image);
        seen.hadTitleAfter = image.hasAttribute('title');
        const wantTitle = I18n.getLang() === 'en'
          ? 'Image hosted on an external site (deux.test:81): every display downloads it from that site.'
          : 'Image hébergée sur un site externe (deux.test:81) : chaque affichage la télécharge depuis ce site.';
        const pass = seen.first.site === null && !seen.first.dashed
          && seen.second.site === 'un.test' && seen.second.tip === tipOf('un.test') && seen.second.dashed
          && seen.third.site === 'deux.test:81' && seen.third.tip === tipOf('deux.test:81')
          && seen.title === wantTitle
          && seen.last.site === null && !seen.last.dashed && !seen.hadTitleAfter;
        return { pass, notes: JSON.stringify(seen) };
      } finally { host.remove(); }
    },
  };
  cases.push(displayCase, Object.assign({}, displayCase, {
    id: 'extimg_display_tip_speaks_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : une image qui change d’adresse suit (signalée, plus signalée, nouvel hôte) et son infobulle est en anglais',
  }));

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

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 6) Le cadre à la place de l'image
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const frameState = image => ({
    src: image.getAttribute('src'), site: image.getAttribute('data-blocked-site'), original: image.getAttribute('data-blocked-src'), role: image.getAttribute('role'),
    tab: image.getAttribute('tabindex'), alt: image.getAttribute('alt'), title: image.getAttribute('title'), keptAlt: image.getAttribute('data-blocked-alt'),
    keptTitle: image.getAttribute('data-blocked-title'),
  });
  const svgOf = src => decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

  cases.push({
    id: 'extimg_block_html_replaces_external_images_with_frames',
    description: 'ExternalImages.block(html) : une image d’un autre site prend un cadre dessiné (SVG en data:) qui nomme le site et dit « Image non affichée », garde son adresse, son alt et son titre dans data-blocked-*, n’est ni un bouton ni focalisable et garde son style ; data:, blob:, adresse relative, même origine, pièce jointe de Grist et ftp: gardent la leur ; un HTML sans rien à changer est rendu tel quel',
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
        if (!svg.includes('bloc1.test') || !svg.includes(I18n.t('image.blocked.note')) || /rect|Afficher|Show</.test(svg)) problems.push('le cadre ne dit pas le site et « Image non affichée », ou porte encore un bouton : ' + svg.slice(0, 200));
        if (first.original !== 'https://bloc1.test/a.png' || first.site !== 'bloc1.test') problems.push('adresse ou site perdus : ' + JSON.stringify(first));
        if (first.role !== null || first.tab !== null) problems.push('le cadre est encore un bouton : ' + JSON.stringify(first));
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

  const blockFrameCase = {
    id: 'extimg_block_frame_is_drawn_against_the_sheet_zoom_and_follows_the_language',
    description: 'Le cadre dessiné ne grandit ni ne rétrécit avec la boîte de l’image et est à l’envers du facteur de la feuille : à 0,5 son texte est dessiné deux fois plus grand (11 px d’écran), à 1 à sa taille ; sans option, le facteur est celui de la page ; son texte, son texte alternatif et son titre sont dans la langue de la page',
    run: async (h) => {
      const one = '<img id="z" src="https://zoom1.test/a.png">';
      const sizes = html => {
        const svg = svgOf(parse(html)[0].getAttribute('src'));
        return { font: Number((svg.match(/font-size='([\d.]+)'/) || [])[1]), viewBox: /viewBox/.test(svg), note: (svg.match(/>(Image non affichée|Image not shown)<\/text>/) || [])[1], site: /zoom1\.test/.test(svg) };
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
        const frame = host.querySelector('#l');
        seen.frame = { note: sizes(host.innerHTML).note, font: sizes(host.innerHTML).font, alt: frame.getAttribute('alt'), title: frame.getAttribute('title'), kept: frame.getAttribute('data-blocked-alt') };
      } finally { host.remove(); }
      const want = I18n.getLang() === 'en'
        ? { note: 'Image not shown', alt: 'Image from zoom2.test not shown', title: /^Image hosted on an external/ }
        : { note: 'Image non affichée', alt: 'Image de zoom2.test non affichée', title: /^Image hébergée sur un site externe/ };
      const pass = half.font === 22 && full.font === 11 && ofPage.font === 13.75 && !half.viewBox && half.site && half.note === want.note
        && seen.frame.note === want.note && seen.frame.font === 22 && seen.frame.alt === want.alt && want.title.test(seen.frame.title) && seen.frame.kept === 'Logo';
      return { pass, notes: JSON.stringify(seen) };
    },
  };
  cases.push(blockFrameCase, Object.assign({}, blockFrameCase, {
    id: 'extimg_block_frame_speaks_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : le cadre dessiné dit « Image not shown », son texte alternatif « Image from … not shown » et son titre « Image hosted on an external site » en anglais, en gardant son facteur de zoom',
  }));

  cases.push({
    id: 'extimg_a_frame_is_inert_a_click_or_a_key_shows_nothing',
    description: 'Hors de l’éditeur et de la Lecture (une galerie, un aperçu, une impression) un cadre reste une image : un clic, Entrée ou Espace ne change ni son adresse ni son aspect (aucune adresse d’un autre site n’y est lue), n’ouvre pas la fenêtre qui explique, l’événement n’est pas retenu (l’élément qui le contient le reçoit, la zone d’en-tête de l’éditeur s’ouvre comme avant) et rien n’est noté dans la page',
    run: async (h) => {
      const host = document.createElement('div');
      host.innerHTML = ExternalImages.block('<img id="c" src="https://clic1.test/a.png"><img id="e" src="https://clic2.test/a.png">');
      document.body.appendChild(host);
      let reached = 0;
      host.addEventListener('click', () => { reached++; });
      try {
        const before = Array.from(host.querySelectorAll('img')).map(i => i.getAttribute('src'));
        const fire = (id, type, init) => { const e = new (type === 'click' ? MouseEvent : KeyboardEvent)(type, Object.assign({ bubbles: true, cancelable: true }, init)); host.querySelector('#' + id).dispatchEvent(e); return e; };
        const click = fire('c', 'click');
        const enter = fire('e', 'keydown', { key: 'Enter' });
        const space = fire('e', 'keydown', { key: ' ' });
        await h.sleep(80);
        const images = Array.from(host.querySelectorAll('img'));
        const seen = { after: images.map(i => i.getAttribute('src')), blocked: images.map(i => i.hasAttribute('data-blocked-src')), flagged: images.map(i => i.hasAttribute('data-external-site')), reached, prevented: [click.defaultPrevented, enter.defaultPrevented, space.defaultPrevented],
          requests: requestsTo(['clic1.test', 'clic2.test']), window: explainOpen(), buttons: images.map(i => i.getAttribute('role')) };
        const pass = JSON.stringify(seen.after) === JSON.stringify(before) && seen.blocked.every(Boolean) && seen.flagged.every(f => !f) && reached === 1 && seen.prevented.every(p => !p) && seen.requests === 0
          && !seen.window && seen.buttons.every(role => role === null);
        return { pass, notes: JSON.stringify(seen) };
      } finally { host.remove(); await closeExplain(h); }
    },
  });

  cases.push({
    id: 'extimg_editor_view_withholds_the_address_and_shows_a_frame_without_a_button',
    description: 'Éditeur : l’image d’un autre site n’a pas d’adresse dans le DOM (cadre, nom du site, « Image non affichée », aucun bouton), alors que le document et le HTML enregistré gardent l’adresse ; le cadre se décrit à un lecteur d’écran (rôle image, texte alternatif, infobulle qui dit comment la garder) et rien n’est chargé',
    run: async (h) => {
      await h.resetEditor();
      const url = 'https://vue1.test/logo.png'; const other = 'https://vue2.test/autre.png';
      Editor.setHTML('<p>Texte</p><p>' + img(url) + img(url) + '</p><p>' + img(other) + '</p><p>' + img(DATA_PNG) + '</p>');
      await h.sleep(300);
      const views = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      const state = view => {
        const image = view.querySelector('img');
        const box = view.querySelector('.editor-image-blocked-box');
        return { blocked: view.classList.contains('editor-image-blocked'), src: image.getAttribute('src'), site: (view.querySelector('.editor-image-blocked-site') || {}).textContent,
          note: (view.querySelector('.editor-image-blocked-note') || {}).textContent, buttons: view.querySelectorAll('.editor-image-reveal, .editor-image-blocked-box button').length,
          boxShown: getComputedStyle(box).display, role: box.getAttribute('role'), aria: box.getAttribute('aria-label'), title: box.title, flagged: image.hasAttribute('data-external-site') };
      };
      const seen = views().map(state);
      const saved = Editor.getHTML();
      const requests = requestsTo(['vue1.test', 'vue2.test']);
      await h.resetEditor();
      const external = seen.slice(0, 3);
      const pass = seen.length === 4 && external.every(v => v.blocked && !v.src && v.note === I18n.t('image.blocked.note') && v.buttons === 0 && v.boxShown !== 'none' && v.role === 'img' && !v.flagged)
        && seen[0].site === 'vue1.test' && seen[2].site === 'vue2.test' && seen[0].aria === I18n.t('image.blocked.alt', { site: 'vue1.test' }) && seen[0].title === ExternalImages.hintOf('vue1.test')
        && !seen[3].blocked && seen[3].src === DATA_PNG && seen[3].boxShown === 'none'
        && saved.includes('src="' + url + '"') && saved.includes('src="' + other + '"') && !/data-blocked|data-external/.test(saved) && requests === 0;
      return { pass, notes: JSON.stringify({ seen, requests, savedKeepsAddresses: saved.includes(url) }) };
    },
  });

  cases.push({
    id: 'extimg_editor_view_blocked_frame_keeps_the_images_box_and_is_selectable',
    description: 'Éditeur : le cadre d’une image d’un autre site a exactement la largeur du document (style en ligne de l’image) et, sans largeur, en prend une ; il reste dans la page (jamais plus large que la ligne) ; un clic dessus sélectionne l’image comme n’importe quelle image (poignées, barre flottante) et ouvre la fenêtre qui explique',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p><img class="editor-image" src="https://boite1.test/a.png" style="width: 120px;"></p><p><img class="editor-image" src="https://boite1.test/b.png"></p>');
      await h.sleep(300);
      const views = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      const widths = views().map(v => Math.round(v.getBoundingClientRect().width));
      const lineWidth = Math.round(document.querySelector('.tiptap').getBoundingClientRect().width);
      const box = views()[0].querySelector('.editor-image-blocked-box');
      h.tiptap().focus();
      await h.selectAtomNode(box);
      await h.sleep(200);
      const selected = views()[0].classList.contains('editor-image-selected');
      const selectedNode = EditorCore.getEditor().state.selection.node;
      const opened = explainOpen();
      await closeExplain(h);
      await h.resetEditor();
      const pass = widths[0] === 120 && widths[1] >= 96 && widths[1] <= lineWidth && selected && !!selectedNode && selectedNode.type.name === 'editorImage' && opened;
      return { pass, notes: JSON.stringify({ widths, lineWidth, selected, selectedNode: selectedNode && selectedNode.type.name, opened }) };
    },
  });

  cases.push({
    id: 'extimg_reader_shows_frames_for_body_and_header_images_and_keeps_them',
    description: 'Lecture en pages : l’image d’un autre site du corps et celle de l’en-tête prennent un cadre (pas d’adresse dans la page), un clic dessus ouvre la fenêtre qui explique et ne change rien, et un nouveau rendu les montre encore en cadre ; aucune requête ne part vers ces sites',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: img('https://lect1.test/h.png'), first: '' }, footer: { default: '', first: '' } };
      const body = '<p>Corps</p>' + img('https://lect1.test/b.png') + img('https://lect2.test/c.png');
      const seen = {};
      try {
        h.setA4Preview(true);
        await h.renderReaderMode(body, hf);
        await h.sleep(300);
        const frames = () => Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]')).map(i => i.getAttribute('data-blocked-src')).sort();
        const loaded = () => Array.from(document.querySelectorAll('#reader-container img')).filter(i => /^https?:/.test(i.getAttribute('src') || '')).length;
        seen.before = frames(); seen.loadedBefore = loaded();
        const bodyFrame = document.querySelector('#reader-container .reader-content img[data-blocked-src="https://lect1.test/b.png"]');
        if (bodyFrame) bodyFrame.click();
        await h.sleep(400);
        seen.window = explainOpen();
        await closeExplain(h);
        seen.after = frames(); seen.loadedAfter = loaded();
        await h.renderReaderMode(body, hf);
        await h.sleep(300);
        seen.rerender = frames();
        seen.requests = requestsTo(['lect1.test', 'lect2.test']);
      } finally { h.setA4Preview(false); document.getElementById('reader-container').style.display = ''; document.getElementById('editor-container').style.display = ''; }
      const all = ['https://lect1.test/b.png', 'https://lect1.test/h.png', 'https://lect2.test/c.png'];
      const pass = JSON.stringify(seen.before) === JSON.stringify(all) && JSON.stringify(seen.after) === JSON.stringify(all) && JSON.stringify(seen.rerender) === JSON.stringify(all)
        && seen.loadedBefore === 0 && seen.loadedAfter === 0 && seen.requests === 0 && seen.window === true;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'extimg_page_zones_get_frames_from_resolve_page_number_badges',
    description: 'PageLayout.resolvePageNumberBadges (le passage de tout en-tête et pied affichés : aperçu paginé de l’éditeur, Lecture) met le cadre aux images d’un autre site et le garde d’un passage à l’autre ; les badges de page se résolvent comme avant',
    run: async () => {
      const html = '<p>Page <span class="page-number-badge" data-format="n">#</span></p><img src="https://zone1.test/a.png"><img src="' + DATA_PNG + '">';
      const out = PageLayout.resolvePageNumberBadges(html, 3, 9);
      const frames = parse(out).filter(i => i.hasAttribute('data-blocked-src')).map(i => i.getAttribute('data-blocked-src'));
      const later = PageLayout.resolvePageNumberBadges(out, 4, 9);
      const framesLater = parse(later).filter(i => i.hasAttribute('data-blocked-src')).map(i => i.getAttribute('data-blocked-src'));
      const pass = JSON.stringify(frames) === '["https://zone1.test/a.png"]' && out.includes('>3</span>') && JSON.stringify(framesLater) === JSON.stringify(frames) && parse(later)[1].getAttribute('src') === DATA_PNG;
      return { pass, notes: JSON.stringify({ frames, framesLater }) };
    },
  });

  // Une image « sur toutes les pages » : calque derrière le texte avec sa grille page (comme dev-tests/scenarios-full-pages.js), plusieurs feuilles de texte.
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const repeatedImg = src => `<p><img class="editor-image" src="${src}" alt="" style="width: 80px; height: 80px; position: absolute; left: 0px; top: 0px; z-index: -1;" data-layer="behind" data-wrap="inline" data-repeat="true" data-page-index="0" data-page-left-pt="-10" data-page-top-pt="-20"></p>`;
  const bodyLines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const editorCopies = () => Array.from(document.querySelectorAll('#editor-container .v2-page-layer img.v2-page-layer-copy')).map(i => i.getAttribute('src'));
  const readerCopies = () => Array.from(document.querySelectorAll('#reader-container .v2-page-layer img.v2-page-layer-copy')).map(i => i.getAttribute('src'));

  cases.push({
    id: 'extimg_images_of_another_site_are_not_repeated_on_every_page',
    description: 'Éditeur (Aperçu A4) : une image « sur toutes les pages » d’un autre site n’est pas peinte en copie sur les autres feuilles (ses copies seraient des cadres ou chargeraient le site) ; une image intégrée, elle, est répétée',
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
        await h.sleep(500);
        seen.external = editorCopies();
        seen.requests = requestsTo(['repete1.test']);
      } finally { h.setA4Preview(false); await h.resetEditor(); }
      const pass = seen.control >= 2 && seen.external.length === 0 && seen.requests === 0;
      return { pass, notes: JSON.stringify({ control: seen.control, external: seen.external.length, requests: seen.requests }) };
    },
  });

  cases.push({
    id: 'extimg_reader_does_not_repeat_an_image_of_another_site',
    description: 'Lecture en pages : une image « sur toutes les pages » d’un autre site garde son cadre sur sa feuille et n’a aucune copie sur les autres ; un clic sur son cadre ouvre la fenêtre qui explique et n’y change rien',
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
        const frame = rc.querySelector('img[data-blocked-src="' + url + '"]');
        seen.frame = !!frame;
        if (frame) frame.click();
        await h.sleep(500);
        seen.window = explainOpen();
        await closeExplain(h);
        seen.copies = readerCopies().length;
        seen.stillFrame = !!rc.querySelector('img[data-blocked-src="' + url + '"]');
        seen.loaded = !!rc.querySelector('img[src="' + url + '"]');
        seen.requests = requestsTo(['repete2.test']);
      } finally { h.setA4Preview(false); document.getElementById('reader-container').style.display = ''; document.getElementById('editor-container').style.display = ''; }
      const pass = seen.frame && seen.copies === 0 && seen.stillFrame && !seen.loaded && seen.requests === 0 && seen.window === true;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  // ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // 7) La fenêtre qui explique (demande du 24/11 : « une pop-up qui s'ouvre et explique le pourquoi et la manip ; ensuite remplacer les images par un place holder, et au clic réafficher la pop-up »)
  // ---------------------------------------------------------------------------------------------------------------------------------------------------------

  const byId = id => document.getElementById(id);
  const verdict = problems => ({ pass: problems.length === 0, notes: JSON.stringify(problems) });
  const same = (problems, label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
  const NOTHING = { count: 0, sites: [] };
  const QUIET_SRCS = [DATA_PNG, 'blob:' + location.origin + '/0b1c', 'images/relatif.png', location.origin + '/meme-origine.png', 'ftp://fichiers.test/e.png'];
  const quietImages = () => QUIET_SRCS.map(src => '<img src="' + src + '">').join('');
  const ATTACHMENT_IMG = '<img data-attachment-id="7" src="https://grist.fictif.test/api/docs/x/attachments/7/download">';
  // La promesse tenue, ou un délai : un essai qui attend une fermeture ne reste jamais suspendu.
  const settled = (h, promise) => Promise.race([promise.then(() => 'tenue'), h.sleep(1000).then(() => 'attend encore')]);
  const views = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
  const mouse = (target, type, x, y) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));

  cases.push({
    id: 'extimg_survey_counts_the_images_of_other_sites_and_lists_their_sites_in_order',
    description: 'ExternalImages.survey(morceaux de HTML) : le nombre d’images d’un autre site et leurs sites, dans l’ordre où ils se présentent et sans doublon, le corps puis l’en-tête et le pied ; data:, blob:, adresse relative, même origine, pièce jointe de Grist et protocole autre que http(s) ne comptent pas ; une image déjà passée par block ou setAside se lit de même ; les écritures de l’adresse que le navigateur comprend (« // », majuscules, entité, guillemets simples, « > » dans l’alt) comptent ; un HTML sans adresse d’un autre site n’est même pas lu',
    run: async () => {
      const problems = [];
      const body = '<p>Texte</p>' + img('https://sondage1.test/a.png') + quietImages() + ATTACHMENT_IMG
        + img('https://sondage2.test:8443/b.png') + img('https://sondage1.test/c.png') + '<img src="//sondage3.test/d.png">';
      const wanted = { count: 4, sites: ['sondage1.test', 'sondage2.test:8443', 'sondage3.test'] };
      same(problems, 'le corps', ExternalImages.survey([body]), wanted);
      same(problems, 'le corps, l’en-tête et le pied', ExternalImages.survey([body, img('https://sondage4.test/h.png'), img('https://sondage1.test/p.png')]), { count: 6, sites: wanted.sites.concat(['sondage4.test']) });
      same(problems, 'après block (l’adresse est dans data-blocked-src)', ExternalImages.survey([ExternalImages.block(body)]), wanted);
      same(problems, 'après setAside (l’adresse est dans data-external-src)', ExternalImages.survey([await ExternalImages.setAside(body)]), wanted);
      const odd = '<img alt="a>b" src="https://ecrit1.test/x.png"><img src="&#104;ttps://ecrit2.test/x.png"><img src="HTTPS://MAJ3.test/x.png"><img src=https://ecrit4.test/x.png>'
        + '<img src = \'https://ecrit5.test/x.png\'><img title=\'l&apos;image\' src=" https://ecrit6.test/x.png "><img src="//ecrit7.test/x.png">';
      same(problems, 'les écritures de l’adresse', ExternalImages.survey([odd]), { count: 7, sites: ['ecrit1.test', 'ecrit2.test', 'maj3.test', 'ecrit4.test', 'ecrit5.test', 'ecrit6.test', 'ecrit7.test'] });
      same(problems, 'rien : sans morceaux, vides, sans image', [ExternalImages.survey(), ExternalImages.survey(null), ExternalImages.survey([null, undefined, '', '<p>Texte seul</p>'])], [NOTHING, NOTHING, NOTHING]);
      same(problems, 'rien : tout ce qui ne part pas vers un autre site', ExternalImages.survey(['<p>x</p>' + quietImages() + ATTACHMENT_IMG]), NOTHING);
      // Un HTML qui n'a pas une adresse vers un autre site n'est pas lu (un gros document, sans une telle image, s'ouvre sans surcoût) ; celui qui en a une est lu une fois.
      const original = Dom.inertTemplate;
      let reads = 0;
      Dom.inertTemplate = function () { reads += 1; return original.apply(this, arguments); };
      try {
        const offline = '<p>x</p>' + img(DATA_PNG).repeat(40) + '<img src="blob:' + location.origin + '/0b1c"><img src="images/relatif.png"><img src="/chemin/absolu.png"><img src="ftp://fichiers.test/e.png">';
        same(problems, 'sans adresse http : le décompte', ExternalImages.survey([offline]), NOTHING);
        same(problems, 'sans adresse http : lectures', reads, 0);
        // Une adresse http vers le widget lui-même se lit (le tri rapide ne juge pas l'origine) et ne compte pas.
        same(problems, 'même origine : le décompte', ExternalImages.survey(['<img src="' + location.origin + '/meme-origine.png">']), NOTHING);
        reads = 0;
        ExternalImages.survey([body]);
        same(problems, 'avec une adresse d’un autre site : lectures', reads, 1);
      } finally { Dom.inertTemplate = original; }
      return verdict(problems);
    },
  });

  cases.push({
    id: 'extimg_notice_on_open_shows_the_window_once_per_document_and_per_session',
    description: 'ExternalImages.noticeOnOpen(document) : la fenêtre s’ouvre pour un document qui porte une image d’un autre site (corps, en-tête ou pied) et dit « vrai », une seule fois par document et par session (le numéro en texte ou en nombre est le même document) ; rien pour un document sans contenu, sans image d’un autre site, ou qui n’a que des data:, des adresses relatives, des pièces jointes ; un document sans numéro (un neuf) la remontre à chaque fois ; un document sans image n’est pas retenu : l’image qui lui vient ensuite s’annonce',
    run: async (h) => {
      const problems = [];
      try {
        const empty = [null, undefined, {}, { id: 'test-extimg-vide-1' }, { id: 'test-extimg-vide-2', contenu: null }, { id: 'test-extimg-vide-3', contenu: 12 },
          { id: 'test-extimg-vide-4', contenu: '<p>Rien</p>' + img(DATA_PNG) }, { id: 'test-extimg-vide-5', contenu: '<p>x</p>' + quietImages() + ATTACHMENT_IMG }];
        same(problems, 'rien à dire', empty.map(doc => ExternalImages.noticeOnOpen(doc)), empty.map(() => false));
        same(problems, 'aucune fenêtre', explainOpen(), false);
        const doc = { id: 'test-extimg-ouvert-1', contenu: DOC_HTML };
        same(problems, 'un document avec une image d’un autre site', [ExternalImages.noticeOnOpen(doc), explainOpen()], [true, true]);
        same(problems, 'la fenêtre dit une image et son site', [explainText().includes(I18n.t('image.explain.intro', { n: 1 })), explainText().includes('images.exemple.test')], [true, true]);
        await closeExplain(h);
        same(problems, 'le même document : rien', [ExternalImages.noticeOnOpen(doc), explainOpen()], [false, false]);
        same(problems, 'un autre document', [ExternalImages.noticeOnOpen({ id: 'test-extimg-ouvert-2', contenu: DOC_HTML }), explainOpen()], [true, true]);
        await closeExplain(h);
        // L'en-tête et le pied comptent : leurs images s'ajoutent à celles du corps.
        const hf = { enabled: true, differentFirstPage: false, header: { default: img(HEADER), first: '' }, footer: { default: img('https://pied.test/p.png'), first: '' } };
        same(problems, 'l’en-tête et le pied d’un document', [ExternalImages.noticeOnOpen({ id: 'test-extimg-ouvert-3', contenu: '<p>Corps seul</p>', headerFooter: hf }), explainOpen()], [true, true]);
        same(problems, 'l’en-tête et le pied : deux images, deux sites', [explainText().includes(I18n.t('image.explain.intro', { n: 2 })), explainText().includes('entete.test, pied.test')], [true, true]);
        await closeExplain(h);
        same(problems, 'un en-tête sans image d’un autre site ne compte pas', ExternalImages.noticeOnOpen({ id: 'test-extimg-ouvert-4', contenu: '<p>Corps</p>', headerFooter: Object.assign({}, hf, { header: { default: img(DATA_PNG), first: '' }, footer: { default: '', first: '' } }) }), false);
        // Le numéro, en nombre ou en texte, désigne le même document.
        same(problems, 'un numéro en nombre', [ExternalImages.noticeOnOpen({ id: 987001, contenu: DOC_HTML }), explainOpen()], [true, true]);
        await closeExplain(h);
        same(problems, 'le même numéro, en texte : le même document', [ExternalImages.noticeOnOpen({ id: '987001', contenu: DOC_HTML }), explainOpen()], [false, false]);
        // Un document sans numéro (un neuf, jamais enregistré) n'a pas de mémoire : la fenêtre revient à chaque ouverture.
        same(problems, 'sans numéro, la première fois', [ExternalImages.noticeOnOpen({ contenu: DOC_HTML }), explainOpen()], [true, true]);
        await closeExplain(h);
        same(problems, 'sans numéro, la fois suivante', [ExternalImages.noticeOnOpen({ contenu: DOC_HTML }), explainOpen()], [true, true]);
        await closeExplain(h);
        // Un document sans image d'un autre site n'est pas retenu : celui qui en reçoit une ensuite (même numéro) l'annonce.
        same(problems, 'sans image : rien, et pas retenu', [ExternalImages.noticeOnOpen({ id: 'test-extimg-plus-tard', contenu: '<p>Rien</p>' }), explainOpen()], [false, false]);
        same(problems, 'la même clé, avec une image', [ExternalImages.noticeOnOpen({ id: 'test-extimg-plus-tard', contenu: DOC_HTML }), explainOpen()], [true, true]);
      } finally { await closeExplain(h); }
      return verdict(problems);
    },
  });

  const explainContent = {
    id: 'extimg_explain_window_says_why_how_to_put_an_image_back_and_what_is_kept',
    description: 'La fenêtre (ExternalImages.explain) dit pourquoi les images d’un autre site ne s’affichent plus (leur nombre et leurs sites, au singulier comme au pluriel, six sites au plus puis « et N autres »), les trois gestes pour en remettre une (« Copier l’image » sur son site, cliquer le cadre puis coller, une pièce jointe de Grist par « Image depuis une variable ») et que le document garde l’adresse ; elle se présente comme une fenêtre de dialogue, n’a qu’un bouton, « Compris », et n’écrit jamais une adresse, seulement le nom du site',
    run: async (h) => {
      const problems = [];
      const en = I18n.getLang() === 'en';
      const want = en
        ? { title: 'Images from another site not shown', how: 'To put an image back:', close: 'Got it',
          kept: 'The document keeps each image’s address: nothing is lost until you replace the frame.',
          intro3: 'This document contains 3 images hosted on other sites. For security, Publipostage+ no longer calls any other site: they are neither shown nor exported, and a frame takes their place.',
          intro1: 'This document contains 1 image hosted on another site. For security, Publipostage+ no longer calls any other site: it is neither shown nor exported, and a frame takes its place.',
          sites2: 'Affected sites: alpha.test, beta.test', sites1: 'Affected site: alpha.test', more: n => 'and ' + n + ' more',
          steps: [/right-click.*“Copy image”/, /Esc.*Ctrl\+V/, /attachments column.*“Image from a variable/] }
        : { title: 'Images d’un autre site non affichées', how: 'Pour remettre une image :', close: 'Compris',
          kept: 'Le document garde l’adresse de chaque image : rien n’est perdu tant que vous n’avez pas remplacé le cadre.',
          intro3: 'Ce document contient 3 images hébergées sur d’autres sites. Par sécurité, Publipostage+ n’appelle plus aucun autre site : elles ne sont ni affichées ni exportées, un cadre les remplace.',
          intro1: 'Ce document contient 1 image hébergée sur un autre site. Par sécurité, Publipostage+ n’appelle plus aucun autre site : elle n’est ni affichée ni exportée, un cadre la remplace.',
          sites2: 'Sites concernés : alpha.test, beta.test', sites1: 'Site concerné : alpha.test', more: n => 'et ' + n + (n > 1 ? ' autres' : ' autre'),
          steps: [/clic droit.*« Copier l’image »/, /Échap.*Ctrl\+V/, /Pièces jointes de Grist.*« Image depuis une variable/] };
      const parts = () => ({
        paragraphs: Array.from(explainWindow().querySelectorAll('.pp-external-images-body > p')).map(p => p.textContent),
        steps: Array.from(explainWindow().querySelectorAll('.pp-external-images-body ol li')).map(li => li.textContent),
      });
      try {
        // Trois images, deux sites.
        ExternalImages.explain({ survey: { count: 3, sites: ['alpha.test', 'beta.test'] } });
        const box = explainWindow().querySelector('.pp-modal-box');
        let seen = parts();
        same(problems, 'titre', byId('pp-external-images-title').textContent, want.title);
        same(problems, 'pourquoi', seen.paragraphs[0], want.intro3);
        same(problems, 'sites', seen.paragraphs[1], want.sites2);
        same(problems, 'comment, l’amorce', seen.paragraphs[2], want.how);
        same(problems, 'comment, trois gestes', seen.steps.length, 3);
        if (!want.steps.every((rule, i) => rule.test(seen.steps[i] || ''))) problems.push('les gestes : ' + JSON.stringify(seen.steps));
        same(problems, 'ce que le document garde', seen.paragraphs[3], want.kept);
        same(problems, 'un seul bouton visible', explainButtons().map(b => b.textContent), [want.close]);
        same(problems, 'fenêtre de dialogue', [box.getAttribute('role'), box.getAttribute('aria-modal'), box.getAttribute('aria-labelledby')], ['dialog', 'true', 'pp-external-images-title']);
        await closeExplain(h);
        // Une image, un site : le singulier.
        ExternalImages.explain({ survey: { count: 1, sites: ['alpha.test'] } });
        seen = parts();
        same(problems, 'une image : pourquoi', seen.paragraphs[0], want.intro1);
        same(problems, 'un site', seen.paragraphs[1], want.sites1);
        await closeExplain(h);
        // Six sites tiennent tous ; au-delà, « et N autres ».
        const named = n => Array.from({ length: n }, (_, i) => 'site' + (i + 1) + '.test');
        for (const n of [6, 7, 8]) {
          ExternalImages.explain({ survey: { count: n + 2, sites: named(n) } });
          same(problems, n + ' sites', parts().paragraphs[1], (en ? 'Affected sites: ' : 'Sites concernés : ') + named(Math.min(n, 6)).join(', ') + (n > 6 ? ' ' + want.more(n - 6) : ''));
          await closeExplain(h);
        }
        // Un document réel : aucune adresse, ni chemin, ni jeton dans la fenêtre, seulement le nom du site.
        const opened = ExternalImages.noticeOnOpen({ id: 'test-extimg-contenu-' + I18n.getLang(), contenu: '<p>x</p>' + img('https://secret.exemple.test/chemin/prive/logo.png?jeton=abc123') });
        const text = explainText();
        same(problems, 'un document réel', [opened, text.includes('secret.exemple.test'), /https?:|chemin|logo\.png|jeton|abc123/.test(text)], [true, true, false]);
      } finally { await closeExplain(h); }
      return verdict(problems);
    },
  };
  cases.push(explainContent, Object.assign({}, explainContent, {
    id: 'extimg_explain_window_speaks_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la fenêtre qui explique dit tout en anglais (« Images from another site not shown », « Affected sites », « Got it », « and 2 more ») avec les mêmes pluriels',
  }));

  cases.push({
    id: 'extimg_explain_window_closes_with_escape_or_its_button_and_gives_the_focus_back',
    description: 'La fenêtre qui explique : une demande pendant qu’elle est ouverte reçoit la même promesse (une seule fenêtre dans la page, le premier décompte) ; Échap ou « Compris » la ferment, tiennent la promesse et rendent le focus à qui l’avait ; elle se rouvre ensuite avec son nouveau décompte ; sans rien à dire (ni site, ni image dans le document) elle ne s’ouvre pas ; le document ouvert prime sur le site du cadre, qui ne sert qu’à défaut',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      const opener = document.createElement('button');
      opener.textContent = 'ouvreur';
      document.body.appendChild(opener);
      try {
        opener.focus();
        const first = ExternalImages.explain({ survey: { count: 2, sites: ['un.test'] } });
        const second = ExternalImages.explain({ survey: { count: 5, sites: ['deux.test'] } });
        same(problems, 'la même promesse pendant qu’elle est ouverte', first === second, true);
        same(problems, 'une seule fenêtre dans la page', document.querySelectorAll('#pp-external-images-modal').length, 1);
        same(problems, 'ouverte avec le premier décompte', [explainOpen(), explainText().includes('un.test'), explainText().includes('deux.test')], [true, true, false]);
        same(problems, 'le focus est sur « Compris »', document.activeElement === explainButtons()[0], true);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        same(problems, 'Échap tient la promesse', await settled(h, first), 'tenue');
        same(problems, 'Échap ferme et rend le focus', [explainOpen(), document.activeElement === opener], [false, true]);
        const third = ExternalImages.explain({ survey: { count: 1, sites: ['trois.test'] } });
        same(problems, 'rouverte : une autre promesse, le nouveau décompte', [third !== first, explainOpen(), explainText().includes('trois.test'), explainText().includes('un.test')], [true, true, true, false]);
        explainButtons()[0].click();
        same(problems, '« Compris » tient la promesse', await settled(h, third), 'tenue');
        same(problems, '« Compris » ferme et rend le focus', [explainOpen(), document.activeElement === opener], [false, true]);
        // Rien à dire : le document est vide, aucun site n'est donné.
        same(problems, 'rien à dire : résolue sans fenêtre', [await settled(h, ExternalImages.explain()), explainOpen()], ['tenue', false]);
        same(problems, 'rien à dire : un décompte vide', [await settled(h, ExternalImages.explain({ survey: NOTHING })), explainOpen()], ['tenue', false]);
        // À défaut du document, le site du cadre cliqué.
        ExternalImages.explain({ site: 'solo.test' });
        same(problems, 'le site du cadre, à défaut', [explainOpen(), explainText().includes(I18n.t('image.explain.intro', { n: 1 })), explainText().includes(I18n.t('image.explain.sites', { n: 1, sites: 'solo.test' }))], [true, true, true]);
        await closeExplain(h);
        // Le document ouvert prime : son corps, puis son en-tête, comptés ensemble ; le site du cadre n'y change rien.
        Editor.setHTML('<p>' + img('https://doc1.test/a.png') + img('https://doc2.test/b.png') + img('https://doc1.test/c.png') + img(DATA_PNG) + '</p>');
        Editor.setHeaderFooterData(HF_WITH_IMAGE);
        await h.sleep(300);
        ExternalImages.explain({ site: 'autre.test' });
        same(problems, 'le document ouvert', [explainText().includes(I18n.t('image.explain.intro', { n: 4 })), explainText().includes(I18n.t('image.explain.sites', { n: 3, sites: 'doc1.test, doc2.test, entete.test' })), explainText().includes('autre.test')], [true, true, false]);
        await closeExplain(h);
      } finally {
        await closeExplain(h);
        opener.remove();
        await h.resetEditor();
      }
      return verdict(problems);
    },
  });

  cases.push({
    id: 'extimg_editor_click_on_a_frame_opens_the_window_and_changes_nothing_in_the_document',
    description: 'Éditeur : un clic sur le cadre d’une image d’un autre site sélectionne l’image comme avant ET ouvre la fenêtre, qui compte les images du document ouvert (le corps, puis l’en-tête) ; le document n’est pas touché (même HTML, même adresse, aucune transaction) ; un glissement de plus de 4 px n’est pas un clic, un de 3 px en est un ; une image intégrée (data:) n’ouvre rien ; la fenêtre fermée, le focus revient dans l’éditeur et l’image reste sélectionnée',
    run: async (h) => {
      const problems = [];
      try {
        await h.resetEditor();
        const one = 'https://edit1.test/a.png';
        const two = 'https://edit2.test/b.png';
        Editor.setHTML('<p>Texte</p><p>' + img(one) + img(two) + '</p><p>' + img(DATA_PNG) + '</p>');
        Editor.setHeaderFooterData(HF_WITH_IMAGE);
        await h.sleep(300);
        const editor = EditorCore.getEditor();
        const savedHtml = Editor.getHTML();
        const doc = editor.state.doc;
        h.tiptap().focus();
        const frames = () => Array.from(document.querySelectorAll('.tiptap .editor-image-blocked .editor-image-blocked-box'));
        same(problems, 'deux cadres, trois images', [frames().length, views().length], [2, 3]);
        // Un clic : la souris descend et remonte au même endroit.
        await h.selectAtomNode(frames()[0]);
        same(problems, 'le clic ouvre la fenêtre', explainOpen(), true);
        same(problems, 'elle compte le document ouvert', [explainText().includes(I18n.t('image.explain.intro', { n: 3 })), explainText().includes(I18n.t('image.explain.sites', { n: 3, sites: 'edit1.test, edit2.test, entete.test' }))], [true, true]);
        same(problems, 'l’image est sélectionnée comme avant', [views()[0].classList.contains('editor-image-selected'), !!editor.state.selection.node && editor.state.selection.node.type.name], [true, 'editorImage']);
        await closeExplain(h);
        same(problems, 'fermée : le focus revient dans l’éditeur et l’image reste sélectionnée', [h.tiptap().contains(document.activeElement), views()[0].classList.contains('editor-image-selected')], [true, true]);
        // Un glissement : la souris descend ici et remonte à 12 px ; à 3 px, c'est encore un clic.
        const box = frames()[1].getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        mouse(frames()[1], 'mousedown', x, y); mouse(frames()[1], 'mouseup', x + 12, y); mouse(frames()[1], 'click', x + 12, y);
        await h.sleep(150);
        same(problems, 'un glissement de 12 px n’ouvre rien', explainOpen(), false);
        mouse(frames()[1], 'mousedown', x, y); mouse(frames()[1], 'mouseup', x + 3, y); mouse(frames()[1], 'click', x + 3, y);
        await h.sleep(150);
        same(problems, 'un déplacement de 3 px est un clic', explainOpen(), true);
        await closeExplain(h);
        // Une image intégrée n'a pas de cadre : la sélectionner n'ouvre rien.
        await h.selectAtomNode(views()[2].querySelector('img'));
        same(problems, 'une image intégrée n’ouvre rien', explainOpen(), false);
        same(problems, 'le document n’a pas bougé', [Editor.getHTML() === savedHtml, editor.state.doc === doc, savedHtml.includes('src="' + one + '"'), savedHtml.includes('src="' + two + '"')], [true, true, true, true]);
      } finally {
        await closeExplain(h);
        await h.resetEditor();
      }
      return verdict(problems);
    },
  });

  cases.push({
    id: 'extimg_pasting_an_image_over_a_selected_frame_replaces_it_and_one_undo_brings_it_back',
    description: 'Le geste que la fenêtre explique : un cadre sélectionné (le clic, la fenêtre fermée) et une image collée (Ctrl+V) : l’image prend la place du cadre, l’adresse d’un autre site n’est plus dans le document ; une seule annulation remet le cadre et son adresse et retire l’image collée ; le texte autour ne bouge pas',
    run: async (h) => {
      const problems = [];
      const url = 'https://coller1.test/logo.png';
      try {
        await h.resetEditor();
        Editor.setHTML('<p>Avant</p><p>' + img(url) + '</p><p>Après</p>');
        await h.sleep(300);
        const editor = EditorCore.getEditor();
        h.tiptap().focus();
        await h.selectAtomNode(document.querySelector('.tiptap .editor-image-blocked .editor-image-blocked-box'));
        await closeExplain(h);
        same(problems, 'le cadre est sélectionné', !!editor.state.selection.node && editor.state.selection.node.type.name, 'editorImage');
        const before = Editor.getHTML();
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(PNG_B64), c => c.charCodeAt(0))], 'collee.png', { type: 'image/png' }));
        editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        await waitFor(h, () => !Editor.getHTML().includes(url), 5000);
        const pasted = Editor.getHTML();
        const sources = parse(pasted).map(i => i.getAttribute('src'));
        same(problems, 'l’image collée prend la place du cadre', [pasted.includes(url), sources.length, /^data:image\//.test(sources[0] || '')], [false, 1, true]);
        same(problems, 'le texte autour ne bouge pas', [pasted.includes('Avant'), pasted.includes('Après')], [true, true]);
        same(problems, 'plus de cadre dans la vue', document.querySelectorAll('.tiptap .editor-image-blocked .editor-image-blocked-box').length, 0);
        editor.commands.undo();
        await h.sleep(250);
        same(problems, 'une annulation remet le document d’avant', Editor.getHTML() === before, true);
        same(problems, 'le cadre est de retour dans la vue', document.querySelectorAll('.tiptap .editor-image-blocked .editor-image-blocked-box').length, 1);
        same(problems, 'rien n’est parti vers le site', requestsTo(['coller1.test']), 0);
      } finally {
        await closeExplain(h);
        await h.resetEditor();
      }
      return verdict(problems);
    },
  });

  cases.push({
    id: 'extimg_reader_frames_are_buttons_that_open_the_window',
    description: 'Lecture : le cadre d’une image d’un autre site (corps, en-tête) est un bouton pour le clavier (rôle, Tab, texte qui dit ce qu’il fait) ; un clic, Entrée ou Espace ouvre la fenêtre qui explique, qui compte les images du document ; une autre touche ou un clic à côté n’ouvrent rien ; la fenêtre fermée, le focus revient sur le cadre, qui reste un cadre',
    run: async (h) => {
      const problems = [];
      const hf = { enabled: true, differentFirstPage: false, header: { default: img('https://lecbtn1.test/h.png'), first: '' }, footer: { default: '', first: '' } };
      const body = '<p>Corps du document</p>' + img('https://lecbtn1.test/b.png') + img('https://lecbtn2.test/c.png');
      try {
        await h.resetEditor();
        Editor.setHTML(body);
        Editor.setHeaderFooterData(hf);
        h.setA4Preview(true);
        await h.renderReaderMode(body, hf);
        await h.sleep(300);
        const frames = () => Array.from(document.querySelectorAll('#reader-container img[data-blocked-src]'));
        same(problems, 'trois cadres', frames().length, 3);
        same(problems, 'chacun est un bouton qui dit ce qu’il fait',
          frames().map(f => [f.getAttribute('role'), f.getAttribute('tabindex'), f.getAttribute('aria-label')]),
          frames().map(f => ['button', '0', I18n.t('image.blocked.action', { site: f.getAttribute('data-blocked-site') })]));
        same(problems, 'le texte du bouton cite le site', frames().every(f => f.getAttribute('aria-label').includes(f.getAttribute('data-blocked-site'))), true);
        const frame = frames().find(f => f.getAttribute('data-blocked-site') === 'lecbtn2.test');
        frame.click();
        await h.sleep(100);
        same(problems, 'un clic ouvre la fenêtre', explainOpen(), true);
        same(problems, 'elle compte le document : trois images, deux sites', [explainText().includes(I18n.t('image.explain.intro', { n: 3 })), explainText().includes(I18n.t('image.explain.sites', { n: 2, sites: 'lecbtn1.test, lecbtn2.test' }))], [true, true]);
        await closeExplain(h);
        frame.focus();
        same(problems, 'Tab : le cadre prend le focus', document.activeElement === frame, true);
        const press = key => { const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); frame.dispatchEvent(event); return event; };
        const enter = press('Enter');
        same(problems, 'Entrée ouvre la fenêtre', [explainOpen(), enter.defaultPrevented], [true, true]);
        await closeExplain(h);
        same(problems, 'fermée : le focus revient sur le cadre', document.activeElement === frame, true);
        const space = press(' ');
        same(problems, 'Espace ouvre la fenêtre', [explainOpen(), space.defaultPrevented], [true, true]);
        await closeExplain(h);
        const other = press('a');
        same(problems, 'une autre touche n’ouvre rien', [explainOpen(), other.defaultPrevented], [false, false]);
        document.querySelector('#reader-container .reader-content p').click();
        await h.sleep(100);
        same(problems, 'un clic à côté n’ouvre rien', explainOpen(), false);
        same(problems, 'le cadre reste un cadre', [frames().length, frame.isConnected && frame.hasAttribute('data-blocked-src'), /^data:image\/svg\+xml/.test(frame.getAttribute('src'))], [3, true, true]);
      } finally {
        await closeExplain(h);
        h.setA4Preview(false);
        document.getElementById('reader-container').style.display = '';
        document.getElementById('editor-container').style.display = '';
        await h.resetEditor();
      }
      return verdict(problems);
    },
  });

  // Un document pour de vrai : enregistré par « Enregistrer », ouvert par la liste des documents (js/main.js:loadTemplateIntoEditor, où la fenêtre s'ouvre).
  async function saveDocument(h, name, html, headerFooter) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(60);
    Editor.setHTML(html);
    if (headerFooter) Editor.setHeaderFooterData(headerFooter);
    byId('template-name').value = name;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function openDocument(h, id) {
    await Templates.loadAll();
    const select = byId('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(h, () => Templates.isCurrent(id), 3000);
    await h.sleep(250);
  }
  async function leaveDocument(h) {
    ActionHistory.reset();
    await h.clickButton('btn-new');
    await h.sleep(300);
  }

  cases.push({
    id: 'extimg_opening_a_saved_document_with_images_of_other_sites_shows_the_window_once',
    description: 'Ouvrir un vrai document par la liste des documents : celui qui porte une image d’un autre site (dans le corps ou l’en-tête) ouvre la fenêtre, une seule fois par session ; l’enregistrer ne l’ouvre pas ; celui qui n’a que des images intégrées n’ouvre rien ; en lecture seule elle ne s’ouvre pas (et le document n’est pas retenu : la personne qui peut modifier la verra) ; le document garde l’adresse',
    run: async (h) => {
      const problems = [];
      const ids = [];
      const rights = AccessRights.get;
      try {
        const withImage = await saveDocument(h, 'Images - avec image', '<p>Bonjour</p>' + img(EXTERNAL) + '<p>Merci.</p>');
        const without = await saveDocument(h, 'Images - sans image', '<p>Rien</p>' + img(DATA_PNG));
        const inHeader = await saveDocument(h, 'Images - en-tête', '<p>Corps</p>', HF_WITH_IMAGE);
        const guarded = await saveDocument(h, 'Images - lecture seule', '<p>Autre</p>' + img('https://lecseule.test/x.png'));
        ids.push(withImage, without, inHeader, guarded);
        same(problems, 'quatre documents enregistrés', new Set(ids).size, 4);
        same(problems, 'enregistrer n’ouvre pas la fenêtre', explainOpen(), false);
        await leaveDocument(h);
        await openDocument(h, withImage);
        same(problems, 'ouvrir : la fenêtre s’ouvre', [explainOpen(), explainText().includes(I18n.t('image.explain.intro', { n: 1 })), explainText().includes('images.exemple.test')], [true, true, true]);
        same(problems, 'le document garde l’adresse', Editor.getHTML().includes('src="' + EXTERNAL + '"'), true);
        await closeExplain(h);
        await leaveDocument(h);
        await openDocument(h, withImage);
        same(problems, 'rouvrir le même document : rien', explainOpen(), false);
        await leaveDocument(h);
        await openDocument(h, without);
        same(problems, 'un document sans image d’un autre site : rien', explainOpen(), false);
        await leaveDocument(h);
        await openDocument(h, inHeader);
        same(problems, 'une image d’en-tête compte', [explainOpen(), explainText().includes('entete.test')], [true, true]);
        await closeExplain(h);
        // En lecture seule : rien à remettre, donc pas de fenêtre, et le document n'est pas retenu.
        await leaveDocument(h);
        AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
        await openDocument(h, guarded);
        same(problems, 'lecture seule : pas de fenêtre', explainOpen(), false);
        same(problems, 'lecture seule : le document est bien ouvert', Editor.getHTML().includes('lecseule.test'), true);
        AccessRights.get = rights;
        await leaveDocument(h);
        await openDocument(h, guarded);
        same(problems, 'avec le droit de modifier : la fenêtre s’ouvre', [explainOpen(), explainText().includes('lecseule.test')], [true, true]);
        await closeExplain(h);
      } finally {
        AccessRights.get = rights;
        await closeExplain(h);
        try { await leaveDocument(h); } catch (e) { /* le cas est fini */ }
        for (const id of ids) { try { await Templates.remove(id); } catch (e) { /* déjà retiré */ } }
        try { await Templates.loadAll(); } catch (e) { /* idem */ }
      }
      return verdict(problems);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.externalImages = cases;
})();
