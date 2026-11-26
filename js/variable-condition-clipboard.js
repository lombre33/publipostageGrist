// Fenêtre « Condition d'affichage », Copier / Coller : le presse-papier interne (le même pour toutes les fenêtres) et les boutons qui le servent. `create(ctx)` : les gestes d'UNE
// fenêtre, qui lisent et posent son état par `ctx` (js/variable-condition.js:createWindow). Façade : js/variable-condition.js.
const VariableConditionClipboard = (function () {
  const { conditionSummary } = VariableConditionData;

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

  return { create, clear() { clipboard = null; } };
})();
