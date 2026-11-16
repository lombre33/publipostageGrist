// Le constat d'une icône grisée : ce que le widget LIT dans le document pour dire pourquoi, vérification par vérification (✓ écartée, ✕ c'est celle-ci), le geste pour dégriser, et le texte à coller sur le forum.
// Demande du 12/11 (« chaque icône grisée ouvre une bulle qui explique pourquoi, et "En savoir plus" fait un petit diagnostic avec le contexte du document ») ; étude du 13/11 : un constat riche en faits vivants,
// un bouton « Copier le constat » pour le forum, un interrupteur « Masquer les noms ». La bulle qui le montre est js/lock-bubble.js ; la cause d'un grisé vient de js/lock-reasons.js (`LockReasons.detailOf`).
//
// Jamais de nom écrit à la main : les noms de tables, de colonnes et de modèle sont lus au moment du clic (schéma Grist, règles de liaison, modèle ouvert) et passent dans les textes par des JETONS (`tableName`,
// `columnName`, `templateName`) que `resolve` écrit tels quels à l'écran, et que le texte copié remplace par Table 1, Colonne 1… quand « Masquer les noms » est coché. Jamais le contenu d'une cellule, ni le nom du document, ni
// l'adresse de la personne : seuls les noms de tables, de colonnes et de modèle sont lus, et le texte copié le dit.
//
//   LockDiagnostic.identify(el)                    { name, icon } : le nom court du contrôle et son icône
//   LockDiagnostic.forLock(el, detail)             le constat d'un grisé de js/lock-reasons.js (`detail` : { cause, kind, reason })
//   LockDiagnostic.forLoop({ editor, pos, node, taken })   le constat de la Boucle d'une variable ou d'une image de colonne Pièces jointes
//   (les icônes grisées des barres du tableau et de l'image : js/lock-bar-causes.js, appelé par forLock ; `quote`, `checks` et `tokens` lui sont rendus)
//   LockDiagnostic.resolve(text, mask)             un texte à jetons, écrit tel quel (mask faux) ou avec les noms remplacés (mask vrai) ; les alias se suivent d'un appel à l'autre avec `LockDiagnostic.aliases()`
//   LockDiagnostic.report(spec, { name, why, mask })   le texte du forum
// Un constat : { why?, sub?, checks: [{ s: 'ok' | 'no', t, d? }], fix?, action?: { label, run }, context: [[libellé, valeur]] } ; `why` et `sub` écrasent la phrase du grisé quand elle porte des noms (jetons).
const LockDiagnostic = (function () {
  const t = (key, vars) => I18n.t(key, vars);
  const G = () => GristAPI;

  // === Les noms, sous jetons ===
  const OPEN = '';
  const CLOSE = '';
  const token = kind => name => OPEN + kind + '|' + name + CLOSE;
  const tableName = token('t');
  const columnName = token('c');
  const templateName = token('m');
  const TOKENS = /([tcm])\|([^]*)/g;
  const quote = text => (I18n.getLang() === 'en' ? '“' + text + '”' : '« ' + text + ' »');
  const quoted = {
    table: name => quote(tableName(name)),
    column: name => quote(columnName(name)),
    template: name => quote(templateName(name)),
  };
  // Les noms de remplacement d'un même texte : le même nom garde le même alias de la première à la dernière ligne.
  function aliases() {
    const seen = { t: new Map(), c: new Map() };
    return (kind, name) => {
      if (kind === 'm') return t('lockBubble.templateAlias');
      const map = seen[kind];
      if (!map.has(name)) map.set(name, t(kind === 't' ? 'lockBubble.tableAlias' : 'lockBubble.columnAlias', { n: map.size + 1 }));
      return map.get(name);
    };
  }
  function resolve(text, mask, alias) {
    const pick = mask ? (alias || aliases()) : null;
    return String(text == null ? '' : text).replace(TOKENS, (all, kind, name) => (pick ? pick(kind, name) : name));
  }

  // === Ce que le document dit ===
  function typeLabel(type) {
    const base = String(type || '').split(':')[0];
    return I18n.has('lockBubble.colType.' + base) ? t('lockBubble.colType.' + base) : String(type || '');
  }
  const columnsOf = table => G().getVisibleColumns(table);
  const refsTo = (table, target) => columnsOf(table).filter(column => {
    const ref = G().referenceOf(G().getColumnType(table, column));
    return !!ref && !ref.list && ref.table === target;
  });
  const listColumns = table => columnsOf(table).filter(column => { const ref = G().referenceOf(G().getColumnType(table, column)); return !!ref && ref.list; });
  const linkedTables = page => G().getTables().filter(table => table !== page && !!G().getLinkRule(table, page));
  const joined = names => names.join(', ');
  const rightsNow = () => { try { return AccessRights.get(); } catch (e) { return { readOnly: false, canExport: true, canComment: true }; } };
  const readModeNow = () => { const read = document.getElementById('btn-mode-read'); return !!read && read.classList.contains('active'); };
  const templateNameNow = () => {
    const select = document.getElementById('template-select');
    const option = select && select.selectedOptions && select.selectedOptions[0];
    const text = option ? option.textContent.replace(/[—–]/g, '').trim() : '';
    return text || '';
  };
  function browser() {
    const ua = navigator.userAgent || '';
    const match = ua.match(/(Firefox|Edg|Chrome)\/(\d+)/);
    const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return (match ? (match[1] === 'Edg' ? 'Edge' : match[1]) + ' ' + match[2] : t('lockBubble.ctx.unknown')) + (os ? ', ' + os : '');
  }
  const accessLabel = level => (level === 'full' ? t('lockBubble.ctx.accessFull') : level === 'read table' ? t('lockBubble.ctx.accessTable') : level === 'none' ? t('lockBubble.ctx.accessNone') : String(level));
  const typeOfKind = kind => (['email', 'macro', 'grid', 'eml'].indexOf(kind) !== -1 ? t('lockBubble.type.' + kind) : '');

  // Ce que le widget voit, quel que soit le grisé : la version, l'accès, les droits, la table de la page et ses tables liées, le modèle et le mode, le panneau. `extra` s'insère avant le panneau.
  function context(extra, kind) {
    const rights = rightsNow();
    const page = G().getCurrentTableId();
    const rows = [
      [t('lockBubble.ctx.version'), PP_VERSION],
      [t('lockBubble.ctx.access'), accessLabel(G().getAccessLevel())],
      [t('lockBubble.ctx.rights'), t(rights.readOnly ? 'lockBubble.ctx.rightsRead' : 'lockBubble.ctx.rightsEdit')],
      [t('lockBubble.ctx.page'), page ? tableName(page) : t('lockBubble.ctx.none')],
    ];
    const linked = page ? linkedTables(page) : [];
    rows.push([t('lockBubble.ctx.linked'), linked.length
      ? joined(linked.map(table => t('lockBubble.ctx.linkedBy', { table: tableName(table), column: columnName(G().getLinkRule(table, page).colonneCible || '?') })))
      : t('lockBubble.ctx.none')]);
    const template = templateNameNow();
    const type = typeOfKind(kind);
    if (!extra || !extra.noTemplate) rows.push([t('lockBubble.ctx.template'), template ? (type ? t('lockBubble.ctx.templateTyped', { name: templateName(template), type }) : quote(templateName(template))) : t('lockBubble.ctx.templateNone')]);
    rows.push([t('lockBubble.ctx.mode'), t(readModeNow() ? 'lockBubble.ctx.modeRead' : 'lockBubble.ctx.modeEdit')]);
    const record = G().getCurrentRecord ? G().getCurrentRecord() : null;
    if (readModeNow()) rows.push([t('lockBubble.ctx.row'), record && record.id ? t('lockBubble.ctx.rowNumber', { id: record.id }) : t('lockBubble.ctx.none')]);
    ((extra && extra.rows) || []).forEach(row => rows.push(row));
    rows.push([t('lockBubble.ctx.panel'), t('lockBubble.ctx.panelSize', { width: window.innerWidth, height: window.innerHeight, browser: browser() })]);
    return rows;
  }

  // === Les vérifications ===
  const ok = (title, note) => ({ s: 'ok', t: title, d: note || '' });
  const no = (title, note) => ({ s: 'no', t: title, d: note || '' });

  // Droits, accès du widget, mode : la même liste pour tout ce que les droits, l'accès ou la Lecture grisent ; chaque ligne est jugée à l'instant du clic.
  function accessChecks(kind) {
    const rights = rightsNow();
    const out = [rights.readOnly ? no(t('lockBubble.chk.readOnly'), t('lockBubble.chk.rightsRead')) : ok(t('lockBubble.chk.canEdit'), t('lockBubble.chk.rightsEdit'))];
    if (kind === 'lock.noExport') out.push(rights.canExport ? ok(t('lockBubble.chk.canExport')) : no(t('lockBubble.chk.noExport')));
    if (kind === 'lock.noComment') out.push(rights.canComment ? ok(t('lockBubble.chk.canComment')) : no(t('lockBubble.chk.noComment')));
    const level = G().getAccessLevel();
    const levelNote = t('lockBubble.chk.accessLevel', { level: accessLabel(level) });
    out.push(level === 'full' ? ok(t('lockBubble.chk.fullAccess'), levelNote) : no(t('lockBubble.chk.noFullAccess'), levelNote));
    if (readModeNow()) {
      const record = G().getCurrentRecord ? G().getCurrentRecord() : null;
      const page = G().getCurrentTableId();
      out.push(no(t('lockBubble.chk.readMode'), record && record.id && page ? t('lockBubble.chk.readModeRow', { id: record.id, table: quote(tableName(page)) }) : t('lockBubble.chk.readModePlain')));
    } else out.push(ok(t('lockBubble.chk.editMode')));
    return out;
  }
  const FIX_OF_ACCESS = { 'lock.readOnly': 'lockBubble.fix.readOnly', 'lock.readMode': 'lockBubble.fix.readMode', 'lock.accessGuide': 'lockBubble.fix.accessGuide', 'lock.noExport': 'lockBubble.fix.noExport', 'lock.noComment': 'lockBubble.fix.noComment' };
  function switchToEditing() {
    const edit = document.getElementById('btn-mode-edit');
    if (edit) edit.click();
  }

  // Le type du modèle, la zone, la grille, le tableau lié, le PDF : ce que le grisé de la barre du haut a de propre, derrière les mêmes lignes de droits et de mode.
  function modelChecks(kind) {
    const rights = rightsNow();
    const lead = [rights.readOnly ? no(t('lockBubble.chk.readOnly'), t('lockBubble.chk.rightsRead')) : ok(t('lockBubble.chk.canEdit'), t('lockBubble.chk.rightsEdit')), readModeNow() ? no(t('lockBubble.chk.readMode')) : ok(t('lockBubble.chk.editMode'))];
    const name = quoted.template(templateNameNow() || t('lockBubble.generic'));
    if (kind === 'email') return { checks: lead.concat(no(t('lockBubble.chk.isEmail'), t('lockBubble.chk.isEmailNote', { name }))), fix: t('lockBubble.fix.email') };
    if (kind === 'macro') return { checks: lead.concat(no(t('lockBubble.chk.isMacro'), t('lockBubble.chk.isMacroNote', { name }))), fix: t('lockBubble.fix.macro') };
    if (kind === 'eml') return { checks: lead.concat(no(t('lockBubble.chk.isEml'), t('lockBubble.chk.isEmlNote'))), fix: t('lockBubble.fix.eml') };
    if (kind === 'zone') return { checks: lead.concat(no(t('lockBubble.chk.inZone'), t('lockBubble.chk.inZoneNote'))), fix: t('lockBubble.fix.zone') };
    if (kind === 'grid') return { checks: [no(t('lockBubble.chk.isGrid'), t('lockBubble.chk.isGridNote', { name }))], fix: t('lockBubble.fix.grid') };
    if (kind === 'linked') return { checks: [no(t('lockBubble.chk.inLinked'), t('lockBubble.chk.inLinkedNote'))], fix: t('lockBubble.fix.linked') };
    if (kind === 'pdf') return { checks: [no(t('lockBubble.chk.pdfOpen'), t('lockBubble.chk.pdfOpenNote'))], fix: t('lockBubble.fix.pdf') };
    return { checks: [], fix: '' };
  }

  // Le constat d'un grisé de js/lock-reasons.js : `detail` = { cause, kind, reason }.
  function forLock(el, detail) {
    const cause = (detail && detail.cause) || '';
    const kind = (detail && detail.kind) || '';
    // Une icône grisée d'une barre flottante du tableau ou de l'image garde la clé de sa raison : js/lock-bar-causes.js en lit le constat.
    // Un bouton grisé « doux » (cause `state`, js/lock-reasons.js) porte la clé de sa raison dans le genre de la cause.
    const barKey = !cause && el.getAttribute ? el.getAttribute('data-pp-bar-reason') : cause === 'state' ? kind : '';
    const barFinding = barKey ? LockBarCauses.forKey(barKey) : null;
    if (barFinding) return barFinding;
    // Le bouton Page d'un modèle email, grisé « doux » : le même constat que le grisé par le type du modèle.
    if (cause === 'state' && kind === 'lock.email') { const found = modelChecks('email'); return { checks: found.checks, fix: found.fix, action: null, context: context(null, 'email') }; }
    let checks = [];
    let fix = '';
    let action = null;
    // Les marges de Réglages grisées en lecture seule (cause `state`, genre « lock.readOnly ») disent la même chose que les droits.
    if (cause === 'access' || (cause === 'state' && kind === 'lock.readOnly')) {
      checks = accessChecks(kind);
      fix = FIX_OF_ACCESS[kind] ? t(FIX_OF_ACCESS[kind]) : '';
      if (kind === 'lock.readMode' && !rightsNow().readOnly) action = { label: t('lockBubble.fix.editMode'), run: switchToEditing };
    } else if (cause === 'mode' || cause === 'grid' || cause === 'linked' || cause === 'pdf') {
      const found = modelChecks(cause === 'mode' ? kind : cause);
      checks = found.checks;
      fix = found.fix;
    }
    return { checks, fix, action, context: context(null, cause === 'mode' ? kind : cause === 'grid' ? 'grid' : '') };
  }

  // === La Boucle ===
  function forLoop({ editor, pos, node, taken }) {
    const facts = VariableLoop.diagnose(editor, pos, node);
    const table = facts.table;
    const column = facts.column;
    const path = tableName(table) + '.' + columnName(column);
    const type = facts.problem ? '' : typeLabel(G().getColumnType(table, column));
    const within = facts.zone ? facts.zone.table : '';
    const zoneKind = facts.zone ? t(I18n.has('lockBubble.zone.' + facts.zone.repeat) ? 'lockBubble.zone.' + facts.zone.repeat : 'lockBubble.zone.unknown') : '';
    const sub = t('lockBubble.subFor', { name: path });
    const rows = [[t('lockBubble.ctx.variable'), path + (type ? ' (' + type + ')' : '')]];
    if (facts.zone) rows.push([t('lockBubble.ctx.zone'), t('lockBubble.zoneOf', { zone: zoneKind, within: tableName(within) })]);
    if (!facts.problem && table) {
      rows.push([t('lockBubble.ctx.columns', { table: tableName(table) }), joined(columnsOf(table).map(name => columnName(name) + ' (' + typeLabel(G().getColumnType(table, name)) + ')'))]);
    }
    // La phrase du grisé, celle que dit l'info-bulle (VariableLoop.status et la barre : un calcul, une boucle déjà ouverte, une variable hors d'une zone répétée, dans la zone de sa propre table, dans celle d'une autre) mais avec ses noms sous jetons.
    const why = facts.isCalc ? t('varToolbar.notForCalc') : taken ? t('varLoop.alreadyOpen')
      : !facts.zone ? t('varToolbar.loopDisabled')
        : table === within ? t('varToolbar.loopNested', { table: tableName(table) }) : t('varToolbar.loopNestedNone', { table: tableName(table), within: tableName(within) });
    const base = { sub, why, context: context({ rows }, '') };
    if (facts.isCalc) return Object.assign(base, { checks: [no(t('lockBubble.loop.calc'), t('lockBubble.loop.calcNote'))], fix: t('lockBubble.loop.fixCalc') });
    if (taken) return Object.assign(base, { checks: [no(t('lockBubble.loop.taken'), t('lockBubble.loop.takenNote'))], fix: t('lockBubble.loop.fixTaken') });
    const checks = [];
    if (facts.problem) {
      const note = facts.problem === 'table' ? t('lockBubble.loop.columnKoTable', { table: quoted.table(table) })
        : facts.problem === 'path' ? t('lockBubble.loop.columnKoPath', { path: quote(path) })
          : t('lockBubble.loop.columnKoColumn', { table: quoted.table(table), column: quoted.column(column), columns: joined(columnsOf(table).map(columnName)) });
      checks.push(no(t('lockBubble.loop.columnKo'), note));
      if (facts.zone) checks.push(ok(t('lockBubble.loop.inZone'), t('lockBubble.zoneEach', { zone: zoneKind, within: quoted.table(within) })));
      return Object.assign(base, { checks, fix: t('lockBubble.loop.fixColumn', { table: quoted.table(table), column: quoted.column(column) }) });
    }
    checks.push(ok(t('lockBubble.loop.columnOk'), t('lockBubble.loop.columnOkNote', { path, type })));
    if (!facts.zone) return Object.assign(base, { checks, fix: '' });
    checks.push(ok(t('lockBubble.loop.inZone'), t('lockBubble.zoneEach', { zone: zoneKind, within: quoted.table(within) })));
    const others = G().getTables().filter(name => name !== within && refsTo(name, within).length);
    const othersText = others.length ? joined(others.map(tableName)) : t('lockBubble.loop.none');
    if (table === within) {
      const lists = listColumns(table);
      checks.push(no(t('lockBubble.loop.manyRows'), t('lockBubble.loop.manyRowsSame', { table: quoted.table(table), lists: lists.length ? joined(lists.map(columnName)) : t('lockBubble.loop.none') })));
      return Object.assign(base, { checks, fix: t('lockBubble.loop.fixSame', { within: quoted.table(within), others: othersText }) });
    }
    checks.push(no(t('lockBubble.loop.attached', { table: quoted.table(table), within: quoted.table(within) }), t('lockBubble.loop.attachedNone', { table: quoted.table(table), within: quoted.table(within) })));
    return Object.assign(base, { checks, fix: t('lockBubble.loop.fixAttach', { table: quoted.table(table), within: quoted.table(within), others: othersText }) });
  }

  // === Le texte du forum ===
  const MARKS = { ok: '✓', no: '✕' };
  function report(spec, { name, why, mask }) {
    const alias = aliases();
    const lines = [t('lockBubble.report.title', { version: PP_VERSION, name }), ''];
    lines.push(t('lockBubble.report.reason', { text: why }), '');
    if (spec.checks && spec.checks.length) {
      lines.push(t('lockBubble.report.findings'));
      spec.checks.forEach(check => lines.push('- ' + MARKS[check.s] + ' ' + check.t + (check.d ? ' : ' + check.d : '')));
      lines.push('');
    }
    if (spec.fix) lines.push(t('lockBubble.report.fix', { text: spec.fix }), '');
    lines.push(t('lockBubble.report.context'));
    (spec.context || []).forEach(([label, value]) => lines.push('- ' + label + ' : ' + value));
    lines.push('', t('lockBubble.report.footer'));
    if (mask) lines.push(t('lockBubble.report.masked'));
    return resolve(lines.join('\n'), mask, alias);
  }

  // === Le nom et l'icône du contrôle ===
  const shortName = raw => String(raw || '').replace(/\s*\([^)]*\)\s*$/, '').split(/\s*[:–—]\s*/)[0].trim();
  function identify(el) {
    const holder = el.querySelector ? el.querySelector('[aria-label], [title]') : null;
    const candidates = [
      el.getAttribute('data-pp-bar-label'), el.getAttribute('aria-label'), el.getAttribute('data-pp-lock-kept-title'), el.getAttribute('data-tip'),
      holder && (holder.getAttribute('aria-label') || holder.getAttribute('title')), (el.textContent || '').trim(),
    ];
    const found = candidates.map(shortName).find(text => text && text.length <= 40);
    const svg = el.querySelector ? el.querySelector('svg') : null;
    return { name: found || t('lockBubble.generic'), icon: svg ? svg.outerHTML : '' };
  }

  return { identify, forLock, forLoop, resolve, aliases, report, context, quote, checks: { ok, no }, tokens: { tableName, columnName, templateName } };
})();
