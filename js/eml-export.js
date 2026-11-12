// Export « Email (.eml) » du mode Email : le brouillon d'une ligne en un fichier .eml (une seule ligne, ou un fichier par ligne dans une archive ZIP : js/main-export.js, SINGLE_EXPORTS.eml et
// BATCH_EXPORTS.emlZip), que la messagerie ouvre comme un message à modifier avant l'envoi. Là où le lien mailto: (js/mailto-export.js) ne porte que du texte brut et aucune pièce jointe, le
// .eml porte la mise en forme du modèle (HTML), le texte brut en parallèle et les pièces jointes des colonnes Grist citées dans le champ PJ.
//
// Ce que la messagerie en fait (lu sur leurs pages, le 12/11 ; rien n'a été essayé par nous dans un vrai client) : l'en-tête `X-Unsent: 1` fait ouvrir le fichier en rédaction dans Thunderbird 91 et plus
// et dans Outlook classique ; le nouvel Outlook l'ouvre aussi en brouillon d'après des réponses de la communauté Microsoft, mais des essais de 2025 y montrent des pièces jointes perdues et il demande un
// `Message-ID` valide pour enregistrer le brouillon (d'où celui que ce fichier écrit toujours) ; Apple Mail, Zimbra et Gmail n'ont aucune voie vérifiée. Le fichier ne porte volontairement ni `From` (la
// messagerie met l'adresse de la personne : une adresse fausse ferait choisir la mauvaise identité à Thunderbird) ni envoi direct : un navigateur n'envoie rien sans serveur.
//
// Le message : multipart/mixed (texte + pièces jointes) > multipart/alternative (texte brut, puis HTML) > multipart/related (le HTML et ses images). Une image du document (data URI) devient une
// image jointe au message et appelée par son Content-ID (`cid:`), parce que les messageries n'affichent pas les data URI. Le HTML est celui de l'export HTML (js/html-export.js) dont la feuille de style
// est ÉCRITE DANS CHAQUE BALISE (inlineStyles) : Outlook classique ne lit ni `:where()` ni les variables CSS, et une messagerie web retire les <style>.
//
// Sûreté : une valeur de cellule est un texte non fiable. Aucun saut de ligne n'atteint un en-tête (les adresses se coupent à la virgule, au point-virgule et au saut de ligne ; l'objet tient sur une
// ligne), un nom de fichier joint perd ses signes de chemin et de contrôle, un type MIME est vérifié, et seules les colonnes de type Pièces jointes de Grist donnent des fichiers (une colonne
// Référence, dont la valeur est un numéro de ligne, n'en donne jamais).
const EmlExport = (function () {
  const CRLF = '\r\n';
  const encoder = new TextEncoder();
  const utf8 = text => encoder.encode(text);
  const HEX = '0123456789ABCDEF';

  // --- Les encodages --------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  function base64OfBytes(bytes) {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(binary);
  }
  // Les lignes de 76 caractères d'un contenu en base64.
  const base64Lines = bytes => base64OfBytes(bytes).replace(/.{1,76}/g, '$&' + CRLF).replace(/(\r\n)$/, '');

  // Une ligne de texte en « quoted-printable » (RFC 2045) : les octets UTF-8 hors de l'ASCII imprimable, le « = » et l'espace ou la tabulation de fin de ligne s'écrivent « =XX », et la ligne se
  // coupe (« = » en fin de ligne) avant 76 caractères sans jamais couper un « =XX ».
  function quotedPrintableLine(line) {
    const bytes = utf8(line);
    const tokens = [];
    for (let i = 0; i < bytes.length; i++) {
      const octet = bytes[i];
      const plain = (octet >= 33 && octet <= 126 && octet !== 61) || ((octet === 32 || octet === 9) && i < bytes.length - 1);
      tokens.push(plain ? String.fromCharCode(octet) : '=' + HEX[octet >> 4] + HEX[octet & 15]);
    }
    let out = '';
    let current = '';
    tokens.forEach(token => {
      if (current.length + token.length > 75) { out += current + '=' + CRLF; current = ''; }
      current += token;
    });
    return out + current;
  }
  // Un texte entier : ses lignes quel que soit leur saut (\n, \r\n, \r), en CRLF.
  const quotedPrintable = text => String(text).split(/\r\n|\r|\n/).map(quotedPrintableLine).join(CRLF);

  // Un texte hors de l'ASCII imprimable pour un en-tête : des mots encodés (RFC 2047) de 45 octets au plus (75 caractères chacun), jamais coupés au milieu d'un caractère.
  const needsEncoding = text => /[^\x20-\x7E]/.test(text);
  function encodedWords(text) {
    const words = [];
    let chunk = [];
    const flush = () => { if (chunk.length) words.push('=?UTF-8?B?' + base64OfBytes(Uint8Array.from(chunk)) + '?='); chunk = []; };
    for (const character of text) {
      const bytes = utf8(character);
      if (chunk.length + bytes.length > 45) flush();
      bytes.forEach(b => chunk.push(b));
    }
    flush();
    return words;
  }

  // Un en-tête replié à 76 caractères : `tokens` sont les morceaux qui ne se coupent pas, `comma` ajoute la virgule d'une liste d'adresses derrière le dernier morceau de chaque adresse (`ends` dit lesquels).
  function foldHeader(name, tokens, ends) {
    const lines = [];
    let line = name + ':';
    tokens.forEach((token, index) => {
      const piece = token + (ends && ends[index] && index < tokens.length - 1 ? ',' : '');
      if (line.length + 1 + piece.length > 76 && line !== name + ':') { lines.push(line); line = ' ' + piece; } else line += ' ' + piece;
    });
    lines.push(line);
    return lines.join(CRLF);
  }

  // Les caractères qu'aucun en-tête ne peut porter : sauts de ligne et de paragraphe, et les contrôles.
  const stripControls = text => String(text == null ? '' : text).replace(/[\u0000-\u001F\u007F\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim();

  // --- Les adresses ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  const ADDRESS = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]+$/;
  // Les adresses d'un champ (À, Cc, Cci) : séparées par une virgule, un point-virgule ou un saut de ligne (comme le lien mailto:, js/mailto-export.js:encodeAddressList), chacune « adresse » ou
  // « Nom <adresse> ». `valid` : l'adresse a la forme d'une adresse ; une autre (« n/a », un nom seul) est rendue à part et jamais écrite dans l'en-tête.
  // Un nom entre guillemets (« "Dupont, Jean" <j@d.fr> ») ou une adresse entre chevrons garde sa virgule ; un saut de ligne coupe toujours, guillemet ouvert ou non.
  function splitAddresses(value) {
    const parts = [];
    let current = '';
    let quoted = false;
    let angled = false;
    for (const character of String(value == null ? '' : value)) {
      if (/[\r\n\u2028\u2029]/.test(character)) { quoted = false; angled = false; parts.push(current); current = ''; continue; }
      if (character === '"') quoted = !quoted;
      else if (!quoted && character === '<') angled = true;
      else if (!quoted && character === '>') angled = false;
      if (!quoted && !angled && (character === ',' || character === ';')) { parts.push(current); current = ''; } else current += character;
    }
    parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
  }
  function parseAddresses(value) {
    return splitAddresses(value).map(part => {
      const bracket = /^(.*?)<([^<>]*)>\s*$/.exec(part);
      const email = stripControls(bracket ? bracket[2] : part).replace(/^mailto:/i, '');
      const name = bracket ? stripControls(bracket[1]).replace(/^"(.*)"$/, '$1').trim() : '';
      return { name, email, valid: ADDRESS.test(email), text: part };
    });
  }
  // Le nom affiché d'une adresse : tel quel s'il ne contient que des lettres simples, entre guillemets s'il porte des signes (virgule, point...), en mots encodés s'il n'est pas de l'ASCII.
  function displayName(name) {
    if (!name) return '';
    if (needsEncoding(name)) return encodedWords(name).join(' ');
    return /^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]+$/.test(name) ? name : '"' + name.replace(/(["\\])/g, '\\$1') + '"';
  }
  // L'en-tête d'un champ d'adresses, ou '' quand aucune adresse n'est valable. `skipped` reçoit les morceaux refusés.
  function addressHeader(name, value, skipped) {
    const tokens = [];
    const ends = [];
    parseAddresses(value).forEach(address => {
      if (!address.valid) { if (skipped) skipped.push(address.text); return; }
      const shown = displayName(address.name);
      const pieces = (shown ? shown.split(' ').concat('<' + address.email + '>') : [address.email]);
      pieces.forEach((piece, index) => { tokens.push(piece); ends.push(index === pieces.length - 1); });
    });
    return tokens.length ? foldHeader(name, tokens, ends) : '';
  }
  function subjectHeader(subject) {
    const text = stripControls(subject);
    if (!text) return 'Subject:';
    return foldHeader('Subject', needsEncoding(text) ? encodedWords(text) : text.split(' '));
  }

  // --- Les parties ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

  const randomHex = length => {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto : { getRandomValues: array => array.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
    return Array.from(bytes, b => (b < 16 ? '0' : '') + b.toString(16)).join('').slice(0, length);
  };
  const newBoundary = () => 'pp_' + randomHex(24);

  // Un nom de fichier joint : sans signe de chemin ni de contrôle, 120 caractères au plus (extension gardée), jamais vide. Un nom vide ou ne portant que des points prend le repli.
  function safeFileName(name, fallback) {
    let clean = stripControls(name).replace(/[\\/:*?"<>|]+/g, '_').replace(/^[.\s]+/, '').trim();
    if (clean.length > 120) {
      const dot = clean.lastIndexOf('.');
      const extension = dot > 0 && clean.length - dot <= 12 ? clean.slice(dot) : '';
      clean = clean.slice(0, 120 - extension.length) + extension;
    }
    return clean || fallback;
  }
  // Un type MIME : sa forme est vérifiée (type/sous-type), sinon un fichier quelconque.
  const mimeType = type => (/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(String(type || '').trim()) ? String(type).trim().toLowerCase() : 'application/octet-stream');
  // Le nom d'une pièce jointe dans un paramètre : entre guillemets s'il est de l'ASCII ; sinon des mots encodés, repliés entre eux (l'usage de Gmail et d'Outlook : une messagerie les lit mis bout à bout).
  const parameterName = name => '"' + (needsEncoding(name) ? encodedWords(name).join(CRLF + ' ') : name.replace(/(["\\])/g, '\\$1')) + '"';

  function textPart(type, content) {
    return ['Content-Type: ' + type + '; charset="utf-8"', 'Content-Transfer-Encoding: quoted-printable'].join(CRLF) + CRLF + CRLF + quotedPrintable(content);
  }
  function filePart(file, inline) {
    const name = file.name;
    const headers = ['Content-Type: ' + mimeType(file.type) + ';' + CRLF + ' name=' + parameterName(name), 'Content-Transfer-Encoding: base64'];
    if (inline) headers.push('Content-ID: <' + file.cid + '>', 'Content-Disposition: inline;' + CRLF + ' filename=' + parameterName(name));
    else headers.push('Content-Disposition: attachment;' + CRLF + ' filename=' + parameterName(name));
    return headers.join(CRLF) + CRLF + CRLF + base64Lines(file.bytes);
  }
  // Un conteneur multipart : ses parties (chacune avec ses en-têtes) entre les lignes de séparation.
  function multipart(subtype, parts) {
    const boundary = newBoundary();
    return {
      boundary,
      text: 'Content-Type: multipart/' + subtype + '; boundary="' + boundary + '"' + CRLF + CRLF
        + parts.map(part => '--' + boundary + CRLF + part + CRLF).join('') + '--' + boundary + '--' + CRLF,
    };
  }

  // Le message entier, en texte ASCII (tout est encodé), CRLF partout. `message` : { to, cc, bcc (les textes des champs), subject, text, html, inline: [{ cid, type, name, bytes }], attachments: [{ type, name, bytes }],
  // date, messageId }. Rend { text, skipped } - `skipped` : les adresses refusées.
  function build(message) {
    const skipped = [];
    const headers = [
      'MIME-Version: 1.0',
      'Date: ' + (message.date || new Date()).toUTCString().replace('GMT', '+0000'),
      'Message-ID: <' + (message.messageId || randomHex(20) + '.' + Date.now().toString(36) + '@publipostage.invalid') + '>',
      'X-Unsent: 1',
    ];
    ['To', 'Cc', 'Bcc'].forEach(name => {
      const header = addressHeader(name, message[name.toLowerCase()], skipped);
      if (header) headers.push(header);
    });
    headers.push(subjectHeader(message.subject));
    const plain = textPart('text/plain', message.text || '');
    const inline = message.inline || [];
    const attachments = message.attachments || [];
    const htmlPart = textPart('text/html', message.html || '');
    const richPart = inline.length ? multipart('related', [htmlPart].concat(inline.map(file => filePart(file, true)))).text : htmlPart;
    const alternative = multipart('alternative', [plain, richPart]).text;
    const root = attachments.length ? multipart('mixed', [alternative].concat(attachments.map(file => filePart(file, false)))).text : alternative;
    return { text: headers.join(CRLF) + CRLF + root, skipped };
  }

  // --- Le HTML du message -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

  // Les règles d'une feuille de style, une par sélecteur : { selector, declarations: [[propriété, valeur, important]], order }. Les blocs `@…` (@media) sont laissés : ils ne disent rien d'un message.
  function splitTop(text, separator) {
    const parts = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      if (quote) { if (character === '\\') i++; else if (character === quote) quote = ''; continue; }
      if (character === '"' || character === "'") quote = character;
      else if (character === '(') depth++;
      else if (character === ')') depth = Math.max(0, depth - 1);
      else if (character === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts;
  }
  function declarationsOf(text) {
    const out = [];
    splitTop(text, ';').forEach(piece => {
      const colon = piece.indexOf(':');
      if (colon < 1) return;
      const property = piece.slice(0, colon).trim().toLowerCase();
      let value = piece.slice(colon + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
      if (property && value) out.push([property, value, important]);
    });
    return out;
  }
  function rulesOf(css) {
    const source = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    let order = 0;
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf('{', i);
      if (open === -1) break;
      const selector = source.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) { if (source[j] === '{') depth++; else if (source[j] === '}') depth--; j++; }
      const body = source.slice(open + 1, j - 1);
      i = j;
      if (!selector || selector[0] === '@') continue;
      const declarations = declarationsOf(body);
      splitTop(selector, ',').map(one => one.trim()).filter(Boolean).forEach(one => rules.push({ selector: one, declarations, specificity: specificityOf(one), order: order++ }));
    }
    return rules;
  }
  // La spécificité d'un sélecteur (identifiants, classes et attributs, éléments), assez juste pour la feuille que l'export HTML écrit : `:where()` ne compte pas, `:is()` et `:not()` valent leur contenu.
  function specificityOf(selector) {
    let text = selector;
    for (let guard = 0; guard < 8; guard++) {
      const stripped = text.replace(/:where\([^()]*\)/g, '');
      if (stripped === text) break;
      text = stripped;
    }
    text = text.replace(/:(?:is|not|has)\(([^()]*)\)/g, ' $1 ');
    const ids = (text.match(/#[\w-]+/g) || []).length;
    const classes = (text.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
    const elements = (text.replace(/\.[\w-]+|\[[^\]]*\]|#[\w-]+|:{1,2}[\w-]+(\([^()]*\))?/g, ' ').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return ids * 10000 + classes * 100 + elements;
  }
  const isUsable = ([property, value]) => property.indexOf('--') !== 0 && value.indexOf('var(') === -1;

  // La feuille de style de `root` écrite dans ses balises : chaque règle est posée sur les éléments qu'elle atteint (selon le navigateur lui-même), les moins spécifiques d'abord, puis le style que la balise
  // portait déjà. Les propriétés qu'un message ne sait pas lire (variables CSS, `display: flow-root`) restent écrites : elles ne gênent personne.
  function inlineStyles(root, css) {
    const rules = rulesOf(css).sort((a, b) => a.specificity - b.specificity || a.order - b.order);
    const applied = new Map();
    const remember = (element, property, value, important) => {
      if (!applied.has(element)) applied.set(element, new Map());
      const known = applied.get(element).get(property);
      if (known && known.important && !important) return;
      applied.get(element).set(property, { value, important });
    };
    rules.forEach(rule => {
      let matched;
      try { matched = Array.from(root.querySelectorAll(rule.selector)); if (root.matches(rule.selector)) matched.unshift(root); } catch (e) { return; }
      matched.forEach(element => rule.declarations.filter(isUsable).forEach(([property, value, important]) => remember(element, property, value, important)));
    });
    applied.forEach((properties, element) => {
      declarationsOf(element.getAttribute('style') || '').filter(isUsable).forEach(([property, value, important]) => remember(element, property, value, important));
      element.setAttribute('style', Array.from(properties, ([property, entry]) => property + ': ' + entry.value + (entry.important ? ' !important' : '') + ';').join(' '));
    });
  }

  // Le contenu d'une data URI : { type, bytes }, ou null quand ce n'en est pas une.
  function dataUriParts(src) {
    const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/is.exec(String(src || '').trim());
    if (!match) return null;
    const isBase64 = /;base64/i.test(match[2]);
    try {
      if (isBase64) {
        const binary = atob(match[3].replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { type: match[1], bytes };
      }
      return { type: match[1], bytes: utf8(decodeURIComponent(match[3])) };
    } catch (e) { return null; }
  }
  const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const IMAGE_EXTENSION = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };

  // Le HTML d'un document déjà écrit par l'export HTML (`fragment` : `<style>` puis `<div class="pp-doc">`) en document de message : styles dans les balises, images appelées par `cid:`.
  // Rend { html, inline } - `inline` : les images du message, à joindre. Une image qui n'est pas une data URI (une adresse web) reste appelée par son adresse.
  function emailHtml(fragment, options) {
    const opts = options || {};
    // Le balisage est lu dans un <template> (inerte : rien ne charge, rien ne s'exécute) ; les <style> ne vont pas dans le message, leurs règles sont écrites dans les balises.
    const content = Dom.inertTemplate(String(fragment || '')).content;
    const css = Array.from(content.querySelectorAll('style')).map(style => style.textContent).join('\n');
    let root = content.querySelector('.pp-doc');
    if (!root) { root = document.createElement('div'); root.appendChild(content); }
    root.querySelectorAll('style').forEach(style => style.remove());
    inlineStyles(root, css);
    // Le conteneur est un bloc plein dans le message : ni largeur de lecture centrée, ni marge de page.
    ['max-width', 'margin', 'padding', 'display', 'tab-size', 'overflow-wrap'].forEach(property => root.style.removeProperty(property));
    const inline = [];
    const known = new Map();
    root.querySelectorAll('img').forEach(img => {
      const parts = dataUriParts(img.getAttribute('src'));
      if (!parts) return;
      const key = img.getAttribute('src');
      if (!known.has(key)) {
        const type = mimeType(parts.type);
        const cid = 'pp' + (inline.length + 1) + '.' + randomHex(12) + '@publipostage.invalid';
        known.set(key, cid);
        inline.push({ cid, type, name: 'image' + (inline.length + 1) + (IMAGE_EXTENSION[type] || ''), bytes: parts.bytes });
      }
      img.setAttribute('src', 'cid:' + known.get(key));
      // Outlook classique lit la taille d'une image sur ses attributs, pas sur son style.
      const width = /(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/i.exec(img.getAttribute('style') || '');
      if (width && !img.hasAttribute('width')) img.setAttribute('width', String(Math.round(Number(width[1]))));
    });
    const lang = opts.lang === 'en' ? 'en' : 'fr';
    const html = '<!DOCTYPE html>\n<html lang="' + lang + '">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<title>' + escapeHtml(stripControls(opts.title || '')) + '</title>\n</head>\n<body>\n'
      + root.outerHTML + '\n</body>\n</html>\n';
    return { html, inline };
  }

  // --- Les pièces jointes -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

  // Les fichiers déjà lus, pour qu'une même pièce jointe (les conditions générales jointes à chaque ligne) ne soit pas téléchargée à chaque ligne d'un lot : gardés une minute, 64 Mo au plus.
  const CACHE_LIFE_MS = 60000;
  const CACHE_MAX_BYTES = 64 * 1024 * 1024;
  const downloads = new Map();
  let downloadedBytes = 0;
  function forgetOldDownloads() {
    const now = Date.now();
    downloads.forEach((entry, id) => { if (now - entry.at > CACHE_LIFE_MS) { downloadedBytes -= entry.bytes.length; downloads.delete(id); } });
  }
  async function downloadAttachment(id) {
    forgetOldDownloads();
    if (downloads.has(id)) return downloads.get(id).bytes;
    const url = await GristAPI.getAttachmentDownloadUrl(id);
    if (!url) throw new Error('identifiant refusé');
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (downloadedBytes + bytes.length <= CACHE_MAX_BYTES) { downloads.set(id, { bytes, at: Date.now() }); downloadedBytes += bytes.length; }
    return bytes;
  }

  // Les numéros des pièces jointes que cite le champ PJ pour cette ligne, dans l'ordre du champ et sans doublon. Seules les bulles d'une colonne de type Pièces jointes comptent ; un texte tapé ou une
  // colonne Référence (dont la valeur est un numéro de ligne, pas un fichier) ne donnent rien.
  async function attachmentIdsOf(rawField, tableId, record) {
    const ids = [];
    for (const item of FieldCodec.itemsOf(rawField || '')) {
      if (!item.badge || !Variables.isAttachmentColumn(item.badge)) continue;
      const found = await Variables.resolveAttachmentIds(item.badge.table, item.badge.column, tableId, record);
      found.forEach(id => { if (ids.indexOf(id) === -1) ids.push(id); });
    }
    return ids;
  }
  // Les fichiers du champ PJ pour cette ligne : { id, name, type, bytes }. Un fichier illisible fait échouer la ligne (jamais un message sans la pièce attendue), avec les noms dans la phrase.
  async function readAttachments(rawField, tableId, record) {
    const ids = await attachmentIdsOf(rawField, tableId, record);
    if (!ids.length) return [];
    const infos = await GristAPI.getAttachmentInfos(ids);
    const files = [];
    const lost = [];
    for (const id of ids) {
      const info = infos.get(Number(id)) || {};
      const name = safeFileName(info.fileName, 'piece-jointe-' + id);
      try { files.push({ id, name, type: info.fileType, bytes: await downloadAttachment(id) }); } catch (e) { console.error('[eml-export] pièce jointe illisible', id, e); lost.push(name); }
    }
    if (lost.length) { const error = new Error(I18n.t('eml.attachmentUnreadable', { files: lost.join(', ') })); error.attachmentProblem = true; throw error; }
    return files;
  }
  // Les noms des pièces jointes d'une ligne (la Lecture les montre dans le champ PJ), sans télécharger quoi que ce soit.
  async function attachmentNamesOf(rawField, tableId, record) {
    const ids = await attachmentIdsOf(rawField, tableId, record);
    if (!ids.length) return [];
    const infos = await GristAPI.getAttachmentInfos(ids);
    return ids.map(id => safeFileName((infos.get(Number(id)) || {}).fileName, 'piece-jointe-' + id));
  }

  // --- L'export d'une ligne ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

  // L'objet, les destinataires et les pièces jointes d'une ligne : les champs du modèle (`fields` : { objet, destinataires, cc, cci, pj }, leurs valeurs enregistrées) résolus pour cette ligne.
  async function resolveFields(given, tableId, record) {
    const fields = Object.assign({ objet: '', destinataires: '', cc: '', cci: '', pj: '' }, given);
    const [objet, destinataires, cc, cci] = await Promise.all([
      Variables.resolveTextVariables(fields.objet, tableId, record), Variables.resolveTextVariables(fields.destinataires, tableId, record),
      Variables.resolveTextVariables(fields.cc, tableId, record), Variables.resolveTextVariables(fields.cci, tableId, record),
    ]);
    return { objet, destinataires, cc, cci };
  }

  // Le fichier .eml d'une ligne : le corps du modèle résolu pour la ligne (HTML de l'export HTML, texte brut du lien mailto:), les champs du modèle et les pièces jointes. Rend { blob, filename, skipped } -
  // `filename` : le nom du modèle de fichier, à défaut l'objet ; `skipped` : les adresses qui n'en sont pas.
  async function getEmlBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, fields) {
    // Le moteur de l'export HTML, dont le .eml reprend le document, se charge au premier besoin (js/export-engines.js).
    await ExportEngines.ensure(['html']);
    // Les images d'un autre site sont téléchargées pendant la préparation du document : la même fenêtre que pour tout export les liste (js/external-images.js).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    await AltReminder.confirmExport(htmlContent, headerFooterData);
    const { resolvedHtml, filename, resolved, files } = await GristAPI.withReadPass(async () => {
      const document = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, null);
      return { resolvedHtml: document.resolvedHtml, filename: document.filename, resolved: await resolveFields(fields, tableId, record), files: await readAttachments((fields || {}).pj, tableId, record) };
    });
    const fragment = await HtmlExport.htmlToDocument(resolvedHtml, null, { fragment: true });
    const { html, inline } = emailHtml(fragment, { title: resolved.objet, lang: I18n.getLang() });
    const text = MailtoExport.plainTextFromHtml(resolvedHtml);
    const built = build({ to: resolved.destinataires, cc: resolved.cc, bcc: resolved.cci, subject: resolved.objet, text, html, inline, attachments: files });
    // Le nom du modèle de fichier s'il y en a un ; sinon l'objet de l'email (le nom par défaut de l'export, « publipostage », ne dirait rien du message).
    const named = String(filenameTemplate || '').trim() ? String(filename || '').trim() : '';
    const name = named || stripControls(resolved.objet) || String(filename || '').trim();
    return { blob: new Blob([built.text], { type: 'message/rfc822' }), filename: name, skipped: built.skipped };
  }

  // La ligne affichée en un fichier téléchargé.
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, fields) {
    if (!record) { alert(I18n.t('alert.noRecordForExportEml')); return null; }
    const result = await getEmlBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, fields);
    ExportCommon.downloadBlob(result.blob, (result.filename || 'publipostage').replace(/[\\/:*?"<>|]+/g, '_') + '.eml');
    return result;
  }

  return {
    exportCurrentRecord, getEmlBlobForRecord, build, parseAddresses, addressHeader, subjectHeader, quotedPrintable, encodedWords, safeFileName, inlineStyles, emailHtml, rulesOf, specificityOf,
    attachmentNamesOf, readAttachments, attachmentIdsOf,
  };
})();
