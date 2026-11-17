#!/usr/bin/env node
// LE PDF D'UNE DIAPOSITIVE POSÉE EN BLOC SE CHERCHE ET SE COPIE (14/11, « le PDF exporté n'aura pas de couche de texte cherchable au début... est-ce que ça ne pourrait pas être le cas ? »).
// Le bloc (extensions/diapositives/slide-raster.js) est une photo qui garde ses mots avec leur place (`slideWords`). js/pdf-export.js (`slideBlockSvg`) écrit le bloc en SVG : les mots en texte du PDF, blancs, chacun à la
// place du mot de l'image et étiré à sa largeur, puis la photo PAR-DESSUS qui les couvre : rien de visible, rien de transparent.
// Un document « Avant la diapositive » / la diapositive (un bandeau bleu, « Comité innovation », « Ordre du jour validé ») / « Après la diapositive » est exporté en PDF par le vrai widget (PdfExport.getNativePdfBlobForRecord),
// puis lu comme le lirait un lecteur de PDF (poppler : pdftotext, pdftoppm) :
//  - le texte du PDF contient « Comité innovation » et « Ordre du jour validé », UNE fois chacun, et le texte du document autour ; les mots du bloc sont dans l'ordre de la diapositive ;
//  - chaque mot est à sa place : l'écart entre deux mots, d'un mot à l'autre et d'une ligne à l'autre, est celui de l'image (à 3 pt près), et sa largeur celle du mot de l'image (à 4 pt près) ;
//  - la sélection à la souris d'un lecteur de PDF est un rectangle : celui d'une ligne de l'image prend cette ligne seule (pdftotext -x -y -W -H), celui qui n'a aucun mot dedans ne prend rien ;
//  - la page montre la photo (le bandeau bleu à gauche, le blanc de la page) : les mots blancs dessous ne se voient pas ;
//  - une diapositive dont les mots ont été vidés (image tournée) s'exporte comme une image : pas de texte de la diapositive dans le PDF, la photo est là ;
//  - en qualité « Léger », la photo est ramenée à 150 ppi et le texte reste.
//  - une diapositive lourde (une photo de bruit en fond : un PNG de plusieurs Mo) est gardée en JPEG, bien plus légère (`SlideRaster.snapshot`) ; une diapositive de texte reste en PNG ; la lourde garde ses mots,
//    son PDF se cherche toujours et garde la photo en JPEG (`pdfimages`), à moins de la moitié du poids d'un PNG.
// Lancé par run-headless.mjs (groupe Node « slidePdf », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-slide-pdf.mjs
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { start, seedModels } from './gfs-page.mjs';

const t = await start({ name: 'verify-slide-pdf', port: Number(process.env.SLIDE_PDF_PORT || 9144) });
const { check } = t;
const ACTIVE = ['graphique', 'diapositives'];
const WORK = mkdtempSync(join(tmpdir(), 'slide-pdf-'));
const tool = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if (r.error) throw r.error; return r.stdout; };

const { page } = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: seedModels(), lang: 'fr', colorScheme: 'light' });
await page.waitForFunction(() => typeof Editor !== 'undefined' && !!EditorCore.getEditor(), null, { timeout: 30000 });

