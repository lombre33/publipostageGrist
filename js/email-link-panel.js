// Réglages > Email > « Email lié à ce document » : là où se règle le lien entre un document (ou une grille) et son email (js/email-link.js). Deux écrans, selon ce qui est ouvert :
//  - un document ou une grille : une liste des emails du document Grist, « Aucun » compris ; le choix se pose à l'instant (Ctrl + Z le défait) ;
//  - un email : les documents qui renvoient à lui, chacun avec « Retirer », et une liste pour en lier un de plus - sans quitter l'email qu'on vient d'écrire. Un document n'a qu'un email : le lier ici le retire de celui qu'il avait.
// Rien ne disparaît, on grise, et le grisé dit pourquoi (consigne 088 de GFS) : le contrôle reste là, une phrase dessous donne la raison - un document pas encore enregistré, un type qui ne se lie pas (macro-modèle, présentation),
// aucun email enregistré, la lecture seule. Relu à l'ouverture de Réglages et à chaque changement du lien ou des droits.
//   EmailLinkPanel.wire() -> branche la section (après Settings.wireSettingsModal) ; EmailLinkPanel.render() la redessine
const EmailLinkPanel = (function () {
  const el = Dom.el;
  const byId = id => document.getElementById(id);

  const isReadOnly = () => (typeof AccessRights !== 'undefined' && AccessRights.get().readOnly) || GristAPI.isDocumentReadOnly();
  const STALE = '__gone__';

  // Le modèle ouvert tel que le montre la liste des documents : null pour un document jamais enregistré.
  function openTemplate() {
    const id = Templates.getCurrentId();
    return id != null ? Templates.byId(id) || null : null;
  }

  // Une seule lecture de l'état, que le dessin, les phrases et les gestes partagent : { mode, why }, `why` la phrase du grisé ('' : rien n'est grisé), `mode` ce que l'écran montre (document | email | none).
  function state() {
    const open = openTemplate();
    const locked = isReadOnly();
    const lockedText = I18n.t('settings.viewTemplate.locked');
    if (!open) return { open, mode: 'none', why: I18n.t('emailLink.reason.unsaved'), locked };
    if (EmailLink.isEmail(open)) {
      const none = EmailLink.documents().length === 0;
      return { open, mode: 'email', locked, why: locked ? lockedText : (none ? I18n.t('emailLink.reason.noDocument') : '') };
    }
    if (EmailLink.canLink(open)) {
      const none = EmailLink.emails().length === 0;
      return { open, mode: 'document', locked, why: locked ? lockedText : (none ? I18n.t('emailLink.reason.noEmail') : '') };
    }
    return { open, mode: 'none', why: I18n.t('emailLink.reason.type'), locked };
  }

  async function apply(docId, emailId) {
    try {
      const changed = await EmailLink.set(docId, emailId);
      if (changed) {
        const doc = Templates.byId(docId);
        const email = emailId == null ? null : Templates.byId(emailId);
        if (doc) setStatus(EmailLink.saidFor(doc, email));
      }
    } catch (e) {
      console.error('[EmailLinkPanel] lien non enregistré', e);
      setStatus(I18n.t('status.emailLinkError'), true);
    }
    render();
  }

  // Le coin d'état de la page (js/main.js le donne par `wire`).
  let setStatus = () => {};

  function fillDocumentSelect(select, open) {
    select.textContent = '';
    select.append(Dom.option('', I18n.t('emailLink.select.none')));
    const linked = EmailLink.emailOf(open);
    if (EmailLink.isDangling(open)) select.append(Dom.option(STALE, I18n.t('emailLink.select.gone')));
    EmailLink.emails().forEach(email => select.append(Dom.option(String(email.id), email.nom)));
    select.value = linked ? String(linked.id) : (EmailLink.isDangling(open) ? STALE : '');
  }

  function fillEmailList(list, open) {
    list.textContent = '';
    EmailLink.documentsOf(open).forEach(doc => {
      const item = el('li', 'settings-emaillink-item');
      const name = el('span', 'settings-emaillink-name', doc.nom);
      name.title = doc.nom;
      const remove = Dom.button('settings-emaillink-remove', I18n.t('emailLink.remove'));
      remove.setAttribute('aria-label', I18n.t('emailLink.remove.aria', { name: doc.nom }));
      remove.dataset.documentId = String(doc.id);
      item.append(name, remove);
      list.append(item);
    });
  }

  function fillAddSelect(select, open) {
    select.textContent = '';
    select.append(Dom.option('', I18n.t('emailLink.add.placeholder')));
    // Les documents qui ne sont pas déjà liés à cet email ; un document qui a un autre email le garde dit, le lier ici le lui retire.
    EmailLink.documents().filter(doc => { const current = EmailLink.emailOf(doc); return !(current && String(current.id) === String(open.id)); })
      .forEach(doc => {
        const current = EmailLink.emailOf(doc);
        select.append(Dom.option(String(doc.id), current ? I18n.t('emailLink.add.option', { name: doc.nom, email: current.nom }) : doc.nom));
      });
    select.value = '';
  }

  function render() {
    const section = byId('settings-emaillink-section');
    if (!section) return;
    const now = state();
    const open = now.open;
    const chooseBlock = byId('settings-emaillink-choose');
    const emailBlock = byId('settings-emaillink-docs-block');
    const select = byId('settings-emaillink-select');
    const list = byId('settings-emaillink-list');
    const add = byId('settings-emaillink-add');
    const reason = byId('settings-emaillink-reason');
    const empty = byId('settings-emaillink-empty');
    const title = byId('settings-emaillink-title');
    const intro = byId('settings-emaillink-intro');
    const inGrid = !!open && open.typeModele === 'grille';
    title.textContent = I18n.t(now.mode === 'email' ? 'emailLink.title.email' : inGrid ? 'emailLink.title.grid' : 'emailLink.title.document');
    intro.textContent = I18n.t(now.mode === 'email' ? 'emailLink.intro.email' : 'emailLink.intro.document');
    // Les deux blocs restent dans la page ; seul celui du modèle ouvert se montre. Hors de tout type qui se lie, aucun : la phrase dit pourquoi.
    chooseBlock.hidden = now.mode !== 'document';
    emailBlock.hidden = now.mode !== 'email';
    if (now.mode === 'document') {
      fillDocumentSelect(select, open);
      select.disabled = !!now.why;
    }
    if (now.mode === 'email') {
      fillEmailList(list, open);
      empty.hidden = list.children.length > 0;
      fillAddSelect(add, open);
      add.disabled = !!now.why;
      list.querySelectorAll('button').forEach(button => { button.disabled = now.locked; });
    }
    reason.textContent = now.why;
    reason.hidden = !now.why;
    // Un email lié qui n'existe plus : l'écran le dit sous la liste, le choix « Email supprimé » le garde tant qu'on ne le change pas.
    const gone = byId('settings-emaillink-gone');
    if (gone) gone.hidden = !(now.mode === 'document' && EmailLink.isDangling(open));
  }

  function wire(options) {
    if (options && options.setStatus) setStatus = options.setStatus;
    const select = byId('settings-emaillink-select');
    const add = byId('settings-emaillink-add');
    const list = byId('settings-emaillink-list');
    if (!select || !add || !list) return;
    select.addEventListener('change', () => {
      const open = openTemplate();
      if (!open || !EmailLink.canLink(open) || select.value === STALE) return;
      apply(open.id, select.value === '' ? null : select.value);
    });
    add.addEventListener('change', () => {
      const open = openTemplate();
      if (!open || !EmailLink.isEmail(open) || add.value === '') return;
      apply(add.value, open.id);
    });
    list.addEventListener('click', event => {
      const button = event.target.closest && event.target.closest('button[data-document-id]');
      if (button && !button.disabled) apply(button.dataset.documentId, null);
    });
    // Relu à chaque ouverture de Réglages : le modèle ouvert, la liste des emails et les droits ont pu changer depuis.
    const openBtn = byId('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', render);
    document.addEventListener(EmailLink.CHANGED, render);
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(render);
    render();
  }

  return { wire, render };
})();
