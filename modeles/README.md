# Les modèles de départ de Publipostage+ pour Grist Factory Suite

Ce dossier est le catalogue que Grist Factory Suite (GFS) affiche dans **Nouveau > Depuis un modèle** : `modeles.json` (une entrée par modèle) et une vignette WebP par modèle, à côté. GFS ne charge rien depuis ce dépôt : son outil `outils/modeles.mjs` copie ces fichiers chez lui. Les modèles eux-mêmes sont ceux de la galerie de l'app (`templates-gallery/`) : le catalogue ne les duplique pas, il les désigne par leur `id`.

**Ce qui se passe au clic sur « Créer » dans GFS** : l'app s'ouvre sur un modèle **non enregistré**, fait d'après le modèle de cet `id`, comme un « Nouveau » qui aurait déjà son texte (le nom de la galerie est déjà dans le champ du nom). Rien n'est écrit avant le premier « Enregistrer » ; les tables du modèle ne sont créées qu'après la demande d'accord « Créer les tables du modèle ? » ; un refus ou « Annuler » ne laisse rien derrière lui. Un `id` que l'app ne connaît pas n'ouvre rien (jamais un modèle vierge à la place). Le code est dans `js/gfs-link.js`, `js/gfs-open.js` et `js/template-gallery-modal.js` (`openFromGfs`).

## Les règles

- `id` : le dossier du modèle dans `templates-gallery/`. **Il ne change jamais et n'est jamais réutilisé** : GFS retrouve le modèle par lui.
- `type`, `extensions`, `tables` : ceux du `pack.json` du modèle (`extensions` : ce que le pack exige **en plus** de l'extension de son type ; `tables: true` : il vient avec ses tables).
- `nom` et `etiquettes` : ceux de la galerie, en français et en anglais (`js/i18n-texts-templates.js`, `gallery.name.<id>` et `gallery.tag.<étiquette>`). `description` : 140 signes au plus par langue.
- `vignette` : `<id>.webp`, WebP **sans perte** de 240 × 320 px, 12 Ko au plus, tirée du `thumb.png` du modèle dans la galerie (donc de ses données d'exemple, sans nom de personne réel).
- Tout est en français **et** en anglais, dans le même lot.

## Vérifier

```
node dev-tests/unit-modeles.mjs                 # la forme, l'accord avec la galerie, les vignettes
node dev-tests/verify-gfs-model.mjs             # l'ouverture dans l'app (navigateur sans écran)
node <GFS>/prototype/outils/modeles.mjs --app publipostage --depuis <ce dépôt> --verifier   # l'outil de GFS lui-même
```

Une vignette se refait ainsi (Python, Pillow) : `Image.open('templates-gallery/<id>/thumb.png').convert('RGB').save('modeles/<id>.webp', 'WEBP', lossless=True, quality=100, method=6)`. Un modèle nouveau dans la galerie s'ajoute ici, avec sa vignette ; un modèle retiré de la galerie se retire ici aussi (les essais le disent).

Ce dossier n'est **pas** publié dans le dépôt public (`outils/depot-propre/`) : GFS le lit dans le dépôt de l'app.

---

# Publipostage+ starter templates for Grist Factory Suite

This folder is the catalogue Grist Factory Suite (GFS) shows in **New > From a template**: `modeles.json` (one entry per template) and one WebP thumbnail per template next to it. GFS loads nothing from this repository: its `outils/modeles.mjs` tool copies these files into GFS. The templates themselves are the ones in the app's gallery (`templates-gallery/`): the catalogue does not copy them, it points to them by `id`.

**What happens when someone clicks “Create” in GFS**: the app opens a **not-saved** template made from that `id`, like a “New” that already has its text (the gallery name is already in the name field). Nothing is written before the first “Save”; the template's tables are only created after the “Create the template's tables?” consent; refusing or “Cancel” leaves nothing behind. An `id` the app does not know opens nothing (never a blank template instead). The code is in `js/gfs-link.js`, `js/gfs-open.js` and `js/template-gallery-modal.js` (`openFromGfs`).

## The rules

- `id`: the template's folder in `templates-gallery/`. **It never changes and is never reused**: GFS finds the template by it.
- `type`, `extensions`, `tables`: those of the template's `pack.json` (`extensions`: what the pack requires **on top of** its type's extension; `tables: true`: it comes with its tables).
- `nom` and `etiquettes`: the gallery's, in French and English (`js/i18n-texts-templates.js`, `gallery.name.<id>` and `gallery.tag.<tag>`). `description`: 140 characters at most per language.
- `vignette`: `<id>.webp`, a **lossless** WebP of 240 × 320 px, 12 KB at most, taken from the template's `thumb.png` in the gallery (so from its sample data, with no real person's name).
- Everything is in French **and** English, in the same change.

## Checking

See the commands above. A thumbnail is rebuilt with Pillow: `Image.open('templates-gallery/<id>/thumb.png').convert('RGB').save('modeles/<id>.webp', 'WEBP', lossless=True, quality=100, method=6)`. A template added to the gallery is added here with its thumbnail; one removed from the gallery is removed here too (the tests say so).

This folder is **not** published to the public repository (`outils/depot-propre/`): GFS reads it from the app's repository.
