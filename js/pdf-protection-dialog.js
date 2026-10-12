// Fenêtre « PDF protégé » (js/main.js:exportRecordAs et confirmBatch, type « PDF protégé » du menu Type d'export, demande du 12/10) : pose le mot de passe pour ouvrir
// le PDF, ce que la personne qui l'ouvre peut en faire (imprimer, copier, modifier) et les propriétés du fichier (auteur, sujet, mots-clés), puis rend ces réglages à
// l'export. Elle ne fait que choisir : le chiffrement est celui de pdfmake (js/pdf-protection.js). Pour un lot (une archive ZIP), elle tient lieu de confirmation et dit
// combien de PDF partent avec ce mot de passe.
// `open` rend une promesse : les réglages de PdfProtection.normalize (mot de passe, allowPrint, allowCopy, allowModify, author, subject, keywords) ou null (Annuler, Échap).
// Le mot de passe n'est gardé NULLE PART : ni dans le navigateur, ni dans le document, ni d'une ouverture de la fenêtre à la suivante (le champ repart vide, masqué). Le
// reste est gardé par navigateur (localStorage, comme la langue et le thème) pour ce qui se répète d'un export à l'autre : les trois droits et l'auteur. Le sujet et les
// mots-clés repartent vides : ils dépendent du document. Sans rien de protégé (aucun mot de passe, les trois droits permis), le PDF serait un PDF ordinaire :
// « Exporter » reste grisé, et la phrase sous les droits dit quoi faire.
const PdfProtectionDialog = (function () {
  const STORAGE = 'pp_pdf_protection';
  const el = Dom.el;

  let win = null;
  let refs = null;
  let current = null; // { finish(valeur) } : de quoi refermer la fenêtre en rendant sa réponse

  function readSaved() {
    try { const raw = JSON.parse(localStorage.getItem(STORAGE) || 'null'); return raw && typeof raw === 'object' ? raw : null; } catch (e) { return null; }
  }
  function writeSaved(settings) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ allowPrint: settings.allowPrint, allowCopy: settings.allowCopy, allowModify: settings.allowModify, author: settings.author }));
    } catch (e) { /* stockage indisponible : le choix ne survivra pas au rechargement */ }
  }

  // Un champ de texte nommé par son libellé, posé sous lui.
  function field(id, type) {
    const label = el('label', 'pp-protect-label');
    label.htmlFor = id;
    const input = el('input', 'pp-protect-input');
    input.id = id;
    input.type = type;
    input.autocomplete = type === 'password' ? 'new-password' : 'off';
    input.spellcheck = false;
    return { label, input };
  }
  // Une case à cocher et son texte.
  function check(id) {
    const wrap = el('label', 'pp-protect-check');
    const input = el('input');
    input.type = 'checkbox';
    input.id = id;
    const text = el('span');
    wrap.append(input, text);
    return { wrap, input, text };
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-protect-modal', titleId: 'pp-protect-title', size: 'md', boxClass: 'pp-protect-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(null); else win.hide(); },
    });
    const intro = el('p', 'pp-protect-intro');
    intro.id = 'pp-protect-intro';

    const password = field('pp-protect-password', 'password');
    password.input.maxLength = PdfProtection.MAX_PASSWORD_BYTES;
    const hint = el('p', 'pp-protect-hint');
    hint.id = 'pp-protect-password-hint';
    password.input.setAttribute('aria-describedby', hint.id);
    const show = check('pp-protect-show');
    show.input.addEventListener('change', () => { password.input.type = show.input.checked ? 'text' : 'password'; });

    const rights = el('fieldset', 'pp-protect-rights');
    const legend = el('legend', 'pp-protect-label');
    const print = check('pp-protect-print');
    const copy = check('pp-protect-copy');
    const modify = check('pp-protect-modify');
    const note = el('p', 'pp-protect-hint pp-protect-note');
    note.id = 'pp-protect-rights-note';
    const nothing = el('p', 'pp-protect-warning');
    nothing.id = 'pp-protect-nothing';
    nothing.setAttribute('role', 'status');
    const checks = el('div', 'pp-protect-checks');
    checks.append(print.wrap, copy.wrap, modify.wrap);
    rights.append(legend, checks, note);
    rights.setAttribute('aria-describedby', note.id + ' ' + nothing.id);

    const props = el('details', 'pp-protect-props');
    const summary = el('summary', 'pp-protect-summary');
    const author = field('pp-protect-author', 'text');
    const subject = field('pp-protect-subject', 'text');
    const keywords = field('pp-protect-keywords', 'text');
    [author, subject, keywords].forEach(f => { f.input.maxLength = PdfProtection.MAX_PROPERTY; });
    props.append(summary, author.label, author.input, subject.label, subject.input, keywords.label, keywords.input);

    win.body.append(intro, password.label, password.input, show.wrap, hint, rights, nothing, props);
    const { cancel, ok } = win.addButtons();
    refs = { intro, password, hint, show, legend, print, copy, modify, note, nothing, summary, author, subject, keywords, cancel, ok };

    // Les cases et les champs disent aussitôt si la protection tient ; Entrée valide depuis un champ ou une case, sauf pendant une composition de texte (le titre « Propriétés »
    // garde son Entrée : il ouvre ou ferme le groupe). Le mot de passe tient dans 127 octets : au-delà, le champ refuse la frappe comme avec un maxlength (ce que la personne voit
    // est ce qui ouvre le fichier - jamais un mot de passe coupé en silence), sans couper un caractère en deux.
    win.body.addEventListener('input', event => {
      if (event.target === password.input) {
        const kept = PdfProtection.normalize({ password: password.input.value }).password;
        if (kept !== password.input.value) password.input.value = kept;
      }
      render();
    });
    win.body.addEventListener('change', render);
    win.body.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      apply();
    });
    ok.addEventListener('click', apply);
  }

  // Ce que la fenêtre porte en ce moment, tel que PdfProtection le lit.
  function readState() {
    const { password, print, copy, modify, author, subject, keywords } = refs;
    return PdfProtection.normalize({
      password: password.input.value, allowPrint: print.input.checked, allowCopy: copy.input.checked, allowModify: modify.input.checked,
      author: author.input.value, subject: subject.input.value, keywords: keywords.input.value,
    });
  }

  // « Exporter » n'est permis que si quelque chose est protégé ; sinon la phrase sous les droits dit quoi faire.
  function render() {
    const protects = PdfProtection.protects(readState());
    refs.ok.disabled = !protects;
    refs.nothing.textContent = protects ? '' : I18n.t('pdfProtect.nothing');
    refs.nothing.hidden = protects;
  }

  function apply() {
    if (!current || refs.ok.disabled) return;
    const settings = readState();
    writeSaved(settings);
    current.finish(settings);
  }

  // Ouvre la fenêtre. `batch` : un lot (archive ZIP) de `count` PDF pour la table `table` (`grid` : un modèle de grille, dont les lignes sont des « valeurs »), dont elle tient
  // lieu de confirmation ; sans `batch`, c'est le PDF de la ligne affichée. Une demande qui arrive pendant qu'une autre est ouverte annule la première (résolue comme Annuler).
  function open(opts) {
    if (typeof ModalBase === 'undefined' || typeof PdfProtection === 'undefined') return Promise.resolve(null);
    ensure();
    if (current) current.finish(null);
    const ctx = opts || {};
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        current = null;
        refs.password.input.value = '';
        win.hide();
        resolve(value);
      };
      current = { finish };
      const saved = PdfProtection.normalize(readSaved());
      const { intro, password, hint, show, legend, print, copy, modify, note, summary, author, subject, keywords, cancel, ok } = refs;
      win.title.textContent = I18n.t('pdfProtect.title');
      intro.hidden = !ctx.batch;
      intro.textContent = ctx.batch ? I18n.t(ctx.grid ? 'pdfProtect.batchGrid' : 'pdfProtect.batch', { count: Math.max(0, Number(ctx.count) || 0), table: ctx.table || '' }) : '';
      win.box.setAttribute('aria-describedby', ctx.batch ? intro.id : refs.hint.id);
      password.label.textContent = I18n.t('pdfProtect.password.label');
      password.input.value = '';
      password.input.type = 'password';
      show.input.checked = false;
      show.text.textContent = I18n.t('pdfProtect.show');
      hint.textContent = I18n.t('pdfProtect.password.hint');
      legend.textContent = I18n.t('pdfProtect.rights.label');
      print.text.textContent = I18n.t('pdfProtect.rights.print');
      copy.text.textContent = I18n.t('pdfProtect.rights.copy');
      modify.text.textContent = I18n.t('pdfProtect.rights.modify');
      note.textContent = I18n.t('pdfProtect.rights.note');
      print.input.checked = saved.allowPrint;
      copy.input.checked = saved.allowCopy;
      modify.input.checked = saved.allowModify;
      summary.textContent = I18n.t('pdfProtect.props.label');
      author.label.textContent = I18n.t('pdfProtect.props.author');
      subject.label.textContent = I18n.t('pdfProtect.props.subject');
      keywords.label.textContent = I18n.t('pdfProtect.props.keywords');
      author.input.value = saved.author;
      subject.input.value = '';
      keywords.input.value = '';
      cancel.textContent = I18n.t('common.cancel');
      ok.textContent = I18n.t(ctx.batch ? 'common.generate' : 'toolbar.export');
      cancel.onclick = () => finish(null);
      render();
      win.show(password.input);
    });
  }

  return { STORAGE, open };
})();
