// L'info-bulle posée près d'un élément de l'éditeur (un lien, une bulle de variable) : un seul endroit pour la créer et la placer, afin que toutes disent la même chose
// à la barre de GFS et au bord de l'écran. Elle ne sait rien de ce qu'elle montre ; chaque module écrit son contenu (toujours en texte, jamais en HTML) et l'ouvre.
//   EditorTip.create(className) -> l'élément (div role="tooltip", caché, au bout du <body>) ; sa classe porte le style (css/link-dialog.css, css/variable-tip.css)
//   EditorTip.place(tip, anchor) -> montre l'info-bulle et la pose sous l'ancre (au-dessus quand il n'y a pas la place), sans jamais sortir de l'écran ni passer sous la barre de GFS
const EditorTip = (function () {
  function create(className) {
    const tip = Dom.el('div', className);
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function place(tip, anchor) {
    tip.hidden = false;
    const rect = anchor.getClientRects()[0] || anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    // La barre de GFS (js/gfs-bar.js) : sous l'ancre, l'info-bulle s'arrête avant la zone (une barre en bas la fait passer au-dessus) ; sans barre, le bas du cadre.
    const under = GfsBar.limits({ left: rect.left, right: rect.left + tipRect.width, top: rect.bottom + 6, bottom: rect.bottom + 6 + tipRect.height });
    const below = rect.bottom + 6 + tipRect.height <= Math.min(window.innerHeight, under.bottom) - 4;
    tip.style.top = Math.max(4, below ? rect.bottom + 6 : rect.top - 6 - tipRect.height) + 'px';
    tip.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - tipRect.width - 4)) + 'px';
    ViewportFit.avoidBar(tip, rect); // ce que la barre recouvre encore (à sa gauche ou à sa droite, ou l'ancre tout en haut) : l'info-bulle glisse hors de la zone
  }

  return { create, place };
})();
