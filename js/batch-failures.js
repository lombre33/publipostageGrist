// La liste des lignes qu'un export en lot n'a pas pu générer, dans une fenêtre qui s'ouvre à la fin du lot : la personne voit quels documents
// manquent dans le fichier téléchargé, et pourquoi, sans ouvrir la console du navigateur.
//  BatchFailures.show(failures, { ok?, format? }) -> Promise<void> (se résout à la fermeture ; rien à lister : la fenêtre ne s'ouvre pas)
//    failures : [{ id, name?, wrongKind?, message? }] - le n° de la ligne dans Grist ; le nom que son fichier aurait porté (absent : le modèle n'en
//    donne pas, la ligne se reconnaît à son n°) ; le genre de modèle que l'export ne fait pas ('grid' : une grille en Word ; 'document' : un document
//    en Excel) ; sinon le texte de l'erreur levée pendant la génération.
//    ok : le nombre de documents qui, eux, sont dans le fichier téléchargé (0 : rien n'a été téléchargé) ; format : le nom de l'export ('DOCX',
//    'Excel'), repris par la raison « genre de modèle ».
// La fenêtre est celle de js/dialogs.js (un seul bouton, « Fermer ») : le corps défile, le titre et le bouton restent en place.
const BatchFailures = (function () {
  // Au-delà, la liste dit combien d'autres lignes la suivent : la fenêtre reste lisible quand tout un lot échoue pour la même raison.
  const MAX_LISTED = 100;
  // Le texte d'une erreur de bibliothèque peut être long : coupé, pour que chaque ligne se lise d'un coup d'œil.
  const MAX_MESSAGE = 160;

  function reasonText(failure, format) {
    if (failure.wrongKind) return I18n.t('batchFailures.wrongKind.' + failure.wrongKind, { format });
    const message = String(failure.message || '').replace(/\s+/g, ' ').trim();
    if (!message) return I18n.t('batchFailures.errorNoDetail');
    return I18n.t('batchFailures.error', { message: message.length > MAX_MESSAGE ? message.slice(0, MAX_MESSAGE - 1) + '…' : message });
  }

  function lineText(failure, format) {
    const row = failure.name
      ? I18n.t('batchFailures.row.named', { name: failure.name, id: failure.id })
      : I18n.t('batchFailures.row.unnamed', { id: failure.id });
    return I18n.t('batchFailures.line', { row, reason: reasonText(failure, format) });
  }

  function show(failures, { ok = 0, format = '' } = {}) {
    if (!failures || !failures.length) return Promise.resolve();
    const lines = failures.slice(0, MAX_LISTED).map(failure => lineText(failure, format));
    if (failures.length > MAX_LISTED) lines.push(I18n.t('batchFailures.more', { n: failures.length - MAX_LISTED }));
    const intro = I18n.t(ok ? 'batchFailures.intro' : 'batchFailures.introNone', { ok, n: failures.length });
    return Dialogs.choose({
      title: I18n.t('batchFailures.title', { n: failures.length }),
      message: intro + '\n\n' + lines.join('\n'),
      choices: [],
      cancelLabel: I18n.t('common.close'),
    }).then(() => {});
  }

  return { show };
})();