// Le document : deux paragraphes et, entre eux, la diapositive posée en bloc (sa photo dessinée par l'extension, comme le volet « Insérer depuis » la pose).
const built = await page.evaluate(async () => {
  const editor = EditorCore.getEditor();
  editor.commands.setContent('<p>Avant la diapositive</p><p>Après la diapositive</p>');
  const band = FreeFrame.html({ x: 0, y: 0, w: 60, h: 540, shape: 'rect', fill: '#009de0', layer: 'behind', decorative: '1' }, '');
  const title = FreeFrame.html({ x: 90, y: 120, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Comité innovation</span></h1>');
  const line = FreeFrame.html({ x: 90, y: 260, w: 800, h: 60 }, '<p><span style="font-size: 28pt">Ordre du jour validé</span></p>');
  const shot = await SlidesEntry.blockSnapshot(band + title + line, null, { rank: 1, total: 1 });
  if (!shot) return { error: 'photo impossible' };
  editor.commands.setTextSelection(1 + 'Avant la diapositive'.length);
  SlideCopies.insertBlock(editor, { shot, width: 600, link: null, slideSource: null });
  return { words: shot.words, width: 600, src: shot.src.length, type: shot.src.slice(0, 15) };
});
const words = (built.words || []).map(w => w.slice());
const wordOf = text => words.find(w => w[4] === text);

// Le PDF du document, ramené en fichier.
const exportPdf = async (quality) => {
  const base64 = await page.evaluate(async (q) => {
    await ExportEngines.ensure('pdf'); // le moteur ne se charge qu'au premier export (js/export-engines.js)
    const html = Editor.getHTML(EditorCore.getEditor().state.doc);
    const { blob } = await PdfExport.getNativePdfBlobForRecord(html, null, {}, '', null, undefined, false, q);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, quality);
  const file = join(WORK, 'doc-' + (quality || 'pleine') + '-' + Date.now() + '.pdf');
  writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
};
const bboxOf = (file) => {
  const xml = tool('pdftotext', ['-bbox', '-f', '1', '-l', '1', file, '-']);
  return Array.from(xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)).map(m => ({ x: +m[1], y: +m[2], r: +m[3], b: +m[4], text: m[5] }));
};
// La page rendue (poppler, PPM) : { w, h, at(x, y) → [r, g, b] } en points (72 ppi).
const rasterOf = (file) => {
  const out = join(WORK, 'raster-' + Date.now());
  tool('pdftoppm', ['-r', '72', '-f', '1', '-l', '1', file, out]);
  const ppm = readFileSync(out + '-1.ppm');
  const header = ppm.toString('latin1', 0, 40).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  const offset = header[0].length;
  const w = +header[1];
  const h = +header[2];
  return { w, h, at: (x, y) => { const i = offset + (Math.round(y) * w + Math.round(x)) * 3; return [ppm[i], ppm[i + 1], ppm[i + 2]]; }, data: ppm.subarray(offset) };
};

check('(préparation) la photo de la diapositive est dessinée, avec ses 6 mots', !built.error && words.length === 6, built);
check('une diapositive de texte et de formes reste en PNG (' + built.type + ')', built.type === 'data:image/png;', built.type);
const file = await exportPdf();
const text = tool('pdftotext', ['-f', '1', '-l', '1', file, '-']).replace(/\s+/g, ' ').trim();
check('le texte du PDF contient « Comité innovation » et « Ordre du jour validé », UNE fois chacun, entre le texte du document', /Avant la diapositive/.test(text) && text.split('Comité innovation').length === 2 && text.split('Ordre du jour validé').length === 2 && /Après la diapositive/.test(text), text);
check('les mots de la diapositive sont dans l’ordre : « Comité innovation Ordre du jour validé »', /Comité innovation Ordre du jour validé/.test(text), text);

// Chaque mot est à sa place : les écarts entre mots sont ceux de l'image (sa largeur en points : 600 px = 450 pt ; sa hauteur : 16:9).
const boxes = bboxOf(file);
const at = text => boxes.find(b => b.text === text);
const widthPt = 600 * 72 / 96;
const heightPt = widthPt * 9 / 16;
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const com = at('Comité');
const inn = at('innovation');
const ord = at('Ordre');
const val = at('validé');
const expectedDx = (wordOf('innovation')[0] - wordOf('Comité')[0]) / 1000 * widthPt;
const expectedDy = (wordOf('Ordre')[1] - wordOf('Comité')[1]) / 1000 * heightPt;
const expectedDx2 = (wordOf('validé')[0] - wordOf('Ordre')[0]) / 1000 * widthPt;
check('d’un mot à l’autre d’une ligne, l’écart est celui de l’image (« innovation » à ' + (inn ? (inn.x - com.x).toFixed(1) : '?') + ' pt de « Comité », attendu ' + expectedDx.toFixed(1) + ')', !!com && !!inn && near(inn.x - com.x, expectedDx, 3), { com, inn, expectedDx });
check('d’une ligne à l’autre, l’écart est celui de l’image (« Ordre » à ' + (ord ? (ord.y - com.y).toFixed(1) : '?') + ' pt sous « Comité », attendu ' + expectedDy.toFixed(1) + ')', !!com && !!ord && near(ord.y - com.y, expectedDy, 3), { com, ord, expectedDy });
check('sur la deuxième ligne, « validé » est à ' + (val && ord ? (val.x - ord.x).toFixed(1) : '?') + ' pt d’« Ordre » (attendu ' + expectedDx2.toFixed(1) + ')', !!ord && !!val && near(val.x - ord.x, expectedDx2, 3), { ord, val, expectedDx2 });
const expectedWidth = wordOf('innovation')[2] / 1000 * widthPt;
check('chaque mot a la largeur du mot de l’image (« innovation » : ' + (inn ? (inn.r - inn.x).toFixed(1) : '?') + ' pt, attendu ' + expectedWidth.toFixed(1) + ')', !!inn && near(inn.r - inn.x, expectedWidth, 4), { inn, expectedWidth });

// Une sélection à la souris dans un lecteur de PDF est un rectangle sur la page : le texte qu'il prend est celui des mots dont la place est dedans. Les rectangles de chaque ligne de l'image (poppler : pdftotext -x -y
// -W -H, à 72 ppi, comme la page en points) donnent chacun la ligne, et elle seule ; un rectangle qui ne touche que le bandeau ne prend rien de la diapositive.
const regionText = (x, y, w, h) => tool('pdftotext', ['-f', '1', '-l', '1', '-r', '72', '-x', String(Math.round(x)), '-y', String(Math.round(y)), '-W', String(Math.round(w)), '-H', String(Math.round(h)), file, '-']).replace(/\s+/g, ' ').trim();
const line1 = regionText(com.x - 3, com.y - 3, inn.r - com.x + 6, com.b - com.y + 6);
const line2 = regionText(ord.x - 3, ord.y - 3, val.r - ord.x + 6, ord.b - ord.y + 6);
check('un rectangle de sélection autour de la première ligne de l’image prend « ' + line1 + ' » et celui de la deuxième « ' + line2 + ' »', line1 === 'Comité innovation' && line2 === 'Ordre du jour validé', { line1, line2 });
const blank = regionText(com.x - 3, com.y + (com.b - com.y) * 1.6, 120, (ord.y - com.b) * 0.5);
check('un rectangle entre les deux lignes, sans mot dedans, ne prend rien (« ' + blank + ' »)', blank === '', blank);

// La page montre la photo ; les mots blancs, dessous, ne se voient pas.
const raster = rasterOf(file);
const bandX = com ? com.x - (wordOf('Comité')[0] / 1000 * widthPt) + 0.03 * widthPt : 0;
const bandY = com ? com.y - (wordOf('Comité')[1] / 1000 * heightPt) + 0.5 * heightPt : 0;
const band = raster.at(bandX, bandY);
check('la page montre la photo : le bandeau bleu (#009de0) est à gauche de la diapositive, à ' + band.join(','), band[0] < 40 && band[1] > 130 && band[1] < 180 && band[2] > 200, { bandX, bandY, band });
let darkInTitle = 0;
const titleX0 = Math.round(com.x); const titleY0 = Math.round(com.y);
for (let y = titleY0; y < titleY0 + 14; y++) for (let x = titleX0; x < titleX0 + 80; x++) { const [r, g, b] = raster.at(x, y); if (r < 90 && g < 100 && b < 120) darkInTitle++; }
check('le titre de l’image se voit (' + darkInTitle + ' points sombres) : ce sont ceux de la photo, pas ceux d’un texte à l’écran', darkInTitle > 40, darkInTitle);

// « Léger » : la photo est ramenée à 150 ppi, le texte reste.
const light = await exportPdf('light');
const lightText = tool('pdftotext', ['-f', '1', '-l', '1', light, '-']).replace(/\s+/g, ' ').trim();
check('en qualité « Léger », le texte de la diapositive est toujours dans le PDF, une fois', /Comité innovation Ordre du jour validé/.test(lightText) && lightText.split('Comité innovation').length === 2, lightText);

// Une diapositive dont les mots ont été vidés (image tournée) s'exporte comme une image.
await page.evaluate(async () => { const ed = EditorCore.getEditor(); let at = -1; ed.state.doc.descendants((n, pos) => { if (at < 0 && n.type.name === 'editorImage' && n.attrs.slideText) at = pos; }); ed.commands.setNodeSelection(at); await ImageReshape.run(ed, 'turn-right'); });
const turned = await exportPdf();
const turnedText = tool('pdftotext', ['-f', '1', '-l', '1', turned, '-']).replace(/\s+/g, ' ').trim();
const turnedRaster = rasterOf(turned);
check('une diapositive tournée (ses mots vidés) s’exporte comme une image : aucun mot de la diapositive dans le PDF, le texte du document reste', /Avant la diapositive/.test(turnedText) && !/Comité|Ordre du jour/.test(turnedText) && turnedRaster.w > 100, turnedText);

// Une diapositive lourde : une photo de bruit en fond de page (un PNG de plusieurs Mo), un cadre blanc et deux lignes de texte.
const heavy = await page.evaluate(async () => {
  const editor = EditorCore.getEditor();
  const noise = document.createElement('canvas');
  noise.width = 640;
  noise.height = 360;
  const g = noise.getContext('2d');
  const data = g.createImageData(640, 360);
  let seed = 20260117;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data.data[i] = (seed >> 8) & 255;
    data.data[i + 1] = (seed >> 16) & 255;
    data.data[i + 2] = (seed >> 3) & 255;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  const photo = FreeFrame.html({ x: 0, y: 0, w: 960, h: 540, layer: 'behind', decorative: '1' }, `<p><img class="editor-image" src="${noise.toDataURL('image/png')}" alt="" style="width: 960px"></p>`);
  const card = FreeFrame.html({ x: 70, y: 100, w: 820, h: 240, shape: 'rect', fill: '#ffffff', layer: 'behind', decorative: '1' }, '');
  const title = FreeFrame.html({ x: 90, y: 120, w: 800, h: 100 }, '<h1><span style="font-size: 44pt">Photo en fond</span></h1>');
  const line = FreeFrame.html({ x: 90, y: 250, w: 800, h: 60 }, '<p><span style="font-size: 28pt">Rapport annuel</span></p>');
  const shot = await SlidesEntry.blockSnapshot(photo + card + title + line, null, { rank: 1, total: 1 });
  if (!shot) return { error: 'photo impossible' };
  editor.commands.setContent('<p>Avant la photo</p><p>Après la photo</p>');
  editor.commands.setTextSelection(1 + 'Avant la photo'.length);
  SlideCopies.insertBlock(editor, { shot, width: 600, link: null, slideSource: null });
  return { type: shot.src.slice(0, 16), chars: shot.src.length, words: shot.words.map(w => w.slice()) };
});
const heavyWords = (heavy.words || []).map(w => w[4]);
check('la diapositive lourde est gardée en JPEG (' + heavy.type + ', ' + (heavy.chars / 1e6).toFixed(2) + ' M de signes), avec ses mots « ' + heavyWords.join(' ') + ' »', !heavy.error && /^data:image\/jpeg;/.test(heavy.type) && heavy.chars < 3000000 && heavyWords.join(' ') === 'Photo en fond Rapport annuel', { type: heavy.type, chars: heavy.chars, heavyWords });
const heavyFile = await exportPdf();
const heavyText = tool('pdftotext', ['-f', '1', '-l', '1', heavyFile, '-']).replace(/\s+/g, ' ').trim();
check('le PDF de la diapositive lourde se cherche : « Photo en fond Rapport annuel » une fois, entre le texte du document', /Avant la photo/.test(heavyText) && /Photo en fond Rapport annuel/.test(heavyText) && heavyText.split('Photo en fond').length === 2 && /Après la photo/.test(heavyText), heavyText);
const listed = tool('pdfimages', ['-list', '-f', '1', '-l', '1', heavyFile]).split('\n').filter(l => /^\s*1\s+\d+\s+image/.test(l));
check('la photo du PDF est en JPEG (' + (listed[0] || 'aucune image').trim().replace(/\s+/g, ' ') + ')', listed.length >= 1 && / jpeg /.test(listed[0]), listed);
const heavyBytes = readFileSync(heavyFile).length;
check('le PDF de la diapositive lourde pèse ' + (heavyBytes / 1e6).toFixed(2) + ' Mo (moins de 3 Mo)', heavyBytes < 3e6, heavyBytes);
const heavyRaster = rasterOf(heavyFile);
// L'angle de la diapositive, tiré du mot « Photo » (sa place dans l'image, en millièmes) : un coin de la photo de fond, hors du cadre blanc.
const photoBox = bboxOf(heavyFile).find(b => b.text === 'Photo');
const photoWord = (heavy.words || []).find(w => w[4] === 'Photo');
const originX = photoBox ? photoBox.x - photoWord[0] / 1000 * widthPt : 0;
const originY = photoBox ? photoBox.y - photoWord[1] / 1000 * heightPt : 0;
let noisy = 0;
for (let y = 4; y < 34; y++) for (let x = 4; x < 30; x++) { const [r, gg, b] = heavyRaster.at(originX + x, originY + y); if (Math.abs(r - gg) > 25 || Math.abs(gg - b) > 25) noisy++; }
check('la page montre la photo de fond (' + noisy + ' points colorés sur 780 dans le coin de la diapositive)', noisy > 250, { noisy, originX, originY });

rmSync(WORK, { recursive: true, force: true });
await t.finish();
