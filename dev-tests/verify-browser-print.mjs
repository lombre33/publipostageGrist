#!/usr/bin/env node
// Impression par le navigateur (qualité « Impression navigateur » du bouton PDF : js/print-export.js, css/print.css, ReaderMode.renderInto) dans un VRAI Chromium, avec le vrai PDF que
// Chromium tire du document préparé (page.pdf, sans « graphiques d'arrière-plan » : comme une impression dont la case n'est pas cochée) - la demande d'Antoine du 09/10 : « pixel perfect, le même
// rendu que l'éditeur, que la vue lecture et que le pdf classique ». Le faux Grist, le miroir hors ligne des CDN et le chargeur sont ceux de dev-tests/load-lib.mjs.
//   1) le VRAI CLIC à 700x400 : la ligne « Impression navigateur » du menu Qualité (survol, clic), puis le bouton PDF - un cadre caché à bac à sable, la fenêtre du navigateur appelée une fois,
//      aucun téléchargement, aucun moteur PDF chargé, le nom du fichier en titre du cadre, le message « Impression lancée. », le cadre retiré à « afterprint » ; la ligne « Vectoriel » rend le
//      PDF vectoriel (un fichier %PDF-) sans cadre ;
//   2) le PDF d'impression CONTRE LA LECTURE (1300 px de large, feuille à l'échelle 1) : autant de pages que de pages de la Lecture, A4 aux 594,96 x 841,92 pt que Chromium arrondit, les mêmes
//      mots (rien perdu, rien doublé), chaque ligne à la même hauteur (0,6 pt), et les pixels : la page rastérisée par pdf.js contre la capture de la Lecture, floutées (le texte n'est pas
//      rastérisé pareil), sans écart marqué - un fond coloré de case s'imprime avec « printBackground: false » - ; en paysage A5 aussi ;
//   3) une page de la Lecture plus haute qu'une feuille (une liste longue) : le PDF a une page de plus, les soixante éléments y sont une fois chacun ;
//   4) le thème sombre du widget : l'impression reste en clair (fond blanc, texte sombre) ;
//   5) une image d'un autre site : la fenêtre « images d'un autre site » précède l'impression (Annuler n'imprime rien, Continuer imprime), l'image est chargée dans l'impression et le site n'est
//      pas affiché pour la séance ;
//   6) un document de plus de 60 pages : le vrai clic ne prépare rien et le message dit quoi choisir, en français et en anglais ;
//   7) le widget dans un cadre à bac à sable comme celui d'un document Grist : le VRAI print() (aucun remplaçant) est accepté par le navigateur, qui annonce beforeprint puis afterprint
//      au cadre d'impression imbriqué, lequel est retiré.
// Lancé par run-headless.mjs (groupe Node « browserPrintPdf », cf. NODE_SCRIPTS), ou seul : node dev-tests/verify-browser-print.mjs
// BROWSER_PRINT_SHOTS=<dossier> : enregistre aussi le PDF et les captures de la Lecture (à relire à l'œil) ; sans elle, rien n'est écrit.
// BROWSER_PRINT_VERBOSE=1 : écrit aussi les mesures des contrôles réussis ; BROWSER_PRINT_ONLY=2,3 : ne lance que ces scénarios.
import { mkdir, writeFile } from 'node:fs/promises';
import { open, stopServer, sleep, click, clickHoverRow, fire, status } from './load-lib.mjs';

const PORT = Number(process.env.BROWSER_PRINT_PORT || 8993);
const SHOTS = process.env.BROWSER_PRINT_SHOTS || '';
const VERBOSE = !!process.env.BROWSER_PRINT_VERBOSE;
const ONLY = (process.env.BROWSER_PRINT_ONLY || '').split(',').filter(Boolean);
if (SHOTS) await mkdir(SHOTS, { recursive: true });
const SPEC = { tables: [{ id: 'PbClients', rows: 2, columns: [{ id: 'Nom', type: 'Text' }] }] };

let total = 0, failures = 0;
function check(name, pass, notes) {
  total++;
  if (pass) console.log('  ok   - ' + name + (VERBOSE && notes !== undefined ? ' ' + JSON.stringify(notes) : ''));
  else { failures++; console.log('  FAIL - ' + name + (notes !== undefined ? ' (' + JSON.stringify(notes) + ')' : '')); }
}
// Le bruit de Playwright, pas du widget : son script d'initialisation est refusé dans un cadre à bac à sable sans allow-scripts.
const realErrors = w => w.errors.filter(e => !/Blocked script execution|Failed to load resource|ERR_TUNNEL|net::ERR_/.test(e));
async function scenario(title, fn, options = {}) {
  if (ONLY.length && !ONLY.includes(title[0])) return;
  console.log('\n' + title);
  let w = null;
  try {
    w = await open(Object.assign({ spec: SPEC, port: PORT, settleMs: 1200, onPage: installPrintHook }, options));
    await fn(w);
  } catch (e) {
    check(title + ' : le scénario va jusqu\'au bout', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    if (w) await w.close();
  }
}

// Le navigateur sans écran n'ouvre aucune fenêtre d'impression : `print` du cadre est remplacé par un enregistreur qui garde le document PRÊT (ce que le navigateur imprimerait) au moment de l'appel.
async function installPrintHook(page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    window.__prints = [];
    const hook = frame => frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      win.print = () => {
        const doc = win.document;
        window.__prints.push({ title: doc.title, sheets: doc.querySelectorAll('.pp-print-sheet').length, html: '<!DOCTYPE html>' + doc.documentElement.outerHTML, sandbox: frame.getAttribute('sandbox') });
      };
    });
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.id === 'pp-print-frame') hook(node); })))
      .observe(document, { childList: true, subtree: true });
  });
}

