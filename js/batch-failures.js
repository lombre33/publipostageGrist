// Ce qu'un export dit à la personne quand il n'a pas fait tout ce qu'elle attendait, dans une fenêtre de js/dialogs.js : les lignes qu'un export en lot n'a
// pas pu générer (à la fin du lot : quels documents manquent dans le fichier téléchargé, et pourquoi, sans ouvrir la console du navigateur) et les pages
// blanches d'un PDF (avant d'enregistrer le PDF d'une ligne ; à la fin d'un lot, quelles lignes en ont).
//  BatchFailures.show(failures, { ok?, format? }) -> Promise<void> (se résout à la fermeture ; rien à lister : la fenêtre ne s'ouvre pas)
//    failures : [{ id, name?, wrongKind?, passwordProblem?, column?, message? }] - le n° de la ligne dans Grist ; le nom que son fichier aurait porté (absent :
//    le modèle n'en donne pas, la ligne se reconnaît à son n°) ; le genre de modèle que l'export ne fait pas ('grid' : une grille en Word ; 'document' : un
//    document en Excel) ; le mot de passe de sa ligne que la colonne `column` ne donne pas (« PDF protégé », « Un par ligne » : 'empty', 'type', 'tooLong' ou
//    'missing', cf. PdfProtection.settingsForRow) ; sinon le texte de l'erreur levée pendant la génération.
//    ok : le nombre de documents qui, eux, sont dans le fichier téléchargé (0 : rien n'a été téléchargé) ; format : le nom de l'export ('DOCX',
//    'Excel'), repris par la raison « genre de modèle ».
//  BatchFailures.confirmBlankPages(pages) -> Promise<boolean> (vrai : exporter quand même ; faux : « Annuler », Échap compris) - `pages` : les numéros,
//    à partir de 1, des pages blanches du PDF d'une ligne, repérées dans sa mise en page (js/pdf-export.js:blankPagesOf).
//  BatchFailures.showBlankPages(rows) -> Promise<void> - à la fin d'un lot PDF, rows : [{ id, name?, pages }] les lignes dont le PDF a des pages blanches ;
//    ces PDF sont dans le fichier téléchargé, tels quels. Rien à lister : la fenêtre ne s'ouvre pas.
// La fenêtre de fin de lot a un seul bouton, « Fermer » : le corps défile, le titre et le bouton restent en place.
const BatchFailures = (function () {
  // Au-delà, la liste dit combien d'autres lignes la suivent : la fenêtre reste lisible quand tout un lot échoue pour la même raison.
  const MAX_LISTED = 100;
  // Le texte d'une erreur de bibliothèque peut être long : coupé, pour que chaque ligne se lise d'un coup d'œil.
  const MAX_MESSAGE = 160;

  function reasonText(failure, format) {
    if (failure.wrongKind) return I18n.t('batchFailures.wrongKind.' + failure.wrongKind, { format });
    if (failure.passwordProblem) return I18n.t('batchFailures.password.' + failure.passwordProblem, { column: failure.column });
    const message = String(failure.message || '').replace(/\s+/g, ' ').trim();
    if (!message) return I18n.t('batchFailures.errorNoDetail');
    return I18n.t('batchFailures.error', { message: message.length > MAX_MESSAGE ? message.slice(0, MAX_MESSAGE - 1) + '…' : message });
  }

  function rowText(failure) {
    return failure.name
      ? I18n.t('batchFailures.row.named', { name: failure.name, id: failure.id })
      : I18n.t('batchFailures.row.unnamed', { id: failure.id });
  }

  function lineText(failure, format) {
    return I18n.t('batchFailures.line', { row: rowText(failure), reason: reasonText(failure, format) });
  }

  // Les numéros de page d'une liste de pages blanches, séparés par des virgules ; au-delà de MAX_PAGES, les suivants se résument par « … ».
  const MAX_PAGES = 12;
  function pagesText(pages) {
    return pages.slice(0, MAX_PAGES).join(', ') + (pages.length > MAX_PAGES ? ', …' : '');
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

  // Le PDF d'une ligne a des pages blanches : la personne choisit avant que le fichier ne parte. Le focus arrive sur « Exporter quand même » (la personne vient de
  // demander l'export, un Entrée l'envoie) ; « Annuler » n'enregistre rien.
  function confirmBlankPages(pages) {
    return Dialogs.confirm({
      title: I18n.t('blankPages.title', { n: pages.length }),
      message: I18n.t('blankPages.confirm', { n: pages.length, pages: pagesText(pages) }),
      confirmLabel: I18n.t('blankPages.exportAnyway'),
    });
  }

  function showBlankPages(rows) {
    if (!rows || !rows.length) return Promise.resolve();
    const lines = rows.slice(0, MAX_LISTED).map(row => I18n.t('batchFailures.line', { row: rowText(row), reason: I18n.t('blankPages.list', { count: row.pages.length, pages: pagesText(row.pages) }) }));
    if (rows.length > MAX_LISTED) lines.push(I18n.t('batchFailures.more', { n: rows.length - MAX_LISTED }));
    return Dialogs.choose({
      title: I18n.t('blankPages.batchTitle', { n: rows.length }),
      message: I18n.t('blankPages.batchIntro', { n: rows.length }) + '\n\n' + lines.join('\n'),
      choices: [],
      cancelLabel: I18n.t('common.close'),
    }).then(() => {});
  }

  return { show, confirmBlankPages, showBlankPages };
})();
