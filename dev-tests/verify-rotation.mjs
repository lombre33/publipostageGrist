#!/usr/bin/env node
// La rotation des cadres et des formes d'une présentation (js/free-frame.js : `rot`, css/free-frame.css, js/pdf-export.js, js/docx-export.js ; 4e fonction de la parité PowerPoint, après le fond, les formes, les
// traits et les notes), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active. Un cadre ou une forme
// pivote autour du centre de sa boîte de `rot` degrés dans le sens des aiguilles d'une montre ; ses mesures (x, y, w, h) restent celles de sa boîte droite ; une ligne ne pivote pas.
//  LES VALEURS : `rot` est ramené dans [0, 360[ au centième (-90 vaut 270, 450 vaut 90, 360 vaut 0, une valeur illisible 0), une ligne vaut toujours 0, un cadre droit s'écrit comme avant (aucun `data-ff-rot`),
//   un cadre pivoté s'écrit avec son angle ; enregistré puis rouvert, un angle revient à l'identique ; dupliquer et coller le gardent.
//  LES GESTES (fonctions pures) : l'angle que donne la souris tourne d'autant qu'elle tourne autour du centre, Maj le tient sur un pas de 15° ; redimensionner un cadre pivoté se fait dans SES axes : le côté ou le coin
//   d'en face ne bouge pas sur la page (huit poignées, sept angles, trois déplacements de la souris), le côté tenu suit la souris projetée sur l'axe du cadre ; le déplacer ne dépend pas de son angle.
//  LA POIGNÉE : au-dessus du cadre sélectionné (et de lui seul), un rond à flèche circulaire au bout d'une tige, qui reçoit la souris (la barre du cadre ne la couvre pas), avec son info-bulle ; une ligne n'en a pas ; la
//   Lecture non plus ; les poignées de côté changent de curseur avec l'angle.
//  LA SOURIS ET LE CLAVIER : glisser la poignée fait tourner le cadre de l'angle que la souris parcourt autour de son centre (l'angle se lit près de la souris pendant le geste), UN pas d'historique, Maj tient 15°,
//   Échap abandonne ; Alt + ← → pivotent de 15° (Maj : 1°) et le disent dans la ligne d'état, UN pas d'historique chaque fois ; sans cadre sélectionné ou sur une ligne, rien ne change ; les poignées de côté et le bord
//   d'un cadre pivoté le redimensionnent et le déplacent sans le faire tourner.
//  LE DESSIN : le cadre pivoté tourne autour du centre de sa boîte, qui ne bouge pas ; une forme pivotée est de l'encre dedans, du papier dehors (une capture de l'éditeur et de la Lecture, aux pixels, d'un rectangle à 45°
//   et d'une ellipse à 90°) ; la miniature, la Lecture et le diaporama la tournent aussi ; ce qui sort de la page est rogné à son bord, comme pour un cadre droit.
//  LES SORTIES : le PDF tourne les formes et le texte (du vrai texte : chaque mot, ses puces, son surlignage, son lien, la barre d'une citation) à la place que l'éditeur lui donne (à un point près), sur la page de sa
//   diapositive, et une image du texte d'un cadre pivoté y est aussi (à sa place, de sa taille, de sa couleur : défaut trouvé par ce test, l'image manquait au PDF) ; un cadre droit n'est pas touché ; le Word écrit
//   `a:xfrm rot` (60 000 par degré) à la place de la boîte droite ; le HTML et le Markdown n'en gardent rien. Limites connues, non testées : le PDF ne porte pas les notes de bas de page d'un cadre pivoté.
// Lancé par run-headless.mjs (groupe Node "rotation", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-rotation.mjs
// ROTATION_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; ROTATION_ONLY=1,3 : ne joue que ces parties (essai, « en » : la passe anglaise) ; sans eux, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.ROTATION_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.ROTATION_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = part => !ONLY.length || ONLY.includes(String(part));
const t = await start({ name: 'verify-rotation', port: Number(process.env.ROTATION_PORT || 8969) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PT = 96 / 72;
const EMU = 12700;
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Un cadre écrit comme l'enregistrement le fait : les mesures, l'angle (`null` : aucun attribut), l'aspect, le texte.
const FRAME = (x, y, w, h, rot, look, body) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${rot === null ? '' : ` data-ff-rot="${rot}"`}${look || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
const LINE = (x, y, w, h, extra) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"${extra || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
const RECT = ' data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"';
const ELLIPSE = ' data-ff-shape="ellipse" data-ff-fill="#fde68a" data-ff-line="#b45309" data-ff-lw="2"';
// Des formes pleines sans trait ni texte : de l'encre dedans, du papier dehors (les captures aux pixels).
const MAGENTA = ' data-ff-shape="rect" data-ff-fill="#be185d"';
const AMBER = ' data-ff-shape="ellipse" data-ff-fill="#b45309"';
// Une image rouge unie de 20 x 20 pixels, posée dans le texte d'un cadre pivoté (la même couleur partout : on la retrouve dans le PDF).
const RED_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGM4wcBANiJf56jmUc2jmkc1U0UzAAn6OJAPHK6LAAAAAElFTkSuQmCC';
const IMG_BODY = `<p>Avant <img class="editor-image" alt="Image" src="data:image/png;base64,${RED_PNG}" style="width: 60px" data-layer="normal" data-wrap="inline"> après</p>`;
const RICH = '<p>Bonjour <strong>gras</strong> <em>italique</em> <u>souligné</u> <s>barré</s></p><ul><li><p>Premier point</p></li><li><p>Deuxième point</p></li></ul><ol><li><p>Un</p></li><li><p>Deux</p></li></ol>';
const QUOTE = '<p style="text-align:right">À droite <span style="background-color:#fef08a">surligné</span> et <a href="https://example.org/a">un lien</a></p><blockquote><p>Citation</p></blockquote>';
// 7 « Pivots » : deux diapositives (l'écran : la poignée, les gestes) ; 10, 11 et 12 en sont trois copies (la souris, le clavier, les mesures : chaque scénario repart d'un modèle neuf) ; 8 « Sorties » : deux diapositives
// (le dessin, le PDF, le Word, le HTML, le Markdown) ; 9 « Valeurs » : des angles écrits à la main, hors normes.
//  Pivots 1 : un cadre de texte A et une forme B, droits ; 2 : une ligne et un cadre C à 30°.
//  Sorties 1 : R1 (texte riche, 20°), R2 (ellipse, 90°), R3 (rectangle et son texte, 45°), R4 (texte à droite, surligné, avec un lien et une citation, 330°), M (rectangle plein, 45°), A (ellipse pleine, 90°), S (cadre
//  droit) ; 2 : un cadre de texte à 30°, D (rectangle plein à 45° qui sort de la page à gauche) et un cadre à 15° dont le texte porte une image.
const PIVOTS = `${FRAME(300, 150, 240, 80, null, '', '<p>Cadre A</p>')}${FRAME(100, 300, 200, 100, null, RECT, '<p>Forme B</p>')}<h1>Titre un</h1><p>Premier texte</p>${BR}${LINE(100, 200, 200, 0)}${FRAME(600, 100, 200, 80, 30, '', '<p>Pivote C</p>')}<h2>Deux</h2><p>Texte deux</p>`;
const SORTIES = `${FRAME(120, 90, 260, 150, 20, '', RICH)}${FRAME(420, 70, 220, 100, 90, ELLIPSE, '<p style="text-align:center">Ellipse à 90°</p>')}${FRAME(700, 60, 200, 80, 45, RECT, '<p>Rectangle à 45° avec un texte long qui passe à la ligne</p>')}${FRAME(480, 300, 300, 120, 330, '', QUOTE)}${FRAME(120, 380, 200, 70, 45, MAGENTA, '<p></p>')}${FRAME(820, 360, 90, 160, 90, AMBER, '<p></p>')}${FRAME(340, 470, 110, 30, null, '', '<p>Cadre droit</p>')}<h1>Titre un</h1><p>Texte</p>${BR}${FRAME(300, 150, 240, 80, 30, '', '<p>Deuxieme pivote</p>')}${FRAME(-60, 200, 200, 60, 45, MAGENTA, '<p></p>')}${FRAME(560, 300, 200, 100, 15, '', IMG_BODY)}<h2>Page deux</h2>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Pivots', '${PIVOTS}', false, 'presentation');
  add(10, 'Gestes', '${PIVOTS}', false, 'presentation');
  add(11, 'Clavier', '${PIVOTS}', false, 'presentation');
  add(12, 'Mesures', '${PIVOTS}', false, 'presentation');
  add(8, 'Sorties', '${SORTIES}', false, 'presentation');
  add(9, 'Valeurs', '${[-90, 450, 'abc', 12.346, 360, '', '45deg', -0.001, 720.5].map((rot, i) => FRAME(40 + 100 * i, 100, 90, 40, rot, '', '<p>V' + i + '</p>')).join('')}${LINE(100, 300, 200, 50, ' data-ff-rot="45"')}${FRAME(500, 300, 100, 40, 0, '', '<p>Zéro</p>')}<p>Valeurs</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: { rotateTip: 'Glisser pour pivoter l\'objet (Maj : par pas de 15°) ; au clavier, Alt + ← →', rotated: n => `Rotation : ${String(n).replace('.', ',')}°.`, duplicate: 'Dupliquer l\'objet' },
  en: { rotateTip: 'Drag to rotate the object (Shift: 15° steps); from the keyboard, Alt + ← →', rotated: n => `Rotation: ${n}°.`, duplicate: 'Duplicate the object' },
};

// Les cadres, les lignes et la sélection du texte, tels que le document les garde.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const frames = [];
  const lines = [];
  const shape = [];
  editor.state.doc.forEach((node, offset) => {
    const name = node.type.name;
    shape.push(name === 'freeLine' ? 'L' : name === 'freeFrame' ? 'F' : name === 'pageBreak' ? '|' : name === 'heading' ? 'h' : name === 'paragraph' ? 'p' : name.slice(0, 2));
    const a = node.attrs;
    if (name === 'freeFrame') frames.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot, shape: a.shape, text: node.textContent });
    if (name === 'freeLine') lines.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, rot: a.rot });
  });
  const sel = editor.state.selection;
  return { frames, lines, shape: shape.join(''), selection: { selectedFrame: !!(sel.node && sel.node.type.name === 'freeFrame'), selectedLine: !!(sel.node && sel.node.type.name === 'freeLine'), text: !sel.node } };
});
// L'écran : le coin de la page, le zoom et le haut de la page de chaque diapositive (le haut du texte de la diapositive moins la marge).
const screenState = (page, root = '#editor-container') => page.evaluate((rootSel) => {
  const host = document.querySelector(rootSel);
  const content = host && host.querySelector('.tiptap, .reader-content');
  if (!content) return null;
  const zoom = rootSel === '#editor-container' ? EditorCore.layoutZoom(content) : (parseFloat(getComputedStyle(content).zoom) || 1);
  const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
  const tops = [];
  let started = false;
  Array.from(content.children).forEach((child, i) => {
    const isBreak = child.classList.contains('page-break-marker');
    const isFrame = child.classList.contains('pp-free-frame');
    if (i === 0 || (tops.length && isBreak)) started = false;
    if (isBreak || isFrame || child.tagName === 'STYLE') return;
    if (!started) { tops.push(child.getBoundingClientRect().top - margin * zoom); started = true; }
  });
  return { zoom, pageTops: tops, contentLeft: content.getBoundingClientRect().left };
}, root);
// Un point de la page (points) sur l'écran, d'après l'état de l'écran et le rang de la diapositive ; et l'inverse.
const onScreen = (screen, slide, p) => [screen.contentLeft + p[0] * PT * screen.zoom, screen.pageTops[slide] + p[1] * PT * screen.zoom];
const onPage = (screen, slide, px) => [(px[0] - screen.contentLeft) / (PT * screen.zoom), (px[1] - screen.pageTops[slide]) / (PT * screen.zoom)];
const k0 = screen => PT * screen.zoom;

// La géométrie d'un cadre pivoté, en points depuis le coin de la page : le tour du rectangle (ses quatre coins) et un point de sa boîte droite (`u`, `v` : points depuis le coin de la boîte droite) envoyé sur la page.
const radians = deg => deg * Math.PI / 180;
function pagePoint(frame, shown, u, v) {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + shown / 2;
  const a = radians(frame.rot || 0);
  const dx = frame.x + u - cx;
  const dy = frame.y + v - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}
const cornersOf = (frame, shown) => [[0, 0], [frame.w, 0], [frame.w, shown], [0, shown]].map(([u, v]) => pagePoint(frame, shown, u, v));
// La distance SIGNÉE d'un point à un polygone convexe (négative dedans), minorée : la plus grande des distances aux droites de ses côtés.
function signedDistance(poly, p) {
  let area = 0;
  poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; });
  const sign = area >= 0 ? 1 : -1;
  let best = -Infinity;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-9) return;
    best = Math.max(best, (p[0] - a[0]) * sign * (b[1] - a[1]) / length - (p[1] - a[1]) * sign * (b[0] - a[0]) / length);
  });
  return best;
}
// Le rectangle [x0, y0, x1, y1] qui enveloppe les coins d'une forme, agrandi de `pad` points.
const envelopeOf = (corners, pad) => [Math.min(...corners.map(c => c[0])) - pad, Math.min(...corners.map(c => c[1])) - pad, Math.max(...corners.map(c => c[0])) + pad, Math.max(...corners.map(c => c[1])) + pad];
// Les sondes d'une forme : [x, y, 1 (de l'encre) ou 0 (du papier)] en pixels de l'image, tous les 3 pixels, à `margin` pixels au moins du bord de la forme. `inside(p)` : la distance signée d'un point de la page à la
// forme (négative dedans) ; `map` : un point de la page (points) sur l'image ; `k` : les pixels par point ; `box` : [x0, y0, x1, y1], le rectangle de la page à parcourir.
function probesOf({ distance, box, map, k, margin = 2.4, pageBox = null }) {
  const probes = [];
  const step = 3 / k;
  const marginPt = margin / k;
  for (let y = box[1]; y <= box[3]; y += step) {
    for (let x = box[0]; x <= box[2]; x += step) {
      const d = distance([x, y]);
      if (Math.abs(d) < marginPt) continue;
      if (pageBox && (x < pageBox[0] + marginPt || y < pageBox[1] + marginPt || x > pageBox[2] - marginPt || y > pageBox[3] - marginPt)) continue;
      const [px, py] = map(x, y);
      probes.push([Math.floor(px), Math.floor(py), d < 0 ? 1 : 0]);
    }
  }
  return probes;
}
// Exécutée DANS la page : compare une image (PNG en base64) aux sondes : chacune est de la couleur de l'encre (1) ou du papier (0), à 60 de distance (rouge, vert, bleu) près, ou n'est pas de l'encre (2).
async function probeImage({ b64, probes, ink, paperAt }) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colorAt = (x, y) => { const i = (y * canvas.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const paper = colorAt(paperAt[0], paperAt[1]);
  const inkRgb = hex(ink);
  const mismatches = [];
  let checked = 0;
  let inked = 0;
  probes.forEach(([x, y, want]) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    checked++;
    if (want) inked++;
    const rgb = colorAt(x, y);
    const got = gap(rgb, inkRgb) < 60 ? 1 : (gap(rgb, paper) < 60 ? 0 : -1);
    if ((want === 2 ? got === 1 : got !== want) && mismatches.length < 6) mismatches.push({ at: [x, y], want, got, rgb });
  });
  return { checked, inked, mismatches, paper, outside: probes.length - checked };
}
const probeOf = (page, args) => page.evaluate(probeImage, args);
// Les points d'une couleur dans une image (PNG en base64) : leur nombre et leur centre (pixels), à 40 de distance (rouge, vert, bleu) près.
const colorSpots = (page, b64, color) => page.evaluate(async ([data64, hexColor]) => {
  const bytes = Uint8Array.from(atob(data64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const want = [parseInt(hexColor.slice(1, 3), 16), parseInt(hexColor.slice(3, 5), 16), parseInt(hexColor.slice(5, 7), 16)];
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = (y * canvas.width + x) * 4;
    if (Math.hypot(data[i] - want[0], data[i + 1] - want[1], data[i + 2] - want[2]) < 40) { n++; sx += x; sy += y; }
  }
  return { n, cx: n ? sx / n : 0, cy: n ? sy / n : 0 };
}, [b64, color]);

// Le PDF relu par pdf.js : la page `n` peinte à `scale` pixels par point (PNG en base64), ses mots (chaîne, matrice, largeur : points) et ses liens.
const renderPdfPage = (page, b64, n, scale) => page.evaluate(async ([data64, number, factor]) => {
  if (!window.pdfjsLib) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const raw = atob(data64);
  const data = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
  const doc = await window.pdfjsLib.getDocument({ data }).promise;
  const p = await doc.getPage(number);
  const viewport = p.getViewport({ scale: factor });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const text = await p.getTextContent();
  const links = (await p.getAnnotations()).filter(a => a.subtype === 'Link').map(a => ({ rect: a.rect, url: a.url }));
  return {
    numPages: doc.numPages, png: canvas.toDataURL('image/png').split(',')[1], width: viewport.width / factor, height: viewport.height / factor,
    items: text.items.map(i => ({ s: i.str, t: i.transform, w: i.width })), links,
  };
}, [b64, n, scale]);
// Un mot du PDF : son angle (degrés, dans le sens des aiguilles d'une montre sur la page), sa taille et le centre de sa boîte (points depuis le coin haut gauche de la page, ligne de base + 0,342 em au-dessus pour la police
// Roboto : le milieu de l'encadré que le navigateur donne à un mot).
function pdfWord(item, pageHeight) {
  const [a, b, , , e, f] = item.t;
  const size = Math.hypot(a, b);
  const angle = Math.atan2(-b, a);
  const origin = [e, pageHeight - f];
  const along = [Math.cos(angle), Math.sin(angle)];
  const up = [Math.sin(angle), -Math.cos(angle)];
  return { s: item.s, size, deg: angle * 180 / Math.PI, cx: origin[0] + along[0] * item.w / 2 + up[0] * 0.342 * size, cy: origin[1] + along[1] * item.w / 2 + up[1] * 0.342 * size, origin };
}

// Les ancres d'un .docx (en base64), lues dans la page : leur rotation (60 000 par degré), leur position et leur taille en EMU, leur texte.
const wordAnchorsOf = async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const first = (el, name) => (el ? el.getElementsByTagName(name)[0] || null : null);
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  return Array.from(doc.getElementsByTagName('wp:anchor')).map((anchor) => {
    const spPr = first(anchor, 'wps:spPr');
    const xfrm = first(spPr, 'a:xfrm');
    const h = first(anchor, 'wp:positionH');
    const v = first(anchor, 'wp:positionV');
    const ext = first(anchor, 'wp:extent');
    return {
      prst: attr(first(spPr, 'a:prstGeom'), 'prst'), rot: attr(xfrm, 'rot'), x: Number(first(h, 'wp:posOffset').textContent), y: Number(first(v, 'wp:posOffset').textContent),
      cx: Number(attr(ext, 'cx')), cy: Number(attr(ext, 'cy')), xfrmCx: Number(attr(first(xfrm, 'a:ext'), 'cx')), xfrmCy: Number(attr(first(xfrm, 'a:ext'), 'cy')), text: Array.from(anchor.getElementsByTagName('w:t')).map(n => n.textContent).join(''),
    };
  });
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Une page ouverte sur l'application : les outils, l'ouverture d'un modèle (à une taille d'écran donnée : 700x400 partout sauf pour les captures aux pixels).
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, [selector, index]);
  const onTop = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && !!hit && (hit === el || el.contains(hit));
  }, [selector, index]);
  const reach = async (c) => { await page.mouse.move(c.x - 10, c.y); await page.mouse.move(c.x, c.y, { steps: 2 }); await sleep(80); };
  const showInList = async (selector, index) => {
    const need = await page.evaluate(([sel, i]) => {
      const el = document.querySelectorAll(sel)[i];
      const list = el && el.closest('.pp-slide-list');
      if (!list) return null;
      const r = el.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      const delta = r.top < l.top ? r.top - l.top - 8 : (r.bottom > l.bottom ? r.bottom - l.bottom + 8 : 0);
      return delta ? { x: l.left + l.width / 2, y: l.top + l.height / 2, delta } : null;
    }, [selector, index]);
    if (!need) return;
    await page.mouse.move(need.x, need.y);
    await page.mouse.wheel(0, need.delta);
    await sleep(250);
  };
  const hover = async (selector, index = 0) => {
    await showInList(selector, index);
    const c = await rectOf(selector, index);
    if (!c) throw new Error('introuvable : ' + selector + ' #' + index);
    await reach(c);
    return c;
  };
  const click = async (selector, index = 0, options = {}) => { const c = await hover(selector, index); await page.mouse.click(c.x, c.y, options); await sleep(250); return c; };
  const leave = async () => { await page.mouse.move(WIDTH - 40, HEIGHT - 60); await sleep(200); };
  // Un clic à un point de l'écran (la souris y vient de quelques pixels).
  const clickAt = async (x, y, options = {}) => { await page.mouse.move(x - 8, y); await page.mouse.move(x, y, { steps: 2 }); await sleep(80); await page.mouse.click(x, y, options); await sleep(250); };
  // Un glissement d'un point de l'écran à un autre (par petits pas), avec ou sans Maj ; `abort` : appuie sur Échap avant de lâcher.
  const drag = async (from, to, { shift = false, abort = false, steps = 12 } = {}) => {
    await page.mouse.move(from[0] - 6, from[1]);
    await page.mouse.move(from[0], from[1], { steps: 2 });
    await sleep(80);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps });
    await sleep(120);
    if (abort) { await page.keyboard.press('Escape'); await sleep(120); }
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    await sleep(300);
  };
  return { rectOf, onTop, hover, click, clickAt, drag, leave };
}

// Deux gestes à moins de 500 ms l'un de l'autre sont UN seul évènement d'historique (prosemirror-history, newGroupDelay) : on les espace pour compter les Ctrl+Z.
const HISTORY_GAP = 650;
const gap = () => sleep(HISTORY_GAP);
// Un point à `d` pixels du centre `c`, dans la direction de l'angle `deg` (degrés dans le sens des aiguilles d'une montre depuis le haut de l'écran).
const aim = (c, d, deg) => [c.x + d * Math.sin(radians(deg)), c.y - d * Math.cos(radians(deg))];
const numberOf = text => (text == null ? NaN : parseFloat(String(text).replace(',', '.')));
const overlap = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
// La distance signée d'un point de la page à une ellipse de la boîte `frame` (x, y, w, h : points ; rot : degrés), au premier ordre : f / |grad f| (négative dedans).
function ellipseDistance(frame, shown, p) {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + shown / 2;
  const a = radians(-(frame.rot || 0));
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  const ux = dx * Math.cos(a) - dy * Math.sin(a);
  const uy = dx * Math.sin(a) + dy * Math.cos(a);
  const rx = frame.w / 2;
  const ry = shown / 2;
  const f = (ux / rx) ** 2 + (uy / ry) ** 2 - 1;
  const gradient = 2 * Math.hypot(ux / (rx * rx), uy / (ry * ry));
  return gradient > 1e-9 ? f / gradient : -Math.min(rx, ry);
}

async function session({ lang, colorScheme, width = WIDTH, height = HEIGHT }) {
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme, width, height });
  const tools = toolsOf(page);
  const { click, leave } = tools;
  const press = async (key) => { await page.keyboard.press(key); await sleep(220); };
  const save = async () => { await leave(); await click('#btn-save'); await sleep(1000); await leave(); };
  const unsaved = () => page.evaluate(() => LiveEntry.hasUnsavedEdits());
  const open = async (id, slides) => {
    if (await unsaved()) await save();
    await Promise.race([
      page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
      sleep(20000),
    ]);
    await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
    if (slides) await page.waitForFunction(n => { const s = document.querySelector('.pp-slide-strip'); return !!s && !s.hidden && document.querySelectorAll('.pp-slide-item').length === n; }, slides, { timeout: 15000 }).catch(() => {});
    await sleep(900);
    return page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
  };
  const html = () => page.evaluate(() => Editor.getHTML());
  const undo = () => press('Control+z');
  const redo = () => press('Control+Shift+z');
  // Les cadres et les lignes du document, dans l'ordre : le rang `n` de `selectNth` et `bringNth`.
  const FREE = '(node.type.name === "freeFrame" || node.type.name === "freeLine")';
  const selectNth = async (n) => {
    const ok = await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, offset) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push(offset); });
      if (!(i in list)) return false;
      FreeFrame.select(ed, list[i]);
      ed.view.focus();
      return true;
    }, n);
    await sleep(350);
    return ok;
  };
  const bringNth = async (n) => {
    await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, offset) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push(offset); });
      const dom = ed.view.nodeDOM(list[i]);
      (dom.querySelector('.pp-free-frame-box') || dom).scrollIntoView({ block: 'center', inline: 'center' });
    }, n);
    await sleep(300);
  };
  const cursorIn = async (text) => {
    const ok = await page.evaluate((wantedText) => {
      const ed = EditorCore.getEditor();
      let at = -1;
      ed.state.doc.descendants((node, pos) => {
        if (at >= 0) return false;
        if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') return false;
        if (node.isTextblock && node.textContent === wantedText) { at = pos + 1; return false; }
        return true;
      });
      if (at < 0) return false;
      ed.chain().focus().setTextSelection(at).run();
      return true;
    }, text);
    await sleep(250);
    return ok;
  };
  const frameBy = async (text) => (await docState(page)).frames.find(f => f.text === text);
  const frameRect = (selector = '.pp-ff-selected > .pp-free-frame-box') => page.evaluate((sel) => { const b = document.querySelector('#editor-container ' + sel); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }, selector);
  // La boîte du cadre sélectionné DROITE (sans sa rotation) à l'écran, son angle et le zoom : de quoi dire où sont ses côtés, ses coins et sa poignée.
  const geo = () => page.evaluate(() => {
    const anchor = document.querySelector('#editor-container .pp-ff-selected');
    if (!anchor) return null;
    const box = anchor.querySelector(':scope > .pp-free-frame-box');
    const zoom = EditorCore.layoutZoom(document.querySelector('#editor-container .tiptap'));
    const straight = FreeFrame.straight(box, () => { const r = box.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
    return { zoom, straight, rot: parseFloat(anchor.getAttribute('data-ff-rot')) || 0 };
  });
  const handle = () => page.evaluate(() => {
    const h = document.querySelector('#editor-container .pp-ff-selected .pp-ff-rotate');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom, display: getComputedStyle(h).display, cursor: getComputedStyle(h).cursor, hit: !!hit && (hit === h || h.contains(hit)), tip: h.title, svg: !!h.querySelector('svg') };
  });
  const status = () => page.evaluate(() => ((document.getElementById('status-msg') || {}).textContent || '').trim());
  return Object.assign({ page, press, save, unsaved, open, html, undo, redo, selectNth, bringNth, cursorIn, frameBy, frameRect, geo, handle, status }, tools);
}

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const S = await session({ lang, colorScheme });
  const { page, rectOf, click, drag, leave, press, save, unsaved, open, html, undo, redo, selectNth, bringNth, cursorIn, frameBy, frameRect, geo, handle, status } = S;

  // Glisse la poignée de rotation du cadre sélectionné jusqu'à `to` (un point de l'écran) et rend ce que l'on voit PENDANT le geste (la pastille d'angle, l'angle peint, ce que le document garde), puis relâche (Maj tenue
  // si `shift`) ; `abort` appuie sur Échap avant de relâcher.
  const turnDrag = async (to, { shift = false, abort = false } = {}) => {
    const h = await handle();
    await page.mouse.move(h.x - 6, h.y);
    await page.mouse.move(h.x, h.y, { steps: 2 });
    await sleep(80);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 14 });
    await sleep(150);
    const during = await page.evaluate(() => {
      const badge = document.querySelector('.pp-ff-angle');
      const anchor = document.querySelector('#editor-container .pp-ff-selected');
      const r = badge ? badge.getBoundingClientRect() : null;
      return { badge: badge ? badge.textContent : null, badgeRect: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width } : null, painted: anchor ? anchor.getAttribute('data-ff-rot') : null, z: badge ? getComputedStyle(badge).zIndex : null };
    });
    during.ratio = during.badge ? await contrastOf(page, '.pp-ff-angle') : null;
    during.stored = (await docState(page)).frames.map(f => f.rot);
    if (abort) { await page.keyboard.press('Escape'); await sleep(150); }
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    await sleep(350);
    return during;
  };
  const badgeGone = () => page.evaluate(() => !document.querySelector('.pp-ff-angle'));
  const rotAttr = (n = 0) => page.evaluate((i) => { const a = document.querySelectorAll('#editor-container .pp-free-frame')[i]; return a ? a.getAttribute('data-ff-rot') : undefined; }, n);

  // --- 1. Les valeurs, les fonctions pures.
  if (full && wanted(1)) {
    console.log('\n' + tag + '1) Les valeurs et les gestes (fonctions pures)');
    const turns = await page.evaluate(() => [0, 360, -90, 450, 12.346, 12.341, 'abc', null, undefined, '90', '-0.001', 359.999, 720.5, '45deg', 1e9, -1e9, Infinity, NaN].map(v => FreeFrame.turnOf(v)));
    check(tag + 'turnOf ramène un angle dans [0, 360[ au centième : 0 → 0, 360 → 0, -90 → 270, 450 → 90, 12,346 → 12,35, 12,341 → 12,34, illisible, absent → 0, « 90 » → 90, -0,001 → 0, 359,999 → 360 → 0, 720,5 → 0,5, « 45deg » → 45, énormes → [0, 360[',
      JSON.stringify(turns.slice(0, 15)) === JSON.stringify([0, 0, 270, 90, 12.35, 12.34, 0, 0, 0, 90, 0, 0, 0.5, 45, turns[14]]) && turns.slice(14).every(v => typeof v === 'number' && v >= 0 && v < 360), turns);
    const line = await page.evaluate(() => [FreeFrame.normalized({ shape: 'line', rot: 45, w: 100, h: 0 }).rot, FreeFrame.normalized({ shape: 'rect', rot: 45 }).rot, FreeFrame.normalized({ rot: 45 }).rot]);
    check(tag + 'une ligne vaut toujours 0 (ses deux bouts disent son angle), une forme et un cadre de texte gardent le leur', JSON.stringify(line) === JSON.stringify([0, 45, 45]), line);
    const rotations = await page.evaluate(() => {
      const c = { x: 100, y: 100 };
      const top = { x: 100, y: 50 };
      return [
        FreeFrame.rotationAt(0, c, top, { x: 150, y: 100 }, false),
        FreeFrame.rotationAt(0, c, top, { x: 100, y: 150 }, false),
        FreeFrame.rotationAt(0, c, top, { x: 50, y: 100 }, false),
        FreeFrame.rotationAt(350, c, top, { x: 150, y: 100 }, false),
        FreeFrame.rotationAt(10, c, { x: 150, y: 100 }, top, false),
        FreeFrame.rotationAt(0, c, top, { x: 150, y: 80 }, true),
        FreeFrame.rotationAt(0, c, top, { x: 150, y: 80 }, false),
        FreeFrame.rotationAt(40, c, top, top, false),
      ];
    });
    check(tag + 'rotationAt : la souris du haut à droite fait 90°, en bas 180°, à gauche 270° ; 350° + 90° = 80° ; de droite en haut, à 10°, il reste 280° ; avec Maj le geste à 68,2° tombe sur 75° ; sans Maj il reste à 68,2° ; sans mouvement l\'angle ne change pas',
      JSON.stringify(rotations.slice(0, 5)) === JSON.stringify([90, 180, 270, 80, 280]) && rotations[5] === 75 && near(rotations[6], 68.2, 0.05) && rotations[7] === 40, rotations);

    // Redimensionner un cadre pivoté : le côté ou le coin d'en face ne bouge pas sur la page, le côté tenu suit la souris projetée sur l'axe du cadre.
    const KINDS = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
    const ANGLES = [0, 30, 45, 90, 135, 200, 330];
    const DELTAS = [[30, 20], [-40, 25], [15, -35]];
    const outcomes = await page.evaluate(({ kinds, angles, deltas }) => {
      const out = [];
      const pageSize = { width: 960, height: 540 };
      angles.forEach(rot => kinds.forEach(kind => deltas.forEach(([dx, dy]) => {
        const start = { x: 300, y: 200, w: 300, h: 200, rot };
        out.push({ rot, kind, dx, dy, start, next: FreeFrame.gesture(kind, start, dx, dy, start.h, 0, pageSize) });
      })));
      return out;
    }, { kinds: KINDS, angles: ANGLES, deltas: DELTAS });
    const worst = { fixed: 0, followed: 0, count: 0 };
    const failures = [];
    outcomes.forEach(({ rot, kind, dx, dy, start, next }) => {
      const a = radians(rot);
      const before = start;
      // Le point qui ne doit pas bouger : le côté d'en face (le milieu), le coin d'en face pour un coin ; ses mesures dans la boîte droite avant et après.
      const anchor = (f, shown) => [kind.includes('e') ? 0 : kind.includes('w') ? f.w : f.w / 2, kind.includes('s') ? 0 : kind.includes('n') ? shown : shown / 2];
      const [bu, bv] = anchor(before, before.h);
      const [nu, nv] = anchor(next, next.h);
      const p0 = pagePoint(before, before.h, bu, bv);
      const p1 = pagePoint({ ...next, rot }, next.h, nu, nv);
      const fixed = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      // Le côté tenu : la largeur ou la hauteur change de la projection du déplacement sur l'axe du cadre.
      const alongX = dx * Math.cos(a) + dy * Math.sin(a);
      const alongY = dy * Math.cos(a) - dx * Math.sin(a);
      let followed = 0;
      if (kind.includes('e')) followed = Math.max(followed, Math.abs(next.w - before.w - alongX));
      if (kind.includes('w')) followed = Math.max(followed, Math.abs(next.w - before.w + alongX));
      if (kind.includes('s')) followed = Math.max(followed, Math.abs(next.h - before.h - alongY));
      if (kind.includes('n')) followed = Math.max(followed, Math.abs(next.h - before.h + alongY));
      if (kind === 'n' || kind === 's') followed = Math.max(followed, Math.abs(next.w - before.w));
      if (kind === 'e' || kind === 'w') followed = Math.max(followed, Math.abs(next.h - before.h));
      worst.fixed = Math.max(worst.fixed, fixed);
      worst.followed = Math.max(worst.followed, followed);
      worst.count++;
      if (fixed > 0.03 || followed > 0.03) failures.push({ rot, kind, dx, dy, fixed, followed, next });
    });
    check(tag + `redimensionner un cadre pivoté (${worst.count} gestes : huit poignées, sept angles, trois déplacements) : le côté ou le coin d'en face ne bouge pas sur la page (à 0,03 point : ${worst.fixed.toFixed(3)}) et le côté tenu suit la souris projetée sur l'axe du cadre (${worst.followed.toFixed(3)})`,
      worst.count === 168 && failures.length === 0, failures.slice(0, 3));
    const moves = await page.evaluate(() => [0, 45, 200].map(rot => FreeFrame.gesture('move', { x: 300, y: 200, w: 300, h: 200, rot }, 40, -30, 200, 0, { width: 960, height: 540 })));
    check(tag + 'déplacer un cadre ne dépend pas de son angle : x + 40, y - 30, la taille gardée', moves.every(m => m.x === 340 && m.y === 170 && m.w === 300 && m.h === 200), moves);
    // Une hauteur que le texte impose (au-dessus de `h`) : le cadre pivoté tourne autour du centre de la hauteur MONTRÉE.
    const taller = await page.evaluate(() => {
      const start = { x: 300, y: 200, w: 300, h: 40, rot: 90 };
      return FreeFrame.gesture('e', start, 40, 0, 100, 100, { width: 960, height: 540 });
    });
    const p0 = pagePoint({ x: 300, y: 200, w: 300, rot: 90 }, 100, 0, 50);
    const p1 = pagePoint({ x: taller.x, y: taller.y, w: taller.w, rot: 90 }, Math.max(taller.h, 100), 0, Math.max(taller.h, 100) / 2);
    check(tag + 'un cadre pivoté dont le texte est plus haut que `h` garde son côté d\'en face en place (la hauteur montrée donne le centre)', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.03, { taller, p0, p1 });

    // Des angles écrits à la main dans un modèle : ramenés à l'ouverture, écrits seulement quand le cadre pivote.
    check(tag + 'le modèle « Valeurs » (angles écrits à la main) s\'ouvre', await open(9, 1));
    const written = await docState(page);
    const rots = written.frames.map(f => f.rot);
    check(tag + 'les angles écrits à la main sont ramenés dans [0, 360[ à l\'ouverture : -90 → 270, 450 → 90, « abc » → 0, 12,346 → 12,35, 360 → 0, vide → 0, « 45deg » → 45, -0,001 → 0, 720,5 → 0,5, 0 → 0',
      JSON.stringify(rots) === JSON.stringify([270, 90, 0, 12.35, 0, 0, 45, 0, 0.5, 0]), rots);
    const dom9 = await page.evaluate(() => ({
      attrs: Array.from(document.querySelectorAll('#editor-container .pp-free-frame')).map(f => f.getAttribute('data-ff-rot')),
      lineBox: getComputedStyle(document.querySelector('#editor-container .pp-free-frame[data-ff-shape="line"] > .pp-free-frame-box')).transform,
    }));
    check(tag + 'seul un cadre qui pivote porte `data-ff-rot` (la ligne et les cadres à 0 n\'en ont pas), et la boîte d\'une ligne n\'est jamais tournée',
      JSON.stringify(dom9.attrs) === JSON.stringify(['270', '90', null, '12.35', null, null, '45', null, '0.5', null, null]) && dom9.lineBox === 'none', dom9);
    const saved9 = await html();
    const kept = Array.from(saved9.matchAll(/data-ff-rot="([^"]*)"/g), m => m[1]);
    check(tag + 'le HTML enregistré n\'écrit l\'angle que des cinq cadres qui pivotent (270, 90, 12.35, 45, 0.5), ramené, jamais pour la ligne ni pour un angle nul', JSON.stringify(kept) === JSON.stringify(['270', '90', '12.35', '45', '0.5']), kept);
  }

  // --- 2. La poignée.
  if (wanted(2)) {
    console.log('\n' + tag + '2) La poignée de rotation');
    check(tag + 'le modèle « Pivots » s\'ouvre (deux diapositives)', await open(7, 2));
    await click('.pp-slide-item', 0);
    await leave();
    await cursorIn('Premier texte');
    const idle = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-ff-rotate')).map(h => getComputedStyle(h).display));
    check(tag + 'sans cadre sélectionné ni actif, aucune poignée de rotation ne s\'affiche (une par cadre : trois ; la ligne n\'en a pas)', idle.length === 3 && idle.every(d => d === 'none'), idle);
    check(tag + 'le cadre A se sélectionne', await selectNth(0));
    await bringNth(0);
    const zoom = (await screenState(page)).zoom;
    const hA = await handle();
    const bA = await frameRect();
    const barA = await rectOf('.v2-frame-toolbar.visible');
    check(tag + `la poignée du cadre sélectionné est un rond à flèche circulaire (16 pixels de mise en page : ${Math.round(hA ? hA.width : 0)} pixels à ${Math.round(zoom * 100)} %), au-dessus du milieu de son bord haut (à 30 pixels de mise en page), dans le panneau, avec son info-bulle, en « grab », et reçoit la souris`,
      !!hA && hA.display === 'block' && hA.svg && hA.tip === T.rotateTip && hA.cursor === 'grab' && inPanel(hA) && hA.hit && near(hA.x, bA.x, 1.6) && hA.bottom < bA.top - 3 && near(bA.top - hA.top, 30 * zoom, 2.5) && near(hA.width, 16 * zoom, 1.2), { hA, bA, zoom });
    check(tag + 'la barre du cadre est affichée et ne couvre pas la poignée', !!barA && !overlap(barA, hA), { barA, hA });
    const ratioHandle = await contrastOf(page, '#editor-container .pp-ff-selected .pp-ff-rotate');
    check(tag + 'la flèche de la poignée se voit sur son fond blanc à 3:1 au moins (comme les huit autres poignées)', ratioHandle >= 3, ratioHandle);
    if (full) {
      const cursorsA = await page.evaluate(() => ['n', 'e', 'se'].map(s => getComputedStyle(document.querySelector('#editor-container .pp-ff-selected .pp-ff-handle-' + s)).cursor));
      check(tag + 'les poignées d\'un cadre droit gardent leurs curseurs (n : ns-resize, e : ew-resize, se : nwse-resize)', JSON.stringify(cursorsA) === JSON.stringify(['ns-resize', 'ew-resize', 'nwse-resize']), cursorsA);

      // Un cadre pivoté : la poignée tourne avec lui, les curseurs des côtés aussi.
      await click('.pp-slide-item', 1);
      await leave();
      check(tag + 'le cadre C (30°) se sélectionne', await selectNth(3));
      await bringNth(3);
      const gC = await geo();
      const hC = await handle();
      const barC = await rectOf('.v2-frame-toolbar.visible');
      const center = { x: gC.straight.left + gC.straight.width / 2, y: gC.straight.top + gC.straight.height / 2 };
      const expected = aim(center, gC.straight.height / 2 + 22 * gC.zoom, gC.rot);
      check(tag + 'la poignée d\'un cadre à 30° tourne avec lui : à 22 pixels de mise en page au-delà du milieu de son bord haut, dans l\'axe tourné du cadre, dans le panneau, et reçoit la souris',
        gC.rot === 30 && !!hC && hC.display === 'block' && inPanel(hC) && hC.hit && Math.hypot(hC.x - expected[0], hC.y - expected[1]) <= 2.5, { hC, expected, gC });
      check(tag + 'la barre du cadre pivoté ne couvre pas la poignée', !!barC && !overlap(barC, hC), { barC, hC });
      const cursorsC = await page.evaluate(() => ['n', 'e', 'se', 'w'].map(s => getComputedStyle(document.querySelector('#editor-container .pp-ff-selected .pp-ff-handle-' + s)).cursor));
      check(tag + 'les curseurs des poignées suivent l\'angle (à 30° : n : nesw-resize, e : nwse-resize, se : ns-resize, w : nwse-resize)', JSON.stringify(cursorsC) === JSON.stringify(['nesw-resize', 'nwse-resize', 'ns-resize', 'nwse-resize']), cursorsC);
      const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-thumb .pp-ff-rotate')).filter(h => getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 0).length);
      check(tag + 'aucune poignée de rotation n\'est visible dans les miniatures de la bande', thumbs === 0, thumbs);

      // Une ligne n'a pas de poignée de rotation.
      check(tag + 'la ligne se sélectionne', await selectNth(2));
      const lineUi = await page.evaluate(() => ({
        rotate: document.querySelectorAll('#editor-container .pp-ff-selected .pp-ff-rotate').length,
        kinds: Array.from(document.querySelectorAll('#editor-container .pp-ff-selected [data-ff-kind]')).map(e => e.dataset.ffKind).sort(),
      }));
      check(tag + 'une ligne sélectionnée n\'a pas de poignée de rotation (ses bouts se glissent) : sa bande et ses deux bouts seulement', lineUi.rotate === 0 && JSON.stringify(lineUi.kinds) === JSON.stringify(['end', 'move', 'start']), lineUi);

      // La Lecture : ni poignée, ni interface.
      await leave();
      await click('#btn-mode-read');
      await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
      await sleep(900);
      const reader = await page.evaluate(() => ({
        handles: Array.from(document.querySelectorAll('#reader-container .pp-ff-rotate')).filter(h => getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 0).length,
        turned: Array.from(document.querySelectorAll('#reader-container .pp-free-frame[data-ff-rot]')).map(a => a.getAttribute('data-ff-rot')),
        transforms: Array.from(document.querySelectorAll('#reader-container .pp-free-frame[data-ff-rot] > .pp-free-frame-box')).map(b => getComputedStyle(b).transform),
      }));
      check(tag + 'la Lecture ne montre aucune poignée, et tourne le cadre C (30°) : sa boîte porte la rotation de l\'éditeur', reader.handles === 0 && JSON.stringify(reader.turned) === JSON.stringify(['30']) && reader.transforms.length === 1 && /^matrix\(0\.866\d*, 0\.5\d*, -0\.5\d*, 0\.866\d*, 0, 0\)$/.test(reader.transforms[0]), reader);
      await click('#btn-mode-edit');
      await sleep(900);
      await snap(page, `${lang}-poignee`);
    }
  }

  // --- 3. La souris et le clavier.
  if (wanted(3)) {
    console.log('\n' + tag + '3) La souris et le clavier');
    // 3A. Glisser la poignée : un pas d'historique, Maj, Échap (modèle « Gestes »).
    check(tag + 'le modèle « Gestes » s\'ouvre', await open(10, 2));
    await click('.pp-slide-item', 0);
    await leave();
    check(tag + 'le cadre A se sélectionne', await selectNth(0));
    await bringNth(0);
    const before = (await docState(page)).frames[0];
    const c0 = await frameRect();
    const h0 = await handle();
    const d0 = Math.hypot(h0.x - c0.x, h0.y - c0.y);
    await gap();
    const during = await turnDrag(aim(c0, d0, 90));
    const after = (await docState(page)).frames[0];
    const c1 = await frameRect();
    const shown = numberOf(during.badge);
    check(tag + `glisser la poignée jusqu'à la droite du cadre le pivote de 90° (l'angle que la souris parcourt autour de son centre) : ${after.rot}°`, near(after.rot, 90, 1.5), after);
    check(tag + 'l\'angle se lit près de la souris pendant le geste (une pastille de la page, droite, dans le panneau, en degrés), le cadre le montre en direct, et le document ne le garde qu\'au relâchement',
      !!during.badge && /°$/.test(during.badge) && near(shown, 90, 1.5) && near(numberOf(during.painted), shown, 0.05) && !!during.badgeRect && inPanel(during.badgeRect) && during.stored[0] === 0, during);
    check(tag + 'l\'angle utilise la virgule du français / le point de l\'anglais', !/[.,]/.test(during.badge || '') || (lang === 'fr' ? /,/.test(during.badge) && !/\./.test(during.badge) : /\./.test(during.badge) && !/,/.test(during.badge)), during.badge);
    check(tag + `la pastille d'angle se lit à 4,5:1 au moins (${during.ratio})`, during.ratio >= 4.5, during.ratio);
    check(tag + 'au relâchement la pastille disparaît, le cadre reste sélectionné, ses mesures et son centre à l\'écran ne bougent pas',
      await badgeGone() && (await docState(page)).selection.selectedFrame && after.x === before.x && after.y === before.y && after.w === before.w && after.h === before.h && near(c1.x, c0.x, 0.8) && near(c1.y, c0.y, 0.8), { before, after, c0, c1 });
    await undo();
    const undone = (await docState(page)).frames[0];
    check(tag + 'un seul Ctrl+Z défait toute la rotation : le cadre est de nouveau droit (plus de `data-ff-rot`)', undone.rot === 0 && (await rotAttr(0)) === null, { undone, attr: await rotAttr(0) });
    await redo();
    check(tag + 'Ctrl+Maj+Z la refait : 90° de nouveau', near((await docState(page)).frames[0].rot, 90, 1.5), (await docState(page)).frames[0]);
    await undo();
    await selectNth(0);
    const h1 = await handle();
    const c2 = await frameRect();
    const d1 = Math.hypot(h1.x - c2.x, h1.y - c2.y);
    // Maj tient l'angle sur un pas de 15° : 40° tombe sur 45°.
    await gap();
    const snapped = await turnDrag(aim(c2, d1, 40), { shift: true });
    const afterSnap = (await docState(page)).frames[0];
    check(tag + 'avec Maj, le geste à 40° tombe sur 45° (par pas de 15°), la pastille le dit', afterSnap.rot === 45 && numberOf(snapped.badge) === 45 && numberOf(snapped.painted) === 45, { afterSnap, snapped });
    await snap(page, `${lang}-pivote-45`);
    // Échap abandonne : le cadre garde ses 45°, rien n'entre dans l'historique.
    await selectNth(0);
    const h2 = await handle();
    const c3 = await frameRect();
    const d2 = Math.hypot(h2.x - c3.x, h2.y - c3.y);
    await gap();
    const aborted = await turnDrag(aim(c3, d2, 200), { abort: true });
    const afterAbort = (await docState(page)).frames[0];
    check(tag + 'Échap pendant le geste l\'abandonne : le cadre montrait 200° et reprend ses 45°, la pastille a disparu, le cadre reste sélectionné',
      near(numberOf(aborted.painted), 200, 3) && afterAbort.rot === 45 && (await rotAttr(0)) === '45' && await badgeGone() && (await docState(page)).selection.selectedFrame, { aborted, afterAbort, attr: await rotAttr(0) });
    await undo();
    check(tag + 'l\'abandon n\'a rien laissé dans l\'historique : un Ctrl+Z défait la rotation de 45° d\'avant, pas un geste d\'avant', (await docState(page)).frames[0].rot === 0, (await docState(page)).frames[0]);
    await redo();

    if (full) {
      // Enregistrer, rouvrir : l'angle revient (modèle « Gestes » : A à 45°).
      const written = await html();
      check(tag + 'le HTML enregistré écrit `data-ff-rot="45"` pour le cadre A, et pour lui seul', (written.match(/data-ff-rot="45"/g) || []).length === 1 && (written.match(/data-ff-rot=/g) || []).length === 2, (written.match(/data-ff-rot="[^"]*"/g) || []));
      await save();
      check(tag + 'l\'enregistrement vide les modifications non enregistrées', !(await unsaved()));
      await open(8, 2);
      check(tag + 'le modèle « Gestes » rouvert garde l\'angle (A à 45°, C à 30°, B droit)', await open(10, 2) && JSON.stringify((await docState(page)).frames.map(f => f.rot)) === JSON.stringify([45, 0, 30]), (await docState(page)).frames.map(f => f.rot));
    }

    // 3B. Le clavier : Alt + ← → (modèle « Clavier »).
    check(tag + 'le modèle « Clavier » s\'ouvre', await open(11, 2));
    await click('.pp-slide-item', 0);
    await leave();
    check(tag + 'le cadre A se sélectionne', await selectNth(0));
    const sequence = [['Alt+ArrowRight', 15], ['Alt+Shift+ArrowLeft', 14], ['Alt+ArrowLeft', 359], ['Alt+ArrowLeft', 344]];
    const seen = [];
    // Les messages que la touche envoie à la ligne d'état sont relevés à la source : un autre message (l'enregistrement automatique) peut la recouvrir avant qu'on la lise.
    await page.evaluate(() => { window.__says = []; const original = SlidesEntry.status; SlidesEntry.status = function (...args) { window.__says.push(String(args[0])); return original.apply(this, args); }; });
    for (const [key, want] of (full ? sequence : sequence.slice(0, 2))) {
      await gap();
      await press(key);
      const says = await page.evaluate(() => window.__says.splice(0));
      seen.push({ key, want, got: (await docState(page)).frames[0].rot, says, shown: seen.length ? null : await status() });
    }
    check(tag + 'Alt + → pivote le cadre sélectionné de 15°, Alt + Maj + ← d\'un degré, Alt + ← de 15° (0 − 15 = 345 : 359 − 15 = 344) : les angles, et chaque touche le dit dans la ligne d\'état',
      seen.every(s => s.got === s.want && s.says.includes(T.rotated(s.want))), seen);
    check(tag + 'la première touche écrit « ' + T.rotated(15) + ' » dans la ligne d\'état, à la vue de la personne', seen[0].shown === T.rotated(15), seen[0]);
    check(tag + 'le cadre reste sélectionné après les touches', (await docState(page)).selection.selectedFrame, await docState(page));
    if (full) {
      const back = [];
      for (const want of [359, 14, 15, 0]) {
        await undo();
        back.push({ want, got: (await docState(page)).frames[0].rot });
      }
      check(tag + 'chaque touche est UN pas d\'historique : quatre Ctrl+Z ramènent 359, 14, 15 puis 0 (droit, plus de `data-ff-rot`)', back.every(b => b.got === b.want) && (await rotAttr(0)) === null, { back, attr: await rotAttr(0) });

      // Rien ne change sans cadre sélectionné, ni sur une ligne.
      await cursorIn('Premier texte');
      const textBefore = await html();
      await gap();
      await press('Alt+ArrowRight');
      check(tag + 'Alt + → sans cadre sélectionné (le curseur dans le texte) ne change rien au document', (await html()) === textBefore && !(await unsaved()), (await docState(page)).frames.map(f => f.rot));
      await click('.pp-slide-item', 1);
      await leave();
      check(tag + 'la ligne se sélectionne', await selectNth(2));
      const lineBefore = await html();
      await gap();
      await press('Alt+ArrowRight');
      await press('Alt+ArrowLeft');
      check(tag + 'Alt + → et Alt + ← sur une ligne sélectionnée ne changent rien (une ligne ne pivote pas)', (await html()) === lineBefore && (await docState(page)).selection.selectedLine, (await docState(page)).lines);
    }
  }

  // --- 3 (suite). Redimensionner, déplacer, dupliquer, coller un cadre pivoté à la souris (modèle « Mesures »).
  if (full && wanted(3)) {
    check(tag + 'le modèle « Mesures » s\'ouvre', await open(12, 2));
    await click('.pp-slide-item', 1);
    await leave();
    check(tag + 'le cadre C (30°) se sélectionne', await selectNth(3));
    await bringNth(3);
    const start = await frameBy('Pivote C');
    const screen = await screenState(page);
    const k = k0(screen);
    const natural = start.h;   // le texte d'une ligne tient dans les 80 points
    // La poignée « e » tirée de 40 pixels vers la droite : le côté « w » ne bouge pas, la largeur suit la souris projetée sur l'axe du cadre (cos 30°).
    const e = await rectOf('#editor-container .pp-ff-selected .pp-ff-handle-e');
    await gap();
    await drag([e.x, e.y], [e.x + 40, e.y]);
    const afterE = await frameBy('Pivote C');
    const w0 = pagePoint(start, natural, 0, natural / 2);
    const w1 = pagePoint(afterE, afterE.h, 0, afterE.h / 2);
    const wantW = start.w + (40 / k) * Math.cos(radians(30));
    check(tag + `la poignée « e » d'un cadre à 30° tirée de 40 pixels : la largeur suit la souris projetée sur l'axe du cadre (${afterE.w} points pour ${wantW.toFixed(2)}), le côté d'en face ne bouge pas (${Math.hypot(w1[0] - w0[0], w1[1] - w0[1]).toFixed(2)} point), l'angle et la hauteur restent`,
      afterE.rot === 30 && afterE.h === start.h && near(afterE.w, wantW, 1) && Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) <= 0.7, { start, afterE, wantW });
    // Le coin « se » tiré de (30, 25) pixels : le coin « nw » ne bouge pas.
    const se = await rectOf('#editor-container .pp-ff-selected .pp-ff-handle-se');
    await gap();
    await drag([se.x, se.y], [se.x + 30, se.y + 25]);
    const afterSE = await frameBy('Pivote C');
    const dxpt = 30 / k;
    const dypt = 25 / k;
    const wantW2 = afterE.w + dxpt * Math.cos(radians(30)) + dypt * Math.sin(radians(30));
    const wantH2 = afterE.h - dxpt * Math.sin(radians(30)) + dypt * Math.cos(radians(30));
    const nw0 = pagePoint(afterE, afterE.h, 0, 0);
    const nw1 = pagePoint(afterSE, afterSE.h, 0, 0);
    check(tag + `le coin « se » d'un cadre à 30° tiré de (30, 25) pixels : ${afterSE.w} x ${afterSE.h} points pour ${wantW2.toFixed(2)} x ${wantH2.toFixed(2)} (projection sur ses axes), le coin « nw » ne bouge pas (${Math.hypot(nw1[0] - nw0[0], nw1[1] - nw0[1]).toFixed(2)} point), l'angle reste`,
      afterSE.rot === 30 && near(afterSE.w, wantW2, 1) && near(afterSE.h, wantH2, 1) && Math.hypot(nw1[0] - nw0[0], nw1[1] - nw0[1]) <= 0.7, { afterE, afterSE, wantW2, wantH2 });
    // Le déplacer par son bord haut (à un quart de sa largeur, loin de la poignée « n ») : x + 36/k, y + 24/k, rien d'autre ne change.
    const g = await geo();
    const W = g.straight.width;
    const H = g.straight.height;
    const c = { x: g.straight.left + W / 2, y: g.straight.top + H / 2 };
    const a = radians(g.rot);
    const edgePoint = [c.x + (-W / 4) * Math.cos(a) - (-H / 2) * Math.sin(a), c.y + (-W / 4) * Math.sin(a) + (-H / 2) * Math.cos(a)];
    const grabbed = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? { kind: el.dataset.ffKind || null, cls: el.className } : null; }, edgePoint);
    check(tag + 'le bord haut d\'un cadre pivoté se saisit à sa place tournée (pour le déplacer)', !!grabbed && grabbed.kind === 'move', { grabbed, edgePoint });
    await gap();
    await drag(edgePoint, [edgePoint[0] + 36, edgePoint[1] + 24]);
    const afterMove = await frameBy('Pivote C');
    check(tag + `le déplacer par son bord de 36 x 24 pixels : x + ${(36 / k).toFixed(2)}, y + ${(24 / k).toFixed(2)} points, l'angle, la largeur et la hauteur restent`,
      afterMove.rot === 30 && near(afterMove.x, afterSE.x + 36 / k, 0.8) && near(afterMove.y, afterSE.y + 24 / k, 0.8) && afterMove.w === afterSE.w && afterMove.h === afterSE.h, { afterSE, afterMove });
    for (const want of [afterSE, afterE, start]) {
      await undo();
      const now = await frameBy('Pivote C');
      check(tag + `un Ctrl+Z défait un geste : ${want.w} x ${want.h} à (${want.x}, ${want.y})`, now.x === want.x && now.y === want.y && now.w === want.w && now.h === want.h && now.rot === 30, { now, want });
    }

    // Dupliquer garde l'angle ; coller aussi.
    await selectNth(3);
    await leave();
    await click('.v2-frame-toolbar.visible [data-action="duplicate"]');
    await sleep(300);
    const dup = (await docState(page)).frames.filter(f => f.text === 'Pivote C');
    check(tag + `« ${T.duplicate} » garde l'angle : deux cadres à 30°, la copie décalée de 12 points et sélectionnée`, dup.length === 2 && dup.every(f => f.rot === 30) && near(dup[1].x, dup[0].x + 12, 0.01) && near(dup[1].y, dup[0].y + 12, 0.01) && (await docState(page)).selection.selectedFrame, dup);
    await cursorIn('Texte deux');
    await page.evaluate((markup) => { const ed = EditorCore.getEditor(); ed.view.pasteHTML(markup); }, FRAME(300, 300, 150, 50, 135, '', '<p>Collé pivoté</p>'));
    await sleep(500);
    const pasted = (await docState(page)).frames.find(f => f.text === 'Collé pivoté');
    check(tag + 'un cadre collé garde son angle (135°)', !!pasted && pasted.rot === 135, pasted);
  }

  // --- 4. Le dessin : de l'encre dedans, du papier dehors (éditeur, Lecture, miniature, diaporama).
  if (full && wanted(4)) {
    console.log('\n' + tag + '4) Le dessin d\'un cadre pivoté');
    // Les captures se font sur un écran plus grand (le zoom de la page y est plus proche de 1 : un contour de 2 pixels y est un vrai contour).
    const big = await session({ lang, colorScheme, width: 1500, height: 1000 });
    await big.open(8, 2);
    await big.click('.pp-slide-item', 0);
    await big.page.mouse.move(1400, 900);
    await big.cursorIn('Texte');
    await sleep(400);
    const frames = (await docState(big.page)).frames;
    const M = frames.find(f => f.shape === 'rect' && f.rot === 45 && f.w === 200 && f.h === 70);
    const A = frames.find(f => f.shape === 'ellipse' && f.rot === 90 && f.w === 90);
    const D = frames.find(f => f.shape === 'rect' && f.x === -60);
    check(tag + 'le modèle « Sorties » a ses trois formes pleines (M : rectangle à 45°, A : ellipse à 90°, D : rectangle à 45° qui sort de la page)', !!M && !!A && !!D, frames.map(f => [f.shape, f.rot, f.w, f.h, f.x]));
    const SHAPES = [
      { name: 'M', ink: '#be185d', slide: 0, distance: p => signedDistance(cornersOf(M, M.h), p), box: envelopeOf(cornersOf(M, M.h), 12) },
      { name: 'A', ink: '#b45309', slide: 0, distance: p => ellipseDistance(A, A.h, p), box: envelopeOf(cornersOf(A, A.h), 12) },
    ];
    const PAGE = [0, 0, 960, 540];
    const paintedBy = async (b, root, shapes, shotName) => {
      const screen = await screenState(b.page, root);
      const k = PT * screen.zoom;
      const shot = (await b.page.screenshot({ type: 'png' })).toString('base64');
      const out = [];
      for (const s of shapes) {
        const probes = probesOf({ distance: s.distance, box: s.box, map: (x, y) => onScreen(screen, s.slide, [x, y]), k, pageBox: PAGE });
        out.push(Object.assign({ name: s.name, probes: probes.length }, await probeOf(b.page, { b64: shot, probes, ink: s.ink, paperAt: [Math.round(screen.contentLeft + 30), Math.round(screen.pageTops[s.slide] + 30 * k)] })));
      }
      if (shotName) await snap(b.page, shotName);
      return { screen, results: out };
    };
    const edit1 = await paintedBy(big, '#editor-container', SHAPES, `${lang}-dessin-editeur`);
    check(tag + `l'éditeur dessine le rectangle M (45°) et l'ellipse A (90°) comme leur modèle (zoom ${Math.round(edit1.screen.zoom * 100)} %) : ${edit1.results.map(r => `${r.name} ${r.checked} points`).join(', ')}, de l'encre dedans (${edit1.results.reduce((n, r) => n + r.inked, 0)}), du papier dehors`,
      edit1.results.every(r => r.mismatches.length === 0 && r.checked > 150 && r.inked > 60 && r.outside === 0), edit1.results.filter(r => r.mismatches.length || r.checked <= 150 || r.inked <= 60));
    // La diapositive 2 : le rectangle D sort de la page à gauche, rogné à son bord.
    await big.click('.pp-slide-item', 1);
    await big.page.mouse.move(1400, 900);
    await big.cursorIn('Page deux');
    await sleep(500);
    const SHAPE_D = { name: 'D', ink: '#be185d', slide: 1, distance: p => signedDistance(cornersOf(D, D.h), p), box: envelopeOf(cornersOf(D, D.h), 12) };
    const screen2 = await screenState(big.page);
    const k2 = PT * screen2.zoom;
    const shot2 = (await big.page.screenshot({ type: 'png' })).toString('base64');
    const probesD = probesOf({ distance: SHAPE_D.distance, box: SHAPE_D.box, map: (x, y) => onScreen(screen2, 1, [x, y]), k: k2, pageBox: PAGE });
    // Les points de la forme qui sont hors de la page (à gauche) : pas d'encre.
    const clipped = [];
    for (let y = D.y - 40; y <= D.y + D.h + 40; y += 3 / k2) for (let x = -40; x <= -3; x += 3 / k2) if (SHAPE_D.distance([x, y]) < -2 / k2) { const [px, py] = onScreen(screen2, 1, [x, y]); clipped.push([Math.floor(px), Math.floor(py), 2]); }
    const resD = await probeOf(big.page, { b64: shot2, probes: probesD.concat(clipped), ink: SHAPE_D.ink, paperAt: [Math.round(screen2.contentLeft + 30), Math.round(screen2.pageTops[1] + 30 * k2)] });
    check(tag + `le rectangle D (45°) qui sort de la page à gauche est dessiné dans la page (${resD.inked} points d'encre) et rogné à son bord (${clipped.length} points de la forme hors page : pas d'encre)`, resD.mismatches.length === 0 && resD.inked > 60 && clipped.length > 60 && resD.outside === 0, resD);
    await snap(big.page, `${lang}-dessin-hors-page`);
    // La Lecture, aux pixels.
    await big.page.mouse.move(1400, 900);
    await big.click('#btn-mode-read');
    await big.page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    const read1 = await paintedBy(big, '#reader-container', SHAPES, `${lang}-dessin-lecture`);
    check(tag + `la Lecture dessine M et A comme l'éditeur (aux pixels) : ${read1.results.map(r => `${r.name} ${r.checked} points`).join(', ')}`, read1.results.every(r => r.mismatches.length === 0 && r.checked > 150 && r.inked > 60 && r.outside === 0), read1.results.filter(r => r.mismatches.length || r.checked <= 150));
    await big.click('#btn-mode-edit');
    await sleep(900);
    // La miniature et le diaporama : la même rotation que l'éditeur.
    await big.click('.pp-slide-item', 0);
    await big.page.mouse.move(1400, 900);
    const turns = await big.page.evaluate(() => {
      const read = root => Array.from(root.querySelectorAll('.pp-free-frame[data-ff-rot] > .pp-free-frame-box')).map(b => getComputedStyle(b).transform);
      return { editor: read(document.querySelector('#editor-container .tiptap')).slice(0, 6), thumb: read(document.querySelectorAll('.pp-slide-thumb')[0]) };
    });
    check(tag + 'la miniature de la première diapositive tourne ses six cadres comme l\'éditeur (même matrice)', turns.editor.length === 6 && JSON.stringify(turns.thumb) === JSON.stringify(turns.editor) && turns.thumb.every(m => /^matrix\(/.test(m)), turns);
    await big.click('.pp-slide-show-open');
    await big.page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
    await sleep(700);
    const showTurns = await big.page.evaluate(() => {
      const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
      const shadow = host && host.shadowRoot;
      return shadow ? Array.from(shadow.querySelectorAll('.pp-free-frame[data-ff-rot] > .pp-free-frame-box')).map(b => getComputedStyle(b).transform) : null;
    });
    check(tag + 'le diaporama tourne les six cadres de la première diapositive comme l\'éditeur (même matrice, dans le même ordre), puis les trois de la seconde', !!showTurns && showTurns.length === 9 && JSON.stringify(showTurns.slice(0, 6)) === JSON.stringify(turns.editor), showTurns);
    await big.press('Escape');
    await big.page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
    S.big = big;
  }

  // --- 5. Les sorties : le PDF, le Word, le HTML, le Markdown.
  if (full && wanted(5)) {
    console.log('\n' + tag + '5) Les sorties : PDF, Word, HTML, Markdown');
    const big = S.big || await session({ lang, colorScheme, width: 1500, height: 1000 });
    await big.open(8, 2);
    await big.click('.pp-slide-item', 0);
    await big.page.mouse.move(1400, 900);
    await big.cursorIn('Texte');
    await sleep(500);
    const frames = (await docState(big.page)).frames;
    const M = frames.find(f => f.shape === 'rect' && f.rot === 45 && f.w === 200 && f.h === 70);
    const A = frames.find(f => f.shape === 'ellipse' && f.rot === 90 && f.w === 90);
    const D = frames.find(f => f.shape === 'rect' && f.x === -60);
    const [pdfDownload] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
    const pdfB64 = readFileSync(await pdfDownload.path()).toString('base64');
    const pdf1 = await renderPdfPage(big.page, pdfB64, 1, 2);
    const pdf2 = await renderPdfPage(big.page, pdfB64, 2, 2);
    check(tag + 'le PDF a deux pages, une par diapositive, de 960 x 540 points', pdf1.numPages === 2 && near(pdf1.width, 960, 0.5) && near(pdf1.height, 540, 0.5), { pages: pdf1.numPages, w: pdf1.width, h: pdf1.height });
    // Le dessin du PDF, aux pixels : M et A (page 1), D (page 2).
    const PAGE_BOX = [0, 0, 960, 540];
    const inPdf = async (png, shapes) => {
      const out = [];
      for (const s of shapes) {
        const probes = probesOf({ distance: s.distance, box: s.box, map: (x, y) => [x * 2, y * 2], k: 2, pageBox: PAGE_BOX });
        out.push(Object.assign({ name: s.name, probes: probes.length }, await probeOf(big.page, { b64: png, probes, ink: s.ink, paperAt: [60, 60] })));
      }
      return out;
    };
    const pdfShapes = [
      { name: 'M', ink: '#be185d', distance: p => signedDistance(cornersOf(M, M.h), p), box: envelopeOf(cornersOf(M, M.h), 12) },
      { name: 'A', ink: '#b45309', distance: p => ellipseDistance(A, A.h, p), box: envelopeOf(cornersOf(A, A.h), 12) },
    ];
    const pdfResults = await inPdf(pdf1.png, pdfShapes);
    check(tag + `le PDF dessine le rectangle M (45°) et l'ellipse A (90°) à leur place (aux pixels) : ${pdfResults.map(r => `${r.name} ${r.checked} points`).join(', ')}, de l'encre dedans, du papier dehors`, pdfResults.every(r => r.mismatches.length === 0 && r.checked > 150 && r.inked > 60 && r.outside === 0), pdfResults.filter(r => r.mismatches.length || r.checked <= 150));
    const pdfD = await inPdf(pdf2.png, [{ name: 'D', ink: '#be185d', distance: p => signedDistance(cornersOf(D, D.h), p), box: envelopeOf(cornersOf(D, D.h), 12) }]);
    check(tag + `le PDF dessine la part du rectangle D (45°) qui est dans la page, rognée à son bord : ${pdfD[0].inked} points d'encre`, pdfD[0].mismatches.length === 0 && pdfD[0].inked > 60 && pdfD[0].outside === 0, pdfD);
    // L'image du cadre à 15° (diapositive 2) : dans le PDF comme à l'écran, tournée avec le cadre, au même endroit de la page.
    await big.click('.pp-slide-item', 1);
    await big.page.mouse.move(1400, 900);
    await big.cursorIn('Page deux');
    await sleep(500);
    const screenImg = await screenState(big.page);
    const imgBox = await big.page.evaluate(() => { const img = document.querySelector('#editor-container .pp-free-frame img.editor-image'); const r = img.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, side: parseFloat(getComputedStyle(img).width) }; });
    const [imgX, imgY] = onPage(screenImg, 1, [imgBox.cx, imgBox.cy]);
    const redSpot = await colorSpots(big.page, pdf2.png, '#c80000');
    const sidePt = imgBox.side * 0.75;
    check(tag + `l'image du cadre à 15° est dans le PDF, de sa taille (${Math.round(sidePt * sidePt)} points carrés) et à sa place : son centre à (${imgX.toFixed(1)}, ${imgY.toFixed(1)}) à l'écran, à (${(redSpot.cx / 2).toFixed(1)}, ${(redSpot.cy / 2).toFixed(1)}) dans le PDF`,
      redSpot.n / 4 > 0.9 * sidePt * sidePt && redSpot.n / 4 < 1.05 * sidePt * sidePt && near(redSpot.cx / 2, imgX, 1.5) && near(redSpot.cy / 2, imgY, 1.5), { redSpot, imgBox, imgX, imgY });
    if (SHOTS) {
      await big.page.evaluate((b64) => { const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; img.id = '__pdfshot'; img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:1400px'; document.body.appendChild(img); }, pdf1.png);
      await sleep(400);
      await snap(big.page, `${lang}-pdf-page1`);
      await big.page.evaluate(() => document.getElementById('__pdfshot').remove());
    }

    // Le texte du PDF, mot à mot, à la place de l'éditeur : chaque morceau de texte que pdf.js relit est cherché dans les cadres de la diapositive ; son centre est comparé à celui de la boîte du texte à l'écran.
    const pdfPages = [pdf1, pdf2];
    const editorShot = await big.page.evaluate(() => ({ y: window.scrollY }));
    void editorShot;
    const matches = [];
    for (let slide = 0; slide < 2; slide++) {
      await big.click('.pp-slide-item', slide);
      await big.page.mouse.move(1400, 900);
      await sleep(500);
      const items = pdfPages[slide].items.filter(i => i.s.trim()).map(i => ({ ...pdfWord(i, pdfPages[slide].height), slide }));
      const found = await big.page.evaluate(({ words, slideNo }) => {
        const content = document.querySelector('#editor-container .tiptap');
        const zoom = EditorCore.layoutZoom(content);
        const k = (96 / 72) * zoom;
        const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
        const tops = [];
        let started = false;
        Array.from(content.children).forEach((child, i) => {
          const isBreak = child.classList.contains('page-break-marker');
          const isFrame = child.classList.contains('pp-free-frame');
          if (i === 0 || (tops.length && isBreak)) started = false;
          if (isBreak || isFrame || child.tagName === 'STYLE') return;
          if (!started) { tops.push(child.getBoundingClientRect().top - margin * zoom); started = true; }
        });
        const left = content.getBoundingClientRect().left;
        // Les nœuds de texte de la diapositive : ceux des cadres, puis ceux du texte de la page (qui ne sont pas ce que l'on compare, mais que le PDF écrit aussi).
        const nodes = [];
        let slide = 0;
        Array.from(content.children).forEach((child) => {
          if (child.classList.contains('page-break-marker')) { slide++; return; }
          if (slide !== slideNo || child.tagName === 'STYLE') return;
          const isFrame = child.classList.contains('pp-free-frame');
          const walker = document.createTreeWalker(isFrame ? child.querySelector('.pp-free-frame-content') : child, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push({ node: n, frame: isFrame });
        });
        return words.map((w) => {
          let best = null;
          nodes.forEach(({ node, frame }) => {
            let from = 0;
            for (;;) {
              const at = node.data.indexOf(w.s, from);
              if (at < 0) break;
              from = at + 1;
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + w.s.length);
              const r = range.getBoundingClientRect();
              const cx = (r.left + r.width / 2 - left) / k;
              const cy = (r.top + r.height / 2 - tops[slideNo]) / k;
              const d = Math.hypot(cx - w.cx, cy - w.cy);
              if (!best || d < best.d) best = { cx, cy, d, frame };
            }
          });
          return { s: w.s, deg: w.deg, pdf: [w.cx, w.cy], dom: best ? [best.cx, best.cy] : null, d: best ? best.d : null, frame: best ? best.frame : null };
        });
      }, { words: items, slideNo: slide });
      matches.push(...found.map(f => ({ ...f, slide })));
    }
    if (process.env.ROTATION_DEBUG) console.log(matches.map(m => `${m.slide} ${JSON.stringify(m.s)} deg=${m.deg.toFixed(1)} d=${m.d === null ? '-' : m.d.toFixed(2)} ${m.frame ? 'cadre' : 'page'} pdf=${m.pdf.map(v => v.toFixed(1))} dom=${m.dom ? m.dom.map(v => v.toFixed(1)) : '-'}`).join('\n'));
    const matched = matches.filter(m => m.d !== null && m.frame);
    const unmatched = matches.filter(m => m.d === null).map(m => m.s);
    const worstWord = matched.reduce((m, x) => (x.d > m.d ? x : m), { d: 0 });
    const tolerance = 1.5;
    check(tag + `le texte du PDF est à la place que l'éditeur lui donne : ${matched.length} morceaux de texte comparés (centre de leur boîte, sur la page de leur diapositive), le plus éloigné à ${worstWord.d.toFixed(2)} point (« ${worstWord.s || ''} »), au plus ${tolerance}`,
      matched.length > 25 && matched.every(m => m.d <= tolerance), matched.filter(m => m.d > tolerance).slice(0, 6));
    check(tag + 'seuls les puces et les numéros de liste (et leurs espaces) n\'ont pas de texte dans l\'éditeur : rien d\'autre ne manque', unmatched.every(s => /^[\s•\d.◦▪☐☑)]+$/.test(s)), unmatched);
    const angles = matched.filter(m => /Rectangle|Ellipse/.test(m.s)).map(m => Math.round(m.deg));
    check(tag + 'les mots d\'un cadre pivoté sont tournés de son angle dans le PDF (45° et 90° pour le rectangle et l\'ellipse)', angles.some(d => Math.abs(d - 45) <= 1) && angles.some(d => Math.abs(Math.abs(d) - 90) <= 1), angles);
    const bonjour = matches.find(m => m.s.startsWith('Bonjour'));
    check(tag + 'le texte du cadre R1 (20°) est tourné de 20° dans le PDF', !!bonjour && near(bonjour.deg, 20, 0.6), bonjour);
    const droit = matches.filter(m => m.frame && m.slide === 0 && /^(Cadre|droit)$/.test(m.s));
    check(tag + 'le texte d\'un cadre droit n\'est pas touché : « Cadre » et « droit » à angle nul dans le PDF, à leur place', droit.length === 2 && droit.every(m => near(m.deg, 0, 0.01) && m.d <= tolerance), droit);

    // Les liens et le surlignage du cadre R4 (330°).
    const link = pdf1.links.find(l => l.url === 'https://example.org/a');
    check(tag + 'le lien « un lien » du cadre à 330° est cliquable dans le PDF (une zone sur la page, à l\'adresse)', !!link && link.rect[2] - link.rect[0] > 8 && link.rect[3] - link.rect[1] > 8, pdf1.links);

    // Le Word.
    await big.page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const [docxDownload] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
    const anchors = await big.page.evaluate(wordAnchorsOf, readFileSync(await docxDownload.path()).toString('base64'));
    const turned = anchors.filter(a => a.rot !== null).map(a => ({ prst: a.prst, rot: Number(a.rot), cx: a.cx / EMU, cy: a.cy / EMU, x: a.x / EMU, y: a.y / EMU, text: a.text.slice(0, 18) }));
    const byRot = rot => turned.filter(a => a.rot === rot * 60000);
    check(tag + 'le Word écrit la rotation de chaque cadre pivoté (`a:xfrm rot`, 60 000 par degré) : 20°, 90° (deux), 45° (trois : R3, M et D), 330°, 30° et 15°',
      byRot(20).length === 1 && byRot(90).length === 2 && byRot(45).length === 3 && byRot(330).length === 1 && byRot(30).length === 1 && byRot(15).length === 1 && turned.length === 9, turned);
    const wordM = turned.find(a => a.rot === 45 * 60000 && near(a.cx, 200, 0.01));
    const wordA = turned.find(a => a.rot === 90 * 60000 && near(a.cx, 90, 0.01));
    check(tag + 'la boîte écrite est la boîte DROITE du cadre (sa position, sa largeur et sa hauteur d\'avant la rotation) : M à (120, 380) en 200 x 70, A à (820, 360) en 90 x 160',
      !!wordM && near(wordM.x, M.x, 0.01) && near(wordM.y, M.y, 0.01) && near(wordM.cy, 70, 0.01) && !!wordA && near(wordA.x, A.x, 0.01) && near(wordA.y, A.y, 0.01) && near(wordA.cy, 160, 0.01), { wordM, wordA });
    const straightWord = anchors.find(a => /Cadre droit/.test(a.text));
    check(tag + 'le cadre droit n\'a pas de rotation dans le Word', !!straightWord && (straightWord.rot === null || Number(straightWord.rot) === 0), straightWord);
    await big.page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });

    // Le HTML et le Markdown ne gardent que le texte.
    const text = await big.page.evaluate(async (markup) => {
      await ExportEngines.loadAll();
      const doc = await HtmlExport.htmlToDocument(markup, {});
      const md = await MarkdownExport.htmlToMarkdown(markup);
      return { html: typeof doc === 'string' ? doc : JSON.stringify(doc), md };
    }, '<h1>Titre</h1>' + FRAME(100, 100, 200, 100, 45, ELLIPSE, '<p>Texte <strong>gras</strong> pivoté</p>') + '<p>Texte</p>');
    check(tag + 'le HTML et le Markdown gardent le texte du cadre pivoté (en gras comme il l\'est), sans angle, sans position, sans dessin', /Texte <strong>gras<\/strong> pivoté/.test(text.html) && !/ff-rot|ff-x|data-ff|--ff-|pp-free-frame|rotate\(/.test(text.html) && /Texte \*\*gras\*\* pivoté/.test(text.md) && !/ff-rot|rotate/.test(text.md), { html: text.html.slice(0, 400), md: text.md });
  }
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
