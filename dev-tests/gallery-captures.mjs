#!/usr/bin/env node
// Les captures des modèles de la galerie (templates-gallery/, et templates-gallery-dev/ avec --dev), prises dans le VRAI widget : rien n'est dessiné à la main.
// Pour chaque modèle qui a un pack.json et un exemple.json :
//   1. le widget (index.html servi tel quel) s'ouvre sur un document vide, avec le faux Grist de dev-tests/grist-stub.js ; pour une présentation, hébergé par le GFS simulé de
//      dev-tests/gfs-stub.js (`?gfs=0`), qui y active l'extension « diapositives » ;
//   2. le modèle s'installe par le vrai parcours, à la vraie souris : « Créer à partir d'un modèle… », la carte, « Créer avec ses tables », « Créer » (les tables, leurs
//      colonnes de calcul, les règles de liaison et le modèle naissent comme chez un utilisateur : un pack mal écrit échoue ici) ;
//   3. les lignes d'exemple de exemple.json (et de la famille de tables) sont posées dans les tables, qui sont vides : c'est la seule chose que l'installation ne fait pas ;
//   4. pour chaque capture demandée, la ligne est choisie, puis le PDF est exporté par le vrai bouton et chaque page demandée devient capture-N.png (pdftoppm),
//      ou, pour un e-mail ou une grille (kind: "reading"), la Lecture est photographiée ;
//   5. thumb.png (la vignette de la carte), captures.json (l'empreinte de ce qui a servi, cf. dev-tests/gallery-captures-lib.mjs) et le manifeste (screenshot, preview) sont écrits.
// Un modèle dont l'empreinte n'a pas changé n'est pas refait (--force le refait). verify-gallery-captures.mjs (groupe Node galleryCaptures) dit quand une image est à refaire.
//
//   node dev-tests/gallery-captures.mjs                   tous les modèles à refaire de templates-gallery/
//   node dev-tests/gallery-captures.mjs --only flyer-a6   un seul (ou une liste : a,b)
//   node dev-tests/gallery-captures.mjs --force --dev     tout refaire, templates-gallery-dev/ compris
// Il faut : Chromium (Playwright, /opt/node22/lib/node_modules/playwright), poppler (pdftoppm, pdfinfo) et ImageMagick (convert).
// Les exports demandent les bibliothèques des CDN : hors ligne, dev-tests/offline-deps.sh en monte le miroir (.offline-cache), que ce script prend tout seul.
// exemple.json :
//   { "rows": { "Table": [{ "id": 1, "Colonne": valeur, ... }] },       lignes de ce modèle (remplacent celles de la famille, table par table) ;
//                                                                         une Référence est l'id de la ligne visée, une date « AAAA-MM-JJ », une liste un tableau,
//                                                                         une colonne de calcul sa valeur (le faux Grist ne calcule rien)
//     "images": { "1": { "label": "LOGO", "from": "#1d4ed8", "to": "#60a5fa", "width": 480, "height": 320 } },   les pièces jointes (id -> image fabriquée)
//     "extensions": ["graphique"],                                        les extensions de GFS que le modèle demande en plus (« diapositives » l'est toujours pour une présentation) :
//                                                                         des graphiques lus dans les tables n'existent que si « graphique » est active (ECharts vient du miroir hors ligne)
//     "captures": [{ "row": 1, "pages": [1, 2], "kind": "pdf", "width": 560, "expectPages": 2 }],         une ligne de la table principale par capture
//     "thumb": { "capture": 1, "page": 1 } }                                                              (par défaut : la première page de la première capture)
// Une capture : `row` (le rang de la ligne de la table principale, 1 au départ), `pages` (les pages du PDF à garder, [1] au départ), `width` (la largeur du PNG en px),
// `expectPages` (le nombre de pages que le PDF doit avoir : un modèle qui déborde sur une page de plus échoue au lieu d'être photographié ; GALLERY_CAPTURES_KEEP=<dossier>
// garde alors le PDF pour qu'on le regarde) et `kind` :
//   "pdf"      le PDF que le vrai bouton « Exporter en PDF » produit (le défaut d'un modèle document ou d'une présentation) ;
//   "sheets"   la planche de « Assemblage avant impression » (un flyer A6 posé sur une A4, une carte de visite ; `marks: false` pour la planche sans traits de coupe) ;
//   "reading"  la Lecture photographiée (le défaut d'un e-mail ou d'une grille) : `selector` (un élément, `.reader-content` au départ) ou `clip` (des groupes de sélecteurs
//              photographiés ensemble puis posés l'un sous l'autre, comme la barre Objet / À / Cc et le texte d'un e-mail, élargis de `pad` px : un nombre, [haut, droite, bas,
//              gauche] ou une liste de ces formes, une par groupe) ; `viewport` [largeur, hauteur] change la fenêtre le temps de la photo.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { entryFiles, inputsHash, pngSize, readJson, CAPTURE_VERSION } from './gallery-captures-lib.mjs';
import { createKit, ROOT, sh, sleep } from './real-widget-kit.mjs';

