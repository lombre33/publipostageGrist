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

**Troisième lot de retours (même jour, sur la 2ᵉ version de la maquette) :**

| Retour | Conséquence |
|---|---|
| Non-régression stricte : *« tu peux juste rajouter les éléments nouveaux, pas de changement sur les éléments déjà présents »* | Règle dure pour l'implémentation, pas seulement pour la maquette : le mode email n'ajoute que des éléments conditionnels (classe `app--email`, rangée `.bar-row` en plus) — aucune ligne de CSS/HTML existante ne change de valeur, y compris pour le mode document |
| Ordre des champs : **Objet en premier, puis Destinataire et Cc qui se suivent** | Réordonne `Objet → À → Cc → [+Cci]`, pas `À → Objet → Cc` comme dans la 2ᵉ version (§4.1 revu) |
| Couleur du bouton Cci : *« l'interface est principalement monochrome »* | Le bouton `+ Cci` perd son style accent (bleu) de la 2ᵉ version — même style neutre que les autres boutons discrets de la toolbar (`color:var(--text)`), l'accent reste réservé aux actions primaires (Enregistrer, Exporter, action email) |
| Le bouton « #Variable » de la maquette est apprécié et doit être **réellement construit**, pour toute la toolbar (édition **et** document), pas seulement pensé pour l'email | Ajoute une portée au chantier : un vrai bouton toolbar qui ouvre l'autocomplétion `#` déjà existante (`js/variables.js`) sans avoir à taper le caractère déclencheur — utile partout, pas un artifice de maquette |
| Pas de duplication de code : un seul éditeur/toolbar pour les deux types, seuls le style et l'activation des boutons + l'ajout Objet/Destinataire changent selon le mode | Confirme le plan déjà écrit en §4.2/§5 (`syncToolbarState`, `v2-hf-locked`) — formalisé ici comme contrainte dure, pas une préférence |
| Nom du bouton d'action (`« Ouvrir le brouillon »`) | À trancher — voir la carte de choix envoyée après ce document |
| Traductions anglaises | À ne pas oublier à l'implémentation (`js/i18n.js`) pour chaque nouveau libellé |
| « C'est quoi l'icône d'horloge ? » | Bonne question — corrigée ci-dessous (§4.2) : c'était une erreur de conception de la maquette, pas une fonctionnalité déjà nommée ainsi dans l'app |

**Quatrième lot de retours (même jour, sur la 3ᵉ version de la maquette) :**

