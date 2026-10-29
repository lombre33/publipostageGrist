// Suite "undoLinks" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir rendent aussi les RÈGLES DE LIAISON entre tables (suite de scenarios-undo-library.js : demande du 22/10, « Il doit prendre en compte 100% des actions faites
// dans le widget », et réponse du 27/10 « Oui, tout, Réglages compris »). Un lien est au document, pas dans un modèle : il se défait depuis n'importe quel modèle, par la pile de js/action-history.js, comme le ★ du document. Trois gestes
// l'écrivent et passent par js/link-rule-history.js : 1) la fenêtre de la clé (#link-config-modal), ouverte à l'insertion d'une variable d'une autre table sans lien réglé (Variables.ensureLinkConfigured) ou par le crayon de « Tables
// liées » (Variables.editLinkRule) ; 2) la corbeille de « Tables liées » ; 3) le lien posé d'office pour une colonne Référence de la page (VariableLinkedAttrs.open).
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z rend le lien tel qu'il était (aucun : il est retiré), UN Ctrl + Y le repose, dans l'ordre des gestes avec le texte ; le lien commun à toutes les tables et celui d'une table
// de la page ne se mélangent jamais ; un lien changé depuis par quelqu'un d'autre n'est jamais écrasé, ni rendu à une table disparue ; un geste annulé, inchangé ou refusé ne laisse pas de pas. Le même parcours à la vraie souris dans le
// panneau de 700x400 : verify-undo-links-mouse.mjs (undoLinksMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoLinks = (function () {
  const cases = [];
  const LINKS = 'Publipostage_LiensTables';
  const stub = () => window.__gristStub;
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function keyEvent(key) { return new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true }); }
  // La réserve d'actions (js/action-history.js) ; les cas échouent sur ce que la personne voit, pas sur un nom inconnu.
  const reserve = () => (typeof ActionHistory === 'undefined' ? { reset() {}, whenIdle: () => Promise.resolve(), count: () => 0 } : ActionHistory);
  const settle = async h => { await reserve().whenIdle(); await h.sleep(120); };
  async function undo(h) { ed().commands.focus('end'); await h.sleep(60); ed().view.dom.dispatchEvent(keyEvent('z')); await settle(h); }
  async function redo(h) { ed().commands.focus('end'); await h.sleep(60); ed().view.dom.dispatchEvent(keyEvent('y')); await settle(h); }
  const text = () => ed().getText();
  const status = () => byId('status-msg').textContent;
  const statusClass = () => byId('status-msg').className;
  const typedAtEnd = value => {
    const state = ed().state;
    const tr = state.tr.insertText(value, state.doc.content.size - 1);
    tr.setMeta('closeHistory$', true);
    ed().view.dispatch(tr);
  };

  // Les lignes de la table des liens pour la table liée `target`, telles que Grist les garde (jamais le cache du widget), et leur résumé « table de la page|mode|colonne de la table liée|colonne de la page » ('*' : le lien commun).
  function linkRows(target) {
    const table = stub().state.rows[LINKS];
    if (!table) return [];
    return table.id.map((id, i) => ({
      id, cible: table.TableCible[i], source: (table.TableSource && table.TableSource[i]) || '',
      mode: table.Mode[i], colonneCible: table.ColonneCible[i], colonneSource: table.ColonneSource[i],
    })).filter(row => row.cible === target);
  }
  const summary = target => linkRows(target).map(row => [row.source || '*', row.mode, row.colonneCible, row.colonneSource].join('|'));
  const linkWrites = () => stub().getActionLog().filter(action => action[1] === LINKS).map(action => action[0]);
  const AUTO = () => I18n.t('linkConfig.rowId');
  const removed = link => I18n.t('status.linkRemoved', { link });
  const restored = link => I18n.t('status.linkRestored', { link });

  // Une page sur UlDossiers (Responsable : Référence vers UlAnnuaire) ; UlContacts, pas encore liée, référence UlDossiers par Dossier : la règle devinée à l'ouverture de sa fenêtre est « Dossier = Auto ».
  async function seed(h) {
    await h.resetEditor();
    const s = stub();
    s.setVariables('UlAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    s.setVariables('UlDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:UlAnnuaire', gristHelper_Display: 'Any' }, null, { Responsable: 'gristHelper_Display' });
    s.setVariables('UlContacts', { Dossier: 'Ref:UlDossiers', Role: 'Text', Nom: 'Text', gristHelper_Display: 'Any' }, null, { Dossier: 'gristHelper_Display' });
    s.setRows('UlAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }]);
    s.setRows('UlDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, gristHelper_Display: 'Dupont Jean' }]);
    s.setRows('UlContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier', gristHelper_Display: 'Dossier A' }]);
    await GristAPI.refreshSchema();
    for (const table of ['UlAnnuaire', 'UlContacts']) await GristAPI.deleteLinkRule(table);
    s.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean' }, 'UlDossiers');
    Editor.setHTML('<p>Texte</p>');
    await h.sleep(100);
    reserve().reset();
    s.clearActionLog();
  }
  async function leave(h) {
    reserve().reset();
    for (const table of ['UlAnnuaire', 'UlContacts', 'UlTemp']) await GristAPI.deleteLinkRule(table);
    await h.sleep(50);
  }

  // La fenêtre de la clé : ouverte à l'insertion d'une variable de `table` (`insertion`) ou par le crayon de « Tables liées » ; la promesse rendue se règle à sa fermeture. Rendue dans un objet : une fonction async qui rendrait la
  // promesse elle-même l'attendrait, donc attendrait la fermeture d'une fenêtre encore ouverte.
  const windowOpen = () => byId('link-config-modal').style.display !== 'none';
  async function openKey(h, table) {
    const closed = Variables.ensureLinkConfigured({ table });
    await h.sleep(150);
    return { closed };
  }
  async function openEdit(h, table) {
    const closed = Variables.editLinkRule(table);
    await h.sleep(150);
    return { closed };
  }
  function choose(cible, source) {
    [['link-config-col-cible', cible], ['link-config-col-source', source]].forEach(([id, value]) => {
      const select = byId(id);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  async function confirm(h) { byId('link-config-confirm').click(); await h.sleep(120); }

  // « Tables liées » : la ligne dont le texte commence par `prefix`, sa corbeille (la confirmation répond oui) et la fenêtre refermée.
  const panelRow = prefix => Array.from(document.querySelectorAll('#link-rules-list .link-rule-row')).find(row => row.querySelector('.link-rule-label').textContent.indexOf(prefix) === 0) || null;
  const panelLabels = () => Array.from(document.querySelectorAll('#link-rules-list .link-rule-label')).map(label => label.textContent).filter(label => / → Ul/.test(label));
  async function panelDelete(h, prefix) {
    const dialogs = h.stubDialogs({ confirm: true });
    try {
      await h.clickButton('btn-link-rules');
      await h.sleep(80);
      panelRow(prefix).querySelector('.link-rule-btn-delete').click();
      await h.sleep(400);
    } finally {
      dialogs.restore();
      byId('link-rules-close').click();
      await h.sleep(100);
    }
  }

  const LINK_A = () => 'UlDossiers → UlContacts : Dossier = ' + AUTO();
  const ROW_A = 'UlDossiers|match|Dossier|id';

  cases.push({
    id: 'undo_links_a_link_made_at_the_insertion_is_a_step_of_its_own',
    description: 'La clé réglée à l\'insertion d\'une variable d\'une autre table : Ctrl + Z défait d\'abord le texte d\'après, le suivant retire le lien (UNE ligne retirée de la table des liens), le troisième le texte d\'avant ; Ctrl + Y rend le tout dans l\'ordre, le coin d\'état nomme le lien',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        typedAtEnd(' avant');
        const { closed } = await openKey(h, 'UlContacts');
        check(problems, 'la fenêtre de la clé s\'ouvre', windowOpen(), true);
        await confirm(h);
        check(problems, 'la fenêtre rend « vrai » et se ferme', [await closed, windowOpen()], [true, false]);
        typedAtEnd(' après');
        check(problems, 'le lien est écrit, une action en réserve', [summary('UlContacts'), reserve().count()], [[ROW_A], 1]);
        stub().clearActionLog();
        await undo(h);
        check(problems, 'Ctrl + Z : le texte d\'après est défait, le lien reste', [/ après/.test(text()), summary('UlContacts'), linkWrites()], [false, [ROW_A], []]);
        await undo(h);
        check(problems, 'Ctrl + Z suivant : le lien est retiré (table, cache, une seule écriture)', [summary('UlContacts'), GristAPI.findLinkRule('UlContacts', 'UlDossiers'), linkWrites()], [[], null, ['RemoveRecord']]);
        check(problems, 'Ctrl + Z suivant : le coin d\'état nomme le lien', status(), removed(LINK_A()));
        check(problems, 'Ctrl + Z suivant : le texte d\'avant est encore là', / avant/.test(text()), true);
        await undo(h);
        check(problems, 'troisième Ctrl + Z : le texte d\'avant est défait', / avant/.test(text()), false);
        await redo(h);
        check(problems, 'Ctrl + Y : le texte d\'avant, le lien toujours retiré', [/ avant/.test(text()), summary('UlContacts')], [true, []]);
        stub().clearActionLog();
        await redo(h);
        check(problems, 'Ctrl + Y suivant : le lien est reposé (table, cache, une seule écriture)', [summary('UlContacts'), (GristAPI.findLinkRule('UlContacts', 'UlDossiers') || {}).colonneCible, linkWrites()], [[ROW_A], 'Dossier', ['AddRecord']]);
        check(problems, 'Ctrl + Y suivant : le coin d\'état nomme le lien', status(), restored(LINK_A()));
        await redo(h);
        check(problems, 'dernier Ctrl + Y : le texte d\'après', / après/.test(text()), true);
        return verdict(problems, { rows: summary('UlContacts'), text: text() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_editing_a_link_goes_back_to_the_old_columns_by_the_bar_buttons',
    description: 'Le crayon de « Tables liées » : les deux colonnes changées, le bouton Annuler de la barre rend les anciennes - la MÊME ligne de la table, mise à jour - et le bouton Rétablir les nouvelles',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'UlDossiers' });
        const rowId = linkRows('UlContacts')[0].id;
        reserve().reset();
        stub().clearActionLog();
        const { closed } = await openEdit(h, 'UlContacts');
        choose('Role', 'Titre');
        await confirm(h);
        check(problems, 'la fenêtre rend « vrai »', await closed, true);
        check(problems, 'modifié : la table, une seule écriture, une action', [summary('UlContacts'), linkWrites(), reserve().count()], [['UlDossiers|match|Role|Titre'], ['UpdateRecord'], 1]);
        stub().clearActionLog();
        await h.clickButton('v2-btn-undo');
        await settle(h);
        check(problems, 'bouton Annuler : les anciennes colonnes, la même ligne', [summary('UlContacts'), linkRows('UlContacts').map(row => row.id), linkWrites()], [[ROW_A], [rowId], ['UpdateRecord']]);
        check(problems, 'bouton Annuler : le cache et le coin d\'état', [(GristAPI.findLinkRule('UlContacts', 'UlDossiers') || {}).colonneCible, status()], ['Dossier', restored(LINK_A())]);
        await h.clickButton('v2-btn-redo');
        await settle(h);
        check(problems, 'bouton Rétablir : les nouvelles colonnes', [summary('UlContacts'), (GristAPI.findLinkRule('UlContacts', 'UlDossiers') || {}).colonneCible], [['UlDossiers|match|Role|Titre'], 'Role']);
        check(problems, 'bouton Rétablir : le coin d\'état', status(), restored('UlDossiers → UlContacts : Role = Titre'));
        return verdict(problems, { rows: summary('UlContacts') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_a_fixed_row_link_and_a_match_link_replace_each_other',
    description: 'Le lien passé de « deux colonnes égales » à « toujours la même ligne » : Ctrl + Z rend les deux colonnes, Ctrl + Y rend la ligne fixe (sans colonnes), et le coin d\'état dit chacun des liens',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'UlDossiers' });
        reserve().reset();
        const { closed } = await openEdit(h, 'UlContacts');
        byId('link-config-toggle-singleton').click();
        await h.sleep(60);
        await confirm(h);
        await closed;
        check(problems, 'ligne fixe écrite', summary('UlContacts'), ['UlDossiers|singleton||']);
        await undo(h);
        check(problems, 'Ctrl + Z : les deux colonnes sont revenues', [summary('UlContacts'), status()], [[ROW_A], restored(LINK_A())]);
        await redo(h);
        check(problems, 'Ctrl + Y : la ligne fixe, sans colonnes', [summary('UlContacts'), status()], [['UlDossiers|singleton||'], restored('UlDossiers → UlContacts : ' + I18n.t('linkConfig.describeSingleton'))]);
        return verdict(problems, { rows: summary('UlContacts') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_deleting_a_link_in_the_panel_comes_back_with_ctrl_z_and_goes_again_with_ctrl_y',
    description: 'La corbeille de « Tables liées » (la confirmation répond oui) : Ctrl + Z, la fenêtre refermée, rend la ligne telle qu\'elle était - la liste du panneau la montre -, Ctrl + Y la retire de nouveau',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'UlDossiers' });
        reserve().reset();
        stub().clearActionLog();
        await panelDelete(h, 'UlDossiers → UlContacts');
        check(problems, 'supprimé : la table, le cache, une seule écriture, une action', [summary('UlContacts'), GristAPI.findLinkRule('UlContacts', 'UlDossiers'), linkWrites(), reserve().count()], [[], null, ['RemoveRecord'], 1]);
        stub().clearActionLog();
        await undo(h);
        check(problems, 'Ctrl + Z : la ligne est revenue (table, cache, une seule écriture)', [summary('UlContacts'), (GristAPI.findLinkRule('UlContacts', 'UlDossiers') || {}).colonneSource, linkWrites()], [[ROW_A], 'id', ['AddRecord']]);
        check(problems, 'Ctrl + Z : le coin d\'état nomme le lien', status(), restored(LINK_A()));
        await h.clickButton('btn-link-rules');
        await h.sleep(80);
        check(problems, 'le panneau montre le lien rendu', panelLabels().filter(label => /UlContacts/.test(label)), [LINK_A()]);
        byId('link-rules-close').click();
        await h.sleep(80);
        await redo(h);
        check(problems, 'Ctrl + Y : le lien est retiré de nouveau', [summary('UlContacts'), GristAPI.findLinkRule('UlContacts', 'UlDossiers'), status()], [[], null, removed(LINK_A())]);
        return verdict(problems, { rows: summary('UlContacts') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_the_link_of_one_table_and_the_link_for_all_tables_never_mix',
    description: 'Un lien commun à toutes les tables, puis un lien propre à la table de la page (crayon) : Ctrl + Z ne retire que le second, le commun reste ; supprimer le commun dans le panneau puis Ctrl + Z le rend SANS table de la page',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
        reserve().reset();
        stub().clearActionLog();
        const { closed } = await openEdit(h, 'UlContacts');
        choose('Role', 'Titre');
        await confirm(h);
        await closed;
        check(problems, 'le lien de la table s\'ajoute au commun', [summary('UlContacts'), linkWrites()], [['*|match|Dossier|id', 'UlDossiers|match|Role|Titre'], ['AddRecord']]);
        stub().clearActionLog();
        await undo(h);
        check(problems, 'Ctrl + Z : seul le lien de la table est retiré', [summary('UlContacts'), linkWrites(), (GristAPI.getLinkRule('UlContacts', 'UlDossiers') || {}).colonneCible], [['*|match|Dossier|id'], ['RemoveRecord'], 'Dossier']);
        check(problems, 'Ctrl + Z : le coin d\'état nomme le lien de la table', status(), removed('UlDossiers → UlContacts : Role = Titre'));
        await redo(h);
        check(problems, 'Ctrl + Y : le lien de la table revient, le commun reste', summary('UlContacts'), ['*|match|Dossier|id', 'UlDossiers|match|Role|Titre']);
        await undo(h);
        reserve().reset();
        await panelDelete(h, 'Toutes les tables → UlContacts');
        check(problems, 'le commun est supprimé dans le panneau, celui de la table reste', summary('UlContacts'), []);
        stub().clearActionLog();
        await undo(h);
        check(problems, 'Ctrl + Z : le commun est rendu, sans table de la page', [summary('UlContacts'), linkWrites(), status()], [['*|match|Dossier|id'], ['AddRecord'], restored('Toutes les tables → UlContacts : Dossier = ' + AUTO())]);
        return verdict(problems, { rows: summary('UlContacts') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_the_link_comes_back_from_another_template',
    description: 'Un autre modèle ouvert entre-temps (l\'historique du texte repart de zéro) : Ctrl + Z retire encore le lien, Ctrl + Y le rend, le modèle ouvert ne change pas',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        const { closed } = await openKey(h, 'UlContacts');
        await confirm(h);
        await closed;
        Editor.setHTML('<p>Un autre modèle</p>');
        await h.sleep(150);
        check(problems, 'le lien et son action sont toujours là', [summary('UlContacts'), reserve().count()], [[ROW_A], 1]);
        await undo(h);
        check(problems, 'Ctrl + Z : le lien est retiré', [summary('UlContacts'), status(), text()], [[], removed(LINK_A()), 'Un autre modèle']);
        await redo(h);
        check(problems, 'Ctrl + Y : le lien est rendu', [summary('UlContacts'), status(), text()], [[ROW_A], restored(LINK_A()), 'Un autre modèle']);
        return verdict(problems, { rows: summary('UlContacts') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_a_link_changed_since_is_not_overwritten_and_the_status_says_so',
    description: 'Le lien réglé de nouveau par quelqu\'un d\'autre (ou suivi dans un renommage) : Ctrl + Z n\'écrit rien, ne touche pas à son lien, et le coin d\'état dit que le lien a changé',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        const { closed } = await openKey(h, 'UlContacts');
        await confirm(h);
        await closed;
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Role', colonneSource: 'Titre', tableSource: 'UlDossiers' });
        stub().clearActionLog();
        await undo(h);
        check(problems, 'aucune écriture, le lien de l\'autre reste', [linkWrites(), summary('UlContacts')], [[], ['UlDossiers|match|Role|Titre']]);
        check(problems, 'le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.linkChanged'), 'error-msg']);
        return verdict(problems, { rows: summary('UlContacts'), status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_a_link_is_not_given_back_to_a_table_that_is_gone',
    description: 'La table liée supprimée de Grist entre-temps : Ctrl + Z sur la suppression du lien n\'écrit rien (pas de lien fantôme) et le coin d\'état dit qu\'une table du lien n\'existe plus',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        stub().setVariables('UlTemp', { Nom: 'Text' });
        await GristAPI.refreshSchema();
        await GristAPI.saveLinkRule('UlTemp', { mode: 'singleton', tableSource: 'UlDossiers' });
        reserve().reset();
        await panelDelete(h, 'UlDossiers → UlTemp');
        check(problems, 'supprimé dans le panneau', summary('UlTemp'), []);
        stub().dropTable('UlTemp');
        await GristAPI.refreshSchema();
        stub().clearActionLog();
        await undo(h);
        check(problems, 'aucune écriture, aucun lien fantôme', [linkWrites(), summary('UlTemp')], [[], []]);
        check(problems, 'le coin d\'état le dit, en erreur', [status(), statusClass()], [I18n.t('history.linkTableGone'), 'error-msg']);
        return verdict(problems, { status: status() });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_the_link_set_up_for_a_reference_column_is_a_step_too',
    description: 'Les « Autres attributs » d\'une bulle sur une colonne Référence de la page : le lien posé d\'office (identifiant de ligne = cette colonne) se retire par Ctrl + Z et revient par Ctrl + Y',
    async run(h) {
      const problems = [];
      try {
        await seed(h);
        Editor.setHTML('<p><span class="var-badge" data-table="UlDossiers" data-column="Responsable" data-key="UlDossiers.Responsable"></span></p>');
        await h.sleep(200);
        let pos = -1;
        ed().state.doc.descendants((node, at) => { if (node.type.name === 'varBadge') pos = at; });
        check(problems, 'la bulle est dans le modèle', pos > -1, true);
        reserve().reset();
        stub().clearActionLog();
        await VariableLinkedAttrs.open(ed(), pos);
        check(problems, 'le lien est posé d\'office, une action', [summary('UlAnnuaire'), linkWrites(), reserve().count()], [['UlDossiers|match|id|Responsable'], ['AddRecord'], 1]);
        VariableLinkedAttrs.close();
        await h.sleep(120);
        stub().clearActionLog();
        await undo(h);
        check(problems, 'Ctrl + Z : le lien est retiré', [summary('UlAnnuaire'), linkWrites(), status()], [[], ['RemoveRecord'], removed('UlDossiers → UlAnnuaire : ' + AUTO() + ' = Responsable')]);
        await redo(h);
        check(problems, 'Ctrl + Y : le lien revient', [summary('UlAnnuaire'), status()], [['UlDossiers|match|id|Responsable'], restored('UlDossiers → UlAnnuaire : ' + AUTO() + ' = Responsable')]);
        return verdict(problems, { rows: summary('UlAnnuaire') });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'undo_links_a_cancelled_unchanged_or_refused_gesture_leaves_no_step',
    description: 'La fenêtre annulée, un lien enregistré tel qu\'il était, ou une écriture refusée par Grist ne laissent aucun pas à défaire : Ctrl + Z ne touche à aucun lien',
    async run(h) {
      const problems = [];
      const realSave = GristAPI.saveLinkRule;
      try {
        await seed(h);
        const first = await openKey(h, 'UlContacts');
        byId('link-config-cancel').click();
        await h.sleep(80);
        check(problems, 'fenêtre annulée : « faux », rien d\'écrit, aucune action', [await first.closed, summary('UlContacts'), reserve().count()], [false, [], 0]);
        await GristAPI.saveLinkRule('UlContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id', tableSource: 'UlDossiers' });
        reserve().reset();
        const second = await openEdit(h, 'UlContacts');
        await confirm(h);
        await second.closed;
        check(problems, 'enregistré tel qu\'il était : le lien est le même, aucune action', [summary('UlContacts'), reserve().count()], [[ROW_A], 0]);
        await GristAPI.deleteLinkRule('UlContacts');
        GristAPI.saveLinkRule = () => Promise.reject(new Error('écriture refusée'));
        const third = await openKey(h, 'UlContacts');
        let failure = null;
        const failed = third.closed.then(() => null, error => error);
        await confirm(h);
        failure = await failed;
        check(problems, 'écriture refusée : l\'erreur remonte telle quelle, aucune action', [failure && failure.message, reserve().count()], ['écriture refusée', 0]);
        byId('link-config-cancel').click();
        await h.sleep(80);
        return verdict(problems, { count: reserve().count() });
      } finally { GristAPI.saveLinkRule = realSave; await leave(h); }
    },
  });

  return cases;
})();
