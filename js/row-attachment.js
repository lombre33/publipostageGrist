// Le PDF joint à la ligne (demande du 06/11 : « enregistrer le PDF généré en pièce jointe dans la ligne Grist »). Une colonne de type Pièces jointes, choisie dans Réglages > Vue,
// reçoit le PDF de chaque ligne exportée, dans la cellule de CETTE ligne. Quatre décisions du porteur (06/11) :
//  - le déclenchement est une case « Joindre à la ligne » du menu Exporter, un réglage de la personne (PersonStore, clé pp_export_attach) montré pour les deux PDF : rien ne se joint si elle n'est pas
//    cochée, et le PDF est téléchargé (ou rangé dans GFS) comme avant, la jointure vient EN PLUS ;
//  - une cellule qui a déjà un PDF : un réglage « Remplacer le PDF de même nom » (par défaut) ou « Toujours ajouter », à côté de la colonne (options du widget `pp_attach_column` et `pp_attach_mode`,
//    lues avec le widget et partagées par tout le monde une fois la vue enregistrée, même mécanique que js/export-date.js) ;
//  - le jeton d'écriture est demandé à Grist au début d'un export et jeté à la fin (GristAPI.getWriteAccess : jamais gardé, jamais mis en cache) ;
//  - Grist Factory Suite a sa propre fonction sur ce sujet (consigne 053) : le widget fait la jointure seul hors de GFS, et `attachAll` est le SEUL point de branchement. Hébergée (`GfsLink.hosted`) et le jour où GFS_ATTACH_WIRED est levé,
//    `attachAll` ne demande plus de jeton d'écriture et n'envoie rien à Grist : elle donne les octets à GFS (`GfsLink.attach`, l'appel `joindre`, au plus 200 fichiers par appel) et traduit son rapport dans le même rapport, sans toucher aux appelants ni aux réglages.
// Qui joint quoi : le PDF d'une ligne, le PDF protégé, chaque PDF d'une archive ZIP (un par ligne ; « Un document par valeur » : tous, dans la même cellule). Jamais le PDF réuni ni l'assemblage
// avant impression : plusieurs lignes dans un seul fichier, il n'y a pas de ligne à qui le donner (la case est grisée, avec sa raison, quand l'option de lignes cochée est l'une des deux).
// Comment (méthode de la communauté de Grist, « Upload attachment from custom widget » : rien n'en est mesuré chez nous, voir dev-tests/scenarios-row-attachment.js) : un POST multipart
// `${baseUrl}/attachments?auth=${jeton}` (champ `upload`) rend la liste des numéros des pièces jointes créées ; la cellule reçoit ensuite `['L', ...numéros]` (BulkUpdateRecord, UNE écriture pour
// tout le lot, faite après tous les envois et sur une lecture de la colonne juste avant : une pièce jointe ajoutée entre-temps dans Grist n'est pas perdue). Un envoi seul ne lie rien.
// Ce qui peut mal tourner, dit au coin d'état en rouge (le PDF, lui, est bien produit) : la colonne a disparu ou n'est plus de type Pièces jointes, Grist refuse (droits, règles d'accès),
// le fichier est trop gros pour Grist, Grist ne répond pas, la ligne a été supprimée pendant l'export. Un compte Lecteur de Grist ne joint rien, sans message (la case est grisée).
//   RowAttachment.init() -> lit les deux options et s'abonne à leurs changements (après GristAPI.init)
//   RowAttachment.getColumn() / getMode() -> la colonne choisie (son identifiant) ou null ; 'replace' ou 'add'
//   RowAttachment.isOn() / setOn(bool) -> la case de la personne (gardée par PersonStore) ; RowAttachment.active() -> la jointure vaut pour le prochain export (case cochée ET colonne utilisable ET écriture permise)
//   RowAttachment.attachAll(tableId, items, progress) -> Promise<null | rapport> : joint ces fichiers { index, rowId, name, blob } ; null quand il n'y a rien à faire ; `progress(rang, total)` est appelé avant chaque envoi. Le rapport :
//     { column, problem: null | 'missing' | 'unusable' | 'denied' | 'tooLarge' | 'unreachable' | 'failed', attached: [{ index, replaced }], failed: [{ index, reason }] }
//     (`problem` : ce qui a arrêté tout le lot ; `failed[].reason` : pourquoi CETTE ligne, 'row' si elle n'existe plus). Chez GFS, le rapport peut porter en plus `gfs: { code, message }` quand GFS a refusé l'appel lui-même
//     (`GFS_REFUSE`, `GFS_LECTURE_SEULE`, `GFS_INACTIF`, `GFS_INCONNU`…) : les fichiers pas encore joints sont des échecs de raison 'gfs'.
//   RowAttachment.sync(flyout, lines) / wire(flyout, after) -> la case du menu Exporter (grisée avec sa raison, jamais retirée)
//   RowAttachment.wirePanel() / render() -> la section de Réglages > Vue
const RowAttachment = (function () {
  const COLUMN_OPTION = 'pp_attach_column';
  const MODE_OPTION = 'pp_attach_mode';
  const PERSON_KEY = 'pp_export_attach';
  // Chez Grist Factory Suite (GFS), l'envoi de l'app est refusé : son jeton reste en LECTURE seule (`jeton.lectureSeule`) et `setOption` refuse les deux options `pp_attach_column` et `pp_attach_mode` (non déclarées).
  // Consigne 052 de GFS (06/11, lue par le fil Liaison) : le porteur a choisi que GFS joigne LUI-MÊME le fichier ; GFS ne déclarera donc ni le jeton d'écriture ni les deux clés. Choix du porteur du 06/11, « Griser dans GFS
  // pour l'instant » : la case du menu Exporter et la section de Réglages sont grisées, avec leur raison, dans GFS ; l'app seule n'en change pas. LE point à lever le jour où GFS annonce son geste (page GFS-ETAT.md, fil Liaison) :
  // passer cette constante à `true` : `attachAll` est DÉJÀ branché sur l'appel `joindre` de GFS (`GfsLink.attach`, attachViaGfs ci-dessous), il ne manque que la levée du grisé, après la déclaration `actions.joindre` de GFS, l'essai dans le Grist réel du porteur
  // et sa réponse sur où garder la colonne et le mode sous GFS. Elle ne se lève PAS sur une déclaration du jeton ou des clés : elle n'arrivera pas.
  const GFS_ATTACH_WIRED = false;
  const blockedByGfs = () => !GFS_ATTACH_WIRED && typeof GfsLink !== 'undefined' && GfsLink.hosted === true;
  const MODES = ['replace', 'add'];
  const ORIGIN_MODE = 'replace';
  const COLUMN_TYPE = 'Attachments';
  const COLUMN_SELECT_ID = 'settings-rowattachment-column';
  const MODE_SELECT_ID = 'settings-rowattachment-mode';
  const TOKEN_MARGIN_MS = 15000;    // un jeton qui expire dans moins que cela est redemandé avant l'envoi suivant (le même export)
  const MENU_ROW_ID = 'v2-export-attach';

  let column = null;               // identifiant de la colonne choisie (texte) ou null
  let mode = ORIGIN_MODE;          // 'replace' ou 'add'
  let search = null;               // la liste avec recherche de la colonne (SearchSelect), absente quand le composant ne s'est pas attaché
  // Ce que cet écran vient d'écrire dans les options : Grist le renvoie par onOptions, parfois après un choix plus récent (même garde que js/export-date.js).
  const columnEchoes = GristAPI.createEchoGuard();
  const modeEchoes = GristAPI.createEchoGuard();

  const normalizeColumn = value => (typeof value === 'string' && value !== '' ? value : null);
  const normalizeMode = value => (MODES.indexOf(value) !== -1 ? value : ORIGIN_MODE);
  const getColumn = () => column;
  const getMode = () => mode;
  const el = id => document.getElementById(id);
  const isReadOnly = () => (typeof AccessRights !== 'undefined' && AccessRights.get().readOnly) || GristAPI.isDocumentReadOnly();

  // === La case de la personne ===
  const isOn = () => PersonStore.get(PERSON_KEY) === '1';
  // Garde la case (vrai quand le navigateur ou l'espace de GFS l'a retenue).
  function setOn(value) {
    if (value) return PersonStore.set(PERSON_KEY, '1');
    PersonStore.remove(PERSON_KEY);
    return true;
  }

  // Ce que vaut la colonne `colId` de `table` pour cet usage : 'ok', 'missing' (le schéma est connu et ne l'a pas), 'unusable' (autre type, ou à formule), 'unknown' (schéma pas encore lu : on ne sait rien).
  function columnState(table, colId) {
    const type = GristAPI.getColumnType(table, colId);
    if (!type) return GristAPI.getTables().length ? 'missing' : 'unknown';
    return type === COLUMN_TYPE && !GristAPI.isFormulaColumn(table, colId) ? 'ok' : 'unusable';
  }
  // Les colonnes de `table` qui peuvent recevoir un PDF, dans l'ordre de la table.
  function candidates(table) {
    return GristAPI.getVisibleColumns(table).filter(col => columnState(table, col) === 'ok');
  }
  // Pourquoi la case est grisée ('' : elle ne l'est pas) : un compte en lecture seule, GFS dont le geste de jonction n'existe pas encore, pas de colonne utilisable, ou une option de lignes qui réunit plusieurs lignes dans un seul fichier.
  function offReason(lines) {
    const table = GristAPI.getCurrentTableId();
    if (isReadOnly()) return 'readOnly';
    if (blockedByGfs()) return 'gfs';
    if (!column || !table || columnState(table, column) === 'missing' || columnState(table, column) === 'unusable') return 'column';
    if (lines === 'merged' || lines === 'sheets') return 'merged';
    return '';
  }
  // La jointure vaut pour le prochain export de PDF d'une ligne ou d'une archive : case cochée, colonne utilisable, écriture permise. (Pour un PDF réuni, l'appelant l'écarte : js/main.js:finishBatchExport.)
  const active = () => isOn() && offReason('') === '';

  // === Écrire les options (Réglages > Vue) ===
  async function writeColumn(next) {
    const value = normalizeColumn(next);
    columnEchoes.remember(JSON.stringify(value));
    column = value;
    try { await GristAPI.setWidgetOption(COLUMN_OPTION, value); }
    catch (e) { console.error('[RowAttachment] enregistrement de l’option de la colonne impossible', e); }
    renderPanel(true);
    syncMenu();
  }
  async function writeMode(next) {
    const value = normalizeMode(next);
    modeEchoes.remember(JSON.stringify(value));
    mode = value;
    try { await GristAPI.setWidgetOption(MODE_OPTION, value); }
    catch (e) { console.error('[RowAttachment] enregistrement de l’option du mode impossible', e); }
    renderPanel(true);
  }
  // Les trois réglages, tels que Ctrl + Z les défait (js/settings-history.js) : défaire ou rétablir l'écrit par la même écriture que le geste.
  const COLUMN_SETTING = {
    read: getColumn,
    write: writeColumn,
    say: value => I18n.t('status.settingSet', {
      setting: I18n.t('settings.rowAttachment.title'),
      value: value ? I18n.t('status.rowAttachmentColumn', { column: value }) : I18n.t('status.rowAttachmentNone'),
    }),
    locked: isReadOnly,
  };
  const MODE_SETTING = {
    read: getMode,
    write: writeMode,
    say: value => I18n.t('status.settingSet', { setting: I18n.t('settings.rowAttachment.mode'), value: I18n.t('settings.rowAttachment.mode.' + value) }),
    locked: isReadOnly,
  };
  const PERSON_SETTING = {
    read: isOn,
    write: setOn,
    say: value => I18n.t('status.settingSet', { setting: I18n.t('attach.label'), value: I18n.t(value ? 'status.attachOn' : 'status.attachOff') }),
  };

  function init() {
    const options = GristAPI.getWidgetOptions() || {};
    column = normalizeColumn(options[COLUMN_OPTION]);
    mode = normalizeMode(options[MODE_OPTION]);
    GristAPI.onWidgetOptionsChange(incoming => {
      const nextColumn = normalizeColumn(incoming && incoming[COLUMN_OPTION]);
      const nextMode = normalizeMode(incoming && incoming[MODE_OPTION]);
      // Les options changent pour mille raisons (les autres réglages du widget) : rien n'est redessiné ni demandé à Grist tant que la colonne et le mode sont ceux qu'on a.
      if (!columnEchoes.isEcho(JSON.stringify(nextColumn)) && nextColumn !== column) { column = nextColumn; renderPanel(); syncMenu(); }
      if (!modeEchoes.isEcho(JSON.stringify(nextMode)) && nextMode !== mode) { mode = nextMode; renderPanel(); }
    });
  }

  // === Envoyer le fichier à Grist ===
  // Le numéro de la pièce jointe créée, ou une erreur portant `reason` ('denied' : Grist refuse, 'tooLarge' : trop gros, 'unreachable' : Grist ne répond pas, 'failed' : tout autre refus). Un envoi seul ne lie
  // rien à la ligne : la cellule est écrite après (attachAll).
  async function upload(access, file, name) {
    const form = new FormData();
    form.append('upload', file, name);
    let response;
    try {
      response = await fetch(access.baseUrl + '/attachments?auth=' + encodeURIComponent(access.token), { method: 'POST', body: form, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    } catch (e) { throw Object.assign(new Error('Grist ne répond pas'), { reason: 'unreachable' }); }
    if (!response.ok) {
      const reason = response.status === 413 ? 'tooLarge' : response.status === 401 || response.status === 403 ? 'denied' : 'failed';
      throw Object.assign(new Error('Grist a refusé l’envoi (' + response.status + ')'), { reason });
    }
    let created;
    try { created = await response.json(); } catch (e) { created = null; }
    const id = Array.isArray(created) ? Number(created[0]) : NaN;
    if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Réponse de Grist illisible : envoi d’une pièce jointe'), { reason: 'failed' });
    return id;
  }

  // Les numéros d'une cellule de pièces jointes, tels que Grist la rend : ['L', 12, 13], ou rien (null, '', 0).
  function idsOf(cell) {
    if (!Array.isArray(cell)) return [];
    return (cell[0] === 'L' ? cell.slice(1) : cell).map(Number).filter(id => Number.isInteger(id) && id > 0);
  }

  // Joint ces fichiers à leur ligne. `items` : [{ index, rowId, name, blob }], `blob` un Blob ou une fonction qui en rend un ; un élément sans ligne (le PDF réuni) est écarté. Rend null quand il n'y a rien à
  // faire (aucune colonne choisie, compte Lecteur, aucun élément avec une ligne). Le jeton d'écriture vit dans cette fonction et nulle part ailleurs.
  async function attachAll(tableId, items, progress) {
    const target = column;
    const wanted = (items || []).filter(item => item && item.rowId != null);
    if (!target || !tableId || !wanted.length || isReadOnly() || blockedByGfs()) return null;
    const report = { column: target, problem: null, attached: [], failed: [] };
    const fail = (problem) => { report.problem = problem; report.failed = wanted.map(item => ({ index: item.index, reason: problem })); return report; };
    // Le type et les formules ont pu changer dans Grist depuis la dernière lecture du schéma : deux petites lectures de métadonnées, pas de relecture des tables.
    await GristAPI.refreshColumnTypes().catch(() => {});
    const state = columnState(tableId, target);
    if (state === 'missing' || state === 'unusable') return fail(state);
    if (state !== 'ok') return fail('failed');
    if (viaGfs()) return attachViaGfs(tableId, target, wanted, progress);
    let access = null;
    try {
      try { access = await GristAPI.getWriteAccess(); }
      catch (e) { console.error('[RowAttachment] jeton d’écriture refusé', e); return fail('denied'); }
      // Les envois, un à un (Grist les prend l'un après l'autre) ; un fichier qui échoue ne fait pas perdre les autres.
      const sent = [];
      for (const [position, item] of wanted.entries()) {
        if (progress) progress(position + 1, wanted.length);
        try {
          if (access.expiresAt - Date.now() < TOKEN_MARGIN_MS) access = await GristAPI.getWriteAccess();
          const blob = typeof item.blob === 'function' ? await item.blob() : item.blob;
          const file = typeof File === 'function' ? new File([blob], item.name, { type: 'application/pdf' }) : blob;
          sent.push({ item, id: await upload(access, file, item.name) });
        } catch (e) {
          console.error('[RowAttachment] envoi refusé', e);
          report.failed.push({ index: item.index, reason: e && e.reason ? e.reason : 'failed' });
        }
      }
      if (!sent.length) {
        const reasons = new Set(report.failed.map(f => f.reason));
        report.problem = reasons.size === 1 ? report.failed[0].reason : 'failed';
        return report;
      }
      return await linkAll(tableId, target, sent, report);
    } finally {
      access = null;   // le jeton d'écriture est jeté avec l'export
    }
  }

  // === Chez GFS : GFS joint lui-même (consigne 053) ===
  // Hébergée, le jeton d'écriture n'existe pas : `attachAll` donne à GFS les octets de chaque PDF et la ligne d'où il vient (`joindre`, contrats 5.4 point 12), GFS les envoie à Grist un à un, relit la colonne juste avant
  // d'écrire et écrit UN lot par appel ; son rapport est traduit dans le rapport de `attachAll`. Quatre écarts avec le chemin de l'app seule, à connaître : (1) un seul défaut de forme (une ligne qui n'est pas un entier d'au moins 1, un nom hors
  // de 1 à 200 signes, un fichier vide ou qui n'est pas un PDF) fait refuser TOUT l'appel : chaque entrée est donc vérifiée ici avant l'envoi, et celle qui ne passe pas est un échec à elle seule ; (2) un envoi que Grist refuse (`refus`, `injoignable`, `echec`) arrête le lot
  // chez GFS (les fichiers pas encore envoyés sont des échecs du même mot, jamais essayés), alors que l'app seule continue ; la taille fait exception (réponse de GFS, consigne 054) : un fichier trop gros (`trop-gros`) échoue seul, les autres sont joints ; (3) au plus 200 entrées par appel, les appels un après l'autre (la progression : avant chaque appel) ; (4) `remplace` est
  // un booléen, il compte pour un remplacement.
  const GFS_BATCH_MAX = 200;
  const GFS_PROBLEMS = new Map([['absente', 'missing'], ['inutilisable', 'unusable'], ['refus', 'denied'], ['trop-gros', 'tooLarge'], ['injoignable', 'unreachable'], ['echec', 'failed']]);
  // Un mot de GFS dans ceux du rapport ; un mot inconnu (un GFS plus récent) est `failed`.
  const problemOfGfs = word => GFS_PROBLEMS.get(word) || 'failed';
  // Le GFS qui répond : hébergée et la levée du grisé faite. Hébergée mais muette, l'appel attendrait pour toujours (pas de délai) : `attachViaGfs` le dit sans rien envoyer.
  const viaGfs = () => GFS_ATTACH_WIRED && typeof GfsLink !== 'undefined' && GfsLink.hosted === true;
  // Un PDF que GFS acceptera : non vide, avec `%PDF-` dans ses 1 024 premiers octets (contrats 5.4, point 12).
  async function looksLikePdf(blob) {
    if (!blob || typeof blob.slice !== 'function' || !blob.size) return false;
    const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    for (let i = 0; i + 5 <= head.length; i += 1) if (head[i] === 37 && head[i + 1] === 80 && head[i + 2] === 68 && head[i + 3] === 70 && head[i + 4] === 45) return true;
    return false;
  }

  async function attachViaGfs(tableId, target, wanted, progress) {
    const report = { column: target, problem: null, attached: [], failed: [] };
    const failedAs = (item, reason) => report.failed.push({ index: item.index, reason });
    if (!GfsLink.isAnswering()) {
      wanted.forEach(item => failedAs(item, 'unreachable'));
      report.problem = 'unreachable';
      return report;
    }
    // Ce que GFS refuserait en bloc est écarté ici, entrée par entrée.
    const ready = [];
    for (const item of wanted) {
      const row = Number(item.rowId);
      if (!Number.isInteger(row) || row < 1) { failedAs(item, 'row'); continue; }
      const name = String(item.name == null ? '' : item.name).trim();
      let file = null;
      try {
        const blob = typeof item.blob === 'function' ? await item.blob() : item.blob;
        if (name && (/\.pdf$/i.test(name) ? name : name + '.pdf').length <= 200 && await looksLikePdf(blob)) file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : blob;
      } catch (e) { console.error('[RowAttachment] PDF illisible', e); }
      if (!file) { failedAs(item, 'failed'); continue; }
      ready.push({ item, row, file, name });
    }
    const mode = getMode() === 'add' ? 'ajouter' : 'remplacer';
    for (let offset = 0; offset < ready.length; offset += GFS_BATCH_MAX) {
      const chunk = ready.slice(offset, offset + GFS_BATCH_MAX);
      const rest = ready.slice(offset + chunk.length);
      if (progress) progress(offset + 1, ready.length);
      let answer;
      try { answer = await GfsLink.attach({ table: tableId, colonne: target, mode, fichiers: chunk.map(entry => ({ ligne: entry.row, fichier: entry.file, nom: entry.name })) }); }
      catch (e) {
        console.error('[RowAttachment] GFS refuse de joindre', e);
        report.gfs = { code: e && typeof e.code === 'string' ? e.code : '', message: e && e.message ? String(e.message) : '' };
        chunk.concat(rest).forEach(entry => failedAs(entry.item, 'gfs'));
        break;
      }
      const seen = new Set();
      answer.joints.forEach(({ index, remplace }) => {
        if (!chunk[index] || seen.has(index)) return;
        seen.add(index);
        report.attached.push({ index: chunk[index].item.index, replaced: remplace ? 1 : 0 });
      });
      const stopped = answer.probleme ? problemOfGfs(answer.probleme) : 'failed';
      answer.echecs.forEach(({ index, raison }) => {
        if (!chunk[index] || seen.has(index)) return;
        seen.add(index);
        failedAs(chunk[index].item, raison === 'ligne' ? 'row' : problemOfGfs(raison));
      });
      // Une entrée que le rapport ne cite pas n'est pas jointe : un échec, du mot du lot s'il en a un.
      chunk.forEach((entry, index) => { if (!seen.has(index)) failedAs(entry.item, stopped); });
      // La colonne absente ou inutilisable vaut pour tous les appels : rien d'autre ne part.
      if (stopped === 'missing' || stopped === 'unusable') { rest.forEach(entry => failedAs(entry.item, stopped)); break; }
    }
    report.attached.sort((a, b) => a.index - b.index);
    report.failed.sort((a, b) => a.index - b.index);
    // `problem` : ce qui a arrêté TOUT le lot, donc seulement quand rien n'est joint ; une ligne supprimée n'en est pas un, le refus de l'appel est dit par `gfs`.
    if (!report.attached.length && !report.gfs) {
      const reasons = new Set(report.failed.map(f => f.reason).filter(reason => reason !== 'row'));
      report.problem = reasons.size === 1 ? Array.from(reasons)[0] : reasons.size > 1 ? 'failed' : null;
    }
    return report;
  }

  // Écrit les cellules : la colonne est relue ICI (juste avant), pour ne rien défaire de ce qui y a été posé pendant les envois. En mode « Remplacer », les pièces jointes de la cellule qui portent le même nom
  // que le nouveau PDF sont retirées de la cellule (les autres restent) ; sans leur nom (table de Grist illisible) rien n'est retiré. Une seule écriture pour toutes les lignes.
  async function linkAll(tableId, target, sent, report) {
    let current;
    try { current = await grist.docApi.fetchTable(tableId); }
    catch (e) { console.error('[RowAttachment] colonne illisible', e); sent.forEach(s => report.failed.push({ index: s.item.index, reason: 'failed' })); report.problem = 'failed'; return report; }
    const present = new Map();   // numéro de ligne -> numéros de pièces jointes de la cellule
    (current.id || []).forEach((rowId, position) => present.set(Number(rowId), idsOf((current[target] || [])[position])));
    const byRow = new Map();     // numéro de ligne -> les envois réussis de cette ligne
    sent.forEach(s => {
      if (!present.has(Number(s.item.rowId))) { report.failed.push({ index: s.item.index, reason: 'row' }); return; }
      if (!byRow.has(Number(s.item.rowId))) byRow.set(Number(s.item.rowId), []);
      byRow.get(Number(s.item.rowId)).push(s);
    });
    if (!byRow.size) return report;
    let names = new Map();
    if (mode === 'replace') {
      const everyOld = [];
      byRow.forEach((_, rowId) => everyOld.push(...present.get(rowId)));
      if (everyOld.length) names = await GristAPI.getAttachmentInfos(everyOld);
    }
    const rows = [];
    const values = [];
    const replacedBy = new Map();   // numéro de ligne -> nombre de pièces jointes remplacées
    byRow.forEach((sends, rowId) => {
      const fresh = sends.map(s => s.id);
      const taken = new Set(sends.map(s => s.item.name));
      const old = present.get(rowId);
      const kept = mode === 'replace' ? old.filter(id => !(names.has(id) && taken.has(names.get(id).fileName))) : old;
      replacedBy.set(rowId, old.length - kept.length);
      rows.push(rowId);
      values.push(['L', ...kept, ...fresh]);
    });
    const write = async (ids, cells) => grist.docApi.applyUserActions([['BulkUpdateRecord', tableId, ids, { [target]: cells }]]);
    let written = rows;
    try { await write(rows, values); }
    catch (e) {
      console.error('[RowAttachment] écriture refusée, vérification des lignes', e);
      // Une ligne supprimée pendant l'export fait refuser tout le lot (comme la date, js/export-date.js) : on ne garde que les lignes qui existent encore.
      let stillThere;
      try { stillThere = new Set((await grist.docApi.fetchTable(tableId)).id.map(Number)); }
      catch (e2) { stillThere = null; }
      const keep = stillThere ? rows.filter(id => stillThere.has(id)) : [];
      written = [];
      if (stillThere && keep.length && keep.length < rows.length) {
        try { await write(keep, keep.map(id => values[rows.indexOf(id)])); written = keep; }
        catch (e3) { console.error('[RowAttachment] écriture refusée sur les lignes restantes', e3); }
      }
      if (!written.length) {
        // Plus aucune de ces lignes n'existe : ce n'est pas un refus de Grist ; sinon Grist refuse l'écriture (droits, règles d'accès).
        const gone = !!stillThere && !keep.length;
        byRow.forEach((sends) => sends.forEach(s => report.failed.push({ index: s.item.index, reason: gone ? 'row' : 'denied' })));
        if (!gone) report.problem = 'denied';
        return report;
      }
      rows.filter(id => written.indexOf(id) === -1).forEach(id => byRow.get(id).forEach(s => report.failed.push({ index: s.item.index, reason: 'row' })));
    }
    written.forEach(rowId => byRow.get(rowId).forEach((s, position) => report.attached.push({ index: s.item.index, replaced: position === 0 ? replacedBy.get(rowId) : 0 })));
    report.attached.sort((a, b) => a.index - b.index);
    return report;
  }

  // === La case « Joindre à la ligne » du menu Exporter ===
  // La case d'accord avec ce qui vaut maintenant : cochée quand la jointure s'applique, grisée (jamais retirée) avec sa raison en info-bulle et au clic quand elle ne peut pas s'appliquer. `lines` : l'option de
  // lignes cochée dans le menu ('one', 'zip', 'merged', 'sheets').
  function sync(flyout, lines) {
    const row = flyout && flyout.querySelector('#' + MENU_ROW_ID);
    if (!row) return;
    const reason = offReason(lines);
    row.setAttribute('aria-checked', isOn() && !reason ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!reason);
    if (reason) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
    LockReasons.set(row, 'mode', reason ? I18n.t('attach.off.' + reason) : '');
  }
  // Le menu se redessine à chaque survol (js/main.js:syncExportMenus) ; un changement de colonne ou de droits le tient d'accord sans attendre.
  let menuSync = null;
  const syncMenu = () => { if (menuSync) menuSync(); };

  // Le clic sur la case, ou Entrée ou Espace : grisée, il ne change rien (la raison est dite par LockReasons) ; sinon la case se coche ou se décoche, un pas d'Annuler / Rétablir, et `after()` redessine les menus.
  function wire(flyout, after) {
    const row = flyout && flyout.querySelector('#' + MENU_ROW_ID);
    if (!row) return;
    menuSync = after;
    const toggle = () => {
      if (row.classList.contains('v2-hover-row-disabled')) return;
      SettingsHistory.track(PERSON_SETTING, () => setOn(!isOn()));
      after();
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      // Grisée, la case dit sa raison comme au clic (js/lock-reasons.js arrête le clic et la dit).
      if (row.classList.contains('v2-hover-row-disabled')) row.click(); else toggle();
    });
  }

  // === Réglages > Vue > PDF joint à la ligne ===
  function fillColumns(select, table, choices) {
    select.innerHTML = '';
    select.appendChild(Dom.option('', I18n.t('settings.rowAttachment.none')));
    choices.forEach(col => ConditionFields.appendColumnOption(select, col, table, col));
    // Colonne choisie qui n'est plus proposée (supprimée, renommée, devenue à formule) : gardée visible plutôt que remplacée en silence par « — Aucune — ».
    if (column && choices.indexOf(column) === -1) select.appendChild(Dom.option(column, column));
    select.value = column || '';
  }

  // L'état sous la liste : { text, problem }, text vide quand il n'y a rien à dire.
  function statusOf(table, choices) {
    if (!column) {
      return table && !choices.length && GristAPI.getTables().length
        ? { text: I18n.t('settings.rowAttachment.status.noColumns', { table }), problem: false }
        : { text: '', problem: false };
    }
    const state = table ? columnState(table, column) : 'unknown';
    if (state === 'missing' || state === 'unusable') return { text: I18n.t('settings.rowAttachment.status.' + state, { column }), problem: true };
    if (state === 'unknown') return { text: '', problem: false };
    return { text: I18n.t('settings.rowAttachment.status.ok', { column }), problem: false };
  }

  // Fermées, les Réglages n'ont rien à redessiner : l'ouverture le fait (`force`).
  const settingsOpen = () => { const modal = el('settings-modal'); return !!modal && modal.style.display !== 'none' && modal.style.display !== ''; };

  function renderPanel(force) {
    const select = el(COLUMN_SELECT_ID);
    if (!select || (force !== true && !settingsOpen())) return;
    const table = GristAPI.getCurrentTableId();
    const choices = table ? candidates(table) : [];
    fillColumns(select, table, choices);
    const readOnly = isReadOnly();
    const locked = readOnly || blockedByGfs();
    select.disabled = locked;
    if (search) search.sync();
    const modeSelect = el(MODE_SELECT_ID);
    if (modeSelect) { modeSelect.value = mode; modeSelect.disabled = locked; }
    const status = el('settings-rowattachment-status');
    if (status) {
      const info = statusOf(table, choices);
      status.textContent = info.text;
      status.hidden = !info.text;
      status.classList.toggle('is-problem', info.problem);
    }
    const lockedHint = el('settings-rowattachment-locked');
    if (lockedHint) lockedHint.hidden = !readOnly;
    const gfsHint = el('settings-rowattachment-locked-gfs');
    if (gfsHint) gfsHint.hidden = readOnly || !locked;
  }

  function wirePanel() {
    const select = el(COLUMN_SELECT_ID);
    if (!select) return;
    select.addEventListener('change', () => {
      if (isReadOnly() || blockedByGfs()) { renderPanel(true); return; }
      SettingsHistory.track(COLUMN_SETTING, () => writeColumn(select.value));
    });
    const modeSelect = el(MODE_SELECT_ID);
    if (modeSelect) modeSelect.addEventListener('change', () => {
      if (isReadOnly() || blockedByGfs()) { renderPanel(true); return; }
      SettingsHistory.track(MODE_SETTING, () => writeMode(modeSelect.value));
    });
    // Composant indisponible : la liste native reste, inchangée.
    try { search = SearchSelect.attachColumns(select); }
    catch (e) { console.warn('[RowAttachment] recherche indisponible, liste native conservée', e); }
    // Relue à chaque ouverture des Réglages : une colonne a pu être ajoutée, retirée ou renommée dans Grist depuis.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      renderPanel(true);
      GristAPI.refreshSchema().then(() => { renderPanel(true); syncMenu(); }).catch(() => {});
    });
    // Les droits changent aussi Réglages ouverts : la section se grise ou se dégrise sans rouvrir, et la case du menu avec elle.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(() => { renderPanel(); syncMenu(); });
    renderPanel(true);
  }

  return { init, getColumn, getMode, isOn, setOn, active, offReason, attachAll, sync, wire, wirePanel, render: () => renderPanel(true) };
})();
