// La PAGE du modèle dans l'écriture en direct : son format, son sens, ses marges, son thème et son décor (une présentation), son filigrane, ses couleurs et ses mises en forme gardées - tout ce que
// js/page-layout.js garde dans le brouillon de la colonne Margins, hors du texte. Sans ce fichier la page n'était pas partagée : la personne qui n'enregistre pas la changeait, et
// l'enregistrement suivant de la personne qui enregistre remettait la sienne (le changement se perdait sans un mot).
//
// La page vit dans une table de Yjs du même document que le texte (`page`, UNE entrée par réglage : `top`, `format`, `theme`... chacune en JSON). Deux réglages changés ensemble par deux personnes se
// gardent tous les deux ; le même changé ensemble donne celui d'une seule (comme le texte). L'historique PAR PERSONNE de l'éditeur (extensions/edition/live-editor.js) la range avec les frappes :
// Ctrl+Z défait le dernier geste de la page de la personne, jamais celui d'une autre. Un geste qui écrit aussi dans le texte (le thème qui recolore le texte) reste UN seul pas.
//   - fonder : la page de l'éditeur part dans le salon (`fill`) ; rejoindre : la page du salon remplace celle de l'éditeur, comme son texte (`attach`) ;
//   - un geste de la page ici (tous annoncent `pp:marginsChanged`) : les réglages qui ont changé partent dans la table ;
//   - un changement qui arrive (une autre personne, un Annuler ou un Rétablir) : la page de l'éditeur la prend (PageLayout.restore), l'éditeur se remet en page, et le modèle est « à enregistrer »
//     SANS être un réglage de cette personne (elle n'écrira pas la colonne Margins à la place de la personne qui enregistre : l'événement porte `detail.remote`, js/main.js).
const LivePage = (function () {
  const MAP = 'page';
  const ORIGIN = 'pp-live-page';             // les gestes de CETTE personne : suivis par son Annuler
  const SEED = 'pp-live-page-seed';          // la page posée à l'accroche quand le salon n'en avait pas : pas un geste, rien à défaire
  // Sans l'un d'eux la page du salon est incomplète (un salon fondé avant ce fichier, une table abîmée) : elle n'est pas lue, la page de l'éditeur reste telle quelle.
  const REQUIRED = ['top', 'right', 'bottom', 'left', 'orientation', 'format'];

  // La page de l'éditeur, une entrée par réglage : { réglage: JSON }.
  function entriesOfPage() {
    const page = PageLayout.snapshot();
    const entries = {};
    Object.keys(page).forEach((key) => { entries[key] = JSON.stringify(page[key]); });
    return entries;
  }

  // Écrit la page de l'éditeur dans le document de passage `draft` (celui qui fonde le salon), sans toucher à l'éditeur.
  function fill(draft) {
    const map = draft.getMap(MAP);
    const entries = entriesOfPage();
    Object.keys(entries).forEach(key => map.set(key, entries[key]));
  }

  // `options` : session (le moteur), binding (LiveEditor.create : track et stopCapturing). Rend { attach, detach }.
  function create(options) {
    const { session, binding } = options;
    const doc = session.ydoc;
    const map = doc.getMap(MAP);
    let attached = false;
    let applying = false;                     // vrai le temps que la page du salon est posée dans l'éditeur : ce n'est pas un geste d'ici

    // L'historique de Yjs groupe ce qui arrive à moins d'une demi-seconde l'un de l'autre. La page et le texte ne se groupent que dans un même geste (un même tour de la boucle d'événements : le thème
    // recolore le texte puis change la page) ; les gestes de la page entre eux se groupent (les chiffres d'une marge tapés au clavier : UN pas), et rien ne se groupe avec la frappe d'à côté.
    let last = null;                          // la dernière écriture d'ici que l'historique a rangée : { page, task }
    let token = null;
    let offCapture = null;
    const task = () => {
      if (!token) { token = {}; Promise.resolve().then(() => { token = null; }); }
      return token;
    };
    // L'historique va ranger une écriture d'ici (de la page, ou du texte, ou un Annuler) : d'un autre genre que la précédente et d'un autre tour, elle commence un pas à elle.
    function onCapture(transaction) {
      const page = transaction.origin === ORIGIN;
      if (last && last.page !== page && last.task !== task()) binding.stopCapturing();
      last = { page, task: task() };
    }

    const complete = () => REQUIRED.every(key => map.has(key));

    // La page du salon, comme PageLayout.restore la veut (`next`) ; null quand elle est incomplète ou illisible.
    function pageOfRoom() {
      if (!complete()) return null;
      const page = {};
      let readable = true;
      map.forEach((value, key) => {
        try { page[key] = JSON.parse(value); } catch (e) { readable = false; }
      });
      return readable ? page : null;
    }

    // Pose dans l'éditeur la page du salon. Rend vrai quand quelque chose a changé. L'événement `pp:marginsChanged` redessine ce qui suit la page (le décor du thème, les menus) ; `detail.remote` : ce n'est
    // pas un réglage de cette personne.
    function applyRoom() {
      const next = pageOfRoom();
      if (!next) return false;
      applying = true;
      try {
        if (!PageLayout.restore(next, PageLayout.snapshot())) return false;
        Editor.refreshLayout();
        document.dispatchEvent(new CustomEvent('pp:marginsChanged', { detail: { remote: true } }));
        return true;
      } finally {
        applying = false;
      }
    }

    // Les réglages qui ont changé ici depuis le salon partent dans la table, d'un seul coup (un pas de l'historique de cette personne).
    function publish() {
      if (applying || !attached) return;
      const entries = entriesOfPage();
      const changes = [];
      Object.keys(entries).forEach((key) => { if (map.get(key) !== entries[key]) changes.push([key, entries[key]]); });
      const gone = [];
      map.forEach((_value, key) => { if (!(key in entries)) gone.push(key); });
      if (!changes.length && !gone.length) return;
      doc.transact(() => {
        changes.forEach(([key, value]) => map.set(key, value));
        gone.forEach(key => map.delete(key));
      }, ORIGIN);
    }
    function onMargins(event) {
      if (event && event.detail && event.detail.remote) return;
      publish();
    }

    // La table a changé : une autre personne, ou un Annuler ou un Rétablir d'ici (son origine est l'historique). Ce qu'on vient d'y écrire soi-même est déjà dans l'éditeur.
    function onMapChange(_event, transaction) {
      if (!attached || transaction.origin === ORIGIN || transaction.origin === SEED) return;
      if (applyRoom()) LiveEntry.markUnsaved();
    }

    function attach() {
      if (attached) return;
      attached = true;
      binding.track(map, ORIGIN);
      offCapture = binding.beforeCapture(onCapture);
      if (complete()) applyRoom();
      else doc.transact(() => { const entries = entriesOfPage(); Object.keys(entries).forEach(key => map.set(key, entries[key])); }, SEED);
      map.observe(onMapChange);
      document.addEventListener('pp:marginsChanged', onMargins);
    }

    function detach() {
      if (!attached) return;
      attached = false;
      map.unobserve(onMapChange);
      document.removeEventListener('pp:marginsChanged', onMargins);
      if (offCapture) { offCapture(); offCapture = null; }
    }

    return { attach, detach };
  }

  return { create, fill, MAP, ORIGIN };
})();
