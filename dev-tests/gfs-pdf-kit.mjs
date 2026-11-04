// Ce que les essais de la lecture d'un PDF commenté ont en commun (verify-gfs-comment.mjs : les marques ; verify-gfs-comment-threads.mjs : les fils) : fabriquer des PDF dont on connaît chaque ligne de texte, ouvrir
// l'app avec le GFS simulé (dev-tests/gfs-stub.js) qui en ouvre un, et la main de la personne - la vraie souris et le vrai clavier de Playwright, jamais un appel de l'app - sur le texte du PDF à l'écran (700x400).
//   const kit = pdfKit(t, PDFS)   `t` : ce que rend gfs-page.mjs:start ; `PDFS` : { clé: { name, bytes } } (linesPdf les fabrique)
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { seedModels, pdfjsLibrary, ROOT } from './gfs-page.mjs';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
export const A4 = [595.28, 841.89];

// Des lignes de texte (une ligne = un morceau de texte pour pdf.js), des pages sans texte (un scan), de petites pages pour qu'on en voie plusieurs à la fois.
const req = createRequire(join(ROOT, 'dev-tests', '.offline-cache', 'x.js'));
export async function linesPdf(pages, { size = A4, fontSize = 14, gap = 26, top = 50 } = {}) {
  const { PDFDocument, StandardFonts, rgb } = req('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((lines) => {
    const page = doc.addPage(size);
    if (!lines.length) page.drawRectangle({ x: 40, y: 40, width: 200, height: 80, color: rgb(0.8, 0.85, 0.9) });
    lines.forEach((line, i) => page.drawText(line, { x: 40, y: page.getHeight() - top - i * gap, size: fontSize, font }));
  });
  return Buffer.from(await doc.save());
}

