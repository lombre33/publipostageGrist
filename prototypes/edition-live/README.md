# Édition live — essai isolé, texte simple

Un petit éditeur de texte à plusieurs mains, comme un Gdoc : ce que l'un tape apparaît chez l'autre, avec son curseur et son nom.
**Rien du widget n'est utilisé ni modifié** (ni `index.html` de la racine, ni `js/`, ni `css/`) : c'est un dossier à part, qui a sa propre adresse
et que le dépôt public ne reprend pas (`prototypes/` est exclu de la publication).

Adresse : <https://lombre33.github.io/publipostageGrist/prototypes/edition-live/index.html>

## Comment ça marche

- **Éditeur** : TipTap 3, texte simple (des paragraphes, rien d'autre). **Yjs** fusionne les frappes simultanées de plusieurs personnes sans rien perdre ni écraser.
- **Tuyau** : une table Grist, rien d'autre (aucun serveur ni socket à nous). Chaque petit paquet de frappes devient une ligne de la table ; Grist prévient le widget
  quand sa table change ; le widget applique les lignes qu'il n'a pas encore vues. Une ligne par personne sert à la présence (nom, couleur, curseur).
- **Bouton « Édition live »** : éteint, ce qu'on tape reste chez soi ; rallumé, tout ce qui a été écrit pendant l'absence est envoyé et fusionné.
- **Chiffres** sous l'éditeur : délai de réception, durée d'une écriture, taille de la table.

## L'essayer sans Grist (30 secondes)

Ouvrir l'adresse dans **deux onglets du même navigateur** : ils partagent une table locale (IndexedDB) qui suit les mêmes règles que celle de Grist.
`?delay=300` ajoute 300 ms à chaque écriture et à chaque lecture pour sentir un réseau lent.

## L'essayer dans Grist

Même geste que pour Publipostage+, sur un **document de test** :

1. Ajouter une **table vide** (par exemple « Live »). Elle peut garder ses colonnes A, B, C.
2. Ajouter un **widget personnalisé** lié à cette table, puis « URL personnalisée » : coller l'adresse ci-dessus.
3. Dans le panneau de droite, **Accepter** l'accès complet (le widget écrit dans la table).
4. La carte « Cette table n'est pas prête » apparaît : **Ajouter les colonnes** (`Doc`, `Client`, `Kind`, `Seq`, `Data`, `T` ; rien d'autre n'est touché).
5. La deuxième personne ouvre le même document (il lui faut le droit de modifier) : elle voit le même widget. Pour essayer seul : deux fenêtres côte à côte sur le même document.

## Réglages dans l'adresse

| Paramètre | Effet | Défaut |
|---|---|---|
| `name=Ana` | nom affiché au bout du curseur | retenu d'une fois sur l'autre, sinon tiré au hasard |
| `doc=essai2` | un autre texte dans la même table (repartir d'un texte vide sans toucher à la table) | `demo` |
| `flush=150` | millisecondes d'attente avant d'envoyer les frappes | 150 |
| `compactAt=60` | nombre de lignes à partir duquel un client regroupe la table | 60 |
| `delay=300` | démonstration locale seulement : latence ajoutée | 0 |
| `transport=local` | forcer la table locale même dans Grist | — |
| `language=fr` ou `en` | langue de l'écran | celle du navigateur |

## Lire les chiffres

- **Réception** : de l'heure de la première frappe de l'autre à l'instant où son texte est appliqué chez vous. L'heure de départ vient de **l'horloge de l'autre
  ordinateur** : entre deux machines, un écart d'horloge s'ajoute tel quel au chiffre. Entre deux fenêtres d'un même ordinateur, il est exact.
- **Écriture** : aller-retour jusqu'à Grist, mesuré avec une seule horloge (toujours fiable).
- **Table** : nombre de lignes, taille en Ko, et combien de fois le widget l'a relue.

## Ce qui a été mesuré, ce qui ne l'a pas été

Mesuré dans un **vrai Grist** (grist-static 0.1.6 : le client et le moteur de Grist, dans un navigateur, sans serveur), deux cadres sur une même table, envoi toutes les 50 ms :

| | Résultat |
|---|---|
| Une frappe vue dans l'autre cadre | médiane ≈ 90 ms (12 essais : 56 à 109 ms), avec la prévenance de Grist ; environ 125 ms de plus quand la table n'est pas celle de la section, relue toutes les 250 ms (mesure de GFS, consigne 012) |
| Écriture jusqu'au moteur de Grist | 21 à 37 ms |
| Relecture complète de la table par le widget (copie en mémoire du navigateur, sans réseau) | 4 ms à 7 lignes · 8 ms à 300 · 22 ms à 1 500 · 43 ms à 4 000 |
| Une frappe vue chez l'autre, selon la taille de la table | 88 ms à 7 lignes · 103 ms à 300 · 125 ms à 1 500 · 184 ms à 4 000 |
| Compaction | 36 lignes écrites pendant une rafale à deux → 2 lignes restantes |

Avec l'envoi toutes les 150 ms (réglage par défaut), compter jusqu'à 100 ms de plus.

**Non mesuré** : le réseau jusqu'à docs.getgrist.com (une écriture, puis la prévenance de l'autre navigateur : au moins un aller-retour chacune), plusieurs vrais
navigateurs ou comptes, un téléphone ou un réseau mobile, plus de deux personnes, les plafonds de l'offre Grist (taille du document, nombre d'appels).

