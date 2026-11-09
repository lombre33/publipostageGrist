# Politique de sécurité

*🇬🇧 An English version of this document is available [below](#security-policy).*

## Versions prises en charge

Seule la dernière version publiée de Publipostage+ reçoit des correctifs de sécurité (aujourd'hui, la
version {{VERSION}}). Le widget est une page statique : mettre à jour consiste à republier les fichiers,
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

## Si un site tiers ou un compte est compromis

Le widget charge son code depuis son propre site (GitHub Pages), depuis `esm.sh` (l'éditeur), depuis `cdnjs.cloudflare.com` et `cdn.jsdelivr.net` (les exports, chacun avec une empreinte d'intégrité SRI que le navigateur vérifie), et le script d'API de Grist depuis `docs.getgrist.com`. Une vidéo posée dans un modèle ne charge son lecteur qu'au clic sur ▶, dans un cadre de `www.youtube-nocookie.com` ou de `player.vimeo.com` (les deux seuls cadres que la politique autorise ; avec Grist Factory Suite, c'est elle qui joue le lecteur). Avec l'accès complet au document, un script piégé servi par l'un d'eux, ou publié depuis un compte volé, pourrait lire et écrire tout le document. Voici ce que l'équipe prévoit de faire, dans cet ordre, dès qu'un de ces cas est signalé :

1. **Prévenir.** Un avis en tête du README dit ce qui est touché et ce que chaque personne doit faire, en premier lieu retirer le widget de ses pages Grist le temps de la correction.
2. **Couper la source.** Pour un site tiers : retirer son adresse de la politique de sécurité du contenu (la balise `<meta http-equiv="Content-Security-Policy">` de `index.html`) et republier. Le navigateur refuse alors tout script venu de ce site, même si une balise le demande ; le widget peut ne plus démarrer, ce qui est voulu. Pour le compte qui publie : remettre en ligne la dernière version saine (une étiquette `vX.Y.Z` du dépôt) avant toute autre chose.
3. **Reprendre la main sur le compte.** Changer le mot de passe, fermer toutes les sessions, révoquer les clés d'accès et les jetons personnels, vérifier les branches, l'historique et les réglages de Pages du dépôt.
4. **Mesurer.** Relire les commits publiés depuis la dernière version saine et noter la période pendant laquelle un code piégé a pu être servi.
5. **Corriger et informer.** Publier la correction, puis un avis qui donne cette période : les personnes concernées relisent, sur ces dates, l'historique d'activité de leurs documents Grist.

Un fichier modifié sur `cdnjs.cloudflare.com` ou `cdn.jsdelivr.net` est déjà refusé par le navigateur (SRI). Le cas qui demande cette fiche est surtout celui d'`esm.sh`, dont l'éditeur est chargé sans empreinte (voir « Choix connus, documentés »).

---

# Security policy

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#politique-de-sécurité).*

## Supported versions

Only the latest released version of Publipostage+ receives security fixes (today, version {{VERSION}}). The
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

## If a third-party site or an account is compromised

The widget loads its code from its own site (GitHub Pages), from `esm.sh` (the editor), from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net` (the exports, each with an SRI integrity hash that the browser checks), and Grist's API script from `docs.getgrist.com`. A video placed in a template only loads its player when ▶ is clicked, in a frame from `www.youtube-nocookie.com` or `player.vimeo.com` (the only two frames the policy allows; with Grist Factory Suite, it plays the player itself). With full access to the document, a booby-trapped script served by any of them, or published from a stolen account, could read and write the whole document. This is what the team plans to do, in this order, as soon as one of these cases is reported:

1. **Warn.** A notice at the top of the README says what is affected and what each person should do, first of all remove the widget from their Grist pages while the fix is made.
2. **Cut the source.** For a third-party site: remove its address from the content security policy (the `<meta http-equiv="Content-Security-Policy">` tag of `index.html`) and republish. The browser then refuses any script coming from that site, even if a tag asks for it; the widget may stop starting, which is intended. For the publishing account: put the last sound version back online (a `vX.Y.Z` tag of the repository) before anything else.
3. **Take the account back.** Change the password, end all sessions, revoke access keys and personal tokens, check the repository's branches, history and Pages settings.
4. **Measure.** Review the commits published since the last sound version and note the period during which booby-trapped code may have been served.
5. **Fix and inform.** Publish the fix, then a notice giving that period: affected people review their Grist documents' activity history over those dates.

A file altered on `cdnjs.cloudflare.com` or `cdn.jsdelivr.net` is already refused by the browser (SRI). The case this sheet is mainly for is `esm.sh`, whose editor is loaded without a hash (see "Known, documented choices").
