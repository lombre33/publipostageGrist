// La barre de GFS vue de l'app (consigne GFS 025, contrats de GFS 5.2 point 7). Quand Grist Factory Suite héberge le widget, il pose sa barre (quatre boutons à icône seule) PAR-DESSUS le cadre de l'app, au bord que la
// personne a choisi - à gauche tant qu'elle n'a rien choisi, sinon en haut, à droite ou en bas -, centrée sur ce bord. L'app ne la dessine pas et ne cède aucune bande : elle écarte seulement de la zone ce qu'elle pose
// près d'un bord (sa barre d'outils en haut, la bande des diapositives, le ▶ et la pastille du zoom, le logo, la sortie de la Lecture épurée) et cale ses menus, bulles et fenêtres sur ce qui reste libre. La zone est le
// rectangle de la barre, 4 px de marge compris, en pixels du cadre (origine en haut à gauche) ; chez GFS elle bouge avec la barre et avec la taille du cadre, qui n'est jamais rechargé.
// js/gfs-link.js lit `contexte.barre` et l'événement `barre` et parle seul à GFS ; ce fichier en fait ce que le reste du widget consulte. Aucun effet visible par lui-même : rien ne bouge tant qu'un composant n'a pas
// choisi de s'écarter, et seule (adresse sans `gfs=`), avec un GFS d'avant la consigne 025, explorateur ouvert ou barre masquée, il n'y a pas de barre et rien à écarter.
//   <html data-gfs-bar="left|top|right|bottom">   le bord de la barre ; l'attribut manque quand il n'y a pas de barre
//   --gfs-bar-x, --gfs-bar-y, --gfs-bar-width, --gfs-bar-height   la zone, en px (0px sans barre) : pour écarter un élément précis, sans toucher à ce que la barre ne recouvre pas
//   --gfs-bar-inset-left | -top | -right | -bottom   la profondeur que la barre prend à ce bord, en px, 0px aux trois autres bords et sans barre : la règle simple, pour ce qui longe tout un bord
//   GfsBar.edge()            'left', 'top', 'right' ou 'bottom' ; null sans barre
//   GfsBar.zone()            { x, y, width, height } (une copie) ; null sans barre
//   GfsBar.overlaps(rect)    vrai quand le rectangle (un DOMRect, ou { left, top, right, bottom }) recouvre la zone d'un pixel au moins
//   GfsBar.limits(rect)      { left, top, right, bottom } : la place que le cadre laisse à un composant dont `rect` est l'emprise (cadre entier, dont la barre retire la bande de la zone, jusqu'à son bord intérieur, marge comprise,
//                            seulement quand `rect` croise la zone le long du bord : la bande d'une barre à gauche ne gêne que ce qui est à la hauteur de la zone) ; sans barre, le cadre entier. Pour borner un menu, un popup ou un
//                            panneau (le défilement interne se plafonne sur `bottom`, la position sur `left` et `right`).
//   GfsBar.apart(rect)       { dx, dy } : le plus petit déplacement, perpendiculaire au bord de la barre et dans le sens qui s'en éloigne, qui sort `rect` de la zone ({ dx: 0, dy: 0 } quand il ne la recouvre pas, ou sans barre) :
//                            à droite d'une barre à gauche, à gauche d'une barre à droite, sous une barre en haut, au-dessus d'une barre en bas.
//   GfsBar.bite(rect)        { left, top, right, bottom } : de combien de px la zone entre dans le rectangle, par le côté qui est au bord de la barre (un seul des quatre côtés est non nul : « left » pour une barre
//                            à gauche, etc.) ; tout à 0 sans barre ou quand elle ne le recouvre pas. C'est ce que cède un panneau qui longe ce bord (la bande des diapositives, le volet « Importer ») ou ce dont un
//                            élément posé près du bord recule (la pastille du zoom)
//   GfsBar.onChange(fn)      `fn({ edge, depth, zone } | null)` à chaque changement de la barre, celui du contexte au démarrage compris ; lire `edge()` ou `zone()` d'abord, puis s'abonner. Rend de quoi se désabonner.
//   GfsBar.hide(masked)      demande à GFS de masquer sa barre (vrai : le diaporama prend tout le cadre) ou de la rendre (faux) ; GFS la remontre de lui-même quand l'explorateur s'ouvre, que l'app se ferme et
//                            à chaque contexte, donc toute sortie du diaporama doit la rendre (`hide(false)`), en gardant sa propre sortie (Échap). Faux, sans rien envoyer, seule ou si `masked` n'est pas un booléen.
const GfsBar = (function () {
  const SIDES = ['left', 'top', 'right', 'bottom'];
  const listeners = new Set();
  let state = null;   // { edge, depth, zone: { x, y, width, height } } ou null, comme GfsLink.bar()

  function mirror() {
    const root = document.documentElement;
    if (state) root.setAttribute('data-gfs-bar', state.edge); else root.removeAttribute('data-gfs-bar');
    const zone = state ? state.zone : { x: 0, y: 0, width: 0, height: 0 };
    const px = value => value + 'px';
    root.style.setProperty('--gfs-bar-x', px(zone.x));
    root.style.setProperty('--gfs-bar-y', px(zone.y));
    root.style.setProperty('--gfs-bar-width', px(zone.width));
    root.style.setProperty('--gfs-bar-height', px(zone.height));
    SIDES.forEach(side => root.style.setProperty('--gfs-bar-inset-' + side, px(state && state.edge === side ? state.depth : 0)));
  }

  function take(next) {
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    mirror();
    listeners.forEach((fn) => { try { fn(snapshot()); } catch (e) { console.warn('[GfsBar] abonné en échec', e); } });
  }

  const snapshot = () => (state === null ? null : { edge: state.edge, depth: state.depth, zone: Object.assign({}, state.zone) });
  const edge = () => (state === null ? null : state.edge);
  const zone = () => (state === null ? null : Object.assign({}, state.zone));

  function overlaps(rect) {
    if (state === null || !rect) return false;
    const area = state.zone;
    return area.width > 0 && area.height > 0 && rect.left < area.x + area.width && rect.right > area.x && rect.top < area.y + area.height && rect.bottom > area.y;
  }

  function limits(rect) {
    const room = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    if (state === null || !rect || !state.zone.width || !state.zone.height) return room;
    const area = state.zone;
    const alongVertical = state.edge === 'left' || state.edge === 'right';
    // Le long du bord : une barre à gauche ou à droite ferme sa bande aux composants à la hauteur de la zone, une barre en haut ou en bas à sa largeur.
    const crossed = alongVertical ? rect.top < area.y + area.height && rect.bottom > area.y : rect.left < area.x + area.width && rect.right > area.x;
    if (!crossed) return room;
    if (state.edge === 'left') room.left = area.x + area.width;
    else if (state.edge === 'top') room.top = area.y + area.height;
    else if (state.edge === 'right') room.right = area.x;
    else room.bottom = area.y;
    return room;
  }

  function apart(rect) {
    if (!overlaps(rect)) return { dx: 0, dy: 0 };
    const area = state.zone;
    if (state.edge === 'left') return { dx: area.x + area.width - rect.left, dy: 0 };
    if (state.edge === 'right') return { dx: area.x - rect.right, dy: 0 };
    if (state.edge === 'top') return { dx: 0, dy: area.y + area.height - rect.top };
    return { dx: 0, dy: area.y - rect.bottom };
  }

  // `apart`, côté par côté : ce que cède un composant qui longe le bord de la barre (la bande des diapositives, le volet « Importer »)
  // ou qui recule devant elle (la pastille du zoom). Un seul des quatre côtés est non nul.
  function bite(rect) {
    const gap = apart(rect);
    return { left: Math.max(gap.dx, 0), top: Math.max(gap.dy, 0), right: Math.max(-gap.dx, 0), bottom: Math.max(-gap.dy, 0) };
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  const hide = masked => GfsLink.hideBar(masked);

  mirror();
  // Le contexte donne la barre d'à présent ; les événements `barre` donnent la suite. Le contexte n'a rappelé personne côté GfsLink (le départ lit `bar()`), c'est donc ici que ses abonnés l'apprennent.
  GfsLink.ready.then(() => take(GfsLink.bar()));
  GfsLink.onBar(next => take(next));

  return { edge, zone, overlaps, limits, apart, bite, onChange, hide };
})();
