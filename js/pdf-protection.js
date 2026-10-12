// Protection d'un PDF (type « PDF protégé » du menu Type d'export, demande du 12/10) : ce que la fenêtre js/pdf-protection-dialog.js fait choisir - le mot de passe
// pour ouvrir le fichier, ce que la personne qui l'ouvre a le droit de faire, les propriétés du fichier (auteur, sujet, mots-clés) - et les champs de document que
// pdfmake en tire (js/pdf-export.js les ajoute à la fin, une fois la mise en page faite). Pur : aucun accès au DOM, de quoi se tester seul (groupe `pdfProtection`).
//  - Le chiffrement est l'AES-256 de pdfmake (version PDF « 1.7ext3 »). C'est le seul des siens qui lit un mot de passe accentué comme il a été tapé (en UTF-8) ;
//    les autres le lisent en Latin-1 et un « é » n'ouvre plus le fichier selon la visionneuse.
//  - pdfmake n'écrit un PDF chiffré que s'il reçoit un mot de passe : sans mot de passe pour ouvrir, les droits ne tiennent que par un mot de passe « propriétaire »,
//    que personne ne connaît (tiré au hasard à chaque export, jamais gardé ni montré). Le fichier s'ouvre alors sans mot de passe, mais la visionneuse applique les droits.
//    Si ce tirage est impossible, l'export échoue : jamais un PDF livré sans la protection demandée.
//  - Les droits : imprimer, copier le texte et les images, modifier ou annoter (modifier, annoter, remplir des formulaires, réorganiser les pages vont ensemble). La lecture
//    par un lecteur d'écran reste toujours permise (accessibilité).
//  - D'où vient le mot de passe, c'est la personne qui le choisit (demande du 12/10 : « laisser 3 choix à l'utilisateur ») - `mode` :
//      · 'typed' (le conseillé) : tapé dans la fenêtre à chaque export, gardé NULLE PART (ni dans le navigateur, ni dans le document Grist, ni dans un message) ;
//      · 'stored' : un seul pour tous les PDF, enregistré dans le document (Templates.writePdfPassword : une colonne de la ligne des réglages), donc lisible par toute personne
//        qui ouvre le document sauf règle d'accès de Grist ; la fenêtre le dit et nomme la table et la colonne. Les réglages qu'elle rend le portent dans `password`, comme un mot de passe tapé ;
//      · 'column' : un mot de passe par ligne, lu dans la colonne `passwordColumn` de la table - en clair dans Grist, la fenêtre le dit. Il se résout ligne par ligne
//        (`settingsForRow`) : une cellule vide, illisible ou trop longue fait échouer CETTE ligne (jamais un PDF livré sans le mot de passe attendu).
const PdfProtection = (function () {
  const PDF_VERSION = '1.7ext3';
  // Un mot de passe PDF AES-256 compte 127 octets au plus (UTF-8) ; au-delà, le fichier le tronque et la visionneuse aussi, sans le dire.
  const MAX_PASSWORD_BYTES = 127;
  const MAX_PROPERTY = 200;
  // Des caractères sans ressemblance (ni 0 et O, ni 1, l et I). Un octet tiré au hasard n'est gardé que sous le plus grand multiple de leur nombre qu'il contienne
  // (OWNER_LIMIT) : au-delà, la valeur est rejetée, pour qu'aucun caractère ne soit plus probable qu'un autre.
  const OWNER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const OWNER_LIMIT = 256 - (256 % OWNER_ALPHABET.length);
  const OWNER_LENGTH = 32;

  const MODES = Object.freeze(['typed', 'stored', 'column']);
  const DEFAULT_MODE = 'typed';
  const MAX_COLUMN = 200;

  const DEFAULTS = Object.freeze({ mode: DEFAULT_MODE, password: '', passwordColumn: '', allowPrint: true, allowCopy: true, allowModify: false, author: '', subject: '', keywords: '' });

  const bytesOf = text => new TextEncoder().encode(text).length;
  // Le texte coupé à `max` octets (UTF-8) au plus, caractère entier par caractère entier : un emoji n'est jamais coupé en deux.
  function clampBytes(text, max) {
    let out = '';
    let used = 0;
    for (const point of text) {
      const size = bytesOf(point);
      if (used + size > max) break;
      out += point;
      used += size;
    }
    return out;
  }
  // Une propriété du fichier : sans retour à la ligne ni autre caractère de commande, sans espaces autour, d'une longueur raisonnable.
  const propertyOf = value => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_PROPERTY);
  const flagOf = (value, fallback) => (value === undefined ? fallback : !!value);

  // Les réglages tels que la fenêtre les rend, complets et propres : le mode du mot de passe (inconnu : 'typed'), le mot de passe (vide : le fichier s'ouvre sans ; toujours vide en
  // mode 'column', où chaque ligne a le sien), la colonne des mots de passe, les trois droits (imprimer et copier permis, modifier refusé au départ), les propriétés.
  function normalize(raw) {
    const given = raw && typeof raw === 'object' ? raw : {};
    const mode = MODES.indexOf(given.mode) !== -1 ? given.mode : DEFAULT_MODE;
    return {
      mode,
      password: mode === 'column' ? '' : clampBytes(typeof given.password === 'string' ? given.password : '', MAX_PASSWORD_BYTES),
      passwordColumn: typeof given.passwordColumn === 'string' ? given.passwordColumn.slice(0, MAX_COLUMN) : '',
      allowPrint: flagOf(given.allowPrint, DEFAULTS.allowPrint),
      allowCopy: flagOf(given.allowCopy, DEFAULTS.allowCopy),
      allowModify: flagOf(given.allowModify, DEFAULTS.allowModify),
      author: propertyOf(given.author),
      subject: propertyOf(given.subject),
      keywords: propertyOf(given.keywords),
    };
  }

  // Ces réglages protègent-ils quelque chose ? Un mot de passe, ou au moins un droit retiré - et, en mode 'column', la colonne qui donne les mots de passe, sans laquelle aucune ligne
  // n'en a un (les droits seuls ne suffisent pas : ils ne remplacent pas un mot de passe par ligne). Sans cela le fichier serait un PDF ordinaire : la fenêtre ne le valide pas.
  function protects(raw) {
    const s = normalize(raw);
    if (s.mode === 'column') return s.passwordColumn !== '';
    return s.password !== '' || !s.allowPrint || !s.allowCopy || !s.allowModify;
  }

  // Les types de colonne Grist dont une cellule peut être un mot de passe : du texte (un Choix en est), un nombre entier ou décimal, ou « Tout » (le type libre des colonnes à
  // formule). Les dates, cases à cocher, références et pièces jointes n'en donnent pas : leur « texte » dépendrait d'un format que personne ne voit ici. Un mot de passe calculé
  // (une date de naissance mise en forme, un numéro de dossier) se tire dans une colonne à formule de type Texte.
  const PASSWORD_COLUMN_TYPES = Object.freeze(['Text', 'Choice', 'Numeric', 'Int', 'Any']);
  function isPasswordColumnType(type) {
    return PASSWORD_COLUMN_TYPES.indexOf(String(type || '').split(':')[0]) !== -1;
  }

  // Ce que vaut une cellule comme mot de passe : { password } ou { problem } - 'empty' (rien, ou que des espaces), 'type' (ni texte ni nombre : une erreur de formule, une liste, une case
  // à cocher), 'tooLong' (plus de 127 octets : jamais coupé en silence). Un texte est pris sans les espaces du début et de la fin (un mot de passe qu'on lit dans la cellule et qu'on
  // retape ne se lit pas avec une espace invisible) et sous sa forme composée (un « é » saisi en deux caractères ouvre le même fichier que celui d'un clavier). Un nombre s'écrit
  // tel que Grist le garde, sans mise en forme.
  function passwordFromCell(value) {
    let text;
    if (typeof value === 'string') text = value;
    else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
    else if (value === null || value === undefined) return { problem: 'empty' };
    else return { problem: 'type' };
    text = text.normalize('NFC').trim();
    if (text === '') return { problem: 'empty' };
    if (bytesOf(text) > MAX_PASSWORD_BYTES) return { problem: 'tooLong' };
    return { password: text };
  }

  // L'erreur d'une ligne dont le mot de passe n'est pas utilisable : `passwordProblem` ('empty', 'type', 'tooLong' ou 'missing' - la colonne n'est plus dans la ligne : supprimée,
  // renommée ou cachée) et `column` la disent à qui l'affiche (js/main.js, js/batch-failures.js) ; le message ne sert qu'au journal.
  function passwordError(problem, column) {
    const error = new Error('Le mot de passe de la ligne (colonne « ' + column + ' ») est inutilisable : ' + problem + '.');
    error.passwordProblem = problem;
    error.column = column;
    return error;
  }

  // Les réglages d'UNE ligne : en mode 'column', son mot de passe est celui de sa cellule (sinon l'erreur ci-dessus, la ligne n'est pas exportée) et le mode devient 'typed' - le mot de
  // passe est alors posé, comme tapé ; les autres modes valent pour toutes les lignes, tels quels. `row` : la ligne telle que Grist la lit, une clé par colonne.
  function settingsForRow(raw, row) {
    const s = normalize(raw);
    if (s.mode !== 'column') return s;
    const column = s.passwordColumn;
    if (column === '' || !row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, column)) throw passwordError('missing', column);
    const cell = passwordFromCell(row[column]);
    if (cell.problem) throw passwordError(cell.problem, column);
    return Object.assign({}, s, { mode: 'typed', password: cell.password });
  }

  // Le mot de passe « propriétaire » : celui qui lèverait les droits, que personne ne connaît. Tiré au hasard par l'aléa du navigateur ; sans lui, une erreur.
  function randomOwnerPassword() {
    const source = typeof crypto !== 'undefined' ? crypto : null;
    if (!source || typeof source.getRandomValues !== 'function') throw new Error('Aucun tirage au hasard sûr n’est disponible : le PDF n’est pas protégé.');
    let out = '';
    const buffer = new Uint8Array(64);
    while (out.length < OWNER_LENGTH) {
      source.getRandomValues(buffer);
      for (let i = 0; i < buffer.length && out.length < OWNER_LENGTH; i++) if (buffer[i] < OWNER_LIMIT) out += OWNER_ALPHABET[buffer[i] % OWNER_ALPHABET.length];
    }
    return out;
  }

  // Les champs de document que pdfmake lit (`version`, `userPassword`, `ownerPassword`, `permissions`, `info`), pour des réglages qui protègent quelque chose.
  function docFields(raw) {
    const s = normalize(raw);
    // Un mot de passe par ligne ne se résout qu'ici, ligne par ligne (settingsForRow) : lui donner les réglages d'un lot tels quels livrerait des PDF sans mot de passe.
    if (s.mode === 'column') throw new Error('Mot de passe par ligne : le mot de passe de la ligne doit être posé d’abord (PdfProtection.settingsForRow).');
    if (!protects(s)) throw new Error('Aucune protection choisie : ni mot de passe ni droit retiré.');
    const permissions = {
      modifying: s.allowModify, copying: s.allowCopy, annotating: s.allowModify, fillingForms: s.allowModify, documentAssembly: s.allowModify,
      contentAccessibility: true,
    };
    if (s.allowPrint) permissions.printing = 'highResolution';
    const fields = { version: PDF_VERSION, ownerPassword: randomOwnerPassword(), permissions };
    if (s.password !== '') fields.userPassword = s.password;
    const info = {};
    ['author', 'subject', 'keywords'].forEach(key => { if (s[key]) info[key] = s[key]; });
    if (Object.keys(info).length) fields.info = info;
    return fields;
  }

  return { PDF_VERSION, MAX_PASSWORD_BYTES, MAX_PROPERTY, MODES, DEFAULTS, normalize, protects, isPasswordColumnType, passwordFromCell, settingsForRow, docFields };
})();
