// Aides bas niveau pour piloter l'éditeur comme un vrai utilisateur (clics
// réels sur les boutons de la toolbar, frappe clavier, glisser-déposer de
// poignées) et pour intercepter l'export PDF sans jamais déclencher de vrai
// téléchargement navigateur - PdfExport.getNativePdfBlobForRecord ne
// télécharge jamais, mais lire les positions pdfmake nécessite quand même
// d'intercepter window.pdfMake.createPdf.
window.TestHelpers = (function () {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function tiptap() { return document.querySelector('.tiptap'); }

  // --- Étage 2 : mode Lecture (js/reader-mode.js) ---
  // Rend `html` dans #reader-container en appelant directement ReaderMode.render (même contournement
  // que exportPdfContent ci-dessous pour PdfExport : on saute le wrapper main.js:renderReader, qui a
  // besoin d'un vrai `record` Grist introuvable en local, et on passe un `record` factice minimal -
  // suffisant puisqu'on ne teste jamais ici la RÉSOLUTION de #Variable, seulement la FIDÉLITÉ de mise
  // en page HTML/CSS entre l'éditeur et ce second moteur de rendu indépendant). Force les deux
  // conteneurs visibles simultanément (jamais le cas en usage réel, où main.js:switchMode bascule
  // l'un OU l'autre en `display:none`) - sans layout réel des deux côtés, getBoundingClientRect() ne
  // peut rien mesurer sur le conteneur caché.
  async function renderReaderMode(html, headerFooterData) {
    const readerContainer = document.getElementById('reader-container');
    const editorContainer = document.getElementById('editor-container');
    readerContainer.style.display = 'block';
    editorContainer.style.display = 'block';
    const hf = headerFooterData || { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
    await ReaderMode.render(html, null, { id: 1 }, hf);
    return readerContainer.querySelector('.reader-content');
  }

  // Pose/retire la classe a4-preview sur LES DEUX conteneurs à la fois (cf. commentaire
  // renderReaderMode) - main.js:switchMode le fait aussi pour les deux ensemble en usage réel.
  function setA4Preview(on) {
    document.getElementById('editor-container').classList.toggle('a4-preview', !!on);
    document.getElementById('reader-container').classList.toggle('a4-preview', !!on);
  }

  // Cherche, dans un conteneur donné, le premier élément dont le texte contient `text` - même
  // stratégie de repérage "par contenu" que findTextBlocks côté PDF (predicate sur le texte visible),
  // pour comparer un même repère entre éditeur et mode Lecture sans dépendre d'une structure DOM
  // identique entre les deux (ils ne le sont pas : classes, wrappers différents).
  function findByText(container, text, selector) {
    return Array.from(container.querySelectorAll(selector || '*')).find(el => el.children.length === 0 && (el.textContent || '').includes(text));
  }

  // Même principe que compareEditorReaderPosition mais pour une image (pas de texte à chercher) -
  // repérée par son `src` (un data URI de test est déjà unique en pratique) ou, à défaut, la 1ère
  // image trouvée de chaque côté.
  function compareEditorReaderImage(srcContains, tolerancePx) {
    tolerancePx = tolerancePx != null ? tolerancePx : 2;
    const findImg = root => srcContains
      ? Array.from(root.querySelectorAll('img')).find(img => (img.getAttribute('src') || '').includes(srcContains))
      : root.querySelector('img.editor-image, img');
    const editorEl = findImg(tiptap());
    const readerEl = findImg(document.querySelector('.reader-content'));
    if (!editorEl || !readerEl) return { found: false, editorFound: !!editorEl, readerFound: !!readerEl };
    const tiptapRect = tiptap().getBoundingClientRect();
    const readerRect = document.querySelector('.reader-content').getBoundingClientRect();
    const eRect = editorEl.getBoundingClientRect();
    const rRect = readerEl.getBoundingClientRect();
    const editorRel = { left: eRect.left - tiptapRect.left, top: eRect.top - tiptapRect.top, width: eRect.width, height: eRect.height };
    const readerRel = { left: rRect.left - readerRect.left, top: rRect.top - readerRect.top, width: rRect.width, height: rRect.height };
    const deltaLeft = readerRel.left - editorRel.left;
    const deltaTop = readerRel.top - editorRel.top;
    const deltaWidth = readerRel.width - editorRel.width;
    const deltaHeight = readerRel.height - editorRel.height;
    const pass = Math.abs(deltaLeft) <= tolerancePx && Math.abs(deltaTop) <= tolerancePx && Math.abs(deltaWidth) <= tolerancePx && Math.abs(deltaHeight) <= tolerancePx;
    return { found: true, pass, editorRel, readerRel, deltaLeft, deltaTop, deltaWidth, deltaHeight };
  }

  // Compare la position/taille RENDUES d'un même repère (retrouvé par texte) entre l'éditeur et le
  // mode Lecture - la paire de fonctions "vérité terrain" pour l'étage 2, symétrique à
  // extractPdfGroundTruth pour l'étage 3. `tolerancePx` par défaut généreux (2px) : ce sont deux
  // moteurs CSS/DOM distincts avec leurs propres marges d'arrondi, pas une identité bit à bit comme
  // deux mesures du même DOM.
  function compareEditorReaderPosition(text, opts) {
    opts = opts || {};
    const selector = opts.selector || '*';
    const tolerancePx = opts.tolerancePx != null ? opts.tolerancePx : 2;
    const editorEl = findByText(tiptap(), text, selector);
    const readerEl = findByText(document.querySelector('.reader-content'), text, selector);
    if (!editorEl || !readerEl) return { found: false, editorFound: !!editorEl, readerFound: !!readerEl };
    const tiptapRect = tiptap().getBoundingClientRect();
    const readerRect = document.querySelector('.reader-content').getBoundingClientRect();
    const eRect = editorEl.getBoundingClientRect();
    const rRect = readerEl.getBoundingClientRect();
    // Position relative au conteneur de CHAQUE côté (pas au viewport) : les deux conteneurs ne sont
    // pas forcément alignés à l'écran (padding/centrage différents), seule la position RELATIVE à
    // leur propre page compte pour juger la fidélité de mise en page.
    const editorRel = { left: eRect.left - tiptapRect.left, top: eRect.top - tiptapRect.top, width: eRect.width, height: eRect.height };
    const readerRel = { left: rRect.left - readerRect.left, top: rRect.top - readerRect.top, width: rRect.width, height: rRect.height };
    const deltaLeft = readerRel.left - editorRel.left;
    const deltaTop = readerRel.top - editorRel.top;
    const deltaWidth = readerRel.width - editorRel.width;
    const pass = Math.abs(deltaLeft) <= tolerancePx && Math.abs(deltaTop) <= tolerancePx && Math.abs(deltaWidth) <= tolerancePx;
    return { found: true, pass, editorRel, readerRel, deltaLeft, deltaTop, deltaWidth };
  }

  // Repart d'un document vide à chaque scénario - Editor.setHTML() est le
  // VRAI chemin de production (pas une affectation innerHTML directe, cf.
  // mémoire projet sur ce piège précis avec Quill/le MutationObserver -
  // TipTap n'a pas ce piège spécifique mais on garde la même discipline
  // "toujours passer par l'API publique" pour rester fidèle au chemin réel).
  // ASYNC + délai de stabilisation notable (300ms, pas juste 30-40ms comme
  // ailleurs dans ce fichier) - constaté en conditions réelles : un scénario
  // qui sélectionne une image (ouvre sa toolbar flottante) juste AVANT que
  // le scénario SUIVANT ne rappelle resetEditor() peut laisser cette toolbar
  // dans un état transitoire assez longtemps pour fausser le scénario
  // suivant (ex. un clic sur "aligner au centre" n'avait alors aucun effet,
  // alors que EXACTEMENT le même clic, isolé ou précédé d'un délai plus
  // long, fonctionnait very bien - un problème de stabilisation entre deux
  // scénarios consécutifs, pas un bug de l'éditeur lui-même).
  async function resetEditor() {
    // Sort D'ABORD d'un éventuel mode d'édition en-tête/pied laissé actif par
    // le scénario PRÉCÉDENT (ex. hf_enter_via_real_ui_click, qui entre en
    // mode hf mais ne sort jamais explicitement) - sans ça, setHeaderFooterData
    // juste après se combine avec un brouillon hf DÉJÀ actif au lieu de
    // repartir propre, faussant tout scénario hf suivant (constaté : un
    // header.default readonné vide alors qu'on venait de le poser).
    Editor.exitHeaderFooterModeIfActive();
    Editor.setHTML('<p></p>');
    Editor.setHeaderFooterData({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
    // Le bouton "Aperçu format A4" (v2-toggle-a4-preview) ne réagit pas ici (câblé par main.js:wireA4PreviewToggle, jamais atteint dans ce harnais - cf.
    // mémoire projet_local_testing_scope) - un scénario qui a besoin d'une largeur cohérente avec le PDF (ex. mesures pixel-exactes 2-colonnes) pose donc
    // la classe CSS directement sur #editor-container. Sans ce retrait ici, elle restait collée pour TOUS les scénarios suivants du même run (largeur ~794px
    // au lieu de la largeur large habituelle), cassant des scénarios sans rapport (recherche de zone en-tête/pied, détection de saut de page).
    document.getElementById('editor-container').classList.remove('a4-preview');
    document.getElementById('reader-container').classList.remove('a4-preview');
    await sleep(300);
  }

  // Place le curseur à la toute fin du document (comportement le plus
  // fréquent pour composer un scénario pas à pas) - via la vraie API
  // Selection du navigateur sur le dernier nœud texte, pas une astuce interne
  // à ProseMirror (le clavier/les boutons toolbar passent tous par le focus
  // DOM réel, donc les tests doivent partir d'un état de sélection réel eux
  // aussi).
  // ASYNC + court délai final (même raison que selectAllInEditor ci-dessous :
  // ProseMirror synchronise sa sélection interne de façon asynchrone).
  async function focusAtEnd() {
    const root = tiptap();
    root.focus();
    // Sélectionner le CONTENU DU DERNIER ENFANT (le dernier bloc réel -
    // paragraphe/titre/etc.), jamais celui du conteneur `.tiptap` lui-même :
    // collapse(false) sur .tiptap replierait le curseur APRÈS le dernier
    // bloc (une position de conteneur, hors de tout nœud texte), où
    // execCommand('insertText') n'insère rien de façon fiable (constaté -
    // c'est tiptap.focus() SEUL, sans Range manuel, qui plaçait le curseur
    // correctement dans les tout premiers tests de cette session, en
    // s'appuyant sur le placement de caret par défaut du navigateur pour un
    // contenteditable vide ; ceci reproduit le même résultat explicitement,
    // y compris quand le dernier bloc n'est PAS vide).
    const last = root.lastElementChild || root;
    const range = document.createRange();
    range.selectNodeContents(last);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(30);
  }

  async function focusInElement(el, atStart) {
    el.focus ? el.focus() : tiptap().focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(!!atStart);
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(30);
  }

  // Frappe du texte au point d'insertion courant - execCommand('insertText')
  // est fidèle à la frappe réelle pour ProseMirror (déjà éprouvé de
  // nombreuses fois en séance : déclenche bien les mêmes transactions
  // qu'une vraie frappe clavier, contrairement à une affectation
  // textContent directe qui ne passerait jamais par le schéma ProseMirror).
  // ASYNC et attend un court délai de stabilisation après coup - ProseMirror
  // synchronise sa propre vue avec une mutation DOM "externe" (execCommand,
  // pas une de ses propres transactions) de façon asynchrone (constaté : un
  // Editor.getHTML() lu IMMÉDIATEMENT après l'appel synchrone à execCommand
  // renvoyait encore l'ancien contenu, visible seulement à la lecture
  // SUIVANTE) - déléguer ce délai ici une fois pour toutes évite à chaque
  // scénario de devoir s'en souvenir.
  async function typeText(text) {
    document.execCommand('insertText', false, text);
    await sleep(40);
  }

  // ASYNC + court délai - ProseMirror synchronise son PROPRE modèle de
  // sélection interne (editor.state.selection) sur un changement de
  // sélection natif (execCommand('selectAll') ou un Range manuel) via son
  // propre écouteur "selectionchange", de façon asynchrone (même symptôme
  // que execCommand('insertText') ci-dessus : window.getSelection() reflète
  // déjà le bon texte immédiatement, mais un clic de bouton toolbar
  // ENCHAÎNÉ tout de suite après - qui appelle .focus() - peut retomber sur
  // l'ancienne sélection ProseMirror si ce délai n'est pas laissé passer,
  // constaté en conditions réelles : un clic Gras juste après selectAll ne
  // formatait rien).
  async function selectAllInEditor() {
    focusAtEnd();
    document.execCommand('selectAll');
    await sleep(40);
  }

  // Sélectionne tout le texte d'un ÉLÉMENT précis (paragraphe, cellule...)
  // sans étendre à tout le document - nécessaire pour formater UN paragraphe
  // parmi plusieurs sans toucher aux autres. Même délai de stabilisation
  // que selectAllInEditor, même raison.
  async function selectAllInElement(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    await sleep(40);
  }

  async function clickButton(id) {
    const btn = document.getElementById(id);
    if (!btn) throw new Error('Bouton introuvable : #' + id);
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(30);
  }

  // Sélectionne un nœud atome (image, badge...) comme le ferait un VRAI clic
  // souris - ProseMirror résout la position cliquée via posAtCoords(), qui a
  // besoin de VRAIES coordonnées clientX/clientY (un mousedown/click sans
  // coordonnées, comme un simple dispatchEvent(new MouseEvent('click')) sans
  // options de position, résout une position par défaut (0,0) qui ne
  // correspond PAS au nœud cliqué - constaté en conditions réelles : la
  // toolbar flottante d'image ne s'activait jamais avec un clic "nu"). Même
  // classe de piège déjà rencontrée cette session sur le marqueur de note de
  // bas de page.
  async function selectAtomNode(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    await sleep(60);
  }

  // Un survol réel (mouseenter/mouseover) est nécessaire pour révéler un
  // flyout ".v2-hover-group:hover .v2-hover-flyout" (CSS pur, cf.
  // editor-v2.css) - mais en JSDOM/tests automatisés, :hover ne s'active
  // JAMAIS via dispatchEvent seul (ce n'est pas un vrai survol souris pour
  // le moteur CSS) ; on force donc la visibilité en manipulant directement
  // le flyout plutôt que d'espérer un :hover synthétique - plus fiable,
  // et c'est de toute façon ce que verrait un utilisateur qui survole
  // réellement (le flyout devient cliquable, peu importe COMMENT il est
  // devenu visible).
  function openFlyout(groupSelector) {
    const group = document.querySelector(groupSelector);
    if (!group) throw new Error('Groupe flyout introuvable : ' + groupSelector);
    const flyout = group.querySelector('.v2-hover-flyout');
    if (flyout) { flyout.style.opacity = '1'; flyout.style.visibility = 'visible'; flyout.style.pointerEvents = 'auto'; }
    return flyout;
  }

  async function clickRow(selector) {
    const row = document.querySelector(selector);
    if (!row) throw new Error('Ligne de menu introuvable : ' + selector);
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(30);
  }

  // Simule un glisser réel (mousedown -> plusieurs mousemove -> mouseup) sur
  // `document`, exactement comme le code de production écoute (cf.
  // startResize/startMove/grip de redimensionnement 2-colonnes/prosemirror-
  // tables - tous attachent leurs listeners "mousemove"/"mouseup" sur
  // `document`, pas sur l'élément cliqué). Plusieurs pas intermédiaires (pas
  // juste début+fin) car certains gestionnaires lisent des deltas cumulés
  // pas à pas plutôt qu'une seule fois au mouseup.
  async function dragFromTo(handleEl, fromXY, toXY, steps) {
    steps = steps || 5;
    const rect = handleEl.getBoundingClientRect();
    const startX = fromXY ? fromXY[0] : rect.left + rect.width / 2;
    const startY = fromXY ? fromXY[1] : rect.top + rect.height / 2;
    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: startY }));
    for (let i = 1; i <= steps; i++) {
      const x = startX + (toXY[0] - startX) * (i / steps);
      const y = startY + (toXY[1] - startY) * (i / steps);
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      await sleep(5);
    }
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: toXY[0], clientY: toXY[1] }));
    await sleep(20);
  }

  // --- Export PDF sans jamais déclencher de téléchargement ---
  // Intercepte window.pdfMake.createPdf le temps de l'appel, récupère le
  // dernier docDefinition et force sa mise en page (getBase64) pour peupler
  // `.positions`/`.absolutePosition` sur les blocs - exactement l'effet de
  // bord déjà exploité par js/pdf-export.js:resolveNativePdfContent pour son ancrage d'image/TOC.
  async function exportPdfContent(html, headerFooterData) {
    await PdfExport.ensurePdfLibsLoaded();
    let lastContent = null;
    const gens = [];
    const orig = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      lastContent = docDefinition;
      const gen = orig.call(window.pdfMake, docDefinition);
      gen.download = function () {};
      gens.push(gen);
      return gen;
    };
    let error = null;
    let blob = null;
    try {
      const result = await PdfExport.getNativePdfBlobForRecord(html, null, {}, '', headerFooterData || null);
      blob = result.blob;
    } catch (e) {
      error = e;
    } finally {
      window.pdfMake.createPdf = orig;
    }
    if (error) throw error;
    const finalGen = gens[gens.length - 1];
    const base64 = await new Promise(resolve => finalGen.getBase64(resolve));
    return { docDefinition: lastContent, content: lastContent.content, pageCount: gens.length, base64, blob };
  }

  // --- Vérité terrain PDF (pdf.js) ---
  // `.positions[]`/`.absolutePosition` (métadonnées internes pdfmake, lues directement sur les objets docDefinition par exportPdfContent ci-dessus) se
  // sont révélées PEU FIABLES pour du texte multi-lignes aligné centre/droite : `.positions[].left` peut rapporter la même valeur pour TOUTES les lignes
  // d'un même bloc, alors que le rendu réel centre/aligne chaque ligne indépendamment - et un bloc `image` avec `absolutePosition` PEUT quand même être
  // décalé par un `alignment` résiduel que pdfmake applique par-dessus (bug réel trouvé ainsi, cf. mémoire page-grid-positioning). Ces fonctions lisent
  // la POSITION RÉELLEMENT PEINTE en décodant les octets du PDF généré (via pdf.js, chargé depuis un CDN comme pdfmake lui-même) - à utiliser CHAQUE FOIS
  // qu'un test vérifie la position d'un bloc CENTRÉ, ALIGNÉ À DROITE, ou d'une image en calque : ne plus se fier à `.positions[]`/`.absolutePosition` seuls
  // pour ces cas (un alignement/texte multi-ligne peut les rendre trompeurs), même s'ils restent corrects pour du texte aligné à GAUCHE en une seule ligne.
  let pdfJsPromise = null;
  function ensurePdfJsLoaded() {
    if (!pdfJsPromise) {
      pdfJsPromise = new Promise((resolve, reject) => {
        if (window.pdfjsLib) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
      }).catch(e => { pdfJsPromise = null; throw e; });
    }
    return pdfJsPromise;
  }

  // Décode un PDF (base64, cf. exportPdfContent) et rend, pour chaque page, les positions RÉELLEMENT peintes : `textItems` (un par run de glyphes tel que
  // découpé par pdf.js - PAS forcément un mot entier) et `images` (une par image peinte, position/dimensions du rectangle réel, dans l'ORDRE de peinture -
  // pas d'identifiant fiable au-delà de cet ordre, à croiser avec le nombre d'images attendues dans le scénario). Coordonnées en pt, origine en HAUT-GAUCHE
  // de la page (comme partout ailleurs dans ce projet - PDF natif a l'origine en bas, déjà retourné ici via `viewport.height - y`).
  async function extractPdfGroundTruth(base64) {
    await ensurePdfJsLoaded();
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const textItems = textContent.items
        .filter(it => it.str && it.str.trim())
        .map(it => ({ str: it.str, x: it.transform[4], y: viewport.height - it.transform[5], width: it.width }));
      const opList = await page.getOperatorList();
      const OPS = window.pdfjsLib.OPS;
      const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
      let ctm = [1, 0, 0, 1, 0, 0];
      const stack = [];
      const images = [];
      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i]; const args = opList.argsArray[i];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) ctm = stack.pop();
        else if (fn === OPS.transform) ctm = mul(ctm, args);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
          images.push({ x: ctm[4], y: viewport.height - (ctm[5] + ctm[3]), width: ctm[0], height: ctm[3] });
        }
      }
      pages.push({ textItems, images, width: viewport.width, height: viewport.height });
    }
    return { pages };
  }

  // Aplati récursivement un tableau de contenu pdfmake (stack/columns/table
  // body imbriqués) en une liste plate de blocs - pratique pour chercher
  // "y a-t-il un run avec ce texte quelque part" sans connaître la structure
  // exacte à l'avance.
  function flattenPdfContent(node, out) {
    out = out || [];
    if (!node) return out;
    if (Array.isArray(node)) { node.forEach(n => flattenPdfContent(n, out)); return out; }
    if (typeof node !== 'object') return out;
    out.push(node);
    if (node.stack) flattenPdfContent(node.stack, out);
    if (node.columns) flattenPdfContent(node.columns, out);
    if (node.text && Array.isArray(node.text)) flattenPdfContent(node.text, out);
    if (node.table && node.table.body) flattenPdfContent(node.table.body, out);
    return out;
  }

  function findTextBlocks(content, predicate) {
    return flattenPdfContent(content).filter(b => b && (typeof b.text === 'string' || Array.isArray(b.text)) && (!predicate || predicate(b)));
  }
  function findImages(content) { return flattenPdfContent(content).filter(b => b && b.image); }

  // Concatène tous les runs texte d'un bloc (b.text peut être une simple
  // chaîne OU un tableau de runs {text,...}) en une seule chaîne, pour une
  // recherche insensible à la découpe interne en runs.
  function blockPlainText(block) {
    if (!block) return '';
    if (typeof block.text === 'string') return block.text;
    if (Array.isArray(block.text)) return block.text.map(r => (typeof r === 'string' ? r : (r.text || ''))).join('');
    return '';
  }

  return {
    sleep, tiptap, resetEditor, focusAtEnd, focusInElement, typeText,
    selectAllInEditor, selectAllInElement, clickButton, selectAtomNode, openFlyout, clickRow,
    dragFromTo, exportPdfContent, flattenPdfContent, findTextBlocks, findImages, blockPlainText,
    ensurePdfJsLoaded, extractPdfGroundTruth,
    renderReaderMode, setA4Preview, findByText, compareEditorReaderPosition, compareEditorReaderImage,
  };
})();