const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
const HF = {
  enabled: true, differentFirstPage: false, header: { default: '<p>En-tête du document</p>', first: '' },
  footer: { default: '<p style="text-align:right">Page <span class="page-number-badge" data-format="n-slash-total">1</span></p>', first: '' },
};
const para = i => '<p>Paragraphe ' + i + ' : Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>';
const lines = (n, prefix = 'Ligne') => Array.from({ length: n }, (_, i) => '<p>' + prefix + ' ' + (i + 1) + ' du corps du document.</p>').join('');
const items = n => Array.from({ length: n }, (_, i) => '<li><p>Élément ' + (i + 1) + ' de la liste : un texte assez long pour passer sur deux lignes dans la largeur de la page, avec quelques mots de plus pour en être sûr.</p></li>').join('');
// Un document qui montre de tout, sans texte généré par le style (numéros de titre, pastilles de liste) que le PDF écrit et que le HTML ne contient pas.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const richHtml = image => '<h1>Titre du courrier</h1>' + [1, 2, 3].map(para).join('')
  + '<p style="text-align:center"><strong>Centré en gras</strong>, <em>italique</em>, <u>souligné</u> et <span style="color: rgb(192, 57, 43)">rouge</span>.</p>'
  + '<table><tr><th>Indicateur</th><th>Résultat</th></tr><tr><td style="background-color: #fde9d9">Taux de réalisation</td><td style="text-align:right">78 %</td></tr><tr><td>Satisfaction</td><td style="text-align:right">81 %</td></tr></table>'
  + '<blockquote><p>Une citation qui montre la barre de gauche.</p></blockquote>'
  + (image ? '<p><img class="editor-image" src="' + image + '" alt="" style="width: 200px; height: 80px;"></p>' : '')
  + [4, 5, 6, 7, 8, 9, 10, 11].map(para).join('') + '<div class="page-break-marker">Saut de page</div>' + '<h2>Seconde partie</h2>' + lines(70);
const longListHtml = '<h1>Titre</h1>' + para(1) + para(2) + '<ul>' + items(60) + '</ul>' + para(3) + '<h2>Fin</h2>' + para(4);
const breaks = n => Array.from({ length: n }, (_, i) => '<p>Page ' + (i + 1) + '</p><div class="page-break-marker">Saut de page</div>').join('') + '<p>Fin</p>';

