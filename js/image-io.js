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
  function load(source) {
    return new Promise((resolve, reject) => {
      const url = typeof source === 'string' ? source : URL.createObjectURL(source);
      const release = () => { if (url !== source) URL.revokeObjectURL(url); };
      const img = new Image();
      img.onload = () => { release(); resolve(img); };
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

  return { fetchBlob, toDataUri, load, draw, pngBlob, lighten };
})();
