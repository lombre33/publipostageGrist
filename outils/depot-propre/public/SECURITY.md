# Politique de sécurité

*🇬🇧 An English version of this document is available [below](#security-policy).*

## Versions prises en charge

Seule la dernière version publiée de Publipostage+ reçoit des correctifs de sécurité (aujourd'hui, la
bêta {{VERSION}}). Le widget est une page statique : mettre à jour consiste à republier les fichiers,
puis à recharger la page du document Grist.

## Signaler une vulnérabilité

**N'ouvrez pas d'issue publique pour une faille de sécurité.** Utilisez le signalement privé de GitHub :
onglet **Security** de ce dépôt, puis **Report a vulnerability**
([lien direct](https://github.com/grist-factory/Publipostage-Plus/security/advisories/new)).

Pour que nous puissions la reproduire, indiquez si possible :

- la version du widget (Réglages > Crédits) et le navigateur utilisé ;
- les étapes pour reproduire, et l'effet observé ;
- ce qu'elle permet, selon vous (lire ou écrire des données, exécuter un script, contourner un droit…) ;
- un document Grist d'exemple **sans donnée réelle**, si la faille en dépend.

Le projet est maintenu par une petite équipe : comptez quelques jours ouvrés pour un premier retour.
Nous publions le correctif d'abord, puis le signalement, et nous citons volontiers la personne qui l'a
fait, si elle le souhaite.

## Ce qui relève de ce dépôt

- Du code du widget qui exécute un script ou injecte du HTML à partir du contenu d'un modèle, d'une
  cellule ou d'un fichier importé (`.xlsx`, collage).
- Un contournement de la politique de sécurité du contenu (CSP) ou du filtre qui assainit le HTML d'un
  modèle.
- Une fuite de données du document vers un site tiers, ou une écriture hors des tables internes
  `Publipostage_*`.
- Une bibliothèque tierce épinglée dans une version connue pour être vulnérable.

## Ce qui n'en relève pas

- Une faille de Grist lui-même : à signaler à [Grist Labs](https://github.com/gristlabs/grist-core/security).
- Une faille d'un service tiers dont le widget charge des fichiers (`esm.sh`, `cdnjs.cloudflare.com`,
  `cdn.jsdelivr.net`) : à signaler à ce service.
- Des Règles d'accès Grist mal réglées sur votre document.
- L'hameçonnage d'une personne qui a le droit de modifier le document.

## Choix connus, documentés

Ces limites sont décrites dans le [README](README.md#sécurité-et-permissions) ; ce ne sont pas des
vulnérabilités, mais des améliorations sont les bienvenues sous forme d'issue :

- le widget demande l'accès complet au document (`requiredAccess: 'full'`), faute de niveau
  intermédiaire dans Grist ;
- les imports ES de `esm.sh` ne peuvent pas porter d'intégrité SRI ;
- la CSP garde `'unsafe-eval'`, que le script d'API de Grist exige, et ne limite ni les images ni les
  connexions ;
- les « droits par personne » du widget sont un verrou d'interface, pas une protection des données.

---

# Security policy

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#politique-de-sécurité).*

## Supported versions

Only the latest released version of Publipostage+ receives security fixes (today, beta {{VERSION}}). The
widget is a static page: updating means republishing the files, then reloading the Grist document's
page.

## Reporting a vulnerability

**Please don't open a public issue for a security flaw.** Use GitHub's private reporting: the
**Security** tab of this repository, then **Report a vulnerability**
([direct link](https://github.com/grist-factory/Publipostage-Plus/security/advisories/new)).

So that we can reproduce it, please include if possible:

- the widget version (Settings > Credits) and the browser you used;
- the steps to reproduce, and what you observed;
- what you think it allows (reading or writing data, running a script, bypassing a right…);
- a sample Grist document **with no real data**, if the flaw depends on it.

The project is maintained by a small team: allow a few working days for a first reply. We publish the
fix first, then the report, and we're glad to credit the person who reported it, if they wish.

## What is in scope

- Widget code that runs a script or injects HTML from the content of a template, a cell or an imported
  file (`.xlsx`, paste).
- A bypass of the Content Security Policy (CSP) or of the filter that sanitizes a template's HTML.
- A leak of document data to a third-party site, or a write outside the internal `Publipostage_*`
  tables.
- A pinned third-party library at a version known to be vulnerable.

## What is out of scope

- A flaw in Grist itself: report it to [Grist Labs](https://github.com/gristlabs/grist-core/security).
- A flaw in a third-party service the widget loads files from (`esm.sh`, `cdnjs.cloudflare.com`,
  `cdn.jsdelivr.net`): report it to that service.
- Misconfigured Grist Access Rules on your document.
- Phishing of a person who has the right to edit the document.

## Known, documented choices

These limitations are described in the [README](README.md#security-and-permissions); they are not
vulnerabilities, but improvements are welcome as an issue:

- the widget requests full access to the document (`requiredAccess: 'full'`), for lack of a middle
  level in Grist;
- `esm.sh` ES imports cannot carry an SRI integrity hash;
- the CSP keeps `'unsafe-eval'`, which Grist's API script requires, and limits neither images nor
  connections;
- the widget's "per-person rights" are an interface lock, not data protection.
