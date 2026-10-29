// Les réglages de la personne dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z, boutons de la barre) : le thème, le choix des bulles et des puces, le caractère d'insertion et la messagerie de Réglages (js/settings.js), les touches du
// clavier (js/shortcuts-panel.js) et le caractère des abréviations (js/text-expansion-settings.js).
// Un réglage est un choix que js/person-store.js garde pour la personne (dans ce navigateur, ou chez GFS) et que la page applique à l'instant. Son geste passe par `track` au lieu d'écrire seul : il est écrit comme avant, puis posé dans la pile
// de js/action-history.js avec la valeur d'avant et celle d'après.
//
// Les réglages sont ceux de la personne, pas d'un modèle : ils se défont depuis n'importe quel modèle, comme le ★. Défaire remet la valeur d'AVANT, rétablir celle d'APRÈS, par la même écriture que le geste. Un réglage qui n'est plus tel que le
// geste l'a laissé - changé depuis, dans un autre onglet - n'est jamais écrasé : rien n'est écrit et le coin d'état le dit. Un geste qui ne change rien (le même choix, ou un choix que le stockage refuse) ne laisse pas de pas à défaire.
//
// Un réglage est { read, write, say } : `read()` rend la valeur en vigueur (un texte, ou un objet dont les clés sont rangées : deux états égaux s'écrivent de même), `write(valeur)` la pose comme le fait le geste (et lève `ActionHistory.conflict` quand elle
// ne peut plus l'être), `say(valeur, avant)` rend le texte du coin d'état qui dit ce qui est en vigueur après coup - `avant` est la valeur qu'il y avait juste avant, pour un réglage fait de plusieurs parties (les touches) dont on veut nommer la partie changée.
const SettingsHistory = (function () {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Amène le réglage à `value`, à condition qu'il soit encore tel que l'action précédente l'a laissé (`expected`).
  function put(setting, value, expected) {
    return async function () {
      if (!same(setting.read(), expected)) throw ActionHistory.conflict(I18n.t('history.settingChanged'));
      setting.write(value);
      return setting.say(value, expected);
    };
  }

  // `work` pose le réglage comme avant ; ce qu'il a changé devient un pas de l'historique. Rend ce que rend `work`.
  function track(setting, work) {
    const before = setting.read();
    const result = work();
    const after = setting.read();
    if (!same(before, after)) ActionHistory.add({ undo: put(setting, before, after), redo: put(setting, after, before) });
    return result;
  }

  return { track };
})();
