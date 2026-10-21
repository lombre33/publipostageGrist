// Suite "varShapes" - une même cellule Grist sous les DEUX formes où le widget la reçoit, et le même verdict des deux côtés (étude « angles morts des tests » du 21/10, demandée par Antoine
// après la colonne « Date et heure » : « pourquoi cela n'avait jamais été vu dans les tests unitaires ? »).
//  - la ligne AFFICHÉE (grist.onRecord, expandRefs vrai : objets décodés, valeur affichée d'une Référence) : la Lecture, le PDF, le Word et l'export de la seule ligne courante ;
//  - la ligne BRUTE (fetchTable : GristAPI.fetchRowById / fetchTableRows, drapeau GristAPI.isRawRow) : l'export en lot, les boucles, les tables liées, l'aperçu de la fenêtre de condition ;
//    une Référence y est l'id de la ligne (0 si vide), une liste ["L", …], une date des secondes, et la valeur affichée est dans la colonne d'aide « gristHelper_Display… » de la même table.
// Les formes posées ici sont celles que Grist envoie VRAIMENT : mesurées dans un vrai Grist (grist-static 0.1.6, labo-grist-reel/probe-types-matrix.mjs, 21/10), jamais déduites du code du widget.
// Un cas dit pour quelle carte d'Antoine il est là ; il joue chaque forme avec les mêmes attendus.
(function () {
  const cases = [];

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (table, column, condition) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
  const rule = (column, operator, value) => ({ column, operator, value: value == null ? '' : value });
  const when = (column, operator, value) => ({ mode: 'all', rules: [rule(column, operator, value)] });
  // Le texte de la Lecture (= PDF = Word) pour une ligne, affichée ou brute.
  async function textOf(html, table, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, table, record);
    return box.textContent.replace(/\s+/g, ' ').trim();
  }
  // La ligne `id` sous ses deux formes : `shown` (ce que livre grist.onRecord, donné par le cas) et `raw` (ce que livre fetchTable, relu dans le faux Grist et marqué comme tel).
  async function shapesOf(table, shownRows, id) {
    const raw = await GristAPI.fetchRowById(table, id);
    return { displayed: Object.assign({}, shownRows.find(r => r.id === id)), raw };
  }
  async function seed(h, table, columns, rows, displayCols, others) {
    await h.resetEditor();
    const stub = window.__gristStub;
    Object.keys(others || {}).forEach(t => { stub.setVariables(t, others[t].columns); stub.setRows(t, others[t].rows); });
    stub.setVariables(table, columns, null, displayCols || null);
    stub.setRows(table, rows);
    await GristAPI.refreshSchema();
  }
  // Les lignes [forme, ligne, colonne, opérateur, obtenu, attendu] qui ne tiennent pas.
  const wrongRows = rows => rows.filter(r => r[4] !== r[5]).map(([shape, row, column, operator, got, expected]) => ({ shape, row, column, operator, got, expected }));

  // --- Carte « Liste vide » : « est vide » / « n'est pas vide » sur une liste de références ---
  // Mesuré dans un vrai Grist : une liste de références qu'on n'a pas remplie arrive en `[]` sur la ligne affichée ; sur la ligne brute la cellule est vide (undefined dans grist-static,
  // null sur un serveur) et sa colonne d'aide dit ["L"] ; une liste calculée par une formule (lookupRecords sans résultat) dit ["L"] dans la colonne elle-même, sans colonne d'aide.
  // Avant la correction, `[]` n'était ni null ni '' : « est vide » ne se déclenchait jamais, « n'est pas vide » toujours.
  cases.push({
    id: 'vshape_an_empty_reference_list_is_empty_in_both_shapes',
    description: 'Carte « Liste vide » : « est vide » est vrai et « n\'est pas vide » faux pour une liste de références sans élément, qu\'elle soit saisie (cellule vide, colonne d\'aide ["L"]) ou calculée par une formule (["L"] sans colonne d\'aide), sur la ligne affichée comme sur la ligne brute ; l\'inverse pour une liste qui a des éléments ; et le bloc « Aucune remise » de la Lecture ne s\'écrit que sans remise',
    run: async (h) => {
      const T = 'VsListes';
      const columns = { Titre: 'Text', Remises: 'RefList:VsRemises', Calculee: 'RefList:VsRemises', gristHelper_Display: 'Any' };
      const rows = [
        { id: 1, Titre: 'Devis A', Remises: ['L', 1, 2], Calculee: ['L', 1], gristHelper_Display: ['L', 'Fidélité', 'Été'] },
        { id: 2, Titre: 'Devis B', Remises: null, Calculee: ['L'], gristHelper_Display: ['L'] },
      ];
      const shown = [
        { id: 1, Titre: 'Devis A', Remises: ['Fidélité', 'Été'], Calculee: [1] },
        { id: 2, Titre: 'Devis B', Remises: [], Calculee: [] },
      ];
      await seed(h, T, columns, rows, { Remises: 'gristHelper_Display' }, { VsRemises: { columns: { Nom: 'Text' }, rows: [{ id: 1, Nom: 'Fidélité' }, { id: 2, Nom: 'Été' }] } });
      const bad = [];
      const flags = [];
      for (const id of [1, 2]) {
        const { displayed, raw } = await shapesOf(T, shown, id);
        flags.push(GristAPI.isRawRow(displayed), GristAPI.isRawRow(raw));
        const hasItems = id === 1;
        for (const [shape, record] of [['affichée', displayed], ['brute', raw]]) {
          for (const column of ['Remises', 'Calculee']) {
            bad.push(...wrongRows([
              [shape, id, column, 'vide', await ConditionRules.matches(rule(column, 'vide'), T, record), !hasItems],
              [shape, id, column, 'non vide', await ConditionRules.matches(rule(column, 'non vide'), T, record), hasItems],
            ]));
          }
        }
        const html = `<p>[${badge(T, 'Titre', when('Remises', 'vide'))}] [${badge(T, 'Titre', when('Remises', 'non vide'))}]</p>`;
        const expected = hasItems ? '[] [Devis A]' : '[Devis B] []';
        for (const [shape, record] of [['affichée', displayed], ['brute', raw]]) {
          const got = await textOf(html, T, record);
          if (got !== expected) bad.push({ shape, row: id, lecture: got, expected });
        }
      }
      const shapesOk = JSON.stringify(flags) === '[false,true,false,true]';
      return { pass: shapesOk && bad.length === 0, notes: JSON.stringify({ shapesOk, bad }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varShapes = cases;
})();
