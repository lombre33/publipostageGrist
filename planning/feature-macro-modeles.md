# Macro modèles — assembler plusieurs modèles en un seul document

**Cadrage demandé par Antoine le 2026-09-19**, en même temps que le rangement/tri des modèles (traité
dans un autre fil, cf. `planning/feature-misc-editor-and-output.md#dossiersfavoris-galerie-de-modèles`).
Ce document est de la réflexion/conception, **rien n'est implémenté**.

## Le besoin, dans les mots d'Antoine

> j'aimerai que l'on trouve un moyen de créer des sorte macro modèle dans une interface de création
> dédiée, mon cas d'usage c'est de fusionner plusieurs modèle en mode lecture et au moment de l'export.
> par exemple un première modèle qui sera la première page, et après les annexes ca sera différents
> modèles en fonction de la ligne et l'information sera défini en fonction d'une valeur de la ligne

Puis, correction du 2026-09-20 après une première lecture erronée de ce fil (cf. § suivant) :

> En faite ca serait la meme ligne qui produierait les informations pour les deux pdf sinon on ne
> pourra pas avoir un select by fonctionnel.

Décomposé : un modèle "page de garde" fixe, suivi d'une ou plusieurs annexes. **Une seule et même ligne
Grist courante** (celle que Grist fournit au widget) alimente à la fois la page de garde et toutes les
annexes ; ce qui varie d'une annexe à l'autre, c'est le MODÈLE choisi, décidé par une ou plusieurs
valeurs **de cette même ligne** — pas une ligne différente par annexe.

## Pourquoi "la même ligne" — et pas une ligne par annexe depuis une table liée

Première piste explorée (2026-09-19) puis écartée par Antoine : faire venir chaque annexe d'une ligne
distincte d'une table liée (à la manière d'une ligne de facture), en réutilisant le mécanisme de
`feature-table-rows-from-linked-table.md`. Antoine l'a corrigée : ça casserait le fonctionnement du
**Select By** de Grist.

Raison technique, vérifiée dans le code (`js/grist-api.js:44-83`) : le widget reçoit sa ligne courante
via **un seul** abonnement `grist.onRecord(record, mappings)`, où `mappings.tableId` vient du Select By
configuré côté Grist (quelle table/vue le widget suit). Il n'existe qu'**une** ligne "courante" à la
fois, sur **une** table à la fois — c'est la même ligne que celle qui sert déjà à résoudre les
`#Variable` du modèle normal aujourd'hui. Construire les annexes à partir des lignes d'une AUTRE table
(même liée) reviendrait à leur donner une ligne "courante" différente de celle que Select By fait
suivre au widget — cette ligne ne serait plus celle que l'utilisateur voit sélectionnée dans Grist,
donc le Select By perdrait son sens pour ce document.

Conséquence pour la conception : **pas de nouvelle dépendance vers une table liée pour choisir les
annexes**. Une valeur d'une table liée reste utilisable, mais seulement en LECTURE ponctuelle (comme
n'importe quelle `#Variable` cross-table déjà résolue aujourd'hui contre la ligne courante), jamais pour
faire varier le NOMBRE d'annexes ou leur ligne source.

`feature-table-rows-from-linked-table.md` (répéter un bloc à l'intérieur d'un même document pour chaque
ligne d'une table liée, ex. les lignes d'une facture) reste un besoin valide, mais **différent** de
celui-ci — à ne pas confondre, ni réutiliser tel quel pour les macro modèles.

## Ce n'est pas un chantier isolé — deux documents de cadrage existants s'y assemblent

- **`feature-misc-editor-and-output.md#fusion-de-plusieurs-modèles`** — la fusion simple (concaténer
  plusieurs modèles en un seul export) était déjà cadrée, avec une recommandation validée par le code
  réel (voir plus bas) : concaténer le HTML **après résolution**, réutiliser tel quel le pipeline de
  pagination existant.
