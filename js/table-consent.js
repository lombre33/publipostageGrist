// Accord de la personne pour créer les tables du widget dans son document (js/grist-api.js : addTableIfMissing, qui décide quand demander). Ici ce qui
// touche l'écran : la fenêtre « Créer les tables du widget dans ce document ? » (js/dialogs.js : Créer / Ne pas créer, Échap refuse) et le compteur de
// gestes avec lequel GristAPI décide de reposer la question après un refus.
// Chargé AVANT le démarrage anticipé d'index.html, pour que la première création trouve la question déjà branchée ; Dialogs, I18n et FirstContact,
// chargés après lui, ne sont lus qu'à la question, une fois la page entière là.
const TableConsent = (function () {
  let gestures = 0;
  // Un geste = un appui de souris ou de touche dans le widget, compté avant tout autre écouteur (capture). Il n'a pas à être « utile » : GristAPI veut
  // savoir si la personne a fait quelque chose depuis son dernier refus, pas ce qu'elle a fait.
  function countGesture() { gestures++; }
  document.addEventListener('pointerdown', countGesture, true);
  document.addEventListener('keydown', countGesture, true);

  // Les scripts de la page s'exécutent tous avant DOMContentLoaded : la question que le démarrage anticipé fait naître attend d'avoir Dialogs et I18n.
  function whenPageIsLoaded() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  // Vrai quand la personne accepte, faux quand elle refuse (Échap compris). Le démarrage attend sa réponse : le compte à rebours du « chargement long »
  // (js/first-contact.js) est suspendu pendant ce temps.
  async function ask() {
    await whenPageIsLoaded();
    FirstContact.pause();
    try {
      return await Dialogs.confirm({
        title: I18n.t('tableConsent.title'),
        message: I18n.t('tableConsent.message'),
        confirmLabel: I18n.t('tableConsent.create'),
        cancelLabel: I18n.t('tableConsent.decline'),
      });
    } finally {
      FirstContact.resume();
    }
  }

  GristAPI.setTableConsent({ ask, gesture: () => gestures });
  return { gestureCount: () => gestures };
})();