| Retour | Conséquence |
|---|---|
| Bar-row 1 (tout en haut) : *« on ne garde bien tout les éléments déjà présent (là ce n'est pas le cas) »* | La 3ᵉ version avait considérablement simplifié cette rangée (boutons textuels inventés, plusieurs éléments réels absents : Enregistrer sous, Tables liées, Aperçu A4, Enregistrement automatique, Qualité PDF, nom de fichier PDF personnalisé, statut). §4.1 revu : reconstruction fidèle des **19 éléments réels** de `#toolbar-top .bar-row` (`index.html:83-146`), en boutons icône seule (comme le code réel — ces boutons n'ont pas de texte visible, `css/style.css:132`), rien retiré ni renommé |
| Objet + destinataires **sur une seule ligne**, pour réduire la hauteur prise | bar-row 2 fusionnée : `Objet [...] À [...] Cc [...] [+Cci]` sur une seule rangée, plus de découpage 2a/2b (§4.1 revu) |
| Dernière ligne de la toolbar (`#v2-toolbar`) : même remarque que pour bar-row 1 | Plusieurs éléments réels manquaient aussi ici (les boutons +/− de taille de police, les carets de couleur de police et de surlignage, le bouton Commentaire) et un espaceur avait été inventé pour pousser Annuler/Rétablir à droite (n'existe pas dans le code réel). §4.2 revu : les **24 éléments réels** de `#v2-toolbar` (`index.html:148-268`) sont tous repris, dans le même ordre, sans espaceur ; seuls changements : la classe de verrouillage sur la liste exacte de `js/mailto-export.js`, et l'ajout du bouton `#Variable` |
| Le bouton « Exporter en PDF » ne doit pas être dupliqué à côté de « Créer l'email », puisqu'il est déjà sur la première ligne | Le bouton d'action email et le compteur de caractères rejoignent **bar-row 1**, juste après le cluster d'export déjà existant (à côté de `#btn-export-pdf`) — il n'y a plus de barre d'actions séparée en bas de l'écran (qui n'existe d'ailleurs pas dans le code réel : ni `#editor-container` ni `#reader-container` n'ont de pied de page) |

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
┌──────────────────────────────────────────────────────────────────────┐
│[Relance impayés▾][✎][★] [+][💾][⧉][🗑][🔗] │[✎][👁] [A4][⟳] │[PDF-q][PDF][✎] │  ← bar-row 1, LES
│                                                  1240/2000 [Créer l'email]  Enregistré [⚙]│     19 ÉLÉMENTS RÉELS
├──────────────────────────────────────────────────────────────────────┤     de #toolbar-top (rien
│ Objet [ Relance facture #NumFacture ]  À [ #Email ]  Cc [ #EmailCompta ] [+Cci]           │     retiré) + 2 AJOUTS
├──────────────────────────────────────────────────────────────────────┤     (compteur, action email)
│ Normal▾│G I S̶│▤│•▾ ⇤⇥│−10.5pt+▾│A▾ 🖍▾│▦│⧉ 🖼 ⁘ ▤ 💬│#Variable│↶ ↷ │  ← #v2-toolbar, LES 24
│         grisés (sans effet en texte brut)      seul ajout ─┘         │     ÉLÉMENTS RÉELS + 1 AJOUT
├──────────────────────────────────────────────────────────────────────┤
│ Bonjour #Prenom,                                                      │  ← #editor-container, INCHANGÉ
│ Sauf erreur de notre part, la facture…                                │     (pas de pied de page :
└──────────────────────────────────────────────────────────────────────┘     il n'y en a pas non plus
                                                                               dans le code réel)
```

*(schéma condensé — le détail élément par élément est dans la maquette, pas reproductible lisiblement
en ASCII vu le nombre réel de boutons ; voir le lien §6)*

**Bar-row 1 : reconstruction fidèle, pas de simplification.** La 3ᵉ version de ce document avait
réduit cette rangée à une poignée de boutons stylisés en texte — Antoine a eu raison de relever que
plusieurs éléments réels manquaient (Enregistrer sous, Tables liées, Aperçu A4, Enregistrement
automatique, Qualité PDF, nom de fichier PDF personnalisé, statut). Les **19 éléments** de
`#toolbar-top .bar-row` (`index.html:83-146`) sont tous des boutons **icône seule** dans le code réel
(pas de texte visible, juste une infobulle — `css/style.css:132`, `#toolbar-top button::before`) :
c'est cette forme, pas des boutons textuels inventés, qui doit apparaître à l'implémentation. Les deux
seuls ajouts (compteur de caractères, bouton d'action email) rejoignent cette même rangée, juste après
le cluster d'export déjà existant (`btn-export-pdf`) — **pas de bouton « Exporter en PDF » dupliqué**
à côté : celui déjà présent sur cette ligne suffit, l'action email n'a pas besoin du sien.

**Bar-row 2 : Objet et destinataires sur une seule ligne.** Pour limiter la hauteur ajoutée (demande
explicite d'Antoine), Objet/À/Cc/[+Cci] tiennent sur une seule rangée, dans cet ordre — **Objet en
tête puis À et Cc qui se suivent**. Seul Cci est révélé au clic, avec exactement le mécanisme déjà
écrit pour le nom de fichier PDF (`hidden` retiré au clic, remis si le champ est vide au blur), en
**style neutre** (pas d'accent bleu : l'interface est majoritairement monochrome). Les bulles
`#Variable` dans Objet/À/Cc/Cci (décidé au lieu d'un champ texte simple, §0) demandent que ces
trois/quatre champs deviennent des mini-zones TipTap comme le corps, pas de vrais `<input>` — coût
d'implémentation à assumer (§6.2).

Le bouton d'action email, au même style que `#btn-export-pdf` (`css/style.css:148`, fond
`var(--accent)`) — un bouton de plus dans un cluster existant, pas un nouveau langage visuel — a pour
libellé **« Créer l'email »** (tranché par Antoine via la carte de choix, 2026-09-18, parmi Composer
l'email / Nouveau message / Créer l'email / Rédiger l'email).

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

**Reconstruction fidèle, même remarque que pour bar-row 1.** La 3ᵉ version de la maquette omettait
plusieurs éléments réels de `#v2-toolbar` (`index.html:148-268`, 24 éléments/séparateurs) : les
boutons −/+ de taille de police (seul le chiffre était présent), les carets de choix de couleur de
police et de surlignage (seul le bouton principal était présent), et le bouton Commentaire
(`v2-btn-comment`) — absent des deux listes de `js/mailto-export.js` (ni verrouillé ni cité comme
utilisable), donc actif comme en mode document. Un espaceur avait aussi été ajouté pour pousser
Annuler/Rétablir à droite : il n'existe pas dans le code réel (`#v2-toolbar` n'a pas de
`margin-left:auto`, contrairement à `#status-msg` en bar-row 1) et a été retiré. Tous ces éléments
sont maintenant repris à l'identique ; seuls changements réels : la classe de verrouillage sur la
liste ci-dessous, et l'ajout du bouton `#Variable`.

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

**Correction sur la 2ᵉ version de la maquette : un seul bouton « #Variable », pas un bouton
horloge séparé.** La question d'Antoine (« c'est quoi l'icône d'horloge ? ») a mis le doigt sur une
erreur de conception : la maquette affichait deux boutons (`#Variable` et une icône horloge pour les
« chips intelligents ») comme s'il s'agissait de deux mécanismes distincts. Or dans le code actuel,
variables ET chips (date du jour, heure actuelle, email de l'utilisateur connecté, note de bas de
page) partagent une seule et même autocomplétion déclenchée en tapant le caractère `#`
(`js/variables.js:25-28` — chaque chip y est une entrée de la même liste que les colonnes Grist). Il
n'existe donc qu'**un seul bouton à construire**, qui ouvre cette autocomplétion sans avoir à taper
le déclencheur — l'horloge de la maquette est retirée.

**Ce bouton devient une vraie fonctionnalité, pas un artifice de maquette.** Antoine l'a explicitement
demandé sur toute la toolbar, mode document inclus (« l'éditeur est le même partout ») : comme
`syncToolbarState`/`main-toolbar.js` pilotent une seule et même toolbar (§4 introduction, pas de
duplication), l'ajouter au bouton toolbar partagé le rend disponible aux deux types de modèle sans
travail supplémentaire — un item de portée en plus pour ce chantier, hors périmètre strict du mode
email, mais gratuit une fois la toolbar déjà factorisée.

### 4.3 Mode Lecture : l'argument fort du mode email

En mode document, la Lecture est un confort. En mode email, **c'est la garantie principale** : on
édite dans un éditeur riche un contenu dont le rendu final est du texte plat. Sans aperçu, tout
utilisateur écrira du gras et sera surpris chez le destinataire.

Le mode Lecture email affiche donc **exactement ce que le client mail recevra**, dans
`#reader-container` inchangé (même bascule `.mode-toggle` que le document) :

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Relance impayés▾]        │[✎][👁 actif]│ … (mêmes 19 éléments qu'en édition) │
│                              1180/2000 [Créer l'email]  Enregistré [⚙]│
├──────────────────────────────────────────────────────────────────────┤
│ Objet  Relance facture F-2024-118  À marie.dupont@exemple.fr  Cc marie.compta@exemple.fr │
├──────────────────────────────────────────────────────────────────────┤
│ Normal▾│G I S̶│▤│•▾ ⇤⇥│−10.5pt+▾│A▾ 🖍▾│▦│⧉ 🖼 ⁘ ▤ 💬│#Variable│↶ ↷ │  ← présent aussi en
├──────────────────────────────────────────────────────────────────────┤     Lecture (voir note)
│ Bonjour Marie,                                                        │
│ Sauf erreur de notre part, la facture F-2024-118…                     │  ← #reader-container, texte
└──────────────────────────────────────────────────────────────────────┘     brut, INCHANGÉ
```

Destinataires et objet sont résolus avec la vraie ligne Grist, comme le corps — c'est déjà ce que
fait `ReaderMode.render()` pour le document et `ReaderMode.resolveFilename()`
(`js/reader-mode.js:321`) pour le nom de fichier PDF.

**Découverte en reconstruisant la maquette fidèlement (§4.1) :** `switchMode()` (`js/main.js:550`)
ne bascule que l'affichage de `#editor-container`/`#reader-container` — `#v2-toolbar` n'est masqué
nulle part dans le code, il reste donc affiché en mode Lecture aujourd'hui (document comme email).
La maquette précédente l'omettait en Lecture ; ce n'est pas correct vis-à-vis du comportement actuel,
corrigé ici pour rester fidèle.

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

**Deux règles dures, non négociables (retours d'Antoine, §0) :**
- **Non-régression stricte.** Le mode document ne change ni de markup ni de comportement.
  Tout ajout est conditionnel (`app--email`, `inEmailMode`) ; rien n'est retiré ni modifié pour le
  cas document. Seule exception assumée et voulue : le bouton `#Variable` (ci-dessous), qui
  apparaît dans les deux modes parce que c'est la même toolbar partagée.
- **Pas de duplication.** Un seul éditeur, une seule instance de toolbar, un seul `syncToolbarState`.
  Le mode email ne clone rien : il ajoute une condition à ce qui existe déjà.

| Fichier | Nature du travail |
|---|---|
| `js/mailto-export.js` | Implémenter les trois fonctions du squelette : sérialiseur HTML→texte, constructeur d'URL, mesure de longueur. Morceau **entièrement nouveau**, pas une extension de `pdf-export.js`. |
| `js/email-mode.js` *(nouveau)* | Orchestration de l'écran email : champs Objet/À/Cc/Cci, jauge, bouton d'action, rendu Lecture. `js/main.js` fait déjà 34 Ko, ne pas l'y empiler. |
| `js/templates.js` | Paramétrer par table + schéma, instancier deux fois (§3). |
| `js/main-toolbar.js` | Profil de toolbar « email » sur le patron `v2-hf-locked` existant (§4.2) ; **et** nouveau bouton `#Variable` partagé (§4.2) qui ouvre l'autocomplétion de `js/variables.js` sans taper le déclencheur — celui-ci apparaît dans les DEUX modes, pas seulement email. |
| `index.html` | Bloc `#email-fields`, deux lignes (`Nouveau document`/`Nouvel email`) dans le flyout « Nouveau » déjà existant, classes `app--email` / `app--document` sur `#app`, le bouton `#Variable` dans `#v2-toolbar` (partagé). |
| `js/reader-mode.js` | Branche de rendu email (pas de pagination, pas d'en-tête/pied) — la résolution des `#Variable` et des chips est réutilisée telle quelle. |
| `js/i18n.js` | Libellés des nouveaux contrôles **en français et en anglais** (les deux langues de l'app), comme tout le reste de l'UI. |

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
