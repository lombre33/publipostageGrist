# Identité UI/UX — Grist Factory

> **À quoi sert ce document.** Décrire, avec des faits vérifiés dans le code (pas des intentions), les choix
> d'interface déjà faits par Antoine sur les widgets Grist Factory — ce qui est commun à tous les widgets et ce
> qui est propre à chacun — pour pouvoir être collé tel quel dans un autre chat/projet Claude et lui donner
> immédiatement le bon cadre : quelle identité respecter, quoi ne pas réinventer, quoi rester au milieu de la
> route en attendant un arbitrage d'Antoine. État au 2026-09-29 pour `publipostageGrist` (dépôt mature, revérifié dans le
> code après l'audit UX/UI du 29/09 et l'harmonisation des fenêtres) ; `SlidesPlus` (fondation, pas encore un éditeur
> utilisable) n'a pas été revu depuis le 2026-09-18.
>
> Ce fichier existe en deux copies identiques : `identite-ui-ux-grist-factory.md` dans les fichiers du projet, et
> `planning/identite-ui-ux-grist-factory.md` dans le dépôt `publipostageGrist` (branche `main`).

---

## 1. Identité commune « Grist Factory » (transposable à tout nouveau widget)

### Marque
- Éditeur affiché aux utilisateurs : **Grist Factory** — jamais le compte GitHub personnel `lombre33`, ni en
  crédits ni ailleurs dans l'UI.
- Site : **grist-factory.fr**.
- Licence : **GNU GPL v3.0**, lien vers le dépôt public sous l'organisation GitHub `grist-factory` (pas le dépôt
  de développement personnel — ex. `github.com/grist-factory/Publipostage-Plus`, distinct de
  `lombre33/publipostagegrist`).
- Un panneau « Crédits » (dans les Réglages) porte Auteur / Site / Licence / Bio. La Bio est encore un texte
  provisoire écrit par Claude sur Publipostage+ — **à reformuler par Antoine**, ne pas la dupliquer telle quelle
  sur un autre widget sans la lui faire valider.
