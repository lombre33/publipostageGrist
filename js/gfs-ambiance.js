// L'ambiance de GFS posée sur la page de l'app (consigne GFS 041, contrats de GFS 5.2 point 10, guide des apps règle 15). La personne choisit dans la fenêtre « Thème » de Grist Factory Suite une ambiance (Grist Factory,
// Pop, Papier, Brut, Néon) et, si elle veut, sa couleur : un seul choix pour GFS et toutes ses apps. js/gfs-link.js le lit (le contexte, puis l'événement `ambiance`, par `normalizeAmbiance` du kit) ; ce fichier le pose :
// `createAmbiance` du kit (kit/js/ambiance-pose.js, par la carte d'importation de index.html) écrit sur <html>, par le CSSOM (`style.setProperty`, jamais un attribut `style` ni une feuille tirés du message), les dix-neuf
// jetons de couleur du mode que l'app affiche et les jetons de forme (arrondis, ombres, polices, fonds). Les feuilles de css/ lisent ces jetons (`var(--surface)`, `var(--radius-md, 10px)`…) : rien d'autre à changer.
// Il ne prend QUE le module de pose du kit, jamais `kit/js/ambiance.js` : celui-ci démarrerait le lien du kit à côté de celui de l'app, et deux liens dans un même cadre numérotent chacun leurs appels depuis 1 et se
// prendraient les réponses. Le lien donné à `createAmbiance` est donc `GfsLink` (`ambiance()`, `onAmbiance(fn)`, `ready`), et le mode est celui de l'app.
//   - Hébergée (adresse avec `gfs=`) seulement : seule, il n'y a pas d'ambiance, rien n'est chargé, rien n'est posé et les couleurs sont celles de la charte (css/style.css).
//   - Le mode : le choix de la personne dans Réglages (`data-theme` sur <html>, js/settings.js), à défaut la préférence du système - ce que lisent les feuilles de css/style.css. La pose suit l'un et l'autre (le kit
//     observe `data-theme` et la préférence du système) : le thème qui change repeint les jetons de l'autre mode sans que GFS dise rien.
//   - GFS dit `null` (rien n'est choisi, ou la personne revient à Grist Factory) : tout ce qui avait été posé est retiré, et rien d'autre. L'app retrouve ses couleurs sans recharger.
//   - Ce que l'app PRODUIT (la page écrite dans l'éditeur, le PDF, l'e-mail, les exports) garde l'aspect du modèle : l'ambiance ne vaut que pour ce que l'app montre à la personne (dev-tests/ambiance-exceptions.json dit
//     pourquoi chaque couleur écrite en dur dans les feuilles y reste ; le papier ne lit aucun jeton de l'ambiance).
//   - `data-gfs-ambiance="<id>"` sur <html> quand l'ambiance est posée, et `data-gfs-forme` quand elle porte des jetons de forme : css/gfs-ambiance.css n'agit que sous eux (plan de travail, ombres flottantes, filet et titres
//     des fenêtres), donc rien ne change sans ambiance, ni quand le module de pose ne s'est pas chargé. Retirés avec l'ambiance.
//   - Le module de pose ne se charge pas (le dépôt de l'app sans son kit, un réseau qui le coupe) : l'app garde ses couleurs et le dit une fois dans la console.
//   GfsAmbiance.ready     résolue (jamais rejetée) quand la pose a démarré et posé l'ambiance du contexte, ou qu'elle ne démarre pas (seule, module absent) ; l'app n'a pas à l'attendre pour s'afficher
//   GfsAmbiance.active()  vrai quand la pose tourne (hébergée, module chargé)
//   GfsAmbiance.isDark()  vrai quand l'app affiche son mode sombre : le mode dont l'ambiance pose les jetons
const GfsAmbiance = (function () {
  const DARK_QUERY = '(prefers-color-scheme: dark)';
  let running = null;

  // Le mode que l'app affiche, comme css/style.css le choisit : `data-theme="dark"` ou `"light"` (le choix de la personne), à défaut le système.
  function isDark() {
    const choice = document.documentElement.getAttribute('data-theme');
    if (choice === 'dark') return true;
    if (choice === 'light') return false;
    return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
  }

  const active = () => running !== null;

  // Les deux marques de <html> que lit css/gfs-ambiance.css. L'identifiant vient de `normalizeAmbiance` du kit (`[a-z][a-z0-9-]{0,31}`) : rien d'autre ne s'écrit dans l'attribut.
  function mark(ambiance) {
    const root = document.documentElement;
    if (ambiance === null) {
      root.removeAttribute('data-gfs-ambiance');
      root.removeAttribute('data-gfs-forme');
      return;
    }
    root.setAttribute('data-gfs-ambiance', ambiance.id);
    if (Object.keys(ambiance.forme || {}).length > 0) root.setAttribute('data-gfs-forme', '');
    else root.removeAttribute('data-gfs-forme');
  }

  // Le module de pose du kit se charge en même temps que le lien demande le contexte (js/gfs-link.js charge le lecteur du message au même instant) ; `start()` pose tout de suite ce que le lien sait, puis suit
  // `onAmbiance` et le mode. `ready` du kit se règle quand le contexte de GFS est arrivé et que l'ambiance est posée.
  const ready = !GfsLink.hosted ? Promise.resolve() : import('kit/ambiance-pose')
    .then((module) => {
      running = module.createAmbiance({ link: GfsLink, isDark }).start();
      GfsLink.onAmbiance(mark);
      mark(GfsLink.ambiance());
      return running.ready;
    })
    .catch(e => console.warn('[GfsAmbiance] la pose de l\'ambiance ne démarre pas : l\'app garde ses couleurs', e))
    .then(() => undefined);

  return { ready, active, isDark };
})();
