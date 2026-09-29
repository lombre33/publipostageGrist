// Saisies et confirmations du widget : deux fenêtres en remplacement de window.prompt et window.confirm (choix d'Antoine, 2026-09-29 « Saisies et
// confirmations »). Elles reposent sur la base commune (js/modal-base.js) : titre et boutons fixes, Tab et Échap tenus dans la fenêtre, rendu du thème.
//   Dialogs.prompt({ title, label?, message?, value?, placeholder?, confirmLabel? })  -> Promise<string | null>   (null : annulé ; '' : champ laissé vide)
//   Dialogs.confirm({ title, message, confirmLabel?, danger? })                       -> Promise<boolean>
// Ne s'appelle qu'avec `await` : la fenêtre n'arrête plus le script comme le faisait la boîte du navigateur. Une seule fenêtre existe, réutilisée : une demande
// qui arrive pendant qu'une autre est ouverte annule la première (elle se résout comme un clic sur Annuler). Aucun texte ici sauf les deux boutons par défaut
// (« Annuler », « Valider ») : le titre, le libellé et le verbe du bouton sont ceux de l'appelant, dans la langue de l'interface.
// Clavier : Entrée valide depuis le champ (pas pendant une composition de texte), Échap annule, Tab tourne entre le champ et les deux boutons. Le focus arrive
// sur le champ (texte sélectionné) ou sur « Valider » ; pour une confirmation destructrice (`danger`), sur « Annuler », pour qu'une frappe d'Entrée distraite ne
// supprime rien. À la fermeture le focus revient à l'élément qui l'avait à l'ouverture (le bouton de la barre, la ligne de la fenêtre dessous).
const Dialogs = (function () {
  let win = null;
  let refs = null;
  let current = null; // demande en cours : { finish(value), cancelValue }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-dialog-modal', titleId: 'pp-dialog-title', size: 'sm', boxClass: 'pp-dialog-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(current.cancelValue); },
    });
    const message = el('p', 'pp-dialog-message');
    message.id = 'pp-dialog-message';
    const label = el('label', 'pp-dialog-label');
    label.id = 'pp-dialog-input-label';
    label.htmlFor = 'pp-dialog-input';
    const input = el('input', 'pp-dialog-input');
    input.id = 'pp-dialog-input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    win.body.append(message, label, input);
    const spacer = el('span', 'var-modal-spacer');
    const cancel = el('button');
    cancel.type = 'button';
    const ok = el('button', 'var-modal-primary');
    ok.type = 'button';
    win.actions.append(spacer, cancel, ok);
    refs = { message, label, input, cancel, ok };
  }

  function ask(opts, isPrompt) {
    ensure();
    if (current) current.finish(current.cancelValue);
    return new Promise(resolve => {
      const { message, label, input, cancel, ok } = refs;
      const cancelValue = isPrompt ? null : false;
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        current = null;
        win.hide();
        resolve(value);
      };
      current = { finish, cancelValue };
      win.title.textContent = opts.title || '';
      message.textContent = opts.message || '';
      message.hidden = !opts.message;
      label.textContent = opts.label || '';
      label.hidden = !isPrompt || !opts.label;
      input.hidden = !isPrompt;
      input.value = isPrompt && opts.value != null ? String(opts.value) : '';
      input.placeholder = opts.placeholder || '';
      // Le champ est nommé par son libellé, sinon par le titre ; la fenêtre est décrite par le message quand il y en a un.
      input.setAttribute('aria-labelledby', opts.label ? 'pp-dialog-input-label' : 'pp-dialog-title');
      if (opts.message) win.box.setAttribute('aria-describedby', 'pp-dialog-message');
      else win.box.removeAttribute('aria-describedby');
      cancel.textContent = opts.cancelLabel || I18n.t('common.cancel');
      ok.textContent = opts.confirmLabel || I18n.t('common.confirm');
      cancel.onclick = () => finish(cancelValue);
      ok.onclick = () => finish(isPrompt ? input.value : true);
      input.onkeydown = event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        ok.click();
      };
      win.show(isPrompt ? input : (opts.danger ? cancel : ok));
      if (isPrompt) input.select();
    });
  }

  return {
    prompt: opts => ask(opts || {}, true),
    confirm: opts => ask(opts || {}, false),
  };
})();
