// Suivi des renommages de tables et de colonnes faits dans Grist (point 11 d'Antoine du 2026-10-02 : « si je change le nom d'une colonne sur Grist, est-ce que ça peut le changer
// dans la variable ? »). Grist garde l'identifiant de ligne d'une table et d'une colonne (_grist_Tables, _grist_Tables_column : un renommage met à jour la MÊME ligne, vérifié à la
// source grist-core, useractions.py RenameColumn / RenameTable) et réécrit ses propres formules, jamais le contenu d'un widget : un modèle qui nomme « Dossiers.Montant » garde ce
// nom, et la bulle devient rouge. Ici, à l'ouverture du widget, les noms d'aujourd'hui sont comparés, identifiant par identifiant, à ceux de la dernière ouverture ; ce qui a changé
// de nom est réécrit là où le widget l'a écrit : les modèles (bulles, conditions, boucles, calculs, blocs et cases conditionnels, images liées, QR codes, en-têtes et pieds de page,
// macro-modèles, nom du PDF, champs de l'e-mail) et les clés de correspondance entre tables (Publipostage_LiensTables).
//
// Rien n'est lu ni écrit avant l'affichage du modèle (point 1 d'Antoine, temps d'ouverture) : js/main.js appelle checkAfterOpen en toute dernière ligne d'init(), sans l'attendre.
// L'instantané (identifiant -> nom, pour chaque table et chaque colonne) vit dans le stockage du navigateur, par document (pp_schema_<document>) : `grist.setOption` ne pose qu'un
// brouillon de la section (bouton Enregistrer de Grist) et une table de plus dans le document alourdirait la navigation. Conséquence : le suivi se fait navigateur par navigateur ;
// la première ouverture d'un navigateur ne fait que noter le schéma, un renommage fait avant ne se rattrape pas (le bouton « Colonne… » de la barre d'une bulle le répare à la main).
//
// Règles qui rendent la réécriture sûre :
//  - Seule une référence CASSÉE aujourd'hui est réécrite. Une colonne qu'on lit encore comme elle est écrite (nom repris par une autre colonne, deux noms échangés) n'est jamais
//    touchée : mieux vaut laisser une bulle fausse comme avant que d'en changer une qui marche.
//  - Le nouveau nom vient des identifiants, jamais d'une ressemblance de noms. Un chemin « Projet.Responsable.Email » se descend colonne par colonne, la table suivante étant celle que
//    la colonne référence aujourd'hui.
//  - Une colonne sans nom de table (condition d'une bulle, règle d'un macro-modèle) est une colonne de la table de la page : celle de ce widget. Un modèle qui ne nomme, ailleurs, que
//    d'autres tables n'est pas lu comme celui de cette page, et une colonne nue dont une AUTRE table porte encore le nom n'est pas réécrite non plus (le modèle peut servir sur l'autre
//    page, où elle se lit). Dans le filtre et le tri d'une boucle, c'est une colonne de la table parcourue, sans ambiguïté. La colonne source d'une clé de correspondance suit la même
//    règle : la clé sert à toutes les pages. Sans table de page connue, la passe attend l'ouverture suivante.
//  - Rien ne s'écrit en lecture seule, ni quand la personne a déjà commencé à modifier le modèle affiché (la passe est reprise à l'ouverture suivante), et l'instantané n'avance qu'une
//    fois tout réécrit : une passe interrompue se rejoue sans risque, puisque ce qui est déjà réécrit se lit et n'est plus touché.
//  - DateModif ne bouge pas : ce n'est pas une modification de la personne, et l'enregistrement automatique n'y voit pas un conflit.
const SchemaRenames = (function () {
  const STORAGE_PREFIX = 'pp_schema_';
  const STORAGE_INDEX = 'pp_schema_index';
  const MAX_SNAPSHOTS = 30; // documents gardés : au-delà, les plus anciens sont oubliés
  const FORMAT = 1;
  const TEMPLATE_COLUMNS = ['Nom', 'TypeModele', 'Contenu', 'HeaderFooter', 'NomFichierPDF', 'Destinataires', 'Cc', 'Cci', 'Objet'];
  const TEXT_COLUMNS = ['NomFichierPDF', 'Destinataires', 'Cc', 'Cci', 'Objet'];
  // Tout ce que le widget range dans un modèle et qui nomme une table ou une colonne (js/loop-rules.js:BOUND_SELECTOR, plus la bulle de calcul).
  const ELEMENT_SELECTOR = '.var-badge, .calc-badge, img.editor-image, .conditional-text, .conditional-checkbox';

  let running = false;

  // === Stockage de l'instantané ===
  // { f: FORMAT, t: { idTable: [nom, { idColonne: nom }] } } - rangs de ligne de _grist_Tables / _grist_Tables_column.
  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* stockage indisponible */ } }

  function loadSnapshot(docKey) {
    const raw = storageGet(STORAGE_PREFIX + docKey);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return value && value.f === FORMAT && value.t && typeof value.t === 'object' ? value : null;
    } catch (e) { return null; }
  }

  function saveSnapshot(docKey, snapshot) {
    if (!storageSet(STORAGE_PREFIX + docKey, JSON.stringify(snapshot))) return false;
    let index = [];
    try { index = JSON.parse(storageGet(STORAGE_INDEX) || '[]'); } catch (e) { index = []; }
    if (!Array.isArray(index)) index = [];
    index = index.filter(key => key !== docKey);
    index.push(docKey);
    while (index.length > MAX_SNAPSHOTS) storageRemove(STORAGE_PREFIX + index.shift());
    storageSet(STORAGE_INDEX, JSON.stringify(index));
    return true;
  }

  // Oublie tous les instantanés (tests : chaque scénario repart d'un widget qui n'a rien noté).
  function reset() {
    let index = [];
    try { index = JSON.parse(storageGet(STORAGE_INDEX) || '[]'); } catch (e) { index = []; }
    (Array.isArray(index) ? index : []).forEach(key => storageRemove(STORAGE_PREFIX + key));
    storageRemove(STORAGE_INDEX);
  }

  // Le document, tel que Grist le nomme dans l'adresse de son interface de programmation (.../api/docs/<identifiant>) : le seul identifiant sûr, deux documents peuvent porter le même nom.
  async function documentKey() {
    const info = await grist.docApi.getAccessToken({ readOnly: true });
    const url = new URL(String((info && info.baseUrl) || ''));
    const found = /\/api\/docs\/([^/?#]+)/.exec(url.pathname);
    return found ? url.host + '/' + found[1] : null;
  }

  // === Le schéma d'aujourd'hui ===
  // `snapshot` : la forme de l'instantané. `refs` : { idColonne: nom de la table que cette colonne Référence ou Liste de références désigne } - jamais gardé : seul le présent compte pour
  // savoir où mène une colonne. Null quand aucune table n'est lisible.
  async function readSchema() {
    const visible = new Set(GristAPI.getTables());
    const [tables, columns] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]);
    const t = {};
    const refs = {};
    (tables.id || []).forEach((id, i) => { if (visible.has(tables.tableId[i])) t[id] = [tables.tableId[i], {}]; });
    (columns.id || []).forEach((id, i) => {
      const entry = t[columns.parentId[i]];
      const name = columns.colId[i];
      // Les colonnes « gristHelper_… » sont l'affichage d'une Référence que Grist range dans la même table : le widget ne les nomme jamais.
      if (!entry || String(name).indexOf('gristHelper_') === 0) return;
      entry[1][id] = name;
      const target = /^Ref(?:List)?:(.+)$/.exec(String(columns.type ? columns.type[i] : ''));
      if (target) refs[id] = target[1];
    });
    // Aucune table lisible (liste des tables ou métadonnées pas rendues) : une lecture qui a échoué ne doit jamais remplacer l'instantané, qui est la seule mémoire des anciens noms.
    return Object.keys(t).length ? { snapshot: { f: FORMAT, t }, refs } : null;
  }

  function indexOf(snapshot) {
    const idx = { tableName: {}, tableRow: {}, colName: {}, colTable: {}, colRow: {} };
    Object.keys(snapshot.t).forEach(tRow => {
      const entry = snapshot.t[tRow];
      idx.tableName[tRow] = entry[0];
      idx.tableRow[entry[0]] = tRow;
      idx.colRow[tRow] = {};
      Object.keys(entry[1]).forEach(cRow => {
        idx.colName[cRow] = entry[1][cRow];
        idx.colTable[cRow] = tRow;
        idx.colRow[tRow][entry[1][cRow]] = cRow;
      });
    });
    return idx;
  }

  // Ce qui a changé de nom entre l'instantané et le schéma d'aujourd'hui, identifiant par identifiant : { tables: [{ from, to }], columns: [{ table, from, to }], any }.
  function diff(saved, current) {
    const o = indexOf(saved);
    const c = indexOf(current);
    const tables = [];
    const columns = [];
    Object.keys(o.tableName).forEach(tRow => {
      if (c.tableName[tRow] !== undefined && c.tableName[tRow] !== o.tableName[tRow]) tables.push({ from: o.tableName[tRow], to: c.tableName[tRow] });
    });
    Object.keys(o.colName).forEach(cRow => {
      if (c.colName[cRow] !== undefined && c.colTable[cRow] === o.colTable[cRow] && c.colName[cRow] !== o.colName[cRow]) {
        columns.push({ table: c.tableName[c.colTable[cRow]], from: o.colName[cRow], to: c.colName[cRow] });
      }
    });
    return { tables, columns, any: tables.length + columns.length > 0 };
  }

  // === Les noms d'hier -> les noms d'aujourd'hui ===
  // `saved` : l'instantané ; `current` : le schéma d'aujourd'hui avec ses `refs`. Chaque fonction rend null quand il n'y a rien à changer : référence encore lisible telle qu'elle est écrite,
  // nom inconnu de l'instantané, table ou colonne supprimée.
  function createMapper(saved, current, refs) {
    const o = indexOf(saved);
    const c = indexOf(current);
    const refTargetRow = cRow => (refs[cRow] === undefined ? undefined : c.tableRow[refs[cRow]]);

    // La référence se lit-elle aujourd'hui, telle qu'elle est écrite ? Le chemin se descend de colonne Référence en colonne Référence.
    function validNow(table, path) {
      let tRow = c.tableRow[table];
      if (tRow === undefined) return false;
      const hops = String(path).split('.');
      for (let i = 0; i < hops.length; i++) {
        const cRow = (c.colRow[tRow] || {})[hops[i]];
        if (cRow === undefined) return false;
        if (i < hops.length - 1) {
          tRow = refTargetRow(cRow);
          if (tRow === undefined) return false;
        }
      }
      return true;
    }

    // Le chemin d'hier, colonne après colonne, avec les noms d'aujourd'hui : chaque nom d'hier se cherche dans la table d'hier, la table suivante est celle que la colonne désigne aujourd'hui.
    function walk(tRow, path) {
      const hops = String(path).split('.');
      const names = [];
      for (let i = 0; i < hops.length; i++) {
        const cRow = (o.colRow[tRow] || {})[hops[i]];
        if (cRow === undefined || c.colTable[cRow] !== tRow) return null;
        names.push(c.colName[cRow]);
        if (i < hops.length - 1) {
          tRow = refTargetRow(cRow);
          if (tRow === undefined) return null;
        }
      }
      return names.join('.');
    }

    // « Table » + « Colonne » (ou « Colonne.Référence.Colonne ») écrits ensemble : { table, column } d'aujourd'hui, ou null.
    function mapQualified(table, path) {
      if (!table || !path || validNow(table, path)) return null;
      const tRow = o.tableRow[table];
      if (tRow === undefined || c.tableName[tRow] === undefined) return null;
      const column = walk(tRow, path);
      if (column === null || (c.tableName[tRow] === table && column === path)) return null;
      return { table: c.tableName[tRow], column };
    }

    // Un nom de table seul (table parcourue par une boucle, colonne Référence de la page, clé de correspondance).
    function mapTable(table) {
      if (!table || c.tableRow[table] !== undefined) return null;
      const tRow = o.tableRow[table];
      const name = tRow === undefined ? undefined : c.tableName[tRow];
      return name === undefined || name === table ? null : name;
    }

    // La table où se lit une colonne sans nom de table : { oldRow, oldName, newName } - la table d'aujourd'hui portant ce nom, qui existait déjà dans l'instantané. Null sinon.
    function tableContext(nowName) {
      const tRow = nowName ? c.tableRow[nowName] : undefined;
      return tRow === undefined || o.tableName[tRow] === undefined ? null : { oldRow: tRow, oldName: o.tableName[tRow], newName: nowName };
    }

    // Une colonne sans nom de table : son nom d'aujourd'hui dans la table du contexte, ou null.
    function mapBare(path, ctx) {
      if (!ctx || !path || validNow(ctx.newName, path)) return null;
      const column = walk(ctx.oldRow, path);
      return column === null || column === path ? null : column;
    }

    // Une autre table que `ctx` a-t-elle aujourd'hui une colonne de ce nom ?
    function otherTableHasColumn(name, ctx) {
      return Object.keys(c.colRow).some(tRow => tRow !== ctx.oldRow && c.colRow[tRow][name] !== undefined);
    }

    // Les clés « Table.Colonne » de l'instantané, les plus longues d'abord : « Dossiers.MontantTTC » avant « Dossiers.Montant ».
    let oldKeys = null;
    function keys() {
      if (oldKeys) return oldKeys;
      oldKeys = [];
      Object.keys(o.tableName).forEach(tRow => {
        Object.keys(o.colRow[tRow]).forEach(name => oldKeys.push({ key: o.tableName[tRow] + '.' + name, table: o.tableName[tRow], tRow, cRow: o.colRow[tRow][name], column: name }));
      });
      oldKeys.sort((a, b) => b.key.length - a.key.length);
      return oldKeys;
    }

    // Dans un texte, la variable écrite juste après la touche de déclenchement (`rest` commence après elle) : { table, path, length } avec les noms d'hier, le chemin prolongé tant que le
    // texte suit une colonne Référence (la colonne la plus longue de la table atteinte l'emporte, comme Variables.findTextVariables). Null si rien ne s'y lit.
    function matchTextKey(rest) {
      const base = keys().find(k => rest.startsWith(k.key));
      if (!base) return null;
      let path = base.column;
      let length = base.key.length;
      let cRow = base.cRow;
      for (;;) {
        const tRow = refTargetRow(cRow);
        if (tRow === undefined) break;
        let next = null;
        Object.keys(o.colRow[tRow] || {}).forEach(name => {
          if (rest.startsWith('.' + name, length) && (!next || name.length > next.name.length)) next = { name, cRow: o.colRow[tRow][name] };
        });
        if (!next) break;
        path += '.' + next.name;
        length += 1 + next.name.length;
        cRow = next.cRow;
      }
      return { table: base.table, path, length };
    }

    return { mapQualified, mapTable, tableContext, mapBare, otherTableHasColumn, matchTextKey };
  }

  // === Réécriture ===
  function parseJson(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // La colonne d'une règle : nue (table du contexte) ou « Table.Colonne ». Le nouveau texte de la colonne, ou null. `ambiguous` : la table du contexte n'est que la table de la page de CE widget, et le
  // modèle peut servir sur une autre page : une colonne nue dont une autre table porte encore le nom se lit là-bas, elle ne bouge pas. Faux pour la table parcourue par une boucle, qui est certaine.
  function mapRuleColumn(raw, m, ctx, ambiguous) {
    const dot = raw.indexOf('.');
    if (dot === -1) {
      const next = m.mapBare(raw, ctx);
      return next !== null && !(ambiguous && m.otherTableHasColumn(raw, ctx)) ? next : null;
    }
    const next = m.mapQualified(raw.slice(0, dot), raw.slice(dot + 1));
    return next ? next.table + '.' + next.column : null;
  }

  // { mode, rules: [{ column, operator, value }] } - rend la condition elle-même quand rien ne change.
  function rewriteCondition(condition, m, ctx, ambiguous) {
    if (!condition || !Array.isArray(condition.rules)) return { condition, count: 0 };
    let count = 0;
    const rules = condition.rules.map(rule => {
      if (!rule || typeof rule.column !== 'string' || !rule.column) return rule;
      const next = mapRuleColumn(rule.column, m, ctx, ambiguous);
      if (next === null) return rule;
      count++;
      return Object.assign({}, rule, { column: next });
    });
    return count ? { condition: Object.assign({}, condition, { rules }), count } : { condition, count: 0 };
  }

  // { repeat, table, via: { table, column }, filter, sort: { column, direction }, … } (js/loop-rules.js). Le filtre et le tri parlent de la table parcourue.
  function rewriteLoop(loop, m) {
    if (!loop || typeof loop !== 'object' || !loop.table) return { loop, count: 0 };
    const next = Object.assign({}, loop);
    let count = 0;
    const table = m.mapTable(loop.table);
    if (table) { next.table = table; count++; }
    if (loop.via && loop.via.table && loop.via.column) {
      const via = m.mapQualified(loop.via.table, loop.via.column);
      if (via) { next.via = Object.assign({}, loop.via, { table: via.table, column: via.column }); count++; }
    }
    const ctx = m.tableContext(table || loop.table);
    if (loop.filter) {
      const filter = rewriteCondition(loop.filter, m, ctx, false);
      if (filter.count) { next.filter = filter.condition; count += filter.count; }
    }
    if (loop.sort && typeof loop.sort.column === 'string' && loop.sort.column) {
      const column = mapRuleColumn(loop.sort.column, m, ctx, false);
      if (column !== null) { next.sort = Object.assign({}, loop.sort, { column }); count++; }
    }
    return count ? { loop: next, count } : { loop, count: 0 };
  }

  // Les variables d'une formule enregistrée : `{Facture.SousTotal}*0.2+SUM({Lignes.Prix};10)` (js/formula.js).
  function rewriteFormula(formula, m) {
    let count = 0;
    const text = String(formula == null ? '' : formula).replace(/\{([^{}]*)\}/g, (whole, inner) => {
      const key = inner.trim();
      const dot = key.indexOf('.');
      const next = dot > 0 ? m.mapQualified(key.slice(0, dot), key.slice(dot + 1)) : null;
      if (!next) return whole;
      count++;
      return '{' + next.table + '.' + next.column + '}';
    });
    return { text, count };
  }

  // Les variables d'un texte brut : la touche de déclenchement, puis « Table.Colonne » ou « Table.Référence.Colonne » (nom du PDF, champs de l'e-mail, texte d'un QR code).
  function rewriteText(text, m, trigger) {
    const src = String(text == null ? '' : text);
    if (!trigger || src.indexOf(trigger) === -1) return { text: src, count: 0 };
    let out = '';
    let count = 0;
    let i = 0;
    while (i < src.length) {
      const hit = src[i] === trigger ? m.matchTextKey(src.slice(i + 1)) : null;
      if (!hit) { out += src[i]; i++; continue; }
      const next = m.mapQualified(hit.table, hit.path);
      out += trigger + (next ? next.table + '.' + next.column : src.slice(i + 1, i + 1 + hit.length));
      if (next) count++;
      i += 1 + hit.length;
    }
    return { text: count ? out : src, count };
  }

  // Les tables que le contenu nomme en toutes lettres : bulles, images liées, formules, boucles, règles « Table.Colonne ».
  function explicitTablesOf(root) {
    const tables = new Set();
    const addRules = condition => { if (condition && Array.isArray(condition.rules)) condition.rules.forEach(r => { if (r && typeof r.column === 'string' && r.column.indexOf('.') > 0) tables.add(r.column.slice(0, r.column.indexOf('.'))); }); };
    root.querySelectorAll(ELEMENT_SELECTOR).forEach(el => {
      const table = el.getAttribute('data-table') || el.getAttribute('data-var-table');
      if (table) tables.add(table);
      const formula = el.getAttribute('data-formula');
      if (formula) formula.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\./g, (whole, name) => { tables.add(name); return whole; });
      addRules(parseJson(el.getAttribute('data-condition')));
      const loop = parseJson(el.getAttribute('data-loop'));
      if (loop && loop.table) {
        tables.add(loop.table);
        if (loop.via && loop.via.table) tables.add(loop.via.table);
        addRules(loop.filter);
      }
    });
    return tables;
  }

  // Un élément du modèle (bulle, bulle de calcul, image liée ou QR code, bloc ou case conditionnels) : le nombre de références réécrites.
  function rewriteElement(el, m, page, trigger) {
    let count = 0;
    const isImage = el.tagName === 'IMG';
    const tableAttr = isImage ? 'data-var-table' : 'data-table';
    const columnAttr = isImage ? 'data-var-column' : 'data-column';
    const keyAttr = isImage ? 'data-var-key' : 'data-key';
    const table = el.getAttribute(tableAttr);
    const column = el.getAttribute(columnAttr);
    if (table && column) {
      const next = m.mapQualified(table, column);
      if (next) {
        const oldKey = el.getAttribute(keyAttr);
        const newKey = next.table + '.' + next.column;
        el.setAttribute(tableAttr, next.table);
        el.setAttribute(columnAttr, next.column);
        if (oldKey === table + '.' + column) el.setAttribute(keyAttr, newKey);
        // Le texte de la bulle (touche de déclenchement + clé) : régénéré au chargement dans l'éditeur, mais gardé juste dans le HTML enregistré.
        if (!isImage && oldKey && el.textContent.endsWith(oldKey)) el.textContent = el.textContent.slice(0, el.textContent.length - oldKey.length) + newKey;
        count++;
      }
    }
    const formula = el.getAttribute('data-formula');
    if (formula) {
      const next = rewriteFormula(formula, m);
      if (next.count) {
        el.setAttribute('data-formula', next.text);
        try { el.textContent = '= ' + Formula.toDisplay(next.text, { trigger, lang: I18n.getLang(), pretty: true }); } catch (e) { /* le libellé se refait au chargement */ }
        count += next.count;
      }
    }
    const qr = el.getAttribute('data-qr-text');
    if (qr) {
      const next = rewriteText(qr, m, trigger);
      if (next.count) { el.setAttribute('data-qr-text', next.text); count += next.count; }
    }
    const rawCondition = el.getAttribute('data-condition');
    if (rawCondition) {
      const next = rewriteCondition(parseJson(rawCondition), m, page, true);
      if (next.count) { el.setAttribute('data-condition', JSON.stringify(next.condition)); count += next.count; }
    }
    const rawLoop = el.getAttribute('data-loop');
    if (rawLoop) {
      const next = rewriteLoop(parseJson(rawLoop), m);
      if (next.count) { el.setAttribute('data-loop', JSON.stringify(next.loop)); count += next.count; }
    }
    return count;
  }

  // `ctx` : { page, trigger } - `page` est le contexte des colonnes sans nom de table (la table de la page), null pour ne pas les lire.
  function rewriteHtml(html, m, ctx) {
    const src = String(html == null ? '' : html);
    if (src.indexOf('data-') === -1) return { html: src, count: 0 };
    const tpl = document.createElement('template');
    tpl.innerHTML = src;
    const root = tpl.content;
    // Un modèle qui nomme d'autres tables que celle de la page, et jamais celle-ci, n'est pas lu comme un modèle de cette page : ses colonnes sans nom de table restent.
    const explicit = explicitTablesOf(root);
    const page = ctx.page && (!explicit.size || explicit.has(ctx.page.oldName) || explicit.has(ctx.page.newName)) ? ctx.page : null;
    let count = 0;
    root.querySelectorAll(ELEMENT_SELECTOR).forEach(el => { count += rewriteElement(el, m, page, ctx.trigger); });
    return count ? { html: tpl.innerHTML, count } : { html: src, count: 0 };
  }

  // HeaderFooter : { enabled, differentFirstPage, header: { default, first }, footer: { default, first } } - du HTML dans chaque case.
  function rewriteHeaderFooter(json, m, ctx) {
    const data = parseJson(json);
    if (!data || typeof data !== 'object') return { text: json, count: 0 };
    let count = 0;
    ['header', 'footer'].forEach(part => {
      const zone = data[part];
      if (!zone || typeof zone !== 'object') return;
      ['default', 'first'].forEach(which => {
        if (typeof zone[which] !== 'string') return;
        const next = rewriteHtml(zone[which], m, ctx);
        if (next.count) { zone[which] = next.html; count += next.count; }
      });
    });
    return count ? { text: JSON.stringify(data), count } : { text: json, count: 0 };
  }

  // Macro-modèle : { slots: [{ type: 'conditional', rules: [{ column, operator, value, modeleId }], … }] } - les colonnes des règles.
  function rewriteMacro(json, m, page) {
    const data = parseJson(json);
    if (!data || !Array.isArray(data.slots)) return { text: json, count: 0 };
    let count = 0;
    data.slots.forEach(slot => {
      if (!slot || !Array.isArray(slot.rules)) return;
      slot.rules.forEach(rule => {
        if (!rule || typeof rule.column !== 'string' || !rule.column) return;
        const next = mapRuleColumn(rule.column, m, page, true);
        if (next !== null) { rule.column = next; count++; }
      });
    });
    return count ? { text: JSON.stringify(data), count } : { text: json, count: 0 };
  }

  // Un modèle lu tel que Grist le range ({ id, Contenu, HeaderFooter, … } en texte brut) : ce qu'il faut écrire pour qu'il suive les renommages, ou null.
  function planTemplate(row, m, ctx) {
    const fields = {};
    let count = 0;
    const keep = (column, text, n) => { if (n) { fields[column] = text; count += n; } };
    if (row.TypeModele === 'macro') {
      const next = rewriteMacro(row.Contenu, m, ctx.page);
      keep('Contenu', next.text, next.count);
    } else {
      const next = rewriteHtml(row.Contenu, m, ctx);
      keep('Contenu', next.html, next.count);
      const headers = rewriteHeaderFooter(row.HeaderFooter, m, ctx);
      keep('HeaderFooter', headers.text, headers.count);
    }
    TEXT_COLUMNS.forEach(column => {
      const next = rewriteText(row[column], m, ctx.trigger);
      keep(column, next.text, next.count);
    });
    return count ? { id: row.id, fields, count } : null;
  }

  // Les clés de correspondance entre tables : { tableCible, mode, colonneCible, colonneSource } -> ce qui change, ou null. La colonne cible est une colonne de la table cible ; la colonne
  // source une colonne de la table de la page, que le texte « id » désigne par son identifiant de ligne.
  function planLink(rule, m, page) {
    const next = { tableCible: rule.tableCible, mode: rule.mode, colonneCible: rule.colonneCible, colonneSource: rule.colonneSource };
    let count = 0;
    const table = m.mapTable(rule.tableCible);
    // La table renommée a déjà sa clé (la personne l'a reposée à la main) : elle reste, l'ancienne n'est pas recopiée par-dessus.
    if (table && GristAPI.getLinkRule(table)) return null;
    if (table) { next.tableCible = table; count++; }
    if (rule.mode === 'match' && rule.colonneCible && rule.colonneCible !== 'id') {
      const target = m.mapQualified(rule.tableCible, rule.colonneCible);
      if (target) { next.colonneCible = target.column; if (!table) next.tableCible = target.table; count++; }
    }
    if (rule.mode === 'match' && rule.colonneSource && rule.colonneSource !== 'id' && page && !m.otherTableHasColumn(rule.colonneSource, page)) {
      const source = m.mapBare(rule.colonneSource, page);
      if (source !== null) { next.colonneSource = source; count++; }
    }
    return count ? { from: rule.tableCible, rule: next, count } : null;
  }

  async function fetchTemplateRows() {
    const data = await grist.docApi.fetchTable(Templates.TABLE_NAME);
    return (data.id || []).map((id, i) => {
      const row = { id };
      TEMPLATE_COLUMNS.forEach(column => { row[column] = data[column] ? data[column][i] : undefined; });
      return row;
    });
  }

  function isReadOnly() { return typeof AccessRights !== 'undefined' && AccessRights.get().readOnly; }

  // Le modèle affiché est redessiné par le chemin ordinaire d'un changement de modèle (js/main.js:onTemplateSelectChange), qui relit le cache des modèles. Seulement si la liste montre bien
  // ce modèle : l'évènement recharge ce que la liste montre. Faux sinon (le modèle reste à l'écran tel qu'il était : la passe est reprise à l'ouverture suivante).
  function redisplayCurrentTemplate(id) {
    const select = document.getElementById('template-select');
    if (!select || select.value !== String(id)) return false;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function statusMessage(variables, templates, links) {
    const parts = [];
    if (variables) parts.push(I18n.t('schemaRenames.part.variables', { count: variables, models: templates }));
    if (links) parts.push(I18n.t('schemaRenames.part.links', { count: links }));
    return parts.length ? I18n.t('schemaRenames.status', { parts: parts.join(', ') }) : '';
  }

  // L'appel de js/main.js, en toute dernière ligne d'init(). `hooks` : { isUntouched() - vrai tant que la personne n'a rien modifié, notify(texte) - le coin d'état }.
  // Rend un compte rendu (tests) : { skipped } quand la passe n'a pas lieu ou est reprise plus tard, { bootstrapped }, sinon { renames, variables, templates, links, redisplayed }.
  async function checkAfterOpen(hooks) {
    if (running) return { skipped: 'running' };
    running = true;
    try { return await runOnce(hooks || {}); } finally { running = false; }
  }

  async function runOnce(hooks) {
    if (isReadOnly()) return { skipped: 'readOnly' };
    const [docKey, current] = await Promise.all([documentKey(), readSchema()]);
    if (!docKey) return { skipped: 'noDocument' };
    if (!current) return { skipped: 'noSchema' };
    const saved = loadSnapshot(docKey);
    if (!saved) { saveSnapshot(docKey, current.snapshot); return { bootstrapped: true }; }
    const changes = diff(saved, current.snapshot);
    if (!changes.any) {
      if (JSON.stringify(saved) !== JSON.stringify(current.snapshot)) saveSnapshot(docKey, current.snapshot);
      return { renames: 0 };
    }

    const m = createMapper(saved, current.snapshot, current.refs);
    const pageName = GristAPI.getCurrentTableId() || await GristAPI.detectTableId(null, 'schemaRenames');
    // Sans la table de la page, une colonne sans nom de table ne se lirait pas : la passe attend la prochaine ouverture plutôt que d'avancer l'instantané sur une lecture incomplète.
    if (!pageName) return { skipped: 'noPage' };
    const ctx = { page: m.tableContext(pageName), trigger: Variables.triggerChar() };
    const rows = await fetchTemplateRows();
    const templates = rows.map(row => planTemplate(row, m, ctx)).filter(Boolean);
    const links = GristAPI.getAllLinkRules().map(rule => planLink(rule, m, ctx.page)).filter(Boolean);
    const summary = { renames: changes.tables.length + changes.columns.length, variables: 0, templates: templates.length, links: links.length, redisplayed: false };
    templates.forEach(t => { summary.variables += t.count; });
    if (!templates.length && !links.length) { saveSnapshot(docKey, current.snapshot); return summary; }

    // La personne a déjà commencé à modifier : rien n'est écrit, la passe reprend à la prochaine ouverture (l'instantané n'avance pas).
    const untouched = () => (typeof hooks.isUntouched === 'function' ? hooks.isUntouched() : true);
    if (!untouched()) return Object.assign(summary, { skipped: 'touched' });

    // Lecture, réécriture, écriture à la suite, sans rien d'autre entre : un modèle enregistré par quelqu'un d'autre dans l'intervalle ne serait écrasé que par un intervalle de quelques millisecondes.
    if (templates.length) await grist.docApi.applyUserActions(templates.map(t => ['UpdateRecord', Templates.TABLE_NAME, t.id, t.fields]));
    // La clé de la nouvelle table d'abord, l'ancienne retirée ensuite : une panne entre les deux laisse une clé de trop, jamais une clé perdue.
    for (const link of links) {
      await GristAPI.saveLinkRule(link.rule.tableCible, link.rule);
      if (link.from !== link.rule.tableCible) await GristAPI.deleteLinkRule(link.from);
    }
    await Templates.loadAll();

    let complete = true;
    const currentId = Templates.getCurrentId();
    if (currentId != null && templates.some(t => String(t.id) === String(currentId))) {
      if (untouched() && redisplayCurrentTemplate(currentId)) summary.redisplayed = true; else complete = false;
    }
    if (complete) saveSnapshot(docKey, current.snapshot); else summary.skipped = 'touched';
    const message = statusMessage(summary.variables, summary.templates, summary.links);
    if (message && typeof hooks.notify === 'function') hooks.notify(message);
    return summary;
  }

  return { checkAfterOpen, reset, diff, createMapper, rewriteHtml, rewriteText, rewriteFormula, rewriteCondition, rewriteLoop, rewriteMacro, rewriteHeaderFooter, planTemplate, planLink };
})();
