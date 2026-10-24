// Export HTML : le document d'une ligne en un fichier .html, pour un site web (une seule ligne, ou un fichier par ligne dans une archive ZIP : js/main.js, BATCH_EXPORTS.htmlZip et
// htmlFragmentZip). Comme le Markdown et le Word, il part du HTML que ReaderMode.preview a résolu pour la ligne (variables remplacées par leurs valeurs, blocs conditionnels
// tranchés, ExportCommon.resolveRecord) ; mais ce HTML est déjà du HTML : il n'est pas réécrit dans un autre langage, il est NETTOYÉ de ce qui ne sert qu'au widget et accompagné d'une
// feuille de style qui emporte sa mise en forme.
//
// Le texte coule comme une page web : ni feuilles A4, ni marges, ni numéros de page, ni filigrane. L'en-tête et le pied de page s'écrivent UNE fois, en haut et en bas (le pied par
// défaut, sinon celui de la première page ; l'en-tête de la première page quand « première page différente » est réglé et rempli, sinon l'en-tête par défaut). Le numéro de page
// s'en va avec ce qui l'annonce (« Page », « / », « sur »), et une ligne qui ne disait que cela disparaît. Les images partent dans le fichier (une adresse web reste une adresse ;
// une pièce jointe de Grist, un graphique ou un code QR est écrit en data URI), sauf celles qui ne sont pas du texte : « derrière le texte » et « sur toutes les pages » (un fond,
// un papier à en-tête).
//
// Deux fichiers, deux types du menu « Type d'export » :
//  - « HTML (fichier à déposer) » : un document complet (doctype, UTF-8, titre, feuille de style de la page entière, largeur de lecture centrée), à poser tel quel sur un site ;
//  - « HTML (contenu à coller) » : le contenu seul, `<style>` et `<div class="pp-doc">…</div>`, à copier dans un bloc HTML d'un gestionnaire de contenu. Sa feuille de style ne
//    touche que ce bloc (chaque règle commence par `.pp-doc`) et ne dit rien de la typographie du texte (police, couleur, taille, titres, liens, citations) : elle vient du site.
// Le contenu est le même ; seule change la feuille de style (BASE_CSS n'est écrite que dans le fichier complet). Seuls les blocs de style dont le document se sert sont écrits.
//
// Ce qui est écrit : titres (leur numérotation « 1) », « a) », « Article 1 » est écrite dans le texte, comme dans le PDF ; le sommaire est une liste de liens), paragraphes
// (alignement), gras, italique, souligné, barré, exposant, indice, couleur, fond, taille et police, liens, tabulations, listes (puces, numéros, lettres, romain, cases à cocher),
// citations, blocs de code, filet, tableaux (colonnes, fusions, bordures et quadrillage d'une grille, fonds, alignement vertical), encadrés (couleur et icône), zones à deux colonnes
// (empilées sur un écran étroit), images (largeur, alignement), légendes, notes de bas de page (liens aller et retour). Ce qu'il ne garde pas, volontairement : les marges, le format et
// le sens de la page, les sauts de page, le filigrane, les images derrière le texte ou sur toutes les pages, les numéros de page, la position des images « devant le texte » (elles
// suivent le texte) et les polices elles-mêmes (le fichier n'en emporte aucune : une police nommée dans le document reste nommée, avec des polices de repli).
//
// Rien de ce qui peut s'exécuter n'est écrit : le HTML d'entrée passe d'abord par HtmlSanitize.parseInert (liste blanche de balises et d'attributs, aucune adresse active), puis chaque
// balise, attribut et déclaration de style écrits le sont à leur tour par liste blanche. `htmlToDocument` ne résout rien (ni ligne, ni Grist) : il écrit le HTML qu'on lui donne. La
// fenêtre des images d'un autre site (js/external-images.js) s'ouvre avant, dans `getHtmlBlobForRecord`, comme pour tous les exports : le navigateur les télécharge pendant la
// préparation du document. Les suggestions du suivi des modifications sont acceptées, comme dans tous les exports. Les textes que le fichier écrit lui-même (titre du sommaire,
// retour des notes) suivent la langue de l'interface.
const HtmlExport = (function () {
  const PREFIX = 'pp-';

  // --- La feuille de style : des blocs, écrits seulement quand le document s'en sert ---------------------------------------------------------------------
  // BASE_CSS : la typographie d'une page entière (fichier complet). Les tailles de titre sont celles de l'éditeur (24, 20, 16, 14, 13 et 12 pt sur un texte de 14 px) en em, pour
  // garder leurs proportions quelle que soit la taille du texte.
  const BASE_CSS = [
    'html { -webkit-text-size-adjust: 100%; }',
    'body { margin: 0; background: #fff; }',
    '.pp-doc { box-sizing: border-box; max-width: 46rem; margin: 0 auto; padding: 2rem 1rem; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1b2430; }',
    '.pp-doc :is(h1, h2, h3, h4, h5, h6) { font-weight: 700; }',
    '.pp-doc h1 { font-size: 2.286em; } .pp-doc h2 { font-size: 1.905em; } .pp-doc h3 { font-size: 1.524em; }',
    '.pp-doc h4 { font-size: 1.333em; } .pp-doc h5 { font-size: 1.238em; } .pp-doc h6 { font-size: 1.143em; }',
    '.pp-doc a { color: #0563c1; text-decoration: underline; }',
    '.pp-doc blockquote { margin: 4px 0; padding-left: 12px; border-left: 3px solid #d0d7de; font-style: italic; color: #444; }',
    '@media print { .pp-doc { max-width: none; padding: 0; } }',
  ].join('\n');
  // Le texte : les paragraphes sont serrés comme dans l'éditeur (un espace voulu est un paragraphe vide), les blancs gardés comme lui (`break-spaces`), la tabulation au cran de
  // 12,7 mm (js/tab-indent.js), l'exposant et l'indice sans écarter les lignes (js/script-marks.js).
  const TEXT_CSS = [
    '.pp-doc { display: flow-root; tab-size: 12.7mm; overflow-wrap: break-word; }',
    '.pp-doc :where(p, h1, h2, h3, h4, h5, h6) { margin: 0; }',
    '.pp-doc :where(p, h1, h2, h3, h4, h5, h6, li, td, th) { white-space: break-spaces; }',
    '.pp-doc :where(ul, ol) { margin: 0; padding-left: 1.4em; }',
    // Le rond ou le numéro d'un point de liste suit la couleur et la taille du début de son texte (js/list-markers.js) : deux variables posées en ligne sur le <li>, que la règle du <li> remet à zéro pour qu'une sous-liste
    // ne reçoive pas celles de son parent.
    '.pp-doc li { --pp-marker-color: initial; --pp-marker-size: initial; }',
    '.pp-doc li::marker { color: var(--pp-marker-color, currentcolor); font-size: var(--pp-marker-size, 1em); }',
    '.pp-doc :where(sup:not(.pp-fnref), sub) { font-size: .6em; line-height: 0; position: relative; vertical-align: baseline; top: .35em; }',
    '.pp-doc sup:not(.pp-fnref) { top: -.75em; }',
    '.pp-doc hr { box-sizing: content-box; height: 1px; margin: 0; padding: 10px 0; border: 0; background: #d0d7de content-box; }',
    '.pp-doc pre { margin: 4px 0; padding: 8px 10px; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 4px; color: #1b2430; font: .9em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace; white-space: pre; overflow-x: auto; }',
    '.pp-doc pre code { font: inherit; background: none; padding: 0; }',
  ].join('\n');
  // La légende (js/caption.js) : 12 px, italique, gris (7:1 sur le blanc).
  const CAPTION_CSS = '.pp-doc .pp-caption { font-size: 12px; font-style: italic; color: #595959; }';
  // L'en-tête et le pied, écrits une fois : un peu d'air entre eux et le texte.
  const ZONE_CSS = '.pp-doc .pp-zone { display: flow-root; }\n.pp-doc .pp-header { margin-bottom: 12px; }\n.pp-doc .pp-footer { margin-top: 12px; }';
  const IMAGE_CSS = [
    '.pp-doc img { max-width: 100%; height: auto; vertical-align: bottom; }',
    '.pp-doc img.pp-left { float: left; margin: 0 12px 8px 0; max-width: calc(100% - 12px); }',
    '.pp-doc img.pp-right { float: right; margin: 0 0 8px 12px; max-width: calc(100% - 12px); }',
    '.pp-doc img.pp-center { display: block; margin-left: auto; margin-right: auto; }',
    '.pp-doc img.pp-block { display: block; }',
  ].join('\n');
  // Le tableau : le trait de chaque côté, le retrait, le fond et l'alignement vertical d'une case sont écrits dans la case (un site qui change le style des tableaux ne lui retire
  // ni ses bordures ni ses réglages) ; ici ne reste que ce qui ne peut pas s'écrire en ligne : le défilement d'un tableau plus large que la page et la coupure d'un mot long.
  const TABLE_CSS = [
    '.pp-doc .pp-table { overflow-x: auto; margin: 6px 0; }',
    '.pp-doc .pp-table :where(td, th) { overflow-wrap: break-word; }',
  ].join('\n');
  const COLUMNS_CSS = [
    '.pp-doc .pp-columns { --pp-col-left: max(10mm, min(var(--pp-left, 50%), calc(100% - 16px - 10mm))); display: grid; grid-template-columns: var(--pp-col-left) calc(100% - var(--pp-col-left) - 16px); gap: 16px; margin: 6px 0; }',
    '.pp-doc .pp-column { min-width: 0; padding: 4px; }',
    '@media (max-width: 36em) { .pp-doc .pp-columns { grid-template-columns: 1fr; } }',
  ].join('\n');
  // Les cases (une variable Oui / Non et une liste à cases) : un carré dessiné à la main dans la couleur du texte, le caractère ☑ / ☐ gardé dedans, poussé hors du carré (il se copie
  // et se lit sans se voir). Mêmes règles que css/editor-v2.css (`.resolved-checkbox`).
  const CHECKBOX_CSS = [
    '.pp-doc .pp-checkbox { display: inline-block; position: relative; box-sizing: border-box; width: 1.07em; height: 1.07em; margin: 0 .1em; vertical-align: -.16em; overflow: hidden; white-space: nowrap; text-indent: 3em; text-decoration: none; border: .107em solid currentColor; border-radius: .2em; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.pp-doc .pp-checkbox.pp-classic { border-radius: .143em; }',
    '.pp-doc .pp-checkbox.pp-checked:not(.pp-classic) { background: currentColor; }',
    '.pp-doc .pp-checkbox.pp-checked::after { content: ""; position: absolute; left: .21em; top: -.07em; width: .29em; height: .57em; border: solid currentColor; border-width: 0 .143em .143em 0; transform: rotate(40deg); }',
    '.pp-doc .pp-checkbox.pp-checked:not(.pp-classic)::after { border-color: #fff; }',
  ].join('\n');
  const TASKS_CSS = [
    '.pp-doc ul.pp-tasks > li { display: flex; align-items: flex-start; gap: 6px; }',
    '.pp-doc .pp-tasks .pp-checkbox { flex: none; margin-top: .2em; color: #2f6fed; }',
    '.pp-doc .pp-tasks.pp-tasks-classic .pp-checkbox { color: #222; }',
    '.pp-doc .pp-task-body { flex: 1; min-width: 0; }',
    '.pp-doc ul.pp-tasks:not(.pp-tasks-classic):not(.pp-tasks-plain) > li.pp-done > .pp-task-body { text-decoration: line-through; color: #667085; }',
  ].join('\n');
  const TOC_CSS = [
    '.pp-doc .pp-toc { margin: 6px 0; }',
    '.pp-doc .pp-toc-title { font-weight: 700; }',
    '.pp-doc .pp-toc ul { list-style: none; margin: 0; padding-left: 1.2em; }',
    '.pp-doc .pp-toc > ul { padding-left: 0; }',
    '.pp-doc .pp-toc-empty { font-style: italic; }',
  ].join('\n');
  const FOOTNOTES_CSS = [
    '.pp-doc .pp-fnref { line-height: 0; font-weight: 600; }',
    '.pp-doc .pp-fnref a { color: #146c43; text-decoration: none; }',
    '.pp-doc ol.pp-footnotes { margin: 12px 0 0; padding: 8px 0 0 1.6em; border-top: 1px solid #d0d7de; font-size: .85em; }',
  ].join('\n');
  // L'encadré : la mise en page ci-dessous, les couleurs et l'icône de js/callout.js (Callout.styleText : sa palette n'est écrite qu'à cet endroit), réduites aux couleurs et aux
  // icônes que le document emploie.
  const CALLOUT_CSS = [
    '.pp-doc .pp-callout { position: relative; box-sizing: border-box; display: flow-root; margin: 6px 0; padding: 8px 12px 8px 40px; background: var(--callout-tint); border-left: 4px solid var(--callout-accent); border-radius: 0 6px 6px 0; color: #1b2430; font-style: normal; }',
    '.pp-doc .pp-callout::before { content: ""; position: absolute; left: 12px; top: 10px; width: 20px; height: 20px; background-color: var(--callout-accent); -webkit-mask: var(--callout-icon) center / contain no-repeat; mask: var(--callout-icon) center / contain no-repeat; }',
  ].join('\n');

  // Les règles de couleur et d'icône de l'encadré, pour les couleurs et les icônes que le document emploie : celle de départ, puis une par couleur et par icône.
  function calloutPalette(used) {
    const rules = Callout.styleText().split('\n');
    const kept = rules.filter((rule, index) => index === 0
      || Array.from(used.colors).some(color => rule.indexOf('[data-color="' + color + '"]') !== -1)
      || Array.from(used.icons).some(icon => rule.indexOf('[data-icon="' + icon + '"]') !== -1));
    return kept.map(rule => rule.replace(/\.callout/g, '.pp-doc .pp-callout')).join('\n');
  }

  function stylesheetFor(ctx, fragment) {
    const parts = [];
    if (!fragment) parts.push(BASE_CSS);
    parts.push(TEXT_CSS);
    if (ctx.uses.has('zone')) parts.push(ZONE_CSS);
    if (ctx.uses.has('caption')) parts.push(CAPTION_CSS);
    if (ctx.uses.has('image')) parts.push(IMAGE_CSS);
    if (ctx.uses.has('table')) parts.push(TABLE_CSS);
    if (ctx.uses.has('columns')) parts.push(COLUMNS_CSS);
    if (ctx.uses.has('checkbox')) parts.push(CHECKBOX_CSS);
    if (ctx.uses.has('tasks')) parts.push(TASKS_CSS);
    if (ctx.uses.has('toc')) parts.push(TOC_CSS);
    if (ctx.uses.has('footnotes')) parts.push(FOOTNOTES_CSS);
    if (ctx.uses.has('callout')) parts.push(CALLOUT_CSS, calloutPalette(ctx.callouts));
    return parts.join('\n');
  }

  // --- Ce qui peut être écrit : balises, attributs et déclarations de style, par liste blanche ------------------------------------------------------
  // Les balises gardées telles quelles ; toute autre est ouverte (son contenu reste).
  const KEPT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'strong', 'em', 'u', 's', 'del', 'ins', 'mark', 'sup', 'sub', 'small', 'code', 'kbd', 'samp',
    'abbr', 'cite', 'q', 'time', 'dfn', 'var', 'ul', 'ol', 'li', 'blockquote', 'caption', 'figcaption', 'figure', 'dl', 'dt', 'dd', 'address']);
  // Une balise ancienne qui dit la même chose qu'une balise actuelle.
  const TAG_ALIAS = { b: 'strong', i: 'em', strike: 's', tt: 'code' };
  const SKIPPED_TAGS = new Set(['script', 'style', 'template', 'input', 'label', 'button', 'select', 'textarea', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'head', 'title', 'link', 'meta']);
  const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'hr', 'figure', 'figcaption',
    'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'dl', 'dt', 'dd', 'address', 'caption', 'center']);
  const isBlockEl = el => el.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(el.localName);
  const ATOM_CLASSES = ['var-badge', 'calc-badge', 'smart-chip', 'mention-chip', 'conditional-checkbox'];
  // Les déclarations de style gardées : celles que l'éditeur écrit (texte, fond, taille, police, alignement, largeur d'une image, d'un tableau ou d'une colonne, fond d'une case)
  // et l'apparence du texte. La position, la taille d'une boîte hors image et tableau, les marges, les bords (écrits d'après `data-border-*`, voir cellInto) et tout ce qui charge
  // une ressource ne passent pas.
  const STYLE_PROPS = new Set(['color', 'background', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'text-decoration-line',
    'text-decoration-color', 'text-decoration-style', 'text-indent', 'tab-size', 'text-transform', 'letter-spacing', 'font-variant', 'font-variant-caps', 'text-shadow', '-webkit-text-stroke', 'line-height', 'vertical-align', 'white-space', 'opacity', 'aspect-ratio', 'list-style-type']);
  const SIZED_TAGS = new Set(['img', 'table', 'col']);
  const SIZE_PROPS = new Set(['width', 'min-width', 'max-width']);
  // L'espace avant, l'espace après et le retrait à gauche d'un paragraphe (« Paragraphe… », js/paragraph-format.js) sont ses remplissages du haut, du bas et de gauche : seul un <p> les garde.
  const SPACE_PROPS = new Set(['padding-top', 'padding-bottom', 'padding-left']);
  // Les deux retraits (ce remplissage de gauche et `text-indent`, celui de la première ligne) dorment dans une liste et une citation : la feuille de style de l'éditeur les y neutralise, le fichier
  // n'a pas la sienne et les appliquerait.
  const INDENT_PROPS = new Set(['padding-left', 'text-indent']);
  // Une valeur qui charge, exécute ou s'échappe n'est jamais écrite (HtmlSanitize a déjà retiré les url() du style d'entrée ; ceci protège ce que ce fichier écrit lui-même).
  const UNSAFE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|vbscript:|behavior|binding|@import|\\|[<>]/i;

  // Les déclarations d'un attribut style, en paires [propriété, valeur] : une barre de ponctuation dans une parenthèse ou une chaîne ne coupe pas la déclaration.
  function declarationsOf(text) {
    const out = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let i = 0; i <= text.length; i += 1) {
      const c = text[i];
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') depth += 1;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if ((c === ';' && depth === 0) || i === text.length) {
        const part = text.slice(start, i).trim();
        start = i + 1;
        const colon = part.indexOf(':');
        if (colon > 0) out.push([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]);
      }
    }
    return out;
  }
  // Les polices du texte ne sont pas emportées dans le fichier : une police qu'on nomme sans repli retomberait sur celle du navigateur (une police à empattements pour du Roboto). Les six
  // du menu de l'éditeur reçoivent chacune des polices proches, installées partout ; une liste déjà écrite avec une virgule reste telle quelle.
  const FONT_FALLBACKS = {
    roboto: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif", arial: 'Helvetica, sans-serif', 'times new roman': 'Times, serif', georgia: 'serif',
    'courier new': 'Courier, monospace', calibri: "Carlito, 'Segoe UI', Helvetica, Arial, sans-serif",
  };
  // Les noms entre apostrophes : l'attribut style est écrit entre guillemets, une apostrophe y reste telle quelle (un guillemet y serait écrit &quot;).
  function fontStack(value) {
    const quoted = value.replace(/"/g, "'");
    if (quoted.indexOf(',') !== -1) return quoted;
    const fallback = FONT_FALLBACKS[quoted.replace(/^'|'$/g, '').trim().toLowerCase()];
    return fallback ? quoted + ', ' + fallback : quoted;
  }
  const propAllowed = (prop, tag) => STYLE_PROPS.has(prop) || (SIZE_PROPS.has(prop) && SIZED_TAGS.has(tag)) || (SPACE_PROPS.has(prop) && tag === 'p');
  // L'attribut style gardé d'un élément : ses déclarations permises, dans leur ordre. `skip` : des propriétés que l'appelant écrit autrement (l'image garde sa largeur seulement).
  function keptStyle(el, skip) {
    const text = el.getAttribute('style');
    if (!text) return '';
    const tag = el.localName;
    const asleep = tag === 'p' && !!el.closest('li, blockquote');
    return declarationsOf(text)
      .filter(([prop, value]) => value && value.length <= 300 && !UNSAFE_VALUE.test(value) && (propAllowed(prop, tag) || (prop === 'padding-right' && tag === 'p' && TextDirection.isRtl(el))) && !(skip && skip.has(prop)) && !(asleep && (INDENT_PROPS.has(prop) || prop === 'padding-right')))
      .map(([prop, value]) => prop + ': ' + (prop === 'font-family' ? fontStack(value) : value)).join('; ');
  }

  // --- Le document de sortie ------------------------------------------------------------------------------------------------------------------------
  // Un document inerte (HtmlSanitize.parseInert) : aucune image ne charge pendant la lecture, ce que ferait un <div> de la page (js/external-images.js). Les suggestions du suivi des
  // modifications encore en attente y sont acceptées (le texte supprimé n'y est plus) : le HTML d'une ligne les a déjà vues acceptées (ReaderMode.preview).
  function rootOf(html) {
    const root = HtmlSanitize.parseInert(html || '');
    // Le fond d'une diapositive (js/slide-props.js:forOutput) est une couleur de page : un fichier qui coule comme une page web n'en garde pas même les boîtes vides.
    root.querySelectorAll('[data-ff-bg]').forEach(el => el.remove());
    // Une ligne (js/free-frame.js : `freeLine`) n'est que son dessin, sans texte : même règle, ses boîtes vides ne restent pas non plus.
    root.querySelectorAll('.pp-free-frame[data-ff-shape="line"]').forEach(el => el.remove());
    // Si la vue échoue, le document reste tel qu'il est écrit (suggestions visibles) plutôt que perdu : même repli que ReaderMode.
    try { TrackChanges.acceptedView(root, { tint: false }); } catch (e) { console.error('[html-export] vue « comme acceptée » impossible, les suggestions restent affichées', e); }
    return root;
  }

  function make(ctx, tag, className) {
    const el = ctx.doc.createElement(tag);
    if (className) el.className = className;
    return el;
  }
  const text = (ctx, value) => ctx.doc.createTextNode(value);
  function setStyle(el, style) { if (style) el.setAttribute('style', style); }
  // Le sens d'écriture de droite à gauche (js/text-direction.js) d'un paragraphe, d'un titre ou d'une liste : `dir="rtl"`, que tout navigateur lit ; le retrait depuis la droite est un `padding-right` (keptStyle).
  function directionInto(el, out) { if (TextDirection.isRtl(el)) out.setAttribute('dir', 'rtl'); }

  // --- Les images, lues avant l'écriture (un fichier se lit en asynchrone, l'écriture ne l'est pas) ---------------------------------------------------
  // Une image qui n'est pas du texte : « derrière le texte » (un fond) ou répétée sur toutes les pages (un papier à en-tête). Même règle que le Markdown.
  const isOffText = img => img.getAttribute('data-layer') === 'behind' || PageLayer.isRepeatedEl(img);
  // Une adresse web reste une adresse. Une pièce jointe de Grist (son adresse porte un jeton qui s'éteint), une image « blob: » (graphique, code QR) et une adresse relative n'ont pas
  // d'adresse durable : leur fichier part dans le texte, en data URI. Une image qu'on ne peut pas lire n'est pas écrite, et le dit (ExportCommon.noteUnreadImage).
  async function readImages(roots, ctx) {
    const cache = new Map();
    const images = [];
    roots.forEach(root => root.querySelectorAll('img').forEach(img => images.push(img)));
    for (const img of images) {
      if (img.hasAttribute('data-pdf-skip') || isOffText(img)) { ctx.images.set(img, { skip: true }); continue; }
      const src = (img.getAttribute('src') || '').trim();
      if (!src) { ExportCommon.noteImageWithoutSource(img); ctx.images.set(img, { skip: true }); continue; }
      const isAttachment = img.hasAttribute('data-attachment-id') || img.dataset.source === 'attachment' || /\/attachments\/\d+\/download/.test(src);
      if (/^data:image\//i.test(src) || (/^https?:\/\//i.test(src) && !isAttachment)) { ctx.images.set(img, { src }); continue; }
      if (!cache.has(src)) cache.set(src, ImageIo.fetchBlob(src).then(blob => ImageIo.toDataUri(blob)).catch(() => null));
      const data = await cache.get(src);
      if (data) ctx.images.set(img, { src: data });
      else { ExportCommon.noteUnreadImage(img); ctx.images.set(img, { skip: true }); }
    }
  }

  // Un jeton court, le même pour un même document : il entre dans les cibles des liens (titres du sommaire, notes de bas de page), pour que deux contenus collés dans une même page ne
  // se renvoient pas l'un à l'autre (deux « #pp-fn-1 » iraient au premier).
  function tokenOf(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return hash.toString(36);
  }
  const targetId = (ctx, kind, n) => PREFIX + kind + '-' + ctx.token + '-' + n;

  // --- Les titres : leur marqueur, leur cible, le sommaire ----------------------------------------------------------------------------------------
  // Les titres du corps (les enfants directs de la racine, comme le PDF, le Word et le Markdown), leur marqueur « 1) » et leur cible. Une cible n'est posée que si le document a un
  // sommaire.
  function headingsOf(root, ctx, withIds) {
    const config = root.querySelector(':scope > .heading-numbering-config');
    const style = (config && config.dataset.style) || 'none';
    const elements = Array.from(root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
    const markers = HeadingNumbering.markersFor(elements, style);
    const info = new Map();
    const entries = [];
    elements.forEach((el, i) => {
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      const id = withIds ? targetId(ctx, 'h', entries.length + 1) : '';
      info.set(el, { marker: markers[i], id });
      entries.push({ level: parseInt(el.tagName.slice(1), 10), text: (markers[i] + label).trim(), id, label });
    });
    return { info, entries };
  }
  // --- Les signets (js/anchors.js) : la cible d'un paragraphe ou d'un titre qui en porte un, et les liens qui y mènent ----------------------------------------------------------
  // Dans le fichier complet, la cible est l'adresse du signet (`page.html#conditions-generales` : un autre site peut la citer, et elle ne change pas d'un export à l'autre) ; dans le
  // contenu à coller elle porte le jeton du document, comme celle des titres et des notes. Un nom qui commence par « pp- » prend le préfixe : il ne peut pas prendre une adresse que
  // l'export écrit lui-même.
  function anchorTarget(ctx, id) {
    if (ctx.fragment) return targetId(ctx, 'a', id);
    return id.indexOf(PREFIX) === 0 ? PREFIX + 'a-' + id : id;
  }
  // Pose la cible du signet que porte `el` sur le bloc écrit `out` : son `id` quand il n'en a pas, sinon (un titre que le sommaire cite en a déjà un) un repère vide au début.
  function anchorInto(el, out, ctx) {
    const id = el.getAttribute('data-anchor');
    if (!id || !ctx.anchors || ctx.anchors.get(id) !== el) return;
    const target = anchorTarget(ctx, id);
    if (!out.hasAttribute('id')) { out.setAttribute('id', target); return; }
    const mark = make(ctx, 'span');
    mark.setAttribute('id', target);
    out.insertBefore(mark, out.firstChild);
  }
  // Le bloc d'adresse d'une diapositive (SlideProps.forOutput, option `anchors`) : un bloc vide et caché, sans hauteur, qui porte la cible du signet au début de la diapositive.
  function slideAnchorInto(el, parent, ctx) {
    const id = el.getAttribute('data-anchor');
    if (!id || !ctx.anchors || ctx.anchors.get(id) !== el) return;
    const mark = make(ctx, 'div');
    mark.setAttribute('id', anchorTarget(ctx, id));
    mark.setAttribute('aria-hidden', 'true');
    parent.appendChild(mark);
  }
  // Un lien dont la cible est écrite avec le texte reste un lien ; une cible qu'une ligne vide de fin ne laisse pas écrire (dropTrailingBlankLines) le laisse sans adresse : le texte
  // seul, plutôt qu'un lien mort. `written` : le document écrit.
  function dropDeadAnchorLinks(ctx, written) {
    ctx.anchorLinks.forEach(({ link, target }) => {
      if (!link.parentNode || written.querySelector('[id="' + target + '"]')) return;
      link.replaceWith(...Array.from(link.childNodes));
    });
  }

  // Le sommaire : une liste de liens vers les titres, le retrait suit la profondeur réelle (un titre 1 puis un titre 3 n'est qu'un cran plus loin).
  function tocInto(parent, ctx) {
    if (!ctx.toc) return;
    ctx.uses.add('toc');
    const nav = make(ctx, 'nav', PREFIX + 'toc');
    nav.setAttribute('aria-label', I18n.t('pdf.tocTitle'));
    const title = make(ctx, 'p', PREFIX + 'toc-title');
    title.textContent = I18n.t('pdf.tocTitle');
    nav.appendChild(title);
    if (!ctx.toc.length) {
      const empty = make(ctx, 'p', PREFIX + 'toc-empty');
      empty.textContent = I18n.t('pdf.tocEmpty');
      nav.appendChild(empty);
    } else {
      const root = make(ctx, 'ul');
      const lists = [root];
      const stack = [];
      let lastItem = null;
      ctx.toc.forEach(entry => {
        while (stack.length && stack[stack.length - 1] >= entry.level) stack.pop();
        const depth = stack.length;
        stack.push(entry.level);
        while (lists.length > depth + 1) lists.pop();
        if (lists.length < depth + 1) { const sub = make(ctx, 'ul'); lastItem.appendChild(sub); lists.push(sub); }
        const item = make(ctx, 'li');
        const link = make(ctx, 'a');
        link.setAttribute('href', '#' + entry.id);
        link.textContent = entry.text;
        item.appendChild(link);
        lists[depth].appendChild(item);
        lastItem = item;
      });
      nav.appendChild(root);
    }
    parent.appendChild(nav);
  }

  // --- Les notes de bas de page ---------------------------------------------------------------------------------------------------------------------
  function footnoteRefInto(el, parent, ctx) {
    ctx.uses.add('footnotes');
    ctx.footnotes.push(el.getAttribute('data-note-text') || '');
    const n = ctx.footnotes.length;
    const sup = make(ctx, 'sup', PREFIX + 'fnref');
    const link = make(ctx, 'a');
    link.setAttribute('id', targetId(ctx, 'fnref', n));
    link.setAttribute('href', '#' + targetId(ctx, 'fn', n));
    link.textContent = String(n);
    sup.appendChild(link);
    parent.appendChild(sup);
  }
  function footnotesList(ctx) {
    if (!ctx.footnotes.length) return null;
    const list = make(ctx, 'ol', PREFIX + 'footnotes');
    ctx.footnotes.forEach((note, i) => {
      const item = make(ctx, 'li');
      item.setAttribute('id', targetId(ctx, 'fn', i + 1));
      String(note).split(/\r?\n/).forEach((line, k) => {
        if (k) item.appendChild(make(ctx, 'br'));
        item.appendChild(text(ctx, line.trim()));
      });
      item.appendChild(text(ctx, ' '));
      const back = make(ctx, 'a');
      back.setAttribute('href', '#' + targetId(ctx, 'fnref', i + 1));
      back.setAttribute('aria-label', I18n.t('html.footnoteBack'));
      back.textContent = '↩';
      item.appendChild(back);
      list.appendChild(item);
    });
    return list;
  }

  // --- Les éléments --------------------------------------------------------------------------------------------------------------------------------
  // Les enfants de `src` écrits dans `parent`. Un blanc seul entre deux blocs n'est pas écrit : il compterait (`break-spaces`).
  function childrenInto(src, parent, ctx) {
    const hasBlock = Array.from(src.childNodes).some(isBlockEl);
    src.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!child.nodeValue || (hasBlock && !child.nodeValue.trim())) return;
        parent.appendChild(text(ctx, child.nodeValue));
        return;
      }
      if (child.nodeType === Node.ELEMENT_NODE) nodeInto(child, parent, ctx);
    });
  }

  function isAtom(el) { return ATOM_CLASSES.some(name => el.classList.contains(name)); }

  // Le numéro de page n'a pas de sens dans un texte qui coule : la pastille s'en va avec le mot qui l'annonce (« Page », « p. », « n° »), le lien entre deux pastilles (« / »,
  // « sur », « of ») et le tiret ou la parenthèse que cela laisse seuls ; une ligne qui ne disait que cela disparaît. Retourne la ligne telle quelle quand elle n'a pas de pastille,
  // sa copie nettoyée sinon, null quand il n'en reste rien.
  const PAGE_LABEL = /(?:^|[\s\u00a0([])(?:pages?|p\.|n\u00b0|no\.?|seite)[\s\u00a0.:]*$/i;
  const PAGE_LINK = /^[\s\u00a0]*(?:\/|\||sur|of|von|de)?[\s\u00a0]*$/i;
  const SEPARATORS = '\\s\\u00a0\\-\\u2013\\u2014|\\u00b7,;:/';
  const LEADING_SEPARATORS = new RegExp('^[' + SEPARATORS + ']+');
  const TRAILING_SEPARATORS = new RegExp('[' + SEPARATORS + ']+$');
  function withoutPageNumbers(el) {
    if (!el.querySelector('.page-number-badge')) return el;
    const clone = el.cloneNode(true);
    const doc = clone.ownerDocument;
    const items = [];
    // Les pastilles et les textes de la ligne, dans l'ordre ; le « # » écrit dans une pastille n'est pas du texte de la ligne.
    const walker = doc.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        if (node.nodeType === Node.TEXT_NODE) return node.parentElement && node.parentElement.closest('.page-number-badge') ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
        return node.classList.contains('page-number-badge') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) items.push(node);
    const isBadge = node => !!node && node.nodeType === Node.ELEMENT_NODE;
    let seenText = false;
    items.forEach((node, i) => {
      if (isBadge(node)) return;
      const beforeBadge = isBadge(items[i + 1]);
      const afterBadge = isBadge(items[i - 1]);
      let value = node.nodeValue;
      if (beforeBadge) value = value.replace(PAGE_LABEL, '');
      if (beforeBadge && afterBadge && PAGE_LINK.test(value)) value = '';
      if (beforeBadge) value = value.replace(TRAILING_SEPARATORS, '');
      if (afterBadge && !seenText) value = value.replace(LEADING_SEPARATORS, '');
      node.nodeValue = value;
      if (value.trim()) seenText = true;
    });
    clone.querySelectorAll('.page-number-badge').forEach(badge => badge.remove());
    const left = doc.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let anyText = false;
    for (let node = left.nextNode(); node; node = left.nextNode()) {
      node.nodeValue = node.nodeValue.replace(/\(\s*\)|\[\s*\]/g, '');
      if (node.nodeValue.trim()) anyText = true;
    }
    return anyText || clone.querySelector('img, table, hr') ? clone : null;
  }

  function textBlockInto(el, parent, ctx, tag) {
    const source = withoutPageNumbers(el);
    if (!source) return;
    const out = make(ctx, tag);
    setStyle(out, keptStyle(el));
    directionInto(el, out);
    if (el.hasAttribute('data-caption') && el.getAttribute('data-caption') !== 'false') { out.className = PREFIX + 'caption'; ctx.uses.add('caption'); }
    anchorInto(el, out, ctx);
    childrenInto(source, out, ctx);
    if (!out.childNodes.length || (!out.querySelector('*') && !(out.textContent || '').trim())) { out.textContent = ''; out.appendChild(make(ctx, 'br')); }
    parent.appendChild(out);
  }

  function headingInto(el, parent, ctx) {
    const source = withoutPageNumbers(el);
    if (!source || !(source.textContent || '').trim()) return;
    const out = make(ctx, el.localName);
    setStyle(out, keptStyle(el));
    directionInto(el, out);
    const info = ctx.headings && ctx.headings.get(el);
    if (info && info.id) out.setAttribute('id', info.id);
    anchorInto(el, out, ctx);
    if (info && info.marker) {
      const marker = make(ctx, 'span', PREFIX + 'num');
      marker.textContent = info.marker;
      out.appendChild(marker);
    }
    childrenInto(source, out, ctx);
    parent.appendChild(out);
  }

  const LIST_STYLES = { bullet: { circle: 'circle', square: 'square' }, number: { alpha: 'lower-alpha', roman: 'lower-roman' } };
  function listInto(el, parent, ctx) {
    const ordered = el.localName === 'ol';
    const task = el.getAttribute('data-type') === 'taskList';
    const out = make(ctx, ordered ? 'ol' : 'ul');
    directionInto(el, out);
    if (task) {
      ctx.uses.add('tasks');
      ctx.uses.add('checkbox');
      const variant = el.getAttribute('data-tasklist-style');
      out.className = PREFIX + 'tasks' + (variant === 'classic' ? ' ' + PREFIX + 'tasks-classic' : variant === 'accentPlain' ? ' ' + PREFIX + 'tasks-plain' : '');
      out.setAttribute('style', 'list-style: none; padding-left: 0');
    } else {
      const named = (ordered ? LIST_STYLES.number : LIST_STYLES.bullet)[el.getAttribute(ordered ? 'data-number-style' : 'data-bullet-style')];
      // Le signe choisi dans « Puce… » (js/bullet-format.js) : une chaîne CSS, qui l'emporte sur le style de la liste.
      const chosen = ordered ? null : BulletFormat.markerOf(el);
      if (chosen) out.setAttribute('style', "list-style-type: '" + chosen + "'");
      else if (named) out.setAttribute('style', 'list-style-type: ' + named);
    }
    if (ordered && el.getAttribute('start') && /^-?\d+$/.test(el.getAttribute('start')) && el.getAttribute('start') !== '1') out.setAttribute('start', el.getAttribute('start'));
    Array.from(el.children).forEach(child => {
      if (child.localName === 'li') (task ? taskItemInto : listItemInto)(child, out, ctx);
      else if (child.localName === 'ul' || child.localName === 'ol') listInto(child, out, ctx);
    });
    parent.appendChild(out);
  }
  function listItemInto(el, parent, ctx) {
    const out = make(ctx, 'li');
    // Sa puce a la couleur et la taille du début de son texte : les deux variables que lit `li::marker` (js/list-markers.js).
    const marker = ListMarkers.styleOfElement(el);
    setStyle(out, [keptStyle(el), marker && ListMarkers.cssText(marker)].filter(Boolean).join('; '));
    childrenInto(el, out, ctx);
    parent.appendChild(out);
  }
  function checkboxSpan(ctx, checked, style, label, color) {
    ctx.uses.add('checkbox');
    const box = make(ctx, 'span', PREFIX + 'checkbox' + (checked ? ' ' + PREFIX + 'checked' : '') + (style === 'classic' ? ' ' + PREFIX + 'classic' : ''));
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', label || I18n.t(checked ? 'varFmt.boolChecked' : 'varFmt.boolUnchecked'));
    if (color && color.length <= 80 && !UNSAFE_VALUE.test(color)) box.setAttribute('style', 'color: ' + color);
    box.textContent = checked ? '☑' : '☐';
    return box;
  }
  // Un item de liste à cases : la case, puis le contenu (TipTap l'écrit `<li><label><input><span></span></label><div>…</div></li>`).
  function taskItemInto(el, parent, ctx) {
    const checked = el.getAttribute('data-checked') === 'true';
    const out = make(ctx, 'li', PREFIX + 'task' + (checked ? ' ' + PREFIX + 'done' : ''));
    out.appendChild(checkboxSpan(ctx, checked, el.parentElement && el.parentElement.getAttribute('data-tasklist-style') === 'classic' ? 'classic' : ''));
    const body = make(ctx, 'div', PREFIX + 'task-body');
    const content = Array.from(el.children).find(child => child.localName === 'div');
    childrenInto(content || el, body, ctx);
    out.appendChild(body);
    parent.appendChild(out);
  }

  function codeBlockInto(el, parent, ctx) {
    const lines = ExportCommon.codeLinesOf(el);
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    const language = (Array.from(el.querySelectorAll('code')).map(code => code.className).join(' ').match(/(?:^|\s)(language-[\w+#.-]+)/) || [])[1] || '';
    const pre = make(ctx, 'pre');
    const code = make(ctx, 'code', language);
    code.textContent = lines.join('\n');
    pre.appendChild(code);
    parent.appendChild(pre);
  }

  // Le tableau : colonnes (largeurs), fusions (seulement au-delà de 1), puis, dans chaque case, ses quatre traits, son retrait, son alignement vertical et son fond tels que
  // l'éditeur les montre. Les traits viennent de ExportCommon.cellBorderSides (le PDF, le Word et l'Excel lisent les mêmes `data-border-*` et `data-grid-lines`) : un trait que
  // deux cases se partagent n'a qu'une valeur, et un quadrillage masqué n'est pas dessiné. Tout est écrit dans la case : un site qui change le style des tableaux ne lui retire rien.
  const LINE_COLOR = '#b8c0c9';
  function borderStyle(sides) {
    if (!sides) return 'border: 1px solid ' + LINE_COLOR;
    return TableBorders.SIDES.map(side => 'border-' + side + ': ' + (sides[side] === TableBorders.NONE ? 'hidden' : '1px solid ' + (sides[side] || LINE_COLOR))).join('; ');
  }
  function tableSectionInto(el, parent, ctx, t) {
    const out = make(ctx, el.localName);
    Array.from(el.children).forEach(row => { if (row.localName === 'tr') rowInto(row, out, ctx, t); });
    parent.appendChild(out);
  }
  function rowInto(el, parent, ctx, t) {
    const out = make(ctx, 'tr');
    // La hauteur réglée d'une ligne de grille (`data-row-height`) est un minimum : une ligne que son texte agrandit grandit.
    const height = ExportCommon.rowHeightPx(el);
    if (height) out.setAttribute('style', 'height: ' + height + 'px');
    ExportCommon.cellsOf(el).forEach(cell => cellInto(cell, out, ctx, t));
    parent.appendChild(out);
  }
  function cellInto(el, parent, ctx, t) {
    const out = make(ctx, el.localName);
    ['colspan', 'rowspan'].forEach(name => { if (ExportCommon.spanOf(el, name) > 1) out.setAttribute(name, String(ExportCommon.spanOf(el, name))); });
    const own = keptStyle(el, new Set(['vertical-align']));
    // `<th>` n'a pas de style propre dans l'éditeur (ni gras ni centrage) : écrit dans la case, un site qui style ses `<th>` ne le change pas.
    const parts = [borderStyle(t.borders && t.borders.get(el)), 'padding: 4px 6px', 'vertical-align: ' + (ExportCommon.cellVerticalAlign(el) || 'top')];
    if (el.localName === 'th') parts.push('font-weight: normal', 'text-align: left');
    if (own) parts.push(own);
    out.setAttribute('style', parts.join('; '));
    childrenInto(el, out, ctx);
    parent.appendChild(out);
  }
  function tableInto(el, parent, ctx) {
    ctx.uses.add('table');
    const t = { borders: ExportCommon.cellBorderSides(el) };
    const wrap = make(ctx, 'div', PREFIX + 'table');
    const table = make(ctx, 'table');
    const own = keptStyle(el);
    // La largeur d'une grille (`width: 300px`) remplace les 100 % des tableaux de document.
    table.setAttribute('style', 'border-collapse: collapse; table-layout: fixed' + (/(^|;)\s*width\s*:/.test(own) ? '' : '; width: 100%') + (own ? '; ' + own : ''));
    let body = null;
    Array.from(el.children).forEach(child => {
      const tag = child.localName;
      if (tag === 'colgroup') {
        const group = make(ctx, 'colgroup');
        Array.from(child.children).forEach(col => {
          if (col.localName !== 'col') return;
          const out = make(ctx, 'col');
          setStyle(out, keptStyle(col));
          group.appendChild(out);
        });
        table.appendChild(group);
      } else if (tag === 'caption') {
        const caption = make(ctx, 'caption');
        childrenInto(child, caption, ctx);
        table.appendChild(caption);
      } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') tableSectionInto(child, table, ctx, t);
      else if (tag === 'tr') {
        // Un <tr> sans section (HTML venu d'ailleurs) : les lignes qui se suivent vont dans un même <tbody>.
        if (!body || body.parentNode !== table) { body = make(ctx, 'tbody'); table.appendChild(body); }
        rowInto(child, body, ctx, t);
      }
    });
    wrap.appendChild(table);
    parent.appendChild(wrap);
  }

  function imageInto(el, parent, ctx) {
    const info = ctx.images.get(el);
    if (!info || info.skip) return;
    ctx.uses.add('image');
    const out = make(ctx, 'img');
    out.setAttribute('src', info.src);
    out.setAttribute('alt', el.getAttribute('alt') || '');
    if (el.getAttribute('title')) out.setAttribute('title', el.getAttribute('title'));
    const align = el.getAttribute('data-align');
    if (align === 'left' || align === 'right' || align === 'center') out.className = PREFIX + align;
    else if (el.getAttribute('data-wrap') === 'block') out.className = PREFIX + 'block';
    // La largeur seule : la hauteur d'une image suit sa largeur, et sa position est celle du texte.
    setStyle(out, keptStyle(el, new Set(['height', 'min-height', 'max-height'])));
    parent.appendChild(out);
  }

  function calloutInto(el, parent, ctx) {
    ctx.uses.add('callout');
    const out = make(ctx, 'div', PREFIX + 'callout');
    const color = el.getAttribute('data-color');
    const icon = el.getAttribute('data-icon');
    // Les attributs de couleur et d'icône portent la palette (Callout.styleText) : seules les clés que la palette connaît sont écrites.
    if (Callout.COLOR_ORDER.indexOf(color) !== -1) { out.setAttribute('data-color', color); ctx.callouts.colors.add(color); }
    if (Callout.ICON_ORDER.indexOf(icon) !== -1) { out.setAttribute('data-icon', icon); ctx.callouts.icons.add(icon); }
    out.setAttribute('role', 'note');
    childrenInto(el, out, ctx);
    parent.appendChild(out);
  }

  function columnsInto(el, parent, ctx) {
    ctx.uses.add('columns');
    const out = make(ctx, 'div', PREFIX + 'columns');
    const left = el.style ? (el.style.getPropertyValue('--layout-left') || '').trim() : '';
    if (/^[\d.]+(%|mm|px|cm|in|pt)$/.test(left)) out.setAttribute('style', '--pp-left: ' + left);
    Array.from(el.children).forEach(column => {
      if (!column.classList.contains('two-columns-column')) return;
      const col = make(ctx, 'div', PREFIX + 'column');
      childrenInto(column, col, ctx);
      out.appendChild(col);
    });
    parent.appendChild(out);
  }

  function linkInto(el, parent, ctx) {
    const anchorId = HtmlSanitize.internalAnchorId(el.getAttribute('href'));
    if (anchorId) { anchorLinkInto(el, anchorId, parent, ctx); return; }
    const href = HtmlSanitize.safeLinkHref(el.getAttribute('href'));
    if (!href) { childrenInto(el, parent, ctx); return; }
    const out = make(ctx, 'a');
    out.setAttribute('href', href);
    if (el.getAttribute('title')) out.setAttribute('title', el.getAttribute('title'));
    if (el.getAttribute('target') === '_blank') {
      out.setAttribute('target', '_blank');
      out.setAttribute('rel', 'noopener noreferrer' + (/\bnofollow\b/.test(el.getAttribute('rel') || '') ? ' nofollow' : ''));
    }
    setStyle(out, keptStyle(el));
    childrenInto(el, out, ctx);
    parent.appendChild(out);
  }

  // Un lien vers un titre ou un signet du document : une adresse `#cible`, qui reste dans la page (jamais de `target="_blank"`). Sans signet de cet identifiant, le texte seul.
  function anchorLinkInto(el, anchorId, parent, ctx) {
    if (!ctx.anchors || !ctx.anchors.has(anchorId)) { childrenInto(el, parent, ctx); return; }
    const target = anchorTarget(ctx, anchorId);
    const out = make(ctx, 'a');
    out.setAttribute('href', '#' + target);
    if (el.getAttribute('title')) out.setAttribute('title', el.getAttribute('title'));
    setStyle(out, keptStyle(el));
    childrenInto(el, out, ctx);
    ctx.anchorLinks.push({ link: out, target });
    parent.appendChild(out);
  }

  // Un élément qui n'a pas de traitement à lui : sa balise si la liste blanche la garde (avec son style gardé), son contenu seul sinon. Un <span> sans style disparaît.
  function genericInto(el, parent, ctx) {
    const tag = TAG_ALIAS[el.localName] || el.localName;
    if (el.localName === 'center') {
      const out = make(ctx, 'div');
      out.setAttribute('style', 'text-align: center');
      childrenInto(el, out, ctx);
      parent.appendChild(out);
      return;
    }
    if (!KEPT_TAGS.has(tag)) { childrenInto(el, parent, ctx); return; }
    const style = keptStyle(el);
    if (tag === 'span' && !style) { childrenInto(el, parent, ctx); return; }
    const out = make(ctx, tag);
    setStyle(out, style);
    // Le texte alternatif d'un cadre de diapositive (js/free-frame.js : `data-ff-alt`) reste son nom pour un lecteur d'écran.
    if (el.classList.contains('pp-free-frame') && el.getAttribute('data-ff-alt')) { out.setAttribute('role', 'group'); out.setAttribute('aria-label', el.getAttribute('data-ff-alt')); }
    if ((tag === 'abbr' || tag === 'dfn' || tag === 'q' || tag === 'cite' || tag === 'span') && el.getAttribute('title')) out.setAttribute('title', el.getAttribute('title'));
    if (tag === 'time' && el.getAttribute('datetime')) out.setAttribute('datetime', el.getAttribute('datetime'));
    childrenInto(el, out, ctx);
    // Un balisage en ligne qui n'a plus rien dedans (sa pastille ou son image n'est pas écrite) ne laisse pas de balise vide ; un bloc vide, lui, garde sa place.
    if (!out.firstChild && !isBlockEl(el)) return;
    parent.appendChild(out);
  }

  function nodeInto(el, parent, ctx) {
    const tag = el.localName;
    const cl = el.classList;
    if (el.hasAttribute('data-pdf-skip') || SKIPPED_TAGS.has(tag)) return;
    if (cl.contains('heading-numbering-config') || cl.contains('page-break-marker') || cl.contains('page-number-badge')) return;
    if (cl.contains('toc-marker')) { tocInto(parent, ctx); return; }
    if (cl.contains('pp-slide-anchor')) { slideAnchorInto(el, parent, ctx); return; }
    if (cl.contains('footnote-ref-marker')) { footnoteRefInto(el, parent, ctx); return; }
    // Une tabulation (js/tab-indent.js) : son caractère, gardé tel quel dans son élément (`white-space: pre-wrap`), au cran de `tab-size`.
    if (TabIndent.isTab(el)) {
      const tab = make(ctx, 'span', 'pp-tab');
      tab.setAttribute('style', 'white-space: pre-wrap');
      tab.textContent = TabIndent.TAB;
      parent.appendChild(tab);
      return;
    }
    if (cl.contains('resolved-checkbox')) {
      parent.appendChild(checkboxSpan(ctx, el.getAttribute('data-checked') === 'true', el.getAttribute('data-checkbox-style'), el.getAttribute('aria-label'), el.style && el.style.color));
      return;
    }
    // Un élément de fusion resté dans le HTML (un modèle non résolu) n'est que son libellé.
    if (isAtom(el)) { parent.appendChild(text(ctx, el.textContent || '')); return; }
    if (cl.contains('callout')) { calloutInto(el, parent, ctx); return; }
    if (cl.contains('two-columns-zone')) { columnsInto(el, parent, ctx); return; }
    if (cl.contains('two-columns-column')) { childrenInto(el, parent, ctx); return; }
    switch (tag) {
      case 'br':
        if (!cl.contains('ProseMirror-trailingBreak')) parent.appendChild(make(ctx, 'br'));
        return;
      case 'hr': parent.appendChild(make(ctx, 'hr')); return;
      case 'img': if (!cl.contains('ProseMirror-separator')) imageInto(el, parent, ctx); return;
      case 'a': linkInto(el, parent, ctx); return;
      case 'p': textBlockInto(el, parent, ctx, 'p'); return;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': headingInto(el, parent, ctx); return;
      case 'ul': case 'ol': listInto(el, parent, ctx); return;
      case 'li': listItemInto(el, parent, ctx); return;
      case 'pre': codeBlockInto(el, parent, ctx); return;
      case 'table': tableInto(el, parent, ctx); return;
      case 'code': case 'kbd': case 'samp': case 'tt': {
        // Un code en ligne : son texte, sans les marques de couleur du bloc ; ses marques de lien, de gras... l'entourent déjà.
        if (!el.textContent) return;
        const code = make(ctx, 'code');
        code.textContent = el.textContent;
        parent.appendChild(code);
        return;
      }
      default: genericInto(el, parent, ctx);
    }
  }

  // --- Les zones d'en-tête et de pied de page ------------------------------------------------------------------------------------------------------
  // Le HTML de la zone écrite une fois : le pied par défaut (sinon celui de la première page), l'en-tête de la première page quand « première page différente » est réglé et rempli
  // (sinon l'en-tête par défaut). '' quand rien n'est à écrire.
  function zoneHtml(headerFooterData, kind) {
    if (!headerFooterData || !headerFooterData.enabled) return '';
    const part = headerFooterData[kind];
    if (!part) return '';
    const first = headerFooterData.differentFirstPage && PageLayout.hasZoneContent(part.first) ? part.first : '';
    const main = PageLayout.hasZoneContent(part.default) ? part.default : '';
    return (kind === 'header' ? first || main : main || first) || '';
  }
  const hasContent = el => !!(el.textContent || '').trim() || !!el.querySelector('img, table, hr');
  // Une ligne vide : un paragraphe sans texte ni rien d'autre qu'un retour à la ligne. Celles de la fin du document (l'éditeur en laisse une derrière son dernier bloc) ne sont pas écrites : la
  // page ne finirait pas sur du blanc ; ReaderMode.trimTrailingBlankBlocks garde toujours la première, pour la page qu'elle ne vide pas.
  const isBlankLine = el => el.localName === 'p' && !(el.textContent || '').trim() && !el.querySelector(':scope > :not(br)');
  function dropTrailingBlankLines(container) {
    while (container.lastElementChild && isBlankLine(container.lastElementChild)) container.removeChild(container.lastElementChild);
  }

  // --- Le document ---------------------------------------------------------------------------------------------------------------------------------
  // Les nœuds en ligne qui se suivent à la racine font un paragraphe ; un bloc reste un bloc.
  function topLevelHtml(container) {
    const pieces = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const wrapper = container.ownerDocument.createElement('p');
      run.forEach(node => wrapper.appendChild(node.cloneNode(true)));
      if ((wrapper.textContent || '').trim() || wrapper.querySelector('img, br')) pieces.push(wrapper.outerHTML);
      run = [];
    };
    Array.from(container.childNodes).forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.localName)) { flush(); pieces.push(node.outerHTML); } else run.push(node);
    });
    flush();
    return pieces.join('\n');
  }
  const wrapTag = (tag, className, inner) => '<' + tag + ' class="' + className + '">' + (inner ? '\n' + inner + '\n' : '') + '</' + tag + '>';
  const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const escapeComment = value => String(value).replace(/--+/g, '-');

  // Le fichier d'un document déjà résolu (le HTML de ReaderMode.preview) et de ses zones d'en-tête et de pied (déjà résolues aussi, ExportCommon.resolveRecord).
  // `options.fragment` : le contenu à coller (sans page, sans typographie) ; `options.title` : le titre de la page si le document n'a pas de titre à lui.
  async function htmlToDocument(resolvedHtml, headerFooterData, options) {
    const opts = options || {};
    const body = rootOf(resolvedHtml);
    // Ni ligne vide ni saut de page orphelin en fin de document.
    ReaderMode.trimTrailingBlankBlocks(body);
    const zoneRoots = { header: rootOf(zoneHtml(headerFooterData, 'header')), footer: rootOf(zoneHtml(headerFooterData, 'footer')) };
    const ctx = {
      doc: body.ownerDocument, images: new Map(), footnotes: [], uses: new Set(), callouts: { colors: new Set(), icons: new Set() },
      headings: null, toc: null, token: tokenOf(String(resolvedHtml || '')),
      // Les signets du corps (adresse -> bloc) et les liens qui y mènent (dropDeadAnchorLinks).
      fragment: !!opts.fragment, anchors: Anchors.elementsOf(body), anchorLinks: [],
    };
    await readImages([body, zoneRoots.header, zoneRoots.footer], ctx);
    const headings = headingsOf(body, ctx, !!body.querySelector('.toc-marker'));
    const written = ctx.doc.createElement('div');
    const part = (root, className) => {
      const zone = make(ctx, 'div', PREFIX + 'zone ' + PREFIX + className);
      ctx.headings = null;
      ctx.toc = null;
      childrenInto(root, zone, ctx);
      return hasContent(zone) ? zone : null;
    };
    const header = part(zoneRoots.header, 'header');
    if (header) { ctx.uses.add('zone'); written.appendChild(header); }
    ctx.headings = headings.info;
    ctx.toc = headings.entries;
    const content = make(ctx, 'div');
    childrenInto(body, content, ctx);
    dropTrailingBlankLines(content);
    while (content.firstChild) written.appendChild(content.firstChild);
    // Le pied est écrit avant la liste des notes : une note qu'il cite se range avec les autres. La liste ferme le texte, le pied vient après.
    const footer = part(zoneRoots.footer, 'footer');
    const notes = footnotesList(ctx);
    if (notes) written.appendChild(notes);
    if (footer) { ctx.uses.add('zone'); written.appendChild(footer); }
    dropDeadAnchorLinks(ctx, written);
    const inner = topLevelHtml(written);
    const css = stylesheetFor(ctx, !!opts.fragment);
    const firstHeading = headings.entries[0];
    if (opts.fragment) {
      return '<!-- ' + escapeComment(I18n.t('html.fragmentNote')) + ' -->\n<style>\n' + css + '\n</style>\n' + wrapTag('div', 'pp-doc', inner) + '\n';
    }
    const title = (firstHeading && firstHeading.label) || opts.title || I18n.t('html.defaultTitle');
    return '<!doctype html>\n<html lang="' + escapeHtml(I18n.getLang() === 'en' ? 'en' : 'fr') + '">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + escapeHtml(title) + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + wrapTag('div', 'pp-doc', inner) + '\n</body>\n</html>\n';
  }

  async function getHtmlBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options) {
    // Le fichier garde l'adresse d'une image d'un autre site, mais le navigateur la télécharge pendant la préparation du document (ReaderMode.preview écrit son HTML dans un
    // nœud de la page) : la fenêtre liste ces sites et peut tout arrêter (js/external-images.js), comme pour le PDF, le Word, l'Excel et le Markdown. Un seul passage pour l'export
    // d'une ligne comme pour chaque ligne d'un lot (exportCurrentRecord passe par ici).
    await ExternalImages.confirmExport(htmlContent, headerFooterData);
    const { resolvedHtml, filename, resolvedHeaderFooterData } = await ExportCommon.resolveRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData);
    const source = await htmlToDocument(resolvedHtml, resolvedHeaderFooterData, Object.assign({ title: filename }, options));
    return { blob: new Blob([source], { type: 'text/html;charset=utf-8' }), filename };
  }
  // Le fichier du contenu à coller porte « -fragment » : les deux fichiers d'une même ligne ne s'écrasent pas.
  const fileExtension = options => (options && options.fragment ? '-fragment.html' : '.html');
  async function exportCurrentRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options) {
    if (!record) { alert(I18n.t('alert.noRecordForExportHtml')); return; }
    const { blob, filename } = await getHtmlBlobForRecord(htmlContent, tableId, record, filenameTemplate, headerFooterData, options);
    ExportCommon.downloadBlob(blob, (filename || 'publipostage') + fileExtension(options));
  }

  return { exportCurrentRecord, getHtmlBlobForRecord, htmlToDocument, fileExtension };
})();
