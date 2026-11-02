// Les couleurs personnalisées que les menus de couleur gardent sous la main (rangées « Couleurs du modèle » et « Couleurs du document » de
// js/color-palette.js) : celles qu'on a composées dans la fenêtre « Couleur personnalisée » (js/color-dialog.js) et cochées « garder ». Une rangée
// tient dans la largeur de la palette (MAX couleurs, la plus récente d'abord) ; en garder une déjà gardée la remet en tête, la dernière de trop
// s'efface.
// Chaque rangée (« portée ») dit où ses couleurs vivent : celles du modèle voyagent avec lui, dans le JSON de la colonne Margins de Templates
// (PageLayout.getCustomColors, comme le filigrane), donc suivent le modèle d'un export à l'autre et d'un chargement à l'autre ; celles du document
// sont partagées par tous ses modèles et par toute l'équipe, dans la ligne réservée aux réglages du document de la table des modèles
// (Templates.getDocumentSettings, clé `colors`), sans table de plus.
const ColorStore = (function () {
  // La borne est celle du modèle (PageLayout.normalizeCustomColors), qui rejette le reste du JSON qu'on lui donne ; celle du document est la même.
  const MAX = PageLayout.CUSTOM_COLORS_MAX;

  // Les portées, dans l'ordre où la palette les montre. `read` rend les couleurs gardées ; `write` les remplace et rend vrai si quelque chose a
  // changé. Le modèle prévient l'enregistrement automatique (pp:marginsChanged, comme le sens et le format de la page) ; le document s'écrit tout
  // seul dans Grist (Templates.updateDocumentSettings : le changement vaut tout de suite, l'écriture suit).
  const SCOPES = [
    {
      id: 'model',
      labelKey: 'color.scope.model',
      hintKey: 'color.scope.model.hint',
      read: () => PageLayout.getCustomColors(),
      write(colors) {
        const changed = PageLayout.setCustomColors(colors);
        if (changed) document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
        return changed;
      },
    },
    {
      id: 'document',
      labelKey: 'color.scope.document',
      hintKey: 'color.scope.document.hint',
      read: () => PageLayout.normalizeCustomColors(Templates.getDocumentSettings().colors),
      write(colors) {
        const next = PageLayout.normalizeCustomColors(colors);
        if (JSON.stringify(next) === JSON.stringify(this.read())) return false;
        Templates.updateDocumentSettings({ colors: next.length ? next : null });
        return true;
      },
    },
  ];
  const scopeOf = id => SCOPES.find(scope => scope.id === id) || null;

  // Les rangées à montrer : { id, label, hint, colors } - le libellé et l'infobulle (où vivent ces couleurs) dans la langue du moment.
  function scopes() {
    return SCOPES.map(scope => ({ id: scope.id, label: I18n.t(scope.labelKey), hint: I18n.t(scope.hintKey), colors: scope.read() }));
  }

  // La rangée « Couleurs du thème » (js/slide-theme.js) d'une présentation qui a un thème : le fond, le texte, les titres et les six accents, dans l'ordre de SlideTheme.COLOR_SLOTS. Elle se lit comme une rangée gardée
  // mais n'en est pas une : `readonly` (aucune croix pour la retirer, aucune case « garder » dans la fenêtre de couleur : elle ne figure pas dans `scopes`), `names` le nom de chaque réglage (son infobulle). null sans thème.
  function themeRow() {
    const palette = typeof SlideTheme !== 'undefined' ? SlideTheme.paletteOf() : [];
    if (!palette.length) return null;
    return { id: 'theme', readonly: true, label: I18n.t('color.scope.theme'), hint: I18n.t('color.scope.theme.hint'), colors: palette.map(item => item.color), names: palette.map(item => I18n.t('slides.theme.slot.' + item.slot)) };
  }
  // Les rangées que montre un menu de couleur : celle du thème d'abord quand la présentation en a un, puis celles qu'on a gardées.
  function rows() {
    const theme = themeRow();
    return (theme ? [theme] : []).concat(scopes());
  }

  // Garde `color` (un #rrggbb) en tête de la portée ; faux pour une portée inconnue ou une couleur qui n'en est pas une.
  function add(id, color) {
    const scope = scopeOf(id);
    const hex = ColorMath.parseHex(color);
    if (!scope || !hex) return false;
    return scope.write([hex].concat(scope.read().filter(kept => kept !== hex)).slice(0, MAX));
  }
  // La même couleur dans plusieurs portées d'un coup (les cases cochées de la fenêtre).
  function addTo(ids, color) { return ids.map(id => add(id, color)).some(Boolean); }

  function remove(id, color) {
    const scope = scopeOf(id);
    return !!scope && scope.write(scope.read().filter(kept => kept !== color));
  }

  return { MAX, scopes, themeRow, rows, add, addTo, remove };
})();
