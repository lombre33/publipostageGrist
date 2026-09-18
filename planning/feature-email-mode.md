# Mode Email (mailto) — conception de l'interface et articulation avec l'éditeur classique

**Document de conception, pas d'implémentation.** Première tâche demandée explicitement avant tout
code : réfléchir à l'UI et à la structuration globale entre le mode éditeur classique (PDF/DOCX) et
le mode email.

Le périmètre fonctionnel et les contraintes dures du protocole `mailto:` sont déjà actés et écrits
dans l'en-tête de [`js/mailto-export.js`](../js/mailto-export.js) — ce document ne les rejoue pas, il
part de là. Rien n'est câblé aujourd'hui : `js/mailto-export.js` n'est référencé ni dans
`index.html` ni dans `js/main.js`.

## 0. Décisions confirmées par Antoine (2026-09-18)

Les quatre questions de cadrage qui pouvaient remettre en cause `mailto:` comme technologie sont
tranchées, toutes en faveur de la conception ci-dessous :

| Question | Réponse | Conséquence |
|---|---|---|
| Volume | **Un email à la fois** (pas de lot en V1) | Confirme la voie (a) du §4.5 — `mailto:` convient tel quel, pas besoin de `.eml`/ZIP pour ce point |
| Client mail cible | **Outlook bureau** | La jauge de longueur (§4.4) se dimensionne sur le plus strict des trois, pas sur une moyenne |
| Mise en forme du corps | **Texte brut acceptable** (reconfirmé) | `mailto:` reste viable, rien à changer dans la conception |
| Pièce jointe (PDF joint) | **Non** | `mailto:` reste valable ; pas de bifurcation vers `.eml`/API |

Les quatre réponses confirment que `mailto:` est la bonne technologie pour ce besoin — aucune ne
force à reconsidérer l'approche.

**Second lot de décisions (même jour), qui remplace plusieurs propositions initiales de ce
document :**

| Question | Réponse |
|---|---|
| Cc / Cci | **Cc affiché par défaut, Cci révélé au clic** (pas les deux repliés comme proposé) |
| Saisie `#Variable` dans À/Objet | **Bulles `#Variable`** comme dans le corps (pas un champ texte simple comme proposé) |
| Dépassement de longueur | Avertissement seul, jamais de blocage — proposition retenue |
| Structuration (§2) | **Option A : propriété du modèle** — recommandation retenue |
| Modèle par défaut | **Un par type** — proposition retenue |
| UI générale | **« On récupère STRICTEMENT l'UI existante »** — voir §4 revu ci-dessous, qui remplace le
  « bandeau de type » et la « carte enveloppe » de la première version par une réutilisation directe
  des composants déjà présents dans l'app (rangée `.bar-row`, champs façon
  `#pdf-filename-template`, verrouillage façon `v2-hf-locked`) |
| Export croisé | **Un modèle d'email peut être exporté en PDF ; l'inverse reste impossible** —
  confirme et formalise la relation déjà actée dans l'en-tête de `js/mailto-export.js` : le cluster
  « Exporter en PDF » existant reste disponible pour un modèle email, il n'est pas remplacé |

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
  « Documents » et « Emails ».
- Le bouton « Nouveau modèle » (déjà un `.v2-hover-group` avec un flyout, `index.html:91`) — le
  SEUL endroit de l'app où l'on choisit le type à la création — gagne deux lignes en tête :
  `Nouveau document` / `Nouvel email`, avant le `Créer à partir d'un template…` déjà existant.
  Aucun nouveau composant : le flyout existe déjà, il ne fait que s'allonger. Voir la maquette,
  artboard « Création — choix du type ».
- Charger un modèle email reconfigure la chrome existante (toolbar, deuxième `.bar-row` À/Objet/Cc,
  feuille A4) via une classe sur `#app` (`app--email` / `app--document`) — même mécanisme que
  `currentMode` pour Édition/Lecture, pas un second conteneur d'édition.

**Pourquoi c'est ma recommandation :** ça colle au modèle de données déjà décidé (deux tables Grist
distinctes), ça colle au modèle mental (« je crée un modèle d'email »), et surtout **ça n'ajoute
aucune rangée d'UI permanente** dans le cas document (la deuxième `.bar-row` n'apparaît qu'en
chargeant un modèle email) — argument décisif vu que le fil UI/UX a déjà relevé une barre d'outils
à ~30 boutons sur 2 rangées à 1440 px et 5 rangées à 420 px, dans un panneau Grist souvent étroit.

