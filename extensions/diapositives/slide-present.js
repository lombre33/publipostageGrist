// La page de la fenêtre à part du diaporama (present.html ; extensions/diapositives/slide-window.js dit pourquoi et comment elle est ouverte). Elle attend de l'app qui l'a ouverte ses textes, puis le
// rendu mesuré de la présentation, le remonte (SlideWindow.unpack) et le fait jouer par le lecteur commun (slide-player.js) : rien de l'app ne tourne ici, et elle n'écoute que son ouvreur
// (`event.source`).
//  - UN CLIC OU UNE TOUCHE = LE PLEIN ÉCRAN : une fenêtre qui vient de s'ouvrir n'a reçu aucun geste de la personne, et le navigateur n'accorde le plein écran qu'à un geste dans la page. Le premier clic
//    ou la première touche (ni Échap, ni une touche seule comme Maj, ni un raccourci du navigateur) ne fait que cela : il ne passe pas aussi à la diapositive suivante. Refusé deux fois, le diaporama se
//    joue dans la fenêtre telle qu'elle est.
//  - SORTIR : Échap, « Quitter », la fin suivie d'un geste, ou la sortie du plein écran ferment la fenêtre, comme elles ferment le diaporama du panneau ; le document de l'app n'a pas bougé.
//  - LA VUE INTERVENANT (demande du 02/11 ; extensions/diapositives/slide-speaker.js, dans l'app) : la page lui dit où en est le diaporama à chaque changement (`STATE` : la page, la diapositive, les animations qui restent, la
//    page où mène « suivante »), lui dit qu'elle se ferme (`BYE`), et fait ce qu'elle demande - suivante, précédente, saut vers une page - comme le ferait le clavier de la page, sans qu'aucun de ces ordres soit un
//    geste pour le plein écran. Elle n'écoute que son ouvreur, comme pour tout le reste. Quand l'app a décoché « Plein écran » (`windowed`), la fenêtre se joue telle qu'elle est : aucun geste n'y demande le plein écran.
(function () {
  const opener = window.opener;
  let info = null;        // ce que l'app a dit : { lang, theme, title, labels, windowed }
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
    // « Plein écran » décoché dans le menu du ▶ : la fenêtre se joue telle qu'elle est (on la partage, on la place), aucun clic n'y demande le plein écran.
    if (info.windowed === true) settled = true;
    player = SlidePlayer.create({ labels: info.labels, onExit: leave, onGesture, onState: report });
    player.root.focus({ preventScroll: true });
    if (!settled) player.note(info.labels.hint);
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

  // Dit à l'app où en est le diaporama (la vue intervenant le suit) : des nombres, ce que le lecteur rend de `state()`, sans l'effet en cours.
  function report(state) {
    if (!opener || left) return;
    const { index, count, slide, next, prev, clicks, left: remaining, ended, advancing } = state;
    try { opener.postMessage({ type: SlideWindow.STATE, state: { index, count, slide, next, prev, clicks, left: remaining, ended, advancing } }, '*'); } catch (e) { /* l'app est fermée */ }
  }
  // Dit à l'app que la fenêtre se ferme d'elle-même (la fin du diaporama), une seule fois. Une fenêtre que le navigateur ferme, ou qu'on recharge, ne le dit pas : un message posté pendant qu'une page se
  // décharge n'a plus de source sous Chromium (mesuré) et un autre navigateur peut lui en garder une, si bien que la même touche F5 fermerait la console ici et pas là. L'app voit la fermeture elle-même
  // (`link.follow`, une demi-seconde) ; une fenêtre rechargée redemande son rendu et la console la suit.
  let said = false;
  function goodbye() {
    if (said) return;
    said = true;
    try { if (opener) opener.postMessage({ type: SlideWindow.BYE }, '*'); } catch (e) { /* l'app est fermée */ }
  }
  // Un ordre de la vue intervenant : le même geste que le clavier de la page, jamais un geste pour le plein écran.
  function obey(order) {
    if (!player || left || !order || typeof order.name !== 'string' || SlideWindow.COMMANDS.indexOf(order.name) === -1) return;
    if (order.name === 'next') player.next();
    else if (order.name === 'prev') player.prev();
    else player.jump(order.index);
  }

  // La fin : le lecteur se ferme (il sort du plein écran) puis la fenêtre. Quand le navigateur ne la laisse pas se fermer, elle le dit.
  function leave() {
    if (left) return;
    left = true;
    goodbye();
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
    else if (data.type === SlideWindow.COMMAND) obey(data);
  });
  if (opener) opener.postMessage({ type: SlideWindow.READY }, '*');
})();
