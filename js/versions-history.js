// Fenêtre « Historique des versions… » du menu du bouton Enregistrer : les versions que js/versions-store.js a gardées d'un modèle, la plus récente d'abord, avec
// à droite l'aperçu de celle qu'on a choisie et « Restaurer cette version ». Chargée au premier clic seulement (balise inerte d'index.html, VersionsStore.loadWindow).
//
// La liste commence par « Version actuelle » (l'état du modèle tel que Grist le garde : rien à restaurer), puis une ligne par version : sa date et sa personne. La table
// des versions est lue à l'ouverture de cette fenêtre, jamais avant (VersionsStore.open) ; chaque version n'est décompressée qu'au moment où on la choisit. Un document,
// un e-mail ou une grille montre son texte sur une feuille (les images d'un autre site restent bloquées jusqu'au clic « Afficher », comme partout), un e-mail y ajoute son
// objet et ses destinataires, un macro-modèle sa composition.
//
// La fenêtre n'écrit rien elle-même : « Restaurer cette version » demande confirmation puis passe l'état choisi à `restore` (js/main.js : enregistrer ce que l'écran
// montre, Templates.restoreVersion, recharger l'éditeur). Une version dont les données ne se lisent pas (format inconnu, cellule abîmée à la main) le dit et ne se restaure pas.
const VersionsHistory = (function () {
  const el = Dom.el;

  let win = null;
  let refs = null;
  let session = null; // le modèle ouvert : { id, name, restore, rows, states, selected, busy, loading, failed }
  let openSeq = 0;    // monte à chaque ouverture et fermeture : une lecture qui revient après n'écrit plus dans la fenêtre
  let previewSeq = 0; // monte à chaque version choisie : un aperçu qui revient après un autre choix est ignoré

  // Date et heure dans la langue de la page ; « — » quand la date n'est pas connue.
  function whenText(ms) {
    if (!ms) return '—';
    try { return new Intl.DateTimeFormat(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); }
    catch (e) { return new Date(ms).toLocaleString(); }
  }

  // La personne : son nom, à défaut son adresse, à défaut « auteur inconnu » ; le libellé entier (nom et adresse) va dans l'info-bulle.
  function whoOf(label) {
    const person = VersionsStore.parseAuthor(label);
    return { text: person.name || person.email || I18n.t('versions.authorUnknown'), title: person.name && person.email ? person.name + ' <' + person.email + '>' : '' };
  }

  // Une version lisible : l'objet que VersionsStore.snapshotOf a écrit, dans un format que ce code sait lire.
  function validState(state) {
    return !!state && typeof state === 'object' && state.v === VersionsStore.FORMAT && typeof state.contenu === 'string';
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-versions-modal', titleId: 'pp-versions-title', size: 'lg', boxClass: 'pp-versions-box', actionsClass: 'var-modal-actions', onEscape: () => close() });
    win.body.classList.add('pp-versions-body');

    // La colonne de gauche : son titre et la liste (refaite à chaque ouverture, d'après les versions lues).
    const side = el('div', 'pp-versions-side');
    const listLabel = el('p', 'pp-versions-label');
    listLabel.id = 'pp-versions-list-label';
    const listHost = el('div', 'pp-versions-listhost');
    const empty = el('p', 'pp-versions-empty');
    empty.hidden = true;
    side.append(listLabel, listHost, empty);

    // La colonne de droite : de qui et de quand est la version choisie, ce qui s'y ajoute (objet et destinataires d'un e-mail, ou la composition d'un macro-modèle) et la
    // feuille.
    const main = el('div', 'pp-versions-main');
    const head = el('div', 'pp-versions-head');
    const headWhen = el('strong', 'pp-versions-head-when');
    const headWho = el('span', 'pp-versions-head-who');
    const headTag = el('span', 'pp-versions-head-tag');
    head.append(headWhen, headWho, headTag);
    const status = el('p', 'pp-versions-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const paper = el('div', 'pp-versions-paper');
    const extra = el('div', 'pp-versions-extra');
    const sheet = el('div', 'v2-page-sheet pp-versions-sheet');
    const tiptap = el('div', 'tiptap pp-versions-tiptap');
    sheet.appendChild(tiptap);
    paper.append(extra, sheet);
    main.append(head, status, paper);

    win.body.append(side, main);
    const { cancel, ok } = win.addButtons();
    // Les libellés qui ne changent pas s'écrivent ici, une fois, dans la langue de la page (changer de langue recharge la page) ; seuls le titre (le nom du modèle) et le texte du
    // bouton principal (« Restaurer » / « Restauration… ») varient d'une ouverture ou d'un moment à l'autre.
    listLabel.textContent = I18n.t('versions.list.label');
    empty.textContent = I18n.t('versions.empty');
    cancel.textContent = I18n.t('common.close');
    const labels = { restore: I18n.t('versions.restore'), restoring: I18n.t('versions.restoring') };
    ok.textContent = labels.restore;
    refs = { listLabel, listHost, empty, headWhen, headWho, headTag, status, paper, extra, sheet, tiptap, cancel, ok, labels, list: null };

    cancel.addEventListener('click', close);
    ok.addEventListener('click', restoreSelected);
  }

  function close() {
    openSeq++;
    previewSeq++;
    session = null;
    if (win) win.hide();
  }

  // Les boutons d'après l'état : « Restaurer » demande une version lisible choisie, et attend la fin d'une lecture ou d'une restauration.
  function render() {
    const { ok } = refs;
    const row = session && selectedRow();
    // Une version se restaure une fois lue : pendant qu'elle se décompresse (quelques instants), le bouton attend.
    ok.disabled = !session || session.busy || session.loading || !row || row.current || row.unreadable || !session.states.has(row.value);
    ok.textContent = refs.labels[session && session.busy ? 'restoring' : 'restore'];
  }

  function selectedRow() { return session && session.rows.find(row => row.value === session.selected); }

  // Une ligne de la liste : « Version actuelle », ou la date de la version et sa personne (et, pour celle qui précède une restauration, ce qui la distingue).
  function fillRow(button, row) {
    button.classList.add('pp-versions-row');
    const title = el('span', 'pp-versions-when', row.current ? I18n.t('versions.current') : (row.entry.name || whenText(row.at)));
    const who = whoOf(row.author);
    const by = el('span', 'pp-versions-who', row.current ? whenText(row.at) + ' · ' + who.text : (row.entry.name ? whenText(row.at) + ' · ' : '') + who.text);
    if (who.title) by.title = who.title;
    button.append(title, by);
    if (row.kind === 'restauration') button.appendChild(el('span', 'pp-versions-tag', I18n.t('versions.kind.restore')));
  }

  function buildList() {
    const { listHost, empty } = refs;
    const options = session.rows.map(row => ({ value: row.value, fill: button => fillRow(button, row) }));
    const radios = Dom.radioGroup({ className: 'pp-versions-list', labelId: 'pp-versions-list-label', options, onPick: pick, onEnter: restoreSelected });
    listHost.replaceChildren(radios.group);
    refs.list = radios;
    empty.hidden = session.rows.length > 1;
  }

  // La feuille et ses à-côtés, vidés.
  function clearPreview() {
    const { tiptap, extra, status } = refs;
    tiptap.replaceChildren();
    extra.replaceChildren();
    extra.hidden = true;
    refs.sheet.hidden = false;
    status.hidden = true;
    status.textContent = '';
  }

  function say(key) {
    const { status } = refs;
    status.textContent = I18n.t(key);
    status.hidden = false;
  }

  // Une ligne « Objet : … » : l'intitulé (une clé de texte, ou un texte déjà écrit) puis sa valeur.
  function line(label, value) {
    const p = el('p', 'pp-versions-line');
    p.append(el('strong', null, I18n.t('versions.preview.label', { label }) + ' '), document.createTextNode(value));
    return p;
  }

  // Les noms des modèles d'une position de macro-modèle, séparés par des virgules ; « modèle supprimé » pour un modèle qui n'existe plus.
  function slotText(slot) {
    const ids = typeof MacroTemplates !== 'undefined' ? MacroTemplates.slotModelIds(slot) : [];
    if (!ids.length) return '—';
    return ids.map(id => { const tpl = Templates.byId(id); return tpl ? tpl.nom : I18n.t('versions.preview.modelGone'); }).join(', ');
  }

  // L'état d'une version dans la feuille : le texte d'un document, d'une grille ou d'un e-mail (avec son objet et ses destinataires), la composition d'un macro-modèle.
  function renderState(state) {
    const { tiptap, extra } = refs;
    clearPreview();
    if (state.typeModele === 'macro') {
      let slots = [];
      try { const parsed = JSON.parse(state.contenu); slots = parsed && Array.isArray(parsed.slots) ? parsed.slots : []; } catch (e) { slots = []; }
      let annex = 0;
      if (!slots.length) extra.appendChild(el('p', 'pp-versions-line', I18n.t('versions.preview.macroEmpty')));
      slots.forEach(slot => {
        const cover = slot && slot.type === 'fixed';
        if (!cover) annex++;
        extra.appendChild(line(I18n.t(cover ? 'macro.modal.coverLabel' : 'macro.modal.annexeLabel', { n: annex }), slotText(slot)));
      });
      extra.hidden = false;
      refs.sheet.hidden = true;
      return;
    }
    if (state.typeModele === 'email') {
      if (state.objet) extra.appendChild(line(I18n.t('versions.preview.subject'), state.objet));
      if (state.destinataires) extra.appendChild(line(I18n.t('versions.preview.to'), state.destinataires));
      if (state.cc) extra.appendChild(line(I18n.t('versions.preview.cc'), state.cc));
      if (state.cci) extra.appendChild(line(I18n.t('versions.preview.bcc'), state.cci));
      extra.hidden = !extra.childNodes.length;
    }
    // Un aperçu s'affiche : une image d'un autre site y prend son cadre « Afficher » (le modèle enregistré garde son HTML).
    tiptap.innerHTML = ExternalImages.block(HtmlSanitize.clean(state.contenu), { zoom: 1 });
    // Une image de pièce jointe ne garde que son identifiant : son adresse (un jeton qui expire) est demandée à Grist.
    Promise.resolve(GristAPI.hydrateAttachmentImages(tiptap)).catch(() => {});
  }

  // La version choisie : sa ligne en tête de l'aperçu, puis son contenu (décompressé à ce moment-là).
  async function pick(value) {
    if (!session) return;
    session.selected = value;
    refs.list.check(value);
    const row = selectedRow();
    if (!row) return;
    const seq = ++previewSeq;
    const who = whoOf(row.author);
    refs.headWhen.textContent = row.current ? I18n.t('versions.current') + ' · ' + whenText(row.at) : (row.entry.name ? row.entry.name + ' · ' : '') + whenText(row.at);
    refs.headWho.textContent = ' · ' + who.text;
    refs.headWho.title = who.title;
    refs.headTag.textContent = row.kind === 'restauration' ? ' · ' + I18n.t('versions.kind.restore') : '';
    clearPreview();
    render();
    if (row.current) { renderState(row.state); return; }
    let state = session.states.get(row.value);
    if (!state && !row.unreadable) {
      try {
        state = await VersionsStore.unpack(row.entry.data);
        if (!validState(state)) throw new Error('Version illisible.');
        session.states.set(row.value, state);
      } catch (e) {
        console.warn('[versions] version illisible', e);
        row.unreadable = true;
      }
      if (seq !== previewSeq || !session) return;
    }
    if (row.unreadable) { refs.sheet.hidden = true; say('versions.unreadable'); render(); return; }
    renderState(state);
    render();
  }

  // « Restaurer cette version » : la question dit ce qui est remplacé et que l'état actuel reste dans la liste ; puis `restore` fait le travail. Un échec se dit dans la
  // fenêtre, qui reste ouverte.
  async function restoreSelected() {
    const row = session && selectedRow();
    if (!row || row.current || row.unreadable || session.busy || session.loading) return;
    const state = session.states.get(row.value);
    if (!state) return;
    const current = session;
    const who = whoOf(row.author);
    const sure = await Dialogs.confirm({
      title: I18n.t('versions.restoreConfirm.title'),
      message: I18n.t('versions.restoreConfirm.message', { when: whenText(row.at), who: who.text }),
      confirmLabel: I18n.t('versions.restoreConfirm.ok'),
    });
    if (!sure || session !== current) return;
    current.busy = true;
    render();
    let failure = '';
    try {
      await current.restore(state, whenText(row.at));
    } catch (e) {
      console.error('[versions] restauration impossible', e);
      failure = e && e.versionsKey ? e.versionsKey : 'versions.restoreError';
    }
    current.busy = false;
    if (session !== current) return;
    if (failure) { say(failure); render(); return; }
    close();
  }

  // Ouvre l'historique du modèle `id` (`name` : son nom, pour le titre). `restore(état, date)` : ce que fait « Restaurer » (js/main.js), avec la date de la version écrite en toutes lettres ;
  // une promesse qui échoue si la restauration n'a pas eu lieu (une erreur portant `versionsKey`, la clé du texte à dire dans la fenêtre). Faux si la fenêtre ne peut pas s'ouvrir.
  function open({ id, name, restore }) {
    if (typeof ModalBase === 'undefined' || typeof VersionsStore === 'undefined') return false;
    const tpl = Templates.byId(id);
    if (!tpl) return false;
    ensure();
    const seq = ++openSeq;
    previewSeq++;
    const current = {
      value: 'current', current: true, at: VersionsStore.toMs(tpl.dateModif), author: tpl.modifiePar || '', state: VersionsStore.snapshotOf(tpl), kind: '',
    };
    session = { id, name, restore, rows: [current], states: new Map(), selected: 'current', busy: false, loading: true };
    const { cancel, empty } = refs;
    win.title.textContent = I18n.t('versions.titleFor', { name: name || tpl.nom });
    refs.listHost.replaceChildren();
    empty.hidden = true;
    clearPreview();
    refs.headWhen.textContent = '';
    refs.headWho.textContent = '';
    refs.headTag.textContent = '';
    say('versions.loading');
    refs.sheet.hidden = true;
    render();
    win.show(cancel);
    load(seq);
    return true;
  }

  // La lecture des versions du modèle (VersionsStore.open) : la liste se construit à son retour, et la version actuelle est choisie.
  async function load(seq) {
    let found = { entries: [] };
    let failed = false;
    try {
      found = await VersionsStore.open(session.id);
    } catch (e) {
      console.warn('[versions] historique illisible', e);
      failed = true;
    }
    if (seq !== openSeq || !session) return;
    session.loading = false;
    found.entries.forEach(entry => {
      session.rows.push({ value: String(entry.rowId), current: false, at: entry.at, author: entry.author, kind: entry.genre, entry, unreadable: false });
    });
    buildList();
    await pick('current');
    // Une lecture qui a échoué laisse la version actuelle seule, et le dit : ce n'est pas « aucune version ».
    if (failed) { refs.empty.hidden = true; say('versions.readError'); }
    // Le focus passe à la liste, sauf si la personne l'a déjà posé ailleurs dans la fenêtre (un Tab sur « Fermer »).
    if (seq === openSeq && win.isOpen() && document.activeElement === refs.cancel) refs.list.buttons[0].focus();
  }

  return { open };
})();
