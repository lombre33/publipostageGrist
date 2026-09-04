# Historique des versions

| Version | Date | SHA commit | Description | Statut |
|---|---|---|---|---|
| v1.7.3 | 2026-09-04 | f0ec39a03d627ecf091d611efd06e251308df197 | Correctifs : toolbar custom Quill sans superposition après table-layout fixed, et export PDF natif des tableaux borné à la largeur A4 avec grille/colspan synchronisée et retour à la ligne. | stable |
| v1.7.2 | 2026-09-04 | 10aca1aabe9d34d4a5a925d1e25534e6af0d2edd | Correctifs réels : boutons Tableau/Saut de page côte à côte malgré le CSS Snow, autocomplétion `#` dans les cellules `td/th` contenteditable, et export du tableau en mode Texte natif (pdfmake). | stable |
| v1.7.0 | 2026-09-04 | f3aec31 | Texte natif (vectoriel) sélectionné par défaut ; ajout de tableaux éditables 2×2 dans Quill avec barre contextuelle pour lignes/colonnes, résolution des variables dans les cellules et conversion native des tableaux en structures pdfmake. | stable |
| v1.6.0 | 2026-09-04 | À compléter | Ajout du niveau « Texte natif (vectoriel) » avec pdfmake côté client : conversion du HTML résolu en texte PDF sélectionnable/recherchable, titres, gras/italique/souligné, alignements et sauts de page sans marqueur visuel. Les trois presets html2pdf raster historiques restent inchangés. | en cours |
| v1.5.0 | 2026-09-04 | À compléter | Ajout de trois niveaux de qualité d’export PDF (Standard historique, Haute qualité et Impression HD) via un sélecteur UI ; Standard reste le défaut, Haute qualité utilise html2canvas scale 4 et jsPDF sans compression, Impression HD utilise scale 6, PNG et jsPDF sans compression. | en cours |
| v1.4.0 | 2026-09-04 | À compléter | Ajout d'une fonctionnalité « Saut de page forcé à l'export PDF » : nouveau Blot Quill `PageBreakBlot` (BlockEmbed non-éditable, classe `.page-break-marker`, label « — Saut de page — ») inséré via un bouton toolbar custom ; `pdf-export.js` active l'option html2pdf `pagebreak: { mode: ['css','legacy'], avoid: '.var-badge' }` qui découpe le PDF sur chaque marqueur (CSS `page-break-after: always`). | en cours |
| v1.3.0 | 2026-09-04 | a28d0d399217b28f5e709e794d89b5eeac0d75fb | Rollback vers la version stable + retrait du bandeau d’avertissement Select By. | en cours |

## Structure pour les prochaines versions

Pour chaque nouvelle version, ajouter une ligne au tableau avec les colonnes suivantes : **version**, **date**, **SHA commit**, **description** et **statut** (`stable`, `en cours` ou `rollback`).