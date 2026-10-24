#!/usr/bin/env node
// Les lignes et les flèches d'une présentation (js/shape-geometry.js : `lineOutline`, js/free-frame.js : `freeLine`, css/free-frame.css, js/objects-menu.js ; demande du 21/10 à
// 18:35 : « ajout de forme », ordre de PowerPoint : traits et flèches), à la vraie souris et au vrai clavier, 700x400, français clair puis anglais sombre, hébergé par GFS (simulé par
// dev-tests/gfs-stub.js), l'extension « diapositives » active. Une ligne est un objet de la diapositive qui va d'un point à un autre, avec ou sans pointe à chaque bout, de la couleur et de
// l'épaisseur de son trait ; elle n'a pas de texte.
//  LE MENU « OBJETS » (le bouton de la barre d'outils du haut, js/objects-menu.js ; il était sous les miniatures jusqu'au 22/10) : sous la grille des formes, un titre « Lignes » et une rangée de
//   trois boutons (ligne, ligne avec flèche, ligne avec deux flèches : une icône chacun, le nom en info-bulle et en nom accessible, dans la langue de la page), entière dans le panneau, lisible
//   (>= 4,5:1) ; au clavier ↑ ↓ passent des formes aux lignes en gardant leur colonne, ← → les parcourent d'un trait, Début Fin, Entrée pose la ligne choisie.
//  LA POSE : chacune des trois lignes, au vrai clic, est posée au centre de la diapositive du curseur, horizontale, de 192 points, en bleu (#2f5597) de 3 points, avec ses pointes, SÉLECTIONNÉE (sa
//   barre est là : couleur du trait, épaisseur, extrémités ; ni fond ni « sans trait »), devant les autres ; un seul Ctrl+Z la défait au caractère près.
//  LE DESSIN : le modèle de PowerPoint (un corps de l'épaisseur du trait, des pointes triangulaires de trois fois l'épaisseur, six points au moins) est écrit dans ce script SANS rien emprunter au code
//   du widget ; une grille de points d'une capture (éditeur, Lecture, PDF relu par pdf.js) est de l'encre dedans, du papier dehors, à 2,2 pixels du bord près : six lignes (horizontale, diagonales
//   dans les quatre sens, verticale, trait fin, ligne plus courte que ses pointes), les mêmes dans la miniature, la Lecture et le diaporama (mêmes variables).
//  LA SOURIS : seule la bande qui suit le trait (9 points de large au moins) se saisit ; le texte dessous reste atteignable à quelques pixels de la ligne ; on la déplace par cette bande (un pas d'historique),
//   on glisse chacun de ses deux bouts (celui qu'on tient suit la souris, l'autre ne bouge pas, le sens se retourne tout seul), Maj tient les angles à 15°, Échap abandonne ; les bouts ne se voient que
//   sélectionnée ; les flèches du clavier la déplacent, Entrée ne fait rien, Suppr l'enlève, dupliquer, devant et derrière marchent comme pour un cadre.
//  LA BARRE : « Extrémités » (en tête de son menu quatre icônes, dont le nom est l'info-bulle : sans flèche, à la fin, au début, aux deux bouts ; la forme et la taille de la pointe de chaque bout sont dans
//   dev-tests/verify-frame-ends.mjs), « Couleur du trait », « Épaisseur du trait » (sept épaisseurs, pas de « Aucun trait »), UN pas d'historique chacun ; un cadre ou une forme garde sa barre (le fond, pas
//   les extrémités).
//  LES SORTIES : le PDF dessine les six lignes aux mêmes mesures de la page (aucune page de plus) ; le Word en fait des lignes prédéfinies (`prst="line"`) retournées (`flipH`, `flipV`), avec leurs pointes
//   (`a:headEnd`, `a:tailEnd`), leur trait en EMU et leur boîte exacte (le trait est centré sur la ligne : rien n'est rentré) ; le HTML et le Markdown ne gardent rien d'une ligne.
//  LES VALEURS : un sens lu pour ce qu'il contient (« vh » vaut « hv »), une pointe inconnue devient la pointe pleine, une épaisseur bornée (0,25 à 36 points), une couleur illisible ou absente
//   remplacée par la couleur d'origine, une ligne de longueur nulle allongée d'un point, un fond ignoré ; un collage garde le sens et les pointes ; enregistrée puis rouverte, une ligne revient à l'identique.
// Lancé par run-headless.mjs (groupe Node "lines", cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-lines.mjs
// LINES_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; sans elle, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, contrastOf, WIDTH, HEIGHT, OBJECTS_BUTTON, objectRow, hoverObject, chooseObject } from './gfs-page.mjs';