## Limites connues

- Le widget relit **toute** la table à chaque changement (c'est la copie en mémoire dans la page Grist, pas le réseau : sur le réseau, Grist n'envoie aux autres
  navigateurs que le changement). La table se garde donc petite : au-delà de `compactAt` lignes, un client remplace les lignes déjà lues par une seule ligne d'état complet.
- L'historique des actions de Grist grossit d'environ une action par envoi pendant qu'on tape : **un document de test, à jeter après l'essai**.
- Ne pas supprimer de lignes à la main ni utiliser « Annuler » de Grist sur cette table : le widget le voit et republie son texte, qui revient donc.
  Pour repartir de zéro : fermer toutes les fenêtres, puis vider la table (ou changer `?doc=`).
- Garder les fenêtres visibles : un onglet en arrière-plan ralentit ses minuteries et fausse les délais.
- Le premier chargement prend environ 4 s (Yjs et TipTap viennent d'esm.sh, comme les bibliothèques du widget).
- Texte simple : ni mise en forme, ni image, ni tableau, ni commentaire. Ctrl+Z n'annule que ses propres frappes.
- Le document commence par un paragraphe vide, le même chez tout le monde : sans lui, deux personnes qui tapent en même temps dans un document vide obtenaient chacune
  leur premier paragraphe.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | la page (politique de sécurité du contenu, carte d'importation des bibliothèques) |
| `app.js` | l'éditeur, le bouton, les chiffres, la carte de préparation de la table |
| `live.js` | le moteur : lignes de mise à jour et de présence, regroupement, contrôle d'intégrité |
| `channels.js` | les deux tables : celle de Grist, et la table locale de démonstration |
| `test-edition-live.mjs` | 27 contrôles sans Grist (Chromium, deux à trois pages) : `node prototypes/edition-live/test-edition-live.mjs` (≈ 35 s, il faut le proxy pour esm.sh) |

Le même essai tourne dans un vrai Grist avec `labo-grist-reel/lab-edition-live.mjs` (22 contrôles et les mesures ci-dessus), dans les fichiers du projet.

## In English

A plain-text, Google-Docs-like live editor, fully isolated from the widget (own folder, own URL, not published to the public repository). TipTap + Yjs for the editing and
merging; a Grist table is the only transport (each batch of keystrokes is a row, one presence row per person). Try it without Grist by opening the URL in two tabs
(local IndexedDB table, `?delay=300` simulates a slow network), or in Grist: empty table → Custom widget → Custom URL → accept full access → "Add columns" (`Doc`, `Client`,
`Kind`, `Seq`, `Data`, `T`). Measured in a real Grist engine without network (grist-static): about 90 ms from keystroke to the other frame, with Grist's own change notification (about 125 ms more when the table is not the one of the widget's section, re-read every 250 ms); the network to the hosted
Grist server and real multi-user conditions are not measured. Use a throw-away document: Grist's action history grows while people type.
