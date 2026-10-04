// Images d'un autre site que le widget et Grist, à l'export et à l'affichage.
// Une image du modèle dont l'adresse est un http(s) vers un autre site (ancien modèle inséré par URL avant la conversion en base64 à l'insertion,
// image collée depuis une page web, conversion impossible) est téléchargée par l'export (js/pdf-export.js:inlineEditorImagesAsDataUri,
// js/docx-export.js:docxImageDataFrom, js/xlsx-export.js:imageForWorkbook) : avant tout export, une fenêtre (Dialogs.confirm) liste ces sites,
// « Continuer » exporte et « Annuler » arrête l'export, sans rien télécharger ni écrire.
// Ne comptent pas comme externes : les data: et blob:, l'origine du widget et le serveur de Grist (les images de pièces jointes, dont « Image depuis
// une variable », qui ne lit que des colonnes Pièces jointes : aucune cellule ne peut envoyer l'export vers un autre site).
// À l'affichage, une image d'un autre site se charge dès que le modèle s'ouvre, dans l'éditeur comme dans la Lecture, et révèle à ce site l'ouverture
// du document (adresse IP, heure). Rien ne l'empêche, le modèle s'affiche comme avant, mais elle est signalée en permanence : toute <img> de la page
// qui charge depuis un autre site porte data-external-site="hôte" et une infobulle, et css/external-images.css lui trace un contour en tirets. Un
// observateur de la page le fait pour toutes les images (éditeur, Lecture, en-têtes et pieds) : aucune surface d'affichage n'a à y penser. Le widget
// n'a aucune image d'un autre site dans sa propre interface.
//   ExternalImages.confirmExport(html, headerFooterData) -> Promise<void> ; rejette (isCancel) quand la fenêtre est refusée
//   ExternalImages.beginRun() / endRun() -> un lancement d'export (un clic, un lot entier : js/main.js:withExportLock) : un site déjà accepté n'est
//   pas redemandé, un refus arrête tout le lot ; sans lancement ouvert, chaque appel demande pour lui seul
//   ExternalImages.isCancel(error)
//   ExternalImages.siteOf(src) -> l'hôte d'une adresse d'image qui sort du widget (http(s) vers un autre site), sinon ''
// Le HTML est lu dans un document inerte (DOMParser) : un innerHTML sur un nœud de la page, même détaché, fait déjà charger ses images au navigateur.
const ExternalImages = (function () {
  const CANCEL_NAME = 'ExternalImagesCancelled';
  let run = null;                          // lancement en cours : { approved: Set<site>, cancelled }
  let queue = Promise.resolve();           // une seule fenêtre à la fois : deux demandes qui se croisent attendent leur tour
  let memo = { key: null, entries: null }; // dernier HTML lu : un lot rend le même modèle ligne après ligne, inutile de le relire à chaque ligne

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
      // Seuls http(s) partent sur le réseau : fetch ne sait rien faire d'un ftp: ou d'un file:.
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || trusted.has(url.origin) || sites.includes(url.host)) return;
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
    // L'infobulle est écrite dans la langue du moment : un changement de langue la réécrit.
    I18n.onChange(() => document.querySelectorAll('img[' + SITE_ATTR + ']').forEach(img => { img.title = siteTip(img.getAttribute(SITE_ATTR)); }));
  }
  watchDisplay();

  return { beginRun, endRun, confirmExport, isCancel, siteOf };
})();
