#!/usr/bin/env node
// Les formes d'une présentation, leur fond et leur trait (js/shape-geometry.js, js/free-frame.js, css/free-frame.css, js/objects-menu.js ; demande du 21/10 à 18:35 :
// « ajout de forme »), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives »
// active. Une forme est un cadre de texte (dev-tests/verify-free-frame.mjs) qui porte en plus sa sorte, son fond et son trait.
//  LE MENU « OBJETS » (le bouton de la barre d'outils du haut, js/objects-menu.js ; il était sous les miniatures jusqu'au 22/10) : sous la ligne « Cadre de texte », un titre « Formes » et une
//   grille de seize boutons en deux rangées de huit (une icône chacun, le nom en info-bulle et en nom accessible, dans la langue de la page), entière dans le panneau, lisible (>= 4,5:1) ;
//   au clavier ↑ ↓ ← → Début Fin se parcourent par rangées et par colonnes (de la grille à la rangée des lignes et retour), Entrée pose la forme choisie, Échap rend le clavier au bouton.
//  LA POSE : chacune des seize formes, au vrai clic, est posée au centre de la diapositive du curseur à sa taille d'origine, avec son fond et son trait d'origine, SÉLECTIONNÉE (sa barre est
//   là), devant les autres ; un seul Ctrl+Z la défait au caractère près.
//  LE CONTOUR : celui des huit formes de la deuxième série (flèches vers le haut et le bas, chevron, pentagone, hexagone, parallélogramme, croix, bulle) est celui que PowerPoint leur donne à
//   leurs réglages d'origine, et leur rectangle de texte aussi : les points sont comparés à ceux que les formules des formes prédéfinies (`presetShapeDefinitions`) donnent, à plusieurs tailles.
//  LE DESSIN : dans l'éditeur, chaque forme est dessinée comme son contour - une grille de points de la capture est de la couleur du fond dedans, du papier dehors, du trait sur le bord (à
//   2,5 pixels près du contour) ; le trait est DANS la boîte ; une forme qui grandit avec son texte étire son contour avec elle ; la miniature, la Lecture et le diaporama dessinent la même
//   forme (mêmes variables, mêmes calques) ; la Lecture est mesurée aux pixels.
//  LA BARRE : le fond, le trait et son épaisseur se règlent à la vraie souris (palette, « Sans remplissage », « Sans trait », sept épaisseurs), UN pas d'historique chacun, la barre dit la couleur
//   choisie ; dupliquer garde la forme, le fond et le trait.
//  LES SORTIES : le PDF (vrai clic) dessine chacune des seize formes aux mêmes mesures de la page (capture de la page par pdf.js, mêmes points que l'éditeur), le texte d'une forme y est centré,
//   un cadre de texte avec un fond et un trait aussi ; le Word (vrai clic) en fait des formes prédéfinies (`prst`) avec leur fond, leur trait en EMU, le texte centré (la bulle y a pour boîte son
//   corps : sa queue dépasse, comme dans PowerPoint), et un cadre de texte reste une zone de texte ; le HTML et le Markdown gardent le texte.
//  LES VALEURS : une sorte inconnue devient un rectangle, une couleur illisible disparaît, une épaisseur trop grande est bornée ; un cadre de texte nu s'écrit comme avant (quatre mesures, rien
//   d'autre) ; une forme enregistrée est rouverte à l'identique.
// Lancé par run-headless.mjs (groupe Node "shapes", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-shapes.mjs
// SHAPES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, OBJECTS_BUTTON, objectRow, hoverObject, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.SHAPES_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-shapes', port: Number(process.env.SHAPES_PORT || 8960) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
// Un cadre ou une forme, écrit comme l'enregistrement le fait : les mesures, puis l'aspect quand il y en a un.
const SHAPE = (x, y, w, h, look, html) => {
  const attrs = Object.assign({ shape: '', fill: '', line: '', lw: '' }, look);
  const extra = ['shape', 'fill', 'line', 'lw'].filter(key => attrs[key] !== '').map(key => ` data-ff-${key}="${attrs[key]}"`).join('');
  return `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${html || '<p></p>'}</div></div></div>`;
};
// Les huit formes de la première série et les huit de la seconde (flèches vers le haut et le bas, chevron, pentagone, hexagone, parallélogramme, croix, bulle), dans l'ordre du menu.
const KINDS_FIRST = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'rightArrow', 'leftArrow', 'star5'];
const KINDS_MORE = ['upArrow', 'downArrow', 'chevron', 'pentagon', 'hexagon', 'parallelogram', 'plus', 'wedgeRoundRectCallout'];
const KINDS = KINDS_FIRST.concat(KINDS_MORE);
// Les tailles d'origine des formes posées par le menu (points) : le rectangle 192 x 108, l'ellipse 144 x 108, la flèche 144 x 72...
const SIZES = {
  rect: [192, 108], roundRect: [192, 108], ellipse: [144, 108], triangle: [120, 108], diamond: [144, 108], rightArrow: [144, 72], leftArrow: [144, 72], star5: [120, 114],
  upArrow: [72, 144], downArrow: [72, 144], chevron: [144, 72], pentagon: [132, 126], hexagon: [144, 112], parallelogram: [168, 84], plus: [96, 96], wedgeRoundRectCallout: [180, 126],
};
const DEFAULT_LOOK = { fill: '#d9e2f3', line: '#2f5597', lw: 1.5 };
// Huit formes de 160 x 100 points sur la première diapositive de « Posées » (deux rangées de quatre), le trait de 6 points : assez épais pour qu'une capture le distingue de son fond.
const LOOK_A = { fill: '#ffd1e6', line: '#be185d', lw: 6 };
const LOOK_B = { fill: '#c8e6ff', line: '#0369a1', lw: 6 };
const gridOf = list => list.map((kind, i) => SHAPE(40 + (i % 4) * 230, i < 4 ? 60 : 260, 160, 100, Object.assign({ shape: kind }, i % 2 ? LOOK_B : LOOK_A)));
const GRID = gridOf(KINDS_FIRST);
const GRID_MORE = gridOf(KINDS_MORE);
const TEXT_LOOK = { fill: '#fff2a8', line: '#a16207', lw: 1.5 };
const CENTERED = text => `<p style="text-align: center">${text}</p>`;
// 13 « Posées (suite) » : les huit formes de la seconde série, posées comme celles de « Posées ». 12 « Frappe » : trois diapositives vides où l'on tape dans une forme (ses modifications sont enregistrées à l'ouverture du modèle suivant : elles n'ont pas le modèle 7). 11 « Grandit » : une ellipse de 108 points de haut, à contour de 6 points, qui porte huit lignes (elle grandit). 7 « Formes » : trois diapositives sans objet (le menu, la pose, la barre) ; 8 « Posées » : les huit formes (diapositive 1), un cadre de texte avec un fond et un trait et une ellipse qui porte
// un texte (diapositive 2), un texte (3) ; 9 « Valeurs » : des mesures et des valeurs hors normes ; 10 « Nu » : un cadre de texte écrit comme avant ce lot.
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Formes', '${SLIDES}', false, 'presentation');
  add(8, 'Posées', '${GRID.join('')}<h1>Les huit formes</h1>${BR}${SHAPE(100, 100, 300, 80, TEXT_LOOK, '<p>Cadre rempli</p>')}${SHAPE(480, 150, 240, 140, Object.assign({ shape: 'ellipse' }, LOOK_B), CENTERED('Au centre'))}<h2>Deux</h2>${BR}<p>Trois</p>', false, 'presentation');
  add(13, 'Posées (suite)', '${GRID_MORE.join('')}<h1>Les huit autres</h1>${BR}<p>Deux</p>', false, 'presentation');
  add(9, 'Valeurs', '${SHAPE(100, 100, 200, 100, { shape: 'heptagon', fill: 'rouge', line: '#12', lw: 9999 })}${SHAPE(400, 100, 200, 100, { shape: 'ellipse', fill: 'RGB(255, 0, 0)', line: '#00F', lw: -3 })}<p>Valeurs</p>', false, 'presentation');
  add(10, 'Nu', '${SHAPE(100, 100, 300, 60, {}, '<p>Cadre nu</p>')}<p>Texte</p>', false, 'presentation');
  add(12, 'Frappe', '${SLIDES}', false, 'presentation');
  add(11, 'Grandit', '${SHAPE(300, 150, 144, 108, Object.assign({ shape: 'ellipse' }, LOOK_B), ['Ligne 1', 'Ligne 2', 'Ligne 3', 'Ligne 4', 'Ligne 5', 'Ligne 6', 'Ligne 7', 'Ligne 8'].map(CENTERED).join(''))}<p>Texte</p>', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    button: 'Objets', textFrame: 'Cadre de texte', heading: 'Formes', fill: 'Couleur de fond', line: 'Couleur du trait', lineWidth: 'Épaisseur du trait', noFill: 'Sans remplissage', noLine: 'Sans trait', widthNone: 'Aucun trait',
    duplicate: 'Dupliquer l\'objet', tip: (name, n) => `${name} au centre de la diapositive ${n}`,
    names: {
      rect: 'Rectangle', roundRect: 'Rectangle arrondi', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Losange', rightArrow: 'Flèche à droite', leftArrow: 'Flèche à gauche', star5: 'Étoile',
      upArrow: 'Flèche vers le haut', downArrow: 'Flèche vers le bas', chevron: 'Chevron', pentagon: 'Pentagone', hexagon: 'Hexagone', parallelogram: 'Parallélogramme', plus: 'Croix', wedgeRoundRectCallout: 'Bulle',
    },
    width: n => `${String(n).replace('.', ',')} pt`,
  },
  en: {
    button: 'Objects', textFrame: 'Text frame', heading: 'Shapes', fill: 'Fill color', line: 'Line color', lineWidth: 'Line weight', noFill: 'No fill', noLine: 'No line', widthNone: 'No line',
    duplicate: 'Duplicate the object', tip: (name, n) => `${name} in the middle of slide ${n}`,
    names: {
      rect: 'Rectangle', roundRect: 'Rounded rectangle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Diamond', rightArrow: 'Right arrow', leftArrow: 'Left arrow', star5: 'Star',
      upArrow: 'Up arrow', downArrow: 'Down arrow', chevron: 'Chevron', pentagon: 'Pentagon', hexagon: 'Hexagon', parallelogram: 'Parallelogram', plus: 'Cross', wedgeRoundRectCallout: 'Speech bubble',
    },
    width: n => `${n} pt`,
  },
};
const WIDTHS = [0.5, 1, 1.5, 2, 3, 4.5, 6];
const PT = 96 / 72;
const near = (a, b, tolerance = 0.6) => typeof a === 'number' && Math.abs(a - b) <= tolerance;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }

// Les outils d'une page ouverte : positions, premier plan, vrais clics (la souris vient de loin, la bande défile d'abord quand la miniature visée n'y est pas entière).
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
  return { rectOf, onTop, hover, click, leave };
}

// Les cadres du texte avec leur aspect, la forme du texte (types de nœuds de premier niveau), la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const frames = [];
  const shape = [];
  editor.state.doc.forEach((node, offset) => {
    shape.push(node.type.name === 'freeFrame' ? 'F' : node.type.name === 'pageBreak' ? '|' : node.type.name === 'heading' ? 'h' : node.type.name === 'paragraph' ? 'p' : node.type.name.slice(0, 2));
    if (node.type.name === 'freeFrame') {
      const a = node.attrs;
      frames.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, shape: a.shape, fill: a.fill, line: a.line, lw: a.lw, text: node.textContent, align: node.firstChild && node.firstChild.attrs.textAlign });
    }
  });
  const sel = editor.state.selection;
  return { frames, shape: shape.join(''), selection: { selectedFrame: !!(sel.node && sel.node.type.name === 'freeFrame'), inFrame: !!FreeFrame.frameAround(sel.$from) && !sel.node } };
});
// L'écran : où est chaque boîte, et le haut de la page de chaque diapositive.
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
  const boxes = Array.from(host.querySelectorAll('.pp-free-frame-box')).map((box) => { const r = box.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  return { zoom, pageTops: tops, contentLeft: content.getBoundingClientRect().left, boxes };
}, root);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Exécutée DANS la page : compare une image (PNG en base64) au contour d'une forme. `box` : la boîte de la forme dans l'image, en pixels ; `spec` : { kind, w, h (points), lw (points), lineOn, fill, line,
// } ; `scale` : les pixels par point ; `grid` : une grille de points, chacun de la couleur que dit le contour (fond dedans, papier dehors, trait sur le bord) à 2,5 pixels près du contour ; `explicit` :
// des points { fx, fy, dx, dy, want } (fx et fy : la part de la boîte, dx et dy : un décalage en pixels). Les sondes de trait sont posées au milieu du trait, au milieu de chaque côté.
async function rasterCheck({ b64, box, spec, grid, explicit, scale, rim }) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const colorAt = (x, y) => { const d = ctx.getImageData(box.left + Math.round(x), box.top + Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; };
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const W = box.width;
  const H = box.height;
  const k = scale;
  const lwPt = spec.lineOn ? ShapeGeometry.lineWidthFor(spec.w, spec.h, spec.lw) : 0;
  const lw = lwPt * k;
  const colors = { paper: colorAt(-4, -4), fill: hex(spec.fill), line: spec.lineOn ? hex(spec.line) : hex(spec.fill) };
  const outline = ShapeGeometry.outline(spec.kind, spec.w, spec.h);
  const stretch = H / (spec.h * k);
  const toPx = pts => pts.map(p => [p[0] * k, p[1] * k * stretch]);
  const poly = outline.type === 'polygon' ? toPx(outline.points) : null;
  const inner = poly ? (lwPt ? toPx(ShapeGeometry.inset(outline.points, lwPt)) : poly) : null;
  const radius = outline.type === 'roundRect' ? outline.radius * k : 0;
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const along = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - along * dx, p[1] - a[1] - along * dy);
  };
  const polyInside = (p, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const polyDist = (p, pts) => Math.min.apply(null, pts.map((a, i) => segDist(p, a, pts[(i + 1) % pts.length])));
  const ellipseInside = p => Math.pow((p[0] - W / 2) / (W / 2), 2) + Math.pow((p[1] - H / 2) / (H / 2), 2) <= 1;
  const ellipseDist = (p) => {
    let best = Infinity;
    for (let a = 0; a < 720; a++) {
      const t = a / 720 * 2 * Math.PI;
      best = Math.min(best, Math.hypot(p[0] - (W / 2 + W / 2 * Math.cos(t)), p[1] - (H / 2 + H / 2 * Math.sin(t))));
    }
    return best;
  };
  // Un rectangle à coins ronds (le rayon 0 est un rectangle) : sa distance signée (négative dedans), exacte.
  const roundDistance = (p) => {
    const qx = Math.abs(p[0] - W / 2) - (W / 2 - radius);
    const qy = Math.abs(p[1] - H / 2) - (H / 2 - radius);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };
  const rectInside = p => roundDistance(p) <= 0;
  const rectDist = p => Math.abs(roundDistance(p));
  const insideOuter = p => (poly ? polyInside(p, poly) : outline.type === 'ellipse' ? ellipseInside(p) : rectInside(p));
  const distOuter = p => (poly ? polyDist(p, poly) : outline.type === 'ellipse' ? ellipseDist(p) : rectDist(p));
  const classOf = (rgb) => {
    let best = null;
    Object.keys(colors).forEach((name) => { const g = gap(rgb, colors[name]); if (!best || g < best.gap) best = { name, gap: g }; });
    return best.gap > 60 ? 'other' : best.name;
  };
  const wanted = (p) => {
    const d = distOuter(p);
    if (!insideOuter(p)) return d > 2.5 ? 'paper' : null;
    if (!lw) return d > 2.5 ? 'fill' : null;
    if (poly) {
      const di = polyDist(p, inner);
      if (polyInside(p, inner)) return di > 2.5 ? 'fill' : null;
      return d >= 2.5 && di >= 2.5 ? 'line' : null;
    }
    if (d > lw + 2.5) return 'fill';
    return d >= 1.5 && d <= lw - 1.5 ? 'line' : null;
  };
  const mismatches = [];
  let checked = 0;
  const probe = (p, want, tag) => {
    if (!want) return;
    checked++;
    const rgb = colorAt(p[0], p[1]);
    const got = classOf(rgb);
    if (got !== want && mismatches.length < 8) mismatches.push({ tag, at: [Math.round(p[0]), Math.round(p[1])], want, got, rgb });
  };
  if (grid) {
    // `rim` : seuls les points à moins de `rim` pixels du contour (le texte d'une forme couvre son milieu).
    for (let j = 0; j < 12; j++) for (let i = 0; i < 16; i++) { const p = [(i + 0.5) / 16 * W, (j + 0.5) / 12 * H]; if (!rim || distOuter(p) <= rim) probe(p, wanted(p), 'grille'); }
  }
  (explicit || []).forEach((e) => probe([e.fx * W + (e.dx || 0), e.fy * H + (e.dy || 0)], e.want, 'point'));
  // Les sondes de trait : au milieu du trait, au milieu de chaque côté du contour.
  const edges = [];
  if (lw >= 4) {
    if (poly) {
      let area = 0;
      poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; });
      const sign = area >= 0 ? 1 : -1;
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 4 * lw) return;
        edges.push([(a[0] + b[0]) / 2 + sign * -(b[1] - a[1]) / len * lw / 2, (a[1] + b[1]) / 2 + sign * (b[0] - a[0]) / len * lw / 2]);
      });
    } else if (outline.type === 'ellipse') {
      [0, 90, 180, 270].forEach((deg) => { const t = deg * Math.PI / 180; edges.push([W / 2 + (W / 2 - lw / 2) * Math.cos(t), H / 2 + (H / 2 - lw / 2) * Math.sin(t)]); });
    } else {
      edges.push([W / 2, lw / 2], [W / 2, H - lw / 2], [lw / 2, H / 2], [W - lw / 2, H / 2]);
    }
    edges.forEach(p => probe(p, 'line', 'trait'));
  }
  return { checked, lineProbes: edges.length, mismatches, colors };
}
const rasterOf = (page, args) => page.evaluate(rasterCheck, args);

