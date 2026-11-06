// Fenêtre « Condition d'affichage », les lignes de règles : leur tracé (ConditionFields), le lien de la table de chaque colonne et le retracé qui relance l'aperçu. `create(ctx)` :
// les gestes d'UNE fenêtre, qui lisent et posent son état par `ctx` (js/variable-condition.js:createWindow). Façade : js/variable-condition.js.
const VariableConditionRules = (function () {
  const { button, el } = Dom;

  function create(ctx) {
    // « ligne d'Annuaire trouvée via Dossiers.Responsable · Modifier le lien » sous une règle portant sur une autre table déjà liée.
    function updateLinkHint(hint, table) {
      hint.replaceChildren();
      const currentTableId = GristAPI.getCurrentTableId();
      const rule = (table && table !== currentTableId) ? GristAPI.getLinkRule(table) : null;
      hint.hidden = !rule;
      if (!rule) return;
      const text = rule.mode === 'singleton'
        ? I18n.t('varCond.linkHint.singleton', { table })
        : I18n.t('varCond.linkHint.match', { table, via: Variables.describeLinkVia(table, rule, currentTableId) });
      const editBtn = button(null, I18n.t('varCond.linkHint.edit'));
      editBtn.addEventListener('click', async () => {
        if (await Variables.editLinkRule(table)) redraw();
      });
      hint.append(document.createTextNode(text + ' · '), editBtn);
    }

    function redraw() {
      if (!ctx.state) return;
      renderRules();
      ctx.syncOtherwiseRow();
      ctx.previewRun.schedule();
    }

    // La ligne d'une règle de la fenêtre : les options de la condition d'une variable (toutes les tables, « autre colonne », « Autres attributs »), avec sous la
    // règle le lien de la table de sa colonne, et celui de l'autre colonne quand la règle en compare une (bouton « autre colonne »). `row` : ce que
    // ConditionFields.renderItems donne (index, mode, onMode, onRemove, inGroup).
    function buildRuleRow(rule, row) {
      const linkHint = el('span', 'var-condition-link-hint');
      linkHint.hidden = true;
      const valueLinkHint = el('span', 'var-condition-link-hint');
      valueLinkHint.hidden = true;
      return ConditionFields.buildRuleRow(rule, row.index, Object.assign({}, row, {
        options: {
          allTables: true,
          compareColumn: true,
          attributesWindow: true,
          onColumnChosen: ref => ConditionFields.ensureTableLinked(ref, redraw, ctx.state ? VariableLoop.loopTablesAt(ctx.state.editor.state, ctx.state.pos) : null),
          onColumnResolved: table => updateLinkHint(linkHint, table),
          onValueColumnResolved: table => updateLinkHint(valueLinkHint, table),
        },
        extra: [linkHint, valueLinkHint],
      }));
    }

    function renderRules() {
      if (!ctx.state || !ctx.refs) return;
      const { rulesBox, modeRow, modeSelect, clip } = ctx.refs;
      const { rules, mode } = ctx.state.working;
      // Les règles et les groupes comptent chacun pour un élément : « toutes / au moins une » ne dit rien d'un seul.
      modeRow.hidden = rules.length < 2;
      modeSelect.value = mode;
      // Le groupe Copier / Coller est retiré puis replacé à chaque tracé : un de ses boutons qui avait le focus (Coller au clavier) le perdrait sans
      // ça.
      const clipFocus = clip.contains(document.activeElement) ? document.activeElement : null;
      rulesBox.replaceChildren();
      ConditionFields.renderItems(rulesBox, {
        items: rules,
        mode,
        // « Et » / « Ou » devant une ligne est un bouton : un clic relie toutes les lignes du niveau par l'autre mot ; pour la condition entière, la liste
        // « toutes / au moins une » du haut suit.
        setMode: next => { if (ctx.state) ctx.state.working.mode = next; },
        buildRow: buildRuleRow,
        removeItem: index => {
          rules.splice(index, 1);
          if (!rules.length) rules.push(ConditionFields.emptyRule());
          redraw();
        },
        redraw,
      });
      // Copier / Coller portent sur l'ensemble des règles : sur la même ligne que « + Ajouter une condition » et « + Groupe », à droite, sans hauteur en plus dans un
      // panneau bas.
      const foot = el('div', 'var-condition-foot');
      foot.append(ConditionFields.buildAddRuleButton(rulesBox, rules, redraw), ConditionFields.buildAddGroupButton(rulesBox, rules, () => ctx.state.working.mode, redraw), clip);
      rulesBox.appendChild(foot);
      if (clipFocus) clipFocus.focus();
      ctx.syncClipboardButtons();
    }

    return { redraw, renderRules };
  }

  return { create };
})();