- **`feature-conditional-content.md` §2 (choix de modèle conditionnel) et §3 (fusion conditionnelle)** —
  cadrait déjà "choisir un modèle selon une valeur Grist" et notait explicitement que la fusion
  conditionnelle "n'est pas une 3ᵉ fonctionnalité isolée" mais la combinaison de la fusion simple et du
  choix conditionnel, via "une liste ordonnée de slots" — **exactement** le mécanisme qui correspond à la
  demande d'Antoine une fois corrigée : une page de garde toujours incluse, puis une ou plusieurs
  annexes chacune choisie par condition sur la même ligne.

## Vérification dans le code réel : pourquoi l'approche "concaténation HTML" tient

`js/main.js:546` et `:594` montrent que `PdfExport.exportCurrentRecord`/`DocxExport.exportCurrentRecord`
ne prennent qu'**un seul** bloc HTML, une seule ligne Grist courante, un seul `headerFooterData`, une
seule config de marges par export. `ReaderMode.preview()` est déjà le point d'entrée commun aux trois
sorties (lecture, PDF, DOCX — confirmé dans `README.md`/`AUDIT_CODE.md`). Conséquence pratique : résoudre
**chaque modèle du macro séparément** (contre la MÊME ligne/table courante à chaque fois), concaténer
les fragments HTML déjà résolus, puis ne passer qu'**une fois** ce HTML concaténé dans le pipeline
existant (pagination, en-têtes/pieds, export) suffit — aucune refonte des modules d'export, et Select By
continue de ne piloter qu'une seule ligne, exactement comme pour un modèle normal aujourd'hui.

## Modèle de données proposé

Réutiliser `Publipostage_Modeles` plutôt qu'une nouvelle table (préférence d'Antoine, déjà appliquée
pour le mode email avec `TypeModele`) :

- Nouvelle valeur `TypeModele = 'macro'`.
- La colonne `Contenu` (normalement le HTML TipTap) stocke à la place, pour ce type, un JSON décrivant
  une liste ordonnée de slots — chacun résolu contre la **même** ligne/table courante :

```json
{
  "slots": [
    { "type": "fixed", "modeleId": 12 },
    {
      "type": "conditional",
      "rules": [
        { "column": "TypeDossier", "operator": "=", "value": "Pro", "modeleId": 15 },
        { "column": "TypeDossier", "operator": "=", "value": "Particulier", "modeleId": 16 }
      ],
      "defaultModeleId": 17,
      "onNoMatch": "skip"
    },
    { "type": "conditional", "rules": [ /* une 2e annexe indépendante, ex. sur une autre colonne */ ] }
  ]
}
```

- Un slot `fixed` = toujours inclus, un modèle unique. Un slot `conditional` = une cascade de règles
  (colonne / opérateur / valeur → modèle cible), la première qui correspond gagne ; modèle par défaut
  optionnel, sinon le slot est simplement absent du document assemblé (`onNoMatch: "skip"`).
- Plusieurs annexes indépendantes = plusieurs slots `conditional` à la suite, pas une répétition — cohérent
  avec le principe "la même ligne pour tout" ci-dessus.
- `column` peut référencer une valeur cross-table déjà résolvable aujourd'hui (mécanisme `#Variable`
  existant, `Publipostage_LiensTables`) : c'est une lecture ponctuelle contre la ligne courante, pas une
  itération, donc compatible avec Select By.
- `HeaderFooter`/`Margins` du macro lui-même (colonnes déjà existantes) décrivent l'en-tête/pied/marges
  du document fusionné dans son ensemble, appliqués à la page de garde ET à toutes les annexes —
  **tranché par Antoine le 2026-09-20**, cf. Décisions ci-dessous.

## Interface de création dédiée (esquisse, à maquetter une fois la direction validée)