// La capture de la boîte `index` d'un conteneur (éditeur ou Lecture), amenée à l'écran : le PNG (8 pixels de papier autour) et la boîte dedans.
async function shotOfBox(page, root, index) {
  const measured = await page.evaluate(([rootSel, i]) => {
    const box = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i];
    box.scrollIntoView({ block: 'center', inline: 'center' });
    return parseFloat(box.parentElement.getAttribute('data-ff-w'));
  }, [root, index]);
  await sleep(250);
  const rect = await page.evaluate(([rootSel, i]) => { const r = document.querySelector(rootSel).querySelectorAll('.pp-free-frame-box')[i].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, [root, index]);
  const margin = 8;
  const x0 = Math.max(0, rect.left - margin);
  const y0 = Math.max(0, rect.top - margin);
  const png = await page.screenshot({ clip: { x: x0, y: y0, width: rect.width + rect.left - x0 + margin, height: rect.height + rect.top - y0 + margin }, type: 'png' });
  return { b64: png.toString('base64'), box: { left: rect.left - x0, top: rect.top - y0, width: rect.width, height: rect.height }, scale: rect.width / measured };
}

// Le PDF relu par pdf.js : la page `n` peinte à `scale` pixels par point (PNG en base64) et ses lignes de texte (x, y du haut, largeur, en points).
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
  const content = await p.getTextContent();
  const heightPt = viewport.height / factor;
  const items = content.items.filter(it => it.str.trim()).map(it => ({ text: it.str, x: it.transform[4], y: heightPt - it.transform[5], width: it.width }));
  // pdf.js coupe une ligne en mots : les morceaux d'une même ligne (même ligne de base) sont rejoints, `x` et `right` sont ses deux bouts.
  const lines = [];
  items.slice().sort((a, b) => a.y - b.y || a.x - b.x).forEach((it) => {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < 1) { last.text += ' ' + it.text; last.right = Math.max(last.right, it.x + it.width); last.x = Math.min(last.x, it.x); }
    else lines.push({ y: it.y, x: it.x, right: it.x + it.width, text: it.text });
  });
  return { numPages: doc.numPages, png: canvas.toDataURL('image/png').split(',')[1], items, lines, width: viewport.width / factor, height: heightPt };
}, [b64, n, scale]);

// Ce que les formules des formes prédéfinies de PowerPoint (`presetShapeDefinitions`, aux réglages d'origine) donnent pour les huit formes de la seconde série dans une boîte de `w` sur `h` points :
// leurs sommets et leur rectangle de texte { l, t, r, b }. Écrit comme les formules (adj, pin, vf, hf), sans rien emprunter à js/shape-geometry.js.
const rad = degrees => degrees * Math.PI / 180;
function presetOf(kind, w, h) {
  const ss = Math.min(w, h);
  const hc = w / 2;
  const vc = h / 2;
  switch (kind) {
    case 'upArrow':
    case 'downArrow': {
      const dy2 = ss * Math.min(50000, 100000 * h / ss) / 100000;
      const dx1 = w * 50000 / 200000;
      const dy1 = (hc - dx1) * dy2 / (w / 2);
      const up = [[0, dy2], [hc, 0], [w, dy2], [hc + dx1, dy2], [hc + dx1, h], [hc - dx1, h], [hc - dx1, dy2]];
      return kind === 'upArrow'
        ? { points: up, text: { l: hc - dx1, t: dy2 - dy1, r: hc + dx1, b: h } }
        : { points: up.map(p => [p[0], h - p[1]]), text: { l: hc - dx1, t: 0, r: hc + dx1, b: h - dy2 + dy1 } };
    }
    case 'chevron': {
      const x1 = ss * Math.min(50000, 100000 * w / ss) / 100000;
      const x2 = w - x1;
      const wide = x2 - x1 > 0;
      return { points: [[0, 0], [x2, 0], [w, vc], [x2, h], [0, h], [x1, vc]], text: { l: wide ? x1 : 0, t: 0, r: wide ? x2 : w, b: h } };
    }
    case 'pentagon': {
      const swd2 = (w / 2) * 105146 / 100000;
      const shd2 = (h / 2) * 110557 / 100000;
      const svc = vc * 110557 / 100000;
      const dx1 = swd2 * Math.cos(rad(18));
      const dx2 = swd2 * Math.cos(rad(306));
      const dy1 = shd2 * Math.sin(rad(18));
      const dy2 = shd2 * Math.sin(rad(306));
      const x1 = hc - dx1;
      const x2 = hc - dx2;
      const x3 = hc + dx2;
      const x4 = hc + dx1;
      const y1 = svc - dy1;
      const y2 = svc - dy2;
      return { points: [[x1, y1], [hc, 0], [x4, y1], [x3, y2], [x2, y2]], text: { l: x2, t: y1 * dx2 / dx1, r: x3, b: y2 } };
    }
    case 'hexagon': {
      const maxAdj = 50000 * w / ss;
      const a = Math.min(25000, maxAdj);
      const x1 = ss * a / 100000;
      const x2 = w - x1;
      const dy1 = (vc * 115470 / 100000) * Math.sin(rad(60));
      const q1 = maxAdj * -1 / 2;
      const q2 = a + q1;
      const q3 = q2 > 0 ? 4 : 2;
      const q4 = q2 > 0 ? 3 : 2;
      const q5 = q2 > 0 ? q1 : 0;
      const q8 = q3 + (a + q5) / q1 * q4 / -1;
      return { points: [[0, vc], [x1, vc - dy1], [x2, vc - dy1], [w, vc], [x2, vc + dy1], [x1, vc + dy1]], text: { l: w * q8 / 24, t: h * q8 / 24, r: w - w * q8 / 24, b: h - h * q8 / 24 } };
    }
    case 'parallelogram': {
      const maxAdj = 100000 * w / ss;
      const a = Math.min(25000, maxAdj);
      const x2 = ss * a / 100000;
      const q2 = (1 + 5 * a / maxAdj) / 12;
      return { points: [[0, h], [x2, 0], [w, 0], [w - x2, h]], text: { l: q2 * w, t: q2 * h, r: w - q2 * w, b: h - q2 * h } };
    }
    case 'plus': {
      const x1 = ss * 25000 / 100000;
      const x2 = w - x1;
      const y2 = h - x1;
      return { points: [[0, x1], [x1, x1], [x1, 0], [x2, 0], [x2, x1], [w, x1], [w, y2], [x2, y2], [x2, h], [x1, h], [x1, y2], [0, y2]], text: { l: x1, t: x1, r: x2, b: y2 } };
    }
    default: {
      // La bulle (`wedgeRoundRectCallout`) : le corps est la boîte de PowerPoint, la queue en dépasse jusqu'à 1,125 fois sa hauteur ; la boîte du cadre les contient : le corps en est les 8/9.
      const bh = h * 8 / 9;
      const u1 = Math.min(w, bh) * 16667 / 100000;
      const il = u1 * 29289 / 100000;
      return {
        tail: [[w * 5 / 12, bh], [hc + w * -20833 / 100000, bh / 2 + bh * 62500 / 100000], [w * 2 / 12, bh]],
        tangent: [[u1, 0], [w - u1, 0], [w, u1], [w, bh - u1], [w - u1, bh], [u1, bh], [0, bh - u1], [0, u1]],
        centers: [[w - u1, u1], [w - u1, bh - u1], [u1, bh - u1], [u1, u1]], radius: u1, text: { l: il, t: il, r: w - il, b: bh - il },
      };
    }
  }
}

