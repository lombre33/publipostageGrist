// Suite "varTextPath" - chemins de références dans les champs texte : Objet, À, Cc, Cci du mode email et nom du fichier PDF (retour d'Antoine du 2026-09-29,
// carte « Oui, l'ajouter » : #Projet.Accompagnateur.Email doit se résoudre là aussi, comme dans le corps du modèle - cf. scenarios-var-path.js). La valeur d'un
// champ s'enregistre en texte brut tant que ses bulles n'ont aucun réglage : Variables.findTextVariables scanne ce texte, une clé de colonne Référence se
// prolonge par « .Colonne » de la ligne qu'elle désigne, et le reste (fin de phrase, « .pdf ») demeure du texte. Un seul scan pour tous les champs
// (Variables.resolveTextVariables, ReaderMode.resolveFilename). Depuis le 2026-10-08 ces champs sont des éditeurs d'une ligne (js/field-editor.js) : une clé choisie
// dans la liste y devient une bulle, que le champ relit « #Clé » ; les cas de saisie pilotent donc l'éditeur (TestHelpers.fieldType, fieldKey, fieldSelect), pas un <input>.
// Deuxième carte d'Antoine (« Oui, la proposer ») : la liste # de ces champs propose aussi, après « #Projet.Accompagnateur. », les colonnes de la ligne que
// désigne la Référence (Variables.pathItems, Variables.createFieldExtension) - le clavier et la souris réels à 700x400 sont dans verify-small-panel.mjs.
(function () {
  const cases = [];

  const RECORD_1 = { id: 1, Titre: 'Notif 1', Projet: 'Projet Alpha' };
  const RECORD_2 = { id: 2, Titre: 'Notif 2', Projet: 'Projet Beta' };
  const PAGE = 'TpNotifications';

  // La page est sur TpNotifications, dont Projet est une Référence vers TpProjet (liée par sa règle, seule règle du document). TpProjet a DEUX Références vers
  // le même annuaire (Accompagnateur, Porteur) ; l'annuaire a lui-même une Référence (Service). Aucune règle pour l'annuaire ni pour les services.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('TpServices', { Nom: 'Text' });
    stub.setRows('TpServices', [{ id: 3, Nom: 'Juridique' }, { id: 4, Nom: 'Fiscal' }]);
    stub.setVariables('TpAnnuaire', { NomPrenom: 'Text', Email: 'Text', Service: 'Ref:TpServices', gristHelper_Display: 'Text' }, null, { Service: 'gristHelper_Display' });
    stub.setRows('TpAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr', Service: 3, gristHelper_Display: 'Juridique' },
      { id: 8, NomPrenom: 'Martin Anne', Email: 'anne.martin@ex.fr', Service: 0, gristHelper_Display: '' },
      // Une adresse avec un caractère interdit dans un nom de fichier : le nom du PDF le remplace, le champ À le garde tel quel.
      { id: 9, NomPrenom: 'Durand Paul', Email: 'durand:paul@ex.fr', Service: 4, gristHelper_Display: 'Fiscal' },
    ]);
    stub.setVariables('TpProjet', {
      Nom: 'Text', NomLong: 'Text', Statut: 'Text', Accompagnateur: 'Ref:TpAnnuaire', Porteur: 'Ref:TpAnnuaire', gristHelper_Display: 'Text', gristHelper_Display2: 'Text',
    }, null, { Accompagnateur: 'gristHelper_Display', Porteur: 'gristHelper_Display2' });
    stub.setRows('TpProjet', [
      { id: 1, Nom: 'Projet Alpha', Statut: 'En cours', Accompagnateur: 7, Porteur: 8, gristHelper_Display: 'Dupont Jean', gristHelper_Display2: 'Martin Anne' },
      { id: 2, Nom: 'Projet Beta', Statut: 'Clos', Accompagnateur: 0, Porteur: 9, gristHelper_Display: '', gristHelper_Display2: 'Durand Paul' },
      // Accompagnateur 99 : la ligne référencée n'existe plus.
      { id: 3, Nom: 'Projet Gamma', Statut: 'En cours', Accompagnateur: 99, Porteur: 7, gristHelper_Display: '', gristHelper_Display2: 'Dupont Jean' },
    ]);
    stub.setVariables(PAGE, { Titre: 'Text', Projet: 'Ref:TpProjet', gristHelper_Display: 'Text' }, null, { Projet: 'gristHelper_Display' });
    stub.setRows(PAGE, [
      { id: 1, Titre: 'Notif 1', Projet: 1, gristHelper_Display: 'Projet Alpha' },
      { id: 2, Titre: 'Notif 2', Projet: 2, gristHelper_Display: 'Projet Beta' },
      { id: 3, Titre: 'Notif 3', Projet: 3, gristHelper_Display: 'Projet Gamma' },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['TpProjet', 'TpAnnuaire', 'TpServices']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('TpProjet', { mode: 'match', colonneCible: 'id', colonneSource: 'Projet' });
    window.__gristStub.fireRecord(Object.assign({}, RECORD_1), PAGE);
    await h.sleep(50);
  }

  const text = (value, record) => Variables.resolveTextVariables(value, PAGE, record || RECORD_1);
  const filename = (template, record) => ReaderMode.resolveFilename(template, PAGE, record || RECORD_1);

  cases.push({
    id: 'vartextpath_email_fields_resolve_a_reference_path',
    description: 'Objet, À, Cc et Cci : #TpProjet.Accompagnateur.Email donne l’email de l’accompagnateur du projet et #TpProjet.Porteur.Email celui du porteur (autre Référence vers le même annuaire), sans règle de liaison pour l’annuaire',
    run: async (h) => {
      await seed(h);
      const to = await text('#TpProjet.Accompagnateur.Email');
      const cc = await text('#TpProjet.Porteur.Email; #TpProjet.Accompagnateur.Email');
      const subject = await text('Suivi de #TpProjet.Nom par #TpProjet.Accompagnateur.NomPrenom.');
      const rules = ['TpAnnuaire', 'TpServices'].map(t => GristAPI.getLinkRule(t));
      const pass = to === 'jean.dupont@ex.fr' && cc === 'anne.martin@ex.fr; jean.dupont@ex.fr' && subject === 'Suivi de Projet Alpha par Dupont Jean.' && rules.every(r => !r);
      return { pass, notes: JSON.stringify({ to, cc, subject, rules }) };
    },
  });

  cases.push({
    id: 'vartextpath_two_hops_and_path_from_the_page_table',
    description: 'Un chemin de deux références (#TpProjet.Accompagnateur.Service.Nom) et un chemin qui part de la table de la page (#TpNotifications.Projet.Accompagnateur.Email) se résolvent aussi',
    run: async (h) => {
      await seed(h);
      const service = await text('#TpProjet.Accompagnateur.Service.Nom');
      const fromPage = await text('#TpNotifications.Projet.Accompagnateur.Email');
      const pass = service === 'Juridique' && fromPage === 'jean.dupont@ex.fr';
      return { pass, notes: JSON.stringify({ service, fromPage }) };
    },
  });

  cases.push({
    id: 'vartextpath_plain_keys_and_dots_of_the_text_are_unchanged',
    description: 'Une clé simple garde son sens (#TpProjet.Accompagnateur = le nom), et un point qui n’est pas suivi d’une colonne de la table atteinte reste du texte : fin de phrase, « .pdf », colonne inconnue, deux variables collées',
    run: async (h) => {
      await seed(h);
      const got = {
        reference: await text('#TpProjet.Accompagnateur'),
        sentence: await text('Projet #TpProjet.Nom.'),
        extension: await text('#TpProjet.Nom.pdf'),
        unknownColumn: await text('#TpProjet.Accompagnateur.Inconnue'),
        trailingDot: await text('#TpProjet.Accompagnateur.'),
        adjacent: await text('#TpProjet.Nom#TpProjet.Statut'),
        noVariable: await text('Bonjour, voir #inconnue.Email'),
      };
      const expected = {
        reference: 'Dupont Jean', sentence: 'Projet Projet Alpha.', extension: 'Projet Alpha.pdf', unknownColumn: 'Dupont Jean.Inconnue', trailingDot: 'Dupont Jean.',
        adjacent: 'Projet AlphaEn cours', noVariable: 'Bonjour, voir #inconnue.Email',
      };
      return { pass: JSON.stringify(got) === JSON.stringify(expected), notes: JSON.stringify({ got, expected }) };
    },
  });

  cases.push({
    id: 'vartextpath_empty_or_missing_reference_gives_empty_text',
    description: 'Une référence vide (accompagnateur non renseigné) ou vers une ligne disparue laisse la place vide, sans message d’erreur dans l’objet ni dans l’adresse ; même chose pour la ligne d’un export en lot (fetchTable)',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const template = 'A=#TpProjet.Accompagnateur.Email|P=#TpProjet.Porteur.Email';
      const live = [await text(template), await text(template, RECORD_2)];
      const batch = [];
      for (const row of rows) batch.push(await text(template, row));
      const pass = JSON.stringify(live) === JSON.stringify(['A=jean.dupont@ex.fr|P=anne.martin@ex.fr', 'A=|P=durand:paul@ex.fr'])
        && JSON.stringify(batch) === JSON.stringify(['A=jean.dupont@ex.fr|P=anne.martin@ex.fr', 'A=|P=durand:paul@ex.fr', 'A=|P=jean.dupont@ex.fr']);
      return { pass, notes: JSON.stringify({ live, batch }) };
    },
  });

  cases.push({
    id: 'vartextpath_pdf_filename_resolves_a_path_and_sanitizes',
    description: 'Le nom du PDF résout aussi #TpProjet.Accompagnateur.Email (le caractère interdit d’une valeur devient « _ »), pour la ligne affichée comme pour chaque ligne d’un export en lot ; un nom sans variable ne change pas',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const template = 'Suivi_#TpProjet.Porteur.Email';
      const live = [await filename(template), await filename(template, RECORD_2)];
      const batch = [];
      for (const row of rows) batch.push(await filename(template, row));
      const plain = await filename('Courrier');
      const empty = await filename('');
      const pass = JSON.stringify(live) === JSON.stringify(['Suivi_anne.martin@ex.fr', 'Suivi_durand_paul@ex.fr'])
        && JSON.stringify(batch) === JSON.stringify(['Suivi_anne.martin@ex.fr', 'Suivi_durand_paul@ex.fr', 'Suivi_jean.dupont@ex.fr']) && plain === 'Courrier' && empty === 'publipostage';
      return { pass, notes: JSON.stringify({ live, batch, plain, empty }) };
    },
  });

  cases.push({
    id: 'vartextpath_follows_the_configured_trigger_char',
    description: 'La touche de déclenchement choisie dans les Réglages vaut pour les chemins comme pour les clés simples, dans les champs email comme dans le nom du PDF',
    run: async (h) => {
      await seed(h);
      let storage = true;
      let viaText;
      let viaFilename;
      let leftover;
      try {
        localStorage.setItem('pp_trigger_char', '$');
        viaText = await text('$TpProjet.Accompagnateur.Email');
        viaFilename = await filename('Suivi_$TpProjet.Accompagnateur.Email');
        leftover = await text('#TpProjet.Nom');
      } catch (e) { storage = false; } finally {
        try { localStorage.removeItem('pp_trigger_char'); } catch (e) { /* rien à remettre */ }
      }
      const pass = storage && viaText === 'jean.dupont@ex.fr' && viaFilename === 'Suivi_jean.dupont@ex.fr' && leftover === '#TpProjet.Nom';
      return { pass, notes: JSON.stringify({ storage, viaText, viaFilename, leftover }) };
    },
  });

  // --- Saisie assistée : la liste # sous les champs texte. `type` écrit dans le champ comme une frappe (le curseur derrière), `press` envoie une touche à sa zone de
  // saisie ; `listed` relit les lignes de la liste comme on les lit à l'écran (null = fermée). ---
  const acBox = () => document.getElementById('autocomplete-box');
  const listed = () => (acBox() && acBox().style.display !== 'none' ? Array.from(acBox().querySelectorAll('.ac-item')).map(e => e.textContent) : null);
  async function type(h, input, value) { await h.fieldType(input.id, value); }
  const press = (input, key) => window.TestHelpers.fieldKey(input.id, key);
  async function reset(h, input) { press(input, 'Escape'); input.value = ''; await h.sleep(10); }
  const field = id => document.getElementById(id);
  const sameSet = (got, expected) => JSON.stringify((got || []).slice().sort()) === JSON.stringify(expected.slice().sort());

  cases.push({
    id: 'vartextpath_assist_lists_the_columns_of_the_linked_row_after_the_dot',
    description: 'Dans le champ À, après « #TpProjet.Accompagnateur. » la liste propose les colonnes de l’annuaire (sans colonne d’aide), se filtre à la frappe, et Entrée met le chemin entier à la place de la saisie ; le chemin se résout ensuite en l’email',
    run: async (h) => {
      await seed(h);
      const to = field('v2-email-to');
      await type(h, to, '#TpProjet.Accompagnateur.');
      const all = listed();
      await type(h, to, '#TpProjet.Accompagnateur.em');
      const filtered = listed();
      press(to, 'Enter');
      await h.sleep(30);
      const value = to.value;
      const closed = listed() === null;
      const resolved = await text(value);
      await reset(h, to);
      const pass = sameSet(all, ['TpProjet.Accompagnateur.NomPrenom', 'TpProjet.Accompagnateur.Email', 'TpProjet.Accompagnateur.Service'])
        && JSON.stringify(filtered) === JSON.stringify(['TpProjet.Accompagnateur.Email']) && value === '#TpProjet.Accompagnateur.Email' && closed && resolved === 'jean.dupont@ex.fr';
      return { pass, notes: JSON.stringify({ all, filtered, value, closed, resolved }) };
    },
  });

  cases.push({
    id: 'vartextpath_assist_continues_through_a_second_reference_and_after_text',
    description: 'La liste continue de référence en référence (« #TpProjet.Accompagnateur.Service. » propose les colonnes des services), même au milieu d’une phrase, et le texte avant le # est conservé à l’insertion',
    run: async (h) => {
      await seed(h);
      const subject = field('v2-email-subject');
      await type(h, subject, 'Suivi de #TpProjet.Accompagnateur.Service.');
      const second = listed();
      press(subject, 'Enter');
      await h.sleep(30);
      const value = subject.value;
      const resolved = await text(value);
      await reset(h, subject);
      const pass = JSON.stringify(second) === JSON.stringify(['TpProjet.Accompagnateur.Service.Nom']) && value === 'Suivi de #TpProjet.Accompagnateur.Service.Nom' && resolved === 'Suivi de Juridique';
      return { pass, notes: JSON.stringify({ second, value, resolved }) };
    },
  });

  cases.push({
    id: 'vartextpath_assist_plain_list_filters_across_the_dot_and_closes_on_text',
    description: 'Une saisie qui n’est pas un chemin de références filtre les clés « Table.Colonne » (le point ne ferme plus la liste : « #TpProjet.Acc » propose TpProjet.Accompagnateur) ; après une colonne qui n’est pas une Référence, une colonne ou une table inconnue, ou du texte sans #, la liste se ferme',
    run: async (h) => {
      await seed(h);
      const cc = field('v2-email-cc');
      const seen = {};
      for (const [name, value] of Object.entries({
        table: '#TpProjet', dotted: '#TpProjet.Acc', notReference: '#TpProjet.Nom.', unknownColumn: '#TpProjet.Inconnue.', unknownTable: '#Inconnue.Nom.', noTrigger: 'Bonjour.',
        endOfSentence: 'Voir #TpProjet.Nom.',
      })) {
        await type(h, cc, value);
        seen[name] = listed();
        await reset(h, cc);
      }
      const pass = !!seen.table && seen.table.includes('TpProjet.Nom') && seen.table.includes('TpProjet.Accompagnateur')
        && JSON.stringify(seen.dotted) === JSON.stringify(['TpProjet.Accompagnateur']) && seen.notReference === null && seen.unknownColumn === null && seen.unknownTable === null
        && seen.noTrigger === null && seen.endOfSentence === null;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'vartextpath_assist_works_in_the_pdf_filename_field_and_a_click_picks_an_entry',
    description: 'Le champ « Nom de fichier PDF » a la même liste (chemin, texte avant le #, nom de fichier résolu) ; un clic sur une ligne de la liste insère sa clé, comme avant pour une clé simple',
    run: async (h) => {
      await seed(h);
      const name = field('pdf-filename-template');
      await type(h, name, 'Suivi_#TpProjet.Porteur.NomP');
      const listedPath = listed();
      press(name, 'Enter');
      await h.sleep(30);
      const pathValue = name.value;
      const fileName = await filename(pathValue);
      await reset(h, name);
      await type(h, name, '#TpProjet.No');
      const plainRow = acBox() && Array.from(acBox().querySelectorAll('.ac-item')).find(e => e.textContent === 'TpProjet.Nom');
      if (plainRow) plainRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(30);
      const plainValue = name.value;
      const closedAfterClick = listed() === null;
      await reset(h, name);
      const pass = JSON.stringify(listedPath) === JSON.stringify(['TpProjet.Porteur.NomPrenom']) && pathValue === 'Suivi_#TpProjet.Porteur.NomPrenom' && fileName === 'Suivi_Martin Anne'
        && !!plainRow && plainValue === '#TpProjet.Nom' && closedAfterClick;
      return { pass, notes: JSON.stringify({ listedPath, pathValue, fileName, plainValue, closedAfterClick, plainRow: !!plainRow }) };
    },
  });

  cases.push({
    id: 'vartextpath_assist_stays_closed_after_a_pick_and_behind_a_complete_key',
    description: 'La liste ne se rouvre pas sur la clé qu’un choix vient de poser (même quand une autre clé la contient : TpProjet.Nom / TpProjet.NomLong), ni quand une clé tapée en entier est seule à correspondre, ni quand le curseur revient derrière une variable complète (Début, Fin) ; elle reste ouverte tant que la saisie peut encore se compléter',
    run: async (h) => {
      await seed(h);
      const to = field('v2-email-to');
      await type(h, to, '#TpProjet.Nom');
      const ambiguous = listed();
      press(to, 'Enter');
      await h.sleep(30);
      const afterPick = { value: to.value, list: listed() };
      await reset(h, to);
      await type(h, to, '#TpProjet.Accompagnateur.Email');
      const typedInFull = listed();
      await h.fieldSelect(to.id, 1);
      const caretAtStart = listed();
      await h.fieldSelect(to.id, h.fieldEnd(to.id));
      const caretBehind = listed();
      await reset(h, to);
      await type(h, to, '#TpProjet.Accompagnateur.Emai');
      const almostComplete = listed();
      await reset(h, to);
      const pass = JSON.stringify(ambiguous) === JSON.stringify(['TpProjet.Nom', 'TpProjet.NomLong']) && afterPick.value === '#TpProjet.Nom' && afterPick.list === null
        && typedInFull === null && caretAtStart === null && caretBehind === null && JSON.stringify(almostComplete) === JSON.stringify(['TpProjet.Accompagnateur.Email']);
      return { pass, notes: JSON.stringify({ ambiguous, afterPick, typedInFull, caretAtStart, caretBehind, almostComplete }) };
    },
  });

  // --- Clé de correspondance des champs texte (retour d'Antoine du 2026-10-02, point 4 : « les variables dans le titre de l'export ne déclenchent pas la modale de choix des références
  // le cas échéant, ou la référence ne se résout pas bien (message d'erreur à la place de la valeur) »). Une variable d'une AUTRE table demande sa clé quand on la choisit dans la liste
  // # d'un champ texte, comme à l'insertion d'une bulle du corps ; sans clé, la colonne Référence de la page qui mène à cette table suffit, y compris pour la ligne affichée. ---
  const keyWindow = () => document.getElementById('link-config-modal');
  const keyWindowOpen = () => !!keyWindow() && keyWindow().style.display === 'flex';
  const closeKeyWindow = async (h) => { if (keyWindowOpen()) { document.getElementById('link-config-cancel').click(); await h.sleep(40); } };
  const TEXT_FIELDS = ['pdf-filename-template', 'v2-email-subject', 'v2-email-to', 'v2-email-cc', 'v2-email-cci'];
  const ruleOf = table => { const rule = GristAPI.getLinkRule(table); return rule ? [rule.mode, rule.colonneCible, rule.colonneSource] : null; };

  cases.push({
    id: 'vartextpath_a_table_the_page_refers_to_resolves_without_a_key_from_the_displayed_record',
    description: 'Sans clé de correspondance pour TpProjet, la colonne Référence de la page qui y mène suffit : #TpProjet.Nom et #TpProjet.Accompagnateur.Email se résolvent dans le nom du PDF et dans les champs email pour la ligne affichée (grist.onRecord livre le texte « Projet Alpha », pas l’identifiant de ligne) comme pour chaque ligne d’un export en lot, jamais en « [ERREUR: ligne introuvable dans TpProjet] »',
    run: async (h) => {
      await seed(h);
      await GristAPI.deleteLinkRule('TpProjet');
      const rows = await GristAPI.fetchTableRows(PAGE);
      const template = '#TpNotifications.Titre - #TpProjet.Nom (#TpProjet.Accompagnateur.Email)';
      const live = [await filename(template), await filename(template, RECORD_2)];
      const subject = await text(template);
      const batch = [];
      for (const row of rows) batch.push(await filename(template, row));
      const expectedLive = ['Notif 1 - Projet Alpha (jean.dupont@ex.fr)', 'Notif 2 - Projet Beta ()'];
      const expectedBatch = [...expectedLive, 'Notif 3 - Projet Gamma ()'];
      const pass = JSON.stringify(live) === JSON.stringify(expectedLive) && subject === expectedLive[0] && JSON.stringify(batch) === JSON.stringify(expectedBatch) && !ruleOf('TpProjet');
      return { pass, notes: JSON.stringify({ live, subject, batch, rule: ruleOf('TpProjet') }) };
    },
  });

  cases.push({
    id: 'vartextpath_picking_a_variable_of_an_unlinked_table_opens_the_key_window_in_every_text_field',
    description: 'Choisir #TpProjet.Nom dans la liste du nom du PDF, de l’Objet, de À, de Cc ou de Cci, alors que TpProjet n’a pas de clé de correspondance, ouvre la fenêtre de la clé « TpNotifications → TpProjet » (comme l’insertion d’une bulle du corps) ; tant qu’elle est ouverte, le champ garde le texte tapé',
    run: async (h) => {
      await seed(h);
      await GristAPI.deleteLinkRule('TpProjet');
      const seen = {};
      try {
        for (const id of TEXT_FIELDS) {
          const input = field(id);
          await type(h, input, 'Suivi_#TpProjet.No');
          press(input, 'Enter');
          await h.sleep(200);
          const open = keyWindowOpen();
          seen[id] = { open, title: open ? document.getElementById('link-config-title').textContent : null, value: input.value };
          await closeKeyWindow(h);
          await reset(h, input);
        }
      } finally { await closeKeyWindow(h); }
      const pass = TEXT_FIELDS.every(id => seen[id].open && seen[id].title === 'TpNotifications → TpProjet' && seen[id].value === 'Suivi_#TpProjet.No');
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'vartextpath_the_key_confirmed_inserts_the_variable_and_the_key_cancelled_inserts_nothing',
    description: 'Dans le nom du PDF, la clé refusée ne pose rien (le texte tapé reste, aucune règle n’est écrite, la liste est fermée) ; la clé confirmée (celle que la fenêtre propose : identifiant de ligne = colonne Projet) est enregistrée, la variable est posée à la place de la saisie et le nom se résout pour la ligne affichée',
    run: async (h) => {
      await seed(h);
      await GristAPI.deleteLinkRule('TpProjet');
      const name = field('pdf-filename-template');
      let cancelled; let confirmed; let resolved;
      try {
        await type(h, name, 'Suivi_#TpProjet.No');
        press(name, 'Enter');
        await h.sleep(200);
        const wasOpen = keyWindowOpen();
        document.getElementById('link-config-cancel').click();
        await h.sleep(60);
        cancelled = { wasOpen, open: keyWindowOpen(), value: name.value, rule: ruleOf('TpProjet'), list: listed() };
        await reset(h, name);
        await type(h, name, 'Suivi_#TpProjet.No');
        press(name, 'Enter');
        await h.sleep(200);
        const reOpened = keyWindowOpen();
        document.getElementById('link-config-confirm').click();
        await h.sleep(120);
        confirmed = { reOpened, open: keyWindowOpen(), value: name.value, rule: ruleOf('TpProjet'), list: listed() };
        resolved = await filename(name.value);
      } finally { await closeKeyWindow(h); await reset(h, name); }
      const pass = cancelled.wasOpen && !cancelled.open && cancelled.value === 'Suivi_#TpProjet.No' && cancelled.rule === null && cancelled.list === null
        && confirmed.reOpened && !confirmed.open && confirmed.value === 'Suivi_#TpProjet.Nom' && JSON.stringify(confirmed.rule) === JSON.stringify(['match', 'id', 'Projet']) && confirmed.list === null && resolved === 'Suivi_Projet Alpha';
      return { pass, notes: JSON.stringify({ cancelled, confirmed, resolved }) };
    },
  });

  cases.push({
    id: 'vartextpath_picking_a_variable_of_a_linked_table_or_of_the_page_table_asks_nothing',
    description: 'Une variable de la table de la page, d’une table déjà liée ou d’un chemin qui part d’une table liée (#TpProjet.Accompagnateur.Email) se pose sans aucune fenêtre, comme avant',
    run: async (h) => {
      await seed(h);
      const to = field('v2-email-to');
      const seen = {};
      try {
        for (const [name, typed] of Object.entries({ page: '#TpNotifications.Ti', linked: '#TpProjet.No', path: '#TpProjet.Accompagnateur.Em' })) {
          await type(h, to, typed);
          press(to, 'Enter');
          await h.sleep(150);
          seen[name] = { open: keyWindowOpen(), value: to.value };
          await closeKeyWindow(h);
          await reset(h, to);
        }
      } finally { await closeKeyWindow(h); }
      const pass = !seen.page.open && !seen.linked.open && !seen.path.open
        && seen.page.value === '#TpNotifications.Titre' && seen.linked.value === '#TpProjet.Nom' && seen.path.value === '#TpProjet.Accompagnateur.Email';
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varTextPath = cases;
})();
