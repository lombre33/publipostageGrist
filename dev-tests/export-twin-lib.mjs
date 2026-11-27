// Les « jumeaux » d'un document : ce que la Lecture montre et ce que le PDF (ou un fichier converti en PDF) peint, relus ligne à ligne et comparés.
// Partagé par dev-tests/verify-export-corpus.mjs (le banc sur les modèles réels de la galerie) et ses petits frères (balayage de la limite de page, Word et ODT rendus par LibreOffice).
//
// Une LIGNE ici est un segment de texte d'une même ligne de base : les mots de la Lecture (un rectangle par mot, lu dans le DOM) ou les morceaux de texte du PDF (pdf.js) qui tombent
// sur la même ligne, coupés quand l'écart dépasse deux fois la taille du texte (la gouttière d'une zone à deux colonnes). Toutes les mesures sont en px de mise en page (96 par pouce),
// le PDF étant converti (1 pt = 4/3 px). Le texte se compare SANS espaces (les blancs ne se voient pas) et sans les marques de puce, que la Lecture dessine en CSS et le PDF en forme.
//
// Ce que le banc dit, par page : le nombre de lignes, le texte de chaque ligne (une ligne coupée ailleurs change le texte de deux lignes), la hauteur de chaque ligne depuis la première
// de sa page, l'abscisse du début et de la fin de chaque ligne, les images (nombre, place, taille). L'en-tête et le pied de page se comptent à part (ils ne font pas la page).

const PX_PER_PT = 96 / 72;

