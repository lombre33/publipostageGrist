#!/usr/bin/env node
// La couche d'un cadre libre, d'une forme ou d'une ligne d'une présentation : DEVANT le texte de la diapositive (le réglage d'origine) ou « Derrière le texte » (js/free-frame.js : `layer`, le bouton de la barre,
// `reachBehind` ; css/free-frame.css ; js/pdf-export.js, js/docx-export.js, js/pptx-export.js ; demande du 22/10, carte « Au choix de chaque cadre »), à la vraie souris et au vrai clavier, 700x400 (la souris) et
// 1500x1000 (les captures aux pixels et les fichiers), français clair puis anglais sombre, hébergé par GFS (simulé par dev-tests/gfs-stub.js), l'extension « diapositives » active.
//  LES VALEURS : `layer` ne vaut que `behind` (toute autre valeur, absente, illisible ou « front » : devant) pour un cadre, une forme et une ligne ; un cadre devant s'écrit comme avant (aucun `data-ff-layer`), un
//   cadre derrière avec `data-ff-layer="behind"` ; le modèle enregistré le garde.
//  LA BARRE : le bouton « Derrière le texte » est dans la barre du cadre sélectionné (entier dans le panneau, nommé, enfoncé quand le cadre l'est) ; un vrai clic le règle, UN pas d'historique, un Ctrl+Z le défait, un
//   second clic le rend ; une ligne et une forme l'ont aussi ; « Premier plan » et « Arrière-plan » (l'ordre entre les objets) ne le touchent pas.
//  LE DESSIN : un cadre derrière est peint SOUS le texte (le texte se lit sur lui, aux pixels), un cadre devant le recouvre ; l'éditeur, la Lecture, le diaporama et la miniature le montrent, jamais sous le papier.
//  LA SOURIS : le texte de la diapositive couvre toute la largeur de sa colonne ; là où le pointeur n'est sur aucune lettre, un vrai clic va au cadre derrière (son texte, sa ligne), sur une lettre il va au texte ;
//   les bords et les poignées du cadre choisi se saisissent même sous une lettre (un vrai glisser le redimensionne), ceux d'un cadre non choisi non ; rien ne change sans cadre derrière.
//  LES SORTIES : le PDF peint un cadre devant au pied de sa page, APRÈS le texte (il le recouvre, comme l'écran et le Word : défaut trouvé par ce test, il était derrière) sur SA page même quand le texte de la diapositive
//   passe sur une page de plus, et un cadre derrière AVANT lui ; un cadre devant posé tout en bas de la diapositive, dont les lignes passent la marge du bas puis le bord de la page, reste sur sa page (une seule page ;
//   dans le flux, ses lignes repartaient sur la page suivante) ; une image « devant le texte » posée sur un cadre devant reste au-dessus de lui, comme à l'écran ; le Word écrit `behindDoc` et un `relativeHeight` sous
//   celui des cadres devant ; le PowerPoint met le cadre derrière avant le texte de la diapositive, le cadre devant après.
// Lancé par run-headless.mjs (groupe Node « frameLayer », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-frame-layer.mjs
// FRAME_LAYER_SHOTS=<dossier> : enregistre aussi des captures (à relire à l'œil) ; FRAME_LAYER_ONLY=1,3 : ne joue que ces parties (essai, « en » : la passe anglaise) ; sans eux, rien n'est écrit.
import { mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { start, seedModels, WIDTH, HEIGHT } from './gfs-page.mjs';

const SHOTS = process.env.FRAME_LAYER_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const ONLY = (process.env.FRAME_LAYER_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const wanted = part => !ONLY.length || ONLY.includes(String(part));
const t = await start({ name: 'verify-frame-layer', port: Number(process.env.FRAME_LAYER_PORT || 8977) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const RECORD = { id: 1, Nom: 'Alice', Statut: 'Urgent' };
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PT = 96 / 72;
const inPanel = r => !!r && r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= WIDTH + 0.5 && r.bottom <= HEIGHT + 0.5;
async function snap(page, name) { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); }
// Une page du PDF (le PNG en base64 de renderPdfPage), enregistrée à relire à l'œil.
const snapPdf = (rendered, name) => { if (SHOTS) writeFileSync(join(SHOTS, name + '.png'), Buffer.from(rendered.png, 'base64')); };

// Un cadre écrit comme l'enregistrement le fait : les mesures (points depuis le coin de la page), l'aspect et la couche (`look`), le texte.
const FRAME = (x, y, w, h, look, body) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"${look || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body || '<p></p>'}</div></div></div>`;
const LINE = (x, y, w, h, extra) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}" data-ff-shape="line" data-ff-line="#2f5597" data-ff-lw="3"${extra || ''}><div class="pp-free-frame-box"><div class="pp-free-frame-content"></div></div></div>`;
const BEHIND = ' data-ff-layer="behind"';
// Des formes pleines de couleurs franches, ni noires ni blanches (le texte noir se compte, le papier blanc non) : le magenta (luminance 82), le jaune clair (de quoi lire le texte dessus), l'ambre, le bleu, le vert.
const MAGENTA = ' data-ff-shape="rect" data-ff-fill="#be185d"';
const AMBER = ' data-ff-shape="ellipse" data-ff-fill="#b45309"';
const BLUE = ' data-ff-shape="rect" data-ff-fill="#1d4ed8"';
const TEAL = ' data-ff-shape="rect" data-ff-fill="#0f766e"';
const SAND = ' data-ff-shape="rect" data-ff-fill="#fde68a" data-ff-line="#b45309" data-ff-lw="1.5"';
// Une image PNG pleine d'une seule couleur (huit points de côté), en data URI : de quoi compter ses pixels dans le PDF.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
function solidPng([r, g, b], size = 8) {
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))), pngChunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}
// Quarante-cinq lignes : le texte d'une diapositive qui passe sa page (la pagination du PDF en fait une page de plus).
const MANY = Array.from({ length: 45 }, (_, i) => `<p>Ligne ${i + 1} du texte long</p>`).join('');
// 7 « Couches » : quatre diapositives, chacune un titre sous un grand rectangle plein (10, 10, 640 x 110 points) : 1 derrière (magenta), 2 devant (magenta), 3 une ellipse ambre derrière et un rectangle bleu devant,
// 4 un rectangle vert devant et un texte qui passe la page (le cadre reste sur SA page).
// 8 « Souris » : une diapositive dont un rectangle jaune clair derrière le texte (avec son texte) et une ligne derrière couvrent ce qui suit, puis une diapositive sans rien.
// 9 « Barre » : un rectangle, une ligne et un cadre de texte devant, sur une diapositive. 10 « Sans couche » : un rectangle devant et du texte.
// 11 « Bas de page » : un rectangle magenta devant, posé tout en bas de la diapositive, dont le texte (cinq lignes) passe la marge du bas puis le bord de la page. 12 « Image sur cadre » : une image rouge « devant le
// texte » posée sur un rectangle bleu devant.
const COUCHES = `${FRAME(10, 10, 640, 110, MAGENTA + BEHIND)}<h1>Titre un derrière</h1><p>Texte un</p>${BR}${FRAME(10, 10, 640, 110, MAGENTA)}<h1>Titre deux devant</h1><p>Texte deux</p>${BR}${FRAME(10, 10, 640, 110, AMBER + BEHIND)}${FRAME(300, 300, 200, 100, BLUE)}<h1>Titre trois mêlé</h1><p>Texte trois</p>${BR}${FRAME(10, 10, 640, 110, TEAL)}<h1>Titre quatre long</h1>${MANY}`;
const SOURIS = `${FRAME(10, 10, 640, 110, SAND + BEHIND, '<p>Cadre derrière</p>')}${LINE(40, 300, 400, 0, BEHIND)}<h1>Titre de la diapositive</h1><p>Un texte court</p><p></p><p></p><p>Suite du texte</p>${BR}<h2>Deux</h2><p>Texte deux</p>`;
const BARRE = `${FRAME(100, 100, 300, 100, SAND, '<p>Forme</p>')}${LINE(100, 300, 300, 0)}${FRAME(500, 100, 250, 60, '', '<p>Cadre de texte</p>')}<h1>Titre</h1><p>Texte</p>`;
const SANS = `${FRAME(10, 10, 640, 110, SAND, '<p>Cadre devant</p>')}<h1>Titre de la diapositive</h1><p>Un texte court</p>`;
const BAS = `${FRAME(100, 470, 400, 40, MAGENTA, '<p>Ligne un du bas</p><p>Ligne deux du bas</p><p>Ligne trois du bas</p><p>Ligne quatre du bas</p><p>Ligne cinq du bas</p>')}<h1>Titre du bas</h1><p>Texte</p>`;
const RED_IMAGE = `<img class="editor-image" src="${solidPng([220, 20, 20])}" alt="" style="width: 80px; height: 80px; position: absolute; left: 0px; top: 0px; z-index: 5" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="150" data-page-top-pt="130">`;
const SUR_CADRE = `${FRAME(100, 100, 300, 150, BLUE)}<h1>Titre</h1><p>Texte ${RED_IMAGE}</p>`;
const SEED = seedModels({ record: RECORD }) + `
  add(7, 'Couches', '${COUCHES}', false, 'presentation');
  add(8, 'Souris', '${SOURIS}', false, 'presentation');
  add(9, 'Barre', '${BARRE}', false, 'presentation');
  add(10, 'Sans couche', '${SANS}', false, 'presentation');
  add(11, 'Bas de page', '${BAS}', false, 'presentation');
  add(12, 'Image sur cadre', '${SUR_CADRE}', false, 'presentation');
  stub.state.nextRowId.Publipostage_Modeles = 18;
`;

