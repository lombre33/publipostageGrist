// Suite "templateNames" - nom d'un modèle déjà pris (demande d'Antoine du 01/10, « nom de modèle dupliqué : prévoir un naming du style nom(x) avec incrémentation de x si nom
// existant »). Un nom qui existe déjà devient « nom (2) », « nom (3) »... : au premier enregistrement d'un modèle, à « Enregistrer sous… » (qui propose d'abord le premier nom
// libre), quand le crayon « Renommer » est validé, pour un macro-modèle. Le nom n'est vérifié qu'à ce moment-là, jamais à chaque lettre ; un modèle qui garde son nom n'est jamais
// renommé, même s'il a un doublon d'avant la règle. Logique : js/templates.js (`uniqueName`), branchements : js/main.js (`settleTemplateName`, `onSaveAs`) et
// js/macro-editor.js (`save`). La vraie souris à 700x400 (fenêtre « Enregistrer sous », galerie) est dans dev-tests/verify-template-names-mouse.mjs.
(function () {
  const cases = [];
  const rows = () => window.__gristStub.state.rows.Publipostage_Modeles;
  const names = () => rows().Nom.slice();
  const nameOfId = (id) => { const i = rows().id.indexOf(id); return i === -1 ? null : rows().Nom[i]; };
  const count = (name) => names().filter(n => n === name).length;
  const status = () => document.getElementById('status-msg').textContent;
  const nameInput = () => document.getElementById('template-name');
  const triggerLabel = () => (document.querySelector('.tts-trigger .tts-trigger-label') || {}).textContent;

  // Crée un modèle par le VRAI flux UI (flyout « + » -> type -> Enregistrer), comme dev-tests/scenarios-template-tree.js:createTemplate. Rend l'id du modèle enregistré.
  async function createTemplate(h, typeModele, nom) {
    await h.resetEditor();
    if (typeModele === 'macro') {
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      document.getElementById('macro-editor-name').value = nom;
      document.getElementById('macro-editor-save').click();
      await h.sleep(300);
      return Templates.getCurrentId();
    }
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await h.sleep(50);
    Editor.setHTML('<p>Contenu de ' + nom + '</p>');
    nameInput().value = nom;
    await h.clickButton('btn-save');
    await h.sleep(400);
    return Templates.getCurrentId();
  }

  // Le crayon « Renommer » : ouvre le champ, tape (évènement `input`, comme au clavier), valide par Entrée.
  async function openRename(h) {
    document.getElementById('btn-rename-template').click();
    await h.sleep(50);
  }
  async function typeName(h, value) {
    const input = nameInput();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.sleep(20);
  }
  async function validateRename(h) {
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(80);
  }

  cases.push({
    id: 'names_a_new_template_with_a_taken_name_is_numbered_in_order_and_the_status_says_so',
    description: 'Un nouveau modèle enregistré sous un nom déjà pris prend « (2) », puis « (3) » ; les majuscules ne comptent pas ; un nom libre reste tel quel ; le champ du nom, la liste, la ligne Grist et le coin d\'état disent le nom retenu',
    run: async (h) => {
      const base = 'Rapport trimestriel';
      await createTemplate(h, 'document', base);
      const statusFirst = status();
      const second = await createTemplate(h, 'document', base);
      const afterSecond = { field: nameInput().value, label: triggerLabel(), stored: nameOfId(second), status: status() };
      const third = await createTemplate(h, 'document', base.toUpperCase());
      const afterThird = { field: nameInput().value, stored: nameOfId(third) };
      const free = await createTemplate(h, 'document', 'Rapport annuel');
      const afterFree = { field: nameInput().value, stored: nameOfId(free), status: status() };
      const pass = statusFirst.indexOf('Ce nom existe déjà') === -1
        && afterSecond.field === base + ' (2)' && afterSecond.label === base + ' (2)' && afterSecond.stored === base + ' (2)' && afterSecond.status === 'Ce nom existe déjà : renommé « ' + base + ' (2) ».'
        && afterThird.field === base.toUpperCase() + ' (3)' && afterThird.stored === base.toUpperCase() + ' (3)'
        && afterFree.field === 'Rapport annuel' && afterFree.stored === 'Rapport annuel' && afterFree.status.indexOf('Ce nom existe déjà') === -1
        && count(base) === 1 && count(base + ' (2)') === 1;
      return { pass, notes: JSON.stringify({ statusFirst, afterSecond, afterThird, afterFree, all: names() }) };
    },
  });

  cases.push({
    id: 'names_save_as_proposes_the_first_free_name_and_a_taken_typed_name_is_numbered',
    description: '« Enregistrer sous… » propose « nom (2) » (la saisie arrive remplie) ; un nom saisi qui existe déjà, celui de l\'original compris, prend le numéro libre suivant et le dit ; l\'original reste ; une série « (n) » se poursuit au numéro suivant',
    run: async (h) => {
      const original = await createTemplate(h, 'document', 'Contrat de vente');
      const seen = [];
      let answer = 'Contrat de vente';
      const asked = h.stubDialogs({ prompt: (o) => { seen.push(o.value); return answer; } });
      let first, second, third;
      try {
        await h.clickButton('v2-btn-save-as');           // proposée : « Contrat de vente (2) » ; saisie : le nom de l'original
        await h.sleep(500);
        first = { field: nameInput().value, stored: nameOfId(Templates.getCurrentId()), status: status() };
        answer = 'Contrat de vente (2)';                 // déjà pris par la copie qu'on vient de faire
        await h.clickButton('v2-btn-save-as');           // proposée : « Contrat de vente (3) »
        await h.sleep(500);
        second = { field: nameInput().value, stored: nameOfId(Templates.getCurrentId()), status: status() };
        answer = 'Dossier client';                       // libre : tel quel, rien à dire
        await h.clickButton('v2-btn-save-as');
        await h.sleep(500);
        third = { field: nameInput().value, stored: nameOfId(Templates.getCurrentId()), status: status() };
      } finally { asked.restore(); }
      const proposals = seen.slice(0, 3);
      const pass = proposals[0] === 'Contrat de vente (2)' && proposals[1] === 'Contrat de vente (3)' && proposals[2] === 'Contrat de vente (4)'
        && first.field === 'Contrat de vente (2)' && first.stored === 'Contrat de vente (2)' && first.status === 'Ce nom existe déjà : renommé « Contrat de vente (2) ».'
        && second.field === 'Contrat de vente (3)' && second.stored === 'Contrat de vente (3)' && second.status === 'Ce nom existe déjà : renommé « Contrat de vente (3) ».'
        && third.field === 'Dossier client' && third.stored === 'Dossier client' && third.status.indexOf('Ce nom existe déjà') === -1
        && nameOfId(original) === 'Contrat de vente' && count('Contrat de vente') === 1;
      return { pass, notes: JSON.stringify({ proposals, first, second, third, original: nameOfId(original), all: names() }) };
    },
  });

  cases.push({
    id: 'names_save_as_on_a_macro_template_numbers_a_taken_name_and_the_macro_modal_does_too',
    description: 'Un macro-modèle copié par « Enregistrer sous… » ou enregistré depuis sa fenêtre sous un nom déjà pris prend « (2) » ; un macro-modèle qui garde son nom n\'est pas renommé',
    run: async (h) => {
      const macro = await createTemplate(h, 'macro', 'Annexes de bail');
      const created = await createTemplate(h, 'macro', 'Annexes de bail');
      const fromModal = { stored: nameOfId(created), status: status() };
      // la copie par « Enregistrer sous… » : sa fenêtre s'ouvre sur le macro-modèle courant
      const asked = h.stubDialogs({ prompt: () => 'Annexes de bail' });
      let copy;
      try {
        await h.clickButton('v2-btn-save-as');
        await h.sleep(600);
        copy = { stored: nameOfId(Templates.getCurrentId()), status: status() };
      } finally { asked.restore(); }
      // rouvrir le premier et l'enregistrer sans changer son nom : aucun renommage
      const tpl = Templates.getCached().find(t => String(t.id) === String(macro));
      MacroEditor.openModal(tpl);
      await h.sleep(100);
      document.getElementById('macro-editor-save').click();
      await h.sleep(400);
      const kept = nameOfId(macro);
      const pass = fromModal.stored === 'Annexes de bail (2)' && fromModal.status === 'Ce nom existe déjà : renommé « Annexes de bail (2) ».'
        && copy.stored === 'Annexes de bail (3)' && copy.status === 'Ce nom existe déjà : renommé « Annexes de bail (3) ».' && kept === 'Annexes de bail' && count('Annexes de bail') === 1;
      return { pass, notes: JSON.stringify({ fromModal, copy, kept, all: names() }) };
    },
  });

  cases.push({
    id: 'names_rename_pencil_numbers_a_taken_name_when_validated_and_not_while_typing',
    description: 'Le crayon « Renommer » : pendant la frappe le champ ne bouge pas, même quand le nom est déjà pris ; à Entrée il prend « (2) », la liste et le coin d\'état le disent, et l\'enregistrement automatique écrit ce nom-là (un passage qui a écrit le nom tel que tapé en route ne le garde pas) ; renommer sans changer le nom, ou seulement sa casse, ne le numérote pas',
    run: async (h) => {
      const bail = await createTemplate(h, 'document', 'Bail habitation');
      const contrat = await createTemplate(h, 'document', 'Contrat de location');
      // frappe : le nom d'un autre modèle, gardé assez longtemps pour qu'un passage de l'enregistrement automatique l'écrive tel quel
      await openRename(h);
      await typeName(h, 'Bail habitation');
      const whileTyping = { field: nameInput().value, open: !nameInput().hidden };
      await h.sleep(3400);
      const writtenWhileTyping = nameOfId(contrat);
      await validateRename(h);
      const validated = { field: nameInput().value, label: triggerLabel(), status: status(), closed: nameInput().hidden };
      await h.sleep(3400);                                    // l'enregistrement automatique écrit le nom retenu
      const settled = nameOfId(contrat);
      // sans changer le nom : le crayon puis Entrée ne numérote rien
      await openRename(h);
      await validateRename(h);
      const unchanged = { field: nameInput().value, stored: nameOfId(contrat) };
      // seulement la casse : c'est le même modèle, le nom est libre pour lui
      await openRename(h);
      await typeName(h, 'bail habitation (2)');
      await validateRename(h);
      const caseOnly = { field: nameInput().value };
      await h.clickButton('btn-save');
      await h.sleep(400);
      const pass = whileTyping.field === 'Bail habitation' && whileTyping.open && writtenWhileTyping === 'Bail habitation'
        && validated.field === 'Bail habitation (2)' && validated.label === 'Bail habitation (2)' && validated.status === 'Ce nom existe déjà : renommé « Bail habitation (2) ».' && validated.closed
        && settled === 'Bail habitation (2)' && unchanged.field === 'Bail habitation (2)' && unchanged.stored === 'Bail habitation (2)'
        && caseOnly.field === 'bail habitation (2)' && nameOfId(contrat) === 'bail habitation (2)' && nameOfId(bail) === 'Bail habitation' && count('Bail habitation') === 1;
      return { pass, notes: JSON.stringify({ whileTyping, writtenWhileTyping, validated, settled, unchanged, caseOnly, all: names() }) };
    },
  });

  cases.push({
    id: 'names_a_saved_template_keeps_its_name_even_with_an_older_duplicate_and_Ctrl_S_settles_a_name_still_being_typed',
    description: 'Un modèle déjà enregistré qui garde son nom n\'est jamais renommé, même si un doublon d\'avant la règle existe ; Ctrl+S pendant la saisie du crayon vérifie le nom tapé, comme Entrée',
    run: async (h) => {
      // deux modèles au même nom, comme avant la règle : le second est renommé directement dans Grist (le modèle est ensuite rouvert depuis la liste)
      const older = await createTemplate(h, 'document', 'Doublon ancien');
      const newer = await createTemplate(h, 'document', 'Doublon récent');
      await Templates.save(newer, 'Doublon ancien', '<p>Deux</p>', '', null, null, 'document', null);
      await Templates.loadAll();
      const select = document.getElementById('template-select');
      const openFromList = async (id) => { select.value = String(id); select.dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(300); };
      await openFromList(older);
      await openFromList(newer);
      Editor.setHTML('<p>Deux, modifié</p>');
      await h.clickButton('btn-save');
      await h.sleep(400);
      const kept = { field: nameInput().value, stored: nameOfId(newer), twin: nameOfId(older), count: count('Doublon ancien'), status: status() };
      // Ctrl+S pendant la saisie : le champ du crayon est ouvert, le nom tapé existe déjà
      const other = await createTemplate(h, 'document', 'Facture de mars');
      await openRename(h);
      await typeName(h, 'Doublon ancien');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      await h.sleep(600);
      const ctrlS = { field: nameInput().value, stored: nameOfId(other), count: count('Doublon ancien'), status: status() };
      const pass = kept.field === 'Doublon ancien' && kept.stored === 'Doublon ancien' && kept.twin === 'Doublon ancien' && kept.count === 2 && kept.status.indexOf('Ce nom existe déjà') === -1
        && ctrlS.field === 'Doublon ancien (2)' && ctrlS.stored === 'Doublon ancien (2)' && ctrlS.count === 2;
      return { pass, notes: JSON.stringify({ kept, ctrlS, all: names() }) };
    },
  });

  // Entrée valide le nom (demande d'Antoine du 20/10 : « quand on fait entrée après avoir changé le nom d'un document, il faut que ça le valide »). Le crayon et « Enregistrer sous »
  // le faisaient déjà ; la fenêtre du macro-modèle n'avait pas d'Entrée, et un modèle neuf gardait « — Nouveau modèle — » en titre après le nom validé.
  const macroName = () => document.getElementById('macro-editor-name');
  const macroOpen = () => getComputedStyle(document.getElementById('macro-editor-modal')).display !== 'none';
  const pressEnter = (el, extra) => {
    const event = new KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, extra));
    el.dispatchEvent(event);
    return event;
  };

  cases.push({
    id: 'names_enter_in_the_macro_window_name_saves_the_macro_template_like_the_button',
    description: 'Entrée dans le nom de la fenêtre du macro-modèle l\'enregistre comme le bouton « Enregistrer » (un macro-modèle neuf, un macro-modèle renommé, un nom déjà pris numéroté) ; pendant une composition de texte ou avec une autre touche, rien ne part ; un nom vide ne crée rien et le dit',
    run: async (h) => {
      await h.resetEditor();
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-macro');
      await h.sleep(150);
      const opened = { open: macroOpen(), focused: document.activeElement === macroName() };
      macroName().value = 'Annexes Entrée';
      const composing = pressEnter(macroName(), { isComposing: true });
      const otherKey = pressEnter(macroName(), { key: 'a' });
      await h.sleep(250);
      const notYet = { open: macroOpen(), count: count('Annexes Entrée'), composingKept: !composing.defaultPrevented, otherKept: !otherKey.defaultPrevented };
      const enter = pressEnter(macroName());
      await h.sleep(500);
      const id = Templates.getCurrentId();
      const created = { open: macroOpen(), stored: nameOfId(id), type: (Templates.byId(id) || {}).typeModele, taken: enter.defaultPrevented, label: triggerLabel(), field: nameInput().value };
      // renommer un macro-modèle déjà enregistré : sa fenêtre s'ouvre sur lui, on change le nom, Entrée
      MacroEditor.openModal(Templates.byId(id));
      await h.sleep(100);
      macroName().value = 'Annexes Entrée, renommées';
      pressEnter(macroName());
      await h.sleep(500);
      const renamed = { open: macroOpen(), stored: nameOfId(id), old: count('Annexes Entrée'), label: triggerLabel(), same: String(Templates.getCurrentId()) === String(id) };
      // un nom déjà pris : numéroté comme au clic
      MacroEditor.openModal(null);
      await h.sleep(100);
      macroName().value = 'Annexes Entrée, renommées';
      pressEnter(macroName());
      await h.sleep(500);
      const numbered = { open: macroOpen(), stored: nameOfId(Templates.getCurrentId()), status: status() };
      // un nom vide : la même réponse que le bouton (le message), la fenêtre reste ouverte, rien n'est créé
      const before = names().length;
      const realAlert = window.alert;
      const alerts = [];
      window.alert = (message) => { alerts.push(message); };
      let empty;
      try {
        MacroEditor.openModal(null);
        await h.sleep(100);
        macroName().value = '   ';
        pressEnter(macroName());
        await h.sleep(300);
        empty = { open: macroOpen(), alerts: alerts.slice(), created: names().length - before };
        document.getElementById('macro-editor-cancel').click();
      } finally { window.alert = realAlert; }
      const pass = opened.open && opened.focused
        && notYet.open && notYet.count === 0 && notYet.composingKept && notYet.otherKept
        && !created.open && created.stored === 'Annexes Entrée' && created.type === 'macro' && created.taken && created.label === 'Annexes Entrée' && created.field === 'Annexes Entrée'
        && !renamed.open && renamed.stored === 'Annexes Entrée, renommées' && renamed.old === 0 && renamed.same && renamed.label === 'Annexes Entrée, renommées'
        && !numbered.open && numbered.stored === 'Annexes Entrée, renommées (2)' && numbered.status === 'Ce nom existe déjà : renommé « Annexes Entrée, renommées (2) ».'
        && empty.open && empty.alerts.length === 1 && empty.alerts[0] === I18n.t('macro.modal.nameRequired') && empty.created === 0;
      return { pass, notes: JSON.stringify({ opened, notYet, created, renamed, numbered, empty, all: names() }) };
    },
  });

  cases.push({
    id: 'names_a_template_not_saved_yet_shows_the_name_validated_in_the_title_and_the_next_blank_one_does_not',
    description: 'Un modèle neuf dont le nom est validé (Entrée, ou un clic ailleurs) montre ce nom en titre au lieu de « — Nouveau modèle — », reste non enregistré, et un nom déjà pris y prend « (2) » ; Enregistrer garde le titre ; le modèle vierge suivant repart de l\'invite',
    run: async (h) => {
      await h.resetEditor();
      const invite = I18n.t('template.newOption');
      await createTemplate(h, 'document', 'Titre neuf - existant');
      const startBlank = async () => { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await h.sleep(80); };
      await startBlank();
      const fresh = { label: triggerLabel(), id: Templates.getCurrentId() };
      await openRename(h);
      await typeName(h, 'Facture en cours');
      const typing = { open: !nameInput().hidden, label: triggerLabel() };
      await validateRename(h);
      const validated = { label: triggerLabel(), closed: nameInput().hidden, id: Templates.getCurrentId(), field: nameInput().value };
      // le nom de ce modèle abandonné ne s'affiche pas sur le modèle vierge suivant
      await startBlank();
      const next = { label: triggerLabel(), field: nameInput().value };
      // un clic ailleurs valide comme Entrée ; un nom pris prend son numéro
      await openRename(h);
      await typeName(h, 'Titre neuf - existant');
      nameInput().blur();
      await h.sleep(80);
      const byBlur = { label: triggerLabel(), field: nameInput().value, closed: nameInput().hidden, id: Templates.getCurrentId() };
      // Enregistrer : le modèle existe sous ce nom, le titre ne bouge pas
      await h.clickButton('btn-save');
      await h.sleep(400);
      const saved = { label: triggerLabel(), stored: nameOfId(Templates.getCurrentId()) };
      await startBlank();
      const after = { label: triggerLabel() };
      const pass = fresh.label === invite && fresh.id == null
        && typing.open && typing.label === invite
        && validated.label === 'Facture en cours' && validated.closed && validated.id == null && validated.field === 'Facture en cours'
        && next.label === invite && next.field === ''
        && byBlur.label === 'Titre neuf - existant (2)' && byBlur.field === 'Titre neuf - existant (2)' && byBlur.closed && byBlur.id == null
        && saved.label === 'Titre neuf - existant (2)' && saved.stored === 'Titre neuf - existant (2)'
        && after.label === invite;
      return { pass, notes: JSON.stringify({ fresh, typing, validated, next, byBlur, saved, after, all: names() }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateNames = cases;
})();