const PORT = Number(process.env.GALLERY_CAPTURES_PORT || 8921);
const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i === -1 ? fallback : args[i + 1]; };
const only = String(option('only', '')).split(',').map(s => s.trim()).filter(Boolean);
const FORCE = flag('force');
const WITH_DEV = flag('dev');
const VIEW_W = 1100;
// Le jour où les captures sont censées être prises : les lignes d'exemple (échéances, dates d'événements) sont écrites pour lui.
const CAPTURE_NOW = new Date('2026-10-12T09:00:00+02:00');
const VIEW_H = 1100;

// Largeur d'une capture à l'écran de l'aperçu : 3,3 px par mm de page (700 px pour une A4), au moins 440 px (une étiquette reste lisible), au plus 700.
const defaultWidth = (widthMm) => Math.max(440, Math.min(700, Math.round(widthMm * 3.3)));
const THUMB_W = 240;
const THUMB_H = 320;

for (const tool of ['pdftoppm', 'pdfinfo', 'convert']) {
  if (sh('which', [tool]).status !== 0) { console.error(`Il manque « ${tool} » (poppler-utils, ImageMagick).`); process.exit(2); }
}

// ---- Les modèles à photographier ----
const galleries = [{ dir: 'templates-gallery', label: 'galerie' }];
if (WITH_DEV) galleries.push({ dir: 'templates-gallery-dev', label: 'dev' });
const todo = [];
for (const gallery of galleries) {
  const manifestPath = join(ROOT, gallery.dir, 'catalogue.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  manifest.forEach((entry) => {
    if (!entry.pack || (only.length && only.indexOf(entry.id) === -1)) return;
    const root = join(ROOT, gallery.dir);
    const files = entryFiles(root, entry);
    if (!files.exemple) { console.log(`- ${entry.id} : pas d'exemple.json, ignoré`); return; }
    const hash = inputsHash(root, entry);
    const done = existsSync(join(files.dir, 'captures.json')) && readJson(join(files.dir, 'captures.json')).hash === hash;
    if (done && !FORCE) { console.log(`= ${entry.id} : à jour`); return; }
    todo.push({ gallery, root, manifestPath, manifest, entry, files, hash });
  });
}
if (!todo.length) { console.log('Rien à faire.'); process.exit(0); }

// ---- Le widget réel : dev-tests/real-widget-kit.mjs (serveur, ouverture, installation d'un modèle, lignes d'exemple, export du PDF) ----
const kit = await createKit({ port: PORT, viewW: VIEW_W, viewH: VIEW_H, now: CAPTURE_NOW, workName: 'gallery-captures-' });
const { work, makeImage, openWidget, click, clickMenuRow, installFromGallery, fillRows, fire, exportPdf } = kit;


