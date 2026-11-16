// Le constat d'une icône grisée des barres flottantes du tableau et de l'image, et d'une ligne de menu que la place du curseur grise : pourquoi CE bouton est grisé, lu sur le tableau ou l'image qui porte la sélection (sa taille, ses cases
// fusionnées, les cases choisies, le suivi des modifications, la source et le calque de l'image) ou sur ce que le curseur touche (un titre, une case de tableau, une liste, un en-tête), avec le geste pour le dégriser. Demande du 12/11 (lots 2 et 3) :
// la bulle de js/lock-bubble.js disait déjà la phrase de l'info-bulle ; « En savoir plus » écarte maintenant une à une les causes voisines.
//
// Le bouton ou la ligne garde la clé de sa raison en attribut (`data-pp-bar-reason`, posé par `setDisabled` de js/floating-toolbars.js, `Caption.syncButton`, et par les lignes de js/keep-with-next.js, js/paragraph-format.js, js/text-direction.js,
// js/bullet-format.js, js/anchors.js, js/heading-styles.js) : rien à deviner à partir du texte de l'info-bulle, qui change de langue. Une clé inconnue
// ne donne rien (`forKey` rend null) : la bulle garde alors la phrase seule. Les noms (modèle lié, table et colonne d'une variable) passent par les jetons de js/lock-diagnostic.js.
//
//   LockBarCauses.forKey(key)   le constat { why?, checks, fix, context } de la raison `key`, ou null quand elle n'a pas de constat
//   LockBarCauses.keys()        les clés de raison qui ont un constat (barres du tableau et de l'image, lignes de menu que la place du curseur grise)
const LockBarCauses = (function () {
  const t = (key, vars) => I18n.t(key, vars);
  const { ok, no } = LockDiagnostic.checks;
  const { quote } = LockDiagnostic;
  const { tableName, columnName, templateName } = LockDiagnostic.tokens;
  const editorNow = () => EditorCore.getEditor();
  const trackedNow = () => Editor.isTrackChangesOn();
  const count = (n, unit) => t('lockBubble.bar.n.' + unit + (n === 1 ? 'One' : 'Many'), { n });
  const trackingFix = () => t('lockBubble.bar.fixTracking', { menu: quote(t('collab.tip')), row: quote(t('trackChanges.toggle.tip')) });

  // === Le tableau ===
  function tableState() {
    const editor = editorNow();
    const link = editor ? LinkedTable.status(editor.state) : null;
    return { editor, facts: editor ? TableMerge.facts(editor) : null, tracked: trackedNow(), grid: GridEditor.isActive(), link };
  }
  function tableRows(state) {
    const { facts, grid, tracked, link } = state;
    const rows = [[t('lockBubble.bar.ctx.tableKind'), grid ? t('lockBubble.bar.ctx.kindGrid') : link ? t('lockBubble.bar.ctx.kindLinked', { name: quote(templateName(link.name)) }) : t('lockBubble.bar.ctx.kindDocument')]];
    if (facts) {
      rows.push([t('lockBubble.bar.ctx.table'), t('lockBubble.bar.ctx.tableSize', { rows: facts.rows, cols: facts.cols })]);
      rows.push([t('lockBubble.bar.ctx.merged'), String(facts.merged)]);
      rows.push([t('lockBubble.bar.ctx.selection'), facts.chosen ? t('lockBubble.bar.ctx.chosen', { cells: count(facts.chosen, 'cell'), rows: facts.chosenRows, cols: facts.chosenCols }) : t('lockBubble.bar.ctx.cursorOnly')]);
    } else rows.push([t('lockBubble.bar.ctx.table'), t('lockBubble.bar.ctx.noTable')]);
    rows.push([t('lockBubble.bar.ctx.tracking'), t(tracked ? 'lockBubble.bar.ctx.on' : 'lockBubble.bar.ctx.off')]);
    return rows;
  }
  const inTable = state => (state.facts ? ok(t('lockBubble.bar.chk.inTable'), t('lockBubble.bar.chk.inTableNote', { rows: state.facts.rows, cols: state.facts.cols })) : no(t('lockBubble.bar.chk.noTable'), t('lockBubble.bar.chk.noTableNote')));
  const trackOffCheck = state => (state.tracked ? no(t('lockBubble.bar.chk.trackOn')) : ok(t('lockBubble.bar.chk.trackOff')));
  const oneCellOrMore = state => (state.facts && state.facts.chosen >= 2 ? ok(t('lockBubble.bar.chk.twoCells'), count(state.facts.chosen, 'cell')) : no(t('lockBubble.bar.chk.fewCells'), state.facts ? (state.facts.chosen ? count(state.facts.chosen, 'cell') : t('lockBubble.bar.chk.cursorOnly')) : ''));

  function equalize(kind) {
    return state => {
      const covered = state.facts ? (kind === 'row' ? state.facts.chosenRows : state.facts.chosenCols) : 0;
      const many = state.facts && state.facts.chosen > 1;
      return {
        checks: [inTable(state), no(t('lockBubble.bar.chk.fewLines.' + kind), t('lockBubble.bar.chk.fewLinesNote.' + kind, { n: many ? count(covered, kind) : t('lockBubble.bar.chk.noneChosen') }))],
        fix: t('lockBubble.bar.fix.drag.' + kind),
      };
    };
  }
  const loopedInSelection = facts => Array.from(facts.looped).filter(index => index >= facts.top && index < facts.bottom).map(index => index + 1);
  const MERGE = {
    'table.cellMergeNeedsCells': state => ({ checks: [inTable(state), oneCellOrMore(state)], fix: t('lockBubble.bar.fix.dragCells') }),
    'table.cellMergeOverlap': state => ({
      checks: [inTable(state), oneCellOrMore(state), trackOffCheck(state), no(t('lockBubble.bar.chk.overlap'), state.facts ? t('lockBubble.bar.chk.overlapNote', { merged: count(state.facts.merged, 'merged') }) : '')],
      fix: t('lockBubble.bar.fix.overlap'),
    }),
    'table.cellMergeLoop': state => ({
      checks: [inTable(state), oneCellOrMore(state), trackOffCheck(state), ok(t('lockBubble.bar.chk.rectangle')), no(t('lockBubble.bar.chk.loopRow'), state.facts ? t('lockBubble.bar.chk.loopRowNote', { n: loopedInSelection(state.facts).length, rows: loopedInSelection(state.facts).join(', ') }) : '')],
      fix: t('lockBubble.bar.fix.loopRow'),
    }),
    'table.cellMergePageBreak': state => ({
      checks: [inTable(state), oneCellOrMore(state), trackOffCheck(state), ok(t('lockBubble.bar.chk.rectangle')), no(t('lockBubble.bar.chk.pageBreak'), t('lockBubble.bar.chk.pageBreakNote'))],
      fix: t('lockBubble.bar.fix.pageBreak'),
    }),
    'table.cellSplitNeedsMerged': state => ({
      checks: [inTable(state), no(t('lockBubble.bar.chk.notMerged'), state.facts ? (state.facts.merged ? t('lockBubble.bar.chk.notMergedSome', { merged: count(state.facts.merged, 'merged') }) : t('lockBubble.bar.chk.notMergedNone')) : '')],
      fix: t('lockBubble.bar.fix.merged'),
    }),
    'table.cellTracked': state => ({ checks: [inTable(state), no(t('lockBubble.bar.chk.trackOn'), t('lockBubble.bar.chk.trackShape'))], fix: trackingFix() }),
  };

  const trackedSetting = note => state => ({ checks: [inTable(state), no(t('lockBubble.bar.chk.trackOn'), t(note))], fix: trackingFix() });
  const mergedAndTracked = kind => state => ({
    checks: [inTable(state), no(t('lockBubble.bar.chk.trackOn'), t('lockBubble.bar.chk.trackMerged.' + kind)), no(t('lockBubble.bar.chk.crossed.' + kind), t('lockBubble.bar.chk.crossedNote'))],
    fix: t('lockBubble.bar.fix.crossed'),
  });

  // « Répéter la ligne » : la ligne du curseur et ses variables, lues par js/variable-loop.js (diagnoseRow).
  function rowVariables() {
    const editor = editorNow();
    return editor ? VariableLoop.diagnoseRow(editor).variables : [];
  }
  function severalRows(state, reasonOne) {
    const facts = state.facts;
    return { checks: [inTable(state), no(t('lockBubble.bar.chk.severalRows'), facts ? t('lockBubble.bar.chk.severalRowsNote', { rows: count(facts.chosenRows, 'row') }) : '')], fix: t(reasonOne) };
  }
  const rowChecks = state => [inTable(state), ok(t('lockBubble.bar.chk.oneRow'))];
  const REPEAT = {
    'table.rowRepeatOne': state => severalRows(state, 'lockBubble.bar.fix.oneRow'),
    'table.rowRepeatMerged': state => ({ checks: rowChecks(state).concat(no(t('lockBubble.bar.chk.rowMerged'), t('lockBubble.bar.chk.rowMergedNote'))), fix: t('lockBubble.bar.fix.rowMerged') }),
    'table.rowRepeatNone': state => ({ checks: rowChecks(state).concat(ok(t('lockBubble.bar.chk.rowNotMerged')), no(t('lockBubble.bar.chk.rowNoVariable'), t('lockBubble.bar.chk.rowNoVariableNote'))), fix: t('lockBubble.bar.fix.rowNoVariable') }),
    'table.rowRepeatNoSource': state => {
      const variables = rowVariables();
      const list = variables.map(variable => {
        const path = tableName(variable.table) + '.' + columnName(variable.column);
        const why = variable.problem ? t('lockBubble.bar.row.problem') : !variable.repeats ? t('lockBubble.bar.row.notRow') : t('lockBubble.bar.row.noSource', { within: quote(tableName(variable.within)) });
        return path + ' (' + why + ')';
      }).join(' ; ');
      return {
        checks: rowChecks(state).concat(ok(t('lockBubble.bar.chk.rowNotMerged')), ok(t('lockBubble.bar.chk.rowHasVariables'), count(variables.length, 'variable')), no(t('lockBubble.bar.chk.rowNoSource'), list)),
        fix: t('lockBubble.bar.fix.rowNoSource'),
      };
    },
    'table.pivotOne': state => severalRows(state, 'lockBubble.bar.fix.oneRow'),
    'table.pivotMerged': state => ({ checks: rowChecks(state).concat(no(t('lockBubble.bar.chk.rowMerged'), t('lockBubble.bar.chk.rowMergedNote'))), fix: t('lockBubble.bar.fix.rowMerged') }),
    'table.pivotDocument': state => ({ checks: [inTable(state), no(t('lockBubble.bar.chk.documentTable'), t('lockBubble.bar.chk.pivotGridOnly'))], fix: t('lockBubble.bar.fix.pivotGrid') }),
  };

  const LINKED = {
    'linkedTable.lockedTracked': state => ({
      why: t('linkedTable.lockedTracked', { name: templateName(state.link ? state.link.name : '') }),
      checks: [no(t('lockBubble.bar.chk.linkedLocked'), t('lockBubble.bar.chk.linkedNote', { name: quote(templateName(state.link ? state.link.name : '')) })), no(t('lockBubble.bar.chk.trackOn'), t('lockBubble.bar.chk.trackLinked'))],
      fix: trackingFix(),
    }),
    'linkedTable.lockedLive': state => ({
      why: t('linkedTable.lockedLive', { name: templateName(state.link ? state.link.name : '') }),
      checks: [no(t('lockBubble.bar.chk.linkedLocked'), t('lockBubble.bar.chk.linkedNote', { name: quote(templateName(state.link ? state.link.name : '')) })), trackOffCheck(state), no(t('lockBubble.bar.chk.liveOn'), t('lockBubble.bar.chk.liveNote'))],
      fix: t('lockBubble.bar.fix.live', { stop: quote(t('live.bar.stop')) }),
    }),
  };

  const TABLE = Object.assign({
    'table.rowsEqualizeNeed': equalize('row'),
    'table.colsEqualizeNeed': equalize('col'),
    'table.settingTracked': trackedSetting('lockBubble.bar.chk.trackSetting'),
    'table.colDelMerged': mergedAndTracked('col'),
    'table.rowDelMerged': mergedAndTracked('row'),
    'caption.gridLocked': state => ({ checks: [inTable(state), no(t('lockBubble.bar.chk.gridTable'), t('lockBubble.bar.chk.gridCaption'))], fix: t('lockBubble.bar.fix.gridCaption') }),
  }, MERGE, REPEAT, LINKED);

  // === Le curseur : les lignes de menu que la place de la sélection grise ===
  const CONTAINERS = { tableCell: 'cell', tableHeader: 'cell', bulletList: 'bullet', orderedList: 'ordered', taskList: 'task', callout: 'callout', blockquote: 'quote', twoColumnsColumn: 'column' };
  function placeNow() {
    const editor = editorNow();
    if (!editor) return { kind: 'none', containers: [] };
    if (HeaderFooterPreview.getHfMode()) return { kind: 'headerFooter', containers: [] };
    const selection = editor.state.selection;
    if (selection.node) return { kind: selection.node.type.name === 'editorImage' ? 'image' : selection.node.type.name === 'table' ? 'table' : 'object', containers: [] };
    const $from = selection.$from;
    const containers = [];
    for (let depth = 1; depth < $from.depth; depth++) {
      const kind = CONTAINERS[$from.node(depth).type.name];
      if (kind && containers.indexOf(kind) === -1) containers.push(kind);
    }
    const block = $from.parent;
    const kind = block.type.name === 'heading' ? 'heading' : block.type.name === 'paragraph' ? (block.attrs.caption ? 'caption' : 'paragraph') : 'none';
    return { kind, level: block.attrs && block.attrs.level, containers, bullet: editor.isActive('bulletList') };
  }
  function placeText(place) {
    const block = t('lockBubble.bar.place.' + place.kind, { level: place.level });
    return place.containers.length ? t('lockBubble.bar.place.inside', { block, containers: place.containers.map(kind => t('lockBubble.bar.place.' + kind)).join(', ') }) : block;
  }
  const outOfHeaderFooter = place => (place.kind === 'headerFooter' ? no(t('lockBubble.bar.chk.hfEditing'), t('lockBubble.bar.chk.hfEditingNote')) : ok(t('lockBubble.bar.chk.noHeaderFooter')));
  function placeFinding(titleKey, fixKey) {
    return place => ({
      checks: [outOfHeaderFooter(place), no(t(titleKey), t('lockBubble.bar.chk.cursorIn', { place: placeText(place) }))],
      fix: t(place.kind === 'headerFooter' ? 'lockBubble.bar.fix.leaveHeaderFooter' : fixKey),
    });
  }
  const headingLevelFinding = (noStyleKey, fixKey) => place => ({
    checks: [place.kind === 'heading' ? ok(t('lockBubble.bar.chk.inHeading', { level: place.level })) : no(t('lockBubble.bar.chk.notOneHeading'), t('lockBubble.bar.chk.cursorIn', { place: placeText(place) })), no(t(noStyleKey, { level: place.level || '' }))],
    fix: t(fixKey),
  });
  const PLACE = {
    'keepNext.notHere': placeFinding('lockBubble.bar.chk.noParagraph', 'lockBubble.bar.fix.place.paragraph'),
    'paragraphFormat.notHere': placeFinding('lockBubble.bar.chk.noParagraph', 'lockBubble.bar.fix.place.paragraph'),
    'textDirection.notHere': placeFinding('lockBubble.bar.chk.noText', 'lockBubble.bar.fix.place.text'),
    'bulletFormat.notHere': place => ({ checks: [no(t('lockBubble.bar.chk.notBullet'), t('lockBubble.bar.chk.cursorIn', { place: placeText(place) }))], fix: t('lockBubble.bar.fix.place.bullet') }),
    'bookmark.notHere': placeFinding('lockBubble.bar.chk.notFirstLevel', 'lockBubble.bar.fix.place.bookmark'),
    'headingStyle.notHere': placeFinding('lockBubble.bar.chk.notOneHeading', 'lockBubble.bar.fix.place.heading'),
    'headingStyle.none': headingLevelFinding('lockBubble.bar.chk.noOwnStyle', 'lockBubble.bar.fix.headingOwn'),
    'headingStyle.document.none': headingLevelFinding('lockBubble.bar.chk.noSharedStyle', 'lockBubble.bar.fix.headingShared'),
  };

  // === Les boutons grisés « doux » (js/lock-reasons.js, cause `state`) : Retrait, Tout accepter, ★, Par défaut des raccourcis, Page ===
  // Le genre de leur cause porte la clé de la raison ; ces constats n'ont pas de place à lire dans le texte seul, leurs lignes disent ce que le bouton attend.
  function listFacts() {
    const place = placeNow();
    const editor = editorNow();
    let first = false;
    let inList = false;
    if (editor && place.kind !== 'none' && place.kind !== 'headerFooter') {
      const $from = editor.state.selection.$from;
      for (let depth = $from.depth; depth > 0 && !inList; depth--) {
        const name = $from.node(depth).type.name;
        if (name === 'listItem' || name === 'taskItem') { inList = true; first = $from.index(depth - 1) === 0; }
      }
    }
    return { place, inList, first };
  }
  const listRows = facts => [[t('lockBubble.bar.ctx.place'), placeText(facts.place)]];
  function pendingFacts() {
    return { tracking: Editor.isTrackChangesOn() };
  }
  function templateFacts() {
    const id = Templates.getCurrentId();
    const record = Templates.byId ? Templates.byId(id) : null;
    const type = record && record.typeModele ? record.typeModele : 'document';
    return { id, type };
  }
  const STATE = {
    'lock.indent': () => {
      const facts = listFacts();
      return {
        checks: facts.inList
          ? [ok(t('lockBubble.bar.chk.inListItem')), no(t(facts.first ? 'lockBubble.bar.chk.firstItem' : 'lockBubble.bar.chk.cannotSink'), t(facts.first ? 'lockBubble.bar.chk.firstItemNote' : 'lockBubble.bar.chk.cannotSinkNote'))]
          : [no(t('lockBubble.bar.chk.notInList'), t('lockBubble.bar.chk.cursorIn', { place: placeText(facts.place) }))],
        fix: t('lockBubble.bar.fix.indent'),
        rows: listRows(facts),
      };
    },
    'lock.outdent': () => {
      const facts = listFacts();
      return {
        checks: facts.inList ? [ok(t('lockBubble.bar.chk.inListItem')), no(t('lockBubble.bar.chk.cannotLift'), t('lockBubble.bar.chk.cannotLiftNote'))] : [no(t('lockBubble.bar.chk.notInList'), t('lockBubble.bar.chk.cursorIn', { place: placeText(facts.place) }))],
        fix: t('lockBubble.bar.fix.outdent'),
        rows: listRows(facts),
      };
    },
    'lock.noPending': () => {
      const facts = pendingFacts();
      return {
        checks: [facts.tracking ? ok(t('lockBubble.bar.chk.trackOn')) : no(t('lockBubble.bar.chk.trackOff'), t('lockBubble.bar.chk.trackOffNote')), no(t('lockBubble.bar.chk.nothingPending'), t('lockBubble.bar.chk.nothingPendingNote'))],
        fix: t('lockBubble.bar.fix.pending'),
        rows: [[t('lockBubble.bar.ctx.tracking'), t(facts.tracking ? 'lockBubble.bar.ctx.on' : 'lockBubble.bar.ctx.off')]],
      };
    },
    'lock.defaultNone': () => ({ checks: [no(t('lockBubble.bar.chk.noTemplate'), t('lockBubble.bar.chk.noTemplateNote'))], fix: t('lockBubble.bar.fix.defaultNone'), rows: [[t('lockBubble.bar.ctx.template'), t('lockBubble.bar.ctx.none')]] }),
    'lock.defaultType': () => {
      const facts = templateFacts();
      const type = I18n.has('lockBubble.type.' + facts.type) ? t('lockBubble.type.' + facts.type) : t('lockBubble.bar.type.other');
      return { checks: [no(t('lockBubble.bar.chk.templateType', { type }), t('lockBubble.bar.chk.templateTypeNote'))], fix: t('lockBubble.bar.fix.defaultType'), rows: [[t('lockBubble.bar.ctx.template'), t('lockBubble.bar.ctx.typeOf', { type })]] };
    },
    'lock.keyDefault': () => ({ checks: [no(t('lockBubble.bar.chk.keyIsOriginal'), t('lockBubble.bar.chk.keyIsOriginalNote'))], fix: t('lockBubble.bar.fix.keyDefault'), rows: [] }),
    'lock.keysAllDefault': () => ({ checks: [no(t('lockBubble.bar.chk.noKeyChanged'), t('lockBubble.bar.chk.noKeyChangedNote'))], fix: t('lockBubble.bar.fix.keysAllDefault'), rows: [] }),
    'lock.pageBusy': () => ({ checks: [no(t('lockBubble.bar.chk.exportRunning'), t('lockBubble.bar.chk.exportRunningNote'))], fix: t('lockBubble.bar.fix.pageBusy'), rows: [] }),
    'lock.pageDocHf': () => ({ checks: [no(t('lockBubble.bar.chk.hfEditing'), t('lockBubble.bar.chk.pagesTurnedNote'))], fix: t('lockBubble.bar.fix.pageDocHf'), rows: [] }),
  };

  // === L'image ===
  function imageState() {
    const editor = editorNow();
    const node = editor && editor.state.selection.node;
    const attrs = node && node.type && node.type.name === 'editorImage' ? node.attrs : null;
    const toggle = document.getElementById('v2-toggle-a4-preview');
    return { attrs, hf: !!HeaderFooterPreview.getHfMode(), grid: GridEditor.isActive(), a4: !!toggle && toggle.checked };
  }
  function sourceOf(attrs) {
    if (!attrs) return 'none';
    if (attrs.varTable) return 'column';
    if (attrs.qrText) return 'qr';
    if (attrs.chartSection || attrs.chartSpec) return 'chart';
    if (attrs.video) return 'video';
    if (!attrs.src) return 'none';
    if (/^data:image\/svg/i.test(attrs.src)) return 'svg';
    return /^data:image\//i.test(attrs.src) ? 'pasted' : 'web';
  }
  const layerText = attrs => t(attrs && attrs.layer === 'front' ? 'imgToolbar.front' : attrs && attrs.layer === 'behind' ? 'imgToolbar.behind' : 'imgToolbar.inText');
  function imageRows(state) {
    const { attrs } = state;
    const rows = [[t('lockBubble.bar.ctx.imageSource'), t('lockBubble.bar.src.' + sourceOf(attrs))]];
    if (attrs && attrs.varTable) rows.push([t('lockBubble.bar.ctx.imageColumn'), tableName(attrs.varTable) + '.' + columnName(attrs.varColumn || '?')]);
    if (attrs) {
      rows.push([t('lockBubble.bar.ctx.imageLayer'), layerText(attrs)]);
      rows.push([t('lockBubble.bar.ctx.imageAlign'), attrs.align ? t('lockBubble.bar.align.' + attrs.align) : t('lockBubble.bar.align.none')]);
    }
    rows.push([t('lockBubble.bar.ctx.preview'), t(state.a4 ? 'lockBubble.bar.ctx.on' : 'lockBubble.bar.ctx.off')]);
    return rows;
  }
  const notColumn = state => ({
    checks: [no(t('lockBubble.bar.chk.notColumn'), t('lockBubble.bar.chk.notColumnNote', { source: t('lockBubble.bar.src.' + sourceOf(state.attrs)) }))],
    fix: t('lockBubble.bar.fix.notColumn'),
  });
  const notPicture = state => ({ checks: [no(t('lockBubble.bar.chk.notPicture'), t('lockBubble.bar.chk.notPictureNote', { source: t('lockBubble.bar.src.' + sourceOf(state.attrs)) }))], fix: t('lockBubble.bar.fix.notPicture') });
  function wrapChecks(state) {
    const attrs = state.attrs || {};
    const overlay = !!attrs.layer && attrs.layer !== 'normal';
    const aligned = !!attrs.align;
    const checks = [overlay ? no(t('lockBubble.bar.chk.overlay'), layerText(attrs)) : ok(t('lockBubble.bar.chk.inFlow'))];
    if (aligned) checks.push(no(t('lockBubble.bar.chk.aligned'), t('lockBubble.bar.align.' + attrs.align)));
    else checks.push(ok(t('lockBubble.bar.chk.notAligned')));
    if (!overlay && !aligned) checks.push(no(t('lockBubble.bar.chk.alone'), t('lockBubble.bar.chk.aloneNote')));
    return { checks, fix: t(overlay ? 'lockBubble.bar.fix.wrapOverlay' : aligned ? 'lockBubble.bar.fix.wrapAligned' : 'lockBubble.bar.fix.wrapAlone') };
  }
  function repeatBehind(state) {
    const attrs = state.attrs || {};
    const checks = [attrs.layer === 'behind' ? ok(t('lockBubble.bar.chk.behind')) : no(t('lockBubble.bar.chk.notBehind'), layerText(attrs))];
    if (state.hf) checks.push(no(t('lockBubble.bar.chk.hfMode'), t('lockBubble.bar.chk.hfModeNote')));
    if (state.grid) checks.push(no(t('lockBubble.bar.chk.gridMode'), t('lockBubble.bar.chk.gridModeNote')));
    return { checks, fix: t(state.hf || state.grid ? 'lockBubble.bar.fix.repeatOutside' : 'lockBubble.bar.fix.repeatBehind') };
  }
  const IMAGE = {
    'imgToolbar.conditionNeedsColumn': notColumn,
    'imgToolbar.loopNeedsColumn': notColumn,
    'imgToolbar.reshapeNeedsPicture': notPicture,
    'imgToolbar.reshapeVector': () => ({ checks: [no(t('lockBubble.bar.chk.vector'), t('lockBubble.bar.chk.vectorNote'))], fix: t('lockBubble.bar.fix.vector') }),
    'imgToolbar.reshapeExternal': () => ({ checks: [no(t('lockBubble.bar.chk.external'), t('lockBubble.bar.chk.externalNote'))], fix: t('lockBubble.bar.fix.external') }),
    'imgToolbar.wrapNeedsText': wrapChecks,
    'imgToolbar.repeatNeedsBehind': repeatBehind,
    'imgToolbar.repeatNeedsPage': state => ({
      checks: [ok(t('lockBubble.bar.chk.behind')), no(t('lockBubble.bar.chk.previewOff'), t('lockBubble.bar.chk.previewOffNote'))],
      fix: t('lockBubble.bar.fix.preview', { preview: quote(t('toolbar.a4.tip', { format: 'A4' })) }),
    }),
    'caption.imageLayer': state => ({ checks: [no(t('lockBubble.bar.chk.overlay'), layerText(state.attrs)), no(t('lockBubble.bar.chk.captionLayer'), t('lockBubble.bar.chk.captionLayerNote'))], fix: t('lockBubble.bar.fix.wrapOverlay') }),
    'caption.imageFloat': state => ({ checks: [ok(t('lockBubble.bar.chk.inFlow')), no(t('lockBubble.bar.chk.aligned'), state.attrs && state.attrs.align ? t('lockBubble.bar.align.' + state.attrs.align) : ''), no(t('lockBubble.bar.chk.captionFloat'), t('lockBubble.bar.chk.captionFloatNote'))], fix: t('lockBubble.bar.fix.wrapAligned') }),
  };

  // Le constat de la raison `key` du bouton grisé, ou null quand cette raison n'en a pas (la bulle garde la phrase de l'info-bulle).
  function forKey(key) {
    const imageBuilder = IMAGE[key];
    const tableBuilder = TABLE[key];
    const placeBuilder = PLACE[key];
    const stateBuilder = STATE[key];
    if (!imageBuilder && !tableBuilder && !placeBuilder && !stateBuilder) return null;
    const state = imageBuilder ? imageState() : placeBuilder ? placeNow() : stateBuilder ? null : tableState();
    const found = (imageBuilder || tableBuilder || placeBuilder || stateBuilder)(state);
    const rows = stateBuilder ? found.rows : imageBuilder ? imageRows(state) : placeBuilder ? [[t('lockBubble.bar.ctx.place'), placeText(state)]] : tableRows(state);
    return Object.assign({ why: found.why }, { checks: found.checks, fix: found.fix, context: LockDiagnostic.context({ rows }, '') });
  }

  return { forKey, keys: () => Object.keys(TABLE).concat(Object.keys(IMAGE), Object.keys(PLACE), Object.keys(STATE)) };
})();