const SHOTS = process.env.LINES_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-lines', port: Number(process.env.LINES_PORT || 8967) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const SLIDES = `<h1>Titre un</h1><p>Premier texte</p>${BR}<h2>Deux</h2><ul><li><p>a</p></li><li><p>b</p></li></ul>${BR}<p>Trois</p>`;
// Une ligne, écrite comme l'enregistrement le fait : les mesures, la sorte, le trait, puis le sens et les pointes quand il y en a.
const LINE = (x, y, w, h, look) => {
  const a = Object.assign({ line: '#2f5597', lw: 3, flip: '', head: '', tail: '' }, look);
  const extra = ['line', 'lw', 'flip', 'head', 'tail'].filter(key => a[key] !== '').map(key => ` data-ff-${key}="${a[key]}"`).join('');
  return `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line"${extra}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
};
// Un élément écrit à la main (les attributs tels quels) : des valeurs hors normes.
const RAW = attrs => `<div class="pp-free-frame" role="group" ${attrs}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
// Six lignes de la première diapositive de « Tracées » : chacune a sa couleur, ses mesures (points, depuis le coin de la page) et son sens. Aucune n'en touche une autre ni le titre.
//  A : horizontale, pointe à la fin ; B : diagonale vers le bas à droite, deux pointes ; C : diagonale retournée à l'horizontale (le début est en haut à droite), pointe au début ;
//  D : verticale retournée (le début est en bas), pointe à la fin ; E : trait fin, sans pointe ; F : plus courte que ses deux pointes.
const SIX = [
  { name: 'A', x: 100, y: 170, w: 300, h: 0, line: '#be185d', lw: 4, flip: '', head: '', tail: 'triangle' },
  { name: 'B', x: 480, y: 170, w: 300, h: 200, line: '#0369a1', lw: 6, flip: '', head: 'triangle', tail: 'triangle' },
  { name: 'C', x: 100, y: 260, w: 220, h: 140, line: '#15803d', lw: 4, flip: 'h', head: 'triangle', tail: '' },
  { name: 'D', x: 420, y: 330, w: 0, h: 150, line: '#b45309', lw: 8, flip: 'v', head: '', tail: 'triangle' },
  { name: 'E', x: 560, y: 400, w: 300, h: 80, line: '#7c3aed', lw: 2, flip: '', head: '', tail: '' },
  { name: 'F', x: 860, y: 100, w: 20, h: 0, line: '#dc2626', lw: 6, flip: '', head: 'triangle', tail: 'triangle' },
];
const lineOf = s => LINE(s.x, s.y, s.w, s.h, { line: s.line, lw: s.lw, flip: s.flip, head: s.head, tail: s.tail });
// 7 « Lignes » : trois diapositives (le menu, la pose, la barre, la souris) ; 8 « Tracées » : les six lignes (diapositive 1), un titre et une ligne qui le traverse (2), un texte (3) ;
// 9 « Valeurs » : des lignes écrites à la main, hors normes ; 10 « Mélange » : un cadre de texte, une forme et une ligne (la barre de chacun) ; 11 « Sans ligne » : trois diapositives, le PDF n'a pas de page de plus.
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Lignes', '${SLIDES}', false, 'presentation');
  add(8, 'Tracées', '${SIX.map(lineOf).join('')}<h1>Les lignes</h1>${BR}${LINE(60, 150, 400, 0, {})}<h1>Titre sous la ligne</h1><p>Un texte sous la ligne</p>${BR}<p>Trois</p>', false, 'presentation');
  add(9, 'Valeurs', '${[
    RAW('data-ff-x="100" data-ff-y="100" data-ff-w="200" data-ff-h="100" data-ff-shape="line" data-ff-line="#0369a1" data-ff-lw="9999" data-ff-flip="vh" data-ff-head="chevron" data-ff-tail="flèche" data-ff-fill="#ff0000"'),
    RAW('data-ff-x="400" data-ff-y="100" data-ff-w="150" data-ff-h="0" data-ff-shape="line" data-ff-head="none" data-ff-line="rouge"'),
    RAW('data-ff-x="100" data-ff-y="300" data-ff-w="0" data-ff-h="0" data-ff-shape="line" data-ff-lw="0.1"'),
    RAW('data-ff-x="400" data-ff-y="300" data-ff-w="-50" data-ff-h="-20" data-ff-shape="line" data-ff-lw="-4" data-ff-line="RGB(255, 0, 0)" data-ff-flip="V"'),
  ].join('')}<p>Valeurs</p>', false, 'presentation');
  add(10, 'Mélange', '<div class="pp-free-frame" role="group" data-ff-x="100" data-ff-y="100" data-ff-w="200" data-ff-h="80" data-ff-shape="rect" data-ff-fill="#d9e2f3" data-ff-line="#2f5597" data-ff-lw="1.5"><div class="pp-free-frame-box"><div class="pp-free-frame-content"><p>Forme</p></div></div></div>${LINE(400, 120, 200, 0, { tail: 'triangle' })}<p>Texte</p>', false, 'presentation');
  add(11, 'Sans ligne', '${SLIDES}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;

const TEXTS = {
  fr: {
    menu: 'Objets', heading: 'Lignes', shapes: 'Formes', textFrame: 'Cadre de texte', fill: 'Couleur de fond', line: 'Couleur du trait', lineWidth: 'Épaisseur du trait', ends: 'Extrémités', noLine: 'Sans trait', widthNone: 'Aucun trait',
    duplicate: 'Dupliquer l\'objet', start: 'Glisser pour déplacer le début de la ligne', end: 'Glisser pour déplacer la fin de la ligne', move: 'Glisser pour déplacer l\'objet',
    tip: (name, n) => `${name} au centre de la diapositive ${n}`,
    names: { 'line:plain': 'Ligne', 'line:arrow': 'Ligne avec flèche', 'line:double': 'Ligne avec deux flèches' },
    endsRows: ['Sans flèche', 'Flèche à la fin', 'Flèche au début', 'Flèches aux deux bouts'],
    width: n => `${String(n).replace('.', ',')} pt`,
  },
  en: {
    menu: 'Objects', heading: 'Lines', shapes: 'Shapes', textFrame: 'Text frame', fill: 'Fill color', line: 'Line color', lineWidth: 'Line weight', ends: 'Line ends', noLine: 'No line', widthNone: 'No line',
    duplicate: 'Duplicate the object', start: 'Drag to move the start of the line', end: 'Drag to move the end of the line', move: 'Drag to move the object',
    tip: (name, n) => `${name} in the middle of slide ${n}`,
    names: { 'line:plain': 'Line', 'line:arrow': 'Line with arrow', 'line:double': 'Line with two arrows' },
    endsRows: ['No arrow', 'Arrow at the end', 'Arrow at the start', 'Arrows at both ends'],
    width: n => `${n} pt`,
  },
};
const LINE_IDS = ['line:plain', 'line:arrow', 'line:double'];
const WIDTHS = [0.5, 1, 1.5, 2, 3, 4.5, 6];
const PT = 96 / 72;
const EMU = 12700;
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

// Les lignes et les cadres du texte avec leur aspect, la forme du texte (types de nœuds de premier niveau), la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const lines = [];
  const frames = [];
  const shape = [];
  editor.state.doc.forEach((node, offset) => {
    const name = node.type.name;
    shape.push(name === 'freeLine' ? 'L' : name === 'freeFrame' ? 'F' : name === 'pageBreak' ? '|' : name === 'heading' ? 'h' : name === 'paragraph' ? 'p' : name.slice(0, 2));
    const a = node.attrs;
    if (name === 'freeLine') lines.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, shape: a.shape, fill: a.fill, line: a.line, lw: a.lw, flip: a.flip, head: a.head, tail: a.tail });
    if (name === 'freeFrame') frames.push({ pos: offset, x: a.x, y: a.y, w: a.w, h: a.h, shape: a.shape, fill: a.fill, line: a.line, lw: a.lw, text: node.textContent });
  });
  const sel = editor.state.selection;
  return { lines, frames, shape: shape.join(''), selection: { selectedLine: !!(sel.node && sel.node.type.name === 'freeLine'), selectedFrame: !!(sel.node && sel.node.type.name === 'freeFrame'), text: !sel.node } };
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
// Les deux bouts d'une ligne `l` (x, y, w, h, flip : points, depuis le coin de la page) : le début et la fin.
const endsOf = (l) => {
  const right = /h/.test(l.flip || '');
  const bottom = /v/.test(l.flip || '');
  return { start: [l.x + (right ? l.w : 0), l.y + (bottom ? l.h : 0)], end: [l.x + (right ? 0 : l.w), l.y + (bottom ? 0 : l.h)] };
};
// Un point de la page (points) sur l'écran, d'après l'état de l'écran et le rang de la diapositive.
const onScreen = (screen, slide, p) => [screen.contentLeft + p[0] * PT * screen.zoom, screen.pageTops[slide] + p[1] * PT * screen.zoom];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le modèle de l'encre d'une ligne, écrit ici d'après PowerPoint (un corps de l'épaisseur du trait, une pointe triangulaire « moyenne » : trois fois l'épaisseur, six points au moins, rétrécie quand
// la ligne est plus courte que ses pointes), SANS rien emprunter au code du widget : des polygones convexes dont l'encre est la réunion. Rend les pièces, en points depuis le coin de la boîte des
// deux bouts.
function inkPieces({ w, h, flip = '', lw, head = '', tail = '' }) {
  const right = /h/.test(flip);
  const bottom = /v/.test(flip);
  const S = [right ? w : 0, bottom ? h : 0];
  const E = [right ? 0 : w, bottom ? 0 : h];
  const len = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const u = [(E[0] - S[0]) / len, (E[1] - S[1]) / len];
  const n = [-u[1], u[0]];
  const heads = (head ? 1 : 0) + (tail ? 1 : 0);
  let L = 3 * Math.max(lw, 2);
  if (heads * L > len) L = len / heads;
  const half = lw / 2;
  const wing = Math.max(half, L / 2);
  const at = (from, along, side) => [from[0] + u[0] * along + n[0] * side, from[1] + u[1] * along + n[1] * side];
  const a = head ? L : 0;
  const b = tail ? L : 0;
  const pieces = [];
  if (len - a - b > 1e-6) pieces.push([at(S, a, half), at(E, -b, half), at(E, -b, -half), at(S, a, -half)]);
  if (head) pieces.push([S, at(S, L, wing), at(S, L, -wing)]);
  if (tail) pieces.push([E, at(E, -L, -wing), at(E, -L, wing)]);
  return { pieces, S, E, len, u, L };
}
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
// Les sondes d'une ligne : [x, y, 1 (de l'encre) ou 0 (du papier)] en pixels de l'image. `map` : un point de la boîte (points) sur l'image ; `k` : les pixels par point. Une grille (un point tous
// les 3 pixels) à `margin` pixels au moins du bord de l'encre, et le milieu du trait (qui est de l'encre jusqu'à un trait fin) de 4 en 4 pixels.
function probesOf(spec, map, k, margin = 2.2) {
  const model = inkPieces(spec);
  const marginPt = margin / k;
  const all = model.pieces.flat();
  const pad = 4 / k + marginPt;
  const x0 = Math.min(...all.map(p => p[0])) - pad;
  const x1 = Math.max(...all.map(p => p[0])) + pad;
  const y0 = Math.min(...all.map(p => p[1])) - pad;
  const y1 = Math.max(...all.map(p => p[1])) + pad;
  const probes = [];
  const add = (p, minClear) => {
    const d = model.pieces.map(piece => signedDistance(piece, p));
    if (!d.every(v => Math.abs(v) >= minClear)) return;
    const [px, py] = map(p[0], p[1]);
    probes.push([Math.floor(px), Math.floor(py), d.some(v => v < 0) ? 1 : 0]);
  };
  const step = 3 / k;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) add([x, y], marginPt);
  const along = 4 / k;
  const centre = Math.min(marginPt, Math.max(0.2 / k, spec.lw / 2 - 0.35 / k));
  for (let tt = 0; tt <= model.len; tt += along) add([model.S[0] + model.u[0] * tt, model.S[1] + model.u[1] * tt], centre);
  return probes;
}
// Exécutée DANS la page : compare une image (PNG en base64) aux sondes : chacune est de la couleur de l'encre ou du papier, à 60 de distance (rouge, vert, bleu) près.
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
    if (got !== want && mismatches.length < 6) mismatches.push({ at: [x, y], want, got, rgb });
  });
  return { checked, inked, mismatches, paper, outside: probes.length - checked };
}
const probeOf = (page, args) => page.evaluate(probeImage, args);

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
  return { numPages: doc.numPages, png: canvas.toDataURL('image/png').split(',')[1], width: viewport.width / factor, height: viewport.height / factor };
}, [b64, n, scale]);

// Les lignes d'un .docx (en base64), lues dans la page : leur forme prédéfinie, leur sens, leurs pointes, leur trait, leur ancre, leur position et leur taille en EMU.
const wordShapesOf = async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const first = (el, name) => (el ? el.getElementsByTagName(name)[0] || null : null);
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const shapes = Array.from(doc.getElementsByTagName('wp:anchor')).map((anchor) => {
    const spPr = first(anchor, 'wps:spPr');
    const ln = spPr && Array.from(spPr.children).find(c => c.tagName === 'a:ln');
    const xfrm = first(spPr, 'a:xfrm');
    const h = first(anchor, 'wp:positionH');
    const v = first(anchor, 'wp:positionV');
    const ext = first(anchor, 'wp:extent');
    const end = name => (first(ln, name) ? { type: attr(first(ln, name), 'type'), w: attr(first(ln, name), 'w'), len: attr(first(ln, name), 'len') } : null);
    return {
      prst: attr(first(spPr, 'a:prstGeom'), 'prst'), order: spPr ? Array.from(spPr.children).map(c => c.tagName).join(',') : '', lnOrder: ln ? Array.from(ln.children).map(c => c.tagName).join(',') : '',
      flipH: attr(xfrm, 'flipH'), flipV: attr(xfrm, 'flipV'), lineWidth: ln ? Number(attr(ln, 'w')) : null, lineColor: ln && first(ln, 'a:srgbClr') ? attr(first(ln, 'a:srgbClr'), 'val') : null,
      head: end('a:headEnd'), tail: end('a:tailEnd'), txBox: attr(first(anchor, 'wps:cNvSpPr'), 'txBox'), x: Number(first(h, 'wp:posOffset').textContent), y: Number(first(v, 'wp:posOffset').textContent),
      cx: Number(attr(ext, 'cx')), cy: Number(attr(ext, 'cy')), xfrmCx: Number(attr(first(xfrm, 'a:ext'), 'cx')), xfrmCy: Number(attr(first(xfrm, 'a:ext'), 'cy')), text: Array.from(anchor.getElementsByTagName('w:t')).map(n => n.textContent).join(''),
    };
  });
  return { shapes };
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Une page ouverte sur l'application : les outils, l'ouverture d'un modèle (à une taille d'écran donnée : 700x400 partout sauf pour les captures aux pixels).
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
  const pageSize = () => page.evaluate(() => PageLayout.getPageSizePt());
  const lineButton = id => objectRow(id);
  const undo = () => press('Control+z');
  const redo = () => press('Control+Shift+z');
  const html = () => page.evaluate(() => Editor.getHTML());
  return Object.assign({ page, press, save, unsaved, open, pageSize, lineButton, undo, redo, html }, tools);
}

