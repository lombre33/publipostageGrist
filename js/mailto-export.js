// Export « lien mailto » du mode Email : écrit en texte brut le contenu déjà résolu d'un modèle (mêmes bulles #Variable que le mode Lecture) et
// assemble l'URL `mailto:` (à, cc, cci, objet, corps). js/main.js l'ouvre dans le logiciel de messagerie (onCreateEmail) et en mesure la longueur
// pour la jauge de la barre (updateEmailLengthGauge). Conception : planning/feature-email-mode.md.
// Contraintes du protocole `mailto:` (des limites du protocole, pas de l'implémentation) :
//   1) Le corps (`body=`) est toujours lu en texte brut par le client de messagerie (Outlook, Gmail, Apple Mail, Thunderbird...) : rien ne dit « ceci
//      est du HTML », des balises littérales (« <b>gras</b> ») s'afficheraient telles quelles. Aucune mise en forme (gras, italique, souligné, barré,
//      couleur, surlignage, police, taille, alignement) ne survit donc dans le corps.
//   2) La longueur de l'URL est limitée (~2000 caractères, tous champs encodés compris, selon le navigateur et le client ; Outlook bureau est le plus
//      strict), d'où SAFE_URL_LENGTH. Le dépassement est un avertissement (jauge rouge, confirmation avant d'ouvrir le lien), jamais un blocage.
//   3) Aucune pièce jointe via un lien `mailto:` : le besoin est de préremplir un brouillon (destinataires, objet, corps texte).
//   4) Zimbra, lu dans son code (Zimbra/zm-web-client, branche develop) : il s'inscrit comme gestionnaire de `mailto:` dans le navigateur
//      (`?view=compose&to=<le lien entier>`, js/zimbraMail/core/ZmZimbraMail.js) et lit le lien dans ZmMailApp `_parseComposeUrl` /
//      `_showComposeView` ; le corps n'y passe que comme texte. En rédaction HTML, ZmComposeView `_setBody1` le passe par AjxStringUtil.convertToHtml
//      : chaque retour à la ligne devient un <br>, deux espaces de suite et un espace en tête de ligne deviennent des espaces insécables. Les lignes
//      et les retraits du texte brut survivent donc (c'est pourquoi une sous-liste s'aligne par des espaces), rien d'autre (ni vraie puce, ni gras,
//      ni lien cliquable). Défauts de Zimbra lus au même endroit, hors de notre portée et jamais vus sur un vrai Zimbra : un « + » devient une espace
//      dans l'objet et le corps (replace(/\+/g, ' ') après le décodage) ; « & », « < » et « > » sont encodés en HTML (htmlEncode) dès la lecture du
//      lien et rien ne les décode ensuite, ils pourraient s'afficher « &amp; ».
//   5) Le texte a les lignes de l'éditeur, une pour une (Zimbra, voir 4, ne garde que les lignes) : un paragraphe vide, deux de suite ou un retour à
//      la ligne tapé sont des lignes vides du lien, et des paragraphes qui se suivent restent collés. Ce que l'éditeur d'un email permet d'écrire est
//      borné à ce que le texte porte (js/email-plain-text.js).
// Une vraie mise en forme demanderait un autre canal que le lien (le presse-papiers) : le choix retenu est « Texte seul », le lien reste le seul
// canal.
const MailtoExport = (function () {
  // Limite pratique, communément citée, d'un lien mailto: pour tous les clients (Outlook bureau surtout) : une marge sous le seuil dur plutôt que la
  // limite au plus juste.
  const SAFE_URL_LENGTH = 2000;

  // Puces d'une liste : les mêmes signes que ceux que l'éditeur et le PDF montrent (css/editor-v2.css, `li::marker` ; js/pdf-export.js,
  // BULLET_MARKERS) : ce que la personne voit dans le modèle est ce que le destinataire lit. Les trois tiennent dans Windows-1252, comme les accents
  // du texte.
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };

  // Le signe d'un item : puce, numéro (1. / a. / i., à partir de `start` comme l'éditeur et le PDF, js/pdf-export.js:listMarkerFor) ou case « [ ] » /
  // « [x] ».
  function listMarker(listEl, li, position) {
    if (listEl.getAttribute('data-type') === 'taskList') return li.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ';
    if (listEl.tagName === 'OL') {
      const number = (parseInt(listEl.getAttribute('start') || '1', 10) || 1) + position;
      const numberStyle = listEl.getAttribute('data-number-style');
      if (numberStyle === 'alpha') return HeadingNumbering.formatCounterValue(number, 'lower-alpha') + '. ';
      if (numberStyle === 'roman') return HeadingNumbering.formatCounterValue(number, 'upper-roman').toLowerCase() + '. ';
      return number + '. ';
    }
    return BULLET_MARKERS[listEl.getAttribute('data-bullet-style')] || BULLET_MARKERS.disc;
  }

  // Un lien : en texte brut il n'y a plus de cible cliquable, l'adresse s'écrit donc à la suite du texte, entre parenthèses (« le site
  // (https://exemple.fr) »), sauf si le texte est déjà l'adresse (avec ou sans « https:// »), qui n'est alors écrite qu'une fois. Un lien sans
  // texte donne son adresse seule.
  function linkAsText(text, href) {
    const target = href.replace(/^(?:mailto|tel):/i, '');
    const shown = text.trim();
    if (!shown) return target;
    const bare = value => value.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
    return bare(shown) === bare(target) ? text : `${text} (${target})`;
  }

  // Les balises dont rien ne s'écrit : aucune image possible en texte brut ; <style> et <script> ne sont jamais destinés à l'utilisateur (par
  // exemple le <style> que l'aperçu A4 paginé de ReaderMode injecte dans .reader-content) : à ignorer partout, jamais à extraire comme texte.
  const IGNORED_TAGS = new Set(['IMG', 'STYLE', 'SCRIPT']);

  // Un paragraphe, un titre ou un bloc de code qui en suit un autre dans le même bloc (citation de deux paragraphes, item de liste suivi d'un bloc
  // de code) commence sa propre ligne.
  const isLineBlock = node => node.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(node.tagName);

  // Le <br> que la Lecture pose dans un paragraphe vide (js/reader-mode.js:keepBlankLines, classe `pp-blank-line`) lui garde sa hauteur de ligne : ce n'est
  // pas un retour à la ligne tapé, le paragraphe vide est déjà la ligne vide.
  const isBlankLineFiller = el => el.classList.contains('pp-blank-line');

  // Une liste ou une citation dans un item, une citation ou une case : ses lignes sont écrites sur de nouvelles lignes, à la suite du texte qui les
  // précède (le retrait vient de l'appelant).
  const endLine = out => (out === '' || out.endsWith('\n') ? out : out + '\n');

  // Les lignes d'une liste ou d'une citation (null pour tout autre élément).
  const listOrQuoteText = el => (el.tagName === 'UL' || el.tagName === 'OL' ? listLines(el).join('\n') : el.tagName === 'BLOCKQUOTE' ? quoteText(el) : null);

  // Le texte d'un élément en ligne qui s'écrit autrement que son contenu : un lien (son adresse à la suite du texte), une note de bas de page, la
  // case d'une variable Oui / Non ; null pour tout autre élément.
  function specialInlineText(child) {
    if (child.tagName === 'A') {
      const href = HtmlSanitize.safeLinkHref(child.getAttribute('href'));
      if (href) return linkAsText(inlineText(child), href);
    }
    // Note de bas de page : sans pied de page en texte brut, la note est écrite à la suite, entre parenthèses, plutôt que perdue.
    if (child.classList && child.classList.contains('footnote-ref-marker')) {
      const text = (child.getAttribute('data-note-text') || '').trim();
      return text ? ` (${text})` : '';
    }
    // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : « [x] » / « [ ] », comme celle d'un item de liste à cases
    // (listMarker).
    if (child.classList && child.classList.contains('resolved-checkbox')) return child.getAttribute('data-checked') === 'true' ? '[x]' : '[ ]';
    return null;
  }

  // Ajoute à `acc.out` le texte d'un enfant d'un nœud en ligne ; `acc.sawLineBlock` : un paragraphe, titre ou bloc de code a déjà été écrit dans ce
  // nœud.
  function appendInlineChild(acc, child) {
    if (child.nodeType === Node.TEXT_NODE) { acc.out += child.textContent; return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    if (isLineBlock(child)) { if (acc.sawLineBlock) acc.out += '\n'; acc.sawLineBlock = true; }
    if (child.tagName === 'BR') { if (!isBlankLineFiller(child)) acc.out += '\n'; return; }
    const nested = listOrQuoteText(child);
    if (nested !== null) {
      if (nested) { acc.out = endLine(acc.out) + nested + '\n'; acc.sawLineBlock = false; }
      return;
    }
    const special = specialInlineText(child);
    if (special !== null) { acc.out += special; return; }
    if (IGNORED_TAGS.has(child.tagName)) return;
    acc.out += inlineText(child);
  }

  // Le texte d'un nœud en ligne : seul <br> est un retour à la ligne dur, toute mise en forme est ignorée (aucune ne survit en texte brut).
  function inlineText(node) {
    const acc = { out: '', sawLineBlock: false };
    node.childNodes.forEach(child => appendInlineChild(acc, child));
    return acc.out;
  }

  // Une liste à puces, numérotée ou à cases : un signe texte devant chaque item. Les lignes d'un item qui suivent la première (un second
  // paragraphe, un retour à la ligne, un bloc de code) et ses sous-listes se placent sous son texte, après la largeur du signe : « 10. » pousse
  // plus loin que « • ». Les lignes d'une sous-liste, écrites sans retrait par l'appel récursif de inlineText, reçoivent ainsi le leur de leur item
  // parent.
  function listLines(listEl) {
    const lines = [];
    let position = 0;
    Array.from(listEl.children).forEach(li => {
      if (li.tagName !== 'LI') return;
      const marker = listMarker(listEl, li, position++);
      const pad = ' '.repeat(marker.length);
      inlineText(li).trim().split('\n').forEach((line, index) => lines.push(((index === 0 ? marker : pad) + line).replace(/[ \t]+$/, '')));
    });
    return lines;
  }

  // Une citation : « > » devant chaque ligne, une ligne vide de la citation garde son « > » seul ; les blocs qu'elle contient s'écrivent comme
  // ailleurs (listes comprises), donc une citation dans une citation devient « >> ».
  function quoteText(node) {
    const inner = inlineText(node).trim();
    if (!inner) return '';
    return inner.split('\n').map(line => (line.trim() === '' ? '>' : (line.startsWith('>') ? '>' : '> ') + line)).join('\n');
  }

  // Ajoute à `lines` les lignes de `text` (séparées par « \n »).
  const pushLines = (lines, text) => text.split('\n').forEach(line => lines.push(line));

  // Les lignes d'un conteneur, dans l'ordre, ajoutées à `lines` : le corps du document, et l'intérieur d'un encadré (js/callout.js), qui n'a ni fond
  // ni barre en texte brut - ses blocs s'écrivent comme ceux du corps, listes comprises. Une ligne du texte est une ligne de l'éditeur : les
  // paragraphes y sont collés (`.tiptap p { margin: 0 }`, css/editor-v2.css), rien n'est donc ajouté entre deux blocs, et un paragraphe vide
  // (Entrée deux fois) est une ligne vide, comme un retour à la ligne tapé (Maj+Entrée) que rien ne suit.
  function collectBlocks(container, lines) {
    container.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) pushLines(lines, text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName;
      const nested = listOrQuoteText(node);
      if (nested !== null) { if (nested) pushLines(lines, nested); return; }
      if (/^H[1-6]$/.test(tag) || tag === 'P') { pushLines(lines, inlineText(node)); return; }
      // Bloc de code : son texte tel quel, lignes et retraits gardés (seuls les retours à la ligne de tête et de queue partent, jamais
      // l'indentation de la première ligne).
      if (tag === 'PRE') {
        const code = (node.textContent || '').replace(/^\n+|\s+$/g, '');
        if (code) pushLines(lines, code);
        return;
      }
      if (node.classList.contains('callout')) { collectBlocks(node, lines); return; }
      if (tag === 'HR') { lines.push('---'); return; }
      if (IGNORED_TAGS.has(tag)) return;
      if (tag === 'TABLE') {
        // Dégradation minimale (le bouton Tableau est grisé en mode email, ce cas ne devrait survenir qu'après un collage) : une ligne par ligne de
        // tableau, cellules séparées par « | ».
        const rows = Array.from(node.querySelectorAll('tr')).map(tr =>
          Array.from(tr.querySelectorAll('td, th')).map(cell => inlineText(cell).trim()).join(' | ')
        );
        if (rows.length) pushLines(lines, rows.join('\n'));
        return;
      }
      // Repli générique (zone 2-colonnes, autre bloc non prévu ci-dessus) : le texte est extrait plutôt que perdu.
      const text = inlineText(node).trim();
      if (text) pushLines(lines, text);
    });
  }

  // Le HTML déjà résolu (plus aucune bulle #Variable : il est passé par la même résolution que le mode Lecture, ReaderMode.render()) en texte brut
  // pour un corps mailto. Un sérialiseur à part, pas une extension de celui du PDF. Le texte a les lignes de l'éditeur, une pour une : un paragraphe
  // ou un titre est une ligne, sans ligne vide ajoutée entre deux blocs, et chaque paragraphe vide ou retour à la ligne tapé reste une ligne vide
  // (c'est ce que la personne voit dans le modèle, et le lien le porte tel quel : Zimbra n'en garde que les lignes) ; listes : le signe de l'éditeur
  // devant chaque item (puce, numéro, case), les lignes qui suivent et les sous-listes alignées sous le texte de l'item ; citation : « > » devant
  // chaque ligne (« >> » pour une citation dans une citation) ; toute mise en forme est ignorée (voir les contraintes du protocole plus haut).
  // Les espaces de fin de ligne, que rien ne montre dans l'éditeur et que l'encodage compte pour trois caractères chacun, et les lignes vides de fin
  // de texte ne sont pas écrits ; ceux de début de ligne (un retrait tapé) le sont.
  function plainTextFromHtml(html) {
    const holder = document.createElement('template'); // inerte : le HTML se lit sans que rien ne charge ni ne s'exécute
    holder.innerHTML = html || '';
    const root = holder.content;
    const lines = [];
    collectBlocks(root, lines);
    return lines.map(line => line.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
  }

  // Chaque adresse d'une liste séparée par des virgules est encodée à part, jamais la virgule : elle doit rester le séparateur littéral que les
  // clients de messagerie attendent (Outlook bureau compris), ce qu'un encodeURIComponent sur toute la chaîne ne ferait pas.
  function encodeAddressList(value) {
    if (!value) return '';
    return value.split(',').map(a => a.trim()).filter(Boolean).map(a => encodeURIComponent(a)).join(',');
  }

  // L'URL mailto: complète. to, cc, bcc, subject et bodyText arrivent déjà résolus (les #Variable sont substituées en amont, comme côté PDF par
  // ReaderMode) : cette fonction n'assemble et n'encode que.
  function buildMailtoUrl({ to, cc, bcc, subject, bodyText }) {
    const params = [];
    if (cc) params.push('cc=' + encodeAddressList(cc));
    if (bcc) params.push('bcc=' + encodeAddressList(bcc));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    // CRLF requis par le protocole mailto: (RFC 6068) : Outlook bureau y est strict, un simple \n ne suffit pas toujours.
    if (bodyText) params.push('body=' + encodeURIComponent(bodyText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')));
    const query = params.length ? '?' + params.join('&') : '';
    return 'mailto:' + encodeAddressList(to) + query;
  }

  // La longueur de l'URL face à SAFE_URL_LENGTH : `safe` pilote la jauge de main.js (rouge au-delà) et la confirmation avant ouverture, un
  // avertissement et jamais un blocage.
  function checkUrlLength(url) {
    return { length: url.length, safe: url.length <= SAFE_URL_LENGTH, limit: SAFE_URL_LENGTH };
  }

  return { plainTextFromHtml, buildMailtoUrl, checkUrlLength };
})();
