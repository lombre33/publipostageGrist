// Suite "gfsAttach" - le PDF joint à la ligne CHEZ GFS (consigne 053 de GFS, contrats 5.4 point 12 : « joindre »). Hébergée, `RowAttachment.attachAll` ne demande plus de jeton d'écriture et n'envoie plus rien à Grist :
// elle donne à GFS les octets de chaque PDF et la ligne d'où il vient (`GfsLink.attach`, l'appel `joindre`, au plus 200 fichiers par appel), GFS les joint lui-même, et le rapport qu'il rend est traduit dans le rapport
// de toujours. Joué « hébergé » (HOSTED_GROUPS de dev-tests/run-headless.mjs : la page s'ouvre avec `?gfs=0`, dev-tests/gfs-stub.js joue GFS, dont `joindre`) avec js/row-attachment.js tel qu'il
// est en production (`GFS_ATTACH_WIRED = true` depuis le 07/11 : GFS a déclaré `actions.joindre` et les deux clés) ; remettre la constante à `false` regrise tout, et ce grisé est gardé par le groupe rowAttachment (le coureur le joue constante à `false`). ATTENTION - ce que la suite ne prouve pas : le faux GFS de dev-tests/gfs-stub.js rejoue ce que le contrat et le code de GFS (attach.js) disent,
// pas ce que GFS fait dans un vrai Grist (GFS l'a mesuré de son côté : faits vérifiés 48). Ce que la suite garde :
//  1) le grisé levé : la case et la section de Réglages ne sont plus grisées par GFS ;
//  2) l'appel : UN appel `joindre` qui porte `table`, `colonne`, `mode` (`remplacer` / `ajouter`) et les fichiers (`ligne`, `fichier` : un File PDF aux octets du PDF, `nom`) - rien d'autre -, aucun jeton
//     d'écriture, aucun envoi ni aucune écriture de l'app dans Grist, la progression, `replaced` compté pour un remplacement ;
//  3) la découpe : 200 fichiers au plus par appel, les appels un après l'autre, la progression avant chaque appel, les `index` du rapport ceux de l'appelant ;
//  4) le rapport de GFS dans celui de l'app : chacun des six mots du contrat et un mot inconnu (`echec`), une ligne supprimée, un lot arrêté en cours de route, la colonne absente qui arrête les appels suivants, un
//     rapport mal formé ou qui oublie un fichier ;
//  5) ce que GFS refuserait en bloc est écarté ici fichier par fichier (pas un PDF, vide, ligne qui n'est pas un entier d'au moins 1, nom trop long, octets illisibles) : les autres partent ;
//  6) les refus de l'appel lui-même (`GFS_INCONNU` : un GFS d'avant ce geste, `GFS_REFUSE`, `GFS_LECTURE_SEULE`, `GFS_INACTIF`, un code inconnu) : une phrase claire en français et en anglais, les fichiers pas joints sont des
//     échecs, les appels suivants ne partent pas ;
//  7) un GFS qui ne répond pas : rien ne part (l'appel attendrait pour toujours) ; seule (`GfsLink.hosted` faux) : le chemin de toujours, le jeton de Grist ;
//  8) `GfsLink.attach` : la demande vérifiée avant l'envoi (GFS_REFUSE sans rien envoyer), ses champs gardés et rien d'autre, le rapport lu sans fouiller ce qu'il ne dit pas (seule : voir le groupe rowAttachment, non hébergé) ;
//  9) les VRAIS exports : le PDF d'une ligne et l'archive ZIP (un PDF par ligne) jointes par GFS, sans jeton d'écriture.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const gfs = () => window.__gfsStub;
  const TABLE = 'GaClients';
  const COLUMN_OPTION = 'pp_attach_column';
  const MODE_OPTION = 'pp_attach_mode';
  const KEY = 'pp_export_attach';
  const FLYOUT = '#v2-export-pdf-flyout';
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const statusText = () => el('status-msg').textContent;
  // Un « PDF » pour les essais qui ne passent pas par le moteur : le début d'un vrai fichier, c'est tout ce que GFS contrôle.
  const pdfBlob = (label, extra) => new Blob(['%PDF-1.4\n% ' + label + '\n' + (extra || '') + '\n%%EOF'], { type: 'application/pdf' });
  const item = (index, rowId, name, extra) => ({ index, rowId, name, blob: pdfBlob(name, extra) });
  const writes = () => stub().getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === TABLE);
  const writeTokens = () => stub().state.tokenCalls.filter(call => call.readOnly === false).length;
  const calls = () => gfs().joindreAppels;
  const asText = async blob => new TextDecoder().decode(await blob.arrayBuffer());

  const COLUMNS = { Nom: 'Text', Pdf: 'Attachments', Autre: 'Attachments', Texte: 'Text' };
  const ROWS = [1, 2, 3, 4].map(id => ({ id, Nom: 'Client ' + id }));
  const servers = [];
  const useServer = options => { const server = stub().installUploadServer(options); servers.push(server); return server; };

  async function seed(h, options) {
    await h.resetEditor();
    I18n.setLang('fr');
    const s = stub();
    s.setAttachments([]);
    s.setVariables(TABLE, COLUMNS);
    s.setRows(TABLE, ROWS);
    s.state.tokenCalls.length = 0;
    s.state.tokenFailure = '';
    s.clearActionLog();
    PersonStore.remove(KEY);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Nom: 'Client 1' }, TABLE);
    await sleep(50);
    s.setWidgetOptions(options || null);
    await sleep(60);
    const g = gfs();
    g.joindre = {};
    g.joindreAppels = [];
    g.joindreEnCours = 0;
    g.joindreMax = 0;
    g.pieces = [];
    g.calls.length = 0;
  }
  async function cleanup() {
    servers.splice(0).forEach(server => server.uninstall());
    stub().setWidgetOptions(null);
    stub().state.tokenFailure = '';
    PersonStore.remove(KEY);
    I18n.setLang('fr');
    gfs().joindre = null;
    gfs().pieces = [];
    await sleep(80);
    stub().dropTable(TABLE);
    stub().setAttachments([]);
    await GristAPI.refreshSchema();
    RowAttachment.render();
  }
  function scenario(id, description, body, options) {
    cases.push({
      id, description,
      run: async (h) => {
        await seed(h, options);
        try { return await body(h); } finally { await cleanup(); }
      },
    });
  }
  const WITH_COLUMN = { [COLUMN_OPTION]: 'Pdf' };
  // Les faux « GfsLink » qu'un cas remplace le temps de sa mesure.
  async function withAnswering(value, body) {
    const real = GfsLink.isAnswering;
    GfsLink.isAnswering = () => value;
    try { return await body(); } finally { GfsLink.isAnswering = real; }
  }
  async function withHosted(value, body) {
    const real = GfsLink.hosted;
    GfsLink.hosted = value;
    try { return await body(); } finally { GfsLink.hosted = real; }
  }
  const make = attach => ({ shelved: false, total: 3, counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 0 }, copies: [], failed: [], skipped: 0, attach });

  // --- 1) le grisé levé ---
  scenario('gfsattach_the_grey_is_lifted_inside_gfs_so_the_box_and_the_panel_work',
    'Chez GFS, grisé levé : la case « Joindre à la ligne » n’est plus grisée (et se coche), la section de Réglages non plus, et le plan d’export porte `attach` ; la mention « pas encore disponible » est cachée.',
    async () => {
      const problems = [];
      check(problems, 'hébergée', [GfsLink.hosted, GfsLink.isAnswering()], [true, true]);
      RowAttachment.setOn(true);
      RowAttachment.render();
      const flyout = document.querySelector(FLYOUT);
      RowAttachment.sync(flyout, 'one');
      const row = flyout.querySelector('#v2-export-attach');
      check(problems, 'la case', [row.classList.contains('v2-hover-row-disabled'), row.getAttribute('aria-checked'), row.hasAttribute('aria-disabled')], [false, 'true', false]);
      check(problems, 'la section', [el('settings-rowattachment-column').disabled, el('settings-rowattachment-mode').disabled, el('settings-rowattachment-locked-gfs').hidden, el('settings-rowattachment-locked').hidden], [false, false, true, true]);
      check(problems, 'le plan', [RowAttachment.active(), PdfDelivery.plan()], [true, { download: true, shelve: false, attach: true }]);
      RowAttachment.setOn(false);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 2) l'appel ---
  scenario('gfsattach_one_call_gives_gfs_the_bytes_and_the_app_asks_for_no_write_token',
    'Hébergée, `attachAll` fait UN appel `joindre` : `table`, `colonne`, `mode` (`remplacer` par défaut) et, par fichier, `ligne`, `fichier` (un File PDF aux octets du PDF, une fonction `blob` appelée avant) et `nom` - rien d’autre ; aucun jeton d’écriture, aucun envoi à Grist, aucune écriture de l’app ; le rapport compte les trois fichiers.',
    async () => {
      const problems = [];
      const server = useServer();
      const progress = [];
      const items = [item(0, 1, 'a.pdf', 'un'), { index: 1, rowId: 2, name: 'b.pdf', blob: async () => pdfBlob('b.pdf', 'deux') }, item(2, 3, 'c.pdf', 'trois')];
      const report = await RowAttachment.attachAll(TABLE, items, (rank, total) => progress.push([rank, total]));
      check(problems, 'un seul appel', calls().length, 1);
      const call = calls()[0] || { cles: [], entrees: [] };
      check(problems, 'ce que l’appel porte', [call.cles.slice().sort(), call.table, call.colonne, call.mode], [['colonne', 'fichiers', 'mode', 'table'], TABLE, 'Pdf', 'remplacer']);
      check(problems, 'les trois fichiers', call.entrees.map(e => [e.ligne, e.nom, e.instance, e.type, e.taille > 0, e.cles]), [[1, 'a.pdf', 'File', 'application/pdf', true, ['ligne', 'fichier', 'nom']], [2, 'b.pdf', 'File', 'application/pdf', true, ['ligne', 'fichier', 'nom']], [3, 'c.pdf', 'File', 'application/pdf', true, ['ligne', 'fichier', 'nom']]]);
      check(problems, 'les octets sont ceux du PDF', gfs().pieces.map(p => String.fromCharCode.apply(null, Array.from(p.octets.slice(0, 5))) + p.taille), ['%PDF-' + (await pdfBlob('a.pdf', 'un')).size, '%PDF-' + (await pdfBlob('b.pdf', 'deux')).size, '%PDF-' + (await pdfBlob('c.pdf', 'trois')).size]);
      check(problems, 'aucun jeton d’écriture, aucun envoi à Grist, aucune écriture de l’app', [writeTokens(), stub().state.tokenCalls.length, server.requests.length, writes().length], [0, 0, 0, 0]);
      check(problems, 'la progression : avant l’appel', progress, [[1, 3]]);
      check(problems, 'le rapport', report, { column: 'Pdf', problem: null, attached: [{ index: 0, replaced: 0 }, { index: 1, replaced: 0 }, { index: 2, replaced: 0 }], failed: [] });
      return verdict(problems, {});
    }, WITH_COLUMN);

  scenario('gfsattach_the_mode_goes_as_ajouter_or_remplacer_and_a_replacement_counts_one',
    'Le mode de l’app (`replace` / `add`) part en `remplacer` / `ajouter` ; GFS dit `remplace: true` pour un fichier qui a pris la place d’un autre de même nom : le rapport compte 1 remplacement (`replaced`), 0 en mode « Ajouter » où les deux restent.',
    async () => {
      const problems = [];
      const first = await RowAttachment.attachAll(TABLE, [item(0, 1, 'Facture.pdf', 'v1')], null);
      const second = await RowAttachment.attachAll(TABLE, [item(0, 1, 'Facture.pdf', 'v2')], null);
      check(problems, 'remplacer : le second remplace le premier', [calls().map(c => c.mode), first.attached, second.attached, gfs().pieces.length], [['remplacer', 'remplacer'], [{ index: 0, replaced: 0 }], [{ index: 0, replaced: 1 }], 1]);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf', [MODE_OPTION]: 'add' }); await sleep(60);
      const third = await RowAttachment.attachAll(TABLE, [item(0, 1, 'Facture.pdf', 'v3')], null);
      check(problems, 'ajouter : les deux restent', [calls()[2].mode, third.attached, gfs().pieces.length], ['ajouter', [{ index: 0, replaced: 0 }], 2]);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 3) la découpe ---
  scenario('gfsattach_more_than_200_files_go_in_calls_of_200_one_after_the_other_with_their_own_indexes',
    '450 fichiers : trois appels (200, 200, 50), l’un après l’autre (jamais deux à la fois), la progression avant chaque appel (1, 201, 401 sur 450), et les `index` du rapport sont ceux de l’appelant (ici décalés de 10), pas ceux de chaque appel.',
    async () => {
      const problems = [];
      const items = Array.from({ length: 450 }, (_, i) => item(10 + i, (i % 4) + 1, 'n' + i + '.pdf'));
      const progress = [];
      const report = await RowAttachment.attachAll(TABLE, items, (rank, total) => progress.push([rank, total]));
      check(problems, 'trois appels de 200, 200 et 50', [calls().length, calls().map(c => c.entrees.length), gfs().joindreMax], [3, [200, 200, 50], 1]);
      check(problems, 'dans l’ordre', [calls()[0].entrees[0].nom, calls()[1].entrees[0].nom, calls()[2].entrees[49].nom], ['n0.pdf', 'n200.pdf', 'n449.pdf']);
      check(problems, 'la progression', progress, [[1, 450], [201, 450], [401, 450]]);
      check(problems, 'le rapport : 450 joints aux index de l’appelant', [report.attached.length, report.attached[0], report.attached[449], report.failed, report.problem], [450, { index: 10, replaced: 0 }, { index: 459, replaced: 0 }, [], null]);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 4) le rapport de GFS dans celui de l'app ---
  scenario('gfsattach_each_word_of_gfs_becomes_the_word_of_the_report',
    'Les six mots du contrat (`absente`, `inutilisable`, `refus`, `trop-gros`, `injoignable`, `echec`) deviennent `missing`, `unusable`, `denied`, `tooLarge`, `unreachable`, `failed` - `problem` quand rien n’est joint, et la raison de chaque fichier - ; un mot inconnu (un GFS plus récent) est `failed`, jamais un autre mot.',
    async () => {
      const problems = [];
      const words = { absente: 'missing', inutilisable: 'unusable', refus: 'denied', 'trop-gros': 'tooLarge', injoignable: 'unreachable', echec: 'failed', 'mot-du-futur': 'failed' };
      const got = {};
      for (const [word, expected] of Object.entries(words)) {
        // `trop-gros` n'arrête pas le lot chez GFS (consigne 054) : il échoue fichier par fichier, comme dans le vrai GFS.
        gfs().joindre = word === 'absente' || word === 'inutilisable' ? { etatColonne: word } : word === 'trop-gros' ? { tropGros: () => [0, 1] } : { arret: () => ({ mot: word }) };
        const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')], null);
        got[word] = [report.problem, report.failed.map(f => f.reason), report.attached.length, report.gfs === undefined];
        check(problems, word, got[word], [expected, [expected, expected], 0, true]);
      }
      return verdict(problems, { got });
    }, WITH_COLUMN);

  // Bug d'Antoine (09/11, dans GFS) : une colonne NEUVE typée Pièces jointes (« colonne vide » de Grist : isFormula vrai, formule vide) est acceptée par l'app et par Grist, refusée par GFS (`inutilisable`, prototype/js/attach.js) ;
  // l'app disait « sans formule », ce qui n'est pas ce qui se passe. Le correctif de fond est chez GFS (consigne via le fil Liaison) ; ici l'app dit la vraie chose.
  scenario('gfsattach_an_empty_grist_column_that_gfs_refuses_is_told_as_an_empty_column_not_as_a_formula',
    'Une colonne « vide » de Grist (isFormula vrai, formule vide) de type Pièces jointes, choisie dans Réglages : l’app la propose et l’accepte, le faux GFS (qui juge comme le vrai) la refuse `inutilisable` ; le rapport porte `emptyColumn` et la phrase dit « colonne vide de Grist », en français et en anglais, avec quoi faire ; une colonne ordinaire que GFS refuse garde la phrase d’origine ; une colonne de données de type Pièces jointes passe.',
    async () => {
      const problems = [];
      stub().setFormulaColumn(TABLE, 'Autre', '');
      await GristAPI.refreshSchema();
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Autre' });
      await sleep(80);
      check(problems, 'l’app propose et accepte la colonne vide', [RowAttachment.getColumn(), RowAttachment.offReason()], ['Autre', '']);
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')], null);
      check(problems, 'GFS la refuse, le rapport le dit', [report.problem, report.emptyColumn, report.attached.length, report.failed.map(f => f.reason), calls().length], ['unusable', true, 0, ['unusable', 'unusable'], 1]);
      I18n.setLang('fr');
      check(problems, 'la phrase en français', PdfDelivery.describe(make(report)).note,
        'PDF non joint : « Autre » est une colonne vide de Grist (rien n’y a encore été mis) et GFS ne la prend pas encore. Déposez une pièce jointe à la main dans l’une de ses cellules, ou choisissez une autre colonne.');
      I18n.setLang('en');
      check(problems, 'la phrase en anglais', PdfDelivery.describe(make(report)).note,
        'PDF not attached: “Autre” is an empty Grist column (nothing has been put in it yet) and GFS does not accept it yet. Drop an attachment into one of its cells by hand, or pick another column.');
      I18n.setLang('fr');
      // La première pièce jointe posée à la main en fait une colonne de données : elle passe.
      stub().setFormulaColumn(TABLE, 'Autre', null);
      const filled = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null);
      check(problems, 'colonne de données : jointe', [filled.problem, filled.emptyColumn, filled.attached.length], [null, undefined, 1]);
      // Une colonne ordinaire que GFS refuse (forcée) : la phrase d’origine, pas celle de la colonne vide.
      gfs().joindre = { etatColonne: 'inutilisable' };
      const plain = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null);
      check(problems, 'colonne ordinaire refusée : phrase d’origine', [plain.problem, plain.emptyColumn, PdfDelivery.describe(make(plain)).note], ['unusable', undefined, 'PDF non joint : « Autre » doit être de type Pièces jointes, sans formule.']);
      return verdict(problems, {});
    });

  scenario('gfsattach_a_deleted_row_a_stopped_batch_and_a_missing_column_are_told_as_they_happen',
    'Une ligne supprimée pendant l’export (`ligne`) est `row` et ne gêne pas les autres ; un envoi que Grist refuse (`refus`) au milieu laisse joints ceux d’avant (aucun `problem`, les suivants échouent du même mot) ; un fichier trop gros (`trop-gros`) échoue SEUL, les autres sont joints, y compris un par appel sur trois appels ; une colonne `absente` au premier appel arrête les appels suivants (un seul appel pour 250 fichiers).',
    async () => {
      const problems = [];
      gfs().joindre = { lignes: [1, 3] };
      const gone = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')], null);
      check(problems, 'ligne supprimée', [gone.problem, gone.attached.map(a => a.index), gone.failed], [null, [0, 2], [{ index: 1, reason: 'row' }]]);
      gfs().joindre = { arret: () => ({ mot: 'refus', aPartirDe: 1 }) };
      const stopped = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')], null);
      check(problems, 'lot arrêté au milieu', [stopped.problem, stopped.attached.map(a => a.index), stopped.failed], [null, [0], [{ index: 1, reason: 'denied' }, { index: 2, reason: 'denied' }]]);
      // Un fichier trop gros n'arrête rien : il échoue seul (consigne 054), les autres sont joints ; tous trop gros : tous échouent, `problem` dit la taille.
      gfs().joindre = { tropGros: () => [1] };
      const big = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')], null);
      check(problems, 'un fichier trop gros échoue seul', [big.problem, big.attached.map(a => a.index), big.failed, gfs().pieces.length], [null, [0, 2], [{ index: 1, reason: 'tooLarge' }], 2]);
      gfs().joindre = { tropGros: () => [0, 1] };
      const allBig = await RowAttachment.attachAll(TABLE, [item(0, 1, 'd.pdf'), item(1, 2, 'e.pdf')], null);
      check(problems, 'tous trop gros', [allBig.problem, allBig.attached.length, allBig.failed.map(f => f.reason)], ['tooLarge', 0, ['tooLarge', 'tooLarge']]);
      // Un lot de plusieurs appels : le deuxième se heurte à un refus de Grist, le troisième part quand même (comme l'app seule : un fichier qui échoue ne fait pas perdre les autres).
      gfs().joindreAppels = [];
      gfs().joindre = { arret: rank => (rank === 2 ? { mot: 'refus' } : null) };
      const many = Array.from({ length: 450 }, (_, i) => item(i, (i % 4) + 1, 'n' + i + '.pdf'));
      const mid = await RowAttachment.attachAll(TABLE, many, null);
      check(problems, 'le deuxième appel refusé, le troisième part', [calls().length, mid.attached.length, mid.failed.length, mid.failed[0], mid.failed[199], mid.problem], [3, 250, 200, { index: 200, reason: 'denied' }, { index: 399, reason: 'denied' }, null]);
      // Un fichier trop gros par appel (le premier de chacun) : trois échecs seuls, 447 joints.
      gfs().joindreAppels = [];
      gfs().joindre = { tropGros: () => [0] };
      const spread = await RowAttachment.attachAll(TABLE, many, null);
      check(problems, 'un trop gros par appel', [calls().length, spread.attached.length, spread.failed.map(f => [f.index, f.reason]), spread.problem], [3, 447, [[0, 'tooLarge'], [200, 'tooLarge'], [400, 'tooLarge']], null]);
      // La colonne absente vaut pour tous les appels.
      gfs().joindreAppels = [];
      gfs().joindre = { etatColonne: 'absente' };
      const missing = await RowAttachment.attachAll(TABLE, Array.from({ length: 250 }, (_, i) => item(i, 1, 'm' + i + '.pdf')), null);
      check(problems, 'colonne absente : un seul appel, tout est un échec', [calls().length, missing.problem, missing.attached.length, missing.failed.length, new Set(missing.failed.map(f => f.reason)).size], [1, 'missing', 0, 250, 1]);
      return verdict(problems, {});
    }, WITH_COLUMN);

  scenario('gfsattach_a_malformed_report_or_a_file_it_forgets_is_a_failure_never_a_success',
    'Un rapport que GFS rend mal formé, ou qui ne cite pas un fichier, ou cite un `index` hors de l’appel : le fichier oublié est un échec (`failed`, ou le mot du lot), jamais une jointure ; un index hors de l’appel est ignoré ; un fichier cité deux fois ne compte qu’une fois.',
    async () => {
      const problems = [];
      gfs().joindre = { reponse: { colonne: 'Pdf', probleme: null, joints: [{ index: 0, remplace: false }], echecs: [] } };
      const forgotten = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')], null);
      check(problems, 'un fichier oublié', [forgotten.attached, forgotten.failed, forgotten.problem], [[{ index: 0, replaced: 0 }], [{ index: 1, reason: 'failed' }], null]);
      gfs().joindre = { reponse: { colonne: 'Pdf', probleme: 'refus', joints: [], echecs: [{ index: 7, raison: 'refus' }] } };
      const outside = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null);
      check(problems, 'un index hors de l’appel : ignoré, le fichier est un échec du mot du lot', [outside.attached, outside.failed, outside.problem], [[], [{ index: 0, reason: 'denied' }], 'denied']);
      gfs().joindre = { reponse: { colonne: 'Pdf', probleme: null, joints: [{ index: 0, remplace: true }, { index: 0, remplace: false }], echecs: [{ index: 0, raison: 'refus' }] } };
      const twice = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null);
      check(problems, 'cité deux fois : une fois', [twice.attached, twice.failed], [[{ index: 0, replaced: 1 }], []]);
      gfs().joindre = { reponse: 'pas un objet' };
      const junk = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null);
      check(problems, 'une réponse qui n’est pas un objet : rien de joint', [junk.attached, junk.failed, junk.problem], [[], [{ index: 0, reason: 'failed' }], 'failed']);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 5) ce que GFS refuserait en bloc ---
  scenario('gfsattach_a_file_gfs_would_refuse_for_all_is_dropped_here_and_the_others_still_go',
    'GFS refuse TOUT l’appel pour un seul défaut de forme : un PDF qui n’en est pas un, un fichier vide, une ligne qui n’est pas un entier d’au moins 1, un nom trop long, des octets illisibles. Chacun est écarté ici, seul (`failed`, ou `row` pour la ligne), et les autres partent dans un appel ; si aucun ne passe, rien ne part.',
    async () => {
      const problems = [];
      const items = [
        item(0, 1, 'bon.pdf'),
        { index: 1, rowId: 2, name: 'texte.pdf', blob: new Blob(['pas un pdf'], { type: 'application/pdf' }) },
        { index: 2, rowId: 3, name: 'vide.pdf', blob: new Blob([], { type: 'application/pdf' }) },
        item(3, 0, 'ligne-zero.pdf'),
        item(4, 1.5, 'ligne-decimale.pdf'),
        item(5, 4, 'x'.repeat(201)),
        { index: 6, rowId: 1, name: 'casse.pdf', blob: async () => { throw new Error('illisible'); } },
        { index: 7, rowId: 2, name: '   ', blob: pdfBlob('sans-nom') },
        item(8, 2, 'bon2.pdf'),
      ];
      const report = await RowAttachment.attachAll(TABLE, items, null);
      check(problems, 'un appel, deux fichiers', [calls().length, calls()[0].entrees.map(e => e.nom)], [1, ['bon.pdf', 'bon2.pdf']]);
      check(problems, 'les index des deux joints', report.attached.map(a => a.index), [0, 8]);
      check(problems, 'les sept écartés', report.failed.map(f => [f.index, f.reason]), [[1, 'failed'], [2, 'failed'], [3, 'row'], [4, 'row'], [5, 'failed'], [6, 'failed'], [7, 'failed']]);
      check(problems, 'un PDF dont %PDF- est après des octets (dans les 1 024 premiers) est accepté', await (async () => {
        gfs().joindreAppels = [];
        const lateHeader = new Blob([new Uint8Array(300), '%PDF-1.7\nx'], { type: 'application/pdf' });
        const r = await RowAttachment.attachAll(TABLE, [{ index: 0, rowId: 1, name: 'tard.pdf', blob: lateHeader }, { index: 1, rowId: 2, name: 'trop-tard.pdf', blob: new Blob([new Uint8Array(1100), '%PDF-1.7'], { type: 'application/pdf' }) }], null);
        return [r.attached.map(a => a.index), r.failed.map(f => f.index)];
      })(), [[0], [1]]);
      // Aucun ne passe : aucun appel.
      gfs().joindreAppels = [];
      const none = await RowAttachment.attachAll(TABLE, [items[1], items[2]], null);
      check(problems, 'aucun ne passe : aucun appel, un échec dit', [calls().length, none.problem, none.attached.length, none.failed.length], [0, 'failed', 0, 2]);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 6) les refus de l'appel ---
  scenario('gfsattach_a_refused_call_is_told_in_a_clear_sentence_and_the_next_calls_do_not_go',
    'Un appel que GFS refuse (`GFS_INCONNU` : un GFS d’avant ce geste, `GFS_REFUSE` avec sa phrase, `GFS_LECTURE_SEULE`, `GFS_INACTIF`, un code inconnu) : `gfs: { code, message }` dans le rapport, les fichiers pas joints sont des échecs `gfs`, les appels suivants ne partent pas, et le coin d’état dit une phrase claire (la phrase de GFS en plus pour un refus ou un échec), en français et en anglais.',
    async () => {
      const problems = [];
      const refuse = (code, message) => ({ erreur: { code, message } });
      const trial = async (label, options, fr, en) => {
        gfs().joindre = options;
        gfs().joindreAppels = [];
        const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')], null);
        I18n.setLang('fr');
        const noteFr = PdfDelivery.describe(make(report)).note;
        I18n.setLang('en');
        const noteEn = PdfDelivery.describe(make(report)).note;
        I18n.setLang('fr');
        check(problems, label + ' : le rapport', [report.gfs && report.gfs.code, report.attached.length, report.failed.map(f => f.reason), report.problem], [options === null ? 'GFS_INCONNU' : options.erreur.code, 0, ['gfs', 'gfs'], null]);
        check(problems, label + ' : en français', noteFr, fr);
        check(problems, label + ' : en anglais', noteEn, en);
        return report;
      };
      await trial('GFS plus ancien', null, 'PDF non joint à la ligne : cette version de Grist Factory Suite ne sait pas encore le faire.', 'PDF not attached to the row: this version of Grist Factory Suite cannot do it yet.');
      await trial('forme refusée', refuse('GFS_REFUSE', 'joindre : table doit être l’identifiant d’une table.'), 'PDF non joint à la ligne : Grist Factory Suite a refusé (« joindre : table doit être l’identifiant d’une table. »).', 'PDF not attached to the row: Grist Factory Suite refused (“joindre : table doit être l’identifiant d’une table.”).');
      await trial('lecture seule', refuse('GFS_LECTURE_SEULE', 'Le document est en lecture seule.'), 'PDF non joint à la ligne : le document est en lecture seule dans Grist Factory Suite.', 'PDF not attached to the row: the document is read-only in Grist Factory Suite.');
      await trial('app inactive', refuse('GFS_INACTIF', 'L’app n’est plus active.'), 'PDF non joint à la ligne : l’app n’est plus l’app active dans Grist Factory Suite.', 'PDF not attached to the row: this app is no longer the active app in Grist Factory Suite.');
      await trial('code inconnu, sans phrase', refuse('GFS_ECHEC', ''), 'PDF non joint à la ligne : Grist Factory Suite n’a pas pu le faire (« GFS_ECHEC »).', 'PDF not attached to the row: Grist Factory Suite could not do it (“GFS_ECHEC”).');
      // Plusieurs appels : le refus du premier arrête les autres ; le refus du deuxième laisse joint ce que le premier a joint.
      gfs().joindre = refuse('GFS_INCONNU', 'appel inconnu : joindre');
      gfs().joindreAppels = [];
      const many = Array.from({ length: 450 }, (_, i) => item(i, (i % 4) + 1, 'n' + i + '.pdf'));
      const first = await RowAttachment.attachAll(TABLE, many, null);
      check(problems, 'refusé au premier appel : un seul appel, 450 échecs', [calls().length, first.attached.length, first.failed.length], [1, 0, 450]);
      gfs().joindre = { erreurs: { 2: { code: 'GFS_INACTIF', message: 'L’app n’est plus active.' } } };
      gfs().joindreAppels = [];
      const second = await RowAttachment.attachAll(TABLE, many, null);
      check(problems, 'refusé au deuxième appel : le premier reste joint, pas de troisième', [calls().length, second.attached.length, second.failed.length, second.failed[0], second.problem, second.gfs && second.gfs.code], [2, 200, 250, { index: 200, reason: 'gfs' }, null, 'GFS_INACTIF']);
      check(problems, 'le coin d’état : le refus, pas les compteurs', [PdfDelivery.describe(make(second)).text, PdfDelivery.describe(make(second)).note], ['200 PDF joints à leur ligne, colonne « Pdf ».', 'PDF non joint à la ligne : l’app n’est plus l’app active dans Grist Factory Suite.']);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 7) muet, ou seule ---
  scenario('gfsattach_a_silent_gfs_gets_no_call_and_alone_the_app_keeps_its_own_path',
    'Un GFS qui ne répond pas : rien ne part (l’appel attendrait pour toujours), les fichiers sont des échecs `unreachable` ; hors de GFS (`GfsLink.hosted` faux), le chemin de toujours : un jeton d’écriture, l’envoi à Grist, une écriture de la cellule, et aucun appel `joindre`.',
    async () => {
      const problems = [];
      const silent = await withAnswering(false, () => RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')], null));
      check(problems, 'GFS muet', [calls().length, silent.problem, silent.failed, silent.attached.length], [0, 'unreachable', [{ index: 0, reason: 'unreachable' }], 0]);
      const server = useServer();
      stub().state.tokenCalls.length = 0;
      const alone = await withHosted(false, () => RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')], null));
      check(problems, 'seule', [calls().length, writeTokens(), server.requests.length, writes().length, alone.attached.length, alone.problem], [0, 1, 2, 1, 2, null]);
      return verdict(problems, {});
    }, WITH_COLUMN);

  // --- 8) GfsLink.attach ---
  scenario('gfslink_attach_checks_the_request_before_sending_and_keeps_only_its_fields',
    'GfsLink.attach vérifie la demande avant d’envoyer (table et colonne en texte, 1 à n fichiers, `ligne` entier d’au moins 1, `fichier` un Blob, `nom` en texte non vide) : sinon il rejette `GFS_REFUSE` sans rien envoyer ; il ne garde que `table`, `colonne`, `mode` (seulement s’il est donné) et, par fichier, `ligne`, `fichier`, `nom` ; la page seule (qui rejette « GFS absent » sans code) est dans le groupe rowAttachment, non hébergé.',
    async () => {
      const problems = [];
      const good = { ligne: 1, fichier: pdfBlob('a'), nom: 'a.pdf' };
      const codeOf = async request => { try { await GfsLink.attach(request); return 'accepté'; } catch (e) { return e && e.code ? e.code : String(e && e.message); } };
      const bad = {
        'rien': undefined,
        'pas de table': { colonne: 'Pdf', fichiers: [good] },
        'table vide': { table: ' ', colonne: 'Pdf', fichiers: [good] },
        'pas de colonne': { table: TABLE, fichiers: [good] },
        'aucun fichier': { table: TABLE, colonne: 'Pdf', fichiers: [] },
        'fichiers pas une liste': { table: TABLE, colonne: 'Pdf', fichiers: 'x' },
        'ligne 0': { table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: 0, fichier: pdfBlob('a'), nom: 'a.pdf' }] },
        'ligne décimale': { table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: 1.5, fichier: pdfBlob('a'), nom: 'a.pdf' }] },
        'ligne en texte': { table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: '1', fichier: pdfBlob('a'), nom: 'a.pdf' }] },
        'fichier qui n’en est pas un': { table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: 1, fichier: 'octets', nom: 'a.pdf' }] },
        'nom vide': { table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: 1, fichier: pdfBlob('a'), nom: '  ' }] },
        'un bon et un mauvais': { table: TABLE, colonne: 'Pdf', fichiers: [good, { ligne: 2, fichier: pdfBlob('b') }] },
      };
      const codes = {};
      for (const [label, request] of Object.entries(bad)) codes[label] = await codeOf(request);
      check(problems, 'chaque demande hors forme est refusée', Object.values(codes).every(code => code === 'GFS_REFUSE'), true);
      await sleep(30);
      check(problems, 'et rien ne part', calls().length, 0);
      const answer = await GfsLink.attach({ table: TABLE, colonne: 'Pdf', fichiers: [{ ligne: 2, fichier: pdfBlob('b'), nom: 'b.pdf', autre: 1 }], autre: 2 });
      check(problems, 'les champs gardés, pas de mode quand il n’est pas donné', [calls()[0].cles, calls()[0].entrees[0].cles, calls()[0].mode], [['table', 'colonne', 'fichiers'], ['ligne', 'fichier', 'nom'], undefined]);
      check(problems, 'la réponse lue', answer, { colonne: 'Pdf', probleme: null, joints: [{ index: 0, remplace: false }], echecs: [] });
      await GfsLink.attach({ table: TABLE, colonne: 'Pdf', mode: 'ajouter', fichiers: [good] });
      check(problems, 'le mode donné suit tel quel', calls()[1].mode, 'ajouter');
      // Un mode que GFS ne connaît pas : GFS refuse, la phrase de GFS est gardée avec son code.
      let refused = null;
      try { await GfsLink.attach({ table: TABLE, colonne: 'Pdf', mode: 'écraser', fichiers: [good] }); } catch (e) { refused = { code: e.code, message: e.message }; }
      check(problems, 'un mode inconnu : le refus de GFS, sa phrase', refused, { code: 'GFS_REFUSE', message: 'joindre : mode doit valoir « remplacer » ou « ajouter ».' });
      // Un rapport lu sans fouiller ce qu'il ne dit pas.
      gfs().joindre = { reponse: { probleme: '', joints: [{ index: '1' }, { index: 2, remplace: 'oui' }, null, { index: 3, remplace: true }], echecs: [{ index: 0 }, { raison: 'refus' }, { index: 4, raison: 7 }], colonne: 12 } };
      const odd = await GfsLink.attach({ table: TABLE, colonne: 'Pdf', fichiers: [good] });
      check(problems, 'un rapport étrange', odd, { colonne: '', probleme: null, joints: [{ index: 2, remplace: false }, { index: 3, remplace: true }], echecs: [{ index: 0, raison: '' }, { index: 4, raison: '' }] });
      gfs().joindre = { reponse: 42 };
      check(problems, 'un rapport qui n’est pas un objet', await GfsLink.attach({ table: TABLE, colonne: 'Pdf', fichiers: [good] }), { colonne: '', probleme: null, joints: [], echecs: [] });
      return verdict(problems, { codes });
    });

  // --- 9) les vrais exports ---
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  async function seedExports(h) {
    await h.resetEditor();
    I18n.setLang('fr');
    stub().setAttachments([]);
    stub().setVariables(TABLE, COLUMNS);
    stub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' });
    await sleep(60);
    RowAttachment.setOn(true);
    stub().clearActionLog();
    stub().state.tokenCalls.length = 0;
    const g = gfs();
    g.joindre = {};
    g.joindreAppels = [];
    g.joindreEnCours = 0;
    g.joindreMax = 0;
    g.pieces = [];
  }
  async function runExport(buttonId, until, settle) {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const origConfirm = Dialogs.confirm;
    Dialogs.confirm = async () => true;
    await PdfExport.ensurePdfLibsLoaded();
    const origCreatePdf = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      const generated = origCreatePdf.call(window.pdfMake, docDefinition);
      generated.download = function (name) { generated.getBlob(blob => downloads.push({ name, blob })); };
      return generated;
    };
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return undefined; }
      return origClick.call(this);
    };
    try {
      el(buttonId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!until() && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(settle === undefined ? 150 : settle);
    } finally {
      Dialogs.confirm = origConfirm;
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
      window.pdfMake.createPdf = origCreatePdf;
    }
    return { downloads, status: statusText(), error: el('status-msg').className };
  }
  const done = pattern => () => pattern.test(statusText());

  cases.push({
    id: 'gfsattach_single_pdf_export_is_attached_by_gfs_with_the_downloaded_pdf_and_no_write_token',
    description: 'Le vrai bouton Exporter, PDF d’une ligne, case cochée, chez GFS : le PDF est téléchargé comme avant ET GFS le joint (UN appel `joindre` : la ligne 1, le même nom, un File PDF aux octets du PDF téléchargé), le coin d’état le dit, aucun jeton d’écriture, aucun envoi à Grist, aucune écriture de l’app ; une ligne qui n’est pas la première part avec SON numéro.',
    run: async (h) => {
      const problems = [];
      await seedExports(h);
      const server = useServer();
      try {
        const first = await runExport('btn-export-pdf', done(/PDF joint à la ligne/), 400);
        const call = calls()[0] || { entrees: [] };
        const entry = call.entrees[0] || {};
        check(problems, 'téléchargé ET joint par GFS', [first.downloads.length, calls().length, call.entrees.length, entry.ligne, entry.nom === first.downloads[0].name, entry.instance, entry.type], [1, 1, 1, 1, true, 'File', 'application/pdf']);
        check(problems, 'les octets joints sont ceux du PDF téléchargé', [first.downloads[0] && entry.taille === first.downloads[0].blob.size, gfs().pieces[0] && String.fromCharCode.apply(null, Array.from(gfs().pieces[0].octets.slice(0, 5)))], [true, '%PDF-']);
        check(problems, 'le coin d’état', [first.status, first.error], ['PDF joint à la ligne, colonne « Pdf ». PDF généré.', '']);
        check(problems, 'ni jeton d’écriture, ni envoi à Grist, ni écriture de l’app', [writeTokens(), stub().state.tokenCalls.length, server.requests.length, writes().length], [0, 0, 0, 0]);
        stub().fireRecord({ id: 3, Nom: NAMES[2] }, TABLE);
        await sleep(80);
        await runExport('btn-export-pdf', () => calls().length === 2, 400);
        check(problems, 'la ligne 3', calls()[1] && calls()[1].entrees.map(e => e.ligne), [3]);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'gfsattach_zip_export_is_attached_by_gfs_each_pdf_to_its_own_row_in_one_call',
    description: 'L’archive ZIP (une ligne = un PDF), case cochée, chez GFS : l’archive est téléchargée comme avant ET GFS joint chaque PDF à SA ligne en UN appel (trois fichiers, lignes 1, 2 et 3, noms des entrées de l’archive), sans jeton d’écriture ; le PDF réuni (plusieurs lignes) n’appelle pas GFS.',
    run: async (h) => {
      const problems = [];
      await seedExports(h);
      const server = useServer();
      try {
        const zip = await runExport('v2-btn-export-pdf-batch', done(/PDF joints à leur ligne/), 600);
        const entries = zip.downloads[0] ? Object.keys((await JSZip.loadAsync(await zip.downloads[0].blob.arrayBuffer())).files) : [];
        check(problems, 'l’archive téléchargée', [zip.downloads.map(d => d.name), entries.length], [[TABLE + '-export-pdf.zip'], 3]);
        const call = calls()[0] || { entrees: [] };
        check(problems, 'un appel, trois fichiers, chacun à sa ligne', [calls().length, call.entrees.map(e => e.ligne), call.entrees.map(e => e.nom).sort()], [1, [1, 2, 3], entries.slice().sort()]);
        check(problems, 'le coin d’état', zip.status.indexOf('3 PDF joints à leur ligne, colonne « Pdf »') === 0, true);
        check(problems, 'ni jeton d’écriture, ni envoi à Grist, ni écriture de l’app', [writeTokens(), server.requests.length, writes().length], [0, 0, 0]);
        gfs().joindreAppels = [];
        const merged = await runExport('v2-btn-export-pdf-merged', done(/généré|téléchargé/), 800);
        check(problems, 'PDF réuni : téléchargé, GFS n’est pas appelé', [merged.downloads.length, calls().length, /joint/.test(merged.status)], [1, 0, false]);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gfsAttach = cases;
})();
