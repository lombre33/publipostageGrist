// Ce que le widget retient de CHAQUE PERSONNE : ses préférences d'interface (thème, caractères déclencheurs, raccourcis, messagerie du mode Email, enregistrement automatique, assemblage avant impression, niveau de
// zoom, protection du PDF), des textes rangés sous une clé `pp_…`. Un seul point d'entrée pour tous les modules, parce que le navigateur ne les garde pas partout :
//  - SEUL (adresse sans `gfs=`), ou hébergé par une GFS qui ne donne pas d'espace à l'app (d'avant la consigne 024) : le stockage du navigateur, comme avant, relu à chaque lecture (un autre onglet qui change une clé
//    se voit tout de suite). Un stockage refusé ou plein ne lève rien : la clé n'est pas retenue et l'appelant retombe sur son réglage d'origine.
//  - HÉBERGÉ par une GFS qui donne l'espace de l'app (`stockage` du contexte, consigne 024) : cet espace, parce que le cadre isolé de GFS refuse son propre stockage. Il se lit au démarrage, avec le contexte ; chaque
//    changement part aussitôt par l'appel `stockage.ecrire` (js/gfs-link.js, le seul à parler à GFS). Il est par navigateur, pas par compte, et n'est pas celui de l'app seule : un réglage fait seule ne suit pas
//    dans GFS, sans rien perdre.
// Les clés (consigne 024) : les dix `pp_…` des modules qui s'en servent et pp_news_seen (la fenêtre des nouveautés, une fois par personne chez GFS) ; jamais la langue (GFS la donne : js/i18n.js) ni les noms de
// colonnes d'un document (js/schema-renames.js), qui restent dans le navigateur. Une clé suit la règle de GFS (1 à 64 caractères parmi A-Z a-z 0-9 _ . : -) et une valeur est un texte (les JSON s'écrivent avant).
//   PersonStore.get(clé)         le texte gardé, null s'il n'y est pas (ou si le stockage est indisponible) ; ne lève jamais.
//   PersonStore.set(clé, texte)  retient le texte ; vrai quand GFS ou le navigateur le garde, faux sinon (clé ou valeur hors de la règle, stockage refusé : la page continue sans). PersonStore.remove(clé) retire la clé.
//   PersonStore.ready            promesse jamais rejetée, résolue quand le contexte de GFS est arrivé (ou ses 5 secondes passées), tout de suite seul. Un module qui construit quelque chose d'après une préférence
//                                (l'éditeur lit le caractère de déclenchement une fois) l'attend d'abord ; avant, une lecture peut ne pas encore être celle de GFS.
//   PersonStore.onLoaded(fn)     `fn()` quand l'espace de GFS vient de prendre la place de ce que la page a lu avant lui : relire alors ce qu'on avait lu (le thème, les raccourcis, l'aspect du bouton Enregistrer).
//                                Appelé une fois, au tour suivant si c'est déjà fait ; jamais seul ni avec une GFS sans espace (rien n'a changé).
//   PersonStore.shared()         vrai quand les préférences sont celles de GFS.
// Hébergé, avant que le contexte soit arrivé (au plus 5 secondes), rien ne s'écrit nulle part : la page ne sait pas encore où ça va, et rien d'elle n'écrit avant (le démarrage attend ce contexte, aucun réglage
// n'est encore câblé). Lire ne doit jamais écrire : une valeur d'origine posée par un module au chargement irait sinon écraser le choix gardé chez GFS.
const PersonStore = (function () {
  const KEY = /^[A-Za-z0-9_.:-]{1,64}$/;   // la règle de GFS pour une clé (contrats 5.3), suivie partout : seule comme hébergée, une clé a la même forme
  let loaded = false;                      // le contexte est arrivé, ou ses 5 secondes sont passées
  let sharedSpace = false;                 // les préférences sont celles de GFS (le contexte a donné un espace)
  const subscribers = [];

  function browserGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function browserWrite(key, value) {
    try {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      return true;
    } catch (e) { return false; }
  }

  function get(key) {
    return sharedSpace ? GfsLink.storageGet(key) : browserGet(key);
  }

  // `value` : un texte, ou null pour retirer la clé.
  function write(key, value) {
    if (typeof key !== 'string' || !KEY.test(key) || (value !== null && typeof value !== 'string')) return false;
    if (sharedSpace) return GfsLink.storageSet(key, value);
    if (GfsLink.hosted && !loaded) return false;   // GFS n'a pas encore dit où ça va
    return browserWrite(key, value);
  }

  const set = (key, value) => (typeof value === 'string' ? write(key, value) : false);
  const remove = key => write(key, null);

  function run(fn) {
    try { fn(); } catch (e) { console.warn('[PersonStore] abonné en échec', e); }
  }

  function load() {
    sharedSpace = GfsLink.hasStorage();
    loaded = true;
    if (sharedSpace) subscribers.splice(0).forEach(run);
    else subscribers.length = 0;
  }

  function onLoaded(fn) {
    if (typeof fn !== 'function') return;
    if (!loaded) subscribers.push(fn);
    else if (sharedSpace) Promise.resolve().then(() => run(fn));
  }

  // Inscrit avant tout autre abonné de GfsLink.ready (ce fichier se charge juste après js/gfs-link.js) : quand un module attend `GfsLink.ready` ou celle-ci, les préférences de GFS sont déjà là.
  const ready = GfsLink.ready.then(load);

  return { get, set, remove, ready, onLoaded, shared: () => sharedSpace };
})();
