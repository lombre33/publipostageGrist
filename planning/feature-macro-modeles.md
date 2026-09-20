# Macro modèles — assembler plusieurs modèles en un seul document

**Cadrage demandé par Antoine le 2026-09-19**, en même temps que le rangement/tri des modèles (traité
dans un autre fil, cf. `planning/feature-misc-editor-and-output.md#dossiersfavoris-galerie-de-modèles`).
Ce document est de la réflexion/conception, **rien n'est implémenté**.

## Le besoin, dans les mots d'Antoine

> j'aimerai que l'on trouve un moyen de créer des sorte macro modèle dans une interface de création
> dédiée, mon cas d'usage c'est de fusionner plusieurs modèle en mode lecture et au moment de l'export.
> par exemple un première modèle qui sera la première page, et après les annexes ca sera différents
> modèles en fonction de la ligne et l'information sera défini en fonction d'une valeur de la ligne

Décomposé : un modèle "page de garde" fixe, suivi d'annexes dont (a) le CHOIX du modèle et (b) le
CONTENU dépendent chacun d'une ligne de données — typiquement une ligne d'une table liée (une annexe
par ligne, ex. une pièce par dossier, une prestation par ligne de commande).

## Ce n'est pas un chantier isolé — trois documents de cadrage existants s'y assemblent

Ce besoin n'est pas nouveau dans la réflexion du projet, il n'avait juste pas encore été demandé
explicitement :

- **`feature-misc-editor-and-output.md#fusion-de-plusieurs-modèles`** — la fusion simple (concaténer
  plusieurs modèles en un seul export) était déjà cadrée, avec une recommandation validée par le code
  réel (voir plus bas) : concaténer le HTML **après résolution**, réutiliser tel quel le pipeline de
  pagination existant.
- **`feature-conditional-content.md` §2 (choix de modèle conditionnel) et §3 (fusion conditionnelle)** —
  cadrait déjà "choisir un modèle selon une valeur Grist" et notait explicitement que la fusion
  conditionnelle "n'est pas une 3ᵉ fonctionnalité isolée" mais la combinaison de la fusion simple et du
  choix conditionnel. C'est exactement ce qu'Antoine demande aujourd'hui, avec en plus la demande d'une
  **interface de création dédiée** (pas seulement un mécanisme).
- **`feature-table-rows-from-linked-table.md`** — la relation "quelles lignes de la table Annexes
  appartiennent à CETTE ligne" est déjà résolue par le mécanisme de liaison entre tables
  (`GristAPI.getLinkRule`/`Publipostage_LiensTables`, `js/grist-api.js:262-379`) : à réutiliser tel
  quel, ne rien réinventer.

## Vérification dans le code réel : pourquoi l'approche "concaténation HTML" tient

`js/main.js:546` et `:594` montrent que `PdfExport.exportCurrentRecord`/`DocxExport.exportCurrentRecord`
ne prennent qu'**un seul** bloc HTML, une seule ligne Grist courante, un seul `headerFooterData`, une
seule config de marges par export. `ReaderMode.preview()` est déjà le point d'entrée commun aux trois
sorties (lecture, PDF, DOCX — confirmé dans `README.md`/`AUDIT_CODE.md`). Conséquence pratique : résoudre
**chaque modèle du macro séparément** (contre sa propre ligne/table), concaténer les fragments HTML déjà
résolus, puis ne passer qu'**une fois** ce HTML concaténé dans le pipeline existant (pagination,
en-têtes/pieds, export) suffit — aucune refonte des modules d'export.

## Modèle de données proposé

Réutiliser `Publipostage_Modeles` plutôt qu'une nouvelle table (préférence d'Antoine, déjà appliquée
pour le mode email avec `TypeModele`) :

- Nouvelle valeur `TypeModele = 'macro'`.
- La colonne `Contenu` (normalement le HTML TipTap) stocke à la place, pour ce type, un JSON décrivant
  les slots :

```json
{
  "slots": [
    { "type": "fixed", "modeleId": 12 },
    {
      "type": "repeated",
      "linkedTable": "Annexes",
      "rules": [
        { "column": "Type", "operator": "=", "value": "Devis", "modeleId": 15 },
        { "column": "Type", "operator": "=", "value": "Photo", "modeleId": 16 }
      ],
      "defaultModeleId": 17,
      "onNoMatch": "skip"
    }
  ]
}
```

- `HeaderFooter`/`Margins` du macro lui-même (colonnes déjà existantes) décrivent l'en-tête/pied/marges
  du document fusionné dans son ensemble — cf. Décision 2 ci-dessous.

