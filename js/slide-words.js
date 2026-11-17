// LA COUCHE DE TEXTE D'UNE DIAPOSITIVE POSÉE EN BLOC (14/11, « on ne pourra pas sélectionner un mot directement sur l'image pour le copier... est-ce que ça ne pourrait pas être le cas ? »).
// Une diapositive posée « En bloc » est une photo (extensions/diapositives/slide-raster.js) ; elle garde ses mots avec leur place, `slideWords` : [[x, y, largeur, hauteur, mot], ...] en millièmes de la
// largeur et de la hauteur de l'image (js/editor-nodes.js). Ce module en fait une couche de texte INVISIBLE posée sur l'image, comme celle d'un PDF cherchable : un mot par <span> à la place du mot de
// l'image, sans couleur ; on le sélectionne à la souris (glisser, double clic) et on le copie (Ctrl+C), l'image reste ce qu'elle est.
//  - un clic simple sur un mot n'est pas une sélection de texte : il choisit le bloc, comme un clic sur l'image (poignées, Suppr, glisser) ; seul un glisser (4 px) ou un double clic sélectionne des mots ;
//  - la couche prend le focus du clavier (tabindex -1) pour que l'éditeur ne recopie pas la sélection du navigateur dans la sienne (ProseMirror, qui la remplacerait par celle de l'image) ; l'éditeur ne
//    traite rien de ce qui s'y passe (`owns`, le stopEvent de la vue d'image) ; Échap la quitte et rend le clavier au texte ;
//  - Ctrl+C écrit les mots choisis, séparés par une espace, une ligne de plus quand la ligne de l'image change : `textOf` ;
//  - les mots sont sans importance pour un lecteur d'écran (le texte alternatif de l'image dit la diapositive) : la couche est `aria-hidden`.
//  - à la LECTURE (`readIn`, 17/11, « pour la sélection en mode lecture si c'est possible je suis chaud ») : le même texte invisible, sur l'image de la Lecture. Elle n'a pas de vue d'éditeur : l'<img> est posée dans
//    un cadre en ligne (`.pp-slide-read`, de sa taille, qui prend sa place dans la ligne : css/style.css) où la couche se pose ; une image habillée (alignée à gauche ou à droite) ou liée à une adresse reste telle quelle.
//  - la taille du texte se compte en `cqh` (la hauteur de la couche) quand le navigateur le sait : elle ne dépend plus du zoom de la page (A4, volet étroit), que les mesures en pixels ne suivent pas.
const SlideWords = (function () {
  const LAYER = 'pp-slide-words';
  const WORD = 'pp-slide-word';
  const DRAG_PX = 4;
  const READ = 'pp-slide-read';
  // La hauteur de la couche donne le corps des mots (`cqh`, 1 % de sa hauteur) : zoom de la page ou non, il est juste ; sans cette unité, le corps se mesure en pixels (`fit`).
  const CQ = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('width', '1cqh');
  // Hauteur d'un mot : la boîte que le navigateur lui a donnée est celle d'une ligne (corps et interligne) ; le corps du texte invisible en prend la plus grande part.
  const BODY = 0.85;

  // Les mots lus de `raw` : seuls ceux de la forme [x, y, largeur, hauteur, mot] restent.
  function clean(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(w => Array.isArray(w) && w.length >= 5 && w.slice(0, 4).every(n => Number.isFinite(n)) && w[2] > 0 && w[3] > 0 && typeof w[4] === 'string' && w[4] !== '');
  }

  function build(words) {
    const layer = document.createElement('span');
    layer.className = LAYER;
    layer.setAttribute('aria-hidden', 'true');
    layer.tabIndex = -1;
    if (CQ) layer.style.containerType = 'size';
    const fragment = document.createDocumentFragment();
    words.forEach(([x, y, w, h, text]) => {
      const span = document.createElement('span');
      span.className = WORD;
      span.textContent = text;
      // Sans largeur : le mot garde celle de son texte, que `fit` étire ensuite jusqu'à la largeur du mot de l'image (`data-width`, en millièmes).
      span.style.cssText = 'left: ' + (x / 10) + '%; top: ' + (y / 10) + '%; height: ' + (h / 10) + '%; font-size: ' + (CQ ? (h / 10 * BODY).toFixed(3) + 'cqh' : (h / 1000 * BODY).toFixed(4) + 'em') + '; line-height: ' + (1 / BODY).toFixed(3);
      span.dataset.top = String(y);
      span.dataset.height = String(h);
      span.dataset.width = String(w);
      fragment.appendChild(span);
    });
    layer.appendChild(fragment);
    return layer;
  }

  // L'unité des mots : leur corps se compte en fraction de la hauteur de l'image, `em` de la couche.
  // La première fois que l'image a une taille, chaque mot est étiré (ou resserré) jusqu'à la largeur du mot de l'image : la police du navigateur n'est pas celle de la diapositive, et sans cela la sélection ne
  // couvrirait qu'une part du mot. Le rapport tient pour toute taille de l'image (le corps du texte et la largeur du mot suivent la même taille) : une seule mesure, lues toutes avant d'être écrites.
  function fit(layer, host) {
    const box = host.getBoundingClientRect();
    if (!CQ) layer.style.fontSize = (box.height > 0 ? box.height : 0) + 'px';
    if (layer.dataset.stretched === '1' || !(box.height > 0) || !(box.width > 0)) return;
    layer.dataset.stretched = '1';
    const spans = Array.from(layer.children);
    const natural = spans.map(span => span.getBoundingClientRect().width);
    spans.forEach((span, i) => {
      const target = Number(span.dataset.width) / 1000 * box.width;
      if (!(natural[i] > 0) || !(target > 0)) return;
      span.style.transformOrigin = '0 0';
      span.style.transform = 'scaleX(' + Math.min(6, Math.max(0.2, target / natural[i])).toFixed(4) + ')';
    });
  }

  // Le texte des mots que la sélection du navigateur touche dans `layer` : les mots entiers, dans l'ordre de l'image, une espace entre deux mots d'une même ligne, un saut de ligne quand la ligne change.
  function textOf(layer) {
    const selection = layer.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return '';
    const range = selection.getRangeAt(0);
    const word = layer.ownerDocument.createRange();
    let out = '';
    let previous = null;
    Array.from(layer.children).forEach((span) => {
      // Un mot est choisi quand la sélection couvre une part de son texte (un double clic qui finit au bord du mot suivant ne le prend pas).
      word.selectNodeContents(span);
      if (range.compareBoundaryPoints(Range.END_TO_START, word) !== -1 || range.compareBoundaryPoints(Range.START_TO_END, word) !== 1) return;
      if (previous) {
        const sameLine = Math.abs(Number(span.dataset.top) - Number(previous.dataset.top)) <= Number(previous.dataset.height) / 2;
        out += sameLine ? ' ' : '\n';
      }
      out += span.textContent;
      previous = span;
    });
    return out;
  }

  const hasSelectionIn = layer => {
    const selection = layer.ownerDocument.getSelection();
    return !!selection && selection.rangeCount > 0 && !selection.isCollapsed && layer.contains(selection.anchorNode);
  };

  function wire(layer, options) {
    let down = null;
    layer.addEventListener('mousedown', (event) => {
      down = event.button === 0 ? { x: event.clientX, y: event.clientY, detail: event.detail } : null;
      // Une sélection posée ailleurs (celle d'un bloc choisi, que l'éditeur pose autour de l'image, ou du texte voisin) recouvre ces mots : le navigateur la prendrait pour le début d'un glisser-déposer
      // et ne sélectionnerait rien. Elle s'efface d'abord ; celle des mots, elle, reste (on peut la glisser).
      const selection = layer.ownerDocument.getSelection();
      if (down && selection && selection.rangeCount && !(!selection.isCollapsed && layer.contains(selection.anchorNode))) selection.removeAllRanges();
    });
    // Un clic simple, sans glisser : pas une sélection de texte, le clic du bloc (le bloc se sélectionne comme au clic sur l'image).
    layer.addEventListener('mouseup', (event) => {
      const was = down;
      down = null;
      if (!was || was.detail > 1 || Math.hypot(event.clientX - was.x, event.clientY - was.y) >= DRAG_PX) return;
      const selection = layer.ownerDocument.getSelection();
      if (selection) selection.removeAllRanges();
      if (options && options.onClick) options.onClick(event);
    });
    layer.addEventListener('copy', (event) => {
      // Une sélection qui sort de la couche (du texte voisin jusque sur l'image, à la Lecture) se copie comme le navigateur le fait : seule celle qui reste dans les mots prend leur mise en forme.
      const selection = layer.ownerDocument.getSelection();
      if (!selection || !layer.contains(selection.anchorNode) || !layer.contains(selection.focusNode)) return;
      const text = textOf(layer);
      if (!text || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    });
    layer.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const selection = layer.ownerDocument.getSelection();
      if (selection && hasSelectionIn(layer)) selection.removeAllRanges();
      if (options && options.onEscape) options.onEscape(event);
    });
  }

  // La couche de `host` (le cadre de l'image : un élément positionné, de la taille de l'image) : posée, mise à jour ou retirée d'après `raw` (les mots du bloc, null pour une image sans mots). `options` :
  // { onClick(event), onEscape(event) }. Rend la couche, ou null.
  function sync(host, raw, options) {
    const words = clean(raw);
    let layer = host.querySelector(':scope > .' + LAYER);
    if (!words.length) { if (layer) release(layer); return null; }
    const key = JSON.stringify(words);
    if (layer && layer.dataset.key === key) return layer;
    if (layer) release(layer);
    layer = build(words);
    layer.dataset.key = key;
    wire(layer, options);
    host.appendChild(layer);
    fit(layer, host);
    if (typeof ResizeObserver === 'function') {
      layer.sizeObserver = new ResizeObserver(() => fit(layer, host));
      layer.sizeObserver.observe(host);
    }
    return layer;
  }

  function release(layer) {
    if (layer.sizeObserver) layer.sizeObserver.disconnect();
    layer.remove();
  }
  // Retire la couche de `host`, s'il y en a une.
  function drop(host) {
    const layer = host.querySelector(':scope > .' + LAYER);
    if (layer) release(layer);
  }

  // La Lecture (js/reader-mode.js, renderRecord) : chaque photo de diapositive posée en bloc de `root` reçoit sa couche de mots. L'<img> passe dans un cadre en ligne (`.pp-slide-read`) qui en prend la place (même
  // taille, même alignement : css/style.css) ; ni une image derrière ou devant le texte, ni une image habillée à gauche ou à droite (le texte coule à côté, la mise en page de la Lecture la suit à part), ni une image
  // dans un lien (le clic mène au lien) ne reçoivent de couche. Rend le nombre de couches posées.
  function readIn(root) {
    let count = 0;
    root.querySelectorAll('img.editor-image[data-slide-words]').forEach((img) => {
      let raw = null;
      try { raw = JSON.parse(img.getAttribute('data-slide-words') || 'null'); } catch (e) { raw = null; }
      const layer = img.getAttribute('data-layer');
      const align = img.getAttribute('data-align');
      if ((layer && layer !== 'normal') || align === 'left' || align === 'right' || img.closest('a[href]') || !clean(raw).length) return;
      let host = img.parentElement;
      if (!host) return;
      if (!host.classList.contains(READ)) {
        host = img.ownerDocument.createElement('span');
        host.className = READ;
        if (align) host.setAttribute('data-align', align);
        if (img.getAttribute('data-wrap')) host.setAttribute('data-wrap', img.getAttribute('data-wrap'));
        img.replaceWith(host);
        host.appendChild(img);
      }
      if (sync(host, raw, null)) count++;
    });
    return count;
  }

  // Un événement de la couche : l'éditeur (ProseMirror) ne le traite pas (stopEvent de la vue d'image).
  const owns = event => !!event.target && !!event.target.closest && !!event.target.closest('.' + LAYER);

  return { sync, readIn, drop, owns, textOf, clean, LAYER, WORD, READ };
})();
