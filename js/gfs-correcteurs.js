// Les correcteurs du navigateur coupés sur la page de l'app quand GFS le dit (consigne GFS 068, contrats de GFS 5.2 point 13, guide des apps règle 21, faits vérifiés de GFS 104). Un correcteur du navigateur (LanguageTool) juge
// chaque cadre d'après sa propre adresse : son interrupteur « pour ce site » ne coupe rien dans le cadre de cette app, et un gros document, ou un gros diaporama de Slides+, le fait ramer. GFS ne peut pas toucher au texte de l'app
// (cadre isolé) : la personne coupe par le bouton « LanguageTool » de sa barre (le réglage du même nom, dans « Réglages » de GFS, le met dans la barre), GFS le dit (`contexte.correcteurs`, l'événement `correcteurs`, que
// js/gfs-link.js lit par `normalizeCorrecteurs` du kit) et ce fichier pose, sur chaque zone de texte de la page, la marque `data-lt-active="false"` que LanguageTool respecte, à chaud et sans recharger le cadre :
// `createCorrecteurs` du kit (kit/js/correcteurs-pose.js, par la carte d'importation de index.html) marque chaque `textarea`, chaque `input` de texte et chaque `contenteditable` de la page (jamais un conteneur, jamais un mot de
// passe), y compris ceux qui naissent après (une fenêtre, un champ, l'extension `diapositives` chargée à la demande, avec ses notes) par un MutationObserver qui n'existe que tant que « coupé » est vrai, et retire ses marques, et
// seulement elles, quand GFS dit « pas coupé ».
// L'app n'a qu'une racine éditable pour ses trois modes : js/editor.js bâtit UN TipTap sur `#editor-container` pour le document, la grille et la présentation de Slides+ ; js/field-editor.js en bâtit d'autres pour les champs
// (e-mail, nom de fichier) : rien à écrire par mode, rien dans une extension. L'app ne pose aucune marque de sa propre initiative, ne retire jamais celle du kit et n'a ni bouton ni réglage de plus : le bouton est celui de GFS.
// Il ne prend QUE le module de pose du kit, jamais `kit/js/correcteurs.js` (`Correcteurs.start()`) : celui-ci démarrerait le lien du kit à côté de celui de l'app, et deux liens dans un même cadre numérotent chacun leurs appels
// depuis 1 et se prendraient les réponses (comme pour l'ambiance, js/gfs-ambiance.js). Le lien donné à `createCorrecteurs` est donc `GfsLink` (`correcteurs()`, `onCorrecteurs(fn)`, `ready`).
//   - Hébergée (adresse avec `gfs=`) seulement : seule, ou si GFS ne dit rien, rien n'est chargé, rien n'est posé et rien n'est dit dans la console : les correcteurs restent comme le navigateur les fait.
//   - Le module de pose ne se charge pas (le dépôt de l'app sans son kit, un réseau qui le coupe) : l'app ne coupe rien et le dit une fois dans la console.
//   GfsCorrecteurs.ready     résolue (jamais rejetée) quand la pose a démarré et posé la marque du contexte, ou qu'elle ne démarre pas (seule, module absent) ; l'app n'a pas à l'attendre pour s'afficher
//   GfsCorrecteurs.active()  vrai quand la pose tourne (hébergée, module chargé)
const GfsCorrecteurs = (function () {
  let running = null;

  const active = () => running !== null;

  // Le module de pose du kit se charge dès que ce fichier s'exécute, au départ de l'app (js/gfs-link.js charge le lecteur du message au même instant) ; `start()` pose tout de suite ce que le lien sait, puis suit
  // `onCorrecteurs`. `ready` du kit se règle quand le contexte de GFS est arrivé et que la marque est posée.
  const ready = !GfsLink.hosted ? Promise.resolve() : import('kit/correcteurs-pose')
    .then((module) => {
      running = module.createCorrecteurs({ link: GfsLink }).start();
      return running.ready;
    })
    .catch(e => console.warn('[GfsCorrecteurs] la coupure des correcteurs ne démarre pas : l\'app ne coupe rien', e))
    .then(() => undefined);

  return { ready, active };
})();
