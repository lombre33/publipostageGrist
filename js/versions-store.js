// Historique des versions d'un modèle : le magasin. Enregistrer écrase l'état précédent d'un modèle ; ce module en garde une copie, dans la table
// Publipostage_Versions du document (une ligne = une version : le modèle par son jeton, la date et l'auteur de l'état gardé, l'état compressé), pour que
// la fenêtre « Historique des versions… » (js/versions-history.js) puisse le montrer et le restaurer. Étude : historique-des-modifications-2026-10-13.
//
// Ce que la table coûte au document, et quand elle est lue (choix du 13/10 : « une table dédiée, chargée seulement quand on accède à l'historique ») :
//   - jamais lue au démarrage du widget, jamais lue pendant qu'on écrit : l'enregistrement n'y AJOUTE qu'une ligne, dans le même lot que celui du
//     modèle (Templates.saveRow), donc atomique avec lui ;
//   - lue en entier à l'ouverture de la fenêtre de l'historique (`open`), où les plafonds s'appliquent ;
//   - lue en arrière-plan tous les 400 ajouts seulement (le numéro de la ligne ajoutée le dit sans rien lire), pour les plafonds seuls.
//   Supprimer un modèle ne lit rien non plus : ses versions deviennent orphelines et partent à la prochaine ouverture de l'historique.
//
// Quand garder l'état S que l'enregistrement va remplacer par N : S diffère de N, et au moins une de ces trois choses est vraie - S vient d'une autre
// personne, S a au moins 5 minutes, ou la dernière copie de ce modèle date d'au moins 10 minutes (ou n'existe pas encore dans cette session). Jamais
// si S est la dernière copie de la session ; toujours avant une restauration. Une copie qui échoue n'empêche jamais d'enregistrer (Templates.saveRow
// rejoue le lot sans elle).
//
// Une version peut recevoir un nom (« Nommer… » de la fenêtre) : `renameVersion` écrit la colonne `Nom` d'une version gardée, `keepNamed` garde sous un nom l'état enregistré que
// la fenêtre montre comme « Version actuelle » (une ligne de plus, écrite tout de suite et seule). Une version nommée n'est jamais effacée par un plafond ; seule la suppression de son modèle
// l'emporte.
//
// Une version : le JSON canonique (clés triées) de snapshotOf, compressé par le navigateur (gzip natif, sans bibliothèque) puis écrit en base64
// (« gz1: » devant), ou tel quel (« raw1: ») quand le navigateur ne sait pas compresser. Environ 0,3 fois la taille du modèle.
const VersionsStore = (function () {
  const TABLE_NAME = 'Publipostage_Versions';
  const TABLE_COLUMNS = [
    { id: 'Jeton', type: 'Text' },     // le modèle (Templates.ensureToken), pas son numéro de ligne que Grist peut redonner
    { id: 'Date', type: 'DateTime' },  // quand l'état gardé avait été enregistré
    { id: 'Auteur', type: 'Text' },    // qui l'avait enregistré : « Nom <adresse> » ou l'adresse seule, vide quand elle n'était pas connue
    { id: 'Nom', type: 'Text' },       // le nom donné par une personne ; vide pour une version gardée toute seule (jamais effacée par un plafond quand il est rempli)
    { id: 'Genre', type: 'Text' },     // '' (gardée toute seule) ou 'restauration' (l'état remplacé par une restauration)
    { id: 'Donnees', type: 'Text' },   // l'état, compressé
  ];
  const FORMAT = 1;
  const KEEP_AFTER_MS = 5 * 60 * 1000;     // un état resté tel quel 5 minutes est un point de reprise
  const KEEP_EVERY_MS = 10 * 60 * 1000;    // et, pendant qu'on écrit, une copie au moins toutes les 10 minutes
  const SUSPEND_MS = 10 * 60 * 1000;       // après un lot refusé à cause de la copie, plus de copie pendant ce temps
  const MAX_AUTO_PER_MODEL = 30;           // versions gardées toutes seules par modèle (les plus anciennes partent d'abord)
  const MAX_TOTAL_CHARS = 3 * 1000 * 1000; // taille de toutes les versions du document (les nommées ne partent jamais)
  const MAX_VERSION_CHARS = 1500 * 1000;   // un état plus lourd (images collées) n'est pas gardé
  const CLEANUP_EVERY_ROWS = 400;
  const CLEANUP_DELAY_MS = 3000;
  const NAME_MAX = 80;                     // caractères d'un nom de version

  // Ce que cette session a gardé, par numéro de ligne de modèle : { at (Date.now), key (empreinte de l'état gardé) }. Rien n'est lu dans la table pour le savoir.
  const kept = new Map();
  let tableKnown = false;
  let suspendedUntil = 0;
  let cleanupTimer = null;
  const modulePromises = new Map(); // les modules de l'historique déjà demandés (loadModule) : nom -> promesse
  const writes = GristAPI.createWriteQueue();

  // JSON à clés triées : deux états égaux donnent le même texte, quel que soit l'ordre dans lequel leurs objets ont été construits.
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  // Empreinte courte d'un texte (cyrb53) : de quoi reconnaître l'état déjà gardé sans garder le texte lui-même en mémoire (un modèle à images pèse des Mo).
  function keyOf(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return text.length.toString(36) + '.' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // L'état d'un modèle qu'une version garde, d'après une entrée du cache de js/templates.js (ou une ligne lue par templateFromRow) : tout ce que
  // « Enregistrer » écrit, sauf le nom. Les champs vides n'y sont pas, pour que deux modèles sans e-mail ni suivi donnent le même texte.
  function snapshotOf(template) {
    const out = {
      v: FORMAT,
      typeModele: template.typeModele || 'document',
      contenu: typeof template.contenu === 'string' ? template.contenu : '',
      nomFichierPDF: template.nomFichierPDF || '',
      headerFooter: template.headerFooter || null,
      margins: template.marginsMm || null,
    };
    ['destinataires', 'cc', 'cci', 'objet'].forEach(key => { if (template[key]) out[key] = template[key]; });
    if (template.suiviModifications && Object.keys(template.suiviModifications).length) out.suiviModifications = template.suiviModifications;
    return out;
  }

  // Compression

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Le texte d'un état -> ce que la colonne `Donnees` garde.
  async function pack(text) {
    if (typeof CompressionStream === 'function' && typeof Blob === 'function') {
      try {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
        return 'gz1:' + toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
      } catch (e) { /* repli sans compression ci-dessous */ }
    }
    return 'raw1:' + text;
  }

  // Ce que la colonne `Donnees` garde -> l'état (l'objet de snapshotOf). Lève quand le texte n'est pas une version que ce widget sait lire.
  async function unpack(data) {
    const text = String(data || '');
    if (text.startsWith('raw1:')) return JSON.parse(text.slice(5));
    if (text.startsWith('gz1:')) {
      const stream = new Blob([fromBase64(text.slice(4))]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    }
    throw new Error('Version illisible (format inconnu).');
  }

  // Les personnes

  // « Nom <adresse> », ou l'adresse seule, ou '' : ce que la colonne `Auteur` et la colonne « Modifié par » des modèles gardent.
  function authorLabel(person) {
    const email = person && person.email ? String(person.email).trim() : '';
    if (!email) return '';
    const name = person.name ? String(person.name).trim() : '';
    return name ? name + ' <' + email + '>' : email;
  }
  function parseAuthor(label) {
    const text = String(label || '').trim();
    const match = /^(.*?)\s*<([^<>]+)>$/.exec(text);
    if (match) return { name: match[1].trim(), email: match[2].trim() };
    return text.includes('@') ? { name: '', email: text } : { name: text, email: '' };
  }
  // L'adresse seule, en minuscules : deux libellés de la même personne (le nom n'est pas toujours connu) se comparent par elle.
  function emailOf(label) {
    const email = parseAuthor(label).email.toLowerCase();
    return email.includes('@') ? email : '';
  }

  // Le moment d'une date de Grist (des secondes, ou la chaîne ISO que le widget a envoyée), en millisecondes ; null quand elle ne se lit pas.
  function toMs(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value * 1000 : null;
    if (typeof value === 'string' && value) {
      const ms = Date.parse(value);
      return Number.isNaN(ms) ? null : ms;
    }
    return null;
  }

  // Quand garder

  function usable() { return Date.now() >= suspendedUntil; }
  // Plus de copie pendant SUSPEND_MS : le lot qui en portait une a été refusé (droits sur la table des versions...), ou la table, le jeton du modèle ne se sont pas obtenus. L'enregistrement continue sans.
  function suspend(error) {
    suspendedUntil = Date.now() + SUSPEND_MS;
    console.warn('[VersionsStore] copies suspendues dix minutes', error);
  }

  function worthKeeping({ modifiePar, dateModif, author, now, last }) {
    const theirs = emailOf(modifiePar);
    const mine = emailOf(author);
    if (theirs && mine && theirs !== mine) return true;
    const at = toMs(dateModif);
    if (at === null || now - at >= KEEP_AFTER_MS) return true;
    return !last || now - last.at >= KEEP_EVERY_MS;
  }

  async function ensureTable() {
    if (tableKnown) return;
    await GristAPI.ensureTable(TABLE_NAME, TABLE_COLUMNS);
    tableKnown = true;
  }

  // La copie de `stored` (l'état de la ligne `rowId` avant l'enregistrement) à joindre au lot qui écrit `next` à sa place, ou null : rien à garder, ou copies
  // indisponibles. { action, commit(numéro de la ligne ajoutée) } : l'action est celle à poser dans le lot, commit à appeler quand Grist l'a appliqué.
  // `author` : le libellé de la personne qui enregistre ; `force` : garder même si les règles ne le demandent pas (une restauration) ; `tokenFor` : rend le
  // jeton du modèle (créé au besoin : seulement quand une copie est décidée). Ne lève jamais : enregistrer ne dépend pas de la copie.
  async function prepare({ rowId, stored, next, author, force, genre, tokenFor }) {
    if (!usable()) return null;
    let beforeText;
    let modifiePar;
    let dateModif;
    let key;
    let last;
    try {
      // Tout ce qu'on retient de l'état remplacé est copié avant le premier await : l'entrée du cache peut être mise à jour par une autre écriture pendant qu'on prépare.
      modifiePar = stored.modifiePar || '';
      dateModif = stored.dateModif;
      beforeText = stable(snapshotOf(stored));
      if (beforeText === stable(snapshotOf(next))) return null;
      key = keyOf(beforeText);
      last = kept.get(String(rowId));
      if (last && last.key === key) return null;
      if (!force && !worthKeeping({ modifiePar, dateModif, author, now: Date.now(), last })) return null;
    } catch (e) {
      console.warn('[VersionsStore] version non comparée', e);
      return null;
    }
    try {
      const token = await tokenFor();
      if (!token) return null;
      const data = await pack(beforeText);
      if (data.length > MAX_VERSION_CHARS) return null;
      await ensureTable();
      const at = toMs(dateModif);
      const fields = { Jeton: token, Date: new Date(at === null ? Date.now() : at).toISOString(), Auteur: modifiePar, Nom: '', Genre: genre || '', Donnees: data };
      return {
        action: ['AddRecord', TABLE_NAME, null, fields],
        commit(addedRowId) {
          kept.set(String(rowId), { at: Date.now(), key });
          noteAdded(addedRowId);
        },
      };
    } catch (e) {
      // La table, le jeton ou la compression ne se sont pas obtenus (droits sur la structure, table refusée) : inutile de réessayer à chaque enregistrement.
      suspend(e);
      return null;
    }
  }

  // Les versions d'un modèle supprimé n'ont plus de raison d'être mémorisées pour la session.
  function forget(rowId) { kept.delete(String(rowId)); }

  // Lecture et plafonds

  // La table en entier : { exists, entries }, `entries` = [{ rowId, token, at (ms), author, name, genre, data, size }]. Lève si Grist ne répond pas. Une
  // table absente est un historique vide (jamais créée pour lire).
  async function readAll() {
    const tables = await grist.docApi.listTables();
    if (!tables.includes(TABLE_NAME)) return { exists: false, entries: [] };
    tableKnown = true;
    const data = await grist.docApi.fetchTable(TABLE_NAME);
    const text = (column, i) => String((data[column] && data[column][i]) || '');
    const entries = [];
    for (let i = 0; i < data.id.length; i++) {
      const token = text('Jeton', i);
      const packed = text('Donnees', i);
      if (!token || !packed) continue;
      const at = toMs(data.Date ? data.Date[i] : null);
      entries.push({ rowId: data.id[i], token, at: at === null ? 0 : at, author: text('Auteur', i), name: text('Nom', i), genre: text('Genre', i), data: packed, size: packed.length });
    }
    return { exists: true, entries };
  }

  // Les numéros de ligne à retirer. Orphelines (`knownTokens` : les jetons des modèles qui existent, ou null pour ne pas en chercher ; une version de moins de
  // ORPHAN_GRACE_MS n'est pas tenue pour orpheline, car le modèle qu'une autre personne vient de créer n'est peut-être pas encore dans la liste lue) ; les versions
  // gardées toutes seules d'un modèle au-delà de MAX_AUTO_PER_MODEL ; puis, au-delà de MAX_TOTAL_CHARS, les plus anciennes du document. Une version nommée ne part
  // que si son modèle n'existe plus ; la plus récente de chaque modèle ne part pas pour le plafond du document.
  const ORPHAN_GRACE_MS = 10 * 60 * 1000;
  function planCleanup(entries, knownTokens, now = Date.now()) {
    const removed = new Set();
    if (knownTokens) entries.forEach(entry => { if (!knownTokens.has(entry.token) && now - entry.at > ORPHAN_GRACE_MS) removed.add(entry.rowId); });
    const byModel = new Map();
    entries.forEach(entry => {
      if (removed.has(entry.rowId)) return;
      if (!byModel.has(entry.token)) byModel.set(entry.token, []);
      byModel.get(entry.token).push(entry);
    });
    const newest = new Set();
    byModel.forEach(list => {
      list.sort((a, b) => b.at - a.at || b.rowId - a.rowId);
      newest.add(list[0].rowId);
      let automatic = 0;
      list.forEach(entry => {
        if (entry.name) return;
        automatic++;
        if (automatic > MAX_AUTO_PER_MODEL) removed.add(entry.rowId);
      });
    });
    let total = 0;
    entries.forEach(entry => { if (!removed.has(entry.rowId)) total += entry.size; });
    if (total > MAX_TOTAL_CHARS) {
      const oldestFirst = entries.filter(entry => !removed.has(entry.rowId) && !entry.name && !newest.has(entry.rowId)).sort((a, b) => a.at - b.at || a.rowId - b.rowId);
      for (const entry of oldestFirst) {
        if (total <= MAX_TOTAL_CHARS) break;
        removed.add(entry.rowId);
        total -= entry.size;
      }
    }
    return Array.from(removed);
  }

  function removeRows(rowIds) {
    if (!rowIds.length) return Promise.resolve();
    return writes.enqueue(() => grist.docApi.applyUserActions([['BulkRemoveRecord', TABLE_NAME, rowIds]]));
  }

  // Les jetons des modèles du document, d'après la table des modèles relue à neuf : { token (celui du modèle `rowId`, '' tant qu'aucune copie n'en a été gardée), known (tous
  // les jetons posés, ou null quand la colonne manque ou que la table n'a aucune ligne : les orphelines ne se cherchent alors pas) }.
  async function readModelTokens(rowId) {
    const data = await grist.docApi.fetchTable((typeof Templates !== 'undefined' && Templates.TABLE_NAME) || 'Publipostage_Modeles');
    const ids = Array.isArray(data.id) ? data.id : [];
    const column = Array.isArray(data.Jeton) ? data.Jeton : null;
    const at = ids.findIndex(id => String(id) === String(rowId));
    return {
      token: at === -1 || !column ? '' : String(column[at] || ''),
      known: column && ids.length ? new Set(column.map(value => String(value || '')).filter(Boolean)) : null,
    };
  }

  // L'ouverture de l'historique du modèle `rowId` : LA lecture de la table des versions. Applique les plafonds et retire les versions des modèles supprimés, puis rend
  // { token, entries } : les versions de ce modèle, les plus récentes d'abord. Lève quand la lecture échoue ; une table absente, ou un modèle sans jeton, est un
  // historique vide (rien n'est créé pour lire).
  async function open(rowId) {
    const { token, known } = await readModelTokens(rowId);
    if (!token) return { token, entries: [] };
    const { exists, entries } = await readAll();
    if (!exists) return { token, entries: [] };
    let gone = new Set();
    try {
      const planned = planCleanup(entries, known);
      await removeRows(planned);
      gone = new Set(planned);
    } catch (e) { console.warn('[VersionsStore] plafonds non appliqués', e); }
    return { token, entries: entries.filter(entry => entry.token === token && !gone.has(entry.rowId)).sort((a, b) => b.at - a.at || b.rowId - a.rowId) };
  }

  // Le ménage de fond : tous les CLEANUP_EVERY_ROWS ajouts (le numéro de la ligne ajoutée est un multiple), jamais plus d'un en attente.
  function noteAdded(rowId) {
    if (typeof rowId === 'number' && rowId > 0 && rowId % CLEANUP_EVERY_ROWS === 0) scheduleCleanup();
  }
  function scheduleCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setTimeout(async () => {
      cleanupTimer = null;
      try {
        const { exists, entries } = await readAll();
        if (exists) await removeRows(planCleanup(entries, null));
      } catch (e) { console.warn('[VersionsStore] ménage de fond impossible', e); }
    }, CLEANUP_DELAY_MS);
  }

  // Nommer

  // Le nom qu'une personne donne à une version : espaces réduits à un seul, 80 caractères au plus (comptés en caractères, un emoji n'est pas coupé en deux) ; '' quand il n'y a rien à garder.
  function cleanName(text) {
    const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return Array.from(flat).slice(0, NAME_MAX).join('').trim();
  }

  // Donne à la version `rowId` le nom `name` ; un nom vide retire celui qu'elle avait (elle redevient une version comme les autres, que les plafonds peuvent effacer). Lève quand Grist refuse (droits, ligne
  // disparue). Rend le nom écrit.
  async function renameVersion(rowId, name) {
    const label = cleanName(name);
    await writes.enqueue(() => grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, rowId, { Nom: label }]]));
    return label;
  }

  // Garde sous le nom `name` l'état `state` (celui de snapshotOf) du modèle `modelRowId` : ce que la fenêtre montre comme « Version actuelle ». Une ligne de plus dans la table des versions, écrite
  // seule et tout de suite, avec la date (`at`, en ms) et la personne (`author`) de l'enregistrement de cet état, comme toute version ; `tokenFor` rend le jeton du modèle (créé au besoin). La session
  // retient cet état comme déjà gardé : le prochain enregistrement qui le remplace n'en refait pas une copie. Lève quand Grist refuse ou que l'état pèse plus que MAX_VERSION_CHARS (alors l'erreur porte
  // `versionsKey`, la clé du texte qui le dit). Rend { rowId (null quand Grist ne le dit pas), name }.
  async function keepNamed({ modelRowId, state, at, author, name, tokenFor }) {
    const label = cleanName(name);
    if (!label) throw new Error('Nom de version vide.');
    const text = stable(state);
    const data = await pack(text);
    if (data.length > MAX_VERSION_CHARS) throw Object.assign(new Error('État trop lourd pour être gardé en version.'), { versionsKey: 'versions.nameTooBig' });
    const token = await tokenFor();
    if (!token) throw new Error('Jeton du modèle introuvable.');
    await ensureTable();
    const fields = { Jeton: token, Date: new Date(at || Date.now()).toISOString(), Auteur: author || '', Nom: label, Genre: '', Donnees: data };
    const result = await writes.enqueue(() => grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, fields]]));
    const added = result && result.retValues ? result.retValues[0] : null;
    kept.set(String(modelRowId), { at: Date.now(), key: keyOf(text) });
    noteAdded(added);
    return { rowId: typeof added === 'number' ? added : null, name: label };
  }

  // Les modules de l'historique (la fenêtre, la comparaison) ne se chargent qu'au premier besoin : une balise inerte d'index.html porte l'adresse et la version de cache (`?v=`) de chacun.
  // `loaded` dit si le module est déjà là (sa variable globale) ; un échec de chargement n'est pas gardé, le geste suivant réessaie.
  function loadModule(name, loaded) {
    if (loaded()) return Promise.resolve();
    if (!modulePromises.has(name)) {
      const tag = document.querySelector('script[type="text/x-lazy-module"][data-module="' + name + '"]');
      modulePromises.set(name, (tag ? ExportCommon.loadScriptOnce({ src: tag.getAttribute('src') }) : Promise.reject(new Error('Module de l’historique des versions introuvable : ' + name)))
        .catch(e => { modulePromises.delete(name); throw e; }));
    }
    return modulePromises.get(name);
  }
  const loadWindow = () => loadModule('versions', () => typeof VersionsHistory !== 'undefined');
  const loadCompare = () => loadModule('versions-compare', () => typeof VersionsCompare !== 'undefined');

  // Oublie ce que la session sait (tests, changement de document).
  function reset() {
    kept.clear();
    tableKnown = false;
    suspendedUntil = 0;
    if (cleanupTimer) { clearTimeout(cleanupTimer); cleanupTimer = null; }
    writes.reset();
  }

  return {
    TABLE_NAME, TABLE_COLUMNS, FORMAT, KEEP_AFTER_MS, KEEP_EVERY_MS, MAX_AUTO_PER_MODEL, MAX_TOTAL_CHARS, MAX_VERSION_CHARS, NAME_MAX, CLEANUP_EVERY_ROWS,
    stable, keyOf, snapshotOf, pack, unpack, authorLabel, parseAuthor, emailOf, toMs,
    usable, suspend, prepare, forget, readAll, planCleanup, open, removeRows, cleanName, renameVersion, keepNamed, loadWindow, loadCompare, reset,
  };
})();
