// Le lot en cours et le moyen de l'arrêter (choix du 11/11 : « Arrêter, tout abandonner »). Un export en lot de 300 PDF n'avait pas d'autre issue que la fin ou la fermeture de l'onglet ; la ligne d'état,
// elle, tronque « Export PDF en lot : 12/300… » dans un panneau étroit. Pendant un lot de deux documents ou plus, une pastille posée au coin bas gauche du panneau - fixe, hors de la barre d'outils (gelée) et à
// l'opposé du contrôle de zoom (js/page-zoom.js), la barre de GFS étant centrée sur un bord - dit où en est le lot (« Export PDF en lot : 12/300… », le mot de la ligne d'état) et porte un bouton « Arrêter ».
// « Arrêter » abandonne tout le lot : la génération s'interrompt après le document en cours (un document ne s'interrompt pas), rien n'est téléchargé ni rangé dans GFS, aucune ligne n'est datée - comme « Annuler »
// sur la fenêtre des images d'un site externe (js/external-images.js). Le même geste sert au contrôle d'avant lot (js/batch-precheck.js) : l'arrêter arrête l'export.
//   BatchProgress.begin({ key, total }) -> { update(current), stopped(), end() } ; null quand le lot n'a qu'un document (rien à arrêter)
//    key : la clé de texte de la progression, qui reçoit { current, total } (« status.batchExportProgress » : « Export PDF en lot : {current}/{total}… ») - la pastille dit le même mot que la ligne d'état ;
//    update(current) : le numéro du document en cours (à partir de 1) ; stopped() : vrai dès que la personne a cliqué « Arrêter » (à lire entre deux documents) ; end() : retire la pastille (toujours, même
//    quand le lot échoue : try / finally). Une seule pastille à la fois : un lot qui en commence un autre retire la précédente.
const BatchProgress = (function () {
  let current = null;

  function begin({ key, total }) {
    if (!(total >= 2)) return null;
    if (current) current.end();
    let requested = false;
    const pill = document.createElement('div');
    pill.className = 'pp-batch-progress';
    pill.setAttribute('role', 'group');
    pill.setAttribute('aria-label', I18n.t('batchProgress.aria'));
    const text = document.createElement('span');
    text.className = 'pp-batch-progress-text';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'pp-batch-progress-stop';
    stop.textContent = I18n.t('batchProgress.stop');
    stop.setAttribute('aria-label', I18n.t('batchProgress.stopAria'));
    stop.addEventListener('click', () => {
      if (requested) return;
      requested = true;
      // Le document en cours va à son terme : le bouton le dit, il ne reste pas cliquable pour rien.
      stop.disabled = true;
      stop.textContent = I18n.t('batchProgress.stopping');
    });
    pill.append(text, stop);
    document.body.appendChild(pill);

    function update(index) {
      if (requested) return;
      text.textContent = I18n.t(key, { current: index, total });
    }
    function end() {
      pill.remove();
      if (current === handle) current = null;
    }
    const handle = { update, end, stopped: () => requested };
    update(1);
    current = handle;
    return handle;
  }

  return { begin };
})();