## Interface de création dédiée (esquisse, à maquetter une fois la direction validée)

- Nouvel écran de configuration (pas l'éditeur TipTap : un macro-modèle n'a pas de contenu texte propre,
  seulement une composition de modèles existants — donc pas de conflit avec le principe "un seul
  éditeur partagé" de la charte UI/UX, rien n'est édité en RTE ici).
- **Page de garde** : un simple sélecteur du modèle existant à utiliser.
- **Annexes** : sélection de la table liée (réutilise la modale de liaison déjà existante), puis une
  liste de règles (colonne / opérateur / valeur → modèle cible), réordonnables — la première règle qui
  correspond gagne, comme une cascade de conditions. Modèle par défaut optionnel si aucune règle ne
  correspond.
- Nom du macro-modèle : même champ que pour un modèle normal, apparaît dans le **même sélecteur** que
  les modèles normaux (avec une puce/icône distinctive — on ajoute un repère visuel, on ne duplique pas
  le composant, cohérent avec la charte).
- Pas d'aperçu pixel-perfect dans cet écran : c'est de la configuration, pas de l'édition. Un résumé
  textuel suffit ("Page de garde : [Modèle X] — Annexes : 1 ligne de [Annexes] par règle, N règles
  configurées"). Le vrai aperçu existe déjà : le mode Lecture, une fois le macro-modèle sélectionné.

## Résolution en mode Lecture / export

1. Le macro-modèle est sélectionné dans le même sélecteur que les modèles normaux.
2. Slot fixe → `ReaderMode.preview(html, tableId courant, record courant)`, identique à un modèle
   normal aujourd'hui.
3. Slot répété → résoudre la règle de liaison (réutilise `GristAPI.getLinkRule`) pour obtenir les
   lignes de la table liée rattachées à la ligne courante ; pour CHAQUE ligne trouvée, évaluer les
   règles dans l'ordre, choisir le modèle cible (ou le défaut, ou ignorer la ligne), puis
   `ReaderMode.preview(htmlDuModèleCible, tableLiée, cetteLigne)`.
4. Concaténer tous les fragments HTML résolus avec un saut de page entre chacun (même marqueur que
   `.page-break-marker`, déjà géré par la pagination).
5. Passer le HTML concaténé une seule fois dans le pipeline de pagination/export existant — aucun
   changement dans `pdf-export.js`/`docx-export.js` eux-mêmes.
6. Le nom de fichier reste résolu contre la ligne **courante** uniquement (comme aujourd'hui), jamais
   contre une ligne d'annexe.

## Risques et questions ouvertes

- **Tranché par Antoine le 2026-09-20** : en-tête/pied/marges — **un seul jeu de réglages pour tout le
  document fusionné**, porté par le macro-modèle lui-même (colonnes `HeaderFooter`/`Margins` déjà
  existantes sur `Publipostage_Modeles`), appliqué à la page de garde ET à toutes les annexes. Pas de
  config par modèle assemblé à prévoir.
- **Hypothèse encore à confirmer** : chaque annexe correspond à une ligne d'une table liée, et c'est une
  valeur de CETTE ligne qui choisit son modèle — c'est ma lecture de sa demande, l'alternative (une
  seule valeur sur la ligne courante qui sélectionne une liste fixe de modèles) est possible aussi.

Questions plus mineures, tranchées ici par défaut raisonnable (à corriger si Antoine n'est pas d'accord) :

- Numérotation de page : continue sur tout le document fusionné (seule option cohérente si en-tête/pied
  partagé).
- Table liée non configurée ou vide pour un slot répété : aucune ligne trouvée = aucune annexe générée,
  silencieusement (même logique que pour un bloc répété vide, `feature-table-rows-from-linked-table.md`).
- DOCX : même architecture que le PDF (`ReaderMode.preview()` reste le point d'entrée commun), à
  vérifier empiriquement une fois codé.
- Un modèle utilisé comme annexe reste un modèle normal, modifiable indépendamment dans l'éditeur
  existant — le macro-modèle ne référence que des ID, aucune duplication de contenu.

## Plan de test (une fois implémenté)

Même motif que les autres fonctionnalités (`dev-tests/scenarios-*.js`) : un macro à 1 page de garde +
3 lignes d'annexes (2 règles différentes + 1 sans correspondance), vérifié en mode Lecture (fragments
dans le bon ordre, bonnes valeurs par ligne) et en export PDF (mêmes pages, sauts corrects, en-tête/pied
cohérents avec la décision retenue ci-dessus).