// ---- Lecture : lu dans la page, appelé par page.evaluate ----
// Rend { zoom, pages: [{ n, bodyTop, lines: [{ text, l, r, y, size }], images: [{ l, t, w, h }] }], hf: [{ page, text }] }. Les ordonnées sont en px depuis le haut du corps de la page.
export function readerSnapshotInPage() {
  const container = document.getElementById('reader-container');
  const root = container && container.querySelector('.reader-content');
  if (!root) return { error: 'pas de Lecture' };
  const zoom = parseFloat(getComputedStyle(container).getPropertyValue('--pp-fit-zoom')) || 1;
  const seams = Array.from(container.querySelectorAll('.v2-page-band')).map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top);
  const rootRect = root.getBoundingClientRect();
  const edgeTop = container.querySelector('.v2-page-edge-top');
  // Sans en-tête ni pied de page, la Lecture n'a pas de bande au bord de la feuille : le corps commence à la marge, qui est le remplissage de la feuille de texte.
  const sheetTop = edgeTop ? edgeTop.getBoundingClientRect().top : rootRect.top;
  const sheetLeft = rootRect.left;
  const edgeBottom = container.querySelector('.v2-page-edge-bottom');
  const bottomOffset = edgeBottom ? edgeBottom.getBoundingClientRect().height : (parseFloat(getComputedStyle(root).paddingBottom) || 0);
  const bodyTops = [rootRect.top + (parseFloat(getComputedStyle(root).paddingTop) || 0) * zoom].concat(seams.map((r) => r.bottom));
  const pageOf = (y) => { let n = 0; seams.forEach((r) => { if ((r.top + r.bottom) / 2 <= y) n += 1; }); return n; };
  const ctx = document.createElement('canvas').getContext('2d');
  const ascents = new Map();
  const ascentOf = (cs) => {
    const font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if (!ascents.has(font)) { ctx.font = font; ascents.set(font, ctx.measureText('x').fontBoundingBoxAscent); }
    return ascents.get(font);
  };
  const wordsOf = (scope, inOverlay) => {
    const out = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || /^(SCRIPT|STYLE)$/.test(parent.tagName)) continue;
      const text = node.nodeValue;
      if (!/\S/.test(text)) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const ascent = ascentOf(cs);
      const size = parseFloat(cs.fontSize) || 0;
      const re = /\S+/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const range = document.createRange();
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        if (!rects.length) continue;
        if (rects.length === 1) out.push({ t: m[0], l: rects[0].left, r: rects[0].right, base: rects[0].top + ascent * zoom, size: size * zoom, parent });
        else {
          // Un mot qui passe d'une ligne à la suivante (adresse sans espace) : un morceau par ligne, lu caractère par caractère.
          const pieces = [];
          for (let i = 0; i < m[0].length; i += 1) {
            const one = document.createRange();
            one.setStart(node, m.index + i); one.setEnd(node, m.index + i + 1);
            const r = Array.from(one.getClientRects()).find((x) => x.width > 0 && x.height > 0);
            if (!r) continue;
            const last = pieces[pieces.length - 1];
            if (last && Math.abs(last.top - r.top) < 2) { last.t += m[0][i]; last.r = r.right; } else pieces.push({ t: m[0][i], l: r.left, r: r.right, top: r.top });
          }
          pieces.forEach((p) => out.push({ t: p.t, l: p.l, r: p.r, base: p.top + ascent * zoom, size: size * zoom, parent }));
        }
      }
    }
    return out;
  };
  const body = wordsOf(root).map((w) => Object.assign(w, { page: pageOf(w.base) }));
  // L'en-tête et le pied de page : tout ce que la Lecture écrit hors de la feuille de texte (les couches des coutures et les bords).
  const hfWords = [];
  container.querySelectorAll('.v2-page-band, .v2-page-edge-spacer').forEach((band) => {
    wordsOf(band, true).forEach((w) => hfWords.push(Object.assign(w, { page: pageOf(w.base) })));
  });
  const pages = [];
  const total = bodyTops.length;
  for (let i = 0; i < total; i += 1) pages.push({ n: i + 1, bodyTop: bodyTops[i], words: [], images: [] });
  body.forEach((w) => { const p = pages[Math.min(w.page, total - 1)]; p.words.push({ t: w.t, l: w.l, r: w.r, base: w.base, size: w.size }); });
  root.querySelectorAll('img').forEach((img) => {
    const r = img.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(img);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
    const p = pages[Math.min(pageOf((r.top + r.bottom) / 2), total - 1)];
    p.images.push({ l: r.left, t: r.top, w: r.width, h: r.height });
  });
  return {
    zoom, rootLeft: sheetLeft, bodyOffset1: bodyTops[0] - sheetTop, bottomOffset,
    pages: pages.map((p) => ({ n: p.n, bodyTop: p.bodyTop, words: p.words, images: p.images })),
    hf: hfWords.map((w) => ({ page: w.page + 1, text: w.t, base: w.base, l: w.l, r: w.r })),
  };
}

// ---- PDF : lu par pdf.js dans une page à part ----
// La page du widget a une politique de sécurité qui refuse un script d'un CDN qu'elle ne connaît pas : pdf.js se charge dans une page vide du même navigateur, une seule fois par contexte.
const readers = new WeakMap();
export async function readPdf(context, base64) {
  if (!readers.has(context)) {
    const aux = await context.newPage();
    await aux.goto('about:blank');
    await aux.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js' });
    await aux.evaluate(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; });
    readers.set(context, aux);
  }
  return readers.get(context).evaluate(pdfSnapshotInPage, base64);
}

// Rend { pages: [{ n, width, height, items: [{ t, x, base, w, size }], images: [{ l, t, w, h }] }] } en px de mise en page, l'origine au coin haut gauche de la page.
export async function pdfSnapshotInPage(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const K = 96 / 72;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((it) => it.str && it.str.trim()).map((it) => ({
      t: it.str, x: it.transform[4] * K, base: (viewport.height - it.transform[5]) * K, w: it.width * K, size: Math.hypot(it.transform[0], it.transform[1]) * K,
    }));
    const ops = await page.getOperatorList();
    const OPS = window.pdfjsLib.OPS;
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const images = [];
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i]; const args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) images.push({ l: ctm[4] * K, t: (viewport.height - (ctm[5] + ctm[3])) * K, w: Math.abs(ctm[0]) * K, h: Math.abs(ctm[3]) * K });
    }
    pages.push({ n, width: viewport.width * K, height: viewport.height * K, items, images });
  }
  return { pages };
}

