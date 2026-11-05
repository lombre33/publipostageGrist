# Captures du README public

Ces scripts refont les 17 images de `../public/screenshots/` (le widget autonome, sans Grist Factory Suite). Rien n'est dessiné ni retouché : c'est le vrai `index.html` du dépôt, avec le faux Grist de `dev-tests/grist-stub.js`, piloté à la vraie souris et au vrai clavier. Rien n'est écrit dans le dépôt en dehors de ces images.

## Refaire les images

```bash
# une fois : le miroir hors ligne des bibliothèques (1 à 2 minutes)
bash dev-tests/offline-deps.sh
# puis
bash outils/depot-propre/captures/lancer-tout.sh
```

- Les images sortent dans `outils/depot-propre/public/screenshots/` (ou dans le dossier donné en argument) ; `publier.sh` les pose dans `screenshots/` du dépôt public. Les images brutes des scènes sont dans `captures/out/` (ignoré par git).
- `REPO_DIR` : le dépôt à photographier (par défaut, celui de ces scripts). Les images dépendent de son état : à refaire dès que l'éditeur change.
- Il faut Node, Playwright avec Chromium (`/opt/node22/lib/node_modules/playwright`, sinon le `playwright` que Node trouve) et ImageMagick (`convert`).
- Les scènes tournent l'une après l'autre : jamais deux navigateurs en même temps, les captures dépendent des délais. Compter quelques minutes en tout.
- Une scène seule : `node s09-recherche.mjs` (avec `REPO_DIR` et `OUT_DIR` si besoin). Son image brute porte le nom de la table ci-dessous.

## Ce que règle `kit.mjs`

Un widget à 1280 px de large (barre d'outils sur deux rangées, comme sur un grand panneau), échelle ×2, thème clair, français, police de l'interface forcée à Roboto, horloge figée au 4 novembre 2026 à 9 h (les dates des documents sont stables), souris laissée dans la marge pour qu'aucun survol ne reste, message d'état remis à « Widget prêt. ». Jamais `?dev` (il ajoute des modèles de test à la galerie). Les bibliothèques viennent du miroir hors ligne de `dev-tests/`. Données fictives (Atelier Lumière, Camille Martin, Maison Berthier & Associés).

## Les scènes

| Script | Image brute | Image finale |
|---|---|---|
| `s01-hero.mjs` | `h1-edition-…`, `h2-lecture-…` | 01, 02 |
| `s02-galerie.mjs` | `g-galerie-grille` (recadrée sous les puces de catégories), `g-galerie-top` (fenêtre entière, non publiée) | 03 |
| `s03-alignement.mjs` | `b1` (menu Alignement, non publié), `b2` (menu « Aa »), `b3`, `b3b` | 11, 12, 13 |
| `s04-conditions.mjs` | `c2-condition-groupe` | 30 |
| `s05-versions.mjs` | `v1-versions` | 42 |
| `s06-tableau.mjs` | `t3-tableau-bordures-crop` | 20 |
| `s07-exports.mjs` | `e2-type-export` | 50 |
| `s08-assemblage.mjs` | `a2-assemblage` | 51 |
| `s09-recherche.mjs` | `r1-recherche` | 60 |
| `s10-boucle.mjs` | `l4-boucle` (deux captures empilées) | 31 |
| `s11-lecture.mjs` | `m1-mode-lecture`, `m2-lecture-epuree` | 70, 71 |
| `s12-macro.mjs` | `k0b-macro-resume`, `k3-macro-lecture` | 40, 41 |

Chaque scène écrit aussi la capture pleine fenêtre (`…-plein`) de ses étapes : utile pour recadrer autrement. `s07` prend aussi le menu du bouton Exporter (`e4-exporter`), laissé de côté parce qu'il montre les lignes « Ranger dans GFS ».

## Ce que les images montrent, et ce qu'elles ne montrent pas

Le widget autonome seulement : aucune image de présentation, de graphique, d'écriture en direct ni de lecture de PDF. Trois traces de Grist Factory Suite restent pourtant visibles dans le vrai widget (non retouchées) : les lignes « PowerPoint (bêta) » et « Excel » grisées du menu « Type d'export » (50), le bouton « Objets » grisé de la barre d'outils d'un document (01), et la puce « Présentation » de la galerie, que le recadrage de 03 laisse hors de l'image.

## Pièges rencontrés

- Dans la fenêtre « Assemblage avant impression » (et celle des paragraphes), Entrée valide la fenêtre : pour quitter un champ, cliquer sur le titre.
- Le faux Grist n'a pas toutes les colonnes de la table des modèles : la scène des macro-modèles pose `TypeModele` avant le démarrage pour que le widget ne les migre pas, puis choisit le modèle par la liste (`#template-select`), comme le ferait un clic.
- Un macro-modèle par défaut ne s'ouvre pas tout seul au démarrage.
- Le zoom de la lecture se règle au vrai clavier (Ctrl + moins) : la pastille de zoom dit « −+Ajuster50 % », d'où l'expression `(\d+)\s*%`.
- Le menu « Aa » reste ouvert tant que la souris est sur lui : les lignes se cliquent l'une après l'autre sans le quitter.
