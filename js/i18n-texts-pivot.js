// Textes de l'interface, français et anglais côte à côte : le tableau croisé de la grille (js/pivot.js, js/pivot-zones.js, js/pivot-editor.js, js/pivot-window.js) : les titres écrits dans le tableau et les messages dits à la place de ce qui ne se lit pas (le bouton, la fenêtre et l'étiquette de la ligne viennent avec l'éditeur).
// Chargé AVANT js/i18n.js, qui assemble tous les js/i18n-texts-*.js. Un texte neuf va dans le fichier de son domaine, en français et en anglais dans le même lot, et le `?v=` de ce fichier monte dans index.html ;
// une clé n'existe que dans un seul fichier (l'essai « aucune clé déclarée deux fois » lit les fichiers ensemble).
const I18nTextsPivot = {
  // --- Les titres écrits dans le tableau ---
  'pivot.total': { fr: 'Total', en: 'Total' },
  'pivot.empty': { fr: '(vide)', en: '(blank)' },
  'pivot.yes': { fr: 'Oui', en: 'Yes' },
  'pivot.no': { fr: 'Non', en: 'No' },
  'pivot.valueRows': { fr: 'Nombre de lignes', en: 'Number of rows' },
  'pivot.valueTitle.sum': { fr: 'Somme de {name}', en: 'Sum of {name}' },
  'pivot.valueTitle.count': { fr: 'Nombre de {name}', en: 'Count of {name}' },
  'pivot.valueTitle.average': { fr: 'Moyenne de {name}', en: 'Average of {name}' },
  'pivot.valueTitle.min': { fr: 'Minimum de {name}', en: 'Minimum of {name}' },
  'pivot.valueTitle.max': { fr: 'Maximum de {name}', en: 'Maximum of {name}' },

  // --- Ce qui ne se lit pas : dit à la place du tableau, entre « [ERREUR : … ] » comme une bulle ---
  'pivot.error.badDefinition': { fr: 'tableau croisé illisible, ouvrir « Tableau croisé… » pour le régler', en: 'unreadable pivot table, open “Pivot table…” to set it up again' },
  'pivot.error.noSource': { fr: 'tableau croisé sans table : ouvrir « Tableau croisé… » pour la choisir', en: 'pivot table without a table: open “Pivot table…” to choose one' },
  'pivot.error.noTable': { fr: 'la table « {table} » du tableau croisé n’existe plus', en: 'the pivot table’s table “{table}” no longer exists' },
  'pivot.error.noColumn': { fr: 'la colonne « {column} » de « {table} » n’existe plus', en: 'the column “{column}” of “{table}” no longer exists' },
  'pivot.error.noLink': { fr: 'la table « {table} » n’est plus liée à la page : choisir une autre source du tableau croisé', en: 'the table “{table}” is no longer linked to the page: choose another source for the pivot table' },
  'pivot.error.source': { fr: 'les lignes de « {table} » ne se lisent pas ({reason})', en: 'the rows of “{table}” cannot be read ({reason})' },
  'pivot.error.noRows': { fr: 'aucune ligne à croiser', en: 'no rows to cross' },
  'pivot.error.cell': { fr: 'erreur', en: 'error' },

};
