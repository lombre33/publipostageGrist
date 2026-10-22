// Le vide que la barre d'outils laisse à la barre de GFS (consigne GFS 025, choix du porteur « Laisser un vide » : en haut le 21/10, aux trois autres bords et dans les petits panneaux le 22/10).
// Chez GFS la barre de boutons recouvre le cadre au bord que la personne a choisi, centrée sur lui : en haut, elle tombe sur le milieu de la première ligne (à 700 px de large, sur Enregistrer, Supprimer,
// Tables liées et Mode édition) ; à gauche, sur le début des lignes à la hauteur de la zone (à 700 × 400, « Surligner », début de la dernière ligne de mise en forme) ; à droite, sur leur bout. Aucun bouton ne
// disparaît, aucune bande n'est ajoutée : ligne par ligne (les trois rangées de la barre du haut, `ROWS`), le premier élément que la zone recouvre vraiment est écarté, et le retour à la ligne fait le reste
// (une ligne de plus au besoin) :
//  - en haut, en bas ou à gauche, il saute au bord de la zone qui est de son côté droit, tout ce qui le suit le suit dans l'ordre, et ce qui est avant lui ne bouge pas (une marge à gauche sur UN seul élément,
//    classe `pp-gfs-gap`, variable `--pp-gfs-gap`, css/toolbar-v2.css) ; un séparateur juste avant lui le suit, pour que le groupe garde son trait ;
//  - à droite, la ligne finit avant la zone : s'il est collé au bout de sa ligne (Réglages, un champ qui s'étire) il recule devant elle, sinon lui et ce qui le suit passent à la ligne suivante (une marge à
//    droite, classe `pp-gfs-room`, variable `--pp-gfs-room`, sur lui-même ou sur l'élément qui le précède) ;
//  - un élément qui ne peut ni sauter (il ne tiendrait pas à droite de la zone) ni passer à la ligne (il est le premier de la sienne) reste où il est, jamais pire qu'avant.
// Ce que la zone recouvre « vraiment » : un élément qui n'y entre que de l'écart qui sépare deux lignes de sa rangée n'en frôle que la marge que GFS garde autour de sa barre, pas la barre (la ligne suivante
// d'une barre en haut, un bout d'élément au bord d'une barre à droite) : il n'est pas déplacé. Ce n'est pas un chiffre de la barre, c'est celui de la rangée.
// Aucun chiffre de la barre n'est écrit ici : la zone vient de GfsBar (js/gfs-bar.js). Sans barre, seule (adresse sans `gfs=`) ou chez un GFS d'avant la consigne 025, rien ne bouge.
// La barre d'outils n'est pas touchée autrement : ses boutons gardent leur ordre de tabulation et leurs menus (qui se calent à l'ouverture sur la place du bouton). Tout est recalculé, sur la rangée remise comme
// elle est sans barre, à chaque changement de la barre et de la mise en page (largeur du cadre, titre du modèle, boutons montrés ou non, boutons ajoutés), dans l'image suivante.
// Une seconde tâche, de la même mise en page : un séparateur (`.bar-sep` de la rangée du modèle et de l'export, `.v2-sep` de celle de mise en forme) que la ligne coupe au bord, seul au début ou au bout d'une ligne
// (à 700 px de large avec la barre en haut, « Page | Type d'export » se coupe là ; à 800 px, la deuxième ligne de mise en forme commence par un trait), ne sépare plus rien : son trait est caché (classe `pp-sep-alone`,
// `visibility`, css/toolbar-v2.css), sa place reste la sienne et rien ne bouge (choix du porteur, 22/10 : « Le cacher quand il est seul », pour la rangée du modèle puis pour celle de mise en forme).
const ToolbarGap = (function () {
  const ROWS = ['#toolbar-top .bar-row', '#toolbar-top #v2-email-fields-row', '#toolbar-top #v2-toolbar'];
  const SPREAD = '.action-cluster';   // un regroupement par espacement (css/toolbar-v2.css) : ses boutons se décalent un à un
  const BAR_SEPARATOR = 'bar-sep';    // le trait de la rangée du modèle et de l'export
  const SEPARATORS = [BAR_SEPARATOR, 'v2-sep'];   // et celui de la rangée de mise en forme
  const MARK = 'pp-gfs-gap';
  const SHIFT = '--pp-gfs-gap';
  const ROOM = 'pp-gfs-room';
  const RESERVE = '--pp-gfs-room';
  const ALONE = 'pp-sep-alone';
  const LOGO = 'v2-brand-logo';
  const LOGO_SHIFT = '--pp-logo-shift';
  const marked = new Set();           // les éléments qui portent une marge posée ici
  let queued = 0;

  const rowsOf = () => ROWS.map(selector => document.querySelector(selector)).filter(row => row && getComputedStyle(row).display !== 'none');
  const isSeparator = el => SEPARATORS.some(name => el.classList.contains(name));
  const margin = (el, side) => parseFloat(getComputedStyle(el)['margin' + side]) || 0;

  function children(row) {
    const out = [];
    Array.from(row.children).forEach((child) => {
      if (child.matches(SPREAD)) out.push(...Array.from(child.children)); else out.push(child);
    });
    return out;
  }

  // Ce qui occupe de la place dans la rangée, dans l'ordre du document : ni ce qui est caché (display: none), ni le logo, sorti du flux.
  function unitsOf(row) {
    return children(row).filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed';
    });
  }

  // L'élément que la rangée fait passer à la ligne : lui-même, ou le regroupement par espacement qui le contient (ses boutons ne se séparent pas).
  const itemOf = unit => (unit.parentElement && unit.parentElement.matches(SPREAD) ? unit.parentElement : unit);

  // Les lignes comme elles sont tombées : les éléments qui partagent un même milieu vertical, dans l'ordre du document.
  function linesOf(units) {
    const lines = [];
    units.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const middle = (rect.top + rect.bottom) * 0.5;
      const line = lines[lines.length - 1];
      if (line && Math.abs(middle - line.middle) < line.half) line.items.push(el);
      else lines.push({ middle, half: (rect.bottom - rect.top) * 0.5, items: [el] });
    });
    return lines;
  }

  // La zone recouvre vraiment un rectangle quand elle y entre de plus que l'écart entre deux lignes (ou deux éléments) de sa rangée, dans les deux sens.
  function touches(rect, tolerance) {
    if (!GfsBar.overlaps(rect)) return false;
    const zone = GfsBar.zone();
    const across = Math.min(rect.right, zone.x + zone.width) - Math.max(rect.left, zone.x);
    const along = Math.min(rect.bottom, zone.y + zone.height) - Math.max(rect.top, zone.y);
    return across > tolerance && along > tolerance;
  }

  // Pose une marge (classe et variable, css/toolbar-v2.css) et rend de quoi la retirer.
  function set(el, name, property, px) {
    const had = el.classList.contains(name);
    const old = el.style.getPropertyValue(property);
    el.style.setProperty(property, px + 'px');
    el.classList.add(name);
    marked.add(el);
    return () => {
      if (had) { el.style.setProperty(property, old); return; }
      el.classList.remove(name);
      el.style.removeProperty(property);
    };
  }

  function release() {
    marked.forEach((el) => {
      el.classList.remove(MARK, ROOM);
      el.style.removeProperty(SHIFT);
      el.style.removeProperty(RESERVE);
    });
    marked.clear();
  }

  // Le premier élément de chaque ligne que la zone recouvre vraiment (hors `left`, ceux qu'on n'a pas su écarter), rangée par rangée, de haut en bas.
  function targets(rows, left) {
    const found = [];
    rows.forEach((row) => {
      const style = getComputedStyle(row);
      const tolerance = Math.max(parseFloat(style.rowGap) || 0, parseFloat(style.columnGap) || 0);
      const limit = row.getBoundingClientRect().right - (parseFloat(style.paddingRight) || 0);
      linesOf(unitsOf(row)).forEach((line) => {
        const unit = line.items.find(el => !left.includes(el) && touches(el.getBoundingClientRect(), tolerance));
        if (unit) found.push({ line: line.items, unit, tolerance, limit });
      });
    });
    return found;
  }

  // Il saute au bord de la zone qui est de son côté droit. Refusé s'il ne tiendrait pas à droite de la zone, ou si sa ligne se casse avant lui (sa marge ne ferait qu'un trou au début de la ligne suivante).
  function jump(target) {
    const zone = GfsBar.zone();
    const side = zone.x + zone.width;
    const at = target.line.indexOf(target.unit);
    const head = at > 0 && isSeparator(target.line[at - 1]) ? target.line[at - 1] : target.unit;
    const start = target.unit.getBoundingClientRect();
    const from = head.getBoundingClientRect();
    if (side + (start.right - from.left) > target.limit + 0.5) return false;
    const undo = set(head, MARK, SHIFT, margin(head, 'Left') + side - from.left);
    const end = target.unit.getBoundingClientRect();
    if (Math.abs(end.top - start.top) <= 1 && !touches(end, target.tolerance)) return true;
    undo();
    return false;
  }

  // Il recule devant la zone, d'une marge à droite sur lui-même : ne vaut que pour ce que la ligne pousse au bout (Réglages, un champ qui s'étire), qui n'a pas de voisin à décaler.
  function back(target) {
    const zone = GfsBar.zone();
    const start = target.unit.getBoundingClientRect();
    const undo = set(target.unit, ROOM, RESERVE, margin(target.unit, 'Right') + start.right - zone.x);
    const end = target.unit.getBoundingClientRect();
    if (Math.abs(end.top - start.top) <= 1 && !touches(end, target.tolerance)) return true;
    undo();
    return false;
  }

  // Lui et ce qui le suit passent à la ligne suivante : l'élément qui le précède sur sa ligne la remplit jusqu'au bout (une marge à droite), et la rangée ne peut plus l'y laisser.
  function wrap(target) {
    const item = itemOf(target.unit);
    const at = target.line.findIndex(el => itemOf(el) === item);
    if (at < 1) return false;   // le premier de sa ligne : rien avant lui qui le fasse passer à la suivante
    const before = target.line[at - 1];
    const start = target.unit.getBoundingClientRect();
    const room = target.limit - before.getBoundingClientRect().right - margin(before, 'Right') - 0.5;
    if (room <= 0) return false;
    const undo = set(before, ROOM, RESERVE, margin(before, 'Right') + room);
    if (target.unit.getBoundingClientRect().top - start.top > 1) return true;
    undo();
    return false;
  }

  // Remet les rangées comme elles sont sans barre (la mesure se fait sur cet état-là), puis écarte de la zone, une ligne à la fois et de haut en bas, ce qu'elle recouvre. Ce qui ne peut être écarté reste.
  function gap() {
    release();
    const edge = GfsBar.edge();
    const rows = rowsOf();
    if (!edge || !rows.length) return;
    const left = [];
    const count = rows.reduce((sum, row) => sum + children(row).length, 0);
    for (let turn = 0; turn < count + count; turn += 1) {   // au plus deux essais par élément : un qui réussit, un qui est laissé
      const next = targets(rows, left)[0];
      if (!next) return;
      const done = edge === 'right' ? back(next) || wrap(next) : jump(next) || wrap(next);
      if (!done) left.push(next.unit);
    }
  }

  // Les séparateurs que la ligne coupe au bord de leur rangée (celle du modèle et de l'export, celle de mise en forme) : un séparateur au bord d'une ligne est caché. Cacher ne change aucune taille.
  function tidy() {
    rowsOf().forEach((row) => {
      const edges = new Set();
      linesOf(unitsOf(row)).forEach((line) => { edges.add(line.items[0]); edges.add(line.items[line.items.length - 1]); });
      children(row).forEach(el => el.classList.toggle(ALONE, isSeparator(el) && edges.has(el)));
    });
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
    const rows = ROWS.map(selector => document.querySelector(selector)).filter(Boolean);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const seen = new Set();
    const follow = (row) => {
      if (observer && !seen.has(row)) { seen.add(row); observer.observe(row); }
      children(row).forEach((el) => { if (observer && !seen.has(el)) { seen.add(el); observer.observe(el); } });
    };
    rows.forEach(follow);
    // Un bouton ajouté après le départ (une extension, un module qui monte sa barre plus tard) change la mise en page sans que la rangée change de taille.
    if (typeof MutationObserver === 'function') {
      const added = new MutationObserver(() => { rows.forEach(follow); schedule(); });
      rows.forEach(row => added.observe(row, { childList: true }));
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
