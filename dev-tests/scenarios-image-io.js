// Suite "imageIo" - la lecture des images que partagent l'insertion (collage, adresse) et les exports PDF, Word et Excel (js/image-io.js) : une adresse en Blob,
// un Blob en data URI, une image décodée, un PNG redessiné. Chaque cas relit ce que le navigateur rend (octets, dimensions), jamais un double. Les adresses
// temporaires (blob:) sont comptées : toute adresse créée pour décoder une image doit être libérée, sinon le Blob reste en mémoire jusqu'à la fermeture de la page.
(function () {
  const cases = [];
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const DATA_PNG = 'data:image/png;base64,' + PNG_B64;
  const pngBlob = () => new Blob([Uint8Array.from(atob(PNG_B64), c => c.charCodeAt(0))], { type: 'image/png' });

  // URL.createObjectURL / revokeObjectURL comptés le temps d'un cas : `leaked` = adresses créées et jamais libérées.
  function watchObjectUrls() {
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const created = new Set();
    const revoked = new Set();
    URL.createObjectURL = blob => { const url = create.call(URL, blob); created.add(url); return url; };
    URL.revokeObjectURL = url => { revoked.add(url); return revoke.call(URL, url); };
    return {
      created,
      get leaked() { return [...created].filter(url => !revoked.has(url)); },
      restore() { URL.createObjectURL = create; URL.revokeObjectURL = revoke; },
    };
  }

  cases.push({
    id: 'imageio_to_data_uri_round_trip',
    description: 'toDataUri écrit un Blob en data URI, relue octet pour octet',
    run: async () => {
      const uri = await ImageIo.toDataUri(pngBlob());
      return { pass: uri === DATA_PNG, notes: uri.slice(0, 60) };
    },
  });

  cases.push({
    id: 'imageio_fetch_blob_reads_data_uri_and_refuses_http_error',
    description: 'fetchBlob lit une adresse data: en Blob de son type, et refuse une réponse HTTP en erreur',
    run: async () => {
      const blob = await ImageIo.fetchBlob(DATA_PNG);
      let message = null;
      try { await ImageIo.fetchBlob('/dev-tests/introuvable-404.png'); } catch (e) { message = e.message; }
      return { pass: blob.type === 'image/png' && blob.size > 0 && message === 'HTTP 404', notes: JSON.stringify({ type: blob.type, size: blob.size, message }) };
    },
  });

  cases.push({
    id: 'imageio_load_string_creates_no_object_url',
    description: 'load d\'une adresse décode l\'image sans créer d\'adresse temporaire',
    run: async () => {
      const urls = watchObjectUrls();
      try {
        const image = await ImageIo.load(DATA_PNG);
        return { pass: image.naturalWidth === 1 && image.naturalHeight === 1 && urls.created.size === 0, notes: JSON.stringify({ w: image.naturalWidth, created: urls.created.size }) };
      } finally { urls.restore(); }
    },
  });

  cases.push({
    id: 'imageio_load_blob_releases_its_object_url',
    description: 'load d\'un Blob libère l\'adresse temporaire une fois l\'image lue, et aussi quand elle est refusée',
    run: async () => {
      const urls = watchObjectUrls();
      try {
        const image = await ImageIo.load(pngBlob());
        const afterGood = { created: urls.created.size, leaked: urls.leaked.length };
        let refused = false;
        try { await ImageIo.load(new Blob(['pas une image'], { type: 'image/png' })); } catch (e) { refused = true; }
        const afterBad = { created: urls.created.size, leaked: urls.leaked.length };
        return { pass: image.naturalWidth === 1 && afterGood.created === 1 && afterGood.leaked === 0 && refused && afterBad.created === 2 && afterBad.leaked === 0, notes: JSON.stringify({ afterGood, refused, afterBad }) };
      } finally { urls.restore(); }
    },
  });

  cases.push({
    id: 'imageio_draw_redraws_any_format_at_its_natural_size',
    description: 'draw redessine une image (ici un WEBP, que PDF et Word n\'embarquent pas) dans un canvas à sa taille naturelle, encodable en PNG',
    run: async () => {
      // WEBP 4x1 réel (encodé par Chromium) : un fichier tronqué ferait échouer le cas pour une autre raison.
      const webp = 'data:image/webp;base64,UklGRh4CAABXRUJQVlA4WAoAAAAgAAAAAwAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggMAAAANABAJ0BKgQAAQABQCYloAJ0ugH4AAOwAP73WS/+QWlct4A//jKnxlT4yp/xcwAAAA==';
      const canvas = await ImageIo.draw(webp);
      const png = canvas.toDataURL('image/png');
      return { pass: canvas.width === 4 && canvas.height === 1 && png.startsWith('data:image/png;base64,'), notes: JSON.stringify({ w: canvas.width, h: canvas.height, png: png.slice(0, 30) }) };
    },
  });

  cases.push({
    id: 'imageio_draw_of_a_blob_releases_its_object_url',
    description: 'draw d\'un Blob ne laisse aucune adresse temporaire derrière lui',
    run: async () => {
      const urls = watchObjectUrls();
      try {
        const canvas = await ImageIo.draw(pngBlob());
        return { pass: canvas.width === 1 && urls.created.size === 1 && urls.leaked.length === 0, notes: JSON.stringify({ created: urls.created.size, leaked: urls.leaked.length }) };
      } finally { urls.restore(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageIo = cases;
})();
