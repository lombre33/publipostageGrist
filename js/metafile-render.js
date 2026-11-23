// Les images vectorielles de Windows (EMF et WMF, et leurs formes compressées EMZ et WMZ) dessinées en image PNG, pour qu'une image de ce format reprise d'un PowerPoint ou d'un Word s'affiche : le navigateur
// ne sait pas les lire. Ce n'est pas un moteur complet de GDI : il rejoue ce que ces images contiennent presque toujours - rectangles, ellipses, rectangles arrondis, polygones, lignes et courbes de Bézier,
// tracés (BeginPath ... FillPath, StrokePath, SelectClipPath), textes (police, taille, gras, italique, espacement des lettres), images (STRETCHDIBITS, BITBLT, STRETCHBLT, de 1 à 32 bits ou en PNG/JPEG),
// découpe rectangulaire, transformation du monde, modes de coordonnées - et rend `null` pour ce qu'il ne sait pas faire (un fichier qui ne dessine qu'en EMF+, un fichier illisible ou vide) : l'appelant
// compte alors l'image comme non reprise, comme avant.
//
//   MetafileRender.toImage(bytes, kind, { maxPx })  ->  Promise<{ src (adresse de données PNG), width, height (pixels) } | null>
//   kind : 'emf' | 'wmf' | 'emz' | 'wmz' ; maxPx : la plus grande dimension de l'image rendue (1600 à défaut)
const MetafileRender = (function () {
  const MAX_PX = 1600;
  const MIN_PX = 16;
  const MAX_RECORDS = 400000;
  const MAX_BITMAP_PX = 64000000;

  // --- Les couleurs, les mesures et les outils de lecture ----------------------------------------------------------------------------------------------------------------------------------------
  const colorOf = (ref) => 'rgb(' + (ref & 255) + ',' + ((ref >> 8) & 255) + ',' + ((ref >> 16) & 255) + ')';
  const clampPx = value => Math.max(MIN_PX, Math.min(MAX_PX, Math.round(value)));

  // Un mode de coordonnées fixe (MM_LOMETRIC...) : les unités logiques sont des fractions de millimètre, l'axe vertical monte.
  const MM_UNITS = { 2: 0.1, 3: 0.01, 4: 0.254, 5: 0.0254, 6: 25.4 / 1440 };

  // --- La toile : l'état du dessin et l'effet de chaque enregistrement --------------------------------------------------------------------------------------------------------------------
  function newState() {
    return { mapMode: 1, winOrg: [0, 0], winExt: [1, 1], vpOrg: [0, 0], vpExt: [1, 1], world: [1, 0, 0, 1, 0, 0], pen: null, brush: null, font: null, textColor: 0, bkColor: 0xffffff, bkMode: 2, fillMode: 1, textAlign: 0,
      cursor: [0, 0], arcDir: 1 };
  }
  const cloneState = s => Object.assign({}, s, { winOrg: s.winOrg.slice(), winExt: s.winExt.slice(), vpOrg: s.vpOrg.slice(), vpExt: s.vpExt.slice(), world: s.world.slice(), cursor: s.cursor.slice() });

  function createPainter(g, base, deviceInfo) {
    let st = newState();
    const stack = [];
    let inPath = false;
    const objects = [];
    const stockPens = [{ kind: 'pen', style: 0, width: 1, color: 0xffffff }, { kind: 'pen', style: 0, width: 1, color: 0 }, { kind: 'pen', style: 5, width: 1, color: 0 }];
    const gray = v => (v | (v << 8) | (v << 16));
    const stockBrushes = [{ kind: 'brush', style: 0, color: 0xffffff }, { kind: 'brush', style: 0, color: gray(0xc0) }, { kind: 'brush', style: 0, color: gray(0x80) }, { kind: 'brush', style: 0, color: gray(0x40) },
      { kind: 'brush', style: 0, color: 0 }, { kind: 'brush', style: 1 }];
    st.pen = stockPens[1];
    st.brush = stockBrushes[0];

    // La matrice du dessin : la page de l'image (unités d'appareil -> pixels de la toile), puis la fenêtre et la fenêtre d'affichage (unités logiques -> appareil), puis la transformation du monde.
    function apply() {
      let winExt = st.winExt;
      let vpExt = st.vpExt;
      if (MM_UNITS[st.mapMode]) {
        const perMm = [deviceInfo.pxPerMmX, deviceInfo.pxPerMmY];
        winExt = [1, 1];
        vpExt = [MM_UNITS[st.mapMode] * perMm[0], -MM_UNITS[st.mapMode] * perMm[1]];
      } else if (st.mapMode === 1) {
        winExt = [1, 1];
        vpExt = [1, 1];
      }
      const sx = winExt[0] ? vpExt[0] / winExt[0] : 1;
      const sy = winExt[1] ? vpExt[1] / winExt[1] : 1;
      g.setTransform(base[0], base[1], base[2], base[3], base[4], base[5]);
      g.translate(st.vpOrg[0], st.vpOrg[1]);
      g.scale(sx, sy);
      g.translate(-st.winOrg[0], -st.winOrg[1]);
      g.transform(st.world[0], st.world[1], st.world[2], st.world[3], st.world[4], st.world[5]);
    }
    const pixelSize = () => {
      const m = g.getTransform();
      return 1 / Math.max(1e-9, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)));
    };
    function penStyle() {
      const pen = st.pen;
      if (!pen || pen.style === 5) return false;
      g.strokeStyle = colorOf(pen.color);
      g.lineWidth = Math.max(pen.width || 0, 0) || pixelSize();
      if (pen.width && pen.width < pixelSize()) g.lineWidth = pixelSize();
      const dash = { 1: [6, 2], 2: [1, 2], 3: [6, 2, 1, 2], 4: [6, 2, 1, 2, 1, 2] }[pen.style & 15];
      g.setLineDash(dash ? dash.map(n => n * Math.max(g.lineWidth, pixelSize())) : []);
      g.lineCap = pen.cap || 'round';
      g.lineJoin = pen.join || 'round';
      return true;
    }
    function brushStyle() {
      const brush = st.brush;
      if (!brush || brush.style === 1) return false;
      if (brush.style === 2 || brush.style === 3) { g.fillStyle = hatchPattern(brush); return true; }
      g.fillStyle = colorOf(brush.color || 0);
      return true;
    }
    function hatchPattern(brush) {
      const tile = document.createElement('canvas');
      tile.width = 8;
      tile.height = 8;
      const t = tile.getContext('2d');
      t.strokeStyle = colorOf(brush.color || 0);
      t.lineWidth = 1;
      t.beginPath();
      const hatch = brush.hatch || 0;
      if (hatch === 0 || hatch === 4) { t.moveTo(0, 4.5); t.lineTo(8, 4.5); }
      if (hatch === 1 || hatch === 4) { t.moveTo(4.5, 0); t.lineTo(4.5, 8); }
      if (hatch === 2 || hatch === 5) { t.moveTo(0, 0); t.lineTo(8, 8); }
      if (hatch === 3 || hatch === 5) { t.moveTo(0, 8); t.lineTo(8, 0); }
      t.stroke();
      return g.createPattern(tile, 'repeat');
    }
    // Remplit et trace la figure en cours (le chemin du contexte) ; dans un tracé (BeginPath ... EndPath) rien n'est peint, la figure s'ajoute au tracé.
    function paint(closed, fillIt, strokeIt) {
      if (closed) g.closePath();
      if (inPath) return;
      if (fillIt !== false && brushStyle()) g.fill(st.fillMode === 2 ? 'nonzero' : 'evenodd');
      if (strokeIt !== false && penStyle()) g.stroke();
      g.beginPath();
    }
    const begin = () => { if (!inPath) g.beginPath(); };

    const api = {
      apply,
      select(index) {
        if (index >= 0x80000000) {
          const n = index - 0x80000000;
          if (n <= 5) st.brush = stockBrushes[n];
          else if (n >= 6 && n <= 8) st.pen = stockPens[n - 6];
          return;
        }
        const object = objects[index];
        if (!object) return;
        if (object.kind === 'pen') st.pen = object;
        else if (object.kind === 'brush') st.brush = object;
        else if (object.kind === 'font') st.font = object;
      },
      create(index, object) { objects[index] = object; },
      // Un objet du WMF : il prend la première case libre de la table.
      add(object) {
        let at = objects.findIndex(o => !o);
        if (at < 0) at = objects.length;
        objects[at] = object;
      },
      remove(index) { objects[index] = null; },
      state: () => st,
      save() { stack.push(cloneState(st)); g.save(); },
      restore(count) {
        for (let i = 0; i < count && stack.length; i++) { st = stack.pop(); g.restore(); }
        apply();
      },
      setWorld(m) { st.world = m; apply(); },
      modifyWorld(m, mode) {
        const w = st.world;
        const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
        if (mode === 1) st.world = [1, 0, 0, 1, 0, 0];
        else if (mode === 2) st.world = mul(m, w);
        else if (mode === 3) st.world = mul(w, m);
        else if (mode === 4) st.world = m;
        apply();
      },
      beginPath() { inPath = true; g.beginPath(); },
      endPath() { inPath = false; },
      closeFigure() { g.closePath(); },
      fillPath() { if (brushStyle()) g.fill(st.fillMode === 2 ? 'nonzero' : 'evenodd'); g.beginPath(); },
      strokePath() { if (penStyle()) g.stroke(); g.beginPath(); },
      strokeFillPath() { if (brushStyle()) g.fill(st.fillMode === 2 ? 'nonzero' : 'evenodd'); if (penStyle()) g.stroke(); g.beginPath(); },
      clipPath() { g.clip(st.fillMode === 2 ? 'nonzero' : 'evenodd'); g.beginPath(); },
      clipRect(l, t, r, b) { g.beginPath(); g.rect(l, t, r - l, b - t); g.clip(); g.beginPath(); },
      moveTo(x, y) { begin(); g.moveTo(x, y); st.cursor = [x, y]; },
      lineTo(x, y) {
        if (!inPath) { g.beginPath(); g.moveTo(st.cursor[0], st.cursor[1]); }
        g.lineTo(x, y);
        st.cursor = [x, y];
        if (!inPath) paint(false, false, true);
      },
      rect(l, t, r, b) { begin(); g.rect(Math.min(l, r), Math.min(t, b), Math.abs(r - l), Math.abs(b - t)); paint(false); },
      roundRect(l, t, r, b, cw, ch) {
        begin();
        const x = Math.min(l, r), y = Math.min(t, b), w = Math.abs(r - l), h = Math.abs(b - t);
        const rx = Math.min(Math.abs(cw) / 2, w / 2), ry = Math.min(Math.abs(ch) / 2, h / 2);
        g.moveTo(x + rx, y);
        g.lineTo(x + w - rx, y); g.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
        g.lineTo(x + w, y + h - ry); g.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
        g.lineTo(x + rx, y + h); g.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
        g.lineTo(x, y + ry); g.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
        paint(true);
      },
      ellipse(l, t, r, b) {
        begin();
        const rx = Math.abs(r - l) / 2, ry = Math.abs(b - t) / 2;
        g.moveTo((l + r) / 2 + rx, (t + b) / 2);
        g.ellipse((l + r) / 2, (t + b) / 2, rx, ry, 0, 0, Math.PI * 2);
        paint(true);
      },
      // Un arc, une corde ou une part : `kind` 'arc' | 'chord' | 'pie', de (x1, y1) à (x2, y2) vus depuis le centre, dans le sens inverse des aiguilles (comme GDI, axe vertical vers le bas).
      arc(kind, l, t, r, b, x1, y1, x2, y2) {
        begin();
        const cx = (l + r) / 2, cy = (t + b) / 2, rx = Math.abs(r - l) / 2, ry = Math.abs(b - t) / 2;
        const angle = (x, y) => Math.atan2((y - cy) / (ry || 1), (x - cx) / (rx || 1));
        const from = angle(x1, y1), to = angle(x2, y2);
        if (kind === 'pie') g.moveTo(cx, cy);
        g.ellipse(cx, cy, rx, ry, 0, from, to, st.arcDir === 1);
        paint(kind !== 'arc', kind !== 'arc', true);
      },
      poly(points, closed, fillIt, strokeIt) {
        if (!points.length) return;
        begin();
        g.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
        st.cursor = points[points.length - 1].slice();
        paint(closed, fillIt, strokeIt);
      },
      // Des segments à la suite du point courant (PolyLineTo).
      polyTo(points) {
        if (!points.length) return;
        if (!inPath) { g.beginPath(); g.moveTo(st.cursor[0], st.cursor[1]); }
        for (const point of points) g.lineTo(point[0], point[1]);
        st.cursor = points[points.length - 1].slice();
        if (!inPath) paint(false, false, true);
      },
      // Des courbes de Bézier : 3 points par courbe, depuis le point courant (`to`) ou le premier point.
      bezier(points, to) {
        begin();
        let at = 0;
        if (to) { if (!inPath) g.moveTo(st.cursor[0], st.cursor[1]); }
        else { g.moveTo(points[0][0], points[0][1]); at = 1; }
        for (; at + 2 < points.length; at += 3) g.bezierCurveTo(points[at][0], points[at][1], points[at + 1][0], points[at + 1][1], points[at + 2][0], points[at + 2][1]);
        st.cursor = points[points.length - 1].slice();
        paint(false, false, true);
      },
      text(x, y, string, dx, options) {
        const font = st.font || { height: -12, face: 'Arial' };
        const size = Math.abs(font.height) || 12;
        const em = font.height > 0 ? size / 1.15 : size;
        g.save();
        g.fillStyle = colorOf(st.textColor);
        g.font = (font.italic ? 'italic ' : '') + (font.weight >= 600 ? 'bold ' : '') + em + 'px ' + font.family;
        const align = st.textAlign;
        const horizontal = align & 6;
        const vertical = align & 24;
        g.textAlign = horizontal === 6 ? 'center' : (horizontal === 2 ? 'right' : 'left');
        g.textBaseline = vertical === 24 ? 'alphabetic' : (vertical === 8 ? 'bottom' : 'top');
        const origin = (align & 1) ? st.cursor : [x, y];
        g.translate(origin[0], origin[1]);
        if (g.getTransform().d < 0) g.scale(1, -1); // un axe vertical qui monte (MM_LOMETRIC...) : le texte reste à l'endroit
        if (font.escapement) g.rotate(-font.escapement / 10 * Math.PI / 180);
        if (options && (options & 2) && st.bkMode === 2) {
          const width = dx ? dx.reduce((a, b) => a + b, 0) : g.measureText(string).width;
          g.fillStyle = colorOf(st.bkColor);
          g.fillRect(horizontal === 6 ? -width / 2 : (horizontal === 2 ? -width : 0), vertical === 24 ? -em : (vertical === 8 ? -em : 0), width, em * 1.2);
          g.fillStyle = colorOf(st.textColor);
        }
        if (dx && dx.length === string.length && string.length > 1) {
          // Chaque lettre à sa place (le tableau d'espacements du fichier), du bord où le texte est aligné.
          const total = dx.reduce((a, b) => a + b, 0);
          let at = horizontal === 6 ? -total / 2 : (horizontal === 2 ? -total : 0);
          g.textAlign = 'left';
          for (let i = 0; i < string.length; i++) { g.fillText(string[i], at, 0); at += dx[i]; }
        } else {
          g.fillText(string, 0, 0);
        }
        if (font.underline || font.strike) {
          const width = g.measureText(string).width;
          const left = horizontal === 6 ? -width / 2 : (horizontal === 2 ? -width : 0);
          g.strokeStyle = g.fillStyle;
          g.lineWidth = Math.max(em / 14, pixelSize());
          const base = vertical === 24 ? 0 : (vertical === 8 ? -em : em * 0.85);
          if (font.underline) { g.beginPath(); g.moveTo(left, base + em * 0.12); g.lineTo(left + width, base + em * 0.12); g.stroke(); }
          if (font.strike) { g.beginPath(); g.moveTo(left, base - em * 0.3); g.lineTo(left + width, base - em * 0.3); g.stroke(); }
        }
        g.restore();
      },
      image(bitmap, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!bitmap || !dw || !dh) return;
        g.save();
        g.imageSmoothingEnabled = true;
        g.translate(dx + (dw < 0 ? -dw : 0) * 0, dy);
        g.scale(dw < 0 ? -1 : 1, dh < 0 ? -1 : 1);
        g.drawImage(bitmap, sx, sy, sw, sh, dw < 0 ? dw : 0, dh < 0 ? dh : 0, Math.abs(dw), Math.abs(dh));
        g.restore();
      },
      fillRectWithBrush(l, t, w, h) { if (brushStyle()) g.fillRect(l, t, w, h); },
    };
    return api;
  }

  // --- Les images (DIB) -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // Une image d'un enregistrement, en `ImageBitmap` ou canvas : un DIB (BITMAPINFOHEADER et ses points : 1, 4, 8, 16, 24 ou 32 bits, ou une image PNG ou JPEG) ou null.
  async function bitmapOf(view, bytes, infoAt, infoSize, bitsAt, bitsSize) {
    try {
      if (!infoAt || !bitsAt || infoAt + 40 > view.byteLength) return null;
      const headerSize = view.getUint32(infoAt, true);
      let width, height, planes, depth, compression, colorsUsed;
      if (headerSize === 12) {
        width = view.getUint16(infoAt + 4, true);
        height = view.getUint16(infoAt + 6, true);
        depth = view.getUint16(infoAt + 10, true);
        compression = 0;
        colorsUsed = 0;
      } else {
        width = view.getInt32(infoAt + 4, true);
        height = view.getInt32(infoAt + 8, true);
        planes = view.getUint16(infoAt + 12, true);
        depth = view.getUint16(infoAt + 14, true);
        compression = view.getUint32(infoAt + 16, true);
        colorsUsed = view.getUint32(infoAt + 32, true);
      }
      const bottomUp = height > 0;
      const rows = Math.abs(height);
      if (!width || !rows || width * rows > MAX_BITMAP_PX) return null;
      if (compression === 4 || compression === 5) {
        const blob = new Blob([bytes.subarray(bitsAt, bitsAt + (bitsSize || bytes.length - bitsAt))], { type: compression === 4 ? 'image/jpeg' : 'image/png' });
        return await createImageBitmap(blob);
      }
      if (compression !== 0 && compression !== 3) return null;
      const colorCount = headerSize === 12 ? (depth <= 8 ? 1 << depth : 0) : (colorsUsed || (depth <= 8 ? 1 << depth : 0));
      const paletteAt = infoAt + headerSize + (compression === 3 && headerSize === 40 ? 12 : 0);
      const entry = headerSize === 12 ? 3 : 4;
      const palette = [];
      for (let i = 0; i < colorCount && paletteAt + i * entry + 2 < view.byteLength; i++) palette.push([view.getUint8(paletteAt + i * entry + 2), view.getUint8(paletteAt + i * entry + 1), view.getUint8(paletteAt + i * entry)]);
      let masks = null;
      if (compression === 3) masks = [view.getUint32(infoAt + headerSize, true), view.getUint32(infoAt + headerSize + 4, true), view.getUint32(infoAt + headerSize + 8, true)];
      const stride = Math.floor((width * depth + 31) / 32) * 4;
      if (bitsAt + stride * rows > view.byteLength + 3) return null;
      const out = new Uint8ClampedArray(width * rows * 4);
      const shiftOf = mask => { let n = 0; while (mask && !(mask & 1)) { mask >>>= 1; n++; } return [n, mask]; };
      const channel = (value, shifted) => (shifted[1] ? Math.round(((value >>> shifted[0]) & shifted[1]) * 255 / shifted[1]) : 0);
      const shifts = masks ? masks.map(shiftOf) : null;
      let anyAlpha = false;
      for (let y = 0; y < rows; y++) {
        const rowAt = bitsAt + (bottomUp ? rows - 1 - y : y) * stride;
        for (let x = 0; x < width; x++) {
          let r = 0, g = 0, b = 0, a = 255;
          if (depth === 24) { b = view.getUint8(rowAt + x * 3); g = view.getUint8(rowAt + x * 3 + 1); r = view.getUint8(rowAt + x * 3 + 2); }
          else if (depth === 32) {
            if (shifts) { const v = view.getUint32(rowAt + x * 4, true); r = channel(v, shifts[0]); g = channel(v, shifts[1]); b = channel(v, shifts[2]); }
            else { b = view.getUint8(rowAt + x * 4); g = view.getUint8(rowAt + x * 4 + 1); r = view.getUint8(rowAt + x * 4 + 2); a = view.getUint8(rowAt + x * 4 + 3); if (a) anyAlpha = true; }
          } else if (depth === 16) {
            const v = view.getUint16(rowAt + x * 2, true);
            if (shifts) { r = channel(v, shifts[0]); g = channel(v, shifts[1]); b = channel(v, shifts[2]); }
            else { r = Math.round(((v >> 10) & 31) * 255 / 31); g = Math.round(((v >> 5) & 31) * 255 / 31); b = Math.round((v & 31) * 255 / 31); }
          } else if (depth === 8) { const entry = palette[view.getUint8(rowAt + x)] || [0, 0, 0]; r = entry[0]; g = entry[1]; b = entry[2]; }
          else if (depth === 4) { const byte = view.getUint8(rowAt + (x >> 1)); const entry = palette[(x & 1) ? byte & 15 : byte >> 4] || [0, 0, 0]; r = entry[0]; g = entry[1]; b = entry[2]; }
          else if (depth === 1) { const byte = view.getUint8(rowAt + (x >> 3)); const entry = palette[(byte >> (7 - (x & 7))) & 1] || [0, 0, 0]; r = entry[0]; g = entry[1]; b = entry[2]; }
          else return null;
          const at = (y * width + x) * 4;
          out[at] = r; out[at + 1] = g; out[at + 2] = b; out[at + 3] = a;
        }
      }
      // Un DIB de 32 bits sans canal alpha écrit (tout à zéro) est opaque.
      if (depth === 32 && !shifts && !anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = rows;
      canvas.getContext('2d').putImageData(new ImageData(out, width, rows), 0, 0);
      return canvas;
    } catch (e) {
      return null;
    }
  }

  // --- EMF ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const fontOf = (face, height, weight, italic, underline, strike, escapement) => {
    const name = String(face || '').replace(/\0.*$/, '').trim();
    const generic = /times|georgia|cambria|garamond|palatino|serif$/i.test(name) && !/sans/i.test(name) ? 'serif' : (/courier|consolas|mono/i.test(name) ? 'monospace' : 'sans-serif');
    return { kind: 'font', height, weight, italic, underline, strike, escapement, family: (name ? '"' + name.replace(/"/g, '') + '", ' : '') + 'Arial, ' + generic };
  };
  const utf16 = (view, at, count) => { let s = ''; for (let i = 0; i < count && at + i * 2 + 1 < view.byteLength; i++) s += String.fromCharCode(view.getUint16(at + i * 2, true)); return s; };
  const latin = (view, at, count) => { let s = ''; for (let i = 0; i < count && at + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(at + i)); return s; };

  async function renderEmf(bytes, maxPx) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 88 || view.getUint32(0, true) !== 1 || view.getUint32(40, true) !== 0x464d4520) return null;
    const i32 = at => view.getInt32(at, true);
    const bounds = [i32(8), i32(12), i32(16), i32(20)];
    const frame = [i32(24), i32(28), i32(32), i32(36)];
    const deviceW = i32(72) || 1024;
    const deviceH = i32(76) || 768;
    const mmW = i32(80) || 320;
    const mmH = i32(84) || 240;
    const pxPerMmX = deviceW / mmW;
    const pxPerMmY = deviceH / mmH;
    // Le rectangle que l'image montre : le cadre (en centièmes de millimètre) en pixels d'appareil, sinon les bornes du dessin.
    let box = frame[2] > frame[0] && frame[3] > frame[1] ? [frame[0] / 100 * pxPerMmX, frame[1] / 100 * pxPerMmY, frame[2] / 100 * pxPerMmX, frame[3] / 100 * pxPerMmY] : bounds.slice();
    if (!(box[2] > box[0] && box[3] > box[1])) box = bounds.slice();
    if (!(box[2] > box[0] && box[3] > box[1])) return null;
    const boxW = box[2] - box[0];
    const boxH = box[3] - box[1];
    // L'image rendue : jusqu'à trois fois la taille de l'écran du fichier (les dessins d'un fichier sont à 96 points par pouce), au plus `maxPx` sur son grand côté.
    const factor = Math.min(maxPx / Math.max(boxW, boxH), 3);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(boxW * factor);
    canvas.height = Math.round(boxH * factor);
    if (canvas.width < 1 || canvas.height < 1) return null;
    const g = canvas.getContext('2d');
    const base = [factor, 0, 0, factor, -box[0] * factor, -box[1] * factor];
    const painter = createPainter(g, base, { pxPerMmX, pxPerMmY });
    painter.apply();
    const st = painter.state;
    let at = 0;
    let drawn = 0;
    let count = 0;
    let onlyPlus = true;
    const point32 = (o) => [i32(o), i32(o + 4)];
    const points32 = (o, n) => { const list = []; for (let i = 0; i < n && o + i * 8 + 7 < view.byteLength; i++) list.push([i32(o + i * 8), i32(o + i * 8 + 4)]); return list; };
    const points16 = (o, n) => { const list = []; for (let i = 0; i < n && o + i * 4 + 3 < view.byteLength; i++) list.push([view.getInt16(o + i * 4, true), view.getInt16(o + i * 4 + 2, true)]); return list; };
    while (at + 8 <= bytes.byteLength && count++ < MAX_RECORDS) {
      const type = view.getUint32(at, true);
      const size = view.getUint32(at + 4, true);
      if (size < 8 || at + size > bytes.byteLength) break;
      const body = at + 8; // le début des données de l'enregistrement
      switch (type) {
        case 14: at = bytes.byteLength; break;
        case 9: st().winExt = [i32(body), i32(body + 4)]; painter.apply(); break;
        case 10: st().winOrg = [i32(body), i32(body + 4)]; painter.apply(); break;
        case 11: st().vpExt = [i32(body), i32(body + 4)]; painter.apply(); break;
        case 12: st().vpOrg = [i32(body), i32(body + 4)]; painter.apply(); break;
        case 17: st().mapMode = view.getUint32(body, true); painter.apply(); break;
        case 18: st().bkMode = view.getUint32(body, true); break;
        case 19: st().fillMode = view.getUint32(body, true); break;
        case 22: st().textAlign = view.getUint32(body, true); break;
        case 24: st().textColor = view.getUint32(body, true); break;
        case 25: st().bkColor = view.getUint32(body, true); break;
        case 27: painter.moveTo(i32(body), i32(body + 4)); break;
        case 54: painter.lineTo(i32(body), i32(body + 4)); drawn++; break;
        case 30: painter.clipRect(i32(body), i32(body + 4), i32(body + 8), i32(body + 12)); break;
        case 33: painter.save(); break;
        case 34: painter.restore(Math.max(1, -view.getInt32(body, true))); break;
        case 35: painter.setWorld([view.getFloat32(body, true), view.getFloat32(body + 4, true), view.getFloat32(body + 8, true), view.getFloat32(body + 12, true), view.getFloat32(body + 16, true), view.getFloat32(body + 20, true)]); break;
        case 36: painter.modifyWorld([view.getFloat32(body, true), view.getFloat32(body + 4, true), view.getFloat32(body + 8, true), view.getFloat32(body + 12, true), view.getFloat32(body + 16, true), view.getFloat32(body + 20, true)], view.getUint32(body + 24, true)); break;
        case 37: painter.select(view.getUint32(body, true)); break;
        case 38: painter.create(view.getUint32(body, true), { kind: 'pen', style: view.getUint32(body + 4, true), width: i32(body + 8), color: view.getUint32(body + 16, true) }); break;
        case 95: {
          // EMR_EXTCREATEPEN : ihPen, offBmi, cbBmi, offBits, cbBits, puretype { style, width, brush style, color, hatch }
          const style = view.getUint32(body + 20, true);
          painter.create(view.getUint32(body, true), { kind: 'pen', style: style & 15, width: view.getUint32(body + 24, true), color: view.getUint32(body + 32, true), cap: ({ 0: 'round', 256: 'butt', 512: 'square' })[style & 0xf00] || 'round', join: ({ 0: 'round', 4096: 'bevel', 8192: 'miter' })[style & 0xf000] || 'round' });
          break;
        }
        case 39: painter.create(view.getUint32(body, true), { kind: 'brush', style: view.getUint32(body + 4, true), color: view.getUint32(body + 8, true), hatch: view.getUint32(body + 12, true) }); break;
        case 40: painter.remove(view.getUint32(body, true)); break;
        case 82: {
          // EMR_EXTCREATEFONTINDIRECTW : ihFont puis le LOGFONTW (hauteur, largeur, inclinaison, orientation, graisse, italique, souligné, barré, jeu, ..., nom sur 32 caractères)
          const logfont = body + 4;
          painter.create(view.getUint32(body, true), fontOf(utf16(view, logfont + 28, 32), i32(logfont), i32(logfont + 16), view.getUint8(logfont + 20) !== 0, view.getUint8(logfont + 21) !== 0, view.getUint8(logfont + 22) !== 0, i32(logfont + 8)));
          break;
        }
        case 43: painter.rect(i32(body), i32(body + 4), i32(body + 8), i32(body + 12)); drawn++; break;
        case 44: painter.roundRect(i32(body), i32(body + 4), i32(body + 8), i32(body + 12), i32(body + 16), i32(body + 20)); drawn++; break;
        case 42: painter.ellipse(i32(body), i32(body + 4), i32(body + 8), i32(body + 12)); drawn++; break;
        case 45: case 46: case 47: painter.arc(type === 45 ? 'arc' : (type === 46 ? 'chord' : 'pie'), i32(body), i32(body + 4), i32(body + 8), i32(body + 12), i32(body + 16), i32(body + 20), i32(body + 24), i32(body + 28)); drawn++; break;
        case 57: st().arcDir = view.getUint32(body, true) === 2 ? 2 : 1; break;
        case 3: painter.poly(points32(body + 20, view.getUint32(body + 16, true)), true); drawn++; break;
        case 4: painter.poly(points32(body + 20, view.getUint32(body + 16, true)), false, false, true); drawn++; break;
        case 6: painter.polyTo(points32(body + 20, view.getUint32(body + 16, true))); drawn++; break;
        case 2: painter.bezier(points32(body + 20, view.getUint32(body + 16, true)), false); drawn++; break;
        case 5: painter.bezier(points32(body + 20, view.getUint32(body + 16, true)), true); drawn++; break;
        case 86: painter.poly(points16(body + 20, view.getUint32(body + 16, true)), true); drawn++; break;
        case 87: painter.poly(points16(body + 20, view.getUint32(body + 16, true)), false, false, true); drawn++; break;
        case 89: painter.polyTo(points16(body + 20, view.getUint32(body + 16, true))); drawn++; break;
        case 85: painter.bezier(points16(body + 20, view.getUint32(body + 16, true)), false); drawn++; break;
        case 88: painter.bezier(points16(body + 20, view.getUint32(body + 16, true)), true); drawn++; break;
        case 7: case 8: case 90: case 91: {
          const wide = type === 90 || type === 91;
          const closed = type === 8 || type === 91;
          const polys = view.getUint32(body + 16, true);
          const lengths = [];
          for (let i = 0; i < polys; i++) lengths.push(view.getUint32(body + 24 + i * 4, true));
          let from = body + 24 + polys * 4;
          if (closed) {
            // Plusieurs contours dans UN seul remplissage (les trous restent des trous).
            painter.beginPath();
            for (const n of lengths) {
              const list = wide ? points16(from, n) : points32(from, n);
              from += n * (wide ? 4 : 8);
              painter.poly(list, true, false, false);
            }
            painter.endPath();
            painter.strokeFillPath();
          } else {
            for (const n of lengths) {
              const list = wide ? points16(from, n) : points32(from, n);
              from += n * (wide ? 4 : 8);
              painter.poly(list, false, false, true);
            }
          }
          drawn++;
          break;
        }
        case 59: painter.beginPath(); break;
        case 60: painter.endPath(); break;
        case 61: painter.closeFigure(); break;
        case 62: painter.fillPath(); drawn++; break;
        case 63: painter.strokeFillPath(); drawn++; break;
        case 64: painter.strokePath(); drawn++; break;
        case 67: painter.clipPath(); break;
        case 83: case 84: {
          // EMR_EXTTEXTOUTA/W : bornes, mode, échelles, puis le texte { référence, nombre de caractères, position du texte, options, rectangle, position des espacements }
          const t = body + 28;
          const n = view.getUint32(t + 8, true);
          const textAt = at + view.getUint32(t + 12, true);
          const dxAt = at + view.getUint32(t + 36, true);
          const string = type === 84 ? utf16(view, textAt, n) : latin(view, textAt, n);
          let dx = null;
          if (view.getUint32(t + 36, true) && dxAt + n * 4 <= bytes.byteLength) { dx = []; for (let i = 0; i < n; i++) dx.push(view.getInt32(dxAt + i * 4, true)); }
          painter.text(i32(t), i32(t + 4), string, dx, view.getUint32(t + 16, true));
          if (string.trim()) drawn++;
          break;
        }
        case 81: {
          // EMR_STRETCHDIBITS : bornes, destination, source, puis le DIB
          const bitmap = await bitmapOf(view, bytes, at + view.getUint32(body + 40, true), view.getUint32(body + 44, true), at + view.getUint32(body + 48, true), view.getUint32(body + 52, true));
          if (bitmap) {
            const sw = i32(body + 32), sh = i32(body + 36);
            const bw = bitmap.width, bh = bitmap.height;
            painter.image(bitmap, Math.max(0, i32(body + 24)), Math.max(0, i32(body + 28)), Math.min(bw, sw || bw), Math.min(bh, sh || bh), i32(body + 16), i32(body + 20), i32(body + 64), i32(body + 68));
            drawn++;
          }
          break;
        }
        case 76: case 77: case 80: {
          // EMR_BITBLT / EMR_STRETCHBLT : bornes, destination (x, y, largeur, hauteur), opération, source (x, y), transformation, couleur, usage, puis le DIB
          if (type === 80) break;
          const rop = view.getUint32(body + 32, true);
          const x = i32(body + 16), y = i32(body + 20), w = i32(body + 24), h = i32(body + 28);
          const bmiAt = view.getUint32(body + 76, true);
          if (bmiAt) {
            const bitmap = await bitmapOf(view, bytes, at + bmiAt, view.getUint32(body + 80, true), at + view.getUint32(body + 84, true), view.getUint32(body + 88, true));
            if (bitmap) {
              const sw = type === 77 ? i32(body + 92) : bitmap.width;
              const sh = type === 77 ? i32(body + 96) : bitmap.height;
              painter.image(bitmap, Math.max(0, i32(body + 36)), Math.max(0, i32(body + 40)), Math.min(bitmap.width, sw || bitmap.width), Math.min(bitmap.height, sh || bitmap.height), x, y, w, h);
              drawn++;
            }
          } else if (rop === 0x00f00021) { painter.fillRectWithBrush(x, y, w, h); drawn++; }
          else if (rop === 0x00ff0062) { const keep = st().brush; painter.select(0x80000000); painter.fillRectWithBrush(x, y, w, h); st().brush = keep; drawn++; }
          else if (rop === 0x00000042) { const keep = st().brush; painter.select(0x80000004); painter.fillRectWithBrush(x, y, w, h); st().brush = keep; drawn++; }
          break;
        }
        case 70: {
          // EMR_COMMENT : « EMF+ » est le dessin moderne d'Office ; les fichiers « double » gardent aussi les enregistrements GDI qu'on rejoue, les autres n'ont rien d'autre.
          if (view.getUint32(body + 4, true) !== 0x2b464d45) onlyPlus = false;
          break;
        }
        default: break;
      }
      at += size;
    }
    if (!drawn) return null;
    void onlyPlus;
    return { canvas, width: canvas.width, height: canvas.height };
  }

  // --- WMF ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function renderWmf(bytes, maxPx) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 0;
    let box = null;
    let inch = 1440;
    if (bytes.byteLength > 22 && view.getUint32(0, true) === 0x9ac6cdd7) {
      box = [view.getInt16(6, true), view.getInt16(8, true), view.getInt16(10, true), view.getInt16(12, true)];
      inch = view.getUint16(14, true) || 1440;
      at = 22;
    }
    if (at + 18 > bytes.byteLength) return null;
    const headerWords = view.getUint16(at + 2, true);
    if (view.getUint16(at, true) > 2 || headerWords !== 9) return null;
    at += headerWords * 2;
    const i16 = o => view.getInt16(o, true);
    // Les enregistrements une première fois pour la fenêtre (sans placeable header, la taille est celle de SETWINDOWEXT).
    let winExt = null;
    let winOrg = [0, 0];
    for (let scan = at, guard = 0; scan + 6 <= bytes.byteLength && guard++ < MAX_RECORDS;) {
      const words = view.getUint32(scan, true);
      const fn = view.getUint16(scan + 4, true);
      if (words < 3 || scan + words * 2 > bytes.byteLength) break;
      if (fn === 0x020c) winExt = [i16(scan + 8), i16(scan + 6)];
      if (fn === 0x020b) winOrg = [i16(scan + 8), i16(scan + 6)];
      if (fn === 0) break;
      scan += words * 2;
    }
    if (!box) { if (!winExt) return null; box = [winOrg[0], winOrg[1], winOrg[0] + winExt[0], winOrg[1] + winExt[1]]; }
    const w = box[2] - box[0];
    const h = box[3] - box[1];
    if (!w || !h) return null;
    const left = Math.min(box[0], box[2]);
    const top = Math.min(box[1], box[3]);
    const boxW = Math.abs(w);
    const boxH = Math.abs(h);
    const factor = Math.min(maxPx / Math.max(boxW, boxH), 3 * 96 / Math.max(1, inch));
    const scaleUp = Math.max(factor, 1e-6);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(boxW * scaleUp));
    canvas.height = Math.max(1, Math.round(boxH * scaleUp));
    const g = canvas.getContext('2d');
    const base = [scaleUp, 0, 0, scaleUp, -left * scaleUp, -top * scaleUp];
    const painter = createPainter(g, base, { pxPerMmX: 1, pxPerMmY: 1 });
    painter.apply();
    const st = painter.state;
    let drawn = 0;
    const points16 = (o, n) => { const list = []; for (let i = 0; i < n && o + i * 4 + 3 < view.byteLength; i++) list.push([i16(o + i * 4), i16(o + i * 4 + 2)]); return list; };
    for (let count = 0; at + 6 <= bytes.byteLength && count++ < MAX_RECORDS;) {
      const words = view.getUint32(at, true);
      const fn = view.getUint16(at + 4, true);
      if (words < 3 || at + words * 2 > bytes.byteLength) break;
      const body = at + 6;
      switch (fn) {
        case 0x0000: at = bytes.byteLength; break;
        case 0x020b: st().winOrg = [i16(body + 2), i16(body)]; painter.apply(); break;
        case 0x020c: st().winExt = [i16(body + 2), i16(body)]; st().vpExt = [i16(body + 2), i16(body)]; painter.apply(); break;
        case 0x0102: st().bkMode = view.getUint16(body, true); break;
        case 0x0106: st().fillMode = view.getUint16(body, true); break;
        case 0x0209: st().textColor = view.getUint32(body, true); break;
        case 0x0201: st().bkColor = view.getUint32(body, true); break;
        case 0x012e: st().textAlign = view.getUint16(body, true); break;
        case 0x001e: painter.save(); break;
        case 0x0127: painter.restore(Math.max(1, -i16(body))); break;
        case 0x0214: painter.moveTo(i16(body + 2), i16(body)); break;
        case 0x0213: painter.lineTo(i16(body + 2), i16(body)); drawn++; break;
        case 0x02fa: painter.add({ kind: 'pen', style: view.getUint16(body, true), width: i16(body + 2), color: view.getUint32(body + 6, true) }); break;
        case 0x02fc: painter.add({ kind: 'brush', style: view.getUint16(body, true), color: view.getUint32(body + 2, true), hatch: view.getUint16(body + 6, true) }); break;
        case 0x02fb: {
          const logfont = body;
          painter.add(fontOf(latin(view, logfont + 18, 32), i16(logfont), i16(logfont + 8), view.getUint8(logfont + 10) !== 0, view.getUint8(logfont + 11) !== 0, view.getUint8(logfont + 12) !== 0, i16(logfont + 4)));
          break;
        }
        case 0x00f7: case 0x00f8: case 0x02fb + 0x1000: painter.add({ kind: 'other' }); break;
        case 0x012d: painter.select(view.getUint16(body, true)); break;
        case 0x01f0: painter.remove(view.getUint16(body, true)); break;
        case 0x041b: painter.rect(i16(body + 6), i16(body + 4), i16(body + 2), i16(body)); drawn++; break;
        case 0x0418: painter.ellipse(i16(body + 6), i16(body + 4), i16(body + 2), i16(body)); drawn++; break;
        case 0x061c: painter.roundRect(i16(body + 10), i16(body + 8), i16(body + 6), i16(body + 4), i16(body + 2), i16(body)); drawn++; break;
        case 0x0324: painter.poly(points16(body + 2, view.getInt16(body, true)), true); drawn++; break;
        case 0x0325: painter.poly(points16(body + 2, view.getInt16(body, true)), false, false, true); drawn++; break;
        case 0x0538: {
          const polys = view.getUint16(body, true);
          let from = body + 2 + polys * 2;
          painter.beginPath();
          for (let i = 0; i < polys; i++) {
            const n = view.getUint16(body + 2 + i * 2, true);
            painter.poly(points16(from, n), true, false, false);
            from += n * 4;
          }
          painter.endPath();
          painter.strokeFillPath();
          drawn++;
          break;
        }
        case 0x0521: {
          const n = view.getInt16(body, true);
          const string = latin(view, body + 2, n);
          const tail = body + 2 + n + (n & 1);
          painter.text(i16(tail + 2), i16(tail), string, null, 0);
          if (string.trim()) drawn++;
          break;
        }
        case 0x0a32: {
          const y = i16(body), x = i16(body + 2), n = view.getInt16(body + 4, true), options = view.getUint16(body + 6, true);
          const textAt = body + 8 + ((options & 6) ? 8 : 0);
          const string = latin(view, textAt, n);
          let dx = null;
          const dxAt = textAt + n + (n & 1);
          if (dxAt + n * 2 <= at + words * 2) { dx = []; for (let i = 0; i < n; i++) dx.push(i16(dxAt + i * 2)); }
          painter.text(x, y, string, dx, options);
          if (string.trim()) drawn++;
          break;
        }
        case 0x0f43: {
          // META_STRETCHDIB : opération (4), usage (2), source (hauteur, largeur, y, x), destination (hauteur, largeur, y, x), puis le DIB
          const dib = body + 22;
          const bitmap = await bitmapOf(view, bytes, dib, 0, dib + (view.getUint32(dib, true) || 40) + ((view.getUint16(dib + 14, true) <= 8) ? 4 * (view.getUint32(dib + 32, true) || (1 << view.getUint16(dib + 14, true))) : 0), 0);
          if (bitmap) { painter.image(bitmap, i16(body + 14), i16(body + 12), Math.min(bitmap.width, i16(body + 10)), Math.min(bitmap.height, i16(body + 8)), i16(body + 20), i16(body + 18), i16(body + 16) * 0 + i16(body + 16), i16(body + 14) * 0 + i16(body + 14)); drawn++; }
          break;
        }
        default: break;
      }
      at += words * 2;
    }
    if (!drawn) return null;
    return { canvas, width: canvas.width, height: canvas.height };
  }

  // --- L'entrée --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function toImage(bytes, kind, options) {
    try {
      const maxPx = clampPx((options && options.maxPx) || MAX_PX);
      let drawing = bytes;
      let type = String(kind || '').toLowerCase();
      if (type === 'emz' || type === 'wmz') {
        drawing = await gunzip(bytes);
        type = type === 'emz' ? 'emf' : 'wmf';
        if (!drawing) return null;
      }
      const painted = type === 'emf' ? await renderEmf(drawing, maxPx) : (type === 'wmf' ? await renderWmf(drawing, maxPx) : null);
      if (!painted) return null;
      return { src: painted.canvas.toDataURL('image/png'), width: painted.width, height: painted.height };
    } catch (e) {
      return null;
    }
  }
  return { toImage };
}());
