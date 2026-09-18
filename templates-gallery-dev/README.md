# Modèles de test et de démonstration

Catalogue **séparé** de `templates-gallery/`, chargé en plus de celui-ci par
`js/template-gallery.js` quand ce dossier est présent.

Il contient les modèles qui servent au développement et au protocole de test
manuel (cf. `dev-tests/PROTOCOLE_TEST_MANUEL.md`), pas à un utilisateur final :

- `test-mise-en-page` — texte, titres, listes, notes de bas de page
- `test-images-tableaux` — images, tableaux, zones 2 colonnes
- `vitrine-fonctionnalites` — document de 4 pages exerçant tout l'éditeur

## Pourquoi un dossier à part

Pour qu'un déploiement live puisse simplement **ne pas publier ce dossier** :
les trois modèles disparaissent alors de la galerie sans aucune modification de
code. `js/template-gallery.js` traite l'absence de
`templates-gallery-dev/manifest.json` comme un cas normal (message `console.info`,
pas d'erreur) et la galerie n'affiche que les modèles de `templates-gallery/`.

Concrètement, sur le dépôt de la version live, il suffit d'exclure
`templates-gallery-dev/` de ce qui est poussé.
