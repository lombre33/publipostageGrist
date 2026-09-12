# Publipostage Grist

Widget personnalisé pour [Grist](https://www.getgrist.com/) permettant de faire du **publipostage** :
concevoir un modèle de document (texte riche, tableaux, images, zones 2 colonnes, en-têtes/pieds de
page, notes de bas de page) contenant des **variables** résolues automatiquement avec les données
d'une ligne Grist (`#Table.Colonne`), puis d'exporter ce document en PDF — y compris en export
**vectoriel** (texte réellement sélectionnable, pas une image du rendu HTML).

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation dans Grist](#installation-dans-grist)
- [Configuration](#configuration)
- [Sécurité et permissions](#sécurité-et-permissions)
- [Dépendances](#dépendances)
- [Tests](#tests)
- [État du projet](#état-du-projet)
- [Licence](#licence)

Moteur d'édition : [TipTap](https://tiptap.dev/)/ProseMirror. Déployé comme une page statique
unique sur GitHub Pages — aucune étape de build.

## Fonctionnalités

- Éditeur de texte riche (gras/italique/souligné/barré, couleurs, polices/tailles réelles en points,
  alignement, listes à puces/numérotées/cases à cocher, citations, tableaux, zones 2 colonnes,
  images avec habillage/calque, sauts de page, sommaire avec numérotation de titres, notes de bas de
  page, chips intelligents date/heure/email).
- Variables `#Table.Colonne` avec autocomplétion, y compris des références vers des tables **autres**
  que celle liée au widget dans la page Grist (via des règles de correspondance configurables).
- Galerie de modèles pré-remplis prêts à l'emploi.
- Export PDF en 4 qualités : **vectoriel** (moteur principal, texte sélectionnable, fidèle à la mise
  en page de l'éditeur), impression navigateur, raster basse/ultra qualité ; export en lot (zip) sur
  plusieurs lignes Grist à la fois.
- Interface bilingue français/anglais, touche de déclenchement de l'autocomplétion configurable.

## Installation dans Grist

1. Dans une page Grist, ajouter un widget personnalisé et renseigner l'URL du dépôt publié (voir
   le déploiement GitHub Pages du dépôt).
2. Lier le widget à la table Grist dont les lignes serviront de source de données pour le
   publipostage (le widget suit la sélection de ligne active, comme n'importe quel widget "détail"
   Grist standard).
3. Grist demande l'autorisation d'accès du widget au chargement (voir
   [Sécurité et permissions](#sécurité-et-permissions) ci-dessous) — l'accepter est nécessaire au
   fonctionnement du widget.

## Configuration

- **Créer/éditer un modèle** : bouton "Nouveau modèle" ou sélecteur de modèle en haut de l'éditeur.
  Chaque modèle est enregistré dans une table Grist interne dédiée (créée automatiquement,
  préfixée `Publipostage_`, invisible dans les sélecteurs de table normaux).
- **Variables cross-table** : le panneau `#` (autocomplétion) permet de référencer une colonne
  d'une table autre que celle liée au widget, via une règle de correspondance configurée une seule
  fois par relation entre tables (bouton dédié dans le panneau `#`).
- **En-tête/pied de page** : cliquer une marge de page en haut/bas de l'aperçu pour entrer en mode
  d'édition dédié.
- **Réglages** (icône en haut à droite du bandeau) : langue de l'interface (FR/EN), symbole
  déclenchant le panneau `#` (par défaut), crédits.
- **Nom du fichier PDF exporté** : champ dédié, accepte lui aussi des variables `#Table.Colonne`.

## Sécurité et permissions

**Niveau d'accès demandé** : `requiredAccess: 'full'` — le widget lit et écrit sur l'ensemble du
document Grist, pas seulement sur la table à laquelle il est lié dans la page. Ce niveau est
**nécessaire** avec l'architecture actuelle : la résolution de variables faisant référence à une
table tierce, l'autocomplétion sur l'ensemble du document, et la gestion des tables internes du
widget (modèles, règles de correspondance) en ont besoin dès le chargement — l'API de widget
personnalisé de Grist ne propose aucun niveau intermédiaire entre "lecture d'une seule table" et
"accès complet".

**Ce que cela implique pour un déploiement en administration** : ce niveau d'accès s'applique au
*widget*, pas directement à chaque utilisateur — un utilisateur qui n'a, via les **Règles d'accès**
natives de Grist (Access Rules, configurées sur le document par son propriétaire), qu'un accès
restreint à certaines tables/colonnes conserve cette restriction quand il utilise le widget. **La
restriction fine du périmètre de données doit donc être faite au niveau du document Grist
lui-même (Règles d'accès), pas dans la configuration du widget**, qui ne l'expose pas.

**Dépendances externes** : le widget charge des bibliothèques JavaScript tierces à l'exécution
depuis deux CDN publics (`esm.sh` pour le moteur d'édition TipTap/ProseMirror, `cdnjs.cloudflare.com`
pour la génération de PDF — détail complet ci-dessous). Les bibliothèques `cdnjs` sont protégées par
une intégrité SRI (le navigateur refuse d'exécuter un fichier altéré) ; ce n'est techniquement pas
possible pour l'import map `esm.sh` (limitation des imports ES) — voir
[`AUDIT_CODE.md`](AUDIT_CODE.md#2-enjeu-majeur-rssi--périmètre-daccès-et-surface-dattaque)
pour l'analyse détaillée de ce point et la piste restante (auto-hébergement).

**Aucune donnée n'est stockée hors de Grist** : les seules données conservées côté navigateur
(`localStorage`) sont des préférences d'interface (langue, touche de déclenchement) — aucune donnée
métier ou personnelle.

**Signaler une vulnérabilité** : ne pas ouvrir d'issue publique. Contacter l'équipe de maintenance de
ce dépôt directement (canal à préciser selon le contexte de publication/rattachement du widget).

## Dépendances

Aucune étape de build : tous les fichiers sont servis tels quels (pages statiques). Les bibliothèques
tierces sont chargées à l'exécution, versions toujours figées (jamais `@latest`) :

| Bibliothèque | Usage | Origine |
|---|---|---|
| `grist-plugin-api.js` | API du widget Grist (obligatoire) | `docs.getgrist.com` |
| TipTap 3.31.3 + ProseMirror (~20 paquets) + `@floating-ui/dom` | Moteur d'édition riche | `esm.sh` (import map, `index.html`) |
| pdfmake 0.2.7 + `vfs_fonts` | Export PDF vectoriel | `cdnjs.cloudflare.com` |
| html2pdf.js 0.10.1 | Export PDF qualité raster | `cdnjs.cloudflare.com` |
| JSZip 3.10.1 | Export en lot (archive zip) | `cdnjs.cloudflare.com` |

## Tests

Une suite de tests automatisés (`dev-tests/`, ~90 scénarios) couvre l'éditeur et l'export PDF
vectoriel — voir [`dev-tests/README.md`](dev-tests/README.md) pour l'exécuter. Portée
volontaire : tout sauf la résolution `#Variable`/pièces jointes réelles, qui nécessite un vrai
document Grist et n'est pas testable en local.

## État du projet

Un audit de code complet (qualité, sécurité, conformité aux exigences de publication) a été réalisé
le 2026-09-12 — voir [`AUDIT_CODE.md`](AUDIT_CODE.md) pour le détail des constats et leur
priorité.

## Licence

À définir avant publication officielle.
