// Suite "fieldEditor" - les champs texte à bulles : Objet, À, Cc, Cci du mode email et nom du fichier PDF (demande d'Antoine du 2026-10-08 : « dans les champs d'email et de
// nomenclature, les variables sont avec leur bulle bleue et bénéficient des mêmes fonctions que les variables du document : conditions, changement d'attribut, etc. »).
// Chaque champ est un éditeur d'une seule ligne (js/field-editor.js) monté dans l'élément de l'ancien <input>, dont il garde l'identifiant et l'interface (`value`,
// `readOnly`, `focus()`, `blur()`, évènement `input`). Ce qu'il enregistre (js/field-codec.js) reste le TEXTE BRUT d'avant tant que les bulles n'ont aucun réglage : les modèles
// déjà enregistrés se relisent tels quels et donnent le même objet, les mêmes adresses et le même nom de fichier ; dès qu'une bulle porte une condition, un autre format, une
// boucle dans la phrase ou une liste, le champ s'enregistre en HTML (`<p class="pp-field">…</p>`, bulles écrites comme dans le corps d'un modèle).
// Les valeurs de référence de `fieldeditor_plain_values_resolve_as_they_did_with_text_inputs` ont été relevées sur le code d'avant (commit ddea35d, champs <input>) : ce cas passe
// sur l'un et l'autre code, c'est son rôle - il garde la compatibilité. Les autres pilotent l'éditeur du champ (TestHelpers.field*), la barre et les fenêtres des bulles ; les
// gestes à la vraie souris et au vrai clavier, à 700x400, sont dans verify-field-editor-mouse.mjs.
(function () {
  const cases = [];

  const PAGE = 'FeDossiers';
  const TABLE = 'Publipostage_Modeles';
  const SUBJECT = 'v2-email-subject';
  const TO = 'v2-email-to';
  const CC = 'v2-email-cc';
  const CCI = 'v2-email-cci';
  const FILE = 'pdf-filename-template';
  const ALL_FIELDS = [SUBJECT, TO, CC, CCI, FILE];

  // Deux lignes de la page : « Urgent » (tout est renseigné) et « Normal » (sans responsable ni liste). Les valeurs sont celles que grist.onRecord livre : une colonne
  // Référence y arrive avec son texte affiché, une liste de choix sans le « L » du codage Grist.
  const REC_1 = { id: 1, Titre: 'Dossier A', TitreLong: 'Un long titre', Statut: 'Urgent', Montant: 1200.5, Zero: 0, Echeance: 631152000, Actif: true, Responsable: 'Dupont Jean', Tags: ['a', 'b'] };
  const REC_2 = { id: 2, Titre: 'Dossier B', TitreLong: '', Statut: 'Normal', Montant: 50, Zero: 0, Echeance: null, Actif: false, Responsable: '', Tags: null };
  // La paire du cas de compatibilité : un titre aux caractères interdits dans un nom de fichier, puis une ligne presque vide.
  const OLD_1 = { id: 1, Titre: 'Dossier A/B: "x"', TitreLong: 'L', Statut: 'Urgent', Montant: 1200.5, Zero: 0, Echeance: 631152000, Actif: true, Responsable: 'Dupont Jean', Tags: ['a', 'b'] };
  const OLD_2 = { id: 2, Titre: '', TitreLong: '', Statut: null, Montant: null, Zero: 0, Echeance: null, Actif: false, Responsable: '', Tags: null };

  const URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };

  const stub = () => window.__gristStub;
  const field = id => document.getElementById(id);
  const editorOf = id => FieldEditor.of(field(id));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Les éléments d'une valeur : du texte, une bulle (ses attributs, comme ceux d'un nœud varBadge).
  const T = text => ({ text });
  const B = (column, extra, table) => ({ badge: Object.assign({ table: table || PAGE, column, key: (table || PAGE) + '.' + column, format: null, condition: null, loop: null }, extra || {}) });
  const rich = items => FieldCodec.serializeRich(items);
  const text = (value, record) => Variables.resolveTextVariables(value, PAGE, record || REC_1);
  const filename = (value, record) => ReaderMode.resolveFilename(value, PAGE, record || REC_1);

  const badgesOf = id => {
    const found = [];
    editorOf(id).state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') found.push({ node, pos }); });
    return found;
  };
  const textOf = id => editorOf(id).state.doc.textContent;
  // Change des attributs de la bulle `index` du champ, comme le font la barre et les fenêtres (setNodeMarkup).
  function patchBubble(id, index, patch) {
    const editor = editorOf(id);
    const found = badgesOf(id)[index];
    editor.view.dispatch(editor.state.tr.setNodeMarkup(found.pos, null, Object.assign({}, found.node.attrs, patch)));
  }

  // --- La barre et les fenêtres d'une bulle, comme dans les suites du document ---
  const panels = () => Array.from(document.querySelectorAll('.v2-varfmt-toolbar.visible'));
  const panelButton = action => { const panel = panels()[0]; return panel ? panel.querySelector(`button[data-action="${action}"]`) : null; };
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  const press = action => panelButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const setSelect = (select, value) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  // Sélectionne la bulle `index` du champ : par un clic quand elle se voit en entier dans le champ (ProseMirror résout la position par les coordonnées du clic),
  // sinon - le champ est étroit, le reste du texte défile derrière son bord - par la sélection de nœud que ce clic poserait.
  async function selectBubble(h, id, index) {
    const editor = editorOf(id);
    const el = editor.view.dom.querySelectorAll('.var-badge')[index || 0];
    const box = el.getBoundingClientRect();
    const edge = field(id).getBoundingClientRect();
    if (box.left >= edge.left && box.right <= edge.right) await h.selectAtomNode(el);
    else editor.commands.setNodeSelection(badgesOf(id)[index || 0].pos);
    await h.sleep(120);
    return el;
  }
  const modalShown = id => { const m = document.getElementById(id); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; };
  const saveWindow = modal => modal.querySelector('.var-modal-actions .var-modal-primary').click();
  const cancelWindow = modal => modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();

  // --- La liste « # » ---
  const acBox = () => document.getElementById('autocomplete-box');
  const listed = () => (acBox() && acBox().style.display !== 'none' ? Array.from(acBox().querySelectorAll('.ac-item')).map(e => e.textContent) : null);

  // --- Le décor ---
  // La page est sur FeDossiers ; FeAnnuaire est liée par sa colonne Référence Responsable, FeLignes par sa colonne Dossier (plusieurs lignes par dossier).
  async function seed(h) {
    await h.resetEditor();
    const s = stub();
    s.setVariables('FeAnnuaire', { NomPrenom: 'Text', Email: 'Text', Telephone: 'Text' });
    s.setVariables(PAGE, { Titre: 'Text', TitreLong: 'Text', Statut: 'Text', Montant: 'Numeric', Zero: 'Numeric', Echeance: 'Date', Actif: 'Bool', Responsable: 'Ref:FeAnnuaire', Tags: 'ChoiceList', gristHelper_Display: 'Text' }, null, { Responsable: 'gristHelper_Display' });
    s.setVariables('FeLignes', { Dossier: 'Ref:' + PAGE, Designation: 'Text', Prix: 'Numeric' });
    s.setRows('FeAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr', Telephone: '06 11 22 33 44' }]);
    s.setRows(PAGE, [
      { id: 1, Titre: 'Dossier A', TitreLong: 'Un long titre', Statut: 'Urgent', Montant: 1200.5, Zero: 0, Echeance: 631152000, Actif: true, Responsable: 7, Tags: ['L', 'a', 'b'], gristHelper_Display: 'Dupont Jean' },
      { id: 2, Titre: 'Dossier B', TitreLong: '', Statut: 'Normal', Montant: 50, Zero: 0, Echeance: null, Actif: false, Responsable: 0, Tags: null, gristHelper_Display: '' },
    ]);
    s.setRows('FeLignes', [
      { id: 1, Dossier: 1, Designation: 'Audit', Prix: 100 }, { id: 2, Dossier: 1, Designation: 'Livret', Prix: 50 },
      { id: 3, Dossier: 1, Designation: 'Suivi', Prix: 20 }, { id: 4, Dossier: 2, Designation: 'Seul', Prix: 5 },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['FeAnnuaire', 'FeLignes']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('FeAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    await GristAPI.saveLinkRule('FeLignes', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    s.fireRecord(Object.assign({}, REC_1), PAGE);
    await h.sleep(50);
  }
  async function finish() {
    for (const t of ['FeAnnuaire', 'FeLignes']) await GristAPI.deleteLinkRule(t);
    stub().state.tables.filter(t => /^Fe[A-Z]/.test(t)).forEach(t => stub().dropTable(t));
    await GristAPI.refreshSchema();
  }
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await h.sleep(300); }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await h.sleep(300); }

  // Un scénario : décor neuf, puis, avec `email`, un nouveau modèle email (les champs ont alors une boîte à l'écran) ; à la fin les champs sont vidés, la langue et le modèle
  // d'avant sont remis, et `templates` remet aussi la table des modèles comme elle était.
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
          if (opts.email) await newEmail(h);
          return await body(h);
        } finally {
          I18n.setLang(lang);
          await h.sleep(40);
          ALL_FIELDS.forEach(fieldId => { const host = field(fieldId); host.readOnly = false; host.value = ''; });
          if (opts.email) {
            if (document.getElementById('btn-mode-edit') && document.getElementById('btn-mode-edit').getAttribute('aria-pressed') === 'false') await h.clickButton('btn-mode-edit');
            await newDocument(h);
          }
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
  // Le champ : un éditeur d'une ligne qui parle comme un <input>
  // ============================================================================================================
  scenario(
    'fieldeditor_the_five_fields_are_one_line_editors_with_the_interface_of_an_input',
    'Objet, À, Cc, Cci et le nom du PDF sont des éditeurs d’une ligne qui gardent leur identifiant : une zone de saisie (role textbox, une ligne), `value` qui se pose et se relit, `readOnly` qui bloque la saisie, `focus()`, `blur()` et `showText` ; l’éditeur du document reste le premier `.ProseMirror` de la page',
    async () => {
      const seen = {};
      for (const id of ALL_FIELDS) {
        const host = field(id);
        const editor = editorOf(id);
        const dom = editor ? editor.view.dom : null;
        host.value = 'Suivi #FeDossiers.Titre';
        const readBack = host.value;
        const badges = dom ? dom.querySelectorAll('.var-badge').length : -1;
        host.readOnly = true;
        const locked = { flag: host.readOnly, editable: editor.isEditable, aria: dom.getAttribute('aria-readonly'), mark: host.classList.contains('is-readonly') };
        host.readOnly = false;
        const unlocked = { flag: host.readOnly, editable: editor.isEditable, aria: dom.getAttribute('aria-readonly'), mark: host.classList.contains('is-readonly') };
        host.value = '';
        seen[id] = {
          tag: host.tagName, marked: host.classList.contains('pp-field-editor'), editor: !!editor,
          role: dom && dom.getAttribute('role'), multiline: dom && dom.getAttribute('aria-multiline'),
          textClass: dom && dom.classList.contains('pp-field-text'), documentClasses: dom && (dom.classList.contains('tiptap') || dom.classList.contains('ProseMirror')),
          api: ['focus', 'blur', 'showText'].every(name => typeof host[name] === 'function'),
          readBack, badges, locked, unlocked, emptyAfter: host.value,
        };
      }
      const documentFirst = document.querySelector('.ProseMirror') === EditorCore.getEditor().view.dom;
      const ok = ALL_FIELDS.every(id => {
        const s = seen[id];
        return s.tag === 'DIV' && s.marked && s.editor && s.role === 'textbox' && s.multiline === 'false' && s.textClass && !s.documentClasses && s.api
          && s.readBack === 'Suivi #FeDossiers.Titre' && s.badges === 1
          && s.locked.flag && !s.locked.editable && s.locked.aria === 'true' && s.locked.mark
          && !s.unlocked.flag && s.unlocked.editable && s.unlocked.aria === null && !s.unlocked.mark && s.emptyAfter === '';
      });
      return { pass: ok && documentFirst, notes: JSON.stringify({ documentFirst, seen }) };
    },
  );

  scenario(
    'fieldeditor_empty_field_shows_its_hint_in_the_language_of_the_interface',
    'Un champ vide montre son indication (l’attribut placeholder de l’élément, repris en aria-placeholder par la zone de saisie), qui change avec la langue de l’interface sans que le champ soit retouché ; elle disparaît dès qu’il contient quelque chose',
    async (h) => {
      const keys = { [SUBJECT]: 'email.subject.placeholder', [TO]: 'email.to.placeholder', [CC]: 'email.cc.placeholder', [CCI]: 'email.cci.placeholder', [FILE]: 'toolbar.pdfFilename.placeholder' };
      const seen = {};
      for (const lang of ['fr', 'en']) {
        I18n.setLang(lang);
        await h.sleep(80);
        seen[lang] = {};
        for (const id of ALL_FIELDS) {
          const host = field(id);
          const wanted = I18n.t(keys[id]);
          const visible = [SUBJECT, TO, CC].includes(id);
          seen[lang][id] = {
            attribute: host.getAttribute('placeholder') === wanted,
            aria: editorOf(id).view.dom.getAttribute('aria-placeholder') === wanted,
            empty: host.classList.contains('is-empty'),
            drawn: visible ? getComputedStyle(host, '::before').content === JSON.stringify(wanted) : null,
          };
        }
      }
      const subject = field(SUBJECT);
      subject.value = 'x';
      const filled = { empty: subject.classList.contains('is-empty'), drawn: getComputedStyle(subject, '::before').content };
      subject.value = '';
      const emptied = subject.classList.contains('is-empty');
      const english = I18n.t(keys[SUBJECT]) !== (I18n.setLang('fr'), I18n.t(keys[SUBJECT]));
      const ok = ['fr', 'en'].every(lang => ALL_FIELDS.every(id => { const s = seen[lang][id]; return s.attribute && s.aria && s.empty && (s.drawn === null || s.drawn === true); }));
      return { pass: ok && !filled.empty && filled.drawn !== JSON.stringify(I18n.t(keys[SUBJECT])) && emptied && english, notes: JSON.stringify({ seen, filled, emptied, english }) };
    },
    { email: true },
  );

  // ============================================================================================================
  // La valeur enregistrée
  // ============================================================================================================
  scenario(
    'fieldeditor_stored_value_stays_plain_text_until_a_bubble_has_a_setting',
    'Un champ dont les bulles n’ont aucun réglage s’enregistre en texte brut, « Suivi_#Table.Colonne - #Table.Autre » comme avant, et un texte brut enregistré se relit en bulles ; une condition ou un format sur une bulle fait passer la valeur en HTML (`<p class="pp-field">`), et retirer le réglage la ramène au texte brut du départ',
    async () => {
      const host = field(SUBJECT);
      const plain = 'Suivi_#FeDossiers.Titre - #FeDossiers.Montant';
      host.value = plain;
      const shown = Array.from(editorOf(SUBJECT).view.dom.querySelectorAll('.var-badge')).map(b => b.textContent);
      const stored = host.value;
      patchBubble(SUBJECT, 0, { condition: URGENT });
      const withCondition = host.value;
      const items = FieldCodec.itemsOf(withCondition);
      patchBubble(SUBJECT, 0, { condition: null });
      const without = host.value;
      patchBubble(SUBJECT, 1, { format: { type: 'number', style: 'fr', decimals: 2 } });
      const withFormat = host.value;
      patchBubble(SUBJECT, 1, { format: null });
      const reset = host.value;
      const checks = {
        shown: same(shown, ['#FeDossiers.Titre', '#FeDossiers.Montant']),
        stored: stored === plain,
        conditionIsHtml: FieldCodec.isRich(withCondition) && /data-condition=/.test(withCondition) && withCondition.startsWith('<p class="pp-field">'),
        conditionKept: items.length === 4 && same(items[1].badge.condition, URGENT) && items[1].badge.key === 'FeDossiers.Titre' && !items[3].badge.condition,
        removed: without === plain,
        formatIsHtml: FieldCodec.isRich(withFormat) && /data-format=/.test(withFormat),
        formatRemoved: reset === plain,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ stored, withCondition }) };
    },
  );

  scenario(
    'fieldeditor_typed_text_that_looks_like_the_html_wrapper_is_kept_as_text',
    'Un texte tapé qui s’écrit lui-même comme un champ HTML (`<p class="pp-field">…</p>`) n’est pas relu comme du HTML : la valeur enregistrée le protège (HTML échappé), se relit à l’identique et se résout comme du texte',
    async (h) => {
      const host = field(SUBJECT);
      const typed = '<p class="pp-field">x #FeDossiers.Titre</p>';
      await h.fieldType(SUBJECT, typed);
      const stored = host.value;
      host.value = stored;
      const again = host.value;
      const resolved = await text(stored);
      const items = FieldCodec.itemsOf(stored);
      const checks = {
        escaped: FieldCodec.isRich(stored) && stored.includes('&lt;p class="pp-field"&gt;'),
        stable: again === stored,
        items: items.length === 3 && items[0].text === '<p class="pp-field">x ' && items[1].badge.key === 'FeDossiers.Titre' && items[2].text === '</p>',
        resolved: resolved === '<p class="pp-field">x Dossier A</p>',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || stored };
    },
  );

  scenario(
    'fieldeditor_a_bubble_followed_by_letters_that_would_extend_its_key_is_written_as_html',
    'Une bulle « #Titre » suivie du texte « Long » se relirait « #TitreLong » en texte brut : la valeur passe en HTML pour que les deux restent séparés ; même chose pour « .Email » derrière une colonne Référence ; sans prolongement possible elle reste en texte brut',
    async () => {
      const sticky = FieldCodec.toStored([B('Titre'), T('Long')]);
      const path = FieldCodec.toStored([B('Responsable'), T('.Email')]);
      const free = FieldCodec.toStored([B('Titre'), T(' fin')]);
      const extension = FieldCodec.toStored([T('x_'), B('Titre'), T('.pdf')]);
      field(SUBJECT).value = sticky;
      const kept = badgesOf(SUBJECT).map(b => b.node.attrs.key);
      const checks = {
        stickyIsHtml: FieldCodec.isRich(sticky) && same(FieldCodec.itemsOf(sticky).map(i => (i.badge ? i.badge.key : i.text)), ['FeDossiers.Titre', 'Long']),
        stickyDrawn: same(kept, ['FeDossiers.Titre']) && textOf(SUBJECT).endsWith('Long'),
        stickyResolved: (await text(sticky)) === 'Dossier ALong' && (await filename(sticky)) === 'Dossier ALong',
        pathIsHtml: FieldCodec.isRich(path) && (await text(path)) === 'Dupont Jean.Email',
        free: free === '#FeDossiers.Titre fin',
        extension: extension === 'x_#FeDossiers.Titre.pdf',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ sticky, path }) };
    },
  );

  // ============================================================================================================
  // Les modèles déjà enregistrés donnent la même chose
  // ============================================================================================================
  const OLD_VALUES = [
    '#FeDossiers.Titre', 'Suivi #FeDossiers.Titre - #FeDossiers.Montant (#FeDossiers.Zero) le #FeDossiers.Echeance', '#FeDossiers.Actif/#FeDossiers.Tags', '#FeDossiers.Responsable',
    '#FeDossiers.Responsable.Email;#FeDossiers.Responsable.Telephone', '  espaces autour #FeDossiers.Statut  ', '#FeInconnue.X et #FeDossiers.Inconnue', 'a < b & c > d "q" \'r\'', '',
    'sans variable', '#FeDossiers.Titre#FeDossiers.Statut', '#FeDossiers.TitreLong et #FeDossiers.Titre.pdf', 'Fin de phrase #FeDossiers.Statut.',
  ];
  // Relevé sur le code d'avant (champs <input>, commit ddea35d) : le texte résolu des valeurs ci-dessus (espaces des bouts retirées, comme le faisait le champ) pour OLD_1 puis
  // OLD_2, tel que l’objet et les adresses d’un email le donnaient, puis le nom de fichier.
  const OLD_TEXT = [
    ['Dossier A/B: "x"', 'Suivi Dossier A/B: "x" - 1200.5 (0) le 01/01/1990', 'true/a, b', 'Dupont Jean', 'jean.dupont@ex.fr;06 11 22 33 44', 'espaces autour Urgent', '#FeInconnue.X et #FeDossiers.Inconnue',
      'a < b & c > d "q" \'r\'', '', 'sans variable', 'Dossier A/B: "x"Urgent', 'L et Dossier A/B: "x".pdf', 'Fin de phrase Urgent.'],
    ['', 'Suivi  -  (0) le ', 'false/', '', ';', 'espaces autour ', '#FeInconnue.X et #FeDossiers.Inconnue', 'a < b & c > d "q" \'r\'', '', 'sans variable', '', ' et .pdf', 'Fin de phrase .'],
  ];
  const OLD_FILE = [
    ['Dossier A_B_ _x_', 'Suivi Dossier A_B_ _x_ - 1200.5 (0) le 01_01_1990', 'true/a, b', 'Dupont Jean', 'jean.dupont@ex.fr;06 11 22 33 44', 'espaces autour Urgent', '#FeInconnue.X et #FeDossiers.Inconnue',
      'a < b & c > d "q" \'r\'', 'publipostage', 'sans variable', 'Dossier A_B_ _x_Urgent', 'L et Dossier A_B_ _x_.pdf', 'Fin de phrase Urgent.'],
    ['', 'Suivi  -  (0) le ', 'false/', '', ';', 'espaces autour ', '#FeInconnue.X et #FeDossiers.Inconnue', 'a < b & c > d "q" \'r\'', 'publipostage', 'sans variable', '', ' et .pdf', 'Fin de phrase .'],
  ];

  scenario(
    'fieldeditor_plain_values_resolve_as_they_did_with_text_inputs',
    'Treize valeurs de champ écrites en texte brut avant ce changement (clé seule, phrase, chemin de références, clé inconnue, caractères interdits d’un nom de fichier, deux clés collées, « .pdf », fin de phrase, champ vide...) sont posées dans le champ puis relues : la valeur est la même (espaces des bouts retirées par la page), et le texte résolu comme le nom de fichier sont ceux que donnait l’<input>, pour une ligne pleine et une ligne presque vide',
    async () => {
      const host = field(SUBJECT);
      // La page lit ces champs avec `.trim()` (js/main.js:getEmailFieldsFromInputs) : le champ d'avant gardait les espaces des bouts, celui-ci les retire lui-même.
      const stored = OLD_VALUES.map(value => { host.value = value; return host.value.trim(); });
      const textGot = [];
      const fileGot = [];
      for (const record of [OLD_1, OLD_2]) {
        textGot.push(await Promise.all(stored.map(value => Variables.resolveTextVariables(value, PAGE, record))));
        fileGot.push(await Promise.all(stored.map(value => ReaderMode.resolveFilename(value, PAGE, record))));
      }
      const asBefore = same(stored, OLD_VALUES.map(value => value.trim()));
      const textOk = same(textGot, OLD_TEXT);
      const fileOk = same(fileGot, OLD_FILE);
      return { pass: asBefore && textOk && fileOk, notes: JSON.stringify({ asBefore, textOk, fileOk, stored, textGot, fileGot }) };
    },
  );

  // ============================================================================================================
  // Les réglages d'une bulle valent dans le champ
  // ============================================================================================================
  scenario(
    'fieldeditor_a_condition_on_a_bubble_applies_per_row_in_the_subject_and_in_the_file_name',
    'Une bulle à condition (« Statut = Urgent ») dans l’Objet et dans le nom du PDF s’écrit pour la ligne qui la remplit et disparaît pour l’autre, texte voisin conservé ; la valeur enregistrée se relit à l’identique',
    async () => {
      const first = rich([T('Dossier '), B('Titre'), T(' '), B('Statut', { condition: URGENT }), T('!')]);
      const second = rich([T('A'), B('Titre', { condition: URGENT }), T('B')]);
      const seen = {};
      for (const id of [SUBJECT, FILE]) {
        field(id).value = first;
        const back = field(id).value;
        seen[id] = { back: back === first, one: await text(back), two: await text(back, REC_2), fileOne: await filename(back), fileTwo: await filename(back, REC_2) };
      }
      field(SUBJECT).value = second;
      seen.second = { one: await text(field(SUBJECT).value), two: await text(field(SUBJECT).value, REC_2) };
      const ok = [SUBJECT, FILE].every(id => seen[id].back && seen[id].one === 'Dossier Dossier A Urgent!' && seen[id].two === 'Dossier Dossier B !'
        && seen[id].fileOne === 'Dossier Dossier A Urgent!' && seen[id].fileTwo === 'Dossier Dossier B !')
        && seen.second.one === 'ADossier AB' && seen.second.two === 'AB';
      return { pass: ok, notes: JSON.stringify(seen) };
    },
  );

  scenario(
    'fieldeditor_number_format_applies_only_when_the_bubble_has_one',
    'Un nombre sans réglage s’écrit « 1200.5 » comme avant dans un champ ; avec le format de la bulle (style FR, décimales, devise, US, sans séparateur, en lettres) il s’écrit comme dans le corps du modèle, dans l’objet comme dans le nom du fichier',
    async () => {
      const fr = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
      const us = { type: 'number', style: 'us', decimals: 1 };
      const none = { type: 'number', style: 'none' };
      const words = { type: 'number', style: 'fr', words: true };
      const wanted = {
        plain: ['Montant 1200.5', 'Montant 50'],
        fr: ['Montant ' + VariableFormat.formatNumber(1200.5, fr), 'Montant ' + VariableFormat.formatNumber(50, fr)],
        us: ['Montant ' + VariableFormat.formatNumber(1200.5, us), 'Montant ' + VariableFormat.formatNumber(50, us)],
        none: ['Montant ' + VariableFormat.formatNumber(1200.5, none), 'Montant ' + VariableFormat.formatNumber(50, none)],
        words: ['Montant ' + VariableFormat.formatNumber(1200.5, words), 'Montant ' + VariableFormat.formatNumber(50, words)],
      };
      const formats = { plain: null, fr, us, none, words };
      const got = {};
      for (const name of Object.keys(formats)) {
        const value = rich([T('Montant '), B('Montant', formats[name] ? { format: formats[name] } : {})]);
        field(SUBJECT).value = value;
        const back = field(SUBJECT).value;
        got[name] = [await text(back), await text(back, REC_2), await filename(back), await filename(back, REC_2)];
      }
      const ok = Object.keys(formats).every(name => got[name][0] === wanted[name][0] && got[name][1] === wanted[name][1] && got[name][2] === wanted[name][0] && got[name][3] === wanted[name][1]);
      // Le format est bien ce que dit la valeur : pas de « 1 200,50 € » sans réglage, et le français met l’espace insécable des milliers.
      const distinct = wanted.fr[0] !== wanted.plain[0] && wanted.fr[0].includes(' ') && wanted.fr[0].endsWith('€');
      return { pass: ok && distinct, notes: JSON.stringify({ got, wanted }) };
    },
  );

  scenario(
    'fieldeditor_inline_loop_list_and_raw_values_apply_in_a_field',
    'Une boucle « dans la phrase » sur les lignes liées (séparateurs choisis), une liste de choix réglée (la première valeur, toutes avec leurs séparateurs) se résolvent dans le champ ; le zéro et un Oui / Non s’y écrivent toujours en clair (« 0 », « true » / « false »), quels que soient les réglages venus d’une bulle du document',
    async () => {
      const designation = loop => B('Designation', { loop }, 'FeLignes');
      const loopOf = (separator, lastSeparator) => ({ repeat: 'inline', table: 'FeLignes', separator, lastSeparator, empty: 'hide' });
      const values = {
        loop: rich([T('Lignes : '), designation(loopOf(', ', ' et '))]),
        sum: rich([T('Prix : '), B('Prix', { loop: loopOf(' + ', ' + ') }, 'FeLignes')]),
        first: rich([T('Tags: '), B('Tags', { format: { list: { pick: 'first' } } })]),
        all: rich([T('Tags: '), B('Tags', { format: { list: { pick: 'all', separator: ' / ', lastSeparator: ' & ' } } })]),
        zeroHidden: rich([T('Z='), B('Zero', { format: { zero: 'hide' } })]),
        bool: rich([T('A='), B('Actif', { format: { type: 'bool', style: 'check' } })]),
      };
      const wanted = {
        loop: ['Lignes : Audit, Livret et Suivi', 'Lignes : Seul'], sum: ['Prix : 100 + 50 + 20', 'Prix : 5'], first: ['Tags: a', 'Tags: '], all: ['Tags: a & b', 'Tags: '],
        zeroHidden: ['Z=0', 'Z=0'], bool: ['A=true', 'A=false'],
      };
      const got = {};
      for (const name of Object.keys(values)) {
        field(SUBJECT).value = values[name];
        const back = field(SUBJECT).value;
        got[name] = [await text(back), await text(back, REC_2), await filename(back), await filename(back, REC_2)];
      }
      const ok = Object.keys(values).every(name => got[name][0] === wanted[name][0] && got[name][1] === wanted[name][1] && got[name][2] === wanted[name][0] && got[name][3] === wanted[name][1]);
      return { pass: ok, notes: JSON.stringify({ got, wanted }) };
    },
  );

  // ============================================================================================================
  // La frappe : la liste « # », Entrée, les évènements, la mise en bulle au départ du curseur
  // ============================================================================================================
  scenario(
    'fieldeditor_hash_list_offers_variables_only_and_a_pick_becomes_a_bubble',
    'Taper « # » dans un champ ouvre la liste des variables (aucune puce, pas d’onglets) qui se filtre à la frappe ; Entrée, un clic et les flèches choisissent une entrée, qui devient une bulle à la place de la saisie, le texte avant est conservé, la liste se ferme et la valeur reste du texte brut',
    async (h) => {
      await h.fieldType(SUBJECT, 'Suivi #FeDossiers.Ti');
      const filtered = listed();
      const tabsHidden = acBox().querySelector('.ac-tabs').style.display === 'none';
      const handled = h.fieldKey(SUBJECT, 'Enter');
      await h.sleep(40);
      const afterEnter = { bubbles: badgesOf(SUBJECT).map(b => b.node.attrs.key), before: textOf(SUBJECT).replace(/^(Suivi ).*$/, '$1'), list: listed(), value: field(SUBJECT).value };
      await h.fieldType(CC, 'a@x.fr, #FeDossiers.Ti');
      const second = h.fieldKey(CC, 'ArrowDown');
      const picked = h.fieldKey(CC, 'Enter');
      await h.sleep(40);
      const afterArrow = { bubbles: badgesOf(CC).map(b => b.node.attrs.key), value: field(CC).value };
      await h.fieldType(TO, '#FeDossiers.Mo');
      const row = acBox() && Array.from(acBox().querySelectorAll('.ac-item')).find(e => e.textContent === 'FeDossiers.Montant');
      if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(40);
      const afterClick = { bubbles: badgesOf(TO).map(b => b.node.attrs.key), list: listed(), value: field(TO).value };
      const checks = {
        filtered: !!filtered && filtered.includes('FeDossiers.Titre') && filtered.includes('FeDossiers.TitreLong') && filtered.every(entry => entry.includes('.')),
        tabsHidden,
        enterIsTaken: handled === true,
        enterBubble: same(afterEnter.bubbles, ['FeDossiers.Titre']) && afterEnter.before === 'Suivi ' && afterEnter.list === null && afterEnter.value === 'Suivi #FeDossiers.Titre',
        arrow: second === true && picked === true && same(afterArrow.bubbles, ['FeDossiers.TitreLong']) && afterArrow.value === 'a@x.fr, #FeDossiers.TitreLong',
        click: same(afterClick.bubbles, ['FeDossiers.Montant']) && afterClick.list === null && afterClick.value === '#FeDossiers.Montant',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ filtered, afterEnter, afterArrow, afterClick }) };
    },
  );

  scenario(
    'fieldeditor_enter_without_the_list_validates_the_field_and_escape_closes_the_list',
    'Entrée (avec ou sans Maj, Ctrl) quand la liste « # » est fermée émet `fieldenter` et ne passe pas à la ligne ; avec la liste ouverte elle choisit l’entrée sans valider le champ ; Échap ferme la liste sans quitter le champ et, la liste fermée, n’est pas prise',
    async (h) => {
      let entered = 0;
      const host = field(SUBJECT);
      const count = () => { entered += 1; };
      host.addEventListener('fieldenter', count);
      try {
        await h.fieldType(SUBJECT, 'Objet');
        const plain = [h.fieldKey(SUBJECT, 'Enter'), h.fieldKey(SUBJECT, 'Enter', { shiftKey: true }), h.fieldKey(SUBJECT, 'Enter', { ctrlKey: true })];
        const oneLine = editorOf(SUBJECT).state.doc.childCount === 1 && textOf(SUBJECT) === 'Objet';
        const afterPlain = entered;
        await h.fieldType(SUBJECT, ' #FeDossiers.Ti', true);
        const open = listed() !== null;
        const picked = h.fieldKey(SUBJECT, 'Enter');
        await h.sleep(40);
        const afterPick = entered;
        await h.fieldType(SUBJECT, ' #FeDossiers.Ti', true);
        const openAgain = listed() !== null;
        const escape = h.fieldKey(SUBJECT, 'Escape');
        const closed = listed() === null;
        const escapeWithoutList = h.fieldKey(SUBJECT, 'Escape');
        const checks = {
          plain: plain.every(Boolean) && afterPlain === 3 && oneLine,
          open: open && picked === true && afterPick === 3,
          escape: openAgain && escape === true && closed && escapeWithoutList === false && entered === 3,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ plain, afterPlain, afterPick, entered }) };
      } finally { host.removeEventListener('fieldenter', count); }
    },
  );

  scenario(
    'fieldeditor_input_event_only_for_edits_by_the_person',
    'Le champ émet `input` quand la personne écrit ou modifie une bulle, jamais quand le programme pose la valeur (un autre modèle), écrit le texte résolu de la Lecture ou passe en lecture seule : le brouillon n’est pas marqué « modifié » par un simple affichage',
    async (h) => {
      const host = field(SUBJECT);
      let inputs = 0;
      const count = () => { inputs += 1; };
      host.addEventListener('input', count);
      try {
        host.value = 'Suivi #FeDossiers.Titre';
        host.showText('Suivi Dossier A');
        host.readOnly = true;
        host.readOnly = false;
        host.value = '';
        await h.sleep(40);
        const quiet = inputs;
        await h.fieldType(SUBJECT, 'a');
        const typed = inputs;
        await h.fieldType(SUBJECT, ' #FeDossiers.Titre', true);
        const second = inputs;
        host.value = 'Suivi #FeDossiers.Titre';
        patchBubble(SUBJECT, 0, { condition: URGENT });
        const setting = inputs;
        host.value = '';
        await h.sleep(40);
        const ok = quiet === 0 && typed === 1 && second === 2 && setting === 3 && inputs === 3;
        return { pass: ok, notes: JSON.stringify({ quiet, typed, second, setting, inputs }) };
      } finally { host.removeEventListener('input', count); }
    },
  );

  scenario(
    'fieldeditor_a_key_typed_in_full_becomes_a_bubble_when_the_cursor_leaves',
    'Une clé tapée en entier (« #FeDossiers.Titre ») reste du texte pendant la frappe puis devient une bulle au départ du curseur, comme la valeur enregistrée la relira ; la valeur du champ ne change pas',
    async (h) => {
      await h.fieldType(SUBJECT, 'Suivi #FeDossiers.Titre fin');
      const typing = { bubbles: badgesOf(SUBJECT).length, value: field(SUBJECT).value };
      editorOf(SUBJECT).view.dom.dispatchEvent(new FocusEvent('blur'));
      await h.sleep(80);
      const left = { bubbles: badgesOf(SUBJECT).map(b => b.node.attrs.key), value: field(SUBJECT).value, text: textOf(SUBJECT) };
      const ok = typing.bubbles === 0 && typing.value === 'Suivi #FeDossiers.Titre fin' && same(left.bubbles, ['FeDossiers.Titre']) && left.value === typing.value && left.text.startsWith('Suivi ') && left.text.endsWith(' fin');
      return { pass: ok, notes: JSON.stringify({ typing, left }) };
    },
  );

  scenario(
    'fieldeditor_paste_keeps_one_line_and_the_bubbles_and_copy_writes_their_keys',
    'Un collage reste sur une ligne (blocs et retours deviennent des espaces, aucune mise en forme) ; une bulle copiée du document arrive avec son format et sa condition, mais une boucle sur des lignes de tableau ou des paragraphes y redevient une variable ordinaire, une boucle « dans la phrase » reste ; copier une sélection écrit « #Clé » pour chaque bulle ; Ctrl+B / I / U sont sans effet',
    async (h) => {
      const view = editorOf(SUBJECT).view;
      const bubbleHtml = (column, extra) => EditorNodes.varBadgeHtml(B(column, extra).badge);
      view.pasteHTML('<p>Bonjour</p><p><strong>à</strong> tous</p><ul><li>un</li><li>deux</li></ul>');
      const blocks = { text: textOf(SUBJECT), paragraphs: editorOf(SUBJECT).state.doc.childCount, marked: view.dom.querySelectorAll('strong, b, ul, li').length };
      field(SUBJECT).value = '';
      view.pasteText('première\nseconde\r\ntroisième');
      const lines = textOf(SUBJECT);
      field(SUBJECT).value = '';
      view.pasteHTML(`<p>A ${bubbleHtml('Statut', { condition: URGENT })} ${bubbleHtml('Montant', { format: { type: 'number', style: 'us', decimals: 1 } })} ${bubbleHtml('Titre', { loop: { repeat: 'paragraph', table: PAGE } })} ${bubbleHtml('Titre', { loop: { repeat: 'row', table: PAGE } })}</p>`);
      const pasted = badgesOf(SUBJECT).map(b => ({ key: b.node.attrs.key, condition: !!b.node.attrs.condition, format: !!b.node.attrs.format, loop: b.node.attrs.loop ? b.node.attrs.loop.repeat || 'other' : null }));
      field(SUBJECT).value = '';
      const inline = { repeat: 'inline', table: 'FeLignes', separator: ', ', lastSeparator: ' et ', empty: 'hide' };
      view.pasteHTML(`<p>${bubbleHtml('Designation', { loop: inline }).replace(PAGE, 'FeLignes').replace(PAGE, 'FeLignes').replace(PAGE, 'FeLignes')}</p>`);
      const inlineKept = badgesOf(SUBJECT).map(b => (b.node.attrs.loop ? b.node.attrs.loop.repeat : null));
      field(SUBJECT).value = 'Suivi #FeDossiers.Titre - #FeDossiers.Montant';
      const doc = view.state.doc;
      const slice = doc.slice(0, doc.content.size);
      const copied = view.someProp('clipboardTextSerializer', f => f(slice, view));
      field(SUBJECT).value = 'abc';
      const before = view.state.doc.eq(view.state.doc) && textOf(SUBJECT);
      const refused = ['b', 'i', 'u'].map(key => h.fieldKey(SUBJECT, key, { ctrlKey: true }));
      const checks = {
        blocks: blocks.text.replace(/\s+/g, ' ').trim() === 'Bonjour à tous un deux' && blocks.paragraphs === 1 && blocks.marked === 0,
        lines: lines === 'première seconde troisième',
        pasted: pasted.length === 4 && pasted[0].key === 'FeDossiers.Statut' && pasted[0].condition && pasted[1].format && pasted[2].loop === null && pasted[3].loop === null,
        inline: same(inlineKept, ['inline']),
        copied: copied === 'Suivi #FeDossiers.Titre - #FeDossiers.Montant',
        shortcuts: refused.every(Boolean) && textOf(SUBJECT) === before && view.dom.querySelector('strong, em, u') === null,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ blocks, lines, pasted, inlineKept, copied }) };
    },
  );

  scenario(
    'fieldeditor_undo_goes_back_in_the_field_only_and_a_new_value_starts_a_new_history',
    'Annuler défait la frappe dans le champ ; poser une autre valeur (un autre modèle) repart d’un historique vide : Annuler ne ramène pas le modèle d’avant',
    async (h) => {
      const editor = editorOf(SUBJECT);
      field(SUBJECT).value = 'abc';
      await h.fieldType(SUBJECT, 'd', true);
      const typed = textOf(SUBJECT);
      const undone = editor.commands.undo();
      const back = textOf(SUBJECT);
      const redone = editor.commands.redo();
      const again = textOf(SUBJECT);
      field(SUBJECT).value = 'autre modèle';
      const nothing = editor.commands.undo();
      const kept = textOf(SUBJECT);
      const ok = typed === 'abcd' && undone && back === 'abc' && redone && again === 'abcd' && !nothing && kept === 'autre modèle';
      return { pass: ok, notes: JSON.stringify({ typed, undone, back, redone, again, nothing, kept }) };
    },
  );

  scenario(
    'fieldeditor_a_bubble_of_a_deleted_column_is_flagged_red_in_the_field',
    'Une bulle dont la colonne n’existe plus est signalée (classe `var-badge-broken` et info-bulle) dans le champ comme dans le document, à la pose de la valeur et quand le schéma change ensuite, et le signalement reste après une frappe',
    async (h) => {
      field(SUBJECT).value = rich([T('A '), B('Montant'), T(' '), B('Supprimee')]);
      const flags = () => Array.from(editorOf(SUBJECT).view.dom.querySelectorAll('.var-badge')).map(b => ({ broken: b.classList.contains('var-badge-broken'), titled: !!b.title }));
      const atStart = flags();
      stub().deleteColumn(PAGE, 'Montant');
      await GristAPI.refreshSchema();
      Editor.setHTML('<p>x</p>');
      await h.sleep(300);
      const afterDelete = flags();
      await h.fieldType(SUBJECT, ' suite', true);
      const afterTyping = flags();
      const ok = same(atStart.map(f => f.broken), [false, true]) && atStart[1].titled && same(afterDelete.map(f => f.broken), [true, true]) && afterDelete.every(f => f.titled)
        && same(afterTyping.map(f => f.broken), [true, true]);
      return { pass: ok, notes: JSON.stringify({ atStart, afterDelete, afterTyping }) };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_focus_goes_to_the_end_and_a_click_on_the_edge_of_the_field_places_the_cursor',
    'focus() met le curseur à la fin du texte dans la zone de saisie ; un clic sur le bord du champ (hors du texte) y place le curseur au lieu de viser rien ; le champ en lecture seule ne le prend pas',
    async (h) => {
      const host = field(SUBJECT);
      host.value = 'Suivi #FeDossiers.Titre';
      const editor = editorOf(SUBJECT);
      host.focus();
      await h.sleep(60);
      const focused = document.activeElement === editor.view.dom && editor.state.selection.from === editor.state.doc.content.size - 1;
      host.blur();
      await h.sleep(60);
      const blurred = document.activeElement !== editor.view.dom;
      const click = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      host.dispatchEvent(click);
      await h.sleep(60);
      const edge = click.defaultPrevented && document.activeElement === editor.view.dom;
      host.blur();
      host.readOnly = true;
      const locked = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      host.dispatchEvent(locked);
      host.focus();
      await h.sleep(60);
      const readOnly = document.activeElement !== editor.view.dom && !locked.defaultPrevented;
      host.readOnly = false;
      return { pass: focused && blurred && edge && readOnly, notes: JSON.stringify({ focused, blurred, edge, readOnly }) };
    },
    { email: true },
  );

  // ============================================================================================================
  // La Lecture : les champs montrent la valeur résolue, jamais ce qu'il faut enregistrer
  // ============================================================================================================
  scenario(
    'fieldeditor_reading_mode_shows_the_resolved_text_and_gives_the_template_back',
    'En Lecture les champs de l’email montrent le texte résolu de la ligne (jamais relu comme un modèle : un « # » du résultat n’y devient pas une bulle), sont en lecture seule, suivent la ligne qui change ; enregistrer pendant la Lecture écrit les modèles bruts, et le retour en édition remet les bulles avec leurs réglages ; le modèle rouvert les montre de même',
    async (h) => {
      const subject = rich([T('Dossier '), B('Titre'), T(' '), B('Statut', { condition: URGENT }), T('!')]);
      field(SUBJECT).value = subject;
      field(TO).value = '#FeDossiers.Responsable.Email';
      field(CC).value = 'Copie #FeDossiers.Titre';
      document.getElementById('template-name').value = 'Fe courriel';
      await h.clickButton('btn-mode-read');
      await h.sleep(500);
      const reading = () => ({
        subject: field(SUBJECT).value, to: field(TO).value, cc: field(CC).value,
        readOnly: [SUBJECT, TO, CC].every(id => field(id).readOnly && !editorOf(id).isEditable && editorOf(id).view.dom.getAttribute('aria-readonly') === 'true'),
        bubbles: [SUBJECT, TO, CC].map(id => badgesOf(id).length),
      });
      const first = reading();
      // Le résultat d’une variable qui ressemble à une clé reste du texte.
      stub().fireRecord(Object.assign({}, REC_1, { Titre: 'Réf #FeDossiers.Statut' }), PAGE);
      await h.sleep(500);
      const lookalike = reading();
      stub().fireRecord(Object.assign({}, REC_2), PAGE);
      await h.sleep(500);
      const second = reading();
      stub().fireRecord(Object.assign({}, REC_1), PAGE);
      await h.sleep(500);
      await h.clickButton('btn-save');
      await h.sleep(600);
      const id = Templates.getCurrentId();
      const row = id ? stub().getRow(TABLE, id) : {};
      const saved = { Objet: row.Objet, Destinataires: row.Destinataires, Cc: row.Cc, Cci: row.Cci, TypeModele: row.TypeModele };
      await h.clickButton('btn-mode-edit');
      await h.sleep(500);
      const edit = { subject: field(SUBJECT).value, to: field(TO).value, cc: field(CC).value, editable: [SUBJECT, TO, CC].every(fieldId => !field(fieldId).readOnly && editorOf(fieldId).isEditable), bubbles: [SUBJECT, TO, CC].map(fieldId => badgesOf(fieldId).length) };
      await newDocument(h);
      const emptied = { subject: field(SUBJECT).value, to: field(TO).value };
      const select = document.getElementById('template-select');
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(600);
      const reopened = { subject: field(SUBJECT).value, to: field(TO).value, cc: field(CC).value, bubbles: [SUBJECT, TO, CC].map(fieldId => badgesOf(fieldId).length), condition: badgesOf(SUBJECT).map(b => !!b.node.attrs.condition) };
      const checks = {
        reading: first.subject === 'Dossier Dossier A Urgent!' && first.to === 'jean.dupont@ex.fr' && first.cc === 'Copie Dossier A' && first.readOnly && same(first.bubbles, [0, 0, 0]),
        lookalike: lookalike.subject === 'Dossier Réf #FeDossiers.Statut Urgent!' && lookalike.cc === 'Copie Réf #FeDossiers.Statut' && same(lookalike.bubbles, [0, 0, 0]),
        otherRow: second.subject === 'Dossier Dossier B !' && second.to === '' && second.cc === 'Copie Dossier B',
        saved: saved.Objet === subject && saved.Destinataires === '#FeDossiers.Responsable.Email' && saved.Cc === 'Copie #FeDossiers.Titre' && saved.Cci === '' && saved.TypeModele === 'email',
        edit: edit.subject === subject && edit.to === '#FeDossiers.Responsable.Email' && edit.cc === 'Copie #FeDossiers.Titre' && edit.editable && same(edit.bubbles, [2, 1, 1]),
        newDocument: emptied.subject === '' && emptied.to === '',
        reopened: reopened.subject === subject && reopened.to === '#FeDossiers.Responsable.Email' && reopened.cc === 'Copie #FeDossiers.Titre' && same(reopened.bubbles, [2, 1, 1]) && same(reopened.condition, [false, true]),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || 'ok', detail: failed.length ? JSON.stringify({ first, lookalike, second, saved, edit, emptied, reopened }) : undefined };
    },
    { email: true, templates: true },
  );

  // ============================================================================================================
  // La barre et les fenêtres d'une bulle, dans le champ
  // ============================================================================================================
  scenario(
    'fieldeditor_a_bubble_in_a_field_opens_the_toolbar_of_a_document_bubble',
    'Sélectionner une bulle d’un champ ouvre la barre des bulles du document, une seule à la fois : condition d’affichage toujours ouverte, autres attributs sur une colonne Référence, boucle sur une table liée, liste sur une colonne à valeurs multiples (grisés ailleurs) ; quand le curseur quitte le champ la barre se referme',
    async (h) => {
      field(SUBJECT).value = rich([B('Titre'), T(' '), B('Responsable'), T(' '), B('Designation', null, 'FeLignes'), T(' '), B('Tags')]);
      const state = async index => {
        await selectBubble(h, SUBJECT, index);
        const open = panels();
        const button = action => { const b = open[0] && open[0].querySelector(`button[data-action="${action}"]`); return b ? { enabled: b.getAttribute('aria-disabled') !== 'true', shown: !b.hidden } : null; };
        return { panels: open.length, condition: button('var-condition'), linked: button('var-linked'), loop: button('var-loop'), list: button('var-list') };
      };
      const title = await state(0);
      const reference = await state(1);
      const lines = await state(2);
      const tags = await state(3);
      const insideDocument = document.querySelector('.v2-varfmt-toolbar') !== panels()[0];
      field(SUBJECT).blur();
      await h.sleep(120);
      const closed = panels().length === 0 && !editorOf(SUBJECT).state.selection.node;
      const everywhere = [title, reference, lines, tags].every(s => s.panels === 1 && s.condition && s.condition.enabled);
      const checks = {
        everywhere,
        title: !title.linked.enabled && !title.loop.enabled && !title.list.enabled,
        reference: reference.linked.enabled && !reference.list.enabled,
        lines: lines.loop.enabled && !lines.list.enabled,
        tags: tags.list.enabled && !tags.loop.enabled,
        ownPanel: insideDocument,
        closed,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? failed.join(', ') + ' ' + JSON.stringify({ title, reference, lines, tags, panelsAfter: panels().length, selection: !!editorOf(SUBJECT).state.selection.node }) : 'ok' };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_condition_window_sets_a_condition_on_a_bubble_of_a_field',
    'Le bouton « Condition » de la barre ouvre la fenêtre de condition sur la bulle du champ ; une règle « Statut = Urgent » enregistrée met la condition dans la bulle, la valeur passe en HTML, et l’objet s’écrit pour la ligne « Urgent » et disparaît pour l’autre ; « Retirer » ramène la valeur au texte brut',
    async (h) => {
      field(SUBJECT).value = 'Dossier #FeDossiers.Titre';
      await selectBubble(h, SUBJECT, 0);
      press('var-condition');
      await h.sleep(120);
      const modal = document.getElementById('var-condition-modal');
      const opened = modalShown('var-condition-modal') && VariableCondition.isOpen();
      const row = modal.querySelector('.macro-rule-row');
      setSelect(row.querySelector('select.macro-rule-column'), 'Statut');
      await h.sleep(60);
      setInput(modal.querySelector('.macro-rule-row .macro-rule-value'), 'Urgent');
      await h.sleep(60);
      saveWindow(modal);
      await h.sleep(150);
      const stored = field(SUBJECT).value;
      const attrs = badgesOf(SUBJECT)[0].node.attrs;
      const dashed = getComputedStyle(editorOf(SUBJECT).view.dom.querySelector('.var-badge')).borderStyle;
      const urgent = await text(stored);
      const normal = await text(stored, REC_2);
      await selectBubble(h, SUBJECT, 0);
      press('var-condition');
      await h.sleep(120);
      const remove = document.querySelector('#var-condition-modal .var-modal-danger');
      const removable = !!remove && !remove.hidden;
      if (remove) remove.click();
      await h.sleep(150);
      const checks = {
        opened,
        condition: same(attrs.condition, URGENT),
        html: FieldCodec.isRich(stored) && /data-condition=/.test(stored),
        dashed: dashed === 'dashed',
        rows: urgent === 'Dossier Dossier A' && normal === 'Dossier ',
        removed: removable && field(SUBJECT).value === 'Dossier #FeDossiers.Titre' && !modalShown('var-condition-modal'),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      if (modalShown('var-condition-modal')) cancelWindow(modal);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ stored, urgent, normal }) };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_text_before_and_after_a_bubble_is_written_only_when_it_shows_a_value_in_every_field',
    'Le texte « Avant » / « Après » d’une bulle (la virgule, les guillemets) suit dans l’Objet, les adresses et le nom du PDF : il force l’écriture en HTML, se relit avec la valeur du champ, ne s’écrit que si la bulle s’affiche avec une valeur (condition tenue, valeur non vide), et le nom du PDF nettoie ses caractères interdits APRÈS l’avoir ajouté ; un collage le garde',
    async (h) => {
      const around = { before: '« ', after: ' »' };
      const items = [T('Suivi '), B('Titre', around)];
      const stored = FieldCodec.toStored(items);
      const back = FieldCodec.itemsOf(stored).filter(item => item.badge)[0];
      const empty = await text(stored, Object.assign({}, REC_1, { Titre: '' }));
      const hidden = FieldCodec.toStored([T('Suivi '), B('Titre', Object.assign({ condition: URGENT }, around))]);
      field(SUBJECT).value = stored;
      const attrs = badgesOf(SUBJECT)[0].node.attrs;
      const kept = field(SUBJECT).value;
      // Le nom du PDF : « / » vient du texte « Après », pas de la valeur - il est nettoyé quand même.
      const file = rich([T('Suivi_'), B('Titre', { before: '[', after: ' / ' })]);
      // Un collage depuis le document ou un autre champ : la bulle arrive avec son texte « Avant » / « Après ».
      editorOf(CC).view.pasteHTML(`<p>${EditorNodes.varBadgeHtml(B('Titre', around).badge)}</p>`);
      const pasted = badgesOf(CC).map(b => [b.node.attrs.before, b.node.attrs.after]);
      const checks = {
        html: FieldCodec.isRich(stored) && /data-before="« "/.test(stored) && /data-after=" »"/.test(stored),
        plainStaysPlain: FieldCodec.toStored([T('Suivi '), B('Titre')]) === 'Suivi #FeDossiers.Titre',
        reread: !!back && back.badge.before === around.before && back.badge.after === around.after,
        field: !!attrs && attrs.before === around.before && attrs.after === around.after && kept === stored,
        shown: (await text(stored)) === 'Suivi « Dossier A »',
        noValue: empty === 'Suivi ',
        conditionHolds: (await text(hidden)) === 'Suivi « Dossier A »',
        conditionFails: (await text(hidden, REC_2)) === 'Suivi ',
        fileName: (await filename(file)) === 'Suivi_[Dossier A _ ',
        pasted: same(pasted, [[around.before, around.after]]),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ stored, empty }) };
    },
  );

  scenario(
    'fieldeditor_condition_window_sets_the_text_before_and_after_a_bubble_of_a_field',
    'La fenêtre de condition d’une bulle de champ a les deux petits champs « Avant » et « Après » : ils se règlent sans condition, la valeur passe en HTML, l’Objet s’écrit avec le texte autour, le bouton « Condition » de la barre s’allume, et les vider rend le champ en texte brut',
    async (h) => {
      field(SUBJECT).value = 'Dossier #FeDossiers.Titre';
      await selectBubble(h, SUBJECT, 0);
      const quiet = panelButton('var-condition').classList.contains('is-active');
      press('var-condition');
      await h.sleep(120);
      const modal = document.getElementById('var-condition-modal');
      const before = document.getElementById('var-condition-before');
      const after = document.getElementById('var-condition-after');
      const shown = modalShown('var-condition-modal') && !!before && !!after && before.getClientRects().length > 0 && after.getClientRects().length > 0;
      setInput(before, '« ');
      setInput(after, ' »');
      await h.sleep(60);
      saveWindow(modal);
      await h.sleep(150);
      const stored = field(SUBJECT).value;
      const attrs = badgesOf(SUBJECT)[0].node.attrs;
      const written = await text(stored);
      await selectBubble(h, SUBJECT, 0);
      const lit = panelButton('var-condition').classList.contains('is-active');
      press('var-condition');
      await h.sleep(120);
      const reopened = { before: document.getElementById('var-condition-before').value, after: document.getElementById('var-condition-after').value };
      setInput(document.getElementById('var-condition-before'), '');
      setInput(document.getElementById('var-condition-after'), '');
      saveWindow(document.getElementById('var-condition-modal'));
      await h.sleep(150);
      const checks = {
        quiet: !quiet,
        shown,
        attrs: attrs.before === '« ' && attrs.after === ' »' && attrs.condition === null,
        html: FieldCodec.isRich(stored) && /data-before=/.test(stored) && !/data-condition=/.test(stored),
        written: written === 'Dossier « Dossier A »',
        lit,
        reopened: reopened.before === '« ' && reopened.after === ' »',
        cleared: field(SUBJECT).value === 'Dossier #FeDossiers.Titre',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      if (modalShown('var-condition-modal')) cancelWindow(document.getElementById('var-condition-modal'));
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ stored, written, reopened }) };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_other_attributes_window_replaces_or_inserts_columns_of_the_linked_row',
    'La fenêtre « Autres attributs » d’une bulle Référence d’un champ : « Remplacer » change la colonne de la même bulle (#Responsable devient #FeAnnuaire.Email, liée par la colonne Référence) en gardant sa condition, « Insérer » ajoute les colonnes cochées derrière, séparées d’une espace et avec la même condition ; la valeur se résout en l’email puis en le nom, l’email et le téléphone',
    async (h) => {
      const linked = () => document.getElementById('var-linked-modal');
      const tick = cols => cols.forEach(col => {
        const input = linked().querySelector(`.var-linked-row[data-col="${col}"] input`);
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      field(SUBJECT).value = rich([T('Resp : '), B('Responsable', { condition: URGENT })]);
      await selectBubble(h, SUBJECT, 0);
      press('var-linked');
      await h.sleep(300);
      const offered = linked() ? Array.from(linked().querySelectorAll('.var-linked-row')).map(r => r.dataset.col).sort() : [];
      tick(['Email']);
      const replace = linked() && linked().querySelector('button.var-linked-replace');
      if (replace) replace.click();
      await h.sleep(200);
      const replaced = badgesOf(SUBJECT).map(b => ({ key: b.node.attrs.key, column: b.node.attrs.column, condition: !!b.node.attrs.condition }));
      const stored = field(SUBJECT).value;
      const resolved = await text(stored);
      const other = await text(stored, REC_2);
      field(SUBJECT).value = rich([T('Resp : '), B('Responsable', { condition: URGENT })]);
      await selectBubble(h, SUBJECT, 0);
      press('var-linked');
      await h.sleep(300);
      tick(['Email', 'Telephone']);
      linked().querySelector('.var-modal-primary').click();
      await h.sleep(200);
      const inserted = badgesOf(SUBJECT).map(b => ({ key: b.node.attrs.key, condition: !!b.node.attrs.condition }));
      const insertedText = textOf(SUBJECT);
      const both = await text(field(SUBJECT).value);
      const checks = {
        offered: offered.includes('Email') && offered.includes('Telephone') && offered.includes('NomPrenom'),
        replaced: replaced.length === 1 && replaced[0].column === 'Email' && replaced[0].key === 'FeAnnuaire.Email' && replaced[0].condition,
        replacedValue: resolved === 'Resp : jean.dupont@ex.fr' && other === 'Resp : ',
        inserted: same(inserted, [{ key: 'FeDossiers.Responsable', condition: true }, { key: 'FeAnnuaire.Email', condition: true }, { key: 'FeAnnuaire.Telephone', condition: true }]) && insertedText === 'Resp :   ',
        insertedValue: both === 'Resp : Dupont Jean jean.dupont@ex.fr 06 11 22 33 44',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? failed.join(', ') + ' ' + JSON.stringify({ offered, replaced, resolved, other, inserted, insertedText, both, replaceButton: !!replace }) : 'ok' };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_number_controls_of_the_toolbar_set_the_format_and_the_zero_toggle_is_greyed',
    'La barre d’une bulle numérique d’un champ règle son format (style US, décimales, devise) et la valeur s’écrit ainsi ; le bouton « zéro » y est grisé, relâché, avec sa raison en info-bulle (un champ écrit toujours le zéro) et un clic ne change rien ; pas de cases à cocher pour un Oui / Non',
    async (h) => {
      field(SUBJECT).value = 'Total #FeDossiers.Montant';
      await selectBubble(h, SUBJECT, 0);
      press('num-style:us');
      await h.sleep(60);
      const panel = panels()[0];
      // Le focus passe dans la barre (le champ le perd) : la bulle reste sélectionnée et la barre ouverte.
      const decimals = panel.querySelector('select[data-role="num-decimals"]');
      decimals.focus();
      await h.sleep(120);
      const kept = { panel: panels().length === 1, selected: !!editorOf(SUBJECT).state.selection.node, focused: document.activeElement === decimals };
      setInput(decimals, '2');
      await h.sleep(60);
      setInput(panel.querySelector('input[data-role="num-currency"]'), '$');
      await h.sleep(60);
      const format = badgesOf(SUBJECT)[0].node.attrs.format;
      const stored = field(SUBJECT).value;
      const written = await text(stored);
      const zero = panelButton('num-zero');
      const zeroState = { disabled: zero.getAttribute('aria-disabled') === 'true' && zero.classList.contains('is-disabled'), pressed: zero.getAttribute('aria-pressed'), title: zero.title };
      const before = JSON.stringify(badgesOf(SUBJECT)[0].node.attrs.format);
      press('num-zero');
      await h.sleep(60);
      const unchanged = JSON.stringify(badgesOf(SUBJECT)[0].node.attrs.format) === before;
      field(SUBJECT).value = 'Actif #FeDossiers.Actif';
      await selectBubble(h, SUBJECT, 0);
      const bool = panels()[0].querySelector('[data-var-panel="bool"]');
      const boolHidden = !bool || bool.hidden;
      const checks = {
        kept: kept.panel && kept.selected && kept.focused,
        format: !!format && format.type === 'number' && format.style === 'us' && format.decimals === 2 && format.currency === '$',
        html: FieldCodec.isRich(stored),
        written: written === 'Total ' + VariableFormat.formatNumber(1200.5, { type: 'number', style: 'us', decimals: 2, currency: '$' }),
        zero: zeroState.disabled && zeroState.pressed === 'false' && zeroState.title === I18n.t('varFmt.zeroInField'),
        unchanged,
        boolHidden,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? failed.join(', ') + ' ' + JSON.stringify({ kept, format, stored, written, zeroState, unchanged, boolHidden }) : 'ok' };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_loop_window_offers_only_the_sentence_and_list_window_has_no_split_in_a_field',
    'Dans un champ, la fenêtre « Boucle » ne propose que « dans la phrase » (une seule ligne de texte : ni ligne de tableau, ni paragraphe) et enregistre une boucle dans la phrase ; la fenêtre « Liste » grise « Un document par valeur », décochée, avec sa raison ; les deux valent ensuite dans le texte du champ',
    async (h) => {
      field(SUBJECT).value = 'Lignes : #FeLignes.Designation';
      await selectBubble(h, SUBJECT, 0);
      press('var-loop');
      await h.sleep(300);
      const loopModal = document.getElementById('var-loop-modal');
      const segments = loopModal ? Array.from(loopModal.querySelectorAll('.var-loop-seg button')).map(b => [b.dataset.repeat, b.getAttribute('aria-pressed')]) : [];
      saveWindow(loopModal);
      await h.sleep(200);
      const loop = badgesOf(SUBJECT)[0].node.attrs.loop;
      const stored = field(SUBJECT).value;
      const lines = await text(stored);
      field(SUBJECT).value = 'Tags : #FeDossiers.Tags';
      await selectBubble(h, SUBJECT, 0);
      press('var-list');
      await h.sleep(300);
      const listModal = document.getElementById('var-list-modal');
      const split = listModal.querySelector('#var-list-split');
      const hint = listModal.querySelector('#var-list-split-hint').textContent;
      const splitState = { disabled: split.disabled, checked: split.checked };
      listModal.querySelector('.var-loop-seg button[data-pick="first"]').click();
      await h.sleep(60);
      saveWindow(listModal);
      await h.sleep(200);
      const listFormat = badgesOf(SUBJECT)[0].node.attrs.format;
      const tags = await text(field(SUBJECT).value);
      const checks = {
        segments: same(segments, [['inline', 'true']]),
        loop: !!loop && loop.repeat === 'inline' && loop.table === 'FeLignes',
        html: FieldCodec.isRich(stored),
        lines: lines === 'Lignes : Audit, Livret et Suivi',
        split: splitState.disabled && !splitState.checked && hint === I18n.t('varList.split.hintField'),
        list: !!listFormat && !!listFormat.list && listFormat.list.pick === 'first' && !listFormat.list.perValue,
        tags: tags === 'Tags : a',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.join(', ') || JSON.stringify({ segments, loop, splitState, hint, listFormat }) };
    },
    { email: true },
  );

  scenario(
    'fieldeditor_bubble_settings_show_in_the_field_like_in_the_document',
    'Dans le champ, une bulle à condition a le trait pointillé du document, une bulle à format le point bleu, une boucle dans la phrase son icône, et les bulles gardent la forme de celles du document (hauteur, coins arrondis) ; la bulle d’un champ Cci ou du nom du PDF, repliés, se dessine de même quand ils s’ouvrent',
    async () => {
      field(SUBJECT).value = rich([B('Titre'), T(' '), B('Statut', { condition: URGENT }), T(' '), B('Montant', { format: { type: 'number', style: 'us' } }), T(' '), B('Designation', { loop: { repeat: 'inline', table: 'FeLignes', separator: ', ', lastSeparator: ' et ', empty: 'hide' } }, 'FeLignes')]);
      const spans = Array.from(editorOf(SUBJECT).view.dom.querySelectorAll('.var-badge'));
      const style = (el, pseudo) => getComputedStyle(el, pseudo);
      EditorCore.getEditor().commands.setContent('<p><span class="var-badge" contenteditable="false" data-table="FeDossiers" data-column="Titre" data-key="FeDossiers.Titre">#FeDossiers.Titre</span></p>');
      const reference = document.querySelector('.tiptap .var-badge');
      const plain = style(spans[0]);
      const documentLook = reference ? style(reference) : null;
      const checks = {
        spans: spans.length === 4,
        solid: plain.borderStyle === 'solid',
        dashed: style(spans[1]).borderStyle === 'dashed',
        dot: style(spans[2], '::after').content !== 'none' && style(spans[2], '::after').content !== 'normal',
        loop: style(spans[3]).backgroundImage !== 'none',
        sameShape: !!documentLook && plain.borderTopLeftRadius === documentLook.borderTopLeftRadius && plain.backgroundColor === documentLook.backgroundColor && plain.color === documentLook.color,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? failed.join(', ') + ' ' + JSON.stringify({ dot: style(spans[2], '::after').content, loopImage: style(spans[3]).backgroundImage, dataFormat: spans[2].getAttribute('data-format') }) : 'ok' };
    },
    { email: true },
  );

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.fieldEditor = cases;
})();
