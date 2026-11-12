// Déposer un fichier sur la page pour l'importer (audit « confort d'usage » du 12/11, idée 9) : un fichier Word, PowerPoint, Excel ou Markdown glissé depuis le bureau ouvre la même voie que le menu « + » (js/main-import.js:
// importDroppedFile, qui sait aussi demander « Nouveau / Remplacer / Ajouter après / Insérer » quand un document est déjà ouvert). Ce module ne fait que le geste : un voile discret « Déposez le fichier pour l'importer »
// pendant le survol, et le fichier remis à `importFile` au dépôt.
// Ce qu'il laisse tranquille : une image seule (l'éditeur sait la recevoir), un glisser de texte ou de lien, tout dépôt déjà pris par un autre écouteur (la fenêtre d'organisation des modèles, js/template-organize-modal.js,
// appelle preventDefault avant) et tout dépôt sous une fenêtre ouverte. Un fichier que le widget ne sait pas lire est dit dans le coin d'état (importFile), sans que le navigateur ne l'ouvre à la place de la page.
const DropImport = (function () {
  const HINT_ID = 'pp-drop-hint';
  let host = null;
  let hint = null;
  let depth = 0; // dragenter / dragleave se compensent sur les enfants : on compte

  const carriesFiles = event => !!event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf('Files') !== -1;
  // Pendant le survol on ne lit que le type MIME (le nom n'est pas donné) : tous les fichiers sont des images → l'éditeur les reçoit, pas de voile.
  const onlyImages = event => {
    const items = Array.from(event.dataTransfer.items || []);
    return items.length > 0 && items.every(item => item.kind === 'file' && /^image\//.test(item.type));
  };
  // Une fenêtre du widget est ouverte (voile `.pp-modal` affiché, js/modal-base.js) : le dépôt n'est pas pour la page.
  const windowOpen = () => Array.from(document.querySelectorAll('.pp-modal')).some(modal => modal.getClientRects().length > 0);

  function showHint(on) {
    if (!hint) return;
    hint.classList.toggle('is-on', on);
  }

  function onDragEnter(event) {
    if (!carriesFiles(event) || onlyImages(event)) return;
    depth++;
    if (!windowOpen()) showHint(true);
  }
  function onDragOver(event) {
    if (!carriesFiles(event) || onlyImages(event) || event.defaultPrevented) return;
    event.preventDefault(); // sans cela le navigateur n'envoie jamais « drop »
    event.dataTransfer.dropEffect = windowOpen() ? 'none' : 'copy';
  }
  function onDragLeave(event) {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) showHint(false);
  }
  function onDrop(event) {
    depth = 0;
    showHint(false);
    if (!carriesFiles(event) || event.defaultPrevented || windowOpen()) return;
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length || files.every(file => /^image\//.test(file.type))) return;
    event.preventDefault();
    // Un seul fichier à la fois : le premier ; les autres sont dits ignorés plutôt que passés sous silence.
    host.importFile(files[0]);
    if (files.length > 1) host.setStatus(I18n.t('status.dropOnlyFirst', { name: files[0].name }));
  }

  function wire(options) {
    if (hint) return;
    host = options;
    hint = Dom.el('div', 'pp-drop-hint');
    hint.id = HINT_ID;
    hint.setAttribute('aria-hidden', 'true'); // décoratif : la fenêtre « Nouveau / Remplacer… » et le coin d'état disent la suite
    hint.appendChild(Dom.el('span', 'pp-drop-hint-text', I18n.t('drop.hint')));
    document.body.appendChild(hint);
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    // Un glisser interrompu (Échap, hors de la fenêtre) ne laisse pas le voile.
    document.addEventListener('dragend', () => { depth = 0; showHint(false); });
  }

  return { wire };
})();
