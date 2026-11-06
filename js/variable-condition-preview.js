// Fenêtre « Condition d'affichage », l'aperçu en direct : la condition pour la ligne sélectionnée dans Grist, puis le compte des lignes de la table de la page qui la remplissent.
// `create(ctx)` : les gestes d'UNE fenêtre, qui lisent et posent son état par `ctx` (js/variable-condition.js:createWindow). Façade : js/variable-condition.js.
const VariableConditionPreview = (function () {
  const { setLine, shorten } = VariableModal;

  // === Aperçu === Même évaluation que le mode Lecture (ConditionRules.conditionHolds) : d'abord la ligne sélectionnée dans Grist, puis toutes les
  // lignes de la table de la page, chaque table n'étant lue qu'une fois (LoopRules.createContext : sinon chaque ligne relirait chaque table liée).
  // `shown` : la bulle à lire ({ table, column, format, before, after }), celle que la fenêtre règle (`shownMain`).
  async function displayValue(record, tableId, shown) {
    const { table, column, format } = shown;
    if (GristAPI.getColumnType(table, column) === 'Attachments') return I18n.t('varCond.debug.imageValue');
    const value = await Variables.resolveVariable(table, column, tableId, record, format);
    // Avec son texte « Avant » / « Après » comme la Lecture l'écrira ; une valeur vide n'en reçoit pas.
    return value === '' ? I18n.t('varCond.debug.emptyValue') : VariableFormat.withAffixes(value, VariableFormat.affixes(shown.before, shown.after));
  }

  // Repère lisible de la première ligne trouvée : le texte de la première colonne de la table, s'il y en a un (un identifiant de ligne seul ne se
  // voit pas dans Grist).
  function rowLabel(row, tableId) {
    const firstCol = GristAPI.getColumns(tableId)[0];
    const value = firstCol ? row[firstCol] : null;
    return typeof value !== 'string' || !value.trim() ? '' : ' (' + shorten(value.trim(), 40) + ')';
  }

  // Combien de lignes remplissent la condition, et la première. Rend null quand la fenêtre a changé pendant le parcours.
  async function countHolding(condition, tableId, rows, fetchRows, stale) {
    let count = 0;
    let first = null;
    for (let i = 0; i < rows.length; i++) {
      if (await ConditionRules.conditionHolds(condition, tableId, rows[i], { fetchRows })) {
        count += 1;
        if (!first) first = rows[i];
      }
      // Rend la main au navigateur de temps en temps sur une grande table, et abandonne si la condition a changé entre-temps.
      if (i % 250 === 249) { await new Promise(r => setTimeout(r, 0)); if (stale()) return null; }
    }
    return { count, first };
  }

  function create(ctx) {
    // La bulle telle que la fenêtre la règle : sa variable, son format et son texte « Avant » / « Après » du moment (pas ceux du nœud, qui ne bougent
    // qu'à « Enregistrer »).
    function shownMain() {
      const { table, column, format } = ctx.state.node.attrs;
      const around = ctx.draftAffixes();
      return { table, column, format, before: around && around.before, after: around && around.after };
    }

    // Ce que le sinon écrit pour la ligne `record` : ses lignes, séparées par « / ». Ses variables sont lues comme le document les lira
    // (ReaderMode.preview : formats, « Avant » / « Après », condition). Un sinon sans variable ni puce n'a rien à lire : son texte, tout de suite.
    async function typedOtherwiseText(typed, tableId, record) {
      const lines = ctx.textField().kind.multiline ? ConditionalText.otherwiseItems(typed) : [ConditionalText.otherwiseValueItems(typed)];
      if (lines.every(items => items.every(FieldCodec.isText))) return lines.map(FieldCodec.serializePlain).join(' / ');
      const resolved = Dom.inertTemplate(await ReaderMode.preview(lines.map(items => '<p>' + FieldCodec.itemsHtml(items) + '</p>').join(''), tableId, record)).content;
      return Array.from(resolved.children).map(paragraph => paragraph.textContent).join(' / ');
    }

    // Première ligne de l'aperçu : la condition pour la ligne sélectionnée dans Grist - ou, sans condition mais avec du texte « Avant » / « Après », ce que
    // la variable écrit, toujours. Rend faux quand la fenêtre a changé pendant le calcul.
    async function previewSelectedRow({ condition, tableId, t, stale, currentLine }, record) {
      const holds = await ConditionRules.conditionHolds(condition, tableId, record);
      // Condition non remplie : ce que le sinon réglé dans la fenêtre écrit à la place, quand il y en a un - le texte et les variables d'une bulle ou d'une valeur, les
      // paragraphes d'un bloc (ses lignes, séparées par « / »).
      const typed = !holds && condition ? ctx.draftOtherwiseText() : null;
      let shown = '';
      if (ctx.showsValue() && holds) shown = await displayValue(record, tableId, shownMain());
      else if (typed) shown = shorten(await typedOtherwiseText(typed, tableId, record), 80);
      if (stale()) return false;
      const key = !condition ? 'varCond.debug.currentShown' : (holds ? t.met : (typed ? t.notMetOtherwise : t.notMet));
      setLine(currentLine, I18n.t(key, { id: record.id, value: shown }), holds || !!typed);
      return true;
    }

    // Seconde ligne de l'aperçu : toutes les lignes de la table de la page, leur nombre et ce que donne la première.
    async function previewAllRows({ condition, tableId, t, stale, countLine }) {
      const { fetchRows } = LoopRules.createContext();
      const rows = await fetchRows(tableId);
      if (stale()) return;
      if (!rows.length) { setLine(countLine, I18n.t('linkConfig.previewTableEmpty', { table: tableId }), false); return; }
      const found = await countHolding(condition, tableId, rows, fetchRows, stale);
      if (!found || stale()) return;
      const { count, first } = found;
      // Avec un sinon réglé, les lignes qui ne remplissent pas la condition ne sont plus masquées : la phrase dit qu'elles affichent le sinon.
      const withOtherwise = !!ctx.draftOtherwiseText();
      if (!count) { setLine(countLine, I18n.t(withOtherwise ? 'varCond.debug.noneOtherwise' : 'varCond.debug.none', { table: tableId, total: rows.length }), false); return; }
      const firstValue = ctx.showsValue() ? await displayValue(first, tableId, shownMain()) : '';
      if (stale()) return;
      const others = rows.length - count;
      const countKey = withOtherwise && others > 0 ? 'varCond.debug.countOtherwise' : 'varCond.debug.count';
      setLine(countLine, I18n.t(countKey, { table: tableId, count, total: rows.length, others }) + ' '
        + I18n.t(t.first, { id: first.id, label: rowLabel(first, tableId), value: firstValue }), false);
    }

    async function updatePreview() {
      if (!ctx.state || !ctx.refs) return;
      ctx.syncClipboardButtons();
      ctx.syncOtherwiseRow();
      const outdated = ctx.previewRun.begin();
      const stale = () => outdated() || !ctx.state;
      const { currentLine, countLine } = ctx.refs;
      const condition = ConditionRules.normalizeCondition(ctx.state.working);
      const tableId = GristAPI.getCurrentTableId();
      const record = GristAPI.getCurrentRecord();
      const view = { condition, tableId, t: ctx.texts(), stale, currentLine, countLine };
      setLine(countLine, '', false);
      // Sans condition mais avec du texte « Avant » / « Après » : la variable s'affiche toujours, il n'y a pas de lignes à compter.
      const alwaysShown = !condition && !!ctx.draftAffixes();
      if (!condition && !alwaysShown) { setLine(currentLine, I18n.t('varCond.debug.chooseColumn'), false); return; }
      if (!record || !tableId) { setLine(currentLine, I18n.t('varCond.debug.noRecord'), false); return; }
      setLine(currentLine, I18n.t('varCond.debug.computing'), false);
      try {
        if ((await previewSelectedRow(view, record)) && !alwaysShown) await previewAllRows(view);
      } catch (e) {
        console.warn('[VariableCondition] aperçu indisponible', e);
        if (!stale()) setLine(currentLine, I18n.t('linkConfig.previewUnavailable'), false);
      }
    }

    return { updatePreview };
  }

  return { create };
})();
