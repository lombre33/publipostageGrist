# Mode Email (mailto) — conception de l'interface et articulation avec l'éditeur classique

**Document de conception, pas d'implémentation.** Première tâche demandée explicitement avant tout
code : réfléchir à l'UI et à la structuration globale entre le mode éditeur classique (PDF/DOCX) et
le mode email.

Le périmètre fonctionnel et les contraintes dures du protocole `mailto:` sont déjà actés et écrits
dans l'en-tête de [`js/mailto-export.js`](../js/mailto-export.js) — ce document ne les rejoue pas, il
part de là. Rien n'est câblé aujourd'hui : `js/mailto-export.js` n'est référencé ni dans
`index.html` ni dans `js/main.js`.

---

## 1. Le vrai problème de structuration : deux axes qu'on ne doit pas confondre

L'application a aujourd'hui **un seul axe de bascule**, le groupe `.mode-toggle`
(`index.html:104`, `js/main.js:386` `switchMode`) :

| | |
|---|---|
| **Mode Édition** | `#editor-container` visible, TipTap éditable, badges `#Variable` non résolus |
| **Mode Lecture** | `#reader-container` visible, `ReaderMode.render()` avec la vraie ligne Grist sélectionnée |

C'est un axe **de vue** : « est-ce que je travaille sur le modèle, ou est-ce que je regarde le
résultat pour la ligne courante ? »

Le mode Email introduit un axe **différent**, celui de la **destination** du modèle : PDF/DOCX
(document mis en page) vs email (texte brut dans un client mail).

> **Le piège à éviter :** transformer `.mode-toggle` en trois boutons `Édition | Lecture | Email`.
> Ce serait une erreur de catégorie — on veut évidemment pouvoir **éditer** un email *et* en
> **prévisualiser le rendu final** pour une ligne Grist. L'axe Lecture garde tout son sens en mode
> email, il est même *plus* important qu'en PDF (cf. §4.3).

Les deux axes sont orthogonaux et doivent le rester :

```
                    │  Mode Édition        │  Mode Lecture
────────────────────┼──────────────────────┼─────────────────────────────
  Type « Document » │  feuille A4, toolbar │  aperçu paginé + export
   (PDF / DOCX)     │  complète (~30 btn)  │  PDF / DOCX (1 ligne ou ZIP)
────────────────────┼──────────────────────┼─────────────────────────────
  Type « Email »    │  champs À/Objet +    │  rendu texte brut exact,
   (mailto)         │  corps, toolbar      │  jauge de longueur,
                    │  courte (~8 btn)     │  « Ouvrir le brouillon »
```

---

## 2. Où poser l'axe « type de document » — trois options

### Option A — Le type est une propriété du **modèle** *(recommandée)*

Un modèle *est* un document ou *est* un email, décidé à sa création ; il n'y a pas de bascule de type
sur un modèle chargé. Concrètement :

- Le `#template-select` existant liste les deux familles dans **deux `<optgroup>`** :
  « Documents » et « Emails », chaque entrée préfixée d'une pastille de type.
- Le bouton « Nouveau modèle » (déjà un `.v2-hover-group` avec un flyout, `index.html:91`) gagne une
  ligne : `Nouveau document` / `Nouvel email` / `Créer à partir d'un template…`.
- Charger un modèle email reconfigure toute la chrome (toolbar, cluster d'export, champs
  destinataires, feuille A4) — via une classe sur `#app` (`app--email` / `app--document`), pas via
  un second conteneur d'édition.