**Le coût honnête :** le type n'est explicite qu'au moment de la création (flyout) et via
l'optgroup du sélecteur ensuite — pas de rappel permanent une fois le modèle chargé. Antoine a
tranché contre tout nouveau bandeau explicatif (§0) ; le signal reste la deuxième `.bar-row` qui
apparaît et les boutons de mise en forme qui se grisent, cohérent avec le reste de l'app où changer
de mode change déjà l'écran sans bandeau d'explication (`Édition`/`Lecture`).

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

### 4.1 Mode Édition — révisé : rien de nouveau visuellement, seulement des rangées et des champs
déjà utilisés ailleurs dans l'app

Antoine a explicitement écarté le « bandeau de type » et la « carte enveloppe » de la version
précédente de ce document : *« pour l'ui on récupère STRICTEMENT l'ui existante »*. La révision
ci-dessous n'invente aucun composant — elle réutilise trois choses déjà dans le code :

- une deuxième `.bar-row` (le conteneur qui structure déjà `#toolbar-top`, `css/style.css:101`),
- des champs texte au style de `#pdf-filename-template` (`css/toolbar-v2.css:69` — bordure
  `var(--border-strong)`, hauteur 28px, fond `var(--surface)`),
  avec le même patron de révélation au clic que `btn-toggle-pdf-filename`/`wirePdfFilenameToggle`
  (`js/main.js:553`) pour Cci,
