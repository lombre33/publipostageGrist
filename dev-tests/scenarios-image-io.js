// Suite "imageIo" - la lecture des images que partagent l'insertion (collage, adresse) et les exports PDF, Word et Excel (js/image-io.js) : une adresse en Blob,
// un Blob en data URI, une image décodée, un PNG redessiné. Chaque cas relit ce que le navigateur rend (octets, dimensions), jamais un double. Les adresses
// temporaires (blob:) sont comptées : toute adresse créée pour décoder une image doit être libérée, sinon le Blob reste en mémoire jusqu'à la fermeture de la page.
// `lighten` (qualité « Léger » du PDF) : une image ramenée à la définition de sa boîte, à 150 points par pouce, sans changer son ratio, sans toucher une petite image ni la transparence d'un logo.
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

  // --- lighten : une image ramenée à la définition de sa boîte (qualité « Léger » du PDF, js/pdf-export.js) ---
  // Les images viennent de TestHelpers.makeImage (grain déterministe : une « photo » qui pèse comme une vraie). 150 points par pouce, la boîte en pixels CSS (96 au pouce).
  const PPI = 150;
  const bytesOf = uri => Math.floor(uri.length * 3 / 4);
  const typeOf = uri => uri.slice(5, uri.indexOf(';'));
  const sizeOf = async uri => { const image = await ImageIo.load(uri); return { width: image.naturalWidth, height: image.naturalHeight }; };
  const ppiOf = (pixels, boxWidthPx) => pixels / (boxWidthPx / 96);
  async function pixelOf(uri, x, y) {
    const image = await ImageIo.load(uri);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }

  cases.push({
    id: 'imageio_lighten_brings_a_photo_down_to_150_ppi_in_its_box',
    description: 'lighten ramène une photo JPEG de 2400 x 1600 posée sur 300 px (3,1 po) à ~150 points par pouce, en JPEG, au même ratio 3:2, pour moins de 15 % de son poids',
    run: async (h) => {
      const photo = h.makeImage(2400, 1600, { type: 'image/jpeg', quality: 0.92 });
      const light = await ImageIo.lighten(photo, { widthPx: 300 }, PPI);
      const size = await sizeOf(light);
      const ppi = ppiOf(size.width, 300);
      const pass = bytesOf(photo) > 400 * 1024 && typeOf(light) === 'image/jpeg' && ppi >= PPI && ppi < PPI + 3 && size.width * 2 === size.height * 3 && bytesOf(light) < bytesOf(photo) * 0.15;
      return { pass, notes: JSON.stringify({ before: bytesOf(photo), after: bytesOf(light), size, ppi: Math.round(ppi * 10) / 10, type: typeOf(light) }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_keeps_the_ratio_of_the_image',
    description: 'lighten garde le ratio de l\'image à quelques dix-millièmes près (ici 2333 x 1555) : la page du PDF ne bouge pas parce que les pixels ont changé',
    run: async (h) => {
      const photo = h.makeImage(2333, 1555, { type: 'image/jpeg', quality: 0.9, seed: 5 });
      const light = await ImageIo.lighten(photo, { widthPx: 300 }, PPI);
      const size = await sizeOf(light);
      const ratio = 1555 / 2333;
      const drift = Math.abs(size.height / size.width - ratio) / ratio;
      return { pass: size.width >= 469 && size.width < 480 && drift < 0.0004, notes: JSON.stringify({ size, drift }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_leaves_a_small_image_untouched',
    description: 'lighten rend telle quelle (même chaîne) une petite image qui tient dans sa boîte : la recoder abîmerait un logo pour quelques octets',
    run: async (h) => {
      const small = h.makeImage(60, 60, { seed: 3 });
      const light = await ImageIo.lighten(small, { widthPx: 300 }, PPI);
      return { pass: light === small && bytesOf(small) < 60 * 1024, notes: JSON.stringify({ bytes: bytesOf(small), same: light === small }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_turns_an_opaque_png_photo_into_a_jpeg',
    description: 'lighten recode en JPEG un PNG opaque lourd (une photo), réduit à sa boîte (1600 x 1000 sur 400 px) ou, quand il y tient déjà (600 x 400 sur 600 px), à sa taille',
    run: async (h) => {
      const big = h.makeImage(1600, 1000);
      const bigLight = await ImageIo.lighten(big, { widthPx: 400 }, PPI);
      const bigSize = await sizeOf(bigLight);
      const fits = h.makeImage(600, 400, { seed: 13 });
      const fitsLight = await ImageIo.lighten(fits, { widthPx: 600 }, PPI);
      const fitsSize = await sizeOf(fitsLight);
      const pass = typeOf(bigLight) === 'image/jpeg' && bigSize.width >= 625 && bigSize.width < 640 && bytesOf(bigLight) < bytesOf(big) * 0.05
        && typeOf(fitsLight) === 'image/jpeg' && fitsSize.width === 600 && fitsSize.height === 400 && bytesOf(fitsLight) < bytesOf(fits) * 0.2;
      return { pass, notes: JSON.stringify({ big: [bytesOf(big), bytesOf(bigLight), bigSize, typeOf(bigLight)], fits: [bytesOf(fits), bytesOf(fitsLight), fitsSize, typeOf(fitsLight)] }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_keeps_the_transparency_of_a_logo',
    description: 'lighten garde un logo sur fond transparent en PNG, réduit à sa boîte (1200 x 600 sur 120 px) : le coin reste transparent, le centre garde sa couleur',
    run: async (h) => {
      const logo = h.makeImage(1200, 600, { logo: true });
      const light = await ImageIo.lighten(logo, { widthPx: 120 }, PPI);
      const size = await sizeOf(light);
      const corner = await pixelOf(light, 0, 0);
      const centre = await pixelOf(light, size.width >> 1, size.height >> 1);
      const pass = typeOf(light) === 'image/png' && size.width >= 188 && size.width < 200 && size.width === size.height * 2 && bytesOf(light) < bytesOf(logo)
        && corner[3] === 0 && centre[3] === 255 && Math.abs(centre[0] - 200) <= 4 && Math.abs(centre[1] - 30) <= 4 && Math.abs(centre[2] - 40) <= 4;
      return { pass, notes: JSON.stringify({ before: bytesOf(logo), after: bytesOf(light), size, type: typeOf(light), corner, centre }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_keeps_the_original_when_it_would_not_get_lighter',
    description: 'lighten rend l\'original (même chaîne) quand le recoder ne le rendrait pas nettement plus léger : un JPEG déjà très compressé qui tient dans sa boîte',
    run: async (h) => {
      const packed = h.makeImage(1400, 980, { type: 'image/jpeg', quality: 0.5, noise: 255, seed: 11 });
      const light = await ImageIo.lighten(packed, { widthPx: 2000 }, PPI);
      return { pass: bytesOf(packed) > 60 * 1024 && light === packed, notes: JSON.stringify({ bytes: bytesOf(packed), same: light === packed }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_fits_a_box_bounded_in_height',
    description: 'lighten tient compte de la hauteur d\'une image qui s\'inscrit dans sa boîte (colonne Pièces jointes) : 2000 x 1000 dans 600 x 100 px se réduit à ~314 px, pas à ~940',
    run: async (h) => {
      const photo = h.makeImage(2000, 1000, { type: 'image/jpeg', quality: 0.9, seed: 9 });
      const light = await ImageIo.lighten(photo, { widthPx: 600, heightPx: 100 }, PPI);
      const size = await sizeOf(light);
      return { pass: size.width >= 314 && size.width < 330 && size.width === size.height * 2, notes: JSON.stringify({ size, before: bytesOf(photo), after: bytesOf(light) }) };
    },
  });

  cases.push({
    id: 'imageio_lighten_returns_the_original_for_an_unreadable_image',
    description: 'lighten rend l\'image telle quelle, sans lever d\'erreur, quand elle ne se décode pas : un export ne manque jamais d\'une image pour l\'avoir voulue plus légère',
    run: async () => {
      const broken = 'data:image/png;base64,AAAA';
      const light = await ImageIo.lighten(broken, { widthPx: 100 }, PPI);
      return { pass: light === broken, notes: String(light).slice(0, 40) };
    },
  });

  cases.push({
    id: 'imageio_lighten_reuses_its_last_results',
    description: 'lighten garde ses derniers résultats : la même image, la même boîte et les mêmes ppi rendent la même promesse (un lot de 200 courriers avec le même logo le recode une fois) ; d\'autres ppi, une autre',
    run: async (h) => {
      const photo = h.makeImage(1200, 800, { type: 'image/jpeg', quality: 0.9, seed: 21 });
      const first = ImageIo.lighten(photo, { widthPx: 300 }, PPI);
      const again = ImageIo.lighten(photo, { widthPx: 300 }, PPI);
      const other = ImageIo.lighten(photo, { widthPx: 300 }, 96);
      const [a, b, c] = await Promise.all([first, again, other]);
      return { pass: first === again && first !== other && a === b && c !== a, notes: JSON.stringify({ same: first === again, otherDiffers: first !== other }) };
    },
  });

  // --- reshape : rogner, tourner, retourner (js/image-io.js) ---
  // Une image de quatre quarts de couleurs (40 x 20 : rouge, bleu en haut ; vert, jaune en bas), en PNG ou en JPEG.
  const quarters = (type) => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 20;
    const g = canvas.getContext('2d');
    [['#ff0000', 0, 0], ['#0000ff', 20, 0], ['#00ff00', 0, 10], ['#ffff00', 20, 10]].forEach(([color, x, y]) => { g.fillStyle = color; g.fillRect(x, y, 20, 10); });
    return canvas.toDataURL(type || 'image/png', 1);
  };
  const colorAt = async (src, fx, fy) => {
    const canvas = await ImageIo.draw(src);
    return { w: canvas.width, h: canvas.height, px: Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width * fx), Math.floor(canvas.height * fy), 1, 1).data) };
  };
  const near = (px, rgb) => px[3] === 255 && rgb.every((v, i) => Math.abs(px[i] - v) < 40);

  cases.push({
    id: 'imageio_reshape_crops_flips_and_turns_in_word_order',
    description: 'reshape rogne (parts ôtées de chaque bord), retourne puis tourne, dans l\'ordre de Word et de PowerPoint : le miroir avant le tour ; un quart de tour échange la largeur et la hauteur',
    run: async () => {
      const bad = [];
      const src = quarters();
      const cropped = await ImageIo.reshape(src, { crop: { l: 0.5, t: 0, r: 0, b: 0.5 } });
      const c = await colorAt(cropped.src, 0.25, 0.5);
      if (!(cropped.width === 20 && cropped.height === 10 && near(c.px, [0, 0, 255]))) bad.push('rognage : ' + JSON.stringify([cropped.width, cropped.height, c.px]));
      const mirrored = await ImageIo.reshape(src, { flipH: true });
      const m = await colorAt(mirrored.src, 0.25, 0.25);
      if (!near(m.px, [0, 0, 255])) bad.push('miroir : ' + JSON.stringify(m.px));
      const turned = await ImageIo.reshape(src, { turn: 90 });
      const t = await colorAt(turned.src, 0.25, 0.25);
      if (!(turned.width === 20 && turned.height === 40 && near(t.px, [0, 255, 0]))) bad.push('quart de tour : ' + JSON.stringify([turned.width, turned.height, t.px]));
      const both = await ImageIo.reshape(src, { flipH: true, turn: 90 });
      const b = await colorAt(both.src, 0.25, 0.25);
      if (!near(b.px, [255, 255, 0])) bad.push('miroir puis tour : ' + JSON.stringify(b.px));
      const upright = await ImageIo.reshape(src, { turn: 360 + 0.001 });
      if (upright !== null) bad.push('un tour entier ne tourne rien : ' + JSON.stringify(upright && [upright.width, upright.height]));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imageio_reshape_does_nothing_to_vector_images_and_says_so',
    description: 'reshape rend null quand il n\'y a rien à faire (aucun réglage, ou des réglages à zéro) et pour une image vectorielle (SVG : le dessin se perdrait) ; il lève pour une image illisible',
    run: async () => {
      const bad = [];
      if (await ImageIo.reshape(quarters()) !== null) bad.push('sans réglage');
      if (await ImageIo.reshape(quarters(), { crop: { l: 0, t: 0, r: 0, b: 0 }, turn: 0, ratio: 2 }) !== null) bad.push('réglages à zéro, proportions déjà bonnes');
      const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2"/></svg>');
      if (await ImageIo.reshape(svg, { turn: 90 }) !== null) bad.push('SVG');
      let refused = false;
      try { await ImageIo.reshape('data:image/png;base64,AAAA', { turn: 90 }); } catch (e) { refused = true; }
      if (!refused) bad.push('image illisible acceptée');
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  cases.push({
    id: 'imageio_reshape_stretches_to_the_ratio_and_keeps_jpeg_when_it_can',
    description: 'reshape étire la partie gardée aux proportions demandées dans la dimension qui grandit ; un JPEG reste JPEG après un quart de tour ou un miroir, et devient PNG (coins transparents) après un autre angle',
    run: async () => {
      const bad = [];
      const wide = await ImageIo.reshape(quarters(), { crop: { l: 0.5, t: 0, r: 0, b: 0 }, ratio: 2 });
      if (!(wide.width === 40 && wide.height === 20)) bad.push('étirement : ' + JSON.stringify([wide.width, wide.height]));
      const jpeg = quarters('image/jpeg');
      const quarter = await ImageIo.reshape(jpeg, { turn: 270 });
      const mirror = await ImageIo.reshape(jpeg, { flipV: true });
      const slanted = await ImageIo.reshape(jpeg, { turn: 30 });
      if (!/^data:image\/jpeg/.test(quarter.src)) bad.push('quart de tour : ' + quarter.src.slice(0, 20));
      if (!/^data:image\/jpeg/.test(mirror.src)) bad.push('miroir : ' + mirror.src.slice(0, 20));
      if (!/^data:image\/png/.test(slanted.src)) bad.push('30 degrés : ' + slanted.src.slice(0, 20));
      const corner = await colorAt(slanted.src, 0, 0);
      if (corner.px[3] !== 0) bad.push('coin plein : ' + JSON.stringify(corner.px));
      if (!(slanted.width === Math.ceil(40 * Math.cos(Math.PI / 6) + 20 * Math.sin(Math.PI / 6) - 1e-6) && slanted.height === Math.ceil(40 * Math.sin(Math.PI / 6) + 20 * Math.cos(Math.PI / 6) - 1e-6))) bad.push('boîte : ' + JSON.stringify([slanted.width, slanted.height]));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageIo = cases;
})();