const TEXTS = {
  fr: { behind: 'Derrière le texte', front: 'Premier plan', back: 'Arrière-plan', duplicate: 'Dupliquer l\'objet' },
  en: { behind: 'Behind text', front: 'Bring to front', back: 'Send to back', duplicate: 'Duplicate the object' },
};

// Les cadres et les lignes du document, dans l'ordre, avec leur couche ; la sélection.
const docState = page => page.evaluate(() => {
  const editor = EditorCore.getEditor();
  const list = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push({ pos: offset, kind: node.type.name === 'freeLine' ? 'line' : 'frame', layer: node.attrs.layer, x: node.attrs.x, y: node.attrs.y, w: node.attrs.w, h: node.attrs.h, text: node.textContent });
  });
  const sel = editor.state.selection;
  const found = FreeFrame.frameAround(sel.$from);
  let title = null;
  editor.state.doc.descendants((node) => { if (title === null && node.type.name === 'heading') title = node.textContent; return title === null; });
  return { list, title, selected: !!(sel.node && (sel.node.type.name === 'freeFrame' || sel.node.type.name === 'freeLine')), selectedPos: sel.node ? sel.from : null, inFrame: !!found && !sel.node, parent: sel.$from.parent.type.name, parentText: sel.$from.parent.textContent };
});

// Le PDF relu par pdf.js : la page `n` peinte à `scale` pixels par point (PNG en base64).
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
// Dans une image (PNG en base64) : les pixels sombres (luminance < 60 : l'encre du texte, jamais un aplat de couleur franche, ni le papier) et ceux de la couleur `hex` (à 40 près), dans le rectangle `rect` (pixels de
// l'image : x0, y0, x1, y1).
const countIn = (page, b64, rect, hex) => page.evaluate(async ([data64, box, color]) => {
  const bytes = Uint8Array.from(atob(data64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const x0 = Math.max(0, Math.floor(box[0])), y0 = Math.max(0, Math.floor(box[1])), x1 = Math.min(canvas.width, Math.ceil(box[2])), y1 = Math.min(canvas.height, Math.ceil(box[3]));
  const data = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  const want = color ? [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)] : null;
  let dark = 0, paint = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < 60) dark++;
    if (want && Math.hypot(data[i] - want[0], data[i + 1] - want[1], data[i + 2] - want[2]) < 40) paint++;
  }
  return { dark, paint, size: [canvas.width, canvas.height] };
}, [b64, rect, hex || null]);
// La capture de l'écran, lue de même : `rect` en pixels de l'écran.
const shotCount = async (page, rect, hex) => countIn(page, (await page.screenshot({ type: 'png' })).toString('base64'), rect, hex);