- Nouvel écran de configuration (pas l'éditeur TipTap : un macro-modèle n'a pas de contenu texte propre,
  seulement une composition de modèles existants — donc pas de conflit avec le principe "un seul
  éditeur partagé" de la charte UI/UX, rien n'est édité en RTE ici).
- **Page de garde** : un simple sélecteur du modèle existant à utiliser.
- **Annexes** : un bouton "+ Ajouter une annexe conditionnelle" par slot voulu. Pour chaque slot, une
  liste de règles (colonne de la ligne courante / opérateur / valeur → modèle cible), réordonnables — la
  première règle qui correspond gagne. Modèle par défaut optionnel si aucune règle ne correspond. Le
  sélecteur de colonne réutilise l'autocomplétion `#` déjà existante (y compris cross-table).
- Nom du macro-modèle : même champ que pour un modèle normal, apparaît dans le **même sélecteur** que
  les modèles normaux (avec une puce/icône distinctive — on ajoute un repère visuel, on ne duplique pas
  le composant, cohérent avec la charte).
- Pas d'aperçu pixel-perfect dans cet écran : c'est de la configuration, pas de l'édition. Un résumé
  textuel suffit ("Page de garde : [Modèle X] — 2 annexes conditionnelles configurées"). Le vrai aperçu
  existe déjà : le mode Lecture, une fois le macro-modèle sélectionné et une ligne Grist choisie.

## Résolution en mode Lecture / export

1. Le macro-modèle est sélectionné dans le même sélecteur que les modèles normaux ; la ligne courante
   reste celle fournie par Select By/`grist.onRecord`, exactement comme aujourd'hui.
2. Slot fixe → `ReaderMode.preview(html, tableId courant, record courant)`, identique à un modèle
   normal aujourd'hui.
3. Slot conditionnel → évaluer les règles dans l'ordre **contre cette même ligne/table courante**,
   choisir le modèle cible (ou le défaut, ou ignorer le slot si `onNoMatch: "skip"` et rien ne
   correspond), puis `ReaderMode.preview(htmlDuModèleCible, tableId courant, record courant)` — jamais
   une autre ligne.
4. Concaténer tous les fragments HTML résolus (dans l'ordre des slots) avec un saut de page entre
   chacun (même marqueur que `.page-break-marker`, déjà géré par la pagination).
5. Passer le HTML concaténé une seule fois dans le pipeline de pagination/export existant — aucun
   changement dans `pdf-export.js`/`docx-export.js` eux-mêmes.
6. Le nom de fichier reste résolu contre la ligne courante, comme aujourd'hui (aucun changement : c'est
   déjà la même ligne pour tout le document).

## Décisions et questions ouvertes

- **Tranché par Antoine le 2026-09-20** : c'est la **même ligne courante** (celle de Select By) qui
  alimente la page de garde et toutes les annexes — pas une ligne par annexe depuis une table liée.
  Voir § "Pourquoi la même ligne" ci-dessus. Ce choix a fait tomber l'hypothèse "table liée + répétition"
  initialement proposée.
- **Tranché par Antoine le 2026-09-20** : en-tête/pied/marges — **un seul jeu de réglages pour tout le
  document fusionné**, porté par le macro-modèle lui-même (colonnes `HeaderFooter`/`Margins` déjà
  existantes sur `Publipostage_Modeles`), appliqué à la page de garde ET à toutes les annexes. Pas de
  config par modèle assemblé à prévoir.

Questions plus mineures, tranchées ici par défaut raisonnable (à corriger si Antoine n'est pas
d'accord) :

- Numérotation de page : continue sur tout le document fusionné (seule option cohérente avec l'en-tête/
  pied partagé).
- Aucune règle ne correspond pour un slot conditionnel : le slot est simplement absent du document
  assemblé (`onNoMatch: "skip"`), sans erreur visible — un modèle par défaut reste possible si Antoine
  veut plutôt un filet de sécurité systématique.
- DOCX : même architecture que le PDF (`ReaderMode.preview()` reste le point d'entrée commun), à
  vérifier empiriquement une fois codé.
- Un modèle utilisé comme annexe reste un modèle normal, modifiable indépendamment dans l'éditeur
  existant — le macro-modèle ne référence que des ID, aucune duplication de contenu.

## Plan de test (une fois implémenté)

Même motif que les autres fonctionnalités (`dev-tests/scenarios-*.js`) : un macro à 1 page de garde +
2 slots conditionnels (dont un sans correspondance sur une ligne donnée), vérifié en mode Lecture
(fragments dans le bon ordre, mêmes valeurs de la ligne courante partout) et en export PDF (mêmes
pages, sauts corrects, en-tête/pied cohérents sur tout le document).
