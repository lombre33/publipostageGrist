// Le repère « 3/4 » du défilement (audit « confort d'usage » du 12/11, idée 12) : quand on fait défiler un long document, une petite pastille dit à quelle page on est, sur combien (« 3/4 », pas
// le mot « page »), puis s'efface quand le défilement s'arrête. Elle se pose près de la pastille de zoom (coin bas droit, js/page-zoom.js) ; quand on tire la barre de défilement à la souris, elle
// suit le pointeur, là où l'œil est déjà. Édition et Lecture. Affichage seulement : rien n'est écrit dans le document, rien n'est gardé.
// Les pages sont celles de l'aperçu A4 : une page de plus que de coutures (`.v2-page-seam-divider`, posées par js/header-footer-preview.js en Édition et js/reader-mode.js en Lecture). Sans aperçu
// ou avec une seule page, il n'y a rien à dire : la pastille ne s'allume pas. La page est celle qui passe au milieu de la zone visible ; tout en bas, c'est la dernière.
const PageChip = (function () {
  const IDS = ['editor-container', 'reader-container'];
  const SEAM = '.v2-page-seam-divider';
  const ON = 'pp-page-chip-on';
  const HIDE_MS = 900;      // le temps qu'elle reste après le dernier défilement
  const CORNER_GAP = 4;     // entre la pastille et celle du zoom
  const OVERLAY_BAR_PX = 16; // la barre fine qui se superpose au contenu (macOS, tactile, Linux)
  const POINTER_GAP = 16;   // à gauche du pointeur, qui tient la barre à droite du document

  let chip = null;
  let hideTimer = 0;
  let frame = 0;
  let dragging = false;
  let pointer = { x: 0, y: 0 };

  const containerOf = id => document.getElementById(id);

  // { page, total } du document qu'on voit défiler, ou null quand il n'y a qu'une page (ou pas d'aperçu).
  function pageOf(container) {
    const seams = container.querySelectorAll(SEAM);
    const total = seams.length + 1;
    if (total < 2) return null;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) return { page: total, total };
    const box = container.getBoundingClientRect();
    const middle = box.top + container.clientTop + container.clientHeight / 2;
    // Les coutures sont dans l'ordre du document : on compte, par dichotomie, celles qui sont passées au-dessus du milieu.
    let low = 0;
    let high = seams.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (seams[mid].getBoundingClientRect().top <= middle) low = mid + 1; else high = mid;
    }
    return { page: low + 1, total };
  }

  function placeAtPointer() {
    const root = document.documentElement;
    const width = chip.offsetWidth;
    const height = chip.offsetHeight;
    const left = Math.max(2, Math.min(root.clientWidth - width - 2, pointer.x - width - POINTER_GAP));
    const top = Math.max(2, Math.min(root.clientHeight - height - 2, pointer.y - height / 2));
    chip.style.left = Math.round(left) + 'px';
    chip.style.top = Math.round(top) + 'px';
    chip.style.right = 'auto';
    chip.style.bottom = 'auto';
  }
  // Au repos : juste au-dessus de la pastille de zoom, calée sur son bord droit.
  function placeAtCorner() {
    const root = document.documentElement;
    const zoom = document.getElementById('pp-page-zoom');
    const rect = zoom ? zoom.getBoundingClientRect() : null;
    const found = rect && rect.width > 0;
    chip.style.left = 'auto';
    chip.style.top = 'auto';
    chip.style.right = Math.max(0, Math.round(found ? root.clientWidth - rect.right : 8)) + 'px';
    chip.style.bottom = Math.max(0, Math.round(found ? root.clientHeight - rect.top + CORNER_GAP : 32)) + 'px';
  }

  function hide() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    if (chip) chip.classList.remove(ON);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_MS);
  }

  function update(container) {
    if (!chip) return;
    const where = pageOf(container);
    if (!where) { hide(); return; }
    const text = where.page + '/' + where.total;
    if (chip.textContent !== text) chip.textContent = text;
    if (dragging) placeAtPointer(); else placeAtCorner();
    chip.classList.add(ON);
    if (dragging) clearTimeout(hideTimer); else scheduleHide();
  }

  function onScroll(event) {
    const container = event.currentTarget;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(container); });
  }

  // La barre de défilement se tient quand l'appui tombe sur le conteneur lui-même, à droite de sa zone utile.
  function onMouseDown(event) {
    if (event.button !== 0 || !event.target || !IDS.includes(event.target.id)) return;
    const container = event.target;
    const box = container.getBoundingClientRect();
    // Barre classique : à droite de la zone utile. Barre qui se superpose au contenu (zone utile = tout) : sa largeur d'usage, au bord droit ; l'appui doit tomber sur le conteneur lui-même, jamais sur la feuille.
    const overlay = container.offsetWidth - container.clientLeft * 2 <= container.clientWidth;
    const barLeft = overlay ? box.right - container.clientLeft - OVERLAY_BAR_PX : box.left + container.clientLeft + container.clientWidth;
    if (event.clientX < barLeft || container.scrollHeight <= container.clientHeight) return;
    dragging = true;
    pointer = { x: event.clientX, y: event.clientY };
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    update(container);
  }
  function onMouseMove(event) {
    pointer = { x: event.clientX, y: event.clientY };
    if (chip.classList.contains(ON)) placeAtPointer();
  }
  function onMouseUp() {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    scheduleHide();
  }

  function wire() {
    if (chip) return;
    chip = Dom.el('div', 'pp-page-chip');
    chip.id = 'pp-page-chip';
    chip.setAttribute('aria-hidden', 'true'); // un repère pour l'œil : un lecteur d'écran n'a pas à l'entendre à chaque défilement
    document.body.appendChild(chip);
    IDS.forEach(id => { const el = containerOf(id); if (el) el.addEventListener('scroll', onScroll, { passive: true }); });
    document.addEventListener('mousedown', onMouseDown, true);
  }

  return { wire, pageOf };
})();
