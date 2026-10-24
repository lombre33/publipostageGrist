// La FENÊTRE À PART du diaporama (extension « diapositives » de Grist Factory Suite ; demande du 24/10, « un moyen alternatif pour avoir un plein écran, c'est vraiment important »). Le cadre du
// widget refuse le plein écran du navigateur - celui de Grist comme le sous-cadre isolé de GFS n'ont pas `allow="fullscreen"`, et rien depuis le widget ne peut le forcer (étude du 24/10) -, mais une
// page ouverte dans sa propre fenêtre l'obtient d'un clic. Ce fichier est des deux côtés, avec le même format :
//  - L'APP (slide-show.js) : `open` ouvre la page present.html dans une fenêtre, dans le geste de la personne : le navigateur n'accorde une fenêtre que pendant environ 5 s après un clic ou une touche (mesuré, bloqueur de fenêtres allumé, Chromium 153 et Firefox 140 et 158 : ouverte à 4,5 s, refusée à 6,5 s), donc avant le rendu, qui peut durer plus, et sans attente longue avant elle ; la question sur les images d'un autre site peut passer avant (son bouton « Continuer » est un geste neuf) ; la page dit
//    qu'elle est prête (`postMessage` à son ouvreur) ; l'app lui envoie ses textes, puis le rendu MESURÉ de la présentation (`pack` : celui du panneau, js/print-export.js:stage, sérialisé), dès qu'il
//    est prêt. C'est une copie du moment : modifier le document ensuite ne change pas le diaporama ouvert ; ▶ de nouveau le remplace (la fenêtre porte un nom, `TARGET`, au lieu de s'empiler).
//  - LA PAGE (slide-present.js) : `unpack` remonte ce rendu à l'identique (mêmes feuilles de style, mêmes variables de page, mêmes polices) pour que le lecteur commun (slide-player.js) le joue.
//    Elle n'écoute que son ouvreur (`event.source`), sa politique de sécurité du contenu refuse tout script en ligne et tout gestionnaire d'événement, et `clean` retire encore du HTML reçu ce qui
//    s'exécuterait (script, cadre, objet, gestionnaire `on…`, adresse `javascript:`) : un message qui ne vient pas de l'app ne fait jamais tourner de code.
// Seuls ce fichier et slide-present.js parlent à une autre fenêtre que le cadre parent de GFS (js/gfs-link.js) ; codeHygiene garde leurs gardes d'origine.
const SlideWindow = (function () {
  const PAGE = 'present.html';
  const TARGET = 'pp-slide-show';        // le nom de la fenêtre : « ▶ » la rouvre au lieu d'en empiler
  const VERSION = 1;                     // la forme de ce qui s'envoie ; une page plus ancienne ou plus récente ne le lit pas
  const READY = 'pp-present-ready';      // la page -> l'app : « je suis là »
  const INFO = 'pp-present-info';        // l'app -> la page : la langue, le thème, le titre et les textes
  const SHOW = 'pp-present-show';        // l'app -> la page : le rendu mesuré
  const OWN = document.currentScript && document.currentScript.src ? document.currentScript.src : '';

  let link = null;                       // la fenêtre du dernier lancement
  let listening = false;

  // L'adresse de la page : à côté de ce fichier, avec sa version de cache (?v=) pour qu'une page restée en cache ne parle pas à un autre format.
  function address() {
    const base = OWN || new URL('extensions/diapositives/slide-window.js', document.baseURI).href;
    const url = new URL(PAGE, base);
    url.search = new URL(base).search;
    return url.href;
  }

  // Ouvre la fenêtre, avec `info` : { lang, theme, title, labels } (les textes de la page, dans la langue de l'app). Rend le lien de cette fenêtre, ou null quand le navigateur la refuse - touche
  // F5 sous Firefox ESR, cadre sans `allow-popups`, bloqueur de fenêtres (dont un geste vieux de plus de 5 s). À appeler dans le geste, avant le rendu : un `await` bref avant elle ne gêne pas (celui de la question sur les images d'un autre site attend un bouton, qui est un geste neuf), une attente de plus de 5 s la ferait refuser.
  function open(info) {
    let popup = null;
    try { popup = window.open(address(), TARGET); } catch (e) { popup = null; }
    if (!popup || popup.closed) return null;
    if (link) link.release();
    link = makeLink(popup, info);
    if (!listening) { listening = true; window.addEventListener('message', onMessage); }
    return link;
  }

  function makeLink(popup, info) {
    const self = {
      popup, info, ready: false, payload: null,
      // Le rendu est prêt : il part tout de suite si la page l'attend, sinon à son premier signe. Il reste gardé tant que la fenêtre est ouverte (une page rechargée le redemande).
      deliver(payload) { self.payload = payload; if (self.ready) send(self, SHOW, { payload }); },
      // Rien à montrer (« Annuler », rendu raté) : la fenêtre se ferme.
      cancel() { self.release(); try { popup.close(); } catch (e) { /* déjà fermée */ } },
      // La fenêtre est fermée, ou remplacée par la suivante : ce qu'elle gardait est libéré.
      release() { clearInterval(self.watch); self.payload = null; if (link === self) link = null; },
      watch: 0,
    };
    self.watch = setInterval(() => { if (popup.closed) self.release(); }, 2000);
    return self;
  }
  function send(target, type, body) {
    try { target.popup.postMessage(Object.assign({ type }, body), '*'); } catch (e) { /* fenêtre fermée entre-temps */ }
  }
  // Le seul message que l'app attend : « prête », de la fenêtre qu'elle a ouverte (jamais d'une autre) et de la page elle-même (l'origine est celle de la page, ou « null » quand le cadre isolé de GFS
  // lui a passé son bac à sable).
  function onMessage(event) {
    const data = event.data;
    if (!link || event.source !== link.popup || !data || data.type !== READY) return;
    if (event.origin !== 'null' && event.origin !== new URL(address()).origin) return;
    link.ready = true;
    send(link, INFO, { info: link.info });
    if (link.payload) send(link, SHOW, { payload: link.payload });
  }

  // Ce que la fenêtre reçoit : le rendu mesuré de PrintExport.stage (`job`) sous forme de données - les feuilles de style de la page (adresses, et le texte des <style> de l'en-tête), l'emplacement du
  // rendu (`scope`, en HTML), les variables de page de <html> (--pp-margin-*, --pp-page-width... : la largeur des feuilles en dépend) et la découpe en pages - avec `data` (props, timings, starts, anchors, startPage,
  // fromCurrent : ce que le lecteur lit sur l'éditeur au départ). Rien n'y est de l'éditeur : c'est le rendu de la Lecture, résolu pour la ligne choisie.
  function pack(job, data) {
    const shadow = job.host.shadowRoot;
    const scope = shadow.querySelector('.pp-print-scope');
    const sheets = Array.from(shadow.children).filter(node => node.tagName === 'LINK' || node.tagName === 'STYLE')
      .map(node => (node.tagName === 'LINK' ? { href: node.href } : { id: node.id, text: node.textContent }));
    const html = document.documentElement.style;
    const vars = {};
    for (let i = 0; i < html.length; i++) if (html[i].indexOf('--pp-') === 0) vars[html[i]] = html.getPropertyValue(html[i]);
    return {
      v: VERSION, sheets, scope: scope.outerHTML, vars, hostClass: job.host.className, hostWidth: job.host.style.getPropertyValue('--pp-print-host-width'),
      windows: job.windows, pagePx: job.pagePx, sheetLeft: job.sheetLeft,
      props: data.props, timings: data.timings, starts: data.starts, anchors: data.anchors, startPage: data.startPage, fromCurrent: !!data.fromCurrent,
    };
  }

  // La page. Ce que le HTML reçu ne doit jamais faire : s'exécuter. Un script, un cadre, un objet, une balise de base ou de formulaire, un gestionnaire `on…`, une adresse `javascript:` : retirés (le
  // fragment est inerte, rien ne s'exécute pendant qu'on le lit). Les feuilles de style et les images du rendu restent : le diaporama les montre.
  const FORBIDDEN = 'script, iframe, frame, frameset, object, embed, applet, base, meta, link, form, noscript, portal';
  const ADDRESSES = ['href', 'src', 'xlink:href', 'action', 'formaction', 'data', 'poster'];
  // Le navigateur ignore les espaces et les caractères de contrôle d'une adresse (`java\tscript:`) : on les retire avant de regarder.
  const SCRIPTED = /^(?:javascript|vbscript|data:text\/html)/i;
  const scripted = value => SCRIPTED.test(String(value).replace(/[\u0000-\u0020]+/g, ''));
  function clean(fragment) {
    fragment.querySelectorAll(FORBIDDEN).forEach(node => node.remove());
    fragment.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.indexOf('on') === 0 || (ADDRESSES.indexOf(name) !== -1 && scripted(attribute.value))) node.removeAttribute(attribute.name);
      });
    });
    return fragment;
  }
  // Une feuille de style n'est lue que d'un site web : jamais d'une adresse javascript: ou data: venue d'un message.
  const isWebAddress = value => typeof value === 'string' && /^https?:\/\//i.test(value);
  function linkNode(href) {
    const node = document.createElement('link');
    node.rel = 'stylesheet';
    node.href = href;
    return node;
  }
  function styleNode(sheet) {
    const node = document.createElement('style');
    if (typeof sheet.id === 'string' && /^[\w-]+$/.test(sheet.id)) node.id = sheet.id;
    node.textContent = String(sheet.text || '');
    return node;
  }
  // Attend que chacune de ces feuilles ait chargé (ou échoué) : au plus `maxMs` en tout.
  function settleLinks(links, maxMs) {
    const waiting = links.filter(node => !node.sheet);
    if (!waiting.length) return Promise.resolve();
    return new Promise((resolve) => {
      let left = waiting.length;
      const timer = setTimeout(resolve, maxMs);
      const one = () => { if (--left === 0) { clearTimeout(timer); resolve(); } };
      waiting.forEach((node) => { node.addEventListener('load', one, { once: true }); node.addEventListener('error', one, { once: true }); });
    });
  }
  // Les polices du rendu sont chargées avant le premier affichage : la découpe en pages a été mesurée avec elles.
  async function loadFonts() {
    if (!document.fonts) return;
    await Promise.all(Array.from(document.fonts).map(face => face.load().catch(() => null)));
    await document.fonts.ready;
  }

  // Remonte le rendu reçu dans `parent` : le conteneur et son arbre ombre (feuilles de style, puis l'emplacement du rendu), et rend ce que le lecteur attend - la copie mesurée (`job`, de la forme de
  // PrintExport.stage), ses données et le départ. Rejeté quand la forme n'est pas celle-ci ou que le rendu manque.
  async function unpack(payload, parent) {
    if (!payload || payload.v !== VERSION || typeof payload.scope !== 'string' || !Array.isArray(payload.windows) || !payload.windows.length) throw new Error('rendu illisible');
    const root = document.documentElement;
    Object.keys(payload.vars || {}).forEach((name) => { if (/^--pp-[\w-]+$/.test(name) && typeof payload.vars[name] === 'string') root.style.setProperty(name, payload.vars[name]); });
    // Les feuilles de style de l'app, dans l'en-tête aussi : une police (@font-face) ne se déclare que dans le document, pas dans un arbre ombre. Celles que la page porte déjà ne sont pas reposées.
    const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
    const present = new Set(Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map(node => node.href));
    const added = [];
    sheets.forEach((sheet) => {
      if (!sheet || !isWebAddress(sheet.href)) return;
      const node = linkNode(sheet.href);
      if (present.has(node.href)) return;
      present.add(node.href);
      document.head.appendChild(node);
      added.push(node);
    });
    const host = document.createElement('div');
    host.id = SlidePlayer.HOST_ID;
    host.className = /^[\w -]+$/.test(String(payload.hostClass)) ? String(payload.hostClass) : 'pp-print-host';
    host.setAttribute('aria-hidden', 'true');
    if (/^\d+(?:\.\d+)?px$/.test(String(payload.hostWidth))) host.style.setProperty('--pp-print-host-width', payload.hostWidth);
    const shadow = host.attachShadow({ mode: 'open' });
    const inside = [];
    sheets.forEach((sheet) => {
      if (!sheet) return;
      const node = sheet.href !== undefined ? (isWebAddress(sheet.href) ? linkNode(sheet.href) : null) : styleNode(sheet);
      if (!node) return;
      shadow.appendChild(node);
      if (node.tagName === 'LINK') inside.push(node);
    });
    shadow.appendChild(clean(Dom.inertTemplate(payload.scope).content));
    parent.appendChild(host);
    await settleLinks(added.concat(inside), 8000);
    await loadFonts();
    const scope = shadow.querySelector('.pp-print-scope');
    const stage = shadow.getElementById('reader-container');
    if (!scope || !stage) { host.remove(); throw new Error('rendu illisible'); }
    return {
      job: { host, root: scope, stage, windows: payload.windows, pagePx: payload.pagePx, sheetLeft: payload.sheetLeft, dispose: () => host.remove() },
      data: { props: payload.props, timings: payload.timings, starts: payload.starts, anchors: Array.isArray(payload.anchors) ? payload.anchors.filter(anchor => typeof anchor === 'string') : [] },
      how: { startPage: Number(payload.startPage) || 0, fromCurrent: !!payload.fromCurrent },
    };
  }

  // Ce que la fenêtre fait, pour les essais.
  const state = () => (link ? { open: !link.popup.closed, ready: link.ready, delivered: !!link.payload } : null);

  return { open, pack, unpack, clean, state, VERSION, READY, INFO, SHOW };
})();
