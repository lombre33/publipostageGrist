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
//  - Un mot de passe ne se garde nulle part : ni dans le navigateur, ni dans le document Grist, ni dans un message.
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

  const DEFAULTS = Object.freeze({ password: '', allowPrint: true, allowCopy: true, allowModify: false, author: '', subject: '', keywords: '' });

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

  // Les réglages tels que la fenêtre les rend, complets et propres : les trois droits (imprimer et copier permis, modifier refusé au départ), le mot de passe
  // (vide : le fichier s'ouvre sans), les propriétés.
  function normalize(raw) {
    const given = raw && typeof raw === 'object' ? raw : {};
    return {
      password: clampBytes(typeof given.password === 'string' ? given.password : '', MAX_PASSWORD_BYTES),
      allowPrint: flagOf(given.allowPrint, DEFAULTS.allowPrint),
      allowCopy: flagOf(given.allowCopy, DEFAULTS.allowCopy),
      allowModify: flagOf(given.allowModify, DEFAULTS.allowModify),
      author: propertyOf(given.author),
      subject: propertyOf(given.subject),
      keywords: propertyOf(given.keywords),
    };
  }

  // Ces réglages protègent-ils quelque chose ? Un mot de passe, ou au moins un droit retiré. Sans cela le fichier serait un PDF ordinaire : la fenêtre ne le valide pas.
  function protects(raw) {
    const s = normalize(raw);
    return s.password !== '' || !s.allowPrint || !s.allowCopy || !s.allowModify;
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

  return { PDF_VERSION, MAX_PASSWORD_BYTES, MAX_PROPERTY, DEFAULTS, normalize, protects, docFields };
})();
