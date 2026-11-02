// Les thèmes prêts d'une présentation (extension « diapositives » de Grist Factory Suite ; demande du 02/11, fil « Ajouter un thème de présentation ») : ceux que la fenêtre « Thème… » propose à côté de « Aspect d'origine »
// (aucun thème). Des données seulement : le thème lui-même, sa lecture, ce qu'il fait à l'écran et dans les exports sont du socle (js/slide-theme.js) ; le nom de chacun est un texte de js/i18n.js (`slides.theme.preset.<id>`).
//  - Chaque thème est choisi pour se lire : le texte et les titres ont au moins 4,5:1 de contraste (WCAG 2) sur le fond, ce que dev-tests/scenarios-slide-theme.js vérifie ;
//  - leurs polices sont les six du menu de police (les seules que le PDF, le Word et le PowerPoint savent écrire), deux par thème : une pour les titres, une pour le texte ;
//  - tous ont le fond blanc : le fond propre à un thème (une page foncée) viendra avec le décor commun des diapositives.
// « Hélianthe » est celui de la proposition commerciale de la galerie : le bleu nuit des titres, le turquoise du bandeau et l'orange du filet de sa première diapositive.
const SlideThemes = (function () {
  const make = (id, colors, fonts) => ({ id, theme: { colors: Object.assign({ bg: '#ffffff' }, colors), fonts } });

  const LIST = [
    make('ocean', { text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, { title: 'Roboto', body: 'Roboto' }),
    make('helianthe', { text: '#2a3b49', title: '#0d2e43', accent1: '#048189', accent2: '#d9742a', accent3: '#0d2e43', accent4: '#f2b45a', accent5: '#6aa7a9', accent6: '#8a9ba8' }, { title: 'Roboto', body: 'Roboto' }),
    make('forest', { text: '#1f2a24', title: '#1e5631', accent1: '#2e7d32', accent2: '#8aab3c', accent3: '#4f8a8b', accent4: '#d9a441', accent5: '#8d6e63', accent6: '#a3b18a' }, { title: 'Georgia', body: 'Calibri' }),
    make('burgundy', { text: '#2b2226', title: '#7a1f3d', accent1: '#7a1f3d', accent2: '#c2185b', accent3: '#d98880', accent4: '#b08968', accent5: '#6d4c41', accent6: '#e0b0a0' }, { title: 'Georgia', body: 'Calibri' }),
    make('sun', { text: '#2b2118', title: '#b45309', accent1: '#d97706', accent2: '#f59e0b', accent3: '#dc2626', accent4: '#0891b2', accent5: '#65a30d', accent6: '#7c3aed' }, { title: 'Calibri', body: 'Calibri' }),
    make('slate', { text: '#333b45', title: '#2b3440', accent1: '#4a6fa5', accent2: '#8a9ba8', accent3: '#b0bec5', accent4: '#607d8b', accent5: '#455a64', accent6: '#cfd8dc' }, { title: 'Arial', body: 'Arial' }),
    make('editorial', { text: '#1f2937', title: '#111827', accent1: '#b91c1c', accent2: '#6b7280', accent3: '#9ca3af', accent4: '#374151', accent5: '#d1d5db', accent6: '#4b5563' }, { title: 'Times New Roman', body: 'Arial' }),
  ];

  // Le thème prêt qui a ces couleurs et ces polices (le nom gardé dans le modèle ne compte pas : une fois le thème choisi, le modèle porte ses propres réglages), ou null.
  function find(theme) {
    const wanted = SlideTheme.normalize(theme);
    if (!wanted) return null;
    const key = item => JSON.stringify([item.colors, item.fonts]);
    return LIST.find(preset => key(SlideTheme.normalize(preset.theme)) === key(wanted)) || null;
  }
  const byId = id => LIST.find(preset => preset.id === id) || null;
  // Le nom à montrer d'un thème : celui du thème prêt qu'il est (dans la langue du moment), à défaut le nom que le modèle lui a gardé, à défaut « Personnalisé » ; « Sans thème » pour aucun.
  function nameOf(theme) {
    const normalized = SlideTheme.normalize(theme);
    if (!normalized) return I18n.t('slides.theme.none');
    const preset = find(normalized);
    return preset ? I18n.t('slides.theme.preset.' + preset.id) : (normalized.name || I18n.t('slides.theme.custom'));
  }

  return { LIST, find, byId, nameOf };
})();
