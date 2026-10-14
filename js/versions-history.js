// Fenêtre « Historique des versions… » du menu du bouton Enregistrer : les versions que js/versions-store.js a gardées d'un modèle, la plus récente d'abord, avec
// à droite l'aperçu de celle qu'on a choisie et « Restaurer cette version ». Chargée au premier clic seulement (balise inerte d'index.html, VersionsStore.loadWindow).
//
// La liste commence par « Version actuelle » (l'état du modèle tel que Grist le garde : rien à restaurer), puis une ligne par version : sa date et sa personne. La table
// des versions est lue à l'ouverture de cette fenêtre, jamais avant (VersionsStore.open) ; chaque version n'est décompressée qu'au moment où on la choisit. Un document,
// un e-mail ou une grille montre son texte sur une feuille (les images d'un autre site restent bloquées jusqu'au clic « Afficher », comme partout), un e-mail y ajoute son
// objet et ses destinataires, un macro-modèle sa composition.
//
// « Comparer » (bouton à gauche, éteint à chaque ouverture) montre la version choisie avec, en vert, ce qu'elle a en plus de la version actuelle et, en rouge barré, ce que la version actuelle
// a en plus d'elle (ce qu'une restauration retirerait) : le texte du document, l'objet et les destinataires d'un e-mail, les lignes de la composition d'un macro-modèle. Le calcul est dans
// js/versions-compare.js, chargé au premier clic sur « Comparer » (VersionsStore.loadCompare) ; la restauration, elle, reprend toujours l'état gardé tel qu'il est, jamais la feuille marquée.
//
// « Nommer… » (à côté de « Comparer ») donne un nom à la version choisie, que les plafonds n'effacent alors plus : le nom actuel est proposé, un champ laissé vide le retire. Sur « Version actuelle »,
// l'état enregistré que l'aperçu montre est gardé sous ce nom, en version de plus : ce qui n'est pas encore enregistré n'en fait pas partie.
//
// La fenêtre n'écrit rien elle-même : « Restaurer cette version » demande confirmation puis passe l'état choisi à `restore` (js/main.js : enregistrer ce que l'écran
// montre, Templates.restoreVersion, recharger l'éditeur), « Nommer… » passe à `nameVersion` (js/main.js : les droits, puis VersionsStore). Une version dont les données ne se lisent pas
// (format inconnu, cellule abîmée à la main) le dit et ne se restaure pas ni ne se nomme.
const VersionsHistory = (function () {
  const el = Dom.el;

  let win = null;
  let refs = null;
  let session = null; // le modèle ouvert : { id, name, restore, nameVersion, rows, states, selected, busy, naming, loading, compare }
  let openSeq = 0;    // monte à chaque ouverture et fermeture : une lecture qui revient après n'écrit plus dans la fenêtre
  let previewSeq = 0; // monte à chaque version choisie (ou comparaison allumée ou éteinte) : un aperçu qui revient après un autre choix est ignoré

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
    // Le nombre de différences et la légende des couleurs, tant que « Comparer » est allumé.
    const note = el('div', 'pp-versions-note');
    note.setAttribute('role', 'status');
    note.hidden = true;
    const noteText = el('span', 'pp-versions-note-text');
    const keyAdded = el('ins', 'pp-versions-added pp-versions-key');
    const keyRemoved = el('del', 'pp-versions-removed pp-versions-key');
    note.append(noteText, keyAdded, keyRemoved);
    const status = el('p', 'pp-versions-status');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const paper = el('div', 'pp-versions-paper');
    const extra = el('div', 'pp-versions-extra');
    const sheet = el('div', 'v2-page-sheet pp-versions-sheet');
    const tiptap = el('div', 'tiptap pp-versions-tiptap');
    sheet.appendChild(tiptap);
    paper.append(extra, sheet);
    main.append(head, note, status, paper);

    win.body.append(side, main);
    const { first: compare, cancel, ok } = win.addButtons('pp-versions-compare');
    const nameButton = Dom.button('pp-versions-name');
    compare.after(nameButton);
    // Les libellés qui ne changent pas s'écrivent ici, une fois, dans la langue de la page (changer de langue recharge la page) ; seuls le titre (le nom du modèle) et le texte du
    // bouton principal (« Restaurer » / « Restauration… ») varient d'une ouverture ou d'un moment à l'autre.
    listLabel.textContent = I18n.t('versions.list.label');
    empty.textContent = I18n.t('versions.empty');
    cancel.textContent = I18n.t('common.close');
    const labels = { restore: I18n.t('versions.restore'), restoring: I18n.t('versions.restoring') };
    ok.textContent = labels.restore;
    compare.textContent = I18n.t('versions.compare');
    compare.title = I18n.t('versions.compare.hint');
    compare.setAttribute('aria-pressed', 'false');
    nameButton.textContent = I18n.t('versions.name');
    nameButton.title = I18n.t('versions.name.hint');
    keyAdded.textContent = I18n.t('versions.compare.keyAdded');
    keyRemoved.textContent = I18n.t('versions.compare.keyRemoved');
    refs = { listLabel, listHost, empty, headWhen, headWho, headTag, note, noteText, keyAdded, keyRemoved, status, paper, extra, sheet, tiptap, compare, nameButton, cancel, ok, labels, list: null };

    cancel.addEventListener('click', close);
    ok.addEventListener('click', restoreSelected);
    compare.addEventListener('click', toggleCompare);
    nameButton.addEventListener('click', nameSelected);
  }

  function close() {
    openSeq++;
    previewSeq++;
    session = null;
    if (win) win.hide();
  }

  // Les boutons d'après l'état : « Restaurer » demande une version lisible choisie, et attend la fin d'une lecture ou d'une restauration.
  function render() {
    const { ok, compare, nameButton } = refs;
    const row = session && selectedRow();
    // Une version se restaure, et se compare, une fois lue : pendant qu'elle se décompresse (quelques instants), les boutons attendent. « Comparer » reste allumé ou éteint d'une version à l'autre,
    // grisé sur « Version actuelle » (rien à comparer à elle-même).
    ok.disabled = !session || session.busy || session.naming || session.loading || !row || row.current || row.unreadable || !session.states.has(row.value);
    compare.disabled = ok.disabled;
    // « Nommer… » vaut aussi pour « Version actuelle », et n'attend pas que la version soit décompressée : un nom ne la lit pas.
    nameButton.disabled = !session || session.busy || session.naming || session.loading || !row || row.unreadable;
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
    refs.note.hidden = true;
    status.hidden = true;
    status.textContent = '';
  }

  function say(key) {
    const { status } = refs;
    status.textContent = I18n.t(key);
    status.hidden = false;
  }

  // Une ligne « Objet : … » : l'intitulé (un texte déjà écrit) puis sa valeur : un texte, ou, en comparaison, des morceaux [{ kind: 'same' | 'added' | 'removed', text }] dont ce qui diffère est marqué.
  function line(label, value) {
    const p = el('p', 'pp-versions-line');
    p.append(el('strong', null, I18n.t('versions.preview.label', { label }) + ' '));
    if (Array.isArray(value)) value.forEach(part => p.append(part.kind === 'same' ? document.createTextNode(part.text) : marked(part)));
    else p.append(document.createTextNode(value));
    return p;
  }

  // Un morceau de texte de comparaison qui diffère : <ins> (la version seule l'a) ou <del> (la version actuelle seule l'a), de la classe que css/versions-history.css colore.
  function marked(part) {
    return part.kind === 'added' ? el('ins', 'pp-versions-added', part.text) : el('del', 'pp-versions-removed', part.text);
  }

  // Le nombre de différences d'une suite de morceaux : ce qui est retiré puis ajouté d'affilée (un mot remplacé) n'en fait qu'une.
  function groupsOf(parts) {
    let n = 0;
    let inside = false;
    parts.forEach(part => {
      const changed = part.kind !== 'same';
      if (changed && !inside) n++;
      inside = changed;
    });
    return n;
  }

  // Les noms des modèles d'une position de macro-modèle, séparés par des virgules ; « modèle supprimé » pour un modèle qui n'existe plus.
  function slotText(slot) {
    const ids = typeof MacroTemplates !== 'undefined' ? MacroTemplates.slotModelIds(slot) : [];
    if (!ids.length) return '—';
    return ids.map(id => { const tpl = Templates.byId(id); return tpl ? tpl.nom : I18n.t('versions.preview.modelGone'); }).join(', ');
  }

  // Les positions d'un macro-modèle, dans l'ordre : [{ cover, value }], `cover` pour une page de garde, `value` les noms de ses modèles.
  function macroEntries(state) {
    let slots = [];
    try { const parsed = JSON.parse(state.contenu); slots = parsed && Array.isArray(parsed.slots) ? parsed.slots : []; } catch (e) { slots = []; }
    return slots.map(slot => ({ cover: !!slot && slot.type === 'fixed', value: slotText(slot) }));
  }

  // L'état d'une version dans la feuille : le texte d'un document, d'une grille ou d'un e-mail (avec son objet et ses destinataires), la composition d'un macro-modèle. `compare` ({ base : l'état
  // actuel, result : le texte comparé par VersionsCompare.compareHtml, absent pour un macro-modèle }) marque ce qui diffère de la version actuelle. Rend { changes, formatOnly, skipped }.
  function renderState(state, compare) {
    const { tiptap, extra } = refs;
    const summary = { changes: 0, formatOnly: 0, skipped: 0 };
    clearPreview();
    refs.paper.scrollTop = 0;
    if (state.typeModele === 'macro') {
      const mine = macroEntries(state);
      let lines = mine.map(entry => ({ kind: 'same', cover: entry.cover, value: entry.value }));
      if (compare) {
        // Une position se reconnaît à son genre et à ses modèles, jamais à son numéro : retirer la première annexe ne change pas les suivantes.
        const key = entry => (entry.cover ? 'C' : 'A') + entry.value;
        lines = VersionsCompare.compareLines(macroEntries(compare.base).map(key), mine.map(key)).map(item => ({ kind: item.kind, cover: item.text.charAt(0) === 'C', value: item.text.slice(1) }));
        summary.changes = groupsOf(lines);
      }
      if (!lines.length) extra.appendChild(el('p', 'pp-versions-line', I18n.t('versions.preview.macroEmpty')));
      // Le numéro d'une annexe est son rang dans la composition qui la porte : la version, ou la version actuelle pour ce que seule elle a.
      let annexOfVersion = 0;
      let annexOfCurrent = 0;
      lines.forEach(item => {
        if (!item.cover) {
          if (item.kind !== 'removed') annexOfVersion++;
          if (item.kind !== 'added') annexOfCurrent++;
        }
        const label = I18n.t(item.cover ? 'macro.modal.coverLabel' : 'macro.modal.annexeLabel', { n: item.kind === 'removed' ? annexOfCurrent : annexOfVersion });
        extra.appendChild(line(label, item.kind === 'same' ? item.value : [{ kind: item.kind, text: item.value }]));
      });
      extra.hidden = false;
      refs.sheet.hidden = true;
      return summary;
    }
    if (state.typeModele === 'email') {
      [['versions.preview.subject', 'objet'], ['versions.preview.to', 'destinataires'], ['versions.preview.cc', 'cc'], ['versions.preview.bcc', 'cci']].forEach(([key, prop]) => {
        const mine = state[prop] || '';
        if (!compare) { if (mine) extra.appendChild(line(I18n.t(key), mine)); return; }
        const theirs = compare.base[prop] || '';
        if (!mine && !theirs) return;
        const parts = VersionsCompare.compareText(theirs, mine);
        summary.changes += groupsOf(parts);
        extra.appendChild(line(I18n.t(key), parts));
      });
      extra.hidden = !extra.childNodes.length;
    }
    let html = state.contenu;
    if (compare && compare.result) {
      html = compare.result.html;
      summary.changes += compare.result.changes;
      summary.formatOnly = compare.result.formatOnly;
      summary.skipped = compare.result.skipped;
    }
    // Un aperçu s'affiche : une image d'un autre site y prend son cadre « Afficher » (le modèle enregistré garde son HTML).
    tiptap.innerHTML = ExternalImages.block(HtmlSanitize.clean(html), { zoom: 1 });
    // Une image de pièce jointe ne garde que son identifiant : son adresse (un jeton qui expire) est demandée à Grist.
    Promise.resolve(GristAPI.hydrateAttachmentImages(tiptap)).catch(() => {});
    return summary;
  }

  // Au-dessus de la feuille : le texte (le nombre de différences, ou pourquoi il n'y a rien à comparer) et, quand il y a des différences, la légende des deux couleurs.
  function showNote(text, withKey) {
    const { note, noteText, keyAdded, keyRemoved } = refs;
    noteText.textContent = text;
    keyAdded.hidden = !withKey;
    keyRemoved.hidden = !withKey;
    note.hidden = false;
  }

  function showSummary(summary) {
    let text;
    if (summary.changes) text = I18n.t('versions.compare.count', { n: summary.changes });
    else if (summary.formatOnly) text = I18n.t('versions.compare.formatOnly', { n: summary.formatOnly });
    else text = I18n.t('versions.compare.none');
    if (summary.skipped) text += ' · ' + I18n.t('versions.compare.partial', { n: summary.skipped });
    showNote(text, summary.changes > 0);
  }

  // Amène la première différence dans le quart haut de l'aperçu (sans faire défiler la page : seul l'aperçu bouge).
  function revealFirstChange() {
    const { paper } = refs;
    const mark = paper.querySelector('ins.pp-versions-added, del.pp-versions-removed');
    paper.scrollTop = 0;
    if (!mark) return;
    const delta = mark.getBoundingClientRect().top - paper.getBoundingClientRect().top - paper.clientHeight / 4;
    if (delta > 0) paper.scrollTop = delta;
  }

  // La feuille de la version choisie : son texte, ou, « Comparer » allumé, ce qu'elle a de plus et de moins que la version actuelle. Un échec de la comparaison montre la version telle quelle,
  // le dit, et éteint « Comparer » (le geste suivant réessaie).
  async function present(row, state, seq) {
    if (!session.compare || row.current) { renderState(state, null); return; }
    const base = session.rows[0].state;
    if (base.typeModele !== state.typeModele) { renderState(state, null); showNote(I18n.t('versions.compare.otherType'), false); return; }
    try {
      await VersionsStore.loadCompare();
      const result = state.typeModele === 'macro' ? null : await VersionsCompare.compareHtml(base.contenu, state.contenu);
      if (seq !== previewSeq || !session) return;
      showSummary(renderState(state, { base, result }));
      revealFirstChange();
    } catch (e) {
      console.warn('[versions] comparaison impossible', e);
      if (seq !== previewSeq || !session) return;
      session.compare = false;
      refs.compare.setAttribute('aria-pressed', 'false');
      renderState(state, null);
      say('versions.compare.error');
    }
  }

  // La version choisie dans la liste.
  async function pick(value) {
    if (!session) return;
    session.selected = value;
    refs.list.check(value);
    await showSelected();
  }

  // La version choisie : sa ligne en tête de l'aperçu, puis son contenu (décompressé à ce moment-là), comparé à la version actuelle quand « Comparer » est allumé.
  async function showSelected(keepSheet) {
    const row = selectedRow();
    if (!row) return;
    const seq = ++previewSeq;
    const who = whoOf(row.author);
    refs.headWhen.textContent = row.current ? I18n.t('versions.current') + ' · ' + whenText(row.at) : (row.entry.name ? row.entry.name + ' · ' : '') + whenText(row.at);
    refs.headWho.textContent = ' · ' + who.text;
    refs.headWho.title = who.title;
    refs.headTag.textContent = row.kind === 'restauration' ? ' · ' + I18n.t('versions.kind.restore') : '';
    // « Comparer » allumé ou éteint sur la même version : la feuille reste à l'écran le temps que la nouvelle se prépare (le premier clic charge le module).
    if (!keepSheet) clearPreview();
    render();
    if (row.current) { renderState(row.state, null); return; }
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
    render();
    await present(row, state, seq);
  }

  // « Comparer » : allume ou éteint la comparaison de la version choisie avec la version actuelle.
  async function toggleCompare() {
    if (!session || refs.compare.disabled) return;
    session.compare = !session.compare;
    refs.compare.setAttribute('aria-pressed', session.compare ? 'true' : 'false');
    await showSelected(true);
  }

  // « Restaurer cette version » : la question dit ce qui est remplacé et que l'état actuel reste dans la liste ; puis `restore` fait le travail. Un échec se dit dans la
  // fenêtre, qui reste ouverte.
  async function restoreSelected() {
    const row = session && selectedRow();
    if (!row || row.current || row.unreadable || session.busy || session.naming || session.loading) return;
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

  // « Nommer… » : demande le nom de la version choisie (celui qu'elle porte déjà est proposé ; un champ laissé vide le retire, ce qui n'a pas de sens pour une version sans nom : rien n'est alors
  // écrit) puis l'écrit. Une version gardée prend son nom sur place ; « Version actuelle » garde l'état que l'aperçu montre en version de plus, et la liste est relue pour la montrer. Un échec
  // se dit dans la fenêtre, qui reste ouverte.
  async function nameSelected() {
    const row = session && selectedRow();
    if (!row || row.unreadable || session.busy || session.naming || session.loading) return;
    const current = session;
    const named = !row.current && !!row.entry.name;
    const asked = await Dialogs.prompt({
      title: I18n.t('versions.nameDialog.title'),
      label: I18n.t('versions.nameDialog.label'),
      message: I18n.t(named ? 'versions.nameDialog.rename' : (row.current ? 'versions.nameDialog.current' : 'versions.nameDialog.old')),
      value: named ? row.entry.name : '',
      placeholder: I18n.t('versions.nameDialog.placeholder'),
      confirmLabel: I18n.t('versions.nameDialog.ok'),
    });
    if (asked === null || session !== current || current.busy || current.naming) return;
    const label = VersionsStore.cleanName(asked);
    if (label === (named ? row.entry.name : '')) return; // rien à écrire : le même nom, ou pas de nom pour une version qui n'en avait pas
    current.naming = true;
    render();
    let failure = '';
    let added = null;
    try {
      added = await current.nameVersion(row.current ? { state: row.state, at: row.at, author: row.author } : { rowId: row.entry.rowId }, label);
      if (!row.current) row.entry.name = label;
    } catch (e) {
      console.error('[versions] nom non écrit', e);
      failure = e && e.versionsKey ? e.versionsKey : 'versions.nameError';
    }
    // La version de plus de « Version actuelle » : la liste est relue, c'est ce que Grist garde qui s'affiche (et la version nommée y est choisie).
    if (!failure && row.current) {
      try { await reload(current, added && added.rowId); } catch (e) {
        console.warn('[versions] historique non relu', e);
        failure = 'versions.readError';
      }
    }
    current.naming = false;
    if (session !== current) return;
    if (failure) { say(failure); render(); return; }
    refs.status.hidden = true;
    refs.status.textContent = '';
    if (!row.current) { buildList(); refs.list.check(current.selected); await showSelected(true); } else render();
  }

  // Les versions du modèle relues après une version de plus : la liste est refaite (les versions déjà décompressées gardent leur état), `rowId` y est choisie, à défaut la version qui l'était.
  async function reload(target, rowId) {
    const found = await VersionsStore.open(target.id);
    if (session !== target) return;
    target.rows = [target.rows[0]].concat(found.entries.map(entryRow));
    if (typeof rowId === 'number' && target.rows.some(row => row.value === String(rowId))) target.selected = String(rowId);
    else if (!selectedRow()) target.selected = 'current';
    buildList();
    refs.list.check(target.selected);
    await showSelected();
  }

  // Une ligne de la liste d'après une version lue (VersionsStore.open).
  function entryRow(entry) {
    return { value: String(entry.rowId), current: false, at: entry.at, author: entry.author, kind: entry.genre, entry, unreadable: false };
  }

  // Ouvre l'historique du modèle `id` (`name` : son nom, pour le titre). `restore(état, date)` : ce que fait « Restaurer » (js/main.js), avec la date de la version écrite en toutes lettres ;
  // une promesse qui échoue si la restauration n'a pas eu lieu (une erreur portant `versionsKey`, la clé du texte à dire dans la fenêtre). `nameVersion(cible, nom)` : ce que fait « Nommer… »
  // (js/main.js), `cible` = { rowId } (une version gardée) ou { state, at, author } (l'état enregistré montré en « Version actuelle »), `nom` déjà nettoyé, '' pour retirer le nom ; rend { rowId }
  // de la version ajoutée pour « Version actuelle », échoue comme `restore`. Faux si la fenêtre ne peut pas s'ouvrir.
  function open({ id, name, restore, nameVersion }) {
    if (typeof ModalBase === 'undefined' || typeof VersionsStore === 'undefined') return false;
    const tpl = Templates.byId(id);
    if (!tpl) return false;
    ensure();
    const seq = ++openSeq;
    previewSeq++;
    const current = {
      value: 'current', current: true, at: VersionsStore.toMs(tpl.dateModif), author: tpl.modifiePar || '', state: VersionsStore.snapshotOf(tpl), kind: '',
    };
    session = { id, name, restore, nameVersion, rows: [current], states: new Map(), selected: 'current', busy: false, naming: false, loading: true, compare: false };
    const { cancel, empty } = refs;
    refs.compare.setAttribute('aria-pressed', 'false');
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
    found.entries.forEach(entry => session.rows.push(entryRow(entry)));
    buildList();
    await pick('current');
    // Une lecture qui a échoué laisse la version actuelle seule, et le dit : ce n'est pas « aucune version ».
    if (failed) { refs.empty.hidden = true; say('versions.readError'); }
    // Le focus passe à la liste, sauf si la personne l'a déjà posé ailleurs dans la fenêtre (un Tab sur « Fermer »).
    if (seq === openSeq && win.isOpen() && document.activeElement === refs.cancel) refs.list.buttons[0].focus();
  }

  return { open };
})();
