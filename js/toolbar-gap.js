// Le vide que la première ligne de la barre d'outils (`.bar-row`) laisse à la barre de GFS quand elle est posée en haut du cadre (consigne GFS 025, choix du porteur du 21/10 : « Laisser un vide »).
// Chez GFS la barre de boutons recouvre le cadre au bord que la personne a choisi, centrée sur lui : en haut, elle tombe sur le milieu de la première ligne (à 700 px de large, sur Enregistrer, Supprimer,
// Tables liées et Mode édition). Rien n'est caché et aucune bande n'est ajoutée : le premier bouton que la zone recouvre saute à son bord droit, tout ce qui le suit le suit dans l'ordre (le retour à la
// ligne de `.bar-row` fait le reste : une ligne de plus au besoin), et ce qui est à gauche de la zone ne bouge pas. Un séparateur juste avant ce bouton le suit, pour que le groupe garde son trait. Seule la
// première ligne compte : la zone n'effleure la suivante que par la marge de 4 px qu'elle garde autour de la barre.
// Aucun chiffre de la barre n'est écrit ici : la zone vient de GfsBar (js/gfs-bar.js). Aux trois autres bords, sans barre, seule (adresse sans `gfs=`) ou chez un GFS d'avant la consigne 025, rien ne bouge.
// Le décalage est une marge à gauche d'UN seul élément (classe `pp-gfs-gap`, variable `--pp-gfs-gap`, css/toolbar-v2.css) : la barre d'outils n'est pas touchée autrement, ses boutons gardent leur ordre
// de tabulation et leurs menus (qui se calent à l'ouverture sur la place du bouton). Elle est recalculée à chaque changement de la barre et de la mise en page de la ligne (largeur du cadre, titre du
// modèle, boutons montrés ou non), dans l'image suivante. Un bouton qui ne tiendrait pas à droite de la zone (cadre très étroit, titre du modèle sous la barre) n'est pas décalé : le suivant l'est.
// Une seconde tâche, de la même mise en page : un séparateur (`.bar-sep`) que la ligne coupe au bord, seul au début ou au bout d'une ligne (à 700 px de large avec la barre en haut, « Page | Type d'export »
// se coupe là), ne sépare plus rien : son trait est caché (classe `pp-sep-alone`, `visibility`, css/toolbar-v2.css), sa place reste la sienne et rien ne bouge (carte du 21/10 : « Le cacher quand il est seul »).
const ToolbarGap = (function () {
  const ROW = '#toolbar-top .bar-row';
  const SPREAD = '.action-cluster';   // un regroupement par espacement (css/toolbar-v2.css) : ses boutons se décalent un à un
  const SEPARATOR = 'bar-sep';
  const MARK = 'pp-gfs-gap';
  const SHIFT = '--pp-gfs-gap';
  const ALONE = 'pp-sep-alone';
  const LOGO = 'v2-brand-logo';
  const LOGO_SHIFT = '--pp-logo-shift';
  let moved = null;                   // l'élément qui porte la marge, ou null
  let queued = 0;

  const rowOf = () => document.querySelector(ROW);

  function children(row) {
    const out = [];
    Array.from(row.children).forEach((child) => {
      if (child.matches(SPREAD)) out.push(...Array.from(child.children)); else out.push(child);
    });
    return out;
  }

  // Ce qui occupe de la place dans la ligne, dans l'ordre du document : ni ce qui est caché (display: none), ni le logo, sorti du flux.
  function unitsOf(row) {
    return children(row).filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.position !== 'absolute';
    });
  }

  function release() {
    if (!moved) return;
    moved.classList.remove(MARK);
    moved.style.removeProperty(SHIFT);
    moved = null;
  }

  function shift(head, by) {
    head.style.setProperty(SHIFT, (parseFloat(getComputedStyle(head).marginLeft) || 0) + by + 'px');
    head.classList.add(MARK);
    moved = head;
  }

  // Remet la ligne comme elle est sans barre (la mesure se fait sur cet état-là), puis la décale si la barre est en haut et recouvre l'un de ses éléments.
  function gap() {
    release();
    const zone = GfsBar.edge() === 'top' ? GfsBar.zone() : null;
    const row = rowOf();
    if (!zone || !row) return;
    const units = unitsOf(row);
    if (!units.length) return;
    const right = zone.x + zone.width;
    const limit = row.getBoundingClientRect().right - (parseFloat(getComputedStyle(row).paddingRight) || 0);
    const firstLineEnd = units[0].getBoundingClientRect().bottom;
    for (let at = 0; at < units.length; at += 1) {
      const rect = units[at].getBoundingClientRect();
      if (rect.top >= firstLineEnd) break;   // la barre ne recouvre que la première ligne : la suivante n'en frôle que la marge, d'un pixel
      if (!GfsBar.overlaps(rect)) continue;
      const head = at > 0 && units[at - 1].classList.contains(SEPARATOR) ? units[at - 1] : units[at];
      const from = head.getBoundingClientRect();
      if (right + (rect.right - from.left) > limit + 0.5) continue;   // ne tiendrait pas à droite de la zone
      shift(head, right - from.left);
      if (Math.abs(units[at].getBoundingClientRect().top - rect.top) <= 1) return;   // il est resté sur sa ligne
      release();   // la ligne s'est cassée avant lui : sa marge ne ferait qu'un trou à gauche de la ligne suivante
    }
  }

  // Les lignes comme elles sont tombées (les éléments qui partagent un même milieu vertical, dans l'ordre du document) : un séparateur au bord de l'une d'elles est caché. Cacher ne change aucune taille.
  function tidy() {
    const row = rowOf();
    if (!row) return;
    const lines = [];
    unitsOf(row).forEach((el) => {
      const rect = el.getBoundingClientRect();
      const middle = (rect.top + rect.bottom) * 0.5;
      const line = lines[lines.length - 1];
      if (line && Math.abs(middle - line.middle) < line.half) line.items.push(el);
      else lines.push({ middle, half: (rect.bottom - rect.top) * 0.5, items: [el] });
    });
    const edges = new Set();
    lines.forEach((line) => { edges.add(line.items[0]); edges.add(line.items[line.items.length - 1]); });
    children(row).forEach(el => el.classList.toggle(ALONE, el.classList.contains(SEPARATOR) && edges.has(el)));
  }

  function place() {
    gap();
    tidy();
  }

  function schedule() {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; place(); });
  }

  function watch() {
    const row = rowOf();
    if (!row) return;
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(schedule);
      observer.observe(row);
      children(row).forEach(el => observer.observe(el));
    }
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }

  // Le logo (coin haut droit, sorti du flux) s'écarte de la zone quand une barre à droite la lui fait recouvrir (un cadre d'environ 190 px de haut ou moins) : GfsBar.keepClear le glisse, et la ligne réserve de ce
  // recul la place de plus que lui laisse son retrait de droite (variable `--pp-logo-shift`, css/toolbar-v2.css), pour qu'aucun bouton ne passe sous lui ni sous la barre. Inscrit AVANT `place` : la ligne est mesurée avec son retrait à jour.
  const logo = document.getElementById(LOGO);
  const top = document.getElementById('toolbar-top');
  if (logo && top) GfsBar.keepClear(logo, (move) => { if (move.dx < 0) top.style.setProperty(LOGO_SHIFT, -move.dx + 'px'); else top.style.removeProperty(LOGO_SHIFT); });

  place();   // l'état d'à présent d'abord, puis les changements
  GfsBar.onChange(place);
  watch();

  return { refresh: place };
})();
