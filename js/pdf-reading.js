// La lecture d'un PDF vue du socle du widget (consigne GFS 040). GFS garde les PDF, télécharge celui que la personne veut lire et le donne à l'app (`lecture: { id, fichier }`, js/gfs-link.js, js/gfs-open.js) ;
// l'app le montre DANS son mode Lecture, avec son interface (sa barre, son zoom, la Lecture épurée), pas dans un lecteur à part. Le moteur (pdf.js, que GFS porte) et l'écran des pages sont l'extension
// « lecture-pdf » (extensions/lecture-pdf/ : pdf-engine.js, pdf-view.js et sa feuille de style), que GFS active ou non ; ce fichier garde ce qui reste quand elle est absente et le SEUL point d'entrée par lequel
// le reste du widget (js/main.js, js/gfs-open.js) l'atteint :
//  - la LECTURE `open(lecture)` : rend vrai quand le PDF est à l'écran, faux quand l'extension est éteinte ou que GFS ne donne pas pdf.js (le coin d'état dit pourquoi), que le PDF est vide, n'en est pas un, ne se lit
//    pas, demande un mot de passe que la personne ne donne pas ou ne trouve pas, ou que la personne répond « Annuler » à la question d'enregistrement. Dans l'ordre : l'extension se charge (au premier PDF seulement),
//    le PDF se lit (une fenêtre de l'app demande le mot de passe d'un PDF protégé, jamais `prompt()`), PUIS le modèle ouvert se quitte (« Enregistrer / Abandonner / Annuler » s'il est modifié : un PDF illisible ne
//    coûte rien) et le mode Lecture montre le PDF. Un PDF déjà à l'écran est remplacé par le suivant sans recharger l'app et sans nouvelle question (il n'y a plus de modèle à quitter) ;
//  - ce qui reste vrai PENDANT la lecture : `isActive` (js/main.js garde le PDF quand la ligne de la table change, grise ce qui ne s'applique pas à lui - l'édition, l'enregistrement, l'export, les commentaires -
//    avec sa raison, et ferme le PDF quand un modèle s'ouvre), `render(container)` (la Lecture dessine le PDF à la place du modèle), `close`. Lire n'écrit rien dans le document ;
//  - seul (adresse sans `gfs=`) : aucune ouverture n'arrive, rien ne change.
//   PdfReading.init({ leave() -> Promise<bool>, show() -> Promise<void>, say(texte, erreur?), layoutChanged() })   ce que js/main.js fournit
//   PdfReading.open(lecture) -> Promise<bool>    PdfReading.close()    PdfReading.render(container) -> Promise<void>    PdfReading.isActive()    PdfReading.info() -> { id, name, pages } | null
//   PdfReading.onChange(fn(actif)) -> se désabonner    PdfReading.reasons() -> les phrases des grisés (js/main.js)
//  - les COMMENTAIRES (consigne GFS 045) : le geste « Commenter » (js/comments.js) vient ici quand un PDF est à l'écran, `comment()` le passe au module des fils (extensions/lecture-pdf/pdf-comments.js, chargé avec l'extension) ;
//    ce module dit quand « Commenter » se grise ou se dégrise (`locksChanged()` : un PDF sans texte, une structure que Grist refuse) et parle dans le coin d'état par `say`.
//   PdfReading.comment()    PdfReading.say(texte, erreur?)    PdfReading.onLocksChanged(fn) -> se désabonner    PdfReading.locksChanged()
const PdfReading = (function () {
  const ID = 'lecture-pdf';
  const LIBRARY = 'pdfjs';   // la bibliothèque que GFS donne (`bibliotheques.pdfjs`) : pdf.js

  let current = null;     // le PDF à l'écran : { id, name, doc }
  let mounting = null;    // la pose en cours : { owner, promise }
  let host = { leave: async () => true, show: async () => {}, say: () => {}, layoutChanged: () => {} };
  const listeners = new Set();

  function init(given) { host = Object.assign({}, host, given); }
  const isActive = () => current !== null;
  const info = () => (current ? { id: current.id, name: current.name, pages: current.doc.pageCount } : null);
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify() {
    listeners.forEach((fn) => { try { fn(isActive()); } catch (e) { console.warn('[PdfReading] abonné en échec', e); } });
  }
  const lockListeners = new Set();
  function onLocksChanged(fn) { lockListeners.add(fn); return () => lockListeners.delete(fn); }
  function locksChanged() {
    lockListeners.forEach((fn) => { try { fn(); } catch (e) { console.warn('[PdfReading] abonné en échec', e); } });
  }
  const say = (text, isError) => host.say(text, isError);
  // Le geste « Commenter » sur le PDF à l'écran : le module des fils, s'il est chargé (l'extension l'apporte), sinon rien.
  function comment() { if (current && typeof PdfComments !== 'undefined') PdfComments.comment(); }

  // Les phrases que l'écran des pages dit (extensions/lecture-pdf/pdf-view.js) : le nom de chaque page pour un lecteur d'écran, et la raison d'une page qui ne s'est pas dessinée.
  const screenTexts = () => ({ page: (n, total) => I18n.t('pdf.page', { n, total }), failed: () => I18n.t('pdf.pageFailed') });

  const fileName = file => String((file && file.name) || '').trim() || I18n.t('pdf.untitled');

  // Le mot de passe d'un PDF protégé, par la fenêtre de saisie de l'app (Dialogs.prompt, champ masqué) ; `again` : le mot de passe précédent n'était pas le bon. null : la personne annule.
  function askPassword(name, again) {
    return Dialogs.prompt({
      title: I18n.t('pdf.password.title'),
      message: I18n.t(again ? 'pdf.password.again' : 'pdf.password.message', { name }),
      label: I18n.t('pdf.password.label'),
      secret: true,
      confirmLabel: I18n.t('pdf.password.confirm'),
    });
  }

  function dropView() {
    mounting = null;
    if (typeof PdfView !== 'undefined') PdfView.unmount();
  }

  function close() {
    if (!current) return;
    const old = current;
    current = null;
    dropView();
    old.doc.destroy();
    notify();
  }

  async function open(lecture) {
    const name = fileName(lecture && lecture.fichier);
    if (!Extensions.isActive(ID)) { host.say(I18n.t('pdf.status.off'), true); return false; }
    // Une extension active dont GFS ne donne pas le moteur : on le dit comme tel (rien d'autre n'est chargé), pas comme un échec de chargement.
    if (!Extensions.library(LIBRARY)) { host.say(I18n.t('pdf.status.engine'), true); return false; }
    host.say(I18n.t('pdf.status.reading', { name }));
    try { await Extensions.ensure(ID); }
    catch (e) {
      console.warn('[PdfReading] extension non chargée', e);
      host.say(I18n.t('pdf.status.loadFailed'), true);
      return false;
    }
    const result = await PdfEngine.open(lecture.fichier, { askPassword: again => askPassword(name, again) });
    if (!result.ok) { host.say(I18n.t('pdf.status.' + result.reason, { name }), true); return false; }
    // Le PDF est lu : le modèle ouvert se quitte maintenant (pas avant : un PDF refusé ne coûte rien). Un PDF déjà à l'écran n'a plus de modèle derrière lui.
    if (!current && !(await host.leave())) { result.doc.destroy(); host.say(''); return false; }
    const old = current;
    current = { id: String(lecture.id), name, doc: result.doc };
    if (old) { dropView(); old.doc.destroy(); }
    notify();
    await host.show();
    host.say(I18n.t('pdf.status.opened', { name, n: result.doc.pageCount }));
    return true;
  }

  // La Lecture dessine le PDF à la place du modèle (js/main.js `renderReader`). Rien à refaire quand le PDF est déjà posé dans ce conteneur : la ligne de la table peut changer cent fois, le PDF reste.
  function render(container) {
    if (!current || !container) return Promise.resolve();
    const owner = current;
    if (mounting && mounting.owner === owner && container.querySelector('.pp-pdf-pages')) return mounting.promise;
    const promise = PdfView.mount(container, owner.doc, screenTexts(), () => host.layoutChanged()).catch((e) => {
      console.warn('[PdfReading] pages non posées', e);
      if (current === owner) host.say(I18n.t('pdf.status.unreadable', { name: owner.name }), true);
    });
    mounting = { owner, promise };
    return promise;
  }

  // Les raisons des grisés pendant la lecture, pour js/main.js : l'édition, les modèles (enregistrer, renommer, supprimer...), l'export, les commentaires. Un grisé sans raison (null) n'en est pas un : « Commenter » se dégrise pour un PDF
  // qui a du texte, le module des fils dit sinon pourquoi il reste grisé (un PDF sans texte, une structure que Grist refuse) ; sans lui, comme avant la 045, il reste grisé.
  const reasons = () => ({
    edit: I18n.t('pdf.locked.edit'),
    template: I18n.t('pdf.locked.template'),
    export: I18n.t('pdf.locked.export'),
    comment: typeof PdfComments !== 'undefined' ? PdfComments.lockReason() : I18n.t('pdf.locked.comment'),
  });

  return { init, open, close, render, isActive, info, onChange, reasons, comment, say, onLocksChanged, locksChanged };
})();
