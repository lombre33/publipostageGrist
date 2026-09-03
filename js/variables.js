// variables.js
// Gestion du catalogue de variables (#Table_Colonne) et résolution des valeurs
// à partir de la ligne courante + de la table courante détectée par grist-api.js.

const VariablesManager = (() => {
  let variableList = []; // [{label: 'Table1_Nom', tableId: 'Table1', colId: 'Nom'}]

  function buildVariableList() {
    const tables = GristAPI.getAllTables();
    variableList = [];
    tables.forEach(t => {
      t.columns.forEach(c => {
        if (c.colId === 'manualSort' || c.colId.startsWith('gristHelper_')) return;
        variableList.push({
          label: `${t.tableId}_${c.colId}`,
          tableId: t.tableId,
          colId: c.colId,
        });
      });
    });
    return variableList;
  }

  function getVariableList() {
    return variableList;
  }

  function filterVariables(query) {
    const q = query.toLowerCase();
    return variableList.filter(v => v.label.toLowerCase().includes(q));
  }

  // Recherche, dans les métadonnées de colonnes, une colonne de type Ref/RefList
  // dans la table courante qui pointe vers la table cible demandée.
  async function findReferenceColumn(currentTableId, targetTableId) {
    try {
      const metaCols = await GristAPI.docApiFetchTable('_grist_Tables_column');
      const metaTables = await GristAPI.docApiFetchTable('_grist_Tables');

      const tableIdById = {};
      for (let i = 0; i < metaTables.id.length; i++) {
        tableIdById[metaTables.id[i]] = metaTables.tableId[i];
      }

      const candidates = [];
      for (let i = 0; i < metaCols.id.length; i++) {
        const parentTableId = tableIdById[metaCols.parentId[i]];
        if (parentTableId !== currentTableId) continue;
        const type = metaCols.type[i] || '';
        // types du style "Ref:TargetTable" ou "RefList:TargetTable"
        const match = /^Ref(List)?:(.+)$/.exec(type);
        if (match && match[2] === targetTableId) {
          candidates.push(metaCols.colId[i]);
        }
      }
      return candidates; // peut être vide, un seul, ou plusieurs
    } catch (e) {
      console.error('Erreur recherche colonne de référence', e);
      return [];
    }
  }

  // Résout la valeur d'une variable pour un enregistrement donné.
  // record: ligne courante de la table currentTableId.
  async function resolveVariable(variable, record, currentTableId) {
    if (!currentTableId) {
      return `[ERREUR: table courante non détectée]`;
    }

    if (variable.tableId === currentTableId) {
      const value = record[variable.colId];
      return (value === undefined || value === null) ? '' : String(value);
    }

    // Variable issue d'une autre table : chercher une colonne de référence
    // dans la table courante qui pointe vers variable.tableId.
    const refCols = await findReferenceColumn(currentTableId, variable.tableId);

    if (refCols.length === 0) {
      return `[ERREUR: aucune référence vers ${variable.tableId} trouvée dans ${currentTableId}]`;
    }

    // On prend la première colonne de référence trouvée (V1 : pas de choix
    // utilisateur multiple géré dans l'UI ici, cf. editor.js pour le prompt
    // de sélection au moment de l'insertion de la variable).
    const refColId = refCols[0];
    const refValue = record[refColId]; // id de la ligne référencée (ou objet ['R', id])
    let refRowId = refValue;
    if (Array.isArray(refValue) && refValue.length === 2 && refValue[0] === 'R') {
      refRowId = refValue[1];
    }

    if (!refRowId) {
      return `[ERREUR: référence vide vers ${variable.tableId}]`;
    }

    try {
      const targetTable = await GristAPI.docApiFetchTable(variable.tableId);
      const idx = targetTable.id.indexOf(refRowId);
      if (idx === -1) {
        return `[ERREUR: ligne référencée introuvable dans ${variable.tableId}]`;
      }
      const value = targetTable[variable.colId] ? targetTable[variable.colId][idx] : undefined;
      return (value === undefined || value === null) ? '' : String(value);
    } catch (e) {
      return `[ERREUR: lecture de ${variable.tableId} impossible]`;
    }
  }

  // Résout toutes les variables présentes dans un texte/HTML donné.
  // Remplace les badges (identifiés par un data-attribute) par leur valeur.
  async function resolveAllInElement(rootElement, record, currentTableId) {
    const badges = rootElement.querySelectorAll('[data-varlabel]');
    let hasError = false;

    for (const badge of badges) {
      const label = badge.getAttribute('data-varlabel');
      const variable = variableList.find(v => v.label === label);
      if (!variable) {
        badge.textContent = `[ERREUR: variable inconnue ${label}]`;
        hasError = true;
        continue;
      }
      const resolved = await resolveVariable(variable, record, currentTableId);
      if (resolved.startsWith('[ERREUR')) hasError = true;
      badge.textContent = resolved;
      badge.classList.remove('var-badge');
      badge.classList.add(hasError ? 'var-error' : 'var-resolved');
    }

    return !hasError;
  }

  return {
    buildVariableList,
    getVariableList,
    filterVariables,
    findReferenceColumn,
    resolveVariable,
    resolveAllInElement,
  };
})();