// ---- Des mots et des morceaux aux lignes ----
// Les cases à cocher (☐ ☑ ☒) sont des formes à la ligne de base à elles : leur place ne se lit pas avec le texte ; elles sortent du texte comparé (le banc des cases est `checklistBoxAlign`).
const squeeze = (s) => String(s).replace(/[\u2610\u2611\u2612]/g, '').replace(/\s+/g, '');
// Les marques de puce que la Lecture dessine en CSS et que le PDF peut écrire en texte : écartées du texte comparé.
const MARK = /^(?:[•◦▪▫■□☐☑☒✓✔★▸▶►‣⁃·●○–—-]|\d{1,3}[.)]|[a-zA-Z][.)])$/;

// La numérotation d'un titre (« II) », « Article 3 », « 1.a ») est un compteur CSS à la Lecture, du texte dans le PDF : une ligne qui ne diffère que par ce préfixe est la même ligne.
const NUMBERING = /^(?:[IVXLCDM]+[.)]|\d+(?:\.[a-z0-9]+)*[.)]?|[a-z]\)|Article\d+(?:\.[a-z0-9]+)*[.:]?|\d+\.[a-z](?:\.\d+)?)$/;
const sameButNumbering = (a, b) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.length > short.length && long.endsWith(short) && NUMBERING.test(long.slice(0, long.length - short.length));
};

// Des morceaux { t, l, r, base, size } aux lignes { text, l, r, y, size } : même ligne de base (à 2 px près), coupées quand l'écart dépasse deux fois la taille.
export function linesOf(pieces) {
  const sorted = pieces.slice().sort((a, b) => (Math.abs(a.base - b.base) < 2 ? a.l - b.l : a.base - b.base));
  const bands = [];
  sorted.forEach((p) => {
    const band = bands.find((b) => Math.abs(b.base - p.base) < Math.max(2, p.size * 0.18));
    if (band) band.pieces.push(p); else bands.push({ base: p.base, pieces: [p] });
  });
  const lines = [];
  bands.sort((a, b) => a.base - b.base).forEach((band) => {
    const row = band.pieces.sort((a, b) => a.l - b.l);
    let cur = null;
    row.forEach((p) => {
      if (cur && p.l - cur.r <= Math.max(cur.size, p.size) * 2.2) { cur.parts.push(p); cur.r = Math.max(cur.r, p.r); cur.size = Math.max(cur.size, p.size); }
      else { cur = { parts: [p], l: p.l, r: p.r, size: p.size, base: band.base }; lines.push(cur); }
    });
  });
  return lines.map((ln) => {
    const parts = ln.parts.slice();
    // Une marque de puce en tête de ligne n'est pas du texte du document.
    while (parts.length > 1 && MARK.test(parts[0].t)) parts.shift();
    const text = squeeze(parts.map((p) => p.t).join(' '));
    return { text, l: parts[0].l, r: ln.r, y: ln.base, size: ln.size };
  }).filter((ln) => ln.text);
}

// La Lecture : { pages: [{ n, bodyTop, lines, images }], hf } d'un instantané.
export function readerPages(snapshot) {
  // La Lecture se réduit à la largeur du panneau quand la feuille est plus large (paysage, grand format : `--pp-fit-zoom`) : tout ce qu'on lit dans l'écran est ramené à la feuille entière (px du PDF).
  const z = snapshot.zoom || 1;
  return snapshot.pages.map((p) => ({
    n: p.n, bodyTop: p.bodyTop / z, bodyOffset: snapshot.bodyOffset1 / z, bottomOffset: snapshot.bottomOffset / z,
    lines: linesOf(p.words).map((ln) => ({ text: ln.text, l: (ln.l - snapshot.rootLeft) / z, r: (ln.r - snapshot.rootLeft) / z, y: (ln.y - p.bodyTop) / z, size: ln.size / z })),
    images: p.images.map((im) => ({ l: (im.l - snapshot.rootLeft) / z, t: (im.t - p.bodyTop) / z, w: im.w / z, h: im.h / z })),
  }));
}