// Un .docx (en base64) lu dans la page : chaque ancre avec sa couche (`behindDoc`), son rang d'empilement (`relativeHeight`) et la couleur de son remplissage.
const wordAnchorsOf = async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('wp:anchor')).map((anchor) => {
    const fill = anchor.getElementsByTagName('a:srgbClr')[0];
    return { behind: anchor.getAttribute('behindDoc'), height: Number(anchor.getAttribute('relativeHeight')), color: fill ? fill.getAttribute('val').toUpperCase() : '', text: Array.from(anchor.getElementsByTagName('w:t')).map(n => n.textContent).join('') };
  });
};
// Un .pptx (en base64) : le XML de chaque diapositive.
const slidesOf = async (b64) => {
  await ExportCommon.ensureJsZipLoaded();
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const out = [];
  for (const n of names) out.push(await zip.file(n).async('string'));
  return out;
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Une page ouverte sur l'application : les outils (vrais clics, glissements), l'ouverture d'un modèle.
function toolsOf(page) {
  const rectOf = (selector, index = 0) => page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
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
  // Un point de l'écran : la souris y vient de quelques pixels (un mouvement précède toujours un clic) ; `clickAt` clique ensuite, `dragFrom` glisse jusqu'à un autre point.
  const moveTo = async (x, y) => { await page.mouse.move(x - 8, y - 3); await page.mouse.move(x, y, { steps: 2 }); await sleep(140); };
  const clickAt = async (x, y) => { await moveTo(x, y); await page.mouse.click(x, y); await sleep(250); };
  const dragFrom = async (from, to) => {
    await moveTo(from[0], from[1]);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps: 10 });
    await sleep(120);
    await page.mouse.up();
    await sleep(300);
  };
  return { rectOf, hover, click, leave, moveTo, clickAt, dragFrom };
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
  // Sélectionne le cadre ou la ligne de rang `n` (le nœud choisi, comme un clic sur son bord) et le montre.
  const selectNth = async (n) => {
    const ok = await page.evaluate((i) => {
      const ed = EditorCore.getEditor();
      const list = [];
      ed.state.doc.forEach((node, offset) => { if (node.type.name === 'freeFrame' || node.type.name === 'freeLine') list.push(offset); });
      if (!(i in list)) return false;
      FreeFrame.select(ed, list[i]);
      ed.view.focus();
      const dom = ed.view.nodeDOM(list[i]);
      (dom.querySelector('.pp-free-frame-box') || dom).scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    }, n);
    await sleep(400);
    return ok;
  };
  return { page, ...tools, press, save, unsaved, open, html, selectNth };
}

