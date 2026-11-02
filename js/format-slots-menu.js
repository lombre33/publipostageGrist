// Le menu des mises en forme gardées (js/format-slots.js), au survol du bouton du pinceau de mise en forme (#v2-btn-format-painter, js/format-painter.js) : le bouton garde son geste (un clic copie la mise en forme du
// texte, un double-clic la garde armée) et son menu s'ouvre dessous, comme celui des autres boutons à variantes (Tableau, Image). Barre d'outils gelée : pas de bouton de plus.
// Deux blocs de trois lignes, comme les rangées « Couleurs du modèle » et « Couleurs partagées » des menus de couleur : « Mises en forme du modèle » (avec ce modèle seulement) et « Mises en forme partagées »
// (tous les modèles du document Grist, partagées avec l'équipe). Une ligne :
//  - place vide : « Garder la mise en forme du texte » garde celle du curseur ou de la sélection dans cette place, sous le nom « Mise en forme N » ;
//  - place prise : son nom (un clic la pose sur la sélection, comme le pinceau - grisée avec sa raison quand rien n'est sélectionné), un crayon pour la renommer et une corbeille pour la retirer (une question d'abord
//    pour une mise en forme partagée, que toute l'équipe perdrait).
// Les lignes sont des boutons qui ne prennent pas le focus à la souris : la sélection reste celle du texte. Au clavier (Tab depuis le bouton du pinceau, Entrée sur une ligne) le focus reste dans le menu, à la place du
// geste, même quand la ligne est redessinée ; seul « appliquer » rend le focus au texte qu'il vient de mettre en forme. Le menu se redessine quand ce qu'il montre change (les places, la langue, une sélection qui
// apparaît ou disparaît) ; la barre d'outils l'appelle à chaque mise à jour (`sync`) et le survol aussi, si bien qu'il est à jour au moment où il s'ouvre.
const FormatSlotsMenu = (function () {
  const el = Dom.el;
  const FLYOUT_ID = 'v2-painter-flyout';

  let editor = null;
  let flyout = null;
  let group = null;
  let wired = false;
  let drawn = ''; // ce que le menu montre, pour ne le redessiner que s'il change

  // Ce que le menu montre : la langue, les places des deux portées et le droit de peindre la sélection.
  function signature() {
    return JSON.stringify([I18n.getLang(), FormatSlots.scopes().map(scope => scope.slots), FormatSlots.hasSelection(editor)]);
  }

  function actionButton(className, scopeId, index, action, label, tip) {
    const button = Dom.button(className);
    // Dans cet ordre : le registre de Ctrl + Z (dev-tests/undo-ledger.json) désigne ces boutons par leurs attributs.
    button.dataset.scope = scopeId;
    button.dataset.slot = String(index);
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    if (tip) button.title = tip;
    return button;
  }

  function rowOf(scope, index, slot, canApply) {
    const row = el('span', 'pp-fs-row');
    row.setAttribute('role', 'group');
    if (!slot) {
      const label = I18n.t('fmtSlot.keep');
      const keep = actionButton('pp-fs-name pp-fs-empty', scope.id, index, 'save', I18n.t('fmtSlot.keep.aria', { n: index + 1, scope: scope.label }), label);
      keep.append(el('span', 'pp-fs-label', '+ ' + label));
      row.append(keep);
      return row;
    }
    row.setAttribute('aria-label', slot.name);
    const apply = actionButton('pp-fs-name', scope.id, index, 'apply', I18n.t('fmtSlot.apply.aria', { name: slot.name }), I18n.t(canApply ? 'fmtSlot.apply.tip' : 'fmtSlot.apply.needSelection'));
    apply.append(el('span', 'pp-fs-label', slot.name));
    if (!canApply) apply.setAttribute('aria-disabled', 'true');
    const rename = actionButton('pp-fs-icon', scope.id, index, 'rename', I18n.t('fmtSlot.rename.aria', { name: slot.name }), I18n.t('fmtSlot.rename.tip'));
    Dom.setMarkup(rename, Icons.svg('edit'));
    const clear = actionButton('pp-fs-icon', scope.id, index, 'clear', I18n.t('fmtSlot.clear.aria', { name: slot.name }), I18n.t('fmtSlot.clear.tip'));
    Dom.setMarkup(clear, Icons.svg('trash'));
    row.append(apply, rename, clear);
    return row;
  }

  // Redessine le menu sous son intitulé (le nom du pinceau, dans le HTML, qui porte aussi sa touche). Le clavier garde sa place : le focus, s'il était sur une ligne (ou sur celle que `focusAt` désigne, quand le geste vient
  // du clavier), passe à la ligne de la même place - une place qu'on vient de remplir ou de vider ne le laisse pas dans le vide. Le bouton qui portait le focus part avec l'ancien dessin, et un focus qui s'en va sans
  // destination referme le menu (js/editor-core.js : la sortie du groupe) : il passe donc d'abord au bouton du pinceau, qui reste, le temps du dessin - ce qui rouvre aussi le menu au clavier s'il s'était refermé.
  function render(focusAt) {
    if (!flyout) return;
    const focused = flyout.contains(document.activeElement) ? document.activeElement : null;
    const at = focusAt || (focused && focused.dataset && focused.dataset.scope ? { scope: focused.dataset.scope, slot: focused.dataset.slot, action: focused.dataset.action } : null);
    const trigger = group ? group.querySelector(':scope > button') : null;
    if (trigger && (focused || focusAt)) trigger.focus({ preventScroll: true });
    const canApply = FormatSlots.hasSelection(editor);
    const parts = [];
    FormatSlots.scopes().forEach((scope) => {
      parts.push(el('span', 'v2-hover-hsep'));
      const heading = el('span', 'pp-fs-scope', scope.label);
      heading.title = scope.hint;
      parts.push(heading);
      scope.slots.forEach((slot, index) => parts.push(rowOf(scope, index, slot, canApply)));
    });
    while (flyout.children.length > 1) flyout.lastElementChild.remove();
    flyout.append(...parts);
    drawn = signature();
    if (at && at.scope) {
      const same = flyout.querySelector('button[data-scope="' + at.scope + '"][data-slot="' + at.slot + '"][data-action="' + at.action + '"]')
        || flyout.querySelector('button[data-scope="' + at.scope + '"][data-slot="' + at.slot + '"]');
      if (same) same.focus({ preventScroll: true });
    }
  }

  // Appelé à chaque mise à jour de la barre d'outils (sélection, transaction) : ne redessine que si le menu a changé.
  function sync(ed) {
    if (ed) editor = ed;
    if (!flyout || !editor) return;
    if (signature() !== drawn) render();
  }

  async function rename(scopeId, index) {
    const slot = FormatSlots.slots(scopeId)[index];
    if (!slot) return;
    const name = await Dialogs.prompt({
      title: I18n.t('fmtSlot.rename.title'),
      label: I18n.t('fmtSlot.rename.label'),
      value: slot.name,
      confirmLabel: I18n.t('fmtSlot.rename.confirm'),
    });
    if (name !== null) FormatSlots.rename(scopeId, index, name);
  }

  async function clear(scopeId, index) {
    const slot = FormatSlots.slots(scopeId)[index];
    if (!slot) return;
    // Une mise en forme partagée est celle de toute l'équipe : on demande d'abord (Ctrl + Z la rend). Celle du modèle se retire d'un clic, Ctrl + Z aussi la rend.
    if (scopeId === 'document') {
      const sure = await Dialogs.confirm({
        title: I18n.t('fmtSlot.clear.title', { name: slot.name }),
        message: I18n.t('fmtSlot.clear.message'),
        confirmLabel: I18n.t('fmtSlot.clear.confirm'),
        danger: true,
      });
      if (!sure) return;
    }
    FormatSlots.clear(scopeId, index);
  }

  async function onClick(event) {
    const button = event.target.closest ? event.target.closest('button[data-action]') : null;
    if (!button || !flyout.contains(button)) return;
    if (button.getAttribute('aria-disabled') === 'true' || !FormatPainter.isUsable()) return;
    const { scope, action } = button.dataset;
    const index = Number(button.dataset.slot);
    // Le clavier est dans le menu quand la ligne a le focus (la souris ne le lui donne jamais) : il y reste, à la place du geste, une fois le menu redessiné.
    const keyboardAt = flyout.contains(document.activeElement) ? { scope, slot: String(index), action } : null;
    if (action === 'apply') {
      // Le geste est fait : le menu ne reste pas ouvert sur le texte qu'on vient de mettre en forme, et le focus est au texte (la souris est-elle sur le menu ? il le lit lui-même).
      if (FormatSlots.apply(editor, scope, index)) {
        if (group) EditorCore.closeHoverMenu(group);
        render();
        return;
      }
    } else if (action === 'save') FormatSlots.save(editor, scope, index);
    else if (action === 'rename') await rename(scope, index);
    else if (action === 'clear') await clear(scope, index);
    render(keyboardAt);
  }

  function wire(ed) {
    editor = ed;
    flyout = document.getElementById(FLYOUT_ID);
    group = flyout ? flyout.closest('.v2-hover-group') : null;
    if (!flyout || wired) return;
    wired = true;
    // Un bouton du menu ne prend pas le focus à la souris : la sélection du texte, qu'il met en forme, reste celle de l'éditeur.
    flyout.addEventListener('mousedown', (event) => { if (event.target.closest && event.target.closest('button')) event.preventDefault(); });
    flyout.addEventListener('click', onClick);
    // À jour à l'ouverture, d'où qu'elle vienne (souris, clavier) ; le modèle qui change (marges, ouverture d'un autre modèle) ou le document qui se relit aussi.
    group.addEventListener('mouseover', () => sync());
    group.addEventListener('focusin', () => sync());
    document.addEventListener('pp:marginsChanged', () => sync());
    render();
  }

  return { wire, sync, render };
})();
