// L'objet VIDÉO de Slides+ (demande du 06/11, point 7 des retours du 06/11 : « un objet intégration vidéo, un lien, et la vidéo lisible dans l'éditeur » ; carte du 06/11 17:55Z, « GFS joue le lecteur au-dessus ») :
// un cadre libre (js/free-frame.js : `video`, `data-ff-video`) qui porte l'identifiant d'une vidéo YouTube ou Vimeo, jamais une adresse ni un lecteur. Le modèle n'écrit donc ni `<iframe>`, ni `<video>` (le
// filtre du HTML, js/html-sanitize.js, les retire toujours) : seulement le cadre, son titre en texte, et `data-ff-link`, l'adresse de la vidéo sur son site, qui est ce que le PDF, le Word, le HTML, l'e-mail
// et le PowerPoint montrent (un cadre et son titre, cliquable), comme une vue de diapositive (js/slide-view.js).
//  - LE RÉGLAGE : `youtube:<11 signes>` ou `vimeo:<chiffres>[/<clé>]`, avec `@<secondes>` quand la vidéo démarre plus loin (`youtube:dQw4w9WgXcQ@90`). `valueOf` ne rend que cette forme, relue à CHAQUE usage ;
//    `parseLink` en fait une d'une adresse collée (youtu.be, youtube.com/watch, /embed, /shorts, /live, youtube-nocookie.com, vimeo.com, player.vimeo.com, ou le code « intégrer » du site : on n'y lit que
//    son `src`). Tout le reste - un autre site, un `javascript:`, une adresse avec identifiants, une liste de lecture - n'est pas une vidéo : rien ne se pose.
//  - LE CALQUE (`.pp-ff-video`) : une vignette posée sur le cadre dans l'éditeur, la Lecture, l'impression et le diaporama (`fill`, appelée avec les vues de diapositive) : un disque ▶ et le nom du site. Rien ne
//    se charge chez le fournisseur avant le clic : ni image, ni lecteur, ni cookie. La vignette n'est jamais enregistrée.
//  - DANS UN DOCUMENT (demande du 07/11 : « les vidéos doivent aussi être dispo dans les documents », « comme une image on peut la bouger dans et sur le texte ») : la vidéo est une IMAGE du document
//    (js/editor-nodes.js : `video`, `data-video`, la même valeur que ci-dessus, jamais de `src` dans le modèle). Elle se déplace, s'habille, se redimensionne, passe devant ou derrière le texte comme toute image ;
//    l'éditeur, la Lecture et l'impression lui donnent une vignette (`poster` : un rectangle gris, ▶ et le nom du site, une image dessinée ici, rien chargé chez le fournisseur) et le même lecteur de GFS.
//    Le PDF, le Word, le HTML et le Markdown la reçoivent de `forExport` (js/reader-mode.js:preview) : un rectangle gris 16/9 qui porte le titre, cliquable (carte du 07/11, « un rectangle gris avec le titre »).
//  - LA LECTURE : le cadre de l'app est isolé par GFS (pas d'`allow-same-origin`, consigne 011) et un lecteur posé DEDANS n'a pas d'identité : YouTube y échoue (étude du 06/11, `video-slides-2026-11-06`). C'est
//    donc GFS qui pose le lecteur, par-dessus le cadre de l'app, à la place du calque : l'app lui dit QUOI (`fournisseur`, `video` : l'identifiant) et OÙ (le rectangle du calque et la zone où il se voit), et le
//    suit (js/gfs-link.js : `lecteur.afficher`, `deplacer`, `masquer`, `fermer`). Elle ne lui donne jamais une adresse. Le lecteur s'efface quand quelque chose passe par-dessus (un menu, une fenêtre), se ferme
//    quand le calque disparaît ou reste hors de vue, au clic ailleurs et à Échap. Sans GFS ou si GFS ne sait pas jouer ce site (`GfsLink.players`), un clic ouvre la vidéo sur son site, dans un nouvel onglet.
const VideoFrame = (function () {
  const el = Dom.el;
  const ATTR = 'data-ff-video';
  const HOST = 'pp-ff-video';
  const PLAY = 'pp-ff-video-play';
  const FRAME = '.pp-free-frame';
  const IMAGE = 'img[data-video]';              // la vidéo d'un document : une image du modèle
  const IMAGE_ATTR = 'data-video';
  const DOC_WIDTH_PX = 480;     // la largeur d'une vidéo qu'on vient de poser dans un document (une image se pose à 320, un QR code à 120)
  const MAX_START = 359999;     // 99 h 59 min 59 s
  const MIN_SIDE = 8;           // en dessous, le calque n'est pas un lecteur possible
  const OUT_MS = 2000;          // hors de vue (une autre diapositive, un autre bout de la page) plus longtemps : la lecture s'arrête
  const COVER_MS = 8000;        // recouvert (un menu, une fenêtre) plus longtemps : idem
  const SAMPLES = [[0.5, 0.5], [0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]];   // où l'on regarde si quelque chose recouvre le calque
  const PROVIDERS = {
    youtube: { name: 'YouTube', id: /^[A-Za-z0-9_-]{11}$/ },
    vimeo: { name: 'Vimeo', id: /^\d{1,12}(?:\/[0-9a-f]{6,20})?$/ },
  };
  const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
  const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
  const VALUE = /^(youtube|vimeo):([A-Za-z0-9_/-]{1,40})(?:@(\d{1,6}))?$/;
  const NUMBER = /^\d{1,12}$/;
  const HASH = /^[0-9a-f]{6,20}$/i;

  // ---- Le réglage ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // `youtube:dQw4w9WgXcQ@90` -> { provider, id, start } ; null quand ce n'est pas exactement cette forme.
  function decode(raw) {
    const found = typeof raw === 'string' ? VALUE.exec(raw.trim()) : null;
    if (!found || !PROVIDERS[found[1]].id.test(found[2])) return null;
    return { provider: found[1], id: found[2], start: found[3] ? Math.min(Number(found[3]), MAX_START) : 0 };
  }
  const encode = video => video.provider + ':' + video.id + (video.start > 0 ? '@' + video.start : '');
  // Le réglage `raw` tel que l'éditeur sait le lire, ou '' : aucune vidéo.
  const valueOf = (raw) => { const video = decode(raw); return video ? encode(video) : ''; };
  const nameOf = provider => (PROVIDERS[provider] ? PROVIDERS[provider].name : '');

  // L'adresse de la vidéo sur son site, montée d'après l'identifiant (jamais d'après ce qu'on a collé) : ce que l'objet a pour lien et ce qui s'ouvre quand le lecteur ne peut pas jouer.
  function watchUrl(raw) {
    const video = decode(raw);
    if (!video) return '';
    if (video.provider === 'youtube') return 'https://www.youtube.com/watch?v=' + video.id + (video.start ? '&t=' + video.start + 's' : '');
    return 'https://vimeo.com/' + video.id + (video.start ? '#t=' + video.start + 's' : '');
  }

  // ---- Lire une adresse collée --------------------------------------------------------------------------------------------------------------------------------------------------------
  // « 90 », « 90s », « 1m30s », « 1h2m3s » -> des secondes (0 quand ce n'est pas un temps).
  function seconds(raw) {
    const text = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!text) return 0;
    if (/^\d{1,6}s?$/.test(text)) return Math.min(parseInt(text, 10), MAX_START);
    const found = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(text);
    return found ? Math.min((+found[1] || 0) * 3600 + (+found[2] || 0) * 60 + (+found[3] || 0), MAX_START) : 0;
  }
  // L'adresse seule de ce qu'on a collé : le lien, ou le `src` du code « intégrer » d'un site ; null quand il y a autre chose qu'une adresse (un espace, un guillemet, une balise).
  function addressOf(raw) {
    const text = String(raw == null ? '' : raw).trim().slice(0, 4000);
    const embedded = /<iframe\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i.exec(text);
    let address = (embedded ? embedded[2] : text).replace(/&amp;/gi, '&').trim();
    if (!address || /[\s<>"']/.test(address)) return null;
    if (address.indexOf('//') === 0) address = 'https:' + address;
    if (/^[a-z][a-z0-9+.-]*:/i.test(address)) return address;
    return /^[\w-]+(?:\.[\w-]+)+[/?#]/.test(address) ? 'https://' + address : null;
  }
  // La vidéo qu'une adresse collée désigne : { provider, id, start } ou null (un autre site, un autre schéma, des identifiants dans l'adresse, un port, un identifiant mal formé).
  function parseLink(raw) {
    const address = addressOf(raw);
    if (!address) return null;
    let url;
    try { url = new URL(address); } catch (e) { return null; }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const query = url.searchParams;
    let found = null;
    if (YOUTUBE_HOSTS.has(host)) {
      let id = '';
      if (host === 'youtu.be') id = parts[0] || '';
      else if (parts[0] === 'watch') id = query.get('v') || '';
      else if (['embed', 'shorts', 'live', 'v'].indexOf(parts[0]) !== -1) id = parts[1] || '';
      found = { provider: 'youtube', id, start: seconds(query.get('t') || query.get('start') || fragment.get('t')) };
    } else if (VIMEO_HOSTS.has(host)) {
      let at = -1;
      if (host === 'player.vimeo.com') at = parts[0] === 'video' && NUMBER.test(parts[1] || '') ? 1 : -1;
      else if (parts[0] === 'showcase' || parts[0] === 'album') at = parts.indexOf('video') >= 0 && NUMBER.test(parts[parts.indexOf('video') + 1] || '') ? parts.indexOf('video') + 1 : -1;
      else at = parts.findIndex(part => NUMBER.test(part));
      if (at >= 0) {
        const key = host === 'player.vimeo.com' ? query.get('h') : parts[at + 1];
        found = { provider: 'vimeo', id: parts[at] + (key && HASH.test(key) ? '/' + key.toLowerCase() : ''), start: seconds(fragment.get('t') || query.get('t')) };
      }
    }
    return found && PROVIDERS[found.provider].id.test(found.id) ? found : null;
  }

  // ---- Le calque -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // La vignette de la vidéo `raw` : un disque ▶ et le nom du site. Inerte tant qu'on ne clique pas ; le bouton est celui de l'éditeur (js/free-frame.js lui branche le clic), la Lecture et le diaporama
  // passent par le clic de l'objet (js/reader-mode.js, extensions/diapositives/slide-player.js : `play`).
  function host(raw) {
    const video = decode(raw);
    const node = el('div', HOST);
    if (!video) return node;
    node.dataset.provider = video.provider;
    const button = Dom.button(PLAY);
    button.setAttribute('aria-label', I18n.t('video.play', { provider: nameOf(video.provider) }));
    Dom.setMarkup(button, Icons.svg('videoPlay'));
    const svg = button.querySelector('svg');
    if (svg) svg.setAttribute('aria-hidden', 'true');
    node.append(button, el('span', HOST + '-name', nameOf(video.provider)));
    return node;
  }
  // ---- La vignette d'une vidéo de document ------------------------------------------------------------------------------------------------------------------------------------------
  // Un rectangle gris 16/9, un disque ▶ et le nom du site : une image SVG dessinée ici, jamais enregistrée dans le modèle, qui ne demande rien au fournisseur. Les mêmes couleurs que la vignette d'un cadre
  // (css/free-frame.css) : la feuille est blanche quel que soit le thème de l'écran.
  const posters = new Map();
  function poster(raw) {
    const video = decode(raw);
    if (!video) return '';
    const key = video.provider;
    if (!posters.has(key)) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">'
        + '<rect width="640" height="360" fill="#f1f3f6"/><rect x="0.75" y="0.75" width="638.5" height="358.5" fill="none" stroke="#bfbfbf" stroke-width="1.5"/>'
        + '<circle cx="320" cy="170" r="46" fill="#1f2328" fill-opacity="0.85"/><path d="M306 146v48l40-24z" fill="#ffffff"/>'
        + '<text x="320" y="268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#4a4f57">' + nameOf(video.provider) + '</text></svg>';
      posters.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    }
    return posters.get(key);
  }
  // La vidéo d'une image de `root` (l'<img> elle-même ou son habillage dans l'éditeur) : { img, value } ou null.
  function imageOf(root) {
    const img = root && root.matches && root.matches(IMAGE) ? root : (root && root.querySelector ? root.querySelector(IMAGE) : null);
    const value = img ? valueOf(img.getAttribute(IMAGE_ATTR)) : '';
    return value ? { img, value } : null;
  }

  // Pose le calque de chaque cadre vidéo de `wrapper` (le texte résolu de la Lecture, de l'impression et du diaporama) qui n'en a pas, et la vignette de chaque vidéo de document ; rend le nombre posé.
  function fill(wrapper) {
    let placed = 0;
    wrapper.querySelectorAll(IMAGE).forEach((img) => {
      const value = valueOf(img.getAttribute(IMAGE_ATTR));
      if (!value || img.hasAttribute('data-pp-video-ready')) return;
      const video = decode(value);
      img.setAttribute('src', poster(value));
      img.setAttribute('data-pp-video-ready', '');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('aria-label', I18n.t('video.play', { provider: nameOf(video.provider) }));
      placed += 1;
    });
    wrapper.querySelectorAll(FRAME + '[' + ATTR + ']').forEach((frame) => {
      const value = valueOf(frame.getAttribute(ATTR));
      const box = frame.querySelector(':scope > .pp-free-frame-box');
      if (!value || !box || box.querySelector(':scope > .' + HOST)) return;
      box.insertBefore(host(value), box.firstChild);
      placed += 1;
    });
    return placed;
  }

  // ---- Les exports ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Le PDF, le Word, le HTML et le Markdown partent du texte résolu de `ReaderMode.preview` : chaque vidéo de document y devient ce qui s'y exporte déjà partout, un tableau d'une case - un rectangle gris
  // 16/9 de la largeur de la vidéo, le titre de la vidéo (son texte alternatif, sinon « Vidéo YouTube ») centré et cliquable vers la vidéo sur son site - et non une image : un lien de texte survit à
  // tous les formats, pas celui d'une image. Rien n'est appelé chez le fournisseur (carte du 07/11, « un rectangle gris avec le titre »). Le paragraphe qui portait la vidéo est coupé autour du tableau.
  const FILL = '#f1f3f6';
  const TEXT_BLOCK = /^(P|H[1-6])$/;
  const hasContent = node => node.textContent.trim() !== '' || !!node.querySelector(':scope > :not(br)');
  function exportBox(video, width, title) {
    const height = Math.round(width * 9 / 16);
    const table = el('table');
    table.setAttribute('style', 'width: ' + width + 'px;');
    table.setAttribute('data-pp-video', video.provider);
    const col = el('col');
    col.setAttribute('style', 'width: ' + width + 'px; min-width: 25px;');
    table.append(el('colgroup'), el('tbody'));
    table.firstChild.append(col);
    const row = el('tr');
    row.setAttribute('data-row-height', String(height));
    const cell = el('td');
    cell.setAttribute('colspan', '1');
    cell.setAttribute('rowspan', '1');
    cell.setAttribute('colwidth', String(width));
    cell.setAttribute('data-valign', 'middle');
    cell.setAttribute('style', 'background-color: ' + FILL + '; vertical-align: middle;');
    const line = el('p');
    line.setAttribute('style', 'text-align: center;');
    const link = el('a', '', title);
    link.setAttribute('href', watchUrl(encode(video)));
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('target', '_blank');
    line.append(link);
    cell.append(line);
    row.append(cell);
    table.lastChild.append(row);
    return table;
  }
  // Le tableau à la place de l'image : le paragraphe ou le titre qui la porte est coupé autour (un tableau n'entre pas dans un paragraphe) ; une image dans un lien ou un style en ligne passe après son bloc.
  function placeBlock(img, table) {
    const block = img.closest('p, h1, h2, h3, h4, h5, h6');
    if (!block) { img.replaceWith(table); return; }
    if (img.parentNode === block && TEXT_BLOCK.test(block.nodeName)) {
      const after = block.cloneNode(false);
      while (img.nextSibling) after.appendChild(img.nextSibling);
      img.remove();
      block.after(table);
      table.after(after);
      if (!hasContent(block)) block.remove();
      if (!hasContent(after)) after.remove();
      return;
    }
    img.remove();
    block.after(table);
  }
  // Remplace chaque vidéo de document de `wrapper` ; rend le nombre remplacé. Une vidéo dont le réglage n'est pas lisible n'a rien à montrer : elle est retirée, comme une image sans adresse.
  function forExport(wrapper) {
    let replaced = 0;
    Array.from(wrapper.querySelectorAll(IMAGE)).forEach((img) => {
      const video = decode(img.getAttribute(IMAGE_ATTR));
      if (!video) { img.remove(); return; }
      const width = Math.max(60, Math.round(parseFloat(img.style.width) || DOC_WIDTH_PX));
      const title = (img.getAttribute('alt') || '').trim() || I18n.t('video.title', { provider: nameOf(video.provider) });
      placeBlock(img, exportBox(video, width, title));
      replaced += 1;
    });
    return replaced;
  }

  // ---- Poser une vidéo : « Vidéo… » du menu « Lien et blocs de contenu » -------------------------------------------------------------------------------------------------------------------------------
  // La fenêtre où l'on colle l'adresse (ou le code « Intégrer »), puis le cadre posé sur la diapositive du curseur. Une adresse qui n'est pas une vidéo YouTube ou Vimeo est dite, et la fenêtre revient avec ce
  // qu'on avait collé ; Annuler et Échap ne posent rien. Rend (une promesse de) vrai quand le cadre est posé.
  async function openDialog(ed, value) {
    if (!ed || !ed.isEditable) return false;
    const text = await Dialogs.prompt({
      title: I18n.t('video.dialog.title'), label: I18n.t('video.dialog.label'), message: I18n.t('video.dialog.message'),
      placeholder: I18n.t('video.dialog.placeholder'), confirmLabel: I18n.t('video.dialog.confirm'), value: value || '',
    });
    if (text === null) return false;
    const found = parseLink(text);
    if (!found) {
      await Dialogs.notice({ title: I18n.t('video.dialog.title'), message: I18n.t('video.dialog.invalid') });
      return openDialog(ed, text);
    }
    const title = I18n.t('video.title', { provider: nameOf(found.provider) });
    // Dans une présentation, un cadre libre sur la diapositive du curseur ; dans un document, une image au curseur.
    if (SlidesEntry.presentationShown()) {
      const placed = FreeFrame.insertVideo(ed, FreeFrame.slideStartOf(ed.state.doc, ed.state.selection.from), { video: encode(found), title, alt: title });
      if (placed) setTimeout(FreeFrame.syncToolbar, 0);
      return placed;
    }
    return insertImage(ed, encode(found), title);
  }
  // La vidéo `value` posée comme une image du document, à la suite du curseur (jamais à la place de ce qui est sélectionné : texte ou image) ; elle se déplace, s'habille et se redimensionne comme toute image.
  function insertImage(ed, value, title) {
    if (!ed || !ed.isEditable || !valueOf(value)) return false;
    const chain = ed.chain().focus();
    if (!ed.state.selection.empty) chain.setTextSelection(ed.state.selection.to);
    return chain.insertImage({ video: valueOf(value), alt: title || '', width: DOC_WIDTH_PX + 'px', wrap: 'block', align: 'center' }).run();
  }

  // ---- Jouer ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const round = number => Math.round(number * 10) / 10;
  const hosted = () => typeof GfsLink !== 'undefined' && GfsLink.hosted;
  const canPlay = provider => hosted() && GfsLink.players().indexOf(provider) !== -1;

  const parentOf = node => node.parentElement || (node.getRootNode && node.getRootNode().host) || null;
  // La zone où le calque peut se voir : la fenêtre du cadre de l'app, rognée par chaque ancêtre qui coupe ce qui déborde (la zone qui défile, la feuille, la boîte du cadre).
  function zoneOf(node) {
    const zone = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let at = parentOf(node); at && at !== document.documentElement; at = parentOf(at)) {
      const style = getComputedStyle(at);
      if (!/(auto|scroll|hidden|clip)/.test(style.overflowX + ' ' + style.overflowY)) continue;
      const box = at.getBoundingClientRect();
      zone.left = Math.max(zone.left, box.left);
      zone.top = Math.max(zone.top, box.top);
      zone.right = Math.min(zone.right, box.right);
      zone.bottom = Math.min(zone.bottom, box.bottom);
    }
    return zone;
  }
  // Où est le calque : { rect, zone } en pixels du cadre de l'app (le zoom de la feuille déjà appliqué, c'est ce que mesure le navigateur), `visible` (une part du calque est dans la zone) et `seen`, cette part ;
  // null quand le calque n'a plus de taille (retiré, caché).
  function measure(node) {
    const box = node.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) return null;
    const zone = zoneOf(node);
    const seen = { left: Math.max(box.left, zone.left), top: Math.max(box.top, zone.top), right: Math.min(box.right, zone.right), bottom: Math.min(box.bottom, zone.bottom) };
    const area = (rect) => ({ x: round(rect.left), y: round(rect.top), largeur: round(rect.right - rect.left), hauteur: round(rect.bottom - rect.top) });
    return { rect: area(box), zone: area(zone), visible: seen.right - seen.left >= 4 && seen.bottom - seen.top >= 4, seen };
  }
  // Ce qui est au point (x, y), en descendant dans les arbres ombre ouverts (le diaporama).
  function deepHit(x, y) {
    let top = document.elementFromPoint(x, y);
    for (let guard = 0; top && top.shadowRoot && guard < 8; guard += 1) {
      const inner = top.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === top) break;
      top = inner;
    }
    return top;
  }
  // Quelque chose d'autre que le cadre recouvre-t-il la part visible du calque ? Un lecteur posé par GFS passerait par-dessus.
  function covered(frame, seen) {
    const width = seen.right - seen.left;
    const height = seen.bottom - seen.top;
    return SAMPLES.some(([fx, fy]) => {
      const top = deepHit(seen.left + width * fx, seen.top + height * fy);
      return !!top && !frame.contains(top);
    });
  }

  let current = null;   // { id, node, frame, sent, hidden, outSince, coverSince, raf, watch } : la lecture en cours (une seule à la fois)
  let counter = 0;

  // Arrête la lecture en cours ; avec `frame`, seulement si c'est la sienne. Faux quand rien ne jouait.
  function stop(frame) {
    if (!current || (frame && current.frame !== frame)) return false;
    const found = current;
    current = null;
    cancelAnimationFrame(found.raf);
    document.removeEventListener('mousedown', onAway, true);
    document.removeEventListener('keydown', onKey, true);
    GfsLink.player('fermer', { id: found.id });
    return true;
  }
  // Un clic ailleurs dans l'app, ou Échap : le lecteur se ferme (le clic dans le lecteur lui-même ne passe jamais par ici : il est dans la page de GFS). Échap ne vaut que tant que le clavier est
  // dans l'app : une fois la personne cliquée dans la vidéo, la touche va au cadre du fournisseur et à lui seul (mesuré par GFS, consigne 059) ; aucun texte de l'interface ne promet « Échap ferme ».
  function onAway() { stop(); }
  function onKey(event) { if (event.key === 'Escape') stop(); }

  function tick(found) {
    const now = performance.now();
    // Le calque retiré de la page (une autre diapositive, la Lecture quittée, le cadre supprimé) ne revient pas : la lecture s'arrête tout de suite, le son avec elle.
    if (!found.node.isConnected) { stop(); return; }
    const where = measure(found.node);
    if (!where) {
      if (found.outSince === null) found.outSince = now;
      if (now - found.outSince > OUT_MS) stop(); else if (!found.hidden) { found.hidden = true; GfsLink.player('masquer', { id: found.id, masque: true }); }
      return;
    }
    const out = !where.visible;
    const over = !out && covered(found.frame, where.seen);
    found.outSince = out ? (found.outSince === null ? now : found.outSince) : null;
    found.coverSince = over ? (found.coverSince === null ? now : found.coverSince) : null;
    if ((found.outSince !== null && now - found.outSince > OUT_MS) || (found.coverSince !== null && now - found.coverSince > COVER_MS)) { stop(); return; }
    const hide = out || over;
    if (hide !== found.hidden) { found.hidden = hide; GfsLink.player('masquer', { id: found.id, masque: hide }); }
    const key = JSON.stringify([where.rect, where.zone]);
    if (key !== found.sent) { found.sent = key; GfsLink.player('deplacer', { id: found.id, rect: where.rect, zone: where.zone }); }
  }
  function follow(found) {
    found.raf = requestAnimationFrame(() => {
      if (current !== found) return;
      tick(found);
      if (current === found) follow(found);
    });
  }

  // Ce que `target` désigne : un cadre libre (`.pp-free-frame` : celui de l'éditeur, de la Lecture ou du diaporama) ou une vidéo de document (l'<img data-video>, ou son habillage dans l'éditeur).
  // { node (ce qu'on mesure et suit), frame (ce qui est « la vidéo » quand on cherche ce qui la recouvre), video, address (son lien) } ; null quand ce n'est ni l'un ni l'autre.
  function targetOf(target) {
    if (!target || !target.matches) return null;
    if (target.matches(FRAME)) {
      const node = target.querySelector(':scope > .pp-free-frame-box > .' + HOST);
      const video = decode(target.getAttribute(ATTR));
      return node && video ? { node, frame: target, video, rotated: !!target.getAttribute('data-ff-rot') } : null;
    }
    const found = imageOf(target);
    const video = found ? decode(found.value) : null;
    return video ? { node: found.img, frame: target.matches('img') ? target : (target.closest('.editor-image-view') || target), video } : null;
  }
  // Joue la vidéo de `target` (un cadre libre ou une vidéo de document) à sa place, par le lecteur de GFS. Faux - et rien n'a changé - quand GFS ne sait pas jouer ce site, que la cible n'a pas de vidéo ou de
  // calque, qu'elle est pivotée (le lecteur de GFS ne tourne pas) ou qu'elle n'a pas de taille.
  function play(target) {
    const found = targetOf(target);
    if (!found || found.rotated || !canPlay(found.video.provider)) return false;
    const { node, frame, video } = found;
    const where = measure(node);
    if (!where) return false;
    stop();
    counter += 1;
    const running = { id: 'v' + counter, node, frame, video, sent: JSON.stringify([where.rect, where.zone]), hidden: false, outSince: null, coverSince: null, raf: 0 };
    current = running;
    GfsLink.player('afficher', Object.assign({ id: running.id, fournisseur: video.provider, video: video.id }, video.start ? { debut: video.start } : {}, { rect: where.rect, zone: where.zone }));
    document.addEventListener('mousedown', onAway, true);
    document.addEventListener('keydown', onKey, true);
    follow(running);
    return true;
  }
  // Un clic sur la vidéo : le lecteur de GFS s'il sait la jouer, sinon la vidéo sur son site, dans un nouvel onglet.
  function activate(target) {
    if (play(target)) return true;
    const found = targetOf(target);
    return found ? FrameLink.openUrl(watchUrl(encode(found.video))) : false;
  }
  // GFS dit où en est son lecteur (`lecteur { id, etat }`) : à la fin il se ferme ; s'il n'a pas pu démarrer (la vidéo refuse d'être intégrée, un site injoignable), la personne qui a cliqué voit la vidéo sur son site.
  function onPlayerState(event) {
    if (!current || !event || event.id !== current.id || (event.etat !== 'fin' && event.etat !== 'erreur')) return;   // `lecture` et `pause` : le lecteur reste là
    const found = current;
    stop();
    if (event.etat === 'erreur') FrameLink.openUrl(watchUrl(encode(found.video)));
  }
  if (typeof GfsLink !== 'undefined' && GfsLink.hosted) GfsLink.onPlayerEvent(onPlayerState);

  const playing = () => (current ? { id: current.id, provider: current.video.provider, video: current.video.id } : null);

  return { ATTR, IMAGE_ATTR, HOST, PLAY, PROVIDERS, decode, encode, valueOf, nameOf, watchUrl, parseLink, host, poster, imageOf, fill, forExport, openDialog, insertImage, canPlay, play, activate, stop, playing };
})();
