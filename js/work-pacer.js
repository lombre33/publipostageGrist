// LA PAUSE D'UN TRAVAIL LONG fait de petites étapes (un document de plus dans un lot, par exemple) : la page doit pouvoir répondre entre deux, sinon la progression ne se dessine pas et aucun clic ne passe avant
// la fin (10/11 : un lot de 500 documents Word tenait la page 4,7 s d'un bloc - les lectures d'une même passe sont gardées en mémoire, et la génération d'un document ne rend jamais la main).
// `WorkPacer.create({ sliceMs, paintMs })` rend la fonction `pace()`, à attendre après chaque étape (`await pace()`) : elle ne fait rien tant que la tranche en cours dure moins de `sliceMs`, puis rend la main.
// Cette pause est une tâche ordinaire (scheduler.postTask, au rang des minuteurs et des messages de GFS ; sans lui, un minuteur à 0 ms), jamais `scheduler.yield` : sa reprise passe devant tous les minuteurs, qui
// attendraient la fin du travail. Toutes les `paintMs`, elle attend aussi une image : la progression s'y dessine. Un onglet caché ne peint rien et ses minuteurs sont ralentis (une seconde, puis une minute) :
// avec postTask la pause n'est alors qu'une tâche, sans lui il n'y en a pas.
const WorkPacer = (function () {
  const DEFAULT_SLICE_MS = 40;
  const DEFAULT_PAINT_MS = 250;
  const MAX_FRAME_WAIT_MS = 60;   // une image qui ne vient pas (cadre hors de l'écran) : la pause ne dure jamais plus

  const canPostTask = () => typeof scheduler !== 'undefined' && !!scheduler && typeof scheduler.postTask === 'function';
  const breathe = () => new Promise((resolve) => {
    if (canPostTask()) scheduler.postTask(resolve, { priority: 'user-visible' });
    else setTimeout(resolve, 0);
  });
  const breatheAndPaint = () => new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
    setTimeout(go, MAX_FRAME_WAIT_MS);
  });

  function create(options) {
    const sliceMs = options && options.sliceMs > 0 ? options.sliceMs : DEFAULT_SLICE_MS;
    const paintMs = options && options.paintMs > 0 ? options.paintMs : DEFAULT_PAINT_MS;
    let sliceStart = performance.now();
    let lastPaint = sliceStart;
    return async function pace() {
      const now = performance.now();
      if (now - sliceStart < sliceMs) return;
      if (document.hidden) {
        if (!canPostTask()) return;
        await breathe();
      } else if (now - lastPaint >= paintMs) {
        await breatheAndPaint();
        lastPaint = performance.now();
      } else {
        await breathe();
      }
      sliceStart = performance.now();
    };
  }

  return { create };
})();
