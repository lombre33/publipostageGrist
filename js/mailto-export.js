// Export "lien mailto" du mode Email : sérialise le contenu DÉJÀ RÉSOLU d'un modèle (mêmes bulles #Variable que le mode Lecture) en texte brut et assemble l'URL
// `mailto:` (à, cc, cci, objet, corps). js/main.js l'ouvre dans le logiciel de messagerie (onCreateEmail) et en mesure la longueur pour la jauge de la barre
// (updateEmailLengthGauge). Conception, décisions d'Antoine et articulation avec l'éditeur : planning/feature-email-mode.md.
//
// ============================================================================
// CONTRAINTES DURES DU PROTOCOLE mailto: (limites du protocole, pas de
// l'implémentation - à ne pas re-questionner sans nouvelle info)
// ============================================================================
// 1) Le corps (`body=`) est TOUJOURS interprété en texte brut par le client
//    mail (Outlook, Gmail, Apple Mail, Thunderbird...) - aucun moyen de
//    signaler "ceci est du HTML" dans ce protocole. Des balises HTML
//    littérales (ex. "<b>gras</b>") s'afficheraient telles quelles chez le
//    destinataire, pas comme du gras. CONFIRMÉ avec l'utilisateur : aucune
//    mise en forme (gras/italique/souligné/barré/couleur/surlignage/police/
//    taille/alignement) ne peut donc survivre dans le corps - le rendu final
//    est nécessairement du texte plat.
// 2) Longueur totale de l'URL limitée (~2000 caractères tous champs compris -
//    to+cc+bcc+subject+body encodés - variable selon navigateur/client,
//    Outlook desktop étant le plus strict), d'où SAFE_URL_LENGTH ci-dessous.
//    Dépassement = avertissement seul (jauge rouge, confirmation avant
//    d'ouvrir le lien), jamais un blocage.
// 3) Aucune pièce jointe possible via un lien `mailto:` - c'est une limite du
//    protocole, pas de l'implémentation. Confirmé que ce n'est PAS le besoin
//    (juste préremplir un brouillon destinataires + objet + corps texte).
// 4) Zimbra (le client web d'Antoine). Lu dans son code (Zimbra/zm-web-client, branche develop, 02/10) : il s'inscrit comme gestionnaire de `mailto:` dans le navigateur
//    (`?view=compose&to=<le lien entier>`, js/zimbraMail/core/ZmZimbraMail.js) et lit le lien dans ZmMailApp `_parseComposeUrl` / `_showComposeView` ; le corps n'y passe que comme
//    TEXTE. En rédaction HTML, ZmComposeView `_setBody1` le passe par AjxStringUtil.convertToHtml : chaque retour à la ligne devient un <br>, deux espaces de suite et un espace
//    en tête de ligne deviennent des espaces insécables - les lignes et les retraits du texte brut survivent (c'est pourquoi une sous-liste s'aligne par des espaces), rien d'autre
//    (ni vraie puce, ni gras, ni lien cliquable). Défauts de Zimbra lus au même endroit, hors de notre portée et jamais vus sur un vrai Zimbra : un « + » devient une espace dans l'objet et le corps
//    (replace(/\+/g, ' ') après le décodage) ; « & », « < » et « > » sont encodés en HTML (htmlEncode) dès la lecture du lien et rien ne les décode ensuite, ils pourraient s'afficher « &amp; ».
//    La vraie mise en forme demande un autre canal que le lien (le presse-papiers) : proposé à Antoine le 02/10, qui a choisi « Texte seul » - le lien reste le seul canal, à ne pas reproposer.
const MailtoExport = (function () {
  // Limite pratique communément citée pour un lien mailto: multi-client
  // (Outlook desktop en particulier) - garder une marge sous le seuil "dur"
  // plutôt que de viser l'extrême limite au plus juste.
  const SAFE_URL_LENGTH = 2000;

  // Puces d'une liste : les MÊMES signes que ceux que l'éditeur et le PDF montrent (css/editor-v2.css, `li::marker` ; js/pdf-export.js, BULLET_MARKERS) - ce que la personne voit dans
  // le modèle est ce que le destinataire lit. Les trois tiennent dans Windows-1252, comme les accents du texte.
  const BULLET_MARKERS = { disc: '• ', circle: '° ', square: '* ' };

  // Le signe d'un item : puce, numéro (1. / a. / i., à partir de `start` comme l'éditeur et le PDF, js/pdf-export.js:listMarkerFor) ou case « [ ] » / « [x] ».
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

  // Sérialise du HTML DÉJÀ RÉSOLU (plus aucune bulle #Variable/chip - passé par la même résolution
  // que le mode Lecture, ReaderMode.render(), avant d'arriver ici) en texte brut adapté à un corps
  // mailto. Sérialiseur séparé de pdf-export.js (pas une extension) :
  // règles de dégradation actées avec l'utilisateur - paragraphes/titres -> une ligne, ligne vide
  // entre blocs ; listes -> le signe de l'éditeur devant chaque item (puce, numéro, case), les lignes qui suivent et les sous-listes alignées sous le texte de l'item ; citation -> « > » devant
  // chaque ligne (« >> » pour une citation dans une citation) ; toute mise en forme (gras/couleur/police...) ignorée, aucune ne pouvant survivre dans du texte brut (§ contraintes dures ci-dessus).
  function plainTextFromHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = html || '';

    // Concatène le texte d'un nœud inline en ne gérant que <br> comme retour à la ligne dur - toute
    // mise en forme est délibérément ignorée (aucune ne peut survivre en texte brut).
    // Lien : en texte brut il n'y a plus de cible cliquable, l'adresse s'écrit donc à la suite du texte, entre parenthèses (« le site (https://exemple.fr) ») - sauf si le texte EST déjà
    // l'adresse (avec ou sans « https:// »), qui n'est alors écrite qu'une fois. Un lien sans texte donne son adresse seule.
    function linkAsText(text, href) {
      const target = href.replace(/^(?:mailto|tel):/i, '');
      const shown = text.trim();
      if (!shown) return target;
      const bare = value => value.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
      return bare(shown) === bare(target) ? text : `${text} (${target})`;
    }

    // Un paragraphe, un titre ou un bloc de code qui en suit un autre dans le même bloc (citation de deux paragraphes, item de liste suivi d'un bloc de code) commence sa propre ligne.
    const isLineBlock = node => node.nodeType === Node.ELEMENT_NODE && /^(P|DIV|H[1-6]|PRE)$/.test(node.tagName);

    // Une liste ou une citation dans un item, une citation ou une case : ses lignes sont écrites sur de nouvelles lignes, à la suite du texte qui les précède (le retrait vient de l'appelant).
    const endLine = out => (out === '' || out.endsWith('\n') ? out : out + '\n');

    function inlineText(node) {
      let out = '';
      let sawLineBlock = false;
      node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; return; }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (isLineBlock(child)) { if (sawLineBlock) out += '\n'; sawLineBlock = true; }
        if (child.tagName === 'BR') { out += '\n'; return; }
        if (child.tagName === 'UL' || child.tagName === 'OL') {
          const lines = listLines(child);
          if (lines.length) { out = endLine(out) + lines.join('\n') + '\n'; sawLineBlock = false; }
          return;
        }
        if (child.tagName === 'BLOCKQUOTE') {
          const quoted = quoteText(child);
          if (quoted) { out = endLine(out) + quoted + '\n'; sawLineBlock = false; }
          return;
        }
        if (child.tagName === 'A') {
          const href = HtmlSanitize.safeLinkHref(child.getAttribute('href'));
          if (href) { out += linkAsText(inlineText(child), href); return; }
        }
        // Note de bas de page : pas de page/pied de page en texte brut, la note est réinjectée
        // inline entre parenthèses plutôt que silencieusement perdue.
        if (child.classList && child.classList.contains('footnote-ref-marker')) {
          const text = (child.getAttribute('data-note-text') || '').trim();
          out += text ? ` (${text})` : '';
          return;
        }
        // Case à cocher d'une variable Oui / Non (js/reader-mode.js:checkboxNode) : « [x] » / « [ ] », comme celle d'un item de liste à cases (listMarker).
        if (child.classList && child.classList.contains('resolved-checkbox')) { out += child.getAttribute('data-checked') === 'true' ? '[x]' : '[ ]'; return; }
        if (child.tagName === 'IMG') return; // aucune image possible en texte brut mailto
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') return; // jamais de contenu utilisateur, à ignorer partout où il peut apparaître
        out += inlineText(child);
      });
      return out;
    }

    // Une liste à puces/numérotée/à cases dégrade en signe texte devant chaque item (règle ci-dessus). Les lignes d'un item qui suivent la première (un second paragraphe, un retour à la
    // ligne, un bloc de code) et ses sous-listes se placent sous son texte, après la largeur du signe : « 10. » pousse plus loin que « • ». Les lignes d'une sous-liste, écrites sans retrait
    // par l'appel récursif de inlineText, reçoivent ainsi le leur de leur item parent.
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

    // Une citation : « > » devant chaque ligne, une ligne vide de la citation garde son « > » seul ; les blocs qu'elle contient s'écrivent comme ailleurs (listes comprises), donc une
    // citation dans une citation devient « >> ».
    function quoteText(node) {
      const inner = inlineText(node).trim();
      if (!inner) return '';
      return inner.split('\n').map(line => (line.trim() === '' ? '>' : (line.startsWith('>') ? '>' : '> ') + line)).join('\n');
    }

    const blocks = [];
    // Les blocs d'un conteneur, dans l'ordre : le corps du document, et l'intérieur d'un encadré (js/callout.js), qui n'a ni fond ni barre en texte brut - ses blocs s'écrivent
    // comme ceux du corps, listes comprises.
    function collectBlocks(container) {
      container.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) blocks.push(text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName;
        if (tag === 'UL' || tag === 'OL') { blocks.push(listLines(node).join('\n')); return; }
        if (tag === 'BLOCKQUOTE') { blocks.push(quoteText(node)); return; }
        if (/^H[1-6]$/.test(tag) || tag === 'P') { blocks.push(inlineText(node).trim()); return; }
        // Bloc de code : son texte tel quel, lignes et retraits gardés (seuls les retours à la ligne de tête et de queue partent, jamais l'indentation de la première ligne).
        if (tag === 'PRE') { blocks.push((node.textContent || '').replace(/^\n+|\s+$/g, '')); return; }
        if (node.classList.contains('callout')) { collectBlocks(node); return; }
        if (tag === 'HR') { blocks.push('---'); return; }
        if (tag === 'IMG') return;
        // Balise jamais destinée à l'utilisateur (ex. <style> injecté par l'aperçu A4 paginé de
        // ReaderMode dans .reader-content) - à ignorer, jamais à extraire comme texte.
        if (tag === 'STYLE' || tag === 'SCRIPT') return;
        if (tag === 'TABLE') {
          // Dégradation minimale (le bouton Tableau est grisé en mode email - ce cas ne devrait
          // survenir qu'après un collage) : une ligne par ligne de tableau, cellules séparées par " | ".
          const rows = Array.from(node.querySelectorAll('tr')).map(tr =>
            Array.from(tr.querySelectorAll('td, th')).map(cell => inlineText(cell).trim()).join(' | ')
          );
          blocks.push(rows.join('\n'));
          return;
        }
        // Repli générique (zone 2-colonnes, autre bloc non prévu ci-dessus) : extrait le texte plutôt
        // que de le perdre silencieusement.
        const text = inlineText(node).trim();
        if (text) blocks.push(text);
      });
    }
    collectBlocks(root);

    return blocks.filter(b => b.length > 0).join('\n\n');
  }

  // Encode une liste d'adresses séparées par virgule individuellement (jamais la virgule elle-même,
  // qui doit rester le séparateur littéral attendu par les clients mail - Outlook bureau, client
  // cible retenu §0, inclus) plutôt qu'un encodeURIComponent global sur toute la chaîne.
  function encodeAddressList(value) {
    if (!value) return '';
    return value.split(',').map(a => a.trim()).filter(Boolean).map(a => encodeURIComponent(a)).join(',');
  }

  // Construit l'URL mailto: complète. to/cc/bcc/subject/bodyText sont attendus DÉJÀ RÉSOLUS
  // (#Variable substituées en amont, même mécanisme que ReaderMode côté PDF - réutilisé, pas
  // réécrit) - cette fonction ne fait qu'assembler et encoder.
  function buildMailtoUrl({ to, cc, bcc, subject, bodyText }) {
    const params = [];
    if (cc) params.push('cc=' + encodeAddressList(cc));
    if (bcc) params.push('bcc=' + encodeAddressList(bcc));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    // CRLF requis par le protocole mailto: (RFC 6068) - Outlook bureau y est strict, un simple \n
    // ne suffit pas toujours.
    if (bodyText) params.push('body=' + encodeURIComponent(bodyText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')));
    const query = params.length ? '?' + params.join('&') : '';
    return 'mailto:' + encodeAddressList(to) + query;
  }

  // Longueur de l'URL construite vs SAFE_URL_LENGTH : `safe` pilote la jauge de main.js (rouge au-delà)
  // et la confirmation avant ouverture - un avertissement, jamais un blocage dur.
  function checkUrlLength(url) {
    return { length: url.length, safe: url.length <= SAFE_URL_LENGTH, limit: SAFE_URL_LENGTH };
  }

  return { plainTextFromHtml, buildMailtoUrl, checkUrlLength };
})();
