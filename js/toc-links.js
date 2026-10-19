// Les lignes d'un sommaire sont des liens : un clic amène le titre qu'elles nomment en haut de la zone visible, dans l'aperçu du sommaire de l'éditeur
// (js/editor-nodes.js) comme dans la Lecture (js/reader-mode.js). Ce module ne connaît que ce geste. Les exports écrivent chacun leurs liens : le PDF une
// destination par titre (js/pdf-export.js), le Word un signet caché par titre (js/docx-export.js), le HTML et le Markdown une cible par titre.
const TocLinks = (function () {
  // Le titre s'arrête un peu sous le bord haut de la zone visible, il ne le touche pas.
  const MARGIN_PX = 12;

  // La zone qui défile autour de `el` : #editor-container ou #reader-container en pratique, mais toute zone à défilement vertical qui déborde convient.
  function scrollerOf(el) {
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
  }

  // Amène `heading` en haut de la zone visible (la zone s'arrête là où le document finit : un titre tout en bas reste en bas). Jamais scrollIntoView : il fait
  // défiler aussi les ancêtres que la personne ne fait pas défiler (le panneau du widget, la fenêtre), ce qui décalerait la barre d'outils. Les mesures sont celles de
  // l'écran, que la feuille soit réduite ou agrandie (js/page-zoom.js) : la différence de deux positions d'écran est le défilement à faire.
  function reveal(heading) {
    const scroller = scrollerOf(heading);
    if (!scroller) return false;
    scroller.scrollTop += heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - MARGIN_PX;
    return true;
  }

  // La ligne d'un sommaire, faite lien. `find` rend, à chaque clic, le titre que la ligne nomme (ou rien : il a disparu) ; `onGo(titre)` suit le défilement (l'éditeur y
  // pose le curseur). `focusable` : un arrêt de Tab et Entrée ou Espace pour la suivre (la Lecture ; pas l'éditeur, où Tab indente le texte).
  function link(text, find, options) {
    const { focusable, onGo } = options || {};
    const a = Dom.el('a', 'toc-link', text);
    a.setAttribute('role', 'link');
    if (focusable) a.tabIndex = 0;
    const go = () => {
      const heading = find();
      if (!heading || !heading.isConnected) return;
      reveal(heading);
      if (onGo) onGo(heading);
    };
    a.addEventListener('click', event => { event.preventDefault(); go(); });
    if (focusable) a.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
    return a;
  }

  return { link, reveal };
})();
