# Identité UI/UX — Grist Factory

> **À quoi sert ce document.** Décrire, avec des faits vérifiés dans le code (pas des intentions), les choix
> d'interface déjà faits par Antoine sur les widgets Grist Factory — ce qui est commun à tous les widgets et ce
> qui est propre à chacun — pour pouvoir être collé tel quel dans un autre chat/projet Claude et lui donner
> immédiatement le bon cadre : quelle identité respecter, quoi ne pas réinventer, quoi rester au milieu de la
> route en attendant un arbitrage d'Antoine. État au 2026-09-18, vérifié dans `publipostageGrist` (dépôt mature)
> et `SlidesPlus` (fondation, pas encore un éditeur utilisable).

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
  chrome — placement de référence, choisi par Antoine sur Publipostage+ : juste à droite de l'icône Réglages.
  Discret veut dire une taille de repère de marque, pas un élément qui capte l'attention ni qui déplace les
  contrôles existants autour de lui (non-régression, cf. §1 « Non-régression »). L'asset lui-même n'est pas
  vendorisable comme les autres dépendances (§1 « Pas de framework ») : c'est un fichier image à obtenir auprès
  d'Antoine (avatar du Grist « Grist Factory »), pas à recréer ou à deviner.

### Palette : neutre + un seul accent, pas de « monochrome » au sens gris-sur-gris
« Interface principalement monochrome » (règle d'Antoine) veut dire : une base de gris (fond/surface/bordure/texte
à plusieurs intensités) + **un seul bleu d'accent** pour les actions/états actifs, et rien d'autre sans raison
fonctionnelle. Deux couleurs sémantiques s'y ajoutent, jamais décoratives :
- **Rouge** — erreurs, actions destructrices (`--danger`).
- **Ambre** — attention/état en attente (conflit d'autosave sur Publipostage+, badge « connexion en cours » sur
  SlidesPlus) : la même intention existe déjà sur les deux widgets, avec des teintes proches mais pas encore
  unifiées en un token partagé — à harmoniser si un design system commun est créé.

Palette exacte de Publipostage+ (`css/style.css`, thème clair) :

| Rôle | Valeur |
|---|---|
| Fond app | `#f4f6fa` |
| Surface (cartes, barres) | `#ffffff` |
| Surface enfoncée | `#eef1f6` |
| Bordure | `#dde2ea` / bordure forte `#c3cad6` |
| Texte | `#1b2430` / atténué `#667085` / très atténué `#98a2b3` |
| **Accent** (unique) | `#2f6fed`, survol `#2558c4`, fond doux `#e8f0fe` |
| Danger | `#d84343`, fond doux `#fbe9e9` |
| Rayon d'angle | petit `7px`, moyen `11px` (coins arrondis partout, jamais carrés) |
| Ombres | portée douce pour les éléments flottants/modales, très légère pour les cartes |

Ne pas ajouter une couleur qui n'a pas de rôle sémantique clair (pas de couleur « parce que c'est joli »).

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
choisi explicitement.

### Icônes : traits monochromes, jamais de police d'icônes ni d'emoji
Toutes les icônes de Publipostage+ sont des SVG en **contour** (`stroke`, pas de remplissage), intégrées en
`mask-image` CSS plutôt qu'en `<img>` : l'icône hérite alors de la couleur du bouton (texte/accent selon l'état),
donc elle s'adapte automatiquement au thème clair/sombre et à l'état survolé/actif sans doublon d'asset. Pas de
police d'icônes (Font Awesome, etc.), pas d'emoji dans le chrome de l'app (SlidesPlus utilise encore un emoji
`⛶` sur son unique bouton — état de fondation, cf. §3).

### Un seul éditeur, une seule barre d'outils, partagés par tous les modes
Publipostage+ a un seul composant d'édition et une seule barre d'outils (`#v2-toolbar`) pour tous ses modes
(Édition, Lecture, et le futur mode Email) : `switchMode()` (`js/main.js:550`) ne masque que la zone
éditeur/lecteur, jamais la barre d'outils elle-même. Un bouton sans effet dans un mode donné est **grisé**
(classe `v2-hf-locked`), jamais masqué ni dupliqué dans un composant séparé. Toute nouvelle fonctionnalité de
toolbar transposable à plusieurs modes (ex. bouton `#Variable`) est un composant partagé unique, pas une copie
par mode. Ce principe — pas de duplication de code d'UI entre modes/contextes d'un même widget — est une règle
explicite d'Antoine, pas seulement une observation.

### Non-régression stricte de l'UI existante
Règle d'Antoine valable sur tous les widgets : **on ajoute des éléments d'UI, on ne modifie ni ne supprime ceux
qui existent déjà** sans son accord explicite. Une barre d'outils jugée dense ou perfectible (cf. Publipostage+,
§3) reste telle quelle tant qu'il n'a pas validé un changement — la réponse à une UI qu'on n'ose pas retoucher
n'est jamais de la retoucher quand même, c'est de proposer sans y toucher.

### Bilingue fr/en systématique
Chaque chaîne d'interface visible passe par un attribut `data-i18n` (ex. `data-i18n="settings.credits.author"`)
résolu par un module i18n dédié (`js/i18n.js` sur Publipostage+, clé `fr`/`en` en miroir). Toute chaîne d'UI
ajoutée ou modifiée doit avoir sa traduction anglaise dans le **même lot** — jamais en suivi séparé.

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

- Barre d'outils V2 (`#v2-toolbar` + `.bar-row`) : environ **30 boutons icône seule** (sans libellé texte), sur
  **5 rangées** en dessous de 420px de large, avec sous-menus révélés au survol. Constat de densité admis par
  Antoine mais **chantier gelé** — c'est ce qui a fait préférer un ajustement automatique de la mise en page à un
  contrôle de zoom manuel. Ne rien ajouter dans cette barre sans son accord.
- Modèles de démonstration/test tenus hors de la galerie publique : dossier `templates-gallery-dev/` avec son
  propre manifeste, chargement optionnel — le dépôt public (`grist-factory/Publipostage-Plus`) ne le publie pas.
- Mode Email (en cours de cadrage, pas encore implémenté) : règle déjà tranchée à respecter — **strictement l'UI
  existante**, aucun nouveau composant visuel ; en cas de doute, réutiliser un pattern déjà en place plutôt que
  d'en inventer un.

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

---

*Document autonome — collez-le tel quel dans un autre chat pour lui donner le contexte d'identité visuelle des
widgets Grist Factory. Source : exploration directe de `publipostageGrist` (`index.html`, `css/*.css`,
`js/settings.js`, `js/i18n.js`) et de `SlidesPlus` (`README.md`, `ROADMAP.md`, `css/style.css`, `index.html`) le
2026-09-18, plus les décisions d'Antoine déjà actées en mémoire de projet.*