// Le PDF : mêmes lignes ; ce qui tombe au-dessus du corps de la page (marge + bande de l'en-tête, la même que la Lecture réserve) ou sous lui (bande du pied + marge) est l'en-tête et le pied de page,
// mis de côté. Les ordonnées restent celles de la page : la comparaison retire le haut du corps.
export function pdfPages(snapshot, top, bottom) {
  return snapshot.pages.map((p) => {
    // Un appel de note (« 1 » en exposant) est un compteur CSS à la Lecture, du texte dans le PDF : il sort des lignes (les notes se comptent à part).
    const sizes = p.items.map((it) => Math.round(it.size));
    const common = sizes.sort((x, y) => sizes.filter((v) => v === y).length - sizes.filter((v) => v === x).length)[0] || 0;
    // (Un chiffre seul, petit, collé à un morceau de même taille et de même ligne de base n'est pas un appel de note : c'est le « 1 » de « Page 1 / 2 » d'un pied de page que LibreOffice écrit morceau par morceau.)
    const sameRun = (it) => p.items.some((o) => o !== it && Math.abs(o.base - it.base) < 1 && Math.abs(o.size - it.size) < 0.5 && (Math.abs(o.x + o.w - it.x) < 6 || Math.abs(it.x + it.w - o.x) < 6));
    const items = p.items.filter((it) => !(/^\d{1,3}$/.test(it.t.trim()) && it.size < common * 0.8 && !sameRun(it)));
    const all = linesOf(items.map((it) => ({ t: it.t, l: it.x, r: it.x + it.w, base: it.base, size: it.size })));
    const isHf = (ln) => ln.y < top - 1 || ln.y > p.height - bottom + 1;
    const inBody = (im) => { const mid = im.t + im.h / 2; return mid >= top - 1 && mid <= p.height - bottom + 1; };
    return { n: p.n, width: p.width, height: p.height, lines: all.filter((ln) => !isHf(ln)), hf: all.filter(isHf), images: p.images.filter(inBody), hfImages: p.images.filter((im) => !inBody(im)) };
  });
}

