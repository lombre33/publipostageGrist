// Scénarios de test de fidélité éditeur <-> PDF (dev-tests/README.md).
// Chargé via eval() dans la console (cf. README) : définit window.FidelityScenarios.
(function () {
  const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non " +
    "risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies " +
    "sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper " +
    "congue, euismod non, mi. Proin porttitor, orci nec nonummy molestie, enim est " +
    "eleifend mi, non fermentum diam nisl sit amet erat.";

  const LOREM_LONG = LOREM + " Duis semper. Duis arcu massa, scelerisque vitae, " +
    "consequat in, pretium a, enim. Pellentesque congue. Ut in risus volutpat libero " +
    "pharetra tempor. Cras vestibulum bibendum augue. Praesent egestas leo in pede. " +
    "Praesent blandit odio eu enim. Pellentesque sed dui ut augue blandit sodales.";

  // Petite image locale (pas juste 1x1 transparent) : quatre quadrants de couleur,
  // pour repérer immédiatement au coup d'oeil un recadrage/une déformation entre
  // l'éditeur et le PDF (contrairement à un pixel unique étiré, un décalage de
  // recadrage se verrait ici comme un quadrant coupé au mauvais endroit).
  // Générée une fois via canvas 40x30, 2x2 quadrants rouge/vert/bleu/jaune.
  const LOCAL_IMAGE_DATAURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAYAAABe3VzdAAAAbElEQVR4AezSsQmAMBCF4SM7Caa2sHRFR7B2H1tXiCsI/wVC+AOvy0Hy3StPXVpmtnNvmSkx+PGBdEEKKkgF6LwdVJAK0Hk7OL9gPa7IzL2+kRk7OH8H6Q97z9tBKqyggv8E+t2yg9RWQSr4AQAA///YQLTdAAAABklEQVQDAAx4l7kq6/rLAAAAAElFTkSuQmCC';

  // Hôte CORS-permissif réel (Access-Control-Allow-Origin: *), stable via seed.
  const EXTERNAL_IMAGE_URL = 'https://picsum.photos/seed/publipostage-fidelity/300/200';

  function scenario(opts) {
    return Object.assign({
      heading: null,
      align: 'left',
      layer: 'normal',
      imageSrc: LOCAL_IMAGE_DATAURI,
      text: LOREM,
    }, opts);
  }

  window.FidelityScenarios = {
    baseline_left_normal: scenario({
      id: 'baseline_left_normal',
      description: "Paragraphe aligné à gauche, image en flux normal (pas de calque) — cas de référence.",
      align: 'left', layer: 'normal',
    }),
    left_behind: scenario({
      id: 'left_behind',
      description: "Paragraphe aligné à gauche, image DERRIÈRE le texte.",
      align: 'left', layer: 'behind',
    }),
    left_front: scenario({
      id: 'left_front',
      description: "Paragraphe aligné à gauche, image DEVANT le texte.",
      align: 'left', layer: 'front',
    }),
    centered_behind: scenario({
      id: 'centered_behind',
      description: "Paragraphe CENTRÉ, image derrière le texte, avec un titre au-dessus (cas exact rapporté par l'utilisateur).",
      heading: 'celle là derrière le texte',
      align: 'center', layer: 'behind',
    }),
    justified_behind: scenario({
      id: 'justified_behind',
      description: "Paragraphe JUSTIFIÉ, image derrière le texte.",
      align: 'justify', layer: 'behind',
    }),
    right_front: scenario({
      id: 'right_front',
      description: "Paragraphe aligné à DROITE, image devant le texte.",
      align: 'right', layer: 'front',
    }),
    long_paragraph_behind: scenario({
      id: 'long_paragraph_behind',
      description: "Paragraphe LONG (8+ lignes) aligné à gauche, image derrière le texte, avec titre au-dessus — vérifie la couverture jusqu'à la dernière ligne.",
      heading: 'Titre du document',
      align: 'left', layer: 'behind', text: LOREM_LONG,
    }),
    external_image_behind: scenario({
      id: 'external_image_behind',
      description: "Paragraphe aligné à gauche, image DERRIÈRE le texte chargée depuis une URL externe (teste inlineEditorImagesAsDataUri, pas juste une image déjà en data:URI).",
      align: 'left', layer: 'behind', imageSrc: EXTERNAL_IMAGE_URL,
    }),
    two_paragraphs_before: scenario({
      id: 'two_paragraphs_before',
      description: "Titre H2 + un paragraphe normal AVANT le paragraphe porteur de l'image derrière le texte — vérifie la dérive cumulative du contenu précédent.",
      heading: '<h2>Un grand titre H2</h2><p>Premier paragraphe normal, assez long pour prendre deux lignes, afin de simuler un vrai document avec plusieurs blocs avant celui qui porte l\'image en calque.</p>',
      headingIsHtml: true,
      align: 'left', layer: 'behind',
    }),
  };

  window.FidelityScenarios._consts = { LOREM, LOREM_LONG, LOCAL_IMAGE_DATAURI, EXTERNAL_IMAGE_URL };
})();
