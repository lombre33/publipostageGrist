#!/usr/bin/env node
// Le graphique de la page (importé de Grist) puis le graphique CRÉÉ (« Créer un graphique… », lot 1) dans une PRÉSENTATION (Slides+) et dans une GRILLE (module de graphiques, demande du 02/11 : « pour les 3 : document, grille et slides »). Il existait dans le
// Document ; ni la présentation ni la grille ne l'avaient jamais joué en entier. À 700x400, à la vraie souris, hébergé par GFS (simulé par dev-tests/gfs-stub.js), les extensions « graphique » et « diapositives » actives,
// le document de Grist de dev-tests/scenarios-chart-block.js (les clients, leurs ventes, les graphiques de la page).
//  UNE PRÉSENTATION de trois diapositives, un graphique chacune : dans le texte (liées à la ligne), dans un cadre libre (toute la table), dans le texte (toute la table).
//   - l'éditeur dessine les trois, y compris celui du cadre ; la ligne « Graphique de la page… » du menu de la chaîne est active (rien ne la grise dans une présentation) et entière dans le panneau ;
//   - la BANDE des diapositives montre le dessin du graphique, pas le cadre pointillé (correction du 02/11 : la miniature copiait l'éditeur avant que le dessin n'arrive, et ne le recopiait jamais) ; une autre ligne
//     dans Grist change le dessin de l'éditeur, la miniature le suit ;
//   - la Lecture, le diaporama et le PowerPoint montrent la même image que l'éditeur : le PowerPoint a une image par diapositive, à la taille réglée (360 x 225 pt ; 225 x 140 pt dans le cadre), dans la diapositive,
//     les mêmes octets que la Lecture ; une ligne sans vente n'a plus l'image des graphiques « liées » et garde celle de « toute la table ».
//  UNE GRILLE d'une case-graphique (140 x 90) : l'éditeur la dessine, la Lecture la montre, le PDF l'embarque (420 x 270 pixels), l'Excel la pose sur sa case (B1, 140 x 90 pixels).
//  LE GRAPHIQUE CRÉÉ (barres liées à la ligne, courbe à deux séries dans le cadre libre, secteurs sur toute la table ; une case-graphique dans la grille) : les mêmes essais, le même parcours - sa ligne est celle du
//   menu de l'Image (« Créer un graphique… »), active dans une présentation ; l'éditeur, la bande, la Lecture, le diaporama, le PowerPoint, le PDF et l'Excel montrent le dessin de ECharts à la taille réglée.
//  L'ANGLAIS, en sombre : la ligne du menu, et la bande qui montre le dessin.
// Lancé par run-headless.mjs (groupe Node « chartSlidesGrid », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-chart-slides-grid.mjs
// CHART_SLIDES_SHOTS=<dossier> : enregistre aussi des captures et les fichiers téléchargés (à relire à l'œil) ; sans lui, rien n'est écrit.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { start, seedModels, ROOT } from './gfs-page.mjs';
import { click, hoverRow, chooseExportType } from './load-lib.mjs';

const SHOTS = process.env.CHART_SLIDES_SHOTS || '';
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const t = await start({ name: 'verify-chart-slides-grid', port: Number(process.env.CHART_SLIDES_GRID_PORT || 9180) });
const { check } = t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ACTIVE = ['graphique', 'diapositives'];
const EMU = 12700;
const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= tolerance;

