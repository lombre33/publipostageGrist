// Aides bas niveau pour piloter l'éditeur V2 comme un vrai utilisateur
// (clics réels sur les boutons de la toolbar, frappe clavier, glisser-déposer
// de poignées) et pour intercepter l'export PDF sans jamais déclencher de
// vrai téléchargement navigateur - même principe que dev-tests/runner.js
// (V1), adapté à l'API de v2/js/pdf-export.js (cf. recherche préalable :
// PdfExport.getNativePdfBlobForRecord ne télécharge jamais, mais le "truc"
// des positions pdfmake nécessite quand même d'intercepter
// window.pdfMake.createPdf de la même façon).
window.TestHelpers = (function () {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function tiptap() { return document.querySelector('.tiptap'); }

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
  // Intercepte window.pdfMake.createPdf le temps de l'appel, comme
  // dev-tests/runner.js (V1) - récupère le dernier docDefinition ET force sa
  // mise en page (getBase64) pour peupler `.positions`/`.absolutePosition`
  // sur les blocs, EXACTEMENT l'effet de bord déjà exploité par
  // v2/js/pdf-export.js:resolveNativePdfContent pour son ancrage d'image/TOC.
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
  };
})();
