// Banc de charge (dev-tests/load-tests.mjs) : fabrique DANS la page, avant l'ouverture du widget, un document Grist en volume pour le faux Grist
// (dev-tests/grist-stub.js), et pose les compteurs de ce que le widget lit et écrit. Chargé par page.addInitScript APRÈS window.__LOAD_SPEC (la description du
// document, posée par load-lib.mjs) ; définit window.__preSeedGristStub, que grist-stub.js appelle juste après avoir construit window.__gristStub, donc AVANT le
// premier fetchTable de GristAPI.init().
//
// Description (window.__LOAD_SPEC) :
//   tables : [{ id, rows, columns: [{ id, type, choices?, listLen?, valueEvery?, constant?, div?, shows? }] }]  - les valeurs sont déterministes (aucun hasard), les Références pointent des lignes qui existent ;
//     `listLen` : une Liste de choix porte `listLen` valeurs par ligne (prises dans `choices`, qui en compte au moins autant),
//     `constant` : toutes les lignes ont cette valeur, `div` : `div` lignes consécutives partagent la même (1, 1, 1, 2, 2, 2...),
//     `shows` : pour une Référence, la colonne de la table liée qu'elle montre (visibleCol : les valeurs que propose la fenêtre Condition)
//   links  : [{ table, mode, target, source }]                               - Publipostage_LiensTables
//   models : { count, paragraphs, table, columns, folders, pinned, extraChars, images, imageChars, logoKb, type, macro } - modèles déjà enregistrés (Publipostage_Modeles) et leur rangement ;
//     logoKb : un logo (image PNG valide, ~logoKb Ko) en tête de chaque modèle,
//     hf : true pose un en-tête et un pied de page (première page différente : quatre zones, chacune avec une bulle de `table`) à chaque modèle ;
//     macro : { slots, rules, column } ajoute un macro-modèle « Macro A » de `slots` positions, chacune à `rules` règles sur `column` (jamais remplies : le modèle par défaut gagne)
//   formats, abbreviations : lignes de Publipostage_FormatsPage / Publipostage_Abreviations
//   rights : { table, rows, columns? } - table des droits (Réglages > Accès) ; options : les options du widget (ex. { droitsAcces: { table, emailColumn, readOnlyColumn } }) ; userEmail : l'e-mail de la personne
//   internal : [{ table, columns, rows }] - une table interne que le widget lit si elle existe (ex. Publipostage_Commentaires), lignes données telles quelles
(function () {
  const spec = window.__LOAD_SPEC || {};

  // Compteurs de ce que le widget demande à Grist : un fetchTable ramène la table ENTIÈRE, c'est le coût réel d'un appel (cases = lignes x colonnes).
  const stats = window.__LOAD = {
    fetch: { calls: 0, rows: 0, cells: 0, ms: 0, modelChars: 0, byTable: {} },
    apply: { calls: 0, actions: 0, chars: 0 },
    listTables: 0,
    readyAt: null,
    reset() { this.fetch = { calls: 0, rows: 0, cells: 0, ms: 0, modelChars: 0, byTable: {} }; this.apply = { calls: 0, actions: 0, chars: 0 }; this.listTables = 0; },
    snapshot() {
      const f = this.fetch;
      return { fetchCalls: f.calls, fetchRows: f.rows, fetchCells: f.cells, fetchMs: Math.round(f.ms), modelChars: f.modelChars, applyCalls: this.apply.calls, applyChars: this.apply.chars, listTables: this.listTables, byTable: JSON.parse(JSON.stringify(f.byTable)) };
    },
  };

  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('status-msg');
    if (!el) return;
    new MutationObserver(() => { if (!stats.readyAt && /prêt|ready/i.test(el.textContent || '')) stats.readyAt = Math.round(performance.now()); })
      .observe(el, { childList: true, characterData: true, subtree: true });
  });

  const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zêta', 'éta', 'thêta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rhô', 'sigma', 'tau', 'upsilon'];
  const baseTime = 1700000000;

  function cellValue(col, tableId, r, c, rowsOf) {
    const type = col.type;
    if (col.constant !== undefined) return col.constant; // une valeur unique (ex. toutes les lignes d'une table liée pointent la facture 1)
    if (col.div) return Math.floor(r / col.div) + 1; // des groupes de `div` lignes consécutives qui partagent une valeur (ex. `div` lignes par facture)
    if (col.valueEvery && r % col.valueEvery !== 0) return type === 'Text' || type === 'Choice' ? '' : null;
    if (type === 'Text') return tableId + ' ' + col.id + ' ' + WORDS[(r + c) % WORDS.length] + ' ' + (r + 1);
    if (type === 'Numeric') return ((r * 37 + c * 11) % 100000) / 100;
    if (type === 'Int') return (r * 31 + c) % 1000;
    if (type === 'Date') return baseTime + (r % 1500) * 86400;
    if (type === 'DateTime') return baseTime + r * 3600;
    if (type === 'Bool') return (r + c) % 3 === 0;
    if (type === 'Choice') return col.choices[(r + c) % col.choices.length];
    if (type === 'ChoiceList' && col.listLen) return ['L'].concat(Array.from({ length: col.listLen }, (_, i) => col.choices[(r + c + i) % col.choices.length])); // `listLen` valeurs par ligne
    if (type === 'ChoiceList') return ['L', col.choices[(r + c) % col.choices.length], col.choices[(r + c + 1) % col.choices.length]];
    const ref = /^(Ref|RefList):(.+)$/.exec(type);
    if (ref) {
      const target = rowsOf[ref[2]] || 1;
      if (ref[1] === 'Ref') return (r * 7 + c) % target + 1;
      return ['L', (r * 7 + c) % target + 1, (r * 13 + c) % target + 1];
    }
    return null; // Attachments et autres : aucune valeur
  }

  function buildTable(stub, t, rowsOf) {
    const columns = {};
    const choices = {};
    const visible = {};
    t.columns.forEach(col => { columns[col.id] = col.type; if (col.choices) choices[col.id] = col.choices; if (col.shows) visible[col.id] = col.shows; });
    stub.setVariables(t.id, columns, choices, null, visible);
    const rows = new Array(t.rows);
    for (let r = 0; r < t.rows; r++) {
      const row = { id: r + 1 };
      for (let c = 0; c < t.columns.length; c++) row[t.columns[c].id] = cellValue(t.columns[c], t.id, r, c, rowsOf);
      rows[r] = row;
    }
    stub.setRows(t.id, rows);
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Une bulle #Table.Colonne telle que l'éditeur la sérialise.
  function badge(table, column) { return '<span class="var-badge" data-table="' + table + '" data-column="' + column + '" data-key="' + table + '.' + column + '"></span>'; }

  // Une image PNG valide de ~`kb` Ko que la compression ne réduit pas (du bruit) : un logo lourd, que chaque PDF d'un lot embarque.
  const pngCache = {};
  function noisyPng(kb) {
    if (pngCache[kb]) return pngCache[kb];
    const side = Math.max(8, Math.ceil(Math.sqrt(kb * 1024 / 3)));
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d'); const img = ctx.createImageData(side, side);
    let seed = 12345;
    for (let i = 0; i < img.data.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; img.data[i] = i % 4 === 3 ? 255 : (seed >> 16) & 255; }
    ctx.putImageData(img, 0, 0);
    return (pngCache[kb] = canvas.toDataURL('image/png'));
  }

  // Le HTML d'un modèle de `paragraphs` paragraphes, chacun avec une bulle, plus `extraChars` de texte et `images` images en data URI.
  function modelHtml(m, index) {
    const cols = m.columns && m.columns.length ? m.columns : ['Nom'];
    let html = (m.logoKb ? '<p><img class="editor-image" alt="Logo" src="' + noisyPng(m.logoKb) + '" style="width: 120px" data-layer="normal" data-wrap="inline"></p>' : '') + '<h1>Modèle ' + (index + 1) + '</h1>';
    for (let p = 0; p < (m.paragraphs || 5); p++) {
      html += '<p>Paragraphe ' + (p + 1) + ' du modèle ' + (index + 1) + ' : ' + WORDS[p % WORDS.length] + ' ' + (m.table ? badge(m.table, cols[p % cols.length]) : '') + ' et la suite du texte.</p>';
    }
    if (m.extraChars) html += '<p>' + 'x'.repeat(m.extraChars) + '</p>';
    for (let i = 0; i < (m.images || 0); i++) {
      html += '<p><img class="editor-image" alt="Image" src="data:image/png;base64,' + 'A'.repeat(m.imageChars || 1000) + '" style="width: 120px" data-layer="normal" data-wrap="inline"></p>';
    }
    return html;
  }
  const NO_HF = JSON.stringify({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
  // En-tête et pied de page : quatre zones (page courante, première page), chacune avec une bulle - l'export résout chaque zone comme un morceau de document.
  function hfJson(m) {
    const cols = m.columns && m.columns.length ? m.columns : ['Nom'];
    const zone = (label, c) => '<p>' + label + ' ' + badge(m.table, cols[c % cols.length]) + '</p>';
    return JSON.stringify({ enabled: true, differentFirstPage: true, header: { default: zone('En-tête', 0), first: zone('Première page', 1) }, footer: { default: zone('Pied', 2), first: zone('Pied première page', 3) } });
  }

  function seedModels(stub, m) {
    const st = stub.state;
    const cols = ['Nom', 'Contenu', 'NomFichierPDF', 'HeaderFooter', 'DateModif', 'Margins', 'EstParDefaut', 'TypeModele', 'Destinataires', 'Cc', 'Cci', 'Objet', 'SuiviModifications'];
    const T = { id: [] };
    cols.forEach(c => { T[c] = []; });
    const now = Math.floor(Date.now() / 1000) - 3600;
    const pushRow = (id, values) => { T.id.push(id); cols.forEach(c => T[c].push(values[c])); };
    for (let i = 0; i < m.count; i++) {
      pushRow(i + 1, { Nom: (m.namePrefix || 'Modèle ') + String(i + 1).padStart(4, '0'), Contenu: modelHtml(m, i), NomFichierPDF: '', HeaderFooter: m.hf ? hfJson(m) : NO_HF, DateModif: now, Margins: '', EstParDefaut: false, TypeModele: m.type || 'document', Destinataires: '', Cc: '', Cci: '', Objet: '', SuiviModifications: '' });
    }
    let total = m.count;
    if (m.macro) {
      const slots = [];
      for (let k = 0; k < m.macro.slots; k++) {
        const pick = String(1 + k % Math.max(1, m.count));
        if (!m.macro.rules) { slots.push({ type: 'fixed', modeleId: pick }); continue; }
        const rules = [];
        for (let j = 0; j < m.macro.rules; j++) rules.push({ column: m.macro.column, operator: '=', value: 'jamais-' + k + '-' + j, modeleId: String(1 + (k * 7 + j + 1) % Math.max(1, m.count)) });
        slots.push({ type: 'conditional', rules, defaultModeleId: pick });
      }
      total++;
      pushRow(total, { Nom: 'Macro A', Contenu: JSON.stringify({ slots }), NomFichierPDF: '', HeaderFooter: NO_HF, DateModif: now, Margins: '', EstParDefaut: false, TypeModele: 'macro', Destinataires: '', Cc: '', Cci: '', Objet: '', SuiviModifications: '' });
    }
    st.rows.Publipostage_Modeles = T;
    st.nextRowId.Publipostage_Modeles = total + 1;
    // Rangement : Publipostage_PreferencesModeles (une ligne par modèle rangé ou épinglé, utilisateur '' = repli anonyme du stub).
    if (m.folders || m.pinned) {
      const P = { id: [], Utilisateur: [], ModeleId: [], Epingle: [], Dossier: [], Replie: [] };
      for (let i = 0; i < m.count; i++) {
        const pinned = m.pinned && i % Math.max(1, Math.floor(m.count / m.pinned)) === 0;
        const folder = m.folders ? 'Dossier ' + String(i % m.folders + 1).padStart(3, '0') + (m.depth > 1 ? '/Sous-dossier ' + (i % 7 + 1) : '') : '';
        if (!pinned && !folder) continue;
        P.id.push(P.id.length + 1); P.Utilisateur.push(''); P.ModeleId.push(i + 1); P.Epingle.push(!!pinned); P.Dossier.push(folder); P.Replie.push(false);
      }
      if (st.tables.indexOf('Publipostage_PreferencesModeles') === -1) st.tables.push('Publipostage_PreferencesModeles');
      st.rows.Publipostage_PreferencesModeles = P;
      st.nextRowId.Publipostage_PreferencesModeles = P.id.length + 1;
    }
  }

  function seedLinks(stub, rules) {
    const st = stub.state;
    const T = { id: [], TableCible: [], Mode: [], ColonneCible: [], ColonneSource: [] };
    rules.forEach((r, i) => { T.id.push(i + 1); T.TableCible.push(r.table); T.Mode.push(r.mode || 'match'); T.ColonneCible.push(r.target || ''); T.ColonneSource.push(r.source || ''); });
    st.rows.Publipostage_LiensTables = T;
    st.nextRowId.Publipostage_LiensTables = T.id.length + 1;
  }

  // Une table interne que le widget lit si elle existe (formats de page, abréviations) : déclarée dans listTables, colonnes et lignes posées.
  function seedInternal(stub, tableId, columns, rows) {
    const st = stub.state;
    if (st.tables.indexOf(tableId) === -1) st.tables.push(tableId);
    const T = { id: [] };
    columns.forEach(c => { T[c] = []; });
    rows.forEach((row, i) => { T.id.push(i + 1); columns.forEach(c => T[c].push(row[c])); });
    st.rows[tableId] = T;
    st.nextRowId[tableId] = rows.length + 1;
  }

  window.__preSeedGristStub = function (stub) {
    // Compteurs : chaque lecture entière d'une table, chaque écriture, chaque liste des tables.
    const docApi = window.grist.docApi;
    const rawFetch = docApi.fetchTable.bind(docApi);
    docApi.fetchTable = async function (tableId) {
      const t0 = performance.now();
      const data = await rawFetch(tableId);
      const keys = Object.keys(data || {});
      const rows = data && data.id ? data.id.length : 0;
      const f = stats.fetch;
      f.calls++; f.rows += rows; f.cells += rows * keys.length; f.ms += performance.now() - t0;
      if (tableId === 'Publipostage_Modeles' && data && data.Contenu) f.modelChars += data.Contenu.reduce((a, c) => a + (c ? c.length : 0), 0);
      const by = f.byTable[tableId] || (f.byTable[tableId] = { calls: 0, cells: 0 });
      by.calls++; by.cells += rows * keys.length;
      return data;
    };
    const rawList = docApi.listTables.bind(docApi);
    docApi.listTables = async function () { stats.listTables++; return rawList(); };
    const rawApply = docApi.applyUserActions.bind(docApi);
    docApi.applyUserActions = function (actions) {
      stats.apply.calls++; stats.apply.actions += actions.length;
      try { stats.apply.chars += JSON.stringify(actions).length; } catch (e) { /* non sérialisable : non compté */ }
      return rawApply(actions);
    };
    if (spec.latency) stub.setLatency(spec.latency);

    const t0 = performance.now();
    const tables = spec.tables || [];
    const rowsOf = {};
    tables.forEach(t => { rowsOf[t.id] = t.rows; });
    tables.forEach(t => buildTable(stub, t, rowsOf));
    if (spec.links) seedLinks(stub, spec.links);
    if (spec.models) seedModels(stub, spec.models);
    if (spec.formats) seedInternal(stub, 'Publipostage_FormatsPage', ['Nom', 'Largeur', 'Hauteur'], spec.formats);
    if (spec.abbreviations) seedInternal(stub, 'Publipostage_Abreviations', ['Utilisateur', 'Abreviation', 'Texte'], spec.abbreviations);
    if (spec.rights) {
      const cols = {}; (spec.rights.columns || ['Email', 'Role']).forEach(c => { cols[c] = 'Text'; });
      buildTable(stub, { id: spec.rights.table, rows: spec.rights.rows, columns: Object.keys(cols).map(id => ({ id, type: 'Text' })) }, rowsOf);
    }
    (spec.internal || []).forEach(t => seedInternal(stub, t.table, t.columns, t.rows));
    if (spec.userEmail) stub.setUserEmail(spec.userEmail);
    if (spec.options) stub.setWidgetOptions(spec.options);
    stats.seedMs = Math.round(performance.now() - t0);
    stats.reset();
  };

  window.__LoadDoc = { modelHtml, badge, esc, WORDS };
})();