- le bouton « Exporter en PDF » existant, laissé tel quel (cf. §0, l'export croisé reste permis).

```
┌──────────────────────────────────────────────────────────────┐
│ [Relance impayés ▾] [✎] [★]  [+][Enregistrer][🗑]  │Édition│Lecture│  ⚙ │  ← bar-row 1 (inchangée)
├──────────────────────────────────────────────────────────────┤
│ À [ #Email          ]  Objet [ Relance facture #NumFacture ]  │
│ Cc [ #EmailCompta    ]  [+ Cci]     [Exporter en PDF][Ouvrir le brouillon] │  ← bar-row 2 (nouvelle,
├──────────────────────────────────────────────────────────────┤                MÊME composant que bar-row 1)
│ Normal ▾│G I S̶│gauche…│•▾│#Var│ [tableau][image][2-col]…      │  ← #v2-toolbar INCHANGÉE, les
│                                  boutons sans effet grisés    │     boutons sans effet grisés
├──────────────────────────────────────────────────────────────┤     (v2-hf-locked), pas retirés
│ Bonjour #Prenom,                                              │
│ Sauf erreur de notre part, la facture…                        │  ← #editor-container, INCHANGÉ
├──────────────────────────────────────────────────────────────┤
│                                    1 240 / 2 000 caractères   │  ← texte dans #status-msg existant
└──────────────────────────────────────────────────────────────┘
```

À, Objet et Cc sont donc toujours visibles (Cc affiché par défaut, comme demandé) ; seul Cci est
révélé au clic, avec exactement le mécanisme déjà écrit pour le nom de fichier PDF (`hidden`
retiré au clic, remis si le champ est vide au blur). Les bulles `#Variable` dans À/Objet/Cc/Cci
(décidé au lieu d'un champ texte simple, §0) demandent que ces trois/quatre champs deviennent des
mini-zones TipTap comme le corps, pas de vrais `<input>` — coût d'implémentation à assumer (§6.2).

Le cluster « Exporter en PDF » reste affiché (l'export croisé est permis, §0) ; seul un nouveau
bouton « Ouvrir le brouillon » vient s'ajouter à côté, au même style que `#btn-export-pdf`
(`css/style.css:148`, fond `var(--accent)`) — un bouton de plus dans un cluster existant, pas un
nouveau langage visuel.

Ce qui ne change pas du tout par rapport au mode document, contrairement à la version précédente de
ce document : la feuille A4, l'aperçu A4, `#editor-container`/`.tiptap` tels quels. Antoine n'a pas
demandé leur suppression et l'UI existante les gère déjà (une case à décocher, pas un nouvel état à
inventer) — un email un peu plus large qu'une page A4 n'est pas un problème puisque `mailto:` n'a de
toute façon aucune notion de page.

### 4.2 La toolbar : griser, pas masquer — réutilisation directe de `v2-hf-locked`

Version précédente de ce document : proposait de **masquer** les boutons sans effet en mailto
(image, tableau, 2-colonnes, saut de page, sommaire, gras/italique/souligné/barré, couleur,
surlignage, police, taille, alignement — liste déjà dans l'en-tête de `js/mailto-export.js`), pour
réduire l'encombrement. **Antoine a tranché l'inverse : les griser.**

Le mécanisme technique existe déjà tel quel : `syncToolbarState` (`js/main-toolbar.js:121-133`) pose
une classe de verrouillage sur des boutons selon un mode courant — c'est exactement ce que fait déjà
le mode en-tête/pied avec `v2-hf-locked` (`opacity:.35; pointer-events:none`,
`css/toolbar-v2.css:208`). Le mode email est le même patron, avec le même effet visuel — aucune
nouvelle classe CSS à écrire, juste une nouvelle condition (`inEmailMode`) à côté de `inHfMode`
dans `syncToolbarState`.

**Un risque à traiter à part : le collage.** Griser les boutons n'empêche pas de coller un tableau
ou du texte riche venu d'un document Word dans le corps. Le sérialiseur texte l'aplatira à l'export,
mais le modèle stocké porterait du HTML invisible et trompeur. Recommandation : en mode email,
nettoyer au collage (`transformPastedHTML` de TipTap), pour que ce qu'on voit soit ce qui est stocké.

### 4.3 Mode Lecture : l'argument fort du mode email

En mode document, la Lecture est un confort. En mode email, **c'est la garantie principale** : on
édite dans un éditeur riche un contenu dont le rendu final est du texte plat. Sans aperçu, tout
utilisateur écrira du gras et sera surpris chez le destinataire.

Le mode Lecture email affiche donc **exactement ce que le client mail recevra**, dans
`#reader-container` inchangé (même bascule `.mode-toggle` que le document) :

```
┌──────────────────────────────────────────────────────────────┐
│ [Relance impayés ▾]                          │Édition│Lecture│  ⚙ │
├──────────────────────────────────────────────────────────────┤
│ À  marie.dupont@exemple.fr   Objet  Relance facture F-2024-118│  ← bar-row 2, valeurs résolues,
│ Cc marie.compta@exemple.fr                                    │     mêmes champs qu'en édition
├──────────────────────────────────────────────────────────────┤     (Cci révélé seulement si rempli)
│ Bonjour Marie,                                                │
│ Sauf erreur de notre part, la facture F-2024-118…             │  ← #reader-container, texte brut
├──────────────────────────────────────────────────────────────┤
│ 1 240 / 2 000 caractères          [Exporter en PDF][Ouvrir le brouillon] │
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

Tout est tranché. Pour mémoire (voir §0 pour le détail des réponses) :

1. ~~**Cc et Cci**~~ — **tranché : Cc affiché par défaut, Cci révélé au clic.**
2. ~~**Saisie des `#Variable` dans À et Objet**~~ — **tranché : bulles `#Variable`**, comme le corps.
3. ~~**Dépassement de longueur**~~ — **tranché : avertissement seul, jamais de blocage.**
4. ~~**Le lot (§4.5)**~~ — **tranché : un email à la fois, pas de lot en V1.**
5. ~~**Option A, B ou C (§2)**~~ — **tranché : option A (propriété du modèle).**
6. ~~**Modèle email par défaut**~~ — **tranché : un par type.**

Un point n'avait pas été anticipé comme question et est arrivé directement en réponse : **l'UI doit
rester strictement celle déjà existante** — pas de nouveau composant visuel (le « bandeau de type »
et la « carte enveloppe » de la première version de ce document sont abandonnés, cf. §4.1 revu). Et
**un modèle d'email garde le bouton « Exporter en PDF »** existant (l'export croisé email→PDF est
permis, PDF→email ne l'est pas — relation déjà actée dans `js/mailto-export.js`).

La maquette visuelle (canvas, 3 écrans : Édition, Lecture, Création) est à jour de ces réponses :
https://claude.ai/artifact/TiZzpjqNSLJ7FaX5BzDLZK — l'artboard « Création » montre précisément où
le type (document/email) se choisit, seule question qui n'était pas encore visible sur la maquette.
