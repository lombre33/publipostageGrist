// Images d'un autre site que le widget et Grist, à l'export et à l'affichage.
// Une image du modèle dont l'adresse est un http(s) vers un autre site (ancien modèle inséré par URL avant la conversion en base64 à l'insertion,
// image collée depuis une page web, conversion impossible) est téléchargée par l'export (js/pdf-export.js:inlineEditorImagesAsDataUri,
// js/docx-export.js:docxImageDataFrom, js/xlsx-export.js:imageForWorkbook) : avant tout export, une fenêtre (Dialogs.confirm) liste ces sites,
// « Continuer » exporte et « Annuler » arrête l'export, sans rien télécharger ni écrire.
// Ne comptent pas comme externes : les data: et blob:, l'origine du widget et le serveur de Grist (les images de pièces jointes, dont « Image depuis
// une variable », qui ne lit que des colonnes Pièces jointes : aucune cellule ne peut envoyer l'export vers un autre site).
// À l'affichage, une image d'un autre site révélerait à ce site l'ouverture du document (adresse IP, heure) : elle ne charge qu'après un clic
// « Afficher » (choix du 05/10, « Bloquer jusqu'à un clic »). Avant le clic le modèle montre un cadre à sa place, avec le site et le bouton ; le clic
// affiche toutes les images de ce site, pour la session (rien n'est gardé : à la prochaine ouverture elles sont de nouveau bloquées). Le modèle n'est
// jamais modifié : son HTML garde l'adresse, seul ce que le navigateur reçoit change. Trois façons de bloquer, selon d'où vient l'image :
//   - l'éditeur : la vue de l'image (js/editor-nodes.js) ne donne pas l'adresse au navigateur et montre le cadre et son vrai bouton ;
//   - un HTML qui va s'afficher (Lecture, en-têtes et pieds, galerie) : block(html) remplace, dans un document inerte, l'adresse par un cadre dessiné
//     (SVG en data:), garde l'adresse dans data-blocked-src et rend l'image cliquable (role="button", tabindex) ;
//   - les exports ne bloquent rien : ils lisent le HTML du modèle, derrière la fenêtre ci-dessous.
// Une image affichée (par le clic) reste signalée en permanence : toute <img> de la page qui charge depuis un autre site porte data-external-site="hôte"
// et une infobulle, et css/external-images.css lui trace un contour en tirets. Un observateur de la page le fait pour toutes les images (éditeur,
// Lecture, en-têtes et pieds) : aucune surface d'affichage n'a à y penser. Le widget n'a aucune image d'un autre site dans sa propre interface.
//   ExternalImages.confirmExport(html, headerFooterData) -> Promise<void> ; rejette (isCancel) quand la fenêtre est refusée
//   ExternalImages.beginRun() / endRun() -> un lancement d'export (un clic, un lot entier : js/main.js:withExportLock) : un site déjà accepté n'est
//   pas redemandé, un refus arrête tout le lot ; sans lancement ouvert, chaque appel demande pour lui seul
//   ExternalImages.isCancel(error)
//   ExternalImages.siteOf(src) -> l'hôte d'une adresse d'image qui sort du widget (http(s) vers un autre site), sinon ''
//   ExternalImages.blockedSiteOf(src) -> le même hôte tant que la personne n'a pas affiché ce site, sinon '' (l'image peut charger)
//   ExternalImages.block(html, { zoom }) / blockIn(élément inerte, { zoom }) -> le HTML à afficher : les images des sites pas encore affichés y sont remplacées par leur cadre, celles dont le site
//   vient d'être affiché y retrouvent leur adresse ; la chaîne telle quelle quand il n'y a rien à changer
//   ExternalImages.allow(site) -> affiche les images de ce site (la page, puis les abonnés) ; ExternalImages.onReveal(rappel(site))
//   ExternalImages.isAllowed(site)
// Le HTML est lu dans un document inerte (DOMParser) : un innerHTML sur un nœud de la page, même détaché, fait déjà charger ses images au navigateur.
const ExternalImages = (function () {
  const CANCEL_NAME = 'ExternalImagesCancelled';
  let run = null;                          // lancement en cours : { approved: Set<site>, cancelled }
  let queue = Promise.resolve();           // une seule fenêtre à la fois : deux demandes qui se croisent attendent leur tour
  let memo = { key: null, entries: null }; // dernier HTML lu : un lot rend le même modèle ligne après ligne, inutile de le relire à chaque ligne
  const allowedSites = new Set();          // les sites que la personne a affichés (clic « Afficher », « Garder le lien »), pour la session
  const revealListeners = [];              // ce qui se redessine quand un site est affiché (js/header-footer-preview.js, js/editor-nodes.js)

  function beginRun() { run = { approved: new Set(), cancelled: false }; }
  function endRun() { run = null; }

  function cancelError() {
    const error = new Error('Export annulé : images d’un site externe non acceptées.');
    error.name = CANCEL_NAME;
    return error;
  }
  const isCancel = error => !!error && error.name === CANCEL_NAME;

  // Le corps, puis l'en-tête et le pied réellement exportés (« première page » seulement quand elle diffère : même règle que le PDF et le Word).
  function fragmentsOf(html, headerFooterData) {
    const fragments = [html || ''];
    const hf = headerFooterData;
    if (hf && hf.enabled) {
      const zones = [hf.header && hf.header.default, hf.footer && hf.footer.default];
      if (hf.differentFirstPage) zones.push(hf.header && hf.header.first, hf.footer && hf.footer.first);
      zones.forEach(zone => { if (zone) fragments.push(zone); });
    }
    return fragments;
  }

  function imageEntries(fragments) {
    const key = fragments.join('\u0000');
    if (memo.key === key) return memo.entries;
    const entries = [];
    fragments.forEach(html => {
      new DOMParser().parseFromString(html, 'text/html').querySelectorAll('img').forEach(img => {
        entries.push({ src: (img.getAttribute('src') || '').trim(), attachmentId: img.getAttribute('data-attachment-id') || '' });
      });
    });
    memo = { key, entries };
    return entries;
  }

  // Les sites (hôte, avec son port s'il n'est pas celui par défaut) des images qui sortent du widget et de Grist, dans l'ordre où elles apparaissent.
  async function externalSites(entries) {
    const remote = entries.filter(entry => entry.src && !/^(data|blob):/i.test(entry.src));
    if (!remote.length) return [];
    const trusted = new Set([location.origin]);
    const attachment = entries.find(entry => entry.attachmentId);
    if (attachment) {
      // Le serveur de Grist est celui du jeton de pièces jointes, jamais deviné d'après l'adresse d'une image.
      try { trusted.add(new URL(await GristAPI.getAttachmentDownloadUrl(attachment.attachmentId)).origin); }
      catch (e) { /* sans lui, une image de pièce jointe est listée comme les autres : plus de questions, jamais moins */ }
    }
    const sites = [];
    remote.forEach(entry => {
      let url;
      try { url = new URL(entry.src, document.baseURI); } catch (e) { return; }
      // Seuls http(s) partent sur le réseau : fetch ne sait rien faire d'un ftp: ou d'un file:. Un site que la personne a déjà affiché (clic « Afficher »)
      // n'est pas redemandé : ce clic est son accord, l'export le reprend.
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || trusted.has(url.origin) || allowedSites.has(url.host) || sites.includes(url.host)) return;
      sites.push(url.host);
    });
    return sites;
  }

  // Un site accepté dans ce lancement n'est pas redemandé ; un refus, ici ou plus tôt dans le lot, arrête tout.
  function approve(sites) {
    const scope = run || { approved: new Set(), cancelled: false };
    const task = queue.then(async () => {
      if (scope.cancelled) throw cancelError();
      const pending = sites.filter(site => !scope.approved.has(site));
      if (!pending.length) return;
      const accepted = await Dialogs.confirm({
        title: I18n.t('dialog.externalImages.title'),
        message: I18n.t('confirm.externalImages', { count: pending.length, sites: pending.map(site => '• ' + site).join('\n') }),
        confirmLabel: I18n.t('common.continue'),
      });
      if (!accepted) { scope.cancelled = true; throw cancelError(); }
      pending.forEach(site => scope.approved.add(site));
    });
    queue = task.catch(() => {});
    return task;
  }

  async function confirmExport(html, headerFooterData) {
    const sites = await externalSites(imageEntries(fragmentsOf(html, headerFooterData)));
    if (sites.length) await approve(sites);
  }

  // Affichage : toute image de la page qui charge depuis un autre site est signalée.

  const SITE_ATTR = 'data-external-site';

  // L'hôte d'une adresse d'image qui part vers un autre site que le widget, sinon '' : data:, blob:, adresse vide, relative ou de la même origine, et tout protocole autre que http(s) ne comptent pas.
  function siteOf(src) {
    const value = String(src || '').trim();
    if (!value || /^(data|blob):/i.test(value)) return '';
    let url;
    try { url = new URL(value, document.baseURI); } catch (e) { return ''; }
    return ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== location.origin) ? url.host : '';
  }

  const siteTip = site => I18n.t('image.externalSite', { site });

  // --- Blocage jusqu'au clic « Afficher » ---
  const BLOCKED_SRC = 'data-blocked-src';
  const BLOCKED_SITE = 'data-blocked-site';
  const BLOCKED_ZOOM = 'data-blocked-zoom';   // le facteur de la feuille avec lequel le cadre a été dessiné (redessiné tel quel au changement de langue)
  const BLOCKED_ATTRS = ['alt', 'title'];   // ce que le cadre remplace, rangé dans data-blocked-<nom> pour être rendu à l'image affichée

  const isAllowed = site => allowedSites.has(site);
  // Le site d'une adresse d'image qui ne doit pas charger encore (un autre site que le widget, pas encore affiché), sinon ''.
  function blockedSiteOf(src) {
    const site = siteOf(src);
    return site && !allowedSites.has(site) ? site : '';
  }

  const svgText = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // Le facteur de réduction de la feuille à l'écran : js/main.js (applyPageFitZoom) le pose en --pp-fit-zoom sur les deux conteneurs, et le retire sans Aperçu A4
  // (1). Un cadre dessiné dans une feuille réduite à 0,6 verrait son texte réduit comme elle : il est dessiné à l'envers de ce facteur.
  function sheetZoom() {
    for (const id of ['editor-container', 'reader-container']) {
      const container = document.getElementById(id);
      const z = container ? parseFloat(container.style.getPropertyValue('--pp-fit-zoom')) : NaN;
      if (isFinite(z) && z > 0) return Math.round(z * 100) / 100;
    }
    return 1;
  }
  const zoomOf = options => (options && options.zoom > 0 ? options.zoom : sheetZoom());
  const frameCache = new Map();
  // Le cadre d'une image bloquée, dessiné en SVG (une <img> ne porte pas de bouton) : le site, puis « Afficher ». Rien n'y est à l'échelle de la boîte de
  // l'image (pas de viewBox) : le contenu est centré et garde la même taille d'écran (11 px, un bouton de 64 × 22 px) quelle que soit la place que prend
  // l'image ; `zoom` est le facteur de la feuille (sheetZoom), les longueurs se donnent en pixels de feuille. La feuille est blanche dans les deux thèmes :
  // les couleurs sont celles de la feuille (texte noir bleuté, bleu des boutons pleins, 4,55:1 pour le blanc dessus), jamais celles du thème sombre ; le
  // fond gris et les tirets sont posés par css/external-images.css. Mis en cache par langue, facteur et site.
  function frameSrc(site, zoom) {
    const key = I18n.getLang() + '\u0000' + zoom + '\u0000' + site;
    if (frameCache.has(key)) return frameCache.get(key);
    const u = px => Math.round(px / zoom * 100) / 100;
    const shown = site.length > 17 ? site.slice(0, 16) + '…' : site;
    const font = `font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='${u(11)}' font-weight='600' text-anchor='middle'`;
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><svg x='50%' y='50%' overflow='visible'>"
      + `<text x='0' y='${u(-10)}' ${font} fill='#1b2430'>${svgText(shown)}</text>`
      + `<rect x='${u(-32)}' y='${u(-2)}' width='${u(64)}' height='${u(22)}' rx='${u(11)}' fill='#2f6fed'/>`
      + `<text x='0' y='${u(13)}' ${font} fill='#ffffff'>${svgText(I18n.t('image.blocked.show'))}</text></svg></svg>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    frameCache.set(key, uri);
    return uri;
  }
  const hintOf = site => I18n.t('image.blocked.hint', { site });
  const altOf = site => I18n.t('image.blocked.alt', { site });

  // Remplace l'adresse de cette <img> par son cadre ; vrai si elle a été bloquée. Une image de pièce jointe vient du serveur de Grist : jamais bloquée.
  function blockImage(img, zoom) {
    if (img.hasAttribute('data-attachment-id') || img.dataset.source === 'attachment') return false;
    const src = img.getAttribute('src');
    const site = blockedSiteOf(src);
    if (!site) return false;
    img.setAttribute(BLOCKED_SRC, src);
    img.setAttribute(BLOCKED_SITE, site);
    img.setAttribute(BLOCKED_ZOOM, String(zoom));
    BLOCKED_ATTRS.forEach(name => { if (img.hasAttribute(name)) img.setAttribute('data-blocked-' + name, img.getAttribute(name)); });
    img.setAttribute('src', frameSrc(site, zoom));
    img.setAttribute('alt', altOf(site));
    img.setAttribute('title', hintOf(site));
    img.setAttribute('role', 'button');
    img.setAttribute('tabindex', '0');
    return true;
  }

  // L'inverse : l'image reprend son adresse, son texte alternatif et son titre d'origine.
  function unblockImage(img) {
    img.setAttribute('src', img.getAttribute(BLOCKED_SRC));
    BLOCKED_ATTRS.forEach(name => {
      const kept = img.getAttribute('data-blocked-' + name);
      if (kept === null) img.removeAttribute(name); else img.setAttribute(name, kept);
      img.removeAttribute('data-blocked-' + name);
    });
    ['role', 'tabindex', BLOCKED_SRC, BLOCKED_SITE, BLOCKED_ZOOM].forEach(name => img.removeAttribute(name));
  }

  // Le HTML d'un document ou d'une zone qui va s'afficher, en règle avec ce que la personne a affiché : les images des sites pas encore affichés y sont
  // remplacées par leur cadre, celles qui avaient un cadre et dont le site est affiché depuis y retrouvent leur adresse. Lu dans un <template>, inerte :
  // rien ne charge pendant la lecture. Les adresses se lisent après décodage (`&#104;ttps:` est bien une adresse http). La chaîne est rendue telle
  // quelle quand rien ne change - le cas courant : un modèle sans image d'un autre site.
  // `options.zoom` : le facteur de la feuille où le HTML va s'afficher (1 hors d'une feuille réduite : la galerie) ; par défaut, celui de la page.
  function block(html, options) {
    if (!html || !/<img\b/i.test(html)) return html;
    const host = document.createElement('template');
    host.innerHTML = html;
    return blockIn(host.content, options) ? host.innerHTML : html;
  }
  // La même mise en règle sur un fragment ou un élément déjà lu dans un document inerte (le <template> de PageLayout.resolvePageNumberBadges) ; vrai si
  // une image a changé.
  function blockIn(root, options) {
    let changed = false;
    let zoom = 0;
    root.querySelectorAll('img').forEach(img => {
      if (img.hasAttribute(BLOCKED_SRC)) {
        if (allowedSites.has(img.getAttribute(BLOCKED_SITE))) { unblockImage(img); changed = true; }
      } else {
        if (!zoom) zoom = zoomOf(options);
        if (blockImage(img, zoom)) changed = true;
      }
    });
    return changed;
  }

  function onReveal(listener) { revealListeners.push(listener); }

  // Affiche les images de ce site : celles de la page d'abord (un cadre redevient l'image), puis les surfaces qui se redessinent d'après le HTML ou d'après
  // le modèle. Pour la session : rien n'est écrit nulle part.
  function allow(site) {
    if (!site || allowedSites.has(site)) return;
    allowedSites.add(site);
    document.querySelectorAll('img[' + BLOCKED_SRC + ']').forEach(img => { if (img.getAttribute(BLOCKED_SITE) === site) unblockImage(img); });
    revealListeners.slice().forEach(listener => {
      try { listener(site); } catch (e) { console.error('[ExternalImages] une surface n\'a pas pu afficher les images de ' + site, e); }
    });
  }

  // Le clic sur un cadre (ou Entrée, Espace quand il a le focus) affiche son site. Pris en capture : un cadre dans la zone d'en-tête de l'éditeur ne doit
  // pas ouvrir la zone (son clic), ni un cadre de la Lecture rien d'autre que s'afficher.
  function revealFromEvent(event) {
    const img = event.target && event.target.closest ? event.target.closest('img[' + BLOCKED_SRC + ']') : null;
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    allow(img.getAttribute(BLOCKED_SITE));
  }
  document.addEventListener('click', revealFromEvent, true);
  document.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') revealFromEvent(event); }, true);

  async function markImage(img) {
    const src = img.getAttribute('src');
    let site = siteOf(src);
    // Une image de pièce jointe (posée par js/grist-api.js:hydrateAttachmentImages) vient du serveur de Grist : son hôte est celui du jeton, jamais deviné d'après l'adresse.
    if (site && img.dataset.source === 'attachment' && img.dataset.attachmentId) {
      try {
        if (site === new URL(await GristAPI.getAttachmentDownloadUrl(img.dataset.attachmentId)).host) site = '';
      } catch (e) { /* sans le serveur de Grist, une image de pièce jointe est signalée comme les autres : plus d'avertissements, jamais moins */ }
      if (img.getAttribute('src') !== src) return; // l'adresse a changé pendant l'attente : la mutation qui l'a changée juge la nouvelle
    }
    if (site) { img.setAttribute(SITE_ATTR, site); img.title = siteTip(site); }
    else if (img.hasAttribute(SITE_ATTR)) { img.removeAttribute(SITE_ATTR); img.removeAttribute('title'); }
  }

  function watchDisplay() {
    if (typeof MutationObserver === 'undefined') return;
    const visit = node => {
      if (node.nodeType !== 1) return;
      if (node.localName === 'img') markImage(node);
      else if (node.firstElementChild) node.querySelectorAll('img').forEach(markImage);
    };
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') visit(record.target); else record.addedNodes.forEach(visit);
    })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.querySelectorAll('img').forEach(markImage);
    // L'infobulle est écrite dans la langue du moment : un changement de langue la réécrit, comme le cadre d'une image encore bloquée.
    I18n.onChange(() => {
      document.querySelectorAll('img[' + SITE_ATTR + ']').forEach(img => { img.title = siteTip(img.getAttribute(SITE_ATTR)); });
      document.querySelectorAll('img[' + BLOCKED_SRC + ']').forEach(img => {
        const site = img.getAttribute(BLOCKED_SITE);
        img.setAttribute('src', frameSrc(site, parseFloat(img.getAttribute(BLOCKED_ZOOM)) || 1)); img.setAttribute('alt', altOf(site)); img.setAttribute('title', hintOf(site));
      });
    });
  }
  watchDisplay();

  return { beginRun, endRun, confirmExport, isCancel, siteOf, blockedSiteOf, block, blockIn, allow, isAllowed, onReveal, hintOf };
})();
