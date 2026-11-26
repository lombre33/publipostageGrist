// Fenêtre « Condition d'affichage », Copier / Coller : le presse-papier interne (le même pour toutes les fenêtres) et les boutons qui le servent. `create(ctx)` : les gestes d'UNE
// fenêtre, qui lisent et posent son état par `ctx` (js/variable-condition.js:createWindow). Façade : js/variable-condition.js.
// Et le collage sans fenêtre (`pasteOver`) : Ctrl+C sur une pastille ou un bloc conditionnel, puis Ctrl+V sur un autre choisi d'un clic, lui donne la condition de la copie.
const VariableConditionClipboard = (function () {
  const { TEXTS, conditionSummary } = VariableConditionData;

  // Presse-papier interne : une copie { mode, rules } gardée le temps de la session du widget, d'une fenêtre et d'un modèle à l'autre. Jamais celui
  // du système : un widget dans l'iframe d'un document Grist n'a pas l'autorisation de le lire. Le même pour toutes les fenêtres de condition.
  let clipboard = null;

  // === Copier / Coller === Grisés (aria-disabled plutôt que disabled, pour que l'info-bulle qui explique pourquoi reste visible) : Copier sans règle
  // complète à copier, Coller tant que rien n'a été copié. Le clic revérifie l'état réel : la colonne d'une règle n'est adoptée qu'après le `change`
  // du champ.
  function setClipButton(btn, enabled, title) {
    btn.classList.toggle('is-disabled', !enabled);
    btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    btn.title = title;
  }

  function create(ctx) {
    function syncClipboardButtons() {
      if (!ctx.state || !ctx.refs) return;
      const canCopy = !!ConditionRules.plainCondition(ctx.state.working);
      setClipButton(ctx.refs.copyBtn, canCopy, I18n.t(canCopy ? 'varCond.clip.copyTitle' : 'varCond.clip.copyEmpty'));
      setClipButton(ctx.refs.pasteBtn, !!clipboard, clipboard ? I18n.t('varCond.clip.pasteTitle', { summary: conditionSummary(clipboard) }) : I18n.t('varCond.clip.pasteEmpty'));
    }

    // « Copiée » pendant un instant : seul retour visible d'une copie, qui ne change rien d'autre à l'écran.
    function resetCopyLabel() {
      clearTimeout(ctx.copiedFlashTimer);
      if (!ctx.refs) return;
      ctx.refs.copyBtn.textContent = I18n.t('varCond.clip.copy');
      ctx.refs.copyBtn.classList.remove('is-done');
    }

    function copyCondition() {
      const condition = ctx.state && ConditionRules.plainCondition(ctx.state.working);
      if (!condition) return;
      clipboard = condition;
      syncClipboardButtons();
      resetCopyLabel();
      ctx.refs.copyBtn.textContent = I18n.t('varCond.clip.copied');
      ctx.refs.copyBtn.classList.add('is-done');
      ctx.refs.clipStatus.textContent = I18n.t('varCond.clip.copiedStatus');
      ctx.copiedFlashTimer = setTimeout(resetCopyLabel, 1600);
    }

    // Remplace les règles ET la combinaison (toutes / au moins une) de la fenêtre ; Annuler abandonne.
    function pasteCondition() {
      if (!ctx.state || !clipboard) return;
      ctx.state.working = ConditionRules.plainCondition(clipboard);
      ctx.redraw();
      ctx.refs.clipStatus.textContent = I18n.t(ctx.texts().pasted);
    }

    return { copyCondition, pasteCondition, syncClipboardButtons, resetCopyLabel };
  }

  // === Coller sur une pastille choisie === (demande du 26/11 : « si on la copie et qu'on va sur une autre bulle de condition et qu'on colle, ça prend les éléments de condition »)
  // Le presse-papiers du système, celui de Ctrl+C : le HTML d'un nœud copié porte sa condition (`data-condition`), que le collage relit. Une copie faite dans un autre document
  // vaut donc autant qu'une copie du même document. Le texte, le « Sinon afficher » et le « Avant » / « Après » de la cible ne bougent pas.
  let host = { status: () => {} }; // `status(texte, erreur)` : le coin d'état de la page (js/main.js)

  // Le seul nœud à condition de la tranche collée : copié seul, il arrive nu (une pastille dans la ligne, un bloc entier), ou seul dans son paragraphe quand l'endroit où l'on colle
  // veut un bloc. Un texte, deux nœuds, un tableau, une liste : null, le collage reste celui de toujours.
  function soleConditionNode(slice) {
    let fragment = slice && slice.content;
    while (fragment && fragment.childCount === 1) {
      const child = fragment.firstChild;
      if (TEXTS[child.type.name]) return child;
      if (child.type.name !== 'paragraph') return null;
      fragment = child.content;
    }
    return null;
  }

  // Le nœud à condition CHOISI (une sélection de nœud : un clic sur la pastille, sur l'étiquette « Si … » du bloc, sur la case ou sur l'image), pas un curseur dans son texte.
  function chosenNode(selection) {
    return selection && selection.node && TEXTS[selection.node.type.name] ? selection.node : null;
  }

  // Vrai quand le collage est pris : une pastille à condition est choisie, la copie est une pastille ou un bloc à condition, et cette condition a au moins une règle complète. Sinon
  // faux et le collage suit son cours (la copie remplace la sélection, comme avant). Une seule transaction : un Ctrl+Z défait.
  function pasteOver(view, slice) {
    const target = view && slice && chosenNode(view.state.selection);
    const source = target && soleConditionNode(slice);
    const condition = source && ConditionRules.plainCondition(source.attrs.condition);
    if (!condition) return false;
    const summary = conditionSummary(condition);
    const current = ConditionRules.plainCondition(target.attrs.condition);
    if (current && JSON.stringify(current) === JSON.stringify(condition)) {
      host.status(I18n.t('varCond.paste.same'));
      return true;
    }
    const { selection } = view.state;
    const tr = view.state.tr.setNodeMarkup(selection.from, undefined, Object.assign({}, target.attrs, { condition }));
    // Le nœud est remplacé : la sélection de nœud se repose dessus, sinon le curseur retombe dans le texte et la barre se ferme.
    tr.setSelection(selection.constructor.create(tr.doc, selection.from));
    view.dispatch(tr);
    host.status(I18n.t('varCond.paste.done', { summary }));
    return true;
  }

  return { create, clear() { clipboard = null; }, pasteOver, setHost(given) { host = Object.assign({ status: () => {} }, given); } };
})();
