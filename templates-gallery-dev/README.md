# Modèles de test et de démonstration

Catalogue **séparé** de `templates-gallery/`, chargé en plus de celui-ci par
`js/template-gallery.js` **seulement quand l'adresse du widget contient `?dev`**
(`https://lombre33.github.io/publipostageGrist/?dev`). Sans `?dev`, la galerie
ne lit pas ce dossier, même publié : aucun utilisateur ne voit ces modèles.

Il contient les modèles qui servent au développement et au protocole de test
manuel (cf. `dev-tests/PROTOCOLE_TEST_MANUEL.md`), pas à un utilisateur final :

- `test-mise-en-page` — texte, titres, listes, notes de bas de page
- `test-images-tableaux` — images, tableaux, zones 2 colonnes
- `vitrine-fonctionnalites` — document de 4 pages exerçant tout l'éditeur
- `test-tables` — un modèle livré avec ses tables (`pack.json`, une capture) : sert à essayer « Créer avec ses tables », l'aperçu en captures,
  la question et le refus, à la main et par les essais `templatePack` et `templatePackMouse`

## Pourquoi un dossier à part

Le dossier reste publié, mais seul `?dev` le fait lire. Un déploiement qui
**ne publie pas ce dossier** reste aussi un cas normal :
`js/template-gallery.js` traite l'absence de
`templates-gallery-dev/manifest.json` comme telle (message `console.info`,
pas d'erreur) et la galerie n'affiche que les modèles de `templates-gallery/`.