// L'option « Assemblage avant impression » du menu Exporter, cochée puis lancée par le bouton Exporter : les pages de toutes les lignes posées sur des feuilles A4 (les emplacements au
// maximum, traits de coupe à la demande), par le vrai menu et la vraie fenêtre. L'option est remise sur « une seule ligne » aussitôt après (la liste cachée).
async function exportSheets(page, file, spec) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), (async () => {
    await clickMenuRow(page, '#btn-export-pdf', '#v2-export-pdf-flyout .v2-hover-row[data-export-lines="sheets"]');
    await click(page, '#btn-export-pdf', 100);
    await page.evaluate(() => { document.getElementById('v2-export-lines').value = 'one'; if (typeof ExportChoices !== 'undefined') ExportChoices.remember('v2-export-lines', 'one'); });
    await page.waitForSelector('#pp-sheets-modal .var-modal-primary', { state: 'visible', timeout: 15000 });
    await sleep(400);
    await click(page, `#pp-sheets-modal input[name="pp-sheets-marks"][value="${spec.marks === false ? 'off' : 'on'}"]`, 200);
    await click(page, '#pp-sheets-modal .var-modal-primary', 100);
  })()]);
  await download.saveAs(file);
}

// Le PDF -> des PNG (une page chacun) à la largeur voulue ; la largeur d'une page vient de pdfinfo.
function pdfPagesToPng(pdfFile, pages, widthPx, prefix) {
  const info = sh('pdfinfo', [pdfFile]).stdout;
  const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(info);
  const count = Number((/Pages:\s+(\d+)/.exec(info) || [])[1] || 1);
  if (!size) throw new Error('pdfinfo : taille de page illisible');
  const widthMm = Number(size[1]) / 72 * 25.4;
  const dpi = Math.round((widthPx || defaultWidth(widthMm)) / (Number(size[1]) / 72));
  const out = [];
  pages.forEach((p) => {
    if (p > count) throw new Error(`le PDF n'a que ${count} page(s), pas la page ${p}`);
    const base = prefix + '-p' + p;
    const r = sh('pdftoppm', ['-png', '-r', String(dpi), '-f', String(p), '-l', String(p), '-singlefile', pdfFile, base]);
    if (r.status !== 0) throw new Error('pdftoppm : ' + r.stderr);
    out.push(base + '.png');
  });
  return { files: out, pages: count };
}

// Une image du dossier du modèle : sans métadonnées, en 256 couleurs avec tramage (du texte et des aplats : un tiers du poids ; le tramage évite les bandes
// que ferait un dégradé d'image d'exemple).
function writeOptimised(src, dest) {
  const r = sh('convert', [src, '-strip', '-dither', 'FloydSteinberg', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + dest]);
  if (r.status !== 0) throw new Error('convert : ' + r.stderr);
  return pngSize(readFileSync(dest));
}

// La vignette de la carte : la première page entière, posée sur un fond gris clair avec un trait fin et une ombre douce, en 240 x 320 (le 3 / 4 de la carte).
function writeThumb(src, dest) {
  const r = sh('convert', [src, '-resize', `${THUMB_W - 28}x${THUMB_H - 28}`, '-bordercolor', '#b9c2d3', '-border', '1',
    '(', '+clone', '-background', '#7b869c', '-shadow', '45x3+0+2', ')', '+swap', '-background', 'none', '-layers', 'merge', '+repage',
    '-background', '#e8ecf3', '-gravity', 'center', '-extent', `${THUMB_W}x${THUMB_H}`, '-strip', '-dither', 'FloydSteinberg', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + dest]);
  if (r.status !== 0) throw new Error('convert (vignette) : ' + r.stderr);
  return pngSize(readFileSync(dest));
}