// Les formes d'un .docx (en base64), lues dans la page : leur forme prédéfinie, leur fond, leur trait, leur ancre, leur position et leur taille en EMU, leur texte.
const wordShapesOf = async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const first = (el, name) => el.getElementsByTagName(name)[0] || null;
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const shapes = Array.from(doc.getElementsByTagName('wp:anchor')).map((anchor) => {
    const spPr = first(anchor, 'wps:spPr');
    const fillEl = spPr && Array.from(spPr.children).find(c => c.tagName === 'a:solidFill');
    const ln = spPr && Array.from(spPr.children).find(c => c.tagName === 'a:ln');
    const body = first(anchor, 'wps:bodyPr');
    const cNv = first(anchor, 'wps:cNvSpPr');
    const h = first(anchor, 'wp:positionH');
    const v = first(anchor, 'wp:positionV');
    const ext = first(anchor, 'wp:extent');
    return {
      prst: attr(first(spPr, 'a:prstGeom'), 'prst'), order: spPr ? Array.from(spPr.children).map(c => c.tagName).join(',') : '', fill: fillEl ? attr(first(fillEl, 'a:srgbClr'), 'val') : null, lineWidth: ln ? Number(attr(ln, 'w')) : null,
      lineColor: ln && first(ln, 'a:srgbClr') ? attr(first(ln, 'a:srgbClr'), 'val') : null, lineNoFill: !!(ln && first(ln, 'a:noFill')), anchor: attr(body, 'anchor'), txBox: attr(cNv, 'txBox'), x: Number(first(h, 'wp:posOffset').textContent), y: Number(first(v, 'wp:posOffset').textContent),
      cx: Number(attr(ext, 'cx')), cy: Number(attr(ext, 'cy')), text: Array.from(anchor.getElementsByTagName('w:t')).map(n => n.textContent).join(''),
    };
  });
  return { shapes };
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { rectOf, onTop, hover, click, leave } = toolsOf(page);
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
    const opened = await page.evaluate(n => String(Templates.getCurrentId()) === String(n), id);
    if (!opened) check(tag + `le modèle ${id} s'ouvre`, false, await page.evaluate(() => Templates.getCurrentId()));
    return opened;
  };
  const pageSize = () => page.evaluate(() => PageLayout.getPageSizePt());
  const shapeButton = kind => objectRow('shape:' + kind);

  // --- 1. Le menu « Objets » : la ligne, le titre « Formes », la grille.
  console.log('\n' + tag + '1) Le menu « Objets » et ses formes');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await hoverObject(page, 'shape:rect');
  const menu = await page.evaluate(() => {
    const m = document.querySelector('#v2-objects-flyout');
    const r = m.getBoundingClientRect();
    const heading = m.querySelector('#v2-objects-shapes');
    const group = m.querySelector('.v2-objects-grid[aria-labelledby="v2-objects-shapes"]');
    const shapes = Array.from(m.querySelectorAll('[data-action^="shape:"]')).map((b) => { const q = b.getBoundingClientRect(); return { id: b.dataset.action, label: b.getAttribute('aria-label'), tip: b.getAttribute('data-tip'), svg: !!b.querySelector('svg'), left: q.left, top: q.top, right: q.right, bottom: q.bottom, width: q.width, height: q.height }; });
    return {
      visible: r.width > 0, textRow: m.querySelector('[data-action="textFrame"]').textContent.trim(), heading: heading && heading.textContent.trim(), groupLabelledBy: group && group.getAttribute('aria-labelledby'),
      headingId: heading && heading.id, groupRole: group && group.getAttribute('role'), shapes, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  });
  const ids = KINDS.map(k => 'shape:' + k);
  check(tag + `le menu a la ligne « ${T.textFrame} », le titre « ${T.heading} » (qui nomme le groupe) et seize formes dans l'ordre : ${KINDS.map(k => T.names[k]).join(', ')}`,
    !!menu && menu.visible && menu.textRow === T.textFrame && menu.heading === T.heading && menu.groupRole === 'group' && menu.groupLabelledBy === menu.headingId && JSON.stringify(menu.shapes.map(s => s.id)) === JSON.stringify(ids)
    && menu.shapes.every((s, i) => s.label === T.names[KINDS[i]] && s.svg), menu);
  check(tag + 'chaque forme a une info-bulle qui dit où elle se posera (« ' + T.tip(T.names.rect, 2) + ' »)', !!menu && menu.shapes.every((s, i) => s.tip === T.tip(T.names[KINDS[i]], 2)), menu && menu.shapes.map(s => s.tip));
  // La grille : deux rangées de huit (la première série puis la seconde), des boutons de 28 pixels au moins, qui ne se recouvrent pas ; le menu entier dans le panneau, sans défilement.
  const rows = menu ? [0, 1].map(i => menu.shapes.slice(i * 8, i * 8 + 8)) : [];
  const gridOk = rows.length === 2 && rows.every((row, r) => row.length === 8 && row.every((s, i) => i === 0 || (near(s.top, row[0].top, 0.5) && s.left >= row[i - 1].right - 0.5)) && (r === 0 || (row[0].top >= rows[r - 1][0].bottom - 0.5 && near(row[0].left, rows[0][0].left, 0.5))))
    && menu.shapes.every(s => s.width >= 28 && s.height >= 28);
  check(tag + 'la grille : deux rangées de huit boutons alignés d\'au moins 28 pixels, sans se recouvrir', gridOk, rows.map(r => r.map(s => [Math.round(s.left), Math.round(s.top), Math.round(s.width), Math.round(s.height)])));
  check(tag + 'le menu est entier dans le panneau, au premier plan (la première forme, la dernière et la ligne reçoivent le clic)', !!menu && inPanel(menu.rect) && await onTop(shapeButton('rect')) && await onTop(shapeButton('star5')) && await onTop(shapeButton('wedgeRoundRectCallout')) && await onTop(objectRow('textFrame')), menu && menu.rect);
  const contrasts = [await contrastOf(page, '#v2-objects-shapes'), await contrastOf(page, shapeButton('rect')), await contrastOf(page, shapeButton('star5')), await contrastOf(page, shapeButton('plus')), await contrastOf(page, shapeButton('wedgeRoundRectCallout'))];
  check(tag + 'le titre « Formes » et les icônes sont lisibles (>= 4,5:1)', contrasts.every(c => c >= 4.5), contrasts);
  await snap(page, `${lang}-menu-shapes`);
  await leave();
  // Au clavier : Entrée sur le bouton donne le clavier à la ligne, ↓ de la ligne va à la première forme, ↓ descend d'une rangée (même colonne), ↓ de la seconde rangée passe à la rangée des lignes, ↑ remonte,
  // → et ← parcourent les formes (au bout, le parcours reboucle), ↓ du bout des lignes reboucle sur la ligne, Fin et Début, Échap rend le clavier au bouton.
  await page.focus(OBJECTS_BUTTON);
  const focusId = () => page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  const walk = [];
  await press('Enter'); walk.push(await focusId());
  await press('ArrowDown'); walk.push(await focusId());
  await press('ArrowDown'); walk.push(await focusId());
  await press('ArrowDown'); walk.push(await focusId());
  await press('ArrowUp'); walk.push(await focusId());
  await press('ArrowRight'); walk.push(await focusId());
  await press('End'); walk.push(await focusId());
  await press('ArrowDown'); walk.push(await focusId());
  await press('End'); walk.push(await focusId());
  await press('ArrowRight'); walk.push(await focusId());
  await press('Home'); walk.push(await focusId());
  await press('Escape');
  const afterEscape = await page.evaluate(() => ({ button: document.activeElement === document.querySelector('#v2-btn-objects'), open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') }));
  check(tag + 'au clavier : Entrée → ligne, ↓ rect, ↓ upArrow (rangée suivante, même colonne), ↓ line:plain (la rangée des lignes), ↑ upArrow, → downArrow, Fin la dernière des lignes, ↓ ligne (reboucle), Fin la dernière des lignes, → rect (reboucle), Début ligne, Échap rend le clavier au bouton',
    JSON.stringify(walk) === JSON.stringify(['textFrame', 'shape:rect', 'shape:upArrow', 'line:plain', 'shape:upArrow', 'shape:downArrow', 'line:double', 'textFrame', 'line:double', 'shape:rect', 'textFrame']) && afterEscape.button && afterEscape.open === 'false', { walk, afterEscape });
  if (!full) {
    // Anglais sombre : les noms sont ceux de la langue (vérifiés plus haut), une forme se pose et se dessine pareil.
    await leave();
  }

  if (full) {
    // --- 2. La pose : chaque forme, au vrai clic.
    console.log('\n' + tag + '2) Poser chacune des seize formes');
    const size = await pageSize();
    const original = await page.evaluate(() => Editor.getHTML());
    for (const kind of KINDS) {
      await chooseObject(page, 'shape:' + kind);
      const state = await docState(page);
      const f = state.frames[0];
      const [w, h] = SIZES[kind];
      const look = !!f && f.fill === DEFAULT_LOOK.fill && f.line === DEFAULT_LOOK.line && f.lw === DEFAULT_LOOK.lw;
      check(tag + `« ${T.names[kind]} » est posée : une seule forme, de la sorte « ${kind} », ${w} x ${h} points, centrée sur la page, fond ${DEFAULT_LOOK.fill}, trait ${DEFAULT_LOOK.line} de ${DEFAULT_LOOK.lw} pt`,
        state.frames.length === 1 && f.shape === kind && near(f.w, w, 0.01) && near(f.h, h, 0.01) && near(f.x, (size.width - w) / 2, 0.01) && near(f.y, (size.height - h) / 2, 0.01) && look && state.shape === 'hp|Fhbu|p', state);
      check(tag + `et elle est SÉLECTIONNÉE (sa barre est là, le clavier est à elle), son texte est centré`, state.selection.selectedFrame && !state.selection.inFrame && f.align === 'center' && await onTop('.v2-frame-toolbar button'), { selection: state.selection, align: f.align });
      await press('Control+z');
      const undone = await page.evaluate(() => Editor.getHTML());
      check(tag + `un seul Ctrl+Z défait « ${T.names[kind]} », au caractère près`, undone === original, (await docState(page)).frames.length);
    }
    // Deux formes de même mesure de suite : la seconde est glissée de 12 points (jamais posée sur la première) et devant elle.
    await chooseObject(page, 'shape:rect');
    await chooseObject(page, 'shape:rect');
    const two = (await docState(page)).frames;
    check(tag + 'deux rectangles de suite : le second est décalé de 12 points (jamais posé sur le premier) et devant lui', two.length === 2 && near(two[1].x, two[0].x + 12, 0.02) && near(two[1].y, two[0].y + 12, 0.02) && two[0].shape === 'rect' && two[1].shape === 'rect', two);
    await press('Control+z');
    await press('Control+z');

    // Au clavier : Entrée sur une forme la pose.
    await page.focus(OBJECTS_BUTTON);
    await press('Enter');
    await press('ArrowDown');
    await press('ArrowRight');
    await press('Enter');
    const byKeyboard = await docState(page);
    check(tag + 'au clavier, Entrée sur la forme choisie la pose (ici « Rectangle arrondi »), sélectionnée', byKeyboard.frames.length === 1 && byKeyboard.frames[0].shape === 'roundRect' && byKeyboard.selection.selectedFrame, byKeyboard);
    await press('Control+z');
    check(tag + 'et un Ctrl+Z la défait', (await page.evaluate(() => Editor.getHTML())) === original);

    // --- 2b. Le contour et le rectangle de texte des huit formes de la seconde série : ceux de PowerPoint.
    console.log('\n' + tag + '2b) Le contour et le rectangle de texte de PowerPoint');
    const SAMPLES = [[144, 72], [72, 144], [100, 100], [200, 60], [60, 200], [30, 24], [300, 120]];
    const actual = await page.evaluate(([kinds, sizes]) => kinds.map(kind => sizes.map(([w, h]) => ({
      kind, w, h, points: ShapeGeometry.outline(kind, w, h).points, insets: ShapeGeometry.textInsets(kind, w, h, 0), look: ShapeGeometry.look(kind, w, h, 4),
    }))), [KINDS_MORE, SAMPLES]);
    for (const perKind of actual) {
      const problems = [];
      perKind.forEach(({ kind, w, h, points, insets, look }) => {
        const want = presetOf(kind, w, h);
        const base = [3.6, 7.2, 3.6, 7.2];
        const extras = [want.text.t, w - want.text.r, h - want.text.b, want.text.l];
        if (!insets.every((v, i) => Math.abs(v - (base[i] + extras[i])) < 0.011)) problems.push({ w, h, what: 'marges du texte', insets, want: extras.map((e, i) => base[i] + e) });
        if (points.some(p => p[0] < -0.001 || p[0] > w + 0.001 || p[1] < -0.001 || p[1] > h + 0.001)) problems.push({ w, h, what: 'un sommet sort de la boîte' });
        if (want.points) {
          const same = points.length === want.points.length && want.points.every(q => points.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.011));
          if (!same) problems.push({ w, h, what: 'sommets', points: points.map(p => p.map(v => Math.round(v * 100) / 100)), want: want.points });
        } else {
          const has = list => list.every(q => points.some(p => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.011));
          const onArcs = points.filter(p => !want.tail.concat(want.tangent).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.011));
          const round = onArcs.every(p => want.centers.some(c => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - want.radius) < 0.011));
          if (points.length !== 23 || !has(want.tail) || !has(want.tangent) || !round) problems.push({ w, h, what: 'bulle', count: points.length, tail: has(want.tail), tangent: has(want.tangent), round });
        }
        if (!look.clip.startsWith('polygon(') || !look.ring.startsWith('polygon(evenodd')) problems.push({ w, h, what: 'polygone CSS du fond ou du trait', clip: look.clip.slice(0, 30), ring: look.ring.slice(0, 30) });
      });
      check(tag + `« ${T.names[perKind[0].kind]} » : ses sommets et le rectangle de texte sont ceux de la forme prédéfinie de PowerPoint à ${SAMPLES.length} tailles (${SAMPLES.map(z => z.join('x')).join(', ')}), tout dans la boîte, en polygone CSS`, problems.length === 0, problems.slice(0, 3));
    }

    // --- 3. Le dessin dans l'éditeur : chaque forme est dessinée comme son contour.
    console.log('\n' + tag + '3) Le dessin des seize formes dans l\'éditeur');
  }
  await open(8, 3);
  await click('.pp-slide-item', 0);
  await leave();
  await snap(page, `${lang}-formes`);
  // Chaque forme de la liste, dans la boîte de son rang du modèle ouvert : comparée à son contour, point par point.
  const drawn = async (list, all) => {
    for (const kind of list) {
      const index = all.indexOf(kind);
      const look = index % 2 ? LOOK_B : LOOK_A;
      const shot = await shotOfBox(page, '#editor-container', index);
      const result = await rasterOf(page, { b64: shot.b64, box: shot.box, scale: shot.scale, grid: true, spec: { kind, w: 160, h: 100, lw: look.lw, lineOn: true, fill: look.fill, line: look.line } });
      check(tag + `« ${T.names[kind]} » est dessinée comme son contour : ${result.checked} points (fond dedans, papier dehors, trait sur le bord, ${result.lineProbes} sondes au milieu du trait)`, result.mismatches.length === 0 && result.checked > 40, result);
    }
  };
  await drawn(full ? KINDS_FIRST : ['triangle', 'star5'], KINDS_FIRST);
  // Les huit autres, dans le modèle 13 (en anglais sombre : l'hexagone et la bulle).
  await open(13, 2);
  await click('.pp-slide-item', 0);
  await leave();
  await snap(page, `${lang}-formes-suite`);
  await drawn(full ? KINDS_MORE : ['hexagon', 'wedgeRoundRectCallout'], KINDS_MORE);
  if (!full) return;
  await open(8, 3);
  await click('.pp-slide-item', 0);
  await leave();

  // Le trait est DANS la boîte : le rectangle, au bord de sa boîte (la sonde du milieu du haut), est de la couleur du trait dès le premier pixel et la boîte garde sa taille nominale.
  const rectBox = await shotOfBox(page, '#editor-container', 0);
  const edge = await rasterOf(page, { b64: rectBox.b64, box: rectBox.box, scale: rectBox.scale, grid: false, spec: { kind: 'rect', w: 160, h: 100, lw: 6, lineOn: true, fill: LOOK_A.fill, line: LOOK_A.line }, explicit: [{ fx: 0.5, fy: 0, dx: 1.5, dy: 1.5, want: 'line' }, { fx: 1, fy: 0.5, dx: -1.5, dy: 0, want: 'line' }, { fx: 0, fy: 0.5, dx: -3, dy: 0, want: 'paper' }, { fx: 0.5, fy: 0, dx: 0, dy: -3, want: 'paper' }] });
  check(tag + 'le trait est dans la boîte : le premier pixel du bord est du trait, les trois pixels de dehors sont du papier, et la boîte garde sa largeur de 160 points', edge.mismatches.length === 0 && near(rectBox.box.width / rectBox.scale, 160, 0.5), edge);
  // La Lecture, aux pixels : deux formes (une rectangle arrondi, une étoile).
  await leave();
  await click('#btn-mode-read');
  await page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const readerResults = [];
  for (const kind of ['roundRect', 'star5', 'rightArrow']) {
    const index = KINDS_FIRST.indexOf(kind);
    const look = index % 2 ? LOOK_B : LOOK_A;
    const shot = await shotOfBox(page, '#reader-container', index);
    readerResults.push(Object.assign({ kind }, await rasterOf(page, { b64: shot.b64, box: shot.box, scale: shot.scale, grid: true, spec: { kind, w: 160, h: 100, lw: look.lw, lineOn: true, fill: look.fill, line: look.line } })));
  }
  check(tag + 'la Lecture dessine le rectangle arrondi, l\'étoile et la flèche comme leur contour, aux pixels', readerResults.every(r => r.mismatches.length === 0 && r.checked > 40), readerResults);
  await snap(page, `${lang}-reader-formes`);
  await click('#btn-mode-edit');
  await sleep(900);
  // La miniature de la bande et le diaporama : mêmes variables, mêmes calques que l'éditeur.
  const looks = await page.evaluate(() => {
    const read = (box) => {
      const before = getComputedStyle(box, '::before');
      const after = getComputedStyle(box, '::after');
      const own = getComputedStyle(box);
      return { fill: before.backgroundColor, clip: before.clipPath, ring: after.clipPath, ringBg: after.backgroundColor, radius: before.borderTopLeftRadius, edge: after.borderTopWidth, vars: ['--ff-fill', '--ff-clip', '--ff-ring', '--ff-line'].map(n => own.getPropertyValue(n).trim()).join('|') };
    };
    const editor = Array.from(document.querySelectorAll('#editor-container .pp-free-frame-box')).slice(0, 8).map(read);
    const thumb = Array.from(document.querySelectorAll('.pp-slide-thumb')[0].querySelectorAll('.pp-free-frame-box')).slice(0, 8).map(read);
    return { editor, thumb };
  });
  check(tag + 'la miniature de la bande a les huit premières formes avec les mêmes calques que l\'éditeur (fond, polygone, anneau du trait)', looks.thumb.length === 8 && looks.thumb.every((th, i) => th.fill === looks.editor[i].fill && th.clip === looks.editor[i].clip && th.ring === looks.editor[i].ring && th.vars === looks.editor[i].vars), looks);
  await click('.pp-slide-item', 0);
  await leave();
  await click('.pp-slide-show-open');
  await page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  const showLooks = await page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const shadow = host && host.shadowRoot;
    if (!shadow) return null;
    return Array.from(shadow.querySelectorAll('.pp-free-frame-box')).slice(0, 8).map((box) => { const before = getComputedStyle(box, '::before'); return { fill: before.backgroundColor, clip: before.clipPath }; });
  });
  check(tag + 'le diaporama dessine les huit premières formes avec les mêmes calques (fond et polygone)', !!showLooks && showLooks.length === 8 && showLooks.every((s, i) => s.fill === looks.editor[i].fill && s.clip === looks.editor[i].clip), showLooks);
  await press('Escape');
  await page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);

  // --- 4. Une forme qui grandit avec son texte étire son contour avec elle.
  console.log('\n' + tag + '4) Une forme qui grandit avec son texte');
  await open(12, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'shape:ellipse');
  await press('Enter');
  for (let i = 0; i < 7; i++) { await page.keyboard.type('Ligne ' + (i + 1)); await page.keyboard.press('Enter'); }
  await sleep(300);
  const grown = await docState(page);
  const grownTyped = await shotOfBox(page, '#editor-container', 0);
  check(tag + 'une ellipse dont le texte passe sa hauteur grandit (plus haute que ses 108 points), sa hauteur enregistrée reste de 108', grown.frames[0].h === 108 && grownTyped.box.height > 108 * grownTyped.scale + 10, { h: grown.frames[0].h, shown: grownTyped.box.height / grownTyped.scale });
  // Une ellipse à contour épais (6 points, modèle 11) qui porte huit lignes : son contour la suit, aux pixels - le bas est du trait, juste au-dessus du fond, et les quatre coins du papier.
  await open(11, 1);
  await click('.pp-slide-item', 0);
  await leave();
  const grownShot = await shotOfBox(page, '#editor-container', 0);
  const nominalPx = 108 * grownShot.scale;
  const lwNow = 6;
  const grownCheck = await rasterOf(page, {
    b64: grownShot.b64, box: grownShot.box, scale: grownShot.scale, grid: true, rim: 14, spec: { kind: 'ellipse', w: 144, h: 108, lw: lwNow, lineOn: true, fill: LOOK_B.fill, line: LOOK_B.line },
    explicit: [{ fx: 0.5, fy: 1, dx: 0, dy: -(lwNow * grownShot.scale + 3), want: 'fill' }, { fx: 0, fy: 0, dx: 3, dy: 3, want: 'paper' }, { fx: 1, fy: 0, dx: -3, dy: 3, want: 'paper' }, { fx: 0, fy: 1, dx: 3, dy: -3, want: 'paper' }, { fx: 1, fy: 1, dx: -3, dy: -3, want: 'paper' }, { fx: 0.5, fy: 1, dx: 0, dy: -(lwNow * grownShot.scale / 2), want: 'line' }, { fx: 0.5, fy: 0, dx: 0, dy: lwNow * grownShot.scale / 2, want: 'line' }],
  });
  const grownState = await docState(page);
  check(tag + 'une ellipse à contour épais qui grandit avec ses huit lignes étire son contour avec elle (aux pixels) : plus haute que ses 108 points, hauteur enregistrée inchangée, le bas est du trait, les coins du papier',
    grownState.frames[0].h === 108 && grownShot.box.height > nominalPx + 10 && grownCheck.mismatches.length === 0 && grownCheck.checked >= 20, { h: grownState.frames[0].h, shown: grownShot.box.height / grownShot.scale, grownCheck });
  await snap(page, `${lang}-forme-qui-grandit`);
  await press('Control+z');

  // --- 5. La barre : le fond, le trait, son épaisseur.
  console.log('\n' + tag + '5) La barre : fond, trait, épaisseur');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'textFrame');
  await press('Escape');
  const bare = await docState(page);
  check(tag + 'un cadre de texte neuf n\'a ni fond ni trait (sa barre le dit : pastilles sans couleur)', bare.frames.length === 1 && bare.frames[0].shape === '' && bare.frames[0].fill === '' && bare.frames[0].line === '' && bare.frames[0].lw === 0 && bare.selection.selectedFrame, bare);
  const bar = await page.evaluate(() => {
    const bars = ['fill', 'line'].map((n) => { const el = document.getElementById('v2-frame-' + n + '-bar'); return el ? getComputedStyle(el).backgroundColor : null; });
    const chips = ['fill-open', 'line-open', 'width-open'].map((n) => { const b = document.getElementById('v2-frame-' + n); if (!b) return null; const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded'), width: r.width, height: r.height }; });
    return { bars, chips };
  });
  check(tag + `la barre a trois pastilles à menu (« ${T.fill} », « ${T.line} », « ${T.lineWidth} »), fermées, de 26 pixels de haut au moins (celle des boutons des barres flottantes)`, bar.chips.every(c => !!c && c.expanded === 'false' && c.height >= 26) && bar.chips.map(c => c.label).join('|') === [T.fill, T.line, T.lineWidth].join('|'), bar);
  // Le fond : la palette s'ouvre sous la pastille, entière dans le panneau, au premier plan ; un vrai clic sur une pastille de couleur pose le fond.
  await click('#v2-frame-fill-open');
  const palette = await page.evaluate(() => { const p = document.querySelector('.v2-color-dropdown.visible'); if (!p) return null; const r = p.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, none: (p.querySelector('[data-action="none"]') || {}).textContent, expanded: document.getElementById('v2-frame-fill-open').getAttribute('aria-expanded') }; });
  check(tag + `un vrai clic sur la pastille ouvre la palette (entière dans le panneau, bouton « ${T.noFill} »), la pastille annonce son menu ouvert`, !!palette && inPanel(palette) && (palette.none || '').trim() === T.noFill && palette.expanded === 'true', palette);
  await click('.v2-color-dropdown.visible [data-color="#c8e6ff"]');
  let state = await docState(page);
  check(tag + 'le choix d\'une pastille (#c8e6ff) pose le fond, sans toucher au trait ni à la place, et laisse le cadre sélectionné', state.frames[0].fill === '#c8e6ff' && state.frames[0].line === '' && state.selection.selectedFrame, state.frames[0]);
  const fillBar = await page.evaluate(() => getComputedStyle(document.getElementById('v2-frame-fill-bar')).backgroundColor);
  check(tag + 'la barre montre la couleur du fond (rgb(200, 230, 255))', fillBar === 'rgb(200, 230, 255)', fillBar);
  await press('Control+z');
  state = await docState(page);
  check(tag + 'un seul Ctrl+Z retire le fond', state.frames[0].fill === '', state.frames[0]);
  await press('Control+Shift+z');
  // Le trait : une couleur sans épaisseur prend l'épaisseur d'une forme neuve (1,5 pt) ; l'épaisseur se règle ensuite dans sa liste.
  await click('#v2-frame-line-open');
  await click('.v2-color-dropdown.visible [data-color="#0369a1"]');
  state = await docState(page);
  check(tag + 'le choix d\'une couleur de trait (#0369a1) pose le trait avec l\'épaisseur d\'une forme neuve (1,5 pt)', state.frames[0].line === '#0369a1' && state.frames[0].lw === 1.5 && state.frames[0].fill === '#c8e6ff', state.frames[0]);
  await click('#v2-frame-width-open');
  const widthMenu = await page.evaluate(() => {
    const m = document.querySelector('.v2-frame-width-menu.visible');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const rows = Array.from(m.querySelectorAll('[data-action]')).map(b => ({ action: b.dataset.action, text: b.textContent.trim(), checked: b.getAttribute('aria-checked'), sample: !!b.querySelector('.pp-ff-width-sample') }));
    return { role: m.getAttribute('role'), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, rows };
  });
  const wantRows = [T.widthNone].concat(WIDTHS.map(T.width));
  check(tag + `la liste des épaisseurs : « ${T.widthNone} » puis ${WIDTHS.length} épaisseurs (${WIDTHS.map(T.width).join(', ')}), chacune avec son échantillon, 1,5 pt cochée, entière dans le panneau`,
    !!widthMenu && widthMenu.role === 'menu' && JSON.stringify(widthMenu.rows.map(r => r.text)) === JSON.stringify(wantRows) && widthMenu.rows.every(r => r.sample) && widthMenu.rows.filter(r => r.checked === 'true').map(r => r.action).join() === 'width:1.5' && inPanel(widthMenu.rect), widthMenu);
  await click('.v2-frame-width-menu.visible [data-action="width:4.5"]');
  state = await docState(page);
  check(tag + 'un vrai clic sur « ' + T.width(4.5) + ' » règle le trait à 4,5 points', state.frames[0].lw === 4.5 && state.frames[0].line === '#0369a1', state.frames[0]);
  await press('Control+z');
  check(tag + 'un seul Ctrl+Z revient à 1,5 point', (await docState(page)).frames[0].lw === 1.5);
  await click('#v2-frame-width-open');
  await click('.v2-frame-width-menu.visible [data-action="width:0"]');
  state = await docState(page);
  const noLineCss = await page.evaluate(() => { const box = document.querySelector('#editor-container .pp-free-frame-box'); const a = getComputedStyle(box, '::after'); return { border: a.borderTopWidth, edge: getComputedStyle(box).getPropertyValue('--ff-edge').trim() }; });
  check(tag + `« ${T.widthNone} » retire le trait (épaisseur 0, aucune bordure dessinée), le fond reste`, state.frames[0].lw === 0 && state.frames[0].fill === '#c8e6ff' && noLineCss.border === '0px', { frame: state.frames[0], noLineCss });
  await press('Control+z');
  // « Sans trait » de la palette du trait, « Sans remplissage » de celle du fond.
  await click('#v2-frame-line-open');
  await click('.v2-color-dropdown.visible [data-action="none"]');
  state = await docState(page);
  check(tag + `« ${T.noLine} » retire la couleur du trait`, state.frames[0].line === '' && state.frames[0].fill === '#c8e6ff', state.frames[0]);
  await click('#v2-frame-fill-open');
  await click('.v2-color-dropdown.visible [data-action="none"]');
  state = await docState(page);
  check(tag + `« ${T.noFill} » retire le fond : le cadre redevient nu`, state.frames[0].fill === '' && state.frames[0].line === '' && state.selection.selectedFrame, state.frames[0]);
  // Dupliquer garde la forme et son aspect.
  await press('Control+z');
  await press('Control+z');
  await chooseObject(page, 'shape:diamond');
  await click('.v2-frame-toolbar [data-action="duplicate"]');
  const dup = (await docState(page)).frames;
  const diamonds = dup.filter(f => f.shape === 'diamond');
  check(tag + `« ${T.duplicate} » garde la forme, le fond et le trait : deux losanges identiques, la copie décalée`, diamonds.length === 2 && diamonds[0].fill === diamonds[1].fill && diamonds[0].line === diamonds[1].line && diamonds[0].lw === diamonds[1].lw && diamonds[0].w === diamonds[1].w && diamonds[1].x > diamonds[0].x, dup);
  await snap(page, `${lang}-barre-forme`);

  // --- 6. Les sorties : le PDF, le Word.
  console.log('\n' + tag + '6) Les sorties : PDF, Word');
  await open(8, 3);
  await leave();
  const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfBytes = readFileSync(await pdfDownload.path()).toString('base64');
  const pdf1 = await renderPdfPage(page, pdfBytes, 1, 2);
  check(tag + 'le PDF a trois pages, une par diapositive', pdf1.numPages === 3, pdf1.numPages);
  const pdfShapes = async (png, list) => {
    const found = [];
    for (let i = 0; i < list.length; i++) {
      const kind = list[i];
      const look = i % 2 ? LOOK_B : LOOK_A;
      const x = 40 + (i % 4) * 230;
      const y = i < 4 ? 60 : 260;
      found.push(Object.assign({ kind }, await rasterOf(page, { b64: png, box: { left: x * 2, top: y * 2, width: 160 * 2, height: 100 * 2 }, scale: 2, grid: true, spec: { kind, w: 160, h: 100, lw: look.lw, lineOn: true, fill: look.fill, line: look.line } })));
    }
    return found;
  };
  const pdfResults = await pdfShapes(pdf1.png, KINDS_FIRST);
  check(tag + 'le PDF dessine les huit premières formes comme leur contour, aux mêmes mesures de la page que l\'éditeur (mêmes points : fond dedans, papier dehors, trait au milieu des côtés)', pdfResults.every(r => r.mismatches.length === 0 && r.checked > 40), pdfResults.filter(r => r.mismatches.length));
  if (SHOTS) await page.evaluate(() => 0);
  const pdf2 = await renderPdfPage(page, pdfBytes, 2, 2);
  const filled = await rasterOf(page, { b64: pdf2.png, box: { left: 200, top: 200, width: 600, height: 160 }, scale: 2, grid: false, spec: { kind: 'rect', w: 300, h: 80, lw: 1.5, lineOn: true, fill: TEXT_LOOK.fill, line: TEXT_LOOK.line }, explicit: [{ fx: 0.9, fy: 0.5, want: 'fill' }, { fx: 0.5, fy: 0.05, dy: 0, want: 'fill' }, { fx: 0, fy: 0.5, dx: -4, want: 'paper' }, { fx: 0.5, fy: 0, dx: 0, dy: 1, want: 'line' }] });
  check(tag + 'le PDF peint un cadre de texte qui a un fond et un trait (un rectangle de 300 x 80 points à son endroit : fond dedans, trait sur le bord, papier dehors)', filled.mismatches.length === 0 && filled.checked >= 4, filled);
  const frameText = pdf2.lines.find(l => /Cadre rempli/.test(l.text));
  check(tag + 'son texte est dedans, à la marge intérieure (100 + 7,2 + le trait de 1,5 point ; en haut 100 + 3,6 + 1,5 + la ligne de base)', !!frameText && near(frameText.x, 108.7, 0.8) && frameText.y > 100 && frameText.y < 140, frameText);
  const ellipseResult = await rasterOf(page, { b64: pdf2.png, box: { left: 480 * 2, top: 150 * 2, width: 240 * 2, height: 140 * 2 }, scale: 2, grid: true, spec: { kind: 'ellipse', w: 240, h: 140, lw: 6, lineOn: true, fill: LOOK_B.fill, line: LOOK_B.line } });
  // Le texte d'une forme est au centre de sa boîte : le milieu de la ligne est au milieu de la forme (480 + 120 ; 150 + 70).
  const centered = pdf2.lines.find(l => /Au centre/.test(l.text));
  check(tag + 'le PDF dessine l\'ellipse qui porte un texte (grille de points, hors du texte), et ce texte est centré : le milieu de la ligne à 600 points (à 2), sa ligne de base près de 220',
    !!centered && Math.abs((centered.x + centered.right) / 2 - 600) <= 2 && Math.abs(centered.y - 225) <= 10 && ellipseResult.mismatches.filter(m => m.tag !== 'grille' || m.want !== 'fill').length === 0, { centered, ellipse: ellipseResult.mismatches });
  if (SHOTS) {
    await page.evaluate((b64) => { const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; img.id = '__pdfshot'; img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:700px'; document.body.appendChild(img); }, pdf1.png);
    await sleep(300);
    await snap(page, `${lang}-pdf-formes`);
    await page.evaluate(() => document.getElementById('__pdfshot').remove());
  }
  // Word : des formes prédéfinies.
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [docxDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const docxB64 = readFileSync(await docxDownload.path()).toString('base64');
  const word = await page.evaluate(wordShapesOf, docxB64);
  const EMU = 12700;
  const wordShapes = word.shapes.slice(0, 8);
  check(tag + 'le Word fait des huit premières formes des formes prédéfinies, dans l\'ordre : ' + KINDS_FIRST.join(', '), JSON.stringify(wordShapes.map(s => s.prst)) === JSON.stringify(KINDS_FIRST), word.shapes.map(s => s.prst));
  check(tag + 'chacune a son fond (rouge-vert-bleu en majuscules), son trait (couleur et 6 points en EMU), le texte centré dans la boîte (ancre au centre) et n\'est pas une zone de texte',
    wordShapes.every((s, i) => s.fill === (i % 2 ? LOOK_B : LOOK_A).fill.slice(1).toUpperCase() && s.lineColor === (i % 2 ? LOOK_B : LOOK_A).line.slice(1).toUpperCase() && s.lineWidth === 6 * EMU && s.anchor === 'ctr' && s.txBox === null), wordShapes);
  check(tag + 'les enfants de la forme sont dans l\'ordre du schéma (position, géométrie, fond, trait)', wordShapes.every(s => s.order === 'a:xfrm,a:prstGeom,a:solidFill,a:ln'), wordShapes.map(s => s.order));
  // Le trait de Word est centré sur le contour : la forme rentre de la moitié de l'épaisseur pour que son encre tienne dans la boîte (40 + 3 ; 60 + 3 ; 160 - 6 ; 100 - 6).
  check(tag + 'la première forme est posée dans sa boîte (x 43, y 63, 154 x 94 points) : le trait de Word, centré sur le contour, déborde de moitié', wordShapes[0] && wordShapes[0].x === 43 * EMU && wordShapes[0].y === 63 * EMU && wordShapes[0].cx === 154 * EMU && wordShapes[0].cy === 94 * EMU, wordShapes[0]);
  const wordText = word.shapes.find(s => /Cadre rempli/.test(s.text));
  const wordEllipse = word.shapes.find(s => /Au centre/.test(s.text));
  check(tag + 'un cadre de texte avec un fond et un trait reste une zone de texte (txBox) avec son fond et son trait de 1,5 point ; l\'ellipse qui porte un texte est une forme (ellipse, ancre au centre)',
    !!wordText && wordText.txBox === '1' && wordText.prst === 'rect' && wordText.fill === 'FFF2A8' && wordText.lineColor === 'A16207' && wordText.lineWidth === 1.5 * EMU && wordText.order === 'a:xfrm,a:prstGeom,a:solidFill,a:ln'
    && !!wordEllipse && wordEllipse.prst === 'ellipse' && wordEllipse.anchor === 'ctr' && wordEllipse.txBox === null, { wordText, wordEllipse });
  // Les huit autres formes : le Word (une forme prédéfinie à leur nom ; la bulle n'a pour boîte que son corps, sa queue dépasse comme dans PowerPoint), puis le PDF.
  await open(13, 2);
  await leave();
  // Un autre modèle rouvre le choix d'export où il l'avait laissé : le Word se redemande.
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [docx2Download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const word2 = await page.evaluate(wordShapesOf, readFileSync(await docx2Download.path()).toString('base64'));
  const moreShapes = word2.shapes.slice(0, 8);
  check(tag + 'le Word fait des huit autres formes des formes prédéfinies à leur nom, dans l\'ordre : ' + KINDS_MORE.join(', '), JSON.stringify(moreShapes.map(s => s.prst)) === JSON.stringify(KINDS_MORE), word2.shapes.map(s => s.prst));
  check(tag + 'chacune a son fond, son trait de 6 points, le texte centré dans la boîte (ancre au centre), n\'est pas une zone de texte, et ses enfants sont dans l\'ordre du schéma',
    moreShapes.every((s, i) => s.fill === (i % 2 ? LOOK_B : LOOK_A).fill.slice(1).toUpperCase() && s.lineColor === (i % 2 ? LOOK_B : LOOK_A).line.slice(1).toUpperCase() && s.lineWidth === 6 * EMU && s.anchor === 'ctr' && s.txBox === null
      && s.order === 'a:xfrm,a:prstGeom,a:solidFill,a:ln'), moreShapes);
  // Une boîte de 160 x 100 points au trait de 6 : Word la reçoit rentrée de 3 points de chaque côté (154 x 94) ; la bulle, elle, est un corps de huit neuvièmes de la hauteur (88,89 - 6 = 82,89 points)
  // et sa queue dépasse en dessous, de la boîte de PowerPoint jusqu'à celle du cadre.
  const bubble = moreShapes[7];
  check(tag + 'la bulle a pour boîte son corps (les huit neuvièmes de la hauteur, le trait en moins : 154 x 82,89 points, posée en 733, 263), les sept autres ont leur boîte entière (154 x 94)',
    !!bubble && near(bubble.cy / EMU, 100 * 8 / 9 - 6, 0.01) && bubble.cx === 154 * EMU && bubble.x === 733 * EMU && bubble.y === 263 * EMU && moreShapes.slice(0, 7).every(s => s.cx === 154 * EMU && s.cy === 94 * EMU), moreShapes.map(s => [s.cx / EMU, s.cy / EMU]));
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await leave();
  const [pdf2Download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfMore = await renderPdfPage(page, readFileSync(await pdf2Download.path()).toString('base64'), 1, 2);
  const moreResults = await pdfShapes(pdfMore.png, KINDS_MORE);
  check(tag + 'le PDF dessine les huit autres formes comme leur contour, aux mêmes mesures de la page que l\'éditeur (mêmes points : fond dedans, papier dehors, trait au milieu des côtés)', moreResults.every(r => r.mismatches.length === 0 && r.checked > 40), moreResults.filter(r => r.mismatches.length));
  const text = await page.evaluate(async (html) => {
    await ExportEngines.loadAll();
    const doc = await HtmlExport.htmlToDocument(html, {});
    const md = await MarkdownExport.htmlToMarkdown(html);
    return { html: typeof doc === 'string' ? doc : JSON.stringify(doc), md };
  }, '<h1>Titre</h1>' + SHAPE(100, 100, 200, 100, Object.assign({ shape: 'ellipse' }, LOOK_B), CENTERED('Texte <strong>gras</strong> de la forme')) + '<p>Texte</p>');
  check(tag + 'le HTML et le Markdown gardent le texte de la forme (en gras comme il l\'est), sans sa position ni son dessin', /Texte <strong>gras<\/strong> de la forme/.test(text.html) && !/ff-x|data-ff|--ff-|pp-free-frame/.test(text.html) && /Texte \*\*gras\*\* de la forme/.test(text.md), { html: text.html.slice(-300), md: text.md });

  // --- 7. Les valeurs : hors normes, nu, enregistré.
  console.log('\n' + tag + '7) Les valeurs, un cadre nu, l\'enregistrement');
  await open(9, 1);
  const odd = (await docState(page)).frames;
  check(tag + 'une sorte inconnue (« hexagon ») devient un rectangle, une couleur illisible (« rouge ») disparaît, un code court (« #12 ») aussi, une épaisseur énorme est bornée à 36 points',
    odd.length === 2 && odd[0].shape === 'rect' && odd[0].fill === '' && odd[0].line === '' && odd[0].lw === 36, odd);
  check(tag + 'une couleur « RGB(255, 0, 0) » est lue (#ff0000), « #00F » aussi (#0000ff), une épaisseur négative devient 0', odd[1].shape === 'ellipse' && odd[1].fill === '#ff0000' && odd[1].line === '#0000ff' && odd[1].lw === 0, odd[1]);
  await open(10, 1);
  const naked = await page.evaluate(() => { const html = Editor.getHTML(); const m = html.match(/<div class="pp-free-frame"[^>]*>/); return { open: m && m[0], hasLook: /data-ff-(shape|fill|line|lw)|--ff-(fill|line|edge|radius|clip|ring|pt|pr|pb|pl)/.test(html) }; });
  check(tag + 'un cadre de texte nu s\'écrit comme avant ce lot : ses quatre mesures, ni sorte, ni fond, ni trait, ni marge de texte dans le style', !!naked.open && !naked.hasLook && /data-ff-x="100" data-ff-y="100" data-ff-w="300" data-ff-h="60"/.test(naked.open), naked);
  // Enregistrer et rouvrir : une forme revient à l'identique.
  await open(7, 3);
  await click('.pp-slide-item', 2);
  await chooseObject(page, 'shape:rightArrow');
  await click('#v2-frame-fill-open');
  await click('.v2-color-dropdown.visible [data-color="#c8f7c5"]');
  await click('#v2-frame-width-open');
  await click('.v2-frame-width-menu.visible [data-action="width:3"]');
  const arrowOf = async () => (await docState(page)).frames.find(f => f.shape === 'rightArrow');
  const before = await arrowOf();
  await save();
  await open(8, 3);
  await open(7, 3);
  const after = await arrowOf();
  const stored = await page.evaluate(() => /data-ff-shape="rightArrow"[^>]*data-ff-fill="#c8f7c5"|data-ff-fill="#c8f7c5"[^>]*data-ff-shape="rightArrow"/.test(Editor.getHTML()));
  check(tag + 'une flèche à droite (fond #c8f7c5, trait 3 points) enregistrée puis rouverte revient à l\'identique, et le texte enregistré porte sa sorte et son fond', !!after && JSON.stringify({ ...after, pos: 0 }) === JSON.stringify({ ...before, pos: 0 }) && after.shape === 'rightArrow' && after.fill === '#c8f7c5' && after.lw === 3 && stored, { before, after, stored });
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
