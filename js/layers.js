// Ordre d'empilement des couches flottantes de l'interface : barres flottantes d'une sélection (tableau, image, bulle), menus et listes, popups, info-bulles. La règle d'Antoine
// (2026-10-01 : « le dernier menu qui s'ouvre doit toujours être au-dessus de l'existant ») est posée ICI, une fois, plutôt que menu par menu : le menu # s'ouvrait sous la barre du
// tableau parce que chaque couche avait son z-index en dur (barre 2000, menu # 1000, menus de la barre du haut 15, liste des modèles 40) sans aucun ordre entre elles.
//  - Les NIVEAUX sont fixes : des jetons CSS (--z-floating-toolbar < --z-menu < --z-tip, css/style.css), jamais un nombre en dur dans une feuille (codeHygiene le vérifie). Une barre
//    flottante est donc toujours sous un menu, un menu sous une info-bulle, et les trois sous les fenêtres (css/modal-base.css, 1990 et plus).
//  - DANS le niveau des menus et au-dessus, Layers.raise(el) met l'élément qui vient de s'ouvrir au-dessus de ceux qui le sont déjà : z-index en ligne = niveau + rang. Le niveau d'un
//    élément est celui que sa feuille de style lui donne (un seul endroit où le dire) ; la pile ne garde que les éléments encore affichés, elle ne grossit donc jamais.
//  - Le niveau des BARRES FLOTTANTES n'est pas rangé : un seul geste en ouvre souvent deux (cliquer une bulle dans une case de tableau ouvre la barre de la bulle ET celle du tableau,
//    dans l'ordre où le code les teste), et « la dernière ouverte au-dessus » mettrait celle du tableau sur celle de la bulle. Elles gardent l'ordre du DOM : la plus précise est créée
//    après la plus générale et reste dessus. Raise ne fait donc rien pour elles, et la barre d'une bulle ou d'une image reste lisible quand celle du tableau s'ouvre en dernier.
// À appeler à l'OUVERTURE d'une couche flottante (ou à chaque placement d'un popup en cours d'usage, comme la liste #), jamais à chaque recalage d'une barre déjà affichée : elle
// changerait de rang sans que rien ne s'ouvre. Script classique (pas type="module"), même convention de portée globale que EditorCore/ViewportFit.
const Layers = (function () {
  const WIDTH = 100; // largeur d'un niveau : le rang ne le dépasse jamais, deux niveaux ne se recouvrent donc pas
  const stacks = new Map(); // niveau -> éléments ouverts à ce niveau, du plus bas au plus haut
  const levels = new WeakMap(); // élément -> son niveau, lu une seule fois : le premier rang posé en ligne masquerait ensuite celui de la feuille de style
  let toolbarLevel; // niveau des barres flottantes (jeton --z-floating-toolbar de :root), lu une fois la feuille de style chargée

  function levelOf(el) {
    let level = levels.get(el);
    if (level === undefined) {
      level = parseInt(getComputedStyle(el).zIndex, 10);
      if (level > 0) levels.set(el, level);
    }
    return level;
  }
  function isShown(el) { return el.isConnected && el.getClientRects().length > 0; }
  function isToolbarLevel(level) {
    if (!(toolbarLevel > 0)) toolbarLevel = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-floating-toolbar'), 10);
    return level === toolbarLevel;
  }

  function raise(el) {
    if (!el || !el.isConnected) return;
    const level = levelOf(el);
    if (!(level > 0) || isToolbarLevel(level)) return; // aucun niveau en CSS, ou barres flottantes : rien à ordonner (ordre du DOM, voir plus haut)
    const stack = (stacks.get(level) || []).filter(other => other !== el && isShown(other));
    stack.push(el);
    stacks.set(level, stack);
    stack.forEach((member, rank) => { member.style.zIndex = String(level + Math.min(rank, WIDTH - 1)); });
  }

  return { raise };
})();
