// Formats de page enregistrés (demande d'Antoine du 04/10, suite du format libre : « donner un nom à un format, par exemple « Étiquette 70 × 37 », et le reprendre sur d'autres modèles ») :
// la liste des tailles nommées du document, proposée par la fenêtre « Format libre… » (js/page-size-dialog.js). Une ligne = un nom, une largeur et une hauteur en millimètres, telles qu'on voit la
// page (sens compris : « Étiquette 70 × 37 » est en paysage). Choisir un format enregistré remplit la fenêtre ; « Valider » pose alors la taille sur le modèle comme une taille saisie, et le modèle
// la garde dans la clé `format` de sa colonne Margins (js/page-layout.js) : une COPIE, pas un lien. Supprimer ou refaire un format enregistré ne change donc aucun modèle.
//
// Pour tout le document, pas par personne : un format nommé sert à toute l'équipe (la table Publipostage_FormatsPage, colonnes Nom, Largeur, Hauteur ; même patron que
// js/text-expansion.js, sans la colonne Utilisateur). Elle n'est lue qu'à l'ouverture de la fenêtre (jamais au démarrage du widget, jamais créée pour lire) et créée à la première
// écriture, juste avant l'AddRecord ; une table qui existe déjà n'est jamais recréée. Les lignes illisibles (nom vide, taille hors bornes de PageLayout, valeur non numérique) sont
// ignorées plutôt que corrigées : elles restent telles quelles dans Grist.
//
// Un nom déjà pris (casse et espaces ignorés) devient « nom (2) », « nom (3) »... comme celui d'un modèle (Templates.uniqueName) ; la valeur est retenue à l'enregistrement, jamais refusée.
const SavedPageFormats = (function () {
  const TABLE_NAME = 'Publipostage_FormatsPage';
  const MAX_NAME_LENGTH = 120; // large : une coupe silencieuse n'a de sens que pour un collage absurde

  // [{ rowId, name, widthMm, heightMm }] ; null tant que rien n'est lu.
  let entries = null;
  let loading = null;
  let tableKnown = false; // la table existe dans le document (vue ou créée)
  let writeQueue = Promise.resolve();

  function lang() { return (typeof I18n !== 'undefined' && I18n.getLang()) || 'fr'; }
  const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const tenth = mm => Math.round(mm * 10) / 10;

  // La taille est-elle une page que le widget sait faire ? Mêmes bornes que la fenêtre (PageLayout.CUSTOM_MIN_MM … CUSTOM_MAX_MM, la limite de Word).
  function validSize(widthMm, heightMm) {
    const ok = mm => typeof mm === 'number' && isFinite(mm) && mm >= PageLayout.CUSTOM_MIN_MM && mm <= PageLayout.CUSTOM_MAX_MM;
    return ok(widthMm) && ok(heightMm);
  }

  // Le nom tel qu'on l'enregistre : espaces de tête et de queue ôtés, espaces internes réduits à un seul.
  function cleanName(name) { return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH); }

  // === Lecture ==============================================================================================================================================

  async function readEntries() {
    const found = [];
    let tables;
    try { tables = await grist.docApi.listTables(); } catch (e) { console.warn('[saved-page-formats] liste des tables illisible', e); return found; }
    // Pas de table = aucun format enregistré : elle n'est créée qu'à la première écriture (ensureTable), jamais pour lire.
    if (tables.indexOf(TABLE_NAME) === -1) return found;
    tableKnown = true;
    let data;
    try { data = await grist.docApi.fetchTable(TABLE_NAME); } catch (e) { console.warn('[saved-page-formats] lecture des formats enregistrés impossible', e); return found; }
    for (let i = 0; i < data.id.length; i++) {
      const name = cleanName(data.Nom && data.Nom[i]);
      const widthMm = tenth(Number(data.Largeur && data.Largeur[i]));
      const heightMm = tenth(Number(data.Hauteur && data.Hauteur[i]));
      if (!name || !validSize(widthMm, heightMm)) continue;
      found.push({ rowId: data.id[i], name, widthMm, heightMm });
    }
    return found;
  }

  // Une seule lecture à la fois, mémorisée ; `force` relit (une ouverture de la fenêtre voit ainsi un format ajouté depuis un autre onglet ou à la main dans Grist).
  function load(force) {
    if (!force && entries) return Promise.resolve(entries);
    if (loading) return loading;
    loading = readEntries().then(found => { entries = found; return entries; }).finally(() => { loading = null; });
    return loading;
  }

  // Oublie tout (tests, changement de document) : la prochaine lecture repart de Grist.
  function reset() { entries = null; loading = null; tableKnown = false; writeQueue = Promise.resolve(); }

  // Les formats enregistrés, du premier au dernier par nom (« Étiquette 2 » avant « Étiquette 10 »). Vide tant que rien n'est lu.
  function list() {
    return (entries || []).map(e => Object.assign({}, e))
      .sort((a, b) => a.name.localeCompare(b.name, lang(), { numeric: true, sensitivity: 'base' }) || a.rowId - b.rowId);
  }

  function find(rowId) {
    const entry = (entries || []).find(e => String(e.rowId) === String(rowId));
    return entry ? Object.assign({}, entry) : null;
  }

  // Un autre format porte-t-il déjà ce nom ?
  function isNameTaken(name) { return (entries || []).some(e => sameName(e.name, name)); }

  // Nom libre le plus proche de `name` : lui-même s'il est libre, sinon « nom (2) », « nom (3) »... Un nom qui finit déjà par « (n) » continue sa série au numéro suivant (même règle que
  // Templates.uniqueName : enregistrer « Étiquette (2) » donne « Étiquette (3) », pas « Étiquette (2) (2) »).
  function uniqueName(name) {
    const base = cleanName(name);
    if (!base || !isNameTaken(base)) return base;
    const series = base.match(/^(.*\S)\s*\((\d+)\)$/);
    const root = series ? series[1] : base;
    let n = series ? Number(series[2]) + 1 : 2;
    while (isNameTaken(root + ' (' + n + ')')) n++;
    return root + ' (' + n + ')';
  }

  // === Écriture =============================================================================================================================================

  // Écritures mises en file : deux « Enregistrer » rapprochés ne doivent ni se doubler ni voir un état périmé (le second cherche son nom libre après que le premier a fini).
  function enqueue(job) {
    const run = writeQueue.then(job);
    writeQueue = run.catch(() => {});
    return run;
  }

  async function ensureTable() {
    if (tableKnown) return;
    const tables = await grist.docApi.listTables();
    if (tables.indexOf(TABLE_NAME) === -1) {
      await grist.docApi.applyUserActions([['AddTable', TABLE_NAME, [
        { id: 'Nom', type: 'Text' },
        { id: 'Largeur', type: 'Numeric' },
        { id: 'Hauteur', type: 'Numeric' },
      ]]]);
      if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(TABLE_NAME);
    }
    tableKnown = true;
  }

  function invalid(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  // Enregistre la taille sous `rawName` (un nom vide ou déjà pris : voir uniqueName ; le nom retenu est dans la réponse). La taille est celle qu'on voit, sens compris. Refuse une taille hors
  // bornes ('range') ou un nom vide ('name') : la fenêtre ne l'appelle qu'avec une taille bonne et un nom proposé par défaut, ces gardes protègent le document.
  function add(rawName, widthMm, heightMm) {
    return enqueue(async () => {
      await load();
      const w = tenth(Number(widthMm));
      const h = tenth(Number(heightMm));
      if (!validSize(w, h)) throw invalid('range');
      const name = uniqueName(rawName);
      if (!name) throw invalid('name');
      await ensureTable();
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Nom: name, Largeur: w, Hauteur: h }]]);
      const entry = { rowId: result.retValues[0], name, widthMm: w, heightMm: h };
      entries.push(entry);
      return Object.assign({}, entry);
    });
  }

  function remove(rowId) {
    return enqueue(async () => {
      await load();
      const index = entries.findIndex(e => String(e.rowId) === String(rowId));
      if (index === -1) return false; // retiré entre-temps (autre onglet) : rien à supprimer
      await grist.docApi.applyUserActions([['RemoveRecord', TABLE_NAME, entries[index].rowId]]);
      entries.splice(index, 1);
      return true;
    });
  }

  return { TABLE_NAME, MAX_NAME_LENGTH, load, reset, list, find, uniqueName, add, remove };
})();
