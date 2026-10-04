# Contribuer à Publipostage+

*🇬🇧 An English version of this document is available [below](#contributing-to-publipostage).*

Merci de l'intérêt que vous portez au projet. Signaler un défaut, proposer une fonction, corriger une
faute ou envoyer du code : tout est utile. Le [code de conduite](CODE_OF_CONDUCT.md) s'applique à tous
les échanges. Pour une faille de sécurité, n'ouvrez pas d'issue : suivez [SECURITY.md](SECURITY.md).

## Signaler un défaut ou proposer une idée

Ouvrez une issue, en français ou en anglais, après avoir vérifié qu'elle n'existe pas déjà. Pour un
défaut, indiquez :

- la version du widget (Réglages > Crédits) et le navigateur ;
- si Grist est celui de `docs.getgrist.com` ou un Grist que vous hébergez ;
- les étapes pour reproduire, ce que vous attendiez et ce qui s'est passé, avec une capture d'écran si
  elle aide ;
- jamais de donnée réelle ou personnelle : un document d'exemple suffit.

Pour une idée, dites d'abord le besoin (« je veux envoyer à chaque client sa facture avec… ») avant la
solution. Les lignes de la [roadmap](README.md#roadmap) disent ce qui est déjà prévu.

## Envoyer du code

La [carte du code](CARTE_DU_CODE.md) dit quel fichier fait quoi et par où commencer.

1. Pour un changement qui dépasse quelques lignes, ouvrez d'abord une issue : cela évite un travail que
   nous ne pourrions pas accepter.
2. Faites un fork, créez une branche à partir de `main`, puis ouvrez une pull request vers `main`.
3. Un sujet par pull request, petite de préférence. Décrivez ce qu'on voyait avant, ce qu'on voit après
   et comment vous l'avez essayé ; pour un changement d'interface, joignez des captures.
4. En envoyant une contribution, vous acceptez qu'elle soit distribuée sous la licence du projet, la
   [GNU GPL v3.0](LICENSE).

Le code écrit avec l'aide d'une IA est accepté, comme l'est celui de ce projet, à condition qu'une
personne l'ait compris, relu et essayé, et qu'il ne soit pas bavard : un commentaire dit *pourquoi*, pas
ce que la ligne fait.

## Essayer ses changements

Il n'y a pas d'étape de build : le widget est une page statique. Servez le dossier avec n'importe quel
serveur statique, par exemple :

```bash
python3 -m http.server 8080
```

puis, dans une page Grist, ajoutez un widget personnalisé à l'adresse `http://localhost:8080/` (réglez
**Select by**, voir le [README](README.md#installation-dans-grist)). Après une modification, rechargez la
page du document Grist.

La suite de tests automatisés des mainteneurs (Chromium sans écran, avec un simulateur de Grist) n'est
pas encore publiée avec ce dépôt : essayez à la main, sur un document de test, les modes Édition et
Lecture, un export PDF et, selon le cas, Word, Excel ou l'e-mail, et dites dans la pull request ce que
vous avez essayé. Les mainteneurs rejouent leur suite avant de fusionner et reprennent parfois la
contribution de leur côté : elle paraît alors dans la version suivante (voir le
[CHANGELOG](CHANGELOG.md)).

## Règles du code

- **Français et anglais ensemble** : tout texte affiché est dans `js/i18n.js`, avec sa version française
  et sa version anglaise dans la même contribution. Le vocabulaire français dit « modèle », jamais
  « template ». Les pluriels passent par `I18n.t` (`{n|singulier|pluriel}`).
- **Cache du navigateur** : un fichier de `css/` ou de `js/` modifié monte son numéro `?v=` dans
  `index.html`, sinon les navigateurs gardent l'ancienne version.
- **Sécurité de la page** : `index.html` porte une politique de sécurité du contenu. Si vous modifiez
  l'un des trois scripts en ligne de la page, mettez à jour son empreinte `sha256-…` dans cette
  politique (la console du navigateur affiche celle qui est attendue). Une nouvelle bibliothèque tierce
  s'ajoute à la politique, en version figée (jamais `@latest`) et, hors `esm.sh`, avec une intégrité SRI.
  Pas d'`eval`, pas de police ni de feuille de style d'un autre site : l'interface prend la police du
  système.
- **Pas de nouvelle dépendance sans raison** : le widget n'a pas d'étape de build, et chaque
  bibliothèque est un appel réseau de plus pour les personnes qui l'utilisent en administration.
- **Couleurs et couches** : utilisez les variables de `css/style.css` (un texte rouge est `--danger-ink`,
  jamais `--danger` ; les couches utilisent les `--z-*`, jamais un `z-index` en dur), et vérifiez les
  contrastes (4,5:1 au moins) en thème clair et en thème sombre.
- **Fidélité** : ce qui se voit dans l'éditeur doit se voir de la même façon en Lecture, dans le PDF et
  dans le Word.
- **Rien ne disparaît** : une commande qui ne s'applique pas à l'endroit où l'on est se grise, elle ne
  se retire pas.
- **Le code et ses commentaires sont en français** ; vous pouvez écrire les vôtres en anglais.

---

# Contributing to Publipostage+

*🇫🇷 Une version française de ce document est disponible [en haut de cette page](#contribuer-à-publipostage).*

Thank you for your interest in the project. Reporting a defect, suggesting a feature, fixing a typo or
sending code: all of it helps. The [code of conduct](CODE_OF_CONDUCT.md) applies to every exchange. For a
security flaw, don't open an issue: follow [SECURITY.md](SECURITY.md).

## Reporting a defect or suggesting an idea

Open an issue, in French or English, after checking that it doesn't already exist. For a defect, say:

- the widget version (Settings > Credits) and the browser;
- whether Grist is the one at `docs.getgrist.com` or one you host yourself;
- the steps to reproduce, what you expected and what happened, with a screenshot if it helps;
- never real or personal data: a sample document is enough.

For an idea, first say the need ("I want to send each customer their invoice with…") before the
solution. The [roadmap](README.md#roadmap-1) lines say what is already planned.

## Sending code

The [code map](CARTE_DU_CODE.md#publipostage-code-map) says which file does what and where to start.

1. For a change of more than a few lines, open an issue first: it avoids work we couldn't accept.
2. Fork, create a branch from `main`, then open a pull request against `main`.
3. One subject per pull request, small if possible. Describe what you saw before, what you see after and
   how you tried it; for an interface change, attach screenshots.
4. By sending a contribution, you agree that it is distributed under the project's license, the
   [GNU GPL v3.0](LICENSE).

Code written with the help of an AI is accepted, as this project's own is, provided a person has
understood, reviewed and tried it, and that it isn't verbose: a comment says *why*, not what the line
does.

## Trying your changes

There is no build step: the widget is a static page. Serve the folder with any static server, for
example:

```bash
python3 -m http.server 8080
```

then, in a Grist page, add a custom widget at `http://localhost:8080/` (set **Select by**, see the
[README](README.md#installing-in-grist)). After a change, reload the Grist document's page.

The maintainers' automated test suite (headless Chromium, with a Grist simulator) is not yet published
with this repository: try by hand, on a test document, the Edit and Reading modes, a PDF export and,
as relevant, Word, Excel or e-mail, and say in the pull request what you tried. The maintainers replay
their suite before merging and sometimes take the contribution over on their side: it then ships in
the next version (see the [CHANGELOG](CHANGELOG.md)).

## Code rules

- **French and English together**: every displayed text lives in `js/i18n.js`, with its French and its
  English version in the same contribution. French wording says "modèle", never "template". Plurals go
  through `I18n.t` (`{n|singular|plural}`).
- **Browser cache**: a modified file in `css/` or `js/` bumps its `?v=` number in `index.html`,
  otherwise browsers keep the old version.
- **Page security**: `index.html` carries a Content Security Policy. If you change one of the page's
  three inline scripts, update its `sha256-…` hash in that policy (the browser console shows the
  expected one). A new third-party library is added to the policy, at a pinned version (never
  `@latest`) and, apart from `esm.sh`, with an SRI integrity hash. No `eval`, no font or stylesheet
  from another site: the interface uses the system font.
- **No new dependency without a reason**: the widget has no build step, and every library is one more
  network call for people who use it in an administration.
- **Colors and layers**: use the variables in `css/style.css` (red text is `--danger-ink`, never
  `--danger`; layers use the `--z-*` tokens, never a hard-coded `z-index`), and check contrast (at least
  4.5:1) in both the light and the dark theme.
- **Fidelity**: what is seen in the editor must look the same in Reading mode, in the PDF and in the
  Word file.
- **Nothing disappears**: a command that doesn't apply where you are is greyed out, not removed.
- **Code and comments are in French**; you may write yours in English.
