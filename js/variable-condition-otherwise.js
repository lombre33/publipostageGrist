// Fenêtre « Condition d'affichage », la ligne « Sinon afficher » : les champs à variables (un par genre de nœud), leur montage, leur état grisé et le texte tel qu'il est tapé.
// `create(ctx)` : les gestes d'UNE fenêtre, qui lisent et posent son état par `ctx` (js/variable-condition.js:createWindow). Façade : js/variable-condition.js.
const VariableConditionOtherwise = (function () {
  const { el } = Dom;

  function create(ctx) {
    // Le texte du sinon se tape sous l'aperçu : quand celui-ci prend une ligne de plus, le champ qui a le focus est repoussé sous le bord visible de
    // la fenêtre (son corps défile) ; une fois l'aperçu tracé, on le ramène.
    function keepTypedFieldInView() {
      const free = textField();
      if (free && free.input.contains(document.activeElement)) free.input.scrollIntoView({ block: 'nearest' });
    }

    // Les champs du sinon du nœud de la fenêtre (TEXT_OTHERWISE : sa ligne, son étiquette, son champ et ses réglages), ou null : une case n'en a pas.
    const textField = () => (ctx.state && ctx.refs ? ctx.refs.textOtherwise[ctx.state.node.type.name] || null : null);

    // Le sinon tel qu'il est tapé dans la fenêtre (la valeur enregistrée du champ), ou null : sans texte ni variable (que des espaces et des lignes vides n'en font pas un) ou fenêtre
    // fermée.
    const draftOtherwiseText = () => { const free = textField(); return free ? ConditionalText.otherwiseText(free.input.value) : null; };

    // La ligne « Sinon afficher » (TEXT_OTHERWISE) : l'étiquette puis un champ à variables, dans la grille de celle de « Avant » / « Après ». Le champ est dans un conteneur dont
    // l'info-bulle - le grisé dit pourquoi - passe à travers lui quand il est grisé. L'élément `input` n'est qu'un <div> : le champ y est monté par `mountTextFields`
    // (FieldEditor.attach), qui lui rend la valeur, l'indication, le grisé et la limite d'un <input>.
    function buildOtherwiseTextFields(kind) {
      const label = el('label');
      label.id = kind.id + ctx.suffix + '-label';
      label.htmlFor = kind.id + ctx.suffix;
      const input = el('div', kind.input);
      input.id = kind.id + ctx.suffix;
      input.setAttribute('aria-labelledby', label.id);
      input.spellcheck = false;
      const field = el('div', 'var-condition-otherwise-field');
      field.appendChild(input);
      const row = el('div', 'var-condition-affix ' + kind.row);
      row.append(label, field);
      return { kind, row, label, field, input, mounted: false };
    }

    // Monte les champs du sinon d'une bulle, d'une valeur et d'un bloc : à la première ouverture, quand les classes de TipTap sont chargées (le document dont la fenêtre règle un
    // nœud a déjà chargé l'éditeur). Chaque champ lit le contexte de répétition du nœud réglé (VariableLoop.setContext) : ses variables s'écrivent à la place du nœud, dans la même
    // zone répétée, et y lisent la ligne du tour.
    function mountTextFields() {
      const libs = Editor.loadedLibraries();
      if (!libs) return;
      Object.values(ctx.refs.textOtherwise).forEach(free => {
        if (free.mounted) return;
        const editor = FieldEditor.attach(free.input, libs, {
          hostWindow: 'condition', windowEl: ctx.win.overlay, multiline: free.kind.multiline, keepSpaces: free.kind.keepSpaces, limit: free.kind.max,
        });
        VariableLoop.setContext(editor.schema, () => (ctx.state ? VariableLoop.zonesAt(ctx.state.editor.state, ctx.state.pos) : []));
        free.mounted = true;
      });
    }

    // === Sinon afficher === L'état de la ligne : son champ est grisé tant qu'aucune règle n'est complète (jamais retiré : l'info-bulle de la ligne dit pourquoi, sur l'étiquette et
    // sur le champ) ; le texte déjà tapé y reste à l'écran, et part avec la condition à « Enregistrer ». Dans la fenêtre du second niveau - celle d'une variable d'un sinon - il est
    // toujours grisé : un sinon ne se met pas dans un sinon.
    function syncOtherwiseRow() {
      const free = textField();
      if (!free) return;
      const ready = !!ConditionRules.plainCondition(ctx.state.working);
      const title = I18n.t(ctx.level ? 'varCond.otherwiseNested' : (ready ? free.kind.title : 'varCond.otherwiseTextNeedsRule'));
      free.input.disabled = !!ctx.level || !ready;
      free.label.title = title;
      free.field.title = title;
    }

    // Ce que « Retirer la condition » et une condition sans règle complète font au sinon : il s'en va avec elle (un sinon n'a de sens que pour une condition).
    const noOtherwise = () => (ctx.showsValue() ? { otherwise: null, otherwiseText: null } : (textField() ? { otherwise: null } : {}));

    return { keepTypedFieldInView, buildOtherwiseTextFields, noOtherwise, syncOtherwiseRow, textField, draftOtherwiseText, mountTextFields };
  }

  return { create };
})();