// Pose le document dans l'éditeur du widget et la ligne courante (ce que les exports lisent).
async function setDocument(page, html, hf) {
  await page.evaluate(({ html, hf }) => { Editor.setHTML(html); Editor.setHeaderFooterData(hf); }, { html, hf });
  await fire(page, 'PbClients', 1);
}
const QUALITY_ROW = name => '#v2-quality-flyout .v2-hover-row[data-quality="' + name + '"]';
const printsOf = page => page.evaluate(() => window.__prints.length);
async function waitPrints(page, count, ms = 60000) {
  await page.waitForFunction(n => window.__prints.length >= n, count, { timeout: ms }).catch(() => {});
}
// « Impression prête » : sans geste récent (un rendu long), le widget demande un clic de plus.
async function acceptReadyIfAsked(page) {
  const asked = await page.evaluate(() => { const modal = document.getElementById('pp-dialog-modal'); return !!modal && getComputedStyle(modal).display !== 'none' && /Impression prête|Ready to print/.test(modal.textContent || ''); });
  if (asked) await click(page, '#pp-dialog-modal .var-modal-primary');
  return asked;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await scenario('1) Le vrai clic : menu Qualité, bouton PDF, fenêtre du navigateur', async w => {
  const { page } = w;
  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  await setDocument(page, richHtml(null), HF);
  check('avant tout choix : le moteur PDF n\'est pas chargé et aucun cadre n\'existe', await page.evaluate(() => typeof PdfExport === 'undefined' && !document.getElementById('pp-print-frame')));
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('browser-print'));
  const picked = await page.evaluate(() => ({ value: document.getElementById('v2-pdf-quality').value, active: document.querySelector('#v2-quality-flyout .v2-hover-row.is-active').dataset.quality, text: document.querySelector('#v2-quality-flyout .v2-hover-row[data-quality="browser-print"]').textContent }));
  check('un vrai clic sur « Impression navigateur » la choisit (liste cachée, ligne active), sans grisé', picked.value === 'browser-print' && picked.active === 'browser-print' && picked.text === 'Impression navigateur', picked);
  await click(page, '#btn-export-pdf');
  await waitPrints(page, 1);
  const asked = await acceptReadyIfAsked(page);
  await waitPrints(page, 1, 10000);
  check('le bouton PDF appelle la fenêtre d\'impression du navigateur UNE fois' + (asked ? ' (après « Impression prête »)' : ''), (await printsOf(page)) === 1, await printsOf(page));
  const print = await page.evaluate(() => window.__prints[0]);
  check('le cadre imprimé : feuilles = pages de la Lecture, bac à sable sans script, titre = nom du fichier', !!print && print.sheets >= 3 && print.sandbox === 'allow-same-origin allow-modals' && /^[^<]+$/.test(print.title) && print.title.length > 0, print && { sheets: print.sheets, sandbox: print.sandbox, title: print.title });
  await sleep(300);
  check('le message d\'état : « Impression lancée. »', (await status(page)) === 'Impression lancée.', await status(page));
  check('aucun téléchargement, aucun moteur PDF chargé : l\'impression ne passe pas par pdfmake', downloads.length === 0 && (await page.evaluate(() => typeof PdfExport === 'undefined')), downloads);
  check('le cadre reste jusqu\'à « afterprint », puis il est retiré', (await page.evaluate(() => !!document.getElementById('pp-print-frame'))) && (await page.evaluate(() => { document.getElementById('pp-print-frame').contentWindow.dispatchEvent(new Event('afterprint')); return !document.getElementById('pp-print-frame'); })));
  // La ligne « Vectoriel » rend le PDF vectoriel : un fichier, pas de cadre.
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('native'));
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), click(page, '#btn-export-pdf')]);
  check('avec « Vectoriel », le bouton PDF télécharge un PDF (la voie vectorielle est intacte) et n\'ouvre aucune impression', /\.pdf$/.test(download.suggestedFilename()) && (await printsOf(page)) === 1 && !(await page.evaluate(() => !!document.getElementById('pp-print-frame'))), download.suggestedFilename());
  check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Le PDF d'impression contre la Lecture. Tout se mesure dans la page du widget (pdf.js du miroir hors ligne) : les pages, les mots, les lignes, les pixels.
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Les formats essayés : l'A4 du modèle, l'A5 en paysage, l'A6 et un format libre de 100 x 70 mm (le petit format d'Antoine : marges de 3 mm). Posés dans la page du widget, une fois.
const installLayouts = page => page.evaluate(() => {
  window.__setLayout = layout => {
    PageLayout.setMarginsMm(null);
    if (layout === 'a5-landscape') { PageLayout.setFormat('A5'); PageLayout.setOrientation('landscape'); }
    else if (layout === 'a6') PageLayout.setFormat('A6');
    else if (layout === 'libre') PageLayout.setPageSize(100, 70);
  };
});

// La Lecture à l'échelle 1 : la géométrie de chaque page, ses lignes (hauteur de la ligne de base) et ses mots.
async function readLecture(page, html, hf, layout) {
  await installLayouts(page);
  return page.evaluate(async ({ html, hf, layout }) => {
    window.__setLayout(layout);
    const rc = document.getElementById('reader-container'); const ec = document.getElementById('editor-container');
    rc.style.display = 'block'; ec.style.display = 'none'; rc.classList.add('a4-preview'); rc.style.removeProperty('--pp-fit-zoom');
    rc.style.height = 'auto'; rc.style.overflow = 'visible'; rc.style.flex = 'none';
    await ReaderMode.render(html, null, { id: 1 }, hf);
    await new Promise(r => setTimeout(r, 800));
    const paper = rc.querySelector('.v2-reader-paper').getBoundingClientRect();
    const sy = window.scrollY; const sx = window.scrollX;
    const tops = [paper.top + sy];
    rc.querySelectorAll('.v2-page-seam-divider').forEach(divider => tops.push(divider.getBoundingClientRect().bottom + sy));
    const size = PageLayout.getPageSizePx();
    // Les lignes : chaque rectangle d'une ligne de texte visible, sa ligne de base (haut du rectangle + ascendante arrondie de la police, Roboto 0,9277 em) en points depuis le haut de sa page.
    const skip = el => el.matches('.v2-reader-backdrop, .v2-page-seam-divider, style, script');
    const shown = el => { const s = getComputedStyle(el); return !(s.visibility === 'hidden' || s.opacity === '0' || /^transparent$|^rgba\(.*,\s*0\)$/.test(s.color)); };
    const range = document.createRange();
    const walker = document.createTreeWalker(rc, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, node => (node.nodeType === 1 && skip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT));
    const perPage = tops.map(() => new Set());
    let text = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType !== 3 || !/\S/.test(node.nodeValue) || !shown(node.parentElement)) continue;
      text += ' ' + node.nodeValue;
      const fontPx = parseFloat(getComputedStyle(node.parentElement).fontSize);
      range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(rect => {
        if (rect.width <= 0 || rect.height <= 0) return;
        const top = rect.top + sy;
        let index = -1;
        tops.forEach((pageTop, i) => { if (top >= pageTop - 0.5) index = i; });
        if (index < 0) return;
        const baselinePt = (top - tops[index] + Math.round(0.927734375 * fontPx)) * 0.75;
        perPage[index].add(Math.round(baselinePt * 4) / 4);
      });
    }
    return { paperLeft: paper.left + sx, tops, pageW: size.width, pageH: size.height, baselines: perPage.map(set => Array.from(set).sort((a, b) => a - b)), text };
  }, { html, hf, layout });
}

