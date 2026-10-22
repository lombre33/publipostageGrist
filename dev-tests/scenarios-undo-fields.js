// Suite "undoFields" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les champs hors du texte (suite de scenarios-undo-model.js : demande du 22/10, « Il doit prendre en compte 100% des actions
// faites dans le widget »). Ici : l'Objet, À, Cc, Cci du mode email et le nom du fichier PDF (js/field-editor.js : un éditeur d'une ligne chacun). Chaque champ garde l'historique de sa frappe tant qu'il a le focus ; une fois
// quitté, Ctrl + Z défaisait le dernier mot du CORPS et laissait l'objet ou le nom du PDF tel quel. La séance d'un champ - de son focus à son départ - laisse maintenant UN repère dans l'historique du corps
// (js/history-markers.js, domaine « fields ») : sa valeur d'avant et sa valeur d'après.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z, le focus hors du champ, rend la valeur d'avant (la valeur du champ, le brouillon que l'enregistrement automatique écrit, le champ du nom du PDF ou la Cci
// qui se replie ou se déplie), UN Ctrl + Y la rend ; l'ordre est celui des gestes, texte du corps et champs mêlés ; une séance qui ne laisse rien de net n'ajoute rien ; dans le champ, Ctrl + Z reste celui du champ ; un autre
// modèle ne reçoit jamais la valeur de l'ancien. Le même parcours à la vraie souris dans le panneau de 700x400 : verify-undo-fields-mouse.mjs (undoFieldsMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoFields = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const SUBJECT = 'v2-email-subject';
  const TO = 'v2-email-to';
  const CC = 'v2-email-cc';
  const CCI = 'v2-email-cci';
  const FILE = 'pdf-filename-template';
  const ALL = [SUBJECT, TO, CC, CCI, FILE];
  const byId = id => document.getElementById(id);
  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  const row = id => window.__gristStub.getRow(TABLE, id);
  // Les cinq champs tels que le modèle les garde (ce que l'enregistrement écrit), jamais le DOM.
  const values = () => Object.fromEntries(ALL.map(id => [id, byId(id).value]));
  const only = (id, value) => Object.assign(Object.fromEntries(ALL.map(other => [other, ''])), { [id]: value });
  const EMPTY = Object.fromEntries(ALL.map(id => [id, '']));

  // Ctrl + Z et Ctrl + Y au vrai clavier de la page quand le focus est hors de l'éditeur (le corps de la page : un champ vient d'être quitté), ou à celui de l'éditeur.
  function press(key, target) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
    (target || document.body).dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => { if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur(); return press('z'); };
  const redo = () => { if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur(); return press('y'); };

  // Du texte tapé à la fin du corps : un événement de l'historique, clos aussitôt pour que la frappe suivante n'y soit pas rangée.
  function typeBody(text) {
    const state = ed().state;
    const tr = state.tr.insertText(text, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  }
  // Le focus dans le corps : la commande focus de TipTap attend l'image suivante, et reprendrait sinon le focus au champ qu'on vient de prendre.
  async function toBody(h) { ed().commands.focus('end'); await h.sleep(100); }
  // La personne prend le focus du champ, y écrit `text` à la place de ce qu'il contient, puis le quitte (le focus retombe sur la page, la séance se ferme au tour suivant).
  async function edit(h, id, text) {
    byId(id).focus();
    await h.sleep(40);
    await h.fieldType(id, text);
    await h.sleep(30);
    byId(id).blur();
    await h.sleep(80);
  }

  // Un email neuf, nommé et enregistré, ses cinq champs vides et dépliés : le modèle du parcours.
  async function freshEmail(h, name) {
    await h.clickButton('btn-new');
    await h.sleep(300);
    await h.clickButton('v2-btn-new-email');
    await h.sleep(400);
    byId('template-name').value = name;
    Editor.setHTML('<p>Corps</p>');
    await h.clickButton('btn-save');
    await h.sleep(600);
    const id = Templates.getCurrentId();
    byId(CCI).hidden = false;
    byId(FILE).hidden = false;
    ALL.forEach(field => { byId(field).value = ''; });
    await h.sleep(150);
    return id;
  }
  async function leave(h) {
    ALL.forEach(field => { if (byId(field)) { byId(field).blur(); } });
    await h.clickButton('btn-new');
    await h.sleep(300);
  }
  const canUndo = () => ed().can().undo();

  // --- 1) Un champ ---

  cases.push({
    id: 'undo_fields_subject_typed_then_left_is_one_step_and_ctrl_y_gives_it_back',
    description: 'L\'Objet écrit puis quitté : UN Ctrl + Z rend l\'Objet à vide (le corps ne bouge pas), UN Ctrl + Y le rend ; le bouton Annuler de la barre fait comme la touche',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - objet');
        await edit(h, SUBJECT, 'Bonjour à tous');
        check(problems, 'l\'objet écrit', values(), only(SUBJECT, 'Bonjour à tous'));
        if (!canUndo()) problems.push('Annuler est grisé alors que l\'objet vient d\'être écrit');
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z', values(), EMPTY);
        if (!/Corps/.test(ed().getText())) problems.push('le corps a été défait avec l\'objet : ' + ed().getText());
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y', values(), only(SUBJECT, 'Bonjour à tous'));
        await h.clickButton('v2-btn-undo');
        await h.sleep(150);
        check(problems, 'le bouton Annuler', values(), EMPTY);
        await h.clickButton('v2-btn-redo');
        await h.sleep(150);
        check(problems, 'le bouton Rétablir', values(), only(SUBJECT, 'Bonjour à tous'));
        return verdict(problems, { subject: byId(SUBJECT).value });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_fields_steps_come_back_in_the_order_of_the_gestures_with_the_body_text',
    description: 'Du texte dans le corps, l\'Objet, le destinataire, du texte dans le corps : quatre Ctrl + Z défont dans l\'ordre inverse, quatre Ctrl + Y les rendent dans l\'ordre',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - ordre');
        await toBody(h);
        typeBody(' Alpha');
        await edit(h, SUBJECT, 'Objet un');
        await edit(h, TO, 'marie@exemple.fr');
        await toBody(h);
        typeBody(' Beta');
        ed().view.dom.blur();
        await h.sleep(150);
        // L'état après 0, 1, 2, 3 puis 4 Ctrl + Z.
        const FULL = { [SUBJECT]: 'Objet un', [TO]: 'marie@exemple.fr' };
        const want = [
          { body: /Alpha Beta/, fields: FULL },
          { body: /Alpha(?! Beta)/, fields: FULL },
          { body: /Alpha(?! Beta)/, fields: { [SUBJECT]: 'Objet un', [TO]: '' } },
          { body: /Alpha(?! Beta)/, fields: { [SUBJECT]: '', [TO]: '' } },
          { body: /Corps(?! Alpha)/, fields: { [SUBJECT]: '', [TO]: '' } },
        ];
        const state = () => ({ body: ed().getText(), fields: { [SUBJECT]: byId(SUBJECT).value, [TO]: byId(TO).value } });
        const seen = [state()];
        for (let i = 1; i < want.length; i++) { undo(); await h.sleep(150); seen.push(state()); }
        want.forEach((step, i) => {
          const got = seen[i];
          if (!step.body.test(got.body)) problems.push('après ' + i + ' Ctrl + Z : le corps dit ' + JSON.stringify(got.body));
          check(problems, 'après ' + i + ' Ctrl + Z : les champs', got.fields, step.fields);
        });
        // Quatre Ctrl + Y rendent les états dans l'ordre inverse.
        for (let i = want.length - 2; i >= 0; i--) {
          redo();
          await h.sleep(150);
          const got = state();
          if (!want[i].body.test(got.body)) problems.push('Ctrl + Y vers l\'état ' + i + ' : le corps dit ' + JSON.stringify(got.body));
          check(problems, 'Ctrl + Y vers l\'état ' + i + ' : les champs', got.fields, want[i].fields);
        }
        return verdict(problems, { seen: seen.length });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_fields_each_of_the_five_fields_is_its_own_step',
    description: 'L\'Objet, À, Cc, Cci et le nom du fichier PDF : cinq séances, cinq pas ; cinq Ctrl + Z les défont un à un, dans l\'ordre inverse, et cinq Ctrl + Y les rendent',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - cinq');
        const gestures = [[SUBJECT, 'Objet'], [TO, 'a@exemple.fr'], [CC, 'b@exemple.fr'], [CCI, 'c@exemple.fr'], [FILE, 'Facture #Numero']];
        for (const [id, text] of gestures) { await edit(h, id, text); }
        const full = values();
        const seen = [];
        for (let i = gestures.length - 1; i >= 0; i--) {
          undo();
          await h.sleep(150);
          const expected = Object.assign({}, full);
          for (let j = i; j < gestures.length; j++) expected[gestures[j][0]] = '';
          check(problems, 'Ctrl + Z n° ' + (gestures.length - i), values(), expected);
          seen.push(values());
        }
        for (let i = 0; i < gestures.length; i++) {
          redo();
          await h.sleep(150);
          const expected = Object.assign({}, EMPTY);
          for (let j = 0; j <= i; j++) expected[gestures[j][0]] = full[gestures[j][0]];
          check(problems, 'Ctrl + Y n° ' + (i + 1), values(), expected);
        }
        return verdict(problems, { steps: seen.length });
      } finally { await leave(h); }
    },
  });

  // --- 2) Ce qu'une séance range, ce qu'elle ne range pas ---

  cases.push({
    id: 'undo_fields_a_session_that_changes_nothing_adds_no_step',
    description: 'Un champ ouvert puis quitté sans rien changer, ou une frappe écrite puis défaite dans le champ : aucun pas de plus dans l\'historique',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - rien');
        const depth = () => (canUndo() ? 1 : 0);
        byId(SUBJECT).focus();
        await h.sleep(60);
        byId(SUBJECT).blur();
        await h.sleep(100);
        check(problems, 'un champ ouvert et quitté à vide : Annuler possible', depth(), 0);
        // Une frappe puis son Ctrl + Z dans le champ : la valeur est celle d'avant la séance.
        byId(SUBJECT).focus();
        await h.sleep(40);
        await h.fieldType(SUBJECT, 'Brouillon');
        press('z', FieldEditor.of(byId(SUBJECT)).view.dom);
        await h.sleep(60);
        byId(SUBJECT).blur();
        await h.sleep(100);
        check(problems, 'la frappe défaite dans le champ', byId(SUBJECT).value, '');
        check(problems, 'une frappe défaite dans le champ : Annuler possible', depth(), 0);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_fields_ctrl_z_inside_a_field_stays_with_the_field',
    description: 'Pendant qu\'on écrit dans un champ, Ctrl + Z défait la frappe du champ et rien d\'autre : le corps, les autres champs et l\'historique du modèle ne bougent pas ; la séance se range une fois le champ quitté',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - dans le champ');
        await toBody(h);
        typeBody(' Alpha');
        await edit(h, TO, 'a@exemple.fr');
        byId(SUBJECT).focus();
        await h.sleep(40);
        await h.fieldType(SUBJECT, 'Premier jet');
        const dom = FieldEditor.of(byId(SUBJECT)).view.dom;
        const taken = press('z', dom);
        await h.sleep(80);
        // Le raccourci de la page ne prend pas la touche dans un champ : c'est celle du champ (TipTap) qui la prend.
        check(problems, 'la frappe défaite dans le champ', byId(SUBJECT).value, '');
        check(problems, 'le corps pendant la séance', /Alpha/.test(ed().getText()), true);
        check(problems, 'le destinataire pendant la séance', byId(TO).value, 'a@exemple.fr');
        await h.fieldType(SUBJECT, 'Second jet');
        byId(SUBJECT).blur();
        await h.sleep(100);
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z hors du champ : l\'objet', byId(SUBJECT).value, '');
        check(problems, 'Ctrl + Z hors du champ : le destinataire', byId(TO).value, 'a@exemple.fr');
        check(problems, 'Ctrl + Z hors du champ : le corps', /Alpha/.test(ed().getText()), true);
        return verdict(problems, { taken });
      } finally { await leave(h); }
    },
  });

  // --- 3) Le nom du fichier PDF et la Cci se replient et se déplient avec leur valeur ---

  cases.push({
    id: 'undo_fields_pdf_file_name_and_cci_fold_and_unfold_with_their_value',
    description: 'Le nom du fichier PDF et la Cci écrits puis défaits se replient (vides, ils ne se montrent pas), et se déplient quand Ctrl + Y leur rend une valeur',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - replis');
        await edit(h, FILE, 'Facture #Numero');
        await edit(h, CCI, 'secret@exemple.fr');
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z : la Cci repliée', byId(CCI).hidden, true);
        check(problems, 'Ctrl + Z : le bouton « + Cci » éteint', byId('v2-btn-toggle-cci').classList.contains('is-active'), false);
        check(problems, 'Ctrl + Z : le nom du PDF reste', byId(FILE).hidden, false);
        undo();
        await h.sleep(150);
        check(problems, 'second Ctrl + Z : le nom du PDF replié', byId(FILE).hidden, true);
        redo();
        await h.sleep(150);
        check(problems, 'Ctrl + Y : le nom du PDF déplié avec sa valeur', [byId(FILE).hidden, byId(FILE).value], [false, 'Facture #Numero']);
        redo();
        await h.sleep(150);
        check(problems, 'second Ctrl + Y : la Cci dépliée avec sa valeur', [byId(CCI).hidden, byId(CCI).value, byId('v2-btn-toggle-cci').classList.contains('is-active')], [false, 'secret@exemple.fr', true]);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  // --- 4) Le modèle enregistré ---

  cases.push({
    id: 'undo_fields_are_written_by_the_autosave_with_the_template',
    description: 'Un email enregistré, son objet et le nom de son PDF écrits puis défaits par Ctrl + Z : l\'enregistrement automatique écrit les valeurs DÉFAITES dans les colonnes Objet et NomFichierPDF',
    async run(h) {
      const problems = [];
      let id = null;
      try {
        id = await freshEmail(h, 'Annuler les champs - enregistrement');
        await edit(h, SUBJECT, 'Objet écrit');
        await edit(h, FILE, 'Nom écrit');
        await h.sleep(2500 + 900);
        check(problems, 'les colonnes écrites', { objet: row(id).Objet, pdf: row(id).NomFichierPDF }, { objet: 'Objet écrit', pdf: 'Nom écrit' });
        undo();
        await h.sleep(2500 + 900);
        check(problems, 'après Ctrl + Z : le nom du PDF', row(id).NomFichierPDF, '');
        check(problems, 'après Ctrl + Z : l\'objet reste', row(id).Objet, 'Objet écrit');
        undo();
        await h.sleep(2500 + 900);
        check(problems, 'après le second Ctrl + Z : l\'objet', row(id).Objet, '');
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  // --- 5) Les limites ---

  cases.push({
    id: 'undo_fields_never_reach_another_template',
    description: 'Charger un autre modèle vide l\'historique : un Ctrl + Z ne rend jamais l\'objet de l\'ancien modèle au nouveau',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - autre modèle');
        await edit(h, SUBJECT, 'Objet de l\'ancien');
        await h.clickButton('btn-new');
        await h.sleep(300);
        await h.clickButton('v2-btn-new-email');
        await h.sleep(400);
        const before = values();
        undo();
        await h.sleep(150);
        check(problems, 'Ctrl + Z sur le nouveau modèle', values(), before);
        check(problems, 'Annuler possible sur le nouveau modèle', canUndo(), false);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_fields_a_session_still_open_is_filed_before_a_toolbar_undo',
    description: 'Le bouton Annuler cliqué dans la foulée du départ d\'un champ (avant que la séance ne se ferme d\'elle-même) range d\'abord la séance : l\'objet écrit se défait, rien n\'est perdu, rien n\'est défait en trop',
    async run(h) {
      const problems = [];
      try {
        await freshEmail(h, 'Annuler les champs - bouton');
        await toBody(h);
        typeBody(' Alpha');
        byId(SUBJECT).focus();
        await h.sleep(40);
        await h.fieldType(SUBJECT, 'Objet vite');
        // Le départ du champ et le clic de la barre sans attendre le tour de la minuterie du champ.
        byId(SUBJECT).blur();
        byId('v2-btn-undo').click();
        await h.sleep(200);
        check(problems, 'le bouton Annuler dans la foulée : l\'objet', byId(SUBJECT).value, '');
        check(problems, 'le corps', /Alpha/.test(ed().getText()), true);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  return cases;
})();
