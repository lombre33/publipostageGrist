// Le bouton « email lié » de la rangée du nom du document, à côté de l'étoile (js/email-link.js) : un document ou une grille y mène en UN clic à son email, l'email y ramène à son document. Demande du 23/11 : « dans 90 % des cas un document = un
// email, donc un seul clic pour ce cas-là, et deux clics si on veut choisir un autre modèle ». Le bouton a donc deux gestes, comme Enregistrer (js/main-save.js) :
//  - son clic va au compagnon : l'email lié d'un document ou d'une grille ; pour un email, le document d'où l'on vient (le clic qui l'a ouvert), sinon son document quand il n'en a qu'un ;
//  - son menu au survol (un `.v2-hover-group`, comme tous les boutons à menu, css/editor-v2.css) liste ce qui peut s'ouvrir : les emails depuis un document (le lié en premier, marqué), les documents depuis un email, et « Choisir l'email lié… » qui
//    ouvre Réglages > Email. Choisir une ligne ouvre ce modèle ; elle ne change pas le lien (il se règle dans Réglages).
// Sans compagnon (aucun lien, un email pour plusieurs documents sans origine), le clic mène à Réglages > Email ou le dit dans le coin d'état : le menu au survol reste le chemin pour choisir. Aucune ligne de Grist ne change : l'autre modèle
// s'ouvre avec la même ligne sélectionnée. Un document pas encore enregistré, une présentation ou un macro-modèle ne se lient pas : le bouton est grisé et dit pourquoi (js/lock-reasons.js, cause « state »).
// Comme tout modèle qui s'ouvre, l'autre passe par la liste des modèles : la question « Enregistrer / Abandonner / Annuler » est posée à un document qui a des modifications en attente, et « Annuler » le garde à l'écran.
// L'origine (le document d'où l'on vient) est oubliée dès qu'un modèle s'ouvre autrement que par ce bouton (`forgetOriginUnless`, appelée par loadTemplateIntoEditor de js/main.js).
const MainEmailLink = (function () {
  function create(api) {
    const { onTemplateSelectChange, refreshTemplateList, setStatus, templateSelect } = api;
    const el = Dom.el;
    const same = (a, b) => (a == null ? b == null : b != null && String(a) === String(b));

    const byId = id => document.getElementById(id);
    // { from, to } : le modèle d'où le bouton vient d'ouvrir `to`, null sinon. Une seule origine : un nouveau saut la remplace.
    let origin = null;

    function openTemplate() {
      const id = Templates.getCurrentId();
      return id == null ? null : Templates.byId(id) || null;
    }

    // Ce que le bouton fait pour le modèle ouvert : { mode, open, target, reason }. `mode` : 'document' (document ou grille : le bouton va à l'email), 'email' (le bouton va au document) ou 'none' (grisé, `reason` dit pourquoi) ;
    // `target` : le compagnon quand il n'y en a qu'un, null sinon.
    function describe() {
      const open = openTemplate();
      if (!open) return { mode: 'none', open: null, target: null, reason: I18n.t('emailLink.button.unsaved') };
      // Le document s'est ouvert avant la fin de la lecture de la liste (js/early-open.js) : l'e-mail qu'il a pour compagnon n'est pas encore dans le cache. Grisé un instant, la liste complète le rallume (js/main.js:onTemplatesCompleted).
      if (!Templates.isComplete()) return { mode: 'none', open, target: null, reason: I18n.t('lock.listLoading') };
      if (EmailLink.canLink(open)) return { mode: 'document', open, target: EmailLink.emailOf(open) };
      if (EmailLink.isEmail(open)) {
        const came = origin && same(origin.to, open.id) ? Templates.byId(origin.from) : null;
        if (came && EmailLink.canLink(came)) return { mode: 'email', open, target: came };
        const documents = EmailLink.documentsOf(open);
        return { mode: 'email', open, target: documents.length === 1 ? documents[0] : null, several: documents.length > 1 };
      }
      return { mode: 'none', open, target: null, reason: I18n.t('emailLink.button.type') };
    }

    // Un modèle d'un type que le widget ne sait pas ouvrir, ou qui a disparu de la liste : l'ouverture refuse (js/main.js:keepOpenTemplate le dit).
    function hasOption(id) { return Array.from(templateSelect.options).some(option => option.value === String(id)); }

    // Ouvre le modèle `id` par le chemin de la liste des modèles. true : il est à l'écran ; false : non (introuvable, ou « Annuler » à la question d'enregistrement).
    async function openTemplateById(id) {
      const from = Templates.getCurrentId();
      if (same(from, id)) return true;
      // La liste ne montre pas encore un modèle créé ailleurs depuis son dernier passage : choisir une valeur absente ouvrirait un document vierge. Elle est relue d'abord.
      if (!hasOption(id)) await refreshTemplateList();
      if (!Templates.openableById(id) || !hasOption(id)) { setStatus(I18n.t('emailLink.status.gone'), true); return false; }
      templateSelect.value = String(id);
      await onTemplateSelectChange();
      if (!Templates.isCurrent(id)) return false;
      origin = from == null ? null : { from, to: Templates.getCurrentId() };
      sync();
      return true;
    }

    function openSettings() {
      const openBtn = byId('v2-btn-settings');
      const tab = document.querySelector('[data-settings-tab="mailClient"]');
      if (openBtn) openBtn.click();
      if (tab) tab.click();
    }

    // Le clic du bouton : le compagnon quand il y en a un, sinon la suite que dit la raison (régler le lien, choisir dans le menu).
    async function onButton() {
      const now = describe();
      if (now.mode === 'none') return;
      if (now.target) { await openTemplateById(now.target.id); return; }
      if (now.mode === 'email' && now.several) { setStatus(I18n.t('emailLink.status.several')); return; }
      openSettings();
    }

    function labelOf(now) {
      if (now.mode === 'none') return now.reason;
      if (now.mode === 'document') return now.target ? I18n.t('emailLink.button.toEmail', { name: now.target.nom }) : I18n.t('emailLink.button.chooseEmail');
      return now.target ? I18n.t('emailLink.button.toDocument', { name: now.target.nom }) : I18n.t(now.several ? 'emailLink.button.chooseDocument' : 'emailLink.button.noDocument');
    }

    // Les lignes du menu : ce qui peut s'ouvrir, le compagnon (ou les documents liés) d'abord et marqué. Redessinées à chaque synchro et à chaque entrée du survol ou du focus : le menu est à jour au moment où il s'ouvre.
    function row(text, className) {
      const node = el('span', 'v2-hover-row' + (className ? ' ' + className : ''), text);
      node.setAttribute('role', 'menuitem');
      node.tabIndex = 0;
      return node;
    }

    function menuRows(now) {
      const rows = [];
      const label = el('span', 'v2-hover-flyout-label', I18n.t(now.mode === 'email' ? 'emailLink.menu.documents' : 'emailLink.menu.emails'));
      label.id = 'v2-linked-email-label';
      rows.push(label);
      const linked = now.mode === 'email' ? EmailLink.documentsOf(now.open) : (now.target ? [now.target] : []);
      const linkedIds = new Set(linked.map(t => String(t.id)));
      const others = (now.mode === 'email' ? EmailLink.documents() : EmailLink.emails()).filter(t => !linkedIds.has(String(t.id)) && !same(t.id, now.open.id));
      linked.concat(others).forEach(t => {
        const item = row(t.nom, linkedIds.has(String(t.id)) ? 'is-active' : '');
        item.dataset.templateId = String(t.id);
        if (linkedIds.has(String(t.id))) item.setAttribute('aria-current', 'true');
        item.title = t.nom;
        rows.push(item);
      });
      if (linked.length + others.length === 0) {
        const empty = row(I18n.t(now.mode === 'email' ? 'emailLink.menu.noDocument' : 'emailLink.menu.noEmail'), 'v2-hover-row-disabled');
        empty.setAttribute('aria-disabled', 'true');
        empty.tabIndex = -1;
        rows.push(empty);
      }
      const sep = el('span', 'v2-hover-hsep');
      const settings = row(I18n.t(now.mode === 'email' ? 'emailLink.menu.linkDocument' : 'emailLink.menu.chooseEmail'), '');
      settings.dataset.action = 'settings';
      rows.push(sep, settings);
      return rows;
    }

    // Une signature de ce que le menu montre : il n'est redessiné que s'il change (le focus d'une ligne ne se perd pas à chaque synchro).
    let drawn = '';
    function drawMenu() {
      const flyout = byId('v2-linked-email-flyout');
      if (!flyout) return;
      const now = describe();
      if (now.mode === 'none') { flyout.textContent = ''; drawn = ''; return; }
      const signature = JSON.stringify([I18n.getLang(), now.mode, now.open.id, now.target ? now.target.id : null, Templates.getCached().map(t => [t.id, t.nom, t.typeModele, t.jeton, t.emailLie])]);
      if (signature === drawn) return;
      drawn = signature;
      flyout.textContent = '';
      flyout.append(...menuRows(now));
    }

    function sync() {
      const btn = byId('btn-linked-email');
      if (!btn) return;
      const now = describe();
      const reason = now.mode === 'none' ? now.reason : '';
      btn.classList.toggle('is-to-email', now.mode === 'document');
      btn.classList.toggle('is-to-document', now.mode === 'email');
      btn.classList.toggle('has-target', !!now.target);
      const label = labelOf(now);
      btn.setAttribute('aria-label', label);
      // Grisé, jamais masqué : un bouton `disabled` ne reçoit pas le clic, le grisé doux de js/lock-reasons.js le garde atteignable et dit pourquoi (même traitement que l'étoile, js/main.js:syncDefaultTemplateButton).
      btn.disabled = !!reason;
      LockReasons.set(btn, 'state', reason, 'emailLink');
      drawMenu();
    }

    function forgetOriginUnless(tpl) {
      if (!origin || (tpl && same(tpl.id, origin.to))) return;
      origin = null;
    }

    // Une ligne du menu : un modèle à ouvrir, ou « Choisir l'email lié… ». Les lignes sont des <span tabindex="0">, comme celles du menu Enregistrer : ni la souris ni la touche ne prennent le focus au texte.
    function wireMenu() {
      const group = byId('v2-linked-email-group');
      const flyout = byId('v2-linked-email-flyout');
      if (!group || !flyout) return;
      const act = target => {
        const item = target.closest && target.closest('.v2-hover-row');
        if (!item || item.getAttribute('aria-disabled') === 'true') return;
        if (item.dataset.action === 'settings') { openSettings(); return; }
        if (item.dataset.templateId) openTemplateById(item.dataset.templateId);
      };
      flyout.addEventListener('mousedown', event => event.preventDefault());
      flyout.addEventListener('click', event => act(event.target));
      flyout.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        act(event.target);
      });
      group.addEventListener('mouseenter', drawMenu);
      group.addEventListener('focusin', drawMenu);
    }

    function wire() {
      const btn = byId('btn-linked-email');
      if (!btn) return;
      btn.addEventListener('click', onButton);
      wireMenu();
      document.addEventListener(EmailLink.CHANGED, sync);
      sync();
    }

    return { forgetOriginUnless, sync, wire, openTemplateById, describe };
  }

  return { create };
})();