async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  const S = await session({ lang, colorScheme });
  const { page, rectOf, onTop, hover, click, clickAt, drag, leave, press, save, open, pageSize, lineButton, undo, redo, html } = S;

  // --- 1. Le menu « Objets » : le titre « Lignes » et la rangée de trois boutons.
  console.log('\n' + tag + '1) Le menu « Objets » et ses lignes');
  if (!await open(7, 3)) check(tag + 'le modèle 7 s\'ouvre', false);
  await click('.pp-slide-item', 1);
  await hoverObject(page, 'line:plain');
  const menu = await page.evaluate(() => {
    const m = document.querySelector('#v2-objects-flyout');
    const r = m.getBoundingClientRect();
    const group = m.querySelector('.v2-objects-grid[aria-labelledby="v2-objects-lines"]');
    const lines = Array.from(m.querySelectorAll('[data-action^="line:"]')).map((b) => { const q = b.getBoundingClientRect(); return { id: b.dataset.action, label: b.getAttribute('aria-label'), tip: b.getAttribute('data-tip'), svg: !!b.querySelector('svg'), left: q.left, top: q.top, right: q.right, bottom: q.bottom, width: q.width, height: q.height }; });
    return {
      headings: Array.from(m.querySelectorAll('.v2-hover-flyout-label')).map(h => ({ id: h.id, text: h.textContent.trim() })), group: group && { role: group.getAttribute('role'), labelledBy: group.getAttribute('aria-labelledby') },
      tabs: (m.querySelector('.v2-objects-tabs') || { getAttribute: () => null }).getAttribute('aria-label'),
      lines, total: Array.from(m.querySelectorAll('[data-action]')).filter(b => !b.closest('[hidden]')).length, separators: m.querySelectorAll('.v2-hover-hsep').length, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  });
  check(tag + `le menu montre vingt lignes (« ${T.textFrame} », les seize formes de l'onglet ouvert, trois lignes), son titre (« ${T.menu} »), les onglets des formes (nommés « ${T.shapes} ») et le sous-titre « ${T.heading} », séparés par un trait, et le groupe des lignes est nommé par son sous-titre`,
    !!menu && menu.total === 20 && menu.separators === 2 && JSON.stringify(menu.headings.map(h => h.text)) === JSON.stringify([T.menu, T.heading]) && menu.tabs === T.shapes && !!menu.group && menu.group.role === 'group' && menu.group.labelledBy === menu.headings[1].id, menu);
  check(tag + `les trois lignes sont dans l'ordre : ${LINE_IDS.map(id => T.names[id]).join(', ')} (une icône chacune, son nom accessible)`, !!menu && JSON.stringify(menu.lines.map(l => l.id)) === JSON.stringify(LINE_IDS) && menu.lines.every((l, i) => l.label === T.names[LINE_IDS[i]] && l.svg), menu && menu.lines);
  check(tag + 'chaque ligne a une info-bulle qui dit où elle se posera (« ' + T.tip(T.names['line:arrow'], 2) + ' »)', !!menu && menu.lines.every((l, i) => l.tip === T.tip(T.names[LINE_IDS[i]], 2)), menu && menu.lines.map(l => l.tip));
  const row = menu ? menu.lines : [];
  check(tag + 'les trois boutons sont alignés sur une rangée, d\'au moins 28 pixels, sans se recouvrir, sous la grille des formes', row.length === 3 && row.every((b, i) => b.width >= 28 && b.height >= 28 && near(b.top, row[0].top, 0.5) && (i === 0 || b.left >= row[i - 1].right - 0.5)), row.map(b => [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]));
  check(tag + 'le menu est entier dans le panneau, au premier plan (chaque ligne et la dernière forme reçoivent le clic)', !!menu && inPanel(menu.rect) && await onTop(lineButton('line:plain')) && await onTop(lineButton('line:arrow')) && await onTop(lineButton('line:double')) && await onTop(objectRow('shape:wedgeRoundRectCallout')), menu && menu.rect);
  const contrasts = [await contrastOf(page, '#v2-objects-lines'), await contrastOf(page, lineButton('line:plain')), await contrastOf(page, lineButton('line:arrow')), await contrastOf(page, lineButton('line:double'))];
  check(tag + `le titre « ${T.heading} » et les icônes des lignes sont lisibles (>= 4,5:1)`, contrasts.every(c => c >= 4.5), contrasts);
  await snap(page, `${lang}-menu-lignes`);
  await leave();
  // Au clavier : ↓ des formes passe aux lignes (même colonne, au plus la troisième), ↑ en revient, ← → parcourent tout, Début et Fin, Entrée pose la ligne choisie.
  await page.focus(OBJECTS_BUTTON);
  const focusId = () => page.evaluate(() => document.activeElement && document.activeElement.dataset.action);
  const walk = [];
  const step = async (key) => { await press(key); walk.push(await focusId()); };
  await press('Enter'); walk.push(await focusId());
  await step('End');
  await step('ArrowLeft');
  await step('ArrowUp');
  await step('ArrowDown');
  await step('ArrowDown');
  await step('ArrowUp');
  await step('ArrowRight');
  await step('Home');
  await step('ArrowUp');
  await press('Escape');
  const afterEscape = await page.evaluate(() => ({ button: document.activeElement === document.querySelector('#v2-btn-objects'), open: document.querySelector('#v2-btn-objects').getAttribute('aria-expanded') }));
  check(tag + 'au clavier : Entrée → ligne, Fin « deux flèches », ← « avec flèche », ↑ flèche vers le bas (même colonne, seconde rangée des formes), ↓ « avec flèche », ↓ ligne (reboucle), ↑ « ligne » (début de la dernière rangée), → « avec flèche », Début ligne, ↑ « ligne » ; Échap rend le clavier au bouton',
    JSON.stringify(walk) === JSON.stringify(['textFrame', 'line:double', 'line:arrow', 'shape:downArrow', 'line:arrow', 'textFrame', 'line:plain', 'line:arrow', 'textFrame', 'line:plain']) && afterEscape.button && afterEscape.open === 'false', { walk, afterEscape });

  // --- 2. La pose : chacune des trois lignes, au vrai clic.
  console.log('\n' + tag + '2) Poser chacune des trois lignes');
  const size = await pageSize();
  const original = await html();
  const ENDS_OF = { 'line:plain': ['', ''], 'line:arrow': ['', 'triangle'], 'line:double': ['triangle', 'triangle'] };
  for (const id of LINE_IDS) {
    await chooseObject(page, id);
    const state = await docState(page);
    const l = state.lines[0];
    const [head, tail] = ENDS_OF[id];
    check(tag + `« ${T.names[id]} » est posée : une seule ligne, 192 x 0 points, centrée sur la page, bleue (#2f5597) de 3 points, pointes « ${head || 'aucune'} » au début et « ${tail || 'aucune'} » à la fin`,
      state.lines.length === 1 && state.frames.length === 0 && l.shape === 'line' && near(l.w, 192, 0.01) && l.h === 0 && near(l.x, (size.width - 192) / 2, 0.01) && near(l.y, size.height / 2, 0.01) && l.line === '#2f5597' && l.lw === 3 && l.fill === '' && l.flip === '' && l.head === head && l.tail === tail && state.shape === 'hp|Lhbu|p', state);
    const bar = await page.evaluate(() => {
      const shown = id => { const b = document.getElementById(id); return !!b && b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none'; };
      return { fill: shown('v2-frame-fill-open'), line: shown('v2-frame-line-open'), width: shown('v2-frame-width-open'), ends: shown('v2-frame-ends-open'), toolbar: !!document.querySelector('.v2-frame-toolbar') && document.querySelector('.v2-frame-toolbar').getBoundingClientRect().width > 0 };
    });
    check(tag + 'et elle est SÉLECTIONNÉE : sa barre est là avec la couleur du trait, l\'épaisseur et les extrémités, sans la couleur de fond', state.selection.selectedLine && !state.selection.text && bar.toolbar && !bar.fill && bar.line && bar.width && bar.ends, { selection: state.selection, bar });
    await undo();
    check(tag + `un seul Ctrl+Z défait « ${T.names[id]} », au caractère près`, (await html()) === original, (await docState(page)).lines.length);
  }
  await chooseObject(page, 'line:plain');
  await chooseObject(page, 'line:plain');
  const two = (await docState(page)).lines;
  check(tag + 'deux lignes de suite : la seconde est décalée de 12 points (jamais posée sur la première) et devant elle', two.length === 2 && near(two[1].x, two[0].x + 12, 0.02) && near(two[1].y, two[0].y + 12, 0.02), two);
  await undo();
  await undo();
  // Au clavier : Entrée sur la ligne choisie la pose (ici « Ligne avec deux flèches »).
  await page.focus(OBJECTS_BUTTON);
  await press('Enter');
  await press('End');
  await press('Enter');
  const byKeyboard = await docState(page);
  check(tag + 'au clavier, Entrée sur la ligne choisie la pose (ici « ' + T.names['line:double'] + ' »), sélectionnée', byKeyboard.lines.length === 1 && byKeyboard.lines[0].head === 'triangle' && byKeyboard.lines[0].tail === 'triangle' && byKeyboard.selection.selectedLine, byKeyboard);
  await undo();
  check(tag + 'et un Ctrl+Z la défait', (await html()) === original);

  if (!full) {
    // Anglais sombre : la barre d'une ligne et sa liste d'extrémités, dans la langue de la page.
    await chooseObject(page, 'line:arrow');
    await click('#v2-frame-ends-open');
    const ends = await page.evaluate(() => {
      const m = document.querySelector('.v2-frame-ends-menu.visible');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { rows: Array.from(m.querySelectorAll('[data-action^="ends:"]')).map(b => ({ text: b.getAttribute('aria-label'), title: b.title, bare: b.textContent.trim() === '', checked: b.getAttribute('aria-checked'), svg: !!b.querySelector('svg') })), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
    });
    check(tag + `la liste des extrémités dit « ${T.endsRows.join(' », « ')} », « ${T.endsRows[1]} » cochée (la ligne posée a sa pointe à la fin), entière dans le panneau`, !!ends && JSON.stringify(ends.rows.map(r => r.text)) === JSON.stringify(T.endsRows) && ends.rows.map(r => r.checked).join() === 'false,true,false,false' && ends.rows.every(r => r.svg && r.bare && r.title === r.text) && inPanel(ends.rect), ends);
    const endContrasts = [await contrastOf(page, '.v2-frame-ends-menu.visible [data-action="ends:none"]'), await contrastOf(page, '.v2-frame-ends-menu.visible [data-action="ends:both"]'), await contrastOf(page, '#v2-frame-ends-open')];
    check(tag + 'les lignes de la liste et la pastille « ' + T.ends + ' » sont lisibles (>= 4,5:1)', endContrasts.every(c => c >= 4.5), endContrasts);
    await snap(page, `${lang}-barre-ligne`);
    await click('.v2-frame-ends-menu.visible [data-action="ends:both"]');
    const both = (await docState(page)).lines[0];
    check(tag + `« ${T.endsRows[3]} » pose une pointe à chaque bout`, both.head === 'triangle' && both.tail === 'triangle', both);
    await undo();
    await undo();
    return;
  }

  // --- 3. Le dessin : le modèle de PowerPoint, sur une capture de l'éditeur, de la Lecture et du PDF.
  console.log('\n' + tag + '3) Le dessin des six lignes');
  // Les captures se font sur un écran plus grand (le zoom de la page y est plus proche de 1 : un trait de 2 à 8 points y fait 2 à 11 pixels).
  const big = await session({ lang, colorScheme, width: 1500, height: 1000 });
  await big.open(8, 3);
  await big.click('.pp-slide-item', 0);
  await big.page.mouse.move(1400, 900);
  await sleep(400);
  const screen = await screenState(big.page);
  const k = PT * screen.zoom;
  const editorShot = (await big.page.screenshot({ type: 'png' })).toString('base64');
  const editorResults = [];
  for (const s of SIX) {
    const probes = probesOf({ w: s.w, h: s.h, flip: s.flip, lw: s.lw, head: s.head, tail: s.tail }, (x, y) => onScreen(screen, 0, [s.x + x, s.y + y]), k);
    editorResults.push(Object.assign({ name: s.name, probes: probes.length }, await probeOf(big.page, { b64: editorShot, probes, ink: s.line, paperAt: [Math.round(screen.contentLeft + 30), Math.round(screen.pageTops[0] + 30 * k)] })));
  }
  check(tag + `l'éditeur dessine les six lignes comme le modèle de PowerPoint (zoom ${Math.round(screen.zoom * 100)} %) : ${editorResults.map(r => r.name + ' ' + r.checked).join(', ')} points, de l'encre dedans (${editorResults.reduce((n, r) => n + r.inked, 0)}), du papier dehors`,
    editorResults.every(r => r.mismatches.length === 0 && r.checked > 60 && r.inked > (r.name === 'F' ? 3 : 15) && r.outside === 0), editorResults.filter(r => r.mismatches.length || r.checked <= 60 || r.inked <= (r.name === 'F' ? 3 : 15)));
  await snap(big.page, `${lang}-lignes-editeur`);
  await big.page.screenshot({ path: SHOTS ? join(SHOTS, `${lang}-lignes-editeur-grand.png`) : undefined }).catch(() => {});
  // Les deux bouts de chaque ligne : pas de bords carrés ni de queue qui dépasse : la boîte DOM déborde de l'encre (`--ff-bleed`) mais l'encre ne sort pas du polygone.
  const bleeds = await big.page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame[data-ff-shape="line"]')).slice(0, 6).map((f) => {
    const box = f.querySelector('.pp-free-frame-box');
    const r = box.getBoundingClientRect();
    const own = getComputedStyle(f);
    return { bleed: own.getPropertyValue('--ff-bleed').trim(), w: parseFloat(f.getAttribute('data-ff-w')), h: parseFloat(f.getAttribute('data-ff-h')), width: r.width, height: r.height, pointer: getComputedStyle(box).pointerEvents };
  }));
  check(tag + 'la boîte DOM d\'une ligne est celle de ses deux bouts agrandie du tour que l\'encre prend (`--ff-bleed`), et ne prend aucun clic', bleeds.length === 6 && bleeds.every(b => parseFloat(b.bleed) >= 1 && near(b.width / k, b.w + 2 * parseFloat(b.bleed), 0.8) && b.pointer === 'none'), bleeds);

  // La Lecture, aux pixels : deux lignes (A, B).
  await big.page.mouse.move(1400, 900);
  await big.click('#btn-mode-read');
  await big.page.waitForFunction(() => !!document.querySelector('#reader-container .reader-content'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const readerScreen = await screenState(big.page, '#reader-container');
  const readerK = PT * readerScreen.zoom;
  const readerShot = (await big.page.screenshot({ type: 'png' })).toString('base64');
  const readerResults = [];
  for (const s of [SIX[0], SIX[1], SIX[3]]) {
    const probes = probesOf({ w: s.w, h: s.h, flip: s.flip, lw: s.lw, head: s.head, tail: s.tail }, (x, y) => onScreen(readerScreen, 0, [s.x + x, s.y + y]), readerK);
    readerResults.push(Object.assign({ name: s.name, probes: probes.length }, await probeOf(big.page, { b64: readerShot, probes, ink: s.line, paperAt: [Math.round(readerScreen.contentLeft + 30), Math.round(readerScreen.pageTops[0] + 30 * readerK)] })));
  }
  check(tag + 'la Lecture dessine les lignes A, B et D comme le modèle (aux pixels)', readerResults.every(r => r.mismatches.length === 0 && r.checked > 60 && r.inked > 15 && r.outside === 0), readerResults.filter(r => r.mismatches.length || r.checked <= 60));
  await snap(big.page, `${lang}-lignes-lecture`);
  await big.click('#btn-mode-edit');
  await sleep(900);
  // La miniature de la bande et le diaporama : mêmes variables, mêmes calques que l'éditeur.
  const looks = await big.page.evaluate(() => {
    const read = (f) => {
      const own = getComputedStyle(f);
      const before = getComputedStyle(f.querySelector('.pp-free-frame-box'), '::before');
      return { vars: ['--ff-fill', '--ff-bleed', '--ff-clip', '--ff-x', '--ff-y', '--ff-w', '--ff-h'].map(n => own.getPropertyValue(n).trim()).join('|'), clip: before.clipPath, fill: before.backgroundColor };
    };
    const editor = Array.from(document.querySelectorAll('#editor-container .pp-free-frame[data-ff-shape="line"]')).slice(0, 6).map(read);
    const thumb = Array.from(document.querySelectorAll('.pp-slide-thumb')[0].querySelectorAll('.pp-free-frame[data-ff-shape="line"]')).slice(0, 6).map(read);
    const handles = document.querySelectorAll('.pp-slide-thumb .pp-ff-line-handle');
    return { editor, thumb, thumbHandlesShown: Array.from(handles).some(h => getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 0) };
  });
  check(tag + 'la miniature de la bande a les six lignes avec les mêmes variables et les mêmes calques que l\'éditeur (couleur, polygone), sans leurs bouts', looks.thumb.length === 6 && looks.thumb.every((th, i) => th.vars === looks.editor[i].vars && th.clip === looks.editor[i].clip && th.fill === looks.editor[i].fill) && !looks.thumbHandlesShown, looks);
  await big.click('.pp-slide-item', 0);
  await big.page.mouse.move(1400, 900);
  await big.click('.pp-slide-show-open');
  await big.page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 30000 }).catch(() => {});
  await sleep(700);
  const showLooks = await big.page.evaluate(() => {
    const host = document.querySelector('.pp-slide-show .pp-slide-show-host');
    const shadow = host && host.shadowRoot;
    if (!shadow) return null;
    return Array.from(shadow.querySelectorAll('.pp-free-frame[data-ff-shape="line"] > .pp-free-frame-box')).slice(0, 6).map((box) => { const before = getComputedStyle(box, '::before'); return { fill: before.backgroundColor, clip: before.clipPath }; });
  });
  check(tag + 'le diaporama dessine les six lignes avec les mêmes calques (couleur et polygone)', !!showLooks && showLooks.length === 6 && showLooks.every((s, i) => s.fill === looks.editor[i].fill && s.clip === looks.editor[i].clip), showLooks);
  await big.press('Escape');
  await big.page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
  await sleep(300);

  // --- 4. La souris : saisir, déplacer, glisser les bouts, Maj, Échap.
  console.log('\n' + tag + '4) La souris et le clavier');
  await open(8, 3);
  await click('.pp-slide-item', 1);
  await leave();
  await sleep(300);
  // Le titre de la diapositive 2 est le deuxième « h1 » du texte ; la ligne qui le traverse est mise à sa hauteur (le milieu du titre) : c'est la mise en place, pas ce qu'on essaie.
  const lineSlide2 = (await docState(page)).lines.find(l => l.w === 400);
  const lineNow = () => docState(page).then(s => s.lines.find(l => l.pos === lineSlide2.pos));
  const placed = await page.evaluate(({ pos }) => {
    const content = document.querySelector('#editor-container .tiptap');
    const zoom = EditorCore.layoutZoom(content);
    const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
    const heading = content.querySelectorAll('h1')[1];
    const r = heading.getBoundingClientRect();
    const tops = [];
    let started = false;
    Array.from(content.children).forEach((child, i) => {
      const isBreak = child.classList.contains('page-break-marker');
      if (i === 0 || (tops.length && isBreak)) started = false;
      if (isBreak || child.classList.contains('pp-free-frame') || child.tagName === 'STYLE') return;
      if (!started) { tops.push(child.getBoundingClientRect().top - margin * zoom); started = true; }
    });
    const middle = ((r.top + r.bottom) / 2 - tops[1]) / zoom / (96 / 72);
    const ed = EditorCore.getEditor();
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, null, Object.assign({}, ed.state.doc.nodeAt(pos).attrs, { y: Math.round(middle * 100) / 100 })));
    return { middle, heading: heading.textContent, band: r.height / zoom / (96 / 72) };
  }, { pos: lineSlide2.pos });
  await sleep(400);
  let screen2 = await screenState(page);
  let l0 = await lineNow();
  const mid = onScreen(screen2, 1, [l0.x + 200, l0.y]);
  const hits = await page.evaluate(([x, y]) => {
    const describe = (el) => (el ? (el.closest('.pp-free-frame') ? 'ligne:' + el.className : el.tagName) : null);
    return { centre: describe(document.elementFromPoint(x, y)), dessous: describe(document.elementFromPoint(x, y + 5.5)), dessus: describe(document.elementFromPoint(x, y - 5.5)), loin: describe(document.elementFromPoint(x, y + 14)) };
  }, mid);
  check(tag + `la ligne traverse le titre (« ${placed.heading} » : ${Math.round(placed.band)} points de haut) : au milieu de la ligne, la bande qui la suit reçoit la souris ; à 5,5 pixels au-dessus ou au-dessous, c'est le titre qui la reçoit`,
    hits.centre === 'ligne:pp-ff-line-grab' && hits.dessous === 'H1' && hits.dessus === 'H1', hits);
  // Un vrai clic à côté de la ligne met le curseur dans le titre ; un vrai clic sur la ligne la sélectionne, sans mettre le curseur dans le texte.
  await clickAt(mid[0], mid[1] + 5.5);
  let state = await docState(page);
  check(tag + 'un vrai clic à 5,5 pixels sous la ligne met le curseur dans le titre : la ligne n\'est pas sélectionnée', state.selection.text && !state.selection.selectedLine && state.lines.length === 7, state.selection);
  await clickAt(mid[0], mid[1]);
  state = await docState(page);
  check(tag + 'un vrai clic sur la ligne la sélectionne (le texte dessous ne reçoit pas le clic) et la barre vient', state.selection.selectedLine && !state.selection.text && await page.evaluate(() => !!document.querySelector('.v2-frame-toolbar') && document.querySelector('.v2-frame-toolbar').getBoundingClientRect().width > 0), state.selection);
  const handlesOn = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-ff-selected .pp-ff-line-handle')).map((h) => { const r = h.getBoundingClientRect(); return { kind: h.dataset.ffKind, tip: h.title, shown: getComputedStyle(h).display !== 'none' && r.width > 0, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  const ends0 = endsOf(l0);
  const startPx = onScreen(screen2, 1, ends0.start);
  const endPx = onScreen(screen2, 1, ends0.end);
  check(tag + 'les deux bouts se voient sélectionnée (ronds, info-bulles « ' + T.start + ' » et « ' + T.end + ' »), exactement aux deux bouts de la ligne (à 1,5 pixel)',
    handlesOn.length === 2 && handlesOn.every(h => h.shown) && handlesOn.find(h => h.kind === 'start').tip === T.start && handlesOn.find(h => h.kind === 'end').tip === T.end
    && near(handlesOn.find(h => h.kind === 'start').x, startPx[0], 1.5) && near(handlesOn.find(h => h.kind === 'start').y, startPx[1], 1.5) && near(handlesOn.find(h => h.kind === 'end').x, endPx[0], 1.5) && near(handlesOn.find(h => h.kind === 'end').y, endPx[1], 1.5), { handlesOn, startPx, endPx });
  const grabTip = await page.evaluate(() => (document.querySelector('#editor-container .pp-ff-selected .pp-ff-line-grab') || {}).title);
  check(tag + `la bande qui suit le trait dit « ${T.move} »`, grabTip === T.move, grabTip);
  await clickAt(mid[0] + 150, mid[1] + 5.5);
  const unselected = await page.evaluate(() => Array.from(document.querySelectorAll('#editor-container .pp-free-frame[data-ff-shape="line"] .pp-ff-line-handle')).every(h => getComputedStyle(h).display === 'none'));
  check(tag + 'un clic dans le texte désélectionne la ligne : ses bouts disparaissent', unselected && (await docState(page)).selection.text, null);

  // Déplacer la ligne par sa bande : un pas d'historique, la taille et le sens ne changent pas.
  const before = await html();
  await drag(mid, [mid[0] + 60, mid[1] + 40]);
  let moved = await lineNow();
  const dxPt = 60 / k0(screen2);
  const dyPt = 40 / k0(screen2);
  check(tag + 'glisser la bande déplace la ligne de la distance de la souris (à 1 point), sans changer sa taille ni son sens, et la sélectionne', near(moved.x, l0.x + dxPt, 1.2) && near(moved.y, l0.y + dyPt, 1.2) && moved.w === l0.w && moved.h === l0.h && moved.flip === l0.flip && (await docState(page)).selection.selectedLine, { l0, moved, dxPt, dyPt });
  await undo();
  check(tag + 'un seul Ctrl+Z la remet où elle était, au caractère près', (await html()) === before, null);

  // Les bouts : celui qu'on tient suit la souris, l'autre ne bouge pas.
  await clickAt(mid[0], mid[1]);
  l0 = await lineNow();
  const e0 = endsOf(l0);
  const s0 = onScreen(screen2, 1, e0.start);
  const f0 = onScreen(screen2, 1, e0.end);
  await drag(f0, [f0[0], f0[1] + 50]);
  let l1 = await lineNow();
  const e1 = endsOf(l1);
  check(tag + 'glisser la fin vers le bas la descend de la distance de la souris (à 1 point) : le début ne bouge pas, la ligne est en pente, le sens est celui d\'origine',
    near(e1.start[0], e0.start[0], 0.3) && near(e1.start[1], e0.start[1], 0.3) && near(e1.end[0], e0.end[0], 1.2) && near(e1.end[1], e0.end[1] + 50 / k0(screen2), 1.2) && l1.flip === '' && l1.h > 20, { e0, e1, l1 });
  await undo();
  check(tag + 'un seul Ctrl+Z défait ce glissement', (await html()) === before, null);
  // Au-delà du début : la ligne se retourne toute seule, le début ne bouge toujours pas.
  await clickAt(mid[0], mid[1]);
  await drag(f0, [s0[0] - 90, s0[1] - 50]);
  l1 = await lineNow();
  const e2 = endsOf(l1);
  check(tag + 'glisser la fin au-delà du début, en haut à gauche, retourne la ligne (sens « hv ») : le début ne bouge pas, la fin est sous la souris (à 1 point)',
    l1.flip === 'hv' && near(e2.start[0], e0.start[0], 0.3) && near(e2.start[1], e0.start[1], 0.3) && near(e2.end[0], e0.start[0] - 90 / k0(screen2), 1.2) && near(e2.end[1], e0.start[1] - 50 / k0(screen2), 1.2) && l1.w > 100 && l1.h > 20, { e0, e2, l1 });
  await undo();
  // Le début : l'autre bout ne bouge pas.
  await clickAt(mid[0], mid[1]);
  await drag(s0, [s0[0] + 30, s0[1] + 40]);
  l1 = await lineNow();
  const e3 = endsOf(l1);
  check(tag + 'glisser le début le déplace sans bouger la fin (à 0,3 point), la ligne est retournée à la verticale (« v ») : le début est maintenant sous la fin',
    near(e3.end[0], e0.end[0], 0.3) && near(e3.end[1], e0.end[1], 0.3) && near(e3.start[0], e0.start[0] + 30 / k0(screen2), 1.2) && near(e3.start[1], e0.start[1] + 40 / k0(screen2), 1.2) && l1.flip === 'v', { e0, e3, l1 });
  await undo();
  // Maj tient les angles à 15° : la fin est tirée à 100 pixels à droite et 33 pixels plus bas (18,3°), la ligne finit à 15°.
  await clickAt(mid[0], mid[1]);
  await drag(f0, [s0[0] + 100, s0[1] + 33], { shift: true });
  l1 = await lineNow();
  const e4 = endsOf(l1);
  const angle = Math.atan2(e4.end[1] - e4.start[1], e4.end[0] - e4.start[0]) * 180 / Math.PI;
  const wanted = Math.hypot(100, 33) / k0(screen2);
  check(tag + 'avec Maj, la fin tirée à 18,3° est tenue à 15° (à 0,3°), à la distance de la souris (à 2 %)', Math.abs(angle - 15) < 0.3 && Math.abs(Math.hypot(e4.end[0] - e4.start[0], e4.end[1] - e4.start[1]) / wanted - 1) < 0.02, { angle, length: Math.hypot(e4.end[0] - e4.start[0], e4.end[1] - e4.start[1]), wanted });
  await undo();
  await clickAt(mid[0], mid[1]);
  await drag(f0, [s0[0] + 100, s0[1] + 33]);
  l1 = await lineNow();
  const e5 = endsOf(l1);
  const free = Math.atan2(e5.end[1] - e5.start[1], e5.end[0] - e5.start[0]) * 180 / Math.PI;
  check(tag + 'sans Maj, la même fin garde son angle (18,3°, à 0,5°)', Math.abs(free - 18.26) < 0.5, free);
  await undo();
  // Échap pendant le glissement l'abandonne : rien n'a changé, aucun pas d'historique.
  await clickAt(mid[0], mid[1]);
  const kept = await html();
  await drag(f0, [f0[0] + 70, f0[1] + 50], { abort: true });
  check(tag + 'Échap pendant le glissement d\'un bout l\'abandonne : la ligne est inchangée, au caractère près', (await html()) === kept, await lineNow());
  await drag(mid, [mid[0] + 50, mid[1] + 50], { abort: true });
  check(tag + 'Échap pendant le glissement de la bande aussi', (await html()) === kept, await lineNow());
  // Au clavier : flèches (1 point, Maj : 10), Entrée ne fait rien, Suppr l'enlève, Ctrl+Z la rend.
  await clickAt(mid[0], mid[1]);
  l0 = await lineNow();
  await press('ArrowRight');
  await press('ArrowDown');
  await page.keyboard.down('Shift');
  await press('ArrowLeft');
  await page.keyboard.up('Shift');
  const nudged = await lineNow();
  check(tag + 'les flèches du clavier déplacent la ligne sélectionnée d\'un point (Maj : dix), sans changer sa taille', near(nudged.x, l0.x + 1 - 10, 0.02) && near(nudged.y, l0.y + 1, 0.02) && nudged.w === l0.w && nudged.h === l0.h, { l0, nudged });
  const beforeEnter = await html();
  await press('Enter');
  check(tag + 'Entrée sur une ligne sélectionnée ne fait rien (pas de texte où mettre le curseur) : elle reste sélectionnée, le document n\'a pas changé', (await html()) === beforeEnter && (await docState(page)).selection.selectedLine, null);
  const countBefore = (await docState(page)).lines.length;
  await press('Delete');
  const afterDelete = await docState(page);
  check(tag + 'Suppr enlève la ligne sélectionnée', afterDelete.lines.length === countBefore - 1 && afterDelete.lines.every(l => l.w !== 400), afterDelete.lines.length);
  await undo();
  check(tag + 'et un Ctrl+Z la rend', (await docState(page)).lines.length === countBefore, null);
  await undo();
  await undo();
  await undo();
  await undo();
  await snap(page, `${lang}-lignes-souris`);

  // --- 5. La barre : extrémités, couleur, épaisseur, dupliquer, devant, derrière.
  console.log('\n' + tag + '5) La barre');
  await open(7, 3);
  await click('.pp-slide-item', 1);
  await chooseObject(page, 'line:arrow');
  const base = await html();
  await click('#v2-frame-ends-open');
  const endsMenu = await page.evaluate(() => {
    const m = document.querySelector('.v2-frame-ends-menu.visible');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { role: m.getAttribute('role'), label: m.getAttribute('aria-label'), expanded: document.getElementById('v2-frame-ends-open').getAttribute('aria-expanded'), rows: Array.from(m.querySelectorAll('[data-action^="ends:"]')).map(b => ({ action: b.dataset.action, text: b.getAttribute('aria-label'), title: b.title, bare: b.textContent.trim() === '', checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), svg: !!b.querySelector('svg') })), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
  });
  check(tag + `la liste des extrémités : « ${T.endsRows.join(' », « ')} », une icône chacune (le nom est l'info-bulle et le nom accessible), « ${T.endsRows[1]} » cochée, entière dans le panneau, la pastille annonce son menu ouvert`,
    !!endsMenu && endsMenu.role === 'menu' && endsMenu.label === T.ends && endsMenu.expanded === 'true' && JSON.stringify(endsMenu.rows.map(r => r.text)) === JSON.stringify(T.endsRows) && endsMenu.rows.map(r => r.checked).join() === 'false,true,false,false' && endsMenu.rows.every(r => r.role === 'menuitemradio' && r.svg && r.bare && r.title === r.text) && inPanel(endsMenu.rect), endsMenu);
  await click('.v2-frame-ends-menu.visible [data-action="ends:both"]');
  let one = (await docState(page)).lines[0];
  check(tag + `« ${T.endsRows[3]} » pose une pointe à chaque bout sans toucher au reste (couleur, épaisseur, place), et la ligne reste sélectionnée`, one.head === 'triangle' && one.tail === 'triangle' && one.line === '#2f5597' && one.lw === 3 && one.w === 192 && (await docState(page)).selection.selectedLine, one);
  await undo();
  check(tag + 'un seul Ctrl+Z défait ce choix', (await html()) === base, (await docState(page)).lines[0]);
  await click('#v2-frame-ends-open');
  await click('.v2-frame-ends-menu.visible [data-action="ends:start"]');
  one = (await docState(page)).lines[0];
  check(tag + `« ${T.endsRows[2]} » : la pointe passe du bout à la tête`, one.head === 'triangle' && one.tail === '', one);
  await click('#v2-frame-ends-open');
  await click('.v2-frame-ends-menu.visible [data-action="ends:none"]');
  one = (await docState(page)).lines[0];
  check(tag + `« ${T.endsRows[0]} » retire les deux pointes`, one.head === '' && one.tail === '', one);
  await undo();
  await undo();
  // La couleur : la palette n'offre pas « Sans trait » ; une pastille pose la couleur, l'épaisseur reste.
  await click('#v2-frame-line-open');
  const palette = await page.evaluate(() => { const p = document.querySelector('.v2-color-dropdown.visible'); if (!p) return null; const r = p.getBoundingClientRect(); const none = p.querySelector('[data-action="none"]'); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, noneShown: !!none && getComputedStyle(none).display !== 'none' && none.getBoundingClientRect().height > 0 }; });
  check(tag + `la palette de la couleur du trait s'ouvre, entière dans le panneau, SANS « ${T.noLine} » (une ligne a toujours son trait)`, !!palette && inPanel(palette) && !palette.noneShown, palette);
  await click('.v2-color-dropdown.visible [data-color="#be185d"]');
  one = (await docState(page)).lines[0];
  check(tag + 'une pastille (#be185d) pose la couleur de la ligne, sans toucher à l\'épaisseur ni aux pointes, et la barre dit la couleur', one.line === '#be185d' && one.lw === 3 && one.tail === 'triangle' && (await page.evaluate(() => getComputedStyle(document.getElementById('v2-frame-line-bar')).backgroundColor)) === 'rgb(190, 24, 93)', one);
  await undo();
  // L'épaisseur : sept épaisseurs, pas de « Aucun trait ».
  await click('#v2-frame-width-open');
  const widths = await page.evaluate(() => {
    const m = document.querySelector('.v2-frame-width-menu.visible');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const rows = Array.from(m.querySelectorAll('[data-action]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0).map(b => ({ action: b.dataset.action, text: b.textContent.trim(), checked: b.getAttribute('aria-checked') }));
    return { rows, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
  });
  check(tag + `la liste des épaisseurs d'une ligne : ${WIDTHS.length} épaisseurs (${WIDTHS.map(T.width).join(', ')}), SANS « ${T.widthNone} », 3 pt cochée, entière dans le panneau`,
    !!widths && JSON.stringify(widths.rows.map(r => r.text)) === JSON.stringify(WIDTHS.map(T.width)) && widths.rows.filter(r => r.checked === 'true').map(r => r.action).join() === 'width:3' && inPanel(widths.rect), widths);
  await click('.v2-frame-width-menu.visible [data-action="width:6"]');
  one = (await docState(page)).lines[0];
  check(tag + 'un vrai clic sur « ' + T.width(6) + ' » règle l\'épaisseur à 6 points, la couleur et les pointes restent', one.lw === 6 && one.line === '#2f5597' && one.tail === 'triangle', one);
  await undo();
  check(tag + 'un seul Ctrl+Z revient à 3 points', (await docState(page)).lines[0].lw === 3, null);
  // Dupliquer : la copie garde le sens, les pointes et le trait ; devant et derrière.
  await click('.v2-frame-toolbar [data-action="duplicate"]');
  let copies = (await docState(page)).lines;
  check(tag + `« ${T.duplicate} » : deux lignes identiques (pointe, couleur, épaisseur), la copie décalée de 12 points et sélectionnée`, copies.length === 2 && copies[0].tail === copies[1].tail && copies[0].line === copies[1].line && copies[0].lw === copies[1].lw && copies[0].w === copies[1].w && near(copies[1].x, copies[0].x + 12, 0.02) && (await docState(page)).selection.selectedLine, copies);
  await click('.v2-frame-toolbar [data-action="back"]');
  const order = await page.evaluate(() => { const ed = EditorCore.getEditor(); const found = []; ed.state.doc.forEach((node, offset) => { if (node.type.name === 'freeLine') found.push({ offset, x: node.attrs.x }); }); const sel = ed.state.selection; return { found, selected: sel.from }; });
  check(tag + '« Arrière-plan » range la ligne sélectionnée avant l\'autre dans le texte', order.found.length === 2 && order.found[0].offset === order.selected && order.found[0].x > order.found[1].x, order);
  await click('.v2-frame-toolbar [data-action="front"]');
  const order2 = await page.evaluate(() => { const ed = EditorCore.getEditor(); const found = []; ed.state.doc.forEach((node, offset) => { if (node.type.name === 'freeLine') found.push({ offset, x: node.attrs.x }); }); return { found, selected: ed.state.selection.from }; });
  check(tag + '« Premier plan » la remet après l\'autre', order2.found.length === 2 && order2.found[1].offset === order2.selected && order2.found[0].x < order2.found[1].x, order2);
  await click('.v2-frame-toolbar [data-action="delete"]');
  check(tag + '« Supprimer l\'objet » enlève la ligne sélectionnée (la copie reste)', (await docState(page)).lines.length === 1, null);
  await undo();
  await undo();
  await undo();
  await undo();
  await undo();
  // Un cadre ou une forme garde sa barre : le fond, pas les extrémités ; la ligne la change à la sélection.
  await open(10, 1);
  await leave();
  const shapeRect = await rectOf('#editor-container .pp-free-frame:not([data-ff-shape="line"]) .pp-free-frame-box');
  await clickAt(shapeRect.x, shapeRect.y);
  await press('Escape');
  const frameBar = await page.evaluate(() => {
    const shown = id => { const b = document.getElementById(id); return !!b && b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none'; };
    return { fill: shown('v2-frame-fill-open'), line: shown('v2-frame-line-open'), width: shown('v2-frame-width-open'), ends: shown('v2-frame-ends-open') };
  });
  const sel1 = await docState(page);
  check(tag + 'la forme sélectionnée a sa barre d\'avant (le fond, le trait, l\'épaisseur ; pas les extrémités), « ' + T.noLine + ' » et « ' + T.widthNone + ' » compris', sel1.selection.selectedFrame && frameBar.fill && frameBar.line && frameBar.width && !frameBar.ends, { sel1: sel1.selection, frameBar });
  await click('#v2-frame-width-open');
  const rowsFrame = await page.evaluate(() => Array.from(document.querySelectorAll('.v2-frame-width-menu.visible [data-action]')).filter(b => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0).length);
  await click('#v2-frame-line-open');
  const noneFrame = await page.evaluate(() => { const none = document.querySelector('.v2-color-dropdown.visible [data-action="none"]'); return !!none && getComputedStyle(none).display !== 'none' && none.getBoundingClientRect().height > 0; });
  check(tag + 'la liste des épaisseurs de la forme a huit lignes (« ' + T.widthNone + ' » comprise) et la palette de son trait « ' + T.noLine + ' »', rowsFrame === 8 && noneFrame, { rowsFrame, noneFrame });
  await page.evaluate(() => EditorCore.closeDropdownPanel());
  // La page garde le défilement du modèle d'avant : la ligne peut se trouver sous la barre d'outils de l'éditeur, qui prendrait le clic ; on la ramène au milieu de l'écran.
  await page.evaluate(() => document.querySelector('#editor-container .pp-free-frame[data-ff-shape="line"] .pp-ff-line-grab').scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(250);
  const lineRect = await page.evaluate(() => { const g = document.querySelector('#editor-container .pp-free-frame[data-ff-shape="line"] .pp-ff-line-grab'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await clickAt(lineRect.x, lineRect.y);
  const lineBar = await page.evaluate(() => {
    const shown = id => { const b = document.getElementById(id); return !!b && b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none'; };
    return { fill: shown('v2-frame-fill-open'), line: shown('v2-frame-line-open'), width: shown('v2-frame-width-open'), ends: shown('v2-frame-ends-open') };
  });
  check(tag + 'puis la ligne sélectionnée a la sienne (les extrémités, pas le fond)', (await docState(page)).selection.selectedLine && !lineBar.fill && lineBar.line && lineBar.width && lineBar.ends, lineBar);
  await snap(page, `${lang}-barre-ligne`);

  // --- 6. Les sorties : le PDF, le Word, le HTML et le Markdown.
  console.log('\n' + tag + '6) Les sorties : PDF, Word, HTML, Markdown');
  await open(8, 3);
  await leave();
  const [pdfDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const pdfBytes = readFileSync(await pdfDownload.path()).toString('base64');
  const SCALE = 3;
  const pdf1 = await renderPdfPage(page, pdfBytes, 1, SCALE);
  check(tag + 'le PDF a trois pages, une par diapositive (aucune de plus pour les lignes)', pdf1.numPages === 3, pdf1.numPages);
  const pdfResults = [];
  for (const s of SIX) {
    const probes = probesOf({ w: s.w, h: s.h, flip: s.flip, lw: s.lw, head: s.head, tail: s.tail }, (x, y) => [(s.x + x) * SCALE, (s.y + y) * SCALE], SCALE);
    pdfResults.push(Object.assign({ name: s.name }, await probeOf(page, { b64: pdf1.png, probes, ink: s.line, paperAt: [10, 10] })));
  }
  check(tag + `le PDF dessine les six lignes comme le modèle de PowerPoint, aux mêmes mesures de la page que l'éditeur : ${pdfResults.map(r => r.name + ' ' + r.checked).join(', ')} points (de l'encre dedans, du papier dehors)`,
    pdfResults.every(r => r.mismatches.length === 0 && r.checked > 200 && r.inked > (r.name === 'F' ? 10 : 40) && r.outside === 0), pdfResults.filter(r => r.mismatches.length || r.checked <= 200 || r.inked <= (r.name === 'F' ? 10 : 40)));
  if (SHOTS) {
    await page.evaluate((b64) => { const img = document.createElement('img'); img.src = 'data:image/png;base64,' + b64; img.id = '__pdfshot'; img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:700px'; document.body.appendChild(img); }, pdf1.png);
    await sleep(300);
    await snap(page, `${lang}-pdf-lignes`);
    await page.evaluate(() => document.getElementById('__pdfshot').remove());
  }
  // Word : des lignes prédéfinies.
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300);
  const [docxDownload] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), click('#btn-export-pdf')]);
  const word = await page.evaluate(wordShapesOf, readFileSync(await docxDownload.path()).toString('base64'));
  const wl = word.shapes.slice(0, 6);
  check(tag + 'le Word fait des six lignes des lignes prédéfinies (prst="line"), dans l\'ordre, qui ne sont pas des zones de texte, et ses enfants sont dans l\'ordre du schéma (position, géométrie, pas de fond, trait ; dans le trait : couleur puis pointes)',
    wl.length >= 6 && wl.every(s => s.prst === 'line' && s.txBox === null && s.order === 'a:xfrm,a:prstGeom,a:noFill,a:ln' && /^a:solidFill(,a:headEnd)?(,a:tailEnd)?$/.test(s.lnOrder)), word.shapes.map(s => [s.prst, s.order, s.lnOrder]));
  const flipOn = v => v === '1' || v === 'true';
  const flipOff = v => v === null || v === '0' || v === 'false';
  check(tag + 'leur sens : A, B, E, F sans retournement, C retournée à l\'horizontale (flipH), D retournée à la verticale (flipV)',
    [0, 1, 4, 5].every(i => flipOff(wl[i].flipH) && flipOff(wl[i].flipV)) && flipOn(wl[2].flipH) && flipOff(wl[2].flipV) && flipOff(wl[3].flipH) && flipOn(wl[3].flipV), wl.map(s => [s.flipH, s.flipV]));
  check(tag + 'leurs pointes : A à la fin, B aux deux bouts, C au début, D à la fin, E aucune, F aux deux bouts (triangle, taille moyenne)',
    [['A', false, true], ['B', true, true], ['C', true, false], ['D', false, true], ['E', false, false], ['F', true, true]].every(([, head, tail], i) => (!!wl[i].head === head) && (!!wl[i].tail === tail)
      && (!head || (wl[i].head.type === 'triangle' && wl[i].head.w === 'med' && wl[i].head.len === 'med')) && (!tail || (wl[i].tail.type === 'triangle' && wl[i].tail.w === 'med' && wl[i].tail.len === 'med'))), wl.map(s => [s.head, s.tail]));
  check(tag + 'leur trait : la couleur et l\'épaisseur de chacune (en EMU)', SIX.every((s, i) => wl[i].lineColor === s.line.slice(1).toUpperCase() && wl[i].lineWidth === s.lw * EMU), wl.map(s => [s.lineColor, s.lineWidth]));
  check(tag + 'leur boîte est celle de leurs deux bouts, exacte (position et taille en EMU, hauteur ou largeur nulle pour A et D), sans rentrer de la moitié du trait',
    SIX.every((s, i) => wl[i].x === s.x * EMU && wl[i].y === s.y * EMU && wl[i].cx === s.w * EMU && wl[i].cy === s.h * EMU && wl[i].xfrmCx === s.w * EMU && wl[i].xfrmCy === s.h * EMU), wl.map(s => [s.x, s.y, s.cx, s.cy]));
  // Le HTML et le Markdown : rien d'une ligne.
  const text = await page.evaluate(async (htmlIn) => {
    await ExportEngines.loadAll();
    const doc = await HtmlExport.htmlToDocument(htmlIn, {});
    const md = await MarkdownExport.htmlToMarkdown(htmlIn);
    return { html: typeof doc === 'string' ? doc : JSON.stringify(doc), md };
  }, '<h1>Titre</h1>' + LINE(100, 100, 200, 0, { tail: 'triangle' }) + '<p>Texte entre deux</p>' + LINE(100, 200, 100, 100, { flip: 'h', head: 'triangle' }) + '<p>Suite</p>');
  check(tag + 'le HTML et le Markdown gardent le texte (titre, paragraphes) et rien d\'une ligne : ni sa position, ni son dessin, ni sa sorte, aucun texte de plus', /Texte entre deux/.test(text.html) && !/ff-x|data-ff|--ff-|pp-free-frame|line/.test(text.html.replace(/<style[\s\S]*?<\/style>/g, '')) && /Texte entre deux/.test(text.md) && !/ff-|\bline\b/.test(text.md) && text.md.trim().split('\n').filter(l => l.trim()).length === 3 && !/<div><div><div><\/div><\/div><\/div>/.test(text.html), { html: text.html.slice(-400), md: text.md });

  // --- 7. Les valeurs, le collage, l'enregistrement.
  console.log('\n' + tag + '7) Les valeurs, le collage, l\'enregistrement');
  await page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await open(9, 1);
  const odd = (await docState(page)).lines;
  check(tag + 'un sens « vh » est lu « hv », une pointe inconnue (« chevron », « flèche ») devient la pointe pleine, une épaisseur énorme est bornée à 36 points, un fond sur une ligne est ignoré',
    odd.length === 4 && odd[0].flip === 'hv' && odd[0].head === 'triangle' && odd[0].tail === 'triangle' && odd[0].lw === 36 && odd[0].fill === '' && odd[0].line === '#0369a1', odd[0]);
  check(tag + 'une pointe « none » est aucune, une couleur illisible (« rouge ») ou absente devient la couleur d\'origine (#2f5597), une épaisseur absente 3 points', odd[1].head === '' && odd[1].line === '#2f5597' && odd[1].lw === 3 && odd[2].line === '#2f5597' && odd[2].lw === 0.25, odd.slice(1, 3));
  check(tag + 'une épaisseur de 0,1 est relevée à 0,25 point, une longueur nulle (0 x 0) est allongée d\'un point, une taille négative aussi, « RGB(255, 0, 0) » est lue (#ff0000), « V » vaut « v », une épaisseur négative est relevée à 0,25',
    odd[2].w === 1 && odd[2].h === 0 && odd[3].w === 1 && odd[3].h === 0 && odd[3].line === '#ff0000' && odd[3].flip === 'v' && odd[3].lw === 0.25, odd.slice(2));
  // Un collage qui porte une ligne : elle garde son sens et ses pointes, et remonte au début de sa diapositive.
  await open(7, 3);
  await click('.pp-slide-item', 1);
  const pasteBefore = await docState(page);
  await page.evaluate((h) => { const ed = EditorCore.getEditor(); ed.commands.focus('end'); ed.view.pasteHTML(h); }, '<p>Texte collé</p>' + LINE(120, 90, 160, 70, { flip: 'h', head: 'triangle', line: '#15803d', lw: 4 }) + '<p>Suite collée</p>');
  await sleep(400);
  const pasted = await docState(page);
  const p0 = pasted.lines[0];
  check(tag + 'collée au milieu d\'un texte de la dernière diapositive, une ligne garde son sens (« h »), sa pointe au début, son trait (#15803d, 4 points) et ses mesures, et remonte au début de sa diapositive (juste après le saut de page)',
    pasted.lines.length === pasteBefore.lines.length + 1 && !!p0 && p0.flip === 'h' && p0.head === 'triangle' && p0.tail === '' && p0.line === '#15803d' && p0.lw === 4 && p0.x === 120 && p0.y === 90 && p0.w === 160 && p0.h === 70 && pasted.shape === 'hp|hbu|Lpp' && pasted.frames.length === 0, { shape: pasted.shape, p0 });
  await undo();
  // Enregistrer et rouvrir : une ligne revient à l'identique, et le texte enregistré porte sa sorte, son sens et ses pointes.
  await click('.pp-slide-item', 2);
  await chooseObject(page, 'line:double');
  await click('#v2-frame-width-open');
  await click('.v2-frame-width-menu.visible [data-action="width:4.5"]');
  await click('#v2-frame-line-open');
  await click('.v2-color-dropdown.visible [data-color="#0369a1"]');
  const l2 = (await docState(page)).lines[0];
  const dragged = onScreen(await screenState(page), 2, endsOf(l2).end);
  await drag(dragged, [dragged[0] - 40, dragged[1] - 30]);
  const beforeSave = (await docState(page)).lines[0];
  await save();
  await open(8, 3);
  await open(7, 3);
  const afterSave = (await docState(page)).lines[0];
  const stored = await page.evaluate(() => { const m = Editor.getHTML().match(/<div class="pp-free-frame"[^>]*data-ff-shape="line"[^>]*>/); return m ? m[0] : null; });
  check(tag + 'une ligne (deux flèches, bleue, 4,5 points, tirée vers le haut) enregistrée puis rouverte revient à l\'identique, et le texte enregistré porte sa sorte, son sens, ses pointes et son trait',
    !!afterSave && JSON.stringify({ ...afterSave, pos: 0 }) === JSON.stringify({ ...beforeSave, pos: 0 }) && afterSave.lw === 4.5 && afterSave.line === '#0369a1' && afterSave.head === 'triangle' && afterSave.tail === 'triangle' && afterSave.flip === beforeSave.flip
    && !!stored && /data-ff-shape="line"/.test(stored) && /data-ff-head="triangle"/.test(stored) && /data-ff-tail="triangle"/.test(stored) && /data-ff-lw="4.5"/.test(stored) && /data-ff-line="#0369a1"/.test(stored) && !/data-ff-fill/.test(stored), { beforeSave, afterSave, stored });
  // Une ligne horizontale posée sans pointe s'écrit sans sens ni pointe.
  await open(11, 3);
  await click('.pp-slide-item', 0);
  await chooseObject(page, 'line:plain');
  const plainStored = await page.evaluate(() => { const m = Editor.getHTML().match(/<div class="pp-free-frame"[^>]*data-ff-shape="line"[^>]*>/); return m ? m[0] : null; });
  check(tag + 'une ligne posée sans pointe s\'écrit sans sens ni pointe (mesures, sorte, trait seulement)', !!plainStored && !/data-ff-(flip|head|tail|fill)/.test(plainStored) && /data-ff-w="192" data-ff-h="0" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"/.test(plainStored), plainStored);
  await undo();
  // Sans ligne : une présentation inchangée (le PDF a le même nombre de pages, rien d'écrit de plus).
  const noLines = await page.evaluate(() => /pp-free-frame|data-ff/.test(Editor.getHTML()));
  check(tag + 'une présentation sans ligne ni cadre s\'écrit comme avant (aucun repère de cadre)', !noLines, null);
  // Dupliquer une diapositive qui porte des lignes : la copie a les mêmes lignes (sens, pointes, trait, mesures).
  await open(8, 3);
  await click('.pp-slide-item', 0);
  await click('.pp-slide-more', 0);
  await click('.pp-slide-menu.visible [data-action="duplicate"]');
  await sleep(700);
  const dup = (await docState(page)).lines;
  const bare = list => list.map(l => JSON.stringify({ ...l, pos: 0 }));
  check(tag + 'dupliquer une diapositive qui porte six lignes en fait une copie qui a les six mêmes (sens, pointes, trait, mesures)', dup.length === 13 && JSON.stringify(bare(dup.slice(0, 6))) === JSON.stringify(bare(dup.slice(6, 12))) && dup[0].tail === 'triangle' && dup[2].flip === 'h' && dup[3].flip === 'v', dup.length);
}

// Le zoom de l'éditeur en pixels par point (les captures et les clics des gestes).
function k0(screen) { return PT * screen.zoom; }

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
