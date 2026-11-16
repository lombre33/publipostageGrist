// Le constat d'une icône grisée des barres flottantes du tableau et de l'image : pourquoi CE bouton est grisé, lu sur le tableau ou l'image qui porte la sélection (sa taille, ses cases fusionnées, les cases choisies, le suivi des modifications,
// la source et le calque de l'image), avec le geste pour le dégriser. Demande du 12/11 (lot 2) : la bulle de js/lock-bubble.js disait déjà la phrase de l'info-bulle ; « En savoir plus » écarte maintenant une à une les causes voisines.
//
// Le bouton garde la clé de sa raison en attribut (`data-pp-bar-reason`, posé par `setDisabled` de js/floating-toolbars.js, `Caption.syncButton`) : rien à deviner à partir du texte de l'info-bulle, qui change de langue. Une clé inconnue
// ne donne rien (`forKey` rend null) : la bulle garde alors la phrase seule. Les noms (modèle lié, table et colonne d'une variable) passent par les jetons de js/lock-diagnostic.js.
//
//   LockBarCauses.forKey(key)   le constat { why?, checks, fix, context } de la raison `key`, ou null quand elle n'a pas de constat
//   LockBarCauses.keys()        les clés de raison qui ont un constat
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
    if (!imageBuilder && !tableBuilder) return null;
    const state = imageBuilder ? imageState() : tableState();
    const found = (imageBuilder || tableBuilder)(state);
    return Object.assign({ why: found.why }, { checks: found.checks, fix: found.fix, context: LockDiagnostic.context({ rows: imageBuilder ? imageRows(state) : tableRows(state) }, '') });
  }

  return { forKey, keys: () => Object.keys(TABLE).concat(Object.keys(IMAGE)) };
})();
