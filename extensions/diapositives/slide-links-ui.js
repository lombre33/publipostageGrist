// Les diapositives liées, côté interface (extension « diapositives » de Grist Factory Suite ; demande du 21/10, « Réutiliser », sa troisième fonction). Le socle (js/slide-links.js)
// garde le repère caché, la synchro, l'envoi et les garde-fous ; ce fichier s'y branche (SlideLinks.wire) et porte ce que la personne voit :
//  - « DEMANDER » (carte du 21/10) : une diapositive a changé ici et dans l'autre présentation depuis la dernière synchro, dans les deux sens. Une fenêtre montre les deux versions en
//    miniatures, côte à côte, et la personne choisit : « Garder celle d'ici » (elle part à l'autre présentation avec l'enregistrement qui suit), « Prendre l'autre » (un Ctrl+Z la
//    rend), ou « Plus tard » (rien ne bouge ; sa pastille le rappelle, et « Comparer les deux versions », dans son menu ⋯, rouvre la fenêtre). Plusieurs désaccords à la fois se
//    suivent, une fenêtre après l'autre. Ouverte pendant la frappe, la fenêtre ne prend aucune touche pour un choix : le clavier y arrive sur son cadre.
//  - Les lignes du lien du menu ⋯ d'une miniature (extensions/diapositives/slide-strip.js les montre) : le sens (« Dans les deux sens », « Suit la source », « Envoie à la source »),
//    « Comparer les deux versions », « Détacher » ; le coin d'état dit ce qui est fait.
//  - L'extension éteinte par GFS : la synchro du socle continue, un désaccord se dit sur la ligne d'état au lieu de la fenêtre.
// Styles : extensions/diapositives/slide-import.css (la fenêtre reprend les miniatures du volet).
const SlideLinksUi = (function () {
  const el = Dom.el;
  const THUMB_WIDTH_PX = 200;      // la largeur de chacune des deux miniatures de la fenêtre ; leur hauteur suit la page

  let win = null;
  let refs = null;                 // { message, here, there, hereLabel, thereLabel, keep, later, take }
  let queue = [];                  // les désaccords à montrer, dans l'ordre où ils sont arrivés : [{ index }]
  let shownFor = null;             // celui que la fenêtre montre : { index, incoming } (`incoming` : une version arrivée ici, adopt)

  const editor = () => EditorCore.getEditor();
  // Pourquoi un geste sur un lien ne se fait pas maintenant (le suivi des modifications, l'écriture en direct), ou ''.
  function blocked() {
    const reason = SlideLinks.blockedReason();
    return reason ? I18n.t(reason) : '';
  }
  // La note des lignes du lien du menu ⋯ (SlideLinks.infoAt) : à quoi la diapositive est liée.
  function noteOf(info) {
    if (info.kind === 'source') return info.name ? I18n.t('slides.menu.lockNote', { name: info.name }) : I18n.t('slides.menu.incomingNote');
    if (info.missing) return I18n.t('slides.menu.linkMissing');
    return I18n.t('slides.menu.linkNote', { name: info.name });
  }

  // La fenêtre « Demander »
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-link-ask', titleId: 'pp-slide-link-ask-title', size: 'md', boxClass: 'pp-slide-link-ask-box', actionsClass: 'var-modal-actions', onEscape: () => decide('later') });
    win.title.textContent = I18n.t('slides.link.ask.title');
    const message = el('p', 'pp-slide-link-ask-message');
    message.id = 'pp-slide-link-ask-message';
    win.box.setAttribute('aria-describedby', message.id);
    const pair = el('div', 'pp-slide-link-ask-pair');
    const side = (cls) => {
      const figure = el('figure', 'pp-slide-link-ask-side ' + cls);
      const label = el('figcaption');
      const host = el('div', 'pp-slide-link-ask-thumb');
      figure.append(label, host);
      pair.appendChild(figure);
      return { label, host };
    };
    const here = side('pp-slide-link-ask-here');
    const there = side('pp-slide-link-ask-there');
    win.body.append(message, pair);
    const { first, cancel, ok } = win.addButtons('pp-slide-link-ask-keep');
    first.textContent = I18n.t('slides.link.ask.keep');
    cancel.textContent = I18n.t('slides.link.ask.later');
    ok.textContent = I18n.t('slides.link.ask.take');
    first.addEventListener('click', () => decide('here'));
    cancel.addEventListener('click', () => decide('later'));
    ok.addEventListener('click', () => decide('there'));
    refs = { message, here: here.host, there: there.host, hereLabel: here.label, thereLabel: there.label };
  }

  // Les désaccords que le socle vient de trouver (`conflicts` : [{ index, incoming? }], les rangs des diapositives dans le texte de l'éditeur) : ils attendent leur tour, la fenêtre
  // montre le premier. L'extension éteinte : la ligne d'état dit le premier.
  function ask(conflicts) {
    if (!conflicts || !conflicts.length) return;
    if (SlideStrip.isOff()) {
      const first = conflicts[0];
      const versions = SlideLinks.versionsAt(editor(), first.index);
      SlidesEntry.status(versions && !versions.incoming ? I18n.t('slides.link.differs', { n: first.index + 1, name: versions.name }) : I18n.t('slides.link.differsHere', { n: first.index + 1 }));
      return;
    }
    conflicts.forEach((c) => { if (!queue.some(q => q.index === c.index) && !(shownFor && shownFor.index === c.index)) queue.push({ index: c.index }); });
    if (!shownFor) next();
  }
  // Le désaccord suivant qui en est encore un (le texte a pu changer depuis : une diapositive d'accord n'a plus rien à demander), ou la fenêtre se ferme.
  function next() {
    const current = editor();
    while (queue.length) {
      const item = queue.shift();
      const versions = current && SlideLinks.versionsAt(current, item.index);
      if (!versions) continue;
      shownFor = { index: item.index, incoming: !!versions.incoming };
      render(item.index, versions);
      return;
    }
    shownFor = null;
    if (win) win.hide();
  }
  function render(index, versions) {
    ensure();
    const n = index + 1;
    refs.message.textContent = versions.incoming ? I18n.t('slides.link.ask.messageHere', { n }) : I18n.t('slides.link.ask.message', { n, name: versions.name });
    refs.hereLabel.textContent = I18n.t('slides.link.ask.here');
    refs.thereLabel.textContent = versions.incoming ? I18n.t('slides.link.ask.thereIncoming') : I18n.t('slides.link.ask.there', { name: versions.name });
    // Le cadre a le clavier, pas un bouton : une frappe qui continue ne choisit rien.
    win.show(win.box);
    SlideImport.paint(refs.here, versions.here, THUMB_WIDTH_PX);
    SlideImport.paint(refs.there, versions.there, THUMB_WIDTH_PX);
  }
  // Le choix de la personne : 'here', 'there' ou 'later' ; puis le désaccord suivant.
  function decide(choice) {
    const item = shownFor;
    if (!item) { if (win) win.hide(); return; }
    if (choice !== 'later') {
      const why = blocked();
      if (why) { SlidesEntry.status(why, true); return; }
      SlideLinks.resolve(editor(), item.index, choice);
      if (choice === 'there') SlidesEntry.status(I18n.t('slides.link.taken', { n: item.index + 1 }));
      else SlidesEntry.status(I18n.t(item.incoming ? 'slides.link.keptHere' : 'slides.link.kept', { n: item.index + 1 }));
    }
    next();
  }

  // Les lignes du lien du menu ⋯ de la diapositive `index` (slide-strip.js:onMenuAction ; grisées, elles n'arrivent pas ici).
  function act(action, index) {
    const current = editor();
    if (!current) return;
    const n = index + 1;
    const modes = { linkBoth: 'both', linkPull: 'pull', linkPush: 'push' };
    if (modes[action]) {
      if (SlideLinks.setMode(current, index, modes[action])) SlidesEntry.status(I18n.t('slides.link.mode', { n, mode: I18n.t('slides.menu.' + action) }));
    } else if (action === 'linkCompare') {
      if (SlideLinks.versionsAt(current, index)) ask([{ index }]);
      else SlidesEntry.status(I18n.t('slides.link.same', { n }));
    } else if (action === 'linkDetach') {
      if (SlideLinks.detach(current, index)) SlidesEntry.status(I18n.t('slides.link.detached', { n }));
    }
  }

  SlideLinks.wire({ ask, settle: indexes => SlideStrip.settleLinked(indexes), changed: () => SlideStrip.syncLinks() });

  return { ask, act, noteOf, blocked };
})();
