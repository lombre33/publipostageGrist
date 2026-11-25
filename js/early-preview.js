// L'aperçu de lecture du document que GFS désigne (23/11 : « qqch de plus instantané » à l'ouverture depuis GFS ; l'attente venait pour 4,6 s sur 7,3 de la lecture de la table des modèles ENTIÈRE, 42 Mo chez la
// personne, dont 94 % de présentations que ce document n'ouvre même pas). Tant que cette lecture dure, la page montre la feuille du document ouvert, en lecture seule : sa ligne seule est lue par l'interface REST
// de Grist (une demande, le jeton en lecture seule de GristAPI.prefetchAccessToken), le texte passe par HtmlSanitize comme tout HTML qui ne vient pas de l'éditeur, et la feuille se pose par-dessus le plan de travail.
// Quand le widget a ouvert le document pour de bon (js/main.js:loadTemplateIntoEditor), l'aperçu s'efface : rien d'autre n'a été touché, ni l'éditeur, ni le document, ni l'enregistrement.
//
// Ce que cet aperçu ne fait JAMAIS : écrire quoi que ce soit, ouvrir le moindre lien (la feuille est `inert`), charger une image qui ne porte pas ses octets (withoutLinkedImages), toucher à l'éditeur (il n'a ni texte ni événement de ce côté), lire une présentation, un e-mail, une grille ou un
// macro-modèle (le filtre de la demande ne rend que les lignes de type document : une autre ligne n'est même pas envoyée). Au moindre doute (pas de fichier désigné, GFS qui demande un import, une lecture de PDF ou un modèle du
// catalogue, ligne illisible ou refusée, jeton refusé, texte vide, document suivi par « suivi des modifications », format de page libre, table des modèles déjà arrivée), rien ne se pose : le démarrage est celui d'avant.
//
// Temporaire dans sa mesure : le rapport de fluidité (js/perf-trace.js) en note chaque étape (`aperçu : …`).
const EarlyPreview = (function () {
  const TYPES = ['document', ''];              // un modèle sans type est un document (js/templates.js:templateFromRow)
  // Les types de fichier que GFS peut désigner et que cette ligne seule suffit à ouvrir (consigne 103 de GFS, demande 1 : « que ces types s'ouvrent aussi depuis leur ligne ») : l'aperçu ne se pose que pour un document,
  // mais la ligne d'une présentation, d'une grille ou d'un e-mail se lit de la même façon et js/early-open.js l'ouvre depuis elle. Un macro-modèle (ses emplacements désignent d'autres documents) et un type que cette
  // version ne connaît pas gardent la lecture de la liste.
  const ROW_TYPES = ['document', 'presentation', 'grille', 'email'];
  const READ_TIMEOUT_MS = 8000;
  // Une présentation pèse des Mo (jusqu'à des dizaines : 38 millions de signes dans une ligne) : sa ligne se lit plus longtemps qu'un document. Au-delà, la liste se lit comme avant et le modèle se lit ensuite, ligne à ligne
  // (js/templates.js, lecture légère).
  const LONG_READ_TIMEOUT_MS = 30000;
  const HOST_ID = 'pp-early-preview';
  // Les pages que le widget sait dessiner à la taille d'un format de la liste de js/page-layout.js (portrait, en millimètres) ; un format libre (« 210x297 ») n'a pas d'aperçu.
  const FORMATS_MM = { A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148] };
  const PX_PER_MM = 96 / 25.4;
  const SHEET_MARGIN_PX = 14;                  // le rembourrage du plan de travail (#editor-container)
  // 'idle' : pas commencé ; 'reading' : la ligne se lit ; 'shown' : la feuille est posée ; 'done' : fini (rien ne se posera plus).
  let state = 'idle';
  let host = null;
  let beganAt = 0;
  // La ligne que cette lecture rapporte, pour js/early-open.js (qui ouvre le document depuis elle, sans attendre la table entière) : { record, tpl, settings } - `settings` : la promesse des lignes de réglages du document,
  // lues en même temps (jamais rejetée : null quand elle échoue) -, ou null quand rien n'est sûr (pas de fichier désigné, jeton ou ligne refusés, ce n'est pas un document, la table entière est arrivée la première).
  let settleRow = () => {};
  const rowRead = new Promise((resolve) => { settleRow = resolve; });

  const trace = (label, extra) => { if (typeof PerfTrace !== 'undefined') { try { PerfTrace.mark(label, extra); } catch (e) { /* le rapport ne doit rien casser */ } } };
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // L'identifiant du document que GFS désigne à l'ouverture, ou null : même règle que js/gfs-open.js:designated, sans le cache des modèles (il n'est pas là) - un fichier donné, et ni un import, ni une lecture de PDF, ni un
  // modèle du catalogue. Un identifiant qui n'est pas un numéro de ligne n'en est pas un.
  function designatedId(opening) {
    if (!opening || !opening.fichier || opening.raison === 'importer' || opening.raison === 'lire' || opening.raison === 'modele') return null;
    const id = Number(opening.fichier.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  // Le type de fichier que GFS dit désigner : '' quand il ne le dit pas (un GFS d'avant, ou un fichier sans type : un document).
  function kindOf(opening) {
    return opening && opening.fichier && typeof opening.fichier.type === 'string' ? opening.fichier.type : '';
  }
  // Vrai quand cette ligne seule suffit à ouvrir un fichier de ce type (`kind` : celui que dit GFS, '' pour un document sans type) ; `row()` et `typesOf` ne lisent que ces types.
  const covers = kind => !kind || ROW_TYPES.indexOf(kind) !== -1;
  // Les types de la ligne que la lecture demande : ceux d'un document quand GFS ne dit rien ou dit « document » (une ligne sans type en est un), le type dit par GFS sinon. Le filtre fait que la ligne d'un AUTRE type n'est
  // même pas envoyée : lire une présentation de 3 Mo pour ouvrir un document n'aurait aucun sens.
  const typesOf = kind => (!kind || kind === 'document' ? TYPES : [kind]);

  // La page (largeur en pixels, marges en pixels) que dit la ligne, ou null : un format libre, une page « selon chaque modèle » ou un sens qu'on ne connaît pas ne se dessinent pas ici.
  function pageOf(margins) {
    const m = margins && typeof margins === 'object' ? margins : {};
    const format = m.format ? String(m.format).trim().toUpperCase() : 'A4';
    const size = FORMATS_MM[format];
    if (!size || m.orientationAuto === true) return null;
    const landscape = String(m.orientation || '').toLowerCase() === 'landscape';
    if (m.orientation && !landscape && String(m.orientation).toLowerCase() !== 'portrait') return null;
    const widthMm = landscape ? size[1] : size[0];
    const side = (name) => {
      const value = Number(m[name]);
      return Number.isFinite(value) && value >= 0 && value < widthMm / 2 ? value * PX_PER_MM : 28 * 96 / 72;
    };
    return { width: widthMm * PX_PER_MM, top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') };
  }

  function removeHost() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  // Une image 1×1 transparente : l'image garde la place que dit son style (largeur, hauteur), sans rien charger.
  const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Demande du 24/11 (« plus aucun appel vers un autre site ») : l'aperçu ne charge que les images qui portent leurs octets (`data:image/`). Une adresse web, ou l'adresse d'une pièce jointe que le document
  // garde avec son jeton périmé, n'est jamais donnée au navigateur ; l'éditeur, qui ouvre le document pour de bon, montre ensuite l'image (le cadre pour un autre site, la pièce jointe à neuf). Lu dans un
  // <template>, inerte : rien ne charge pendant la lecture ni quand le texte rentre dans le nœud de la page. Ce fichier part avant js/external-images.js et js/i18n.js : il se suffit.
  function withoutLinkedImages(html) {
    if (!/<img\b/i.test(html)) return html;
    const holder = Dom.inertTemplate(html);
    let changed = false;
    holder.content.querySelectorAll('img').forEach((img) => {
      if (/^data:image\//i.test((img.getAttribute('src') || '').trim())) return;
      img.setAttribute('src', BLANK_PIXEL);
      changed = true;
    });
    return changed ? holder.innerHTML : html;
  }

  // Pose la feuille. Rien ne s'y fait que du texte nettoyé et des mesures : aucun script, aucun lien actif.
  function show(tpl) {
    const container = document.getElementById('editor-container');
    const page = pageOf(tpl.marginsMm);
    if (!container || !page || !tpl.contenu) return false;
    const hasChanges = tpl.suiviModifications && Object.keys(tpl.suiviModifications).length > 0;
    if (hasChanges) return false;
    const html = withoutLinkedImages(HtmlSanitize.clean(tpl.contenu));
    if (!html) return false;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'pp-early-preview';
    host.setAttribute('aria-hidden', 'true');
    const sheet = document.createElement('div');
    sheet.className = 'pp-early-sheet';
    sheet.setAttribute('inert', '');
    sheet.style.setProperty('--pp-early-width', page.width.toFixed(2) + 'px');
    sheet.style.setProperty('--pp-early-top', page.top.toFixed(2) + 'px');
    sheet.style.setProperty('--pp-early-right', page.right.toFixed(2) + 'px');
    sheet.style.setProperty('--pp-early-bottom', page.bottom.toFixed(2) + 'px');
    sheet.style.setProperty('--pp-early-left', page.left.toFixed(2) + 'px');
    Dom.setMarkup(sheet, html);
    host.appendChild(sheet);
    container.appendChild(host);
    // Comme l'éditeur (js/page-zoom.js, l'ajustement à la largeur) : une feuille plus large que la place se réduit au lieu de déborder.
    const room = host.clientWidth - 2 * SHEET_MARGIN_PX;
    if (room > 0 && page.width > room) sheet.style.zoom = String(Math.max(0.2, room / page.width));
    return true;
  }

  async function run() {
    await GfsLink.ready;
    const opening = GfsLink.opening();
    const id = designatedId(opening);
    if (id === null) return end('pas de document désigné');
    const kind = kindOf(opening);
    if (!covers(kind)) return end('type de fichier non couvert : ' + kind);
    // Le jeton est parti avant la lecture de la table des modèles ; il n'y a rien d'autre à attendre que lui (il se met en cache : lightRecords le retrouve).
    const token = await tokenReady;
    if (state !== 'reading') return undefined;
    if (!token) return end('jeton refusé');
    trace('aperçu : jeton reçu', { ms: Math.round(now() - beganAt) });
    let read;
    // Les réglages du document partent avec la ligne (la même attente) : ils sont dans la même table, une ligne à part.
    const settings = GristAPI.lightRecords(Templates.TABLE_NAME, null, READ_TIMEOUT_MS, { TemplateType: [Templates.SETTINGS_TYPE] }).then(result => result.records, () => null);
    try {
      read = await GristAPI.lightRecords(Templates.TABLE_NAME, [id], kind && kind !== 'document' ? LONG_READ_TIMEOUT_MS : READ_TIMEOUT_MS, { TemplateType: typesOf(kind) });
    } catch (e) {
      return end('ligne illisible (' + ((e && (e.status || e.reason)) || 'erreur') + ')');
    }
    if (state !== 'reading') return undefined;
    if (Templates.hasLoaded()) return end('la table des modèles est déjà arrivée');
    const record = read.records && read.records[0];
    const tpl = record ? Templates.templateFromRecord(record) : null;
    if (!tpl || ROW_TYPES.indexOf(tpl.typeModele) === -1) return end('ce type de fichier n’est pas couvert');
    trace('aperçu : ligne lue', { Ko: Math.round(read.bytes / 1024), ms: Math.round(now() - beganAt), type: tpl.typeModele });
    settleRow({ record, tpl, settings });
    // L'aperçu est la feuille d'un document : une présentation, une grille ou un e-mail s'ouvre depuis sa ligne (js/early-open.js), sans feuille posée par-dessus.
    if (tpl.typeModele !== 'document') return end('pas un document : pas d’aperçu');
    if (!show(tpl)) return end('rien à montrer');
    state = 'shown';
    trace('aperçu : affiché', { ms: Math.round(now() - beganAt) });
    return undefined;
  }

  function end(reason) {
    settleRow(null);
    if (state === 'done') return;
    state = 'done';
    removeHost();
    trace('aperçu : fini', { raison: reason });
  }

  let tokenReady = Promise.resolve(null);
  // À appeler dans index.html, JUSTE AVANT Templates.loadAll() : le jeton doit partir avant la lecture de la table des modèles (l'hôte de Grist traite ses appels dans l'ordre, et celui qui arrive pendant cette lecture
  // l'attend). Ne lève jamais.
  function begin() {
    if (state !== 'idle') return;
    state = 'reading';
    beganAt = now();
    try {
      tokenReady = GristAPI.prefetchAccessToken();
      run().catch((e) => { end('erreur : ' + ((e && e.message) || e)); });
    } catch (e) { end('démarrage impossible'); }
  }

  // Le widget va ouvrir le document pour de bon : une feuille qui n'est pas encore posée ne se posera plus ; celle qui l'est reste jusqu'à `opened`.
  function opening() { if (state === 'reading') end('ouverture réelle commencée'); }
  // Le document est ouvert dans l'éditeur (ou le démarrage est fini, ou échoué) : la feuille s'efface.
  function opened(reason) { end(reason || 'document ouvert'); }

  return { begin, opening, opened, row: () => rowRead, isShown: () => state === 'shown', state: () => state, covers, kindOf, longReadMs: LONG_READ_TIMEOUT_MS };
})();
