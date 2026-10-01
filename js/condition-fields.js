// Champs d'une règle « Colonne / Opérateur / Valeur » (+ indication de type) - partagés entre la fenêtre des macro-modèles (js/macro-editor.js) et celle
// des variables conditionnelles (maquette du 2026-09-28). Déplacés tel quel depuis js/macro-editor.js (mêmes classes .macro-rule-*, donc mêmes styles de
// css/toolbar-v2.css et mêmes sélecteurs dans dev-tests/scenarios-macro-modeles.js) pour qu'il n'en existe jamais deux copies. Chaque champ mute `rule`
// en place ; la fenêtre appelante décide seule quand l'enregistrer. Opérateurs : ConditionRules.OPERATORS (js/condition-rules.js, chargé avant). Les fenêtres
// des variables et des macro-modèles y ajoutent des options (colonnes de toutes les tables, choix de la clé d'une table pas encore liée).
const ConditionFields = (function () {
  // Colonnes de la table Grist courante (celle du Select By, demande d'Antoine 2026-09-28 : "que le champ ... soit une liste des colonnes de la page
  // sur laquelle est le widget" - liste toujours à jour, pas un texte libre où un id de colonne mal recopié cassait silencieusement la condition sans
  // aucun message d'erreur). GristAPI.getColumns/getCurrentTableId (js/grist-api.js) - déjà utilisés ailleurs (ex. l'insertion #Variable).
  function currentTableColumns() {
    const tableId = GristAPI.getCurrentTableId();
    return tableId ? GristAPI.getColumns(tableId) : [];
  }

  // Libellé du type Grist affiché en petit à côté du champ colonne - aide à comprendre le format attendu dans le champ valeur (ex. Antoine, 2026-09-28,
  // condition sans effet sur une colonne Date : la valeur saisie n'était jamais dans le même format que ce que Grist renvoie réellement).
  function friendlyTypeLabel(type) {
    const t = String(type || '');
    if (t === 'Date') return I18n.t('macro.modal.typeDate');
    if (t.indexOf('DateTime') === 0) return I18n.t('macro.modal.typeDateTime');
    if (t === 'Bool') return I18n.t('macro.modal.typeBool');
    if (t.indexOf('Ref:') === 0 || t.indexOf('RefList:') === 0) return I18n.t('macro.modal.typeRef');
    if (t === 'Numeric' || t === 'Int') return I18n.t('macro.modal.typeNumeric');
    if (t === 'Choice' || t === 'ChoiceList') return I18n.t('macro.modal.typeChoice');
    return '';
  }

  const ADVANCED_COLUMN_VALUE = '__advanced__';

  // Une colonne de la liste. `value` : « Colonne » (table de la page) ou « Table.Colonne », aussi son nom à l'écran ; son type Grist (celui que dit l'indication
  // sous le champ) est l'indice discret de la liste avec recherche - « Date de début (date) » - et permet de chercher « date » pour retrouver les dates. Le
  // texte de l'<option> reste « nom (indice) » : c'est celui de la liste native, si le composant de recherche n'est pas disponible. Exportée : le tri d'une
  // boucle (js/variable-loop.js) liste ses colonnes de la même façon.
  function appendColumnOption(parent, value, table, column) {
    const o = document.createElement('option');
    const hint = friendlyTypeLabel(GristAPI.getColumnType(table, column));
    o.value = value;
    o.textContent = hint ? value + ' (' + hint + ')' : value;
    o.dataset.name = value;
    if (hint) o.dataset.hint = hint;
    parent.appendChild(o);
  }
  // Colonnes de la table de la page en valeur NUE (même forme que les macro-modèles), celles des autres tables en "Table.Colonne" (parseColumnRef), toutes à la
  // suite dans UNE seule liste, sans intitulé de groupe (macro-modèles, demande d'Antoine du 2026-10-01 : « pas besoin de séparer les colonnes de la table en
  // cours et les autres, une seule dropdown avec recherche dynamique » ; même liste dans la condition d'une bulle, choix « À plat » du même jour) : la table se
  // lit dans le nom de la colonne (« Annuaire.Service »), et se cherche avec lui. L'état du lien d'une table n'est plus dans la liste : une colonne d'une table
  // pas encore liée se choisit quand même, l'appelant ouvre alors la fenêtre de choix de la clé (options.onColumnChosen), et le lien d'une table liée se lit sous
  // la règle une fois la colonne choisie.
  function appendAllTablesOptions(select, currentTableId) {
    const tables = GristAPI.getTables().slice();
    const ordered = currentTableId && tables.indexOf(currentTableId) !== -1 ? [currentTableId].concat(tables.filter(t => t !== currentTableId)) : tables;
    ordered.forEach(table => {
      // Sans les colonnes d'aide « gristHelper_… » (valeur affichée d'une Référence, cachées par Grist lui-même) : la Référence se compare déjà à sa
      // valeur affichée (js/variables.js:cellValue).
      GristAPI.getColumns(table).filter(c => c.indexOf('gristHelper_') !== 0)
        .forEach(c => appendColumnOption(select, table === currentTableId ? c : table + '.' + c, table, c));
    });
  }

  // Colonne d'une table pas encore liée à celle de la page : la fenêtre de choix de la clé (js/variables.js:ensureLinkConfigured) s'ouvre avant que la colonne
  // ne soit adoptée. Rend `true` TOUT DE SUITE quand il n'y a rien à demander (colonne de la page elle-même, ou d'une table déjà liée : la colonne est adoptée
  // dans l'évènement même du choix, comme avant) ; sinon une promesse - vrai si le lien vient d'être enregistré, faux si le choix de la clé est annulé
  // (options.onColumnChosen : la colonne précédente est alors remise). Même règle pour toute fenêtre qui liste les colonnes de toutes les tables.
  function ensureTableLinked(ref) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!ref || !ref.table || !currentTableId || ref.table === currentTableId) return true;
    if (GristAPI.getLinkRule(ref.table)) return true;
    return Variables.ensureLinkConfigured({ table: ref.table });
  }

  // Remplace l'ancien <input type="text"> libre par un <select> des colonnes réelles de la table courante, plus une option "avancé" qui révèle un champ
  // texte pour le cas rare cross-table ("Table.Colonne", cf. js/condition-rules.js:parseColumnRef) - jamais retiré, pour ne pas régresser sur une
  // capacité déjà là (règle de non-régression du projet), juste sorti du chemin principal. `onTypeChange(type)` : notifie le champ valeur du type Grist
  // de la colonne choisie (ou null), pour adapter son placeholder - le format attendu (ex. une date) est précisément ce qu'Antoine n'arrivait pas à
  // deviner (2026-09-28). Renvoie `{ wrap, typeHint }` (pas juste un élément) : `typeHint` doit être placé par l'appelant en dehors de `wrap`, cf. son
  // commentaire plus bas.
  // `options` (facultatif, fenêtres de condition d'une variable et de macro-modèle) : { allTables: true } liste les colonnes de TOUTES les tables en UNE seule
  // liste sans groupes (cf. appendAllTablesOptions) au lieu de la seule table de la page ; { onColumnChosen(ref, value) } est appelé
  // avant d'adopter une colonne choisie dans la liste - `true` : adoptée tout de suite ; une promesse (ou false) qui ne résout pas vrai : la colonne précédente
  // est remise (ex. choix de la clé annulé pour une table pas encore liée, cf. ensureTableLinked). Sans options : les colonnes de la page seule. { table }
  // (fenêtre de boucle, js/variable-loop.js) : les colonnes de CETTE table seule, en valeur nue - le filtre d'une boucle porte sur les lignes parcourues
  // (js/loop-rules.js:ruleHolds lit la colonne dans la table de la boucle).
  function buildColumnField(rule, onTypeChange, options) {
    const opts = options || {};
    const baseTable = () => opts.table || GristAPI.getCurrentTableId();
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-column-wrap';

    const select = document.createElement('select');
    select.className = 'macro-rule-column';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = I18n.t('macro.modal.columnChoosePlaceholder');
    select.appendChild(empty);
    if (opts.table) GristAPI.getColumns(opts.table).filter(c => c.indexOf('gristHelper_') !== 0).forEach(c => appendColumnOption(select, c, opts.table, c));
    else if (opts.allTables) appendAllTablesOptions(select, GristAPI.getCurrentTableId());
    else { const tableId = GristAPI.getCurrentTableId(); currentTableColumns().forEach(c => appendColumnOption(select, c, tableId, c)); }
    const listed = Array.from(select.querySelectorAll('option')).map(o => o.value).filter(Boolean);
    const advancedOpt = document.createElement('option');
    advancedOpt.value = ADVANCED_COLUMN_VALUE;
    advancedOpt.textContent = I18n.t('macro.modal.columnAdvanced');
    advancedOpt.dataset.pinned = 'true'; // liste avec recherche : jamais filtrée, toujours en bas
    select.appendChild(advancedOpt);

    const advancedInput = document.createElement('input');
    advancedInput.type = 'text';
    advancedInput.className = 'macro-rule-column-advanced';
    advancedInput.placeholder = I18n.t('macro.modal.columnAdvancedPlaceholder');

    const typeHint = document.createElement('span');
    typeHint.className = 'macro-rule-column-type';

    // Avertissement visible si la colonne choisie est absente de la ligne actuellement affichée dans le widget (record) : cause probable, colonne pas
    // cochée dans le panneau de droite DE CE WIDGET (grist.onRecord ne la transmet alors pas, même avec un accès complet) - exactement le bug Choice
    // d'Antoine du 2026-09-28, dont la règle "=" échouait sans aucune explication (cf. js/grist-api.js:includeColumns et js/condition-rules.js:
    // matches pour le même garde-fou côté log). Sans ce signal, rien à l'écran n'indique que la règle ne PEUT pas fonctionner tant que la colonne
    // n'est pas cochée là-bas.
    // `onTypeChange(type, colonne, table)` : la table n'est plus forcément celle de la page en mode toutes tables ("Annuaire.Service") - le champ Valeur
    // en a besoin pour retrouver les choix d'une colonne Choice d'une autre table. L'avertissement « absente de la ligne » ne concerne que la table de la
    // page (seule transmise par grist.onRecord).
    function updateTypeHint() {
      const tableId = GristAPI.getCurrentTableId();
      const value = select.value === ADVANCED_COLUMN_VALUE ? null : select.value;
      const ref = value ? ConditionRules.parseColumnRef(value, baseTable()) : null;
      const col = ref ? ref.column : null;
      const table = ref ? ref.table : null;
      const type = (col && table) ? GristAPI.getColumnType(table, col) : null;
      const record = (col && table === tableId) ? GristAPI.getCurrentRecord() : null;
      const missingFromRecord = !!(col && record && !(col in record));
      typeHint.textContent = missingFromRecord ? I18n.t('macro.modal.columnMissingFromRecord') : (type ? friendlyTypeLabel(type) : '');
      typeHint.classList.toggle('is-warning', missingFromRecord);
      if (onTypeChange) onTypeChange(type, col, table);
    }

    const currentValue = rule.column || '';
    // Valeur déjà enregistrée qui ne correspond à aucune colonne de la liste (cross-table "Table.Colonne", ou colonne absente de la table courante) :
    // reprise telle quelle en saisie avancée, jamais silencieusement effacée ni remplacée par la première colonne venue.
    if (currentValue && listed.indexOf(currentValue) === -1) {
      select.value = ADVANCED_COLUMN_VALUE;
      advancedInput.value = currentValue;
      advancedInput.hidden = false;
    } else {
      select.value = currentValue;
      advancedInput.hidden = true;
    }
    updateTypeHint();

    // Liste avec recherche (js/search-select.js), posée plus bas par-dessus le <select> : il reste la source de la valeur et des évènements `change`, tout ce
    // qui suit lit et écoute donc le <select> comme avant. Déclarée ici : les fonctions qui suivent doivent rafraîchir son champ quand elles remettent une
    // valeur par programme.
    let search = null;
    // Dernière valeur réellement adoptée par la liste (pas la saisie avancée) : remise si options.onColumnChosen refuse le nouveau choix.
    let adoptedSelectValue = select.value;
    function restoreAdopted() {
      select.value = adoptedSelectValue;
      advancedInput.hidden = adoptedSelectValue !== ADVANCED_COLUMN_VALUE;
      if (search) search.sync();
    }
    function adopt(value) {
      advancedInput.hidden = true;
      rule.column = value;
      adoptedSelectValue = value;
      updateTypeHint();
    }
    select.addEventListener('change', () => {
      if (select.value === ADVANCED_COLUMN_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule.column = advancedInput.value;
        adoptedSelectValue = ADVANCED_COLUMN_VALUE;
        updateTypeHint();
        return;
      }
      const chosen = select.value;
      if (!opts.onColumnChosen || !chosen) { adopt(chosen); return; }
      const answer = opts.onColumnChosen(ConditionRules.parseColumnRef(chosen, baseTable()), chosen);
      // `true` rendu tel quel : rien à demander, la colonne est adoptée dans l'évènement même (une promesse, elle, ne répond qu'après).
      if (answer === true) { adopt(chosen); return; }
      Promise.resolve(answer).then(ok => {
        if (ok) { adopt(chosen); return; }
        restoreAdopted();
      }, e => {
        console.error('[ConditionFields] choix de colonne interrompu', e);
        restoreAdopted();
      });
    });
    advancedInput.addEventListener('input', () => { rule.column = advancedInput.value; });

    wrap.appendChild(select);
    wrap.appendChild(advancedInput);
    // L'indice de type est dans la liste, pas dans le champ fermé : il reste dit UNE fois, sous le champ (typeHint). Si le composant échoue, le <select> natif
    // reste affiché et la règle marche comme avant.
    try { search = SearchSelect.attachColumns(select, { inline: true, hintInTrigger: false }); }
    catch (e) { console.warn('[ConditionFields] recherche de colonne indisponible, liste native conservée', e); }
    // typeHint N'EST PLUS un enfant de `wrap` (donc plus soumis à sa largeur flex:1, ~1/3 de la ligne) :
    // l'avertissement "colonne absente" peut faire 400px+ dans une ligne de ~460px (mesuré par le
    // coordinateur, 2026-09-28) et écrasait tout le reste de la ligne (select réduit à 10px). L'appelant
    // (renderSlots) place `typeHint` en pleine largeur SOUS la ligne (cf. .macro-rule-column-type dans
    // css/toolbar-v2.css : flex-basis:100%, sur .macro-rule-row directement).
    return { wrap, typeHint };
  }

  // Texte du champ Valeur libre selon le type de la colonne (une date se tape dans un format précis). Une colonne Oui / Non n'a pas de champ libre : buildBoolList.
  function valuePlaceholderForType(type) {
    const t = String(type || '');
    if (t === 'Date' || t.indexOf('DateTime') === 0) return I18n.t('macro.modal.valuePlaceholderDate');
    return I18n.t('macro.modal.valuePlaceholder');
  }

  const ADVANCED_VALUE = '__advanced_value__';

  function valueOption(value, text) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }

  // Champ Valeur en texte libre (colonne sans valeurs à proposer, et repli si la liste ne peut pas se remplir) ; placeholder adapté au type (date).
  function buildValueText(rule, type) {
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'macro-rule-value';
    valInput.placeholder = valuePlaceholderForType(type);
    valInput.value = rule.value || '';
    valInput.addEventListener('input', () => { rule.value = valInput.value; });
    return valInput;
  }

  // Champ Valeur en LISTE des valeurs possibles, posé dans `wrap` : un <select> (source de la valeur et des évènements `change`) dont la dernière option
  // « Autre valeur… » révèle un champ texte, avec par-dessus la liste avec recherche de js/search-select.js (repli : si elle échoue, le <select> natif reste
  // affiché et la règle marche pareil). Renvoie de quoi le remplir : `fill(valeurs)` (re)pose les options - tout de suite pour les choix d'une colonne Choix,
  // au retour de la lecture de la table liée pour une Référence -, `showLoading()` le texte d'attente, `toText()` le retour au texte libre.
  function buildValueList(rule, wrap, type) {
    const select = document.createElement('select');
    select.className = 'macro-rule-value';
    const advancedInput = document.createElement('input');
    advancedInput.type = 'text';
    advancedInput.className = 'macro-rule-value-advanced';
    advancedInput.placeholder = I18n.t('macro.modal.valuePlaceholder');
    advancedInput.hidden = true;
    wrap.appendChild(select);
    wrap.appendChild(advancedInput);

    select.addEventListener('change', () => {
      if (select.value === ADVANCED_VALUE) {
        advancedInput.hidden = false;
        advancedInput.focus();
        rule.value = advancedInput.value;
      } else {
        advancedInput.hidden = true;
        rule.value = select.value;
      }
    });
    advancedInput.addEventListener('input', () => { rule.value = advancedInput.value; });

    let search = null;
    try { search = SearchSelect.attachValues(select, { inline: true }); }
    catch (e) { console.warn('[ConditionFields] recherche de valeur indisponible, liste native conservée', e); }

    // Le panneau ouvert lit ses lignes à l'ouverture : celui qu'on ouvre pendant la lecture n'aurait que l'attente, on le referme au retour.
    function refresh() {
      if (!search) return;
      if (search.isOpen()) search.close(false);
      search.sync();
    }
    return {
      showLoading() {
        select.textContent = '';
        select.appendChild(valueOption('', I18n.t('macro.modal.valueLoading')));
        refresh();
      },
      fill(values) {
        select.textContent = '';
        select.appendChild(valueOption('', I18n.t('macro.modal.valueChoosePlaceholder')));
        values.forEach(v => select.appendChild(valueOption(v, v)));
        const advancedOpt = valueOption(ADVANCED_VALUE, I18n.t('macro.modal.valueAdvanced'));
        advancedOpt.dataset.pinned = 'true'; // liste avec recherche : jamais filtrée, toujours en bas
        select.appendChild(advancedOpt);
        // Même garde qu'en colonne (buildColumnField) : une valeur déjà enregistrée qui ne correspond à aucune valeur connue (choix retiré depuis côté Grist,
        // ligne supprimée de la table liée, ou widgetOptions pas encore chargé au moment de la 1ère saisie) reste visible en « Autre valeur… », jamais
        // silencieusement effacée.
        const currentValue = rule.value == null ? '' : String(rule.value);
        if (currentValue && values.indexOf(currentValue) === -1) {
          select.value = ADVANCED_VALUE;
          advancedInput.value = currentValue;
          advancedInput.hidden = false;
        } else {
          select.value = currentValue;
          advancedInput.hidden = true;
        }
        refresh();
      },
      toText() {
        if (search) search.destroy();
        const input = buildValueText(rule, type);
        input.disabled = select.disabled; // grisé ou non par l'opérateur (syncValueDisabled), pas par ce champ
        wrap.replaceChildren(input);
      },
    };
  }

  // Champ Valeur d'une colonne Oui / Non (Bool) : une liste de DEUX mots, sans saisie libre (Antoine, 2026-10-01 : « si la colonne est une boolean, proposer la
  // liste déroulante oui/non avec les mots qui vont exactement correspondre à la valeur stockée sur Grist (ou traduite) ... limiter les entrées manuelles pour éviter
  // les erreurs »). Un mot tapé de travers (« Oui. », « O », « Ouii ») ne correspondait à rien : la règle ne s'appliquait jamais, sans aucun message. Les mots sont
  // ceux que compareValues lit (ConditionRules.parseBoolExpected : oui / vrai / true / 1 / yes, non / faux / false / 0 / no), écrits dans la langue de l'interface ;
  // le <select> masqué reste la source de la valeur, comme pour les autres listes de valeurs. Une valeur déjà enregistrée garde sa forme tant qu'on n'y touche pas
  // (« vrai », « 1 » ou « yes » s'affichent « Oui » sans réécrire la règle) ; une valeur que la comparaison ne lit pas (« x », un reste de la colonne précédente) reste
  // visible en dernière ligne avec « valeur non reconnue », jamais effacée en silence, et sort de la liste dès qu'on choisit Oui ou Non.
  function buildBoolList(rule, wrap) {
    const select = document.createElement('select');
    select.className = 'macro-rule-value';
    const yes = I18n.t('macro.modal.valueBoolYes');
    const no = I18n.t('macro.modal.valueBoolNo');
    select.appendChild(valueOption('', I18n.t('macro.modal.valueChoosePlaceholder')));
    select.appendChild(valueOption(yes, yes));
    select.appendChild(valueOption(no, no));
    const saved = rule.value == null ? '' : String(rule.value);
    const word = ConditionRules.parseBoolExpected(saved);
    let unrecognized = null;
    if (saved.trim() !== '' && word === null) {
      const hint = I18n.t('macro.modal.valueUnrecognized');
      unrecognized = valueOption(saved, saved + ' (' + hint + ')');
      unrecognized.dataset.name = saved;
      unrecognized.dataset.hint = hint;
      select.appendChild(unrecognized);
    }
    select.value = unrecognized ? saved : word === true ? yes : word === false ? no : '';
    select.addEventListener('change', () => {
      rule.value = select.value;
      if (unrecognized && select.value !== unrecognized.value) { unrecognized.remove(); unrecognized = null; }
    });
    wrap.appendChild(select);
    try { SearchSelect.attachValues(select, { inline: true }); }
    catch (e) { console.warn('[ConditionFields] recherche de valeur indisponible, liste native conservée', e); }
  }

  // Remplace le champ Valeur en texte libre par une LISTE AVEC RECHERCHE des valeurs possibles quand la colonne en propose - même raison et même patron que
  // buildColumnField pour la colonne : une valeur tapée à la main qui ne correspond pas EXACTEMENT à la valeur stockée (casse, accent, espace) ne matche jamais,
  // silencieusement (Antoine, 2026-09-28 : "colonne à choix unique, opérateur '=' ne fonctionne pas" ; 2026-09-29 : "autocomplétion ou dropdown des valeurs
  // possibles" pour une colonne à choix ou à référence). Deux sources : les choix de la colonne Choice/ChoiceList (widgetOptions.choices,
  // GristAPI.getColumnChoices), tout de suite ; et, pour une Référence ou une liste de références, les valeurs de la colonne que Grist affiche dans la table
  // liée (GristAPI.getReferenceValues), lues de façon asynchrone - la liste dit « Chargement… » le temps de la lecture, puis se remplit. « Autre valeur… »
  // reste proposée (jamais retirée, règle de non-régression) : une valeur hors liste, ou une table liée illisible ou vide, garde un texte libre. Repli sur le texte
  // libre (placeholder adapté au type) pour tout le reste, et pour une colonne sans valeur connue (Choice sans widgetOptions.choices - colonne pas encore vue
  // par refreshSchema, ou vidée -, Référence qui montre l'id de la ligne ou une date) - jamais un champ qui disparaît. Une colonne Oui / Non a toujours ses deux
  // valeurs : liste Oui / Non, sans « Autre valeur… » (buildBoolList).
  // `table` : table de la colonne choisie (celle de la page par défaut) - une colonne d'une autre table a ses propres valeurs.
  function buildValueField(rule, columnType, colId, table) {
    const wrap = document.createElement('span');
    wrap.className = 'macro-rule-value-wrap';
    const type = String(columnType || '');
    const tableId = table || GristAPI.getCurrentTableId();

    if (type === 'Bool') {
      buildBoolList(rule, wrap);
      return wrap;
    }

    const choices = (type === 'Choice' || type === 'ChoiceList') && colId && tableId ? GristAPI.getColumnChoices(tableId, colId) : null;

    if (choices && choices.length) {
      buildValueList(rule, wrap, type).fill(choices);
      return wrap;
    }

    if ((type.indexOf('Ref:') === 0 || type.indexOf('RefList:') === 0) && colId && tableId && GristAPI.getReferenceColumn(tableId, colId)) {
      const list = buildValueList(rule, wrap, type);
      list.showLoading();
      GristAPI.getReferenceValues(tableId, colId).then(values => {
        if (values.length) list.fill(values); else list.toText();
      }, e => {
        console.warn('[ConditionFields] valeurs de la table liée illisibles, texte libre conservé', e);
        list.toText();
      });
      return wrap;
    }

    wrap.appendChild(buildValueText(rule, type));
    return wrap;
  }

  // Le champ Valeur dépend du type de la colonne choisie (dropdown des vrais choix pour Choice/ChoiceList, liste Oui / Non pour Bool, placeholder adapté
  // pour Date, texte libre sinon - buildValueField) : reconstruit entièrement à chaque changement de colonne plutôt que de juste garder le même <input> et
  // en changer le placeholder, puisque le type de champ lui-même (select vs texte) peut changer. `valueSlot` doit exister AVANT buildColumnField :
  // celui-ci appelle son callback une 1ère fois de façon synchrone, pour la colonne déjà enregistrée de la règle.
  // `typeHint` est à placer par l'appelant en DERNIER enfant de sa ligne (cf. buildColumnField). Même ordre de construction qu'avant le déplacement.
  // « vide » / « non vide » ne lisent jamais la valeur saisie (js/condition-rules.js:compareValues) : le champ Valeur est grisé (pas retiré, la valeur
  // déjà saisie reste en place si l'on revient à un autre opérateur) - maquette validée le 2026-09-28.
  const VALUELESS_OPERATORS = ['vide', 'non vide'];
  function syncValueDisabled(valueSlot, operator) {
    const disabled = VALUELESS_OPERATORS.indexOf(operator) !== -1;
    valueSlot.classList.toggle('is-disabled', disabled);
    valueSlot.querySelectorAll('select, input').forEach(el => {
      el.disabled = disabled;
      // La liste avec recherche ne lit l'état grisé de son <select> masqué qu'à sa demande (aucun évènement ne le lui dit).
      if (el.tagName === 'SELECT' && typeof SearchSelect !== 'undefined') SearchSelect.sync(el);
    });
  }

  // Sur une colonne Oui / Non, seuls « = », « ≠ », « vide » et « non vide » ont un sens : la comparaison (js/condition-rules.js:compareValues) lit « > » et « ≥ » en
  // texte (« true » contre « Oui »), donc « > » et « ≥ » retiennent TOUTES les lignes, « < », « ≤ » et « contient » aucune, sans message (choix « Griser »
  // d'Antoine, 2026-10-01). Ces cinq lignes sont GRISÉES, jamais retirées : la liste garde ses neuf lignes dans le même ordre. L'opérateur déjà enregistré - ou
  // choisi avant de passer à une colonne Oui / Non - reste affiché et choisi, même grisé : une règle n'est jamais réécrite à la place de l'utilisateur.
  const BOOL_MEANINGLESS_OPERATORS = ['>', '<', '≥', '≤', 'contient'];
  function syncOperatorOptions(operatorSelect, columnType) {
    const bool = String(columnType || '') === 'Bool';
    Array.from(operatorSelect.options).forEach(option => { option.disabled = bool && BOOL_MEANINGLESS_OPERATORS.indexOf(option.value) !== -1; });
  }

  // `options` : transmis à buildColumnField (fenêtre de condition d'une variable : { allTables, onColumnChosen }), plus { onColumnResolved(table, colonne,
  // type) } appelé à la construction puis à chaque colonne adoptée (indication du lien sous la règle) - sans effet pour les macro-modèles.
  function buildConditionFields(rule, options) {
    const valueSlot = document.createElement('span');
    valueSlot.className = 'macro-rule-value-slot';
    const operatorSelect = document.createElement('select');
    let columnType = null;
    function renderValue(type, colId, table) {
      columnType = type;
      syncOperatorOptions(operatorSelect, type);
      valueSlot.replaceChildren(buildValueField(rule, type, colId, table));
      syncValueDisabled(valueSlot, operatorSelect.value || rule.operator || '=');
      if (options && options.onColumnResolved) options.onColumnResolved(table, colId, type);
    }

    const columnField = buildColumnField(rule, (type, colId, table) => renderValue(type, colId, table), options);

    ConditionRules.OPERATORS.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; operatorSelect.appendChild(o); });
    operatorSelect.value = rule.operator || '=';
    // La 1re colonne a été rendue avant que les options existent : on grise maintenant, une fois l'opérateur enregistré choisi.
    syncOperatorOptions(operatorSelect, columnType);
    syncValueDisabled(valueSlot, operatorSelect.value);
    operatorSelect.addEventListener('change', () => { rule.operator = operatorSelect.value; syncValueDisabled(valueSlot, operatorSelect.value); });

    return { columnWrap: columnField.wrap, operatorSelect, valueSlot, typeHint: columnField.typeHint };
  }

  return { friendlyTypeLabel, appendColumnOption, ensureTableLinked, valuePlaceholderForType, buildColumnField, buildValueField, buildConditionFields };
})();
