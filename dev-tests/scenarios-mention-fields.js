// Suite "mentionFields" - la pastille « @ » dans les champs texte (Objet, À, Cc, Cci, nom du PDF : js/field-editor.js ; js/mention.js, js/field-codec.js, js/reader-mode.js:fieldText,
// js/floating-toolbars.js:attachMentionToolbar), suite de la demande d'Antoine du 2026-11-17 : « dans le champ "à" d'un email je n'arrive pas à saisir des genre avec "@" ? » puis, devant
// ma question - une adresse avec « @ » se tape déjà -, « moi je parle bien du @ pour une fiche oui » et « bien s'assurer que l'on puisse échap et sortir si jamais ça ouvre si on tape un
// email avec l'arobase avant le nom de domaine ». Trois moitiés :
//  1) la SAISIE : « @ » en début de mot ouvre la liste des fiches dans chaque champ et le choix pose la pastille ; une adresse tapée (marie@exemple.fr) n'ouvre rien ; Échap ferme la liste en
//     gardant le texte tapé (et elle ne se rouvre pas à la lettre suivante, un nouveau « @ » la rouvre) ; une liste sans ligne (« Aucune fiche ») ne prend ni Entrée ni Tab ; le champ des
//     pièces jointes n'a pas de pastille ;
//  2) l'ENREGISTREMENT et la LECTURE : la valeur du champ passe en HTML (la pastille écrite comme dans le corps d'un modèle) et se relit à l'identique, le texte brut d'avant ne bouge pas,
//     l'objet, les adresses et le nom du fichier lisent le nom d'aujourd'hui de la fiche - quelle que soit la ligne de la page -, « [Fiche introuvable] » quand sa ligne n'existe plus ;
//  3) la BARRE : une pastille sélectionnée dans un champ a « Autres colonnes de la même fiche » (l'Email de la personne dans « À »), la mise en forme selon la ligne y est grisée avec sa raison,
//     et le collage d'une pastille du document garde sa fiche sans sa mise en forme.
// La frappe au vrai clavier, la vraie souris et le panneau de 700x400 sont dans verify-mention-fields-mouse.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SUBJECT = 'v2-email-subject';
  const TO = 'v2-email-to';
  const CC = 'v2-email-cc';
  const CCI = 'v2-email-cci';
  const FILE = 'pdf-filename-template';
  const PJ = 'v2-email-pj';
  const ALL_FIELDS = [SUBJECT, TO, CC, CCI, FILE];
  const PEOPLE = 'MfPersonnes';
  const FILES = 'MfDossiers';
  const TABLE = 'Publipostage_Modeles';
  const people = [
    { id: 1, Email: 'jean.dupont@example.fr', NomComplet: 'Jean Dupont', Poste: 'Maire' },
    { id: 2, Email: 'marie.martin@example.fr', NomComplet: 'Marie Martin', Poste: 'Adjointe' },
    { id: 3, Email: 'marc.armand@example.fr', NomComplet: 'Marc Armand', Poste: 'Trésorier' },
  ];
  const REC_1 = { id: 1, Titre: 'Dossier Alpha', Statut: 'Urgent' };
  const REC_2 = { id: 2, Titre: 'Dossier Bêta', Statut: 'Normal' };

  const field = id => document.getElementById(id);
  const editorOf = id => FieldEditor.of(field(id));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Une pastille telle que le champ l'enregistre.
  const chip = (row, column, label) => Mention.html({ table: PEOPLE, row, column, label });
  const rich = html => '<p class="pp-field">' + html + '</p>';
  const mentionsOf = id => {
    const found = [];
    editorOf(id).state.doc.descendants((node, pos) => { if (node.type.name === 'mention') found.push({ node, pos, attrs: { table: node.attrs.table, row: node.attrs.row, column: node.attrs.column, label: node.attrs.label } }); });
    return found;
  };
  // Le texte du champ comme le presse-papiers l'écrit : une pastille y est le nom de sa fiche (`doc.textContent` ne compte pas les atomes).
  const textOf = id => FieldCodec.serializePlain(FieldCodec.itemsOf(field(id).value));

  // La liste « @ » : ses lignes (null quand elle est fermée), sa ligne d'état (« Aucune fiche »), un appui sur une ligne (mousedown, avant le blur du champ, comme la souris).
  const boxOf = () => document.getElementById('mention-box');
  const isOpen = () => { const box = boxOf(); return !!box && box.style.display !== 'none'; };
  const rowsShown = () => (isOpen() ? Array.from(boxOf().querySelectorAll('.ex-item .mention-name')).map(e => e.textContent) : null);
  const statusShown = () => { const e = isOpen() && boxOf().querySelector('.ex-status'); return e ? e.textContent : null; };
  function pickRow(label) {
    const row = isOpen() && Array.from(boxOf().querySelectorAll('.ex-item')).find(e => e.querySelector('.mention-name').textContent === label);
    if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return !!row;
  }
  // La valeur lue pour la ligne `record` de la page, dans une langue donnée.
  const text = (value, record) => Variables.resolveTextVariables(value, FILES, record || REC_1);
  const filename = (value, record) => ReaderMode.resolveFilename(value, FILES, record || REC_1);

  async function seed(h) {
    await h.resetEditor();
    const s = stub();
    s.state.tables.filter(t => /^Mf[A-Z]/.test(t)).forEach(t => s.dropTable(t));
    s.setVariables(PEOPLE, { Email: 'Text', NomComplet: 'Text', Poste: 'Text' });
    s.setRows(PEOPLE, people);
    // Une colonne Référence vers les personnes, montrée par leur nom : c'est ce qui nomme les fiches de la liste (Mention.labelColumnOf), sinon leur première colonne de texte - l'Email.
    s.setVariables(FILES, { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:' + PEOPLE, gristHelper_Display: 'Text' }, null, { Responsable: 'gristHelper_Display' }, { Responsable: 'NomComplet' });
    s.setRows(FILES, [Object.assign({ Responsable: 2, gristHelper_Display: 'Marie Martin' }, REC_1), Object.assign({ Responsable: 1, gristHelper_Display: 'Jean Dupont' }, REC_2)]);
    await GristAPI.refreshSchema();
    Mention.reset();
    s.fireRecord(Object.assign({}, REC_1), FILES);
    await h.sleep(60);
  }
  async function finish() {
    stub().state.tables.filter(t => /^Mf[A-Z]/.test(t)).forEach(t => stub().dropTable(t));
    await GristAPI.refreshSchema();
    Mention.reset();
  }
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await h.sleep(300); }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await h.sleep(300); }

  // Un scénario : décor neuf (trois personnes, deux dossiers, la page sur le premier), un nouveau modèle email (les champs ont alors une boîte à l'écran) ; à la fin les champs sont vidés,
  // la liste fermée, la langue et le modèle d'avant remis.
  function scenario(id, description, body, options) {
    const opts = options || {};
    cases.push({
      id, description,
      run: async (h) => {
        const lang = I18n.getLang();
        const rows = stub().state.rows[TABLE];
        const backup = opts.templates ? JSON.parse(JSON.stringify(rows)) : null;
        const keptCurrent = Templates.getCurrentId();
        await seed(h);
        try {
          if (!opts.document) await newEmail(h);
          return await body(h);
        } finally {
          I18n.setLang(lang);
          Mention.hideList();
          await h.sleep(40);
          ALL_FIELDS.concat(PJ).forEach(fieldId => { const host = field(fieldId); host.readOnly = false; host.value = ''; });
          if (document.getElementById('btn-mode-edit') && document.getElementById('btn-mode-edit').getAttribute('aria-pressed') === 'false') await h.clickButton('btn-mode-edit');
          await newDocument(h);
          if (backup) {
            stub().state.rows[TABLE] = backup;
            await Templates.loadAll();
            Templates.setCurrentId(keptCurrent);
          }
          await finish();
          await h.resetEditor();
        }
      },
    });
  }

  // ============================================================================================================
  // 1) La saisie
  // ============================================================================================================
  scenario(
    'mentionfields_at_opens_the_list_of_fiches_in_every_field_and_the_choice_sets_a_chip',
    'Dans chacun des cinq champs (Objet, À, Cc, Cci, nom du PDF), « Madame @Mar » ouvre la liste des fiches (Marc Armand, Marie Martin), un appui sur « Marie Martin » pose la pastille violette de CETTE ligne à la place de « @Mar », le texte « Madame » reste, et la valeur du champ s’enregistre en HTML avec la fiche (table, ligne, colonne) ; elle se relit à l’identique.',
    async (h) => {
      const seen = {};
      for (const id of ALL_FIELDS) {
        field(id).value = '';
        await h.fieldType(id, 'Madame @Mar');
        await h.sleep(250);
        const rows = rowsShown();
        const picked = pickRow('Marie Martin');
        await h.sleep(150);
        const stored = field(id).value;
        const nodes = mentionsOf(id).map(m => m.attrs);
        const again = (() => { field(id).value = stored; return field(id).value; })();
        seen[id] = {
          rows, picked, closed: !isOpen(), nodes, text: textOf(id), rich: FieldCodec.isRich(stored), again: again === stored,
          html: stored.indexOf('class="mention-chip"') !== -1 && stored.indexOf('data-mention-table="' + PEOPLE + '"') !== -1 && stored.indexOf('data-mention-row="2"') !== -1
            && stored.indexOf('data-mention-column="NomComplet"') !== -1,
          chipInDom: editorOf(id).view.dom.querySelectorAll('.mention-chip').length,
        };
      }
      const ok = ALL_FIELDS.every(id => {
        const r = seen[id];
        return same(r.rows, ['Marc Armand', 'Marie Martin']) && r.picked && r.closed && same(r.nodes, [{ table: PEOPLE, row: 2, column: 'NomComplet', label: 'Marie Martin' }])
          && r.text === 'Madame Marie Martin' && r.rich && r.again && r.html && r.chipInDom === 1;
      });
      return { pass: ok, notes: JSON.stringify(seen) };
    },
  );

  scenario(
    'mentionfields_an_address_typed_with_an_arobase_opens_nothing_and_stays_plain_text',
    'Une adresse tapée (« marie.martin@example.fr, jean.dupont@example.fr ») dans À, Cc, Cci, l’Objet ou le nom du PDF n’ouvre aucune liste - le « @ » n’en ouvre une qu’en début de mot - et reste du texte brut, sans HTML ni pastille : la valeur enregistrée est celle d’avant ce changement ; la lire donne les adresses telles qu’elles ont été tapées.',
    async (h) => {
      const seen = {};
      for (const id of ALL_FIELDS) {
        field(id).value = '';
        await h.fieldType(id, 'marie.martin@example.fr, jean.dupont@example.fr');
        await h.sleep(200);
        seen[id] = { open: isOpen(), stored: field(id).value, mentions: mentionsOf(id).length, rich: FieldCodec.isRich(field(id).value), read: await text(field(id).value) };
      }
      const ok = ALL_FIELDS.every(id => !seen[id].open && seen[id].stored === 'marie.martin@example.fr, jean.dupont@example.fr' && seen[id].mentions === 0 && !seen[id].rich
        && seen[id].read === 'marie.martin@example.fr, jean.dupont@example.fr');
      return { pass: ok, notes: JSON.stringify(seen) };
    },
  );

  scenario(
    'mentionfields_escape_closes_the_list_and_keeps_what_was_typed',
    'Quand la liste s’ouvre sur un « @ » que l’on voulait en texte (« écrire à @Mar »), Échap la ferme et le texte tapé reste tel quel, enregistré en texte brut ; elle ne se rouvre pas à la lettre suivante (« ie ») et un nouveau « @ » la rouvre. Dans chaque champ.',
    async (h) => {
      const seen = {};
      for (const id of ALL_FIELDS) {
        field(id).value = '';
        await h.fieldType(id, 'écrire à @Mar');
        await h.sleep(250);
        const opened = isOpen() && rowsShown().length === 2;
        const taken = h.fieldKey(id, 'Escape');
        await h.sleep(60);
        const closed = !isOpen();
        const kept = { text: textOf(id), stored: field(id).value, mentions: mentionsOf(id).length };
        await h.fieldType(id, 'ie', true);
        await h.sleep(250);
        const stillClosed = !isOpen();
        await h.fieldType(id, ' puis @Jea', true);
        await h.sleep(250);
        const reopened = isOpen() && same(rowsShown(), ['Jean Dupont']);
        h.fieldKey(id, 'Escape');
        seen[id] = { opened, taken, closed, kept, stillClosed, reopened, after: field(id).value };
      }
      const ok = ALL_FIELDS.every(id => {
        const r = seen[id];
        return r.opened && r.taken && r.closed && r.kept.text === 'écrire à @Mar' && r.kept.stored === 'écrire à @Mar' && r.kept.mentions === 0 && r.stillClosed && r.reopened
          && r.after === 'écrire à @Marie puis @Jea';
      });
      return { pass: ok, notes: JSON.stringify(seen) };
    },
  );

  scenario(
    'mentionfields_a_list_without_a_line_takes_neither_enter_nor_tab',
    'Un « @ » qui ne trouve aucune fiche (« envoi @zzzz ») montre « Aucune fiche » sans ligne à choisir : Entrée garde son rôle de champ (l’évènement `fieldenter`) et Tab n’est pas pris - on ne reste jamais coincé dans une liste -, et Échap ferme la ligne d’état. Avec une fiche à choisir, Entrée la pose et ne valide pas le champ.',
    async (h) => {
      const seen = {};
      const entered = [];
      const listen = event => entered.push(event.target.id);
      [TO, SUBJECT].forEach(id => field(id).addEventListener('fieldenter', listen));
      try {
        for (const id of [TO, SUBJECT]) {
          field(id).value = '';
          await h.fieldType(id, 'envoi @zzzz');
          await h.sleep(250);
          const status = statusShown();
          const rowsNone = !rowsShown() || rowsShown().length === 0;
          const tab = h.fieldKey(id, 'Tab');
          entered.length = 0;
          const enter = h.fieldKey(id, 'Enter');
          const enterReached = entered.slice();
          const escape = h.fieldKey(id, 'Escape');
          await h.sleep(60);
          const closed = !isOpen();
          // Une fiche à choisir : Entrée la pose, le champ n'est pas validé.
          field(id).value = '';
          await h.fieldType(id, '@Marie');
          await h.sleep(250);
          entered.length = 0;
          const pick = h.fieldKey(id, 'Enter');
          await h.sleep(150);
          seen[id] = { status, rowsNone, tab, enter, enterReached, escape, closed, pick, entered: entered.slice(), nodes: mentionsOf(id).map(m => m.attrs.label) };
        }
      } finally { [TO, SUBJECT].forEach(id => field(id).removeEventListener('fieldenter', listen)); }
      const ok = [TO, SUBJECT].every(id => {
        const r = seen[id];
        return r.status === I18n.t('mention.none') && r.rowsNone && r.tab === false && r.enterReached.length === 1 && r.escape === true && r.closed
          && r.pick === true && r.entered.length === 0 && same(r.nodes, ['Marie Martin']);
      });
      return { pass: ok, notes: JSON.stringify(seen) };
    },
  );

  scenario(
    'mentionfields_the_attachments_field_has_no_chip',
    'Le champ des pièces jointes (PJ) ne cite que des colonnes Pièces jointes : « @Mar » n’y ouvre pas la liste des fiches, son éditeur n’a pas le nœud pastille, et une pastille d’une valeur enregistrée s’y lit comme le texte qu’elle est ; les cinq autres champs ont le nœud.',
    async (h) => {
      const pj = editorOf(PJ);
      field(PJ).value = '';
      await h.fieldType(PJ, '@Mar');
      await h.sleep(250);
      const opened = isOpen();
      field(PJ).value = rich('a ' + chip(2, 'NomComplet', 'Marie Martin'));
      const nodes = !!pj.schema.nodes.mention;
      const others = ALL_FIELDS.map(id => !!editorOf(id).schema.nodes.mention);
      return { pass: !opened && !nodes && others.every(Boolean) && mentionsOf(PJ).length === 0, notes: JSON.stringify({ opened, nodes, others, text: textOf(PJ) }) };
    },
  );

  // ============================================================================================================
  // 2) L'enregistrement et la lecture
  // ============================================================================================================
  scenario(
    'mentionfields_the_stored_value_is_the_chip_html_and_reads_back_the_same',
    'La valeur d’un champ qui porte une pastille est le HTML `<p class="pp-field">` avec la fiche, la pastille écrite comme dans le corps d’un modèle ; poser cette valeur sur le champ puis la lire rend la même (Objet, À, nom du PDF), une pastille et du texte autour gardent leur ordre, et le texte brut d’avant (« Suivi #MfDossiers.Titre ») n’a pas bougé.',
    async (h) => {
      const value = rich('Madame ' + chip(2, 'NomComplet', 'Marie Martin') + ', cc ' + chip(1, 'Email', 'jean.dupont@example.fr') + ' !');
      const seen = {};
      for (const id of [SUBJECT, TO, FILE]) {
        field(id).value = value;
        const back = field(id).value;
        seen[id] = { same: back === value, nodes: mentionsOf(id).map(m => m.attrs), text: textOf(id) };
      }
      field(SUBJECT).value = 'Suivi #MfDossiers.Titre';
      const old = field(SUBJECT).value;
      const items = FieldCodec.itemsOf(value);
      const ok = Object.keys(seen).every(id => seen[id].same && seen[id].text === 'Madame Marie Martin, cc jean.dupont@example.fr !'
        && same(seen[id].nodes.map(n => n.row + ':' + n.column), ['2:NomComplet', '1:Email']))
        && old === 'Suivi #MfDossiers.Titre' && !FieldCodec.isRich(old)
        && items.length === 5 && FieldCodec.isMention(items[1]) && FieldCodec.serializePlain(items) === 'Madame Marie Martin, cc jean.dupont@example.fr !'
        && FieldCodec.toStored(items) === value;
      return { pass: ok, notes: JSON.stringify({ seen, old, items }) };
    },
  );

  scenario(
    'mentionfields_the_subject_the_addresses_and_the_file_name_read_the_fiche_whatever_the_page_shows',
    'Objet, À et nom du PDF écrivent le nom d’aujourd’hui de la fiche citée - « Madame Marie Martin », « marie.martin@example.fr » quand la pastille lit sa colonne Email - pour chacune des deux lignes de la page, jamais celui de la ligne affichée ; le nom du fichier remplace les caractères interdits (« Dossier/Marie: Martin »), et la fiche renommée dans Grist se relit renommée.',
    async (h) => {
      field(SUBJECT).value = rich('Madame ' + chip(2, 'NomComplet', 'Marie Martin'));
      field(TO).value = rich(chip(2, 'Email', 'marie.martin@example.fr'));
      field(FILE).value = rich('Dossier ' + chip(2, 'NomComplet', 'Marie Martin'));
      const read = async record => ({
        subject: await text(field(SUBJECT).value, record), to: await text(field(TO).value, record), file: await filename(field(FILE).value, record),
      });
      const one = await read(REC_1);
      const two = await read(REC_2);
      // Renommée dans Grist : la pastille relit la table (la lecture partagée garde ses dix secondes).
      stub().setRows(PEOPLE, people.map(p => (p.id === 2 ? Object.assign({}, p, { NomComplet: 'Marie / Martin-Durand: l\'élue' }) : p)));
      Mention.reset();
      const renamed = await read(REC_1);
      const ok = same(one, { subject: 'Madame Marie Martin', to: 'marie.martin@example.fr', file: 'Dossier Marie Martin' }) && same(two, one)
        && renamed.subject === 'Madame Marie / Martin-Durand: l\'élue' && renamed.file === 'Dossier Marie _ Martin-Durand_ l\'élue';
      return { pass: ok, notes: JSON.stringify({ one, two, renamed }) };
    },
  );

  scenario(
    'mentionfields_a_fiche_that_no_longer_exists_reads_fiche_introuvable_and_the_chip_turns_red',
    'La ligne de la fiche supprimée dans Grist : le champ écrit « [Fiche introuvable] » (comme le corps d’un modèle) pour chaque ligne de la page, sans faire échouer la lecture, et la pastille du champ rougit avec la raison en info-bulle ; une table disparue aussi.',
    async (h) => {
      field(TO).value = rich('à ' + chip(2, 'Email', 'marie.martin@example.fr'));
      field(SUBJECT).value = rich('Pour ' + chip(1, 'NomComplet', 'Jean Dupont'));
      stub().setRows(PEOPLE, people.filter(p => p.id !== 2));
      Mention.reset();
      await Mention.items('');
      const to = await text(field(TO).value);
      const subjectOk = await text(field(SUBJECT).value);
      Mention.markChips(editorOf(TO).view.dom);
      await sleep(150);
      Mention.markChips(editorOf(TO).view.dom);
      const dom = editorOf(TO).view.dom.querySelector('.mention-chip');
      const red = { broken: dom.classList.contains('mention-chip-broken'), title: dom.title };
      stub().dropTable(PEOPLE);
      await GristAPI.refreshSchema();
      Mention.reset();
      const gone = await text(field(SUBJECT).value);
      const missing = I18n.t('reader.mentionMissing');
      const ok = to === 'à ' + missing && subjectOk === 'Pour Jean Dupont' && red.broken && red.title.length > 0 && gone === 'Pour ' + missing;
      return { pass: ok, notes: JSON.stringify({ to, subjectOk, red, gone, missing }) };
    },
  );

  scenario(
    'mentionfields_the_chip_of_a_field_reads_through_the_address_checks_of_the_mail_pipeline',
    'Les adresses d’un email dont À porte deux pastilles « @ » (colonne Email) et un texte tapé se lisent comme celles de tout champ : coupées à la virgule et au point-virgule (MailtoExport.addressesOf, ce qu’ouvrent « Créer l’email » et « Tous les emails… »), valides pour la liste des brouillons (looksLikeAddress) et pour le .eml (EmlExport.parseAddresses) ; une fiche introuvable donne une adresse à vérifier, jamais une adresse valide.',
    async (h) => {
      field(TO).value = rich(chip(2, 'Email', 'marie.martin@example.fr') + '; ' + chip(1, 'Email', 'jean.dupont@example.fr') + ', x@example.fr');
      const read = [];
      for (const record of [REC_1, REC_2]) read.push(await text(field(TO).value, record));
      const list = MailtoExport.addressesOf(read[0]);
      const good = list.every(a => MailtoExport.looksLikeAddress(a));
      const eml = EmlExport.parseAddresses(read[0]).map(a => a.email + ':' + a.valid);
      stub().setRows(PEOPLE, people.filter(p => p.id !== 2));
      Mention.reset();
      const lost = MailtoExport.addressesOf(await text(field(TO).value, REC_1));
      const ok = read[0] === read[1] && same(list, ['marie.martin@example.fr', 'jean.dupont@example.fr', 'x@example.fr']) && good
        && same(eml, ['marie.martin@example.fr:true', 'jean.dupont@example.fr:true', 'x@example.fr:true'])
        && lost.length === 3 && lost[0] === I18n.t('reader.mentionMissing') && !MailtoExport.looksLikeAddress(lost[0]);
      return { pass: ok, notes: JSON.stringify({ read, list, eml, lost }) };
    },
  );

  // ============================================================================================================
  // 3) La barre et le collage
  // ============================================================================================================
  const barOf = () => Array.from(document.querySelectorAll('.v2-mention-toolbar.visible'))[0] || null;
  const linkedModal = () => document.getElementById('var-linked-modal');
  const modalShown = () => { const m = linkedModal(); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; };
  async function selectChip(h, id) {
    const ed = editorOf(id);
    const found = mentionsOf(id)[0];
    ed.view.focus();
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(200);
    return found;
  }

  scenario(
    'mentionfields_the_bar_of_a_chip_in_a_field_offers_the_other_columns_and_greys_the_style',
    'Une pastille sélectionnée dans À a sa barre : « Autres colonnes de la même fiche » (actif) et « Mise en forme conditionnelle » grisé - jamais retiré - avec la raison d’un champ (« Indisponible dans un champ de texte… ») ; « Remplacer » par la colonne Email change la pastille en l’adresse de la personne en un seul Annuler, la lecture écrit l’adresse, et la fenêtre s’ouvre sur la ligne de SA fiche, pas celle de la page.',
    async (h) => {
      field(TO).value = rich(chip(2, 'NomComplet', 'Marie Martin'));
      const ed = editorOf(TO);
      const before = field(TO).value;
      await selectChip(h, TO);
      const bar = barOf();
      const linked = bar && bar.querySelector('button[data-action="mention-linked"]');
      const style = bar && bar.querySelector('button[data-action="mention-style"]');
      const shownBar = { bar: !!bar, linkedOn: !!linked && linked.getAttribute('aria-disabled') !== 'true', styleOff: !!style && style.getAttribute('aria-disabled') === 'true', styleTitle: style ? style.title : '' };
      linked.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(350);
      const open = modalShown();
      const modal = linkedModal();
      const input = modal && modal.querySelector('.var-linked-row[data-col="Email"] input');
      const value = modal && modal.querySelector('.var-linked-row[data-col="Email"]') ? modal.querySelector('.var-linked-row[data-col="Email"]').dataset.value : null;
      if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
      const replace = modal && modal.querySelector('button.var-linked-replace');
      if (replace) replace.click();
      await h.sleep(300);
      const after = { nodes: mentionsOf(TO).map(m => m.attrs), closed: !modalShown(), read: await text(field(TO).value, REC_2) };
      ed.commands.undo();
      await h.sleep(150);
      const undone = field(TO).value === before;
      const ok = shownBar.bar && shownBar.linkedOn && shownBar.styleOff && shownBar.styleTitle === I18n.t('varToolbar.styleInField') && open && value === 'marie.martin@example.fr'
        && same(after.nodes, [{ table: PEOPLE, row: 2, column: 'Email', label: 'marie.martin@example.fr' }]) && after.closed && after.read === 'marie.martin@example.fr' && undone;
      return { pass: ok, notes: JSON.stringify({ shownBar, open, value, after, undone }) };
    },
  );

  scenario(
    'mentionfields_pasting_a_chip_of_the_document_keeps_the_fiche_and_drops_its_style',
    'Coller dans un champ une pastille du corps (HTML du presse-papiers, avec une mise en forme selon la ligne) la garde avec sa fiche mais sans la mise en forme, qu’un champ n’écrit pas ; la coller dans le champ PJ n’écrit que son nom, et le texte brut copié depuis un champ est le nom de la fiche.',
    async (h) => {
      const withStyle = chip(2, 'NomComplet', 'Marie Martin').replace('<span ', '<span data-cond-style="{&quot;color&quot;:&quot;#ff0000&quot;}" ');
      field(SUBJECT).value = '';
      const view = editorOf(SUBJECT).view;
      view.focus();
      view.pasteHTML('<p>Bonjour ' + withStyle + '</p>');
      await h.sleep(150);
      const nodes = mentionsOf(SUBJECT).map(m => ({ table: m.node.attrs.table, row: m.node.attrs.row, column: m.node.attrs.column, label: m.node.attrs.label, condStyle: m.node.attrs.condStyle || null }));
      const stored = field(SUBJECT).value;
      field(PJ).value = '';
      const pjView = editorOf(PJ).view;
      pjView.focus();
      pjView.pasteHTML('<p>' + withStyle + '</p>');
      await h.sleep(150);
      const clip = FieldCodec.serializePlain(FieldCodec.itemsOf(stored));
      const ok = same(nodes, [{ table: PEOPLE, row: 2, column: 'NomComplet', label: 'Marie Martin', condStyle: null }]) && stored.indexOf('data-cond-style') === -1 && mentionsOf(PJ).length === 0
        && clip === 'Bonjour Marie Martin' && editorOf(SUBJECT).view.dom.querySelectorAll('.mention-chip').length === 1;
      return { pass: ok, notes: JSON.stringify({ nodes, stored, pj: field(PJ).value, clip }) };
    },
  );

  // ============================================================================================================
  // 4) Les champs des fenêtres : « Sinon afficher » d'une valeur et d'un bloc conditionnels
  // ============================================================================================================
  const conditionModal = () => document.getElementById('var-condition-modal');
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const docEditor = () => EditorCore.getEditor();
  const nodeAt = type => { let found = -1; docEditor().state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === type) found = pos; }); return found; };
  async function ruleUrgent(h, modal) {
    const row = modal.querySelector('.macro-rule-row');
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, 'Statut');
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
    setInput(row.querySelector('.macro-rule-value'), 'Urgent');
    await h.sleep(60);
  }
  scenario(
    'mentionfields_the_otherwise_fields_of_the_condition_window_cite_fiches_in_front_of_the_window',
    'Le « Sinon afficher » d’une valeur (une ligne) et d’un bloc de texte (plusieurs) conditionnels, champs montés dans la fenêtre de condition, ont la pastille « @ » : la liste s’ouvre DEVANT la fenêtre (pas dessous), le choix pose la pastille, « Enregistrer » écrit le sinon en HTML avec la fiche dans `data-otherwise`, et la Lecture - la condition n’étant pas remplie - écrit le nom de la fiche à la place de la valeur et du bloc.',
    async (h) => {
      const seen = {};
      const reading = async html => {
        const reader = document.getElementById('reader-container');
        reader.style.display = 'block';
        await ReaderMode.render(html, FILES, GristAPI.getCurrentRecord(), { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
        const text = reader.querySelector('.reader-content').textContent.replace(/\s+/g, ' ').trim();
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
        return text;
      };
      try {
        stub().fireRecord(Object.assign({}, REC_2), FILES);
        await h.sleep(50);
        Editor.setHTML('<p>Avant <span class="conditional-value">Texte</span> après</p><div class="conditional-text"><p>Bloc</p></div>');
        await h.sleep(120);
        for (const [type, id, typed] of [['conditionalValue', 'var-condition-otherwise-text', 'à voir @Mar'], ['conditionalText', 'var-condition-otherwise-area', 'bloc @Mar']]) {
          VariableCondition.openAt(docEditor(), nodeAt(type));
          await h.sleep(150);
          const modal = conditionModal();
          await ruleUrgent(h, modal);
          await h.fieldType(id, typed);
          await h.sleep(300);
          const box = boxOf();
          const rect = isOpen() ? box.getBoundingClientRect() : null;
          const top = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 14)) : null;
          const rows = rowsShown();
          const inFront = !!top && box.contains(top);
          const picked = pickRow('Marie Martin');
          await h.sleep(200);
          const held = { rows, inFront, picked, chips: FieldEditor.of(field(id)).view.dom.querySelectorAll('.mention-chip').length, value: field(id).value };
          modal.querySelector('.var-modal-actions .var-modal-primary').click();
          await h.sleep(250);
          seen[type] = { held, otherwise: docEditor().state.doc.nodeAt(nodeAt(type)).attrs.otherwise };
          await h.sleep(650);
        }
        seen.read = await reading(Editor.getHTML());
      } finally { Mention.hideList(); }
      const ok = ['conditionalValue', 'conditionalText'].every(type => {
        const r = seen[type];
        return r && same(r.held.rows, ['Marc Armand', 'Marie Martin']) && r.held.inFront && r.held.picked && r.held.chips === 1 && FieldCodec.isRich(r.otherwise)
          && /data-mention-table="MfPersonnes"/.test(r.otherwise) && /data-mention-row="2"/.test(r.otherwise);
      }) && /à voir Marie Martin/.test(seen.read) && /bloc Marie Martin/.test(seen.read);
      return { pass: ok, notes: JSON.stringify(seen) };
    },
    { document: true },
  );

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.mentionFields = cases;
})();
