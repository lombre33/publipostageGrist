// « Variables à revoir » (audit « confort d'usage » du 12/11, idée 7) : sur un long modèle, une bulle rouge (colonne disparue) ou orange (table sans lien avec la page) se trouvait à l'œil en faisant défiler. Le coin
// d'état dit maintenant « 2 variables à revoir » ; un clic dessus (ou Entrée) mène à la première, puis à la suivante, en tournant ; la commande « Variable à revoir suivante » de la palette (Alt+/) fait pareil.
// Aucune règle nouvelle : on réutilise le rouge et l'orange qui existent (js/editor.js:markBadgeValidity pose leurs classes, qui sont aussi lues ici) - bulles #Variable, bulles « Calcul », sinon d'une bulle
// cassé, image liée à une colonne disparue. Le coin d'état ne dit cela que quand il est vide (ou déjà à ce message, ou à « Widget prêt. ») : un « Enregistré », une erreur ou « Modifications non enregistrées » gardent la place, et le
// message revient au prochain signalement. Rien n'est écrit dans le document. Édition seulement (la Lecture n'a rien à corriger).
const VariableReview = (function () {
  const FLAWED = '.var-badge-broken, .var-badge-unlinked, .var-badge-otherwise-broken, .calc-badge-broken, .calc-badge-unlinked, .editor-image-broken';
  const CLASS = 'pp-status-review';
  let wired = false;

  const statusEl = () => document.getElementById('status-msg');
  const isOurs = el => !!el && el.classList.contains(CLASS);
  // La place est libre quand le coin d'état est vide, qu'il porte déjà ce message ou qu'il dit seulement « Widget prêt. » (rien à garder).
  const isFree = el => !el.textContent || isOurs(el) || el.textContent === I18n.t('status.ready') || el.textContent === I18n.t('status.readyReadOnly');
  function problems() {
    const editor = typeof EditorCore !== 'undefined' ? EditorCore.getEditor() : null;
    if (!editor || !editor.view || editor.view.isDestroyed) return [];
    return Array.from(editor.view.dom.querySelectorAll(FLAWED));
  }
  function editing() {
    const container = document.getElementById('editor-container');
    return !!container && container.getClientRects().length > 0;
  }

  // Le coin d'état : « N variables à revoir » quand il y en a et que la place est libre ; vidé quand il n'y en a plus et que le message était celui-ci.
  function refresh() {
    const el = statusEl();
    if (!el || !wired) return;
    const count = problems().length;
    if (count > 0 && isFree(el)) {
      el.textContent = I18n.t(count === 1 ? 'review.status.one' : 'review.status.many', { n: count });
      el.className = CLASS;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.title = I18n.t('review.status.tip');
    } else if (count === 0 && isOurs(el)) {
      clear(el);
    }
  }
  function clear(el) {
    el.textContent = '';
    el.className = '';
    el.removeAttribute('role');
    el.removeAttribute('tabindex');
    el.removeAttribute('title');
  }

  // Va à la bulle à revoir suivante : la première après la sélection, en tournant. Rend vrai si elle y est allée.
  function next() {
    const editor = EditorCore.getEditor();
    const list = problems();
    const el = statusEl();
    if (!editor || !editing()) return false;
    if (!list.length) {
      if (el) { if (isOurs(el)) clear(el); el.textContent = I18n.t('review.none'); el.className = ''; }
      return false;
    }
    const here = editor.state.selection.to;
    const at = list.map(item => ({ item, pos: editor.view.posAtDOM(item, 0) }));
    const target = at.find(entry => entry.pos >= here && !(entry.pos === editor.state.selection.from && editor.state.selection.node)) || at[0];
    editor.chain().focus().setNodeSelection(target.pos).scrollIntoView().run();
    // Le message dit où l'on en est et pourquoi la bulle est signalée (son info-bulle).
    const index = at.indexOf(target) + 1;
    if (el) {
      el.textContent = I18n.t('review.at', { i: index, n: list.length, problem: target.item.title || '' });
      el.className = CLASS;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.title = I18n.t('review.status.tip');
    }
    return true;
  }

  function wire() {
    if (wired) return;
    wired = true;
    const el = statusEl();
    if (!el) return;
    el.addEventListener('click', () => { if (isOurs(el)) next(); });
    el.addEventListener('keydown', event => {
      if (!isOurs(el) || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      next();
    });
    // Un appui sur le message ne prend pas le focus du document (le curseur et la sélection restent où ils sont jusqu'à ce que la bulle soit choisie).
    el.addEventListener('mousedown', event => { if (isOurs(el)) event.preventDefault(); });
    refresh();
  }

  return { wire, refresh, next, problems };
})();
