// Suite "writeRefused" - Grist refuse d'écrire ou de supprimer un modèle que la personne lit sans pouvoir le modifier (consigne 060 de GFS : « Partager » marche pour
// Publipostage_Modeles, Grist répond « Blocked by row update access rules » à qui ne fait que lire un fichier ; contrats 11.6, points 2, 3 et 6).
//
// Ce que la suite garde :
//   1. Le refus se DIT (le coin d'état, en rouge, avec la phrase du refus) pour l'enregistrement automatique, Enregistrer à la main et Supprimer. Avant, il se disait « Échec de
//      l'enregistrement (automatique) » comme une panne, et Supprimer ne disait rien (le refus restait une promesse rejetée, sans message).
//   2. Le refus n'est pas REDEMANDÉ : l'enregistrement automatique s'arrête pour le modèle refusé (avant : la même écriture refusée repartait à chaque passage, toutes les 2,5 s, avec
//      une relecture de la table) ; un Enregistrer réussi le remet en marche. Une vraie panne (réseau, Grist qui ne répond pas) est toujours redemandée au passage suivant.
//   3. L'app tolère les colonnes `GFS_…` que GFS pose dans la table (une colonne à formule `GFS_Auteur` que Grist remplit) : elle ne les lit ni ne les écrit, et n'écrit aucune
//      colonne Auteur, Visibilite, Personnes ni Espace dans Publipostage_Modeles.
// Les refus sont simulés en enveloppant grist.docApi.applyUserActions (la table des modèles refuse, avec le texte exact de Grist) ; chaque refus est compté. Les passages de
// l'enregistrement automatique sont de vrais minuteurs (js/main.js, AUTOSAVE_INTERVAL_MS = 2500) : la suite attend de vrais passages (~40 s).
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js). À garder synchronisé si cette constante change.
  const REFUSAL = 'Blocked by row update access rules';
  const waitTicks = (h, n) => h.sleep(TICK_MS * n + 900);
  const stub = () => window.__gristStub;
  const autoRow = () => document.getElementById('v2-btn-autosave');
  const statusEl = () => document.getElementById('status-msg');
  const statusNow = () => ({ text: statusEl().textContent || '', error: statusEl().classList.contains('error-msg') });
  // Les colonnes que l'app n'écrit jamais dans la table des modèles : celles de l'étiquette de partage (contrats 11.6, point 6) et les colonnes d'aide de GFS.
  const FORBIDDEN_COLUMN = /^(GFS_.*|Auteur|Visibilite|Personnes|Espace)$/;

  async function ensureAutosave(h, on) {
    if ((autoRow().getAttribute('aria-checked') === 'true') !== on) await h.clickButton('v2-btn-autosave');
  }

  // Un modèle RÉELLEMENT enregistré, par le vrai bouton Enregistrer (l'enregistrement automatique dépend de l'état interne que seul ce chemin pose).
  async function saveTemplate(h, nom, html) {
    await h.resetEditor();
    if (html) Editor.setHTML(html);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }

  // Grist refuse les écritures de la table des modèles (`only` : seulement ces actions, par exemple ['RemoveRecord']) avec `message` ; chaque appel refusé est compté dans `calls`.
  // `restore()` rend la vraie fonction.
  function refuseModelWrites(message, only) {
    const real = grist.docApi.applyUserActions;
    const refusing = { calls: 0, kinds: [], restore() { grist.docApi.applyUserActions = real; } };
    grist.docApi.applyUserActions = async function (actions) {
      if (Array.isArray(actions) && actions.some(a => a[1] === TABLE && (!only || only.indexOf(a[0]) !== -1))) {
        refusing.calls++;
        refusing.kinds.push(actions.map(a => a[0]).join('+'));
        throw new Error(message || REFUSAL);
      }
      return real.apply(this, arguments);
    };
    return refusing;
  }

  const contenuOf = id => { const row = stub().getRow(TABLE, id); return row ? String(row.Contenu || '') : null; };

  cases.push({
    id: 'write_refused_helper_tells_a_grist_access_refusal_from_a_failure',
    description: "GristAPI.isAccessRefusal reconnaît le refus d'une règle d'accès de Grist (« Blocked by … », « Only owners … ») et rien d'autre : une panne de réseau ou une erreur sans rapport n'en est pas un.",
    run: async () => {
      const yes = ['Blocked by row update access rules', 'Blocked by table update access rules', 'Blocked by access rules : ce compte ne peut pas écrire', 'Only owners can modify access rules'];
      const no = ['Failed to fetch', 'Network error', 'Création des tables du widget refusée par la personne.', 'Error : la colonne T.C est une colonne à formule', '', 'blockedby'];
      const said = yes.map(m => GristAPI.isAccessRefusal(new Error(m)));
      const notSaid = no.map(m => GristAPI.isAccessRefusal(new Error(m)));
      const odd = { nullIs: GristAPI.isAccessRefusal(null), undefinedIs: GristAPI.isAccessRefusal(undefined), stringIs: GristAPI.isAccessRefusal('Blocked by row update access rules'), plainObjectIs: GristAPI.isAccessRefusal({}) };
      const pass = said.every(Boolean) && notSaid.every(v => v === false) && odd.nullIs === false && odd.undefinedIs === false && odd.stringIs === true && odd.plainObjectIs === false;
      return { pass, notes: JSON.stringify({ said, notSaid, odd }) };
    },
  });

  cases.push({
    id: 'write_refused_autosave_says_the_refusal_once_and_does_not_ask_again_until_a_save_succeeds',
    description: "Grist refuse l'écriture du modèle ouvert : le premier passage de l'enregistrement automatique le dit dans le coin d'état (en rouge, avec la phrase du refus), les passages suivants ne redemandent pas la même écriture (aucun nouvel appel refusé en trois passages, ni après une frappe de plus), et un Enregistrer réussi rend l'enregistrement automatique (la frappe suivante repart toute seule).",
    run: async (h) => {
      await ensureAutosave(h, true);
      const id = await saveTemplate(h, 'Refus automatique', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'modèle non créé' };
      const wanted = I18n.t('status.saveRefused');
      const refusing = refuseModelWrites();
      try {
        await h.focusAtEnd();
        await h.typeText(' modif');
        await waitTicks(h, 1);
        const first = { calls: refusing.calls, status: statusNow() };
        const callsAtFirst = refusing.calls;
        await waitTicks(h, 3);
        const later = { calls: refusing.calls, status: statusNow() };
        await h.typeText(' encore');
        const typed = statusNow();
        await waitTicks(h, 2);
        const afterTyping = { calls: refusing.calls, status: statusNow() };
        const unsaved = contenuOf(id) !== null && !contenuOf(id).includes('encore');
        // Grist laisse de nouveau écrire : Enregistrer à la main réussit, et la frappe suivante est enregistrée toute seule.
        refusing.restore();
        await h.clickButton('btn-save');
        await h.sleep(600);
        const manual = { content: contenuOf(id), status: statusNow() };
        await h.typeText(' reprise');
        await waitTicks(h, 1);
        const resumed = contenuOf(id);
        const pass = first.calls >= 1 && first.status.text === wanted && first.status.error
          && later.calls === callsAtFirst && later.status.text === wanted
          && typed.text === wanted && typed.error
          && afterTyping.calls === callsAtFirst && afterTyping.status.text === wanted && unsaved
          && manual.content.includes('encore') && !manual.status.error && manual.status.text !== wanted
          && resumed.includes('reprise');
        return { pass, notes: JSON.stringify({ wanted, first, callsAtFirst, later, typed, afterTyping, unsaved, manual, resumed, kinds: refusing.kinds }) };
      } finally {
        refusing.restore();
        await ensureAutosave(h, true);
      }
    },
  });

  cases.push({
    id: 'write_refused_helper_names_the_rule_and_what_it_forbids_and_remembers_the_last_refusal',
    description: "GristAPI.refusalPhrase / refusalKind : la phrase de la règle (« Blocked by full structure access rules ») et ce qu'elle interdit - structure, lecture, écriture de lignes, propriétaires - sans jamais un nom de table ; une panne n'a ni phrase ni genre ; noteRefusal garde le dernier refus (GristAPI.lastRefusal) et ignore une panne.",
    run: async () => {
      const phrase = m => GristAPI.refusalPhrase(new Error(m));
      const kind = m => GristAPI.refusalKind(new Error(m));
      const table = {
        structure: [phrase('Blocked by full structure access rules'), 'Blocked by full structure access rules'],
        structureKind: [kind('Blocked by full structure access rules'), 'structure'],
        tableStructureKind: [kind('Blocked by table structure access rules'), 'structure'],
        readKind: [kind('Blocked by table read access rules'), 'read'],
        rowUpdateKind: [kind('Blocked by row update access rules'), 'write'],
        tableUpdateKind: [kind('Blocked by table update access rules'), 'write'],
        plainRules: [phrase('Blocked by access rules : ce compte ne peut pas modifier le document'), 'Blocked by access rules'],
        plainRulesKind: [kind('Blocked by access rules : ce compte ne peut pas modifier le document'), 'write'],
        owners: [phrase('Only owners can modify access rules'), 'Only owners can modify access rules'],
        ownersKind: [kind('Only owners can modify access rules'), 'owners'],
        noNameLeaks: [phrase('Blocked by row update access rules [table SecretClients, column Salaire]'), 'Blocked by row update access rules'],
        failurePhrase: [phrase('Failed to fetch'), ''],
        failureKind: [kind('Failed to fetch'), ''],
        nullKind: [GristAPI.refusalKind(null), ''],
      };
      const bad = Object.keys(table).filter(k => table[k][0] !== table[k][1]);
      GristAPI.noteRefusal(new Error('Blocked by full structure access rules'));
      const first = GristAPI.lastRefusal();
      const ignored = GristAPI.noteRefusal(new Error('Failed to fetch'));
      const after = GristAPI.lastRefusal();
      const pass = bad.length === 0 && !!first && first.kind === 'structure' && first.phrase === 'Blocked by full structure access rules' && typeof first.at === 'number'
        && ignored === false && after === first;
      return { pass, notes: JSON.stringify({ bad: bad.map(k => [k, table[k][0]]), first, ignored, same: after === first }) };
    },
  });

  cases.push({
    id: 'write_refused_structure_refusal_says_structure_not_read_only_and_is_kept_for_the_findings',
    description: "Enregistrer à la main, Grist répond « Blocked by full structure access rules » (le compte ne peut pas créer de table ni de colonne) : le coin d'état dit que la STRUCTURE est refusée (et non « lecture seule pour vous »), en rouge ; le refus est gardé (lastRefusal : genre « structure ») et le constat d'une icône grisée le montre dans « Dernier refus de Grist ».",
    run: async (h) => {
      await ensureAutosave(h, false);
      const id = await saveTemplate(h, 'Refus de structure', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'modèle non créé' };
      const refusing = refuseModelWrites('Blocked by full structure access rules', ['UpdateRecord']);
      try {
        await h.focusAtEnd();
        await h.typeText(' modif');
        await h.clickButton('btn-save');
        await h.sleep(500);
        const status = statusNow();
        const last = GristAPI.lastRefusal();
        const exportGroup = document.getElementById('v2-export-pdf-group');
        const found = LockDiagnostic.forLock(exportGroup, { cause: 'access', kind: 'lock.noExport', reason: '' });
        const rows = Object.fromEntries(found.context.map(([k, v]) => [k, LockDiagnostic.resolve(v, false)]));
        const pass = refusing.calls >= 1 && status.text === I18n.t('status.saveRefusedStructure') && status.error && status.text !== I18n.t('status.saveRefused')
          && !!last && last.kind === 'structure' && last.phrase === 'Blocked by full structure access rules'
          && /Blocked by full structure access rules/.test(rows['Dernier refus de Grist'] || '') && /structure|colonne|table/.test(rows['Dernier refus de Grist'] || '');
        return { pass, notes: JSON.stringify({ calls: refusing.calls, status, last, row: rows['Dernier refus de Grist'] }) };
      } finally {
        refusing.restore();
        await ensureAutosave(h, true);
        await h.clickButton('btn-save');
        await h.sleep(500);
      }
    },
  });

  cases.push({
    id: 'write_refused_manual_save_says_the_refusal_and_stops_the_automatic_one',
    description: "Enregistrer à la main, refusé par Grist (« Blocked by row update access rules »), dit la phrase du refus dans le coin d'état (en rouge) et non « Échec de l'enregistrement » ; l'enregistrement automatique ne redemande pas ensuite la même écriture (aucun nouvel appel refusé en deux passages).",
    run: async (h) => {
      await ensureAutosave(h, true);
      const id = await saveTemplate(h, 'Refus à la main', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'modèle non créé' };
      const wanted = I18n.t('status.saveRefused');
      const refusing = refuseModelWrites();
      try {
        await h.focusAtEnd();
        await h.typeText(' modif');
        await h.clickButton('btn-save');
        await h.sleep(500);
        const manual = { calls: refusing.calls, status: statusNow() };
        await waitTicks(h, 2);
        const later = { calls: refusing.calls, status: statusNow() };
        const pass = manual.calls >= 1 && manual.status.text === wanted && manual.status.error
          && later.calls === manual.calls && later.status.text === wanted;
        return { pass, notes: JSON.stringify({ wanted, manual, later, kinds: refusing.kinds }) };
      } finally {
        refusing.restore();
        await ensureAutosave(h, true);
        await h.clickButton('btn-save');
        await h.sleep(500);
      }
    },
  });

  cases.push({
    id: 'write_refused_a_real_failure_is_still_asked_again_at_the_next_pass',
    description: "Une vraie panne (« Failed to fetch ») n'est pas un refus : l'enregistrement automatique la dit « Échec de l'enregistrement automatique » et redemande l'écriture à chaque passage ; dès que Grist répond, la frappe est enregistrée.",
    run: async (h) => {
      await ensureAutosave(h, true);
      const id = await saveTemplate(h, 'Panne passagère', '<p>Départ</p>');
      if (!id) return { pass: false, notes: 'modèle non créé' };
      const failing = refuseModelWrites('Failed to fetch', ['UpdateRecord']);
      try {
        await h.focusAtEnd();
        await h.typeText(' modif');
        await waitTicks(h, 1);
        const first = { calls: failing.calls, status: statusNow() };
        await waitTicks(h, 2);
        const second = { calls: failing.calls, status: statusNow() };
        failing.restore();
        await waitTicks(h, 1);
        const mended = { content: contenuOf(id), status: statusNow() };
        const pass = first.calls >= 1 && first.status.text === I18n.t('status.autosaveError') && first.status.error
          && second.calls > first.calls && second.status.text === I18n.t('status.autosaveError')
          && mended.content.includes('modif') && !mended.status.error;
        return { pass, notes: JSON.stringify({ first, second, mended, kinds: failing.kinds }) };
      } finally {
        failing.restore();
        await ensureAutosave(h, true);
      }
    },
  });

  cases.push({
    id: 'write_refused_delete_says_the_refusal_and_keeps_the_model_then_deletes_once_allowed',
    description: "Supprimer un modèle que Grist refuse de supprimer dit la phrase du refus dans le coin d'état (en rouge) : le modèle reste dans la liste, à l'écran et dans la table, aucune promesse rejetée sans message ; une panne de Grist dit « Échec de la suppression du modèle » ; une fois Grist d'accord, la suppression marche.",
    run: async (h) => {
      await ensureAutosave(h, false);
      const rejections = [];
      const onRejection = event => { rejections.push(String(event.reason && event.reason.message || event.reason)); event.preventDefault(); };
      window.addEventListener('unhandledrejection', onRejection);
      const stubbed = h.stubDialogs({ confirm: true });
      let refusing = null;
      try {
        const id = await saveTemplate(h, 'Suppression refusée', '<p>À garder</p>');
        if (!id) return { pass: false, notes: 'modèle non créé' };
        const optionThere = () => !!document.querySelector('#template-select option[value="' + id + '"]');
        refusing = refuseModelWrites(REFUSAL, ['RemoveRecord']);
        await h.clickButton('btn-delete');
        await h.sleep(600);
        const refused = {
          calls: refusing.calls, status: statusNow(), current: Templates.getCurrentId(), option: optionThere(), row: contenuOf(id) !== null,
          text: (Editor.getHTML() || '').includes('À garder'), rejections: rejections.slice(),
        };
        refusing.restore();
        const down = refuseModelWrites('Failed to fetch', ['RemoveRecord']);
        await h.clickButton('btn-delete');
        await h.sleep(600);
        const failed = { calls: down.calls, status: statusNow(), option: optionThere(), row: contenuOf(id) !== null };
        down.restore();
        await h.clickButton('btn-delete');
        await h.sleep(800);
        const deleted = { status: statusNow(), option: optionThere(), row: contenuOf(id) !== null, current: Templates.getCurrentId() };
        const pass = refused.calls === 1 && refused.status.text === I18n.t('status.deleteRefused') && refused.status.error
          && String(refused.current) === String(id) && refused.option && refused.row && refused.text && refused.rejections.length === 0
          && failed.calls === 1 && failed.status.text === I18n.t('status.deleteError') && failed.status.error && failed.option && failed.row
          && deleted.status.text === I18n.t('status.templateDeleted') && !deleted.status.error && !deleted.option && !deleted.row && deleted.current == null
          && rejections.length === 0;
        return { pass, notes: JSON.stringify({ refused, failed, deleted, rejections }) };
      } finally {
        window.removeEventListener('unhandledrejection', onRejection);
        if (refusing) refusing.restore();
        stubbed.restore();
        await ensureAutosave(h, true);
      }
    },
  });

  cases.push({
    id: 'write_refused_gfs_columns_are_tolerated_and_no_label_column_is_written_in_the_models_table',
    description: "GFS pose dans Publipostage_Modeles une colonne à formule GFS_Auteur (remplie par Grist) et une colonne d'aide de plus : la liste se lit, Enregistrer, la copie, la suppression et le rétablissement d'un modèle marchent sans erreur (Grist refuserait toute valeur dans la colonne à formule), et aucune écriture de l'app ne porte une colonne GFS_…, Auteur, Visibilite, Personnes ni Espace.",
    run: async (h) => {
      await ensureAutosave(h, false);
      const stubbed = h.stubDialogs({ confirm: true });
      try {
        await grist.docApi.applyUserActions([['AddColumn', TABLE, 'GFS_Auteur', { type: 'Text', isFormula: true, formula: 'user.Email' }], ['AddColumn', TABLE, 'GFS_Partage', { type: 'Text', isFormula: false }]]);
        stub().setFormulaColumn(TABLE, 'GFS_Auteur', 'user.Email');
        const logStart = stub().getActionLog().length;
        const listed = (await Templates.loadAll()).length;
        const id = await saveTemplate(h, 'Avec colonnes GFS', '<p>Premier état</p>');
        const created = { id, status: statusNow() };
        await h.focusAtEnd();
        await h.typeText(' second');
        await h.clickButton('btn-save');
        await h.sleep(600);
        const updated = { content: contenuOf(id), status: statusNow() };
        const snapshot = await Templates.snapshotRow(id);
        await h.clickButton('btn-delete');
        await h.sleep(800);
        const gone = contenuOf(id) === null;
        let restored = null;
        try { restored = await Templates.restoreRow(snapshot); } catch (e) { restored = { error: String(e && e.message || e) }; }
        const written = stub().getActionLog().slice(logStart).filter(a => a[1] === TABLE);
        const keys = [];
        written.forEach(a => {
          const fields = a[0] === 'AddRecord' ? a[3] : (a[0] === 'UpdateRecord' ? a[3] : null);
          if (fields && typeof fields === 'object') Object.keys(fields).forEach(k => { if (keys.indexOf(k) === -1) keys.push(k); });
        });
        const forbidden = keys.filter(k => FORBIDDEN_COLUMN.test(k));
        const snapshotKeys = snapshot ? Object.keys(snapshot.values).filter(k => FORBIDDEN_COLUMN.test(k)) : ['(pas de cliché)'];
        const pass = listed >= 0 && !!id && !created.status.error && updated.content.includes('second') && !updated.status.error && gone
          && !!restored && !restored.error && restored.id != null && contenuOf(restored.id) !== null
          && written.length >= 3 && forbidden.length === 0 && snapshotKeys.length === 0;
        return { pass, notes: JSON.stringify({ listed, created, updated, gone, restored, keys, forbidden, snapshotKeys, writes: written.map(a => a[0]) }) };
      } finally {
        stubbed.restore();
        await ensureAutosave(h, true);
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.writeRefused = cases;
})();
