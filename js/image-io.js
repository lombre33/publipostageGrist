// Lecture des images, pour l'insertion (collage, adresse) comme pour les exports PDF, Word et Excel : un fichier, un Blob ou une adresse (data:,
// blob:, http) devient un Blob, une data URI, une image décodée ou un PNG redessiné. Script classique : les modules qui l'appellent le font à
// l'exécution, son rang dans index.html n'a pas d'importance.
const ImageIo = (function () {
  // Le contenu de `src` (data:, blob:, adresse de pièce jointe ou d'un autre site) en Blob.
  async function fetchBlob(src) {
    const response = await fetch(src);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.blob();
  }

  // Un fichier ou un Blob en data URI.
  function toDataUri(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader a échoué'));
      reader.readAsDataURL(blob);
    });
  }

  // L'image décodée de `source`, une adresse ou un Blob. L'adresse temporaire d'un Blob est libérée dès que l'image est lue ou refusée : sinon le
  // Blob resterait en mémoire jusqu'à la fermeture de la page.
  // `decode()` fait décoder l'image HORS du fil principal : sans lui, le premier `drawImage` d'une photo de 12 Mpx la décode sur place et fige la page (un import PowerPoint de 150 diapositives
  // photographiques en faisait des arrêts de plusieurs centaines de millisecondes). Un refus de `decode()` (SVG sans dimensions...) ne change rien : l'image est rendue comme avant.
  function load(source) {
    return new Promise((resolve, reject) => {
      const url = typeof source === 'string' ? source : URL.createObjectURL(source);
      const release = () => { if (url !== source) URL.revokeObjectURL(url); };
      const img = new Image();
      img.onload = () => {
        const finish = () => { release(); resolve(img); };
        if (typeof img.decode === 'function') img.decode().then(finish, finish);
        else finish();
      };
      img.onerror = () => { release(); reject(new Error('image illisible')); };
      img.src = url;
    });
  }

  // L'image de `source` (adresse, Blob, ou image déjà décodée par `load`) redessinée dans un <canvas> à sa taille naturelle, 512 px sur le côté quand
  // le navigateur n'en donne pas (SVG sans dimensions). pdfmake et docx n'embarquent que du PNG et du JPEG : tout le reste (WEBP, SVG, BMP) passe par
  // là, puis par `pngBlob` ou `toDataURL`.
  async function draw(source) {
    const img = source instanceof HTMLImageElement ? source : await load(source);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 512;
    canvas.height = img.naturalHeight || 512;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Le contenu d'un <canvas> en data URI. `toBlob` encode HORS du fil principal, puis FileReader relit le Blob : un `toDataURL` d'une photo de plusieurs Mpx fige la page une demi-seconde en JPEG et plusieurs
  // secondes en PNG. `toDataURL` ne sert que si le navigateur refuse l'encodage asynchrone. Mêmes octets que `toDataURL` (même encodeur, même qualité).
  async function canvasDataUri(canvas, type, quality) {
    const blob = await new Promise((resolve) => {
      try { canvas.toBlob(resolve, type, quality); } catch (e) { resolve(null); }
    });
    if (blob && blob.size > 0) return toDataUri(blob);
    return canvas.toDataURL(type, quality);
  }

  // Le contenu d'un <canvas> en Blob PNG.
  function pngBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob a échoué'))), 'image/png'));
  }

  // --- Alléger une image (qualité « Léger » du PDF, js/pdf-export.js) ---
  // Le PDF reprend sinon chaque image telle quelle : une photo de 4 Mo pèse 4 Mo dans le fichier, même posée sur 10 cm. `lighten` rend la même image
  // ramenée à la définition qu'il lui faut dans sa boîte, puis recompressée ; le texte et les traits du PDF n'y sont pour rien et ne bougent pas.
  const LIGHT_JPEG_QUALITY = 0.8;
  // Une image qui tient déjà dans sa boîte et pèse peu n'est pas touchée : la recoder abîmerait un petit logo pour quelques octets.
  const LIGHT_SMALL_BYTES = 60 * 1024;
  // La nouvelle image ne remplace l'ancienne que si elle pèse nettement moins : sinon la définition perdue ne payerait rien.
  const LIGHT_KEEP_RATIO = 0.9;
  // Un PNG opaque devient JPEG quand celui-ci pèse moins du tiers du PNG (une photo) ; un logo ou une capture, dont les aplats se compriment bien en PNG,
  // garde ses bords nets.
  const LIGHT_JPEG_RATIO = 0.35;
  const LIGHT_CACHE_SIZE = 16;
  // De combien de pixels la largeur peut être poussée pour garder le ratio de l'image (snappedWidth).
  const LIGHT_SNAP_RANGE = 8;
  const lightResults = new Map();

  // Rien de translucide dans le canvas : un PNG qui a un canal alpha mais pas un pixel transparent peut devenir JPEG.
  function isOpaque(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return false;
    return true;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  // La largeur en pixels où l'image est redessinée : `wanted` (ce que sa boîte demande), poussée de quelques pixels au plus pour que la hauteur tombe juste
  // à son ratio. Un ratio qui bouge d'un millième déplace le texte qui suit d'une fraction de point et peut, une fois sur mille, changer une coupure de page :
  // l'allègement ne change que le poids, la page reste celle du PDF par défaut.
  function snappedWidth(wanted, naturalWidth, naturalHeight) {
    const ratio = naturalHeight / naturalWidth;
    let best = wanted;
    let bestError = Infinity;
    for (let width = wanted; width <= Math.min(naturalWidth, wanted + LIGHT_SNAP_RANGE); width++) {
      const error = Math.abs(Math.max(1, Math.round(width * ratio)) / width - ratio);
      if (error < bestError) { best = width; bestError = error; }
      if (error < 1e-9) break;
    }
    return best;
  }

  async function lightenOnce(src, box, ppi) {
    const bytes = Math.floor(src.length * 3 / 4);
    const image = await load(src);
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!(naturalWidth > 0 && naturalHeight > 0)) return src;
    // Les pixels que la boîte demande à 96 pixels CSS au pouce : jamais plus que l'image n'en a. La boîte d'une image qui s'y inscrit (colonne Pièces
    // jointes) borne aussi sa hauteur.
    const byWidth = Math.ceil(box.widthPx * ppi / 96);
    const byHeight = box.heightPx ? Math.ceil(Math.ceil(box.heightPx * ppi / 96) * naturalWidth / naturalHeight) : Infinity;
    const wanted = Math.min(naturalWidth, byWidth, byHeight);
    if (wanted >= naturalWidth && bytes < LIGHT_SMALL_BYTES) return src;
    const width = wanted >= naturalWidth ? naturalWidth : snappedWidth(wanted, naturalWidth, naturalHeight);
    const height = width === naturalWidth ? naturalHeight : Math.max(1, Math.round(width * naturalHeight / naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const jpeg = /^data:image\/jpe?g/i.test(src);
    const opaque = jpeg || isOpaque(context, width, height);
    const asJpeg = opaque ? await canvasBlob(canvas, 'image/jpeg', LIGHT_JPEG_QUALITY) : null;
    const asPng = jpeg ? null : await canvasBlob(canvas, 'image/png');
    let lighter = asJpeg || asPng;
    if (asJpeg && asPng) lighter = asJpeg.size < asPng.size * LIGHT_JPEG_RATIO ? asJpeg : asPng;
    if (!lighter || lighter.size >= bytes * LIGHT_KEEP_RATIO) return src;
    return toDataUri(lighter);
  }

  // `src` : une data URI PNG ou JPEG ; `box` : { widthPx, heightPx } la boîte où l'image est posée, en pixels CSS (`heightPx` nul : la hauteur suit le
  // ratio) ; `ppi` : les points par pouce visés. Rend `src` tel quel quand l'image est déjà assez légère ou illisible : un export ne manque jamais
  // d'une image pour l'avoir voulue plus légère. Les dernières images allégées sont gardées : un lot de 200 courriers avec le même logo le recode
  // une fois.
  function lighten(src, box, ppi) {
    const key = ppi + '|' + Math.round(box.widthPx) + 'x' + Math.round(box.heightPx || 0) + '|' + src;
    if (!lightResults.has(key)) {
      lightResults.set(key, lightenOnce(src, box, ppi).catch(() => src));
      if (lightResults.size > LIGHT_CACHE_SIZE) lightResults.delete(lightResults.keys().next().value);
    }
    return lightResults.get(key);
  }

  // --- Rogner, tourner, retourner une image ---
  // Une image du document se règle par sa largeur et garde ses proportions : rogner, tourner ou retourner REDESSINE ses points (un canvas), l'image qui en sort est une image ordinaire
  // que tous les exports reprennent déjà. L'import PowerPoint (js/pptx-import.js) et l'import Word (js/docx-import.js) s'en servent pour rendre l'image comme le fichier la montre ; les
  // boutons « Pivoter », « Retourner » et « Rogner » de la barre de l'image (js/image-reshape.js) aussi.
  const RESHAPE_MAX_PIXELS = 16000000;     // une image redessinée ne dépasse pas 16 millions de points
  const RESHAPE_STRETCH_TOLERANCE = 0.01;  // un écart de proportions sous 1 % n'est pas corrigé
  const RESHAPE_FIT_TRIGGER = 0.8;         // `fit` : une image qui dépasse sa taille maximale de moins d'un quart est laissée telle quelle (la recoder abîmerait pour quelques octets)
  const RESHAPE_JPEG_QUALITY = 0.92;
  // Le sens horaire en degrés, ramené à [0, 360[ ; un tour entier, ou un écart sous un centième de degré, ne tourne rien.
  function turnOf(degrees) {
    const turn = ((Number(degrees) || 0) % 360 + 360) % 360;
    return turn < 0.01 || turn > 359.99 ? 0 : turn;
  }
  // Les quatre marges rognées en parts de l'image (de 0 à 1) : une part négative (Word agrandit alors l'image de vide) ne rogne rien ; ce qui reste ne tombe jamais à zéro.
  function cropOf(crop) {
    const part = value => Math.min(0.99, Math.max(0, Number(value) || 0));
    const out = { l: part(crop && crop.l), t: part(crop && crop.t), r: part(crop && crop.r), b: part(crop && crop.b) };
    if (out.l + out.r > 0.99) { const k = 0.99 / (out.l + out.r); out.l *= k; out.r *= k; }
    if (out.t + out.b > 0.99) { const k = 0.99 / (out.t + out.b); out.t *= k; out.b *= k; }
    return out;
  }
  // `source` : l'adresse (data:, blob:), le Blob ou l'image décodée à redessiner ; `spec` : { crop: { l, t, r, b } (parts de 0 à 1 ôtées de chaque bord), flipH, flipV (miroir), turn (degrés, sens
  // horaire, tout angle), ratio (largeur / hauteur voulue de la partie gardée, avant la rotation : l'image est alors étirée dans la dimension qui grandit, rien n'est perdu ; 0 : telle quelle),
  // quality (JPEG), fit ({ w, h } : la taille MAXIMALE en points de l'image rendue ; une image plus grande d'au moins un quart y est ramenée, jamais agrandie, sauf un GIF qu'un canvas aplatirait) }. Le miroir se fait avant la rotation, comme dans Word et PowerPoint. Rend { src, width, height } (l'image redessinée en adresse de données et ses points) ou `null`
  // quand il n'y a rien à faire (aucun réglage, ou une image vectorielle qu'un canvas ne rendrait qu'en perdant son dessin) ; lève une erreur quand l'image ne se décode pas. Un JPEG reste
  // JPEG tant que l'image ne reçoit pas de coins vides (un tour d'un autre angle qu'un quart de tour) ; le reste sort en PNG.
  async function reshape(source, spec) {
    const options = spec || {};
    if (typeof source === 'string' && /^data:image\/svg/i.test(source)) return null;
    if (source instanceof Blob && /svg/i.test(source.type)) return null;
    const crop = cropOf(options.crop);
    const cropped = crop.l > 0 || crop.t > 0 || crop.r > 0 || crop.b > 0;
    const turn = turnOf(options.turn);
    const flipH = !!options.flipH;
    const flipV = !!options.flipV;
    const img = await load(source);
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (!sw || !sh) return null;
    const sx = Math.round(sw * crop.l);
    const sy = Math.round(sh * crop.t);
    const cw = Math.max(1, Math.round(sw * (1 - crop.l - crop.r)));
    const ch = Math.max(1, Math.round(sh * (1 - crop.t - crop.b)));
    let outW = cw;
    let outH = ch;
    const ratio = Number(options.ratio) || 0;
    if (ratio > 0 && Math.abs(cw / ch / ratio - 1) > RESHAPE_STRETCH_TOLERANCE) {
      if (cw / ch > ratio) outH = Math.round(cw / ratio);
      else outW = Math.round(ch * ratio);
    }
    // `fit` : la plus grande définition utile (l'import PowerPoint la donne : deux fois et demie celle de la boîte de l'image) ; une photo de 12 millions de points posée dans une vignette pèse sinon
    // des mégaoctets pour rien, en mémoire comme dans le modèle enregistré.
    const fit = options.fit;
    const fitScale = fit && fit.w > 0 && fit.h > 0 && !(typeof source === 'string' && /^data:image\/gif/i.test(source)) ? Math.min(1, fit.w / outW, fit.h / outH) : 1;
    const resized = fitScale < RESHAPE_FIT_TRIGGER;
    if (!cropped && !flipH && !flipV && !turn && outW === cw && outH === ch && !resized) return null;
    // La taille de l'image tournée : un quart de tour échange la largeur et la hauteur, un autre angle donne la boîte qui enveloppe l'image (ses coins restent vides).
    const radians = turn * Math.PI / 180;
    const quarter = turn % 90 === 0;
    let fullW = outW;
    let fullH = outH;
    if (turn && quarter) {
      if (turn === 90 || turn === 270) { fullW = outH; fullH = outW; }
    } else if (turn) {
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      fullW = Math.ceil(outW * cos + outH * sin - 1e-6);
      fullH = Math.ceil(outW * sin + outH * cos - 1e-6);
    }
    const shrink = Math.min(1, Math.sqrt(RESHAPE_MAX_PIXELS / (fullW * fullH)), resized ? fitScale : 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(fullW * shrink));
    canvas.height = Math.max(1, Math.round(fullH * shrink));
    const g = canvas.getContext('2d');
    if (shrink < 1) g.imageSmoothingQuality = 'high'; // une forte réduction sans lissage crénelle
    if (!turn) {
      g.translate(flipH ? canvas.width : 0, flipV ? canvas.height : 0);
      g.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      g.drawImage(img, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
    } else {
      const drawW = Math.max(1, Math.round(outW * shrink));
      const drawH = Math.max(1, Math.round(outH * shrink));
      g.imageSmoothingQuality = 'high';
      g.translate(canvas.width / 2, canvas.height / 2);
      g.rotate(radians);
      g.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      g.drawImage(img, sx, sy, cw, ch, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    const jpeg = typeof source === 'string' ? /^data:image\/jpe?g/i.test(source) : (source instanceof Blob && /jpe?g/i.test(source.type));
    const keepsJpeg = jpeg && (!turn || quarter);
    const src = keepsJpeg ? await canvasDataUri(canvas, 'image/jpeg', options.quality || RESHAPE_JPEG_QUALITY) : await canvasDataUri(canvas, 'image/png');
    const result = { src, width: canvas.width, height: canvas.height };
    // La mémoire du canvas est rendue tout de suite : sans cela elle attend le prochain ramasse-miettes (64 Mo pour 16 millions de points), et des centaines d'images à la suite l'accumulent.
    canvas.width = 0;
    canvas.height = 0;
    return result;
  }

  return { fetchBlob, toDataUri, canvasDataUri, load, draw, pngBlob, lighten, reshape, turnOf };
})();
