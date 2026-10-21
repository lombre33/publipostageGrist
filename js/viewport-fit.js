// Chrome de l'application tenu dans la fenêtre, y compris dans un petit panneau Grist (~600-700 x 400). Trois mécanismes câblés une seule fois par
// délégation sur `document` : tout futur bouton [data-tip] ou popup en hérite.
//  1. Info-bulles [data-tip] de la barre du haut (.bar-row, #v2-toolbar) : centrées sous leur bouton, celles d'un bouton en bout de ligne sortaient
//     de la fenêtre (et rendaient la page défilable latéralement). Décalées au survol ou au focus, juste assez pour tenir (variable CSS
//     --pp-tip-shift, lue par le `left` de l'info-bulle) et, chez GFS, pour ne pas passer sous sa barre (même variable, et --pp-tip-drop, lue par son `top`).
//  2. Info-bulle « collée » : un bouton qui garde le focus après un clic souris, ou le reprend à la fermeture de sa fenêtre, passe en :focus-visible
//     à la touche suivante (Échap) et son info-bulle restait affichée, souris partie. Classe `pp-tip-pointer` sur <html> tant que la souris est la
//     dernière modalité utilisée (retirée par Tab) : la règle CSS associée ne cache que l'info-bulle de focus, jamais celle du survol.
//  3. placePopup() : popups rattachés à document.body (#Variable, commentaires, image depuis une variable) placés sous leur ancre (ou au-dessus s'il
//     y a plus de place), décalés et plafonnés (défilement interne) pour ne pas sortir de la fenêtre, et remontés au-dessus des couches déjà ouvertes
//     (Layers.raise). `options.over` : la fenêtre d'où le popup s'ouvre, devant laquelle il passe.
// Plus le coin « info » (#status-msg), tronqué à largeur fixe par css/toolbar-v2.css : message entier en infobulle native quand il est coupé.
const ViewportFit = (function () {
  const TIP_HOSTS = '.bar-row [data-tip], #v2-toolbar [data-tip]';
  const EDGE = 6; // marge minimale entre une info-bulle ou un popup et le bord de la fenêtre

  function fitTooltip(host) {
    // Le décalage vers le bas que la barre de GFS a demandé la fois d'avant est rendu avant de mesurer : `top` se lit sur la règle CSS seule.
    host.style.removeProperty('--pp-tip-drop');
    const tip = getComputedStyle(host, '::after');
    const width = parseFloat(tip.width) + (parseFloat(tip.paddingLeft) || 0) + (parseFloat(tip.paddingRight) || 0);
    if (!(width > 0)) return; // largeur non résolue (navigateur qui renvoie 'auto') : info-bulle laissée centrée, comme avant
    const rect = host.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const left = rect.left + rect.width / 2 - width / 2;
    let shift = 0;
    if (left + width > viewportWidth - EDGE) shift = viewportWidth - EDGE - (left + width);
    if (left + shift < EDGE) shift = EDGE - left;
    // La barre de GFS (js/gfs-bar.js, consigne GFS 025) : à sa droite ou à sa gauche, l'info-bulle d'un bouton à la hauteur de la zone se décale pour ne pas passer
    // dessous ; sous une barre en haut elle descend du peu qui la sépare de la zone. `top` et la hauteur viennent du style calculé, jamais d'un chiffre ici.
    const top = rect.top + host.clientTop + (parseFloat(tip.top) || rect.height);
    const height = (parseFloat(tip.height) || 0) + (parseFloat(tip.paddingTop) || 0) + (parseFloat(tip.paddingBottom) || 0);
    const room = GfsBar.limits({ left: left + shift, right: left + shift + width, top, bottom: top + height });
    let lowest = room.left > 0 ? room.left : -Infinity;
    let highest = room.right < window.innerWidth ? room.right : Infinity;
    // Un menu qui défile à cause de la barre (`.v2-hover-flyout-capped`, js/editor-core.js) rogne l'info-bulle de ses lignes : elle reste dans sa boîte.
    const clip = host.closest('.v2-hover-flyout-capped');
    if (clip) {
      const box = clip.getBoundingClientRect();
      lowest = Math.max(lowest, box.left + clip.clientLeft);
      highest = Math.min(highest, box.left + clip.clientLeft + clip.clientWidth);
    }
    if (left + shift < lowest) shift = Math.ceil(lowest - left);
    else if (left + shift + width > highest) shift = Math.floor(highest - width - left);
    const drop = Math.ceil(Math.max(0, GfsBar.apart({ left: left + shift, right: left + shift + width, top, bottom: top + height }).dy));
    if (shift) host.style.setProperty('--pp-tip-shift', Math.round(shift) + 'px');
    else host.style.removeProperty('--pp-tip-shift');
    if (drop) host.style.setProperty('--pp-tip-drop', drop + 'px');
  }

  function onTipHostEntered(event) {
    const host = event.target && event.target.closest && event.target.closest(TIP_HOSTS);
    if (host) fitTooltip(host);
  }
  document.addEventListener('mouseover', onTipHostEntered);
  document.addEventListener('focusin', onTipHostEntered);
  // isTrusted : un vrai geste seulement - les scénarios dev-tests/ simulent leurs clics par dispatchEvent et vérifient ensuite l'info-bulle de focus.
  document.addEventListener('pointerdown', event => { if (event.isTrusted) document.documentElement.classList.add('pp-tip-pointer'); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Tab') document.documentElement.classList.remove('pp-tip-pointer'); }, true);

  function wireStatusTitle() {
    const status = document.getElementById('status-msg');
    if (!status) return;
    status.addEventListener('mouseenter', () => { status.title = status.scrollWidth > status.clientWidth ? status.textContent : ''; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireStatusTitle);
  else wireStatusTitle();

  // `box` : élément position:absolute enfant de document.body, déjà affiché (sa taille réelle est mesurée ici, jamais estimée). `rect` : rectangle de
  // l'ancre en coordonnées fenêtre (getBoundingClientRect, ou le clientRect du curseur fourni par @tiptap/suggestion). max-height est remis à zéro à
  // chaque appel : un plafond posé pour une ancre basse ne doit pas rester sur le popup suivant.
  function placePopup(box, rect, options) {
    const gap = (options && options.gap) || 4;
    box.style.position = 'absolute';
    box.style.maxHeight = '';
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const roomBelow = viewportHeight - rect.bottom - gap - EDGE;
    const roomAbove = rect.top - gap - EDGE;
    let top;
    let cap = null;
    if (height <= roomBelow || roomBelow >= roomAbove) {
      top = rect.bottom + gap;
      if (height > roomBelow) cap = roomBelow;
    } else {
      if (height > roomAbove) cap = roomAbove;
      top = rect.top - gap - Math.min(height, roomAbove);
    }
    if (cap != null) {
      // En box-sizing content-box (#v2-comment-popup : 10px de padding, 1px de bordure), max-height ne borne que le contenu : padding et bordure en
      // sont retranchés, sinon le popup plafonné dépassait de 22px.
      const style = getComputedStyle(box);
      const chrome = style.boxSizing === 'border-box' ? 0
        : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      box.style.maxHeight = Math.max(40, Math.floor(cap - chrome)) + 'px';
      if (style.overflowY === 'visible') box.style.overflowY = 'auto';
    }
    const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - EDGE - width));
    box.style.left = Math.round(left + window.scrollX) + 'px';
    box.style.top = Math.round(Math.max(EDGE, top) + window.scrollY) + 'px';
    // Le popup qu'on vient de placer est celui qu'on utilise : au-dessus de ce qui est ouvert (barre flottante du tableau, autre menu), et devant la
    // fenêtre dont il sort quand il vient du champ d'une fenêtre (options.over).
    Layers.raise(box, options && options.over);
  }

  return { placePopup };
})();
