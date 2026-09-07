# Harnais de test de fidélité éditeur ↔ export PDF

Objectif : vérifier, hors Grist (donc testable en local, cf. `feedback_testing_workflow`
dans la mémoire du projet — seule la partie Grist-dépendante du widget ne peut pas être
testée localement ; l'éditeur et l'export PDF, eux, le peuvent intégralement), que le
rendu de `.ql-editor` (en mode "Aperçu format A4") et celui du PDF vectoriel natif
(`js/pdf-export.js`, qualité "native") correspondent pixel pour pixel — position des
images en calque, alignement du texte (gauche/centre/droite/justifié), police, taille.

## Pourquoi ça existe

Plusieurs correctifs successifs (marge, interligne, ancrage au paragraphe, largeur du
mode A4, police par défaut) ont chacun corrigé un écart réel, mais découvert au coup
par coup sur un cas particulier. Ce harnais fait tourner une MATRICE de cas
représentatifs à chaque fois, pour repérer les écarts D'UN COUP plutôt qu'un par un.

## Comment l'utiliser

1. Démarrer le serveur statique local (`static-server`, port 8734 — voir
   `.claude/launch.json`, non versionné) et ouvrir `http://localhost:8734`.
2. Charger `scenarios.js` puis `runner.js` dans la page (ou les coller dans la console
   du navigateur, dans CET ORDRE) :
   ```js
   const s1 = await fetch('/dev-tests/scenarios.js', { cache: 'no-store' }).then(r => r.text());
   eval(s1);
   const s2 = await fetch('/dev-tests/runner.js', { cache: 'no-store' }).then(r => r.text());
   eval(s2);
   ```
   Toujours utiliser `{ cache: 'no-store' }` — le cache navigateur sur les fichiers JS
   servis en local a produit plusieurs faux négatifs pendant le développement de ce
   harnais (un correctif semblait ne rien changer alors que le fichier servi datait
   d'avant le correctif).
3. Lancer un scénario : `await FidelityHarness.run(FidelityScenarios.centered_behind)`.
   Ça configure l'éditeur, bascule l'image en calque via le VRAI chemin UI (clic +
   bouton toolbar, pas un raccourci interne), exporte le PDF (mêmes deux passes que
   `pdf-export.js` en production), et renvoie `{ base64, diagnostics }` sans jamais
   déclencher de téléchargement navigateur (`gen.download` neutralisé).
4. Sauvegarder le PDF : passer `base64` à un script Python de décodage (voir
   `dev-tests/save_pdf.py`) vers un fichier dans `test-output/` (jamais commité,
   voir `.gitignore`), puis le lire (Read tool - il sait afficher un PDF) pour une
   comparaison VISUELLE avec une capture d'écran de l'éditeur au même moment.
5. `FidelityHarness.runAll(FidelityScenarios)` exécute toute la matrice et renvoie un
   tableau de résultats, pour un rapport en une seule passe.

## Portée volontairement limitée

- Ne couvre pas les tableaux ni les zones à 2 colonnes (mise en page pdfmake
  récursive séparée, cf. commentaires dans `pdf-export.js` — sujet distinct).
- L'image externe utilisée (`https://picsum.photos/seed/publipostage-fidelity/...`)
  sert UNIQUEMENT à vérifier que le chemin de conversion data-URI
  (`inlineEditorImagesAsDataUri`) fonctionne avec un hôte CORS-permissif réel — ce
  n'est pas un test de l'upload de pièce jointe Grist (connu cassé, cf. mémoire
  `project_floating_image_position_limits`, hors périmètre : reporté en V2).
