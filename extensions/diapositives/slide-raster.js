// L'image d'une diapositive (demande du 12/11, « Insérer depuis » : la diapositive arrive dans le document en UN bloc, comme une image qu'on sélectionne, redimensionne et supprime d'un geste,
// avec son décor - le bandeau, le logo, le numéro - là où la présentation le met). Le navigateur ne sait pas dessiner une page HTML dans une image : on la lui donne dans un SVG (un
// `foreignObject` qui porte la page), qu'il sait peindre, puis on le recopie dans un canevas pour en faire un PNG.
//  - `snapshot(thumb, w, h)` : `thumb` est la miniature d'une diapositive déjà dessinée, à l'échelle 1 (SlideImport.paint, à la taille de la page), AFFICHÉE (on lit sa mise en page). Rend
//    { src, width, height, text, words } : `src` le PNG (data:) - le JPEG d'une diapositive lourde (une photo en fond), `text` le texte de la diapositive (la recherche Ctrl+F le lit), `words` ses mots avec leur place en millièmes de la page
//    (`[x, y, largeur, hauteur, mot]`), que la couche de texte invisible posera sur l'image (sélection, copie, PDF cherchable).
//  - Le SVG ne reprend AUCUNE feuille de style : l'app est dans le cadre isolé de GFS (sans `allow-same-origin`), où les règles des feuilles ne se lisent pas. Chaque élément porte donc son style
//    CALCULÉ, en ligne (`inline`), précédé de `all: unset` (aucun style du navigateur ne s'y ajoute) : seul ce qui diffère de la valeur initiale (ou de celle du parent, pour une propriété héritée) est
//    écrit. Les calques `::before` et `::after` (le fond et le trait d'une forme, le fond d'une diapositive) deviennent de vrais éléments, au même rang d'empilement.
//  - Les polices : celles du système se retrouvent seules ; Roboto (en data: dans css/roboto-fonts.css) est relue de son adresse (GitHub Pages l'envoie à tout site) et recopiée dans le SVG si la
//    diapositive l'emploie. Illisible (hors ligne, copie qui ne l'envoie pas), la police retombe sur une police sans empattement du système : rien ne casse.
//  - Rien ne sort du navigateur : le SVG est un data: sans script, peint comme image (aucune adresse n'y est ouverte ; ExternalImages a déjà bloqué celles des images).
const SlideRaster = (function () {
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const SCALE = 1.5;                  // la définition de l'image : une page de 1280 px est rendue à 1920 px, nette à l'écran, au PDF et au Word
  const PER_MILLE = 1000;
  const HEAVY_BYTES = 1.5 * 1024 * 1024;   // au-delà, le PNG d'une diapositive est essayé en JPEG
  const JPEG_QUALITY = 0.92;
  const JPEG_GAIN = 0.6;                  // le JPEG ne remplace le PNG que s'il pèse moins de 60 % de son poids
  const FONT_SHEET = /roboto-fonts\.css/;

  // Les propriétés qui se transmettent au contenu : elles ne s'écrivent que si elles diffèrent de celles du parent (sinon `all: unset` les hérite). Une propriété héritée absente de cette liste est
  // simplement écrite sur chaque élément qui la change de sa valeur initiale : plus long, jamais faux.
  const INHERITED = new Set(('color direction font font-family font-feature-settings font-kerning font-optical-sizing font-size font-size-adjust font-stretch font-style font-variant font-variant-caps '
    + 'font-variant-east-asian font-variant-ligatures font-variant-numeric font-variant-position font-variation-settings font-weight hyphens letter-spacing line-break line-height list-style-image '
    + 'list-style-position list-style-type overflow-wrap tab-size text-align text-align-last text-indent text-justify text-shadow text-transform text-wrap text-underline-offset text-underline-position '
    + 'text-rendering white-space white-space-collapse word-break word-spacing word-wrap writing-mode text-orientation visibility quotes border-collapse border-spacing empty-cells caption-side').split(' '));
  // Ce qui ne se voit pas sur une image, ou que les propriétés d'écriture physiques redisent (les propriétés logiques : `inline-size`, `margin-inline-start`...), ou que le SVG ne peut pas porter.
  const SKIPPED = /^(animation|transition|scroll|overscroll|contain|container|view-timeline|view-transition|anchor|position-|will-change$|cursor$|pointer-events$|user-select$|touch-action$|resize$|caret|content-visibility$|interactivity|app-region|field-sizing|nav-|speak|offset|page|break-|orphans$|widows$|column-rule|text-box|math-|ruby-)|(^|-)(inline|block)(-|$)|^(margin|padding|border|inset|overflow)-(start|end)|^border-(start|end)|^-webkit-(?!text-fill|text-stroke|background-clip|line-clamp|box-orient|box-reflect|mask)/;
  const SIDES = ['top', 'right', 'bottom', 'left'];

  let initialCache = null;
  // Les valeurs initiales de chaque propriété, lues sur un élément « en ligne » (ses mesures restent `auto`) dont tout est remis à zéro.
  function initialValues() {
    if (initialCache) return initialCache;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 10px;';
    const probe = document.createElement('span');
    probe.style.cssText = 'all: initial';
    wrap.appendChild(probe);
    document.body.appendChild(wrap);
    const style = getComputedStyle(probe);
    initialCache = new Map();
    for (let i = 0; i < style.length; i++) initialCache.set(style[i], style.getPropertyValue(style[i]));
    wrap.remove();
    return initialCache;
  }

  // Le style en ligne qui redonne `style` (le style calculé d'un élément ou d'un de ses calques) à un élément dont tout est remis à zéro, sous un parent qui porte déjà `parent`.
  function declarations(style, parent) {
    const initial = initialValues();
    const out = ['all:unset'];
    const none = {};
    SIDES.forEach((side) => {
      none['border-' + side] = /^(none|hidden)$/.test(style.getPropertyValue('border-' + side + '-style'));
    });
    const noLine = style.getPropertyValue('text-decoration-line') === 'none';
    const noOutline = /^(none|hidden)$/.test(style.getPropertyValue('outline-style'));
    const flat = style.getPropertyValue('transform') === 'none';
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (SKIPPED.test(name)) continue;
      const side = /^border-(top|right|bottom|left)-(color|width|style)$/.exec(name);
      if (side && none['border-' + side[1]]) continue;
      if (noLine && /^text-decoration-(?!line$)/.test(name)) continue;
      if (noOutline && /^outline-/.test(name)) continue;
      if (flat && (name === 'transform-origin' || name === 'perspective-origin')) continue;
      const value = style.getPropertyValue(name);
      if (INHERITED.has(name)) { if (value === (parent ? parent.getPropertyValue(name) : initial.get(name))) continue; }
      else if (value === initial.get(name)) continue;
      out.push(name + ':' + value);
    }
    return out.join(';');
  }

  // Le texte d'un calque (`content: "..."`) : la chaîne entre guillemets, sinon rien (un calque de fond a `content: ""`).
  function contentOf(value) {
    const found = /^"((?:[^"\\]|\\.)*)"$/.exec(value);
    return found ? found[1].replace(/\\(.)/g, '$1') : '';
  }

  // La copie de `source` (une miniature affichée) dont chaque élément porte son style calculé, calques compris. `pace` : la pause (celle d'un WorkPacer) à attendre entre deux éléments : une
  // diapositive d'un gros PowerPoint en compte des centaines, et chacun lit des centaines de propriétés ; sans elle la page restait prise d'un bloc (20/11).
  async function inline(source, parentStyle, pace) {
    await pace();
    const copy = source.cloneNode(false);
    if (source.nodeType !== Node.ELEMENT_NODE) return copy;
    const style = getComputedStyle(source);
    copy.removeAttribute('style');
    copy.removeAttribute('class');
    copy.removeAttribute('contenteditable');
    copy.setAttribute('style', declarations(style, parentStyle));
    const layer = (which) => {
      const own = getComputedStyle(source, which);
      if (own.content === 'none' || own.content === 'normal' || own.display === 'none') return null;
      const span = document.createElementNS(XHTML, 'span');
      span.setAttribute('style', declarations(own, style));
      const text = contentOf(own.content);
      if (text) span.textContent = text;
      return span;
    };
    const before = layer('::before');
    if (before) copy.appendChild(before);
    for (const child of Array.from(source.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (/^(script|style|template)$/i.test(child.localName)) continue;
        copy.appendChild(await inline(child, style, pace));
      } else if (child.nodeType === Node.TEXT_NODE) {
        // Un SVG est du XML : un caractère de commande n'y est pas permis.
        copy.appendChild(document.createTextNode(child.nodeValue.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')));
      }
    }
    const after = layer('::after');
    if (after) copy.appendChild(after);
    return copy;
  }

  // Les mots de la page et leur place, en millièmes de sa largeur et de sa hauteur. Un mot est une suite de caractères sans espace d'un même texte ; sa boîte est celle que le navigateur lui a
  // donnée (un mot coupé en fin de ligne a deux boîtes : on garde la réunion). Les mots hors de la page (rognés par leur cadre) n'y sont pas.
  async function wordsOf(page, width, height, pace) {
    const box = page.getBoundingClientRect();
    const out = [];
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      await pace();
      const text = node.nodeValue;
      if (!text.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, .pp-ff-ui')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const pattern = /\S+/g;
      let found;
      while ((found = pattern.exec(text))) {
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
        if (!rects.length) continue;
        const left = Math.min(...rects.map(r => r.left)) - box.left;
        const top = Math.min(...rects.map(r => r.top)) - box.top;
        const right = Math.max(...rects.map(r => r.right)) - box.left;
        const bottom = Math.max(...rects.map(r => r.bottom)) - box.top;
        if (right <= 0 || bottom <= 0 || left >= width || top >= height) continue;
        const x = Math.max(0, left);
        const y = Math.max(0, top);
        const w = Math.min(width, right) - x;
        const h = Math.min(height, bottom) - y;
        if (w <= 0 || h <= 0) continue;
        out.push([Math.round(x / width * PER_MILLE), Math.round(y / height * PER_MILLE), Math.max(1, Math.round(w / width * PER_MILLE)), Math.max(1, Math.round(h / height * PER_MILLE)), found[0]]);
      }
    }
    return out;
  }
  // Le texte de la diapositive, ligne par ligne : celui que l'écran montre (innerText suit la mise en page : un bloc, une ligne). Le texte des objets « derrière le texte » (le numéro de la diapositive, le
  // pied de page : le décor du masque) vient après celui de la diapositive, dans l'ordre où on la lit.
  function textOf(root) {
    const page = root.querySelector('.pp-slide-page') || root;
    const flow = [];
    const behind = [];
    Array.from(page.children).forEach((node) => { (node.matches('.pp-free-frame[data-ff-layer="behind"]') ? behind : flow).push(String(node.innerText || '')); });
    return flow.concat(behind).join('\n').replace(/\u00a0/g, ' ').split('\n').map(line => line.trim()).filter(Boolean).join('\n');
  }

  // Les polices que la diapositive emploie (la première de chaque pile et les suivantes : la police de repli compte aussi), en minuscules.
  async function familiesOf(root, pace) {
    const used = new Set();
    const seen = new Set();
    for (const node of [root].concat(Array.from(root.querySelectorAll('*')))) {
      await pace();
      const stack = getComputedStyle(node).fontFamily;
      if (seen.has(stack)) continue;
      seen.add(stack);
      stack.split(',').forEach(name => used.add(name.trim().replace(/^["']|["']$/g, '').toLowerCase()));
    }
    return used;
  }
  // Les `@font-face` de la feuille de Roboto, lue une fois ([] si elle ne vient pas) : { family, text }.
  let facesLoading = null;
  function loadFaces() {
    if (facesLoading) return facesLoading;
    const sheet = Array.from(document.styleSheets).find(item => item.href && FONT_SHEET.test(item.href));
    facesLoading = !sheet ? Promise.resolve([]) : fetch(sheet.href).then(response => (response.ok ? response.text() : '')).catch(() => '').then((css) => {
      const faces = (css.match(/@font-face\s*\{[^}]*\}/g) || []).map((text) => {
        const family = /font-family\s*:\s*["']?([^;"']+)/i.exec(text);
        return { family: family ? family[1].trim().toLowerCase() : '', text };
      });
      if (!faces.length) facesLoading = null;     // illisible aujourd'hui : on réessaie à la prochaine image
      return faces;
    });
    return facesLoading;
  }

  const loadImage = url => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image illisible'));
    img.src = url;
  });

  // Une pause à attendre entre deux pas : rien tant que la tranche en cours est courte, puis la main rendue à la page (js/work-pacer.js) ; sans WorkPacer, aucune.
  const pacer = () => (typeof WorkPacer !== 'undefined' ? WorkPacer.create({ sliceMs: 20, paintMs: 250 }) : async () => {});

  // La miniature `thumb` (à l'échelle 1, large de `width` px et haute de `height` px) en image. La page garde la main entre les pas (la frappe, la souris, le cadre « chargement » du document) ;
  // ce que le navigateur fait d'un bloc (lire le SVG, le peindre dans le canevas) ne se découpe pas.
  async function snapshot(thumb, width, height) {
    const pace = pacer();
    const families = await familiesOf(thumb, pace);
    const faces = (await loadFaces()).filter(face => families.has(face.family)).map(face => face.text).join('\n');
    const holder = document.createElementNS(XHTML, 'div');
    holder.setAttribute('xmlns', XHTML);
    holder.setAttribute('style', 'all: unset; display: block; overflow: hidden; width: ' + width + 'px; height: ' + height + 'px;');
    holder.appendChild(await inline(thumb, null, pace));
    await pace();
    const body = new XMLSerializer().serializeToString(holder);
    await pace();
    const outW = Math.round(width * SCALE);
    const outH = Math.round(height * SCALE);
    const style = faces ? '<style xmlns="' + XHTML + '"><![CDATA[' + faces.replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]></style>' : '';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + outW + '" height="' + outH + '" viewBox="0 0 ' + width + ' ' + height + '">'
      + '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + style + body + '</foreignObject></svg>';
    await pace();
    const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    await pace();
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canevas illisible');
    // Une diapositive lourde (une photo en fond : un PNG de plusieurs Mo, tenu dans le document, le PDF et le Word) passe en JPEG quand elle y gagne vraiment : la page est peinte sur du blanc, sans pixel
    // transparent, rien ne se perd que le fin grain d'une photo. Une diapositive de texte et de formes reste en PNG, nette au pixel.
    if (blob.size > HEAVY_BYTES) {
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (jpeg && jpeg.size < blob.size * JPEG_GAIN) blob = jpeg;
    }
    const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    await pace();
    return { src, width: outW, height: outH, text: textOf(thumb), words: await wordsOf(thumb, width, height, pace) };
  }

  return { snapshot };
})();