- **Logo** : chaque widget affiche discrètement le logo Grist Factory (l'avatar du Grist éponyme) dans son
  chrome — placement de référence, choisi par Antoine sur Publipostage+ : en haut à droite, juste après l'icône
  Réglages (`#v2-brand-logo` : rond de 20 px, opacité .85, posé en absolu à 10 px du coin). Discret veut dire une
  taille de repère de marque, pas un élément qui capte l'attention ni qui déplace les contrôles existants autour de
  lui (non-régression, cf. §1 « Non-régression »). L'asset lui-même n'est pas vendorisable comme les autres
  dépendances (§1 « Pas de framework ») : c'est un fichier image à obtenir auprès d'Antoine (avatar du Grist « Grist
  Factory »), pas à recréer ou à deviner.

### Palette : neutre + un seul accent, pas de « monochrome » au sens gris-sur-gris
« Interface principalement monochrome » (règle d'Antoine) veut dire : une base de gris (fond/surface/bordure/texte
à plusieurs intensités) + **un seul bleu d'accent** pour les actions/états actifs, et rien d'autre sans raison
fonctionnelle. Deux couleurs sémantiques s'y ajoutent, jamais décoratives :
- **Rouge** — erreurs, actions destructrices : `--danger` pour une bordure, un filet ou une icône, `--danger-ink` pour un TEXTE (cf. « Contrastes »).
- **Ambre** — attention/état en attente (conflit d'autosave sur Publipostage+, badge « connexion en cours » sur
  SlidesPlus) : la même intention existe déjà sur les deux widgets, avec des teintes proches mais pas encore
  unifiées en un token partagé — à harmoniser si un design system commun est créé.

Palette exacte de Publipostage+ (`css/style.css`, jetons de `:root`, thèmes clair et sombre) :

| Rôle | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond app | `--bg` | `#f4f6fa` | `#171b23` |
| Surface (cartes, barres, fenêtres) | `--surface` | `#ffffff` | `#1e2430` |
| Surface enfoncée | `--surface-sunken` | `#eef1f6` | `#262e3c` |
| Bordure / bordure forte | `--border` / `--border-strong` | `#dde2ea` / `#c3cad6` | `#323b4b` / `#465166` |
| Texte | `--text` | `#1b2430` | `#e7ecf5` |
| Texte atténué (un seul gris de texte, cf. « Contrastes ») | `--text-muted` = `--text-faint` | `#5f6b7e` | `#9aa6bb` |
| **Accent** (unique) : liens, états actifs, focus ; survol | `--accent`, `--accent-hover` | `#2f6fed`, `#2558c4` | `#5b91f5`, `#74a3f7` |
| Accent plein (fond d'un bouton à texte blanc) ; survol | `--accent-solid`, `--accent-solid-hover` | `#2f6fed`, `#2558c4` | identiques au clair |
| Accent doux : fond, bord | `--accent-soft`, `--accent-soft-border` | `#e8f0fe`, `#c7dbfd` | `#24324b`, `#35507d` |
| Texte d'accent sur fond teinté ; réussite (texte, fond) | `--accent-ink` ; `--good`, `--good-soft` | `#2558c4` ; `#146c48`, `#e5f6ee` | `#74a3f7` ; `#6fd3a3`, `#163326` |
| Texte discret posé sur la page blanche (éditeur, Lecture) | `--paper-text-faint` | `#667085` | identique au clair |
| Danger ; fond doux | `--danger`, `--danger-soft` | `#d84343`, `#fbe9e9` | `#f08a8a`, `#3a2426` |
| Texte rouge (message d'erreur, « Retirer la condition », « Supprimer », compteur dépassé, avertissement) | `--danger-ink` | `#c53030` | `#f08a8a` |
| Voile derrière les fenêtres | `--pp-scrim` | `rgba(15, 23, 42, .45)` | `rgba(3, 6, 12, .62)` |
| Rayon d'angle | `--radius-sm` | 7 px sur les contrôles (boutons, champs, lignes de liste), 8 px sur le cadre des fenêtres, rond pour les pastilles et le logo : coins arrondis partout, jamais carrés | idem |
| Ombres | `--shadow-float`, `--shadow-card` | portée douce pour les éléments flottants et les fenêtres, très légère pour les cartes | plus marquée |

Ne pas ajouter une couleur qui n'a pas de rôle sémantique clair (pas de couleur « parce que c'est joli »).

### Contrastes : 4,5:1 au moins, en clair comme en sombre
Arbitré le 29/09 après l'audit (en ligne `c428609`) : tout texte, lien, bouton plein et anneau de focus atteint **4,5:1**
au moins dans les deux thèmes (avant : texte discret à 2,58:1 en clair, liens des Crédits à 1,65:1 en sombre, blanc des
boutons pleins à 3,08:1 en sombre). Règles à suivre :
- Le gris de texte le plus pâle admis est `--text-faint` (= `--text-muted`, `#5f6b7e` en clair : 4,61:1 au moins sur tous les fonds clairs, dont le gris des cadres `--surface-sunken`
  où l'ancien `#667085` n'avait que 4,39:1) ; jamais un gris plus clair pour un texte. Le gris de la page blanche (`--paper-text-faint`, `#667085`) et celui du PDF et du Word ne changent pas.
- Un **texte rouge prend `--danger-ink`** (`#c53030` en clair, 4,67:1 au moins sur tous les fonds ; en sombre le même rouge que `--danger`), jamais `--danger`, qui ne fait que 4,37:1 sur blanc.
  `--danger` reste aux bordures, aux filets et aux icônes (3:1 suffit). Le défaut revenait à chaque nouveau texte rouge, corrigé règle par règle : il est réglé une fois au jeton (Antoine, 04/10, « Tout corriger »).
  `codeHygiene` (section 10) refuse toute règle `color: var(--danger)` hors des quatre boutons à icône seule, et `contrast` mesure chaque texte rouge et chaque gris sur son fond.
- Un **bouton plein à texte blanc prend `--accent-solid`** (et `--accent-solid-hover`), jamais `--accent` : celui-ci
  s'éclaircit en sombre et le blanc dessus tomberait à 3,08:1.
- Liens et texte d'accent : `--accent`. Anneau de focus : `outline: 2px solid var(--accent)`. Texte d'aide des champs
  (`::placeholder`) : `--text-muted` en sombre.
- Une règle neuve qui pose une couleur de texte, de fond de bouton ou de focus prend ces jetons. Le groupe de tests
  `contrast` mesure la couleur calculée sur l'élément réel, fond composé, en clair puis en sombre ; un nouveau bouton
  plein s'ajoute à sa liste.
- Un texte d'accent posé sur un fond teinté (`--accent-soft`, `--surface-sunken`) prend `--accent-ink`, jamais `--accent`
  (3,97 à 4,43:1 sur ces fonds) : c'est le cas du texte fantôme « Ajouter un en-tête / pied de page », visible au survol
  sur le fond de sa zone. Un message de réussite prend `--good` sur `--good-soft`.
- La page (éditeur, Lecture) reste blanche dans les deux thèmes : un texte discret posé dessus prend `--paper-text-faint`,
  jamais `--text-faint`, qui s'éclaircit en sombre (2,46:1 sur blanc). Une zone qui prend le fond teinté du thème au
  survol (en-tête et pied de page remplis) y reprend le gris du thème. Dans le PDF et le Word, le texte barré d'un item
  coché d'une liste à cases prend ce même gris (`#667085`, 4,97:1) comme en Lecture, et non `#98a2b3` (2,6:1) (Antoine, 01/10).

### Deux polices, jamais mélangées : chrome vs contenu produit
Un principe distinctif, présent dès l'origine sur Publipostage+ et à reproduire sur tout widget qui génère un
contenu exportable :
- **Police de chrome** (barres d'outils, boutons, libellés, tout ce qui n'est pas le document produit) :
  **Manrope** (poids 500/600/700/800), géométrique et moderne.
- **Police du contenu produit** : celle qui part réellement à l'export. Sur Publipostage+, c'est **Roboto**,
  auto-hébergée (`css/roboto-fonts.css`) en regular/italique/gras/gras-italique — délibérément les MÊMES fichiers
  que ceux embarqués dans le PDF par `pdfmake`, pour que la pagination affichée à l'écran soit identique à celle
  du PDF. Ne jamais laisser la police du contenu dériver de celle réellement exportée.
- Base non stylée (avant les tokens) : `Arial, sans-serif` — n'apparaît jamais telle quelle une fois l'app chargée.

### Thème sombre : uniquement le chrome, jamais le contenu produit
Règle stricte, documentée en commentaire dans le CSS de Publipostage+ : le thème sombre change la couleur de la
barre du haut, du plan de travail, des modales et des panneaux flottants — **jamais** la page/le document
lui-même, qui reste blanc avec son texte sombre dans les deux thèmes. Raison : ces couleurs sont celles qui
partent réellement au PDF/DOCX ; les inverser ferait mentir l'aperçu sur ce qui sera produit. Ce principe
s'applique à tout widget qui prévisualise un contenu destiné à l'export (donc potentiellement aussi la diapositive
de SlidesPlus une fois son éditeur construit).

Mécanique : 3 choix utilisateur (système / clair / sombre), mémorisés en `localStorage`, appliqués via l'attribut
`data-theme` sur `<html>` ; la préférence système (`prefers-color-scheme`) ne joue que si l'utilisateur n'a rien
choisi explicitement. Le voile derrière les fenêtres suit lui aussi le thème (`--pp-scrim`, plus foncé en sombre) : il
n'y a plus de voile clair fixe.

### Icônes : traits monochromes, jamais de police d'icônes ni d'emoji
Toutes les icônes de Publipostage+ sont des SVG en **contour** (`stroke`, pas de remplissage), intégrées en
`mask-image` CSS plutôt qu'en `<img>` : l'icône hérite alors de la couleur du bouton (texte/accent selon l'état),
donc elle s'adapte automatiquement au thème clair/sombre et à l'état survolé/actif sans doublon d'asset. Pas de
police d'icônes (Font Awesome, etc.), pas d'emoji dans le chrome de l'app (SlidesPlus utilise encore un emoji
`⛶` sur son unique bouton — état de fondation, cf. §4).

Deux règles d'Antoine s'y ajoutent :
- **Une icône = une fonction.** La punaise veut dire « favori » (section « Épinglés » de la liste des modèles) et rien
  d'autre, l'étoile « modèle par défaut » : on ne réutilise jamais un tracé pour une seconde fonction (Antoine les
  confondait quand elles partageaient le même dessin, 29/09).
- **Aucun indice décoratif sous un bouton à menu.** Les petites puces bleues qui signalaient un menu au survol ont été
  retirées à sa demande (29/09) ; le menu s'annonce à l'accessibilité par `aria-haspopup` / `aria-expanded`. Ne pas
  remettre d'indice visuel sans lui demander.

### Un seul éditeur, une seule barre d'outils, partagés par tous les modes
Publipostage+ a un seul composant d'édition et une seule barre d'outils (`#v2-toolbar`) pour tous ses modes
(Édition, Lecture et Email) : `switchMode()` (`js/main.js`) ne masque que la zone
éditeur/lecteur, jamais la barre d'outils elle-même. Un bouton sans effet dans un mode donné est **grisé**
(classe `v2-hf-locked`), jamais masqué ni dupliqué dans un composant séparé. Toute nouvelle fonctionnalité de
toolbar transposable à plusieurs modes (ex. bouton `#Variable`) est un composant partagé unique, pas une copie
par mode. Ce principe — pas de duplication de code d'UI entre modes/contextes d'un même widget — est une règle
explicite d'Antoine, pas seulement une observation.
**Seule exception, voulue par Antoine (02/10, « un mode Lecture épuré qui enlève la toolbar etc. pour juste avoir la lecture clean d'un document »)** : la **Lecture épurée**
(`js/clean-reading.js`, `css/clean-reading.css`) cache la barre du haut en entier - barre, champs de l'email, barre de mise en forme, bandeau « Revenir au macro-modèle » - et laisse le document seul dans le panneau. Ce n'est
pas un troisième mode : c'est la Lecture dans un état de plus (`pp-clean-reading` sur `<body>`), que rien n'allume sans un geste (la ligne « Lecture épurée » du menu au survol du bouton
Mode lecture : la barre reste gelée, aucune icône de plus) et que rien ne garde d'une ouverture du widget à l'autre. On en sort par le bouton rond du coin haut droit ou par Échap (qui
attend une fenêtre ou un fil de commentaire ouvert), et le mode d'où l'on venait revient. Elle ne modifie rien : une personne en lecture seule y a droit comme les autres.

### Non-régression stricte de l'UI existante
Règle d'Antoine valable sur tous les widgets : **on ajoute des éléments d'UI, on ne modifie ni ne supprime ceux
qui existent déjà** sans son accord explicite. Une barre d'outils jugée dense ou perfectible (cf. Publipostage+,
§3) reste telle quelle tant qu'il n'a pas validé un changement — la réponse à une UI qu'on n'ose pas retoucher
n'est jamais de la retoucher quand même, c'est de proposer sans y toucher. Deux précisions :
- Une fonction indisponible dans un contexte est **grisée, jamais masquée** : mode Lecture (la barre de mise en forme
  est grisée), mode Email, droits par personne (opacité .35, plus de clic), export en cours. La seule exception est la Lecture épurée, demandée par Antoine le 02/10 (§3) : la barre
  y disparaît tout entière, sur un geste, et revient à la sortie.
- Un défaut qui revient se corrige **une fois pour toutes**, à sa cause commune, pas fenêtre par fenêtre ni menu par
  menu : c'est ce qui a donné la base commune des fenêtres et le pont de survol des menus (§3).

### Bilingue fr/en systématique
Chaque chaîne d'interface visible passe par un attribut `data-i18n` (ex. `data-i18n="settings.credits.author"`)
résolu par un module i18n dédié (`js/i18n.js` sur Publipostage+, clé `fr`/`en` en miroir). Toute chaîne d'UI
ajoutée ou modifiée doit avoir sa traduction anglaise dans le **même lot** — jamais en suivi séparé.

### Vocabulaire et écriture des textes
Arbitré le 29/09 (« Oui, partout », en ligne `fc44fb1`) après un relevé de neuf textes « template », treize pluriels
entre parenthèses et trois écritures du vide :
- Le mot est **« modèle »**, jamais « template » dans un texte français (fichiers et identifiants peuvent garder
  `template`) ; on écrit « Macro-modèle », avec majuscule et trait d'union.
- **Pas de pluriel entre parenthèses** (« 1 ligne(s) trouvée(s) ») : les pluriels s'écrivent `{n|singulier|pluriel}` dans
  `js/i18n.js` (« {count} {count|ligne trouvée|lignes trouvées} » ; en français 0 et 1 sont au singulier, en anglais
  seul 1).
- **Le vide d'une liste** s'écrit « — Choisir … — » (tirets longs) ; « — Aucune — » seulement quand « aucun » est un
  vrai choix.
- Le groupe de tests `codeHygiene` refuse « ligne(s) », « template » en français et « -- … -- ».
- Une indication ou un avertissement sous un champ commence **sous ce champ**, pas sous son libellé.

### Fenêtres : une seule base pour toutes
Arbitré le 29/09 (« Les dix », en ligne `5fd9409` puis `b78d24f`). Toutes les fenêtres du widget — celles écrites dans
`index.html` (Réglages, Tables liées, Clé de correspondance, Macro-modèle, Organiser mes modèles, Galerie, Aperçu),
celles des variables (Condition, Autres attributs, Boucle, Liste) et les saisies/confirmations — reposent sur
`js/modal-base.js` et `css/modal-base.css`. Avant : des largeurs de 380 à 960 px sans règle, un voile clair fixe même en
sombre pour six d'entre elles, un titre qui sortait de l'écran, un clavier qui s'échappait de la fenêtre.
- **Trois zones** : le titre (fixe), le contenu (la seule zone qui défile), les boutons (fixes : « Fermer », « Annuler »…).
  La fenêtre tient dans le panneau de 700×400 : le cadre est plafonné à la hauteur du panneau moins 12 px de chaque côté,
  titre et boutons restent visibles. Le cadre porte `role="dialog"`, `aria-modal="true"` et `aria-labelledby`.
- **Trois largeurs** : 400 px (question, tables liées, clé de correspondance, saisies), 480 px (formulaires : Réglages,
  Macro-modèle, Organiser, fenêtres de variable), grande (Galerie, Aperçu : 960 px plafonnés au panneau). Une nouvelle
  fenêtre choisit l'une des trois.
- **Voile** : `--pp-scrim`, qui suit le thème. Un clic sur le voile ne ferme rien.
- **Clavier**, tenu par une seule écoute pour la fenêtre du dessus : le focus entre dans la fenêtre à l'ouverture et
  revient à l'élément qui l'avait à la fermeture ; Tab et Maj+Tab tournent dans la fenêtre, même quand le focus est tombé
  sur `<body>` ; Échap la ferme (une liste avec recherche ouverte ferme d'abord son propre panneau). Pour une fenêtre
  écrite dans `index.html`, Échap déclenche son bouton de fermeture : même sortie qu'à la souris.
- **Empilement** : 1990 pour les fenêtres de variable, 2000 pour celles d'`index.html`, 2050 pour la clé de
  correspondance (elle s'ouvre par-dessus la fenêtre de condition comme par-dessus un macro-modèle, écrit après elle dans
  `index.html`), 2100 pour les saisies et confirmations, qui s'ouvrent par-dessus toutes les autres.
- **Une nouvelle fenêtre** passe par `ModalBase.create({...})` (bâtie en JS) ou `ModalBase.adopt(id, {closeId})` (déjà
  dans `index.html`, branchée dans `wirePageModals` de `js/main.js`) ; jamais d'écouteur Tab ou Échap posé sur le voile.
  Le réglage propre à la zone de contenu d'une fenêtre s'écrit avec deux classes (`.sa-fenetre .sa-liste`), sinon la
  règle de la base l'emporte.

### Couches flottantes : le dernier menu ouvert est toujours au-dessus
Règle d'Antoine du 01/10 (« le dernier menu qui s'ouvre doit toujours être au-dessus de l'existant », vue avec la liste `#`
qui s'ouvrait sous la barre du tableau). Avant : chaque couche avait son `z-index` écrit en dur (barre flottante 2000, liste `#`
1000, menus de la barre du haut 15, liste des modèles 40, info-bulles 50), sans aucun ordre entre elles. Une seule règle,
posée une fois dans `js/layers.js` et trois jetons de `css/style.css`, pas menu par menu :
- **Quatre niveaux, toujours dans cet ordre** : barres flottantes d'une sélection (tableau, image, bulle ; `--z-floating-toolbar`)
  < menus, listes et popups (`--z-menu`) < info-bulles (`--z-tip`) < fenêtres (1990 et plus, section précédente). Une barre
  flottante ne recouvre donc jamais un menu, et un menu ne recouvre jamais une fenêtre.
- **Dans le niveau des menus, le dernier ouvert est dessus** : toute couche flottante appelle `Layers.raise(élément)` à son
  OUVERTURE (ou à chaque placement d'un popup en cours d'usage, comme la liste `#`), jamais à chaque recalage d'un menu déjà
  affiché, qui changerait de rang sans que rien ne s'ouvre. Le rang s'ajoute au niveau et ne le dépasse jamais.
- **Les barres flottantes ne sont pas rangées entre elles** : un seul clic en ouvre souvent deux (une bulle ou un bloc dans
  une case de tableau : la barre de la bulle, puis celle du tableau quand le focus arrive). Elles gardent l'ordre du DOM, la
  plus précise (bulle, image, bloc) est créée après la plus générale (tableau) et reste dessus ; « la dernière ouverte
  au-dessus » mettrait la barre du tableau sur les boutons de la bulle (vu au rejeu de `condTextMouse`, panneau de 360 px).
- **Un popup ouvert depuis le champ d'une fenêtre passe devant elle** : les fenêtres (1990 à 2100) sont au-dessus des trois
  niveaux, aucun rang de menu ne suffit (la liste `#` du champ de la fenêtre « Calcul » s'ouvrait dessous, invisible).
  `Layers.raise(popup, fenêtre)` (`ViewportFit.placePopup`, option `over`) prend le `z-index` de CETTE fenêtre + 1 à chaque
  ouverture, quelles que soient les couches ouvertes avant : ni jeton propre à une fonctionnalité ni `!important`.
- **Aucun `z-index` de 100 ou plus écrit en dur** dans une feuille de style, aucun jeton `--z-*` hors `css/style.css`, aucun
  `z-index` en `!important`, aucun `style.zIndex` hors `js/layers.js` : `codeHygiene` le vérifie. Une nouvelle couche flottante prend le jeton de son niveau et appelle `Layers.raise` quand elle
  s'ouvre ; elle se vérifie avec une barre de tableau, d'image ou de bulle affichée, au centre de chacune de ses lignes
  (`layers`, `layersMouse`).

### Saisies et confirmations : des fenêtres du widget, plus de boîtes du navigateur
Arbitré le 29/09 (« Saisies et confirmations », en ligne `aafa4e0`).
- `Dialogs.prompt({title, label, message, value, confirmLabel})` (`js/dialogs.js`) rend le texte tapé, `null` si annulé,
  `''` si le champ est vidé puis validé (« aucun dossier » n'est pas « annulé ») ; `Dialogs.confirm({title, message,
  confirmLabel, danger})` rend un booléen. Toujours avec `await` : oublier `await` prend une promesse pour un « oui »
  (le groupe `codeHygiene` le vérifie et refuse tout `prompt()` / `confirm()` natif dans `js/`).
- Le titre est la question ; les boutons sont « Annuler » puis l'action nommée (« Créer », « Supprimer », « Continuer »…).
  Une confirmation **destructrice** (`danger`) met le focus sur Annuler, pour qu'un Entrée distrait ne supprime rien.
- Une seule fenêtre à la fois : une demande qui en interrompt une l'annule.
- Après Annuler ou Échap, le clavier revient sur le bouton qui a ouvert la fenêtre, **même si ce bouton était grisé par
  le verrou d'export** (« Créer l'email » et « Email trop long » ; de même à la fin d'un export lancé au clavier) — choix
  d'Antoine « Corriger », en ligne `7fa43b0`. À la souris, rien ne change.
- Les `alert()` d'information restent des alertes du navigateur (choix d'Antoine).

### Choisir une colonne, une table ou un modèle : la liste avec recherche
Demande d'Antoine (29/09). Tout choix de colonne, de table ou de modèle passe par la liste avec recherche
(`js/search-select.js` : `attachColumns`, `attachTables`, `attachTemplates`), jamais par un `<select>` natif visible. Le
`<select>` reste la source de vérité, masqué ; une colonne s'affiche avec son type ; la valeur vide est grisée ; si le
composant échoue, la liste native reste (`try/catch`). Le champ **Valeur** d'une règle sur une colonne à choix ou à
référence (`attachValues`) est lui aussi une liste avec recherche des valeurs possibles, « Autre valeur… » toujours en
bas. Sur une colonne **Oui / Non** (case à cocher), c'est la liste « Oui » / « Non » (« Yes » / « No » en anglais), sans
« Autre valeur… » ni saisie libre (demande d'Antoine du 01/10 : limiter les entrées à la main, source d'erreurs) : ce sont
les mots que la comparaison lit ; une valeur déjà enregistrée dans une autre graphie (« vrai », « 1 ») s'affiche
« Oui » / « Non », une valeur que la comparaison ne lit pas reste visible avec « valeur non reconnue » jusqu'à ce qu'on
choisisse. Sur cette colonne, les opérateurs sans sens (« > » et « ≥ » retiennent toutes les lignes, « < », « ≤ » et
« contient » aucune) sont **grisés** dans la liste des opérateurs, jamais retirés ; l'opérateur déjà enregistré reste
affiché et choisi (choix « Griser » d'Antoine, 01/10). La colonne d'une règle de **macro-modèle** et celle de la **condition d'une bulle** (demande d'Antoine du 01/10, puis
son choix « À plat » du même jour pour la condition) sont UNE seule liste qui réunit celles de toutes les tables, sans
intitulé : celles de la page en nom nu, les autres en « Table.Colonne », retrouvées par leur nom ; une table pas encore
liée ouvre la clé de correspondance par-dessus (Annuler remet la colonne précédente), et le lien d'une table liée se lit
sous la règle une fois la colonne choisie ; « Autre (colonne d'une autre table…) » reste en bas. Dans toute recherche de colonne qui réunit plusieurs tables (cette liste à plat, la liste « # » du corps et des champs texte, le menu « Image depuis une variable »), les colonnes de la **table en cours** viennent en tête, avant celles des autres tables, avec ou sans lettres tapées (demande d'Antoine du 01/10) : c'est la table de la page ; dans une zone répétée par une boucle, celle que la zone parcourt passe avant elle ; chaque table garde l'ordre de ses colonnes, les autres tables celui du schéma, et la limite de 50 clés de la liste « # » s'applique après ce classement.

### Le panneau de référence : 700×400
Antoine utilise Publipostage+ dans un panneau Grist d'environ **700×400 px** : tout doit y tenir et s'y manier à la souris.
- Un popup (autocomplétion `#`, fil de commentaires, image depuis une variable) se place **après** son affichage, d'après
  sa vraie hauteur (`ViewportFit.placePopup` : dessous, sinon au-dessus, avec défilement si rien ne suffit) ; les
  info-bulles se décalent pour rester dans le panneau.
- Un texte trop long pour sa case ne déborde pas, n'est pas coupé net et ne passe pas à la ligne : il est tronqué par
  « … ». Pour une bulle de variable dans une case étroite ou une colonne de zone à 2 colonnes, c'est le **milieu** du nom
  qui est coupé, début et fin gardés (« #Projets.Det…Fonctionnement »). Le message d'état de la barre du haut est coupé
  de la même façon, son texte entier au survol.
- Tout changement d'interface est vérifié à ce format, **à la vraie souris et au vrai clavier** (Tab, Échap), en clair et
  en sombre, en français et en anglais.

### La langue de ce que le widget écrit dans le document
Arbitré le 29/09 (en ligne `87a2a63`). Ce que le widget écrit lui-même dans le document — le message d'une variable qui ne
se résout pas (« [ERREUR : … ] »), le titre du sommaire — suit la **langue de l'interface** de qui lit ou exporte, en
Lecture comme en PDF et en Word (clés `variables.error.*` et `pdf.tocTitle` de `js/i18n.js`).

### Pas de framework, pas d'étape de build, dépendances tierces encadrées
Les deux widgets sont des pages statiques (HTML/CSS/JS vanilla, pas de React/Vue, pas de bundler) servies telles
quelles — contrainte du modèle de distribution des widgets personnalisés Grist (GitHub Pages). Sur les
dépendances tierces, les deux widgets divergent sciemment (voir §3/§4) : c'est un point à trancher au cas par cas
pour un nouveau widget, pas une règle unique.

---

## 2. Où vit quoi (pour ne pas confondre les deux dépôts)

| | `publipostageGrist` | `SlidesPlus` |
|---|---|---|
| Rôle | Édition et publipostage de documents texte riches (contrats, factures, courriers) | Édition de présentations façon diaporama, avec publipostage par diapositive/table |
| État | Mature, en développement actif de fonctionnalités | Fondation seulement — **pas encore un éditeur utilisable** |
| Moteur d'édition | TipTap/ProseMirror, chargé depuis un CDN (esm.sh) via import map ESM | Fabric.js 7.4.0, **vendorisé** (fichier committé, servi same-origin) |
| Dépendances tierces | Chargées depuis CDN — SRI structurellement impossible en ESM ; vendorisation écartée pour l'instant (décision d'Antoine, 2026-09-18) | Vendorisation systématique de toute dépendance tierce (sauf le SDK Grist lui-même) — voir `DEPENDENCIES.md` |
| Module partagé | `shared/` (accès API Grist, résolution de variables cross-table) — en cours de factorisation avec SlidesPlus, dépôt séparé prévu mais pas encore créé | Consomme le même `shared/` |
| Accès Grist demandé | `full` | `full` (même raison : variables/tables croisées) |

Les deux widgets partagent délibérément le même moteur de résolution de variables et les mêmes enseignements de
sécurité (`AUDIT_CODE.md` de `publipostageGrist` sert de référence à `SlidesPlus`) — une cohérence technique qui
va dans le même sens que la cohérence visuelle demandée par Antoine.

---

## 3. Spécifique à Publipostage+

- Barre d'outils V2 (`#v2-toolbar` + `.bar-row`) : une quarantaine de boutons, presque tous en icône seule sans libellé
  texte (45 dont 8 avec texte, selon l'audit du 29/09), sur **deux lignes à 700×400** (38 % de la hauteur du panneau) et
  jusqu'à **5 rangées** en dessous de 420 px de large, avec sous-menus révélés au survol. Constat de densité admis par
  Antoine mais **chantier gelé** — c'est ce qui a fait préférer un ajustement automatique de la mise en page à un
  contrôle de zoom manuel. Ne rien ajouter dans cette barre sans son accord. Faciliter la prise en main d'un nouvel
  utilisateur (lien vers la galerie dans le document vide, libellés sur la barre d'une variable) lui a été proposé le
  29/09 : il a répondu **« Laisser »**, ne pas le reproposer.
- Menus au survol (`.v2-hover-group` / `.v2-hover-flyout`) : un menu ne se referme pas quand la souris descend lentement
  du bouton vers lui — le pont de survol est porté par le groupe (`--v2-flyout-gap`) ; donc ni `overflow: hidden` ni
  marge entre le bouton et son menu, et tout nouveau menu passe par ces deux classes. Un groupe de boutons à coins
  arrondis n'a pas non plus d'`overflow: hidden` (il rognerait leurs info-bulles) : les coins sont portés par les
  boutons d'extrémité. Après un clic à la souris, l'info-bulle de focus d'un bouton reste cachée (`pp-tip-pointer`)
  jusqu'au prochain appui sur Tab ; celle du survol reste.
  Le bouton principal d'un de ces menus (« + », « Enregistrer », « Qualité PDF », « Titre »…) ne prend pas le focus à la souris : le
  curseur reste dans le texte et le menu se referme quand la souris part (retour d'Antoine du 01/10 : « + » et « Qualité PDF » restaient
  ouverts) ; la règle est commune (`editor-core.js`), un menu neuf n'a rien à coder ; au clavier, Tab ouvre toujours le menu.
- Liens et blocs de contenu (demande d'Antoine du 01/10, « une seule icône pour tout ça ») : une seule icône de la barre
  (la chaîne, à la place de l'ancienne icône Citation) ouvre au survol un menu à lignes — « Lien… » (le raccourci Ctrl+K
  est écrit sur la ligne), « Citation », « Bloc de code », « Encadré… », « Bloc de signature » et « QR code… » (titre du volet « Lien et
  blocs de contenu ») ; les blocs suivants s'y ajoutent comme lignes, jamais comme nouvelles icônes. Une ligne qui n'a pas
  de sens à cet endroit est grisée, jamais masquée : « Lien… » dans un bloc de code, « Bloc de code » quand il effacerait
  une bulle `#Variable` ou une image, « Encadré… », « Bloc de signature » et « QR code… » en mode Email et dans un en-tête ou un pied de
  page, tout le menu en mode macro et en Lecture. Fenêtre du lien (base commune des fenêtres) : « Adresse du lien » (http, https, mailto, tel ; sans
  protocole, `https://` est ajouté, une adresse e-mail devient `mailto:`, un numéro `tel:` ; `javascript:` et le reste sont
  refusés), « Texte à afficher » seulement quand rien n'est sélectionné, « Retirer le lien » seulement sur un lien
  existant (bouton cerclé de rouge, texte `--text` : `--danger` seul ne fait que 4,37:1 sur le fond de la fenêtre) ;
  l'erreur s'affiche sous le champ (barre rouge à gauche, texte normal) ; Ctrl+K ouvre la fenêtre, y compris au clavier
  seul, Entrée valide, Échap annule et rend le clavier à l'éditeur. Dans l'éditeur, un clic simple sur un lien place le
  curseur et n'ouvre rien ; Ctrl/⌘+clic l'ouvre dans un nouvel onglet ; le survol affiche l'adresse et « Ctrl+clic pour
  ouvrir » dans une info-bulle. Un lien est bleu `#0563C1` souligné (papier blanc : 5,9:1, comme dans Word), cliquable en
  Lecture, en PDF et en Word, écrit « texte (adresse) » dans un e-mail. Un bloc de code est en chasse fixe (Cousine ; Courier
  New en Word) sur fond gris, sans variables, et un PDF ne le coupe qu'entre deux lignes.
  Encadré (réponse d'Antoine du 01/10 : « encadré Note, Attention ou Important, couleur et icône au choix ») : « Encadré… »
  ouvre une fenêtre de la base commune, qui tient dans 700×400 sans défiler — Type (« Note » bleu, « Attention » orange,
  « Important » rouge : un point de départ qui pose couleur et icône ensemble), Couleur (six ronds : bleu, vert, orange,
  rouge, violet, gris), Icône (information, triangle, point d'exclamation, coche, ampoule, étoile) et un aperçu sur une
  feuille blanche (le papier reste blanc en sombre). Les flèches et Début/Fin changent le choix, un seul arrêt de Tab par
  groupe, Entrée valide, Échap annule. Dans un encadré la ligne devient « Modifier l'encadré… » et la même fenêtre offre
  « Retirer l'encadré » (même bouton cerclé de rouge que « Retirer le lien ») ; il laisse tout le texte à sa place, la
  sélection où elle était, un seul Annuler ; en mode suivi le cadre est barré et son texte inséré (choix « Corriger »
  d'Antoine, 01/10) : « Tout accepter » rend le texte seul, jamais un cadre vide, « Tout refuser » l'encadré d'origine.
  L'encadré est un fond teinté, une barre de 4 px de la couleur d'accent à gauche et l'icône dans la marge, le texte
  garde la couleur du document ; palette unique
  (`js/callout.js`) lue par l'éditeur, la Lecture, le PDF et le Word, texte ≥ 4,5:1 sur les six teintes, barre et icône
  ≥ 3:1. Pas de titre écrit tout seul ; seuls la couleur et l'icône sont gardées (le type n'est pas stocké). Entrée deux
  fois en sort, comme d'une citation ; sur un élément de liste, l'encadré prend la liste entière. En e-mail (texte brut) il
  s'écrit sans fond ni mot ajouté. Bloc de signature : une zone 2 colonnes toute faite (trois lignes vides pour signer, une
  ligne de tirets bas, puis « Nom et signature » à gauche et « Date » à droite) posée sous le bloc du curseur, jamais dedans ;
  c'est du texte ordinaire, qu'on modifie (une variable à la place du nom, une autre légende).
- Rechercher / Remplacer (demande d'Antoine du 01/10 ; sa réponse à la carte : « Ajouter la loupe », la seule icône ajoutée à la barre gelée) : une barre fine entre la barre d'outils et
  le texte, jamais une fenêtre - le modèle reste visible et modifiable pendant qu'on cherche. La loupe est sur la dernière rangée, après Rétablir (aucune rangée de plus à 700 px) ; allumée tant que
  la barre est ouverte, grisée en Lecture et en macro-modèle, son infobulle dit « Rechercher / Remplacer (Ctrl+F) ». Ctrl+F / ⌘F ouvre la barre, Ctrl+H (⌘⇧H sur Mac, ⌘H est réservé à macOS)
  y ajoute la ligne « Remplacer par » : où que soit le clavier, même resté sur un bouton de la barre d'outils, sauf sous une fenêtre ouverte et quand l'éditeur n'est pas à l'écran (la
  recherche du navigateur reprend alors la main). Un mot sélectionné est repris dans le champ ; Entrée / Maj+Entrée passent au résultat suivant / précédent en repartant de l'autre bout ;
  « 3 sur 12 » dit où l'on est, « Aucun résultat » grise les flèches (grisées, jamais retirées). « Respecter la casse » et « Mot entier » sont deux boutons à état, le chevron de gauche montre
  ou cache « Remplacer par ». Tous les résultats sont surlignés en jaune pâle `#ffe58f`, le courant en orange `#ffb347` cerclé de `#8a4b00` (le cerclage le distingue sans la couleur) :
  couleurs fixes, la page reste blanche en sombre, le texte garde la sienne (8:1 au moins). Espaces insécables et apostrophes ou guillemets courbes valent leurs formes droites ; une
  correspondance ne traverse jamais deux paragraphes ni deux cases ; ne se trouvent pas : les bulles (variables, calculs, numéros de page), les images, le texte supprimé en suivi, et l'en-tête
  ou le pied de page tant qu'on ne les modifie pas. « Remplacer » met le texte au résultat courant puis passe au suivant (sans résultat courant il se place d'abord sur le prochain) ;
  « Tout remplacer » les remplace tous et dit combien (« 5 remplacements »). Chaque remplacement est UNE étape d'annulation, « Tout remplacer » compris ; Ctrl+Z, Ctrl+Maj+Z et Ctrl+Y agissent
  sur le modèle même quand le clavier est resté sur un bouton de la barre (dans un champ, Ctrl+Z reste celui du champ). Le nouveau texte garde la mise en forme du texte remplacé (gras,
  couleur, lien) ; avec le suivi des modifications allumé, le remplacement devient une suppression et une insertion suggérées, comme une frappe. Échap ferme depuis n'importe quel contrôle
  de la barre, rend le clavier au texte et laisse le dernier résultat sélectionné ; la barre se ferme aussi quand l'éditeur disparaît (Mode lecture, macro-modèle).
- QR code (demande d'Antoine du 01/10, « un lien présent dans une cellule Grist (variable) ou un lien externe qui peut être rentré » ; sa réponse à la carte de placement : « Menu chaîne ») : une ligne
  « QR code… » dans le menu de l'icône chaîne « Lien et blocs de contenu », la dernière, sous « Bloc de signature », jamais une nouvelle icône ; sur un QR code sélectionné elle devient « Modifier le QR code… »
  (son nom accessible aussi). Elle est grisée, jamais masquée, en mode Email et dans un en-tête ou un pied de page (pas de QR code à cet endroit pour l'instant), et avec tout le menu en macro-modèle ;
  dans une grille elle reste active (l'image se pose sur sa case, résolue comme à la Lecture dans l'Excel). La
  fenêtre est de la base commune et tient dans 700×400 sans défiler : « Adresse ou texte » (le champ a le focus), « Insérer une colonne… » (la liste avec recherche des colonnes, rangée
  par-dessus la fenêtre ; taper « # » dans le champ ouvre la même liste, elle aussi par-dessus), l'indication « Une colonne donne un QR code propre à chaque ligne. », et à droite un
  aperçu sur une petite feuille blanche (un QR code se lit noir sur blanc, aussi en sombre) : celui de la ligne en cours quand le texte contient une colonne, avec la légende « Pour la
  ligne en cours. ». Un message dit pourquoi il n'y en a pas (champ vide, colonne vide, texte trop long, aucune ligne en cours) ; « Insérer » ne se grise que pour un champ vide ou un
  texte trop long. Entrée valide, Échap ferme sans rien insérer. Un texte seul donne tout de suite une image carrée de 120 px ; un texte avec une colonne donne un cadre carré
  pointillé, comme une image de variable, avec l'icône d'un QR code et le texte : le vrai QR code est dessiné à la Lecture et à l'export, un par ligne (dans une zone répétée, comme
  une bulle). Une colonne vide pour la ligne retire le QR code ; une cellule du widget Lien de Grist (« titre adresse ») donne l'adresse seule quand elle est tout le texte ; un nombre
  s'écrit brut ; un texte trop long ou une bibliothèque qui ne charge pas laisse « [QR code : texte trop long] » ou « [QR code indisponible] » dans la langue de l'interface, jamais
  une image cassée. Le texte du cadre est en `--text`, comme celui d'un cadre d'image de variable (Antoine, 02/10 : « Foncer ce texte », le gris n'y faisait que 4,39:1 sur son fond en clair) ; l'icône garde le gris. Elle a son action dans Réglages > Raccourcis
  (« QR code… », sans touche d'origine), comme les autres lignes du menu.
- Modes et droits : Édition, Lecture et Email partagent la même barre. En Lecture la barre de mise en forme est grisée
  (`applyFormattingBarLock`) ; les droits par personne (Réglages > Accès : lecture seule, export, commentaires) grisent
  aussi (`pp-access-locked`), sans jamais masquer. Commenter reste actif en Lecture et agit sur le texte sélectionné dans la
  Lecture, qui surligne alors les passages commentés (choix d'Antoine du 30/09) ; sans le droit de commenter, la Lecture
  reste sans commentaires, comme l'export. La Lecture épurée (demande d'Antoine du 02/10, §3) cache toute la barre du haut sur un geste : ce n'est ni un mode ni un droit, et elle reste
  ouverte aux personnes en lecture seule (elle ne modifie rien). Réglages > Accès a une case « Ouvrir les personnes en lecture seule sur la Lecture épurée » (choix d'Antoine du 02/10, carte « Un réglage »),
  décochée au départ et grisée tant qu'aucune colonne « Lecture seule » n'est choisie : la personne dont la ligne de la table des droits dit « lecture seule » ouvre alors le widget sur la Lecture épurée,
  une seule fois par session, à la première réponse confirmée des droits : une réponse qui tarde ou une table illisible n'est pas une réponse (la relecture de 10 s peut encore aboutir), une personne absente de la table,
  sans identité ou sans réglage n'ouvre rien ; sortie faite, elle n'y est pas ramenée. Réglages > Accès reste verrouillé pour qui ses propres droits mettent en lecture seule (sinon l'onglet suffirait à se déverrouiller) et, par précaution, tant que la table des droits est illisible pour la personne (une règle d'accès de Grist la lui cache) ; mais quand la table n'existe plus du tout (supprimée ou renommée dans Grist), l'onglet reste modifiable pour en choisir une autre et dit « La table des droits n'existe plus » (choix d'Antoine du 02/10, carte « Rendre l'onglet Accès modifiable quand la table des droits n'existe plus ? ») : le reste de l'interface demeure en lecture seule jusqu'à ce qu'une table soit rechoisie, et dans le doute (liste des tables illisible, table peut-être cachée) rien ne se déverrouille. L'onglet Vue (Selon la ligne, Modèle par défaut de cette vue) suit les droits en direct : dès qu'ils changent Réglages ouverts (choix dans l'onglet Accès, case cochée dans la table des droits, relecture de 10 s), il se grise ou se dégrise sans qu'on rouvre les Réglages (choix d'Antoine du 02/10, carte « Dégriser l'onglet Vue dès que les droits reviennent, sans rouvrir les Réglages ? »), sans redessiner ce que la personne y saisit (même champ, même valeur, même focus).
- Lecture sans ligne (demande d'Antoine du 04/10 : « quand le widget n'a pas le select by de configuré, il affiche "Aucune ligne sélectionnée" : il faudrait guider l'utilisateur proprement sur ce qu'il faut faire, avec du texte et des captures d'écran »)
  : quand la Lecture n'a aucune ligne à montrer et que « Sélectionner par » est vide (ou que Grist ne dit pas le lien), elle montre un guide à la place du message (`js/reader-guide.js`, `css/reader-guide.css`). Une seule carte
  (`--surface`, bordure, ombre de carte : le fond du conteneur de la Lecture est sombre en thème sombre mais blanc quand l'aperçu A4 est coupé, tout le texte est donc posé sur la carte, jamais sur ce fond), un titre (« Reliez ce widget à votre
  tableau »), une phrase qui dit pourquoi, puis trois étapes séparées d'un filet : « Étape n » en petites capitales grises, son titre, une phrase d'appui, des repères numérotés (rond bleu `--accent-solid` de 18 px, chiffre blanc, les mêmes chiffres
  que sur la capture) et sa capture, à droite du texte quand la place y est (mesuré : à 700 px) et dessous sinon (420 px). Les étapes : mettre le tableau sur la page, relier le widget par « Sélectionner par » (onglet « Données source » du
  panneau de droite de Grist), cliquer sur une ligne. Les captures (`img/reader-guide/{fr,en}-{1,2,3}.png`) sont celles du vrai Grist, dans la langue de l'interface du widget, libellés vérifiés dans le code de Grist (`static/locales/{fr,en}.client.json`),
  repères et flèche posés par-dessus ; enregistrées au double de leur taille (écrans à forte densité), affichées à 66 % ; un clic, Entrée ou Espace les montre à leur taille réelle et la gardent à l'écran (bouton, `aria-pressed`, info-bulle
  « Cliquer pour agrandir / réduire la capture »). À refaire, `IMAGE_VERSION` montée, si Grist déplace ce réglage. Le guide se tient à jour sans recharger (Grist renvoie les options dès que le lien change : `GristAPI.getLinkState` /
  `onLinkStateChange`), suit la langue, et cède la place au document dès qu'une ligne arrive. Un widget déjà relié (rien à régler, seulement un clic à faire) garde le court message « Aucune ligne sélectionnée » ; une version de Grist qui ne dit
  pas le lien reçoit le guide et, en dernière ligne, « Ce widget est déjà relié ? Cliquez simplement sur une ligne du tableau. ». Les titres du guide sont des `<p role="heading">`, pas des `<h2>` : `css/style.css` peint tout titre du conteneur de la
  Lecture en gris-bleu foncé (la page blanche du document), invisible sur le fond sombre du thème sombre.
- Sélecteur de modèle en arbre (dossiers) : le `<select>` natif reste en place, masqué, source de la valeur. Punaise =
  favori personnel, étoile = modèle par défaut (jamais un modèle Email) ; chaque dossier s'ouvre replié ou déplié selon le
  choix de l'utilisateur ; la fenêtre « Organiser mes modèles » range (dossiers, glisser-déposer, « Déplacer vers… »).
  La liste reste sobre (retours d'Antoine du 01/10) : même corps que les menus de la barre (12,5 px), noms en graisse
  normale, dossiers en demi-gras ; « Organiser » est un petit bouton dans l'en-tête fixe de la liste, en haut à droite, et
  non dans la barre ; pas de ligne « Nouveau modèle » dans la liste (le bouton « + » crée un modèle) ; renommer un modèle
  remplace son nom, sur place, par un champ de même largeur (pas de champ à côté de la liste).
- Bouton Enregistrer (retours d'Antoine du 01/10) : un clic enregistre. Son menu, ouvert au survol comme celui de « + » ou d'« Exporter », propose « Enregistrer sous… »
  (une copie) et la ligne cochée « Enregistrement automatique » (activé par défaut, choix gardé par navigateur) ; la barre n'a plus ni bouton « Enregistrer sous » ni bascule
  d'enregistrement automatique. À la souris, le bouton et ses lignes ne prennent pas le focus : le curseur reste dans le texte et le menu ne reste pas ouvert une fois la souris
  partie ; au clavier, Tab descend dans le menu. Réactiver l'enregistrement automatique n'efface pas ce qui a été tapé pendant la coupure.
  Enregistrement automatique coupé : le coin d'état dit « Modifications non enregistrées. » (texte normal, pas rouge) dès qu'une modification attend,
  jusqu'au prochain enregistrement ; allumé, le coin reste vide pendant la frappe, l'enregistrement part tout seul.
  Le bouton Enregistrer dit lui aussi l'état (retour d'Antoine du 01/10) : bleu et blanc enregistrement automatique allumé, noir et blanc classique (fond noir, glyphe blanc) coupé, sans changer de taille, et noir dès la PREMIÈRE image rendue au rechargement, jamais bleu puis en fondu vers le noir (le `<head>` d'`index.html` pose `pp-autosave-off` sur `<html>` avant les feuilles de style ; `saveMenuMouse` compte les images et lit le rendu réel). Enregistrer deux fois de suite ne crée jamais deux modèles (carte d'Antoine du 02/10, « Corriger ») : un deuxième clic ou Ctrl+S pendant qu'un enregistrement écrit encore (Grist lent) attend la fin du premier, puis enregistre le texte à jour dans la même ligne ; plusieurs gestes d'affilée n'en font qu'un, et « Enregistrer sous… » attend aussi. La fenêtre d'un macro-modèle ignore le clic en trop de son « Enregistrer ». Dans l'aperçu de la galerie, un deuxième clic sur « Utiliser ce modèle » ou « Utiliser avec une nouvelle table de données » pendant la création est ignoré (un seul modèle, une seule table).
- Quitter un modèle dont une modification attend (carte d'Antoine du 01/10, « Toujours demander ») : changer de modèle à la liste, « + », « Nouvel email », « Nouvelle grille » et « Utiliser
  ce modèle » de la galerie ouvrent d'abord la fenêtre « Modifications non enregistrées » : Annuler, Abandonner, Enregistrer (le bouton principal, où le focus arrive). Elle est posée que
  l'enregistrement automatique soit allumé ou non, et il n'écrit rien tant qu'elle est ouverte. Annuler et Échap restent sur le modèle (la liste le montre à nouveau, le curseur revient où
  il était) ; Abandonner perd la modification ; Enregistrer l'écrit puis continue. Un nouveau modèle sans nom n'a pas d'Enregistrer, et le message dit pourquoi. Aucune question quand rien
  n'attend, en lecture seule, pour un macro-modèle (il s'édite dans sa fenêtre) ni après « Supprimer » (le modèle n'existe plus). « Importer un Excel… » (menu « + ») pose la même fenêtre APRÈS le choix du fichier, une fois le classeur lu : un fichier illisible n'en demande pas et ne change rien ;
  Annuler garde le modèle ouvert.
- Nom de modèle déjà pris (demande d'Antoine du 01/10, « nom(x) avec incrémentation de x ») : un nom que porte déjà un autre modèle devient « nom (2) », puis « nom (3) »... avec une espace
  avant la parenthèse, comme les noms de fichiers d'une archive ; majuscules et espaces autour ne comptent pas (« contrat » et « Contrat » sont le même nom), et un nom qui finit déjà par « (n) »
  continue sa série (« Rapport (2) » donne « Rapport (3) », jamais « Rapport (2) (2) »). Le nom n'est vérifié qu'à la validation : Entrée ou un clic ailleurs sur le crayon « Renommer »,
  Enregistrer, Ctrl+S, « Enregistrer sous… », « Utiliser ce modèle » de la galerie, la fenêtre du macro-modèle ; jamais lettre par lettre, et jamais par l'enregistrement automatique, qui
  n'écrit que le nom courant. « Enregistrer sous… » arrive avec le premier nom libre déjà saisi et sélectionné : Entrée suffit, une frappe le remplace. Le coin d'état dit le nom retenu
  (« Ce nom existe déjà : renommé « Rapport (2) ». ») ; enregistrement automatique coupé il garde « Modifications non enregistrées. », le nouveau nom se lit dans le titre. Un modèle
  déjà enregistré qui garde son nom n'est jamais renommé, même s'il a un jumeau d'avant la règle.
- Variables : cliquer une variable ouvre sa barre flottante (Condition, Autres attributs, Boucle, Liste, réglages nombre/date) ;
  en édition, une bulle à condition est en pointillés ; les fenêtres correspondantes reposent sur la base commune. Dans
  une règle, « = » sur une colonne à choix multiples ou une liste de références veut dire « contient ce choix » (arbitré
  le 29/09).
- Bloc de texte conditionnel (demande d'Antoine du 01/10) : une ligne « Texte conditionnel » (« Conditional text ») de l'onglet Chips du menu des variables, jamais une nouvelle
  icône. Sans sélection, un bloc vide se pose à la place de « # » et le curseur s'y met ; avec du texte sélectionné, le bouton « Insérer une variable » ouvre la liste sur Chips,
  la ligne en surbrillance, et Entrée entoure le texte (qui n'est jamais remplacé par « # »). Le bloc contient des paragraphes, des listes, des tableaux, des variables
  (conditionnelles comprises) et d'autres blocs, à toute profondeur. Petit par défaut (demande d'Antoine du 02/10), il épouse son contenu : vide, il n'a que la largeur de son étiquette,
  et son cadre s'agrandit à mesure qu'on écrit - plus large avec le texte jusqu'à la largeur de la page, plus haut à chaque retour à la ligne - sans jamais changer un retour à la
  ligne par rapport à l'export ; un contenu que l'export place sur toute la largeur (texte centré, à droite ou justifié, image, tableau, ligne, code, encadré, zone 2 colonnes, saut
  de page, image flottante à gauche plus haut) lui garde toute la largeur. Un clic dans le texte d'un bloc resté sélectionné y pose le curseur (une bulle, une image et l'étiquette gardent leur clic). Il se délimite sans changer la largeur du texte (cadre en `outline`), dans la direction artistique des
  bulles : fond `#eaf2ff`, texte `#12406b`, liseré `#b7cdf2` en pointillés, plus foncé (`#5b7fc0`) une fois la condition posée, anneau d'accent une fois sélectionné ; l'étiquette dit
  « Si Statut = Urgent » ou « Texte conditionnel · sans condition ». Un clic sur l'étiquette sélectionne le bloc et ouvre la barre flottante des variables : seule la condition
  d'affichage y sert (même fenêtre que pour une bulle, mêmes colonnes, mêmes liens entre tables) ; « Autres attributs », « Boucle » et « Liste » n'ont pas d'objet ici, grisés par
  `aria-disabled` avec leur raison en info-bulle, jamais retirés. Le cadre n'existe que dans l'éditeur : condition remplie, le texte se lit sans cadre ni ligne ajoutée ;
  sinon le bloc et tout ce qu'il contient disparaissent, sans ligne vide, en Lecture, PDF, Word et e-mail (un bloc masqué emporte ceux qu'il contient). Entrée sur un paragraphe
  vide en fin de bloc en sort, comme d'une citation ; Retour arrière sur le bloc sélectionné le supprime avec son contenu. « Défaire le bloc » (choix « Fenêtre » d'Antoine, 01/10) :
  dans la fenêtre de condition d'un bloc seulement (jamais dans celle d'une bulle), à côté de « Retirer la condition », il retire le cadre et la condition et laisse tout le texte à
  sa place, un seul Annuler rend le bloc ; son texte garde la couleur du texte (le rouge de « Retirer la condition » ne fait que 4,4:1 sur blanc). Les quatre boutons de la fenêtre
  d'un bloc à condition passent sur deux lignes - les retraits au-dessus, Annuler et Enregistrer dessous, à droite - quand ils ne tiennent pas côte à côte (le français dans les
  480 px) : jamais un bouton hors de la fenêtre.
- Valeur conditionnelle (demande d'Antoine du 02/10, « une valeur - un ou plusieurs mots, un nombre, etc. - qui s'affiche de manière conditionnelle » ; sa réponse à la carte : « Dans la
  phrase », pas un mot dans le bloc) : une ligne « Valeur conditionnelle » (« Conditional value ») de l'onglet Chips du menu des variables, juste après « Texte conditionnel », jamais une
  nouvelle icône ; le pendant EN LIGNE du bloc. Sans sélection, une valeur vide se pose à la place de « # » et le curseur s'y met ; avec du texte sélectionné (d'un seul paragraphe), le bouton
  « Insérer une variable » ouvre la liste sur Chips et Entrée entoure ce texte. Elle contient du texte mis en forme, des bulles et des retours à la ligne (Entrée y fait un retour à la ligne,
  jamais un nouveau paragraphe) et se pose là où une bulle se pose (paragraphe, titre, élément de liste, case de tableau, colonne, encadré, en-tête ou pied de page, ligne d'une boucle),
  pas dans un bloc de code. Petite par défaut : vide, un cadre de 2,2 em avec son texte d'attente « valeur » (`#12406b`, italique, au moins 4,5:1 sur le voile) ; il grandit avec ce qu'on
  tape et ses retours à la ligne, sans marge ni étiquette ajoutées au texte, donc la phrase passe à la ligne là où elle le fera à l'export (cadre en `outline`, dans la direction artistique
  des bulles : liseré `#b7cdf2` en pointillés sur un voile bleu pâle, `#5b7fc0` une fois la condition posée). Les espaces d'une valeur sont les siens et partent avec elle. Au clavier : → à la
  fin de la valeur et ← à son début en sortent sans que le curseur bouge à l'écran, et le texte tapé ensuite se pose là où le curseur est, jamais dedans ou dehors au hasard du navigateur
  (au bord d'un cadre, Chrome choisit seul le côté) ; Retour arrière au début et Suppr à la fin effacent le caractère voisin, comme si la valeur n'était pas là ; vider son texte la laisse
  vide avec sa condition, Retour arrière ou Suppr dans une valeur vide la retire. Un clic dans la valeur ouvre la barre flottante des variables, réduite à la condition d'affichage (même
  fenêtre que pour une bulle ou un bloc, mêmes colonnes, mêmes liens entre tables) ; « Autres attributs », « Boucle », « Liste » et « Colonne » n'ont pas d'objet ici, grisés par `aria-disabled` avec leur
  raison en info-bulle, jamais retirés. « Défaire la valeur », dans la fenêtre de condition d'une valeur seulement, retire le cadre et la condition et laisse le texte à sa place (un seul
  Annuler rend la valeur). Condition remplie, le texte se lit sans cadre au fil de la phrase ; sinon la valeur disparaît, le texte autour reste (une valeur masquée emporte celles qu'elle
  contient), en Lecture, PDF, Word, Excel et e-mail. Suivi des modifications : une valeur dont tout le contenu était une suggestion ne laisse pas de cadre vide quand on accepte ou refuse tout.
- Calcul (demande d'Antoine du 01/10, « variables calculées ») : une ligne « Calcul » (« Calculation ») de l'onglet Chips du menu des variables, jamais une nouvelle icône ; elle remplace le « # » tapé et
  ouvre la fenêtre « Insérer un calcul » (base commune, 480 px, sans défilement dans 700×400) : le champ « Formule » (le focus y est ; « # » y ouvre la liste des colonnes par-dessus la fenêtre, Entrée y
  choisit une colonne sans valider), l'indication de la syntaxe sous le champ, une rangée « Fonctions » (SOMME, MOYENNE, MIN, MAX, NB, ARRONDI ; SUM, AVERAGE, MIN, MAX, COUNT, ROUND en anglais : un clic écrit
  « SOMME() » au curseur ou autour du texte sélectionné, le focus reste dans le champ) et, dessous, le résultat pour la ligne courante, mis à jour à la frappe (gris atténué tant que la formule se construit,
  texte plein et liseré d'accent quand elle aboutit, liseré rouge après une validation refusée avec la raison dite en clair : le texte garde sa couleur, le rouge ne fait que 4,4:1 sur blanc). La bulle n'entre
  qu'à « Insérer » (Annuler et Échap ne laissent rien, un seul Annuler la retire). Elle est verte comme les chips et le numéro de page (une valeur calculée, pas une colonne Grist : jamais bleue comme une
  variable), se lit « = #Facture.HT × 0,2 » dans la langue et avec la touche du moment, est coupée au milieu par « … » dans une case ou une colonne, et devient rouge avec son message en info-bulle quand sa
  formule ou une colonne ne se lit plus. Sa barre flottante est celle des variables : « Modifier le calcul » (le double-clic et Entrée aussi), les réglages nombre (FR / US, décimales, devise, Lettres, bouton Ø) ;
  condition d'affichage, autres attributs et boucle y sont GRISÉS avec leur raison (« Disponible pour une variable, pas pour un calcul »), jamais retirés. Le résultat s'écrit comme une colonne nombre : FR par
  défaut (espace insécable des milliers), US en anglais, zéro caché par défaut ; une erreur s'écrit dans le document dans la langue de l'interface (« [ERREUR: Division par zéro.] »), jamais un total faux.
- Bulle choisie (demande d'Antoine du 01/10 : « un mini feedback visuel (changement léger de la couleur de fond ?) pour confirmer que l'on peut copier ») : un clic sur une bulle de variable ou
  de calcul change légèrement son FOND, tant qu'elle est sélectionnée, sans autre effet (ni cadre, ni ombre, ni animation) : bleu `#b9d2f8` pour une variable (texte 6,9:1), vert `#b9e3cb` avec le
  texte `#0f5a37` pour un calcul (5,9:1), rouge `#f3cccc` pour une bulle cassée (5,1:1), soit 1,25 à 1,4:1 du fond d'une bulle ordinaire. Le liseré, les pointillés d'une condition, le repère de
  boucle et le point du format ne bougent pas (`background-color` seulement) ; la teinte est la même en clair et en sombre, la page du document restant blanche. Règles
  `.tiptap .var-badge.ProseMirror-selectednode` et `.tiptap .calc-badge.ProseMirror-selectednode` ; les chips verts (date, heure, e-mail, note, numéro de page) n'ont pas ce retour.
- Autres attributs : « Insérer » ajoute les attributs cochés juste après la bulle ; « Remplacer » (demande d'Antoine du
  01/10, entre « Annuler » et « Insérer », qui reste le bouton bleu) les met à sa place. C'est la même bulle dont la
  colonne change : son gras, sa couleur, sa boucle, sa condition (sauf case « Reprendre la condition d'affichage »
  décochée) et son format quand la nouvelle colonne est du même genre (nombre ou date) restent ; un seul Annuler la
  rend. Avec plusieurs attributs cochés, le premier prend la place de la bulle et les autres suivent, séparés par une
  espace. Grisé tant que rien n'est coché, comme « Insérer ».
- Écriture d'un nombre : tant qu'aucun réglage n'est posé, la barre d'une bulle nombre montre FR allumé (US en interface
  anglaise) et le document écrit déjà ainsi — espace insécable entre les milliers, virgule (choix d'Antoine du 01/10) ;
  ce que la barre annonce est ce qui s'applique, sans avoir à recliquer. « — » écrit sans séparateur de milliers. Les
  champs texte (Objet, À, Cc, Cci, nom du PDF) gardent le nombre tel que Grist le stocke.
- Zéro d'un nombre : par défaut, un vrai zéro d'une colonne Numérique ou Entier ne s'écrit pas en Lecture, en PDF ni en
  Word (choix d'Antoine du 01/10, modèles déjà enregistrés compris) ; la barre de la bulle a un seul bouton en bascule,
  icône « 0 » qui devient « Ø » (barré) quand le zéro est masqué : enfoncé = masqué, relâché = « 0 » écrit. Une icône,
  une fonction : pas de menu. Les champs texte et la liste des attributs gardent le 0.
- Liste d'une variable (demande d'Antoine du 04/10, « un UI simple et efficace pour gérer les listes ») : une bulle sur une colonne Liste de choix ou Liste de références (celle d'une table
  liée comprise) a son bouton « Liste » dans sa barre flottante, entre « Boucle » et « Colonne » ; icône `varList`, deux crochets autour de trois points (à 2,5 d'écart, les points se lisaient
  comme un tiret à 15 px). Il ouvre une fenêtre de la base commune (dans 700×400, titre et boutons fixes) : « Afficher », puis quatre choix sur une même ligne, en boutons à la manière de ceux
  de la Boucle (`aria-pressed`) : « Toutes les valeurs » (celui du départ), « La première », « La dernière » et « La n-ième ». « Toutes les valeurs » montre « Séparateur » (« , » au départ,
  espaces comprises) et « Avant la dernière » (vide = le même séparateur ; « , » puis « et » écrit « A, B et C ») ; « La n-ième » montre « Numéro » (de 1 à 999, 1 au départ ; sans valeur à ce
  rang la bulle n'écrit rien) ; la première et la dernière n'ont aucun champ. Les champs sont en grille, l'étiquette puis le champ, et l'indication qui suit commence sous le champ ; les deux séparateurs tiennent sur une seule ligne quand la fenêtre fait au moins 520 px de large
  (un panneau de 700×400 n'a pas la place d'une ligne de plus), l'un sous l'autre sinon. Dessous, un
  aperçu d'une ligne, calculé avec le vrai formatage sur la ligne sélectionnée du tableau et mis à jour à chaque frappe (« Ligne sélectionnée (n° 3) : 2 valeurs (A, B). Le document écrit
  « A et B ». »). Rien n'est écrit dans le modèle avant « Enregistrer » ; Échap et « Annuler » le laissent tel quel ; « Remettre par défaut » (texte rouge sans cadre, à gauche) n'existe que si la
  bulle a déjà un réglage, il le retire tout de suite. Sans réglage, la bulle écrit exactement ce qu'elle écrivait avant (les valeurs séparées par « , ») : aucun modèle déjà enregistré ne
  change. Le réglage est une clé du format de la bulle (`format.list`, avec les seules clés qui s'écartent du départ : `pick`, `index`, `separator`, `lastSeparator`) : il allume le point bleu
  des bulles réglées et vaut partout où la bulle s'écrit (Lecture, PDF, Word, Excel, e-mail, lot). Il suit une colonne remplacée (« Autres attributs », Remplacer) seulement vers une autre
  colonne liste. Une bulle dans une boucle reçoit déjà une valeur par tour : le réglage n'y servirait à rien, le bouton est grisé (`aria-disabled`, raison en info-bulle) ; il l'est aussi sur
  une colonne qui n'est pas une liste, un calcul, un bloc de texte conditionnel, une valeur conditionnelle et une case conditionnelle : grisé, jamais retiré.
- « Un document par valeur » (second volet de la demande d'Antoine du 04/10 sur les listes : « une feature qui indiquera que ça fera un export par valeur ») : dans la fenêtre « Liste », sous les
  champs et au-dessus de l'aperçu, une case « Un document par valeur » (décochée au départ ; libellé en gras 12 px, assez haut - 22 px - pour une souris), suivie sur la même ligne de son indication
  (« Exports PDF, Word et Excel seulement. » ; elle passe sous le libellé, pas sous la case, quand la place manque). Cochée, l'aperçu gagne une seconde ligne verte sous la première (« Export :
  3 documents, un par valeur (A, B, C). » ; « un seul document » pour une ligne à une valeur ou à liste vide) et la fenêtre la fait venir en vue dans un panneau bas ; la case va avec
  n'importe lequel des quatre choix (ils règlent ce que la Lecture écrit). Enregistrer l'écrit dans `format.list` (clé `perValue`, qui suffit seule à allumer le bouton « Liste » et le point bleu) et la
  bulle porte à droite une petite icône bleue (deux pages l'une sur l'autre, 10 px, jeton `--pp-split-icon-accent`), posée en image de fond comme celle d'une boucle « dans la phrase » pour laisser le
  point bleu - sauf dans une boucle, où le réglage ne s'applique jamais. Les exports sortent alors un document par valeur de la ligne, tout le reste identique : l'archive ZIP de PDF (un PDF par valeur,
  nommé « ligne - valeur »), le PDF unique (chaque document commence sur une nouvelle page), les archives de Word et d'Excel, le classeur Excel unique (une feuille « ligne - valeur », 31 caractères au
  plus, la valeur toujours lisible) et l'export d'une seule ligne (une archive à partir de deux documents, le fichier ordinaire sinon) ; la confirmation d'un lot ajoute une phrase avec le nombre de
  documents. Deux listes réglées sur des colonnes différentes donnent un document par combinaison (la première change le plus lentement), deux bulles sur la même colonne prennent la même valeur, une
  ligne à liste vide garde un seul document (la bulle n'écrit rien). Ni la Lecture ni l'e-mail ne découpent : ils écrivent la liste comme réglée. Sans bulle réglée ainsi, un export reste ce qu'il était.
- Variable Oui / Non (demande d'Antoine du 01/10) : une bulle sur une colonne Oui / Non a sa propre barre flottante, comme une date ou
  une image, à quatre boutons d'une même rangée : les trois styles de la liste à cases (`accentStrike`, `classic`, `accentPlain`, mêmes
  icônes, mêmes noms que les boutons de la liste) puis « vrai / faux » (« true / false » en interface anglaise). Sans réglage la bulle
  écrit « vrai » ou « faux » dans la langue de l'interface et « vrai / faux » est le bouton enfoncé : choisir ce bouton retire le réglage
  du modèle (un seul état « sans réglage », pas de réglage « texte » à côté), comme « — » pour un nombre. Les trois autres posent
  `{ type: 'bool', style }` ; le bouton du style posé est enfoncé (`aria-pressed`, fond différent des trois autres). Dans la barre, ces trois
  icônes sont à 20 px (à 15 px elles ne se lisent plus) ; l'infobulle de chaque case nomme son style, la première précise que le
  barré ne vaut que pour une liste. En Lecture, au PDF, au Word, à l'Excel et à l'e-mail, la bulle devient une vraie case à cocher, de la
  taille de celle d'un item de liste (1,07 em, jamais plus haute que la ligne) : accent coché `#2f6fed`, accent décoché `#767676`,
  classique coché `#222222`, classique décoché `#6b7684` (4,5:1 au moins sur blanc, la page reste blanche en sombre) ; l'accent coché est
  une case pleine à coche blanche, la classique cochée un contour à coche de sa couleur, une case décochée un contour sur fond blanc ;
  son `aria-label` dit « Coché » ou « Décoché » (« Checked » / « Unchecked »). Le PDF peint ces cases dans
  deux polices maigres du widget (`js/pdf-fonts-boxes.js`, générée par `dev-tests/build-pdf-boxes-font.py`) parce que les polices
  embarquées n'ont pas ☐ ni ☑ ; l'e-mail écrit « [x] » et « [ ] ». Les deux styles « accent » dessinent la même case : le texte
  qui suit une case n'est jamais barré, le barré n'existe que dans la liste à cases (choix « la case seule » d'Antoine, 01/10). Objet, À, Cc, Cci, nom
  du PDF et attributs d'une ligne liée gardent « true » / « false » tels que Grist les stocke (aucune case dans un champ texte). Un
  réglage de format s'applique partout où celui d'une date s'applique : une colonne de boucle en tableau, une boucle dans la phrase, un
  en-tête ou un pied de page.
- Case conditionnelle (demande d'Antoine du 01/10, « une case cochée ou décochée en fonction d'une condition basée sur une colonne » ; sa réponse à la carte : « Puce dédiée », pas un
  texte conditionnel) : une ligne « Case conditionnelle » (« Conditional checkbox ») de l'onglet Chips du menu des variables, jamais une nouvelle icône ; UN clic la pose à la place de «
  # » et la sélectionne, sa barre flottante est déjà ouverte pour choisir la condition (un clic sur une ligne de la liste referme les barres à la fin de son `mousedown` : la sélection
  est reposée juste après). Elle se pose là où une bulle se pose (paragraphe, titre, élément de liste, case de tableau, colonne, en-tête ou pied de page, ligne d'une boucle). La puce
  suit la direction artistique des bulles (fond `#eaf2ff`, texte `#12406b`, liseré `#b7cdf2`, en pointillés `#5b7fc0` une fois la condition posée) et montre la case décochée de la
  Lecture puis son étiquette, « Si Statut = Urgent » ou « sans condition » ; trop longue pour sa case ou sa colonne, elle coupe le milieu de son étiquette par « … », sans déborder ni
  passer à la ligne, et elle n'agrandit pas la ligne. Sa barre : les trois styles de case de la variable Oui / Non (mêmes icônes, mêmes noms, pas de « vrai / faux » : une case est
  toujours une case) et le bouton Condition, qui ouvre la même fenêtre que pour une bulle ou un bloc (mêmes colonnes, mêmes liens entre tables, Copier / Coller entre les trois) sous le
  titre « Condition de la case », avec « Cocher si » devant la combinaison de plusieurs règles et un aperçu qui dit si la case est cochée pour la ligne courante ; « Autres attributs »,
  « Boucle » et « Liste » n'ont pas d'objet ici, grisés par `aria-disabled` avec leur raison en info-bulle, jamais retirés. Une case neuve est « accent, texte normal » (les deux styles « accent »
  dessinent la même case, rien n'est barré). Elle se lit cochée quand la condition est remplie pour la ligne affichée
  (pour la ligne du tour dans une zone répétée), décochée sinon, et décochée sans condition ou quand la condition ne se lit plus ; la case est celle de la variable Oui / Non (mêmes
  couleurs, même nom accessible « Coché » / « Décoché ») en Lecture, PDF, Word, Excel et e-mail (« [x] » / « [ ] »).
- Barres flottantes d'une bulle, d'un tableau ou d'une image : ancrées dans l'éditeur, aucune n'est ouverte quand il est
  masqué (Lecture, résumé d'un macro-modèle), qu'on y passe à la souris ou au clavier (choix « Corriger » d'Antoine,
  01/10) ; elles ne recouvrent jamais la barre du haut. Un clic hors de l'éditeur et hors de la barre ferme celle d'une
  bulle, d'un tableau ou d'une image (choix « Corriger » d'Antoine, 01/10) ; un clic sur l'objet la rouvre.
- Image en calque (devant ou derrière le texte) : sélectionnée, les flèches du clavier la déplacent de 1 px de mise en page, de 10 px avec
  Maj (demande d'Antoine du 01/10, « déplacer une image aux flèches ») ; la touche tenue appuyée répète, un Ctrl+Z défait une rafale
  d'un coup, l'image s'arrête au bord de la page, l'infobulle de sa poignée de déplacement le dit. Une image dans le texte, le
  curseur et Maj + flèche dans le texte gardent leurs flèches ; le curseur qui ARRIVE sur l'ancre d'une image en calque la traverse
  encore à la flèche suivante, sans la faire glisser (un clic sur l'image ou une action de sa barre flottante rendent les flèches à
  l'image). Avec le suivi des modifications allumé, un déplacement laisse une trace, au glissé de la poignée comme aux flèches (choix d'Antoine du 01/10) : l'image d'origine
  reste à sa place, estompée dans un cadre rouge en tirets, et sa copie à la nouvelle place porte un cadre vert plein ; « Tout accepter » garde la copie, « Tout refuser » rend l'original ; une
  rafale de flèches n'écrit qu'une trace et un Ctrl+Z la défait d'un coup ; un clic sans déplacement n'écrit rien ; l'original barré ne se déplace pas (ses flèches gardent leur sens ordinaire).
  Le cadre se pose sur l'image (en calque elle sort du flux : la teinte du texte suggéré n'y aurait pas de boîte), mêmes vert et rouge que le texte suggéré (6,4:1 et 6,6:1 sur la page blanche).
  Le paragraphe qui ne porte qu'une image en calque, la ligne où on l'a posée, garde sa ligne vide dans l'éditeur, la Lecture, le PDF et le Word (Antoine, 02/10, « écart entre l'éditeur et le mode
  lecture ») : le texte qui suit descend d'une ligne dans les quatre, les coupures de page tombent aux mêmes lignes, en haut du modèle comme après un saut de page, dans une case ou une colonne.
- Image « Au cœur du texte » et texte autour (Antoine, 02/10, point 9, et sa carte du point 10, « La rendre fidèle ») : l'éditeur, la Lecture, le PDF et le Word posent l'image et son texte de la même façon.
  Sans alignement et « en ligne », l'image est dans la ligne de texte, son pied sur la ligne de base (la ligne grandit) ; sans alignement et « bloc », elle est seule sur sa ligne, à gauche, le texte d'avant finit sa
  ligne et celui d'après repart dessous ; centrée, seule sur sa ligne, au centre ; alignée à gauche ou à droite, elle flotte et le texte l'habille, celui des paragraphes suivants aussi tant qu'elle les dépasse (12 px côté
  texte, 8 px dessous ; une image flottante plus large que la ligne rétrécit de cette marge pour tenir à côté du texte). Le paragraphe garde son interligne avant et après une image seule sur sa ligne, sans ligne en plus sous elle. Le bouton « Basculer en ligne / bloc » de la barre de l'image est grisé, jamais retiré,
  quand il ne change rien (image seule dans son paragraphe, alignée ou en calque) : son info-bulle dit pourquoi. Dans le PDF le texte autour garde ses lignes et ses retraits : un paragraphe justifié va jusqu'au bord de la
  ligne comme dans l'éditeur (à 0,3 pt près), la dernière ligne d'un paragraphe centré ou à droite n'a pas l'espace de fin des autres, une note de bas de page garde son numéro et sa place après son mot, et une image habillée
  qui ne tient pas dans ce qui reste de la page ouvre la page suivante avec le texte à côté d'elle. Dans un titre, une case de tableau, une colonne ou un encadré, l'image habillée et le texte autour sont posés comme dans le texte courant :
  la case et la colonne contiennent l'image, l'encadré non (elle le dépasse et le texte d'après se range encore à côté d'elle, comme dans l'éditeur ; il passe à la page suivante avec elle quand elle ne tient pas) ; chaque ligne garde les mots
  que l'éditeur y met, même quand le navigateur renvoie « : » à la ligne : un paragraphe, un titre, une case, une colonne ou un encadré où l'éditeur commence une ligne par « : » (ou « ; ! ? , . ) ] } / » après une espace)
  est coupé au même endroit dans le PDF, avec ou sans image, et un encadré d'une seule ligne y a la hauteur de celui de l'éditeur, l'icône ne le grandit pas (cartes d'Antoine du 02/10, « Là où ça diffère » et « L'aligner »).
- Image derrière le texte : « Sur toutes les pages » (choix d'Antoine du 01/10, la Fiche mission : un triangle dans le coin de chaque feuille). Un bouton de la barre flottante de l'image, entre
  les boutons de calque et la corbeille (une icône = une fonction : la feuille de derrière et le coin plein de celle de devant), qui peint l'image à la MÊME place de chaque page, dans l'éditeur,
  la Lecture, le PDF (fond de page) et le Word (ancre derrière le texte dans l'en-tête de chaque page, première page comprise ; un en-tête est créé quand il n'y en a pas). La place est celle de la
  grille page de l'image, en points depuis le coin du contenu, bande de l'en-tête comprise : ajouter ou retirer un en-tête déplace donc un coin posé à ras de la feuille. Le bouton est grisé, jamais
  retiré, hors du calque derrière le texte (image dans le texte ou devant, en-tête et pied, mode grille) et, sans Aperçu A4, tant que l'image n'a pas sa place de page ; son info-bulle dit pourquoi.
  Passer devant ou dans le texte efface la case, et revenir derrière le texte ne la rend pas. Dans un macro-modèle chaque courrier a sa couche, sur ses pages, dans le PDF ; le Word n'a qu'un
  en-tête : toutes les couches y valent pour tout le document, jusqu'aux sections par courrier. Le module `PageLayer` (`js/page-layer.js`) est la couche de page commune : le filigrane de
  « Paysage et portrait » s'y appuie (règle « Filigrane » plus bas), une couche et non deux.
- Légende (demande d'Antoine du 01/10, « la légende sous une image ou un tableau ») : un bouton « Légende » dans la barre flottante de l'image (avant « Supprimer ») et dans celle du tableau (avant la couleur de fond),
  jamais une icône de plus dans la barre du haut. Sans légende, il en pose une, vide, juste sous le bloc (sous le paragraphe qui porte l'image, avant le paragraphe suivant, dans la même case ou la même colonne) et y met le
  curseur, avec « Légende… » (« Caption… ») en gris sur la feuille (4,5:1 au moins) ; avec une légende, il est actif (« Aller à la légende ») et y ramène le curseur à la fin, jamais un retrait. Il est grisé, jamais retiré, avec
  sa raison pour nom, pour une image devant ou derrière le texte, une image à gauche ou à droite (le texte l'habille : pas de « dessous ») et dans une grille. La légende est un paragraphe ordinaire marqué `data-caption`, pas
  un nouveau bloc : 12 px (9 pt), italique, gris #595959 (7:1 sur la feuille, qui reste blanche en sombre), sans marge ; elle reprend l'alignement d'une image centrée ou du paragraphe de l'image ; un texte qui porte sa
  taille ou sa couleur la garde ; Entrée à sa fin ouvre un paragraphe ordinaire. Même rendu dans l'éditeur, la Lecture, le PDF et le Word, une ligne comme une autre dans l'e-mail. Retour arrière dans une légende vide la
  retire ; en suivi des modifications la pose est une insertion suivie et le curseur arrive dans la légende.
  La barre de l'image garde sa largeur d'avant le bouton (511 px) : la glissière d'opacité passe à 97 px pour lui faire place. À ~700 px, image tout en haut de la page, une barre plus large recouvre
  « Tout accepter » dans la bande du suivi des modifications et le vrai clic n'y arrive plus ; tout bouton de plus dans cette barre rend de même sa largeur à un autre élément de la barre.
  Au saut de page (choix d'Antoine du 02/10, « Rester ensemble ») la légende reste avec son image ou son tableau : jamais seule en haut de la page suivante, dans l'éditeur, la Lecture, le PDF et le Word.
  Quand l'image tient dans la page sans sa légende, c'est l'image qui passe à la page suivante, légende comprise ; pour un tableau qui se coupe entre deux lignes, c'est sa dernière ligne qui suit la légende (le
  reste se coupe comme avant) ; un tableau qu'on ne coupe pas passe entier. Rien ne bouge quand le bloc et sa légende tiennent dans la page, pour une légende qui suit un simple paragraphe, au-delà de 90 % d'une
  page (le PDF ne saurait pas les garder) ni pour une légende vide en fin de document ; le document enregistré ne change pas. Dans le Word : « Conserver avec le suivant » sur le paragraphe de l'image, sur la
  dernière ligne du tableau (sur toutes si on ne le coupe pas) et sur chaque légende qu'une autre légende suit.
- Modèles de démonstration/test tenus hors de la galerie publique : dossier `templates-gallery-dev/` avec son propre
  manifeste, lu seulement avec `?dev` dans l'adresse du widget — le dépôt public (`grist-factory/Publipostage-Plus`) ne le
  publie pas.
- Mode Email (livré le 2026-09-18) : règle tranchée — **strictement l'UI existante**, aucun nouveau composant visuel ;
  en cas de doute, réutiliser un pattern déjà en place plutôt que d'en inventer un. Objet / À / Cc / Cci sont de simples
  champs texte ; « Créer l'email » ouvre le logiciel de messagerie (`mailto:`) et la fenêtre « Email trop long »
  avertit au-delà de ~2000 caractères sans bloquer ; ce qui n'a pas de sens en Email (en-tête et pied de page, modèle par
  défaut) est grisé, pas masqué. Le texte du lien suit l'éditeur autant qu'un `mailto:` le permet (texte brut seulement ;
  Zimbra web n'en garde que les lignes et les retraits) : mêmes puces (•, °, *), mêmes numéros (1., a., i., à partir de leur
  début), « [x] » et « [ ] » pour les cases, « > » devant une citation, les lignes qui suivent un item alignées sous son texte ;
  le gras, les couleurs et les liens cliquables n'y passent pas (un lien s'écrit « texte (adresse) »). Choix d'Antoine du 02/10 : texte seul,
  rien n'est copié dans le presse-papiers.
- Grille (mode tableau, demande d'Antoine du 01/10) : « + » puis « Nouvelle grille » crée un modèle de type `grille` — un seul tableau
  (15 lignes × 6 colonnes de 100 × 28 px au départ), sans feuille A4 ni en-tête ni pied, qui part du coin du plan de travail et défile
  dans le panneau, entouré de ses bandeaux A, B, C et 1, 2, 3 (gris du chrome, texte ≥ 4,5:1, collés au défilement). On tire le trait entre
  deux lettres pour régler la largeur de la colonne de gauche, entre deux numéros la hauteur de la ligne du dessus : aperçu en direct, taille
  affichée près du pointeur, une seule transaction (un seul Annuler), Échap annule ; une colonne ne passe pas sous 24 px, une ligne ne passe
  pas sous la hauteur de son texte. Un clic sur une lettre, un numéro ou le coin sélectionne la colonne, la ligne ou toute la grille ;
  Ctrl+A prend les cases, Suppr les vide, les flèches et Tab ne sortent jamais du tableau. Au clavier (flèches, Tab, Maj+Tab, Entrée, Maj+flèche, Annuler), la case où l'on arrive est montrée EN ENTIER, jamais sous un bandeau collé ni coupée par le bord du panneau (demande d'Antoine du 02/10, « Corriger la flèche du haut et Maj+Tab qui cachent le curseur sous le bandeau ») ; dans une case plus haute que le panneau le curseur reste en vue, et taper dans une case coupée sur laquelle on vient de cliquer ne fait pas défiler la grille. Entrée descend d'une case comme dans Excel et Google Sheets (demande d'Antoine du 02/10) et sélectionne son texte, sur la dernière ligne elle ne fait rien ; Maj+Entrée et Ctrl+Entrée ajoutent une ligne DANS la case ; dans une liste, ou quand la liste « # » est ouverte, Entrée garde son sens. Un tableau copié dans Excel, Google Sheets ou LibreOffice Calc se colle avec ses cases, ses fusions et sa mise en forme (jamais en image), à partir de la case courante (demande d'Antoine du 02/10) : la grille garde ses colonnes et ses lignes et grandit au bord quand le tableau dépasse, UN Annuler défait le collage. Ce qui n'a pas de sens dans un tableau unique est
  grisé, jamais retiré : Tableau, Deux colonnes, Sommaire, Citation, Bloc de code, Encadré, Bloc de signature, les trois
  boutons du suivi des modifications et l'aperçu A4 ; « Lien », la mise en forme, l'image, le QR code, les variables et Annuler restent actifs. Le
  garde-fou de l'éditeur tient aussi pour le clavier et le collage : la grille reste UN tableau — ni second tableau, ni deux colonnes, ni
  sommaire, ni citation, ni encadré, ni bloc de code, ni image en calque, et on ne supprime ni le tableau, ni sa dernière ligne ou colonne.
  Le texte d'une case est au milieu de sa hauteur (alignement vertical enregistré case par case avec le modèle ; haut et bas viendront avec la
  barre de la case), à l'identique dans l'éditeur, en Lecture et dans le PDF : une ligne plus haute que son texte reste haute, une grille
  large garde ses colonnes et défile à l'horizontale en Lecture au lieu d'être écrasée, aucune ligne vide ne la suit, et dans le PDF une
  grille plus large que la page est ramenée à sa largeur. La case
  courante a son cadre plein, couleur d'accent ; la barre de la case est fixée dans une bande entre la barre d'outils et le plan de travail, jamais posée sur une case ni sur un bandeau
  (un appui ou un glissé de souris tombe toujours sur la case visée), à la même place quelle que soit la case courante, masquée avec l'éditeur (Lecture, macro-modèle), et
  « Supprimer le tableau » y est grisé. Depuis que l'export Excel est complet
  (une ligne, puis toutes les valeurs de la table), « Nouvelle grille » est dans le menu « + » de tout widget, sans rien dans l'adresse.
- Coller un tableau de tableur dans un document (choix d'Antoine du 02/10, « Coller aussi un tableau Excel en cases dans un document, hors grille ? » - « Oui, en cases »). Un tableau copié dans Excel, Google Sheets ou
  LibreOffice Calc et collé dans un document ordinaire devient un tableau du document, jamais l'image de la plage : posé à la place du curseur (la ligne se coupe autour), avec ses fusions, ses fonds, son texte (gras, italique,
  souligné, barré, couleur, taille), ses alignements et les largeurs de ses colonnes ; un tableau plus large que la page revient à la page en Aperçu A4. Ni traits case par case, ni alignement vertical, ni hauteur de ligne : le PDF et le
  Word ne les lisent que pour une grille, l'éditeur ne montre donc rien que l'export perde (WYSIWYG). Un seul Annuler défait le collage ; Ctrl+Maj+V colle le texte de la plage, ni tableau ni image ; le curseur dans une case d'un
  tableau du document : le tableau d'Excel remplit les cases à partir de celle du curseur ; une image seule, un tableau de page web et du texte se collent comme avant.
- Importer un classeur Excel dans une grille (demande d'Antoine du 02/10, « Prévoir un Import Excel pour le modèle Grille »). La ligne « Importer un Excel… » du menu « + » suit « Nouvelle grille » (grisée en lecture seule avec tout le groupe) :
  un clic ouvre le sélecteur de fichier du navigateur, réduit aux .xlsx et .xlsm, un seul fichier. Le classeur devient une NOUVELLE grille, sans nom et pas enregistrée (le message dit « Nommez le modèle puis enregistrez-le »). Quand il a
  plusieurs feuilles visibles, une liste avec recherche (la même que celle des colonnes, des tables et des modèles : `SearchSelect.attachSheets`) s'ouvre sous le « + » une fois le classeur lu (choix d'Antoine du 02/10, « Oui, une liste ») :
  les noms des feuilles visibles dans l'ordre d'Excel, la recherche sous le focus (« Rechercher une feuille… ») ; la feuille choisie devient la grille et le message la nomme (« Feuille « X » (2 sur 3) importée… ») ; Échap ou un clic ailleurs
  referme la liste sans rien importer ni demander (le coin d'état redit l'état du modèle, le focus revient dans le texte) ; une seule feuille visible s'importe tout de suite, sans liste ; la question « Modifications non enregistrées » ne vient
  qu'après le choix de la feuille. Sont repris les largeurs, les hauteurs, les fusions, les fonds, le gras, l'italique, le souligné, les couleurs et les tailles de texte, les alignements, les traits (le
  gris par défaut n'est pas un trait choisi) et les liens ; les nombres et les dates s'écrivent comme Excel les montre, dans la langue du widget ; une formule donne son résultat ; une ligne, une colonne ou une feuille masquée ne vient pas.
  Au-delà de 1 000 lignes, 100 colonnes ou 5 000 cases, pour un .xls, un classeur protégé par un mot de passe ou un fichier qui n'est pas un classeur, un message en rouge dit pourquoi et rien ne change.
- Sélectionner des cases en glissant la souris (demande d'Antoine du 01/10, « en mode tableau, laisser le clic appuyé pour sélectionner plusieurs cellules »), dans une grille comme dans un
  tableau de document : appuyer sur une case puis glisser sélectionne le rectangle entre les deux cases, dans tous les sens, en partant du texte de la case aussi ; Maj + clic l'étend. Une case
  sélectionnée reçoit un voile bleu translucide posé PAR-DESSUS son fond (un fond de case jaune cachait la sélection) et son texte garde au moins 4,5:1. Le pointeur tenu près d'un bord du plan
  de travail, ou au-delà (sur la barre d'outils, hors du panneau), le fait défiler, d'autant plus vite qu'il s'éloigne, et la sélection suit la case qui arrive sous le bord ; les bandeaux
  restent collés. Règle générale : rien de flottant ne se pose sur les cases d'un tableau pendant qu'on y travaille ; une barre reste dans sa bande ou hors du plan de travail. Les boutons de la
  barre de la case se déclenchent aussi au clavier (Tab puis Entrée ou Espace), sans doubler le clic de la souris.
- Mettre en forme et copier plusieurs cases d'un tableau de document sélectionnées d'un coup (demande d'Antoine du 02/10, « dans un module tableau on peut bel et bien sélectionner désormais
  plusieurs cellules d'un coup, par contre j'ai l'impression que je ne peux pas faire d'édition dessus ? »). Une sélection de cases se traite comme une seule sélection : toute mise en forme de
  la barre d'outils (gras, italique, souligné, barré, police, taille, couleurs, surlignage, alignement, liste à puces, numérotée ou à cocher et leurs styles, citation, retrait) atteint CHACUNE des cases choisies et
  aucune autre, la sélection de cases reste là pour le geste suivant (le voile bleu ne s'éteint pas) et un seul Annuler défait le geste sur toutes les cases ; une liste qui se voit dans la case de
  tête se retire de toutes les cases au clic suivant, sinon elle se pose dans chacune. Ctrl+C met dans le presse-papiers le tableau (HTML) ET un texte brut tabulé que lisent Grist et les tableurs
  (une tabulation entre deux cases, un retour à la ligne entre deux lignes, une case à plusieurs lignes, à tabulation ou à guillemet entre guillemets doublés) ; Ctrl+X et Suppr vident les cases ;
  Ctrl+V dans une case remplit à partir d'elle (le tableau gagne les lignes qui manquent), et une valeur copiée d'une seule case, collée sur une sélection de cases, les remplit toutes.
  La citation entoure le contenu entier de chaque case d'UNE citation, ou l'en sort (l'état voulu est l'inverse de celui que montre le bouton, la case de tête) ; « Retrait » emboîte, dans chaque
  liste des cases, le deuxième élément et les suivants sous le premier (le premier d'une liste ne peut pas se décaler, comme dans une case seule) et « Retrait inverse » sort chaque liste de sa
  liste ; ces deux boutons restent grisés (jamais retirés) tant qu'aucune case n'a de liste à décaler. Ctrl+Maj+B suit le bouton Citation ; Ctrl+Maj+8, Ctrl+Maj+7 et Ctrl+Maj+9 (liste de tâches) posent la liste dans chaque case, ou l'en retirent, comme sur une seule case.
- Barre de la case d'une grille : fusion et alignement vertical (demande d'Antoine du 01/10, maquette « Barre »). De gauche à droite, séparés par un trait fin : Lignes (avant, après, supprimer), Colonnes (avant, après,
  supprimer), « Supprimer le tableau » (toujours grisé), Fusion (« Fusionner les cases », « Scinder la case »), Fond, Bordures, Alignement vertical (en haut, au milieu, en bas). Fusion, bordures et alignement n'existent que dans une grille :
  la barre d'un tableau de document reste celle d'avant. Rien ne disparaît, on grise : « Fusionner » ne s'allume que sur deux cases ou plus, « Scinder » que sur une case fusionnée ; les trois boutons d'alignement sont des
  états (celui des cases choisies est enfoncé, aucun quand elles en mêlent plusieurs) et un seul Annuler défait le geste sur toutes les cases. Fusionner garde tout le texte (à la suite, dans la première case), son fond et son
  alignement, et la largeur de chaque colonne couverte ; scinder rend les cases (la première garde le texte, les autres naissent vides). Le PDF, l'Excel et la Lecture dessinent la case fusionnée comme l'éditeur (colonnes à leur
  largeur, texte en haut, au milieu ou en bas de la hauteur de toutes ses lignes). Trop large pour le panneau, la barre passe à la ligne au lieu de déborder, et elle garde le niveau des barres flottantes (« Couches flottantes »),
  sous tout menu : « + » descend sur sa bande et reste dessus.
- Bordures d'une grille (demande d'Antoine du 01/10, maquette « Barre » : « Bordures » entre Fond et Alignement vertical). Le bouton « Bordures » de la barre de la case (un carré aux traits pointillés, une flèche) ouvre un
  menu SOUS la bande de la barre, jamais sur la barre d'outils (le menu de fond s'ouvre lui aussi dessous) : huit réglages en icônes — Toutes les bordures, Bordures extérieures, Bordures intérieures, Haut, Bas, Gauche,
  Droite, Aucune bordure —, puis « Couleur du trait » (les huit nuances du texte, « Personnalisé… », « Par défaut » = le trait fin gris de départ). Une couleur choisie ne referme pas le menu et reste celle du stylo pour les
  réglages suivants ; un réglage s'applique aux cases choisies, referme le menu, et un seul Annuler le défait. « Intérieures » est grisé, jamais retiré, quand il n'y a rien à tracer (une seule case, l'intérieur d'une case
  fusionnée). Un trait entre deux cases est UN trait : il s'écrit sur les deux cases (`data-border-top`, `-right`, `-bottom`, `-left` = `none` ou `#rrggbb`, absent = le trait de départ) et, quand deux valeurs divergent
  (fusion, ligne ou colonne supprimée, HTML d'ailleurs), « pas de trait » l'emporte, puis la première couleur dans l'ordre de lecture ; une case fusionnée n'a qu'une valeur par côté : fusionner garde son pourtour, scinder le
  rend, une ligne ou une colonne ajoutée prolonge les traits intérieurs (le cadre reste dehors). L'éditeur, la Lecture, le PDF et l'Excel dessinent les mêmes traits — un trait fin et plein, de sa couleur, ou aucun —, sans
  épaisseur ni style au choix. Le texte du menu suit les contrastes de la charte (≥ 4,5:1, clair et sombre).
- Saut de page d'une grille (demande d'Antoine du 01/10 : « saut de page gardé : marqueur sur la ligne, nouvelle page du PDF, nouvelle feuille de l'Excel »). Dans une grille, le bouton « Saut de page » de la barre
  d'outils pose le saut AVANT la ligne de la case courante (avant la première ligne d'une sélection de cases) ; son info-bulle dit « Saut de page avant la ligne » (au lieu de « Saut de page ») et le bouton est enfoncé
  sur une ligne qui en porte un : un second clic le retire, un seul Annuler défait le geste. Il est grisé, jamais retiré, sur la première ligne (la page serait vide) et au milieu d'une case fusionnée sur plusieurs
  lignes (elle serait coupée en deux) ; « Fusionner » est grisé quand la sélection enjambe un saut, et un saut devenu impossible (la ligne du dessus a été supprimée) est retiré par le document. Le saut est une marque
  de la ligne (`data-page-break-before`, enregistrée avec le modèle) : il suit sa ligne quand on en ajoute ou supprime d'autres. Il se voit dans l'éditeur par un trait en tirets de la couleur d'accent sur le bord
  haut de la ligne (sous le texte et la sélection, le fond choisi n'est pas touché) et par une pastille à cheval sur le bord haut de son numéro (info-bulle « Saut de page : nouvelle page du PDF, nouvelle feuille de
  l'Excel ») qui laisse la poignée de la ligne du dessus atteignable ; la Lecture n'en montre rien. Le PDF commence une nouvelle page à chaque saut, avec les mêmes colonnes à la même largeur ; l'Excel une nouvelle
  feuille (« nom », « nom (2) », 31 caractères au plus ; dans le classeur unique, à la suite de la feuille de la même valeur), avec la même mise en page sur chacune. Le bouton portrait / paysage et son menu (A3 à A6)
  sont actifs dans une grille : le sens et le format règlent la page du PDF et le papier de la feuille Excel, et s'enregistrent avec la grille.
- Colonnes d'un tableau avec le suivi des modifications (choix « Faire marcher » d'Antoine, 01/10) : « Colonne avant », « Colonne après » et « Supprimer la colonne » de la barre du tableau agissent comme
  une frappe suggérée. Une colonne ajoutée reste dans le tableau, alignée case par case, teintée de vert pâle (texte `#146c48` sur `#e5f6ee`) ; une colonne supprimée reste, barrée et teintée de rouge pâle
  (texte `#b42318` sur `#fbe9e9`) ; ces teintes sont des constantes, pas des jetons du thème : la page du document reste blanche en clair comme en sombre, et le texte y atteint 4,5:1 au moins. « Tout accepter »
  et « Tout refuser » les résolvent, Ctrl+Z défait l'action en un seul geste, et l'enregistrement les garde : la marque s'écrit en attribut de la case (`data-tc-insertion`, `data-tc-deletion`,
  `data-tc-modification`), jamais en `<ins>` ou `<del>` entre deux cases, que le navigateur écarterait du tableau à la relecture. Au-dessus d'une cellule fusionnée, « Supprimer la colonne » est grisé,
  jamais retiré (`aria-disabled`, explication au survol) : la supprimer à travers une cellule fusionnée casserait le tableau ; « Colonne avant / après » reste actif et élargit la cellule.
  Les largeurs que le widget règle tout seul (colonnes automatiques figées, tableau ramené dans la page) s'écrivent hors suivi : jamais une suggestion que personne n'a écrite.
- Lignes d'un tableau avec le suivi des modifications (choix « Corriger » d'Antoine, 01/10) : « Ligne avant », « Ligne après » et « Supprimer la ligne » de la barre du tableau agissent comme une frappe
  suggérée, comme les colonnes. Une ligne ajoutée reste dans le tableau, pleine largeur, teintée de vert pâle (mêmes teintes que les colonnes : `#146c48` sur `#e5f6ee`) ; une ligne supprimée reste, barrée et
  teintée de rouge pâle (`#b42318` sur `#fbe9e9`) : jamais une bande de quelques millimètres sortie du tableau. « Tout accepter » et « Tout refuser » les résolvent, Ctrl+Z défait l'action en un seul geste, et
  l'enregistrement les garde : la marque s'écrit en attribut de la ligne (`data-tc-insertion`, `data-tc-deletion`, `data-tc-modification` sur le `<tr>`), jamais en `<ins>` ou `<del>` autour d'un `<tr>`, que le
  navigateur écarterait du tableau à la relecture. Au-dessus ou au-dessous d'une cellule fusionnée en hauteur, « Supprimer la ligne » est grisé, jamais retiré (`aria-disabled`, explication au survol) : la supprimer
  à travers elle ajouterait des cases vides au tableau ; « Ligne avant / après » reste actif et allonge la cellule.
- Texte inséré et texte supprimé du suivi des modifications (choix « Aligner » d'Antoine, 01/10) : le texte suggéré prend les teintes des cases d'une colonne suivie, constantes dans les deux thèmes. Inséré :
  `#146c48` sur `#e5f6ee` (5,7:1), avec son filet vert au bas. Supprimé : barré, `#b42318` sur `#fbe9e9` (5,6:1). Jamais les jetons du thème (`--danger`, `--danger-soft`) : en sombre ils posaient
  une pastille foncée sur la page, qui reste blanche, et le rouge d'avant n'avait que 3,7:1 en clair.
- Accepter ou refuser UNE modification du suivi (demande d'Antoine du 04/10) : un clic sur un texte inséré, un texte supprimé, une colonne ou une ligne suivie ouvre une petite barre flottante « Accepter » /
  « Refuser » SOUS le curseur ; la barre du haut reste figée (« Tout accepter » et « Tout refuser » n'y changent pas). Elle ne traite que cette modification, avec tout ce qui en fait partie (l'ancien et le nouveau texte
  d'un remplacement, les deux bouts d'une suppression sur deux paragraphes, toutes les cases d'une colonne ou d'une ligne), ou toutes celles qu'une sélection recouvre (info-bulles au pluriel), et un seul Ctrl+Z la
  défait. Elle ne s'ouvre jamais pendant la frappe, ni tant qu'un bouton de la souris est appuyé dans le texte (elle s'ouvre au relâchement), ni sans le focus dans le texte ; elle se ferme en Lecture, devant les
  fenêtres de variable et d'un clic ailleurs, reste entière dans le panneau (retournée au-dessus du texte tout en bas) et passe au-dessus de la barre du tableau. Monochrome comme les autres barres flottantes : le vert
  et le rouge restent ceux du texte suivi.
- Lecture avec des modifications du suivi en attente (demande d'Antoine du 04/10) : la Lecture montre le document comme si toutes les modifications étaient acceptées, avec seulement une légère teinte là où
  quelque chose a changé. Le texte supprimé a disparu (ni barré ni grisé), le texte ajouté ou de remplacement est là, plus aucune marque du suivi ne se voit. La teinte est un fond vert pâle `#e5f6ee`, le même
  en clair et en sombre (la page de Lecture reste blanche) : sous le texte ajouté, sur le paragraphe ou le titre dont la mise en forme a changé, sur les cases d'une colonne ou d'une ligne ajoutée (même avec un
  fond posé sur la case) ; une image ajoutée prend un contour de 2 px `#8fd3aa`. La couleur du texte ne change pas et rien n'est souligné (14:1 sur la teinte, un lien 5,3:1). Rien n'est accepté pour de bon :
  l'éditeur garde ses suggestions, et le corps de l'e-mail suit la Lecture ; le PDF, le Word et l'Excel gardent pour l'instant le texte supprimé barré.
- Export Excel d'une grille (demande d'Antoine du 01/10) : le menu « Qualité PDF » a trois lignes Excel, sous les deux lignes Word : « Exporter en Excel… », « Exporter toutes les
  valeurs de la table en Excel (ZIP)… » et « Exporter toutes les valeurs de la table dans un seul classeur… ». Elles sont actives dans une grille et grisées ailleurs ; à l'inverse
  les deux lignes Word sont grisées dans une grille — jamais retirées, `aria-disabled` posé, un clic dessus ne lance rien et n'ouvre aucune confirmation. « Exporter en Excel… »
  télécharge un classeur d'une feuille pour la ligne affichée, nommé comme le PDF avec l'extension .xlsx, et le coin d'état dit « Fichier Excel généré. ». La feuille reprend la
  grille : largeur des colonnes et hauteur des lignes, texte au milieu de sa case, cases fusionnées, gras, italique, souligné, barré, couleur et taille, fond de case, listes,
  liens, images, un filet gris fin sur chaque case, page A4 d'une page de large dans son orientation. L'Excel n'est qu'un affichage, sans formule : une case n'est un vrai nombre
  ou une vraie date (au format de la bulle) que si elle ne contient que cette bulle, sinon c'est du texte ; un zéro masqué reste vide ; aucune couleur n'est inventée (une case
  sans format n'a ni couleur de texte ni fond, thème sombre compris).
- Toutes les valeurs de la table, dans une grille (choix d'Antoine du 01/10) : « lignes » devient « valeurs de la table » partout où l'export en lot en parle — les deux lignes du
  menu « Exporter en PDF » (« Exporter toutes les valeurs de la table (ZIP)… », « … en un seul PDF… »), leur confirmation et le message d'une table vide ; dans un document, ces
  textes gardent « lignes ». L'export Excel en lot a deux formes, une ligne chacune : une archive « <table>-export-xlsx.zip » d'un classeur par valeur (nommé comme les PDF par le
  modèle de nom de fichier), ou un seul classeur « <table>-export.xlsx » d'une feuille par valeur, nommée comme son fichier (31 caractères au plus, « nom (2) » quand deux
  feuilles s'appellent pareil). Chacune demande confirmation, annonce sa progression (« Export Excel en lot : 2/10... ») et dit sa fin en mots d'Excel, jamais de PDF.
- Feuille A4 : dans un panneau étroit, la page est réduite à la largeur disponible par un `zoom` CSS (`--pp-fit-zoom` : à
  700 px de panneau, 794 px de mise en page passent à 672 px) — à l'écran seulement. Les coupures de ligne de l'éditeur
  sont celles d'un grand panneau ; les PDF sont identiques quelle que soit la taille du panneau.
- Orientation de la page (demande d'Antoine du 01/10, « une bascule paysage et portrait… également pour les modèles
  classiques ») : le bouton Portrait / Paysage de la barre, juste après Aperçu A4, montre la page telle qu'elle est (haute en
  portrait, large en paysage) et s'allume en paysage. Il est actif pour les modèles classiques, les macro-modèles et les grilles (une grille n'a pas de page à l'écran : le sens règle la page de son PDF et la feuille de son Excel) ; pour un email
  il reste visible et grisé, jamais retiré. Un modèle a une seule orientation, enregistrée avec lui (clé
  `orientation` de la colonne `Margins`, absente = portrait) ; changer d'orientation garde les quatre marges en millimètres.
  La feuille paysage (297 × 210 mm, 1 122,52 px de mise en page) est ramenée à la largeur du panneau par le même `zoom` : à
  700 px de panneau elle passe aussi à 672 px, facteur 0,60 au lieu de 0,85, donc un texte plus petit à l'écran qu'en
  portrait — rien de tel dans le PDF ni le Word. La pagination, la Lecture, le PDF, le Word et l'impression navigateur
  suivent la page dans son sens ; la galerie de modèles reste en portrait.
- Format de la page (demande d'Antoine du 01/10, « un mode autre que A4 ? genre A3, A5, A6 » dans le fil de l'orientation) : le bouton Portrait / Paysage a un menu au survol, comme Qualité PDF
  ou Titre, et la barre ne gagne aucune icône. Le menu a un titre « Page », les lignes Portrait et Paysage, un filet, puis A3, A4, A5 et A6 avec leurs dimensions (« 148 × 210 mm », en
  gris discret, au moins 4,5:1) ; la coche dit le sens et le format courants. Le bouton garde son icône (la page telle qu'elle est) et son clic (tourner la page) ; il n'a pas
  d'info-bulle, que l'ouverture du menu retirerait : son nom accessible dit « Page A5 en portrait (passer en paysage) ». La case « Aperçu A4 » devient « Aperçu A5 » (« A5 preview »). Un modèle
  a un seul format, enregistré avec lui (clé `format` de la colonne `Margins`, absente ou inconnue = A4) ; changer de format garde le sens, re-borne les marges pour que la zone de texte garde
  20 mm au moins (elles ne reviennent pas au retour en A4) et ramène pour de bon un tableau trop large dans la page. Un email garde le menu visible et grisé, titre
  « Page (pas disponible pour ce modèle) » ; une grille a le même menu, actif (le format règle la page du PDF et le papier de l'Excel). À 700 px de panneau, A5 tient sans réduction, A3 portrait passe à 0,60 et A3 paysage tombe au plancher de 0,5 (la zone d'édition défile à
  l'horizontale). La galerie et l'arbre des modèles montrent encore une feuille A4 portrait. D'autres formats (Lettre US...) ne s'ajoutent qu'après le choix d'Antoine.
- Page d'un macro-modèle (carte d'Antoine du 01/10, « Autoriser le paysage pour les macro-modèles ? » : Oui) : le bouton Page et son menu sont actifs sur un macro-modèle comme sur un modèle classique,
  au même endroit et du même aspect ; la coche dit le sens et le format de ce macro-modèle (« Page A3 en paysage (passer en portrait) »). Sa page est dans sa propre ligne (colonne `Margins`, avec ses marges)
  et il l'impose aux modèles qu'il assemble : la Lecture, le PDF (unique, en lot, en un seul fichier) et le Word suivent la page du macro-modèle, jamais celle de sa page de garde ou d'une annexe, qui gardent la
  leur quand on les ouvre seules. Son résumé ne montre pas de feuille : la page se lit sur le bouton (allumé en paysage), dans le menu et à la Lecture. Un macro-modèle sans réglage reste en A4 portrait.
- Modèles d'un macro-modèle (demande d'Antoine du 02/10, « modifier un sous-modèle en cliquant sur un stylo… et un bouton pour revenir au macro-modèle ») : le résumé d'un macro-modèle liste ses modèles sous sa phrase,
  une ligne par page de garde et par annexe (« Annexe 1 », « Annexe 2 »… comme la fenêtre de composition ; dans une annexe le modèle de chaque règle puis celui de « Si aucune règle ne correspond », jamais deux fois le même), le nom
  de chaque modèle suivi de son stylo (le crayon du « Renommer » du titre, 24 px, info-bulle et nom accessible « Modifier le modèle « … » », anneau de focus de la charte). Le stylo ouvre ce modèle dans l'éditeur comme un
  choix de la liste ; un bandeau d'une ligne entre la barre d'outils et le texte dit « Modèle ouvert depuis le macro-modèle « … ». » et porte « Revenir au macro-modèle » (la barre d'outils gelée ne gagne ni icône ni bouton).
  Il reste tant que ce modèle est à l'écran, Lecture comprise, et part dès qu'un autre modèle se charge (liste, « + », galerie, suppression). Revenir pose la question « Modifications non enregistrées » comme un changement de
  modèle (Annuler garde le modèle, son texte et le bandeau), relit les modèles pour que la Lecture montre ce qu'on vient d'enregistrer et rend le focus au stylo du modèle quitté. Un modèle supprimé depuis reste dit « modèle
  introuvable », son stylo grisé, jamais retiré ; une phrase de bandeau trop longue est coupée par « … » (info-bulle : la phrase entière), son bouton reste entier ; le résumé défile quand la liste dépasse le panneau.
  La phrase du résumé (« Page de garde : … — N annexes conditionnelles. ») est en couleur de texte du thème (--text : 4,5:1 au moins en clair comme en sombre ; le gris atténué n'y faisait que 4,39:1 en clair, choix d'Antoine du 02/10).
- Œil d'un modèle du macro-modèle (demande d'Antoine du 04/10, « une icône œil permettant de masquer l'un des modèles… ne pas faire apparaître l'un des modèles en lecture et aux exports ») : chaque modèle du
  résumé a, après son stylo, un œil (`.macro-summary-eye`, 24 px comme le stylo, icônes `eye` et `eyeOff` de 14 px, anneau de focus de la charte). Œil ouvert : le modèle est dans la Lecture et les exports ; œil barré d'un trait
  et enfoncé (fond et bordure des boutons actifs, `aria-pressed="true"`) : il en est masqué et son nom passe au gris atténué (`--text-muted`). Masquer ne retire rien de la composition (on grise) et un second clic remet tout comme
  avant. Le nom accessible dit le geste et ne change pas (« Masquer le modèle « … » »), `aria-pressed` dit l'état, l'info-bulle dit l'état et ce que le clic fait (« « … » est masqué de la Lecture et des exports : cliquer pour l'afficher »).
  Un clic écrit tout de suite la composition dans la ligne du macro-modèle (ni fenêtre ni « Enregistrer » ; le reste de la ligne, nom du PDF, en-tête et pied, page, ne bouge pas) et le coin d'état le dit, le verbe en tête pour qu'un nom
  long ne le coupe pas (« Modèle masqué de la Lecture et des exports : « … » », « Modèle de nouveau dans la Lecture et les exports : « … » »). L'œil change à l'écran avant la réponse de Grist ; des clics en rafale (Grist lent) s'écrivent un par un
  et la ligne finit sur le dernier état demandé ; si Grist refuse, l'œil se rouvre, le coin d'état dit « Échec de l'enregistrement. » en erreur et le résumé repart de ce que Grist garde. L'œil règle UN modèle dans SA position (page de garde
  ou annexe) : le même modèle donné par deux annexes a deux yeux ; la position le garde dans sa clé `hiddenModeleIds`, écrite avec le reste de la composition (colonne Contenu). Un modèle masqué n'écrit rien dans la Lecture, le PDF (d'une ligne,
  en lot, unique), le ZIP, le Word et l'Excel, saut de page compris (`MacroTemplates.pickModeleId` est le seul endroit qui décide) ; la règle qui correspond choisit le seul candidat : ni la règle suivante ni le modèle par défaut de l'annexe ne
  prend la place d'un modèle masqué. La fenêtre « Modifier la composition » et « Enregistrer sous… » gardent les masquages (un modèle retiré d'une position ne laisse pas le sien derrière lui, un autre mis à sa place repart affiché). Un modèle
  supprimé depuis reste dit « modèle introuvable », son œil grisé comme son stylo, jamais retiré. Au clavier, Tab va du stylo à l'œil de chaque modèle, Espace ou Entrée le bascule et il garde le focus, même si le résumé est redessiné (changement
  de langue). Un macro-modèle sans œil fermé se lit comme avant : aucun modèle déjà enregistré ne change. En lecture seule le résumé n'est pas à l'écran (la Lecture est imposée) et l'œil n'écrit rien. Tests : cas `macro_hidden_model_*` et
  `macro_eye_*` du groupe `macroModeles`, script `macroHiddenMouse` (la vraie souris à 700×400, clair, sombre, anglais).
- Filigrane (roadmap n° 14 « WaterMark », demande d'Antoine du 01/10) : « Filigrane… » est la dernière ligne du menu Page, après un second filet : la barre ne gagne aucune icône, la ligne ouvre une fenêtre et dit à sa droite
  le texte en cours (gris discret, coupé par « … » s'il est long). Elle suit le reste du menu : grisée pour un email ou une grille et pendant un export, active pour un macro-modèle (qui a son propre filigrane, comme sa propre page).
  Un filigrane est UN texte (40 caractères au plus) écrit en Roboto gras au centre de chaque feuille, derrière le texte et les images, ni cliquable ni sélectionnable, jamais dans le document : il vit avec la page (clé `watermark` de la
  colonne `Margins`, absente = pas de filigrane ; un modèle d'avant ce réglage se recharge à l'identique). Réglages : le sens (en diagonale à -45° ou horizontal), six couleurs (le gris d'abord) et l'opacité de 5 à 100 % par pas de 5
  (20 % au départ). La fenêtre « Filigrane de la page » tient dans 700×400 sans défiler : le champ du texte (l'indication SOUS le champ), le sens, les couleurs, le curseur d'opacité et une feuille d'aperçu à l'échelle de la page du
  modèle, dessinée par le même code que la page (ce qu'elle montre est ce que la page porte) ; Entrée valide, Échap annule, « Valider » avec un texte vidé retire comme « Retirer le filigrane ». Le corps des lettres vient de la page, un
  seul calcul pour les quatre rendus (`PageLayer.watermarkLayout` : de 6 à 200 pt, 45 % du petit côté au plus, l'encre reste dans la page de A3 à A6, en portrait et en paysage). L'éditeur (avec l'Aperçu A4) et la Lecture le peignent dans la
  couche de page, le PDF en vrai texte vectoriel au fond de chaque page, le Word en image dans l'en-tête, derrière le texte (une image, pas du texte modifiable : c'est ce que Word et Google Docs ouvrent sans surprise). Une image
  « Sur toutes les pages » et un filigrane partagent la même couche.
- Assemblage avant impression (demande d'Antoine du 02/10, point 13 : « 4 A6 sur une A4, chacun prend une ligne dans l'ordre, une planche prête à imprimer », avec ou sans trait de coupe, sur A3 et A4) : « Assemblage avant
  impression… » est la troisième ligne du volet « Exporter en PDF », sous « Exporter toutes les lignes (ZIP)… » et « … en un seul PDF… » : la barre ne gagne aucune icône. La ligne suit le reste du volet (grisée pendant un export
  et sans le droit d'exporter, jamais retirée) et ouvre une fenêtre qui tient lieu de confirmation du lot : la feuille (A4, A3), son orientation, les traits de coupe (Sans, Avec) et les emplacements (en largeur × en hauteur).
  « Générer » écrit `<table>-assemblage.pdf` : chaque ligne de la table prend sa place, de gauche à droite puis de haut en bas, une ligne de plusieurs pages en prend autant ; la dernière feuille, à moitié pleine, garde ses
  repères de grille entière. La fenêtre tient dans 700×400 sans défiler, en français comme en anglais : libellé à gauche, réglage à droite, et une feuille d'aperçu dessinée par le même code que le PDF (ce qu'elle montre est ce
  que le fichier porte). Chaque indication commence SOUS le champ qu'elle concerne, pas sous son libellé (l'échelle sous les traits de coupe, la règle de l'ordre sous les emplacements) et le résumé (« 4 emplacements par
  feuille (2 × 2) : 6 lignes sur 2 feuilles A4. ») ferme la fenêtre ; dans une grille, « valeurs de la table » remplace « lignes ». Une feuille où la page du modèle ne tient pas reste affichée, grisée, avec la raison en
  info-bulle, jamais retirée. Les traits de coupe sont deux repères par ligne de coupe, hors de la page (à 3 mm, longs de 4 mm, 0,5 pt, noir) : quand la feuille n'a pas la place de les poser (4 A6 sur une A4), TOUTES les pages
  sont réduites du même facteur et la fenêtre le dit (« Pages réduites à 93 % pour laisser la place aux traits de coupe. », seulement dans ce cas) ; rien n'est jamais réduit sans traits, jamais en silence. La feuille, son
  orientation et les traits sont gardés par navigateur pour la prochaine fois, pas le nombre d'emplacements (la page du modèle a pu changer) ; Entrée valide, Échap annule.
- Image plus large que sa place (carte d'Antoine du 01/10, « Ramener à la page les images trop larges dans le PDF et le Word ? » : « logique de WYSIWYG, si ça dépend en éditeur ça dépasse partout sinon nulle
  part ») : l'éditeur est la référence, la Lecture, le PDF et le Word montrent ce qu'il montre. Une image dans le texte plus large que la zone de texte, la case de tableau ou la colonne qui la porte y est
  ramenée partout, proportions gardées, et suit le format de page et les marges ; une image qui tient garde sa taille réglée. Une image en calque garde sa taille réglée (son placement est une autre règle).
- Fin de document (demande d'Antoine du 01/10, « s'il n'y a pas de contenu, peu importe les marges, on ne crée pas de nouvelle page ») : une dernière ligne vide, un saut de
  page sans rien derrière et les lignes vides au bas des colonnes d'une dernière zone à deux colonnes ne s'impriment pas et ne créent jamais de page, en Lecture, en PDF et en
  Word, même quand le texte arrive pile à la marge du bas. Les lignes vides du milieu gardent leur hauteur. L'éditeur garde ses lignes vides (il faut pouvoir écrire à la suite), mais celles de la fin
  n'ouvrent pas de « Page 2 » ni ne comptent dans le « n/total » du pied de page, comme en Lecture et dans les exports (Antoine, 01/10, carte « Faire ignorer les lignes vides de fin
  au repère « Page 2 » de l'éditeur ? » : Oui) ; elles dépassent simplement la dernière page, et la page apparaît dès qu'on tape du texte dessus. Un saut de page posé par la personne garde,
  lui, son repère « Page 2 » même sans rien derrière.
- Onglet « Raccourcis » et abréviations « § » (demande d'Antoine du 01/10, « un caractère qui flag et qui étend une valeur saisie » ; sa réponse à la carte : « Tout, par personne ») : un
  septième onglet des Réglages, « Raccourcis », après « Déclencheur ». Les sept onglets (huit depuis « Vue », voir plus bas) tiennent sur une seule ligne dans les 480 px de la fenêtre (`.settings-tabs` sans interstice,
  onglets à 7 px et 2 px de marge intérieure), jamais sur deux ; aucun `display` n'est posé sur `.settings-panel` (il battrait l'attribut `hidden` des panneaux masqués). La section «
  Abréviations » met sur une ligne son titre et le réglage « Caractère déclencheur » (un champ de 44 px, « § » par défaut, gardé par navigateur comme la touche des variables ; il refuse
  une lettre, un chiffre, une espace, un délimiteur et le déclencheur des variables, en disant pourquoi, et reprend l'ancien caractère à la perte du focus), puis une phrase d'exemple, le
  formulaire (« Abréviation », « Texte à écrire », « Ajouter » en bouton plein, « Annuler » seulement en modification, Ctrl+Entrée valide), la liste de la personne (l'abréviation en
  gras, son texte coupé par « … », « Modifier » et « Supprimer » qui demande confirmation dans la fenêtre commune) et une ligne qui dit que chacun a les siennes. Une erreur de saisie
  garde la couleur du texte (le rouge ne fait que 4,4:1 sur blanc) avec un filet rouge et se place sous le champ qu'elle concerne, jamais sous son libellé ni sous le titre : celle du
  formulaire dans la colonne des champs, entre le texte et les boutons ; celle du caractère, dont le champ est au bord droit de la ligne du titre, alignée sur ce bord (texte à droite,
  filet à droite). Les abréviations vivent dans la table `Publipostage_Abreviations` du document (`Utilisateur`, `Abreviation`, `Texte`) : une personne ne voit et ne change que les
  siennes (sans identité Grist, les lignes à `Utilisateur` vide) ; la table n'est créée qu'à la première abréviation ajoutée et reste cachée du choix `#Variable`.
- Onglet « Vue » des Réglages (demandes d'Antoine du 02/10, points 16 et 16 bis : « un modèle selon la ligne », « un bouton pour mettre ce modèle par défaut pour la vue ») : les réglages propres à la
  vue du widget, rangés en sections (un `h4.settings-section-title` chacune, séparées par un filet) - « Modèle selon la ligne » (case, règles « Si colonne = valeur → modèle » sur les lignes des macro-modèles,
  « Si aucune règle ne correspond » : modèle par défaut / laisser le modèle ouvert / un modèle) et « Modèle par défaut de cette vue » (l'état, « Utiliser « X » pour cette vue », « Retirer »). Ils vivent dans
  les options du widget, donc dans SA vue, et ne sont partagés qu'une fois la vue enregistrée dans Grist (le texte du haut de l'onglet le dit). L'ordre d'ouverture est la ligne qui désigne un modèle, puis le
  modèle de la vue, puis le ★ du document ; un email ou un macro-modèle ne peut pas être le modèle de départ (bouton grisé, choix déjà enregistré ignoré). Cadre des règles et boutons grisés, jamais retirés :
  case décochée ou lecture seule. Les **huit onglets** tiennent encore sur une ligne dans les 480 px (texte à 12 px, 1 px de marge, au lieu de 12,5 px et 2 px) : un neuvième onglet ne tiendrait plus, il
  demande une autre place. La fenêtre garde ses 480 px.
- Abréviations dans l'éditeur (même demande) : taper le caractère déclencheur ouvre sous le curseur la liste des abréviations de la personne, dans le même langage que le panneau `#`
  (fond de surface, liseré, ombre légère, ligne choisie sur `--surface-sunken`, texte en `--text`, jamais un gris discret qui n'atteindrait pas 4,5:1 sur la ligne choisie ; couche de
  niveau `--z-menu`, remontée à chaque placement par `ViewportFit.placePopup` : elle passe devant la barre flottante d'un tableau et devant un menu déjà ouvert). Elle se
  filtre à la frappe (abréviation entière, puis début, puis contenu, puis début d'un mot du texte) ; les flèches choisissent, Entrée et Tab valident, Échap la ferme sans rien changer, un
  clic choisit (l'éditeur garde le focus). Entrée et Tab ne choisissent que si la liste est ouverte, et Maj, Ctrl, Alt et ⌘ gardent leur sens : sans liste, Entrée coupe le paragraphe et
  Tab décale l'élément de liste ou passe à la colonne suivante comme avant (l'extension passe avant les autres, priorité 1000, pour que la liste ouverte gagne). Sans passer par la liste,
  une abréviation entière suivie d'une espace (normale, insécable ou fine) ou d'une ponctuation (`. , ; : ! ? ) ] }` et `»`) est remplacée par son texte, le caractère tapé restant
  derrière. Les majuscules de l'abréviation ne comptent pas ; une abréviation collée à une lettre (« mon§ub ») ou inconnue ne change rien ; rien ne se remplace dans un bloc de code ni
  sous une marque code. Retour arrière juste après l'expansion rend ce qui avait été tapé (« §ub »). Les marques en cours (gras, couleur…) sont gardées, un texte sur plusieurs lignes
  s'écrit avec un saut de ligne par ligne, et en suivi des modifications l'expansion n'est qu'une insertion. Le caractère se relit à chaque frappe : le changer dans Réglages vaut tout de
  suite, sans recharger. Les autres champs (objet, destinataires, nom du PDF) ne s'étendent pas.
- Raccourcis clavier (demande d'Antoine du 01/10, « pouvoir définir des raccourcis personnalisés » ; sa réponse à la carte : « Tout, par personne ») : l'onglet « Raccourcis » s'ouvre sur
  les touches, un commutateur à deux boutons (Touches / Abréviations, `.settings-switch`, le bouton choisi plein en `--accent-solid`) montre l'une ou l'autre section et se souvient du
  choix, par navigateur (`pp_shortcuts_view`). Une ligne par action (54, en cinq groupes : Modèles, Affichage, Mise en forme, Insertion, Historique et suivi) : le nom à gauche (aucun
  n'est coupé à 700 px), la touche dans un bouton de 112 px au moins (« Aucune » en italique quand il n'y en a pas), « Par défaut » à droite, grisé tant que la touche est celle d'origine
  ; « Tout remettre par défaut » en haut à droite demande confirmation. Un clic sur la touche l'écoute (« Tapez la touche… », fond `--accent-soft`) : la combinaison tapée est prise,
  Échap abandonne sans fermer la fenêtre, Retour arrière retire la touche. Une combinaison refusée dit pourquoi dans un message sous la touche, dans sa colonne et jamais sous le nom de
  l'action, en `--text` avec un filet rouge, et l'écoute continue. Refus : une touche déjà prise (le nom de l'action est dit), une touche seule, Ctrl+Alt (c'est AltGr), Ctrl+lettre sur
  Mac, les touches que le navigateur ou l'éditeur gardent (Ctrl+R, Ctrl+N…).
- Les touches (même demande) : chaque action fait ce que fait son bouton - elle presse le bouton de la barre, avec le même geste que la souris (click, ou mousedown pour la couleur du
  texte, le surlignage et la taille de police), donc avec ses gardes : grisé par les droits, par le mode ou en Lecture, désactivé ou masqué, une touche ne fait jamais ce qu'un clic ne
  peut pas. Une touche d'origine que l'éditeur traite déjà (Ctrl+B, Ctrl+K, Ctrl+Z…) reste à l'éditeur tant qu'on n'y touche pas ; une fois changée, l'ancienne ne fait plus rien (sauf
  dans un champ de saisie, où elle garde son sens de texte ; sous Windows et Linux les touches Ctrl+Alt de l'éditeur, comme Ctrl+Alt+C, restent actives : c'est AltGr). Rechercher (Ctrl+F) et Rechercher et remplacer (Ctrl+H, ⌘⇧H sur Mac) sont ceux de la barre de recherche
  (`js/find-replace.js`) : changés, la nouvelle touche l'ouvre sans la refermer quand elle l'est déjà (la loupe, elle, la ferme) et l'infobulle de la loupe dit la touche choisie. Aucune action ne
  part fenêtre ouverte ni pendant une saisie en cours (IME) ; une touche enfoncée ne bascule qu'une fois (la taille de police, les retraits, annuler et rétablir se répètent). Les choix
  sont par navigateur (`pp_shortcuts`), comme la langue et le thème ; les touches ne marchent que le curseur dans le widget. Sur Mac, ⌘ remplace Ctrl et les touches s'écrivent ⌃⌥⇧⌘. La
  touche se montre là où le bouton se nomme : dans son infobulle (« Gras (Ctrl+B) », la touche après le texte, entière dans la fenêtre), à droite de la ligne d'un menu (Citation, Titre
  1…), après le titre d'un menu (« Exporter en PDF (Alt+P) ») et dans `aria-keyshortcuts` ; sans touche, rien n'est écrit (pas de parenthèses vides). Un nouveau bouton de la barre
  s'ajoute à la liste (`ACTIONS` de `js/shortcuts.js`, avec son nom français et anglais) et au scénario « la touche fait ce que fait la souris ».
- En-tête et pied de page (choix d'Antoine du 01/10, « Sur le PDF », modèle « Fiche mission ») : le PDF réserve toujours la même bande sous la marge du haut dès qu'un en-tête a du
  contenu, sur l'une de ses pages ou sur toutes (45 pt de zone + 10 pt d'écart = 55 pt, quelle que soit la hauteur du texte), autant au-dessus de la marge du bas pour le pied, et rien quand
  la zone est vide. L'éditeur, la Lecture et le Word se calent dessus : le corps commence à la marge + 55 pt du bord de la feuille dans les quatre rendus, l'en-tête à la moitié de la marge du
  haut, le pied juste sous le texte, les pages se coupent aux mêmes lignes, et une image en calque tirée au coin de la feuille s'arrête au vrai bord (marge + bande), pas à la marge. Une
  zone vide ne prend aucune place mais reste cliquable dans la marge ; une zone ne prend jamais la souris (une image posée dans la marge garde son clic) : c'est un clic dans la marge, là
  où rien n'est posé, qui ouvre l'en-tête ou le pied de page, et le survol de cette marge l'allume. Le texte d'un en-tête ou d'un pied a la taille du PDF et du Word, 10,5 pt, soit 14 px à l'écran
  comme le corps du modèle, dans l'éditeur et à la Lecture (choix d'Antoine du 01/10, « Comme le PDF » ; il valait 10,5 px, les trois quarts de ce qui s'imprime) : il ne change plus de taille quand on
  ouvre la zone, et le libellé « + Ajouter un en-tête » d'une zone vide, qui ne s'imprime pas, garde sa taille d'interface.
- Pages entières (choix d'Antoine du 01/10, carte « Afficher chaque feuille à sa taille réelle dans l'éditeur et la Lecture ? » : « Pages entières », l'autre choix était « Garder compact ») : dans
  l'éditeur et à la Lecture, chaque page est une feuille entière de son format, la dernière comprise. Un modèle d'une ligne montre une feuille entière, un saut de page forcé laisse sa page
  entière, et la page 2 ne bouge pas quand on écrit sur la page 1 : une page a sa place (le haut de la page k est à k hauteurs de feuille et k gouttières du haut de la première), pas celle que
  le texte lui laisse. Entre deux feuilles, la couture rend ce que l'on verrait sur le papier : le bas de la page qui finit (le pied sous le texte, la marge du bas), une gouttière grise, le haut
  de la page qui commence (la marge du haut, l'en-tête à la moitié de cette marge). Le pied et l'en-tête de la couture s'ouvrent au clic ; le reste, marges et gouttière, ne prend aucun clic. À la
  Lecture le papier blanc est un fond derrière tout (une image « derrière le texte » posée dans la bande de l'en-tête reste visible) ; dans l'éditeur le texte de l'en-tête et du pied passe
  devant les images en calque, comme dans le PDF. « Sur toutes les pages » peint une copie de l'image à sa place de grille sur chaque page 2 et suivante, au même endroit que le PDF (0,3 pt près),
  rognée au bord de sa page, sous le texte, sans jamais prendre la souris ; la page 1 garde l'image elle-même. Une image en calque se range par la feuille où elle est posée (et non par le
  paragraphe qui la porte) : tirée de la page 1 sur la page 2, sa grille dit « page 2 » ; lâchée dans la gouttière, elle va au bord haut de la feuille suivante ; un modèle enregistré avant ce choix
  retrouve ses images de la page 2 à la place que dit leur grille. Recalculer les pages ne déplace jamais le défilement de l'éditeur (`overflow-anchor: none`, et `.tiptap` garde sa hauteur le temps de la mesure).
- Tableau au saut de page (demande d'Antoine du 01/10, « un tableau ne se coupe pas au moment du saut de page », modèle « Annexe 7 : Fiche mission ») : un tableau se coupe ENTRE deux
  lignes, jamais au milieu d'une ligne, dans l'éditeur, en Lecture, en PDF et en Word. La ligne qui ne tient pas dans la place restante ouvre la page suivante avec tout ce qui la suit ; si même la
  première ne tient pas, le tableau entier passe. Dans l'éditeur et en Lecture, chaque page est une feuille entière (« Pages entières ») : la page qui finit garde sa place libre sous sa dernière ligne, puis vient la bande de saut de page,
  et la ligne qui ouvre la page commence juste sous la bande. Le tableau est rogné sur cette place libre et sur les marges de la couture, qui restent blanches (ni le fond ni les traits verticaux
  des cases n'y passent) : ses bordures se ferment sous la dernière ligne de la page qui finit et se rouvrent au bas de la bande par un seul filet de 1 px, et le texte de la ligne reste cliquable sous la bande. L'éditeur affiche les noms des
  variables, plus longs que leurs valeurs : il peut couper une ligne plus tôt que la Lecture et le PDF, qui coupent à moins d'une ligne l'un de l'autre. Une ligne plus haute que 90 % de la page,
  des cases fusionnées sur plusieurs lignes, un tableau dans une colonne, une liste ou un encadré, un en-tête ou un pied de page, une grille, un tableau qui porte une image en calque (PDF) et une ligne proposée en suivi des
  modifications gardent l'ancien comportement (l'aperçu les garde d'une pièce, le PDF les coupe entre deux lignes de texte) : une ligne qu'on ne peut pas ranger ne doit jamais disparaître. Le modèle
  enregistré ne change pas : la ligne descendue sous la bande l'est par une feuille de style, jamais par un style écrit dans le document.
- Pinceau de mise en forme (demande d'Antoine du 02/10, « ajout d'un bouton pour copier/coller la mise en forme ») : un bouton sur la deuxième rangée de la barre, juste après le
  surlignage (`#v2-btn-format-painter`, un rouleau de peintre : ni le feutre du surlignage ni le seau de la couleur de fond, une icône = une fonction), de la taille des autres et collé
  comme eux, sans ajouter de rangée à 700 px. Un clic copie la mise en forme du texte où l'on est (curseur ou sélection) et arme le pinceau pour UN usage : le bouton s'enfonce comme tout
  bouton enfoncé de la barre (`.is-active`) et le curseur sur le texte devient un rouleau (`html.pp-format-painting`) ; la sélection qu'on fait ensuite - double-clic sur un mot, glissé,
  triple-clic sur un paragraphe, cases d'un tableau, Maj+clic, ou Alt+Maj+V au clavier - reçoit la mise en forme à son relâchement, puis le pinceau se range. Un double-clic sur le bouton
  le garde armé pour plusieurs endroits (liseré de 2 px en `--accent` autour du bouton) ; Échap ou un clic sur le bouton l'arrête ; un simple clic sans sélection ne peint rien et le
  laisse armé. La mise en forme du caractère (gras, italique, souligné, barré, police, taille, couleur, surlignage) REMPLACE celle du texte peint - peindre un texte ordinaire l'efface,
  comme dans Word ; un lien, un commentaire et les marques du suivi des modifications ne sont pas de la mise en forme et ne sont jamais touchés. L'alignement et le niveau de titre ne se
  copient que d'un curseur ou d'un paragraphe entier et ne se posent que sur les paragraphes peints en entier (peindre un mot ne recentre pas son paragraphe) ; une légende et le premier
  paragraphe d'une puce gardent leur type ; les puces, les tableaux et les images ne sont pas de la mise en forme de texte. Une application est un seul Ctrl+Z. Le bouton est grisé,
  jamais retiré, en e-mail, en macro-modèle, en Lecture et sans droit d'écriture, et un pinceau armé s'arrête dès que son bouton se grise. Touches : Alt+Maj+C (le geste du bouton) puis
  Alt+Maj+V (poser sur la sélection du moment) ; Ctrl+Maj+V reste le collage sans mise en forme du navigateur.

## 4. Spécifique à SlidesPlus

- **État réel au premier commit : une fondation, pas un éditeur.** Connexion Grist + canevas Fabric.js vide +
  mode présentation (plein écran natif avec repli CSS si l'iframe Grist ne l'autorise pas). Rien de plus n'est
  implémenté.
- L'UI actuelle (`css/style.css`, ~90 lignes) est un point de départ **générique, pas encore la charte Grist
  Factory** : bleu d'accent différent (`#2563eb`, à comparer au `#2f6fed` de Publipostage+), pas de thème sombre,
  pas de séparation police chrome/contenu, un seul bouton avec un emoji (`⛶ Plein écran`). À harmoniser avec la
  charte du §1 au moment de construire le véritable éditeur (Phase 1 de `ROADMAP.md`), pas avant — inutile de
  retoucher une UI qui n'a pas encore de vraie barre d'outils à aligner.
- Diapositive : 960×540 pt (16:9, proportions PowerPoint), choisi dès l'éditeur pour que l'export `.pptx`/PDF
  n'ait pas de conversion surprise.
- Aucun audit de sécurité encore réalisé (rien à auditer au-delà de la fondation actuelle) ; un audit dans
  l'esprit de celui de Publipostage+ est prévu une fois l'éditeur fonctionnel.

---

## 5. Ce qui reste ouvert (ne pas trancher soi-même dans un autre chat)

- Texte définitif de la Bio dans le panneau Crédits de Publipostage+ (actuellement un brouillon de Claude).
- Refonte éventuelle de la barre d'outils V2 de Publipostage+ (jugée dense) — gelée tant qu'Antoine ne l'a pas
  arbitrée.
- Unification des teintes « ambre = attention » entre les deux widgets (proches mais pas identiques aujourd'hui).
- Palette et typographie définitives de SlidesPlus une fois son éditeur réel construit — pour l'instant provisoires.
- Calendrier de rattachement à l'écosystème Grist.Gouv, qui pourrait renommer les dépôts publics.
- Cartes posées à Antoine le 29/09, sans réponse à 21 h ce jour-là : « Commenter » en mode Lecture (recommandation : le
  griser) ; « Par personne » ou « Par ligne » pour les droits de lecture seule (fait « Par personne » en attendant) ;
  trois contrastes restants (message vert « lignes trouvées » à 3,65:1, bleu d'accent sur fond gris à 4,02:1 — onglet
  actif des Réglages, « Modifier le lien » —, puces de la galerie à 4,39:1) ; « [Email indisponible] » et « (aucun titre dans ce document) », restés en français
  (recommandation : traduire).
- Relevés par l'audit du 29/09 sans avoir fait l'objet d'une carte : deux sortes d'info-bulles, quatre crayons pour quatre
  fonctions, des tailles et couleurs écrites en dur dans le CSS, une lecture seule qui grise sans expliquer pourquoi.

---

*Document autonome — collez-le tel quel dans un autre chat pour lui donner le contexte d'identité visuelle des
widgets Grist Factory. Source : exploration directe de `publipostageGrist` (`index.html`, `css/*.css`,
`js/settings.js`, `js/i18n.js`) et de `SlidesPlus` (`README.md`, `ROADMAP.md`, `css/style.css`, `index.html`) le
2026-09-18, plus les décisions d'Antoine déjà actées en mémoire de projet. Mise à jour du 2026-09-29 : `publipostageGrist`
revérifié dans le code (jetons de `css/style.css`, `css/modal-base.css`, `js/modal-base.js`, `js/dialogs.js`,
`js/search-select.js`, `js/i18n.js`, `js/main.js`) et décisions d'Antoine du 18 au 29/09.*

**Mises à jour**
- 2026-09-18 : première version.
- 2026-09-29 : ajout des sections « Contrastes », « Vocabulaire et écriture des textes », « Fenêtres : une seule base pour
  toutes », « Saisies et confirmations », « Choisir une colonne, une table ou un modèle », « Le panneau de référence :
  700×400 » et « La langue de ce que le widget écrit dans le document » ; palette complétée du thème sombre et des jetons
  `--accent-solid` et `--pp-scrim` ; règles « une icône = une fonction », « aucun indice sous un bouton à menu », « grisé,
  jamais masqué », « un défaut qui revient se corrige une fois pour toutes » ; §3 mis à jour (menus au survol, modes et
  droits, rangement des modèles, variables, mode Email livré, galerie `?dev`, feuille A4) ; §5 complété. Corrigé : le
  « rayon moyen de 11 px » était un jeton (`--radius-md`) que plus aucune règle n'utilisait, retiré du CSS par le
  nettoyage du code (restent 7 px sur les contrôles et 8 px sur le cadre des fenêtres) ; le gris « très atténué »
  `#98a2b3` est devenu `#667085` avec les contrastes (un seul gris de texte) ; le renvoi « cf. §3 » du bouton de
  SlidesPlus pointe §4.