// ---- La comparaison ----
// `tol` : { dy, gap, dx, dImg } en px. Trois mesures de hauteur :
//   - `dy` : l'écart d'une ligne depuis le haut du CORPS de sa page (la Lecture le sait, le PDF réserve la même bande à chaque page) ; au-delà de `dy` + 7,5 % de la taille du texte (la ligne de base se
//     pose un peu plus haut dans le PDF, d'autant plus que le texte est grand, sans que la page change), la ligne n'est pas où la Lecture la met ;
//   - `gap` : l'écart d'un PAS entre deux lignes qui se suivent (la distance entre elles dans le PDF moins celle de la Lecture) ; c'est là que l'écart naît, et c'est lui qui, additionné sur la page,
//     déplace une coupure. Il se lit bien plus finement (0,7 px) : les deux lignes ont le même biais de lecture, il s'annule.
// Les abscisses se comparent depuis le bord gauche de la feuille (`dx`) ; les images par leur nombre et leur taille (`dImg`).
export function compareTwins(reader, pdf, tol) {
  const t = Object.assign({ dy: 1.3, gap: 0.7, dx: 1.2, dImg: 1.5 }, tol || {});
  const diffs = [];
  const note = (kind, page, detail, amount) => diffs.push({ kind, page, detail, amount: amount == null ? null : Math.round(amount * 100) / 100 });
  const r2 = (x) => Math.round(x * 100) / 100;
  // La Lecture rend un dernier jeu de page vide quand le document finit juste avant une coupure : une page sans ligne ni image à la fin n'est pas une page de plus.
  const trimmedReader = reader.slice();
  while (trimmedReader.length > 1 && !trimmedReader[trimmedReader.length - 1].lines.length && !trimmedReader[trimmedReader.length - 1].images.length) trimmedReader.pop();
  if (trimmedReader.length !== pdf.length) note('pages', 0, 'Lecture ' + trimmedReader.length + ' page(s), PDF ' + pdf.length, pdf.length - trimmedReader.length);
  const top = reader.length ? reader[0].bodyOffset : 0;
  const count = Math.min(trimmedReader.length, pdf.length);
  let maxDy = 0; let maxGap = 0; let maxDx = 0; let firstDy = null;
  for (let i = 0; i < count; i += 1) {
    const L = trimmedReader[i]; const P = pdf[i];
    if (L.lines.length !== P.lines.length) note('lines', i + 1, 'Lecture ' + L.lines.length + ' ligne(s), PDF ' + P.lines.length, P.lines.length - L.lines.length);
    const m = Math.min(L.lines.length, P.lines.length);
    let prev = null;
    for (let k = 0; k < m; k += 1) {
      const a = L.lines[k]; const b = P.lines[k];
      const numbered = a.text !== b.text && sameButNumbering(a.text, b.text);
      if (a.text !== b.text && !numbered) { note('text', i + 1, 'ligne ' + (k + 1) + ' : Lecture « ' + a.text.slice(0, 50) + ' » / PDF « ' + b.text.slice(0, 50) + ' »'); prev = null; continue; }
      const dy = (b.y - top) - a.y;
      if (firstDy === null) firstDy = dy;
      const dl = b.l - a.l; const dr = b.r - a.r;
      if (Math.abs(dy) > maxDy) maxDy = Math.abs(dy);
      const worstX = numbered ? 0 : Math.max(Math.abs(dl), Math.abs(dr));
      if (worstX > maxDx) maxDx = worstX;
      // Le pas depuis la ligne d'avant (la même paire de lignes dans les deux rendus : l'ordre est celui de la page, de haut en bas puis de gauche à droite).
      // Deux lignes de tailles différentes ne portent pas leur ligne de base au même endroit de leur boîte (la distance entre elles bouge de moins d'un dixième de la taille sans que la page change) :
      // le pas ne se lit qu'entre deux lignes de même taille ; `dy` couvre le reste.
      if (prev && Math.abs(prev.a.size - a.size) < 0.5) {
        const gap = (b.y - prev.b.y) - (a.y - prev.a.y);
        if (Math.abs(gap) > maxGap) maxGap = Math.abs(gap);
        if (Math.abs(gap) > t.gap) note('gap', i + 1, 'entre la ligne ' + k + ' et la ligne ' + (k + 1) + ' « ' + a.text.slice(0, 30) + ' » (' + Math.round(a.size) + ' px) : le PDF est ' + (gap < 0 ? 'plus serré' : 'plus aéré') + ' de ' + r2(Math.abs(gap)) + ' px', gap);
      }
      prev = { a, b };
      if (Math.abs(dy) > t.dy + a.size * 0.075) note('dy', i + 1, 'ligne ' + (k + 1) + ' « ' + a.text.slice(0, 30) + ' » (' + Math.round(a.size) + ' px) : ' + r2(dy) + ' px depuis le haut du corps', dy);
      if (worstX > t.dx) note('dx', i + 1, 'ligne ' + (k + 1) + ' « ' + a.text.slice(0, 30) + ' » : début ' + r2(dl) + ', fin ' + r2(dr) + ' px', worstX);
    }
    if (L.images.length !== P.images.length) note('images', i + 1, 'Lecture ' + L.images.length + ' image(s), PDF ' + P.images.length, P.images.length - L.images.length);
    else {
      const byPos = (x) => x.slice().sort((p, q) => (Math.abs(p.t - q.t) < 2 ? p.l - q.l : p.t - q.t));
      const la = byPos(L.images); const pb = byPos(P.images);
      la.forEach((img, k) => {
        const o = pb[k];
        const dw = o.w - img.w; const dh = o.h - img.h;
        if (Math.abs(dw) > t.dImg || Math.abs(dh) > t.dImg) note('imageSize', i + 1, 'image ' + (k + 1) + ' : ' + r2(dw) + ' x ' + r2(dh) + ' px', Math.max(Math.abs(dw), Math.abs(dh)));
        const dt = (o.t - top) - img.t; const dl = o.l - img.l;
        if (Math.abs(dt) > t.dy || Math.abs(dl) > t.dx) note('imagePos', i + 1, 'image ' + (k + 1) + ' : ' + r2(dl) + ' px à droite, ' + r2(dt) + ' px plus bas', Math.max(Math.abs(dt), Math.abs(dl)));
      });
    }
  }
  return { diffs, firstDy: firstDy == null ? 0 : r2(firstDy), maxDy: r2(maxDy), maxGap: r2(maxGap), maxDx: r2(maxDx), pages: { reader: trimmedReader.length, pdf: pdf.length } };
}

