// La fenêtre « Renvoi » (ligne « Renvoi… » du menu « Lien et blocs de contenu », double clic sur un renvoi) : le titre ou le signet que le renvoi vise, et ce qu'il écrit - le texte du
// titre, son numéro, ou les deux. Chaque choix montre déjà ce qu'il écrirait, avec le titre choisi : la personne voit son renvoi avant de le poser. Un titre qu'aucun lien ne visait reçoit
// son adresse en même temps (js/anchors.js:idFor, comme pour « Lien… > Dans ce document »). Entrée valide, Échap annule. Le renvoi lui-même, son texte tenu à jour et ses exports :
// js/cross-refs.js. Le cadre, les notes et la liste avec recherche sont ceux de la fenêtre du lien (css/link-dialog.css, js/search-select.js).
const CrossRefDialog = (function () {
  const el = Dom.el;

  let win = null;
  let refs = null;
  let ctx = null; // { ref } : le renvoi qu'on modifie ({ node, pos }), ou null pour un renvoi neuf
  let found = null; // { headings, bookmarks, style } : ce que le document propose (CrossRefs.choices) ; relu à l'ouverture et à la validation

  function searchableTargets(select) {
    try { return SearchSelect.attachTargets(select, { labelledBy: 'pp-xref-target-label' }); }
    catch (e) { console.warn('[CrossRefDialog] recherche de titre indisponible, liste native conservée', e); return null; }
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), la sélection y est restée.
    win = ModalBase.create({ id: 'pp-xref-modal', titleId: 'pp-xref-title', size: 'sm', boxClass: 'pp-link-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const targetLabel = el('label', 'pp-dialog-label');
    targetLabel.id = 'pp-xref-target-label';
    targetLabel.htmlFor = 'pp-xref-target';
    const target = el('select', 'pp-dialog-input');
    target.id = 'pp-xref-target';
    target.setAttribute('aria-describedby', 'pp-xref-target-hint pp-xref-error');
    const hint = el('p', 'pp-link-note');
    hint.id = 'pp-xref-target-hint';
    const error = el('p', 'pp-link-note pp-link-error');
    error.id = 'pp-xref-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    // Ce que le renvoi écrit : trois vraies cases d'option (les flèches, Tab et le grisage sont ceux du navigateur), chacune avec son exemple.
    const modes = el('fieldset', 'pp-xref-modes');
    const legend = el('legend', 'pp-dialog-label');
    modes.appendChild(legend);
    const boxes = {};
    CrossRefs.MODES.forEach(value => {
      const label = el('label', 'pp-xref-mode');
      const input = el('input');
      input.type = 'radio';
      input.name = 'pp-xref-mode';
      input.value = value;
      const name = el('span', 'pp-xref-mode-name');
      const example = el('span', 'pp-xref-mode-example');
      label.append(input, name, example);
      modes.appendChild(label);
      boxes[value] = { label, input, name, example };
    });
    const note = el('p', 'pp-link-note');
    win.body.append(targetLabel, target, hint, error, modes, note);
    const { cancel, ok } = win.addButtons();
    refs = { targetLabel, target, hint, error, legend, boxes, note, cancel, ok, targetList: searchableTargets(target) };

    target.addEventListener('change', () => { clearError(); syncModes(); });
    modes.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      ok.click();
    });
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
  }

  function closeWindow() {
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  function clearError() {
    refs.error.hidden = true;
    refs.error.textContent = '';
    refs.target.removeAttribute('aria-invalid');
  }

  function showError(key) {
    refs.error.textContent = I18n.t(key);
    refs.error.hidden = false;
    refs.target.setAttribute('aria-invalid', 'true');
    refs.target.focus();
  }

  // Le titre ou le signet que la liste montre choisi : { id, claim, entry } ({ text, number, heading } : ce que le renvoi en écrirait), ou null. `claim` : l'adresse qu'un titre sans signet reçoit
  // avec le renvoi.
  function chosen(editor, value) {
    if (!value || !found) return null;
    if (value.indexOf('a:') === 0) {
      const id = value.slice(2);
      const entry = CrossRefs.targetsOf(editor.state.doc).get(id);
      return entry ? { id, claim: null, entry } : null;
    }
    const heading = found.headings[parseInt(value.slice(2), 10)];
    if (!heading) return null;
    const entry = { heading: true, text: heading.text, number: heading.number };
    if (heading.id) return { id: heading.id, claim: null, entry };
    const id = Anchors.idFor(editor, heading.pos);
    return { id, claim: { pos: heading.pos, id }, entry };
  }

  // Les trois choix d'après le titre choisi : l'exemple de chacun écrit avec ce titre ; le numéro est grisé, sa raison en info-bulle, quand il n'y en a pas à montrer (titres non numérotés, signet d'un
  // paragraphe), sans exemple à montrer non plus ; sans titre choisi, les exemples sont vides.
  function syncModes() {
    const { target, boxes, legend } = refs;
    const editor = EditorCore.getEditor();
    const pick = editor ? chosen(editor, target.value) : null;
    const entry = pick ? pick.entry : null;
    legend.textContent = I18n.t('crossRef.show.label');
    let current = CrossRefs.MODES.find(mode => boxes[mode].input.checked) || CrossRefs.DEFAULT_MODE;
    if (entry && !entry.number && current !== CrossRefs.DEFAULT_MODE) current = CrossRefs.DEFAULT_MODE;
    CrossRefs.MODES.forEach(mode => {
      const box = boxes[mode];
      const unavailable = !!entry && mode !== 'text' && !entry.number;
      box.name.textContent = I18n.t(mode === 'text' && entry && !entry.heading ? 'crossRef.mode.textBookmark' : 'crossRef.mode.' + mode);
      box.example.textContent = entry && !unavailable ? '« ' + (CrossRefs.labelFor(entry, mode) || '') + ' »' : '';
      box.input.disabled = unavailable;
      box.label.classList.toggle('pp-xref-mode-off', unavailable);
      if (unavailable) box.label.title = I18n.t(entry.heading ? 'crossRef.number.noNumbering' : 'crossRef.number.notHeading'); else box.label.removeAttribute('title');
      box.input.checked = mode === current;
    });
  }

  // La liste : les titres (« 2.a Conditions générales », comme le sommaire les écrit) puis les signets ; `selectedId` : l'adresse du renvoi qu'on modifie.
  function fillTargets(editor, selectedId) {
    const { target, targetLabel, hint, targetList } = refs;
    found = CrossRefs.choices(editor);
    const { headings, bookmarks, style } = found;
    targetLabel.textContent = I18n.t('hyperlink.target.label');
    target.textContent = '';
    const placeholder = Dom.option('', I18n.t('hyperlink.target.placeholder'));
    placeholder.disabled = true;
    target.appendChild(placeholder);
    const group = (labelKey, entries, valueOf, textOf, hintOf) => {
      if (!entries.length) return;
      const optgroup = el('optgroup');
      optgroup.label = I18n.t(labelKey);
      entries.forEach((entry, index) => {
        const opt = Dom.option(valueOf(entry, index), textOf(entry));
        opt.dataset.name = textOf(entry);
        const note = hintOf(entry);
        if (note) opt.dataset.hint = note;
        optgroup.appendChild(opt);
      });
      target.appendChild(optgroup);
    };
    group('hyperlink.target.headings', headings, (entry, index) => 'h:' + index, entry => (entry.number ? entry.number + ' ' + entry.text : entry.text), entry => I18n.t('hyperlink.target.level', { n: entry.level }));
    group('hyperlink.target.bookmarks', bookmarks, entry => 'a:' + entry.id, entry => entry.name, entry => entry.snippet);
    let selected = '';
    if (selectedId) {
      const rank = headings.findIndex(entry => entry.id === selectedId);
      if (rank >= 0) selected = 'h:' + rank;
      else if (bookmarks.some(entry => entry.id === selectedId)) selected = 'a:' + selectedId;
    }
    target.value = selected;
    const any = headings.length + bookmarks.length > 0;
    target.disabled = !any;
    hint.textContent = I18n.t(!any ? 'hyperlink.target.none' : selectedId && !selected ? 'hyperlink.target.missing' : 'crossRef.target.hint');
    if (targetList) targetList.sync();
    return style;
  }

  // Ouvre la fenêtre sur le renvoi sélectionné (on le modifie) ou au curseur (on en pose un) ; faux, sans rien ouvrir, quand un renvoi n'a pas de sens ici.
  function open() {
    const editor = EditorCore.getEditor();
    const status = CrossRefs.status(editor, MainToolbar.isEmailMode() ? 'crossRef.email' : null);
    if (status.locked) return false;
    ensure();
    ctx = { ref: status.ref };
    const { target, boxes, note, cancel, ok } = refs;
    win.title.textContent = I18n.t(ctx.ref ? 'crossRef.title.edit' : 'crossRef.title.new');
    clearError();
    fillTargets(editor, ctx.ref ? ctx.ref.node.attrs.target : null);
    CrossRefs.MODES.forEach(mode => { boxes[mode].input.checked = mode === (ctx.ref ? CrossRefs.modeOf(ctx.ref.node.attrs.mode) : CrossRefs.DEFAULT_MODE); });
    syncModes();
    note.textContent = I18n.t('crossRef.note', { key: LinkDialog.modKey() });
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(ctx.ref ? 'common.confirm' : 'common.insert');
    win.show(target);
    return true;
  }

  function apply() {
    const editor = EditorCore.getEditor();
    if (!editor) { closeWindow(); return; }
    // Relu au moment de valider : le document a pu changer depuis l'ouverture (écriture en direct).
    found = CrossRefs.choices(editor);
    const value = refs.target.value;
    if (!value) { showError('crossRef.error.noTarget'); return; }
    const pick = chosen(editor, value);
    if (!pick) { showError('hyperlink.target.missing'); return; }
    const mode = (CrossRefs.MODES.find(name => refs.boxes[name].input.checked) || CrossRefs.DEFAULT_MODE);
    closeWindow();
    CrossRefs.put(editor, { id: pick.id, mode: pick.entry.number ? mode : CrossRefs.DEFAULT_MODE, claim: pick.claim });
  }

  return { open };
})();
