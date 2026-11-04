# Les trois écrans de Grist Factory Suite de la fenêtre « Nouveautés » : où ils sont gardés, comment les remettre

**Retirés le 04/11/2026** de la fenêtre « Nouveautés » de la V1 (demande d'Antoine : « peut-on retirer les éléments liés à GFS, mais les garder en mémoire pour la sortie de GFS ? »). La V1 seule ne montre que ce qu'elle fait. À leur place, trois nouveautés du widget seul : les tableaux comme dans une grille, le macro-modèle qui mêle portrait et paysage, les conditions « Et » / « Ou » à groupes.

Les trois écrans retirés, chacun avec l'étiquette « Grist Factory Suite » : l'écriture en direct (`live`), les présentations (`slides`), le graphique de la page (`chart`). Avant leur retrait, le carrousel avait l'ordre : la Boucle, les versions, la galerie, les signets, la mise en forme du texte, **écriture en direct, présentations, graphique de la page**, puis les deux écrans « avant → après ».

## Où ils sont gardés

- **Git** : le dernier commit qui les porte est `7f45b0c` (`git show 7f45b0c:js/whats-new.js`, de même pour `css/whats-new.css`, `js/i18n.js`, `dev-tests/scenarios-whats-new.js` et `img/news/1.0/live-fr.webp`).
- **Les six images** (WebP, 1200 x 400, une par langue) : `/mnt/project-files/fenetre-nouveautes-2026-10-21/pour-la-sortie-de-gfs/images/` (`live`, `slides`, `chart`, en `fr` et en `en`).
- **Les outils qui les refont** (captures du vrai widget, hébergé par un GFS simulé) : `/mnt/project-files/fenetre-nouveautes-2026-10-21/outils/` : `scene-direct.mjs`, `scene-diapos.mjs`, `scene-graphique.mjs`, puis `GFS=1 node compose-heroes.mjs fr,en` et `python3 make-webp.py <dossier> --gfs` (sans `GFS=1` ni `--gfs`, les outils ne font que les bandeaux de la V1 seule).

## Pour les remettre, quand GFS sort

1. **Images** : copier les six WebP dans `img/news/1.0/` (ou les refaire si les textes ou l'interface de GFS ont changé), puis monter `IMAGE_VERSION` dans `js/whats-new.js` si une image déjà vue est refaite.
2. **`js/whats-new.js`** : dans `SLIDES`, après l'écran `conditions` et avant l'écran « Et aussi » (`news.also.name`, sans image : tous les bandeaux d'abord, puis les trois listes), remettre les trois lignes ci-dessous ; dans la fonction qui dessine un écran, remettre la ligne du badge juste après la création du titre (`name`) ; et dire dans le commentaire de `SLIDES` que `gfs` marque la nouveauté qui n'existe que par Grist Factory Suite.

   ```js
   { image: 'live', gfs: true, name: 'news.live.name', text: 'news.live.text', alt: 'news.live.alt' },
   { image: 'slides', gfs: true, name: 'news.slides.name', text: 'news.slides.text', alt: 'news.slides.alt' },
   { image: 'chart', gfs: true, name: 'news.chart.name', text: 'news.chart.text', alt: 'news.chart.alt' },
   ```

   ```js
   if (slide.gfs) name.append(el('span', 'pp-news-badge', t('news.gfs')));
   ```

3. **`css/whats-new.css`** : remettre la règle de l'étiquette.

   ```css
   /* « Grist Factory Suite » : l'étiquette des nouveautés qui n'existent que par GFS (grisées ailleurs). Contraste du texte >= 4,5:1 sur le fond de l'étiquette. */
   .pp-news-badge { display: inline-block; padding: 1px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-pill, 999px); background: var(--surface-sunken); color: var(--text); font-size: 11px; font-weight: 700; line-height: 14px; white-space: nowrap; }
   ```

4. **`js/i18n.js`** : remettre les dix clés (après `news.conditions.alt`).

   ```js
       'news.gfs': { fr: 'Grist Factory Suite', en: 'Grist Factory Suite' },
       'news.live.name': { fr: 'Écrivez à plusieurs, en direct', en: 'Write together, live' },
       'news.live.text': { fr: 'Chacun voit le curseur et le nom des autres pendant qu’ils écrivent.', en: 'Everyone sees the others’ cursor and name as they type.' },
       'news.live.alt': { fr: 'Un document écrit par trois personnes, avec leurs curseurs', en: 'A document edited by three people, with their cursors' },
       'news.slides.name': { fr: 'Des présentations : formes, transitions et notes', en: 'Presentations: shapes, transitions and notes' },
       'news.slides.text': { fr: 'Formes, transitions, notes d’intervenant, import et export PowerPoint, diaporama : écrivez vos diapositives comme un document, la bande à gauche les range.', en: 'Shapes, transitions, speaker notes, PowerPoint import and export, slide show: write your slides like a document, the strip on the left keeps them in order.' },
       'news.slides.alt': { fr: 'Une présentation avec sa bande de diapositives', en: 'A presentation with its slide strip' },
       'news.chart.name': { fr: 'Le graphique de la page, dans votre document', en: 'The page chart, in your document' },
       'news.chart.text': { fr: 'Insérez un graphique réglé dans Grist : le document le suit quand les données changent.', en: 'Insert a chart set up in Grist: the document follows it when the data changes.' },
       'news.chart.alt': { fr: 'Un graphique en barres dans un document', en: 'A bar chart inside a document' },
   ```

5. **`index.html`** : monter le `?v=` de `js/whats-new.js`, de `css/whats-new.css` et de `js/i18n.js`.
6. **Essais** (à changer avec le code, ils échoueront sinon) :
   - `dev-tests/scenarios-whats-new.js` : `NEWS` 11 -> 14 ; huit bandeaux -> onze (`features.length`, `rows.slice(11)`, `rows[11]` = l'écran « Et aussi » : 5 lignes, 0 flèche, ses cinq sujets ; `rows[12].rows === 4` et 4 flèches ; `rows[13].rows === 5` et 5 flèches ; les trois noms `rows[11]`, `rows[12]`, `rows[13]`) ; « n / 11 » -> « n / 14 » dans le cas des points ; la liste des noms d'images ; et l'assertion `gfs` (aujourd'hui « aucun écran ne parle de Grist Factory Suite ») devient « seuls les trois écrans de GFS portent l'étiquette ».
   - `dev-tests/verify-whats-new-mouse.mjs` : `NEWS` 11 -> 14, `screens.slice(8)` -> `slice(11)` et `screens[8]`, `[9]`, `[10]` -> `[11]`, `[12]`, `[13]` (lignes et flèches des trois derniers écrans), « huit bandeaux » -> onze (`screens.slice(0, 8)`), 17 adresses d'images -> 23, et `.pp-news-badge` dans la liste des textes dont on mesure le contraste.
   - `dev-tests/verify-whats-new-first.mjs` : le nombre d'écrans (`screens === 11` -> 14).
   - `dev-tests/verify-slides-harmony.mjs` : le bloc « Les nouveautés » et les textes `news` / `newsWord` de `T` (voir `git show 7f45b0c:dev-tests/verify-slides-harmony.mjs`, l'écran « Slides+ » était le septième, `WhatsNew.open(6)`).
7. **Documents** : l'entrée « Une fenêtre des nouveautés, avec de vraies captures » du CHANGELOG (français et anglais), la section « La fenêtre des nouveautés » de la charte (`planning/identite-ui-ux-grist-factory.md`), les lignes `whatsNew` de `dev-tests/README.md` et de `dev-tests/run-headless.mjs`.

Tenir la règle de la V1 : tant que GFS n'est pas sorti, ces trois écrans ne reviennent pas dans le widget seul.
