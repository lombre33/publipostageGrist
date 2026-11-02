// Suite "formatSlots" - les mises en forme gardées au survol du pinceau (js/format-slots.js, js/format-slots-menu.js, PageLayout.getCustomFormats), demande d'Antoine du 22/10 lancée le 02/11 : « 3 mises en forme
// personnelles renommables », gardées « par modèle » et « partagées (tout le doc grist) » comme les couleurs favorites (réponse du 02/11).
//  - la forme gardée : la clé `textFormats` du JSON de la colonne Margins (trois places, bornées, nom de 40 caractères, rien d'écrit pour une place vide de la fin, les autres réglages de la page intacts, le tout
//    revient d'un rechargement du JSON) ; un JSON hostile ou d'une autre version est relu sans rien casser (réglages inconnus ou dangereux écartés) ;
//  - ce qu'on garde : la mise en forme du caractère et du paragraphe comme le pinceau les copie (curseur, mot, paragraphe entier, titre, texte ordinaire) ;
//  - ce qu'on applique : la même chose que le pinceau (le résultat est identique), en UNE transaction, sans toucher un lien ; rien sans sélection, rien d'une place vide ;
//  - renommer, retirer : une place retirée ne décale pas les autres ; un nom vide ou trop long ;
//  - le modèle : chaque geste est UN pas de Ctrl+Z et de Ctrl+Y (le domaine « page »), prévient l'enregistrement automatique ; le document : la ligne réservée aux réglages, partagée, un refus d'écriture se dit,
//    Ctrl+Z et Ctrl+Y défont et refont le geste sans écraser celui d'une autre personne ;
//  - le menu : l'intitulé du pinceau, deux blocs de trois lignes (modèle, partagées), les lignes vides et prises, les lignes grisées avec leur raison sans sélection, en français et en anglais, redessiné seulement
//    quand ce qu'il montre change ; les boutons (garder, appliquer, renommer, retirer) agissent comme les fonctions ; une mise en forme partagée se retire après une question ;
//  - grisé en e-mail et en macro-modèle comme le pinceau.
// Le vrai survol, le vrai clic, la fenêtre de renommage et les touches à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-format-slots-mouse.mjs (formatSlotsMouse).
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const stub = () => window.__gristStub;
  const $ = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const add = (id, description, run) => cases.push({ id, description, run });
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const flyout = () => $('v2-painter-flyout');
  const rowButton = (scope, slot, action) => flyout().querySelector('button[data-scope="' + scope + '"][data-slot="' + slot + '"][data-action="' + action + '"]');
  const statusText = () => $('status-msg').textContent;

  // La ligne réservée aux réglages du document dans la table des modèles (ce que Grist garde) : ses lignes, une au plus.
  const settingsRows = () => { const t = stub().state.rows[TABLE]; return t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub().getRow(TABLE, id)) : []; };
  const settingsJson = () => { const rows = settingsRows(); try { return rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { return 'illisible'; } };
  async function resetDocumentSettings() {
    if (!settingsRows().length && !Templates.getDocumentSettings().textFormats) return;
    for (const row of settingsRows()) await stub().applyUserActions([['RemoveRecord', TABLE, row.id]]);
    await Templates.loadAll();
  }
  // Attend que Grist ait reçu l'écriture des réglages du document.
  async function written(check) {
    for (let i = 0; i < 40; i += 1) { if (check(settingsJson())) return true; await sleep(50); }
    return false;
  }

  // Les bornes du texte `needle` dans le document (la première occurrence).
  function range(needle) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const at = node.text.indexOf(needle);
      if (at !== -1) found = { from: pos + at, to: pos + at + needle.length };
    });
    if (!found) throw new Error('texte introuvable : ' + needle);
    return found;
  }
  async function select(from, to) { ed().chain().focus().setTextSelection({ from, to }).run(); await sleep(60); }
  const selectText = async needle => { const r = range(needle); await select(r.from, r.to); };
  const caretIn = async needle => { const r = range(needle); await select(r.from + 1, r.from + 1); };
  const marksAt = needle => { const r = range(needle); return ed().state.doc.nodeAt(r.from).marks.map(m => m.type.name + (m.type.name === 'textStyle' ? JSON.stringify(Object.fromEntries(Object.entries(m.attrs).filter(([, v]) => v != null))) : '')).sort().join(','); };
  const blockAt = needle => { const r = range(needle); const $pos = ed().state.doc.resolve(r.from); return { type: $pos.parent.type.name, level: $pos.parent.attrs.level || null, align: $pos.parent.attrs.textAlign || null }; };
  const undo = async () => { ed().chain().focus().undo().run(); await sleep(80); await ActionHistory.whenIdle(); };
  const redo = async () => { ed().chain().focus().redo().run(); await sleep(80); await ActionHistory.whenIdle(); };
  function listen() {
    const seen = [];
    const on = () => seen.push('marginsChanged');
    document.addEventListener('pp:marginsChanged', on);
    return { seen, stop: () => document.removeEventListener('pp:marginsChanged', on) };
  }

  // Un document de départ : une source mise en forme (gras, italique, police, taille, couleur, centrée), un titre 2, un paragraphe ordinaire et une cible avec un lien.
  const SOURCE = { fontFamily: 'Georgia', fontSize: '18pt', color: '#c00000' };
  const SAMPLE = '<p>Source ordinaire</p><h2>Un titre</h2><p>Cible <a href="https://exemple.fr">lien</a> fin</p><p>Autre cible</p>';
  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    await resetDocumentSettings();
    ActionHistory.reset();
    Editor.setHTML(html || SAMPLE);
    await sleep(200);
    ed().chain().focus('start').run();
    MainToolbar.syncToolbarState();
  }
  // Met la source en forme : texte « Source ordinaire » en gras, italique, Georgia 18 pt rouge, le paragraphe centré.
  async function styleSource() {
    const r = range('Source ordinaire');
    ed().chain().focus().setTextSelection(r).setMark('textStyle', SOURCE).toggleBold().toggleItalic().setTextAlign('center').run();
    await sleep(80);
  }
  async function cleanup(h) {
    I18n.setLang('fr');
    MainToolbar.setEmailMode(false);
    MainToolbar.setMacroMode(false);
    MainToolbar.syncToolbarState();
    PageLayout.setMarginsMm(null);
    await h.resetEditor();
    await resetDocumentSettings();
    ActionHistory.reset();
  }

  // === La forme gardée dans le JSON du modèle ===
  add('fs_the_model_keeps_three_bounded_places_in_the_margins_json',
    'PageLayout.setCustomFormats : trois places au plus, un nom nettoyé et borné à 40 caractères, une place sans nom ou sans réglage retirée, rien d\'écrit pour une place vide de la fin ni pour une liste vide, les autres réglages de la page intacts, et le JSON de la colonne Margins restitue le tout',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
        check('départ vide', same(PageLayout.getCustomFormats(), []) && !('textFormats' in PageLayout.getMarginsMm()));
        PageLayout.setCustomColors(['#112233']);
        PageLayout.setWatermark({ text: 'COPIE', angle: 'diagonal', color: '#999999', opacity: 0.2 });
        const changed = PageLayout.setCustomFormats([{ name: '  Titre   rouge ', style: { bold: true, color: '#c00000' } }, null, { name: 'Centré', block: { type: 'paragraph', align: 'center' } }]);
        const kept = PageLayout.getCustomFormats();
        check('trois places, nom nettoyé', changed === true && same(kept, [{ name: 'Titre rouge', style: { bold: true, color: '#c00000' } }, null, { name: 'Centré', block: { type: 'paragraph', align: 'center' } }]), kept);
        check('la même liste ne change rien', PageLayout.setCustomFormats(kept) === false);
        check('les autres réglages de la page sont intacts', same(PageLayout.getCustomColors(), ['#112233']) && PageLayout.getWatermark() && PageLayout.getWatermark().text === 'COPIE');
        const json = JSON.parse(JSON.stringify(PageLayout.getMarginsMm()));
        check('le JSON de la colonne Margins porte la clé', same(json.textFormats, kept), json.textFormats);
        PageLayout.setMarginsMm(null);
        check('un modèle neuf n\'en a pas', same(PageLayout.getCustomFormats(), []) && !('textFormats' in PageLayout.getMarginsMm()));
        PageLayout.setMarginsMm(json);
        check('le JSON rechargé rend les places', same(PageLayout.getCustomFormats(), kept) && same(PageLayout.getCustomColors(), ['#112233']));
        PageLayout.setCustomFormats([{ name: 'A', style: {} }, null, null]);
        check('les places vides de la fin ne s\'écrivent pas', same(PageLayout.getCustomFormats(), [{ name: 'A', style: {} }]), PageLayout.getCustomFormats());
        const long = 'x'.repeat(60);
        PageLayout.setCustomFormats([{ name: long, style: {} }, { name: '', style: {} }, { name: 'sans réglage' }, { name: 'quatrième', style: {} }]);
        const bounded = PageLayout.getCustomFormats();
        check('nom de 40 caractères, place sans nom retirée, place sans réglage retirée', bounded.length === 1 && bounded[0].name === 'x'.repeat(40), bounded);
        PageLayout.setCustomFormats([null, null, null, { name: 'quatrième', style: {} }]);
        check('une quatrième place n\'existe pas', same(PageLayout.getCustomFormats(), []), PageLayout.getCustomFormats());
        PageLayout.setCustomFormats([{ name: 'Énorme', style: { fontFamily: 'a'.repeat(3000) } }, 'texte', { name: 'ok', style: { italic: true } }]);
        check('une place démesurée ou qui n\'en est pas une est écartée, la suivante reste à sa place', same(PageLayout.getCustomFormats(), [null, null, { name: 'ok', style: { italic: true } }]), PageLayout.getCustomFormats());
        PageLayout.setMarginsMm({ top: 20, textFormats: 'pas une liste' });
        check('une valeur qui n\'est pas une liste est ignorée', same(PageLayout.getCustomFormats(), []));
        PageLayout.setCustomFormats([{ name: 'A', style: {} }]);
        check('liste vide : la clé disparaît', PageLayout.setCustomFormats([]) === true && !('textFormats' in PageLayout.getMarginsMm()));
        return result(bad);
      } finally { await cleanup(h); }
    });

  add('fs_hostile_json_is_read_without_breaking_and_its_dangerous_settings_never_reach_the_document',
    'Un JSON abîmé ou écrit à la main (réglages inconnus, couleur ou taille dangereuse, niveau de titre 9, alignement avec du CSS, espaces démesurés, type inconnu) : les places sont relues avec les seuls réglages sûrs ; appliquées, elles ne posent que cela dans le document',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        PageLayout.setCustomFormats([
          { name: 'x', style: { color: 'url(javascript:alert(1))', fontSize: '999em;position:fixed', bold: 'oui', fontFamily: 'a;b', italic: true, hack: 1 }, block: { type: 'heading', level: 9 } },
          { name: 'y', block: { type: 'paragraph', align: 'left;color:red', spacing: { lineHeight: 'abc', spaceBefore: 1e9, indentLeft: -5, indentFirst: 'x' } } },
          { name: 'z', style: { underline: true }, block: { type: 'script' } },
        ]);
        const slots = FormatSlots.slots('model');
        if (!same(slots[0], { name: 'x', style: { italic: true } })) bad.push('place 0 : ' + JSON.stringify(slots[0]));
        if (!same(slots[1], { name: 'y', block: { type: 'paragraph', spacing: { spaceBefore: 1584 } } })) bad.push('place 1 : ' + JSON.stringify(slots[1]));
        if (!same(slots[2], { name: 'z', style: { underline: true } })) bad.push('place 2 : ' + JSON.stringify(slots[2]));
        await caretIn('Cible');
        await selectText('Autre cible');
        FormatSlots.apply(ed(), 'model', 1);
        await sleep(80);
        const html = Editor.getHTML();
        if (/javascript|position|color:\s*red|text-align:\s*left;/.test(html)) bad.push('du CSS dangereux est arrivé dans le document : ' + html);
        if (!/padding-top: 1584pt/.test(html) && !/1584/.test(html)) bad.push('l\'espace borné n\'est pas posé : ' + html);
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Garder ===
  add('fs_save_keeps_the_character_and_paragraph_formatting_the_way_the_painter_copies_it',
    'Garder au curseur d\'un paragraphe mis en forme : le style du caractère (gras, italique, police, taille, couleur) et le paragraphe (centré) ; sur un mot seul : le caractère seulement ; sur un titre : le niveau ; sur un texte ordinaire : un style vide ; la place vide reçoit « Mise en forme N », une place prise garde son nom',
    async (h) => {
      try {
        await setup(h);
        await styleSource();
        const bad = [];
        const slotOf = (scope, i) => FormatSlots.slots(scope)[i];
        await caretIn('Source');
        if (FormatSlots.save(ed(), 'model', 0) !== true) bad.push('garder au curseur a rendu faux');
        if (!same(slotOf('model', 0), { name: 'Mise en forme 1', style: { bold: true, italic: true, color: '#c00000', fontSize: '18pt', fontFamily: 'Georgia' }, block: { type: 'paragraph', align: 'center' } })) bad.push('au curseur : ' + JSON.stringify(slotOf('model', 0)));
        await selectText('Source');
        FormatSlots.save(ed(), 'model', 1);
        if (!same(slotOf('model', 1), { name: 'Mise en forme 2', style: { bold: true, italic: true, color: '#c00000', fontSize: '18pt', fontFamily: 'Georgia' } })) bad.push('sur un mot : ' + JSON.stringify(slotOf('model', 1)));
        await caretIn('Un titre');
        FormatSlots.save(ed(), 'model', 2);
        if (!same(slotOf('model', 2), { name: 'Mise en forme 3', style: {}, block: { type: 'heading', level: 2 } })) bad.push('titre : ' + JSON.stringify(slotOf('model', 2)));
        await caretIn('Autre');
        FormatSlots.save(ed(), 'document', 0);
        if (!same(slotOf('document', 0), { name: 'Mise en forme 1', style: {}, block: { type: 'paragraph' } })) bad.push('texte ordinaire : ' + JSON.stringify(slotOf('document', 0)));
        await caretIn('Source');
        FormatSlots.rename('model', 0, 'Mon titre');
        FormatSlots.save(ed(), 'model', 0);
        if (slotOf('model', 0).name !== 'Mon titre') bad.push('une place prise a perdu son nom : ' + JSON.stringify(slotOf('model', 0)));
        if (FormatSlots.save(ed(), 'inconnue', 0) !== false || FormatSlots.save(ed(), 'model', 3) !== false || FormatSlots.save(ed(), 'model', -1) !== false) bad.push('une portée ou une place inconnue n\'est pas refusée');
        if (!/gardée dans ce modèle/.test(statusText()) && !/Mon titre/.test(statusText())) bad.push('le coin d\'état ne le dit pas : ' + statusText());
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Appliquer ===
  add('fs_apply_paints_the_selection_exactly_like_the_painter_in_one_undo_step_and_keeps_links',
    'Appliquer une place sur un paragraphe sélectionné donne le même document que le pinceau (marques, police, taille, couleur, centrage), laisse le lien, et un seul Ctrl+Z le défait ; sur un mot seul, le paragraphe garde son alignement ; une place de titre refait un titre',
    async (h) => {
      try {
        await setup(h);
        await styleSource();
        const bad = [];
        const target = 'Cible lien fin';
        // La référence : le pinceau lui-même.
        await caretIn('Source');
        FormatPainter.copy();
        await selectText('Cible');
        const wholeParagraph = () => { const r = range('Cible'); const $pos = ed().state.doc.resolve(r.from); return { from: $pos.start(), to: $pos.end() }; };
        const para = wholeParagraph();
        await select(para.from, para.to);
        FormatPainter.apply();
        await sleep(80);
        const viaPainter = Editor.getHTML();
        FormatPainter.disarm();
        await undo();
        // La place gardée, appliquée de même.
        await caretIn('Source');
        FormatSlots.save(ed(), 'model', 0);
        const before = Editor.getHTML();
        const para2 = wholeParagraph();
        await select(para2.from, para2.to);
        const applied = FormatSlots.apply(ed(), 'model', 0);
        await sleep(80);
        const viaSlot = Editor.getHTML();
        if (applied !== true) bad.push('apply a rendu faux');
        if (viaSlot !== viaPainter) bad.push('pas le même document que le pinceau : ' + viaSlot + ' / ' + viaPainter);
        if (!/<a [^>]*href="https:\/\/exemple.fr"/.test(viaSlot)) bad.push('le lien a bougé');
        if (blockAt('Cible').align !== 'center') bad.push('le paragraphe n\'est pas centré');
        if (!/bold|strong/.test(marksAt('Cible') + marksAt('fin')) && !/bold/.test(marksAt('Cible'))) bad.push('pas de gras : ' + marksAt('Cible'));
        if (!/status|appliquée/.test(statusText())) bad.push('le coin d\'état ne le dit pas : ' + statusText());
        await undo();
        if (Editor.getHTML() !== before) bad.push('un seul Ctrl+Z ne rend pas le texte d\'avant : ' + Editor.getHTML());
        // Sur un mot seul : les marques, pas le paragraphe.
        await selectText('Autre');
        const wordAlign = blockAt('Autre').align;
        FormatSlots.apply(ed(), 'model', 0);
        await sleep(80);
        if (blockAt('Autre').align !== wordAlign) bad.push('peindre un mot a changé l\'alignement du paragraphe');
        if (!/textStyle/.test(marksAt('Autre'))) bad.push('le mot n\'a pas pris la mise en forme : ' + marksAt('Autre'));
        return result(bad);
      } finally { await cleanup(h); }
    });

  add('fs_apply_turns_a_paragraph_into_a_title_with_a_title_place_and_does_nothing_without_a_selection_or_from_an_empty_place',
    'Une place de titre 2 appliquée à un paragraphe entier en fait un titre 2 ; sans sélection (curseur), sur une place vide, sur une portée inconnue : faux et rien ne change',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        await caretIn('Un titre');
        FormatSlots.save(ed(), 'model', 2);
        const r = range('Autre cible');
        const $pos = ed().state.doc.resolve(r.from);
        await select($pos.start(), $pos.end());
        const before = Editor.getHTML();
        if (FormatSlots.apply(ed(), 'model', 2) !== true) bad.push('apply sur un paragraphe entier a rendu faux');
        await sleep(80);
        if (blockAt('Autre cible').type !== 'heading' || blockAt('Autre cible').level !== 2) bad.push('pas un titre 2 : ' + JSON.stringify(blockAt('Autre cible')));
        await undo();
        if (Editor.getHTML() !== before) bad.push('Ctrl+Z ne rend pas le paragraphe');
        await caretIn('Autre cible');
        const still = Editor.getHTML();
        if (FormatSlots.apply(ed(), 'model', 2) !== false || Editor.getHTML() !== still) bad.push('un curseur sans sélection a changé le texte ou rendu vrai');
        await selectText('Autre cible');
        if (FormatSlots.apply(ed(), 'model', 0) !== false) bad.push('une place vide a rendu vrai');
        if (FormatSlots.apply(ed(), 'inconnue', 2) !== false) bad.push('une portée inconnue a rendu vrai');
        if (Editor.getHTML() !== still) bad.push('le texte a changé');
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Renommer, retirer ===
  add('fs_rename_and_clear_keep_the_other_places_where_they_are',
    'Renommer nettoie et borne le nom (jamais vide, 40 caractères) ; retirer la place 0 laisse la place 1 à sa place ; renommer ou retirer une place vide ne fait rien',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        await caretIn('Source');
        FormatSlots.save(ed(), 'model', 0);
        await caretIn('Un titre');
        FormatSlots.save(ed(), 'model', 1);
        if (FormatSlots.rename('model', 0, '   ') !== false || FormatSlots.slots('model')[0].name !== 'Mise en forme 1') bad.push('un nom vide a été accepté');
        if (FormatSlots.rename('model', 0, 'Mise en forme 1') !== false) bad.push('le même nom a rendu vrai');
        if (FormatSlots.rename('model', 0, '  Mon   style  ') !== true || FormatSlots.slots('model')[0].name !== 'Mon style') bad.push('nom nettoyé : ' + FormatSlots.slots('model')[0].name);
        FormatSlots.rename('model', 1, 'y'.repeat(60));
        if (FormatSlots.slots('model')[1].name !== 'y'.repeat(40)) bad.push('nom non borné : ' + FormatSlots.slots('model')[1].name.length);
        if (FormatSlots.rename('model', 2, 'Rien') !== false || FormatSlots.clear('model', 2) !== false) bad.push('une place vide a pu être renommée ou retirée');
        if (FormatSlots.clear('model', 0) !== true) bad.push('retirer a rendu faux');
        const after = FormatSlots.slots('model');
        if (after[0] !== null || !after[1] || after[1].name !== 'y'.repeat(40) || after[2] !== null) bad.push('la place 1 a bougé : ' + JSON.stringify(after.map(slot => slot && slot.name)));
        if (!same(PageLayout.getCustomFormats().map(slot => slot && slot.name), [null, 'y'.repeat(40)])) bad.push('JSON gardé : ' + JSON.stringify(PageLayout.getCustomFormats()));
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Ctrl+Z du modèle ===
  add('fs_model_gestures_are_one_ctrl_z_and_one_ctrl_y_each_and_warn_the_autosave',
    'Garder, renommer et retirer dans le modèle : chaque geste est UN pas de Ctrl+Z et de Ctrl+Y (le texte ne bouge pas), annonce pp:marginsChanged (l\'enregistrement automatique), et le menu suit',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        const names = () => FormatSlots.slots('model').map(slot => slot && slot.name);
        const text = Editor.getHTML();
        const heard = listen();
        try {
          await caretIn('Source');
          FormatSlots.save(ed(), 'model', 0);
          if (!heard.seen.length) bad.push('garder n\'a pas prévenu l\'enregistrement automatique');
          await sleep(600);
          FormatSlots.rename('model', 0, 'Nom');
          await sleep(600);
          FormatSlots.clear('model', 0);
          await sleep(600);
          if (!same(names(), [null, null, null])) bad.push('après les trois gestes : ' + JSON.stringify(names()));
          await undo();
          if (!same(names(), ['Nom', null, null])) bad.push('Ctrl+Z du retrait : ' + JSON.stringify(names()));
          await undo();
          if (!same(names(), ['Mise en forme 1', null, null])) bad.push('Ctrl+Z du renommage : ' + JSON.stringify(names()));
          await undo();
          if (!same(names(), [null, null, null])) bad.push('Ctrl+Z de la sauvegarde : ' + JSON.stringify(names()));
          if (Editor.getHTML() !== text) bad.push('le texte a bougé');
          await redo();
          if (!same(names(), ['Mise en forme 1', null, null])) bad.push('Ctrl+Y de la sauvegarde : ' + JSON.stringify(names()));
          await redo(); await redo();
          if (!same(names(), [null, null, null])) bad.push('après trois Ctrl+Y : ' + JSON.stringify(names()));
          MainToolbar.syncToolbarState();
          if (flyout().querySelectorAll('.pp-fs-empty').length !== 6) bad.push('le menu n\'a pas suivi : ' + flyout().querySelectorAll('.pp-fs-empty').length + ' places vides');
        } finally { heard.stop(); }
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Le document ===
  add('fs_document_places_are_shared_in_the_reserved_settings_row_and_a_refused_write_is_said',
    'Garder dans le document : la ligne réservée aux réglages (TypeModele « reglages ») reçoit la clé textFormats, une autre personne la relit, aucune table n\'est créée ; retirer la dernière place retire la clé ; un refus d\'écriture de Grist se dit dans le coin d\'état',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        await caretIn('Source');
        FormatSlots.save(ed(), 'document', 1);
        const now = Templates.getDocumentSettings().textFormats;
        if (!now || now[0] !== null || !now[1] || now[1].name !== 'Mise en forme 2') bad.push('lecteurs : ' + JSON.stringify(now));
        if (!(await written(json => json && json.textFormats && json.textFormats[1] && json.textFormats[1].name === 'Mise en forme 2'))) bad.push('Grist n\'a pas reçu la place : ' + JSON.stringify(settingsJson()));
        if (settingsRows().length !== 1) bad.push('il y a ' + settingsRows().length + ' lignes de réglages');
        if (!/pour tout le document/.test(statusText())) bad.push('le coin d\'état ne le dit pas : ' + statusText());
        // Une autre personne l\'a écrite : le document se relit.
        await stub().applyUserActions([['UpdateRecord', TABLE, settingsRows()[0].id, { Contenu: JSON.stringify({ textFormats: [{ name: 'Collègue', style: { italic: true } }] }) }]]);
        await Templates.loadAll();
        if (!same(FormatSlots.slots('document').map(slot => slot && slot.name), ['Collègue', null, null])) bad.push('la place d\'une autre personne n\'est pas relue : ' + JSON.stringify(FormatSlots.slots('document')));
        // Retirer la dernière place : la clé part.
        FormatSlots.clear('document', 0);
        if (!(await written(json => json && !('textFormats' in json)))) bad.push('la clé n\'est pas partie : ' + JSON.stringify(settingsJson()));
        // Un refus d\'écriture.
        const original = grist.docApi.applyUserActions;
        grist.docApi.applyUserActions = async () => { throw new Error('refusé'); };
        const warn = console.warn;
        console.warn = () => {};
        try {
          await caretIn('Source');
          FormatSlots.save(ed(), 'document', 2);
          await sleep(300);
        } finally { grist.docApi.applyUserActions = original; console.warn = warn; }
        if (!/n’ont pas pu être écrites|n'ont pas pu être écrites/.test(statusText())) bad.push('le refus n\'est pas dit : ' + statusText());
        if (FormatSlots.slots('document')[2] !== null) bad.push('la place refusée reste visible');
        return result(bad);
      } finally { await cleanup(h); }
    });

  add('fs_document_gestures_are_one_ctrl_z_and_one_ctrl_y_each_and_never_overwrite_another_persons_change',
    'Garder, renommer et retirer dans le document : chaque geste est UN pas de Ctrl+Z et de Ctrl+Y, depuis n\'importe quel modèle ; si une autre personne a changé les places entre-temps, Ctrl+Z n\'écrit rien et le dit',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        const names = () => FormatSlots.slots('document').map(slot => slot && slot.name);
        await caretIn('Source');
        FormatSlots.save(ed(), 'document', 0);
        await sleep(100);
        FormatSlots.rename('document', 0, 'Nom');
        await sleep(600);
        FormatSlots.clear('document', 0);
        await sleep(600);
        if (!same(names(), [null, null, null])) bad.push('après les trois gestes : ' + JSON.stringify(names()));
        await undo();
        if (!same(names(), ['Nom', null, null])) bad.push('Ctrl+Z du retrait : ' + JSON.stringify(names()));
        await undo();
        if (!same(names(), ['Mise en forme 1', null, null])) bad.push('Ctrl+Z du renommage : ' + JSON.stringify(names()));
        await undo();
        if (!same(names(), [null, null, null])) bad.push('Ctrl+Z de la sauvegarde : ' + JSON.stringify(names()));
        if (!(await written(json => json && !('textFormats' in json)))) bad.push('Grist n\'a pas reçu le retour : ' + JSON.stringify(settingsJson()));
        await redo();
        if (!same(names(), ['Mise en forme 1', null, null])) bad.push('Ctrl+Y de la sauvegarde : ' + JSON.stringify(names()));
        if (!(await written(json => json && json.textFormats && json.textFormats[0] && json.textFormats[0].name === 'Mise en forme 1'))) bad.push('Grist n\'a pas reçu le rétablissement : ' + JSON.stringify(settingsJson()));
        // Une autre personne a changé les places : défaire ne les écrase pas.
        await Templates.updateDocumentSettings({ textFormats: [{ name: 'Collègue', style: { italic: true } }] });
        await undo();
        if (!same(names(), ['Collègue', null, null])) bad.push('Ctrl+Z a écrasé la place d\'une autre personne : ' + JSON.stringify(names()));
        if (!/a changé depuis|has changed since/.test(statusText())) bad.push('le coin d\'état ne dit pas le conflit : ' + statusText());
        return result(bad);
      } finally { await cleanup(h); }
    });

  // === Le menu ===
  add('fs_menu_draws_the_painter_title_then_two_blocks_of_three_places_in_both_languages',
    'Le menu du pinceau : l\'intitulé du pinceau en tête (avec sa touche), « Mises en forme du modèle » et « Mises en forme partagées » avec leur infobulle, trois places chacune ; vides : « + Garder la mise en forme du texte » ; prises : le nom, un crayon et une corbeille nommés ; en anglais les mêmes',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        const heads = () => Array.from(flyout().querySelectorAll('.pp-fs-scope')).map(node => [node.textContent, node.title]);
        const rows = () => Array.from(flyout().querySelectorAll('.pp-fs-row'));
        FormatSlotsMenu.render();
        const label = flyout().firstElementChild;
        if (!label.classList.contains('v2-hover-flyout-label') || label.textContent !== 'Reproduire la mise en forme' || label.getAttribute('data-keytip') !== ' (Alt+Maj+C)') bad.push('intitulé : ' + label.textContent + ' ' + label.getAttribute('data-keytip'));
        if (!same(heads(), [['Mises en forme du modèle', 'Avec ce modèle seulement'], ['Mises en forme partagées', 'Pour tous les modèles de ce document Grist, partagées avec l’équipe']])) bad.push('blocs : ' + JSON.stringify(heads()));
        if (rows().length !== 6 || flyout().querySelectorAll('.pp-fs-empty').length !== 6) bad.push('six places vides attendues : ' + rows().length);
        if (!same(Array.from(flyout().querySelectorAll('.pp-fs-empty')).map(node => node.textContent), Array(6).fill('+ Garder la mise en forme du texte'))) bad.push('texte des places vides');
        await caretIn('Source');
        FormatSlots.save(ed(), 'model', 0);
        FormatSlots.save(ed(), 'document', 2);
        MainToolbar.syncToolbarState();
        const apply = rowButton('model', 0, 'apply');
        if (!apply || apply.textContent !== 'Mise en forme 1') bad.push('nom de la place 0 : ' + (apply && apply.textContent));
        const rename = rowButton('model', 0, 'rename');
        const clear = rowButton('model', 0, 'clear');
        if (!rename || !clear || rename.getAttribute('aria-label') !== 'Renommer « Mise en forme 1 »' || clear.getAttribute('aria-label') !== 'Retirer « Mise en forme 1 »') bad.push('crayon et corbeille : ' + (rename && rename.getAttribute('aria-label')) + ' / ' + (clear && clear.getAttribute('aria-label')));
        if (!rename.querySelector('svg') || !clear.querySelector('svg')) bad.push('icônes absentes');
        if (!rowButton('model', 1, 'save') || !rowButton('document', 2, 'apply') || !rowButton('document', 0, 'save')) bad.push('places du document');
        if (flyout().querySelectorAll('.pp-fs-empty').length !== 4) bad.push('quatre places vides attendues');
        // Le même en anglais.
        I18n.setLang('en');
        FormatSlotsMenu.render();
        if (!same(heads(), [['Template formats', 'With this template only'], ['Shared formats', 'For every template in this Grist document, shared with the team']])) bad.push('blocs en anglais : ' + JSON.stringify(heads()));
        if (!rowButton('model', 1, 'save').textContent.startsWith('+ Keep the text’s formatting')) bad.push('place vide en anglais : ' + rowButton('model', 1, 'save').textContent);
        if (rowButton('model', 0, 'rename').getAttribute('aria-label') !== 'Rename “Mise en forme 1”') bad.push('crayon en anglais');
        return result(bad);
      } finally { await cleanup(h); }
    });

  add('fs_menu_greys_apply_with_its_reason_without_a_selection_and_redraws_only_when_something_changes',
    'Sans sélection la ligne d\'une mise en forme est grisée avec sa raison (infobulle et aria-disabled), avec une sélection elle ne l\'est plus ; la barre n\'a pas à redessiner un menu inchangé (mêmes éléments), et le modèle qu\'on change (JSON rechargé) se voit',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        await caretIn('Source');
        FormatSlots.save(ed(), 'model', 0);
        MainToolbar.syncToolbarState();
        let apply = rowButton('model', 0, 'apply');
        if (apply.getAttribute('aria-disabled') !== 'true' || apply.title !== 'Sélectionnez le texte à mettre en forme.') bad.push('curseur : ' + apply.getAttribute('aria-disabled') + ' / ' + apply.title);
        const before = flyout().querySelector('.pp-fs-row');
        MainToolbar.syncToolbarState();
        if (flyout().querySelector('.pp-fs-row') !== before) bad.push('un menu inchangé a été redessiné');
        await selectText('Cible');
        MainToolbar.syncToolbarState();
        apply = rowButton('model', 0, 'apply');
        if (apply.getAttribute('aria-disabled') === 'true' || apply.title !== 'Appliquer à la sélection') bad.push('sélection : ' + apply.getAttribute('aria-disabled') + ' / ' + apply.title);
        // Un clic sur une ligne grisée ne fait rien.
        await caretIn('Cible');
        MainToolbar.syncToolbarState();
        const text = Editor.getHTML();
        rowButton('model', 0, 'apply').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await sleep(80);
        if (Editor.getHTML() !== text) bad.push('une ligne grisée a agi');
        // Le JSON d\'un autre modèle : le menu le montre dès la mise à jour de la barre.
        PageLayout.setMarginsMm({ textFormats: [null, { name: 'Venu d\'ailleurs', style: { underline: true } }] });
        MainToolbar.syncToolbarState();
        if (!rowButton('model', 1, 'apply') || rowButton('model', 1, 'apply').textContent !== 'Venu d\'ailleurs' || !rowButton('model', 0, 'save')) bad.push('le menu n\'a pas suivi le JSON rechargé');
        return result(bad);
      } finally { await cleanup(h); }
    });

  add('fs_menu_buttons_keep_apply_rename_and_clear_like_the_functions_and_ask_before_removing_a_shared_one',
    'Les boutons du menu : une place vide garde, le nom applique (et range le menu), le crayon ouvre « Renommer la mise en forme » (annulé ou vide : rien), la corbeille du modèle retire d\'un clic, celle d\'une mise en forme partagée pose d\'abord la question (refusée : rien ; acceptée : retirée) ; les boutons ne prennent pas le focus à la souris',
    async (h) => {
      const prompt = Dialogs.prompt;
      const confirm = Dialogs.confirm;
      try {
        await setup(h);
        const bad = [];
        const click = (button) => {
          const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
          button.dispatchEvent(down);
          button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return down.defaultPrevented;
        };
        await caretIn('Source');
        if (!click(rowButton('model', 0, 'save'))) bad.push('l\'appui sur un bouton du menu prend le focus');
        await sleep(80);
        if (!rowButton('model', 0, 'apply')) bad.push('la place gardée n\'est pas dessinée');
        // Appliquer
        await selectText('Autre cible');
        MainToolbar.syncToolbarState();
        click(rowButton('model', 0, 'apply'));
        await sleep(100);
        if (blockAt('Autre cible').type !== 'paragraph') bad.push('appliquer a changé le type');
        // Renommer
        const asked = [];
        Dialogs.prompt = async (options) => { asked.push(options); return '  Mon   rouge '; };
        click(rowButton('model', 0, 'rename'));
        await sleep(100);
        if (asked.length !== 1 || asked[0].title !== 'Renommer la mise en forme' || asked[0].value !== 'Mise en forme 1' || asked[0].confirmLabel !== 'Renommer') bad.push('fenêtre de renommage : ' + JSON.stringify(asked));
        if (rowButton('model', 0, 'apply').textContent !== 'Mon rouge') bad.push('nom : ' + rowButton('model', 0, 'apply').textContent);
        Dialogs.prompt = async () => null;
        click(rowButton('model', 0, 'rename'));
        await sleep(80);
        Dialogs.prompt = async () => '   ';
        click(rowButton('model', 0, 'rename'));
        await sleep(80);
        if (rowButton('model', 0, 'apply').textContent !== 'Mon rouge') bad.push('annulé ou vide a renommé');
        // Retirer dans le modèle : d\'un clic
        let questions = 0;
        Dialogs.confirm = async () => { questions += 1; return true; };
        click(rowButton('model', 0, 'clear'));
        await sleep(80);
        if (questions !== 0 || !rowButton('model', 0, 'save')) bad.push('retirer dans le modèle : ' + questions + ' question(s)');
        // Retirer une mise en forme partagée : la question d\'abord
        await caretIn('Source');
        click(rowButton('document', 1, 'save'));
        await sleep(80);
        Dialogs.confirm = async (options) => { questions += 1; bad.length === 0 && (asked.length = 0, asked.push(options)); return false; };
        click(rowButton('document', 1, 'clear'));
        await sleep(80);
        if (questions !== 1 || !rowButton('document', 1, 'apply')) bad.push('refusée : ' + questions + ' question(s), place ' + !!rowButton('document', 1, 'apply'));
        if (asked[0] && (asked[0].title !== 'Retirer « Mise en forme 2 » ?' || asked[0].danger !== true || !/toute l’équipe/.test(asked[0].message))) bad.push('question : ' + JSON.stringify(asked[0]));
        Dialogs.confirm = async () => true;
        click(rowButton('document', 1, 'clear'));
        await sleep(80);
        if (!rowButton('document', 1, 'save')) bad.push('acceptée : la place n\'est pas retirée');
        return result(bad);
      } finally { Dialogs.prompt = prompt; Dialogs.confirm = confirm; await cleanup(h); }
    });

  add('fs_the_painter_group_is_greyed_with_the_painter_in_email_and_macro_modes_and_nothing_acts',
    'En mode e-mail et en macro-modèle le groupe du pinceau est grisé (le menu avec lui) et garder, appliquer, renommer, retirer ne font rien ; hors de ces modes tout marche de nouveau',
    async (h) => {
      try {
        await setup(h);
        const bad = [];
        const group = $('v2-painter-group');
        await caretIn('Source');
        FormatSlots.save(ed(), 'model', 0);
        FormatSlots.save(ed(), 'document', 0);
        await sleep(100);
        await selectText('Autre cible');
        for (const mode of ['email', 'macro']) {
          MainToolbar.setEmailMode(mode === 'email');
          MainToolbar.setMacroMode(mode === 'macro');
          MainToolbar.syncToolbarState();
          if (!group.classList.contains('v2-hf-locked')) bad.push(mode + ' : le groupe n\'est pas grisé');
          const text = Editor.getHTML();
          const names = JSON.stringify([FormatSlots.slots('model'), FormatSlots.slots('document')]);
          const acted = [FormatSlots.save(ed(), 'model', 1), FormatSlots.apply(ed(), 'model', 0), FormatSlots.rename('model', 0, 'X'), FormatSlots.clear('model', 0), FormatSlots.save(ed(), 'document', 1), FormatSlots.clear('document', 0)];
          if (acted.some(Boolean)) bad.push(mode + ' : un geste a agi ' + JSON.stringify(acted));
          if (Editor.getHTML() !== text || JSON.stringify([FormatSlots.slots('model'), FormatSlots.slots('document')]) !== names) bad.push(mode + ' : l\'état a changé');
        }
        MainToolbar.setEmailMode(false);
        MainToolbar.setMacroMode(false);
        MainToolbar.syncToolbarState();
        if (group.classList.contains('v2-hf-locked')) bad.push('le groupe est resté grisé');
        if (FormatSlots.apply(ed(), 'model', 0) !== true) bad.push('appliquer ne marche plus après les modes');
        return result(bad);
      } finally { await cleanup(h); }
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.formatSlots = cases;
})();
