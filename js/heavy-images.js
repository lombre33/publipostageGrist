// LES IMAGES LOURDES HORS DU TEXTE, LE TEMPS D'UN RENDU (11/11, un PowerPoint de 29 Mo : « l'ouverture du diaporama dans un nouvel onglet prend une éternité »). Une image posée dans un modèle y est
// écrite en entier (`src="data:image/…;base64,…"`) : 57 photos font 97 % d'un texte de 38 Mo, et chaque étape d'un rendu (sortie de présentation, question des images d'un autre site, nettoyage, Lecture,
// envoi à la fenêtre du diaporama) relit ou réécrit ce texte entier - cinq lectures et quatre écritures, 6,5 s mesurées avant la première diapositive, la page figée deux fois près de deux secondes.
//  - `lighten(html)` rend le même texte où chaque image lourde porte une adresse courte (`blob:`) que le navigateur charge comme l'image elle-même : les étapes travaillent sur le texte sans ses images
//    (2 Mo pour 38), et le rendu montre les mêmes images aux mêmes tailles, puisque ce sont les mêmes octets.
//  - CE TEXTE ALLÉGÉ NE VIT QUE LE TEMPS DU RENDU : une adresse `blob:` meurt avec la page, il ne s'enregistre donc ni ne s'exporte jamais. Seul un rendu qu'on jette (le diaporama) le reçoit, et `release()`
//    rend la mémoire quand ce rendu est retiré de la page - pas avant : une image déjà affichée survit à son adresse, mais pas la copie qu'un effet de transition en ferait ensuite.
//  - UNE AUTRE FENÊTRE ne lit pas les adresses `blob:` de celle-ci (la fenêtre du diaporama a sa propre origine, celle d'un cadre isolé) : elle reçoit les fichiers eux-mêmes (`images` : { url, blob }), les
//    nomme à son tour et remplace chaque adresse par la sienne (extensions/diapositives/slide-window.js:unpack).
//  - LE TEXTE N'EST JAMAIS LU CARACTÈRE PAR CARACTÈRE : la recherche saute d'un attribut `src` au guillemet qui le ferme (`indexOf`, natif). Une expression régulière qui validait chaque caractère du
//    base64 prenait 0,3 s sur 38 Mo ; c'est le décodage (`Uint8Array.fromBase64`, sinon `atob`) qui refuse une image mal écrite, et elle reste alors telle quelle dans le texte.
// Script classique, sans dépendance : rien d'autre que le navigateur.
const HeavyImages = (function () {
  const MIN_CHARS = 8192;          // en dessous, une image ne pèse pas : elle reste écrite dans le texte
  const OPEN = ' src="data:image/';
  const ADDRESS_AT = 6;            // dans OPEN, le rang du premier caractère de l'adresse (après ` src="`)
  const HEAD = /^data:image\/([A-Za-z0-9.+-]+);base64,/;
  const KEY_CHARS = 48;

  // L'attribut trouvé au rang `at` est-il celui d'une balise <img> ? La dernière balise ouverte avant lui est une <img>, pas encore fermée. Dans le texte d'un paragraphe, `<` s'écrit `&lt;` : la balise
  // ouverte avant un ` src="…"` écrit en toutes lettres est celle du paragraphe, jamais une image. Un `<` ou un `>` dans un autre attribut de la même balise : l'image n'est pas reconnue et reste telle quelle.
  function inImageTag(text, at) {
    const open = text.lastIndexOf('<', at);
    if (open === -1 || !text.startsWith('<img', open) || !/\s/.test(text.charAt(open + 4))) return false;
    const close = text.indexOf('>', open);
    return close === -1 || close > at;
  }

  // Les octets d'une image écrite en base64, en fichier. `Uint8Array.fromBase64` (natif) quand le navigateur l'a ; sinon `atob`, octet par octet. Un base64 mal écrit lève une erreur.
  function blobOf(subtype, base64) {
    let bytes;
    if (typeof Uint8Array.fromBase64 === 'function') {
      bytes = Uint8Array.fromBase64(base64);
    } else {
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'image/' + subtype.toLowerCase() });
  }

  // Le fichier de l'adresse `src` : { url, blob }, ou null quand elle ne se lit pas. La même image deux fois (un logo sur chaque diapositive) n'est qu'un fichier : `made` les retrouve par une clé courte -
  // la longueur, le début et la fin du base64 - puis par l'adresse entière, qui ne se compare que là (hacher 600 Ko par image pour une table coûtait 50 ms).
  function fileOf(src, made) {
    const head = HEAD.exec(src.slice(0, 64));
    if (!head) return null;
    const from = head[0].length;
    const key = head[1] + ':' + src.length + ':' + src.slice(from, from + KEY_CHARS) + src.slice(-KEY_CHARS);
    let known = made.get(key);
    if (!known) { known = []; made.set(key, known); }
    const same = known.find(item => item.src === src);
    if (same) return same.file;
    let file = null;
    try {
      const blob = blobOf(head[1], src.slice(from));
      file = { url: URL.createObjectURL(blob), blob };
    } catch (e) { file = null; }
    known.push({ src, file });
    return file;
  }

  // Le texte `html` allégé de ses images lourdes : { html, images, release }, ou null quand il n'y a rien à alléger (aucune image lourde). `images` : une entrée { url, blob } par image
  // DIFFÉRENTE ; `release()` libère leurs adresses, une seule fois.
  function lighten(html) {
    const text = String(html == null ? '' : html);
    if (text.length < MIN_CHARS || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const made = new Map();
    const images = [];
    const parts = [];
    let copied = 0;   // le rang du texte pas encore recopié
    let at = text.indexOf(OPEN);
    while (at !== -1) {
      const start = at + ADDRESS_AT;
      const end = text.indexOf('"', start);
      if (end === -1) break;
      if (end - start >= MIN_CHARS && inImageTag(text, at)) {
        const file = fileOf(text.slice(start, end), made);
        if (file) {
          if (images.indexOf(file) === -1) images.push(file);
          parts.push(text.slice(copied, start), file.url);
          copied = end;
        }
      }
      at = text.indexOf(OPEN, end);
    }
    if (!images.length) return null;
    parts.push(text.slice(copied));
    let released = false;
    return {
      html: parts.join(''),
      images,
      release() {
        if (released) return;
        released = true;
        images.forEach((image) => { URL.revokeObjectURL(image.url); });
      },
    };
  }

  return { lighten, MIN_CHARS };
})();