async function printedPdf(w, html, hf, layout, scheme) {
  const { page, context } = w;
  await installLayouts(page);
  const prepared = await page.evaluate(async ({ html, hf, layout }) => {
    window.__setLayout(layout);
    const job = await PrintExport.prepare(html, null, { id: 1 }, hf, 'impression');
    const doc = job.frame.contentDocument;
    const out = { html: '<!DOCTYPE html>' + doc.documentElement.outerHTML, pageCount: job.pageCount, windows: job.windows.map(win => [win.from, win.to, win.at]) };
    job.dispose();
    return out;
  }, { html, hf, layout });
  const second = await context.newPage();
  if (scheme) await second.emulateMedia({ colorScheme: scheme });
  await second.setContent(prepared.html, { waitUntil: 'load' });
  await sleep(600);
  const pdf = await second.pdf({ preferCSSPageSize: true, printBackground: false });
  await second.close();
  return { pdf, sheets: prepared.pageCount, windows: prepared.windows };
}

// pdf.js dans la page du widget : pour chaque page, sa taille, ses lignes de base, ses mots et son image rastérisée à 96 dpi ; comparée à la capture de la Lecture, floutées toutes deux.
async function analysePdf(page, pdf, shots) {
  return page.evaluate(async ({ pdf64, shots, urls }) => {
    await new Promise((resolve, reject) => {
      if (window.pdfjsLib) { resolve(); return; }
      const script = document.createElement('script');
      script.src = urls.lib;
      script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = urls.worker; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const bin = atob(pdf64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const out = { pages: [], text: '' };
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const baselines = new Set();
      content.items.filter(item => item.str && item.str.trim()).forEach(item => {
        baselines.add(Math.round((viewport.height - item.transform[5]) * 4) / 4);
        out.text += ' ' + item.str;
      });
      const raster = page.getViewport({ scale: 96 / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(raster.width); canvas.height = Math.round(raster.height);
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: g, viewport: raster }).promise;
      const entry = { width: viewport.width, height: viewport.height, baselines: Array.from(baselines).sort((a, b) => a - b) };
      // Fond de la page et pixel le plus sombre : l'impression est en clair, quel que soit le thème du widget.
      const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkest = 255;
      for (let k = 0; k < px.length; k += 4) darkest = Math.min(darkest, px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114);
      entry.corner = [px[0], px[1], px[2]];
      entry.darkest = Math.round(darkest);
      let hash = 2166136261;
      for (let k = 0; k < px.length; k++) hash = Math.imul(hash ^ px[k], 16777619) >>> 0;
      entry.hash = hash;
      // Le bleu d'accent du thème clair (#2f6fed) : la case cochée de la liste de tâches le porte, celui du thème sombre (#5b91f5) est autre.
      let accent = 0;
      for (let k = 0; k < px.length; k += 4) if (Math.abs(px[k] - 47) <= 14 && Math.abs(px[k + 1] - 111) <= 14 && Math.abs(px[k + 2] - 237) <= 14) accent++;
      entry.accent = accent;
      if (shots && shots[n - 1]) {
        const blob = await (await fetch('data:image/png;base64,' + shots[n - 1])).blob();
        const bitmap = await createImageBitmap(blob);
        const w = Math.min(canvas.width, bitmap.width); const h = Math.min(canvas.height, bitmap.height);
        const blurred = draw => { const c = document.createElement('canvas'); c.width = w; c.height = h; const cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, w, h); cg.filter = 'blur(2px)'; draw(cg); return cg.getImageData(0, 0, w, h).data; };
        const a = blurred(cg => cg.drawImage(bitmap, 0, 0)); const b = blurred(cg => cg.drawImage(canvas, 0, 0));
        let sum = 0; let big = 0;
        for (let k = 0; k < a.length; k += 4) {
          const d = Math.abs((a[k] * 0.299 + a[k + 1] * 0.587 + a[k + 2] * 0.114) - (b[k] * 0.299 + b[k + 1] * 0.587 + b[k + 2] * 0.114));
          sum += d; if (d > 90) big++;
        }
        entry.diffMean = Math.round(sum / (w * h) * 100) / 100;
        entry.diffBig = big;
        entry.size = [w, h, bitmap.width, bitmap.height];
        // Un fond coloré (case de tableau) : le même pixel, en clair, des deux côtés.
        entry.tintedPixels = (() => { let count = 0; for (let k = 0; k < px.length; k += 4) if (px[k] > 240 && px[k + 1] > 215 && px[k + 1] < 240 && px[k + 2] > 195 && px[k + 2] < 225) count++; return count; })();
      }
      out.pages.push(entry);
    }
    return out;
  }, { pdf64: pdf.toString('base64'), shots, urls: { lib: PDFJS_URL, worker: PDFJS_WORKER } });
}

const words = text => (String(text).match(/[\p{L}\p{N}]+/gu) || []).sort();
function diffWords(a, b) {
  const count = list => list.reduce((m, word) => m.set(word, (m.get(word) || 0) + 1), new Map());
  const ca = count(a); const cb = count(b);
  const missing = []; const extra = [];
  ca.forEach((n, word) => { if ((cb.get(word) || 0) < n) missing.push(word); });
  cb.forEach((n, word) => { if ((ca.get(word) || 0) < n) extra.push(word); });
  return { missing: missing.slice(0, 8), extra: extra.slice(0, 8) };
}

async function compareWithLecture(w, label, html, hf, layout, { raster = true } = {}) {
  const { page } = w;
  await page.setViewportSize({ width: 1300, height: 1400 });
  const geo = await readLecture(page, html, hf, layout);
  const shots = [];
  for (let i = 0; i < geo.tops.length; i++) {
    const png = await page.screenshot({ clip: { x: geo.paperLeft, y: geo.tops[i], width: Math.round(geo.pageW), height: Math.round(geo.pageH) }, fullPage: true });
    shots.push(png.toString('base64'));
    if (SHOTS) await writeFile(`${SHOTS}/${label}-lecture-${i + 1}.png`, png);
  }
  const printed = await printedPdf(w, html, hf, layout);
  if (SHOTS) await writeFile(`${SHOTS}/${label}-impression.pdf`, printed.pdf);
  const result = await analysePdf(page, printed.pdf, raster ? shots : null);
  check(`${label} : autant de pages dans le PDF d'impression (${result.pages.length}) que dans la Lecture (${geo.tops.length}), chaque feuille une page`, result.pages.length === geo.tops.length && printed.sheets === geo.tops.length, { pdf: result.pages.length, lecture: geo.tops.length, sheets: printed.sheets });
  const ratio = geo.pageW / geo.pageH;
  check(`${label} : chaque page du PDF a la forme de la page du modèle (à 0,2 % près : Chromium arrondit le format)`, result.pages.every(p => Math.abs(p.width / p.height - ratio) / ratio < 0.002), result.pages.map(p => [p.width, p.height]));
  const gap = diffWords(words(geo.text), words(result.text));
  check(`${label} : les mêmes mots dans le PDF et dans la Lecture (rien de perdu, rien de doublé)`, gap.missing.length === 0 && gap.extra.length === 0, gap);
  const worst = result.pages.map((p, i) => {
    const mine = geo.baselines[i] || [];
    if (mine.length !== p.baselines.length) return { page: i + 1, lines: [mine.length, p.baselines.length] };
    return { page: i + 1, max: mine.reduce((m, y, k) => Math.max(m, Math.abs(y - p.baselines[k])), 0) };
  });
  check(`${label} : chaque ligne du PDF est à la hauteur de celle de la Lecture (0,6 pt), mêmes lignes page par page`, worst.every(r => r.max !== undefined && r.max <= 0.6), worst);
  if (raster) {
    const sizes = result.pages.every(p => p.size && Math.abs(p.size[0] - p.size[2]) <= 2 && Math.abs(p.size[1] - p.size[3]) <= 2);
    check(`${label} : les pixels : chaque page rastérisée contre la capture de la Lecture, floutées - écart moyen < 3 et moins de 40 pixels très éloignés`, sizes && result.pages.every(p => p.diffMean < 3 && p.diffBig < 40), result.pages.map(p => [p.diffMean, p.diffBig, p.size]));
  }
  return { geo, result, printed };
}

await scenario('2) Le PDF d\'impression contre la Lecture : pages, mots, lignes, pixels', async w => {
  const png = await w.page.evaluate(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#2f6fed'; g.fillRect(0, 0, 240, 96); g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText('IMAGE', 70, 58); return c.toDataURL('image/png'); });
  const run = await compareWithLecture(w, 'a4', richHtml(png), HF, 'a4');
  check('A4 : le fond coloré d\'une case de tableau est imprimé sans « graphiques d\'arrière-plan » (printBackground: false)', run.result.pages[0].tintedPixels > 300, run.result.pages.map(p => p.tintedPixels));
  check('A4 : pas de page blanche de trop à la fin : la dernière page porte du texte', run.result.pages[run.result.pages.length - 1].baselines.length > 5, run.result.pages.map(p => p.baselines.length));
  await compareWithLecture(w, 'a4-sans-entete', richHtml(png), NO_HF, 'a4');
  const a5 = await compareWithLecture(w, 'a5-paysage', richHtml(null), HF, 'a5-landscape');
  check('A5 en paysage : les pages du PDF sont plus larges que hautes (210 x 148 mm)', a5.result.pages.every(p => p.width > p.height && Math.abs(p.width / p.height - 210 / 148) < 0.01), a5.result.pages.map(p => [p.width, p.height]));
  const a6 = await compareWithLecture(w, 'a6', richHtml(null), HF, 'a6');
  check('A6 : les pages du PDF sont celles de 105 x 148 mm', a6.result.pages.every(p => Math.abs(p.width / p.height - 105 / 148) < 0.005), a6.result.pages.map(p => [p.width, p.height]));
  const small = await compareWithLecture(w, 'libre-100x70', richHtml(null), NO_HF, 'libre');
  check('format libre de 100 x 70 mm : les pages du PDF sont celles de 100 x 70 mm', small.result.pages.every(p => Math.abs(p.width / p.height - 100 / 70) < 0.01), small.result.pages.map(p => [p.width, p.height]));
  // Un petit format et beaucoup de feuilles : les copies du document que chaque feuille rogne, bien plus hautes qu'elle, ne doivent pas ajouter de pages blanches à la fin (css/print.css, `contain: size`).
  const longSmall = '<h1>Titre</h1>' + Array.from({ length: 40 }, (_, i) => para(i + 1)).join('');
  const many = await printedPdf(w, longSmall, NO_HF, 'libre');
  const manyResult = await analysePdf(w.page, many.pdf, null);
  const lastPage = manyResult.pages[manyResult.pages.length - 1];
  check(`format libre de 100 x 70 mm, ${many.sheets} feuilles : le PDF a autant de pages que de feuilles, la dernière porte du texte (aucune page blanche à la fin)`, many.sheets > 25 && manyResult.pages.length === many.sheets && lastPage.baselines.length > 0, { feuilles: many.sheets, pages: manyResult.pages.length, derniere: lastPage.baselines.length });
  check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
});

await scenario('3) Une page plus haute qu\'une feuille : une page de plus, les 60 éléments une fois chacun', async w => {
  const { page } = w;
  await page.setViewportSize({ width: 1300, height: 1400 });
  for (const [label, hf] of [['sans en-tête ni pied', NO_HF], ['avec en-tête et pied', HF]]) {
    const geo = await readLecture(page, longListHtml, hf, 'a4');
    const printed = await printedPdf(w, longListHtml, hf, 'a4');
    const result = await analysePdf(page, printed.pdf, null);
    const found = new Map();
    for (const match of result.text.matchAll(/Élément (\d+) de la liste/g)) found.set(Number(match[1]), (found.get(Number(match[1])) || 0) + 1);
    const lost = []; const doubled = [];
    for (let i = 1; i <= 60; i++) { const n = found.get(i) || 0; if (n === 0) lost.push(i); if (n > 1) doubled.push(i); }
    check(`${label} : la Lecture a ${geo.tops.length} pages, le PDF ${result.pages.length} (feuilles de suite pour la liste)`, geo.tops.length === 3 && result.pages.length > geo.tops.length && result.pages.length === printed.sheets, { lecture: geo.tops.length, pdf: result.pages.length, sheets: printed.sheets });
    check(`${label} : les 60 éléments sont dans le PDF, une fois chacun, et le texte qui suit aussi`, lost.length === 0 && doubled.length === 0 && /Fin/.test(result.text) && /Paragraphe 4/.test(result.text), { lost, doubled });
    // Aucune ligne coupée en deux : chaque ligne de base du PDF est au moins à la marge du bas de la page (ni collée au bord, ni hors page).
    const margin = (await page.evaluate(() => PageLayout.getMarginsPt())).bottom;
    check(`${label} : toutes les lignes sont dans leur page, au-dessus de la marge du bas (rien n'est coupé par le bord)`, result.pages.every(p => p.baselines.every(y => y < p.height - margin + 0.01)), result.pages.map(p => Math.max(...p.baselines)));
  }
  check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
});

await scenario('4) Thème du widget : l\'impression est la même en thème clair, sombre ou « système » sombre', async w => {
  const { page } = w;
  await page.setViewportSize({ width: 1300, height: 1400 });
  // Le papier ne suit pas le thème (css/style.css) : seule la couleur d'accent des cases à cocher, lue dans les jetons du thème, le trahirait.
  const task = (done, label) => '<li data-type="taskItem" data-checked="' + done + '"><label><input type="checkbox"' + (done ? ' checked="checked"' : '') + '><span></span></label><div><p>' + label + '</p></div></li>';
  const html = richHtml(null) + '<ul data-type="taskList">' + task(true, 'Tâche faite') + task(false, 'Tâche à faire') + '</ul>';
  const runs = {};
  for (const [label, theme, scheme] of [['sombre', 'dark', 'dark'], ['système sombre', 'system', 'dark'], ['clair', 'light', 'light']]) {
    await page.evaluate(name => Settings.setTheme(name), theme);
    await page.emulateMedia({ colorScheme: scheme });
    const chrome = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    const printed = await printedPdf(w, html, HF, 'a4', scheme);
    runs[label] = Object.assign(await analysePdf(page, printed.pdf, null), { chrome, sheets: printed.sheets });
  }
  check('le widget a bien changé de thème : le fond de la barre est sombre en « sombre » et en « système sombre », clair en « clair »', runs['sombre'].chrome === '#171b23' && runs['système sombre'].chrome === '#171b23' && runs['clair'].chrome !== '#171b23', Object.keys(runs).map(label => [label, runs[label].chrome]));
  const light = runs['clair'];
  check('page 1 du PDF en thème sombre : fond blanc (coin 255, 255, 255), texte sombre (pixel le plus sombre < 90)', runs['sombre'].pages[0].corner.every(v => v === 255) && runs['sombre'].pages[0].darkest < 90, { corner: runs['sombre'].pages[0].corner, darkest: runs['sombre'].pages[0].darkest });
  Object.keys(runs).forEach(label => {
    const total = runs[label].pages.reduce((n, p) => n + p.accent, 0);
    check(`thème ${label} : la case cochée est au bleu d'accent du thème clair (l'impression est toujours en clair)`, total > 50, runs[label].pages.map(p => p.accent));
  });
  ['sombre', 'système sombre'].forEach(label => {
    const run = runs[label];
    const same = run.pages.length === light.pages.length && run.pages.every((p, i) => p.hash === light.pages[i].hash);
    check(`thème ${label} : le PDF d'impression est identique, pixel pour pixel, à celui du thème clair (${light.pages.length} pages)`, same, { pages: run.pages.map(p => p.hash), clair: light.pages.map(p => p.hash) });
  });
}, { theme: 'dark' });

await scenario('5) Une image d\'un autre site : la fenêtre d\'abord, puis l\'image dans l\'impression', async w => {
  const { page } = w;
  await w.context.route('**://pp-print.test/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG, 'base64') }));
  await setDocument(page, '<p>Avant</p><p><img class="editor-image" src="https://pp-print.test/a.png" alt="" style="width: 120px;"></p><p>Après</p>', NO_HF);
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('browser-print'));
  const windowOpen = () => page.evaluate(() => { const modal = document.getElementById('pp-dialog-modal'); return !!modal && getComputedStyle(modal).display !== 'none' ? (modal.textContent || '') : ''; });
  await click(page, '#btn-export-pdf');
  await sleep(900);
  const listed = await windowOpen();
  check('la fenêtre « images d\'un autre site » précède l\'impression et nomme le site', /pp-print\.test/.test(listed), listed.slice(0, 160));
  await page.keyboard.press('Escape');
  await sleep(500);
  check('Annuler : rien n\'est imprimé, aucun cadre, « Export annulé. »', (await printsOf(page)) === 0 && !(await page.evaluate(() => !!document.getElementById('pp-print-frame'))) && /annulé|cancel/i.test(await status(page)), await status(page));
  await click(page, '#btn-export-pdf');
  await sleep(900);
  await click(page, '#pp-dialog-modal .var-modal-primary');
  await waitPrints(page, 1);
  await acceptReadyIfAsked(page);
  await waitPrints(page, 1, 15000);
  const print = await page.evaluate(() => {
    const shot = window.__prints[0];
    if (!shot) return null;
    const doc = new DOMParser().parseFromString(shot.html, 'text/html');
    const img = doc.querySelector('.reader-content img');
    return { src: img && img.getAttribute('src'), blocked: doc.querySelectorAll('[data-blocked-src]').length, allowed: ExternalImages.isAllowed('pp-print.test') };
  });
  check('Continuer : l\'impression part, l\'image est à son adresse dans les feuilles, sans cadre « Afficher »', !!print && print.src === 'https://pp-print.test/a.png' && print.blocked === 0, print);
  check('et le site n\'est pas affiché pour la séance (la Lecture et l\'éditeur gardent leur cadre)', !!print && print.allowed === false, print);
});

await scenario('6) Plus de 60 pages : le message dit quoi choisir (français, puis anglais)', async w => {
  const { page } = w;
  await setDocument(page, breaks(60), NO_HF);
  await clickHoverRow(page, '#v2-btn-quality', QUALITY_ROW('browser-print'));
  await click(page, '#btn-export-pdf');
  await sleep(4000);
  const fr = await status(page);
  check('français : « Ce document compte 61 pages : l\'impression navigateur est limitée à 60 pages. Choisissez le PDF vectoriel. »', /61 pages/.test(fr) && /limitée à 60 pages/.test(fr) && /PDF vectoriel/.test(fr), fr);
  check('rien n\'est imprimé et aucun cadre ne reste', (await printsOf(page)) === 0 && !(await page.evaluate(() => !!document.getElementById('pp-print-frame'))));
  await page.evaluate(() => I18n.setLang('en'));
  await click(page, '#btn-export-pdf');
  await sleep(4000);
  const en = await status(page);
  check('anglais : « This document has 61 pages: browser print is limited to 60 pages. Choose the vector PDF. »', /61 pages/.test(en) && /limited to 60 pages/.test(en) && /vector PDF/.test(en), en);
  check('aucune erreur de page', realErrors(w).length === 0, realErrors(w));
});

// Le widget d'un document Grist tourne dans un cadre à bac à sable, et le cadre d'impression y est imbriqué : l'appel à print() n'est accepté que si le cadre du widget a le droit d'ouvrir des
// fenêtres du navigateur (allow-modals ; le même bac à sable que verify-csp.mjs donne à un cadre « comme celui d'un document Grist »). Navigateur sans écran : print() rend la main tout de
// suite, mais le navigateur annonce beforeprint puis afterprint à la fenêtre du cadre quand il accepte l'appel - et le refuse en silence (« Ignored call to 'print()' ») sinon.
const GRIST_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads';
await scenario('7) Le widget dans un cadre à bac à sable comme celui d\'un document Grist : le vrai print() est accepté', async w => {
  const { page } = w;
  const origin = new URL(page.url()).origin;
  await page.route(`${origin}/__cadre.html`, route => route.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><body style="margin:0"><iframe name="w" sandbox="${GRIST_SANDBOX}" src="${origin}/_load.html" style="width:700px;height:400px;border:0"></iframe>`,
  }));
  await page.goto(`${origin}/__cadre.html`, { waitUntil: 'load' });
  const frame = page.frame({ name: 'w' });
  await frame.waitForFunction(() => typeof EditorCore !== 'undefined' && EditorCore.getEditor && EditorCore.getEditor(), null, { timeout: 120000 });
  await frame.waitForFunction(() => { const el = document.getElementById('status-msg'); return !!el && /prêt|ready/i.test(el.textContent || ''); }, null, { timeout: 180000 });
  await sleep(1200);
  await frame.evaluate(() => {
    window.__real = [];
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.id !== 'pp-print-frame') return;
      node.addEventListener('load', () => ['beforeprint', 'afterprint'].forEach(name => node.contentWindow.addEventListener(name, () => window.__real.push(name))));
    }))).observe(document.body, { childList: true });
  });
  await frame.evaluate(({ html, hf }) => { Editor.setHTML(html); Editor.setHeaderFooterData(hf); document.getElementById('v2-pdf-quality').value = 'browser-print'; }, { html: richHtml(null), hf: HF });
  await fire(frame, 'PbClients', 1);
  // Le vrai clic, dans les coordonnées de la page qui porte le cadre (il est à son coin, sans bordure).
  const at = await frame.evaluate(() => { const r = document.getElementById('btn-export-pdf').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(at.x - 20, at.y); await page.mouse.move(at.x, at.y, { steps: 3 }); await sleep(50);
  await page.mouse.click(at.x, at.y);
  await frame.waitForFunction(() => window.__real.length >= 2, null, { timeout: 60000 }).catch(() => {});
  await sleep(300);
  const seen = await frame.evaluate(() => ({ events: window.__real.slice(), frame: !!document.getElementById('pp-print-frame'), status: (document.getElementById('status-msg') || {}).textContent }));
  check('le navigateur accepte l\'appel : il annonce beforeprint puis afterprint à la fenêtre du cadre d\'impression, imbriqué sous le bac à sable de Grist', seen.events.join(',') === 'beforeprint,afterprint', seen);
  check('afterprint retire le cadre d\'impression, et le message d\'état dit « Impression lancée. »', !seen.frame && seen.status === 'Impression lancée.', seen);
  check('aucun appel ignoré ni erreur de page (« Ignored call to \'print()\' » serait ici)', realErrors(w).length === 0, realErrors(w));
});

await stopServer();
console.log(`\n${total - failures}/${total} passés`);
process.exit(failures ? 1 : 0);