// ---- Un modèle ----
const browser = await kit.launch();
let failures = 0;
for (const job of todo) {
  const { entry, files, root } = job;
  const started = Date.now();
  const tag = `${entry.id}`;
  let session = null;
  try {
    const pack = files.pack;
    const family = files.familyTables;
    const tables = pack.tables.map((t) => {
      if (typeof t !== 'string') return t;
      const found = family && family.tables.find((x) => x.id === t);
      if (!found) throw new Error(`la table « ${t} » n'est pas dans la famille « ${pack.family} »`);
      return found;
    });
    const rows = Object.assign({}, files.familyExemple && files.familyExemple.rows, files.exemple.rows);
    const imageSpecs = Object.assign({}, files.familyExemple && files.familyExemple.images, files.exemple.images);
    const imageBuffers = {};
    Object.keys(imageSpecs).forEach((id) => { imageBuffers[id] = makeImage(imageSpecs[id]); });
    const type = (pack.template && pack.template.type) || 'document';
    session = await openWidget(browser, imageBuffers, { slides: type === 'presentation', extensions: files.exemple.extensions || [] });
    const { page, problems } = session;
    await installFromGallery(page, entry.name);
    const main = pack.main || tables[0].id;
    await fillRows(page, tables.map((t) => ({ id: t.id, columns: t.columns })), rows);

    const specs = files.exemple.captures || [];
    if (!specs.length) throw new Error('exemple.json ne demande aucune capture');
    const outFiles = [];
    const preview = [];
    let n = 0;
    for (const spec of specs) {
      await fire(page, main, spec.row || 1);
      const kind = spec.kind || (type === 'document' || type === 'presentation' ? 'pdf' : 'reading');
      if (kind === 'pdf' || kind === 'sheets') {
        const pdf = join(work, `${entry.id}-${n}.pdf`);
        if (kind === 'pdf') await exportPdf(page, pdf);
        else await exportSheets(page, pdf, spec);
        const made = pdfPagesToPng(pdf, spec.pages || [1], spec.width, join(work, `${entry.id}-${n}`));
        // `expectPages` : le nombre de pages que ce PDF doit avoir (un flyer qui déborde sur une deuxième page ne se photographie pas sans le dire).
        if (spec.expectPages && made.pages !== spec.expectPages) {
          // GALLERY_CAPTURES_KEEP=<dossier> : le PDF trop long est gardé là pour qu'on le regarde (pdftoppm -png).
          if (process.env.GALLERY_CAPTURES_KEEP) { mkdirSync(process.env.GALLERY_CAPTURES_KEEP, { recursive: true }); copyFileSync(pdf, join(process.env.GALLERY_CAPTURES_KEEP, `${entry.id}-${n + 1}.pdf`)); }
          throw new Error(`capture ${n + 1} : le PDF a ${made.pages} page(s), pas ${spec.expectPages}`);
        }
        made.files.forEach((png) => { outFiles.push(png); });
      } else {
        if (spec.viewport) await page.setViewportSize({ width: spec.viewport[0], height: spec.viewport[1] });
        await click(page, '#btn-mode-read', 1200);
        await page.mouse.move(10, 10); // la souris quitte le bouton : son menu de survol (« Lecture épurée ») ne reste pas sur la photo
        await sleep(300);
        const png = join(work, `${entry.id}-${n}-reading.png`);
        if (spec.clip) {
          // `clip` : des éléments photographiés ensemble (la barre Objet / À / Cc d'un e-mail et le texte de la Lecture, sans la barre d'outils de l'éditeur qui les sépare) :
          // une liste de groupes, chaque groupe une liste de sélecteurs ; chaque groupe a sa photo (le cadre qui contient tous ses éléments, élargi de `pad` px), toutes de
          // la même largeur (celle du plus large), posées l'une sous l'autre. Les éléments qui n'occupent rien (le <style> que la Lecture ajoute à sa feuille) ne comptent pas.
          const groups = Array.isArray(spec.clip[0]) ? spec.clip : [spec.clip];
          const boxes = await page.evaluate(({ groups, pad }) => {
            // `pad` : un nombre (partout), [haut, droite, bas, gauche], ou une liste de ces formes, une par groupe.
            const padOf = (g) => { const p = Array.isArray(pad) && Array.isArray(pad[0]) ? pad[g] : pad; return Array.isArray(p) ? p : [p, p, p, p]; };
            const out = groups.map((selectors) => {
              const rects = [];
              selectors.forEach((s) => {
                const found = Array.from(document.querySelectorAll(s)).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
                if (!found.length) throw new Error('Lecture : rien à photographier (' + s + ')');
                found.forEach((r) => rects.push(r));
              });
              return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)), top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
            });
            const left = Math.max(0, Math.min(...out.map((b, g) => b.left - padOf(g)[3])));
            const right = Math.max(...out.map((b, g) => b.right + padOf(g)[1]));
            return out.map((b, g) => { const [pt, , pb] = padOf(g); return { x: left, y: Math.max(0, b.top - pt), width: right - left, height: b.bottom - b.top + pt + pb }; });
          }, { groups, pad: spec.pad == null ? 8 : spec.pad });
          const parts = [];
          for (let g = 0; g < boxes.length; g += 1) {
            const part = png.replace(/\.png$/, `-${g + 1}.png`);
            await page.screenshot({ path: part, clip: boxes[g] });
            parts.push(part);
          }
          if (parts.length === 1) copyFileSync(parts[0], png);
          else { const r = sh('convert', parts.concat(['-background', 'white', '-append', png])); if (r.status !== 0) throw new Error('convert (-append) : ' + r.stderr); }
        } else {
          const el = await page.$(spec.selector || '.reader-content');
          if (!el) throw new Error('Lecture : rien à photographier (' + (spec.selector || '.reader-content') + ')');
          await el.screenshot({ path: png });
        }
        await click(page, '#btn-mode-edit', 600);
        if (spec.viewport) await page.setViewportSize({ width: VIEW_W, height: VIEW_H });
        outFiles.push(png);
      }
      n += 1;
    }
    // Les anciennes captures du dossier partent, les nouvelles prennent leur place.
    readdirSync(files.dir).filter((f) => /^capture-\d+\.png$/.test(f) || f === 'thumb.png').forEach((f) => rmSync(join(files.dir, f)));
    outFiles.forEach((src, i) => {
      const size = writeOptimised(src, join(files.dir, `capture-${i + 1}.png`));
      preview.push({ src: `${entry.pack.split('/').slice(0, -1).join('/')}/capture-${i + 1}.png`, w: size.w, h: size.h });
    });
    const thumbSpec = files.exemple.thumb || {};
    // Les pages d'une capture se suivent dans outFiles : « capture » est le rang de la capture, « page » le rang de la page dans cette capture.
    let thumbIndex = 0;
    if (thumbSpec.capture || thumbSpec.page) {
      let before = 0;
      for (let i = 0; i < (thumbSpec.capture || 1) - 1; i += 1) before += (specs[i].pages || [1]).length;
      thumbIndex = before + (thumbSpec.page || 1) - 1;
    }
    const thumb = writeThumb(outFiles[thumbIndex], join(files.dir, 'thumb.png'));
    const dirName = entry.pack.split('/').slice(0, -1).join('/');
    writeFileSync(join(files.dir, 'captures.json'), JSON.stringify({ version: CAPTURE_VERSION, hash: job.hash, preview, thumb: { src: dirName + '/thumb.png', w: thumb.w, h: thumb.h } }, null, 2) + '\n');
    // Le manifeste : `screenshot` (la vignette) et `preview` (les captures), à la place de leur ancienne valeur et sans toucher au reste.
    const current = job.manifest.find((x) => x.id === entry.id);
    const rebuilt = {};
    Object.keys(current).forEach((key) => { if (key !== 'preview') rebuilt[key] = current[key]; if (key === 'screenshot') rebuilt.preview = preview; });
    if (!rebuilt.preview) rebuilt.preview = preview;
    rebuilt.screenshot = dirName + '/thumb.png';
    job.manifest[job.manifest.indexOf(current)] = rebuilt;
    writeFileSync(job.manifestPath, JSON.stringify(job.manifest, null, 2) + '\n');
    const bad = problems.filter((p) => !/404/.test(p));
    console.log(`+ ${tag} : ${preview.length} capture(s) + vignette en ${Math.round((Date.now() - started) / 1000)} s` + (bad.length ? ` — ${bad.length} erreur(s) de console : ${bad.slice(0, 3).join(' ; ')}` : ''));
    if (bad.length) failures += 1;
  } catch (e) {
    failures += 1;
    console.log(`! ${tag} : ${e.message}`);
  } finally {
    if (session) await session.context.close();
  }
}
await browser.close();
kit.close();
console.log(failures ? `${failures} modèle(s) en échec.` : 'Captures à jour.');
process.exit(failures ? 1 : 0);
