// Images d'un site externe à l'export (choix d'Antoine, 2026-10-01 : « Fenêtre avant l'export », AUDIT_CODE.md §2.3). Une image du modèle dont l'adresse est un
// http(s) vers un autre site que le widget ou Grist (ancien modèle inséré par URL avant la conversion en base64 à l'insertion, image collée depuis une page web,
// conversion impossible) était téléchargée à chaque export, sans rien demander (js/pdf-export.js:inlineEditorImagesAsDataUri, js/docx-export.js:docxImageDataFrom, js/xlsx-export.js:imageForWorkbook).
// Avant tout export, une fenêtre (Dialogs.confirm) liste les sites : « Continuer » exporte, « Annuler » arrête l'export - rien n'est téléchargé ni écrit.
// Ne comptent PAS comme externes : les data: et blob:, l'origine du widget, et le serveur de Grist (les images de pièces jointes, dont « Image depuis une
// variable » qui ne lit que des colonnes Pièces jointes : aucune cellule ne peut envoyer l'export vers un autre site). L'affichage dans l'éditeur et la Lecture ne
// change pas : ils chargent ces images comme toute page.
//   ExternalImages.confirmExport(html, headerFooterData)  -> Promise<void> ; rejette (isCancel) quand la fenêtre est refusée
//   ExternalImages.beginRun() / endRun()                   -> un lancement d'export (un clic, un lot entier : js/main.js:withExportLock) : un site déjà accepté n'est pas
//                                                              redemandé, un refus arrête tout le lot ; sans lancement ouvert, chaque appel demande pour lui seul
//   ExternalImages.isCancel(error)
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

  return { beginRun, endRun, confirmExport, isCancel };
})();