export function pdfKit(t, PDFS) {
  const LIB = pdfjsLibrary();
  const src = key => ({ name: PDFS[key].name, mime: 'application/pdf', base64: PDFS[key].bytes.toString('base64') });

  const BASE = `window.__makeFile = (src) => new File([Uint8Array.from(atob(src.base64), c => c.charCodeAt(0))], src.name, { type: src.mime });`;
  const POLYFILL = `
  for (const C of [Map, WeakMap]) {
    if (!C.prototype.getOrInsert) C.prototype.getOrInsert = function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); };
    if (!C.prototype.getOrInsertComputed) C.prototype.getOrInsertComputed = function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
  }`;
  const INIT = BASE + POLYFILL;
  const GFS = (extra = {}) => Object.assign({ extensions: ['lecture-pdf'], pdfjs: LIB, ouverture: null }, extra);
  const startReading = (key, id = 'pdf-7') => `window.__gfsStub.ouverture = { fichier: null, type: 'pdf', dossier: '', raison: 'lire', lecture: { id: ${JSON.stringify(id)}, fichier: window.__makeFile(${JSON.stringify(src(key))}) } };`;
  const settled = (page, n = 1) => page.waitForFunction(n => { try { return PdfReading.isActive() && PdfView.isMounted() && PdfView.pagesShown().includes(n); } catch (e) { return false; } }, n, { timeout: 40000 });
  // Ouvre l'app sur le PDF `key` (sa clé chez GFS : `id`). `seed` : ce que le faux Grist reçoit de plus que les modèles de départ ; `init` : un script de plus avant ceux de la page ; `extra` : le reste d'openPage (langue, thème...).
  const open = async (key, { id = 'pdf-7', seed = '', init = '', ...extra } = {}) => {
    const o = await t.openPage(Object.assign({ seed: seedModels() + seed, stub: GFS(), init: INIT + startReading(key, id) + init, ready: false }, extra));
    await settled(o.page);
    return o;
  };

  // Des morceaux de texte (des lignes du PDF) : `wanted` = [[page, début du texte], ...]. Le premier est amené au milieu du panneau, puis TOUS sont mesurés sans plus de défilement (mesurer une ligne en défilant déplacerait les autres) ;
  // la page est d'abord amenée à l'écran, ce qui la fait dessiner, et on attend sa couche de texte. Chaque ligne doit se voir dans le panneau : la souris ne va que là où une personne peut aller.
  const SPAN = 'Array.from(frame.querySelectorAll(".pp-pdf-text > span")).find(s => s.textContent.startsWith(starts))';
  const linesOf = async (page, wanted) => {
    const [n0, starts0] = wanted[0];
    await page.evaluate((n) => { document.querySelector('#reader-container .pp-pdf-page[data-page="' + n + '"]').scrollIntoView({ block: 'center' }); }, n0);
    await page.waitForFunction(new Function('arg', 'const { n, starts } = arg; const frame = document.querySelector(\'#reader-container .pp-pdf-page[data-page="\' + n + \'"]\'); return !!frame && !!' + SPAN + ';'), { n: n0, starts: starts0 }, { timeout: 25000 })
      .catch(() => { throw new Error('ligne introuvable : page ' + n0 + ', « ' + starts0 + ' »'); });
    await page.evaluate(new Function('arg', 'const { n, starts } = arg; const frame = document.querySelector(\'#reader-container .pp-pdf-page[data-page="\' + n + \'"]\'); ' + SPAN + '.scrollIntoView({ block: "center" });'), { n: n0, starts: starts0 });
    await sleep(200);
    const lines = await page.evaluate(new Function('wanted', `
    const shown = document.getElementById('reader-container').getBoundingClientRect();
    return wanted.map(([n, starts]) => {
      const frame = document.querySelector('#reader-container .pp-pdf-page[data-page="' + n + '"]');
      const span = frame && ${SPAN};
      if (!span) return null;
      const r = span.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, y: (r.top + r.bottom) / 2, text: span.textContent, seen: r.top >= shown.top && r.bottom <= shown.bottom };
    });`), wanted);
    lines.forEach((line, i) => {
      if (!line) throw new Error('ligne introuvable : page ' + wanted[i][0] + ', « ' + wanted[i][1] + ' »');
      if (!line.seen) throw new Error('ligne hors du panneau : page ' + wanted[i][0] + ', « ' + wanted[i][1] + ' » (y ' + Math.round(line.y) + ')');
    });
    return lines;
  };
  const lineOf = async (page, n, starts) => (await linesOf(page, [[n, starts]]))[0];
  const drag = async (page, from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await sleep(120);
  };
  // Sélectionne à la souris, sur la ligne qui commence par `starts`, de la fraction `a` à la fraction `b` de sa largeur.
  const selectOnLine = async (page, n, starts, a, b) => {
    const line = await lineOf(page, n, starts);
    await drag(page, { x: line.left + line.width * a + 0.5, y: line.y }, { x: line.left + line.width * b, y: line.y });
    return line;
  };
  const anchorNow = page => page.evaluate(() => {
    const a = PdfView.selection();
    return a && { page: a.page, debut: a.debut, fin: a.fin, citation: a.citation, avant: a.avant, apres: a.apres, clipped: a.clipped, rect: { w: a.rect.width, h: a.rect.height } };
  });
  const nativeSelection = page => page.evaluate(() => window.getSelection().toString());
  const textOf = (page, n) => page.evaluate(n => PdfView.pageText(n).then(s => s && s.text), n);
  const marksOf = (page, id) => page.evaluate((id) => Array.from(document.querySelectorAll('.pp-pdf-mark' + (id ? '[data-comment-id="' + id + '"]' : ''))).map((m) => {
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    return { id: m.getAttribute('data-comment-id'), text: m.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, bg: cs.backgroundColor, border: cs.borderBottomColor, borderWidth: cs.borderBottomWidth, position: cs.position, cursor: cs.cursor,
      resolved: m.getAttribute('data-resolved'), cls: m.className, page: Number(m.closest('.pp-pdf-page').dataset.page), zoom: parseFloat(getComputedStyle(m.closest('.pp-pdf-page')).zoom) };
  }), id);
  const frameRect = (page, n) => page.evaluate((n) => { const r = document.querySelector('#reader-container .pp-pdf-page[data-page="' + n + '"]').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, n);
  const setMarks = (page, marks) => page.evaluate(marks => PdfView.setMarks(marks), marks);
  // Fait défiler le panneau pour que le haut de la page `n` soit à `offset` px du haut du panneau (la mesure se fait aux rectangles à l'écran : elle vaut quel que soit le zoom).
  const scrollToPage = (page, n, offset = 10) => page.evaluate(({ n, offset }) => {
    const box = document.getElementById('reader-container');
    const frame = box.querySelector('.pp-pdf-page[data-page="' + n + '"]');
    box.scrollTop += frame.getBoundingClientRect().top - box.getBoundingClientRect().top - offset;
  }, { n, offset });

  return { LIB, src, INIT, GFS, startReading, settled, open, linesOf, lineOf, drag, selectOnLine, anchorNow, nativeSelection, textOf, marksOf, frameRect, setMarks, scrollToPage };
}
