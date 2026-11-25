// Le relais des appels bloqués vers GFS (consigne GFS 084, contrats de GFS 5.4 point 14, guide des apps règle S8). Quand la politique de contenu de cette page bloque un appel (une bibliothèque piratée qui tente d'envoyer des données
// ailleurs, par exemple), le navigateur lève l'événement `securitypolicyviolation` dans ce cadre, et dans ce cadre seulement : GFS ne voit un cadre d'app que de l'extérieur. `createViolations` du kit (kit/js/violations-pose.js, par la
// carte d'importation de index.html) l'écoute et le dit à GFS par `GfsLink.tell('securite', …)` (js/gfs-link.js) : `{ quoi: 'relais', kit }` une fois, au démarrage, puis `{ quoi: 'bloque', directive, cible, source, disposition, fois }` à
// chaque appel bloqué que le relais n'a pas déjà dit (la même violation ne repart qu'à la 10e, la 100e et la 1000e fois ; au plus 50 violations différentes et 200 messages par page). **Seul le nom d'hôte part** : jamais l'adresse entière,
// son chemin, ses paramètres ni un fragment, c'est-à-dire, dans une compromission, jamais ce que le code piraté cherchait à envoyer. GFS l'affiche dans « Réglages › Dépendances › Sécurité » et avertit la personne.
// **Cela informe, cela ne protège pas** : la protection est la politique de contenu de la page (la balise <meta> de index.html), que ce fichier ne change pas et ne lit pas ; un code piraté peut taire le relais ; un appel que la politique
// permet ne lève aucun événement. L'app n'a ni bouton ni réglage de plus.
// Il ne prend QUE le module de pose du kit, jamais `kit/js/violations.js` (`Violations.start()`) ni `kit/js/violations-start.js` : ceux-là démarreraient le lien du kit à côté de celui de l'app, et deux liens dans un même cadre numérotent
// chacun leurs appels depuis 1 et se prendraient les réponses (comme pour l'ambiance, js/gfs-ambiance.js, et les correcteurs, js/gfs-correcteurs.js). Le lien donné à `createViolations` est donc `GfsLink` (`hosted`, `tell`).
// Il est le deuxième script de la page, juste après js/gfs-link.js (le premier, qui lui donne `GfsLink`) : une violation qui arrive avant le démarrage n'est pas vue, et le module de pose, petit et de la même origine, se charge pendant que
// les autres scripts se chargent encore, bien avant les modules de l'éditeur que la page demande à sa copie rangée (vendor/editeur/).
//   - Hébergée (adresse avec `gfs=`) seulement : seule, rien n'est chargé, rien n'est écouté et rien n'est dit dans la console.
//   - Le module de pose ne se charge pas (le dépôt de l'app sans son kit, un réseau qui le coupe) : le relais ne démarre pas, GFS n'est pas averti et l'app le dit une fois dans la console. La page n'en est pas moins protégée.
//   GfsViolations.ready     résolue (jamais rejetée) quand le relais a démarré, ou qu'il ne démarre pas (seule, module absent) ; l'app n'a pas à l'attendre pour s'afficher
//   GfsViolations.active()  vrai quand le relais écoute (hébergée, module chargé)
const GfsViolations = (function () {
  let running = null;

  const active = () => running !== null && running.active();

  // Le module de pose du kit se charge dès que ce fichier s'exécute ; `start()` écoute `securitypolicyviolation` sur la page et dit `relais` à GFS tout de suite.
  const ready = !GfsLink.hosted ? Promise.resolve() : import('kit/violations-pose')
    .then((module) => {
      running = module.createViolations({ link: GfsLink }).start();
    })
    .catch(e => console.warn('[GfsViolations] le relais des appels bloqués ne démarre pas : GFS ne sera pas averti', e))
    .then(() => undefined);

  return { ready, active };
})();