**Pourquoi c'est ma recommandation :** ça colle au modèle de données déjà décidé (deux tables Grist
distinctes), ça colle au modèle mental (« je crée un modèle d'email »), et surtout **ça n'ajoute
aucune rangée d'UI permanente** — argument décisif vu que le fil UI/UX a déjà relevé une barre
d'outils à ~30 boutons sur 2 rangées à 1440 px et 5 rangées à 420 px, dans un panneau Grist souvent
étroit.

**Le coût honnête :** le type n'est visible que via la pastille du modèle sélectionné. Un utilisateur
qui ouvre le widget sur un modèle email doit comprendre *tout de suite* pourquoi sa toolbar a
maigri. Mitigation : un bandeau de type discret mais explicite au-dessus du corps (cf. §4.1), pas
seulement une pastille de 8 px.

### Option B — Deux onglets de premier niveau `Documents | Emails`

Une vraie barre d'onglets au-dessus de tout le reste. Chaque onglet a sa liste de modèles, sa
toolbar, son cluster d'export, son propre couple Édition/Lecture.

- **Pour :** séparation la plus lisible qui soit, zéro ambiguïté sur « où je suis », pas de collision
  de noms entre un modèle « Relance » document et un modèle « Relance » email.
- **Contre :** une rangée d'UI permanente de plus, là où la place manque déjà. Et l'onglet Emails
  reste vide chez la grande majorité des utilisateurs qui ne feront jamais que du PDF — on facture à
  tout le monde un coût d'espace pour une fonctionnalité minoritaire.

### Option C — Un seul modèle, une bascule de « sortie » à l'export

Le contenu est partagé, on choisit à l'export s'il part en PDF ou en mailto.

**À écarter.** Ça contredit frontalement la relation asymétrique déjà actée dans
`js/mailto-export.js` : un modèle PDF riche (tableaux, images, 2-colonnes) ne peut pas devenir un
mailto sans perte ni dépassement de longueur, et il n'y a volontairement pas de bouton « exporter en
mailto » depuis l'éditeur PDF. Une ligne de modèle unique devrait porter les champs des deux usages
(destinataires + objet côté email, marges + en-tête/pied + nom de fichier côté PDF), chacun polluant
l'autre.

---

## 3. Modèle de données

Nouvelle table Grist `Publipostage_Modeles_Email`, distincte de `Publipostage_Modeles` (décision déjà
actée) :

| Colonne | Type | Note |
|---|---|---|
| `Nom` | Text | |
| `Contenu` | Text | HTML TipTap, comme les modèles document |
| `Destinataires` | Text | `#Variable` autorisées |
| `Cc` | Text | idem — **à trancher §6.1** |
| `Cci` | Text | idem — **à trancher §6.1** |
| `Objet` | Text | `#Variable` autorisées |
| `EstParDefaut` | Bool | même sémantique que côté document |
| `DateModif` | DateTime | |

**Création de la table :** par le widget lui-même, avec exactement le même patron idempotent que
`js/templates.js` (`ensureTableExists` + un `ensureXxxColumn` par colonne ajoutée après coup) — c'est
déjà le comportement de toutes les tables de config de ce projet, pas la peine d'inventer autre chose.

**Réutilisation du code :** `js/templates.js` est aujourd'hui un module à table codée en dur
(`TABLE_NAME = 'Publipostage_Modeles'`). Plutôt que d'en dupliquer 200 lignes, le paramétrer par
`(nom de table, schéma de colonnes)` et l'instancier deux fois. C'est un refactor à faible risque et
c'est ce qui évite que les deux CRUD divergent au premier correctif.

---

## 4. L'écran du mode Email

### 4.1 Mode Édition

```
┌──────────────────────────────────────────────────────────────┐
│ [✉ Relance impayés ▾] [✎] [★]   [+][💾][⧉][🗑]  │ ✎ │ 👁 │   ⚙ │  ← barre du haut
├──────────────────────────────────────────────────────────────┤
│ Normal ▾ │ • ▾ │ ⇤ ⇥ │ #Variable │ ⏱ chip │ ↶ ↷              │  ← toolbar COURTE
├──────────────────────────────────────────────────────────────┤
│  ✉ Modèle d'email — le destinataire recevra du texte brut. ⓘ │  ← bandeau de type
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ À      [ #Email                                        ] │ │
│ │ Objet  [ Relance facture #NumFacture                   ] │ │  ← carte « enveloppe »
│ │                                        + Cc / Cci        │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Bonjour #Prenom,                                         │ │
│ │                                                          │ │  ← corps, pleine largeur
│ │ Sauf erreur de notre part, la facture…                    │ │     PAS de feuille A4
│ └──────────────────────────────────────────────────────────┘ │
│                                        1 240 / 2 000 car. ▓░ │  ← jauge de longueur
└──────────────────────────────────────────────────────────────┘
```

Ce qui disparaît par rapport au mode document, et pourquoi :

- **La feuille A4** (`.v2-page-sheet.a4-preview`) et la case « Aperçu A4 » : un email n'a pas de page.
  Le corps passe en pleine largeur fluide — bénéfice collatéral, c'est le seul écran de l'app qui ne
  souffrira pas du rognage sous ~830 px relevé par le fil UI/UX.
- **L'overlay de pagination**, les marges de page, l'en-tête/pied de page, le saut de page, le
  sommaire : sans objet sans pagination.
- **Le cluster d'export PDF/DOCX et le nom de fichier PDF**, remplacés par le bouton d'action email.

### 4.2 La toolbar courte : masquer plutôt que griser

`js/mailto-export.js` liste déjà les boutons sans effet possible en mailto (image, tableau,
2-colonnes, saut de page, sommaire, gras/italique/souligné/barré, couleur, surlignage, police,
taille, alignement) et les décrit comme « désactivés/grisés ».

**Je propose de les masquer, pas de les griser.** Griser laisse ~30 boutons à l'écran dont ~20
morts : c'est exactement le défaut d'encombrement déjà identifié sur cette toolbar, aggravé. Restent
visibles : titres, listes à puces/numérotées, retrait, `#Variable`, chips intelligents,
annuler/rétablir — soit ~8 boutons, une seule rangée même en panneau étroit.

Le bandeau de type (§4.1) porte alors la pédagogie que le grisage était censé porter : une phrase
plus un `ⓘ` qui explique en une infobulle que le protocole `mailto:` ne transporte que du texte brut.

Le mécanisme technique existe déjà : `syncToolbarState` (`js/main-toolbar.js:121-133`) sait poser une
classe de verrouillage sur des boutons selon un mode courant — c'est ce que fait le mode
en-tête/pied avec `v2-hf-locked`. Le mode email en est le même patron, avec `display:none` au lieu
d'un grisage.

**Un risque à traiter à part : le collage.** Masquer les boutons n'empêche pas de coller un tableau
ou du texte riche venu d'un document Word dans le corps. Le sérialiseur texte l'aplatira à l'export,
mais le modèle stocké porterait du HTML invisible et trompeur. Recommandation : en mode email,
nettoyer au collage (`transformPastedHTML` de TipTap), pour que ce qu'on voit soit ce qui est stocké.

### 4.3 Mode Lecture : l'argument fort du mode email

En mode document, la Lecture est un confort. En mode email, **c'est la garantie principale** : on
édite dans un éditeur riche un contenu dont le rendu final est du texte plat. Sans aperçu, tout
utilisateur écrira du gras et sera surpris chez le destinataire.

Le mode Lecture email affiche donc **exactement ce que le client mail recevra** :

```
┌──────────────────────────────────────────────────────────────┐
│ À       marie.dupont@exemple.fr                              │
│ Objet   Relance facture F-2024-118                           │
├──────────────────────────────────────────────────────────────┤
│ Bonjour Marie,                                               │
│                                                              │
│ Sauf erreur de notre part, la facture F-2024-118…            │  ← texte brut,
│                                                              │     rendu tel quel
│ - Montant : 1 240,00 €                                       │
│ - Échéance : 12/03/2024                                      │
├──────────────────────────────────────────────────────────────┤
│ 1 240 / 2 000 caractères            [ Ouvrir le brouillon ]  │
└──────────────────────────────────────────────────────────────┘
```

Destinataires et objet sont résolus avec la vraie ligne Grist, comme le corps — c'est déjà ce que
fait `ReaderMode.render()` pour le document et `ReaderMode.resolveFilename()`
(`js/reader-mode.js:321`) pour le nom de fichier PDF.

### 4.4 La jauge de longueur

C'est le seul indicateur propre au mailto et il doit être **permanent**, pas un avertissement au clic.
`MailtoExport.checkUrlLength` retourne déjà `{ length, safe, limit }`. Placement : en bas à droite du
corps en édition, dans la barre d'action en lecture. Trois états : normal, proche de la limite
(≥ 80 %), dépassé.

Important : la jauge mesure la **longueur de l'URL encodée complète** (to + cc + cci + objet + corps),
pas le nombre de caractères tapés — un accent ou un retour à la ligne coûtent 3 à 9 caractères une
fois encodés. Il faut donc afficher la longueur d'URL réelle, et sur la ligne *résolue* (avec les
valeurs Grist), pas sur le modèle : `#Prenom` fait 7 caractères, `Marie-Christine` en fait 15. Une
conséquence à assumer : **la longueur dépend de la ligne sélectionnée**, un modèle peut passer pour
une ligne et dépasser pour une autre.

