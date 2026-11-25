// LA LECTURE LÉGÈRE DE LA TABLE DES MODÈLES (consigne 103 de GFS, demande 2). La table des modèles porte les noms ET les textes : chez une personne elle pèse des dizaines de Mo (des présentations importées, 38 millions
// de signes dans une seule ligne), et chaque lecture entière la rapporte d'un coup, des secondes de page prise ; au-dessus d'un certain poids, Grist ou son hôte ne la rendent même plus. Ce module ne lit rien lui-même : il
// compose les demandes (le SQL de la liste, les identifiants à relire par l'interface REST) et remet en forme ce qui revient ; js/templates.js les envoie (GristAPI.lightQuery, GristAPI.lightRecords) et tient le cache.
//
//   TemplatesLight.listSql(map, { weights, smallBytes }) -> le SQL de la liste : une ligne par modèle, SANS son texte quand il est long (sa longueur seulement), sous les noms anglais quel que soit le nom réel des colonnes
//   TemplatesLight.columnar(records)           -> { data, lens } : les lignes du SQL rangées comme fetchTable (une colonne = un tableau), et les longueurs à part
//   TemplatesLight.englishRecords(records, map)-> les lignes REST ({ id, fields } sous les noms réels) rangées comme fetchTable, sous les noms anglais
//   TemplatesLight.chunkIds(ids, weightOf)     -> les identifiants en paquets que la page peut recevoir d'un coup (un identifiant trop lourd part seul)
//   TemplatesLight.citingSql(map, texts)       -> le SQL des lignes dont le texte cite l'un de ces mots (la recherche d'impact se fait côté Grist : seuls les identifiants reviennent)
//   TemplatesLight.datesSql(map, ids)          -> le SQL des dates (`ModifiedAt`) de ces lignes seules : ce que l'enregistrement relit après avoir écrit
//   TemplatesLight.tokensSql(map, ids)         -> le SQL des jetons de ces modèles (ou de tous : le numéro et le jeton, rien d'autre) : ce que la fenêtre des versions cherche pour reconnaître les modèles qui existent encore, et le lien d'un tableau pour poser le sien
//   TemplatesLight.settingsSql(map, column)    -> le SQL de la ligne des réglages du document, avec la colonne `column` (le mot de passe des PDF protégés) : rien d'une autre ligne
//   TemplatesLight.identitySql(map)            -> le SQL de ce qui distingue les modèles (numéro, nom, type, ★, jeton), sans un seul texte : de quoi rendre une ligne supprimée sans lire la table
//   TemplatesLight.utf8Length(text)            -> le poids d'un texte en octets, comme la liste le mesure (sans le copier)
//
// Le SQL voyage dans l'adresse de la demande (`GET /sql?q=…`), et le pare-feu devant le Grist de la DINUM (Incapsula) refuse en 403, sans en-tête CORS (le navigateur dit « réseau » : la lecture est perdue sans un mot), toute
// demande dont le texte contient `case when`, `or 1=1` ou `drop table` (faits vérifiés 136 de GFS) ; relevé chez le porteur le 25/11 (faits vérifiés 173 et 174), il refuse aussi un `substr(…) <> …` et deux sous-requêtes côte à côte.
// Rien d'ici ne les écrit : une condition s'écrit `iif(condition, texte, NULL)` (le kit de GFS la dit passer, vérifiée en direct le 18/11 par la synchronisation : `iif`, `nullif`, `sum(a is null)`, `!= ''`, `max`, `count(distinct …)`),
// un poids `COALESCE(length(CAST(colonne AS BLOB)), 0)` (la forme que GFS a vue passer), une exclusion `NOT LIKE` ou `!=`. dev-tests/unit-templates-light.mjs les refuse dans chaque SQL que ce module écrit, et le faux serveur
// de lecture légère (dev-tests/light-server.mjs) les refuse comme le pare-feu, sans en-tête CORS : une liste qui en contiendrait un ne passerait aucun des essais de la lecture légère.
const TemplatesLight = (function () {
  // `map` (SchemaColumns.columnMap) : { table: le nom réel de la table, columns: Map(nom anglais -> nom réel) } ; les noms réels sont ceux du document (les anciens, français, d'une version d'avant).

  // Les colonnes qui sont toujours courtes : un nom, un type, une date, un jeton, des adresses.
  const SCALAR_COLUMNS = ['Name', 'TemplateType', 'IsDefault', 'ModifiedAt', 'ModifiedBy', 'Token', 'LinkedEmail', 'PdfFileName', 'To', 'Cc', 'Bcc', 'Subject', 'Attachments'];
  // Les colonnes qui peuvent être longues : le texte, l'en-tête et le pied de page, les marges et le thème (une présentation y range le sien), les suggestions du suivi, la notice. La liste ne les donne que quand elles sont courtes.
  const HEAVY_COLUMNS = ['Content', 'HeaderFooter', 'Margins', 'TrackedChanges', 'Notice'];
  // Une colonne de cette longueur ou moins vient avec la liste : un document ordinaire n'a rien à relire, seuls les gros textes (une présentation, un document plein d'images) se lisent à la demande.
  const SMALL_BYTES = 16 * 1024;
  // Les types dont le texte vient toujours avec la liste, quelle que soit sa longueur : un macro-modèle y range la liste de ses emplacements (la liste des modèles en montre le résumé) et la ligne des réglages du document ses
  // réglages (adoptDocumentSettings) ; l'un comme l'autre sont courts.
  const ALWAYS_TYPES = ['macro', 'reglages'];
  const LEN_SUFFIX = '__len';
  // Ce qu'une page reçoit en une réponse REST : au-delà, les lignes viennent en plusieurs demandes (une ligne seule, même plus lourde, part seule).
  const CHUNK_BYTES = 24 * 1024 * 1024;
  const CHUNK_ROWS = 50;

  const quoteName = name => '"' + String(name).replace(/"/g, '""') + '"';
  const quoteText = text => "'" + String(text).replace(/'/g, "''") + "'";

  // `weights` faux : la liste sans les longueurs (pas un seul texte lu côté Grist : les seuls textes qui viennent sont ceux des types toujours courts). C'est le repli d'une liste dont les longueurs n'ont pas pu être calculées dans le
  // temps que Grist laisse à une requête SQL (une seconde par défaut).
  // `smallBytes` (les essais) : le seuil en octets sous lequel un texte vient avec la liste (SMALL_BYTES par défaut ; 0 : rien ne vient que les types toujours courts, tout le reste se lit à la demande).
  // `ids` (consigne 103, lot 3) : seules ces lignes (des numéros entiers) ; la liste d'un modèle et de ceux qu'il désigne, que l'enregistrement relit pour savoir si l'un a changé ailleurs, sans la table.
  function listSql(map, options) {
    const weights = !options || options.weights !== false;
    const small = options && Number.isFinite(options.smallBytes) ? options.smallBytes : SMALL_BYTES;
    const column = english => (map.columns.has(english) ? quoteName(map.columns.get(english)) : null);
    const parts = ['id'];
    SCALAR_COLUMNS.forEach((english) => { parts.push((column(english) || 'NULL') + ' AS ' + quoteName(english)); });
    const type = column('TemplateType');
    const always = type ? type + ' IN (' + ALWAYS_TYPES.map(quoteText).join(', ') + ')' : '0';
    HEAVY_COLUMNS.forEach((english) => {
      const actual = column(english);
      if (!actual) {
        parts.push('NULL AS ' + quoteName(english));
        if (weights) parts.push('0 AS ' + quoteName(english + LEN_SUFFIX));
        return;
      }
      const size = 'COALESCE(length(CAST(' + actual + ' AS BLOB)), 0)';
      // `iif(condition, texte, NULL)` et non `CASE WHEN … THEN … END` : le pare-feu de la DINUM refuse `case when` (cf. l'en-tête), et dit la même chose.
      parts.push('iif(' + always + (weights ? ' OR ' + size + ' <= ' + small : '') + ', ' + actual + ', NULL) AS ' + quoteName(english));
      if (weights) parts.push(size + ' AS ' + quoteName(english + LEN_SUFFIX));
    });
    const only = options && Array.isArray(options.ids) ? wholeIds(options.ids) : null;
    // Dans l'ordre de la table, comme la lecture entière : le ★ du document est « le premier de la table » (Templates.getDefaultId).
    return 'SELECT ' + parts.join(', ') + ' FROM ' + quoteName(map.table) + (only ? ' WHERE id IN (' + (only.length ? only.join(', ') : 'NULL') + ')' : '') + ' ORDER BY ' + (map.columns.has('manualSort') ? quoteName('manualSort') + ', ' : '') + 'id';
  }

  // Les numéros de ligne de `ids` qui sont des entiers, sans doublon : rien d'autre n'entre dans un SQL.
  function wholeIds(ids) {
    const seen = new Set();
    ids.forEach((id) => { const number = Number(id); if (id !== null && id !== '' && Number.isSafeInteger(number)) seen.add(number); });
    return Array.from(seen);
  }

  // Les dates de ces lignes seules. null : la table n'a pas de colonne de date, ou rien à demander.
  function datesSql(map, ids) {
    const only = wholeIds(ids || []);
    if (!only.length || !map.columns.has('ModifiedAt')) return null;
    return 'SELECT id, ' + quoteName(map.columns.get('ModifiedAt')) + ' AS "ModifiedAt" FROM ' + quoteName(map.table) + ' WHERE id IN (' + only.join(', ') + ') ORDER BY id';
  }

  // Les jetons de ces modèles (`ids` absent : de tous) : le numéro de la ligne et son jeton. Une table qui n'a pas la colonne (aucun lien, aucune version n'en a encore demandé) rend les numéros seuls : celui qui lit y voit qu'aucune
  // ligne n'a de jeton, comme dans la table entière. null : rien à demander.
  function tokensSql(map, ids) {
    const only = Array.isArray(ids) ? wholeIds(ids) : null;
    if (only && !only.length) return null;
    const token = map.columns.has('Token') ? ', ' + quoteName(map.columns.get('Token')) + ' AS "Token"' : '';
    return 'SELECT id' + token + ' FROM ' + quoteName(map.table) + (only ? ' WHERE id IN (' + only.join(', ') + ')' : '') + ' ORDER BY id';
  }

  // La ou les lignes des réglages du document (celles dont le type est « reglages » ; la première compte, comme la lecture entière) avec leur type et la colonne `column` (son nom anglais) quand la table l'a : une table sans cette colonne
  // rend ses lignes sans elle, et celui qui lit en conclut qu'il n'y a rien. null : la table n'a pas de colonne de type.
  function settingsSql(map, column) {
    if (!map.columns.has('TemplateType')) return null;
    const type = quoteName(map.columns.get('TemplateType'));
    const wanted = column && map.columns.has(column) ? ', ' + quoteName(map.columns.get(column)) + ' AS ' + quoteName(column) : '';
    return 'SELECT id, ' + type + ' AS "TemplateType"' + wanted + ' FROM ' + quoteName(map.table) + ' WHERE ' + type + ' = ' + quoteText('reglages') + ' ORDER BY id';
  }

  // Ce qui distingue les modèles : leur numéro, leur nom, leur type, le ★ et le jeton, ceux que la table a. Aucun texte long : rendre une ligne supprimée (restoreRow) ne lit que de quoi lui trouver un nom libre et une place.
  function identitySql(map) {
    const names = ['Name', 'TemplateType', 'IsDefault', 'Token'].filter(name => map.columns.has(name));
    return 'SELECT id' + names.map(name => ', ' + quoteName(map.columns.get(name)) + ' AS ' + quoteName(name)).join('') + ' FROM ' + quoteName(map.table) + ' ORDER BY id';
  }

  // Les lignes du SQL (des objets { colonne: valeur }) en colonnes, comme fetchTable : templateFromRow les lit telles quelles. `lens` : la longueur (en octets) de chaque colonne longue, ligne par ligne ; absente quand la liste
  // n'a pas pesé.
  function columnar(records) {
    const table = { id: [] };
    const lens = {};
    const count = records.length;
    records.forEach((row, at) => {
      Object.keys(row).forEach((key) => {
        if (key.length > LEN_SUFFIX.length && key.slice(-LEN_SUFFIX.length) === LEN_SUFFIX) {
          const name = key.slice(0, -LEN_SUFFIX.length);
          if (!lens[name]) lens[name] = new Array(count).fill(null);
          lens[name][at] = row[key];
        } else {
          if (!table[key]) table[key] = new Array(count).fill(null);
          table[key][at] = row[key];
        }
      });
    });
    return { data: table, lens };
  }

  // Les lignes de l'interface REST (`{ id, fields }`, les colonnes sous leur nom réel) rangées comme fetchTable sous les noms anglais : une colonne que le widget ne connaît pas garde son nom.
  function englishRecords(records, map) {
    const english = new Map();
    map.columns.forEach((actual, name) => { english.set(actual, name); });
    const table = { id: [] };
    const count = records.length;
    records.forEach((record, at) => {
      table.id.push(record.id);
      const fields = (record && record.fields) || {};
      Object.keys(fields).forEach((actual) => {
        const key = english.get(actual) || actual;
        if (!table[key]) table[key] = new Array(count).fill(null);
        table[key][at] = fields[actual];
      });
    });
    return table;
  }

  // `weightOf(id)` : le poids connu de la ligne (octets), ou 0 quand on ne le sait pas. Les lignes gardent leur ordre ; un paquet se ferme quand il atteindrait CHUNK_BYTES ou CHUNK_ROWS lignes.
  function chunkIds(ids, weightOf) {
    const chunks = [];
    let current = [];
    let bytes = 0;
    ids.forEach((id) => {
      const weight = Math.max(0, Number(weightOf(id)) || 0);
      if (current.length && (current.length >= CHUNK_ROWS || bytes + weight > CHUNK_BYTES)) { chunks.push(current); current = []; bytes = 0; }
      current.push(id);
      bytes += weight;
    });
    if (current.length) chunks.push(current);
    return chunks;
  }

  // Les numéros des lignes dont le texte contient l'un des mots de `texts` : un filtre côté Grist (instr), qui ne rend que les numéros. Un mot que la recherche d'impact cherche en toute rigueur (un nom de table, de colonne)
  // est toujours trouvé tel quel dans le texte qui le cite : la liste rendue contient celles qui comptent, et peut en contenir de trop (le widget les relit, puis refait son propre tri). null : rien à chercher.
  function citingSql(map, texts) {
    const words = Array.from(new Set((texts || []).filter(text => typeof text === 'string' && text !== ''))).slice(0, 40);
    // Le texte, puis l'en-tête et le pied de page (un macro-modèle assemblé les scrute tous deux) : ce que la table en a, sous les noms réels.
    const columns = ['Content', 'HeaderFooter'].filter(name => map.columns.has(name)).map(name => quoteName(map.columns.get(name)));
    if (!words.length || !columns.length) return null;
    const tests = [];
    columns.forEach((column) => { words.forEach((word) => { tests.push('instr(' + column + ', ' + quoteText(word) + ') > 0'); }); });
    return 'SELECT id FROM ' + quoteName(map.table) + ' WHERE ' + tests.join(' OR ') + ' ORDER BY id';
  }

  // Le poids d'un texte en octets (UTF-8), sans en faire une copie : un texte de plusieurs dizaines de Mo n'a pas à être encodé pour être pesé.
  function utf8Length(text) {
    const value = String(text == null ? '' : text);
    let bytes = 0;
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit < 0x80) bytes += 1;
      else if (unit < 0x800) bytes += 2;
      else if (unit >= 0xD800 && unit <= 0xDBFF && i + 1 < value.length && (value.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { bytes += 4; i++; }
      else bytes += 3;
    }
    return bytes;
  }

  return { SCALAR_COLUMNS, HEAVY_COLUMNS, SMALL_BYTES, ALWAYS_TYPES, LEN_SUFFIX, quoteName, quoteText, listSql, datesSql, tokensSql, settingsSql, identitySql, wholeIds, columnar, englishRecords, chunkIds, citingSql, utf8Length };
})();
