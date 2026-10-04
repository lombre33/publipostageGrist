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

  return { fetchBlob, toDataUri, load, draw, pngBlob };
})();
