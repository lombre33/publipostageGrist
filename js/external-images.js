// Images d'un autre site que le widget et Grist : jamais chargées, jamais téléchargées (demande du 24/11, « plus aucun appel vers un autre site » : la politique de contenu de la page n'en admettra plus).
// Une image du document dont l'adresse est un http(s) vers un autre site (un ancien document inséré par adresse, une page web collée avant le 24/11) reste dans le document avec son adresse : rien n'en est
// modifié ni perdu, mais le navigateur ne reçoit jamais cette adresse. Trois façons de l'écarter, selon ce que devient le HTML :
//   - l'éditeur : la vue de l'image (js/editor-nodes.js) ne donne pas l'adresse au navigateur et montre un cadre qui nomme le site et dit que l'image n'est pas affichée ; un clic dessus ouvre la fenêtre qui explique (explain) ;
//   - un HTML qui va s'afficher (Lecture, en-têtes et pieds, galerie, aperçu d'ouverture, impression par le navigateur) : block(html) remplace, dans un document inerte, l'adresse par un cadre dessiné (SVG en
//     data:), garde l'adresse dans data-blocked-src et le site dans data-blocked-site ; à la Lecture ce cadre est un bouton (clic, Entrée ou Espace : la fenêtre qui explique) ;
//   - un HTML qui part à l'export (js/reader-mode.js:expandedWrapper) : setAside(html) range l'adresse dans data-external-src et ne laisse pas de `src` à l'image. Un export n'a plus rien à télécharger : il laisse
//     l'image de côté et le dit (ExportCommon.noteImageWithoutSource), comme pour une image illisible ;
//   et js/image-io.js (fetchBlob, load) refuse toute adresse que mayRead ne laisse pas passer : data:, blob:, le widget et le serveur de Grist (les pièces jointes, dont « Image depuis une variable », qui ne lit
//   que des colonnes Pièces jointes : aucune cellule ne peut envoyer l'export vers un autre site).
// Le HTML est lu dans un document inerte (<template>) : un innerHTML sur un nœud de la page, même détaché, fait déjà charger ses images au navigateur, et des nœuds qui passent d'un <template> à la page les
// chargent de même (l'<img> change de document).
// La fenêtre qui explique (demande du 24/11 : « une pop-up qui explique le pourquoi et la manip ; ensuite les images en place holder, et au clic la pop-up revient ») s'ouvre à l'ouverture d'un document qui porte
// de ces images (js/main.js:loadTemplateIntoEditor, une fois par document et par session) et à chaque clic sur un cadre de l'éditeur ou de la Lecture ; elle ne change rien au document.
// Une image qui charge quand même depuis un autre site (une surface qui n'a pas pensé à block) reste signalée : toute <img> de la page qui charge depuis un autre site porte data-external-site="hôte" et une
// infobulle, et css/external-images.css lui trace un contour en tirets. Un observateur de la page le fait pour toutes les images : aucune surface d'affichage n'a à y penser. Le widget n'a aucune image d'un
// autre site dans sa propre interface.
//   ExternalImages.cancelError() -> l'erreur d'un export que la personne arrête (js/alt-reminder.js la lève) ; ExternalImages.isCancel(error) : un seul « Export annulé » pour toutes les fenêtres d'avant l'export
//   ExternalImages.fragmentsOf(html, headerFooterData) -> le corps, puis l'en-tête et le pied réellement exportés (js/alt-reminder.js compte les images à décrire dans les mêmes morceaux)
//   ExternalImages.siteOf(src) -> l'hôte d'une adresse d'image qui sort du widget (http(s) vers un autre site), sinon ''
//   ExternalImages.blockedSiteOf(src) -> le même hôte : plus aucun site ne s'affiche (avant le 24/11, un clic « Afficher » en levait le blocage)
//   ExternalImages.block(html, { zoom }) / blockIn(élément inerte, { zoom }) -> le HTML à afficher : les images d'un autre site y sont remplacées par leur cadre ; la chaîne telle quelle quand il n'y a rien
//   à changer
//   ExternalImages.setAside(html) -> le HTML à exporter : les images d'un autre site y perdent leur `src` (promesse : le HTML, lu dans un <template>) ; la chaîne telle quelle quand il n'y a rien à changer
//   ExternalImages.mayRead(src) -> promesse : vrai quand l'adresse peut se lire (data:, blob:, widget, serveur de Grist), faux pour tout autre site
//   ExternalImages.survey(fragments) -> { count, sites } : les images d'un autre site de ces morceaux de HTML (leur nombre, puis leurs sites dans l'ordre où ils se présentent)
//   ExternalImages.noticeOnOpen(modèle) -> vrai quand la fenêtre s'est ouverte : le document qui s'ouvre porte des images d'un autre site et sa fenêtre n'a pas déjà été montrée pour lui dans cette session
//   ExternalImages.explain({ site }) -> promesse, résolue à la fermeture de la fenêtre : dit pourquoi les images d'un autre site ne s'affichent plus et comment les remettre ; compte celles du document ouvert
const ExternalImages = (function () {
  const CANCEL_NAME = 'ExternalImagesCancelled';

  function cancelError() {
    const error = new Error('Export annulé.');
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

  // Les origines que l'app lit : celle du widget, et celle du serveur de Grist (le jeton de pièces jointes, jamais deviné d'après l'adresse d'une image).
  async function homeOrigins() {
    const origins = new Set([location.origin]);
    try {
      const grist = await GristAPI.getServerOrigin();
      if (grist) origins.add(grist);
    } catch (e) { /* sans le serveur de Grist, seul le widget se lit : plus de refus, jamais moins */ }
    return origins;
  }

  // L'adresse d'une image part-elle vers un autre site que le widget et le serveur de Grist ? data:, blob:, adresse vide ou relative : non, et tout schéma qui n'est pas http(s) non plus (rien n'en part sur
  // le réseau).
  function leaves(value, origins) {
    const src = String(value || '').trim();
    if (!src || /^(data|blob):/i.test(src)) return false;
    let url;
    try { url = new URL(src, document.baseURI); } catch (e) { return false; }
    return (url.protocol === 'http:' || url.protocol === 'https:') && !origins.has(url.origin);
  }

  async function mayRead(value) {
    const src = String(value || '').trim();
    if (!src) return false;
    if (/^(data|blob):/i.test(src)) return true;
    let url;
    try { url = new URL(src, document.baseURI); } catch (e) { return false; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return (await homeOrigins()).has(url.origin);
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

  // --- Le cadre à la place de l'image ---
  const BLOCKED_SRC = 'data-blocked-src';
  const BLOCKED_SITE = 'data-blocked-site';
  const BLOCKED_ATTRS = ['alt', 'title'];   // ce que le cadre remplace, rangé dans data-blocked-<nom> pour que le document garde ce que la personne avait écrit

  // Le site d'une adresse d'image qui ne se charge pas (tout autre site que le widget), sinon ''.
  const blockedSiteOf = src => siteOf(src);

  const svgText = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  // Le facteur de réduction de la feuille à l'écran : js/main.js (applyPageFitZoom) le pose en --pp-fit-zoom sur les deux conteneurs, et le retire sans Aperçu A4
  // (1). Un cadre dessiné dans une feuille réduite à 0,6 verrait son texte réduit comme elle : il est dessiné à l'envers de ce facteur.
  function sheetZoom() {
    for (const id of ['editor-container', 'reader-container']) {
      const container = document.getElementById(id);
      const zoom = container ? parseFloat(container.style.getPropertyValue('--pp-fit-zoom')) : NaN;
      if (isFinite(zoom) && zoom > 0) return Math.round(zoom * 100) / 100;
    }
    return 1;
  }
  const zoomOf = options => (options && options.zoom > 0 ? options.zoom : sheetZoom());
  const frameCache = new Map();
  // Le cadre d'une image écartée, dessiné en SVG (une <img> ne porte que des dessins) : le site, puis « Image non affichée ». Rien n'y est à l'échelle de la boîte de l'image (pas de viewBox) : le contenu est
  // centré et garde la même taille d'écran (11 px) quelle que soit la place que prend l'image ; `zoom` est le facteur de la feuille (sheetZoom), les longueurs se donnent en pixels de feuille. La feuille est
  // blanche dans les deux thèmes : les couleurs sont celles de la feuille (texte noir bleuté, gris foncé), jamais celles du thème sombre ; le fond gris et les tirets sont posés par
  // css/external-images.css. Mis en cache par langue, facteur et site.
  function frameSrc(site, zoom) {
    const key = I18n.getLang() + '\u0000' + zoom + '\u0000' + site;
    if (frameCache.has(key)) return frameCache.get(key);
    const u = px => Math.round(px / zoom * 100) / 100;
    const shown = site.length > 17 ? site.slice(0, 16) + '…' : site;
    const font = (weight, fill) => `font-family='system-ui,-apple-system,Segoe UI,Roboto,sans-serif' font-size='${u(11)}' font-weight='${weight}' text-anchor='middle' fill='${fill}'`;
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><svg x='50%' y='50%' overflow='visible'>"
      + `<text x='0' y='${u(-5)}' ${font(600, '#1b2430')}>${svgText(shown)}</text>`
      + `<text x='0' y='${u(11)}' ${font(400, '#3f4a5a')}>${svgText(I18n.t('image.blocked.note'))}</text></svg></svg>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    frameCache.set(key, uri);
    return uri;
  }
  const hintOf = site => I18n.t('image.blocked.hint', { site });
  const altOf = site => I18n.t('image.blocked.alt', { site });

  // Remplace l'adresse de cette <img> par son cadre ; vrai si elle a été écartée. Une image de pièce jointe vient du serveur de Grist : jamais écartée.
  function blockImage(img, zoom) {
    if (img.hasAttribute('data-attachment-id') || img.dataset.source === 'attachment') return false;
    const src = img.getAttribute('src');
    const site = blockedSiteOf(src);
    if (!site) return false;
    img.setAttribute(BLOCKED_SRC, src);
    img.setAttribute(BLOCKED_SITE, site);
    BLOCKED_ATTRS.forEach(name => { if (img.hasAttribute(name)) img.setAttribute('data-blocked-' + name, img.getAttribute(name)); });
    img.setAttribute('src', frameSrc(site, zoom));
    img.setAttribute('alt', altOf(site));
    img.setAttribute('title', hintOf(site));
    return true;
  }

  // Le HTML d'un document ou d'une zone qui va s'afficher : les images d'un autre site y sont remplacées par leur cadre. Lu dans un <template>, inerte : rien ne charge pendant la lecture. Les adresses
  // se lisent après décodage (`&#104;ttps:` est bien une adresse http). La chaîne est rendue telle quelle quand rien ne change - le cas courant : un document sans image d'un autre site.
  // `options.zoom` : le facteur de la feuille où le HTML va s'afficher (1 hors d'une feuille réduite : la galerie) ; par défaut, celui de la page.
  function block(html, options) {
    if (!html || !/<img\b/i.test(html)) return html;
    const host = Dom.inertTemplate(html);
    return blockIn(host.content, options) ? host.innerHTML : html;
  }
  // La même mise en règle sur un fragment ou un élément déjà lu dans un document inerte (le <template> de PageLayout.resolvePageNumberBadges) ; vrai si
  // une image a changé. Une image qui a déjà son cadre (data-blocked-src) n'est pas touchée.
  function blockIn(root, options) {
    let changed = false;
    let zoom = 0;
    root.querySelectorAll('img').forEach(img => {
      if (img.hasAttribute(BLOCKED_SRC)) return;
      if (!zoom) zoom = zoomOf(options);
      if (blockImage(img, zoom)) changed = true;
    });
    return changed;
  }

  // Le HTML d'un document qui part à l'export : chaque image d'un autre site y perd son `src` (rangé dans data-external-src, que HtmlSanitize garde) : lu dans un <template>, rien ne charge, ni pendant la lecture,
  // ni quand le HTML entre dans un nœud de la page. L'export qui la rencontre n'a pas d'adresse à lire : il la laisse de côté et la compte (ExportCommon.noteImageWithoutSource), sans rien télécharger. Une
  // pièce jointe de Grist garde son adresse (celle de l'origine du jeton). La chaîne est rendue telle quelle quand rien ne change.
  const ASIDE_ATTR = 'data-external-src';
  async function setAside(html) {
    if (!html || !/<img\b/i.test(html)) return html;
    const host = Dom.inertTemplate(html);
    const images = Array.from(host.content.querySelectorAll('img[src]'));
    if (!images.length) return html;
    const origins = await homeOrigins();
    let changed = false;
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (!leaves(src, origins)) return;
      img.setAttribute(ASIDE_ATTR, src.trim());
      img.removeAttribute('src');
      changed = true;
    });
    return changed ? host.innerHTML : html;
  }

  // --- La fenêtre qui explique ---
  const el = (...args) => Dom.el(...args);
  const MAX_SITES_SHOWN = 6;
  const explained = new Set();   // les documents (par numéro) dont la fenêtre s'est déjà ouverte à l'ouverture, pour cette session : rouvrir un document ne la remontre pas
  let win = null;
  let refs = null;
  let shown = null;              // la promesse de la fenêtre ouverte : une demande qui arrive pendant qu'elle est ouverte reçoit la même
  let finish = null;

  const isAttachment = img => img.hasAttribute('data-attachment-id') || img.dataset.source === 'attachment';
  // Le HTML d'un document qui n'a pas une seule adresse d'image vers un autre site n'a rien à dire : ce test évite de le lire (un gros document s'ouvre vite).
  // Une adresse qui commence par http:, https:, // ou un caractère écrit en entité (`&#104;ttps:`) ; un `>` dans la valeur d'un autre attribut (alt, title) ne ferme pas la balise. Un faux positif ne coûte qu'une lecture.
  const MAY_HOLD_OUTSIDE = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*?\bsrc\s*=\s*["']?\s*(?:https?:|&#|\/\/)/i;

  // Les images d'un autre site que portent ces morceaux de HTML (le corps, puis l'en-tête et le pied) : leur nombre et leurs sites, dans l'ordre où ils se présentent.
  function survey(fragments) {
    const found = { count: 0, sites: [] };
    (fragments || []).forEach(fragment => {
      if (!fragment || !MAY_HOLD_OUTSIDE.test(fragment)) return;
      Dom.inertTemplate(fragment).content.querySelectorAll('img').forEach(img => {
        if (isAttachment(img)) return;
        const site = siteOf(img.getAttribute(BLOCKED_SRC) || img.getAttribute(ASIDE_ATTR) || img.getAttribute('src'));
        if (!site) return;
        found.count += 1;
        if (!found.sites.includes(site)) found.sites.push(site);
      });
    });
    return found;
  }

  // Le même décompte pour le document ouvert dans l'éditeur (au clic sur un cadre) : le texte de l'éditeur se lit sans le sérialiser, l'en-tête et le pied par leur HTML.
  function surveyOpenDocument() {
    const found = { count: 0, sites: [] };
    try {
      const editor = typeof EditorCore !== 'undefined' ? EditorCore.getEditor() : null;
      if (editor) editor.state.doc.descendants(node => {
        if (node.type.name !== 'editorImage' || node.attrs.varTable) return;
        const site = blockedSiteOf(node.attrs.src);
        if (!site) return;
        found.count += 1;
        if (!found.sites.includes(site)) found.sites.push(site);
      });
      const zones = survey(fragmentsOf('', typeof HeaderFooterPreview !== 'undefined' ? HeaderFooterPreview.getHeaderFooterData() : null).slice(1));
      zones.sites.forEach(site => { if (!found.sites.includes(site)) found.sites.push(site); });
      found.count += zones.count;
    } catch (e) { /* le décompte n'est qu'un confort : la fenêtre s'ouvre sans lui */ }
    return found;
  }

  function ensureWindow() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-external-images-modal', titleId: 'pp-external-images-title', size: 'md', boxClass: 'pp-external-images-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (finish) finish(); },
    });
    win.body.classList.add('pp-external-images-body');
    refs = win.addButtons();
    refs.ok.hidden = true;      // une information : un seul bouton, « Compris » (celui d'« Annuler », sous son nom)
    refs.cancel.addEventListener('click', () => { if (finish) finish(); });
  }

  function fill(found) {
    win.title.textContent = I18n.t('image.explain.title');
    refs.cancel.textContent = I18n.t('image.explain.close');
    const more = found.sites.length > MAX_SITES_SHOWN ? ' ' + I18n.t('image.explain.more', { n: found.sites.length - MAX_SITES_SHOWN }) : '';
    const steps = el('ol');
    ['step1', 'step2', 'step3'].forEach(name => steps.append(el('li', null, I18n.t('image.explain.' + name))));
    win.body.replaceChildren(
      el('p', null, I18n.t('image.explain.intro', { n: found.count })),
      el('p', 'pp-external-images-sites', I18n.t('image.explain.sites', { n: found.sites.length, sites: found.sites.slice(0, MAX_SITES_SHOWN).join(', ') + more })),
      el('p', 'pp-external-images-how', I18n.t('image.explain.how')),
      steps,
      el('p', null, I18n.t('image.explain.kept')),
    );
  }

  // Ouvre la fenêtre. `survey` : le décompte déjà fait (l'ouverture d'un document) ; sinon celui du document ouvert, et à défaut `site` (le site du cadre cliqué : une image qui n'est pas dans l'éditeur,
  // celle d'un aperçu). La promesse se résout à la fermeture ; le focus revient où il était (le cadre sélectionné reste sélectionné).
  function explain(options) {
    const opts = options || {};
    if (shown) return shown;
    const found = opts.survey && opts.survey.count ? opts.survey : surveyOpenDocument();
    if (!found.count && opts.site) { found.count = 1; found.sites = [opts.site]; }
    if (!found.count) return Promise.resolve();
    ensureWindow();
    fill(found);
    shown = new Promise(resolve => {
      finish = () => { finish = null; shown = null; win.hide(); resolve(); };
    });
    win.show(refs.cancel);
    return shown;
  }

  // À l'ouverture d'un document (js/main.js:loadTemplateIntoEditor) : s'il porte des images d'un autre site, la fenêtre s'ouvre, une seule fois par document et par session (un document sans numéro,
  // un nouveau, n'a pas de mémoire : il n'en porte pas, l'import ne reprend plus de telles images).
  function noticeOnOpen(template) {
    if (!template || typeof template.contenu !== 'string') return false;
    const key = template.id != null ? String(template.id) : '';
    if (key && explained.has(key)) return false;
    const found = survey(fragmentsOf(template.contenu, template.headerFooter));
    if (!found.count) return false;
    if (key) explained.add(key);
    explain({ survey: found });
    return true;
  }

  // Un clic sur un cadre rouvre la fenêtre : celui de la vue de l'image de l'éditeur (la sélection de l'image se fait comme avant, au bouton de la souris) et l'image dessinée de la Lecture, qui est aussi un bouton
  // au clavier (Tab, puis Entrée ou Espace). Un glissement qui finit sur le cadre (on déplace l'image) n'est pas un clic.
  const FRAME_SELECTOR = '.tiptap .editor-image-blocked-box, #reader-container img[' + BLOCKED_SRC + ']';
  const siteOfFrame = frame => {
    const wrap = frame.closest('.editor-image-blocked');
    return (wrap && wrap.dataset.blockedSite) || frame.getAttribute(BLOCKED_SITE) || '';
  };
  function watchFrames() {
    if (typeof document === 'undefined') return;
    let pressed = null;
    const frameOf = event => (event.target && event.target.closest ? event.target.closest(FRAME_SELECTOR) : null);
    document.addEventListener('mousedown', event => { pressed = frameOf(event) ? { x: event.clientX, y: event.clientY } : null; }, true);
    document.addEventListener('click', event => {
      const frame = frameOf(event);
      if (!frame) return;
      const moved = pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4;
      pressed = null;
      if (!moved) explain({ site: siteOfFrame(frame) });
    }, true);
    document.addEventListener('keydown', event => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.defaultPrevented) return;
      const frame = frameOf(event);
      if (!frame || frame.localName !== 'img') return;
      event.preventDefault();
      explain({ site: siteOfFrame(frame) });
    }, true);
  }
  watchFrames();

  // À la Lecture le cadre dessiné est un bouton : il se prend au clavier et dit ce qu'il fait. Ailleurs (galerie, en-têtes et pieds de l'éditeur, impression) c'est une image comme une autre.
  function makeActionable(img) {
    if (!img.closest('#reader-container')) return;
    if (!img.hasAttribute('role')) img.setAttribute('role', 'button');
    if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
    const label = I18n.t('image.blocked.action', { site: img.getAttribute(BLOCKED_SITE) || '' });
    if (img.getAttribute('aria-label') !== label) img.setAttribute('aria-label', label);
  }

  async function markImage(img) {
    if (img.hasAttribute(BLOCKED_SRC)) { makeActionable(img); return; }
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
  }
  watchDisplay();

  return { isCancel, cancelError, fragmentsOf, siteOf, blockedSiteOf, block, blockIn, setAside, mayRead, hintOf, survey, noticeOnOpen, explain };
})();
