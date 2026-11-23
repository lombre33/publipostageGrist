// L'email d'un document : un document ou une grille peut avoir pour compagnon UN modèle d'email (le courrier et l'email qui l'accompagne), et le bouton à côté de l'étoile (js/main-email-link.js) passe de l'un à
// l'autre en un clic. Le lien s'écrit dans la ligne du document (colonne LinkedEmail, jeton de l'email : Templates.setLinkedEmail) ; l'email n'a rien à lui : il retrouve ses documents en cherchant ceux qui portent son
// jeton, si bien qu'un seul geste règle les deux sens et qu'un email peut servir à plusieurs documents (demande du 23/11 : « dans 90 % des cas un document = un email », les autres cas existent).
// Ce module ne dessine rien : il lit le lien (emailOf, documentsOf), liste ce qui peut être choisi (emails, documents) et pose ou retire le lien (set) en le rangeant dans l'historique d'Annuler et de Rétablir (js/action-history.js).
//   EmailLink.canLink(modèle)          vrai pour un document ou une grille (les seuls à se lier) ; EmailLink.isEmail(modèle) pour un modèle d'email
//   EmailLink.emailOf(document)        l'email lié à ce document ou à cette grille, null sans lien ou quand l'email n'existe plus (cf. isDangling)
//   EmailLink.documentsOf(email)       les documents et les grilles liés à cet email, par ordre alphabétique
//   EmailLink.isDangling(document)     vrai quand le document garde le jeton d'un email qui n'existe plus : l'écran le dit, le lien reste tant qu'on ne le retire pas
//   EmailLink.emails() / documents()   tout ce qui peut être choisi, par ordre alphabétique
//   EmailLink.set(documentId, emailId) pose le lien (emailId null : le retire) ; rend vrai quand quelque chose a été écrit ; le geste se défait par Ctrl + Z
//   EmailLink.CHANGED                  l'évènement (sur `document`) que set pose après chaque écriture, y compris celle d'Annuler et de Rétablir : l'écran du bouton et celui de Réglages se redessinent
const EmailLink = (function () {
  const LINKABLE = ['document', 'grille'];
  const CHANGED = 'pp:emailLinkChanged';
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  const typeOf = tpl => (tpl && tpl.typeModele) || 'document';
  const canLink = tpl => !!tpl && LINKABLE.indexOf(typeOf(tpl)) !== -1;
  const isEmail = tpl => !!tpl && typeOf(tpl) === 'email';
  const byName = (a, b) => collator.compare(String(a.nom || ''), String(b.nom || ''));
  const same = (a, b) => (a == null ? b == null : b != null && String(a) === String(b));

  function emailOf(doc) {
    if (!canLink(doc) || !doc.emailLie) return null;
    return Templates.getCached().find(t => isEmail(t) && t.jeton === doc.emailLie) || null;
  }

  function isDangling(doc) {
    return canLink(doc) && !!doc.emailLie && !emailOf(doc);
  }

  function documentsOf(email) {
    if (!isEmail(email) || !email.jeton) return [];
    return Templates.getCached().filter(t => canLink(t) && t.emailLie === email.jeton).sort(byName);
  }

  const emails = () => Templates.getCached().filter(isEmail).sort(byName);
  const documents = () => Templates.getCached().filter(canLink).sort(byName);

  function announce() { document.dispatchEvent(new CustomEvent(CHANGED)); }

  // Ce que dit le coin d'état d'un lien posé ou retiré (`doc` : le document ; `email` : l'email, null pour un lien retiré).
  function saidFor(doc, email) {
    return email ? I18n.t('status.emailLinked', { email: email.nom, name: doc.nom }) : I18n.t('status.emailUnlinked', { name: doc.nom });
  }

  // Le lien du document `docId` est passé de `from` à `to` (numéros d'email, null : aucun) : l'action de l'historique de Ctrl + Z. Défaire le rend à `from`, rétablir le pose de nouveau sur `to`. Si le lien n'est plus ce que l'action
  // avait laissé - une autre personne l'a changé depuis -, ou si le document ou l'email est parti, rien n'est écrit et le coin d'état le dit : le geste de l'autre n'est pas écrasé.
  function action(docId, from, to) {
    async function put(target, expected) {
      const doc = Templates.byId(docId);
      if (!doc) throw ActionHistory.conflict(I18n.t('emailLink.history.documentGone'));
      const now = emailOf(doc);
      if (!same(now ? now.id : null, expected)) throw ActionHistory.conflict(I18n.t('emailLink.history.changed', { name: doc.nom }));
      const email = target == null ? null : Templates.byId(target);
      if (target != null && !isEmail(email)) throw ActionHistory.conflict(I18n.t('emailLink.history.emailGone'));
      await Templates.setLinkedEmail(docId, target);
      announce();
      return saidFor(doc, email);
    }
    return { undo: () => put(from, to), redo: () => put(to, from) };
  }

  // Pose le lien (ou le retire : emailId null). Rend faux, sans rien écrire, quand le lien est déjà celui-là ; lève l'erreur de Templates.setLinkedEmail (rien d'écrit) sinon : l'appelant le dit.
  async function set(docId, emailId) {
    const doc = Templates.byId(docId);
    if (!canLink(doc)) throw new Error('Seul un document ou une grille se lie à un email.');
    const before = emailOf(doc);
    const wanted = emailId == null || emailId === '' ? null : Templates.byId(emailId);
    if (emailId != null && emailId !== '' && !isEmail(wanted)) throw new Error('Email introuvable : rien n’a été lié.');
    const unchanged = same(before ? before.id : null, wanted ? wanted.id : null);
    if (unchanged && !isDangling(doc)) return false;
    await Templates.setLinkedEmail(doc.id, wanted ? wanted.id : null);
    announce();
    // Retirer le jeton d'un email disparu ne change rien de ce que la personne voit : aucun pas dans l'historique.
    if (!unchanged) ActionHistory.add(action(doc.id, before ? before.id : null, wanted ? wanted.id : null));
    return true;
  }

  return { canLink, isEmail, emailOf, documentsOf, isDangling, emails, documents, set, saidFor, CHANGED };
})();