// ---- Word et ODT : la page de chaque morceau de texte, pas son millimètre ----
// `ref` : les pages du PDF du widget (pdfPages), `other` : celles du même document en Word ou en ODT, rendu par LibreOffice (dev-tests/libreoffice-lib.mjs), coupées de la même façon (le haut et le bas
// du corps sont ceux de la Lecture : les marges et la bande de l'en-tête sont les mêmes dans les trois fichiers).
// LibreOffice n'est pas notre PDF : il coupe les lignes et pose les traits à sa façon. Ce qui se compare est donc ce qui ne dépend pas de la façon de couper :
//   - le nombre de pages ;
//   - sur chaque page, les LETTRES et chiffres qui s'y trouvent (un histogramme : insensible à la coupure des lignes et à l'ordre) : un paragraphe qui change de page, un texte perdu ou en trop, se lisent à la page ;
//   - les lignes du PDF (au moins 8 signes) qu'on ne retrouve pas dans la page de l'autre fichier : de quoi dire QUOI a bougé ;
//   - les images de chaque page (le nombre) ;
//   - l'en-tête et le pied de chaque page (le texte).
const letters = (s) => s.replace(/[^\p{L}\p{N}]/gu, '');
const noDigits = (s) => letters(s).replace(/\p{N}/gu, '');
const histogram = (text) => { const h = new Map(); for (const ch of letters(text)) h.set(ch, (h.get(ch) || 0) + 1); return h; };
const distance = (a, b) => { let d = 0; new Set([...a.keys(), ...b.keys()]).forEach((k) => { d += Math.abs((a.get(k) || 0) - (b.get(k) || 0)); }); return d; };
// `other` vient de `pdfPages(snapshot, haut, bas)` avec les mêmes bornes que le PDF. L'en-tête, le pied et les notes se comparent par leur TEXTE, avec ses chiffres (« Page 1/2 »), sur la même page ; leur hauteur
// ne dit rien (LibreOffice pose le pied plus bas et les notes au-dessus) ; le reste est le corps.
// `tol.drift` (documents longs, flux de texte sans coupure imposée) : { lines, perPage }. LibreOffice n'a pas les hauteurs de ligne de pdfmake, ni Word celles de LibreOffice : sur un texte qui coule, la coupure
// d'une page glisse de quelques lignes, et d'autant plus que les pages s'additionnent. Le texte d'une page ne se compare alors plus page par page mais par COUPURE : les signes de la page 1 à la page i, dans
// les deux fichiers, ne diffèrent pas de plus de `lines + perPage * i` lignes (de la longueur d'une ligne de cette page du PDF) ; le texte de tout le document, lui, ne doit rien perdre. Les images se comptent
// de même (une de plus ou de moins à la coupure, jamais deux ; autant en tout). Sans `drift`, comparaison page par page, au signe près (les modèles de la galerie, qui ont leurs sauts de page).
export function comparePageContent(ref, other, tol) {
  const t = Object.assign({ chars: 3 }, tol || {});
  const diffs = [];
  const note = (kind, page, detail, amount, extra) => diffs.push(Object.assign({ kind, page, detail, amount: amount == null ? null : amount }, extra || {}));
  // Un dernier jeu de page vide n'est pas une page de plus (même règle que pour la Lecture).
  const trim = (pages) => { const p = pages.slice(); while (p.length > 1 && !p[p.length - 1].lines.length && !p[p.length - 1].images.length) p.pop(); return p; };
  const A = trim(ref); const B = trim(other);
  // Le texte d'une page, en-tête, pied et notes compris (LibreOffice les range à sa façon : les notes au-dessus du pied, le pied plus bas ; la même page a le même texte, où qu'il tombe). Un numéro de
  // liste collé au texte (« 1.Faire revenir… » : LibreOffice écrit la marque et le texte d'un seul morceau) n'est pas du texte du document : il sort de chaque ligne, des deux côtés.
  const stripMark = (text) => text.replace(/^\d{1,3}[.)](?=\p{L})/u, '');
  const pageText = (p) => p.lines.concat(p.hf || []).map((ln) => stripMark(ln.text)).join('');
  let moved = 0;
  const bodies = B.map((pageB) => ({ lines: pageB.lines, hf: pageB.hf, images: pageB.images, all: pageB.lines.concat(pageB.hf) }));
  const common = Math.min(A.length, B.length);
  const lineChars = (i) => Math.max(10, letters(pageText(A[i])).length / Math.max(1, A[i].lines.length));
  const allowedAt = (i) => (t.drift.lines + t.drift.perPage * (i + 1)) * lineChars(i);
  const rest = (pages, from) => pages.slice(from).reduce((n, p) => n + letters(pageText(p)).length, 0);
  const tailLost = A.length !== B.length ? rest(A, common) - rest(bodies, common) : 0;
  // Le nombre de pages : sans `drift`, il doit être le même ; avec, une page de plus ou de moins est une coupure qui a glissé quand ce qu'elle porte (le texte au-delà des pages communes) tient dans la dérive permise.
  if (A.length !== B.length && (!t.drift || Math.abs(A.length - B.length) > 1 || Math.abs(tailLost) > allowedAt(common - 1))) note('pages', 0, 'PDF ' + A.length + ' page(s), fichier ' + B.length, B.length - A.length);
  const textsOf = (i) => ({ pdf: A[i].lines.map((ln) => ln.text), file: bodies[i].lines.map((ln) => ln.text), hfPdf: A[i].hf.map((ln) => ln.text), hfFile: bodies[i].hf.map((ln) => ln.text) });
  const missingOf = (i, ta, tb) => ({
    // Les lignes du PDF qui ne sont pas dans cette page de l'autre fichier, et celles de l'autre qui ne sont pas dans la page du PDF.
    missing: A[i].lines.concat(A[i].hf).filter((ln) => letters(ln.text).length >= 8 && letters(tb).indexOf(letters(stripMark(ln.text))) === -1).map((ln) => ln.text.slice(0, 40)),
    extra: bodies[i].all.filter((ln) => letters(ln.text).length >= 8 && letters(ta).indexOf(letters(stripMark(ln.text))) === -1).map((ln) => ln.text.slice(0, 40)),
  });
  let cumA = 0; let cumB = 0; let imgA = 0; let imgB = 0;
  for (let i = 0; i < common; i += 1) {
    const ta = pageText(A[i]); const tb = pageText(bodies[i]);
    const la = letters(ta).length; const lb = letters(tb).length;
    cumA += la; cumB += lb; imgA += A[i].images.length; imgB += B[i].images.length;
    if (!t.drift) {
      const d = distance(histogram(ta), histogram(tb));
      if (d > t.chars) {
        moved += d;
        const { missing, extra } = missingOf(i, ta, tb);
        note('content', i + 1, 'le texte de la page n\'est pas le même (' + la + ' signes dans le PDF, ' + lb + ' dans le fichier, ' + d + ' d\'écart)'
          + (missing.length ? ' ; du PDF seulement : « ' + missing.slice(0, 3).join(' » « ') + ' »' : '') + (extra.length ? ' ; du fichier seulement : « ' + extra.slice(0, 3).join(' » « ') + ' »' : ''), d, { texts: textsOf(i) });
      }
      if (A[i].images.length !== B[i].images.length) note('images', i + 1, 'PDF ' + A[i].images.length + ' image(s), fichier ' + B[i].images.length, B[i].images.length - A[i].images.length);
    } else {
      // La coupure qui ferme la page i + 1 : pas la dernière (sa somme est celle du document entier, vue plus bas).
      const shift = cumB - cumA;
      if (i < common - 1 && Math.abs(shift) > allowedAt(i)) {
        moved += Math.abs(shift);
        const { missing, extra } = missingOf(i, ta, tb);
        note('content', i + 1, 'la coupure après la page ' + (i + 1) + ' a glissé de ' + (Math.round((Math.abs(shift) / lineChars(i)) * 10) / 10) + ' ligne(s) (' + (shift > 0 ? 'le fichier a plus de texte' : 'le PDF a plus de texte') + ', plus de ' + (t.drift.lines + t.drift.perPage * (i + 1)) + ' permises)'
          + (missing.length ? ' ; du PDF seulement : « ' + missing.slice(0, 3).join(' » « ') + ' »' : '') + (extra.length ? ' ; du fichier seulement : « ' + extra.slice(0, 3).join(' » « ') + ' »' : ''), Math.abs(shift), { texts: textsOf(i) });
      }
      if (i < common - 1 && Math.abs(imgA - imgB) > 1) note('images', i + 1, 'jusqu\'à la page ' + (i + 1) + ' : PDF ' + imgA + ' image(s), fichier ' + imgB, imgB - imgA);
    }
    // L'en-tête, le pied et les notes : chaque ligne du PDF (avec ses chiffres) doit se lire sur la même page du fichier.
    const pageAll = letters(bodies[i].all.map((ln) => ln.text).join(''));
    const lost = A[i].hf.filter((ln) => letters(ln.text).length >= 3 && pageAll.indexOf(letters(ln.text)) === -1).map((ln) => ln.text.slice(0, 50));
    if (lost.length) note('hf', i + 1, 'en-tête, pied ou note du PDF absent de la page : « ' + lost.join(' » « ') + ' » (le fichier a : « ' + bodies[i].hf.map((ln) => ln.text.slice(0, 40)).join(' » « ') + ' »)');
  }
  if (t.drift) {
    // Tout le document : ni texte perdu ni texte en trop (au signe près, comme page par page), autant d'images.
    const all = (pages) => pages.map(pageText).join('');
    const d = distance(histogram(all(A)), histogram(all(bodies)));
    if (d > t.chars * Math.max(1, A.length)) note('content', 0, 'le texte du document n\'est pas le même (' + letters(all(A)).length + ' signes dans le PDF, ' + letters(all(bodies)).length + ' dans le fichier, ' + d + ' d\'écart)', d);
    const totalImg = (pages) => pages.reduce((n, p) => n + p.images.length, 0);
    if (totalImg(A) !== totalImg(B)) note('images', 0, 'PDF ' + totalImg(A) + ' image(s) en tout, fichier ' + totalImg(B), totalImg(B) - totalImg(A));
  } else if (A.length !== B.length && tailLost) {
    // Du texte dans les pages en trop d'un des deux côtés.
    note('tail', common + 1, (tailLost > 0 ? 'le PDF a ' : 'le fichier a ') + Math.abs(tailLost) + ' signe(s) de plus au-delà de la page ' + common, tailLost);
  }
  return { diffs, pages: { pdf: A.length, file: B.length }, moved };
}