// ---- Les deux modèles de l'essai -----------------------------------------------------------------------------------------------------------------------------------------------------------------
const chart = (id, scope, name, style) => '<img class="editor-image" alt="Graphique" style="' + (style || 'width: 480px; height: 300px') + '" data-layer="normal" data-wrap="inline" data-chart-section="' + id + '" data-chart-scope="' + scope + '" data-chart-name="' + name + '">';
// Le graphique créé, tel que l'éditeur l'écrit : jamais d'image, sa définition (colonnes par identifiant), les lignes, son nom.
const made = (definition, scope, name, style) => '<img class="editor-image" alt="Graphique" style="' + (style || 'width: 480px; height: 300px') + '" data-layer="normal" data-wrap="inline" data-chart-spec="'
  + JSON.stringify(Object.assign({ v: 1 }, definition)).replace(/"/g, '&quot;') + '" data-chart-scope="' + scope + '" data-chart-name="' + name + '">';
const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
const PROPS = '<div class="pp-slide-props" contenteditable="false" aria-hidden="true" style="display:block;height:0;margin:0;padding:0;border:0"></div>';
const FRAME = (x, y, w, h, body) => `<div class="pp-free-frame" role="group" data-ff-x="${x}" data-ff-y="${y}" data-ff-w="${w}" data-ff-h="${h}"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${body}</div></div></div>`;
const FRAME_AT = { x: 60, y: 120, w: 340, h: 230 };
const DECK = [
  PROPS, '<h1>Ventes</h1>', '<p>' + chart(101, 'linked', 'Ventes par mois') + '</p>', BR,
  '<h2>Cadre</h2>', FRAME(FRAME_AT.x, FRAME_AT.y, FRAME_AT.w, FRAME_AT.h, '<p>' + chart(101, 'all', 'Toutes les ventes', 'width: 300px; height: 187px') + '</p>'), BR,
  '<h2>Familles</h2>', '<p>' + chart(103, 'all', 'Familles') + '</p>',
].join('');
const MADE_DECK = [
  PROPS, '<h1>Ventes</h1>', '<p>' + made({ kind: 'bar', table: 'GfVentes', label: 'Mois', values: ['Montant'] }, 'linked', 'Barres · GfVentes') + '</p>', BR,
  '<h2>Cadre</h2>', FRAME(FRAME_AT.x, FRAME_AT.y, FRAME_AT.w, FRAME_AT.h, '<p>' + made({ kind: 'line', table: 'GfVentes', label: 'Mois', values: ['Montant', 'Cout'] }, 'all', 'Courbe · GfVentes', 'width: 300px; height: 187px') + '</p>'), BR,
  '<h2>Familles</h2>', '<p>' + made({ kind: 'pie', table: 'GfVentes', label: 'Famille', values: ['Montant'] }, 'all', 'Secteurs · GfVentes') + '</p>',
].join('');
const MADE_GRID = '<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="140" style="height: 140px"><td colwidth="150"><p>Avant</p></td><td colwidth="150"><p>'
  + made({ kind: 'bar', table: 'GfVentes', label: 'Mois', values: ['Montant'] }, 'linked', 'Barres · GfVentes', 'width: 140px; height: 90px') + '</p></td></tr></tbody></table>';
const GRID = '<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="140" style="height: 140px"><td colwidth="150"><p>Avant</p></td><td colwidth="150"><p>'
  + chart(101, 'linked', 'Ventes par mois', 'width: 140px; height: 90px') + '</p></td></tr></tbody></table>';
const SEED = seedModels({}) + `
  add(7, 'Présentation', ${JSON.stringify(DECK)}, false, 'presentation');
  add(8, 'Grille essai', ${JSON.stringify(GRID)}, false, 'grille');
  add(9, 'Présentation créée', ${JSON.stringify(MADE_DECK)}, false, 'presentation');
  add(10, 'Grille créée', ${JSON.stringify(MADE_GRID)}, false, 'grille');
  stub.state.nextRowId.Publipostage_Modeles = 20;
`;
const CLIENT_1 = { id: 1, Nom: 'Atelier Durand', Ville: 'Lyon' };
const CLIENT_2 = { id: 2, Nom: 'Brasserie Roy', Ville: 'Nantes' };
const NO_SALE = { id: 99, Nom: 'Sans vente' };

const TEXTS = {
  fr: { row: 'Graphique de la page…', makeRow: 'Créer un graphique…' },
  en: { row: 'Chart from the page…', makeRow: 'Create a chart…' },
};

// ---- Les gestes ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function openApp(lang, colorScheme) {
  const opened = await t.openPage({ hosted: true, stub: { extensions: ACTIVE }, seed: SEED, lang, colorScheme });
  const { page } = opened;
  // Le document de Grist est celui de scenarios-chart-block.js : une seule description des données, chargée dans la page.
  await page.addScriptTag({ path: join(ROOT, 'dev-tests', 'scenarios-chart-block.js') });
  await page.evaluate(async () => { await GfsLink.ready; await Extensions.loadAll(); await window.__chartFixture.seed({ resetEditor: async () => {} }); });
  await sleep(300);
  return opened;
}
async function openModel(page, id, slides) {
  await Promise.race([
    page.evaluate(n => window.__gfsStub.ouvrir({ fichier: { id: String(n), type: 'modele' }, type: '', dossier: '', raison: 'explorateur' }), id),
    sleep(20000),
  ]);
  await page.waitForFunction(n => String(Templates.getCurrentId()) === String(n), id, { timeout: 8000 }).catch(() => {});
  if (slides) await page.waitForFunction(k => document.querySelectorAll('.pp-slide-item').length >= k, slides, { timeout: 15000 }).catch(() => {});
  await sleep(600);
}
const fire = (page, record) => page.evaluate(r => { window.__gristStub.fireRecord(Object.assign({}, r), 'GfClients'); }, record);
// Les graphiques que l'ÉDITEUR dessine (ses cadres), dans l'ordre du document ; la bande des diapositives en porte des copies, qu'on laisse de côté.
const editorCharts = page => page.evaluate(() => Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(wrap => !wrap.closest('.pp-slide-list')).map((wrap) => {
  const box = wrap.getBoundingClientRect();
  return { drawn: wrap.classList.contains('editor-image-chart-drawn'), src: wrap.querySelector('img').getAttribute('src') || '', width: box.width, height: box.height };
}));
// Ceux de la BANDE : un par miniature, dans l'ordre des diapositives.
const stripCharts = page => page.evaluate(() => Array.from(document.querySelectorAll('.pp-slide-list .pp-slide-item')).map((item) => {
  const wrap = item.querySelector('.editor-image-chart-placeholder');
  return wrap ? { drawn: wrap.classList.contains('editor-image-chart-drawn'), src: wrap.querySelector('img').getAttribute('src') || '' } : null;
}));
const PNG = /^data:image\/png;base64,/;
async function waitFor(page, what, fn, arg, timeout = 20000) {
  try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { console.log('  (attente sans fin : ' + what + ')'); return false; }
}
// Tous les cadres de l'éditeur sont dessinés (et il y en a `count`).
const waitDrawn = (page, count) => waitFor(page, 'dessins de l\'éditeur', n => { const all = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).filter(w => !w.closest('.pp-slide-list')); return all.length === n && all.every(w => w.classList.contains('editor-image-chart-drawn') && /^data:image\/png/.test(w.querySelector('img').getAttribute('src') || '')); }, count);
const waitStrip = (page, count) => waitFor(page, 'dessins de la bande', n => { const all = document.querySelectorAll('.pp-slide-list .editor-image-chart-placeholder'); return all.length === n && Array.from(all).every(w => w.classList.contains('editor-image-chart-drawn')); }, count, 6000);
const download = (page, action, timeout = 120000) => Promise.all([page.waitForEvent('download', { timeout }).catch(() => null), action()]).then(([file]) => file);
const bytesOf = async file => (file ? readFileSync(await file.path()) : null);
const keep = async (name, bytes) => { if (SHOTS && bytes) await writeFile(join(SHOTS, name), bytes); };
const snap = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
async function exportAs(page, type) {
  await chooseExportType(page, type);
  const file = await download(page, () => click(page, '#btn-export-pdf'));
  return bytesOf(file);
}
// Les images de la Lecture (une par graphique), dans l'ordre.
async function readerImages(page) {
  await click(page, '#btn-mode-read');
  await sleep(2500);
  const out = await page.evaluate(() => Array.from(document.querySelectorAll('#reader-container img')).map((img) => {
    const box = img.getBoundingClientRect();
    return { src: img.getAttribute('src') || '', width: box.width, height: box.height, style: img.getAttribute('style') || '' };
  }));
  await snap(page, 'lecture-' + out.length);
  await click(page, '#btn-mode-edit');
  await sleep(1200);
  return out;
}
// Un .pptx relu dans la page : par diapositive, les images (boîte en EMU, image de l'archive en base64) ; un .xlsx : l'ancre et la taille de l'image posée, son PNG.
async function installReaders(page) {
  await page.evaluate(() => {
    window.__readPptx = async (b64) => {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(b64, { base64: true });
      const parse = async name => new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
      const slides = [];
      for (let n = 1; zip.file('ppt/slides/slide' + n + '.xml'); n++) {
        const doc = await parse('ppt/slides/slide' + n + '.xml');
        const rels = await parse('ppt/slides/_rels/slide' + n + '.xml.rels');
        const targets = {};
        Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => { targets[r.getAttribute('Id')] = r.getAttribute('Target'); });
        const pictures = [];
        for (const pic of Array.from(doc.getElementsByTagName('p:pic'))) {
          const xfrm = pic.getElementsByTagName('a:xfrm')[0];
          const off = xfrm.getElementsByTagName('a:off')[0];
          const ext = xfrm.getElementsByTagName('a:ext')[0];
          const target = targets[pic.getElementsByTagName('a:blip')[0].getAttribute('r:embed')];
          const media = zip.file('ppt/' + target.replace(/^\.\.\//, ''));
          pictures.push({ x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), cx: Number(ext.getAttribute('cx')), cy: Number(ext.getAttribute('cy')), target, png: media ? await media.async('base64') : '' });
        }
        slides.push({ pictures });
      }
      return { slides, size: await (async () => { const p = await parse('ppt/presentation.xml'); const s = p.getElementsByTagName('p:sldSz')[0]; return { cx: Number(s.getAttribute('cx')), cy: Number(s.getAttribute('cy')) }; })() };
    };
    window.__readXlsx = async (b64) => {
      await ExportCommon.ensureJsZipLoaded();
      const zip = await JSZip.loadAsync(b64, { base64: true });
      const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
      const drawingName = names.find(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
      const drawing = drawingName ? await zip.file(drawingName).async('string') : '';
      const media = names.filter(n => n.startsWith('xl/media/'));
      const anchor = /<xdr:from><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/.exec(drawing);
      const ext = /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(drawing);
      const pictures = [];
      for (const name of media) {
        const bytes = await zip.file(name).async('uint8array');
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        const size = await new Promise((ok) => { const img = new Image(); img.onload = () => ok({ width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => ok({ width: 0, height: 0 }); img.src = url; });
        pictures.push(size);
      }
      return { media: media.length, pictures, col: anchor ? Number(anchor[1]) : null, row: anchor ? Number(anchor[2]) : null, cx: ext ? Number(ext[1]) : null, cy: ext ? Number(ext[2]) : null };
    };
  });
}
const payloadOf = src => src.replace(PNG, '');

// ---- Le parcours ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run(lang, colorScheme, full, kind) {
  const created = kind === 'made';
  const tag = `[${lang} ${colorScheme}${created ? ' graphique créé' : ''}] `;
  const T = TEXTS[lang];
  const WHAT = created ? 'graphique créé' : 'graphique de la page';
  const FILE = created ? 'cree-' : '';
  console.log(`\n${tag}Une présentation de trois diapositives, un ${WHAT} chacune`);
  const { page } = await openApp(lang, colorScheme);
  await installReaders(page);
  await openModel(page, created ? 9 : 7, 3);
  const slidesShown = await page.evaluate(() => document.querySelectorAll('.pp-slide-item').length);
  check(tag + 'la présentation est ouverte : trois diapositives dans la bande', slidesShown === 3, slidesShown);

  // 1) L'éditeur, le menu.
  const drawnOk = await waitDrawn(page, 3);
  const inEditor = await editorCharts(page);
  check(tag + 'l\'éditeur dessine les trois graphiques (dans le texte, dans le cadre libre, dans le texte), chacun une image PNG',
    drawnOk && inEditor.length === 3 && inEditor.every(c => c.drawn && PNG.test(c.src)), inEditor.map(c => [c.drawn, c.src.slice(0, 22)]));
  check(tag + 'ils gardent la proportion réglée : 480 x 300 dans le texte, 300 x 187 dans le cadre',
    near(inEditor[0].width / inEditor[0].height, 480 / 300, 0.03) && near(inEditor[1].width / inEditor[1].height, 300 / 187, 0.03) && near(inEditor[2].width / inEditor[2].height, 480 / 300, 0.03), inEditor.map(c => [Math.round(c.width), Math.round(c.height)]));
  check(tag + 'le graphique du cadre est plus petit que ceux du texte (300 px contre 480)', inEditor[1].width < inEditor[0].width * 0.7, inEditor.map(c => Math.round(c.width)));
  const ROW_ID = created ? 'v2-btn-chart-make' : 'v2-btn-chart';
  await hoverRow(page, created ? '#v2-btn-image' : '#v2-btn-link', '#' + ROW_ID);
  const row = await page.evaluate((rowId) => {
    const el = document.getElementById(rowId);
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { text: el.textContent.trim(), greyed: el.classList.contains('v2-hover-row-disabled') || el.getAttribute('aria-disabled') === 'true', inside: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth, onTop: !!top && (top === el || el.contains(top)) };
  }, ROW_ID);
  check(tag + `dans une présentation, la ligne « ${created ? T.makeRow : T.row} » du menu ${created ? 'de l\'Image' : 'de la chaîne'} est active (ni grisée, ni désactivée), entière dans le panneau et au premier plan`, row.text === (created ? T.makeRow : T.row) && !row.greyed && row.inside && row.onTop, row);
  await page.mouse.move(650, 380);
  await sleep(300);

  // 2) La bande des diapositives : le dessin, pas le cadre pointillé ; une autre ligne le change.
  const stripReady = await waitStrip(page, 3);
  const inStrip = await stripCharts(page);
  check(tag + 'la bande montre le DESSIN de chaque graphique (pas le cadre pointillé) : trois miniatures, trois images PNG',
    stripReady && inStrip.length === 3 && inStrip.every(c => c && c.drawn && PNG.test(c.src)), inStrip.map(c => c && [c.drawn, c.src.slice(0, 22)]));
  check(tag + 'chaque miniature montre la même image que l\'éditeur', inStrip.length === 3 && inStrip.every((c, i) => c && c.src === inEditor[i].src), inStrip.map((c, i) => c && c.src === inEditor[i].src));
  await snap(page, `presentation-${FILE}${lang}-${colorScheme}`);
  if (!full) return page;

  await fire(page, CLIENT_2);
  const changed = await waitFor(page, 'le dessin de la ligne 2', first => { const w = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).find(x => !x.closest('.pp-slide-list')); return !!w && w.classList.contains('editor-image-chart-drawn') && w.querySelector('img').getAttribute('src') !== first; }, inEditor[0].src);
  const afterRow = await editorCharts(page);
  await waitFor(page, 'la bande suit la ligne 2', pair => { const item = document.querySelector('.pp-slide-list .pp-slide-item .editor-image-chart-placeholder img'); return !!item && item.getAttribute('src') === pair; }, afterRow[0] && afterRow[0].src, 6000);
  const stripAfter = await stripCharts(page);
  check(tag + 'une autre ligne dans Grist (Brasserie Roy) change le dessin du graphique « liées » de l\'éditeur, pas celui de « toute la table »',
    changed && afterRow.length === 3 && afterRow[0].src !== inEditor[0].src && afterRow[1].src === inEditor[1].src && afterRow[2].src === inEditor[2].src, afterRow.map((c, i) => c.src === inEditor[i].src));
  check(tag + 'la miniature de la diapositive 1 suit : elle montre le nouveau dessin, les deux autres gardent le leur',
    stripAfter.length === 3 && stripAfter.every(c => c && c.drawn) && stripAfter[0].src === afterRow[0].src && stripAfter[1].src === afterRow[1].src && stripAfter[2].src === afterRow[2].src, stripAfter.map((c, i) => c && c.src === afterRow[i].src));

  // 3) La Lecture, le diaporama, le PowerPoint : la même image que l'éditeur.
  console.log(`\n${tag}La Lecture, le diaporama, le PowerPoint`);
  const reading = await readerImages(page);
  check(tag + 'la Lecture montre les trois graphiques : trois images PNG, aucune note « indisponible », aux largeurs réglées (480, 300, 480 px)',
    reading.length === 3 && reading.every(r => PNG.test(r.src)) && /width: 480px/.test(reading[0].style) && /width: 300px/.test(reading[1].style) && /width: 480px/.test(reading[2].style), reading.map(r => [r.src.slice(0, 22), r.style]));
  check(tag + 'ce sont les mêmes images que celles de l\'éditeur (même dessin, même ligne)', reading.length === 3 && reading.every((r, i) => r.src === afterRow[i].src), reading.map((r, i) => r.src === afterRow[i].src));
  await waitDrawn(page, 3);
  await click(page, '.pp-slide-show-open');
  await waitFor(page, 'le diaporama', () => { const s = document.querySelector('.pp-slide-show'); const c = s && s.querySelector('.pp-slide-show-counter'); return !!c && c.textContent !== ''; }, null, 40000);
  await sleep(1500);
  const show = await page.evaluate(() => {
    const host = document.getElementById('pp-slide-show-stage');
    const scope = host && host.shadowRoot ? host.shadowRoot.querySelector('.pp-print-scope') : null;
    const layer = scope ? scope.querySelector(':scope > .pp-slide-show-layer:not(.pp-slide-show-ghost)') : null;
    // Le calque porte toutes les diapositives, l'écran n'en montre qu'une : celle dont l'image est dans la fenêtre.
    return layer ? Array.from(layer.querySelectorAll('img')).map((img) => {
      const box = img.getBoundingClientRect();
      return { src: img.getAttribute('src') || '', width: box.width, inView: box.width > 100 && box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 };
    }) : null;
  });
  await snap(page, `diaporama-${FILE}${lang}-${colorScheme}`);
  await page.keyboard.press('Escape');
  await sleep(800);
  const onScreen = show ? show.filter(s => s.inView) : [];
  check(tag + 'le diaporama a les trois graphiques et en montre un à l\'écran : une image PNG, celle de la Lecture', !!show && show.length === 3 && show.every(s => PNG.test(s.src) && reading.some(r => r.src === s.src)) && onScreen.length === 1, show && show.map(s => [s.src.slice(0, 22), Math.round(s.width), s.inView]));

  const file = await exportAs(page, 'pptx');
  await keep(`presentation-${FILE}${lang}-${colorScheme}.pptx`, file);
  const pptx = file ? await page.evaluate(b64 => window.__readPptx(b64), file.toString('base64')) : null;
  check(tag + 'le PowerPoint se lit : trois diapositives de 960 x 540 points', !!pptx && pptx.slides.length === 3 && pptx.size.cx === 12192000 && pptx.size.cy === 6858000, pptx && pptx.slides.length);
  if (!pptx || pptx.slides.length !== 3) return page;
  const pic = pptx.slides.map(s => s.pictures);
  check(tag + 'une seule image par diapositive : le graphique',
    pic.every(list => list.length === 1), pic.map(list => list.length));
  const inside = p => p.x >= 0 && p.y >= 0 && p.x + p.cx <= pptx.size.cx && p.y + p.cy <= pptx.size.cy;
  check(tag + 'les images ont la taille réglée : 360 x 225 points dans le texte (480 x 300 px), 225 x 140 points dans le cadre (300 x 187 px), toutes dans la diapositive',
    near(pic[0][0].cx / EMU, 360, 1) && near(pic[0][0].cy / EMU, 225, 1) && near(pic[1][0].cx / EMU, 225, 1) && near(pic[1][0].cy / EMU, 140.25, 1) && near(pic[2][0].cx / EMU, 360, 1) && near(pic[2][0].cy / EMU, 225, 1) && pic.every(list => inside(list[0])),
    pic.map(list => [list[0].x / EMU, list[0].y / EMU, list[0].cx / EMU, list[0].cy / EMU]));
  const frame = pic[1][0];
  check(tag + 'l\'image du cadre est DANS le cadre : entre son bord gauche (60 pt) et son bord droit (400 pt), son bord haut (120 pt) et son bord bas (350 pt)',
    frame.x / EMU >= FRAME_AT.x - 0.5 && (frame.x + frame.cx) / EMU <= FRAME_AT.x + FRAME_AT.w + 0.5 && frame.y / EMU >= FRAME_AT.y - 0.5 && (frame.y + frame.cy) / EMU <= FRAME_AT.y + FRAME_AT.h + 0.5, [frame.x / EMU, frame.y / EMU, (frame.x + frame.cx) / EMU, (frame.y + frame.cy) / EMU]);
  check(tag + 'l\'image du texte est sous le titre de sa diapositive (pas par-dessus)', pic[0][0].y / EMU > 40 && pic[2][0].y / EMU > 40, [pic[0][0].y / EMU, pic[2][0].y / EMU]);
  check(tag + 'les images de l\'archive sont les MÊMES octets que celles de la Lecture (PNG)', pic.every((list, i) => list[0].png === payloadOf(reading[i].src) && list[0].png.length > 1000), pic.map((list, i) => list[0].png === payloadOf(reading[i].src)));

  // Une ligne sans vente : plus d'image pour « liées », celle de « toute la table » reste.
  await fire(page, NO_SALE);
  await sleep(600);
  const bare = await exportAs(page, 'pptx');
  await keep(`presentation-sans-vente-${FILE}${lang}-${colorScheme}.pptx`, bare);
  const without = bare ? await page.evaluate(b64 => window.__readPptx(b64), bare.toString('base64')) : null;
  check(tag + 'une ligne sans vente : la diapositive 1 n\'a plus d\'image (le graphique « liées » disparaît, comme une image sans pièce jointe), les deux autres gardent la leur',
    !!without && without.slides.length === 3 && without.slides[0].pictures.length === 0 && without.slides[1].pictures.length === 1 && without.slides[2].pictures.length === 1, without && without.slides.map(s => s.pictures.length));

  // 4) Une grille.
  console.log(`\n${tag}Une grille d'une case-graphique`);
  await fire(page, CLIENT_1);
  await openModel(page, created ? 10 : 8, 0);
  const gridDrawn = await waitFor(page, 'le dessin de la grille', () => { const w = Array.from(document.querySelectorAll('.editor-image-chart-placeholder')).find(x => !x.closest('.pp-slide-list')); return !!w && w.classList.contains('editor-image-chart-drawn'); }, null, 25000);
  const inGrid = await editorCharts(page);
  check(tag + 'l\'éditeur de la grille dessine le graphique dans sa case (une image PNG, à la proportion 140 x 90)', gridDrawn && inGrid.length === 1 && inGrid[0].drawn && PNG.test(inGrid[0].src) && near(inGrid[0].width / inGrid[0].height, 140 / 90, 0.03), inGrid.map(c => [c.drawn, Math.round(c.width), Math.round(c.height)]));
  await snap(page, `grille-${FILE}${lang}-${colorScheme}`);
  const gridReading = await readerImages(page);
  check(tag + 'la Lecture de la grille montre la même image dans la case', gridReading.length === 1 && gridReading[0].src === inGrid[0].src, gridReading.map(r => r.src.slice(0, 22)));
  const pdf = await exportAs(page, 'pdf');
  await keep(`grille-${FILE}${lang}-${colorScheme}.pdf`, pdf);
  const text = pdf ? pdf.toString('latin1') : '';
  const widths = Array.from(text.matchAll(/\/Width (\d+)/g)).map(m => Number(m[1]));
  check(tag + 'le PDF de la grille embarque le graphique : une image de 420 x 270 pixels (le PNG du dessin, trois fois 140 x 90)', !!pdf && /^%PDF/.test(text) && widths.includes(420) && /\/Subtype\s*\/Image/.test(text), { size: pdf && pdf.length, widths });
  const sheet = await exportAs(page, 'xlsx');
  await keep(`grille-${FILE}${lang}-${colorScheme}.xlsx`, sheet);
  const xlsx = sheet ? await page.evaluate(b64 => window.__readXlsx(b64), sheet.toString('base64')) : null;
  check(tag + 'l\'Excel de la grille pose l\'image du graphique sur sa case (colonne B, ligne 1), à 140 x 90 pixels, une seule image de 420 x 270 pixels dans le classeur',
    !!xlsx && xlsx.media === 1 && xlsx.col === 1 && xlsx.row === 0 && near(xlsx.cx / 9525, 140, 1) && near(xlsx.cy / 9525, 90, 1) && xlsx.pictures[0].width === 420 && xlsx.pictures[0].height === 270, xlsx);
  return page;
}

await run('fr', 'light', true, 'page');
await run('fr', 'light', true, 'made');
await run('en', 'dark', false, 'page');
await run('en', 'dark', false, 'made');
await t.finish();