// L'écran de l'éditeur : le coin de la page, le zoom, et le haut de la page de chaque diapositive (le haut du premier bloc de texte moins la marge).
const screenState = page => page.evaluate(() => {
  const content = document.querySelector('#editor-container .tiptap');
  const zoom = EditorCore.layoutZoom(content);
  const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
  const tops = [];
  let started = false;
  Array.from(content.children).forEach((child, i) => {
    const isBreak = child.classList.contains('page-break-marker');
    if (i === 0 || (tops.length && isBreak)) started = false;
    if (isBreak || child.classList.contains('pp-free-frame') || child.tagName === 'STYLE') return;
    if (!started) { tops.push(child.getBoundingClientRect().top - margin * zoom); started = true; }
  });
  return { zoom, pageTops: tops, contentLeft: content.getBoundingClientRect().left };
});
// Dans une racine (l'éditeur, la Lecture, ou le diaporama : `root` rend la racine), le titre `index` amené à l'écran : son rectangle de texte et la boîte du cadre `frame` (pixels de l'écran).
const rectsOf = (page, which, index, frame) => page.evaluate(([where, i, f]) => {
  const rootOf = () => (where === 'show' ? document.querySelector('.pp-slide-show .pp-slide-show-host').shadowRoot : document.querySelector(where));
  const root = rootOf();
  const h = root.querySelectorAll('h1')[i];
  if (where !== 'show') h.scrollIntoView({ block: 'center' });
  return new Promise(resolve => setTimeout(() => {
    const range = document.createRange();
    range.selectNodeContents(h);
    const r = range.getBoundingClientRect();
    const b = rootOf().querySelectorAll('.pp-free-frame-box')[f].getBoundingClientRect();
    resolve({ title: [r.left, r.top, r.right, r.bottom], box: [b.left, b.top, b.right, b.bottom] });
  }, where === 'show' ? 50 : 350));
}, [which, index, frame]);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full) {
  const T = TEXTS[lang];
  const tag = `[${lang} ${colorScheme}] `;
  let S = {};

  // --- 1. Les valeurs.
  if (full && wanted(1)) {
    console.log('\n' + tag + '1) Les valeurs');
    const s = await session({ lang, colorScheme });
    S.small = s;
    await s.open(8, 2);
    const values = await s.page.evaluate(() => {
      const layerOf = raw => FreeFrame.normalized(raw).layer;
      return {
        behind: layerOf({ layer: 'behind' }), front: layerOf({ layer: 'front' }), none: layerOf({}), junk: layerOf({ layer: 'BEHIND ' }), empty: layerOf({ layer: '' }), nul: layerOf({ layer: null }),
        line: FreeFrame.normalized({ shape: 'line', w: 100, h: 0, layer: 'behind' }).layer, constant: FreeFrame.LAYER_BEHIND,
      };
    });
    check(tag + 'la couche ne vaut que « behind » : « front », absente, vide, nulle ou mal écrite valent devant (rien) ; une ligne peut être derrière', values.behind === 'behind' && values.front === '' && values.none === '' && values.junk === '' && values.empty === '' && values.nul === '' && values.line === 'behind' && values.constant === 'behind', values);
    const state = await docState(s.page);
    check(tag + 'le modèle « Souris » a un cadre et une ligne derrière le texte (lus de leur HTML)', state.list.length === 2 && state.list.every(f => f.layer === 'behind'), state.list);
    const markup = await s.html();
    check(tag + 'le HTML du modèle écrit `data-ff-layer="behind"` pour chacun des deux, et rien d\'autre ne se dit devant', (markup.match(/data-ff-layer="behind"/g) || []).length === 2 && !/data-ff-layer="(front|)"/.test(markup), markup.slice(0, 400));
    await s.open(9, 1);
    const front = await s.html();
    check(tag + 'un cadre, une forme et une ligne devant s\'écrivent comme avant : aucun `data-ff-layer`', !/data-ff-layer/.test(front) && (front.match(/pp-free-frame"/g) || []).length === 3, front.slice(0, 300));
  }

  // --- 2. La barre.
  if (wanted(2)) {
    console.log('\n' + tag + '2) La barre du cadre : « ' + T.behind + ' »');
    const s = S.small || await session({ lang, colorScheme });
    S.small = s;
    await s.open(9, 1);
    const BAR = '.v2-frame-toolbar';
    const BUTTON = `${BAR} button[data-action="behind"]`;
    await s.selectNth(0);
    let button = await s.rectOf(BUTTON);
    const label = await s.page.evaluate((sel) => { const b = document.querySelector(sel); return b ? { title: b.title, aria: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), svg: !!b.querySelector('svg') } : null; }, BUTTON);
    check(tag + `la barre de la forme sélectionnée a le bouton « ${T.behind} » : entier dans le panneau, nommé, une icône, pas enfoncé`, inPanel(button) && !!label && label.title === T.behind && label.aria === T.behind && label.svg && label.pressed === 'false' && !label.active, { button, label });
    const others = await s.page.evaluate((sel) => Array.from(document.querySelectorAll(sel + ' button[data-action]')).map(b => b.dataset.action), BAR);
    const layerIcons = await s.page.evaluate(sel => ['front', 'back', 'behind'].map((a) => { const v = document.querySelector(sel + ' button[data-action="' + a + '"] svg'); return v ? v.innerHTML : ''; }), BAR);
    check(tag + 'la barre garde « Premier plan » et « Arrière-plan » (l\'ordre entre les objets) et le bouton « Derrière le texte » a une autre icône que ces deux-là', others.includes('front') && others.includes('back') && others.includes('behind') && layerIcons.every(Boolean) && new Set(layerIcons).size === 3, { others, same: layerIcons.map(v => v.length) });
    await s.click(BUTTON);
    let state = await docState(s.page);
    let now = await s.page.evaluate(sel => { const b = document.querySelector(sel); return { pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), shown: getComputedStyle(b.closest('.v2-floating-toolbar')).display !== 'none' }; }, BUTTON);
    check(tag + 'un vrai clic sur le bouton règle « derrière » : la forme (et elle seule) l\'est, toujours sélectionnée, le bouton enfoncé, la barre là', state.list[0].layer === 'behind' && state.list[1].layer === '' && state.list[2].layer === '' && state.selected && now.pressed === 'true' && now.active && now.shown, { state: state.list, now });
    const attr = await s.page.evaluate(() => { const a = document.querySelector('#editor-container .pp-free-frame'); return { layer: a.getAttribute('data-ff-layer'), z: getComputedStyle(a).zIndex }; });
    check(tag + 'à l\'écran l\'ancre de la forme est derrière le texte (`data-ff-layer`, z-index -1)', attr.layer === 'behind' && attr.z === '-1', attr);
    await sleep(700);
    await s.press('Control+z');
    state = await docState(s.page);
    now = await s.page.evaluate(sel => { const b = document.querySelector(sel); return b ? { pressed: b.getAttribute('aria-pressed') } : null; }, BUTTON);
    check(tag + 'UN Ctrl+Z défait le réglage : la forme est de nouveau devant, le bouton n\'est plus enfoncé', state.list[0].layer === '' && !!now && now.pressed === 'false', { state: state.list, now });
    await s.press('Control+Shift+z');
    state = await docState(s.page);
    check(tag + 'Ctrl+Maj+Z le rétablit', state.list[0].layer === 'behind', state.list);
    await sleep(700);
    await s.selectNth(0);
    await s.click(BUTTON);
    state = await docState(s.page);
    check(tag + 'un second clic le rend : la forme est de nouveau devant, rien d\'écrit dans le HTML', state.list[0].layer === '' && !/data-ff-layer/.test(await s.html()), state.list);
    // « Premier plan » et « Arrière-plan » (l'ordre entre les objets) ne touchent pas la couche.
    await sleep(700);
    await s.selectNth(0);
    await s.click(BUTTON);
    await sleep(700);
    await s.click(`${BAR} button[data-action="front"]`);
    state = await docState(s.page);
    check(tag + `« ${T.front} » passe le cadre au-dessus des autres objets sans changer sa couche (toujours derrière le texte)`, state.list[2].layer === 'behind' && state.list[2].text === 'Forme' && state.list.slice(0, 2).every(f => f.layer === ''), state.list);
    await sleep(700);
    await s.click(`${BAR} button[data-action="back"]`);
    state = await docState(s.page);
    check(tag + `« ${T.back} » le remet sous les autres sans changer sa couche`, state.list[0].layer === 'behind' && state.list[0].text === 'Forme', state.list);
    // Dupliquer et coller gardent la couche.
    await sleep(700);
    await s.click(`${BAR} button[data-action="duplicate"]`);
    state = await docState(s.page);
    check(tag + `« ${T.duplicate} » sur un cadre derrière le texte donne un cadre derrière le texte aussi : la copie est sélectionnée`, state.list.length === 4 && state.list[3].layer === 'behind' && state.list[3].text === 'Forme' && state.selected && state.selectedPos === state.list[3].pos, state.list);
    await s.press('Control+z');
    await s.page.evaluate((markup) => { EditorCore.getEditor().view.pasteHTML(markup); }, FRAME(300, 300, 150, 50, MAGENTA + BEHIND, '<p>Collé derrière</p>'));
    await sleep(500);
    state = await docState(s.page);
    const pasted = state.list.find(f => f.text === 'Collé derrière');
    check(tag + 'un cadre derrière le texte collé garde sa couche', !!pasted && pasted.layer === 'behind', state.list);
    await s.press('Control+z');
    // Une ligne et un cadre de texte l'ont aussi.
    for (const [rank, name] of [[1, 'la ligne'], [2, 'le cadre de texte']]) {
      await sleep(700);
      await s.selectNth(rank);
      const lineButton = await s.rectOf(BUTTON);
      await s.click(BUTTON);
      state = await docState(s.page);
      check(tag + `${name} se règle derrière le texte au même bouton (entier dans le panneau)`, inPanel(lineButton) && state.list[rank].layer === 'behind' && state.selected, { lineButton, list: state.list });
    }
    await s.leave();
    await snap(s.page, `${lang}-barre`);
  }

  // --- 3. Le dessin : sous le texte, jamais sous le papier.
  if (full && wanted(3)) {
    console.log('\n' + tag + '3) Le dessin');
    const big = S.big || await session({ lang, colorScheme, width: 1500, height: 1000 });
    S.big = big;
    await big.open(7, 4);
    const DARK_MIN = 25;
    const COVERED_MAX = 3;
    const seen = async (where, label, behindIndexes) => {
      const out = [];
      for (const [slide, frame, wantsBehind, color] of behindIndexes) {
        const r = await rectsOf(big.page, where, slide, frame);
        const ink = await shotCount(big.page, r.title);
        const paint = await shotCount(big.page, [r.box[2] - 60, r.box[1] + 10, r.box[2] - 20, r.box[3] - 10], color);
        out.push({ slide: slide + 1, wantsBehind, dark: ink.dark, paintPixels: paint.paint, area: Math.round((r.title[2] - r.title[0]) * (r.title[3] - r.title[1])) });
      }
      const okBehind = out.filter(o => o.wantsBehind).every(o => o.dark >= DARK_MIN && o.paintPixels > 200);
      const okFront = out.filter(o => !o.wantsBehind).every(o => o.dark <= COVERED_MAX && o.paintPixels > 200);
      check(tag + `${label} : le titre se lit sur le cadre derrière le texte (diapositives 1 et 3 : au moins ${DARK_MIN} pixels d'encre), le cadre devant le recouvre (2 : au plus ${COVERED_MAX}) ; les deux sont peints, jamais sous le papier`, okBehind && okFront, out);
      return out;
    };
    await seen('#editor-container', 'éditeur', [[0, 0, true, '#be185d'], [1, 1, false, '#be185d'], [2, 2, true, '#b45309']]);
    await snap(big.page, `${lang}-editeur`);
    // La miniature : la même couche (l'ancre derrière est au z-index -1), et le cadre y est peint, pas sous le papier de la vignette.
    const thumbs = await big.page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-thumb')).slice(0, 3).map((th) => {
      const anchor = th.querySelector('.pp-free-frame');
      const box = anchor.querySelector('.pp-free-frame-box');
      const r = box.getBoundingClientRect();
      return { z: getComputedStyle(anchor).zIndex, behind: anchor.getAttribute('data-ff-layer'), spot: [r.right - 14, r.top + r.height / 2], width: r.width };
    }));
    const thumbPaint = [];
    for (const [i, th] of thumbs.entries()) {
      const colors = ['#be185d', '#be185d', '#b45309'];
      thumbPaint.push((await shotCount(big.page, [th.spot[0] - 3, th.spot[1] - 3, th.spot[0] + 3, th.spot[1] + 3], colors[i])).paint);
    }
    check(tag + 'miniatures : l\'ancre de la 1re et de la 3e est derrière le texte (z-index -1), celle de la 2e devant (auto) ; chaque cadre y est peint (pas sous le papier de la vignette)', thumbs[0].z === '-1' && thumbs[1].z === 'auto' && thumbs[2].z === '-1' && thumbPaint.every(n => n > 8), { thumbs, thumbPaint });
    // La Lecture.
    await big.click('#btn-mode-read');
    await sleep(1500);
    await seen('#reader-container', 'Lecture', [[0, 0, true, '#be185d'], [1, 1, false, '#be185d'], [2, 2, true, '#b45309']]);
    await big.click('#btn-mode-edit');
    await sleep(900);
    // Le diaporama : la première page (derrière), puis la deuxième (devant).
    await big.click('.pp-slide-item', 0);
    await big.leave();
    await big.click('.pp-slide-show-open');
    await big.page.waitForFunction(() => { const c = document.querySelector('.pp-slide-show-counter'); return !!c && /\d/.test(c.textContent); }, null, { timeout: 60000 }).catch(() => {});
    await sleep(900);
    const shown = [];
    for (const [slide, wantsBehind] of [[0, true], [1, false]]) {
      if (slide) { await big.press('ArrowRight'); await sleep(1200); }
      // La fenêtre de la page montrée (`.pp-print-window`) rogne le document entier posé dessous : le titre et le cadre de cette page sont ceux qui s'y trouvent.
      const r = await big.page.evaluate(() => {
        const root = document.querySelector('.pp-slide-show .pp-slide-show-host').shadowRoot;
        const win = root.querySelector('.pp-print-window').getBoundingClientRect();
        const inside = b => b.width > 0 && b.bottom > win.top + 1 && b.top < win.bottom - 1 && b.right > win.left && b.left < win.right;
        const rangeOf = (h) => { const range = document.createRange(); range.selectNodeContents(h); return range.getBoundingClientRect(); };
        const h = Array.from(root.querySelectorAll('h1')).find(el => inside(rangeOf(el)));
        const q = rangeOf(h);
        const shownBox = Array.from(root.querySelectorAll('.pp-free-frame-box')).map(b => b.getBoundingClientRect()).find(b => inside(b) && b.top < q.bottom && b.bottom > q.top && b.left < q.right && b.right > q.left);
        return { title: [q.left, q.top, q.right, q.bottom], box: shownBox ? [shownBox.left, shownBox.top, shownBox.right, shownBox.bottom] : null, text: h.textContent };
      });
      const ink = await shotCount(big.page, r.title);
      const paint = r.box ? await shotCount(big.page, [r.box[2] - 60, r.box[1] + 10, r.box[2] - 20, r.box[3] - 10], '#be185d') : { paint: 0 };
      shown.push({ slide: slide + 1, title: r.text, wantsBehind, dark: ink.dark, paintPixels: paint.paint });
      if (!slide) await snap(big.page, `${lang}-diaporama`);
    }
    check(tag + `diaporama : le titre se lit sur le cadre derrière le texte (1re page : au moins ${DARK_MIN} pixels d'encre), le cadre devant le recouvre (2e : au plus ${COVERED_MAX}) ; les deux sont peints`, shown[0].dark >= DARK_MIN && shown[0].paintPixels > 200 && shown[1].dark <= COVERED_MAX && shown[1].paintPixels > 200, shown);
    await big.press('Escape');
    await big.page.waitForFunction(() => !document.querySelector('.pp-slide-show'), null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
  }

  // --- 4. La souris : les clics qui reviennent au cadre derrière le texte.
  if (wanted(4)) {
    console.log('\n' + tag + '4) La souris');
    const s = S.small || await session({ lang, colorScheme });
    S.small = s;
    await s.open(8, 2);
    await s.leave();
    await s.page.evaluate(() => { const f = document.querySelector('#editor-container .tiptap'); f.scrollIntoView({ block: 'start' }); });
    await sleep(300);
    const reaching = () => s.page.evaluate(() => EditorCore.getEditor().view.dom.parentElement.classList.contains('pp-ff-reaching'));
    // Les points : une lettre du titre (dans la boîte du cadre), un point sans lettre dans la boîte (à droite du titre, entre ses lignes), un point sans lettre hors de la boîte.
    const spots = await s.page.evaluate(() => {
      const view = EditorCore.getEditor().view;
      const h = view.dom.querySelector('h1');
      const range = document.createRange();
      range.setStart(h.firstChild, 3);
      range.setEnd(h.firstChild, 5);
      const letter = range.getBoundingClientRect();
      const box = view.dom.querySelector('.pp-free-frame-box').getBoundingClientRect();
      const grab = view.dom.querySelector('.pp-ff-line-grab').getBoundingClientRect();
      const empty = Array.from(view.dom.querySelectorAll(':scope > p')).find(p => !p.textContent).getBoundingClientRect();
      return { letter: [letter.left + letter.width / 2, letter.top + letter.height / 2], blank: [box.right - 30, letter.top + letter.height / 2], emptyRow: [box.left + 80, empty.top + empty.height / 2], box: [box.left, box.top, box.right, box.bottom], line: [grab.left + grab.width / 2, grab.top + grab.height / 2], lineBox: [grab.left, grab.top, grab.right, grab.bottom] };
    });
    check(tag + 'sans la souris sur un cadre, rien ne laisse passer les clics', !(await reaching()), spots);
    await s.moveTo(spots.letter[0], spots.letter[1]);
    check(tag + 'le pointeur sur une lettre du titre, dans la boîte du cadre derrière le texte : le texte garde les clics', !(await reaching()) && (await s.page.evaluate(([x, y]) => document.elementFromPoint(x, y).closest('h1') !== null, spots.letter)), spots.letter);
    await s.clickAt(...spots.letter);
    let state = await docState(s.page);
    check(tag + 'un vrai clic sur cette lettre pose le curseur dans le titre, pas dans le cadre', !state.inFrame && state.parent === 'heading' && !state.selected, state);
    await s.moveTo(...spots.blank);
    const onBlank = await s.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('.pp-free-frame-box') !== null; }, spots.blank);
    check(tag + 'le pointeur dans la boîte du cadre, à droite du titre (aucune lettre) : les clics passent au cadre (la boîte est sous le pointeur)', (await reaching()) && onBlank, { reaching: await reaching(), onBlank });
    await s.clickAt(...spots.blank);
    state = await docState(s.page);
    check(tag + 'un vrai clic à cet endroit pose le curseur dans le texte du cadre derrière le texte', state.inFrame && state.parentText === 'Cadre derrière', state);
    await s.page.keyboard.type('X');
    await sleep(250);
    state = await docState(s.page);
    check(tag + 'la frappe qui suit écrit dans le cadre (une lettre de plus, là où le curseur est) et ne touche pas le titre', state.list[0].text.length === 'Cadre derrière'.length + 1 && state.list[0].text.replace('X', '') === 'Cadre derrière' && state.title === 'Titre de la diapositive', state);
    await s.page.keyboard.press('Backspace');
    await sleep(250);
    state = await docState(s.page);
    check(tag + 'Retour arrière l\'efface : le texte du cadre est tel qu\'avant', state.list[0].text === 'Cadre derrière', state.list);
    await s.moveTo(...spots.emptyRow);
    const onEmpty = await s.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('.pp-free-frame-box') !== null; }, spots.emptyRow);
    check(tag + 'sur une ligne vide du texte de la diapositive, dans la boîte du cadre : les clics passent au cadre (une ligne sans lettre n\'est pas du texte)', (await reaching()) && onEmpty, { reaching: await reaching(), onEmpty, spot: spots.emptyRow });
    await s.clickAt(...spots.emptyRow);
    state = await docState(s.page);
    check(tag + 'un vrai clic sur cette ligne vide pose le curseur dans le cadre', state.inFrame && state.parentText === 'Cadre derrière', state);
    await s.moveTo(spots.box[2] + 30, spots.box[1] + 30);
    check(tag + 'le pointeur hors de la boîte du cadre : les clics reviennent au texte', !(await reaching()), spots.box);
    // La ligne derrière le texte : sa bande se saisit là où il n'y a pas de lettre.
    await s.moveTo(...spots.line);
    const onLine = await s.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest('.pp-ff-line-grab') !== null; }, spots.line);
    check(tag + 'sur la bande de la ligne derrière le texte (sans lettre) : les clics passent à la ligne', (await reaching()) && onLine, { reaching: await reaching(), onLine, line: spots.line });
    await s.clickAt(...spots.line);
    state = await docState(s.page);
    check(tag + 'un vrai clic sur la bande sélectionne la ligne derrière le texte', state.selected && state.list[1].kind === 'line' && state.selectedPos === state.list[1].pos, state);
    // Le cadre sélectionné : ses poignées se saisissent même sous une lettre ; celles d'un cadre non choisi non.
    // `selectNth` fait défiler la page : la lettre se relit à chaque fois (jamais un point gardé d'avant).
    const letterPoint = () => s.page.evaluate(() => {
      const h = EditorCore.getEditor().view.dom.querySelector('h1');
      const range = document.createRange();
      range.setStart(h.firstChild, 2);
      range.setEnd(h.firstChild, 3);
      const r = range.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    });
    // Le cadre est posé de sorte que le coin haut gauche de sa boîte soit au milieu de la troisième lettre du titre : sa poignée « nw » (centrée sur ce coin) est sous la lettre.
    await s.page.evaluate(() => {
      const ed = EditorCore.getEditor();
      const view = ed.view;
      const h = view.dom.querySelector('h1');
      const range = document.createRange();
      range.setStart(h.firstChild, 2);
      range.setEnd(h.firstChild, 3);
      const r = range.getBoundingClientRect();
      const zoom = EditorCore.layoutZoom(view.dom);
      const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pp-margin-top')) || 0;
      const k = (96 / 72) * zoom;
      const x = (r.left + r.width / 2 - view.dom.getBoundingClientRect().left) / k;
      const y = (r.top + r.height / 2 - (h.getBoundingClientRect().top - margin * zoom)) / k;
      let pos = -1;
      ed.state.doc.forEach((node, offset) => { if (pos < 0 && node.type.name === 'freeFrame') pos = offset; });
      FreeFrame.patch(ed, pos, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, w: 300, h: 100 }, false);
    });
    await sleep(500);
    await s.leave();
    let point = await letterPoint();
    await s.moveTo(...point);
    check(tag + 'cadre non choisi : sur la lettre qui est au coin de son contour, le texte garde les clics (le bord du cadre n\'est pas saisi sous une lettre)', !(await reaching()), { point });
    await s.selectNth(0);
    await s.leave();
    point = await letterPoint();
    await s.moveTo(...point);
    const grabbed = await s.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? { handle: e.dataset ? e.dataset.ffKind || null : null, cls: String(e.className).slice(0, 40) } : null; }, point);
    check(tag + 'cadre choisi : sa poignée du coin haut gauche, sous cette lettre, reçoit la souris (les clics lui passent)', (await reaching()) && !!grabbed && grabbed.handle === 'nw', { grabbed, point });
    const before = (await docState(s.page)).list[0];
    await s.dragFrom(point, [point[0] + 14, point[1] + 9]);
    const after = (await docState(s.page)).list[0];
    check(tag + 'un vrai glisser de cette poignée redimensionne le cadre (coin haut gauche déplacé, coin bas droit en place, toujours derrière le texte), le titre intact', after.kind === 'frame' && after.x > before.x + 5 && after.y > before.y + 3 && Math.abs((after.x + after.w) - (before.x + before.w)) < 1.2 && Math.abs((after.y + after.h) - (before.y + before.h)) < 2.5 && after.layer === 'behind' && (await docState(s.page)).title === 'Titre de la diapositive', { before, after });
    await s.leave();
    await snap(s.page, `${lang}-souris`);
    // Sans cadre derrière, rien ne passe : un cadre devant reçoit déjà ses clics.
    await s.open(10, 1);
    await s.leave();
    const frontSpot = await s.page.evaluate(() => { const b = document.querySelector('#editor-container .pp-free-frame-box').getBoundingClientRect(); return [b.right - 30, b.top + b.height / 2]; });
    await s.moveTo(...frontSpot);
    check(tag + 'un cadre devant le texte : le pointeur dessus ne laisse rien passer (il reçoit déjà les clics)', !(await reaching()), frontSpot);
  }

  // --- 5. Les sorties : le PDF, le Word, le PowerPoint.
  if (full && wanted(5)) {
    console.log('\n' + tag + '5) Les sorties : PDF, Word, PowerPoint');
    const big = S.big || await session({ lang, colorScheme, width: 1500, height: 1000 });
    S.big = big;
    await big.open(7, 4);
    await big.click('.pp-slide-item', 0);
    await big.leave();
    const [pdfDownload] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
    const pdfB64 = readFileSync(await pdfDownload.path()).toString('base64');
    const pages = [];
    for (let n = 1; n <= 5; n++) pages.push(await renderPdfPage(big.page, pdfB64, n, 2));
    check(tag + 'le PDF a cinq pages (quatre diapositives, la quatrième passe sa page) de 960 x 540 points', pages[0].numPages === 5 && Math.abs(pages[0].width - 960) < 0.5 && Math.abs(pages[0].height - 540) < 0.5, { n: pages[0].numPages, w: pages[0].width, h: pages[0].height });
    // Le titre est à (28, 28) points environ, sous un rectangle de (10, 10) à (650, 120) : la zone du texte, de 20 à 400 points de large et de 20 à 75 de haut.
    const zone = [40, 40, 800, 150];
    const side = [1240, 60, 1280, 180];
    const counts = [];
    for (let n = 0; n < 5; n++) counts.push(await countIn(big.page, pages[n].png, zone, n === 0 || n === 1 ? '#be185d' : n === 2 ? '#b45309' : '#0f766e'));
    const sides = [];
    for (let n = 0; n < 5; n++) sides.push(await countIn(big.page, pages[n].png, side, n === 0 || n === 1 ? '#be185d' : n === 2 ? '#b45309' : '#0f766e'));
    check(tag + 'PDF : page 1, le cadre derrière le texte est peint (magenta) et le titre se lit dessus (de l\'encre dans la zone du titre)', counts[0].dark >= 40 && counts[0].paint > 500, counts[0]);
    check(tag + 'PDF : page 2, le cadre DEVANT le texte le recouvre (magenta, aucune encre dans la zone du titre : le cadre était derrière avant ce réglage)', counts[1].dark <= 3 && counts[1].paint > 500, counts[1]);
    check(tag + 'PDF : page 3, l\'ellipse ambre derrière le texte laisse lire le titre, et le rectangle bleu devant est là', counts[2].dark >= 40 && counts[2].paint > 300, counts[2]);
    check(tag + 'PDF : page 4, le rectangle vert devant recouvre le titre long, sur sa page', counts[3].dark <= 3 && counts[3].paint > 500, counts[3]);
    check(tag + 'PDF : page 5 (le texte qui a passé la page), aucun cadre : le cadre de la diapositive 4 est sur SA page, pas sur celle où son texte finit', counts[4].paint === 0 && sides[4].paint === 0, { counts: counts[4], sides: sides[4] });
    check(tag + 'PDF : chaque page n\'a que son propre cadre (le magenta des pages 1 et 2 n\'est pas sur la 3e, le vert n\'est pas sur la 1re)', counts[2].paint < counts[0].paint && sides[0].paint > 100 && sides[1].paint > 100, { sides: sides.map(s => s.paint) });
    // Un cadre devant au bas de la diapositive : ses lignes passent la marge du bas puis le bord de la page, et restent sur SA page (un nœud à position absolue qui passait la marge du bas repartait, ligne après ligne, sur la
    // page suivante : une page de plus). Une image « devant le texte » posée sur un cadre devant reste au-dessus de lui, comme à l'écran (l'image est à z-index 5, le cadre sans couche d'empilement).
    const pdfOf = async (id, slides) => {
      await big.open(id, slides);
      await big.click('.pp-slide-item', 0);
      await big.leave();
      const [download] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
      return readFileSync(await download.path()).toString('base64');
    };
    const bottomPdf = await pdfOf(11, 1);
    const bottomPage = await renderPdfPage(big.page, bottomPdf, 1, 2);
    // Les lignes du cadre au bas de la page : 470 points plus ses marges intérieures, quinze points environ par ligne ; la marge du bas de la diapositive commence bien avant le bord de la page (540 points).
    snapPdf(bottomPage, `${lang}-pdf-bas`);
    const bottomBand = await countIn(big.page, bottomPage.png, [200, 1010, 1000, 1076], '#be185d');
    const bottomFrame = await countIn(big.page, bottomPage.png, [200, 940, 1000, 1076], '#be185d');
    check(tag + 'PDF : un cadre devant au bas de la diapositive reste sur sa page (une seule page, aucune page de plus pour ses lignes)', bottomPage.numPages === 1, { n: bottomPage.numPages });
    check(tag + 'PDF : ses lignes qui passent la marge du bas sont peintes sur la page (de l\'encre dans la bande de 505 à 538 points) et le magenta couvre toute la bande', bottomBand.dark >= 150 && bottomBand.paint >= 4000 && bottomFrame.paint > bottomBand.paint, { bottomBand, bottomFrame });
    const overPdf = await pdfOf(12, 1);
    const overPage = await renderPdfPage(big.page, overPdf, 1, 2);
    snapPdf(overPage, `${lang}-pdf-image-sur-cadre`);
    // Le cadre bleu : de (100, 100) à (400, 250) points ; l'image rouge, 60 x 60 points, à une trentaine de points de son coin : au milieu. Les pixels sont ceux d'un rendu à deux pixels par point (14 400 pour l'image).
    const overFrame = await countIn(big.page, overPage.png, [200, 200, 800, 500], '#1d4ed8');
    const overImage = await countIn(big.page, overPage.png, [200, 200, 800, 500], '#dc1414');
    check(tag + 'PDF : l\'image « devant le texte » posée sur un cadre devant est au-dessus de lui (le rouge de l\'image est entier, le bleu du cadre est autour)', overPage.numPages === 1 && overImage.paint >= 13000 && overImage.paint <= 15500 && overFrame.paint > 100000, { overImage, overFrame });
    await big.open(7, 4);
    await big.click('.pp-slide-item', 0);
    await big.leave();
    await snap(big.page, `${lang}-avant-word`);
    // Le Word.
    await big.page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'docx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const [docxDownload] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
    const anchors = await big.page.evaluate(wordAnchorsOf, readFileSync(await docxDownload.path()).toString('base64'));
    const by = color => anchors.filter(a => a.color === color);
    const fills = ['BE185D', 'B45309', '1D4ED8', '0F766E'].map(c => by(c));
    const behindMagenta = by('BE185D').find(a => a.behind === '1');
    const frontMagenta = by('BE185D').find(a => a.behind === '0');
    check(tag + 'Word : le rectangle magenta de la 1re diapositive est derrière le texte (`behindDoc="1"`), celui de la 2e devant (`behindDoc="0"`)', by('BE185D').length === 2 && !!behindMagenta && !!frontMagenta, by('BE185D'));
    check(tag + 'Word : l\'ellipse ambre est derrière le texte, le rectangle bleu et le rectangle vert devant ; un cadre derrière est sous un cadre devant (`relativeHeight` plus petit)', by('B45309').length === 1 && by('B45309')[0].behind === '1' && by('1D4ED8')[0].behind === '0' && by('0F766E')[0].behind === '0' && by('B45309')[0].height < by('1D4ED8')[0].height && behindMagenta.height < frontMagenta.height, anchors);
    void fills;
    // Le PowerPoint.
    await big.page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pptx'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const [pptxDownload] = await Promise.all([big.page.waitForEvent('download', { timeout: 120000 }), big.click('#btn-export-pdf')]);
    const slides = await big.page.evaluate(slidesOf, readFileSync(await pptxDownload.path()).toString('base64'));
    const at = (xml, text) => xml.indexOf(text);
    const order = slides.map(xml => ({ title: at(xml, 'type="title"'), magenta: at(xml, 'BE185D'), amber: at(xml, 'B45309'), blue: at(xml, '1D4ED8'), teal: at(xml, '0F766E') }));
    check(tag + 'PowerPoint : sur la 1re diapositive le rectangle derrière le texte est AVANT le titre dans l\'arbre des formes (donc derrière lui), sur la 2e le rectangle devant est APRÈS', slides.length === 4 && order[0].magenta >= 0 && order[0].magenta < order[0].title && order[1].magenta > order[1].title, order);
    check(tag + 'PowerPoint : sur la 3e, l\'ellipse derrière est avant le titre et le rectangle devant après ; sur la 4e, le rectangle vert devant est après le titre', order[2].amber >= 0 && order[2].amber < order[2].title && order[2].blue > order[2].title && order[3].teal > order[3].title, order);
    await big.page.evaluate(() => { const s = document.getElementById('v2-export-type'); s.value = 'pdf'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  }
}

await run('fr', 'light', true);
await run('en', 'dark', false);
await t.finish();
