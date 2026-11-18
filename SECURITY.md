# Politique de sécurité

*🇬🇧 An English version of this document is available [below](#security-policy).*

Ce fichier est celui du dépôt de développement de Publipostage+. La politique complète (versions prises en charge,
ce qui relève du dépôt, choix connus et documentés, fiche de crise) est celle du dépôt public : son texte est dans
[`outils/depot-propre/public/SECURITY.md`](outils/depot-propre/public/SECURITY.md).

## Signaler une vulnérabilité

**N'ouvrez pas d'issue publique pour une faille de sécurité.** Utilisez le signalement privé de GitHub sur le
dépôt public du widget : onglet **Security**, puis **Report a vulnerability**
([lien direct](https://github.com/grist-factory/Publipostage-Plus/security/advisories/new)).

Pour que nous puissions la reproduire, indiquez si possible :

- la version du widget (Réglages > Crédits) et le navigateur utilisé ;
- les étapes pour reproduire, et l'effet observé ;
- ce qu'elle permet, selon vous (lire ou écrire des données, exécuter un script, contourner un droit…) ;
- un document Grist d'exemple **sans donnée réelle**, si la faille en dépend.

Le projet est maintenu par une petite équipe : comptez quelques jours ouvrés pour un premier retour. Nous publions
le correctif d'abord, puis le signalement.

---

# Security policy

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#politique-de-sécurité).*

This file belongs to the development repository of Publipostage+. The full policy (supported versions, what is in
scope, known and documented choices, the crisis sheet) is the public repository's: its text is in
[`outils/depot-propre/public/SECURITY.md`](outils/depot-propre/public/SECURITY.md).

## Reporting a vulnerability

**Please don't open a public issue for a security flaw.** Use GitHub's private reporting on the widget's public
repository: the **Security** tab, then **Report a vulnerability**
([direct link](https://github.com/grist-factory/Publipostage-Plus/security/advisories/new)).

So that we can reproduce it, please include if possible:

- the widget version (Settings > Credits) and the browser you used;
- the steps to reproduce, and what you observed;
- what you think it allows (reading or writing data, running a script, bypassing a right…);
- a sample Grist document **with no real data**, if the flaw depends on it.

The project is maintained by a small team: allow a few working days for a first reply. We publish the fix first,
then the report.