### 4.5 Le publipostage, justement : le point le plus ouvert

Côté document, « publipostage » = `onExportPdfBatch` / `onExportDocxBatch` : N lignes → N fichiers →
un ZIP (`js/main.js:261` et `:325`). Côté email, **ça ne se transpose pas** : ouvrir 200 liens
`mailto:` d'affilée est bloqué par les navigateurs et ingérable par les clients mail. Trois voies :

- **(a) Pas de lot en V1** — un email à la fois, pour la ligne sélectionnée. Honnête et cohérent avec
  le protocole. Mais alors le mode email n'est pas vraiment du *publipostage*, et c'est le nom du
  produit.
- **(b) Une liste d'envoi en mode Lecture** — les N lignes listées, un bouton « Ouvrir » par ligne,
  chacune cochée au fur et à mesure, la progression mémorisée (colonne Grist ou `localStorage`).
  Lent et manuel, mais c'est du vrai publipostage sans sortir des limites de `mailto:`. Bonus : la
  jauge de longueur peut être calculée pour les N lignes d'un coup et signaler celles qui dépassent
  **avant** de commencer.
- **(c) Export `.eml` en ZIP** — sortir de `mailto:` pour un format de message complet. À évaluer
  sérieusement, parce que ça lève d'un coup trois des quatre contraintes dures : pas de limite de
  longueur, mise en forme HTML possible, pièces jointes possibles (donc le PDF généré joint à son
  propre email, ce que `mailto:` ne pourra jamais faire). Le prix : ce n'est plus « un clic, mon
  brouillon s'ouvre » mais « je télécharge un ZIP et j'ouvre les fichiers » ; sous Outlook un `.eml`
  s'ouvre en message *reçu* et demande un « Transférer » pour être envoyé ; et sur un webmail dans le
  navigateur (Gmail), un `.eml` ne sert à rien.

