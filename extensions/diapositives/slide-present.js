// La page de la fenêtre à part du diaporama (present.html ; extensions/diapositives/slide-window.js dit pourquoi et comment elle est ouverte). Elle attend de l'app qui l'a ouverte ses textes, puis le
// rendu mesuré de la présentation, le remonte (SlideWindow.unpack) et le fait jouer par le lecteur commun (slide-player.js) : rien de l'app ne tourne ici, et elle n'écoute que son ouvreur
// (`event.source`).
//  - UN CLIC OU UNE TOUCHE = LE PLEIN ÉCRAN : une fenêtre qui vient de s'ouvrir n'a reçu aucun geste de la personne, et le navigateur n'accorde le plein écran qu'à un geste dans la page. Le premier clic
//    ou la première touche (ni Échap, ni une touche seule comme Maj, ni un raccourci du navigateur) ne fait que cela : il ne passe pas aussi à la diapositive suivante. Refusé deux fois, le diaporama se
//    joue dans la fenêtre telle qu'elle est.
//  - SORTIR : Échap, « Quitter », la fin suivie d'un geste, ou la sortie du plein écran ferment la fenêtre, comme elles ferment le diaporama du panneau ; le document de l'app n'a pas bougé.
(function () {
  const opener = window.opener;
  let info = null;        // ce que l'app a dit : { lang, theme, title, labels }
  let player = null;
  let shown = false;      // le rendu est arrivé
  let asking = false;     // le plein écran est demandé, le navigateur n'a pas répondu
  let settled = false;    // le plein écran est obtenu, ou refusé pour de bon : plus de geste à prendre
  let tries = 0;
  let left = false;

  // Un geste qui demande le plein écran : un clic, ou une touche qui n'est ni Échap, ni F11 (le plein écran du navigateur), ni une touche seule (Maj, Ctrl, Alt, Méta, Verr. Maj, Tab), ni un raccourci.
  function isFullscreenGesture(event) {
    if (event.type !== 'keydown') return true;
    return !(event.key === 'Escape' || event.key === 'F11' || /^(Shift|Control|Alt|Meta|CapsLock|Tab)$/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey);
  }
  function onGesture(event) {
    if (settled || !isFullscreenGesture(event)) return false;
    if (!asking) {
      asking = true;
      player.enterFullscreen().then((granted) => {
        asking = false;
        tries += 1;
        if (granted || tries >= 2) { settled = true; player.note(''); }
      });
    }
    return true;
  }

  function begin(received) {
    if (info || !received || !received.labels) return;
    info = received;
    document.documentElement.lang = info.lang === 'en' ? 'en' : 'fr';
    if (info.theme === 'dark' || info.theme === 'light') document.documentElement.setAttribute('data-theme', info.theme);
    document.title = typeof info.title === 'string' && info.title ? info.title : info.labels.label;
    const wait = document.getElementById('pp-present-wait');
    if (wait) wait.remove();
    player = SlidePlayer.create({ labels: info.labels, onExit: leave, onGesture });
    player.root.focus({ preventScroll: true });
    player.note(info.labels.hint);
  }

  async function show(payload) {
    if (!player || shown) return;
    shown = true;
    try {
      const { job, data, how } = await SlideWindow.unpack(payload, player.root);
      if (left) { job.dispose(); return; }
      player.load(job, data, how);
    } catch (e) {
      player.note(info.labels.failed.replace('{message}', (e && e.message) || String(e)));
    }
  }

  // La fin : le lecteur se ferme (il sort du plein écran) puis la fenêtre. Quand le navigateur ne la laisse pas se fermer, elle le dit.
  function leave() {
    if (left) return;
    left = true;
    player.destroy();
    window.close();
    setTimeout(() => {
      if (window.closed) return;
      player.root.classList.add('pp-slide-show-awake');
      player.root.replaceChildren(Dom.el('div', 'pp-slide-show-card', info.labels.closed));
    }, 400);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== opener || !data || typeof data.type !== 'string') return;
    if (data.type === SlideWindow.INFO) begin(data.info);
    else if (data.type === SlideWindow.SHOW) show(data.payload);
  });
  if (opener) opener.postMessage({ type: SlideWindow.READY }, '*');
})();
