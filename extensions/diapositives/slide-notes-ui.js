// La fenêtre « Notes… » d'une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10 à 18:35 : la parité avec PowerPoint, « notes de l'intervenant »). La ligne « Notes… »
// du menu ⋯ d'une miniature (extensions/diapositives/slide-strip.js) ouvre cette fenêtre pour la diapositive visée : les notes se rédigent une diapositive à la fois (la ligne est grisée quand plusieurs
// miniatures sont choisies). Le socle (js/slide-props.js) garde les notes dans le texte de la diapositive, avec sa transition et son fond ; ce fichier ne fait que les proposer et les poser.
//  - Un BROUILLON : le texte se tape sans rien écrire dans le modèle. « Appliquer » (ou Ctrl+Entrée, Cmd+Entrée) pose les notes sur la diapositive (UN pas d'historique), « Annuler » (ou Échap) ne
//    change rien. Un compteur dit les caractères tapés sur NOTES_MAX, que le champ n'accepte pas de dépasser. Des notes vidées (ou faites de blancs) retirent les notes.
//  - Le clavier : le champ a le clavier à l'ouverture, le curseur à la fin du texte ; Entrée fait un retour à la ligne ; Tab passe aux boutons.
// Styles : extensions/diapositives/slide-notes.css.
const SlideNotesUi = (function () {
  const el = Dom.el;

  let win = null;
  let refs = null;
  let state = null;                 // { index, original, onClose } : ce que la fenêtre règle ; `original` : les notes d'avant

  const editor = () => EditorCore.getEditor();
  const number = n => Number(n).toLocaleString(I18n.getLang());

  // La fenêtre
  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-slide-notes', titleId: 'pp-slide-notes-title', size: 'md', boxClass: 'pp-slide-notes-box', actionsClass: 'var-modal-actions', restoreFocus: false, onEscape: close });
    const intro = el('p', 'pp-slide-notes-intro', I18n.t('slides.notes.intro'));
    intro.id = 'pp-slide-notes-intro';
    win.box.setAttribute('aria-describedby', intro.id);
    const label = el('label', 'pp-slide-notes-label', I18n.t('slides.notes.label'));
    label.htmlFor = 'pp-slide-notes-field';
    const field = el('textarea', 'pp-slide-notes-field');
    field.id = 'pp-slide-notes-field';
    field.maxLength = SlideProps.NOTES_MAX;
    field.placeholder = I18n.t('slides.notes.placeholder');
    field.spellcheck = true;
    field.lang = I18n.getLang();
    const foot = el('div', 'pp-slide-notes-foot');
    foot.id = 'pp-slide-notes-foot';
    const count = el('span', 'pp-slide-notes-count');
    const hint = el('span', 'pp-slide-notes-hint', I18n.t('slides.notes.hint'));
    foot.append(count, hint);
    field.setAttribute('aria-describedby', foot.id);
    win.body.append(intro, label, field, foot);

    const { cancel, ok } = win.addButtons();
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('slides.notes.apply');
    cancel.addEventListener('click', close);
    ok.addEventListener('click', commit);

    field.addEventListener('input', render);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); commit(); }
    });
    refs = { field, count };
  }
  function render() {
    refs.count.textContent = I18n.t('slides.notes.count', { n: number(refs.field.value.length), max: number(SlideProps.NOTES_MAX) });
  }

  // Ouvre la fenêtre pour la diapositive `indexes[0]` (son rang dans le texte de l'éditeur). `onClose` : rend le clavier à qui l'avait (la miniature, l'éditeur).
  function open(indexes, onClose) {
    const ed = editor();
    if (!ed || !indexes || indexes.length !== 1) return;
    ensure();
    const index = indexes[0];
    const original = SlideProps.notesOf(ed.state.doc)[index] || '';
    state = { index, original, onClose };
    win.title.textContent = I18n.t('slides.notes.title', { n: index + 1 });
    refs.field.value = original;
    render();
    win.show(refs.field);
    refs.field.setSelectionRange(original.length, original.length);
    refs.field.scrollTop = refs.field.scrollHeight;
  }
  function close() {
    if (!win || !win.isOpen()) return;
    const finished = state;
    state = null;
    win.hide();
    if (finished && finished.onClose) finished.onClose();
  }
  // Pose le brouillon sur la diapositive de la fenêtre.
  function commit() {
    const ed = editor();
    if (!state || !ed) { close(); return; }
    const { index } = state;
    const text = refs.field.value;
    const kept = SlideProps.normalized({ notes: text }).notes;
    const changed = SlideProps.applyNotes(ed, [index], text);
    close();
    // -1 : l'éditeur a refusé (une diapositive bloquée par son lien) et la ligne d'état dit déjà pourquoi.
    if (changed < 0) return;
    if (!changed) SlidesEntry.status(I18n.t('slides.notes.unchanged'));
    else SlidesEntry.status(I18n.t(kept ? 'slides.notes.applied' : 'slides.notes.removed', { n: index + 1 }));
  }

  return { open, close, isOpen: () => !!win && win.isOpen() };
})();