**Ma recommandation : (a) pour la V1, en gardant (b) comme suite naturelle**, et traiter (c) comme
une fonctionnalité à part entière à arbitrer sur sa propre valeur — pas comme un détail
d'implémentation du mode email. Mais c'est une décision produit, elle revient à l'utilisateur, et
elle vaut mieux d'être prise **avant** que l'UI se fige autour des limites de `mailto:` (§6.4).

---

## 5. Découpage technique induit

| Fichier | Nature du travail |
|---|---|
| `js/mailto-export.js` | Implémenter les trois fonctions du squelette : sérialiseur HTML→texte, constructeur d'URL, mesure de longueur. Morceau **entièrement nouveau**, pas une extension de `pdf-export.js`. |
| `js/email-mode.js` *(nouveau)* | Orchestration de l'écran email : champs enveloppe, jauge, bouton d'ouverture, rendu Lecture. `js/main.js` fait déjà 34 Ko, ne pas l'y empiler. |
| `js/templates.js` | Paramétrer par table + schéma, instancier deux fois (§3). |
| `js/main-toolbar.js` | Profil de toolbar « email » sur le patron `v2-hf-locked` existant (§4.2). |
| `index.html` | Bloc `#email-fields`, lignes de type dans le flyout « Nouveau », classes `app--email` / `app--document` sur `#app`. |
| `js/reader-mode.js` | Branche de rendu email (pas de pagination, pas d'en-tête/pied) — la résolution des `#Variable` et des chips est réutilisée telle quelle. |
| `js/i18n.js` | Libellés des nouveaux contrôles, comme tout le reste de l'UI. |

Non touchés : `pdf-export.js`, `docx-export.js`, `page-layout.js`, `header-footer-preview.js`,
`editor-nodes.js`. Le mode email **retire** des capacités, il n'en ajoute aucune au schéma TipTap.

---

## 6. Ce qui doit être tranché avant de coder

1. **Cc et Cci** — les deux, seulement Cc, ou aucun des deux en V1 ? Ils occupent de la place dans la
   carte enveloppe et consomment le budget de 2 000 caractères. Proposition : les deux, mais repliés
   derrière un lien « + Cc / Cci » (donc coût visuel nul tant qu'on ne s'en sert pas).
2. **Saisie des `#Variable` dans À et Objet** — champ texte simple où l'on tape `#Colonne` (exactement
   ce que fait déjà le champ « nom de fichier PDF », code de résolution existant et éprouvé), ou
   vraies bulles `#Variable` comme dans le corps (plus joli et plus sûr, mais c'est un
   `contenteditable` et une nouvelle intégration) ? Proposition : champ texte en V1.
3. **Dépassement de longueur** — avertissement seul (l'utilisateur décide) ou blocage du bouton ? La
   question devient plus délicate avec la jauge par ligne (§4.4) : que fait-on d'un lot où 3 lignes
   sur 40 dépassent ? Proposition : jamais de blocage dur, mais un bouton en état d'alerte explicite.
4. **Le lot (§4.5)** — la question la plus structurante, à trancher avant de figer l'UI.
5. **Option A, B ou C (§2)** — ma recommandation est A, mais c'est un choix d'interface qui vous
   appartient.
6. **Modèle email par défaut** — un modèle par défaut *par type*, ou un seul pour toute l'app ?
   Proposition : un par type, sinon ouvrir le widget sur un email quand on vient faire un PDF.
